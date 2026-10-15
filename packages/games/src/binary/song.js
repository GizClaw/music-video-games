/** Section boundaries for Binary Boogie, matching the song video. */
export const SECTIONS = {
  drop: 10.31,
  verse1: 10.75,
  chorus1: 30.85,
  verse2: 44.54,
  chorus2: 57.83,
  bridge: 71.92,
  chorus3: 85.65,
  outro: 98.88,
  end: 106.21,
};

export const NES = {
  navy: "#1d2b53",
  plum: "#7e2553",
  red: "#ff004d",
  orange: "#ffa300",
  yellow: "#ffec27",
  green: "#00e436",
  blue: "#29adff",
  lilac: "#83769c",
  pink: "#ff77a8",
  peach: "#ffccaa",
};
export const NES_CYCLE = [NES.red, NES.orange, NES.yellow, NES.green, NES.blue, NES.pink];

/** Place value of each switch, left to right. */
export const PLACES = [8, 4, 2, 1];

/** 0 to 15 in Gray code: each number differs from the last by one bit. */
export const GRAY = [0, 1, 3, 2, 6, 7, 5, 4, 12, 13, 15, 14, 10, 11, 9, 8];

/** Verse 2 counts 8 to 15; the bridge clears, lights 8, 4, 2, 1 one by one ("switch the light"), then shows 1011. */
export const VERSE2_VALUES = [8, 9, 10, 11, 12, 13, 14, 15];
export const BRIDGE_VALUES = [0, 8, 12, 14, 15, 11];

/** Lyric words that pick up a colour. */
export const WORD_COLORS = {
  one: NES.yellow,
  zero: NES.blue,
  bit: NES.pink,
  beep: NES.green,
  boogie: NES.orange,
  binary: NES.orange,
  eight: NES.red,
  four: NES.orange,
  two: NES.green,
  double: NES.pink,
};
