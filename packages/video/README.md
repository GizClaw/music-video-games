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

## Run with npx

The CLI can run directly from the release archives, without a manual `npm install`
or global package installation. Each new GitHub Release includes exact npx
commands with its pinned tarball URLs. Supply both the core and video archives
from that release: core is an internal package dependency, and does not need to
be available on the public npm registry for this route to work.

```sh
npx --yes \
  --package="<core .tgz URL from the release>" \
  --package="<video .tgz URL from the same release>" \
  mvg-video --project /path/to/music-video-games --root /mounted/GizClaw \
  --work spectrum-slide --subtitles embed --format mp4 render
```

Replace the two URLs with assets from [GitHub Releases](https://github.com/GizClaw/music-video-games/releases).
npx downloads into its cache and leaves the caller's project dependencies alone.
Node.js 22.12+, Chromium, ffmpeg and uv are still rendering prerequisites; the
choreography and catalog media remain supplied by the caller. Once both packages
are published to a configured npm registry, `npx --yes @gizclaw/mvg-video@<version>`
is the shorter equivalent. A registry publication is separate from GitHub Releases.

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
| `songs/music/stem-institute/en-us/elements-part-one` | chemistry lab: a periodic-table chart lights elements 1–56 as they are sung, an element card, a Bohr atom gaining one electron per element in its real shell configuration |
| `songs/music/stem-institute/en-us/circle-words` | velvet-curtained ballroom: one circle whose centre, radius, diameter, circumference, area, arc, chord and tangent are drawn on their words, d = 2r, C = 2πr and A = πr², waltz-bar spins |
| `songs/music/stem-institute/en-us/big-number-ladder` | a ladder made of the number: a golden 1 and one rung per three zeroes rising from Earth past the Moon, then a low-angle googol tower of 100 zeroes beside a spiral galaxy |
| `songs/music/stem-institute/en-us/angle-gang` | desert-sunset protractor whose ray swings to each sung angle, live degree readout and angle names, quarter-to-full-turn bridge |
| `songs/music/stem-institute/en-us/simple-machines` | construction-site scaffold holding six working machines; verse close-ups with labelled parts, chorus punch-ins on every name, welding sparks |
| `songs/music/stem-institute/en-us/elements-part-two` | the Part One chemistry lab with the full table: elements 57–118 light on their names across periods 6–7 and the lanthanide and actinide rows, Bohr atom with seven shells from reference configurations |
| `songs/music/stem-institute/en-us/math-word-machine` | workshop word machine: problems ride a conveyor in and answer cards name sum, difference, product and quotient; 3/4 fraction pie, equation balance, variable box, power-down ending |
| `songs/music/stem-institute/en-us/si-base-units` | castle-courtyard roll call: seven toy soldiers report quantity, unit and symbol with a demonstrator each (metre stick, kilogram, stopwatch, current loop, thermometer, mole jar, candle) |
| `songs/music/stem-institute/en-us/force-friends` | sunny park with six force demos (gravity, friction, elastic, buoyancy, magnetism, air drag) drawn as force arrows; chorus whips to each answer, balanced and unbalanced tug of war |
| `songs/music/stem-institute/en-us/thirty-two-chompers` | dentist's office with a hinged demonstration jaw: incisors, canines, premolars and molars light by type, 20 primary teeth give way to 32 permanent, bites on cut, tear, crush and grind |
| `songs/music/stem-institute/en-us/muscle-roll-call` | sports hall mannequin whose muscle groups shorten and bulge as they contract: curls, raises, squats, heel raises, flex-relax-switch chorus moves |
| `songs/music/stem-institute/en-us/bone-zone` | moonlit beach, a surf-dancing skeleton: named bones glow with close-ups (skull, ribs, vertebrae, clavicles, femur), joints flex, 206 counter, bridge question-and-answer |
| `songs/music/stem-institute/en-us/lab-rules` | school lab bench: each safety rule brings in a vivid 3D prop with an electric outline, stamped ✓ or ✗, filling a 17-box checklist; bridge question-and-answer cards |
| `songs/music/stem-institute/en-us/science-method-shuffle` | school garden fair test led by a magnifying glass: on each sung step it glides to that subject and its lens shows a live close-up (seed sprouting, leaf cells, ruler marks, the notebook and chart); three bean pots differ only in sunlight |

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
English lyrics and Chinese subtitles omit the final comma (`,` or `，`) on each
source line, including exported Chinese SRTs. Internal commas, other punctuation,
source cue text and word timings are preserved.
Every HUD label, slam, stamp and title records its screen rectangle, and scenes
register `hud.keepout()` for text-like 3D objects such as voxel numerals and bit
rows. Before rendering, `mvg-video clearance` renders five
lyric-free frames per line and lists, in `build/aigc/<work>/lyric-clearance.txt`,
every line whose block comes within 40 px of such a rectangle. Fix those by
moving the scene's text up, not by moving the lyrics.

### Chinese subtitles

An optional `<work>.zh-CN.json` beside the catalog audio supplies Simplified
Chinese translations, keyed by the exact English cue text (repeated lines
reuse one translation):

```json
{
  "version": 1,
  "language": "zh-CN",
  "lines": {
    "One wide family, wave by wave,": "一个大家族，波浪接着波浪，"
  }
}
```

Provide a nonempty translation for every sung cue; missing lines fail the
preview/render so an edited lyric cannot silently get the wrong translation.
The track stays with the catalog media, outside this code repository. It uses
the same aligned cue windows as the English lyrics, including song-specific
timing corrections and omitted unsung lines.

Write the intended meaning in natural, concise Chinese for children, rather
than mirroring English word order or rhyme filler. Scientific terms, numbers,
sequences and relationships must stay accurate. Read each subtitle aloud and
review it in context before exporting the translation track.

```sh
mvg-video --work spectrum-slide subtitles            # generate an editable SRT under build/
mvg-video --work spectrum-slide --subtitles embed --format mp4 render # Chinese in the picture
mvg-video --work spectrum-slide --subtitles external render # video + companion Chinese SRT
mvg-video --work spectrum-slide --subtitles none render # omit the Chinese translation
```

Generated SRT files stay at `build/aigc/<work>/subtitles.zh-CN.srt` for editing.
An optional hand-authored `<work>.zh-CN.srt` beside the catalog audio takes
precedence; otherwise the renderer uses the generated SRT or the JSON track.
`subtitles` explicitly regenerates the SRT from the aligned JSON. Reload the
preview to pick up SRT edits, then rerender to apply them to the video.

`--subtitles embed` is the default. Chinese is rendered in static 36 px type at
y = 1660 below the animated lyrics, with at most two lines. A final composition
pass avoids flashes, glitches, grain and colour shifts. The master, MP4 and
WebM contain Chinese directly in the picture, so every player shows the same
size and position. Chinese only changes at cue boundaries, with no movement
or karaoke effects. Editing files stay under build/; a previous companion SRT
is preserved there when switching modes, so players do not load it twice.

`--subtitles external` keeps Chinese out of the video pixels and writes a
companion `<work>.zh-CN.srt` beside the MP4/WebM. It requires an existing Chinese
SRT or JSON translation track. Partial renders get a companion SRT clipped to
the selected interval, starting at zero. Preview and snap show the video pixels
for the selected mode, so only `embed` displays the Chinese overlay.

`--subtitles none` skips Chinese entirely, including translation loading.
English karaoke remains part of the animation in all modes. Songs without a
translation retain their existing layout in the default `embed` mode.
`--format mp4`, `--format webm` or the default `--format both` selects deliverables.
New full renders record the subtitle mode in `build/aigc/<work>/master.json`;
`encode` preserves it. Older masters without metadata retain the legacy `embed`
default. `encode --subtitles ...` is rejected: rerender to change the pixels.

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
deliverable copies the master's video/audio streams with `+faststart`; the WebM is a
two-pass libvpx-vp9 encode with 128 kbit/s Opus. VP9 smooths the film grain, so
its SSIM against the master sits near 0.94 even when frames look identical.

Both deliverables are 1080×1920, 30 fps, limited-range yuv420p, BT.709; the MP4
is H.264 High 4.1 at about 10 Mbit/s. Animated English lyrics, labels and rulers stay inside the
short-video safe area: clear of the top 250 px, the bottom 440 px and the
right-hand action column.
