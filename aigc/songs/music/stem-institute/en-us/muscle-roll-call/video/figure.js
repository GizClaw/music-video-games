import * as THREE from "three";
import { MUSCLES, TENDON } from "./constants.js";

// Metres: the figure stands about 1.8 tall with its soles at y = 0, facing +z.
// Side 0 is its right (screen left when it faces the camera).
const THIGH = 0.42;
const SHIN = 0.42;
const ANKLE = 0.08;
const UPPER = 0.28;
const FORE = 0.25;
const HIP_X = 0.095;
const HIPS_UP = 0.03;
const TOE = 0.13;

const capsule = (r, len) => new THREE.CapsuleGeometry(r, len, 6, 16);
const UP = new THREE.Vector3(0, 1, 0);

/** Point a unit-height, y-aligned mesh from a to b (both in its parent's space). */
function strap(mesh, a, b, width) {
  const d = new THREE.Vector3().subVectors(b, a);
  const len = d.length();
  mesh.position.copy(a).addScaledVector(d, 0.5);
  mesh.quaternion.setFromUnitVectors(UP, d.multiplyScalar(1 / Math.max(len, 1e-6)));
  mesh.scale.set(width, len, width);
}

export class Figure {
  constructor() {
    this.root = new THREE.Group();
    this.skin = new THREE.MeshStandardMaterial({ color: "#c9bdb4", roughness: 0.62, metalness: 0.0 });
    this.shoe = new THREE.MeshStandardMaterial({ color: "#ff5a3d", roughness: 0.5 });
    this.band = new THREE.MeshStandardMaterial({ color: "#2cade4", roughness: 0.5 });
    this.mats = Object.fromEntries(Object.entries(MUSCLES).map(([k, m]) => [k, new THREE.MeshStandardMaterial({ color: m.color, roughness: 0.38, metalness: 0.05, emissive: m.color, emissiveIntensity: 0 })]));
    this.base = Object.fromEntries(Object.entries(MUSCLES).map(([k, m]) => [k, new THREE.Color(m.color)]));
    this.idle = new THREE.Color("#b0646e");
    this.unit = new THREE.SphereGeometry(0.5, 22, 16);
    this.muscles = {};
    this.tmp = new THREE.Vector3();

    this.hips = new THREE.Group();
    this.root.add(this.hips);
    this.add(new THREE.SphereGeometry(0.15, 24, 16), this.skin, this.hips).scale.set(1.05, 0.72, 0.76);
    this.abdomen = new THREE.Group();
    this.abdomen.position.y = 0.06;
    this.hips.add(this.abdomen);
    this.add(capsule(0.125, 0.1), this.skin, this.abdomen, 0, 0.1, 0).scale.set(1, 1, 0.76);
    this.abs = [];
    for (let r = 0; r < 3; r++) for (const s of [-1, 1]) this.abs.push(this.muscle("abs", null, this.abdomen, s * 0.046, 0.03 + r * 0.064, 0.09, 0.088, 0.064, 0.026));
    this.chest = new THREE.Group();
    this.chest.position.y = 0.2;
    this.abdomen.add(this.chest);
    this.add(new THREE.SphereGeometry(0.19, 28, 18), this.skin, this.chest, 0, 0.1, 0).scale.set(1.02, 0.95, 0.66);
    this.head = new THREE.Group();
    this.head.position.y = 0.29;
    this.chest.add(this.head);
    this.add(capsule(0.05, 0.05), this.skin, this.head, 0, 0.03, 0);
    this.add(new THREE.SphereGeometry(0.11, 28, 20), this.skin, this.head, 0, 0.17, 0.005).scale.set(0.9, 1.08, 1.0);
    this.add(new THREE.TorusGeometry(0.1, 0.017, 10, 32).rotateX(Math.PI / 2), this.band, this.head, 0, 0.225, 0.005).scale.set(0.92, 1, 1.0);
    const eye = new THREE.MeshStandardMaterial({ color: "#1a1d2a", roughness: 0.3 });
    for (const s of [-1, 1]) this.add(new THREE.SphereGeometry(0.014, 10, 8), eye, this.head, s * 0.035, 0.18, 0.1);

    this.iron = new THREE.MeshStandardMaterial({ color: "#3a3f4c", metalness: 0.7, roughness: 0.35 });
    this.plate = new THREE.MeshStandardMaterial({ color: "#2cade4", metalness: 0.3, roughness: 0.4 });
    this.arms = [0, 1].map((side) => this.buildArm(side));
    this.legs = [0, 1].map((side) => this.buildLeg(side));
    this.buildTendons();
  }

  add(geo, mat, parent, x = 0, y = 0, z = 0) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }

  /** A muscle belly: an ellipsoid that shortens and thickens as it contracts. */
  muscle(group, side, parent, x, y, z, sx, sy, sz) {
    const mesh = this.add(this.unit, this.mats[group], parent, x, y, z);
    mesh.scale.set(sx, sy, sz);
    const m = { mesh, group, pos: mesh.position.clone(), size: [sx, sy, sz] };
    if (side !== null) this.muscles[`${group}${side}`] = m;
    return m;
  }

  buildArm(side) {
    const s = side ? 1 : -1;
    const shoulder = new THREE.Group();
    shoulder.position.set(s * 0.2, 0.2, 0);
    this.chest.add(shoulder);
    this.add(new THREE.SphereGeometry(0.055, 18, 12), this.skin, shoulder);
    const upper = new THREE.Group();
    upper.rotation.order = "ZXY";
    shoulder.add(upper);
    this.add(capsule(0.045, UPPER - 0.09), this.skin, upper, 0, -UPPER / 2, 0);
    this.muscle("deltoid", side, upper, s * 0.014, -0.04, 0, 0.14, 0.16, 0.135);
    this.muscle("biceps", side, upper, 0, -0.145, 0.036, 0.09, 0.21, 0.08);
    this.muscle("triceps", side, upper, 0, -0.14, -0.038, 0.09, 0.22, 0.08);
    const elbow = new THREE.Group();
    elbow.position.y = -UPPER;
    upper.add(elbow);
    this.add(new THREE.SphereGeometry(0.042, 14, 10), this.skin, elbow);
    this.add(capsule(0.038, FORE - 0.08), this.skin, elbow, 0, -FORE / 2, 0);
    const hand = new THREE.Group();
    hand.position.y = -FORE;
    elbow.add(hand);
    this.add(new THREE.SphereGeometry(0.045, 14, 10), this.skin, hand, 0, -0.04, 0).scale.set(0.8, 1.15, 0.62);
    this.add(new THREE.TorusGeometry(0.04, 0.012, 8, 20).rotateX(Math.PI / 2), this.band, hand, 0, 0.01, 0);
    const bell = new THREE.Group();
    bell.position.set(0, -0.05, 0.005);
    hand.add(bell);
    this.add(new THREE.CylinderGeometry(0.012, 0.012, 0.17, 10).rotateZ(Math.PI / 2), this.iron, bell);
    for (const dx of [-0.085, 0.085]) this.add(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 6).rotateZ(Math.PI / 2), this.plate, bell, dx, 0, 0);
    const ring = this.add(new THREE.SphereGeometry(0.07, 16, 12), this.jointMat(), elbow);
    return { shoulder, upper, elbow, hand, bell, ring, s };
  }

  buildLeg(side) {
    const s = side ? 1 : -1;
    const thigh = new THREE.Group();
    thigh.position.set(s * HIP_X, -HIPS_UP, 0);
    this.hips.add(thigh);
    this.add(capsule(0.068, THIGH - 0.12), this.skin, thigh, 0, -THIGH / 2, 0);
    this.muscle("quads", side, thigh, 0, -0.2, 0.04, 0.135, 0.34, 0.09);
    this.muscle("hams", side, thigh, 0, -0.21, -0.04, 0.125, 0.32, 0.085);
    const knee = new THREE.Group();
    knee.position.y = -THIGH;
    thigh.add(knee);
    this.add(new THREE.SphereGeometry(0.056, 16, 12), this.skin, knee);
    this.add(capsule(0.05, SHIN - 0.1), this.skin, knee, 0, -SHIN / 2, 0);
    this.muscle("calves", side, knee, 0, -0.13, -0.042, 0.105, 0.21, 0.09);
    const foot = new THREE.Group();
    foot.position.y = -SHIN;
    knee.add(foot);
    this.add(new THREE.SphereGeometry(0.045, 12, 8), this.skin, foot);
    this.add(capsule(0.045, 0.14).rotateX(Math.PI / 2), this.shoe, foot, 0, -0.035, 0.05).scale.set(1.05, 0.8, 1);
    const ring = this.add(new THREE.SphereGeometry(0.085, 16, 12), this.jointMat(), knee);
    return { thigh, knee, foot, ring, s };
  }

  jointMat() {
    this.joint ??= new THREE.MeshStandardMaterial({ color: "#ffb03d", emissive: "#ff9a3d", emissiveIntensity: 0.8, transparent: true, opacity: 0, depthWrite: false });
    return this.joint;
  }

  buildTendons() {
    this.tendonMat = new THREE.MeshStandardMaterial({ color: TENDON, roughness: 0.6, emissive: TENDON, emissiveIntensity: 0 });
    this.tendonIdle = this.skin.color.clone();
    this.tendonLit = new THREE.Color(TENDON);
    const cord = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
    this.tendons = [];
    for (const a of this.arms) {
      this.tendons.push([a.upper, [0, -0.235, 0.035], a.elbow, [0, -0.045, 0.03], 0.013]);
      this.tendons.push([a.upper, [0, -0.24, -0.04], a.elbow, [0, 0.0, -0.045], 0.013]);
    }
    for (const l of this.legs) {
      this.tendons.push([l.thigh, [0, -0.36, 0.06], l.knee, [0, -0.07, 0.05], 0.018]);
      this.tendons.push([l.knee, [0, -0.24, -0.042], l.foot, [0, -0.04, -0.05], 0.016]);
    }
    this.tendons = this.tendons.map(([pa, a, pb, b, w]) => {
      const mesh = new THREE.Mesh(cord, this.tendonMat);
      this.root.add(mesh);
      return { mesh, pa, a: new THREE.Vector3(...a), pb, b: new THREE.Vector3(...b), w };
    });
  }

  /**
   * p: { x, y, yaw, squat, stance, lean, crunch, twist, bend, heel, nod,
   *      arms: [{ raise, fwd, elbow, roll }] ×2, legs: [{ lift, knee }] ×2, bells }
   */
  pose(p) {
    const a = p.squat * 0.95;
    const heel = p.heel * 0.6;
    const lift = TOE * Math.sin(heel);
    this.root.position.set(p.x, 0, 0);
    this.root.rotation.y = p.yaw;
    this.hips.position.set(0, ANKLE + (THIGH + SHIN) * Math.cos(a) * Math.cos(p.stance) + HIPS_UP + lift + p.y, -Math.sin(a) * 0.06);
    this.hips.rotation.set(p.lean * 0.25, p.twist * 0.3, p.bend * 0.2);
    this.abdomen.rotation.set(p.lean * 0.4 + p.crunch * 0.6, p.twist * 0.35, p.bend * 0.4);
    this.chest.rotation.set(p.lean * 0.35 + p.crunch * 0.4, p.twist * 0.35, p.bend * 0.4);
    this.head.rotation.set(p.nod - (p.lean + p.crunch) * 0.4, 0, -p.bend * 0.3);
    this.legs.forEach((l, i) => {
      const q = p.legs[i];
      l.thigh.rotation.set(-a - q.lift - p.lean * 0.25, 0, l.s * p.stance - p.bend * 0.2);
      l.knee.rotation.set(2 * a + q.knee, 0, 0);
      l.foot.rotation.set(-a - q.knee + q.lift + heel, 0, -l.s * p.stance);
    });
    this.arms.forEach((arm, i) => {
      const q = p.arms[i];
      arm.upper.rotation.set(-q.fwd, arm.s * q.roll * (Math.PI / 2), arm.s * q.raise);
      arm.elbow.rotation.set(-q.elbow, 0, 0);
      arm.bell.visible = p.bells > 0.01;
      arm.bell.scale.setScalar(Math.max(0.001, p.bells));
    });
  }

  /** acts: contraction per muscle key (e.g. biceps0), abs; glow per group; tendon and joint glow. */
  flex(acts, glow, tendon, joint) {
    for (const [key, m] of Object.entries(this.muscles)) this.shape(m, acts[key] || 0);
    for (const m of this.abs) this.shape(m, acts.abs || 0, true);
    for (const [g, mat] of Object.entries(this.mats)) {
      const k = glow[g] || 0;
      mat.color.copy(this.idle).lerp(this.base[g], 0.45 + 0.55 * k);
      mat.emissiveIntensity = 0.05 + k * 0.45;
    }
    this.root.updateMatrixWorld(true);
    const local = (obj, v) => this.root.worldToLocal(obj.localToWorld(this.tmp.copy(v)).clone());
    for (const td of this.tendons) strap(td.mesh, local(td.pa, td.a), local(td.pb, td.b), td.w * (0.7 + tendon * 0.8));
    this.tendonMat.emissiveIntensity = tendon * 0.9;
    this.tendonMat.color.copy(this.tendonIdle).lerp(this.tendonLit, tendon);
    this.joint.opacity = joint * 0.55;
    for (const r of [...this.arms, ...this.legs]) r.ring.visible = joint > 0.01;
  }

  shape(m, c, pad = false) {
    const [sx, sy, sz] = m.size;
    if (pad) {
      m.mesh.scale.set(sx * (1 + 0.15 * c), sy * (1 - 0.1 * c), sz * (1 + 0.8 * c));
      return;
    }
    m.mesh.scale.set(sx * (1 + 0.42 * c), sy * (1 - 0.3 * c), sz * (1 + 0.42 * c));
    m.mesh.position.set(m.pos.x, m.pos.y + sy * 0.15 * c, m.pos.z);
  }

  world(key, out = new THREE.Vector3()) {
    const m = key === "abs" ? this.abs[2] : this.muscles[key];
    return m.mesh.getWorldPosition(out);
  }

  /** Span of a muscle along the limb, as two world points. */
  ends(key, a = new THREE.Vector3(), b = new THREE.Vector3()) {
    const m = this.muscles[key].mesh;
    const h = 0.5;
    m.localToWorld(a.set(0, h, 0));
    m.localToWorld(b.set(0, -h, 0));
    return [a, b];
  }
}
