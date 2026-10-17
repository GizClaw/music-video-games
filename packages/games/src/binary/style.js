import { lifeMarkup } from "../finale.js";
import { COMMON, overlays } from "../lang.js";
import { spectrumStyle } from "../spectrum/style.js";

/** Layout for a mounted Binary Boogie: the shared game HUD plus the bit switches and number strip. Scoped to `.mvg-game.binary`. */
export const binaryStyle = `${spectrumStyle}
.mvg-game.binary { background: #05061a; font-family: Menlo, "PingFang SC", monospace; }
.mvg-game.binary h1 { font-family: Menlo, monospace; letter-spacing: 6px; background: linear-gradient(90deg, #ff004d, #ffa300, #ffec27, #00e436, #29adff, #ff77a8); -webkit-background-clip: text; background-clip: text; color: transparent; filter: drop-shadow(0 4px 0 #1d2b53) drop-shadow(0 0 16px rgba(255,236,39,0.4)); }
.mvg-game.binary .kicker { color: #ffec27; text-shadow: 0 0 12px #ffa300; }
.mvg-game.binary .progress i { background: linear-gradient(90deg, #ff004d, #ffa300, #ffec27, #00e436, #29adff, #ff77a8); }
.mvg-game.binary .overlay button { border-radius: 6px; box-shadow: 0 5px 0 #1d2b53, 0 0 24px rgba(255,236,39,0.5); background: #ffec27; }
.mvg-game.binary .lyric { top: 50px; bottom: auto; font-size: clamp(16px, 2.8vh, 28px); }
.mvg-game.binary .band { top: 30%; }
.mvg-game.binary .judge { top: 46%; font-family: Menlo, monospace; }
.mvg-game .nums { position: absolute; top: 16px; left: 50%; transform: translateX(-50%); display: flex; gap: 4px; }
.mvg-game .nums i { width: 22px; height: 22px; display: grid; place-items: center; font: 700 10px Menlo, monospace; font-style: normal; color: rgba(255,255,255,0.35); background: rgba(29,43,83,0.6); border: 1px solid rgba(131,118,156,0.5); }
.mvg-game .nums i.got { color: #05061a; background: #ffec27; border-color: #fff; box-shadow: 0 0 10px #ffa300; }
.mvg-game .nums i.pop { animation: mvg-pop-num 0.45s ease-out; }
@keyframes mvg-pop-num { from { transform: scale(1.8); } to { transform: scale(1); } }
.mvg-game .switches { position: absolute; left: 50%; bottom: max(14px, 2.5%); transform: translateX(-50%); display: flex; align-items: stretch; gap: 10px; }
/* The shared HUD ignores pointer events; its playable switches must receive them. */
.mvg-game .sw { width: clamp(64px, 9vw, 96px); height: clamp(70px, 12vh, 104px); padding: 0; border-radius: 8px; border: 3px solid #29adff; background: #1d2b53; color: #29adff; box-shadow: 0 5px 0 #070b22; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; font-family: Menlo, monospace; letter-spacing: 0; cursor: pointer; pointer-events: auto; touch-action: none; transition: transform 0.05s; }
.mvg-game .sw b { font-size: clamp(26px, 5vh, 40px); line-height: 1; }
.mvg-game .sw small { font-size: 11px; opacity: 0.8; }
.mvg-game .sw em { font-style: normal; font-size: 10px; opacity: 0.55; }
.mvg-game .sw.on { background: #ffec27; border-color: #fff; color: #05061a; box-shadow: 0 5px 0 #ab5236, 0 0 22px #ffa300; }
.mvg-game .sw:active, .mvg-game .sw.down { transform: translateY(3px); box-shadow: 0 2px 0 #070b22; }
.mvg-game .sw.clr { width: clamp(52px, 7vw, 76px); border-color: #ff004d; color: #ff77a8; margin-left: 6px; }
.mvg-game .sw.clr b { font-size: clamp(20px, 3.6vh, 30px); }
.mvg-game .sw.need { animation: mvg-need 0.5s ease-in-out infinite alternate; }
@keyframes mvg-need { from { box-shadow: 0 5px 0 #070b22, 0 0 0 0 #ffec27; } to { box-shadow: 0 5px 0 #070b22, 0 0 0 6px #ffec27, 0 0 26px #ffec27; } }
.mvg-game .tip { position: absolute; left: 50%; bottom: calc(max(14px, 2.5%) + clamp(70px, 12vh, 104px) + 18px); transform: translateX(-50%); padding: 8px 16px; border: 2px solid #ffec27; background: rgba(5,6,26,0.85); color: #ffec27; font: 700 clamp(14px, 2.4vh, 20px) Menlo, "PingFang SC", monospace; white-space: nowrap; box-shadow: 0 4px 0 #1d2b53; opacity: 0; transition: opacity 0.2s; }
.mvg-game .tip.on { opacity: 1; }
.mvg-game .readout { display: flex; flex-direction: column; justify-content: center; min-width: 3.2em; font: 800 clamp(22px, 4.5vh, 40px) Menlo, monospace; color: #fff; text-shadow: 0 4px 0 #1d2b53; }
.mvg-game .readout small { font-size: 11px; color: #83769c; letter-spacing: 2px; }
@media (pointer: coarse) {
  .mvg-game .switches { left: 0; right: 0; transform: none; bottom: 0; gap: 0; padding: 0 env(safe-area-inset-right, 0px) env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px); }
  .mvg-game .sw { flex: 1; width: auto; height: clamp(84px, 22vh, 140px); border-radius: 0; border-width: 2px; }
  .mvg-game .sw em { display: none; }
  .mvg-game .sw.clr { flex: 0.55; min-width: 44px; margin-left: 0; }
  .mvg-game .tip { bottom: calc(clamp(84px, 22vh, 140px) + 14px); }
  .mvg-game .readout { display: none; }
}
@media (max-width: 560px), (max-height: 500px) {
  .mvg-game .nums i { width: 16px; height: 16px; font-size: 8px; }
  .mvg-game.binary .lyric { top: 40px; }
  /* Leave room for the universe's exit button below the title's start button. */
  .mvg-game.binary #title { padding: 16px 20px calc(84px + env(safe-area-inset-bottom, 0px)); }
  .mvg-game.binary #title .kicker { font-size: 12px; letter-spacing: 2px; }
  .mvg-game.binary #title h1 { font-size: clamp(32px, 8vh, 64px); margin: 8px 0; }
  .mvg-game.binary #title .sub { font-size: 14px; margin-bottom: 12px; }
  .mvg-game.binary #title .keys { font-size: 12px; line-height: 1.35; gap: 6px; margin-bottom: 16px; }
  .mvg-game.binary #title button { font-size: 18px; padding: 10px 28px; }
  .mvg-game.binary .tip { width: max-content; max-width: calc(100% - 24px); box-sizing: border-box; white-space: normal; text-align: center; }
}
`;

const TITLE = {
  zh: {
    sub: "用四个开关拨出数字，炮台就对准那只外星人",
    keys: [
      "<kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><kbd>F</kbd> 开关 8 · 4 · 2 · 1，<kbd>空格</kbd> 一键清零，也可以点下面的开关",
      "拨出外星人身上的数字，下一拍就开火打爆它，打完自动清零",
      "3 条命，溜走一只扣一条，命没了就失败；歌曲循环 2 轮、越来越快，撑到最后就通关",
    ],
  },
  en: {
    sub: "Dial a number with four switches and the cannon locks onto that invader",
    keys: [
      "<kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><kbd>F</kbd> flip the 8 · 4 · 2 · 1 switches, <kbd>Space</kbd> clears them, or click the switches below",
      "Spell the number an invader carries and it is shot on the next beat; the switches clear after each shot",
      "Three lives, one lost for each invader that gets through; the song plays twice, faster the second time: last to the end to clear",
    ],
  },
};

/** The HUD and overlays of a mounted Binary Boogie, in `lang`. */
export const binaryMarkup = (lang) => {
  const c = COMMON[lang];
  const t = TITLE[lang];
  return `
  <div class="stage" id="stage"></div>
  <div class="hud" id="hud" hidden>
    <div class="progress" id="progress"><i></i></div>
    <div class="nums" id="nums"></div>
    <div class="score" id="score"><b>0</b><span>SCORE</span>${lifeMarkup}</div>
    <div class="combo" id="combo"><b>0</b><span>COMBO</span><em>×1</em></div>
    <div class="band" id="band"></div>
    <div class="judge" id="judge"></div>
    <div class="lyric" id="lyric"></div>
    <div class="tip" id="tip"></div>
    <div class="switches" id="switches"></div>
  </div>
  <div class="overlay" id="title">
    <div class="kicker">STEM INSTITUTE · No. 23</div>
    <h1>BINARY<br />BOOGIE</h1>
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
