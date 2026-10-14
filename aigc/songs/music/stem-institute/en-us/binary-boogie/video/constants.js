import { NES } from "./voxel.js";

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

export const TITLE = { kicker: "STEM INSTITUTE  ·  No. 23", lines: ["BINARY", "BOOGIE"], accent: NES.yellow };
export const CHORUS_CUES = { chorus1: 8, chorus2: 20, chorus3: 28 };

const DEC = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen"];
const BINARY = /^(one|zero)(-(one|zero))*$/;

/**
 * Parse "<decimal> is <binary digits>" phrases into number announcements and per-bit
 * flips. Each digit of a hyphenated binary token uses its aligned part time, or an even
 * split of the token when the song has no word alignment.
 */
export function parseCounting(timing, cueIndices) {
  const numbers = [];
  const bits = [];
  for (const ci of cueIndices) {
    let state = "dec";
    let cur = null;
    let got = [];
    for (const w of timing.cues[ci].words) {
      if (state === "dec" && DEC.includes(w.clean)) {
        cur = { t: w.start, value: DEC.indexOf(w.clean) };
        got = [];
        state = "bin";
        continue;
      }
      if (state === "bin" && BINARY.test(w.clean)) {
        const parts = w.clean.split("-");
        const span = (w.end - w.start) / parts.length;
        parts.forEach((p, k) => got.push({ t: w.parts?.[k]?.start ?? w.start + k * span, value: p === "one" ? 1 : 0 }));
        const want = cur.value.toString(2).length;
        if (got.length >= want) {
          const offset = 4 - want;
          for (let k = 0; k < offset; k++) bits.push({ t: cur.t, index: k, value: 0 });
          got.slice(0, want).forEach((g, k) => bits.push({ t: g.t, index: offset + k, value: g.value }));
          numbers.push({ ...cur, end: got[want - 1].t });
          state = "dec";
        }
      }
    }
  }
  bits.sort((a, b) => a.t - b.t);
  return { numbers, bits };
}

/** Bit events that display `values[k]` at `times[k]`. */
export function countEvents(times, values) {
  const out = [];
  times.forEach((t, k) => {
    const v = values[k];
    for (let i = 0; i < 4; i++) out.push({ t, index: i, value: (v >> (3 - i)) & 1 });
  });
  return out;
}
