import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { hash } from "@gizclaw/mvg-core/timing.js";

// Foreground polish: the props get their own brighter reflections, richer
// colour than the muted room, a key, rim and bench-bounce light on the hero
// spot, an electric rim in the hero's accent colour that flows along its
// silhouette, a pulse on each stamp, a holographic scan line on arrival, a
// gleam band on stamps and landings, a thin glowing outline on parked props,
// and star glints.

const uniforms = {
  uTime: { value: 0 },
  uGleamC: { value: new THREE.Vector3() },
  uGleamR: { value: 1 },
  uGleamPhase: { value: 0 },
  uGleamAmt: { value: 0 },
  uHero: { value: new THREE.Vector3() },
  uAccent: { value: new THREE.Color() },
  uEnergy: { value: 0 },
  uPulse: { value: 0 },
  uScanY: { value: 0 },
  uScan: { value: 0 },
};

const DECL = "uniform vec3 uGleamC, uHero, uAccent; uniform float uTime, uGleamR, uGleamPhase, uGleamAmt, uEnergy, uPulse, uScanY, uScan; varying vec3 vGleamW;";
const SATURATE = /* glsl */ `
  {
    float l = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
    diffuseColor.rgb = max(mix(vec3(l), diffuseColor.rgb, SHINE_SAT), 0.0);
  }`;
const GLEAM = /* glsl */ `
  {
    float fr = 1.0 - abs(dot(normal, normalize(vViewPosition)));
    vec3 d = vGleamW - uGleamC;
    float s = dot(d, normalize(vec3(1.0, 0.75, 0.25))) / uGleamR;
    float band = exp(-pow((s - mix(-1.5, 1.5, uGleamPhase)) * 10.0, 2.0)) * exp(-dot(d, d) / (uGleamR * uGleamR * 1.6));
    totalEmissiveRadiance += vec3(1.0, 0.96, 0.88) * band * uGleamAmt * (0.1 + pow(fr, 2.5) * 1.4);
    vec3 h = vGleamW - uHero;
    float near = exp(-dot(h, h) / 10.0);
    // Energy bands flowing up the silhouette, with a fast flicker.
    float flow = 0.5 + 0.5 * sin(vGleamW.y * 9.0 - vGleamW.x * 3.0 - uTime * 7.0);
    float flick = 0.7 + 0.3 * fract(sin(floor(uTime * 24.0) * 12.9898 + floor(vGleamW.y * 4.0) * 7.31) * 43758.5);
    float rim = (smoothstep(0.5, 0.92, fr) * 0.8 + pow(fr, 6.0) * 1.2) * (0.35 + 0.65 * flow * flow) * flick;
    totalEmissiveRadiance += uAccent * near * (rim * (uEnergy * 0.9 + uPulse * 2.0) + uPulse * (0.04 + 0.2 * fr * fr));
    totalEmissiveRadiance += vec3(0.25, 0.85, 1.0) * pow(fr, 4.0) * 0.3 * (1.0 - near);
    float line = exp(-pow((vGleamW.y - uScanY) / 0.05, 2.0));
    float lines = step(0.6, fract(vGleamW.y * 14.0)) * step(vGleamW.y, uScanY);
    totalEmissiveRadiance += vec3(0.3, 0.9, 1.0) * near * uScan * (line * 1.4 + lines * 0.06);
  }`;

const STAR = /* glsl */ `
  varying float vA;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float rays = exp(-abs(p.x) * 14.0) * exp(-abs(p.y) * 2.2) + exp(-abs(p.y) * 14.0) * exp(-abs(p.x) * 2.2);
    vec2 q = mat2(0.7071, -0.7071, 0.7071, 0.7071) * p;
    rays += 0.4 * (exp(-abs(q.x) * 18.0) * exp(-abs(q.y) * 4.0) + exp(-abs(q.y) * 18.0) * exp(-abs(q.x) * 4.0));
    float core = exp(-dot(p, p) * 14.0);
    gl_FragColor = vec4(vec3(1.0, 0.97, 0.9) * (rays * 0.9 + core) * vA, 1.0);
  }`;

const SHELL_VERT = /* glsl */ `
  uniform vec3 uHero; uniform float uTime;
  varying vec3 vN; varying vec3 vV; varying vec3 vW; varying float vNear;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vec3 h = w.xyz - uHero;
    vNear = exp(-dot(h, h) / 10.0);
    vec3 n = normalize(mat3(modelMatrix) * normal);
    w.xyz += n * mix(0.035, 0.12, vNear);
    vW = w.xyz;
    vec4 mv = viewMatrix * w;
    vN = normalize(mat3(viewMatrix) * n);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }`;
const SHELL_FRAG = /* glsl */ `
  uniform vec3 uAccent; uniform float uTime, uEnergy, uPulse;
  varying vec3 vN; varying vec3 vV; varying vec3 vW; varying float vNear;
  void main() {
    float d = abs(dot(normalize(vN), normalize(vV)));
    float edge = smoothstep(0.02, 0.45, d) * (1.0 - smoothstep(0.55, 1.0, d) * 0.6);
    float flow = 0.5 + 0.5 * sin(vW.y * 7.0 - vW.x * 2.5 - uTime * 6.5);
    float flick = 0.75 + 0.25 * fract(sin(floor(uTime * 24.0) * 12.9898 + floor(vW.y * 5.0) * 7.31) * 43758.5);
    vec3 hero = uAccent * edge * (0.35 + 0.65 * flow * flow) * flick * (uEnergy * 1.8 + uPulse * 1.8);
    vec3 idle = vec3(0.25, 0.85, 1.0) * edge * 0.22;
    gl_FragColor = vec4(mix(idle, hero, vNear), 1.0);
  }`;

const N_STARS = 48;

export class Shine {
  constructor(scene, renderer, hero) {
    this.env = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
    this.hero = hero;
    const key = new THREE.SpotLight("#fff6ea", 0.85, 0, 0.3, 0.6, 0);
    key.position.set(-7, 15, 18);
    const rim = new THREE.SpotLight("#a8dcff", 2.6, 0, 0.32, 0.5, 0);
    rim.position.set(7.5, 10, -2.4);
    const bounce = new THREE.SpotLight("#bfe8ff", 0.5, 0, 0.45, 0.8, 0);
    bounce.position.set(0, -1, 10);
    for (const l of [key, rim, bounce]) {
      l.target.position.copy(hero);
      scene.add(l, l.target);
    }
    // The bench row gets a steep spot from the same ceiling, so the cabinet faces below stay dark.
    const row = new THREE.SpotLight("#fff2dc", 0.4, 0, 0.42, 0.7, 0);
    row.position.set(0, 24, 5);
    row.target.position.set(0, 1, -0.2);
    scene.add(row, row.target);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N_STARS * 3), 3));
    geo.setAttribute("aSize", new THREE.BufferAttribute(new Float32Array(N_STARS), 1));
    this.stars = new THREE.Points(
      geo,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
        vertexShader: "attribute float aSize; varying float vA; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vA = min(1.0, aSize); gl_PointSize = aSize * 900.0 / -mv.z; gl_Position = projectionMatrix * mv; }",
        fragmentShader: STAR,
      }),
    );
    this.stars.frustumCulled = false;
    this.stars.renderOrder = 5;
    scene.add(this.stars);
  }

  /** Wrap a prop's solid surfaces (and its glass) in a thin additive glow shell that follows its animation. */
  outline(root) {
    this.shell ??= new THREE.ShaderMaterial({ uniforms, vertexShader: SHELL_VERT, fragmentShader: SHELL_FRAG, side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const meshes = [];
    root.traverse((o) => {
      if (!o.isMesh) return;
      const solid = o.material.isMeshStandardMaterial && !o.material.transparent && o.material.side !== THREE.DoubleSide && o.scale.x > 0.2;
      if (solid || o.material.userData?.outline) meshes.push(o);
    });
    for (const m of meshes) {
      const shell = new THREE.Mesh(m.geometry, this.shell);
      shell.renderOrder = 4;
      m.add(shell);
    }
  }

  /** Give a prop material the bright reflections, richer colour (`userData.saturation`, default 1.5) and the glow hooks. */
  dress(mat) {
    if (!mat.isMeshStandardMaterial || mat.userData.shine) return;
    mat.userData.shine = true;
    mat.envMap = this.env;
    mat.envMapIntensity = 0.32;
    const sat = (mat.userData.saturation ?? 1.5).toFixed(2);
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, uniforms);
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vGleamW;").replace("#include <project_vertex>", "#include <project_vertex>\nvGleamW = (modelMatrix * vec4(transformed, 1.0)).xyz;");
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", `#include <common>\n#define SHINE_SAT ${sat}\n${DECL}`)
        .replace("#include <color_fragment>", `#include <color_fragment>\n${SATURATE}`)
        .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>\n${GLEAM}`);
    };
    mat.customProgramCacheKey = () => `shine${sat}`;
    mat.needsUpdate = true;
  }

  /**
   * `gleam` = [centre, radius, progress 0–1] of the sweep, or null; `energy`/`pulse`/`scan`
   * drive the hero's electric rim, stamp pulse and arrival scan (`scanY` its height) in `accent`;
   * `bursts` = [[centre, radius, t0, count, life, size]] star bursts.
   */
  update(t, { gleam, energy, pulse, scan, scanY, accent, bursts }) {
    uniforms.uTime.value = t;
    uniforms.uHero.value.copy(this.hero);
    uniforms.uAccent.value.set(accent);
    uniforms.uEnergy.value = energy;
    uniforms.uPulse.value = pulse;
    uniforms.uScan.value = scan;
    uniforms.uScanY.value = scanY;
    if (gleam) {
      uniforms.uGleamC.value.copy(gleam[0]);
      uniforms.uGleamR.value = gleam[1];
      uniforms.uGleamPhase.value = gleam[2];
      uniforms.uGleamAmt.value = 0.8 * (1 - gleam[2] * 0.6);
    } else uniforms.uGleamAmt.value = 0;
    const pos = this.stars.geometry.attributes.position;
    const size = this.stars.geometry.attributes.aSize;
    let n = 0;
    for (const [c, r, t0, count, life, big] of bursts) {
      for (let i = 0; i < count && n < N_STARS; i++) {
        const seed = t0 * 13.7 + i * 1.91;
        const u = (t - t0 - hash(seed) * life * 0.35) / (life * 0.65);
        if (u <= 0 || u >= 1) continue;
        pos.setXYZ(n, c.x + (hash(seed + 1) - 0.5) * 2 * r, c.y + (hash(seed + 2) - 0.5) * 2.2 * r, c.z + r * (0.4 + hash(seed + 3) * 0.5));
        size.setX(n, Math.sin(u * Math.PI) * big * (0.6 + hash(seed + 4) * 0.8));
        n++;
      }
    }
    for (; n < N_STARS; n++) size.setX(n, 0);
    pos.needsUpdate = true;
    size.needsUpdate = true;
  }
}
