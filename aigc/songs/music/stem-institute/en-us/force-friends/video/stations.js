import * as THREE from "three";
import { clamp, easeInOut, easeOutCubic, hash, lerp, smooth } from "@gizclaw/mvg-core/timing.js";

// Each station stands on the lawn at its origin, fits about 2.3 × 2 units and is
// posed from its own list of events { t0, t1 }: t0 starts the demo, t1 is the
// moment it lands (the sung answer word in the chorus).
const UP = new THREE.Vector3(0, 1, 0);
const V = (x, y, z = 0) => new THREE.Vector3(x, y, z);

/** A force arrow: length is the size, the head shows the direction. Drawn over everything. */
export class Arrow {
  constructor(color, label, r = 0.045) {
    this.label = label;
    this.color = color;
    this.group = new THREE.Group();
    this.mat = new THREE.MeshBasicMaterial({ color, depthTest: false, depthWrite: false, transparent: true });
    this.ink = new THREE.MeshBasicMaterial({ color: "#14121c", side: THREE.BackSide, depthTest: false, depthWrite: false, transparent: true });
    const shaft = new THREE.CylinderGeometry(r, r, 1, 12).translate(0, 0.5, 0);
    const head = new THREE.ConeGeometry(r * 2.8, r * 6, 20).translate(0, r * 3, 0);
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

function blobTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(0,0,0,0.75)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
const BLOB = blobTexture();

class Station {
  constructor(color) {
    this.group = new THREE.Group();
    this.color = color;
    this.accent = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.05 });
    this.wood = new THREE.MeshStandardMaterial({ color: "#a8743f", roughness: 0.75 });
    this.white = new THREE.MeshStandardMaterial({ color: "#f2efe6", roughness: 0.5 });
    this.steel = new THREE.MeshStandardMaterial({ color: "#9aa3b2", roughness: 0.35, metalness: 0.7 });
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

  shadow(r) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: BLOB, transparent: true, depthWrite: false }));
    m.position.y = 0.012;
    this.group.add(m);
    return m;
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
    this.add(new THREE.BoxGeometry(0.12, 1.75, 0.12), this.wood, -0.75, 0.875, 0);
    this.add(new THREE.BoxGeometry(1.05, 0.1, 0.12), this.wood, -0.3, 1.73, 0);
    this.add(new THREE.BoxGeometry(0.6, 0.06, 0.5), this.wood, -0.75, 0.03, 0);
    this.add(new THREE.CylinderGeometry(0.05, 0.05, 0.1, 12), this.steel, 0.15, 1.65, 0);
    this.rope = this.add(new THREE.CylinderGeometry(0.012, 0.012, 1, 6).translate(0, -0.5, 0), new THREE.MeshStandardMaterial({ color: "#efe2c2", roughness: 0.9 }), 0.15, 1.61, 0);
    this.add(new THREE.RingGeometry(0.14, 0.42, 40).rotateX(-Math.PI / 2), this.white, 0.15, 0.015, 0);
    this.add(new THREE.CircleGeometry(0.14, 32).rotateX(-Math.PI / 2), this.accent, 0.15, 0.016, 0);
    this.ball = this.add(new THREE.SphereGeometry(0.2, 32, 20), this.accent, 0.15, 1.38, 0);
    this.blob = this.shadow(0.3);
    this.blob.position.x = 0.15;
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
    if (ev) {
      const D = Math.max(0.3, ev.t1 - ev.t0);
      const g = (2 * (TOP - R)) / (D * D);
      const tau = t - ev.t0;
      hanging = false;
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
    this.ball.scale.set(1 + squash * 0.25, 1 - squash * 0.3, 1 + squash * 0.25);
    this.rope.visible = hanging;
    this.rope.scale.y = Math.max(0.01, 1.61 - (y + R));
    this.blob.scale.setScalar(lerp(1, 0.45, (y - R) / (TOP - R)));
    this.blob.material.opacity = lerp(0.9, 0.35, (y - R) / (TOP - R));
    this.weight.set(V(0.15, y), V(0, -1), 0.72);
    this.earth.set(V(0.15, 0.02), V(0, 1), 0.34, this.mutual);
  }
}

function crateTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  g.fillStyle = "#c99550";
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = "#8a5a2a";
  g.lineWidth = 4;
  for (let y = 32; y < 128; y += 32) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(128, y);
    g.stroke();
  }
  g.lineWidth = 12;
  g.strokeRect(6, 6, 116, 116);
  g.beginPath();
  g.moveTo(10, 118);
  g.lineTo(118, 10);
  g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Friction extends Station {
  constructor(color) {
    super(color);
    this.add(new THREE.BoxGeometry(2.3, 0.06, 0.8), this.wood, 0, 0.03, 0);
    this.crate = this.add(new THREE.BoxGeometry(0.46, 0.46, 0.46), new THREE.MeshStandardMaterial({ map: crateTexture(), roughness: 0.7 }), -0.5, 0.29, 0);
    this.blob = this.shadow(0.38);
    this.blob.position.y = 0.065;
    this.friction = this.arrow(color, "FRICTION");
    this.push = this.arrow("#ffffff", "PUSH", "tail");
    this.pullL = this.arrow("#ffffff", "PULL");
    this.pullR = this.arrow("#ffffff", "PULL");
    const n = 40;
    this.dustSeed = Array.from({ length: n }, (_, i) => [hash(i * 1.3), hash(i * 2.9), hash(i * 4.7)]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.dust = new THREE.Points(geo, new THREE.PointsMaterial({ color: "#e8d8b0", size: 0.05, transparent: true, depthWrite: false }));
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
        win.set(V(x + dir * 0.25, 0.3), V(dir, 0), lerp(0.55, 0.95, k), a);
        lose.set(V(x - dir * 0.25, 0.3), V(-dir, 0), 0.55, a);
      } else {
        const D = Math.max(0.3, ev.t1 - ev.t0);
        const u = clamp((t - ev.t0) / D, 0, 1);
        x = lerp(ev.from, ev.to, 1 - (1 - u) * (1 - u));
        slide = u < 1 ? 1 : 0;
        const fade = 1 - smooth(ev.t1, ev.t1 + 0.25, t);
        this.friction.set(V(x - dir * 0.05, 0.1, 0.3), V(-dir, 0), 0.62, fade);
        this.push.set(V(x - dir * 0.85, 0.3), V(dir, 0), 0.55, 1 - smooth(ev.t0 + 0.1, ev.t0 + 0.35, t));
      }
    }
    if (!ev || ev.tu !== undefined) this.friction.set(V(0, 0), V(1, 0), 0, 0);
    this.crate.position.x = x;
    this.crate.rotation.z = -dir * slide * 0.04;
    this.blob.position.x = x;
    const dp = this.dust.geometry.attributes.position;
    const age = ev && ev.tu === undefined ? t - ev.t0 : 9;
    this.dustSeed.forEach(([a, b, c], i) => {
      const s = (age * (0.6 + a) + b) % 0.6;
      const live = age < (ev ? ev.t1 - ev.t0 : 0) + 0.3;
      dp.setXYZ(i, live ? x - dir * (0.25 + s * 0.6) : 0, live ? 0.08 + s * (0.3 + c * 0.3) - s * s : -9, (c - 0.5) * 0.5);
    });
    dp.needsUpdate = true;
    this.dust.material.opacity = slide * 0.8;
  }
}

export class Elastic extends Station {
  constructor(color) {
    super(color);
    this.add(new THREE.CylinderGeometry(0.4, 0.44, 0.08, 32), this.steel, 0, 0.04, 0);
    const pts = [];
    const turns = 7;
    for (let i = 0; i <= turns * 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      pts.push(V(Math.cos(a) * 0.24, i / (turns * 24), Math.sin(a) * 0.24));
    }
    this.coil = this.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), turns * 24, 0.035, 8), this.accent, 0, 0.08, 0);
    this.plate = this.add(new THREE.CylinderGeometry(0.34, 0.34, 0.06, 32), this.steel, 0, 0.9, 0);
    this.ball = this.add(new THREE.SphereGeometry(0.22, 32, 20), new THREE.MeshStandardMaterial({ color: "#ffd23f", roughness: 0.4 }), 0, 1.15, 0);
    this.blob = this.shadow(0.5);
    this.elastic = this.arrow(color, "ELASTIC");
    this.push = this.arrow("#ffffff", "PUSH", "tail");
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
    this.coil.scale.y = H0 - c;
    this.plate.position.y = top + 0.03;
    this.ball.position.y = top + 0.06 + 0.22 + fly;
    this.blob.scale.setScalar(1 - Math.min(0.5, fly * 0.4));
    this.elastic.set(V(0.48, top - 0.1), V(0, 1), 0.25 + 1.6 * Math.max(0, c), smooth(0.03, 0.08, c));
    this.push.set(V(0, top + 0.95 + 0.4 * (1 - load)), V(0, -1), 0.45, load > 0 && load < 1 ? 1 : 0);
  }
}

export class Buoyancy extends Station {
  constructor(color) {
    super(color);
    this.boat = new THREE.Group();
    this.group.add(this.boat);
    const hull = new THREE.Shape();
    hull.moveTo(-0.62, 0.12);
    hull.lineTo(0.72, 0.12);
    hull.quadraticCurveTo(0.55, -0.16, 0.3, -0.18);
    hull.lineTo(-0.45, -0.18);
    hull.quadraticCurveTo(-0.62, -0.1, -0.62, 0.12);
    const red = new THREE.MeshStandardMaterial({ color: "#d8452e", roughness: 0.5 });
    this.add(new THREE.ExtrudeGeometry(hull, { depth: 0.4, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2 }).translate(0, 0, -0.2), red, 0, 0, 0, this.boat);
    this.add(new THREE.BoxGeometry(1.2, 0.04, 0.38), this.wood, 0.03, 0.13, 0, this.boat);
    this.add(new THREE.CylinderGeometry(0.025, 0.025, 1.0, 8).translate(0, 0.5, 0), this.wood, -0.05, 0.13, 0, this.boat);
    const sail = new THREE.Shape();
    sail.moveTo(0, 0);
    sail.lineTo(0.58, 0);
    sail.lineTo(0, 0.75);
    this.add(new THREE.ShapeGeometry(sail), new THREE.MeshStandardMaterial({ color: "#f6f1e4", roughness: 0.6, side: THREE.DoubleSide }), -0.02, 0.32, 0.01, this.boat);
    this.add(new THREE.PlaneGeometry(0.22, 0.12).translate(0.11, 0, 0), new THREE.MeshStandardMaterial({ color, roughness: 0.6, side: THREE.DoubleSide }), -0.05, 1.07, 0, this.boat);
    const ring = new THREE.MeshBasicMaterial({ color: "#d8f2ff", transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.rings = [0, 1].map(() => this.add(new THREE.RingGeometry(0.96, 1, 64).rotateX(-Math.PI / 2), ring.clone(), 0.05, 0.035, 0));
    this.boat.scale.setScalar(1.2);
    this.lift = this.arrow(color, "BUOYANCY");
    this.weight = this.arrow("#ff5d5d", "GRAVITY");
    this.push = this.arrow("#ffffff", "PUSH", "tail");
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
    this.boat.position.y = -d;
    this.boat.rotation.z = Math.sin(t * 1.7) * 0.04 + d * 0.15;
    this.boat.rotation.x = Math.sin(t * 1.3) * 0.03;
    this.rings.forEach((r, k) => {
      const age = rip - k * 0.25;
      const on = age > 0 && age < 1.6;
      r.visible = on;
      r.scale.setScalar(0.7 + age * 1.1);
      r.material.opacity = on ? 0.6 * (1 - age / 1.6) : 0;
    });
    this.lift.set(V(0.38, 0.12 - d, 0.3), V(0, 1), 0.5 + 1.5 * Math.max(0, d));
    this.weight.set(V(-0.3, 0.12 - d, 0.3), V(0, -1), 0.5);
    this.push.set(V(0.25, 1.05 - d + 0.3 * (1 - load)), V(0, -1), 0.45, load > 0 && load < 1 ? 1 : 0);
  }
}

function magnetTexture(letter, color) {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 64;
  const g = c.getContext("2d");
  g.fillStyle = color;
  g.fillRect(0, 0, 128, 64);
  g.fillStyle = "#ffffff";
  g.font = "800 48px 'Avenir Next Condensed'";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(letter, 64, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Magnetism extends Station {
  constructor(color) {
    super(color);
    const TOP = 0.74;
    this.top = TOP;
    this.add(new THREE.BoxGeometry(2.3, 0.08, 0.95), this.wood, 0, TOP - 0.04, 0);
    for (const x of [-0.85, 0.85]) {
      for (const s of [-1, 1]) {
        const leg = this.add(new THREE.BoxGeometry(0.08, 0.82, 0.08), this.wood, x, 0.35, s * 0.25);
        leg.rotation.x = s * 0.45;
      }
    }
    this.add(new THREE.BoxGeometry(2.3, 0.06, 0.28), this.wood, 0, 0.42, -0.75);
    const half = new THREE.BoxGeometry(0.3, 0.16, 0.18);
    const mats = [["N", "#e0413a"], ["S", "#2f6ee0"]].map(([l, c]) => {
      const side = new THREE.MeshStandardMaterial({ color: c, roughness: 0.4 });
      const face = new THREE.MeshStandardMaterial({ map: magnetTexture(l, c), roughness: 0.4 });
      return [side, side, side, side, face, side];
    });
    // Each magnet: S half on the left, N half on the right; flipping turns it end for end.
    this.magnets = [0, 1].map(() => {
      const g = new THREE.Group();
      this.add(half, mats[1], -0.15, 0, 0, g);
      this.add(half, mats[0], 0.15, 0, 0, g);
      g.position.y = TOP + 0.08;
      this.group.add(g);
      return g;
    });
    this.pullL = this.arrow(color, "ATTRACT");
    this.pullR = this.arrow(color, "");
    // The field: dots streaming from N to S along six arcs across the gap.
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6 * 14 * 3), 3));
    this.field = new THREE.Points(geo, new THREE.PointsMaterial({ color, size: 0.07, transparent: true, depthWrite: false }));
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
    const jig = beat.kick * 0.01;
    m0.position.z = jig;
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

function canopyTexture(color) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 8;
  const g = c.getContext("2d");
  for (let k = 0; k < 8; k++) {
    g.fillStyle = k % 2 ? "#f6f1e4" : color;
    g.fillRect(k * 32, 0, 32, 8);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Drag extends Station {
  constructor(color) {
    super(color);
    this.chute = new THREE.Group();
    this.group.add(this.chute);
    this.canopy = this.add(new THREE.SphereGeometry(0.55, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2.3), new THREE.MeshStandardMaterial({ map: canopyTexture("#ff7a3d"), roughness: 0.7, side: THREE.DoubleSide }), 0, 0.75, 0, this.chute);
    this.crate = this.add(new THREE.BoxGeometry(0.24, 0.22, 0.24), new THREE.MeshStandardMaterial({ color: "#8a6a4a", roughness: 0.7 }), 0, 0.11, 0, this.chute);
    const n = 8;
    const geo = new THREE.BufferGeometry().setFromPoints(Array.from({ length: n * 2 }, () => V(0, 0)));
    this.strings = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: "#f0e6d0" }));
    this.chute.add(this.strings);
    this.blob = this.shadow(0.45);
    // A windsock on a pole beside the landing spot.
    this.add(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 8).translate(0, 0.8, 0), this.steel, 0.85, 0, -0.3);
    this.sock = this.add(new THREE.ConeGeometry(0.1, 0.5, 16, 1, true).rotateZ(Math.PI / 2).translate(0.25, 0, 0), new THREE.MeshStandardMaterial({ map: canopyTexture("#ff4f3d"), side: THREE.DoubleSide, roughness: 0.7 }), 0.85, 1.55, -0.3);
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
    this.canopy.scale.set(0.35 + 0.65 * open, 0.5 + 0.5 * open, 0.35 + 0.65 * open);
    this.canopy.position.y = 0.45 + 0.4 * open;
    const p = this.strings.geometry.attributes.position;
    const rim = 0.55 * Math.sin(Math.PI / 2.3) * (0.35 + 0.65 * open);
    const rimY = this.canopy.position.y + 0.55 * Math.cos(Math.PI / 2.3) * (0.5 + 0.5 * open);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      p.setXYZ(k * 2, Math.cos(a) * rim, rimY, Math.sin(a) * rim);
      p.setXYZ(k * 2 + 1, Math.cos(a) * 0.1, 0.22, Math.sin(a) * 0.1);
    }
    p.needsUpdate = true;
    this.blob.material.opacity = 0.8 * show * (1 - Math.min(1, y / 2.5));
    this.sock.rotation.y = Math.sin(t * 0.8) * 0.4;
    this.sock.rotation.z = Math.sin(t * 2.3) * 0.08;
    const falling = y > 0.01;
    const drag = falling ? Math.min(1.3, 0.55 * Math.pow(v / VT, 2) * (0.15 + 0.85 * open)) : 0;
    this.drag.set(V(0, y + this.canopy.position.y + 0.3 * open + 0.05), V(0, 1), drag, show);
    this.weight.set(V(0.0, y - 0.02), V(0, -1), falling ? 0.55 : 0, show);
  }
}

export const BUILDERS = [Gravity, Friction, Elastic, Buoyancy, Magnetism, Drag];
