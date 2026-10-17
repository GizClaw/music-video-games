import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { Timing, clamp, easeOutCubic, lerp, smooth } from "@gizclaw/mvg-core/timing.js";
import { AudioClock, songAudioUrl } from "./kit.js";
import { COMMON, gameLang } from "./lang.js";
import { backGuard, buzz, isTouch, lockGestures, wakeLock } from "./mobile.js";
import { sfx } from "./sfx.js";
import analysis from "./penguin/analysis.json";
import { Penguin } from "./penguin/model.js";
import { STAGE_R, makeBergs, makeLamps, makeSea, makeSky, makeSnow, makeStage } from "./penguin/world.js";
import { CHORUSES, CLAP, FLAP, FREEZE_CUE, LANES, LEFT, RETIME, RIGHT, SECTIONS, WORD_COLORS } from "./penguin/song.js";
import { ICONS } from "./penguin/icons.js";
import { penguinMarkup, penguinStyle, titleKeys } from "./penguin/style.js";

const TEXT = {
  zh: {
    warm: "左右脚，跟着节拍踏",
    chorus: "跟着歌词跳！",
    freeze: "别动！一下都别按",
    frozen: "定住了！",
    moved: "动了！",
    rest: "累了就歇一歇",
    fever: "随便按！越快越好",
    joined: "新朋友入队！",
    wrongPad: "按错键",
    crewRow: "舞队企鹅",
    freezeRow: "木头人",
    feverRow: "狂热连打",
    passed: "成功",
    failed: "动了",
  },
  en: {
    warm: "Left, right, step to the beat",
    chorus: "Dance to the words!",
    freeze: "Don't move! No pads at all",
    frozen: "Frozen!",
    moved: "You moved!",
    rest: "Tired? Take a rest",
    fever: "Mash the pads!",
    joined: "A new friend joins!",
    wrongPad: "Wrong pads",
    crewRow: "Dance crew",
    freezeRow: "Freeze",
    feverRow: "Fever taps",
    passed: "held",
    failed: "moved",
  },
};

const WORK = "songs/music/animal-dance-en/en-us/penguin-steps";
const LEAD = 1.5; // seconds a note takes to fall to the judge line
const PERFECT = 0.07;
const GREAT = 0.12;
const GOOD = 0.18;
const CREW_MAX = 13;
const PER_JOIN = 10; // hits per new crew member
const ATTRACT = [SECTIONS.chorus1, SECTIONS.verse2];
const SLOTS = [
  [0, 1.3], [-1.2, 0.6], [1.2, 0.6], [-2.35, -0.1], [2.35, -0.1], [-0.6, -0.5], [0.6, -0.5],
  [-1.75, -1.25], [1.75, -1.25], [-2.9, -1.95], [2.9, -1.95], [-0.6, -1.9], [0.6, -1.9],
];
const CHICK = 5;
const LAMP_HUES = ["#7ff6ff", "#b18cff", "#ff7ad9", "#9dff6b", "#ffd34d"];

let styleMounted = false;
function ensureStyle() {
  if (styleMounted) return;
  const el = document.createElement("style");
  el.dataset.mvg = "penguin-steps";
  el.textContent = penguinStyle;
  document.head.appendChild(el);
  styleMounted = true;
}

/** Replace word starts: a full list, or a { wordIndex: start } patch. */
function retime(tm) {
  for (const [index, fix] of Object.entries(RETIME)) {
    const cue = tm.cues[index];
    const starts = cue.words.map((w, k) => (Array.isArray(fix) ? fix[k] : fix[k] ?? w.start));
    cue.words.forEach((w, k) => {
      w.start = starts[k];
      w.end = starts[k + 1] ?? Math.max(w.end, starts[k] + 0.4);
    });
    cue.start = starts[0];
    cue.end = Math.max(cue.end, cue.words.at(-1).end);
  }
}

/** Time of fractional beat `b`, interpolated between detected beats. */
function beatAt(tm, b) {
  const i = Math.floor(b);
  return lerp(tm.beatTime(i), tm.beatTime(i + 1), b - i);
}

/** Moments the chart and the scene share: freeze and rest windows, the fever break. */
function songEvents(tm) {
  const fc = tm.cues[FREEZE_CUE];
  const rest = tm.cues[FREEZE_CUE + 1];
  return {
    freeze: [fc.words[0].start, fc.words.at(-1).start],
    rest: [rest.words[0].start, SECTIONS.dance],
    fever: [SECTIONS.dance, SECTIONS.chorus3],
    grand: tm.cues.at(-1).words.at(-1).start,
  };
}

/**
 * Sung moves are notes on their pads: "step" alternates the feet, "left" and
 * "right" in the waddle line take a foot each, flap · wings · flash · swim
 * take the flipper, clap and "bright" the clap pad, "hey" both feet (a jump)
 * and "crew" flipper and clap together; every beat of the clap line is a
 * clap. Notes snap to the half-beat grid. Fillers keep the beat where nothing
 * is sung within three quarters of a beat: every beat in the choruses (left,
 * clap, right, clap), every other beat elsewhere (left, right). Nothing falls
 * while the song says freeze or rest, or in the fever break.
 */
function buildChart(tm, ev) {
  const words = [];
  const add = (t, lane, word = true) => words.push({ t, lane, word });
  tm.cues.forEach((c) => {
    let foot = 0;
    c.words.forEach((w) => {
      if (w.start < SECTIONS.drop) return;
      const k = w.clean;
      if (k === "step" || k === "steps") add(w.start, foot++ % 2 ? RIGHT : LEFT);
      else if (k === "left") add(w.start, LEFT);
      else if (k === "right" && c.text.startsWith("Waddle")) add(w.start, RIGHT);
      else if (["flap", "wings", "flash", "swim", "swimming"].includes(k)) add(w.start, FLAP);
      else if (k === "clap" || k === "bright") add(w.start, CLAP);
      else if (k === "hey") {
        add(w.start, LEFT);
        add(w.start, RIGHT);
      } else if (k === "crew") {
        add(w.start, FLAP);
        add(w.start, CLAP);
      }
    });
    if (c.text.startsWith("Clap that")) {
      const a = c.words[0].start;
      const b = c.words.at(-1).start;
      for (let i = tm.beatIndexAt(a - 0.06) + 1; tm.beatTime(i) <= b + 0.06; i++) add(tm.beatTime(i), CLAP, false);
    }
  });
  const taken = new Set();
  const perBeat = new Map();
  const notes = [];
  for (const n of words.sort((a, b) => a.t - b.t)) {
    const h = Math.round(tm.beatFloat(n.t) * 2) / 2;
    const key = `${h}:${n.lane}`;
    if (taken.has(key) || (perBeat.get(h) ?? 0) >= 2) continue;
    taken.add(key);
    perBeat.set(h, (perBeat.get(h) ?? 0) + 1);
    notes.push({ ...n, h, t: beatAt(tm, h) });
  }

  const quiet = (t) => (t >= ev.freeze[0] - 0.4 && t < ev.freeze[1] + 0.3) || (t >= ev.rest[0] - 0.2 && t < ev.fever[1]) || t > ev.grand + 0.2;
  const inChorus = (t) => CHORUSES.some((b) => t >= tm.cues[b].start - 0.5 && t < tm.cues[b + 4].end + 0.3);
  const first = tm.beatIndexAt(SECTIONS.drop + 0.01);
  for (let i = first; i < tm.beats.length && tm.beatTime(i) < SECTIONS.end - 0.6; i++) {
    const bt = tm.beatTime(i);
    if (quiet(bt)) continue;
    const rel = i - first;
    const chorus = inChorus(bt);
    if (!chorus && rel % 2) continue;
    if (notes.some((n) => Math.abs(n.h - i) < 0.75)) continue;
    const lane = chorus ? [LEFT, CLAP, RIGHT, CLAP][rel % 4] : (rel / 2) % 2 ? RIGHT : LEFT;
    notes.push({ t: bt, h: i, lane, word: false });
  }
  return notes.sort((a, b) => a.t - b.t).map((n) => ({ ...n, judged: false, result: null }));
}

/**
 * Mount Penguin Step Party into `target` (an element or a selector): four pads
 * (left foot, flipper, clap, right foot) under a note highway, with the
 * penguin crew dancing on the ice above. `options.audio`, `options.start`,
 * `options.play` and `options.auto` override the page query; `options.backHref`
 * shows a link back to a gallery; `options.lang` (`zh` or `en`) picks the language.
 * @param {Element | string} target
 * @param {{ audio?: string, start?: number | string, play?: boolean, auto?: boolean, backHref?: string, search?: string, lang?: "zh" | "en" }} [options]
 * @returns {Promise<{ destroy: () => void, chart: unknown, tally: () => object }>}
 */
export async function mountPenguinSteps(target, options = {}) {
  const root = typeof target === "string" ? document.querySelector(target) : target;
  if (!root) throw new Error("mountPenguinSteps: target not found");
  ensureStyle();
  root.classList.add("mvg-game", "penguin");
  const lang = gameLang(options.lang);
  const ui = COMMON[lang];
  const T = TEXT[lang];
  root.innerHTML = penguinMarkup(lang);
  const touch = isTouch();
  root.querySelector("#title .keys").innerHTML = [...titleKeys(lang, touch), ...(touch ? [] : [ui.keysPause])].map((k) => `<div>${k}</div>`).join("");
  if (touch) root.querySelector("#pause .sub").textContent = ui.resumeTouch;
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
  let alive = true;
  let raf = 0;
  let audio;
  let renderer;
  let resizeObserver;
  function destroy() {
    alive = false;
    cancelAnimationFrame(raf);
    ac.abort();
    resizeObserver?.disconnect();
    audio?.pause();
    awake.release();
    renderer?.dispose();
    root.replaceChildren();
    root.classList.remove("mvg-game", "penguin", "frozen", "fever");
    if (root.mvgGame) delete root.mvgGame;
    if (window.__game?.destroy === destroy) delete window.__game;
  }

  try {
    const tm = new Timing(analysis);
    retime(tm);
    tm.setDownbeat(SECTIONS.drop);
    const ev = songEvents(tm);
    const chart = buildChart(tm, ev);

    // ---------- renderer ----------
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.toneMapping = THREE.NoToneMapping;
    $("stage").appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#3a4fa0");
    const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 700);
    const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
    [new RenderPass(scene, camera), new OutputPass()].forEach((p) => composer.addPass(p));
    let view = { w: 1, h: 1 };
    function resize() {
      const rect = root.getBoundingClientRect();
      view = { w: Math.max(1, rect.width), h: Math.max(1, rect.height) };
      renderer.setSize(view.w, view.h, false);
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(view.w, view.h);
      camera.aspect = view.w / view.h;
    }
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(root);
    resize();

    // ---------- scene ----------
    const sky = makeSky();
    const stage = makeStage();
    const sea = makeSea();
    const lamps = makeLamps(12, STAGE_R - 0.55);
    const snow = makeSnow(900);
    scene.add(sky.mesh, stage.group, sea.mesh, makeBergs().group, lamps.group, snow.points);
    scene.add(new THREE.HemisphereLight("#e4eeff", "#8a9cc8", 1.0));
    const key = new THREE.DirectionalLight("#fff6ea", 1.4);
    key.position.set(-2.5, 5, 7);
    const rim = new THREE.DirectionalLight("#bff6ff", 0.8);
    rim.position.set(1, 3, -6);
    scene.add(key, rim);
    sky.uniforms.uAurora.value = 0.8;

    const crew = SLOTS.map((_, i) => {
      const p = new Penguin({ bow: i === 0, chick: i === CHICK, scale: i === 0 ? 1.06 : i === CHICK ? 0.66 : 0.86 + ((i * 37) % 10) / 70 });
      scene.add(p.group);
      return { p, joined: i === 0 ? 0 : Infinity, slip: -9, move: [-9, -9, -9, -9], hop: -9 };
    });
    const lead = crew[0];
    let spin = 0;
    let spread = 1;
    let spinTarget = 0;

    // ---------- HUD ----------
    $("crew").innerHTML = SLOTS.map(() => "<i></i>").join("");
    const crewDots = [...$("crew").children];
    const laneEls = [...$("lanes").querySelectorAll(".lane")];
    const band = $("hitband");
    const targetEl = laneEls[0].querySelector(".target");
    const pads = [...$("pads").children];
    const notePool = Array.from({ length: 28 }, () => {
      const el = document.createElement("div");
      el.className = "note";
      el.style.display = "none";
      return el;
    });
    let poolLane = notePool.map(() => -1);

    // ---------- audio clock ----------
    audio = new Audio(params.get("audio") || songAudioUrl(WORK));
    audio.preload = "auto";
    const clock = new AudioClock(audio);
    let offset = Number(localStorage.getItem("penguin-game-offset") || 0);
    const songTime = () => clock.now() + offset;
    await clock.ready();

    // ---------- state ----------
    let state = "title";
    let score = 0;
    let combo = 0;
    let maxCombo = 0;
    let hits = 0;
    let members = 1;
    const tally = { perfect: 0, great: 0, good: 0, miss: 0, wrong: 0, fever: 0, frozen: null };
    let lastCall = -1;
    let countdownShown = -1;
    let lastT = 0;
    let missCount = 0;
    const auto = params.has("auto");
    const loud = () => state === "play";
    const guard = backGuard({ signal, playing: () => state === "play", onBack: () => togglePause() });
    const firstNote = chart[0]?.t ?? SECTIONS.verse1;
    const calls = [
      { t: SECTIONS.drop, text: "WARM UP!", color: LANES[LEFT].color, sub: T.warm },
      ...CHORUSES.map((b) => ({ t: tm.cues[b].start - 0.6, text: "STEP, STEP!", color: LANES[RIGHT].color, sub: T.chorus })),
      { t: ev.freeze[0] - 0.05, text: "FREEZE!", color: "#2fb8f0", sub: T.freeze },
      { t: ev.rest[0], text: "REST", color: "#ff8a00", sub: T.rest },
      { t: ev.fever[0], text: "FEVER TIME!", color: LANES[FLAP].color, sub: T.fever },
    ];

    function reset() {
      for (const n of chart) Object.assign(n, { judged: false, result: null });
      score = combo = maxCombo = hits = missCount = 0;
      members = 1;
      Object.keys(tally).forEach((k) => (tally[k] = k === "frozen" ? null : 0));
      crew.forEach((c, i) => Object.assign(c, { joined: i === 0 ? 0 : Infinity, slip: -9, move: [-9, -9, -9, -9], hop: -9 }));
      spin = spinTarget = 0;
      lastCall = countdownShown = -1;
      $("lyric").dataset.cue = "";
      $("lyric").innerHTML = "";
      updateCrew();
      updateScore();
    }
    const mult = () => (combo >= 50 ? 4 : combo >= 25 ? 3 : combo >= 10 ? 2 : 1);
    function updateScore() {
      $("score").querySelector("b").textContent = score.toLocaleString("en-US");
      const cb = $("combo").querySelector("b");
      cb.textContent = combo;
      cb.classList.remove("bump");
      void cb.offsetWidth;
      if (combo) cb.classList.add("bump");
      $("combo").querySelector("em").textContent = `×${mult()}`;
    }
    function updateCrew(popAt = -1) {
      crewDots.forEach((d, i) => {
        d.classList.toggle("on", i < members);
        if (i === popAt) {
          d.classList.remove("pop");
          void d.offsetWidth;
          d.classList.add("pop");
        }
      });
    }
    function judgeText(text, color) {
      const j = $("judge");
      j.textContent = text;
      j.style.color = color;
      j.classList.remove("show");
      void j.offsetWidth;
      j.classList.add("show");
    }
    function slam(text, color, sub = "") {
      const b = $("band");
      b.innerHTML = `${text}${sub ? `<small>${sub}</small>` : ""}`;
      b.style.color = color;
      b.classList.remove("show");
      void b.offsetWidth;
      b.classList.add("show");
    }
    function flashPad(lane) {
      const el = pads[lane];
      el.classList.remove("hit");
      void el.offsetWidth;
      el.classList.add("hit");
    }

    const inWindow = (t, [a, b]) => t >= a && t < b;
    /** Every crew member copies a hit move a moment after the lead. */
    function dance(lane, t, all) {
      lead.move[lane] = t;
      if (!all) return;
      crew.forEach((c, i) => i && (c.move[lane] = t + i * 0.025));
    }

    function hit(n, t) {
      n.judged = true;
      n.at = t;
      const err = Math.abs(t - n.t);
      n.result = err <= PERFECT ? "perfect" : err <= GREAT ? "great" : "good";
      tally[n.result]++;
      hits++;
      combo++;
      maxCombo = Math.max(maxCombo, combo);
      let pts = { perfect: 300, great: 200, good: 100 }[n.result];
      if (n.word) pts = Math.round(pts * 1.5);
      score += pts * mult();
      dance(n.lane, t, true);
      if (n.lane === LEFT || n.lane === RIGHT) {
        const pair = chart.find((m) => m !== n && Math.abs(m.t - n.t) < 0.01 && (m.lane === LEFT || m.lane === RIGHT));
        if (pair) crew.forEach((c, i) => (c.hop = t + i * 0.025));
      }
      flashPad(n.lane);
      buzz(n.word ? 18 : 8);
      if (loud()) {
        if (n.lane === CLAP) sfx.stomp();
        else sfx.hit(n.lane * 2 + (n.word ? 5 : 0), n.result === "perfect");
        if (combo >= 10 && combo % 10 === 0) sfx.combo();
      }
      const want = Math.min(CREW_MAX, 1 + Math.floor(hits / PER_JOIN));
      if (want > members) {
        crew[members].joined = t;
        members = want;
        updateCrew(members - 1);
        slam("+1", "#ffffff", T.joined);
        if (loud()) sfx.collect(members);
      }
      const color = LANES[n.lane].color;
      if (n.result === "perfect") {
        judgeText(combo >= 10 && combo % 10 === 0 ? `${combo} COMBO!` : "PERFECT", color);
        band.classList.remove("perfect");
        void band.offsetWidth;
        band.classList.add("perfect");
      }
      else judgeText(n.result === "great" ? "GREAT" : "GOOD", "#ffffff");
      updateScore();
    }

    /** A pad press: hits the earliest open note on that pad; pressing while only other pads are due breaks the combo. */
    function press(lane, t) {
      lead.move[lane] = t;
      if (inWindow(t, ev.freeze)) {
        if (tally.frozen !== false) {
          tally.frozen = false;
          combo = 0;
          updateScore();
          judgeText(T.moved, "#ff3d5a");
          if (loud()) sfx.wrong();
          buzz(60);
        }
        return;
      }
      if (inWindow(t, ev.fever)) {
        tally.fever++;
        score += 50 * mult();
        spinTarget += Math.PI;
        dance(lane, t, true);
        flashPad(lane);
        buzz(6);
        if (loud()) sfx.tap(lane * 2 + (tally.fever % 5));
        if (tally.fever % 10 === 0) judgeText(`FEVER ×${tally.fever}`, LANES[lane].color);
        updateScore();
        return;
      }
      let other = null;
      for (const n of chart) {
        if (n.t > t + GOOD) break;
        if (n.judged || n.t < t - GOOD) continue;
        if (n.lane === lane) return hit(n, t);
        other ??= n;
      }
      if (!other) {
        if (loud()) sfx.tap(lane * 2);
        return;
      }
      if (loud()) sfx.wrong();
      buzz(40);
      tally.wrong++;
      combo = 0;
      judgeText(`✗ ${LANES[other.lane].label[lang]}`, "#ff6b8a");
      updateScore();
    }

    function sweep(t) {
      for (const n of chart) {
        if (n.t > t - GOOD) break;
        if (n.judged) continue;
        n.judged = true;
        n.at = t;
        n.result = "miss";
        tally.miss++;
        missCount++;
        crew[members > 1 ? 1 + (missCount % (members - 1)) : 0].slip = t;
        if (loud()) sfx.miss();
        if (combo >= 5) judgeText("MISS", "#c9d6ff");
        combo = 0;
        updateScore();
      }
      if (tally.frozen === null && t >= ev.freeze[1] && t < ev.freeze[1] + 1) {
        tally.frozen = true;
        score += 1000;
        judgeText(T.frozen, "#2fb8f0");
        if (loud()) sfx.combo();
        updateScore();
      }
    }

    function autopilot(t) {
      for (const n of chart) {
        if (n.t > t) break;
        if (!n.judged) press(n.lane, n.t);
      }
    }

    // ---------- input ----------
    const laneOfKey = new Map(LANES.flatMap((l, i) => l.keys.map((k) => [k, i])));
    window.addEventListener("keydown", (e) => {
      sfx.unlock();
      const k = e.key.toLowerCase();
      if (e.key === "Escape" || k === "p") togglePause();
      else if (k === "r" && state === "result") start();
      else if (e.key === "Enter" && state === "title") start();
      else if (laneOfKey.has(k)) {
        if (state === "title" && e.key === " ") start();
        else if (state === "play" && !e.repeat) {
          pads[laneOfKey.get(k)].classList.add("down");
          press(laneOfKey.get(k), songTime());
        }
      } else if (e.key === "[" || e.key === "]") {
        offset = Math.round((offset + (e.key === "]" ? 0.01 : -0.01)) * 100) / 100;
        localStorage.setItem("penguin-game-offset", String(offset));
        judgeText(`SYNC ${offset >= 0 ? "+" : ""}${Math.round(offset * 1000)} ms`, "#ffffff");
      } else return;
      e.preventDefault();
    }, { signal });
    window.addEventListener("keyup", (e) => {
      const k = e.key.toLowerCase();
      if (laneOfKey.has(k)) pads[laneOfKey.get(k)].classList.remove("down");
    }, { signal });
    $("pads").addEventListener("pointerdown", (e) => {
      sfx.unlock();
      const pad = e.target.closest(".pad");
      if (!pad || state !== "play") return;
      e.preventDefault();
      pad.classList.add("down");
      press(Number(pad.dataset.lane), songTime());
    }, { signal });
    for (const type of ["pointerup", "pointercancel", "pointerleave"]) {
      $("pads").addEventListener(type, (e) => e.target.closest(".pad")?.classList.remove("down"), { signal });
    }
    root.querySelectorAll("button").forEach((b) => b.addEventListener("pointerenter", () => sfx.hover(4), { signal }));
    $("pause").addEventListener("click", togglePause);
    $("start").addEventListener("click", start);
    $("again").addEventListener("click", start);

    function fullscreen() {
      if (!touch || document.fullscreenElement) return;
      document.documentElement.requestFullscreen?.({ navigationUI: "hide" }).then(() => screen.orientation?.lock?.("portrait")).catch(() => {});
    }
    function start() {
      reset();
      sfx.unlock();
      sfx.start();
      fullscreen();
      state = "play";
      guard.arm();
      awake.hold();
      ["title", "result", "pause"].forEach((id) => ($(id).hidden = true));
      $("hud").hidden = false;
      audio.muted = false;
      audio.currentTime = Number(params.get("start") || 0);
      audio.play();
      lastT = audio.currentTime;
      for (const n of chart) if (n.t < audio.currentTime) n.judged = true;
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
      audio.pause();
      awake.release();
      root.classList.remove("frozen", "fever");
      const acc = (tally.perfect + tally.great * 0.8 + tally.good * 0.5) / Math.max(1, chart.length);
      const grade = acc >= 0.95 ? "S" : acc >= 0.85 ? "A" : acc >= 0.7 ? "B" : acc >= 0.5 ? "C" : "D";
      const gradeColor = { S: "#fff6a0", A: "#3de8ff", B: "#7cff4f", C: "#ff8c42", D: "#ff3d7f" }[grade];
      $("grade").textContent = grade;
      $("grade").style.color = gradeColor;
      $("grade").style.textShadow = `0 4px 0 #1c2547, 0 0 40px ${gradeColor}`;
      $("final").textContent = ui.points(score.toLocaleString("en-US"));
      sfx.result(acc >= 0.7);
      $("stats").innerHTML = [
        ["PERFECT", tally.perfect],
        ["GREAT", tally.great],
        ["GOOD", tally.good],
        ["MISS", tally.miss],
        [T.wrongPad, tally.wrong],
        [T.crewRow, `${members} / ${CREW_MAX}`],
        [T.freezeRow, tally.frozen == null ? "—" : tally.frozen ? T.passed : T.failed],
        [T.feverRow, tally.fever],
        [ui.maxCombo, maxCombo],
        [ui.accuracy, `${(acc * 100).toFixed(1)}%`],
      ]
        .map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`)
        .join("");
      $("result").hidden = false;
    }

    // ---------- lyrics ----------
    function drawLyric(t) {
      const el = $("lyric");
      const at = tm.cueAt(t);
      const k = at ? String(at.index) : "";
      if (el.dataset.cue !== k) {
        el.dataset.cue = k;
        el.innerHTML = at ? at.cue.words.map((w) => `<span style="${WORD_COLORS[w.clean] ? `color:${WORD_COLORS[w.clean]}` : ""}">${w.text}</span>`).join(" ") : "";
      }
      if (!at) return;
      [...el.children].forEach((s, i) => s.classList.toggle("sung", at.cue.words[i].start <= t + 0.02));
    }

    // ---------- frame ----------
    const frameClock = new THREE.Clock();
    function frame() {
      if (!alive) return;
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, frameClock.getDelta());
      let t;
      if (state === "title") {
        t = ATTRACT[0] + ((performance.now() / 1000) % (ATTRACT[1] - ATTRACT[0]));
        if (t < lastT) for (const n of chart) Object.assign(n, { judged: false, result: null });
        members = CREW_MAX;
        crew.forEach((c) => (c.joined = -9));
        autopilot(t);
      } else {
        t = state === "play" ? songTime() : lastT;
        if (state === "play") {
          if (auto) autopilot(t);
          sweep(t);
          if (t >= SECTIONS.end || audio.ended) finish();
        }
      }
      lastT = t;
      render(t, dt);
    }

    const bump = (t, t0, d) => (t > t0 && t < t0 + d ? Math.sin((Math.PI * (t - t0)) / d) : 0);
    const since = (t, t0) => (t >= t0 ? t - t0 : 99);
    function posePenguin(c, i, t, frozen, rest) {
      const bf = tm.beatFloat(t) - i * 0.015;
      const s = Math.sin(Math.PI * bf);
      const sx = SLOTS[i][0] * spread;
      const sz = SLOTS[i][1];
      const p = { x: sx, z: sz, yaw: 0, hop: 0, tilt: 0, lean: 0, squash: 0, flapL: 0.15, flapR: 0.15, fwdL: 0, fwdR: 0, inL: 0, inR: 0, stepL: 0, stepR: 0, nod: 0, cock: Math.sin(t * 0.7 + i * 1.7) * 0.06, blink: bump(((t + i * 1.3) % (3.1 + (i % 4) * 0.5)), 0, 0.16) };
      const groove = frozen ? 0 : rest ? 0.2 : 0.8;
      p.hop += groove * 0.05 * Math.abs(s);
      p.tilt += groove * 0.09 * s;
      p.flapL += groove * 0.2 * Math.abs(s);
      p.flapR += groove * 0.2 * Math.abs(s);
      const [mL, mF, mC, mR] = c.move;
      p.stepL = Math.max(p.stepL, bump(t, mL - 0.02, 0.26) * 1.1);
      p.stepR = Math.max(p.stepR, bump(t, mR - 0.02, 0.26) * 1.1);
      p.tilt += 0.16 * (bump(t, mL - 0.02, 0.34) - bump(t, mR - 0.02, 0.34));
      p.squash += 0.4 * Math.exp(-since(t, Math.max(mL, mR) + 0.1) / 0.08);
      const flap = bump(t, mF - 0.02, 0.36);
      p.flapL += 1.8 * flap;
      p.flapR += 1.8 * flap;
      p.hop += 0.12 * flap;
      const clap = Math.exp(-(((since(t, mC) - 0.04) / 0.09) ** 2)) * (since(t, mC) < 0.4 ? 1 : 0);
      const clapArm = smooth(-0.1, 0, -since(t, mC) + 0.35) * (since(t, mC) < 0.5 ? 1 : 0);
      p.fwdL += 1.15 * clapArm;
      p.fwdR += 1.15 * clapArm;
      p.inL += 0.6 * clap;
      p.inR += 0.6 * clap;
      const jump = bump(t, c.hop - 0.05, 0.42);
      p.hop += 0.45 * jump;
      p.flapL += 1.2 * jump;
      p.flapR += 1.2 * jump;
      if (frozen) {
        p.flapL = 1.1 + (i % 3) * 0.3;
        p.flapR = 0.5 + (i % 2) * 0.8;
        p.stepL = i % 2 ? 0.6 : 0;
        p.tilt = i % 2 ? 0.16 : -0.16;
        p.blink = 0;
      }
      if (rest) {
        p.squash += 0.3;
        p.blink = Math.max(p.blink, 0.6);
      }
      // Slip on the ice after a miss.
      const sl = since(t, c.slip);
      if (sl < 0.7) {
        const k = Math.sin((sl / 0.7) * Math.PI);
        p.tilt += (i % 2 ? 1 : -1) * 0.9 * k;
        p.flapL += 1.4 * k;
        p.flapR += 1.4 * k;
        p.x += (i % 2 ? 1 : -1) * 0.25 * k;
        p.blink = Math.max(p.blink, 0.8 * k);
      }
      // Belly slide in when joining the crew.
      const j = since(t, c.joined);
      if (j < 1.2) {
        const side = sx === 0 ? 1 : Math.sign(sx);
        const u = easeOutCubic(j / 0.85);
        const stand = smooth(0.85, 1.15, j);
        p.x = lerp(side * 9, sx, u);
        p.z = lerp(sz - 2, sz, u);
        p.yaw = lerp(Math.atan2(sx - side * 9, 2), 0, stand);
        p.lean = lerp(1.35, 0, stand);
        p.hop = 0.28 * (1 - stand) + 0.3 * bump(j, 0.85, 0.35);
        p.fwdL = p.fwdR = lerp(-0.7, 0, stand);
      }
      return p;
    }

    function render(t, dt) {
      const kick = tm.pulse(t, 0.12);
      const bf = tm.beatFloat(t);
      const frozen = state !== "title" && inWindow(t, ev.freeze);
      const rest = inWindow(t, ev.rest);
      const fever = inWindow(t, ev.fever);
      root.classList.toggle("frozen", frozen && state === "play");
      root.classList.toggle("fever", fever && state === "play");
      const chorus = CHORUSES.some((b) => t >= tm.cues[b].start - 0.6 && t < tm.cues[b + 4].end + 0.3);

      // Camera: the crew stands in the upper part of the screen, above the highway.
      const portrait = camera.aspect < 0.9;
      const sway = Math.sin(t * 0.25) * 0.6;
      if (portrait) {
        camera.position.set(sway * 0.5, 3.6, 10.2);
        camera.lookAt(0, -0.9, -0.3);
        camera.fov = 46 - kick * 0.8;
      } else {
        camera.position.set(sway, 3.4, 9.6);
        camera.lookAt(0, -1.5, -0.4);
        camera.fov = 36 - kick * 0.6;
      }
      camera.updateProjectionMatrix();
      spread = portrait ? 0.72 : 1;
      for (const l of lamps.lamps) l.holder.scale.setScalar(Math.max(0.0001, smooth(5.5, 8.5, l.holder.position.distanceTo(camera.position))));

      spin += (spinTarget - spin) * Math.min(1, dt * 9);
      crew.forEach((c, i) => {
        const on = i < members && t >= c.joined - 0.02;
        c.p.group.visible = on;
        if (!on) return;
        const p = posePenguin(c, i, t, frozen, rest);
        if (i === 0) p.yaw += spin;
        c.p.pose(p);
      });

      // Stage, lamps, sky.
      const st = stage.uniforms;
      st.uTime.value = t;
      st.uBeat.value = bf;
      st.uPulse.value = kick;
      st.uDisco.value = fever ? 1.3 : chorus ? 0.9 : rest ? 0 : 0.3;
      st.uHue.value = t * 0.02;
      st.uFreeze.value = frozen ? 0.8 : 0;
      const spots = st.uSpots.value;
      spots.forEach((s) => s.set(0, 0, 0, 0));
      crew.forEach((c, i) => {
        if (i >= members) return;
        const last = Math.max(...c.move);
        const e = Math.exp(-since(t, last) / 0.3);
        spots[i].set(SLOTS[i][0] * spread, SLOTS[i][1], e, new THREE.Color(LAMP_HUES[i % LAMP_HUES.length]).getHSL({}).h);
      });
      lamps.lamps.forEach((l, i) => {
        const base = new THREE.Color(LAMP_HUES[i % LAMP_HUES.length]);
        let k = 1 + (chorus || fever ? kick : kick * 0.3);
        if (fever && Math.floor(bf) % 12 === i) k += 1.5;
        l.mat.color.copy(base).multiplyScalar(0.55 + Math.min(1, k) * 0.45);
        l.halo.material.color.copy(base).multiplyScalar(Math.min(1.2, k * 0.35));
        l.gem.rotation.y = t * 0.8 + i;
      });
      sky.uniforms.uTime.value = t;
      sky.uniforms.uPulse.value = chorus || fever ? kick : 0;
      sky.uniforms.uRainbow.value = fever ? 0.7 : 0;
      sea.uniforms.uTime.value = t;
      snow.uniforms.uT.value = t;
      snow.uniforms.uCenter.value.set(0, 1.5, 0);
      composer.render();
      if (state !== "title") hudFrame(t, kick);
    }

    /** Notes fall down their lane and sit exactly on their dashed target, in the gold band, as they are due. */
    function drawNotes(t, kick) {
      const h = laneEls[0].clientHeight;
      const noteH = targetEl.offsetHeight;
      const travel = h - noteH - 10;
      band.style.height = `${noteH + 12}px`;
      $("lanes").style.setProperty("--kick", kick.toFixed(3));
      const lit = [0, 0, 0, 0];
      let ni = 0;
      for (const n of chart) {
        const ahead = n.t - t;
        if (ahead > LEAD) break;
        const gone = n.judged ? t - (n.at ?? n.t) : 0;
        if (n.judged && (gone > 0.25 || gone < 0)) continue;
        if (!n.judged && ahead < -GOOD) continue;
        if (ahead < 0.25 && !n.judged) lit[n.lane] = 1;
        if (ni >= notePool.length) break;
        const el = notePool[ni];
        if (poolLane[ni] !== n.lane) {
          laneEls[n.lane].appendChild(el);
          poolLane[ni] = n.lane;
          el.style.setProperty("--c", LANES[n.lane].color);
          el.innerHTML = ICONS[LANES[n.lane].id];
        }
        ni++;
        const cls = `note${n.word ? " word" : ""}${n.result === "miss" ? " miss" : ""}`;
        if (el.className !== cls) el.className = cls;
        el.style.display = "";
        const done = n.judged && n.result !== "miss";
        const y = done ? 0 : (Math.max(ahead, -GOOD) / LEAD) * travel;
        const scale = done ? 1 + gone * 2.4 : 1;
        el.style.transform = `translate(-50%, ${-y}px) scale(${scale})`;
        el.style.opacity = n.judged ? String(1 - gone / 0.25) : String(smooth(LEAD, LEAD - 0.25, ahead));
      }
      for (; ni < notePool.length; ni++) notePool[ni].style.display = "none";
      laneEls.forEach((el, i) => el.classList.toggle("lit", !!lit[i]));
    }

    function hudFrame(t, kick) {
      $("progress").firstElementChild.style.width = `${clamp(t / SECTIONS.end, 0, 1) * 100}%`;
      drawNotes(t, kick);
      drawLyric(t);
      if (state !== "play") return;
      const c = calls.findLast((x) => x.t <= t);
      if (c && c.t !== lastCall && t - c.t < 0.5) {
        lastCall = c.t;
        slam(c.text, c.color, c.sub);
      }
      const left = tm.beatIndexAt(firstNote) - tm.beatIndexAt(t);
      if (left >= 1 && left <= 3 && countdownShown !== left) {
        countdownShown = left;
        slam(String(left), "#ffffff");
        sfx.count(left);
      }
    }

    $("start").disabled = false;
    $("start").textContent = ui.start;
    if (params.has("play")) start();
    frame();
    const api = { chart, tally: () => ({ ...tally, score, combo, maxCombo, members }), destroy };
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
