export const SECTIONS = {
  drop: 9.61,
  rules: 9.7,
  verse1: 14.4,
  chorus1: 23.32,
  verse2: 34.66,
  chorus2: 42.52,
  verse3: 54.35,
  chorus3: 70.1,
  bridge: 81.93,
  outro: 95.7,
  end: 107.0,
};
export const ORDER = ["rules", "verse1", "chorus1", "verse2", "chorus2", "verse3", "chorus3", "bridge", "outro"];
export const CHORUSES = { chorus1: 8, chorus2: 17, chorus3: 27 };

/** Cues whose number words name primes, in sung order. */
export const PRIME_CUES = [3, 4, 5, 6, 7, 12, 13, 14, 15, 16, 21, 22, 23];
export const BRIDGE_CUES = [31, 32, 33, 34, 35, 36, 37];
export const RULE_CUE = 2;
export const ONE_CUE = 25;
export const FOUR_CUE = 26;
export const SCORE_CUE = 39;

export const GOLD = "#ffc83d";

const UNITS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

/** "twenty-three" -> 23; non-number words -> null. */
export function numberWord(w) {
  const [a, b] = w.split("-");
  if (b === undefined) return UNITS.includes(a) ? UNITS.indexOf(a) : TENS[a] ?? null;
  return TENS[a] !== undefined && UNITS.indexOf(b) > 0 && UNITS.indexOf(b) < 10 ? TENS[a] + UNITS.indexOf(b) : null;
}

export const isPrime = (n) => {
  if (n < 2) return false;
  for (let d = 2; d * d <= n; d++) if (n % d === 0) return false;
  return true;
};
