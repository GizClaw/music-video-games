import * as THREE from "three";
import { hash } from "@gizclaw/mvg-core/timing.js";
import { STAGE_R } from "./constants.js";

export const NOISE = /* glsl */ `
  float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1, 0)), u.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p *= 2.03; a *= 0.5; } return s; }
  vec3 hsv(float h) { return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
  vec3 pastel(float h) { return mix(hsv(h), vec3(1.0), 0.35); }
  // Cell id and distance to the nearest cell edge.
  vec3 voronoi(vec2 x) {
    vec2 n = floor(x), f = fract(x), mg, mr;
    float md = 8.0;
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(i, j);
      vec2 o = vec2(h21(n + g), h21(n + g + 17.0));
      vec2 r = g + o - f;
      float d = dot(r, r);
      if (d < md) { md = d; mr = r; mg = g; }
    }
    md = 8.0;
    for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) {
      vec2 g = mg + vec2(i, j);
      vec2 o = vec2(h21(n + g), h21(n + g + 17.0));
      vec2 r = g + o - f;
      if (dot(mr - r, mr - r) > 0.00001) md = min(md, dot(0.5 * (mr + r), normalize(r - mr)));
    }
    return vec3(n + mg, md);
  }
`;

const VERT_WORLD = /* glsl */ `
  varying vec3 vW; varying vec3 vDir;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vW = w.xyz; vDir = normalize(w.xyz - cameraPosition);
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;

export const INK = new THREE.Color("#1c2547");

/** Three-band ramp shared by the cartoon materials. */
export const RAMP = (() => {
  const t = new THREE.DataTexture(new Uint8Array([120, 120, 135, 255, 205, 205, 210, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
})();

/** Inked back-face shell, scaled up around a convex mesh. */
export function inkShell(mesh, grow = 1.04) {
  const shell = new THREE.Mesh(mesh.geometry, new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide }));
  shell.scale.setScalar(grow);
  mesh.add(shell);
  return shell;
}

export const MOON_DIR = new THREE.Vector3(-0.38, 0.5, -1).normalize();

/** Storybook night sky: bright blue-violet gradient, sparkly stars, an inked moon and pastel aurora. */
export function makeSky() {
  const uniforms = {
    uTime: { value: 0 },
    uAurora: { value: 0.8 },
    uHue: { value: 0 },
    uRainbow: { value: 0 },
    uPulse: { value: 0 },
    uStars: { value: 1 },
    uMoon: { value: MOON_DIR.clone() },
    uDim: { value: 1 },
  };
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(300, 64, 32),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms,
      vertexShader: /* glsl */ `varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uTime, uAurora, uHue, uRainbow, uPulse, uStars, uDim; uniform vec3 uMoon;
        varying vec3 vD;
        ${NOISE}
        void main() {
          vec3 d = normalize(vD);
          float el = d.y;
          vec3 col = mix(vec3(0.36, 0.46, 0.9), vec3(0.14, 0.2, 0.56), smoothstep(-0.02, 0.45, el));
          col += vec3(0.5, 0.3, 0.45) * exp(-abs(el) * 12.0) * 0.22;
          col = mix(col, vec3(0.32, 0.45, 0.8), smoothstep(0.0, -0.2, el));
          // Stars: dots and a few four-point sparkles.
          vec2 sp = vec2(atan(d.x, -d.z) * 70.0, el * 70.0 / max(0.25, sqrt(1.0 - el * el)));
          vec2 cell = floor(sp);
          float h = h21(cell);
          if (h > 0.9 && el > 0.05) {
            vec2 c = cell + 0.5 + (vec2(h21(cell + 3.1), h21(cell + 7.7)) - 0.5) * 0.5;
            vec2 o = sp - c;
            float tw = 0.6 + 0.4 * sin(uTime * (1.5 + h * 4.0) + h * 60.0);
            float big = step(0.975, h);
            float dot1 = smoothstep(0.16, 0.08, length(o));
            float spark = big * (smoothstep(0.06, 0.0, abs(o.x)) * smoothstep(0.45, 0.0, abs(o.y)) + smoothstep(0.06, 0.0, abs(o.y)) * smoothstep(0.45, 0.0, abs(o.x)));
            col = mix(col, vec3(1.0, 0.97, 0.85), clamp(dot1 + spark, 0.0, 1.0) * tw * uStars);
          }
          // Pastel aurora ribbons, strongest toward -z.
          float az = atan(d.x, -d.z);
          float face = 0.35 + 0.65 * smoothstep(-0.2, 0.8, -d.z);
          vec3 ac = vec3(0.0);
          for (int i = 0; i < 3; i++) {
            float fi = float(i);
            float x = az * (2.2 + fi * 0.7) + fi * 1.7;
            float wave = sin(x * 1.4 + uTime * 0.22 + fi) * 0.05 + (vnoise(vec2(x * 1.6, uTime * 0.12 + fi * 5.0)) - 0.5) * 0.12;
            float hh = el - (0.16 + fi * 0.08 + wave);
            float band = smoothstep(-0.012, 0.012, hh) * exp(-max(hh, 0.0) * (6.0 + fi * 2.0));
            float rays = 0.6 + 0.4 * vnoise(vec2(x * 14.0 + uTime * 0.5, fi * 9.0));
            vec3 c = mix(vec3(0.35, 0.95, 0.72), vec3(0.95, 0.45, 0.9), smoothstep(0.0, 0.2, max(hh, 0.0)) + fi * 0.15);
            c = mix(c, pastel(fract(az * 0.25 + uTime * 0.05 + fi * 0.2 + uHue)), uRainbow);
            ac += c * band * rays;
          }
          col = mix(col, ac / max(1.0, max(ac.r, max(ac.g, ac.b))), clamp(length(ac) * 0.45 * uAurora * face * (0.85 + 0.3 * uPulse), 0.0, 0.6));
          // Moon: a flat cream disc with an inked rim.
          float m = acos(clamp(dot(d, normalize(uMoon)), -1.0, 1.0));
          float R = 0.06;
          vec2 mp = vec2(d.x - uMoon.x, d.y - uMoon.y) * 40.0;
          vec3 moon = vec3(1.0, 0.95, 0.78) - vec3(0.12, 0.1, 0.02) * step(0.62, vnoise(mp * 1.2 + 3.0));
          col = mix(col, vec3(0.75, 0.8, 1.0), smoothstep(R * 2.6, R, m) * 0.25);
          col = mix(col, ${`vec3(${INK.r.toFixed(3)}, ${INK.g.toFixed(3)}, ${INK.b.toFixed(3)})`}, smoothstep(R + 0.006, R + 0.003, m));
          col = mix(col, moon, smoothstep(R + 0.001, R - 0.002, m));
          gl_FragColor = vec4(col * uDim, 1.0);
        }`,
    }),
  );
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return { mesh, uniforms };
}

/** Ice floe stage: pale ice plates with inked cracks that light up in pastel like a disco floor. */
export function makeStage() {
  const uniforms = {
    uTime: { value: 0 },
    uBeat: { value: 0 },
    uPulse: { value: 0 },
    uDisco: { value: 0 },
    uHue: { value: 0 },
    uDim: { value: 1 },
    uRim: { value: 1 },
    uSpots: { value: Array.from({ length: 16 }, () => new THREE.Vector4(0, 0, 0, 0)) },
    uFreeze: { value: 0 },
  };
  const top = new THREE.Mesh(
    new THREE.CircleGeometry(STAGE_R, 128),
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: VERT_WORLD,
      fragmentShader: /* glsl */ `
        uniform float uTime, uBeat, uPulse, uDisco, uHue, uDim, uRim, uFreeze; uniform vec4 uSpots[16];
        varying vec3 vW; varying vec3 vDir;
        ${NOISE}
        void main() {
          vec2 p = vW.xz;
          float r = length(p);
          vec3 v = voronoi(p * 1.15);
          float edge = smoothstep(0.045, 0.02, v.z);
          float plate = h21(v.xy);
          vec3 col = mix(vec3(0.66, 0.84, 0.97), vec3(0.84, 0.95, 1.0), plate);
          col *= 0.9 + 0.1 * smoothstep(-6.0, 4.0, -p.y);
          // Cartoon glints along each plate.
          float glint = smoothstep(0.92, 0.95, vnoise(p * 3.0 + plate * 9.0)) * smoothstep(0.12, 0.25, v.z);
          col = mix(col, vec3(1.0), glint * 0.8);
          // Disco: plates take a pastel colour on the beat.
          float pick = h21(v.xy + floor(uBeat) * 1.37);
          float on = step(0.6, pick) * uDisco;
          vec3 dc = pastel(fract(plate * 0.6 + uHue + floor(uBeat) * 0.13));
          col = mix(col, dc, clamp(on * (0.55 + 0.3 * uPulse), 0.0, 0.9));
          for (int i = 0; i < 16; i++) {
            vec4 s = uSpots[i];
            if (s.z <= 0.0) continue;
            float d = length(p - s.xy);
            vec3 sc = pastel(s.w);
            col = mix(col, sc, clamp(s.z * exp(-d * d * 7.0), 0.0, 0.8));
            col = mix(col, sc * 0.75, clamp(s.z * smoothstep(0.045, 0.0, abs(d - 0.45 - (1.0 - s.z) * 0.6)), 0.0, 1.0));
          }
          col = mix(col, vec3(0.9, 0.98, 1.0), uFreeze * 0.5);
          vec3 ink = mix(vec3(0.32, 0.52, 0.82), mix(vec3(0.32, 0.52, 0.82), dc * 0.7, uDisco * 0.6), on);
          col = mix(col, mix(ink, vec3(0.6, 0.95, 1.0), uFreeze), edge * 0.85);
          float rimLine = smoothstep(0.05, 0.02, abs(r - ${(STAGE_R - 0.06).toFixed(2)}));
          col = mix(col, vec3(1.0), smoothstep(0.22, 0.1, abs(r - ${(STAGE_R - 0.32).toFixed(2)})) * 0.5 * uRim);
          col = mix(col, ${`vec3(${INK.r.toFixed(3)}, ${INK.g.toFixed(3)}, ${INK.b.toFixed(3)})`}, rimLine);
          gl_FragColor = vec4(col * uDim, 1.0);
        }`,
    }),
  );
  top.rotation.x = -Math.PI / 2;
  const side = new THREE.Mesh(
    new THREE.CylinderGeometry(STAGE_R, STAGE_R * 0.94, 0.9, 128, 1, true),
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: VERT_WORLD,
      fragmentShader: /* glsl */ `
        uniform float uDim; varying vec3 vW; varying vec3 vDir;
        ${NOISE}
        void main() {
          float k = smoothstep(-0.9, 0.0, vW.y);
          vec3 col = mix(vec3(0.22, 0.48, 0.8), vec3(0.7, 0.9, 1.0), step(0.45, k) * 0.6 + k * 0.4);
          col = mix(col, vec3(0.95, 1.0, 1.0), step(0.85, k));
          gl_FragColor = vec4(col * uDim, 1.0);
        }`,
    }),
  );
  side.position.y = -0.45;
  const group = new THREE.Group();
  group.add(top, side);
  return { group, uniforms };
}

/** Cartoon polar sea with white wave dashes. */
export function makeSea() {
  const uniforms = { uTime: { value: 0 }, uAurora: { value: 0.8 }, uDim: { value: 1 }, uRainbow: { value: 0 } };
  const mesh = new THREE.Mesh(
    new THREE.RingGeometry(STAGE_R - 0.2, 280, 128, 8),
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: VERT_WORLD,
      fragmentShader: /* glsl */ `
        uniform float uTime, uAurora, uDim, uRainbow; varying vec3 vW; varying vec3 vDir;
        ${NOISE}
        void main() {
          vec2 p = vW.xz;
          float dist = length(p - cameraPosition.xz);
          vec3 col = mix(vec3(0.16, 0.38, 0.72), vec3(0.22, 0.46, 0.8), vnoise(p * 0.2 + uTime * 0.05));
          vec2 q = vec2(p.x * 0.6 + sin(p.y * 0.8 + uTime) * 0.4, p.y * 2.2 - uTime * 0.6);
          float dash = step(0.82, vnoise(q)) * step(0.5, fract(q.x * 0.35));
          col = mix(col, vec3(0.85, 0.95, 1.0), dash * (1.0 - smoothstep(10.0, 40.0, dist)) * 0.8);
          vec2 md = normalize(vec2(-0.38, -1.0));
          float lane = exp(-pow(dot(normalize(p - cameraPosition.xz), vec2(-md.y, md.x)) * 7.0, 2.0)) * step(0.0, dot(p - cameraPosition.xz, md));
          col = mix(col, vec3(1.0, 0.95, 0.75), lane * step(0.7, vnoise(q * 1.7)) * 0.8);
          col = mix(col, vec3(0.36, 0.46, 0.9), smoothstep(40.0, 200.0, dist));
          gl_FragColor = vec4(col * uDim, 1.0);
        }`,
    }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -0.32;
  return { mesh, uniforms };
}

/** Faceted cartoon icebergs on the horizon. */
export function makeBergs() {
  const group = new THREE.Group();
  const material = new THREE.MeshToonMaterial({ color: "#e6f5ff", gradientMap: RAMP });
  const spots = [[-44, -70, 7, 1.3], [30, -92, 10, 1.0], [70, -50, 6, 1.6], [-80, -30, 8, 0.9], [-12, -118, 12, 0.8], [56, 36, 6, 1.2], [-56, 50, 7, 1.4], [10, 80, 9, 1.0]];
  spots.forEach(([x, z, s, tall], k) => {
    const geo = new THREE.IcosahedronGeometry(1, 1);
    const pos = geo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const n = hash(Math.round(v.x * 50) * 0.37 + Math.round(v.y * 50) * 1.71 + Math.round(v.z * 50) * 2.93 + k * 9.1);
      v.multiplyScalar(0.85 + n * 0.3);
      if (v.y < 0) v.y *= 0.2;
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, -0.5, z);
    m.scale.set(s, s * tall, s * (0.8 + hash(k) * 0.4));
    m.rotation.y = hash(k * 3.3) * 6.28;
    inkShell(m, 1.035);
    group.add(m);
  });
  return { group, material };
}

function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.2, "rgba(255,255,255,0.55)");
  grad.addColorStop(0.5, "rgba(255,255,255,0.12)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
export const GLOW = glowTexture();

/** Inked ice-crystal lamps standing round the stage rim. */
export function makeLamps(n, radius) {
  const group = new THREE.Group();
  const crystal = new THREE.OctahedronGeometry(0.2, 0);
  const baseMat = new THREE.MeshToonMaterial({ color: "#bfe6ff", gradientMap: RAMP });
  const lamps = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2 + Math.PI / n;
    const holder = new THREE.Group();
    holder.position.set(Math.sin(a) * radius, 0, Math.cos(a) * radius);
    const mat = new THREE.MeshBasicMaterial({ color: "#ffffff" });
    const gem = new THREE.Mesh(crystal, mat);
    gem.scale.set(1, 2.6, 1);
    gem.position.y = 0.62;
    inkShell(gem, 1.14);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, 0.2, 6), baseMat);
    base.position.y = 0.1;
    inkShell(base, 1.08);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: "#ffffff", transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.position.y = 0.62;
    halo.scale.setScalar(1.4);
    holder.add(gem, base, halo);
    group.add(holder);
    return { holder, gem, mat, halo, angle: a };
  });
  return { group, lamps };
}

/** Falling snow around a moving centre; `uT` can stop it in mid-air. */
export function makeSnow(count = 1500) {
  const geo = new THREE.BufferGeometry();
  const seed = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) seed.set([Math.random() * 2 - 1, Math.random(), Math.random() * 2 - 1, Math.random()], i * 4);
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 4));
  const uniforms = { uT: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(9, 8, 9) }, uOpacity: { value: 0.8 }, uSize: { value: 1 }, uColor: { value: new THREE.Color("#ffffff") } };
  const points = new THREE.Points(
    geo,
    new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        attribute vec4 aSeed; uniform float uT, uSize; uniform vec3 uCenter, uBox;
        varying float vA;
        void main() {
          float H = uBox.y * 2.0;
          float y = mod(aSeed.y * H - uT * (0.5 + aSeed.w * 0.7), H) - uBox.y;
          vec3 p = uCenter + vec3(aSeed.x * uBox.x + sin(uT * 0.7 + aSeed.w * 30.0) * 0.3, y, aSeed.z * uBox.z + cos(uT * 0.5 + aSeed.w * 20.0) * 0.3);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = uSize * (2.5 + aSeed.w * 4.5) * (12.0 / -mv.z);
          vA = smoothstep(uBox.y, uBox.y * 0.6, abs(y));
        }`,
      fragmentShader: /* glsl */ `
        uniform float uOpacity; uniform vec3 uColor; varying float vA;
        void main() { float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(uColor, smoothstep(0.5, 0.35, d) * vA * uOpacity); }`,
    }),
  );
  points.frustumCulled = false;
  return { points, uniforms };
}

/** CPU spark bursts; each burst is { t0, pos: [x,y,z], color, speed, life, gravity, count, seed }. */
export class Sparks {
  constructor(max = 2400) {
    this.max = max;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(max * 3), 3));
    geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(max * 3), 3));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.11, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, map: GLOW }));
    this.points.frustumCulled = false;
    this.c = new THREE.Color();
  }

  update(t, bursts) {
    const pos = this.points.geometry.attributes.position;
    const col = this.points.geometry.attributes.color;
    let n = 0;
    for (const b of bursts) {
      const age = t - b.t0;
      const life = b.life ?? 1.2;
      if (age < 0 || age > life) continue;
      const count = b.count ?? 40;
      for (let s = 0; s < count && n < this.max; s++, n++) {
        const seed = (b.seed ?? 0) * 131 + s;
        const th = hash(seed * 1.3) * Math.PI * 2;
        const ph = Math.acos(hash(seed * 2.9) * 2 - 1);
        const sp = (b.speed ?? 2) * (0.5 + hash(seed * 4.7) * 0.7);
        const r = (sp * (1 - Math.exp(-age * 3.5))) / 1.2;
        const up = b.up ?? 0;
        pos.setXYZ(n, b.pos[0] + Math.sin(ph) * Math.cos(th) * r, b.pos[1] + (Math.cos(ph) + up) * r - age * age * (b.gravity ?? 1.2), b.pos[2] + Math.sin(ph) * Math.sin(th) * r);
        const fade = Math.max(0, 1 - age / life);
        this.c.set(Array.isArray(b.color) ? b.color[s % b.color.length] : b.color).multiplyScalar(0.9 * fade * (0.6 + 0.4 * Math.sin(age * 30 + s)));
        col.setXYZ(n, this.c.r, this.c.g, this.c.b);
      }
    }
    for (let i = n; i < this.max; i++) {
      pos.setXYZ(i, 0, -999, 0);
      col.setXYZ(i, 0, 0, 0);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    this.points.geometry.setDrawRange(0, Math.max(1, n));
  }
}

/** Disco spotlight cones hanging above the stage. */
export function makeBeams(n = 5) {
  const geo = new THREE.CylinderGeometry(0.05, 1.3, 12, 32, 1, true);
  geo.translate(0, -6, 0);
  return Array.from({ length: n }, () => {
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: { uColor: { value: new THREE.Color("#ffffff") }, uOpacity: { value: 0 } },
      vertexShader: /* glsl */ `varying float vY; varying vec3 vN; varying vec3 vV; void main(){ vY = position.y; vec4 w = modelMatrix * vec4(position,1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */ `uniform vec3 uColor; uniform float uOpacity; varying float vY; varying vec3 vN; varying vec3 vV;
        void main(){ float along = smoothstep(-12.0, -1.0, vY) * smoothstep(0.0, -0.6, vY); float edge = pow(abs(dot(vN, vV)), 1.5); gl_FragColor = vec4(uColor * along * edge * uOpacity * 0.14, 1.0); }`,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    return mesh;
  });
}

/** Simple flapping seabird silhouette. */
export function makeBird() {
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: INK, side: THREE.DoubleSide });
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 8), mat);
  body.scale.set(0.12, 0.1, 0.45);
  group.add(body);
  const wing = new THREE.BufferGeometry();
  wing.setAttribute("position", new THREE.BufferAttribute(new Float32Array([0, 0, 0.2, 0, 0, -0.15, 1.1, 0, -0.05]), 3));
  wing.computeVertexNormals();
  const wings = [-1, 1].map((s) => {
    const w = new THREE.Mesh(wing, mat);
    w.scale.x = s;
    group.add(w);
    return w;
  });
  return { group, wings };
}
