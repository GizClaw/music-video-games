import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { hash, lerp } from "@gizclaw/mvg-core/timing.js";

export const std = (color, roughness = 0.55, metalness = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
export const phys = (params) => new THREE.MeshPhysicalMaterial(params);
export const glow = (color, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });

/** Static sub-parts collected per material and merged into one mesh each, so a prop costs a few draw calls. */
export class Parts {
  constructor() {
    this.byMat = new Map();
  }

  add(geo, mat, { p = [0, 0, 0], r = [0, 0, 0], s = 1, q = null } = {}) {
    const quat = q ?? new THREE.Quaternion().setFromEuler(new THREE.Euler(...r));
    const scale = typeof s === "number" ? new THREE.Vector3(s, s, s) : new THREE.Vector3(...s);
    const g = geo.clone().applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...p), quat, scale));
    if (!this.byMat.has(mat)) this.byMat.set(mat, []);
    this.byMat.get(mat).push(g);
    return this;
  }

  build(parent = new THREE.Group(), { shadow = true } = {}) {
    for (const [mat, geos] of this.byMat) {
      const flat = geos.some((g) => !g.index) ? geos.map((g) => (g.index ? g.toNonIndexed() : g)) : geos;
      for (const g of flat) {
        for (const k of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(k)) g.deleteAttribute(k);
        g.clearGroups();
      }
      const mesh = new THREE.Mesh(mergeGeometries(flat), mat);
      mesh.castShadow = shadow && !mat.transparent;
      mesh.receiveShadow = !mat.transparent;
      parent.add(mesh);
    }
    return parent;
  }
}

/** A tube along `curve`, optionally scaled per point by `taper(u)` (u = 0 at the start). */
export function tube(curve, radius, { segments = 32, radial = 10, taper = null } = {}) {
  const geo = new THREE.TubeGeometry(curve, segments, radius, radial, false);
  if (taper) {
    const pos = geo.attributes.position;
    const c = new THREE.Vector3();
    for (let i = 0; i <= segments; i++) {
      curve.getPointAt(i / segments, c);
      const k = taper(i / segments);
      for (let j = 0; j <= radial; j++) {
        const v = i * (radial + 1) + j;
        pos.setXYZ(v, c.x + (pos.getX(v) - c.x) * k, c.y + (pos.getY(v) - c.y) * k, c.z + (pos.getZ(v) - c.z) * k);
      }
    }
    geo.computeVertexNormals();
  }
  return geo;
}

export const curve = (pts, closed = false) => new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), closed, "catmullrom", 0.5);

export function mesh(parent, geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = !mat.transparent;
  m.receiveShadow = !mat.transparent;
  parent.add(m);
  return m;
}

/** Lazily built value: canvas textures that print text must wait until the fonts have loaded. */
export const once = (make) => {
  let v;
  return () => (v ??= make());
};

export function canvasTexture(w, h, draw, { repeat = null, color = true } = {}) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  const tex = new THREE.CanvasTexture(c);
  if (color) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  if (repeat) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(...repeat);
  }
  return tex;
}

/** Seeded speckle: `n` soft dots of radius r0–r1 in the given colour. */
export function speckle(ctx, w, h, n, r0, r1, color, seed = 1) {
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) {
    ctx.beginPath();
    ctx.ellipse(hash(i * 1.37 + seed) * w, hash(i * 2.91 + seed) * h, r0 + hash(i * 4.3 + seed) * (r1 - r0), (r0 + hash(i * 5.7 + seed) * (r1 - r0)) * 0.7, hash(i * 7.1 + seed) * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
}

export const rounded = (w, h, r) => {
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -h / 2);
  s.lineTo(w / 2 - r, -h / 2);
  s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  s.lineTo(w / 2, h / 2 - r);
  s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  s.lineTo(-w / 2 + r, h / 2);
  s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  s.lineTo(-w / 2, -h / 2 + r);
  s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  return s;
};

export const lathe = (pts, segments = 48, phiStart = 0, phiLength = Math.PI * 2) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), segments, phiStart, phiLength);

/** Glass: a fresnel rim with a vertical highlight, see-through in the middle. */
export const GLASS = new THREE.ShaderMaterial({
  userData: { outline: true },
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
  vertexShader: "varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }",
  fragmentShader: /* glsl */ `
    varying vec3 vN; varying vec3 vV;
    void main() {
      vec3 n = normalize(vN);
      float f = pow(1.0 - abs(dot(n, normalize(vV))), 2.4);
      float streak = smoothstep(0.5, 0.7, n.x) * (1.0 - smoothstep(0.7, 0.85, n.x)) + 0.5 * smoothstep(-0.45, -0.35, n.x) * (1.0 - smoothstep(-0.35, -0.28, n.x));
      vec3 col = vec3(0.8, 0.93, 1.0) * (f * 1.1 + streak * 0.7) + vec3(0.3, 0.75, 1.0) * pow(f, 3.0) * 0.6;
      gl_FragColor = vec4(col, 0.05 + f * 0.7 + streak * 0.4);
    }`,
});

const MARKS = once(() => canvasTexture(256, 512, (ctx, w, h) => {
  ctx.strokeStyle = "#ffffff";
  ctx.fillStyle = "#ffffff";
  ctx.font = "600 34px Menlo";
  for (let k = 1; k <= 9; k++) {
    const y = h - (k / 10) * h;
    ctx.lineWidth = k % 5 ? 4 : 6;
    ctx.beginPath();
    ctx.moveTo(40, y);
    ctx.lineTo(k % 5 ? 110 : 150, y);
    ctx.stroke();
    if (k % 2 === 0) ctx.fillText(String(k * 25), 125, y + 12);
  }
}));

/**
 * A lab beaker or flask: fresnel glass with a rolled lip, an optional pouring
 * spout (toward +x), printed graduations on the front and a liquid whose top
 * edge carries a bright meniscus ring.
 */
export function glassware(parent, profile, { color = null, fill = 0.5, spout = false, marks = true } = {}) {
  const top = profile.at(-1)[1];
  const geo = lathe(profile, 56);
  if (spout) {
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const k = Math.exp(-((Math.atan2(z, x) / 0.32) ** 2)) * THREE.MathUtils.smoothstep(pos.getY(i), top - 0.35, top);
      pos.setXYZ(i, x * (1 + 0.22 * k), pos.getY(i) + 0.08 * k, z);
    }
    geo.computeVertexNormals();
  }
  const glass = new THREE.Mesh(geo, GLASS);
  glass.renderOrder = 2;
  parent.add(glass);
  const [rimR] = profile.at(-1);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(rimR, 0.035, 8, 56), GLASS);
  lip.rotation.x = Math.PI / 2;
  lip.position.y = top;
  lip.renderOrder = 2;
  if (!spout) parent.add(lip);
  const radiusAt = (y) => {
    for (let i = 1; i < profile.length; i++) if (profile[i][1] >= y) return profile[i - 1][0] + ((profile[i][0] - profile[i - 1][0]) * (y - profile[i - 1][1])) / Math.max(1e-6, profile[i][1] - profile[i - 1][1]);
    return rimR;
  };
  if (marks) {
    const r = radiusAt(top * 0.5) * 1.006;
    const decal = new THREE.Mesh(lathe([[r, top * 0.12], [r, top * 0.82]], 24, -0.5, 1.0), new THREE.MeshBasicMaterial({ map: MARKS(), transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide }));
    decal.renderOrder = 3;
    parent.add(decal);
  }
  let liquid = null;
  if (color) {
    const h = fill * top;
    const pts = profile.filter(([, y]) => y < h).map(([x, y]) => [x * 0.95, y + 0.02]);
    const rh = radiusAt(h) * 0.95;
    pts.push([rh, h], [rh * 0.6, h - 0.015], [0, h - 0.02]);
    liquid = new THREE.Mesh(lathe(pts, 48), phys({ color, roughness: 0.15, transparent: true, opacity: 0.82, clearcoat: 1 }));
    liquid.renderOrder = 1;
    parent.add(liquid);
    const meniscus = new THREE.Mesh(new THREE.TorusGeometry(rh, 0.022, 6, 56), glow("#ffffff", 0.55));
    meniscus.rotation.x = Math.PI / 2;
    meniscus.position.y = h + 0.01;
    meniscus.renderOrder = 2;
    parent.add(meniscus);
  }
  return { liquid, radiusAt };
}

export const BEAKER = [[0, 0], [0.74, 0], [0.8, 0.03], [0.82, 0.08], [0.82, 1.5]];
export const ERLEN = [[0, 0], [0.92, 0], [1.0, 0.04], [1.02, 0.12], [0.92, 0.45], [0.36, 1.85], [0.3, 2.2], [0.3, 2.4]];
export const TUBE = [[0, 0.04], [0.1, 0.06], [0.16, 0.16], [0.18, 0.3], [0.18, 1.9]];

/** Hairline cracks on a cylinder of radius r: an impact star whose rays branch as they run across the glass. */
export function cracks(r, y0, y1, seed) {
  const curves = [];
  const at = (a, y) => new THREE.Vector3(Math.sin(a) * r, y, Math.cos(a) * r);
  const walk = (a, y, da, dy, steps, k) => {
    const pts = [at(a, y)];
    for (let i = 0; i < steps && y > y0 && y < y1; i++) {
      a += da + (hash(seed + k * 13 + i * 1.7) - 0.5) * 0.1;
      y += dy + (hash(seed + k * 7 + i * 3.1) - 0.5) * 0.06;
      pts.push(at(a, y));
      if (i % 3 === 2 && steps > 3) walk(a, y, da + (hash(seed + k + i) - 0.5) * 0.2, dy + (hash(seed + k * 2 + i) - 0.5) * 0.08, Math.floor(steps * 0.5), k * 3 + i);
    }
    if (pts.length > 1) curves.push(new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.1));
  };
  const yc = lerp(y0, y1, 0.6);
  for (let k = 0; k < 8; k++) {
    const dir = (k / 8) * Math.PI * 2 + hash(seed + k) * 0.5;
    walk(0.85, yc, Math.cos(dir) * 0.08, Math.sin(dir) * 0.07, 6 + Math.floor(hash(seed + k * 2) * 6), k + 1);
  }
  curves.push(new THREE.CatmullRomCurve3(Array.from({ length: 9 }, (_, i) => at(0.85 + Math.cos((i / 8) * Math.PI * 2) * 0.07, yc + Math.sin((i / 8) * Math.PI * 2) * 0.06)), true));
  return curves;
}
