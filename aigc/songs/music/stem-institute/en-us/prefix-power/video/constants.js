export const SECTIONS = {
  drop: 8.63,
  verse1: 8.97,
  chorus1: 31.75,
  verse2: 45.26,
  chorus2: 68.79,
  bridge: 84.51,
  chorus3: 98.75,
  outro: 117.28,
  end: 124.39,
};

export const TITLE = { kicker: "STEM INSTITUTE  ·  No. 14", lines: ["PREFIX", "POWER"], accent: "#ff4fd8" };

export const PREFIXES = [
  { id: "nano", label: "NANO", sym: "n", exp: -9 },
  { id: "micro", label: "MICRO", sym: "µ", exp: -6 },
  { id: "milli", label: "MILLI", sym: "m", exp: -3 },
  { id: "centi", label: "CENTI", sym: "c", exp: -2 },
  { id: "deci", label: "DECI", sym: "d", exp: -1 },
  { id: "deca", label: "DECA", sym: "da", exp: 1 },
  { id: "hecto", label: "HECTO", sym: "h", exp: 2 },
  { id: "kilo", label: "KILO", sym: "k", exp: 3 },
  { id: "mega", label: "MEGA", sym: "M", exp: 6 },
  { id: "giga", label: "GIGA", sym: "G", exp: 9 },
  { id: "tera", label: "TERA", sym: "T", exp: 12 },
];

const SUP = { "-": "⁻", 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
export const pow10 = (e) => "10" + [...String(e)].map((c) => SUP[c]).join("");

/** "1 nm", "100 µm", "10 km", "1 Tm" for 10^k metres. */
export function lengthLabel(k) {
  const units = [[-9, "nm"], [-6, "µm"], [-3, "mm"], [0, "m"], [3, "km"], [6, "Mm"], [9, "Gm"], [12, "Tm"]];
  let base = units[0];
  for (const u of units) if (k >= u[0]) base = u;
  return `${10 ** (k - base[0])} ${base[1]}`;
}

export const hueOf = (k) => (((k + 10) / 23) % 1 + 1) % 1;
