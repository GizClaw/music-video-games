import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { FONT_COND, FONT_MONO } from "@gizclaw/mvg-core/hud.js";
import { clamp, easeInOut, easeOutBack, lerp, smooth } from "@gizclaw/mvg-core/timing.js";
import { CHORUSES, COUNT_LINE, FOUR, OUTRO, SECTIONS, TEAMS, TYPES, TYPE_ORDER, VERSE1, VERSE2 } from "./constants.js";
import { Pantry, Toothbrush } from "./food.js";
import { DentalModel, POST } from "./model.js";
import { LAMP, Office } from "./office.js";

// World units are centimetres; the model is a 2.5× demonstration jaw whose
// base rests on the counter top (y = 0).
const MODEL_SCALE = 0.25;
const MODEL_Y = POST * MODEL_SCALE;
const HEAD_Y = 370;
const VERB_KIND = { cut: "incisor", tear: "canine", crush: "premolar", grind: "molar" };
const TYPE_VIEW = { incisor: "front", canine: "right", premolar: "right", molar: "side" };
const VIEWS = {
  wide: { p: [0, 26, 112], t: [0, 17, 0] },
  front: { p: [0, 23, 80], t: [0, 17.5, 3] },
  right: { p: [38, 23, 70], t: [5, 17.5, 1] },
  side: { p: [64, 23, 44], t: [6, 17.5, -3] },
};

const BAND = /* glsl */ `
  varying vec2 vUv;
  void main() {
    float y = (1.0 - vUv.y) * 1920.0;
    float band = smoothstep(1180.0, 1290.0, y) * (1.0 - smoothstep(1530.0, 1640.0, y));
    gl_FragColor = vec4(0.0, 0.0, 0.0, band * 0.5);
  }`;

export class ClinicScene {
  constructor(ctx) {
    this.ctx = ctx;
    const { timing, renderer } = ctx;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#0b1214");
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.35;
    this.camera = new THREE.PerspectiveCamera(30, 9 / 16, 1, 600);
    const sun = new THREE.DirectionalLight("#dfeeff", 0.8);
    sun.position.set(-60, 70, 60);
    this.scene.add(sun, new THREE.HemisphereLight("#d8ecf0", "#5a4a44", 0.4));

    this.office = new Office(this.scene);
    this.model = new DentalModel();
    this.model.group.scale.setScalar(MODEL_SCALE);
    this.model.group.position.set(0, MODEL_Y, 0);
    this.model.toothMat.uniforms.uLamp.value.copy(LAMP);
    this.scene.add(this.model.group);

    const band = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({ transparent: true, depthTest: false, depthWrite: false, vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }", fragmentShader: BAND }),
    );
    band.renderOrder = 10;
    band.frustumCulled = false;
    this.scene.add(band);

    this.buildTimeline(timing);
    this.pantry = new Pantry(this.scene, this.bites);
    this.brush = new Toothbrush(this.scene);
    this.tmp = new THREE.Vector3();
  }

  buildTimeline(timing) {
    const cue = (i) => timing.cues[i];
    const w = (ci, word, n = 0) => timing.wordTime(ci, word, n) ?? cue(ci).start;
    const words = (ci, test) => cue(ci).words.filter((x) => test(x.clean)).map((x) => x.start);

    this.chomps = CHORUSES.flatMap((c) => [...words(c, (x) => x === "chomp"), ...words(c + 5, (x) => x === "chomp")]);
    this.bites = [];
    this.cards = [];
    for (const [ci, types, verbs] of TEAMS) {
      types.forEach((type, k) => {
        const t0 = w(ci, type);
        const next = types[k + 1] ? w(ci, types[k + 1]) : cue(ci + 1).start - 0.1;
        this.cards.push({ type, t0, t1: next });
        this.bites.push({ kind: type, t0: w(ci, verbs[k]) });
      });
    }
    VERSE2.counts.forEach((ci, k) => this.cards.push({ type: TYPE_ORDER[k], t0: cue(ci).start, t1: cue(ci + 1).start - 0.1, count: true }));
    this.cards.sort((a, b) => a.t0 - b.t0);
    this.cards.forEach((c, k) => {
      const next = this.cards[k + 1];
      if (next && next.t0 - c.t1 < 1.2) c.t1 = next.t0;
    });
    this.calls = [];
    for (const c of CHORUSES) {
      for (const verb of ["cut", "tear", "crush", "grind"]) {
        const t0 = w(c + 3, verb);
        this.bites.push({ kind: VERB_KIND[verb], t0 });
        this.calls.push({ verb, t0 });
      }
    }
    this.bites.sort((a, b) => a.t0 - b.t0);
    this.calls.forEach((c, k) => (c.t1 = this.calls[k + 1] && this.calls[k + 1].t0 - c.t0 < 1 ? this.calls[k + 1].t0 - 0.2 : c.t0 + 0.6));

    // When the shown set switches between the primary 20 and the permanent 32.
    const replace = cue(VERSE1.replace);
    this.swaps = [{ t: w(VERSE1.replace, "permanent"), to: 1, spread: replace.end - w(VERSE1.replace, "permanent") - 0.6 }];
    this.totals = [{ t0: w(VERSE1.twenty, "twenty"), n: 20 }, { t0: w(VERSE1.full, "thirty-two"), n: 32 }];
    for (const ci of [...CHORUSES.flatMap((c) => [c + 1, c + 6]), OUTRO.primary]) {
      const t20 = w(ci, "twenty");
      const t32 = w(ci, "thirty-two");
      this.swaps.push({ t: t20, to: 0, spread: 0.12 }, { t: t32, to: 1, spread: 0.18 });
      this.totals.push({ t0: t20, t1: t32, n: 20, slam: true }, { t0: t32, t1: Math.min(t32 + 1.4, cue(ci + 1)?.start ?? t32 + 1.4), n: 32, slam: true });
    }
    this.checks = [...CHORUSES.map((c) => w(c + 2, "true")), w(OUTRO.checked, "checked")];
    this.lightsOn = w(VERSE1.shapes, "shapes");
    this.jobs = [["incisor", w(VERSE1.jobs, "cut")], ["canine", w(VERSE1.jobs, "tear")], ["molar", w(VERSE1.jobs, "crush")]];
    this.roll = [cue(VERSE1.roll).start, cue(VERSE1.roll).end];
    this.start = w(VERSE1.start, "incisors");
    this.four = w(FOUR, "four");
    this.every = CHORUSES.map((c) => [cue(c + 4).start, cue(c + 5).start - 0.1]);
    this.sum = [...words(VERSE2.sum, (x) => x !== "plus"), w(VERSE2.total, "thirty-two")];
    this.plus = words(VERSE2.sum, (x) => x === "plus");
    this.grinding = w(VERSE2.counts[3], "grinding");
    const b0 = cue(VERSE2.brush).start;
    const c0 = cue(VERSE2.clean);
    this.brushing = [
      { t0: b0 - 0.2, t1: w(VERSE2.brush, "gentle"), jaw: "upper", face: 1 },
      { t0: w(VERSE2.brush, "gentle"), t1: c0.start, jaw: "lower", face: 1 },
      { t0: c0.start, t1: w(VERSE2.clean, "tongue-side"), jaw: "upper", face: 1 },
      { t0: w(VERSE2.clean, "tongue-side"), t1: c0.end + 0.3, jaw: "lower", face: -1 },
    ];
    this.count = [cue(COUNT_LINE).start, SECTIONS.chorus2 - 0.5];
    this.teamCalls = TEAMS.filter(([ci]) => ci >= 28).flatMap(([ci]) => words(ci, (x) => x === "name"));

    const views = [{ t: SECTIONS.verse1, v: VIEWS.wide, dur: 0.01 }];
    views.push({ t: this.start - 0.3, v: VIEWS.front, dur: 0.8 });
    for (const c of this.cards) views.push({ t: c.t0 - 0.3, v: VIEWS[TYPE_VIEW[c.type]], dur: 0.7 });
    for (const t of [this.four - 0.3, SECTIONS.chorus1, SECTIONS.break, cue(VERSE2.sum).start - 0.3, this.count[0] - 0.3, SECTIONS.chorus2, SECTIONS.outro]) views.push({ t, v: VIEWS.wide, dur: 0.9 });
    views.push({ t: b0 - 0.6, v: VIEWS.front, dur: 0.7 });
    views.sort((a, b) => a.t - b.t);
    views.forEach((k, i) => (k.from = i ? this.viewSeg(views[i - 1], k.t) : k.v));
    this.views = views;
  }

  viewSeg(k, t) {
    const u = easeInOut((t - k.t) / k.dur);
    return { p: k.from.p.map((a, i) => lerp(a, k.v.p[i], u)), t: k.from.t.map((a, i) => lerp(a, k.v.t[i], u)) };
  }

  viewAt(t) {
    let i = 0;
    for (let k = 0; k < this.views.length && this.views[k].t <= t; k++) i = k;
    return this.viewSeg(this.views[i], t);
  }

  /** Share of the permanent set shown for a tooth at front-to-back position f in [0, 1]. */
  permanent(t, f) {
    let v = 0;
    for (const s of this.swaps) {
      const t0 = s.t + f * s.spread;
      v = lerp(v, s.to, smooth(t0, t0 + 0.35, t));
    }
    return v;
  }

  pulse(list, t, life = 0.3) {
    let v = 0;
    for (const e of list) if (t >= e) v = Math.max(v, Math.exp(-(t - e) / life));
    return v;
  }

  window(t, t0, t1, fade = 0.2) {
    return smooth(t0 - fade, t0, t) * (1 - smooth(t1 - fade, t1, t));
  }

  card(t) {
    return this.cards.findLast((c) => t >= c.t0 - 0.05 && t < c.t1);
  }

  /** Bite point between the upper and lower teeth of a type, on the viewer's right. */
  anchor(bite) {
    const m = this.model;
    const j = { incisor: 0, canine: 2, premolar: 3, molar: 5 }[bite.kind];
    const pick = (jaw) => m.records.filter((r) => r.jaw === jaw && r.set === "permanent" && r.j === j);
    const ups = pick("upper").map((r) => m.tip(r, new THREE.Vector3()));
    const lows = pick("lower").map((r) => m.tip(r, new THREE.Vector3()));
    const side = (list) => (bite.kind === "incisor" ? list.reduce((a, b) => a.add(b), new THREE.Vector3()).multiplyScalar(1 / list.length) : list.reduce((a, b) => (b.x > a.x ? b : a)));
    const p = side(ups).add(side(lows)).multiplyScalar(0.5);
    const out = bite.kind === "incisor" ? new THREE.Vector3(0, 0.15, 1).normalize() : new THREE.Vector3(1, 0.1, 0.35).normalize();
    return { p, out };
  }

  /** The brush head on the arch: position, the direction it scrubs toward and along the row. */
  brushAt(t) {
    const seg = this.brushing.find((s) => t >= s.t0 && t < s.t1) ?? (t < this.brushing[0].t0 ? this.brushing[0] : this.brushing.at(-1));
    const on = smooth(this.brushing[0].t0 - 0.4, this.brushing[0].t0, t) * (1 - smooth(this.brushing.at(-1).t1 - 0.2, this.brushing.at(-1).t1 + 0.3, t));
    const jaw = seg.jaw === "upper" ? this.model.upper : this.model.lower;
    const u = clamp((t - seg.t0) / (seg.t1 - seg.t0), 0, 1);
    const s = lerp(0.16, 0.84, u) + Math.sin(t * 26) * 0.006;
    const p = jaw.curve.getPointAt(s);
    const tan = jaw.curve.getTangentAt(s);
    const out = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
    const reach = seg.face > 0 ? 5.6 : -5.0;
    const local = new THREE.Vector3(p.x + out.x * reach, 5 + Math.cos(t * 26) * 0.8, p.z + out.z * reach);
    const world = local.applyMatrix4(jaw.body.matrixWorld);
    const face = out.clone().multiplyScalar(-seg.face).transformDirection(jaw.body.matrixWorld);
    const along = tan.clone().transformDirection(jaw.body.matrixWorld);
    return { p: world, face, along, on, seg, s };
  }

  update(t, section) {
    const { timing } = this.ctx;
    const kick = timing.pulse(t, 0.12);
    const bf = timing.beatFloat(t);
    const chorus = section.startsWith("chorus");
    const m = this.model;
    const card = this.card(t);

    // Jaw: resting gape, chomps and bites snap it shut, molar bites grind sideways.
    let close = 0;
    for (const e of [...this.chomps, ...this.bites.map((b) => b.t0), ...this.jobs.map((j) => j[1])]) {
      const dt = t - e;
      if (dt > -0.12 && dt < 0.4) close = Math.max(close, dt < 0 ? smooth(-0.12, 0, dt) : 1 - smooth(0.06, 0.34, dt));
    }
    let slide = 0;
    for (const b of this.bites) if (b.kind === "molar" && t >= b.t0 && t < b.t0 + 0.7) slide = Math.sin((t - b.t0) * 28) * (1 - (t - b.t0) / 0.7);
    if (t >= this.grinding && t < this.grinding + 0.9) slide = Math.sin((t - this.grinding) * 22) * (1 - (t - this.grinding) / 0.9);
    const near = card && !card.count ? smooth(card.t0 - 0.3, card.t0 + 0.2, t) * (1 - smooth(card.t1 - 0.2, card.t1 + 0.4, t)) : 0;
    const gape = (section === "break" ? 1.1 : chorus ? 0.92 + 0.08 * Math.cos(bf * Math.PI) : 0.85) * (1 - near * 0.3);
    m.pose(gape * (1 - close * 0.97), slide);
    const swing = section === "break" ? Math.sin(((t - SECTIONS.break) / (SECTIONS.verse2 - SECTIONS.break)) * Math.PI * 2) * 0.55 * smooth(SECTIONS.break, SECTIONS.break + 0.6, t) : 0;
    m.group.rotation.set(0, swing + Math.sin(t * 0.4) * 0.05, 0);
    m.group.position.y = MODEL_Y + (section === "break" ? Math.abs(Math.sin(bf * Math.PI)) * 1.2 : kick * 0.35);
    m.group.updateMatrixWorld(true);

    // Per-type emphasis.
    const typeLit = {};
    const typeFlash = {};
    for (const type of TYPE_ORDER) {
      let lit = smooth(this.lightsOn - 0.1, this.lightsOn + 0.3, t) * 0.32;
      let flash = 0;
      if (card && card.type === type) {
        lit = 1;
        flash = Math.exp(-Math.max(0, t - card.t0) / 0.3);
      }
      for (const [jt, e] of this.jobs) if (jt === type) lit = Math.max(lit, this.window(t, e, e + 0.6, 0.1));
      if (t >= this.lightsOn && t < this.lightsOn + 2.2) lit = Math.max(lit, this.window(t, this.lightsOn + TYPE_ORDER.indexOf(type) * 0.3, this.lightsOn + 2.2));
      if (section === "verse2" || section === "break" || section === "outro") lit = Math.max(lit, 0.7);
      for (const [a, b] of this.every) lit = Math.max(lit, this.window(t, a, b));
      if (t >= this.four - 0.1 && t < SECTIONS.chorus1) lit = Math.max(lit, 0.85);
      for (const c of this.calls) if (VERB_KIND[c.verb] === type && t >= c.t0 - 0.05 && t < c.t1) {
        lit = 1;
        flash = Math.max(flash, 0.5 * Math.exp(-(t - c.t0) / 0.2));
      }
      typeLit[type] = lit;
      typeFlash[type] = flash;
    }

    const chompFlash = this.pulse(this.chomps, t, 0.2) * 0.25;
    const [r0, r1] = this.roll;
    const [n0, n1] = this.count;
    for (const jaw of [m.upper, m.lower]) {
      for (const r of jaw.records) {
        const f = r.set === "primary" ? r.j / 4 : r.j / 7;
        const perm = this.permanent(t, f);
        const appear = r.set === "primary" ? 1 - perm : perm;
        let lit = typeLit[r.type];
        let flash = typeFlash[r.type] * (card?.count ? smooth(card.t0 + f * 0.8, card.t0 + f * 0.8 + 0.1, t) : 1) + chompFlash;
        if (t >= r0 && t < r1 + 0.5) {
          const rt = lerp(r0, r1, f);
          flash = Math.max(flash, t >= rt ? Math.exp(-(t - rt) / 0.3) : 0);
          lit = Math.max(lit, smooth(rt - 0.05, rt + 0.1, t) * 0.8);
        }
        if (r.num && t >= n0 && t < n1 + 0.6) {
          const ct = lerp(n0, n1, (r.num - 1) / 31);
          flash = Math.max(flash, t >= ct ? Math.exp(-(t - ct) / 0.25) : 0);
          lit = Math.max(lit, smooth(ct - 0.03, ct + 0.05, t));
        }
        let shine = 0;
        if (r.set === "permanent" && t >= this.brushing[0].t0) {
          const seg = this.brushing.find((s) => s.jaw === r.jaw && t >= s.t0);
          if (seg) {
            const pass = lerp(seg.t0, seg.t1, clamp((0.5 + r.s / jaw.len - 0.16) / 0.68, 0, 1));
            if (t >= pass) shine = Math.exp(-(t - pass) / 1.6);
          }
        }
        jaw.setTooth(r, appear, lit, flash, shine);
      }
    }
    m.commit();

    this.pantry.update(t, (b) => this.anchor(b));
    this.brush.update(t, (tt) => this.brushAt(tt));
    this.office.update(t, chorus ? kick : 0);

    // Camera: keyed views, punch-ins on chomps and bites.
    const view = this.viewAt(t);
    const punch = this.pulse([...this.chomps, ...this.bites.map((b) => b.t0)], t, 0.18);
    const p = new THREE.Vector3(...view.p);
    const target = new THREE.Vector3(...view.t);
    const dir = p.clone().sub(target);
    dir.multiplyScalar(1 - punch * (chorus ? 0.08 : 0.05) - kick * 0.01);
    p.copy(target).add(dir);
    p.x += Math.sin(t * 0.35) * 2.5;
    p.y += Math.cos(t * 0.27) * 1.2;
    this.camera.position.copy(p);
    this.camera.lookAt(target);
    if (punch > 0.3) this.camera.rotation.z += Math.sin(t * 70) * 0.006 * punch;
    this.camera.updateMatrixWorld();
    this.scene.updateMatrixWorld();

    const post = { bloom: [chorus ? 0.65 : 0.5, 0.4, 0.72], ca: 0.08 + kick * (chorus ? 0.3 : 0.15), vignette: 0.42, grain: 0.025 };
    const start = SECTIONS[section];
    if (start !== undefined && t - start < 0.3) post.flash = Math.exp(-(t - start) / 0.1) * 0.35;
    const bite = this.pulse(this.bites.map((b) => b.t0), t, 0.08);
    if (bite > 0.05) {
      post.flash = Math.max(post.flash ?? 0, bite * 0.1);
      const last = this.bites.findLast((b) => b.t0 <= t);
      const [sx, sy] = this.screen(this.anchor(last).p);
      post.shock = [sx / 1080, 1 - sy / 1920, (t - last.t0) * 1.4, 0.7];
    }
    this.drawHud(t, section, card);
    return post;
  }

  screen(v) {
    this.tmp.copy(v).project(this.camera);
    return [(this.tmp.x * 0.5 + 0.5) * 1080, (-this.tmp.y * 0.5 + 0.5) * 1920];
  }

  /** Total teeth shown in the headline counter. */
  total(t) {
    if (t >= this.count[0] && t < SECTIONS.chorus2) return { n: clamp(Math.floor(((t - this.count[0]) / (this.count[1] - this.count[0])) * 31) + 1, 1, 32), label: "COUNTED", color: "#ffffff" };
    const last = this.totals.findLast((e) => e.t0 <= t);
    if (!last || last.n === 20) return { n: 20, label: "PRIMARY TEETH", color: "#e8f2ff" };
    return { n: 32, label: "PERMANENT TEETH", color: "#ffe08a" };
  }

  drawHud(t, section, card) {
    const { hud } = this.ctx;
    const chorus = section.startsWith("chorus");
    const a = smooth(SECTIONS.verse1, SECTIONS.verse1 + 0.4, t);

    // Headline: the named team, or the running total.
    if (card && !chorus) {
      const ty = TYPES[card.type];
      const k = clamp((t - card.t0) / 0.25, 0, 1);
      const s = 0.6 + 0.4 * easeOutBack(k);
      const fade = this.window(t, card.t0, card.t1, 0.15);
      hud.text(ty.name, 540, HEAD_Y - 20, { size: Math.round(112 * s), weight: 800, family: FONT_COND, color: ty.color, alpha: fade, glow: 26, tracking: 3 });
      hud.text(`${ty.verb}  ·  ${ty.count} TEETH`, 540, HEAD_Y + 64, { size: 36, weight: 700, family: FONT_MONO, color: "#ffffff", alpha: fade * smooth(card.t0 + 0.1, card.t0 + 0.3, t) });
    } else if (!chorus && section !== "break" && !(t >= this.sum[0] - 0.1 && t < this.brushing[0].t0)) {
      const tot = this.total(t);
      const last = this.totals.findLast((e) => e.t0 <= t);
      const pop = last ? Math.exp(-(t - last.t0) / 0.25) : 0;
      const tick = t >= this.count[0] && t < SECTIONS.chorus2 ? Math.exp(-(((t - this.count[0]) / (this.count[1] - this.count[0])) * 31 % 1) * 2) : 0;
      const teams = section === "prechorus" || (section === "bridge" && t < this.count[0] - 0.2);
      const fade = teams ? 0 : a;
      hud.text(String(tot.n), 540, HEAD_Y - 20, { size: Math.round(150 * (1 + pop * 0.18 + tick * 0.06)), weight: 800, family: FONT_COND, color: tot.color, alpha: fade, glow: 24 + pop * 30 });
      hud.text(tot.label, 540, HEAD_Y + 70, { size: 30, weight: 700, family: FONT_MONO, color: "#bfe8ff", alpha: fade * 0.9, tracking: 4 });
    }

    // Chorus call-outs.
    if (chorus) {
      for (const e of this.totals) if (e.slam && t >= e.t0 && t < e.t1 + 0.2) hud.slam(String(e.n), t, e.t0, e.t1, { y: HEAD_Y - 30, size: 170, color: e.n === 20 ? "#bfe8ff" : "#ffd23f", sub: e.n === 20 ? "PRIMARY TEETH" : "PERMANENT TEETH", angle: -0.04 });
      for (const c of this.calls) if (t >= c.t0 - 0.02 && t < c.t1 + 0.2) hud.slam(`${c.verb.toUpperCase()}!`, t, c.t0, c.t1, { y: HEAD_Y - 20, size: 170, color: TYPES[VERB_KIND[c.verb]].color, angle: -0.05 });
      this.chomps.forEach((c, k) => hud.stamp("CHOMP!", t, c, { x: k % 2 ? 740 : 340, y: 340, size: 80, color: k % 2 ? "#ff7a8a" : "#3dd8ff", angle: k % 2 ? 0.12 : -0.12, life: 0.45 }));
    }
    for (const c of this.checks) hud.stamp("✓", t, c, { x: 870, y: 360, size: 120, color: "#6bff8f", angle: -0.1, life: 0.7 });
    for (const n of this.teamCalls) if (t >= n && t < n + 0.8) hud.slam("NAME THE TEAM!", t, n, n + 0.6, { y: HEAD_Y - 20, size: 100, color: "#ffffff", angle: -0.03 });

    const job = this.every.find(([a, b]) => t >= a - 0.2 && t < b + 0.2);
    if (job) this.drawRow(t, TYPE_ORDER.map((type, k) => ({ text: TYPES[type].verb, sub: `${TYPES[type].count} ${TYPES[type].name}`, color: TYPES[type].color, t0: job[0] + k * 0.15, size: 66 })), this.window(t, job[0], job[1]));
    if (t >= this.sum[0] - 0.1 && t < this.brushing[0].t0) {
      const items = [];
      TYPE_ORDER.forEach((type, k) => {
        items.push({ text: String(TYPES[type].count), sub: TYPES[type].name, color: TYPES[type].color, t0: this.sum[k] });
        items.push({ text: k < 3 ? "+" : "=", color: "#ffffff", t0: k < 3 ? this.plus[k] : this.sum[4], op: true });
      });
      items.push({ text: "32", sub: "TOTAL", color: "#ffd23f", t0: this.sum[4] });
      this.drawRow(t, items, this.window(t, this.sum[0], this.brushing[0].t0, 0.25));
    }
  }

  /** A row of numbers across the headline: the team counts, the sum and its total. */
  drawRow(t, items, alpha) {
    const { hud } = this.ctx;
    const n = items.length;
    const gap = Math.min(220, 860 / Math.max(1, n - 1));
    items.forEach((it, k) => {
      const a = alpha * smooth(it.t0 - 0.05, it.t0 + 0.12, t);
      if (a <= 0) return;
      const x = 540 + (k - (n - 1) / 2) * gap;
      const pop = t >= it.t0 ? Math.exp(-(t - it.t0) / 0.25) : 0;
      hud.text(it.text, x, HEAD_Y - 20, { size: Math.round((it.op ? 70 : it.size ?? 104) * (1 + pop * 0.3)), weight: 800, family: FONT_COND, color: it.color, alpha: a, glow: it.op ? 0 : 18 + pop * 24 });
      if (it.sub) hud.text(it.sub, x, HEAD_Y + 62, { size: 20, weight: 700, family: FONT_MONO, color: it.color, alpha: a * 0.9, tracking: 1 });
    });
  }
}
