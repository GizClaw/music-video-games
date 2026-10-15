export const SECTIONS = {
  drop: 12.49,
  verse1: 12.49,
  pre: 37.5,
  chorus1: 50.04,
  verse2: 71.12,
  breakdown: 92.86,
  bridge: 100.1,
  chorus2: 115.91,
  outro: 136.35,
  end: 145.57,
};
export const ORDER = ["verse1", "pre", "chorus1", "verse2", "breakdown", "bridge", "chorus2", "outro"];

/** Muscle groups: caption and colour. */
export const MUSCLES = {
  biceps: { name: "BICEPS", color: "#ff4f6d" },
  triceps: { name: "TRICEPS", color: "#4fc3ff" },
  deltoid: { name: "DELTOIDS", color: "#ffb03d" },
  abs: { name: "ABS", color: "#ffe14a" },
  quads: { name: "QUADRICEPS", color: "#7cff6b" },
  hams: { name: "HAMSTRINGS", color: "#c08cff" },
  calves: { name: "CALVES", color: "#3dffd0" },
};
export const CONTRACT = "#ff6a4f";
export const RELAX = "#7fd8ff";
export const TENDON = "#ffffff";

export const VERSE1 = { bend: 1, folds: 2, straighten: 3, control: 4, deltoids: 5, capping: 6, pull: 7, teams: 8 };
export const PRE = { shorter: 9, easing: 10, joints: 11, tendons: 12 };
/** First cue of each chorus: flex-relax-switch, roll call, three names, abs, flex-relax-switch, click. */
export const CHORUSES = [13, 33];
export const VERSE2 = { quads: 19, hams: 20, calves: 21, toes: 22, abs: 23, twist: 24, many: 25, play: 26 };
export const BRIDGE = [
  { cue: 27, q: "ARMS?", words: [["biceps", "biceps"], ["triceps", "triceps"]] },
  { cue: 28, q: "SHOULDERS?", words: [["deltoids", "deltoid"]] },
  { cue: 29, q: "FRONT OF THE THIGH?", words: [["quadriceps", "quads"]] },
  { cue: 30, q: "BACK OF THE THIGH?", words: [["hamstrings", "hams"]] },
  { cue: 31, q: "LOWER LEG?", words: [["calf", "calves"]] },
  { cue: 32, q: "MIDDLE?", words: [["abdominals", "abs"]] },
];
export const OUTRO = { crew: 39, call: 40 };

/**
 * ASR packed these words together or ran them late; times from the vocal stem.
 * The intro's "muscle roll call" is sung at 3.6 s, not after the instrumental, and
 * the bridge starts after an eight-bar break (its first line is not at 92 s).
 */
export const RETIME = {
  0: [1.72, 2.62, 3.64, 4.04, 4.7],
  8: [34.84, 35.23, 35.5, 35.86, 36.1, 36.36, 36.78],
  13: [50.66, 51.02, 51.66, 51.98, 52.32],
  19: [71.72, 72.4, 72.76, 72.9, 73.3, 73.62],
  21: [76.64, 77.07, 77.54, 77.86, 78.18, 78.32, 78.68, 78.98],
  22: [79.64, 79.86, 80.02, 80.3, 80.75, 81.01, 81.21, 81.35, 81.55],
  23: [82.17, 82.95, 83.34, 83.94, 84.14],
  26: [90.18, 90.87, 91.08, 91.4, 91.56, 91.84, 92.12],
  27: [100.4, 101.4, 102.08],
  28: [102.92, 103.68],
  29: [104.7, 104.94, 105.04, 105.16, 105.36],
  30: [106.04, 106.24, 106.36, 106.48, 106.98],
  31: [108.0, 108.32, 108.92, 109.34],
  32: [109.62, 111.26],
  33: [116.52, 117.06, 117.52, 117.86, 118.18],
  35: [121.7, 122.48, 123.12, 123.8],
  37: [127.08, 127.4, 128.08, 128.42, 128.74],
  39: [137.3, 137.98, 138.58, 139.24],
};
