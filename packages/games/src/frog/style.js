import { COMMON, overlays } from "../lang.js";
import { spectrumStyle } from "../spectrum/style.js";

const INK = "#1c2547";
const svg = (body) => `<svg class="ico" viewBox="0 0 48 48" aria-hidden="true"><g fill="#fff" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round">${body}</g></svg>`;

/** Sticker-style note and button icons: white shapes with an ink outline. */
export const ICONS = {
  hop: svg(`<path d="M24 44c-6 0-8-5-8-9L6 17c-2-4 2-8 6-5 3 3 6 4 8 1l1-6c1-5 5-5 6 0l1 6c2 3 5 2 8-1 4-3 8 1 6 5L32 35c0 4-2 9-8 9z"/>`),
  big: svg(`<path d="M24 4l5.6 12.4 13.4 1.4-10 9.1 2.8 13.3L24 33.5 12.2 40.2 15 26.9 5 17.8l13.4-1.4z"/>`),
  ribbit: svg(`<ellipse cx="24" cy="27" rx="17" ry="13"/><path d="M15 27c3-4 6 4 9 0s6 4 9 0" fill="none" stroke-width="3"/>`),
  hold: svg(`<path d="M10 16l14 14 14-14" fill="none" stroke-width="6"/><path d="M10 16l14 14 14-14" fill="none" stroke="#fff" stroke-width="2.5"/>`),
  stop: svg(`<path d="M17 5h14l12 12v14L31 43H17L5 31V17z" fill="#ff3d5a"/><path d="M15 24h18" stroke="#fff" stroke-width="5"/>`),
  frog: svg(`<ellipse cx="24" cy="30" rx="17" ry="12"/><circle cx="15" cy="17" r="7"/><circle cx="33" cy="17" r="7"/><circle cx="15" cy="17" r="2.5" fill="${INK}"/><circle cx="33" cy="17" r="2.5" fill="${INK}"/><path d="M17 33c4 3 10 3 14 0" fill="none" stroke-width="2.6"/>`),
  left: svg(`<path d="M27 8L9 24l18 16v-9h12V17H27z"/>`),
  right: svg(`<path d="M21 8l18 16-18 16v-9H9V17h12z"/>`),
};

/** Lane colours: left, middle, right. */
export const LANE_COLORS = ["#2fb8f0", "#3fc84a", "#ff4fa3"];

/** Layout for a mounted Frog Hop Stop: three lanes falling onto three round buttons. Scoped to `.mvg-game.frog`. */
export const frogStyle = `${spectrumStyle}
.mvg-game.frog { background: #ffb38a; --btn: clamp(76px, 23vw, 104px); --col: min(33.3vw - 6px, 150px); --gap: calc(env(safe-area-inset-bottom, 0px) + clamp(22px, 4vh, 40px)); --lanes-h: 52vh; }
.mvg-game.frog h1 { background: linear-gradient(90deg, #3fc84a, #2fb8f0, #ffb000, #ff4fa3); -webkit-background-clip: text; background-clip: text; color: transparent; filter: drop-shadow(0 3px 0 ${INK}) drop-shadow(0 0 14px rgba(255,255,255,0.35)); }
.mvg-game.frog .kicker { color: #fff3c8; text-shadow: 0 2px 0 ${INK}; }
.mvg-game.frog .overlay { background: radial-gradient(ellipse at center, rgba(60,40,90,0.5), rgba(30,22,60,0.88)); }
.mvg-game.frog .progress i { background: linear-gradient(90deg, #3fc84a, #2fb8f0, #ffb000, #ff4fa3); }
.mvg-game.frog .score b, .mvg-game.frog .combo b { text-shadow: 0 3px 0 ${INK}; }
.mvg-game.frog .band { top: 22%; -webkit-text-stroke: 2px ${INK}; paint-order: stroke fill; }
.mvg-game.frog .judge { top: auto; bottom: calc(var(--gap) + var(--lanes-h) * 0.62); -webkit-text-stroke: 1.5px ${INK}; paint-order: stroke fill; z-index: 3; }
.mvg-game.frog .lyric { bottom: auto; top: 112px; font-size: clamp(17px, 2.8vh, 30px); -webkit-text-stroke: 1px ${INK}; paint-order: stroke fill; }
.mvg-game.frog .ico { display: block; width: 62%; height: 62%; filter: drop-shadow(0 2px 0 rgba(28,37,71,0.35)); }
.mvg-game.frog .crew { position: absolute; top: 18px; left: 50%; transform: translateX(-50%); display: flex; gap: 4px; }
.mvg-game.frog .crew i { width: 13px; height: 11px; border-radius: 50% 50% 45% 45%; background: rgba(255,255,255,0.25); border: 2px solid rgba(28,37,71,0.55); transition: background 0.2s; }
.mvg-game.frog .crew i.on { background: #5fcf5a; border-color: ${INK}; }
.mvg-game.frog .crew i.pop { animation: mvg-crew-pop 0.5s ease-out; }
@keyframes mvg-crew-pop { from { transform: scale(2) translateY(-4px); } to { transform: scale(1); } }
.mvg-game .lanes { position: absolute; left: 50%; bottom: var(--gap); width: calc(var(--col) * 3); height: var(--lanes-h); transform: translateX(-50%); display: grid; grid-template-columns: repeat(3, 1fr); pointer-events: none; }
.mvg-game .lane { position: relative; height: 100%; background: linear-gradient(to top, rgba(28,37,71,0.32), rgba(28,37,71,0.12) 70%, rgba(28,37,71,0)); border-left: 2px solid rgba(255,255,255,0.18); overflow: visible; }
.mvg-game .lane:first-child { border-left: 0; border-radius: 0 0 0 calc(var(--btn) / 2); }
.mvg-game .lane:last-child { border-radius: 0 0 calc(var(--btn) / 2) 0; }
.mvg-game .lane.flash { background: linear-gradient(to top, color-mix(in srgb, var(--c) 55%, transparent), rgba(28,37,71,0) 80%); }
.mvg-game .fbtn { position: absolute; left: 50%; bottom: 0; width: var(--btn); height: var(--btn); transform: translateX(-50%); display: grid; place-items: center; box-sizing: border-box; border-radius: 50%; background: radial-gradient(circle at 35% 30%, color-mix(in srgb, var(--c) 55%, #fff), var(--c) 60%, color-mix(in srgb, var(--c) 80%, #000)); border: 4px solid ${INK}; box-shadow: inset 0 -8px 0 rgba(0,0,0,0.18), 0 6px 0 ${INK}, 0 0 0 5px #ffd23f, 0 0 calc(10px + var(--kick, 0) * 16px) rgba(255,196,0,0.85); cursor: pointer; touch-action: none; pointer-events: auto; z-index: 1; }
.mvg-game .fbtn .ico { width: 56%; height: 56%; }
.mvg-game .fbtn kbd { position: absolute; top: calc(100% + 8px); font-size: 12px; color: #fff; border-color: rgba(255,255,255,0.5); background: rgba(28,37,71,0.45); white-space: nowrap; }
@media (pointer: coarse) { .mvg-game .fbtn kbd { display: none; } }
.mvg-game .fbtn.down { transform: translate(-50%, 5px); box-shadow: inset 0 -4px 0 rgba(0,0,0,0.2), 0 1px 0 ${INK}, 0 0 0 5px #ffd23f, 0 0 26px rgba(255,220,80,1); filter: brightness(1.15); }
.mvg-game .fbtn.perfect { animation: mvg-fbtn 0.28s ease-out; }
@keyframes mvg-fbtn { from { box-shadow: inset 0 -8px 0 rgba(0,0,0,0.18), 0 6px 0 ${INK}, 0 0 0 9px #fff3a0, 0 0 46px #fff3a0; } }
.mvg-game .fnote, .mvg-game .ftail { position: absolute; left: 50%; top: 0; width: calc(var(--btn) * 0.72); aspect-ratio: 1; display: grid; place-items: center; box-sizing: border-box; border-radius: 50%; background: var(--c); border: 3px solid ${INK}; box-shadow: inset 0 -5px 0 rgba(0,0,0,0.18), 0 3px 0 ${INK}; will-change: transform, opacity; z-index: 2; }
.mvg-game .fnote.big { width: calc(var(--btn) * 0.86); box-shadow: inset 0 -5px 0 rgba(0,0,0,0.18), 0 3px 0 ${INK}, 0 0 0 3px #fff, 0 0 16px #ffd23f; }
.mvg-game .fnote.miss, .mvg-game .ftail.miss { filter: grayscale(1) brightness(0.8); }
.mvg-game .fbar { position: absolute; left: 50%; top: 0; width: calc(var(--btn) * 0.42); border-radius: 999px; background: repeating-linear-gradient(0deg, #a98bff 0 14px, #8e5cff 14px 28px); border: 3px solid ${INK}; box-sizing: border-box; z-index: 1; will-change: transform, height, opacity; }
.mvg-game .fbar.held { background: repeating-linear-gradient(0deg, #ffe680 0 14px, #ffb000 14px 28px); }
.mvg-game .lanes.fever .fbtn { animation: mvg-fever 1.6s linear infinite; }
@keyframes mvg-fever {
  0%, 100% { box-shadow: inset 0 -8px 0 rgba(0,0,0,0.18), 0 6px 0 ${INK}, 0 0 0 5px #ffd23f, 0 0 26px #ffd23f; }
  33% { box-shadow: inset 0 -8px 0 rgba(0,0,0,0.18), 0 6px 0 ${INK}, 0 0 0 5px #ffd23f, 0 0 26px #ff4fa3; }
  66% { box-shadow: inset 0 -8px 0 rgba(0,0,0,0.18), 0 6px 0 ${INK}, 0 0 0 5px #ffd23f, 0 0 26px #2fb8f0; }
}
.mvg-game.frozen .fbtn { background: #cfe9ff; filter: saturate(0.4); }
.mvg-game.frozen .lane { background: linear-gradient(to top, rgba(200,235,255,0.45), rgba(200,235,255,0)); }
@media (min-width: 900px) and (min-aspect-ratio: 1/1) {
  .mvg-game.frog { --btn: clamp(84px, 11vh, 108px); --col: 150px; --gap: clamp(30px, 5vh, 52px); --lanes-h: 50vh; }
  .mvg-game.frog .lyric { font-size: clamp(22px, 3.4vh, 38px); top: 26px; max-width: 60vw; }
  .mvg-game.frog .crew i { width: 20px; height: 16px; }
  .mvg-game.frog .score b, .mvg-game.frog .combo b { font-size: 52px; }
  .mvg-game.frog .judge { font-size: clamp(40px, 7vh, 72px); }
  .mvg-game.frog .band { font-size: clamp(64px, 12vh, 140px); }
}
@media (max-height: 500px) { .mvg-game.frog { --btn: 60px; --gap: 12px; --lanes-h: 62vh; } .mvg-game.frog h1 { font-size: clamp(36px, 13vh, 72px); margin: 6px 0; } .mvg-game.frog .sub { margin-bottom: 10px; } .mvg-game.frog .keys { margin-bottom: 14px; gap: 4px; font-size: 13px; } }
@media (max-width: 560px) { .mvg-game.frog .score, .mvg-game.frog .combo { top: 72px; } .mvg-game.frog .lyric { top: 150px; } .mvg-game.frog .score b, .mvg-game.frog .combo b { font-size: 30px; } }
`;

const TITLE = {
  zh: {
    sub: "荷叶跳跳！音符落到圆按钮上时按下，青蛙就跳到那片荷叶上",
    keys: ["<kbd>←</kbd> <kbd>↑</kbd> <kbd>→</kbd> 左、中、右（空格和 <kbd>↓</kbd> 也算中间）", "紫色长条：唱 Bend 时按住中间，唱 stop 时松手", "Hooray 左右一起按；唱到 freeze 时别动！"],
    touchKeys: ["音符落到圆按钮上时点那个按钮", "紫色长条：按住中间不放，到 STOP 再松手", "Hooray 左右一起按；唱到 freeze 时别动！"],
  },
  en: {
    sub: "Lily pad hop! Press a round button as a note lands on it and the frog leaps to that pad",
    keys: ["<kbd>←</kbd> <kbd>↑</kbd> <kbd>→</kbd> left, middle, right (Space and <kbd>↓</kbd> are the middle too)", "Purple bars: hold the middle on Bend, let go on stop", "Hooray: left and right together; on freeze, don't move!"],
    touchKeys: ["Tap a round button as a note lands on it", "Purple bars: hold the middle, let go at STOP", "Hooray: left and right together; on freeze, don't move!"],
  },
};
export const titleKeys = (lang, touch) => (touch ? TITLE[lang].touchKeys : TITLE[lang].keys);

/** The HUD and overlays of a mounted Frog Hop Stop, in `lang`. */
export const frogMarkup = (lang) => {
  const c = COMMON[lang];
  const t = TITLE[lang];
  const btn = (i, icon, key) => `<div class="lane" style="--c:${LANE_COLORS[i]}"><div class="fbtn" data-lane="${i}" style="--c:${LANE_COLORS[i]}">${icon}<kbd>${key}</kbd></div></div>`;
  return `
  <div class="stage" id="stage"></div>
  <div class="hud" id="hud" hidden>
    <div class="progress" id="progress"><i></i></div>
    <div class="crew" id="crew"></div>
    <div class="score" id="score"><b>0</b><span>SCORE</span></div>
    <div class="combo" id="combo"><b>0</b><span>COMBO</span><em>×1</em></div>
    <div class="band" id="band"></div>
    <div class="lyric" id="lyric"></div>
    <div class="lanes" id="lanes">${btn(0, ICONS.left, "←")}${btn(1, ICONS.frog, "↑")}${btn(2, ICONS.right, "→")}</div>
    <div class="judge" id="judge"></div>
  </div>
  <div class="overlay" id="title">
    <div class="kicker">ANIMAL MOVES</div>
    <h1>FROG<br />HOP STOP</h1>
    <p class="sub">${t.sub}</p>
    <div class="keys"></div>
    <button id="start" disabled>${c.loading}</button>
    <a class="back" href="">${c.back}</a>
  </div>
  ${overlays(c)}
`;
};
