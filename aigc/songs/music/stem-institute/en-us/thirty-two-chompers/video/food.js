import * as THREE from "three";
import { clamp, easeOutCubic, hash, smooth } from "@gizclaw/mvg-core/timing.js";

// Sizes in centimetres, matching the 2.5× dental model.
const CRUMBS = 36;
const GRAVITY = 60;

function appleHalf(sign) {
  const R = 3.4;
  const s = new THREE.Shape();
  s.moveTo(0, 0.9);
  for (let k = 0; k <= 12; k++) {
    const a = (sign * k * 0.6) / 12;
    s.lineTo(Math.sin(a) * R, Math.cos(a) * R);
  }
  s.lineTo(Math.sin(sign * 0.6) * 0.9, Math.cos(0.6) * 0.9);
  const geo = new THREE.ExtrudeGeometry(s, { depth: 1.1, bevelEnabled: true, bevelSize: 0.12, bevelThickness: 0.12, bevelSegments: 2, curveSegments: 4 }).translate(0, -2.2, -0.55);
  const p = geo.attributes.position;
  const col = new Float32Array(p.count * 3);
  const skin = new THREE.Color("#d8283a");
  const flesh = new THREE.Color("#d9c48e");
  for (let i = 0; i < p.count; i++) {
    const c = Math.hypot(p.getX(i), p.getY(i) + 2.2) > R - 0.08 ? skin : flesh;
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 }));
}

/** Two pieces that a bite pulls apart, plus a crumb colour. */
function build(kind) {
  const g = new THREE.Group();
  const mat = (c, r = 0.6) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
  let a;
  let b;
  let crumb;
  if (kind === "incisor") {
    a = appleHalf(-1);
    b = appleHalf(1);
    crumb = "#d9c48e";
  } else if (kind === "canine") {
    a = new THREE.Mesh(new THREE.SphereGeometry(0.95, 24, 16), mat("#a34a2a", 0.7));
    a.scale.set(1.2, 0.9, 0.9);
    g.rotation.y = -Math.PI / 2;
    b = new THREE.Group();
    const meat = new THREE.Mesh(new THREE.SphereGeometry(1.15, 24, 16), mat("#b25a30", 0.7));
    meat.scale.set(1.5, 1, 1);
    meat.position.x = 1.9;
    const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 2.6, 12).rotateZ(Math.PI / 2), mat("#f2ead8", 0.5));
    bone.position.x = 4.0;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.42, 14, 10), bone.material);
    knob.position.set(5.3, 0.28, 0);
    const knob2 = knob.clone();
    knob2.position.set(5.3, -0.28, 0);
    b.add(meat, bone, knob, knob2);
    crumb = "#c2643a";
  } else if (kind === "premolar") {
    const half = new THREE.SphereGeometry(1.25, 24, 14, -Math.PI / 2, Math.PI);
    a = new THREE.Mesh(half, mat("#8a5428", 0.45));
    b = new THREE.Mesh(half, a.material);
    a.material.side = THREE.DoubleSide;
    b.rotation.y = Math.PI;
    a.scale.set(1, 1.15, 1);
    b.scale.set(1, 1.15, 1);
    crumb = "#9a6230";
  } else {
    a = new THREE.Group();
    b = new THREE.Group();
    for (let k = 0; k < 6; k++) {
      const grain = new THREE.Mesh(new THREE.SphereGeometry(0.62, 14, 10), mat("#e8b858", 0.5));
      grain.scale.set(1.5, 0.75, 0.8);
      grain.position.set((k % 3) * 1.3 - 1.3, 0, (k < 3 ? 1 : -1) * 0.6);
      grain.rotation.y = hash(k) - 0.5;
      (k < 3 ? a : b).add(grain);
    }
    crumb = "#f4ead0";
  }
  g.add(a, b);
  return { group: g, a, b, crumb };
}

export class Pantry {
  constructor(scene, bites) {
    this.bites = bites;
    this.items = bites.map((bt) => {
      const f = build(bt.kind);
      f.root = new THREE.Group();
      f.root.add(f.group);
      scene.add(f.root);
      return f;
    });
    const n = bites.length * CRUMBS;
    this.seed = Array.from({ length: n }, (_, i) => [hash(i * 1.3) * 2 - 1, hash(i * 2.1), hash(i * 3.7) * 2 - 1, 0.6 + hash(i * 5.3)]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const col = new Float32Array(n * 3);
    bites.forEach((_, k) => {
      const c = new THREE.Color(this.items[k].crumb);
      for (let j = 0; j < CRUMBS; j++) col.set([c.r, c.g, c.b], (k * CRUMBS + j) * 3);
    });
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    this.crumbs = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.55, vertexColors: true, transparent: true, depthWrite: false }));
    this.crumbs.frustumCulled = false;
    scene.add(this.crumbs);
  }

  /** anchor(bite) gives the bite point and the outward direction food enters from. */
  update(t, anchor) {
    const cp = this.crumbs.geometry.attributes.position;
    let live = 0;
    this.bites.forEach((bt, k) => {
      const f = this.items[k];
      const dt = t - bt.t0;
      const on = dt > -0.6 && dt < 1.3;
      f.root.visible = on;
      for (let j = 0; j < CRUMBS; j++) cp.setXYZ(k * CRUMBS + j, 0, -999, 0);
      if (!on) return;
      const { p, out } = anchor(bt);
      const enter = easeOutCubic((dt + 0.55) / 0.45);
      f.root.position.copy(p).addScaledVector(out, (1 - enter) * 14);
      f.root.lookAt(f.root.position.clone().add(out));
      const grind = bt.kind === "molar";
      const after = Math.max(0, dt);
      const fade = 1 - smooth(0.7, 1.2, dt);
      if (grind) {
        f.group.position.x = after > 0 ? Math.sin(after * 40) * 0.25 * (1 - smooth(0, 0.5, after)) : 0;
        f.group.scale.setScalar(Math.max(0.001, (1 - smooth(0.05, 0.55, after)) * (1 + 0.15 * Math.exp(-after / 0.1))));
      } else {
        f.group.scale.setScalar(Math.max(0.001, fade));
        const sep = easeOutCubic(after / 0.35) * 2.2;
        f.a.position.set(-sep, -GRAVITY * 0.02 * after * after, 0);
        f.b.position.set(sep, -GRAVITY * 0.02 * after * after, 0);
        f.a.rotation.z = after * 2;
        f.b.rotation.z = -after * 2;
      }
      if (dt > 0) {
        live = Math.max(live, 1 - dt / 1.3);
        for (let j = 0; j < CRUMBS; j++) {
          const [sx, sy, sz, sp] = this.seed[k * CRUMBS + j];
          const u = dt * sp;
          cp.setXYZ(k * CRUMBS + j, p.x + sx * u * (grind ? 9 : 14) + out.x * u * 6, p.y + sy * u * 10 - GRAVITY * u * u * (grind ? 0.15 : 0.5), p.z + sz * u * (grind ? 9 : 12) + out.z * u * 6);
        }
      }
    });
    cp.needsUpdate = true;
    this.crumbs.material.opacity = clamp(live * 1.5, 0, 1);
  }
}

export class Toothbrush {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
    const handleMat = new THREE.MeshStandardMaterial({ color: "#2f8cff", roughness: 0.35 });
    const handle = new THREE.Mesh(new THREE.CapsuleGeometry(0.75, 15, 6, 16).rotateX(Math.PI / 2), handleMat);
    handle.position.z = 9.5;
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.55, 3, 12).rotateX(Math.PI / 2), handleMat);
    neck.position.z = 1.2;
    const head = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.5, 2.8), handleMat);
    head.position.z = -1.2;
    const bristles = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.1, 2.6), new THREE.MeshStandardMaterial({ color: "#f2f6fa", roughness: 0.9 }));
    bristles.position.set(0, -0.75, -1.2);
    this.group.add(handle, neck, head, bristles);
    const n = 90;
    this.foamSeed = Array.from({ length: n }, (_, i) => [hash(i * 1.7), hash(i * 2.9) * 2 - 1, hash(i * 4.3) * 2 - 1, hash(i * 6.1) * 2 - 1]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.foam = new THREE.Points(geo, new THREE.PointsMaterial({ color: "#eef8ff", size: 0.7, transparent: true, opacity: 0.85, depthWrite: false }));
    this.foam.frustumCulled = false;
    scene.add(this.foam);
  }

  /** at(t) gives { p, face, along, on } for the brush head; face points from the bristles toward the teeth. */
  update(t, at) {
    const cur = at(t);
    this.group.visible = cur.on > 0.01;
    if (this.group.visible) {
      this.group.position.copy(cur.p).addScaledVector(cur.face, -1.4 - (1 - cur.on) * 20);
      const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), cur.along, cur.face.clone().negate());
      this.group.quaternion.setFromRotationMatrix(m);
    }
    const fp = this.foam.geometry.attributes.position;
    this.foamSeed.forEach(([age, x, y, z], i) => {
      const past = at(t - age * 1.2);
      const ok = past.on > 0.5 && cur.on > 0.01;
      fp.setXYZ(i, ok ? past.p.x + x * 0.7 : 0, ok ? past.p.y + y * 0.7 + age * 0.6 : -999, ok ? past.p.z + z * 0.7 : 0);
    });
    fp.needsUpdate = true;
  }
}
