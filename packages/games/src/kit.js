import * as THREE from "three";

/** Published AIGC catalog media, served with `Access-Control-Allow-Origin: *`. */
export const CATALOG_CDN = "https://static-volc.gizclaw.com/aigc/v1";

/** The catalog song audio for a work path such as `songs/music/stem-institute/en-us/spectrum-slide`. */
export const songAudioUrl = (work) => `${CATALOG_CDN}/${work}.ogg`;

/**
 * Song clock for an HTMLAudioElement: `audio.currentTime` advances in coarse
 * steps, so frames read a `performance.now()` extrapolation that is pulled
 * back toward the element's time and re-anchored on seeks and large drift.
 */
export class AudioClock {
  constructor(audio) {
    this.audio = audio;
    this.anchorPerf = 0;
    this.anchorMedia = 0;
    const reanchor = () => this.reanchor();
    audio.addEventListener("playing", reanchor);
    audio.addEventListener("seeked", reanchor);
  }

  reanchor() {
    this.anchorPerf = performance.now();
    this.anchorMedia = this.audio.currentTime;
  }

  now() {
    const { audio } = this;
    if (audio.paused) return audio.currentTime;
    const est = this.anchorMedia + (performance.now() - this.anchorPerf) / 1000;
    const real = audio.currentTime;
    if (Math.abs(est - real) > 0.08) {
      this.reanchor();
      return real;
    }
    this.anchorMedia += (real - est) * 0.03;
    return est;
  }

  /** Resolve once the element can play through. */
  ready() {
    const { audio } = this;
    return new Promise((resolve, reject) => {
      if (audio.readyState >= 3) return resolve();
      audio.addEventListener("canplaythrough", resolve, { once: true });
      audio.addEventListener("error", () => reject(new Error(`audio failed to load: ${audio.src}`)), { once: true });
      audio.load();
    });
  }
}

/** Soft round sprite used for glows, halos and particles. */
export function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.18, "rgba(255,255,255,0.75)");
  grd.addColorStop(0.45, "rgba(255,255,255,0.18)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Chromatic aberration, row glitch, flash and vignette for a real-time game composer. */
export const GamePostShader = {
  uniforms: { tDiffuse: { value: null }, uCA: { value: 0 }, uFlash: { value: 0 }, uFlashColor: { value: new THREE.Color(1, 1, 1) }, uGlitch: { value: 0 }, uTime: { value: 0 } },
  vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uCA, uFlash, uGlitch, uTime; uniform vec3 uFlashColor; varying vec2 vUv;
    float h1(float n) { return fract(sin(n * 91.345) * 47453.5453); }
    void main() {
      vec2 uv = vUv;
      if (uGlitch > 0.0) {
        float row = floor(uv.y * 40.0);
        if (h1(row + floor(uTime * 30.0) * 7.0) < uGlitch * 0.6) uv.x += (h1(row * 3.1 + uTime) - 0.5) * 0.1 * uGlitch;
      }
      vec2 dir = uv - 0.5;
      float ca = uCA * 0.01 + uGlitch * 0.012;
      vec3 col = vec3(texture2D(tDiffuse, uv + dir * ca).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - dir * ca).b);
      col += uFlashColor * uFlash;
      col *= 1.0 - 0.55 * dot(dir, dir) * 2.2;
      gl_FragColor = vec4(col, 1.0);
    }`,
};
