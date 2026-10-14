"""Extract beat grid, onsets, band energies and lyric cues for the video renderer."""

import difflib
import json
import re
import sys
from pathlib import Path

FPS = 30


def parse_srt(path: Path):
    cues = []
    blocks = re.split(r"\n\s*\n", path.read_text(encoding="utf-8").strip())
    for block in blocks:
        lines = block.strip().splitlines()
        if len(lines) < 3:
            continue
        a, b = lines[1].split(" --> ")
        cues.append({"start": ts(a), "end": ts(b), "text": " ".join(lines[2:])})
    return cues


def ts(value: str) -> float:
    h, m, rest = value.strip().split(":")
    s, ms = rest.split(",")
    return int(h) * 3600 + int(m) * 60 + int(s) + int(ms) / 1000


def _key(text):
    return re.sub(r"[^a-z0-9]", "", text.lower()).replace("metre", "meter")


def _syl(text):
    groups = re.findall(r"[aeiouy]+", re.sub(r"e$", "", text.lower()))
    return max(1, len(groups))


def align_words(cues, asr_path):
    """Attach ASR word times to every lyric token and hyphen part.

    Tokens are whitespace words of each cue (em dashes dropped); each keeps its
    hyphen parts. Parts are matched to the ASR word sequence with difflib, and
    unmatched runs are spread by syllables between the surrounding anchors,
    clamped to their cue.
    """
    data = json.loads(Path(asr_path).read_text(encoding="utf-8"))
    offset = data.get("marker_offset_ms", 0) / 1000
    asr = []
    for utt in data["result"].get("utterances") or []:
        for w in utt.get("words") or []:
            text = w.get("text", "").strip()
            if not text or w["end_time"] <= w["start_time"]:
                continue
            if (text.startswith("'") or text.lower() == "th") and asr:
                asr[-1]["key"] += _key(text)
                asr[-1]["end"] = w["end_time"] / 1000 + offset
                continue
            asr.append({"key": _key(text), "start": w["start_time"] / 1000 + offset, "end": w["end_time"] / 1000 + offset})

    # Streaming results ("timing": "recognition_events") stamp each word when it
    # is recognised, roughly as it finishes; their 80 ms spans are synthetic.
    # Treat the event as the word's end and start it at the previous event,
    # but no earlier than one typical word interval before its own event.
    if data.get("parameters", {}).get("timing") == "recognition_events" and len(asr) > 1:
        steps = sorted(b["end"] - a["end"] for a, b in zip(asr, asr[1:]) if 0 < b["end"] - a["end"] < 1.0)
        typical = min(0.5, max(0.15, steps[len(steps) // 2]))
        prev_end = None
        for a in asr:
            event = a["end"]
            a["start"] = event - typical if prev_end is None else max(prev_end, event - typical)
            prev_end = event

    parts = []
    for ci, cue in enumerate(cues):
        cue["words"] = []
        for token in cue["text"].replace("—", " — ").split():
            if token == "—":
                continue
            word = {"text": token, "parts": []}
            cue["words"].append(word)
            for piece in [p for p in token.split("-") if _key(p)]:
                part = {"text": piece, "key": _key(piece), "cue": ci}
                word["parts"].append(part)
                parts.append(part)

    # Match cue by cue against ASR words inside that cue's window, so repeated
    # choruses cannot borrow each other's audio.
    matched = 0
    last = -1.0
    for ci, cue in enumerate(cues):
        mine = [p for p in parts if p["cue"] == ci]
        hi = cue["end"] + 0.5
        if ci + 1 < len(cues):
            hi = min(hi, cues[ci + 1]["start"] + 0.15)
        window = [a for a in asr if a["start"] >= last - 0.05 and cue["start"] - 0.8 <= a["start"] <= hi]
        sm = difflib.SequenceMatcher(None, [p["key"] for p in mine], [a["key"] for a in window], autojunk=False)
        for block in sm.get_matching_blocks():
            for k in range(block.size):
                p, a = mine[block.a + k], window[block.b + k]
                p["start"], p["end"] = a["start"], a["end"]
                last = max(last, a["end"])
                matched += 1

    # Spread unmatched runs within their own cue, starting after the previous
    # anchor (or the cue start) at a natural singing rate.
    i = 0
    while i < len(parts):
        if "start" in parts[i]:
            i += 1
            continue
        ci = parts[i]["cue"]
        j = i
        while j < len(parts) and "start" not in parts[j] and parts[j]["cue"] == ci:
            j += 1
        cue = cues[ci]
        lo = max(parts[i - 1]["end"], cue["start"]) if i > 0 else cue["start"]
        hi = parts[j]["start"] if j < len(parts) and parts[j]["cue"] == ci else cue["end"]
        run = parts[i:j]
        weights = [_syl(p["text"]) for p in run]
        total = sum(weights)
        width = max(min(hi - lo, total * 0.32), 0.04 * len(run))
        acc = lo
        for p, w in zip(run, weights):
            span = width * w / total
            cue = cues[p["cue"]]
            p["start"] = min(max(acc, cue["start"]), cue["end"])
            p["end"] = min(max(acc + span, p["start"] + 0.02), cue["end"] + 0.3)
            acc += span
        i = j

    prev = -1.0
    for p in parts:
        p["start"] = max(p["start"], prev + 0.01)
        p["end"] = max(p["end"], p["start"] + 0.02)
        prev = p["start"]

    for cue in cues:
        for word in cue["words"]:
            ps = word["parts"]
            word["start"] = round(ps[0]["start"], 3)
            word["end"] = round(ps[-1]["end"], 3)
            word["parts"] = [{"text": p["text"], "start": round(p["start"], 3), "end": round(p["end"], 3)} for p in ps]
    return matched, len(parts)


def norm(x):
    import numpy as np

    x = np.asarray(x, dtype=np.float64)
    lo, hi = np.percentile(x, 2), np.percentile(x, 99.5)
    return np.clip((x - lo) / max(hi - lo, 1e-9), 0, 1)


def main(audio: Path, srt: Path, out: Path, asr: Path | None = None):
    import librosa
    import numpy as np

    y, sr = librosa.load(audio, sr=44100, mono=True)
    duration = len(y) / sr
    hop = 512

    onset_env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop)
    tempo, beats = librosa.beat.beat_track(onset_envelope=onset_env, sr=sr, hop_length=hop, tightness=120)
    beat_times = librosa.frames_to_time(beats, sr=sr, hop_length=hop)
    onsets = librosa.onset.onset_detect(onset_envelope=onset_env, sr=sr, hop_length=hop, backtrack=False)
    onset_times = librosa.frames_to_time(onsets, sr=sr, hop_length=hop)
    onset_strength = onset_env[onsets] / (onset_env.max() + 1e-9)

    # Percussive kick/snare-ish envelopes from HPSS.
    harm, perc = librosa.effects.hpss(y)
    S = np.abs(librosa.stft(perc, n_fft=2048, hop_length=hop))
    freqs = librosa.fft_frequencies(sr=sr, n_fft=2048)
    kick = S[(freqs >= 30) & (freqs < 150)].sum(axis=0)
    snare = S[(freqs >= 1500) & (freqs < 6000)].sum(axis=0)

    full = np.abs(librosa.stft(y, n_fft=2048, hop_length=hop))
    low = full[(freqs >= 20) & (freqs < 250)].sum(axis=0)
    mid = full[(freqs >= 250) & (freqs < 2500)].sum(axis=0)
    high = full[(freqs >= 2500) & (freqs < 12000)].sum(axis=0)
    rms = librosa.feature.rms(y=y, hop_length=hop)[0]

    # 32-bin log spectrum for the visualiser bars.
    mel = librosa.feature.melspectrogram(S=full**2, sr=sr, n_mels=32, fmax=14000)
    mel_db = librosa.power_to_db(mel, ref=np.max)
    mel_n = np.clip((mel_db + 70) / 70, 0, 1)

    frame_times = librosa.frames_to_time(np.arange(full.shape[1]), sr=sr, hop_length=hop)
    n_out = int(np.ceil(duration * FPS))
    t_out = np.arange(n_out) / FPS

    def resample(x):
        return np.interp(t_out, frame_times[: len(x)], x)

    kick_onsets = librosa.onset.onset_detect(
        onset_envelope=librosa.onset.onset_strength(S=librosa.amplitude_to_db(S[(freqs < 150)]), sr=sr, hop_length=hop),
        sr=sr, hop_length=hop)
    snare_onsets = librosa.onset.onset_detect(
        onset_envelope=librosa.onset.onset_strength(S=librosa.amplitude_to_db(S[(freqs >= 1500) & (freqs < 6000)]), sr=sr, hop_length=hop),
        sr=sr, hop_length=hop)

    data = {
        "fps": FPS,
        "duration": duration,
        "tempo": float(np.atleast_1d(tempo)[0]),
        "beats": [round(float(t), 4) for t in beat_times],
        "onsets": [[round(float(t), 4), round(float(s), 3)] for t, s in zip(onset_times, onset_strength)],
        "kicks": [round(float(t), 4) for t in librosa.frames_to_time(kick_onsets, sr=sr, hop_length=hop)],
        "snares": [round(float(t), 4) for t in librosa.frames_to_time(snare_onsets, sr=sr, hop_length=hop)],
        "frames": {
            "rms": np.round(resample(norm(rms)), 3).tolist(),
            "low": np.round(resample(norm(low)), 3).tolist(),
            "mid": np.round(resample(norm(mid)), 3).tolist(),
            "high": np.round(resample(norm(high)), 3).tolist(),
            "kick": np.round(resample(norm(kick)), 3).tolist(),
            "snare": np.round(resample(norm(snare)), 3).tolist(),
        },
        "spectrum": [np.round(np.interp(t_out, frame_times, row), 2).tolist() for row in mel_n],
        "cues": parse_srt(srt),
    }
    if asr:
        matched, total = align_words(data["cues"], asr)
        data["word_alignment"] = {"source": str(asr), "matched": matched, "parts": total}
        print(f"aligned {matched}/{total} lyric parts to ASR words")
    out.write_text(json.dumps(data, separators=(",", ":")))
    print(f"tempo={data['tempo']:.1f} beats={len(beat_times)} onsets={len(onset_times)} "
          f"kicks={len(data['kicks'])} snares={len(data['snares'])} duration={duration:.2f}s frames={n_out}")
    print("first beats:", data["beats"][:24])
    print("first kicks:", data["kicks"][:24])
    # Energy contour per 2 seconds, for section detection by eye.
    step = 2 * FPS
    r = np.array(data["frames"]["rms"])
    lowv = np.array(data["frames"]["low"])
    for i in range(0, n_out, step):
        print(f"{i / FPS:6.1f}s rms={r[i:i + step].mean():.2f} low={lowv[i:i + step].mean():.2f}")


def align_only(analysis: Path, srt: Path, asr: Path):
    data = json.loads(analysis.read_text())
    data["cues"] = parse_srt(srt)
    matched, total = align_words(data["cues"], asr)
    data["word_alignment"] = {"source": str(asr), "matched": matched, "parts": total}
    analysis.write_text(json.dumps(data, separators=(",", ":")))
    print(f"aligned {matched}/{total} lyric parts to ASR words")


if __name__ == "__main__":
    if sys.argv[1] == "align":
        align_only(Path(sys.argv[2]), Path(sys.argv[3]), Path(sys.argv[4]))
        sys.exit(0)
    main(Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3]), Path(sys.argv[4]) if len(sys.argv) > 4 else None)
