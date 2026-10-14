# @gizclaw/mvg-games

A game lives at `aigc/<work>/game/` beside the song's video choreography and
reuses its scenes, colours and timing. `npm run build` turns every
`game/index.html` into a page at the same path on the GitHub Pages site. Shared
runtime pieces (audio clock, glow sprite, post shader, catalog audio URL) are in
`@gizclaw/mvg-games/kit.js`.

## Slide Down the Spectrum

`aigc/songs/music/stem-institute/en-us/spectrum-slide/game/` turns the song into
a browser rhythm game that reuses the video's tunnel rings, star streaks, band
colours and lyric word colours. It streams the published catalog audio and
bundles the trimmed `analysis.json` written by `mvg-video game-data`. The chart
is generated from the analysis on load: notes every other beat from 4 s to the
drop, then every beat, with half-beat notes on strong off-beat onsets in
choruses, the bridge and the outro. Note angles follow seeded per-bar motifs
capped by how far the photon can turn before the next note; γ gates (a full ring
with one opening) land on chart downbeats in the dense sections. The song clock
is `audio.currentTime` smoothed against `performance.now()`, with a
player-adjustable offset (`[` and `]`) kept in local storage. `?start=SECONDS`
begins mid-song, `?play` starts without the title card and `?auto` steers
automatically for screenshots.
