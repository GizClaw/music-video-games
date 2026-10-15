import * as THREE from "three";
import { hash } from "@gizclaw/mvg-core/timing.js";
import { CATEGORY } from "./constants.js";

// World units are 48 px at z = 0 (see table.js); the shelf top sits on screen
// row 238, inside the platform's top chrome, and the bench on row 1620, below
// the lyrics.
const PX = 48;
const rowY = (row) => (960 - row) / PX;
const SHELF_Y = rowY(238);
const BENCH_Y = rowY(1620);

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

// Lathe profiles, base at y = 0, one unit wide-ish; the second list is the liquid fill.
const PROFILES = {
  erlen: [[0, 0], [1.0, 0], [1.05, 0.06], [0.95, 0.4], [0.34, 1.9], [0.3, 2.35], [0.36, 2.42]],
  beaker: [[0, 0], [0.8, 0], [0.84, 0.06], [0.84, 1.45], [0.93, 1.52]],
  cylinder: [[0, 0], [0.3, 0], [0.3, 2.9], [0.37, 2.95]],
  tube: [[0, 0.02], [0.12, 0.05], [0.18, 0.2], [0.18, 1.8], [0.22, 1.84]],
  round: (() => {
    const pts = [[0, 0]];
    for (let k = 1; k <= 14; k++) {
      const a = -Math.PI / 2 + (k / 14) * (Math.PI - 0.28);
      pts.push([Math.cos(a) * 0.95, 0.95 + Math.sin(a) * 0.95]);
    }
    pts.push([0.26, 2.6], [0.32, 2.66]);
    return pts;
  })(),
};
const FILL = { erlen: 0.55, beaker: 0.6, cylinder: 0.7, tube: 0.55, round: 0.45 };

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

export class Lab {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.glass = glassMaterial();
    this.vessels = [];
    const palette = Object.values(CATEGORY).map((c) => c.color);

    const steel = new THREE.MeshStandardMaterial({ color: "#3a4150", metalness: 0.7, roughness: 0.4 });
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(26, 0.3, 2.2), steel);
    shelf.position.set(0, SHELF_Y - 0.15, -1.2);
    this.group.add(shelf);
    for (const x of [-9, 0, 9]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.2, 0.25), steel);
      b.position.set(x, SHELF_Y - 0.8, -2.1);
      this.group.add(b);
    }
    const shelfItems = [
      ["round", -10.4, 1.05], ["erlen", -8.0, 1.1], ["cylinder", -6.2, 1.0], ["beaker", -4.6, 1.05], ["tubes", -2.4, 1.0],
      ["erlen", 0.2, 0.95], ["round", 2.6, 1.0], ["beaker", 4.7, 1.0], ["cylinder", 6.3, 0.95], ["erlen", 8.3, 1.05], ["beaker", 10.4, 0.9],
    ];
    shelfItems.forEach(([type, x, s], i) => {
      if (type === "tubes") {
        const rack = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.5, 0.7), new THREE.MeshStandardMaterial({ color: "#6b4a2e", roughness: 0.7 }));
        rack.position.set(x, SHELF_Y + 0.6, -1.2);
        this.group.add(rack);
        for (let k = 0; k < 5; k++) this.vessel("tube", x - 1.1 + k * 0.55, SHELF_Y, -1.2, 1.1, palette[(i + k) % palette.length]);
      } else this.vessel(type, x, SHELF_Y, -1.2, s, palette[i % palette.length]);
    });

    const slate = new THREE.MeshStandardMaterial({ color: "#14181f", metalness: 0.2, roughness: 0.55 });
    const bench = new THREE.Mesh(new THREE.BoxGeometry(28, 0.6, 4), slate);
    bench.position.set(0, BENCH_Y - 0.3, -1);
    this.group.add(bench);
    this.vessel("beaker", 8.6, BENCH_Y, 0, 1.25, palette[2]);
    this.vessel("erlen", 10.6, BENCH_Y, -0.5, 1.0, palette[0]);
    this.vessel("beaker", -10.6, BENCH_Y, -0.5, 1.0, palette[5]);

    // A Bunsen burner and its flame.
    const brass = new THREE.MeshStandardMaterial({ color: "#b08a4a", metalness: 0.8, roughness: 0.35 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 0.25, 24), brass);
    base.position.set(-8.4, BENCH_Y + 0.12, 0);
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 2.0, 16), brass);
    tube.position.set(-8.4, BENCH_Y + 1.2, 0);
    this.group.add(base, tube);
    this.flameU = { uTime: { value: 0 } };
    this.flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.35, 1.8, 24, 1, true).translate(0, 0.9, 0),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: this.flameU,
        vertexShader: "uniform float uTime; varying vec2 vUv; void main(){ vUv = uv; vec3 p = position; p.x += sin(uTime * 13.0 + p.y * 4.0) * 0.04 * p.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }",
        fragmentShader: "varying vec2 vUv; void main(){ float y = vUv.y; vec3 c = mix(vec3(0.1, 0.3, 1.0), vec3(0.45, 0.65, 1.0), y); gl_FragColor = vec4(c * (1.0 - y) * 0.7, 1.0); }",
      }),
    );
    this.flame.position.set(-8.4, BENCH_Y + 2.2, 0);
    this.group.add(this.flame);
    this.flameLight = new THREE.PointLight("#6aa0ff", 6, 8, 1.5);
    this.flameLight.position.set(-8.4, BENCH_Y + 3, 1);
    this.group.add(this.flameLight);

    // Bubbles rising through every liquid.
    const per = 6;
    const n = this.vessels.length * per;
    this.bubbleSeed = Array.from({ length: n }, (_, i) => [hash(i * 1.3), hash(i * 2.7) * 2 - 1, 0.4 + hash(i * 4.1) * 0.8]);
    const bg = new THREE.BufferGeometry();
    bg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.bubbles = new THREE.Points(bg, new THREE.PointsMaterial({ color: "#e8fbff", size: 0.16, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.bubbles.frustumCulled = false;
    this.group.add(this.bubbles);
    this.per = per;
  }

  vessel(type, x, y, z, s, color) {
    const prof = PROFILES[type];
    const height = prof.at(-1)[1];
    const fill = FILL[type] * height;
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.scale.setScalar(s);
    const liquid = new THREE.Mesh(lathe(prof, 0.92, fill), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(0.55), transparent: true, opacity: 0.9 }));
    liquid.position.y = 0.02;
    const glass = new THREE.Mesh(lathe(prof), this.glass);
    glass.renderOrder = 2;
    g.add(liquid, glass);
    this.group.add(g);
    const rAt = (h) => {
      for (let i = 1; i < prof.length; i++) if (prof[i][1] >= h) return prof[i - 1][0] + ((prof[i][0] - prof[i - 1][0]) * (h - prof[i - 1][1])) / Math.max(1e-6, prof[i][1] - prof[i - 1][1]);
      return 0.2;
    };
    this.vessels.push({ x, y, z, s, fill, liquid, color: new THREE.Color(color), rAt });
  }

  update(t, kick, chorus) {
    this.flameU.uTime.value = t;
    this.flame.scale.set(1, 1 + Math.sin(t * 17) * 0.06 + kick * 0.15, 1);
    this.flameLight.intensity = 5 + Math.sin(t * 23) * 0.8 + kick * 2;
    const bp = this.bubbles.geometry.attributes.position;
    this.vessels.forEach((v, k) => {
      v.liquid.material.color.copy(v.color).multiplyScalar(0.45 + 0.25 * kick + 0.15 * chorus);
      for (let j = 0; j < this.per; j++) {
        const [s0, sx, sp] = this.bubbleSeed[k * this.per + j];
        const h = ((s0 + t * sp * (0.4 + chorus * 0.4)) % 1) * v.fill;
        const r = v.rAt(h) * 0.6;
        bp.setXYZ(k * this.per + j, v.x + sx * r * v.s, v.y + (h + 0.05) * v.s, v.z + 0.3);
      }
    });
    bp.needsUpdate = true;
  }
}
