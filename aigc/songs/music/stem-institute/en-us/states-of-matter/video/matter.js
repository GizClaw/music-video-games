import * as THREE from "three";
import { FONT_COND, FONT_MONO, SAFE } from "@gizclaw/mvg-core/hud.js";
import { clamp, easeInOut, hash, smooth } from "@gizclaw/mvg-core/timing.js";
import { CHANGES, CHORUS_CUES, SECTIONS, STATES } from "./constants.js";
import { MATERIAL_FRAG, MATERIAL_VERT } from "./material.js";

// Particle magnifier: a zoomed-in view of the same material.
const LENS = { x: 842, y: 1150, r: 150 };
const LN = 49;
// Split grid (top-left origin, px) used by the chorus and outro.
const GRID = { top: 270, bottom: 1320 };

const fold = (x) => {
  const p = (((x + 1) % 4) + 4) % 4;
  return p < 2 ? p - 1 : 3 - p;
};

export class MatterScene {
  constructor(ctx) {
    this.ctx = ctx;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 9 / 16, 0.1, 10);
    this.uniforms = {
      uRes: { value: new THREE.Vector2(1080, 1920) },
      uTime: { value: 0 },
      uKick: { value: 0 },
      uOrbit: { value: 0 },
      uDist: { value: 9 },
      uLift: { value: 0.06 },
      uW: { value: new THREE.Vector4(1, 0, 0, 0) },
      uFlask: { value: 0 },
      uBoil: { value: 0 },
      uMelt: { value: 0 },
      uFrost: { value: 0 },
      uFern: { value: 0 },
      uHeat: { value: 0 },
      uSplit: { value: 0 },
      uSub: { value: 0 },
      uGrid: { value: new THREE.Vector4(0, 1920 - GRID.bottom, 1080, GRID.bottom - GRID.top) },
    };
    const quad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({ vertexShader: MATERIAL_VERT, fragmentShader: MATERIAL_FRAG, uniforms: this.uniforms, depthTest: false, depthWrite: false }),
    );
    quad.frustumCulled = false;
    this.scene.add(quad);

    this.lens = Array.from({ length: LN }, (_, i) => {
      const gx = (i % 7) - 3;
      const gy = Math.floor(i / 7) - 3;
      const ang = hash(i * 3.7) * Math.PI * 2;
      return {
        grid: [gx * 0.27 + (gy % 2 ? 0.135 : 0), gy * 0.24],
        p0: [hash(i * 1.3) * 4, hash(i * 2.9) * 4],
        v: [Math.cos(ang) * (0.9 + hash(i * 5.1)), Math.sin(ang) * (0.9 + hash(i * 5.1))],
        r: hash(i * 7.3),
        gas: i % 3 === 0,
        ion: i % 2 === 0,
      };
    });

    this.buildKeys(ctx.timing);
  }

  buildKeys(timing) {
    const cue = (i) => timing.cues[i];
    const w = (ci, word, n = 0) => timing.wordTime(ci, word, n);
    const K = [];
    const add = (t, s, dur = 0.6, energy = 0) => t !== null && K.push({ t, s, dur, energy });
    add(0, 0, 0);
    add(cue(3).start, 1, 0.9, 1);
    add(cue(5).start, 2, 0.8, 1);
    add(cue(7).start, 3, 0.6, 1);
    this.verseStates = [[cue(1).start, 0], [cue(3).start, 1], [cue(5).start, 2], [cue(7).start, 3]];
    this.flask = [cue(4).start, cue(5).start];

    this.choruses = {};
    for (const [name, ci] of Object.entries(CHORUS_CUES)) {
      let heys = [0, 1, 2].map((n) => w(ci, "hey", n));
      // Alignment can squeeze the shouted heys together; they land on half beats.
      if (heys[0] !== null && heys.some((h, k) => k && (h === null || h - heys[k - 1] < 0.15))) heys = heys.map((_, k) => heys[0] + (k * timing.period) / 2);
      add(SECTIONS[name], 0, 0.3);
      heys.forEach((h, k) => add(h, k + 1, 0.22, 1));
      const addW = w(ci + 1, "add");
      const remove = w(ci + 1, "remove");
      add(addW, 3, 0.3, 1);
      add(remove, 0, 0.4, -1);
      add(cue(ci + 2).start, 1, 0.4, 1);
      const bi = timing.beatIndexAt(cue(ci + 3).start);
      const cycle = [0, 1, 2, 3].map((k) => timing.beatTime(bi + k));
      cycle.forEach((ct, k) => add(ct, k, 0.2, 1));
      this.choruses[name] = { start: SECTIONS[name], heys, add: addW, remove, same: cue(ci + 2).start, cycle, end: { chorus1: SECTIONS.verse2, chorus2: SECTIONS.verse3, chorus3: SECTIONS.outro }[name] };
    }

    this.changes = CHANGES.map((c) => {
      const start = cue(c.cue).start;
      const at = w(c.cue, c.word) ?? cue(c.cue).end - 0.6;
      add(start - 0.02, c.from, 0.25, 0);
      add(start + 0.25, c.to, Math.max(0.5, at - start - 0.1), c.energy);
      return { ...c, start, at, end: cue(c.cue).end };
    });
    const v2 = timing.beatIndexAt(cue(18).start);
    this.nameCycle = [0, 1, 2, 3].map((k) => timing.beatTime(v2 + k));
    this.nameCycle.forEach((ct, k) => add(ct, k, 0.2, 1));
    this.noLiquid = cue(25).start;
    const fb = timing.beatIndexAt(cue(26).start);
    this.forward = [0, 1, 2, 3].map((k) => timing.beatTime(fb + k));
    this.forward.forEach((ct, k) => add(ct, k % 2 ? 2 : 0, 0.25, k % 2 ? 1 : -1));

    this.outroWords = ["solid", "liquid", "gas", "plasma"].map((x) => w(31, x));
    this.outroWords.forEach((ot, k) => add(ot, k, 0.3, 1));
    this.split = cue(32).start;
    K.sort((a, b) => a.t - b.t);
    this.keys = K;
  }

  stateAt(t) {
    const K = this.keys;
    let i = 0;
    while (i < K.length - 1 && K[i + 1].t <= t) i++;
    let prev = K[0].s;
    for (let j = 0; j < i; j++) prev = K[j].s;
    const e = K[i].dur > 0 ? easeInOut((t - K[i].t) / K[i].dur) : 1;
    const energy = e < 1 ? K[i].energy : 0;
    return { from: prev, to: K[i].s, e, energy, since: t - K[i].t };
  }

  weights(st) {
    const w = [0, 0, 0, 0];
    w[st.from] += 1 - st.e;
    w[st.to] += st.e;
    return w;
  }

  // Lens particle position for one state, in lens units (-1..1).
  lensPos(p, s, t, kick) {
    if (s === 0) {
      const v = 0.018 + kick * 0.05;
      return [p.grid[0] + Math.sin(t * 26 + p.r * 40) * v, p.grid[1] + Math.cos(t * 21 + p.r * 30) * v];
    }
    if (s === 1) {
      const a = t * 0.45 * (1.2 - Math.hypot(...p.grid)) + Math.sin(t * 1.3 + p.r * 9) * 0.25;
      const x = p.grid[0] * Math.cos(a) - p.grid[1] * Math.sin(a);
      const y = p.grid[0] * Math.sin(a) + p.grid[1] * Math.cos(a);
      return [x * 0.95 + Math.sin(t * 2.1 + p.r * 7) * 0.04, y * 0.95 + Math.cos(t * 1.7 + p.r * 5) * 0.04];
    }
    const sp = s === 3 ? (p.ion ? 0.5 : 2.6) : 1.25;
    return [fold(p.p0[0] + p.v[0] * sp * t) * 0.78, fold(p.p0[1] + p.v[1] * sp * t) * 0.78];
  }

  update(t, section) {
    const { timing, hud } = this.ctx;
    const u = this.uniforms;
    const kick = timing.pulse(t, 0.12);
    const st = this.stateAt(t);
    const w = this.weights(st);
    const ch = this.choruses[section];

    const splitChorus = ch && t >= ch.same && t < ch.cycle[0] ? 1 : 0;
    const splitOutro = section === "outro" && t >= this.split ? 1 : 0;
    const split = Math.max(splitChorus, splitOutro);

    u.uTime.value = t;
    u.uKick.value = kick;
    u.uW.value.set(...w);
    u.uMelt.value = clamp(Math.min(w[0], w[1]) * 2.5, 0, 1);
    u.uBoil.value = clamp(Math.min(w[1], w[2]) * 2.5, 0, 1);
    u.uSub.value = clamp(Math.min(w[0], w[2]) * 2.5, 0, 1);
    u.uFrost.value = st.to === 0 && st.from !== 0 ? Math.sin(Math.PI * st.e) : 0;
    u.uFlask.value = smooth(this.flask[0] - 0.1, this.flask[0] + 0.6, t) * (1 - smooth(this.flask[1] - 0.1, this.flask[1] + 0.5, t));
    const dep = this.changes.find((c) => c.word === "deposition");
    u.uFern.value = smooth(dep.at - 0.6, dep.at + 1.4, t) * (1 - smooth(dep.end - 0.3, dep.end + 0.4, t));

    let heat = st.energy * Math.sin(Math.PI * st.e);
    if (ch && ch.add !== null && t >= ch.add && t < (ch.remove ?? ch.same)) heat = 1;
    if (ch && ch.remove !== null && t >= ch.remove && t < ch.same) heat = -1;
    u.uHeat.value = heat;
    u.uSplit.value = split;

    // Camera: slow orbit with a push on each transition; bar cuts in the chorus.
    let orbit = t * 0.16;
    if (ch) {
      const rel = timing.beatIndexAt(t) - timing.beatIndexAt(ch.start + 0.01);
      orbit = [0.0, 0.9, -0.8, 0.45][Math.floor(rel / 4) % 4] + t * 0.05;
    }
    u.uOrbit.value = orbit;
    u.uDist.value = 9 - kick * 0.25 - (st.e < 1 ? Math.sin(st.e * Math.PI) * 0.8 : 0);

    const bi = timing.beatIndexAt(t);
    const off = (timing.beatTime(bi) + timing.beatTime(bi + 1)) / 2;
    const offPulse = t >= off ? Math.exp(-(t - off) / 0.07) : 0;
    const post = { bloom: [0.75, 0.5, 0.62], ca: 0.18 + kick * 0.3 + w[3] * 0.4, vignette: 0.5, flash: offPulse * 0.05, grain: 0.03 };
    if (st.since >= 0 && st.since < 0.12 && st.e < 1) post.flash = Math.max(post.flash, 0.12);
    const start = SECTIONS[section];
    if (start !== undefined && t - start < 0.3) post.flash = Math.max(post.flash, Math.exp(-(t - start) / 0.1) * 0.5);
    const next = { verse1: "chorus1", chorus1: "verse2", verse2: "chorus2", chorus2: "verse3", verse3: "chorus3", chorus3: "outro", outro: "end" }[section];
    if (t > SECTIONS[next] - 0.25) post.flash = Math.max(post.flash, smooth(SECTIONS[next] - 0.25, SECTIONS[next], t) * 0.5);
    if (w[3] > 0.5) post.glitch = kick * 0.2;
    if (split && (t - (splitOutro ? this.split : ch.same)) < 0.12) post.flash = Math.max(post.flash, 0.3);

    this.drawHud(t, section, st, w, heat, split, kick);
    return post;
  }

  drawLens(t, w, kick, opacity) {
    if (opacity <= 0) return;
    const { hud } = this.ctx;
    const ctx = hud.ctx;
    const { x, y, r } = LENS;
    hud.keepout(x - r - 10, y - r - 10, x + r + 10, y + r + 40);
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    const bg = ctx.createRadialGradient(x, y - r * 0.3, r * 0.1, x, y, r);
    bg.addColorStop(0, "rgba(20,28,48,0.92)");
    bg.addColorStop(1, "rgba(4,6,14,0.95)");
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.clip();

    const colors = STATES.map((s) => new THREE.Color(s.color));
    const mix = new THREE.Color();
    for (const p of this.lens) {
      let px = 0, py = 0, qx = 0, qy = 0, alpha = 0, rad = 0;
      mix.setRGB(0, 0, 0);
      for (let s = 0; s < 4; s++) {
        if (w[s] <= 0) continue;
        const a = this.lensPos(p, s, t, kick);
        const b = this.lensPos(p, s, t - 0.05, kick);
        px += a[0] * w[s];
        py += a[1] * w[s];
        qx += b[0] * w[s];
        qy += b[1] * w[s];
        const vis = s === 2 ? (p.gas ? 1 : 0) : s === 3 ? (p.ion || p.gas ? 1 : 0) : 1;
        alpha += vis * w[s];
        const size = s === 3 ? (p.ion ? 0.085 : 0.04) : 0.075;
        rad += size * w[s];
        const c = s === 3 && !p.ion ? new THREE.Color("#7fe8ff") : colors[s];
        mix.r += c.r * w[s];
        mix.g += c.g * w[s];
        mix.b += c.b * w[s];
      }
      if (alpha < 0.02) continue;
      const sx = x + px * r;
      const sy = y + py * r;
      const style = `rgb(${Math.round(mix.r * 255)},${Math.round(mix.g * 255)},${Math.round(mix.b * 255)})`;
      const moving = w[2] + w[3];
      if (moving > 0.05) {
        ctx.globalAlpha = opacity * alpha * moving * 0.45;
        ctx.strokeStyle = style;
        ctx.lineWidth = rad * r * 0.9;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(x + qx * r, y + qy * r);
        ctx.lineTo(sx, sy);
        ctx.stroke();
      }
      ctx.globalAlpha = opacity * alpha;
      const g = ctx.createRadialGradient(sx - rad * r * 0.3, sy - rad * r * 0.3, 0, sx, sy, rad * r);
      g.addColorStop(0, "#ffffff");
      g.addColorStop(0.35, style);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(sx, sy, rad * r * (1 + kick * 0.15), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Bezel with ticks and the zoom label.
    ctx.save();
    ctx.globalAlpha = opacity;
    const tint = STATES[w.indexOf(Math.max(...w))].color;
    ctx.strokeStyle = tint;
    ctx.shadowColor = tint;
    ctx.shadowBlur = 18;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 2;
    ctx.globalAlpha = opacity * 0.6;
    for (let k = 0; k < 48; k++) {
      const a = (k / 48) * Math.PI * 2 + t * 0.2;
      const l = k % 4 ? 8 : 16;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * (r + 8), y + Math.sin(a) * (r + 8));
      ctx.lineTo(x + Math.cos(a) * (r + 8 + l), y + Math.sin(a) * (r + 8 + l));
      ctx.stroke();
    }
    ctx.restore();
    hud.text("× 1 000 000 000", x, y + r + 26, { size: 22, weight: 700, family: FONT_MONO, color: "#ffffff", alpha: opacity * 0.75 });
  }

  drawHud(t, section, st, w, heat, split, kick) {
    const { hud } = this.ctx;
    const ctx = hud.ctx;
    const active = st.e > 0.5 ? st.to : st.from;

    // State rail.
    STATES.forEach((s, k) => {
      const x = 170 + k * 247;
      const on = split ? 1 : k === active ? 1 : 0;
      ctx.save();
      ctx.globalAlpha = 0.4 + on * 0.6;
      ctx.fillStyle = s.color;
      ctx.shadowColor = s.color;
      ctx.shadowBlur = on ? 24 : 0;
      ctx.fillRect(x - 100, SAFE.top + 30, 200, 6 + on * 6);
      ctx.restore();
      hud.text(s.label, x, SAFE.top + 70, { size: 30 + on * 6, weight: 800, family: FONT_COND, color: on ? s.color : "#ffffff", alpha: 0.55 + on * 0.45, glow: on ? 14 : 0 });
    });

    const lensOn = smooth(SECTIONS.verse1 + 0.2, SECTIONS.verse1 + 0.8, t) * (split ? 0 : 1);
    this.drawLens(t, w, kick, lensOn);

    if (heat) {
      const hot = heat > 0;
      const a = Math.min(1, Math.abs(heat) * 1.5);
      const ex = 230;
      const ey = LENS.y;
      hud.text(hot ? "+ ENERGY" : "− ENERGY", ex, ey, { size: 44, weight: 800, family: FONT_MONO, color: hot ? "#ffb347" : "#7fd8ff", glow: 18, alpha: a });
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = hot ? "#ffb347" : "#7fd8ff";
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = 16;
      const dy = hot ? -1 : 1;
      const bob = Math.sin(t * 12) * 6;
      ctx.beginPath();
      ctx.moveTo(ex, ey + dy * 70 + bob);
      ctx.lineTo(ex - 26, ey + dy * 40 + bob);
      ctx.lineTo(ex + 26, ey + dy * 40 + bob);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    const slamY = SAFE.top + 200;
    if (section === "verse1") {
      this.verseStates.forEach(([vt, k], i) => {
        const next = this.verseStates[i + 1]?.[0] ?? SECTIONS.chorus1;
        hud.slam(STATES[k].label, t, vt, Math.min(next - 0.2, vt + 3.2), { y: slamY, size: 140, color: STATES[k].color, sub: STATES[k].sub });
      });
    }
    this.changes.forEach((c, i) => {
      if (t < c.start - 0.1 || t > c.start + 4) return;
      const next = this.changes[i + 1]?.start ?? Infinity;
      hud.slam(c.label, t, c.at, Math.min(c.at + 1.6, next - 0.15), { y: slamY, size: c.label.length > 10 ? 104 : 124, color: STATES[c.to].color, sub: `${STATES[c.from].label.toLowerCase()} → ${STATES[c.to].label.toLowerCase()}` });
    });
    if (section === "verse3" && t >= this.noLiquid && t < this.forward[0]) {
      hud.stamp("NO LIQUID", t, this.noLiquid, { x: 540, y: 700, size: 110, color: "#3dffc8", angle: -0.1, life: this.forward[0] - this.noLiquid });
    }
    const ch = this.choruses[section];
    if (ch) {
      ch.heys.forEach((h, i) => h !== null && hud.stamp("HEY!", t, h, { x: 300 + i * 240, y: 640 + (i % 2) * 80, size: 120, color: STATES[i + 1].color, angle: -0.15 + i * 0.15, life: 0.6 }));
      if (ch.add !== null) hud.slam("ADD ENERGY", t, ch.add, (ch.remove ?? ch.add + 0.8) - 0.05, { y: slamY, size: 120, color: "#ffb347" });
      if (ch.remove !== null) hud.slam("REMOVE", t, ch.remove, ch.same - 0.1, { y: slamY, size: 130, color: "#7fd8ff" });
    }
    if (split) {
      const h = (GRID.bottom - GRID.top) / 2;
      const a = smooth(0, 0.2, t - (section === "outro" ? this.split : ch.same));
      STATES.forEach((s, k) => {
        const x = k % 2 ? 810 : 270;
        const y = GRID.top + (Math.floor(k / 2) + 1) * h - 34;
        hud.text(s.label, x, y, { size: 40, weight: 800, family: FONT_COND, color: s.color, alpha: a, glow: 16 });
      });
    }
  }
}
