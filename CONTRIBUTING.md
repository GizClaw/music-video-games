# Contributing

## Setup

```sh
npm ci
npx playwright install chromium   # only for rendering videos
```

Rendering also needs `ffmpeg` and `uv`. Games need nothing beyond `npm ci`.

## Adding a song video

1. Use the song's AIGC catalog work path, e.g.
   `songs/music/stem-institute/en-us/<id>`. The directory
   `aigc/<work>/video/` must match it exactly, or the CLI will not find it.
2. Write `video/constants.js` with the section boundaries (on detected beats;
   `mvg-video --work <work> inspect` prints cues, beats and energy) and
   `video/song.js` exporting `createSong(ctx)`. Import shared code from
   `@gizclaw/mvg-core/…`.
3. Keep every scene a pure function of time: no state carried between frames,
   no unseeded randomness. Segments render in parallel.
4. Review with `mvg-video snap`, keep `mvg-video clearance` clear, then render.

See [docs/video.md](docs/video.md) for the analysis, lyric and rendering contracts.

## Adding a game

1. Create `aigc/<work>/game/index.html` beside the song's video directory. It
   becomes a page at the same path on the site; add a card to the gallery in
   `index.html`.
2. Import shared runtime pieces from `@gizclaw/mvg-games/kit.js` (audio clock,
   catalog audio URL, glow sprite, post shader) and scene code from
   `../video/`.
3. Write the trimmed beat data with `mvg-video --work <work> game-data` and
   commit `game/analysis.json`.
4. Play it through with `npm run dev`, then check `npm run build`.

See [docs/games.md](docs/games.md).

## Pull requests

Run `npm run check` before pushing; CI runs it with the Pages build. Label the
PR by area (`video`, `song`, `game`, `core`, `pages`, `ci`). Merges are
squash-only, and every merge to `main` redeploys the GitHub Pages site.

Song audio, lyrics and rendered videos are not committed. They belong to the
AIGC catalog and are read from, and written to, the mounted catalog root.
