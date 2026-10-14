export const SECTIONS = {
  drop: 12.14,
  verse1: 12.14,
  chorus1: 45.19,
  break: 62.4,
  verse2: 71.44,
  chorus2: 102.79,
  bridge: 121.28,
  outro: 142.32,
  end: 154.0,
};
export const ORDER = ["verse1", "chorus1", "break", "verse2", "chorus2", "bridge", "outro"];
export const CHORUSES = { chorus1: 10, chorus2: 24 };

export const FORMS = {
  kinetic: { label: "KINETIC", color: "#ff8a1f" },
  potential: { label: "POTENTIAL", color: "#b45dff" },
  thermal: { label: "THERMAL", color: "#ff3d4a" },
  light: { label: "LIGHT", color: "#ffe14a" },
  electrical: { label: "ELECTRICAL", color: "#2fe0ff" },
  chemical: { label: "CHEMICAL", color: "#5dff7a" },
};
export const FORM_ORDER = ["kinetic", "potential", "thermal", "light", "electrical", "chemical"];
/** Verse 1 introduces one form per cue. */
export const INTRO_CUES = { kinetic: 2, potential: 3, thermal: 4, light: 5, electrical: 6, chemical: 7 };
