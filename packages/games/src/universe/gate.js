import * as THREE from "three";
import { makeRibbon, seededRandom } from "@gizclaw/mvg-core/fx.js";
import { BRAND, smooth } from "@gizclaw/mvg-core/timing.js";
import { makeBrandLogo } from "./logo.js";

const PALETTE = ["#ff3d7f", "#ff8c42", "#ff2e2e", "#ffffff", "#9b5cff", "#3de8ff", "#7cff4f"];
const RINGS = 4;
const PARTICLES = 7000;
/** Height of the wordmark's centre above the stage origin. */
export const LOGO_Y = 35;
/** Half extents of the wordmark, for hit testing. */
export const LOGO_HALF = [270, 60];

/** Rainbow particles on a flattened shell around the wordmark, as in the song outros. */
function makeShell() {
  const rand = seededRandom(23);
  const seed = new Float32Array(PARTICLES * 4);
  for (let i = 0; i < PARTICLES; i++) seed.set([rand(), rand(), rand(), rand()], i * 4);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(PARTICLES * 3), 3));
  geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 4));
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uPulse: { value: 0 }, uFade: { value: 1 }, uSpread: { value: 0 }, uPixel: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute vec4 aSeed;
      uniform float uTime, uPulse, uSpread, uPixel;
      varying vec3 vColor; varying float vA;
      vec3 hsv(float h) { return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
      void main() {
        float th = aSeed.y * 6.2831853 + uTime * (0.12 + aSeed.w * 0.1);
        float ph = acos(aSeed.z * 2.0 - 1.0);
        float rr = (380.0 + aSeed.w * 170.0) * (1.0 + uPulse * 0.04 + uSpread * (1.5 + aSeed.x * 3.0));
        vec3 p = vec3(sin(ph) * cos(th) * rr, cos(ph) * rr * 0.55 + ${LOGO_Y.toFixed(1)}, sin(ph) * sin(th) * rr * 0.6 - 120.0);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float tw = 0.55 + 0.45 * sin(uTime * (1.5 + aSeed.x * 3.0) + aSeed.y * 40.0);
        vColor = mix(hsv(fract(aSeed.y + uTime * 0.03)), vec3(0.6, 0.9, 1.0), 0.25);
        vA = tw * (0.9 + uPulse * 0.9);
        gl_PointSize = (2.5 + aSeed.x * aSeed.x * 7.0) * uPixel * (1200.0 / -mv.z);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uFade;
      varying vec3 vColor; varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = 1.0 - smoothstep(0.0, 1.0, d);
        gl_FragColor = vec4(vColor * a * a * vA * uFade, 1.0);
      }`,
  });
  const points = new THREE.Points(geo, material);
  points.frustumCulled = false;
  return { points, material };
}

/**
 * The opening stage, after the song intros: the extruded haivivi wordmark in a
 * shell of rainbow particles, with faint wave rings breathing out. Clicking
 * the wordmark (or Enter) goes in. `update(t, pulse, hover, px)` animates it;
 * `burst(t)` flashes the logo and blows the shell outward as the camera leaves.
 */
export function makeGate(wordmark, glow) {
  const group = new THREE.Group();
  const logo = makeBrandLogo(wordmark, LOGO_HALF[0] * 2);
  logo.group.position.y = LOGO_Y;
  group.add(logo.group);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: BRAND, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  halo.scale.set(1300, 620, 1);
  halo.position.set(0, LOGO_Y, -120);
  const shell = makeShell();
  group.add(halo, shell.points);

  const rings = Array.from({ length: RINGS }, (_, j) => {
    const uniforms = { uR: { value: 195 }, uN: { value: 7 }, uAmp: { value: 0.015 }, uSpin: { value: 0 } };
    const r = makeRibbon({
      segments: 360,
      width: 1.6,
      color: PALETTE[(j * 2 + 4) % PALETTE.length],
      uniforms,
      path: `float a = u * 6.2831853; float rr = uR * (1.0 + uAmp * sin(a * uN + uSpin)); return vec3(cos(a) * rr, sin(a) * rr * 0.55 + ${LOGO_Y.toFixed(1)}, -20.0);`,
    });
    group.add(r);
    return r;
  });

  let burstAt = Infinity;
  let glowUp = 0;
  return {
    group,
    burst(t) {
      burstAt = t;
    },
    update(t, pulse, hover, px) {
      const since = Math.max(0, t - burstAt);
      const fade = 1 - smooth(0, 1.4, since);
      glowUp += ((hover ? 1 : 0) - glowUp) * 0.15;
      logo.update(t, Math.max(pulse * 0.6, since > 0 ? Math.exp(-since / 0.35) * 2.5 : 0));
      logo.material.uniforms.uDim.value = 1.1 + glowUp * 0.5;
      logo.group.scale.setScalar(1 + glowUp * 0.06);
      halo.material.opacity = (0.3 + pulse * 0.3 + glowUp * 0.2) * fade;
      const su = shell.material.uniforms;
      su.uTime.value = t;
      su.uPulse.value = pulse + glowUp * 0.3;
      su.uFade.value = fade;
      su.uSpread.value = since * since * 0.8;
      su.uPixel.value = px;
      rings.forEach((r, j) => {
        const u = r.material.uniforms;
        const age = (t + j * 0.9) % (RINGS * 0.9);
        u.uR.value = 320 + age * 260;
        u.uN.value = 5 + j * 2;
        u.uSpin.value = t * 2;
        u.uOpacity.value = Math.exp(-age / 1.1) * 0.25 * fade;
      });
      group.visible = since < 3;
    },
  };
}
