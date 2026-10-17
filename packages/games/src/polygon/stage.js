import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { clamp, easeOutBack, easeOutCubic, hash } from "@gizclaw/mvg-core/timing.js";
import { GamePostShader, glowTexture } from "../kit.js";
import { PALETTES, SHAPES, corners, shapeOf } from "./song.js";
import { ShotDirector, polygonPosition } from "./camera.js";
import { createVenue } from "./venue.js";

const R = 1.45; // circumradius of a performer
const DECK = { radius: 8.7, top: -0.75 };
const FLOOR = -1.35;
const SPARKS = 1400;
const WAVES = 8;
const BUNTING = { radius: 8.2, y: 6.7, sag: 0.6, flags: 50, points: 121 };
const CONFETTI = 500;

const luminance = (c) => c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722;
/** A colour bright enough to bloom however dark its hue: red and blue would otherwise read dimmer than yellow. */
const glowing = (hex, floor = 1.5) => {
  const c = new THREE.Color(hex);
  return c.multiplyScalar(Math.max(floor, 0.95 / Math.max(0.08, luminance(c))));
};
/** A ring in the shape of an n-gon, flat edge down, for cues and shock waves. */
const polygonRing = (n, inner, outer) => new THREE.RingGeometry(inner, outer, n, 1, -Math.PI / 2 + Math.PI / n);

function numberLabels() {
  return Array.from({ length: 12 }, (_, i) => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d");
    g.font = `800 84px "Avenir Next Condensed", "Arial Narrow", sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.lineWidth = 12;
    g.strokeStyle = "rgba(16,4,28,0.9)";
    g.strokeText(String(i + 1), 64, 68);
    g.fillStyle = "#ffffff";
    g.fillText(String(i + 1), 64, 68);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  });
}

/**
 * One polygon on its mark, facing outward. Its outline waits faint and
 * dashed; each hit draws the next edge from corner to corner, lighting the
 * corner it reaches and that corner's number.
 */
class Performer {
  constructor(shape, shared) {
    this.shape = shape;
    this.n = shape.sides;
    this.place = polygonPosition(this.n);
    this.group = new THREE.Group();
    this.group.position.set(this.place.x, this.place.y, this.place.z);
    this.group.rotation.y = this.place.angle;
    this.color = new THREE.Color(shape.color);
    this.bright = glowing(shape.color);
    this.points = corners(this.n, R).map(([x, y]) => new THREE.Vector3(x, y, 0));
    this.fill = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(this.points.map((p) => new THREE.Vector2(p.x, p.y)))), new THREE.MeshBasicMaterial({ color: shape.color, transparent: true, opacity: 0.04, depthWrite: false, side: THREE.DoubleSide }));
    this.ghost = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(this.points), new THREE.LineDashedMaterial({ color: shape.color, dashSize: 0.16, gapSize: 0.1, transparent: true, opacity: 0.5 }));
    this.ghost.computeLineDistances();
    this.coreMat = new THREE.MeshBasicMaterial({ color: this.bright });
    this.haloMat = new THREE.MeshBasicMaterial({ color: this.bright, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false });
    this.nextMat = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    this.group.add(this.fill, this.ghost);
    const up = new THREE.Vector3(0, 1, 0);
    this.edges = this.points.map((a, k) => {
      const b = this.points[(k + 1) % this.n];
      const d = b.clone().sub(a);
      const q = new THREE.Quaternion().setFromUnitVectors(up, d.clone().normalize());
      const core = new THREE.Mesh(shared.core, this.coreMat);
      const halo = new THREE.Mesh(shared.halo, this.haloMat);
      for (const m of [core, halo]) {
        m.position.copy(a);
        m.quaternion.copy(q);
        m.visible = false;
        this.group.add(m);
      }
      return { a, b, q, len: d.length(), core, halo };
    });
    this.next = new THREE.Mesh(shared.halo, this.nextMat);
    this.group.add(this.next);
    this.dots = this.points.map((p, k) => {
      const dot = new THREE.Mesh(shared.dot, shared.dim);
      dot.position.copy(p);
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: shared.labels[k], transparent: true, depthWrite: false, opacity: 0 }));
      label.position.copy(p).multiplyScalar(1.2);
      label.scale.setScalar(0.34);
      this.group.add(dot, label);
      return { dot, label };
    });
    this.drawnAt = new Float32Array(this.n).fill(-100);
    this.count = 0;
    this.completeAt = -100;
    this.missAt = -100;
    this.hitAt = -100;
  }

  draw(now) {
    if (this.count >= this.n) return;
    this.drawnAt[this.count++] = now;
    this.hitAt = now;
    if (this.count === this.n) this.completeAt = now;
  }

  clear() {
    this.drawnAt.fill(-100);
    this.count = 0;
    this.completeAt = -100;
  }

  /** Where the tip of edge k sits, in world space: the corner it reaches. */
  tip(k, out) {
    return out.copy(this.edges[k].b).applyMatrix4(this.group.matrixWorld);
  }

  update(now, { focus, pulse, active, beat, shared, motion }) {
    const done = this.count === this.n;
    const flash = Math.exp(-Math.max(0, now - this.hitAt) / 0.16) * (now >= this.hitAt ? 1 : 0);
    const bloom = Math.exp(-Math.max(0, now - this.completeAt) / 0.5) * (now >= this.completeAt ? 1 : 0);
    const miss = Math.exp(-Math.max(0, now - this.missAt) / 0.25) * (now >= this.missAt ? 1 : 0);
    const light = 0.3 + 0.7 * focus;
    this.coreMat.color.copy(this.bright).multiplyScalar(light * (1 + flash * 0.5 + bloom * 0.8));
    this.haloMat.opacity = (0.12 + flash * 0.25 + bloom * 0.4 + pulse * 0.05) * light;
    this.ghost.material.opacity = (active ? 0.55 + pulse * 0.2 : 0.28) * (done ? 0.3 : 1);
    this.ghost.material.color.copy(this.color).lerp(shared.red, miss);
    this.fill.material.opacity = (done ? 0.14 + bloom * 0.35 : 0.035 + miss * 0.1) * light;
    this.fill.material.color.copy(this.color).lerp(shared.red, miss);
    this.edges.forEach((e, k) => {
      const grow = k < this.count ? easeOutCubic(clamp((now - this.drawnAt[k]) / 0.14, 0, 1)) : 0;
      e.core.visible = e.halo.visible = grow > 0.001;
      if (!e.core.visible) return;
      e.core.scale.set(1, e.len * grow, 1);
      e.halo.scale.set(1 + flash * 0.6, e.len * grow, 1 + flash * 0.6);
    });
    // The edge the next hit will draw breathes on the beat.
    const next = this.edges[this.count];
    this.next.visible = active && !!next;
    if (next) {
      this.next.position.copy(next.a);
      this.next.quaternion.copy(next.q);
      this.next.scale.set(1.3, next.len, 1.3);
      this.nextMat.opacity = (0.12 + 0.3 * Math.exp(-((beat % 1) * 4))) * motion + 0.08;
      this.nextMat.color.copy(this.bright);
    }
    this.dots.forEach(({ dot, label }, k) => {
      const lit = done || (this.count > 0 && (k === 0 || k <= this.count));
      const litAt = k === 0 ? this.drawnAt[0] : this.drawnAt[Math.min(k - 1, this.n - 1)];
      const pop = lit ? easeOutBack(clamp((now - litAt) / 0.22, 0, 1)) : 0;
      dot.material = lit ? shared.lit : shared.dim;
      dot.scale.setScalar(lit ? 0.7 + pop * 0.5 + flash * 0.2 : 0.55);
      label.material.opacity = lit && focus > 0.6 ? (focus - 0.6) / 0.4 : 0;
    });
    // Misses shudder; a completed shape takes a bow.
    const shake = miss * Math.sin(now * 70) * 0.06 * motion;
    this.group.position.set(this.place.x + Math.cos(this.place.angle) * shake, this.place.y + flash * 0.12 + bloom * 0.25, this.place.z - Math.sin(this.place.angle) * shake);
    this.group.scale.setScalar(1 + flash * 0.04 + bloom * 0.14);
  }
}

/** The 3D party: the ring of performers on the video's stage inside an arena. */
export function createStage(host) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2("#0c0418", 0.028);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.65, 0.5, 0.72);
  const post = new ShaderPass(GamePostShader);
  [new RenderPass(scene, camera), bloom, post, new OutputPass()].forEach((p) => composer.addPass(p));
  let view = { w: 1, h: 1 };
  const resize = () => {
    view = { w: Math.max(1, host.clientWidth), h: Math.max(1, host.clientHeight) };
    renderer.setSize(view.w, view.h, false);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(view.w, view.h);
    camera.aspect = view.w / view.h;
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();

  const primary = new THREE.Color(PALETTES.verse[0]);
  const secondary = new THREE.Color(PALETTES.verse[1]);
  const accent = new THREE.Color();
  const tint = new THREE.Color();

  // Sky: a dark dome, a glow behind the stage and a scatter of stars.
  const skyU = { uTime: { value: 0 }, uPrimary: { value: primary }, uSecondary: { value: secondary }, uKick: { value: 0 } };
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    depthTest: false, depthWrite: false, uniforms: skyU,
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, .999, 1.); }",
    fragmentShader: `
      varying vec2 vUv; uniform float uTime, uKick; uniform vec3 uPrimary, uSecondary;
      float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main() {
        vec2 p = vUv - vec2(.5, .45);
        vec3 c = mix(vec3(.02, .006, .04), vec3(.07, .02, .1), smoothstep(-.4, .5, p.y));
        c += mix(uPrimary, uSecondary, vUv.x) * exp(-length(p * vec2(.7, 1.4)) * 4.) * (.08 + uKick * .05);
        vec2 cell = floor(vUv * vec2(160., 90.)); vec2 q = fract(vUv * vec2(160., 90.)) - .5;
        c += vec3(.7, .8, 1.) * step(.988, h(cell)) * exp(-dot(q, q) * 60.) * (.25 + .15 * sin(uTime + h(cell) * 30.)) * smoothstep(.45, .7, vUv.y);
        gl_FragColor = vec4(c, 1.);
      }`,
  }));
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  scene.add(sky);

  // The arena floor: dark checks, a pool of light round the stage, and a wave out from each completed shape.
  const floorU = { uTime: { value: 0 }, uKick: { value: 0 }, uWaveAt: { value: -100 }, uWave: { value: new THREE.Vector2() }, uWaveColor: { value: new THREE.Color() }, uPrimary: { value: primary } };
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), new THREE.ShaderMaterial({
    uniforms: floorU,
    vertexShader: "varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }",
    fragmentShader: `
      varying vec3 vW; uniform float uTime, uKick, uWaveAt; uniform vec2 uWave; uniform vec3 uWaveColor, uPrimary;
      void main() {
        vec2 p = vW.xz; float r = length(p);
        vec2 g = floor(p * .7);
        float check = mod(g.x + g.y, 2.);
        vec3 c = mix(vec3(.05, .015, .08), vec3(.085, .03, .12), check);
        c += uPrimary * exp(-max(0., r - 9.) * .25) * (.05 + uKick * .03);
        float age = uTime - uWaveAt;
        float d = length(p - uWave) - age * 11.;
        c += uWaveColor * exp(-d * d * 1.6) * exp(-age * 1.8) * step(0., age) * .5;
        c = mix(vec3(.02, .006, .04), c, exp(-r * .02));
        gl_FragColor = vec4(c, 1.);
      }`,
  }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = FLOOR;
  scene.add(floor);

  // The video's raised circular stage with its pink and gold trim, and a mirror ball over it.
  scene.add(new THREE.HemisphereLight("#d8c8ff", "#1a0a2a", 1.8));
  const key = new THREE.DirectionalLight("#ffd8f4", 2.2);
  key.position.set(-6, 12, 8);
  scene.add(key);
  const side = new THREE.MeshStandardMaterial({ color: "#2c1040", roughness: 0.35, metalness: 0.5 });
  const top = new THREE.MeshStandardMaterial({ color: "#1d0a2c", roughness: 0.65, metalness: 0.15 });
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(DECK.radius, DECK.radius + 0.3, DECK.top - FLOOR, 128), side);
  plinth.position.y = (DECK.top + FLOOR) / 2;
  const deck = new THREE.Mesh(new THREE.CircleGeometry(DECK.radius, 128), top);
  deck.rotation.x = -Math.PI / 2;
  deck.position.y = DECK.top + 0.001;
  scene.add(plinth, deck);
  const trims = [[DECK.radius, DECK.top + 0.01, "#ff489f", 0.06], [DECK.radius - 0.3, DECK.top + 0.01, "#ffd23f", 0.035], [4.1, DECK.top + 0.01, "#2fe0ff", 0.03], [DECK.radius + 0.45, FLOOR + 0.02, "#ff489f", 0.04]].map(([r, y, color, w]) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, w, 8, 192), new THREE.MeshBasicMaterial({ color: glowing(color, 1.3) }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = y;
    scene.add(ring);
    return { ring, base: glowing(color, 1.3) };
  });
  const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 1), new THREE.MeshStandardMaterial({ color: "#c8b6e8", metalness: 0.9, roughness: 0.15, flatShading: true }));
  ball.position.set(0, 5.6, 0);
  const cable = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 7.25, 0), new THREE.Vector3(0, 6.1, 0)]), new THREE.LineBasicMaterial({ color: "#b8a3d8" }));
  scene.add(ball, cable);

  const glow = glowTexture();
  const venue = createVenue(scene);

  // The performers.
  const shared = {
    core: new THREE.CylinderGeometry(0.05, 0.05, 1, 10).translate(0, 0.5, 0),
    halo: new THREE.CylinderGeometry(0.15, 0.15, 1, 10, 1, true).translate(0, 0.5, 0),
    dot: new THREE.SphereGeometry(0.085, 16, 12),
    lit: new THREE.MeshBasicMaterial({ color: new THREE.Color("#ffffff").multiplyScalar(1.8) }),
    dim: new THREE.MeshBasicMaterial({ color: "#6d5a88" }),
    labels: numberLabels(),
    red: new THREE.Color("#ff2050"),
  };
  const performers = SHAPES.map((shape) => new Performer(shape, shared));
  const pools = performers.map((p) => {
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 5.2), new THREE.MeshBasicMaterial({ map: glow, color: p.shape.color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(p.place.x, DECK.top + 0.02, p.place.z);
    scene.add(p.group, pool);
    return pool;
  });
  const focus = performers.map(() => 0.3);
  const ofSides = (sides) => performers[sides - 3];

  // The cue: the active shape's own outline closing in from outside; it meets the shape on the note.
  const cueGeometry = new Map(SHAPES.map((s) => [s.sides, polygonRing(s.sides, R * 0.985, R * 1.05)]));
  const cue = new THREE.Mesh(cueGeometry.get(3), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  const cueGlow = new THREE.Mesh(cueGeometry.get(3), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  cue.renderOrder = cueGlow.renderOrder = 6;

  // Shock waves in the shape of the polygon just hit.
  const waves = Array.from({ length: WAVES }, () => {
    const mesh = new THREE.Mesh(cueGeometry.get(3), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    mesh.visible = false;
    mesh.renderOrder = 7;
    return { mesh, at: -100, big: false };
  });
  let waveHead = 0;
  function wave(p, now, big) {
    const w = waves[waveHead];
    waveHead = (waveHead + 1) % WAVES;
    p.group.add(w.mesh);
    w.mesh.geometry = cueGeometry.get(p.n);
    w.mesh.material.color.copy(p.bright);
    Object.assign(w, { at: now, big });
  }

  // Sparks.
  const sparkPos = new Float32Array(SPARKS * 3), sparkVel = new Float32Array(SPARKS * 3), sparkCol = new Float32Array(SPARKS * 3), sparkLife = new Float32Array(SPARKS);
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute("position", new THREE.BufferAttribute(sparkPos, 3));
  sparkGeo.setAttribute("color", new THREE.BufferAttribute(sparkCol, 3));
  const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ size: 0.16, map: glow, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  sparks.frustumCulled = false;
  sparks.renderOrder = 8;
  scene.add(sparks);
  sparkPos.fill(1e5);
  let sparkHead = 0;
  function burst(at, count, color, speed, spread = 1) {
    for (let k = 0; k < count; k++) {
      const i = sparkHead;
      sparkHead = (sparkHead + 1) % SPARKS;
      const a = Math.random() * Math.PI * 2, b = (Math.random() - 0.5) * Math.PI * spread;
      const s = speed * (0.35 + Math.random() * 0.8);
      sparkPos.set([at.x, at.y, at.z], i * 3);
      sparkVel.set([Math.cos(a) * Math.cos(b) * s, Math.sin(b) * s + speed * 0.3, Math.sin(a) * Math.cos(b) * s], i * 3);
      tint.copy(color).multiplyScalar(0.7 + Math.random() * 0.6);
      sparkCol.set([tint.r, tint.g, tint.b], i * 3);
      sparkLife[i] = 0.45 + Math.random() * 0.7;
    }
  }

  // Bunting loops round over the ring, sagging between ten anchors.
  const buntingY = (a, t) => BUNTING.y - BUNTING.sag * Math.abs(Math.sin(5 * a)) + Math.sin(t * 1.1) * 0.035;
  const flagGeo = new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute([-0.24, 0, 0, 0.24, 0, 0, 0, -0.3, 0], 3));
  const flags = Array.from({ length: BUNTING.flags }, (_, i) => {
    const flag = new THREE.Mesh(flagGeo, new THREE.MeshBasicMaterial({ color: SHAPES[i % 10].color, side: THREE.DoubleSide }));
    scene.add(flag);
    return flag;
  });
  const stringPos = new Float32Array(BUNTING.points * 3);
  const stringGeo = new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(stringPos, 3));
  scene.add(new THREE.Line(stringGeo, new THREE.LineBasicMaterial({ color: "#e8c4dc", transparent: true, opacity: 0.55 })));

  // Confetti drifting down over the stage.
  const confettiPos = new Float32Array(CONFETTI * 3), confettiCol = new Float32Array(CONFETTI * 3);
  for (let i = 0; i < CONFETTI; i++) tint.set(SHAPES[i % 10].color).toArray(confettiCol, i * 3);
  const confettiGeo = new THREE.BufferGeometry();
  confettiGeo.setAttribute("position", new THREE.BufferAttribute(confettiPos, 3));
  confettiGeo.setAttribute("color", new THREE.BufferAttribute(confettiCol, 3));
  const confetti = new THREE.Points(confettiGeo, new THREE.PointsMaterial({ size: 0.06, vertexColors: true, transparent: true, opacity: 0.7, depthWrite: false }));
  confetti.frustumCulled = false;
  scene.add(confetti);

  const director = new ShotDirector();
  const proj = new THREE.Vector3(), forward = new THREE.Vector3(), tip = new THREE.Vector3(), subject = new THREE.Vector3(), lookAt = new THREE.Vector3();
  let active = null, lastPhase = null, lastBar = null, chorusLevel = 0, outroLevel = 0;
  let enteredAt = performance.now() / 1000, lastNow = enteredAt, ending = null, completeFlash = -100;
  const endPose = { position: new THREE.Vector3(), target: new THREE.Vector3(), fov: 40 };
  const toScreen = (v) => {
    proj.copy(v).project(camera);
    return { x: (proj.x * 0.5 + 0.5) * view.w, y: (-proj.y * 0.5 + 0.5) * view.h, visible: proj.z < 1 };
  };

  return {
    /** Edge drawn on the active performer at wall time `now`; `grade` is "perfect" or "good". */
    hit(sides, now, grade) {
      const p = ofSides(sides);
      const k = p.count;
      p.draw(now);
      p.group.updateMatrixWorld();
      p.tip(k, tip);
      burst(tip, grade === "perfect" ? 46 : 26, p.bright, grade === "perfect" ? 3.4 : 2.4);
      wave(p, now, false);
      director.hit(now, grade === "perfect" ? 1 : 0.65);
    },
    /** The active performer just closed its shape. */
    complete(sides, now) {
      const p = ofSides(sides);
      p.group.updateMatrixWorld();
      burst(subject.set(p.place.x, p.place.y, p.place.z), 220, p.bright, 6, 1.6);
      burst(subject, 80, shared.lit.color, 4, 1.6);
      wave(p, now + 0.03, true);
      floorU.uWaveAt.value = now;
      floorU.uWave.value.set(p.place.x, p.place.z);
      floorU.uWaveColor.value.copy(p.bright);
      completeFlash = now;
      director.hit(now, 2.2);
    },
    miss(sides, now) {
      ofSides(sides).missAt = now;
    },
    /** Start `sides` over for a new lap. */
    clear(sides) {
      ofSides(sides).clear();
    },
    reset() {
      performers.forEach((p) => p.clear());
      director.sides = null;
      lastPhase = lastBar = null;
      ending = null;
      enteredAt = performance.now() / 1000;
      sparkLife.fill(0);
      sparkPos.fill(1e5);
      waves.forEach((w) => (w.at = -100));
    },
    /** Pull back over the whole arena for the results. */
    finish(now) {
      ending = now;
    },
    /**
     * Draw a frame at song time t (wall time `now`): `sides` is the active
     * performer, `ahead` seconds until its next note (Infinity for none),
     * `lead` how long the cue takes to close.
     */
    draw(t, now, { sides, beat, pulse, phase, ahead = Infinity, lead = 1.2, demo = false, reducedMotion = false }) {
      const dt = clamp(now - lastNow, 0, 0.05);
      lastNow = now;
      const motion = reducedMotion ? 0 : 1;
      const [pa, pb] = PALETTES[phase];
      primary.lerp(tint.set(pa), 1 - Math.exp(-dt * 2));
      secondary.lerp(tint.set(pb), 1 - Math.exp(-dt * 2));
      const chorus = phase === "chorus";
      chorusLevel += ((chorus ? 1 : 0) - chorusLevel) * (1 - Math.exp(-dt * 6));
      outroLevel += ((phase === "outro" ? 1 : 0) - outroLevel) * (1 - Math.exp(-dt * 3));

      // The director: swing to a new subject, open choruses wide, cut on every chorus bar.
      if (sides !== active) {
        director.aim(sides, now, { snap: active === null, phase, calm: demo || camera.aspect < 1 });
        active = sides;
        cue.geometry = cueGlow.geometry = cueGeometry.get(sides);
        ofSides(sides).group.add(cue, cueGlow);
      }
      if (phase !== lastPhase) {
        if (lastPhase !== null && (chorus || phase === "outro") && motion && !demo) director.openWide(now);
        lastPhase = phase;
      }
      const bar = Math.floor(beat / 4);
      if (bar !== lastBar) {
        if (lastBar !== null && chorus && !demo && now - director.shotAt > 1.2 && now > director.wideUntil && now - director.moveAt > director.duration) director.cut(now, phase);
        lastBar = bar;
      }
      const pose = director.sample(now, { aspect: camera.aspect, beat, pulse, reducedMotion, demo });
      const arrive = motion * Math.max(0, 1 - (now - enteredAt) / 1.6) ** 3;
      camera.position.copy(pose.position);
      camera.position.y += arrive * 4;
      lookAt.copy(pose.target);
      let fov = pose.fov;
      if (ending !== null) {
        const u = motion ? clamp((now - ending) / 2.8, 0, 1) : 1;
        const e = u * u * (3 - 2 * u);
        const p = ofSides(sides).place;
        const back = camera.aspect < 1 ? 44 : 27;
        endPose.position.set(Math.sin(p.angle) * back, camera.aspect < 1 ? 17 : 11, Math.cos(p.angle) * back);
        endPose.target.set(0, 0.6, 0);
        camera.position.lerp(endPose.position, e);
        lookAt.lerp(endPose.target, e);
        fov += (44 - fov) * e;
      }
      camera.lookAt(lookAt);
      camera.rotateZ(ending === null ? pose.roll : 0);
      if (Math.abs(camera.fov - fov) > 0.01) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
      }

      // Performers: the subject in full light, the rest dimmer; everyone dances in the choruses.
      const dance = Math.max(chorusLevel, outroLevel) * motion;
      performers.forEach((p, i) => {
        const isActive = p.n === sides;
        focus[i] += ((isActive || ending !== null ? 1 : demo ? 0.75 : p.count === p.n ? 0.6 : 0.32) - focus[i]) * (1 - Math.exp(-dt * 7));
        p.update(now, { focus: focus[i], pulse, active: isActive, beat, shared, motion });
        if (!isActive) {
          p.group.position.y += Math.abs(Math.sin(Math.PI * beat + i * 0.5)) * 0.16 * dance;
          p.group.rotation.z = Math.sin(Math.PI * beat * 0.5 + i) * 0.06 * dance;
        } else p.group.rotation.z = 0;
        pools[i].material.opacity = (0.08 + focus[i] * 0.35 + pulse * 0.08 * focus[i]) * (isActive ? 1.4 : 1);
      });

      // The cue closes from 2.6 times the shape's size onto it, and turns gold inside the hit window.
      const close = clamp(ahead / lead, 0, 1);
      const due = Math.abs(ahead) <= 0.22;
      const showCue = Number.isFinite(ahead) && ahead < lead && ahead > -0.25 && ending === null;
      cue.visible = cueGlow.visible = showCue;
      if (showCue) {
        const scale = 1 + close * 1.6;
        cue.scale.setScalar(scale);
        cueGlow.scale.setScalar(scale * 1.02);
        cue.material.color.set(due ? "#ffd23f" : "#ffffff").multiplyScalar(due ? 1.6 : 1.1);
        cue.material.opacity = clamp((1 - close) * 3, 0, 1) * (ahead < 0 ? clamp(1 + ahead / 0.25, 0, 1) : 1);
        cueGlow.material.color.copy(cue.material.color);
        cueGlow.material.opacity = cue.material.opacity * 0.35;
      }
      for (const w of waves) {
        const age = now - w.at;
        w.mesh.visible = age >= 0 && age < (w.big ? 0.9 : 0.5);
        if (!w.mesh.visible) continue;
        const u = age / (w.big ? 0.9 : 0.5);
        w.mesh.scale.setScalar(1 + easeOutCubic(u) * (w.big ? 3.2 : 0.9));
        w.mesh.material.opacity = (1 - u) ** 1.5 * (w.big ? 1 : 0.7);
      }

      // Sparks fall and fade.
      for (let i = 0; i < SPARKS; i++) {
        if (sparkLife[i] <= 0) continue;
        sparkLife[i] -= dt;
        sparkVel[i * 3 + 1] -= 3.2 * dt;
        for (let a = 0; a < 3; a++) {
          sparkVel[i * 3 + a] *= 1 - dt * 0.6;
          sparkPos[i * 3 + a] += sparkVel[i * 3 + a] * dt;
        }
        const fade = clamp(sparkLife[i] / 0.4, 0, 1);
        for (let a = 0; a < 3; a++) sparkCol[i * 3 + a] *= 0.985 + 0.015 * fade;
        if (sparkLife[i] <= 0) sparkPos[i * 3 + 1] = 1e5;
      }
      sparkGeo.attributes.position.needsUpdate = true;
      sparkGeo.attributes.color.needsUpdate = true;

      for (let i = 0; i < BUNTING.points; i++) {
        const a = (i / (BUNTING.points - 1)) * Math.PI * 2;
        stringPos.set([Math.sin(a) * BUNTING.radius, buntingY(a, t), Math.cos(a) * BUNTING.radius], i * 3);
      }
      stringGeo.attributes.position.needsUpdate = true;
      flags.forEach((f, i) => {
        const a = ((i + 0.5) / BUNTING.flags) * Math.PI * 2;
        f.position.set(Math.sin(a) * BUNTING.radius, buntingY(a, t), Math.cos(a) * BUNTING.radius);
        f.rotation.set(Math.sin(t * 2 + i) * 0.2 * motion, a, Math.sin(t * 1.3 + i) * 0.04 * motion);
      });
      const fall = chorus ? 1.4 : 0.6;
      for (let i = 0; i < CONFETTI; i++) {
        const a = hash(i * 1.7) * Math.PI * 2, r = 1 + hash(i * 2.3) * 11;
        confettiPos.set([Math.sin(a) * r + Math.sin(t + i) * 0.2, 9 - (((hash(i * 3.1) * 10 + t * (0.25 + hash(i * 4.7) * 0.3) * fall) % 10) + 10) % 10, Math.cos(a) * r], i * 3);
      }
      confettiGeo.attributes.position.needsUpdate = true;

      const done = Math.exp(-Math.max(0, now - completeFlash) / 0.45) * (now >= completeFlash ? 1 : 0);
      const p = ofSides(sides);
      const hitGlow = Math.exp(-Math.max(0, now - p.hitAt) / 0.18) * (now >= p.hitAt ? 1 : 0);
      accent.copy(p.color);
      venue.update(now, { beat, pulse, sides, primary, secondary, accent, subject: subject.set(p.place.x, p.place.y, p.place.z), eye: camera.position, look: camera.getWorldDirection(forward), cueAt: director.moveAt, hit: Math.max(hitGlow, done), chorus: chorusLevel, finale: outroLevel, motion });
      trims.forEach(({ ring, base }, i) => ring.material.color.copy(base).multiplyScalar(0.8 + pulse * 0.5 + done * (i === 0 ? 1 : 0.4)));
      ball.rotation.y = now * 0.4 * motion;
      skyU.uTime.value = t;
      skyU.uKick.value = pulse;
      floorU.uTime.value = now;
      floorU.uKick.value = pulse;
      bloom.strength = 0.6 + pulse * 0.12 + done * 0.35;
      post.uniforms.uTime.value = t;
      post.uniforms.uCA.value = 0.1 + pulse * 0.18 + done * 0.6;
      post.uniforms.uFlash.value = done * 0.08;
      post.uniforms.uFlashColor.value.copy(p.color);
      post.uniforms.uGlitch.value = 0;
      composer.render();

      // Where HUD text goes: the subject's centre, the top of its shape and how big it is on screen.
      subject.set(0, R + 0.35, 0).applyMatrix4(p.group.matrixWorld);
      const head = toScreen(subject);
      subject.set(0, 0, 0).applyMatrix4(p.group.matrixWorld);
      const centre = toScreen(subject);
      return { head, centre, size: Math.abs(head.y - centre.y) };
    },
    diagnostics() {
      return { camera: { shot: director.shot, moving: director.pose.moving, position: camera.position.toArray(), target: lookAt.toArray(), fov: camera.fov }, active, performers: performers.map((p) => ({ sides: p.n, count: p.count, position: p.group.position.toArray(), yaw: p.group.rotation.y })), venue: venue.diagnostics() };
    },
    destroy() {
      observer.disconnect();
      const geometries = new Set(), materials = new Set();
      scene.traverse((o) => {
        if (o.isInstancedMesh) o.dispose();
        if (o.geometry) geometries.add(o.geometry);
        if (o.material) materials.add(o.material);
      });
      for (const g of [...geometries, ...cueGeometry.values(), shared.core, shared.halo, shared.dot]) g.dispose();
      for (const m of [...materials, shared.lit, shared.dim]) m.dispose();
      for (const tex of [glow, ...shared.labels]) tex.dispose();
      composer.dispose();
      target.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
