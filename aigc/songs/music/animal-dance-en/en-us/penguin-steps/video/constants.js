export const SECTIONS = {
  drop: 8.03,
  verse1: 14.02,
  chorus1: 32.08,
  dive: 50.85,
  verse2: 57.35,
  chorus2: 69.62,
  bridge: 86.53,
  glide: 91.9,
  freeze: 94.9,
  dance: 100.43,
  chorus3: 106.8,
  outro: 122.94,
  end: 133.29,
};
export const ICE_ORDER = ["open", "verse1", "chorus1", "verse2", "chorus2", "bridge", "freeze", "dance", "chorus3", "outro"];

export const TITLE = { kicker: "ANIMAL MOVES", lines: ["PENGUIN", "STEP PARTY"], accent: "#2fb8f0" };

/** First cue of each chorus: steps, clap, waddle, flap, hey. */
export const CHORUSES = { chorus1: 8, chorus2: 19, chorus3: 28 };

/**
 * Word starts read off the vocal stem where the ASR alignment slipped: the
 * "Step, step!" calls come late in each chorus (chorus 3 after a wordless
 * chant from 100.4 s), and "Ice lights dim" follows a two-second rest.
 */
export const RETIME = {
  8: [33.1, 33.52, 34.16, 34.5, 35.05, 35.57],
  19: [70.72, 71.08, 71.84, 72.2, 72.54, 73.14],
  28: [107.3, 107.9, 108.62, 108.98, 109.4, 109.94],
  33: [125.92, 126.28, 126.68, 127.24, 127.7, 128.12],
  17: { 4: 65.25, 5: 65.5 },
  27: { 3: 99.9, 4: 100.3 },
};

export const COLORS = {
  ice: "#2fb8f0",
  step: "#00c4e0",
  clap: "#ffb000",
  waddle: "#3fc84a",
  flap: "#ff4fa3",
  hey: "#ff8a00",
  night: "#8e5cff",
  swim: "#1e90f0",
  no: "#ff3d5a",
};

/** Lamp hues cycled around the stage rim. */
export const LAMP_HUES = ["#7ff6ff", "#b18cff", "#ff7ad9", "#9dff6b", "#ffd34d"];

export const STAGE_R = 6;

/** Crew slots on the ice: the lead first, then rows fanning out behind. */
export const SLOTS = [
  [0, 1.3], [-1.2, 0.6], [1.2, 0.6], [-2.35, -0.1], [2.35, -0.1], [-0.6, -0.5], [0.6, -0.5],
  [-1.75, -1.25], [1.75, -1.25], [-2.9, -1.95], [2.9, -1.95], [-0.6, -1.9], [0.6, -1.9],
];
/** Verse slots: the crew steps aside and watches the lead. */
export const SIDE_SLOTS = [
  [0, 1.0], [-2.4, 0.4], [2.4, 0.4], [-3.4, -0.6], [3.4, -0.6], [-2.6, -1.6], [2.6, -1.6],
  [-3.9, -2.3], [3.9, -2.3], [-1.6, -2.8], [1.6, -2.8], [-0.6, -3.3], [0.6, -3.3],
];
export const CREW = { open: 7, chorus2: 9, dance: 13 };
/** Penguin i that wears the chick's grey down. */
export const CHICK = 5;
