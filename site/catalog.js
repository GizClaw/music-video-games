import universe from "./universe.json";

/**
 * The universe map of the site. `universe.json` (written by
 * `scripts/universe-catalog.mjs` from the AIGC catalog) lists every song album
 * as a galaxy and every song as a planet, with `{ zh, en }` names. This file
 * only adds what the catalog does not know:
 *
 * - SERIES_EXTRA: a galaxy's name override and arm `colors`.
 * - WORK_EXTRA, by catalog work path: planet `colors`, `look` (surface),
 *   `feature` (topic accessory, see site/features.js), `ring`, `preview`
 *   (second the song starts when picked, usually the first chorus) and, for a
 *   song with a game, its `game` loader and `howto` (a few short lines per language).
 *
 * Songs without a game are grey placeholders whose song still plays when picked.
 */
const SERIES_EXTRA = {
  "stem-institute": { name: { zh: "STEM 星系", en: "STEM Galaxy" }, colors: ["#2cade4", "#9b5cff", "#ffb347"] },
  "animal-dance": { colors: ["#7cff4f", "#ffd23f", "#3de8ff"] },
  "animal-dance-en": { colors: ["#3dff8a", "#ffb347", "#6fc3ff"] },
  "bug-beat-en": { name: { zh: "虫虫节拍 · 英文版", en: "Bug Beat" }, colors: ["#b6ff3d", "#ff8a1f", "#3dffc8"] },
  "english-songs": { name: { zh: "唱着学英语", en: "Sing and Learn English" }, colors: ["#ff4f6d", "#ffd23f", "#2fe0ff"] },
  "everyday-words-en": { name: { zh: "日常单词 · 英文版", en: "Everyday Words" }, colors: ["#ffc83d", "#ff4fd8", "#3de8ff"] },
  "grammar-tenses-en": { name: { zh: "英语时态 · 英文版", en: "Grammar Tenses" }, colors: ["#8c7bff", "#3de8ff", "#ff9a3d"] },
  "habit-songs": { colors: ["#3de8ff", "#7cff4f", "#ffe14a"] },
  "habit-songs-en": { colors: ["#2fe0ff", "#b6ff3d", "#ffb347"] },
  "health-songs": { colors: ["#ff3d5a", "#ffd23f", "#7cff4f"] },
  "health-songs-en": { colors: ["#ff6a3d", "#ffe14a", "#3dff8a"] },
  lullabies: { colors: ["#6f7bff", "#c9b0ff", "#ffd9a8"] },
  "lullabies-en": { colors: ["#8c7bff", "#9fc4ff", "#ffe2a8"] },
  "science-songs": { name: { zh: "科学儿歌", en: "Science Nursery Rhymes" }, colors: ["#3de8ff", "#9b5cff", "#ffb347"] },
  "science-songs-en": { name: { zh: "科学儿歌 · 英文版", en: "Little Science Songs" }, colors: ["#2cade4", "#ff4fd8", "#ffe14a"] },
};

const STEM = "songs/music/stem-institute/en-us";
const WORK_EXTRA = {
  [`${STEM}/spectrum-slide`]: {
    colors: ["#ff3d7f", "#9b5cff", "#3de8ff"],
    look: "rainbow",
    feature: "bands",
    preview: 41.81,
    howto: {
      zh: ["← → 或左右拖动，绕着隧道滑", "接住每一拍的光子", "钻过 γ 闸门的缺口"],
      en: ["← → or drag to slide round the tunnel", "Catch a photon on every beat", "Slip through the gap in each γ gate"],
    },
    game: () => import("@gizclaw/mvg-games/spectrum-slide.js").then((m) => m.mountSpectrumSlide),
  },
  [`${STEM}/planet-parade`]: {
    colors: ["#ffb347", "#d4ccc1", "#7d5a3c"],
    look: "gas",
    ring: true,
    feature: "moons",
    preview: 45.8,
    howto: {
      zh: ["光圈落在哪颗行星就点它，或按 1–8", "march · hey · hooray 时点太阳或按空格", "手机上跟着节奏点屏幕就行"],
      en: ["Click the planet the ring closes on, or press 1–8", "On march · hey · hooray hit the Sun or press Space", "On a phone, just tap to the beat"],
    },
    game: () => import("@gizclaw/mvg-games/planet-parade.js").then((m) => m.mountPlanetParade),
  },
  [`${STEM}/binary-boogie`]: {
    colors: ["#ffe14a", "#3dff8a", "#1b2a6b"],
    look: "grid",
    feature: "bits",
    preview: 30.85,
    howto: {
      zh: ["A S D F 拨 8 · 4 · 2 · 1，拨出外星人身上的数字", "下一拍自动开火，空格一键清零", "3 条命，无限循环，越来越快"],
      en: ["A S D F flip 8 · 4 · 2 · 1 to dial the invader's number", "It fires on the next beat; Space clears", "Three lives; loops for ever, faster each time"],
    },
    game: () => import("@gizclaw/mvg-games/binary-boogie.js").then((m) => m.mountBinaryBoogie),
  },
  [`${STEM}/prime-time`]: {
    colors: ["#ffc83d", "#ff6a3d", "#5a2a0c"],
    look: "rock",
    feature: "primes",
    preview: 23.32,
    howto: {
      zh: ["只有质数会踩着节拍弹起来", "闪到最亮的那一拍点它，就是 PERFECT", "合数被乘法划掉，无限循环越来越快"],
      en: ["Only primes pop up, on the beat", "Hit them as they flash brightest for a PERFECT", "Multiplication crosses out the rest; loops for ever, faster each time"],
    },
    game: () => import("@gizclaw/mvg-games/prime-time.js").then((m) => m.mountPrimeTime),
  },
  [`${STEM}/pi-keeps-going`]: { colors: ["#ff4f6d", "#ffc93d", "#3dff8a"], look: "swirl", feature: "spiral", preview: 26.77 },
  [`${STEM}/polygon-party`]: { colors: ["#ff3d5a", "#ffd23f", "#2fe0ff"], look: "facet", feature: "crystals", preview: 29.21 },
  [`${STEM}/molecule-shapes`]: { colors: ["#ff4fd8", "#3de8ff", "#7cff4f"], look: "swirl", feature: "atoms", preview: 26.29 },
  [`${STEM}/states-of-matter`]: { colors: ["#6fc3ff", "#3dffc8", "#ff4fd8"], look: "ice", feature: "vapor", preview: 31.95 },
  [`${STEM}/newtons-three`]: { colors: ["#3de8ff", "#8c7bff", "#ff9a3d"], look: "gas", feature: "ellipse", preview: 27.86 },
  [`${STEM}/prefix-power`]: { colors: ["#ff4fd8", "#ffd23f", "#4a1d6b"], look: "rock", feature: "nested", preview: 31.75 },
  [`${STEM}/energy-shapeshifter`]: { colors: ["#ff8a1f", "#ffe14a", "#b45dff"], look: "lava", feature: "flares", preview: 45.19 },
};

/** Second a placeholder planet's song starts from, past the catalog mark and intro. */
const DEFAULT_PREVIEW = 20;
const LOOKS = ["gas", "rock", "ice", "lava", "swirl", "facet", "grid"];
const FEATURES = ["moons", "bits", "primes", "spiral", "crystals", "atoms", "vapor", "ellipse", "nested", "flares"];
const PALETTES = [
  ["#ff4f6d", "#ffc93d", "#5a2a0c"],
  ["#3de8ff", "#8c7bff", "#1b2a6b"],
  ["#7cff4f", "#ffe14a", "#1d4a2b"],
  ["#ff8a1f", "#ff3d5a", "#4a1d2b"],
  ["#c9b0ff", "#6fc3ff", "#2b2a6b"],
  ["#ffb347", "#d4ccc1", "#7d5a3c"],
  ["#3dffc8", "#2fe0ff", "#0c3a4a"],
  ["#ff4fd8", "#9b5cff", "#3a0c4a"],
];
/** Stable small hash of a string, so a planet keeps its look between builds. */
const seed = (s) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);

export const SERIES = universe.series.map((s, i) => ({
  ...s,
  ...SERIES_EXTRA[s.id],
  colors: SERIES_EXTRA[s.id]?.colors ?? PALETTES[i % PALETTES.length],
  works: s.works.map((w) => {
    const h = seed(w.id);
    return {
      colors: PALETTES[h % PALETTES.length],
      look: LOOKS[(h >>> 3) % LOOKS.length],
      feature: FEATURES[(h >>> 7) % FEATURES.length],
      preview: DEFAULT_PREVIEW,
      ...w,
      ...WORK_EXTRA[w.work],
    };
  }),
}));
