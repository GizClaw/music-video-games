import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { ParametricGeometry } from "three/addons/geometries/ParametricGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { clamp, easeInOut, easeOutCubic, hash, lerp, smooth } from "@gizclaw/mvg-core/timing.js";
import { ballTexture, dotTexture, letterTexture, ropeTexture, sailTexture, seamBallTexture, stripeTexture, targetTexture, woodTexture } from "./textures.js";

// Each station stands on the lawn at its origin, fits about 2.3 × 2 units and is
// posed from its own list of events { t0, t1 }: t0 starts the demo, t1 is the
// moment it lands (the sung answer word in the chorus).
const UP = new THREE.Vector3(0, 1, 0);
const V = (x, y, z = 0) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;
const WHITE = "#d4dae4";
export const DOT = dotTexture();

/** A force arrow: length is the size, the head shows the direction. Drawn over everything. */
export class Arrow {
  constructor(color, label, r = 0.045) {
    this.label = label;
    this.color = color;
    this.group = new THREE.Group();
    this.mat = new THREE.MeshBasicMaterial({ color, depthTest: false, depthWrite: false, transparent: true });
    this.ink = new THREE.MeshBasicMaterial({ color: "#14121c", side: THREE.BackSide, depthTest: false, depthWrite: false, transparent: true });
    const shaft = new THREE.CylinderGeometry(r, r, 1, 16).translate(0, 0.5, 0);
    const head = new THREE.ConeGeometry(r * 2.8, r * 6, 24).translate(0, r * 3, 0);
    this.headLen = r * 6;
    const add = (geo, mat, order) => {
      const m = new THREE.Mesh(geo, mat);
      m.renderOrder = order;
      this.group.add(m);
      return m;
    };
    this.shaftInk = add(shaft, this.ink, 20);
    this.headInk = add(head, this.ink, 20);
    this.shaft = add(shaft, this.mat, 21);
    this.head = add(head, this.mat, 21);
    this.tip = new THREE.Vector3();
    this.tail = new THREE.Vector3();
    this.alpha = 0;
    this.dir = new THREE.Vector3();
    this.at = "tip";
  }

  set(origin, dir, len, alpha = 1) {
    this.alpha = len > 0.03 ? alpha : 0;
    this.group.visible = this.alpha > 0.01;
    this.dir.copy(dir).normalize();
    this.group.position.copy(origin);
    this.group.quaternion.setFromUnitVectors(UP, this.dir);
    const s = Math.max(0.001, len - this.headLen);
    this.shaft.scale.set(1, s, 1);
    this.shaftInk.scale.set(1.8, s, 1.8);
    this.head.position.y = s;
    this.headInk.position.y = s - this.headLen * 0.12;
    this.headInk.scale.setScalar(1.3);
    this.mat.opacity = this.alpha;
    this.ink.opacity = this.alpha * 0.85;
    this.tip.copy(this.dir).multiplyScalar(len).add(origin);
    this.tail.copy(origin);
  }

  /** Where the label goes: past the free end of the arrow. */
  labelPoint() {
    if (this.at.isVector3) return this.at;
    return this.at === "tail" ? this.tail.clone().addScaledVector(this.dir, -0.2) : this.tip.clone().addScaledVector(this.dir, 0.2);
  }
}

// Shared materials and geometry helpers.
const physical = (color, o = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.2, ...o });
const woodMat = (base, seed, boards = 1) => new THREE.MeshStandardMaterial({ map: woodTexture(base, seed, boards), roughness: 0.62 });
const M = {
  pale: woodMat("#c99a5c", 3),
  oak: woodMat("#a87442", 7),
  dark: woodMat("#7e5430", 11),
  deck: woodMat("#b88a55", 5, 6),
  steel: new THREE.MeshStandardMaterial({ color: "#a9b0ba", roughness: 0.3, metalness: 0.85 }),
  iron: new THREE.MeshStandardMaterial({ color: "#2b2f36", roughness: 0.45, metalness: 0.6 }),
  brass: new THREE.MeshStandardMaterial({ color: "#c9983f", roughness: 0.28, metalness: 0.9 }),
  rubber: new THREE.MeshStandardMaterial({ color: "#26282c", roughness: 0.85 }),
};
const rbox = (w, h, d, r = 0.012) => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2.1, h / 2.1, d / 2.1));
const tmpObj = new THREE.Object3D();
/** A copy of geo moved and turned into place, ready to merge. */
function place(geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  tmpObj.position.set(x, y, z);
  tmpObj.rotation.set(rx, ry, rz);
  tmpObj.updateMatrix();
  return geo.clone().applyMatrix4(tmpObj.matrix);
}
const merged = (list) => mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)));
/** A thin tube between points, for rigging and wires. */
const wire = (pts, r = 0.004) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), Math.max(2, pts.length * 4), r, 5);

/** A slatted wooden crate: three planks a side, framed edges, braces and nail heads. */
function buildCrate(S) {
  const t = S * 0.06;
  const planks = [];
  const frame = [];
  const nails = [];
  const nail = new THREE.CylinderGeometry(S * 0.016, S * 0.016, S * 0.01, 8).rotateX(Math.PI / 2);
  const faces = [[0, 0, 0], [0, Math.PI, 0], [0, Math.PI / 2, 0], [0, -Math.PI / 2, 0], [-Math.PI / 2, 0, 0], [Math.PI / 2, 0, 0]];
  const ph = (S - S * 0.04) / 3;
  for (const [rx, ry] of faces) {
    const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, 0));
    const face = [];
    for (let k = 0; k < 3; k++) face.push(place(rbox(S * 0.96, ph - S * 0.014, t, S * 0.01), 0, (k - 1) * ph, S / 2 - t / 2));
    planks.push(...face.map((g) => g.applyMatrix4(m)));
    frame.push(place(rbox(S * 1.2, S * 0.13, t, S * 0.01), 0, 0, S / 2 + t * 0.4, 0, 0, Math.PI / 4).applyMatrix4(m));
    for (const [x, y] of [[-0.36, -0.36], [0.36, 0.36], [-0.36, 0.36], [0.36, -0.36], [0, 0]]) nails.push(place(nail, x * S, y * S, S / 2 + t * 0.95).applyMatrix4(m));
  }
  const edge = rbox(S * 0.12, S * 1.02, S * 0.12, S * 0.02);
  for (const x of [-1, 1]) for (const z of [-1, 1]) frame.push(place(edge, (x * S) / 2, 0, (z * S) / 2));
  for (const y of [-1, 1]) {
    for (const z of [-1, 1]) frame.push(place(edge, 0, (y * S) / 2, (z * S) / 2, 0, 0, Math.PI / 2));
    for (const x of [-1, 1]) frame.push(place(edge, (x * S) / 2, (y * S) / 2, 0, Math.PI / 2, 0, 0));
  }
  const g = new THREE.Group();
  g.add(new THREE.Mesh(merged(planks), M.pale), new THREE.Mesh(merged(frame), M.oak), new THREE.Mesh(merged(nails), M.iron));
  return g;
}

class Station {
  constructor(color) {
    this.group = new THREE.Group();
    this.color = color;
    this.arrows = [];
    this.events = [];
    this.label = V(0, 1.9);
  }

  add(geo, mat, x = 0, y = 0, z = 0, parent = this.group) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }

  arrow(color, label, at = "tip") {
    const a = new Arrow(color, label);
    a.at = at;
    this.group.add(a.group);
    this.arrows.push(a);
    return a;
  }

  setEvents(list) {
    this.events = list;
  }

  locate(t) {
    let last = null;
    let next = null;
    for (const e of this.events) {
      if (e.t0 <= t) last = e;
      else {
        next = e;
        break;
      }
    }
    return [last, next];
  }
}

export class Gravity extends Station {
  constructor(color) {
    super(color);
    // A timber drop frame: footed post, arm, knee brace, brass fittings and a release clamp.
    const timber = [
      place(rbox(0.72, 0.08, 0.56, 0.02), -0.75, 0.04, 0),
      place(rbox(0.14, 1.7, 0.14, 0.025), -0.75, 0.93, 0),
      place(rbox(1.12, 0.12, 0.14, 0.025), -0.26, 1.74, 0),
      place(rbox(0.44, 0.07, 0.09, 0.015), -0.58, 1.56, 0, 0, 0, Math.PI / 4),
      place(rbox(0.38, 0.06, 0.08, 0.015), -0.75, 0.22, 0.17, -Math.PI / 4, 0, 0),
      place(rbox(0.38, 0.06, 0.08, 0.015), -0.75, 0.22, -0.17, Math.PI / 4, 0, 0),
    ];
    this.add(merged(timber), M.oak);
    const fittings = [place(rbox(0.2, 0.2, 0.01, 0.004), -0.75, 1.68, 0.075), place(rbox(0.2, 0.2, 0.01, 0.004), -0.75, 1.68, -0.075), place(new THREE.CylinderGeometry(0.055, 0.045, 0.08, 24), 0.15, 1.65, 0), place(new THREE.TorusGeometry(0.04, 0.012, 10, 24), 0.15, 1.6, 0, Math.PI / 2)];
    for (const [x, y] of [[-0.8, 1.73], [-0.7, 1.63], [-0.8, 1.63], [-0.7, 1.73]]) fittings.push(place(new THREE.CylinderGeometry(0.012, 0.012, 0.17, 8), x, y, 0, Math.PI / 2));
    this.add(merged(fittings), M.brass);
    const rope = ropeTexture();
    rope.repeat.set(1, 18);
    this.rope = this.add(new THREE.CylinderGeometry(0.012, 0.012, 1, 10).translate(0, -0.5, 0), new THREE.MeshStandardMaterial({ map: rope, roughness: 0.9 }), 0.15, 1.6, 0);
    this.add(new THREE.CylinderGeometry(0.45, 0.46, 0.025, 64), [new THREE.MeshStandardMaterial({ color: "#d9d2c2", roughness: 0.8 }), new THREE.MeshStandardMaterial({ map: targetTexture(color), roughness: 0.7 }), M.rubber], 0.15, 0.0125, 0);
    this.ball = this.add(new THREE.SphereGeometry(0.2, 64, 32), physical("#ffffff", { map: ballTexture(["#e8382e", "#f6f2ea", "#ffc23d", "#f6f2ea", "#2f7ae0", "#f6f2ea"]), roughness: 0.28, clearcoat: 1 }), 0.15, 1.38, 0);
    this.weight = this.arrow(color, "GRAVITY");
    this.earth = this.arrow(color, "");
    this.mutual = 0;
    this.label = V(0.15, 1.95);
  }

  pose(t) {
    const TOP = 1.38;
    const R = 0.2;
    const [ev, next] = this.locate(t);
    let y = TOP;
    let squash = 0;
    let hanging = true;
    let roll = 0;
    if (ev) {
      const D = Math.max(0.3, ev.t1 - ev.t0);
      const g = (2 * (TOP - R)) / (D * D);
      const tau = t - ev.t0;
      hanging = false;
      roll = Math.min(tau, D + 1.2) * 1.5;
      if (tau < D) y = TOP - 0.5 * g * tau * tau;
      else {
        let v = g * D * 0.42;
        let s = tau - D;
        y = R;
        squash = Math.exp(-s / 0.06);
        for (let k = 0; k < 3; k++) {
          const T = (2 * v) / g;
          if (s < T) {
            y = R + v * s - 0.5 * g * s * s;
            break;
          }
          s -= T;
          v *= 0.4;
        }
      }
      if (next && t > next.t0 - 0.6) {
        y = lerp(y, TOP, easeInOut((t - (next.t0 - 0.6)) / 0.45));
        hanging = true;
      }
    }
    this.ball.position.y = y;
    this.ball.rotation.set(0.4, roll + t * 0.2, 0.15);
    this.ball.scale.set(1 + squash * 0.25, 1 - squash * 0.3, 1 + squash * 0.25);
    this.rope.visible = hanging;
    this.rope.scale.y = Math.max(0.01, 1.6 - (y + R));
    this.rope.material.map.repeat.y = 18 * this.rope.scale.y;
    this.weight.set(V(0.15, y), V(0, -1), 0.72);
    this.earth.set(V(0.15, 0.02), V(0, 1), 0.34, this.mutual);
  }
}

const DECK = 0.1;

export class Friction extends Station {
  constructor(color) {
    super(color);
    // A low slatted deck on battens and feet, with end stops.
    const boards = [];
    for (let k = 0; k < 5; k++) boards.push(place(rbox(2.4, 0.045, 0.15, 0.012), 0, DECK - 0.0225, (k - 2) * 0.162));
    for (const x of [-1.19, 1.19]) boards.push(place(rbox(0.06, 0.08, 0.84, 0.015), x, DECK + 0.03, 0));
    this.add(merged(boards), M.deck);
    const under = [];
    for (const x of [-1.0, 0, 1.0]) under.push(place(rbox(0.09, 0.05, 0.84, 0.01), x, DECK - 0.07, 0));
    for (const x of [-1.0, 1.0]) for (const z of [-0.36, 0.36]) under.push(place(rbox(0.1, 0.03, 0.1, 0.01), x, 0.015, z));
    this.add(merged(under), M.dark);
    const nails = [];
    for (const x of [-1.0, 0, 1.0]) for (let k = 0; k < 5; k++) for (const dz of [-0.04, 0.04]) nails.push(place(new THREE.CylinderGeometry(0.008, 0.008, 0.006, 8), x, DECK + 0.001, (k - 2) * 0.162 + dz));
    this.add(merged(nails), M.iron);
    this.crate = buildCrate(0.46);
    this.crate.position.set(-0.5, DECK + 0.23, 0);
    this.group.add(this.crate);
    this.friction = this.arrow(color, "FRICTION");
    this.push = this.arrow(WHITE, "PUSH", "tail");
    this.pullL = this.arrow(WHITE, "PULL");
    this.pullR = this.arrow(WHITE, "PULL");
    const n = 40;
    this.dustSeed = Array.from({ length: n }, (_, i) => [hash(i * 1.3), hash(i * 2.9), hash(i * 4.7)]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.dust = new THREE.Points(geo, new THREE.PointsMaterial({ color: "#e8d8b0", map: DOT, size: 0.05, transparent: true, depthWrite: false }));
    this.group.add(this.dust);
    this.label = V(0, 0.95);
  }

  /** Events alternate sides, so the crate never has to be carried back. */
  setEvents(list) {
    let side = -1;
    this.events = list.map((e) => {
      const ev = { ...e, from: side * 0.5, to: -side * 0.5, dir: -side };
      side = -side;
      return ev;
    });
  }

  pose(t) {
    const [ev] = this.locate(t);
    let x = -0.5;
    let slide = 0;
    let dir = 1;
    this.pullL.set(V(0, 0), V(-1, 0), 0, 0);
    this.pullR.set(V(0, 0), V(1, 0), 0, 0);
    this.push.set(V(0, 0), V(1, 0), 0, 0);
    if (ev) {
      dir = ev.dir;
      if (ev.tu !== undefined) {
        // Tug of war: equal pulls hold still, then one side wins and accelerates it.
        const k = smooth(ev.tu, ev.tu + 0.25, t);
        const u = clamp((t - ev.tu) / (ev.t1 - ev.tu), 0, 1);
        x = lerp(ev.from, ev.to, u * u);
        const a = smooth(ev.t0 - 0.1, ev.t0 + 0.2, t) * (1 - smooth(ev.t1 + 0.3, ev.t1 + 0.6, t));
        const win = dir > 0 ? this.pullR : this.pullL;
        const lose = dir > 0 ? this.pullL : this.pullR;
        win.set(V(x + dir * 0.25, DECK + 0.24), V(dir, 0), lerp(0.55, 0.95, k), a);
        lose.set(V(x - dir * 0.25, DECK + 0.24), V(-dir, 0), 0.55, a);
        win.at = V(x + dir * 0.62, DECK + 0.5);
        lose.at = V(x - dir * 0.55, DECK + 0.5);
      } else {
        const D = Math.max(0.3, ev.t1 - ev.t0);
        const u = clamp((t - ev.t0) / D, 0, 1);
        x = lerp(ev.from, ev.to, 1 - (1 - u) * (1 - u));
        slide = u < 1 ? 1 : 0;
        const fade = 1 - smooth(ev.t1, ev.t1 + 0.25, t);
        this.friction.set(V(x - dir * 0.05, DECK + 0.04, 0.3), V(-dir, 0), 0.62, fade);
        this.push.set(V(x - dir * 0.85, DECK + 0.24), V(dir, 0), 0.55, 1 - smooth(ev.t0 + 0.1, ev.t0 + 0.35, t));
      }
    }
    if (!ev || ev.tu !== undefined) this.friction.set(V(0, 0), V(1, 0), 0, 0);
    this.crate.position.x = x;
    this.crate.rotation.z = -dir * slide * 0.04;
    const dp = this.dust.geometry.attributes.position;
    const age = ev && ev.tu === undefined ? t - ev.t0 : 9;
    this.dustSeed.forEach(([a, b, c], i) => {
      const s = (age * (0.6 + a) + b) % 0.6;
      const live = age < (ev ? ev.t1 - ev.t0 : 0) + 0.3;
      dp.setXYZ(i, live ? x - dir * (0.25 + s * 0.6) : 0, live ? DECK + 0.02 + s * (0.3 + c * 0.3) - s * s : -9, (c - 0.5) * 0.5);
    });
    dp.needsUpdate = true;
    this.dust.material.opacity = slide * 0.8;
  }
}

/** A coil spring with closed ends; the vertex step squashes its centre line only, so the wire stays round. */
class Helix extends THREE.Curve {
  constructor(turns, r) {
    super();
    this.turns = turns;
    this.r = r;
  }

  getPoint(s, target = new THREE.Vector3()) {
    const a = s * this.turns * TAU;
    return target.set(Math.cos(a) * this.r, s - (Math.sin(TAU * s) / TAU) * 0.85, Math.sin(a) * this.r);
  }
}

function squashable(material, uniforms) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uHeight = uniforms.uHeight;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aCenterY;\nuniform float uHeight;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\ntransformed.y += aCenterY * (uHeight - 1.0);");
  };
  return material;
}

export class Elastic extends Station {
  constructor(color) {
    super(color);
    const plate = [[0, 0], [0.44, 0], [0.465, 0.015], [0.47, 0.055], [0.45, 0.075], [0.32, 0.082], [0, 0.082]].map(([x, y]) => new THREE.Vector2(x, y));
    this.add(new THREE.LatheGeometry(plate, 72), physical("#30353d", { metalness: 0.4, roughness: 0.4 }));
    const bolts = [];
    for (let k = 0; k < 6; k++) bolts.push(place(new THREE.CylinderGeometry(0.03, 0.03, 0.025, 6), Math.cos((k / 6) * TAU) * 0.385, 0.088, Math.sin((k / 6) * TAU) * 0.385));
    this.add(merged(bolts), M.steel);
    const helix = new Helix(7, 0.22);
    const tub = 7 * 40;
    const geo = new THREE.TubeGeometry(helix, tub, 0.032, 12);
    const cy = new Float32Array(geo.attributes.position.count);
    const p = new THREE.Vector3();
    for (let i = 0; i <= tub; i++) {
      helix.getPointAt(i / tub, p);
      for (let j = 0; j <= 12; j++) cy[i * 13 + j] = p.y;
    }
    geo.setAttribute("aCenterY", new THREE.BufferAttribute(cy, 1));
    this.coilU = { uHeight: { value: 1 } };
    this.coil = this.add(geo, squashable(physical(color, { roughness: 0.25, metalness: 0.3 }), this.coilU), 0, 0.08, 0);
    this.coil.customDepthMaterial = squashable(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), this.coilU);
    const cap = [[0, 0], [0.3, 0], [0.32, 0.015], [0.32, 0.045], [0.3, 0.06], [0, 0.06]].map(([x, y]) => new THREE.Vector2(x, y));
    this.plate = new THREE.Group();
    this.group.add(this.plate);
    this.add(new THREE.LatheGeometry(cap, 64), physical("#30353d", { metalness: 0.4, roughness: 0.4 }), 0, 0, 0, this.plate);
    this.add(new THREE.CylinderGeometry(0.24, 0.25, 0.03, 48), M.rubber, 0, 0.075, 0, this.plate);
    this.ball = this.add(new THREE.SphereGeometry(0.22, 64, 32), physical("#ffffff", { map: seamBallTexture("#ffcf2e"), roughness: 0.45, clearcoat: 0.5 }), 0, 1.15, 0);
    this.elastic = this.arrow(color, "ELASTIC");
    this.push = this.arrow(WHITE, "PUSH", "tail");
    this.label = V(0, 1.7);
  }

  pose(t, beat) {
    const H0 = 0.7;
    const g = 14;
    const [ev] = this.locate(t);
    let c = 0.05 * beat.kick;
    let fly = 0;
    let load = 0;
    if (ev) {
      const D = Math.max(0.25, ev.t1 - ev.t0);
      const tau = t - ev.t0;
      if (tau < D) {
        load = easeInOut(tau / D);
        c = Math.max(c, 0.4 * load);
      } else {
        let s = tau - D;
        let v = Math.sqrt(2 * g * 0.8);
        c = -0.1 * Math.exp(-s / 0.08) * Math.cos(s * 40);
        for (let k = 0; k < 3; k++) {
          const T = (2 * v) / g;
          if (s < T) {
            fly = v * s - 0.5 * g * s * s;
            break;
          }
          s -= T;
          c = Math.max(c, 0.22 * Math.pow(0.5, k) * Math.exp(-s / 0.07));
          v *= 0.5;
        }
      }
    }
    const top = 0.08 + H0 - c;
    this.coilU.uHeight.value = H0 - c;
    this.plate.position.y = top;
    this.ball.position.y = top + 0.09 + 0.22 + fly;
    this.ball.rotation.set(0.3, t * 0.4 + fly, 0);
    this.elastic.set(V(0.5, top - 0.1), V(0, 1), 0.25 + 1.6 * Math.max(0, c), smooth(0.03, 0.08, c));
    this.push.set(V(0, top + 0.95 + 0.4 * (1 - load)), V(0, -1), 0.45, load > 0 && load < 1 ? 1 : 0);
  }
}

// The sailboat's hull: stern at x = -0.6, bow at x = 0.72, sheer rising toward the bow.
const hullWidth = (u) => 0.22 * Math.pow(Math.sin(Math.PI * (0.12 + 0.88 * u)), 0.7);
const sheer = (u) => 0.1 + 0.06 * u * u;
const keel = (u) => 0.17 * (1 - 0.8 * u * u * u);
const hullX = (u) => lerp(-0.6, 0.72, u);

function hullTexture() {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 256;
  const g = c.getContext("2d");
  g.fillStyle = "#d8402c";
  g.fillRect(0, 0, 64, 256);
  g.fillStyle = "#1d3557";
  g.fillRect(0, 88, 64, 80);
  for (const y of [0, 249]) {
    g.fillStyle = "#e9e3d4";
    g.fillRect(0, y, 64, 7);
  }
  g.fillStyle = "#e3b04b";
  g.fillRect(0, 12, 64, 3);
  g.fillRect(0, 241, 64, 3);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** A gently bellied triangular sail through three corners. */
function sailGeometry(a, b, c, belly, n = 14) {
  const pos = [];
  const uv = [];
  const idx = [];
  const ab = new THREE.Vector3().subVectors(b, a);
  const ac = new THREE.Vector3().subVectors(c, a);
  const normal = new THREE.Vector3().crossVectors(ab, ac).normalize();
  const row = [];
  for (let i = 0; i <= n; i++) {
    row.push(pos.length / 3);
    for (let j = 0; j <= n - i; j++) {
      const u = i / n;
      const v = j / n;
      const w = 1 - u - v;
      const p = a.clone().addScaledVector(ab, u).addScaledVector(ac, v).addScaledVector(normal, belly * 27 * u * v * w);
      pos.push(p.x, p.y, p.z);
      uv.push(u + v * 0.5, v);
    }
  }
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n - i; j++) {
      const p0 = row[i] + j;
      const p1 = row[i + 1] + j;
      idx.push(p0, p1, p0 + 1);
      if (j < n - i - 1) idx.push(p1, p1 + 1, p0 + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

export class Buoyancy extends Station {
  constructor(color) {
    super(color);
    this.boat = new THREE.Group();
    this.group.add(this.boat);
    const b = this.boat;
    const hull = new ParametricGeometry((u, v, p) => {
      const s = Math.cos(Math.PI * v);
      const h = Math.sin(Math.PI * v);
      p.set(hullX(u), sheer(u) - (sheer(u) + keel(u)) * Math.pow(h, 0.85), hullWidth(u) * s);
    }, 64, 24);
    this.add(hull, physical("#ffffff", { map: hullTexture(), side: THREE.DoubleSide, roughness: 0.3, clearcoat: 1 }), 0, 0, 0, b);
    const transom = new THREE.Shape();
    const w0 = hullWidth(0);
    for (let k = 0; k <= 24; k++) {
      const v = k / 24;
      const x = w0 * Math.cos(Math.PI * v);
      const y = sheer(0) - (sheer(0) + keel(0)) * Math.pow(Math.sin(Math.PI * v), 0.85);
      k ? transom.lineTo(x, y) : transom.moveTo(x, y);
    }
    this.add(new THREE.ShapeGeometry(transom, 24).rotateY(-Math.PI / 2), physical("#d8402c", { side: THREE.DoubleSide }), -0.6, 0, 0, b);
    const deck = new ParametricGeometry((u, v, p) => {
      const x = lerp(-0.6, 0.71, u);
      const uu = (x + 0.6) / 1.32;
      p.set(x, sheer(uu) - 0.008 + 0.012 * (1 - (2 * v - 1) ** 2), hullWidth(uu) * 0.97 * (2 * v - 1));
    }, 48, 8);
    this.add(deck, M.deck.clone(), 0, 0, 0, b).material.side = THREE.DoubleSide;
    // Coaming, cabin with portholes, mast, boom, sails, rigging, rudder and pennant.
    this.add(rbox(0.36, 0.1, 0.24, 0.03), physical("#d6d0c2"), 0.2, 0.15, 0, b);
    for (const z of [-0.121, 0.121]) for (const x of [0.12, 0.26]) this.add(new THREE.CircleGeometry(0.022, 20), M.iron, x, 0.155, z, b).rotation.y = z > 0 ? 0 : Math.PI;
    const mastProfile = [[0, 0], [0.026, 0], [0.024, 0.5], [0.017, 1.0], [0, 1.0]].map(([x, y]) => new THREE.Vector2(x, y));
    const varnish = new THREE.MeshPhysicalMaterial({ color: "#b07a3a", roughness: 0.35, clearcoat: 0.8 });
    this.add(new THREE.LatheGeometry(mastProfile, 16), varnish, 0.05, 0.12, 0, b);
    this.add(new THREE.CylinderGeometry(0.014, 0.012, 0.58, 12).rotateZ(Math.PI / 2), varnish, -0.24, 0.33, 0, b);
    const cloth = sailTexture();
    const sailMat = new THREE.MeshPhysicalMaterial({ map: cloth, color: "#cfc8b8", side: THREE.DoubleSide, roughness: 0.85, sheen: 0.5, sheenColor: new THREE.Color("#fff6e0"), sheenRoughness: 0.6 });
    this.add(sailGeometry(V(0.035, 0.35), V(0.035, 1.08), V(-0.52, 0.35), 0.05), sailMat, 0, 0, 0, b);
    this.add(sailGeometry(V(0.68, 0.17), V(0.07, 0.98), V(0.2, 0.22), -0.035), sailMat, 0, 0, 0, b);
    const rig = [
      wire([V(0.05, 1.11), V(0.7, 0.16)]),
      wire([V(0.05, 1.11), V(-0.59, 0.13)]),
      wire([V(0.05, 0.92), V(0.0, 0.13, 0.2)]),
      wire([V(0.05, 0.92), V(0.0, 0.13, -0.2)]),
      wire([V(-0.5, 0.33), V(-0.5, 0.2, 0.08), V(-0.45, 0.14, 0.12)], 0.003),
    ];
    this.add(merged(rig), M.iron, 0, 0, 0, b);
    this.add(rbox(0.12, 0.2, 0.02, 0.008), physical("#1d3557"), -0.64, -0.06, 0, b);
    this.add(new THREE.CylinderGeometry(0.008, 0.008, 0.22, 8).rotateZ(Math.PI / 2 - 0.2), varnish, -0.5, 0.16, 0, b);
    const pennant = new THREE.Shape();
    pennant.moveTo(0, 0.03);
    pennant.lineTo(0.2, 0);
    pennant.lineTo(0, -0.03);
    this.flag = this.add(new THREE.ShapeGeometry(pennant), new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: 0.6 }), 0.05, 1.12, 0, b);
    const ring = new THREE.MeshBasicMaterial({ color: "#d8f2ff", transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.rings = [0, 1].map(() => this.add(new THREE.RingGeometry(0.96, 1, 64).rotateX(-Math.PI / 2), ring.clone(), 0.05, 0.035, 0));
    this.boat.scale.setScalar(1.2);
    this.lift = this.arrow(color, "BUOYANCY");
    this.weight = this.arrow("#ff5d5d", "GRAVITY");
    this.push = this.arrow(WHITE, "PUSH", "tail");
    this.label = V(0, 1.5);
  }

  pose(t) {
    const [ev] = this.locate(t);
    let d = 0.025 * Math.sin((t * Math.PI * 2) / 2.3);
    let load = 0;
    let rip = 9;
    if (ev) {
      const D = Math.max(0.25, ev.t1 - ev.t0);
      const tau = t - ev.t0;
      if (tau < D) {
        load = easeInOut(tau / D);
        d = Math.max(d, 0.26 * load);
      } else {
        const s = tau - D;
        d += 0.26 * Math.exp(-s / 0.4) * Math.cos(s * 8.5);
        rip = s;
      }
    }
    this.boat.position.y = 0.08 - d;
    this.boat.rotation.z = Math.sin(t * 1.7) * 0.04 + d * 0.15;
    this.boat.rotation.x = Math.sin(t * 1.3) * 0.03;
    this.flag.rotation.y = Math.sin(t * 3.1) * 0.35;
    this.rings.forEach((r, k) => {
      const age = rip - k * 0.25;
      const on = age > 0 && age < 1.6;
      r.visible = on;
      r.scale.setScalar(0.7 + age * 1.1);
      r.material.opacity = on ? 0.35 * (1 - age / 1.6) : 0;
    });
    this.lift.set(V(0.38, 0.2 - d, 0.3), V(0, 1), 0.5 + 1.5 * Math.max(0, d));
    this.weight.set(V(-0.3, 0.2 - d, 0.3), V(0, -1), 0.5);
    this.push.set(V(0.25, 1.13 - d + 0.3 * (1 - load)), V(0, -1), 0.45, load > 0 && load < 1 ? 1 : 0);
  }
}

export class Magnetism extends Station {
  constructor(color) {
    super(color);
    const TOP = 0.74;
    this.top = TOP;
    // A picnic table: slatted top and benches on bolted A-frames.
    const slats = [];
    for (let k = 0; k < 5; k++) slats.push(place(rbox(2.3, 0.04, 0.17, 0.012), 0, TOP - 0.02, (k - 2) * 0.185));
    for (const z of [-0.74, 0.74]) for (const dz of [-0.07, 0.07]) slats.push(place(rbox(2.3, 0.035, 0.13, 0.012), 0, 0.43, z + dz));
    this.add(merged(slats), M.pale);
    const frame = [];
    for (const x of [-0.85, 0.85]) {
      for (const s of [-1, 1]) frame.push(place(rbox(0.07, 0.86, 0.09, 0.015), x, 0.36, s * 0.3, s * 0.5, 0, 0));
      frame.push(place(rbox(0.07, 0.07, 1.75, 0.015), x, 0.38, 0));
      frame.push(place(rbox(0.07, 0.06, 0.9, 0.015), x, TOP - 0.07, 0));
    }
    frame.push(place(rbox(1.6, 0.05, 0.06, 0.012), 0, 0.2, 0, 0, 0, 0));
    this.add(merged(frame), M.oak);
    const bolts = [];
    for (const x of [-0.89, 0.89]) for (const z of [-0.74, -0.3, 0.3, 0.74]) bolts.push(place(new THREE.CylinderGeometry(0.014, 0.014, 0.01, 10), x, 0.38, z, 0, 0, Math.PI / 2));
    this.add(merged(bolts), M.iron);
    // Bar magnets: rounded, enamelled halves with painted letters and a steel band.
    const half = rbox(0.3, 0.16, 0.18, 0.025);
    const paint = { N: physical("#e0352e", { clearcoat: 1, roughness: 0.3 }), S: physical("#2a62d8", { clearcoat: 1, roughness: 0.3 }) };
    const decal = (l) => new THREE.MeshBasicMaterial({ map: letterTexture(l), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    const letters = { N: decal("N"), S: decal("S") };
    const face = new THREE.PlaneGeometry(0.15, 0.15);
    this.magnets = [0, 1].map(() => {
      const g = new THREE.Group();
      for (const [x, l] of [[-0.15, "S"], [0.15, "N"]]) {
        this.add(half, paint[l], x, 0, 0, g);
        this.add(face, letters[l], x, 0, 0.093, g);
        this.add(face, letters[l], x, 0.083, 0, g).rotation.x = -Math.PI / 2;
      }
      this.add(rbox(0.014, 0.166, 0.186, 0.005), M.steel, 0, 0, 0, g);
      g.position.y = TOP + 0.08;
      this.group.add(g);
      return g;
    });
    this.pullL = this.arrow(color, "ATTRACT");
    this.pullR = this.arrow(color, "");
    // The field: dots streaming from N to S along six arcs across the gap.
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6 * 14 * 3), 3));
    this.field = new THREE.Points(geo, new THREE.PointsMaterial({ color, map: DOT, size: 0.09, transparent: true, depthWrite: false }));
    this.field.frustumCulled = false;
    this.group.add(this.field);
    this.fieldOn = 0;
    this.label = V(0, 1.35);
  }

  setEvents(list) {
    this.events = list.map((e) => ({ kind: "attract", ...e }));
  }

  pose(t, beat) {
    const D0 = 0.95;
    let gap = D0;
    let flip = 0;
    let mode = "attract";
    const [ev, next] = this.locate(t);
    if (ev) {
      const D = Math.max(0.25, ev.t1 - ev.t0);
      const u = clamp((t - ev.t0) / D, 0, 1);
      if (ev.kind === "repel") {
        mode = "repel";
        flip = 1;
        gap = D0 * (1 - (1 - u) * (1 - u));
      } else gap = D0 * (1 - u * u);
      if (next) {
        // Pull apart (and turn back round) just before the next demo.
        const k = easeInOut((t - (next.t0 - 0.75)) / 0.55);
        if (next.kind === "repel") flip = smooth(next.t0 - 0.45, next.t0 - 0.1, t);
        else {
          gap = lerp(gap, D0, k);
          if (ev.kind === "repel") flip = 1 - k;
        }
      }
    }
    const xL = -(0.3 + gap / 2);
    const xR = 0.3 + gap / 2;
    const [m0, m1] = this.magnets;
    m0.position.x = xL;
    m1.position.x = xR;
    m1.rotation.y = flip * Math.PI;
    m1.position.y = this.top + 0.08 + Math.sin(flip * Math.PI) * 0.25;
    m0.position.z = beat.kick * 0.01;
    const strength = 1 - gap / D0;
    const y = this.top + 0.34;
    this.pullL.at = V(0, y + 0.32);
    if (mode === "attract") {
      const len = Math.min(0.2 + 0.35 * strength, (xR - xL) / 2 - 0.02);
      this.pullL.set(V(xL, y), V(1, 0), len);
      this.pullR.set(V(xR, y), V(-1, 0), len);
      this.pullL.label = "ATTRACT";
    } else {
      const len = 0.2 + 0.35 * strength;
      this.pullL.set(V(xL, y), V(-1, 0), len);
      this.pullR.set(V(xR, y), V(1, 0), len);
      this.pullL.label = "REPEL";
    }
    const a = mode === "attract" ? this.fieldOn : 0;
    const x0 = xL + 0.15;
    const x1 = xR - 0.15;
    const p = this.field.geometry.attributes.position;
    for (let k = 0; k < 6; k++) {
      const h = (k - 2.5) * 0.06;
      for (let i = 0; i < 14; i++) {
        const u = (i / 14 + t * 0.6) % 1;
        const bulge = Math.sin(u * Math.PI) * (0.08 + Math.abs(h) * 2.2) * Math.sign(h);
        p.setXYZ(k * 14 + i, lerp(x0, x1, u), this.top + 0.08 + h * 0.6 + bulge, 0.1);
      }
    }
    p.needsUpdate = true;
    this.field.material.opacity = a;
    this.field.visible = a > 0.01;
  }
}

const GORES = 12;
const CANOPY_R = 0.55;
const RIM = Math.PI / 2.3;

/** Twelve gores in two colours, each bellied between its seams, scalloped at the skirt, with a vent at the crown. */
function canopyGeometry() {
  const parts = [];
  const cols = [new THREE.Color("#ff6b2e"), new THREE.Color("#f6f1e4")];
  const across = 8;
  const down = 14;
  for (let k = 0; k < GORES; k++) {
    const pos = [];
    const col = [];
    const idx = [];
    for (let i = 0; i <= down; i++) {
      for (let j = 0; j <= across; j++) {
        const f = j / across;
        const phi = ((k + f) / GORES) * TAU;
        const theta = lerp(0.12, RIM - 0.05 * Math.sin(Math.PI * f), i / down);
        const r = CANOPY_R * (1 + 0.06 * Math.sin(Math.PI * f) * Math.sin(theta * 1.6));
        pos.push(Math.sin(theta) * Math.cos(phi) * r, Math.cos(theta) * r, Math.sin(theta) * Math.sin(phi) * r);
        const c = cols[k % 2].clone().multiplyScalar(0.85 + 0.15 * Math.sin(Math.PI * f));
        col.push(c.r, c.g, c.b);
      }
    }
    for (let i = 0; i < down; i++) {
      for (let j = 0; j < across; j++) {
        const a = i * (across + 1) + j;
        idx.push(a, a + 1, a + across + 1, a + 1, a + across + 2, a + across + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    parts.push(g.toNonIndexed());
  }
  return mergeGeometries(parts);
}

export class Drag extends Station {
  constructor(color) {
    super(color);
    this.chute = new THREE.Group();
    this.group.add(this.chute);
    this.canopy = this.add(canopyGeometry(), new THREE.MeshPhysicalMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.7, sheen: 0.8, sheenColor: new THREE.Color("#ffffff") }), 0, 0.75, 0, this.chute);
    this.add(new THREE.TorusGeometry(Math.sin(0.12) * CANOPY_R, 0.008, 6, 32).rotateX(Math.PI / 2), M.iron, 0, Math.cos(0.12) * CANOPY_R, 0, this.canopy);
    this.crate = buildCrate(0.24);
    this.crate.position.y = 0.12;
    this.chute.add(this.crate);
    this.add(rbox(0.25, 0.03, 0.05, 0.01), new THREE.MeshStandardMaterial({ color: "#e0662c", roughness: 0.7 }), 0, 0.25, 0, this.chute);
    const geo = new THREE.BufferGeometry().setFromPoints(Array.from({ length: (GORES + 2) * 2 }, () => V(0, 0)));
    this.strings = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: "#f4ead8" }));
    this.chute.add(this.strings);
    // A windsock on a turned pole beside the landing spot.
    const pole = [[0, 0], [0.09, 0], [0.09, 0.03], [0.05, 0.05], [0.03, 0.12], [0.022, 1.6], [0.035, 1.62], [0, 1.64]].map(([x, y]) => new THREE.Vector2(x, y));
    this.add(new THREE.LatheGeometry(pole, 24), physical("#a9adb3", { roughness: 0.35, metalness: 0.5 }), 0.85, 0, -0.3);
    this.sock = new THREE.Group();
    this.sock.position.set(0.85, 1.55, -0.3);
    this.group.add(this.sock);
    this.add(new THREE.TorusGeometry(0.1, 0.01, 8, 32).rotateY(Math.PI / 2), M.steel, 0.02, 0, 0, this.sock);
    this.add(new THREE.CylinderGeometry(0.1, 0.05, 0.5, 24, 6, true).rotateZ(Math.PI / 2).translate(0.27, 0, 0), new THREE.MeshPhysicalMaterial({ map: stripeTexture("#ff4f3d", "#f6f1e4", 5), side: THREE.DoubleSide, roughness: 0.75, sheen: 0.6 }), 0, 0, 0, this.sock);
    this.drag = this.arrow(color, "AIR DRAG");
    this.weight = this.arrow("#ff5d5d", "GRAVITY");
    this.label = V(0, 1.6);
  }

  pose(t) {
    const Y0 = 2.6;
    const FREE = 0.8;
    const VT = 0.8;
    const TC = 0.18;
    const [ev, next] = this.locate(t);
    let y = 0;
    let open = 0.25;
    let v = 0;
    let show = 1;
    if (ev) {
      const D = Math.max(0.3, ev.t1 - ev.t0);
      const g = (2 * FREE) / (D * D);
      const tau = t - ev.t0;
      if (tau < D) {
        y = Y0 - 0.5 * g * tau * tau;
        v = g * tau;
        open = 0.25;
      } else {
        const s = tau - D;
        const v1 = g * D;
        v = VT + (v1 - VT) * Math.exp(-s / TC);
        y = Y0 - FREE - VT * s - (v1 - VT) * TC * (1 - Math.exp(-s / TC));
        open = easeOutCubic(s / 0.18);
      }
      if (y <= 0) {
        const land = ev.t1 + (Y0 - FREE - (g * D - VT) * TC) / VT;
        y = 0;
        v = 0;
        open = 1 - 0.75 * smooth(land, land + 0.5, t);
      }
      if (next) show = 1 - smooth(next.t0 - 0.3, next.t0 - 0.05, t);
    }
    this.chute.position.y = y;
    this.chute.visible = show > 0.01;
    this.chute.scale.setScalar(Math.max(0.01, show));
    const sx = 0.35 + 0.65 * open;
    const sy = 0.5 + 0.5 * open;
    this.canopy.scale.set(sx, sy, sx);
    this.canopy.position.y = 0.45 + 0.4 * open;
    this.canopy.rotation.y = t * 0.3;
    const p = this.strings.geometry.attributes.position;
    const rimY = this.canopy.position.y + CANOPY_R * Math.cos(RIM) * sy;
    for (let k = 0; k < GORES; k++) {
      const a = (k / GORES) * TAU - this.canopy.rotation.y;
      const side = Math.cos(a) > 0 ? 1 : -1;
      p.setXYZ(k * 2, Math.cos(a) * CANOPY_R * Math.sin(RIM) * sx, rimY, Math.sin(a) * CANOPY_R * Math.sin(RIM) * sx);
      p.setXYZ(k * 2 + 1, side * 0.06, 0.4, 0);
    }
    for (const [k, side] of [[GORES, 1], [GORES + 1, -1]]) {
      p.setXYZ(k * 2, side * 0.06, 0.4, 0);
      p.setXYZ(k * 2 + 1, side * 0.1, 0.25, 0);
    }
    p.needsUpdate = true;
    this.sock.rotation.y = Math.sin(t * 0.8) * 0.4;
    this.sock.rotation.z = Math.sin(t * 2.3) * 0.08;
    const falling = y > 0.01;
    const drag = falling ? Math.min(1.3, 0.55 * Math.pow(v / VT, 2) * (0.15 + 0.85 * open)) : 0;
    this.drag.set(V(0, y + this.canopy.position.y + 0.3 * open + 0.05), V(0, 1), drag, show);
    this.weight.set(V(0.0, y - 0.02), V(0, -1), falling ? 0.55 : 0, show);
  }
}

export const BUILDERS = [Gravity, Friction, Elastic, Buoyancy, Magnetism, Drag];
