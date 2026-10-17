import { sfx } from "./sfx.js";

/** Grade letters and their colours on every game's result screen; F is a failed run. */
export const GRADE_COLOR = { S: "#ffd23f", A: "#2fe0ff", B: "#4dff7a", C: "#ff8a1f", D: "#ff3d5a", F: "#9a8cab" };

/** The grade for a weighted accuracy (1 = every note perfect). A run that ran out of life is F whatever its accuracy. */
export const gradeOf = (ratio, cleared = true) =>
  !cleared ? "F" : ratio >= 0.95 ? "S" : ratio >= 0.85 ? "A" : ratio >= 0.7 ? "B" : ratio >= 0.5 ? "C" : "D";

/** How far each judgement moves a 100-point life gauge: misses and wrong presses drain it, hits refill it. */
export const LIFE = { miss: 8, wrong: 4, perfect: 2, great: 2, good: 1 };

/** The life gauge markup, placed under a game's score. */
export const lifeMarkup = `<div class="hp" id="hp"><i></i></div>`;

/**
 * The life gauge every game shares. `max` is a full gauge; `cells` splits it
 * into that many segments (Binary Boogie's lives). Judgements name a rule
 * (`"miss"`, `"perfect"`, …) or give an amount.
 */
export class Life {
  constructor(el, { max = 100, cells = 0, ...rules } = {}) {
    this.el = el;
    this.max = max;
    this.rules = { ...LIFE, ...rules };
    if (cells) el.style.setProperty("--cells", cells);
    el.classList.toggle("cells", !!cells);
    this.reset();
  }

  reset() {
    this.value = this.max;
    this.draw();
  }

  get empty() {
    return this.value <= 0;
  }

  amount(kind) {
    return typeof kind === "number" ? kind : this.rules[kind] ?? 0;
  }

  heal(kind) {
    if (this.empty) return;
    this.value = Math.min(this.max, this.value + this.amount(kind));
    this.draw();
  }

  /** Drains the gauge; true only for the judgement that empties it. */
  hurt(kind) {
    if (this.empty) return false;
    this.value = Math.max(0, this.value - this.amount(kind));
    this.draw(true);
    return this.empty;
  }

  draw(hurt = false) {
    const el = this.el;
    el.firstElementChild.style.width = `${(this.value / this.max) * 100}%`;
    el.classList.toggle("low", this.value <= this.max * 0.3);
    if (!hurt) return;
    el.classList.remove("hurt");
    void el.offsetWidth;
    el.classList.add("hurt");
  }
}

/** The ending banner and result overlay of a mounted game, with the shared interface text `c`. */
export const resultMarkup = (c) => `
  <div class="mvg-end" id="end" hidden><b></b><small></small></div>
  <div class="overlay mvg-result" id="result" role="dialog" aria-modal="true" aria-labelledby="verdict" hidden>
    <div class="verdict" id="verdict"><b></b><small></small></div>
    <div class="grade" id="grade"></div>
    <div class="final" id="final"></div>
    <table class="stats" id="stats"></table>
    <div class="best" id="best"></div>
    <button class="mvg-again" id="again">${c.again}</button>
  </div>
`;

const TAPE_STOP = 1.1; // seconds the song takes to wind down on a failure
const SHOW_AFTER = { cleared: 1.5, failed: 1.7 }; // seconds the banner holds before the results

/**
 * How every game ends. `end()` stamps CLEAR! or FAILED over the frozen
 * stage (a failure greys it and winds the song down like a stopped tape),
 * then shows the shared result overlay: the verdict, the grade, the score,
 * the game's stats, how far a failed run got, and the best score.
 * `reset()` puts the song and the stage back for a new run. `c` is the
 * shared interface text (`COMMON[lang]`).
 */
export function createFinale(root, { c, audio, signal }) {
  const $ = (id) => root.querySelector("#" + id);
  let timer = 0;
  let raf = 0;
  let volume = null;

  function restoreAudio() {
    cancelAnimationFrame(raf);
    if (volume !== null) audio.volume = volume;
    volume = null;
    audio.playbackRate = 1;
    audio.preservesPitch = true;
  }
  /** The song slows, drops in pitch and fades out, then stops. */
  function tapeStop() {
    if (audio.paused) return;
    volume = audio.volume;
    audio.preservesPitch = false;
    const t0 = performance.now();
    const step = () => {
      const u = Math.min(1, (performance.now() - t0) / 1000 / TAPE_STOP);
      audio.playbackRate = 1 - 0.75 * u * u;
      audio.volume = volume * (1 - u);
      if (u < 1) raf = requestAnimationFrame(step);
      else audio.pause();
    };
    step();
  }

  function reset() {
    clearTimeout(timer);
    restoreAudio();
    root.classList.remove("mvg-cleared", "mvg-failed");
    $("end").hidden = true;
    $("result").hidden = true;
  }

  /**
   * End the run. `ratio` is the weighted accuracy the grade comes from,
   * `stats` the game's `[label, value]` rows, `reached` how far a failed
   * run got (a 0–1 fraction or a label), and `best` the local storage key
   * of the best score, with `record` false for demos and mid-song starts.
   * `onShow` runs as the result overlay appears. Returns the grade.
   */
  function end({ cleared, score, ratio, stats = [], reached = null, best = null, record = true, onShow }) {
    clearTimeout(timer);
    const grade = gradeOf(ratio, cleared);
    const color = GRADE_COLOR[grade];
    root.classList.add(cleared ? "mvg-cleared" : "mvg-failed");
    const banner = $("end");
    banner.querySelector("b").textContent = cleared ? "CLEAR!" : "FAILED";
    banner.querySelector("small").textContent = cleared ? c.cleared : c.failed;
    banner.hidden = false;
    if (cleared) sfx.clear();
    else {
      sfx.fail();
      tapeStop();
    }

    const result = $("result");
    result.classList.toggle("failed", !cleared);
    const verdict = $("verdict");
    verdict.querySelector("b").textContent = cleared ? "STAGE CLEAR" : "FAILED";
    verdict.querySelector("small").textContent = cleared ? c.cleared : c.failed;
    $("grade").textContent = grade;
    $("grade").style.color = color;
    $("grade").style.textShadow = `0 0 40px ${color}`;
    const points = score.toLocaleString("en-US");
    $("final").textContent = c.points(points);
    const rows = cleared || reached == null ? stats : [[c.lasted, typeof reached === "number" ? `${Math.round(reached * 100)}%` : reached], ...stats];
    $("stats").innerHTML = rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join("");
    const el = $("best");
    el.classList.remove("new");
    el.textContent = "";
    if (best) {
      const before = Number(localStorage.getItem(best)) || 0;
      if (record && score > before) {
        localStorage.setItem(best, String(score));
        if (before) el.classList.add("new");
        el.textContent = before ? c.newBest : c.best(points);
      } else if (before) el.textContent = c.best(before.toLocaleString("en-US"));
    }

    timer = setTimeout(() => {
      banner.hidden = true;
      result.hidden = false;
      sfx.result(cleared && grade <= "B");
      $("again").focus({ preventScroll: true });
      onShow?.();
    }, SHOW_AFTER[cleared ? "cleared" : "failed"] * 1000);
    return grade;
  }

  signal.addEventListener("abort", () => {
    clearTimeout(timer);
    cancelAnimationFrame(raf);
  });
  return { end, reset };
}

/** The life gauge, the ending banner and the result overlay. Scoped to `.mvg-game`, so games with their own look share it. */
export const finaleStyle = `
.mvg-game .hp { position: relative; width: clamp(110px, 14vw, 170px); height: 10px; margin-top: 8px; border-radius: 5px; background: rgba(40,30,70,0.85); border: 1px solid rgba(255,255,255,0.35); overflow: hidden; box-sizing: border-box; }
.mvg-game .hp i { display: block; height: 100%; width: 100%; background: linear-gradient(90deg, #4dff7a, #2fe0ff); box-shadow: 0 0 10px #2fe0ff; transition: width 0.15s; }
.mvg-game .hp.cells { height: 12px; }
.mvg-game .hp.cells::after { content: ""; position: absolute; inset: 0; background: repeating-linear-gradient(90deg, transparent 0 calc(100% / var(--cells) - 2px), rgba(10,6,24,0.9) calc(100% / var(--cells) - 2px) calc(100% / var(--cells))); }
.mvg-game .hp.low i { background: #ff3d5a; box-shadow: 0 0 12px #ff3d5a; animation: mvg-low 0.5s ease-in-out infinite alternate; }
@keyframes mvg-low { from { opacity: 1; } to { opacity: 0.45; } }
.mvg-game .hp.hurt { animation: mvg-shake 0.3s; }
@keyframes mvg-shake { 25% { transform: translateX(-4px); } 75% { transform: translateX(4px); } }

.mvg-game.mvg-failed :is(.stage, .mr-stage) { filter: grayscale(1) brightness(0.55) contrast(1.1); transition: filter 1.2s ease-out; }
.mvg-game .mvg-end { position: absolute; inset: 0; z-index: 9; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; pointer-events: none; text-align: center; }
.mvg-game .mvg-end[hidden] { display: none; }
.mvg-game .mvg-end b { font: 800 clamp(64px, 15vh, 160px) / 1 "Avenir Next Condensed", "Avenir Next", sans-serif; letter-spacing: 6px; transform: rotate(-4deg); animation: mvg-end-in 0.55s cubic-bezier(0.2, 1.5, 0.4, 1) both; }
.mvg-game .mvg-end small { font: 700 clamp(14px, 2.2vh, 20px) Menlo, "PingFang SC", monospace; letter-spacing: 4px; color: #fff; text-shadow: 0 2px 8px #000; animation: mvg-end-sub 0.5s 0.2s ease-out both; }
.mvg-game.mvg-cleared .mvg-end { background: radial-gradient(ellipse at center, rgba(255,210,63,0.12), rgba(255,170,30,0.32)); }
.mvg-game.mvg-cleared .mvg-end b { color: #ffd23f; text-shadow: 0 5px 0 #4a2a00, 0 0 36px #ffb000; }
.mvg-game.mvg-failed .mvg-end { background: radial-gradient(ellipse at center, rgba(40,0,10,0.2), rgba(255,0,50,0.38)); }
.mvg-game.mvg-failed .mvg-end b { color: #ff3d5a; text-shadow: 0 5px 0 #2a0010, 0 0 36px #ff003c; animation: mvg-end-in 0.55s cubic-bezier(0.2, 1.5, 0.4, 1) both, mvg-end-shake 0.4s 0.5s; }
@keyframes mvg-end-in { from { opacity: 0; transform: rotate(-4deg) scale(2.4); } to { opacity: 1; transform: rotate(-4deg) scale(1); } }
@keyframes mvg-end-sub { from { opacity: 0; transform: translateY(10px); } to { opacity: 0.9; transform: none; } }
@keyframes mvg-end-shake { 20% { transform: rotate(-4deg) translateX(-10px); } 40% { transform: rotate(-4deg) translateX(9px); } 60% { transform: rotate(-4deg) translateX(-6px); } 80% { transform: rotate(-4deg) translateX(4px); } }

.mvg-game .mvg-result { position: absolute; inset: 0; z-index: 8; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 24px; box-sizing: border-box; color: #fff; font-family: "Avenir Next", "PingFang SC", sans-serif; background: radial-gradient(ellipse at center, rgba(2,2,12,0.55), rgba(2,2,12,0.88)); animation: mvg-result-in 0.3s ease-out; }
.mvg-game .overlay.mvg-result.failed { background: radial-gradient(ellipse at center, rgba(30,2,12,0.6), rgba(14,0,6,0.92)); }
.mvg-game .mvg-result[hidden] { display: none; }
@keyframes mvg-result-in { from { opacity: 0; } to { opacity: 1; } }
.mvg-game .mvg-result .verdict { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 6px 24px 8px; border: 3px solid currentColor; border-radius: 12px; color: #ffd23f; transform: rotate(-3deg); text-shadow: 0 0 16px currentColor; box-shadow: 0 0 22px rgba(255,210,63,0.35), inset 0 0 14px rgba(255,210,63,0.2); animation: mvg-stamp 0.5s cubic-bezier(0.2, 1.6, 0.4, 1) both; }
.mvg-game .mvg-result.failed .verdict { color: #ff3d5a; box-shadow: 0 0 22px rgba(255,61,90,0.35), inset 0 0 14px rgba(255,61,90,0.2); }
.mvg-game .mvg-result .verdict b { font: 800 clamp(26px, 5vh, 46px) / 1 "Avenir Next Condensed", "Avenir Next", sans-serif; letter-spacing: 5px; }
.mvg-game .mvg-result .verdict small { font: 700 12px Menlo, "PingFang SC", monospace; letter-spacing: 4px; color: #fff; text-shadow: none; opacity: 0.85; }
@keyframes mvg-stamp { from { opacity: 0; transform: rotate(-3deg) scale(1.8); } to { opacity: 1; transform: rotate(-3deg) scale(1); } }
.mvg-game .mvg-result .grade { font: 800 clamp(96px, 20vh, 200px) / 1 "Avenir Next Condensed", "Avenir Next", sans-serif; margin: 10px 0 0; animation: mvg-grade-in 0.6s 0.15s cubic-bezier(0.16, 1.3, 0.3, 1) both; }
@keyframes mvg-grade-in { from { opacity: 0; transform: scale(1.6); } to { opacity: 1; transform: none; } }
.mvg-game .mvg-result .final { font: 800 40px "Avenir Next Condensed", "Avenir Next", "PingFang SC", sans-serif; margin-bottom: 14px; font-variant-numeric: tabular-nums; }
.mvg-game .mvg-result .stats { font: 600 16px Menlo, "PingFang SC", monospace; margin-bottom: 12px; border-spacing: 22px 6px; }
.mvg-game .mvg-result .stats td:first-child { text-align: left; opacity: 0.7; }
.mvg-game .mvg-result .stats td:last-child { text-align: right; }
.mvg-game .mvg-result.failed .stats tr:first-child td { color: #ff8a9c; opacity: 1; }
.mvg-game .mvg-result .best { min-height: 1.2em; margin-bottom: 18px; font: 700 13px Menlo, "PingFang SC", monospace; letter-spacing: 2px; opacity: 0.7; }
.mvg-game .mvg-result .best.new { color: #ffd23f; opacity: 1; text-shadow: 0 0 12px #ffb000; animation: mvg-low 0.5s ease-in-out infinite alternate; }
.mvg-game .mvg-result .mvg-again { font: 800 22px "Avenir Next", "PingFang SC", sans-serif; letter-spacing: 2px; color: #020208; background: #fff; border: 0; border-radius: 999px; padding: 14px 44px; cursor: pointer; box-shadow: 0 0 28px rgba(160,200,255,0.65); }
@media (max-height: 500px) {
  .mvg-game .mvg-result { justify-content: flex-start; padding-top: 12px; }
  .mvg-game .mvg-result .verdict { padding: 3px 16px 4px; }
  .mvg-game .mvg-result .verdict b { font-size: 22px; }
  .mvg-game .mvg-result .grade { font-size: 64px; margin-top: 4px; }
  .mvg-game .mvg-result .final { font-size: 24px; margin-bottom: 4px; }
  .mvg-game .mvg-result .stats { font-size: 12px; border-spacing: 16px 1px; margin-bottom: 4px; }
  .mvg-game .mvg-result .best { margin-bottom: 8px; font-size: 11px; }
  .mvg-game .mvg-result .mvg-again { padding: 10px 32px; font-size: 18px; }
}
`;
