# @gizclaw/mvg-games

The complete music universe and its rhythm games, ready to mount in a host page. The SDK includes the opening stage, galaxy and planet catalog, 3D scenes, music crossfades, Chinese/English interface, styles and game loaders. GitHub Pages uses this same SDK entry. Install the tarball from a GitHub Release together with `@gizclaw/mvg-core`. Deploy handles subsequent publication to the TOS npm registry. Use a bundler such as Vite to resolve the npm imports, packaged JSON and `?raw` assets.

```sh
# Set this to an actual UTC snapshot tag from the Releases page.
release_tag=vYYYYMMDD-HHMMSS
npm install \
  "https://github.com/GizClaw/music-video-games/releases/download/${release_tag}/gizclaw-mvg-core-0.1.0.tgz" \
  "https://github.com/GizClaw/music-video-games/releases/download/${release_tag}/gizclaw-mvg-games-0.4.0.tgz"
```

## Complete game entrance

```html
<div id="games" style="height: 100vh"></div>
<script type="module">
  import { mountUniverse } from "@gizclaw/mvg-games/universe.js";
  const games = mountUniverse("#games");

  // games.open("stem-institute");
  // games.play("binary-boogie", { start: 31, auto: true });
  // games.destroy(); // call when the host view unmounts
</script>
```

`mountUniverse` and the default `SERIES` catalog are also exported from `@gizclaw/mvg-games`. The `universe.js` entry loads individual games on demand. Give the target a height; the universe fills that container and installs its styles automatically. No files from the repository's `site/` directory are needed. Music streams from the catalog CDN, as it does in the individual games.

Options:

| Option | Default | Behavior |
| --- | --- | --- |
| `series` | `SERIES` | Replace the bundled galaxies and works, or pass a subset of `SERIES`. |
| `lang` | Saved choice, then `"zh"` | Initial interface language (`"zh"` or `"en"`). |
| `routing` | `true` | Use `#/<series>/<work>/play` routes and browser back. Set `false` when the host owns the URL. |
| `manageDocument` | `false` | Update the document title and language. The Pages host enables this. |

`open(id)` flies to a galaxy or selects a song; `play(id, { start, auto, play })` opens a playable song. Song ids may be qualified as `<series>/<work>`. Universe navigation keys work while focus is inside the container; clicking it focuses the container. A full-page host can give the target `tabindex="0" autofocus`, as the Pages host does. `destroy()` stops the hub's animation and music, disposes its scene, removes listeners and mounted games, and restores the container's original attributes. Without WebGL the hub displays the catalog; `open` and `play` report that WebGL is unavailable.

The catalog source is `src/universe/universe.json`; `npm run universe:catalog` in the repository regenerates it. Planet looks and game loaders live in `src/universe/catalog.js`.

## Individual games

```html
<div id="game" style="height: 100vh"></div>
<script type="module">
  import { mountSpectrumSlide } from "@gizclaw/mvg-games";
  mountSpectrumSlide("#game");
</script>
```

`mountSpectrumSlide`, `mountPlanetParade`, `mountBinaryBoogie` and `mountPrimeTime` fill the element with the canvas, chart and HUD. Pass `audio`, `start`, `play`, `auto`, or `backHref` when the host is not using the page query string. Every game speaks Chinese and English: `lang: "zh"` or `"en"` picks one, otherwise the universe hub's saved choice (`mvg-universe-lang` in local storage) is used, falling back to Chinese; the hub passes its current language when it mounts a game. Lyrics stay in the song's own language. Shared pieces (audio clock, glow sprite, post shader, catalog audio URL) stay at `@gizclaw/mvg-games/kit.js`. `@gizclaw/mvg-games/sfx.js` synthesises the interface and game sounds with WebAudio (no files): call `sfx.unlock()` in a user gesture, then `hover`, `click`, `select`, `slide`, `enter`, `back`, `warp`, `gate`, `hit`, `chip`, `laser`, `boom`, `stomp`, `wrong`, `miss`, `collect`, `press`, `stamp` and friends. Pitched sounds climb a C major pentatonic, and the site-wide mute (`mvg-universe-muted` in local storage) silences them. Both games and the universe hub use the shared `sfx` instance; the games stay silent in their title-screen demo.

Phones: `@gizclaw/mvg-games/mobile.js` keeps play from turning into page gestures (`lockGestures` blocks long-press menus, pinch and double-tap zoom, pull-to-refresh and edge swipes), turns the back button into a pause (`backGuard` pushes a same-URL history entry while playing; a second back leaves), keeps the screen awake while a song plays (`wakeLock`), and on touch screens starts fullscreen and asks for landscape (`goFullscreen`) and buzzes on hits (`buzz`). Both games use them; the universe hub locks gestures and, when it pushed the game route itself, leaves a game by stepping back over the guard entry so no stale game route is left in history. On touch screens (or with `?simple`) Planet Parade plays as a one-button game: rings close on a big tap button, a tap anywhere hits the next open note whatever its planet (so planets are still collected), tapping more than a window early breaks the combo, and the planet tags and key lane are hidden. It shows only planet numbers on small screens, and on a tall screen raises the camera and marches the planets in two rows (1–4 behind the Sun, 5–8 in front).

## Slide Down the Spectrum

The chart is built in the package from `src/spectrum/analysis.json` (beats, onsets, aligned lyrics). `mvg-video --work spectrum-slide game-data` still writes `aigc/songs/music/stem-institute/en-us/spectrum-slide/game/analysis.json`, which is a link to that file. Notes run every other beat from 4 s to the drop, then every beat, with half-beat notes on strong off-beat onsets in choruses, the bridge and the outro. Note angles follow seeded per-bar motifs capped by how far the photon can turn before the next note; γ gates (a full ring with one opening) land on chart downbeats in the dense sections. The song clock is `audio.currentTime` smoothed against `performance.now()`, with a player-adjustable offset (`[` and `]`) kept in local storage. `?start=SECONDS` begins mid-song, `?play` starts without the title card and `?auto` steers automatically for screenshots.

## Planet Parade

A roll call: the chart is built from `src/planet/analysis.json`, linked from `aigc/songs/music/stem-institute/en-us/planet-parade/game/analysis.json` the same way. The planets circle the Sun on faint orbits in their own colours (an orbit lights up while a ring closes on its planet) and step out into a line for the lineup, both choruses and the finale (`PARADES` in `src/planet/song.js`). A note is a ring closing on a planet, Pluto or the Sun; hit it by clicking the body or pressing its number (`1`–`8` for Mercury to Neptune, `9` for Pluto, Space or `0` for the Sun). Every sung planet name is a note on that planet, "Pluto" a note on Pluto, and sun, march, hey, hooray and eight are notes on the Sun; all snap to the half-beat grid, pushed half a beat on when two land together. Filler notes keep the beat (every beat in the lineup, choruses and finale, every other beat in the verses and bridge): in a line about one planet they repeat it, elsewhere they march through the planets in order, and in the bridge they fall on the Sun. A key lane above the lyrics slides the next 2.4 s of keys into a NOW box, and the due planet's tag grows into a key cap. Hitting the wrong body while a note is open breaks the combo. `?start`, `?play` and `?auto` behave as in Slide Down the Spectrum; the offset key is `planet-game-offset`.

## Binary Boogie

An endless binary blaster paced for people. Four switches are the 8, 4, 2 and 1 bits (keys `A S D F` or the on-screen switches; Space or the red switch clears them to 0, and they clear themselves a moment after each shot), and the cannon stands on a 0–15 number line at the value they spell. One pixel invader at a time carries a number and hangs over its place on the line: it appears on a beat and marches down one step per beat, and the beat after the switches spell its number it is shot; if it reaches the line first it gets through. The next appears two beats after the last is shot or gets through, skipping a number the switches already spell.

Until three seconds before the first chorus the invaders are lessons: they come down over 16 beats and then wait on the line for ever, the first eight (1, 2, 3, 8, 4, 5, 6, 7) carry a tip above the switches, the switches that still need flipping blink and the answer shows under the invader; drills without tips follow. After that an invader takes 20 beats to reach the line, one beat fewer for every 24 beats of play down to 4; its bits show under it halfway down, and it flashes red for its last 2 beats. Each invader that gets through costs one of three lives (a boss gives one back, up to five); the game ends when they run out. The song never ends: on the last whole bar before its end it jumps back to the first chorus and the next pass begins, with verse 2, the bridge and the bosses replaying. Choruses and the outro walk 0 to 15 in Gray code (one flip each) with a 15 boss when a chorus's "boogie" falls during the march; verse 2 counts 8 to 15; the bridge clears to 0 and lights 8, 12, 14, 15, then 11. Every invader shot lights its number in the 0–15 strip. Beats are counted across passes so invaders and timers carry over the jump. `?start`, `?play` and `?auto` behave as in the other games, and the offset key is `binary-game-offset`.

## Prime Time

Whack-a-prime on the 1–100 board from the music video, charted from `src/prime/analysis.json` (linked from `aigc/songs/music/stem-institute/en-us/prime-time/game/analysis.json`). Only primes pop up, each on a beat; click or tap one while it is up to knock it down and light it gold (Space, `J`, `F`, `K` or `D` knock down the earliest one instead). From the beat after it pops, the tile breathes with the music: on every beat it flashes its brightest, its halo swells and a ring goes out from it. That is its best moment: a hit within 90 ms of one of those beats is PERFECT, within 180 ms GREAT, any other time while it is up GOOD, and a prime that sinks back unhit is a miss. Non-primes never pop up: on their beat their multiplication (`3×7`) rises off the tile and crosses it out. Each chorus's two "Check the line!" sieve on the beat of "line": every multiple of 2 and 3 (chorus 1), 5 and 7 (chorus 2), or 2 and 3 then 5 and 7 (chorus 3) pops and is crossed out in a cascade.

Every number the song sings is a note on the beat nearest its word ("one hundred" is 100; at most two to a beat, a third moves on to the next). Fillers take the beats nobody sings on: every beat in the choruses, bridge and outro, every 2 beats in the intro and verses of the first pass and every beat after, never a number sung within 4 beats. The intro's fillers take turns between primes and non-primes (2, 4, 3, 9, 5, 6, …); after that they are half primes and half non-primes from the section's range. On touch screens the board fills the screen (the score, power, lyric and prime count move to its sides in landscape) and a tile that is up pops out toward the player at about 2.4 times its size, leaning in from the board's edge, so it is big enough for a finger. A tap is matched against where the up tiles are drawn: it counts for the nearest one within 1.25 of its drawn half-widths (1.6 on touch screens), and a tap with nothing up still flashes its tile and ticks.

Until the first chorus the tiles are practice: primes stay up for 5 beats, a tip shows under the board, and nothing drains. After that a missed prime drains the power bar and hits refill it a little; lighting all 25 primes (the bridge sings every one) refills a large share, and the game ends when the power runs out. The song loops from the first chorus like Binary Boogie's with a fresh board; notes are kept in game time (song time plus the passes before), the next pass is charted a pass ahead, and primes stay up for 3 beats on the first pass and 0.4 beat less each pass down to 1.5. `?start`, `?play` and `?auto` behave as in the other games, and the offset key is `prime-game-offset`.
