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
export const ORDER = ["open", "verse1", "chorus1", "verse2", "chorus2", "bridge", "chorus3", "outro"];

export const TITLE = { kicker: "ANIMAL MOVES", line: "FROG HOP STOP", accent: "#3fc84a" };

/** First cue of each chorus: ribbits and hop, bend and stop, ska jumps, spring, soft landing. */
export const CHORUSES = { chorus1: 8, chorus2: 19, chorus3: 28 };

/**
 * Word starts read off the vocal stem where the ASR alignment slipped: the
 * "Ribbit … Hop!" calls of choruses 1 and 3 follow chorus 2's spacing before
 * "Bend", and the second and third "hey" were squashed together.
 */
export const RETIME = {
  8: [32.68, 33.34, 33.92, 34.29, 34.87],
  28: [106.87, 107.53, 108.11, 108.48, 109.06],
  21: { 3: 79.06, 4: 79.44, 5: 80.09 },
  30: { 3: 114.52, 4: 114.9, 5: 115.55 },
  18: { 1: 67.56, 2: 67.76 },
  15: { 0: 58.28, 1: 58.48 },
};

export const COLORS = {
  hop: "#3fc84a",
  ribbit: "#2fb8f0",
  stop: "#ff3d5a",
  hey: "#ff8a00",
  bend: "#8e5cff",
  hooray: "#ffb000",
  leg: "#ff4fa3",
};

/** Lily pads: the big stage pad for the lead, a ring for the crew, stepping pads along the pond. */
export const STAGE = { x: 0, z: 0, r: 1.25 };
export const RING = Array.from({ length: 8 }, (_, i) => {
  const a = Math.PI * (0.18 + (i / 7) * 0.64);
  return [-Math.cos(a) * 3.1, -Math.sin(a) * 1.7 - 0.4];
});
export const CREW_PAD_R = 0.62;
/** Stepping pads the lead leaps along in the verses: [x, z, radius]. */
export const PATH = [[-3.2, 2.2, 0.7], [-1.6, 3.4, 0.62], [0.4, 3.8, 0.66], [2.3, 3.2, 0.62], [3.6, 1.8, 0.7]];
