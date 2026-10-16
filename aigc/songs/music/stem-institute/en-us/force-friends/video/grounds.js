import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { hash } from "@gizclaw/mvg-core/timing.js";
import { barkTexture, leafTexture, stoneTexture, woodTexture } from "./textures.js";

// A sunny park. Six stations stand on an arc of radius ARC around a gravel
// plaza at the origin, facing it; the arc opens toward +z, where the wide
// camera stands. The pond lies just behind the buoyancy station.
export const ARC = 5.5;
export const ANGLES = [-62.5, -37.5, -12.5, 12.5, 37.5, 62.5].map((d) => (d * Math.PI) / 180);
export const spot = (k, r = ARC) => new THREE.Vector3(Math.sin(ANGLES[k]) * r, 0, -Math.cos(ANGLES[k]) * r);
const pondAt = spot(3, ARC + 0.55);
export const POND = { x: pondAt.x, z: pondAt.z, rx: 1.9, rz: 1.55 };
export const HORIZON = new THREE.Color().setRGB(0.16, 0.24, 0.34);
const PATH = [ARC - 1.6, 0.45];
const PLAZA = 1.85;

const NOISE = /* glsl */ `
  float h21(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
  float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
  float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }`;

const SKY_COLOR = /* glsl */ `
  vec3 skyColor(vec3 d, float t) {
    float h = max(d.y, 0.0);
    vec3 col = mix(vec3(0.4, 0.58, 0.8), vec3(0.08, 0.26, 0.72), pow(h, 0.5));
    vec2 p = d.xz / max(d.y, 0.04) * 0.9 + vec2(t * 0.012, 0.0);
    float cloud = smoothstep(0.52, 0.78, fbm(p)) * smoothstep(0.02, 0.18, d.y);
    vec3 cloudCol = mix(vec3(0.78, 0.82, 0.9), vec3(1.0), smoothstep(0.55, 0.9, fbm(p * 1.7 + 3.0)));
    return mix(col, cloudCol, cloud * 0.9);
  }`;

const SKY = /* glsl */ `
  uniform float uTime; varying vec3 vDir;
  ${NOISE}
  ${SKY_COLOR}
  void main() {
    // Output is sRGB-encoded afterwards; keep the sky below the bloom threshold.
    gl_FragColor = vec4(skyColor(normalize(vDir), uTime) * 0.5, 1.0);
  }`;

const LAWN = /* glsl */ `
  uniform vec3 uHaze; uniform vec4 uPond; uniform vec2 uPath; uniform float uPlaza; varying vec3 vW;
  ${NOISE}
  void main() {
    vec2 p = vW.xz;
    float n = noise(p * 0.35) * 0.5 + noise(p * 1.7) * 0.3 + noise(p * 9.0) * 0.2;
    vec3 grass = mix(vec3(0.08, 0.2, 0.04), vec3(0.22, 0.4, 0.08), n);
    grass = mix(grass, vec3(0.3, 0.36, 0.1), smoothstep(0.62, 0.8, noise(p * 0.22 + 7.0)) * 0.5);
    // Gravel: a round plaza ringed by a closed circular path, with a soft worn edge.
    float r = length(p);
    float edge = noise(p * 6.0) * 0.12;
    float path = max(1.0 - smoothstep(uPlaza - 0.1 + edge, uPlaza + 0.05 + edge, r), 1.0 - smoothstep(uPath.y - 0.12 + edge, uPath.y + edge, abs(r - uPath.x)));
    float pebble = noise(p * 40.0);
    vec3 gravel = mix(vec3(0.46, 0.4, 0.3), vec3(0.7, 0.63, 0.5), pebble) * (0.85 + 0.15 * noise(p * 13.0));
    gravel *= 1.0 - 0.35 * smoothstep(0.75, 0.95, noise(p * 22.0 + 3.0));
    vec3 col = mix(grass, gravel, path);
    vec2 q = (p - uPond.xy) / uPond.zw;
    col *= 1.0 - 0.45 * (1.0 - smoothstep(1.0, 1.35, length(q)));
    float dist = length(vW.xz - cameraPosition.xz);
    col = mix(col * 0.62, uHaze, smoothstep(30.0, 110.0, dist));
    gl_FragColor = vec4(col, 1.0);
  }`;

const WATER = /* glsl */ `
  uniform float uTime; uniform vec3 uRip; uniform vec4 uPond; varying vec3 vW;
  ${NOISE}
  ${SKY_COLOR}
  float waves(vec2 p) { return noise(p * 2.6 + vec2(uTime * 0.35, uTime * 0.2)) + 0.6 * noise(p * 5.3 - vec2(uTime * 0.3, -uTime * 0.25)); }
  void main() {
    vec2 p = vW.xz;
    float e = 0.02;
    vec2 grad = vec2(waves(p + vec2(e, 0.0)) - waves(p - vec2(e, 0.0)), waves(p + vec2(0.0, e)) - waves(p - vec2(0.0, e))) / (2.0 * e);
    // Rings spreading from the boat after each dunk.
    float age = uTime - uRip.z;
    vec2 rd = p - uRip.xy;
    float r = length(rd);
    float k = (r - age * 1.1) * 9.0;
    float ring = age > 0.0 ? -2.0 * k * exp(-k * k) * exp(-age * 1.2) : 0.0;
    grad += normalize(rd + 1e-4) * ring * 1.6;
    vec3 n = normalize(vec3(-grad.x * 0.035, 1.0, -grad.y * 0.035));
    vec3 v = normalize(cameraPosition - vW);
    vec3 rf = reflect(-v, n);
    float fres = 0.04 + 0.96 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
    vec3 refl = skyColor(normalize(vec3(rf.x, max(rf.y, 0.02), rf.z)), uTime);
    // The far bank and tree line mirrored near the horizon of the reflection.
    refl = mix(refl, vec3(0.06, 0.13, 0.05), 1.0 - smoothstep(0.06, 0.32, rf.y));
    float bank = length((p - uPond.xy) / uPond.zw);
    refl = mix(refl, vec3(0.08, 0.12, 0.06), smoothstep(0.72, 1.0, bank) * 0.6);
    vec3 deep = mix(vec3(0.06, 0.18, 0.14), vec3(0.03, 0.12, 0.11), smoothstep(0.4, 1.0, bank));
    vec3 col = mix(deep, refl, clamp(fres * 1.6 + 0.12, 0.0, 1.0));
    col += vec3(0.6, 0.75, 0.85) * max(ring, 0.0) * 0.15;
    gl_FragColor = vec4(col * 0.62, 1.0);
  }`;

const BLADE_VERT = /* glsl */ `
  uniform float uTime, uKick; varying float vH; varying vec3 vTint; varying float vDist;
  void main() {
    vec3 p = position;
    vec4 base = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    float sway = sin(uTime * 1.6 + base.x * 0.7 + base.z * 0.5) * 0.6 + sin(uTime * 2.9 + base.x * 2.1 - base.z * 1.3) * 0.3;
    vec4 w = modelMatrix * instanceMatrix * vec4(p, 1.0);
    w.x += (sway * 0.045 + uKick * 0.02) * p.y * p.y;
    w.z += sway * 0.02 * p.y * p.y;
    vH = p.y;
    vTint = instanceColor;
    vDist = length(w.xz - cameraPosition.xz);
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;

const BLADE_FRAG = /* glsl */ `
  uniform vec3 uHaze; varying float vH; varying vec3 vTint; varying float vDist;
  void main() {
    vec3 col = mix(vec3(0.04, 0.11, 0.02), vec3(0.26, 0.46, 0.1), vH) * vTint;
    col += vec3(0.08, 0.1, 0.02) * smoothstep(0.7, 1.0, vH);
    gl_FragColor = vec4(mix(col * 0.78, uHaze, smoothstep(30.0, 110.0, vDist)), 1.0);
  }`;

function mesh(geo, mat, x = 0, y = 0, z = 0, parent) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}
const rbox = (w, h, d, r) => new RoundedBoxGeometry(w, h, d, 3, r);
const tmpObj = new THREE.Object3D();
function place(geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1) {
  tmpObj.position.set(x, y, z);
  tmpObj.rotation.set(rx, ry, rz);
  tmpObj.scale.setScalar(s);
  tmpObj.updateMatrix();
  return geo.clone().applyMatrix4(tmpObj.matrix);
}
const merged = (list) => mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)));
const lathe = (pts, seg = 24) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg);

/** A point on the far side of the park: angle from the -z axis (degrees) and radius. */
const around = (deg, r) => [Math.sin((deg * Math.PI) / 180) * r, -Math.cos((deg * Math.PI) / 180) * r];

/** Lawn only: not on the gravel, the pond or a station's deck. */
function onLawn(x, z) {
  const r = Math.hypot(x, z);
  if (r < PLAZA + 0.1 || Math.abs(r - PATH[0]) < PATH[1] + 0.05) return false;
  if (Math.hypot((x - POND.x) / POND.rx, (z - POND.z) / POND.rz) < 1.12) return false;
  for (let k = 0; k < 6; k++) {
    const s = spot(k);
    const c = Math.cos(ANGLES[k]);
    const sn = Math.sin(ANGLES[k]);
    const lx = (x - s.x) * c + (z - s.z) * sn;
    const lz = -(x - s.x) * sn + (z - s.z) * c;
    if (Math.abs(lx) < 1.3 && Math.abs(lz) < 0.5) return false;
  }
  return true;
}

export class Grounds {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
    scene.fog = new THREE.Fog(HORIZON, 40, 150);
    this.skyU = { uTime: { value: 0 } };
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(180, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: this.skyU,
        vertexShader: "varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * viewMatrix * vec4(position + cameraPosition, 1.0); gl_Position = p.xyww; }",
        fragmentShader: SKY,
      }),
    );
    sky.frustumCulled = false;
    sky.renderOrder = -1;
    this.group.add(sky);

    const world = "varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }";
    const pond = new THREE.Vector4(POND.x, POND.z, POND.rx, POND.rz);
    mesh(
      new THREE.PlaneGeometry(320, 320).rotateX(-Math.PI / 2),
      new THREE.ShaderMaterial({ uniforms: { uHaze: { value: HORIZON }, uPath: { value: new THREE.Vector2(...PATH) }, uPlaza: { value: PLAZA }, uPond: { value: pond } }, vertexShader: world, fragmentShader: LAWN }),
      0, 0, 0, this.group,
    );
    this.waterU = { uTime: { value: 0 }, uRip: { value: new THREE.Vector3(0, 0, -99) }, uPond: { value: pond } };
    const water = mesh(new THREE.CircleGeometry(1, 96).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({ uniforms: this.waterU, vertexShader: world, fragmentShader: WATER }), POND.x, 0.02, POND.z, this.group);
    water.scale.set(POND.rx, 1, POND.rz);

    this.buildGrass();
    this.buildFlowers();
    this.buildBank();
    this.buildTrees();
    this.buildBench();
    this.buildLamp();
    this.buildHills();
  }

  buildGrass() {
    const segs = 4;
    const pos = [];
    const idx = [];
    for (let i = 0; i <= segs; i++) {
      const h = i / segs;
      const w = 0.5 * (1 - h) ** 0.9;
      pos.push(-w, h, 0.25 * h * h, w, h, 0.25 * h * h);
      if (i < segs) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    }
    const blade = new THREE.BufferGeometry();
    blade.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    blade.setIndex(idx);
    const n = 100000;
    this.grassU = { uTime: { value: 0 }, uKick: { value: 0 }, uHaze: { value: HORIZON } };
    const grass = new THREE.InstancedMesh(blade, new THREE.ShaderMaterial({ uniforms: this.grassU, vertexShader: BLADE_VERT, fragmentShader: BLADE_FRAG, side: THREE.DoubleSide }), n);
    const d = new THREE.Object3D();
    const tint = new THREE.Color();
    let k = 0;
    for (let i = 0; k < n && i < n * 4; i++) {
      const a = (-180 + hash(i * 1.37) * 360) * (Math.PI / 180);
      const r = Math.sqrt(PLAZA * PLAZA + hash(i * 2.71) * (13 * 13 - PLAZA * PLAZA));
      const x = Math.sin(a) * r;
      const z = -Math.cos(a) * r;
      if (!onLawn(x, z)) continue;
      const h = 0.07 + hash(i * 3.3) * 0.13;
      d.position.set(x, 0, z);
      d.rotation.set(0, hash(i * 4.9) * Math.PI * 2, (hash(i * 6.1) - 0.5) * 0.3);
      d.scale.set(0.02 + hash(i * 7.7) * 0.025, h, h);
      d.updateMatrix();
      grass.setMatrixAt(k, d.matrix);
      grass.setColorAt(k, tint.setRGB(0.8 + hash(i * 8.3) * 0.4, 0.85 + hash(i * 9.1) * 0.3, 0.7 + hash(i * 5.5) * 0.5));
      k++;
    }
    grass.count = k;
    grass.frustumCulled = false;
    this.group.add(grass);
  }

  buildFlowers() {
    const petal = new THREE.Shape();
    for (let i = 0; i <= 60; i++) {
      const a = (i / 60) * Math.PI * 2;
      const r = 0.035 + 0.025 * Math.abs(Math.cos(a * 2.5));
      i ? petal.lineTo(Math.cos(a) * r, Math.sin(a) * r) : petal.moveTo(r, 0);
    }
    const n = 220;
    const heads = new THREE.InstancedMesh(new THREE.ShapeGeometry(petal, 2).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.8, side: THREE.DoubleSide }), n);
    const eyes = new THREE.InstancedMesh(new THREE.SphereGeometry(0.016, 10, 8), new THREE.MeshStandardMaterial({ color: "#ffc23d", roughness: 0.5 }), n);
    const cols = ["#d8d2c2", "#e6d47e", "#e083b2", "#a585dc"].map((c) => new THREE.Color(c));
    const d = new THREE.Object3D();
    let k = 0;
    for (let i = 0; k < n && i < n * 6; i++) {
      const [x, z] = around(-110 + hash(i * 2.3) * 220, 4.4 + hash(i * 4.7) * 7);
      if (!onLawn(x, z)) continue;
      const y = 0.12 + hash(i * 6.6) * 0.08;
      d.position.set(x, y, z);
      d.rotation.set((hash(i * 3.1) - 0.5) * 0.5, hash(i * 9.9) * 6, (hash(i * 5.1) - 0.5) * 0.5);
      d.scale.setScalar(0.8 + hash(i * 7.3) * 0.6);
      d.updateMatrix();
      heads.setMatrixAt(k, d.matrix);
      heads.setColorAt(k, cols[i % 4]);
      d.position.y += 0.006;
      d.updateMatrix();
      eyes.setMatrixAt(k, d.matrix);
      k++;
    }
    heads.count = eyes.count = k;
    this.group.add(heads, eyes);
  }

  buildBank() {
    // Smooth river stones: displaced spheres, a few shapes shared by all.
    const stoneMat = new THREE.MeshStandardMaterial({ map: stoneTexture(), roughness: 0.85 });
    const rock = new THREE.IcosahedronGeometry(1, 3);
    const p = rock.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(p, i);
      const s = 1 + 0.12 * Math.sin(v.x * 3.1 + v.y * 2.3) + 0.08 * Math.sin(v.z * 5.7 + v.x * 1.3);
      p.setXYZ(i, v.x * s, v.y * s * 0.6, v.z * s);
    }
    rock.computeVertexNormals();
    const n = 44;
    const stones = new THREE.InstancedMesh(rock, stoneMat, n);
    const d = new THREE.Object3D();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + hash(i) * 0.08;
      d.position.set(POND.x + Math.cos(a) * POND.rx * 1.04, 0.03, POND.z + Math.sin(a) * POND.rz * 1.04);
      d.rotation.set(0, hash(i * 2.1) * 6, (hash(i * 9.3) - 0.5) * 0.3);
      d.scale.set(0.15 + hash(i * 3.3) * 0.1, 0.12 + hash(i * 4.1) * 0.06, 0.13 + hash(i * 5.7) * 0.08);
      d.updateMatrix();
      stones.setMatrixAt(i, d.matrix);
    }
    stones.castShadow = stones.receiveShadow = true;
    this.group.add(stones);
    // Cattails: stem and two curving leaves, with a velvet seed head.
    const leaf = (bend, turn) => {
      const pts = [];
      for (let i = 0; i <= 6; i++) pts.push(new THREE.Vector3(Math.sin(turn) * bend * (i / 6) ** 2, (i / 6) * 0.75, Math.cos(turn) * bend * (i / 6) ** 2));
      return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.01, 4).scale(1.6, 1, 0.5);
    };
    const reed = merged([new THREE.CylinderGeometry(0.008, 0.014, 1, 6).translate(0, 0.5, 0), leaf(0.25, 0.4), leaf(0.2, 3.6)]);
    const head = new THREE.CapsuleGeometry(0.03, 0.12, 4, 10).translate(0, 0.94, 0);
    this.reedPlaces = [];
    for (let i = 0; i < 18; i++) {
      const a = -Math.PI * (0.18 + hash(i * 1.7) * 0.64);
      this.reedPlaces.push([POND.x + Math.cos(a) * POND.rx * 0.97, POND.z + Math.sin(a) * POND.rz * 0.97, 0.75 + hash(i * 2.9) * 0.5]);
    }
    this.dummy = new THREE.Object3D();
    this.reeds = new THREE.InstancedMesh(reed, new THREE.MeshStandardMaterial({ color: "#5d7a2a", roughness: 0.75 }), 18);
    this.heads = new THREE.InstancedMesh(head, new THREE.MeshStandardMaterial({ color: "#5a3a1e", roughness: 0.95 }), 18);
    this.group.add(this.reeds, this.heads);
    // Lily pads with their notch, and two water lilies.
    const pad = new THREE.MeshStandardMaterial({ color: "#3f7a2a", roughness: 0.55, side: THREE.DoubleSide });
    for (let i = 0; i < 6; i++) {
      const a = 2.2 + i * 0.5;
      const m = mesh(new THREE.CircleGeometry(0.14 + hash(i * 6.1) * 0.07, 24, 0.35, Math.PI * 2 - 0.35).rotateX(-Math.PI / 2), pad, POND.x + Math.cos(a) * POND.rx * 0.7, 0.03, POND.z + Math.sin(a) * POND.rz * 0.7, this.group);
      m.rotation.y = hash(i) * 6;
    }
    const petals = [];
    for (let k = 0; k < 8; k++) petals.push(place(new THREE.SphereGeometry(1, 12, 8).scale(0.022, 0.01, 0.06).translate(0, 0, 0.05), 0, 0.015 + (k % 2) * 0.01, 0, -0.5, (k / 8) * Math.PI * 2, 0));
    const lily = merged(petals);
    for (const a of [2.6, 3.7]) mesh(lily, new THREE.MeshStandardMaterial({ color: "#fbe6f0", roughness: 0.5 }), POND.x + Math.cos(a) * POND.rx * 0.7, 0.03, POND.z + Math.sin(a) * POND.rz * 0.7, this.group);
  }

  buildTrees() {
    const spots = [];
    for (let i = 0; i < 46; i++) {
      const [x, z] = around(-118 + hash(i * 1.3) * 236, 10 + hash(i * 2.7) * 24);
      spots.push([x, z, 1 + hash(i * 3.9) * 0.7]);
    }
    for (const [deg, r, s] of [[-92, 8.6, 1.0], [-60, 9.2, 1.25], [-28, 8.4, 0.95], [2, 9.4, 1.2], [32, 8.8, 1.05], [62, 9.0, 1.3], [95, 8.4, 1.0], [118, 8.0, 1.1]]) spots.push([...around(deg, r), s]);
    const n = spots.length;
    // Trunk with a flared root and three boughs reaching into the crown.
    const bough = (a, y0, len) => {
      const pts = [new THREE.Vector3(0, y0, 0), new THREE.Vector3(Math.cos(a) * len * 0.45, y0 + len * 0.5, Math.sin(a) * len * 0.45), new THREE.Vector3(Math.cos(a) * len * 0.75, y0 + len, Math.sin(a) * len * 0.75)];
      return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.06, 7);
    };
    const trunk = merged([lathe([[0, 0], [0.34, 0], [0.22, 0.12], [0.16, 0.45], [0.13, 1.5], [0.1, 2.3], [0.05, 2.9], [0, 2.95]], 14), bough(0.3, 1.5, 0.9), bough(2.4, 1.7, 0.8), bough(4.3, 1.4, 0.85)]);
    const bark = barkTexture();
    bark.repeat.set(2, 2);
    const trunks = new THREE.InstancedMesh(trunk, new THREE.MeshStandardMaterial({ map: bark, roughness: 0.95 }), n);
    // Crown: nine clusters, each a shaded core wrapped in leaf cards that face outward.
    const clusters = [[0, 3.25, 0, 0.8], [0.72, 2.65, 0.15, 0.62], [-0.7, 2.6, 0.2, 0.62], [0.1, 2.55, 0.68, 0.6], [-0.1, 2.6, -0.68, 0.6], [0.45, 2.15, 0.45, 0.5], [-0.4, 2.2, -0.35, 0.5], [0.05, 3.8, 0.1, 0.52], [-0.5, 3.2, 0.35, 0.56], [0.52, 3.2, -0.38, 0.56]];
    const per = 22;
    const cores = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 3), new THREE.MeshStandardMaterial({ color: "#1f4a1a", roughness: 0.9 }), n * clusters.length);
    this.leafU = { uTime: { value: 0 }, uKick: { value: 0 } };
    const leafMat = new THREE.MeshStandardMaterial({ map: leafTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.75 });
    leafMat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.leafU);
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nuniform float uTime, uKick;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvec3 ip = vec3(instanceMatrix[3]);\ntransformed.xy += vec2(sin(uTime * 1.3 + ip.x * 0.8 + ip.y), cos(uTime * 1.1 + ip.z * 0.7)) * 0.08;\ntransformed *= 1.0 + uKick * 0.05;");
    };
    const leaves = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), leafMat, n * clusters.length * per);
    const d = new THREE.Object3D();
    const c = new THREE.Color();
    const dir = new THREE.Vector3();
    let li = 0;
    spots.forEach(([x, z, s], i) => {
      const ry = hash(i * 7.1) * 6;
      d.position.set(x, 0, z);
      d.rotation.set(0, ry, 0);
      d.scale.setScalar(s);
      d.updateMatrix();
      trunks.setMatrixAt(i, d.matrix);
      const cr = Math.cos(ry);
      const sr = Math.sin(ry);
      clusters.forEach(([cx, cy, cz, r], k) => {
        const wx = x + (cx * cr + cz * sr) * s;
        const wy = cy * s;
        const wz = z + (-cx * sr + cz * cr) * s;
        d.position.set(wx, wy, wz);
        d.rotation.set(0, 0, 0);
        d.scale.setScalar(r * s * 0.82);
        d.updateMatrix();
        cores.setMatrixAt(i * clusters.length + k, d.matrix);
        for (let j = 0; j < per; j++) {
          const h1 = hash(i * 131 + k * 17 + j * 3.1);
          const h2 = hash(i * 71 + k * 29 + j * 5.7);
          dir.set(Math.cos(h1 * Math.PI * 2) * Math.sqrt(1 - (h2 * 1.7 - 0.7) ** 2), h2 * 1.7 - 0.7, Math.sin(h1 * Math.PI * 2) * Math.sqrt(1 - (h2 * 1.7 - 0.7) ** 2));
          d.position.set(wx + dir.x * r * s * 0.85, wy + dir.y * r * s * 0.85, wz + dir.z * r * s * 0.85);
          d.lookAt(d.position.x + dir.x, d.position.y + dir.y, d.position.z + dir.z);
          d.rotateZ(h1 * 6);
          d.scale.setScalar((0.55 + hash(j * 9.7 + i) * 0.3) * s);
          d.updateMatrix();
          leaves.setMatrixAt(li, d.matrix);
          const lift = 0.75 + 0.35 * (dir.y * 0.5 + 0.5) + (hash(li * 1.9) - 0.5) * 0.2;
          leaves.setColorAt(li, c.setRGB(lift, lift * (0.95 + hash(i * 3.3) * 0.15), lift * 0.85));
          li++;
        }
      });
    });
    this.group.add(trunks, cores, leaves);
  }

  buildBench() {
    const iron = new THREE.MeshStandardMaterial({ color: "#1f2a24", roughness: 0.45, metalness: 0.6 });
    const slat = new THREE.MeshStandardMaterial({ map: woodTexture("#9a6236", 21), roughness: 0.6 });
    // Cast-iron ends: a scrolled leg, seat bracket and back support in one beveled profile.
    const end = new THREE.Shape();
    end.moveTo(0.22, 0);
    end.quadraticCurveTo(0.18, 0.22, 0.2, 0.42);
    end.lineTo(-0.2, 0.42);
    end.quadraticCurveTo(-0.3, 0.7, -0.28, 0.92);
    end.lineTo(-0.24, 0.92);
    end.quadraticCurveTo(-0.25, 0.66, -0.14, 0.46);
    end.quadraticCurveTo(-0.2, 0.22, -0.2, 0);
    end.lineTo(-0.15, 0);
    end.quadraticCurveTo(-0.13, 0.25, -0.05, 0.37);
    end.lineTo(0.12, 0.37);
    end.quadraticCurveTo(0.14, 0.2, 0.17, 0);
    end.closePath();
    const endGeo = new THREE.ExtrudeGeometry(end, { depth: 0.035, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 2, curveSegments: 16 })
      .rotateY(-Math.PI / 2);
    const bench = new THREE.Group();
    const [bx, bz] = around(-30, ARC + 2.4);
    bench.position.set(bx, 0, bz);
    bench.lookAt(0, 0, 0);
    for (const x of [-0.72, 0.72]) mesh(endGeo, iron, x + 0.0175, 0, 0, bench);
    const slats = [];
    for (let k = 0; k < 4; k++) slats.push(place(rbox(1.65, 0.035, 0.085, 0.012), 0, 0.445, 0.16 - k * 0.1));
    for (let k = 0; k < 3; k++) slats.push(place(rbox(1.65, 0.085, 0.03, 0.012), 0, 0.56 + k * 0.12, -0.235 - k * 0.012, -0.2, 0, 0));
    mesh(merged(slats), slat, 0, 0, 0, bench);
    const bolts = [];
    for (const x of [-0.76, 0.76]) for (let k = 0; k < 4; k++) bolts.push(place(new THREE.SphereGeometry(0.012, 8, 6), x, 0.45, 0.16 - k * 0.1));
    mesh(merged(bolts), iron, 0, 0, 0, bench);
    bench.traverse((o) => (o.castShadow = o.receiveShadow = true));
    this.group.add(bench);
  }

  buildLamp() {
    const iron = new THREE.MeshStandardMaterial({ color: "#1d2622", roughness: 0.4, metalness: 0.7 });
    const [lx, lz] = around(49, ARC + 3.4);
    const lamp = new THREE.Group();
    lamp.position.set(lx, 0, lz);
    this.group.add(lamp);
    // Stepped plinth, fluted column with collars, then a four-paned lantern under a domed cap.
    mesh(lathe([[0, 0], [0.2, 0], [0.2, 0.06], [0.16, 0.08], [0.15, 0.22], [0.11, 0.3], [0.09, 0.42], [0.06, 0.46], [0, 0.46]], 32), iron, 0, 0, 0, lamp);
    mesh(new THREE.CylinderGeometry(0.045, 0.055, 2.5, 20), iron, 0, 1.7, 0, lamp);
    for (const y of [0.5, 1.6, 2.95]) mesh(new THREE.TorusGeometry(0.06, 0.018, 8, 24).rotateX(Math.PI / 2), iron, 0, y, 0, lamp);
    mesh(lathe([[0, 0], [0.12, 0], [0.12, 0.03], [0.09, 0.05], [0, 0.05]], 4).rotateY(Math.PI / 4), iron, 0, 2.95, 0, lamp);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      mesh(new THREE.BoxGeometry(0.018, 0.34, 0.018), iron, Math.cos(a) * 0.12, 3.17, Math.sin(a) * 0.12, lamp);
    }
    mesh(new THREE.CylinderGeometry(0.115, 0.08, 0.32, 4, 1, true).rotateY(Math.PI / 4), new THREE.MeshPhysicalMaterial({ color: "#d8ecf0", roughness: 0.05, transparent: true, opacity: 0.35, side: THREE.DoubleSide }), 0, 3.17, 0, lamp);
    mesh(new THREE.SphereGeometry(0.045, 16, 12), new THREE.MeshStandardMaterial({ color: "#f6e8c0", emissive: "#ffd890", emissiveIntensity: 0.25 }), 0, 3.15, 0, lamp);
    mesh(lathe([[0, 0.12], [0.03, 0.11], [0.08, 0.07], [0.17, 0.0], [0, 0]], 4).rotateY(Math.PI / 4), iron, 0, 3.34, 0, lamp);
    mesh(new THREE.SphereGeometry(0.025, 12, 8), iron, 0, 3.48, 0, lamp);
    lamp.traverse((o) => (o.castShadow = true));
  }

  buildHills() {
    const hill = new THREE.MeshStandardMaterial({ color: "#4f7a4a", roughness: 1 });
    for (let i = 0; i < 9; i++) {
      const [x, z] = around(-100 + i * 25, 80 + hash(i * 3.1) * 15);
      const h = mesh(new THREE.SphereGeometry(1, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), hill, x, 0, z, this.group);
      h.scale.set(16 + hash(i * 2.2) * 10, 5 + hash(i * 5.5) * 5, 10);
      h.lookAt(0, 0, 0);
    }
  }

  update(t, kick) {
    this.skyU.uTime.value = t;
    this.waterU.uTime.value = t;
    this.grassU.uTime.value = t;
    this.grassU.uKick.value = kick;
    this.leafU.uTime.value = t;
    this.leafU.uKick.value = kick;
    const d = this.dummy;
    this.reedPlaces.forEach(([x, z, h], i) => {
      d.position.set(x, 0, z);
      d.rotation.set(Math.sin(t * 1.1 + i) * 0.04, i * 1.7, Math.sin(t * 1.3 + i * 0.7) * 0.06);
      d.scale.set(1, h, 1);
      d.updateMatrix();
      this.reeds.setMatrixAt(i, d.matrix);
      this.heads.setMatrixAt(i, d.matrix);
    });
    this.reeds.instanceMatrix.needsUpdate = true;
    this.heads.instanceMatrix.needsUpdate = true;
  }

  ripple(x, z, t0) {
    this.waterU.uRip.value.set(x, z, t0);
  }
}
