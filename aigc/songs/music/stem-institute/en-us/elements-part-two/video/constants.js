export const SECTIONS = {
  drop: 6.95,
  count: 6.95,
  verse1: 11.58,
  chorus1: 27.67,
  verse2: 38.52,
  chorus2: 56.53,
  verse3: 67.36,
  chorus3: 87.77,
  bridge: 98.59,
  outro: 122.3,
  end: 131.34,
};
export const ORDER = ["count", "verse1", "chorus1", "verse2", "chorus2", "verse3", "chorus3", "bridge", "outro"];

/** Element categories and their colours. */
export const CATEGORY = {
  nonmetal: { label: "NONMETAL", color: "#3dff8a" },
  noble: { label: "NOBLE GAS", color: "#b48cff" },
  alkali: { label: "ALKALI METAL", color: "#ff5d5d" },
  alkaline: { label: "ALKALINE EARTH", color: "#ff9d3d" },
  transition: { label: "TRANSITION METAL", color: "#ffd23f" },
  post: { label: "POST-TRANSITION", color: "#3dc2ff" },
  metalloid: { label: "METALLOID", color: "#3dffd8" },
  halogen: { label: "HALOGEN", color: "#ff5dc8" },
  lanthanide: { label: "LANTHANIDE", color: "#c8ff3d" },
  actinide: { label: "ACTINIDE", color: "#6f8bff" },
};

const N = "nonmetal";
const G = "noble";
const A = "alkali";
const E = "alkaline";
const T = "transition";
const P = "post";
const M = "metalloid";
const H = "halogen";
const L = "lanthanide";
const C = "actinide";

/** Elements 1–118: symbol, name, category, period, group (0 for the f-block). */
export const ELEMENTS = [
  ["H", "Hydrogen", N, 1, 1], ["He", "Helium", G, 1, 18],
  ["Li", "Lithium", A, 2, 1], ["Be", "Beryllium", E, 2, 2], ["B", "Boron", M, 2, 13], ["C", "Carbon", N, 2, 14], ["N", "Nitrogen", N, 2, 15], ["O", "Oxygen", N, 2, 16], ["F", "Fluorine", H, 2, 17], ["Ne", "Neon", G, 2, 18],
  ["Na", "Sodium", A, 3, 1], ["Mg", "Magnesium", E, 3, 2], ["Al", "Aluminum", P, 3, 13], ["Si", "Silicon", M, 3, 14], ["P", "Phosphorus", N, 3, 15], ["S", "Sulfur", N, 3, 16], ["Cl", "Chlorine", H, 3, 17], ["Ar", "Argon", G, 3, 18],
  ["K", "Potassium", A, 4, 1], ["Ca", "Calcium", E, 4, 2], ["Sc", "Scandium", T, 4, 3], ["Ti", "Titanium", T, 4, 4], ["V", "Vanadium", T, 4, 5], ["Cr", "Chromium", T, 4, 6], ["Mn", "Manganese", T, 4, 7], ["Fe", "Iron", T, 4, 8], ["Co", "Cobalt", T, 4, 9], ["Ni", "Nickel", T, 4, 10], ["Cu", "Copper", T, 4, 11], ["Zn", "Zinc", T, 4, 12], ["Ga", "Gallium", P, 4, 13], ["Ge", "Germanium", M, 4, 14], ["As", "Arsenic", M, 4, 15], ["Se", "Selenium", N, 4, 16], ["Br", "Bromine", H, 4, 17], ["Kr", "Krypton", G, 4, 18],
  ["Rb", "Rubidium", A, 5, 1], ["Sr", "Strontium", E, 5, 2], ["Y", "Yttrium", T, 5, 3], ["Zr", "Zirconium", T, 5, 4], ["Nb", "Niobium", T, 5, 5], ["Mo", "Molybdenum", T, 5, 6], ["Tc", "Technetium", T, 5, 7], ["Ru", "Ruthenium", T, 5, 8], ["Rh", "Rhodium", T, 5, 9], ["Pd", "Palladium", T, 5, 10], ["Ag", "Silver", T, 5, 11], ["Cd", "Cadmium", T, 5, 12], ["In", "Indium", P, 5, 13], ["Sn", "Tin", P, 5, 14], ["Sb", "Antimony", M, 5, 15], ["Te", "Tellurium", M, 5, 16], ["I", "Iodine", H, 5, 17], ["Xe", "Xenon", G, 5, 18],
  ["Cs", "Cesium", A, 6, 1], ["Ba", "Barium", E, 6, 2],
  ["La", "Lanthanum", L, 6, 0], ["Ce", "Cerium", L, 6, 0], ["Pr", "Praseodymium", L, 6, 0], ["Nd", "Neodymium", L, 6, 0], ["Pm", "Promethium", L, 6, 0], ["Sm", "Samarium", L, 6, 0], ["Eu", "Europium", L, 6, 0], ["Gd", "Gadolinium", L, 6, 0], ["Tb", "Terbium", L, 6, 0], ["Dy", "Dysprosium", L, 6, 0], ["Ho", "Holmium", L, 6, 0], ["Er", "Erbium", L, 6, 0], ["Tm", "Thulium", L, 6, 0], ["Yb", "Ytterbium", L, 6, 0], ["Lu", "Lutetium", L, 6, 0],
  ["Hf", "Hafnium", T, 6, 4], ["Ta", "Tantalum", T, 6, 5], ["W", "Tungsten", T, 6, 6], ["Re", "Rhenium", T, 6, 7], ["Os", "Osmium", T, 6, 8], ["Ir", "Iridium", T, 6, 9], ["Pt", "Platinum", T, 6, 10], ["Au", "Gold", T, 6, 11], ["Hg", "Mercury", T, 6, 12], ["Tl", "Thallium", P, 6, 13], ["Pb", "Lead", P, 6, 14], ["Bi", "Bismuth", P, 6, 15], ["Po", "Polonium", P, 6, 16], ["At", "Astatine", H, 6, 17], ["Rn", "Radon", G, 6, 18],
  ["Fr", "Francium", A, 7, 1], ["Ra", "Radium", E, 7, 2],
  ["Ac", "Actinium", C, 7, 0], ["Th", "Thorium", C, 7, 0], ["Pa", "Protactinium", C, 7, 0], ["U", "Uranium", C, 7, 0], ["Np", "Neptunium", C, 7, 0], ["Pu", "Plutonium", C, 7, 0], ["Am", "Americium", C, 7, 0], ["Cm", "Curium", C, 7, 0], ["Bk", "Berkelium", C, 7, 0], ["Cf", "Californium", C, 7, 0], ["Es", "Einsteinium", C, 7, 0], ["Fm", "Fermium", C, 7, 0], ["Md", "Mendelevium", C, 7, 0], ["No", "Nobelium", C, 7, 0], ["Lr", "Lawrencium", C, 7, 0],
  ["Rf", "Rutherfordium", T, 7, 4], ["Db", "Dubnium", T, 7, 5], ["Sg", "Seaborgium", T, 7, 6], ["Bh", "Bohrium", T, 7, 7], ["Hs", "Hassium", T, 7, 8], ["Mt", "Meitnerium", T, 7, 9], ["Ds", "Darmstadtium", T, 7, 10], ["Rg", "Roentgenium", T, 7, 11], ["Cn", "Copernicium", T, 7, 12], ["Nh", "Nihonium", P, 7, 13], ["Fl", "Flerovium", P, 7, 14], ["Mc", "Moscovium", P, 7, 15], ["Lv", "Livermorium", P, 7, 16], ["Ts", "Tennessine", H, 7, 17], ["Og", "Oganesson", G, 7, 18],
].map(([symbol, name, category, period, group], i) => ({ z: i + 1, symbol, name, category, period, group }));

/** Part One sang 1–56; this song lights 57–118. */
export const FIRST = 57;
/** Main-table markers for the f-block rows, in the group-3 slots of periods 6 and 7. */
export const MARKERS = [{ period: 6, label: "57–71", category: L }, { period: 7, label: "89–103", category: C }];

/** Verse and bridge lines that sing elements in order. */
export const ELEMENT_CUES = [1, 2, 3, 4, 5, 11, 12, 13, 14, 15, 21, 22, 23, 24, 25, 26, 32, 33, 34, 35, 36];
/** First line of each chorus (tap, fifty-seven, name by name, atom train) and the row it races. */
export const CHORUSES = [{ cue: 7, row: "lanthanides" }, { cue: 17, row: "six" }, { cue: 28, row: "actinides" }];
/** Lines that close a row, the "one-one-eight" call and the outro. */
export const DONE = { lanthanides: 6, six: 16, actinides: 27, top: 37, ends: 38, all: 39 };

/**
 * Word starts from the vocal stem: the ASR packed or shifted names in verse 1,
 * Platinum, Nihonium and Oganesson, the go-go-go runs, and chorus two's last
 * lines (stretched over the instrumental). An extra trailing time ends a held word.
 */
export const RETIME = {
  0: [6.96, 7.53, 8.15, 8.59, 9.66, 10.48, 11.0],
  1: [11.74, 12.87, 14.16],
  2: [15.39, 16.57, 17.66],
  3: [18.71, 19.88, 20.75],
  4: [21.39, 22.49, 23.2],
  5: [23.8, 24.34, 25.02],
  7: [27.99, 28.31, 28.61, 29.18, 29.53, 29.66],
  8: [30.33, 31.51, 32.21, 32.36, 32.81],
  9: [33.42, 33.72, 34.04, 34.5, 34.62, 35.06],
  13: [47.81, 48.43, 48.79, 48.99],
  17: [56.8, 57.15, 57.38, 58.02, 58.3, 58.42],
  18: [59.18, 60.41, 61.05, 61.2, 61.62],
  19: [62.23, 62.55, 62.81, 63.29, 63.47, 63.85],
  20: [64.71, 65.03, 65.51, 65.84, 66.32],
  27: [85.11, 85.68, 86.01, 86.14, 87.4],
  28: [88.04, 88.4, 88.62, 89.26, 89.56, 89.72],
  29: [90.43, 91.59, 92.29, 92.42, 92.87],
  30: [93.48, 93.8, 94.07, 94.53, 94.65, 95.16],
  35: [112.79, 113.61, 114.54],
  36: [115.56, 116.59, 117.32, 118.9],
  38: [122.31, 123.65, 123.82, 124.01, 126.0],
};

/** Electrons per shell for 1–56: subshells filled in Madelung order with the known 4d/3d exceptions. */
const ORDER_SUB = [[1, 0], [2, 0], [2, 1], [3, 0], [3, 1], [4, 0], [3, 2], [4, 1], [5, 0], [4, 2], [5, 1], [6, 0]];
const EXCEPTIONS = { 24: 1, 29: 1, 41: 1, 42: 1, 44: 1, 45: 1, 46: 2, 47: 1 };
function madelung(z) {
  const out = [0, 0, 0, 0, 0, 0];
  let left = z;
  for (const [n, l] of ORDER_SUB) {
    const k = Math.min(2 * (2 * l + 1), left);
    out[n - 1] += k;
    left -= k;
    if (!left) break;
  }
  const moved = EXCEPTIONS[z];
  if (moved) {
    const outer = z < 37 ? 3 : 4;
    out[outer] -= moved;
    out[outer - 1] += moved;
  }
  return out.filter((n) => n > 0);
}

/**
 * Electrons per shell for 57–118 from the ground-state configurations, the
 * irregular ones included; 104–118 are the commonly published predictions.
 */
const CONFIG = [
  "2 8 18 18 9 2", "2 8 18 19 9 2", "2 8 18 21 8 2", "2 8 18 22 8 2", "2 8 18 23 8 2", "2 8 18 24 8 2", "2 8 18 25 8 2", "2 8 18 25 9 2",
  "2 8 18 27 8 2", "2 8 18 28 8 2", "2 8 18 29 8 2", "2 8 18 30 8 2", "2 8 18 31 8 2", "2 8 18 32 8 2", "2 8 18 32 9 2",
  "2 8 18 32 10 2", "2 8 18 32 11 2", "2 8 18 32 12 2", "2 8 18 32 13 2", "2 8 18 32 14 2", "2 8 18 32 15 2", "2 8 18 32 17 1", "2 8 18 32 18 1",
  "2 8 18 32 18 2", "2 8 18 32 18 3", "2 8 18 32 18 4", "2 8 18 32 18 5", "2 8 18 32 18 6", "2 8 18 32 18 7", "2 8 18 32 18 8",
  "2 8 18 32 18 8 1", "2 8 18 32 18 8 2",
  "2 8 18 32 18 9 2", "2 8 18 32 18 10 2", "2 8 18 32 20 9 2", "2 8 18 32 21 9 2", "2 8 18 32 22 9 2", "2 8 18 32 24 8 2", "2 8 18 32 25 8 2", "2 8 18 32 25 9 2",
  "2 8 18 32 27 8 2", "2 8 18 32 28 8 2", "2 8 18 32 29 8 2", "2 8 18 32 30 8 2", "2 8 18 32 31 8 2", "2 8 18 32 32 8 2", "2 8 18 32 32 8 3",
  "2 8 18 32 32 10 2", "2 8 18 32 32 11 2", "2 8 18 32 32 12 2", "2 8 18 32 32 13 2", "2 8 18 32 32 14 2", "2 8 18 32 32 15 2", "2 8 18 32 32 16 2", "2 8 18 32 32 17 2",
  "2 8 18 32 32 18 2", "2 8 18 32 32 18 3", "2 8 18 32 32 18 4", "2 8 18 32 32 18 5", "2 8 18 32 32 18 6", "2 8 18 32 32 18 7", "2 8 18 32 32 18 8",
].map((s) => s.split(" ").map(Number));
export const shells = (z) => (z < FIRST ? madelung(z) : CONFIG[z - FIRST]);
/** From here on the configurations are predicted, not measured. */
export const PREDICTED = 104;
