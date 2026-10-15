export const SECTIONS = {
  drop: 8.17,
  verse1: 8.17,
  prechorus: 32.83,
  chorus1: 44.42,
  break: 63.74,
  verse2: 69.45,
  bridge: 92.35,
  chorus2: 106.64,
  outro: 126.68,
  end: 135.99,
};
export const ORDER = ["verse1", "prechorus", "chorus1", "break", "verse2", "bridge", "chorus2", "outro"];

export const TYPES = {
  incisor: { name: "INCISORS", verb: "CUT", color: "#3dd8ff", count: 8 },
  canine: { name: "CANINES", verb: "TEAR", color: "#b48cff", count: 4 },
  premolar: { name: "PREMOLARS", verb: "CRUSH", color: "#ffc23d", count: 8 },
  molar: { name: "MOLARS", verb: "GRIND", color: "#6bff8f", count: 12 },
};
export const TYPE_ORDER = ["incisor", "canine", "premolar", "molar"];

/** Per quadrant from the midline: type, crown width, height and depth in mm. */
export const PERMANENT = {
  upper: [["incisor", 8.5, 10.5, 7], ["incisor", 6.5, 9, 6], ["canine", 7.5, 10, 8], ["premolar", 7, 8.5, 9], ["premolar", 6.5, 7.5, 9], ["molar", 10, 7.5, 11], ["molar", 9, 7, 11], ["molar", 8.5, 6.5, 10]],
  lower: [["incisor", 5, 9, 6], ["incisor", 5.5, 9.5, 6.3], ["canine", 7, 11, 7.5], ["premolar", 7, 8.5, 7.5], ["premolar", 7, 8, 8], ["molar", 11, 7.5, 10.5], ["molar", 10.5, 7, 10], ["molar", 10, 7, 9.5]],
};
/** The primary set has no premolars: two incisors, a canine and two molars per quadrant. */
export const PRIMARY = {
  upper: [["incisor", 6.5, 6, 5], ["incisor", 5.2, 5.6, 4], ["canine", 7, 6.5, 7], ["molar", 7.3, 5.2, 8.5], ["molar", 8.8, 5.7, 10]],
  lower: [["incisor", 4.2, 5, 4], ["incisor", 4.6, 5.2, 4], ["canine", 5.8, 6, 5.5], ["molar", 7.8, 6, 7], ["molar", 9.8, 5.5, 8.7]],
};

export const VERSE1 = { twenty: 1, jobs: 3, replace: 4, full: 5, shapes: 6, roll: 7, start: 8 };
/** Pre-chorus and bridge lines: cue, the types they name and their action words. */
export const TEAMS = [
  [9, ["incisor"], ["cut"]], [10, ["canine"], ["tear"]], [11, ["premolar", "molar"], ["crush", "grind"]],
  [28, ["incisor"], ["cut"]], [29, ["canine"], ["tear"]], [30, ["premolar", "molar"], ["crush", "grind"]],
];
export const FOUR = 12;
/** First cue of each chorus: chomp, twenty-first, replacement, cut-tear-crush-grind, every, chomp, totals. */
export const CHORUSES = [13, 32];
export const VERSE2 = { counts: [20, 21, 22, 23], sum: 24, total: 25, brush: 26, clean: 27 };
export const COUNT_LINE = 31;
export const OUTRO = { primary: 39, checked: 40 };

/** ASR packed or misplaced these words; times from the vocal stem. */
export const RETIME = {
  3: [15.96, 16.14, 16.43, 16.67, 17.3, 17.54, 17.89, 18.18],
  5: [21.52, 21.74, 22.22, 22.8, 23.1, 23.52],
  10: [36.02, 36.9, 37.25, 37.42, 37.6, 38.18],
  11: [38.88, 39.72, 40.42, 40.99],
  18: [59.03, 59.39, 59.76, 60.12, 60.36],
  20: [69.68, 70.16, 70.86, 71.04, 71.22, 71.94],
  23: [78.3, 78.71, 79.1, 79.46, 79.62, 80.5],
  25: [83.88, 84.84, 85.0, 85.16, 85.5, 85.81, 86.03],
  28: [92.4, 92.62, 92.8, 93.24, 94.48],
  29: [95.36, 95.56, 95.74, 96.08, 97.68],
  32: [106.95, 107.32, 107.7, 108.04, 108.28],
  35: [113.95, 114.66, 115.38, 116.08],
  37: [119.81, 120.17, 120.55, 120.92, 121.12],
};
