import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { hash } from "@gizclaw/mvg-core/timing.js";

// Metres: the skeleton stands about 1.9 tall with its soles at y = 0, facing +z,
// with a slightly oversized, friendly skull. Side 0 is the skeleton's right
// (screen left when it faces the camera); s = -1 / +1 places a part on that side.
const THIGH = 0.45;
const SHIN = 0.43;
const UPPER = 0.3;
const FORE = 0.27;
const ANKLE = 0.06;
const HIP_X = 0.1;
const LINKS = 12;
const LINK_H = 0.045;
const CHEST_LINK = 6;
const HIPS_UP = 0.04;
const HEAD_SCALE = 1.18;

const UP = new THREE.Vector3(0, 1, 0);
const V = (p) => new THREE.Vector3(...p);

function xf(geo, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) {
  return geo.applyMatrix4(new THREE.Matrix4().compose(V(p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), V(s)));
}
/** Adds a view-facing rim term (userData.rim, a Color) to a lit material's emissive. */
function rimLight(mat) {
  mat.userData.rim = { value: new THREE.Color(0) };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uRim = mat.userData.rim;
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec3 uRim;")
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += uRim * pow(1.0 - clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0), 2.4);");
  };
  return mat;
}
const merge = (geos) => mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g)));
const lathe = (pts, seg = 20) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.0004), y)), seg);
const ball = (r, p, s = [1, 1, 1], seg = 14) => xf(new THREE.SphereGeometry(r, seg, Math.round(seg * 0.75)), p, [0, 0, 0], s);

/** A capsule from a to b. */
function rod(a, b, r, seg = 8) {
  const A = V(a);
  const d = V(b).sub(A);
  const len = d.length();
  const g = new THREE.CapsuleGeometry(r, Math.max(len - 2 * r, 0.0005), 3, seg);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.clone().normalize()));
  return g.translate(A.x + d.x / 2, A.y + d.y / 2, A.z + d.z / 2);
}

/** A tube along a smooth curve, capped with balls. */
function bar(pts, r, rad = 8) {
  const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(V)), pts.length * 8, r, rad);
  return [g, ball(r, pts[0], [1, 1, 1], 10), ball(r, pts.at(-1), [1, 1, 1], 10)];
}

/** A long bone hanging from y = 0 to -len: waisted shaft, knobbly epiphyses. */
function longBone(len, shaft, top, bottom, seg = 20) {
  const pts = [[0, -len - bottom * 0.5], [bottom * 0.72, -len - bottom * 0.32]];
  for (let i = 0; i <= 26; i++) {
    const u = i / 26;
    const eB = Math.exp(-Math.pow(u / 0.11, 2));
    const eT = Math.exp(-Math.pow((1 - u) / 0.11, 2));
    pts.push([shaft * (1 + 0.4 * Math.pow(Math.abs(u - 0.5) * 2, 3)) + (bottom - shaft) * eB + (top - shaft) * eT, -len + u * len]);
  }
  pts.push([top * 0.72, top * 0.32], [0, top * 0.5]);
  return lathe(pts, seg);
}

/** A curled finger or toe from `base`, each segment bending `curl` toward +z. */
function digit(base, dir, lens, r, curl) {
  const parts = [];
  let p = V(base);
  let a = Math.atan2(dir[2], -dir[1]);
  const side = dir[0];
  lens.forEach((len, k) => {
    const q = p.clone().add(new THREE.Vector3(side * len * 0.3, -Math.cos(a) * len, Math.sin(a) * len));
    parts.push(rod(p.toArray(), q.toArray(), r * (1 - k * 0.12), 6), ball(r * 1.25 * (1 - k * 0.1), q.toArray(), [1, 1, 1], 8));
    p = q;
    a += curl;
  });
  return parts;
}

function boneTextures() {
  const make = (draw) => {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    draw(c.getContext("2d"));
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 3);
    return tex;
  };
  const bump = make((g) => {
    g.fillStyle = "#909090";
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 90; i++) {
      g.fillStyle = `rgba(255,255,255,${0.05 + hash(i * 7.7) * 0.08})`;
      g.beginPath();
      g.arc(hash(i * 1.9) * 256, hash(i * 2.3) * 256, 8 + hash(i * 3.1) * 26, 0, 7);
      g.fill();
    }
    for (let i = 0; i < 3200; i++) {
      g.fillStyle = `rgba(0,0,0,${0.2 + hash(i * 5.3) * 0.45})`;
      g.beginPath();
      g.arc(hash(i * 1.31) * 256, hash(i * 2.17) * 256, 0.5 + hash(i * 3.7) * 1.3, 0, 7);
      g.fill();
    }
  });
  const map = make((g) => {
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 70; i++) {
      g.fillStyle = `rgba(190,160,110,${0.05 + hash(i * 4.9) * 0.08})`;
      g.beginPath();
      g.arc(hash(i * 8.1) * 256, hash(i * 6.7) * 256, 10 + hash(i * 2.9) * 30, 0, 7);
      g.fill();
    }
    for (let i = 0; i < 1400; i++) {
      g.fillStyle = `rgba(120,96,70,${0.15 + hash(i * 9.1) * 0.25})`;
      g.fillRect(hash(i * 3.3) * 256, hash(i * 4.4) * 256, 1, 1);
    }
  });
  map.colorSpace = THREE.SRGBColorSpace;
  return { map, bump };
}

export class Skeleton {
  constructor() {
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    const { map, bump } = boneTextures();
    const bone = new THREE.MeshPhysicalMaterial({ color: "#fbf1dc", map, bumpMap: bump, bumpScale: 1.2, roughness: 0.62, clearcoat: 0.18, clearcoatRoughness: 0.5, emissive: "#ffffff", emissiveIntensity: 0 });
    const names = ["skull", "ribs", "spine", "clavicle0", "clavicle1", "pelvis", "femur", "arm", "shin", "shoulder", "elbow", "hip", "knee"];
    this.mats = Object.fromEntries(names.map((n) => [n, bone.clone()]));
    Object.values(this.mats).forEach(rimLight);
    this.mats.pelvis.side = THREE.DoubleSide;
    this.mats.skull.transparent = true;
    this.socket = new THREE.MeshStandardMaterial({ color: "#1a1214", roughness: 0.9, transparent: true });
    this.enamel = new THREE.MeshPhysicalMaterial({ color: "#fffaf0", roughness: 0.25, clearcoat: 0.7, clearcoatRoughness: 0.2, transparent: true });
    this.cartilage = rimLight(new THREE.MeshPhysicalMaterial({ color: "#eef6ff", roughness: 0.3, clearcoat: 0.6, sheen: 0.4, emissive: "#ffffff", emissiveIntensity: 0.04 }));
    this.markers = {};
    this.pieces = [];

    this.hips = new THREE.Group();
    this.body.add(this.hips);
    this.buildPelvis();
    this.buildSpine();
    this.buildChest();
    this.buildHead();
    this.arms = [0, 1].map((side) => this.buildArm(side));
    this.legs = [0, 1].map((side) => this.buildLeg(side));
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

  add(geo, mat, parent, piece = true) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    parent.add(m);
    if (piece) this.pieces.push({ mesh: m, base: m.position.clone(), rot: m.rotation.clone() });
    return m;
  }

  mark(name, parent, x = 0, y = 0, z = 0) {
    const o = new THREE.Object3D();
    o.position.set(x, y, z);
    parent.add(o);
    this.markers[name] = o;
  }

  buildPelvis() {
    const parts = [];
    for (const s of [-1, 1]) {
      const wingM = new THREE.Matrix4().compose(V([0, 0.0, -0.015]), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.2, 0, 0)), V([1.35, 1.3, 0.7]));
      const phi0 = s < 0 ? -1.32 : Math.PI - 0.88;
      parts.push(new THREE.SphereGeometry(0.1, 36, 20, phi0, 2.2, 0.16 * Math.PI, 0.4 * Math.PI).applyMatrix4(wingM));
      const crest = [];
      for (let i = 0; i <= 12; i++) {
        const phi = phi0 + (i / 12) * 2.2;
        const th = 0.16 * Math.PI;
        crest.push(new THREE.Vector3(-0.1 * Math.cos(phi) * Math.sin(th), 0.1 * Math.cos(th), 0.1 * Math.sin(phi) * Math.sin(th)).applyMatrix4(wingM).toArray());
      }
      parts.push(...bar(crest, 0.007));
      parts.push(rod([s * 0.08, 0.0, 0.0], [s * 0.095, -0.035, 0.008], 0.02));
      parts.push(xf(new THREE.TorusGeometry(0.031, 0.008, 8, 24), [s * 0.1, -0.04, 0.0], [0, Math.PI / 2, 0]));
      parts.push(xf(new THREE.TorusGeometry(0.025, 0.0085, 8, 24), [s * 0.052, -0.075, 0.036], [0, s * 0.55, 0], [1, 1.3, 1]));
      parts.push(ball(0.016, [s * 0.066, -0.108, 0.005], [1, 1.2, 1]));
      parts.push(rod([s * 0.045, 0.065, -0.07], [s * 0.075, 0.06, -0.045], 0.014));
    }
    parts.push(rod([-0.022, -0.068, 0.062], [0.022, -0.068, 0.062], 0.013));
    const sacrum = new THREE.Shape();
    sacrum.moveTo(-0.048, 0.065);
    sacrum.lineTo(0.048, 0.065);
    sacrum.quadraticCurveTo(0.042, 0.0, 0.0, -0.07);
    sacrum.quadraticCurveTo(-0.042, 0.0, -0.048, 0.065);
    parts.push(xf(new THREE.ExtrudeGeometry(sacrum, { depth: 0.018, bevelEnabled: true, bevelSize: 0.007, bevelThickness: 0.006, bevelSegments: 3, curveSegments: 10 }), [0, 0.035, -0.075], [-0.35, 0, 0]));
    for (let k = 0; k < 3; k++) parts.push(ball(0.009 - k * 0.002, [0, -0.04 - k * 0.016, -0.085 + k * 0.012]));
    this.add(merge(parts), this.mats.pelvis, this.hips);
  }

  buildSpine() {
    const vertebra = (r, h) => merge([
      lathe([[0, 0], [r * 0.9, 0], [r, h * 0.16], [r * 0.88, h * 0.5], [r, h * 0.84], [r * 0.9, h], [0, h]]),
      xf(new THREE.TorusGeometry(r * 0.62, r * 0.2, 8, 18, Math.PI), [0, h * 0.55, -r * 0.85], [-Math.PI / 2, 0, 0]),
      rod([0, h * 0.6, -r * 1.4], [0, -h * 0.5, -r * 2.7], r * 0.2),
      rod([-r * 0.5, h * 0.62, -r * 1.15], [-r * 1.75, h * 0.72, -r * 1.45], r * 0.17),
      rod([r * 0.5, h * 0.62, -r * 1.15], [r * 1.75, h * 0.72, -r * 1.45], r * 0.17),
    ]);
    const kinds = [[0.031, 0.032], [0.025, 0.028], [0.018, 0.022]].map(([r, h]) => ({ r, h, geo: vertebra(r, h), disc: new THREE.CylinderGeometry(r * 0.9, r * 0.9, (LINK_H - h) * 0.85, 18) }));
    this.links = [];
    let parent = this.hips;
    for (let k = 0; k < LINKS; k++) {
      const g = new THREE.Group();
      g.position.set(0, k === 0 ? 0.1 : LINK_H, k === 0 ? -0.04 : 0);
      parent.add(g);
      const kind = kinds[k < 4 ? 0 : k < LINKS - 2 ? 1 : 2];
      const body = this.add(kind.geo, this.mats.spine, g);
      const disc = this.add(kind.disc, this.cartilage, g);
      disc.position.y = kind.h + (LINK_H - kind.h) / 2;
      this.pieces.at(-1).base.copy(disc.position);
      this.links.push({ g, body });
      parent = g;
    }
  }

  buildChest() {
    const chest = new THREE.Group();
    this.links[CHEST_LINK].g.add(chest);
    this.chest = chest;
    const rx = [0.075, 0.105, 0.126, 0.139, 0.144, 0.141, 0.13];
    const zf = [0.15, 0.165, 0.175, 0.18, 0.178, 0.168, 0.14];
    const ribs = [];
    const cart = [];
    for (let k = 0; k < 7; k++) {
      const y = 0.215 - k * 0.042;
      for (const s of [-1, 1]) {
        const pts = [[s * 0.028, y, -0.03], [s * 0.075, y + 0.004, -0.058], [s * rx[k] * 0.95, y - 0.02, -0.002], [s * rx[k], y - 0.045, 0.068], [s * rx[k] * 0.76, y - 0.07, 0.132]];
        if (k < 6) pts.push([s * rx[k] * 0.44, y - 0.08, zf[k]]);
        ribs.push(...bar(pts, 0.0085));
        if (k < 6) {
          const ys = k < 5 ? 0.215 - k * 0.04 : 0.04;
          const end = pts.at(-1);
          cart.push(...bar([end, [s * rx[k] * 0.24, (end[1] + ys) / 2 - 0.006, zf[k] + 0.014], [s * 0.02, ys, 0.188]], 0.0068));
        }
      }
    }
    const st = new THREE.Shape();
    st.moveTo(0, 0.235);
    for (const [x, y] of [[0.026, 0.232], [0.03, 0.205], [0.017, 0.185], [0.021, 0.1], [0.016, 0.04], [0.006, 0.005], [0, -0.02]]) st.lineTo(x, y);
    for (const [x, y] of [[-0.006, 0.005], [-0.016, 0.04], [-0.021, 0.1], [-0.017, 0.185], [-0.03, 0.205], [-0.026, 0.232]]) st.lineTo(x, y);
    ribs.push(xf(new THREE.ExtrudeGeometry(st, { depth: 0.01, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 2 }), [0, 0, 0.18]));
    this.add(merge(ribs), this.mats.ribs, chest);
    this.add(merge(cart), this.cartilage, chest);

    // Clavicles hinge at the top of the sternum; each carries its scapula and shoulder.
    this.clavicles = [0, 1].map((side) => {
      const s = side ? 1 : -1;
      const g = new THREE.Group();
      g.position.set(s * 0.024, 0.232, 0.19);
      chest.add(g);
      const end = [s * 0.17, 0.02, -0.13];
      this.add(merge(bar([[0, 0, 0], [s * 0.045, 0.006, 0.006], [s * 0.095, 0.013, -0.028], [s * 0.135, 0.017, -0.085], end], 0.0095)), this.mats[`clavicle${side}`], g);
      const tip = new THREE.Group();
      tip.position.set(...end);
      g.add(tip);
      const blade = new THREE.Shape();
      blade.moveTo(-s * 0.008, -0.012);
      blade.lineTo(-s * 0.112, 0.0);
      blade.quadraticCurveTo(-s * 0.11, -0.09, -s * 0.085, -0.165);
      blade.quadraticCurveTo(-s * 0.04, -0.09, -s * 0.008, -0.012);
      const scap = merge([
        xf(new THREE.ExtrudeGeometry(blade, { depth: 0.006, bevelEnabled: true, bevelSize: 0.005, bevelThickness: 0.004, bevelSegments: 2, curveSegments: 8 }), [0, -0.005, -0.115]),
        ...bar([[-s * 0.1, -0.03, -0.1], [-s * 0.05, -0.016, -0.096], [-s * 0.005, 0.004, -0.06]], 0.0065),
        ball(0.013, [0, 0.008, -0.035], [1.3, 0.7, 1.4]),
      ]);
      const sm = this.add(scap, this.mats.arm, tip);
      sm.rotation.y = s * 0.28;
      this.pieces.at(-1).rot = sm.rotation.clone();
      this.mark(`clavicle${side}`, g, end[0] * 0.5, end[1] * 0.5 + 0.01, end[2] * 0.5 + 0.01);
      return { g, tip };
    });
  }

  buildHead() {
    const head = new THREE.Group();
    head.position.set(0, LINK_H, 0.01);
    head.scale.setScalar(HEAD_SCALE);
    this.links[LINKS - 1].g.add(head);
    this.head = head;

    const cranium = new THREE.SphereGeometry(0.118, 48, 36);
    const p = cranium.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i);
      let y = p.getY(i);
      let z = p.getZ(i);
      if (z < 0) z *= 1.12;
      x *= 0.9 - 0.06 * Math.max(0, -y / 0.118);
      if (y < -0.02 && z > 0.02) z *= 0.85;
      p.setXYZ(i, x, y, z);
    }
    cranium.computeVertexNormals();
    const skull = [xf(cranium, [0, 0.14, -0.006]), ball(0.08, [0, 0.088, 0.042], [1.0, 0.72, 0.84], 24)];
    for (const s of [-1, 1]) {
      skull.push(ball(0.026, [s * 0.067, 0.088, 0.076], [1.25, 0.85, 1.0]));
      skull.push(rod([s * 0.07, 0.086, 0.064], [s * 0.098, 0.09, -0.012], 0.0085));
      skull.push(xf(new THREE.TorusGeometry(0.033, 0.007, 10, 28), [s * 0.044, 0.126, 0.106], [0, s * 0.18, 0], [1, 1.08, 1]));
      skull.push(ball(0.02, [s * 0.086, 0.07, -0.024], [0.8, 1.1, 1]));
    }
    skull.push(...bar([[-0.086, 0.155, 0.076], [-0.045, 0.168, 0.104], [0, 0.161, 0.112], [0.045, 0.168, 0.104], [0.086, 0.155, 0.076]], 0.011));
    const arc = (r, y, z0, a0, a1, n = 9) => Array.from({ length: n }, (_, k) => {
      const a = a0 + ((a1 - a0) * k) / (n - 1);
      return [Math.sin(a) * r, y, Math.cos(a) * r + z0];
    });
    skull.push(...bar(arc(0.056, 0.05, 0.032, -1.25, 1.25), 0.013));
    this.add(merge(skull), this.mats.skull, head);

    const nose = new THREE.Shape();
    nose.moveTo(0, 0.022);
    nose.bezierCurveTo(0.012, 0.012, 0.017, -0.004, 0.009, -0.012);
    nose.lineTo(0, -0.006);
    nose.lineTo(-0.009, -0.012);
    nose.bezierCurveTo(-0.017, -0.004, -0.012, 0.012, 0, 0.022);
    const dark = [xf(new THREE.ExtrudeGeometry(nose, { depth: 0.008, bevelEnabled: true, bevelSize: 0.002, bevelThickness: 0.002, bevelSegments: 1, curveSegments: 8 }), [0, 0.086, 0.104])];
    for (const s of [-1, 1]) dark.push(ball(0.031, [s * 0.044, 0.126, 0.099], [1, 1.08, 0.55], 20));
    this.add(merge(dark), this.socket, head);

    const teeth = (r, y, z0, dy) => merge(Array.from({ length: 10 }, (_, k) => {
      const a = -0.95 + (k / 9) * 1.9;
      const big = Math.abs(a) < 0.3 ? 1.15 : 1;
      return xf(new THREE.CapsuleGeometry(0.0072 * big, 0.011 * big, 3, 8), [Math.sin(a) * r, y + dy * (big - 1) * 4, Math.cos(a) * r + z0], [0, a, 0], [1, 1, 0.7]);
    }));
    this.add(teeth(0.058, 0.036, 0.03, -0.01), this.enamel, head);

    this.jaw = new THREE.Group();
    this.jaw.position.set(0, 0.075, -0.005);
    head.add(this.jaw);
    const jaw = [...bar([[-0.072, 0, 0], [-0.07, -0.058, 0.004], [-0.054, -0.088, 0.048], [0, -0.1, 0.082], [0.054, -0.088, 0.048], [0.07, -0.058, 0.004], [0.072, 0, 0]], 0.013, 10), ball(0.019, [0, -0.1, 0.082], [1.5, 0.9, 0.9])];
    for (const s of [-1, 1]) {
      jaw.push(ball(0.014, [s * 0.072, 0.002, 0], [1, 0.8, 1.2]));
      jaw.push(rod([s * 0.066, -0.035, 0.012], [s * 0.058, -0.008, 0.034], 0.0075));
    }
    jaw.push(...bar(arc(0.05, -0.08, 0.03, -1.15, 1.15), 0.011));
    this.add(merge(jaw), this.mats.skull, this.jaw);
    this.add(teeth(0.052, -0.064, 0.032, 0.01), this.enamel, this.jaw);

    const bg = new THREE.SphereGeometry(0.096, 40, 28);
    const bp = bg.attributes.position;
    for (let i = 0; i < bp.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(bp, i);
      const n = Math.sin(v.x * 140) * Math.sin(v.y * 120 + v.z * 90) * 0.006 + (Math.abs(v.x) < 0.006 ? -0.01 : 0);
      v.multiplyScalar(1 + n / 0.096);
      bp.setXYZ(i, v.x, v.y, v.z);
    }
    bg.computeVertexNormals();
    this.brain = new THREE.Mesh(bg, new THREE.MeshStandardMaterial({ color: "#ff8fb0", roughness: 0.5, emissive: "#ff4f8a", emissiveIntensity: 0.25 }));
    this.brain.position.set(0, 0.145, -0.01);
    this.brain.scale.set(0.84, 0.8, 1.02);
    head.add(this.brain);
  }

  buildArm(side) {
    const s = side ? 1 : -1;
    const shoulder = new THREE.Group();
    this.clavicles[side].tip.add(shoulder);
    this.add(ball(0.03, [0, -0.016, -0.004], [1, 1, 1], 18), this.mats.shoulder, shoulder);
    const upper = new THREE.Group();
    shoulder.add(upper);
    this.add(merge([
      xf(longBone(UPPER - 0.03, 0.0135, 0.024, 0.022), [0, -0.018, 0]),
      ball(0.016, [0.014, -UPPER + 0.01, 0.004]),
      ball(0.016, [-0.014, -UPPER + 0.01, 0.004]),
      ball(0.009, [0.028, -UPPER + 0.022, 0]),
      ball(0.009, [-0.028, -UPPER + 0.022, 0]),
    ]), this.mats.arm, upper);
    const elbow = new THREE.Group();
    elbow.position.y = -UPPER;
    upper.add(elbow);
    this.add(ball(0.019, [0, -0.004, 0]), this.mats.elbow, elbow);
    this.add(merge([
      xf(longBone(FORE - 0.012, 0.0078, 0.014, 0.01), [-s * 0.015, -0.006, -0.004]),
      xf(longBone(FORE - 0.01, 0.0082, 0.011, 0.016), [s * 0.015, -0.006, 0.004]),
      ball(0.013, [-s * 0.015, 0.008, -0.014], [1, 1.4, 1]),
    ]), this.mats.arm, elbow);
    const hand = new THREE.Group();
    hand.position.y = -FORE;
    elbow.add(hand);
    const bones = [];
    for (let k = 0; k < 6; k++) bones.push(ball(0.0085, [(k % 3 - 1) * 0.013, -0.008 - Math.floor(k / 3) * 0.013, 0.002]));
    [[s * 0.014, 1], [s * 0.004, 1.06], [-s * 0.006, 1], [-s * 0.016, 0.86]].forEach(([x, f]) => {
      const tip = [x * 1.2, -0.068 * f, 0.004];
      bones.push(rod([x, -0.022, 0.002], tip, 0.0046, 6), ball(0.0058, tip, [1, 1, 1], 8));
      bones.push(...digit(tip, [x * 0.4, -1, 0], [0.025 * f, 0.016 * f, 0.012 * f], 0.0042, 0.28));
    });
    const tb = [s * 0.03, -0.044, 0.016];
    bones.push(rod([s * 0.016, -0.02, 0.004], tb, 0.0048, 6), ball(0.006, tb, [1, 1, 1], 8));
    bones.push(...digit(tb, [s * 0.6, -1, 0.5], [0.019, 0.015], 0.0045, 0.25));
    this.add(merge(bones), this.mats.arm, hand);
    return { upper, elbow, s };
  }

  buildLeg(side) {
    const s = side ? 1 : -1;
    const thigh = new THREE.Group();
    thigh.position.set(s * HIP_X, -HIPS_UP, 0);
    this.hips.add(thigh);
    this.add(ball(0.03, [-s * 0.004, 0.006, 0], [1, 1, 1], 18), this.mats.hip, thigh);
    this.add(merge([
      rod([-s * 0.004, 0.0, 0], [s * 0.014, -0.034, 0], 0.014),
      ball(0.02, [s * 0.027, -0.024, -0.004], [1, 1.2, 1]),
      xf(longBone(THIGH - 0.05, 0.0165, 0.022, 0.028), [s * 0.006, -0.03, 0]),
      ball(0.024, [0.019, -THIGH + 0.018, -0.004], [1, 1.1, 1.3]),
      ball(0.024, [-0.019, -THIGH + 0.018, -0.004], [1, 1.1, 1.3]),
    ]), this.mats.femur, thigh);
    const knee = new THREE.Group();
    knee.position.y = -THIGH;
    thigh.add(knee);
    this.add(merge([ball(0.021, [0, 0.012, 0.034], [1, 1.25, 0.55], 16), xf(new THREE.TorusGeometry(0.021, 0.006, 8, 24), [0, -0.008, 0], [Math.PI / 2, 0, 0], [1.4, 1, 1])]), this.mats.knee, knee);
    this.add(merge([
      xf(longBone(SHIN - 0.02, 0.0145, 0.029, 0.019), [-s * 0.006, -0.02, 0]),
      ball(0.01, [-s * 0.004, -0.055, 0.022]),
      ball(0.012, [-s * 0.022, -SHIN + 0.012, 0]),
      xf(longBone(SHIN - 0.05, 0.006, 0.011, 0.011), [s * 0.026, -0.032, -0.008]),
      ball(0.011, [s * 0.028, -SHIN + 0.006, -0.006]),
    ]), this.mats.shin, knee);
    const foot = new THREE.Group();
    foot.position.y = -SHIN;
    knee.add(foot);
    const bones = [ball(0.02, [0, -0.012, 0.004], [1, 0.8, 1.2]), rod([0, -0.024, 0], [0, -0.042, -0.048], 0.018)];
    for (let k = 0; k < 4; k++) bones.push(ball(0.009, [(k - 1.5) * 0.012, -0.028, 0.036]));
    bones.push(ball(0.011, [s * 0.02, -0.034, 0.02]));
    [-s * 0.02, -s * 0.009, s * 0.001, s * 0.011, s * 0.02].forEach((x, k) => {
      const r = k === 0 ? 0.0072 : 0.0052;
      const tip = [x * 1.3, -0.051, 0.11 - k * 0.006];
      bones.push(rod([x, -0.032, 0.04], tip, r, 6), ball(r * 1.2, tip, [1, 1, 1], 8));
      bones.push(rod(tip, [tip[0], -0.054, tip[2] + 0.022 - k * 0.002], r * 0.9, 6), ball(r, [tip[0], -0.054, tip[2] + 0.022 - k * 0.002], [1, 1, 1], 8));
    });
    this.add(merge(bones), this.mats.shin, foot);
    this.mark(`hip${side}`, thigh);
    this.mark(`knee${side}`, knee, 0, 0, 0.03);
    return { thigh, knee, foot, s };
  }

  /** Heart, lungs, muscles, tendons and ligaments: hidden until the song names them. */
  buildSoft() {
    const soft = (color, opacity) => new THREE.MeshPhysicalMaterial({ color, roughness: 0.38, clearcoat: 0.5, transparent: true, opacity, depthWrite: false, emissive: color, emissiveIntensity: 0.2 });
    this.organs = new THREE.Group();
    this.chest.add(this.organs);
    const red = soft("#e8364f", 0.95);
    const heart = new THREE.Group();
    heart.position.set(0.03, 0.06, 0.1);
    heart.rotation.z = -0.35;
    this.organs.add(heart);
    for (const dx of [-0.018, 0.018]) heart.add(new THREE.Mesh(new THREE.SphereGeometry(0.026, 18, 12), red).translateX(dx));
    heart.add(new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.06, 18).rotateX(Math.PI), red).translateY(-0.03));
    this.heart = heart;
    const lung = soft("#ffb0c0", 0.75);
    for (const s of [-1, 1]) {
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.06, 20, 14), lung);
      l.position.set(s * 0.075, 0.08, 0.075);
      l.scale.set(0.85, 1.55, 0.95);
      this.organs.add(l);
    }

    this.muscleMat = soft("#c83a48", 0.75);
    this.tendonMat = new THREE.MeshPhysicalMaterial({ color: "#f4f0ff", roughness: 0.3, clearcoat: 0.6, emissive: "#ffffff", emissiveIntensity: 0.2 });
    this.ligMat = new THREE.MeshPhysicalMaterial({ color: "#ffe58a", roughness: 0.4, clearcoat: 0.4, emissive: "#ffd24a", emissiveIntensity: 0.3 });
    const spindle = lathe(Array.from({ length: 17 }, (_, i) => [0.5 * Math.pow(Math.sin((i / 16) * Math.PI), 0.75), -0.5 + i / 16]), 18);
    const cord = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
    this.biceps = this.arms.map((a) => a.upper.add(new THREE.Mesh(spindle, this.muscleMat)).children.at(-1));
    this.quads = this.legs.map((l) => l.thigh.add(new THREE.Mesh(spindle, this.muscleMat)).children.at(-1));
    this.tendons = [...this.arms, ...this.legs].map(() => this.root.add(new THREE.Mesh(cord, this.tendonMat)).children.at(-1));
    this.ligaments = this.legs.flatMap(() => [-1, 1].map(() => this.root.add(new THREE.Mesh(cord, this.ligMat)).children.at(-1)));
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
      l.thigh.rotation.set(-a - leg.lift - p.lean * 0.3, 0, l.s * p.stance - p.bend * 0.25);
      l.knee.rotation.set(2 * a + leg.knee, 0, 0);
      l.foot.rotation.set(-a - leg.knee + leg.lift, 0, -l.s * p.stance);
    });
    this.links.forEach((k, i) => {
      k.g.rotation.set((p.lean * 0.7) / LINKS + (i >= LINKS - 2 ? p.nod * 0.5 : 0), (p.twist * 0.7) / LINKS, (p.bend * 0.75 * Math.sin(((i + 1) / LINKS) * Math.PI * 1.4)) / LINKS * 2.2);
      const pop = p.pop[i] || 0;
      k.body.scale.set(1 + pop * 0.6, 1 + pop * 0.4, 1 + pop * 0.6);
    });
    this.head.rotation.set(p.nod * 0.6, p.twist * 0.25, -p.bend * 0.3);
    this.jaw.rotation.x = p.jaw * 0.4;
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
    for (const m of [this.mats.skull, this.socket, this.enamel]) {
      m.opacity = 1 - xray * 0.72;
      m.depthWrite = xray < 0.5;
    }
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

/** Point a unit-height, y-aligned mesh from a to b (both in its parent's space). */
function strap(mesh, a, b, width) {
  const d = new THREE.Vector3().subVectors(b, a);
  const len = d.length();
  mesh.position.copy(a).addScaledVector(d, 0.5);
  mesh.quaternion.setFromUnitVectors(UP, d.multiplyScalar(1 / Math.max(len, 1e-6)));
  mesh.scale.set(width, len, width);
}
