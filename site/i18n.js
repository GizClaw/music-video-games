const KEY = "mvg-universe-lang";

/** Interface strings; catalog fields may also be `{ zh, en }` objects. */
export const STRINGS = {
  zh: {
    switch: "EN",
    switchTitle: "Switch to English",
    press: "或点击 haivivi 标志进入",
    soon: "即将上线",
    failed: "载入失败",
    tip: "悬停查看星球 · 点击或按 <kbd>←</kbd> <kbd>→</kbd> 选择 · 选中发光的星球后再点一次或按 <kbd>Enter</kbd> 进入游戏",
    back: "← 返回星系",
    quit: "退出游戏",
    up: "跳出星系 (Esc)",
    mute: "声音 (M)",
    fullscreen: "全屏 (F)",
    prev: "上一颗 (←)",
    next: "下一颗 (→)",
    go: "进入 (Enter)",
    doc: "音乐宇宙 · Music Video Games — haivivi",
  },
  en: {
    switch: "中",
    switchTitle: "切换到中文",
    press: "or click the haivivi mark",
    soon: "COMING SOON",
    failed: "Failed to load",
    tip: "Hover to look · click or <kbd>←</kbd> <kbd>→</kbd> to pick · click a picked glowing planet again or press <kbd>Enter</kbd> to play",
    back: "← Back to galaxy",
    quit: "Quit game",
    up: "Leave galaxy (Esc)",
    mute: "Sound (M)",
    fullscreen: "Fullscreen (F)",
    prev: "Previous (←)",
    next: "Next (→)",
    go: "Play (Enter)",
    doc: "Music Universe · Music Video Games — haivivi",
  },
};

/** The player's last choice, else Chinese (the site's language). */
export function savedLang() {
  const saved = localStorage.getItem(KEY);
  return saved in STRINGS ? saved : "zh";
}

export function saveLang(lang) {
  localStorage.setItem(KEY, lang);
}

/** A catalog value in `lang`: plain strings pass through, `{ zh, en }` objects are looked up. */
export const local = (v, lang) => (v && typeof v === "object" ? (v[lang] ?? v.zh ?? v.en) : v);
