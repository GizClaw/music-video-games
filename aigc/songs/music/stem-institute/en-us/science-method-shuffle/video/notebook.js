import * as THREE from "three";
import { FONT_COND, FONT_MONO } from "@gizclaw/mvg-core/hud.js";
import { clamp, easeOutBack, hash, lerp, smooth } from "@gizclaw/mvg-core/timing.js";

// The page on the clipboard, laid out on a 768 × 1152 grid and drawn at RES× so
// the writing stays crisp in close-ups.
export const PAGE_W = 768;
export const PAGE_H = 1152;
const RES = 4 / 3;
const INK = "#24324a";
const PENCIL = "#2b3a6a";

/** The notebook page: question, hypothesis, variables, heights table, bar chart and conclusion, written on in time. */
export class Notebook {
  constructor(plan, cm) {
    this.plan = plan;
    this.cm = cm;
    this.canvas = document.createElement("canvas");
    this.canvas.width = PAGE_W * RES;
    this.canvas.height = PAGE_H * RES;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8;
    this.key = "";
    const p = plan;
    const rowY = (r) => 470 + r * 66;
    this.lines = [
      { t0: p.q, dur: 1.4, x: 50, y: 150, size: 40, text: "Q: Do beans grow taller in more sun?", color: INK },
      { t0: p.hypo, dur: 1.3, x: 50, y: 240, size: 50, text: "Hypothesis: more sun → taller", color: PENCIL },
      { t0: p.vars, dur: 1.4, x: 50, y: 316, size: 34, text: "Change: sunlight · Keep: water, soil, seeds", color: INK },
      ...p.rows.map((t0, r) => ({ t0, dur: 0.5, x: 70, y: rowY(r), size: 50, row: r, color: PENCIL })),
      { t0: p.concl, dur: 1.2, x: 50, y: 1090, size: 46, text: "Conclusion: YES! more sun → taller", color: PENCIL },
    ];
  }

  progress(t) {
    return this.lines.map((l) => clamp((t - l.t0) / l.dur, 0, 1));
  }

  /** Pencil tip in page pixels and whether it is writing. */
  pencil(t) {
    const prog = this.progress(t);
    let best = null;
    this.lines.forEach((l, i) => {
      if (t >= l.t0 - 0.3 && (!best || l.t0 > best.l.t0)) best = { l, p: prog[i] };
    });
    if (!best) return { x: 600, y: 200, down: 0 };
    const w = best.l.row !== undefined ? 560 : best.l.text.length * best.l.size * 0.42;
    return { x: best.l.x + w * best.p, y: best.l.y + 10, down: best.p > 0 && best.p < 1 ? 1 : smooth(0.4, 0, t - best.l.t0 - best.l.dur) };
  }

  draw(t, day) {
    const prog = this.progress(t);
    const p = this.plan;
    const bars = p.bars.map((b) => (t >= b - 0.05 ? easeOutBack(clamp((t - b + 0.05) / 0.45, 0, 1)) : 0));
    const trend = smooth(p.trend, p.trend + 0.5, t);
    const stamp = t >= p.stamp ? clamp((t - p.stamp) / 0.15, 0, 1) : 0;
    const hl = smooth(p.highlight - 0.1, p.highlight + 0.2, t);
    const key = [...prog, ...bars, trend, stamp, hl, Math.floor(day)].map((v) => Math.round(v * 60)).join(",");
    if (key === this.key) return;
    this.key = key;
    const g = this.canvas.getContext("2d");
    g.setTransform(RES, 0, 0, RES, 0, 0);
    g.fillStyle = "#f7f1e1";
    g.fillRect(0, 0, PAGE_W, PAGE_H);
    for (let i = 0; i < 400; i++) {
      g.fillStyle = `rgba(160,140,100,${0.04 + hash(i) * 0.05})`;
      g.fillRect(hash(i * 1.3) * PAGE_W, hash(i * 2.9) * PAGE_H, 2, 2);
    }
    g.strokeStyle = "rgba(80,130,200,0.2)";
    g.lineWidth = 2;
    for (let y = 196; y < PAGE_H; y += 38) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(PAGE_W, y);
      g.stroke();
    }
    g.strokeStyle = "rgba(220,80,80,0.35)";
    g.beginPath();
    g.moveTo(36, 0);
    g.lineTo(36, PAGE_H);
    g.stroke();
    const text = (s, x, y, size, color, align = "left", family = FONT_COND) => {
      g.font = `800 ${size}px ${family}`;
      g.fillStyle = color;
      g.textAlign = align;
      g.textBaseline = "middle";
      g.fillText(s, x, y);
    };
    text("BEAN EXPERIMENT", 50, 70, 60, INK);
    text(`DAY ${Math.floor(day)}`, PAGE_W - 40, 72, 32, "#a04030", "right", FONT_MONO);

    const cols = [110, 290, 460, 630];
    if (hl > 0) {
      g.fillStyle = `rgba(255,220,60,${0.55 * hl})`;
      g.fillRect(cols[3] - 70, 370, 140, 66 * 5);
    }
    ["DAY", "SHADE", "HALF", "FULL"].forEach((s, c) => text(s, cols[c], 400, 38, INK, "center"));
    g.strokeStyle = INK;
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(50, 432);
    g.lineTo(PAGE_W - 40, 432);
    g.moveTo(195, 372);
    g.lineTo(195, 700);
    g.stroke();

    this.lines.forEach((l, i) => {
      const k = prog[i];
      if (k <= 0) return;
      g.save();
      const w = l.row !== undefined ? PAGE_W : l.text.length * l.size * 0.42 + 40;
      g.beginPath();
      g.rect(0, l.y - l.size, l.x + w * k, l.size * 2);
      g.clip();
      if (l.row !== undefined) {
        const d = p.days[l.row];
        text(String(d), cols[0], l.y, l.size, l.color, "center");
        for (let c = 0; c < 3; c++) text(String(this.cm(c, d)), cols[c + 1], l.y, l.size, l.color, "center");
      } else text(l.text, l.x, l.y, l.size, l.color);
      g.restore();
    });

    const base = 990;
    const top = 790;
    g.strokeStyle = INK;
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(130, top - 30);
    g.lineTo(130, base);
    g.lineTo(PAGE_W - 60, base);
    g.stroke();
    const colors = ["#6f9c86", "#8cc84a", "#f2b51d"];
    const labels = ["SHADE", "HALF", "FULL"];
    [235, 405, 575].forEach((x, k) => {
      const v = this.cm(k, 12);
      const h = ((base - top) * v * bars[k]) / 20;
      g.fillStyle = colors[k];
      g.fillRect(x - 55, base - h, 110, h);
      g.strokeStyle = INK;
      g.lineWidth = 3;
      g.strokeRect(x - 55, base - h, 110, h);
      text(labels[k], x, base + 32, 30, INK, "center");
      if (bars[k] > 0.6) text(`${v}`, x, base - h - 26, 40, INK, "center");
    });
    if (trend > 0) {
      const y0 = base - ((base - top) * this.cm(0, 12)) / 20 - 70;
      const y1 = base - ((base - top) * this.cm(2, 12)) / 20 - 70;
      g.strokeStyle = "#c0392b";
      g.lineWidth = 7;
      g.setLineDash([16, 12]);
      g.beginPath();
      g.moveTo(235, y0);
      g.lineTo(lerp(235, 575, trend), lerp(y0, y1, trend));
      g.stroke();
      g.setLineDash([]);
    }
    if (prog.at(-1) <= 0) text("Conclusion: ____________", 50, 1090, 46, "rgba(36,50,74,0.45)");
    if (stamp > 0) {
      g.save();
      g.translate(650, 1060);
      g.rotate(-0.15);
      g.scale(2 - stamp, 2 - stamp);
      g.globalAlpha = stamp * 0.9;
      g.strokeStyle = "#2f9a3e";
      g.lineWidth = 10;
      g.beginPath();
      g.arc(0, 0, 70, 0, Math.PI * 2);
      g.stroke();
      g.lineCap = "round";
      g.lineWidth = 16;
      g.beginPath();
      g.moveTo(-34, 0);
      g.lineTo(-8, 28);
      g.lineTo(38, -30);
      g.stroke();
      g.restore();
    }
    this.texture.needsUpdate = true;
  }
}
