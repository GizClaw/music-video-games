import * as THREE from "three";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";
import { BRAND, lerp } from "@gizclaw/mvg-core/timing.js";

const VIEWBOX = [92, 20];
const SWEEP_EVERY = 3.6;

/**
 * The extruded brand-blue haivivi wordmark from the song intros, with the same
 * face shading, rim light and diagonal white glint sweeping across it.
 * `update(t, kick)` runs the glint, a gentle sway and a flash on kicks.
 */
export function makeBrandLogo(svgText, width) {
  const shapes = new SVGLoader().parse(svgText).paths.flatMap((p) => SVGLoader.createShapes(p));
  const geo = new THREE.ExtrudeGeometry(shapes, { depth: 1.6, bevelEnabled: true, bevelThickness: 0.35, bevelSize: 0.18, bevelSegments: 3, curveSegments: 16 });
  geo.translate(-VIEWBOX[0] / 2, -VIEWBOX[1] / 2, -0.8);
  const material = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color(BRAND) }, uFlash: { value: 0 }, uSweep: { value: -200 }, uDim: { value: 1 } },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vL;
      void main() {
        vN = normalize(normalMatrix * normal);
        vL = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uFlash, uSweep, uDim;
      varying vec3 vN; varying vec3 vL;
      void main() {
        float face = clamp(abs(vN.z), 0.0, 1.0);
        float rim = 1.0 - face;
        vec3 col = uColor * (0.12 + 0.4 * face) * uDim;
        col += vec3(0.6, 0.9, 1.0) * rim * rim * 0.9 * uDim;
        float d = (vL.x - vL.y * 0.6 - uSweep) * 0.11;
        col += vec3(0.9, 0.97, 1.0) * exp(-d * d) * 0.6;
        col += vec3(0.6, 0.85, 1.0) * uFlash * uDim;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(geo, material);
  const k = width / VIEWBOX[0];
  mesh.scale.set(k, -k, k);
  const group = new THREE.Group();
  group.add(mesh);
  return {
    group,
    material,
    update(t, kick) {
      const phase = (t % SWEEP_EVERY) / 1.1;
      material.uniforms.uSweep.value = phase <= 1 ? lerp(-84, 98, phase) : -200;
      material.uniforms.uFlash.value = kick * 0.35;
      mesh.rotation.y = Math.sin(t * 1.3) * 0.22;
      mesh.rotation.x = Math.sin(t * 0.9) * 0.06;
      mesh.scale.set(k * (1 + kick * 0.04), -k * (1 + kick * 0.04), k);
    },
  };
}
