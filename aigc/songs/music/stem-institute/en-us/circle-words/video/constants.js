export const SECTIONS = {
  drop: 13.12,
  verse1: 13.15,
  chorus1: 42.56,
  verse2: 56.29,
  chorus2: 82.25,
  bridge: 94.01,
  chorus3: 118.42,
  outro: 134.08,
  end: 149.28,
};
export const ORDER = ["verse1", "chorus1", "verse2", "chorus2", "bridge", "chorus3", "outro"];

/** The eight circle parts in the order the song defines them. */
export const PARTS = ["center", "radius", "diameter", "circumference", "area", "arc", "chord", "tangent"];
export const COLORS = {
  center: "#ffffff",
  radius: "#ff4f9a",
  diameter: "#ff9d3d",
  circumference: "#3de8ff",
  area: "#9b7bff",
  arc: "#6bff8f",
  chord: "#ffe14a",
  tangent: "#ff5b5b",
};
export const GOLD = "#ffd98a";

export const VERSE1 = { center: 2, radius: 3, ends: 4, every: 5, diameter: 6, endpoint: 7, twice: 8, radii: 9 };
export const VERSE2 = { circumference: 14, formulaC: 15, area: 16, formulaA: 17, arc: 18, chord: 19, tangent: 20, seven: 21 };
export const CHORUSES = { chorus1: 10, chorus2: 22, chorus3: 34 };
/** Chorus lines that call parts by name: cue index and the parts sung in it. */
export const ROLL_CALLS = [
  [12, ["center", "radius", "diameter"]],
  [24, ["circumference", "area", "arc", "chord"]],
  [25, ["tangent"]],
  [36, ["center", "radius", "diameter"]],
  [37, ["circumference", "area", "arc", "chord", "tangent"]],
];
/** Bridge recap: one cue per part (arc and chord share a line). */
export const BRIDGE = [
  [26, ["center"]],
  [27, ["radius"]],
  [28, ["diameter"]],
  [29, ["circumference"]],
  [30, ["area"]],
  [31, ["arc", "chord"]],
  [32, ["tangent"]],
];
export const ROTATE_CUE = 33;
export const OUTRO = { turns: 38, name: 39 };
/** Lines that spin the figure a third of a turn per waltz bar. */
export const SPIN_CUES = [10, 13, 22, 33, 34, 38];

/** "Center is the middle point" was stretched over the held "show"; times from the vocal stem. */
export const RETIME = { 2: [13.6, 14.05, 14.4, 14.6, 15.4] };
