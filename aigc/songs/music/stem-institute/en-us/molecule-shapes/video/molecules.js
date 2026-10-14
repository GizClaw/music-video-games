import * as THREE from "three";
import { clamp, easeOutBack } from "@gizclaw/mvg-core/timing.js";

export const CPK = { C: "#30343c", O: "#e0303a", H: "#c4c9d0", B: "#f0a078", F: "#86e08f" };
const RADIUS = { C: 0.4, O: 0.38, H: 0.25, B: 0.38, F: 0.34 };
const BOND_R = 0.085;

const v = (x, y, z = 0) => new THREE.Vector3(x, y, z);
const deg = (d) => (d * Math.PI) / 180;

/** Ligand directions for a bond angle in the XY plane, symmetric about -Y. */
export function bentDirs(angleDeg) {
  const h = deg(angleDeg / 2);
  return [v(Math.sin(h), -Math.cos(h)), v(-Math.sin(h), -Math.cos(h))];
}

export const SHAPES = {
  linear: { id: "linear", label: "LINEAR", formula: "CO₂", angle: 180, center: "C", ligand: "O", bondOrder: 2, dirs: [v(1, 0), v(-1, 0)], length: 1.3, color: "#ff3344" },
  bent: { id: "bent", label: "BENT", formula: "H₂O", angle: 104.5, center: "O", ligand: "H", bondOrder: 1, dirs: bentDirs(104.5), length: 1.0, color: "#3de8ff", lonePairs: [v(0, 0.62, 0.78).normalize(), v(0, 0.62, -0.78).normalize()] },
  trigonal: { id: "trigonal", label: "TRIGONAL PLANAR", formula: "BF₃", angle: 120, center: "B", ligand: "F", bondOrder: 1, dirs: [90, 210, 330].map((a) => v(Math.cos(deg(a)), Math.sin(deg(a)))), length: 1.3, color: "#5dff7a" },
  tetra: { id: "tetra", label: "TETRAHEDRAL", formula: "CH₄", angle: 109.5, center: "C", ligand: "H", bondOrder: 1, dirs: [v(1, 1, 1), v(1, -1, -1), v(-1, 1, -1), v(-1, -1, 1)].map((d) => d.normalize()), length: 1.15, color: "#ffd23f" },
};

function atomMaterial(el) {
  return new THREE.MeshPhysicalMaterial({
    color: CPK[el],
    roughness: el === "C" ? 0.38 : 0.3,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.1,
    sheen: 0.5,
    sheenRoughness: 0.4,
    sheenColor: new THREE.Color("#ffffff"),
    emissive: new THREE.Color(CPK[el]),
    emissiveIntensity: 0,
  });
}

// Electron domain as a soap-bubble balloon: narrow at the nucleus, round outward.
function balloonGeometry(len, width) {
  const pts = [];
  for (let i = 0; i <= 32; i++) {
    const s = i / 32;
    const r = width * Math.pow(Math.sin(Math.PI * s), 0.85) * (0.45 + 0.55 * s);
    pts.push(new THREE.Vector2(Math.max(r, 0.0001), s * len));
  }
  return new THREE.LatheGeometry(pts, 48);
}

function balloonMaterial(tint) {
  return new THREE.MeshPhysicalMaterial({
    color: tint,
    roughness: 0.05,
    metalness: 0,
    transmission: 1,
    thickness: 0.25,
    ior: 1.15,
    iridescence: 1,
    iridescenceIOR: 1.35,
    iridescenceThicknessRange: [180, 520],
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

/**
 * Ball-and-stick molecule with split-colour bonds and optional electron-domain
 * balloons. `update` takes per-ligand assembly progress (0 = flying in, 1 =
 * bonded), optional override directions for morphs, and highlight pulses.
 */
export class Molecule {
  constructor(shape) {
    this.shape = shape;
    this.group = new THREE.Group();
    const cm = atomMaterial(shape.center);
    const lm = atomMaterial(shape.ligand);
    this.center = new THREE.Mesh(new THREE.SphereGeometry(RADIUS[shape.center], 64, 48), cm);
    this.center.castShadow = true;
    this.group.add(this.center);
    const half = new THREE.CylinderGeometry(BOND_R, BOND_R, 1, 24).translate(0, 0.5, 0);
    const bondC = cm.clone();
    const bondL = lm.clone();
    bondC.sheen = bondL.sheen = 0;
    this.ligands = shape.dirs.map((d, i) => {
      const atom = new THREE.Mesh(new THREE.SphereGeometry(RADIUS[shape.ligand], 56, 40), lm);
      atom.castShadow = true;
      const bonds = Array.from({ length: shape.bondOrder }, () => {
        const a = new THREE.Mesh(half, bondC);
        const b = new THREE.Mesh(half, bondL);
        a.castShadow = b.castShadow = true;
        this.group.add(a, b);
        return [a, b];
      });
      const domain = new THREE.Mesh(balloonGeometry(shape.length + 0.55, 0.36), balloonMaterial("#bff4ff"));
      this.group.add(atom, domain);
      const seed = new THREE.Vector3(Math.sin(i * 2.3 + 1) * 4, Math.cos(i * 1.7) * 3 + 2, 3 + i);
      return { atom, bonds, domain, dir: d.clone(), seed };
    });
    this.lobes = (shape.lonePairs || []).map((d) => {
      const lobe = new THREE.Mesh(balloonGeometry(1.15, 0.46), balloonMaterial("#c9a8ff"));
      this.group.add(lobe);
      return { lobe, dir: d };
    });
  }

  update({ progress = [], dirs = null, lobe = 0, domains = 0, pulse = 0, glow = 0 }) {
    const s = this.shape;
    const up = new THREE.Vector3(0, 1, 0);
    this.center.scale.setScalar(1 + pulse * 0.08);
    this.center.material.emissiveIntensity = glow * 0.25;
    this.ligands.forEach((l, i) => {
      const p = clamp(progress[i] ?? 1, 0, 1);
      const e = easeOutBack(p);
      const dir = (dirs ? dirs[i] : l.dir).clone().normalize();
      const target = dir.clone().multiplyScalar(s.length);
      l.atom.position.copy(l.seed).lerp(target, e);
      l.atom.scale.setScalar(clamp(p * 3, 0, 1) * (1 + pulse * 0.06));
      l.atom.material.emissiveIntensity = glow * 0.25;
      const bondOn = clamp((p - 0.6) / 0.4, 0, 1);
      const side = new THREE.Vector3().crossVectors(dir, Math.abs(dir.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : up).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(up, dir);
      l.bonds.forEach(([a, b], k) => {
        const off = s.bondOrder > 1 ? (k - (s.bondOrder - 1) / 2) * 0.2 : 0;
        const o = side.clone().multiplyScalar(off);
        const len = s.length * bondOn;
        a.position.copy(o);
        a.quaternion.copy(q);
        a.scale.set(1, len / 2, 1);
        b.position.copy(o).addScaledVector(dir, len / 2);
        b.quaternion.copy(q);
        b.scale.set(1, len / 2, 1);
        a.visible = b.visible = bondOn > 0.01;
      });
      const dk = domains;
      l.domain.visible = dk > 0.01;
      l.domain.quaternion.copy(q);
      l.domain.scale.setScalar(0.4 + 0.6 * dk);
      l.domain.material.opacity = 0.85 * dk;
    });
    this.lobes.forEach(({ lobe: m, dir }) => {
      m.visible = lobe > 0.01;
      m.position.set(0, 0, 0);
      m.quaternion.setFromUnitVectors(up, dir);
      m.scale.setScalar(0.3 + 0.7 * lobe);
      m.material.opacity = 0.9 * lobe;
    });
  }
}

/** Glowing arc between two directions (in molecule space), radius r. */
export function makeArc(color) {
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.3), transparent: true }));
  mesh.userData.set = (a, b, r, k) => {
    const qa = a.clone().normalize();
    const qb = b.clone().normalize();
    const ang = qa.angleTo(qb);
    const axis = new THREE.Vector3().crossVectors(qa, qb);
    if (axis.lengthSq() < 1e-6) axis.set(0, 0, 1);
    axis.normalize();
    const pts = Array.from({ length: 40 }, (_, i) => qa.clone().applyAxisAngle(axis, ang * (i / 39) * Math.max(k, 0.02)).multiplyScalar(r));
    mesh.geometry.dispose();
    mesh.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.02, 8, false);
    return qa.clone().applyAxisAngle(axis, (ang * k) / 2).multiplyScalar(r * 1.5);
  };
  return mesh;
}
