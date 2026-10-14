import * as THREE from "three";
import { StarStreaks, makeRibbon } from "@gizclaw/mvg-core/fx.js";
import { BANDS, SECTIONS, TITLE } from "./constants.js";
import { ruler } from "./hud.js";
import { RAINBOW, clamp, easeOutCubic, lerp, smooth } from "@gizclaw/mvg-core/timing.js";

const SP = 2.6;
const RINGS = 44;
const RING_N = [3, 5, 8, 12, 18, 26, 40];
const RING_AMP = [0.14, 0.11, 0.085, 0.065, 0.05, 0.04, 0.03];

export class TunnelScene {
  constructor(ctx) {
    this.ctx = ctx;
    const { timing } = ctx;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#020208");
    this.camera = new THREE.PerspectiveCamera(78, 9 / 16, 0.05, 200);

    // Verse-one band schedule (time → band index), taken from the lyric cues.
    this.schedule = [
      [SECTIONS.drop, 0],
      [timing.cues[3].start, 1],
      [timing.cues[4].start, 2],
      [timing.cues[5].start, 3],
    ];
    this.colorWords = [
      [timing.wordTime(6, "red"), RAINBOW[0], "RED"],
      [timing.wordTime(6, "orange"), RAINBOW[1], "ORANGE"],
      [timing.wordTime(6, "yellow"), RAINBOW[2], "YELLOW"],
      [timing.wordTime(6, "green"), RAINBOW[3], "GREEN"],
      [timing.wordTime(7, "blue"), RAINBOW[4], "BLUE"],
      [timing.wordTime(7, "violet"), RAINBOW[5], "VIOLET"],
    ];
    this.space = timing.cues[8].start;
    this.race = timing.cues[9].start;
    this.outroLine2 = timing.cues[39].start;

    this.buildRings();
    this.stars = new StarStreaks({ count: 5000, radius: [0.6, 9], depth: 110 });
    this.scene.add(this.stars.object);
    this.buildCore();
    this.buildHelices();
  }

  buildRings() {
    const base = new THREE.BufferGeometry();
    const seg = 512;
    const u = [];
    const side = [];
    const idx = [];
    for (let i = 0; i <= seg; i++) {
      u.push(i / seg, i / seg);
      side.push(-1, 1);
      if (i < seg) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    }
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(u.length * 3), 3));
    geo.setAttribute("aU", new THREE.Float32BufferAttribute(u, 1));
    geo.setAttribute("aSide", new THREE.Float32BufferAttribute(side, 1));
    geo.setIndex(idx);
    geo.setAttribute("aRing", new THREE.InstancedBufferAttribute(new Float32Array(Array.from({ length: RINGS }, (_, i) => i)), 1));
    geo.instanceCount = RINGS;
    const vec = () => Array.from({ length: RINGS }, () => new THREE.Color());
    const num = () => Array.from({ length: RINGS }, () => 0);
    this.ru = {
      uZ: { value: num() },
      uN: { value: num() },
      uAmp: { value: num() },
      uColor: { value: vec() },
      uRainbow: { value: num() },
      uGlow: { value: num() },
      uCamZ: { value: 0 },
      uTime: { value: 0 },
      uWidth: { value: 0.035 },
      uRadius: { value: 2.3 },
      uTwist: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: this.ru,
      vertexShader: /* glsl */ `
        attribute float aU, aSide, aRing;
        uniform float uZ[${RINGS}], uN[${RINGS}], uAmp[${RINGS}], uGlow[${RINGS}], uRainbow[${RINGS}];
        uniform vec3 uColor[${RINGS}];
        uniform float uCamZ, uTime, uWidth, uRadius, uTwist;
        varying vec3 vColor; varying float vSide; varying float vFade; varying float vU; varying float vRain;
        void main(){
          int i = int(aRing);
          float a = aU * 6.2831853 + uTwist * uZ[i];
          float r = uRadius * (1.0 + uAmp[i] * sin(a * uN[i] + uTime * 3.0 + float(i)));
          float d = uCamZ - uZ[i];
          float w = uWidth * (1.0 + uGlow[i] * 1.5) * (0.6 + d * 0.04);
          r += aSide * w;
          vec3 p = vec3(cos(a) * r, sin(a) * r, uZ[i]);
          vSide = aSide;
          vFade = smoothstep(-0.3, 1.2, d) * smoothstep(95.0, 30.0, d);
          vColor = uColor[i] * (1.0 + uGlow[i] * 2.0);
          vRain = uRainbow[i];
          vU = aU;
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vColor; varying float vSide; varying float vFade; varying float vU; varying float vRain;
        vec3 hsv(float h){ return clamp(abs(mod(h*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0,0.0,1.0); }
        void main(){
          float d = abs(vSide);
          float core = smoothstep(1.0, 0.0, d);
          float hot = smoothstep(0.3, 0.0, d);
          vec3 c = mix(vColor, hsv(vU) * 1.3, vRain);
          gl_FragColor = vec4((c * core + vec3(1.0) * hot * 0.5) * vFade, 1.0);
        }`,
    });
    this.rings = new THREE.Mesh(geo, mat);
    this.rings.frustumCulled = false;
    this.scene.add(this.rings);
  }

  buildCore() {
    this.core = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 30),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uColor: { value: new THREE.Color() }, uI: { value: 1 } },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `varying vec2 vUv; uniform vec3 uColor; uniform float uI;
          void main(){ float r = length(vUv - 0.5) * 2.0; float g = exp(-r * 6.0) * 1.2 + exp(-r * 22.0) * 2.0; gl_FragColor = vec4((uColor * g + vec3(1.0) * exp(-r * 40.0)) * uI, 1.0); }`,
      }),
    );
    this.scene.add(this.core);
  }

  buildHelices() {
    this.helices = BANDS.map((b, i) => {
      const uniforms = { uCamZ: { value: 0 }, uSpin: { value: 0 }, uR: { value: 1.3 } };
      const r = makeRibbon({
        segments: 400,
        width: 0.045,
        color: b.id === "visible" ? "#fff6a0" : b.color,
        uniforms,
        path: `float z = uCamZ - 1.5 - u * 70.0; float a = z * 0.35 + uSpin + ${((i / 7) * Math.PI * 2).toFixed(3)}; float rr = uR * (0.6 + 0.4 * smoothstep(0.0, 0.3, u)); return vec3(cos(a) * rr, sin(a) * rr, z);`,
      });
      r.material.uniforms.uOpacity.value = 0;
      this.scene.add(r);
      return r;
    });
  }

  bandAt(t) {
    let band = 0;
    for (const [st, b] of this.schedule) if (t >= st) band = b;
    return band;
  }

  colorWordAt(t) {
    let cur = null;
    for (const w of this.colorWords) if (w[0] !== null && t >= w[0] - 0.02) cur = w;
    return cur;
  }

  update(t, section) {
    const { timing, hud } = this.ctx;
    const outro = section === "outro";
    const mul = outro ? 2 : 1;
    const bf = timing.beatFloat(t);
    const camZ = -bf * SP * mul;
    const kick = timing.pulse(t, 0.12);
    const ru = this.ru;
    ru.uCamZ.value = camZ;
    ru.uTime.value = t;
    ru.uTwist.value = outro ? 0.02 : 0;

    const firstK = Math.floor(-camZ / SP) - 1;
    for (let j = 0; j < RINGS; j++) {
      const k = firstK + j;
      const tr = timing.beatTime(Math.floor(k / mul));
      ru.uZ.value[j] = -k * SP;
      let band;
      let color;
      let rainbow = 0;
      if (outro) {
        band = ((k % 7) + 7) % 7;
        color = BANDS[band].color === "#ffffff" ? "#fff6a0" : BANDS[band].color;
        rainbow = tr >= this.outroLine2 ? 1 : 0;
      } else {
        band = this.bandAt(tr);
        color = BANDS[band].color;
        if (band === 3) {
          const w = this.colorWordAt(tr);
          if (w) color = w[1];
          else rainbow = 1;
          if (tr >= this.space) rainbow = 1;
        }
        if (tr >= this.race) {
          band = ((k % 7) + 7) % 7;
          color = BANDS[band].color;
          rainbow = band === 3 ? 1 : 0;
        }
      }
      ru.uColor.value[j].set(color);
      ru.uN.value[j] = RING_N[band];
      ru.uAmp.value[j] = RING_AMP[band] * (1 + 0.8 * kick);
      ru.uRainbow.value[j] = rainbow;
      const dist = camZ - ru.uZ.value[j];
      ru.uGlow.value[j] = Math.exp(-Math.abs(dist) / 3) * (0.4 + kick);
      if (!outro && tr >= this.space && tr < this.race) {
        ru.uColor.value[j].multiplyScalar(0.35);
      }
    }

    // Camera: forward motion locked to the beat, roll snaps every bar.
    const bar = timing.barIndex(t, 4);
    const sinceBar = t - timing.beatTime(timing.dropBeat + bar * 4);
    const rollTarget = (bar % 2 === 0 ? 1 : -1) * (outro ? 0.35 : 0.18);
    const rollPrev = -rollTarget;
    const roll = lerp(rollPrev, rollTarget, easeOutCubic(sinceBar / 0.35));
    this.camera.position.set(Math.sin(t * 0.7) * 0.35, Math.cos(t * 0.53) * 0.3, camZ);
    this.camera.rotation.set(0, 0, roll + t * (outro ? 0.6 : 0.08));
    this.camera.fov = 78 - kick * 7 + (outro ? 8 : 0);
    this.camera.updateProjectionMatrix();

    this.stars.material.uniforms.uCamZ.value = camZ;
    this.stars.material.uniforms.uStretch.value = outro ? 3.5 : 1.2;
    this.stars.material.uniforms.uRainbow.value = outro ? 1 : 0.3;

    const band = outro ? Math.floor(bf) % 7 : this.bandAt(t);
    const w = !outro && band === 3 ? this.colorWordAt(t) : null;
    const coreColor = w ? w[1] : BANDS[band].color === "#ffffff" ? "#ffffff" : BANDS[band].color;
    this.core.material.uniforms.uColor.value.set(coreColor);
    this.core.material.uniforms.uI.value = 0.55 + kick * 0.5;
    this.core.position.set(0, 0, camZ - 80);

    const raceOn = outro ? smooth(this.outroLine2 - 0.3, this.outroLine2, t) : smooth(this.race - 0.2, this.race + 0.3, t);
    this.helices.forEach((h, i) => {
      const u = h.material.uniforms;
      u.uCamZ.value = camZ;
      u.uSpin.value = t * (outro ? 5 : 3);
      u.uR.value = 1.1 + 0.25 * kick;
      u.uOpacity.value = raceOn;
      u.uReveal.value = clamp((t - (outro ? this.outroLine2 : this.race) - i * 0.06) / 0.5, 0, 1);
    });

    // HUD
    const post = { bloom: [0.85, 0.45, 0.12], ca: 0.25 + kick * 0.6, zoom: 1 + kick * 0.012, vignette: 0.55 };
    if (!outro) this.hudVerse(t, post);
    else this.hudOutro(t, post, bf);
    return post;
  }

  hudVerse(t, post) {
    const { timing, hud } = this.ctx;
    const band = this.bandAt(t);
    let active = band;
    if (t >= this.race) active = (timing.beatFloat(t) * 0.5) % 7;
    ruler(hud, active, smooth(SECTIONS.verse1 + 0.6, SECTIONS.verse1 + 1.2, t), { highlightAll: t >= this.race ? 0.6 : 0 });
    hud.title(t, SECTIONS.verse1 + 0.2, timing.cues[3].start - 0.2, TITLE);

    const labels = [
      [this.schedule[0][0], this.schedule[1][0], "RADIO", BANDS[0]],
      [this.schedule[1][0], this.schedule[2][0], "MICROWAVES", BANDS[1]],
      [this.schedule[2][0], this.schedule[3][0], "INFRARED", BANDS[2]],
      [this.schedule[3][0], this.colorWords[0][0], "VISIBLE", BANDS[3]],
    ];
    for (const [a, b, text, info] of labels) {
      const start = Math.max(a, SECTIONS.verse1 + 0.05);
      hud.slam(text, t, start, Math.min(b, start + 2.6) - 0.15, { color: info.id === "visible" ? "#fff6a0" : info.color, sub: `λ ${info.lambda}`, y: 820 });
      if (t >= a && t < a + 0.12) post.flash = Math.max(post.flash || 0, (1 - (t - a) / 0.12) * 0.25);
    }
    this.colorWords.forEach(([wt, color, text], i) => {
      const next = this.colorWords[i + 1]?.[0] ?? wt + 1.2;
      hud.slam(text, t, wt, Math.min(next, wt + 1.2) - 0.05, { color, size: 190, y: 820, angle: i % 2 ? 0.05 : -0.07 });
    });
    hud.slam("EMPTY SPACE", t, this.space, this.space + 2.0, { color: "#c9d6ff", size: 150, y: 820, sub: "no medium needed" });
    hud.slam("7-PART RACE", t, this.race, SECTIONS.chorus1 - 0.25, { color: "#ffffff", size: 160, y: 820, sub: "radio → gamma" });
    if (t >= this.race) post.scan = 0.06;
    if (t > SECTIONS.chorus1 - 0.25) post.flash = Math.max(post.flash || 0, smooth(SECTIONS.chorus1 - 0.25, SECTIONS.chorus1, t) * 0.6);
  }

  hudOutro(t, post, bf) {
    const { timing, hud } = this.ctx;
    const firstBeat = timing.beatIndexAt(SECTIONS.outro + 0.3) + 1;
    const idx = timing.beatIndexAt(t) - firstBeat;
    ruler(hud, clamp(idx, 0, 6), 1, { highlightAll: t >= this.outroLine2 ? 1 : 0 });
    if (idx >= 0 && idx < 7) {
      const b = BANDS[idx];
      const bt = timing.beatTime(firstBeat + idx);
      hud.slam(b.label, t, bt, timing.beatTime(firstBeat + idx + 1) - 0.06, { color: b.id === "visible" ? "#fff6a0" : b.color, size: 180, y: 820, angle: idx % 2 ? 0.06 : -0.06 });
      post.flash = Math.exp(-(t - bt) / 0.08) * 0.18;
    }
    if (t >= this.outroLine2) {
      hud.slam("ONE SPECTRUM", t, this.outroLine2, SECTIONS.end - 0.3, { color: "#ffffff", size: 170, y: 820, sub: "of light", angle: -0.04 });
      post.mirror = 0;
    }
    post.ca = 0.4 + timing.pulse(t, 0.1) * 0.9;
    post.bloom = [1.0, 0.5, 0.12];
    const toEnd = smooth(SECTIONS.end - 0.5, SECTIONS.end, t);
    post.zoom = 1 + toEnd * 0.25;
    post.flash = Math.max(post.flash || 0, toEnd * 1.0);
    post.glitch = toEnd * 0.5;
  }
}
