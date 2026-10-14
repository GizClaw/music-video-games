export const RAINBOW = ["#ff3b3b", "#ff9a2e", "#ffe53b", "#3bff6e", "#3b9bff", "#9b5cff"];

export const BRAND = "#2cade4";

const clamp01 = (x) => Math.min(1, Math.max(0, x));
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const easeOutCubic = (t) => 1 - Math.pow(1 - clamp01(t), 3);
export const easeInCubic = (t) => Math.pow(clamp01(t), 3);
export const easeOutBack = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  t = clamp01(t);
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
export const easeInOut = (t) => {
  t = clamp01(t);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};

export function hash(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export class Timing {
  constructor(data) {
    this.data = data;
    this.fps = data.fps;
    this.duration = data.duration;
    this.beats = data.beats;
    this.period = 60 / data.tempo;
    this.onsets = data.onsets;
    // Prefer ASR-aligned word times from analysis; SRT cue starts lead the sung
    // word, so aligned cues start at their first word. Otherwise estimate by syllables.
    this.cues = data.cues.map((c) => {
      if (!c.words?.length) return { ...c, words: splitWords(c) };
      const words = c.words.map((w) => ({ ...w, clean: w.text.toLowerCase().replace(/[^a-z-]/g, "") }));
      return { ...c, srtStart: c.start, start: words[0].start, end: Math.max(c.end, words.at(-1).end), words };
    });
    this.dropBeat = 0;
  }

  /** Anchor bar counting (barPulse / barIndex) on the beat at time t. */
  setDownbeat(t) {
    this.dropBeat = this.beatIndexAt(t + 0.01);
  }

  frame(key, t) {
    const arr = this.data.frames[key];
    const f = t * this.fps;
    const i = Math.floor(f);
    if (i < 0) return arr[0];
    if (i >= arr.length - 1) return arr[arr.length - 1];
    return arr[i] + (arr[i + 1] - arr[i]) * (f - i);
  }

  /** Smoothed band value with a short attack/decay window, still a pure function of t. */
  env(key, t, window = 0.12) {
    let acc = 0;
    let w = 0;
    for (let k = 0; k <= 6; k++) {
      const dt = (k / 6) * window;
      const weight = Math.exp(-dt / (window * 0.4));
      acc += this.frame(key, t - dt) * weight;
      w += weight;
    }
    return acc / w;
  }

  spectrum(t) {
    const f = Math.min(this.data.spectrum[0].length - 1, Math.max(0, Math.round(t * this.fps)));
    return this.data.spectrum.map((row) => row[f]);
  }

  beatIndexAt(t) {
    const b = this.beats;
    let lo = 0;
    let hi = b.length - 1;
    if (t < b[0]) return -1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (b[mid] <= t) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  /** Continuous beat counter: integer values land exactly on detected beats. */
  beatFloat(t) {
    const b = this.beats;
    const i = this.beatIndexAt(t);
    if (i < 0) return (t - b[0]) / this.period;
    if (i >= b.length - 1) return i + (t - b[i]) / this.period;
    return i + (t - b[i]) / (b[i + 1] - b[i]);
  }

  beatTime(i) {
    const b = this.beats;
    if (i < 0) return b[0] + i * this.period;
    if (i >= b.length) return b[b.length - 1] + (i - b.length + 1) * this.period;
    return b[i];
  }

  sinceBeat(t) {
    const i = this.beatIndexAt(t);
    return i < 0 ? 99 : t - this.beats[i];
  }

  pulse(t, decay = 0.16) {
    return Math.exp(-this.sinceBeat(t) / decay);
  }

  /** Pulse that only fires on every nth beat counted from the drop. */
  barPulse(t, n = 4, decay = 0.25) {
    const i = this.beatIndexAt(t);
    if (i < 0) return 0;
    const rel = i - this.dropBeat;
    const k = rel - (((rel % n) + n) % n) + this.dropBeat;
    if (k < 0 || k >= this.beats.length) return 0;
    return Math.exp(-(t - this.beats[k]) / decay);
  }

  barIndex(t, n = 4) {
    return Math.floor((this.beatIndexAt(t) - this.dropBeat) / n);
  }

  onsetPulse(t, minStrength = 0.25, decay = 0.12) {
    let v = 0;
    for (const [ot, s] of this.onsets) {
      if (ot > t) break;
      if (s >= minStrength && t - ot < decay * 6) v = Math.max(v, s * Math.exp(-(t - ot) / decay));
    }
    return v;
  }

  cueAt(t, lead = 0.15, tail = 0.35) {
    for (let i = 0; i < this.cues.length; i++) {
      const c = this.cues[i];
      const next = this.cues[i + 1];
      const end = Math.min(c.end + tail, next ? next.start - lead : Infinity);
      if (t >= c.start - lead && t < end) return { cue: c, index: i, end };
    }
    return null;
  }

  /** Time a given word (case-insensitive prefix) is sung inside the cue active around t0. */
  wordTime(cueIndex, wordPrefix, nth = 0) {
    const c = this.cues[cueIndex];
    let seen = 0;
    for (const w of c.words) {
      if (w.clean.startsWith(wordPrefix)) {
        if (seen === nth) return w.start;
        seen++;
      }
    }
    return null;
  }
}

function splitWords(cue) {
  const tokens = cue.text.replace(/—/g, " — ").split(/\s+/).filter(Boolean);
  const weights = tokens.map((w) => (w === "—" ? 0.6 : syllables(w) + 0.35));
  const total = weights.reduce((a, b) => a + b, 0);
  const span = cue.end - cue.start;
  let acc = cue.start;
  return tokens.map((text, i) => {
    const start = acc;
    acc += (weights[i] / total) * span;
    return { text, start, end: acc, clean: text.toLowerCase().replace(/[^a-z-]/g, "") };
  });
}

function syllables(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0.3;
  const groups = w.replace(/e$/, "").match(/[aeiouy]+/g);
  return Math.max(1, groups ? groups.length : 1);
}
