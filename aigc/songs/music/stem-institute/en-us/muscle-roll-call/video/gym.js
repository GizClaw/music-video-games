import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { hash } from "@gizclaw/mvg-core/timing.js";

// A bright sports hall: a block wall with three tall windows at z = WALL, a
// rubber floor, a training mat at the origin, wall bars, a dumbbell rack and props.
const WALL = -5;
const WINDOWS = [-2.7, 0, 2.7];
const UP = new THREE.Vector3(0, 1, 0);

const merge = (geos) => mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g)));
const lathe = (pts, seg = 32) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.0004), y)), seg);
function rod(a, b, r, seg = 12) {
  const A = new THREE.Vector3(...a);
  const d = new THREE.Vector3(...b).sub(A);
  const g = new THREE.CapsuleGeometry(r, Math.max(d.length() - 2 * r, 0.0005), 4, seg);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.clone().normalize()));
  return g.translate(A.x + d.x / 2, A.y + d.y / 2, A.z + d.z / 2);
}
const rbox = (w, h, d, r, x = 0, y = 0, z = 0) => new RoundedBoxGeometry(w, h, d, 3, r).translate(x, y, z);

function canvasTexture(w, h, draw, repeat = [1, 1]) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(...repeat);
  tex.anisotropy = 4;
  return tex;
}

const woodTexture = (base, dark) => canvasTexture(128, 512, (g, w, h) => {
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 70; i++) {
    g.strokeStyle = `${dark}${Math.round(20 + hash(i * 1.7) * 50).toString(16)}`;
    g.lineWidth = 1 + hash(i * 2.9) * 2.5;
    const x = hash(i * 3.3) * w;
    g.beginPath();
    g.moveTo(x, 0);
    for (let y = 0; y <= h; y += 32) g.lineTo(x + Math.sin(y * 0.02 + i) * 4, y);
    g.stroke();
  }
});

const WALL_FS = /* glsl */ `
  uniform float uTime; varying vec2 vUv;
  float h21(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
  float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
  float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * noise(p); p *= 2.1; a *= 0.5; } return s; }
  float box(vec2 p, vec2 c, vec2 b) { vec2 d = abs(p - c) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
  void main() {
    vec2 p = (vUv - vec2(0.5, 0.0)) * vec2(14.0, 7.0);
    vec2 b = vec2(p.x / 0.4 + 0.5 * step(0.5, fract(p.y / 0.4)), p.y / 0.2);
    vec2 f = fract(b);
    float mortar = 1.0 - smoothstep(0.0, 0.04, min(min(f.x, 1.0 - f.x) * 0.4, min(f.y, 1.0 - f.y) * 0.2) - 0.004);
    vec3 col = mix(vec3(0.7, 0.69, 0.71), vec3(0.6, 0.6, 0.65), smoothstep(2.0, 6.5, p.y));
    col *= 0.94 + 0.08 * h21(floor(b)) + 0.04 * noise(p * 30.0);
    col = mix(col, col * 0.78, mortar);
    col = mix(col, vec3(0.13, 0.36, 0.52) * (0.95 + 0.05 * noise(p * 40.0)), step(p.y, 1.15));
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
        float trees = -1.05 + 0.2 * fbm(vec2(p.x * 3.0, 1.0)) + 0.1 * fbm(vec2(p.x * 9.0, 2.0));
        if (q.y < trees) sky = mix(vec3(0.14, 0.32, 0.2), vec3(0.26, 0.48, 0.28), fbm(p * 9.0));
        col = sky;
      }
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
    vec2 tile = abs(fract(p) - 0.5);
    col *= 1.0 - 0.18 * smoothstep(0.485, 0.5, max(tile.x, tile.y));
    col += vec3(0.9, 0.95, 1.0) * smoothstep(${(WALL + 3.5).toFixed(1)}, ${WALL.toFixed(1)}, p.y) * 0.12;
    float court = smoothstep(0.03, 0.0, abs(length(p - vec2(0.0, -1.4)) - 2.6)) * step(p.y, -0.2);
    col = mix(col, vec3(0.95, 0.75, 0.2), court * 0.6);
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
    this.wallU = { uTime: { value: 0 } };
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(14, 7), new THREE.ShaderMaterial({ uniforms: this.wallU, vertexShader: vs, fragmentShader: WALL_FS }));
    wall.position.set(0, 3.5, WALL);
    this.group.add(wall);

    this.floorU = { uRing: { value: 9 }, uChorus: { value: 0 }, uRingColor: { value: new THREE.Color("#ffffff") } };
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 16).rotateX(-Math.PI / 2).translate(0, 0, WALL + 8),
      new THREE.ShaderMaterial({ uniforms: this.floorU, vertexShader: "varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }", fragmentShader: FLOOR_FS }),
    );
    this.group.add(floor);
    const catcher = new THREE.Mesh(new THREE.PlaneGeometry(8, 8).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: 0.35, color: "#05060a" }));
    catcher.position.y = 0.002;
    catcher.receiveShadow = true;
    this.group.add(catcher);

    this.ceilU = { uKick: { value: 0 } };
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(14, 8).rotateX(Math.PI / 2), new THREE.ShaderMaterial({ uniforms: this.ceilU, vertexShader: vs, fragmentShader: CEIL_FS }));
    ceil.position.set(0, 4.6, WALL + 4);
    this.group.add(ceil);

    const blob = canvasTexture(128, 128, (g) => {
      const grd = g.createRadialGradient(64, 64, 4, 64, 64, 62);
      grd.addColorStop(0, "rgba(0,0,0,0.7)");
      grd.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = grd;
      g.fillRect(0, 0, 128, 128);
    });
    this.blobMat = new THREE.MeshBasicMaterial({ map: blob, transparent: true, depthWrite: false });
    this.blobGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.steel = new THREE.MeshStandardMaterial({ color: "#2a2e38", metalness: 0.7, roughness: 0.35 });
    this.chrome = new THREE.MeshStandardMaterial({ color: "#d8dde6", metalness: 1, roughness: 0.22 });

    this.buildWall();
    this.buildMat();
    this.buildBars();
    this.buildRack();
    this.buildProps();
  }

  mesh(geo, mat, parent = this.group) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  blob(x, z, w, d) {
    const m = new THREE.Mesh(this.blobGeo, this.blobMat);
    m.position.set(x, 0.004, z);
    m.scale.set(w, 1, d);
    this.group.add(m);
  }

  buildWall() {
    const frame = new THREE.MeshPhysicalMaterial({ color: "#c4c9d1", roughness: 0.5, clearcoat: 0.2 });
    const glass = new THREE.MeshPhysicalMaterial({ color: "#dcecff", roughness: 0.04, metalness: 0, clearcoat: 1, transparent: true, opacity: 0.14, depthWrite: false });
    const parts = [];
    const panes = [];
    for (const cx of WINDOWS) {
      const outer = new THREE.Shape();
      outer.moveTo(cx - 0.98, 1.62);
      outer.lineTo(cx + 0.98, 1.62);
      outer.lineTo(cx + 0.98, 4.48);
      outer.lineTo(cx - 0.98, 4.48);
      const hole = new THREE.Path();
      hole.moveTo(cx - 0.9, 1.7);
      hole.lineTo(cx - 0.9, 4.4);
      hole.lineTo(cx + 0.9, 4.4);
      hole.lineTo(cx + 0.9, 1.7);
      outer.holes.push(hole);
      parts.push(new THREE.ExtrudeGeometry(outer, { depth: 0.06, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 3 }).translate(0, 0, WALL));
      parts.push(rbox(0.05, 2.7, 0.05, 0.012, cx, 3.05, WALL + 0.04));
      for (const dy of [-0.45, 0.45]) parts.push(rbox(1.8, 0.05, 0.05, 0.012, cx, 3.05 + dy, WALL + 0.04));
      parts.push(rbox(2.1, 0.05, 0.18, 0.015, cx, 1.6, WALL + 0.09));
      panes.push(new THREE.PlaneGeometry(1.8, 2.7).translate(cx, 3.05, WALL + 0.03));
    }
    this.mesh(merge(parts), frame);
    this.group.add(new THREE.Mesh(merge(panes), glass));
    this.mesh(rbox(14, 0.06, 0.05, 0.015, 0, 1.18, WALL + 0.03), new THREE.MeshPhysicalMaterial({ color: "#ff8a3d", roughness: 0.4, clearcoat: 0.5 }));
    this.mesh(rbox(14, 0.12, 0.04, 0.012, 0, 0.06, WALL + 0.02), new THREE.MeshStandardMaterial({ color: "#20242c", roughness: 0.6 }));
  }

  buildMat() {
    const tex = canvasTexture(512, 340, (g, w, h) => {
      g.fillStyle = "#8a96a8";
      g.fillRect(0, 0, w, h);
      g.fillStyle = "#16568a";
      g.beginPath();
      g.roundRect(10, 10, w - 20, h - 20, 18);
      g.fill();
      for (let i = 0; i < 4000; i++) {
        g.fillStyle = `rgba(255,255,255,${hash(i * 1.9) * 0.05})`;
        g.fillRect(hash(i * 2.7) * w, hash(i * 3.9) * h, 2, 2);
      }
      g.strokeStyle = "rgba(255,255,255,0.18)";
      g.lineWidth = 3;
      g.beginPath();
      g.arc(w / 2, h / 2, 70, 0, Math.PI * 2);
      g.stroke();
    });
    const mat = this.mesh(new RoundedBoxGeometry(1.5, 0.024, 1.0, 3, 0.011), new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.7, sheen: 0.3, sheenColor: "#9fd0ff" }));
    mat.position.set(0, 0.012, 0.05);
    mat.castShadow = false;
  }

  buildBars() {
    const wood = new THREE.MeshPhysicalMaterial({ map: woodTexture("#c8955a", "#6a4220"), roughness: 0.45, clearcoat: 0.5 });
    const rails = [];
    const rungs = [];
    const brackets = [];
    for (const x0 of [1.5, 2.4]) {
      for (const dx of [-0.4, 0.4]) {
        rails.push(rbox(0.07, 2.7, 0.06, 0.018, x0 + dx, 1.35, WALL + 0.14));
        for (const y of [0.25, 2.5]) brackets.push(rbox(0.09, 0.05, 0.12, 0.01, x0 + dx, y, WALL + 0.06), new THREE.CylinderGeometry(0.008, 0.008, 0.01, 10).rotateX(Math.PI / 2).translate(x0 + dx, y, WALL + 0.12));
      }
      for (let k = 0; k < 15; k++) rungs.push(new THREE.CylinderGeometry(0.018, 0.018, 0.74, 14).rotateZ(Math.PI / 2).translate(x0, 0.2 + k * 0.17, WALL + 0.15));
    }
    this.mesh(merge(rails), wood);
    this.mesh(merge(rungs), wood);
    this.mesh(merge(brackets), this.chrome);
  }

  dumbbellGeo(r) {
    const hex = new THREE.Shape();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      i ? hex.lineTo(Math.cos(a) * r, Math.sin(a) * r) : hex.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    const head = new THREE.ExtrudeGeometry(hex, { depth: r * 0.8, bevelEnabled: true, bevelSize: r * 0.12, bevelThickness: r * 0.12, bevelSegments: 2 }).translate(0, 0, -r * 0.4);
    return {
      heads: merge([head.clone().translate(0, 0, 0.1 + r * 0.4), head.clone().translate(0, 0, -0.1 - r * 0.4)]),
      handle: lathe([[0.013, -0.1], [0.016, -0.098], [0.016, -0.088], [0.013, -0.086], [0.013, 0.086], [0.016, 0.088], [0.016, 0.098], [0.013, 0.1]], 14).rotateX(Math.PI / 2),
    };
  }

  buildRack() {
    const rubber = new THREE.MeshStandardMaterial({ color: "#1d2026", roughness: 0.7 });
    const colors = ["#ff4f6d", "#ffb03d", "#ffe14a", "#7cff6b", "#4fc3ff"].map((c) => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.4, clearcoat: 0.6 }));
    const x0 = -2.0;
    const z0 = WALL + 0.55;
    const frame = [];
    for (const dx of [-0.82, 0.82]) {
      frame.push(rod([x0 + dx, 0.02, z0 + 0.22], [x0 + dx, 0.95, z0 - 0.18], 0.022), rod([x0 + dx, 0.02, z0 - 0.22], [x0 + dx, 0.95, z0 - 0.18], 0.022), rod([x0 + dx, 0.02, z0 + 0.25], [x0 + dx, 0.02, z0 - 0.25], 0.02));
    }
    const shelves = [[0.45, z0 + 0.08], [0.82, z0 - 0.12]];
    for (const [y, z] of shelves) for (const dz of [-0.05, 0.05]) frame.push(rod([x0 - 0.84, y, z + dz], [x0 + 0.84, y, z + dz], 0.016));
    this.mesh(merge(frame), this.steel);
    for (const [y, z] of shelves) {
      for (let k = 0; k < 5; k++) {
        const g = this.dumbbellGeo(0.042 + k * 0.006);
        const grp = new THREE.Group();
        grp.position.set(x0 - 0.64 + k * 0.32, y + 0.05 + k * 0.006, z);
        grp.rotation.x = 0.15;
        this.group.add(grp);
        this.mesh(g.heads, rubber, grp);
        this.mesh(g.handle, this.chrome, grp);
        this.mesh(new THREE.CylinderGeometry(0.03 + k * 0.004, 0.03 + k * 0.004, 0.006, 6).rotateX(Math.PI / 2).translate(0, 0, 0.1 + 0.042 + k * 0.006 + 0.022), colors[k], grp);
      }
    }
    this.blob(x0, z0, 2.0, 0.7);
  }

  buildProps() {
    const ballTex = canvasTexture(256, 128, (g, w, h) => {
      g.fillStyle = "#2cc7b0";
      g.fillRect(0, 0, w, h);
      g.fillStyle = "#1e9e8c";
      for (let k = 0; k < 8; k += 2) g.fillRect((k * w) / 8, 0, w / 8, h);
    });
    const ball = this.mesh(new THREE.SphereGeometry(0.33, 48, 32), new THREE.MeshPhysicalMaterial({ map: ballTex, roughness: 0.3, clearcoat: 0.8 }));
    ball.position.set(1.45, 0.33, -2.5);
    ball.rotation.set(0.3, 0.4, 0.2);
    this.blob(1.45, -2.5, 0.8, 0.8);

    const plyo = woodTexture("#c49360", "#7a4e26");
    const box = this.mesh(new RoundedBoxGeometry(0.62, 0.5, 0.62, 4, 0.03), new THREE.MeshPhysicalMaterial({ map: plyo, roughness: 0.55, clearcoat: 0.2 }));
    box.position.set(-1.7, 0.25, -2.9);
    box.rotation.y = 0.4;
    const grip = this.mesh(new RoundedBoxGeometry(0.22, 0.07, 0.02, 3, 0.03), new THREE.MeshStandardMaterial({ color: "#2a1c10", roughness: 0.9 }), box);
    grip.position.set(0, 0.12, 0.305);
    this.blob(-1.7, -2.9, 0.95, 0.95);

    const iron = new THREE.MeshStandardMaterial({ color: "#2b2e36", metalness: 0.45, roughness: 0.5 });
    const kb = merge([
      lathe([[0.0004, 0], [0.09, 0.0], [0.12, 0.04], [0.135, 0.11], [0.12, 0.18], [0.08, 0.22], [0.0004, 0.23]], 32),
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3([[-0.07, 0.19, 0], [-0.085, 0.26, 0], [-0.05, 0.31, 0], [0.05, 0.31, 0], [0.085, 0.26, 0], [0.07, 0.19, 0]].map((p) => new THREE.Vector3(...p))), 40, 0.02, 10),
    ]);
    const kbBand = new THREE.TorusGeometry(0.133, 0.006, 8, 40).rotateX(Math.PI / 2).translate(0, 0.11, 0);
    [[-1.25, -1.9, 1, "#ffb03d"], [-1.0, -2.25, 0.8, "#4fc3ff"]].forEach(([x, z, s, c]) => {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      g.scale.setScalar(s);
      g.rotation.y = x * 2;
      this.group.add(g);
      this.mesh(kb, iron, g);
      this.mesh(kbBand, new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.4, clearcoat: 0.5 }), g);
      this.blob(x, z, 0.4 * s, 0.4 * s);
    });

    const spiral = canvasTexture(128, 128, (g) => {
      g.fillStyle = "#5a3ed8";
      g.fillRect(0, 0, 128, 128);
      g.strokeStyle = "#3a22a0";
      g.lineWidth = 3;
      g.beginPath();
      for (let a = 0; a < Math.PI * 14; a += 0.05) g.lineTo(64 + Math.cos(a) * a * 1.4, 64 + Math.sin(a) * a * 1.4);
      g.stroke();
    });
    const side = new THREE.MeshPhysicalMaterial({ color: "#7a5cff", roughness: 0.75, sheen: 0.4, sheenColor: "#c8b8ff" });
    const roll = this.mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.62, 40), [side, new THREE.MeshPhysicalMaterial({ map: spiral, roughness: 0.75 }), new THREE.MeshPhysicalMaterial({ map: spiral, roughness: 0.75 })]);
    roll.rotation.set(0, -0.5, Math.PI / 2);
    roll.position.set(1.0, 0.12, -1.6);
    this.blob(1.0, -1.6, 0.75, 0.35);

    const bottle = merge([lathe([[0.0004, 0], [0.034, 0.0], [0.036, 0.01], [0.034, 0.12], [0.03, 0.15], [0.03, 0.2], [0.0004, 0.2]], 24), lathe([[0.0004, 0.2], [0.022, 0.2], [0.022, 0.235], [0.0004, 0.24]], 16)]);
    const bt = this.mesh(bottle, new THREE.MeshPhysicalMaterial({ color: "#ff5d8f", roughness: 0.25, clearcoat: 0.8 }));
    bt.position.set(-1.62, 0.5, -2.85);
  }

  update(t, kick, sinceBeat, chorus, ringColor) {
    this.wallU.uTime.value = t;
    this.ceilU.uKick.value = kick * chorus;
    this.floorU.uRing.value = sinceBeat;
    this.floorU.uChorus.value = chorus;
    this.floorU.uRingColor.value.set(ringColor);
  }
}
