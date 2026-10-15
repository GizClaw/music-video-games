export const SECTIONS = {
  drop: 9.26,
  verse1: 9.3,
  chorus1: 31.41,
  verse2: 45.93,
  chorus2: 71.09,
  bridge: 88.82,
  chorus3: 104.76,
  outro: 120.71,
  end: 129.2,
};
export const ORDER = ["verse1", "chorus1", "verse2", "chorus2", "bridge", "chorus3", "outro"];
/** First cue of each chorus: tag, name-it, the four names, full turn, tag. */
export const CHORUSES = { chorus1: 10, chorus2: 23, chorus3: 34 };

export const VERSE1 = { greater: 2, less: 3, narrow: 4, check: 5, right: 6, square: 7, notQuite: 8, mean: 9 };
export const VERSE2 = { greater: 15, less: 16, wider: 17, still: 18, straight: 19, opposite: 20, half: 21, crisp: 22 };
export const BRIDGE = { quarter: 28, half: 29, three: 30, full: 31, angle: 32, ending: 33 };
export const OUTRO = { sweep: 39, tell: 40 };

/**
 * Lines whose ASR alignment collapsed onto a single instant; word times are
 * taken from the vocal stem (the tags repeat the well-aligned cue 10 phrasing).
 */
const TAG = [0, 0.72, 1.41, 1.77, 2.09];
export const RETIME = {
  14: [43.05, ...TAG.slice(1).map((d) => 43.05 + d)],
  23: [71.21, ...TAG.slice(1).map((d) => 71.21 + d)],
  27: [82.75, ...TAG.slice(1).map((d) => 82.75 + d)],
  15: [49.3, 49.78, 50.1, 50.5, 50.87],
};

export const KIND = {
  acute: { name: "ACUTE", color: "#3dffb4", rule: "0° < angle < 90°" },
  right: { name: "RIGHT", color: "#ffe14a", rule: "exactly 90°" },
  obtuse: { name: "OBTUSE", color: "#ff8a3d", rule: "90° < angle < 180°" },
  straight: { name: "STRAIGHT", color: "#ff4f7a", rule: "exactly 180°" },
  reflex: { name: "REFLEX", color: "#b45dff", rule: "180° < angle < 360°" },
  full: { name: "FULL TURN", color: "#ffd27a", rule: "exactly 360°" },
  zero: { name: "ZERO", color: "#9fb6ff", rule: "0°" },
};

export function kindOf(deg) {
  const d = Math.round(deg);
  if (d <= 0) return "zero";
  if (d < 90) return "acute";
  if (d === 90) return "right";
  if (d < 180) return "obtuse";
  if (d === 180) return "straight";
  if (d < 360) return "reflex";
  return "full";
}
