import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
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

const UP = new THREE.Vector3(0, 1, 0);
const merge = (geos) => mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g)));
const lathe = (pts, seg = 16) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.0004), y)), seg);

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

/** One palm frond: a drooping rachis lined with tapered leaflets. */
function frondGeometry() {
  const L = 1.45;
  const at = (u) => new THREE.Vector3(u * L, 0.22 * Math.sin(u * Math.PI * 0.85) - 0.55 * u * u, 0);
  const pos = [];
  const n = 26;
  for (let i = 2; i < n; i++) {
    const u = i / n;
    const p = at(u);
    const tan = at(Math.min(1, u + 0.01)).sub(p).normalize();
    const len = 0.36 * Math.sin(Math.PI * (0.12 + 0.88 * u)) + 0.04;
    for (const side of [-1, 1]) {
      const dir = tan.clone().multiplyScalar(0.55).add(new THREE.Vector3(0, -0.45, side * 0.8)).normalize();
      const nrm = new THREE.Vector3().crossVectors(dir, UP).normalize().multiplyScalar(0.022);
      const tip = p.clone().addScaledVector(dir, len);
      const mid = p.clone().addScaledVector(dir, len * 0.35);
      const lift = new THREE.Vector3(0, 0.012, 0);
      const a = mid.clone().add(nrm).add(lift);
      const b = mid.clone().sub(nrm).add(lift);
      pos.push(...p.toArray(), ...a.toArray(), ...tip.toArray(), ...p.toArray(), ...tip.toArray(), ...b.toArray());
    }
  }
  const leaves = new THREE.BufferGeometry();
  leaves.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  leaves.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  leaves.computeVertexNormals();
  const rachis = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(Array.from({ length: 9 }, (_, i) => at(i / 8))), 32, 0.012, 5);
  return merge([leaves, rachis]);
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
    const catcher = new THREE.Mesh(new THREE.PlaneGeometry(8, 8).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: 0.5, color: "#000008" }));
    catcher.position.y = 0.004;
    catcher.receiveShadow = true;
    this.group.add(catcher);

    this.foamU = { uTime: { value: 0 }, uWash: { value: 0 } };
    const foam = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 1.4).rotateX(-Math.PI / 2),
      new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: this.foamU, vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }", fragmentShader: FOAM }),
    );
    foam.position.set(0, 0.004, SHORE + 0.5);
    this.group.add(foam);

    const blob = canvasTexture(128, 128, (g) => {
      const grd = g.createRadialGradient(64, 64, 4, 64, 64, 62);
      grd.addColorStop(0, "rgba(0,0,0,0.75)");
      grd.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = grd;
      g.fillRect(0, 0, 128, 128);
    });
    this.blobMat = new THREE.MeshBasicMaterial({ map: blob, transparent: true, depthWrite: false });
    this.blobGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

    this.buildBoard();
    this.buildTorches();
    this.buildPalms();
    this.buildProps();
  }

  blob(x, z, w, d, a = 1) {
    const m = new THREE.Mesh(this.blobGeo, this.blobMat.clone());
    m.position.set(x, 0.006, z);
    m.scale.set(w, 1, d);
    m.material.opacity = a;
    this.group.add(m);
  }

  buildBoard() {
    const s = new THREE.Shape();
    for (let i = 0; i <= 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      const x = Math.cos(a) * 0.95;
      const nose = x > 0 ? 1 - Math.pow(x / 0.95, 4) * 0.55 : 1 - Math.pow(-x / 0.95, 6) * 0.25;
      const z = Math.sin(a) * 0.25 * nose;
      i ? s.lineTo(x, z) : s.moveTo(x, z);
    }
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.035, bevelEnabled: true, bevelSize: 0.018, bevelThickness: 0.014, bevelSegments: 5, curveSegments: 4 }).rotateX(Math.PI / 2);
    const deck = canvasTexture(1024, 256, (g, w, h) => {
      const grd = g.createLinearGradient(0, 0, w, 0);
      grd.addColorStop(0, "#127a74");
      grd.addColorStop(0.5, "#1fb3a6");
      grd.addColorStop(1, "#5fd6c4");
      g.fillStyle = grd;
      g.fillRect(0, 0, w, h);
      g.fillStyle = "#ff8a3d";
      g.fillRect(w * 0.7, 0, 34, h);
      g.fillStyle = "#ffd25a";
      g.fillRect(w * 0.7 + 44, 0, 12, h);
      for (let i = 0; i < 900; i++) {
        g.strokeStyle = `rgba(255,255,255,${0.04 + hash(i * 2.1) * 0.08})`;
        g.lineWidth = 1 + hash(i * 3.3) * 2;
        g.beginPath();
        g.arc(w * (0.08 + hash(i * 1.7) * 0.6), h * (0.15 + hash(i * 4.9) * 0.7), 3 + hash(i * 5.5) * 9, 0, Math.PI * 2 * hash(i * 6.1));
        g.stroke();
      }
      g.fillStyle = "#1c2026";
      g.beginPath();
      g.roundRect(w * 0.03, h * 0.18, w * 0.14, h * 0.64, 30);
      g.fill();
      g.strokeStyle = "#2c323c";
      g.lineWidth = 3;
      for (let k = 0; k < 9; k++) {
        g.beginPath();
        g.moveTo(w * 0.04 + k * 15, h * 0.22);
        g.lineTo(w * 0.04 + k * 15, h * 0.78);
        g.stroke();
      }
      g.fillStyle = "#7a5230";
      g.fillRect(0, h / 2 - 3, w, 6);
    }, [1 / 1.9, 1 / 0.5]);
    deck.offset.set(0.5, 0.5);
    this.board = new THREE.Group();
    this.board.position.set(0, 0.05, 0.05);
    this.group.add(this.board);
    const body = new THREE.Mesh(geo, [new THREE.MeshPhysicalMaterial({ map: deck, roughness: 0.45, clearcoat: 0.8, clearcoatRoughness: 0.25 }), new THREE.MeshPhysicalMaterial({ color: "#1aa294", roughness: 0.4, clearcoat: 0.8 })]);
    body.castShadow = true;
    body.receiveShadow = true;
    this.board.add(body);
    const plug = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.006, 16), new THREE.MeshStandardMaterial({ color: "#1c2026", roughness: 0.5 }));
    plug.position.set(-0.86, 0.016, 0);
    this.board.add(plug);
    const coil = [];
    for (let i = 0; i <= 60; i++) {
      const a = (i / 60) * Math.PI * 4.5;
      const r = 0.07 + i * 0.0018;
      coil.push(new THREE.Vector3(-1.08 + Math.cos(a) * r, -0.035 + 0.01 * Math.sin(a * 3), 0.18 + Math.sin(a) * r * 0.7));
    }
    coil.unshift(new THREE.Vector3(-0.86, 0.02, 0));
    this.board.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(coil), 160, 0.005, 6), new THREE.MeshStandardMaterial({ color: "#20262e", roughness: 0.5 })));
    this.blob(0, 0.05, 2.3, 0.75, 0.9);
  }

  buildTorches() {
    const bambooTex = canvasTexture(64, 256, (g, w, h) => {
      g.fillStyle = "#9a7448";
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 60; i++) {
        g.fillStyle = `rgba(${hash(i) > 0.5 ? "60,40,20" : "200,170,120"},${0.1 + hash(i * 2.2) * 0.15})`;
        g.fillRect(hash(i * 3.1) * w, 0, 1 + hash(i * 4.4) * 2, h);
      }
    });
    const weaveTex = canvasTexture(128, 128, (g, w, h) => {
      g.fillStyle = "#4a3018";
      g.fillRect(0, 0, w, h);
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
        g.fillStyle = (x + y) % 2 ? "#8a6236" : "#a87a44";
        g.beginPath();
        g.roundRect(x * 16 + 1, y * 16 + 2, 14, 12, 4);
        g.fill();
      }
    }, [4, 1]);
    const bamboo = new THREE.MeshStandardMaterial({ map: bambooTex, roughness: 0.65 });
    const cord = new THREE.MeshStandardMaterial({ color: "#3a2814", roughness: 0.95 });
    const basket = new THREE.MeshStandardMaterial({ map: weaveTex, roughness: 0.9 });
    const sandMat = new THREE.MeshStandardMaterial({ color: "#6a6474", roughness: 1 });
    const poleProfile = [];
    for (let i = 0; i <= 60; i++) {
      const y = (i / 60) * 1.56;
      const node = Math.exp(-Math.pow(((y % 0.31) - 0.3) / 0.012, 2)) + Math.exp(-Math.pow((y % 0.31) / 0.012, 2));
      poleProfile.push([0.03 - y * 0.004 + node * 0.006, y]);
    }
    const pole = lathe(poleProfile, 14);
    const can = lathe([[0, 1.54], [0.05, 1.55], [0.078, 1.62], [0.082, 1.7], [0.074, 1.71], [0.068, 1.7]], 20);
    const rings = merge([1.48, 1.51, 1.03, 1.06, 0.56, 0.59].map((y) => new THREE.TorusGeometry(0.034, 0.006, 6, 18).rotateX(Math.PI / 2).translate(0, y, 0)));
    const lash = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(Array.from({ length: 30 }, (_, i) => new THREE.Vector3(Math.cos(i * 0.9) * 0.05, 1.5 + i * 0.002, Math.sin(i * 0.9) * 0.05))), 90, 0.004, 5);
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
      g.add(new THREE.Mesh(pole, bamboo), new THREE.Mesh(rings, cord), new THREE.Mesh(lash, cord), new THREE.Mesh(can, basket));
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.008, 8, 24).rotateX(Math.PI / 2), cord);
      rim.position.y = 1.705;
      const wick = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.05, 10), new THREE.MeshStandardMaterial({ color: "#1a1410", roughness: 1 }));
      wick.position.y = 1.72;
      const mound = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), sandMat);
      mound.scale.y = 0.3;
      g.add(rim, wick, mound);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.32, 18, 1, true).translate(0, 0.16, 0), flameMat);
      flame.position.y = 1.72;
      const core = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.16, 12, 1, true).translate(0, 0.08, 0), flameMat);
      core.position.y = 1.72;
      g.add(flame, core);
      const light = new THREE.PointLight("#ff9446", 2.2, 7, 1.6);
      light.position.set(0, 1.85, 0.1);
      g.add(light);
      this.blob(x, z, 0.5, 0.5, 0.8);
      return { flame, core, light };
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
    const barkTex = canvasTexture(64, 64, (g, w, h) => {
      g.fillStyle = "#3a2c22";
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 40; i++) {
        g.fillStyle = `rgba(${hash(i) > 0.5 ? "20,14,10" : "90,70,50"},0.35)`;
        g.fillRect(hash(i * 2.3) * w, hash(i * 3.7) * h, 2 + hash(i * 1.1) * 6, 1 + hash(i * 5.9) * 2);
      }
    }, [3, 1]);
    const bark = new THREE.MeshStandardMaterial({ map: barkTex, roughness: 0.95 });
    const leaf = new THREE.MeshStandardMaterial({ color: "#1c3a25", roughness: 0.75, side: THREE.DoubleSide });
    const nut = new THREE.MeshStandardMaterial({ color: "#3a2a1a", roughness: 0.7 });
    const segment = lathe([[0.05, 0], [0.068, 0.03], [0.074, 0.1], [0.06, 0.16], [0.052, 0.17]], 12);
    const frond = frondGeometry();
    this.palms = [[-1.9, -2.6, 3.6, 0.55], [2.1, -3.4, 4.2, -0.45], [-3.6, -6.5, 4.6, 0.3]].map(([x, z, h, lean]) => {
      const g = new THREE.Group();
      g.position.set(x, 0, z);
      this.group.add(g);
      const at = (u) => new THREE.Vector3(Math.sin(u * 1.4) * lean, u * h, 0);
      const n = Math.round(h / 0.15);
      const trunk = new THREE.InstancedMesh(segment, bark, n);
      const m = new THREE.Matrix4();
      for (let k = 0; k < n; k++) {
        const u = k / n;
        const p = at(u);
        const dir = at(Math.min(1, u + 0.01)).sub(p).normalize();
        const s = 1.15 - u * 0.4;
        m.compose(p, new THREE.Quaternion().setFromUnitVectors(UP, dir).multiply(new THREE.Quaternion().setFromAxisAngle(UP, k * 1.3)), new THREE.Vector3(s, 1, s));
        trunk.setMatrixAt(k, m);
      }
      g.add(trunk);
      const crown = new THREE.Group();
      crown.position.copy(at(1));
      g.add(crown);
      crown.add(new THREE.Mesh(new THREE.SphereGeometry(0.09, 14, 10), bark));
      for (let k = 0; k < 4; k++) {
        const c = new THREE.Mesh(new THREE.SphereGeometry(0.06, 14, 10), nut);
        c.position.set(Math.cos(k * 1.7) * 0.08, -0.08, Math.sin(k * 1.7) * 0.08);
        c.scale.y = 1.12;
        crown.add(c);
      }
      const fronds = Array.from({ length: 11 }, (_, k) => {
        const yaw = new THREE.Group();
        yaw.rotation.y = (k / 11) * Math.PI * 2 + hash(k + x) * 0.4;
        crown.add(yaw);
        const droop = new THREE.Group();
        droop.rotation.z = 0.15 - hash(k * 3 + z) * 0.45;
        yaw.add(droop);
        droop.add(new THREE.Mesh(frond, leaf));
        return droop;
      });
      this.blob(x, z, 0.7, 0.7, 0.7);
      return { crown, fronds, phase: x };
    });
  }

  buildProps() {
    const rock = new THREE.MeshStandardMaterial({ color: "#2e303c", roughness: 0.95, flatShading: true });
    for (const [x, z, s] of [[-2.3, -1.4, 0.4], [2.6, -2.2, 0.55], [1.6, -3.6, 0.3]]) {
      const geo = new THREE.IcosahedronGeometry(s, 2);
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const v = new THREE.Vector3().fromBufferAttribute(p, i);
        v.multiplyScalar(1 + (hash(Math.round(v.x * 50) * 7 + Math.round(v.y * 50) * 13 + Math.round(v.z * 50)) - 0.5) * 0.25);
        p.setXYZ(i, v.x, v.y, v.z);
      }
      geo.computeVertexNormals();
      const r = new THREE.Mesh(geo, rock);
      r.position.set(x, s * 0.3, z);
      r.scale.y = 0.6;
      this.group.add(r);
      this.blob(x, z, s * 2.6, s * 2.2, 0.8);
    }
    const shell = new THREE.MeshPhysicalMaterial({ color: "#f0c8b4", roughness: 0.4, clearcoat: 0.6 });
    const conch = lathe(Array.from({ length: 12 }, (_, i) => [0.035 * Math.sin((i / 11) * Math.PI) * (1 - i / 14) + 0.003 * (i % 2), (i / 11) * 0.09]), 16);
    for (const [x, z, a] of [[-0.75, 0.9, 0.4], [0.9, 0.7, -1.2], [-1.4, 0.3, 2.2]]) {
      const c = new THREE.Mesh(conch, shell);
      c.position.set(x, 0.02, z);
      c.rotation.set(Math.PI / 2 - 0.2, 0, a);
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
      const f = 1 + kick * (loud ? 0.45 : 0.2) + Math.sin(t * 19 + i) * 0.06;
      tc.flame.scale.set(1, f, 1);
      tc.core.scale.set(1, f * 0.9, 1);
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
      ep.setXYZ(i, x + dx * 0.08 + Math.sin(u * 9 + i) * 0.06 * u, 1.9 + u * 1.3, z + dz * 0.08);
    });
    ep.needsUpdate = true;
    this.embers.material.opacity = 0.5 + kick * 0.5;
  }
}
