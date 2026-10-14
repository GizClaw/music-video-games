export const SECTIONS = {
  drop: 11.12,
  verse1: 11.47,
  chorus1: 31.95,
  verse2: 43.94,
  chorus2: 60.15,
  verse3: 72.23,
  chorus3: 86.55,
  outro: 100.17,
  end: 112.74,
};

export const TITLE = { kicker: "STEM INSTITUTE  ·  No. 4", lines: ["SOLID, LIQUID,", "GAS, PLASMA"], accent: "#ff4fd8" };
export const CHORUS_CUES = { chorus1: 9, chorus2: 19, chorus3: 27 };

// Index order used by the particle mixer.
export const STATES = [
  { id: "solid", label: "SOLID", color: "#6fc3ff", sub: "keeps shape & size" },
  { id: "liquid", label: "LIQUID", color: "#3dffc8", sub: "keeps volume, takes the shape" },
  { id: "gas", label: "GAS", color: "#ffb347", sub: "spreads to fill the space" },
  { id: "plasma", label: "PLASMA", color: "#ff4fd8", sub: "ionized gas" },
];

export const CHANGES = [
  { cue: 13, word: "melting", label: "MELTING", from: 0, to: 1, energy: 1 },
  { cue: 14, word: "freezing", label: "FREEZING", from: 1, to: 0, energy: -1 },
  { cue: 15, word: "vaporization", label: "VAPORIZATION", from: 1, to: 2, energy: 1 },
  { cue: 16, word: "condensation", label: "CONDENSATION", from: 2, to: 1, energy: -1 },
  { cue: 23, word: "sublimation", label: "SUBLIMATION", from: 0, to: 2, energy: 1 },
  { cue: 24, word: "deposition", label: "DEPOSITION", from: 2, to: 0, energy: -1 },
];
