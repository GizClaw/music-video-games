/** Section boundaries for Frog Hop Stop, matching the song video. */
export const SECTIONS = {
  drop: 8.48,
  verse1: 12.79,
  chorus1: 32.29,
  verse2: 51.63,
  chorus2: 70.87,
  bridge: 90.35,
  chorus3: 106.48,
  outro: 124.23,
  end: 130.9,
};

/** First cue of each chorus: ribbits and hop, bend and stop, ska jumps, spring, soft landing. */
export const CHORUSES = [8, 19, 28];
/** "One, two, freeze beside your spot": no presses from "freeze" until "Breathe". */
export const FREEZE_CUE = 26;

/**
 * Word starts read off the vocal stem where the ASR alignment slipped (the
 * same fixes as the music video).
 */
export const RETIME = {
  8: [32.68, 33.34, 33.92, 34.29, 34.87],
  28: [106.87, 107.53, 108.11, 108.48, 109.06],
  21: { 3: 79.06, 4: 79.44, 5: 80.09 },
  30: { 3: 114.52, 4: 114.9, 5: 115.55 },
  18: { 1: 67.56, 2: 67.76 },
  15: { 0: 58.28, 1: 58.48 },
};

export const COLORS = { hop: "#3fc84a", big: "#ffb000", hold: "#8e5cff", stop: "#ff3d5a", ribbit: "#2fb8f0" };

/** Lyric words that pick up a colour. */
export const WORD_COLORS = {
  ribbit: COLORS.ribbit,
  hop: COLORS.hop,
  hops: COLORS.hop,
  leap: COLORS.hop,
  hey: COLORS.big,
  hooray: COLORS.big,
  bend: COLORS.hold,
  low: COLORS.hold,
  stop: COLORS.stop,
  freeze: COLORS.stop,
};
