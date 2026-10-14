"""Refine lyric word times against the isolated vocal.

  python align_vocals.py <audio.ogg> <analysis.json> <vocals16k.wav> [<clicks.wav>]

1. Demucs (htdemucs) separates the vocal stem, cached as 16 kHz mono.
2. Lines are grouped into chunks at pauses; each chunk's known words are
   force-aligned to the vocal with torchaudio's MMS_FA CTC aligner.
3. Word starts snap to the nearest vocal onset within a short window.
4. Words whose refined start strays far from the ASR-based estimate, or whose
   alignment score is poor, keep the estimate.
5. Runs of words the ASR packed into a few milliseconds (it lost the vocal) are
   aligned on their own between the neighbouring good words (or until the
   singing stops), and may move anywhere inside that gap.

The analysis cues are updated in place; an optional click track (vocal plus a
tick at every word start) is written for listening checks.
"""

import json
import re
import sys
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf
import torch
import torchaudio

SR = 16000
MAX_SHIFT = 0.8
MIN_SCORE = 0.25
SNAP_BEFORE = 0.10
SNAP_AFTER = 0.06


def device():
    return "mps" if torch.backends.mps.is_available() else "cpu"


def separate(audio: Path, out: Path):
    if out.exists():
        return
    from demucs.apply import apply_model
    from demucs.pretrained import get_model

    model = get_model("htdemucs")
    model.eval()
    wav, sr = sf.read(str(audio), always_2d=True, dtype="float32")
    wav = torch.from_numpy(wav.T)
    if sr != model.samplerate:
        wav = torchaudio.functional.resample(wav, sr, model.samplerate)
    if wav.shape[0] == 1:
        wav = wav.repeat(2, 1)
    ref = wav.mean(0)
    mix = (wav - ref.mean()) / (ref.std() + 1e-8)
    try:
        sources = apply_model(model, mix[None], device=device(), split=True, overlap=0.25, progress=False)[0]
    except RuntimeError:
        sources = apply_model(model, mix[None], device="cpu", split=True, overlap=0.25, progress=False)[0]
    vocals = sources[model.sources.index("vocals")] * ref.std() + ref.mean()
    mono = torchaudio.functional.resample(vocals.mean(0, keepdim=True), model.samplerate, SR)
    sf.write(str(out), mono[0].numpy(), SR, subtype="FLOAT")


def norm_word(text):
    return re.sub(r"[^a-z']", "", text.lower().replace("’", "'")).strip("'")


def chunks(parts):
    out = [[parts[0]]]
    for a, b in zip(parts, parts[1:]):
        if b["start"] - a["end"] >= 1.2 or b["start"] - out[-1][0]["start"] > 25:
            out.append([b])
        else:
            out[-1].append(b)
    return out


def collapsed_runs(parts, gap=0.06, min_len=6):
    """Index ranges [i, j) where consecutive word starts sit closer than `gap`."""
    runs, i = [], 0
    while i < len(parts):
        j = i
        while j + 1 < len(parts) and parts[j + 1]["start"] - parts[j]["start"] < gap:
            j += 1
        if j + 1 - i >= min_len:
            runs.append((i, j + 1))
        i = j + 1
    return runs


def vocal_end(vocal, t0, quiet=2.5):
    """First time after t0 the vocal stays below a tenth of its peak level for `quiet` s."""
    hop = int(0.05 * SR)
    rms = librosa.feature.rms(y=vocal, frame_length=hop * 2, hop_length=hop)[0]
    level = rms.max() * 0.1
    need = int(quiet / 0.05)
    run = 0
    for k in range(int(t0 / 0.05), len(rms)):
        run = run + 1 if rms[k] < level else 0
        if run >= need:
            return (k - need) * 0.05 + 0.4
    return len(vocal) / SR


def main(audio: Path, analysis: Path, vocals_path: Path, clicks: Path | None):
    separate(audio, vocals_path)
    vocal, _ = sf.read(str(vocals_path), dtype="float32")
    data = json.loads(analysis.read_text())
    parts = [p for c in data["cues"] for w in c["words"] for p in w["parts"]]
    for p in parts:
        p["key"] = norm_word(p["text"])
    alignable = [p for p in parts if p["key"]]

    bundle = torchaudio.pipelines.MMS_FA
    model = bundle.get_model(with_star=True).to("cpu").eval()
    tokenizer = bundle.get_tokenizer()
    aligner = bundle.get_aligner()

    runs = collapsed_runs(alignable)
    loose = {id(p) for i, j in runs for p in alignable[i:j]}
    groups = [(g, None) for g in chunks([p for p in alignable if id(p) not in loose])]
    for i, j in runs:
        lo = alignable[i - 1]["end"] if i > 0 else 0.0
        hi = alignable[j]["start"] if j < len(alignable) else vocal_end(vocal, alignable[i]["start"])
        groups.append((alignable[i:j], (lo, hi)))

    refined = {}
    for group, span in groups:
        if not group:
            continue
        w0 = max(0.0, group[0]["start"] - 0.7)
        w1 = min(len(vocal) / SR, group[-1]["end"] + 0.7)
        if span:
            w0, w1 = span
            print(f"  realigning {len(group)} collapsed words over {w0:.1f}-{w1:.1f}s")
        seg = torch.from_numpy(vocal[int(w0 * SR): int(w1 * SR)].copy())[None]
        if seg.shape[1] < SR * 0.3:
            continue
        with torch.inference_mode():
            emission, _ = model(seg)
        words = ["*"] + [p["key"] for p in group] + ["*"]
        try:
            spans = aligner(emission[0], tokenizer(words))
        except Exception as exc:  # noqa: BLE001 - keep estimates for unalignable chunks
            print(f"  chunk at {w0:.1f}s not aligned: {exc}")
            continue
        ratio = seg.shape[1] / emission.shape[1] / SR
        for p, sp in zip(group, spans[1:-1]):
            if not sp:
                continue
            score = float(np.mean([s.score for s in sp]))
            refined[id(p)] = (w0 + sp[0].start * ratio, w0 + sp[-1].end * ratio, score)

    env = librosa.onset.onset_strength(y=vocal, sr=SR, hop_length=160)
    env = env / (env.max() + 1e-9)
    fps = SR / 160

    kept = moved = snapped = 0
    for p in parts:
        r = refined.get(id(p))
        if not r:
            kept += 1
            continue
        start, end, score = r
        if score < MIN_SCORE or (id(p) not in loose and abs(start - p["start"]) > MAX_SHIFT):
            kept += 1
            continue
        a = int((start - SNAP_BEFORE) * fps)
        b = int((start + SNAP_AFTER) * fps)
        if b > a > 0:
            k = int(np.argmax(env[a:b]))
            if env[a + k] > 0.2:
                start = (a + k) / fps
                snapped += 1
        p["start"], p["end"] = round(start, 3), round(max(end, start + 0.04), 3)
        moved += 1

    prev = -1.0
    for p in parts:
        p["start"] = max(p["start"], prev + 0.01)
        p["end"] = max(p["end"], p["start"] + 0.02)
        prev = p["start"]
        p.pop("key", None)
    for c in data["cues"]:
        for w in c["words"]:
            w["start"], w["end"] = w["parts"][0]["start"], w["parts"][-1]["end"]

    data.setdefault("word_alignment", {})["refined"] = {"method": "demucs+mms_fa+onset", "refined": moved, "snapped": snapped, "kept": kept}
    analysis.write_text(json.dumps(data, separators=(",", ":")))
    print(f"refined {moved}/{len(parts)} parts against the vocal ({snapped} snapped to onsets, {kept} kept)")

    if clicks:
        out = vocal.copy() * 0.8
        tick = np.sin(2 * np.pi * 2000 * np.arange(int(0.02 * SR)) / SR) * np.hanning(int(0.02 * SR)) * 0.6
        for c in data["cues"]:
            for w in c["words"]:
                i = int(w["start"] * SR)
                out[i: i + len(tick)] += tick[: max(0, len(out) - i)]
        sf.write(str(clicks), np.clip(out, -1, 1), SR)


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3]), Path(sys.argv[4]) if len(sys.argv) > 4 else None)
