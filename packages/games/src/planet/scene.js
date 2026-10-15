import * as THREE from "three";

const NOISE = /* glsl */ `
  float h3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float vnoise(vec3 p) {
    vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * vnoise(p); p *= 2.03; a *= 0.5; } return s; }
`;

/** Banded, cratered or earth-like surface lit from the Sun at the origin. */
export function planetMaterial(p) {
  const L = p.look;
  return new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {
      uA: { value: new THREE.Color(L.a) },
      uB: { value: new THREE.Color(L.b) },
      uC: { value: new THREE.Color(L.c) },
      uBands: { value: L.bands },
      uWarp: { value: L.warp },
      uScale: { value: L.scale },
      uEarth: { value: p.earth ? 1 : 0 },
      uCaps: { value: p.caps || (p.earth ? 0.78 : 0) },
      uSpot: { value: new THREE.Vector3(...(p.spot || [0, 0, 0])) },
      uAtmo: { value: new THREE.Color(p.color) },
      uTime: { value: 0 },
      uFlash: { value: 0 },
      uOpacity: { value: 1 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vObj; varying vec3 vN; varying vec3 vW;
      void main() {
        vObj = normalize(position);
        vN = normalize(mat3(modelMatrix) * normal);
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uA, uB, uC, uAtmo, uSpot;
      uniform float uBands, uWarp, uScale, uEarth, uCaps, uTime, uFlash, uOpacity;
      varying vec3 vObj; varying vec3 vN; varying vec3 vW;
      ${NOISE}
      void main() {
        vec3 p = vObj;
        float n = fbm(p * uScale + vec3(0.0, 0.0, uTime * 0.02));
        vec3 col;
        if (uEarth > 0.5) {
          float land = smoothstep(0.52, 0.56, fbm(p * 2.4 + 3.1));
          col = mix(uA, mix(uB, uC, smoothstep(0.55, 0.75, n)), land);
          col = mix(col, vec3(1.0), smoothstep(0.55, 0.75, fbm(p * 4.0 + vec3(uTime * 0.03, 0.0, 0.0))) * 0.8);
        } else if (uBands > 0.5) {
          float b = sin((p.y + (n - 0.5) * uWarp * 0.35) * uBands * 3.14159) * 0.5 + 0.5;
          col = mix(mix(uA, uB, b), uC, smoothstep(0.6, 0.9, n) * 0.5);
        } else {
          col = mix(mix(uA, uB, n), uC, smoothstep(0.62, 0.8, fbm(p * uScale * 2.0)));
        }
        if (uSpot.z > 0.0) {
          vec2 d = vec2((atan(p.z, p.x) - uSpot.y) * 0.6, p.y - uSpot.x);
          col = mix(col, uC * 0.9 + vec3(0.25, 0.05, 0.0), exp(-dot(d, d) / (uSpot.z * uSpot.z)));
        }
        if (uCaps > 0.0) col = mix(col, vec3(0.95), smoothstep(uCaps, uCaps + 0.06, abs(p.y)));
        vec3 N = normalize(vN);
        vec3 V = normalize(cameraPosition - vW);
        float diff = smoothstep(-0.12, 0.7, dot(N, normalize(-vW)));
        float rim = 1.0 - max(dot(N, V), 0.0);
        rim = rim * rim * rim;
        vec3 c = col * (0.12 + 0.85 * diff) + uAtmo * rim * (0.3 + 0.6 * diff) + vec3(1.0) * uFlash * (0.4 + rim);
        gl_FragColor = vec4(c, uOpacity);
      }`,
  });
}

/** Saturn's banded rings, in units of the planet radius. */
export function makeRings() {
  const mesh = new THREE.Mesh(
    new THREE.RingGeometry(1.35, 2.35, 160, 1),
    new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      uniforms: { uOpacity: { value: 1 } },
      vertexShader: "varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: /* glsl */ `
        uniform float uOpacity; varying vec3 vP;
        void main() {
          float r = (length(vP.xy) - 1.35);
          float bands = 0.55 + 0.45 * sin(r * 70.0) * sin(r * 13.0 + 1.0);
          float gap = smoothstep(0.5, 0.53, r) * (1.0 - smoothstep(0.56, 0.59, r));
          float a = bands * (1.0 - gap * 0.9) * smoothstep(0.0, 0.05, r) * (1.0 - smoothstep(0.9, 1.0, r));
          gl_FragColor = vec4(mix(vec3(0.85, 0.75, 0.55), vec3(1.0, 0.95, 0.85), r) * 0.6, a * 0.8 * uOpacity);
        }`,
    }),
  );
  mesh.rotation.x = -Math.PI / 2 + 0.45;
  return mesh;
}

/** The Sun: a churning sphere; pulse it with `uniforms.uPulse`. */
export function makeSun(radius) {
  const uniforms = { uTime: { value: 0 }, uPulse: { value: 0 } };
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 64, 48),
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: /* glsl */ `
        varying vec3 vObj; varying vec3 vN; varying vec3 vV;
        void main() {
          vObj = normalize(position);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vN = normalize(normalMatrix * normal);
          vV = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime, uPulse;
        varying vec3 vObj; varying vec3 vN; varying vec3 vV;
        ${NOISE}
        void main() {
          float n = fbm(vObj * 5.0 + vec3(uTime * 0.15, uTime * 0.1, 0.0));
          float g = fbm(vObj * 18.0 - vec3(0.0, uTime * 0.3, 0.0));
          vec3 col = mix(vec3(1.0, 0.32, 0.02), vec3(1.0, 0.85, 0.35), n);
          col += vec3(1.0, 0.6, 0.2) * smoothstep(0.55, 0.8, g) * 0.5;
          float limb = 0.55 + 0.45 * max(dot(vN, vV), 0.0);
          gl_FragColor = vec4(col * limb * (1.0 + uPulse * 0.35), 1.0);
        }`,
    }),
  );
  return { mesh, uniforms };
}

/** A shell of faint stars, thickest along a tilted Milky Way band. */
export function makeStars(count = 4000) {
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const c = new THREE.Color();
  const axis = new THREE.Vector3(1, 0, 0.3).normalize();
  const v = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    if (i < count * 0.45) {
      const a = Math.random() * Math.PI * 2;
      v.set(Math.cos(a), (Math.random() - 0.5) * (Math.random() < 0.7 ? 0.25 : 0.7), Math.sin(a));
    } else {
      const u = Math.random() * 2 - 1;
      const a = Math.random() * Math.PI * 2;
      v.set(Math.sqrt(1 - u * u) * Math.cos(a), u, Math.sqrt(1 - u * u) * Math.sin(a));
    }
    v.normalize().applyAxisAngle(axis, 0.9).multiplyScalar(150);
    pos.set([v.x, v.y, v.z], i * 3);
    c.setHSL(0.55 + Math.random() * 0.15, 0.4, 0.55 + Math.random() * 0.4);
    col.set([c.r, c.g, c.b], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.55, vertexColors: true, sizeAttenuation: true, transparent: true, depthWrite: false }));
}
