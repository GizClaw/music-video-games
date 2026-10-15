import * as THREE from "three";
import { FONT_COND } from "@gizclaw/mvg-core/hud.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { clamp, hash, lerp, smooth } from "@gizclaw/mvg-core/timing.js";

// A sunny school garden: a potting bench on a paved patio in front of a small
// greenhouse. The bench top is y = 1; its front apron carries the seven step
// plaques and the ladybug hops along its front edge.
export const BENCH_Y = 1;
export const SOIL_Y = BENCH_Y + 0.74;
export const POT_X = [-1.62, 0, 1.62];
export const EDGE_Z = 0.66;
const APRON_Z = 0.8;
const PLAQUE_Y = 0.6;
export const plaqueX = (k) => (k - 3) * 0.64;
export const plaqueCenter = (k) => new THREE.Vector3(plaqueX(k), PLAQUE_Y, APRON_Z + 0.05);
const GH = { x: -0.4, z: -6.5, w: 8.2, d: 4.2, h: 2.5, ridge: 4.2 };

const NOISE = /* glsl */ `
  float h21(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
  float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
  float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
`;

export const SKY = /* glsl */ `
  uniform float uTime, uGlow, uHorizon; varying vec2 vUv;
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
    // Output is sRGB-encoded afterwards; keep the sky soft so the garden reads first.
    gl_FragColor = vec4(col * 0.47, 1.0);
  }`;

const GROUND = /* glsl */ `
  varying vec3 vW;
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
    float under = 1.0 - smoothstep(0.0, 0.6, max(abs(p.x + 0.3) - 3.1, abs(p.y + 0.15) - 0.75));
    col *= 1.0 - 0.5 * under;
    float d = distance(vW, cameraPosition);
    col = mix(col, vec3(0.5, 0.62, 0.5), smoothstep(20.0, 120.0, d));
    gl_FragColor = vec4(col * 0.5, 1.0);
  }`;

const GLASS = /* glsl */ `
  uniform float uTime; varying vec3 vN; varying vec3 vV; varying vec3 vW;
  void main() {
    float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
    float sheen = smoothstep(0.08, 0.0, abs(fract((vW.x + vW.y * 0.8) * 0.18 - uTime * 0.01) - 0.5));
    vec3 col = vec3(0.7, 0.85, 0.95) * (0.1 + f * 0.4) + vec3(1.0) * sheen * 0.12;
    gl_FragColor = vec4(col, 0.1 + f * 0.35 + sheen * 0.1);
  }`;

function box(w, h, d, mat, x, y, z, parent) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

function strut(a, b, r, mat, parent) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, dir.length(), 8), mat);
  m.position.copy(a).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  parent.add(m);
  return m;
}

function canvasTexture(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function woodTexture(base, seed) {
  const tex = canvasTexture(512, 64, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 46; i++) {
      const y = hash(seed + i * 1.7) * h;
      g.strokeStyle = `rgba(60,30,10,${0.08 + hash(seed + i * 3.1) * 0.18})`;
      g.lineWidth = 1 + hash(seed + i * 5.3) * 2;
      g.beginPath();
      g.moveTo(0, y);
      for (let x = 0; x <= w; x += 32) g.lineTo(x, y + Math.sin(x * 0.02 + i) * 2.5);
      g.stroke();
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

const ICONS = [
  (g) => {
    g.font = `800 190px ${FONT_COND}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("?", 0, 8);
  },
  (g) => {
    g.beginPath();
    g.arc(0, -22, 52, Math.PI * 0.8, Math.PI * 2.2);
    g.lineTo(24, 42);
    g.lineTo(-24, 42);
    g.closePath();
    g.stroke();
    for (const y of [60, 78]) {
      g.beginPath();
      g.moveTo(-22, y);
      g.lineTo(22, y);
      g.stroke();
    }
  },
  (g) => {
    g.beginPath();
    g.moveTo(-18, -70);
    g.lineTo(-18, -18);
    g.lineTo(-62, 64);
    g.lineTo(62, 64);
    g.lineTo(18, -18);
    g.lineTo(18, -70);
    g.stroke();
    g.beginPath();
    g.moveTo(-40, 24);
    g.lineTo(40, 24);
    g.stroke();
    g.beginPath();
    g.arc(-6, 44, 9, 0, Math.PI * 2);
    g.arc(18, 36, 6, 0, Math.PI * 2);
    g.fill();
  },
  (g) => {
    g.beginPath();
    g.moveTo(-78, 0);
    g.quadraticCurveTo(0, -70, 78, 0);
    g.quadraticCurveTo(0, 70, -78, 0);
    g.stroke();
    g.beginPath();
    g.arc(0, 0, 24, 0, Math.PI * 2);
    g.fill();
  },
  (g) => {
    g.strokeRect(-50, -66, 100, 132);
    g.fillRect(-22, -78, 44, 22);
    for (const y of [-24, 4, 32]) {
      g.beginPath();
      g.moveTo(-30, y);
      g.lineTo(30, y);
      g.stroke();
    }
  },
  (g) => {
    g.beginPath();
    g.moveTo(-70, -70);
    g.lineTo(-70, 66);
    g.lineTo(72, 66);
    g.stroke();
    [[-44, 30], [-6, 64], [32, 104]].forEach(([x, hgt]) => g.fillRect(x, 52 - hgt, 26, hgt));
  },
  (g) => {
    g.beginPath();
    g.moveTo(-62, 4);
    g.lineTo(-18, 48);
    g.lineTo(66, -50);
    g.stroke();
  },
];

/** A tree-slice plaque face: growth rings with the icon burnt in, and its glow map. */
function plaqueTextures(k) {
  const draw = (glow) => (g, w) => {
    const c = w / 2;
    if (glow) {
      g.fillStyle = "#000";
      g.fillRect(0, 0, w, w);
    } else {
      g.fillStyle = "#d9b27a";
      g.fillRect(0, 0, w, w);
      for (let r = 8; r < c; r += 9 + hash(k * 7 + r) * 7) {
        g.strokeStyle = `rgba(120,70,30,${0.18 + hash(k + r * 0.3) * 0.2})`;
        g.lineWidth = 2;
        g.beginPath();
        g.arc(c + Math.sin(r) * 2, c + Math.cos(r) * 2, r, 0, Math.PI * 2);
        g.stroke();
      }
    }
    g.save();
    g.translate(c, c);
    g.lineCap = g.lineJoin = "round";
    g.lineWidth = glow ? 20 : 16;
    g.strokeStyle = g.fillStyle = glow ? "#fff" : "#4a2610";
    ICONS[k](g);
    g.restore();
  };
  return [canvasTexture(256, 256, draw(false)), canvasTexture(256, 256, draw(true))];
}

export class Garden {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(500, 500).rotateX(-Math.PI / 2),
      new THREE.ShaderMaterial({ vertexShader: "varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }", fragmentShader: GROUND }),
    );
    this.group.add(ground);

    this.glassU = { uTime: { value: 0 } };
    this.buildGreenhouse();
    this.buildBorders();
    this.buildBench();
    this.buildPlaques();
  }

  buildGreenhouse() {
    const frame = new THREE.MeshStandardMaterial({ color: "#a9b3b7", metalness: 0.5, roughness: 0.45 });
    const brick = new THREE.MeshStandardMaterial({ color: "#9a5636", roughness: 0.9 });
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
    for (const z of [d / 2, -d / 2]) box(w, knee, 0.22, brick, 0, knee / 2, z, g);
    for (const x of [w / 2, -w / 2]) box(0.22, knee, d, brick, x, knee / 2, 0, g);
    const bays = 7;
    for (let i = 0; i <= bays; i++) {
      const x = -w / 2 + (i * w) / bays;
      for (const z of [d / 2, -d / 2]) {
        box(0.06, h - knee, 0.06, frame, x, (h + knee) / 2, z, g);
        strut(new THREE.Vector3(x, h, z), new THREE.Vector3(x, ridge, 0), 0.03, frame, g);
      }
    }
    for (const z of [d / 2, -d / 2]) {
      box(w, 0.07, 0.08, frame, 0, knee, z, g);
      box(w, 0.08, 0.1, frame, 0, h, z, g);
    }
    box(w + 0.1, 0.1, 0.12, frame, 0, ridge, 0, g);
    for (const x of [w / 2, -w / 2]) {
      for (const z of [-d / 2, -d / 6, d / 6, d / 2]) box(0.06, h - knee, 0.06, frame, x, (h + knee) / 2, z, g);
      strut(new THREE.Vector3(x, h, 0), new THREE.Vector3(x, ridge, 0), 0.03, frame, g);
    }
    // Door frame in the middle bay of the front.
    const door = w / bays;
    box(0.08, h - 0.05, 0.1, frame, -door / 2, h / 2, d / 2 + 0.02, g);
    box(0.08, h - 0.05, 0.1, frame, door / 2, h / 2, d / 2 + 0.02, g);
    box(door, 0.08, 0.1, frame, 0, h - 0.05, d / 2 + 0.02, g);

    const slope = Math.hypot(d / 2, ridge - h);
    const pane = (pw, ph, x, y, z, rx = 0, ry = 0) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), glass);
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, 0);
      m.renderOrder = 2;
      g.add(m);
    };
    const tilt = Math.atan2(ridge - h, d / 2);
    for (const s of [1, -1]) {
      pane(w, h - knee, 0, (h + knee) / 2, (s * d) / 2);
      pane(w, slope, 0, (h + ridge) / 2, (s * d) / 4, -s * (Math.PI / 2 - tilt));
      pane(d, h - knee, (s * w) / 2, (h + knee) / 2, 0, 0, Math.PI / 2);
    }
    const gable = new THREE.Shape([new THREE.Vector2(-d / 2, 0), new THREE.Vector2(d / 2, 0), new THREE.Vector2(0, ridge - h)]);
    for (const s of [1, -1]) {
      const m = new THREE.Mesh(new THREE.ShapeGeometry(gable), glass);
      m.position.set((s * w) / 2, h, 0);
      m.rotation.y = Math.PI / 2;
      m.renderOrder = 2;
      g.add(m);
    }

    // Staging inside with seedlings and two tall tomato vines.
    const wood = new THREE.MeshStandardMaterial({ color: "#8a6440", roughness: 0.8 });
    box(w - 0.6, 0.08, 0.9, wood, 0, 0.9, -d / 2 + 0.6, g);
    const pot = new THREE.MeshStandardMaterial({ color: "#b85c34", roughness: 0.85 });
    const leaf = new THREE.MeshStandardMaterial({ color: "#3f8a2c", roughness: 0.7 });
    for (let i = 0; i < 12; i++) {
      const x = -w / 2 + 0.6 + i * ((w - 1.2) / 11);
      box(0.24, 0.22, 0.24, pot, x, 1.05, -d / 2 + 0.6, g);
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.2 + hash(i) * 0.12, 10, 8), leaf);
      s.position.set(x, 1.3 + hash(i * 2.1) * 0.15, -d / 2 + 0.6);
      s.scale.y = 0.8;
      g.add(s);
    }
    for (const x of [-w / 2 + 0.7, w / 2 - 0.7]) {
      const vine = new THREE.Mesh(new THREE.ConeGeometry(0.42, 2.2, 10), leaf);
      vine.position.set(x, 1.1, d / 2 - 0.7);
      g.add(vine);
    }
  }

  buildBorders() {
    const hedge = new THREE.MeshStandardMaterial({ color: "#2f6a28", roughness: 0.9 });
    for (let i = 0; i < 26; i++) {
      const side = i % 2 ? 1 : -1;
      const x = side * (5 + hash(i * 1.3) * 6);
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.9 + hash(i * 2.9) * 0.7, 14, 10), hedge);
      s.position.set(x, 0.5, -6 - hash(i * 4.1) * 5);
      s.scale.y = 0.75;
      this.group.add(s);
    }
    const white = new THREE.MeshStandardMaterial({ color: "#eef0ea", roughness: 0.6 });
    const n = 110;
    const pickets = new THREE.InstancedMesh(new THREE.BoxGeometry(0.1, 0.95, 0.04), white, n);
    const m = new THREE.Matrix4();
    for (let i = 0; i < n; i++) pickets.setMatrixAt(i, m.makeTranslation(-14 + i * 0.26, 0.48, -12.5));
    this.group.add(pickets);
    for (const y of [0.3, 0.72]) box(28.6, 0.07, 0.05, white, 0, y, -12.55, this.group);
    // A shade tree off to the left.
    const bark = new THREE.MeshStandardMaterial({ color: "#5a3f2a", roughness: 0.9 });
    strut(new THREE.Vector3(-8.5, 0, -15), new THREE.Vector3(-8.3, 4.5, -15), 0.32, bark, this.group);
    const crown = new THREE.MeshStandardMaterial({ color: "#3a7a2e", roughness: 0.85 });
    for (let i = 0; i < 9; i++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(1.6 + hash(i * 3.3) * 0.8, 14, 10), crown);
      s.position.set(-8.3 + (hash(i * 1.9) - 0.5) * 4, 5.2 + (hash(i * 2.7) - 0.5) * 2.2, -15 + (hash(i * 5.1) - 0.5) * 2);
      this.group.add(s);
    }
  }

  buildBench() {
    const top = new THREE.MeshStandardMaterial({ map: woodTexture("#c08a52", 1), roughness: 0.8 });
    top.map.repeat.set(2, 1);
    const frameWood = new THREE.MeshStandardMaterial({ map: woodTexture("#9a6a3c", 2), roughness: 0.85 });
    for (let i = 0; i < 4; i++) box(6.8, 0.07, 0.36, top, 0, BENCH_Y - 0.035, -0.57 + i * 0.38, this.group);
    box(6.8, 0.6, 0.06, frameWood, 0, PLAQUE_Y + 0.04, APRON_Z - 0.03, this.group);
    box(6.8, 0.5, 0.06, frameWood, 0, BENCH_Y + 0.25, -0.78, this.group);
    for (const x of [-3.25, 3.25]) for (const z of [-0.72, 0.72]) box(0.12, BENCH_Y, 0.12, frameWood, x, BENCH_Y / 2, z, this.group);
    for (const x of [-3.25, 3.25]) box(0.1, 0.5, 0.1, frameWood, x, BENCH_Y + 0.25, -0.78, this.group);
    for (let i = 0; i < 3; i++) box(6.6, 0.05, 0.4, top, 0, 0.2, -0.45 + i * 0.44, this.group);
    const sack = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 12), new THREE.MeshStandardMaterial({ color: "#8a6a3e", roughness: 1 }));
    sack.scale.set(1.3, 0.55, 0.8);
    sack.position.set(2.2, 0.42, -0.1);
    this.group.add(sack);
  }

  buildPlaques() {
    const bark = new THREE.MeshStandardMaterial({ color: "#5a3a22", roughness: 0.9 });
    this.plaques = ICONS.map((_, k) => {
      const [map, glow] = plaqueTextures(k);
      const face = new THREE.MeshStandardMaterial({ map, emissiveMap: glow, emissive: new THREE.Color(), roughness: 0.7 });
      const geo = new THREE.CylinderGeometry(0.25, 0.25, 0.06, 40).rotateX(Math.PI / 2).rotateZ(Math.PI / 2);
      const mesh = new THREE.Mesh(geo, [bark, face, bark]);
      mesh.position.copy(plaqueCenter(k));
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.018, 8, 48), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0 }));
      ring.position.copy(plaqueCenter(k)).add(new THREE.Vector3(0, 0, 0.03));
      this.group.add(mesh, ring);
      return { mesh, face, ring };
    });
    // Burnt arrows between the plaques show which way the method runs.
    const arrow = new THREE.Shape([new THREE.Vector2(-0.05, 0.05), new THREE.Vector2(0.04, 0), new THREE.Vector2(-0.05, -0.05)]);
    const arrowMat = new THREE.MeshStandardMaterial({ color: "#4a2a12", roughness: 0.9 });
    for (let k = 0; k < 6; k++) {
      const m = new THREE.Mesh(new THREE.ShapeGeometry(arrow), arrowMat);
      m.position.set((plaqueX(k) + plaqueX(k + 1)) / 2, PLAQUE_Y, APRON_Z + 0.005);
      this.group.add(m);
    }
  }

  /** lit[k]: 0 dark, 1 current step. */
  update(t, lit, colors) {
    this.glassU.uTime.value = t;
    this.plaques.forEach((p, k) => {
      p.face.emissive.set(colors[k]);
      p.face.emissiveIntensity = lit[k] * 1.25;
      p.ring.material.color.set(colors[k]);
      p.ring.material.opacity = clamp(lit[k], 0, 1) * 0.9;
      p.mesh.scale.setScalar(1 + lit[k] * 0.12);
    });
  }
}

/** Two-week bean height curve (0..1) for an experiment day. */
export const growth = (day) => {
  const L = (d) => 1 / (1 + Math.exp(-(d - 6.5) / 2));
  return day <= 0 ? 0 : (L(day) - L(0)) / (L(14) - L(0));
};

function leaflet(len) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(len * 0.2, len * 0.34, len * 0.75, len * 0.36, len, 0);
  s.bezierCurveTo(len * 0.75, -len * 0.36, len * 0.2, -len * 0.34, 0, 0);
  return new THREE.ShapeGeometry(s, 8).rotateX(-Math.PI / 2);
}

/** First leaves are single hearts; the rest are bean trifoliates on a short stalk, all pointing +x. */
const SIMPLE = leaflet(0.36);
const TRIFOLIATE = (() => {
  const stalk = 0.16;
  const parts = [new THREE.BoxGeometry(stalk, 0.014, 0.014).translate(stalk / 2, 0, 0), leaflet(0.34).translate(stalk, 0, 0)];
  for (const side of [1, -1]) parts.push(leaflet(0.28).rotateY(side * 1.15).translate(stalk, 0, 0));
  return mergeGeometries(parts);
})();
const NODES = [0.16, 0.42, 0.7, 0.98, 1.26, 1.54, 1.82];

/** Terracotta pot with its bean plant, label, ruler and optional sun shade. */
export class BeanPot {
  constructor(parent, k, spec) {
    this.spec = spec;
    this.group = new THREE.Group();
    this.group.position.set(POT_X[k], BENCH_Y, 0);
    parent.add(this.group);
    const prof = [[0, 0], [0.34, 0], [0.36, 0.03], [0.46, 0.62], [0.52, 0.64], [0.53, 0.78], [0.47, 0.78], [0.45, 0.66]].map(([x, y]) => new THREE.Vector2(x, y));
    this.potMat = new THREE.MeshStandardMaterial({ color: "#c4643a", roughness: 0.85 });
    this.group.add(new THREE.Mesh(new THREE.LatheGeometry(prof, 40), this.potMat));
    this.soilMat = new THREE.MeshStandardMaterial({ color: "#4a2e1a", roughness: 1 });
    const soil = new THREE.Mesh(new THREE.CircleGeometry(0.455, 32).rotateX(-Math.PI / 2), this.soilMat);
    soil.position.y = SOIL_Y - BENCH_Y;
    this.group.add(soil);

    const label = canvasTexture(256, 64, (g, w, h) => {
      g.fillStyle = "#f3ead8";
      g.beginPath();
      g.roundRect(4, 4, w - 8, h - 8, 10);
      g.fill();
      g.fillStyle = "#3a2a1a";
      g.font = `800 40px ${FONT_COND}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(spec.label, w / 2, h / 2 + 2);
    });
    this.labelMat = new THREE.MeshStandardMaterial({ map: label, roughness: 0.8, transparent: true, opacity: 0 });
    const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.155), this.labelMat);
    tag.position.set(0, 0.36, 0.43);
    tag.rotation.x = -0.16;
    this.group.add(tag);

    this.plant = new THREE.Group();
    this.plant.position.y = SOIL_Y - BENCH_Y;
    this.group.add(this.plant);
    this.stemMat = new THREE.MeshStandardMaterial({ color: "#5aa83a", roughness: 0.6 });
    this.leafMat = new THREE.MeshStandardMaterial({ color: "#3f9a2e", roughness: 0.55, side: THREE.DoubleSide });
    this.stem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.055, 1, 8).translate(0, 0.5, 0), this.stemMat);
    this.plant.add(this.stem);
    const leafAt = (geo, yaw) => {
      const pivot = new THREE.Group();
      pivot.rotation.y = yaw;
      const leaf = new THREE.Mesh(geo, this.leafMat);
      leaf.rotation.set(0.55, 0, 0.3);
      pivot.add(leaf);
      this.plant.add(pivot);
      return pivot;
    };
    this.nodes = NODES.map((_, i) => (i ? [leafAt(TRIFOLIATE, i % 2 ? Math.PI - 0.5 : 0.5)] : [leafAt(SIMPLE, 0.2), leafAt(SIMPLE, Math.PI + 0.2)]));
    this.tip = leafAt(TRIFOLIATE, -1.2);
    this.flowerMat = new THREE.MeshStandardMaterial({ color: "#c9a2f0", roughness: 0.6 });
    this.flowers = [0.3, 2.4, 4.4].map((yaw) => {
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), this.flowerMat);
      f.userData.yaw = yaw;
      this.plant.add(f);
      return f;
    });
    this.seed = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), new THREE.MeshStandardMaterial({ color: "#8a6a4a", roughness: 0.6 }));
    this.seed.scale.set(1.4, 0.8, 0.9);
    this.group.add(this.seed);

    const ruler = canvasTexture(64, 1024, (g, w, h) => {
      g.fillStyle = "#ffd85a";
      g.fillRect(0, 0, w, h);
      g.fillStyle = "#3a2a10";
      for (let cm = 0; cm <= 24; cm++) {
        const y = h - (cm / 24) * h;
        g.fillRect(0, y - 2, cm % 5 ? 18 : 34, 4);
      }
    });
    this.rulerMat = new THREE.MeshStandardMaterial({ map: ruler, color: new THREE.Color(0.6, 0.6, 0.6), roughness: 0.6, transparent: true, opacity: 0 });
    this.ruler = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 2.4).translate(0, 1.2, 0), this.rulerMat);
    this.ruler.position.set(0.36, SOIL_Y - BENCH_Y, 0.12);
    this.group.add(this.ruler);
    this.mark = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.025, 0.02), new THREE.MeshBasicMaterial({ color: "#ff4f5a", transparent: true, opacity: 0 }));
    this.group.add(this.mark);

    if (spec.light < 1) this.buildShade(spec.light < 0.6);
  }

  /** A garden parasol: dense canvas over the shade pot, open mesh over the half-sun pot. */
  buildShade(dense) {
    this.shade = new THREE.Group();
    this.group.add(this.shade);
    const pole = new THREE.MeshStandardMaterial({ color: "#6a5040", roughness: 0.6 });
    this.poleH = dense ? 2.15 : 2.8;
    this.pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1, 8).translate(0, 0.5, 0), pole);
    this.pole.position.set(0, 0, -0.45);
    this.shade.add(this.pole);
    const holes = canvasTexture(128, 128, (g, w) => {
      g.fillStyle = "#fff";
      g.fillRect(0, 0, w, w);
      g.fillStyle = "#000";
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) g.fillRect(x * 16 + 4, y * 16 + 4, 8, 8);
    });
    holes.colorSpace = THREE.NoColorSpace;
    holes.wrapS = holes.wrapT = THREE.RepeatWrapping;
    holes.repeat.set(6, 3);
    const cloth = new THREE.MeshStandardMaterial({
      color: dense ? "#2f5e3a" : "#7fc98f",
      roughness: 0.9,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: dense ? 0.96 : 0.85,
      alphaMap: dense ? null : holes,
      depthWrite: dense,
    });
    this.canopy = new THREE.Mesh(new THREE.ConeGeometry(0.78, 0.3, 32, 1, true).translate(0, -0.15, 0), cloth);
    this.canopy.rotation.x = -0.35;
    this.shade.add(this.canopy);
  }

  /**
   * h: plant height (world units), health: 0..1 leaf vigour, open: shade opened 0..1,
   * seedDrop: seed fall 0..1, ruler: 0..1, label: 0..1, wet: soil darkening.
   */
  update({ t, h, open, seedDrop, ruler, label, wet, bloom, groove }) {
    const lightK = this.shade ? lerp(1, this.spec.light, open) : 1;
    this.potMat.color.set("#c4643a").multiplyScalar(lightK);
    this.soilMat.color.set("#4a2e1a").multiplyScalar(lightK * (1 - wet * 0.45));
    this.labelMat.opacity = label;
    this.labelMat.color.setScalar(0.62 * lightK);

    const vigour = this.spec.height / 2.2;
    this.stemMat.color.set("#5aa83a").lerp(new THREE.Color("#b8c86a"), 1 - vigour).multiplyScalar(lightK);
    this.leafMat.color.set("#3f9a2e").lerp(new THREE.Color("#a8c45a"), (1 - vigour) * 0.9).multiplyScalar(lightK);
    this.plant.visible = h > 0.005;
    this.stem.scale.set(1, Math.max(0.001, h), 1);
    this.plant.rotation.z = Math.sin(t * 1.3 + this.group.position.x) * 0.025 + groove;
    const size = 0.75 + 0.5 * vigour;
    this.nodes.forEach((leaves, i) => {
      const y = NODES[i];
      const k = clamp((h - y) / 0.3, 0, 1);
      for (const p of leaves) {
        p.visible = k > 0;
        p.position.y = y;
        p.scale.setScalar(k * size);
      }
    });
    this.tip.position.y = h;
    this.tip.scale.setScalar(clamp(h / 0.12, 0, 1) * 0.45 * size);
    this.flowers.forEach((f, i) => {
      const k = clamp(bloom * 3 - i, 0, 1) * (vigour > 0.6 ? 1 : 0);
      f.visible = k > 0;
      const y = NODES[Math.min(NODES.length - 1, 2 + i)] + 0.05;
      f.position.set(Math.cos(f.userData.yaw) * 0.1, Math.min(h, y), Math.sin(f.userData.yaw) * 0.1);
      f.scale.setScalar(k);
    });

    const fall = clamp(seedDrop, 0, 1);
    this.seed.visible = seedDrop > 0 && h < 0.03;
    this.seed.position.set(0, SOIL_Y - BENCH_Y + 0.04 + (1 - fall * fall) * 1.6, 0.05);
    this.seed.rotation.z = fall * 6;

    this.rulerMat.opacity = ruler;
    this.ruler.scale.y = Math.max(0.001, smooth(0, 0.6, ruler));
    this.mark.material.opacity = ruler;
    this.mark.position.set(0.36, SOIL_Y - BENCH_Y + h, 0.14);

    if (this.shade) {
      const k = clamp(open, 0, 1.2);
      this.shade.visible = open > 0.001;
      const rise = this.poleH * Math.min(1, k * 1.4);
      this.pole.scale.y = rise;
      this.canopy.position.set(0, rise, -0.45);
      this.canopy.scale.set(k, 1, k);
    }
  }

  /** Ruler marker position in world space. */
  markWorld(v) {
    return v.copy(this.mark.position).applyMatrix4(this.group.matrixWorld);
  }
}

/** Ladybug with six spots; faces +x, origin under its belly. */
export function ladybug() {
  const g = new THREE.Group();
  const red = new THREE.MeshStandardMaterial({ color: "#e8281e", roughness: 0.25, metalness: 0.1 });
  const black = new THREE.MeshStandardMaterial({ color: "#121212", roughness: 0.4 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.2, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), red);
  body.scale.set(1.15, 0.85, 1);
  g.add(body);
  const belly = new THREE.Mesh(new THREE.CircleGeometry(0.2, 24).rotateX(Math.PI / 2), black);
  belly.scale.set(1.15, 1, 1);
  g.add(belly);
  const seam = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.012, 0.012), black);
  seam.position.y = 0.17;
  g.add(seam);
  for (const [x, z] of [[0.08, 0.1], [0.08, -0.1], [-0.08, 0.12], [-0.08, -0.12], [-0.17, 0.05], [-0.17, -0.05]]) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), black);
    s.position.set(x, Math.sqrt(Math.max(0, 0.04 - (x / 1.15) ** 2 - z * z)) * 0.85 + 0.005, z);
    s.scale.y = 0.4;
    g.add(s);
  }
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 12), black);
  head.position.set(0.23, 0.07, 0);
  g.add(head);
  const white = new THREE.MeshStandardMaterial({ color: "#d8d8d8", roughness: 0.3 });
  for (const z of [0.05, -0.05]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.026, 10, 8), white);
    eye.position.set(0.3, 0.1, z);
    g.add(eye);
    strut(new THREE.Vector3(0.28, 0.13, z * 0.8), new THREE.Vector3(0.36, 0.26, z * 2.4), 0.008, black, g);
  }
  return g;
}

/** Green watering can, spout toward +x, origin at the base centre. */
export function wateringCan() {
  const g = new THREE.Group();
  const zinc = new THREE.MeshStandardMaterial({ color: "#3f9a5a", metalness: 0.5, roughness: 0.35 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.25, 0.42, 24), zinc);
  body.position.y = 0.21;
  g.add(body);
  strut(new THREE.Vector3(0.18, 0.1, 0), new THREE.Vector3(0.62, 0.5, 0), 0.035, zinc, g);
  const rose = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.04, 0.06, 16), zinc);
  rose.position.set(0.64, 0.52, 0);
  rose.rotation.z = -0.8;
  g.add(rose);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.025, 8, 20, Math.PI), zinc);
  handle.position.set(-0.05, 0.42, 0);
  g.add(handle);
  g.userData.rose = new THREE.Vector3(0.66, 0.5, 0);
  return g;
}

/** Magnifying glass lying in the XY plane, lens centred on the origin. */
export function magnifier() {
  const g = new THREE.Group();
  const brass = new THREE.MeshStandardMaterial({ color: "#d9a845", metalness: 0.8, roughness: 0.3 });
  g.add(new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.035, 10, 48), brass));
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.33, 40), new THREE.MeshBasicMaterial({ color: "#cfe8ff", transparent: true, opacity: 0.16, depthWrite: false }));
  g.add(lens);
  strut(new THREE.Vector3(0.24, -0.24, 0), new THREE.Vector3(0.6, -0.6, 0), 0.045, new THREE.MeshStandardMaterial({ color: "#5a2e1a", roughness: 0.6 }), g);
  return g;
}
