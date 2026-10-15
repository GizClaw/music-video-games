# @gizclaw/mvg-games

Embeddable rhythm games. Install the tarball from a GitHub Release together with `@gizclaw/mvg-core` (these packages are not published to GitHub Packages or npm). The GitHub Pages site mounts the same entry.

```sh
npm install \
  https://github.com/GizClaw/music-video-games/releases/download/v0.1.0/gizclaw-mvg-core-0.1.0.tgz \
  https://github.com/GizClaw/music-video-games/releases/download/v0.1.0/gizclaw-mvg-games-0.1.0.tgz
```

```html
<div id="game" style="height: 100vh"></div>
<script type="module">
  import { mountSpectrumSlide } from "@gizclaw/mvg-games";
  mountSpectrumSlide("#game");
</script>
```

`mountSpectrumSlide` fills the element with the canvas, chart and HUD. Pass `audio`, `start`, `play`, `auto`, or `backHref` when the host is not using the page query string. Shared pieces (audio clock, glow sprite, post shader, catalog audio URL) stay at `@gizclaw/mvg-games/kit.js`.

## Slide Down the Spectrum

The chart is built in the package from `src/spectrum/analysis.json` (beats, onsets, aligned lyrics). `mvg-video --work spectrum-slide game-data` still writes `aigc/songs/music/stem-institute/en-us/spectrum-slide/game/analysis.json`, which is a link to that file. Notes run every other beat from 4 s to the drop, then every beat, with half-beat notes on strong off-beat onsets in choruses, the bridge and the outro. Note angles follow seeded per-bar motifs capped by how far the photon can turn before the next note; γ gates (a full ring with one opening) land on chart downbeats in the dense sections. The song clock is `audio.currentTime` smoothed against `performance.now()`, with a player-adjustable offset (`[` and `]`) kept in local storage. `?start=SECONDS` begins mid-song, `?play` starts without the title card and `?auto` steers automatically for screenshots.

The Pages page at `aigc/.../spectrum-slide/game/index.html` is only a host: it calls `mountSpectrumSlide`.
