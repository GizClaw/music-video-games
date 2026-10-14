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

export const TITLE = { kicker: "STEM INSTITUTE  ·  No. 22", lines: ["PLANET", "PARADE"], accent: "#ffb347" };

export const SUN_RADIUS = 2.2;

// Stylised sizes and distances; patterns drive the planet shader.
export const PLANETS = [
  { id: "mercury", name: "MERCURY", ord: "1st", fact: "closest to the Sun", color: "#c9c2b8", size: 0.3, R: 4.2, year: "88 days",
    look: { a: "#7d7770", b: "#d4ccc1", c: "#5d5852", bands: 0, warp: 0.4, scale: 7 } },
  { id: "venus", name: "VENUS", ord: "2nd", fact: "cloudy number two", color: "#f0cf86", size: 0.46, R: 5.7, year: "225 days",
    look: { a: "#c49a4f", b: "#f6e2a9", c: "#e0b86a", bands: 3, warp: 1.8, scale: 3 } },
  { id: "earth", name: "EARTH", ord: "3rd", fact: "oceans blue", color: "#4f8dff", size: 0.5, R: 7.3, year: "365 days", earth: true,
    look: { a: "#1c4bb0", b: "#3f8f4a", c: "#c2a46b", bands: 0, warp: 0.8, scale: 2.6 } },
  { id: "mars", name: "MARS", ord: "4th", fact: "iron-red hue", color: "#e0623e", size: 0.38, R: 8.9, year: "687 days", caps: 0.3,
    look: { a: "#8f3a22", b: "#e3784a", c: "#5e2414", bands: 0, warp: 0.6, scale: 4 } },
  { id: "jupiter", name: "JUPITER", ord: "5th", fact: "the largest planet", color: "#e0a96d", size: 1.35, R: 12.8, year: "12 years", spot: [-0.32, 1.2, 0.16],
    look: { a: "#b77b45", b: "#f3e0bd", c: "#7f4f30", bands: 13, warp: 0.55, scale: 3 } },
  { id: "saturn", name: "SATURN", ord: "6th", fact: "bright rings around it", color: "#f0d896", size: 1.1, R: 17.0, year: "29 years", rings: true,
    look: { a: "#cfb37a", b: "#f6e8c2", c: "#a88c55", bands: 9, warp: 0.35, scale: 3 } },
  { id: "uranus", name: "URANUS", ord: "7th", fact: "tilted on its side", color: "#8fe6ec", size: 0.78, R: 20.6, year: "84 years", tilt: 1.71,
    look: { a: "#6fcfd8", b: "#b5f2f3", c: "#5fbac6", bands: 2, warp: 0.2, scale: 2 } },
  { id: "neptune", name: "NEPTUNE", ord: "8th", fact: "the farthest planet", color: "#4f73ff", size: 0.75, R: 23.6, year: "165 years", spot: [-0.25, 2.4, 0.12],
    look: { a: "#2343c4", b: "#5a86ff", c: "#18307f", bands: 4, warp: 0.5, scale: 2.5 } },
];

export const PLUTO = { name: "PLUTO", color: "#e3d4c2", size: 0.2, pos: [33, 3.2, -9] };
