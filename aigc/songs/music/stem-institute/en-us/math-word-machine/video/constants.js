export const SECTIONS = {
  drop: 5.93,
  verse1: 5.93,
  chorus1: 21.85,
  verse2: 34.32,
  chorus2: 50.19,
  verse3: 63.23,
  chorus3: 79.67,
  bridge: 89.86,
  breakdown: 105.17,
  outro: 110.28,
  end: 124.44,
};
export const ORDER = ["verse1", "chorus1", "verse2", "chorus2", "verse3", "chorus3", "bridge", "breakdown", "outro"];

export const TERMS = {
  sum: { name: "SUM", color: "#ffd23f" },
  difference: { name: "DIFFERENCE", color: "#ff8a3d" },
  product: { name: "PRODUCT", color: "#3de8ff" },
  quotient: { name: "QUOTIENT", color: "#b48cff" },
  numerator: { name: "NUMERATOR", color: "#7cff6b" },
  denominator: { name: "DENOMINATOR", color: "#ff5d8f" },
  equation: { name: "EQUATION", color: "#5db8ff" },
  variable: { name: "VARIABLE", color: "#ff6be0" },
};
export const TERM_ORDER = Object.keys(TERMS);

/** Word problems fed to the machine: [cue, word the block goes in on, word the answer comes out on, term, problem, answer]. */
export const PROBLEMS = [
  [2, "add", "sum", "sum", "3 + 4", "7"],
  [3, "subtract", "difference", "difference", "9 − 5", "4"],
  [4, "multiply", "product", "product", "3 × 4", "12"],
  [5, "divide", "quotient", "quotient", "12 ÷ 3", "4"],
  [6, "in", "result", null, "5 + 5", "10"],
  [32, "sum", "adding", "sum", "2 + 6", "8"],
  [33, "difference", "subtracting", "difference", "8 − 3", "5"],
  [34, "product", "multiplying", "product", "2 × 5", "10"],
  [35, "quotient", "dividing", "quotient", "10 ÷ 2", "5"],
];
export const VERSE1 = { clicks: 5, flow: 6, match: 7 };
export const CHORUSES = [
  { start: 8, name: 9, terms: [10, ["sum", "difference", "product", "quotient"]], motion: 11 },
  { start: 18, name: 19, terms: [20, ["numerator", "denominator"]], motion: 21 },
  { start: 28, name: 29, terms: [30, ["equation", "variable"]], motion: 31 },
];
export const FRACTION = { top: 12, mark: 13, bottom: 14, whole: 15, bar: 16, words: 17 };
export const ALGEBRA = { equation: 22, sides: 23, variable: 24, vary: 25, label: 26, gears: 27 };
export const BRIDGE = { fraction: 36, balance: 37 };
export const OUTRO = { align: 38, power: 39 };

/** ASR packed or misplaced these words; times from the vocal stem. */
export const RETIME = {
  7: [18.03, 18.42, 18.62, 18.98, 19.31, 19.59, 19.87],
  15: [41.1, 41.42, 41.82, 42.26, 42.54, 42.88, 43.05],
  23: [66.32, 66.5, 66.65, 66.92, 67.5, 67.66, 67.92],
  24: [68.3, 68.6, 69.49, 70.0, 70.27],
  25: [70.85, 71.15, 71.35, 71.7, 71.85, 72.0, 72.42, 72.62, 72.85],
  28: [79.85, 80.35, 80.75, 81.57, 82.1, 82.75],
  31: [87.58, 87.85, 88.22, 88.6, 88.72, 88.9, 89.27],
  36: [99.08, 99.98, 100.3],
  37: [101.4, 102.35, 103.15, 104.27, 104.6],
};
