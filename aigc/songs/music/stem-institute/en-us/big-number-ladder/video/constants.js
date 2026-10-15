export const SECTIONS = {
  drop: 12.71,
  verse1: 12.72,
  chorus1: 36.42,
  verse2: 56.7,
  chorus2: 82.59,
  bridge: 101.39,
  chorus3: 122.8,
  outro: 145.32,
  end: 164.11,
};
export const ORDER = ["verse1", "chorus1", "verse2", "chorus2", "bridge", "chorus3", "outro"];

/** Short-scale names, one per three zeroes. */
export const NAMES = ["", "THOUSAND", "MILLION", "BILLION", "TRILLION", "QUADRILLION", "QUINTILLION", "SEXTILLION", "SEPTILLION", "OCTILLION", "NONILLION", "DECILLION"];
export const TOP = 33;
export const GOOGOL = 100;

/** Hue per named landing, rising like the key changes. */
export const HUES = ["#ffffff", "#ff4f6d", "#ff8a3d", "#ffc93d", "#c6ff3d", "#3dff8a", "#3dffd8", "#3dc2ff", "#5d7bff", "#9b5cff", "#e05cff", "#ff5cc8"];
export const GOLD = "#ffd36b";

/** Lines that climb three rungs: cue index and the landing (zeroes / 3). */
export const CLIMBS = [
  [2, 1], [4, 2], [6, 3], [8, 4],
  [16, 5], [17, 6], [18, 7], [19, 8], [20, 9], [21, 10], [22, 11],
];
/** "Three zeroes standing in a row" and its siblings: cue index and landing. */
export const ZERO_LINES = [[3, 1], [5, 2], [7, 3], [9, 4]];
export const SHORT_SCALE_CUE = 23;
/** Chorus lines that chant step, name, power, climb. */
export const CHANTS = [10, 11, 15, 24, 25, 29, 36, 37, 41];
export const MORE_ZEROES = [12, 26, 38];
export const ROLL_FIRST = 14;
export const ROLL_REST = 28;
export const BRIDGE = { leap: 30, googol: 31, power: 32, zeroes: 33, bigger: 34, never: 35 };
export const OUTRO = { googol: 42, count: 43 };

/** Lines whose ASR alignment packed several words into one instant; times from the vocal stem. */
export const RETIME = {
  17: [60.0, 60.28, 60.4, 60.62, 61.0],
  21: [72.01, 72.33, 72.37, 72.6, 73.2],
  31: [105.0, 105.15, 105.6, 105.85, 106.15, 106.48, 106.68],
};
