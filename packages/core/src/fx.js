import * as THREE from "three";

export const W = 1080;
export const H = 1920;

export const FinalShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uCA: { value: 0 },
    uShock: { value: new THREE.Vector4(0.5, 0.5, -1, 0) },
    uGlitch: { value: 0 },
    uMirror: { value: 0 },
    uInvert: { value: 0 },
    uZoom: { value: 1 },
    uSat: { value: 1 },
    uPixel: { value: 0 },
    uAspect: { value: W / H },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uCA, uGlitch, uMirror, uInvert, uZoom, uSat, uPixel, uAspect;
    uniform vec4 uShock;
    varying vec2 vUv;
    float h1(float n) { return fract(sin(n * 91.345) * 47453.5453); }
    void main() {
      vec2 uv = vUv;
      uv = (uv - 0.5) / uZoom + 0.5;
      if (uPixel > 0.5) { vec2 cells = vec2(1080.0, 1920.0) / uPixel; uv = (floor(uv * cells) + 0.5) / cells; }
      if (uMirror > 0.5 && uMirror < 1.5) { uv.x = 0.5 - abs(uv.x - 0.5); }
      if (uMirror > 1.5) {
        vec2 p = (uv - 0.5) * vec2(uAspect, 1.0);
        float a = atan(p.y, p.x);
        float r = length(p);
        float seg = 6.2831853 / 6.0;
        a = mod(a + uTime * 0.3, seg);
        a = abs(a - seg * 0.5);
        p = vec2(cos(a), sin(a)) * r;
        uv = p / vec2(uAspect, 1.0) + 0.5;
      }
      if (uShock.z > 0.0) {
        vec2 d = (uv - uShock.xy) * vec2(uAspect, 1.0);
        float dist = length(d);
        float band = exp(-pow((dist - uShock.z) * 14.0, 2.0));
        uv -= normalize(d + 1e-5) / vec2(uAspect, 1.0) * band * uShock.w * 0.06;
      }
      if (uGlitch > 0.0) {
        float row = floor(uv.y * 48.0);
        float r = h1(row + floor(uTime * 24.0) * 7.0);
        if (r < uGlitch * 0.5) uv.x += (h1(row * 3.1 + uTime) - 0.5) * 0.12 * uGlitch;
      }
      vec2 dir = (uv - 0.5);
      float ca = uCA * 0.012 + uGlitch * 0.01;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + dir * ca).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - dir * ca).b;
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(l), col, uSat);
      col = mix(col, vec3(0.05, 0.9, 1.0) * (1.0 - l) * 1.2, uInvert);
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export const HudShader = {
  uniforms: {
    tDiffuse: { value: null },
    tHud: { value: null },
    uFlash: { value: 0 },
    uFlashColor: { value: new THREE.Color(1, 1, 1) },
    uFade: { value: 0 },
    uVignette: { value: 0.35 },
    uGrain: { value: 0.05 },
    uFrame: { value: 0 },
    uHudCA: { value: 0 },
    uScan: { value: 0.0 },
  },
  vertexShader: FinalShader.vertexShader,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse, tHud;
    uniform float uFlash, uFade, uVignette, uGrain, uFrame, uHudCA, uScan;
    uniform vec3 uFlashColor;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + uFrame * 0.618) * 43758.5453); }
    void main() {
      vec3 col = texture2D(tDiffuse, vUv).rgb;
      vec2 huv = vUv;
      vec4 hud = texture2D(tHud, huv);
      if (uHudCA > 0.0) {
        hud.r = texture2D(tHud, huv + vec2(uHudCA * 0.008, 0.0)).r;
        hud.b = texture2D(tHud, huv - vec2(uHudCA * 0.008, 0.0)).b;
      }
      col = col * (1.0 - hud.a) + hud.rgb;
      col += uFlashColor * uFlash;
      vec2 v = vUv - 0.5;
      col *= 1.0 - uVignette * dot(v, v) * 2.4;
      col *= 1.0 - uScan * (0.5 + 0.5 * sin(vUv.y * 1920.0 * 1.5708));
      col += (hash(vUv * 1000.0) - 0.5) * uGrain;
      col *= 1.0 - uFade;
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }
  `,
};

/**
 * Camera-facing glowing ribbon whose centre line is a GLSL function `vec3 path(float u)`.
 * Additional uniforms may be referenced from the path body.
 */
export function makeRibbon({ segments = 256, path, uniforms = {}, width = 0.04, color = "#ffffff", opacity = 1, glow = 1 }) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array((segments + 1) * 2 * 3);
  const u = new Float32Array((segments + 1) * 2);
  const side = new Float32Array((segments + 1) * 2);
  const idx = [];
  for (let i = 0; i <= segments; i++) {
    for (let s = 0; s < 2; s++) {
      u[i * 2 + s] = i / segments;
      side[i * 2 + s] = s ? 1 : -1;
    }
    if (i < segments) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aU", new THREE.BufferAttribute(u, 1));
  geo.setAttribute("aSide", new THREE.BufferAttribute(side, 1));
  geo.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
      uWidth: { value: width },
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity },
      uGlow: { value: glow },
      uReveal: { value: 1 },
      uRevealStart: { value: 0 },
      ...uniforms,
    },
    vertexShader: /* glsl */ `
      attribute float aU;
      attribute float aSide;
      uniform float uTime, uWidth;
      ${Object.keys(uniforms).map((k) => `uniform ${glslType(uniforms[k].value)} ${k};`).join("\n")}
      varying float vU;
      varying float vSide;
      vec3 path(float u) { ${path} }
      void main() {
        vec3 p = path(aU);
        vec3 p2 = path(min(aU + 0.002, 1.0));
        vec3 p1 = path(max(aU - 0.002, 0.0));
        vec3 tang = normalize(p2 - p1 + 1e-6);
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vec3 view = normalize(cameraPosition - wp.xyz);
        vec3 nrm = normalize(cross(mat3(modelMatrix) * tang, view));
        wp.xyz += nrm * aSide * uWidth;
        vU = aU;
        vSide = aSide;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity, uGlow, uReveal, uRevealStart;
      varying float vU;
      varying float vSide;
      void main() {
        if (vU > uReveal || vU < uRevealStart) discard;
        float d = abs(vSide);
        float core = smoothstep(1.0, 0.0, d);
        float hot = smoothstep(0.35, 0.0, d);
        vec3 col = uColor * core * uGlow + vec3(1.0) * hot * 0.6 * uGlow;
        float tip = smoothstep(uReveal, uReveal - 0.02, vU);
        gl_FragColor = vec4(col * uOpacity * tip, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return mesh;
}

function glslType(v) {
  if (typeof v === "number") return "float";
  if (v?.isVector2) return "vec2";
  if (v?.isVector3) return "vec3";
  if (v?.isColor) return "vec3";
  if (v?.isVector4) return "vec4";
  throw new Error("unsupported uniform type");
}

/** Streaking star field travelling toward a camera that moves along -Z. */
export class StarStreaks {
  constructor({ count = 4000, radius = [1.5, 14], depth = 120, color = "#ffffff" } = {}) {
    const geo = new THREE.BufferGeometry();
    const seed = new Float32Array(count * 2 * 4);
    const end = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = radius[0] + Math.pow(Math.random(), 0.7) * (radius[1] - radius[0]);
      const z = Math.random();
      const hue = Math.random();
      for (let e = 0; e < 2; e++) {
        seed.set([Math.cos(a) * r, Math.sin(a) * r, z, hue], (i * 2 + e) * 4);
        end[i * 2 + e] = e;
      }
    }
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 2 * 3), 3));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 4));
    geo.setAttribute("aEnd", new THREE.BufferAttribute(end, 1));
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uCamZ: { value: 0 },
        uDepth: { value: depth },
        uStretch: { value: 0.5 },
        uColor: { value: new THREE.Color(color) },
        uRainbow: { value: 0 },
        uOpacity: { value: 1 },
      },
      vertexShader: /* glsl */ `
        attribute vec4 aSeed;
        attribute float aEnd;
        uniform float uCamZ, uDepth, uStretch;
        varying float vFade;
        varying float vHue;
        void main() {
          float z = uCamZ - mod(aSeed.z * uDepth - uCamZ, uDepth) - 0.5;
          float zz = z - aEnd * uStretch;
          vec3 p = vec3(aSeed.xy, zz);
          vFade = smoothstep(uDepth, uDepth * 0.4, uCamZ - z) * (1.0 - aEnd * 0.9);
          vHue = aSeed.w;
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uRainbow, uOpacity;
        varying float vFade;
        varying float vHue;
        vec3 hsv(float h) { return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
        void main() {
          vec3 c = mix(uColor, hsv(vHue), uRainbow);
          gl_FragColor = vec4(c * vFade * uOpacity, 1.0);
        }
      `,
    });
    this.object = new THREE.LineSegments(geo, this.material);
    this.object.frustumCulled = false;
  }
}

/** Filled pixel coordinates (in shape units) of a list of THREE.Shape, rasterised at `scale` px/unit. */
export function rasterShapes(shapes, viewBox, scale = 12) {
  const [vw, vh] = viewBox;
  const canvas = document.createElement("canvas");
  canvas.width = vw * scale;
  canvas.height = vh * scale;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  for (const shape of shapes) {
    ctx.beginPath();
    for (const pts of [shape.getPoints(24), ...shape.holes.map((h) => h.getPoints(24))]) {
      pts.forEach((p, i) => (i ? ctx.lineTo(p.x * scale, p.y * scale) : ctx.moveTo(p.x * scale, p.y * scale)));
      ctx.closePath();
    }
    ctx.fill("evenodd");
  }
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const filled = [];
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      if (data[(y * canvas.width + x) * 4 + 3] > 128) filled.push((x + 0.5) / scale, (y + 0.5) / scale);
    }
  }
  return filled;
}

export function seededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
