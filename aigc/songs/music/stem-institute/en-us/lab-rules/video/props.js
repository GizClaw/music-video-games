import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { lerp, smooth } from "@gizclaw/mvg-core/timing.js";

// Every prop stands on y = 0, about two units wide and two to three tall; the
// scene scales it up for its moment and down for its place on the bench.
const std = (color, roughness = 0.55, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
const glow = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
function put(parent, geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

/** Glass: a thin fresnel rim with a vertical highlight, see-through in the middle. */
function glassMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: "varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }",
    fragmentShader: /* glsl */ `
      varying vec3 vN; varying vec3 vV;
      void main() {
        vec3 n = normalize(vN);
        float f = pow(1.0 - abs(dot(n, normalize(vV))), 2.2);
        float streak = smoothstep(0.55, 0.75, n.x) * (1.0 - smoothstep(0.75, 0.9, n.x));
        vec3 col = vec3(0.75, 0.88, 1.0) * (f * 0.55 + streak * 0.7);
        gl_FragColor = vec4(col, 0.05 + f * 0.5 + streak * 0.45);
      }`,
  });
}
const GLASS = glassMaterial();

// Lathe profiles, base at y = 0.
const PROFILES = {
  erlen: [[0, 0], [1.0, 0], [1.05, 0.06], [0.95, 0.4], [0.34, 1.9], [0.3, 2.35], [0.36, 2.42]],
  beaker: [[0, 0], [0.8, 0], [0.84, 0.06], [0.84, 1.45], [0.93, 1.52]],
  tube: [[0, 0.02], [0.12, 0.05], [0.18, 0.2], [0.18, 1.8], [0.22, 1.84]],
  bottle: [[0, 0], [0.62, 0], [0.66, 0.06], [0.66, 1.3], [0.5, 1.6], [0.26, 1.75], [0.26, 1.95]],
};

function lathe(points, shrink = 1, cut = Infinity) {
  const pts = [];
  for (let i = 0; i < points.length; i++) {
    const [x, y] = points[i];
    if (y <= cut) pts.push(new THREE.Vector2(x * shrink, y));
    else {
      const [px, py] = points[i - 1];
      const k = (cut - py) / (y - py);
      pts.push(new THREE.Vector2((px + (x - px) * k) * shrink, cut), new THREE.Vector2(0, cut));
      break;
    }
  }
  return new THREE.LatheGeometry(pts, 40);
}

/** Glass vessel with a coloured liquid filled to `fill` of its height. */
export function vessel(parent, type, color, fill = 0.55) {
  const prof = PROFILES[type];
  const liquid = put(parent, lathe(prof, 0.92, fill * prof.at(-1)[1]), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(0.6), transparent: true, opacity: 0.9 }), 0, 0.02, 0);
  put(parent, lathe(prof), GLASS).renderOrder = 2;
  return liquid;
}

function handShape(skin, sleeve) {
  const group = new THREE.Group();
  const m = std(skin, 0.5);
  put(group, new THREE.CapsuleGeometry(0.42, 0.45, 6, 16), m, 0, 0.95, 0).scale.set(1, 1, 0.45);
  [0.42, 0.56, 0.6, 0.48].forEach((len, k) => {
    const x = -0.3 + k * 0.2;
    put(group, new THREE.CapsuleGeometry(0.1, len, 4, 10), m, x, 1.5 + len / 2, 0).rotation.z = -x * 0.3;
  });
  put(group, new THREE.CapsuleGeometry(0.11, 0.4, 4, 10), m, -0.5, 1.05, 0.06).rotation.z = 0.85;
  put(group, new THREE.CylinderGeometry(0.4, 0.44, 0.55, 20), std(sleeve, 0.65), 0, 0.28, 0);
  return group;
}

function hand() {
  const group = handShape("#f2c29b", "#ff9d3d");
  return { group, tick: (t) => (group.rotation.z = Math.sin(t * 7) * 0.15) };
}

function goggles() {
  const group = new THREE.Group();
  const frame = std("#3ddc84", 0.4);
  const lens = new THREE.MeshStandardMaterial({ color: "#a8ecff", roughness: 0.1, transparent: true, opacity: 0.4 });
  for (const s of [-1, 1]) {
    put(group, new THREE.TorusGeometry(0.5, 0.12, 12, 36), frame, s * 0.6, 1.1, 0).scale.set(1, 0.8, 1);
    put(group, new THREE.CircleGeometry(0.5, 36), lens, s * 0.6, 1.1, 0.03).scale.set(1, 0.8, 1);
  }
  put(group, new THREE.BoxGeometry(0.3, 0.14, 0.14), frame, 0, 1.2, 0);
  put(group, new THREE.TorusGeometry(1.18, 0.07, 8, 40, Math.PI), std("#232a3a", 0.7), 0, 1.1, -0.05).rotation.x = -Math.PI / 2;
  return { group };
}

function gloves() {
  const group = new THREE.Group();
  const left = handShape("#4f8dff", "#2f62c8");
  const right = handShape("#4f8dff", "#2f62c8");
  left.position.x = -0.55;
  right.position.x = 0.55;
  right.scale.x = -1;
  group.add(left, right);
  return { group, tick: (t, act) => [left, right].forEach((h, k) => (h.rotation.z = (k ? -1 : 1) * (0.12 + 0.1 * Math.sin(t * 8) * (1 - act)))) };
}

function hair() {
  const group = new THREE.Group();
  const brown = std("#7a4a2a", 0.85);
  const strands = Array.from({ length: 10 }, (_, k) => {
    const a = (k / 10) * Math.PI * 2;
    const pivot = new THREE.Group();
    pivot.position.set(Math.cos(a) * 0.1, 1.85, Math.sin(a) * 0.1);
    put(pivot, new THREE.CapsuleGeometry(0.15, 1.25, 4, 8), brown, 0, -0.8, 0);
    group.add(pivot);
    return { pivot, a };
  });
  put(group, new THREE.SphereGeometry(0.42, 18, 12), brown, 0, 2.1, 0).scale.set(1, 0.65, 1);
  const tie = put(group, new THREE.TorusGeometry(0.3, 0.15, 12, 28), std("#ff5dc8", 0.45), 0, 1.8, 0);
  tie.rotation.x = Math.PI / 2;
  return {
    group,
    tick: (t, act) => {
      const spread = lerp(0.65, 0.16, act) + Math.sin(t * 5) * 0.04 * (1 - act);
      for (const { pivot, a } of strands) pivot.rotation.set(-Math.sin(a) * spread, 0, Math.cos(a) * spread);
      tie.scale.setScalar(Math.max(0.001, act));
    },
  };
}

function books() {
  const group = new THREE.Group();
  const pages = std("#f2efe4", 0.9);
  const stack = ["#ff5d5d", "#3dc2ff", "#ffd23f"].map((c) => {
    const b = new THREE.Group();
    put(b, new THREE.BoxGeometry(1.8, 0.38, 1.25), std(c, 0.6), 0, 0.19, 0);
    put(b, new THREE.BoxGeometry(1.7, 0.28, 1.29), pages, 0.06, 0.19, 0);
    group.add(b);
    return b;
  });
  const messy = [[-1.3, 0, 0.2, 0.6, 0], [1.2, 0, -0.1, 2.3, 0], [0, 0.55, 0, 1.2, 0.35]];
  return {
    group,
    tick: (t, act) =>
      stack.forEach((b, k) => {
        const [x, y, z, ry, rz] = messy[k];
        b.position.set(lerp(x, 0, act), lerp(y, k * 0.4, act), lerp(z, 0, act));
        b.rotation.set(0, lerp(ry, (k - 1) * 0.12, act), lerp(rz, 0, act));
      }),
  };
}

function steps() {
  const group = new THREE.Group();
  put(group, new THREE.BoxGeometry(1.6, 2.2, 0.1), std("#a0703c", 0.7), 0, 1.1, 0);
  put(group, new THREE.BoxGeometry(1.36, 1.8, 0.04), std("#f4f4f0", 0.9), 0, 1.0, 0.07);
  const boxes = [0, 1, 2, 3].map((k) => {
    put(group, new THREE.BoxGeometry(0.75, 0.07, 0.03), std("#30384a"), 0.12, 1.6 - k * 0.4, 0.1);
    return put(group, new THREE.BoxGeometry(0.18, 0.18, 0.03), std("#9aa4b8", 0.6), -0.45, 1.6 - k * 0.4, 0.1);
  });
  put(group, new THREE.BoxGeometry(0.6, 0.22, 0.2), std("#b8c0cc", 0.3, 0.8), 0, 2.15, 0.08);
  const on = new THREE.Color("#3ddc84");
  const off = new THREE.Color("#9aa4b8");
  return { group, tick: (t, act) => boxes.forEach((b, k) => b.material.color.copy(act > (k + 1) / 5 ? on : off)) };
}

function listen() {
  const group = new THREE.Group();
  const skin = std("#f2c29b", 0.6);
  const ear = new THREE.Group();
  ear.position.set(-0.4, 1.2, 0);
  group.add(ear);
  put(ear, new THREE.TorusGeometry(0.62, 0.22, 14, 36, Math.PI * 1.5), skin).rotation.z = Math.PI * 0.25;
  put(ear, new THREE.SphereGeometry(0.3, 16, 12), std("#d99a78", 0.7), 0.05, 0.05, -0.05).scale.set(1, 1.3, 0.6);
  put(ear, new THREE.SphereGeometry(0.26, 16, 12), skin, 0.12, -0.72, 0);
  const waves = [0, 1, 2].map(() => {
    const w = put(group, new THREE.TorusGeometry(1, 0.06, 6, 24, Math.PI * 0.55), glow("#3dc2ff"), -0.4, 1.2, 0);
    w.rotation.z = -Math.PI * 0.275;
    return w;
  });
  return {
    group,
    tick: (t) =>
      waves.forEach((w, k) => {
        const u = (t * 0.9 + k / 3) % 1;
        w.scale.setScalar(2.0 - u * 1.2);
        w.material.opacity = smooth(0, 0.2, u) * (1 - smooth(0.7, 1, u)) * 0.9;
      }),
  };
}

function food() {
  const group = new THREE.Group();
  [[0.2, "#e3b26b", 0.1, 1], [0.07, "#5fd35f", 0.235, 1.08], [0.06, "#ffd23f", 0.3, 1.04], [0.09, "#ff8fa3", 0.37, 1], [0.2, "#e3b26b", 0.52, 1]].forEach(([h, c, y, s]) => {
    put(group, new THREE.CylinderGeometry(0.85 * s, 0.85 * s, h, 3), std(c, 0.8), -0.6, y, 0.1).rotation.y = 0.3;
  });
  put(group, new THREE.CylinderGeometry(0.42, 0.32, 1.3, 24), std("#ff4f5e", 0.5), 0.75, 0.65, 0);
  put(group, new THREE.CylinderGeometry(0.41, 0.38, 0.22, 24), std("#ffffff", 0.5), 0.75, 0.75, 0);
  put(group, new THREE.CylinderGeometry(0.45, 0.45, 0.1, 24), std("#ffffff", 0.4), 0.75, 1.35, 0);
  put(group, new THREE.CylinderGeometry(0.05, 0.05, 0.9, 8), std("#3dc2ff", 0.4), 0.85, 1.75, 0).rotation.z = -0.25;
  return { group };
}

function shoe() {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  put(body, new RoundedBoxGeometry(2.2, 0.3, 0.85, 3, 0.12), std("#f4f4f4", 0.6), 0, 0.15, 0);
  const red = std("#ff5d5d", 0.5);
  put(body, new THREE.SphereGeometry(1, 24, 16), red, -0.25, 0.55, 0).scale.set(0.9, 0.5, 0.42);
  put(body, new THREE.SphereGeometry(1, 24, 16), red, 0.6, 0.38, 0).scale.set(0.55, 0.3, 0.4);
  for (let k = 0; k < 3; k++) put(body, new THREE.BoxGeometry(0.08, 0.05, 0.5), std("#ffffff", 0.5), 0.05 + k * 0.2, 0.86 - k * 0.1, 0).rotation.z = 0.4;
  const lines = [0.35, 0.65, 0.95].map((y) => put(group, new THREE.BoxGeometry(1, 0.07, 0.07), glow("#ffffff", 0.7), -1.9, y, 0));
  return {
    group,
    tick: (t) => {
      body.position.y = Math.abs(Math.sin(t * 9)) * 0.25;
      body.rotation.z = 0.12 + Math.sin(t * 9) * 0.08;
      lines.forEach((l, k) => {
        const u = (t * 3 + k * 0.37) % 1;
        l.scale.x = 0.3 + u;
        l.position.x = -1.5 - u * 0.8;
        l.material.opacity = 0.7 * (1 - u);
      });
    },
  };
}

function mouth() {
  const group = new THREE.Group();
  put(group, new THREE.TorusGeometry(0.7, 0.2, 14, 36), std("#ff4f6e", 0.45), -0.4, 1.2, 0).scale.set(1, 0.62, 0.8);
  put(group, new THREE.CircleGeometry(0.62, 32), std("#3a0f18", 0.9), -0.4, 1.2, -0.02).scale.set(1, 0.6, 1);
  const tongue = put(group, new THREE.SphereGeometry(0.4, 18, 12), std("#ff8fa8", 0.6), -0.4, 1.0, 0.15);
  tongue.scale.set(0.9, 0.55, 0.5);
  const tube = new THREE.Group();
  tube.position.x = 1.0;
  tube.scale.setScalar(1.15);
  vessel(tube, "tube", "#7cff4f", 0.6);
  group.add(tube);
  return { group, tick: (t) => (tongue.position.y = 1.0 - 0.08 * Math.abs(Math.sin(t * 5))) };
}

function fumes() {
  const group = new THREE.Group();
  const flask = new THREE.Group();
  flask.scale.setScalar(0.85);
  vessel(flask, "erlen", "#9dff4f");
  group.add(flask);
  const puffs = Array.from({ length: 7 }, () => put(group, new THREE.SphereGeometry(0.26, 14, 10), glow("#b6ff8a", 0)));
  return {
    group,
    tick: (t) =>
      puffs.forEach((p, k) => {
        const u = (t * 0.45 + k / 7) % 1;
        p.position.set(Math.sin(u * 7 + k) * 0.4 * u, 2.1 + u * 1.5, 0);
        p.scale.setScalar(0.4 + u * 1.4);
        p.material.opacity = 0.35 * Math.sin(u * Math.PI);
      }),
  };
}

function bottle() {
  const group = new THREE.Group();
  put(group, lathe(PROFILES.bottle), new THREE.MeshStandardMaterial({ color: "#b0601e", roughness: 0.25, transparent: true, opacity: 0.9 }));
  put(group, new THREE.CylinderGeometry(0.675, 0.675, 0.62, 32, 1, true, -1.1, 2.2), std("#f4f1e6", 0.9), 0, 0.72, 0);
  put(group, new THREE.CylinderGeometry(0.68, 0.68, 0.12, 32, 1, true, -1.1, 2.2), std("#3dc2ff", 0.6), 0, 0.92, 0);
  put(group, new THREE.CylinderGeometry(0.68, 0.68, 0.05, 32, 1, true, -0.7, 1.4), std("#30384a", 0.6), 0, 0.68, 0);
  put(group, new THREE.CylinderGeometry(0.68, 0.68, 0.05, 32, 1, true, -0.5, 1.0), std("#30384a", 0.6), 0, 0.56, 0);
  const cap = put(group, new THREE.CylinderGeometry(0.33, 0.33, 0.32, 24), std("#1d2433", 0.5), 0, 2.0, 0);
  return {
    group,
    tick: (t, act) => {
      cap.position.y = 2.0 + 0.6 * (1 - act);
      cap.rotation.y = (1 - act) * 8;
    },
  };
}

function tongs() {
  const group = new THREE.Group();
  const steel = std("#c8d0dc", 0.3, 0.85);
  put(group, new THREE.CylinderGeometry(0.34, 0.24, 0.45, 20), std("#f2f2ee", 0.7), 0, 0.23, 0);
  const arms = [-1, 1].map((s) => {
    const pivot = new THREE.Group();
    pivot.position.y = 1.6;
    put(pivot, new THREE.BoxGeometry(0.1, 2.0, 0.08), steel, 0, -0.35, 0);
    put(pivot, new THREE.BoxGeometry(0.28, 0.08, 0.08), steel, -s * 0.1, -1.33, 0);
    group.add(pivot);
    return { pivot, s };
  });
  put(group, new THREE.CylinderGeometry(0.09, 0.09, 0.2, 12), steel, 0, 1.6, 0).rotation.x = Math.PI / 2;
  return { group, tick: (t, act) => arms.forEach(({ pivot, s }) => (pivot.rotation.z = s * lerp(0.32, 0.13, act))) };
}

function spill() {
  const group = new THREE.Group();
  const tipped = new THREE.Group();
  tipped.position.set(-1.0, 0.84, 0);
  tipped.rotation.z = -Math.PI / 2;
  put(tipped, lathe(PROFILES.beaker), GLASS).renderOrder = 2;
  group.add(tipped);
  const puddle = put(group, new THREE.CircleGeometry(1, 32), glow("#3dc2ff", 0.75), 0.9, 0.02, 0.2);
  puddle.rotation.x = -Math.PI / 2;
  return {
    group,
    tick: (t, act) => {
      const k = 0.35 + 0.65 * act + Math.sin(t * 3) * 0.03;
      puddle.scale.set(1.1 * k, 0.65 * k, 1);
    },
  };
}

function cracked() {
  const group = new THREE.Group();
  const glass = new THREE.Group();
  glass.scale.setScalar(1.2);
  vessel(glass, "beaker", "#ff9d3d", 0.5);
  group.add(glass);
  const on = (a, y) => new THREE.Vector3(Math.sin(a) * 1.02, y, Math.cos(a) * 1.02);
  const paths = [
    [on(0.15, 1.82), on(-0.05, 1.5), on(0.18, 1.25), on(-0.02, 0.95), on(0.22, 0.7)],
    [on(0.18, 1.25), on(0.45, 1.1), on(0.6, 0.85)],
  ];
  const crack = glow("#ffffff", 0.95);
  paths.forEach((p) => put(group, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(p, false, "catmullrom", 0), 24, 0.03, 5), crack));
  put(group, new THREE.TetrahedronGeometry(0.22), GLASS, 1.3, 0.12, 0.6).rotation.set(0.4, 0.3, 0.2);
  return { group, tick: (t, act) => crack.color.set(act > 0 && act < 1 && Math.sin(t * 20) > 0 ? "#ff6a5e" : "#ffffff") };
}

function sponge() {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  put(body, new RoundedBoxGeometry(1.9, 0.62, 1.1, 3, 0.15), std("#ffd23f", 0.95), 0, 0.31, 0);
  put(body, new RoundedBoxGeometry(1.9, 0.2, 1.1, 3, 0.08), std("#3ddc84", 0.9), 0, 0.72, 0);
  const bubbles = Array.from({ length: 8 }, () => put(group, new THREE.SphereGeometry(0.16, 12, 8), glow("#e8fbff", 0)));
  return {
    group,
    tick: (t) => {
      body.position.x = Math.sin(t * 10) * 0.15;
      bubbles.forEach((b, k) => {
        const u = (t * 0.6 + k / 8) % 1;
        b.position.set(Math.sin(k * 2.3) * 1.0, 0.9 + u * 1.3, Math.cos(k * 1.7) * 0.3);
        b.scale.setScalar(0.6 + u * 0.8);
        b.material.opacity = 0.5 * Math.sin(u * Math.PI);
      });
    },
  };
}

function sink() {
  const group = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: "#c8d0dc", roughness: 0.25, metalness: 0.9, side: THREE.DoubleSide });
  put(group, new THREE.LatheGeometry([[0, 0], [0.9, 0], [1.0, 0.05], [1.05, 0.5], [1.14, 0.55]].map(([x, y]) => new THREE.Vector2(x, y)), 40), steel);
  put(group, new THREE.CylinderGeometry(0.12, 0.14, 1.75, 16), steel, -0.8, 1.35, -0.4);
  put(group, new THREE.TorusGeometry(0.45, 0.11, 10, 24, Math.PI), steel, -0.35, 2.2, -0.4);
  const water = put(group, new THREE.CylinderGeometry(0.07, 0.1, 1.55, 12, 1, true), glow("#7fd8ff", 0.6), 0.1, 1.4, -0.4);
  const hands = [-1, 1].map((s) => {
    const h = handShape("#f2c29b", "#ff9d3d");
    h.scale.set(-s * 0.42, 0.42, 0.42);
    h.rotation.z = s * 1.35;
    group.add(h);
    return { h, s };
  });
  const suds = Array.from({ length: 6 }, () => put(group, new THREE.SphereGeometry(0.12, 10, 8), glow("#ffffff", 0)));
  return {
    group,
    tick: (t) => {
      water.material.opacity = 0.45 + 0.2 * Math.sin(t * 30);
      for (const { h, s } of hands) h.position.set(s * (0.55 + 0.08 * Math.sin(t * 12)), 0.95 + 0.05 * Math.sin(t * 12 + s), 0);
      suds.forEach((b, k) => {
        const u = (t * 0.7 + k / 6) % 1;
        b.position.set(Math.sin(k * 2.1) * 0.5, 0.95 + u * 1.0, 0.3);
        b.scale.setScalar(0.5 + u);
        b.material.opacity = 0.6 * Math.sin(u * Math.PI);
      });
    },
  };
}

export const PROPS = { goggles, gloves, hair, books, steps, listen, food, shoe, hand, mouth, fumes, bottle, tongs, spill, cracked, sponge, sink };
