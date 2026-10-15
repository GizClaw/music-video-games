export const SECTIONS = {
  drop: 10.25,
  verse1: 10.22,
  chorus1: 40.0,
  verse2: 58.33,
  chorus2: 89.49,
  breakdown: 107.3,
  bridge: 113.96,
  outro: 128.62,
  end: 129.97,
};
export const ORDER = ["verse1", "chorus1", "verse2", "chorus2", "breakdown", "bridge", "outro"];

export const MACHINES = [
  { id: "lever", name: "LEVER", word: "lever", color: "#ffc23d", def: "a rigid bar that pivots on a fulcrum" },
  { id: "pulley", name: "PULLEY", word: "pulley", color: "#3de8ff", def: "a grooved wheel with a rope" },
  { id: "wheel", name: "WHEEL & AXLE", word: "wheel", color: "#ff7a3d", def: "a large wheel turning a small axle" },
  { id: "plane", name: "INCLINED PLANE", word: "inclined", color: "#7cff6b", def: "a sloping surface" },
  { id: "wedge", name: "WEDGE", word: "wedge", color: "#ff5d8f", def: "two inclined planes back to back" },
  { id: "screw", name: "SCREW", word: "screw", color: "#b48cff", def: "an inclined plane wrapped around" },
];

/** Close-ups: cue index that brings each machine to the front. */
export const CLOSEUPS = [[2, 0], [4, 1], [6, 2], [18, 3], [20, 4], [22, 5]];
/** Cues that pull back to the whole shelf. */
export const WIDE = [8, 24];
export const VERSE1 = { push: 3, direction: 5, large: 7, checked: 8, chain: 9 };
export const VERSE2 = { longer: 19, split: 21, threads: 23, work: 24, trade: 25 };
/** Chorus lines that call the six by name. */
export const ROLL = [[11, [0, 1, 2]], [12, [3, 4, 5]], [27, [0, 1, 2]], [28, [3, 4, 5]]];
/** "Lift it! Split it! Turn it! Move it away!": action word and the machines it fires. */
export const ACTIONS = [
  [14, "lift", [0, 1]], [14, "split", [4]], [15, "turn", [2, 5]], [15, "move", [3]],
  [30, "lift", [0, 1]], [30, "split", [4]], [31, "turn", [2, 5]], [31, "move", [3]],
];
export const HEYS = [14, 15, 30, 31];
export const COUNTS = [[16, ["one", "two", "three"]], [17, ["four", "five", "six"]], [32, ["one", "two", "three"]], [33, ["four", "five", "six"]]];
export const BRIDGE = { howMany: 34, energy: 35, force: 36, distance: 37 };

/** ASR packed these words together; times from the vocal stem. */
export const RETIME = {
  2: [10.2, 10.7, 11.1, 11.5, 11.65, 12.0, 12.12, 12.2],
  10: [40.0, 40.3, 40.9, 41.2, 41.4],
};
/** The generated vocal fades after "smart connection"; the two outro lines are never sung. */
export const SUNG_CUES = 38;
