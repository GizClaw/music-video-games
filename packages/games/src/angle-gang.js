import { Timing, clamp } from "@gizclaw/mvg-core/timing.js";
import { AudioClock, songAudioUrl } from "./kit.js";
import { COMMON, gameLang } from "./lang.js";
import { Life, createFinale } from "./finale.js";
import { backGuard, buzz, lockGestures, wakeLock } from "./mobile.js";
import { sfx } from "./sfx.js";
import analysis from "./angle/analysis.json";
import { buildChart, KINDS, prepareTiming, SECTIONS } from "./angle/song.js";
import { AngleRun } from "./angle/run.js";
import { AngleScene } from "./angle/scene.js";
import { ignition, turnSound } from "./angle/sound.js";
import { markup, style, TEXT } from "./angle/style.js";

const WORK = "songs/music/stem-institute/en-us/angle-gang";
const ICON = (muted) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4 6 8H2v8h4l5 4z"/>${muted ? '<path d="m17 9 5 6m0-6-5 6"/>' : '<path d="M15 8a6 6 0 0 1 0 8m3-12a11 11 0 0 1 0 16"/>'}</svg>`;
const WORD_COLORS = { acute: "#258e83", right: "#bc8b26", ninety: "#bc8b26", obtuse: "#d57947", straight: "#c86d8c", half: "#c86d8c", "three-quarter": "#8e71b6", full: "#b18a29", sixty: "#b18a29", degrees: "#377baf", turn: "#377baf" };
import { Flight, ANGLE_STEP, headingAngle, headingTarget, rollAngle, snapAngle } from "./angle/motion.js";
import { SteeringWheel } from "./angle/wheel.js";
import { targetDial } from "./angle/dial.js";

let styled = false;

/** Hold a target angle; releasing the controls returns the wheel and aircraft to zero. */
export async function mountAngleGang(target, options = {}) {
  const root = typeof target === "string" ? document.querySelector(target) : target;
  if (!root) throw new Error("mountAngleGang: target not found");
  if (!styled) { const el = document.createElement("style"); el.dataset.mvg = "angle-gang"; el.textContent = style; document.head.appendChild(el); styled = true; }
  const previous = Object.fromEntries(["class", "tabindex", "data-mode", "lang"].map((key) => [key, root.getAttribute(key)]));
  const lang = gameLang(options.lang), ui = TEXT[lang], common = COMMON[lang];
  const ac = new AbortController(), { signal } = ac;
  root.classList.add("mvg-game", "angle"); root.tabIndex = 0; root.lang = lang; root.innerHTML = markup(lang);
  const $ = (id) => root.querySelector(`#${id}`);
  if (options.backHref) $("back").href = options.backHref; else $("back").remove();
  const params = new URLSearchParams(options.search ?? location.search);
  const auto = options.auto ?? params.has("auto"), autoplay = options.play ?? params.has("play");
  const rawStart = Number(options.start ?? params.get("start") ?? 0);
  const from = Number.isFinite(rawStart) ? clamp(rawStart, 0, analysis.duration - 1) : 0;
  const tm = prepareTiming(new Timing(analysis)), chart = buildChart(tm);
  const audio = new Audio(options.audio ?? params.get("audio") ?? songAudioUrl(WORK));
  audio.crossOrigin = "anonymous"; audio.preload = "auto"; audio.muted = sfx.muted;
  const clock = new AudioClock(audio), awake = wakeLock(), life = new Life($("hp"));
  const finale = createFinale(root, { c: common, audio, signal }), reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let scene, wheel, alive = true, raf = 0, loadTimer = 0, generation = 0;
  let mode = "title", ready = false, loadFailed = false, buffering = false, seeking = false;
  let internalSeek = false, seeked = false, pendingStart = autoplay;
  let run = new AngleRun(chart, from), lastT = from, feedbackUntil = 0;
  const previewFlight = new Flight(), previewHistory = [];
  let previewAngle = 0;
  let previewTrace = 0, wasAligned = false;
  let offset = clamp(Number(localStorage.getItem("angle-game-offset")) || 0, -.3, .3);
  let lastCue = null, lastNote = null, lastMute = null, lastCountdown = -1, previousFrame = performance.now(), endingAt = 0;
  const collected = new Set(), startPerf = performance.now();
  const setMode = (value) => { mode = value; root.dataset.mode = value; };
  const seconds = () => performance.now() / 1000;
  const idleTime = () => (performance.now() - startPerf) / 1000;
  const songTime = () => clamp((buffering || seeking ? audio.currentTime : clock.now()) + offset, 0, analysis.duration);
  const guard = backGuard({ signal, playing: () => mode === "play", onBack: () => pause() });
  lockGestures(root, signal); setMode("title");
  $("collection").innerHTML = Object.entries(KINDS).filter(([k]) => k !== "zero").map(([k, v]) => `<span data-kind="${k}" title="${v[lang]}" style="--color:${v.color}" aria-label="${v[lang]}">✦</span>`).join("");
  function releaseControls() { wheel?.release(); }
  function setAngle(degrees, relative = false) {
    if (!alive || !Number.isFinite(degrees) || !["title", "play"].includes(mode)) return;
    sfx.unlock();
    if (mode === "title") { previewAngle = relative ? rollAngle(previewAngle + degrees) : snapAngle(degrees); previewFlight.setTarget(headingTarget(previewFlight.heading, previewAngle)); return; }
    if (auto || buffering || seeking || audio.paused) return;
    run.advance(songTime()).forEach(respond);
    if (mode !== "play") return;
    const selected = relative ? rollAngle(run.selectedAngle + degrees) : snapAngle(degrees);
    if (selected !== run.selectedAngle) ignition(selected > 0 ? 1 : 0);
    run.setAngle(selected);
  }
  const selectedAngle = () => mode === "title" ? previewAngle : run.selectedAngle;
  function releaseAngle() {
    if (!alive || auto) return;
    if (mode === "title") { previewAngle = 0; previewFlight.setTarget(headingTarget(previewFlight.heading, 0)); return; }
    if (mode === "play" && !audio.paused && !buffering && !seeking) run.advance(songTime()).forEach(respond);
    if (["play", "starting", "pause"].includes(mode)) run.setAngle(0);
  }

  function reset() {
    finale.reset(); scene.reset(); run = new AngleRun(chart, from); releaseControls(); life.reset(); collected.clear(); wasAligned = false;
    root.querySelectorAll(".ag-collection .caught").forEach((el) => el.classList.remove("caught"));
    lastT = from; seeked = false; lastCountdown = -1; lastCue = lastNote = null; feedbackUntil = 0;
    $("lyrics").replaceChildren(); $("pause").hidden = true; $("play-error").textContent = "";
    for (const id of ["title", "how"]) $(id).hidden = true;
    for (const id of ["hud", "readout", "next", "collection", "controls"]) $(id).hidden = false;
    $("practice").hidden = !auto && from === 0; $("practice").textContent = auto ? ui.demo : ui.practice;
    $("wheel").setAttribute("aria-disabled", String(auto)); $("hint").textContent = ui.hint;
  }
  function announce(main, detail = "", color = "#fff0a0") {
    const el = $("feedback"); el.replaceChildren(document.createTextNode(main));
    if (detail) { const small = document.createElement("small"); small.textContent = detail; el.appendChild(small); }
    el.style.color = color; feedbackUntil = seconds() + .72;
  }
  function finish(cleared) {
    if (mode !== "play") return;
    lastT = songTime(); endingAt = performance.now(); setMode("ending"); awake.release();
    $("pause-toggle").hidden = $("buffer").hidden = true; releaseControls(); $("wheel").setAttribute("aria-disabled", "true");
    // Stop a failed song cleanly too: the shared finale must not wind down English vocals.
    audio.pause();
    const { perfect, good, miss } = run.counts, judged = perfect + good + miss;
    finale.end({ cleared, score: run.score, ratio: judged ? (perfect + good * .6) / judged : 0, reached: lastT / analysis.duration,
      best: "angle-target-best", record: !auto && from === 0 && !seeked,
      stats: [["PERFECT", perfect], ["GOOD", good], ["MISS", miss], [ui.collected, `${perfect + good} / ${run.notes.length}`], [common.maxCombo, run.maxCombo]],
      onShow: () => { if (alive) setMode("result"); },
    });
  }
  function respond(event) {
    if (!event || mode !== "play") return;
    const { type, note } = event, t = songTime();
    scene.burst(note, type, t); turnSound(note.degrees, type, run.combo);
    if (type === "perfect" || type === "good") {
      life.heal(type); collected.add(note.kind); root.querySelector(`[data-kind="${note.kind}"]`)?.classList.add("caught");
      buzz(15); announce(type === "perfect" ? "PERFECT!" : "NICE!", `${Math.round(Math.abs(note.turn))}° / ${note.degrees}° · ${ui[type]}`, type === "perfect" ? "#fff2a6" : "#baffdf");
    } else {
      buzz(30); announce("MISS", `${Math.round(Math.abs(note.turn))}° / ${note.degrees}°`, "#ffb8a6"); if (life.hurt("miss")) finish(false);
    }
    wasAligned = false;
  }
  async function playAudio() {
    const attempt = ++generation; setMode("starting"); $("resume").disabled = true;
    try {
      await audio.play(); if (!alive || attempt !== generation) return;
      setMode("play"); clock.reanchor(); buffering = false; $("pause").hidden = true; $("pause-toggle").hidden = false; $("resume").disabled = false;
      guard.arm(); awake.hold(); root.focus({ preventScroll: true });
    } catch (error) {
      if (!alive || attempt !== generation) return;
      setMode("pause"); awake.release(); $("pause").hidden = false; $("resume").disabled = false;
      $("play-error").textContent = error.name === "NotAllowedError" ? ui.gesture : ui.audioError; $("resume").focus({ preventScroll: true });
    }
  }
  function beginLoad() {
    clearTimeout(loadTimer); loadFailed = false; ready = false; $("start").disabled = true; $("start").textContent = ui.loading;
    loadTimer = setTimeout(() => {
      if (!alive || ready) return;
      loadFailed = true; $("start").disabled = false; $("start").textContent = ui.retry; $("notice").textContent = ui.audioError;
    }, 20000); audio.load();
  }
  async function start() {
    if (!alive || ["play", "starting", "ending"].includes(mode)) return;
    sfx.unlock(); if (loadFailed || !ready) { pendingStart = true; beginLoad(); return; }
    pendingStart = false; reset(); sfx.start(); internalSeek = true; audio.currentTime = from; await playAudio();
  }
  function pause() {
    if (mode !== "play" && mode !== "starting") return;
    lastT = songTime(); generation++; setMode("pause"); releaseControls(); audio.pause(); awake.release();
    $("pause").hidden = false; $("pause-toggle").hidden = $("buffer").hidden = true; $("play-error").textContent = ""; $("resume").disabled = false; $("resume").focus({ preventScroll: true });
  }
  async function resume() {
    if (mode !== "pause") return;
    sfx.unlock();
    if (loadFailed) { const saved = Math.max(0, lastT - offset); audio.addEventListener("loadedmetadata", () => { internalSeek = true; audio.currentTime = saved; }, { once: true, signal }); beginLoad(); }
    await playAudio();
  }
  function lyrics(t) {
    const cue = tm.cues.findLast((c) => c.start <= t && t <= c.end);
    if (cue !== lastCue) {
      $("lyrics").replaceChildren(); lastCue = cue;
      cue?.words.forEach((w) => {
        const span = document.createElement("span"); span.textContent = w.text.replace(/[,，]$/, "");
        if (WORD_COLORS[w.clean]) { span.dataset.keyword = "1"; span.style.setProperty("--word", WORD_COLORS[w.clean]); }
        $("lyrics").appendChild(span);
      });
    }
    if (cue) [...$("lyrics").children].forEach((span, i) => {
      const word = cue.words[i]; span.className = `${span.dataset.keyword ? "keyword " : ""}${t >= word.start && t < word.end ? "active" : t >= word.end ? "sung" : ""}`;
    });
  }
  function frame(perf) {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(.05, Math.max(0, (perf - previousFrame) / 1000)); previousFrame = perf;
    const now = seconds(), idle = mode === "title";
    let t = idle ? idleTime() : lastT;
    if (idle) {
      previewFlight.step(dt, 12);
      if (t - previewTrace >= .04) { previewHistory.push({ t, ...previewFlight.snapshot() }); previewTrace = t; if (previewHistory.length > 180) previewHistory.shift(); }
    }
    if (mode === "play" && !buffering && !seeking && !audio.paused) {
      t = songTime(); lastT = t; run.advance(t, auto).forEach(respond);
    }
    const note = run.next;
    const flight = idle ? previewFlight : run.flight;
    const selected = idle ? previewAngle : run.selectedAngle;
    wheel.draw(selected, dt, reduced.matches);
    const wheelAngle = auto ? selected : wheel.readout;
    const turn = idle ? headingAngle(previewFlight.heading, previewAngle, Math.abs(previewFlight.targetHeading - previewFlight.heading) < .01) : note ? run.turn : run.notes.at(-1)?.turn ?? 0;
    const targetAngle = note?.degrees ?? run.notes.at(-1)?.degrees ?? 45;
    const aligned = !idle && run.aligned;
    const arrived = Math.abs(flight.targetHeading - flight.heading) < .01;
    const flightState = `${ui.aircraft} ${Math.round(Math.abs(turn))}°${arrived ? " · " + ui.hold : " → " + Math.abs(selected) + "°"}`;
    $("selected-angle").textContent = String(wheelAngle);
    $("wheel-target").textContent = `${targetAngle}°`;
    const dial = targetDial(wheelAngle, targetAngle);
    $("selection-needle").setAttribute("transform", `rotate(${dial.rotation} 120 120)`);
    $("target-needle").setAttribute("transform", `rotate(${dial.targetRotation} 120 120)`);
    $("target-label").setAttribute("transform", `translate(${dial.labelX} ${dial.labelY})`);
    $("angle-meter").classList.toggle("aligned", aligned);
    $("wheel").setAttribute("aria-valuetext", `${ui.current} ${wheelAngle}°; ${ui.target} ${targetAngle}°; ${flightState}`);
    if (!idle) {
      $("score").textContent = run.score.toLocaleString("en-US"); $("combo").textContent = String(run.combo); $("multiplier").textContent = `×${run.multiplier}`;
      $("progress").firstElementChild.style.width = `${t / analysis.duration * 100}%`; $("buffer").hidden = !(mode === "play" && buffering);
      if (aligned && !wasAligned && mode === "play") sfx.collect(2);
      wasAligned = aligned;
      $("hint").textContent = !note ? ui.finishing : aligned ? ui.readyAngle : run.selectionMade && !arrived ? ui.turning : ui.hint;
      const progress = note ? clamp((t - note.from) / (note.t - note.from), 0, 1) : 1;
      $("beat-fill").style.width = `${progress * 100}%`;
      if (note && lastNote !== note.id) {
        lastNote = note.id; const kind = KINDS[note.kind];
        $("kind").textContent = kind.en;
        $("rule").textContent = `${lang === "zh" ? kind.zh + " · " : ""}${kind.rule}`;
        $("next").querySelector("b").textContent = run.notes[run.cursor + 1] ? `${run.notes[run.cursor + 1].degrees}°` : "✦";
      }
      lyrics(t);
      if (mode === "play" && run.cursor === 0 && note && t < note.t) {
        const beats = Math.ceil((note.t - t) / tm.period);
        if (beats <= 3 && beats > 0 && beats !== lastCountdown) { lastCountdown = beats; announce(String(beats), ui.ready); sfx.count(beats); }
      }
    }
    $("feedback").classList.toggle("show", !idle && now < feedbackUntil);
    const mute = sfx.muted;
    if (mute !== lastMute) { lastMute = mute; audio.muted = mute; $("mute").innerHTML = ICON(mute); $("mute").setAttribute("aria-label", mute ? ui.muted : ui.sound); $("mute").setAttribute("aria-pressed", String(mute)); }
    const chorus = (t >= SECTIONS.chorus1 && t < SECTIONS.verse2) || (t >= SECTIONS.chorus2 && t < SECTIONS.bridge) || (t >= SECTIONS.chorus3 && t < SECTIONS.outro);
    const settling = mode === "ending" || mode === "result";
    const visualT = settling ? lastT + Math.min(.8, (perf - endingAt) / 1000) : t;
    scene.draw(visualT, note, { pulse: idle ? Math.exp(-(t % .7) / .15) : tm.pulse(t), dt: idle || mode === "play" || mode === "ending" ? dt : 0, reduced: reduced.matches, idle, combo: run.combo, chorus, flight: flight.snapshot(), gate: run.gate, aligned, history: idle ? previewHistory : run.history });
  }
  function destroy() {
    if (!alive) return;
    alive = false; generation++; ac.abort(); clearTimeout(loadTimer); cancelAnimationFrame(raf);
    audio.pause(); audio.removeAttribute("src"); audio.load(); awake.release(); scene?.destroy(); root.replaceChildren();
    for (const [key, value] of Object.entries(previous)) { if (value === null) root.removeAttribute(key); else root.setAttribute(key, value); }
    if (root.mvgGame?.destroy === destroy) delete root.mvgGame; if (window.__game?.destroy === destroy) delete window.__game;
  }
  try {
    scene = new AngleScene($("stage"));
    $("start").addEventListener("click", start, { signal }); $("again").addEventListener("click", start, { signal }); $("resume").addEventListener("click", resume, { signal }); $("pause-toggle").addEventListener("click", pause, { signal });
    $("mute").addEventListener("click", () => { sfx.unlock(); localStorage.setItem("mvg-universe-muted", sfx.muted ? "0" : "1"); }, { signal });
    wheel = new SteeringWheel($("wheel"), { signal, onInput: setAngle, onRelease: releaseAngle });
    root.addEventListener("keydown", (event) => {
      if (event.target.matches("input, textarea, select, [contenteditable=true]") || event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if ([" ", "enter"].includes(key) && event.target.closest("button, a")) return;
      if (!["a", "d", "arrowleft", "arrowright", "home", "end", " ", "enter", "escape", "p", "r", "[", "]"].includes(key)) return;
      event.preventDefault();
      if (["a", "d", "arrowleft", "arrowright", "home", "end"].includes(key)) {
        if (["title", "play"].includes(mode) && !auto) {
          if (key === "home" || key === "end") { const angle = key === "home" ? 0 : 360; wheel.turnKey(key, angle - wheel.rotation); setAngle(angle); }
          else {
            const delta = ["a", "arrowleft"].includes(key) ? -ANGLE_STEP : ANGLE_STEP;
            wheel.turnKey(key, delta); setAngle(delta, true);
          }
        }
        return;
      }
      if (event.repeat) return;
      if ([" ", "enter"].includes(key) && mode === "title") start();
      else if (key === "escape" || key === "p") { if (mode === "pause") resume(); else pause(); }
      else if (key === "r" && mode === "result") start();
      else if ((key === "[" || key === "]") && mode === "play") {
        offset = Math.round(clamp(offset + (key === "]" ? .01 : -.01), -.3, .3) * 100) / 100; localStorage.setItem("angle-game-offset", String(offset)); $("sync").textContent = `${ui.sync} ${Math.round(offset * 1000)} ms`;
      }
    }, { signal });
    window.addEventListener("keyup", (event) => wheel.releaseKey(event.key.toLowerCase()), { signal });
    window.addEventListener("blur", () => { releaseControls(); pause(); }, { signal }); document.addEventListener("visibilitychange", () => { if (document.hidden) { releaseControls(); pause(); } }, { signal });
    audio.addEventListener("canplay", () => {
      clearTimeout(loadTimer); ready = true; loadFailed = false; $("start").disabled = false; $("start").textContent = `${ui.start} ↗`; $("notice").textContent = "";
      if (pendingStart) { pendingStart = false; start(); }
    }, { signal });
    audio.addEventListener("waiting", () => { buffering = true; }, { signal }); audio.addEventListener("playing", () => { buffering = false; }, { signal });
    audio.addEventListener("seeking", () => { seeking = true; }, { signal });
    audio.addEventListener("seeked", () => {
      seeking = false; clock.reanchor();
      if (!internalSeek && ["play", "pause"].includes(mode)) {
        seeked = true; lastT = songTime(); run = new AngleRun(chart, lastT); life.reset(); scene.reset(); releaseControls(); collected.clear(); lastNote = null; wasAligned = false;
        root.querySelectorAll(".ag-collection .caught").forEach((el) => el.classList.remove("caught")); $("practice").hidden = false; $("practice").textContent = auto ? ui.demo : ui.practice;
      }
    internalSeek = false;
    }, { signal });
    audio.addEventListener("ended", () => { if (mode === "play") { run.advance(analysis.duration, auto).forEach(respond); if (mode === "play") finish(true); } }, { signal });
    audio.addEventListener("error", () => {
      clearTimeout(loadTimer); ready = false; loadFailed = true;
      if (mode === "title") { $("notice").textContent = ui.audioError; $("start").disabled = false; $("start").textContent = ui.retry; }
      else { pause(); $("play-error").textContent = ui.audioError; }
    }, { signal });
    const api = { destroy, setAngle, audio, inspectFrame: (options) => scene.inspectFrame(options), chart: () => chart.map((n) => ({ ...n })),
      tally: () => ({ ...run.counts, mode, ready, buffering, auto, seeked, score: run.score, combo: run.combo, maxCombo: run.maxCombo, life: life.value, time: lastT, turn: mode === "title" ? headingAngle(previewFlight.heading, previewAngle, Math.abs(previewFlight.targetHeading - previewFlight.heading) < .01) : run.turn, selectedAngle: selectedAngle(), selectionMade: run.selectionMade, arrived: mode === "title" ? Math.abs(previewFlight.heading - previewFlight.targetHeading) < .01 : run.arrived, angleError: run.error, aligned: run.aligned, flight: (mode === "title" ? previewFlight : run.flight).snapshot(), collected: [...collected], next: run.next ? { ...run.next } : null }),
      diagnostics: (bounds = false) => ({ ...scene.last, wheel: { rotation: wheel.rotation, held: wheel.held, readout: wheel.readout, selected: wheel.value }, notes: run.notes.length, reducedMotion: reduced.matches, ...(bounds ? { aircraftBounds: scene.aircraftBounds() } : {}) }),
    };
    root.mvgGame = window.__game = api; root.focus({ preventScroll: true }); beginLoad(); raf = requestAnimationFrame(frame); return api;
  } catch (error) { destroy(); throw error; }
}
