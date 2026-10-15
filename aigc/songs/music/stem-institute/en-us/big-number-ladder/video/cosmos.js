import * as THREE from "three";

// The ladder rises from Earth (far below and behind it), passes the Moon on the
// way to decillion, and the googol tower points at a spiral galaxy.
const SUN = new THREE.Vector3(0.75, 0.45, 0.5).normalize();

const NOISE = /* glsl */ `
  float h31(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float vnoise(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h31(i), h31(i + vec3(1, 0, 0)), f.x), mix(h31(i + vec3(0, 1, 0)), h31(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(h31(i + vec3(0, 0, 1)), h31(i + vec3(1, 0, 1)), f.x), mix(h31(i + vec3(0, 1, 1)), h31(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * vnoise(p); p *= 2.03; a *= 0.5; } return s; }
`;

const SPHERE_VERT = "varying vec3 vObj; varying vec3 vN; varying vec3 vV; void main(){ vObj = normalize(position); vec4 wp = modelMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix * viewMatrix * wp; }";

const EARTH = /* glsl */ `
  uniform vec3 uSun; uniform float uTime;
  varying vec3 vObj; varying vec3 vN; varying vec3 vV;
  ${NOISE}
  void main() {
    vec3 p = vObj;
    vec3 warp = p * 2.2 + 3.0 + vec3(fbm(p * 3.1), fbm(p * 3.1 + 5.2), fbm(p * 3.1 + 9.7)) * 1.6;
    float shape = fbm(warp);
    float land = smoothstep(0.5, 0.53, shape);
    float coast = smoothstep(0.45, 0.5, shape) * (1.0 - land);
    vec3 ocean = mix(vec3(0.005, 0.04, 0.2), vec3(0.01, 0.16, 0.4), coast);
    float dry = fbm(p * 6.0);
    vec3 ground = mix(vec3(0.05, 0.16, 0.04), vec3(0.3, 0.24, 0.12), smoothstep(0.45, 0.65, dry));
    vec3 surf = mix(ocean, ground, land);
    surf = mix(surf, vec3(0.85, 0.9, 0.95), smoothstep(0.82, 0.9, abs(p.y)));
    float cloud = smoothstep(0.62, 0.8, fbm(p * 4.5 + vec3(uTime * 0.01, 0.0, 0.0)));
    float lit = max(dot(normalize(vN), uSun), 0.0);
    vec3 col = mix(surf, vec3(1.0), cloud * 0.7) * (0.02 + 0.6 * lit);
    float night = smoothstep(0.15, -0.1, dot(normalize(vN), uSun));
    float cities = step(0.78, fbm(p * 40.0)) * land * (1.0 - cloud);
    col += vec3(1.0, 0.7, 0.35) * cities * night * 0.6;
    float rim = pow(1.0 - max(dot(normalize(vN), normalize(vV)), 0.0), 3.0);
    col += vec3(0.25, 0.55, 1.0) * rim * (0.15 + 0.55 * lit);
    gl_FragColor = vec4(col, 1.0);
  }`;

const HALO = /* glsl */ `
  uniform vec3 uSun; varying vec3 vObj; varying vec3 vN; varying vec3 vV;
  void main() {
    float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
    float lit = 0.25 + 0.75 * max(dot(normalize(vN), uSun), 0.0);
    gl_FragColor = vec4(vec3(0.3, 0.6, 1.0) * f * lit * 0.4, 1.0);
  }`;

const MOON = /* glsl */ `
  uniform vec3 uSun; varying vec3 vObj; varying vec3 vN; varying vec3 vV;
  ${NOISE}
  void main() {
    vec3 p = vObj;
    float tone = 0.55 + 0.35 * fbm(p * 3.0);
    float maria = smoothstep(0.55, 0.6, fbm(p * 1.6 + 7.0));
    tone *= 1.0 - maria * 0.35;
    float crater = 0.0;
    for (int i = 0; i < 3; i++) {
      vec3 q = p * (5.0 + float(i) * 6.0);
      vec3 c = floor(q) + 0.5 + (vec3(h31(floor(q)), h31(floor(q) + 1.7), h31(floor(q) + 3.3)) - 0.5) * 0.6;
      float d = length(q - c);
      crater += (smoothstep(0.35, 0.3, d) * 0.25 - smoothstep(0.42, 0.36, d) * smoothstep(0.3, 0.35, d) * 0.3) * step(0.55, h31(floor(q) + 9.1));
    }
    tone = clamp(tone - crater, 0.0, 1.0);
    float lit = max(dot(normalize(vN), uSun), 0.0);
    gl_FragColor = vec4(vec3(tone) * (0.02 + 0.7 * lit), 1.0);
  }`;

const GALAXY = /* glsl */ `
  uniform float uTime, uOpacity; varying vec2 vUv;
  ${NOISE}
  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float r = length(p);
    float a = atan(p.y, p.x);
    float arms = 0.5 + 0.5 * cos(2.0 * (a - log(r + 0.05) * 2.4 - uTime * 0.03));
    float dust = fbm(vec3(p * 4.0, uTime * 0.02));
    float body = pow(arms, 2.0) * exp(-r * 2.6) * (0.6 + 0.6 * dust);
    vec3 col = mix(vec3(0.45, 0.55, 1.0), vec3(1.0, 0.75, 0.5), exp(-r * 4.0)) * body * 1.5;
    col += vec3(1.0, 0.9, 0.7) * exp(-r * 14.0) * 1.2;
    col *= smoothstep(1.0, 0.6, r);
    gl_FragColor = vec4(col * uOpacity, 1.0);
  }`;

export class Cosmos {
  constructor(scene) {
    const sun = { value: SUN };
    this.time = { value: 0 };
    this.earth = new THREE.Mesh(new THREE.SphereGeometry(30, 160, 120), new THREE.ShaderMaterial({ uniforms: { uSun: sun, uTime: this.time }, vertexShader: SPHERE_VERT, fragmentShader: EARTH }));
    this.earth.position.set(0, -34.5, -40);
    this.halo = new THREE.Mesh(
      new THREE.SphereGeometry(30.7, 96, 72),
      new THREE.ShaderMaterial({ uniforms: { uSun: sun }, vertexShader: SPHERE_VERT, fragmentShader: HALO, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide }),
    );
    this.halo.position.copy(this.earth.position);
    this.moon = new THREE.Mesh(new THREE.SphereGeometry(2.4, 96, 72), new THREE.ShaderMaterial({ uniforms: { uSun: sun }, vertexShader: SPHERE_VERT, fragmentShader: MOON }));
    this.moon.position.set(-6.6, 12.5, -45);
    this.galaxyU = { uTime: this.time, uOpacity: { value: 0 } };
    this.galaxy = new THREE.Mesh(
      new THREE.PlaneGeometry(90, 90),
      new THREE.ShaderMaterial({ uniforms: this.galaxyU, vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }", fragmentShader: GALAXY, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.galaxy.position.set(10, 105, -85);
    for (const m of [this.earth, this.halo, this.moon, this.galaxy]) {
      m.renderOrder = -0.5;
      scene.add(m);
    }
  }

  update(t, camera, googol) {
    this.time.value = t;
    // Tilt the pole away so the equator faces up toward the ladder, then spin.
    this.earth.rotation.set(1.25, t * 0.012, 0);
    this.moon.rotation.y = t * 0.02;
    this.galaxy.lookAt(camera.position);
    this.galaxy.rotateZ(t * 0.02);
    this.galaxyU.uOpacity.value = 0.25 + 0.75 * googol;
  }
}
