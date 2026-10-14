import * as THREE from "three";
import { makeRibbon } from "@gizclaw/mvg-core/fx.js";
import { BANDS, SECTIONS } from "./constants.js";
import { ruler } from "./hud.js";
import { clamp, easeOutBack, easeOutCubic, lerp, smooth } from "@gizclaw/mvg-core/timing.js";

const PILLAR_X = [-3.9, -2.6, -1.3, 0, 1.3, 2.6, 3.9];
const PILLAR_Z = -17;
const BIN_GROUPS = [[0, 4], [4, 8], [8, 12], [12, 16], [16, 21], [21, 26], [26, 32]];

// Per-chorus lyric cue indices: [slide1, name, radio/micro, ir/vis, uv/x/gamma, freq, slide2, wavelength].
const CHORUS_CUES = {
  chorus1: [10, 11, 12, 13, 14, 15, 16, 17],
  chorus2: [26, 27, 28, 29, 30, 31, 32, 33],
};

const CAMS = [
  { pos: [0, 1.6, 7], look: [0, 3.5, -20] },
  { pos: [0, 7.5, 9], look: [0, 1.5, -18] },
  { pos: [-5.5, 2.2, -3], look: [1.5, 3, -16] },
  { pos: [5.5, 2.2, -3], look: [-1.5, 3, -16] },
  { pos: [0, 0.7, -3], look: [0, 4.5, -22] },
];

export class ChorusScene {
  constructor(ctx) {
    this.ctx = ctx;
    const { timing } = ctx;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#07021a");
    this.camera = new THREE.PerspectiveCamera(62, 9 / 16, 0.1, 300);
    this.events = {};
    for (const [name, c] of Object.entries(CHORUS_CUES)) {
      const slideTimes = [c[0], c[6]].flatMap((ci) => [0, 1, 2].map((n) => timing.wordTime(ci, "slide", n)).filter((x) => x !== null));
      this.events[name] = {
        cues: c,
        slides: slideTimes,
        names: [
          [timing.wordTime(c[2], "radio"), 0],
          [timing.wordTime(c[2], "microwave"), 1],
          [timing.wordTime(c[3], "infrared"), 2],
          [timing.wordTime(c[3], "visible"), 3],
          [timing.wordTime(c[4], "ultraviolet"), 4],
          [timing.wordTime(c[4], "x-ray"), 5],
          [timing.wordTime(c[4], "gamma"), 6],
        ],
        freq: timing.cues[c[5]].start,
        wavelength: timing.cues[c[7]].start,
        nameLine: timing.cues[c[1]].start,
      };
    }
    this.buildSky();
    this.buildFloor();
    this.buildPillars();
    this.buildComets();
  }

  buildSky() {
    this.skyU = { uTime: { value: 0 }, uBeat: { value: 0 }, uPulse: { value: 0 }, uRainbow: { value: 0 }, uTop: { value: new THREE.Color("#0a0330") }, uHorizon: { value: new THREE.Color("#ff2d8a") } };
    const sky = new THREE.Mesh(
      new THREE.PlaneGeometry(260, 160),
      new THREE.ShaderMaterial({
        depthWrite: false,
        uniforms: this.skyU,
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: /* glsl */ `
          varying vec2 vUv; uniform float uTime, uBeat, uPulse, uRainbow; uniform vec3 uTop, uHorizon;
          vec3 hsv(float h){ return clamp(abs(mod(h*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0,0.0,1.0); }
          void main(){
            vec2 p = (vUv - vec2(0.5, 0.0)) * vec2(260.0, 160.0);
            float hgt = p.y;
            vec3 col = mix(uHorizon * 0.55, uTop, smoothstep(10.0, 80.0, hgt));
            vec2 sc = p - vec2(0.0, 34.0);
            float r = length(sc);
            float R = 24.0 * (1.0 + uPulse * 0.04);
            float disc = smoothstep(R, R - 0.4, r);
            float v = clamp((sc.y + R) / (2.0 * R), 0.0, 1.0);
            vec3 sun = mix(vec3(1.0, 0.18, 0.5), vec3(1.0, 0.9, 0.25), v);
            sun = mix(sun, hsv(0.8 - v * 0.8), uRainbow);
            float stripeZone = smoothstep(0.62, 0.1, v);
            float stripe = step(0.5 + 0.5 * stripeZone * 0.9, fract(v * 14.0 - uBeat * 0.5));
            float cut = mix(1.0, stripe, step(0.01, stripeZone));
            col = mix(col, sun * (0.62 + 0.25 * uPulse), disc * cut);
            col += sun * exp(-max(r - R, 0.0) * 0.18) * 0.12 * (1.0 + uPulse);
            float stars = step(0.9975, fract(sin(dot(floor(p * 2.0), vec2(12.9898, 78.233))) * 43758.5453)) * smoothstep(20.0, 60.0, hgt);
            col += vec3(stars) * 0.8;
            gl_FragColor = vec4(col, 1.0);
          }`,
      }),
    );
    sky.position.set(0, 70, -110);
    this.sky = sky;
    this.scene.add(sky);
  }

  buildFloor() {
    this.floorU = { uScroll: { value: 0 }, uPulse: { value: 0 }, uK: { value: 0.6 }, uAmp: { value: 0.4 }, uTime: { value: 0 }, uColorA: { value: new THREE.Color("#ff2d8a") }, uColorB: { value: new THREE.Color("#3de8ff") } };
    const geo = new THREE.PlaneGeometry(80, 140, 220, 380);
    geo.rotateX(-Math.PI / 2);
    const floor = new THREE.Mesh(
      geo,
      new THREE.ShaderMaterial({
        transparent: true,
        uniforms: this.floorU,
        vertexShader: /* glsl */ `
          uniform float uScroll, uK, uAmp, uTime, uPulse;
          varying vec3 vP; varying float vH;
          void main(){
            vec3 p = position;
            float side = smoothstep(4.5, 14.0, abs(p.x));
            float wz = p.z - uScroll;
            float m = (sin(p.x * 0.35 + 1.3) * 0.5 + 0.5) * (sin(wz * 0.18) * 0.5 + 0.5) + 0.4 * sin(p.x * 0.9 + wz * 0.4);
            float h = side * (m * 6.0 + 1.0) * (1.0 + uPulse * 0.25);
            float wave = uAmp * sin(p.x * uK * 3.0 - uTime * 5.0) * (1.0 - side) * smoothstep(-5.0, -40.0, p.z);
            p.y = h + wave;
            vH = h;
            vP = vec3(p.x, p.y, wz);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform float uPulse; uniform vec3 uColorA, uColorB;
          varying vec3 vP; varying float vH;
          void main(){
            vec2 g = abs(fract(vec2(vP.x, vP.z) / 2.0) - 0.5);
            vec2 fw = fwidth(vec2(vP.x, vP.z) / 2.0);
            float line = max(smoothstep(fw.x * 1.5, 0.0, 0.5 - g.x - 0.0) , smoothstep(fw.y * 1.5, 0.0, 0.5 - g.y));
            line = max(1.0 - smoothstep(0.0, fw.x * 1.6, abs(g.x - 0.5)), 1.0 - smoothstep(0.0, fw.y * 1.6, abs(g.y - 0.5)));
            vec3 lc = mix(uColorB, uColorA, smoothstep(0.0, 5.0, vH));
            float dist = length(vP.xz - vec2(0.0, vP.z));
            vec3 col = vec3(0.02, 0.0, 0.06) + lc * line * (1.2 + uPulse * 1.5);
            gl_FragColor = vec4(col, 0.92);
          }`,
      }),
    );
    floor.position.set(0, 0, -40);
    floor.renderOrder = 1;
    this.scene.add(floor);
  }

  buildPillars() {
    const geo = new THREE.BoxGeometry(0.85, 1, 0.85);
    geo.translate(0, 0.5, 0);
    const makeMat = (color, reflect) =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: !reflect,
        blending: reflect ? THREE.AdditiveBlending : THREE.NormalBlending,
        uniforms: { uColor: { value: new THREE.Color(color) }, uFlash: { value: 0 }, uRainbow: { value: color === "#ffffff" ? 1 : 0 }, uAlpha: { value: reflect ? 0.25 : 1 } },
        vertexShader: `varying vec3 vL; varying vec3 vN; void main(){ vL = position; vN = normal; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor; uniform float uFlash, uRainbow, uAlpha; varying vec3 vL; varying vec3 vN;
          vec3 hsv(float h){ return clamp(abs(mod(h*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0,0.0,1.0); }
          void main(){
            vec3 c = mix(uColor, hsv(0.8 - vL.y * 0.8), uRainbow);
            vec2 e = abs(vL.xz) / 0.425;
            float edge = smoothstep(0.85, 1.0, max(e.x, e.y));
            float top = step(0.5, vN.y);
            vec3 col = c * (0.08 + 0.32 * vL.y) + c * edge * 0.75 + c * top * 0.9 + vec3(1.0) * uFlash * 0.6;
            gl_FragColor = vec4(col * uAlpha, uAlpha);
          }`,
      });
    this.pillars = BANDS.map((b, i) => {
      const m = new THREE.Mesh(geo, makeMat(b.color, false));
      m.position.set(PILLAR_X[i], 0, PILLAR_Z);
      m.renderOrder = 2;
      const r = new THREE.Mesh(geo, makeMat(b.color, true));
      r.position.set(PILLAR_X[i], 0, PILLAR_Z);
      r.renderOrder = 0;
      this.scene.add(m, r);
      return { m, r };
    });
  }

  buildComets() {
    this.comets = [0, 1, 2].map((i) => {
      const uniforms = { uDir: { value: i % 2 ? -1 : 1 }, uY: { value: 0 } };
      const c = makeRibbon({
        segments: 200,
        width: 0.22,
        color: "#ffffff",
        uniforms,
        path: `float x = mix(9.0, -9.0, u) * uDir; return vec3(x, uY + mix(9.0, -2.0, u) + sin(u * 9.0) * 0.4, -9.0);`,
      });
      c.material.uniforms.uOpacity.value = 0;
      c.material.fragmentShader = c.material.fragmentShader
        .replace("uniform vec3 uColor;", "uniform vec3 uColor;\nvec3 hsv(float h){ return clamp(abs(mod(h*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0,0.0,1.0); }")
        .replace("vec3 col = uColor * core * uGlow", "vec3 col = hsv(vU * 0.85) * 1.4 * core * uGlow");
      this.scene.add(c);
      return c;
    });
  }

  update(t, section) {
    const { timing, hud } = this.ctx;
    const ev = this.events[section];
    const two = section === "chorus2";
    const start = two ? SECTIONS.chorus2 : SECTIONS.chorus1;
    const end = two ? SECTIONS.bridge : SECTIONS.break;
    const bf = timing.beatFloat(t);
    const kick = timing.pulse(t, 0.13);
    const bass = timing.env("low", t, 0.1);

    this.skyU.uTime.value = t;
    this.skyU.uBeat.value = bf;
    this.skyU.uPulse.value = kick;
    this.skyU.uRainbow.value = two ? 1 : 0;
    this.skyU.uTop.value.set(two ? "#020c2e" : "#0a0330");
    this.skyU.uHorizon.value.set(two ? "#3d6bff" : "#ff2d8a");
    this.floorU.uScroll.value = -bf * 2;
    this.floorU.uPulse.value = kick;
    this.floorU.uTime.value = t;
    const shortWave = smooth(ev.wavelength, ev.wavelength + 1.2, t);
    this.floorU.uK.value = lerp(0.35, 2.4, shortWave);
    this.floorU.uAmp.value = 0.25 + bass * 0.5;
    this.floorU.uColorA.value.set(two ? "#9b5cff" : "#ff2d8a");
    this.floorU.uColorB.value.set(two ? "#7cff4f" : "#3de8ff");

    // Pillars follow the spectrum; named bands slam up.
    const spec = timing.spectrum(t);
    let lastNamed = -1;
    this.pillars.forEach(({ m, r }, i) => {
      const [a, b] = BIN_GROUPS[i];
      let v = 0;
      for (let k = a; k < b; k++) v += spec[k];
      v /= b - a;
      const nt = ev.names[i][0];
      let boost = 0;
      let flash = 0;
      if (nt !== null && t >= nt) {
        boost = 3.5 * Math.exp(-(t - nt) / 0.9);
        flash = Math.exp(-(t - nt) / 0.15);
        lastNamed = i;
      }
      const chase = t >= ev.freq && t < ev.freq + 1.6 ? Math.exp(-Math.abs(t - ev.freq - i * 0.12) / 0.06) : 0;
      flash = Math.max(flash, chase);
      const h = 0.5 + Math.pow(v, 1.8) * 5 + boost * 0.7 + chase * 1.5;
      m.scale.set(1, h, 1);
      r.scale.set(1, -h, 1);
      m.material.uniforms.uFlash.value = flash * 0.9;
      r.material.uniforms.uFlash.value = flash * 0.5;
    });

    // Comets on every "slide".
    this.comets.forEach((c, j) => {
      const u = c.material.uniforms;
      let st = null;
      for (const s of ev.slides) if (s !== null && t >= s) st = s;
      const idx = st === null ? -1 : ev.slides.indexOf(st);
      if (idx < 0 || idx % 3 !== j) {
        u.uOpacity.value = 0;
        return;
      }
      const k = (t - st) / 0.45;
      u.uReveal.value = easeOutCubic(k);
      u.uRevealStart.value = easeOutCubic((t - st - 0.12) / 0.5);
      u.uOpacity.value = 1 - smooth(0.7, 1.1, k);
      u.uDir.value = idx % 2 ? -1 : 1;
      u.uY.value = (idx % 3) * 1.6;
    });

    // Camera cuts on the bar (every two beats in the second chorus).
    const n = two ? 2 : 4;
    const relBeat = timing.beatIndexAt(t) - timing.beatIndexAt(start + 0.01);
    const shot = Math.floor(relBeat / n);
    const shotStart = timing.beatTime(timing.beatIndexAt(start + 0.01) + shot * n);
    const cam = CAMS[(shot * 3 + (two ? 1 : 0)) % CAMS.length];
    const k = (t - shotStart) / (timing.period * n);
    const nameSwing = t >= ev.nameLine && t < ev.nameLine + 2 ? Math.sin((t - ev.nameLine) * Math.PI * 1.4) * 2.5 : 0;
    this.camera.position.set(cam.pos[0] + nameSwing, cam.pos[1] + kick * 0.08, cam.pos[2] - k * 1.5);
    this.camera.lookAt(cam.look[0] + nameSwing * 0.3, cam.look[1], cam.look[2]);
    this.camera.rotation.z += (shot % 2 ? 1 : -1) * 0.04;
    this.camera.fov = 62 - kick * 5;
    this.camera.updateProjectionMatrix();

    const post = { bloom: [0.8, 0.45, 0.22], ca: 0.25 + kick * 0.7, zoom: 1 + kick * 0.015, vignette: 0.5 };
    const cutAge = t - shotStart;
    post.flash = Math.exp(-cutAge / 0.07) * (two ? 0.12 : 0.18);
    if (t - start < 0.5) post.flash = Math.max(post.flash, Math.exp(-(t - start) / 0.12) * 0.8);
    if (two) {
      const slide2 = timing.cues[ev.cues[6]].start;
      if (t >= slide2 - 0.1 && t < timing.cues[ev.cues[7]].end) post.mirror = 2;
      else if (shot % 4 === 3) post.mirror = 1;
    }
    for (const s of ev.slides) if (s !== null && t >= s && t < s + 0.15) post.glitch = Math.max(post.glitch || 0, (1 - (t - s) / 0.15) * 0.35);
    if (t > end - 0.35) post.flash = Math.max(post.flash, smooth(end - 0.35, end, t) * 0.7);

    // HUD
    ruler(hud, lastNamed >= 0 ? lastNamed : -1, 1, { highlightAll: lastNamed < 0 ? 0.35 : 0 });
    ev.names.forEach(([nt, bi]) => {
      if (nt === null) return;
      const b = BANDS[bi];
      const p = new THREE.Vector3(PILLAR_X[bi], this.pillars[bi].m.scale.y + 0.6, PILLAR_Z).project(this.camera);
      if (p.z > 1) return;
      const x = (p.x * 0.5 + 0.5) * 1080;
      const y = (-p.y * 0.5 + 0.5) * 1920;
      const life = clamp((t - nt) / 0.15, 0, 1) * (1 - smooth(nt + 1.6, nt + 2.0, t));
      if (life <= 0) return;
      hud.text(b.label, clamp(x, 160, 920), clamp(y - 30 - (bi % 2) * 56, 400, 1150), { size: Math.round(54 * easeOutBack(clamp((t - nt) / 0.2, 0, 1))), weight: 800, family: '"Avenir Next Condensed"', color: b.id === "visible" ? "#fff6a0" : b.color, alpha: life, glow: 24 });
    });
    if (t >= ev.freq && t < ev.freq + 1.8) hud.slam("f ↑", t, ev.freq, ev.freq + 1.5, { size: 200, y: 640, color: "#ffffff", sub: "frequency higher" });
    if (t >= ev.wavelength && t < ev.wavelength + 3.5) hud.slam("λ ↓", t, ev.wavelength, ev.wavelength + 3.2, { size: 200, y: 640, color: "#3de8ff", sub: "wavelength shorter" });
    return post;
  }
}
