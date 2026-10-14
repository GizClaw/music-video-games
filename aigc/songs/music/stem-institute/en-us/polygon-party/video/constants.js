export const SECTIONS = {
  drop: 11.84,
  verse1: 11.9,
  chorus1: 29.21,
  verse2: 44.9,
  chorus2: 61.28,
  bridge: 75.76,
  chorus3: 95.72,
  outro: 110.83,
  end: 122.6,
};
export const ORDER = ["verse1", "chorus1", "verse2", "chorus2", "bridge", "chorus3", "outro"];
export const CHORUSES = { chorus1: 8, chorus2: 18, chorus3: 27 };

export const NAMES = { 3: "TRIANGLE", 4: "QUADRILATERAL", 5: "PENTAGON", 6: "HEXAGON", 7: "HEPTAGON", 8: "OCTAGON", 9: "NONAGON", 10: "DECAGON", 11: "HENDECAGON", 12: "DODECAGON" };
export const COLORS = { 3: "#ff3d5a", 4: "#ff8a1f", 5: "#ffd23f", 6: "#4dff7a", 7: "#2fe0ff", 8: "#5d7bff", 9: "#b45dff", 10: "#ff5dc8", 11: "#8a8aa0", 12: "#ffcf5a" };
export const INSTRUMENTS = { 3: "clave", 4: "", 5: "conga", 6: "", 7: "bells", 8: "brass", 9: "", 10: "timbales", 12: "full ensemble" };

/** Verse lines that introduce one polygon: cue index, side count, name word. */
export const VERSE_LINES = [
  [2, 3, "triangle"],
  [3, 4, "quadrilateral"],
  [4, 5, "pentagon"],
  [5, 6, "hexagon"],
  [6, 7, "heptagon"],
  [7, 8, "octagon"],
  [12, 9, "nonagon"],
  [13, 10, "decagon"],
  [15, 12, "dodecagon"],
];
export const ELEVEN_CUE = 14;
export const NAMES_CUE = 16;
export const TRACE_CUE = 17;
/** Bridge roll call: cue index and the polygon names it sings. */
export const BRIDGE = [
  [22, ["triangle", "quadrilateral"]],
  [23, ["pentagon", "hexagon"]],
  [24, ["heptagon", "octagon"]],
  [25, ["nonagon", "decagon"]],
  [26, ["dodecagon"]],
];
export const OUTRO_CUES = [31, 32];
