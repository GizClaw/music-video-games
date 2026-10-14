import { RAINBOW, clamp } from "@gizclaw/mvg-core/timing.js";
import { FONT_MONO, SAFE } from "@gizclaw/mvg-core/hud.js";
import { W } from "@gizclaw/mvg-core/fx.js";
import { BANDS } from "./constants.js";

export const WORD_COLORS = {
  radio: BANDS[0].color,
  microwave: BANDS[1].color,
  microwaves: BANDS[1].color,
  infrared: BANDS[2].color,
  visible: "#fff6a0",
  ultraviolet: BANDS[4].color,
  "x-ray": BANDS[5].color,
  "x-rays": BANDS[5].color,
  gamma: BANDS[6].color,
  red: RAINBOW[0],
  orange: RAINBOW[1],
  yellow: RAINBOW[2],
  green: RAINBOW[3],
  blue: RAINBOW[4],
  violet: RAINBOW[5],
  slide: "#ffffff",
  spectrum: "#ffffff",
  no: "#ff3d7f",
};

/** Spectrum ruler pinned under the platform's top chrome. */
export function ruler(hud, active, opacity = 1, { y = SAFE.top + 60, highlightAll = 0 } = {}) {
  if (opacity <= 0) return;
  const ctx = hud.ctx;
  hud.keepout(SAFE.left, y - 30, W - SAFE.left, y + 75);
  const x0 = SAFE.left + 10;
  const x1 = W - SAFE.left - 10;
  const gap = 8;
  const segW = (x1 - x0 - gap * 6) / 7;
  ctx.save();
  ctx.globalAlpha = opacity;
  hud.font(25, 700, FONT_MONO);
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (let i = 0; i < 7; i++) {
    const b = BANDS[i];
    const x = x0 + i * (segW + gap);
    const on = Math.max(highlightAll, clamp(1 - Math.abs(active - i), 0, 1));
    const grad = ctx.createLinearGradient(x, 0, x + segW, 0);
    if (b.id === "visible") RAINBOW.forEach((c, k) => grad.addColorStop(k / (RAINBOW.length - 1), c));
    else {
      grad.addColorStop(0, b.color);
      grad.addColorStop(1, b.color);
    }
    ctx.globalAlpha = opacity * (0.28 + 0.72 * on);
    ctx.fillStyle = grad;
    ctx.shadowColor = b.id === "visible" ? "#ffffff" : b.color;
    ctx.shadowBlur = 22 * on;
    ctx.fillRect(x, y, segW, 10 + 6 * on);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = opacity * (0.6 + 0.4 * on);
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = "rgba(0,0,0,0.9)";
    ctx.shadowBlur = 6;
    ctx.fillText(b.short, x + segW / 2, y + 26);
    ctx.shadowBlur = 0;
  }
  if (active >= -0.5 && active <= 6.5) {
    const ix = x0 + clamp(active, 0, 6) * (segW + gap) + segW / 2;
    ctx.globalAlpha = opacity;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.moveTo(ix, y - 6);
    ctx.lineTo(ix - 11, y - 24);
    ctx.lineTo(ix + 11, y - 24);
    ctx.closePath();
    ctx.shadowColor = "#ffffff";
    ctx.shadowBlur = 16;
    ctx.fill();
  }
  hud.font(21, 600, FONT_MONO);
  ctx.globalAlpha = opacity * 0.85;
  ctx.shadowColor = "rgba(0,0,0,0.9)";
  ctx.shadowBlur = 6;
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "left";
  ctx.fillText("LONG λ · LOW f", x0, y + 62);
  ctx.textAlign = "right";
  ctx.fillText("SHORT λ · HIGH f", x1, y + 62);
  ctx.restore();
}

