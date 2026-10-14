import * as THREE from "three";
import { StarStreaks } from "@gizclaw/mvg-core/fx.js";
import { BANDS, SECTIONS } from "./constants.js";
import { ruler } from "./hud.js";
import { clamp, easeInCubic, lerp, smooth } from "@gizclaw/mvg-core/timing.js";

const NX = 300;
const NZ = 440;

export class OceanScene {
  constructor(ctx) {
    this.ctx = ctx;
    const { timing } = ctx;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#020108");
    this.camera = new THREE.PerspectiveCamera(60, 9 / 16, 0.05, 200);
    const c = (i) => timing.cues[i].start;
    this.t = {
      uv: c(18),
      xray: c(19),
      gamma: c(20),
      light: c(21),
      long: c(22),
      short: c(23),
      same: c(24),
      family: c(25),
      riser: timing.cues[25].end,
    };
    // [time, k, chirp, amplitude, color, rainbow, invert]
    this.keys = [
      [SECTIONS.verse2, 0.8, 0, 0.0, "#9b5cff", 0, 0],
      [this.t.uv, 1.2, 0, 0.8, BANDS[4].color, 0, 0],
      [this.t.xray, 2.2, 0, 0.6, BANDS[5].color, 0, 0.55],
      [this.t.gamma, 4.2, 0, 0.42, BANDS[6].color, 0, 0],
      [this.t.light, 1.0, 0, 0.3, "#ffffff", 0.5, 0],
      [this.t.long, 0.45, 0, 1.25, "#ff3b3b", 0, 0],
      [this.t.short, 5.0, 0, 0.35, "#9b5cff", 0, 0],
      [this.t.same, 0.5, 0.08, 0.75, "#ffffff", 1, 0],
      [this.t.family, 0.5, 0.08, 0.75, "#ffffff", 1, 0],
    ];
    this.buildField();
    this.stars = new StarStreaks({ count: 4000, radius: [1, 16], depth: 120 });
    this.stars.material.uniforms.uOpacity.value = 0;
    this.scene.add(this.stars.object);
  }

  buildField() {
    const n = NX * NZ;
    const pos = new Float32Array(n * 3);
    const seed = new Float32Array(n);
    for (let i = 0; i < NX; i++) {
      for (let j = 0; j < NZ; j++) {
        const k = i * NZ + j;
        pos[k * 3] = (i / (NX - 1) - 0.5) * 30 + (Math.random() - 0.5) * 0.05;
        pos[k * 3 + 2] = 6 - (j / (NZ - 1)) * 58;
        seed[k] = Math.random();
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    this.fu = {
      uTime: { value: 0 },
      uPhase: { value: 0 },
      uK: { value: 1 },
      uChirp: { value: 0 },
      uA: { value: 0.5 },
      uColor: { value: new THREE.Color() },
      uRainbow: { value: 0 },
      uSparkle: { value: 0 },
      uScroll: { value: 0 },
      uPulse: { value: 0 },
      uRise: { value: 1 },
      uSize: { value: 7.5 },
      uFrame: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: this.fu,
      vertexShader: /* glsl */ `
        attribute float aSeed;
        uniform float uTime, uPhase, uK, uChirp, uA, uRainbow, uSparkle, uScroll, uPulse, uRise, uSize, uFrame;
        uniform vec3 uColor;
        varying vec3 vC; varying float vA;
        vec3 hsv(float h){ return clamp(abs(mod(h*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0,0.0,1.0); }
        void main(){
          vec3 p = position;
          float z = mod(p.z - uScroll - 6.0 + 58.0, 58.0) - 52.0;
          float zz = 6.0 - z;
          float ph = uK * zz * (1.0 + uChirp * zz) - uPhase;
          float s = sin(ph);
          float ripple = 0.12 * sin(p.x * 0.7 + uTime * 1.3) * cos(zz * 0.3 - uTime);
          float amp = uA * (1.0 + uPulse * 0.35);
          p.y = amp * s + ripple - (1.0 - uRise) * 6.0 * (0.5 + aSeed);
          p.z = z;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float crest = smoothstep(0.4, 1.0, s);
          vec3 rain = hsv(clamp(zz / 58.0, 0.0, 1.0) * 0.78);
          vec3 c = mix(uColor, rain, uRainbow);
          float spark = uSparkle * step(0.985, fract(aSeed * 91.7 + floor(uFrame * 0.5) * 0.137));
          vC = (c * (0.35 + 1.0 * (0.5 + 0.5 * s)) + vec3(1.0) * crest * 0.5) * 0.8 + vec3(1.0) * spark * 3.0;
          vA = smoothstep(52.0, 30.0, zz) * smoothstep(-2.0, 1.5, zz + 0.5) ;
          gl_PointSize = uSize * (0.7 + aSeed * 0.6) * (1.0 + spark * 2.0) * (6.0 / -mv.z);
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vC; varying float vA;
        void main(){
          float r = length(gl_PointCoord - 0.5);
          if (r > 0.5) discard;
          gl_FragColor = vec4(vC * vA * smoothstep(0.5, 0.1, r), 1.0);
        }`,
    });
    this.field = new THREE.Points(geo, mat);
    this.field.frustumCulled = false;
    this.scene.add(this.field);
  }

  sample(t) {
    let i = 0;
    while (i < this.keys.length - 1 && t >= this.keys[i + 1][0]) i++;
    const a = this.keys[i];
    const b = this.keys[Math.min(i + 1, this.keys.length - 1)];
    // Hold each key, morphing into the next during its first 0.35s.
    const prev = this.keys[Math.max(0, i - 1)];
    const k = i === 0 ? 1 : smooth(a[0] - 0.05, a[0] + 0.35, t);
    const mix = (j) => lerp(prev[j], a[j], k);
    const color = new THREE.Color(prev[4]).lerp(new THREE.Color(a[4]), k);
    return { k: mix(1), chirp: mix(2), A: mix(3), color, rainbow: mix(5), invert: mix(6), next: b };
  }

  update(t) {
    const { timing, hud } = this.ctx;
    const s = this.sample(t);
    const kick = timing.pulse(t, 0.13);
    const fu = this.fu;
    const T = this.t;
    fu.uTime.value = t;
    fu.uK.value = s.k;
    fu.uChirp.value = s.chirp;
    fu.uPhase.value = timing.beatFloat(t) * Math.PI * 1.0;
    fu.uA.value = s.A;
    fu.uColor.value.copy(s.color);
    fu.uRainbow.value = s.rainbow;
    fu.uPulse.value = kick;
    fu.uFrame.value = Math.round(t * 30);
    fu.uSparkle.value = t >= T.gamma && t < T.light ? 1 : 0;
    fu.uRise.value = smooth(SECTIONS.verse2 - 0.1, T.uv + 0.2, t);

    // Light-speed warp section.
    const warpIn = smooth(T.light - 0.1, T.light + 0.5, t);
    const warpOut = 1 - smooth(T.long - 0.6, T.long, t);
    const warp = warpIn * warpOut;
    const warpDist = easeInCubic(clamp((t - T.light) / (T.long - T.light), 0, 1)) * 600 * (t < T.long ? 1 : 0);
    fu.uScroll.value = warpDist;
    this.stars.material.uniforms.uOpacity.value = warp;
    this.stars.material.uniforms.uCamZ.value = -warpDist * 0.6;
    this.stars.material.uniforms.uStretch.value = 1 + warp * 10;
    this.stars.material.uniforms.uRainbow.value = 0.6;

    const rise = smooth(T.family, T.riser + 1.2, t);
    const camY = lerp(2.6, 5.5, rise) + Math.sin(t * 0.8) * 0.25;
    const camZ = 8 - rise * 2;
    this.camera.position.set(Math.sin(t * 0.33) * 1.2, camY, camZ);
    this.stars.object.position.set(0, 0, 0);
    this.camera.lookAt(0, lerp(1.4, -1.5, rise), -14);
    this.camera.rotation.z += Math.sin(t * 0.5) * 0.04;
    this.camera.fov = 60 + warp * 30 - kick * 4;
    this.camera.updateProjectionMatrix();
    this.stars.object.position.copy(new THREE.Vector3(this.camera.position.x, this.camera.position.y, 0));

    const post = { bloom: [0.85, 0.45, 0.15], ca: 0.25 + kick * 0.6 + warp * 1.5, zoom: 1 + kick * 0.012, vignette: 0.55, invert: s.invert * timing.pulse(t, 0.07) };
    if (s.invert > 0.1) post.scan = 0.12;
    if (t >= T.gamma && t < T.light) {
      post.glitch = timing.pulse(t, 0.06) * 0.5;
      post.ca += 0.5;
    }
    for (const key of this.keys.slice(1)) {
      if (t >= key[0] && t < key[0] + 0.15) post.flash = Math.max(post.flash || 0, (1 - (t - key[0]) / 0.15) * 0.3);
    }
    if (t < SECTIONS.verse2 + 0.25) post.flash = Math.max(post.flash || 0, (1 - (t - SECTIONS.verse2) / 0.25) * 0.6);
    const end = SECTIONS.chorus2;
    if (t > end - 0.4) post.flash = Math.max(post.flash || 0, smooth(end - 0.4, end, t) * 0.8);
    post.zoom += smooth(T.riser, end, t) * 0.12;

    // HUD
    let active = -1;
    if (t >= T.uv) active = 4;
    if (t >= T.xray) active = 5;
    if (t >= T.gamma) active = 6;
    if (t >= T.light) active = -1;
    if (t >= T.long) active = 0.5;
    if (t >= T.short) active = 5.5;
    if (t >= T.same) active = (t - T.same) * 1.6 % 7;
    ruler(hud, active, smooth(SECTIONS.verse2, SECTIONS.verse2 + 0.6, t), { highlightAll: t >= T.family ? 1 : t >= T.same ? 0.45 : 0 });
    const y = 700;
    hud.slam("ULTRAVIOLET", t, T.uv, T.xray - 0.2, { color: BANDS[4].color, y, sub: `λ ${BANDS[4].lambda}` });
    hud.slam("X-RAY", t, T.xray, T.gamma - 0.2, { color: BANDS[5].color, y, size: 210, sub: `λ ${BANDS[5].lambda}` });
    hud.slam("GAMMA", t, T.gamma, T.light - 0.2, { color: BANDS[6].color, y, size: 210, sub: `λ ${BANDS[6].lambda}` });
    hud.slam("c", t, T.light, T.long - 0.25, { color: "#ffffff", y: 640, size: 300, sub: "299,792 km/s", stroke: true, angle: 0 });
    hud.slam("LOW f", t, T.long, T.short - 0.15, { color: "#ff5b5b", y: 600, size: 170, sub: "→ LONG λ" });
    hud.slam("HIGH f", t, T.short, T.same - 0.15, { color: "#b58cff", y: 600, size: 170, sub: "→ SHORT λ" });
    hud.slam("ONE FAMILY", t, T.family, T.riser, { color: "#ffffff", y: 640, size: 160, sub: "ordered by frequency" });
    if (t >= T.same && t < T.family) {
      const a = smooth(T.same, T.same + 0.3, t) * (1 - smooth(T.family - 0.3, T.family, t));
      hud.text("E = h · f", 540, 640, { size: 120, weight: 800, family: '"Avenir Next Condensed"', alpha: a, glow: 30, color: "#ffffff" });
      hud.text("more frequency, more energy", 540, 730, { size: 30, weight: 600, family: '"Menlo"', alpha: a * 0.9 });
    }
    return post;
  }
}
