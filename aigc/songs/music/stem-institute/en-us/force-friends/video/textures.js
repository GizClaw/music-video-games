import * as THREE from "three";
import { hash } from "@gizclaw/mvg-core/timing.js";

// Small procedural textures painted once at load: wood grain, bark, leaves,
// printed balls, sailcloth and lettering. Randomness is hashed, so every
// worker paints the same pixels.
function paint(w, h, draw, { wrap = false, srgb = true } = {}) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  const tex = new THREE.CanvasTexture(c);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  if (wrap) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

/** Long-grain planks along u, with growth rings, a knot or two and darker gaps between boards. */
export function woodTexture(base = "#b07a45", seed = 1, boards = 1) {
  return paint(512, 128, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    const bh = h / boards;
    for (let b = 0; b < boards; b++) {
      g.save();
      g.beginPath();
      g.rect(0, b * bh, w, bh);
      g.clip();
      g.fillStyle = `rgba(${hash(seed + b) > 0.5 ? "255,230,190" : "60,30,10"},${0.06 + hash(seed * 3 + b) * 0.08})`;
      g.fillRect(0, b * bh, w, bh);
      for (let k = 0; k < 26; k++) {
        const y0 = b * bh + hash(seed * 7 + b * 31 + k) * bh;
        const amp = 2 + hash(seed + k * 1.7) * 6;
        const f = 0.004 + hash(seed * 2 + k) * 0.01;
        g.strokeStyle = `rgba(70,35,12,${0.12 + hash(k * 3.1 + seed) * 0.25})`;
        g.lineWidth = 0.6 + hash(k * 5.3 + seed) * 1.6;
        g.beginPath();
        for (let x = 0; x <= w; x += 8) {
          const y = y0 + Math.sin(x * f + k) * amp + Math.sin(x * f * 3.7 + seed) * amp * 0.3;
          x ? g.lineTo(x, y) : g.moveTo(x, y);
        }
        g.stroke();
      }
      if (hash(seed * 11 + b) > 0.4) {
        const kx = hash(seed * 13 + b) * w;
        const ky = b * bh + bh * (0.3 + hash(seed * 17 + b) * 0.4);
        for (let r = 9; r > 1; r -= 2) {
          g.strokeStyle = `rgba(60,28,8,${0.5 - r * 0.04})`;
          g.lineWidth = 1.2;
          g.beginPath();
          g.ellipse(kx, ky, r * 1.8, r * 0.7, 0, 0, Math.PI * 2);
          g.stroke();
        }
      }
      g.restore();
      if (boards > 1) {
        g.fillStyle = "rgba(30,15,5,0.75)";
        g.fillRect(0, b * bh, w, 2);
      }
    }
  }, { wrap: true });
}

export function barkTexture() {
  return paint(256, 512, (g, w, h) => {
    g.fillStyle = "#5a4030";
    g.fillRect(0, 0, w, h);
    for (let k = 0; k < 90; k++) {
      const x = hash(k * 1.3) * w;
      const width = 2 + hash(k * 2.7) * 7;
      g.strokeStyle = hash(k * 3.9) > 0.5 ? "rgba(35,22,14,0.7)" : "rgba(140,112,88,0.35)";
      g.lineWidth = width;
      g.beginPath();
      for (let y = -10; y <= h + 10; y += 16) {
        const xx = x + Math.sin(y * 0.03 + k) * 5 + (hash(k + y) - 0.5) * 3;
        y < 0 ? g.moveTo(xx, y) : g.lineTo(xx, y);
      }
      g.stroke();
    }
    for (let k = 0; k < 40; k++) {
      g.fillStyle = "rgba(30,20,12,0.5)";
      g.fillRect(hash(k * 5.1) * w, hash(k * 6.3) * h, 6 + hash(k) * 14, 2);
    }
  }, { wrap: true });
}

/** A sprig of overlapping leaves on transparency, used on the foliage cards. */
export function leafTexture() {
  return paint(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let k = 0; k < 16; k++) {
      const a = hash(k * 1.9) * Math.PI * 2;
      const r = 20 + hash(k * 2.3) * 80;
      const x = w / 2 + Math.cos(a) * r * 0.9;
      const y = h / 2 + Math.sin(a) * r * 0.9;
      const len = 34 + hash(k * 3.1) * 22;
      const shade = 0.75 + hash(k * 4.7) * 0.4;
      g.save();
      g.translate(x, y);
      g.rotate(a + Math.PI / 2 + (hash(k * 5.3) - 0.5));
      const grad = g.createLinearGradient(-len * 0.4, 0, len * 0.4, 0);
      grad.addColorStop(0, `rgb(${60 * shade},${120 * shade},${40 * shade})`);
      grad.addColorStop(1, `rgb(${100 * shade},${165 * shade},${60 * shade})`);
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(0, -len);
      g.quadraticCurveTo(len * 0.55, -len * 0.3, 0, len * 0.35);
      g.quadraticCurveTo(-len * 0.55, -len * 0.3, 0, -len);
      g.fill();
      g.strokeStyle = `rgba(200,230,150,${0.35})`;
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(0, -len * 0.9);
      g.lineTo(0, len * 0.4);
      g.stroke();
      g.restore();
    }
  });
}

/** Beach ball: six printed panels meeting at white caps, with thin seams. */
export function ballTexture(colors) {
  return paint(1024, 512, (g, w, h) => {
    colors.forEach((c, k) => {
      g.fillStyle = c;
      g.fillRect((k * w) / colors.length, 0, w / colors.length + 1, h);
    });
    g.fillStyle = "rgba(0,0,0,0.25)";
    for (let k = 0; k < colors.length; k++) g.fillRect((k * w) / colors.length - 1, 0, 3, h);
    g.fillStyle = "#f6f2ea";
    g.fillRect(0, 0, w, h * 0.09);
    g.fillRect(0, h * 0.91, w, h * 0.09);
    g.fillStyle = "rgba(0,0,0,0.25)";
    g.fillRect(0, h * 0.09, w, 2);
    g.fillRect(0, h * 0.91 - 2, w, 2);
  });
}

/** Rubber ball with a white seam that wraps round like a tennis ball's. */
export function seamBallTexture(base) {
  return paint(1024, 512, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    for (let k = 0; k < 2000; k++) {
      g.fillStyle = `rgba(255,255,255,${hash(k * 1.1) * 0.06})`;
      g.fillRect(hash(k * 2.3) * w, hash(k * 3.7) * h, 2, 2);
    }
    g.strokeStyle = "#f8f4e8";
    g.lineWidth = 12;
    g.beginPath();
    for (let x = 0; x <= w; x += 4) {
      const y = h / 2 + Math.sin((x / w) * Math.PI * 4) * h * 0.22;
      x ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.stroke();
  });
}

export function sailTexture() {
  return paint(256, 256, (g, w, h) => {
    g.fillStyle = "#f4efe2";
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 3) {
      g.fillStyle = `rgba(150,140,120,${0.05 + hash(y) * 0.04})`;
      g.fillRect(0, y, w, 1);
    }
    for (let x = 0; x < w; x += 3) {
      g.fillStyle = "rgba(150,140,120,0.04)";
      g.fillRect(x, 0, 1, h);
    }
    g.strokeStyle = "rgba(120,110,90,0.45)";
    g.lineWidth = 2;
    for (let y = 48; y < h; y += 52) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(w, y);
      g.stroke();
    }
  }, { wrap: true });
}

/** A painted letter on transparency, for decals. */
export function letterTexture(letter, color = "#ffffff") {
  return paint(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = color;
    g.font = "800 104px 'Avenir Next Condensed'";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(letter, w / 2, h / 2 + 6);
  });
}

/** Concentric target rings for the drop mat. */
export function targetTexture(color) {
  return paint(256, 256, (g, w, h) => {
    for (let r = 8; r >= 1; r--) {
      g.fillStyle = r % 2 ? color : "#d6cfc0";
      g.beginPath();
      g.arc(w / 2, h / 2, (r / 8) * (w / 2 - 2), 0, Math.PI * 2);
      g.fill();
    }
  });
}

/** Alternating stripes, for the windsock. */
export function stripeTexture(a, b, n = 6) {
  return paint(256, 16, (g, w, h) => {
    for (let k = 0; k < n; k++) {
      g.fillStyle = k % 2 ? b : a;
      g.fillRect((k * w) / n, 0, w / n + 1, h);
    }
  });
}

export function ropeTexture() {
  return paint(64, 64, (g, w, h) => {
    g.fillStyle = "#e6d6b0";
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "rgba(120,95,55,0.55)";
    g.lineWidth = 5;
    for (let k = -2; k < 4; k++) {
      g.beginPath();
      g.moveTo(k * 22, 0);
      g.lineTo(k * 22 + 44, h);
      g.stroke();
    }
  }, { wrap: true });
}

/** A soft round dot, so point sprites read as specks rather than squares. */
export function dotTexture() {
  return paint(64, 64, (g, w, h) => {
    const grad = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.5, "rgba(255,255,255,0.8)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });
}

export function stoneTexture() {
  return paint(256, 256, (g, w, h) => {
    g.fillStyle = "#8d877c";
    g.fillRect(0, 0, w, h);
    for (let k = 0; k < 3000; k++) {
      const v = hash(k * 1.7);
      g.fillStyle = v > 0.5 ? `rgba(255,250,240,${(v - 0.5) * 0.25})` : `rgba(30,28,24,${v * 0.3})`;
      g.fillRect(hash(k * 2.9) * w, hash(k * 4.1) * h, 1 + hash(k) * 3, 1 + hash(k * 7) * 3);
    }
    g.fillStyle = "rgba(80,110,50,0.25)";
    for (let k = 0; k < 30; k++) {
      g.beginPath();
      g.arc(hash(k * 9.1) * w, hash(k * 8.3) * h, 4 + hash(k * 5) * 12, 0, Math.PI * 2);
      g.fill();
    }
  }, { wrap: true });
}
