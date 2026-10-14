export const SECTIONS = {
  drop: 8.86,
  verse1: 9.0,
  pre: 21.59,
  chorus1: 26.77,
  verse2: 36.5,
  chorus2: 45.46,
  verse3: 53.82,
  chorus3: 60.19,
  verse4: 69.73,
  chorus4: 76.1,
  verse5: 85.25,
  outro: 94.81,
  finale: 106.8,
  end: 113.0,
};

export const ORDER = ["verse1", "pre", "chorus1", "verse2", "chorus2", "verse3", "chorus3", "verse4", "chorus4", "verse5", "outro", "finale"];
export const CHORUSES = { chorus1: 8, chorus2: 16, chorus3: 24, chorus4: 32 };

/** The integer 3 followed by the first 50 decimals of pi. */
export const PI_DIGITS = "3" + "14159265358979323846264338327950288419716939937510";

/** Cues whose words are the sung digits, in order: the walk follows these. */
export const DIGIT_CUES = [2, 3, 4, 12, 13, 20, 21, 28, 29, 36, 37];
/** Outro cues that sing the first 30 decimals again. */
export const REPLAY_CUES = [40, 41, 42];

export const DIGIT_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
export const DIGIT_COLORS = ["#ff4f6d", "#ff8a3d", "#ffc93d", "#c6ff3d", "#3dff8a", "#3dffe0", "#3db8ff", "#5d6dff", "#b35dff", "#ff5de0"];
