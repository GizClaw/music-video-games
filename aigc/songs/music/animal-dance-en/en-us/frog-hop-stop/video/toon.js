import * as THREE from "three";

export const SPHERE = new THREE.SphereGeometry(1, 40, 28);
export const CONE = new THREE.ConeGeometry(1, 1, 16);
export const INK = "#1c2547";

/** Three-band ramp for cel shading. */
export const RAMP = (() => {
  const t = new THREE.DataTexture(new Uint8Array([105, 105, 120, 255, 200, 200, 205, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
})();

/** Inked outline: back faces pushed out along their normals. */
export const OUTLINE = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
OUTLINE.onBeforeCompile = (sh) => {
  sh.vertexShader = sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\ntransformed += normalize(normal) * 0.06;");
};

export const vec = (hex) => {
  const c = new THREE.Color(hex);
  return `vec3(${c.r.toFixed(3)}, ${c.g.toFixed(3)}, ${c.b.toFixed(3)})`;
};

export const toon = (color) => new THREE.MeshToonMaterial({ color, gradientMap: RAMP });

/** Cel-shaded material painted in the mesh's local (unit sphere) space by `paint`, a GLSL body returning vec3 from `vec3 p`. */
export function painted(paint) {
  const m = new THREE.MeshToonMaterial({ color: "#ffffff", gradientMap: RAMP });
  m.userData.uniforms = { uGlow: { value: 0 } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, m.userData.uniforms);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vLocal;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvLocal = position;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", `#include <common>
        varying vec3 vLocal; uniform float uGlow;
        vec3 paint(vec3 p) { ${paint} }`)
      .replace("vec4 diffuseColor = vec4( diffuse, opacity );", "vec4 diffuseColor = vec4( paint(vLocal), opacity );")
      .replace("#include <opaque_fragment>", `
        outgoingLight += vec3(1.0, 0.95, 0.6) * uGlow * (0.35 + pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 2.0));
        #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => paint;
  return m;
}

/** Add a mesh (optionally inked) to `parent`. */
export function part(parent, material, geo, [x, y, z], [sx, sy, sz], rot = null, ink = true) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  if (rot) m.rotation.set(...rot);
  parent.add(m);
  if (ink) m.add(new THREE.Mesh(geo, OUTLINE));
  return m;
}
