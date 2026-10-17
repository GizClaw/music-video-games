import * as THREE from "three";
import { STATES } from "./song.js";

function instrumentPlate(owner, variant) {
  owner.plateMaterials ??= [];
  if (owner.plateMaterials[variant]) return owner.plateMaterials[variant];
  const canvas = document.createElement("canvas"); canvas.width = 384; canvas.height = 128;
  const g = canvas.getContext("2d");
  g.fillStyle = "#0b1720"; g.fillRect(0, 0, 384, 128);
  g.strokeStyle = "#49616d"; g.lineWidth = 2; g.strokeRect(2, 2, 380, 124);
  g.fillStyle = "#c6d9df"; g.font = "500 23px monospace";
  g.fillText(["PARTICLE / 04", "FIELD / 02", "SPECTRAL / 08"][variant], 22, 39);
  g.fillStyle = "#708e9b"; g.font = "15px monospace"; g.fillText("STABILIZER   •   ONLINE", 22, 68);
  for (let i = 0; i < 16; i++) {
    g.fillStyle = i < 11 + variant ? STATES[variant].color : "#263b48";
    g.fillRect(22 + i * 21, 89, 13, 10);
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  owner.textures.add(texture);
  const mat = owner.material("#ffffff", { map: texture, emissiveMap: texture, emissive: "#ffffff", emissiveIntensity: 0.18, roughness: 0.5 });
  owner.plateMaterials[variant] = mat;
  return mat;
}

/** A cabinet, a suspended gimbal and three different chamber assemblies.
 * Fine fasteners, etched instruments and plumbing have a near-distance LOD. */
export function buildMachine(owner, index, height) {
  const pod = new THREE.Group();
  const detail = new THREE.Group(); pod.add(detail);
  const variant = index % 3;
  const color = index % 4;
  const bottom = -1.9;
  const cabinetHeight = 1.35 + height * 0.46;
  const top = bottom + cabinetHeight;
  const coreY = top + 1.17;
  const cylinder = (parent, r1, r2, h, mat, x, y, z) => owner.mesh(parent, new THREE.CylinderGeometry(r1, r2, h, 40), mat, x, y, z);
  const horizontalRing = (parent, r, thickness, mat, y) => { const m = owner.ring(parent, r, thickness, mat, 0, y, 0); m.rotation.x = Math.PI / 2; return m; };
  owner.box(pod, [2.28, 0.21, 2.05], owner.metalMat, 0, bottom, 0, 0.09);
  owner.box(pod, [1.96, cabinetHeight, 1.7], owner.baseMat, 0, bottom + cabinetHeight / 2, 0, 0.14);
  owner.box(pod, [2.12, 0.14, 1.9], owner.metalMat, 0, top, 0, 0.06);
  owner.box(detail, [1.65, cabinetHeight * 0.72, 0.055], owner.darkMat, 0, bottom + cabinetHeight * 0.52, 0.86, 0.07);
  owner.mesh(detail, new THREE.PlaneGeometry(1.35, 0.45), instrumentPlate(owner, variant), -0.03, top - 0.48, 0.9);
  for (let v = 0; v < 5; v++) owner.box(detail, [1.3, 0.025, 0.045], owner.metalMat, 0, bottom + 0.3 + v * 0.08, 0.91, 0.009);
  for (const x of [-0.77, 0.77]) for (const y of [bottom + 0.18, top - 0.17]) owner.sphere(detail, 0.038, owner.metalMat, x, y, 0.91);
  owner.sphere(detail, 0.038, owner.lights[color], 0.72, top - 0.48, 0.93);
  cylinder(pod, 1.03, 1.1, 0.17, owner.metalMat, 0, top + 0.18, 0);
  horizontalRing(pod, 0.88, 0.026, owner.trackMat, top + 0.29);
  cylinder(pod, 1.03, 0.98, 0.14, owner.metalMat, 0, top + 2.13, 0);
  cylinder(pod, 0.73, 0.81, 0.08, owner.baseMat, 0, top + 2.23, 0);
  horizontalRing(pod, 0.92, 0.018, owner.trackMat, top + 2.2);
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i * Math.PI / 2;
    const x = Math.cos(a) * 0.98, z = Math.sin(a) * 0.98;
    cylinder(detail, 0.045, 0.045, 1.86, owner.metalMat, x, coreY, z);
    for (const y of [top + 0.31, top + 2.03]) cylinder(detail, 0.11, 0.1, 0.12, owner.baseMat, x, y, z);
  }
  const glass = owner.material("#adcddd", { transparent: true, opacity: 0.09, roughness: 0.12, metalness: 0.05, clearcoat: 1, depthWrite: false });
  if (variant === 0) {
    owner.mesh(pod, new THREE.CylinderGeometry(0.82, 0.82, 1.79, 64, 1, true), glass, 0, coreY, 0);
    for (let i = 0; i < 8; i++) owner.box(detail, [i % 2 ? 0.09 : 0.18, 0.014, 0.014], owner.creamMat, 0.25, top + 0.5 + i * 0.18, 0.79, 0.004);
  } else if (variant === 1) {
    for (const side of [-1, 1]) {
      const points = Array.from({ length: 81 }, (_, j) => {
        const a = j / 80 * Math.PI * 10;
        return new THREE.Vector3(side * 0.52 + Math.cos(a) * 0.18, top + 0.44 + j / 80 * 1.48, Math.sin(a) * 0.18);
      });
      owner.mesh(detail, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 96, 0.019, 6, false), owner.lights[color]);
      cylinder(pod, 0.12, 0.12, 1.58, owner.metalMat, side * 0.52, coreY, 0);
    }
  } else {
    for (const d of [-0.48, 0, 0.48]) {
      cylinder(pod, 0.76, 0.76, 0.035, glass, 0, coreY + d, 0);
      horizontalRing(pod, 0.77, 0.018, owner.metalMat, coreY + d);
    }
  }
  const orb = new THREE.Group(); orb.position.y = coreY; pod.add(orb);
  owner.sphere(orb, 0.28, owner.lights[color]);
  const inner = owner.ring(orb, 0.45, 0.025, owner.metalMat); inner.rotation.x = 0.8;
  const outer = owner.ring(orb, 0.59, 0.017, owner.lights[color]); outer.rotation.set(1.2, 0.6, 0.2);
  for (const side of [-1, 1]) {
    const path = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.9, top + 0.4, -0.4), new THREE.Vector3(side * 1.2, top + 0.3, -0.5),
      new THREE.Vector3(side * 1.22, top - 0.45, -0.5), new THREE.Vector3(side * 0.96, top - 0.7, -0.5),
    ]);
    owner.mesh(detail, new THREE.TubeGeometry(path, 24, 0.055, 8, false), owner.metalMat);
  }
  pod.rotation.y = index % 2 ? Math.PI : 0;
  return { pod, orb, y: coreY, detail };
}
