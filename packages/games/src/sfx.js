const MUTED_KEY = "mvg-universe-muted";
const PENTA = [0, 2, 4, 7, 9];

/** Frequency of step `i` up the major pentatonic from C5; steps wrap into higher octaves. */
const note = (i, base = 523.25) => base * 2 ** ((Math.floor(i / 5) * 12 + PENTA[((i % 5) + 5) % 5]) / 12);

/**
 * Synthesised interface and game sounds: no files, nothing plays until
 * `unlock()` runs inside a user gesture. Honours the site-wide mute stored
 * under `mvg-universe-muted`.
 */
export class Sfx {
  constructor(volume = 0.55) {
    this.ctx = null;
    this.volume = volume;
    this.lastHover = 0;
  }

  get muted() {
    return localStorage.getItem(MUTED_KEY) === "1";
  }

  /** Call from user gestures. */
  unlock() {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
        this.out = this.ctx.createGain();
        this.out.gain.value = this.volume;
        const comp = this.ctx.createDynamicsCompressor();
        comp.threshold.value = -14;
        comp.ratio.value = 4;
        this.out.connect(comp);
        comp.connect(this.ctx.destination);
        const n = this.ctx.sampleRate;
        this.noiseBuf = this.ctx.createBuffer(1, n, n);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      } catch {
        this.ctx = null;
      }
    }
    if (this.ctx?.state === "suspended") this.ctx.resume();
  }

  /** Start time for a sound, or null when sound is off. */
  at(delay = 0) {
    if (!this.ctx || this.ctx.state !== "running" || this.muted) return null;
    return this.ctx.currentTime + delay;
  }

  env(t, gain, attack, dur, pan) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    if (pan) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      p.connect(this.out);
    } else g.connect(this.out);
    return g;
  }

  tone(t, { type = "sine", f0, f1, dur = 0.2, gain = 0.1, attack = 0.004, pan = 0, lp = 0 }) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = this.env(t, gain, attack, dur, pan);
    if (lp) {
      const f = this.ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = lp;
      o.connect(f);
      f.connect(g);
    } else o.connect(g);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noise(t, { f0, f1, dur = 0.3, gain = 0.1, q = 1, attack = 0.01, type = "bandpass", pan = 0 }) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    s.connect(f);
    f.connect(this.env(t, gain, attack, dur, pan));
    s.start(t);
    s.stop(t + dur + 0.05);
  }

  /** A struck bell: a sine with a quick, quieter octave partial. */
  bell(t, f, gain = 0.1, dur = 0.5, pan = 0) {
    this.tone(t, { f0: f, dur, gain, pan });
    this.tone(t, { type: "triangle", f0: f * 2, dur: dur * 0.35, gain: gain * 0.3, pan });
  }

  // ---------- interface ----------

  hover(i = 2) {
    const now = performance.now();
    if (now - this.lastHover < 45) return;
    this.lastHover = now;
    const t = this.at();
    if (t == null) return;
    this.tone(t, { f0: note(i) * 2, dur: 0.07, gain: 0.035 });
    this.tone(t, { type: "triangle", f0: note(i) * 4, dur: 0.03, gain: 0.012 });
  }

  click() {
    const t = this.at();
    if (t == null) return;
    this.tone(t, { type: "triangle", f0: 1800, f1: 900, dur: 0.05, gain: 0.06 });
    this.tone(t, { f0: 180, f1: 90, dur: 0.09, gain: 0.12 });
  }

  select(i = 0) {
    const t = this.at();
    if (t == null) return;
    this.bell(t, note(i), 0.07, 0.4);
    this.bell(t + 0.07, note(i + 2), 0.06, 0.45);
  }

  slide(dir = 1) {
    const t = this.at();
    if (t == null) return;
    this.noise(t, { f0: dir > 0 ? 500 : 2600, f1: dir > 0 ? 2600 : 500, dur: 0.3, gain: 0.1, q: 1.4, attack: 0.05, pan: dir * 0.3 });
    this.tone(t, { f0: dir > 0 ? 330 : 440, f1: dir > 0 ? 440 : 330, dur: 0.22, gain: 0.03 });
  }

  denied() {
    const t = this.at();
    if (t == null) return;
    this.tone(t, { type: "square", f0: 220, dur: 0.08, gain: 0.04, lp: 900 });
    this.tone(t + 0.09, { type: "square", f0: 175, dur: 0.12, gain: 0.04, lp: 900 });
  }

  /** Diving in: a rising rush that ends on a sparkle. */
  enter() {
    const t = this.at();
    if (t == null) return;
    this.noise(t, { f0: 300, f1: 4000, dur: 0.9, gain: 0.1, q: 0.9, attack: 0.3 });
    this.tone(t, { f0: 110, f1: 440, dur: 0.9, gain: 0.06, attack: 0.3 });
    [7, 9, 12].forEach((s, k) => this.bell(t + 0.7 + k * 0.06, note(s), 0.04, 0.5, (k - 1) * 0.4));
  }

  back() {
    const t = this.at();
    if (t == null) return;
    this.noise(t, { f0: 3500, f1: 300, dur: 0.6, gain: 0.08, q: 0.9, attack: 0.05 });
    this.tone(t, { f0: 440, f1: 120, dur: 0.5, gain: 0.05, attack: 0.05 });
  }

  /** Through the portal into a game. */
  warp() {
    const t = this.at();
    if (t == null) return;
    this.noise(t, { f0: 200, f1: 7000, dur: 1.4, gain: 0.13, q: 0.7, attack: 0.5 });
    this.tone(t, { type: "sawtooth", f0: 70, f1: 700, dur: 1.4, gain: 0.05, attack: 0.5, lp: 1800 });
    this.tone(t + 1.2, { f0: 70, f1: 32, dur: 0.8, gain: 0.25 });
    [0, 4, 7, 12].forEach((s, k) => this.bell(t + 1.25 + k * 0.05, note(s, 261.63) * 2, 0.05, 0.9, (k - 1.5) * 0.35));
  }

  /** The opening gate bursts. */
  gate() {
    const t = this.at();
    if (t == null) return;
    this.tone(t, { f0: 90, f1: 35, dur: 1.2, gain: 0.3 });
    this.noise(t, { f0: 6000, f1: 1500, dur: 1.6, gain: 0.06, q: 0.6, attack: 0.02, type: "highpass" });
    [0, 2, 4, 5, 7, 10].forEach((s, k) => this.bell(t + k * 0.07, note(s), 0.06, 1.2, ((k % 3) - 1) * 0.5));
  }

  // ---------- games ----------

  /** A light tap on body `i` that had no note. */
  tap(i = 0) {
    const t = this.at();
    if (t == null) return;
    this.bell(t, note(i), 0.035, 0.18);
  }

  /** Note `i` (0 lowest) caught; `perfect` adds a sparkle on top. */
  hit(i = 0, perfect = true) {
    const t = this.at();
    if (t == null) return;
    const pan = Math.max(-0.6, Math.min(0.6, (i - 3.5) * 0.17));
    this.bell(t, note(i), 0.12, 0.55, pan);
    if (perfect) this.tone(t + 0.02, { f0: note(i) * 4, dur: 0.14, gain: 0.03, pan });
  }

  /** A button or tile pressed down: a sharp click over a short thump. */
  press() {
    const t = this.at();
    if (t == null) return;
    this.noise(t, { f0: 3200, f1: 1200, dur: 0.035, gain: 0.12, q: 1.4, attack: 0.001 });
    this.tone(t, { type: "triangle", f0: 1500, f1: 700, dur: 0.03, gain: 0.05 });
    this.tone(t + 0.005, { f0: 190, f1: 70, dur: 0.11, gain: 0.24 });
  }

  /** A stamp: something knocked down for the player, a dull thud with a papery slap. */
  stamp() {
    const t = this.at();
    if (t == null) return;
    this.tone(t, { f0: 130, f1: 55, dur: 0.16, gain: 0.2 });
    this.noise(t, { f0: 900, f1: 400, dur: 0.06, gain: 0.07, q: 0.8, type: "lowpass" });
  }

  /** An 8-bit square blip at step `i`, with a quick octave chirp when `perfect`. */
  chip(i = 0, perfect = true) {
    const t = this.at();
    if (t == null) return;
    this.tone(t, { type: "square", f0: note(i), dur: 0.16, gain: 0.05, lp: 4000 });
    if (perfect) this.tone(t + 0.03, { type: "square", f0: note(i) * 2, dur: 0.06, gain: 0.025, lp: 5000 });
  }

  /** An 8-bit laser: a square wave diving from high to low. */
  laser() {
    const t = this.at();
    if (t == null) return;
    this.tone(t, { type: "square", f0: 1800, f1: 220, dur: 0.14, gain: 0.04, lp: 5000 });
  }

  /** A pixel explosion: crunchy noise over a thump, bigger for bosses. */
  boom(big = false) {
    const t = this.at();
    if (t == null) return;
    this.noise(t, { f0: big ? 2200 : 3200, f1: 180, dur: big ? 0.7 : 0.32, gain: big ? 0.2 : 0.12, q: 0.6, attack: 0.003, type: "lowpass" });
    this.tone(t, { f0: big ? 120 : 160, f1: 40, dur: big ? 0.5 : 0.22, gain: big ? 0.3 : 0.18 });
  }

  /** A deep stomp with a bright edge, for hits on the Sun. */
  stomp() {
    const t = this.at();
    if (t == null) return;
    this.tone(t, { f0: 160, f1: 45, dur: 0.35, gain: 0.32 });
    this.noise(t, { f0: 900, dur: 0.08, gain: 0.08, type: "lowpass" });
    this.tone(t, { type: "triangle", f0: 1046.5, dur: 0.2, gain: 0.025 });
  }

  wrong() {
    const t = this.at();
    if (t == null) return;
    this.tone(t, { type: "square", f0: 300, f1: 150, dur: 0.2, gain: 0.05, lp: 1400 });
    this.tone(t, { type: "square", f0: 312, f1: 156, dur: 0.2, gain: 0.04, lp: 1400 });
  }

  miss() {
    const t = this.at();
    if (t == null) return;
    this.tone(t, { f0: 210, f1: 120, dur: 0.14, gain: 0.04 });
  }

  /** Something earned: an arpeggio rising from step `i`. */
  collect(i = 0) {
    const t = this.at();
    if (t == null) return;
    [0, 2, 4, 7].forEach((s, k) => this.bell(t + k * 0.065, note(i + s), 0.08, 0.6, (k - 1.5) * 0.25));
  }

  combo() {
    const t = this.at();
    if (t == null) return;
    [10, 12, 14, 17].forEach((s, k) => this.tone(t + k * 0.04, { f0: note(s), dur: 0.12, gain: 0.03 }));
  }

  /** Countdown tick; 0 is the higher "go". */
  count(n) {
    const t = this.at();
    if (t == null) return;
    this.bell(t, n > 0 ? 880 : 1760, 0.06, n > 0 ? 0.15 : 0.4);
  }

  start() {
    const t = this.at();
    if (t == null) return;
    [0, 2, 4, 7, 9, 12].forEach((s, k) => this.bell(t + k * 0.05, note(s), 0.06, 0.5));
  }

  /** Results: a major arpeggio, brighter for a better grade. */
  result(good = true) {
    const t = this.at();
    if (t == null) return;
    const steps = good ? [0, 2, 4, 5, 7, 10] : [4, 2, 0];
    steps.forEach((s, k) => this.bell(t + k * 0.09, note(s), 0.08, 0.9));
  }

  /** A run cleared: a cymbal swell under a fanfare that climbs an octave. */
  clear() {
    const t = this.at();
    if (t == null) return;
    this.noise(t, { f0: 6000, f1: 9000, dur: 0.9, gain: 0.05, type: "highpass", attack: 0.05 });
    [0, 2, 4, 7, 10].forEach((s, k) => this.bell(t + k * 0.08, note(s), 0.09, 0.7, (k - 2) * 0.2));
    this.tone(t + 0.4, { type: "triangle", f0: note(10), dur: 0.9, gain: 0.06 });
  }

  /** A run lost: a heavy thud, then a sad trombone of three falling slurs. */
  fail() {
    const t = this.at();
    if (t == null) return;
    this.tone(t, { f0: 120, f1: 38, dur: 0.5, gain: 0.32 });
    this.noise(t, { f0: 500, f1: 120, dur: 0.4, gain: 0.08, type: "lowpass" });
    [392, 370, 349].forEach((f, k) => this.tone(t + 0.25 + k * 0.28, { type: "sawtooth", f0: f, f1: f * 0.94, dur: 0.26, gain: 0.05, lp: 1200 }));
    this.tone(t + 1.09, { type: "sawtooth", f0: 330, f1: 262, dur: 0.7, gain: 0.05, lp: 1000 });
  }
}

/** One shared instance for the site and its games. */
export const sfx = new Sfx();
