import * as THREE from "three";
import { seededRandom } from "@gizclaw/mvg-core/fx.js";

const NOISE = /* glsl */ `
  float h3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float noise(vec3 x) {
    vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h3(i), h3(i + vec3(1, 0, 0)), f.x), mix(h3(i + vec3(0, 1, 0)), h3(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(h3(i + vec3(0, 0, 1)), h3(i + vec3(1, 0, 1)), f.x), mix(h3(i + vec3(0, 1, 1)), h3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
  vec3 hsv(float h) { return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
`;

const POINT_FRAG = /* glsl */ `
  varying vec3 vColor; varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = 1.0 - smoothstep(0.0, 1.0, d);
    gl_FragColor = vec4(vColor * (a * a + 1.0 - smoothstep(0.0, 0.35, d)) * vAlpha, 1.0);
  }`;

/** Far star sphere and nebula clouds; the group follows the camera so it never gets closer. */
export function makeSky(count = 7000) {
  const rand = seededRandom(7);
  const group = new THREE.Group();
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const tint = [new THREE.Color("#ffffff"), new THREE.Color("#9fc4ff"), new THREE.Color("#ffd9a8"), new THREE.Color("#c9b0ff")];
  for (let i = 0; i < count; i++) {
    const u = rand() * 2 - 1;
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    pos.set([Math.cos(a) * r * 9000, u * 9000, Math.sin(a) * r * 9000], i * 3);
    const c = tint[Math.floor(rand() * tint.length)];
    col.set([c.r, c.g, c.b], i * 3);
    size[i] = 0.6 + Math.pow(rand(), 6) * 3.4;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  geo.setAttribute("size", new THREE.BufferAttribute(size, 1));
  const stars = new THREE.Points(
    geo,
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uPixel: { value: 1 }, uPulse: { value: 0 } },
      vertexShader: /* glsl */ `
        attribute vec3 color; attribute float size;
        uniform float uTime, uPixel, uPulse;
        varying vec3 vColor; varying float vAlpha;
        void main() {
          float tw = 0.65 + 0.35 * sin(uTime * (0.6 + fract(position.x * 0.013) * 2.0) + position.y);
          vColor = color; vAlpha = tw * (0.75 + uPulse * 0.5);
          gl_PointSize = size * uPixel * (2.2 + uPulse * 0.8);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: POINT_FRAG,
    }),
  );
  stars.frustumCulled = false;
  const nebula = new THREE.Mesh(
    new THREE.SphereGeometry(12000, 48, 32),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: { uTime: { value: 0 } },
      vertexShader: "varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: /* glsl */ `
        ${NOISE}
        uniform float uTime; varying vec3 vDir;
        void main() {
          vec3 d = vDir * 2.4;
          float n = fbm(d + vec3(0.0, uTime * 0.004, 0.0));
          float m = fbm(d * 1.7 + 9.0);
          float band = exp(-(vDir.y * 2.2 + sin(vDir.x * 3.0) * 0.3) * (vDir.y * 2.2 + sin(vDir.x * 3.0) * 0.3));
          vec3 c = mix(vec3(0.05, 0.02, 0.14), vec3(0.02, 0.10, 0.20), m);
          c = mix(c, vec3(0.22, 0.05, 0.20), smoothstep(0.55, 0.85, n) * 0.7);
          float k = smoothstep(0.35, 0.8, n) * (0.35 + band * 0.9);
          gl_FragColor = vec4(vec3(0.004, 0.004, 0.016) + c * k * 0.55, 1.0);
        }`,
    }),
  );
  group.add(nebula, stars);
  return { group, stars, nebula };
}

/**
 * A spiral galaxy of point stars. `colors` tint the arms, the bulge is warm
 * white. Points close to the camera fade so the galaxy can be flown into.
 */
export function makeGalaxy({ seed = 1, radius = 340, count = 16000, arms = 3, colors, grey = false, cloud = false }) {
  const rand = seededRandom(seed);
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const palette = colors.map((c) => new THREE.Color(c));
  const core = new THREE.Color("#fff1d6");
  const tmp = new THREE.Color();
  const gauss = () => (rand() + rand() + rand() - 1.5) / 1.5;
  for (let i = 0; i < count; i++) {
    const t = cloud ? 0.25 + rand() * 0.75 : Math.pow(rand(), 1.35);
    const r = 6 + t * radius;
    const arm = Math.floor(rand() * arms);
    const spread = (0.25 + t * 0.5) * (rand() < 0.2 ? 2.4 : 1);
    const a = (arm / arms) * Math.PI * 2 + r * 0.011 + gauss() * spread;
    const thick = 4 + 34 * Math.exp(-r / 45);
    pos.set([Math.cos(a) * r, gauss() * thick, Math.sin(a) * r], i * 3);
    tmp.copy(palette[arm % palette.length]);
    if (!cloud) tmp.lerp(core, Math.exp(-r / 60) * 0.9);
    if (grey) tmp.setScalar((tmp.r + tmp.g + tmp.b) / 3);
    col.set([tmp.r, tmp.g, tmp.b], i * 3);
    size[i] = cloud ? 50 + rand() * 90 : 1.1 + Math.pow(rand(), 5) * 4.5;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  geo.setAttribute("size", new THREE.BufferAttribute(size, 1));
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uPixel: { value: 1 }, uPulse: { value: 0 }, uOpacity: { value: cloud ? 0.07 : 1 }, uMax: { value: cloud ? 900 : 12 }, uNear: { value: cloud ? 160 : 30 } },
    vertexShader: /* glsl */ `
      attribute vec3 color; attribute float size;
      uniform float uPixel, uPulse, uOpacity, uMax, uNear;
      varying vec3 vColor; varying float vAlpha;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float z = -mv.z;
        vColor = color;
        vAlpha = uOpacity * smoothstep(uNear * 0.15, uNear, z) * (0.8 + uPulse * 0.6);
        gl_PointSize = clamp(size * uPixel * 260.0 / max(z, 1.0), 0.0, uMax * uPixel);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: POINT_FRAG,
  });
  const points = new THREE.Points(geo, material);
  points.frustumCulled = false;
  return { points, material };
}

const LOOKS = { gas: 0, rock: 1, ice: 2, lava: 3, grid: 4, swirl: 5, rainbow: 6, facet: 7 };

/**
 * A planet lit by the star at the world origin of its galaxy (`uSun`).
 * `grey` drains the colour for planets whose game is not out yet.
 */
export function makePlanet({ colors, look = "gas", seed = 0, grey = false }) {
  const facet = look === "facet";
  const geo = facet ? new THREE.IcosahedronGeometry(1, 1) : new THREE.SphereGeometry(1, 64, 48);
  const [a, b, c] = colors.map((x) => new THREE.Color(x));
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uA: { value: a },
      uB: { value: b },
      uC: { value: c },
      uLook: { value: LOOKS[look] ?? 0 },
      uSeed: { value: seed },
      uSat: { value: grey ? 0.0 : 1.0 },
      uTime: { value: 0 },
      uSun: { value: new THREE.Vector3() },
      uPulse: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vObj, vWorld, vNormal;
      void main() {
        vObj = position;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        vNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      ${NOISE}
      uniform vec3 uA, uB, uC, uSun;
      uniform float uSeed, uSat, uTime, uPulse;
      uniform int uLook;
      varying vec3 vObj, vWorld, vNormal;
      void main() {
        vec3 p = normalize(vObj);
        vec3 q = p + uSeed * 3.17;
        vec3 n = normalize(vNormal);
        vec3 col; float glow = 0.0;
        if (uLook == 0) {
          float w = p.y * 7.0 + fbm(q * 2.5 + vec3(uTime * 0.03, 0.0, 0.0)) * 3.0;
          col = mix(mix(uA, uB, 0.5 + 0.5 * sin(w)), uC, smoothstep(0.6, 1.0, sin(w * 0.47 + 1.3)) * 0.6);
        } else if (uLook == 1) {
          float h = fbm(q * 3.0);
          col = mix(uC, uA, smoothstep(0.42, 0.6, h));
          col = mix(col, uB, smoothstep(0.62, 0.75, fbm(q * 7.0)) * 0.7);
        } else if (uLook == 2) {
          float h = fbm(q * 2.2);
          col = mix(uA, vec3(0.92, 0.97, 1.0), smoothstep(0.35, 0.7, h));
          float crack = 1.0 - smoothstep(0.0, 0.03, abs(fbm(q * 6.0) - 0.5));
          col = mix(col, uB, crack * 0.8); glow = crack * 0.25;
        } else if (uLook == 3) {
          float h = fbm(q * 3.2 + vec3(0.0, uTime * 0.02, 0.0));
          float crack = 1.0 - smoothstep(0.0, 0.06, abs(h - 0.5));
          col = mix(vec3(0.08, 0.04, 0.05), uC * 0.35, fbm(q * 8.0));
          col = mix(col, mix(uA, uB, crack), crack); glow = crack * (1.1 + uPulse);
        } else if (uLook == 4) {
          float lat = asin(p.y) * 12.0 / 3.14159; float lon = atan(p.z, p.x) * 12.0 / 3.14159;
          vec2 g = abs(fract(vec2(lat, lon)) - 0.5);
          float line = 1.0 - smoothstep(0.0, 0.06, min(g.x, g.y) - 0.42);
          float bit = step(0.5, h3(floor(vec3(lat, lon, uSeed)) + floor(uTime * 1.5)));
          col = mix(uC, uC * 1.6, bit * 0.6); col = mix(col, uA, line); glow = line * 0.6 + bit * 0.15 * uPulse;
        } else if (uLook == 5) {
          float a = atan(p.z, p.x) + p.y * 5.0 + fbm(q * 2.0) * 2.0 - uTime * 0.05;
          col = mix(uA, uB, 0.5 + 0.5 * sin(a * 3.0)); col = mix(col, uC, smoothstep(0.7, 1.0, sin(a * 1.5 + p.y * 4.0)) * 0.7);
        } else if (uLook == 6) {
          float h = p.y * 0.55 + fbm(q * 2.0 + vec3(uTime * 0.04)) * 0.35 + uTime * 0.02;
          col = hsv(fract(h)) * 0.8 + 0.06; glow = 0.04 + uPulse * 0.2;
        } else {
          float f = h3(floor(vObj * 40.0) + uSeed);
          col = mix(mix(uA, uB, f), uC, step(0.8, f));
        }
        float l = dot(col, vec3(0.299, 0.587, 0.114));
        col = mix(vec3(l) * 0.75, col, uSat);
        glow *= uSat;
        vec3 L = normalize(uSun - vWorld);
        vec3 V = normalize(cameraPosition - vWorld);
        float diff = max(dot(n, L), 0.0);
        float rim = pow(1.0 - max(dot(n, V), 0.0), 3.0);
        vec3 atmo = mix(vec3(dot(uA, vec3(0.333))), uA, uSat);
        vec3 c = col * (0.1 + diff * 1.05) + col * glow + atmo * rim * (0.35 + diff * 0.9);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(geo, material);
  return { mesh, material };
}

/** Banded ring around a planet, lit only by its own colour. */
export function makeRing(color, grey = false) {
  const geo = new THREE.RingGeometry(1.45, 2.4, 128, 1);
  const material = new THREE.ShaderMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    uniforms: { uColor: { value: new THREE.Color(color) }, uSat: { value: grey ? 0 : 1 } },
    vertexShader: "varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uSat; varying vec3 vP;
      void main() {
        float r = length(vP.xy);
        float b = 0.55 + 0.45 * sin(r * 38.0) * sin(r * 11.0 + 1.0);
        float edge = smoothstep(1.45, 1.55, r) * (1.0 - smoothstep(2.25, 2.4, r));
        vec3 c = mix(vec3(dot(uColor, vec3(0.333))), uColor, uSat);
        gl_FragColor = vec4(c * b, edge * b * 0.75);
      }`,
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.rotation.x = -Math.PI / 2 + 0.42;
  return { mesh, material };
}

/** Thin circle in the galaxy plane. */
export function makeOrbit(radius) {
  const pts = [];
  for (let i = 0; i <= 256; i++) {
    const a = (i / 256) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
  }
  const material = new THREE.LineBasicMaterial({ color: "#8fb4ff", transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false });
  return { line: new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), material), material };
}

/** The galaxy's central star. */
export function makeSun(color = "#ffe2a8") {
  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPulse: { value: 0 }, uColor: { value: new THREE.Color(color) } },
    vertexShader: "varying vec3 vP, vN, vW; void main(){ vP = position; vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }",
    fragmentShader: /* glsl */ `
      ${NOISE}
      uniform float uTime, uPulse; uniform vec3 uColor; varying vec3 vP, vN, vW;
      void main() {
        float n = fbm(normalize(vP) * 4.0 + vec3(uTime * 0.08));
        float rim = pow(1.0 - max(dot(normalize(vN), normalize(cameraPosition - vW)), 0.0), 2.0);
        vec3 c = mix(uColor * 0.9, vec3(1.1, 0.9, 0.7), n) + rim * uColor * 0.6;
        gl_FragColor = vec4(c * (0.8 + uPulse * 0.5), 1.0);
      }`,
  });
  return { mesh: new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), material), material };
}

/** A thin glowing circle sprite texture for selection markers. */
export function ringTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  g.strokeStyle = "rgba(255,255,255,0.95)";
  g.shadowColor = "#ffffff";
  g.shadowBlur = 14;
  g.lineWidth = 5;
  g.setLineDash([22, 14]);
  g.beginPath();
  g.arc(128, 128, 104, 0, Math.PI * 2);
  g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Hyperspace streaks in camera space; add it to the camera. `uSpeed` 0..1
 * fades and stretches them, `uTime` should advance faster while warping.
 */
export function makeWarp(count = 1600, depth = 420) {
  const rand = seededRandom(3);
  const seed = new Float32Array(count * 2 * 4);
  const end = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const a = rand() * Math.PI * 2;
    const r = 9 + Math.pow(rand(), 0.6) * 60;
    const z = rand();
    const hue = rand();
    for (let e = 0; e < 2; e++) {
      seed.set([Math.cos(a) * r, Math.sin(a) * r, z, hue], (i * 2 + e) * 4);
      end[i * 2 + e] = e;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 2 * 3), 3));
  geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 4));
  geo.setAttribute("aEnd", new THREE.BufferAttribute(end, 1));
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uSpeed: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute vec4 aSeed; attribute float aEnd;
      uniform float uTime, uSpeed;
      varying float vA; varying float vHue;
      void main() {
        float z = -(${depth.toFixed(1)} - mod(aSeed.z * ${depth.toFixed(1)} + uTime, ${depth.toFixed(1)})) - 2.0;
        z -= aEnd * (4.0 + uSpeed * 140.0);
        vA = (1.0 - aEnd) * smoothstep(-${depth.toFixed(1)}, -${(depth * 0.6).toFixed(1)}, z) * uSpeed;
        vHue = aSeed.w;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(aSeed.xy, z, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying float vA; varying float vHue;
      vec3 hsv(float h) { return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
      void main() { gl_FragColor = vec4(mix(vec3(0.75, 0.9, 1.0), hsv(vHue), 0.5) * vA * 0.55, 1.0); }`,
  });
  const object = new THREE.LineSegments(geo, material);
  object.frustumCulled = false;
  object.renderOrder = 10;
  return { object, material };
}

/** An expanding ring in the galaxy plane, fired on kicks. Scale it and fade `uLife` from 1 to 0. */
export function makeShock() {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: new THREE.Color() }, uLife: { value: 0 } },
    vertexShader: "varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uLife; varying vec2 vP;
      void main() {
        float r = length(vP);
        float band = smoothstep(0.955, 0.99, r) * (1.0 - smoothstep(0.99, 1.0, r));
        float trail = smoothstep(0.7, 0.99, r) * (1.0 - smoothstep(0.97, 1.0, r)) * 0.12;
        gl_FragColor = vec4(uColor * (band + trail) * uLife * uLife, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.RingGeometry(0.5, 1, 160, 1), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.visible = false;
  return { mesh, material, life: 0 };
}

/** Swirling hot disc around the central star, in the galaxy plane. */
export function makeAccretion(color) {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uPulse: { value: 0 }, uColor: { value: new THREE.Color(color) } },
    vertexShader: "varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: /* glsl */ `
      ${NOISE}
      uniform float uTime, uPulse; uniform vec3 uColor; varying vec2 vP;
      void main() {
        float r = length(vP);
        float a = atan(vP.y, vP.x);
        float b = a + uTime * 1.2 / (r * r) + r * 1.4;
        float swirl = fbm(vec3(cos(b) * r * 1.6, sin(b) * r * 1.6, r * 2.5));
        float fall = smoothstep(1.0, 1.4, r) * (1.0 - smoothstep(1.8, 4.6, r));
        vec3 hot = mix(vec3(1.4, 1.1, 0.8), uColor, smoothstep(1.4, 4.0, r));
        float k = fall * (0.12 + swirl * swirl * 0.9) * (0.6 + uPulse * 0.7);
        gl_FragColor = vec4(hot * k, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.RingGeometry(1, 4.8, 160, 8), material);
  mesh.rotation.x = -Math.PI / 2;
  return { mesh, material };
}

/** A tall fading light column above a playable planet. */
export function makeBeacon(color) {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: new THREE.Color(color) }, uTime: { value: 0 }, uPulse: { value: 0 } },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uTime, uPulse; varying vec2 vUv;
      void main() {
        float fade = pow(clamp(1.0 - vUv.y, 0.0, 1.0), 1.6);
        float edge = sin(vUv.x * 3.14159); edge *= edge;
        float scan = 0.65 + 0.35 * sin(vUv.y * 40.0 - uTime * 6.0);
        gl_FragColor = vec4(mix(uColor, vec3(1.0), 0.3) * fade * edge * scan * (0.35 + uPulse * 0.9), 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 32, 1, true), material);
  mesh.geometry.translate(0, 0.5, 0);
  return { mesh, material };
}

/** A pool of shooting stars; `spawn` launches one across the view of `camera`. */
export function makeShootingStars(n = 6) {
  const pos = new Float32Array(n * 2 * 3);
  const col = new Float32Array(n * 2 * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const object = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  object.frustumCulled = false;
  const stars = Array.from({ length: n }, () => ({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), len: 0 }));
  const fwd = new THREE.Vector3();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  let head = 0;
  return {
    object,
    spawn(camera, dist) {
      const s = stars[head];
      head = (head + 1) % n;
      camera.getWorldDirection(fwd);
      right.crossVectors(fwd, camera.up).normalize();
      up.crossVectors(right, fwd).normalize();
      const a = Math.random() * Math.PI * 2;
      s.p.copy(camera.position).addScaledVector(fwd, dist).addScaledVector(right, (Math.random() - 0.5) * dist * 1.4).addScaledVector(up, (Math.random() * 0.8 - 0.1) * dist * 0.7);
      s.v.copy(right).multiplyScalar(Math.cos(a)).addScaledVector(up, -Math.abs(Math.sin(a)) * 0.6).normalize().multiplyScalar(dist * 1.6);
      s.len = dist * 0.18;
      s.life = 1;
    },
    update(dt) {
      stars.forEach((s, i) => {
        s.life = Math.max(0, s.life - dt * 1.4);
        s.p.addScaledVector(s.v, dt);
        const k = Math.sin(s.life * Math.PI);
        pos.set([s.p.x, s.p.y, s.p.z], i * 6);
        const t = s.v.clone().normalize().multiplyScalar(-s.len);
        pos.set([s.p.x + t.x, s.p.y + t.y, s.p.z + t.z], i * 6 + 3);
        col.set([k, k, k * 1.1, 0, 0, 0], i * 6);
      });
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
    },
  };
}
