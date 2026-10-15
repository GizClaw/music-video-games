import * as THREE from "three";
import { hash } from "@gizclaw/mvg-core/timing.js";

// A bright sports hall: a windowed back wall at z = WALL, a rubber floor with a
// training mat at the origin, wall bars, a dumbbell rack and a few props.
const WALL = -5;

const WALL_FS = /* glsl */ `
  uniform float uTime, uKick; varying vec2 vUv;
  float h21(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
  float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
  float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * noise(p); p *= 2.1; a *= 0.5; } return s; }
  float box(vec2 p, vec2 c, vec2 b) { vec2 d = abs(p - c) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
  void main() {
    vec2 p = (vUv - vec2(0.5, 0.0)) * vec2(14.0, 7.0);
    vec3 col = mix(vec3(0.66, 0.65, 0.68), vec3(0.5, 0.5, 0.56), smoothstep(2.0, 6.5, p.y));
    float dado = step(p.y, 1.15);
    col = mix(col, vec3(0.12, 0.34, 0.5), dado);
    col = mix(col, vec3(1.0, 0.55, 0.2), smoothstep(0.03, 0.0, abs(p.y - 1.2)) * 0.9);
    col *= 0.85 + 0.15 * step(0.5, fract(p.x * 1.25 + 0.5 * step(0.5, fract(p.y * 2.5)))) * (1.0 - dado);
    float glow = 0.0;
    for (int i = 0; i < 3; i++) {
      vec2 c = vec2(float(i - 1) * 2.7, 3.05);
      float d = box(p, c, vec2(0.9, 1.35));
      glow += exp(-max(d, 0.0) * 1.6);
      if (d < 0.0) {
        vec2 q = p - c;
        vec3 sky = mix(vec3(0.62, 0.8, 1.0), vec3(0.32, 0.55, 0.92), smoothstep(-1.3, 1.3, q.y));
        float cl = fbm(vec2(p.x * 0.8 + uTime * 0.02, p.y * 2.2));
        sky = mix(sky, vec3(0.95, 0.97, 1.0), smoothstep(0.55, 0.8, cl) * 0.8);
        float trees = -1.05 + 0.18 * fbm(vec2(p.x * 3.0, 1.0));
        if (q.y < trees) sky = mix(vec3(0.16, 0.36, 0.22), vec3(0.24, 0.46, 0.28), fbm(p * 8.0));
        float bars = smoothstep(0.035, 0.02, abs(q.x)) + smoothstep(0.035, 0.02, abs(abs(q.y) - 0.45));
        sky = mix(sky, vec3(0.2, 0.22, 0.26), clamp(bars, 0.0, 1.0));
        col = sky;
      } else if (d < 0.08) col = vec3(0.24, 0.26, 0.3);
    }
    col += vec3(1.0, 0.97, 0.9) * glow * 0.06;
    col *= 0.88 + 0.12 * smoothstep(7.0, 2.0, abs(p.x));
    // Output is sRGB-encoded afterwards; keep the wall from washing out.
    gl_FragColor = vec4(col * 0.5, 1.0);
  }`;

const FLOOR_FS = /* glsl */ `
  uniform float uRing, uChorus; uniform vec3 uRingColor; varying vec3 vW;
  float h21(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
  void main() {
    vec2 p = vW.xz;
    vec3 col = vec3(0.1, 0.11, 0.14);
    vec2 g = floor(p * 60.0);
    float f = h21(g);
    col += step(0.93, f) * mix(vec3(0.5, 0.2, 0.15), vec3(0.15, 0.35, 0.6), h21(g + 3.1)) * 0.35;
    col += vec3(0.9, 0.95, 1.0) * smoothstep(${(WALL + 3.5).toFixed(1)}, ${WALL.toFixed(1)}, p.y) * 0.12;
    float court = smoothstep(0.03, 0.0, abs(length(p - vec2(0.0, -1.4)) - 2.6)) * step(p.y, -0.2);
    col = mix(col, vec3(0.95, 0.75, 0.2), court * 0.6);
    vec2 m = abs(p - vec2(0.0, 0.05)) - vec2(0.75, 0.5);
    float mat = length(max(m, 0.0)) + min(max(m.x, m.y), 0.0) - 0.08;
    col = mix(col, vec3(0.08, 0.26, 0.42), smoothstep(0.01, -0.01, mat));
    col = mix(col, vec3(0.9, 0.95, 1.0) * 0.5, smoothstep(0.02, 0.0, abs(mat + 0.04)) * 0.6);
    float r = length(p);
    float ring = smoothstep(0.05, 0.0, abs(r - (0.3 + uRing * 2.2))) * exp(-uRing * 2.5) * (0.4 + 0.6 * uChorus);
    col += uRingColor * ring * 1.2;
    gl_FragColor = vec4(col * 0.55, 1.0);
  }`;

const CEIL_FS = /* glsl */ `
  uniform float uKick; varying vec2 vUv;
  void main() {
    vec2 p = vUv * vec2(14.0, 8.0);
    vec2 c = abs(fract(p / vec2(2.4, 2.0)) - 0.5) - vec2(0.3, 0.12);
    float panel = step(max(c.x, c.y), 0.0);
    vec3 col = mix(vec3(0.2, 0.2, 0.23), vec3(1.0, 0.98, 0.92) * (0.85 + 0.15 * uKick), panel);
    gl_FragColor = vec4(col * 0.6, 1.0);
  }`;

export class Gym {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
    const vs = "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }";
    this.wallU = { uTime: { value: 0 }, uKick: { value: 0 } };
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(14, 7), new THREE.ShaderMaterial({ uniforms: this.wallU, vertexShader: vs, fragmentShader: WALL_FS }));
    wall.position.set(0, 3.5, WALL);
    this.group.add(wall);

    this.floorU = { uRing: { value: 9 }, uChorus: { value: 0 }, uRingColor: { value: new THREE.Color("#ffffff") } };
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 16).rotateX(-Math.PI / 2).translate(0, 0, WALL + 8),
      new THREE.ShaderMaterial({ uniforms: this.floorU, vertexShader: "varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }", fragmentShader: FLOOR_FS }),
    );
    this.group.add(floor);

    this.ceilU = { uKick: { value: 0 } };
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(14, 8).rotateX(Math.PI / 2), new THREE.ShaderMaterial({ uniforms: this.ceilU, vertexShader: vs, fragmentShader: CEIL_FS }));
    ceil.position.set(0, 4.6, WALL + 4);
    this.group.add(ceil);

    this.buildBars();
    this.buildRack();
    this.buildProps();
  }

  buildBars() {
    const wood = new THREE.MeshStandardMaterial({ color: "#c8955a", roughness: 0.6 });
    for (const x0 of [1.5, 2.4]) {
      for (const dx of [-0.4, 0.4]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.07, 2.7, 0.06), wood);
        rail.position.set(x0 + dx, 1.35, WALL + 0.12);
        this.group.add(rail);
      }
      for (let k = 0; k < 15; k++) {
        const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.8, 8).rotateZ(Math.PI / 2), wood);
        rung.position.set(x0, 0.2 + k * 0.17, WALL + 0.14);
        this.group.add(rung);
      }
    }
  }

  buildRack() {
    const frame = new THREE.MeshStandardMaterial({ color: "#2a2d36", metalness: 0.6, roughness: 0.4 });
    const handle = new THREE.MeshStandardMaterial({ color: "#9aa2b2", metalness: 0.8, roughness: 0.3 });
    const colors = ["#ff4f6d", "#ffb03d", "#ffe14a", "#7cff6b", "#4fc3ff"].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.45 }));
    const x0 = -2.0;
    const z0 = WALL + 0.55;
    for (const dx of [-0.8, 0.8]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.95, 0.5), frame);
      leg.position.set(x0 + dx, 0.475, z0);
      this.group.add(leg);
    }
    for (const [y, z] of [[0.45, z0 + 0.1], [0.85, z0 - 0.12]]) {
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.04, 0.22), frame);
      shelf.position.set(x0, y, z);
      this.group.add(shelf);
      for (let k = 0; k < 5; k++) {
        const g = new THREE.Group();
        g.position.set(x0 - 0.64 + k * 0.32, y + 0.07, z);
        g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.2, 8), handle).rotateX(Math.PI / 2));
        for (const dz of [-0.09, 0.09]) {
          const head = new THREE.Mesh(new THREE.CylinderGeometry(0.05 + k * 0.006, 0.05 + k * 0.006, 0.06, 6).rotateX(Math.PI / 2), colors[k]);
          head.position.z = dz;
          g.add(head);
        }
        this.group.add(g);
      }
    }
  }

  buildProps() {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.33, 32, 20), new THREE.MeshStandardMaterial({ color: "#2cc7b0", roughness: 0.35 }));
    ball.position.set(1.45, 0.33, -2.5);
    this.group.add(ball);
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.5, 0.62), new THREE.MeshStandardMaterial({ color: "#b98550", roughness: 0.65 }));
    box.position.set(-1.7, 0.25, -2.9);
    box.rotation.y = 0.4;
    this.group.add(box);
    const iron = new THREE.MeshStandardMaterial({ color: "#2e313a", metalness: 0.5, roughness: 0.45 });
    for (const [x, z, s] of [[-1.25, -1.9, 1], [-1.0, -2.25, 0.8]]) {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.scale.setScalar(s);
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 14), iron);
      body.position.y = 0.12;
      body.scale.y = 0.9;
      const grip = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.018, 8, 20, Math.PI), iron);
      grip.position.y = 0.21;
      g.add(body, grip);
      this.group.add(g);
    }
    const mat = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.62, 20).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: "#7a5cff", roughness: 0.7 }));
    mat.position.set(1.0, 0.12, -1.6);
    mat.rotation.y = -0.5;
    this.group.add(mat);

    const n = 120;
    this.dustSeed = Array.from({ length: n }, (_, i) => [hash(i * 1.3) * 8 - 4, hash(i * 2.9) * 3.5, WALL + 0.6 + hash(i * 4.7) * 3.5, 0.3 + hash(i * 6.1)]);
    const dg = new THREE.BufferGeometry();
    dg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.dust = new THREE.Points(dg, new THREE.PointsMaterial({ color: "#fff4dc", size: 0.018, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.dust.frustumCulled = false;
    this.group.add(this.dust);
  }

  update(t, kick, sinceBeat, chorus, ringColor) {
    this.wallU.uTime.value = t;
    this.wallU.uKick.value = kick;
    this.ceilU.uKick.value = kick * chorus;
    this.floorU.uRing.value = sinceBeat;
    this.floorU.uChorus.value = chorus;
    this.floorU.uRingColor.value.set(ringColor);
    const dp = this.dust.geometry.attributes.position;
    this.dustSeed.forEach(([x, y, z, s], i) => dp.setXYZ(i, x + Math.sin(t * 0.2 * s + i) * 0.3, (y + t * 0.04 * s) % 3.5, z));
    dp.needsUpdate = true;
  }
}
