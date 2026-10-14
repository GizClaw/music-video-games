# Music Video Games

Beat-synced, code-generated music videos and playable web games for the
haivivi AIGC song catalog. Every frame is a pure function of the song's time,
so videos render deterministically in headless Chromium and the same scenes
can run live in a browser game.

Play: <https://gizclaw.github.io/music-video-games/>

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

The repository is one npm workspace. Song code imports shared modules by
package name (`@gizclaw/mvg-core/timing.js`, `@gizclaw/mvg-games/kit.js`).

### Catalog matching

A song's directory is its catalog work path. The catalog work
`songs/music/stem-institute/en-us/spectrum-slide` (its YAML at
`gizclaw/catalogs/aigc/songs/music/stem-institute/en-us/spectrum-slide.yaml`)
is choreographed by `aigc/songs/music/stem-institute/en-us/spectrum-slide/video/song.js`,
and its game, if any, lives beside it in `game/`. Passing the same `--work` to
the CLI is all that is needed to find the right tool.

## Videos

Music, lyrics and media stay with the catalog owner; this repository holds code
only. The CLI reads the song from a mounted GizClaw root and writes there:

| What | Path under `--root` (default `/Volumes/H002-R02T-APFS/GizClaw`) |
| --- | --- |
| Song input | `catalogs/aigc/<work>.ogg`, `.srt` |
| Analysis cache | `cache/aigc/<work>/analysis.json` |
| Build intermediates | `build/aigc/<work>/` |
| Deliverables | `catalogs/aigc/<work>.mp4` (original quality), `.webm` (VP9) |

```sh
npm ci
npx mvg-video --work songs/music/stem-institute/en-us/spectrum-slide prepare
npx mvg-video --work … snap <name> 12.6 41.9   # contact sheet under build/
npx mvg-video --work … preview                  # live preview with audio
npx mvg-video --work … render [--workers 4]     # clearance, frames, MP4 + WebM
```

`--catalog <dir>` points at the AIGC catalog source so the published title from
the work YAML lands in the file metadata. Other commands: `encode`, `inspect`,
`clearance`, `game-data`. Analysis needs `uv` (Python 3.12), lyric refinement
downloads its models into `<root>/cache/models`, and encoding needs `ffmpeg`.

A song module (`video/song.js`) exports `createSong(ctx)` and returns its scenes,
a `pick(t)` mapping time to `[scene, section]` and the intro schedule from
`deriveIntro`. Scenes return post-processing parameters from `update(t, section)`
and must not keep state between frames, because segments render in parallel.

## Games

```sh
npm run dev      # http://localhost:5179/
npm run build    # dist/, deployed to GitHub Pages on every push to main
```

Each `aigc/<work>/game/index.html` becomes a page at the same path on the site.
Games stream the published catalog audio from `static-volc.gizclaw.com` and
bundle a trimmed `analysis.json` (beats, onsets, aligned lyrics), refreshed with
`mvg-video --work <work> game-data`. `?audio=<url>` overrides the audio source.

## License

BSD 3-Clause. Copyright (c) 2026, Haivivi Innovation Co., Ltd.
