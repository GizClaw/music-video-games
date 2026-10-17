import { lifeMarkup } from "../finale.js";
import { COMMON, overlays } from "../lang.js";
import { spectrumStyle } from "../spectrum/style.js";

/** Layout for a mounted Planet Parade: the shared game HUD plus the planet lineup. Scoped to `.mvg-game.planet`. */
export const planetStyle = `${spectrumStyle}
.mvg-game.planet h1 { background: linear-gradient(90deg, #c9c2b8, #f0cf86, #4f8dff, #e0623e, #e0a96d, #f0d896, #8fe6ec, #4f73ff); -webkit-background-clip: text; background-clip: text; color: transparent; filter: drop-shadow(0 0 18px rgba(255,179,71,0.45)); }
.mvg-game.planet .kicker { color: #ffb347; text-shadow: 0 0 12px #ffb347; }
.mvg-game.planet .progress i { background: linear-gradient(90deg, #c9c2b8, #f0cf86, #4f8dff, #e0623e, #e0a96d, #f0d896, #8fe6ec, #4f73ff); }
.mvg-game .lineup { position: absolute; top: 16px; left: 50%; transform: translateX(-50%); display: flex; gap: clamp(6px, 1.4vw, 14px); }
.mvg-game .lineup div { display: flex; flex-direction: column; align-items: center; gap: 5px; font: 700 10px Menlo, monospace; letter-spacing: 1px; color: #fff; opacity: 0.35; transition: opacity 0.2s, transform 0.2s; }
.mvg-game .lineup i { width: 16px; height: 16px; border-radius: 50%; background: var(--c); filter: grayscale(1) brightness(0.55); }
.mvg-game .lineup div.got { opacity: 1; }
.mvg-game .lineup div.got i { filter: none; box-shadow: 0 0 12px var(--c); }
.mvg-game .lineup div.live { opacity: 0.75; transform: translateY(3px); }
.mvg-game .lineup div.got.live { opacity: 1; }
.mvg-game .lineup div.pop i { animation: mvg-pop-planet 0.5s ease-out; }
@keyframes mvg-pop-planet { from { transform: scale(2.2); } to { transform: scale(1); } }
.mvg-game .lineup .dwarf i { width: 9px; height: 9px; margin: 3.5px 0; }
.mvg-game .lineup b { font-size: 11px; color: var(--c); }
.mvg-game .tags { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
.mvg-game .tag { position: absolute; left: 0; top: 0; display: flex; align-items: center; gap: 6px; padding: 3px 9px 3px 3px; border-radius: 999px; background: rgba(4, 6, 18, 0.55); border: 1px solid rgba(255,255,255,0.12); font: 700 11px/1 Menlo, monospace; letter-spacing: 1.5px; color: rgba(255,255,255,0.7); white-space: nowrap; transition: background 0.15s, border-color 0.15s, color 0.15s; will-change: transform; }
.mvg-game .tag b { display: grid; place-items: center; width: 20px; height: 20px; border-radius: 50%; background: var(--c); color: #05060f; font-size: 12px; }
.mvg-game .tag.due { color: #fff; border-color: var(--c); background: rgba(4, 6, 18, 0.8); box-shadow: 0 0 16px var(--c); }
.mvg-game .tag.due b { box-shadow: 0 0 12px var(--c); }
.mvg-game .tag.sun { padding-left: 9px; }
.mvg-game .tag.due b { width: 30px; height: 30px; font-size: 17px; animation: mvg-key-bob 0.5s ease-in-out infinite alternate; }
.mvg-game .tag.sun.due { font-size: 13px; padding: 6px 12px; }
@keyframes mvg-key-bob { from { transform: translateY(0); } to { transform: translateY(-3px); } }
.mvg-game .keylane { position: absolute; left: 50%; bottom: calc(7% + clamp(34px, 5.5vh, 60px)); width: min(640px, 86vw); height: 60px; transform: translateX(-50%); pointer-events: none; }
.mvg-game .keylane::before { content: ""; position: absolute; left: 30px; right: 0; top: 29px; height: 2px; background: linear-gradient(90deg, rgba(255,255,255,0.45), rgba(255,255,255,0)); }
.mvg-game .keylane .now { position: absolute; left: 0; top: 2px; width: 56px; height: 56px; box-sizing: border-box; border: 3px solid rgba(255,255,255,0.85); border-radius: 14px; box-shadow: 0 0 18px rgba(255,255,255,0.35), inset 0 0 12px rgba(255,255,255,0.2); }
.mvg-game .keylane .now::after { content: "NOW"; position: absolute; left: 0; right: 0; top: -17px; text-align: center; font: 700 10px Menlo, monospace; letter-spacing: 2px; color: rgba(255,255,255,0.6); }
.mvg-game .key { position: absolute; left: 0; top: 10px; height: 40px; min-width: 40px; padding: 0 6px; box-sizing: border-box; display: grid; place-items: center; border-radius: 10px; background: var(--c); color: #05060f; font: 800 20px/1 "Avenir Next", sans-serif; box-shadow: 0 3px 0 rgba(0,0,0,0.45), 0 0 14px var(--c); will-change: transform, opacity; }
.mvg-game .key.word { top: 6px; height: 48px; min-width: 48px; font-size: 25px; outline: 2px solid #fff; outline-offset: 1px; }
.mvg-game .key.sun { min-width: 76px; font-size: 14px; letter-spacing: 1px; }
@media (pointer: coarse) { .mvg-game .key.sun { min-width: 48px; font-size: 24px; } }
.mvg-game .key.miss { background: #4a4f66; box-shadow: none; color: #9aa0b8; }
.mvg-game .tap { display: none; position: absolute; right: 88px; bottom: 88px; width: 0; height: 0; pointer-events: none; }
.mvg-game.simple .lyric { left: 190px; right: 190px; }
.mvg-game.simple .tap { display: block; }
.mvg-game.simple .keylane, .mvg-game.simple .tags { display: none; }
.mvg-game .tap .btn { position: absolute; left: 0; top: 0; width: 96px; height: 96px; transform: translate(-50%, -50%); box-sizing: border-box; border-radius: 50%; border: 4px solid #fff; background: radial-gradient(circle at 35% 30%, rgba(255,255,255,0.85), var(--c, #9fe6ff) 62%); display: grid; place-items: center; font: 800 18px "Avenir Next", sans-serif; letter-spacing: 3px; color: #05060f; transition: background 0.15s; }
.mvg-game .tap .btn.down { animation: mvg-tap 0.14s ease-out; }
@keyframes mvg-tap { from { transform: translate(-50%, -50%) scale(0.86); } to { transform: translate(-50%, -50%) scale(1); } }
.mvg-game .tap i { position: absolute; left: 0; top: 0; transform: translate(-50%, -50%); box-sizing: border-box; border-radius: 50%; border: 4px solid var(--c); box-shadow: 0 0 12px var(--c); }
.mvg-game .tag.hover { color: #fff; border-color: rgba(255,255,255,0.6); transform-origin: 50% 0; }
.mvg-game .tag.hover b { transform: scale(1.2); }
.mvg-game .rotate { display: none; margin: -14px 0 18px; font-size: 14px; color: #ffb347; letter-spacing: 1px; animation: mvg-key-bob 0.8s ease-in-out infinite alternate; }
@media (orientation: portrait) and (pointer: coarse) { .mvg-game .rotate { display: block; } }
@media (max-height: 500px) { .mvg-game.planet h1 { font-size: clamp(36px, 13vh, 72px); margin: 6px 0; } .mvg-game.planet .sub { font-size: 14px; margin-bottom: 10px; } .mvg-game.planet .keys { margin-bottom: 14px; gap: 4px; font-size: 13px; } .mvg-game.planet .score, .mvg-game.planet .combo { top: 44px; } .mvg-game .keylane { bottom: calc(5% + 34px); } .mvg-game.planet .band { top: 9%; font-size: 30px; } .mvg-game.planet .band small { font-size: 11px; } .mvg-game.planet .judge { top: 26%; font-size: 20px; } .mvg-game .tap { right: 66px; bottom: 62px; } .mvg-game.simple .lyric { left: 140px; right: 140px; } .mvg-game .tap .btn { width: 76px; height: 76px; font-size: 15px; } }
@media (max-width: 560px) { .mvg-game.planet .lyric { font-size: 18px; } .mvg-game .tap { right: 70px; bottom: calc(7% + 112px); } .mvg-game.simple .lyric { left: 6%; right: 6%; } .mvg-game.planet .band { top: 14%; font-size: 52px; } .mvg-game .keylane { bottom: calc(7% + 92px); } }
@media (max-width: 560px), (max-height: 500px) { .mvg-game .lineup span, .mvg-game .tag span { display: none; } .mvg-game .tag { padding: 3px; } }
`;

const TITLE = {
  zh: {
    sub: "行星点名！唱到哪颗行星，光圈就落在哪颗，跟着节拍点它",
    keys: ["光圈收紧时点击行星，或按它的序号 <kbd>1</kbd> 水星 … <kbd>8</kbd> 海王星", "march · hey · hooray 时点太阳或按 <kbd>空格</kbd>", "冥王星出现时按 <kbd>9</kbd>", "漏拍、点错会掉血，血条空了就失败；点名到最后就通关"],
  },
  en: {
    sub: "Planet roll call! A ring closes on each planet the song names: hit it on the beat",
    keys: ["Click the planet as its ring closes, or press its number <kbd>1</kbd> Mercury … <kbd>8</kbd> Neptune", "On march · hey · hooray hit the Sun or press <kbd>Space</kbd>", "Press <kbd>9</kbd> when Pluto shows up", "Misses and wrong hits drain your life; last to the final roll call to clear"],
  },
};

/** The HUD and overlays of a mounted Planet Parade, in `lang`. */
export const planetMarkup = (lang) => {
  const c = COMMON[lang];
  const t = TITLE[lang];
  return `
  <div class="stage" id="stage"></div>
  <div class="tags" id="tags"></div>
  <div class="hud" id="hud" hidden>
    <div class="progress" id="progress"><i></i></div>
    <div class="lineup" id="lineup"></div>
    <div class="score" id="score"><b>0</b><span>SCORE</span>${lifeMarkup}</div>
    <div class="combo" id="combo"><b>0</b><span>COMBO</span><em>×1</em></div>
    <div class="band" id="band"></div>
    <div class="judge" id="judge"></div>
    <div class="keylane" id="keylane"><div class="now"></div></div>
    <div class="tap" id="tap"><div class="btn">TAP</div></div>
    <div class="lyric" id="lyric"></div>
  </div>
  <div class="overlay" id="title">
    <div class="kicker">STEM INSTITUTE · No. 22</div>
    <h1>PLANET<br />PARADE</h1>
    <p class="sub">${t.sub}</p>
    <div class="keys">
      ${t.keys.map((k) => `<div>${k}</div>`).join("")}
      <div>${c.keysPause}</div>
    </div>
    <div class="rotate">${c.rotate}</div>
    <button id="start" disabled>${c.loading}</button>
    <a class="back" href="">${c.back}</a>
  </div>
  ${overlays(c)}
`;
};
