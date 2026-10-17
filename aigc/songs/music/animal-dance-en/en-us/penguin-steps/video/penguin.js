import * as THREE from "three";

const SPHERE = new THREE.SphereGeometry(1, 48, 32);
const CONE = new THREE.ConeGeometry(1, 1, 16);

/** Egg: a unit sphere widened toward the bottom. */
const EGG = (() => {
  const g = new THREE.SphereGeometry(1, 64, 40);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const k = 1 + 0.16 * Math.max(0, -y) - 0.08 * Math.max(0, y);
    p.setXYZ(i, p.getX(i) * k, y, p.getZ(i) * k);
  }
  g.computeVertexNormals();
  return g;
})();

/** Three-band ramp for cel shading. */
const RAMP = (() => {
  const t = new THREE.DataTexture(new Uint8Array([105, 105, 120, 255, 200, 200, 205, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
})();

const OUTLINE = new THREE.MeshBasicMaterial({ color: "#141a2e", side: THREE.BackSide });
OUTLINE.onBeforeCompile = (sh) => {
  sh.vertexShader = sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\ntransformed += normalize(normal) * 0.06;");
};

function makeMaterial(style, extra = {}) {
  if (style === "toon") return new THREE.MeshToonMaterial({ color: "#ffffff", gradientMap: RAMP, ...extra });
  if (style === "plush") return new THREE.MeshPhysicalMaterial({ color: "#ffffff", roughness: 0.95, sheen: 1, sheenRoughness: 0.55, sheenColor: new THREE.Color("#ffffff"), ...extra });
  return new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.6, ...extra });
}

/**
 * Material whose colour is painted in the mesh's local (unit sphere) space
 * by `paint`, a GLSL body returning vec3 from `vec3 p`, plus a soft rim light.
 */
function painted(style, paint, { rim = "#9fd8ff", rimStrength = 0.45 } = {}) {
  const m = makeMaterial(style);
  m.userData.uniforms = { uRim: { value: new THREE.Color(rim) }, uRimStrength: { value: style === "toon" ? 0.0 : rimStrength }, uGlow: { value: 0 } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, m.userData.uniforms);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vLocal;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvLocal = position;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", `#include <common>
        varying vec3 vLocal; uniform vec3 uRim; uniform float uRimStrength, uGlow;
        vec3 paint(vec3 p) { ${paint} }`)
      .replace("vec4 diffuseColor = vec4( diffuse, opacity );", "vec4 diffuseColor = vec4( paint(vLocal), opacity );")
      .replace("#include <opaque_fragment>", `
        float fres = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 2.6);
        outgoingLight += uRim * fres * uRimStrength + vec3(0.25, 0.85, 1.0) * uGlow * (0.4 + fres);
        #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => style + paint;
  return m;
}

const vec = (hex) => {
  const c = new THREE.Color(hex);
  return `vec3(${c.r.toFixed(3)}, ${c.g.toFixed(3)}, ${c.b.toFixed(3)})`;
};

/**
 * Chibi penguin, about 1.15 units tall, pivoting at its feet: a big round
 * head over a small egg body. `group` carries position and heading; `body`
 * waddles, leans and hops above the feet.
 */
export class Penguin {
  constructor({ chick = false, bow = false, scale = 1, style = "toon" } = {}) {
    this.group = new THREE.Group();
    this.group.rotation.order = "YXZ";
    this.root = new THREE.Group();
    this.root.scale.setScalar(scale);
    this.group.add(this.root);
    this.body = new THREE.Group();
    this.body.rotation.order = "YXZ";
    this.root.add(this.body);
    const outline = style === "toon";

    const DARK = vec(chick ? "#9aa5bb" : "#2d3a63");
    const CREAM = vec(chick ? "#f6f1ea" : "#fff4e4");
    const BLUSH = vec("#ff8fb1");
    const bodyMat = painted(style, `
      float belly = length(vec2(p.x / 0.7, (p.y + 0.1) / 0.9));
      float front = smoothstep(0.0, 0.3, p.z);
      return mix(${DARK}, ${CREAM}, (1.0 - smoothstep(0.97, 1.0, belly)) * front);`);
    const headMat = painted(style, `
      vec2 q = p.xy;
      float lobeL = length(q - vec2(-0.34, -0.06)) - 0.42;
      float lobeR = length(q - vec2(0.34, -0.06)) - 0.42;
      float chin = length((q - vec2(0.0, -0.42)) / vec2(0.7, 0.5)) - 1.0;
      float face = min(min(lobeL, lobeR), chin * 0.45);
      float m = (1.0 - smoothstep(-0.012, 0.012, face)) * smoothstep(0.05, 0.3, p.z);
      vec3 c = mix(${DARK}, ${CREAM}, m);
      float blush = max(1.0 - length((q - vec2(-0.56, -0.34)) / vec2(0.15, 0.1)), 1.0 - length((q - vec2(0.56, -0.34)) / vec2(0.15, 0.1)));
      return mix(c, ${BLUSH}, smoothstep(0.0, 0.5, blush) * 0.9 * m);`);
    this.flipperMat = painted(style, `return ${DARK};`);
    const orange = makeMaterial(style, { color: "#ffa23a" });
    const eyeMat = new THREE.MeshStandardMaterial({ color: "#0d0e1c", roughness: 0.15 });
    const shine = new THREE.MeshBasicMaterial({ color: "#f4f6ff" });
    this.mats = { bodyMat, headMat };

    const add = (parent, material, geo, [x, y, z], [sx, sy, sz], rot = null, line = outline) => {
      const m = new THREE.Mesh(geo, material);
      m.position.set(x, y, z);
      m.scale.set(sx, sy, sz);
      if (rot) m.rotation.set(...rot);
      parent.add(m);
      if (line) m.add(new THREE.Mesh(geo, OUTLINE));
      return m;
    };

    add(this.body, bodyMat, EGG, [0, 0.34, 0], [0.37, 0.35, 0.34]);
    add(this.body, this.flipperMat, CONE, [0, 0.1, -0.31], [0.09, 0.14, 0.05], [-2.1, 0, 0]);

    this.head = new THREE.Group();
    this.head.rotation.order = "YXZ";
    this.head.position.set(0, 0.6, 0.02);
    this.body.add(this.head);
    const R = 0.43;
    add(this.head, headMat, SPHERE, [0, R * 0.62, 0], [R, R * 0.92, R * 0.94]);
    const top = R * 0.62 + R * 0.9;
    for (const [k, rz] of [[-1, 0.55], [0, 0.05], [1, -0.45]]) add(this.head, this.flipperMat, CONE, [k * 0.04, top + 0.03, -0.04], [0.035, 0.12, 0.035], [-0.35, 0, rz], false);

    const eyeY = R * 0.62 - 0.02;
    this.eyes = [-1, 1].map((s) => {
      const e = new THREE.Group();
      e.position.set(s * 0.15, eyeY, R * 0.84);
      e.rotation.y = s * 0.36;
      this.head.add(e);
      add(e, eyeMat, SPHERE, [0, 0, 0], [0.066, 0.082, 0.04], null, false);
      add(e, shine, SPHERE, [s * 0.02, 0.03, 0.03], [0.025, 0.027, 0.012], null, false);
      add(e, shine, SPHERE, [-s * 0.018, -0.026, 0.034], [0.011, 0.011, 0.006], null, false);
      return e;
    });

    this.beak = new THREE.Group();
    this.beak.position.set(0, eyeY - 0.08, R * 0.92);
    this.head.add(this.beak);
    add(this.beak, orange, SPHERE, [0, 0.006, 0.012], [0.05, 0.03, 0.045]);
    this.jaw = new THREE.Group();
    this.beak.add(this.jaw);
    add(this.jaw, orange, SPHERE, [0, -0.02, 0.006], [0.036, 0.018, 0.032], null, false);

    this.flippers = [-1, 1].map((s) => {
      const pivot = new THREE.Group();
      pivot.rotation.order = "YXZ";
      pivot.position.set(s * 0.33, 0.5, 0.0);
      this.body.add(pivot);
      add(pivot, this.flipperMat, SPHERE, [s * 0.025, -0.15, 0.01], [0.06, 0.17, 0.11], [0.1, 0, s * 0.2]);
      return pivot;
    });

    this.feet = [-1, 1].map((s) => {
      const f = new THREE.Group();
      f.position.set(s * 0.14, 0, 0.1);
      f.rotation.y = s * 0.3;
      this.root.add(f);
      add(f, orange, SPHERE, [0, 0.03, 0.05], [0.1, 0.045, 0.12]);
      return f;
    });

    this.bow = null;
    if (bow) {
      const red = makeMaterial(style, { color: "#ff3d78" });
      this.bow = new THREE.Group();
      this.bow.position.set(0, 0.58, 0.3);
      this.body.add(this.bow);
      for (const s of [-1, 1]) add(this.bow, red, SPHERE, [s * 0.058, 0, 0], [0.058, 0.04, 0.024], [0, 0, s * 0.25]);
      add(this.bow, red, SPHERE, [0, 0, 0.012], [0.022, 0.022, 0.02]);
    }
  }

  /**
   * Flipper angles are radians: flap swings out to the side, fwd swings to the
   * front, inward closes a forward flipper toward the chest (a clap at ~0.6).
   */
  pose({
    x = 0, y = 0, z = 0, yaw = 0, pitch = 0, roll = 0,
    hop = 0, tilt = 0, lean = 0, squash = 0,
    flapL = 0.12, flapR = 0.12, fwdL = 0, fwdR = 0, inL = 0, inR = 0,
    stepL = 0, stepR = 0, nod = 0, turn = 0, cock = 0, beak = 0, blink = 0,
    bow = 1, glow = 0, bank = 0,
  } = {}) {
    this.group.position.set(x, y + hop, z);
    this.group.rotation.set(pitch, yaw, roll);
    this.root.rotation.y = bank;
    this.body.rotation.set(lean, 0, tilt);
    this.body.scale.set(1 + squash * 0.12, 1 - squash * 0.16, 1 + squash * 0.12);
    this.head.rotation.set(-nod, turn, cock);
    const [l, r] = this.flippers;
    l.rotation.set(-fwdL, inL, -flapL);
    r.rotation.set(-fwdR, -inR, flapR);
    this.feet[0].position.y = stepL * 0.12;
    this.feet[0].rotation.x = -stepL * 0.6;
    this.feet[1].position.y = stepR * 0.12;
    this.feet[1].rotation.x = -stepR * 0.6;
    const eye = Math.max(0.08, 1 - blink);
    for (const e of this.eyes) e.scale.set(1, eye, 1);
    this.jaw.rotation.x = beak * 0.6;
    if (this.bow) {
      this.bow.scale.setScalar(Math.max(0.0001, bow));
      this.bow.visible = bow > 0.001;
    }
    this.flipperMat.userData.uniforms.uGlow.value = glow;
  }
}
