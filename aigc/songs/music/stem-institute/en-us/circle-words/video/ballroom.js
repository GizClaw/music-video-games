import * as THREE from "three";
import { FONT_COND, FONT_MONO } from "@gizclaw/mvg-core/hud.js";
import { clamp, easeInOut, easeOutCubic, hash, smooth } from "@gizclaw/mvg-core/timing.js";
import { BALLROOM, Stage } from "./stage.js";
import { BRIDGE, COLORS, GOLD, OUTRO, PARTS, ROLL_CALLS, ROTATE_CUE, SECTIONS, SPIN_CUES, VERSE1, VERSE2 } from "./constants.js";

// One world unit is the circle's radius, 320 px on screen; the centre sits on row 820.
const PX = 320;
const CENTER_Y = (960 - 820) / PX;
const DIST = 960 / PX / Math.tan((15 * Math.PI) / 180);
const RAD_A = Math.PI / 6;
const ARC = [(220 * Math.PI) / 180, (300 * Math.PI) / 180];
const TAN_A = (150 * Math.PI) / 180;
const TAU = Math.PI * 2;

const glslColor = (name, hex) => {
  const c = new THREE.Color(hex);
  return `const vec3 ${name} = vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)});`;
};

const BACKDROP = BALLROOM;

const FIGURE = /* glsl */ `
  varying vec2 vUv;
  uniform float uOutline, uCenter, uRad, uRadA, uFan, uFanA, uDiam, uSplit, uCirc, uCircStart, uArea, uArc, uArcGrow, uChord, uTan, uTanA, uDance, uDanceA, uFlashA, uFlashB, uArc0, uArc1;
  uniform vec4 uHA, uHB;
  uniform float uMul;
  ${glslColor("C_CENTER", GOLD)}
  ${glslColor("C_RADIUS", COLORS.radius)}
  ${glslColor("C_DIAM", COLORS.diameter)}
  ${glslColor("C_CIRC", COLORS.circumference)}
  ${glslColor("C_AREA", COLORS.area)}
  ${glslColor("C_ARC", COLORS.arc)}
  ${glslColor("C_CHORD", COLORS.chord)}
  ${glslColor("C_TAN", COLORS.tangent)}
  #define TAU 6.2831853
  const float PX = 1.0 / ${PX}.0;
  float seg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0); return length(pa - ba * h); }
  float ln(float d, float w) { return smoothstep(w + PX, w - PX, d); }
  float gl(float d, float w) { return exp(-d / w); }
  void main() {
    vec2 p = (vUv - 0.5) * 2.8;
    float r = length(p);
    float a = atan(p.y, p.x);
    if (a < 0.0) a += TAU;
    vec3 col = vec3(0.0);
    float alpha = 0.0;

    float inside = smoothstep(uArea + PX, uArea - PX, r) * step(0.001, uArea);
    col += C_AREA * inside * (0.14 + 0.24 * uHB.x) * (0.5 + 0.5 * r);
    alpha = max(alpha, inside * (0.3 + 0.2 * uHB.x));

    float dr1 = abs(r - 1.0);
    col += C_CIRC * ln(dr1, 1.3 * PX) * uOutline * 0.4;
    float fr = mod(a - uCircStart, TAU) / TAU;
    float drawn = step(fr, uCirc);
    col += C_CIRC * drawn * (ln(dr1, (2.5 + 2.0 * uHA.w) * PX) + gl(dr1, 9.0 * PX) * 0.3) * (1.0 + uHA.w);

    vec2 rd = vec2(cos(uRadA), sin(uRadA));
    float dr = seg(p, vec2(0.0), rd * uRad);
    col += C_RADIUS * (ln(dr, 3.0 * PX) + gl(dr, 8.0 * PX) * 0.4) * (1.0 + 1.3 * uHA.y) * step(0.001, uRad);
    col += vec3(1.0) * gl(length(p - rd * uRad), 6.0 * PX) * uFlashA * step(0.001, uRad);
    for (int i = 1; i < 12; i++) {
      float fi = float(i);
      float grow = clamp(uFan - fi + 1.0, 0.0, 1.0);
      if (grow <= 0.0) continue;
      vec2 fd = vec2(cos(uRadA + fi * TAU / 12.0), sin(uRadA + fi * TAU / 12.0));
      float df = seg(p, vec2(0.0), fd * grow);
      col += C_RADIUS * (ln(df, 2.0 * PX) + gl(df, 6.0 * PX) * 0.3) * uFanA * 0.8;
    }

    float dd = seg(p, vec2(-1.0, 0.0), vec2(-1.0 + 2.0 * uDiam, 0.0));
    vec3 dc = mix(C_DIAM, p.x < 0.0 ? C_RADIUS : mix(C_RADIUS, vec3(1.0, 0.8, 0.9), 0.45), uSplit);
    col += dc * (ln(dd, 3.5 * PX) + gl(dd, 9.0 * PX) * 0.4) * (1.0 + 1.3 * uHA.z) * step(0.001, uDiam);
    col += vec3(1.0) * (gl(length(p - vec2(-1.0, 0.0)), 6.0 * PX) + gl(length(p - vec2(1.0, 0.0)), 6.0 * PX)) * uFlashB * step(0.001, uDiam);

    float a1 = mix(uArc0, uArc1, uArcGrow);
    float inArc = step(mod(a - uArc0, TAU), mod(a1 - uArc0, TAU));
    col += C_ARC * inArc * (ln(dr1, 6.0 * PX) + gl(dr1, 10.0 * PX) * 0.5) * uArc * (1.0 + 1.3 * uHB.y);

    vec2 c0 = vec2(cos(uArc0), sin(uArc0));
    vec2 c1 = vec2(cos(uArc1), sin(uArc1));
    float dch = seg(p, c0, c1);
    col += C_CHORD * (ln(dch, 3.5 * PX) + gl(dch, 8.0 * PX) * 0.4) * uChord * (1.0 + 1.3 * uHB.z);
    col += vec3(1.0, 0.95, 0.7) * (ln(length(p - c0), 7.0 * PX) + ln(length(p - c1), 7.0 * PX)) * max(uChord, uArc);

    vec2 T = vec2(cos(uTanA), sin(uTanA));
    vec2 Td = vec2(-T.y, T.x);
    float dt = seg(p, T - Td * 0.8, T + Td * 0.8);
    col += C_TAN * (ln(dt, 3.5 * PX) + gl(dt, 8.0 * PX) * 0.4) * uTan * (1.0 + 1.3 * uHB.w);
    float dash = step(0.5, fract(dot(p, T) * 14.0));
    col += C_TAN * ln(seg(p, vec2(0.0), T), 1.8 * PX) * dash * uTan * 0.6;
    float L = 0.08;
    float sq = min(seg(p, T - T * L, T - T * L + Td * L), seg(p, T - T * L + Td * L, T + Td * L));
    col += vec3(1.0) * ln(sq, 1.8 * PX) * uTan * 0.8;
    col += vec3(1.0) * ln(length(p - T), 8.0 * PX) * uTan;

    col += C_CENTER * (ln(r, 9.0 * PX) + gl(r, 12.0 * PX) * 0.8) * uCenter * (1.0 + 1.5 * uHA.x);

    vec2 D = vec2(cos(uDanceA), sin(uDanceA));
    float behind = mod(uDanceA - a, TAU);
    float trail = exp(-behind * 2.2) * gl(dr1, 5.0 * PX);
    col += vec3(1.0, 0.92, 0.75) * (trail * 0.9 + gl(length(p - D), 9.0 * PX) * 1.6) * uDance;

    alpha = max(alpha, clamp(max(col.r, max(col.g, col.b)), 0.0, 1.0));
    gl_FragColor = vec4(col, alpha) * uMul;
  }`;

const LABELS = {
  center: "CENTER",
  radius: "RADIUS",
  diameter: "DIAMETER",
  circumference: "CIRCUMFERENCE",
  area: "AREA",
  arc: "ARC",
  chord: "CHORD",
  tangent: "TANGENT",
};

export class BallroomScene {
  constructor(ctx) {
    this.ctx = ctx;
    const { timing } = ctx;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 9 / 16, 0.1, 100);

    this.bgU = { uTime: { value: 0 }, uKick: { value: 0 }, uSpin: { value: 0 }, uWarm: { value: 0 } };
    const bg = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        depthTest: false,
        depthWrite: false,
        uniforms: this.bgU,
        vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
        fragmentShader: BACKDROP,
      }),
    );
    bg.renderOrder = -1;
    bg.frustumCulled = false;
    this.scene.add(bg);

    const names = ["uOutline", "uCenter", "uRad", "uRadA", "uFan", "uFanA", "uDiam", "uSplit", "uCirc", "uCircStart", "uArea", "uArc", "uArcGrow", "uChord", "uTan", "uTanA", "uDance", "uDanceA", "uFlashA", "uFlashB", "uArc0", "uArc1"];
    this.u = Object.fromEntries(names.map((n) => [n, { value: 0 }]));
    this.u.uHA = { value: new THREE.Vector4() };
    this.u.uHB = { value: new THREE.Vector4() };
    this.u.uMul = { value: 1 };
    this.u.uRadA.value = RAD_A;
    this.u.uCircStart.value = RAD_A;
    this.u.uTanA.value = TAN_A;
    this.u.uArc0.value = ARC[0];
    this.u.uArc1.value = ARC[1];
    this.figure = new THREE.Mesh(
      new THREE.PlaneGeometry(2.8, 2.8),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        premultipliedAlpha: true,
        uniforms: this.u,
        vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
        fragmentShader: FIGURE,
      }),
    );
    this.pivot = new THREE.Group();
    this.pivot.position.set(0, CENTER_Y, 0);
    this.pivot.add(this.figure);
    this.scene.add(this.pivot);
    // Its reflection on the polished floor, foreshortened and faint.
    this.mirror = new THREE.Group();
    this.mirror.position.set(0, (960 - 1515) / PX, 0);
    this.mirror.scale.set(1, -0.7, 1);
    this.mirrorFig = new THREE.Mesh(this.figure.geometry, this.figure.material.clone());
    this.mirrorFig.material.uniforms = { ...this.u, uMul: { value: 0.16 } };
    this.mirror.add(this.mirrorFig);
    this.scene.add(this.mirror);
    this.stage = new Stage(this.scene, ctx.renderer);

    const n = 420;
    this.sparkSeed = Array.from({ length: n }, (_, i) => [hash(i * 1.3) * TAU, 1.25 + hash(i * 2.7) * 0.55, (hash(i * 4.1) - 0.5) * 0.6, 0.4 + hash(i * 6.3)]);
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.sparks = new THREE.Points(sg, new THREE.PointsMaterial({ color: "#ffe2b0", size: 0.022, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.pivot.add(this.sparks);

    this.buildTimeline(timing);
    this.tmp = new THREE.Vector3();
  }

  buildTimeline(timing) {
    const cue = (i) => timing.cues[i];
    const w = (ci, word, n = 0) => timing.wordTime(ci, word, n) ?? cue(ci).start;
    const v1 = VERSE1;
    const v2 = VERSE2;
    this.intro = {
      center: w(v1.center, "center"),
      radius: w(v1.radius, "radius"),
      diameter: w(v1.diameter, "diameter"),
      circumference: w(v2.circumference, "circumference"),
      area: w(v2.area, "area"),
      arc: w(v2.arc, "arc"),
      chord: w(v2.chord, "chord"),
      tangent: w(v2.tangent, "tangent"),
    };
    this.radius = { t0: this.intro.radius, t1: w(v1.radius, "straight") + 0.2, end: w(v1.ends, "circle"), ends: w(v1.ends, "ends") };
    this.fan = { t0: w(v1.every, "every"), t1: w(v1.every, "length"), out: cue(v1.diameter).start };
    this.diam = { t0: this.intro.diameter, t1: w(v1.diameter, "center") + 0.3, ends: [w(v1.endpoint, "endpoint"), w(v1.endpoint, "endpoint", 1)] };
    this.split = { t0: w(v1.twice, "twice"), t1: cue(v1.radii).end + 0.4, radii: [w(v1.radii, "two"), w(v1.radii, "radii")] };
    this.circ = { t0: this.intro.circumference, t1: Math.max(this.intro.circumference + 1.2, cue(v2.circumference).end) };
    this.area = { t0: this.intro.area, t1: Math.max(this.intro.area + 0.8, w(v2.area, "inside")) };
    this.chordPts = [w(v2.chord, "two"), w(v2.chord, "points")];
    this.tanPoint = w(v2.tangent, "one");

    this.highlights = Object.fromEntries(PARTS.map((p) => [p, [this.intro[p]]]));
    for (const [ci, parts] of [...ROLL_CALLS, ...BRIDGE]) for (const p of parts) this.highlights[p].push(w(ci, p === "circumference" ? "circum" : p));
    this.highlights.radius.push(...this.split.radii);
    // "Seven words complete our whirl" and "Seven terms rotate": one part per beat.
    for (const ci of [v2.seven, ROTATE_CUE]) {
      const b0 = timing.beatIndexAt(cue(ci).start - 0.05) + 1;
      PARTS.forEach((p, k) => this.highlights[p].push(timing.beatTime(b0 + k * 0.5 | 0) + (k % 2) * timing.period * 0.5));
    }
    const tail = cue(OUTRO.name).end;
    const tb = timing.beatIndexAt(tail) + 1;
    for (let k = 0; timing.beatTime(tb + k) < SECTIONS.end - 0.3; k++) this.highlights[PARTS[k % PARTS.length]].push(timing.beatTime(tb + k));
    for (const p of PARTS) this.highlights[p].sort((a, b) => a - b);

    this.formulas = [
      { from: this.split.t0, to: cue(v1.radii).end + 1.2, tokens: [["d = ", this.split.t0], ["2", this.split.t0 + 0.12], ["r", w(v1.twice, "radius")]], color: COLORS.diameter },
      { from: w(v2.formulaC, "two"), to: cue(v2.formulaC).end + 1.4, tokens: [["C = ", w(v2.formulaC, "two") - 0.05], ["2", w(v2.formulaC, "two")], ["π", w(v2.formulaC, "pi")], ["r", w(v2.formulaC, "radius")]], color: COLORS.circumference },
      { from: w(v2.formulaA, "pi"), to: cue(v2.formulaA).end + 1.2, tokens: [["A = ", w(v2.formulaA, "pi") - 0.05], ["π", w(v2.formulaA, "pi")], ["r", w(v2.formulaA, "radius")], ["²", w(v2.formulaA, "squared")]], color: COLORS.area },
    ];
    this.formulaRow = { from: SECTIONS.bridge, to: SECTIONS.end };

    this.spins = SPIN_CUES.map((ci) => [cue(ci).start, cue(ci).end + 0.3]);
    this.spins.push([tail, SECTIONS.end]);
    this.spins = this.spins.map(([a, b]) => {
      const fa = timing.beatFloat(a);
      return { fa, bars: Math.max(1, Math.floor((timing.beatFloat(b) - fa) / 3)) };
    });
    this.tilt = { t0: SECTIONS.bridge, t1: SECTIONS.chorus3 };

    const ones = cue(OUTRO.turns).words[0];
    this.counts = (ones.parts?.length === 3 ? ones.parts.map((p) => p.start) : [0, 1, 2].map((k) => ones.start + k * timing.period)).map((t0, k) => [String(k + 1), t0]);
  }

  highlight(part, t) {
    let v = 0;
    for (const e of this.highlights[part]) {
      if (e > t + 0.05) break;
      v = Math.max(v, smooth(e - 0.05, e, t) * Math.exp(-Math.max(0, t - e) / 0.45));
    }
    return v;
  }

  shown(part, t) {
    return smooth(this.intro[part] - 0.05, this.intro[part] + 0.2, t);
  }

  spinAngle(t) {
    const { timing } = this.ctx;
    const bf = timing.beatFloat(t);
    let rot = 0;
    for (const s of this.spins) {
      const x = clamp((bf - s.fa) / 3, 0, s.bars);
      rot += (TAU / 3) * (Math.floor(x) + easeOutCubic((x % 1) * 1.6));
    }
    return rot;
  }

  update(t, section) {
    const { timing } = this.ctx;
    const kick = timing.pulse(t, 0.14);
    const bf = timing.beatFloat(t);
    const u = this.u;
    const v0 = SECTIONS.verse1;

    u.uOutline.value = smooth(v0, v0 + 0.8, t) * 0.35 + smooth(this.radius.end - 0.1, this.radius.end + 0.3, t) * 0.65;
    u.uCenter.value = smooth(v0, v0 + 0.5, t) * 0.4 + this.shown("center", t) * 0.6;
    const r = this.radius;
    u.uRad.value = 0.82 * easeOutCubic((t - r.t0) / (r.t1 - r.t0)) + 0.18 * smooth(r.end - 0.25, r.end, t);
    u.uFlashA.value = t >= r.ends ? Math.exp(-(t - r.ends) / 0.3) + (t >= r.end ? Math.exp(-(t - r.end) / 0.3) : 0) : 0;
    u.uFan.value = clamp((t - this.fan.t0) / (this.fan.t1 - this.fan.t0), 0, 1) * 12;
    u.uFanA.value = 1 - smooth(this.fan.out - 0.3, this.fan.out + 0.2, t);
    u.uDiam.value = easeInOut((t - this.diam.t0) / (this.diam.t1 - this.diam.t0));
    u.uFlashB.value = this.diam.ends.reduce((m, e) => Math.max(m, t >= e ? Math.exp(-(t - e) / 0.3) : 0), 0);
    u.uSplit.value = smooth(this.split.t0 - 0.05, this.split.t0 + 0.2, t) * (1 - smooth(this.split.t1 - 0.3, this.split.t1, t));
    u.uCirc.value = easeInOut((t - this.circ.t0) / (this.circ.t1 - this.circ.t0));
    u.uArea.value = easeOutCubic((t - this.area.t0) / (this.area.t1 - this.area.t0));
    u.uArc.value = this.shown("arc", t);
    u.uArcGrow.value = easeOutCubic((t - this.intro.arc) / 0.6);
    u.uChord.value = this.shown("chord", t) + this.chordPts.reduce((m, e) => Math.max(m, t >= e ? 0.8 * Math.exp(-(t - e) / 0.3) : 0), 0);
    u.uTan.value = this.shown("tangent", t) + (t >= this.tanPoint ? 0.8 * Math.exp(-(t - this.tanPoint) / 0.3) : 0);
    const h = Object.fromEntries(PARTS.map((p) => [p, this.highlight(p, t)]));
    u.uHA.value.set(h.center, h.radius, h.diameter, h.circumference);
    u.uHB.value.set(h.area, h.arc, h.chord, h.tangent);
    this.h = h;

    // The dancer draws the circumference, then keeps waltzing a lap every two bars.
    const c = this.circ;
    let danceA;
    if (t < c.t1) danceA = RAD_A + u.uCirc.value * TAU;
    else {
      const x = (bf - timing.beatFloat(c.t1)) / 3;
      danceA = RAD_A + TAU + (TAU / 2) * (Math.floor(x) + easeOutCubic(x % 1));
    }
    u.uDanceA.value = ((danceA % TAU) + TAU) % TAU;
    u.uDance.value = smooth(c.t0 - 0.1, c.t0 + 0.1, t);

    const tilt = smooth(this.tilt.t0, this.tilt.t0 + 1.2, t) * (1 - smooth(this.tilt.t1 - 1.0, this.tilt.t1, t));
    const spin = this.spinAngle(t);
    this.pivot.rotation.set(-0.75 * tilt, 0, 0);
    this.figure.rotation.set(0, 0, spin);
    this.mirror.rotation.set(0.75 * tilt, 0, 0);
    this.mirrorFig.rotation.set(0, 0, spin);
    this.sparks.rotation.set(0, 0, spin * 0.5 + bf * 0.08);
    this.pivot.scale.setScalar(1 + kick * 0.01);

    const sp = this.sparks.geometry.attributes.position;
    const ch = section.startsWith("chorus") || section === "outro";
    this.sparkSeed.forEach(([a0, rr, z, s], i) => {
      const a = a0 + t * 0.15 * s;
      const swell = rr + (ch ? Math.sin(bf * Math.PI * 0.6667 + i) * 0.04 : 0);
      sp.setXYZ(i, Math.cos(a) * swell, Math.sin(a) * swell, z);
    });
    sp.needsUpdate = true;
    this.sparks.material.opacity = ch ? 0.85 : 0.45;

    this.bgU.uTime.value = t;
    this.bgU.uKick.value = timing.barPulse(t, 3, 0.4);
    this.bgU.uSpin.value = t * 0.12 + spin * 0.2;
    this.bgU.uWarm.value = ch ? 1 : 0.3;
    this.stage.update(t, kick, ch ? 1 : 0);

    this.camera.position.set(Math.sin(t * 0.23) * 0.2, Math.cos(t * 0.19) * 0.1 - tilt * 0.3, DIST - kick * 0.08);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    this.scene.updateMatrixWorld();

    const post = { bloom: [0.75, 0.45, 0.6], ca: 0.1 + kick * 0.18, vignette: 0.5, grain: 0.025 };
    const start = SECTIONS[section];
    if (start !== undefined && t - start < 0.3) post.flash = Math.exp(-(t - start) / 0.1) * 0.4;
    for (const p of PARTS) if (t >= this.intro[p] && t < this.intro[p] + 0.15) post.flash = Math.max(post.flash || 0, 0.15);
    this.drawHud(t, section);
    return post;
  }

  screen(x, y) {
    this.tmp.set(x, y, 0).applyMatrix4(this.figure.matrixWorld).project(this.camera);
    return [(this.tmp.x * 0.5 + 0.5) * 1080, (-this.tmp.y * 0.5 + 0.5) * 1920];
  }

  /** Label anchor for each part, in the figure's local units. */
  anchor(part) {
    const rd = [Math.cos(RAD_A), Math.sin(RAD_A)];
    const mid = (a) => [Math.cos(a), Math.sin(a)];
    const am = (ARC[0] + ARC[1]) / 2;
    const T = mid(TAN_A);
    const Td = [-T[1], T[0]];
    switch (part) {
      case "center": return [0, -0.14];
      case "radius": return [rd[0] * 0.55 - rd[1] * 0.2, rd[1] * 0.55 + rd[0] * 0.2];
      case "diameter": return [-0.52, -0.1];
      case "circumference": return [Math.cos(1.3) * 1.16, Math.sin(1.3) * 1.16];
      case "area": return [0.42, -0.32];
      case "arc": return [mid(am)[0] * 1.15, mid(am)[1] * 1.15];
      case "chord": {
        const c0 = mid(ARC[0]);
        const c1 = mid(ARC[1]);
        return [(c0[0] + c1[0]) * 0.36, (c0[1] + c1[1]) * 0.36];
      }
      case "tangent": return [T[0] + Td[0] * 0.55 + T[0] * 0.12, T[1] + Td[1] * 0.55 + T[1] * 0.12];
    }
  }

  drawHud(t, section) {
    const { hud } = this.ctx;
    const v0 = SECTIONS.verse1;
    const ctx = hud.ctx;

    // Legend of the eight parts, lit as each is defined.
    const legendA = smooth(v0 + 0.2, v0 + 0.8, t);
    if (legendA > 0) {
      const rows = [PARTS.slice(0, 4), PARTS.slice(4)];
      rows.forEach((row, ri) => {
        hud.font(30, 800, FONT_COND);
        const widths = row.map((p) => ctx.measureText(LABELS[p]).width);
        const gap = 34;
        let x = 540 - (widths.reduce((a, b) => a + b, 0) + gap * (row.length - 1)) / 2;
        row.forEach((p, k) => {
          const on = this.shown(p, t);
          const hl = this.h[p];
          hud.text(LABELS[p], x + widths[k] / 2, 300 + ri * 46, { size: Math.round(30 * (1 + hl * 0.25)), weight: 800, family: FONT_COND, color: on > 0.5 ? COLORS[p] === "#ffffff" ? GOLD : COLORS[p] : "#5a5f86", alpha: legendA, glow: on > 0.5 ? 8 + hl * 18 : 0, tracking: 2 });
          x += widths[k] + gap;
        });
      });
    }

    // Formula slot above the circle.
    const fy = 425;
    const active = this.formulas.filter((f) => t >= f.from - 0.05 && t < f.to);
    const f = active.at(-1);
    if (f && t < this.formulaRow.from) {
      const a = smooth(f.from - 0.05, f.from + 0.1, t) * (1 - smooth(f.to - 0.3, f.to, t));
      hud.font(66, 800, FONT_COND);
      const pieces = f.tokens.map(([s]) => ctx.measureText(s).width);
      let x = 540 - pieces.reduce((s, v) => s + v, 0) / 2;
      f.tokens.forEach(([s, t0], k) => {
        const on = smooth(t0 - 0.03, t0 + 0.08, t);
        const pop = 1 + 0.3 * Math.exp(-Math.max(0, t - t0) / 0.15) * (t >= t0 ? 1 : 0);
        hud.text(s, x + pieces[k] / 2, s === "²" ? fy - 12 : fy, { size: Math.round(66 * pop), weight: 800, family: FONT_COND, color: k === 0 ? "#ffffff" : f.color, alpha: a * on, glow: 18 });
        x += pieces[k];
      });
    } else if (t >= this.formulaRow.from) {
      const a = smooth(this.formulaRow.from, this.formulaRow.from + 0.5, t);
      hud.text("d = 2r   ·   C = 2πr   ·   A = πr²", 540, fy, { size: 40, weight: 800, family: FONT_COND, color: GOLD, alpha: a * 0.9, glow: 10 });
    }

    // Part labels pinned to the spinning figure.
    for (const p of PARTS) {
      const on = this.shown(p, t);
      if (on <= 0) continue;
      if (p === "radius" && this.u.uSplit.value > 0.5) continue;
      const [lx, ly] = this.anchor(p);
      const [x, y] = this.screen(lx, ly);
      const hl = this.h[p];
      const big = hl > 0.25;
      const color = p === "center" ? GOLD : COLORS[p];
      hud.text(LABELS[p], x, y, { size: big ? Math.round(34 + 12 * hl) : 26, weight: big ? 800 : 700, family: big ? FONT_COND : FONT_MONO, color, alpha: on * (0.75 + 0.25 * hl), glow: big ? 16 : 6 });
    }
    if (this.u.uSplit.value > 0.01) {
      for (const sx of [-0.5, 0.5]) {
        const [x, y] = this.screen(sx, 0.12);
        hud.text("r", x, y, { size: 52, weight: 800, family: FONT_COND, color: COLORS.radius, alpha: this.u.uSplit.value, glow: 16 });
      }
    } else if (this.shown("radius", t) > 0) {
      const rd = [Math.cos(RAD_A), Math.sin(RAD_A)];
      const [x, y] = this.screen(rd[0] * 0.55 + rd[1] * 0.14, rd[1] * 0.55 - rd[0] * 0.14);
      hud.text("r", x, y, { size: 44, weight: 800, family: FONT_COND, color: COLORS.radius, alpha: this.shown("radius", t) * 0.9, glow: 12 });
    }

    // "One-two-three" in the outro.
    for (const [s, t0] of this.counts) hud.stamp(s, t, t0, { x: 180 + Number(s) * 180, y: 1020, size: 80, color: GOLD, angle: -0.05, life: 0.9 });
    if (section === "outro" && t > this.counts[2][1] + 1) {
      const a = smooth(this.counts[2][1] + 1, this.counts[2][1] + 1.5, t);
      hud.text("ROUND THE CIRCLE", 540, 1190, { size: 58, weight: 800, family: FONT_COND, color: GOLD, alpha: a, glow: 18, tracking: 6 });
    }
  }
}
