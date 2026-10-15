import * as THREE from "three";
import { FONT_COND, FONT_MONO } from "@gizclaw/mvg-core/hud.js";
import { Cosmos } from "./cosmos.js";
import { clamp, easeInOut, easeOutCubic, hash, lerp, smooth } from "@gizclaw/mvg-core/timing.js";
import { BRIDGE, CHANTS, CLIMBS, GOLD, GOOGOL, HUES, MORE_ZEROES, NAMES, ORDER, OUTRO, ROLL_FIRST, ROLL_REST, SECTIONS, SHORT_SCALE_CUE, TOP, ZERO_LINES } from "./constants.js";

// The ladder is the number: a golden 1 at its foot and one rung per three
// zeroes above it. Rung g sits at y = g world units.
const RAILS = 1.25;
const SLOT = 0.62;
const RUNGS = Math.ceil(GOOGOL / 3);
const FOV = 30;
const TAN = Math.tan(((FOV / 2) * Math.PI) / 180);
const HEADER = { power: 330, name: 435 };
const TOP_ROW = 640;

const hueOf = (g) => (g <= 11 ? HUES[Math.max(1, g)] : GOLD);

const BACKDROP = /* glsl */ `
  uniform float uTime, uKick, uAlt, uSpeed, uGoogol; uniform vec3 uHue; varying vec2 vUv;
  float h11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
  float h21(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
  float blob(vec2 p, vec2 c, float r) { vec2 d = (p - c) * vec2(0.5625, 1.0); return exp(-dot(d, d) / (r * r)); }
  void main() {
    vec2 uv = vUv;
    float t = uTime;
    float ground = 1.0 - smoothstep(0.0, 0.45, uAlt);
    vec3 col = mix(vec3(0.006, 0.006, 0.02), vec3(0.002, 0.002, 0.008), smoothstep(0.2, 1.0, uAlt));
    // A warm horizon far below that sinks away as the climb goes on.
    col += vec3(0.05, 0.12, 0.3) * smoothstep(0.6, 0.0, uv.y) * ground * 0.4;
    col += vec3(0.04, 0.08, 0.22) * blob(uv, vec2(0.8 + 0.06 * cos(t * 0.17), 0.7), 0.4) * 0.5;
    col += uHue * blob(uv, vec2(0.5, 0.66), 0.28) * (0.12 + uKick * 0.06);
    // Googol: a slow gold-and-violet nebula.
    col += mix(vec3(0.3, 0.1, 0.4), vec3(0.6, 0.4, 0.1), 0.5 + 0.5 * sin(uv.y * 5.0 + t * 0.3)) * blob(uv, vec2(0.5, 0.55), 0.5) * uGoogol * 0.35;
    // Stars stream downward as the ladder climbs.
    for (int layer = 0; layer < 2; layer++) {
      float fl = float(layer);
      vec2 g = uv * vec2(60.0 + fl * 40.0, (60.0 + fl * 40.0) * 1.777) + vec2(fl * 7.0, t * (0.2 + fl * 0.2) + uAlt * (30.0 + fl * 40.0));
      float s = h21(floor(g) + fl * 13.0);
      vec2 f = fract(g) - 0.5;
      float star = step(0.975, s) * smoothstep(0.22, 0.0, length(f * vec2(1.0, 1.0 / (1.0 + uSpeed * 8.0))));
      col += vec3(0.85, 0.9, 1.0) * star * (0.3 + 0.7 * smoothstep(0.0, 0.4, uAlt + 0.1)) * (0.5 + 0.5 * sin(t * 2.5 + s * 50.0)) * (0.6 - fl * 0.25);
    }
    // A few out-of-focus lights.
    for (int i = 0; i < 12; i++) {
      float fi = float(i);
      float depth = h11(fi * 5.3);
      float r = mix(0.07, 0.025, depth);
      vec2 c = vec2(h11(fi * 1.7) * 1.1 - 0.05, fract(h11(fi * 3.1) - t * 0.006 - uAlt * (0.4 + depth)) * 1.3 - 0.15);
      float d = length((uv - c) * vec2(0.5625, 1.0));
      float disk = smoothstep(r, r * 0.86, d);
      col += uHue * disk * 0.03 * mix(1.0, 0.4, depth);
    }
    col *= 1.0 - 0.5 * smoothstep(0.36, 0.12, uv.y);
    // Output is sRGB-encoded afterwards, which lifts these darks a lot; keep them low.
    gl_FragColor = vec4(col * 0.45, 1.0);
  }`;

const ordinalName = (e) => {
  if (e >= GOOGOL) return "GOOGOL";
  if (e === 0) return "ONE";
  if (e === 1) return "TEN";
  if (e === 2) return "ONE HUNDRED";
  if (e > TOP) return "";
  return ["", "TEN ", "HUNDRED "][e % 3] + NAMES[Math.floor(e / 3)];
};

export class LadderScene {
  constructor(ctx) {
    this.ctx = ctx;
    const { timing } = ctx;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(FOV, 9 / 16, 0.5, 600);

    this.bgU = { uTime: { value: 0 }, uKick: { value: 0 }, uAlt: { value: 0 }, uSpeed: { value: 0 }, uGoogol: { value: 0 }, uHue: { value: new THREE.Color() } };
    const bg = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({ depthTest: false, depthWrite: false, uniforms: this.bgU, vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }", fragmentShader: BACKDROP }),
    );
    bg.renderOrder = -1;
    bg.frustumCulled = false;
    this.scene.add(bg);

    // Glowing rails and one bar per rung; the bars grow in as their first zero lands.
    const rail = new THREE.BoxGeometry(0.05, 1, 0.05).translate(0, 0.5, 0);
    this.railMat = new THREE.MeshBasicMaterial({ color: "#9fb4ff" });
    this.rails = [-RAILS, RAILS].map((x) => {
      const m = new THREE.Mesh(rail, this.railMat);
      m.position.set(x, -0.6, 0);
      this.scene.add(m);
      return m;
    });
    this.bars = new THREE.InstancedMesh(new THREE.BoxGeometry(RAILS * 2, 0.045, 0.045), new THREE.MeshBasicMaterial({ color: "#ffffff" }), RUNGS + 12);
    this.bars.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array((RUNGS + 12) * 3), 3);
    this.bars.frustumCulled = false;
    this.scene.add(this.bars);
    this.base = new THREE.Mesh(new THREE.BoxGeometry(RAILS * 2 + 0.8, 0.08, 0.08), new THREE.MeshBasicMaterial({ color: GOLD }));
    this.base.position.set(0, -0.6, 0);
    this.scene.add(this.base);

    const n = 160;
    this.sparkSeed = Array.from({ length: n }, (_, i) => [hash(i * 1.3) * 2 - 1, hash(i * 2.7) * 2 - 1, 0.4 + hash(i * 4.1) * 0.8]);
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.sparks = new THREE.Points(sg, new THREE.PointsMaterial({ color: "#ffe2a0", size: 0.06, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.scene.add(this.sparks);

    // Darken the lyric band so the ladder fades out behind the words.
    const fade = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        transparent: true,
        depthTest: false,
        depthWrite: false,
        vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
        fragmentShader: "varying vec2 vUv; void main(){ float y = (1.0 - vUv.y) * 1920.0; gl_FragColor = vec4(0.006, 0.005, 0.02, smoothstep(1090.0, 1260.0, y) * 0.6); }",
      }),
    );
    fade.renderOrder = 999;
    fade.frustumCulled = false;
    this.scene.add(fade);

    this.cosmos = new Cosmos(this.scene);
    this.buildTimeline(timing);
    this.tmp = new THREE.Vector3();
  }

  buildTimeline(timing) {
    const cue = (i) => timing.cues[i];
    const w = (ci, word, n = 0) => timing.wordTime(ci, word, n) ?? cue(ci).start;
    // One zero per hop: "Ten" adds the first, the power word the second, the name the third.
    const keys = [{ t: SECTIONS.verse1, e: 0 }];
    for (const [ci, L] of CLIMBS) {
      const ws = cue(ci).words;
      [ws[0], ws[3], ws.at(-1)].forEach((word, k) => keys.push({ t: word.start, e: 3 * L - 2 + k }));
    }
    this.keys = keys.sort((a, b) => a.t - b.t);
    this.leap = { t0: w(BRIDGE.leap, "leap"), googol: w(BRIDGE.googol, "googol") };
    this.power = { t0: w(BRIDGE.power, "ten"), t1: w(BRIDGE.power, "hundred") + 0.3 };
    this.trail = { one: w(BRIDGE.zeroes, "one"), t0: w(BRIDGE.zeroes, "hundred"), t1: cue(BRIDGE.zeroes).end };
    this.infinity = { t0: cue(BRIDGE.bigger).start, t1: cue(BRIDGE.never).end + 0.5 };
    this.count = { t0: w(OUTRO.count, "count"), t1: w(OUTRO.count, "check") };

    this.chants = [];
    for (const ci of CHANTS) for (const word of ["step", "name", "power", "climb"]) this.chants.push({ t: w(ci, word), word: word === "climb" ? "CLIMB!" : word.toUpperCase() });
    this.moreZeroes = MORE_ZEROES.map((ci) => ({ zeroes: w(ci, "zeroes"), name: w(ci, "name"), end: cue(ci).end }));
    this.zeroLines = ZERO_LINES.map(([ci, L]) => ({ t0: cue(ci).start, t1: cue(ci).end + 0.3, L }));
    const rollWords = ["thousand", "million", "billion", "trillion"];
    this.rolls = rollWords.map((word, k) => ({ g: k + 1, t: w(ROLL_FIRST, word) }));
    const q0 = w(ROLL_REST, "quadrillion");
    const q1 = w(ROLL_REST, "decillion");
    for (let g = 5; g <= 11; g++) this.rolls.push({ g, t: lerp(q0, q1, (g - 5) / 6) });
    const sc = cue(SHORT_SCALE_CUE);
    for (let g = 1; g <= 11; g++) this.rolls.push({ g, t: lerp(sc.start, sc.end - 0.4, (g - 1) / 10) });
    this.shortScale = { t0: w(SHORT_SCALE_CUE, "short"), t1: sc.end + 0.3 };
  }

  /** Zeroes written at t: stepped by the verses, then counted up to a hundred in the bridge. */
  zeroesAt(t) {
    if (t >= this.power.t0) return Math.floor(lerp(TOP, GOOGOL, easeInOut((t - this.power.t0) / (this.power.t1 - this.power.t0))));
    let e = 0;
    for (const k of this.keys) if (k.t <= t) e = k.e;
    return e;
  }

  /** When zero number i (1-based) was written. */
  zeroTime(i) {
    if (i > TOP) {
      const u = (i - TOP) / (GOOGOL - TOP);
      // Inverse of the eased count: find the time the count passes i.
      let lo = 0;
      let hi = 1;
      for (let k = 0; k < 20; k++) {
        const mid = (lo + hi) / 2;
        if (easeInOut(mid) < u) lo = mid;
        else hi = mid;
      }
      return lerp(this.power.t0, this.power.t1, hi);
    }
    return this.keys.find((k) => k.e >= i)?.t ?? Infinity;
  }

  /** Camera framing: the newest rung near the top in the verses, the whole ladder in the choruses and the googol. */
  framing(t, e) {
    const top = Math.max(1, Math.ceil(e / 3));
    const close = { ppu: 150, y: top, w: 1 };
    const whole = { ppu: Math.min(130, 560 / (top + 2)), y: (top - 0.6) / 2, w: 0 };
    const target = (s) => (s.startsWith("chorus") ? whole : s === "outro" ? whole : close);
    let cur = target(ORDER[0]);
    for (const s of ORDER) {
      if (t < SECTIONS[s]) break;
      const k = smooth(SECTIONS[s], SECTIONS[s] + 1.0, t);
      const nxt = target(s);
      cur = { ppu: lerp(cur.ppu, nxt.ppu, k), y: lerp(cur.y, nxt.y, k), w: lerp(cur.w, nxt.w, k), tower: 0 };
    }
    // From the leap on, look up the tower of zeroes from its foot.
    cur.tower = smooth(this.leap.t0, this.leap.googol + 0.4, t);
    return cur;
  }

  update(t, section) {
    const { timing } = this.ctx;
    const kick = timing.pulse(t, 0.12);
    const e = this.zeroesAt(t);
    const g = Math.ceil(e / 3);
    const f = this.framing(t, e);
    const hue = e >= GOOGOL ? GOLD : hueOf(Math.max(1, Math.floor(Math.min(e, TOP) / 3)));
    this.state = { e, g, f, hue };

    const z = 1920 / (2 * f.ppu * TAN);
    // The newest rung sits near the top in close-up; the whole ladder is centred lower.
    const screenRow = lerp(830, TOP_ROW, f.w);
    const sway = Math.sin(t * 0.3) * 0.15;
    const p = new THREE.Vector3(sway, f.y - (960 - screenRow) / f.ppu, z - kick * 0.4);
    const look = new THREE.Vector3(p.x, p.y, 0);
    const orbit = t * 0.12;
    // A low, wide-angle shot from the foot: the foot lands near row 1150, the top near row 500.
    const towerP = new THREE.Vector3(Math.sin(orbit) * 3, -15, 13.5 - kick * 0.3);
    const towerL = new THREE.Vector3(0, 5, 0);
    const k = easeInOut(f.tower);
    p.lerp(towerP, k);
    look.lerp(towerL, k);
    this.camera.fov = lerp(FOV, 70, k);
    this.camera.position.copy(p);
    this.camera.lookAt(look);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    this.cosmos.update(t, this.camera, smooth(this.leap.googol - 0.3, this.leap.googol + 0.6, t));

    const showTo = e > TOP || t >= this.leap.t0 ? RUNGS : g;
    const railTop = Math.max(0.2, (t >= this.infinity.t0 ? RUNGS + 10 : showTo) + 0.5);
    for (const r of this.rails) r.scale.y = railTop + 0.6;
    this.railMat.color.set(hue).lerp(new THREE.Color("#ffffff"), 0.45).multiplyScalar(0.7 + kick * 0.3);
    const d = new THREE.Object3D();
    const c = new THREE.Color();
    for (let k = 1; k <= RUNGS + 10; k++) {
      const first = this.zeroTime(3 * k - 2);
      let grow = k <= RUNGS ? easeOutCubic((t - first) / 0.25) : smooth(this.infinity.t0 + (k - RUNGS) * 0.08, this.infinity.t0 + (k - RUNGS) * 0.08 + 0.3, t) * (1 - (k - RUNGS) / 11);
      if (k > RUNGS && t >= this.infinity.t1) grow *= 1 - smooth(this.infinity.t1, this.infinity.t1 + 1, t);
      let flash = 0;
      for (const r of this.rolls) if (r.g === k && t >= r.t) flash = Math.max(flash, Math.exp(-(t - r.t) / 0.3));
      if (t >= this.count.t0) {
        const ct = lerp(this.count.t0, this.count.t1, (3 * k - 1) / GOOGOL);
        if (t >= ct) flash = Math.max(flash, 0.6 * Math.exp(-(t - ct) / 0.4));
      }
      d.position.set(0, k - 0.36, 0);
      d.scale.set(Math.max(0.001, grow), 1 + flash * 1.5, 1);
      d.updateMatrix();
      this.bars.setMatrixAt(k - 1, d.matrix);
      this.bars.setColorAt(k - 1, c.set(hueOf(k)).multiplyScalar(0.8 + flash * 1.6 + kick * 0.2));
    }
    this.bars.instanceMatrix.needsUpdate = true;
    this.bars.instanceColor.needsUpdate = true;

    // Sparks burst off the newest zero.
    const last = this.zeroTime(e);
    const since = t - last;
    const sp = this.sparks.geometry.attributes.position;
    const slot = ((e - 1) % 3) - 1;
    this.sparkSeed.forEach(([vx, vy, s], i) => {
      const u = clamp(since * s, 0, 1);
      sp.setXYZ(i, slot * SLOT + vx * u * 1.6, g + vy * u * 1.2 - u * u * 0.8, 0.1);
    });
    sp.needsUpdate = true;
    this.sparks.material.opacity = e > 0 && e <= TOP && since < 0.8 ? 1 - since / 0.8 : 0;
    this.sparks.material.color.set(hue);

    this.bgU.uTime.value = t;
    this.bgU.uKick.value = kick;
    this.bgU.uAlt.value = clamp(e / GOOGOL, 0, 1);
    this.bgU.uSpeed.value = t >= this.power.t0 && t < this.power.t1 ? 1 : 0;
    this.bgU.uGoogol.value = smooth(this.leap.googol - 0.3, this.leap.googol + 0.6, t);
    this.bgU.uHue.value.set(hue);
    this.scene.updateMatrixWorld();

    const post = { bloom: [0.85, 0.45, 0.35], ca: 0.1 + kick * 0.2, vignette: 0.45, grain: 0.02 };
    const start = SECTIONS[section];
    if (start !== undefined && t - start < 0.3) post.flash = Math.exp(-(t - start) / 0.1) * 0.35;
    if (e % 3 === 0 && e > 0 && e <= TOP && since < 0.15) post.flash = Math.max(post.flash || 0, 0.18);
    const boom = this.power.t1;
    if (t >= boom && t < boom + 0.3) post.flash = Math.max(post.flash || 0, 0.6 * (1 - (t - boom) / 0.3));
    if (t >= boom && t < boom + 0.7) post.shock = [0.5, 0.6, (t - boom) * 1.3, 1];
    this.drawHud(t, section);
    return post;
  }

  screen(x, y) {
    this.tmp.set(x, y, 0).project(this.camera);
    return [(this.tmp.x * 0.5 + 0.5) * 1080, (-this.tmp.y * 0.5 + 0.5) * 1920];
  }

  /** "10" with a raised exponent, centred on x. */
  pow(e, x, y, size, color, alpha = 1, glow = 18) {
    const { hud } = this.ctx;
    const ctx = hud.ctx;
    hud.font(size, 800, FONT_COND);
    const base = ctx.measureText("10").width;
    hud.font(Math.round(size * 0.55), 800, FONT_COND);
    const sup = ctx.measureText(String(e)).width;
    const x0 = x - (base + sup + size * 0.04) / 2;
    hud.text("10", x0 + base / 2, y, { size, weight: 800, family: FONT_COND, color: "#ffffff", alpha, glow });
    hud.text(String(e), x0 + base + size * 0.04 + sup / 2, y - size * 0.33, { size: Math.round(size * 0.55), weight: 800, family: FONT_COND, color, alpha, glow });
  }

  /** On-screen pixels per world unit at rung k, from the projected rung width. */
  scaleAt(k) {
    const [x0] = this.screen(-RAILS, k);
    const [x1] = this.screen(RAILS, k);
    const [, y0] = this.screen(0, k - 0.5);
    const [, y1] = this.screen(0, k + 0.5);
    return Math.min(Math.abs(x1 - x0) / (RAILS * 2), Math.abs(y1 - y0) * 1.25);
  }

  /** Fade for anything drawn into the lyric band. */
  bandFade(y) {
    return 1 - smooth(1060, 1170, y);
  }

  drawHud(t, section) {
    const { hud } = this.ctx;
    const { e, f, hue } = this.state;
    const a = smooth(SECTIONS.verse1, SECTIONS.verse1 + 0.4, t);
    const ppu = f.ppu;

    // The number itself: a golden 1 at the foot, three zeroes on every rung.
    const [ox, oy] = this.screen(0, -0.05);
    const oneA = a * (1 - smooth(1180, 1230, oy));
    if (oneA > 0 && oy > 200) hud.text("1", ox, oy, { size: Math.round(this.scaleAt(0) * 0.95), weight: 800, family: FONT_COND, color: GOLD, alpha: oneA, glow: 26 });
    const countLit = t >= this.count.t0 ? Math.floor(lerp(0, GOOGOL, clamp((t - this.count.t0) / (this.count.t1 - this.count.t0), 0, 1))) : -1;
    const trailK = t >= this.trail.t0 && t < this.trail.t1 + 0.6 ? (t - this.trail.t0) / (this.trail.t1 - this.trail.t0) : -1;
    for (let i = 1; i <= e; i++) {
      const k = Math.ceil(i / 3);
      const s = ((i - 1) % 3) - 1;
      const [x, y] = this.screen(s * SLOT, k);
      if (y < 180 || y > 1180) continue;
      const ppuK = this.scaleAt(k);
      const fade = this.bandFade(y);
      if (fade <= 0) continue;
      const born = this.zeroTime(i);
      const pop = t >= born ? Math.exp(-(t - born) / 0.18) : 0;
      let lift = 0;
      for (const z of this.zeroLines) if (k === z.L && t >= z.t0 && t < z.t1) lift = Math.max(lift, Math.abs(Math.sin(Math.PI * (this.ctx.timing.beatFloat(t) / 2 - (s + 1) * 0.33))));
      const lit = countLit >= i || (trailK >= 0 && trailK * GOOGOL >= i && trailK * GOOGOL < i + 12);
      hud.text("0", x, y - lift * ppuK * 0.25, { size: Math.round(ppuK * 0.72 * (1 + pop * 0.6)), weight: 800, family: FONT_MONO, color: lit ? "#ffffff" : hueOf(k), alpha: a * fade, glow: 10 + pop * 30 + (lit ? 20 : 0) });
    }

    // Names and powers beside the named rungs while they are large enough to read.
    {
      for (let k = 1; k <= Math.min(11, Math.floor(e / 3)); k++) {
        const [, y] = this.screen(0, k);
        const [rx] = this.screen(RAILS + 0.18, k);
        const [lx] = this.screen(-RAILS - 0.18, k);
        const kppu = this.scaleAt(k);
        const fade = this.bandFade(y) * smooth(40, 70, kppu);
        if (fade <= 0) continue;
        const ppu = kppu;
        if (y < 200 || fade <= 0) continue;
        const size = Math.round(clamp(ppu * 0.22, 16, 30));
        hud.text(NAMES[k], rx, y, { size, weight: 800, family: FONT_COND, color: hueOf(k), align: "left", alpha: a * fade, glow: 8, tracking: 2 });
        this.pow(3 * k, lx - size * 0.9, y, size, hueOf(k), a * fade, 6);
      }
    }

    // Header: the power and its name, or the chorus chant in its place.
    const chant = this.chants.findLast((c) => t >= c.t - 0.02 && t < c.t + 0.5);
    const rule = this.moreZeroes.find((m) => t >= m.zeroes && t < m.end + 0.2);
    if (chant) hud.slam(chant.word, t, chant.t, chant.t + 0.35, { y: HEADER.power + 40, size: 170, color: HUES[1 + (this.chants.indexOf(chant) % 11)], angle: -0.05 });
    else if (rule) {
      hud.stamp(t < rule.name ? "+ 000" : "+ 1 NAME", t, t < rule.name ? rule.zeroes : rule.name, { x: 540, y: HEADER.power + 40, size: 130, color: t < rule.name ? "#9fe8ff" : GOLD, angle: -0.06, life: 2 });
    } else if (t >= this.shortScale.t0 && t < this.shortScale.t1) {
      hud.slam("× 1000", t, this.shortScale.t0, this.shortScale.t1 - 0.3, { y: HEADER.power + 20, size: 150, color: GOLD, sub: "every rung: three more zeroes", angle: -0.03 });
    } else if (t >= this.infinity.t0 && t < this.infinity.t1) {
      hud.slam("∞", t, this.infinity.t0, this.infinity.t1 - 0.3, { y: HEADER.power + 20, size: 200, color: "#c9a8ff", sub: "there is always a bigger number", angle: 0 });
    } else if (e > 0) {
      const pop = 1 + 0.2 * Math.exp(-Math.max(0, t - this.zeroTime(e)) / 0.15);
      this.pow(e, 540, HEADER.power, Math.round(120 * (e > TOP && e < GOOGOL ? 1 : pop)), hue, a, 24);
      const name = ordinalName(e);
      if (name) hud.text(name, 540, HEADER.name, { size: e >= GOOGOL ? 110 : name.length > 14 ? 62 : 82, weight: 800, family: FONT_COND, color: hue, alpha: a, glow: 22, tracking: 4 });
      else hud.text(`${e} ZEROES…`, 540, HEADER.name, { size: 62, weight: 800, family: FONT_MONO, color: "#ffffff", alpha: a, glow: 14 });
    }
    // Zero counter beside the tower.
    const counter = countLit >= 0 ? countLit : e > TOP && t < this.infinity.t0 ? e : -1;
    if (counter >= 0) {
      const ca = a * (countLit >= 0 ? smooth(this.count.t0, this.count.t0 + 0.3, t) : 1);
      hud.text(String(counter), 210, 860, { size: 110, weight: 800, family: FONT_COND, color: GOLD, alpha: ca, glow: 24 });
      hud.text(countLit >= 0 ? "COUNTED" : "ZEROES", 210, 940, { size: 30, weight: 700, family: FONT_MONO, color: "#ffffff", alpha: ca * 0.85, tracking: 3 });
    }
  }
}
