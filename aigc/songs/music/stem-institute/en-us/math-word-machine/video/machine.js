import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { clamp, lerp } from "@gizclaw/mvg-core/timing.js";
import { TERMS, TERM_ORDER } from "./constants.js";
import { FLOOR_Y } from "./workshop.js";

// The word machine: a teal cabinet on a pedestal with a marquee, a CRT face, a
// conveyor and stamp press on the left, a gear train on the right and a card
// tray at the front. The body front is at z = FRONT; geometry is in world units.
const FRONT = 0.75;
export const SLOT_X = -1.5;
export const PRESS_X = -2.2;
const BELT_Y = -0.45;
const COND = '"Avenir Next Condensed"';
const MONO = "Menlo";
const TAU = Math.PI * 2;

function canvasTexture(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { c, g: c.getContext("2d"), tex };
}

function gearGeometry(r, teeth, depth) {
  const s = new THREE.Shape();
  const inner = r * 0.84;
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * TAU;
    const step = TAU / teeth;
    const pts = [[inner, a], [r, a + step * 0.2], [r, a + step * 0.5], [inner, a + step * 0.7]];
    pts.forEach(([rr, aa], k) => (i === 0 && k === 0 ? s.moveTo : s.lineTo).call(s, Math.cos(aa) * rr, Math.sin(aa) * rr));
  }
  s.closePath();
  const hole = new THREE.Path();
  hole.absarc(0, 0, r * 0.2, 0, TAU, true);
  s.holes.push(hole);
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * TAU;
    const w = new THREE.Path();
    w.absarc(Math.cos(a) * r * 0.52, Math.sin(a) * r * 0.52, r * 0.14, 0, TAU, true);
    s.holes.push(w);
  }
  return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 1, curveSegments: 12 });
}

function mesh(geo, mat, x, y, z, parent) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

export class WordMachine {
  constructor() {
    this.group = new THREE.Group();
    this.teal = new THREE.MeshStandardMaterial({ color: "#2a8a86", roughness: 0.42, metalness: 0.35 });
    this.cream = new THREE.MeshStandardMaterial({ color: "#e8dcc0", roughness: 0.5 });
    this.dark = new THREE.MeshStandardMaterial({ color: "#1c2228", roughness: 0.55, metalness: 0.4 });
    this.brass = new THREE.MeshStandardMaterial({ color: "#c8973e", roughness: 0.32, metalness: 0.85 });
    this.orange = new THREE.MeshStandardMaterial({ color: "#e0662c", roughness: 0.45, metalness: 0.2 });
    this.buildBody();
    this.buildMarquee();
    this.buildFace();
    this.buildConveyor();
    this.buildGears();
    this.blockTex = new Map();
    this.cardTex = new Map();
  }

  buildBody() {
    const g = this.group;
    mesh(new RoundedBoxGeometry(3.0, 3.4, 1.5, 4, 0.16), this.teal, 0, 0.75, 0, g);
    mesh(new RoundedBoxGeometry(3.2, FLOOR_Y * -1 - 0.95, 1.7, 3, 0.08), this.dark, 0, (-0.95 + FLOOR_Y) / 2, 0, g);
    mesh(new THREE.BoxGeometry(3.04, 0.12, 1.54), this.orange, 0, -0.95, 0, g);
    for (const x of [-1.1, 1.1]) for (let k = 0; k < 4; k++) mesh(new THREE.BoxGeometry(0.5, 0.05, 0.02), this.dark, x, -1.35 - k * 0.14, 0.86, g);
    // Card tray at the front.
    mesh(new THREE.BoxGeometry(1.8, 0.2, 0.12), this.dark, 0, -0.72, FRONT + 0.02, g);
    mesh(new THREE.BoxGeometry(1.9, 0.06, 0.3), this.brass, 0, -0.84, FRONT + 0.1, g);
    // Antenna with a beat lamp.
    mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.9, 8).translate(0, 0.45, 0), this.brass, 1.15, 2.45, -0.3, g);
    this.antenna = mesh(new THREE.SphereGeometry(0.09, 16, 12), new THREE.MeshBasicMaterial({ color: "#ff5d5d" }), 1.15, 3.38, -0.3, g);
  }

  buildMarquee() {
    const g = this.group;
    for (const x of [-0.9, 0.9]) mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 10), this.brass, x, 2.55, 0.2, g);
    mesh(new RoundedBoxGeometry(2.75, 0.68, 0.28, 3, 0.06), this.orange, 0, 2.95, 0.2, g);
    this.marquee = canvasTexture(1024, 224);
    mesh(new THREE.PlaneGeometry(2.5, 0.55), new THREE.MeshBasicMaterial({ map: this.marquee.tex }), 0, 2.95, 0.345, g);
    this.chase = [];
    const n = 28;
    for (let i = 0; i < n; i++) {
      const u = i / n;
      const per = 2 * (2.62 + 0.6);
      let d = u * per;
      let x;
      let y;
      if (d < 2.62) [x, y] = [-1.31 + d, 3.25];
      else if ((d -= 2.62) < 0.6) [x, y] = [1.31, 3.25 - d];
      else if ((d -= 0.6) < 2.62) [x, y] = [1.31 - d, 2.65];
      else [x, y] = [-1.31, 2.65 + d - 2.62];
      this.chase.push(mesh(new THREE.SphereGeometry(0.035, 10, 8), new THREE.MeshBasicMaterial({ color: "#ffd9a0" }), x, y, 0.35, g));
    }
  }

  buildFace() {
    const g = this.group;
    mesh(new RoundedBoxGeometry(2.55, 1.65, 0.16, 3, 0.07), this.dark, 0, 1.35, FRONT, g);
    this.screen = canvasTexture(1024, 624);
    this.screenMat = new THREE.MeshBasicMaterial({ map: this.screen.tex });
    mesh(new THREE.PlaneGeometry(2.3, 1.4), this.screenMat, 0, 1.35, FRONT + 0.085, g);
    this.bulbs = TERM_ORDER.map((id, k) => mesh(new THREE.SphereGeometry(0.075, 16, 12), new THREE.MeshBasicMaterial({ color: TERMS[id].color }), -1.05 + k * 0.3, 2.3, FRONT, g));
    this.gauges = [-1.12, 1.12].map((x) => {
      const face = canvasTexture(128, 128);
      const fg = face.g;
      fg.fillStyle = "#f2ead6";
      fg.beginPath();
      fg.arc(64, 64, 62, 0, TAU);
      fg.fill();
      fg.strokeStyle = "#2a2a2a";
      for (let k = 0; k <= 10; k++) {
        const a = Math.PI * (1.15 - k * 0.13);
        fg.lineWidth = k % 5 ? 3 : 6;
        fg.beginPath();
        fg.moveTo(64 + Math.cos(a) * 50, 64 - Math.sin(a) * 50);
        fg.lineTo(64 + Math.cos(a) * 40, 64 - Math.sin(a) * 40);
        fg.stroke();
      }
      fg.fillStyle = "#d8452e";
      fg.fillRect(88, 30, 20, 8);
      mesh(new THREE.TorusGeometry(0.27, 0.035, 10, 40), this.brass, x, -0.25, FRONT + 0.02, g);
      mesh(new THREE.CircleGeometry(0.26, 40), new THREE.MeshStandardMaterial({ map: face.tex, roughness: 0.4 }), x, -0.25, FRONT + 0.01, g);
      const needle = mesh(new THREE.BoxGeometry(0.02, 0.22, 0.01).translate(0, 0.1, 0), new THREE.MeshBasicMaterial({ color: "#c0301e" }), x, -0.27, FRONT + 0.03, g);
      return needle;
    });
    this.card = mesh(new THREE.BoxGeometry(1.5, 0.62, 0.025), [this.cream, this.cream, this.cream, this.cream, new THREE.MeshBasicMaterial({ color: "#b8b0a0" }), this.cream], 0, -0.7, FRONT + 0.25, g);
    this.card.visible = false;
  }

  buildConveyor() {
    const g = this.group;
    const belt = canvasTexture(256, 32);
    belt.g.fillStyle = "#22262b";
    belt.g.fillRect(0, 0, 256, 32);
    belt.g.fillStyle = "#3a4048";
    for (let x = 0; x < 256; x += 32) belt.g.fillRect(x, 0, 6, 32);
    belt.tex.wrapS = THREE.RepeatWrapping;
    belt.tex.repeat.set(5, 1);
    this.belt = belt.tex;
    const len = 3.4;
    const cx = SLOT_X - len / 2;
    mesh(new THREE.BoxGeometry(len, 0.08, 0.7), new THREE.MeshStandardMaterial({ map: belt.tex, roughness: 0.8 }), cx, BELT_Y - 0.04, 0.35, g);
    for (const z of [0.0, 0.72]) mesh(new THREE.BoxGeometry(len, 0.16, 0.04), this.orange, cx, BELT_Y - 0.06, z - 0.02, g);
    for (const x of [cx - len / 2 + 0.3, cx + len / 2 - 0.3]) mesh(new THREE.BoxGeometry(0.08, FLOOR_Y * -1 + BELT_Y - 0.1, 0.08), this.dark, x, (BELT_Y + FLOOR_Y) / 2, 0.35, g);
    // The slot the blocks disappear into.
    mesh(new THREE.BoxGeometry(0.12, 0.62, 0.8), new THREE.MeshBasicMaterial({ color: "#050608" }), SLOT_X - 0.01, BELT_Y + 0.3, 0.35, g);
    mesh(new THREE.BoxGeometry(0.3, 0.1, 0.9), this.orange, SLOT_X - 0.1, BELT_Y + 0.66, 0.35, g);
    // Stamp press over the belt.
    for (const z of [-0.05, 0.75]) mesh(new THREE.BoxGeometry(0.08, 1.5, 0.08), this.dark, PRESS_X, BELT_Y + 0.75, z, g);
    mesh(new THREE.BoxGeometry(0.3, 0.12, 0.9), this.dark, PRESS_X, BELT_Y + 1.5, 0.35, g);
    this.ram = mesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 10).translate(0, 0.5, 0), this.brass, PRESS_X, 0, 0.35, g);
    this.hammer = mesh(new THREE.BoxGeometry(0.5, 0.18, 0.6), this.orange, PRESS_X, 0, 0.35, g);
    this.blocks = Array.from({ length: 6 }, () => {
      const front = new THREE.MeshBasicMaterial({ color: "#b0b0b0" });
      const side = new THREE.MeshStandardMaterial({ color: "#e8dcc0", roughness: 0.5 });
      const m = mesh(new RoundedBoxGeometry(0.8, 0.42, 0.42, 2, 0.05), [side, side, side, side, front, side], 0, BELT_Y + 0.21, 0.35, g);
      m.visible = false;
      return { m, front, side };
    });
  }

  buildGears() {
    this.gears = [[0.5, 16, 1.95, 1.75], [0.32, 10, 1.95, 0.98], [0.28, 9, 2.12, 0.42]].map(([r, n, x, y], k) => {
      const m = mesh(gearGeometry(r, n, 0.1), this.brass, x, y, 0.2 + k * 0.02, this.group);
      return { m, r, dir: k % 2 ? -1 : 1 };
    });
    mesh(new THREE.BoxGeometry(0.12, 2.0, 0.1), this.dark, 1.62, 1.1, 0.12, this.group);
  }

  labelTexture(cache, key, w, h, draw) {
    if (!cache.has(key)) {
      const t = canvasTexture(w, h);
      draw(t.g, w, h);
      cache.set(key, t.tex);
    }
    return cache.get(key);
  }

  /** s: the scene's per-frame state (see ShopScene.machineState). */
  update(s) {
    const { t, kick, power } = s;
    this.drawMarquee(s.marquee, power, t);
    this.drawScreen(s.screen, power, t, s.bf);
    this.chase.forEach((b, i) => {
      const on = (i + Math.floor(s.bf * (1 + s.chase))) % 3 === 0 ? 1 : 0.25;
      b.material.color.set("#ffd9a0").multiplyScalar(power * lerp(0.35, on * 1.1, 0.4 + 0.6 * s.chase));
    });
    this.bulbs.forEach((b, k) => {
      b.material.color.set(TERMS[TERM_ORDER[k]].color).multiplyScalar(power * lerp(0.12, 1, s.bulbs[k]));
      b.scale.setScalar(1 + s.bulbFlash[k] * 0.5);
    });
    this.antenna.material.color.set("#ff5d5d").multiplyScalar(power * (0.3 + kick));
    this.gauges.forEach((n, i) => (n.rotation.z = power * (0.9 - s.gauge[i] * 1.8)));
    this.gears.forEach(({ m, r, dir }) => (m.rotation.z = (dir * s.gearAngle * 0.5) / r));
    this.belt.offset.x = -s.beltShift / 0.68;

    const press = s.press;
    this.hammer.position.y = BELT_Y + 1.2 - press * 0.73;
    this.ram.position.y = this.hammer.position.y;
    this.ram.scale.y = BELT_Y + 1.44 - this.hammer.position.y;

    this.blocks.forEach((b, i) => {
      const blk = s.blocks[i];
      b.m.visible = !!blk;
      if (!blk) return;
      b.m.position.x = blk.x;
      b.m.scale.set(1, 1 - blk.squash * 0.25, 1);
      b.m.position.y = BELT_Y + 0.21 * (1 - blk.squash * 0.25);
      b.front.map = this.labelTexture(this.blockTex, blk.label + blk.color, 256, 134, (g, w, h) => {
        g.fillStyle = blk.color;
        g.fillRect(0, 0, w, h);
        g.fillStyle = "#14161c";
        g.font = `800 ${blk.label.length > 4 ? 76 : 92}px ${COND}`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(blk.label, w / 2, h / 2 + 4);
      });
      b.front.needsUpdate = true;
      b.side.color.set(blk.color).multiplyScalar(0.8);
    });

    const card = s.card;
    this.card.visible = !!card;
    if (card) {
      this.card.material[4].map = this.labelTexture(this.cardTex, card.key, 512, 212, (g, w, h) => drawCard(g, w, h, card.parts));
      this.card.material[4].needsUpdate = true;
      this.card.position.set(0, card.y, FRONT + 0.25 + card.z);
      this.card.rotation.set(card.tilt, 0, card.roll);
      this.card.scale.setScalar(card.scale);
    }
  }

  drawMarquee(m, power, t) {
    const { g, c, tex } = this.marquee;
    g.fillStyle = "#2a0e08";
    g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = "#7a3a1a";
    g.lineWidth = 8;
    g.strokeRect(10, 10, c.width - 20, c.height - 20);
    const flip = clamp((t - m.t) / 0.18, 0, 1);
    g.save();
    g.translate(c.width / 2, c.height / 2);
    g.scale(1, Math.max(0.05, Math.abs(Math.cos((1 - flip) * Math.PI * 0.5))));
    let size = 150;
    g.font = `800 ${size}px ${COND}`;
    const wText = g.measureText(m.text).width;
    if (wText > 920) {
      size = Math.floor((size * 920) / wText);
      g.font = `800 ${size}px ${COND}`;
    }
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.shadowColor = m.color;
    g.shadowBlur = 30 * power;
    g.fillStyle = new THREE.Color(m.color).multiplyScalar(0.35 + 0.65 * power).getStyle();
    g.fillText(m.text, 0, 8);
    g.restore();
    tex.needsUpdate = true;
  }

  drawScreen(s, power, t, bf) {
    const { g, c, tex } = this.screen;
    const W = c.width;
    const H = c.height;
    const bg = g.createRadialGradient(W / 2, H / 2, 50, W / 2, H / 2, W * 0.65);
    bg.addColorStop(0, "#0c2a24");
    bg.addColorStop(1, "#020807");
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    g.save();
    g.globalAlpha = power;
    g.textAlign = "center";
    g.textBaseline = "middle";
    SCREENS[s.mode](g, W, H, s, t, bf);
    if (s.caption) glowText(g, s.caption, W / 2, H - 52, 40, "#e8fff6", MONO, 8);
    g.restore();
    g.fillStyle = "rgba(0,0,0,0.18)";
    for (let y = 0; y < H; y += 4) g.fillRect(0, y, W, 2);
    if (s.flash > 0) {
      g.fillStyle = `rgba(255,255,255,${0.35 * s.flash})`;
      g.fillRect(0, 0, W, H);
    }
    tex.needsUpdate = true;
  }
}

function glowText(g, text, x, y, size, color, family = COND, blur = 24) {
  g.font = `800 ${size}px ${family}`;
  g.shadowColor = color;
  g.shadowBlur = blur;
  g.fillStyle = color;
  g.fillText(text, x, y);
  g.shadowBlur = 0;
}

function drawCard(g, w, h, parts) {
  g.fillStyle = "#f4ecd8";
  g.fillRect(0, 0, w, h);
  g.strokeStyle = "#c9b994";
  g.lineWidth = 8;
  g.strokeRect(12, 12, w - 24, h - 24);
  g.textBaseline = "middle";
  g.font = `800 112px ${COND}`;
  const widths = parts.map((p) => g.measureText(p.text).width);
  const total = widths.reduce((a, b) => a + b, 0);
  const k = Math.min(1, (w - 60) / total);
  g.save();
  g.translate(w / 2, h / 2 + 6);
  g.scale(k, k);
  let x = -total / 2;
  parts.forEach((p, i) => {
    g.fillStyle = p.color || "#1c1e26";
    if (p.color) {
      g.fillStyle = p.color;
      g.fillRect(x - 6, -66, widths[i] + 12, 132);
      g.fillStyle = "#14161c";
    }
    g.fillText(p.text, x, 0);
    x += widths[i];
  });
  g.restore();
}

const SCREENS = {
  face(g, W, H, s, t, bf) {
    const hop = Math.abs(Math.sin(bf * Math.PI)) * 14;
    const col = "#3de8ff";
    g.fillStyle = col;
    g.shadowColor = col;
    g.shadowBlur = 30;
    for (const x of [W / 2 - 170, W / 2 + 170]) {
      if (s.sleep) {
        g.fillRect(x - 70, 250, 140, 16);
        continue;
      }
      const open = s.blink ? 0.12 : 1;
      g.beginPath();
      g.ellipse(x + s.look * 20, 250 - hop, 70, 90 * open, 0, 0, TAU);
      g.fill();
    }
    g.lineWidth = 18;
    g.strokeStyle = col;
    g.lineCap = "round";
    g.beginPath();
    if (s.sleep) g.arc(W / 2, 430, 50, 0.2 * Math.PI, 0.8 * Math.PI);
    else g.arc(W / 2, 360 - hop, 150, 0.15 * Math.PI, 0.85 * Math.PI);
    g.stroke();
    g.shadowBlur = 0;
    if (s.sleep) {
      const z = (t * 0.6) % 1;
      glowText(g, "z", W / 2 + 230 + z * 40, 210 - z * 80, 70, `rgba(61,232,255,${1 - z})`);
      glowText(g, "Z", W / 2 + 300 + z * 40, 130 - z * 80, 100, `rgba(61,232,255,${1 - z})`);
    }
  },

  op(g, W, H, s) {
    glowText(g, s.label, W / 2, 100, 96, "#e8fff6", MONO, 12);
    const k = 1 + 0.25 * s.pop;
    g.save();
    g.translate(W / 2, 345);
    g.scale(k, k);
    glowText(g, s.sym, 0, 0, 330, s.color, COND, 40);
    g.restore();
  },

  match(g, W, H, s) {
    const rows = [["+", "sum"], ["−", "difference"], ["×", "product"], ["÷", "quotient"]];
    rows.forEach(([sym, id], k) => {
      const y = 85 + k * 130;
      const a = 0.25 + 0.75 * s.lit[k];
      g.globalAlpha = a;
      glowText(g, sym, 210, y, 130, TERMS[id].color);
      glowText(g, "→", 360, y, 90, "#e8fff6", COND, 6);
      g.textAlign = "left";
      glowText(g, TERMS[id].name, 450, y, 112, TERMS[id].color);
      g.textAlign = "center";
      g.globalAlpha = 1;
    });
  },

  fraction(g, W, H, s) {
    const fx = 250;
    const top = TERMS.numerator.color;
    const bottom = TERMS.denominator.color;
    glowText(g, "3", fx, 140, 200, s.top > 0 ? top : "#d8f0e8", COND, 20 + 30 * s.top);
    glowText(g, "4", fx, 420, 200, s.bottom > 0 ? bottom : "#d8f0e8", COND, 20 + 30 * s.bottom);
    if (s.divide > 0) glowText(g, "÷", fx, 280, 130, "#ffd23f", COND, 30);
    else {
      g.fillStyle = s.bar > 0 ? "#ffd23f" : "#d8f0e8";
      g.shadowColor = "#ffd23f";
      g.shadowBlur = 40 * s.bar;
      g.fillRect(fx - 120, 270, 240, 18);
      g.shadowBlur = 0;
    }
    // A pie cut into four equal parts, three of them chosen.
    const px = 735;
    const py = 280;
    const r = 195;
    for (let k = 0; k < 4; k++) {
      const a0 = -Math.PI / 2 + (k * TAU) / 4;
      g.beginPath();
      g.moveTo(px, py);
      g.arc(px, py, r, a0, a0 + TAU / 4);
      g.closePath();
      g.fillStyle = k < s.marked ? top : "rgba(216,240,232,0.08)";
      g.globalAlpha = k < s.marked ? 0.85 : 1;
      g.fill();
      g.globalAlpha = 1;
      g.lineWidth = k < s.outline ? 12 : 6;
      g.strokeStyle = k < s.outline ? bottom : "#d8f0e8";
      g.stroke();
    }
    if (s.divide > 0) glowText(g, "= 0.75", px, py, 110, "#ffd23f", COND, 20);
  },

  balance(g, W, H, s) {
    const cx = W / 2;
    const pivot = 170;
    g.fillStyle = "#d8f0e8";
    g.beginPath();
    g.moveTo(cx, pivot);
    g.lineTo(cx - 70, 520);
    g.lineTo(cx + 70, 520);
    g.closePath();
    g.globalAlpha = 0.35;
    g.fill();
    g.globalAlpha = 1;
    const a = s.tilt * 0.22;
    const ends = [-1, 1].map((d) => [cx + Math.cos(a) * 330 * d, pivot + Math.sin(a) * 330 * d]);
    g.strokeStyle = "#d8f0e8";
    g.lineWidth = 20;
    g.beginPath();
    g.moveTo(...ends[0]);
    g.lineTo(...ends[1]);
    g.stroke();
    ends.forEach(([x, y], i) => {
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x - 110, y + 150);
      g.moveTo(x, y);
      g.lineTo(x + 110, y + 150);
      g.stroke();
      g.lineWidth = 12;
      g.beginPath();
      g.moveTo(x - 140, y + 150);
      g.lineTo(x + 140, y + 150);
      g.stroke();
      glowText(g, i ? s.right : s.left, x, y + 88, 130, TERMS.equation.color, COND, 16);
    });
    if (s.equal > 0) glowText(g, "=", cx, 340, 190 * (0.8 + 0.2 * s.equal), "#ffd23f", COND, 40);
  },

  variable(g, W, H, s) {
    const col = TERMS.variable.color;
    g.strokeStyle = col;
    g.lineWidth = 14;
    g.shadowColor = col;
    g.shadowBlur = 30;
    g.strokeRect(160, 110, 320, 320);
    g.shadowBlur = 0;
    glowText(g, "x", 320, 255, 280, col, COND, 30);
    glowText(g, "=", 600, 270, 160, "#e8fff6", COND, 10);
    const k = 1 + 0.2 * s.pop;
    g.save();
    g.translate(800, 270);
    g.scale(k, k);
    glowText(g, s.value, 0, 0, 260, s.value === "?" ? "#ffd23f" : "#e8fff6", COND, 30);
    g.restore();
  },

  terms(g, W, H, s) {
    TERM_ORDER.forEach((id, k) => {
      const col = k < 4 ? 0 : 1;
      const row = k % 4;
      const x = col ? 770 : 262;
      const y = 92 + row * 146;
      g.globalAlpha = 0.2 + 0.8 * s.lit[k];
      const z = 1 + 0.18 * s.flash[k];
      g.save();
      g.translate(x, y);
      g.scale(z, z);
      glowText(g, TERMS[id].name, 0, 0, TERMS[id].name.length > 9 ? 78 : 100, TERMS[id].color);
      g.restore();
    });
    g.globalAlpha = 1;
  },

  off(g, W, H, s) {
    const k = s.collapse;
    g.fillStyle = "#e8fff6";
    g.shadowColor = "#3de8ff";
    g.shadowBlur = 40;
    g.fillRect(W / 2 - (W / 2) * (1 - k), H / 2 - 4, W * (1 - k), 8);
    g.shadowBlur = 0;
  },
};
