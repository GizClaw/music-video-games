# @gizclaw/mvg-games

Embeddable rhythm games. Install the tarball from a GitHub Release together with `@gizclaw/mvg-core`. Deploy handles subsequent publication to the TOS npm registry. The universe hub on GitHub Pages mounts the same entry; there are no per-game pages. Use a bundler such as Vite to resolve the npm imports and packaged chart JSON.

```sh
# Set this to an actual UTC snapshot tag from the Releases page.
release_tag=vYYYYMMDD-HHMMSS
npm install \
  "https://github.com/GizClaw/music-video-games/releases/download/${release_tag}/gizclaw-mvg-core-0.1.0.tgz" \
  "https://github.com/GizClaw/music-video-games/releases/download/${release_tag}/gizclaw-mvg-games-0.2.0.tgz"
```

```html
<div id="game" style="height: 100vh"></div>
<script type="module">
  import { mountSpectrumSlide } from "@gizclaw/mvg-games";
  mountSpectrumSlide("#game");
</script>
```

`mountSpectrumSlide`, `mountPlanetParade` and `mountBinaryBoogie` fill the element with the canvas, chart and HUD. Pass `audio`, `start`, `play`, `auto`, or `backHref` when the host is not using the page query string. Shared pieces (audio clock, glow sprite, post shader, catalog audio URL) stay at `@gizclaw/mvg-games/kit.js`. `@gizclaw/mvg-games/sfx.js` synthesises the interface and game sounds with WebAudio (no files): call `sfx.unlock()` in a user gesture, then `hover`, `click`, `select`, `slide`, `enter`, `back`, `warp`, `gate`, `hit`, `chip`, `laser`, `boom`, `stomp`, `wrong`, `miss`, `collect` and friends. Pitched sounds climb a C major pentatonic, and the site-wide mute (`mvg-universe-muted` in local storage) silences them. Both games and the universe hub use the shared `sfx` instance; the games stay silent in their title-screen demo.

Phones: `@gizclaw/mvg-games/mobile.js` keeps play from turning into page gestures (`lockGestures` blocks long-press menus, pinch and double-tap zoom, pull-to-refresh and edge swipes), turns the back button into a pause (`backGuard` pushes a same-URL history entry while playing; a second back leaves), keeps the screen awake while a song plays (`wakeLock`), and on touch screens starts fullscreen and asks for landscape (`goFullscreen`) and buzzes on hits (`buzz`). Both games use them; the universe hub locks gestures and, when it pushed the game route itself, leaves a game by stepping back over the guard entry so no stale game route is left in history. On touch screens (or with `?simple`) Planet Parade plays as a one-button game: rings close on a big tap button, a tap anywhere hits the next open note whatever its planet (so planets are still collected), tapping more than a window early breaks the combo, and the planet tags and key lane are hidden. It shows only planet numbers on small screens, and on a tall screen raises the camera and marches the planets in two rows (1–4 behind the Sun, 5–8 in front).

## Slide Down the Spectrum

The chart is built in the package from `src/spectrum/analysis.json` (beats, onsets, aligned lyrics). `mvg-video --work spectrum-slide game-data` still writes `aigc/songs/music/stem-institute/en-us/spectrum-slide/game/analysis.json`, which is a link to that file. Notes run every other beat from 4 s to the drop, then every beat, with half-beat notes on strong off-beat onsets in choruses, the bridge and the outro. Note angles follow seeded per-bar motifs capped by how far the photon can turn before the next note; γ gates (a full ring with one opening) land on chart downbeats in the dense sections. The song clock is `audio.currentTime` smoothed against `performance.now()`, with a player-adjustable offset (`[` and `]`) kept in local storage. `?start=SECONDS` begins mid-song, `?play` starts without the title card and `?auto` steers automatically for screenshots.

## Planet Parade

A roll call: the chart is built from `src/planet/analysis.json`, linked from `aigc/songs/music/stem-institute/en-us/planet-parade/game/analysis.json` the same way. The planets circle the Sun on faint orbits in their own colours (an orbit lights up while a ring closes on its planet) and step out into a line for the lineup, both choruses and the finale (`PARADES` in `src/planet/song.js`). A note is a ring closing on a planet, Pluto or the Sun; hit it by clicking the body or pressing its number (`1`–`8` for Mercury to Neptune, `9` for Pluto, Space or `0` for the Sun). Every sung planet name is a note on that planet, "Pluto" a note on Pluto, and sun, march, hey, hooray and eight are notes on the Sun; all snap to the half-beat grid, pushed half a beat on when two land together. Filler notes keep the beat (every beat in the lineup, choruses and finale, every other beat in the verses and bridge): in a line about one planet they repeat it, elsewhere they march through the planets in order, and in the bridge they fall on the Sun. A key lane above the lyrics slides the next 2.4 s of keys into a NOW box, and the due planet's tag grows into a key cap. Hitting the wrong body while a note is open breaks the combo. `?start`, `?play` and `?auto` behave as in Slide Down the Spectrum; the offset key is `planet-game-offset`.

## Binary Boogie

An endless binary blaster paced for people. Four switches are the 8, 4, 2 and 1 bits (keys `A S D F` or the on-screen switches; Space or the red switch clears them to 0, and they clear themselves a moment after each shot), and the cannon stands on a 0–15 number line at the value they spell. One pixel invader at a time carries a number and hangs over its place on the line: it appears on a beat and marches down one step per beat, and the beat after the switches spell its number it is shot; if it reaches the line first it gets through. The next appears two beats after the last is shot or gets through, skipping a number the switches already spell.

Until three seconds before the first chorus the invaders are lessons: they come down over 16 beats and then wait on the line for ever, the first eight (1, 2, 3, 8, 4, 5, 6, 7) carry a tip above the switches, the switches that still need flipping blink and the answer shows under the invader; drills without tips follow. After that an invader takes 20 beats to reach the line, one beat fewer for every 24 beats of play down to 4; its bits show under it halfway down, and it flashes red for its last 2 beats. Each invader that gets through costs one of three lives (a boss gives one back, up to five); the game ends when they run out. The song never ends: on the last whole bar before its end it jumps back to the first chorus and the next pass begins, with verse 2, the bridge and the bosses replaying. Choruses and the outro walk 0 to 15 in Gray code (one flip each) with a 15 boss when a chorus's "boogie" falls during the march; verse 2 counts 8 to 15; the bridge clears to 0 and lights 8, 12, 14, 15, then 11. Every invader shot lights its number in the 0–15 strip. Beats are counted across passes so invaders and timers carry over the jump. `?start`, `?play` and `?auto` behave as in the other games, and the offset key is `binary-game-offset`.
