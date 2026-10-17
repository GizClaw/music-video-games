import { Timing, clamp } from "@gizclaw/mvg-core/timing.js";
import { AudioClock, songAudioUrl } from "./kit.js";
import { COMMON, gameLang } from "./lang.js";
import { createFinale } from "./finale.js";
import { backGuard, buzz, lockGestures, wakeLock } from "./mobile.js";
import { sfx } from "./sfx.js";
import analysis from "./matter/analysis.json";
import { MatterScene } from "./matter/scene.js";
import { FormControls3D } from "./matter/controls.js";
import { portalSound, actionSound } from "./matter/sound.js";
import { ACTION_NAMES } from "./matter/action.js";
import { AdaptivePace } from "./matter/pace.js";
import { SingAlong } from "./matter/lyrics.js";
import { ACTION_WINDOW, buildChart, gateResult, recordAction, SECTIONS, STATES, WORK } from "./matter/song.js";
import { actionIcon, matterMarkup, matterStyle, soundIcon, TEXT } from "./matter/style.js";

/** Mount a complete, finite-song 3D rhythm runner. Audio stays in the AIGC
 * catalog; the package owns its beat chart, scene, inputs and lifecycle.
 * @param {Element|string} target
 * @param {{audio?:string,start?:number|string,play?:boolean,auto?:boolean,lang?:"zh"|"en",search?:string,backHref?:string}} options
 */
export async function mountStatesOfMatter(target, options = {}) {
  const root = typeof target === "string" ? document.querySelector(target) : target;
  if (!root) throw new Error("mountStatesOfMatter: target not found");
  if (!document.querySelector('style[data-mvg="states-of-matter"]')) {
    const style = document.createElement("style");
    style.dataset.mvg = "states-of-matter";
    style.textContent = matterStyle;
    document.head.appendChild(style);
  }
  const lang = gameLang(options.lang);
  const ui = TEXT[lang];
  const params = new URLSearchParams(options.search ?? location.search);
  const autoplay = options.play ?? params.has("play");
  const auto = options.auto ?? params.has("auto");
  const inputStart = Number(options.start ?? params.get("start") ?? 0);
  const from = Number.isFinite(inputStart) ? clamp(inputStart, 0, analysis.duration - 5) : 0;
  const tabindex = root.getAttribute("tabindex");
  root.classList.add("mvg-game", "matter", "mr-title");
  root.tabIndex = 0;
  root.innerHTML = matterMarkup(lang);
  const $ = (id) => root.querySelector(`#${id}`);
  const lyrics = new SingAlong($("lyric"), analysis.cues);
  root.dataset.element = "liquid";
  if (options.backHref) { $("back").href = options.backHref; $("back").hidden = false; }
  const abort = new AbortController();
  const { signal } = abort;
  lockGestures(root, signal);
  const awake = wakeLock();
  const audio = new Audio();
  audio.crossOrigin = "anonymous";
  audio.preload = "auto";
  audio.volume = 0.8;
  audio.defaultPlaybackRate = audio.playbackRate = 1;
  audio.muted = sfx.muted;
  audio.src = options.audio ?? params.get("audio") ?? songAudioUrl(WORK);
  const clock = new AudioClock(audio);
  const finale = createFinale(root, { c: COMMON[lang], audio, signal });
  const pace = new AdaptivePace();
  const timing = new Timing(analysis);
  const chart = buildChart(analysis);
  const buttons = [...root.querySelectorAll("[data-phase]")];
  let scene;
  let controlScene;
  let alive = true;
  let raf = 0;
  let helpRaf = 0;
  let helpObserver;
  let ready = false;
  let loadFailed = false;
  let buffering = false;
  let mode = "title";
  let phase = 1;
  let actionEvent = null;
  let actionSequence = 0;
  let actionPressedAt = -Infinity;
  let lastActionPhase = -1;
  let actionNotice = "";
  let actionNoticeUntil = 0;
  let notes = [];
  let cursor = 0;
  let autoCursor = 0;
  let score = 0;
  let combo = 0;
  let maxCombo = 0;
  let energy = Math.round(pace.at(0).intensity * 100);
  let tally = { perfect: 0, great: 0, good: 0, miss: 0 };
  let lastT = from;
  let lastFrame = performance.now();
  let event = null;
  let lastNext = -2;
  let lastSection = -1;
  let endingAt = 0;
  let autoplayAttempted = false;
  let lastMuted = null;
  let speedShift = 0;
  let speedShiftAt = -Infinity;
  const pressTimes = Array(4).fill(-Infinity);
  const feedback = Array.from({ length: 4 }, () => ({ at: -Infinity, result: "" }));
  let offset = Number(localStorage.getItem("matter-game-offset") ?? 0);
  if (!Number.isFinite(offset)) offset = 0;
  offset = clamp(offset, -0.3, 0.3);
  const guard = backGuard({ signal, playing: () => mode === "play", onBack: () => pause() });

  const songTime = () => clamp(clock.now() + offset, 0, analysis.duration);
  const nextNote = () => notes[cursor];
  const timeLabel = (t) => `${Math.floor(Math.max(0, t) / 60)}:${String(Math.floor(Math.max(0, t) % 60)).padStart(2, "0")}`;
  const setStartLabel = (label) => { $("start").querySelector(".mr-button-label").textContent = label; };
  $("pause-duration").textContent = timeLabel(analysis.duration);
  function updatePauseDetails() {
    $("pause-time").textContent = timeLabel(lastT);
  }

  function placeCoverHelp() {
    if (!alive || mode !== "title") return;
    const help = $("cover-help");
    const bounds = root.getBoundingClientRect();
    const launch = root.querySelector(".mr-launch").getBoundingClientRect();
    const label = $("start").querySelector(".mr-button-label").getBoundingClientRect();
    const dock = root.querySelector(".mr-controls-wrap").getBoundingClientRect();
    root.classList.remove("mr-help-caption");
    let top = Math.max(launch.bottom, label.bottom) - bounds.top + 5;
    let bottom = dock.top - bounds.top - 5;
    let x = bounds.width / 2;
    let width = Math.min(1100, bounds.width * .94);
    let fit = bounds.width < 700 ? (bottom - top >= 44 ? "compact" : "tight") : bottom - top >= 106 ? "full" : "row";
    // Short landscape already has separate left and right controls. Its small
    // free space is immediately below launch, left of the character dock.
    if (bottom <= top && bounds.width > bounds.height && bounds.height <= 640) {
      fit = "short";
      width = Math.max(180, dock.left - bounds.left - 32);
      x = 16 + width / 2;
      bottom = bounds.height - 8;
    }
    help.dataset.fit = fit;
    help.style.maxWidth = `${width}px`;
    help.style.left = `${x}px`;
    const height = help.getBoundingClientRect().height;
    if (height > bottom - top + 1 && fit !== "short") {
      // On tight screens the expanded line replaces the small existing
      // caption visually, while its original layout space stays untouched.
      top = label.bottom - bounds.top + 1;
      bottom = dock.top - bounds.top - 1;
      root.classList.add("mr-help-caption");
    }
    help.style.top = `${top + (bottom - top) / 2}px`;
    help.style.visibility = height <= bottom - top + 1 && help.scrollWidth <= width + 1 ? "visible" : "hidden";
  }

  function scheduleCoverHelp() {
    cancelAnimationFrame(helpRaf);
    helpRaf = requestAnimationFrame(placeCoverHelp);
  }

  function updateScore() {
    $("score").textContent = String(score).padStart(5, "0");
    $("combo").textContent = combo;
    $("energy").style.width = `${energy}%`;
    $("energy").parentElement.classList.toggle("low", energy <= 30);
    $("energy").parentElement.setAttribute("aria-valuenow", String(energy));
  }

  function choose(index) {
    if (!Number.isInteger(index) || index < 0 || index > 3 || !["play", "title"].includes(mode)) return;
    phase = index;
    root.dataset.element = STATES[phase].id;
    pressTimes[index] = performance.now();
    buttons.forEach((b, i) => b.setAttribute("aria-pressed", String(i === phase)));
    if (!auto) sfx.select(index);
  }

  function settleGates(t) {
    while (mode === "play" && cursor < notes.length) {
      const result = gateResult(notes[cursor], t);
      if (result === null) break;
      resolveGate(notes[cursor++], result);
    }
  }

  function performAction(at = songTime()) {
    if (mode !== "play" || buffering || (actionEvent && at - actionEvent.at < .1)) return;
    settleGates(at);
    if (mode !== "play") return;
    const note = nextNote();
    const status = recordAction(note, phase, at);
    if (status === "used") return;
    if (status === "accepted") note.activation.bonus = pace.at(at).bonus;
    actionEvent = { id: ++actionSequence, phase, at, gate: status === "accepted" ? note.id : null, accepted: status === "accepted" };
    actionPressedAt = performance.now();
    actionSound(phase);
    buzz(6);
    actionNotice = status === "wrong" ? ui.miss : status === "early" ? ui.early : "";
    actionNoticeUntil = actionNotice ? performance.now() + 600 : 0;
    settleGates(at);
  }

  function announce(message, color = "#d4fa75") {
    const judge = $("judge");
    judge.textContent = message;
    judge.style.color = color;
    judge.classList.remove("mr-pop");
    void judge.offsetWidth;
    judge.classList.add("mr-pop");
  }

  function resolveGate(n, result) {
    n.result = result;
    feedback[phase] = { at: performance.now(), result };
    tally[result]++;
    if (result === "miss") {
      combo = 0;
      portalSound(n.phase, "miss");
      buzz(24);
      const gauge = $("energy").parentElement;
      gauge.classList.remove("hurt");
      void gauge.offsetWidth;
      gauge.classList.add("hurt");
    } else {
      combo++;
      maxCombo = Math.max(maxCombo, combo);
      const multiplier = Math.min(4, 1 + Math.floor(combo / 8));
      n.points = Math.round({ perfect: 300, great: 200, good: 100 }[result] * multiplier * (n.activation?.bonus ?? pace.at(n.t).bonus));
      score += n.points;
      portalSound(n.phase, result);
      buzz(8);
      if (combo % 12 === 0) sfx.combo();
    }
    const at = songTime();
    const shift = pace.resolve(result, at);
    energy = Math.round(pace.reserve * 100);
    if (shift) {
      speedShift = shift;
      speedShiftAt = at;
    }
    event = { id: n.id, phase: n.phase, result, at, beat: n.t, points: n.points ?? 0, bonus: n.activation?.bonus ?? 0, speedShift: shift };
    const message = result === "miss" ? (shift < 0 ? ui.speedDown : n.attempt ? ui.miss : ui.noAction) : shift > 0 && combo % 3 === 0 ? ui.speedUp : combo % 12 === 0 ? `${combo} COMBO!` : `${ui[result]} +${n.points}`;
    announce(message, result === "miss" ? "#ff698b" : STATES[n.phase].color);
    updateScore();
    if (pace.failed) finish(false);
  }

  function reset() {
    finale.reset();
    notes = chart.filter((n) => n.t >= from + 0.65).map((n) => ({ ...n }));
    cursor = autoCursor = 0;
    tally = { perfect: 0, great: 0, good: 0, miss: 0 };
    score = combo = maxCombo = 0;
    pace.reset(from);
    energy = Math.round(pace.at(from).intensity * 100);
    audio.playbackRate = 1;
    clock.reanchor();
    speedShift = 0;
    speedShiftAt = -Infinity;
    event = null;
    // Starting or replaying keeps the form the child has chosen.
    actionEvent = null;
    actionPressedAt = -Infinity;
    actionNoticeUntil = 0;
    pressTimes.fill(-Infinity);
    feedback.forEach((f) => { f.at = -Infinity; });
    buttons.forEach((b, i) => b.setAttribute("aria-pressed", String(i === phase)));
    lastT = from;
    lastNext = -2;
    lastSection = -1;
    $("judge").classList.remove("mr-pop");
    lyrics.reset();
    $("play-error").textContent = "";
    updateScore();
  }

  async function playAudio() {
    mode = "starting";
    audio.playbackRate = 1;
    try {
      await audio.play();
      if (!alive) { audio.pause(); return; }
      mode = "play";
      root.classList.remove("mr-title", "mr-suspended");
      buffering = audio.readyState < 3;
      clock.reanchor();
      guard.arm();
      awake.hold();
      root.focus({ preventScroll: true });
      $("title").hidden = $("pause").hidden = $("result").hidden = true;
      $("hud").hidden = false;
      $("pause-toggle").hidden = false;
      $("auto").hidden = !auto;
      $("instruction").textContent = ui.keys;
      $("play-error").textContent = "";
      $("resume").disabled = false;
    } catch (err) {
      if (!alive) return;
      mode = "pause";
      awake.release();
      $("title").hidden = $("result").hidden = true;
      $("pause").hidden = false;
      updatePauseDetails();
      $("resume").disabled = false;
      $("play-error").textContent = err.name === "NotAllowedError" ? ui.gesture : ui.audioError;
    }
  }

  async function start() {
    if (!alive || mode === "starting" || mode === "play") return;
    sfx.unlock();
    if (loadFailed) {
      loadFailed = false;
      $("start").disabled = true;
      setStartLabel(ui.loading);
      $("notice").textContent = "";
      audio.load();
      return;
    }
    if (!ready) return;
    reset();
    sfx.start();
    audio.currentTime = from;
    await playAudio();
  }

  function pause() {
    if (mode !== "play") return;
    lastT = songTime();
    mode = "pause";
    audio.pause();
    awake.release();
    $("pause").hidden = false;
    $("pause-toggle").hidden = true;
    $("buffer").hidden = true;
    $("play-error").textContent = "";
    updatePauseDetails();
    $("resume").focus({ preventScroll: true });
  }

  async function resume() {
    if (mode !== "pause") return;
    sfx.unlock();
    $("resume").disabled = true;
    if (loadFailed) {
      loadFailed = false;
      const resumeAt = Math.max(0, lastT - offset);
      audio.addEventListener("loadedmetadata", () => { audio.currentTime = resumeAt; }, { once: true, signal });
      audio.load();
    }
    await playAudio();
  }

  /** The song played out (`complete`) or the runner fell to the speed floor. The scene plays on under the ending banner. */
  function finish(complete) {
    if (mode !== "play") return;
    lastT = songTime();
    mode = "ending";
    endingAt = performance.now();
    awake.release();
    $("pause-toggle").hidden = true;
    $("buffer").hidden = true;
    const passed = tally.perfect + tally.great + tally.good;
    const judged = passed + tally.miss;
    const accuracy = judged ? Math.round(passed / judged * 100) : 0;
    const quality = judged ? (tally.perfect + tally.great * 0.75 + tally.good * 0.4) / judged : 0;
    finale.end({
      cleared: complete,
      score,
      ratio: quality,
      reached: clamp(lastT / analysis.duration, 0, 1),
      // Practice, seeked runs and autoplay never overwrite a full manual run.
      best: "matter-game-best",
      record: !auto && from === 0,
      stats: [
        [ui.perfect, tally.perfect],
        [ui.great, tally.great],
        [ui.good, tally.good],
        ["MISS", tally.miss],
        [ui.passed, `${passed} / ${notes.length}`],
        [ui.accuracy, `${accuracy}%`],
        [ui.maxCombo, maxCombo],
      ],
      onShow: () => { mode = "result"; },
    });
  }

  function updateHud(t) {
    $("progress").style.width = `${Math.min(100, t / analysis.duration * 100)}%`;
    const speed = pace.at(t);
    $("speed-bonus").textContent = `×${speed.bonus.toFixed(1)}`;
    $("speed-meter").style.setProperty("--speed", speed.intensity);
    $("speed-meter").classList.toggle("mr-speed-low", energy < 25);
    const shiftVisible = t - speedShiftAt < 1.6;
    $("speed-state").textContent = shiftVisible ? (speedShift < 0 ? ui.speedDown : ui.speedUp) : ui.speedBonus;
    const section = SECTIONS.findLastIndex((s) => t >= s.t);
    if (section !== lastSection) {
      $("section").textContent = SECTIONS[section]?.[lang] ?? "";
      $("practice").textContent = t < 31.95 ? ui.practice : "";
      lastSection = section;
    }
    const next = nextNote();
    if ((next?.id ?? -1) !== lastNext) {
      lastNext = next?.id ?? -1;
      $("next").textContent = next ? `${STATES[next.phase].symbol} ${STATES[next.phase].action[lang]}` : ui.tail;
      $("next").style.color = next ? STATES[next.phase].ink : "#13866e";
      $("upcoming").replaceChildren();
      notes.slice(cursor, cursor + 4).forEach((n) => {
        const el = document.createElement("span");
        el.textContent = STATES[n.phase].key;
        el.style.color = STATES[n.phase].ink;
        $("upcoming").appendChild(el);
      });
    }
    lyrics.update(t);
    $("action-tip").hidden = t >= 31.95;
    $("buffer").hidden = !buffering || mode !== "play";
  }

  function updateControls(t, now) {
    const next = mode === "play" ? nextNote() : null;
    buttons.forEach((button, i) => {
      const due = !!next && next.phase === i && next.t - t <= 2.8;
      button.disabled = mode !== "title" && mode !== "play";
      button.classList.toggle("mr-due", due);
      button.classList.toggle("is-pressed", now - pressTimes[i] < 130);
      const recent = now - feedback[i].at < 450;
      button.classList.toggle("is-hit", recent && feedback[i].result !== "miss");
      button.classList.toggle("is-miss", recent && feedback[i].result === "miss");
      button.style.setProperty("--arrival", due ? String(clamp(1 - (next.t - t) / 2.8, 0, 1)) : "0");
      const status = due ? ui.nextForm : phase === i ? ui.activeForm : "";
      const label = button.querySelector(".mr-form-status");
      if (label.textContent !== status) label.textContent = status;
    });
    $("action-pad").hidden = mode !== "play" && mode !== "ending";
    const actionButton = $("act");
    actionButton.disabled = mode !== "play" || buffering;
    if (phase !== lastActionPhase) {
      lastActionPhase = phase;
      $("action-label").textContent = ACTION_NAMES[lang][phase];
      $("action-icon").innerHTML = actionIcon(phase);
      actionButton.setAttribute("aria-label", `${ui.act} · ${ACTION_NAMES[lang][phase]} (${ui.space})`);
    }
    const readyAction = next && !next.activation && phase === next.phase && t >= next.t - ACTION_WINDOW.early && t <= next.t + ACTION_WINDOW.late;
    actionButton.classList.toggle("mr-action-ready", !!readyAction);
    actionButton.classList.toggle("is-pressed", now - actionPressedAt < 160);
    actionButton.classList.toggle("is-hit", !!event && event.result !== "miss" && t - event.at < .4);
    actionButton.style.setProperty("--arrival", next ? String(clamp(1 - (next.t - t) / 2.2, 0, 1)) : "0");
    actionButton.style.setProperty("--arrival-color", STATES[next?.phase ?? phase].ink);
    const actionStatus = now < actionNoticeUntil ? actionNotice : next?.activation ? ui.actionDone : readyAction ? ui.actionReady : ui.actionWait;
    if ($("action-status").textContent !== actionStatus) $("action-status").textContent = actionStatus;
    $("action-pad").classList.toggle("mr-action-ready", !!readyAction);
  }

  function frame(now) {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000));
    lastFrame = now;
    let t = lastT;
    if (mode === "title") t = now / 1000;
    else if (mode === "play" && !buffering) {
      t = songTime();
      lastT = t;
      if (auto) {
        while (autoCursor < notes.length && notes[autoCursor].t <= t) {
          choose(notes[autoCursor].phase);
          performAction(notes[autoCursor].t);
          autoCursor++;
        }
      }
      settleGates(t);
      if (audio.ended || t >= analysis.duration - 0.05) finish(true);
    } else if (mode === "ending") {
      t = lastT + Math.min(0.65, (now - endingAt) / 1000);
    }
    const muted = sfx.muted;
    root.classList.toggle("mr-title", mode === "title");
    root.classList.toggle("mr-suspended", mode === "pause" || mode === "result" || (mode === "starting" && !$("pause").hidden));
    audio.muted = muted;
    if (muted !== lastMuted) {
      lastMuted = muted;
      $("sound").setAttribute("aria-pressed", String(muted));
      $("sound").setAttribute("aria-label", muted ? ui.unmute : ui.mute);
      $("sound").title = muted ? ui.unmute : ui.mute;
      $("sound").innerHTML = soundIcon(muted);
    }
    updateControls(t, now);
    if (mode !== "title") updateHud(t);
    scene.render({ t, dt, phase, pace: pace.at(t), pulse: mode === "title" ? (1 + Math.sin(t * 5.4)) * 0.25 : timing.pulse(t), notes, mode, event, actionEvent });
    controlScene?.render(t, phase, pressTimes, now, mode === "play" || mode === "title" || mode === "ending", scene.reduced);
  }

  function destroy() {
    if (!alive) return;
    alive = false;
    cancelAnimationFrame(raf);
    cancelAnimationFrame(helpRaf);
    helpObserver?.disconnect();
    abort.abort();
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    awake.release();
    controlScene?.destroy();
    scene?.destroy();
    root.replaceChildren();
    root.classList.remove("mvg-game", "matter", "mr-title", "mr-suspended", "mr-help-caption");
    delete root.dataset.element;
    if (tabindex === null) root.removeAttribute("tabindex"); else root.setAttribute("tabindex", tabindex);
    if (root.mvgGame?.destroy === destroy) delete root.mvgGame;
    if (window.__game?.destroy === destroy) delete window.__game;
  }

  try {
    scene = new MatterScene(root.querySelector(".mr-stage"));
    controlScene = new FormControls3D(root.querySelector(".mr-controls"), scene.forms);
    helpObserver = new ResizeObserver(scheduleCoverHelp);
    [root, root.querySelector(".mr-launch"), root.querySelector(".mr-controls-wrap")].forEach((el) => helpObserver.observe(el));
    document.fonts.ready.then(() => { if (alive) scheduleCoverHelp(); });
    scheduleCoverHelp();
    buttons.forEach((button) => button.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      sfx.unlock();
      root.focus({ preventScroll: true });
      choose(Number(button.dataset.phase));
    }, { signal }));
    // Keyboard-generated button activation also works without a pointer.
    buttons.forEach((button) => button.addEventListener("click", (e) => {
      if (e.detail === 0) { sfx.unlock(); choose(Number(button.dataset.phase)); }
    }, { signal }));
    $("act").addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      sfx.unlock();
      root.focus({ preventScroll: true });
      performAction();
    }, { signal });
    $("act").addEventListener("click", (e) => { if (e.detail === 0) { sfx.unlock(); performAction(); } }, { signal });
    $("start").addEventListener("click", start, { signal });
    $("again").addEventListener("click", start, { signal });
    $("resume").addEventListener("click", resume, { signal });
    $("restart").addEventListener("click", start, { signal });
    $("pause-toggle").addEventListener("click", pause, { signal });
    $("sound").addEventListener("click", () => {
      sfx.unlock();
      localStorage.setItem("mvg-universe-muted", sfx.muted ? "0" : "1");
    }, { signal });
    window.addEventListener("keydown", (e) => {
      if (!root.contains(document.activeElement) || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === " " && mode === "play" && !e.target.closest(".mr-tools, a, input, textarea, select, [contenteditable=true]")) {
        e.preventDefault();
        if (!e.repeat) { sfx.unlock(); performAction(); }
        return;
      }
      if (e.repeat) return;
      if (k === "tab" && (mode === "pause" || mode === "result")) {
        const modal = $(mode === "pause" ? "pause" : "result");
        const targets = [...modal.querySelectorAll("button:not([disabled])")];
        const current = targets.indexOf(document.activeElement);
        const next = current < 0 ? (e.shiftKey ? targets.length - 1 : 0) : (current + (e.shiftKey ? -1 : 1) + targets.length) % targets.length;
        targets[next]?.focus({ preventScroll: true });
        e.preventDefault();
        return;
      }
      if (e.target.matches("input, textarea, select, [contenteditable=true]")) return;
      if ([" ", "enter"].includes(k) && e.target.closest("button, a")) return;
      sfx.unlock();
      if (k === "escape" || k === "p") { if (mode === "play") pause(); else if (mode === "pause") resume(); else return; }
      else if ((k === " " || k === "enter") && mode === "title") start();
      else if (k === "r" && mode === "result") start();
      else if (["a", "s", "d", "f", "1", "2", "3", "4"].includes(k)) choose("asdf".includes(k) ? "asdf".indexOf(k) : Number(k) - 1);
      else if ((k === "[" || k === "]") && mode === "play") {
        offset = Math.round(clamp(offset + (k === "]" ? 0.01 : -0.01), -0.3, 0.3) * 100) / 100;
        localStorage.setItem("matter-game-offset", String(offset));
        announce(`${ui.sync} ${Math.round(offset * 1000)} ms`);
      } else return;
      e.preventDefault();
    }, { signal });
    document.addEventListener("visibilitychange", () => { if (document.hidden) pause(); }, { signal });
    window.addEventListener("blur", pause, { signal });
    audio.addEventListener("canplay", () => {
      ready = true;
      loadFailed = false;
      $("start").disabled = false;
      setStartLabel(ui.start);
      $("notice").textContent = "";
      if (autoplay && !autoplayAttempted) { autoplayAttempted = true; start(); }
    }, { signal });
    audio.addEventListener("waiting", () => { buffering = true; }, { signal });
    audio.addEventListener("playing", () => { buffering = false; }, { signal });
    audio.addEventListener("ended", () => finish(true), { signal });
    audio.addEventListener("error", () => {
      ready = false;
      loadFailed = true;
      if (mode === "title") {
        $("notice").textContent = ui.audioError;
        $("start").disabled = false;
        setStartLabel(ui.retry);
      } else {
        pause();
        $("play-error").textContent = ui.audioError;
      }
    }, { signal });
    const api = {
      destroy,
      tally: () => ({ ...tally, mode, ready, buffering, score, combo, maxCombo, energy, phase, t: lastT, audioRate: audio.playbackRate, audioTime: audio.currentTime, pace: pace.at(lastT), auto, lastHit: event ? { ...event } : null, lastAction: actionEvent ? { ...actionEvent } : null, next: nextNote() ? { ...nextNote() } : null }),
      chart: () => chart.map((n) => ({ ...n })),
      // Same input path as the controls, useful to embedding hosts and previews.
      choose: (index) => choose(index),
      act: () => performAction(),
    };
    root.mvgGame = api;
    window.__game = api;
    audio.load();
    raf = requestAnimationFrame(frame);
    return api;
  } catch (err) {
    destroy();
    throw err;
  }
}
