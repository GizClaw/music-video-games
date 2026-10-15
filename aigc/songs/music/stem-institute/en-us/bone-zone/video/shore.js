import * as THREE from "three";
import { hash } from "@gizclaw/mvg-core/timing.js";

// A moonlit beach. The camera always looks level, so the sea horizon sits on
// screen row 960; the sand is 3-D and ends at the waterline (z = SHORE).
export const SHORE = -4.6;
export const TORCHES = [[-1.12, -0.95], [1.18, -1.25]];

export const SKY = /* glsl */ `
  uniform float uTime, uKick, uSwell; varying vec2 vUv;
  float h21(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
  float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
  float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
  void main() {
    vec2 uv = vUv;
    const float hz = 0.5;
    const vec2 moon = vec2(0.85, 0.885);
    vec2 d = (uv - moon) * vec2(1.0, 1.7778);
    float r = length(d);
    vec3 col;
    if (uv.y >= hz) {
      float k = (uv.y - hz) / (1.0 - hz);
      col = mix(vec3(0.16, 0.22, 0.4), vec3(0.03, 0.04, 0.12), smoothstep(0.0, 0.75, k));
      col += vec3(0.35, 0.42, 0.6) * exp(-r * 5.0) * 0.45;
      vec2 g = uv * vec2(90.0, 160.0);
      float s = h21(floor(g));
      float tw = 0.5 + 0.5 * sin(uTime * 2.2 + s * 60.0);
      col += vec3(0.9, 0.95, 1.0) * step(0.985, s) * smoothstep(0.08, 0.5, k) * tw * smoothstep(0.32, 0.0, length(fract(g) - 0.5)) * 1.4;
      float c = fbm(vec2(uv.x * 2.6 + uTime * 0.006, uv.y * 9.0));
      float cloud = smoothstep(0.55, 0.8, c) * smoothstep(0.55, 0.7, uv.y) * (1.0 - smoothstep(0.92, 1.0, uv.y));
      col = mix(col, vec3(0.32, 0.36, 0.5) + vec3(0.3) * exp(-r * 4.0), cloud * 0.55);
      float x = uv.x;
      float isle = 0.022 * exp(-pow((x - 0.18) * 7.0, 2.0)) + 0.012 * exp(-pow((x - 0.3) * 11.0, 2.0)) + 0.009 * exp(-pow((x - 0.9) * 9.0, 2.0));
      if (uv.y < hz + isle) col = vec3(0.03, 0.04, 0.08);
    } else {
      float dd = hz - uv.y;
      col = mix(vec3(0.07, 0.12, 0.24), vec3(0.015, 0.035, 0.08), smoothstep(0.0, 0.2, dd));
      float rows = 1.0 / (dd + 0.012);
      float w = noise(vec2(uv.x * (6.0 + rows * 0.8), rows * 2.2 - uTime * 0.9));
      col += vec3(0.1, 0.16, 0.26) * smoothstep(0.62, 0.9, w) * (0.5 + uSwell * 0.5);
      float lane = exp(-pow((uv.x - moon.x) / (0.015 + dd * 0.9), 2.0));
      float glint = step(0.72 - uKick * 0.08, noise(vec2(uv.x * 160.0, rows * 6.0 - uTime * 2.4)));
      col += vec3(0.85, 0.9, 1.0) * lane * glint * (0.9 - dd * 2.0);
      col += vec3(0.25, 0.3, 0.45) * lane * 0.2;
    }
    // Output is sRGB-encoded afterwards; keep the night dark.
    col *= 0.5;
    float disk = smoothstep(0.062, 0.056, r);
    float craters = fbm(d * 30.0);
    col = mix(col, vec3(1.0, 0.96, 0.86) * (0.62 + 0.18 * craters), disk);
    gl_FragColor = vec4(col, 1.0);
  }`;

const SAND = /* glsl */ `
  uniform vec4 uTorch; uniform float uFlicker; varying vec3 vW;
  float h21(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
  float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
  void main() {
    vec2 p = vW.xz;
    float ripple = 0.5 + 0.5 * sin(p.x * 1.3 + p.y * 7.0 + noise(p * 1.7) * 4.0);
    float grain = noise(p * 40.0);
    vec3 sand = mix(vec3(0.3, 0.3, 0.38), vec3(0.42, 0.4, 0.46), ripple * 0.5 + grain * 0.3);
    float wet = smoothstep(${(SHORE + 1.4).toFixed(2)}, ${SHORE.toFixed(2)}, p.y);
    sand = mix(sand, vec3(0.12, 0.14, 0.22), wet * 0.8);
    vec3 col = sand * 0.55;
    float t1 = length(p - uTorch.xy), t2 = length(p - uTorch.zw);
    col += vec3(1.0, 0.5, 0.2) * (exp(-t1 * t1 * 1.1) + exp(-t2 * t2 * 1.1)) * (0.28 + 0.06 * uFlicker);
    float fade = smoothstep(5.0, 0.0, -p.y - 1.0);
    gl_FragColor = vec4(col * (0.6 + 0.4 * fade) * 0.55, 1.0);
  }`;

const FOAM = /* glsl */ `
  uniform float uTime, uWash; varying vec2 vUv;
  float h21(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
  float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
  void main() {
    float edge = 0.35 + 0.25 * uWash + 0.08 * sin(vUv.x * 30.0 + uTime) * noise(vec2(vUv.x * 12.0, uTime * 0.3));
    float line = smoothstep(0.06, 0.0, abs(vUv.y - edge)) * (0.5 + 0.5 * noise(vec2(vUv.x * 80.0, uTime * 2.0)));
    float lace = step(0.7, noise(vec2(vUv.x * 50.0, vUv.y * 20.0 - uTime))) * step(vUv.y, edge) * 0.4;
    gl_FragColor = vec4(vec3(0.55, 0.62, 0.75) * (line + lace) * 0.5, 1.0);
  }`;

const FLAME = /* glsl */ `
  uniform float uTime; varying vec2 vUv;
  void main() {
    float y = vUv.y;
    vec3 c = mix(vec3(1.0, 0.85, 0.4), vec3(1.0, 0.3, 0.05), y);
    float lick = 0.75 + 0.25 * sin(uTime * 17.0 + vUv.x * 25.0);
    gl_FragColor = vec4(c * (1.0 - y) * lick * 1.1, 1.0);
  }`;

function leafShape() {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  const n = 9;
  for (let i = 1; i <= n; i++) {
    const u = i / n;
    s.lineTo(u * 1.3, Math.sin(u * Math.PI) * 0.16 + (i % 2) * 0.05);
  }
  for (let i = n - 1; i >= 0; i--) {
    const u = i / n;
    s.lineTo(u * 1.3, -Math.sin(u * Math.PI) * 0.12 - (i % 2) * 0.05);
  }
  return s;
}

export class Shore {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
    scene.fog = new THREE.Fog("#0a1024", 14, 40);

    this.sandU = { uTorch: { value: new THREE.Vector4(...TORCHES[0], ...TORCHES[1]) }, uFlicker: { value: 0 } };
    const sand = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 30).rotateX(-Math.PI / 2).translate(0, 0, SHORE + 15),
      new THREE.ShaderMaterial({ uniforms: this.sandU, vertexShader: "varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }", fragmentShader: SAND }),
    );
    this.group.add(sand);

    this.foamU = { uTime: { value: 0 }, uWash: { value: 0 } };
    const foam = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 1.4).rotateX(-Math.PI / 2),
      new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: this.foamU, vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }", fragmentShader: FOAM }),
    );
    foam.position.set(0, 0.004, SHORE + 0.5);
    this.group.add(foam);

    this.buildBoard();
    this.buildTorches();
    this.buildPalms();
    this.buildProps();
  }

  buildBoard() {
    const s = new THREE.Shape();
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      const x = Math.cos(a) * 0.95;
      const nose = x > 0 ? 1 - Math.pow(x / 0.95, 4) * 0.55 : 1;
      const z = Math.sin(a) * 0.25 * nose;
      i ? s.lineTo(x, z) : s.moveTo(x, z);
    }
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.035, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.012, bevelSegments: 3, curveSegments: 4 }).rotateX(Math.PI / 2);
    this.board = new THREE.Group();
    this.board.position.set(0, 0.05, 0.05);
    this.group.add(this.board);
    this.board.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: "#1aa59a", roughness: 0.35, metalness: 0.1 })));
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.004, 0.05), new THREE.MeshStandardMaterial({ color: "#ff7a3d", roughness: 0.4 }));
    stripe.position.y = 0.014;
    this.board.add(stripe);
  }

  buildTorches() {
    const bamboo = new THREE.MeshStandardMaterial({ color: "#7a5a34", roughness: 0.8 });
    const band = new THREE.MeshStandardMaterial({ color: "#3a2814", roughness: 0.9 });
    this.flameU = { uTime: { value: 0 } };
    const flameMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: this.flameU,
      vertexShader: "uniform float uTime; varying vec2 vUv; void main(){ vUv = uv; vec3 p = position; p.x += sin(uTime * 11.0 + p.y * 9.0) * 0.03 * p.y * 4.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }",
      fragmentShader: FLAME,
    });
    this.torches = TORCHES.map(([x, z]) => {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      this.group.add(g);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.034, 1.55, 10), bamboo);
      pole.position.y = 0.775;
      g.add(pole);
      for (let k = 1; k < 5; k++) {
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.02, 10), band);
        b.position.y = k * 0.32;
        g.add(b);
      }
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.045, 0.16, 12), band);
      cup.position.y = 1.62;
      g.add(cup);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.32, 16, 1, true).translate(0, 0.16, 0), flameMat);
      flame.position.y = 1.69;
      g.add(flame);
      const light = new THREE.PointLight("#ff9446", 2.2, 7, 1.6);
      light.position.set(0, 1.85, 0.1);
      g.add(light);
      return { g, flame, light };
    });

    const per = 26;
    this.emberSeed = Array.from({ length: per * 2 }, (_, i) => [hash(i * 1.7), hash(i * 3.3) * 2 - 1, hash(i * 5.1) * 2 - 1, 0.4 + hash(i * 7.9) * 0.6]);
    const eg = new THREE.BufferGeometry();
    eg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(per * 2 * 3), 3));
    this.embers = new THREE.Points(eg, new THREE.PointsMaterial({ color: "#ffb15a", size: 0.035, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.embers.frustumCulled = false;
    this.group.add(this.embers);
    this.emberPer = per;
  }

  buildPalms() {
    const trunk = new THREE.MeshStandardMaterial({ color: "#2e2219", roughness: 0.9 });
    const leaf = new THREE.MeshStandardMaterial({ color: "#16301f", roughness: 0.8, side: THREE.DoubleSide });
    const leafGeo = new THREE.ShapeGeometry(leafShape()).rotateX(Math.PI / 2);
    this.palms = [[-1.9, -2.6, 3.6, 0.55], [2.1, -3.4, 4.2, -0.45], [-3.6, -6.5, 4.6, 0.3]].map(([x, z, h, lean]) => {
      const pts = [];
      for (let i = 0; i <= 8; i++) {
        const u = i / 8;
        pts.push(new THREE.Vector3(Math.sin(u * 1.4) * lean, u * h, 0));
      }
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      this.group.add(g);
      g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.07, 7), trunk));
      for (let k = 0; k < 12; k++) {
        const y = (k / 12) * h;
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.012, 5, 10).rotateX(Math.PI / 2), trunk);
        ring.position.set(Math.sin((y / h) * 1.4) * lean, y, 0);
        g.add(ring);
      }
      const crown = new THREE.Group();
      crown.position.copy(pts.at(-1));
      g.add(crown);
      const fronds = Array.from({ length: 9 }, (_, k) => {
        const yaw = new THREE.Group();
        yaw.rotation.y = (k / 9) * Math.PI * 2 + hash(k + x) * 0.4;
        crown.add(yaw);
        const droop = new THREE.Group();
        droop.rotation.z = -0.35 - hash(k * 3 + z) * 0.5;
        yaw.add(droop);
        droop.add(new THREE.Mesh(leafGeo, leaf));
        return droop;
      });
      return { crown, fronds, phase: x };
    });
  }

  buildProps() {
    const shell = new THREE.MeshStandardMaterial({ color: "#d9b8a8", roughness: 0.6 });
    const rock = new THREE.MeshStandardMaterial({ color: "#2a2c38", roughness: 0.95 });
    for (const [x, z, s] of [[-2.3, -1.4, 0.4], [2.6, -2.2, 0.55], [1.6, -3.6, 0.3]]) {
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), rock);
      r.position.set(x, s * 0.35, z);
      r.scale.y = 0.6;
      this.group.add(r);
    }
    for (const [x, z] of [[-0.75, 0.9], [0.9, 0.7], [-1.4, 0.3]]) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.08, 10), shell);
      c.position.set(x, 0.02, z);
      c.rotation.set(Math.PI / 2, 0, x * 2);
      this.group.add(c);
    }
  }

  update(t, kick, bf, loud) {
    this.flameU.uTime.value = t;
    this.foamU.uTime.value = t;
    this.foamU.uWash.value = 0.5 + 0.5 * Math.sin(bf * (Math.PI / 4));
    const flick = Math.sin(t * 23) * 0.5 + Math.sin(t * 37) * 0.5;
    this.sandU.uFlicker.value = flick + kick;
    this.torches.forEach((tc, i) => {
      tc.light.intensity = 2.0 + flick * 0.25 + kick * (loud ? 1.2 : 0.5) + i * 0.1;
      tc.flame.scale.set(1, 1 + kick * (loud ? 0.45 : 0.2) + Math.sin(t * 19 + i) * 0.06, 1);
    });
    this.board.rotation.z = Math.sin(bf * Math.PI) * 0.035;
    for (const p of this.palms) {
      p.crown.rotation.z = Math.sin(t * 0.7 + p.phase) * 0.04;
      p.fronds.forEach((f, k) => (f.rotation.x = Math.sin(t * 1.3 + k + p.phase) * 0.06));
    }
    const ep = this.embers.geometry.attributes.position;
    this.emberSeed.forEach(([s0, dx, dz, sp], i) => {
      const [x, z] = TORCHES[i < this.emberPer ? 0 : 1];
      const u = (s0 + t * sp * (loud ? 0.6 : 0.35)) % 1;
      ep.setXYZ(i, x + dx * 0.08 + Math.sin(u * 9 + i) * 0.06 * u, 1.85 + u * 1.3, z + dz * 0.08);
    });
    ep.needsUpdate = true;
    this.embers.material.opacity = 0.5 + kick * 0.5;
  }
}
