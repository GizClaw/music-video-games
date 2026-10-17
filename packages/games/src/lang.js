import { resultMarkup } from "./finale.js";

/** The universe hub keeps the player's language here. */
const KEY = "mvg-universe-lang";

/** A game's language: `lang` when given, else the hub's saved choice, else Chinese. */
export function gameLang(lang) {
  const l = lang ?? localStorage.getItem(KEY);
  return l === "en" ? "en" : "zh";
}

/** Interface text shared by every game. */
export const COMMON = {
  zh: {
    loading: "载入中…",
    start: "开始",
    back: "← 全部游戏",
    paused: "暂停",
    resume: "按 Esc 或点击继续",
    resumeTouch: "点击继续 · 再按一次返回退出",
    again: "再来一次 (R)",
    keysPause: "<kbd>Esc</kbd> 暂停　<kbd>[</kbd><kbd>]</kbd> 调整音画同步",
    rotate: "↻ 把手机横过来玩更舒服",
    sideways: "横屏玩更舒服",
    error: (m) => `出错了：${m}`,
    points: (n) => `${n} 分`,
    round: (n) => `第 ${n} 轮`,
    rounds: "轮数",
    lastRound: "最后一轮",
    faster: "加速！",
    duration: (s) => `${Math.floor(s / 60)} 分 ${s % 60} 秒`,
    maxCombo: "最大连击",
    accuracy: "命中率",
    lasted: "坚持到",
    survived: "存活",
    cleared: "通关成功",
    failed: "生命耗尽 · 挑战失败",
    best: (n) => `最高分 ${n}`,
    newBest: "新纪录！",
  },
  en: {
    loading: "Loading…",
    start: "Start",
    back: "← All games",
    paused: "Paused",
    resume: "Press Esc or click to resume",
    resumeTouch: "Tap to resume · back again to leave",
    again: "Play again (R)",
    keysPause: "<kbd>Esc</kbd> pause　<kbd>[</kbd><kbd>]</kbd> audio sync",
    rotate: "↻ Turn your phone sideways",
    sideways: "best played sideways",
    error: (m) => `Something went wrong: ${m}`,
    points: (n) => `${n} pts`,
    round: (n) => `Round ${n}`,
    rounds: "Rounds",
    lastRound: "final round",
    faster: "Faster!",
    duration: (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`,
    maxCombo: "Max combo",
    accuracy: "Accuracy",
    lasted: "Reached",
    survived: "Survived",
    cleared: "you made it to the end",
    failed: "out of life",
    best: (n) => `Best ${n}`,
    newBest: "NEW BEST!",
  },
};

/** The pause overlay, ending banner and result overlay every game shares. */
export const overlays = (c) => `
  <div class="overlay" id="pause" hidden>
    <h2>${c.paused}</h2>
    <p class="sub">${c.resume}</p>
  </div>
  ${resultMarkup(c)}
`;
