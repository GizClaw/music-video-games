import { H, W } from "@gizclaw/mvg-core/fx.js";
import { SAFE } from "@gizclaw/mvg-core/hud.js";
import { withoutTrailingComma } from "@gizclaw/mvg-core/lyrics.js";

export const SUBTITLE_FONT = '"PingFang SC", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif';
const SIZE = 36;
const Y = 1660;
const MAX_WIDTH = SAFE.right - SAFE.left;

/** A separate, static layer composited after every animated scene and HUD effect. */
export class StaticSubtitles {
  constructor(timing, track, end = Infinity) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = W;
    this.canvas.height = H;
    this.ctx = this.canvas.getContext("2d");
    this.text = null;
    this.cues = [];
    if (!track) return;
    if (Array.isArray(track)) {
      this.cues = track.map((cue) => ({ ...cue, text: withoutTrailingComma(cue.text), end: Math.min(cue.end, end) })).filter((cue) => cue.end > cue.start);
      return;
    }
    if (track.version !== 1 || track.language !== "zh-CN" || !track.lines || typeof track.lines !== "object") {
      throw new Error("Invalid Chinese subtitle track (expected version 1, language zh-CN and lines)");
    }
    this.cues = timing.cues.map((cue, i, cues) => {
      const text = track.lines[cue.text];
      if (typeof text !== "string" || !text.trim()) throw new Error(`Missing Chinese subtitle: ${cue.text}`);
      return {
        start: Math.max(0, cue.start - 0.15),
        end: Math.min(cue.end + 0.35, cues[i + 1] ? cues[i + 1].start - 0.15 : Infinity, end),
        text: withoutTrailingComma(text),
      };
    }).filter((cue) => cue.end > cue.start);
  }

  renderAt(t, visible = true) {
    const text = visible ? this.cues.find((cue) => t >= cue.start && t < cue.end)?.text || "" : "";
    return this.setText(text);
  }

  setText(text) {
    if (text === this.text) return false;
    this.text = text;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, W, H);
    if (!text) return true;
    ctx.font = `500 ${SIZE}px ${SUBTITLE_FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(4, 4, 20, 0.9)";
    ctx.fillStyle = "#f2f2f2";
    const lines = [];
    for (const paragraph of text.split("\n")) {
      let line = "";
      for (const char of paragraph) {
        if (line && ctx.measureText(line + char).width > MAX_WIDTH) {
          lines.push(line);
          line = "";
        }
        line += char;
      }
      if (line) lines.push(line);
    }
    if (lines.length > 2) throw new Error(`Chinese subtitle exceeds two lines: ${text}`);
    lines.forEach((line, i) => {
      const y = Y + (i - (lines.length - 1) / 2) * SIZE * 1.3;
      const x = (SAFE.left + SAFE.right) / 2;
      ctx.strokeText(line, x, y);
      ctx.fillText(line, x, y);
    });
    return true;
  }
}

export const SubtitleShader = {
  uniforms: { tDiffuse: { value: null }, tSubtitles: { value: null } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse, tSubtitles;
    varying vec2 vUv;
    void main() {
      vec4 scene = texture2D(tDiffuse, vUv);
      vec4 subtitle = texture2D(tSubtitles, vUv);
      gl_FragColor = vec4(scene.rgb * (1.0 - subtitle.a) + subtitle.rgb, 1.0);
    }
  `,
};
