# @gizclaw/mvg-video

Every song's choreography lives at `aigc/<work>/video/`. Scenes are three.js
rendered in headless Chromium; there is no generative video model. The shared
haivivi opening, HUD, post-processing and timing come from `@gizclaw/mvg-core`.

The GitHub Release includes this CLI as `gizclaw-mvg-video-<version>.tgz`, with
the renderer page, Python analyzers, pinned Python requirements and license.
Install it together with the matching `@gizclaw/mvg-core` archive listed in
`npm-index.json`. Node.js 22.12 or newer is required; rendering also needs
Chromium (`npx playwright install chromium`), `ffmpeg` and `uv`.

Choreography belongs to the caller's project, separately from the npm package.
By default the CLI reads `aigc/<work>/video/` in the current directory; pass
`--project <directory>` to select another project. The preview server resolves
core and three.js from installed dependencies. `--root` still selects the
mounted GizClaw media/cache/build root.

```sh
mvg-video --version
mvg-video --project /path/to/music-video-games --root /mounted/GizClaw --work spectrum-slide preview
```

| Work | Choreography |
|------|--------------|
| `songs/music/stem-institute/en-us/spectrum-slide` | spectrum tunnel, synthwave chorus, particle wave ocean, prism and EM-wave bridge |
| `songs/music/stem-institute/en-us/binary-boogie` | 8-bit bit cubes flipping on each sung digit, voxel numbers, LED-wall chorus |
| `songs/music/stem-institute/en-us/planet-parade` | one solar system morphing between orbits, the parade line and marching hops; Pluto bridge |
| `songs/music/stem-institute/en-us/prefix-power` | one top-down powers-of-ten zoom on a picnic blanket, one shader layer per decade from atoms (10⁻¹⁰ m) to stars (10¹⁴ m), one jump per sung "drop" |
| `songs/music/stem-institute/en-us/molecule-shapes` | ball-and-stick molecules on a glossy spotlit stage, iridescent electron-domain balloons, VSEPR angle arcs |
| `songs/music/stem-institute/en-us/states-of-matter` | one ray-marched sample of water as ice cube, liquid, vapour cloud and plasma globe, with a particle magnifier and word-timed phase changes |
| `songs/music/stem-institute/en-us/pi-keeps-going` | pi walk: each sung digit steps toward its heading on a ten-way dial, ticker of 50 decimals, rolling-circle chorus |
| `songs/music/stem-institute/en-us/polygon-party` | polygons drawn edge by edge with counted corners, orbit ring, side-by-side chorus grid, nested mandala outro |
| `songs/music/stem-institute/en-us/prime-time` | game-show 1–100 board: sung primes light gold, chorus sieves of 2, 3, 5, 7, Ulam spiral bridge |
| `songs/music/stem-institute/en-us/newtons-three` | function graphs drawn live above a number-line track: x–t world lines (rest, constant velocity, bending under force), v–t slopes and an F–a line for F = ma, mirrored F–t pair, 3-D world lines and helices |
| `songs/music/stem-institute/en-us/energy-shapeshifter` | closed-loop machine whose energy orb changes form at each station, 100% energy meter, closed-system bridge |

## Analysis

`packages/video/python/analyze.py` (librosa, pinned in `requirements.txt`, run through `uv`) writes
`analysis.json`: detected beat times, onsets, kick/snare envelopes from
harmonic–percussive separation, low/mid/high/RMS band envelopes and a 32-bin
mel spectrum resampled to 30 fps, plus the SRT cues. AIGC songs drift in tempo,
so scenes lock to the detected beat list (`Timing.beatFloat`), not a constant
grid.

Word times come from the catalog's ASR alignment, the
`catalogs/aigc/build/work/<fingerprint>/lyrics-alignment.json` whose approved cues
plus `marker_offset_ms` reproduce the published SRT (newest match; the choice is
kept in `cache/aigc/<work>/asr-source.json`). `analyze.py align` matches each
cue's words and hyphen parts to ASR words inside that cue's window, so repeated
choruses cannot borrow each other's audio; unmatched words are spread within
their own cue at no more than 0.32 s per syllable.

The catalog's stream ASR runs with `"timing": "recognition_events"`: each word is
stamped when it is recognised, roughly as it finishes, and its 80 ms span is
synthetic. Taken as onsets these times trail the voice by about one word
(0.2–0.4 s). Alignment therefore treats each event as the word's end and starts
the word at the previous event, no earlier than one typical event interval
before its own; first words of lines then agree with the catalog SRT, whose
line starts subtract the same interval. `Timing` starts each aligned cue at its
first word, and lyric lines, karaoke highlights (lit 50 ms early so the pop
peaks on the syllable), bit flips, planet names and "drop" hits key off these
times. Without an alignment the renderer falls back to SRT cues and syllable
estimates.

Singing is not evenly paced, so `packages/video/python/align_vocals.py` then refines those estimates
against the voice itself: Demucs (`htdemucs`) separates the vocal stem, cached
as `cache/aigc/<work>/vocals16k.wav`; lines are grouped into chunks at pauses and
their known words force-aligned to the stem with torchaudio's MMS_FA CTC
aligner; each start snaps to the strongest vocal onset within −100/+60 ms.
Words scoring below 0.25 or landing more than 0.8 s from the ASR estimate keep
the estimate. When the ASR lost the vocal it packs six or more words within
60 ms; such a run is aligned on its own inside the gap between its neighbouring
good words (or until the vocal stops) and may move anywhere in it. Lyric lines a
generated song never sings cannot be recovered this way; the song module drops
them, as Pi Keeps Going does for its last three outro lines. Changing
`align_vocals.py` invalidates every refined analysis. Dependencies are pinned in
`requirements-align.txt`; model weights live under `cache/models/{torch,huggingface}` on the mounted root.
`build/aigc/<work>/lyric-clicks.wav` mixes the vocal stem with a tick at every
word start for listening checks.

## Lyric placement

Lyrics stay at one fixed bottom position for the whole video (y = 1400, or the
song's `lyricY`, e.g. 1490 for States of Matter); scenes compose around them.
Every HUD label, slam, stamp and title records its screen rectangle, and scenes
register `hud.keepout()` for text-like 3D objects such as voxel numerals and bit
rows. Before rendering, `mvg-video clearance` renders five
lyric-free frames per line and lists, in `build/aigc/<work>/lyric-clearance.txt`,
every line whose block comes within 40 px of such a rectangle. Fix those by
moving the scene's text up, not by moving the lyrics.

## Song modules

`aigc/<work>/video/song.js` exports `createSong(ctx)`, returning its scenes, a
`pick(t)` that maps time to `[scene, section]`, and the intro configuration.
Sections named `intro` and `end` use the shared haivivi scene; the end card
starts at the song's `SECTIONS.end`.

Every published song opens with the catalog's 1.647 s audio mark
(`gizclaw/catalogs/aigc/assets/music-mark.wav` in the catalog repository), which carries no song beats.
During it the intro's seed wave follows the mark's own onsets (0.064, 0.412 and
the main hit at 0.569 s). `deriveIntro` then opens fast whatever the drop: the
wave splits in a quick cascade, the seven glyphs land about 0.1 s apart with the
last one on the beat nearest 3.4 s, the tagline follows on a beat 0.6–1.6 s
later, and the build takes the last one or two beats before the drop; the logo holds in
between. Split and glyph events move to a clear onset within about 0.1 s of
their grid. Intro lyrics stay visible until the build. Section boundaries
live in each song's `video/constants.js`, chosen on detected beats at structural
changes.

## Rendering

Every frame is a pure function of its timestamp; `Math.random` is seeded at
boot. Parallel workers therefore render contiguous frame ranges independently.
Each worker pipes JPEG frames into its own libx264 encoder with a fixed
two-second GOP and identical profile, so segments concatenate without
re-encoding into `build/…/master.mp4` with 256 kbit/s AAC audio. The MP4
deliverable copies the master's streams with `+faststart`; the WebM is a
two-pass libvpx-vp9 encode with 128 kbit/s Opus. VP9 smooths the film grain, so
its SSIM against the master sits near 0.94 even when frames look identical.

Both deliverables are 1080×1920, 30 fps, limited-range yuv420p, BT.709; the MP4
is H.264 High 4.1 at about 10 Mbit/s. Lyrics, labels and rulers stay inside the
short-video safe area: clear of the top 250 px, the bottom 440 px and the
right-hand action column.
