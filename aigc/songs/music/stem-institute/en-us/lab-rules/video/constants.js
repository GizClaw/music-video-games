export const SECTIONS = {
  drop: 5.27,
  warmup: 5.27,
  verse1: 12.64,
  prechorus: 30.04,
  chorus1: 37.42,
  verse2: 50.6,
  bridge: 72.74,
  chorus2: 82.22,
  outro: 98.03,
  end: 114.37,
};
export const ORDER = ["warmup", "verse1", "prechorus", "chorus1", "verse2", "bridge", "chorus2", "outro"];

export const OK = "#3dff8a";
export const NO = "#ff4f5e";
export const ACCENT = "#ffd23f";

/**
 * One rule per sung line: the prop that pops in, the checklist title, whether
 * it gets a ✓ or a ✗, and the word the stamp lands on ([word, nth] when the
 * prefix also starts an earlier word).
 */
export const RULES = [
  { cue: 1, prop: "goggles", title: "GOGGLES ON", ok: true, stamp: "on" },
  { cue: 2, prop: "gloves", title: "GLOVES ON", ok: true, stamp: "smart" },
  { cue: 3, prop: "hair", title: "TIE LONG HAIR BACK", ok: true, stamp: "away" },
  { cue: 4, prop: "books", title: "CLEAR THE BENCH", ok: true, stamp: "today" },
  { cue: 5, prop: "steps", title: "READ EVERY STEP", ok: true, stamp: "begin" },
  { cue: 6, prop: "listen", title: "LISTEN", ok: true, stamp: ["in", 1] },
  { cue: 7, prop: "food", title: "NO FOOD OR DRINK", ok: false, stamp: "drink" },
  { cue: 8, prop: "shoe", title: "WALK, DON'T RUN", ok: false, stamp: "run" },
  { cue: 9, prop: "hand", title: "ASK BEFORE YOU ACT", ok: true, stamp: "ask" },
  { cue: 17, prop: "mouth", title: "NEVER TASTE", ok: false, stamp: "taste" },
  { cue: 18, prop: "fumes", title: "NEVER SNIFF", ok: false, stamp: "sniff" },
  { cue: 19, prop: "bottle", title: "LABEL & CLOSE IT", ok: true, stamp: "closed" },
  { cue: 20, prop: "tongs", title: "ONLY CHOSEN TOOLS", ok: true, stamp: "chose" },
  { cue: 21, prop: "spill", title: "SPILL? TELL AN ADULT", ok: true, stamp: "away" },
  { cue: 22, prop: "cracked", title: "CRACKED GLASS? REPORT", ok: true, stamp: "glass" },
  { cue: 23, prop: "sponge", title: "CLEAN YOUR STATION", ok: true, stamp: "station" },
  { cue: 24, prop: "sink", title: "WASH BOTH HANDS", ok: true, stamp: "investigation" },
];
/** "Careful science protects every fact": the whole bench takes a bow. */
export const PROTECTS = 10;
/** First line of each chorus: check-check, goggles/clock, taste/smell, hand, safe and sound, look around. */
export const CHORUSES = [11, 30];
/** Bridge call-and-response: question line, prop, question card, answer stamp and its first word. */
export const BRIDGE = [
  { cue: 25, prop: "goggles", q: "GOGGLES?", a: "ON!", word: "on", ok: true },
  { cue: 26, prop: "hair", q: "LONG HAIR?", a: "TIED!", word: "tied", ok: true },
  { cue: 27, prop: "hand", q: "NEED SOME HELP?", a: "HAND UP!", word: "hand", ok: true },
  { cue: 28, prop: "mouth", q: "TASTE OR SMELL?", a: "NO, NO, NO!", word: "no", ok: false },
  { cue: 29, prop: "spill", q: "SPILL OR BREAKAGE?", a: "TELL!", word: "tell", ok: true },
];
export const OUTRO = { start: 36, rock: 37 };

/**
 * Word starts from the vocal stem where the ASR packed neighbours onto one
 * instant (the do/not pairs, "the clock", "or smell", "need" after "tied") or
 * placed chorus one's "check, check" a second early.
 */
export const RETIME = {
  2: [15.24, 15.52, 15.64, 15.78, 16.28, 16.48, 16.62, 16.79],
  7: [26.1, 26.3, 26.66, 26.84, 27.09, 27.2, 27.36, 27.78],
  11: [37.89, 38.15, 38.47, 38.98, 39.53],
  12: [40.03, 40.59, 41.05, 41.31, 41.43],
  13: [42.12, 42.25, 42.59, 43.19, 43.31, 43.61],
  14: [44.28, 44.55, 44.75, 45.11, 45.29, 45.47, 45.79],
  18: [57.42, 57.86, 58.12, 58.24, 58.48, 58.81, 58.97],
  20: [61.71, 61.89, 62.2, 62.55, 62.69, 63.16],
  21: [63.75, 63.97, 64.09, 64.55, 64.65, 64.73, 65.07, 65.25],
  23: [67.99, 68.2, 68.39, 68.58, 69.01, 69.3, 69.46],
  27: [75.35, 75.63, 75.81, 76.11, 76.44, 76.89],
  28: [77.41, 77.79, 77.89, 78.49, 78.77, 79.1],
  31: [87.46, 88.01, 88.46, 88.73, 88.87],
  32: [89.55, 89.69, 90.05, 90.61, 90.75, 91.03],
};
