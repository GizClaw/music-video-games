import * as THREE from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { smooth } from "@gizclaw/mvg-core/timing.js";
import { PERMANENT, PRIMARY, TYPES } from "./constants.js";

// Model space is millimetres of a life-size arch: x across, y up from the lower
// gum line, z toward the viewer. The upper jaw is the same build turned over.
const ARCH = [[0, 26], [9, 24.5], [17, 20], [23, 13], [26.5, 4], [28.5, -6], [29.5, -16], [30, -27], [30, -36]];
const HINGE = new THREE.Vector3(0, 0, -46);
const BODY_Y = { upper: 9.5, lower: -9 };
/** The stand from the counter up to the hinge. */
export const POST = 72;

function archCurve(scale, dz) {
  const half = ARCH.map(([x, z]) => new THREE.Vector3(x * scale, 0, z * scale + dz));
  const pts = [...half.slice(1).reverse().map((p) => new THREE.Vector3(-p.x, 0, p.z)), ...half];
  return new THREE.CatmullRomCurve3(pts, false, "centripetal");
}

const spow = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);

/** A unit crown: x mesiodistal, z buccolingual, y from -0.3 (root) through 0 (gum line) to 1 (biting surface). */
function crownGeometry(type) {
  const g = new THREE.SphereGeometry(1, 48, 32);
  g.deleteAttribute("uv");
  g.deleteAttribute("normal");
  const p = g.attributes.position;
  const flat = type === "molar" || type === "premolar" ? 0.55 : 0.72;
  for (let i = 0; i < p.count; i++) {
    let x = spow(p.getX(i), flat) * 0.5;
    let z = spow(p.getZ(i), flat) * 0.5;
    const up = (spow(p.getY(i), type === "canine" ? 0.75 : 0.45) + 1) / 2;
    const neck = 0.7 + 0.3 * smooth(0, 0.45, up);
    x *= neck;
    z *= neck;
    let y = -0.3 + 1.3 * up;
    if (type === "incisor") {
      z *= 1 - 0.7 * smooth(0.3, 1, up);
      x *= 0.9 + 0.14 * up;
    } else if (type === "canine") {
      const tip = smooth(0.4, 1, up);
      x *= 1 - 0.78 * tip;
      z *= 1 - 0.45 * tip;
      y += 0.14 * tip;
    } else {
      const bump = (cx, cz) => Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / 0.016);
      const cusps = type === "premolar" ? bump(0, 0.19) + bump(0, -0.19) : bump(0.2, 0.19) + bump(-0.2, 0.19) + bump(0.2, -0.19) + bump(-0.2, -0.19);
      y += smooth(0.72, 0.98, up) * (0.15 * cusps - 0.09);
    }
    p.setXYZ(i, x, y, z);
  }
  const m = mergeVertices(g);
  m.computeVertexNormals();
  return m;
}

const TOOTH_VERT = /* glsl */ `
  attribute vec4 aState; attribute vec3 aTint;
  varying vec3 vN; varying vec3 vW; varying vec4 vS; varying vec3 vT; varying float vY;
  void main() {
    vS = aState; vT = aTint; vY = position.y;
    vec3 s = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
    vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * (normal / max(s * s, vec3(1e-6))));
    vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;

// aState: x lit in the type colour, y flash, z fresh-brushed shine, w primary (milk) tooth.
const TOOTH_FRAG = /* glsl */ `
  uniform vec3 uLamp, uSun;
  varying vec3 vN; varying vec3 vW; varying vec4 vS; varying vec3 vT; varying float vY;
  void main() {
    vec3 N = normalize(vN);
    vec3 V = normalize(cameraPosition - vW);
    vec3 Ll = normalize(uLamp - vW);
    vec3 enamel = mix(vec3(0.86, 0.82, 0.72), vec3(0.9, 0.92, 0.95), vS.w);
    vec3 base = mix(enamel, vT * 0.95 + enamel * 0.1, vS.x * 0.8);
    float dl = max(dot(N, Ll), 0.0);
    float ds = max(dot(N, uSun), 0.0);
    vec3 col = base * (0.13 + 0.26 * ds * vec3(0.85, 0.93, 1.0) + 0.36 * dl * vec3(1.0, 0.95, 0.86));
    float spec = pow(max(dot(N, normalize(Ll + V)), 0.0), 70.0) * 0.4 + pow(max(dot(N, normalize(uSun + V)), 0.0), 40.0) * 0.12;
    col += vec3(1.0, 0.97, 0.92) * spec * (1.0 + vS.z * 2.0);
    float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);
    col += vT * rim * vS.x * 0.3;
    col += vT * vS.y * 0.35 + vec3(0.12) * vS.y;
    col *= mix(0.6, 1.0, smoothstep(-0.05, 0.3, vY));
    gl_FragColor = vec4(col, 1.0);
  }`;

class Jaw {
  constructor(side, material, gumMat, baseMat) {
    this.side = side;
    const upper = side === "upper";
    this.pivot = new THREE.Group();
    this.pivot.position.copy(HINGE);
    this.body = new THREE.Group();
    this.body.position.set(-HINGE.x, BODY_Y[side] - HINGE.y, -HINGE.z);
    if (upper) this.body.rotation.z = Math.PI;
    this.pivot.add(this.body);
    this.curve = archCurve(upper ? 1 : 0.93, upper ? 0 : -1.4);
    this.len = this.curve.getLength();

    this.buildGum(gumMat, baseMat, upper);
    this.records = [];
    this.meshes = [];
    for (const [set, table] of [["permanent", PERMANENT], ["primary", PRIMARY]]) {
      const quad = table[side];
      const gap = set === "primary" ? 1.6 : 0.1;
      const k = set === "primary" ? 1.08 : 1;
      const placed = [];
      for (const dir of [-1, 1]) {
        let s = gap / 2;
        quad.forEach(([type, w, h, d], j) => {
          placed.push({ set, type, j, dir, s: dir * (s + (w * k) / 2), w: w * k, h: h * k, d: d * k });
          s += w * k + gap;
        });
      }
      for (const type of Object.keys(TYPES)) {
        const list = placed.filter((r) => r.type === type);
        if (!list.length) continue;
        const geo = crownGeometry(type);
        const state = new Float32Array(list.length * 4);
        const tint = new Float32Array(list.length * 3);
        const c = new THREE.Color(TYPES[type].color);
        list.forEach((_, i) => tint.set([c.r, c.g, c.b], i * 3));
        geo.setAttribute("aState", new THREE.InstancedBufferAttribute(state, 4));
        geo.setAttribute("aTint", new THREE.InstancedBufferAttribute(tint, 3));
        const mesh = new THREE.InstancedMesh(geo, material, list.length);
        mesh.frustumCulled = false;
        this.body.add(mesh);
        this.meshes.push(mesh);
        list.forEach((r, i) => this.records.push({ ...r, jaw: side, mesh, i, state, ...this.frame(r) }));
      }
    }
    // Universal numbering: 1–16 along the upper row from the patient's right, 17–32 back along the lower.
    for (const r of this.records) {
      if (r.set !== "permanent") continue;
      const right = r.dir < 0;
      r.num = upper ? (right ? 8 - r.j : 9 + r.j) : right ? 25 + r.j : 24 - r.j;
    }
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

  buildGum(gumMat, baseMat, upper) {
    const N = 220;
    const M = 32;
    const pos = [];
    const idx = [];
    const outer = [];
    const inner = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const p = this.curve.getPointAt(u);
      const t = this.curve.getTangentAt(u);
      const out = new THREE.Vector3(-t.z, 0, t.x).normalize();
      const end = Math.sqrt(Math.min(1, Math.min(u, 1 - u) / 0.012));
      const a = (4.4 + 3.4 * smooth(0.08, 0.55, Math.abs(u - 0.5) * 2)) * end;
      for (let j = 0; j <= M; j++) {
        const th = (j / M) * Math.PI * 2;
        const cx = spow(Math.cos(th), 0.7) * a;
        const cy = spow(Math.sin(th), 0.7) * 5.2 * end - 4.4;
        pos.push(p.x + out.x * cx, cy, p.z + out.z * cx);
      }
      if (i < N) for (let j = 0; j < M; j++) {
        const q = i * (M + 1) + j;
        idx.push(q, q + 1, q + M + 1, q + 1, q + M + 2, q + M + 1);
      }
      outer.push(new THREE.Vector2(p.x + out.x * (a + 1.6), -(p.z + out.z * (a + 1.6))));
      if (u > 0.03 && u < 0.97) inner.push(new THREE.Vector2(p.x - out.x * a * 0.7, -(p.z - out.z * a * 0.7)));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const gum = new THREE.Mesh(geo, gumMat);
    this.body.add(gum);

    const back = outer[0].y;
    const plate = new THREE.Shape([...outer, new THREE.Vector2(outer.at(-1).x, back), new THREE.Vector2(outer[0].x, back)]);
    const baseGeo = new THREE.ExtrudeGeometry(plate, { depth: 9, bevelEnabled: true, bevelThickness: 1.2, bevelSize: 1.2, bevelSegments: 3, curveSegments: 4 });
    baseGeo.rotateX(-Math.PI / 2).translate(0, -15.5, 0);
    this.body.add(new THREE.Mesh(baseGeo, baseMat));
    const floor = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(inner)).rotateX(-Math.PI / 2).translate(0, upper ? -1.0 : -2.6, 0), gumMat);
    this.body.add(floor);
  }

  /** appear 0 hides a tooth in the gum, 1 is fully erupted. */
  setTooth(r, appear, lit, flash, shine, lift = 0) {
    const m = new THREE.Matrix4().copy(r.basis).setPosition(r.p.x, lift, r.p.z);
    const s = Math.max(0.001, appear);
    m.multiply(new THREE.Matrix4().makeScale(r.w * (0.6 + 0.4 * s) * (1 + flash * 0.12), r.h * s * (1 + flash * 0.1), r.d * (0.6 + 0.4 * s) * (1 + flash * 0.12)));
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

export class DentalModel {
  constructor() {
    this.group = new THREE.Group();
    this.toothMat = new THREE.ShaderMaterial({
      uniforms: { uLamp: { value: new THREE.Vector3() }, uSun: { value: new THREE.Vector3(-0.55, 0.5, 0.65).normalize() } },
      vertexShader: TOOTH_VERT,
      fragmentShader: TOOTH_FRAG,
    });
    const gumMat = new THREE.MeshStandardMaterial({ color: "#d9707e", roughness: 0.42, metalness: 0 });
    const baseMat = new THREE.MeshStandardMaterial({ color: "#46566a", roughness: 0.5 });
    this.upper = new Jaw("upper", this.toothMat, gumMat, baseMat);
    this.lower = new Jaw("lower", this.toothMat, gumMat, baseMat);
    this.group.add(this.upper.pivot, this.lower.pivot);
    this.records = [...this.upper.records, ...this.lower.records];

    this.tongue = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 24), new THREE.MeshStandardMaterial({ color: "#d4546a", roughness: 0.35 }));
    this.tongue.scale.set(17, 5, 21);
    this.tongue.position.set(0, -1.5, -9);
    this.lower.body.add(this.tongue);

    const steel = new THREE.MeshStandardMaterial({ color: "#5d6672", metalness: 0.7, roughness: 0.45 });
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 30, 20).rotateZ(Math.PI / 2), steel);
    rod.position.set(HINGE.x, HINGE.y, HINGE.z - 4);
    this.group.add(rod);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, POST, 20), steel);
    post.position.set(0, -POST / 2, HINGE.z - 2);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(22, 26, 6, 40), steel);
    foot.position.set(0, -POST + 3, HINGE.z - 2);
    this.group.add(post, foot);
  }

  /** open 0 bites closed, 1 is the resting gape; slide grinds the lower jaw sideways. */
  pose(open, slide = 0) {
    this.lower.pivot.rotation.set(0.46 * open, slide * 0.05, 0);
    this.lower.pivot.position.x = HINGE.x + slide * 1.6;
    this.upper.pivot.rotation.set(-0.48 * open, 0, 0);
  }

  commit() {
    this.upper.commit();
    this.lower.commit();
  }

  /** World position of a tooth's biting surface. */
  tip(r, target = new THREE.Vector3()) {
    const jaw = r.jaw === "upper" ? this.upper : this.lower;
    return target.set(r.p.x, r.h, r.p.z).applyMatrix4(jaw.body.matrixWorld);
  }
}
