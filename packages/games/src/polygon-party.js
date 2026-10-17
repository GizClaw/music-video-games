import { Timing, clamp } from "@gizclaw/mvg-core/timing.js";
import { AudioClock, songAudioUrl } from "./kit.js";
import { COMMON, gameLang } from "./lang.js";
import { backGuard, buzz, goFullscreen, isTouch, lockGestures, wakeLock } from "./mobile.js";
import { sfx } from "./sfx.js";
import analysis from "./polygon/analysis.json";
import { EARLY, END, GOLD, SECTIONS, SHAPES, WINDOW, WORK, chart, phaseAt, shapeOf, wordColor } from "./polygon/song.js";
import { createStage } from "./polygon/stage.js";
import { LANE_AHEAD, createLane } from "./polygon/lane.js";
import { TITLE, clip, polygonMarkup, polygonStyle } from "./polygon/style.js";

const TEXT = {
  zh: {
    tipFirst: "外圈缩到形状上的那一下，点屏幕或按空格",
    tipTouch: "外圈缩到形状上的那一下，敲下面的鼓（点屏幕哪里都行）",
    early: "早了",
    sides: (n) => `${n} 条边 · ${n} 个角`,
    complete: (s) => `${s.zh}画好了！`,
    faster: "节奏变快了",
    every: "每一拍都有",
    offbeat: "加上半拍",
    fastest: "最快的一段",
    outro: "画到最后一笔",
    collected: "收集形状",
    missed: "漏拍",
  },
  en: {
    tipFirst: "Tap or press Space as the outer outline closes onto the shape",
    tipTouch: "Hit a drum pad as the outer outline closes onto the shape (anywhere on screen works)",
    early: "EARLY",
    sides: (n) => `${n} SIDES · ${n} CORNERS`,
    complete: (s) => `${s.en} DONE!`,
    faster: "the beat picks up",
    every: "a note on every beat",
    offbeat: "now the off-beats too",
    fastest: "the fastest part",
    outro: "to the very last edge",
    collected: "Shapes",
    missed: "Missed",
  },
};
const OFFSET_KEY = "polygon-game-offset";
const START = 6.5; // standalone play starts here, just before the first sung line
const TIPS = 4; // the first notes carry the tip
const HIT_KEYS = new Set([" ", "j", "f", "k", "d", "enter"]);
const ATTRACT = [SECTIONS.chorus1 - 0.5, SECTIONS.chorus1 + 15];

let styleMounted = false;
function ensureStyle() {
  if (styleMounted) return;
  const el = document.createElement("style");
  el.dataset.mvg = "polygon-party";
  el.textContent = polygonStyle;
  document.head.appendChild(el);
  styleMounted = true;
}

/**
 * Mount Polygon Party into `target` (an element or a selector). The HUD and
 * canvas are created inside that element. `options.audio`, `options.start`,
 * `options.play` and `options.auto` override the page query.
 * `options.backHref` shows a link back to a gallery; omit it when embedding.
 * `options.lang` (`zh` or `en`) picks the language, else the universe hub's choice.
 * @param {Element | string} target
 * @param {{ audio?: string, start?: number | string, play?: boolean, auto?: boolean, backHref?: string, search?: string, lang?: "zh" | "en" }} [options]
 * @returns {Promise<{ destroy: () => void, tally: () => object, press: () => void, audio: HTMLAudioElement, diagnostics: () => object }>}
 */
export async function mountPolygonParty(target, options = {}) {
  const root = typeof target === "string" ? document.querySelector(target) : target;
  if (!root) throw new Error("mountPolygonParty: target not found");
  ensureStyle();
  root.classList.add("mvg-game", "polygon");
  const lang = gameLang(options.lang);
  const ui = COMMON[lang];
  const T = TEXT[lang];
  root.innerHTML = polygonMarkup(lang);
  const back = root.querySelector("a.back");
  if (options.backHref) back.href = options.backHref;
  else back.remove();
  const $ = (id) => root.querySelector("#" + id);
  const params = new URLSearchParams(options.search ?? location.search);
  if (options.audio != null) params.set("audio", options.audio);
  if (options.start != null) params.set("start", String(options.start));
  if (options.play) params.set("play", "");
  if (options.auto) params.set("auto", "");
  const ac = new AbortController();
  const { signal } = ac;
  lockGestures(root, signal);
  const awake = wakeLock();
  const touch = isTouch();
  if (touch) {
    root.querySelector("#title .keys").innerHTML = TITLE[lang].touchKeys.map((k) => `<div>${k}</div>`).join("");
    root.querySelector("#pause .sub").textContent = ui.resumeTouch;
  }
  let alive = true;
  let raf = 0;
  let audio;
  let stage;
  function destroy() {
    alive = false;
    cancelAnimationFrame(raf);
    ac.abort();
    audio?.pause();
    awake.release();
    stage?.destroy();
    root.replaceChildren();
    root.classList.remove("mvg-game", "polygon");
    if (root.mvgGame) delete root.mvgGame;
    if (window.__game?.destroy === destroy) delete window.__game;
  }

  try {
    const tm = new Timing(analysis);
    tm.setDownbeat(SECTIONS.drop);
    const CHART = chart(tm);
    stage = createStage($("stage"));
    const lane = createLane(root);
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

    audio = new Audio(params.get("audio") || songAudioUrl(WORK));
    audio.preload = "auto";
    const clock = new AudioClock(audio);
    let offset = Number(localStorage.getItem(OFFSET_KEY) || 0);
    const songTime = () => clock.now() + offset;
    await clock.ready();

    // ---------- state ----------
    let state = "title";
    let notes = [];
    let shapeI = 0;
    let edges = 0; // drawn on the current shape
    let lap = 1;
    let score = 0, combo = 0, maxCombo = 0;
    const tally = { perfect: 0, good: 0, miss: 0, early: 0, shapes: 0 };
    const got = new Set();
    let lastT = 0;
    let lastHitAt = -1;
    let lastCall = -1;
    let tipShown = "";
    const auto = params.has("auto");
    const loud = () => state === "play";
    const now = () => performance.now() / 1000;
    const guard = backGuard({ signal, playing: () => state === "play", onBack: () => togglePause() });
    const chips = [...$("shapes").children];
    const pads = [$("padL"), $("padR")];
    const calls = [
      { t: SECTIONS.chorus1, text: "SIDE BY SIDE!", color: "#ff4fd8", sub: T.faster },
      { t: SECTIONS.verse2, text: "FASTER!", color: "#4dff7a", sub: T.faster },
      { t: SECTIONS.chorus2, text: "HOW MANY?", color: "#2fe0ff", sub: T.every },
      { t: SECTIONS.bridge, text: "ROLL CALL", color: "#5d7bff", sub: T.offbeat },
      { t: SECTIONS.chorus3, text: "POLYGON PARTY!", color: GOLD, sub: T.fastest },
      { t: SECTIONS.outro, text: "FINALE", color: GOLD, sub: T.outro },
    ];
    const current = () => SHAPES[shapeI];
    const mult = () => Math.min(4, 1 + Math.floor(combo / 10));

    function setTip(text) {
      if (text === tipShown) return;
      tipShown = text;
      // An empty tip keeps its last words while it fades out.
      if (text) $("tip").textContent = text;
      $("tip").classList.toggle("on", !!text);
    }
    function updateScore() {
      $("score").querySelector("b").textContent = score.toLocaleString("en-US");
      const cb = $("combo").querySelector("b");
      cb.textContent = combo;
      cb.classList.remove("bump");
      void cb.offsetWidth;
      if (combo) cb.classList.add("bump");
      $("combo").querySelector("em").textContent = `×${mult()}`;
    }
    let tagFor = "";
    function showTag() {
      const s = current();
      const count = edges;
      const key = `${s.sides}/${count}`;
      if (key === tagFor) return;
      const tag = $("tag");
      if (!tagFor.startsWith(`${s.sides}/`)) {
        tag.style.color = s.color;
        tag.querySelector("b").textContent = lang === "zh" ? s.zh : s.en;
        tag.querySelector("small").textContent = lang === "zh" ? `${s.en} · ${T.sides(s.sides)}` : T.sides(s.sides);
        tag.querySelector(".pips").innerHTML = "<i></i>".repeat(s.sides);
        chips.forEach((c, i) => c.classList.toggle("now", i === shapeI));
        for (const pad of pads) {
          pad.style.setProperty("--shape", clip(s.sides));
          pad.style.setProperty("--c", s.color);
        }
      }
      [...tag.querySelector(".pips").children].forEach((p, i) => p.classList.toggle("on", i < count));
      tagFor = key;
    }
    function judgeText(text, color, sub = "") {
      const j = $("judge");
      j.innerHTML = `<span>${text}</span>${sub ? `<small>${sub}</small>` : ""}`;
      j.style.color = color;
      j.style.textShadow = `0 0 18px ${color}, 0 2px 8px #000`;
      j.classList.remove("show");
      void j.offsetWidth;
      j.classList.add("show");
    }
    function slam(text, color, sub = "") {
      const b = $("band");
      b.innerHTML = `${text}${sub ? `<small>${sub}</small>` : ""}`;
      b.style.color = color;
      b.style.textShadow = `0 0 28px ${color}`;
      b.classList.remove("show");
      void b.offsetWidth;
      b.classList.add("show");
    }

    /** Back to the triangle; `fresh` also clears the score (a new game rather than a demo loop). */
    function reset(from, fresh = true) {
      notes = CHART.map((n) => ({ ...n, state: n.t < from + 0.2 ? "skip" : "wait" }));
      shapeI = 0;
      edges = 0;
      lap = 1;
      stage.reset();
      tagFor = "";
      setTip("");
      if (!fresh) return;
      score = combo = maxCombo = 0;
      Object.keys(tally).forEach((k) => (tally[k] = 0));
      got.clear();
      chips.forEach((c) => c.classList.remove("got", "pop"));
      lastCall = -1;
      $("lyric").dataset.cue = "";
      $("lyric").innerHTML = "";
      updateScore();
    }

    /** The next unjudged note, and the one a tap at t would hit. */
    const nextNote = () => notes.find((n) => n.state === "wait");
    /** The next few unjudged notes, as seconds ahead and how long their cue takes to close. */
    function upcoming(t) {
      const out = [];
      for (const n of notes) {
        if (n.state !== "wait") continue;
        if (out.length === 4 || n.t - t > n.lead) break;
        out.push({ ahead: n.t - t, lead: n.lead });
      }
      return out;
    }
    function hit(n, t) {
      const err = Math.abs(t - n.t);
      const grade = err <= WINDOW.perfect ? "perfect" : "good";
      n.state = grade;
      n.at = now();
      n.sides = current().sides;
      lastHitAt = n.at;
      tally[grade]++;
      combo++;
      maxCombo = Math.max(maxCombo, combo);
      score += (grade === "perfect" ? 300 : 150) * mult();
      const s = current();
      stage.hit(s.sides, now(), grade);
      edges++;
      if (loud()) {
        sfx.hit(edges - 1, grade === "perfect");
        buzz(grade === "perfect" ? 12 : 8);
      }
      judgeText(grade.toUpperCase(), grade === "perfect" ? GOLD : "#9fe8ff", `${edges} / ${s.sides}`);
      if (edges === s.sides) complete(s);
      updateScore();
    }
    function complete(s) {
      stage.complete(s.sides, now());
      tally.shapes++;
      score += 500 * mult();
      const fresh = !got.has(s.sides);
      got.add(s.sides);
      const chip = chips[s.sides - 3];
      chip.classList.add("got");
      chip.classList.remove("pop");
      void chip.offsetWidth;
      chip.classList.add("pop");
      judgeText(T.complete(s), s.color, T.sides(s.sides));
      if (loud()) {
        sfx.collect(s.sides - 3);
        if (fresh && got.size === SHAPES.length) sfx.combo();
        buzz(30);
      }
      edges = 0;
      shapeI = (shapeI + 1) % SHAPES.length;
      if (shapeI === 0) lap++;
      // A shape finished on an earlier lap starts over when its turn comes again.
      stage.clear(current().sides);
    }
    function miss(n) {
      n.state = "miss";
      n.at = now();
      n.sides = current().sides;
      tally.miss++;
      combo = 0;
      stage.miss(current().sides, now());
      judgeText("MISS", "#c8b8ff");
      if (loud()) sfx.miss();
      updateScore();
    }
    /** A tap at song time t: the nearest note in its window, an early tap that breaks the combo, or a harmless tick. */
    function press(t = lastT) {
      const n = nextNote();
      if (!n) return;
      if (Math.abs(t - n.t) <= WINDOW.good) return hit(n, t);
      if (loud()) sfx.tap(1);
      if (n.t - t < EARLY && n.t > t) {
        tally.early++;
        combo = 0;
        judgeText(T.early, "#ffb36b");
        updateScore();
      }
    }
    /** Misses for song time t. */
    function sweep(t) {
      for (const n of notes) {
        if (n.t > t - WINDOW.good) break;
        if (n.state === "wait") miss(n);
      }
    }
    /** The demo and `?auto`: every note right on time. */
    function autopilot(t) {
      for (const n of notes) {
        if (n.t > t) break;
        if (n.state === "wait") hit(n, n.t);
      }
    }

    // ---------- input ----------
    for (const pad of pads) {
      pad.addEventListener("pointerdown", (e) => {
        sfx.unlock();
        e.preventDefault();
        if (state !== "play") return;
        pad.classList.add("down");
        setTimeout(() => pad.classList.remove("down"), 90);
        press(songTime());
      }, { signal });
    }
    root.addEventListener("pointerdown", (e) => {
      sfx.unlock();
      if (state !== "play" || e.target.closest("button, a, .overlay")) return;
      e.preventDefault();
      press(songTime());
    }, { signal });
    window.addEventListener("keydown", (e) => {
      sfx.unlock();
      const k = e.key.toLowerCase();
      if (e.key === "Escape" || k === "p") togglePause();
      else if (k === "r" && state === "result") start();
      else if ((e.key === " " || e.key === "Enter") && state === "title") start();
      else if (HIT_KEYS.has(k)) {
        if (state === "play" && !e.repeat) press(songTime());
      } else if (e.key === "[" || e.key === "]") {
        offset = Math.round((offset + (e.key === "]" ? 0.01 : -0.01)) * 100) / 100;
        localStorage.setItem(OFFSET_KEY, String(offset));
        judgeText(`SYNC ${offset >= 0 ? "+" : ""}${Math.round(offset * 1000)} ms`, "#ffffff");
      } else return;
      e.preventDefault();
    }, { signal });
    document.addEventListener("visibilitychange", () => document.hidden && state === "play" && togglePause(), { signal });
    root.querySelectorAll("#title button, #result button").forEach((b) => b.addEventListener("pointerenter", () => sfx.hover(4), { signal }));
    $("pause").addEventListener("click", togglePause);
    $("start").addEventListener("click", start);
    $("again").addEventListener("click", start);

    function start() {
      const from = params.has("start") ? Number(params.get("start")) || 0 : START;
      reset(from);
      sfx.unlock();
      sfx.start();
      goFullscreen();
      state = "play";
      guard.arm();
      awake.hold();
      ["title", "result", "pause"].forEach((id) => ($(id).hidden = true));
      $("hud").hidden = false;
      audio.muted = false;
      audio.currentTime = from;
      audio.play();
      lastT = from;
    }
    function togglePause() {
      if (state === "play") {
        sfx.click();
        state = "pause";
        audio.pause();
        awake.release();
        $("pause").hidden = false;
      } else if (state === "pause") {
        sfx.click();
        state = "play";
        guard.arm();
        awake.hold();
        $("pause").hidden = true;
        audio.play();
      }
    }
    function finish() {
      state = "result";
      awake.release();
      setTip("");
      stage.finish(now());
      const total = notes.filter((n) => n.state !== "skip").length;
      const weighted = (tally.perfect + tally.good * 0.6) / Math.max(1, total);
      const grade = weighted >= 0.95 ? "S" : weighted >= 0.85 ? "A" : weighted >= 0.7 ? "B" : weighted >= 0.5 ? "C" : "D";
      const gradeColor = { S: GOLD, A: "#2fe0ff", B: "#4dff7a", C: "#ff8a1f", D: "#ff3d5a" }[grade];
      $("result").querySelector(".kicker").textContent = "PARTY OVER";
      $("grade").textContent = grade;
      $("grade").style.color = gradeColor;
      $("grade").style.textShadow = `0 0 40px ${gradeColor}`;
      $("final").textContent = ui.points(score.toLocaleString("en-US"));
      sfx.result(grade <= "B");
      $("stats").innerHTML = [
        ["PERFECT", tally.perfect],
        ["GOOD", tally.good],
        [T.missed, tally.miss],
        [T.collected, `${got.size} / ${SHAPES.length}`],
        [ui.accuracy, `${Math.round(((tally.perfect + tally.good) / Math.max(1, total)) * 100)}%`],
        [ui.maxCombo, maxCombo],
      ]
        .map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`)
        .join("");
      $("result").hidden = false;
    }

    // ---------- note lane ----------
    const laneBeats = [];
    const laneNotes = [];
    /** The lane: beat lines in view, and notes in view with the shape each will draw (or drew). */
    function drawLane(t, due) {
      laneBeats.length = laneNotes.length = 0;
      for (let i = Math.max(0, tm.beatIndexAt(t - 0.4)); i < tm.beats.length; i++) {
        const bt = tm.beatTime(i);
        if (bt > t + LANE_AHEAD) break;
        laneBeats.push([bt, (((i - tm.dropBeat) % 4) + 4) % 4 === 0]);
      }
      let i = shapeI, e = edges;
      for (const n of notes) {
        if (n.state === "skip") continue;
        if (n.state === "wait") {
          const s = SHAPES[i];
          const last = e + 1 === s.sides;
          if (n.t - t > LANE_AHEAD) break;
          if (n.t - t > -0.6) laneNotes.push({ t: n.t, sides: s.sides, color: s.color, last, state: "wait", at: 0 });
          e = last ? 0 : e + 1;
          if (last) i = (i + 1) % SHAPES.length;
        } else if (now() - n.at < 0.5) laneNotes.push({ t: n.t, sides: n.sides, color: shapeOf(n.sides).color, last: false, state: n.state, at: n.at });
      }
      lane.draw(t, { beats: laneBeats, notes: laneNotes, now: now(), due, sides: current().sides, color: current().color, hitAt: lastHitAt });
    }

    // ---------- lyrics ----------
    function drawLyric(t) {
      const el = $("lyric");
      const at = tm.cueAt(t);
      const key = at ? String(at.index) : "";
      if (el.dataset.cue !== key) {
        el.dataset.cue = key;
        el.innerHTML = at ? at.cue.words.map((w) => `<span style="${wordColor(w.clean) ? `color:${wordColor(w.clean)}` : ""}">${w.text}</span>`).join(" ") : "";
      }
      if (!at) return;
      [...el.children].forEach((s, i) => s.classList.toggle("sung", at.cue.words[i].start <= t + 0.02));
    }

    // ---------- frame ----------
    function frame() {
      if (!alive) return;
      raf = requestAnimationFrame(frame);
      let t;
      if (state === "title") {
        t = ATTRACT[0] + (now() % (ATTRACT[1] - ATTRACT[0]));
        if (t < lastT) reset(ATTRACT[0], false);
        autopilot(t);
      } else {
        t = state === "play" || (state === "result" && !audio.paused) ? songTime() : lastT;
        if (state === "play") {
          if (auto) autopilot(t);
          sweep(t);
          if (t >= END || audio.ended) finish();
        }
      }
      lastT = t;
      const n = nextNote();
      const view = stage.draw(t, now(), {
        sides: current().sides,
        beat: tm.beatFloat(t),
        pulse: tm.pulse(t, 0.12),
        phase: phaseAt(t),
        upcoming: upcoming(t),
        demo: state === "title",
        reducedMotion: reducedMotion.matches,
      });
      if (state !== "title") hud(t, view, n);
    }

    function hud(t, view, n) {
      $("progress").firstElementChild.style.width = `${clamp(t / END, 0, 1) * 100}%`;
      drawLyric(t);
      showTag();
      const tag = $("tag");
      tag.style.left = `${view.head.x}px`;
      tag.style.top = `${view.head.y - 8}px`;
      tag.style.opacity = state === "play" && view.head.visible ? "1" : "0";
      const j = $("judge");
      j.style.left = `${view.centre.x}px`;
      j.style.top = `${view.centre.y - 24}px`;
      const due = !!n && Math.abs(n.t - t) <= WINDOW.good;
      for (const pad of pads) pad.classList.toggle("due", due);
      drawLane(t, due);
      const index = n ? notes.indexOf(n) - notes.findIndex((x) => x.state !== "skip") : Infinity;
      setTip(state === "play" && index < TIPS && n && n.t - t < n.lead * 2.5 ? (touch ? T.tipTouch : T.tipFirst) : "");
      if (state !== "play") return;
      const c = calls.findLast((x) => x.t <= t);
      if (c && c.t !== lastCall && t - c.t < 0.5) {
        lastCall = c.t;
        slam(c.text, c.color, c.sub);
      }
    }

    reset(ATTRACT[0], false);
    $("start").disabled = false;
    $("start").textContent = ui.start;
    if (params.has("play")) start();
    frame();
    const api = {
      tally: () => ({ ...tally, score, combo, maxCombo, lap, sides: current().sides, edges, collected: [...got].sort((a, b) => a - b), next: nextNote()?.t ?? null }),
      /** A tap now, as a player would. */
      press: () => state === "play" && press(songTime()),
      audio,
      diagnostics: () => stage.diagnostics(),
      destroy,
    };
    root.mvgGame = api;
    window.__game = api;
    return api;
  } catch (e) {
    console.error(e);
    const startBtn = $("start");
    if (startBtn) startBtn.textContent = ui.error(e.message);
    destroy();
    throw e;
  }
}
