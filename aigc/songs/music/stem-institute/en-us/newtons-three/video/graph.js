import * as THREE from "three";
import { FONT_COND, FONT_MONO, SAFE } from "@gizclaw/mvg-core/hud.js";
import { clamp, easeInOut, lerp, smooth } from "@gizclaw/mvg-core/timing.js";
import { CHORUSES, ORDER, SECTIONS } from "./constants.js";

// Newton's laws as function graphs. A neon orb moves along a number-line track;
// above it its graph is drawn live: x–t worldlines (time up), v–t and F–a
// lines, and mirrored F–t pairs. Choruses swing the camera into 3-D worldlines.

const C = { A: "#3de8ff", B: "#ff9a3d", heavy: "#a07bff", light: "#7dffea", force: "#ff3d6e", accel: "#5dff8a", vel: "#ffd23f", axis: "#9fb4ff" };
const GX = [-2.45, 2.45];
const GY = [0, 3.3];
const TRACK = -0.42;
const SAMPLES = 110;
const PX = 180;
const LOOK_Y = 0.55;

function kin1(t, t0, x0, v0, pushes, axis) {
  let x = x0;
  let v = v0;
  let tc = t0;
  for (const p of pushes) {
    const a = p.a[axis];
    if (t <= p.t) break;
    x += v * (p.t - tc);
    tc = p.t;
    const te = Math.min(t, p.t + p.dur);
    const dt = te - tc;
    x += v * dt + 0.5 * a * dt * dt;
    v += a * dt;
    tc = te;
    if (t <= p.t + p.dur) return x;
  }
  return x + v * (t - tc);
}
const kin = (t, t0, x0, v0, pushes = []) => kin1(t, t0, x0, v0, pushes.slice().sort((a, b) => a.t - b.t).map((p) => ({ ...p, a: [p.a] })), 0);
const vel = (f, t) => (f(t + 0.01) - f(t - 0.01)) / 0.02;

const orb = (x, kind = "A", label = "", extra = {}) => ({ x, kind, label, lane: 0, z: 0, ...extra });
const arrow = (orbIndex, dir, len, color = C.force, label = "F") => ({ orb: orbIndex, dir, len, color, label });

/** Neon tube whose light pulses race from the curve's start to its head on every beat. */
function tubeMesh(radius, glow) {
  const uniforms = { uColor: { value: new THREE.Color() }, uPhase: { value: 0 }, uKick: { value: 0 }, uGlow: { value: glow ? 1 : 0 } };
  const m = new THREE.Mesh(
    new THREE.BufferGeometry(),
    new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: "varying float vU; varying vec3 vN; varying vec3 vV; void main(){ vU = uv.x; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }",
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; uniform float uPhase, uKick, uGlow; varying float vU; varying vec3 vN; varying vec3 vV;
        void main() {
          float d1 = (vU - uPhase) * 9.0;
          float d2 = (vU - fract(uPhase + 0.5)) * 9.0;
          float p1 = exp(-d1 * d1);
          float p2 = exp(-d2 * d2) * 0.5;
          float rim = pow(max(dot(vN, vV), 0.0), 1.5);
          float head = smoothstep(0.82, 1.0, vU);
          float k = 1.0 + uKick * 0.8 + (p1 + p2) * 2.2 + head * 0.6;
          vec3 c = uGlow > 0.5 ? uColor * 0.22 * k * rim : mix(uColor, vec3(1.0), 0.25 + 0.35 * (p1 + p2)) * (0.55 + 0.45 * rim) * k;
          if (any(isnan(c))) c = vec3(0.0);
          gl_FragColor = vec4(c, 1.0);
        }`,
    }),
  );
  m.userData.radius = radius;
  m.frustumCulled = false;
  return m;
}

export class GraphScene {
  constructor(ctx) {
    this.ctx = ctx;
    const { timing } = ctx;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 9 / 16, 0.1, 200);
    this.buildSky();
    this.buildPaper();
    this.buildAxes();
    this.curves = Array.from({ length: 8 }, () => {
      const core = tubeMesh(0.045, false);
      const glow = tubeMesh(0.15, true);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 12), new THREE.MeshBasicMaterial({ color: "#ffffff" }));
      this.scene.add(glow, core, head);
      return { core, glow, head };
    });
    this.dots = Array.from({ length: 40 }, () => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), new THREE.MeshBasicMaterial({ color: "#ffffff" }));
      this.scene.add(m);
      return m;
    });
    this.orbs = Array.from({ length: 3 }, () => {
      const g = new THREE.Group();
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.15, 24, 16), new THREE.MeshBasicMaterial({ color: "#ffffff" }));
      const glow = new THREE.Mesh(new THREE.SphereGeometry(0.28, 24, 16), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }));
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.025, 8, 40), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      g.add(core, glow, ring);
      this.scene.add(g);
      return { g, core, glow, ring };
    });
    this.guides = Array.from({ length: 3 }, () => {
      const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineDashedMaterial({ color: "#ffffff", dashSize: 0.08, gapSize: 0.07, transparent: true, opacity: 0.55 }));
      this.scene.add(l);
      return l;
    });
    this.arrows = Array.from({ length: 4 }, () => {
      const g = new THREE.Group();
      const mat = new THREE.MeshBasicMaterial({ color: "#ffffff" });
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1, 12).rotateZ(-Math.PI / 2).translate(0.5, 0, 0), mat);
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.28, 16).rotateZ(-Math.PI / 2), mat);
      g.add(shaft, head);
      this.scene.add(g);
      return { g, shaft, head, mat };
    });
    const n = 260;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.sparks = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.07, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.sparks.frustumCulled = false;
    this.scene.add(this.sparks);
    this.buildRhythm();
    this.buildTimeline(timing);
  }

  buildRhythm() {
    // Spectrum bars standing behind the graph.
    this.bars = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 0.02).translate(0, 0.5, 0), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }), 32);
    this.bars.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(32 * 3), 3);
    this.bars.frustumCulled = false;
    this.scene.add(this.bars);
    // Dust drifting through depth for parallax.
    const n = 900;
    const pos = new Float32Array(n * 3);
    this.dustSeed = Array.from({ length: n }, (_, i) => [((i * 0.6180339) % 1) * 16 - 8, ((i * 0.4142135) % 1) * 12 - 3.5, ((i * 0.7320508) % 1)]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.dust = new THREE.Points(geo, new THREE.PointsMaterial({ color: "#9fb4ff", size: 0.04, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.dust.frustumCulled = false;
    this.scene.add(this.dust);
    // Ring that bursts behind the graph on each downbeat.
    this.burstRings = [0, 1].map(() => {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.96, 1.0, 96), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.position.set(0, (GY[0] + GY[1]) / 2, -1.6);
      this.scene.add(m);
      return m;
    });
    // After-images trailing each orb.
    this.ghosts = Array.from({ length: 9 }, () => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      this.scene.add(m);
      return m;
    });
  }

  buildSky() {
    this.skyU = { uTime: { value: 0 }, uKick: { value: 0 }, uTint: { value: new THREE.Color(C.A) } };
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        depthTest: false,
        depthWrite: false,
        uniforms: this.skyU,
        vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
        fragmentShader: /* glsl */ `
          uniform float uTime, uKick; uniform vec3 uTint; varying vec2 vUv;
          float h(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
          void main() {
            vec2 p = (vUv - vec2(0.5, 0.58)) * vec2(0.5625, 1.0);
            vec3 col = mix(vec3(0.006, 0.008, 0.028), vec3(0.02, 0.012, 0.06), smoothstep(0.0, 1.0, vUv.y));
            col += uTint * exp(-length(p) * 3.0) * (0.07 + uKick * 0.04);
            vec2 g = vUv * vec2(60.0, 106.0);
            vec2 i = floor(g);
            col += vec3(0.6, 0.7, 1.0) * step(0.988, h(i)) * smoothstep(0.35, 0.0, length(fract(g) - 0.5)) * (0.5 + 0.5 * sin(uTime * 2.0 + h(i + 2.0) * 30.0)) * 0.6;
            gl_FragColor = vec4(col, 1.0);
          }`,
      }),
    );
    m.renderOrder = -2;
    m.frustumCulled = false;
    this.scene.add(m);
  }

  // Graph paper in the x–y plane and a floor grid (x–z) that shows in 3-D.
  buildPaper() {
    this.paperU = { uKick: { value: 0 }, uTint: { value: new THREE.Color(C.axis) }, uOpacity: { value: 1 }, uScan: { value: 0 }, uDown: { value: 0 } };
    const shader = (plane) => new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: this.paperU,
      vertexShader: "varying vec2 vP; void main(){ vP = " + plane + "; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: /* glsl */ `
        uniform float uKick, uOpacity, uScan, uDown; uniform vec3 uTint; varying vec2 vP;
        float grid(vec2 p, float s) { vec2 q = abs(fract(p / s + 0.5) - 0.5) * s; vec2 fw = fwidth(p) * 1.2; vec2 l = 1.0 - smoothstep(vec2(0.0), fw, q); return max(l.x, l.y); }
        void main() {
          float minor = grid(vP, 0.25);
          float major = grid(vP, 1.0);
          vec2 e = smoothstep(vec2(0.0), vec2(0.6), min(vP - vec2(${GX[0].toFixed(2)}, ${(GY[0] - 0.9).toFixed(2)}), vec2(${GX[1].toFixed(2)}, ${(GY[1] + 0.4).toFixed(2)}) - vP));
          float fade = e.x * e.y;
          float scan = exp(-abs(vP.x - mix(${(GX[0] - 0.6).toFixed(2)}, ${(GX[1] + 0.6).toFixed(2)}, uScan)) * 7.0);
          vec3 c = uTint * (minor * (0.05 + uKick * 0.06) + major * (0.14 + uDown * 0.25)) * (1.0 + uKick * 0.9) * fade * uOpacity;
          c += uTint * scan * (0.05 + major * 0.5 + minor * 0.25) * fade * uOpacity;
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    const w = GX[1] - GX[0] + 1.2;
    const h = GY[1] - GY[0] + 1.8;
    this.paper = new THREE.Mesh(new THREE.PlaneGeometry(w, h), shader("position.xy + vec2(0.0, " + ((GY[0] + GY[1]) / 2 - 0.25).toFixed(2) + ")"));
    this.paper.position.set(0, (GY[0] + GY[1]) / 2 - 0.25, -0.02);
    this.scene.add(this.paper);
    this.floorU = { uOpacity: { value: 0 } };
    this.floor = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 9).rotateX(-Math.PI / 2),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: this.floorU,
        vertexShader: "varying vec2 vP; void main(){ vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
        fragmentShader: "uniform float uOpacity; varying vec2 vP; float grid(vec2 p, float s){ vec2 q = abs(fract(p / s + 0.5) - 0.5) * s; vec2 fw = fwidth(p) * 1.2; vec2 l = 1.0 - smoothstep(vec2(0.0), fw, q); return max(l.x, l.y); } void main(){ float f = exp(-length(vP) * 0.35); gl_FragColor = vec4(vec3(0.5, 0.6, 1.0) * grid(vP, 0.5) * 0.25 * f * uOpacity, 1.0); }",
      }),
    );
    this.floor.position.y = TRACK - 0.02;
    this.scene.add(this.floor);
  }

  buildAxes() {
    const mk = (color) => {
      const g = new THREE.Group();
      const mat = new THREE.MeshBasicMaterial({ color });
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1, 8).translate(0, 0.5, 0), mat);
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 12), mat);
      g.add(shaft, head);
      this.scene.add(g);
      return { g, shaft, head, mat };
    };
    this.axisH = mk(C.axis);
    this.axisV = mk(C.axis);
    this.axisZ = mk(C.axis);
    this.trackAxis = mk(C.axis);
    this.ticks = Array.from({ length: 14 }, () => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.12, 0.015), new THREE.MeshBasicMaterial({ color: C.axis }));
      this.scene.add(m);
      return m;
    });
  }

  setAxis(a, from, to) {
    const d = to.clone().sub(from);
    const len = d.length();
    a.g.visible = len > 0.01;
    if (!a.g.visible) return;
    a.g.position.copy(from);
    a.g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    a.shaft.scale.set(1, len - 0.18, 1);
    a.head.position.set(0, len - 0.1, 0);
  }

  buildTimeline(timing) {
    const cue = (i) => timing.cues[i];
    const s = (i) => cue(i).start;
    const w = (ci, word, n = 0) => timing.wordTime(ci, word, n) ?? s(ci) + 0.6;
    const T = [];
    const add = (id, t0, t1, fn) => T.push({ id, t0, t1, fn });
    this.bursts = [];

    // World line: (x, time up). k fits the scenario window into the graph height.
    const world = (t0, t1, f, color, label, z = 0) => {
      const k = Math.min(1.25, (GY[1] - 0.15) / Math.max(0.5, t1 - t0));
      return { color, label, from: t0, map: (tt) => [f(tt), GY[0] + (tt - t0) * k, z] };
    };
    const vt = (t0, t1, f, color, label, kv = 0.55) => {
      const kt = (GX[1] - GX[0] - 0.4) / Math.max(0.5, t1 - t0);
      return { color, label, from: t0, map: (tt) => [GX[0] + 0.1 + (tt - t0) * kt, GY[0] + Math.max(-0.3, vel(f, tt)) * kv, 0] };
    };

    // Verse 1: the first law, on x–t world lines.
    const V1 = { start: SECTIONS.verse1, no: s(3), rest: s(4), steady: s(5), unless: s(7), netF: w(7, "net"), inertia: s(8), nudge: w(8, "inertia") };
    this.V1 = V1;
    const xs = {
      bal: () => 0,
      b: (t) => kin(t, V1.no, -2.0, 0.85),
      rest: () => -0.9,
      steady: (t) => kin(t, V1.steady, -2.2, 0.85),
      def: (t) => kin(t, V1.unless, -1.9, 0.45, [{ t: V1.netF, dur: 1.0, a: 1.9 }]),
      light: (t) => kin(t, V1.inertia, -2.1, 0.15, [{ t: V1.nudge, dur: 1.1, a: 2.6 }]),
      heavy: (t) => kin(t, V1.inertia, -1.6, 0.15, [{ t: V1.nudge, dur: 1.1, a: 0.5 }]),
    };
    add("balanced", V1.start - 0.3, V1.no, () => ({
      mode: "xt",
      orbs: [orb(0, "A")],
      arrows: [arrow(0, 1, 0.9), arrow(0, -1, 0.9)],
      curves: [world(V1.start - 0.3, V1.no, xs.bal, C.A, "at rest")],
      note: "FIRST LAW · ΣF = 0",
      sub: "balanced forces: the line stays straight",
    }));
    add("no-reason", V1.no, V1.rest, () => ({
      mode: "xt",
      orbs: [orb(0, "A"), orb(xs.b, "B")],
      arrows: [arrow(0, 1, 0.9), arrow(0, -1, 0.9)],
      curves: [world(V1.no, V1.rest, xs.bal, C.A, "v = 0"), world(V1.no, V1.rest, xs.b, C.B, "v = const")],
      note: "NO NET FORCE → MOTION DOESN'T CHANGE",
    }));
    add("rest", V1.rest, V1.steady, () => ({ mode: "xt", orbs: [orb(xs.rest(), "A", "v = 0")], arrows: [], curves: [world(V1.rest, V1.steady, xs.rest, C.A, "vertical line")], note: "AT REST → STAYS AT REST", beats: true }));
    add("steady", V1.steady, V1.unless, () => ({
      mode: "xt",
      orbs: [orb(xs.steady, "A")],
      arrows: [arrow(0, 1, 0.7, C.vel, "v")],
      curves: [world(V1.steady, V1.unless, xs.steady, C.A, "slope = v")],
      note: "CONSTANT VELOCITY",
      sub: "straight line · same speed, same direction",
      beats: true,
    }));
    add("deflect", V1.unless, V1.inertia, (t) => ({
      mode: "xt",
      orbs: [orb(xs.def, "A")],
      arrows: t >= V1.netF && t < V1.netF + 1.0 ? [arrow(0, 1, 1.0)] : [],
      curves: [world(V1.unless, V1.inertia, xs.def, C.A, t >= V1.netF ? "line bends!" : "")],
      note: t >= V1.netF ? "NET FORCE → THE LINE BENDS" : "UNLESS A NET FORCE…",
      beats: true,
    }));
    this.bursts.push({ t: V1.netF, color: C.force });
    add("inertia", V1.inertia, SECTIONS.chorus1, (t) => {
      const on = t >= V1.nudge && t < V1.nudge + 1.1;
      return {
        mode: "xt",
        orbs: [orb(xs.light, "light", "m"), orb(xs.heavy, "heavy", "5m", { lane: 1 })],
        arrows: on ? [arrow(0, 1, 0.8), arrow(1, 1, 0.8)] : [],
        curves: [world(V1.inertia, SECTIONS.chorus1, xs.light, C.light, "bends a lot"), world(V1.inertia, SECTIONS.chorus1, xs.heavy, C.heavy, "barely bends")],
        note: "INERTIA",
        sub: "same force · more mass, less change",
      };
    });

    // Choruses: one graph per law, then 3-D world lines for the stomp-clap.
    this.choruses = {};
    for (const [name, ci] of Object.entries(CHORUSES)) {
      const end = SECTIONS[ORDER[ORDER.indexOf(name) + 1]];
      const ch = { start: SECTIONS[name], one: s(ci), two: s(ci + 1), three: s(ci + 2), four: s(ci + 3), end };
      ch.claps = [w(ci + 3, "clap"), w(ci + 4, "clap")];
      ch.stomps = [w(ci + 3, "stomp"), w(ci + 4, "stomp")];
      ch.declares = [w(ci + 3, "declare"), w(ci + 4, "declare")];
      ch.kick = ch.three + 0.3;
      this.choruses[name] = ch;
      const f1 = (t) => kin(t, ch.start - 0.2, -2.1, 1.25);
      const f2 = (t) => kin(t, ch.two, -2.2, 0, [{ t: ch.two + 0.1, dur: 9, a: 1.0 }]);
      const fa = (t) => kin(t, ch.three, -0.25, 0, [{ t: ch.kick, dur: 0.25, a: -6 }]);
      const fb = (t) => kin(t, ch.three, 0.25, 0, [{ t: ch.kick, dur: 0.25, a: 6 }]);
      add(`${name}-1`, ch.start - 0.2, ch.two, () => ({ mode: "xt", orbs: [orb(f1, "A")], arrows: [arrow(0, 1, 0.7, C.vel, "v")], curves: [world(ch.start - 0.2, ch.two, f1, C.A, "straight")], beats: true }));
      add(`${name}-2`, ch.two, ch.three, () => ({ mode: "xt", orbs: [orb(f2, "A")], arrows: [arrow(0, 1, 0.9)], curves: [world(ch.two, ch.three, f2, C.accel, "curve = acceleration")], beats: true }));
      add(`${name}-3`, ch.three, ch.four, (t) => ({
        mode: "xt",
        orbs: [orb(fa, "A"), orb(fb, "B")],
        arrows: t >= ch.kick - 0.1 && t < ch.kick + 0.5 ? [arrow(0, -1, 0.8), arrow(1, 1, 0.8)] : [],
        curves: [world(ch.three, ch.four, fa, C.A, ""), world(ch.three, ch.four, fb, C.B, "")],
      }));
      this.bursts.push({ t: ch.kick, color: C.force, x: 0 });
      // Two orbs meet on each clap; in 3-D their world lines form an X pattern.
      const keys = [[ch.four, 1.8], [ch.claps[0], 0], [(ch.claps[0] + ch.claps[1]) / 2, 1.8], [ch.claps[1], 0], [end, 2.2]];
      const gap = (t) => {
        for (let k = 0; k < keys.length - 1; k++) if (t < keys[k + 1][0]) return lerp(keys[k][1], keys[k + 1][1], easeInOut((t - keys[k][0]) / (keys[k + 1][0] - keys[k][0])));
        return keys.at(-1)[1];
      };
      const ga = (t) => -0.2 - gap(t);
      const gb = (t) => 0.2 + gap(t);
      add(`${name}-4`, ch.four, end, () => ({
        mode: "xt",
        orbs: [orb(ga, "A"), orb(gb, "B")],
        arrows: [],
        curves: [world(ch.four, end, ga, C.A, ""), world(ch.four, end, gb, C.B, "")],
        clapPoints: ch.claps.map((c) => [0, world(ch.four, end, () => 0, "", "").map(c)[1], c]),
      }));
      for (const c of ch.claps) this.bursts.push({ t: c, color: C.vel, x: 0 });
    }

    // Verse 2: the second law on v–t and F–a graphs.
    const V2 = { start: SECTIONS.verse2, flip: w(16, "points", 1), eq: s(17), moreF: s(19), moreM: s(20), check: s(22) };
    this.V2 = V2;
    const fd = (t) => kin(t, V2.start - 0.2, -2.2, 0.3, [{ t: V2.start + 0.2, dur: V2.flip - V2.start - 0.2, a: 0.55 }, { t: V2.flip, dur: 99, a: -0.9 }]);
    add("direction", V2.start - 0.2, V2.eq, (t) => {
      const dir = t < V2.flip ? 1 : -1;
      return {
        mode: "vt",
        orbs: [orb(fd, "A")],
        arrows: [arrow(0, dir, 0.9), arrow(0, dir, 0.6, C.accel, "a")],
        curves: [vt(V2.start - 0.2, V2.eq, fd, C.accel, dir > 0 ? "slope +" : "slope −", 0.9)],
        note: "SECOND LAW · a POINTS WITH F",
        sub: "on a v–t graph, a = slope",
      };
    });
    this.bursts.push({ t: V2.flip, color: C.force });
    // F–a: for each force step on the beat, plot a point; mass is the slope.
    const bEq = timing.beatIndexAt(V2.eq) + 1;
    this.faPoints = Array.from({ length: 6 }, (_, k) => ({ t: timing.beatTime(bEq + k), F: k + 1 }));
    add("equation", V2.eq, V2.moreF, (t) => {
      const shown = this.faPoints.filter((p) => t >= p.t);
      const F = shown.length;
      const fx = (tt) => kin(tt, V2.eq, -2.0, 0, [{ t: V2.eq + 0.2, dur: 99, a: 0.25 + 0.12 * F }]);
      return {
        mode: "fa",
        orbs: [orb(fx, "A", "m")],
        arrows: F ? [arrow(0, 1, 0.3 + F * 0.15)] : [],
        curves: [],
        fa: { shown, slopes: [1, 2] },
        equation: true,
      };
    });
    const fF = (t) => kin(t, V2.moreF, -2.2, 0, [{ t: V2.moreF + 0.25, dur: 99, a: 0.45 }]);
    const f2F = (t) => kin(t, V2.moreF, -2.2, 0, [{ t: V2.moreF + 0.25, dur: 99, a: 0.9 }]);
    add("more-force", V2.moreF, V2.moreM, () => ({
      mode: "vt",
      orbs: [orb(fF, "A", "F"), orb(f2F, "B", "2F", { lane: 1 })],
      arrows: [arrow(0, 1, 0.6), arrow(1, 1, 1.2, C.force, "2F")],
      curves: [vt(V2.moreF, V2.moreM, fF, C.A, "slope a", 1.2), vt(V2.moreF, V2.moreM, f2F, C.B, "slope 2a", 1.2)],
      note: "MORE FORCE → STEEPER LINE",
    }));
    const fm = (t) => kin(t, V2.moreM, -2.2, 0, [{ t: V2.moreM + 0.25, dur: 99, a: 0.75 }]);
    const f3m = (t) => kin(t, V2.moreM, -2.2, 0, [{ t: V2.moreM + 0.25, dur: 99, a: 0.25 }]);
    add("more-mass", V2.moreM, V2.check, () => ({
      mode: "vt",
      orbs: [orb(fm, "light", "m"), orb(f3m, "heavy", "3m", { lane: 1 })],
      arrows: [arrow(0, 1, 0.8), arrow(1, 1, 0.8)],
      curves: [vt(V2.moreM, V2.check, fm, C.light, "a", 0.75), vt(V2.moreM, V2.check, f3m, C.heavy, "a/3", 0.75)],
      note: "MORE MASS → FLATTER LINE",
      sub: "same net force",
    }));
    // Check size and direction: a(t) follows F(t) as a step function.
    const bCk = timing.beatIndexAt(V2.check);
    const fOf = (tt) => [1, 2, -1, -2, 2, 1, -1, 0][clamp(timing.beatIndexAt(tt) - bCk, 0, 7)];
    add("check", V2.check, SECTIONS.chorus2, () => ({
      mode: "at",
      orbs: [orb(0, "A")],
      arrows: [arrow(0, Math.sign(fOf(this.now)) || 1, Math.abs(fOf(this.now)) * 0.45)],
      curves: [{ color: C.force, label: "F(t)", from: V2.check, step: true, map: (tt) => [GX[0] + 0.1 + ((tt - V2.check) * (GX[1] - GX[0] - 0.4)) / (SECTIONS.chorus2 - V2.check), 1.8 + fOf(tt) * 0.65, 0] }],
      note: "CHECK SIZE AND DIRECTION",
      sub: "height = size · sign = direction",
    }));

    // Break: circular motion is a helix in 3-D (x, z, time up).
    add("break", SECTIONS.break - 0.2, SECTIONS.verse3, () => ({
      mode: "helix",
      orbs: [0, 1, 2].map((k) => orb((tt) => Math.cos((tt - SECTIONS.break) * 1.25 + (k * Math.PI * 2) / 3) * 1.4, ["A", "B", "heavy"][k], "", { zf: (tt) => Math.sin((tt - SECTIONS.break) * 1.25 + (k * Math.PI * 2) / 3) * 1.4 })),
      arrows: [],
      curves: [0, 1, 2].map((k) => {
        const t0 = SECTIONS.break - 0.2;
        const kk = (GY[1] - 0.2) / (SECTIONS.verse3 - t0);
        const a = (tt) => (tt - SECTIONS.break) * 1.25 + (k * Math.PI * 2) / 3;
        return { color: [C.A, C.B, C.heavy][k], label: "", from: t0, map: (tt) => [Math.cos(a(tt)) * 1.4, GY[0] + (tt - t0) * kk, Math.sin(a(tt)) * 1.4] };
      }),
      note: "CIRCLES IN TIME = HELIX",
    }));

    // Verse 3: the third law on an F–t graph, then a rocket world line.
    const V3 = { start: SECTIONS.verse3, ab: w(29, "exerts"), ba: w(30, "exerts"), equal: s(31), opposite: s(32), share: s(33), apart: w(34, "opposite"), rocket: s(35) };
    this.V3 = V3;
    const Fp = (tt) => (tt < V3.ab ? 0 : tt < V3.apart ? smooth(V3.ab, V3.ab + 0.35, tt) * (1.0 + 0.06 * Math.sin((tt - V3.ab) * 2.0)) : Math.max(0, 1.0 - (tt - V3.apart) * 3));
    const pa = (t) => kin(t, V3.start, -0.25, 0, [{ t: V3.apart, dur: 0.3, a: -5 }]);
    const pb = (t) => kin(t, V3.start, 0.25, 0, [{ t: V3.apart, dur: 0.3, a: 5 }]);
    const kt3 = (GX[1] - GX[0] - 0.4) / (V3.rocket - V3.start);
    const tx = (tt) => GX[0] + 0.1 + (tt - V3.start) * kt3;
    add("pair", V3.start - 0.2, V3.rocket, (t) => ({
      mode: "ft",
      orbs: [orb(pa, "A", "A"), orb(pb, "B", "B")],
      arrows: Fp(t) > 0.05 ? [arrow(0, -1, Fp(t) * 0.8, C.force, "F on A"), arrow(1, 1, Fp(t) * 0.8, C.force, "F on B")] : [],
      curves: [
        { color: C.B, label: "F on B", from: V3.start, map: (tt) => [tx(tt), 1.8 + Fp(tt) * 1.2, 0] },
        { color: C.A, label: "F on A", from: V3.start, map: (tt) => [tx(tt), 1.8 - Fp(tt) * 1.2, 0] },
      ],
      pair: true,
    }));
    this.bursts.push({ t: V3.apart, color: C.force, x: 0 });
    const fr = (t) => kin(t, V3.rocket, -2.0, 0, [{ t: V3.rocket + 0.2, dur: 99, a: 1.2 }]);
    add("rocket", V3.rocket, SECTIONS.chorus3, () => ({
      mode: "xt",
      orbs: [orb(fr, "B", "rocket")],
      arrows: [arrow(0, 1, 0.9, C.force, "F on rocket")],
      curves: [world(V3.rocket, SECTIONS.chorus3, fr, C.B, "rocket"), ...[0, 1, 2, 3].map((k) => {
        const te = V3.rocket + 0.3 + k * 0.45;
        const ge = (tt) => (tt < te ? fr(tt) : fr(te) - (tt - te) * 2.2);
        return { ...world(V3.rocket, SECTIONS.chorus3, ge, "#ffb347", ""), from: te, thin: true };
      })],
      rocket: true,
      note: "ROCKET · PUSHES GAS BACK, GAS PUSHES IT FORWARD",
    }));

    // Outro: three small graphs, one per law.
    const O = { first: w(41, "first"), second: w(41, "second"), third: w(41, "third"), last: s(42) };
    this.O = O;
    add("outro", SECTIONS.outro - 0.2, SECTIONS.end + 1, () => ({ mode: "summary", orbs: [], arrows: [], curves: [], summary: true }));
    T.sort((a, b) => a.t0 - b.t0);
    this.timeline = T;
  }

  scenario(t) {
    let cur = this.timeline[0];
    let prev = cur;
    for (const s of this.timeline) if (t >= s.t0) {
      prev = cur;
      cur = s;
    }
    return [cur, prev];
  }

  setCurve(c, pts, color, thin = false) {
    const ok = pts.length >= 2;
    c.core.visible = c.glow.visible = c.head.visible = ok;
    if (!ok) return;
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), false, "centripetal");
    const seg = Math.min(160, pts.length * 2);
    const fat = 1 + this.kick * 0.45;
    for (const m of [c.core, c.glow]) {
      m.geometry.dispose();
      m.geometry = new THREE.TubeGeometry(curve, seg, m.userData.radius * (thin ? 0.5 : 1) * fat, 8, false);
      m.material.uniforms.uColor.value.set(color);
      m.material.uniforms.uPhase.value = this.beatPhase;
      m.material.uniforms.uKick.value = this.kick;
    }
    c.head.position.set(...pts.at(-1));
    c.head.material.color.set(color).lerp(new THREE.Color("#ffffff"), 0.5);
    c.head.scale.setScalar(thin ? 0.5 : 1);
  }

  update(t, section) {
    const { timing } = this.ctx;
    this.now = t;
    const kick = timing.pulse(t, 0.12);
    const bf = timing.beatFloat(t);
    const down = timing.barPulse(t, 4, 0.3);
    this.kick = kick;
    this.beatPhase = bf - Math.floor(bf);
    const [sc, prev] = this.scenario(t);
    const st = sc.fn(t);
    this.sc = sc;
    this.st = st;
    const is3 = st.mode === "xt3" || st.mode === "helix";
    const v = (x) => (typeof x === "function" ? x(t) : x);
    const laneY = (lane) => TRACK - lane * 0.5;

    // Axes per graph type.
    const o = new THREE.Vector3(GX[0], GY[0], 0);
    const ft = st.mode === "ft" || st.mode === "at";
    if (st.mode === "xt" || st.mode === "xt3" || st.mode === "helix") {
      this.setAxis(this.axisV, new THREE.Vector3(GX[0], GY[0], 0), new THREE.Vector3(GX[0], GY[1] + 0.25, 0));
      this.setAxis(this.axisH, new THREE.Vector3(GX[0], GY[0], 0), new THREE.Vector3(GX[1] + 0.2, GY[0], 0));
    } else {
      this.setAxis(this.axisV, o, new THREE.Vector3(GX[0], GY[1] + 0.25, 0));
      this.setAxis(this.axisH, new THREE.Vector3(GX[0], ft ? 1.8 : GY[0], 0), new THREE.Vector3(GX[1] + 0.2, ft ? 1.8 : GY[0], 0));
    }
    this.setAxis(this.axisZ, new THREE.Vector3(GX[0], GY[0], 0), new THREE.Vector3(GX[0], GY[0], is3 ? 2.2 : 0));
    this.axisZ.g.visible = is3;
    this.setAxis(this.trackAxis, new THREE.Vector3(GX[0] - 0.05, TRACK - 0.18, 0), new THREE.Vector3(GX[1] + 0.25, TRACK - 0.18, 0));
    this.trackAxis.g.visible = !st.summary;
    this.ticks.forEach((m, k) => {
      const x = -2 + k * 0.5;
      m.visible = k < 9 && !st.summary;
      m.position.set(x, TRACK - 0.18, 0);
      m.scale.set(1, 1 + kick * 1.6 * (k % 2 ? 0.6 : 1), 1);
    });
    this.floorU.uOpacity.value = is3 ? 1 : 0;

    // Function curves.
    const curves = st.summary ? this.summaryCurves(t) : st.curves;
    this.curves.forEach((c, i) => {
      const cv = curves[i];
      if (!cv) {
        c.core.visible = c.glow.visible = c.head.visible = false;
        return;
      }
      const t0 = cv.from;
      const t1 = cv.until ?? t;
      const pts = [];
      if (t1 > t0) {
        if (cv.step) {
          const n = SAMPLES * 2;
          for (let k = 0; k <= n; k++) pts.push(cv.map(t0 + ((t1 - t0) * k) / n));
        } else for (let k = 0; k <= SAMPLES; k++) pts.push(cv.map(t0 + ((t1 - t0) * k) / SAMPLES));
      }
      this.setCurve(c, pts, cv.color, cv.thin);
      c.head.scale.multiplyScalar(1 + kick * 0.4);
    });

    // Beat dots on the world line: equal steps along a straight line.
    this.dots.forEach((d) => (d.visible = false));
    if (st.beats && st.curves[0]) {
      const cv = st.curves[0];
      const bi = timing.beatIndexAt(t);
      for (let k = 0, n = 0; k < 16; k++) {
        const tb = timing.beatTime(bi - k);
        if (tb < cv.from) break;
        const d = this.dots[n++];
        d.visible = true;
        d.position.set(...cv.map(tb));
        d.material.color.set(C.vel);
        d.scale.setScalar(k === 0 ? 1 + Math.exp(-(t - tb) / 0.15) : 1);
      }
    }
    if (st.fa) {
      const sx = (a) => GX[0] + 0.15 + a * 0.62;
      const sy = (F) => GY[0] + F * 0.52;
      let n = 0;
      for (const p of st.fa.shown) for (const m of st.fa.slopes) {
        const d = this.dots[n++];
        d.visible = true;
        d.position.set(sx(p.F / m), sy(p.F), 0);
        d.material.color.set(m === 1 ? C.A : C.heavy);
        d.scale.setScalar(1.6 + (t - p.t < 0.2 ? (1 - (t - p.t) / 0.2) * 1.5 : 0));
      }
      const lineCurves = st.fa.slopes.map((m, k) => ({ color: k ? C.heavy : C.A, pts: st.fa.shown.length ? [[sx(0), sy(0), 0], [sx(st.fa.shown.length / m), sy(st.fa.shown.length), 0]] : [] }));
      lineCurves.forEach((lc, k) => this.setCurve(this.curves[k], lc.pts, lc.color));
    }

    // Orbs on the track (or in the x–z plane in 3-D), with dashed guides to the curve head.
    const kinds = { A: [C.A, 1], B: [C.B, 1], light: [C.light, 0.8], heavy: [C.heavy, 1.5] };
    this.orbs.forEach((ob, i) => {
      const s = st.orbs[i];
      ob.g.visible = !!s;
      this.guides[i].visible = false;
      if (!s) return;
      const [color, size] = kinds[s.kind];
      const x = v(s.x);
      const z = s.zf ? s.zf(t) : s.z;
      const y = is3 ? TRACK : laneY(s.lane);
      ob.g.position.set(x, y, z);
      ob.core.scale.set(size * (1 + kick * 0.35), size * (1 - kick * 0.2), size * (1 + kick * 0.35));
      ob.core.material.color.set(color).lerp(new THREE.Color("#ffffff"), 0.35);
      ob.glow.material.color.set(color).multiplyScalar(0.6);
      ob.glow.scale.setScalar(size);
      ob.ring.visible = s.kind === "heavy";
      ob.ring.rotation.set(Math.PI / 2 + 0.4, t * 1.2, 0);
      ob.ring.material.color.set(color);
      const cv = st.curves[i];
      if (cv && is3) {
        const head = cv.map(t);
        const g = this.guides[i];
        g.visible = true;
        g.geometry.setFromPoints([new THREE.Vector3(x, y + 0.2, z), new THREE.Vector3(head[0], head[1], head[2])]);
        g.computeLineDistances();
        g.material.color.set(color);
      }
    });

    // After-images behind moving orbs.
    this.ghosts.forEach((g) => (g.visible = false));
    let gi = 0;
    st.orbs.forEach((s) => {
      if (typeof s.x !== "function") return;
      const [color, size] = kinds[s.kind];
      for (let k = 1; k <= 3 && gi < this.ghosts.length; k++) {
        const g = this.ghosts[gi++];
        const tk = t - k * 0.07;
        g.visible = true;
        g.position.set(s.x(tk), is3 ? TRACK : laneY(s.lane), s.zf ? s.zf(tk) : s.z);
        g.scale.setScalar(size * (1 - k * 0.15));
        g.material.color.set(color);
        g.material.opacity = 0.32 * (1 - k / 4);
      }
    });

    // Spectrum bars behind the graph.
    const spec = timing.spectrum(t);
    const tintNow = new THREE.Color(section === "verse2" ? C.accel : section === "verse3" ? C.force : section.startsWith("chorus") ? C.vel : section === "break" ? C.heavy : C.A);
    const bw = (GX[1] - GX[0]) / 32;
    const dm = new THREE.Object3D();
    const bc = new THREE.Color();
    for (let i = 0; i < 32; i++) {
      const v0 = spec[Math.min(spec.length - 1, Math.floor(i * 0.9))] || 0;
      const h = 0.04 + Math.pow(v0, 1.6) * 2.4 * (1 + kick * 0.3);
      dm.position.set(GX[0] + (i + 0.5) * bw, GY[0], -0.45);
      dm.scale.set(bw * 0.62, h, 1);
      dm.updateMatrix();
      this.bars.setMatrixAt(i, dm.matrix);
      bc.copy(tintNow).lerp(new THREE.Color(C.force), i / 40).multiplyScalar(0.5 + v0);
      this.bars.setColorAt(i, bc);
    }
    this.bars.instanceMatrix.needsUpdate = true;
    this.bars.instanceColor.needsUpdate = true;
    this.bars.visible = !st.summary;

    // Dust drifting toward the camera; faster in choruses.
    const dpos = this.dust.geometry.attributes.position;
    const speed = section.startsWith("chorus") || section === "break" ? 2.4 : 1.0;
    this.dustSeed.forEach(([x, y, z], i) => {
      const zz = -14 + ((z * 16 + t * speed) % 16);
      dpos.setXYZ(i, x, y, zz);
    });
    dpos.needsUpdate = true;
    this.dust.material.color.copy(tintNow).lerp(new THREE.Color("#ffffff"), 0.5);
    this.dust.material.size = 0.04 + kick * 0.025;

    // Ring burst behind the graph on each bar's downbeat and half bar.
    const bar = timing.barIndex(t, 4);
    const barT = timing.beatTime(timing.dropBeat + bar * 4);
    this.burstRings.forEach((m, k) => {
      const t0 = k === 0 ? barT : timing.beatTime(timing.dropBeat + bar * 4 + 2);
      const age = t - t0;
      m.visible = age >= 0 && age < 1.2 && !st.summary;
      if (!m.visible) return;
      m.scale.setScalar(0.6 + age * 4.5);
      m.material.opacity = Math.exp(-age / 0.35) * (k === 0 ? 0.55 : 0.3);
      m.material.color.copy(tintNow);
    });

    // Force arrows on the track.
    this.arrows.forEach((a) => (a.g.visible = false));
    st.arrows.forEach((ar, k) => {
      const a = this.arrows[k];
      const s = st.orbs[ar.orb];
      if (!a || !s || ar.len < 0.05) return;
      const size = kinds[s.kind][1];
      const x = v(s.x);
      const y = (is3 ? TRACK : laneY(s.lane)) + (ar.color === C.accel ? 0.32 : 0);
      a.g.visible = true;
      a.g.position.set(x + ar.dir * (0.2 * size + 0.05), y, 0.2);
      a.g.rotation.set(0, 0, ar.dir > 0 ? 0 : Math.PI);
      a.shaft.scale.set(Math.max(0.05, ar.len - 0.26), 1, 1);
      a.head.position.set(ar.len - 0.12, 0, 0);
      a.mat.color.set(ar.color);
    });

    // Sparks: bursts at forces, and rocket exhaust.
    const sp = this.sparks.geometry.attributes.position;
    const scol = this.sparks.geometry.attributes.color;
    const col = new THREE.Color();
    let n = 0;
    for (const [cx, cy, ct] of st.clapPoints || []) {
      const age = t - ct;
      if (age < 0 || age > 0.9) continue;
      col.set(C.vel);
      for (let k = 0; k < 60 && n < 260; k++, n++) {
        const a = k * 2.39996;
        const d = (0.3 + ((k * 0.618) % 1) * 0.7) * (1 - Math.exp(-age * 4));
        sp.setXYZ(n, cx + Math.cos(a) * d, cy + Math.sin(a) * d, 0.1);
        const f = (1 - age / 0.9) * 0.8;
        scol.setXYZ(n, col.r * f, col.g * f, col.b * f);
      }
    }
    for (const b of this.bursts) {
      const age = t - b.t;
      if (age < 0 || age > 1.0) continue;
      const bx = b.x ?? v(st.orbs[0]?.x ?? 0);
      col.set(b.color);
      for (let k = 0; k < 70 && n < 260; k++, n++) {
        const a = k * 2.39996;
        const d = (0.5 + ((k * 0.618) % 1)) * (1 - Math.exp(-age * 3)) * 0.8;
        sp.setXYZ(n, bx + Math.cos(a) * d, TRACK + Math.sin(a) * d, 0.1);
        const f = (1 - age) * 0.7;
        scol.setXYZ(n, col.r * f, col.g * f, col.b * f);
      }
    }
    const lastBeat = timing.beatTime(Math.floor(bf));
    const sAge = t - lastBeat;
    this.curves.forEach((c) => {
      if (!c.head.visible || sAge > 0.5) return;
      col.copy(c.core.material.uniforms.uColor.value);
      const hp = c.head.position;
      for (let k = 0; k < 18 && n < 260; k++, n++) {
        const a = k * 2.39996 + Math.floor(bf) * 0.7;
        const d = (0.15 + ((k * 0.618) % 1) * 0.35) * (1 - Math.exp(-sAge * 6));
        sp.setXYZ(n, hp.x + Math.cos(a) * d, hp.y + Math.sin(a) * d, hp.z + Math.sin(a * 1.7) * d * 0.4);
        const f = (1 - sAge / 0.5) * 0.9;
        scol.setXYZ(n, col.r * f, col.g * f, col.b * f);
      }
    });
    if (st.rocket) {
      const x = v(st.orbs[0].x);
      col.set("#ffb347");
      for (let k = 0; k < 120 && n < 260; k++, n++) {
        const age = ((t * 2 + k * 0.0173) % 1) * 0.8;
        sp.setXYZ(n, x - 0.25 - age * 2.4, TRACK + (((k * 0.618) % 1) - 0.5) * age * 0.5, 0.1);
        const f = (1 - age / 0.8) * 0.8;
        scol.setXYZ(n, col.r * f, col.g * f * 0.9, col.b * f * 0.6);
      }
    }
    for (; n < 260; n++) {
      sp.setXYZ(n, 0, -50, 0);
      scol.setXYZ(n, 0, 0, 0);
    }
    sp.needsUpdate = true;
    scol.needsUpdate = true;

    // Camera: a new angle every bar (two in verses), punching in on the beat;
    // world-line and helix sections swing fully into 3-D.
    const want = (s2) => (s2.mode === "xt3" || s2.mode === "helix" ? 1 : 0);
    const ps = prev.fn(t);
    const k3 = lerp(want(ps), want(st), easeInOut((t - sc.t0) / 0.8));
    const fast = section.startsWith("chorus") || section === "break";
    const shot = fast ? bar : Math.floor(bar / 2);
    const ANG = [[0, 0], [0.3, 0.07], [-0.28, -0.03], [0.14, 0.2], [-0.2, 0.13]];
    const pick = (i) => ANG[((i % ANG.length) + ANG.length) % ANG.length];
    const tShot = timing.beatTime(timing.dropBeat + (fast ? bar : shot * 2) * 4);
    const e = easeInOut((t - tShot) / 0.45);
    const flatYaw = lerp(pick(shot - 1)[0], pick(shot)[0], e) + Math.sin(t * 0.4) * 0.04;
    const flatPitch = lerp(pick(shot - 1)[1], pick(shot)[1], e);
    const yaw3 = 0.75 + Math.sin(t * 0.3) * 0.25 + (section === "break" ? (t - SECTIONS.break) * 0.12 : 0);
    const yaw = lerp(flatYaw, yaw3, k3);
    const pitch = lerp(flatPitch, 0.38, k3);
    const dist = (960 / PX / Math.tan((22.5 * Math.PI) / 180)) * (1 - kick * 0.03 - down * 0.06);
    const target = new THREE.Vector3(0, LOOK_Y + k3 * 0.6, 0);
    this.camera.position.set(target.x + Math.sin(yaw) * Math.cos(pitch) * dist, target.y + Math.sin(pitch) * dist, Math.cos(yaw) * Math.cos(pitch) * dist);
    this.camera.lookAt(target);
    this.camera.rotateZ(Math.sin(bf * Math.PI) * 0.012 + (bar % 2 ? 0.012 : -0.012) * (1 - k3));
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    this.paperU.uScan.value = (bf / 4) % 1;
    this.paperU.uDown.value = down;
    this.paperU.uKick.value = kick;
    this.paperU.uOpacity.value = 1 - k3 * 0.6;
    const tint = section === "verse2" ? C.accel : section === "verse3" ? C.force : section.startsWith("chorus") ? C.vel : section === "break" ? C.heavy : C.A;
    this.skyU.uTime.value = t;
    this.skyU.uKick.value = kick;
    this.skyU.uTint.value.set(tint);

    const ch = this.choruses[section];
    const post = { bloom: [0.72 + kick * 0.3, 0.45, 0.38], ca: 0.15 + kick * 0.55 + down * 0.4, vignette: 0.5, grain: 0.022, zoom: 1 + down * 0.035 + kick * 0.008 };
    post.flash = down * 0.06;
    if (ch) for (const c of ch.claps) if (t >= c && t < c + 0.12) post.glitch = 0.45;
    const startT = SECTIONS[section];
    if (startT !== undefined && t - startT < 0.25) post.flash = Math.max(post.flash, Math.exp(-(t - startT) / 0.08) * 0.35);
    if (Math.abs(t - sc.t0) < 0.1 && sc.t0 > 7) post.flash = Math.max(post.flash || 0, 0.12);
    for (const b of this.bursts) if (t >= b.t && t < b.t + 0.1) post.flash = Math.max(post.flash || 0, 0.12);
    if (ch) for (const s of ch.stomps) if (t >= s && t < s + 0.5) post.shock = [0.5, 0.6, (t - s) * 1.3, Math.exp(-(t - s) / 0.3) * 0.7];
    this.drawHud(t, section, ch);
    return post;
  }

  /** Outro: three mini graphs appear as each law is named. */
  summaryCurves(t) {
    const O = this.O;
    const box = (cx) => ({ x0: cx - 0.6, x1: cx + 0.6, y0: 0.5, y1: 2.3 });
    const out = [];
    const draw = (at, fn, color, from = 0, until = 1) => {
      const u = clamp((t - at) / 0.8, 0, 1);
      if (u <= 0) return;
      out.push({ color, from: from, until: from + (until - from) * u, map: fn });
    };
    const b1 = box(-1.65);
    draw(O.first, (s) => [lerp(b1.x0, b1.x1, s), lerp(b1.y0, b1.y1, s), 0], C.A);
    const b2 = box(0);
    draw(O.second, (s) => [lerp(b2.x0, b2.x1, s), lerp(b2.y0, b2.y1, s * s), 0], C.accel);
    const b3 = box(1.65);
    const mid = (b3.y0 + b3.y1) / 2;
    draw(O.third, (s) => [lerp(b3.x0, b3.x1, s), mid + Math.sin(Math.PI * s) * 0.75, 0], C.B);
    draw(O.third, (s) => [lerp(b3.x0, b3.x1, s), mid - Math.sin(Math.PI * s) * 0.75, 0], C.A);
    return out;
  }

  screen(x, y, z = 0) {
    const p = new THREE.Vector3(x, y, z).project(this.camera);
    return [(p.x * 0.5 + 0.5) * 1080, (-p.y * 0.5 + 0.5) * 1920, p.z < 1];
  }

  neonBanner(text, y, color, alpha = 1, size = 44) {
    if (!text || alpha <= 0.01) return;
    const { hud } = this.ctx;
    const ctx = hud.ctx;
    hud.font(size, 800, FONT_COND);
    const w = Math.min(960, ctx.measureText(text).width + 70);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "rgba(4,6,20,0.7)";
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.shadowColor = color;
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.roundRect(540 - w / 2, y - size * 0.78, w, size * 1.56, 14);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    hud.text(text, 540, y + 2, { size, weight: 800, family: FONT_COND, color: "#ffffff", glow: 12, alpha });
  }

  drawHud(t, section, ch) {
    const { hud } = this.ctx;
    const st = this.st;
    const ctx = hud.ctx;
    const ny = SAFE.top + 40;
    const fadeIn = smooth(this.sc.t0, this.sc.t0 + 0.3, t);
    const color = section === "verse2" ? C.accel : section === "verse3" ? C.force : C.A;
    this.neonBanner(st.note, ny, color, fadeIn);
    if (st.sub) hud.text(st.sub, 540, ny + 66, { size: 32, weight: 700, family: FONT_MONO, color: C.vel, glow: 10, alpha: smooth(this.sc.t0 + 0.2, this.sc.t0 + 0.5, t) });

    // Axis labels and the graph's name.
    if (!st.summary) {
      const names = { xt: ["x  (position)", "t", "x–t GRAPH"], xt3: ["x", "t", "x–t IN 3-D"], helix: ["x", "t", "x–y–t"], vt: ["t", "v", "v–t GRAPH"], fa: ["a", "F", "F–a GRAPH"], ft: ["t", "F", "F–t GRAPH"], at: ["t", "F", "F–t GRAPH"] };
      const [h, vtxt, title] = names[st.mode];
      const [hx, hy] = this.screen(GX[1] + 0.25, st.mode === "ft" || st.mode === "at" ? 1.8 : GY[0], 0);
      const [vx, vy] = this.screen(GX[0], GY[1] + 0.42, 0);
      if (st.mode !== "xt3" && st.mode !== "helix") hud.text(h, Math.min(hx, 990), hy + 34, { size: 30, weight: 700, family: FONT_MONO, color: C.axis, align: "right" });
      hud.text(vtxt, vx + 4, vy - 6, { size: 34, weight: 800, family: FONT_MONO, color: C.axis });
      const [tx0, ty0] = this.screen(GX[0] + 0.2, GY[1] + 0.35, 0);
      hud.text(title, tx0 + 26, ty0, { size: 38, weight: 800, family: FONT_COND, color: "#ffffff", align: "left", glow: 12 });
      if (st.mode !== "xt3" && st.mode !== "helix") {
        for (let k = 0; k < 9; k++) {
          const x = -2 + k * 0.5;
          if (k % 2) continue;
          const [px, py] = this.screen(x, TRACK - 0.18, 0);
          hud.text(String(x), px, py + 30, { size: 24, weight: 700, family: FONT_MONO, color: "#8f9ccc" });
        }
      }
      // Dashed guide from each orb up to its curve head (x–t world lines).
      if (st.mode === "xt") {
        st.orbs.forEach((o, i) => {
          const cv = st.curves[i];
          if (!cv) return;
          const x = typeof o.x === "function" ? o.x(t) : o.x;
          const a = this.screen(x, TRACK - o.lane * 0.5 + 0.2, 0);
          const b = this.screen(...cv.map(t));
          ctx.save();
          ctx.strokeStyle = cv.color;
          ctx.globalAlpha = 0.7;
          ctx.lineWidth = 3;
          ctx.setLineDash([10, 9]);
          ctx.beginPath();
          ctx.moveTo(a[0], a[1]);
          ctx.lineTo(b[0], b[1]);
          ctx.stroke();
          ctx.restore();
        });
      }
      // Curve labels near their heads.
      const curves = st.curves;
      curves.forEach((cv) => {
        if (!cv.label) return;
        const p = cv.map(Math.max(cv.from + 0.05, t));
        const [x, y, ok] = this.screen(...p);
        if (!ok || y < 420) return;
        hud.text(cv.label, clamp(x + 18, 120, 980), y - 24, { size: 32, weight: 800, family: FONT_COND, color: cv.color, glow: 12, align: x > 800 ? "right" : "left" });
      });
      st.orbs.forEach((o) => {
        if (!o.label) return;
        const x = typeof o.x === "function" ? o.x(t) : o.x;
        const [sx, sy] = this.screen(x - 0.38, TRACK - o.lane * 0.5 + 0.16, o.z);
        hud.text(o.label, clamp(sx, 110, 970), sy, { size: 30, weight: 800, family: FONT_COND, color: "#ffffff", glow: 10, align: "right" });
      });
      st.arrows.forEach((ar) => {
        const s = st.orbs[ar.orb];
        if (!ar.label || !s || ar.len < 0.1) return;
        const x = (typeof s.x === "function" ? s.x(t) : s.x) + ar.dir * (ar.len + 0.4);
        const [sx, sy] = this.screen(x, TRACK - s.lane * 0.5 + (ar.color === C.accel ? 0.32 : 0) + 0.28, 0.2);
        hud.text(ar.label, clamp(sx, 110, 970), sy, { size: 32, weight: 800, family: FONT_COND, color: ar.color, glow: 12 });
      });
    }

    if (st.equation) {
      const { timing } = this.ctx;
      const w = (ci, word) => timing.wordTime(ci, word) ?? timing.cues[ci].start;
      const hits = { F: [w(17, "net"), w(18, "f")], m: [w(17, "mass"), w(18, "m")], a: [w(17, "acceleration"), w(18, "a")] };
      const on = (k) => hits[k].reduce((acc, x) => Math.max(acc, t >= x ? Math.exp(-(t - x) / 0.6) : 0), 0);
      const y = ny + 10;
      const parts = [["F", C.force, on("F"), 380], ["=", "#ffffff", 0, 455], ["m", "#cfe0ff", on("m"), 530], ["·", "#ffffff", 0, 600], ["a", C.accel, on("a"), 665]];
      for (const [txt, c, k, x] of parts) hud.text(txt, x, y - k * 10, { size: Math.round(104 + k * 40), weight: 800, family: FONT_COND, color: c, glow: 16 + k * 26 });
      const [lx, ly] = this.screen(GX[0] + 0.15 + 3.1 * 0.62, GY[0] + 6 * 0.52 * 0.5, 0);
      hud.text("slope = 1/m", lx, ly, { size: 30, weight: 700, family: FONT_MONO, color: C.vel, glow: 8, alpha: st.fa.shown.length > 2 ? 1 : 0 });
      const p1 = this.screen(GX[0] + 0.15 + 3.2 * 0.62, GY[0] + 3.2 * 0.52, 0);
      const p2 = this.screen(GX[0] + 0.15 + 1.6 * 0.62, GY[0] + 3.2 * 0.52, 0);
      if (st.fa.shown.length > 3) {
        hud.text("m", p1[0] + 30, p1[1] + 10, { size: 34, weight: 800, family: FONT_COND, color: C.A, glow: 10 });
        hud.text("2m", p2[0] - 30, p2[1] - 20, { size: 34, weight: 800, family: FONT_COND, color: C.heavy, glow: 10 });
      }
    }

    if (st.pair) {
      const P = this.V3;
      if (t >= P.ab && t < P.equal) this.neonBanner("THIRD LAW · A PUSHES B, B PUSHES A", ny, C.force);
      if (t >= P.equal && t < P.opposite) this.neonBanner("EQUAL SIZE · SAME HEIGHT", ny, C.force);
      if (t >= P.opposite && t < P.share) this.neonBanner("OPPOSITE DIRECTION · MIRROR IMAGE", ny, C.force);
      if (t >= P.share && t < P.apart) this.neonBanner("ONE FORCE ON A · ONE ON B", ny, C.force);
      if (t >= P.apart) this.neonBanner("PUSH APART · EQUAL AND OPPOSITE", ny, C.force);
      if (t >= P.equal && t < P.share) {
        const [x0, y0] = this.screen(GX[1] - 0.25, 1.8 + 1.25, 0);
        const [, y1] = this.screen(GX[1] - 0.25, 1.8 - 1.25, 0);
        const [, ym] = this.screen(GX[1] - 0.25, 1.8, 0);
        ctx.save();
        ctx.strokeStyle = C.vel;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x0, ym - 6);
        ctx.moveTo(x0, ym + 6);
        ctx.lineTo(x0, y1);
        ctx.stroke();
        ctx.restore();
        hud.text("|F|", x0 - 38, (y0 + ym) / 2, { size: 30, weight: 800, family: FONT_MONO, color: C.vel });
        hud.text("|F|", x0 - 38, (ym + y1) / 2, { size: 30, weight: 800, family: FONT_MONO, color: C.vel });
      }
    }

    if (ch) {
      const big = (num, t0, t1, sub, c) => hud.slam(num, t, t0, t1 - 0.1, { y: ny + 90, size: 200, color: c, sub, angle: -0.04 });
      big("1", ch.one, ch.two, "STRAIGHT LINE", C.A);
      big("2", ch.two, ch.three, "CURVE = ACCELERATION", C.accel);
      big("3", ch.three, ch.four, "LINES SPLIT IN PAIRS", C.force);
      ch.declares.forEach((d, i) => hud.slam("NEWTON'S THREE!", t, d, (ch.declares[i + 1] ?? ch.end) - 0.15, { y: ny + 60, size: 112, color: C.vel, angle: -0.04 }));
      ch.stomps.forEach((s) => hud.stamp("STOMP!", t, s, { x: 320, y: 1140, size: 88, color: C.A, angle: -0.1, life: 0.45 }));
      ch.claps.forEach((c) => hud.stamp("CLAP!", t, c, { x: 760, y: 1140, size: 88, color: C.B, angle: 0.1, life: 0.45 }));
    }

    if (st.summary) {
      const O = this.O;
      const items = [["1 · x–t", "straight line", O.first, C.A, -1.65], ["2 · v–t", "slope = F/m", O.second, C.accel, 0], ["3 · F–t", "mirror pair", O.third, C.B, 1.65]];
      for (const [title, sub, at, c, cx] of items) {
        const a = smooth(at, at + 0.3, t);
        const [x, y] = this.screen(cx, 2.6, 0);
        const [, yb] = this.screen(cx, 0.25, 0);
        hud.text(title, x, y, { size: 38, weight: 800, family: FONT_COND, color: c, glow: 14, alpha: a });
        hud.text(sub, x, yb, { size: 26, weight: 700, family: FONT_MONO, color: "#cfe0ff", alpha: a });
        const [bx0, by0] = this.screen(cx - 0.7, 2.4, 0);
        const [bx1, by1] = this.screen(cx + 0.7, 0.4, 0);
        ctx.save();
        ctx.globalAlpha = a;
        ctx.strokeStyle = c;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(bx0, by0);
        ctx.lineTo(bx0, by1);
        ctx.lineTo(bx1, by1);
        ctx.stroke();
        ctx.restore();
      }
      hud.slam("NEWTON'S THREE", t, O.last, SECTIONS.end - 0.2, { y: 1110, size: 124, color: C.vel, angle: -0.03 });
    }
    if (section === "break") this.neonBanner("CIRCLE IN SPACE + TIME = HELIX", ny, C.heavy, smooth(SECTIONS.break, SECTIONS.break + 0.4, t));
  }
}
