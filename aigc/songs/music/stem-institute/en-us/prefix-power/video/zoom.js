import * as THREE from "three";
import { FONT_COND, FONT_MONO, SAFE } from "@gizclaw/mvg-core/hud.js";
import { clamp, easeInOut, lerp, smooth } from "@gizclaw/mvg-core/timing.js";
import { PREFIXES, SECTIONS, TITLE, hueOf, lengthLabel, pow10 } from "./constants.js";
import { POWERS_FRAG } from "./powers.js";

// Screen row (px from the top) the zoom is centred on; 10^E m spans 900 px.
const HERO_Y = 754;
const PX_PER_E = 900;
const CHORUS_CUES = { chorus1: 10, chorus2: 23, chorus3: 34 };
const RULER = [-9, -6, -3, -2, -1, 0, 1, 2, 3, 6, 9, 12];
const RULER_SYM = { [-9]: "n", [-6]: "µ", [-3]: "m", [-2]: "c", [-1]: "d", 0: "1", 1: "da", 2: "h", 3: "k", 6: "M", 9: "G", 12: "T" };

export class ZoomScene {
  constructor(ctx) {
    this.ctx = ctx;
    const { timing } = ctx;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 9 / 16, 0.1, 100);
    this.uniforms = {
      uRes: { value: new THREE.Vector2(1080, 1920) },
      uE: { value: 0 },
      uTime: { value: 0 },
      uKick: { value: 0 },
      uSpin: { value: 0 },
      uCenterY: { value: 1920 - HERO_Y },
    };
    const quad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
        fragmentShader: POWERS_FRAG,
        depthTest: false,
        depthWrite: false,
      }),
    );
    quad.frustumCulled = false;
    this.scene.add(quad);
    this.buildSchedule(timing);
  }

  buildSchedule(timing) {
    const cue = (i) => timing.cues[i];
    const snap = (t) => {
      const i = timing.beatIndexAt(t);
      const cands = [timing.beatTime(i), timing.beatTime(i + 1)];
      const best = cands.reduce((a, b) => (Math.abs(b - t) < Math.abs(a - t) ? b : a));
      return Math.abs(best - t) < 0.25 ? best : t;
    };
    const K = [];
    const add = (t, E, dur = 0.42) => K.push({ t, E, dur });
    this.drops = [];
    this.prefixAt = [];
    const verseLine = (ci, exp, next) => {
      const p = PREFIXES.find((x) => x.exp === exp);
      this.prefixAt.push({ t: cue(ci).start, p });
      add(cue(ci).start, exp, 0.35);
      const d = snap(timing.wordTime(ci, "drop") ?? cue(ci).end - 0.3);
      this.drops.push(d);
      add(d, next, 0.38);
    };

    add(0, -9.7, 0);
    add(SECTIONS.drop, -9.0, 1.6);
    [[2, -9, -6], [3, -6, -3], [4, -3, -2], [5, -2, -1], [6, -1, 0]].forEach(([ci, e, n]) => verseLine(ci, e, n));
    add(cue(7).start, -3, 1.2);
    add(cue(8).start, 0, 1.2);

    this.chorusInfo = {};
    for (const [name, ci] of Object.entries(CHORUS_CUES)) {
      const start = SECTIONS[name];
      add(start, 0, 0.5);
      const d = snap(timing.wordTime(ci, "drop") ?? cue(ci).end - 0.3);
      this.drops.push(d);
      add(d, 3, 0.35);
      add(cue(ci + 1).start, 4.5, cue(ci + 1).end - cue(ci + 1).start);
      const smalls = ["nano", "micro", "milli"].map((w) => timing.wordTime(ci + 2, w));
      const talls = ["kilo", "mega", "giga", "tera"].map((w) => timing.wordTime(ci + 3, w)).filter((x) => x !== null);
      smalls.forEach((t, i) => t !== null && add(t, [-9, -6, -3][i], 0.22));
      talls.forEach((t, i) => add(t, [3, 6, 9, 12][i], 0.22));
      const sweep = cue(ci + 4);
      add(sweep.start, 0, sweep.end - sweep.start);
      this.chorusInfo[name] = {
        start,
        drop: d,
        small: timing.wordTime(ci + 2, "small") ?? cue(ci + 2).end - 0.4,
        tall: timing.wordTime(ci + 3, "tall") ?? cue(ci + 3).end - 0.4,
        smalls,
        talls,
        sweep: sweep.start,
        sweepEnd: sweep.end,
      };
    }

    add(SECTIONS.verse2, 1, 0.4);
    [[15, 1, 2], [16, 2, 3], [17, 3, 6], [18, 6, 9], [19, 9, 12], [20, 12, 12.8]].forEach(([ci, e, n]) => verseLine(ci, e, n));
    add(cue(21).start, 13.3, 3.5);

    const bridgeExp = [-9, -6, -3, 3, 6];
    this.bridgeLines = [28, 29, 30, 31, 32].map((ci, i) => ({ t: cue(ci).start, exp: bridgeExp[i], text: cue(ci).text }));
    this.bridgeLines.forEach((b) => add(b.t, b.exp, 0.6));
    const sb = timing.beatIndexAt(cue(33).start) + 1;
    this.bridgeSteps = [-9, -6, -3, 0, 3, 6].map((e, i) => ({ t: timing.beatTime(sb + i), E: e }));
    this.bridgeSteps.forEach((s) => add(s.t, s.E, 0.18));

    const o = cue(39);
    const stop = timing.wordTime(39, "stop") ?? o.end - 0.3;
    add(o.start, -9, 0.3);
    add(o.start + 0.3, 12, stop - o.start - 0.3);
    this.outro = { start: o.start, stop, drop: snap(timing.wordTime(40, "drop") ?? cue(40).end - 0.5) };
    add(this.outro.drop, 14, 0.6);
    this.drops.push(this.outro.drop);

    K.sort((a, b) => a.t - b.t);
    this.keys = K;
  }

  E(t) {
    const K = this.keys;
    let i = 0;
    while (i < K.length - 1 && K[i + 1].t <= t) i++;
    const from = i === 0 ? K[0].E : this.settled(i - 1);
    const k = K[i].dur > 0 ? easeInOut((t - K[i].t) / K[i].dur) : 1;
    return lerp(from, K[i].E, k);
  }

  settled(i) {
    const K = this.keys;
    if (i < 0) return K[0].E;
    const next = K[i + 1];
    if (next && next.t < K[i].t + K[i].dur) {
      const from = this.settled(i - 1);
      return lerp(from, K[i].E, easeInOut((next.t - K[i].t) / K[i].dur));
    }
    return K[i].E;
  }

  update(t, section) {
    const { timing, hud } = this.ctx;
    const kick = timing.pulse(t, 0.12);
    const E = this.E(t);
    const speed = (E - this.E(t - 1 / 30)) * 30;
    const chorus = this.chorusInfo[section];

    const u = this.uniforms;
    u.uE.value = E;
    u.uTime.value = t;
    u.uKick.value = kick;
    u.uSpin.value = Math.sin(t * 0.3) * 0.08 + t * 0.02 + clamp(speed, -6, 6) * 0.01;

    const post = { bloom: [0.55, 0.45, 0.72], ca: 0.2 + kick * 0.4 + clamp(Math.abs(speed) * 0.1, 0, 1.2), vignette: 0.45, zoom: 1 + clamp(Math.abs(speed), 0, 8) * 0.004 };
    for (const d of this.drops) {
      if (t >= d && t < d + 0.6) {
        const age = t - d;
        post.flash = Math.max(post.flash || 0, Math.exp(-age / 0.07) * 0.55);
        post.shock = [0.5, 1 - HERO_Y / 1920, age * 1.5, Math.exp(-age / 0.35) * 1.4];
        post.glitch = Math.max(post.glitch || 0, Math.exp(-age / 0.1) * 0.5);
      }
    }
    const sectionStart = SECTIONS[section];
    if (sectionStart !== undefined && t - sectionStart < 0.3) post.flash = Math.max(post.flash || 0, Math.exp(-(t - sectionStart) / 0.1) * 0.6);
    if (section === "outro" && t >= this.outro.stop && t < this.outro.stop + 0.5) {
      post.glitch = 0.8 * (1 - (t - this.outro.stop) / 0.5);
      post.sat = 0.2;
    }
    if (section === "outro" && t > SECTIONS.end - 0.3) post.flash = Math.max(post.flash || 0, smooth(SECTIONS.end - 0.3, SECTIONS.end, t));

    this.drawHud(t, section, E, kick);
    return post;
  }

  drawHud(t, section, E, kick) {
    const { hud } = this.ctx;
    const ctx = hud.ctx;
    const cy = HERO_Y;
    const fpx = PX_PER_E / 2;

    // Decade brackets with length labels.
    for (const k of [Math.floor(E + 0.5), Math.floor(E + 0.5) + 1]) {
      const half = fpx * Math.pow(10, k - E);
      const a = smooth(60, 120, half) * (1 - smooth(560, 760, half));
      if (a <= 0) continue;
      const c = new THREE.Color().setHSL(hueOf(k), 1, 0.65).getStyle();
      ctx.save();
      ctx.globalAlpha = a;
      ctx.strokeStyle = c;
      ctx.lineWidth = 4;
      ctx.shadowColor = c;
      ctx.shadowBlur = 14;
      const L = Math.min(48, half * 0.3);
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        ctx.beginPath();
        ctx.moveTo(540 + sx * half, cy + sy * half - sy * L);
        ctx.lineTo(540 + sx * half, cy + sy * half);
        ctx.lineTo(540 + sx * half - sx * L, cy + sy * half);
        ctx.stroke();
      }
      ctx.restore();
      const ly = cy + half + 30;
      hud.text(lengthLabel(k), 540 + half - 6, ly, { size: 30, weight: 700, family: FONT_MONO, color: c, align: "right", alpha: a * (1 - smooth(1120, 1180, ly)), glow: 10 });
    }

    // Log ruler from nano to tera.
    const y = SAFE.top + 70;
    const x0 = 110;
    const x1 = 970;
    const xOf = (e) => x0 + ((e + 10) / 23) * (x1 - x0);
    hud.keepout(x0, y - 40, x1, y + 115);
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
    ctx.stroke();
    for (const e of RULER) {
      const on = clamp(1 - Math.abs(E - e) * 1.2, 0, 1);
      const c = new THREE.Color().setHSL(hueOf(e), 1, 0.65).getStyle();
      ctx.fillStyle = c;
      ctx.globalAlpha = 0.5 + on * 0.5;
      ctx.fillRect(xOf(e) - 2, y - 10 - on * 8, 4, 20 + on * 16);
      hud.font(Math.round(22 + on * 10), 700, FONT_MONO);
      ctx.textAlign = "center";
      ctx.fillText(RULER_SYM[e], xOf(e), y + 36);
    }
    const ix = xOf(clamp(E, -10, 13));
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = "#ffffff";
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.moveTo(ix, y - 18);
    ctx.lineTo(ix - 12, y - 38);
    ctx.lineTo(ix + 12, y - 38);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    hud.text(`${pow10(Math.round(E))} m`, 540, y + 92, { size: 40, weight: 700, family: FONT_MONO, color: "#ffffff", glow: 14, alpha: 0.9 });

    if (section === "verse1") hud.title(t, SECTIONS.verse1 + 0.1, this.prefixAt[0].t + 1.6, { ...TITLE, y: SAFE.top + 230 });

    // Prefix slams and DROP stamps.
    this.prefixAt.forEach(({ t: pt, p }, i) => {
      const next = this.prefixAt[i + 1]?.t ?? pt + 3;
      const c = new THREE.Color().setHSL(hueOf(p.exp), 1, 0.62).getStyle();
      hud.slam(p.label, t, pt, Math.min(next, pt + 2.6) - 0.1, { y: 1060, size: 150, color: c, sub: `${pow10(p.exp)} m  ·  ${p.sym}`, angle: i % 2 ? 0.04 : -0.05 });
    });
    this.drops.forEach((d, i) => hud.stamp("DROP!", t, d, { x: 540, y: 560, size: 140, color: i % 2 ? "#ff4fd8" : "#3de8ff", angle: i % 2 ? 0.12 : -0.12, life: 0.55 }));

    const chorus = this.chorusInfo[section];
    if (chorus) {
      hud.stamp("SMALL!", t, chorus.small, { x: 540, y: 600, size: 150, color: "#3de8ff", angle: -0.1, life: 0.8 });
      hud.stamp("TALL!", t, chorus.tall, { x: 540, y: 600, size: 170, color: "#ff4fd8", angle: 0.1, life: 0.8 });
      [...chorus.smalls, ...chorus.talls].forEach((wt, i) => {
        if (wt === null) return;
        const exps = [-9, -6, -3, 3, 6, 9, 12];
        const p = PREFIXES.find((x) => x.exp === exps[i]);
        const c = new THREE.Color().setHSL(hueOf(p.exp), 1, 0.62).getStyle();
        hud.slam(p.label, t, wt, wt + 0.32, { y: 1060, size: 140, color: c, sub: pow10(p.exp), angle: i % 2 ? 0.05 : -0.05 });
      });
    }
    if (section === "bridge") {
      this.bridgeLines.forEach((b, i) => {
        const next = this.bridgeLines[i + 1]?.t ?? b.t + 2.5;
        const zeros = b.exp < 0 ? `0.${"0".repeat(-b.exp - 1)}1 m` : `1${"0".repeat(b.exp)} m`;
        hud.slam(zeros.replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1 "), t, b.t + 0.2, next - 0.15, { y: 1060, size: 76, color: "#ffffff", sub: lengthLabel(b.exp), family: FONT_MONO, angle: 0 });
      });
      this.bridgeSteps.forEach((s, i) => i > 0 && hud.stamp("×1000", t, s.t, { x: 540, y: 600, size: 110, color: "#ffd23f", angle: i % 2 ? 0.08 : -0.08, life: 0.35 }));
    }
    if (section === "outro") {
      hud.stamp("STOP!", t, this.outro.stop, { x: 540, y: 600, size: 180, color: "#ff3d5a", angle: -0.08, life: 1.2 });
      if (t >= this.outro.start && t < this.outro.stop) hud.text("n → T", 540, 640, { size: 90, weight: 800, family: FONT_COND, color: "#ffffff", glow: 24 });
    }
  }
}
