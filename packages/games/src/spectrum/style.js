import { finaleStyle, lifeMarkup } from "../finale.js";
import { COMMON, overlays } from "../lang.js";

/** Layout for a mounted Slide Down the Spectrum. Scoped to `.mvg-game`. */
export const spectrumStyle = `${finaleStyle}
.mvg-game { position: relative; width: 100%; height: 100%; overflow: hidden; background: #020208; color: #fff; font-family: "Avenir Next", "PingFang SC", sans-serif; touch-action: none; user-select: none; -webkit-user-select: none; }
.mvg-game .stage, .mvg-game .stage canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.mvg-game kbd { display: inline-block; min-width: 1.4em; padding: 0.1em 0.4em; margin: 0 0.15em; border: 1px solid rgba(255,255,255,0.4); border-radius: 6px; font-family: Menlo, monospace; font-size: 0.85em; background: rgba(255,255,255,0.08); }
.mvg-game .hud { position: absolute; inset: env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px) env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px); pointer-events: none; }
.mvg-game .progress { position: absolute; top: 0; left: 0; right: 0; height: 4px; background: rgba(255,255,255,0.08); }
.mvg-game .progress i { display: block; height: 100%; width: 0; background: linear-gradient(90deg, #ff3d7f, #ff8c42, #ff2e2e, #fff6a0, #9b5cff, #3de8ff, #7cff4f); }
.mvg-game .ruler { position: absolute; top: 18px; left: 50%; transform: translateX(-50%); display: flex; gap: 6px; width: min(640px, 92%); }
.mvg-game .ruler div { flex: 1; text-align: center; font: 700 11px Menlo, monospace; letter-spacing: 1px; padding-top: 9px; border-top: 4px solid currentColor; opacity: 0.32; transition: opacity 0.15s, transform 0.15s; }
.mvg-game .ruler div.on { opacity: 1; transform: scale(1.12); text-shadow: 0 0 10px currentColor; }
.mvg-game .score, .mvg-game .combo { position: absolute; top: 64px; display: flex; flex-direction: column; font-family: "Avenir Next Condensed", "Avenir Next", sans-serif; }
.mvg-game .score { left: max(20px, 4%); }
.mvg-game .combo { right: max(20px, 4%); align-items: flex-end; }
.mvg-game .score b, .mvg-game .combo b { font-size: clamp(30px, 5vh, 52px); font-weight: 800; line-height: 1; font-variant-numeric: tabular-nums; text-shadow: 0 0 18px rgba(120,180,255,0.6); }
.mvg-game .score span, .mvg-game .combo span { font: 700 11px Menlo, monospace; letter-spacing: 3px; opacity: 0.6; margin-top: 4px; }
.mvg-game .combo em { font-style: normal; font-weight: 800; font-size: 22px; color: #fff6a0; text-shadow: 0 0 12px #ffb000; margin-top: 2px; }
.mvg-game .combo b.bump { animation: mvg-bump 0.18s ease-out; }
@keyframes mvg-bump { from { transform: scale(1.35); } to { transform: scale(1); } }
.mvg-game .band { position: absolute; top: 24%; left: 0; right: 0; text-align: center; font: 800 clamp(48px, 10vh, 120px) "Avenir Next Condensed", sans-serif; letter-spacing: 2px; opacity: 0; transform: rotate(-4deg); }
.mvg-game .band small { display: block; font: 700 clamp(13px, 1.8vh, 18px) Menlo, monospace; letter-spacing: 3px; opacity: 0.75; }
.mvg-game .band.show { animation: mvg-slam 1.4s ease-out forwards; }
@keyframes mvg-slam { 0% { opacity: 0; transform: rotate(-4deg) scale(1.6); } 10% { opacity: 1; transform: rotate(-4deg) scale(1); } 75% { opacity: 1; } 100% { opacity: 0; transform: rotate(-4deg) scale(0.96); } }
.mvg-game .judge { position: absolute; top: 60%; left: 0; right: 0; text-align: center; font: 800 clamp(26px, 4.5vh, 46px) "Avenir Next Condensed", sans-serif; letter-spacing: 3px; opacity: 0; }
.mvg-game .judge.show { animation: mvg-pop 0.45s ease-out forwards; }
@keyframes mvg-pop { 0% { opacity: 1; transform: translateY(8px) scale(1.25); } 60% { opacity: 1; } 100% { opacity: 0; transform: translateY(-18px) scale(1); } }
.mvg-game .lyric { position: absolute; bottom: 7%; left: 6%; right: 6%; text-align: center; font: 800 clamp(20px, 3.4vh, 38px) "Avenir Next", sans-serif; line-height: 1.25; text-shadow: 0 2px 10px rgba(0,0,0,0.8); }
.mvg-game .lyric span { opacity: 0.38; transition: opacity 0.08s; }
.mvg-game .lyric span.sung { opacity: 1; }
.mvg-game .overlay { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; background: radial-gradient(ellipse at center, rgba(2,2,12,0.55), rgba(2,2,12,0.88)); padding: 24px; box-sizing: border-box; }
.mvg-game .overlay[hidden], .mvg-game .hud[hidden] { display: none; }
.mvg-game .kicker { font: 600 14px Menlo, monospace; letter-spacing: 4px; color: #2cade4; text-shadow: 0 0 12px #2cade4; }
.mvg-game h1 { font: 800 clamp(44px, 9vh, 104px) / 0.95 "Avenir Next Condensed", sans-serif; margin: 16px 0 12px; background: linear-gradient(90deg, #ff3d7f, #ff8c42, #fff6a0, #9b5cff, #3de8ff, #7cff4f); -webkit-background-clip: text; background-clip: text; color: transparent; filter: drop-shadow(0 0 18px rgba(155,92,255,0.45)); }
.mvg-game h2 { font: 800 64px "Avenir Next Condensed", sans-serif; margin: 0 0 8px; }
.mvg-game .sub { opacity: 0.8; font-size: 17px; margin: 0 0 22px; }
.mvg-game .keys { display: flex; flex-direction: column; gap: 8px; font-size: 15px; opacity: 0.85; margin-bottom: 30px; }
.mvg-game button { font: 800 22px "Avenir Next", "PingFang SC", sans-serif; letter-spacing: 2px; color: #020208; background: #fff; border: 0; border-radius: 999px; padding: 14px 44px; cursor: pointer; box-shadow: 0 0 28px rgba(160,200,255,0.65); }
.mvg-game button:disabled { opacity: 0.5; cursor: default; }
.mvg-game a.back { margin-top: 22px; color: rgba(255,255,255,0.6); font-size: 15px; text-decoration: none; }
.mvg-game a.back:hover { color: #fff; }
`;

const TITLE = {
  zh: {
    sub: "接住每一拍的光子，从 γ 闸门的缺口钻过去",
    keys: ["<kbd>←</kbd><kbd>→</kbd> / <kbd>A</kbd><kbd>D</kbd> 绕隧道滑动", "鼠标或手指左右拖动也可以", "漏接光子、撞上闸门都会掉血，血条空了就失败；滑到隧道尽头就通关"],
  },
  en: {
    sub: "Catch a photon on every beat and slip through the gap in each γ gate",
    keys: ["<kbd>←</kbd><kbd>→</kbd> / <kbd>A</kbd><kbd>D</kbd> slide round the tunnel", "or drag sideways with a mouse or finger", "Missed photons and gate crashes drain your life; reach the end of the tunnel to clear"],
  },
};

/** The HUD and overlays of a mounted Slide Down the Spectrum, in `lang`. */
export const spectrumMarkup = (lang) => {
  const c = COMMON[lang];
  const t = TITLE[lang];
  return `
  <div class="stage" id="stage"></div>
  <div class="hud" id="hud" hidden>
    <div class="progress" id="progress"><i></i></div>
    <div class="ruler" id="ruler"></div>
    <div class="score" id="score"><b>0</b><span>SCORE</span>${lifeMarkup}</div>
    <div class="combo" id="combo"><b>0</b><span>COMBO</span><em>×1</em></div>
    <div class="band" id="band"></div>
    <div class="judge" id="judge"></div>
    <div class="lyric" id="lyric"></div>
  </div>
  <div class="overlay" id="title">
    <div class="kicker">STEM INSTITUTE · No. 15</div>
    <h1>SLIDE DOWN<br />THE SPECTRUM</h1>
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
