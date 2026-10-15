import * as THREE from "three";
import { hash } from "@gizclaw/mvg-core/timing.js";

// A construction site at golden hour around the scaffold that holds the six
// machines. The camera looks level, so the horizon sits on screen row 960.
const GROUND_Y = -4.6;

export const SKY = /* glsl */ `
  uniform float uTime, uKick, uGear; varying vec2 vUv;
  float h11(float n) { return fract(sin(n * 127.1) * 43758.5453); }
  float h21(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
  float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
  float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise(p); p *= 2.02; a *= 0.5; } return s; }
  void main() {
    vec2 uv = vUv;
    float k = clamp((uv.y - 0.5) / 0.5, 0.0, 1.0);
    vec3 col = mix(vec3(1.0, 0.58, 0.3), vec3(0.42, 0.36, 0.5), smoothstep(0.0, 0.35, k));
    col = mix(col, vec3(0.12, 0.2, 0.38), smoothstep(0.3, 1.0, k));
    vec2 sp = (uv - vec2(0.8, 0.545)) * vec2(0.5625, 1.0);
    float sd = length(sp);
    col += vec3(1.0, 0.75, 0.4) * smoothstep(0.035, 0.03, sd) * 1.2;
    col += vec3(1.0, 0.5, 0.2) * exp(-sd * 9.0) * 0.55;
    // Long clouds lit from below by the low sun.
    float c = fbm(vec2(uv.x * 3.0 + uTime * 0.004, uv.y * 14.0));
    float band = smoothstep(0.55, 0.95, uv.y) * (1.0 - smoothstep(0.95, 1.0, uv.y));
    float cloud = smoothstep(0.5, 0.75, c) * band;
    col = mix(col, mix(vec3(0.95, 0.55, 0.4), vec3(0.35, 0.3, 0.45), smoothstep(0.6, 0.9, uv.y)), cloud * 0.7);
    // City skyline in the haze along the horizon.
    float bx = floor(uv.x * 46.0);
    float top = 0.5 + 0.012 + h11(bx) * 0.035 * step(0.25, h11(bx + 9.0));
    if (uv.y < top) col = mix(col, vec3(0.42, 0.3, 0.36), 0.75);
    col = mix(col, vec3(0.75, 0.48, 0.38), exp(-abs(uv.y - 0.5) * 60.0) * 0.4);
    // Output is sRGB-encoded afterwards; pull the sky down so the scene stays the subject.
    gl_FragColor = vec4(col * 0.55, 1.0);
  }`;

const GROUND = /* glsl */ `
  varying vec3 vW;
  float h21(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
  float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
  void main() {
    vec2 p = vW.xz;
    float n = noise(p * 0.6) * 0.6 + noise(p * 2.3) * 0.3 + noise(p * 9.0) * 0.1;
    vec3 dirt = mix(vec3(0.16, 0.1, 0.06), vec3(0.3, 0.2, 0.12), n);
    float tracks = smoothstep(0.25, 0.0, abs(abs(p.x - 2.0) - 1.4)) * (0.6 + 0.4 * step(0.5, fract(p.y * 1.5)));
    dirt *= 1.0 - tracks * 0.25;
    float dist = length(vW.xz - vec2(0.0, 20.0));
    vec3 haze = vec3(0.55, 0.38, 0.3);
    vec3 col = mix(dirt, haze, smoothstep(30.0, 160.0, dist));
    gl_FragColor = vec4(col * 0.5, 1.0);
  }`;

function box(w, h, d, mat, x, y, z, parent) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

/** A bar of given thickness between two points. */
function strut(a, b, r, mat, parent) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, dir.length(), 8), mat);
  m.position.copy(a).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  parent.add(m);
  return m;
}

export class Site {
  constructor(scene, stripeMat) {
    this.group = new THREE.Group();
    scene.add(this.group);
    scene.fog = new THREE.Fog("#6a4a46", 40, 150);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2),
      new THREE.ShaderMaterial({ vertexShader: "varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }", fragmentShader: GROUND }),
    );
    ground.position.y = GROUND_Y;
    this.group.add(ground);

    this.buildScaffold(stripeMat);
    this.buildCrane();
    this.buildFrame();
    this.buildProps();
  }

  buildScaffold(stripeMat) {
    const tube = new THREE.MeshStandardMaterial({ color: "#a8b0bc", metalness: 0.8, roughness: 0.35 });
    const plank = new THREE.MeshStandardMaterial({ color: "#a0703e", roughness: 0.75 });
    const xs = [-3.1, 0, 3.1];
    // No front standard in the middle: it would cut through every machine.
    for (const x of xs) for (const z of [0.55, -0.6]) if (x !== 0 || z < 0) strut(new THREE.Vector3(x, GROUND_Y, z), new THREE.Vector3(x, 4.6, z), 0.055, tube, this.group);
    for (let row = 0; row < 3; row++) {
      const y = 2.5 - row * 2.5 - 0.96;
      // Plank deck with a striped toe board on the front.
      box(6.3, 0.1, 1.2, plank, 0, y - 0.04, 0, this.group);
      const toe = box(6.3, 0.16, 0.04, stripeMat, 0, y + 0.06, 0.6, this.group);
      toe.renderOrder = 1;
      for (const z of [0.55, -0.6]) strut(new THREE.Vector3(-3.1, y - 0.12, z), new THREE.Vector3(3.1, y - 0.12, z), 0.045, tube, this.group);
      // Guard rail behind each deck and cross bracing on the back face.
      strut(new THREE.Vector3(-3.1, y + 1.0, -0.6), new THREE.Vector3(3.1, y + 1.0, -0.6), 0.04, tube, this.group);
      strut(new THREE.Vector3(-3.1, y - 0.12, -0.62), new THREE.Vector3(0, y + 2.38, -0.62), 0.035, tube, this.group);
      strut(new THREE.Vector3(3.1, y - 0.12, -0.62), new THREE.Vector3(0, y + 2.38, -0.62), 0.035, tube, this.group);
    }
    box(6.4, 0.12, 1.3, plank, 0, GROUND_Y + 0.06, 0, this.group);
  }

  buildCrane() {
    const yellow = new THREE.MeshStandardMaterial({ color: "#f2b31b", metalness: 0.4, roughness: 0.5 });
    const dark = new THREE.MeshStandardMaterial({ color: "#3a3d44", metalness: 0.5, roughness: 0.6 });
    this.crane = new THREE.Group();
    this.crane.position.set(-11, GROUND_Y, -62);
    this.group.add(this.crane);
    const H = 22;
    const w = 0.9;
    const corners = [[-w, -w], [w, -w], [w, w], [-w, w]];
    for (const [x, z] of corners) strut(new THREE.Vector3(x, 0, z), new THREE.Vector3(x, H, z), 0.09, yellow, this.crane);
    for (let y = 0; y < H; y += 1.8) {
      for (let k = 0; k < 4; k++) {
        const [x0, z0] = corners[k];
        const [x1, z1] = corners[(k + 1) % 4];
        strut(new THREE.Vector3(x0, y, z0), new THREE.Vector3(x1, y + 1.8, z1), 0.05, yellow, this.crane);
        strut(new THREE.Vector3(x0, y, z0), new THREE.Vector3(x1, y, z1), 0.05, yellow, this.crane);
      }
    }
    this.slew = new THREE.Group();
    this.slew.position.y = H;
    this.crane.add(this.slew);
    box(1.4, 1.2, 1.4, yellow, 0, 0.6, 0, this.slew);
    box(1.0, 0.8, 1.0, new THREE.MeshStandardMaterial({ color: "#d8dde4", roughness: 0.3, metalness: 0.2 }), 0.9, 0.2, 0.9, this.slew);
    // Jib (long arm) and counter-jib as triangular trusses.
    const jib = (x0, x1, h) => {
      const a = new THREE.Vector3(x0, 1.2, -0.45);
      const b = new THREE.Vector3(x1, 1.2, -0.45);
      const c = new THREE.Vector3(x0, 1.2, 0.45);
      const d = new THREE.Vector3(x1, 1.2, 0.45);
      const e = new THREE.Vector3(x0, 1.2 + h, 0);
      const f = new THREE.Vector3(x1, 1.2 + h * 0.4, 0);
      for (const [p, q] of [[a, b], [c, d], [e, f]]) strut(p, q, 0.07, yellow, this.slew);
      const n = Math.round(Math.abs(x1 - x0) / 1.5);
      for (let k = 0; k < n; k++) {
        const u0 = k / n;
        const u1 = (k + 1) / n;
        strut(a.clone().lerp(b, u0), e.clone().lerp(f, u1), 0.04, yellow, this.slew);
        strut(c.clone().lerp(d, u0), e.clone().lerp(f, u1), 0.04, yellow, this.slew);
      }
    };
    jib(0, 26, 1.4);
    jib(0, -9, 1.0);
    box(2.2, 1.8, 1.6, dark, -8, 0.6, 0, this.slew);
    strut(new THREE.Vector3(0, 1.2, 0), new THREE.Vector3(0, 5.5, 0), 0.08, yellow, this.slew);
    strut(new THREE.Vector3(0, 5.5, 0), new THREE.Vector3(18, 2.4, 0), 0.03, dark, this.slew);
    strut(new THREE.Vector3(0, 5.5, 0), new THREE.Vector3(-8, 2.2, 0), 0.03, dark, this.slew);
    this.trolley = box(0.8, 0.4, 1.0, dark, 16, 1.0, 0, this.slew);
    this.hook = new THREE.Group();
    this.hook.position.set(16, 0.8, 0);
    this.slew.add(this.hook);
    strut(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -9, 0), 0.025, dark, this.hook);
    const beam = new THREE.Group();
    beam.position.y = -9.4;
    this.hook.add(beam);
    const rust = new THREE.MeshStandardMaterial({ color: "#b4532a", metalness: 0.5, roughness: 0.6 });
    box(5, 0.12, 0.6, rust, 0, 0.3, 0, beam);
    box(5, 0.12, 0.6, rust, 0, -0.3, 0, beam);
    box(5, 0.6, 0.1, rust, 0, 0, 0, beam);
    this.beam = beam;
  }

  buildFrame() {
    const concrete = new THREE.MeshStandardMaterial({ color: "#8d8a86", roughness: 0.9 });
    const net = new THREE.MeshStandardMaterial({ color: "#e05a1c", roughness: 0.9, transparent: true, opacity: 0.55 });
    const frame = new THREE.Group();
    frame.position.set(15, GROUND_Y, -48);
    this.group.add(frame);
    const floors = 5;
    for (let f = 0; f <= floors; f++) {
      box(14, 0.4, 10, concrete, 0, f * 3.4, 0, frame);
      if (f < floors) for (const x of [-6.5, -2.2, 2.2, 6.5]) for (const z of [-4.5, 4.5]) box(0.5, 3.4, 0.5, concrete, x, f * 3.4 + 1.7, z, frame);
    }
    box(14, 3.0, 0.05, net, 0, 3.4 * 4 + 1.7, 5.1, frame);
    box(14, 3.0, 0.05, net, 0, 3.4 * 3 + 1.7, 5.1, frame);
    const rebar = new THREE.MeshStandardMaterial({ color: "#5a4a40", metalness: 0.6, roughness: 0.6 });
    for (let k = 0; k < 14; k++) box(0.06, 1.4, 0.06, rebar, -6.5 + hash(k) * 13, 3.4 * floors + 0.9, -4 + hash(k * 2.3) * 8, frame);
    this.lamps = [];
    for (const x of [-5, 5]) {
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 8), new THREE.MeshBasicMaterial({ color: "#ffe2a8" }));
      lamp.position.set(x, 3.4 * 2 + 0.6, 5.2);
      frame.add(lamp);
      this.lamps.push(lamp);
    }
  }

  buildProps() {
    const orange = new THREE.MeshStandardMaterial({ color: "#ff5a1a", roughness: 0.5 });
    const white = new THREE.MeshStandardMaterial({ color: "#f2f2f2", roughness: 0.5 });
    for (const [x, z] of [[-4.6, 2.2], [-5.4, 0.6], [4.7, 2.0], [5.6, -0.4]]) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.9, 20), orange);
      cone.position.set(x, GROUND_Y + 0.45, z);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.14, 20), white);
      band.position.set(x, GROUND_Y + 0.5, z);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.06, 0.75), orange);
      foot.position.set(x, GROUND_Y + 0.03, z);
      this.group.add(cone, band, foot);
    }
    // Stacked I-beams and a sand pile off to the side.
    const rust = new THREE.MeshStandardMaterial({ color: "#8e4424", metalness: 0.5, roughness: 0.65 });
    for (let k = 0; k < 4; k++) box(6, 0.35, 0.4, rust, -9, GROUND_Y + 0.18 + Math.floor(k / 2) * 0.36, -6 + (k % 2) * 0.5, this.group);
    const sand = new THREE.Mesh(new THREE.ConeGeometry(4, 2.2, 32), new THREE.MeshStandardMaterial({ color: "#a07a50", roughness: 1 }));
    sand.position.set(10, GROUND_Y + 1.1, -14);
    this.group.add(sand);
  }

  update(t, kick) {
    this.slew.rotation.y = -0.55 + Math.sin(t * 0.07) * 0.35;
    const trolley = 13 + Math.sin(t * 0.11) * 3;
    this.trolley.position.x = trolley;
    this.hook.position.x = trolley;
    this.hook.rotation.z = Math.sin(t * 0.9) * 0.05;
    this.beam.rotation.y = Math.sin(t * 0.3) * 0.4;
    for (const l of this.lamps) l.material.color.set("#ffe2a8").multiplyScalar(1 + kick * 0.3);
  }
}
