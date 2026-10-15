/** Section boundaries for Planet Parade, matching the song video. */
export const SECTIONS = {
  drop: 10.24,
  lineup: 10.79,
  verse1: 18.51,
  chorus1: 45.8,
  verse2: 66.97,
  chorus2: 101.4,
  bridge: 122.54,
  finale: 146.84,
  end: 157.35,
};

/** The eight planets in order; `look` drives the planet shader. */
export const PLANETS = [
  { id: "mercury", name: "MERCURY", ord: "1st", fact: "closest to the Sun", year: "88 days", color: "#c9c2b8", size: 0.42,
    look: { a: "#7d7770", b: "#d4ccc1", c: "#5d5852", bands: 0, warp: 0.4, scale: 7 } },
  { id: "venus", name: "VENUS", ord: "2nd", fact: "cloudy number two", year: "225 days", color: "#f0cf86", size: 0.52,
    look: { a: "#c49a4f", b: "#f6e2a9", c: "#e0b86a", bands: 3, warp: 1.8, scale: 3 } },
  { id: "earth", name: "EARTH", ord: "3rd", fact: "oceans blue", year: "365 days", color: "#4f8dff", size: 0.55, earth: true,
    look: { a: "#1c4bb0", b: "#3f8f4a", c: "#c2a46b", bands: 0, warp: 0.8, scale: 2.6 } },
  { id: "mars", name: "MARS", ord: "4th", fact: "iron-red hue", year: "687 days", color: "#e0623e", size: 0.46, caps: 0.3,
    look: { a: "#8f3a22", b: "#e3784a", c: "#5e2414", bands: 0, warp: 0.6, scale: 4 } },
  { id: "jupiter", name: "JUPITER", ord: "5th", fact: "the largest planet", year: "12 years", color: "#e0a96d", size: 0.95, spot: [-0.32, 1.2, 0.16],
    look: { a: "#b77b45", b: "#f3e0bd", c: "#7f4f30", bands: 13, warp: 0.55, scale: 3 } },
  { id: "saturn", name: "SATURN", ord: "6th", fact: "bright rings around it", year: "29 years", color: "#f0d896", size: 0.8, rings: true,
    look: { a: "#cfb37a", b: "#f6e8c2", c: "#a88c55", bands: 9, warp: 0.35, scale: 3 } },
  { id: "uranus", name: "URANUS", ord: "7th", fact: "tilted on its side", year: "84 years", color: "#8fe6ec", size: 0.7, tilt: 1.71,
    look: { a: "#6fcfd8", b: "#b5f2f3", c: "#5fbac6", bands: 2, warp: 0.2, scale: 2 } },
  { id: "neptune", name: "NEPTUNE", ord: "8th", fact: "the farthest planet", year: "165 years", color: "#4f73ff", size: 0.68, spot: [-0.25, 2.4, 0.12],
    look: { a: "#2343c4", b: "#5a86ff", c: "#18307f", bands: 4, warp: 0.5, scale: 2.5 } },
];

export const PLUTO = { id: "pluto", name: "PLUTO", color: "#e3d4c2", size: 0.3,
  look: { a: "#a8917a", b: "#efe2cf", c: "#6e5644", bands: 0, warp: 0.5, scale: 3 } };

/** Sung words that land a note on the Sun. */
export const SUN_WORDS = ["sun", "march", "hey", "hooray", "eight"];

/** Spans where the planets leave their orbits and march in a line: the lineup, both choruses and the finale. */
export const PARADES = [
  [SECTIONS.lineup, SECTIONS.verse1 - 0.4],
  [SECTIONS.chorus1, SECTIONS.verse2 - 0.6],
  [SECTIONS.chorus2, SECTIONS.bridge - 0.6],
  [SECTIONS.finale, SECTIONS.end + 8],
];

/** Lyric words that pick up a planet colour. */
export const WORD_COLORS = {
  ...Object.fromEntries(PLANETS.map((p) => [p.id, p.color])),
  sun: "#ffb347",
  pluto: PLUTO.color,
  march: "#ffb347",
  eight: "#ffffff",
  asteroid: "#b8a48c",
};
