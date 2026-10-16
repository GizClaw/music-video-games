import * as THREE from "three";
import { hash } from "@gizclaw/mvg-core/timing.js";
import { canvasTexture, lathe, mesh, rbox, speckleTexture, strut, woodTexture } from "./parts.js";

// A sunny school garden: a potting bench on a paved patio in front of a small
// greenhouse. The bench top is y = 1; the clipboard easel stands on its left
// end, the germination jar on its right, the three pots in between.
export const BENCH_Y = 1;
export const POT_X = [-1.05, 0, 1.05];
export const POT_Z = -0.12;
export const CLIP_AT = [-1.88, 0.18];
export const JAR_AT = [1.82, 0.26];
const GH = { x: -0.4, z: -6.5, w: 8.2, d: 4.2, h: 2.5, ridge: 4.2 };

const NOISE = /* glsl */ `
  float h21(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
  float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
  float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
`;

export const SKY = /* glsl */ `
  uniform float uTime, uGlow, uHorizon, uFocus; varying vec2 vUv;
  ${NOISE}
  void main() {
    vec2 uv = vUv;
    float k = clamp((uv.y - uHorizon) / (1.0 - uHorizon), 0.0, 1.0);
    vec3 col = mix(vec3(0.66, 0.84, 1.0), vec3(0.28, 0.58, 1.0), smoothstep(0.0, 0.35, k));
    col = mix(col, vec3(0.07, 0.3, 0.92), smoothstep(0.3, 1.0, k));
    vec2 sp = (uv - vec2(0.86, 0.9)) * vec2(0.5625, 1.0);
    float sd = length(sp);
    col += vec3(1.0, 0.88, 0.6) * exp(-sd * 11.0) * (0.3 + 0.15 * uGlow);
    // Fair-weather cumulus drifting slowly, shaded on their undersides.
    vec2 cp = vec2(uv.x * 2.4 + uTime * 0.006, (uv.y - uHorizon) * 4.6);
    float c = fbm(cp);
    float cloud = smoothstep(0.5, 0.7, c) * smoothstep(0.03, 0.14, k) * (1.0 - smoothstep(0.6, 0.9, k));
    float under = smoothstep(0.45, 0.75, fbm(cp + vec2(0.0, 0.12)));
    col = mix(col, mix(vec3(0.72, 0.78, 0.9), vec3(0.98), under), cloud * 0.85);
    col = mix(col, vec3(1.75, 1.55, 1.0), smoothstep(0.026, 0.023, sd));
    // Tree line and the school roofs in the haze along the horizon.
    float x = uv.x;
    float trees = 0.012 + 0.03 * fbm(vec2(x * 7.0, 1.7)) + 0.012 * noise(vec2(x * 60.0, 4.0));
    float roof = step(0.55, x) * step(x, 0.78) * (0.034 - abs(x - 0.665) * 0.06);
    float top = max(trees, roof);
    if (uv.y < uHorizon + top) {
      float tone = noise(vec2(x * 40.0, uv.y * 140.0));
      col = roof > trees ? vec3(0.62, 0.4, 0.34) : mix(vec3(0.16, 0.3, 0.2), vec3(0.24, 0.4, 0.24), tone);
      col = mix(col, vec3(0.62, 0.74, 0.82), 0.35);
    }
    if (uv.y < uHorizon) col = vec3(0.4, 0.55, 0.36);
    // Close-ups push the far background back: duller and darker.
    col = mix(col, vec3(dot(col, vec3(0.3, 0.59, 0.11))), 0.45 * uFocus) * (1.0 - 0.4 * uFocus);
    // Output is sRGB-encoded afterwards; keep the sky soft so the garden reads first.
    gl_FragColor = vec4(col * 0.47, 1.0);
  }`;

const GROUND = /* glsl */ `
  uniform float uFocus; varying vec3 vW;
  ${NOISE}
  void main() {
    vec2 p = vW.xz;
    float n = noise(p * 1.3) * 0.5 + noise(p * 5.0) * 0.3 + noise(p * 23.0) * 0.2;
    vec3 col = mix(vec3(0.14, 0.32, 0.07), vec3(0.3, 0.52, 0.13), n);
    col *= 0.9 + 0.14 * step(0.5, fract(p.x * 0.22 + 0.1));
    // Paved patio under the bench, slabs in offset rows.
    vec2 q = p - vec2(0.0, 0.6);
    float patio = step(abs(q.x), 4.5) * step(abs(q.y), 2.1);
    float row = floor(q.y / 0.7);
    vec2 s = vec2(q.x / 1.1 + mod(row, 2.0) * 0.5, q.y / 0.7);
    vec2 f = abs(fract(s) - 0.5);
    float joint = smoothstep(0.47, 0.5, max(f.x * 1.0, f.y));
    vec3 slab = mix(vec3(0.5, 0.46, 0.4), vec3(0.62, 0.57, 0.5), h21(floor(s))) * (0.9 + 0.1 * noise(p * 9.0));
    col = mix(col, slab * (1.0 - joint * 0.45), patio);
    // Gravel path to the greenhouse door.
    float path = step(abs(p.x - ${GH.x.toFixed(2)}), 0.75) * step(p.y, -1.5) * step(${(GH.z + GH.d / 2).toFixed(2)}, p.y);
    col = mix(col, vec3(0.55, 0.5, 0.44) * (0.8 + 0.4 * noise(p * 40.0)), path);
    // Soft shade under the bench.
    float under = 1.0 - smoothstep(0.0, 0.6, max(abs(p.x + 0.3) - 2.9, abs(p.y + 0.15) - 0.75));
    col *= 1.0 - 0.5 * under;
    float d = distance(vW, cameraPosition);
    col = mix(col, vec3(0.5, 0.62, 0.5), smoothstep(20.0, 120.0, d));
    col = mix(col, vec3(dot(col, vec3(0.3, 0.59, 0.11))), 0.4 * uFocus) * (1.0 - 0.35 * uFocus);
    gl_FragColor = vec4(col * 0.5, 1.0);
  }`;

// Greenhouse panes: fresnel, a reflected sky gradient and two soft diagonal sheens.
const GLASS = /* glsl */ `
  uniform float uTime; varying vec3 vN; varying vec3 vV; varying vec3 vW;
  void main() {
    vec3 v = normalize(vV);
    vec3 r = reflect(-v, normalize(vN));
    float f = pow(1.0 - abs(dot(normalize(vN), v)), 2.0);
    vec3 sky = mix(vec3(0.55, 0.68, 0.62), vec3(0.45, 0.65, 0.95), smoothstep(-0.1, 0.5, r.y));
    float sheen = smoothstep(0.06, 0.0, abs(fract((vW.x + vW.y * 0.8) * 0.18 - uTime * 0.01) - 0.5))
      + 0.5 * smoothstep(0.03, 0.0, abs(fract((vW.x + vW.y * 0.8) * 0.18 + 0.12 - uTime * 0.01) - 0.5));
    vec3 col = sky * (0.12 + f * 0.35) + vec3(1.0) * sheen * 0.08;
    gl_FragColor = vec4(col, 0.12 + f * 0.3 + sheen * 0.06);
  }`;


function brickTexture() {
  const tex = canvasTexture(512, 256, (g, w, h) => {
    g.fillStyle = "#cfc4b2";
    g.fillRect(0, 0, w, h);
    const bw = 64;
    const bh = 26;
    for (let r = 0; r * bh < h; r++) {
      for (let c = -1; c * bw < w; c++) {
        const x = c * bw + (r % 2) * (bw / 2) + 2;
        const v = hash(r * 31 + c * 7);
        g.fillStyle = `rgb(${150 + v * 40},${70 + v * 25},${48 + v * 18})`;
        g.fillRect(x, r * bh + 2, bw - 4, bh - 4);
      }
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export class Garden {
  constructor(scene, focusU) {
    this.group = new THREE.Group();
    scene.add(this.group);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(500, 500).rotateX(-Math.PI / 2),
      new THREE.ShaderMaterial({ uniforms: { uFocus: focusU }, vertexShader: "varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }", fragmentShader: GROUND }),
    );
    this.group.add(ground);
    const catcher = mesh(new THREE.PlaneGeometry(10, 5).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: 0.35 }), this.group, 0, 0.003, 0.6, { cast: false });
    catcher.receiveShadow = true;

    this.glassU = { uTime: { value: 0 } };
    this.buildGreenhouse();
    this.buildBorders();
    this.buildBench();
  }

  buildGreenhouse() {
    const frame = new THREE.MeshStandardMaterial({ color: "#a4acb0", metalness: 0.3, roughness: 0.5 });
    const brick = new THREE.MeshStandardMaterial({ map: brickTexture(), roughness: 0.9 });
    brick.map.repeat.set(4, 0.6);
    const glass = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: this.glassU,
      vertexShader: "varying vec3 vN; varying vec3 vV; varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vec4 mv = viewMatrix * w; vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }",
      fragmentShader: GLASS,
    });
    const g = new THREE.Group();
    g.position.set(GH.x, 0, GH.z);
    this.group.add(g);
    const { w, d, h, ridge } = GH;
    const knee = 0.6;
    const cap = new THREE.MeshStandardMaterial({ color: "#d8d0c0", roughness: 0.8 });
    for (const z of [d / 2, -d / 2]) {
      mesh(rbox(w, knee, 0.24, 0.02), brick, g, 0, knee / 2, z);
      mesh(rbox(w + 0.08, 0.06, 0.3, 0.02), cap, g, 0, knee + 0.03, z);
    }
    for (const x of [w / 2, -w / 2]) mesh(rbox(0.24, knee, d, 0.02), brick, g, x, knee / 2, 0);
    const bays = 7;
    for (let i = 0; i <= bays; i++) {
      const x = -w / 2 + (i * w) / bays;
      for (const z of [d / 2, -d / 2]) {
        mesh(rbox(0.07, h - knee, 0.07, 0.015), frame, g, x, (h + knee) / 2, z);
        strut(new THREE.Vector3(x, h, z), new THREE.Vector3(x, ridge, 0), 0.03, frame, g, 8);
      }
    }
    for (const z of [d / 2, -d / 2]) {
      mesh(rbox(w, 0.06, 0.09, 0.015), frame, g, 0, knee + 0.09, z);
      mesh(rbox(w, 0.06, 0.06, 0.015), frame, g, 0, (h + knee) / 2 + 0.25, z);
      mesh(rbox(w + 0.1, 0.09, 0.12, 0.02), frame, g, 0, h, z);
      mesh(new THREE.CylinderGeometry(0.06, 0.06, w + 0.1, 12, 1, true, 0, Math.PI).rotateZ(Math.PI / 2), frame, g, 0, h - 0.02, z + Math.sign(z) * 0.1);
    }
    mesh(rbox(w + 0.12, 0.1, 0.14, 0.03), frame, g, 0, ridge, 0);
    for (const x of [w / 2 + 0.05, -w / 2 - 0.05]) {
      for (const z of [-d / 2, -d / 6, d / 6, d / 2]) mesh(rbox(0.07, h - knee, 0.07, 0.015), frame, g, x, (h + knee) / 2, z);
      strut(new THREE.Vector3(x, h, 0), new THREE.Vector3(x, ridge, 0), 0.03, frame, g, 8);
      mesh(lathe([[0, 0], [0.05, 0], [0.06, 0.06], [0.03, 0.14], [0.05, 0.2], [0, 0.26]], 16), frame, g, x, ridge + 0.05, 0);
    }
    const door = w / bays;
    for (const s of [-1, 1]) mesh(rbox(0.09, h - 0.05, 0.1, 0.02), frame, g, (s * door) / 2, h / 2, d / 2 + 0.03);
    mesh(rbox(door, 0.09, 0.1, 0.02), frame, g, 0, h - 0.05, d / 2 + 0.03);
    mesh(rbox(0.04, 0.22, 0.05, 0.015), new THREE.MeshStandardMaterial({ color: "#3a3a3a", metalness: 0.6, roughness: 0.4 }), g, door / 2 - 0.12, 1.1, d / 2 + 0.09);

    const slope = Math.hypot(d / 2, ridge - h);
    const tilt = Math.atan2(ridge - h, d / 2);
    const pane = (geo, x, y, z, rx = 0, ry = 0) => {
      const m = mesh(geo, glass, g, x, y, z, { cast: false, receive: false });
      m.rotation.set(rx, ry, 0);
      m.renderOrder = 2;
    };
    for (const s of [1, -1]) {
      pane(new THREE.PlaneGeometry(w, h - knee), 0, (h + knee) / 2, (s * d) / 2);
      pane(new THREE.PlaneGeometry(w, slope), 0, (h + ridge) / 2, (s * d) / 4, -s * (Math.PI / 2 - tilt));
      pane(new THREE.PlaneGeometry(d, h - knee), (s * w) / 2, (h + knee) / 2, 0, 0, Math.PI / 2);
      const gable = new THREE.Shape([new THREE.Vector2(-d / 2, 0), new THREE.Vector2(d / 2, 0), new THREE.Vector2(0, ridge - h)]);
      pane(new THREE.ShapeGeometry(gable), (s * w) / 2, h, 0, 0, Math.PI / 2);
    }

    // Staging inside with seedling trays and two tall tomato vines.
    const wood = new THREE.MeshStandardMaterial({ map: woodTexture("#8a6440", 3), roughness: 0.8 });
    mesh(rbox(w - 0.6, 0.08, 0.9, 0.02), wood, g, 0, 0.9, -d / 2 + 0.6);
    const n = 24;
    const pots = new THREE.InstancedMesh(lathe([[0, 0], [0.09, 0], [0.12, 0.2], [0.125, 0.22], [0, 0.22]], 16), new THREE.MeshStandardMaterial({ color: "#b85c34", roughness: 0.85 }), n);
    const tops = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.16, 1), new THREE.MeshStandardMaterial({ color: "#3f8a2c", roughness: 0.7 }), n);
    const m = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + 0.6 + (i % 12) * ((w - 1.2) / 11);
      const z = -d / 2 + 0.4 + Math.floor(i / 12) * 0.4;
      pots.setMatrixAt(i, m.makeTranslation(x, 0.94, z));
      const s = 0.8 + hash(i) * 0.6;
      tops.setMatrixAt(i, m.makeScale(s, s * 0.8, s).setPosition(x, 1.22 + hash(i * 2.1) * 0.1, z));
    }
    g.add(pots, tops);
    const vine = new THREE.MeshStandardMaterial({ color: "#3a7a2a", roughness: 0.75 });
    for (const x of [-w / 2 + 0.7, w / 2 - 0.7]) {
      for (let k = 0; k < 6; k++) mesh(new THREE.IcosahedronGeometry(0.32 - k * 0.03, 1), vine, g, x + Math.sin(k * 2) * 0.12, 0.5 + k * 0.32, d / 2 - 0.7, { cast: false });
    }
  }

  buildBorders() {
    const hedge = new THREE.MeshStandardMaterial({ color: "#2f6a28", roughness: 0.9 });
    const lump = new THREE.IcosahedronGeometry(1, 2);
    const p = lump.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const k = 1 + 0.12 * Math.sin(p.getX(i) * 7 + p.getY(i) * 5) * Math.cos(p.getZ(i) * 6);
      p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k);
    }
    lump.computeVertexNormals();
    const bushes = new THREE.InstancedMesh(lump, hedge, 30);
    const crown = new THREE.InstancedMesh(lump, new THREE.MeshStandardMaterial({ color: "#3a7a2e", roughness: 0.85 }), 14);
    const m = new THREE.Matrix4();
    for (let i = 0; i < 30; i++) {
      const side = i % 2 ? 1 : -1;
      const s = 0.8 + hash(i * 2.9) * 0.7;
      bushes.setMatrixAt(i, m.makeScale(s, s * 0.75, s).setPosition(side * (5 + hash(i * 1.3) * 6), 0.5, -6 - hash(i * 4.1) * 5));
    }
    for (let i = 0; i < 14; i++) {
      const s = 1.4 + hash(i * 3.3) * 0.9;
      crown.setMatrixAt(i, m.makeScale(s, s * 0.85, s).setPosition(-8.3 + (hash(i * 1.9) - 0.5) * 4.5, 5.2 + (hash(i * 2.7) - 0.5) * 2.4, -15 + (hash(i * 5.1) - 0.5) * 2));
    }
    this.group.add(bushes, crown);
    const bark = new THREE.MeshStandardMaterial({ color: "#5a3f2a", roughness: 0.9 });
    strut(new THREE.Vector3(-8.5, 0, -15), new THREE.Vector3(-8.3, 4.5, -15), 0.32, bark, this.group);
    const white = new THREE.MeshStandardMaterial({ color: "#e8eae4", roughness: 0.6 });
    const n = 110;
    const picket = new THREE.Shape([new THREE.Vector2(-0.05, 0), new THREE.Vector2(0.05, 0), new THREE.Vector2(0.05, 0.85), new THREE.Vector2(0, 0.95), new THREE.Vector2(-0.05, 0.85)]);
    const pickets = new THREE.InstancedMesh(new THREE.ExtrudeGeometry(picket, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.005, bevelSize: 0.005, bevelSegments: 1 }), white, n);
    for (let i = 0; i < n; i++) pickets.setMatrixAt(i, m.makeTranslation(-14 + i * 0.26, 0, -12.5));
    this.group.add(pickets);
    for (const y of [0.3, 0.72]) mesh(rbox(28.6, 0.07, 0.05, 0.01), white, this.group, 0, y, -12.55, { cast: false });
  }

  /** Slatted potting bench: four top planks, apron and backboard bolted to posts, a lower shelf with spare pots and a sack. */
  buildBench() {
    const top = (seed) => {
      const mat = new THREE.MeshStandardMaterial({ map: woodTexture("#c08a52", seed), roughness: 0.75 });
      mat.map.repeat.set(2.5, 1);
      return mat;
    };
    const frameWood = new THREE.MeshStandardMaterial({ map: woodTexture("#9a6a3c", 2), roughness: 0.8 });
    for (let i = 0; i < 4; i++) mesh(rbox(6, 0.065, 0.35, 0.014), top(i + 1), this.group, 0, BENCH_Y - 0.033, -0.56 + i * 0.37);
    mesh(rbox(6, 0.26, 0.05, 0.014), frameWood, this.group, 0, BENCH_Y - 0.2, 0.74);
    mesh(rbox(6, 0.4, 0.05, 0.014), frameWood, this.group, 0, BENCH_Y + 0.22, -0.78);
    for (const x of [-2.85, 2.85]) {
      for (const z of [-0.66, 0.66]) mesh(rbox(0.1, BENCH_Y, 0.1, 0.015), frameWood, this.group, x, BENCH_Y / 2, z);
      mesh(rbox(0.09, 0.45, 0.09, 0.015), frameWood, this.group, x, BENCH_Y + 0.22, -0.74);
      const brace = strut(new THREE.Vector3(x, 0.25, -0.62), new THREE.Vector3(x, BENCH_Y - 0.1, 0.62), 0.025, frameWood, this.group, 6);
      brace.scale.x = 0.8;
    }
    for (let i = 0; i < 3; i++) mesh(rbox(5.8, 0.045, 0.4, 0.012), top(i + 7), this.group, 0, 0.22, -0.45 + i * 0.44);
    const steel = new THREE.MeshStandardMaterial({ color: "#8a8e94", metalness: 0.85, roughness: 0.35 });
    const bolt = lathe([[0, 0], [0.028, 0], [0.03, 0.005], [0.024, 0.014], [0.012, 0.02], [0, 0.021]], 16).rotateX(Math.PI / 2);
    const bolts = new THREE.InstancedMesh(bolt, steel, 12);
    const m = new THREE.Matrix4();
    let k = 0;
    for (const x of [-2.85, 2.85]) for (const dx of [-0.03, 0.03]) for (const y of [BENCH_Y - 0.26, BENCH_Y - 0.14]) bolts.setMatrixAt(k++, m.makeTranslation(x + dx, y, 0.765));
    for (const x of [-2.85, 2.85]) for (const y of [BENCH_Y + 0.12, BENCH_Y + 0.32]) bolts.setMatrixAt(k++, m.makeTranslation(x, y, -0.755));
    this.group.add(bolts);
    const sack = new THREE.SphereGeometry(0.4, 24, 16);
    const p = sack.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) * (p.getY(i) > 0 ? 0.7 : 0.45) + 0.02 * Math.sin(p.getX(i) * 20));
    sack.computeVertexNormals();
    mesh(sack, new THREE.MeshStandardMaterial({ color: "#a08458", bumpMap: speckleTexture(256, 51, 2400), bumpScale: 1, roughness: 1 }), this.group, 2.1, 0.42, -0.15).scale.set(1.35, 1, 0.85);
    const clay = new THREE.MeshStandardMaterial({ color: "#c4643a", roughness: 0.9 });
    const spare = lathe([[0, 0], [0.18, 0], [0.24, 0.3], [0.26, 0.31], [0.26, 0.35], [0.22, 0.35], [0.2, 0.32], [0.16, 0.04]], 32);
    for (let i = 0; i < 3; i++) mesh(spare, clay, this.group, 0.9, 0.245 + i * 0.07, -0.25);
  }

  update(t) {
    this.glassU.uTime.value = t;
  }
}
