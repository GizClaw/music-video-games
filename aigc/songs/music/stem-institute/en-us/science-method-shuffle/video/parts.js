import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { hash } from "@gizclaw/mvg-core/timing.js";

// Shared procedural building blocks: textures drawn in code, turned and swept
// geometry, and the bean leaf / seed shapes used at both scales.

export function canvasTexture(w, h, draw, srgb = true) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** Long-grain wood with a few knots; repeat it along the plank. */
export function woodTexture(base, seed, w = 512, h = 128) {
  const tex = canvasTexture(w, h, (g) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      const y = hash(seed + i * 1.7) * h;
      g.strokeStyle = `rgba(70,35,12,${0.05 + hash(seed + i * 3.1) * 0.16})`;
      g.lineWidth = 0.6 + hash(seed + i * 5.3) * 2.2;
      g.beginPath();
      g.moveTo(0, y);
      for (let x = 0; x <= w; x += 16) g.lineTo(x, y + Math.sin(x * 0.012 + i) * 3 + Math.sin(x * 0.05 + i * 2) * 0.8);
      g.stroke();
    }
    for (let k = 0; k < 2; k++) {
      const x = hash(seed * 3 + k) * w;
      const y = hash(seed * 7 + k) * h;
      for (let r = 2; r < 14; r += 2.5) {
        g.strokeStyle = `rgba(60,30,10,${0.35 - r * 0.02})`;
        g.lineWidth = 1.2;
        g.beginPath();
        g.ellipse(x, y, r * 2.2, r, 0, 0, Math.PI * 2);
        g.stroke();
      }
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Fine speckle noise, used as bump maps for clay, soil and metal. */
export function speckleTexture(size, seed, dots = 1400, base = "#808080") {
  const tex = canvasTexture(size, size, (g) => {
    g.fillStyle = base;
    g.fillRect(0, 0, size, size);
    for (let i = 0; i < dots; i++) {
      const v = Math.round(hash(seed + i * 0.37) * 255);
      g.fillStyle = `rgba(${v},${v},${v},0.5)`;
      const r = 0.5 + hash(seed + i * 1.91) * 2.2;
      g.beginPath();
      g.arc(hash(seed + i * 2.3) * size, hash(seed + i * 4.7) * size, r, 0, Math.PI * 2);
      g.fill();
    }
  }, false);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export function lathe(points, segments = 64) {
  return new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), segments);
}

export function rbox(w, h, d, r = 0.015, seg = 3) {
  return new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2, h / 2, d / 2));
}

export function mesh(geo, mat, parent, x = 0, y = 0, z = 0, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = receive;
  parent.add(m);
  return m;
}

/** A rod between two points. */
export function strut(a, b, r, mat, parent, segments = 12) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const m = mesh(new THREE.CylinderGeometry(r, r, dir.length(), segments), mat, parent);
  m.position.copy(a).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return m;
}

/** Tube along a smooth curve through `points`, radius tapering from r0 to r1. */
export function taperTube(points, r0, r1, tubular = 48, radial = 10) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const geo = new THREE.TubeGeometry(curve, tubular, 1, radial, false);
  const pos = geo.attributes.position;
  const c = new THREE.Vector3();
  const v = new THREE.Vector3();
  for (let i = 0; i <= tubular; i++) {
    const u = i / tubular;
    curve.getPointAt(u, c);
    const r = r0 + (r1 - r0) * u;
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      v.fromBufferAttribute(pos, k).sub(c).multiplyScalar(r).add(c);
      pos.setXYZ(k, v.x, v.y, v.z);
    }
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * A cupped leaf blade pointing +x, lying in XZ with its face up. UVs run u0..1
 * along the blade so a texture can keep a plain strip (u < u0) for stalks.
 */
export function bladeGeometry(len, width, { cup = 0.25, droop = 0.12, nu = 20, nv = 10, u0 = 0.04 } = {}) {
  const pos = [];
  const uv = [];
  const idx = [];
  for (let i = 0; i <= nu; i++) {
    const u = i / nu;
    const w = width * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.08)), 0.75) * (1 - 0.35 * u);
    for (let j = 0; j <= nv; j++) {
      const v = (j / nv) * 2 - 1;
      pos.push(u * len, cup * width * v * v - droop * len * u * u, v * w);
      uv.push(u0 + u * (1 - u0), v * 0.5 + 0.5);
    }
  }
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const a = i * (nv + 1) + j;
      const b = a + nv + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

let leafCache = null;

/**
 * Leaf blade at 1024 × 512: epidermal cells (Voronoi walls, domed interiors,
 * chloroplast speck) under midrib, curving side veins and a reticulate net.
 * The cells are only legible under the magnifier. u < 0.04 is plain stalk green;
 * one texture is shared and tinted per plant.
 */
export function leafTexture() {
  if (leafCache) return leafCache;
  const W = 1024;
  const H = 512;
  const CW = 26;
  const gx = Math.ceil(W / CW) + 1;
  const gy = Math.ceil(H / CW) + 1;
  const pts = [];
  for (let j = 0; j < gy; j++) for (let i = 0; i < gx; i++) pts.push([(i + 0.15 + hash(i * 7.1 + j * 13.3) * 0.7) * CW, (j + 0.15 + hash(i * 3.7 + j * 5.9) * 0.7) * CW]);
  leafCache = canvasTexture(W, H, (g) => {
    const img = g.createImageData(W, H);
    for (let y = 0; y < H; y++) {
      const v = Math.abs(y / H - 0.5) * 2;
      for (let x = 0; x < W; x++) {
        const ci = Math.floor(x / CW);
        const cj = Math.floor(y / CW);
        let d1 = 1e9;
        let d2 = 1e9;
        let id = 0;
        for (let j = cj - 1; j <= cj + 1; j++) {
          if (j < 0 || j >= gy) continue;
          for (let i = ci - 1; i <= ci + 1; i++) {
            if (i < 0 || i >= gx) continue;
            const p = pts[j * gx + i];
            const d = (p[0] - x) ** 2 + (p[1] - y) ** 2;
            if (d < d1) {
              d2 = d1;
              d1 = d;
              id = j * gx + i;
            } else if (d < d2) d2 = d;
          }
        }
        const edge = Math.sqrt(d2) - Math.sqrt(d1);
        const wall = Math.max(0, 1 - edge / 2.2);
        const dome = Math.min(1, edge / 9);
        const tone = 0.88 + 0.24 * hash(id * 1.37) + 0.12 * dome - 0.18 * v;
        const speck = hash(x * 0.37 + y * 1.91) > 0.93 ? 0.12 : 0;
        const k = (y * W + x) * 4;
        img.data[k] = (58 + speck * 160) * tone * (1 - wall * 0.55);
        img.data[k + 1] = (138 + speck * 120) * tone * (1 - wall * 0.45);
        img.data[k + 2] = 44 * tone * (1 - wall * 0.5);
        img.data[k + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    g.fillStyle = "#5a9a38";
    g.fillRect(0, 0, 0.04 * W, H);
    g.strokeStyle = "rgba(205,240,160,0.35)";
    g.lineWidth = 1.6;
    for (let i = 0; i < 420; i++) {
      const x = 0.06 * W + hash(i * 1.1) * 0.92 * W;
      const y = hash(i * 2.7) * H;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (hash(i * 3.3) - 0.5) * 60, y + (hash(i * 5.9) - 0.5) * 60);
      g.stroke();
    }
    g.strokeStyle = "rgba(215,248,170,0.75)";
    for (let k = 1; k < 9; k++) {
      const x0 = 0.04 * W + (k / 9) * 0.86 * W;
      for (const s of [1, -1]) {
        g.lineWidth = 5 - k * 0.35;
        g.beginPath();
        g.moveTo(x0, H / 2);
        g.quadraticCurveTo(x0 + 70, H / 2 + s * H * 0.25, x0 + 170, H / 2 + s * H * 0.47);
        g.stroke();
      }
    }
    g.strokeStyle = "rgba(225,250,185,0.9)";
    g.lineWidth = 11;
    g.beginPath();
    g.moveTo(0.04 * W, H / 2);
    g.lineTo(W, H / 2);
    g.stroke();
    g.strokeStyle = "rgba(20,60,15,0.6)";
    g.lineWidth = 6;
    g.strokeRect(0.04 * W, 2, W, H - 4);
  });
  return leafCache;
}

/** Kidney-shaped bean seed, about 2.9 × 1.9 × 1.4, hilum on the -y edge. */
export function beanGeometry() {
  const geo = new THREE.SphereGeometry(1, 72, 48);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i) * 1.45;
    let y = p.getY(i) * 0.95;
    const z = p.getZ(i) * 0.72;
    if (y < 0) y += 0.3 * Math.exp(-x * x * 1.4) * -y;
    y += 0.06 * x * x * 0.3;
    x *= 1 - 0.04 * y;
    p.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Cream seed coat with soft mottling. */
export function seedTexture() {
  return canvasTexture(512, 256, (g, w, h) => {
    g.fillStyle = "#eadcbc";
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 500; i++) {
      g.fillStyle = `rgba(${150 + hash(i) * 60},${120 + hash(i * 2) * 40},${80 + hash(i * 3) * 30},0.12)`;
      g.beginPath();
      g.ellipse(hash(i * 1.3) * w, hash(i * 2.9) * h, 4 + hash(i * 4.1) * 14, 2 + hash(i * 5.7) * 6, hash(i) * 3, 0, Math.PI * 2);
      g.fill();
    }
  });
}

/** Turned brass, clear-coated; knurling comes from a striped bump map on the rim. */
export function brassMaterial(knurl = false) {
  const mat = new THREE.MeshPhysicalMaterial({ color: "#d4a548", metalness: 1, roughness: 0.28, clearcoat: 0.6, clearcoatRoughness: 0.2 });
  if (knurl) {
    const bump = canvasTexture(1024, 16, (g, w, h) => {
      for (let x = 0; x < w; x += 4) {
        g.fillStyle = "#fff";
        g.fillRect(x, 0, 2, h);
        g.fillStyle = "#000";
        g.fillRect(x + 2, 0, 2, h);
      }
    }, false);
    bump.wrapS = THREE.RepeatWrapping;
    bump.repeat.set(2, 1);
    mat.bumpMap = bump;
    mat.bumpScale = 1.4;
  }
  return mat;
}
