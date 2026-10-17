/** Section starts, matching the song video's constants. */
export const SECTIONS = { drop: 11.84, verse1: 11.9, chorus1: 29.21, verse2: 44.9, chorus2: 61.28, bridge: 75.76, chorus3: 95.72, outro: 110.83 };
/** Scoring stops here, after the last sung "landed!"; the recording plays on to its end. */
export const END = 127;
export const WORK = "songs/music/stem-institute/en-us/polygon-party";
export const GOLD = "#ffd23f";
/** Seconds either side of a note a tap counts as PERFECT, and as a hit at all. */
export const WINDOW = { perfect: 0.09, good: 0.22 };
/** A tap this long before the next note, outside its window, is EARLY and breaks the combo. */
export const EARLY = 0.6;

/** The video's ten polygons, in the order they are drawn. */
export const SHAPES = [
  [3, "TRIANGLE", "三角形", "#ff3d5a"],
  [4, "QUADRILATERAL", "四边形", "#ff8a1f"],
  [5, "PENTAGON", "五边形", "#ffd23f"],
  [6, "HEXAGON", "六边形", "#4dff7a"],
  [7, "HEPTAGON", "七边形", "#2fe0ff"],
  [8, "OCTAGON", "八边形", "#5d7bff"],
  [9, "NONAGON", "九边形", "#b45dff"],
  [10, "DECAGON", "十边形", "#ff5dc8"],
  [11, "HENDECAGON", "十一边形", "#a8a8c8"],
  [12, "DODECAGON", "十二边形", "#ffcf5a"],
].map(([sides, en, zh, color]) => ({ sides, en, zh, color }));
export const shapeOf = (sides) => SHAPES[sides - 3];

/** Stage looks: what the camera director and the lights do in each part of the song. */
export const PHASES = [
  [0, "verse"], [SECTIONS.chorus1, "chorus"], [SECTIONS.verse2, "verse"], [SECTIONS.chorus2, "chorus"],
  [SECTIONS.bridge, "bridge"], [SECTIONS.chorus3, "chorus"], [SECTIONS.outro, "outro"],
];
export const phaseAt = (t) => PHASES.findLast(([start]) => t >= start)[1];
export const PALETTES = { verse: ["#ff3d7f", "#7b3dff"], chorus: ["#ff4fd8", "#2fe0ff"], bridge: ["#2fe0ff", "#5d7bff"], outro: ["#ffd23f", "#ff5dc8"] };

const NAME_WORDS = Object.fromEntries(SHAPES.map((s) => [s.en.toLowerCase(), s.sides]));
const NUMBER_WORDS = { three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
/** Lyric colour of a cleaned word: polygon names and side counts take their polygon's colour. */
export const wordColor = (clean) => {
  const n = NAME_WORDS[clean] ?? NUMBER_WORDS[clean];
  return n ? shapeOf(n).color : clean === "party" || clean === "polygon" ? GOLD : null;
};

/**
 * The song gets harder as it goes: each section's bar pattern (beats from
 * the bar's downbeat; .5 is the off-beat) and how many beats ahead the cue
 * starts closing. Every note draws one edge.
 */
export const LEVELS = [
  { from: SECTIONS.drop, pattern: [0, 2], lead: 2 },
  { from: SECTIONS.chorus1, pattern: [0, 2, 3], lead: 2 },
  { from: SECTIONS.verse2, pattern: [0, 1, 2], lead: 2 },
  { from: SECTIONS.chorus2, pattern: [0, 1, 2, 3], lead: 1.5 },
  { from: SECTIONS.bridge, pattern: [0, 1, 2, 3, 3.5], lead: 1.5 },
  { from: SECTIONS.chorus3, pattern: [0, 0.5, 1, 2, 2.5, 3], lead: 1.25 },
  { from: SECTIONS.outro, pattern: [0, 1, 2, 3], lead: 1.5 },
];
export const levelAt = (t) => LEVELS.findLast((l) => t >= l.from - 0.05) ?? LEVELS[0];

export function chart(tm) {
  const at = (f) => {
    const i = Math.floor(f);
    return tm.beatTime(i) + (tm.beatTime(i + 1) - tm.beatTime(i)) * (f - i);
  };
  const notes = [];
  for (let bar = tm.dropBeat; bar + 1 < tm.beats.length; bar += 4) {
    const level = levelAt(tm.beatTime(bar));
    for (const o of level.pattern) {
      const t = at(bar + o);
      if (t >= END - WINDOW.good) return notes;
      notes.push({ t, beat: bar + o, lead: level.lead * tm.period });
    }
  }
  return notes;
}

/** Corners of a regular n-gon of circumradius r with a flat bottom edge, in its own plane. */
export const corners = (n, r = 1) => Array.from({ length: n }, (_, k) => {
  const a = -Math.PI / 2 + Math.PI / n + (k * 2 * Math.PI) / n;
  return [Math.cos(a) * r, Math.sin(a) * r];
});
