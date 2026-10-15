import * as THREE from "three";
import { lerp, smooth } from "@gizclaw/mvg-core/timing.js";

// Every machine fits a 2.4 × 2.2 cell with its floor at y = -0.9, and is posed
// by a single stroke value s in [0, 1].
const FLOOR = -0.9;

function prism(points, depth) {
  const s = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2 }).translate(0, 0, -depth / 2);
}

class Machine {
  constructor(color) {
    this.group = new THREE.Group();
    this.accent = new THREE.MeshStandardMaterial({ color, metalness: 0.25, roughness: 0.55, emissive: color, emissiveIntensity: 0.05 });
    this.steel = new THREE.MeshStandardMaterial({ color: "#8a93b0", metalness: 0.75, roughness: 0.32 });
    this.wood = new THREE.MeshStandardMaterial({ color: "#b07a4a", metalness: 0.05, roughness: 0.7 });
    this.crate = new THREE.MeshStandardMaterial({ color: "#d9a35a", metalness: 0.05, roughness: 0.6 });
    this.rope = new THREE.MeshStandardMaterial({ color: "#f0e2c0", roughness: 0.9 });
    this.mats = [this.accent, this.steel, this.wood, this.crate, this.rope];
    this.base = this.mats.map((m) => m.color.clone());
    this.anchors = {};
  }

  add(geo, mat, x = 0, y = 0, z = 0, parent = this.group) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }

  /** lit 0 renders a dim silhouette, 1 full colour; glow pulses the accent. */
  shade(lit, glow) {
    this.mats.forEach((m, i) => m.color.copy(this.base[i]).multiplyScalar(lerp(0.18, 1, lit)));
    this.accent.emissiveIntensity = (0.05 + glow * 0.55) * lit;
  }
}

export class Lever extends Machine {
  constructor(color) {
    super(color);
    this.add(prism([[-0.32, 0], [0.32, 0], [0, 0.5]], 0.45), this.accent, 0, FLOOR);
    this.pivot = new THREE.Group();
    this.pivot.position.set(0, FLOOR + 0.54, 0);
    this.group.add(this.pivot);
    this.add(new THREE.BoxGeometry(2.3, 0.08, 0.36), this.wood, 0, 0, 0, this.pivot);
    this.load = this.add(new THREE.BoxGeometry(0.42, 0.42, 0.42), this.crate, -0.88, 0.25, 0, this.pivot);
    this.push = this.add(new THREE.ConeGeometry(0.12, 0.3, 16).rotateZ(Math.PI), this.accent, 0.95, 0.3, 0, this.pivot);
    this.anchors = { fulcrum: [0, FLOOR - 0.12], load: [-0.88, 0.25], effort: [0.95, 0.5] };
  }

  pose(s) {
    const a = lerp(0.24, -0.24, s);
    this.pivot.rotation.z = a;
    this.push.position.y = 0.3 + (1 - s) * 0.15;
    this.anchors.load = [-0.88 * Math.cos(a) - 0.3 * Math.sin(a), FLOOR + 0.54 - 0.88 * Math.sin(a) + 0.5];
    this.anchors.effort = [0.95 * Math.cos(a), FLOOR + 0.54 + 0.95 * Math.sin(a) + 0.62];
  }
}

export class Pulley extends Machine {
  constructor(color) {
    super(color);
    this.add(new THREE.BoxGeometry(1.5, 0.1, 0.3), this.steel, 0, 0.95);
    this.add(new THREE.BoxGeometry(0.08, 0.35, 0.08), this.steel, 0, 0.78);
    this.wheel = new THREE.Group();
    this.wheel.position.set(0, 0.55, 0);
    this.group.add(this.wheel);
    this.add(new THREE.CylinderGeometry(0.32, 0.32, 0.1, 40).rotateX(Math.PI / 2), this.accent, 0, 0, 0, this.wheel);
    this.add(new THREE.TorusGeometry(0.32, 0.035, 10, 48), this.steel, 0, 0, 0, this.wheel);
    for (let k = 0; k < 3; k++) this.add(new THREE.BoxGeometry(0.58, 0.04, 0.12).rotateZ((k * Math.PI) / 3), this.steel, 0, 0, 0.02, this.wheel);
    const unit = new THREE.CylinderGeometry(0.018, 0.018, 1, 8).translate(0, -0.5, 0);
    this.ropeL = this.add(unit, this.rope, -0.32, 0.55);
    this.ropeR = this.add(unit, this.rope, 0.32, 0.55);
    this.load = this.add(new THREE.BoxGeometry(0.46, 0.46, 0.46), this.crate, -0.32, 0);
    this.handle = this.add(new THREE.TorusGeometry(0.09, 0.025, 8, 24), this.accent, 0.32, 0);
    this.add(new THREE.BoxGeometry(1.8, 0.06, 0.6), this.steel, 0, FLOOR);
  }

  pose(s) {
    const lift = s * 0.9;
    const loadY = FLOOR + 0.26 + lift;
    const handleY = 0.0 - lift * 0.9;
    this.load.position.y = loadY;
    this.handle.position.y = handleY;
    this.ropeL.scale.y = 0.55 - (loadY + 0.23);
    this.ropeR.scale.y = 0.55 - (handleY + 0.09);
    this.wheel.rotation.z = lift / 0.32;
    this.anchors = { wheel: [0.55, 0.55], rope: [0.48, handleY + 0.45], load: [-0.85, loadY], pull: [0.62, handleY - 0.12], up: [-0.32, loadY + 0.45] };
  }
}

export class WheelAxle extends Machine {
  constructor(color) {
    super(color);
    this.add(new THREE.BoxGeometry(0.1, 1.2, 0.1), this.steel, 0, FLOOR + 0.6, -0.4);
    this.spin = new THREE.Group();
    this.spin.position.set(0, 0.3, 0);
    this.group.add(this.spin);
    this.add(new THREE.TorusGeometry(0.72, 0.05, 12, 64), this.accent, 0, 0, 0.18, this.spin);
    for (let k = 0; k < 4; k++) this.add(new THREE.BoxGeometry(1.42, 0.05, 0.05).rotateZ((k * Math.PI) / 4), this.accent, 0, 0, 0.18, this.spin);
    this.add(new THREE.CylinderGeometry(0.16, 0.16, 0.75, 24).rotateX(Math.PI / 2), this.steel, 0, 0, 0, this.spin);
    this.add(new THREE.SphereGeometry(0.1, 16, 12), this.accent, 0, 0, 0.22, this.spin);
    const unit = new THREE.CylinderGeometry(0.018, 0.018, 1, 8).translate(0, -0.5, 0);
    this.ropeD = this.add(unit, this.rope, -0.16, 0.3, -0.15);
    this.bucket = this.add(new THREE.CylinderGeometry(0.2, 0.15, 0.3, 20), this.crate, -0.16, 0, -0.15);
    this.add(new THREE.BoxGeometry(1.4, 0.06, 0.8), this.steel, 0, FLOOR);
  }

  pose(s) {
    const turn = s * 3.2;
    this.spin.rotation.z = turn;
    const y = FLOOR + 0.2 + turn * 0.16;
    this.bucket.position.y = y;
    this.ropeD.scale.y = 0.3 - (y + 0.15);
    this.anchors = { wheel: [0.82, 0.85], axle: [-0.55, 0.3], load: [-0.6, y] };
  }
}

export class Ramp extends Machine {
  constructor(color) {
    super(color);
    // A broad lit face: darker paint keeps it under the bloom threshold.
    this.accent.color.multiplyScalar(0.5);
    this.base[0] = this.accent.color.clone();
    this.p0 = new THREE.Vector2(-1.05, FLOOR);
    this.p1 = new THREE.Vector2(1.05, FLOOR + 1.1);
    this.add(prism([[this.p0.x, this.p0.y], [this.p1.x, FLOOR], [this.p1.x, this.p1.y]], 0.7), this.accent);
    this.slope = Math.atan2(this.p1.y - this.p0.y, this.p1.x - this.p0.x);
    this.box = this.add(new THREE.BoxGeometry(0.38, 0.38, 0.38), this.crate);
    this.box.rotation.z = this.slope;
    this.add(new THREE.BoxGeometry(0.06, 1.12, 0.06), this.steel, this.p1.x + 0.08, FLOOR + 0.56, 0.3);
  }

  pose(s) {
    const n = new THREE.Vector2(-Math.sin(this.slope), Math.cos(this.slope)).multiplyScalar(0.2);
    const p = this.p0.clone().lerp(this.p1, 0.12 + s * 0.76).add(n);
    this.box.position.set(p.x, p.y, 0);
    this.anchors = { slope: [0.05, FLOOR + 0.2], height: [this.p1.x + 0.32, FLOOR + 0.55], load: [p.x - 0.1, p.y + 0.4] };
  }
}

export class Wedge extends Machine {
  constructor(color) {
    super(color);
    this.wood.side = THREE.DoubleSide;
    const half = new THREE.CylinderGeometry(0.42, 0.42, 0.8, 32, 1, false, 0, Math.PI);
    this.left = this.add(half, this.wood, 0, FLOOR + 0.4);
    this.right = this.add(half, this.wood, 0, FLOOR + 0.4);
    this.left.rotation.y = Math.PI;
    this.wedge = this.add(prism([[0, -0.5], [-0.24, 0.32], [0.24, 0.32]], 0.4), this.accent);
    this.add(new THREE.BoxGeometry(0.1, 0.5, 0.1), this.steel, 0, 0, 0, this.wedge).position.set(0, 0.55, 0);
    this.add(new THREE.BoxGeometry(1.6, 0.06, 0.8), this.steel, 0, FLOOR);
  }

  pose(s) {
    const y = lerp(0.85, -0.05, smooth(0, 0.7, s));
    this.wedge.position.y = y;
    const split = smooth(0.45, 0.85, s);
    this.left.position.x = -split * 0.32;
    this.right.position.x = split * 0.32;
    // The left half is turned about y, which mirrors its z tilt.
    this.left.rotation.z = -split * 0.2;
    this.right.rotation.z = -split * 0.2;
    this.anchors = { wedge: [0.55, y + 0.1], log: [-0.75, FLOOR + 0.4] };
  }
}

export class Screw extends Machine {
  constructor(color) {
    super(color);
    this.spin = new THREE.Group();
    this.group.add(this.spin);
    this.add(new THREE.CylinderGeometry(0.16, 0.16, 1.7, 24), this.steel, 0, -0.05, 0, this.spin);
    const pitch = 0.17;
    const turns = 9;
    const pts = [];
    for (let i = 0; i <= turns * 32; i++) {
      const a = (i / 32) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * 0.2, -0.85 + (i / 32) * pitch, Math.sin(a) * 0.2));
    }
    this.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), turns * 32, 0.045, 6), this.accent, 0, 0, 0, this.spin);
    this.add(new THREE.CylinderGeometry(0.34, 0.34, 0.12, 6), this.steel, 0, 0.85, 0, this.spin);
    this.nut = this.add(new THREE.CylinderGeometry(0.38, 0.38, 0.2, 6), this.crate, 0, 0);
    this.add(new THREE.BoxGeometry(1.2, 0.06, 0.8), this.steel, 0, FLOOR);
    this.pitch = pitch;
  }

  pose(s) {
    const rise = s * 1.1;
    this.spin.rotation.y = (rise / this.pitch) * Math.PI * 2 * 0.25;
    this.nut.position.y = -0.62 + rise;
    this.anchors = { thread: [0.6, 0.55], nut: [-0.7, -0.62 + rise] };
  }
}

export const BUILDERS = [Lever, Pulley, WheelAxle, Ramp, Wedge, Screw];
