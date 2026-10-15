import * as THREE from "three";
import { hash } from "@gizclaw/mvg-core/timing.js";

// A retro tinkerer's workshop at night: pegboard wall, shelves of old monitors,
// two pendant lamps and side benches. The machine stands on the floor at the
// origin; the back wall is at z = WALL_Z and the floor at y = FLOOR_Y.
export const FLOOR_Y = -2.3;
const WALL_Z = -3.4;
export const LAMPS = [[-2.4, 4.3, 1.2], [2.4, 4.3, 1.2]];

const WALL = /* glsl */ `
  uniform float uTime, uGlow; uniform vec2 uLamps[2]; varying vec3 vW;
  float h21(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
  float box(vec2 p, vec2 c, vec2 s) { vec2 d = abs(p - c) - s; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
  void main() {
    vec2 p = vW.xy;
    // Pegboard above a dado rail, tongue-and-groove planks below.
    vec3 board = vec3(0.55, 0.36, 0.2) * (0.9 + 0.1 * h21(floor(p * 0.5)));
    vec2 g = fract(p * 4.0) - 0.5;
    float hole = smoothstep(0.13, 0.09, length(g));
    vec3 col = mix(board, vec3(0.08, 0.05, 0.03), hole * 0.85);
    // Tool silhouettes hanging on the board, each with a soft drop shadow.
    float tools = 1e3;
    for (int i = 0; i < 9; i++) {
      float fi = float(i);
      float side = i < 5 ? -1.0 : 1.0;
      vec2 c = vec2(side * (2.2 + mod(fi * 1.37, 2.6)), 0.6 + mod(fi * 2.17, 3.4));
      float kind = mod(fi, 3.0);
      float d = kind < 0.5 ? min(box(p, c, vec2(0.05, 0.55)), box(p, c + vec2(0.0, 0.55), vec2(0.2, 0.08)))
              : kind < 1.5 ? min(box(p, c, vec2(0.04, 0.5)), length(p - c - vec2(0.0, 0.55)) - 0.14)
              : min(box(p, c, vec2(0.08, 0.35)), box(p, c - vec2(0.0, 0.5), vec2(0.03, 0.2)));
      tools = min(tools, d);
    }
    col *= 1.0 - 0.45 * smoothstep(0.12, 0.0, tools + 0.05) * step(0.0, tools);
    col = mix(col, vec3(0.32, 0.34, 0.36), step(tools, 0.0));
    float plank = step(p.y, -0.6);
    vec3 wood = vec3(0.32, 0.18, 0.1) * (0.85 + 0.15 * step(0.04, fract(p.x * 1.6)));
    col = mix(col, wood, plank);
    col = mix(col, vec3(0.2, 0.12, 0.07), smoothstep(0.06, 0.0, abs(p.y + 0.6)));
    // Warm pools under the two lamps.
    float light = 0.12;
    for (int i = 0; i < 2; i++) { vec2 d = (p - uLamps[i]) * vec2(1.0, 0.7); light += 0.9 * exp(-dot(d, d) * 0.12); }
    light += uGlow * 0.15;
    // Output is sRGB-encoded afterwards; keep the wall dim behind the machine.
    gl_FragColor = vec4(col * light * vec3(1.0, 0.86, 0.7) * 0.42, 1.0);
  }`;

const FLOOR = /* glsl */ `
  uniform vec2 uLamps[2]; varying vec3 vW;
  float h21(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
  float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
  void main() {
    vec2 p = vW.xz;
    float row = floor(p.y * 1.8);
    vec2 q = vec2(p.x + h21(vec2(row, 0.0)) * 3.0, p.y);
    vec3 col = vec3(0.36, 0.22, 0.12) * (0.75 + 0.25 * h21(vec2(floor(q.x * 0.6), row))) * (0.85 + 0.3 * noise(p * vec2(8.0, 1.0)));
    col *= 0.6 + 0.4 * smoothstep(0.0, 0.05, fract(p.y * 1.8));
    float light = 0.15;
    for (int i = 0; i < 2; i++) { vec2 d = p - vec2(uLamps[i].x, 1.0); light += 0.7 * exp(-dot(d, d) * 0.08); }
    light += 0.5 * exp(-dot(p - vec2(0.0, 1.5), p - vec2(0.0, 1.5)) * 0.15);
    gl_FragColor = vec4(col * light * 0.5, 1.0);
  }`;

function mesh(geo, mat, x = 0, y = 0, z = 0, parent) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

function terminalTexture() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 512;
  const g = c.getContext("2d");
  g.fillStyle = "#031208";
  g.fillRect(0, 0, 256, 512);
  g.font = "700 22px Menlo";
  const glyphs = "0123456789+-×÷=x/";
  for (let row = 0; row < 22; row++) {
    let s = "";
    for (let k = 0; k < 14; k++) s += hash(row * 31 + k) < 0.25 ? " " : glyphs[Math.floor(hash(row * 7.7 + k * 3.1) * glyphs.length)];
    g.fillStyle = row % 5 === 0 ? "#ffb347" : "#3dff8a";
    g.fillText(s, 12, 26 + row * 23);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 0.4);
  return tex;
}

export class Workshop {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
    const lamps = LAMPS.map(([x, y]) => new THREE.Vector2(x, y - 0.8));
    this.wallU = { uTime: { value: 0 }, uGlow: { value: 0 }, uLamps: { value: lamps } };
    const world = "varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }";
    mesh(new THREE.PlaneGeometry(30, 16), new THREE.ShaderMaterial({ uniforms: this.wallU, vertexShader: world, fragmentShader: WALL }), 0, FLOOR_Y + 8, WALL_Z, this.group);
    mesh(new THREE.PlaneGeometry(30, 24).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({ uniforms: { uLamps: { value: lamps } }, vertexShader: world, fragmentShader: FLOOR }), 0, FLOOR_Y, WALL_Z + 12, this.group);

    this.buildLamps();
    this.buildShelves();
    this.buildBenches();
    this.buildDust();
  }

  buildLamps() {
    const enamel = new THREE.MeshStandardMaterial({ color: "#1f4a40", roughness: 0.4, metalness: 0.3, side: THREE.DoubleSide });
    const cord = new THREE.MeshStandardMaterial({ color: "#151515", roughness: 0.8 });
    this.bulbMat = new THREE.MeshBasicMaterial({ color: "#ffd9a0" });
    this.lamps = LAMPS.map(([x, y, z]) => {
      const g = new THREE.Group();
      g.position.set(x, y + 3, z);
      mesh(new THREE.CylinderGeometry(0.015, 0.015, 3, 6).translate(0, -1.5, 0), cord, 0, 0, 0, g);
      mesh(new THREE.ConeGeometry(0.55, 0.45, 32, 1, true).translate(0, -3.2, 0), enamel, 0, 0, 0, g);
      mesh(new THREE.SphereGeometry(0.14, 16, 12), this.bulbMat, 0, -3.42, 0, g);
      const light = new THREE.PointLight("#ffb46a", 22, 0, 1.6);
      light.position.set(0, -3.5, 0);
      g.add(light);
      this.group.add(g);
      return { g, light };
    });
    this.group.add(new THREE.HemisphereLight("#4a5a7a", "#2a1a10", 0.6));
  }

  buildShelves() {
    const wood = new THREE.MeshStandardMaterial({ color: "#6b4426", roughness: 0.8 });
    const shell = new THREE.MeshStandardMaterial({ color: "#c9bfa6", roughness: 0.6 });
    const glass = new THREE.MeshStandardMaterial({ color: "#7aa0a0", roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.5 });
    this.terminal = terminalTexture();
    const screen = new THREE.MeshBasicMaterial({ map: this.terminal, color: "#9a9a9a" });
    for (const side of [-1, 1]) {
      for (const y of [1.3, 3.1]) {
        mesh(new THREE.BoxGeometry(2.6, 0.08, 0.7), wood, side * 3.4, y, WALL_Z + 0.4, this.group);
        for (let k = 0; k < 3; k++) {
          const x = side * (2.5 + k * 0.85);
          const seed = hash(y * 3 + k + side * 7);
          if (seed < 0.45) {
            const m = new THREE.Group();
            m.position.set(x, y + 0.04, WALL_Z + 0.42);
            mesh(new THREE.BoxGeometry(0.62, 0.52, 0.5), shell, 0, 0.26, 0, m);
            mesh(new THREE.PlaneGeometry(0.46, 0.36), screen, 0, 0.28, 0.252, m);
            this.group.add(m);
          } else if (seed < 0.75) {
            for (let j = 0; j < 2; j++) mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.34, 16), glass, x - 0.15 + j * 0.3, y + 0.21, WALL_Z + 0.4, this.group);
          } else {
            mesh(new THREE.BoxGeometry(0.6, 0.36, 0.45), new THREE.MeshStandardMaterial({ color: ["#a8452e", "#2e6aa8", "#c99a3a"][k % 3], roughness: 0.7 }), x, y + 0.22, WALL_Z + 0.4, this.group);
          }
        }
      }
    }
  }

  buildBenches() {
    const top = new THREE.MeshStandardMaterial({ color: "#8a5a32", roughness: 0.7 });
    const steel = new THREE.MeshStandardMaterial({ color: "#3a3f46", roughness: 0.5, metalness: 0.6 });
    const red = new THREE.MeshStandardMaterial({ color: "#b8382a", roughness: 0.5, metalness: 0.2 });
    for (const side of [-1, 1]) {
      const x = side * 4.3;
      mesh(new THREE.BoxGeometry(2.6, 0.12, 1.6), top, x, FLOOR_Y + 1.15, -1.6, this.group);
      for (const dx of [-1.1, 1.1]) mesh(new THREE.BoxGeometry(0.1, 1.1, 1.4), steel, x + dx, FLOOR_Y + 0.55, -1.6, this.group);
      mesh(new THREE.BoxGeometry(0.8, 0.45, 0.45), red, x - side * 0.5, FLOOR_Y + 1.44, -1.5, this.group);
      mesh(new THREE.BoxGeometry(0.85, 0.06, 0.5), red, x - side * 0.5, FLOOR_Y + 1.7, -1.5, this.group);
    }
    // Coiled cable on the floor in front of the machine.
    const pts = [];
    for (let i = 0; i <= 120; i++) {
      const a = i * 0.21;
      pts.push(new THREE.Vector3(-2.6 + i * 0.03 + Math.cos(a) * 0.25, FLOOR_Y + 0.04, 1.6 + Math.sin(a) * 0.25));
    }
    mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 240, 0.03, 6), new THREE.MeshStandardMaterial({ color: "#d8652a", roughness: 0.6 }), 0, 0, 0, this.group);
  }

  buildDust() {
    const n = 160;
    this.dustSeed = Array.from({ length: n }, (_, i) => [hash(i * 1.7) * 10 - 5, hash(i * 2.9) * 7 - 2, hash(i * 4.3) * 5 - 2, 0.2 + hash(i * 6.1) * 0.5]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.dust = new THREE.Points(geo, new THREE.PointsMaterial({ color: "#ffd9a8", size: 0.035, transparent: true, opacity: 0.45, depthWrite: false }));
    this.dust.frustumCulled = false;
    this.group.add(this.dust);
  }

  update(t, kick) {
    this.wallU.uTime.value = t;
    this.wallU.uGlow.value = kick;
    this.terminal.offset.y = -Math.floor(t * 6) / 22;
    this.lamps.forEach(({ g, light }, i) => {
      g.rotation.z = Math.sin(t * 0.7 + i * 2) * 0.03;
      light.intensity = 20 + kick * 4;
    });
    this.bulbMat.color.set("#ffd9a0").multiplyScalar(1 + kick * 0.15);
    const p = this.dust.geometry.attributes.position;
    this.dustSeed.forEach(([x, y, z, s], i) => p.setXYZ(i, x + Math.sin(t * s + i) * 0.4, -2 + ((y + 2 + t * s * 0.15) % 7), z));
    p.needsUpdate = true;
  }
}
