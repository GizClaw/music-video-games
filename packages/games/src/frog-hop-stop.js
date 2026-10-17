import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { Timing, clamp, hash, lerp, smooth } from "@gizclaw/mvg-core/timing.js";
import { AudioClock, glowTexture, songAudioUrl } from "./kit.js";
import { COMMON, gameLang } from "./lang.js";
import { backGuard, buzz, isTouch, lockGestures, wakeLock } from "./mobile.js";
import { sfx } from "./sfx.js";
import analysis from "./frog/analysis.json";
import { Frog } from "./frog/frog.js";
import { makeBanks, makeClouds, makeLotus, makePad, makeReeds, makeSky, makeWater } from "./frog/pond.js";
import { CHORUSES, COLORS, FREEZE_CUE, RETIME, SECTIONS, WORD_COLORS } from "./frog/song.js";
import { ICONS, LANE_COLORS, frogMarkup, frogStyle, titleKeys } from "./frog/style.js";

const TEXT = {
  zh: {
    warm: "音符落到圆按钮上时按下",
    hold: "按住……唱 stop 时松手！",
    freeze: "别动！一下都别按",
    frozen: "定住了！",
    moved: "动了！",
    wrong: "按错啦",
    soon: "松早了",
    late: "该松手啦",
    joined: "小青蛙跟上来了！",
    stopped: "停得好！",
    crewRow: "青蛙队伍",
    holdRow: "蹲低停住",
    freezeRow: "木头人",
    passed: "成功",
    failed: "动了",
  },
  en: {
    warm: "Press a button as a note lands on it",
    hold: "Hold… let go on stop!",
    freeze: "Don't move! No presses at all",
    frozen: "Frozen!",
    moved: "You moved!",
    wrong: "Wrong button",
    soon: "Let go too soon",
    late: "Let go!",
    joined: "A little frog joins!",
    stopped: "Nice stop!",
    crewRow: "Frog crew",
    holdRow: "Bend and stop",
    freezeRow: "Freeze",
    passed: "held",
    failed: "moved",
  },
};

const WORK = "songs/music/animal-dance-en/en-us/frog-hop-stop";
const LEAD = 1.6; // seconds a note takes to fall onto its button
const PERFECT = 0.07;
const GREAT = 0.12;
const GOOD = 0.18;
const CREW_MAX = 8;
const PER_JOIN = 10;
const HOP_TIME = 0.32;
const PAD_X = [1.15, 1.55]; // spacing of the three stage pads on phones and on wide screens
const ATTRACT = [SECTIONS.chorus1, SECTIONS.verse2];
const KEYS = {
  arrowleft: 0, a: 0,
  arrowup: 1, arrowdown: 1, " ": 1, w: 1, s: 1,
  arrowright: 2, d: 2,
};
/** On wide screens the crew dances in two rows behind the stage: [x, z]. */
const SLOTS = [[-2.4, -1.9], [2.4, -1.9], [-0.8, -2.0], [0.8, -2.0], [-3.4, -3.4], [3.4, -3.4], [-1.2, -3.6], [1.2, -3.6]];
/** Frogs that dance with the lead from the start on wide screens; the rest join as you play. */
const SQUAD = 3;

let styleMounted = false;
function ensureStyle() {
  if (styleMounted) return;
  const el = document.createElement("style");
  el.dataset.mvg = "frog-hop-stop";
  el.textContent = frogStyle;
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

function beatAt(tm, b) {
  const i = Math.floor(b);
  return lerp(tm.beatTime(i), tm.beatTime(i + 1), b - i);
}

/**
 * Three lanes: left (0), middle (1) and right (2). Every chorus's "Bend down
 * low, then gently stop!" is a middle hold from "Bend" to "stop". Sung words
 * are notes: ribbits and the spring words alternate left and right, "hey,
 * hey, hey" runs left, middle, right, "Hop!", push and leap are big middle
 * notes, "one" and "two" are left then right, and each "hooray" is a big
 * left-and-right chord. Notes snap to the half-beat grid and keep at least
 * 0.3 s apart. Fillers keep the beat where nothing is sung within three
 * quarters of a beat: every beat in the choruses (left, middle, right,
 * middle), every other beat elsewhere (left, right). Nothing falls from
 * "freeze" through the slow breathing, or after the last hop.
 */
function buildChart(tm, ev) {
  const snap = (t) => beatAt(tm, Math.round(tm.beatFloat(t) * 2) / 2);
  const holds = CHORUSES.map((b) => {
    const c = tm.cues[b + 1];
    return [{ t: snap(c.words[0].start), end: snap(c.words.at(-1).start), lane: 1, kind: "hold" }];
  });
  const inHold = (t, pad = 0.35) => holds.some(([h]) => t > h.t - pad && t < h.end + pad);
  const quiet = (t) => (t >= ev.freeze[0] - 0.3 && t < ev.calm) || t > ev.last + 0.3 || t < SECTIONS.drop;
  const groups = [];
  let side = 0;
  tm.cues.forEach((c) => {
    let hey = 0;
    c.words.forEach((w) => {
      const k = w.clean;
      if (quiet(w.start) || inHold(w.start)) return;
      const t = w.start;
      if (k === "hooray") groups.push([{ t, lane: 0, kind: "big" }, { t, lane: 2, kind: "big" }]);
      else if (k === "hey") groups.push([{ t, lane: hey++ % 3, kind: "big" }]);
      else if (["hop", "push", "leap"].includes(k)) groups.push([{ t, lane: 1, kind: "big" }]);
      else if (k === "one") groups.push([{ t, lane: 0, kind: "hop" }]);
      else if (k === "two") groups.push([{ t, lane: 2, kind: "hop" }]);
      else if (k === "ribbit") groups.push([{ t, lane: side++ % 2 ? 2 : 0, kind: "ribbit" }]);
      else if (["hops", "spring", "jumps", "land", "flight"].includes(k)) groups.push([{ t, lane: side++ % 2 ? 2 : 0, kind: "hop" }]);
    });
  });
  const kept = [...holds];
  for (const g of groups.sort((a, b) => a[0].t - b[0].t)) {
    const t = snap(g[0].t);
    const prev = kept.filter((h) => h[0].kind !== "hold").at(-1);
    if (prev && t - prev[0].t < 0.3) continue;
    kept.push(g.map((n) => ({ ...n, t })));
  }
  const inChorus = (t) => CHORUSES.some((b) => t >= tm.cues[b].start - 0.5 && t < tm.cues[b + 4].end + 0.3);
  const first = tm.beatIndexAt(SECTIONS.drop + 0.01);
  for (let i = first; i < tm.beats.length; i++) {
    const bt = tm.beatTime(i);
    if (quiet(bt) || inHold(bt, 0.5)) continue;
    const chorus = inChorus(bt);
    if (!chorus && (i - first) % 2) continue;
    if (kept.some(([n]) => Math.abs(tm.beatFloat(n.t) - i) < 0.75 || (n.kind === "hold" && Math.abs(tm.beatFloat(n.end) - i) < 0.75))) continue;
    const lane = chorus ? [0, 1, 2, 1][(i - first) % 4] : ((i - first) / 2) % 2 ? 2 : 0;
    kept.push([{ t: bt, lane, kind: "hop" }]);
  }
  return kept
    .flat()
    .sort((a, b) => a.t - b.t || a.lane - b.lane)
    .map((n) => ({ ...n, judged: false, result: null, tail: null }));
}

/**
 * Mount Frog Hop Stop into `target` (an element or a selector): three lanes
 * of notes fall onto three round buttons, and the frog hops between three
 * lily pads on the stage above. `options.audio`, `options.start`,
 * `options.play` and `options.auto` override the page query;
 * `options.backHref` shows a link back to a gallery; `options.lang` (`zh` or
 * `en`) picks the language.
 * @param {Element | string} target
 * @param {{ audio?: string, start?: number | string, play?: boolean, auto?: boolean, backHref?: string, search?: string, lang?: "zh" | "en" }} [options]
 * @returns {Promise<{ destroy: () => void, chart: unknown, tally: () => object }>}
 */
export async function mountFrogHopStop(target, options = {}) {
  const root = typeof target === "string" ? document.querySelector(target) : target;
  if (!root) throw new Error("mountFrogHopStop: target not found");
  ensureStyle();
  root.classList.add("mvg-game", "frog");
  const lang = gameLang(options.lang);
  const ui = COMMON[lang];
  const T = TEXT[lang];
  root.innerHTML = frogMarkup(lang);
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
    root.classList.remove("mvg-game", "frog", "frozen");
    if (root.mvgGame) delete root.mvgGame;
    if (window.__game?.destroy === destroy) delete window.__game;
  }

  try {
    const tm = new Timing(analysis);
    retime(tm);
    tm.setDownbeat(SECTIONS.drop);
    const fc = tm.cues[FREEZE_CUE];
    const ev = {
      freeze: [fc.words[2].start, tm.cues[FREEZE_CUE + 1].words[0].start],
      calm: SECTIONS.chorus3 - 1.2,
      last: tm.cues.at(-1).words.at(-1).start,
    };
    const chart = buildChart(tm, ev);

    // ---------- renderer ----------
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.toneMapping = THREE.NoToneMapping;
    $("stage").appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#ffb38a");
    const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 700);
    const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
    [new RenderPass(scene, camera), new OutputPass()].forEach((p) => composer.addPass(p));
    function resize() {
      const rect = root.getBoundingClientRect();
      const w = Math.max(1, rect.width);
      const h = Math.max(1, rect.height);
      renderer.setSize(w, h, false);
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(w, h);
      camera.aspect = w / h;
    }
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(root);
    resize();

    // ---------- scene: a stage of three lily pads ----------
    const sky = makeSky({ sun: 0.06 });
    const water = makeWater();
    scene.add(sky.mesh, water.mesh, makeClouds(), makeBanks());
    const hemi = new THREE.HemisphereLight("#fff0f4", "#7aa6c8", 1.05);
    const key = new THREE.DirectionalLight("#fff1e0", 1.4);
    key.position.set(-3, 6, 7);
    const rim = new THREE.DirectionalLight("#ffb07a", 0.9);
    rim.position.set(2, 3, -8);
    scene.add(hemi, key, rim);
    let padX = PAD_X[1];
    const laneX = (lane) => (lane - 1) * padX;
    const stagePads = [0, 1, 2].map((lane) => {
      const p = makePad(0.68, lane * 2.1 + 0.4);
      p.position.set(laneX(lane), 0, 0);
      scene.add(p);
      return p;
    });
    const slotPads = SLOTS.map(([x, z], i) => {
      const p = makePad(0.62, hash(i * 5) * 6.28);
      p.position.set(x, 0, z);
      scene.add(p);
      return p;
    });
    [[-5.2, -2.6, 7], [5.4, -2.2, 6], [-4.4, 1.6, 5], [4.6, 1.4, 6], [-1.8, -5.6, 6], [2.6, -5.4, 5]].forEach(([x, z, n], i) => {
      const r = makeReeds(n, i * 13);
      r.group.position.set(x, 0, z);
      scene.add(r.group);
    });
    [[-3.6, 0.6, 1.1], [3.7, 0.4, 1.0], [-4.6, -4.2, 1.2], [4.4, -4.6, 1.0]].forEach(([x, z, s]) => {
      const pad = makePad(0.8 * s, x);
      pad.position.set(x, 0, z);
      const l = makeLotus(s);
      l.position.set(x + 0.15, 0.04, z + 0.1);
      scene.add(pad, l);
    });
    const lead = new Frog({ crown: true, scale: 1.0 });
    scene.add(lead.group);
    const crew = Array.from({ length: CREW_MAX }, (_, i) => {
      const f = new Frog({ tone: (i % 3) + 1, scale: 0.8 + hash(i * 5.1) * 0.12 });
      scene.add(f.group);
      return f;
    });

    // Bursts: splashes on landings, gold stars on perfects, petals on big notes.
    const SPARKS = 900;
    const sparkGeo = new THREE.BufferGeometry();
    sparkGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(SPARKS * 3), 3));
    sparkGeo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(SPARKS * 3), 3));
    const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ size: 0.11, map: glowTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    sparks.frustumCulled = false;
    scene.add(sparks);
    const FLIES = 120;
    const flyGeo = new THREE.BufferGeometry();
    flyGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(FLIES * 3), 3));
    const flies = new THREE.Points(flyGeo, new THREE.PointsMaterial({ size: 0.16, map: glowTexture(), color: "#ffe680", transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    flies.frustumCulled = false;
    scene.add(flies);
    const bursts = [];
    const BURST = {
      splash: { colors: ["#ffffff", "#bff4ff", "#7fe0ff"], count: 28, speed: 1.3, life: 0.6, gravity: 3.2, up: 1.6 },
      plop: { colors: ["#ffffff", "#bff4ff", "#7fe0ff"], count: 60, speed: 1.8, life: 0.8, gravity: 3.6, up: 2.4 },
      star: { colors: ["#fff3a0", "#ffd23f", "#ffffff"], count: 36, speed: 1.6, life: 0.55, gravity: 0.4, up: 0.6 },
      petal: { colors: ["#ff9cc4", "#ffd2e4", "#ffd23f", "#ffffff"], count: 80, speed: 2.4, life: 1.1, gravity: 1.2, up: 1.4 },
    };
    const burst = (kind, x, y, z, t) => {
      bursts.push({ ...BURST[kind], x, y, z, t0: t, seed: bursts.length * 7.3 + t });
      if (bursts.length > 24) bursts.shift();
    };

    // ---------- HUD ----------
    $("crew").innerHTML = Array.from({ length: CREW_MAX + 1 }, () => "<i></i>").join("");
    const crewDots = [...$("crew").children];
    const lanesEl = $("lanes");
    const laneEls = [...lanesEl.children];
    const buttons = laneEls.map((l) => l.querySelector(".fbtn"));
    const makeEl = (parent, cls) => {
      const el = document.createElement("div");
      el.className = cls;
      el.style.display = "none";
      parent.appendChild(el);
      return el;
    };
    const notePools = laneEls.map((l) => Array.from({ length: 10 }, () => makeEl(l, "fnote")));
    const bar = makeEl(laneEls[1], "fbar");
    const tail = makeEl(laneEls[1], "ftail");
    tail.innerHTML = ICONS.stop;
    tail.style.setProperty("--c", "#ffffff");

    // ---------- audio clock ----------
    audio = new Audio(params.get("audio") || songAudioUrl(WORK));
    audio.preload = "auto";
    const clock = new AudioClock(audio);
    let offset = Number(localStorage.getItem("frog-game-offset") || 0);
    const songTime = () => clock.now() + offset;
    await clock.ready();

    // ---------- state ----------
    let state = "title";
    let score = 0;
    let combo = 0;
    let maxCombo = 0;
    let hits = 0;
    let members = 0;
    const hop = { from: 1, to: 1, at: -9, big: false, splash: false };
    let shakeAt = -9;
    let holding = null;
    let holdStart = -9;
    let stopAt = -9;
    const flashAt = [-9, -9, -9];
    const joined = Array(CREW_MAX).fill(Infinity);
    const tally = { perfect: 0, great: 0, good: 0, miss: 0, wrong: 0, stops: 0, frozen: null };
    let lastCall = -1;
    let countdownShown = -1;
    let lastT = 0;
    const auto = params.has("auto");
    const loud = () => state === "play";
    const guard = backGuard({ signal, playing: () => state === "play", onBack: () => togglePause() });
    const firstNote = chart[0]?.t ?? SECTIONS.verse1;
    const calls = [
      { t: SECTIONS.drop, text: "HOP!", color: COLORS.hop, sub: T.warm },
      ...CHORUSES.map((b) => ({ t: tm.cues[b + 1].start - 0.5, text: "BEND DOWN LOW", color: COLORS.hold, sub: T.hold })),
      { t: ev.freeze[0] - 0.05, text: "FREEZE!", color: COLORS.stop, sub: T.freeze },
    ];

    function reset() {
      for (const n of chart) Object.assign(n, { judged: false, result: null, tail: null, at: undefined });
      score = combo = maxCombo = hits = members = 0;
      Object.assign(hop, { from: 1, to: 1, at: -9, big: false, splash: false });
      shakeAt = holdStart = stopAt = -9;
      flashAt.fill(-9);
      holding = null;
      bursts.length = 0;
      joined.fill(Infinity);
      Object.keys(tally).forEach((k) => (tally[k] = k === "frozen" ? null : 0));
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
        d.classList.toggle("on", i <= members);
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
    const grade = (err) => (err <= PERFECT ? "perfect" : err <= GREAT ? "great" : "good");
    function credit(result, t, big, lane) {
      tally[result]++;
      hits++;
      combo++;
      maxCombo = Math.max(maxCombo, combo);
      score += Math.round({ perfect: 300, great: 200, good: 100 }[result] * (big ? 1.5 : 1)) * mult();
      if (result === "perfect") {
        const b = buttons[lane];
        b.classList.remove("perfect");
        void b.offsetWidth;
        b.classList.add("perfect");
      }
      const want = Math.min(CREW_MAX, Math.floor(hits / PER_JOIN));
      if (want > members) {
        joined[members] = t;
        members = want;
        updateCrew(members);
        slam("+1", "#ffffff", T.joined);
        if (loud()) sfx.collect(members);
      }
      if (combo >= 10 && combo % 10 === 0 && loud()) sfx.combo();
      judgeText(result === "perfect" ? (combo >= 10 && combo % 10 === 0 ? `${combo} COMBO!` : "PERFECT") : result.toUpperCase(), result === "perfect" ? COLORS.big : "#ffffff");
      updateScore();
    }
    /** The frog hops onto the pad of `lane` (a chord jumps up in place), or splashes in on a miss. */
    function hopTo(lane, t, { big = false, splash = false } = {}) {
      const from = currentLane(t);
      Object.assign(hop, { from, to: lane, at: t, big, splash });
      const x = laneX(lane);
      if (splash) {
        burst("plop", x, 0.05, 0.3, t + HOP_TIME * 0.6);
        shakeAt = t + HOP_TIME * 0.6;
      } else burst("splash", x, 0.05, 0, t + HOP_TIME);
    }
    const currentLane = (t) => (t - hop.at < HOP_TIME * 0.5 ? hop.from : hop.to);

    function hit(n, t) {
      n.judged = true;
      n.at = t;
      n.result = grade(Math.abs(t - n.t));
      flashAt[n.lane] = t;
      if (n.kind === "hold") {
        holding = n;
        holdStart = t;
        hopTo(1, t);
        judgeText(T.hold, COLORS.hold);
        if (loud()) sfx.press();
        buzz(10);
        credit(n.result, t, true, 1);
        return;
      }
      const big = n.kind === "big";
      credit(n.result, t, big, n.lane);
      const chord = chart.some((m) => m !== n && m.t === n.t);
      const partnerDone = chord && chart.some((m) => m !== n && m.t === n.t && m.judged && m.result !== "miss");
      if (chord) {
        if (!partnerDone) hopTo(currentLane(t), t, { big: true });
      } else hopTo(n.lane, t, { big });
      if (n.result === "perfect") burst("star", laneX(n.lane), 0.8, 0, t + HOP_TIME);
      if (big && !partnerDone) {
        burst("petal", chord ? laneX(currentLane(t)) : laneX(n.lane), 1.1, 0, t + HOP_TIME * 0.6);
        shakeAt = t + HOP_TIME;
      }
      buzz(big ? 18 : 8);
      if (loud()) (big ? sfx.stomp() : sfx.hit(n.lane * 2 + 2, n.result === "perfect"));
    }

    function press(lane, t) {
      if (t >= ev.freeze[0] && t < ev.freeze[1]) {
        if (tally.frozen !== false) {
          tally.frozen = false;
          combo = 0;
          updateScore();
          judgeText(T.moved, COLORS.stop);
          if (loud()) sfx.wrong();
          buzz(60);
        }
        return;
      }
      let other = false;
      for (const n of chart) {
        if (n.t > t + GOOD) break;
        if (n.judged || n.t < t - GOOD) continue;
        if (n.lane === lane) return hit(n, t);
        other = true;
      }
      if (other) {
        tally.wrong++;
        if (combo) judgeText(T.wrong, "#c9d6ff");
        combo = 0;
        updateScore();
        if (loud()) sfx.wrong();
        return;
      }
      if (loud()) sfx.tap(lane * 2 + 1);
    }

    function release(lane, t) {
      if (!holding || lane !== 1) return;
      const n = holding;
      holding = null;
      const err = t - n.end;
      if (Math.abs(err) <= GOOD) {
        n.tail = grade(Math.abs(err));
        tally.stops++;
        stopAt = t;
        credit(n.tail, t, true, 1);
        slam("STOP!", COLORS.stop, T.stopped);
        if (loud()) sfx.stamp();
        buzz(20);
      } else {
        n.tail = "miss";
        tally.miss++;
        combo = 0;
        updateScore();
        judgeText(T.soon, "#c9d6ff");
        if (loud()) sfx.miss();
      }
    }

    function sweep(t) {
      for (const n of chart) {
        if (n.t > t - GOOD) break;
        if (n.judged) continue;
        n.judged = true;
        n.at = t;
        n.result = "miss";
        if (n.kind === "hold") n.tail = "miss";
        tally.miss++;
        if (loud()) sfx.miss();
        if (combo >= 5) judgeText("MISS", "#c9d6ff");
        combo = 0;
        updateScore();
        hopTo(n.lane, t, { splash: true });
      }
      if (holding && t > holding.end + GOOD) {
        const n = holding;
        holding = null;
        n.tail = "miss";
        tally.miss++;
        combo = 0;
        updateScore();
        judgeText(T.late, "#c9d6ff");
      }
      if (tally.frozen === null && t >= ev.freeze[1] && t < ev.freeze[1] + 1) {
        tally.frozen = true;
        score += 1000;
        judgeText(T.frozen, COLORS.ribbit);
        if (loud()) sfx.combo();
        updateScore();
      }
    }

    function autopilot(t) {
      if (holding && t >= holding.end) release(1, holding.end);
      for (const n of chart) {
        if (n.t > t) break;
        if (!n.judged) press(n.lane, n.t);
      }
    }

    // ---------- input ----------
    const down = [new Set(), new Set(), new Set()];
    function pressDown(lane, id) {
      if (state !== "play") return;
      const first = down[lane].size === 0;
      down[lane].add(id);
      buttons[lane].classList.add("down");
      if (first) press(lane, songTime());
    }
    function pressUp(lane, id) {
      if (!down[lane].delete(id) || down[lane].size) return;
      buttons[lane].classList.remove("down");
      if (state === "play") release(lane, songTime());
    }
    window.addEventListener("keydown", (e) => {
      sfx.unlock();
      const k = e.key.toLowerCase();
      if (e.key === "Escape" || (k === "p" && state !== "play")) togglePause();
      else if (k === "r" && state === "result") start();
      else if ((e.key === "Enter" || e.key === " ") && state === "title") start();
      else if (e.key === "[" || e.key === "]") {
        offset = Math.round((offset + (e.key === "]" ? 0.01 : -0.01)) * 100) / 100;
        localStorage.setItem("frog-game-offset", String(offset));
        judgeText(`SYNC ${offset >= 0 ? "+" : ""}${Math.round(offset * 1000)} ms`, "#ffffff");
      } else if (k in KEYS && state === "play") {
        if (!e.repeat) pressDown(KEYS[k], `k:${k}`);
      } else return;
      e.preventDefault();
    }, { signal });
    window.addEventListener("keyup", (e) => {
      const k = e.key.toLowerCase();
      if (k in KEYS) pressUp(KEYS[k], `k:${k}`);
    }, { signal });
    buttons.forEach((b, lane) => {
      b.addEventListener("pointerdown", (e) => {
        sfx.unlock();
        if (state !== "play") return;
        e.preventDefault();
        b.setPointerCapture?.(e.pointerId);
        pressDown(lane, e.pointerId);
      }, { signal });
      for (const type of ["pointerup", "pointercancel"]) b.addEventListener(type, (e) => pressUp(lane, e.pointerId), { signal });
    });
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
      for (const n of chart) {
        if (n.t >= audio.currentTime) break;
        n.judged = true;
        n.tail = n.kind === "hold" ? "skip" : null;
      }
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
      root.classList.remove("frozen");
      const total = chart.length + chart.filter((n) => n.kind === "hold").length;
      const acc = (tally.perfect + tally.great * 0.8 + tally.good * 0.5) / Math.max(1, total);
      const g = acc >= 0.95 ? "S" : acc >= 0.85 ? "A" : acc >= 0.7 ? "B" : acc >= 0.5 ? "C" : "D";
      const gradeColor = { S: "#fff6a0", A: "#3de8ff", B: "#7cff4f", C: "#ff8c42", D: "#ff3d7f" }[g];
      $("grade").textContent = g;
      $("grade").style.color = gradeColor;
      $("grade").style.textShadow = `0 4px 0 #1c2547, 0 0 40px ${gradeColor}`;
      $("final").textContent = ui.points(score.toLocaleString("en-US"));
      sfx.result(acc >= 0.7);
      $("stats").innerHTML = [
        ["PERFECT", tally.perfect],
        ["GREAT", tally.great],
        ["GOOD", tally.good],
        ["MISS", tally.miss],
        [T.holdRow, `${tally.stops} / ${CHORUSES.length}`],
        [T.crewRow, `${members + 1} / ${CREW_MAX + 1}`],
        [T.freezeRow, tally.frozen == null ? "—" : tally.frozen ? T.passed : T.failed],
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
      frameClock.getDelta();
      let t;
      if (state === "title") {
        t = ATTRACT[0] + ((performance.now() / 1000) % (ATTRACT[1] - ATTRACT[0]));
        if (t < lastT) {
          reset();
          members = CREW_MAX;
          joined.fill(-9);
          for (const n of chart) {
            if (n.t >= t) break;
            n.judged = true;
          }
        }
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
      render(t);
    }

    const bump = (t, t0, d) => (t > t0 && t < t0 + d ? Math.sin((Math.PI * (t - t0)) / d) : 0);
    const since = (t, t0) => (t >= t0 ? t - t0 : 99);

    /** Where the lead is: hopping between lane pads, or dipping into the water and climbing back on a miss. */
    function leadPos(t) {
      const age = since(t, hop.at);
      const x1 = laneX(hop.from);
      const x2 = laneX(hop.to);
      if (hop.splash) {
        if (age < HOP_TIME) {
          const u = age / HOP_TIME;
          return { x: lerp(x1, x2, u), y: Math.sin(u * Math.PI) * 0.45 - u * 0.65, z: lerp(0, 0.35, u), u, air: true, wet: true };
        }
        const k = smooth(HOP_TIME + 0.15, HOP_TIME + 0.6, age);
        return { x: x2, y: lerp(-0.65, 0, k) + bump(age, HOP_TIME + 0.45, 0.25) * 0.15, z: lerp(0.35, 0, k), u: 1, air: k < 1, wet: k < 1 };
      }
      const u = clamp(age / HOP_TIME, 0, 1);
      if (u >= 1 || hop.at < -1) return { x: x2, y: 0, z: 0, u: 1, air: false };
      const h = hop.big ? 0.95 : hop.from === hop.to ? 0.35 : 0.6;
      return { x: lerp(x1, x2, u), y: Math.sin(u * Math.PI) * h, z: 0, u, air: true };
    }

    function render(t) {
      const kick = tm.pulse(t, 0.12);
      const bf = tm.beatFloat(t);
      const s = Math.sin(Math.PI * bf);
      const night = smooth(SECTIONS.chorus2 - 4, SECTIONS.bridge + 2, t) * 0.55 + smooth(SECTIONS.bridge + 8, SECTIONS.chorus3, t) * 0.45;
      const frozen = t >= ev.freeze[0] && t < ev.freeze[1];
      root.classList.toggle("frozen", frozen && state === "play");
      padX = PAD_X[camera.aspect < 0.9 ? 0 : 1];
      stagePads.forEach((p, lane) => (p.position.x = laneX(lane)));
      const crouch = holding ? smooth(holdStart + HOP_TIME, holdStart + HOP_TIME + 0.4, t) : 0;
      const stopped = since(t, stopAt) < 0.6;
      const L = leadPos(t);
      const dir = Math.sign(laneX(hop.to) - laneX(hop.from));
      const cheer = hop.big && L.air ? 1 : 0;
      lead.pose({
        x: L.x, y: L.y, z: L.z, yaw: L.air ? dir * 0.5 : 0,
        hop: L.air ? 0 : 0.04 * Math.abs(s) * (frozen ? 0 : 1),
        stretch: L.air && !L.wet ? Math.sin(L.u * Math.PI) * (cheer ? 0.4 : 1) : 0,
        crouch: crouch + (L.air ? 0 : 0.15 * (1 - Math.abs(s)) * (frozen || stopped ? 0 : 1)),
        squash: 0.5 * Math.exp(-since(t, hop.at + HOP_TIME) / 0.08) * (hop.splash ? 0 : 1),
        armL: stopped || frozen ? 0.9 : cheer ? 1.3 : L.wet ? 1.2 : L.air ? 0.4 : 0.1 * Math.max(0, s),
        armR: stopped || frozen ? 0.9 : cheer ? 1.3 : L.wet ? 1.2 : L.air ? 0.4 : 0.1 * Math.max(0, -s),
        croak: bump(t, hop.at - 0.05, 0.4) * 0.6,
        tilt: frozen ? 0.1 : L.air ? -dir * 0.15 : 0.07 * s,
        blink: L.wet ? 0.9 : bump(t % 3.4, 0, 0.15),
      });
      stagePads.forEach((p, lane) => {
        const k = Math.exp(-since(t, flashAt[lane]) / 0.15);
        p.position.y = lane === hop.to && !L.air ? -0.03 * Math.exp(-since(t, hop.at + HOP_TIME) / 0.15) : 0;
        p.scale.setScalar((padX < 1.3 ? 0.8 : 1) * (1 + 0.08 * k));
      });

      // On wide screens the crew mirrors the lead from rows behind; phones show the lead alone.
      const wide = camera.aspect >= 0.9;
      const squad = wide ? Math.min(CREW_MAX, SQUAD + members) : 0;
      crew.forEach((f, i) => {
        const at = i < SQUAD ? -9 : joined[i - SQUAD] ?? Infinity;
        const on = i < squad && t >= at - 0.05;
        f.group.visible = on;
        slotPads[i].visible = on;
        if (!on) return;
        const [sx, sz] = SLOTS[i];
        const delay = 0.04 + i * 0.025;
        const age = since(t, hop.at + delay);
        const u = clamp(age / HOP_TIME, 0, 1);
        const air = u < 1 && hop.at > -1 && !hop.splash;
        const shift = (lane) => (lane - 1) * 0.32;
        const j = since(t, at);
        const arrive = smooth(0, 0.5, j);
        f.pose({
          x: sx + lerp(shift(hop.from), shift(hop.to), u), y: (air ? Math.sin(u * Math.PI) * (hop.big ? 0.7 : 0.4) : 0) + (1 - arrive) * 1.2, z: sz + (1 - arrive) * 1.5,
          yaw: air ? dir * 0.4 : 0, stretch: air ? Math.sin(u * Math.PI) * (hop.big ? 0.4 : 1) : 0,
          crouch: crouch + (air ? 0 : 0.15 * (1 - Math.abs(Math.sin(Math.PI * (bf - i * 0.1))))),
          armL: frozen || stopped ? 0.8 : air && hop.big ? 1.3 : air ? 0.4 : 0, armR: frozen || stopped ? 0.8 : air && hop.big ? 1.3 : air ? 0.4 : 0,
          croak: bump(t, hop.at - 0.05 + delay, 0.4) * 0.5, tilt: frozen ? (i % 2 ? 0.12 : -0.12) : air ? -dir * 0.12 : 0.06 * Math.sin(Math.PI * (bf - i * 0.1)),
          blink: bump((t + i * 1.3) % 3.1, 0, 0.15),
        });
      });

      const ripples = water.uniforms.uRipples.value;
      ripples.forEach((r) => r.set(0, 0, -99, 0));
      ripples[0].set(laneX(hop.to), hop.splash ? 0.35 : 0, hop.at + HOP_TIME * (hop.splash ? 0.6 : 1), hop.splash ? 1.4 : 0.8);
      bursts.slice(-15).forEach((b, k) => b.y < 0.2 && ripples[k + 1].set(b.x, b.z, b.t0, 0.6));

      // Camera faces the stage; the frog sits in the upper part of the screen, above the lanes.
      const sh = Math.exp(-since(t, shakeAt) / 0.12) * 0.06;
      const jx = sh * Math.sin(t * 90);
      const jy = sh * Math.cos(t * 77);
      if (camera.aspect < 0.9) {
        camera.position.set(jx, 2.0 + jy, 8.6);
        camera.lookAt(jx, -0.8 + jy, 0);
        camera.fov = 46 - kick * 0.8;
      } else {
        camera.position.set(jx, 2.3 + jy, 7.8);
        camera.lookAt(jx, -1.0 + jy, -1.2);
        camera.fov = 40 - kick * 0.8;
      }
      camera.updateProjectionMatrix();

      sky.uniforms.uTime.value = t;
      sky.uniforms.uNight.value = night;
      water.uniforms.uTime.value = t;
      water.uniforms.uNight.value = night;
      hemi.intensity = lerp(1.05, 0.85, night);
      key.intensity = lerp(1.4, 1.0, night);
      rim.intensity = lerp(0.9, 0.5, night);
      drawSparks(t);
      const fever = smooth(24, 26, combo) * (state === "title" ? 0 : 1);
      const fp = flyGeo.attributes.position;
      const shown = Math.floor(FLIES * clamp(0.1 + night * 0.6 + fever * 0.5, 0, 1));
      for (let k = 0; k < FLIES; k++) {
        if (k >= shown) {
          fp.setXYZ(k, 0, -99, 0);
          continue;
        }
        const a = hash(k * 1.3) * 6.28 + t * (0.2 + hash(k) * 0.3) * (1 + fever);
        const r = 1.4 + hash(k * 2.1) * 4;
        fp.setXYZ(k, Math.cos(a) * r, 0.3 + hash(k * 3.7) * 2.2 + Math.sin(t * 1.4 + k) * 0.2, Math.sin(a) * r * 0.5 - 1.6);
      }
      fp.needsUpdate = true;
      flies.material.opacity = 0.5 + 0.25 * Math.sin(t * 3) + fever * 0.3;
      lanesEl.classList.toggle("fever", fever > 0.5);
      composer.render();
      if (state !== "title") hudFrame(t, kick);
    }

    function drawSparks(t) {
      const pos = sparkGeo.attributes.position;
      const col = sparkGeo.attributes.color;
      const c = new THREE.Color();
      let n = 0;
      for (const b of bursts) {
        const age = t - b.t0;
        if (age < 0 || age > b.life) continue;
        for (let s = 0; s < b.count && n < SPARKS; s++, n++) {
          const seed = b.seed * 131 + s;
          const th = hash(seed * 1.3) * Math.PI * 2;
          const sp = b.speed * (0.4 + hash(seed * 4.7) * 0.8);
          const up = b.up * (0.5 + hash(seed * 2.9) * 0.8);
          pos.setXYZ(n, b.x + Math.cos(th) * sp * age, b.y + up * age - b.gravity * age * age, b.z + Math.sin(th) * sp * age * 0.7);
          c.set(b.colors[s % b.colors.length]).multiplyScalar(Math.max(0, 1 - age / b.life));
          col.setXYZ(n, c.r, c.g, c.b);
        }
      }
      for (let i = n; i < SPARKS; i++) pos.setXYZ(i, 0, -99, 0);
      pos.needsUpdate = true;
      col.needsUpdate = true;
    }

    /** Notes fall down their lane and sit exactly on the button as they are due. */
    function drawNotes(t, kick) {
      lanesEl.style.setProperty("--kick", kick.toFixed(3));
      const h = laneEls[0].clientHeight;
      const btn = buttons[0].offsetHeight;
      const goalY = h - btn / 2;
      const yOf = (ahead) => goalY - (ahead / LEAD) * goalY;
      const used = [0, 0, 0];
      laneEls.forEach((el, lane) => el.classList.toggle("flash", since(t, flashAt[lane]) < 0.12));
      let barShown = false;
      for (const n of chart) {
        const ahead = n.t - t;
        if (ahead > LEAD) break;
        if (n.kind === "hold" && !barShown) {
          const done = n.tail === "skip" || (n.tail && n.tail !== "miss" && t > n.end + 0.25) || (n.tail === "miss" && t > Math.max(n.end, n.at ?? 0) + 0.4);
          if (!done) {
            barShown = true;
            const head = n.result && n.result !== "miss" ? goalY : yOf(ahead);
            const end = Math.max(0, yOf(n.end - t));
            bar.style.display = tail.style.display = "";
            bar.className = `fbar${holding === n ? " held" : ""}${n.result === "miss" || n.tail === "miss" ? " miss" : ""}`;
            bar.style.height = `${Math.max(0, head - end)}px`;
            bar.style.transform = `translate(-50%, ${end}px)`;
            const tailDone = n.tail && n.tail !== "miss";
            tail.className = `ftail${n.tail === "miss" ? " miss" : ""}`;
            tail.style.transform = `translate(-50%, ${Math.min(goalY, end) - tail.offsetHeight / 2}px) scale(${tailDone ? 1 + since(t, stopAt) * 2 : 1})`;
            tail.style.opacity = tailDone ? String(Math.max(0, 1 - since(t, stopAt) / 0.25)) : "1";
          }
        }
        const gone = n.judged ? t - (n.at ?? n.t) : 0;
        if (n.judged && (gone > 0.25 || gone < 0)) continue;
        if (!n.judged && ahead < -GOOD) continue;
        const pool = notePools[n.lane];
        if (used[n.lane] >= pool.length) continue;
        const el = pool[used[n.lane]++];
        const kind = n.kind;
        if (el.dataset.kind !== kind) {
          el.dataset.kind = kind;
          el.innerHTML = ICONS[kind];
        }
        el.style.setProperty("--c", kind === "big" ? COLORS.big : kind === "hold" ? COLORS.hold : LANE_COLORS[n.lane]);
        const cls = `fnote${kind === "big" ? " big" : ""}${n.result === "miss" ? " miss" : ""}`;
        if (el.className !== cls) el.className = cls;
        el.style.display = "";
        const done = n.judged && n.result !== "miss";
        const y = done ? goalY : yOf(Math.max(ahead, -GOOD));
        el.style.transform = `translate(-50%, ${y - el.offsetHeight / 2}px) scale(${done ? 1 + gone * 2.4 : 1})`;
        el.style.opacity = n.judged ? String(1 - gone / 0.25) : String(smooth(LEAD, LEAD - 0.2, ahead));
      }
      notePools.forEach((pool, lane) => {
        for (let i = used[lane]; i < pool.length; i++) pool[i].style.display = "none";
      });
      if (!barShown) bar.style.display = tail.style.display = "none";
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
    const api = { chart, tally: () => ({ ...tally, score, combo, maxCombo, members: members + 1, time: songTime() }), destroy };
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
