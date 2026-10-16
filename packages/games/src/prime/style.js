import { COMMON, overlays } from "../lang.js";
import { spectrumStyle } from "../spectrum/style.js";

/** Layout for a mounted Prime Time: the shared game HUD plus the power bar, the board counter and the factor line. Scoped to `.mvg-game.prime`. */
export const primeStyle = `${spectrumStyle}
.mvg-game.prime { background: #07041a; }
.mvg-game.prime h1 { background: linear-gradient(90deg, #ffe6a8, #ffc83d, #ff8a3d); -webkit-background-clip: text; background-clip: text; color: transparent; filter: drop-shadow(0 0 18px rgba(255,200,61,0.5)); }
.mvg-game.prime .kicker { color: #ffc83d; text-shadow: 0 0 12px #ff8a3d; }
.mvg-game.prime .progress i { background: linear-gradient(90deg, #ff8a3d, #ffc83d, #ffe6a8); }
.mvg-game.prime .overlay button { background: #ffc83d; box-shadow: 0 0 28px rgba(255,200,61,0.6); }
.mvg-game.prime .lyric { top: 92px; bottom: auto; font-size: clamp(16px, 2.8vh, 28px); }
.mvg-game.prime .band { top: 30%; }
.mvg-game.prime .judge, .mvg-game.prime .explain { top: 0; left: 0; right: auto; width: 0; display: flex; justify-content: center; white-space: nowrap; }
.mvg-game.prime .explain { position: absolute; top: auto; left: 50%; bottom: calc(max(14px, 2.5%) + 52px); font: 800 clamp(22px, 4vh, 40px) "Avenir Next Condensed", "PingFang SC", sans-serif; letter-spacing: 1px; opacity: 0; transition: opacity 0.15s; text-shadow: 0 2px 12px rgba(0,0,0,0.9); }
.mvg-game.prime .explain.on { opacity: 1; }
.mvg-game .mults span { position: absolute; transform: translate(-50%, -50%); font: 800 clamp(16px, 3vh, 28px) "Avenir Next Condensed", sans-serif; white-space: nowrap; opacity: 0; pointer-events: none; }
.mvg-game .hp { width: clamp(110px, 14vw, 170px); height: 10px; margin-top: 8px; border-radius: 5px; background: rgba(58,42,85,0.9); border: 1px solid rgba(255,200,61,0.4); overflow: hidden; }
.mvg-game .hp i { display: block; height: 100%; width: 100%; background: linear-gradient(90deg, #ff8a3d, #ffc83d); box-shadow: 0 0 10px #ffc83d; transition: width 0.15s; }
.mvg-game .hp.low i { background: #ff4d6d; box-shadow: 0 0 12px #ff4d6d; animation: mvg-low 0.5s ease-in-out infinite alternate; }
@keyframes mvg-low { from { opacity: 1; } to { opacity: 0.45; } }
.mvg-game .hp.hurt { animation: mvg-shake 0.3s; }
@keyframes mvg-shake { 25% { transform: translateX(-4px); } 75% { transform: translateX(4px); } }
.mvg-game .tally { position: absolute; top: 18px; left: 50%; transform: translateX(-50%); padding: 6px 16px; border: 2px solid #ffc83d; border-radius: 999px; background: rgba(18,10,40,0.8); color: #fff; font: 700 15px Menlo, monospace; letter-spacing: 2px; box-shadow: 0 0 16px rgba(255,200,61,0.35); }
.mvg-game .tally b { color: #ffc83d; }
.mvg-game .tally.pop { animation: mvg-pop-num 0.45s ease-out; }
@keyframes mvg-pop-num { from { transform: translateX(-50%) scale(1.4); } to { transform: translateX(-50%) scale(1); } }
.mvg-game .tip { position: absolute; left: 50%; bottom: max(14px, 2.5%); transform: translateX(-50%); padding: 8px 18px; border: 2px solid #ffc83d; border-radius: 12px; background: rgba(18,10,40,0.88); color: #ffe6a8; font: 700 clamp(14px, 2.4vh, 20px) "Avenir Next", "PingFang SC", sans-serif; white-space: nowrap; opacity: 0; transition: opacity 0.2s; }
.mvg-game .tip.on { opacity: 1; }
@media (max-width: 560px), (max-height: 500px) { .mvg-game .tally { font-size: 12px; padding: 4px 12px; } .mvg-game.prime .lyric { top: 52px; } }
@media (max-aspect-ratio: 23/20) { .mvg-game.prime .lyric { top: 168px; } }
@media (pointer: coarse) and (min-aspect-ratio: 23/20) {
  .mvg-game.prime .lyric { top: auto; bottom: 18%; left: max(16px, 3%); right: auto; width: calc(50% - 41vh - 28px); text-align: left; font-size: clamp(15px, 4.4vh, 22px); }
  .mvg-game .tally { top: auto; bottom: 18%; left: auto; right: max(16px, 3%); transform: none; }
  .mvg-game .tally.pop { animation: none; }
}
@media (max-height: 500px) {
  .mvg-game.prime .overlay { justify-content: flex-start; padding-top: 14px; }
  .mvg-game.prime h1 { font-size: 40px; margin: 6px 0 4px; }
  .mvg-game.prime h1 br { display: none; }
  .mvg-game.prime .sub { font-size: 14px; margin-bottom: 8px; }
  .mvg-game.prime .keys { font-size: 12px; gap: 3px; margin-bottom: 12px; }
  .mvg-game.prime .overlay button { padding: 10px 36px; font-size: 18px; }
  .mvg-game.prime .grade { font-size: 72px; }
  .mvg-game.prime .final { font-size: 26px; margin-bottom: 6px; }
  .mvg-game.prime .stats { font-size: 12px; border-spacing: 16px 1px; margin-bottom: 10px; }
}
`;

const TITLE = {
  zh: {
    sub: "跟着节拍敲质数",
    keys: ["只有质数会弹起来", "闪到最亮的那一拍点它，就是 PERFECT", "漏掉质数会掉电"],
  },
  en: {
    sub: "Whack the primes on the beat",
    keys: ["Only primes pop up", "Hit them as they flash brightest for a PERFECT", "A missed prime drains power"],
  },
};

/** The HUD and overlays of a mounted Prime Time, in `lang`. */
export const primeMarkup = (lang) => {
  const c = COMMON[lang];
  const t = TITLE[lang];
  return `
  <div class="stage" id="stage"></div>
  <div class="hud" id="hud" hidden>
    <div class="progress" id="progress"><i></i></div>
    <div class="tally" id="tally">PRIMES <b>0</b> / 25</div>
    <div class="score" id="score"><b>0</b><span>SCORE</span><div class="hp" id="hp"><i></i></div></div>
    <div class="combo" id="combo"><b>0</b><span>COMBO</span><em>×1</em></div>
    <div class="band" id="band"></div>
    <div class="judge" id="judge"></div>
    <div class="explain" id="explain"></div>
    <div class="mults" id="mults"></div>
    <div class="lyric" id="lyric"></div>
    <div class="tip" id="tip"></div>
  </div>
  <div class="overlay" id="title">
    <div class="kicker">STEM INSTITUTE · No. 8</div>
    <h1>PRIME<br />TIME</h1>
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
