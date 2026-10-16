import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { clamp, easeOutCubic, hash, smooth } from "@gizclaw/mvg-core/timing.js";
import { lathe, noiseTexture } from "./model.js";

// Sizes in centimetres, matching the 2.5× dental model.
const CRUMBS = 30;
const GRAVITY = 60;

function canvasTexture(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

const physical = (o) => new THREE.MeshPhysicalMaterial({ roughness: 0.5, ...o });
const shadowed = (mesh) => {
  mesh.castShadow = true;
  return mesh;
};

// Apple: a turned outline, cut into a wedge; the cut faces show flesh, core line and seeds.
const APPLE = [[0, -2.35], [0.9, -2.55], [1.9, -2.25], [2.7, -1.4], [3.15, -0.3], [3.2, 0.5], [2.95, 1.4], [2.3, 2.15], [1.3, 2.45], [0.55, 2.2], [0, 2.0]];
let appleMats;
function appleMaterials() {
  if (appleMats) return appleMats;
  const face = canvasTexture(330, 520, (g, w, h) => {
    const X = (r) => (r / 3.3) * w;
    const Y = (y) => h - ((y + 2.6) / 5.2) * h;
    const grad = g.createRadialGradient(X(0.4), Y(0.1), 10, X(0.4), Y(0.1), w * 1.1);
    grad.addColorStop(0, "#f3e6b0");
    grad.addColorStop(1, "#eedc9a");
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "#c9b878";
    g.lineWidth = 4;
    g.beginPath();
    g.ellipse(X(0), Y(0.05), X(1.15), (1.5 / 5.2) * h, 0, -Math.PI / 2, Math.PI / 2);
    g.stroke();
    g.fillStyle = "#4a2a16";
    g.beginPath();
    g.ellipse(X(0.48), Y(0.1), X(0.17), (0.38 / 5.2) * h, 0.2, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#8a5a32";
    g.beginPath();
    g.ellipse(X(0.44), Y(0.18), X(0.05), (0.12 / 5.2) * h, 0.2, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "#a89558";
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(X(0.05), Y(2.0));
    g.lineTo(X(0.12), Y(1.2));
    g.stroke();
    g.strokeStyle = "#c8323c";
    g.lineWidth = 9;
    g.beginPath();
    APPLE.forEach(([r, y], i) => (i ? g.lineTo(X(r), Y(y)) : g.moveTo(X(r), Y(y))));
    g.stroke();
  });
  face.repeat.set(1 / 3.3, 1 / 5.2);
  face.offset.set(0, 0.5);
  const skin = canvasTexture(256, 128, (g, w, h) => {
    g.fillStyle = "#c62a36";
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) {
      g.fillStyle = `rgba(${200 + hash(i) * 55},${60 + hash(i * 2) * 90},40,0.35)`;
      g.fillRect(hash(i * 3) * w, 0, 1 + hash(i * 5) * 3, h);
    }
    for (let i = 0; i < 160; i++) {
      g.fillStyle = "rgba(255,230,170,0.55)";
      g.fillRect(hash(i * 7) * w, hash(i * 11) * h, 1.5, 1.5);
    }
  });
  appleMats = {
    face: physical({ map: face, roughness: 0.55, side: THREE.DoubleSide }),
    skin: physical({ map: skin, roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.2 }),
  };
  return appleMats;
}

function appleWedge(phi0, len) {
  const { face, skin } = appleMaterials();
  const g = new THREE.Group();
  g.add(shadowed(new THREE.Mesh(new THREE.LatheGeometry(APPLE.map(([r, y]) => new THREE.Vector2(r, y)), 18, phi0, len), skin)));
  const shape = new THREE.Shape([...APPLE.map(([r, y]) => new THREE.Vector2(r, y)), new THREE.Vector2(0, -2.35)]);
  for (const phi of [phi0, phi0 + len]) {
    const f = new THREE.Mesh(new THREE.ShapeGeometry(shape, 12).rotateY(phi - Math.PI / 2), face);
    g.add(shadowed(f));
  }
  return g;
}

function drumstick() {
  const meatTex = canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = "#b8682e";
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) {
      const d = hash(i * 3.3);
      g.fillStyle = d > 0.7 ? "rgba(70,30,10,0.35)" : d > 0.35 ? "rgba(150,70,25,0.4)" : "rgba(235,160,80,0.35)";
      g.beginPath();
      g.ellipse(hash(i * 5) * w, hash(i * 7) * h, 4 + hash(i * 11) * 14, 3 + hash(i * 13) * 8, hash(i * 17) * 3, 0, Math.PI * 2);
      g.fill();
    }
  });
  const meat = physical({ map: meatTex, roughness: 0.38, clearcoat: 0.8, clearcoatRoughness: 0.25, bumpMap: noiseTexture("stipple", 128, 21), bumpScale: 2 });
  const bone = physical({ color: "#efe3c8", roughness: 0.45, clearcoat: 0.3 });
  const stick = new THREE.Group();
  stick.add(shadowed(new THREE.Mesh(lathe([[0, 0.4], [0.7, 0.45], [1.25, 0.9], [1.45, 1.6], [1.35, 2.3], [0.95, 2.9], [0.5, 3.3], [0.3, 3.5], [0, 3.55]], 40).rotateZ(-Math.PI / 2), meat)));
  stick.add(shadowed(new THREE.Mesh(lathe([[0, 3.3], [0.28, 3.3], [0.24, 4.4], [0.3, 4.8], [0, 4.85]], 24).rotateZ(-Math.PI / 2), bone)));
  for (const s of [-1, 1]) {
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.34, 20, 14), bone);
    knob.position.set(4.95, s * 0.22, 0);
    stick.add(shadowed(knob));
  }
  const chunk = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75, 3), meat);
  const p = chunk.geometry.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(p, i);
    v.multiplyScalar(1 + 0.18 * Math.sin(v.x * 9 + v.y * 5) * Math.cos(v.z * 7)).multiply(new THREE.Vector3(1.1, 0.9, 1));
    p.setXYZ(i, v.x, v.y, v.z);
  }
  chunk.geometry.computeVertexNormals();
  return { a: shadowed(chunk), b: stick };
}

function hazelnut() {
  const shellTex = canvasTexture(128, 256, (g, w, h) => {
    g.fillStyle = "#8a5226";
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 50; i++) {
      g.fillStyle = `rgba(${40 + hash(i) * 30},${20 + hash(i * 2) * 15},8,0.45)`;
      g.fillRect(hash(i * 3) * w, h * 0.12, 1 + hash(i * 5) * 3, h * 0.88);
    }
    g.fillStyle = "#d8b98a";
    g.fillRect(0, 0, w, h * 0.13);
    g.fillStyle = "#b58a5a";
    g.fillRect(0, h * 0.94, w, h * 0.06);
  });
  shellTex.flipY = false;
  const shell = physical({ map: shellTex, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.25, side: THREE.DoubleSide });
  const profile = [[0, -1.0], [0.55, -1.05], [0.95, -0.85], [1.15, -0.4], [1.2, 0.1], [1.08, 0.6], [0.75, 1.05], [0.35, 1.35], [0.08, 1.55], [0, 1.6]].map(([r, y]) => new THREE.Vector2(r, y));
  const half = (phi0) => shadowed(new THREE.Mesh(new THREE.LatheGeometry(profile, 28, phi0, Math.PI), shell));
  const kernel = new THREE.Mesh(new THREE.LatheGeometry(profile.map((v) => v.clone().multiplyScalar(0.82)), 32), physical({ color: "#d9b98a", roughness: 0.6, bumpMap: noiseTexture("stipple", 128, 33), bumpScale: 1.5 }));
  return { a: half(Math.PI), b: half(0), core: shadowed(kernel) };
}

function wheat() {
  const mat = physical({ color: "#e2b45a", roughness: 0.42, clearcoat: 0.4, clearcoatRoughness: 0.3 });
  const geo = lathe([[0, -1], [0.3, -0.9], [0.48, -0.45], [0.52, 0.15], [0.43, 0.65], [0.22, 0.95], [0, 1.02]], 28);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    if (z < 0) p.setZ(i, z * (1 - 0.45 * Math.exp(-(x * x) / 0.01)));
  }
  geo.computeVertexNormals();
  const a = new THREE.Group();
  const b = new THREE.Group();
  for (let k = 0; k < 6; k++) {
    const grain = shadowed(new THREE.Mesh(geo, mat));
    grain.scale.set(0.75, 0.75, 0.62);
    grain.rotation.set(Math.PI / 2, hash(k) - 0.5, Math.PI / 2 + (hash(k * 3) - 0.5) * 0.6);
    grain.position.set((k % 3) * 1.25 - 1.25, (hash(k * 5) - 0.5) * 0.3, (k < 3 ? 1 : -1) * 0.55);
    (k < 3 ? a : b).add(grain);
  }
  return { a, b };
}

/** Two pieces that a bite pulls apart (and an optional middle that crumbles), plus a crumb colour. */
function build(kind) {
  const g = new THREE.Group();
  let parts;
  let crumb;
  if (kind === "incisor") {
    parts = { a: appleWedge(-0.6, 0.6), b: appleWedge(0, 0.6) };
    parts.a.rotation.y = parts.b.rotation.y = 1.15;
    g.scale.setScalar(0.95);
    g.position.z = -0.4;
    crumb = "#eedc9a";
  } else if (kind === "canine") {
    parts = drumstick();
    g.rotation.y = -Math.PI / 2;
    g.scale.setScalar(1.25);
    crumb = "#a8552a";
  } else if (kind === "premolar") {
    parts = hazelnut();
    g.scale.setScalar(1.5);
    crumb = "#8a5226";
  } else {
    parts = wheat();
    g.scale.setScalar(1.4);
    crumb = "#f1e4c2";
  }
  g.add(parts.a, parts.b);
  if (parts.core) g.add(parts.core);
  return { group: g, ...parts, crumb };
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
    this.crumbs = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.2, 0), physical({ roughness: 0.6 }), n);
    bites.forEach((_, k) => {
      const c = new THREE.Color(this.items[k].crumb);
      for (let j = 0; j < CRUMBS; j++) this.crumbs.setColorAt(k * CRUMBS + j, c);
    });
    this.crumbs.frustumCulled = false;
    this.crumbs.castShadow = true;
    scene.add(this.crumbs);
    this.dummy = new THREE.Object3D();
  }

  /** anchor(bite) gives the bite point and the outward direction food enters from. */
  update(t, anchor) {
    const d = this.dummy;
    this.bites.forEach((bt, k) => {
      const f = this.items[k];
      const dt = t - bt.t0;
      const on = dt > -0.6 && dt < 1.3;
      f.root.visible = on;
      const { p, out } = on ? anchor(bt) : { p: null, out: null };
      if (on) {
        const enter = easeOutCubic((dt + 0.55) / 0.45);
        f.root.position.copy(p).addScaledVector(out, (1 - enter) * 14);
        f.root.lookAt(f.root.position.clone().add(out));
        const grind = bt.kind === "molar";
        const after = Math.max(0, dt);
        const fade = Math.max(0.001, 1 - smooth(0.7, 1.2, dt));
        if (grind) {
          f.a.position.x = after > 0 ? Math.sin(after * 40) * 0.25 * (1 - smooth(0, 0.5, after)) : 0;
          f.b.position.x = -f.a.position.x;
          const s = Math.max(0.001, (1 - smooth(0.05, 0.55, after)) * (1 + 0.15 * Math.exp(-after / 0.1)));
          f.a.scale.setScalar(s);
          f.b.scale.setScalar(s);
        } else {
          const sep = easeOutCubic(after / 0.35) * 2.2;
          const drop = -GRAVITY * 0.02 * after * after;
          f.a.position.set(-sep, drop, 0);
          f.b.position.set(sep, drop, 0);
          f.a.rotation.z = after * 2;
          f.b.rotation.z = -after * 2;
          f.a.scale.setScalar(fade);
          f.b.scale.setScalar(fade);
          if (f.core) f.core.scale.setScalar(Math.max(0.001, 1 - smooth(0, 0.25, after)));
        }
      }
      for (let j = 0; j < CRUMBS; j++) {
        const [sx, sy, sz, sp] = this.seed[k * CRUMBS + j];
        if (on && dt > 0) {
          const u = dt * sp;
          const grind = bt.kind === "molar";
          d.position.set(p.x + sx * u * (grind ? 9 : 14) + out.x * u * 6, p.y + sy * u * 10 - GRAVITY * u * u * (grind ? 0.15 : 0.5), p.z + sz * u * (grind ? 9 : 12) + out.z * u * 6);
          d.rotation.set(u * 9 * sx, u * 7 * sz, u * 5);
          d.scale.setScalar(clamp(1.2 - dt / 1.3, 0, 1) * smooth(0, 0.15, dt) * (0.5 + sp * 0.6) * (grind ? 0.6 : 1));
        } else d.scale.setScalar(0);
        d.updateMatrix();
        this.crumbs.setMatrixAt(k * CRUMBS + j, d.matrix);
      }
    });
    this.crumbs.instanceMatrix.needsUpdate = true;
  }
}

/** A toothbrush along +z from the head (z < 0) to the handle tail: grip, neck, head and bristle tufts. */
export function toothbrushModel(color) {
  const g = new THREE.Group();
  const plastic = physical({ color, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.08 });
  const grip = physical({ color: "#e8f4f8", roughness: 0.8, sheen: 0.5, sheenColor: new THREE.Color("#ffffff") });
  const handle = lathe([[0, 0], [0.4, 0.04], [0.62, 0.5], [0.7, 3], [0.76, 6], [0.7, 9], [0.55, 12], [0.36, 14], [0.27, 15.5], [0.25, 16.7], [0, 16.8]], 40).rotateX(-Math.PI / 2).scale(1.25, 0.85, 1);
  const body = new THREE.Mesh(handle, plastic);
  body.position.z = 18.4;
  g.add(shadowed(body));
  const band = new THREE.Mesh(lathe([[0.74, 3.4], [0.82, 3.6], [0.86, 6.4], [0.8, 6.8]], 40).rotateX(-Math.PI / 2).scale(1.25, 0.85, 1), grip);
  band.position.z = 18.4;
  g.add(band);
  const head = new THREE.Mesh(new RoundedBoxGeometry(1.35, 0.42, 3.1, 4, 0.18), plastic);
  head.position.z = -0.1;
  g.add(shadowed(head));
  const tufts = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.1, 0.8, 3, 8), physical({ roughness: 0.55 }), 24);
  let n = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 3; c++) {
      const m = new THREE.Matrix4().makeTranslation((c - 1) * 0.36, -0.68 - (c === 1 ? 0.06 : 0), -1.35 + r * 0.38);
      tufts.setMatrixAt(n, m);
      tufts.setColorAt(n++, new THREE.Color(r % 3 === 1 ? "#7fd0ff" : "#f6fbff"));
    }
  }
  g.add(tufts);
  return g;
}

export class Toothbrush {
  constructor(scene) {
    this.group = toothbrushModel("#2f8cff");
    scene.add(this.group);
    const n = 70;
    this.foamSeed = Array.from({ length: n }, (_, i) => [hash(i * 1.7), hash(i * 2.9) * 2 - 1, hash(i * 4.3) * 2 - 1, hash(i * 6.1) * 2 - 1, 0.5 + hash(i * 7.7)]);
    this.foam = new THREE.InstancedMesh(new THREE.SphereGeometry(0.32, 14, 10), physical({ color: "#f4fbff", roughness: 0.1, clearcoat: 1, transparent: true, opacity: 0.88 }), n);
    this.foam.frustumCulled = false;
    scene.add(this.foam);
    this.dummy = new THREE.Object3D();
  }

  /** at(t) gives { p, face, on } for the brush head; face points from the bristles toward the teeth. */
  update(t, at) {
    const cur = at(t);
    this.group.visible = cur.on > 0.01;
    if (this.group.visible) {
      this.group.position.copy(cur.p).addScaledVector(cur.face, -1.4 - (1 - cur.on) * 20);
      const side = Math.max(-1, Math.min(1, cur.p.x / 4));
      const handle = new THREE.Vector3(side, 0.25, 1 - Math.abs(side)).normalize();
      const y = cur.face.clone().negate();
      const z = handle.addScaledVector(y, -handle.dot(y)).normalize();
      const x = new THREE.Vector3().crossVectors(y, z);
      this.group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
    }
    const d = this.dummy;
    this.foamSeed.forEach(([age, x, y, z, s], i) => {
      const past = at(t - age * 1.2);
      const ok = past.on > 0.5 && cur.on > 0.01;
      d.position.set(past.p.x + x * 0.8, past.p.y + y * 0.6 + age * 0.5, past.p.z + z * 0.8);
      d.scale.setScalar(ok ? s * (1 - age * 0.6) * cur.on : 0);
      d.updateMatrix();
      this.foam.setMatrixAt(i, d.matrix);
    });
    this.foam.instanceMatrix.needsUpdate = true;
  }
}
