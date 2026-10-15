export const SECTIONS = {
  drop: 5.63,
  verse1: 5.63,
  chorus1: 29.55,
  verse2: 39.61,
  chorus2: 63.76,
  verse3: 73.82,
  chorus3: 98.96,
  outro: 110.04,
  end: 120.58,
};
export const ORDER = ["verse1", "chorus1", "verse2", "chorus2", "verse3", "chorus3", "outro"];

/** The seven SI base quantities, their units and symbols (case exactly as written). */
export const UNITS = [
  { quantity: "LENGTH", name: "metre", symbol: "m", color: "#3dc2ff" },
  { quantity: "MASS", name: "kilogram", symbol: "kg", color: "#ff9d3d" },
  { quantity: "TIME", name: "second", symbol: "s", color: "#7cff6b" },
  { quantity: "ELECTRIC CURRENT", name: "ampere", symbol: "A", color: "#ffe14a" },
  { quantity: "THERMODYNAMIC TEMPERATURE", name: "kelvin", symbol: "K", color: "#ff5d5d" },
  { quantity: "AMOUNT OF SUBSTANCE", name: "mole", symbol: "mol", color: "#b48cff" },
  { quantity: "LUMINOUS INTENSITY", name: "candela", symbol: "cd", color: "#ff8fd8" },
];

/** Each unit's report: the cue that names it and the cue whose "symbol" spells it. */
export const REPORTS = [[2, 2], [3, 3], [4, 4], [15, 15], [16, 16], [17, 17], [28, 29]];
export const VERSE1 = { three: 5, measures: [6, 7, 8], march: 9 };
export const VERSE2 = { capitals: 18, uses: [19, 20, 21], six: 22 };
export const VERSE3 = { seven: 29, luminous: 30, last: 31, roll: [32, 33, 34], role: 35 };
/** "Name! Unit! Symbol! …" lines, "Seven bases in a row!" lines and chorus lines that call units by name. */
export const CALLS = [10, 13, 14, 23, 26, 27, 36, 40];
export const ROWS = [11, 24, 37];
export const ROLLS = [12, 25, 38, 39];
export const OUTRO = { checked: 41, zone: 42 };

/**
 * The ASR lost much of this vocal (130 of 190 parts matched): times from the
 * vocal stem's onsets and sibilants, letters spelled one per sung syllable.
 */
export const RETIME = {
  2: [7.1, 7.54, 8.38, 8.86],
  3: [10.66, 11.6, 12.44, 12.92, 13.42],
  4: [14.82, 15.42, 15.96, 16.32],
  7: [20.96, 21.46, 21.88],
  9: [25.0, 25.5, 26.22, 26.76],
  10: [30.02, 30.5, 31.04, 31.44],
  11: [32.06, 32.42, 32.82, 33.18, 33.4],
  12: [34.03, 34.44, 35.06, 35.46],
  13: [36.04, 36.54, 37.04, 37.46],
  14: [38.04, 38.54, 39.04, 39.44],
  17: [47.4, 47.9, 48.14, 48.62, 49.16, 49.6, 49.88, 50.14],
  18: [51.14, 51.4, 51.54, 52.16, 52.66, 52.92],
  21: [58.16, 58.56, 58.76, 59.46, 59.7],
  24: [66.22, 66.6, 67.0, 67.3, 67.64],
  26: [70.28, 70.78, 71.26, 71.6],
  27: [72.26, 72.72, 73.26, 73.66],
  29: [77.84, 78.38, 78.72, 79.06, 79.84, 80.02],
  32: [90.3, 90.72, 91.12],
  33: [92.38, 92.78, 93.1],
  36: [99.44, 99.94, 100.44, 100.84],
  37: [101.46, 101.86, 102.24, 102.56, 102.82],
  39: [105.0, 105.48, 106.0, 106.48],
  40: [107.38, 107.86, 108.34, 108.7],
  41: [110.4, 111.45, 112.05, 112.95, 113.55],
  42: [115.56, 116.04, 116.56, 117.06, 117.58, 119.1],
};
