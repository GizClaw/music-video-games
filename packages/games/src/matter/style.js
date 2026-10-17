import { finaleStyle, resultMarkup } from "../finale.js";
import { COMMON } from "../lang.js";
import { STATES } from "./song.js";
import { ACTION_NAMES } from "./action.js";
const readingFont = new URL("./assets/Nunito-Variable.ttf", import.meta.url).href;

const svg = (paths) => `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const FORM_ICONS = [
  svg('<path d="m16 3 11 6v14l-11 6L5 23V9Z"/><path d="m5 9 11 6 11-6M16 15v14M10 6l11 6"/>'),
  svg('<path d="M16 3S6 15 6 21a10 10 0 0 0 20 0C26 15 16 3 16 3Z"/><path d="M11 20a5 5 0 0 0 5 5"/>'),
  svg('<path d="M8 23a6 6 0 1 1 1-12 8 8 0 0 1 15-1 6.5 6.5 0 1 1 1 13H8Z"/><path d="M10 27h4m4 0h4"/>'),
  svg('<path d="m18 3-9 14h7l-2 12 10-16h-8Z"/><path d="M6 7 4 5m22 20 2 2M3 20H1m30-8h-2"/>'),
];
export const soundIcon = (muted) => svg(`<path d="M5 12h5l7-6v20l-7-6H5Z"/>${muted ? '<path d="m23 12 7 8m0-8-7 8"/>' : '<path d="M22 11a8 8 0 0 1 0 10m4-14a13 13 0 0 1 0 18"/>'}`);
const PAUSE_ICON = svg('<path stroke-width="3" d="M11 7v18M21 7v18"/>');
const PLAY_ICON = svg('<path d="m12 7 14 9-14 9Z" fill="currentColor" stroke="none"/>');
const RESTART_ICON = svg('<path d="M7 12a10 10 0 1 1-1 10M7 5v7H1"/>');
const ACTION_ICONS = [
  svg('<rect x="3" y="10" width="13" height="13" rx="4"/><path d="M19 16h10m-4-4 4 4-4 4M5 6h9M2 27h8"/>'),
  svg('<path d="M4 7h24M4 23c3-8 7-11 11-6 4 5 8 5 13 3M5 27h21m-4-4 4 4-4 4"/>'),
  svg('<path d="M5 26c0-12 4-20 11-20s11 8 11 20M11 11l5-5 5 5M3 28h6m14 0h6"/>'),
  FORM_ICONS[3],
];
export const actionIcon = (phase) => ACTION_ICONS[phase];

export const TEXT = {
  zh: {
    speedTrial: "试跑中", speedBonus: "速度加成", speedUp: "加速！", speedDown: "降速，再来！",
    helpSelect: "变身", helpAct: "行动", helpTiming: "按钮亮起时按下", helpPractice: "连击提速 · 失误减速 · 太慢出局",
    act: "发动动作", space: "空格", tap: "点击", actionReady: "现在！", actionWait: "准备", actionDone: "就绪！", early: "再靠近一点", noAction: "记得按动作键", actionTip: "先选形态 · 靠近时按空格", touchTip: "左边变身 · 右边行动",
    restart: "重新开始", pauseCaption: "PAUSED / 暂停", runScore: "本次得分", runCombo: "连续通过",
    activeForm: "当前形态", nextForm: "下一拍", mute: "静音", unmute: "开启声音",
    title: "物态冲刺", tagline: "一个小水滴，四种超能力。", desc: "跟着音乐变身，穿过奇妙的粒子实验室。", start: "开始冲刺", loading: "音乐准备中…", retry: "重新载入音乐", ready: "约 2 分钟 · 节拍闯关", controls: "A S D F 或点击下方形态", tip: "先选对形态，再踩准节拍按动作。", pause: "暂停", resume: "继续冲刺", again: "再跑一次", paused: "暂停", pausedSub: "音乐等你，准备好了再出发。", score: "得分", combo: "连击", energy: "速度", next: "下个机关", practice: "连击提速 · 失误减速", perfect: "PERFECT", great: "GREAT", good: "PASS", miss: "形态错误", maxCombo: "最高连击", accuracy: "通过率", passed: "通过机关", music: "原曲 · States of Matter", audioError: "音乐暂时无法播放，请重试。", gesture: "点击继续，让音乐响起来。", sound: "声音", syncing: "正在缓冲音乐…", watch: "自动演示", keys: "先切换形态，到机关前按空格", introTip: "试试四种形态", countdown: "听好节拍，准备变身", back: "返回音乐宇宙", sync: "音画同步", tail: "跑得漂亮，享受最后一段音乐！",
  },
  en: {
    speedTrial: "TRY THIS PACE", speedBonus: "SPEED BONUS", speedUp: "SHIFT UP!", speedDown: "EASY NOW!",
    helpSelect: "change", helpAct: "act", helpTiming: "Press when the button lights up", helpPractice: "Combo ↑ · Miss ↓ · Too slow = out",
    act: "Perform action", space: "SPACE", tap: "TAP", actionReady: "NOW!", actionWait: "READY", actionDone: "SET!", early: "A little closer!", noAction: "PRESS ACTION!", actionTip: "Choose a form · Press Space at the gate", touchTip: "Change on the left · Act on the right",
    restart: "Restart run", pauseCaption: "MUSIC ON HOLD", runScore: "RUN SCORE", runCombo: "CURRENT STREAK",
    activeForm: "ACTIVE", nextForm: "UP NEXT", mute: "Mute", unmute: "Turn sound on",
    title: "MATTER RUN", tagline: "One little drop. Four superpowers.", desc: "Change your state. Find your rhythm. Run the particle lab.", start: "LET'S RUN", loading: "Loading the music…", retry: "Retry audio", ready: "2 MIN · RHYTHM ADVENTURE", controls: "A S D F or tap a form below", tip: "Choose a form first. Press Space on the beat to act.", pause: "Pause", resume: "Keep running", again: "Run again", paused: "TAKE A BEAT", pausedSub: "Your music is waiting right here.", score: "SCORE", combo: "COMBO", energy: "SPEED", next: "UP NEXT", practice: "COMBO TO SPEED UP", perfect: "PERFECT", great: "GREAT", good: "NICE PASS", miss: "CHANGE YOUR FORM!", maxCombo: "Best combo", accuracy: "Pass rate", passed: "Gates cleared", music: "SOUNDTRACK · States of Matter", audioError: "The music could not play. Please try again.", gesture: "Tap to get the music going.", sound: "Sound", syncing: "Buffering music…", watch: "AUTOPILOT", keys: "Choose a form, then press Space at the gate", introTip: "TRY A TRANSFORMATION", countdown: "Listen in. Your first gate is coming.", back: "Back to the music universe", sync: "Audio sync", tail: "Beautiful run. Enjoy the last few beats!",
  },
};

export function matterMarkup(lang) {
  const t = TEXT[lang];
  return `
    <div class="mr-stage"></div>
    <div class="mr-grain"></div>
    <div class="mr-brand"><span class="mr-brand-dot"></span> PARTICLE LAB <span> / 004</span></div>
    <div class="mr-tools"><button id="pause-toggle" aria-label="${t.pause}" title="${t.pause} (Esc)" hidden>${PAUSE_ICON}</button><button id="sound" aria-label="${t.mute}" title="${t.mute}">${soundIcon(false)}</button></div>
    <section class="overlay mr-intro" id="title">
      <div class="mr-title-heading"><div class="mr-eyebrow"><i></i> MUSIC IN MOTION</div>
      <div class="mr-wordmark" aria-hidden="true">MATTER<br><span>RUN.</span></div>
      <h1>${t.title}</h1>
      </div>
      <div class="mr-launch"><button class="mr-primary" id="start" disabled><span class="mr-launch-trim" aria-hidden="true"><i></i><i></i><i></i></span><span class="mr-button-label">${t.loading}</span><span class="mr-button-tail">${PLAY_ICON}</span></button>
      <span class="mr-caption"><span class="mr-desktop-hint">${t.actionTip}</span><span class="mr-touch-hint">${t.touchTip}</span></span>
      <p class="mr-notice" id="notice" role="status"></p>
      <a class="mr-back" id="back" hidden>${t.back}</a></div>
      <div class="mr-cover-help" id="cover-help">
        <div class="mr-help-keys"><span class="mr-desktop-hint"><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><kbd>F</kbd> ${t.helpSelect} <i>→</i> <kbd>${t.space}</kbd> ${t.helpAct}</span><span class="mr-touch-hint">${t.touchTip}</span></div>
        <div class="mr-help-states">${STATES.map((s, i) => `<span style="color:${s.ink}">${lang === "zh" ? ["冰块撞墙", "水滴滑行", "蒸汽跳跃", "电浆放电"][i] : ["Ice: smash", "Water: slide", "Vapor: jump", "Plasma: zap"][i]}</span>`).join("")}</div>
        <div class="mr-help-note"><span class="mr-help-timing">${t.helpTiming} · </span>${t.helpPractice}</div>
      </div>
    </section>
    <div class="mr-hud" id="hud" hidden>
      <div class="mr-progress"><i id="progress"></i></div>
      <div class="mr-score"><span>${t.score}</span><b id="score">00000</b><div class="hp" role="meter" aria-label="${t.energy}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100"><i id="energy"></i></div><div class="mr-speed-meter" id="speed-meter"><span id="speed-state">${t.speedBonus}</span><strong id="speed-bonus">×1.0</strong></div><span class="mr-auto" id="auto" hidden>${t.watch}</span></div>
      <div class="mr-section"><span id="section"></span><small id="practice"></small></div>
      <div class="mr-combo"><b id="combo">0</b><span>${t.combo}</span></div>
      <div class="mr-next"><small>${t.next}</small><b id="next"></b><div class="mr-next-dots" id="upcoming"></div><p class="mr-action-tip" id="action-tip"><span class="mr-desktop-hint">${t.actionTip}</span><span class="mr-touch-hint">${t.touchTip}</span></p></div>
      <div class="mr-judge" id="judge" role="status"></div>
      <div class="mr-buffer" id="buffer" hidden>${t.syncing}</div>
      <div class="mr-lyric" id="lyric" aria-label="Sing along"></div>
    </div>
    <div class="mr-controls-wrap">
      <div class="mr-instruction" id="instruction">${t.introTip}</div>
      <div class="mr-controls" role="group" aria-label="${t.controls}">
        ${STATES.map((s, i) => `<button class="mr-form" data-phase="${i}" style="--phase:${s.color};--phase-ink:${s.ink}" title="${s.action[lang]} · ${s.key}" aria-label="${s.key} · ${s[lang]} · ${s.action[lang]}" aria-pressed="${i === 1}"><span class="mr-orb"><span class="mr-icon">${FORM_ICONS[i]}</span><span class="mr-arrival" aria-hidden="true"></span></span><kbd>${s.key}</kbd><span class="mr-form-name">${s[lang]}</span><span class="mr-form-status">${i === 1 ? t.activeForm : ""}</span></button>`).join("")}
      </div>
      <div class="mr-controls-foot"><span>${t.music}</span><span id="hint">${t.tip}</span></div>
    </div>
    <div class="mr-action-pad" id="action-pad" hidden>
      <span class="mr-action-status" id="action-status">${t.actionWait}</span>
      <button class="mr-action-button" id="act" aria-label="${t.act}" disabled>
        <span class="mr-action-arrival" aria-hidden="true"></span><span class="mr-action-icon" id="action-icon" aria-hidden="true">${actionIcon(1)}</span>
        <span class="mr-action-label" id="action-label">${ACTION_NAMES[lang][1]}</span>
        <kbd class="mr-desktop-hint">${t.space}</kbd><span class="mr-touch-hint mr-tap-label">${t.tap}</span>
      </button>
    </div>
    <section class="overlay mr-modal mr-pause" id="pause" role="dialog" aria-modal="true" aria-labelledby="pause-title" hidden>
      <div class="mr-pause-center"><span class="mr-eyebrow">PAUSED</span><h2 id="pause-title">${t.paused}</h2><div class="mr-pause-status"><span id="pause-time">0:00</span><span>/</span><span id="pause-duration">2:01</span></div><div class="mr-action-row"><button class="mr-primary" id="resume"><span class="mr-button-leading">${PLAY_ICON}</span><span class="mr-button-label">${t.resume}</span><kbd>Esc</kbd></button><button class="mr-secondary" id="restart" aria-label="${t.restart}" title="${t.restart}"><span>${RESTART_ICON}</span></button></div><p id="play-error" role="status"></p></div>
    </section>
    ${resultMarkup(COMMON[lang])}`;

}

export const matterStyle = /* css */ `${finaleStyle}
@font-face { font-family:"Matter Nunito"; src:url("${readingFont}") format("truetype"); font-style:normal; font-weight:200 1000; font-display:swap; }
.uv:has(> .uv-play.open > .matter) { overflow:clip; }
.uv-play:has(> .matter)>.uv-exit { display:none; }
.mvg-game.matter { --mr-paper:#edf2ef; --mr-accent:#abd8cd; --mr-muted:#91a6af; --mr-line:#c3e0e820; position:relative; width:100%; height:100%; min-height:320px; overflow:hidden; isolation:isolate; background:#091722; color:var(--mr-paper); font-family:"Avenir Next","PingFang SC",system-ui,sans-serif; touch-action:none; user-select:none; -webkit-user-select:none; }
.mvg-game.matter * { box-sizing:border-box; }
.mvg-game.matter [hidden] { display:none !important; }
.mvg-game.matter button,.mvg-game.matter a { -webkit-tap-highlight-color:transparent; }
.mvg-game.matter button { font:inherit; cursor:pointer; color:inherit; border:0; padding:0; letter-spacing:normal; box-shadow:none; border-radius:0; background:none; }
.mvg-game.matter button:focus-visible,.mvg-game.matter a:focus-visible { outline:2px solid #d2ede5; outline-offset:5px; }
.mvg-game.matter svg { display:block; }
.mvg-game.matter .mr-stage { position:absolute; inset:0; }
.mvg-game.matter .mr-stage canvas { display:block; width:100%; height:100%; }
.mvg-game.matter .mr-grain { position:absolute; inset:0; pointer-events:none; background:linear-gradient(180deg,#06121b52,transparent 30%,transparent 60%,#06121bad); }
.mvg-game.matter .mr-brand { position:absolute; top:29px; left:76px; display:flex; align-items:center; gap:10px; color:#c7d7db; font-size:10px; font-weight:600; letter-spacing:2px; }
.mvg-game.matter .mr-brand>span:last-child { color:#607e8b; }
.mvg-game.matter .mr-brand-dot { width:5px; height:5px; border-radius:50%; background:#a7dbcc; }
.mvg-game.matter .mr-tools { position:absolute; top:72px; right:28px; display:flex; gap:8px; z-index:4; transition:opacity .25s; }
.mvg-game.matter .mr-tools button { display:grid; place-items:center; width:44px; height:44px; border:1px solid var(--mr-line); border-radius:50%; background:#0c1b26b0; backdrop-filter:blur(8px); color:#bad0d7; transition:background .15s,transform .12s; }
.mvg-game.matter .mr-tools svg { width:19px; height:19px; }
.mvg-game.matter .mr-tools button:hover { background:#203540; }
.mvg-game.matter .mr-tools button:active { transform:scale(.94); }
.mvg-game.matter .mr-tools button[aria-pressed="true"] { color:#657e89; }
.mvg-game.matter .mr-intro { position:absolute; inset:auto; left:7%; top:16%; width:43%; display:block; text-align:left; padding:0; background:none; pointer-events:none; }
.mvg-game.matter .mr-intro button,.mvg-game.matter .mr-intro a { pointer-events:auto; }
.mvg-game.matter .mr-eyebrow { display:flex; align-items:center; gap:12px; font:600 9px/1.5 "Avenir Next",sans-serif; letter-spacing:2.6px; color:#a2c9c0; }
.mvg-game.matter .mr-eyebrow i { width:22px; height:1px; background:#8db8ad; }
.mvg-game.matter .mr-wordmark { margin:22px 0; font-size:clamp(60px,8.3vw,116px); line-height:.88; font-weight:750; letter-spacing:-5px; font-style:normal; }
.mvg-game.matter .mr-wordmark span { color:#b4d8cb; }
.mvg-game.matter h1 { margin:23px 0 12px; font:600 clamp(20px,2.2vw,30px)/1.3 "Avenir Next","PingFang SC",sans-serif; letter-spacing:4px; color:inherit; background:none; filter:none; }
.mvg-game.matter .mr-tagline { margin:10px 0; font-size:16px; font-weight:500; }
.mvg-game.matter .mr-description { max-width:320px; margin:10px 0 26px; color:#94adb5; font-size:12px; line-height:1.9; }
.mvg-game.matter .mr-primary { position:relative; display:grid; place-items:center; width:104px; height:104px; min-width:0; min-height:0; padding:0; border-radius:50%; border:2px solid #a9e9e9b3; color:#d8ffff; background:radial-gradient(ellipse at 40% 26%,#30748a,#103949 52%,#09252f 70%); box-shadow:inset 0 2px 3px #e0ffff66,inset 0 -5px 9px #000b,0 0 30px #7ce8f22b,0 8px 22px #0007; transition:transform .14s,box-shadow .14s; }
.mvg-game.matter .mr-primary:before { content:""; position:absolute; inset:-9px; border:1px solid #8cf0f06b; border-right-color:transparent; border-bottom-color:#8cf0f018; border-radius:50%; transform:rotate(-25deg); }
.mvg-game.matter .mr-primary:after { content:""; position:absolute; inset:7px; border:1px solid #c1ffff23; border-radius:50%; pointer-events:none; }
.mvg-game.matter .mr-primary:hover { transform:scale(1.055); box-shadow:inset 0 2px 3px #fff9,inset 0 -5px 9px #000a,0 0 45px #77ddec50,0 8px 22px #0007; }
.mvg-game.matter .mr-primary:active { transform:translateY(3px) scale(.94); box-shadow:inset 0 5px 12px #001c2db3,0 0 18px #7ce8f23b; }
.mvg-game.matter .mr-primary:disabled { opacity:.4; cursor:wait; transform:none; }
.mvg-game.matter .mr-button-label { position:absolute; left:50%; top:calc(100% + 16px); transform:translateX(-50%); width:max-content; max-width:230px; color:#d8f4ef; font-size:13px; font-weight:700; letter-spacing:2px; text-shadow:0 2px 8px #000; }
.mvg-game.matter .mr-button-tail,.mvg-game.matter .mr-button-leading { width:44px; height:44px; margin:0; filter:drop-shadow(0 0 10px #a9fff18c); }
.mvg-game.matter .mr-primary kbd { position:absolute; bottom:-5px; right:-7px; display:grid; place-items:center; width:27px; height:27px; padding:0; border:1px solid #a2dfde66; border-radius:50%; background:#102c3c; color:#c9eeec; font:9px monospace; }
.mvg-game.matter .mr-secondary { display:grid; place-items:center; width:48px; height:48px; border:1px solid #a8d7e26b; border-radius:50%; background:radial-gradient(ellipse at 35% 25%,#284657,#0b2333); color:#bddce7; box-shadow:inset 0 1px #c9f2fa40,0 3px 12px #0005; }
.mvg-game.matter .mr-secondary>span { width:23px; }
.mvg-game.matter .mr-secondary:hover { color:#fff; box-shadow:0 0 20px #90d9ee40; }
.mvg-game.matter .mr-secondary:active { transform:scale(.92); }
.mvg-game.matter .mr-caption { display:block; margin-top:17px; font:9px monospace; letter-spacing:1px; color:#79939f; }
.mvg-game.matter .mr-notice { min-height:18px; font-size:12px; color:#dfbc94; }
.mvg-game.matter .mr-back { color:#a7c1ca; font-size:12px; }
.mvg-game.matter .mr-controls-wrap { position:absolute; bottom:max(25px,env(safe-area-inset-bottom)); left:50%; transform:translateX(-50%); width:min(530px,92%); transition:opacity .2s,transform .25s; }
.mvg-game.matter.mr-title .mr-controls-wrap { bottom:82px; }
.mvg-game.matter .mr-controls { --orb:clamp(72px,10.5vh,104px); position:relative; display:flex; align-items:start; justify-content:space-around; gap:16px; }
.mvg-game.matter .mr-form { position:relative; display:flex; flex-direction:column; align-items:center; flex:0 0 var(--orb); width:var(--orb); padding:0; min-height:0; border:0; background:none; border-radius:50%; color:#8ba6b3; }
.mvg-game.matter .mr-orb { position:relative; display:block; width:var(--orb); height:var(--orb); border-radius:50%; background:radial-gradient(ellipse at 50% 26%,#33515e80,#102431cc 64%,#07151fd9 76%); box-shadow:inset 0 1px 1px #e5f5ff37,inset 0 -2px 4px #0009,0 3px 12px #0004; border:1px solid #b7d4e229; transition:box-shadow .15s,border-color .15s,transform .12s; }
.mvg-game.matter .mr-orb:before { content:""; position:absolute; inset:5px; border:1px solid #bdd8e010; border-radius:50%; }
.mvg-game.matter .mr-orb:after { content:""; position:absolute; inset:10px; border-radius:50%; background:radial-gradient(ellipse at 50% 75%,color-mix(in srgb,var(--phase) 20%,transparent),transparent 65%); opacity:.35; transition:opacity .18s; }
.mvg-game.matter .mr-icon { position:absolute; inset:21%; display:grid; place-items:center; color:var(--phase); }
.mvg-game.matter .mr-icon svg { width:100%; height:100%; }
.mvg-game.matter .mr-model-ready .mr-icon { visibility:hidden; }
.mvg-game.matter .mr-models { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; z-index:2; }
.mvg-game.matter .mr-form kbd { position:absolute; top:calc(var(--orb) - 19px); right:1px; z-index:3; width:21px; height:21px; display:grid; place-items:center; padding:0; margin:0; border:1px solid #adc8d238; border-radius:50%; background:#122431; font:600 10px monospace; color:#b8cdd4; }
.mvg-game.matter .mr-form-name { position:relative; z-index:3; margin-top:11px; font-size:11px; letter-spacing:1px; color:#9eb2ba; }
.mvg-game.matter .mr-form-status { position:absolute; width:1px; height:1px; padding:0; overflow:hidden; clip-path:inset(50%); white-space:nowrap; }
.mvg-game.matter .mr-form[aria-pressed="true"] .mr-orb { border-color:color-mix(in srgb,var(--phase) 62%,transparent); box-shadow:inset 0 1px 1px #edffff75,inset 0 -3px 8px #0008,0 0 20px color-mix(in srgb,var(--phase) 13%,transparent); }
.mvg-game.matter .mr-form[aria-pressed="true"] .mr-orb:after { opacity:1; }
.mvg-game.matter .mr-form[aria-pressed="true"] .mr-form-name { color:var(--phase); }
.mvg-game.matter .mr-form[aria-pressed="true"] kbd { color:var(--phase); border-color:color-mix(in srgb,var(--phase) 55%,#183746); }
.mvg-game.matter .mr-arrival { position:absolute; inset:-6px; border-radius:50%; background:conic-gradient(from -90deg,var(--phase) calc(var(--arrival,0)*1turn),transparent 0); mask:radial-gradient(farthest-side,transparent calc(100% - 2px),#000 calc(100% - 1px)); opacity:0; }
.mvg-game.matter .mr-form.mr-due .mr-arrival { opacity:.95; }
.mvg-game.matter .mr-form.is-pressed .mr-orb { transform:scale(.94); box-shadow:inset 0 3px 10px #0008,0 0 15px color-mix(in srgb,var(--phase) 18%,transparent); }
.mvg-game.matter .mr-form.is-hit .mr-orb { border-color:#e5fff5; box-shadow:0 0 23px color-mix(in srgb,var(--phase) 45%,transparent),inset 0 0 15px color-mix(in srgb,var(--phase) 15%,transparent); }
.mvg-game.matter .mr-form.is-miss .mr-orb { border-color:#df8298; box-shadow:0 0 18px #dc486c35; }
.mvg-game.matter .mr-form:disabled { cursor:default; }
@media (hover:hover) { .mvg-game.matter .mr-form:not(:disabled):hover .mr-orb { border-color:var(--phase); box-shadow:inset 0 1px 1px #efffff60,0 0 18px color-mix(in srgb,var(--phase) 15%,transparent); } }
.mvg-game.matter .mr-hud { transition:opacity .25s; pointer-events:none; }
.mvg-game.matter .mr-score { position:absolute; top:85px; left:6%; display:grid; gap:6px; }
.mvg-game.matter .mr-score>span,.mvg-game.matter .mr-combo>span { color:#9fb6c1; font-size:9px; letter-spacing:2px; }
.mvg-game.matter .mr-score b { font-size:28px; font-weight:600; font-variant-numeric:tabular-nums; letter-spacing:1px; }
.mvg-game.matter .mr-progress { position:absolute; top:0; width:100%; height:2px; background:#e5f1f008; }
.mvg-game.matter .mr-progress i { display:block; width:0; height:100%; background:#a4d1c5; }
.mvg-game.matter .mr-combo { position:absolute; top:133px; right:6%; display:grid; justify-items:center; gap:5px; }
.mvg-game.matter .mr-combo b { font-size:33px; line-height:1; color:#c9e2d8; font-weight:500; font-variant-numeric:tabular-nums; }
.mvg-game.matter .mr-judge { position:absolute; left:50%; top:49%; text-align:center; transform:translateX(-50%); font-size:23px; font-weight:650; white-space:nowrap; opacity:0; text-shadow:0 2px 16px #001523; }
.mvg-game.matter .mr-judge.mr-pop { animation:mr-pop .8s both; }
@keyframes mr-pop { 0% {opacity:0;transform:translate(-50%,12px) scale(.9)} 15%,48% {opacity:1;transform:translate(-50%,0) scale(1)} 100% {opacity:0;transform:translate(-50%,-14px)} }
.mvg-game.matter .mr-auto { position:absolute; top:166px; left:6%; color:#b9a88b; font:9px monospace; letter-spacing:1px; }
.mvg-game.matter .mr-buffer { position:absolute; top:42%; left:50%; transform:translateX(-50%); padding:11px 21px; border:1px solid var(--mr-line); border-radius:12px; background:#0a1b28ed; font-size:12px; color:#c8dbe0; }
.mvg-game.matter.mr-suspended .mr-hud,.mvg-game.matter.mr-suspended .mr-controls-wrap,.mvg-game.matter.mr-suspended .mr-tools { opacity:0; pointer-events:none; }
.mvg-game.matter .mr-modal { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; padding:48px 24px; z-index:5; text-align:center; background:radial-gradient(ellipse at center,#020a1438,#030b1ab8 70%,#020914e8); animation:mr-screen-in .25s ease-out; }
@keyframes mr-screen-in { from {opacity:0} to {opacity:1} }
.mvg-game.matter .mr-pause-center { display:flex; flex-direction:column; align-items:center; }
.mvg-game.matter .mr-modal .mr-eyebrow { justify-content:center; font-size:12px; font-weight:800; letter-spacing:5px; color:#8ae9f2; text-shadow:0 0 18px #72e9ed80; }
.mvg-game.matter .mr-pause-center h2 { font:850 clamp(48px,8vh,90px)/1.2 "Avenir Next","PingFang SC",sans-serif; margin:16px 0; letter-spacing:8px; text-shadow:0 4px 0 #0b283b,0 0 35px #8bcad04d; }
.mvg-game.matter .mr-pause-status { display:flex; gap:10px; font:11px monospace; letter-spacing:2px; color:#9bbcc7; }
.mvg-game.matter .mr-action-row { display:flex; align-items:center; gap:28px; margin:42px 0 48px; }
.mvg-game.matter .mr-action-row .mr-primary { width:88px; height:88px; }
.mvg-game.matter #play-error { font-size:12px; line-height:1.6; color:#f0b6c1; max-width:330px; }
.mvg-game.matter #play-error:empty { display:none; }
@media (max-width:700px) {
 .mvg-game.matter .mr-brand { top:29px; font-size:9px; letter-spacing:1px; }
 .mvg-game.matter .mr-tools { top:78px; right:17px; }
 .mvg-game.matter .mr-intro { top:13%; width:82%; }
 .mvg-game.matter .mr-wordmark { font-size:64px; letter-spacing:-3px; margin:16px 0; }
 .mvg-game.matter h1 { font-size:20px; margin:15px 0 8px; }
 .mvg-game.matter .mr-tagline { font-size:13px; }
 .mvg-game.matter .mr-description { font-size:11px; max-width:240px; margin-bottom:20px; }
 .mvg-game.matter .mr-controls { --orb:clamp(60px,18vw,80px); gap:10px; }
 .mvg-game.matter .mr-controls-wrap { bottom:max(22px,env(safe-area-inset-bottom)); }
 .mvg-game.matter .mr-form-name { font-size:10px; margin-top:10px; }
 .mvg-game.matter .mr-score { top:85px; }
 .mvg-game.matter .mr-score b { font-size:25px; }
 .mvg-game.matter .mr-combo { top:145px; }
 .mvg-game.matter .mr-combo b { font-size:28px; }
 .mvg-game.matter .mr-auto { top:164px; }
 .mvg-game.matter .mr-judge { font-size:19px; top:48%; }
}
@media (max-aspect-ratio:3/4) {
 .mvg-game.matter .mr-intro { top:12%; width:88%; }
 .mvg-game.matter .mr-wordmark { font-size:clamp(32px,10.8vw,58px); letter-spacing:-2px; display:inline-block; margin-bottom:6px; }
 .mvg-game.matter .mr-wordmark br { display:none; }
 .mvg-game.matter .mr-wordmark span { margin-left:8px; }
 .mvg-game.matter .mr-description { max-width:100%; }
}
@media (max-height:560px) and (min-aspect-ratio:1/1) {
 .mvg-game.matter .mr-brand { top:21px; }
 .mvg-game.matter .mr-tools { top:65px; right:15px; }
 .mvg-game.matter .mr-intro { top:17%; left:7%; width:46%; }
 .mvg-game.matter .mr-wordmark { font-size:46px; letter-spacing:-2px; margin:12px 0 6px; }
 .mvg-game.matter .mr-wordmark br { display:none; }
 .mvg-game.matter h1 { font-size:17px; margin:8px 0; }
 .mvg-game.matter .mr-tagline { font-size:11px; }
 .mvg-game.matter .mr-description,.mvg-game.matter .mr-caption { display:none; }
 .mvg-game.matter .mr-controls { --orb:58px; gap:15px; }
 .mvg-game.matter .mr-controls-wrap { bottom:13px; width:340px; }
 .mvg-game.matter.mr-title .mr-controls-wrap { left:auto; right:4%; transform:none; bottom:66px; }
 .mvg-game.matter .mr-form-name { font-size:9px; margin-top:7px; }
 .mvg-game.matter .mr-form kbd { width:17px; height:17px; top:calc(var(--orb) - 14px); right:-1px; font-size:8px; }
 .mvg-game.matter .mr-score { top:65px; }
 .mvg-game.matter .mr-score b { font-size:23px; }
 .mvg-game.matter .mr-combo { top:127px; right:4%; }
 .mvg-game.matter .mr-combo b { font-size:26px; }
 .mvg-game.matter .mr-auto { top:152px; }
}
 .mvg-game.matter .mr-intro { inset:0; width:100%; text-align:center; }
.mvg-game.matter .mr-title-heading { position:absolute; top:7%; left:0; right:0; }
.mvg-game.matter .mr-title-heading .mr-eyebrow { justify-content:center; }
.mvg-game.matter .mr-wordmark { font-style:italic; font-weight:900; text-shadow:0 5px 0 #102b3b,0 0 40px #6cdbe51c; }
.mvg-game.matter .mr-wordmark span { color:#a1eae2; }
.mvg-game.matter .mr-launch { position:absolute; left:50%; top:65%; transform:translate(-50%,-50%); display:flex; flex-direction:column; align-items:center; }
.mvg-game.matter .mr-launch .mr-caption { margin-top:47px; font-size:9px; }
.mvg-game.matter .mr-launch .mr-notice { margin:10px 0; }
.mvg-game.matter .mr-judge { font-size:clamp(28px,4.5vh,52px); font-weight:900; font-style:italic; letter-spacing:1px; text-shadow:0 3px 0 #061b2e,0 0 25px currentColor; }
.mvg-game.matter .mr-score b { font-size:36px; font-weight:800; }
.mvg-game.matter .mr-combo b { font-size:44px; font-weight:850; font-style:italic; }
.uv:has(> .uv-play.open > .matter)>.uv-gate { display:none; }
@media (max-height:640px) and (min-aspect-ratio:1/1) {
 .mvg-game.matter .mr-title-heading { top:15%; left:7%; right:auto; width:43%; text-align:left; }
 .mvg-game.matter .mr-title-heading .mr-eyebrow { justify-content:flex-start; }
 .mvg-game.matter .mr-wordmark { font-size:52px; letter-spacing:-2px; margin:15px 0; }
 .mvg-game.matter .mr-wordmark br { display:block; }
 .mvg-game.matter .mr-title-heading h1 { font-size:18px; margin:12px 0; }
 .mvg-game.matter .mr-launch { top:61%; left:10%; transform:none; }
 .mvg-game.matter .mr-primary { width:76px; height:76px; }
 .mvg-game.matter .mr-primary .mr-button-tail,.mvg-game.matter .mr-primary .mr-button-leading { width:33px; height:33px; }
 .mvg-game.matter .mr-launch .mr-caption { display:none; }
 .mvg-game.matter.mr-title .mr-controls-wrap { left:auto; right:4%; transform:none; width:340px; bottom:66px; }
 .mvg-game.matter .mr-controls { --orb:58px; }
 .mvg-game.matter .mr-modal { padding:40px 24px; }
 .mvg-game.matter .mr-pause-center h2 { font-size:48px; margin:10px 0; }
 .mvg-game.matter .mr-action-row { margin:25px 0 35px; }
 .mvg-game.matter .mr-action-row .mr-primary { width:66px; height:66px; }
}
@media (max-width:560px) {
 .mvg-game.matter .mr-title-heading { top:10%; }
 .mvg-game.matter .mr-launch { top:67%; }
 .mvg-game.matter .mr-primary { width:82px; height:82px; }
}
/* Soft, toy-like launch controls; language and sound share one top-right row. */
.mvg-game.matter .mr-primary { width:120px; height:120px; color:#f5fffa; border:2px solid #bbfff0cc; background:radial-gradient(ellipse at 32% 22%,#d7fff1 0%,#8fe2ca 28%,#43b8aa 65%,#247f88 100%); box-shadow:inset 0 4px 7px #ffffff85,inset 0 -8px 13px #085b6a73,0 9px 24px #00243c80,0 0 30px #66d9dc26; }
.mvg-game.matter .mr-primary:before { inset:-7px; border:1px solid #b7fff359; transform:none; }
.mvg-game.matter .mr-primary:after { inset:auto; top:13%; left:15%; width:35%; height:11%; border:0; border-radius:50%; background:#fff8; transform:rotate(-27deg); }
.mvg-game.matter .mr-primary:hover { box-shadow:inset 0 4px 7px #ffffffa6,inset 0 -8px 13px #085b6a73,0 9px 24px #00243c80,0 0 38px #83f9dc4a; }
.mvg-game.matter .mr-button-label { font-size:20px; font-weight:800; letter-spacing:1px; color:#f0fff4; }
.mvg-game.matter .mr-button-tail,.mvg-game.matter .mr-button-leading { width:48px; height:48px; filter:drop-shadow(0 3px 1px #176d8073); }
.mvg-game.matter .mr-launch .mr-caption { margin-top:55px; font-size:12px; color:#a6c1ca; }
.mvg-game.matter .mr-form-name { font-size:15px; font-weight:650; letter-spacing:1px; }
.mvg-game.matter .mr-form kbd { width:24px; height:24px; font-size:12px; }
.mvg-game.matter .mr-tools { top:19px; right:19px; gap:10px; opacity:1; pointer-events:auto; }
.mvg-game.matter .mr-tools button { width:46px; height:46px; border-color:#adcecf59; background:radial-gradient(ellipse at 30% 20%,#35576c,#142e42 75%); box-shadow:inset 0 2px #d3f3fc25,0 3px 9px #0003; }
.mvg-game.matter .mr-tools svg { width:22px; height:22px; }
.uv-play:has(> .matter)>.uv-langplay { top:19px; right:75px; width:46px; height:46px; padding:0; border-radius:50%; border:1px solid #adcecf59; background:radial-gradient(ellipse at 30% 20%,#35576c,#142e42 75%); box-shadow:inset 0 2px #d3f3fc25,0 3px 9px #0003; font-size:15px; font-weight:750; }
.mvg-game.matter.mr-suspended .mr-tools { opacity:1; pointer-events:auto; z-index:8; }
.mvg-game.matter .mr-action-row .mr-primary { width:96px; height:96px; }
@media (max-width:560px) {
 .mvg-game.matter .mr-primary { width:92px; height:92px; }
 .mvg-game.matter .mr-button-label { font-size:18px; }
 .mvg-game.matter .mr-form-name { font-size:13px; }
 .mvg-game.matter .mr-form kbd { width:21px; height:21px; font-size:10px; }
}
@media (max-height:640px) and (min-aspect-ratio:1/1) {
 .mvg-game.matter .mr-primary { width:82px; height:82px; }
 .mvg-game.matter .mr-button-label { font-size:16px; }
 .mvg-game.matter .mr-form-name { font-size:12px; }
 .mvg-game.matter .mr-form kbd { width:19px; height:19px; font-size:10px; }
}
.mvg-game.matter .mr-score>span,.mvg-game.matter .mr-combo>span { font-size:11px; }
.mvg-game.matter .mr-pause-status { font-size:13px; }
@media (min-height:481px) and (max-height:640px) and (min-aspect-ratio:1/1) { .mvg-game.matter .mr-controls { --orb:68px; } }
/* Reading is part of the game: one generous line, a clear singing cursor,
   and state-colored teaching words, never low-opacity microtype. */
.mvg-game.matter .mr-lyric { position:absolute; bottom:174px; left:5%; width:90%; text-align:center; font-family:"Matter Nunito","Avenir Next","PingFang SC",sans-serif; font-size:clamp(30px,2.8vw,48px); font-weight:850; line-height:1.5; letter-spacing:.01em; text-shadow:0 3px 2px #03131f,0 0 12px #03131f,0 0 26px #03131f; }
.mvg-game.matter .mr-lyric:before { content:""; position:absolute; z-index:-1; inset:-25px -3% -18px; background:radial-gradient(ellipse,#041627d9,transparent 70%); pointer-events:none; }
.mvg-game.matter .mr-lyric:empty:before { display:none; }
.mvg-game.matter .mr-word { --word-color:#fff1a9; position:relative; display:inline-block; color:#d0dfe9; transition:color .12s,transform .15s; padding:0 .055em; }
.mvg-game.matter .mr-word.sung { color:#f7fcff; }
.mvg-game.matter .mr-word.is-keyword { color:var(--word-color); font-weight:950; }
.mvg-game.matter .mr-word:after { content:""; position:absolute; bottom:0; left:0; width:var(--fill,0%); height:4px; border-radius:4px; background:var(--word-color); opacity:0; }
.mvg-game.matter .mr-word.is-keyword.sung:after { opacity:.85; }
.mvg-game.matter .mr-word.singing { color:#082438; text-shadow:none; background:var(--word-color); border-radius:.23em; transform:translateY(-.07em); box-shadow:0 3px 0 #07172780,0 0 22px color-mix(in srgb,var(--word-color) 45%,transparent); }
.mvg-game.matter .mr-score>span,.mvg-game.matter .mr-combo>span { font-size:clamp(14px,1.1vw,19px); }
.mvg-game.matter .mr-form-name { font-size:clamp(16px,1.3vw,22px); font-weight:750; }
.mvg-game.matter .mr-buffer { font-size:20px; }
.mvg-game.matter .mr-auto { top:211px; font-size:12px; }
/* The launch toy changes its silhouette as well as its material. */
.mvg-game.matter { --launch-light:#d7fff1; --launch-mid:#8fe2ca; --launch-dark:#248b91; --launch-ink:#18546b; }
.mvg-game.matter[data-element="solid"] { --launch-light:#f2fbff; --launch-mid:#a7dfff; --launch-dark:#4487bb; --launch-ink:#285380; }
.mvg-game.matter[data-element="gas"] { --launch-light:#fffce6; --launch-mid:#ffe7a6; --launch-dark:#cf9b54; --launch-ink:#8d632f; }
.mvg-game.matter[data-element="plasma"] { --launch-light:#fce8ff; --launch-mid:#d5b3ff; --launch-dark:#8559c9; --launch-ink:#60358f; }
.mvg-game.matter #start { color:var(--launch-ink); background:radial-gradient(ellipse at 32% 22%,var(--launch-light),var(--launch-mid) 40%,var(--launch-dark)); border-color:var(--launch-light); box-shadow:inset 0 5px 9px #fff9,inset 0 -9px 13px #12335c40,0 9px 24px #001c3c80,0 0 38px color-mix(in srgb,var(--launch-mid) 25%,transparent); }
.mvg-game.matter #start .mr-button-tail { position:relative; z-index:1; filter:drop-shadow(0 2px 0 #ffffff60); }
.mvg-game.matter #start .mr-launch-trim { position:absolute; inset:0; border-radius:inherit; pointer-events:none; }
.mvg-game.matter[data-element="solid"] #start { border-radius:28%; transform:rotate(-7deg); }
.mvg-game.matter[data-element="solid"] #start:hover { transform:rotate(-7deg) scale(1.055); }
.mvg-game.matter[data-element="solid"] #start:active { transform:translateY(3px) rotate(-7deg) scale(.94); }
.mvg-game.matter[data-element="solid"] #start:before { border-radius:28%; }
.mvg-game.matter[data-element="solid"] #start .mr-button-tail { transform:rotate(7deg); }
.mvg-game.matter[data-element="solid"] #start .mr-button-label { transform:translateX(-50%) rotate(7deg); }
.mvg-game.matter[data-element="solid"] .mr-launch-trim { background:linear-gradient(130deg,transparent 50%,#ffffff52 51%,transparent 53%),linear-gradient(60deg,transparent 63%,#ffffff4f 64%,transparent 66%); }
.mvg-game.matter[data-element="liquid"] #start { border-radius:55% 55% 52% 52% / 65% 65% 40% 40%; }
.mvg-game.matter[data-element="liquid"] #start:before { border-radius:inherit; }
.mvg-game.matter[data-element="gas"] #start { border-radius:45%; }
.mvg-game.matter[data-element="gas"] #start:before { inset:7px -14px; background:radial-gradient(ellipse at 40% 20%,var(--launch-light),var(--launch-mid) 64%,var(--launch-dark)); border:1px solid var(--launch-light); border-radius:45%; z-index:-1; }
.mvg-game.matter[data-element="gas"] .mr-launch-trim:before,.mvg-game.matter[data-element="gas"] .mr-launch-trim:after { content:""; position:absolute; top:-9%; left:12%; width:48%; height:40%; border-radius:50%; background:linear-gradient(var(--launch-light),var(--launch-mid)); }
.mvg-game.matter[data-element="gas"] .mr-launch-trim:after { left:49%; top:-4%; width:42%; }
.mvg-game.matter[data-element="plasma"] #start:before { inset:-9px -18px; border:2px solid #edd4ffb3; border-radius:50%; transform:rotate(-28deg) scaleY(.7); }
.mvg-game.matter[data-element="plasma"] .mr-launch-trim:after { content:""; position:absolute; inset:-10px -17px; border:2px solid #ffe7ffc9; border-radius:50%; transform:rotate(46deg) scaleY(.65); }
.mvg-game.matter[data-element="plasma"] .mr-launch-trim i { position:absolute; top:2%; right:3%; width:10%; height:10%; border-radius:50%; background:#fff0ff; box-shadow:0 0 14px #e8baff; }
.mvg-game.matter.mr-title .mr-grain { background:linear-gradient(180deg,#07132638,transparent 60%,#07132670); }
.mvg-game.matter.mr-title .mr-wordmark br { display:none; }
.mvg-game.matter.mr-title .mr-wordmark { font-family:"Matter Nunito",sans-serif; font-size:clamp(52px,6.6vw,105px); font-weight:1000; letter-spacing:-.04em; margin:15px 0 6px; line-height:1.05; }
.mvg-game.matter.mr-title .mr-wordmark span { color:var(--launch-mid); margin-left:.15em; transition:color .3s; }
.mvg-game.matter.mr-title h1 { margin:8px 0; font-size:clamp(24px,2vw,32px); }
.mvg-game.matter.mr-title .mr-controls-wrap { bottom:30px; }
.mvg-game.matter .mr-launch .mr-notice:empty { display:none; }
@media (min-width:1100px) and (min-height:800px) {
 .mvg-game.matter .mr-controls-wrap { width:650px; bottom:32px; }
 .mvg-game.matter .mr-controls { --orb:120px; }
 .mvg-game.matter .mr-lyric { bottom:213px; }
 .mvg-game.matter .mr-form kbd { width:30px; height:30px; font-size:16px; }
 .mvg-game.matter .mr-score b { font-size:48px; }
 .mvg-game.matter .mr-combo b { font-size:56px; }
}
@media (max-width:700px) {
 .mvg-game.matter .mr-lyric { bottom:154px; left:4%; width:92%; font-size:clamp(23px,5.7vw,31px); line-height:1.45; }
 .mvg-game.matter .mr-auto { top:185px; font-size:10px; }
 .mvg-game.matter .mr-form-name { font-size:15px; }
 .mvg-game.matter.mr-title .mr-wordmark { font-size:clamp(42px,11vw,64px); }
}
@media (max-height:640px) and (min-aspect-ratio:1/1) {
 .mvg-game.matter .mr-lyric { bottom:120px; font-size:clamp(22px,3vw,32px); line-height:1.35; }
 .mvg-game.matter .mr-auto { top:169px; font-size:11px; }
 .mvg-game.matter .mr-form-name { font-size:14px; }
 .mvg-game.matter.mr-title .mr-wordmark { font-size:clamp(44px,6.5vw,70px); }
 .mvg-game.matter.mr-title .mr-wordmark br { display:block; }
 .mvg-game.matter.mr-title .mr-wordmark span { margin:0; }
 .mvg-game.matter.mr-title h1 { font-size:24px; }
 .mvg-game.matter.mr-title .mr-controls-wrap { bottom:28px; }
}
@media (max-height:450px) and (min-aspect-ratio:1/1) {
 .mvg-game.matter .mr-lyric { bottom:106px; font-size:22px; }
 .mvg-game.matter .mr-title-heading { top:14%; }
 .mvg-game.matter.mr-title h1 { font-size:20px; }
 .mvg-game.matter.mr-title .mr-wordmark { font-size:42px; margin:8px 0; }
 .mvg-game.matter .mr-launch { top:60%; }
}
/* Daylight palette: keep the same game controls, with ink that reads on sky. */
.mvg-game.matter { --mr-paper:#284f68; --mr-accent:#279c93; --mr-muted:#5a7f92; --mr-line:#739ab44d; background:#cde8ee; }
.mvg-game.matter .mr-grain,.mvg-game.matter.mr-title .mr-grain { background:linear-gradient(180deg,#ffffff24,transparent 40%,#acd9e526); }
.mvg-game.matter .mr-brand { color:#416d82; }
.mvg-game.matter .mr-brand>span:last-child { color:#628c9d; }
.mvg-game.matter .mr-brand-dot { background:#29a795; }
.mvg-game.matter .mr-title-heading .mr-eyebrow { color:#4d7a8d; }
.mvg-game.matter .mr-eyebrow i { background:#79a7b9; }
.mvg-game.matter .mr-wordmark { color:#2c607b; text-shadow:0 4px 0 #fff9,0 9px 16px #6696ad30; }
.mvg-game.matter.mr-title .mr-wordmark span { color:var(--launch-ink); }
.mvg-game.matter .mr-button-label { color:#2c5c72; text-shadow:0 2px 0 #ffffffa8; }
.mvg-game.matter .mr-launch .mr-caption { color:#54798c; }
.mvg-game.matter .mr-tools button,.uv-play:has(> .matter)>.uv-langplay,.uv-play:has(> .matter)>.uv-quit { color:#386880; border:1px solid #fff9; background:radial-gradient(ellipse at 30% 20%,#fff,#d5eaf3 85%); box-shadow:inset 0 2px #fff,0 3px 8px #5b8ea126; }
.mvg-game.matter .mr-tools button:hover { background:#f2fcff; }
.mvg-game.matter .mr-tools button[aria-pressed="true"] { color:#7296a7; }
.mvg-game.matter .mr-orb { border-color:#ffffffb3; background:radial-gradient(ellipse at 40% 24%,#fffaf0d9,#c8e5edc9 65%,#a4cbdaba 95%); box-shadow:inset 0 2px 2px #fff,inset 0 -3px 4px #648ba133,0 4px 12px #4f85951f; }
.mvg-game.matter .mr-orb:before { border-color:#fff7; }
.mvg-game.matter .mr-form-name { color:#517589; }
.mvg-game.matter .mr-form[aria-pressed="true"] .mr-form-name { color:var(--phase-ink); }
.mvg-game.matter .mr-form kbd,.mvg-game.matter .mr-form[aria-pressed="true"] kbd { background:#eef8fc; border-color:#a4c8d6; color:var(--phase-ink); }
.mvg-game.matter .mr-form[aria-pressed="true"] .mr-orb { border-color:var(--phase-ink); box-shadow:inset 0 2px 2px #fff,inset 0 -3px 7px #5f899b28,0 0 0 4px color-mix(in srgb,var(--phase) 30%,transparent),0 4px 12px #4f85951f; }
.mvg-game.matter .mr-score>span,.mvg-game.matter .mr-combo>span { color:#50748a; }
.mvg-game.matter .mr-combo b { color:#218e83; }
.mvg-game.matter .mr-judge { text-shadow:0 3px 0 #416680,0 0 20px #fff9; -webkit-text-stroke:.6px #41668088; }
.mvg-game.matter .mr-auto { color:#54798d; }
.mvg-game.matter .mr-lyric { text-shadow:0 2px 0 #ffffffc7,0 0 10px #fff9; }
.mvg-game.matter .mr-lyric:before { background:radial-gradient(ellipse,#f2faff4d,transparent 70%); }
.mvg-game.matter .mr-word { --word-color:#3484a7; color:#597e91; transition:transform .15s; }
.mvg-game.matter .mr-word.sung { color:#284f68; }
.mvg-game.matter .mr-word.is-keyword { color:var(--word-color); }
.mvg-game.matter .mr-word.singing { color:#fff; background:var(--word-color); text-shadow:none; box-shadow:0 3px 0 #53788a42,0 0 20px #ffffff7d; }
.mvg-game.matter .mr-buffer { color:#345c73; background:#effaffed; border-color:#fff; }
.mvg-game.matter .mr-modal { background:radial-gradient(ellipse at center,#eaf8ff99,#d7ecf2d9 75%,#cde7efed); }
.mvg-game.matter .mr-modal .mr-eyebrow { color:#328fa2; text-shadow:0 2px 0 #fffc; }
.mvg-game.matter .mr-pause-center h2 { text-shadow:0 4px 0 #ffffffb0,0 7px 20px #799fb333; }
.mvg-game.matter .mr-pause-status { color:#53798f; }
.mvg-game.matter .mr-secondary { color:#527d95; border-color:#fff; background:radial-gradient(ellipse at 35% 25%,#fff,#c2e2ed); box-shadow:inset 0 2px #fff,0 4px 12px #60899e33; }
/* Two hands: choose a form on the left, perform its action on the right. */
.mvg-game.matter .mr-touch-hint { display:none; }
.mvg-game.matter .mr-controls-wrap { transition:opacity .2s; }
.mvg-game.matter:not(.mr-title) .mr-controls-wrap { left:max(24px,5vw); right:auto; transform:none; width:clamp(320px,42vw,550px); }
.mvg-game.matter .mr-action-pad { position:absolute; right:max(30px,6vw); bottom:84px; z-index:3; display:flex; flex-direction:column; align-items:center; gap:14px; transition:opacity .2s; }
.mvg-game.matter .mr-action-status { min-height:24px; font-size:19px; font-weight:850; color:#456e87; text-shadow:0 2px #fff8; }
.mvg-game.matter .mr-action-pad.mr-action-ready .mr-action-status { color:var(--launch-ink); transform:scale(1.12); }
.mvg-game.matter .mr-action-button { position:relative; width:130px; height:130px; border-radius:50%; border:3px solid var(--launch-light); color:var(--launch-ink); background:radial-gradient(ellipse at 32% 22%,var(--launch-light),var(--launch-mid) 40%,var(--launch-dark)); box-shadow:inset 0 5px 9px #fff9,inset 0 -9px 13px #12335c40,0 7px 0 color-mix(in srgb,var(--launch-dark) 70%,#3a6d7e),0 12px 20px #648eaa40; transition:transform .1s,box-shadow .1s; }
.mvg-game.matter .mr-action-button:before { content:""; position:absolute; top:12%; left:17%; width:34%; height:11%; border-radius:50%; background:#fff8; transform:rotate(-24deg); }
.mvg-game.matter .mr-action-button:hover:not(:disabled) { filter:brightness(1.06); }
.mvg-game.matter .mr-action-button:active,.mvg-game.matter .mr-action-button.is-pressed { transform:translateY(5px) scale(.95); box-shadow:inset 0 3px 9px #24557440,0 2px 0 var(--launch-dark),0 5px 12px #648eaa40; }
.mvg-game.matter .mr-action-button:disabled { cursor:default; opacity:.6; }
.mvg-game.matter .mr-action-icon { position:absolute; inset:25%; }
.mvg-game.matter .mr-action-icon svg { width:100%; height:100%; stroke-width:2.1; filter:drop-shadow(0 2px 0 #fff7); }
.mvg-game.matter .mr-action-label { position:absolute; top:calc(100% + 13px); left:50%; transform:translateX(-50%); white-space:nowrap; font-size:22px; font-weight:850; text-shadow:0 2px #fff8; }
.mvg-game.matter .mr-action-button kbd,.mvg-game.matter .mr-tap-label { position:absolute; top:calc(100% + 45px); left:50%; transform:translateX(-50%); white-space:nowrap; font:800 13px/1.3 "Matter Nunito","PingFang SC",sans-serif; letter-spacing:1px; border:1px solid #80a7bd80; border-radius:8px; padding:3px 10px; color:#517b91; background:#f3fcffb0; }
.mvg-game.matter .mr-action-arrival { position:absolute; inset:-11px; border-radius:50%; background:conic-gradient(from -90deg,var(--arrival-color) calc(var(--arrival,0)*1turn),#97bbd03d 0); mask:radial-gradient(farthest-side,transparent calc(100% - 4px),#000 calc(100% - 3px)); }
.mvg-game.matter .mr-action-button.mr-action-ready:not(.is-pressed) { animation:mr-action-beat .34s ease-in-out infinite alternate; }
.mvg-game.matter .mr-action-button.is-hit { box-shadow:inset 0 4px 8px #fff9,0 7px 0 var(--launch-dark),0 0 0 8px #ffffff80,0 0 30px var(--launch-mid); }
@keyframes mr-action-beat { from {filter:brightness(1)} to {filter:brightness(1.18);transform:scale(1.045)} }
.mvg-game.matter.mr-suspended .mr-action-pad { opacity:0; pointer-events:none; }
@media (pointer:coarse) {
 .mvg-game.matter .mr-desktop-hint { display:none; }
 .mvg-game.matter .mr-touch-hint { display:inline; }
}
@media (max-width:700px) and (max-aspect-ratio:1/1) {
 .mvg-game.matter:not(.mr-title) .mr-controls-wrap { left:16px; width:180px; bottom:max(22px,env(safe-area-inset-bottom)); }
 .mvg-game.matter:not(.mr-title) .mr-controls { --orb:clamp(62px,18vw,78px); display:grid; grid-template-columns:repeat(2,var(--orb)); justify-content:start; gap:12px 18px; }
 .mvg-game.matter:not(.mr-title) .mr-form-name { font-size:16px; margin-top:7px; }
 .mvg-game.matter .mr-action-pad { right:27px; bottom:calc(74px + env(safe-area-inset-bottom)); gap:12px; }
 .mvg-game.matter .mr-action-button { width:102px; height:102px; }
 .mvg-game.matter .mr-action-status { font-size:16px; }
 .mvg-game.matter .mr-action-label { font-size:20px; }
 .mvg-game.matter .mr-lyric { bottom:250px; }
 .mvg-game.matter .mr-desktop-hint { display:none; }
 .mvg-game.matter .mr-touch-hint { display:inline; }
}
@media (max-width:350px) and (max-aspect-ratio:1/1) {
 .mvg-game.matter:not(.mr-title) .mr-controls-wrap { left:12px; width:150px; }
 .mvg-game.matter:not(.mr-title) .mr-controls { gap:12px; }
 .mvg-game.matter .mr-action-pad { right:20px; }
 .mvg-game.matter .mr-action-button { width:88px; height:88px; }
}
@media (max-height:640px) and (min-aspect-ratio:1/1) {
 .mvg-game.matter:not(.mr-title) .mr-controls-wrap { left:24px; bottom:18px; width:clamp(310px,42vw,440px); }
 .mvg-game.matter .mr-action-pad { right:5%; bottom:calc(46px + env(safe-area-inset-bottom)); gap:8px; }
 .mvg-game.matter .mr-action-button { width:88px; height:88px; }
 .mvg-game.matter .mr-action-status { font-size:16px; min-height:20px; }
 .mvg-game.matter .mr-action-label { font-size:17px; top:calc(100% + 11px); }
 .mvg-game.matter .mr-action-button kbd,.mvg-game.matter .mr-action-button .mr-tap-label { display:none; }
 .mvg-game.matter .mr-lyric { bottom:128px; width:75%; left:5%; }
}
@media (max-height:450px) and (min-aspect-ratio:1/1) {
 .mvg-game.matter .mr-desktop-hint { display:none; }
 .mvg-game.matter .mr-touch-hint { display:inline; }
}
/* The original in-game guidance, before the cover-teaching revision. */
.mvg-game.matter .mr-section { position:absolute; top:88px; left:50%; transform:translateX(-50%); text-align:center; }
.mvg-game.matter .mr-section>span { font-size:clamp(15px,1.2vw,20px); letter-spacing:2px; font-weight:700; white-space:nowrap; color:#3b637d; }
.mvg-game.matter .mr-section small { display:block; color:#628498; font-size:clamp(13px,1vw,17px); margin-top:8px; }
.mvg-game.matter .mr-next { position:absolute; top:17%; left:50%; transform:translateX(-50%); width:min(80%,760px); text-align:center; text-shadow:0 2px 0 #ffffffc7,0 3px 10px #fff9; }
.mvg-game.matter .mr-next>small { display:block; margin-bottom:7px; color:#50748a; font-size:clamp(15px,1.1vw,20px); font-weight:650; letter-spacing:1px; }
.mvg-game.matter .mr-next>b { font-size:clamp(25px,2.1vw,36px); font-weight:850; letter-spacing:.04em; }
.mvg-game.matter .mr-next-dots { display:flex; gap:7px; justify-content:center; margin-top:11px; }
.mvg-game.matter .mr-next-dots span { display:grid; place-items:center; width:34px; height:34px; border:1px solid color-mix(in srgb,currentColor 45%,transparent); border-radius:50%; background:#f0faffcf; font:800 17px monospace; }
.mvg-game.matter .mr-action-tip { margin:12px 0 0; color:#426c83; font-size:16px; font-weight:650; }
.mvg-game.matter .mr-instruction { margin-bottom:15px; text-align:center; color:#d0e8eb; font-size:18px; letter-spacing:1px; }
.mvg-game.matter:not(.mr-title) .mr-instruction,.mvg-game.matter.mr-title .mr-instruction,.mvg-game.matter .mr-controls-foot { display:none; }
@media (max-width:700px) {
 .mvg-game.matter .mr-section { top:184px; width:90%; }
 .mvg-game.matter .mr-section>span { font-size:15px; }
 .mvg-game.matter .mr-section small { font-size:12px; }
 .mvg-game.matter .mr-next { top:29%; width:90%; }
 .mvg-game.matter .mr-next>b { font-size:24px; }
 .mvg-game.matter .mr-next>small { font-size:14px; }
 .mvg-game.matter .mr-next-dots span { width:28px; height:28px; font-size:14px; }
}
@media (max-width:700px) and (max-aspect-ratio:1/1) {
 .mvg-game.matter .mr-action-tip { font-size:14px; margin-top:9px; }
}
@media (max-height:640px) and (min-aspect-ratio:1/1) {
 .mvg-game.matter .mr-section { top:27px; }
 .mvg-game.matter .mr-section>span { font-size:14px; }
 .mvg-game.matter .mr-next { top:18%; }
 .mvg-game.matter .mr-next>b { font-size:22px; }
 .mvg-game.matter .mr-next>small,.mvg-game.matter .mr-next-dots,.mvg-game.matter .mr-section small { display:none; }
 .mvg-game.matter .mr-action-tip { font-size:14px; margin-top:8px; }
}
@media (max-height:450px) and (min-aspect-ratio:1/1) {
 .mvg-game.matter .mr-action-tip { font-size:13px; }
}
/* Instructions occupy only the existing gap beneath launch, without changing
   the dimensions or positions of the title, launch control or form dock. */
.mvg-game.matter .mr-cover-help { position:absolute; left:50%; width:max-content; max-width:94%; display:flex; flex-direction:column; align-items:center; gap:8px; transform:translate(-50%,-50%); visibility:hidden; color:#365f75; font-size:clamp(18px,1.25vw,23px); font-weight:650; line-height:1.4; text-align:center; }
.mvg-game.matter .mr-speed-meter { display:flex; align-items:center; gap:7px; color:#26758a; font-size:clamp(12px,1vw,17px); line-height:1.3; font-weight:750; white-space:nowrap; }
.mvg-game.matter .mr-speed-meter:before { content:"»"; color:#21a78d; font-size:24px; line-height:1; transform:scaleX(calc(1 + var(--speed,0) * .3)); }
.mvg-game.matter .mr-speed-meter strong { font:900 italic clamp(19px,1.6vw,28px)/1 "Matter Nunito",sans-serif; color:#188b79; }
.mvg-game.matter .mr-speed-meter.mr-speed-low,.mvg-game.matter .mr-speed-meter.mr-speed-low strong { color:#ba4b60; }
.mvg-game.matter .mr-score>.mr-auto { position:static; font-size:11px; letter-spacing:0; }
.mvg-game.matter.mr-title.mr-help-caption .mr-caption { visibility:hidden; }
.mvg-game.matter .mr-help-keys { white-space:nowrap; }
.mvg-game.matter .mr-help-keys kbd { display:inline-block; padding:2px 6px; margin:0 2px; border:1px solid #91b6c6; border-radius:6px; background:#effaffb3; font:800 .85em/1.2 "Matter Nunito",sans-serif; }
.mvg-game.matter .mr-help-keys i { padding:0 10px; color:#7a9da9; font-style:normal; }
.mvg-game.matter .mr-help-states { display:flex; align-items:center; justify-content:center; gap:24px; font-size:.92em; white-space:nowrap; }
.mvg-game.matter .mr-help-note { font-size:.82em; color:#557c8d; white-space:nowrap; }
.mvg-game.matter .mr-cover-help[data-fit="row"] { flex-direction:row; gap:18px; font-size:clamp(14px,1.2vw,18px); }
.mvg-game.matter .mr-cover-help[data-fit="row"] .mr-help-states { gap:12px; }
.mvg-game.matter .mr-cover-help[data-fit="row"] .mr-help-timing { display:none; }
.mvg-game.matter .mr-cover-help[data-fit="compact"],.mvg-game.matter .mr-cover-help[data-fit="tight"],.mvg-game.matter .mr-cover-help[data-fit="short"] { gap:4px; font-size:14px; }
.mvg-game.matter .mr-cover-help[data-fit="compact"] .mr-help-keys,.mvg-game.matter .mr-cover-help[data-fit="tight"] .mr-help-keys { display:none; }
.mvg-game.matter .mr-cover-help[data-fit="compact"] .mr-help-states,.mvg-game.matter .mr-cover-help[data-fit="tight"] .mr-help-states { font-size:14px; gap:12px; }
.mvg-game.matter .mr-cover-help[data-fit="compact"] .mr-help-note { font-size:13px; }
.mvg-game.matter .mr-cover-help[data-fit="compact"] .mr-help-timing,.mvg-game.matter .mr-cover-help[data-fit="tight"] .mr-help-note { display:none; }
.mvg-game.matter .mr-cover-help[data-fit="short"] .mr-help-states,.mvg-game.matter .mr-cover-help[data-fit="short"] .mr-help-note { display:none; }
.mvg-game.matter .mr-section,.mvg-game.matter .mr-next { display:none; }
@media (prefers-reduced-motion:reduce) { .mvg-game.matter * { animation:none!important; transition:none!important; } }
`;
