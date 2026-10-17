import { COMMON, overlays } from "../lang.js";
import { spectrumStyle } from "../spectrum/style.js";
import { SHAPES } from "./song.js";

/** Layout for a mounted Polygon Party: the shared game HUD plus the shape collection, the name tag over the active performer and the subtitle dock. Scoped to `.mvg-game.polygon`. */
export const polygonStyle = `${spectrumStyle}
.mvg-game.polygon { background: #0c0418; }
.mvg-game.polygon h1 { background: linear-gradient(90deg, #ff3d5a, #ff8a1f, #ffd23f, #4dff7a, #2fe0ff, #b45dff, #ff5dc8); -webkit-background-clip: text; background-clip: text; color: transparent; filter: drop-shadow(0 0 18px rgba(255,93,200,0.45)); }
.mvg-game.polygon .kicker { color: #ffd23f; text-shadow: 0 0 12px #ff8a1f; }
.mvg-game.polygon .progress i { background: linear-gradient(90deg, #ff3d5a, #ffd23f, #4dff7a, #2fe0ff, #b45dff, #ff5dc8); }
.mvg-game.polygon #title { background: radial-gradient(ellipse at center, rgba(12,4,24,0.35), rgba(12,4,24,0.72)); }
.mvg-game.polygon .overlay button { background: #ffd23f; box-shadow: 0 0 28px rgba(255,210,63,0.6); }
.mvg-game.polygon .band { top: 18%; }
.mvg-game.polygon .tag, .mvg-game.polygon .judge { top: 0; left: 0; right: auto; width: 0; display: flex; flex-direction: column; align-items: center; white-space: nowrap; }
.mvg-game.polygon .tag { position: absolute; transform: translateY(-100%); transition: opacity 0.2s; }
.mvg-game.polygon .tag b { font: 800 clamp(20px, 3.4vh, 32px) "Avenir Next Condensed", "PingFang SC", sans-serif; letter-spacing: 2px; text-shadow: 0 0 16px currentColor, 0 2px 8px #000; }
.mvg-game.polygon .tag small { font: 700 clamp(10px, 1.5vh, 13px) Menlo, monospace; letter-spacing: 3px; opacity: 0.75; color: #fff; text-shadow: 0 2px 6px #000; }
.mvg-game.polygon .tag .pips { display: flex; gap: 4px; margin-top: 5px; }
.mvg-game.polygon .tag .pips i { width: 14px; height: 4px; border-radius: 2px; background: rgba(255,255,255,0.22); }
.mvg-game.polygon .tag .pips i.on { background: currentColor; box-shadow: 0 0 8px currentColor; }
.mvg-game.polygon .judge small { font: 700 clamp(12px, 1.9vh, 17px) "Avenir Next", "PingFang SC", sans-serif; letter-spacing: 2px; color: #fff; opacity: 0.9; }
.mvg-game .shapes { position: absolute; top: 14px; left: 50%; transform: translateX(-50%); display: flex; gap: 5px; }
.mvg-game .shapes i { position: relative; width: 26px; height: 26px; display: grid; place-items: center; font: 800 10px Menlo, monospace; font-style: normal; color: rgba(255,255,255,0.45); }
.mvg-game .shapes i::before { content: ""; position: absolute; inset: 0; background: rgba(255,255,255,0.12); clip-path: var(--shape); }
.mvg-game .shapes i span { position: relative; }
.mvg-game .shapes i.got { color: #12021c; }
.mvg-game .shapes i.got::before { background: var(--c); }
.mvg-game .shapes i.now { transform: scale(1.18); color: #fff; }
.mvg-game .shapes i.now::before { background: rgba(255,255,255,0.32); }
.mvg-game .shapes i.pop { animation: mvg-shape-pop 0.5s ease-out; }
@keyframes mvg-shape-pop { from { transform: scale(2); } to { transform: scale(1); } }
/* Subtitles and the tip sit at the bottom, clear of the performer. */
.mvg-game.polygon .dock { position: absolute; left: 5%; right: 5%; bottom: max(14px, 3%); display: flex; flex-direction: column; align-items: center; gap: 8px; }
.mvg-game.polygon .dock .lyric { position: static; align-self: stretch; min-height: 1.25em; font-size: clamp(18px, 3.2vh, 34px); }
.mvg-game.polygon .tip { padding: 8px 16px; border: 2px solid #ffd23f; border-radius: 12px; background: rgba(18,4,30,0.86); color: #ffe6a8; font: 700 clamp(13px, 2.2vh, 19px) "Avenir Next", "PingFang SC", sans-serif; text-align: center; opacity: 0; transition: opacity 0.2s; }
.mvg-game.polygon .tip.on { opacity: 1; }
/* The note lane: notes slide in on the beat grid and are hit as they cross the target ring. */
.mvg-game.polygon .lane { position: relative; width: min(100%, 780px); height: clamp(42px, 7vh, 58px); border-radius: 999px; background: linear-gradient(90deg, rgba(24,6,40,0.9), rgba(24,6,40,0.55)); border: 1px solid rgba(255,255,255,0.2); overflow: hidden; box-shadow: inset 0 0 18px rgba(0,0,0,0.6); }
.mvg-game.polygon .lane .track { position: absolute; inset: 0; }
.mvg-game.polygon .lane .track b { position: absolute; left: 0; top: 22%; bottom: 22%; width: 2px; margin-left: -1px; background: rgba(255,255,255,0.13); }
.mvg-game.polygon .lane .track b.bar { top: 8%; bottom: 8%; background: rgba(255,255,255,0.32); }
.mvg-game.polygon .lane .track i { position: absolute; left: 0; top: 50%; width: 26px; height: 26px; margin: -13px 0 0 -13px; background: var(--c); clip-path: var(--shape); }
.mvg-game.polygon .lane .track i.last { width: 36px; height: 36px; margin: -18px 0 0 -18px; background: linear-gradient(#fff6c8, var(--c) 55%); }
.mvg-game.polygon .lane .track i.hit { background: #fff6c8; }
.mvg-game.polygon .lane .track i.miss { background: #7a6a8c; }
.mvg-game.polygon .lane .target { position: absolute; top: 50%; width: clamp(34px, 5.6vh, 46px); height: clamp(34px, 5.6vh, 46px); transform: translate(-50%, -50%); border-radius: 50%; border: 3px solid rgba(255,255,255,0.85); display: grid; place-items: center; box-shadow: 0 0 12px rgba(255,255,255,0.35); z-index: 1; transition: border-color 0.08s, box-shadow 0.08s; }
.mvg-game.polygon .lane .target i { width: 58%; height: 58%; background: var(--c); clip-path: var(--shape); opacity: 0.35; }
.mvg-game.polygon .lane .target.due { border-color: #ffd23f; box-shadow: 0 0 0 4px rgba(255,210,63,0.35), 0 0 24px #ffd23f; }
.mvg-game.polygon .lane .target.hit { animation: mvg-lane-hit 0.25s ease-out; }
@keyframes mvg-lane-hit { from { transform: translate(-50%, -50%) scale(1.4); } to { transform: translate(-50%, -50%) scale(1); } }
/* Phones: drum pads to tap with the thumbs. They show the shape being drawn and light gold on the note; the whole screen still counts. */
.mvg-game.polygon .pad { display: none; }
@media (pointer: coarse) {
  .mvg-game.polygon { --pad: clamp(96px, 24vh, 150px); }
  .mvg-game.polygon .pad { position: absolute; bottom: max(14px, 4%); width: var(--pad); height: var(--pad); padding: 0; border-radius: 50%; border: 3px solid rgba(255,255,255,0.55); background: rgba(24,6,40,0.55); display: grid; place-items: center; pointer-events: auto; touch-action: none; box-shadow: 0 6px 0 rgba(0,0,0,0.4); transition: transform 0.05s, border-color 0.1s, box-shadow 0.1s; }
  .mvg-game.polygon .pad i { width: 54%; height: 54%; background: var(--c, #fff); clip-path: var(--shape); opacity: 0.85; }
  .mvg-game.polygon .pad.left { left: max(16px, 3%); }
  .mvg-game.polygon .pad.right { right: max(16px, 3%); }
  .mvg-game.polygon .pad.due { border-color: #ffd23f; box-shadow: 0 6px 0 rgba(0,0,0,0.4), 0 0 0 6px rgba(255,210,63,0.45), 0 0 36px #ffd23f; }
  .mvg-game.polygon .pad.down { transform: translateY(4px) scale(0.94); box-shadow: 0 2px 0 rgba(0,0,0,0.4); }
  .mvg-game.polygon .dock { left: calc(max(16px, 3%) + var(--pad) + 14px); right: calc(max(16px, 3%) + var(--pad) + 14px); }
  .mvg-game.polygon .dock .lyric { font-size: clamp(15px, min(4.6vw, 4.6vh), 22px); }
}
@media (pointer: coarse) and (max-aspect-ratio: 1/1) {
  .mvg-game.polygon { --pad: clamp(84px, 13vh, 120px); }
  .mvg-game.polygon .pad.left { right: max(16px, 4%); width: auto; border-radius: 28px; }
  .mvg-game.polygon .pad.left i { width: calc(var(--pad) * 0.56); height: calc(var(--pad) * 0.56); }
  .mvg-game.polygon .pad.right { display: none; }
  .mvg-game.polygon .dock { left: 5%; right: 5%; bottom: calc(max(14px, 4%) + var(--pad) + 12px); }
}
@media (max-width: 560px), (max-height: 500px) {
  .mvg-game .shapes { gap: 3px; top: 10px; }
  .mvg-game .shapes i { width: 19px; height: 19px; font-size: 8px; }
  .mvg-game.polygon #title { padding: 16px 20px calc(84px + env(safe-area-inset-bottom, 0px)); }
  .mvg-game.polygon #title .kicker { font-size: 12px; letter-spacing: 2px; }
  .mvg-game.polygon #title h1 { font-size: clamp(32px, 8vh, 64px); margin: 8px 0; }
  .mvg-game.polygon #title .sub { font-size: 14px; margin-bottom: 12px; }
  .mvg-game.polygon #title .keys { font-size: 12px; line-height: 1.35; gap: 6px; margin-bottom: 16px; }
  .mvg-game.polygon #title button { font-size: 18px; padding: 10px 28px; }
}
@media (max-height: 500px) {
  .mvg-game.polygon .overlay { justify-content: flex-start; padding-top: 14px; }
  .mvg-game.polygon h1 br { display: none; }
  .mvg-game.polygon .grade { font-size: 72px; }
  .mvg-game.polygon .final { font-size: 26px; margin-bottom: 6px; }
  .mvg-game.polygon .stats { font-size: 12px; border-spacing: 16px 1px; margin-bottom: 10px; }
}
`;

export const TITLE = {
  zh: {
    sub: "跟着节拍，一拍画一条边",
    keys: ["外圈缩到形状上的那一下，点屏幕或按 <kbd>空格</kbd>", "画满所有边，镜头就转到下一位", "越往后越快：从两拍一下到半拍一下"],
    touchKeys: ["外圈缩到形状上的那一下，敲下面的鼓，点屏幕哪里都行", "画满所有边，镜头就转到下一位", "越往后越快：从两拍一下到半拍一下"],
  },
  en: {
    sub: "Draw one edge on every beat",
    keys: ["Tap or press <kbd>Space</kbd> as the outer outline closes onto the shape", "Close the shape and the camera swings to the next one", "It speeds up: from every other beat to every half beat"],
    touchKeys: ["Hit a drum pad as the outer outline closes onto the shape; anywhere on screen works", "Close the shape and the camera swings to the next one", "It speeds up: from every other beat to every half beat"],
  },
};

/** CSS clip-path of a regular n-gon with a flat bottom, for the collection. */
export const clip = (n) => {
  const pts = Array.from({ length: n }, (_, k) => {
    const a = -Math.PI / 2 + Math.PI / n + (2 * Math.PI * k) / n;
    return `${(50 + Math.cos(a) * 50).toFixed(1)}% ${(50 - Math.sin(a) * 50).toFixed(1)}%`;
  });
  return `polygon(${pts.join(", ")})`;
};

/** The HUD and overlays of a mounted Polygon Party, in `lang`. */
export const polygonMarkup = (lang) => {
  const c = COMMON[lang];
  const t = TITLE[lang];
  return `
  <div class="stage" id="stage"></div>
  <div class="hud" id="hud" hidden>
    <div class="progress" id="progress"><i></i></div>
    <div class="shapes" id="shapes">${SHAPES.map((s) => `<i style="--shape:${clip(s.sides)};--c:${s.color}"><span>${s.sides}</span></i>`).join("")}</div>
    <div class="score" id="score"><b>0</b><span>SCORE</span></div>
    <div class="combo" id="combo"><b>0</b><span>COMBO</span><em>×1</em></div>
    <div class="band" id="band"></div>
    <div class="tag" id="tag"><b></b><small></small><div class="pips"></div></div>
    <div class="judge" id="judge"></div>
    <div class="dock">
      <div class="tip" id="tip"></div>
      <div class="lane" id="lane"><div class="track"></div><div class="target"><i></i></div></div>
      <div class="lyric" id="lyric"></div>
    </div>
    <button class="pad left" id="padL" aria-label="tap"><i></i></button>
    <button class="pad right" id="padR" aria-label="tap"><i></i></button>
  </div>
  <div class="overlay" id="title">
    <div class="kicker">STEM INSTITUTE · No. 6</div>
    <h1>POLYGON <br />PARTY</h1>
    <p class="sub">${t.sub}</p>
    <div class="keys">
      ${t.keys.map((k) => `<div>${k}</div>`).join("")}
      <div>${c.keysPause}</div>
    </div>
    <button id="start" disabled>${c.loading}</button>
    <a class="back" href="">${c.back}</a>
  </div>
  ${overlays(c)}
`;
};
