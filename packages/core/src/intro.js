import * as THREE from "three";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";
import { H, makeRibbon, rasterShapes } from "./fx.js";
import { BRAND, clamp, easeInCubic, easeOutBack, easeOutCubic, lerp, smooth } from "./timing.js";
import { FONT_COND, FONT_MONO } from "./hud.js";

const LOGO_WIDTH = 3.3;
const LOGO_Y = 0.35;
const VIEWBOX = [92, 20];
const WAVE_K = [2.0, 3.2, 5.0, 7.5, 11, 16, 23];
const WAVE_A = [0.17, 0.16, 0.15, 0.13, 0.12, 0.1, 0.09];
const N_PARTICLES = 30000;

const PALETTE = ["#ff3d7f", "#ff8c42", "#ff2e2e", "#ffffff", "#9b5cff", "#3de8ff", "#7cff4f"];
const NEVER = 1e9;

// Every published song opens with the catalog's 1.647 s audio mark
// (gizclaw/catalogs/aigc/assets/music-mark.wav); these are its onsets and weights.
export const MARK_END = 1.647;
const MARK_HITS = [[0.064, 0.6], [0.412, 0.35], [0.569, 1]];

export function markPulse(t, decay = 0.16) {
  let v = 0;
  for (const [ht, w] of MARK_HITS) if (t >= ht) v = Math.max(v, w * Math.exp(-(t - ht) / decay));
  return v;
}

/** Move a grid time onto the strongest nearby onset (within half a grid step) when one is clearly audible. */
function snapToOnset(timing, t, step = timing.period) {
  const win = step * 0.5;
  let best = null;
  let score = 0.18;
  for (const [ot, s] of timing.onsets) {
    if (ot < t - win) continue;
    if (ot > t + win) break;
    const sc = s - (Math.abs(ot - t) / win) * 0.12;
    if (sc > score) [best, score] = [ot, sc];
  }
  return best ?? t;
}

/**
 * Lay the haivivi intro right after the audio mark, whatever the drop: the wave
 * splits in a quick cascade, the seven glyphs land in about half a second with
 * the last one on a beat near IGNITE_AT, the tagline follows a beat or so later,
 * and the build takes the final beat before `drop`. Events snap to clear onsets.
 */
const IGNITE_AT = 3.4;
export function deriveIntro(timing, { drop, end, endTitle, endKicker, endFooter }) {
  const dropBeat = timing.beatIndexAt(drop + 0.01);
  const dropT = timing.beatTime(dropBeat);
  if (dropT < IGNITE_AT + 1.6) throw new Error(`intro needs the drop at least ${(IGNITE_AT + 1.6).toFixed(1)} s in, got ${dropT.toFixed(2)}`);
  const ds = clamp(timing.period / 4, 0.08, 0.11);
  const nearestBeat = (t, min) => {
    let i = timing.beatIndexAt(t);
    if (timing.beatTime(i + 1) - t < t - timing.beatTime(i)) i++;
    while (timing.beatTime(i) < min) i++;
    return timing.beatTime(i);
  };
  const ignite = nearestBeat(IGNITE_AT, IGNITE_AT - 0.25);
  const glyphGrid = Array.from({ length: 7 }, (_, k) => ignite - (6 - k) * ds);
  const splitEnd = glyphGrid[0] - 0.15;
  const splitStart = Math.max(MARK_END + 0.25, splitEnd - 6 * 0.08);
  const splitGrid = Array.from({ length: 7 }, (_, k) => lerp(splitStart, splitEnd, k / 6));
  const presents = Math.min(nearestBeat(ignite + clamp((dropT - ignite) * 0.3, 0.6, 1.6), ignite + 0.5), dropT - timing.period * 1.5);
  const build = Math.max(presents + 0.3, timing.beatTime(dropBeat - (dropT - presents > 4 ? 2 : 1)));
  const grid = [...splitGrid, ...glyphGrid, presents, build];
  const times = [];
  grid.forEach((g, k) => {
    // Glyph 7 (the ignite) and the beat-aligned events keep their beat; others may snap.
    const keep = k === 13 || k >= 14;
    const snapped = keep ? g : snapToOnset(timing, g, ds * 2);
    const prev = times.at(-1) ?? MARK_END;
    times.push(Math.max(snapped, prev + 0.05));
  });
  const glyph = times.slice(7, 14);
  return {
    split: times.slice(0, 7),
    glyph,
    ignite: glyph[6],
    presents: times[14],
    hush: NEVER,
    pickup: NEVER,
    build: times[15],
    drop: timing.beatTime(dropBeat),
    end,
    endTitle,
    endKicker,
    endFooter,
  };
}

export class IntroScene {
  constructor(ctx, config) {
    this.ctx = ctx;
    this.c = config;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#03030a");
    this.camera = new THREE.PerspectiveCamera(40, 9 / 16, 0.1, 200);
    this.camera.position.set(0, 0, 10);
    this.logoRoot = new THREE.Group();
    this.logoRoot.position.y = LOGO_Y;
    this.scene.add(this.logoRoot);
    this.buildBackdrop();
    this.buildLogo(ctx.assets.logoSvg);
    this.buildWaves();
    this.buildParticles();
    this.buildRings();
  }

  buildBackdrop() {
    const geo = new THREE.PlaneGeometry(40, 70);
    this.backdrop = new THREE.Mesh(
      geo,
      new THREE.ShaderMaterial({
        depthWrite: false,
        uniforms: { uTime: { value: 0 }, uGlow: { value: 0 }, uColor: { value: new THREE.Color(BRAND) } },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: /* glsl */ `
          varying vec2 vUv; uniform float uTime, uGlow; uniform vec3 uColor;
          void main(){
            vec2 p = (vUv - vec2(0.5, 0.505)) * vec2(40.0, 70.0);
            float r = length(p);
            float halo = exp(-r * 0.35) * uGlow;
            vec2 g = abs(fract(p * 1.0) - 0.5);
            float grid = smoothstep(0.48, 0.5, max(g.x, g.y)) * 0.05 * exp(-r * 0.12);
            gl_FragColor = vec4(uColor * (halo * 0.22 + grid) + vec3(0.01, 0.01, 0.03), 1.0);
          }`,
      }),
    );
    this.backdrop.position.z = -6;
    this.scene.add(this.backdrop);
  }

  buildLogo(svgText) {
    const data = new SVGLoader().parse(svgText);
    const shapes = data.paths.flatMap((p) => SVGLoader.createShapes(p));
    const info = shapes.map((s) => {
      const box = new THREE.Box2().setFromPoints(s.getPoints(16));
      return { shape: s, box, cx: (box.min.x + box.max.x) / 2, h: box.max.y - box.min.y };
    });
    const bodies = info.filter((i) => i.h >= 5).sort((a, b) => a.box.min.x - b.box.min.x);
    const groups = bodies.map((b) => ({ shapes: [b.shape], minX: b.box.min.x, maxX: b.box.max.x }));
    for (const dot of info.filter((i) => i.h < 5)) {
      let best = groups[0];
      let bestD = Infinity;
      for (const g of groups) {
        const d = dot.cx < g.minX ? g.minX - dot.cx : dot.cx > g.maxX ? dot.cx - g.maxX : 0;
        const centre = Math.abs((g.minX + g.maxX) / 2 - dot.cx) * 0.01;
        if (d + centre < bestD) {
          bestD = d + centre;
          best = g;
        }
      }
      best.shapes.push(dot.shape);
    }
    this.groups = groups;
    this.groupCount = groups.length;
    this.groupBeat = groups.map((_, g) => this.c.glyph[Math.min(this.c.glyph.length - 2, Math.floor((g * (this.c.glyph.length - 1)) / groups.length))]);
    if (groups.length < this.c.glyph.length) this.groupBeat = groups.map((_, g) => this.c.glyph[g]);

    const k = LOGO_WIDTH / VIEWBOX[0];
    this.logoScale = k;
    this.logoMeshes = groups.map((g) => {
      const geo = new THREE.ExtrudeGeometry(g.shapes, { depth: 1.6, bevelEnabled: true, bevelThickness: 0.35, bevelSize: 0.18, bevelSegments: 3, curveSegments: 16 });
      geo.translate(-VIEWBOX[0] / 2, -VIEWBOX[1] / 2, -0.8);
      const mat = new THREE.ShaderMaterial({
        transparent: true,
        side: THREE.DoubleSide,
        uniforms: {
          uColor: { value: new THREE.Color(BRAND) },
          uOpacity: { value: 0 },
          uFlash: { value: 0 },
          uSweep: { value: -10 },
          uRainbow: { value: 0 },
        },
        vertexShader: /* glsl */ `
          varying vec3 vN; varying vec3 vP;
          void main(){
            vN = normalize(normalMatrix * normal);
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vP = wp.xyz;
            gl_Position = projectionMatrix * viewMatrix * wp;
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uColor; uniform float uOpacity, uFlash, uSweep, uRainbow;
          varying vec3 vN; varying vec3 vP;
          vec3 hsv(float h){ return clamp(abs(mod(h*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0,0.0,1.0); }
          void main(){
            float face = abs(vN.z);
            vec3 base = mix(uColor, hsv(fract(vP.x * 0.18 + vP.y * 0.1 + 0.6)), uRainbow);
            vec3 col = base * (0.35 + 0.95 * face);
            col += vec3(0.6, 0.9, 1.0) * pow(1.0 - face, 3.0) * 0.6;
            float s = exp(-pow((vP.x + vP.y * 0.6 - uSweep) * 3.0, 2.0));
            col += vec3(1.0) * s * 0.9;
            col += vec3(1.0) * uFlash;
            gl_FragColor = vec4(col, uOpacity);
          }`,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.scale.set(k, -k, k);
      this.logoRoot.add(mesh);
      return mesh;
    });

    // Particle targets, allocated to glyph groups by filled area.
    const rasters = groups.map((g) => rasterShapes(g.shapes, VIEWBOX));
    const total = rasters.reduce((a, r) => a + r.length / 2, 0);
    this.targets = new Float32Array(N_PARTICLES * 2);
    this.targetGroup = new Float32Array(N_PARTICLES);
    let n = 0;
    rasters.forEach((r, g) => {
      const quota = g === rasters.length - 1 ? N_PARTICLES - n : Math.round((N_PARTICLES * (r.length / 2)) / total);
      for (let i = 0; i < quota; i++, n++) {
        const j = Math.floor(Math.random() * (r.length / 2)) * 2;
        this.targets[n * 2] = (r[j] + (Math.random() - 0.5) / 12 - VIEWBOX[0] / 2) * k;
        this.targets[n * 2 + 1] = -(r[j + 1] + (Math.random() - 0.5) / 12 - VIEWBOX[1] / 2) * k;
        this.targetGroup[n] = g;
      }
    });
  }

  buildWaves() {
    this.waves = PALETTE.map((color, i) => {
      const uniforms = { uK: { value: WAVE_K[i] }, uA: { value: WAVE_A[i] }, uY: { value: LOGO_Y }, uPhase: { value: 0 } };
      const r = makeRibbon({
        segments: 480,
        width: 0.018,
        color,
        uniforms,
        path: `float x = (u - 0.5) * 5.2; float env = smoothstep(0.0, 0.08, u) * smoothstep(1.0, 0.92, u); return vec3(x, uY + uA * env * sin(uK * x - uPhase + ${i.toFixed(1)}), 0.0);`,
      });
      this.scene.add(r);
      return r;
    });
    const seedUniforms = { uK: { value: 4 }, uA: { value: 0.15 }, uY: { value: LOGO_Y }, uPhase: { value: 0 } };
    this.seedWave = makeRibbon({
      segments: 480,
      width: 0.022,
      color: "#ffffff",
      uniforms: seedUniforms,
      path: `float x = (u - 0.5) * 5.2; float env = smoothstep(0.0, 0.08, u) * smoothstep(1.0, 0.92, u); return vec3(x, uY + uA * env * sin(uK * x - uPhase), 0.0);`,
    });
    this.scene.add(this.seedWave);
  }

  buildParticles() {
    const geo = new THREE.BufferGeometry();
    const seed = new Float32Array(N_PARTICLES * 4);
    for (let i = 0; i < N_PARTICLES; i++) seed.set([Math.floor(Math.random() * 7), Math.random(), Math.random(), Math.random()], i * 4);
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N_PARTICLES * 3), 3));
    geo.setAttribute("aTarget", new THREE.BufferAttribute(this.targets, 2));
    geo.setAttribute("aGroup", new THREE.BufferAttribute(this.targetGroup, 1));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 4));
    const arr = (n, f) => Array.from({ length: n }, f);
    this.pUniforms = {
      uPhase: { value: 0 },
      uWaveY: { value: arr(7, () => LOGO_Y) },
      uWaveK: { value: WAVE_K.slice() },
      uWaveA: { value: WAVE_A.slice() },
      uWaveOn: { value: arr(7, () => 0) },
      uWaveColor: { value: PALETTE.map((c) => new THREE.Color(c)) },
      uGroupP: { value: arr(8, () => 0) },
      uGroupFlash: { value: arr(8, () => 0) },
      uLogoY: { value: LOGO_Y },
      uExplode: { value: 0 },
      uSparkle: { value: 0 },
      uSize: { value: 2.4 },
      uOpacity: { value: 1 },
      uSource: { value: 0 },
      uTime: { value: 0 },
      uBrand: { value: new THREE.Color(BRAND) },
      uSettle: { value: 1 },
    };
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: this.pUniforms,
      vertexShader: /* glsl */ `
        attribute vec2 aTarget; attribute float aGroup; attribute vec4 aSeed;
        uniform float uPhase, uWaveY[7], uWaveK[7], uWaveA[7], uWaveOn[7];
        uniform vec3 uWaveColor[7];
        uniform float uGroupP[8], uGroupFlash[8];
        uniform float uLogoY, uExplode, uSparkle, uSize, uSource, uTime, uSettle;
        uniform vec3 uBrand;
        varying vec3 vColor; varying float vAlpha;
        vec3 hsv(float h){ return clamp(abs(mod(h*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0,0.0,1.0); }
        void main(){
          int w = int(aSeed.x);
          int g = int(aGroup);
          float x = (aSeed.y - 0.5) * 5.2;
          float env = smoothstep(0.0, 0.08, aSeed.y) * smoothstep(1.0, 0.92, aSeed.y);
          vec3 src = vec3(x, uWaveY[w] + uWaveA[w] * env * sin(uWaveK[w] * x - uPhase + float(w)), (aSeed.z - 0.5) * 0.06);
          vec3 srcColor = uWaveColor[w];
          float srcAlpha = uWaveOn[w] * step(aSeed.y, uWaveOn[w] * 1.2);
          if (uSource > 0.5) {
            float th = aSeed.y * 6.2831853 + uTime * 0.4;
            float ph = acos(aSeed.z * 2.0 - 1.0);
            float rr = 3.4 + aSeed.w * 1.5;
            src = vec3(sin(ph) * cos(th) * rr * 0.8, cos(ph) * rr + uLogoY, sin(ph) * sin(th) * rr - 1.0);
            srcColor = hsv(aSeed.y);
            srcAlpha = 1.0;
          }
          float p = uGroupP[g];
          float e = 1.0 - pow(1.0 - p, 3.0);
          vec3 tgt = vec3(aTarget.x, aTarget.y + uLogoY, (aSeed.z - 0.5) * 0.09);
          vec3 mid = mix(src, tgt, 0.5) + vec3((aSeed.z - 0.5) * 2.4, (aSeed.w - 0.5) * 1.8, 0.8 + aSeed.z * 1.6);
          vec3 pos = mix(mix(src, mid, e), mix(mid, tgt, e), e);
          pos += (1.0 - uSettle) * p * vec3(sin(uTime * 3.0 + aSeed.y * 40.0), cos(uTime * 2.6 + aSeed.w * 40.0), 0.0) * 0.012;
          if (uExplode > 0.0) {
            vec3 dir = normalize(vec3(tgt.x, tgt.y - uLogoY, 0.0) * 1.5 + vec3(aSeed.z - 0.5, aSeed.w - 0.5, 0.6 + aSeed.z));
            pos += dir * uExplode * (3.0 + 9.0 * aSeed.w) + vec3(0.0, 0.0, uExplode * uExplode * 6.0 * aSeed.y);
          }
          vec4 mv = modelViewMatrix * vec4(pos, 1.0);
          gl_Position = projectionMatrix * mv;
          float flight = sin(e * 3.14159);
          gl_PointSize = uSize * (0.55 + 0.9 * aSeed.w) * (1.0 + flight * 1.2 + uExplode * 2.0) * (10.0 / -mv.z);
          vec3 c = mix(srcColor, uBrand, smoothstep(0.75, 1.0, p));
          c = mix(c, hsv(aSeed.y + uTime * 0.2), step(0.001, uExplode) * 0.8);
          c *= 1.0 - 0.55 * exp(-uExplode / 0.12) * step(0.001, uExplode);
          c += vec3(1.0) * uGroupFlash[g] * 0.8;
          c += vec3(1.0) * uSparkle * step(0.93, aSeed.z) * 2.0;
          vColor = c;
          vAlpha = mix(srcAlpha * 0.55, 1.0, smoothstep(0.0, 0.15, p));
        }`,
      fragmentShader: /* glsl */ `
        uniform float uOpacity;
        varying vec3 vColor; varying float vAlpha;
        void main(){
          vec2 d = gl_PointCoord - 0.5;
          float r = length(d);
          if (r > 0.5) discard;
          float a = smoothstep(0.5, 0.0, r);
          gl_FragColor = vec4(vColor * a * vAlpha * uOpacity, 1.0);
        }`,
    });
    this.particles = new THREE.Points(geo, mat);
    this.particles.frustumCulled = false;
    this.scene.add(this.particles);
  }

  buildRings() {
    this.rings = Array.from({ length: 6 }, (_, i) => {
      const uniforms = { uR: { value: 1 }, uN: { value: 7 }, uAmp: { value: 0.015 }, uSpin: { value: 0 } };
      const r = makeRibbon({
        segments: 360,
        width: 0.02,
        color: PALETTE[i],
        uniforms,
        path: `float a = u * 6.2831853; float rr = uR * (1.0 + uAmp * sin(a * uN + uSpin)); return vec3(cos(a) * rr * 1.0, sin(a) * rr * 0.62 + ${LOGO_Y.toFixed(2)}, -0.2);`,
      });
      r.material.uniforms.uOpacity.value = 0;
      this.scene.add(r);
      return r;
    });
  }

  update(t) {
    const { timing, hud } = this.ctx;
    const end = t >= this.c.end;
    const pu = this.pUniforms;
    const phase = timing.beatFloat(t) * Math.PI;
    pu.uPhase.value = phase;
    pu.uTime.value = t;
    const post = { bloom: [0.75, 0.45, 0.18], vignette: 0.45 };

    this.backdrop.material.uniforms.uTime.value = t;

    if (!end) this.updateIntro(t, phase, post);
    else this.updateEnd(t, post);

    // Expanding / contracting wave rings around the logo.
    const ringStart = end ? this.c.end : this.c.presents;
    const beatsSince = [];
    for (let i = timing.beatIndexAt(t); i >= 0 && beatsSince.length < 6; i--) {
      const bt = timing.beatTime(i);
      if (bt < ringStart) break;
      beatsSince.push({ bt, i });
    }
    this.rings.forEach((r, j) => {
      const u = r.material.uniforms;
      const b = beatsSince[j];
      if (!b || (!end && t >= this.c.build)) {
        u.uOpacity.value = 0;
        return;
      }
      const age = t - b.bt;
      u.uR.value = 1.95 + age * 2.6;
      u.uN.value = 5 + (b.i % 7) * 2;
      u.uSpin.value = t * 2;
      u.uColor.value.set(PALETTE[b.i % 7]);
      u.uOpacity.value = Math.exp(-age / 0.45) * 0.45;
    });
    if (!end && t >= this.c.build && t < this.c.drop) {
      const k = (t - this.c.build) / (this.c.drop - this.c.build);
      this.rings.forEach((r, j) => {
        const u = r.material.uniforms;
        const local = (k * 3 + j / 6) % 1;
        u.uR.value = lerp(4.2, 1.9, easeInCubic(local));
        u.uN.value = 7 + j * 3;
        u.uSpin.value = t * 6;
        u.uColor.value.set(PALETTE[j]);
        u.uOpacity.value = smooth(0, 0.3, local) * 0.5 * k;
      });
    }
    return post;
  }

  /** Beat pulse that follows the audio mark until the song itself begins. */
  pulse(t, decay) {
    return t < MARK_END ? markPulse(t, decay) : this.ctx.timing.pulse(t, decay);
  }

  updateIntro(t, phase, post) {
    const { timing, hud } = this.ctx;
    const pu = this.pUniforms;

    // Seed wave: drawn on during the first bar, then splits into the seven-band family.
    const seed = this.seedWave.material.uniforms;
    seed.uReveal.value = easeOutCubic((t - MARK_HITS[0][0]) / 1.4);
    seed.uPhase.value = phase;
    seed.uA.value = 0.1 + 0.16 * this.pulse(t, 0.2);
    const splitDone = smooth(this.c.split[6], this.c.split[6] + 0.4, t);
    seed.uOpacity.value = (1 - splitDone) * smooth(0, 0.2, t);
    seed.uGlow.value = 1 + this.pulse(t, 0.12) * 1.5;

    const gSpan = Math.min(0.42, Math.max(0.18, (this.c.ignite - this.c.glyph[0]) * 0.45));
    const formed = this.groupBeat.reduce((a, bt) => a + (t >= bt ? 1 : 0), 0) / this.groupCount;
    this.waves.forEach((w, i) => {
      const u = w.material.uniforms;
      const k = (t - this.c.split[i] + 0.06) / 0.38;
      const on = clamp(k, 0, 1);
      const slot = 1.85 - i * 0.45;
      u.uY.value = lerp(LOGO_Y, slot, easeOutBack(on));
      u.uK.value = lerp(4, WAVE_K[i], easeOutCubic(on));
      u.uA.value = WAVE_A[i] * (1 + 0.6 * this.pulse(t, 0.18));
      u.uPhase.value = phase * (1 + i * 0.15);
      u.uReveal.value = on > 0 ? 1 : 0;
      u.uOpacity.value = on * (1 - smooth(this.c.glyph[0] - 0.2, this.c.ignite + gSpan, t) * 0.92);
      u.uGlow.value = 1 + 2.5 * Math.exp(-Math.max(0, t - this.c.split[i]) / 0.25) * (on > 0 ? 1 : 0);
      pu.uWaveY.value[i] = u.uY.value;
      pu.uWaveK.value[i] = u.uK.value;
      pu.uWaveA.value[i] = u.uA.value;
      pu.uWaveOn.value[i] = on;
    });
    pu.uPhase.value = phase;
    pu.uSource.value = 0;

    this.groupBeat.forEach((bt, g) => {
      pu.uGroupP.value[g] = clamp((t - (bt - gSpan)) / gSpan, 0, 1);
      pu.uGroupFlash.value[g] = t >= bt ? Math.exp(-(t - bt) / 0.18) : 0;
    });
    pu.uSettle.value = 1 - smooth(this.c.drop - 0.6, this.c.drop, t);

    // Solid glyphs ignite as their particles land.
    let sweep = -10;
    if (t > this.c.ignite) sweep = lerp(-3, 3.5, (t - this.c.ignite - 0.1) / 0.9);
    if (t > this.c.presents + 0.95) sweep = lerp(-3, 3.5, (t - this.c.presents - 0.95) / 1.1);
    this.logoMeshes.forEach((m, g) => {
      const bt = this.groupBeat[g];
      const u = m.material.uniforms;
      u.uOpacity.value = smooth(bt - 0.02, bt + gSpan * 0.65, t);
      u.uFlash.value = (t >= bt ? Math.exp(-(t - bt) / 0.2) * 0.9 : 0) + (t >= this.c.ignite ? Math.exp(-(t - this.c.ignite) / 0.35) * 0.8 : 0) + this.pulse(t, 0.1) * 0.08 * u.uOpacity.value;
      u.uSweep.value = sweep;
      const pop = t >= bt ? 1 + 0.25 * Math.exp(-(t - bt) / 0.12) * Math.sin((t - bt) * 30) : 1;
      m.scale.set(this.logoScale * pop, -this.logoScale * pop, this.logoScale * (t >= bt ? 1 : 0.01));
      m.position.z = t < bt ? 0 : 0;
    });
    pu.uOpacity.value = 1 - smooth(this.c.ignite - gSpan, this.c.ignite + gSpan, t) * 0.85;

    // Logo motion: gentle 3D sway once complete, hush dip before the vocal, then shake.
    const sway = smooth(this.c.presents, this.c.presents + 1, t);
    this.logoRoot.rotation.y = Math.sin((t - this.c.presents) * 1.3) * 0.32 * sway;
    this.logoRoot.rotation.x = Math.sin((t - this.c.presents) * 0.9) * 0.08 * sway;
    const hush = smooth(this.c.hush - 0.05, this.c.hush + 0.1, t) * (1 - smooth(this.c.pickup - 0.02, this.c.pickup + 0.04, t));
    const build = smooth(this.c.build, this.c.drop, t);
    const s = 1 - hush * 0.06 + build * 0.12;
    this.logoRoot.scale.setScalar(s);
    const shake = build * 0.05;
    this.logoRoot.position.x = (Math.sin(t * 91) + Math.sin(t * 57)) * shake;
    this.logoRoot.position.y = LOGO_Y + (Math.cos(t * 77) + Math.sin(t * 43)) * shake;

    pu.uSparkle.value = timing.onsetPulse(t, 0.1, 0.08) * smooth(this.c.presents, this.c.presents + 0.5, t) * (t < this.c.hush ? 1 : 0);

    // Explosion after the drop.
    const ex = Math.max(0, t - this.c.drop);
    pu.uExplode.value = ex;
    if (ex > 0) {
      this.logoMeshes.forEach((m) => (m.material.uniforms.uOpacity.value = Math.max(0, 1 - ex / 0.08)));
      pu.uOpacity.value = 1;
      this.waves.forEach((w) => (w.material.uniforms.uOpacity.value = 0));
    }

    this.camera.position.set(0, 0, lerp(10.6, 9.4, smooth(0, this.c.hush, t)) - easeInCubic(ex / 0.48) * 6);
    this.camera.rotation.z = ex * 0.5;
    this.backdrop.material.uniforms.uGlow.value = smooth(this.c.ignite - 0.2, this.c.ignite + 0.6, t) * (0.6 + 0.4 * this.pulse(t, 0.25)) * (1 - hush * 0.8) + build * 0.8;

    // Post choreography.
    const kick = this.pulse(t, 0.14);
    post.flash = Math.max(...this.c.split.map((b) => (t >= b ? Math.exp(-(t - b) / 0.08) * 0.08 : 0)));
    post.flash = Math.max(post.flash, ...this.groupBeat.map((b) => (t >= b ? Math.exp(-(t - b) / 0.1) * 0.14 : 0)));
    post.flash = Math.max(post.flash, markPulse(t, 0.07) * 0.22);
    if (t >= this.c.ignite) post.flash = Math.max(post.flash, Math.exp(-(t - this.c.ignite) / 0.18) * 0.5);
    if (t >= this.c.pickup) post.flash = Math.max(post.flash, Math.exp(-(t - this.c.pickup) / 0.06) * 0.35);
    if (ex > 0) post.flash = Math.exp(-ex / 0.09) * 1.0;
    post.flashColor = ex > 0 ? "#ffffff" : "#bfeaff";
    post.ca = 0.15 + kick * 0.25 + build * 1.4 + (ex > 0 ? 1.5 * Math.exp(-ex / 0.3) : 0);
    post.zoom = 1 + build * 0.05 + kick * 0.008;
    post.fade = hush * 0.55 + (1 - smooth(0, 0.35, t));
    post.glitch = (t >= this.c.pickup && t < this.c.pickup + 0.12 ? 0.8 : 0) + (ex > 0 ? Math.exp(-ex / 0.15) * 0.6 : 0) + build * 0.12;
    if (t >= this.c.ignite) post.shock = [0.5, 0.55, (t - this.c.ignite) * 1.1, Math.exp(-(t - this.c.ignite) / 0.5)];
    if (ex > 0) post.shock = [0.5, 0.55, ex * 1.6, 1.5 * Math.exp(-ex / 0.4)];
    post.bloom = [0.75 + build * 0.5 + (ex > 0 ? 0.5 : 0), 0.45, 0.18];

    // HUD
    const logoBottom = H / 2 - (LOGO_Y * H) / 7.28 + 115;
    const pres = smooth(this.c.presents, this.c.presents + 0.35, t) * (1 - smooth(this.c.build - 0.1, this.c.build + 0.2, t));
    hud.text("P R E S E N T S", 540, logoBottom + 30, { size: 26, weight: 600, family: FONT_MONO, color: "#bfeaff", alpha: pres, glow: 14 });
    const tag = smooth(this.c.presents + 0.95, this.c.presents + 1.3, t) * (1 - smooth(this.c.build - 0.1, this.c.build + 0.2, t));
    hud.text("STEM INSTITUTE", 540, logoBottom + 92, { size: 64, weight: 800, family: FONT_COND, color: "#ffffff", alpha: tag, glow: 22, tracking: 6 });
  }

  updateEnd(t, post) {
    const { timing, hud } = this.ctx;
    const pu = this.pUniforms;
    const k = t - this.c.end;
    pu.uSource.value = 1;
    for (let i = 0; i < 7; i++) pu.uWaveOn.value[i] = 0;
    this.groupBeat.forEach((_, g) => {
      const start = this.c.end + g * 0.06;
      pu.uGroupP.value[g] = clamp((t - start) / 0.46, 0, 1);
      const land = start + 0.46;
      pu.uGroupFlash.value[g] = t >= land ? Math.exp(-(t - land) / 0.2) : 0;
    });
    pu.uExplode.value = 0;
    pu.uSparkle.value = timing.pulse(t, 0.1) * 0.6;
    pu.uSettle.value = 0.3;
    pu.uOpacity.value = 1 - smooth(this.c.end + 0.3, this.c.end + 1.2, t) * 0.85;
    this.seedWave.material.uniforms.uOpacity.value = 0;
    this.waves.forEach((w) => (w.material.uniforms.uOpacity.value = 0));
    const land = this.c.end + 0.46;
    this.logoMeshes.forEach((m) => {
      const u = m.material.uniforms;
      u.uOpacity.value = smooth(land - 0.05, land + 0.25, t);
      u.uFlash.value = t >= land ? Math.exp(-(t - land) / 0.3) : 0;
      u.uSweep.value = lerp(-3, 3.5, ((k - 1.2) % 2.4) / 1.1);
      u.uRainbow.value = 0;
      m.scale.set(this.logoScale, -this.logoScale, this.logoScale);
    });
    this.logoRoot.rotation.set(Math.sin(k * 0.8) * 0.06, Math.sin(k * 0.9) * 0.25, 0);
    this.logoRoot.scale.setScalar(1 + timing.pulse(t, 0.15) * 0.02 * (1 - smooth(this.c.end + 0.7, this.c.end + 2.7, t)));
    this.logoRoot.position.set(0, LOGO_Y, 0);
    this.camera.position.set(0, 0, lerp(8.6, 9.6, easeOutCubic(k / 3)));
    this.camera.rotation.z = 0;
    this.backdrop.material.uniforms.uGlow.value = smooth(land, land + 0.5, t) * (0.7 + 0.3 * timing.pulse(t, 0.25));

    post.flash = t >= land ? Math.exp(-(t - land) / 0.25) * 0.7 : 0;
    post.ca = 0.2 + timing.pulse(t, 0.12) * 0.3;
    post.shock = t >= land ? [0.5, 0.55, (t - land) * 1.2, Math.exp(-(t - land) / 0.6)] : undefined;
    post.fade = smooth(timing.duration - 1.2, timing.duration - 0.05, t);
    post.bloom = [0.8, 0.45, 0.18];

    const logoBottom = H / 2 - (LOGO_Y * H) / 7.28 + 115;
    const a1 = smooth(land + 0.3, land + 0.7, t);
    hud.text(this.c.endTitle, 540, logoBottom + 50, { size: 58, weight: 800, family: FONT_COND, alpha: a1, glow: 20, tracking: 2 });
    const a2 = smooth(land + 0.7, land + 1.1, t);
    hud.text(this.c.endKicker, 540, logoBottom + 112, { size: 26, weight: 600, family: FONT_MONO, color: BRAND, alpha: a2, glow: 12, tracking: 3 });
    const a3 = smooth(land + 1.3, land + 1.8, t);
    hud.text(this.c.endFooter, 540, logoBottom + 190, { size: 34, weight: 600, family: FONT_MONO, color: "#ffffff", alpha: a3 * 0.85 });
  }
}
