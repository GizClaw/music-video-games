import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { FONT_COND, FONT_MONO } from "@gizclaw/mvg-core/hud.js";
import { clamp, easeInOut, easeOutCubic, hash, lerp, smooth } from "@gizclaw/mvg-core/timing.js";
import { BRIDGE, CHORUSES, KIND, ORDER, OUTRO, SECTIONS, VERSE1, VERSE2, kindOf } from "./constants.js";

// One world unit is the protractor radius, 340 px on screen; the vertex sits on
// screen row 860.
const PX = 340;
const VERTEX_Y = (960 - 860) / PX;
const DIST = 960 / PX / Math.tan((15 * Math.PI) / 180);
const STAMP_Y = 640;

const BACKDROP = /* glsl */ `
  uniform float uTime, uKick, uGlow; varying vec2 vUv;
  float h21(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
  float plateau(float x, float c, float w, float h) { return h * smoothstep(c - w - 0.025, c - w, x) * (1.0 - smoothstep(c + w, c + w + 0.025, x)); }
  float box(vec2 p, vec2 c, vec2 b, float r) { vec2 d = abs(p - c) - b + r; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r; }
  float cactus(vec2 p, vec2 base, float s) {
    p = (p - base) / s;
    float d = box(p, vec2(0.0, 130.0), vec2(22.0, 130.0), 20.0);
    d = min(d, box(p, vec2(-34.0, 110.0), vec2(30.0, 13.0), 12.0));
    d = min(d, box(p, vec2(-56.0, 150.0), vec2(13.0, 52.0), 12.0));
    d = min(d, box(p, vec2(32.0, 80.0), vec2(28.0, 12.0), 11.0));
    d = min(d, box(p, vec2(52.0, 112.0), vec2(12.0, 40.0), 11.0));
    return d * s;
  }
  void main() {
    float hz = 0.385;
    vec2 P = vUv * vec2(1080.0, 1920.0);
    float k = clamp((vUv.y - hz) / (1.0 - hz), 0.0, 1.0);
    vec3 low = vec3(1.0, 0.46, 0.2);
    vec3 sky = mix(low, vec3(0.42, 0.1, 0.3), smoothstep(0.0, 0.28, k));
    sky = mix(sky, vec3(0.04, 0.02, 0.1), smoothstep(0.25, 0.85, k));
    vec2 sp = (vUv - vec2(0.5, hz + 0.018)) * vec2(0.5625, 1.0);
    float sd = length(sp);
    float bands = step(0.5, fract((vUv.y - hz) * 90.0)) + step(vUv.y, hz + 0.03);
    float disk = smoothstep(0.112, 0.106, sd) * mix(0.6, 1.0, clamp(bands, 0.0, 1.0));
    sky = mix(sky, vec3(0.78, 0.36, 0.2), disk * 0.85);
    sky += vec3(0.6, 0.22, 0.12) * exp(-sd * 7.0) * (0.22 + uKick * 0.08 + uGlow * 0.1);
    vec2 g = vUv * vec2(70.0, 124.0);
    float s = h21(floor(g));
    float tw = 0.55 + 0.45 * sin(uTime * 2.4 + s * 50.0);
    sky += vec3(1.0, 0.95, 0.9) * step(0.982, s) * smoothstep(0.62, 0.9, vUv.y) * tw * smoothstep(0.3, 0.0, length(fract(g) - 0.5));
    float x = vUv.x;
    float mesa = plateau(x, 0.13, 0.1, 0.055) + plateau(x, 0.27, 0.035, 0.03) + plateau(x, 0.84, 0.1, 0.07) + plateau(x, 0.68, 0.035, 0.028);
    mesa += 0.006 * sin(x * 70.0) * step(0.001, mesa);
    vec3 col = sky;
    if (vUv.y < hz + mesa) {
      col = vec3(0.12, 0.035, 0.11) + low * 0.12 * smoothstep(hz + mesa - 0.006, hz + mesa, vUv.y);
    }
    if (vUv.y < hz) {
      float d = hz - vUv.y;
      col = mix(vec3(0.2, 0.07, 0.12), vec3(0.04, 0.015, 0.05), smoothstep(0.0, 0.3, d));
      col += low * 0.05 * (0.5 + 0.5 * sin(16.0 / (d + 0.03) + uTime * 0.4)) * smoothstep(0.0, 0.06, d) * (1.0 - smoothstep(0.1, 0.35, d));
      col += low * 0.25 * exp(-d * 60.0);
    }
    float c = min(cactus(P, vec2(118.0, 1920.0 - 1250.0), 1.0), cactus(vec2(1080.0 - P.x, P.y), vec2(112.0, 1920.0 - 1215.0), 0.72));
    float rim = smoothstep(5.0, 0.0, abs(c + 2.5)) * 0.35;
    col = mix(col, vec3(0.05, 0.02, 0.06), smoothstep(1.0, -1.0, c));
    col += low * rim * smoothstep(1.0, -1.0, c - 3.0);
    gl_FragColor = vec4(col, 1.0);
  }`;

const PROTRACTOR = /* glsl */ `
  uniform float uAngle, uReveal, uKick, uRange0, uRange1, uRangeA, uGhost, uGhostA, uSquare, uLower, uLine, uHalfGhost, uRing;
  uniform vec3 uFill, uRangeColor;
  varying vec2 vUv;
  #define PI 3.14159265
  #define TAU 6.2831853
  float seg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
  float tick(float m, float r, float len, float w, float px) { return step(1.0 - len, r) * step(r, 1.0) * smoothstep(w + px, w - px, radians(m) * r); }
  void main() {
    vec2 p = (vUv - 0.5) * 2.8;
    float px = 1.0 / 340.0;
    float r = length(p);
    float a = atan(p.y, p.x);
    if (a < 0.0) a += TAU;
    float deg = degrees(a);
    float A = radians(uAngle);
    float upper = deg <= 180.0 + 0.2 ? 1.0 : uLower;
    float shown = upper * step(deg, uReveal * 360.0);
    vec3 col = vec3(0.0);
    float alpha = 0.0;

    float disc = smoothstep(1.0 + px, 1.0 - px, r) * shown;
    col += vec3(0.07, 0.035, 0.1) * disc * 0.55;
    alpha = max(alpha, disc * 0.55);

    float m5 = abs(mod(deg + 2.5, 5.0) - 2.5);
    float m10 = abs(mod(deg + 5.0, 10.0) - 5.0);
    float m45 = abs(mod(deg + 22.5, 45.0) - 22.5);
    float m90 = abs(mod(deg + 45.0, 90.0) - 45.0);
    float t = max(max(tick(m5, r, 0.045, 1.2 * px, px), tick(m10, r, 0.085, 1.6 * px, px)), max(tick(m45, r, 0.14, 2.2 * px, px), tick(m90, r, 0.2, 3.0 * px, px)));
    float rings = smoothstep(2.5 * px, 0.0, abs(r - 1.0)) + smoothstep(1.5 * px, 0.0, abs(r - 0.78)) * 0.5;
    float base = smoothstep(2.5 * px, 0.0, abs(p.y)) * step(abs(p.x), 1.0) * (1.0 - uLower) * step(abs(p.x), uReveal * 2.0);
    col += vec3(1.0, 0.9, 0.78) * (t + rings * (0.75 + uRing * 1.2)) * shown + vec3(1.0, 0.9, 0.78) * base * 0.8;

    float fill = clamp((A - a) * r / px, 0.0, 1.0) * smoothstep(0.985, 0.97, r);
    col += uFill * fill * (0.2 + 0.1 * uKick) * (0.55 + 0.45 * r);
    alpha = max(alpha, fill * 0.45);
    float arc = smoothstep(3.5 * px, 0.0, abs(r - 0.25)) * step(a, A);
    col += uFill * arc * 1.6;

    float band = step(uRange0, deg) * step(deg, uRange1) * smoothstep(0.022, 0.012, abs(r - 1.06));
    col += uRangeColor * band * uRangeA * 0.9;

    vec2 d0 = vec2(1.12, 0.0);
    vec2 d1 = vec2(cos(A), sin(A)) * 1.12;
    float r0 = seg(p, vec2(0.0), d0);
    float r1 = seg(p, vec2(0.0), d1);
    col += vec3(1.0, 0.95, 0.88) * (smoothstep(3.0 * px, 0.0, r0) + exp(-r0 / (9.0 * px)) * 0.35);
    col += mix(uFill, vec3(1.0), 0.45) * (smoothstep(3.5 * px, 0.0, r1) + exp(-r1 / (10.0 * px)) * 0.55);
    col += mix(uFill, vec3(1.0), 0.5) * exp(-length(p - d1) / (7.0 * px)) * 1.2;
    col += uFill * uLine * exp(-abs(p.y) / (7.0 * px)) * step(abs(p.x), 1.3);

    float G = radians(uGhost);
    vec2 gd = vec2(cos(G), sin(G));
    float dg = seg(p, vec2(0.0), gd * 1.18);
    float dash = step(0.45, fract(dot(p, gd) * 11.0));
    col += vec3(0.8, 0.88, 1.0) * uGhostA * smoothstep(2.5 * px, 0.0, dg) * dash;

    float L = 0.13;
    float sq = min(seg(p, vec2(L, 0.0), vec2(L, L)), seg(p, vec2(0.0, L), vec2(L, L)));
    col += vec3(1.0, 0.95, 0.6) * uSquare * smoothstep(3.0 * px, 0.0, sq);

    float lowerHalf = step(180.0, deg) * step(r, 1.0);
    float hg = smoothstep(4.0 * px, 0.0, abs(r - 1.0)) * step(0.5, fract(deg / 6.0)) * lowerHalf;
    col += vec3(0.8, 0.88, 1.0) * uHalfGhost * (hg + lowerHalf * 0.07);
    alpha = max(alpha, uHalfGhost * lowerHalf * 0.3);

    alpha = max(alpha, clamp(max(col.r, max(col.g, col.b)), 0.0, 1.0));
    gl_FragColor = vec4(col, alpha);
  }`;

function star(outer, inner, points = 5) {
  const s = new THREE.Shape();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? inner : outer;
    const a = Math.PI / 2 + (i * Math.PI) / points;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    i ? s.lineTo(x, y) : s.moveTo(x, y);
  }
  s.closePath();
  return s;
}

export class DuskScene {
  constructor(ctx) {
    this.ctx = ctx;
    const { timing, renderer } = ctx;
    this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.6;
    this.camera = new THREE.PerspectiveCamera(30, 9 / 16, 0.1, 100);
    const key = new THREE.DirectionalLight("#ffd0a0", 2.2);
    key.position.set(-2, 3, 4);
    this.scene.add(key, new THREE.AmbientLight("#6a3a6a", 0.6));

    this.bgU = { uTime: { value: 0 }, uKick: { value: 0 }, uGlow: { value: 0 } };
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

    this.pU = {
      uAngle: { value: 0 }, uReveal: { value: 0 }, uKick: { value: 0 }, uRange0: { value: 0 }, uRange1: { value: 0 }, uRangeA: { value: 0 },
      uGhost: { value: 0 }, uGhostA: { value: 0 }, uSquare: { value: 0 }, uLower: { value: 0 }, uLine: { value: 0 }, uHalfGhost: { value: 0 }, uRing: { value: 0 },
      uFill: { value: new THREE.Color() }, uRangeColor: { value: new THREE.Color() },
    };
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      premultipliedAlpha: true,
      uniforms: this.pU,
      vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: PROTRACTOR,
    });
    this.protractor = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 2.8), mat);
    this.protractor.position.set(0, VERTEX_Y, 0);
    this.scene.add(this.protractor);

    this.badge = new THREE.Group();
    const gold = new THREE.MeshStandardMaterial({ color: "#ffc35a", metalness: 0.85, roughness: 0.28, emissive: "#3a2000" });
    const body = new THREE.Mesh(new THREE.ExtrudeGeometry(star(0.12, 0.055), { depth: 0.025, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.01, bevelSegments: 2 }), gold);
    body.position.z = -0.012;
    this.badge.add(body);
    for (let i = 0; i < 5; i++) {
      const a = Math.PI / 2 + (i * 2 * Math.PI) / 5;
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.016, 12, 8), gold);
      ball.position.set(Math.cos(a) * 0.125, Math.sin(a) * 0.125, 0.006);
      this.badge.add(ball);
    }
    this.badge.position.set(0, VERTEX_Y, 0.05);
    this.scene.add(this.badge);

    this.weed = new THREE.Group();
    const weedMat = new THREE.LineBasicMaterial({ color: "#d79a5a", transparent: true, opacity: 0.85 });
    for (const [r, d] of [[0.15, 1], [0.11, 0]]) {
      const l = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(r, d)), weedMat);
      l.rotation.set(r * 9, r * 13, 0);
      this.weed.add(l);
    }
    this.scene.add(this.weed);

    const n = 260;
    this.dustSeed = Array.from({ length: n }, (_, i) => [hash(i * 1.7), hash(i * 3.1), hash(i * 5.3), 0.3 + hash(i * 7.9) * 0.7]);
    const dg = new THREE.BufferGeometry();
    dg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.dust = new THREE.Points(dg, new THREE.PointsMaterial({ color: "#ffc890", size: 0.018, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.scene.add(this.dust);

    this.buildTimeline(timing);
    this.tmp = new THREE.Vector3();
  }

  buildTimeline(timing) {
    const cue = (i) => timing.cues[i];
    const w = (ci, word, n = 0) => timing.wordTime(ci, word, n) ?? cue(ci).start;
    const keys = [];
    let cur = 0;
    const at = (t, deg, { dur = 0.32, ease = "out" } = {}) => {
      keys.push({ t, deg, dur, ease });
      cur = deg;
    };
    this.ranges = [];
    this.ghosts = [];
    this.chips = [];
    this.stamps = [];
    this.flashes = [];
    const stamp = (text, t0, color, life = 1.1) => {
      this.stamps.push({ text, t0, color, life });
      this.flashes.push(t0);
    };
    const spin = (ci) => {
      const c = cue(ci);
      for (let b = timing.beatIndexAt(c.start - 0.05) + 1; timing.beatTime(b) < c.end + 0.1; b++) at(timing.beatTime(b), cur + 45, { dur: 0.16 });
    };

    at(SECTIONS.verse1, 0);
    const v1 = VERSE1;
    const ac = KIND.acute.color;
    at(w(v1.greater, "acute"), 40);
    at(w(v1.greater, "greater"), 58);
    at(w(v1.greater, "zero"), 10);
    this.ranges.push({ from: cue(v1.greater).start, to: cue(v1.check).end + 0.3, r0: 0, r1: 90, color: ac });
    this.chips.push({ text: "> 0°", x: 210, t0: w(v1.greater, "zero"), check: w(v1.check, "rules"), t1: cue(v1.check).end + 0.3, color: ac });
    at(w(v1.less, "acute"), 50);
    at(w(v1.less, "ninety"), 82);
    this.ghosts.push({ from: w(v1.less, "less"), to: cue(v1.less).end + 0.4, deg: 90 });
    this.chips.push({ text: "< 90°", x: 870, t0: w(v1.less, "ninety"), check: w(v1.check, "precisely"), t1: cue(v1.check).end + 0.3, color: ac });
    at(w(v1.narrow, "narrow"), 22);
    at(w(v1.narrow, "opening"), 34);
    at(w(v1.check, "check"), 62);
    at(w(v1.right, "right"), 90, { dur: 0.45 });
    this.squarePulse = [w(v1.square, "square"), w(v1.mean, "ninety")];
    at(w(v1.notQuite, "little"), 84, { dur: 0.22 });
    at(w(v1.notQuite, "more"), 97, { dur: 0.22 });
    at(w(v1.notQuite, "less"), 85, { dur: 0.22 });
    stamp("NOT 90°", w(v1.notQuite, "not"), "#ff5d5d", 1.4);
    at(w(v1.mean, "ninety"), 90, { dur: 0.25 });
    stamp("RIGHT ANGLE", w(v1.mean, "mean"), KIND.right.color, 1.5);

    const chorus = (ci) => {
      spin(ci);
      at(cue(ci + 1).start, 0, { dur: 0.5, ease: "inout" });
      const names = [["acute", 45, "acute"], ["right", 90, "right"], ["obtuse", 135, "obtuse"], ["straight", 180, "straight"]];
      for (const [word, deg, kind] of names) {
        at(w(ci + 2, word), deg, { dur: 0.2 });
        stamp(KIND[kind].name, w(ci + 2, word), KIND[kind].color, 0.62);
      }
      at(w(ci + 3, "turn"), 360, { dur: 0.45 });
      stamp("FULL TURN", w(ci + 3, "turn"), KIND.full.color, 0.8);
      spin(ci + 4);
    };
    chorus(CHORUSES.chorus1);

    const v2 = VERSE2;
    const ob = KIND.obtuse.color;
    at(cue(v2.greater).start - 0.4, 0, { dur: 0.4, ease: "inout" });
    at(w(v2.greater, "obtuse"), 125);
    this.ranges.push({ from: cue(v2.greater).start, to: cue(v2.still).end + 0.3, r0: 90, r1: 180, color: ob });
    this.ghosts.push({ from: w(v2.greater, "greater"), to: cue(v2.greater).end + 0.3, deg: 90 });
    this.chips.push({ text: "> 90°", x: 210, t0: w(v2.greater, "ninety"), check: w(v2.wider, "wider"), t1: cue(v2.still).end + 0.3, color: ob });
    at(w(v2.less, "less"), 152);
    this.ghosts.push({ from: w(v2.less, "less"), to: cue(v2.less).end + 0.3, deg: 180 });
    this.chips.push({ text: "< 180°", x: 870, t0: w(v2.less, "eighty"), check: w(v2.still, "straight"), t1: cue(v2.still).end + 0.3, color: ob });
    at(w(v2.wider, "wider"), 112);
    this.ghosts.push({ from: w(v2.wider, "right"), to: cue(v2.wider).end + 0.2, deg: 90 });
    at(w(v2.still, "still"), 168);
    at(w(v2.still, "straight"), 176, { dur: 0.2 });
    at(w(v2.still, "steady"), 140);
    at(w(v2.straight, "straight"), 180, { dur: 0.45 });
    stamp("180°", w(v2.straight, "eighty"), KIND.straight.color, 1.3);
    this.line = { from: cue(v2.opposite).start, to: cue(v2.opposite).end + 0.3 };
    this.halfGhost = { from: cue(v2.half).start, to: cue(v2.crisp).end + 0.3 };
    stamp("½ TURN", w(v2.crisp, "half"), KIND.straight.color, 1.4);

    chorus(CHORUSES.chorus2);

    const br = BRIDGE;
    const turns = [[br.quarter, "quarter", 90, "¼ TURN"], [br.half, "half", 180, "½ TURN"], [br.three, "three-quarter", 270, "¾ TURN"], [br.full, "full", 360, "1 FULL TURN"]];
    at(SECTIONS.bridge, 0, { dur: 0.4, ease: "inout" });
    for (const [ci, word, deg, label] of turns) {
      at(w(ci, word), deg, { dur: 0.9, ease: "inout" });
      stamp(label, w(ci, word) + 0.9, KIND[kindOf(deg)].color, cue(ci).end - w(ci, word) - 0.5);
    }
    this.ringGlow = [w(br.angle, "three"), cue(br.ending).end + 0.4];
    this.flashes.push(w(br.ending, "began"));

    chorus(CHORUSES.chorus3);

    const zero = w(OUTRO.sweep, "zero");
    const done = w(OUTRO.sweep, "done");
    at(zero, 0, { dur: 0.25 });
    at(zero + 0.3, 360, { dur: Math.max(0.6, done - zero - 0.3), ease: "inout" });
    stamp("0° → 360°", done, KIND.full.color, cue(OUTRO.tell).end - done + 0.4);

    keys.sort((a, b) => a.t - b.t);
    let from = 0;
    keys.forEach((k, i) => {
      if (i > 0) from = this.segment(keys[i - 1], k.t);
      k.from = from;
    });
    this.keys = keys;
  }

  segment(k, t) {
    const u = clamp((t - k.t) / k.dur, 0, 1);
    const e = k.ease === "inout" ? easeInOut(u) : easeOutCubic(u);
    return lerp(k.from, k.deg, e);
  }

  angleAt(t) {
    let i = -1;
    for (let k = 0; k < this.keys.length && this.keys[k].t <= t; k++) i = k;
    return i < 0 ? 0 : this.segment(this.keys[i], t);
  }

  lastKey(t) {
    let i = -1;
    for (let k = 0; k < this.keys.length && this.keys[k].t <= t; k++) i = k;
    return i < 0 ? -10 : this.keys[i].t;
  }

  update(t, section) {
    const { timing } = this.ctx;
    const kick = timing.pulse(t, 0.12);
    const bf = timing.beatFloat(t);
    const raw = this.angleAt(t);
    const angle = raw > 360 ? ((raw - 0.001) % 360) + 0.001 : Math.max(0, raw);
    const settled = Math.abs(raw - this.angleAt(t - 0.06)) < 0.4;
    const kind = kindOf(angle);
    const color = KIND[kind].color;
    this.state = { angle, settled, kind, color };

    const u = this.pU;
    u.uAngle.value = angle;
    u.uReveal.value = easeOutCubic((t - SECTIONS.verse1) / 1.0);
    u.uKick.value = kick;
    u.uFill.value.set(color);
    u.uLower.value = smooth(178, 200, angle);
    let rangeA = 0;
    for (const r of this.ranges) {
      const a = smooth(r.from - 0.1, r.from + 0.3, t) * (1 - smooth(r.to - 0.3, r.to, t));
      if (a > rangeA) {
        rangeA = a;
        u.uRange0.value = r.r0;
        u.uRange1.value = r.r1;
        u.uRangeColor.value.set(r.color);
      }
    }
    u.uRangeA.value = rangeA * (0.75 + 0.25 * kick);
    let ghostA = 0;
    for (const g of this.ghosts) {
      const a = smooth(g.from - 0.05, g.from + 0.15, t) * (1 - smooth(g.to - 0.2, g.to, t));
      if (a > ghostA) {
        ghostA = a;
        u.uGhost.value = g.deg;
      }
    }
    u.uGhostA.value = ghostA;
    let sq = smooth(1.2, 0.3, Math.abs(angle - 90));
    for (const p of this.squarePulse) if (t >= p) sq *= 1 + 1.2 * Math.exp(-(t - p) / 0.3);
    u.uSquare.value = sq;
    u.uLine.value = smooth(this.line.from - 0.1, this.line.from + 0.3, t) * (1 - smooth(this.line.to - 0.3, this.line.to, t)) * (0.8 + 0.4 * kick) + smooth(1.5, 0.2, Math.abs(angle - 180)) * 0.25;
    u.uHalfGhost.value = smooth(this.halfGhost.from - 0.1, this.halfGhost.from + 0.4, t) * (1 - smooth(this.halfGhost.to - 0.3, this.halfGhost.to, t));
    u.uRing.value = smooth(this.ringGlow[0] - 0.05, this.ringGlow[0] + 0.3, t) * (1 - smooth(this.ringGlow[1] - 0.4, this.ringGlow[1], t)) * (0.7 + 0.5 * kick) + (angle >= 359.5 ? 0.5 : 0);

    const ch = section.startsWith("chorus");
    this.protractor.rotation.set(Math.sin(t * 0.37) * 0.05, Math.sin(t * 0.29) * 0.08, 0);
    this.protractor.scale.setScalar(1 + kick * (ch ? 0.012 : 0.006));
    this.badge.rotation.set(0, Math.sin(Math.PI * bf) * 0.5 + (ch ? bf * Math.PI * 0.5 : 0), 0);
    this.badge.scale.setScalar(1 + kick * 0.15);

    const chStart = SECTIONS[section];
    const chEnd = SECTIONS[ORDER[ORDER.indexOf(section) + 1]] ?? SECTIONS.end;
    const roll = ch ? clamp((t - chStart) / (chEnd - chStart), 0, 1) : section === "outro" ? clamp((t - SECTIONS.outro) / 8, 0, 1) : -1;
    this.weed.visible = roll >= 0;
    if (roll >= 0) {
      const x = lerp(-2.0, 2.0, roll);
      this.weed.position.set(x, -0.78 + Math.abs(Math.sin(Math.PI * bf)) * 0.14, 0.6);
      this.weed.rotation.set(0, 0, -x / 0.15);
    }

    const dp = this.dust.geometry.attributes.position;
    this.dustSeed.forEach(([sx, sy, sz, sp], i) => {
      const x = (((sx * 5 + t * 0.08 * sp) % 5) + 5) % 5 - 2.5;
      dp.setXYZ(i, x, (sy - 0.5) * 5.2 + Math.sin(t * sp + i) * 0.05, (sz - 0.5) * 2);
    });
    dp.needsUpdate = true;

    this.bgU.uTime.value = t;
    this.bgU.uKick.value = kick;
    this.bgU.uGlow.value = ch ? 1 : 0;

    this.camera.position.set(Math.sin(t * 0.27) * 0.25, Math.cos(t * 0.21) * 0.08, DIST - kick * 0.1);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    this.scene.updateMatrixWorld();

    const post = { bloom: [0.7, 0.45, 0.62], ca: 0.12 + kick * 0.22, vignette: 0.45, grain: 0.03 };
    const start = SECTIONS[section];
    if (start !== undefined && t - start < 0.3) post.flash = Math.exp(-(t - start) / 0.1) * 0.4;
    for (const f of this.flashes) if (t >= f && t < f + 0.15) post.flash = Math.max(post.flash || 0, 0.16 * (1 - (t - f) / 0.15));
    this.drawHud(t, section);
    return post;
  }

  screen(x, y) {
    this.tmp.set(x, y, 0).applyMatrix4(this.protractor.matrixWorld).project(this.camera);
    return [(this.tmp.x * 0.5 + 0.5) * 1080, (-this.tmp.y * 0.5 + 0.5) * 1920];
  }

  chip(c, t) {
    const a = smooth(c.t0, c.t0 + 0.15, t) * (1 - smooth(c.t1 - 0.3, c.t1, t));
    if (a <= 0) return;
    const { hud } = this.ctx;
    const ctx = hud.ctx;
    const ok = t >= c.check;
    const label = ok ? `${c.text}  ✓` : c.text;
    hud.font(46, 800, FONT_COND);
    const w = ctx.measureText(label).width + 44;
    const pop = ok ? 1 + 0.2 * Math.exp(-(t - c.check) / 0.15) : 1;
    const y = 470;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(c.x, y);
    ctx.scale(pop, pop);
    ctx.fillStyle = "rgba(20,8,24,0.85)";
    ctx.strokeStyle = c.color;
    ctx.lineWidth = 4;
    ctx.shadowColor = c.color;
    ctx.shadowBlur = ok ? 22 : 10;
    ctx.beginPath();
    ctx.roundRect(-w / 2, -36, w, 72, 16);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    hud.text(label, c.x, y + 2, { size: Math.round(46 * pop), weight: 800, family: FONT_COND, color: ok ? c.color : "#ffffff", alpha: a });
  }

  drawHud(t, section) {
    const { hud } = this.ctx;
    const { angle, settled, kind, color } = this.state;
    const reveal = smooth(SECTIONS.verse1 + 0.2, SECTIONS.verse1 + 0.8, t);
    const pop = 1 + 0.22 * Math.exp(-Math.max(0, t - this.lastKey(t) - 0.15) / 0.18);

    // Degree readout above the protractor.
    hud.text(`${Math.round(angle)}°`, 540, 340, { size: Math.round(132 * (settled ? pop : 1)), weight: 800, family: FONT_COND, color, glow: 26, alpha: reveal });

    // Scale labels: the upper half outside the ring, the lower half inside it.
    const lower = smooth(178, 200, angle);
    for (const deg of [0, 45, 90, 135, 180, 225, 270, 315]) {
      const isLower = deg > 180;
      const a = (isLower ? lower : 1) * smooth(SECTIONS.verse1 + (deg / 360) * 0.9, SECTIONS.verse1 + (deg / 360) * 0.9 + 0.2, t);
      if (a <= 0) continue;
      const rad = (deg * Math.PI) / 180;
      const r = isLower ? 0.84 : deg % 90 ? 1.16 : 1.2;
      const [x, y] = this.screen(Math.cos(rad) * r, Math.sin(rad) * r);
      const hot = Math.abs(angle - deg) < 1 && settled;
      hud.text(`${deg}°`, x, y, { size: deg % 90 ? 26 : 34, weight: 700, family: FONT_MONO, color: hot ? color : "#ffe6c8", alpha: a * (deg % 90 ? 0.7 : 1), glow: hot ? 16 : 0 });
    }

    // Kind label and its rule under the base line.
    if (t >= SECTIONS.verse1 + 0.6 && angle > 0.5) {
      const a = settled ? 1 : 0.35;
      const ctx = hud.ctx;
      ctx.save();
      ctx.globalAlpha = 0.55 * a;
      ctx.fillStyle = "#14081a";
      ctx.beginPath();
      ctx.roundRect(540 - 230, 978, 460, 150, 30);
      ctx.fill();
      ctx.restore();
      hud.text(KIND[kind].name, 540, 1030, { size: Math.round(80 * (settled ? pop : 1)), weight: 800, family: FONT_COND, color, glow: 22, alpha: a, tracking: 4 });
      hud.text(KIND[kind].rule, 540, 1098, { size: 30, weight: 700, family: FONT_MONO, color: "#ffe6c8", alpha: a * 0.85 });
    }

    for (const c of this.chips) this.chip(c, t);
    for (const s of this.stamps) hud.stamp(s.text, t, s.t0, { x: 540, y: STAMP_Y, size: s.text.length > 8 ? 92 : 120, color: s.color, angle: -0.08, life: Math.max(0.4, s.life) });
  }
}
