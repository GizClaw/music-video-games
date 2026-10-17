import { lifeMarkup } from "../finale.js";
import { COMMON, overlays } from "../lang.js";
import { spectrumStyle } from "../spectrum/style.js";
import { ICONS, SNOWFLAKE } from "./icons.js";
import { LANES } from "./song.js";

const INK = "#1c2547";

/** Layout for a mounted Penguin Step Party: a note highway over a row of four pads. Scoped to `.mvg-game.penguin`. */
export const penguinStyle = `${spectrumStyle}
.mvg-game.penguin { background: #3a4fa0; --lane-h: min(42%, 400px); --pad-h: clamp(64px, 11vh, 96px); }
.mvg-game.penguin h1 { background: linear-gradient(90deg, #2fb8f0, #ff4fa3, #ffb000, #3fc84a); -webkit-background-clip: text; background-clip: text; color: transparent; filter: drop-shadow(0 3px 0 ${INK}) drop-shadow(0 0 14px rgba(255,255,255,0.35)); }
.mvg-game.penguin .kicker { color: #bff4ff; text-shadow: 0 2px 0 ${INK}; }
.mvg-game.penguin .overlay { background: radial-gradient(ellipse at center, rgba(40,56,130,0.55), rgba(18,26,70,0.88)); }
.mvg-game.penguin .progress i { background: linear-gradient(90deg, #2fb8f0, #ff4fa3, #ffb000, #3fc84a); }
.mvg-game.penguin .score b, .mvg-game.penguin .combo b { text-shadow: 0 3px 0 ${INK}; }
.mvg-game.penguin .band { top: 25%; -webkit-text-stroke: 2px ${INK}; paint-order: stroke fill; }
.mvg-game.penguin .judge { top: auto; bottom: calc(var(--pad-h) + var(--lane-h) * 0.22); -webkit-text-stroke: 1.5px ${INK}; paint-order: stroke fill; }
.mvg-game.penguin .lyric { bottom: auto; top: 112px; font-size: clamp(17px, 2.8vh, 30px); -webkit-text-stroke: 1px ${INK}; paint-order: stroke fill; }
.mvg-game .crew { position: absolute; top: 18px; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 3px; font: 800 15px "Avenir Next", sans-serif; text-shadow: 0 2px 0 ${INK}; }
.mvg-game .crew i { width: 10px; height: 13px; border-radius: 50% 50% 45% 45%; background: rgba(255,255,255,0.18); border: 2px solid rgba(28,37,71,0.6); transition: background 0.2s, transform 0.2s; }
.mvg-game .crew i.on { background: radial-gradient(circle at 50% 70%, #fff4e4 0 38%, #2d3a63 40%); border-color: ${INK}; }
.mvg-game .crew i.pop { animation: mvg-crew-pop 0.5s ease-out; }
@keyframes mvg-crew-pop { from { transform: scale(2) translateY(-4px); } to { transform: scale(1); } }
.mvg-game .lanes { position: absolute; left: 50%; bottom: var(--pad-h); width: min(460px, 100%); height: var(--lane-h); transform: translateX(-50%); display: grid; grid-template-columns: repeat(4, 1fr); pointer-events: none; background: linear-gradient(to top, rgba(20,30,80,0.55), rgba(20,30,80,0)); mask-image: linear-gradient(to top, #000 70%, transparent); -webkit-mask-image: linear-gradient(to top, #000 70%, transparent); }
.mvg-game .lane { position: relative; border-left: 1px solid rgba(255,255,255,0.12); }
.mvg-game .lane:last-child { border-right: 1px solid rgba(255,255,255,0.12); }
.mvg-game .lane.lit { background: linear-gradient(to top, color-mix(in srgb, var(--c) 45%, transparent), transparent 60%); }
.mvg-game .hitband { position: absolute; left: 0; right: 0; bottom: 4px; height: 66px; opacity: calc(0.8 + var(--kick, 0) * 0.2); background: linear-gradient(to top, rgba(255,190,20,0.15), rgba(255,214,70,0.5) 50%, rgba(255,190,20,0.15)); border-top: 3px solid #ffd23f; border-bottom: 3px solid #ffd23f; box-shadow: 0 0 calc(14px + var(--kick, 0) * 16px) rgba(255,196,0,0.85), inset 0 0 18px rgba(255,236,150,0.6); pointer-events: none; }
.mvg-game .hitband.perfect { animation: mvg-band 0.28s ease-out; }
@keyframes mvg-band { from { box-shadow: 0 0 46px #fff3a0, inset 0 0 40px #fff6c0; background: rgba(255,232,120,0.85); } }
.mvg-game .target { position: absolute; left: 50%; bottom: 10px; width: 74%; aspect-ratio: 1.35; max-height: 62px; transform: translateX(-50%); display: grid; place-items: center; box-sizing: border-box; border-radius: 16px; border: 3px dashed color-mix(in srgb, var(--c) 60%, #fff); background: rgba(255,255,255,0.18); font-size: clamp(20px, 3.4vh, 30px); opacity: 0.75; }
.mvg-game .target .ico { opacity: 0.4; filter: none; }
.mvg-game .lane.lit .target { border-style: solid; border-color: #fff; background: color-mix(in srgb, var(--c) 35%, transparent); opacity: 1; box-shadow: 0 0 14px var(--c); }
.mvg-game .note { position: absolute; left: 50%; bottom: 10px; width: 74%; aspect-ratio: 1.35; max-height: 62px; box-sizing: border-box; z-index: 1; display: grid; place-items: center; border-radius: 16px; background: var(--c); border: 3px solid ${INK}; box-shadow: inset 0 -6px 0 rgba(0,0,0,0.18), 0 4px 0 ${INK}; font-size: clamp(20px, 3.4vh, 30px); will-change: transform, opacity; }
.mvg-game .note.word { box-shadow: inset 0 -6px 0 rgba(0,0,0,0.18), 0 4px 0 ${INK}, 0 0 0 3px #fff, 0 0 18px #fff; }
.mvg-game .note.miss { background: #8a93ad; filter: grayscale(1); }
.mvg-game.penguin .ico { display: block; width: 1.25em; height: 1.25em; filter: drop-shadow(0 2px 0 rgba(28,37,71,0.35)); }
.mvg-game .pads { position: absolute; left: 50%; bottom: env(safe-area-inset-bottom, 0px); width: min(460px, 100%); height: var(--pad-h); transform: translateX(-50%); display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; padding: 0 6px 6px; box-sizing: border-box; }
.mvg-game .pad { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; border-radius: 18px; background: var(--c); border: 3px solid ${INK}; box-shadow: inset 0 -8px 0 rgba(0,0,0,0.2), 0 5px 0 ${INK}; font-size: clamp(22px, 4vh, 34px); line-height: 1; cursor: pointer; touch-action: none; transition: filter 0.1s; }
.mvg-game .pad span { font: 800 12px "Avenir Next", "PingFang SC", sans-serif; color: ${INK}; letter-spacing: 1px; }
.mvg-game .pad kbd { position: absolute; top: 5px; right: 6px; margin: 0; font-size: 13px; color: ${INK}; border-color: rgba(28,37,71,0.4); background: rgba(255,255,255,0.35); }
@media (pointer: coarse) { .mvg-game .pad kbd { display: none; } }
.mvg-game .pad.down { transform: translateY(4px); box-shadow: inset 0 -4px 0 rgba(0,0,0,0.2), 0 1px 0 ${INK}; filter: brightness(1.15); }
.mvg-game .pad.hit::after { content: ""; position: absolute; inset: -6px; border-radius: 22px; border: 4px solid #fff; animation: mvg-pad-ring 0.3s ease-out forwards; }
@keyframes mvg-pad-ring { from { opacity: 1; transform: scale(0.9); } to { opacity: 0; transform: scale(1.15); } }
.mvg-game.frozen .pad { background: #cfe9ff; filter: saturate(0.3); }
.mvg-game.frozen .pad::before { content: ""; position: absolute; top: 6px; left: 8px; width: 16px; height: 16px; background: ${SNOWFLAKE} center / contain no-repeat; }
.mvg-game.frozen .lanes { background: linear-gradient(to top, rgba(200,235,255,0.55), rgba(200,235,255,0)); }
.mvg-game.fever .lane { animation: mvg-fever 0.4s ease-in-out infinite alternate; }
.mvg-game.fever .lane:nth-child(2) { animation-delay: 0.1s; } .mvg-game.fever .lane:nth-child(3) { animation-delay: 0.2s; } .mvg-game.fever .lane:nth-child(4) { animation-delay: 0.3s; }
@keyframes mvg-fever { from { background: transparent; } to { background: linear-gradient(to top, color-mix(in srgb, var(--c) 55%, transparent), transparent 70%); } }
@media (min-aspect-ratio: 4/3) { .mvg-game.penguin { --lane-h: 44%; } }
@media (max-height: 500px) { .mvg-game.penguin { --lane-h: 50%; --pad-h: 58px; } .mvg-game.penguin h1 { font-size: clamp(36px, 13vh, 72px); margin: 6px 0; } .mvg-game.penguin .sub { margin-bottom: 10px; } .mvg-game.penguin .keys { margin-bottom: 14px; gap: 4px; font-size: 13px; } .mvg-game .pad span { display: none; } }
@media (max-width: 560px) { .mvg-game.penguin .score, .mvg-game.penguin .combo { top: 72px; } .mvg-game.penguin .lyric { top: 150px; } .mvg-game.penguin .score b, .mvg-game.penguin .combo b { font-size: 30px; } }
`;

const TITLE = {
  zh: {
    sub: "企鹅劲舞团！音符落到底时按下对应的键，跳得好就有企鹅加入你的舞队",
    keys: ["<kbd>←</kbd> 左脚　<kbd>↑</kbd> 翅膀　<kbd>↓</kbd> 拍手　<kbd>→</kbd> 右脚（D F J K 也行）", "两个一起落下时一起按 · 唱到 Freeze 时别动", "漏拍、按错会掉血，血条空了就失败；跳完整首歌就通关"],
    touchKeys: ["音符落到底部按钮上时按下去", "两个一起落下就两只手一起按 · 唱到 Freeze 时千万别动！", "漏拍会掉血，血条空了就失败；跳完整首歌就通关"],
  },
  en: {
    sub: "A penguin dance-off! Hit each pad as its note lands and your dance crew grows",
    keys: ["<kbd>←</kbd> left foot　<kbd>↑</kbd> flap　<kbd>↓</kbd> clap　<kbd>→</kbd> right foot (or D F J K)", "Press both when two land together · don't move on Freeze", "Misses and wrong pads drain your life; dance to the end of the song to clear"],
    touchKeys: ["Tap a pad as its note lands on it", "Two notes at once? Use both thumbs · when they sing Freeze, don't move!", "Misses drain your life; dance to the end of the song to clear"],
  },
};
export const titleKeys = (lang, touch) => (touch ? TITLE[lang].touchKeys : TITLE[lang].keys);

const ARROWS = { arrowleft: "←", arrowup: "↑", arrowdown: "↓", arrowright: "→" };
const keyHint = (l) => ARROWS[l.keys[0]] ?? l.keys[0].toUpperCase();

/** The HUD and overlays of a mounted Penguin Step Party, in `lang`. */
export const penguinMarkup = (lang) => {
  const c = COMMON[lang];
  const t = TITLE[lang];
  return `
  <div class="stage" id="stage"></div>
  <div class="hud" id="hud" hidden>
    <div class="progress" id="progress"><i></i></div>
    <div class="crew" id="crew"></div>
    <div class="score" id="score"><b>0</b><span>SCORE</span>${lifeMarkup}</div>
    <div class="combo" id="combo"><b>0</b><span>COMBO</span><em>×1</em></div>
    <div class="band" id="band"></div>
    <div class="lyric" id="lyric"></div>
    <div class="lanes" id="lanes"><div class="hitband" id="hitband"></div>${LANES.map((l, i) => `<div class="lane" style="--c:${l.color}"><div class="target">${ICONS[l.id]}</div></div>`).join("")}</div>
    <div class="judge" id="judge"></div>
    <div class="pads" id="pads">${LANES.map((l, i) => `<div class="pad" data-lane="${i}" style="--c:${l.color}">${ICONS[l.id]}<span>${l.label[lang]}</span><kbd>${keyHint(l)}</kbd></div>`).join("")}</div>
  </div>
  <div class="overlay" id="title">
    <div class="kicker">ANIMAL MOVES</div>
    <h1>PENGUIN<br />STEP PARTY</h1>
    <p class="sub">${t.sub}</p>
    <div class="keys"></div>
    <button id="start" disabled>${c.loading}</button>
    <a class="back" href="">${c.back}</a>
  </div>
  ${overlays(c)}
`;
};
