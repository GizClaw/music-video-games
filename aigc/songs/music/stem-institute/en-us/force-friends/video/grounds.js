import * as THREE from "three";
import { hash } from "@gizclaw/mvg-core/timing.js";

// A sunny park. Six stations stand on an arc of radius ARC around a gravel
// plaza at the origin, facing it; the arc opens toward +z, where the wide
// camera stands. The pond lies just behind the buoyancy station.
export const ARC = 5.5;
export const ANGLES = [-62.5, -37.5, -12.5, 12.5, 37.5, 62.5].map((d) => (d * Math.PI) / 180);
export const spot = (k, r = ARC) => new THREE.Vector3(Math.sin(ANGLES[k]) * r, 0, -Math.cos(ANGLES[k]) * r);
const pondAt = spot(3, ARC + 0.55);
export const POND = { x: pondAt.x, z: pondAt.z, rx: 1.9, rz: 1.55 };
export const HORIZON = new THREE.Color().setRGB(0.2, 0.29, 0.4);

const SKY = /* glsl */ `
  uniform float uTime; varying vec3 vDir;
  float h21(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
  float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
  float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
  void main() {
    vec3 d = normalize(vDir);
    float h = max(d.y, 0.0);
    vec3 col = mix(vec3(0.4, 0.58, 0.8), vec3(0.08, 0.26, 0.72), pow(h, 0.5));
    // Fair-weather cumulus on a plane high above the park.
    vec2 p = d.xz / max(d.y, 0.04) * 0.9 + vec2(uTime * 0.012, 0.0);
    float c = fbm(p);
    float cloud = smoothstep(0.52, 0.78, c) * smoothstep(0.02, 0.18, d.y);
    vec3 cloudCol = mix(vec3(0.78, 0.82, 0.9), vec3(1.0), smoothstep(0.55, 0.9, fbm(p * 1.7 + 3.0)));
    col = mix(col, cloudCol, cloud * 0.9);
    // Output is sRGB-encoded afterwards; keep the sky below the bloom threshold.
    gl_FragColor = vec4(col * 0.5, 1.0);
  }`;

const LAWN = /* glsl */ `
  uniform vec3 uHaze; uniform vec4 uPond; uniform float uArc; varying vec3 vW;
  float h21(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
  float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
  void main() {
    vec2 p = vW.xz;
    float n = noise(p * 0.45) * 0.55 + noise(p * 2.1) * 0.3 + noise(p * 11.0) * 0.15;
    vec3 grass = mix(vec3(0.12, 0.3, 0.05), vec3(0.3, 0.52, 0.1), n);
    grass *= 0.9 + 0.1 * step(0.5, fract(p.x * 0.28));
    // Gravel: a round plaza and a path along the front of the stations.
    float r = length(p);
    float path = max(1.0 - smoothstep(1.7, 1.85, r), (1.0 - smoothstep(0.32, 0.45, abs(r - uArc + 1.6))) * step(p.y, 1.5));
    vec3 gravel = mix(vec3(0.5, 0.42, 0.3), vec3(0.66, 0.58, 0.44), noise(p * 14.0));
    vec3 col = mix(grass, gravel, path);
    // Damp, darker bank around the pond.
    vec2 q = (p - uPond.xy) / uPond.zw;
    col *= 1.0 - 0.45 * smoothstep(1.35, 1.0, length(q));
    float dist = length(vW.xz - cameraPosition.xz);
    col = mix(col * 0.62, uHaze, smoothstep(20.0, 80.0, dist));
    gl_FragColor = vec4(col, 1.0);
  }`;

const WATER = /* glsl */ `
  uniform float uTime; uniform vec3 uRip; varying vec3 vW;
  float h21(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
  float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
  void main() {
    vec3 v = normalize(cameraPosition - vW);
    float fres = pow(1.0 - max(v.y, 0.0), 3.0);
    vec2 p = vW.xz;
    float w = noise(p * 3.0 + vec2(uTime * 0.4, uTime * 0.25)) + noise(p * 5.0 - vec2(uTime * 0.3, -uTime * 0.2));
    vec3 deep = vec3(0.02, 0.16, 0.2);
    vec3 sky = vec3(0.45, 0.65, 0.9);
    vec3 col = mix(deep, sky, 0.25 + fres * 0.6 + (w - 1.0) * 0.08);
    float age = uTime - uRip.z;
    float r = length(p - uRip.xy);
    float ring = age > 0.0 ? exp(-pow((r - age * 1.1) * 9.0, 2.0)) * exp(-age * 1.2) : 0.0;
    col += vec3(0.5, 0.7, 0.8) * ring * 0.5;
    col += vec3(1.0, 0.95, 0.8) * smoothstep(1.93, 1.98, w) * 0.5;
    gl_FragColor = vec4(col * 0.6, 1.0);
  }`;

function mesh(geo, mat, x = 0, y = 0, z = 0, parent) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

/** A point on the far side of the park: angle from the -z axis (degrees) and radius. */
const around = (deg, r) => [Math.sin((deg * Math.PI) / 180) * r, -Math.cos((deg * Math.PI) / 180) * r];

export class Grounds {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
    scene.fog = new THREE.Fog(HORIZON, 30, 120);
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
    const lawn = new THREE.Mesh(
      new THREE.PlaneGeometry(320, 320).rotateX(-Math.PI / 2),
      new THREE.ShaderMaterial({ uniforms: { uHaze: { value: HORIZON }, uArc: { value: ARC }, uPond: { value: new THREE.Vector4(POND.x, POND.z, POND.rx, POND.rz) } }, vertexShader: world, fragmentShader: LAWN }),
    );
    this.group.add(lawn);

    this.waterU = { uTime: { value: 0 }, uRip: { value: new THREE.Vector3(0, 0, -99) } };
    const water = new THREE.Mesh(new THREE.CircleGeometry(1, 64).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({ uniforms: this.waterU, vertexShader: world, fragmentShader: WATER }));
    water.scale.set(POND.rx, 1, POND.rz);
    water.position.set(POND.x, 0.02, POND.z);
    this.group.add(water);

    this.buildBank();
    this.buildTrees();
    this.buildFlowers();
    this.buildProps();
  }

  buildBank() {
    const stone = new THREE.MeshStandardMaterial({ color: "#8f8a80", roughness: 0.9, flatShading: true });
    const n = 40;
    const stones = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.16, 0), stone, n);
    const d = new THREE.Object3D();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      d.position.set(POND.x + Math.cos(a) * POND.rx * 1.03, 0.04, POND.z + Math.sin(a) * POND.rz * 1.03);
      d.rotation.set(hash(i) * 3, hash(i * 2.1) * 3, 0);
      d.scale.set(1 + hash(i * 3.3) * 0.8, 0.5 + hash(i * 4.1) * 0.4, 1 + hash(i * 5.7) * 0.6);
      d.updateMatrix();
      stones.setMatrixAt(i, d.matrix);
    }
    this.group.add(stones);
    // Reeds on the far bank and lily pads on the water.
    const reed = new THREE.MeshStandardMaterial({ color: "#5d7a2a", roughness: 0.8 });
    const head = new THREE.MeshStandardMaterial({ color: "#5a3a1e", roughness: 0.8 });
    this.reeds = [];
    for (let i = 0; i < 16; i++) {
      const a = -Math.PI * (0.2 + hash(i * 1.7) * 0.6);
      const g = new THREE.Group();
      g.position.set(POND.x + Math.cos(a) * POND.rx * 0.97, 0, POND.z + Math.sin(a) * POND.rz * 0.97);
      const h = 0.6 + hash(i * 2.9) * 0.5;
      mesh(new THREE.CylinderGeometry(0.012, 0.018, h, 5).translate(0, h / 2, 0), reed, 0, 0, 0, g);
      mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.16, 8), head, 0, h - 0.06, 0, g);
      this.group.add(g);
      this.reeds.push(g);
    }
    const pad = new THREE.MeshStandardMaterial({ color: "#3f7a2a", roughness: 0.7 });
    for (let i = 0; i < 6; i++) {
      const a = 2.2 + i * 0.5;
      const p = mesh(new THREE.CircleGeometry(0.14 + hash(i * 6.1) * 0.08, 16, 0.4, Math.PI * 2 - 0.4).rotateX(-Math.PI / 2), pad, POND.x + Math.cos(a) * POND.rx * 0.7, 0.03, POND.z + Math.sin(a) * POND.rz * 0.7, this.group);
      p.rotation.y = hash(i) * 6;
    }
  }

  buildTrees() {
    const spots = [];
    for (let i = 0; i < 46; i++) {
      const [x, z] = around(-118 + hash(i * 1.3) * 236, 10 + hash(i * 2.7) * 24);
      spots.push([x, z, 1 + hash(i * 3.9) * 0.7]);
    }
    for (const [deg, r, s] of [[-92, 8.6, 1.0], [-60, 9.2, 1.25], [-28, 8.4, 0.95], [2, 9.4, 1.2], [32, 8.8, 1.05], [62, 9.0, 1.3], [95, 8.4, 1.0], [118, 8.0, 1.1]]) spots.push([...around(deg, r), s]);
    this.trees = spots;
    const n = spots.length;
    this.trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.18, 1.6, 7).translate(0, 0.8, 0), new THREE.MeshStandardMaterial({ color: "#6b4a30", roughness: 0.9 }), n);
    this.crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.85, flatShading: true }), n * 3);
    const greens = ["#3f7d2c", "#4f9334", "#2f6b2a", "#5c9a3a"].map((c) => new THREE.Color(c));
    for (let i = 0; i < n * 3; i++) this.crowns.setColorAt(i, greens[Math.floor(hash(i * 1.9) * 4)]);
    this.group.add(this.trunks, this.crowns);
    this.dummy = new THREE.Object3D();
  }

  buildFlowers() {
    const n = 120;
    this.flowers = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.045, 0), new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.6 }), n);
    const cols = ["#ffffff", "#ffd23f", "#ff7ab8", "#b48cff"].map((c) => new THREE.Color(c));
    this.flowerSeed = [];
    for (let i = 0; i < n; i++) {
      let [x, z] = around(-105 + hash(i * 2.3) * 210, ARC + 1.6 + hash(i * 4.7) * 3);
      if (Math.hypot((x - POND.x) / POND.rx, (z - POND.z) / POND.rz) < 1.2) [x, z] = [x * 1.5, z * 1.5];
      this.flowerSeed.push([x, z, hash(i * 9.1)]);
      this.flowers.setColorAt(i, cols[i % 4]);
    }
    this.group.add(this.flowers);
  }

  buildProps() {
    const wood = new THREE.MeshStandardMaterial({ color: "#8a5a34", roughness: 0.8 });
    const iron = new THREE.MeshStandardMaterial({ color: "#2a2e33", roughness: 0.5, metalness: 0.6 });
    // A park bench and a lamp post behind the arc.
    const bench = new THREE.Group();
    const [bx, bz] = around(-30, ARC + 2.4);
    bench.position.set(bx, 0, bz);
    bench.lookAt(0, 0, 0);
    for (let k = 0; k < 3; k++) mesh(new THREE.BoxGeometry(1.6, 0.05, 0.12), wood, 0, 0.45, -0.15 + k * 0.15, bench);
    for (let k = 0; k < 2; k++) mesh(new THREE.BoxGeometry(1.6, 0.12, 0.04), wood, 0, 0.7 + k * 0.16, -0.25, bench);
    for (const x of [-0.7, 0.7]) mesh(new THREE.BoxGeometry(0.06, 0.45, 0.4), iron, x, 0.22, -0.05, bench);
    this.group.add(bench);
    const [lx, lz] = around(60, ARC + 2.2);
    const post = mesh(new THREE.CylinderGeometry(0.05, 0.07, 3.2, 10).translate(0, 1.6, 0), iron, lx, 0, lz, this.group);
    mesh(new THREE.SphereGeometry(0.18, 16, 12), new THREE.MeshStandardMaterial({ color: "#f3ead2", roughness: 0.3 }), 0, 3.3, 0, post);
    // Low hills on the horizon.
    const hill = new THREE.MeshStandardMaterial({ color: "#4f7a4a", roughness: 1, flatShading: true });
    for (let i = 0; i < 9; i++) {
      const [x, z] = around(-100 + i * 25, 80 + hash(i * 3.1) * 15);
      const h = mesh(new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), hill, x, 0, z, this.group);
      h.scale.set(16 + hash(i * 2.2) * 10, 5 + hash(i * 5.5) * 5, 10);
      h.lookAt(0, 0, 0);
    }
  }

  update(t, kick, bounce) {
    this.skyU.uTime.value = t;
    this.waterU.uTime.value = t;
    const d = this.dummy;
    this.trees.forEach(([x, z, s], i) => {
      const bob = 1 + bounce * 0.05 * Math.sin(i * 1.7 + 1);
      d.position.set(x, 0, z);
      d.rotation.set(0, i, Math.sin(t * 0.7 + i) * 0.02);
      d.scale.set(s, s * bob, s);
      d.updateMatrix();
      this.trunks.setMatrixAt(i, d.matrix);
      for (let k = 0; k < 3; k++) {
        d.position.set(x + (k - 1) * 0.55 * s + Math.sin(t * 0.9 + i + k) * 0.03, (1.9 + (k === 1 ? 0.6 : 0)) * s * bob, z + (k === 1 ? -0.1 : 0.2) * s);
        d.rotation.set(i + k, k, 0);
        d.scale.setScalar(s * (k === 1 ? 1.05 : 0.8) * (1 + kick * 0.03));
        d.updateMatrix();
        this.crowns.setMatrixAt(i * 3 + k, d.matrix);
      }
    });
    this.trunks.instanceMatrix.needsUpdate = true;
    this.crowns.instanceMatrix.needsUpdate = true;
    this.flowerSeed.forEach(([x, z, ph], i) => {
      d.position.set(x, 0.1 + bounce * 0.05 * (0.5 + ph), z);
      d.rotation.set(0, 0, 0);
      d.scale.setScalar(1 + kick * 0.25);
      d.updateMatrix();
      this.flowers.setMatrixAt(i, d.matrix);
    });
    this.flowers.instanceMatrix.needsUpdate = true;
    this.reeds.forEach((r, i) => (r.rotation.z = Math.sin(t * 1.3 + i * 0.7) * 0.06));
  }

  ripple(x, z, t0) {
    this.waterU.uRip.value.set(x, z, t0);
  }
}
