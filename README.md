<div align="center">

<img src=".github/images/hero.gif" alt="Six music videos playing side by side: spectrum tunnel, planet parade, binary voxels, Newton graphs, prime board, molecule stage" width="100%" />

# Music Video Games

**Beat-synced music videos and rhythm games for haivivi's STEM songs, written entirely in code.**<br />
Every frame is a function of the song's time. No generative video model, no keyframes, no stock footage.

[![Play now](https://img.shields.io/badge/%E2%96%B6%EF%B8%8E%20PLAY%20NOW-gizclaw.github.io%2Fmusic--video--games-ff3d7f?style=for-the-badge&labelColor=0b0c1d)](https://gizclaw.github.io/music-video-games/)

[![ci](https://img.shields.io/github/actions/workflow/status/GizClaw/music-video-games/ci.yml?branch=main&label=ci&style=flat-square&labelColor=0b0c1d)](https://github.com/GizClaw/music-video-games/actions/workflows/ci.yml)
[![pages](https://img.shields.io/github/actions/workflow/status/GizClaw/music-video-games/pages.yml?branch=main&label=pages&style=flat-square&labelColor=0b0c1d)](https://github.com/GizClaw/music-video-games/actions/workflows/pages.yml)
[![three.js](https://img.shields.io/badge/three.js-r180-3de8ff?style=flat-square&labelColor=0b0c1d)](https://threejs.org/)
[![vite](https://img.shields.io/badge/vite-8-9b5cff?style=flat-square&labelColor=0b0c1d)](https://vite.dev/)
[![license](https://img.shields.io/badge/license-BSD--3--Clause-7cff4f?style=flat-square&labelColor=0b0c1d)](LICENSE)

</div>

## Play

<table>
  <tr>
    <td width="290"><a href="https://gizclaw.github.io/music-video-games/aigc/songs/music/stem-institute/en-us/spectrum-slide/game/"><img src=".github/images/gameplay.gif" alt="Slide Down the Spectrum gameplay" width="270" /></a></td>
    <td>
      <h3>Slide Down the Spectrum</h3>
      <p>Ride a photon down the light tunnel from the music video. The song's own beats and drum hits build the chart.</p>
      <ul>
        <li>Steer round the tunnel wall with <kbd>←</kbd> <kbd>→</kbd>, <kbd>A</kbd> <kbd>D</kbd>, a mouse or a finger</li>
        <li>Catch a photon on every beat, with half-beat runs in the choruses</li>
        <li>Thread the gap in the red <b>γ gates</b>, or lose your combo</li>
        <li>The tunnel turns from radio to gamma as the lyrics name each band</li>
        <li>Multiplier up to ×4, karaoke lyrics and an S–D grade at the end</li>
        <li>Works on phones and desktops, with no install and no sign-in</li>
      </ul>
      <p><a href="https://gizclaw.github.io/music-video-games/aigc/songs/music/stem-institute/en-us/spectrum-slide/game/"><b>Play it →</b></a></p>
    </td>
  </tr>
</table>

## The videos

Eleven songs from the STEM Institute album, each 1080×1920 at 30 fps and cut to
the detected beat, with forced-aligned karaoke lyrics.

<table>
  <tr>
    <td align="center"><img src=".github/images/songs/molecule-shapes.jpg" width="128" alt="Molecule Shapes" /><br /><sub><b>No. 3</b><br />Molecule Shapes</sub></td>
    <td align="center"><img src=".github/images/songs/states-of-matter.jpg" width="128" alt="States of Matter" /><br /><sub><b>No. 4</b><br />States of Matter</sub></td>
    <td align="center"><img src=".github/images/songs/pi-keeps-going.jpg" width="128" alt="Pi Keeps Going" /><br /><sub><b>No. 5</b><br />Pi Keeps Going</sub></td>
    <td align="center"><img src=".github/images/songs/polygon-party.jpg" width="128" alt="Polygon Party" /><br /><sub><b>No. 6</b><br />Polygon Party</sub></td>
    <td align="center"><img src=".github/images/songs/prime-time.jpg" width="128" alt="Prime Time" /><br /><sub><b>No. 8</b><br />Prime Time</sub></td>
    <td align="center"><img src=".github/images/songs/newtons-three.jpg" width="128" alt="Newton's Three" /><br /><sub><b>No. 12</b><br />Newton's Three</sub></td>
  </tr>
  <tr>
    <td align="center"><img src=".github/images/songs/prefix-power.jpg" width="128" alt="Prefix Power" /><br /><sub><b>No. 14</b><br />Prefix Power</sub></td>
    <td align="center"><img src=".github/images/songs/spectrum-slide.jpg" width="128" alt="Slide Down the Spectrum" /><br /><sub><b>No. 15</b><br />Slide Down the Spectrum</sub></td>
    <td align="center"><img src=".github/images/songs/energy-shapeshifter.jpg" width="128" alt="Energy Shapeshifter" /><br /><sub><b>No. 17</b><br />Energy Shapeshifter</sub></td>
    <td align="center"><img src=".github/images/songs/planet-parade.jpg" width="128" alt="Planet Parade" /><br /><sub><b>No. 22</b><br />Planet Parade</sub></td>
    <td align="center"><img src=".github/images/songs/binary-boogie.jpg" width="128" alt="Binary Boogie" /><br /><sub><b>No. 23</b><br />Binary Boogie</sub></td>
    <td></td>
  </tr>
</table>

## How it works

```mermaid
flowchart LR
  song["AIGC catalog song<br/>audio · lyrics · ASR"] --> analysis["Analysis<br/>beats · onsets · spectrum<br/>forced-aligned words"]
  analysis --> video["aigc/&lt;work&gt;/video<br/>three.js choreography"]
  analysis --> game["aigc/&lt;work&gt;/game<br/>chart + beat data"]
  core(["@gizclaw/mvg-core<br/>timing · HUD · post · intro"]) -.-> video
  core -.-> game
  video --> render["Headless Chromium<br/>parallel frames → MP4 + WebM"]
  game --> pages["GitHub Pages<br/>play in the browser"]
```

- **Beat-locked.** AI-generated songs drift in tempo, so scenes follow the detected beat list rather than a fixed grid. Kicks, snares and a 32-band spectrum drive the motion.
- **Words on the syllable.** Lyrics are force-aligned to a Demucs vocal stem, so a digit flips or a planet lands on the sung word.
- **Deterministic.** Frames are pure functions of time with seeded randomness, so four browser workers render segments in parallel and the segments join without re-encoding.
- **One scene, two outputs.** A game reuses its video's scenes and colours, then adds input, a chart and a score.

## Layout

```text
music-video-games/
├── packages/
│   ├── core/    @gizclaw/mvg-core   timing, HUD, post-processing, haivivi intro (shared)
│   ├── video/   @gizclaw/mvg-video  mvg-video CLI, renderer page, beat/lyric analysis (Python)
│   └── games/   @gizclaw/mvg-games  shared game kit and the GitHub Pages build
├── aigc/                            mirrors the AIGC catalog (gizclaw/catalogs/aigc/)
│   └── songs/<category>/<album>/<lang>/<id>/
│       ├── video/                   choreography: song.js and its scenes
│       └── game/                    optional game: index.html, game.js, analysis.json
├── index.html                       games gallery (site root)
└── scripts/check.mjs                layout and syntax check
```

The repository is one npm workspace; song code imports shared modules by
package name (`@gizclaw/mvg-core/timing.js`, `@gizclaw/mvg-games/kit.js`).

**Catalog matching.** A song's directory is its catalog work path. The work
`songs/music/stem-institute/en-us/spectrum-slide` is choreographed by
`aigc/songs/music/stem-institute/en-us/spectrum-slide/video/song.js`, and its
game lives beside it in `game/`. Passing the same `--work` to the CLI is all it
takes to find the right tool.

## Quick start

```sh
npm ci
npm run dev        # games at http://localhost:5179/
```

<details>
<summary><b>Render a video</b></summary>

<br />

Music, lyrics and media stay with the catalog owner; this repository holds code
only. The CLI reads a song from a mounted GizClaw root and writes back there:

| What | Path under `--root` (default `/Volumes/H002-R02T-APFS/GizClaw`) |
| --- | --- |
| Song input | `catalogs/aigc/<work>.ogg`, `.srt` |
| Analysis cache | `cache/aigc/<work>/analysis.json` |
| Build intermediates | `build/aigc/<work>/` |
| Deliverables | `catalogs/aigc/<work>.mp4` (original quality), `.webm` (VP9) |

```sh
npx playwright install chromium
npx mvg-video --work songs/music/stem-institute/en-us/spectrum-slide prepare
npx mvg-video --work … snap <name> 12.6 41.9   # contact sheet under build/
npx mvg-video --work … preview                  # live preview with audio
npx mvg-video --work … render [--workers 4]     # clearance, frames, MP4 + WebM
```

`--catalog <dir>` points at the AIGC catalog source so the published title lands
in the file metadata. Other commands: `encode`, `inspect`, `clearance` and
`game-data`. Analysis needs `uv` (Python 3.12); lyric refinement downloads its
models into `<root>/cache/models`; encoding needs `ffmpeg`.

</details>

<details>
<summary><b>Build the games site</b></summary>

<br />

```sh
npm run build      # dist/, deployed to GitHub Pages on every push to main
```

Each `aigc/<work>/game/index.html` becomes a page at the same path on the site.
Games stream the published catalog audio from `static-volc.gizclaw.com` and
bundle a trimmed `analysis.json` (beats, onsets, aligned lyrics), refreshed with
`mvg-video --work <work> game-data`. `?audio=<url>` overrides the audio source.

</details>

## Package docs

- [`@gizclaw/mvg-video`](packages/video/README.md): analysis, lyric alignment and placement, song modules, rendering and deliverables.
- [`@gizclaw/mvg-games`](packages/games/README.md): game layout and the Slide Down the Spectrum chart.

## Contributing

New songs and games are welcome. [CONTRIBUTING.md](CONTRIBUTING.md) covers the
catalog path rule, the pure-function scene contract and the PR checks.

## License

BSD 3-Clause. Copyright (c) 2026, Haivivi Innovation Co., Ltd.
