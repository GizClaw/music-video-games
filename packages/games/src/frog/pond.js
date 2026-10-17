import * as THREE from "three";
import { hash } from "@gizclaw/mvg-core/timing.js";
import { INK, OUTLINE, RAMP, SPHERE, part, toon, vec } from "./toon.js";

export const NOISE = /* glsl */ `
  float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1, 0)), u.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), u.x), u.y);
  }
`;

/** Where the low sun sits, seen from the pond. */
export const SUN_DIR = new THREE.Vector3(0.35, 0.16, -1).normalize();

/** Storybook sunset sky that deepens toward night (`uNight`), with an inked sun and stars. */
export function makeSky({ sun = 0.11 } = {}) {
  const uniforms = { uTime: { value: 0 }, uNight: { value: 0 }, uSun: { value: SUN_DIR.clone() }, uPulse: { value: 0 }, uSunR: { value: sun } };
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(300, 64, 32),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms,
      vertexShader: /* glsl */ `varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uTime, uNight, uPulse, uSunR; uniform vec3 uSun; varying vec3 vD;
        ${NOISE}
        void main() {
          vec3 d = normalize(vD);
          float el = d.y;
          vec3 top = mix(vec3(0.42, 0.48, 0.92), vec3(0.14, 0.18, 0.5), uNight);
          vec3 mid = mix(vec3(1.0, 0.62, 0.72), vec3(0.52, 0.36, 0.72), uNight);
          vec3 low = mix(vec3(1.0, 0.8, 0.5), vec3(0.95, 0.55, 0.5), uNight);
          vec3 col = mix(low, mid, smoothstep(0.0, 0.18, el));
          col = mix(col, top, smoothstep(0.15, 0.6, el));
          col = mix(col, low * 0.9, smoothstep(0.0, -0.1, el));
          float s = dot(d, normalize(uSun));
          col += vec3(1.0, 0.75, 0.4) * pow(max(s, 0.0), 12.0) * 0.35 * (1.0 - uNight * 0.6);
          float m = acos(clamp(s, -1.0, 1.0));
          float R = uSunR * (1.0 + uPulse * 0.03);
          col = mix(col, vec3(1.0, 0.86, 0.45), smoothstep(R * 2.2, R, m) * 0.25);
          col = mix(col, ${vec(INK)}, smoothstep(R + 0.008, R + 0.004, m) * (1.0 - uNight * 0.5));
          col = mix(col, mix(vec3(1.0, 0.82, 0.35), vec3(1.0, 0.6, 0.4), uNight), smoothstep(R + 0.001, R - 0.003, m) * (1.0 - uNight * 0.5));
          // Stars come out as the sun sets.
          vec2 sp = vec2(atan(d.x, -d.z) * 70.0, el * 70.0 / max(0.25, sqrt(1.0 - el * el)));
          vec2 cell = floor(sp);
          float h = h21(cell);
          if (h > 0.9 && el > 0.12) {
            vec2 o = sp - cell - 0.5 - (vec2(h21(cell + 3.1), h21(cell + 7.7)) - 0.5) * 0.5;
            float tw = 0.6 + 0.4 * sin(uTime * (1.5 + h * 4.0) + h * 60.0);
            float big = step(0.975, h);
            float star = smoothstep(0.16, 0.08, length(o)) + big * (smoothstep(0.06, 0.0, abs(o.x)) * smoothstep(0.45, 0.0, abs(o.y)) + smoothstep(0.06, 0.0, abs(o.y)) * smoothstep(0.45, 0.0, abs(o.x)));
            col = mix(col, vec3(1.0, 0.97, 0.85), clamp(star, 0.0, 1.0) * tw * smoothstep(0.25, 0.8, uNight) * smoothstep(0.12, 0.3, el));
          }
          gl_FragColor = vec4(col, 1.0);
        }`,
    }),
  );
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return { mesh, uniforms };
}

/** Pond water: sky-tinted toon water with ripple rings (`uRipples`: x, z, start time, strength) and a golden sun lane. */
export function makeWater() {
  const uniforms = {
    uTime: { value: 0 },
    uNight: { value: 0 },
    uRipples: { value: Array.from({ length: 16 }, () => new THREE.Vector4(0, 0, -99, 0)) },
  };
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400, 1, 1),
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: /* glsl */ `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */ `
        uniform float uTime, uNight; uniform vec4 uRipples[16]; varying vec3 vW;
        ${NOISE}
        void main() {
          vec2 p = vW.xz;
          float dist = length(p - cameraPosition.xz);
          vec3 near = mix(vec3(0.32, 0.72, 0.82), vec3(0.2, 0.36, 0.62), uNight);
          vec3 far = mix(vec3(1.0, 0.7, 0.66), vec3(0.42, 0.34, 0.66), uNight);
          vec3 col = mix(near, far, smoothstep(6.0, 60.0, dist));
          vec2 q = vec2(p.x * 0.7 + sin(p.y * 0.9 + uTime * 0.8) * 0.3, p.y * 2.4 - uTime * 0.4);
          float dash = step(0.84, vnoise(q)) * step(0.5, fract(q.x * 0.4));
          col = mix(col, vec3(0.92, 0.98, 1.0), dash * (1.0 - smoothstep(8.0, 30.0, dist)) * 0.7);
          vec2 sd = normalize(vec2(0.35, -1.0));
          vec2 rel = p - cameraPosition.xz;
          float lane = exp(-pow(dot(normalize(rel), vec2(-sd.y, sd.x)) * 6.0, 2.0)) * step(0.0, dot(rel, sd));
          col = mix(col, vec3(1.0, 0.86, 0.5), lane * step(0.62, vnoise(q * 1.6)) * (1.0 - uNight * 0.6));
          for (int i = 0; i < 16; i++) {
            vec4 r = uRipples[i];
            float age = uTime - r.z;
            if (age < 0.0 || age > 2.2) continue;
            float d = length(p - r.xy);
            for (int k = 0; k < 2; k++) {
              float rr = age * 1.4 - float(k) * 0.35;
              if (rr <= 0.0) continue;
              float ring = smoothstep(0.05, 0.0, abs(d - rr)) * (1.0 - age / 2.2) * r.w;
              col = mix(col, vec3(0.95, 1.0, 1.0), ring * 0.85);
            }
          }
          gl_FragColor = vec4(col, 1.0);
        }`,
    }),
  );
  mesh.rotation.x = -Math.PI / 2;
  return { mesh, uniforms };
}

const PAD_GEO = new THREE.CylinderGeometry(1, 1, 0.05, 48, 1, false, 0.25, Math.PI * 2 - 0.5);
const PAD_INK = new THREE.MeshBasicMaterial({ color: INK });
const padMaterial = (() => {
  const m = new THREE.MeshToonMaterial({ color: "#ffffff", gradientMap: RAMP });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vLocal;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvLocal = position;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vLocal;")
      .replace("vec4 diffuseColor = vec4( diffuse, opacity );", `
        vec2 q = vLocal.xz; float r = length(q); float a = atan(q.y, q.x);
        vec3 c = mix(vec3(0.36, 0.74, 0.32), vec3(0.47, 0.84, 0.36), smoothstep(1.0, 0.2, r));
        float vein = smoothstep(0.05, 0.0, abs(fract(a / 6.2831853 * 11.0) - 0.5) * r * 2.2) * step(0.12, r);
        c = mix(c, vec3(0.3, 0.6, 0.28), vein * 0.7);
        c = mix(c, vec3(0.28, 0.56, 0.26), smoothstep(0.86, 0.95, r));
        vec4 diffuseColor = vec4(c, opacity);`);
  };
  return m;
})();

/** A notched lily pad of radius r, with an inked rim. */
export function makePad(r, angle = 0) {
  const g = new THREE.Group();
  const top = new THREE.Mesh(PAD_GEO, padMaterial);
  top.scale.set(r, 1, r);
  top.position.y = 0.03;
  const rim = new THREE.Mesh(PAD_GEO, PAD_INK);
  rim.scale.set(r + 0.05, 0.6, r + 0.05);
  rim.position.y = 0.012;
  g.add(top, rim);
  g.rotation.y = angle;
  return g;
}

/** Pink lotus flower with a yellow heart. */
export function makeLotus(scale = 1) {
  const g = new THREE.Group();
  const petal = toon("#ff9cc4");
  const tip = toon("#ffd2e4");
  const heart = toon("#ffd23f");
  for (let ring = 0; ring < 2; ring++) {
    const n = ring ? 6 : 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + ring * 0.4;
      const p = new THREE.Group();
      p.rotation.set(0, a, 0);
      g.add(p);
      part(p, ring ? tip : petal, SPHERE, [0, 0.12 + ring * 0.04, 0.12 - ring * 0.04], [0.07, 0.15 - ring * 0.02, 0.04], [0.6 - ring * 0.3, 0, 0]);
    }
  }
  part(g, heart, SPHERE, [0, 0.12, 0], [0.06, 0.04, 0.06]);
  g.scale.setScalar(scale);
  return g;
}

const REED = new THREE.CylinderGeometry(0.6, 1, 1, 6);

/** A clump of reeds and cattails that sways from its base. */
export function makeReeds(n, seed) {
  const g = new THREE.Group();
  const stem = toon("#4fae4a");
  const tail = toon("#8a5a3a");
  const blades = [];
  for (let i = 0; i < n; i++) {
    const h = 1.4 + hash(seed + i * 1.7) * 1.3;
    const b = new THREE.Group();
    b.position.set((hash(seed + i * 3.1) - 0.5) * 0.9, 0, (hash(seed + i * 5.3) - 0.5) * 0.6);
    const s = new THREE.Mesh(REED, stem);
    s.scale.set(0.03, h, 0.03);
    s.position.y = h / 2;
    s.add(new THREE.Mesh(s.geometry, OUTLINE));
    b.add(s);
    if (i % 2 === 0) part(b, tail, SPHERE, [0, h - 0.18, 0], [0.06, 0.2, 0.06]);
    else {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.05, h * 0.7, 4), stem);
      leaf.position.set(0.05, h * 0.35, 0);
      leaf.rotation.z = -0.2;
      b.add(leaf);
    }
    g.add(b);
    blades.push({ b, phase: hash(seed + i) * 6.28 });
  }
  return { group: g, blades };
}

/** Grassy banks and stones around the pond. */
export function makeBanks() {
  const g = new THREE.Group();
  const grass = toon("#6cc85a");
  const grassDark = toon("#4ea84a");
  const stone = toon("#b9c2d6");
  const mounds = [[-14, -16, 9, 2.2], [0, -22, 14, 3.0], [15, -17, 10, 2.4], [-22, -6, 8, 1.8], [22, -5, 8, 2.0], [-18, 10, 7, 1.6], [19, 11, 7, 1.7]];
  mounds.forEach(([x, z, r, h], k) => part(g, k % 2 ? grassDark : grass, SPHERE, [x, -0.2, z], [r, h, r * 0.7], null, true));
  [[-7, -8, 0.7], [6.5, -7, 0.9], [-9, 3, 0.6], [8.5, 4, 0.55]].forEach(([x, z, r]) => {
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), stone);
    m.position.set(x, r * 0.3, z);
    m.add(new THREE.Mesh(m.geometry, OUTLINE));
    g.add(m);
  });
  return g;
}

/** Puffy inked clouds far off in the sunset. */
export function makeClouds() {
  const g = new THREE.Group();
  const mat = toon("#ffe4ec");
  [[-40, 24, -110, 9], [30, 30, -120, 11], [70, 20, -90, 7], [-80, 18, -80, 8]].forEach(([x, y, z, s], k) => {
    const c = new THREE.Group();
    c.position.set(x, y, z);
    for (let i = 0; i < 5; i++) part(c, mat, SPHERE, [(i - 2) * s * 0.55, Math.sin(i * 1.7 + k) * s * 0.15 + (i === 2 ? s * 0.3 : 0), 0], [s * (0.55 + (i === 2) * 0.2), s * 0.45, s * 0.4], null, true);
    g.add(c);
  });
  return g;
}
