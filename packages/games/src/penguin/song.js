/** Section boundaries for Penguin Step Party, matching the song video. */
export const SECTIONS = {
  drop: 8.03,
  verse1: 14.02,
  chorus1: 32.08,
  verse2: 50.85,
  chorus2: 69.62,
  bridge: 86.53,
  dance: 100.43,
  chorus3: 106.8,
  outro: 122.94,
  end: 133.29,
};

/** The four lanes, left to right: feet on the outside, flipper and clap in the middle. */
export const LANES = [
  { id: "left", color: "#2fb8f0", keys: ["arrowleft", "d"], label: { zh: "左脚", en: "Left" } },
  { id: "flap", color: "#ff4fa3", keys: ["arrowup", "f"], label: { zh: "翅膀", en: "Flap" } },
  { id: "clap", color: "#ffb000", keys: ["arrowdown", "j", " "], label: { zh: "拍手", en: "Clap" } },
  { id: "right", color: "#3fc84a", keys: ["arrowright", "k"], label: { zh: "右脚", en: "Right" } },
];
export const LEFT = 0;
export const FLAP = 1;
export const CLAP = 2;
export const RIGHT = 3;

/**
 * Word starts read off the vocal stem where the ASR alignment slipped (the
 * same fixes as the music video): the "Step, step!" calls come late in each
 * chorus and "Ice lights dim" follows a two-second rest.
 */
export const RETIME = {
  8: [33.1, 33.52, 34.16, 34.5, 35.05, 35.57],
  19: [70.72, 71.08, 71.84, 72.2, 72.54, 73.14],
  28: [107.3, 107.9, 108.62, 108.98, 109.4, 109.94],
  33: [125.92, 126.28, 126.68, 127.24, 127.7, 128.12],
  17: { 4: 65.25, 5: 65.5 },
  27: { 3: 99.9, 4: 100.3 },
};

/** First cue of each chorus: steps, clap, waddle, flap, hey. */
export const CHORUSES = [8, 19, 28];
/** "Freeze in place, then gently sway": no presses from "Freeze" until "sway". */
export const FREEZE_CUE = 26;

/** Lyric words that pick up a lane colour. */
export const WORD_COLORS = {
  step: LANES[LEFT].color,
  steps: LANES[LEFT].color,
  left: LANES[LEFT].color,
  right: LANES[RIGHT].color,
  flap: LANES[FLAP].color,
  wings: LANES[FLAP].color,
  flash: LANES[FLAP].color,
  clap: LANES[CLAP].color,
  hey: "#ff8a00",
  freeze: "#2fb8f0",
};
