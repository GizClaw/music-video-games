/** Section boundaries for Prime Time, matching the song video. */
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

export const GOLD = "#ffc83d";
export const COLORS = { gold: GOLD, orange: "#ff8a3d", red: "#ff4d6d", cyan: "#7fe8ff", ink: "#120a28", violet: "#9b5cff", white: "#ffffff" };

export const isPrime = (n) => {
  if (n < 2) return false;
  for (let d = 2; d * d <= n; d++) if (n % d === 0) return false;
  return true;
};
export const PRIMES = Array.from({ length: 100 }, (_, i) => i + 1).filter(isPrime);

/** Prime factors in order: 12 -> [2, 2, 3]. */
export function factorize(n) {
  const out = [];
  let rest = n;
  for (let d = 2; d * d <= rest; d++) {
    while (rest % d === 0) {
      out.push(d);
      rest /= d;
    }
  }
  if (rest > 1) out.push(rest);
  return out;
}

/** "21 = 3 × 7", "23 = 1 × 23", and for 1 that it has only one factor, in `lang`. */
export function explain(n, lang = "zh") {
  if (n === 1) return lang === "zh" ? "1 只有一个因数" : "1 has only one factor";
  if (isPrime(n)) return `${n} = 1 × ${n}`;
  return `${n} = ${factorize(n).join(" × ")}`;
}

/** Odd composites that do not end in 5: the ones that pass for primes at a glance. */
export const FAKES = [9, 21, 27, 33, 39, 49, 51, 57, 63, 69, 77, 81, 87, 91, 93, 99];

/** The primes whose multiples each chorus's two "Check the line!" sieve away, in order. */
export const SIEVES = { chorus1: [[2], [3]], chorus2: [[5], [7]], chorus3: [[2, 3], [5, 7]] };

/** Numbers the filler notes of each section draw their primes from. */
export const RANGES = {
  rules: [1, 10],
  verse1: [1, 31],
  chorus1: [1, 40],
  verse2: [32, 71],
  chorus2: [1, 71],
  verse3: [72, 100],
  chorus3: [1, 100],
  bridge: [1, 100],
  outro: [1, 100],
};

const UNITS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

/** "twenty-three" -> 23; non-number words -> null. */
export function numberWord(w) {
  const [a, b] = w.split("-");
  if (b === undefined) return UNITS.includes(a) ? UNITS.indexOf(a) : TENS[a] ?? null;
  return TENS[a] !== undefined && UNITS.indexOf(b) > 0 && UNITS.indexOf(b) < 10 ? TENS[a] + UNITS.indexOf(b) : null;
}

/** The word before any dash, lower case: "Thirty-one—lock" -> "thirty-one". */
export const wordKey = (text) => text.toLowerCase().split(/[—–]/)[0].replace(/[^a-z-]/g, "");

/** Every number the song sings, as { t, n }: "one hundred" is 100, zero is skipped. */
export function sungNumbers(cues) {
  const out = [];
  for (const c of cues) {
    c.words.forEach((w, i) => {
      const n = numberWord(wordKey(w.text));
      if (!n) return;
      const hundred = n === 1 && wordKey(c.words[i + 1]?.text ?? "").startsWith("hundred");
      out.push({ t: w.start, n: hundred ? 100 : n });
    });
  }
  return out;
}

/** Lyric words that pick up a colour; sung numbers are gold when prime and orange when not. */
export const WORD_COLORS = { prime: GOLD, primes: GOLD, itself: GOLD, composite: COLORS.orange, factors: COLORS.cyan, factor: COLORS.cyan };
