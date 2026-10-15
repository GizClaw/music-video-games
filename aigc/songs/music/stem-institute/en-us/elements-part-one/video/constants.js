export const SECTIONS = {
  drop: 5.42,
  verse1: 5.3,
  chorus1: 35.74,
  verse2: 53.19,
  chorus2: 77.31,
  outro: 96.83,
  end: 106.08,
};
export const ORDER = ["verse1", "chorus1", "verse2", "chorus2", "outro"];

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
};

const N = "nonmetal";
const G = "noble";
const A = "alkali";
const E = "alkaline";
const T = "transition";
const P = "post";
const M = "metalloid";
const H = "halogen";

/** Elements 1–56: symbol, name, category, period, group. */
export const ELEMENTS = [
  ["H", "Hydrogen", N, 1, 1], ["He", "Helium", G, 1, 18],
  ["Li", "Lithium", A, 2, 1], ["Be", "Beryllium", E, 2, 2], ["B", "Boron", M, 2, 13], ["C", "Carbon", N, 2, 14], ["N", "Nitrogen", N, 2, 15], ["O", "Oxygen", N, 2, 16], ["F", "Fluorine", H, 2, 17], ["Ne", "Neon", G, 2, 18],
  ["Na", "Sodium", A, 3, 1], ["Mg", "Magnesium", E, 3, 2], ["Al", "Aluminum", P, 3, 13], ["Si", "Silicon", M, 3, 14], ["P", "Phosphorus", N, 3, 15], ["S", "Sulfur", N, 3, 16], ["Cl", "Chlorine", H, 3, 17], ["Ar", "Argon", G, 3, 18],
  ["K", "Potassium", A, 4, 1], ["Ca", "Calcium", E, 4, 2], ["Sc", "Scandium", T, 4, 3], ["Ti", "Titanium", T, 4, 4], ["V", "Vanadium", T, 4, 5], ["Cr", "Chromium", T, 4, 6], ["Mn", "Manganese", T, 4, 7], ["Fe", "Iron", T, 4, 8], ["Co", "Cobalt", T, 4, 9], ["Ni", "Nickel", T, 4, 10], ["Cu", "Copper", T, 4, 11], ["Zn", "Zinc", T, 4, 12], ["Ga", "Gallium", P, 4, 13], ["Ge", "Germanium", M, 4, 14], ["As", "Arsenic", M, 4, 15], ["Se", "Selenium", N, 4, 16], ["Br", "Bromine", H, 4, 17], ["Kr", "Krypton", G, 4, 18],
  ["Rb", "Rubidium", A, 5, 1], ["Sr", "Strontium", E, 5, 2], ["Y", "Yttrium", T, 5, 3], ["Zr", "Zirconium", T, 5, 4], ["Nb", "Niobium", T, 5, 5], ["Mo", "Molybdenum", T, 5, 6], ["Tc", "Technetium", T, 5, 7], ["Ru", "Ruthenium", T, 5, 8], ["Rh", "Rhodium", T, 5, 9], ["Pd", "Palladium", T, 5, 10], ["Ag", "Silver", T, 5, 11], ["Cd", "Cadmium", T, 5, 12], ["In", "Indium", P, 5, 13], ["Sn", "Tin", P, 5, 14], ["Sb", "Antimony", M, 5, 15], ["Te", "Tellurium", M, 5, 16], ["I", "Iodine", H, 5, 17], ["Xe", "Xenon", G, 5, 18],
  ["Cs", "Cesium", A, 6, 1], ["Ba", "Barium", E, 6, 2],
].map(([symbol, name, category, period, group], i) => ({ z: i + 1, symbol, name, category, period, group }));

/** Period-6 slots that Part Two fills (the lanthanide marker, then Hf to Rn). */
export const PART_TWO = [{ group: 3, label: "57–71" }, ...Array.from({ length: 15 }, (_, k) => ({ group: k + 4, label: String(72 + k) }))];

/** Verse lines that sing elements in order. */
export const ELEMENT_CUES = [1, 2, 3, 4, 5, 6, 7, 8, 13, 14, 15, 16, 17, 18];
export const CHORUSES = { chorus1: 9, chorus2: 19 };
export const OUTRO = { faster: 23, done: 24 };

/** Magnesium and Aluminum were stamped on the same instant; times from the vocal stem. */
export const RETIME_WORDS = { 3: { 3: 15.05 }, 4: { 0: 15.9 } };

/** Electrons per shell, filling subshells in Madelung order with the known 4d/3d exceptions. */
const ORDER_SUB = [[1, 0], [2, 0], [2, 1], [3, 0], [3, 1], [4, 0], [3, 2], [4, 1], [5, 0], [4, 2], [5, 1], [6, 0]];
const EXCEPTIONS = { 24: 1, 29: 1, 41: 1, 42: 1, 44: 1, 45: 1, 46: 2, 47: 1 };
export function shells(z) {
  const out = [0, 0, 0, 0, 0, 0];
  let left = z;
  for (const [n, l] of ORDER_SUB) {
    const cap = 2 * (2 * l + 1);
    const k = Math.min(cap, left);
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
  return out;
}
