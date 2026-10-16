import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { MUSCLES, TENDON } from "./constants.js";

// Metres: the athlete stands about 1.82 tall with its soles at y = 0, facing +z.
// Side 0 is its right (screen left when it faces the camera); s = -1 / +1 places
// a part on that side.
const THIGH = 0.42;
const SHIN = 0.42;
const ANKLE = 0.08;
const UPPER = 0.28;
const FORE = 0.25;
const HIP_X = 0.095;
const HIPS_UP = 0.03;
const TOE = 0.13;

const UP = new THREE.Vector3(0, 1, 0);
const V = (p) => new THREE.Vector3(...p);
function xf(geo, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) {
  return geo.applyMatrix4(new THREE.Matrix4().compose(V(p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), V(s)));
}
const merge = (geos) => mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g)));
const lathe = (pts, seg = 32) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.0004), y)), seg);
const oval = (pts, sz, seg = 32) => lathe(pts, seg).scale(1, 1, sz);
const ball = (r, p, s = [1, 1, 1], seg = 20) => xf(new THREE.SphereGeometry(r, seg, Math.round(seg * 0.7)), p, [0, 0, 0], s);
function rod(a, b, r, seg = 10) {
  const A = V(a);
  const d = V(b).sub(A);
  const g = new THREE.CapsuleGeometry(r, Math.max(d.length() - 2 * r, 0.0005), 4, seg);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.clone().normalize()));
  return g.translate(A.x + d.x / 2, A.y + d.y / 2, A.z + d.z / 2);
}
function bar(pts, r, rad = 10) {
  return [new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(V)), pts.length * 10, r, rad), ball(r, pts[0], [1, 1, 1], 12), ball(r, pts.at(-1), [1, 1, 1], 12)];
}

/** A smooth radius-by-height profile through [r, y] control points listed top to bottom. */
function profile(pts) {
  const curve = new THREE.CatmullRomCurve3(pts.map(([r, y]) => new THREE.Vector3(r, y, 0)));
  const s = curve.getPoints(180).map((p) => [Math.max(p.x, 0.0004), p.y]);
  const r = (y) => {
    if (y >= s[0][1]) return s[0][0];
    for (let i = 1; i < s.length; i++) {
      if (y >= s[i][1]) {
        const [r0, y0] = s[i - 1];
        const [r1, y1] = s[i];
        return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0 || 1);
      }
    }
    return s.at(-1)[0];
  };
  return { s, r };
}

/** A limb or trunk segment turned from a profile, with an oval cross-section (sx across, sz front-back). */
function limb(pts, sx = 1, sz = 1, seg = 40) {
  const { s, r } = profile(pts);
  const geo = lathe([...s].reverse(), seg).scale(sx, 1, sz);
  return { geo, r, sx, sz };
}

const bump = (x) => (Math.abs(x) < 1 ? Math.cos((Math.PI / 2) * x) ** 2 : 0);

/**
 * A muscle as a patch of skin over a limb, raised by one bump per head. Heads:
 * { a: angle around the limb (0 front, +PI/2 toward +x), w: half-width (rad),
 *   y0 / y1: top and bottom, peak: widest point (0 bottom .. 1 top), amp: height (m) }.
 * Contracting raises the bumps and gathers them toward their peaks; the edges stay on the skin.
 */
class Bulge {
  constructor(lb, heads, mat) {
    this.heads = heads;
    const a0 = Math.min(...heads.map((h) => h.a - h.w));
    const a1 = Math.max(...heads.map((h) => h.a + h.w));
    const yT = Math.max(...heads.map((h) => h.y0));
    const yB = Math.min(...heads.map((h) => h.y1));
    const NU = 30;
    const NV = 36;
    const n = (NU + 1) * (NV + 1);
    this.base = new Float32Array(n * 3);
    this.nrm = new Float32Array(n * 3);
    this.ay = new Float32Array(n * 2);
    const color = new Float32Array(n * 4);
    let k = 0;
    for (let j = 0; j <= NV; j++) {
      const y = yB + ((yT - yB) * j) / NV;
      const r = lb.r(y);
      const dr = (lb.r(y + 0.002) - lb.r(y - 0.002)) / 0.004;
      for (let i = 0; i <= NU; i++, k++) {
        const a = a0 + ((a1 - a0) * i) / NU;
        const nv = new THREE.Vector3(Math.sin(a) / lb.sx, -dr, Math.cos(a) / lb.sz).normalize();
        this.nrm.set(nv.toArray(), k * 3);
        this.base.set([r * Math.sin(a) * lb.sx + nv.x * 0.0007, y + nv.y * 0.0007, r * Math.cos(a) * lb.sz + nv.z * 0.0007], k * 3);
        this.ay.set([a, y], k * 2);
        color.set([1, 1, 1, Math.min(1, this.height(a, y, 0) / (0.3 * Math.max(...heads.map((h) => h.amp))))], k * 4);
      }
    }
    const index = [];
    for (let j = 0; j < NV; j++) {
      for (let i = 0; i < NU; i++) {
        const q = j * (NU + 1) + i;
        index.push(q, q + 1, q + NU + 2, q, q + NU + 2, q + NU + 1);
      }
    }
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute("position", new THREE.BufferAttribute(this.base.slice(), 3));
    this.geo.setAttribute("color", new THREE.BufferAttribute(color, 4));
    this.geo.setIndex(index);
    this.geo.computeVertexNormals();
    const mid = Math.floor(n / 2) * 3;
    const out = this.geo.attributes.normal.array;
    if (out[mid] * this.nrm[mid] + out[mid + 1] * this.nrm[mid + 1] + out[mid + 2] * this.nrm[mid + 2] < 0) {
      for (let q = 0; q < index.length; q += 3) [index[q + 1], index[q + 2]] = [index[q + 2], index[q + 1]];
      this.geo.setIndex(index);
    }
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.castShadow = true;
    this.lb = lb;
    this.c = -1;
    this.set(0);
  }

  height(a, y, c) {
    let h = 0;
    for (const hd of this.heads) {
      const v = (y - hd.y1) / (hd.y0 - hd.y1);
      const vc = (v - hd.peak) / (1 - 0.3 * c);
      h += hd.amp * (1 + 1.1 * c) * bump((a - hd.a) / hd.w) * bump(vc < 0 ? vc / hd.peak : vc / (1 - hd.peak));
    }
    return h;
  }

  set(c) {
    if (Math.abs(c - this.c) < 1e-4) return;
    this.c = c;
    const pos = this.geo.attributes.position.array;
    for (let k = 0; k < this.ay.length / 2; k++) {
      const h = this.height(this.ay[k * 2], this.ay[k * 2 + 1], c);
      for (let d = 0; d < 3; d++) pos[k * 3 + d] = this.base[k * 3 + d] + this.nrm[k * 3 + d] * h;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.computeVertexNormals();
  }

  /** A point on the raised surface along the first head, t = 0 bottom .. 1 top (local space). */
  point(t, out = new THREE.Vector3()) {
    const hd = this.heads[0];
    const y = hd.y1 + (hd.y0 - hd.y1) * t;
    const r = this.lb.r(y) + this.height(hd.a, y, this.c);
    return out.set(r * Math.sin(hd.a) * this.lb.sx, y, r * Math.cos(hd.a) * this.lb.sz);
  }
}

/** Skin-matched material for muscle patches: vertex alpha masks the group colour and glow. */
function patchMaterial(skin) {
  const mat = new THREE.MeshPhysicalMaterial({ color: skin, roughness: 0.5, sheen: 0.35, sheenColor: "#ffd2b4", clearcoat: 0.06, vertexColors: true, emissive: "#000000" });
  mat.userData.skin = { value: new THREE.Color(skin) };
  mat.userData.rim = { value: new THREE.Color(0) };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSkin = mat.userData.skin;
    shader.uniforms.uRim = mat.userData.rim;
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec3 uSkin, uRim;")
      .replace("#include <color_fragment>", "diffuseColor.rgb = mix(uSkin, diffuse, vColor.a);")
      .replace("vec3 totalEmissiveRadiance = emissive;", "vec3 totalEmissiveRadiance = emissive * vColor.a;")
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += uRim * vColor.a * pow(1.0 - clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0), 2.0);");
  };
  return mat;
}

function knitTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  g.fillStyle = "#808080";
  g.fillRect(0, 0, 64, 64);
  for (let y = 0; y < 64; y += 4) {
    for (let x = 0; x < 64; x += 4) {
      g.fillStyle = (x / 4 + y / 4) % 2 ? "#a0a0a0" : "#606060";
      g.fillRect(x, y, 4, 2);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(10, 10);
  return tex;
}

export class Figure {
  constructor() {
    this.root = new THREE.Group();
    const knit = knitTexture();
    const fabric = (color, sheen) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.82, sheen: 0.8, sheenColor: sheen, sheenRoughness: 0.5, bumpMap: knit, bumpScale: 0.6, side: THREE.DoubleSide });
    const SKIN = "#e2a983";
    this.skin = new THREE.MeshPhysicalMaterial({ color: SKIN, roughness: 0.5, sheen: 0.35, sheenColor: "#ffd2b4", clearcoat: 0.06 });
    this.skinColor = new THREE.Color(SKIN);
    this.top = fabric("#16808c", "#9ff2ff");
    this.shorts = fabric("#1d2742", "#8fa0d8");
    this.trim = new THREE.MeshPhysicalMaterial({ color: "#d2d7de", roughness: 0.65, sheen: 0.4, sheenColor: "#ffffff" });
    this.accent = new THREE.MeshPhysicalMaterial({ color: "#ff6a3d", roughness: 0.45, clearcoat: 0.3 });
    this.band = new THREE.MeshPhysicalMaterial({ color: "#2cade4", roughness: 0.7, sheen: 0.6, sheenColor: "#c8f0ff" });
    this.hair = new THREE.MeshPhysicalMaterial({ color: "#2a1a12", roughness: 0.62, sheen: 0.6, sheenColor: "#8a6a50" });
    this.mats = Object.fromEntries(Object.keys(MUSCLES).map((k) => [k, patchMaterial(SKIN)]));
    this.base = Object.fromEntries(Object.entries(MUSCLES).map(([k, m]) => [k, new THREE.Color(m.color)]));
    this.muscles = {};
    this.tmp = new THREE.Vector3();

    this.hips = new THREE.Group();
    this.root.add(this.hips);
    this.buildShorts();
    this.abdomen = new THREE.Group();
    this.abdomen.position.y = 0.06;
    this.hips.add(this.abdomen);
    const belly = limb([[0.13, 0.23], [0.124, 0.19], [0.113, 0.1], [0.12, 0.02], [0.116, -0.03], [0.06, -0.045]], 1, 0.72);
    this.add(belly.geo, this.skin, this.abdomen);
    const pads = [];
    for (let r = 0; r < 3; r++) for (const s of [-1, 1]) pads.push({ a: s * 0.3, w: 0.3, y0: 0.07 + r * 0.058, y1: 0.012 + r * 0.058, peak: 0.5, amp: 0.009 });
    this.abs = this.bulge("abs", null, this.abdomen, belly, pads);
    this.chest = new THREE.Group();
    this.chest.position.y = 0.2;
    this.abdomen.add(this.chest);
    this.buildTorso();
    this.buildHead();
    this.iron = new THREE.MeshStandardMaterial({ color: "#1f2228", metalness: 0.3, roughness: 0.55 });
    this.chrome = new THREE.MeshStandardMaterial({ color: "#d8dde6", metalness: 1, roughness: 0.22 });
    this.bellGeo = this.dumbbell();
    this.arms = [0, 1].map((side) => this.buildArm(side));
    this.legs = [0, 1].map((side) => this.buildLeg(side));
    this.buildTendons();
  }

  add(geo, mat, parent, p = [0, 0, 0]) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...p);
    m.castShadow = true;
    parent.add(m);
    return m;
  }

  bulge(group, side, parent, lb, heads) {
    const b = new Bulge(lb, heads, this.mats[group]);
    parent.add(b.mesh);
    if (side !== null) this.muscles[`${group}${side}`] = b;
    return b;
  }

  buildShorts() {
    this.add(oval([[0.0004, -0.115], [0.11, -0.105], [0.162, -0.04], [0.168, 0.03], [0.152, 0.075], [0.153, 0.09]], 0.8), this.shorts, this.hips);
    this.add(oval([[0.151, 0.07], [0.157, 0.076], [0.157, 0.106], [0.15, 0.112]], 0.8), this.band, this.hips);
    const strings = [];
    for (const s of [-1, 1]) strings.push(...bar([[s * 0.01, 0.088, 0.128], [s * 0.016, 0.05, 0.132], [s * 0.022, 0.02, 0.128]], 0.0035, 6), ball(0.006, [s * 0.022, 0.016, 0.128], [1, 1.6, 1], 10));
    this.add(merge(strings), this.trim, this.hips);
  }

  buildTorso() {
    const prof = [[0.128, -0.03], [0.15, 0.05], [0.168, 0.13], [0.172, 0.19], [0.158, 0.24], [0.12, 0.272], [0.07, 0.288], [0.0004, 0.292]];
    this.add(oval(prof, 0.66), this.skin, this.chest);
    for (const s of [-1, 1]) this.add(xf(new THREE.SphereGeometry(0.1, 32, 20), [s * 0.085, 0.25, -0.012], [0, 0, -s * 0.42], [1.05, 0.42, 0.62]), this.skin, this.chest);
    const top = oval([[0.135, -0.005], [0.157, 0.05], [0.176, 0.13], [0.18, 0.19], [0.163, 0.235], [0.135, 0.26]], 0.7, 48);
    const p = top.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      let y = p.getY(i);
      let z = p.getZ(i);
      for (const s of [-1, 1]) z += Math.max(0, z) * 0.22 * Math.exp(-((x - s * 0.062) ** 2) / 0.0025 - (y - 0.168) ** 2 / 0.003);
      if (y > 0.2 && Math.abs(x) < 0.09) y = Math.min(y, 0.2 + (Math.abs(x) / 0.09) * 0.055);
      if (y > 0.21 && Math.abs(x) > 0.13) y = 0.21 + (y - 0.21) * 0.3;
      p.setXYZ(i, x, y, z);
    }
    top.computeVertexNormals();
    this.add(top, this.top, this.chest);
    const trims = [oval([[0.137, -0.012], [0.141, -0.006], [0.141, 0.008], [0.137, 0.012]], 0.7, 48)];
    const straps = [];
    for (const s of [-1, 1]) {
      straps.push(...bar([[s * 0.08, 0.205, 0.1], [s * 0.1, 0.262, 0.07], [s * 0.106, 0.292, 0.0], [s * 0.1, 0.262, -0.07], [s * 0.08, 0.215, -0.1]], 0.016, 8));
      trims.push(rod([s * 0.176, 0.0, 0.0], [s * 0.178, 0.19, 0.0], 0.003, 6));
    }
    this.add(merge(trims), this.trim, this.chest);
    this.add(merge(straps), this.top, this.chest);
    const star = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 0.009 : 0.022;
      const a = Math.PI / 2 + (i * Math.PI) / 5;
      i ? star.lineTo(Math.cos(a) * r, Math.sin(a) * r) : star.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    const emblem = this.add(new THREE.ExtrudeGeometry(star, { depth: 0.003, bevelEnabled: true, bevelSize: 0.002, bevelThickness: 0.002, bevelSegments: 2 }), new THREE.MeshPhysicalMaterial({ color: "#ffe14a", roughness: 0.4, clearcoat: 0.6 }), this.chest, [0.07, 0.14, 0.142]);
    emblem.rotation.y = 0.35;
  }

  buildHead() {
    this.head = new THREE.Group();
    this.head.position.y = 0.268;
    this.head.scale.setScalar(1.06);
    this.chest.add(this.head);
    this.add(limb([[0.05, 0.12], [0.052, 0.06], [0.058, 0.02], [0.075, -0.01], [0.1, -0.03]], 1, 0.85, 32).geo, this.skin, this.head);
    const skull = new THREE.SphereGeometry(0.1, 64, 48);
    const sp = skull.attributes.position;
    for (let i = 0; i < sp.count; i++) {
      let x = sp.getX(i);
      let y = sp.getY(i);
      let z = sp.getZ(i);
      const n = y / 0.1;
      const low = Math.max(0, -n);
      x *= 0.9 * (1 - 0.3 * low * low) * (1 + 0.06 * Math.max(0, n) * (1 - n));
      z *= (z < 0 ? 1.03 : 0.98) * (1 - 0.12 * low * low * (z < 0 ? 1.6 : 0));
      if (z > 0 && n < -0.55) z += 0.008 * (low - 0.55) * Math.max(0, 1 - Math.abs(x) / 0.04);
      y *= 1.1;
      sp.setXYZ(i, x, y, z);
    }
    skull.computeVertexNormals();
    const face = [xf(skull, [0, 0.17, 0.0])];
    for (const s of [-1, 1]) {
      face.push(ball(0.022, [s * 0.088, 0.165, -0.008], [0.4, 1, 0.7]));
      face.push(xf(new THREE.TorusGeometry(0.012, 0.0035, 6, 16), [s * 0.094, 0.165, -0.006], [0, s * Math.PI / 2, 0], [1, 1.35, 1]));
    }
    face.push(ball(0.0105, [0, 0.148, 0.1], [1.05, 0.9, 0.95]), rod([0, 0.168, 0.095], [0, 0.152, 0.1], 0.0052));
    this.add(merge(face), this.skin, this.head);

    const white = new THREE.MeshPhysicalMaterial({ color: "#fbfbff", roughness: 0.12, clearcoat: 1 });
    const iris = new THREE.MeshPhysicalMaterial({ color: "#6a4224", roughness: 0.25, clearcoat: 1 });
    const black = new THREE.MeshBasicMaterial({ color: "#050506" });
    const shine = new THREE.MeshBasicMaterial({ color: "#ffffff" });
    const dark = new THREE.MeshPhysicalMaterial({ color: "#2a1a12", roughness: 0.7 });
    this.lids = [];
    for (const s of [-1, 1]) {
      const eye = new THREE.Group();
      eye.position.set(s * 0.04, 0.176, 0.072);
      eye.rotation.y = s * 0.14;
      this.head.add(eye);
      eye.add(new THREE.Mesh(new THREE.SphereGeometry(0.026, 32, 24), white));
      eye.add(new THREE.Mesh(new THREE.SphereGeometry(0.0263, 32, 10, 0, Math.PI * 2, 0, 0.72).rotateX(Math.PI / 2), iris));
      eye.add(new THREE.Mesh(new THREE.SphereGeometry(0.0266, 24, 6, 0, Math.PI * 2, 0, 0.34).rotateX(Math.PI / 2), black));
      eye.add(new THREE.Mesh(new THREE.SphereGeometry(0.0046, 10, 8), shine).translateX(0.007).translateY(0.008).translateZ(0.0245));
      eye.add(new THREE.Mesh(new THREE.SphereGeometry(0.0022, 8, 6), shine).translateX(-0.006).translateY(-0.006).translateZ(0.0255));
      const lid = new THREE.Mesh(new THREE.SphereGeometry(0.0285, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), this.skin);
      lid.add(new THREE.Mesh(new THREE.TorusGeometry(0.0285, 0.0019, 6, 32, Math.PI).rotateX(Math.PI / 2), dark));
      eye.add(lid);
      this.lids.push(lid);
    }
    const lines = [];
    for (const s of [-1, 1]) lines.push(...bar([[s * 0.018, 0.211, 0.094], [s * 0.04, 0.221, 0.093], [s * 0.064, 0.212, 0.078]], 0.0058, 6));
    this.add(merge(lines), dark, this.head);
    this.add(merge(bar([[-0.03, 0.128, 0.088], [-0.015, 0.119, 0.096], [0, 0.117, 0.098], [0.015, 0.119, 0.096], [0.03, 0.128, 0.088]], 0.004, 6)), new THREE.MeshPhysicalMaterial({ color: "#8a3030", roughness: 0.4 }), this.head);
    const blush = new THREE.MeshStandardMaterial({ color: "#ff8f8f", roughness: 0.6, transparent: true, opacity: 0.32, depthWrite: false });
    for (const s of [-1, 1]) this.add(ball(0.017, [s * 0.058, 0.142, 0.08], [1, 0.65, 0.4]), blush, this.head);

    const cap = new THREE.SphereGeometry(0.106, 48, 20, 0, Math.PI * 2, 0, 0.46 * Math.PI);
    const cp = cap.attributes.position;
    for (let i = 0; i < cp.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(cp, i);
      const tuft = 1 + 0.06 * Math.max(0, Math.sin(Math.atan2(v.z, v.x) * 9 + v.y * 60)) * Math.min(1, v.y / 0.05);
      v.multiplyScalar(tuft);
      cp.setXYZ(i, v.x, v.y, v.z);
    }
    cap.computeVertexNormals();
    const hair = [xf(cap, [0, 0.172, -0.004], [-0.3, 0, 0], [0.95, 1.08, 1.04])];
    for (let k = 0; k < 5; k++) hair.push(xf(new THREE.ConeGeometry(0.02, 0.05, 10), [(k - 2) * 0.022, 0.258, 0.06 - Math.abs(k - 2) * 0.008], [0.9, 0, (k - 2) * -0.25]));
    this.add(merge(hair), this.hair, this.head);
    this.add(xf(new THREE.TorusGeometry(0.1, 0.013, 12, 48), [0, 0.222, 0.0], [Math.PI / 2 - 0.22, 0, 0], [0.96, 1.05, 1]), this.band, this.head);
    this.add(xf(new THREE.TorusGeometry(0.1, 0.0035, 6, 48), [0, 0.222, 0.0], [Math.PI / 2 - 0.22, 0, 0], [0.975, 1.065, 1.13]), this.trim, this.head);
  }

  dumbbell() {
    const knurl = [];
    for (let i = 0; i <= 40; i++) knurl.push([0.0115 + 0.0012 * (i % 2), -0.06 + (i / 40) * 0.12]);
    const handle = merge([lathe(knurl, 16), lathe([[0.016, -0.075], [0.018, -0.072], [0.018, -0.062], [0.016, -0.06]], 16), lathe([[0.016, 0.06], [0.018, 0.062], [0.018, 0.072], [0.016, 0.075]], 16)]).rotateZ(Math.PI / 2);
    const hex = new THREE.Shape();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      i ? hex.lineTo(Math.cos(a) * 0.048, Math.sin(a) * 0.048) : hex.moveTo(Math.cos(a) * 0.048, Math.sin(a) * 0.048);
    }
    const head = new THREE.ExtrudeGeometry(hex, { depth: 0.04, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.006, bevelSegments: 3 }).translate(0, 0, -0.02).rotateY(Math.PI / 2);
    return {
      handle,
      heads: merge([head.clone().translate(0.1, 0, 0), head.clone().translate(-0.1, 0, 0)]),
      bands: merge([0.078, -0.078].map((x) => new THREE.CylinderGeometry(0.041, 0.041, 0.006, 6).rotateZ(Math.PI / 2).rotateX(Math.PI / 6).translate(x, 0, 0))),
    };
  }

  buildArm(side) {
    const s = side ? 1 : -1;
    const out = s * Math.PI / 2;
    const shoulder = new THREE.Group();
    shoulder.position.set(s * 0.2, 0.2, 0);
    this.chest.add(shoulder);
    this.add(ball(0.052, [0, 0, 0]), this.skin, shoulder);
    const upper = new THREE.Group();
    upper.rotation.order = "ZXY";
    shoulder.add(upper);
    const arm = limb([[0.0005, 0.066], [0.036, 0.054], [0.052, 0.022], [0.054, -0.03], [0.048, -0.1], [0.043, -0.18], [0.037, -0.25], [0.034, -0.28], [0.034, -0.29]], 1, 0.92);
    this.add(arm.geo, this.skin, upper);
    this.bulge("deltoid", side, upper, arm, [
      { a: out - s * 0.75, w: 0.75, y0: 0.05, y1: -0.13, peak: 0.6, amp: 0.016 },
      { a: out, w: 0.8, y0: 0.056, y1: -0.15, peak: 0.6, amp: 0.02 },
      { a: out + s * 0.75, w: 0.75, y0: 0.05, y1: -0.13, peak: 0.6, amp: 0.016 },
    ]);
    this.bulge("biceps", side, upper, arm, [
      { a: -0.28, w: 0.7, y0: -0.05, y1: -0.255, peak: 0.42, amp: 0.022 },
      { a: 0.28, w: 0.7, y0: -0.06, y1: -0.25, peak: 0.45, amp: 0.02 },
    ]);
    this.bulge("triceps", side, upper, arm, [
      { a: Math.PI - s * 0.3, w: 0.75, y0: -0.04, y1: -0.255, peak: 0.6, amp: 0.02 },
      { a: Math.PI + s * 0.5, w: 0.6, y0: -0.03, y1: -0.18, peak: 0.55, amp: 0.016 },
    ]);
    const elbow = new THREE.Group();
    elbow.position.y = -UPPER;
    upper.add(elbow);
    this.add(ball(0.035, [0, 0, 0]), this.skin, elbow);
    this.add(limb([[0.034, 0.025], [0.042, -0.03], [0.044, -0.07], [0.037, -0.13], [0.029, -0.19], [0.023, -0.232], [0.024, -0.26]], 1, 0.8, 32).geo, this.skin, elbow);
    this.add(oval([[0.026, -0.19], [0.03, -0.196], [0.03, -0.226], [0.026, -0.232]], 0.82), this.trim, elbow);
    this.add(new THREE.TorusGeometry(0.03, 0.0028, 6, 24).rotateX(Math.PI / 2).scale(1, 1, 0.82).translate(0, -0.211, 0), this.band, elbow);
    const hand = new THREE.Group();
    hand.position.y = -FORE;
    elbow.add(hand);
    const fist = [new RoundedBoxGeometry(0.062, 0.066, 0.038, 3, 0.015).translate(0, -0.042, 0), rod([0, 0.0, 0], [0, -0.02, 0], 0.024)];
    [-0.022, -0.0075, 0.0075, 0.022].forEach((x, k) => {
      const f = k === 0 || k === 3 ? 0.9 : 1;
      fist.push(...bar([[x, -0.074, 0.003], [x, -0.09 * f, 0.025], [x, -0.08 * f, 0.042], [x, -0.061, 0.04]], 0.0088, 8));
      fist.push(ball(0.0098, [x, -0.075, 0.006], [1, 1, 1], 12));
    });
    fist.push(...bar([[s * 0.031, -0.03, 0.01], [s * 0.03, -0.051, 0.032], [s * 0.013, -0.061, 0.044]], 0.0098, 8));
    this.add(merge(fist), this.skin, hand);
    const bell = new THREE.Group();
    bell.position.set(0, -0.068, 0.023);
    hand.add(bell);
    bell.add(new THREE.Mesh(this.bellGeo.handle, this.chrome), new THREE.Mesh(this.bellGeo.heads, this.iron), new THREE.Mesh(this.bellGeo.bands, this.band));
    bell.children.forEach((c) => (c.castShadow = true));
    const ring = this.add(new THREE.SphereGeometry(0.07, 16, 12), this.jointMat(), elbow);
    return { upper, elbow, bell, ring, s };
  }

  buildLeg(side) {
    const s = side ? 1 : -1;
    const thigh = new THREE.Group();
    thigh.position.set(s * HIP_X, -HIPS_UP, 0);
    this.hips.add(thigh);
    const th = limb([[0.086, 0.04], [0.087, -0.06], [0.08, -0.18], [0.068, -0.3], [0.055, -0.38], [0.05, -0.42], [0.05, -0.43]], 1, 0.95);
    this.add(th.geo, this.skin, thigh);
    this.add(oval([[0.092, 0.04], [0.097, -0.04], [0.103, -0.1], [0.104, -0.108]], 0.95), this.shorts, thigh);
    this.add(merge([xf(new THREE.TorusGeometry(0.103, 0.004, 6, 32), [0, -0.104, 0], [Math.PI / 2, 0, 0], [1, 0.95, 1]), rod([s * 0.095, 0.03, 0], [s * 0.104, -0.1, 0], 0.006, 6)]), this.accent, thigh);
    this.bulge("quads", side, thigh, th, [
      { a: 0, w: 0.62, y0: -0.07, y1: -0.37, peak: 0.55, amp: 0.02 },
      { a: s * 0.95, w: 0.65, y0: -0.06, y1: -0.35, peak: 0.5, amp: 0.02 },
      { a: -s * 0.72, w: 0.55, y0: -0.2, y1: -0.405, peak: 0.32, amp: 0.023 },
    ]);
    this.bulge("hams", side, thigh, th, [
      { a: Math.PI - s * 0.38, w: 0.55, y0: -0.09, y1: -0.38, peak: 0.55, amp: 0.018 },
      { a: Math.PI + s * 0.38, w: 0.55, y0: -0.1, y1: -0.39, peak: 0.5, amp: 0.018 },
    ]);
    const knee = new THREE.Group();
    knee.position.y = -THIGH;
    thigh.add(knee);
    const sh = limb([[0.05, 0.01], [0.052, -0.05], [0.048, -0.15], [0.038, -0.28], [0.031, -0.38], [0.031, -0.42]], 1, 0.95);
    this.add(merge([ball(0.05, [0, 0, 0]), ball(0.017, [0, 0.004, 0.044], [1, 1.2, 0.55])]), this.skin, knee);
    this.add(sh.geo, this.skin, knee);
    this.bulge("calves", side, knee, sh, [
      { a: Math.PI - 0.4, w: 0.62, y0: -0.03, y1: -0.25, peak: 0.66, amp: 0.029 },
      { a: Math.PI + 0.4, w: 0.62, y0: -0.035, y1: -0.235, peak: 0.66, amp: 0.025 },
    ]);
    this.add(oval([[0.034, -0.3], [0.037, -0.305], [0.037, -0.4], [0.034, -0.42]], 1), this.trim, knee);
    this.add(new THREE.TorusGeometry(0.037, 0.004, 6, 24).rotateX(Math.PI / 2).translate(0, -0.325, 0), this.accent, knee);
    const foot = new THREE.Group();
    foot.position.y = -SHIN;
    knee.add(foot);
    this.buildShoe(foot, s);
    const ring = this.add(new THREE.SphereGeometry(0.085, 16, 12), this.jointMat(), knee);
    return { thigh, knee, foot, ring, s };
  }

  buildShoe(foot, s) {
    const outline = new THREE.Shape();
    for (let i = 0; i <= 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      const y = 0.05 + Math.sin(a) * 0.115;
      const w = (y > 0.05 ? 0.046 + 0.006 * Math.sin(((y - 0.05) / 0.115) * Math.PI) : 0.038) * (1 + s * 0.08 * Math.max(0, Math.sin(a)));
      i ? outline.lineTo(Math.cos(a) * w, y) : outline.moveTo(Math.cos(a) * w, y);
    }
    const sole = (depth, y0) => new THREE.ExtrudeGeometry(outline, { depth, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.003, bevelSegments: 2, curveSegments: 6 }).rotateX(Math.PI / 2).translate(0, y0, 0);
    this.gum ??= new THREE.MeshPhysicalMaterial({ color: "#b8763e", roughness: 0.75 });
    this.shoeWhite ??= new THREE.MeshStandardMaterial({ color: "#c6cbd2", roughness: 0.6 });
    this.add(sole(0.008, -0.07), this.gum, foot);
    this.add(sole(0.014, -0.056), this.trim, foot);
    const upper = new THREE.SphereGeometry(1, 36, 24);
    const up = upper.attributes.position;
    for (let i = 0; i < up.count; i++) {
      const x = up.getX(i);
      let y = Math.max(up.getY(i), -0.44);
      const z = up.getZ(i);
      y *= 1 - Math.max(0, z) * 0.35;
      up.setXYZ(i, x * 0.046, y * 0.05 - 0.032, z * 0.1 + 0.046);
    }
    upper.computeVertexNormals();
    this.add(merge([upper, rod([0, 0.012, 0.055], [0, 0.03, 0.02], 0.016, 10)]), this.shoeWhite, foot);
    const laces = [];
    for (let k = 0; k < 4; k++) {
      const z = 0.05 + k * 0.016;
      const u = (z - 0.046) / 0.1;
      const y = Math.sqrt(1 - u * u) * (1 - u * 0.35) * 0.05 - 0.03;
      laces.push(rod([-0.019, y, z], [0.019, y, z], 0.0028, 6));
    }
    this.add(merge(laces), this.trim, foot);
    const accents = [xf(new THREE.TorusGeometry(0.036, 0.008, 8, 28), [0, -0.004, -0.004], [Math.PI / 2 + 0.25, 0, 0], [1, 1.25, 1])];
    for (const side of [-1, 1]) accents.push(...bar([[side * 0.046, -0.05, -0.03], [side * 0.05, -0.036, 0.04], [side * 0.042, -0.024, 0.1]], 0.004, 6));
    accents.push(xf(new THREE.SphereGeometry(0.03, 16, 10, 0, Math.PI, 0, Math.PI / 2), [0, -0.05, -0.03], [-Math.PI / 2, Math.PI, 0], [1.3, 0.9, 1]));
    this.add(merge(accents), this.accent, foot);
  }

  jointMat() {
    this.joint ??= new THREE.MeshStandardMaterial({ color: "#ffb03d", emissive: "#ff9a3d", emissiveIntensity: 0.8, transparent: true, opacity: 0, depthWrite: false });
    return this.joint;
  }

  buildTendons() {
    this.tendonMat = new THREE.MeshPhysicalMaterial({ color: "#e8e4ee", roughness: 0.4, clearcoat: 0.5, emissive: TENDON, emissiveIntensity: 0 });
    const cord = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
    this.tendons = [];
    for (const a of this.arms) {
      this.tendons.push([a.upper, [0, -0.245, 0.032], a.elbow, [0, -0.045, 0.028], 0.012]);
      this.tendons.push([a.upper, [0, -0.25, -0.036], a.elbow, [0, 0.0, -0.04], 0.012]);
    }
    for (const l of this.legs) {
      this.tendons.push([l.thigh, [0, -0.39, 0.05], l.knee, [0, -0.07, 0.045], 0.016]);
      this.tendons.push([l.knee, [0, -0.24, -0.04], l.foot, [0, -0.03, -0.04], 0.014]);
    }
    this.tendons = this.tendons.map(([pa, a, pb, b, w]) => {
      const mesh = new THREE.Mesh(cord, this.tendonMat);
      this.root.add(mesh);
      return { mesh, pa, a: V(a), pb, b: V(b), w };
    });
  }

  /**
   * p: { x, y, yaw, squat, stance, lean, crunch, twist, bend, heel, nod, blink, breath,
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
    this.chest.scale.set(1, 1 + 0.012 * p.breath, 1 + 0.025 * p.breath);
    this.head.rotation.set(p.nod - (p.lean + p.crunch) * 0.4, 0, -p.bend * 0.3);
    for (const lid of this.lids) lid.rotation.x = -0.6 + 2.0 * p.blink;
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
    for (const [key, m] of Object.entries(this.muscles)) m.set(acts[key] || 0);
    this.abs.set(acts.abs || 0);
    for (const [g, mat] of Object.entries(this.mats)) {
      const k = glow[g] || 0;
      mat.color.copy(this.skinColor).lerp(this.base[g], 0.6 * k);
      mat.emissive.copy(this.base[g]).multiplyScalar(0.1 * k);
      mat.userData.rim.value.copy(this.base[g]).multiplyScalar(0.55 * k);
    }
    this.root.updateMatrixWorld(true);
    const local = (obj, v) => this.root.worldToLocal(obj.localToWorld(this.tmp.copy(v)).clone());
    for (const td of this.tendons) {
      td.mesh.visible = tendon > 0.01;
      strap(td.mesh, local(td.pa, td.a), local(td.pb, td.b), td.w * (0.6 + tendon * 0.8));
    }
    this.tendonMat.emissiveIntensity = tendon * 0.5;
    this.joint.opacity = joint * 0.55;
    for (const r of [...this.arms, ...this.legs]) r.ring.visible = joint > 0.01;
  }

  world(key, out = new THREE.Vector3()) {
    const m = key === "abs" ? this.abs : this.muscles[key];
    return m.mesh.localToWorld(m.point(0.5, out));
  }

  /** Span of a muscle along the limb, as two world points. */
  ends(key, a = new THREE.Vector3(), b = new THREE.Vector3()) {
    const m = this.muscles[key];
    m.mesh.localToWorld(m.point(1, a));
    m.mesh.localToWorld(m.point(0, b));
    return [a, b];
  }
}

/** Point a unit-height, y-aligned mesh from a to b (both in its parent's space). */
function strap(mesh, a, b, width) {
  const d = new THREE.Vector3().subVectors(b, a);
  const len = d.length();
  mesh.position.copy(a).addScaledVector(d, 0.5);
  mesh.quaternion.setFromUnitVectors(UP, d.multiplyScalar(1 / Math.max(len, 1e-6)));
  mesh.scale.set(width, len, width);
}
