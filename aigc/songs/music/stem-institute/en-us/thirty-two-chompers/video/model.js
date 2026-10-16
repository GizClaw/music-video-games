import * as THREE from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { hash, smooth } from "@gizclaw/mvg-core/timing.js";
import { PERMANENT, PRIMARY, TYPES } from "./constants.js";

// Model space is millimetres of a life-size typodont: x across, y up from the
// occlusal plane (where the closed bite meets), z toward the viewer. Each jaw
// is built crowns-up in its own frame; the upper one is then turned over.
const HINGE = new THREE.Vector3(0, 0, -44);
/** Parabolic arches z = front − x² / spread; the lower sits inside the upper (overjet). */
const ARCHES = { upper: { front: 26, spread: 14.5 }, lower: { front: 21.8, spread: 13.2 } };
/** Where each crown's tip sits above the occlusal plane: incisors overlap (overbite), cusps just meet. */
const TIP = { incisor: 1.5, canine: 0.8, premolar: -0.25, molar: -0.25 };
const BASE_BOTTOM = -17;
const PLINTH = [-17, -22.5];
/** The stand from the counter up to the hinge. */
export const POST = 72;

function archCurve({ front, spread }, halfLength) {
  const pts = [];
  let len = 0;
  let prev = null;
  for (let x = 0; len < halfLength; x += 0.25) {
    const p = new THREE.Vector3(x, 0, front - (x * x) / spread);
    if (prev) len += p.distanceTo(prev);
    pts.push(p);
    prev = p;
  }
  return new THREE.CatmullRomCurve3([...pts.slice(1).reverse().map((p) => new THREE.Vector3(-p.x, 0, p.z)), ...pts]);
}

const spow = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);
const bump = (x, z, cx, cz, r) => Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / r);

/** Grey noise for bump maps: fine stipple (gum, meat, kernel) or papillae dots (tongue). */
export function noiseTexture(kind, size = 256, seed = 1) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  g.fillStyle = "#808080";
  g.fillRect(0, 0, size, size);
  const n = kind === "dots" ? 1400 : 3200;
  for (let i = 0; i < n; i++) {
    const x = hash(i * 1.3 + seed) * size;
    const y = hash(i * 2.7 + seed) * size;
    const v = Math.floor(90 + hash(i * 4.1 + seed) * 120);
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.beginPath();
    g.arc(x, y, kind === "dots" ? 1.2 + hash(i * 5.3) * 1.8 : 0.6 + hash(i * 5.3) * 0.9, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/**
 * A smooth unit crown: x mesiodistal (contacts at ±0.5), z buccolingual (+z toward
 * the cheek), y from -0.3 (root) through 0 (the neck at the gum) to about 1 (tip).
 */
function crownGeometry(type) {
  const g = new THREE.SphereGeometry(1, 64, 56);
  g.deleteAttribute("uv");
  g.deleteAttribute("normal");
  const p = g.attributes.position;
  const back = type === "molar" || type === "premolar";
  for (let i = 0; i < p.count; i++) {
    let x = spow(p.getX(i), back ? 0.6 : 0.75) * 0.5;
    let z = spow(p.getZ(i), back ? 0.62 : 0.75) * 0.5;
    const up = (spow(p.getY(i), type === "canine" ? 0.7 : 0.5) + 1) / 2;
    const neck = 0.74 + 0.26 * smooth(0.12, 0.45, up);
    x *= neck;
    z *= neck * (z > 0 ? 1 + 0.05 * Math.sin(Math.PI * smooth(0.1, 0.9, up)) : 1);
    let y = -0.3 + 1.3 * up;
    const top = smooth(0.75, 0.98, up);
    if (type === "incisor") {
      z *= 1 - 0.7 * smooth(0.3, 1, up);
      x *= 0.92 + 0.1 * smooth(0.1, 0.9, up);
      y -= 0.05 * smooth(0.6, 1, up) * smooth(0.28, 0.5, Math.abs(x));
    } else if (type === "canine") {
      const tip = smooth(0.4, 1, up);
      x *= 1 - 0.72 * tip;
      z *= 1 - 0.42 * tip;
      y += 0.08 * tip;
    } else if (type === "premolar") {
      y += top * (0.1 * bump(x, z, 0, 0.16, 0.035) + 0.07 * bump(x, z, 0, -0.17, 0.035) - 0.07);
    } else {
      const cusps = bump(x, z, -0.2, 0.17, 0.035) + bump(x, z, 0.2, 0.17, 0.035) + bump(x, z, -0.2, -0.17, 0.035) + bump(x, z, 0.2, -0.17, 0.035);
      y += top * (0.07 * cusps - 0.02 * (Math.exp(-(x * x) / 0.008) + Math.exp(-(z * z) / 0.008)) - 0.07);
    }
    p.setXYZ(i, x, y, z);
  }
  const m = mergeVertices(g);
  m.computeVertexNormals();
  m.computeBoundingBox();
  return m;
}

/** Enamel: clear-coated, with per-tooth state blended into the physical shader. */
function enamelMaterial() {
  const mat = new THREE.MeshPhysicalMaterial({ color: "#ddd6c8", roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.12, envMapIntensity: 0.45 });
  mat.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec4 aState;\nattribute vec3 aTint;\nvarying vec4 vState;\nvarying vec3 vTint;\nvarying float vToothY;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvState = aState; vTint = aTint; vToothY = position.y;");
    s.fragmentShader = s.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec4 vState;\nvarying vec3 vTint;\nvarying float vToothY;")
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.95, 0.98), vState.w * 0.6);
        diffuseColor.rgb *= mix(vec3(0.86, 0.78, 0.62), vec3(1.0), smoothstep(-0.02, 0.3, vToothY));
        diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(0.78, 0.84, 0.92), diffuseColor.rgb, 0.5), smoothstep(0.85, 1.05, vToothY) * 0.5);
        diffuseColor.rgb = mix(diffuseColor.rgb, vTint * 0.9 + 0.08, vState.x * 0.72);`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        float fres = pow(1.0 - abs(dot(normal, normalize(vViewPosition))), 2.5);
        totalEmissiveRadiance += vec3(0.5, 0.6, 0.75) * fres * 0.05 * smoothstep(0.5, 1.0, vToothY);
        totalEmissiveRadiance += vTint * (vState.y * 0.32 + vState.x * fres * 0.18) + vec3(0.12) * vState.y;
        totalEmissiveRadiance += vec3(1.0, 0.98, 0.94) * vState.z * pow(fres, 0.6) * 0.25;`,
      );
  };
  return mat;
}

/** Turned profile and swept cross-section helpers. */
export function lathe(points, segments = 48) {
  return new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), segments);
}

/** Sweep a closed cross-section section(u, theta) → [offset along the outward normal, y] along the arch. */
function sweep(curve, section, N = 320, M = 48, uvScale = 24) {
  const pos = [];
  const uv = [];
  const idx = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const p = curve.getPointAt(u);
    const t = curve.getTangentAt(u);
    const out = new THREE.Vector3(-t.z, 0, t.x).normalize();
    for (let j = 0; j <= M; j++) {
      const [c, y] = section(u, (j / M) * Math.PI * 2);
      pos.push(p.x + out.x * c, y, p.z + out.z * c);
      uv.push(u * uvScale, (j / M) * 3);
    }
    if (i < N) for (let j = 0; j < M; j++) {
      const q = i * (M + 1) + j;
      idx.push(q, q + 1, q + M + 1, q + 1, q + M + 2, q + M + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

class Jaw {
  constructor(side, enamel, mats, crowns) {
    this.side = side;
    const upper = side === "upper";
    this.pivot = new THREE.Group();
    this.pivot.position.copy(HINGE);
    this.body = new THREE.Group();
    this.body.position.set(-HINGE.x, -HINGE.y, -HINGE.z);
    if (upper) this.body.rotation.z = Math.PI;
    this.pivot.add(this.body);
    this.crowns = crowns;
    const half = PERMANENT[side].reduce((a, [, w]) => a + w, 0);
    this.curve = archCurve(ARCHES[side], half + 6);
    this.len = this.curve.getLength();

    this.records = [];
    this.meshes = [];
    const permanent = this.place(PERMANENT[side], "permanent");
    // The gum crest follows the permanent necks; the smaller primary crowns sit down into it.
    this.crest = (s) => {
      let wsum = 0;
      let ysum = 0;
      for (const r of permanent) {
        const wgt = Math.exp(-((Math.abs(s) - Math.abs(r.s)) ** 2) / 12);
        wsum += wgt;
        ysum += wgt * r.y0;
      }
      return ysum / wsum;
    };
    const primary = this.place(PRIMARY[side], "primary");
    for (const r of primary) r.y0 = this.crest(r.s) - 0.3;
    for (const [set, list] of [["permanent", permanent], ["primary", primary]]) {
      for (const type of Object.keys(TYPES)) {
        const group = list.filter((r) => r.type === type);
        if (!group.length) continue;
        const geo = crowns[type].clone();
        const state = new Float32Array(group.length * 4);
        const tint = new Float32Array(group.length * 3);
        const c = new THREE.Color(TYPES[type].color);
        group.forEach((_, i) => tint.set([c.r, c.g, c.b], i * 3));
        geo.setAttribute("aState", new THREE.InstancedBufferAttribute(state, 4));
        geo.setAttribute("aTint", new THREE.InstancedBufferAttribute(tint, 3));
        const mesh = new THREE.InstancedMesh(geo, enamel, group.length);
        mesh.frustumCulled = false;
        mesh.castShadow = true;
        group.forEach((r, i) => {
          const v = hash(r.s * 3.1 + (upper ? 7 : 1) + (set === "primary" ? 3 : 0));
          mesh.setColorAt(i, new THREE.Color().setRGB(0.97 + 0.03 * v, 0.95 + 0.04 * v, 0.91 + 0.06 * hash(r.s * 1.7)));
          Object.assign(r, { jaw: side, mesh, i, state });
          this.records.push(r);
        });
        this.body.add(mesh);
        this.meshes.push(mesh);
      }
    }
    // Universal numbering: 1–16 along the upper row from the patient's right, 17–32 back along the lower.
    for (const r of permanent) {
      const right = (upper ? -r.dir : r.dir) < 0;
      r.num = upper ? (right ? 8 - r.j : 9 + r.j) : right ? 25 + r.j : 24 - r.j;
    }
    this.edges = [0, ...permanent.map((r) => Math.abs(r.s) + r.w / 2)];
    this.permanent = permanent;
    this.buildBase(mats, upper);
  }

  /** Crowns side by side along the arch with touching contacts, tips on the occlusal targets. */
  place(quad, set) {
    const out = [];
    for (const dir of [-1, 1]) {
      let s = 0;
      quad.forEach(([type, w, h, d], j) => {
        const r = { set, type, j, dir, s: dir * (s + w / 2), w, h, d };
        s += w;
        r.y0 = TIP[type] - h * this.crownTop(type);
        Object.assign(r, this.frame(r));
        out.push(r);
      });
    }
    return out;
  }

  crownTop(type) {
    return this.crowns[type].boundingBox.max.y;
  }

  frame(r) {
    const u = 0.5 + r.s / this.len;
    const p = this.curve.getPointAt(u);
    const t = this.curve.getTangentAt(u);
    const out = new THREE.Vector3(-t.z, 0, t.x).normalize();
    const y = new THREE.Vector3(0, 1, 0);
    const x = new THREE.Vector3().crossVectors(y, out);
    return { p, basis: new THREE.Matrix4().makeBasis(x, y, out) };
  }

  /** Typodont base: a pink gum block that follows the arch (papillae between the crowns) on an ivory plaster plinth. */
  buildBase(mats, upper) {
    const depth = (s) => {
      let wsum = 0;
      let dsum = 0;
      for (const r of this.permanent) {
        const wgt = Math.exp(-((Math.abs(s) - Math.abs(r.s)) ** 2) / 10);
        wsum += wgt;
        dsum += wgt * r.d;
      }
      return dsum / wsum;
    };
    const ends = (u) => Math.sqrt(Math.min(1, Math.min(u, 1 - u) / 0.02));
    const gum = sweep(this.curve, (u, th) => {
      const s = (u - 0.5) * this.len;
      const e = ends(u);
      const a = (depth(s) / 2 + 1.4) * e;
      const top = this.crest(s) + 0.6;
      const papilla = this.edges.reduce((m, edge) => Math.max(m, Math.exp(-((Math.abs(s) - edge) ** 2) / 1.0)), 0);
      const sn = Math.sin(th);
      const lift = sn > 0 ? Math.pow(sn, 10) * 1.6 * papilla : 0;
      const mid = (top + BASE_BOTTOM) / 2;
      const b = (top - BASE_BOTTOM) / 2;
      return [spow(Math.cos(th), 0.5) * a * (0.6 + 0.4 * e), mid + (spow(sn, 0.45) * b + lift) * (0.3 + 0.7 * e)];
    });
    const gumMesh = new THREE.Mesh(gum, mats.gum);
    gumMesh.castShadow = gumMesh.receiveShadow = true;
    this.body.add(gumMesh);
    const plinth = sweep(this.curve, (u, th) => {
      const s = (u - 0.5) * this.len;
      const e = ends(u);
      const a = (depth(s) / 2 + 3.2) * (0.5 + 0.5 * e);
      const mid = (PLINTH[0] + PLINTH[1]) / 2;
      return [spow(Math.cos(th), 0.35) * a, mid + spow(Math.sin(th), 0.3) * ((PLINTH[0] - PLINTH[1]) / 2) * (0.6 + 0.4 * e)];
    }, 240, 40, 8);
    const plinthMesh = new THREE.Mesh(plinth, mats.plaster);
    plinthMesh.castShadow = plinthMesh.receiveShadow = true;
    this.body.add(plinthMesh);
    this.body.add(this.roof(upper, depth, mats));
  }

  /** The palate (domed, with rugae behind the front teeth) or the floor under the tongue. */
  roof(upper, depth, mats) {
    const N = 160;
    const V = 14;
    const pos = [];
    const uv = [];
    const idx = [];
    for (let i = 0; i <= N; i++) {
      const u = 0.03 + (i / N) * 0.94;
      const s = (u - 0.5) * this.len;
      const p = this.curve.getPointAt(u);
      const t = this.curve.getTangentAt(u);
      const out = new THREE.Vector3(-t.z, 0, t.x).normalize();
      const a = depth(s) / 2 + 1.4;
      const e = new THREE.Vector3(p.x - out.x * a * 0.8, 0, p.z - out.z * a * 0.8);
      const y0 = this.crest(s) - 0.4;
      for (let v = 0; v <= V; v++) {
        const k = v / V;
        const x = e.x * (1 - k);
        const z = e.z;
        let y = upper ? y0 - 8 * Math.sin((k * Math.PI) / 2) * smooth(26, 6, z) : y0 - 3.5 * smooth(0, 0.3, k);
        if (upper) {
          y -= smooth(4, 14, z) * smooth(0.05, 0.4, k) * 0.6 * Math.max(0, Math.sin(z * 1.1 + Math.abs(x) * 0.25)) ** 2;
          y -= 1.0 * Math.exp(-((x * x) / 4 + (z - 19) ** 2 / 6));
        }
        pos.push(x, y, z);
        uv.push(i / 20, k * 2);
      }
      if (i < N) for (let v = 0; v < V; v++) {
        const q = i * (V + 1) + v;
        idx.push(q, q + V + 1, q + 1, q + 1, q + V + 1, q + V + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, mats.roof);
  }

  /** appear 0 hides a tooth in the gum, 1 is fully erupted. */
  setTooth(r, appear, lit, flash, shine) {
    const m = new THREE.Matrix4().copy(r.basis).setPosition(r.p.x, r.y0, r.p.z);
    const s = Math.max(0.001, appear);
    m.multiply(new THREE.Matrix4().makeScale(r.w * (0.6 + 0.4 * s) * (1 + flash * 0.06), r.h * s * (1 + flash * 0.05), r.d * (0.6 + 0.4 * s) * (1 + flash * 0.06)));
    r.mesh.setMatrixAt(r.i, m);
    r.state.set([lit, flash, shine, r.set === "primary" ? 1 : 0], r.i * 4);
  }

  commit() {
    for (const mesh of this.meshes) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.geometry.attributes.aState.needsUpdate = true;
    }
  }
}

function tongueGeometry() {
  const g = new THREE.SphereGeometry(1, 72, 48).rotateY(Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i);
    let y = p.getY(i);
    const z = p.getZ(i);
    x *= 1 - 0.38 * smooth(0.1, 1, z);
    y *= y > 0 ? 1 - 0.25 * smooth(0.2, 1, z) : 0.55;
    if (y > 0) y -= 0.24 * Math.exp(-(x * x) / 0.012) * smooth(-0.7, 0.3, z) * (1 - smooth(0.6, 1, z));
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}

export class DentalModel {
  constructor() {
    this.group = new THREE.Group();
    const stipple = noiseTexture("stipple", 256, 3);
    stipple.repeat.set(1, 1);
    const papillae = noiseTexture("dots", 256, 9);
    papillae.repeat.set(3, 3);
    this.enamel = enamelMaterial();
    const gum = new THREE.MeshPhysicalMaterial({ color: "#e07f8c", roughness: 0.42, clearcoat: 0.55, clearcoatRoughness: 0.25, sheen: 0.35, sheenColor: new THREE.Color("#ffb8c2"), bumpMap: stipple, bumpScale: 0.3 });
    const mats = {
      gum,
      roof: Object.assign(gum.clone(), { side: THREE.DoubleSide }),
      plaster: new THREE.MeshPhysicalMaterial({ color: "#efe8d8", roughness: 0.7, clearcoat: 0.15, sheen: 0.3, sheenColor: new THREE.Color("#ffffff") }),
    };
    const crowns = Object.fromEntries(Object.keys(TYPES).map((type) => [type, crownGeometry(type)]));
    this.upper = new Jaw("upper", this.enamel, mats, crowns);
    this.lower = new Jaw("lower", this.enamel, mats, crowns);
    this.group.add(this.upper.pivot, this.lower.pivot);
    this.records = [...this.upper.records, ...this.lower.records];

    this.tongue = new THREE.Mesh(tongueGeometry(), new THREE.MeshPhysicalMaterial({ color: "#d2566b", roughness: 0.55, sheen: 0.7, sheenColor: new THREE.Color("#ff9fb0"), clearcoat: 0.35, clearcoatRoughness: 0.35, bumpMap: papillae, bumpScale: 1.2 }));
    this.tongue.scale.set(16, 5, 20);
    this.tongue.position.set(0, -9.5, -7);
    this.tongue.castShadow = true;
    this.lower.body.add(this.tongue);
    this.buildStand();
  }

  /** A chrome articulator: weighted foot, collared post, hinge knuckles and arms to the back of each base. */
  buildStand() {
    const chrome = new THREE.MeshPhysicalMaterial({ color: "#7a828c", metalness: 1, roughness: 0.22, envMapIntensity: 0.7 });
    const dark = new THREE.MeshPhysicalMaterial({ color: "#2a3038", metalness: 0.6, roughness: 0.35, clearcoat: 0.4 });
    const add = (geo, mat, x, y, z) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      this.group.add(m);
      return m;
    };
    const z = HINGE.z;
    add(lathe([[0, 0], [27, 0], [28.5, 1.2], [28.5, 3.4], [26, 5.2], [19, 6.4], [8, 7.6], [6, 9], [0, 9]], 72), dark, 0, -POST, z);
    add(lathe([[0, 0], [5.2, 0], [5.2, 2], [4, 3], [3.6, POST - 14], [5.4, POST - 12], [5.4, POST - 9], [4.2, POST - 8], [0, POST - 8]], 48), chrome, 0, -POST + 8, z);
    for (const y of [-POST + 24, -POST + 36]) add(new THREE.TorusGeometry(3.9, 0.8, 12, 40).rotateX(Math.PI / 2), chrome, 0, y, z);
    add(new THREE.CylinderGeometry(1.8, 1.8, 62, 28).rotateZ(Math.PI / 2), chrome, 0, HINGE.y, z);
    add(new THREE.CylinderGeometry(4.6, 4.6, 8, 32).rotateZ(Math.PI / 2), dark, 0, HINGE.y, z);
    for (const x of [-27, 27]) add(new THREE.CylinderGeometry(3.8, 3.8, 5, 32).rotateZ(Math.PI / 2), chrome, x, HINGE.y, z);
    for (const x of [-30.5, 30.5]) add(new THREE.SphereGeometry(2.4, 20, 14), chrome, x, HINGE.y, z);
    for (const jaw of [this.upper, this.lower]) {
      const s = jaw === this.upper ? 1 : -1;
      const end = jaw.curve.getPointAt(0.01);
      for (const side of [-1, 1]) {
        const to = new THREE.Vector3(side * Math.abs(end.x), s * -((PLINTH[0] + PLINTH[1]) / 2), -HINGE.z + end.z + 1.5);
        const arm = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(side * 27, 0, 0), new THREE.Vector3(side * 27.5, to.y * 0.6, to.z * 0.4), to]), 20, 1.8, 12), chrome);
        arm.castShadow = true;
        jaw.pivot.add(arm);
      }
    }
  }

  /** open 0 is the closed bite (crowns just touch); slide grinds the lower jaw sideways, opening slightly so cusps clear. */
  pose(open, slide = 0) {
    const gape = Math.max(0, open) + Math.abs(slide) * 0.05;
    this.lower.pivot.rotation.set(0.46 * gape, slide * 0.03, 0);
    this.lower.pivot.position.x = HINGE.x + slide * 1.0;
    this.upper.pivot.rotation.set(-0.48 * gape, 0, 0);
  }

  commit() {
    this.upper.commit();
    this.lower.commit();
  }

  /** World position of a tooth's biting surface. */
  tip(r, target = new THREE.Vector3()) {
    const jaw = r.jaw === "upper" ? this.upper : this.lower;
    return target.set(r.p.x, r.y0 + r.h, r.p.z).applyMatrix4(jaw.body.matrixWorld);
  }
}
