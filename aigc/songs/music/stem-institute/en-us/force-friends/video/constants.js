export const SECTIONS = {
  drop: 15.99,
  verse1: 15.99,
  chorus1: 48.99,
  verse2: 71.91,
  chorus2: 108.48,
  bridge: 128.13,
  outro: 148.96,
  end: 154.89,
};
export const ORDER = ["verse1", "chorus1", "verse2", "chorus2", "bridge", "outro"];

export const FORCES = [
  { id: "gravity", name: "GRAVITY", word: "gravity", call: "DOWN!", color: "#ff5d5d", contact: false, def: "masses pull toward each other" },
  { id: "friction", name: "FRICTION", word: "friction", call: "SLOW!", color: "#ffa53d", contact: true, def: "opposes sliding where surfaces meet" },
  { id: "elastic", name: "ELASTIC FORCE", word: "elastic", call: "BOING!", color: "#7cff6b", contact: true, def: "a squashed spring pushes back" },
  { id: "buoyancy", name: "BUOYANCY", word: "buoyancy", call: "FLOAT!", color: "#3dc8ff", contact: true, def: "liquid or gas pushes up" },
  { id: "magnetism", name: "MAGNETISM", word: "magnetism", call: "CLICK!", color: "#c77dff", contact: false, def: "attract or repel at a distance" },
  { id: "drag", name: "AIR DRAG", word: "air", call: "WHOOSH!", color: "#ffe14a", contact: true, def: "air pushes against motion" },
];

/** Close-ups: cue index that brings each station to the front. */
export const CLOSEUPS = [[2, 0], [4, 1], [6, 2], [9, 1], [16, 3], [18, 4], [20, 5], [22, 1], [33, 5]];
/** Cues that pull back to the whole park. */
export const WIDE = [8, 34];
/** Verse demos: [station, cue, start word, landing word]. */
export const VERSE_FIRES = [
  [0, 2, "gravity", "masses"], [0, 3, "earth", "downward"], [0, 3, "steady", "tether"],
  [1, 4, "friction", "meet"], [1, 5, "opposing", "sliding"], [1, 5, "rolling", "feet"],
  [2, 6, "elastic", "spring"], [2, 7, "stretched", "changes"], [2, 7, "shape", "state"], [1, 9, "force", "direction"],
  [3, 16, "buoyant", "force"], [3, 17, "pushes", "upward"],
  [4, 18, "magnetic", "attract"], [4, 19, "distance", "field"],
  [5, 20, "air", "pushes"], [5, 21, "opposite", "motion"], [5, 33, "size", "direction"],
];
export const VERSE1 = { masses: 2, earth: 3, contact: 8, size: 9 };
export const VERSE2 = { repel: 18, field: 19, balanced: 22, unbalanced: 23 };
/** Chorus lines: push/pull, faster/stop/turn, the call-and-response roll and the tag. */
export const CHORUSES = [
  { push: 10, moves: 11, tag: 15, calls: [[12, 0, "gravity", "down"], [12, 1, "friction", "slow"], [13, 2, "elastic", "boing"], [13, 3, "buoyancy", "float"], [14, 4, "magnetism", "click"], [14, 5, "air", "whoosh"]] },
  { push: 24, moves: 25, tag: 29, calls: [[26, 0, "gravity", "down"], [26, 1, "friction", "slow"], [27, 2, "elastic", "boing"], [27, 3, "buoyancy", "float"], [28, 4, "magnetism", "click"], [28, 5, "air", "whoosh"]] },
];
/** Bridge quiz: question cue, the station that answers it and the answer word. */
export const QUIZ = [[30, 1, "friction"], [31, 3, "buoyancy"], [32, 0, "gravity"]];
export const BRIDGE = { size: 33 };
export const OUTRO = { contact: 34, all: 35 };

/** ASR packed or misplaced these words; times from the vocal stem. */
export const RETIME = {
  1: [11.47, 12.12, 12.87, 13.25, 14.45],
  6: [32.62, 33.5, 33.82, 34.1, 34.4, 34.75],
  7: [35.18, 35.4, 35.6, 35.93, 36.41, 37.02, 37.37, 37.62],
  9: [43.93, 44.5, 44.83, 45.2, 45.45, 45.7, 46.55],
  15: [65.0, 65.45, 65.96, 66.22, 66.83, 67.42, 67.97],
  18: [80.45, 80.95, 81.55, 81.85, 82.85, 83.5],
  19: [84.65, 85.01, 85.17, 85.25, 85.83, 86.19, 86.47, 87.3],
  21: [94.78, 95.22, 95.4, 95.94, 96.26, 96.48, 96.85, 97.16],
  22: [98.97, 99.51, 100.12, 100.28, 100.42, 100.62],
  29: [124.52, 124.94, 125.45, 125.73, 126.3, 126.87, 127.45],
  30: [128.38, 128.68, 128.95, 129.6, 129.9, 130.52, 131.45],
  32: [137.02, 137.3, 137.62, 138.0, 138.85, 139.4, 140.57],
  34: [149.48, 149.95, 150.1, 150.62, 151.06, 151.3],
};
