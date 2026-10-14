import * as THREE from "three";
import { clamp, easeOutBack, hash } from "@gizclaw/mvg-core/timing.js";

export const NES = {
  navy: "#1d2b53",
  plum: "#7e2553",
  red: "#ff004d",
  orange: "#ffa300",
  yellow: "#ffec27",
  green: "#00e436",
  blue: "#29adff",
  lilac: "#83769c",
  pink: "#ff77a8",
  peach: "#ffccaa",
};
export const NES_CYCLE = [NES.red, NES.orange, NES.yellow, NES.green, NES.blue, NES.pink];

// 5×7 pixel font, rows top to bottom.
const FONT = {
  0: ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  1: ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  2: ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  3: ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  4: ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  5: ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  6: ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  7: ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  8: ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  9: ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
  "=": ["00000", "00000", "11111", "00000", "11111", "00000", "00000"],
};

/** Pixel coordinates (column, row from top) for a string in the 5×7 font, 1px letter gap. */
export function glyphPixels(text) {
  const out = [];
  [...text].forEach((ch, ci) => {
    const rows = FONT[ch];
    if (!rows) return;
    rows.forEach((row, r) => [...row].forEach((bit, c) => bit === "1" && out.push([ci * 6 + c, r, ci])));
  });
  return { pixels: out, width: text.length * 6 - 1 };
}

function glyphTexture(ch, fg, bg, glow) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  g.fillStyle = bg;
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = fg;
  g.globalAlpha = 0.5;
  g.lineWidth = 10;
  g.strokeRect(10, 10, 236, 236);
  g.globalAlpha = 1;
  const { pixels } = glyphPixels(ch);
  const px = 26;
  const ox = (256 - 5 * px) / 2;
  const oy = (256 - 7 * px) / 2;
  g.fillStyle = fg;
  if (glow) {
    g.shadowColor = fg;
    g.shadowBlur = 24;
  }
  for (const [x, y] of pixels) g.fillRect(ox + x * px + 1, oy + y * px + 1, px - 2, px - 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  return tex;
}

/**
 * Four flipping bit cubes (8 4 2 1). `events` is a time-sorted list of
 * { t, index, value }; each cube shows the last value set before t and flips on change.
 */
export class BitRow {
  constructor({ size = 0.95, gap = 0.22 } = {}) {
    this.group = new THREE.Group();
    this.tex = { 1: glyphTexture("1", NES.yellow, NES.red, true), 0: glyphTexture("0", "#3a5a9a", "#0e1630", false) };
    this.cubes = [0, 1, 2, 3].map((i) => {
      const side = new THREE.MeshBasicMaterial({ color: "#16204a" });
      const front = new THREE.MeshBasicMaterial({ map: this.tex[0] });
      const mats = [side, side, side, side, front, front];
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), mats);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: NES.blue, transparent: true }));
      mesh.add(edges);
      mesh.position.x = (i - 1.5) * (size + gap);
      this.group.add(mesh);
      return { mesh, front, side, edges };
    });
    this.labels = [8, 4, 2, 1].map((v, i) => {
      const c = document.createElement("canvas");
      c.width = 128;
      c.height = 64;
      const g = c.getContext("2d");
      g.font = '700 52px "Menlo"';
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillStyle = "#ffffff";
      g.fillText(String(v), 64, 34);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.31), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
      m.position.set((i - 1.5) * (size + gap), -size * 0.95, 0);
      this.group.add(m);
      return m;
    });
    this.size = size;
  }

  stateAt(events, i, t) {
    let cur = 0;
    let prev = 0;
    let at = -99;
    for (const e of events) {
      if (e.t > t) break;
      if (e.index !== i) continue;
      if (e.value !== cur) {
        prev = cur;
        cur = e.value;
        at = e.t;
      }
    }
    return { cur, prev, at };
  }

  value(events, t) {
    return [0, 1, 2, 3].reduce((v, i) => v * 2 + this.stateAt(events, i, t).cur, 0);
  }

  update(events, t, { pulse = 0, labelGlow = null } = {}) {
    this.cubes.forEach((c, i) => {
      const { cur, prev, at } = this.stateAt(events, i, t);
      const p = clamp((t - at) / 0.2, 0, 1);
      const shown = p < 0.5 ? prev : cur;
      c.front.map = this.tex[shown];
      c.mesh.rotation.x = p < 0.5 ? p * Math.PI : (p - 1) * Math.PI;
      const pop = 1 + 0.18 * Math.exp(-(t - at) / 0.12) * (cur ? 1 : 0.3) + pulse * 0.04;
      c.mesh.scale.setScalar(pop);
      const lit = shown ? 1.6 + pulse * 0.8 : 0.8;
      c.front.color.setScalar(lit);
      c.edges.material.color.set(shown ? NES.yellow : NES.blue);
      c.edges.material.opacity = shown ? 1 : 0.6;
      c.mesh.position.y = shown ? Math.sin(t * 9 + i) * 0.02 : 0;
      const lg = labelGlow ? labelGlow[i] : shown;
      this.labels[i].material.color.setScalar(0.5 + lg * 1.5);
      this.labels[i].scale.setScalar(1 + lg * 0.25);
    });
  }
}

/** Instanced voxel text that assembles from scattered cubes when its text changes. */
export class VoxelText {
  constructor({ max = 220, cell = 0.16 } = {}) {
    this.cell = cell;
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(cell * 0.9, cell * 0.9, cell * 0.9), new THREE.MeshBasicMaterial({ color: "#ffffff" }), max);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.mesh.frustumCulled = false;
    this.max = max;
    this.dummy = new THREE.Object3D();
    this.color = new THREE.Color();
  }

  /** Lay out `text` assembled at t0; colors cycle per character. */
  update(text, t, t0, { colors = NES_CYCLE, scale = 1, explode = 0, brightness = 1.4, seed = 1 } = {}) {
    const { pixels, width } = glyphPixels(text);
    const k = this.cell * scale;
    let n = 0;
    for (const [x, y, ci] of pixels) {
      if (n >= this.max) break;
      const r1 = hash(seed * 31 + n * 7.1);
      const r2 = hash(seed * 17 + n * 3.7);
      const r3 = hash(seed * 11 + n * 5.3);
      const delay = r1 * 0.12;
      const p = easeOutBack(clamp((t - t0 - delay) / 0.28, 0, 1));
      const tx = (x - width / 2 + 0.5) * k;
      const ty = (3 - y) * k;
      const sx = tx + (r1 - 0.5) * 8;
      const sy = ty + (r2 - 0.5) * 8;
      const sz = 4 + r3 * 6;
      const ex = explode * (r1 - 0.5) * 10;
      const ey = explode * (r2 - 0.5) * 10;
      const ez = explode * (2 + r3 * 6);
      this.dummy.position.set(sx + (tx - sx) * p + ex, sy + (ty - sy) * p + ey, sz * (1 - p) + ez);
      this.dummy.rotation.set((1 - p) * r2 * 6 + explode * r3 * 4, (1 - p) * r3 * 6, 0);
      this.dummy.scale.setScalar(scale * clamp(p * 1.4, 0, 1) * (1 - clamp(explode * 0.4, 0, 1)));
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(n, this.dummy.matrix);
      this.color.set(colors[ci % colors.length]).multiplyScalar(brightness);
      this.mesh.setColorAt(n, this.color);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }
}

/** Scrolling voxel skyline whose column heights follow the spectrum. */
export class VoxelCity {
  constructor({ cols = 22, rows = 34, cell = 0.9 } = {}) {
    this.cols = cols;
    this.rows = rows;
    this.cellSize = cell;
    const geo = new THREE.BoxGeometry(cell * 0.86, 1, cell * 0.86);
    geo.translate(0, 0.5, 0);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: "#ffffff" }), cols * rows);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cols * rows * 3), 3);
    this.mesh.frustumCulled = false;
    this.edges = new THREE.InstancedMesh(new THREE.BoxGeometry(cell * 0.88, 1, cell * 0.88).translate(0, 0.5, 0), new THREE.MeshBasicMaterial({ color: "#ffffff", wireframe: true, transparent: true, opacity: 0.25 }), cols * rows);
    this.edges.frustumCulled = false;
    this.group = new THREE.Group();
    this.group.add(this.mesh, this.edges);
    this.dummy = new THREE.Object3D();
    this.color = new THREE.Color();
  }

  update(t, timing, { scroll, palette = NES_CYCLE, gap = 3.2, heightScale = 1 }) {
    const spec = timing.spectrum(t);
    const pulse = timing.pulse(t, 0.14);
    const L = this.rows * this.cellSize;
    let n = 0;
    for (let r = 0; r < this.rows; r++) {
      const z = -(((r * this.cellSize - scroll) % L) + L) % L;
      for (let c = 0; c < this.cols; c++) {
        const x = (c - (this.cols - 1) / 2) * this.cellSize;
        const side = Math.abs(x);
        const bin = Math.min(31, Math.floor((side / ((this.cols / 2) * this.cellSize)) * 28));
        const row = Math.floor((r * this.cellSize - scroll) / this.cellSize);
        const jitter = hash(c * 13.1 + row * 7.7);
        let h = 0.15 + Math.pow(spec[bin], 2.2) * 5 * (0.4 + jitter) + pulse * 0.25;
        if (side < gap) h = 0.06;
        h *= heightScale;
        this.dummy.position.set(x, -1.4, z);
        this.dummy.scale.set(1, h, 1);
        this.dummy.updateMatrix();
        this.mesh.setMatrixAt(n, this.dummy.matrix);
        this.edges.setMatrixAt(n, this.dummy.matrix);
        const fade = Math.exp(z / 14);
        this.color.set(palette[(c + row) % palette.length]).multiplyScalar((side < gap ? 0.25 : 0.35 + Math.min(1, h / 4)) * fade);
        this.mesh.setColorAt(n, this.color);
        n++;
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
    this.edges.instanceMatrix.needsUpdate = true;
  }
}
