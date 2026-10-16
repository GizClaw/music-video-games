import * as THREE from "three";

// Signed-distance anatomy: smooth unions of round cones and ellipsoids, meshed
// once with surface nets. Normals come from the field gradient, and a cheap
// field-based occlusion term is baked into vertex colours (creases, canal).

const smin = (a, b, k) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};
const smax = (a, b, k) => -smin(-a, -b, k);
const len = (x, y, z) => Math.sqrt(x * x + y * y + z * z);

/** Round cone from a (radius r1) to b (radius r2); returns its distance function. */
function roundCone(a, b, r1, r2) {
  const [ax, ay, az] = a;
  const bax = b[0] - ax;
  const bay = b[1] - ay;
  const baz = b[2] - az;
  const l2 = bax * bax + bay * bay + baz * baz;
  const rr = r1 - r2;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  const fn = (px, py, pz) => {
    const pax = px - ax;
    const pay = py - ay;
    const paz = pz - az;
    const y = pax * bax + pay * bay + paz * baz;
    const z = y - l2;
    const qx = pax * l2 - bax * y;
    const qy = pay * l2 - bay * y;
    const qz = paz * l2 - baz * y;
    const x2 = qx * qx + qy * qy + qz * qz;
    const y2 = y * y * l2;
    const z2 = z * z * l2;
    const k = Math.sign(rr) * rr * rr * x2;
    if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
    if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
    return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
  };
  const c = [(ax + b[0]) / 2, (ay + b[1]) / 2, (az + b[2]) / 2];
  return { fn, c, r: Math.sqrt(l2) / 2 + Math.max(r1, r2) };
}

function ellipsoid([cx, cy, cz], [rx, ry, rz]) {
  const fn = (px, py, pz) => {
    const x = px - cx;
    const y = py - cy;
    const z = pz - cz;
    const k0 = len(x / rx, y / ry, z / rz);
    const k1 = len(x / (rx * rx), y / (ry * ry), z / (rz * rz));
    return (k0 * (k0 - 1)) / k1;
  };
  return { fn, c: [cx, cy, cz], r: Math.max(rx, ry, rz) };
}

/** A field built from shapes blended in order: `add` unions, `cut` subtracts, each with its own smoothness. */
class Field {
  constructor() {
    this.ops = [];
  }

  add(shape, k = 0.05) {
    this.ops.push({ ...shape, k, cut: false });
    return this;
  }

  cut(shape, k = 0.03) {
    this.ops.push({ ...shape, k, cut: true });
    return this;
  }

  chain(points, r0, r1, k = 0.04, cut = false) {
    for (let i = 0; i < points.length - 1; i++) {
      const u0 = i / (points.length - 1);
      const u1 = (i + 1) / (points.length - 1);
      this.ops.push({ ...roundCone(points[i], points[i + 1], r0 + (r1 - r0) * u0, r0 + (r1 - r0) * u1), k: i ? 0.01 : k, cut });
    }
    return this;
  }

  /** Distance at p; shapes whose bounds are clearly beyond the current surface are skipped. */
  eval(px, py, pz, extra) {
    let d = 1e9;
    for (const o of this.ops) {
      const bound = len(px - o.c[0], py - o.c[1], pz - o.c[2]) - o.r;
      if (o.cut) {
        if (bound > o.k || d > 0.2) continue;
        d = smax(d, -o.fn(px, py, pz), o.k);
      } else {
        if (bound > d + o.k) continue;
        d = smin(d, o.fn(px, py, pz), o.k);
      }
    }
    return extra ? d + extra(px, py, pz) : d;
  }
}

/** Surface-nets mesh of the zero level of `f` over a box, with gradient normals and baked occlusion colours. */
export function mesh(f, [x0, y0, z0], [x1, y1, z1], step, { light = [1, 1, 1], dark = [0.6, 0.45, 0.42] } = {}) {
  const nx = Math.ceil((x1 - x0) / step) + 1;
  const ny = Math.ceil((y1 - y0) / step) + 1;
  const nz = Math.ceil((z1 - z0) / step) + 1;
  const field = new Float32Array(nx * ny * nz);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) field[i + nx * (j + ny * k)] = f(x0 + i * step, y0 + j * step, z0 + k * step);
  const at = (i, j, k) => field[i + nx * (j + ny * k)];
  const cell = new Int32Array(nx * ny * nz).fill(-1);
  const pos = [];
  const corners = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const v = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) {
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          v[c] = at(i + corners[c][0], j + corners[c][1], k + corners[c][2]);
          if (v[c] < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let sx = 0;
        let sy = 0;
        let sz = 0;
        let n = 0;
        for (const [a, b] of edges) {
          if (v[a] < 0 === v[b] < 0) continue;
          const t = v[a] / (v[a] - v[b]);
          sx += corners[a][0] + (corners[b][0] - corners[a][0]) * t;
          sy += corners[a][1] + (corners[b][1] - corners[a][1]) * t;
          sz += corners[a][2] + (corners[b][2] - corners[a][2]) * t;
          n++;
        }
        cell[i + nx * (j + ny * k)] = pos.length / 3;
        pos.push(x0 + (i + sx / n) * step, y0 + (j + sy / n) * step, z0 + (k + sz / n) * step);
      }
    }
  }
  const index = [];
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) index.push(a, c, b, a, d, c);
    else index.push(a, b, c, a, c, d);
  };
  const cid = (i, j, k) => (i < 0 || j < 0 || k < 0 ? -1 : cell[i + nx * (j + ny * k)]);
  for (let k = 0; k < nz - 1; k++) {
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const inside = at(i, j, k) < 0;
        if (inside !== at(i + 1, j, k) < 0) quad(cid(i, j - 1, k - 1), cid(i, j, k - 1), cid(i, j, k), cid(i, j - 1, k), !inside);
        if (inside !== at(i, j + 1, k) < 0) quad(cid(i - 1, j, k - 1), cid(i - 1, j, k), cid(i, j, k), cid(i, j, k - 1), !inside);
        if (inside !== at(i, j, k + 1) < 0) quad(cid(i - 1, j - 1, k), cid(i, j - 1, k), cid(i, j, k), cid(i - 1, j, k), !inside);
      }
    }
  }
  const count = pos.length / 3;
  const nor = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const e = step * 0.5;
  for (let q = 0; q < count; q++) {
    const x = pos[q * 3];
    const y = pos[q * 3 + 1];
    const z = pos[q * 3 + 2];
    let gx = f(x + e, y, z) - f(x - e, y, z);
    let gy = f(x, y + e, z) - f(x, y - e, z);
    let gz = f(x, y, z + e) - f(x, y, z - e);
    const gl = len(gx, gy, gz) || 1;
    gx /= gl;
    gy /= gl;
    gz /= gl;
    nor.set([gx, gy, gz], q * 3);
    const ao = Math.min(1, Math.max(0, (f(x + gx * 0.06, y + gy * 0.06, z + gz * 0.06) / 0.06) * 0.55 + (f(x + gx * 0.16, y + gy * 0.16, z + gz * 0.16) / 0.16) * 0.45));
    const s = ao * ao * (3 - 2 * ao);
    col.set([dark[0] + (light[0] - dark[0]) * s, dark[1] + (light[1] - dark[1]) * s, dark[2] + (light[2] - dark[2]) * s], q * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  geo.setIndex(index);
  return geo;
}

/** The same surface for the other side of the body. */
export function mirrorX(geo) {
  const m = geo.clone();
  const p = m.attributes.position;
  const n = m.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    p.setX(i, -p.getX(i));
    n.setX(i, -n.getX(i));
  }
  const idx = m.index.array;
  for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
  m.index.needsUpdate = true;
  return m;
}

const rotX = ([x, y, z], a) => [x, y * Math.cos(a) - z * Math.sin(a), y * Math.sin(a) + z * Math.cos(a)];
const add = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];

/**
 * A right hand standing up from the wrist: back of the hand toward +z, thumb
 * toward -x. Returns the field, its bounds and the fingertip frames (for nails).
 * `glove` thickens it and adds the rolled, ribbed cuff, wrist folds and joint creases.
 */
export function handField({ curl = 0.08, spread = 1, glove = false } = {}) {
  const f = new Field();
  const palm = (px, py, pz) => {
    const qx = Math.abs(px) - 0.31;
    const qy = Math.abs(py - 0.98) - 0.33;
    const qz = Math.abs(pz + 0.01 + 0.04 * (px * px)) - 0.03;
    return len(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - 0.1;
  };
  f.add({ fn: palm, c: [0, 0.98, 0], r: 0.6 }, 0.05);
  f.add(roundCone([0, -0.35, 0], [0, 0.66, 0], 0.22, 0.27), 0.12);
  f.add(ellipsoid([-0.22, 0.72, -0.07], [0.22, 0.3, 0.12]), 0.1);
  f.add(ellipsoid([0.24, 0.74, -0.05], [0.14, 0.3, 0.1]), 0.08);
  const tips = [];
  const creases = [];
  const fingers = [
    [-0.25, [0.4, 0.26, 0.21], 0.084, 0.11],
    [-0.085, [0.44, 0.29, 0.22], 0.088, 0.03],
    [0.085, [0.41, 0.27, 0.21], 0.084, -0.05],
    [0.245, [0.32, 0.21, 0.18], 0.074, -0.14],
  ];
  for (const [x, lens, r, splay] of fingers) {
    const s = splay * spread;
    let at = [x, 1.3 - Math.abs(x) * 0.2, 0.0];
    let dir = [-Math.sin(s), Math.cos(s), 0];
    f.add(ellipsoid(add(at, [0, -0.02, 0.07]), [r * 0.95, r * 0.8, r * 0.6]), 0.05);
    lens.forEach((l, j) => {
      const end = add(at, dir, l);
      const r0 = r * (1 - j * 0.09);
      const r1 = r * (1 - (j + 1) * 0.09) * (j === 2 ? 0.9 : 1);
      f.add(roundCone(at, end, r0, r1), j ? 0.025 : 0.07);
      if (j < 2) {
        const back = rotX(dir, Math.PI / 2);
        f.add(ellipsoid(add(end, back, r1 * 0.55), [r1 * 0.75, r1 * 0.55, r1 * 0.45]), 0.03);
        const palmSide = add(end, back, -r1 * 0.95);
        creases.push(roundCone(add(palmSide, [-r1, 0, 0]), add(palmSide, [r1, 0, 0]), 0.012, 0.012));
        if (glove) {
          const top = add(add(end, back, r1), dir, -0.03);
          creases.push(roundCone(add(top, [-r1 * 0.8, 0, 0]), add(top, [r1 * 0.8, 0, 0]), 0.009, 0.009));
        }
      }
      at = end;
      if (j === 2) tips.push({ at: end, dir, back: rotX(dir, Math.PI / 2), r: r1 });
      dir = rotX(dir, -curl * (j + 1));
    });
  }
  f.add(roundCone([-0.24, 0.58, -0.04], [-0.5, 0.92, -0.06], 0.15, 0.105), 0.13);
  let at = [-0.5, 0.92, -0.06];
  let dir = [-0.45, 0.89, -0.05];
  [0.27, 0.22].forEach((l, j) => {
    const end = add(at, dir, l);
    const r0 = 0.1 - j * 0.012;
    const r1 = 0.088 - j * 0.014;
    f.add(roundCone(at, end, r0, r1), 0.03);
    if (j === 1) tips.push({ at: end, dir, back: [0.35, 0.1, 0.93], r: r1 });
    at = end;
    dir = [dir[0] + 0.14, dir[1], dir[2] - 0.05];
  });
  let extra = null;
  if (glove) {
    const cuff = roundCone([0, 0.4, 0], [0, -0.48, 0], 0.29, 0.4);
    f.add({ ...cuff, fn: (px, py, pz) => smax(cuff.fn(px, py, pz), -0.555 - py, 0.02) }, 0.12);
    f.add({ fn: (px, py, pz) => len(Math.hypot(px, pz) - 0.4, py + 0.5, 0) - 0.055, c: [0, -0.5, 0], r: 0.5 }, 0.03);
    extra = (px, py, pz) => {
      const ribs = py > -0.42 && py < 0.12 ? 0.0028 * Math.sin(py * 130) : 0;
      const wf = Math.exp(-(((py - 0.5) / 0.1) ** 2));
      return ribs + wf * 0.011 * Math.sin(Math.atan2(pz, px) * 5 + py * 30) - 0.012;
    };
  }
  for (const c of creases) f.cut(c, 0.012);
  const spreadX = 0.25 * Math.max(0, spread - 1);
  const bounds = [[-0.98 - spreadX, glove ? -0.62 : -0.42, glove ? -0.5 : -0.42], [0.66 + spreadX, 2.42, glove ? 0.5 : 0.4]];
  return { f: (x, y, z) => f.eval(x, y, z, extra), bounds, tips };
}

/** A right ear seen from the side (face toward -x): one continuous pinna surface. */
export function earField() {
  const outline = new THREE.CatmullRomCurve3([[0, 1.0], [0.45, 0.92], [0.7, 0.58], [0.74, 0.12], [0.58, -0.3], [0.38, -0.58], [0.3, -0.85], [0.1, -1.02], [-0.14, -0.94], [-0.22, -0.62], [-0.32, -0.25], [-0.44, 0.18], [-0.46, 0.6], [-0.3, 0.9]].map(([x, y]) => new THREE.Vector3(x, y, 0)), true).getPoints(120).slice(0, -1);
  // 2D distance to the outline, sampled once on a grid.
  const g = { x0: -0.7, y0: -1.2, s: 0.01 };
  const gw = 150;
  const gh = 240;
  const d2 = new Float32Array(gw * gh);
  for (let j = 0; j < gh; j++) {
    for (let i = 0; i < gw; i++) {
      const px = g.x0 + i * g.s;
      const py = g.y0 + j * g.s;
      let best = 1e9;
      let wind = false;
      for (let a = 0, b = outline.length - 1; a < outline.length; b = a++) {
        const A = outline[a];
        const B = outline[b];
        const ex = B.x - A.x;
        const ey = B.y - A.y;
        const t = Math.max(0, Math.min(1, ((px - A.x) * ex + (py - A.y) * ey) / (ex * ex + ey * ey)));
        best = Math.min(best, Math.hypot(px - A.x - ex * t, py - A.y - ey * t));
        if (A.y > py !== B.y > py && px < ((B.x - A.x) * (py - A.y)) / (B.y - A.y) + A.x) wind = !wind;
      }
      d2[i + gw * j] = wind ? -best : best;
    }
  }
  const outlineDist = (px, py) => {
    const fx = Math.max(0, Math.min(gw - 1.001, (px - g.x0) / g.s));
    const fy = Math.max(0, Math.min(gh - 1.001, (py - g.y0) / g.s));
    const i = Math.floor(fx);
    const j = Math.floor(fy);
    const u = fx - i;
    const w = fy - j;
    const a = d2[i + gw * j] * (1 - u) + d2[i + 1 + gw * j] * u;
    const b = d2[i + gw * (j + 1)] * (1 - u) + d2[i + 1 + gw * (j + 1)] * u;
    return a * (1 - w) + b * w;
  };
  const f = new Field();
  f.add({ fn: (px, py, pz) => {
    const dx = outlineDist(px, py) + 0.07;
    const dz = Math.abs(pz) - 0.06;
    return Math.hypot(Math.max(dx, 0), Math.max(dz, 0)) + Math.min(Math.max(dx, dz), 0) - 0.07;
  }, c: [0, 0, 0], r: 1.4 }, 0.02);
  f.chain([[-0.12, 0.06, 0.1], [-0.36, 0.42, 0.11], [-0.36, 0.66, 0.11], [-0.2, 0.88, 0.1], [0.1, 0.94, 0.1], [0.44, 0.84, 0.1], [0.63, 0.54, 0.1], [0.66, 0.12, 0.1], [0.52, -0.26, 0.09], [0.34, -0.54, 0.07]], 0.075, 0.085, 0.05);
  f.chain([[0.18, -0.44, 0.08], [0.34, -0.12, 0.1], [0.36, 0.22, 0.1], [0.24, 0.52, 0.09], [0.04, 0.66, 0.08]], 0.075, 0.055, 0.05);
  f.chain([[0.36, 0.22, 0.1], [0.1, 0.36, 0.09], [-0.16, 0.38, 0.08]], 0.065, 0.045, 0.04);
  f.add(ellipsoid([-0.42, -0.2, 0.12], [0.1, 0.14, 0.1]), 0.06);
  f.add(ellipsoid([0.1, -0.5, 0.12], [0.12, 0.08, 0.08]), 0.05);
  f.add(ellipsoid([0.08, -0.82, 0.02], [0.23, 0.22, 0.1]), 0.08);
  f.chain([[-0.14, 0.72, 0.23], [0.1, 0.78, 0.23], [0.38, 0.68, 0.23], [0.52, 0.4, 0.23], [0.52, 0.04, 0.22], [0.4, -0.28, 0.2]], 0.075, 0.055, 0.04, true);
  f.cut(ellipsoid([0.02, -0.12, 0.3], [0.3, 0.33, 0.25]), 0.06);
  f.cut(ellipsoid([0.12, 0.47, 0.24], [0.13, 0.08, 0.12]), 0.04);
  f.cut(ellipsoid([-0.2, -0.18, 0.12], [0.08, 0.1, 0.3]), 0.04);
  return { f: (x, y, z) => f.eval(x, y, z), bounds: [[-0.62, -1.15, -0.25], [0.86, 1.12, 0.4]] };
}
