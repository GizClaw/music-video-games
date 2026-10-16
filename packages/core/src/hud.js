import { BRAND, clamp, easeOutBack, easeOutCubic, smooth } from "./timing.js";
import { H, W } from "./fx.js";
import { withoutTrailingComma } from "./lyrics.js";

export const FONT_HEAVY = '"Avenir Next"';
export const FONT_COND = '"Avenir Next Condensed"';
export const FONT_MONO = '"Menlo"';

// Short-video safe area: platform chrome covers the top ~240px, the bottom ~430px
// and an action column on the right of the lower half.
export const SAFE = { top: 250, bottom: H - 440, left: 80, right: W - 130 };
export const LYRIC_Y = 1400;
const LYRIC_MAX_W = SAFE.right - SAFE.left;


export class Hud {
  constructor() {
    this.canvas = document.createElement("canvas");
    this.canvas.width = W;
    this.canvas.height = H;
    this.ctx = this.canvas.getContext("2d");
    this.wordColors = {};
    this.rects = [];
  }

  clear() {
    this.ctx.clearRect(0, 0, W, H);
    this.rects = [];
  }

  /** Mark a screen rectangle that lyrics must keep their distance from. */
  keepout(x0, y0, x1, y1) {
    this.rects.push([Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)]);
  }

  font(size, weight = 800, family = FONT_HEAVY) {
    this.ctx.font = `${weight} ${size}px ${family}`;
  }

  lyric(t, timing, { y = LYRIC_Y, size = 70, accent = "#ffffff", opacity = 1 } = {}) {
    const active = timing.cueAt(t);
    if (!active || opacity <= 0) return;
    const { cue, end } = active;
    const ctx = this.ctx;
    const fadeIn = smooth(cue.start - 0.15, cue.start + 0.05, t);
    const fadeOut = 1 - smooth(end - 0.2, end, t);
    const alpha = fadeIn * fadeOut * opacity;
    if (alpha <= 0) return;

    this.font(size);
    const space = ctx.measureText(" ").width;
    const words = cue.words.filter((w) => w.text !== "—").map((w, i, all) => {
      const text = i === all.length - 1 ? withoutTrailingComma(w.text) : w.text;
      return { ...w, text, width: ctx.measureText(text).width };
    });
    const lines = [[]];
    let lineW = 0;
    for (const w of words) {
      const add = (lines.at(-1).length ? space : 0) + w.width;
      if (lineW + add > LYRIC_MAX_W && lines.at(-1).length) {
        lines.push([]);
        lineW = 0;
      }
      lineW += (lines.at(-1).length ? space : 0) + w.width;
      lines.at(-1).push(w);
    }
    const lineH = size * 1.18;
    const cx = (SAFE.left + SAFE.right) / 2;
    const rise = (1 - easeOutCubic((t - cue.start + 0.15) / 0.3)) * 30;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textBaseline = "middle";
    lines.forEach((line, li) => {
      const total = line.reduce((a, w) => a + w.width, 0) + space * (line.length - 1);
      let x = cx - total / 2;
      const ly = y + (li - (lines.length - 1) / 2) * lineH + rise;
      for (const w of line) {
        // Light each word slightly early so its pop peaks as it is sung.
        const lit = w.start - 0.05;
        const sung = t >= lit;
        const k = clamp((t - lit) / 0.14, 0, 1);
        const pop = sung ? 1 + 0.18 * Math.sin(k * Math.PI) : 1;
        const color = this.wordColors[w.clean] || this.wordColors[w.clean.replace(/s$/, "")] || accent;
        ctx.save();
        ctx.translate(x + w.width / 2, ly);
        ctx.scale(pop, pop);
        ctx.lineJoin = "round";
        ctx.lineWidth = 12;
        ctx.strokeStyle = "rgba(4,4,20,0.85)";
        ctx.strokeText(w.text, -w.width / 2, 0);
        if (sung) {
          ctx.shadowColor = color;
          ctx.shadowBlur = 24 * (1 - k * 0.5);
          ctx.fillStyle = color;
        } else {
          ctx.fillStyle = "rgba(255,255,255,0.38)";
        }
        ctx.fillText(w.text, -w.width / 2, 0);
        ctx.restore();
        x += w.width + space;
      }
    });
    ctx.restore();
  }

  /** Big punch-in word. t0 = beat it lands on, t1 = exit time. */
  slam(text, t, t0, t1, { y = 760, size = 170, color = "#ffffff", sub = null, subColor = null, family = FONT_COND, stroke = true, angle = -0.06 } = {}) {
    if (t < t0 - 0.02 || t > t1 + 0.2) return;
    const ctx = this.ctx;
    const inK = clamp((t - t0) / 0.2, 0, 1);
    const outK = clamp((t - t1) / 0.2, 0, 1);
    const s = (0.4 + 0.6 * easeOutBack(inK)) * (1 + outK * 0.6);
    const alpha = clamp(inK * 3, 0, 1) * (1 - outK);
    if (alpha > 0.05) {
      this.font(size, 800, family);
      const half = (Math.min(ctx.measureText(text).width, LYRIC_MAX_W * 1.02) * s) / 2;
      this.keepout(W / 2 - 25 - half, y - size * 0.6 * s, W / 2 - 25 + half, y + (sub ? size * 0.85 : size * 0.55) * s);
    }
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(W / 2 - 25, y);
    ctx.rotate(angle);
    ctx.scale(s, s);
    this.font(size, 800, family);
    let m = ctx.measureText(text).width;
    if (m > LYRIC_MAX_W * 1.02) {
      const k = (LYRIC_MAX_W * 1.02) / m;
      ctx.scale(k, k);
    }
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (stroke) {
      ctx.lineJoin = "round";
      ctx.lineWidth = 16;
      ctx.strokeStyle = "rgba(5,5,25,0.9)";
      ctx.strokeText(text, 0, 0);
    }
    ctx.shadowColor = color;
    ctx.shadowBlur = 40;
    ctx.fillStyle = "#ffffff";
    ctx.fillText(text, 0, -size * 0.03);
    ctx.shadowBlur = 0;
    ctx.fillStyle = color;
    ctx.fillText(text, 0, 0);
    if (sub) {
      ctx.globalAlpha = alpha * clamp((t - t0 - 0.1) / 0.2, 0, 1);
      this.font(Math.round(size * 0.24), 700, FONT_MONO);
      ctx.lineWidth = 8;
      ctx.strokeStyle = "rgba(5,5,25,0.9)";
      ctx.strokeText(sub, 0, size * 0.66);
      ctx.fillStyle = subColor || "#ffffff";
      ctx.fillText(sub, 0, size * 0.66);
    }
    ctx.restore();
  }

  stamp(text, t, t0, { x = W / 2, y = 800, size = 220, color = "#ff3d7f", angle = -0.15, life = 1.2 } = {}) {
    if (t < t0 || t > t0 + life) return;
    const ctx = this.ctx;
    const k = clamp((t - t0) / 0.1, 0, 1);
    const s = 2.2 - 1.2 * easeOutCubic(k);
    const a = Math.min(1, k * 2) * (1 - smooth(t0 + life - 0.25, t0 + life, t));
    if (a > 0.05) {
      this.font(size, 800, FONT_COND);
      const half = ((ctx.measureText(text).width + 80) * s) / 2;
      this.keepout(x - half, y - size * 0.6 * s, x + half, y + size * 0.6 * s);
    }
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.scale(s, s);
    this.font(size, 800, FONT_COND);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 14;
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 30;
    const m = ctx.measureText(text).width;
    ctx.strokeRect(-m / 2 - 40, -size * 0.55, m + 80, size * 1.1);
    ctx.fillStyle = color;
    ctx.fillText(text, 0, size * 0.04);
    ctx.restore();
  }

  text(str, x, y, { size = 40, weight = 700, family = FONT_HEAVY, color = "#fff", align = "center", alpha = 1, glow = 0, tracking = 0, baseline = "middle" } = {}) {
    if (alpha <= 0) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = alpha;
    this.font(size, weight, family);
    if (alpha > 0.05) {
      const w = ctx.measureText(str).width + tracking * str.length;
      const left = align === "left" ? x : align === "right" ? x - w : x - w / 2;
      this.keepout(left, y - size * 0.6, left + w, y + size * 0.6);
    }
    ctx.textAlign = align;
    ctx.textBaseline = baseline;
    if ("letterSpacing" in ctx) ctx.letterSpacing = `${tracking}px`;
    if (glow) {
      ctx.shadowColor = color;
      ctx.shadowBlur = glow;
    }
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
    ctx.restore();
  }

  /** Song title lock-up: a mono kicker over two condensed lines. */
  title(t, t0, t1, { kicker, lines, accent = "#ffe53b", y = SAFE.top + 170, align = "left" }) {
    const a = smooth(t0, t0 + 0.3, t) * (1 - smooth(t1 - 0.3, t1, t));
    if (a <= 0) return;
    const x = align === "left" ? SAFE.left : W / 2;
    const slide = (1 - easeOutCubic((t - t0) / 0.5)) * -60;
    this.text(kicker, x + slide, y, { size: 24, weight: 600, family: FONT_MONO, color: BRAND, align, alpha: a, tracking: 3, glow: 12 });
    this.text(lines[0], x + slide * 1.4, y + 52, { size: 62, weight: 800, family: FONT_COND, align, alpha: a, glow: 18 });
    if (lines[1]) this.text(lines[1], x + slide * 1.8, y + 112, { size: 62, weight: 800, family: FONT_COND, align, alpha: a, glow: 18, color: accent });
  }
}
