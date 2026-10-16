export const SECTIONS = {
  drop: 6.11,
  verse1: 6.0,
  pre: 34.46,
  chorus1: 42.88,
  verse2: 58.8,
  bridge: 89.22,
  chorus2: 101.7,
  outro: 116.89,
  end: 125.82,
};
export const ORDER = ["verse1", "pre", "chorus1", "verse2", "bridge", "chorus2", "outro"];

/** Glow colour and caption for every bone group the song names. */
export const BONES = {
  skull: { name: "SKULL", color: "#6fe3ff" },
  ribs: { name: "RIBS", color: "#ff6f93" },
  spine: { name: "SPINE", color: "#b48cff" },
  clavicle: { name: "CLAVICLE", color: "#ffd25a" },
  femur: { name: "FEMUR", color: "#7cff8a" },
  pelvis: { name: "PELVIS", color: "#ffa95a" },
  joint: { name: "JOINTS", color: "#ff9a3d" },
};
export const LIGAMENT = "#ffe58a";
export const MUSCLE = "#ff4d5e";
export const COUNT = "#ffe14a";

export const VERSE1 = { count: 1, frame: 2, skull: 3, ribs: 4, column: 5, stack: 6, clavicles: 7, link: 8 };
export const PRE = { support: 9, name: 10 };
/** First cue of each chorus: 206, joints, four names, femur, 206, support-protect-move. */
export const CHORUSES = [11, 30];
export const VERSE2 = { femur: 17, longest: 18, joint: 19, joints: 20, ligaments: 21, tendons: 22, living: 23, muscles: 24 };
export const BRIDGE = [
  { cue: 25, q: "WHAT GUARDS THE BRAIN?", a: "THE SKULL!", word: "skull", bone: "skull" },
  { cue: 26, q: "WHAT SHIELDS THE CHEST?", a: "THE RIBS!", word: "ribs", bone: "ribs" },
  { cue: 27, q: "WHAT STACKS THROUGH THE BACK?", a: "VERTEBRAE!", word: "vertebrae", bone: "spine" },
  { cue: 28, q: "WHAT BONE IS IN THE THIGH?", a: "THE FEMUR!", word: "femur", bone: "femur" },
  { cue: 29, q: "COUNT THE ADULT SKELETON!", a: "206!", word: "two", bone: "all" },
];
export const OUTRO = { framework: 36, count: 37 };

/**
 * ASR packed these words together or ran them late; times from the vocal stem.
 * The bridge answers come about half a beat after each question.
 */
export const RETIME = {
  3: [13.44, 13.66, 13.9, 14.38, 14.53, 14.82],
  4: [15.26, 15.46, 15.66, 15.9, 16.32, 16.52, 16.78, 17.02, 17.2, 17.64],
  8: [30.9, 31.29, 31.78, 32.02, 32.24, 32.66, 33.11],
  13: [49.02, 49.34, 50.26, 50.8],
  14: [51.24, 51.46, 51.58, 51.68, 51.88],
  17: [59.44, 59.68, 60.17, 60.37, 60.52, 61.05, 61.34, 61.92, 62.12],
  19: [66.6, 66.82, 67.3, 67.53, 67.68, 68.14, 68.65, 69.13, 69.53],
  20: [70.0, 70.44, 70.88, 71.34, 71.78, 72.0],
  25: [89.58, 90.06, 90.54, 90.72, 91.24, 91.42],
  26: [91.92, 92.26, 92.56, 92.78, 92.98, 93.2, 93.36],
  27: [93.68, 93.92, 94.12, 94.32, 94.5, 94.96],
  28: [95.66, 95.88, 96.2, 96.34, 96.5, 96.76, 97.04, 97.22],
  29: [97.68, 97.9, 98.1, 98.54, 100.1, 100.5, 101.06],
  32: [107.9, 108.24, 109.2, 109.7],
  33: [110.18, 110.4, 110.53, 110.66, 110.86],
  36: [118.12, 118.6, 119.98, 120.44],
  37: [121.56, 122.2, 123.13, 123.56, 124.0],
};
