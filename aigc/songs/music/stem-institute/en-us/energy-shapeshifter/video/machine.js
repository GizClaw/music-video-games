import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { FONT_COND, FONT_MONO, SAFE } from "@gizclaw/mvg-core/hud.js";
import { clamp, easeInOut, hash, lerp, smooth } from "@gizclaw/mvg-core/timing.js";
import { CHORUSES, FORMS, FORM_ORDER, INTRO_CUES, ORDER, SECTIONS } from "./constants.js";

// A closed-loop machine, drawn as a vertical column for portrait. The orb's
// position is a loop parameter s in [0, N): integer k is control point k.
const PTS = [
  [-1.5, 6.3], [-0.6, 6.15], [0.6, 4.8], [1.6, 3.3], [2.0, 2.65], [2.7, 2.25], [2.75, 0.9], [1.4, 0.25],
  [-0.6, -0.55], [-1.4, -1.3], [-0.5, -2.7], [0.6, -3.35], [-1.4, -3.9], [-2.9, -3.6], [-2.9, 1.5], [-2.6, 6.0],
];
const N = PTS.length;
const SEG_FORM = ["potential", "kinetic", "kinetic", "electrical", "electrical", "electrical", "electrical", "thermal", "light", "light", "chemical", "chemical", "kinetic", "potential", "potential", "potential"];
const STATION = { potential: 0, kinetic: 2, electrical: 5.2, thermal: 7, light: 9, chemical: 11 };
const ANCHOR = { potential: [-1.5, 6.1], kinetic: [0.6, 4.8], electrical: [2.7, 2.0], thermal: [1.4, 0.25], light: [-1.4, -1.3], chemical: [0.6, -3.35] };
const SUB = { kinetic: "motion", potential: "stored by height or shape", thermal: "particles in motion", light: "radiant propagation", electrical: "charges on the move", chemical: "stored, ready to use" };
const CENTRE = new THREE.Vector3(0, 1.2, 0);
const LIFT = 170;
const TRAIL = 28;

const mod = (x, n) => ((x % n) + n) % n;

export class MachineScene {
  constructor(ctx) {
    this.ctx = ctx;
    const { timing, renderer } = ctx;
    this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.4;
    this.camera = new THREE.PerspectiveCamera(35, 9 / 16, 0.5, 200);
    this.camera.setViewOffset(1080, 1920, 0, LIFT, 1080, 1920);
    this.scene.add(new THREE.HemisphereLight("#d8e6ff", "#140c10", 0.5));
    const key = new THREE.DirectionalLight("#fff2e0", 1.8);
    key.position.set(-5, 9, 10);
    this.scene.add(key);
    this.curve = new THREE.CatmullRomCurve3(PTS.map(([x, y]) => new THREE.Vector3(x, y, 0)), true, "centripetal");
    this.buildBackdrop();
    this.buildMachine();
    this.buildOrb();
    this.buildTimeline(timing);
  }

  pointAt(s) {
    return this.curve.getPoint(mod(s, N) / N);
  }

  formAt(s) {
    return SEG_FORM[Math.floor(mod(s, N))];
  }

  buildBackdrop() {
    this.bgU = { uTime: { value: 0 }, uKick: { value: 0 }, uTint: { value: new THREE.Color("#ff8a1f") } };
    const bg = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        depthTest: false,
        depthWrite: false,
        uniforms: this.bgU,
        vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
        fragmentShader: /* glsl */ `
          uniform float uTime, uKick; uniform vec3 uTint; varying vec2 vUv;
          float h(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
          void main() {
            vec2 p = (vUv - vec2(0.5, 0.58)) * vec2(0.5625, 1.0);
            vec3 col = mix(vec3(0.02, 0.025, 0.05), vec3(0.05, 0.06, 0.1), smoothstep(-0.6, 0.6, p.y));
            col += uTint * exp(-length(p) * 3.0) * (0.12 + uKick * 0.05);
            vec2 g = vUv * vec2(9.0, 16.0) + vec2(0.0, uTime * 0.05);
            vec2 i = floor(g);
            float b = smoothstep(0.35, 0.0, length(fract(g) - 0.5 - (vec2(h(i), h(i + 3.1)) - 0.5) * 0.6)) * step(0.85, h(i + 7.7));
            col += vec3(0.6, 0.7, 1.0) * b * 0.06;
            gl_FragColor = vec4(col, 1.0);
          }`,
      }),
    );
    bg.renderOrder = -1;
    bg.frustumCulled = false;
    this.scene.add(bg);
  }

  buildMachine() {
    const metal = new THREE.MeshPhysicalMaterial({ color: "#7c8698", metalness: 0.8, roughness: 0.38, clearcoat: 0.3 });
    const dark = new THREE.MeshPhysicalMaterial({ color: "#262b38", metalness: 0.4, roughness: 0.45 });
    const add = (m, x, y, z = 0) => {
      m.position.set(x, y, z);
      this.scene.add(m);
      return m;
    };
    add(new THREE.Mesh(new THREE.TubeGeometry(this.curve, 600, 0.06, 10, true), metal), 0, 0);
    // Shelf and spring (potential).
    add(new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.14, 1.0), dark), -1.6, 6.02);
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.4, 12), metal), -1.6, 4.85);
    const helix = new THREE.CatmullRomCurve3(Array.from({ length: 80 }, (_, i) => new THREE.Vector3(Math.cos(i * 0.6) * 0.22, i / 80, Math.sin(i * 0.6) * 0.22)));
    this.spring = add(new THREE.Mesh(new THREE.TubeGeometry(helix, 240, 0.035, 8), new THREE.MeshPhysicalMaterial({ color: FORMS.potential.color, metalness: 0.6, roughness: 0.3, emissive: FORMS.potential.color, emissiveIntensity: 0.15 })), -2.1, 6.09);
    // Turbine wheel and generator (electrical).
    this.wheel = new THREE.Group();
    this.wheel.add(new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.04, 10, 48), metal));
    for (let k = 0; k < 8; k++) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.42, 0.3), dark);
      p.position.set(Math.cos((k * Math.PI) / 4) * 0.25, Math.sin((k * Math.PI) / 4) * 0.25, 0);
      p.rotation.z = (k * Math.PI) / 4;
      this.wheel.add(p);
    }
    add(this.wheel, 2.0, 2.65, -0.3);
    this.generator = add(new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.7, 0.7), new THREE.MeshPhysicalMaterial({ color: "#1c2a3a", metalness: 0.5, roughness: 0.35, emissive: FORMS.electrical.color, emissiveIntensity: 0.1 })), 3.05, 2.25, -0.2);
    const cable = new THREE.CatmullRomCurve3([[3.05, 1.9], [3.2, 1.0], [2.6, 0.45], [1.75, 0.3]].map(([x, y]) => new THREE.Vector3(x, y, 0.15)));
    this.cable = cable;
    add(new THREE.Mesh(new THREE.TubeGeometry(cable, 80, 0.045, 8), new THREE.MeshPhysicalMaterial({ color: "#d07a3a", metalness: 0.9, roughness: 0.3 })), 0, 0);
    this.charges = Array.from({ length: 10 }, () => add(new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshBasicMaterial({ color: FORMS.electrical.color })), 0, 0));
    // Heater coil (thermal) with rising heat specks.
    const coil = new THREE.CatmullRomCurve3(Array.from({ length: 90 }, (_, i) => new THREE.Vector3(-0.5 + i / 90, Math.cos(i * 0.7) * 0.12, Math.sin(i * 0.7) * 0.12)));
    this.coilMat = new THREE.MeshPhysicalMaterial({ color: "#5a2a20", metalness: 0.6, roughness: 0.35, emissive: FORMS.thermal.color, emissiveIntensity: 0.1 });
    add(new THREE.Mesh(new THREE.TubeGeometry(coil, 260, 0.035, 8), this.coilMat), 1.4, 0.05, 0.25);
    this.heat = Array.from({ length: 24 }, () => add(new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), new THREE.MeshBasicMaterial({ color: FORMS.thermal.color, transparent: true })), 0, 0));
    // Bulb (light).
    this.bulb = add(new THREE.Mesh(new THREE.SphereGeometry(0.46, 40, 28), new THREE.MeshPhysicalMaterial({ color: "#fff8e0", roughness: 0.05, transmission: 0.9, thickness: 0.2, transparent: true, opacity: 0.6, emissive: FORMS.light.color, emissiveIntensity: 0 })), -1.4, -1.25, 0.3);
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.3, 20), metal), -1.4, -1.82, 0.3);
    this.filament = add(new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.02, 8, 24), new THREE.MeshBasicMaterial({ color: "#ffb347" })), -1.4, -1.25, 0.3);
    this.rays = Array.from({ length: 12 }, (_, k) => {
      const m = add(new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.6), new THREE.MeshBasicMaterial({ color: FORMS.light.color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })), -1.4, -1.25, 0.32);
      m.userData.a = (k / 12) * Math.PI * 2;
      return m;
    });
    // Battery and an apple (chemical).
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 1.0, 32), dark), 0.6, -3.05, -0.25);
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.12, 20), metal), 0.6, -2.5, -0.25);
    this.charge = add(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1, 32).translate(0, 0.5, 0), new THREE.MeshPhysicalMaterial({ color: FORMS.chemical.color, emissive: FORMS.chemical.color, emissiveIntensity: 0.5, transparent: true, opacity: 0.85 })), 0.6, -3.53, -0.05);
    this.apple = add(new THREE.Group(), 1.55, -3.55, 0.2);
    this.apple.add(new THREE.Mesh(new THREE.SphereGeometry(0.3, 32, 24), new THREE.MeshPhysicalMaterial({ color: "#d42a2a", roughness: 0.3, clearcoat: 1 })));
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.18, 8), new THREE.MeshStandardMaterial({ color: "#5a3a1a" }));
    stem.position.y = 0.32;
    this.apple.add(stem);
    // Motor and lift gear (kinetic back to potential).
    add(new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 0.7), dark), -3.2, -4.05, -0.2);
    this.gear = add(new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.08, 6, 12), metal), -2.9, -3.6, 0.15);
    // Closed system: a glass case around everything (bridge).
    const box = new THREE.BoxGeometry(7.6, 11.6, 2.4);
    this.caseEdges = add(new THREE.LineSegments(new THREE.EdgesGeometry(box), new THREE.LineBasicMaterial({ color: "#bfe8ff", transparent: true, opacity: 0 })), 0, 1.25);
    this.caseGlass = add(new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: "#7fc8ff", transparent: true, opacity: 0, depthWrite: false, side: THREE.BackSide })), 0, 1.25);
  }

  buildOrb() {
    this.orb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 32, 24), new THREE.MeshBasicMaterial({ color: "#ffffff" }));
    this.halo = new THREE.Mesh(new THREE.SphereGeometry(0.42, 24, 16), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.scene.add(this.orb, this.halo);
    this.trail = Array.from({ length: TRAIL }, () => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      this.scene.add(m);
      return m;
    });
    this.splits = FORM_ORDER.map((f) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.15, 20, 14), new THREE.MeshBasicMaterial({ color: new THREE.Color(FORMS[f].color).multiplyScalar(1.4) }));
      this.scene.add(m);
      return m;
    });
  }

  buildTimeline(timing) {
    const cue = (i) => timing.cues[i];
    const w = (ci, word, n = 0) => timing.wordTime(ci, word, n) ?? cue(ci).start + 0.5;
    const P = timing.period;
    // Orb segments: within [t0, t1) the loop parameter eases from s0 to s1.
    const segs = [];
    const seg = (t0, t1, s0, s1, ease = easeInOut) => segs.push({ t0, t1, s0, s1, ease });
    const c = INTRO_CUES;
    seg(SECTIONS.verse1, cue(c.kinetic).end, 1, 3.3, (x) => x * x);
    seg(cue(c.potential).start, cue(c.potential).end, 14.2, 16);
    seg(cue(c.thermal).start - 1.2, cue(c.light).start, 7, 7);
    seg(cue(c.light).start, cue(c.electrical).start, 9, 9);
    seg(cue(c.electrical).start, cue(c.chemical).start, 4.4, 6.9, (x) => x);
    seg(cue(c.chemical).start, cue(8).start, 11, 11);
    // Six quick labels: hop station to station on the beat.
    this.hops = FORM_ORDER.map((f, k) => ({ f, t: timing.beatTime(timing.beatIndexAt(cue(8).start) + k) }));
    this.hops.forEach((h, k) => seg(h.t, this.hops[k + 1]?.t ?? cue(9).start, STATION[h.f], STATION[h.f]));
    seg(cue(9).start, SECTIONS.chorus1, 11, 11 + N, (x) => x);
    // Choruses and the break: the orb laps the whole machine.
    this.choruses = {};
    for (const [name, ci] of Object.entries(CHORUSES)) {
      const t0 = SECTIONS[name];
      const t1 = SECTIONS[ORDER[ORDER.indexOf(name) + 1]];
      const lap = 8 * P;
      seg(t0, t1, 0, ((t1 - t0) / lap) * N, (x) => x);
      this.choruses[name] = { start: t0, end: t1, names: FORM_ORDER.map((f) => ({ f, t: w(f === "electrical" || f === "chemical" ? ci + 3 : ci + 2, f) })), total: cue(ci + 5).start, change: w(ci, "change") };
    }
    seg(SECTIONS.break, SECTIONS.verse2, 0, ((SECTIONS.verse2 - SECTIONS.break) / (16 * P)) * N, (x) => x);
    // Verse 2: the worked transfers.
    const fall = w(16, "falling");
    this.fall = [{ t0: fall, t1: fall + 1.6 }, { t0: cue(17).start + 0.2, t1: cue(17).start + 2.6 }];
    seg(SECTIONS.verse2, fall, 0, 0);
    seg(fall, fall + 1.6, 0, 3.3, (x) => x * x);
    seg(fall + 1.6, cue(17).start + 0.2, 0, 0);
    seg(cue(17).start + 0.2, cue(17).start + 2.6, 0, 3.3, (x) => x * x);
    seg(cue(17).start + 2.6, cue(18).start, 3.3, 3.3);
    seg(cue(18).start, cue(19).start, 4.4, 8.9);
    seg(cue(19).start, cue(20).start, 9, 9);
    seg(cue(20).start, cue(21).start, 11.2, 11.2);
    seg(cue(21).start, cue(22).start, 12, 15.6);
    seg(cue(22).start, SECTIONS.chorus2, 16, 16);
    this.spread = { t0: cue(22).start, t1: cue(23).start, back: cue(23).end };
    // Bridge: "no, no, no" checks, then the closed case.
    this.nos = [30, 31].flatMap((ci) => [0, 1, 2].map((n) => w(ci, "no", n)));
    this.vanish = [cue(30).start, cue(31).start];
    this.closed = cue(32).start;
    this.conserve = w(33, "conservation");
    seg(SECTIONS.bridge, this.closed, 9, 9);
    seg(this.closed, SECTIONS.outro, 9, 9 + ((SECTIONS.outro - this.closed) / (12 * P)) * N, (x) => x);
    seg(SECTIONS.outro, SECTIONS.end + 1, 0, ((SECTIONS.end + 1 - SECTIONS.outro) / (8 * P)) * N, (x) => x);
    segs.sort((a, b) => a.t0 - b.t0);
    this.segs = segs;
    this.intro = Object.fromEntries(FORM_ORDER.map((f) => [f, { t: w(c[f], f), end: cue(c[f]).end, start: cue(c[f]).start }]));
    this.shape = w(c.potential, "shape");
    this.labelsCue = cue(8).start;
    this.foodCue = { start: cue(20).start, end: cue(21).end };
    this.lampCue = { start: cue(18).start, end: cue(19).end };
  }

  orbS(t) {
    let cur = this.segs[0];
    for (const s of this.segs) if (t >= s.t0) cur = s;
    const k = cur.ease(clamp((t - cur.t0) / Math.max(1e-3, cur.t1 - cur.t0), 0, 1));
    return lerp(cur.s0, cur.s1, k);
  }

  /** Which station the camera frames, or null for the whole machine. */
  focusAt(t, section) {
    if (section === "verse1") {
      if (t >= this.labelsCue) return null;
      let f = "kinetic";
      for (const k of FORM_ORDER) if (t >= this.intro[k].start - 0.3) f = k;
      return f;
    }
    if (section === "verse2") {
      if (t < this.lampCue.start - 0.3) return "potential";
      if (t < this.foodCue.start - 0.3) return "light";
      if (t < this.spread.t0 - 0.3) return "chemical";
      return null;
    }
    return null;
  }

  update(t, section) {
    const { timing } = this.ctx;
    const kick = timing.pulse(t, 0.12);
    const s = this.orbS(t);
    const p = this.pointAt(s);
    const form = this.formAt(s);
    const fc = new THREE.Color(FORMS[form].color);
    const near = (st) => Math.exp(-Math.abs(mod(s - st + N / 2, N) - N / 2) * 1.2);

    // Verse 1 shape-shifts: the orb pops out and back in at each new station.
    let pop = 1;
    if (section === "verse1") for (const f of FORM_ORDER) {
      const st = this.intro[f].start;
      if (t >= st - 0.25 && t < st + 0.25) pop = Math.min(pop, Math.abs(t - st) / 0.25);
    }
    let vanish = 1;
    for (const v of this.vanish) if (t >= v && t < v + 1.2) vanish = Math.min(vanish, 1 - smooth(v, v + 0.6, t) * (1 - smooth(v + 0.7, v + 1.2, t)));
    for (const n of this.nos) if (t >= n && t < n + 0.3) vanish = Math.max(vanish, 1 - (t - n) / 0.3);
    const spreading = t >= this.spread.t0 && t < this.spread.back + 0.4;
    const out = spreading ? smooth(this.spread.t0, this.spread.t0 + 0.8, t) * (1 - smooth(this.spread.t1, this.spread.t1 + 1.2, t)) : 0;
    const scale = pop * vanish * (1 + kick * 0.15) * (1 - out);
    this.orb.position.copy(p).setZ(0.35);
    this.orb.scale.setScalar(Math.max(0.001, scale));
    this.orb.material.color.copy(fc).multiplyScalar(1.5);
    this.halo.position.copy(this.orb.position);
    this.halo.scale.setScalar(Math.max(0.001, scale * (1 + kick * 0.3)));
    this.halo.material.color.copy(fc);
    this.trail.forEach((m, k) => {
      const ts = this.orbS(t - (k + 1) * 0.035);
      m.position.copy(this.pointAt(ts)).setZ(0.33);
      m.scale.setScalar(Math.max(0.001, (1 - k / TRAIL) * scale));
      m.material.color.set(FORMS[this.formAt(ts)].color);
      m.material.opacity = 0.35 * (1 - k / TRAIL);
    });
    this.splits.forEach((m, k) => {
      m.visible = out > 0.01;
      if (!m.visible) return;
      const f = FORM_ORDER[k];
      const [ax, ay] = ANCHOR[f];
      m.position.set(lerp(p.x, ax, out), lerp(p.y, ay, out), 0.5);
      m.scale.setScalar(0.6 + out * 0.6 + kick * 0.2);
    });

    // Stations respond to the orb.
    const shapeK = t >= this.shape && t < this.shape + 1.2 ? Math.sin(((t - this.shape) / 1.2) * Math.PI) : 0;
    this.spring.scale.set(1, 0.55 - 0.3 * shapeK + 0.05 * Math.sin(t * 3), 1);
    this.spring.material.emissiveIntensity = 0.15 + near(STATION.potential) * 0.5 + shapeK;
    const elec = near(4.5) + near(5.5) + (section === "verse1" && t >= this.intro.electrical.start && t < this.intro.chemical.start ? 1 : 0);
    this.wheel.rotation.z = -t * (1 + 9 * clamp(near(3.4) + elec * 0.5, 0, 1.5));
    this.generator.material.emissiveIntensity = 0.1 + clamp(elec, 0, 1) * 0.9;
    this.charges.forEach((m, k) => {
      const u = mod(t * 0.6 * (1 + clamp(elec, 0, 1) * 2) + k / 10, 1);
      m.position.copy(this.cable.getPoint(u)).setZ(0.2);
      m.scale.setScalar(0.4 + clamp(elec, 0, 1) * 0.9);
    });
    const hot = clamp(near(STATION.thermal) * 1.4 + (t >= this.lampCue.start && t < this.lampCue.end ? 0.4 : 0), 0, 1);
    this.coilMat.emissiveIntensity = 0.1 + hot * 1.8;
    this.heat.forEach((m, k) => {
      const life = mod(t * 0.7 + hash(k * 3.1), 1);
      m.position.set(1.0 + hash(k * 1.7) * 0.8 + Math.sin(t * 6 + k) * 0.04 * (1 + hot * 2), 0.25 + life * 1.2, 0.3);
      m.material.opacity = hot * (1 - life);
    });
    const glow = clamp(near(STATION.light) * 1.5 + (t >= this.lampCue.start + 1.5 && t < this.lampCue.end ? 1 : 0), 0, 1);
    this.bulb.material.emissiveIntensity = glow * 1.6;
    this.filament.material.color.set("#ffb347").multiplyScalar(0.5 + glow * 1.8);
    this.rays.forEach((m) => {
      const a = m.userData.a + t * 0.2;
      const r = 0.75 + glow * 0.25 + kick * 0.1;
      m.position.set(-1.4 + Math.cos(a) * r, -1.25 + Math.sin(a) * r, 0.32);
      m.rotation.z = a - Math.PI / 2;
      m.material.opacity = glow * 0.7;
    });
    const chem = clamp(near(STATION.chemical) * 1.4, 0, 1);
    this.charge.scale.set(1, 0.25 + 0.7 * (section === "verse1" ? smooth(this.intro.chemical.start, this.intro.chemical.end, t) : 0.6 + 0.3 * chem), 1);
    this.charge.material.emissiveIntensity = 0.3 + chem;
    const food = t >= this.foodCue.start && t < this.foodCue.end ? 1 : 0;
    this.apple.scale.setScalar(0.8 + food * 0.5 + food * kick * 0.1);
    this.apple.rotation.y = t * 0.8;
    this.gear.rotation.z = t * (1 + 6 * near(12.5));
    const caseOn = section === "bridge" || section === "outro" ? smooth(this.closed, this.closed + 0.8, t) * (section === "outro" ? 1 - smooth(SECTIONS.outro, SECTIONS.outro + 1, t) : 1) : 0;
    this.caseEdges.material.opacity = caseOn * 0.8;
    this.caseGlass.material.opacity = caseOn * 0.06;

    // Camera: close on the named station, else the whole machine.
    const focus = this.focusAt(t, section);
    this.focus = focus;
    const goal = focus ? new THREE.Vector3(...ANCHOR[focus], 0) : CENTRE.clone();
    const dist = focus ? 14 : 30;
    // Ease between framings over half a second.
    const prev = this.focusAt(t - 0.5, section);
    const pGoal = prev ? new THREE.Vector3(...ANCHOR[prev], 0) : CENTRE.clone();
    const pDist = prev ? 14 : 30;
    let k = 1;
    if (prev !== focus) {
      let tc = t - 0.5;
      while (this.focusAt(tc, section) === prev && tc < t) tc += 0.02;
      k = easeInOut((t - tc) / 0.5);
    }
    const target = pGoal.lerp(goal, k);
    const d = lerp(pDist, dist, k) - kick * 0.3;
    const yaw = Math.sin(t * 0.21) * 0.18;
    this.camera.position.set(target.x + Math.sin(yaw) * d, target.y + d * 0.08, Math.cos(yaw) * d);
    this.camera.lookAt(target);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    this.scene.updateMatrixWorld();
    this.bgU.uTime.value = t;
    this.bgU.uKick.value = kick;
    this.bgU.uTint.value.copy(fc);

    const post = { bloom: [0.6, 0.42, 0.8], ca: 0.12 + kick * 0.25, vignette: 0.5 };
    const start = SECTIONS[section];
    if (start !== undefined && t - start < 0.3) post.flash = Math.exp(-(t - start) / 0.1) * 0.45;
    if (pop < 1) post.flash = Math.max(post.flash || 0, (1 - pop) * 0.25);
    this.drawHud(t, section, s, form, caseOn);
    return post;
  }

  screen(x, y, z = 0) {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    return [(v.x * 0.5 + 0.5) * 1080, (-v.y * 0.5 + 0.5) * 1920];
  }

  meter(t, section, s, form) {
    // Stacked bar: the energy's mix of forms, always summing to 100%.
    const frac = Object.fromEntries(FORM_ORDER.map((f) => [f, 0]));
    const fallK = this.fall.reduce((a, f) => (t >= f.t0 && t < f.t1 + 1 ? clamp((t - f.t0) / (f.t1 - f.t0), 0, 1) : a), -1);
    if (section === "verse2" && fallK >= 0) {
      frac.potential = 1 - fallK * fallK;
      frac.kinetic = fallK * fallK;
    } else {
      const i = Math.floor(mod(s, N));
      const f = mod(s, N) - i;
      const next = SEG_FORM[(i + 1) % N];
      const blend = smooth(0.7, 1, f);
      frac[form] += 1 - blend;
      frac[next] += blend;
    }
    const { hud } = this.ctx;
    const ctx = hud.ctx;
    const x = 96;
    const y0 = 420;
    const h = 700;
    hud.keepout(x - 20, y0 - 60, x + 70, y0 + h + 20);
    ctx.save();
    ctx.fillStyle = "rgba(10,12,24,0.7)";
    ctx.strokeStyle = "rgba(220,230,255,0.6)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(x, y0, 44, h, 12);
    ctx.fill();
    ctx.stroke();
    let y = y0 + h;
    for (const f of FORM_ORDER) {
      const seg = frac[f] * (h - 8);
      if (seg < 0.5) continue;
      ctx.fillStyle = FORMS[f].color;
      ctx.shadowColor = FORMS[f].color;
      ctx.shadowBlur = 14;
      ctx.fillRect(x + 4, y - 4 - seg, 36, seg);
      y -= seg;
    }
    ctx.restore();
    hud.text("100%", x + 22, y0 - 30, { size: 28, weight: 800, family: FONT_MONO, color: "#ffffff", glow: 10 });
  }

  drawHud(t, section, s, form, caseOn) {
    const { hud } = this.ctx;
    this.meter(t, section, s, form);
    const top = SAFE.top + 120;
    // Close-ups name the form; wide shots label every station.
    if (this.focus && section === "verse1") {
      const f = this.focus;
      hud.slam(FORMS[f].label, t, this.intro[f].t, this.intro[f].end - 0.1, { y: top, size: 130, color: FORMS[f].color, sub: SUB[f], angle: -0.04 });
    }
    const wide = !this.focus;
    if (wide) {
      const ch = this.choruses[section];
      FORM_ORDER.forEach((f, k) => {
        const [ax, ay] = ANCHOR[f];
        const [x, y] = this.screen(ax + (ax > 0 ? 0.9 : -0.9), ay + 0.55, 0.4);
        let a = 0.75;
        let size = 36;
        if (section === "verse1" && t >= this.labelsCue) a = smooth(this.hops[k].t, this.hops[k].t + 0.1, t);
        if (ch) {
          const n = ch.names.find((x) => x.f === f);
          const k2 = n && t >= n.t ? Math.exp(-(t - n.t) / 0.4) : 0;
          size = 36 + k2 * 18;
          a = 0.7 + k2 * 0.3;
        }
        hud.text(FORMS[f].label, Math.min(Math.max(x, 230), 880), y, { size: Math.round(size), weight: 800, family: FONT_COND, color: FORMS[f].color, alpha: a, glow: 12 });
      });
    }
    const ch = this.choruses[section];
    if (ch) hud.slam("SHAPE-SHIFT!", t, ch.change, ch.change + 1.4, { y: top, size: 120, color: "#ffffff", angle: -0.05 });
    if (ch && t >= ch.total) hud.text("TOTAL STAYS THE SAME", 540, top, { size: 52, weight: 800, family: FONT_COND, color: "#ffffff", glow: 16, alpha: smooth(ch.total, ch.total + 0.3, t) });
    if (section === "verse2") {
      const fallOn = this.fall.some((f) => t >= f.t0 - 0.2 && t < f.t1 + 1);
      if (fallOn) hud.text("POTENTIAL → KINETIC", 540, top, { size: 56, weight: 800, family: FONT_COND, color: FORMS.kinetic.color, glow: 16 });
      if (t >= this.lampCue.start && t < this.lampCue.end) hud.text("ELECTRICAL → LIGHT + THERMAL", 540, top, { size: 50, weight: 800, family: FONT_COND, color: FORMS.light.color, glow: 16 });
      if (t >= this.foodCue.start && t < this.foodCue.end) hud.text("CHEMICAL → KINETIC", 540, top, { size: 56, weight: 800, family: FONT_COND, color: FORMS.chemical.color, glow: 16 });
      if (t >= this.spread.t1 && t < SECTIONS.chorus2) hud.slam("NOT CREATED · NOT DESTROYED", t, this.spread.t1 + 0.2, SECTIONS.chorus2 - 0.2, { y: top, size: 74, color: "#ffffff", angle: -0.03 });
    }
    if (section === "bridge") {
      this.nos.forEach((n, i) => hud.stamp("NO!", t, n, { x: 300 + (i % 3) * 240, y: 520 + (i % 2) * 60, size: 120, color: "#ff3d4a", angle: -0.12 + (i % 3) * 0.12, life: 0.5 }));
      if (caseOn > 0.1) hud.text("CLOSED SYSTEM", 540, top, { size: 54, weight: 800, family: FONT_COND, color: "#bfe8ff", glow: 16, alpha: caseOn });
      hud.slam("CONSERVATION OF ENERGY", t, this.conserve, SECTIONS.outro - 0.2, { y: 1130, size: 82, color: "#ffd23f", sub: "total stays constant", angle: -0.03 });
    }
  }
}
