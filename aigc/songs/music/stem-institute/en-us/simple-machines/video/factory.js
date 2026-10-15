import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { FONT_COND, FONT_MONO } from "@gizclaw/mvg-core/hud.js";
import { clamp, easeInOut, hash, lerp, smooth } from "@gizclaw/mvg-core/timing.js";
import { ACTIONS, BRIDGE, CLOSEUPS, COUNTS, HEYS, MACHINES, ROLL, SECTIONS, VERSE1, VERSE2, WIDE } from "./constants.js";
import { BUILDERS } from "./machines.js";
import { SKY, Site } from "./site.js";

const FOV = 35;
const TAN = Math.tan(((FOV / 2) * Math.PI) / 180);
const cell = (k) => new THREE.Vector3(k % 2 ? 1.45 : -1.45, 2.5 - Math.floor(k / 2) * 2.5, 0);
const WIDE_VIEW = { x: 0, y: 0.1, z: 28, Y: 760 };
const closeView = (k) => ({ x: cell(k).x, y: cell(k).y + 0.1, z: 11, Y: 845 });
const TOP_Y = 300;

const LABELS = [
  [["FULCRUM", "fulcrum"], ["LOAD", "load"], ["EFFORT ↓", "effort"]],
  [["WHEEL", "wheel"], ["LOAD", "load"], ["PULL ↓", "pull"], ["LIFT ↑", "up"]],
  [["WHEEL", "wheel"], ["AXLE", "axle"], ["LOAD", "load"]],
  [["SLOPE", "slope"], ["HEIGHT", "height"], ["LOAD", "load"]],
  [["WEDGE", "wedge"], ["SPLIT", "log"]],
  [["THREAD", "thread"], ["NUT", "nut"]],
];

const BACKDROP = SKY;

function hazardTexture() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 32;
  const g = c.getContext("2d");
  g.fillStyle = "#1a1a1a";
  g.fillRect(0, 0, 256, 32);
  g.fillStyle = "#f2c230";
  for (let x = -32; x < 256; x += 32) {
    g.beginPath();
    g.moveTo(x, 32);
    g.lineTo(x + 16, 32);
    g.lineTo(x + 32, 0);
    g.lineTo(x + 16, 0);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(4, 1);
  return tex;
}

export class FactoryScene {
  constructor(ctx) {
    this.ctx = ctx;
    const { timing, renderer } = ctx;
    this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.3;
    this.camera = new THREE.PerspectiveCamera(FOV, 9 / 16, 0.1, 400);
    // Low warm sun from the right, cool sky fill from above.
    const sun = new THREE.DirectionalLight("#ffcf9a", 2.6);
    sun.position.set(8, 5, 6);
    const rim = new THREE.DirectionalLight("#ff9a5a", 1.4);
    rim.position.set(6, 2, -6);
    this.scene.add(sun, rim, new THREE.HemisphereLight("#9ab4e0", "#5a3a28", 0.9));

    this.bgU = { uTime: { value: 0 }, uKick: { value: 0 }, uGear: { value: 0 } };
    const bg = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({ depthTest: false, depthWrite: false, uniforms: this.bgU, vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }", fragmentShader: BACKDROP }),
    );
    bg.renderOrder = -1;
    bg.frustumCulled = false;
    this.scene.add(bg);

    this.site = new Site(this.scene, new THREE.MeshStandardMaterial({ map: hazardTexture(), roughness: 0.6 }));

    this.machines = MACHINES.map((m, k) => {
      const mach = new BUILDERS[k](m.color);
      mach.group.position.copy(cell(k));
      this.scene.add(mach.group);
      return mach;
    });

    const n = 220;
    this.sparkSeed = Array.from({ length: n }, (_, i) => [hash(i * 1.9) * 7 - 3.5, hash(i * 2.3), hash(i * 3.7) * 2 - 1, 0.5 + hash(i * 4.9)]);
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.sparks = new THREE.Points(sg, new THREE.PointsMaterial({ color: "#ffb347", size: 0.05, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.scene.add(this.sparks);

    this.buildRig();
    this.buildTimeline(timing);
    this.tmp = new THREE.Vector3();
  }

  /** Warning beacons on the scaffold and a welding-spark pool. */
  buildRig() {
    this.beacons = [-3.05, 3.05].map((x) => {
      const g = new THREE.Group();
      g.position.set(x, 4.8, 0.55);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), new THREE.MeshBasicMaterial({ color: "#ff6a1a" }));
      g.add(bulb);
      this.scene.add(g);
      return { g, bulb };
    });
    const per = 36;
    this.weldSeed = Array.from({ length: 6 * per }, (_, i) => [hash(i * 1.1) * 2 - 1, 0.6 + hash(i * 2.3) * 1.6, hash(i * 3.7) * 2 - 1, 0.5 + hash(i * 5.9)]);
    const wg = new THREE.BufferGeometry();
    wg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6 * per * 3), 3));
    this.weld = new THREE.Points(wg, new THREE.PointsMaterial({ color: "#ffd27a", size: 0.07, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.weld.frustumCulled = false;
    this.scene.add(this.weld);
    this.weldPer = per;
  }

  buildTimeline(timing) {
    const cue = (i) => timing.cues[i];
    const w = (ci, word, n = 0) => timing.wordTime(ci, word, n) ?? cue(ci).start;

    const views = [{ t: SECTIONS.verse1, v: closeView(0), dur: 0.01, focus: 0 }];
    for (const [ci, k] of CLOSEUPS) if (k > 0) views.push({ t: cue(ci).start - 0.35, v: closeView(k), dur: 0.9, focus: k });
    for (const ci of WIDE) views.push({ t: cue(ci).start - 0.3, v: WIDE_VIEW, dur: 1.1, focus: -1 });
    views.sort((a, b) => a.t - b.t);
    let from = views[0].v;
    views.forEach((k, i) => {
      if (i > 0) from = this.viewSeg(views[i - 1], k.t);
      k.from = from;
    });
    this.views = views;

    // When each machine first checks in, and every moment it is called.
    this.calls = MACHINES.map(() => []);
    for (const [ci, k] of CLOSEUPS) this.calls[k].push(w(ci, MACHINES[k].word));
    const chain = cue(VERSE1.chain);
    MACHINES.forEach((_, k) => this.calls[k].push(lerp(chain.start, chain.end - 0.2, k / 5)));
    for (const [ci, ks] of ROLL) for (const k of ks) this.calls[k].push(w(ci, MACHINES[k].word));
    this.checkIn = this.calls.map((c, k) => (k < 3 ? c[0] : Math.min(...c)));
    this.hits = MACHINES.map(() => []);
    this.actions = ACTIONS.map(([ci, word, ks]) => {
      const t0 = w(ci, word);
      for (const k of ks) this.hits[k].push(t0);
      return { t0, word: word.toUpperCase() + " IT!" };
    });
    for (let k = 0; k < 6; k++) {
      this.hits[k].push(...this.calls[k]);
      this.hits[k].sort((a, b) => a - b);
    }
    this.heys = HEYS.flatMap((ci) => cue(ci).words.filter((x) => x.clean === "hey").map((x) => x.start));
    this.counts = COUNTS.flatMap(([ci, words]) => words.map((word, j) => ({ t0: w(ci, word), k: (ci === COUNTS[1][0] || ci === COUNTS[3][0] ? 3 : 0) + j })));
    this.checked = { t0: cue(VERSE1.checked).start, t1: cue(VERSE1.checked).end + 0.3 };
    this.direction = { t0: w(VERSE1.direction, "direction"), t1: cue(VERSE1.direction).end + 0.3 };
    this.longer = { t0: cue(VERSE2.longer).start, t1: cue(VERSE2.longer).end + 0.3 };
    this.work = { t0: cue(VERSE2.work).start, t1: cue(VERSE2.work).end + 0.2 };
    this.trade = { t0: cue(VERSE2.trade).start, t1: cue(VERSE2.trade).end + 1.2 };
    const b = BRIDGE;
    this.bridge = {
      six: w(b.howMany, "six"),
      howMany: cue(b.howMany).start,
      no: w(b.energy, "no"),
      energy: cue(b.energy).start,
      force: [cue(b.force).start, cue(b.force).end + 1.5],
      distance: [cue(b.distance).start, SECTIONS.outro],
    };
  }

  viewSeg(k, t) {
    const u = easeInOut((t - k.t) / k.dur);
    const v = {};
    for (const key of ["x", "y", "z", "Y"]) v[key] = lerp(k.from[key], k.v[key], u);
    v.z += Math.sin(Math.PI * u) * (k.v.z === k.from.z ? 3 : 0);
    return v;
  }

  viewAt(t) {
    let i = 0;
    for (let k = 0; k < this.views.length && this.views[k].t <= t; k++) i = k;
    const k = this.views[i];
    return { ...this.viewSeg(k, t), focus: t >= k.t + k.dur * 0.5 ? k.focus : i > 0 ? this.views[i - 1].focus : k.focus };
  }

  pulse(list, t, life = 0.5) {
    let v = 0;
    for (const e of list) {
      if (e > t) break;
      v = Math.max(v, Math.exp(-(t - e) / life));
    }
    return v;
  }

  update(t, section) {
    const { timing } = this.ctx;
    const kick = timing.pulse(t, 0.12);
    const bf = timing.beatFloat(t);
    const view = this.viewAt(t);
    const verse = section === "verse1" || section === "verse2";
    this.view = view;
    this.wide = smooth(12, 24, view.z);

    this.machines.forEach((m, k) => {
      const inn = smooth(this.checkIn[k] - 0.1, this.checkIn[k] + 0.2, t);
      const run = inn * (verse ? (view.focus === k ? 1 : 0.25) : 1);
      const cycle = bf / 4 + k * 0.13;
      let s = lerp(0.12, 0.5 - 0.5 * Math.cos(cycle * Math.PI * 2), run);
      for (const e of this.hits[k]) if (t >= e && t < e + 0.7) s = lerp(s, 1, Math.sin((Math.PI * (t - e)) / 0.7));
      m.pose(s);
      const call = this.pulse(this.calls[k], t, 0.4);
      m.shade(0.22 + 0.78 * inn, call + this.pulse(this.hits[k], t, 0.25) * 0.5 + inn * kick * 0.1);
      m.group.scale.setScalar(1 + call * 0.12);
      m.group.rotation.y = Math.sin(t * 0.6 + k) * 0.18 * (1 - this.wide * 0.5);
    });

    const sp = this.sparks.geometry.attributes.position;
    const rate = verse ? 0.6 : 1.4;
    this.sparkSeed.forEach(([x, y0, z, s], i) => {
      const y = 4.4 - ((((y0 * 9 + t * s * rate) % 9) + 9) % 9);
      sp.setXYZ(i, x + Math.sin(t * 2 + i) * 0.05, y, z + 0.8);
    });
    sp.needsUpdate = true;

    this.bgU.uTime.value = t;
    this.bgU.uKick.value = kick;
    this.bgU.uGear.value = bf * (Math.PI / 6);

    // Chorus roll call: punch toward each machine as it is named.
    const loud = section.startsWith("chorus") || section === "breakdown";
    if (section.startsWith("chorus")) {
      let best = null;
      this.calls.forEach((list, k) => {
        for (const c of list) if (c <= t + 0.04 && (!best || c > best.c)) best = { c, k };
      });
      if (best && t - best.c < 0.9) {
        const a = smooth(best.c - 0.04, best.c + 0.06, t) * Math.exp(-Math.max(0, t - best.c - 0.15) / 0.25);
        const target = closeView(best.k);
        for (const key of ["x", "y", "Y"]) view[key] = lerp(view[key], target[key], a * 0.55);
        view.z = lerp(view.z, 16, a);
      }
    }
    const upp = (2 * view.z * TAN) / 1920;
    const sway = section === "breakdown" ? Math.sin(t * 0.8) * 1.2 : Math.sin(t * 0.3) * 0.3;
    this.camera.position.set(view.x + sway * (0.3 + this.wide), view.y - (960 - view.Y) * upp, view.z - kick * 0.15);
    const jolt = this.heys.reduce((m, h) => Math.max(m, t >= h ? Math.exp(-(t - h) / 0.12) : 0), 0);
    this.camera.rotation.set(Math.sin(t * 90) * 0.006 * jolt, sway * 0.02, Math.sin(t * 70) * 0.012 * jolt);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    this.scene.updateMatrixWorld();

    this.site.update(t, kick);
    this.beacons.forEach(({ bulb }, i) => {
      const blink = Math.floor(bf + i) % 2 === 0 ? 1 : 0.25;
      bulb.material.color.set("#ff6a1a").multiplyScalar((loud ? 1.2 + kick : 0.7) * blink);
    });
    const wp = this.weld.geometry.attributes.position;
    let weldOn = 0;
    this.machines.forEach((m, k) => {
      const last = this.hits[k].findLast((e) => e <= t);
      const dt = last === undefined ? 9 : t - last;
      const o = cell(k);
      for (let j = 0; j < this.weldPer; j++) {
        const [vx, vy, vz, sp] = this.weldSeed[k * this.weldPer + j];
        const u = dt * sp;
        const live = dt < 0.7;
        wp.setXYZ(k * this.weldPer + j, live ? o.x + vx * u * 2.2 : 0, live ? o.y + 0.2 + vy * u * 2.4 - u * u * 5 : -99, live ? 0.6 + vz * u : 0);
      }
      if (dt < 0.7) weldOn = Math.max(weldOn, 1 - dt / 0.7);
    });
    wp.needsUpdate = true;
    this.weld.material.opacity = 0.35 + weldOn * 0.65;

    const post = { bloom: [loud ? 0.7 : 0.55, 0.42, loud ? 0.68 : 0.75], ca: 0.1 + kick * (loud ? 0.35 : 0.2), vignette: 0.5, grain: 0.03 };
    const start = SECTIONS[section];
    if (start !== undefined && t - start < 0.3) post.flash = Math.exp(-(t - start) / 0.1) * 0.4;
    for (const h of this.heys) {
      if (t >= h && t < h + 0.2) post.flash = Math.max(post.flash || 0, 0.35 * (1 - (t - h) / 0.2));
      if (t >= h && t < h + 0.5) post.shock = [0.5, 0.6, (t - h) * 1.2, 0.8];
      if (t >= h && t < h + 0.12) post.glitch = 0.35;
    }
    this.drawHud(t, section);
    return post;
  }

  screen(k, lx, ly) {
    const m = this.machines[k].group;
    this.tmp.set(lx, ly, 0.3).applyMatrix4(m.matrixWorld).project(this.camera);
    return [(this.tmp.x * 0.5 + 0.5) * 1080, (-this.tmp.y * 0.5 + 0.5) * 1920];
  }

  tag(text, x, y, color, a, size = 30) {
    if (a <= 0) return;
    const { hud } = this.ctx;
    const ctx = hud.ctx;
    hud.font(size, 800, FONT_COND);
    const w = ctx.measureText(text).width + 28;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = "rgba(8,10,18,0.82)";
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - size * 0.72, w, size * 1.44, 10);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    hud.text(text, x, y + 1, { size, weight: 800, family: FONT_COND, color, alpha: a, tracking: 1 });
  }

  drawHud(t, section) {
    const { hud } = this.ctx;
    const view = this.view;
    const close = 1 - this.wide;

    // Close-up: title, definition and part labels.
    if (view.focus >= 0 && close > 0.3) {
      const k = view.focus;
      const m = MACHINES[k];
      const a = smooth(0.3, 0.8, close);
      const ctx = hud.ctx;
      ctx.save();
      ctx.globalAlpha = 0.7 * a;
      ctx.fillStyle = "#07080e";
      ctx.beginPath();
      ctx.roundRect(90, TOP_Y - 55, 900, k === 3 && t >= this.longer.t0 - 0.2 && t < this.longer.t1 ? 250 : 190, 28);
      ctx.fill();
      ctx.restore();
      hud.text(`${k + 1} · ${m.name}`, 540, TOP_Y + 20, { size: m.name.length > 10 ? 76 : 92, weight: 800, family: FONT_COND, color: m.color, alpha: a, glow: 22, tracking: 2 });
      hud.text(m.def, 540, TOP_Y + 100, { size: 32, weight: 700, family: FONT_MONO, color: "#e8ecff", alpha: a * 0.9 });
      for (const [label, anchor] of LABELS[k]) {
        const p = this.machines[k].anchors[anchor];
        if (!p) continue;
        const [x, y] = this.screen(k, p[0], p[1]);
        const arrows = k === 1 && (anchor === "pull" || anchor === "up");
        const boost = arrows ? smooth(this.direction.t0 - 0.1, this.direction.t0 + 0.2, t) * (1 - smooth(this.direction.t1 - 0.3, this.direction.t1, t)) : 0;
        this.tag(label, clamp(x, 140, 940), clamp(y, 480, 1190), arrows ? "#ffffff" : m.color, a * (arrows ? 0.55 + 0.45 * boost : 1), arrows ? Math.round(28 + 14 * boost) : 28);
      }
      if (k === 3 && t >= this.longer.t0 && t < this.longer.t1) {
        const b = smooth(this.longer.t0, this.longer.t0 + 0.3, t) * (1 - smooth(this.longer.t1 - 0.3, this.longer.t1, t));
        hud.text("longer route  →  less force", 540, TOP_Y + 160, { size: 40, weight: 800, family: FONT_COND, color: "#ffffff", alpha: b * a, glow: 12 });
      }
    }

    // Wide shelf: a numbered tag under every machine.
    if (this.wide > 0.3) {
      const a = smooth(0.3, 0.8, this.wide);
      MACHINES.forEach((m, k) => {
        const inn = smooth(this.checkIn[k] - 0.1, this.checkIn[k] + 0.2, t);
        const [x, y] = this.screen(k, 0, -1.22);
        const call = this.pulse(this.calls[k], t, 0.4);
        const name = inn > 0.5 ? m.name : "?";
        this.tag(name, x, y, inn > 0.5 ? m.color : "#7a8099", a * (1 - smooth(1150, 1190, y)), Math.round(28 * (1 + call * 0.3)));
        let count = 0;
        for (const c of this.counts) if (c.k === k && t >= c.t0 && t < c.t0 + 1.6) count = Math.max(count, Math.exp(-(t - c.t0) / 0.6));
        const [bx, by] = this.screen(k, -1.0, 0.9);
        if (count > 0) hud.text(String(k + 1), bx, by, { size: Math.round(64 * (1 + count * 0.4)), weight: 800, family: FONT_COND, color: "#ffd23f", alpha: a * Math.min(1, count * 3), glow: 20 });
        if (t >= this.checked.t0 && t < this.checked.t1) {
          const c = smooth(this.checked.t0, this.checked.t0 + 0.3, t) * (1 - smooth(this.checked.t1 - 0.3, this.checked.t1, t));
          const [cx, cy] = this.screen(k, 0, 0.1);
          hud.text(k < 3 ? "✓" : "?", cx, cy, { size: 120, weight: 800, family: FONT_COND, color: k < 3 ? "#7cff6b" : "#9aa0c0", alpha: c * a, glow: 24 });
        }
      });
    }

    // Chorus call-and-response, actions and the bridge quiz.
    for (const [k, list] of this.calls.entries()) {
      const last = list.findLast((e) => e <= t);
      if (section.startsWith("chorus") && last !== undefined && t - last < 0.5) hud.slam(MACHINES[k].name, t, last, last + 0.3, { y: TOP_Y, size: 84, color: MACHINES[k].color, angle: -0.03 });
    }
    for (const act of this.actions) hud.stamp(act.word, t, act.t0, { x: 540, y: 760, size: 110, color: "#ffd23f", angle: -0.08, life: 0.8 });
    for (const h of this.heys) hud.stamp("HEY!", t, h, { x: 540, y: 1080, size: 100, color: "#ff5d8f", angle: 0.08, life: 0.45 });

    if (t >= this.work.t0 && t < this.work.t1) hud.slam("WORK = FORCE × DISTANCE", t, this.work.t0, this.work.t1 - 0.2, { y: TOP_Y, size: 70, color: "#ffd23f", sub: "machines don't make extra work", angle: -0.02 });
    if (t >= this.trade.t0 && t < this.trade.t1) {
      const a = smooth(this.trade.t0, this.trade.t0 + 0.3, t) * (1 - smooth(this.trade.t1 - 0.3, this.trade.t1, t));
      hud.text("small force  ×  long distance", 540, TOP_Y - 10, { size: 44, weight: 800, family: FONT_COND, color: "#7cff6b", alpha: a, glow: 12 });
      hud.text("=  big force  ×  short distance", 540, TOP_Y + 50, { size: 44, weight: 800, family: FONT_COND, color: "#ff7a3d", alpha: a * smooth(this.trade.t0 + 1, this.trade.t0 + 1.3, t), glow: 12 });
    }
    const br = this.bridge;
    if (t >= br.howMany && t < br.six) hud.slam("HOW MANY?", t, br.howMany, br.six - 0.1, { y: TOP_Y, size: 90, color: "#ffffff", angle: -0.03 });
    hud.stamp("6", t, br.six, { x: 540, y: 760, size: 300, color: "#ffd23f", angle: -0.06, life: br.energy - br.six });
    if (t >= br.energy && t < br.no) hud.slam("ENERGY FROM NOTHING?", t, br.energy, br.no - 0.1, { y: TOP_Y, size: 70, color: "#ffffff", angle: -0.02 });
    hud.stamp("NO!", t, br.no, { x: 540, y: 760, size: 220, color: "#ff5d5d", angle: 0.06, life: br.force[0] - br.no });
    if (t >= br.force[0] && t < br.force[1]) hud.slam("FORCE: SIZE OR DIRECTION", t, br.force[0], br.force[1] - 0.2, { y: TOP_Y, size: 64, color: "#3de8ff", angle: -0.02 });
    if (t >= br.distance[0] && t < br.distance[1]) hud.slam("…OR DISTANCE", t, br.distance[0], br.distance[1] - 0.2, { y: TOP_Y, size: 80, color: "#7cff6b", angle: -0.02 });
    if (section === "outro") hud.text("SIX MACHINES AT WORK", 540, TOP_Y, { size: 72, weight: 800, family: FONT_COND, color: "#ffd23f", alpha: smooth(SECTIONS.outro, SECTIONS.outro + 0.4, t), glow: 22, tracking: 3 });
  }
}
