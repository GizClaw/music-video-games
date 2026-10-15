import * as THREE from "three";
import { hash } from "@gizclaw/mvg-core/timing.js";

// Metres: the skeleton stands about 1.86 tall with its soles at y = 0, facing +z.
// Side 0 is the skeleton's right (screen left when it faces the camera).
const THIGH = 0.45;
const SHIN = 0.43;
const ANKLE = 0.06;
const UPPER = 0.3;
const FORE = 0.27;
const HIP_X = 0.1;
const LINKS = 12;
const LINK_H = 0.045;
const CHEST_LINK = 6;
const HIPS_UP = 0.04;

const capsule = (r, len) => new THREE.CapsuleGeometry(r, len, 4, 10);
const UP = new THREE.Vector3(0, 1, 0);

/** Point a unit-height, y-aligned mesh from a to b (both in its parent's space). */
function strap(mesh, a, b, width = 1) {
  const d = new THREE.Vector3().subVectors(b, a);
  const len = d.length();
  mesh.position.copy(a).addScaledVector(d, 0.5);
  mesh.quaternion.setFromUnitVectors(UP, d.multiplyScalar(1 / Math.max(len, 1e-6)));
  mesh.scale.set(width, len, width);
}

export class Skeleton {
  constructor() {
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    const bone = new THREE.MeshStandardMaterial({ color: "#e6dcc4", roughness: 0.55, metalness: 0.0, emissive: "#ffffff", emissiveIntensity: 0 });
    const names = ["skull", "ribs", "spine", "clavicle0", "clavicle1", "pelvis", "femur", "arm", "shin", "shoulder", "elbow", "hip", "knee"];
    this.mats = Object.fromEntries(names.map((n) => [n, bone.clone()]));
    this.mats.skull.transparent = true;
    this.dark = new THREE.MeshStandardMaterial({ color: "#120e14", roughness: 0.8 });
    this.markers = {};
    this.pieces = [];

    this.hips = new THREE.Group();
    this.body.add(this.hips);
    this.buildPelvis();
    this.buildSpine();
    this.buildChest();
    this.buildHead();
    this.arms = [0, 1].map((s) => this.buildArm(s));
    this.legs = [0, 1].map((s) => this.buildLeg(s));
    this.buildSoft();

    this.pieces.forEach((p, i) => {
      const a = hash(i * 3.1) * Math.PI * 2;
      const r = 1.6 + hash(i * 5.7) * 2.2;
      p.from = new THREE.Vector3(Math.cos(a) * r, (hash(i * 7.3) - 0.3) * 2.4, Math.sin(a) * r * 0.6 + 0.4);
      p.spin = new THREE.Euler((hash(i * 2.9) - 0.5) * 9, (hash(i * 4.1) - 0.5) * 9, (hash(i * 6.7) - 0.5) * 9);
      p.order = hash(i * 9.1);
    });
    this.tmp = new THREE.Vector3();
  }

  add(geo, mat, parent, x = 0, y = 0, z = 0, piece = true) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    parent.add(m);
    if (piece) this.pieces.push({ mesh: m, base: m.position.clone(), rot: m.rotation.clone() });
    return m;
  }

  mark(name, parent, x = 0, y = 0, z = 0) {
    const o = new THREE.Object3D();
    o.position.set(x, y, z);
    parent.add(o);
    this.markers[name] = o;
    return o;
  }

  buildPelvis() {
    const m = this.mats.pelvis;
    for (const s of [-1, 1]) {
      const wing = this.add(new THREE.SphereGeometry(0.1, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), m, this.hips, s * 0.09, 0.0, -0.01);
      wing.scale.set(0.8, 1.1, 0.25);
      wing.rotation.set(0.1, s * 0.75, s * -0.3);
      this.pieces.at(-1).rot = wing.rotation.clone();
    }
    const ring = this.add(new THREE.TorusGeometry(0.07, 0.02, 8, 28), m, this.hips, 0, -0.02, 0.03);
    ring.rotation.x = Math.PI / 2 - 0.5;
    this.pieces.at(-1).rot = ring.rotation.clone();
    this.add(new THREE.ConeGeometry(0.045, 0.12, 10).rotateX(Math.PI), m, this.hips, 0, 0.03, -0.05);
  }

  buildSpine() {
    this.links = [];
    let parent = this.hips;
    for (let k = 0; k < LINKS; k++) {
      const g = new THREE.Group();
      g.position.set(0, k === 0 ? 0.1 : LINK_H, k === 0 ? -0.04 : 0);
      parent.add(g);
      const neck = k >= LINKS - 2;
      const r = neck ? 0.022 : 0.03 + (k < 5 ? 0.006 : 0);
      const body = this.add(new THREE.CylinderGeometry(r, r, LINK_H * 0.62, 14), this.mats.spine, g, 0, LINK_H * 0.5, 0);
      const knob = this.add(new THREE.BoxGeometry(0.014, 0.02, neck ? 0.03 : 0.05), this.mats.spine, g, 0, LINK_H * 0.45, -r - 0.018);
      knob.rotation.x = 0.35;
      this.pieces.at(-1).rot = knob.rotation.clone();
      this.links.push({ g, body });
      parent = g;
    }
  }

  buildChest() {
    const chest = new THREE.Group();
    chest.position.set(0, 0, 0.0);
    this.links[CHEST_LINK].g.add(chest);
    this.chest = chest;
    const rx = [0.1, 0.13, 0.15, 0.158, 0.155, 0.145];
    const rz = [0.08, 0.095, 0.105, 0.11, 0.11, 0.105];
    const geo = (k, s) => {
      const pts = [];
      for (let i = 0; i <= 12; i++) {
        const u = i / 12;
        const a = -Math.PI / 2 + u * (Math.PI - 0.35);
        pts.push(new THREE.Vector3(s * rx[k] * Math.cos(a), -0.075 * u, 0.075 + rz[k] * Math.sin(a)));
      }
      return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.011, 6);
    };
    for (let k = 0; k < 6; k++) for (const s of [-1, 1]) this.add(geo(k, s), this.mats.ribs, chest, 0, 0.21 - k * 0.048, 0);
    this.add(new THREE.BoxGeometry(0.035, 0.2, 0.02), this.mats.ribs, chest, 0, 0.12, 0.18);

    // Clavicles hinge at the top of the sternum; each carries its shoulder.
    this.clavicles = [0, 1].map((side) => {
      const s = side ? 1 : -1;
      const g = new THREE.Group();
      g.position.set(s * 0.02, 0.235, 0.17);
      chest.add(g);
      const end = new THREE.Vector3(s * 0.17, 0.02, -0.13);
      const bar = this.add(new THREE.CylinderGeometry(0.012, 0.014, 1, 8), this.mats[`clavicle${side}`], g);
      strap(bar, new THREE.Vector3(), end);
      this.pieces.at(-1).rot = bar.rotation.clone();
      this.pieces.at(-1).base = bar.position.clone();
      const tip = new THREE.Group();
      tip.position.copy(end);
      g.add(tip);
      this.mark(`clavicle${side}`, g, end.x * 0.5, end.y * 0.5 + 0.01, end.z * 0.5 + 0.01);
      return { g, tip };
    });
  }

  buildHead() {
    const head = new THREE.Group();
    head.position.set(0, LINK_H, 0.01);
    this.links[LINKS - 1].g.add(head);
    this.head = head;
    const m = this.mats.skull;
    const cranium = this.add(new THREE.SphereGeometry(0.115, 32, 24), m, head, 0, 0.13, 0.0);
    cranium.scale.set(0.9, 0.98, 1.08);
    this.add(new THREE.SphereGeometry(0.075, 20, 14), m, head, 0, 0.075, 0.055).scale.set(1.05, 0.9, 0.85);
    for (const s of [-1, 1]) {
      this.add(new THREE.SphereGeometry(0.03, 14, 10), this.dark, head, s * 0.042, 0.115, 0.098).scale.set(1, 1.15, 0.6);
      this.add(new THREE.SphereGeometry(0.022, 10, 8), m, head, s * 0.072, 0.075, 0.075);
    }
    this.add(new THREE.ConeGeometry(0.014, 0.03, 3).rotateX(Math.PI), this.dark, head, 0, 0.068, 0.118);
    this.jaw = new THREE.Group();
    this.jaw.position.set(0, 0.07, 0.0);
    head.add(this.jaw);
    const mandible = this.add(new THREE.TorusGeometry(0.058, 0.016, 8, 20, Math.PI), m, this.jaw, 0, -0.03, 0.035);
    mandible.rotation.set(Math.PI / 2 + 0.25, 0, Math.PI);
    this.pieces.at(-1).rot = mandible.rotation.clone();
    this.add(new THREE.BoxGeometry(0.075, 0.016, 0.02), new THREE.MeshStandardMaterial({ color: "#fff8e8", roughness: 0.4 }), this.jaw, 0, -0.01, 0.1);
    this.add(new THREE.BoxGeometry(0.075, 0.016, 0.02), new THREE.MeshStandardMaterial({ color: "#fff8e8", roughness: 0.4 }), head, 0, 0.048, 0.1);

    const bg = new THREE.SphereGeometry(0.096, 40, 28);
    const p = bg.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(p, i);
      const n = Math.sin(v.x * 140) * Math.sin(v.y * 120 + v.z * 90) * 0.006 + (Math.abs(v.x) < 0.006 ? -0.01 : 0);
      v.multiplyScalar(1 + n / 0.096);
      p.setXYZ(i, v.x, v.y, v.z);
    }
    bg.computeVertexNormals();
    this.brain = new THREE.Mesh(bg, new THREE.MeshStandardMaterial({ color: "#ff8fb0", roughness: 0.5, emissive: "#ff4f8a", emissiveIntensity: 0.25 }));
    this.brain.position.set(0, 0.14, -0.005);
    this.brain.scale.set(0.82, 0.78, 0.98);
    head.add(this.brain);
  }

  buildArm(side) {
    const s = side ? 1 : -1;
    const shoulder = new THREE.Group();
    this.clavicles[side].tip.add(shoulder);
    this.add(new THREE.SphereGeometry(0.04, 16, 12), this.mats.shoulder, shoulder);
    const upper = new THREE.Group();
    shoulder.add(upper);
    this.add(capsule(0.022, UPPER - 0.06), this.mats.arm, upper, 0, -UPPER / 2, 0);
    const elbow = new THREE.Group();
    elbow.position.y = -UPPER;
    upper.add(elbow);
    this.add(new THREE.SphereGeometry(0.03, 14, 10), this.mats.elbow, elbow);
    for (const dx of [-0.017, 0.017]) this.add(capsule(0.013, FORE - 0.05), this.mats.arm, elbow, dx, -FORE / 2, 0);
    const hand = new THREE.Group();
    hand.position.y = -FORE;
    elbow.add(hand);
    this.add(new THREE.SphereGeometry(0.032, 12, 10), this.mats.arm, hand, 0, -0.03, 0).scale.set(1, 1.1, 0.5);
    for (let f = 0; f < 4; f++) this.add(capsule(0.007, 0.05), this.mats.arm, hand, (f - 1.5) * 0.014, -0.085, 0);
    this.add(capsule(0.008, 0.035), this.mats.arm, hand, -s * 0.03, -0.05, 0.012).rotation.z = s * 0.6;
    this.pieces.at(-1).rot = new THREE.Euler(0, 0, s * 0.6);
    return { upper, elbow, s };
  }

  buildLeg(side) {
    const s = side ? 1 : -1;
    const thigh = new THREE.Group();
    thigh.position.set(s * HIP_X, -HIPS_UP, 0.0);
    this.hips.add(thigh);
    this.add(new THREE.SphereGeometry(0.042, 16, 12), this.mats.hip, thigh);
    this.add(capsule(0.03, THIGH - 0.09), this.mats.femur, thigh, 0, -THIGH / 2, 0);
    this.add(new THREE.SphereGeometry(0.036, 14, 10), this.mats.femur, thigh, 0, -THIGH + 0.04, 0).scale.set(1.4, 1, 1);
    const knee = new THREE.Group();
    knee.position.y = -THIGH;
    thigh.add(knee);
    this.add(new THREE.SphereGeometry(0.036, 14, 10), this.mats.knee, knee);
    this.add(new THREE.SphereGeometry(0.024, 12, 8), this.mats.knee, knee, 0, 0.01, 0.035).scale.set(1, 1.1, 0.55);
    this.add(capsule(0.026, SHIN - 0.08), this.mats.shin, knee, -s * 0.008, -SHIN / 2, 0);
    this.add(capsule(0.012, SHIN - 0.1), this.mats.shin, knee, s * 0.03, -SHIN / 2 - 0.01, -0.01);
    const foot = new THREE.Group();
    foot.position.y = -SHIN;
    knee.add(foot);
    this.add(new THREE.SphereGeometry(0.03, 12, 8), this.mats.shin, foot);
    this.add(capsule(0.028, 0.14).rotateX(Math.PI / 2), this.mats.shin, foot, s * 0.005, -0.035, 0.06).scale.set(1.2, 0.6, 1);
    this.mark(`hip${side}`, thigh);
    this.mark(`knee${side}`, knee, 0, 0, 0.03);
    return { thigh, knee, foot, s };
  }

  /** Heart, lungs, muscles, tendons and ligaments: hidden until the song names them. */
  buildSoft() {
    const soft = (color, opacity) => new THREE.MeshStandardMaterial({ color, roughness: 0.45, transparent: true, opacity, depthWrite: false, emissive: color, emissiveIntensity: 0.2 });
    this.organs = new THREE.Group();
    this.chest.add(this.organs);
    const red = soft("#e8364f", 0.95);
    const heart = new THREE.Group();
    heart.position.set(0.03, 0.06, 0.1);
    heart.rotation.z = -0.35;
    this.organs.add(heart);
    for (const dx of [-0.018, 0.018]) heart.add(new THREE.Mesh(new THREE.SphereGeometry(0.026, 14, 10), red).translateX(dx));
    heart.add(new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.06, 14).rotateX(Math.PI), red).translateY(-0.03));
    this.heart = heart;
    const lung = soft("#ffb0c0", 0.75);
    for (const s of [-1, 1]) {
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), lung);
      l.position.set(s * 0.075, 0.08, 0.075);
      l.scale.set(0.85, 1.55, 0.95);
      this.organs.add(l);
    }

    this.muscleMat = soft("#c83a48", 0.7);
    this.tendonMat = new THREE.MeshStandardMaterial({ color: "#f4f0ff", roughness: 0.3, emissive: "#ffffff", emissiveIntensity: 0.2 });
    this.ligMat = new THREE.MeshStandardMaterial({ color: "#ffe58a", roughness: 0.4, emissive: "#ffd24a", emissiveIntensity: 0.3 });
    const spindle = new THREE.SphereGeometry(0.5, 16, 12);
    const cord = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
    this.biceps = this.arms.map((a) => {
      const m = new THREE.Mesh(spindle, this.muscleMat);
      a.upper.add(m);
      return m;
    });
    this.quads = this.legs.map((l) => {
      const m = new THREE.Mesh(spindle, this.muscleMat);
      l.thigh.add(m);
      return m;
    });
    this.tendons = [...this.arms, ...this.legs].map(() => {
      const m = new THREE.Mesh(cord, this.tendonMat);
      this.root.add(m);
      return m;
    });
    this.ligaments = this.legs.flatMap(() => [-1, 1].map(() => {
      const m = new THREE.Mesh(cord, this.ligMat);
      this.root.add(m);
      return m;
    }));
  }

  /**
   * p: { x, y, yaw, scale, squat, stance, lean, bend, twist, nod, jaw,
   *      arms: [{ raise, fwd, elbow }] ×2, legs: [{ lift, knee }] ×2, shrug: [r, l], pop: [12] }
   */
  pose(p) {
    this.root.position.set(p.x, p.y, 0);
    this.root.rotation.y = p.yaw;
    this.root.scale.setScalar(p.scale);
    const a = p.squat * 0.95;
    const hipY = ANKLE + (THIGH + SHIN) * Math.cos(a) * Math.cos(p.stance) + HIPS_UP;
    this.hips.position.set(0, hipY, -Math.sin(a) * 0.05);
    this.hips.rotation.set(p.lean * 0.3, p.twist * 0.3, p.bend * 0.25);
    this.legs.forEach((l, i) => {
      const leg = p.legs[i];
      const s = l.s;
      l.thigh.rotation.set(-a - leg.lift - p.lean * 0.3, 0, s * p.stance - p.bend * 0.25);
      l.knee.rotation.set(2 * a + leg.knee, 0, 0);
      l.foot.rotation.set(-a - leg.knee + leg.lift, 0, -s * p.stance);
    });
    this.links.forEach((k, i) => {
      k.g.rotation.set((p.lean * 0.7) / LINKS + (i >= LINKS - 2 ? p.nod * 0.5 : 0), (p.twist * 0.7) / LINKS, (p.bend * 0.75 * Math.sin(((i + 1) / LINKS) * Math.PI * 1.4)) / LINKS * 2.2);
      const pop = p.pop[i] || 0;
      k.body.scale.set(1 + pop * 0.6, 1 + pop * 0.4, 1 + pop * 0.6);
    });
    this.head.rotation.set(p.nod * 0.6, p.twist * 0.25, -p.bend * 0.3);
    this.jaw.rotation.x = p.jaw * 0.45;
    this.clavicles.forEach((c, i) => (c.g.rotation.z = (i ? 1 : -1) * p.shrug[i] * 0.45));
    this.arms.forEach((arm, i) => {
      const q = p.arms[i];
      arm.upper.rotation.set(-q.fwd, 0, arm.s * q.raise);
      arm.elbow.rotation.set(-q.elbow, 0, 0);
    });
  }

  /** Fly-in assembly: k in [0, 1] per piece, ordered by each piece's seed. */
  assemble(progress) {
    for (const p of this.pieces) {
      const k = Math.min(1, Math.max(0, (progress - p.order * 0.85) / 0.15));
      const e = 1 - Math.pow(1 - k, 3);
      p.mesh.position.copy(p.base).addScaledVector(p.from, 1 - e);
      p.mesh.rotation.set(p.rot.x + p.spin.x * (1 - e), p.rot.y + p.spin.y * (1 - e), p.rot.z + p.spin.z * (1 - e));
      p.mesh.visible = k > 0;
    }
  }

  /** Muscles bulge as they shorten; tendons and ligaments are straps between bone anchors. */
  soft({ muscle, ligament, organs, xray }, heartBeat) {
    this.root.updateMatrixWorld(true);
    this.organs.visible = organs > 0.01;
    this.organs.scale.setScalar(0.4 + 0.6 * organs);
    this.heart.scale.setScalar(1.5 + heartBeat * 0.3);
    this.brain.visible = xray > 0.01;
    this.mats.skull.opacity = 1 - xray * 0.72;
    this.mats.skull.depthWrite = xray < 0.5;
    const local = (obj, x, y, z) => this.root.worldToLocal(obj.localToWorld(this.tmp.set(x, y, z)).clone());
    this.arms.forEach((arm, i) => {
      const bend = arm.elbow.rotation.x;
      const len = 0.21 - 0.05 * Math.min(1, -bend / 2);
      const m = this.biceps[i];
      m.visible = muscle > 0.01;
      m.position.set(0, -UPPER * 0.48, 0.034);
      m.scale.set(0.065 * (0.22 / len) * muscle, len * muscle, 0.06 * (0.22 / len) * muscle);
      const t = this.tendons[i];
      t.visible = muscle > 0.01;
      strap(t, local(arm.upper, 0, -UPPER * 0.48 - len / 2, 0.03), local(arm.elbow, 0, -0.05, 0.016), 0.012 * muscle);
    });
    this.legs.forEach((leg, i) => {
      const m = this.quads[i];
      m.visible = muscle > 0.01;
      const len = 0.34;
      m.position.set(0, -THIGH * 0.48, 0.042);
      m.scale.set(0.085 * muscle, len * muscle, 0.07 * muscle);
      const t = this.tendons[2 + i];
      t.visible = muscle > 0.01;
      strap(t, local(leg.thigh, 0, -THIGH * 0.48 - len / 2 + 0.02, 0.05), local(leg.knee, 0, -0.07, 0.03), 0.014 * muscle);
      [-1, 1].forEach((dx, j) => {
        const l = this.ligaments[i * 2 + j];
        l.visible = ligament > 0.01;
        strap(l, local(leg.thigh, dx * 0.04, -THIGH + 0.035, 0.0), local(leg.knee, dx * 0.034, -0.055, 0.0), 0.016 * ligament);
      });
    });
  }

  world(name, out = new THREE.Vector3()) {
    return this.markers[name].getWorldPosition(out);
  }
}
