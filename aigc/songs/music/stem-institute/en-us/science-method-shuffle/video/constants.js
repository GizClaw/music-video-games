export const SECTIONS = {
  drop: 9.07,
  verse1: 9.07,
  pre: 42.14,
  chorus1: 50.65,
  verse2: 70.44,
  bridge: 101.98,
  chorus2: 115.59,
  outro: 134.01,
  end: 152.3,
};
export const ORDER = ["verse1", "pre", "chorus1", "verse2", "bridge", "chorus2", "outro"];

/** The seven method steps, shown on the step track. */
export const STEPS = [
  { name: "QUESTION", color: "#ffd23f" },
  { name: "HYPOTHESIS", color: "#ff9f43" },
  { name: "EXPERIMENT", color: "#ff6b8b" },
  { name: "OBSERVE", color: "#c08cff" },
  { name: "RECORD", color: "#4fc3ff" },
  { name: "ANALYZE", color: "#3de8c0" },
  { name: "CONCLUSION", color: "#7cff6b" },
];

/** The fair test: sunlight is the one tested variable; heights in world units (10 cm) on day 14. */
export const POTS = [
  { label: "SHADE", light: 0.5, height: 0.85 },
  { label: "HALF SUN", light: 0.78, height: 1.4 },
  { label: "FULL SUN", light: 1, height: 1.95 },
];
/** Experiment day at song time: seeds go in during verse 1, the run happens in verse 2. */
export const DAYS = [[41.2, 0], [50.65, 3], [67.4, 6], [70.44, 6], [78.6, 12.4], [SECTIONS.end, 14]];
export const TABLE_DAYS = [3, 6, 9, 12];

export const VERSE1 = { ask: 1, measure: 2, hypothesis: 3, fair: 4, plan: 5, choose: 6, keep: 7, change: 8 };
export const PRE = { measure: 9, repeat: 10 };
/** First cue of each chorus: ask, observe, evidence, shuffle, ask, conclusions. */
export const CHORUSES = { chorus1: 11, chorus2: 30 };
export const VERSE2 = { run: 17, observe: 18, record: 19, tables: 20, analyze: 21, support: 22, conclusion: 23, change: 24 };
/** Bridge call and response: cue, answer word, step. */
export const BRIDGE = [[25, "question", 0], [26, "hypothesis", 1], [27, "experiment", 2], [28, "observation", 3], [29, "conclusion", 6]];
export const OUTRO = { first: 36, last: 37 };

/** Lines whose ASR alignment collapsed or drifted; word times are taken from the vocal stem. */
export const RETIME = {
  // "in the game" stamped on one instant.
  8: [38.08, 38.36, 38.64, 39.39, 40.08, 40.3, 40.5],
  // "Hypothesize!" lit on "Ask!".
  11: [50.63, 51.33, 52.62, 53.0, 53.38],
  // "the plan" stamped on one instant.
  17: [70.57, 70.89, 71.01, 72.66, 73.0, 73.2],
  // "the hypothesis" stamped on one instant.
  22: [90.68, 90.85, 91.05, 91.45, 91.83, 92.03, 93.2, 93.43],
  // Started during the held "drew"; the line is sung from 94.75.
  23: [94.75, 95.0, 95.25, 96.4, 96.68, 97.4, 97.7],
  // "the facts" stamped on one instant.
  24: [98.63, 98.85, 99.07, 99.42, 99.55, 99.66, 100.15, 100.45],
  // "First" sits 0.2 s before the voice.
  25: [102.15, 102.4, 102.6, 103.4, 103.62],
  // "to" is held; "(A conclusion!)" is answered two seconds later.
  29: [110.72, 111.6, 112.2, 114.15, 114.7],
  // "hypothesis" comes after a three-second rest.
  36: [135.75, 139.5, 141.4, 142.5, 142.72],
  // "evidence, conclusion" end at 145.4, not after it.
  37: [143.72, 144.45, 144.95],
};
