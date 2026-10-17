import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { makeRibbon } from "@gizclaw/mvg-core/fx.js";
import { Timing, clamp, easeInOut, lerp, smooth } from "@gizclaw/mvg-core/timing.js";
import { AudioClock, GamePostShader, glowTexture, songAudioUrl } from "./kit.js";
import { PARADES, PLANETS, PLUTO, SECTIONS, SUN_WORDS, WORD_COLORS } from "./planet/song.js";
import analysis from "./planet/analysis.json";
import { makeRings, makeStars, makeSun, planetMaterial } from "./planet/scene.js";
import { planetMarkup, planetStyle } from "./planet/style.js";
import { COMMON, gameLang } from "./lang.js";

const TEXT = {
  zh: {
    simpleSub: "跟着节奏点一下，让八大行星排好队",
    simpleKeys: ["光圈收到下面的大按钮上时，点屏幕任意位置", "唱到哪颗行星时点中，就把它收进队伍", "漏拍会掉血，血条空了就失败；太早点会断连击"],
    lineup: "按 1–8 给行星点名",
    parade: "从左到右 1 → 8",
    pluto: "它出现时按 9",
    finale: "最后一次点名",
    space: "空格",
    wrongSun: "✗ 是太阳",
    wrongPlanet: (k, name) => `✗ 是 ${k} ${name}`,
    wrongTaps: "点错",
    named: "行星点名",
    planets: "集齐行星",
    plutoRow: "冥王星",
    found: "找到了",
    missed: "错过了",
  },
  en: {
    simpleSub: "Tap on the beat and line up the eight planets",
    simpleKeys: ["Tap anywhere as the ring reaches the big button below", "Hit each planet as it is sung to bring it into line", "Misses drain your life; tapping early breaks the combo"],
    lineup: "Press 1–8 to call each planet",
    parade: "Left to right, 1 → 8",
    pluto: "Press 9 when it shows up",
    finale: "The last roll call",
    space: "Space",
    wrongSun: "✗ That was the Sun",
    wrongPlanet: (k, name) => `✗ That was ${k} ${name}`,
    wrongTaps: "Wrong hits",
    named: "Planets named",
    planets: "Planets lined up",
    plutoRow: "Pluto",
    found: "found",
    missed: "missed",
  },
};
import { Life, createFinale } from "./finale.js";
import { backGuard, buzz, goFullscreen, isTouch, lockGestures, wakeLock } from "./mobile.js";
import { sfx } from "./sfx.js";

const WORK = "songs/music/stem-institute/en-us/planet-parade";
const SUN_R = 1.2;
const ORBIT_R = [2.3, 3.1, 3.9, 4.7, 6.4, 7.8, 9.0, 10.1];
const SPIN = ORBIT_R.map((r) => 0.17 / Math.pow(r / ORBIT_R[0], 1.5));
const BASE = ORBIT_R.map((_, k) => 0.9 + k * 2.39996);
const SLOT = { x0: -8.75, dx: 2.5, z: 3.6 }; // parade line, in the camera's frame: across the view, in front of the Sun
const CAM_SPIN = 0.045; // radians per second the camera circles the Sun
const PLUTO_POS = new THREE.Vector3(-10.8, 0.6, -6.2);
const PLUTO_T = 8;
const SUN_T = 9;
const LEAD = 1.2; // seconds an approach ring takes to close on its target
const LANE_AHEAD = 2.4; // seconds of upcoming keys shown on the key lane
const PERFECT = 0.07;
const GOOD = 0.16;
const ATTRACT = [SECTIONS.chorus1, SECTIONS.verse2];
const SUN_COLOR = "#ffb347";
const KEYS = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6, 8: 7, 9: PLUTO_T, 0: SUN_T, " ": SUN_T };

let styleMounted = false;
function ensureStyle() {
  if (styleMounted) return;
  const el = document.createElement("style");
  el.dataset.mvg = "planet-parade";
  el.textContent = planetStyle;
  document.head.appendChild(el);
  styleMounted = true;
}

function sectionAt(t) {
  if (t < SECTIONS.verse1) return "lineup";
  if (t < SECTIONS.chorus1) return "verse";
  if (t < SECTIONS.verse2) return "chorus";
  if (t < SECTIONS.chorus2) return "verse";
  if (t < SECTIONS.bridge) return "chorus";
  if (t < SECTIONS.finale) return "bridge";
  return "finale";
}

/** Time of fractional beat `b`, interpolated between detected beats. */
function beatAt(tm, b) {
  const i = Math.floor(b);
  return lerp(tm.beatTime(i), tm.beatTime(i + 1), b - i);
}

/** Song time with the parades cut out: the orbits stand still while the planets march. */
function orbitClock(t) {
  let s = t;
  for (const [a, b] of PARADES) s -= clamp(t - a, 0, b - a);
  return s;
}

/** 0 on the orbits, 1 standing in the parade line. */
function paradeAmount(t) {
  let v = 0;
  for (const [a, b] of PARADES) v = Math.max(v, smooth(a - 0.3, a + 1.1, t) * (1 - smooth(b, b + 1.4, t)));
  return easeInOut(v);
}

const plutoAmount = (t) => smooth(SECTIONS.bridge - 0.5, SECTIONS.bridge + 1.5, t) * (1 - smooth(SECTIONS.finale - 1, SECTIONS.finale + 0.5, t));

/**
 * Every sung planet name is a note on that planet, "Pluto" a note on Pluto,
 * and sun, march, hey, hooray and eight are notes on the Sun; all snap to the
 * half-beat grid, pushed half a beat on when two land together. Filler notes
 * keep the beat from the lineup on (every beat in the lineup, choruses and
 * finale, every other beat in the verses and bridge) wherever no sung note is
 * within three quarters of a beat. In a line about one planet they repeat it;
 * elsewhere they march through the planets in order, restarting at Mercury
 * each section, and in the bridge they fall on the Sun.
 */
function buildChart(tm) {
  const words = [];
  tm.cues.forEach((c, ci) => {
    for (const w of c.words) {
      if (w.start < SECTIONS.lineup - 0.6) continue;
      const k = PLANETS.findIndex((p) => w.clean.startsWith(p.id));
      const target = k >= 0 ? k : w.clean.startsWith("pluto") ? PLUTO_T : SUN_WORDS.includes(w.clean) ? SUN_T : -1;
      if (target >= 0) words.push({ t: w.start, target, word: true, cue: ci });
    }
  });
  words.sort((a, b) => a.t - b.t);
  let prevH = -Infinity;
  for (const n of words) {
    let h = Math.round(tm.beatFloat(n.t) * 2) / 2;
    if (h <= prevH) h = prevH + 0.5;
    n.h = h;
    n.t = beatAt(tm, h);
    prevH = h;
  }

  const solo = new Map();
  for (const n of words) if (n.target < PLUTO_T) solo.set(n.cue, solo.has(n.cue) ? null : n);
  const fillers = [];
  let walk = 0;
  let section = "";
  const first = tm.beatIndexAt(SECTIONS.lineup) + 1;
  tm.beats.forEach((bt, i) => {
    if (i < first || bt > SECTIONS.end - 0.6) return;
    const s = sectionAt(bt);
    if (s !== section) [section, walk] = [s, 0];
    const rel = i - tm.dropBeat;
    if ((s === "verse" || s === "bridge") && ((rel % 2) + 2) % 2) return;
    if (words.some((n) => Math.abs(n.h - i) < 0.75)) return;
    const at = tm.cueAt(bt, 0.2, 0.3);
    const focus = at && solo.get(at.index);
    let target;
    if (s === "bridge") target = SUN_T;
    else if (focus && focus.t < bt) target = focus.target;
    else target = walk++ % PLANETS.length;
    fillers.push({ t: bt, h: i, target });
  });
  return [...words, ...fillers].sort((a, b) => a.t - b.t).map((n) => ({ ...n, judged: false, result: null }));
}

function ringTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  g.strokeStyle = "#ffffff";
  g.shadowColor = "#ffffff";
  g.shadowBlur = 18;
  g.lineWidth = 9;
  g.beginPath();
  g.arc(128, 128, 104, 0, Math.PI * 2);
  g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Mount Planet Parade into `target` (an element or a selector). The chart,
 * HUD and canvas are created inside that element. `options.audio`,
 * `options.start`, `options.play` and `options.auto` override the page query.
 * `options.backHref` shows a link back to a gallery; omit it when embedding.
 * @param {Element | string} target
 * `options.lang` (`zh` or `en`) picks the language, else the universe hub's choice.
 * @param {{ audio?: string, start?: number | string, play?: boolean, auto?: boolean, backHref?: string, search?: string, lang?: "zh" | "en" }} [options]
 * @returns {Promise<{ destroy: () => void, chart: unknown, tally: () => object }>}
 */
export async function mountPlanetParade(target, options = {}) {
  const root = typeof target === "string" ? document.querySelector(target) : target;
  if (!root) throw new Error("mountPlanetParade: target not found");
  ensureStyle();
  root.classList.add("mvg-game", "planet");
  const lang = gameLang(options.lang);
  const ui = COMMON[lang];
  const T = TEXT[lang];
  root.innerHTML = planetMarkup(lang);
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
  /** One-button mode for phones (or `?simple`): tap anywhere on the beat; the planets only put on the show. */
  const simple = isTouch() || params.has("simple");
  if (simple) {
    root.classList.add("simple");
    root.querySelector("#title .sub").textContent = T.simpleSub;
    root.querySelector("#title .keys").innerHTML = T.simpleKeys.map((k) => `<div>${k}</div>`).join("");
    if (isTouch()) root.querySelector("#pause .sub").textContent = ui.resumeTouch;
  }
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
    root.classList.remove("mvg-game", "planet", "simple");
    if (root.mvgGame) delete root.mvgGame;
    if (window.__game?.destroy === destroy) delete window.__game;
  }

  try {
    const tm = new Timing(analysis);
    tm.setDownbeat(SECTIONS.drop);
    const chart = buildChart(tm);
    const BODIES = [...PLANETS, PLUTO, { id: "sun", name: "SUN", color: SUN_COLOR, size: SUN_R }];
    const colorOf = (k) => BODIES[k].color;

    // ---------- renderer ----------
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    $("stage").appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#02030a");
    const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 400);
    const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.5, 0.45, 0.55);
    const post = new ShaderPass(GamePostShader);
    [new RenderPass(scene, camera), bloom, post, new OutputPass()].forEach((p) => composer.addPass(p));
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
    const glow = glowTexture();
    const additive = (color, opacity = 1, map = glow) => new THREE.SpriteMaterial({ map, color, opacity, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    scene.add(makeStars());
    scene.add(new THREE.AmbientLight("#334466", 0.6));
    const sun = makeSun(SUN_R);
    const sunGlow = new THREE.Sprite(additive("#ffae4a", 0.45));
    scene.add(sun.mesh, sunGlow);

    const beltN = 1600;
    const beltPos = new Float32Array(beltN * 3);
    for (let i = 0; i < beltN; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 5.25 + Math.random() * 0.6;
      beltPos.set([Math.cos(a) * r, (Math.random() - 0.5) * 0.25, Math.sin(a) * r], i * 3);
    }
    const beltGeo = new THREE.BufferGeometry();
    beltGeo.setAttribute("position", new THREE.BufferAttribute(beltPos, 3));
    const belt = new THREE.Points(beltGeo, new THREE.PointsMaterial({ size: 0.05, color: "#b8a48c", transparent: true, opacity: 0.55, depthWrite: false }));
    scene.add(belt);

    const bodies = [...PLANETS, PLUTO].map((p) => {
      const g = new THREE.Group();
      const mat = planetMaterial(p);
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(p.size, 48, 32), mat);
      const tilt = new THREE.Group();
      if (p.tilt) tilt.rotation.z = p.tilt;
      tilt.add(mesh);
      let rings = null;
      if (p.rings) {
        rings = makeRings();
        rings.scale.setScalar(p.size);
        tilt.add(rings);
      }
      const halo = new THREE.Sprite(additive(p.color, 0.35));
      halo.scale.setScalar(p.size * 4);
      g.add(tilt, halo);
      scene.add(g);
      return { p, g, mesh, mat, rings, halo, flash: -9 };
    });
    const orbits = ORBIT_R.map((r, k) => {
      const o = makeRibbon({ segments: 360, width: 0.035, color: PLANETS[k].color, uniforms: { uR: { value: r } }, path: "float a = u * 6.32; return vec3(cos(a) * uR, 0.0, sin(a) * uR);" });
      scene.add(o);
      return o;
    });
    const sunBody = { p: BODIES[SUN_T], g: sun.mesh, flash: -9 };
    const targets = [...bodies, sunBody];

    const ringTex = ringTexture();
    const ringPool = Array.from({ length: 16 }, () => {
      const s = new THREE.Sprite(additive("#ffffff", 1, ringTex));
      s.visible = false;
      scene.add(s);
      return s;
    });

    const SPARKS = 600;
    const sparkPos = new Float32Array(SPARKS * 3);
    const sparkCol = new Float32Array(SPARKS * 3);
    const sparkVel = new Float32Array(SPARKS * 3);
    const sparkLife = new Float32Array(SPARKS);
    const sparkGeo = new THREE.BufferGeometry();
    sparkGeo.setAttribute("position", new THREE.BufferAttribute(sparkPos, 3));
    sparkGeo.setAttribute("color", new THREE.BufferAttribute(sparkCol, 3));
    const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ size: 0.16, map: glow, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    sparks.frustumCulled = false;
    scene.add(sparks);
    let sparkHead = 0;
    const tmpColor = new THREE.Color();
    function burst(pos, color, n = 30, speed = 4) {
      tmpColor.set(color);
      for (let k = 0; k < n; k++) {
        const i = sparkHead;
        sparkHead = (sparkHead + 1) % SPARKS;
        const u = Math.random() * 2 - 1;
        const a = Math.random() * Math.PI * 2;
        const s = speed * (0.4 + Math.random() * 0.8);
        const r = Math.sqrt(1 - u * u);
        sparkPos.set([pos.x, pos.y, pos.z], i * 3);
        sparkVel.set([Math.cos(a) * r * s, u * s, Math.sin(a) * r * s], i * 3);
        sparkCol.set([tmpColor.r, tmpColor.g, tmpColor.b], i * 3);
        sparkLife[i] = 0.5 + Math.random() * 0.35;
      }
    }
    function stepSparks(dt) {
      for (let i = 0; i < SPARKS; i++) {
        if (sparkLife[i] <= 0) continue;
        sparkLife[i] -= dt;
        for (let a = 0; a < 3; a++) {
          sparkPos[i * 3 + a] += sparkVel[i * 3 + a] * dt;
          sparkVel[i * 3 + a] *= 1 - dt * 2.5;
          sparkCol[i * 3 + a] *= sparkLife[i] > 0 ? 1 - dt * 1.2 : 0;
        }
        if (sparkLife[i] <= 0) sparkPos[i * 3 + 1] = 1e5;
      }
      sparkGeo.attributes.position.needsUpdate = true;
      sparkGeo.attributes.color.needsUpdate = true;
    }

    let camAz = 0.5;
    /** Where body k stands at time t: on its orbit, in the parade line, or (Pluto) far out. */
    function bodyPos(k, t, out) {
      if (k === SUN_T) return out.set(0, 0, 0);
      if (k === PLUTO_T) return out.copy(PLUTO_POS);
      const a = BASE[k] + SPIN[k] * orbitClock(t);
      out.set(Math.cos(a) * ORBIT_R[k], 0, Math.sin(a) * ORBIT_R[k]);
      const al = paradeAmount(t);
      if (al > 0) {
        const tall = camera.aspect < 0.9;
        const across = tall ? ((k % 4) - 1.5) * 2.3 : SLOT.x0 + k * SLOT.dx;
        const depth = tall ? (k < 4 ? -3.4 : 3.4) : SLOT.z;
        const c = Math.cos(camAz);
        const sn = Math.sin(camAz);
        out.x = lerp(out.x, c * across + sn * depth, al);
        out.z = lerp(out.z, -sn * across + c * depth, al);
        out.y = Math.sin(al * Math.PI) * 1.4;
      }
      return out;
    }

    // ---------- tags ----------
    $("tags").innerHTML = BODIES.map((p, k) =>
      k === SUN_T
        ? `<div class="tag sun" style="--c:${p.color}">☀${isTouch() ? "" : " <span>SPACE</span>"}</div>`
        : `<div class="tag" style="--c:${p.color}"><b>${k === PLUTO_T ? 9 : k + 1}</b><span>${p.name}</span></div>`,
    ).join("");
    const tags = [...$("tags").children];
    const screen = BODIES.map(() => ({ x: 0, y: 0, r: 0, on: true }));
    const tmpV = new THREE.Vector3();
    /** Planets grow on a tall screen, where the whole system is seen from farther away. */
    const bodyScale = () => (camera.aspect < 0.9 ? 1.3 : 1);
    function project(t) {
      const f = view.h / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
      for (let k = 0; k < BODIES.length; k++) {
        bodyPos(k, t, tmpV);
        const dist = tmpV.distanceTo(camera.position);
        tmpV.project(camera);
        const s = screen[k];
        s.x = (tmpV.x * 0.5 + 0.5) * view.w;
        s.y = (-tmpV.y * 0.5 + 0.5) * view.h;
        s.r = ((BODIES[k].size * (k === SUN_T ? 1 : bodyScale())) / dist) * f;
        s.on = k !== PLUTO_T || plutoAmount(t) > 0.3;
      }
    }

    // ---------- audio clock ----------
    audio = new Audio(params.get("audio") || songAudioUrl(WORK));
    audio.preload = "auto";
    const clock = new AudioClock(audio);
    let offset = Number(localStorage.getItem("planet-game-offset") || 0);
    const songTime = () => clock.now() + offset;
    await clock.ready();

    // ---------- state ----------
    let state = "title";
    let score = 0;
    let combo = 0;
    let maxCombo = 0;
    const tally = { perfect: 0, good: 0, miss: 0, wrong: 0, named: 0, planets: 0, pluto: 0 };
    const namedTotal = chart.filter((n) => n.word && n.target < PLUTO_T).length;
    const got = new Set();
    let hitFlash = -9;
    let hitColor = "#ffffff";
    let wrongAt = -9;
    let lastCall = -1;
    let countdownShown = -1;
    let lastT = 0;
    let hover = -1;
    const auto = params.has("auto");
    const loud = () => state === "play";
    const life = new Life($("hp"));
    const finale = createFinale(root, { c: ui, audio, signal });
    const guard = backGuard({ signal, playing: () => state === "play", onBack: () => togglePause() });
    /** Pitch step for body k: planets climb the scale, Pluto sits above Neptune, the Sun at the bottom. */
    const pitch = (k) => (k === SUN_T ? 0 : k === PLUTO_T ? 9 : k);
    const firstNote = chart[0]?.t ?? SECTIONS.lineup;
    const calls = [
      { t: SECTIONS.lineup, text: "STEP INTO LINE!", color: SUN_COLOR, sub: T.lineup },
      { t: SECTIONS.chorus1, text: "PLANET PARADE!", color: SUN_COLOR, sub: T.parade },
      { t: SECTIONS.chorus2, text: "PLANET PARADE!", color: SUN_COLOR, sub: T.parade },
      { t: SECTIONS.bridge, text: "WHERE IS PLUTO?", color: PLUTO.color, sub: T.pluto },
      { t: SECTIONS.finale, text: "ALL EIGHT!", color: "#ffffff", sub: T.finale },
    ];

    $("lineup").innerHTML = [...PLANETS, PLUTO]
      .map((p, i) => `<div class="${i === PLUTO_T ? "dwarf" : ""}" style="--c:${p.color}"><i></i><span><b>${i + 1}</b> ${p.name.slice(0, 3)}</span></div>`)
      .join("");
    const chips = [...$("lineup").children];
    const keyPool = Array.from({ length: 16 }, () => {
      const el = document.createElement("div");
      el.className = "key";
      el.style.display = "none";
      $("keylane").appendChild(el);
      return el;
    });
    const tapBtn = root.querySelector("#tap .btn");
    const tapRings = Array.from({ length: 8 }, () => {
      const el = document.createElement("i");
      el.style.display = "none";
      $("tap").appendChild(el);
      return el;
    });
    const keyLabel = (k) => (k === SUN_T ? (isTouch() ? "☀" : T.space) : String(k === PLUTO_T ? 9 : k + 1));

    function reset() {
      for (const n of chart) Object.assign(n, { judged: false, result: null });
      life.reset();
      score = combo = maxCombo = 0;
      Object.keys(tally).forEach((k) => (tally[k] = 0));
      got.clear();
      chips.forEach((c) => c.classList.remove("got", "pop"));
      hitFlash = wrongAt = -9;
      lastCall = countdownShown = -1;
      $("lyric").dataset.cue = "";
      $("lyric").innerHTML = "";
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
    function judgeText(text, color) {
      const j = $("judge");
      j.textContent = text;
      j.style.color = color;
      j.style.textShadow = `0 0 18px ${color}`;
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

    function collect(k) {
      const p = BODIES[k];
      if (!got.has(k)) {
        got.add(k);
        if (k < PLUTO_T) tally.planets++;
        else tally.pluto = 1;
      }
      chips[k].classList.add("got");
      chips[k].classList.remove("pop");
      void chips[k].offsetWidth;
      chips[k].classList.add("pop");
      if (loud()) sfx.collect(pitch(k));
      if (k === PLUTO_T) slam("PLUTO", p.color, "dwarf planet · bonus");
      else slam(p.name, p.color, `${p.ord} · ${p.fact}`);
    }

    function hit(n, t) {
      n.judged = true;
      n.at = t;
      n.result = Math.abs(t - n.t) <= PERFECT ? "perfect" : "good";
      tally[n.result]++;
      combo++;
      maxCombo = Math.max(maxCombo, combo);
      const color = colorOf(n.target);
      let pts = n.result === "perfect" ? 300 : 120;
      if (n.word && n.target < SUN_T) pts *= n.target === PLUTO_T ? 4 : 2;
      score += pts * mult();
      hitFlash = t;
      hitColor = color;
      targets[n.target].flash = t;
      const big = n.word && n.target !== SUN_T;
      burst(bodyPos(n.target, t, tmpV), color, big ? 50 : n.target === SUN_T ? 40 : 20, big ? 5 : 3.5);
      buzz(big ? 20 : 8);
      if (loud()) {
        life.heal(n.result);
        if (n.target === SUN_T) sfx.stomp();
        else sfx.hit(pitch(n.target), n.result === "perfect");
        if (combo >= 10 && combo % 10 === 0) sfx.combo();
      }
      if (big) {
        if (n.target < PLUTO_T) tally.named++;
        collect(n.target);
      }
      if (n.result === "perfect") judgeText(combo >= 10 && combo % 10 === 0 ? `${combo} COMBO!` : "PERFECT", color);
      else judgeText("GOOD", "#c9d6ff");
      updateScore();
    }

    /** A tap on body k at time t: hits the earliest open note on k within the window. */
    function press(k, t) {
      targets[k].flash = Math.max(targets[k].flash, t - 0.12);
      let open = null;
      for (const n of chart) {
        if (n.t > t + GOOD) break;
        if (n.judged || n.t < t - GOOD) continue;
        if (n.target === k) return hit(n, t);
        open ??= n;
      }
      if (!open) {
        if (loud()) (k === SUN_T ? sfx.stomp() : sfx.tap(pitch(k)));
        return;
      }
      if (loud()) sfx.wrong();
      buzz(45);
      tally.wrong++;
      combo = 0;
      wrongAt = t;
      const want = BODIES[open.target];
      judgeText(open.target === SUN_T ? T.wrongSun : T.wrongPlanet(open.target === PLUTO_T ? 9 : open.target + 1, want.name), "#ff6b8a");
      updateScore();
      if (loud() && life.hurt("wrong")) finish(false);
    }

    /** One-button tap: hits the earliest open note whatever its target; tapping well early breaks the combo. */
    function tapAny(t) {
      tapBtn.classList.remove("down");
      void tapBtn.offsetWidth;
      tapBtn.classList.add("down");
      for (const n of chart) {
        if (n.t > t + 0.4) break;
        if (n.judged || n.t < t - GOOD) continue;
        if (n.t <= t + GOOD) return hit(n, t);
        if (combo) judgeText("EARLY", "#8890b0");
        combo = 0;
        updateScore();
        return;
      }
      if (loud()) sfx.tap(2);
    }

    function sweep(t) {
      for (const n of chart) {
        if (n.t > t - GOOD) break;
        if (n.judged) continue;
        n.judged = true;
        n.at = t;
        n.result = "miss";
        tally.miss++;
        if (combo >= 10) judgeText("MISS", "#8890b0");
        combo = 0;
        updateScore();
        if (!loud()) continue;
        sfx.miss();
        if (life.hurt("miss")) return finish(false);
      }
    }

    function autopilot(t) {
      for (const n of chart) {
        if (n.t > t) break;
        if (!n.judged) press(n.target, n.t);
      }
    }

    // ---------- input ----------
    window.addEventListener("keydown", (e) => {
      sfx.unlock();
      const k = e.key.toLowerCase();
      if (e.key === "Escape" || k === "p") togglePause();
      else if (k === "r" && state === "result") start();
      else if ((e.key === " " || e.key === "Enter") && state === "title") start();
      else if (e.key in KEYS) {
        if (state === "play" && !e.repeat) (simple ? tapAny(songTime()) : press(KEYS[e.key], songTime()));
      } else if (e.key === "[" || e.key === "]") {
        offset = Math.round((offset + (e.key === "]" ? 0.01 : -0.01)) * 100) / 100;
        localStorage.setItem("planet-game-offset", String(offset));
        judgeText(`SYNC ${offset >= 0 ? "+" : ""}${Math.round(offset * 1000)} ms`, "#ffffff");
      } else return;
      if (e.key === " ") e.preventDefault();
    }, { signal });
    /** The body under screen point (x, y), with generous room around small planets. */
    function bodyAt(x, y) {
      let best = -1;
      let bestD = Infinity;
      screen.forEach((s, k) => {
        if (!s.on) return;
        const d = Math.hypot(s.x - x, s.y - y) - Math.max(s.r * 1.25, 38);
        if (d < 0 && d < bestD) [best, bestD] = [k, d];
      });
      return best;
    }
    root.addEventListener("pointerdown", (e) => {
      sfx.unlock();
      if (state !== "play" || e.target.tagName !== "CANVAS") return;
      if (simple) return tapAny(songTime());
      const rect = root.getBoundingClientRect();
      const k = bodyAt(e.clientX - rect.left, e.clientY - rect.top);
      if (k >= 0) press(k, songTime());
    }, { signal });
    root.addEventListener("pointermove", (e) => {
      const rect = root.getBoundingClientRect();
      const k = state === "play" && !simple && e.target.tagName === "CANVAS" ? bodyAt(e.clientX - rect.left, e.clientY - rect.top) : -1;
      if (k === hover) return;
      hover = k;
      renderer.domElement.style.cursor = k >= 0 ? "pointer" : "";
      if (k >= 0) sfx.hover(pitch(k));
    }, { signal });
    root.querySelectorAll("button").forEach((b) => b.addEventListener("pointerenter", () => sfx.hover(4), { signal }));
    $("pause").addEventListener("click", togglePause);
    $("start").addEventListener("click", start);
    $("again").addEventListener("click", start);

    function start() {
      finale.reset();
      reset();
      sfx.unlock();
      sfx.start();
      goFullscreen();
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
    /** The end of the parade (`cleared`) or of the player's life. */
    function finish(cleared) {
      state = "result";
      awake.release();
      const acc = (tally.perfect + tally.good * 0.6) / Math.max(1, chart.length);
      finale.end({
        cleared,
        score,
        ratio: acc,
        reached: clamp(lastT / SECTIONS.end, 0, 1),
        best: "planet-game-best",
        record: !auto && !params.has("start"),
        stats: [
          ["PERFECT", tally.perfect],
          ["GOOD", tally.good],
          ["MISS", tally.miss],
          [T.wrongTaps, tally.wrong],
          [T.named, `${tally.named} / ${namedTotal}`],
          [T.planets, `${tally.planets} / 8`],
          [T.plutoRow, tally.pluto ? T.found : T.missed],
          [ui.maxCombo, maxCombo],
          [ui.accuracy, `${(acc * 100).toFixed(1)}%`],
        ],
      });
    }

    // ---------- lyrics ----------
    function drawLyric(t) {
      const el = $("lyric");
      const at = tm.cueAt(t);
      const key = at ? String(at.index) : "";
      if (el.dataset.cue !== key) {
        el.dataset.cue = key;
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
        if (t < lastT) {
          for (const n of chart) Object.assign(n, { judged: false, result: null });
          hitFlash = wrongAt = -9;
          targets.forEach((b) => (b.flash = -9));
        }
        autopilot(t);
      } else {
        t = state === "play" ? songTime() : lastT;
        if (state === "play") {
          if (auto) autopilot(t);
          sweep(t);
          if (state === "play" && (t >= SECTIONS.end || audio.ended)) finish(true);
        }
      }
      lastT = t;
      render(t, dt);
    }

    function render(t, dt) {
      const kick = tm.pulse(t, 0.12);
      const hit = Math.exp(-Math.max(0, t - hitFlash) / 0.18);
      const hurt = Math.exp(-Math.max(0, t - wrongAt) / 0.3);
      const al = paradeAmount(t);

      const portrait = camera.aspect < 0.9;
      camAz += dt * CAM_SPIN;
      const sway = Math.sin(performance.now() / 9000) * 0.03;
      const elev = (portrait ? lerp(0.5, 0.85, al) : lerp(0.3, 0.18, al)) + sway;
      const dist = portrait ? lerp(38, 28, al) : (28 - al * 2) * clamp(1.6 / camera.aspect, 0.72, 1);
      camera.position.set(Math.sin(camAz) * Math.cos(elev) * dist, Math.sin(elev) * dist, Math.cos(camAz) * Math.cos(elev) * dist);
      if (portrait) camera.lookAt(Math.sin(camAz) * 3.5, -1, Math.cos(camAz) * 3.5);
      else camera.lookAt(0, lerp(-1.3, -0.4, al), 0);
      camera.fov = (portrait ? 50 : 36) - kick * 0.5;
      camera.updateProjectionMatrix();

      sun.uniforms.uTime.value = t;
      sun.uniforms.uPulse.value = kick + Math.exp(-Math.max(0, t - sunBody.flash) / 0.25) * 1.5;
      sunGlow.scale.setScalar(SUN_R * (5 + kick * 1.2 + Math.exp(-Math.max(0, t - sunBody.flash) / 0.25) * 2.5));
      belt.material.opacity = 0.55 * (1 - al * 0.7);

      const pl = plutoAmount(t);
      bodies.forEach((b, i) => {
        bodyPos(i, t, b.g.position);
        const flash = Math.exp(-Math.max(0, t - b.flash) / 0.22);
        const fade = i === PLUTO_T ? pl : 1;
        b.g.visible = fade > 0.01;
        b.mesh.rotation.y = t * 0.5;
        b.g.scale.setScalar(bodyScale());
        b.mesh.scale.setScalar(1 + flash * 0.3);
        b.mat.uniforms.uTime.value = t;
        b.mat.uniforms.uFlash.value = flash * 0.6;
        b.mat.uniforms.uOpacity.value = fade;
        if (b.rings) b.rings.material.uniforms.uOpacity.value = fade;
        b.halo.material.opacity = fade * (0.3 + kick * 0.15 + flash * 0.6);
      });

      project(t);
      const due = new Set();
      let ri = 0;
      for (const n of chart) {
        const ahead = n.t - t;
        if (ahead > LEAD) break;
        if (ahead < -GOOD || n.judged) continue;
        due.add(n.target);
        if (ri >= ringPool.length) continue;
        const r = ringPool[ri++];
        const body = BODIES[n.target];
        bodyPos(n.target, t, r.position);
        const close = clamp(ahead / LEAD, 0, 1);
        r.visible = true;
        r.scale.setScalar(body.size * (n.target === SUN_T ? 2.6 : 3.2 * bodyScale()) * (1 + 1.7 * close));
        r.material.color.set(body.color);
        r.material.opacity = smooth(LEAD, LEAD - 0.25, ahead) * (ahead < 0 ? 1 + ahead / GOOD : 1) * (n.word ? 1 : 0.75);
      }
      for (; ri < ringPool.length; ri++) ringPool[ri].visible = false;
      orbits.forEach((o, k) => {
        const u = o.material.uniforms;
        const flash = Math.exp(-Math.max(0, t - bodies[k].flash) / 0.3);
        const lit = due.has(k) ? 1 : 0;
        u.uOpacity.value = (1 - al * 0.8) * (0.28 + lit * 0.4 + flash * 0.3 + (hover === k ? 0.3 : 0));
        u.uGlow.value = 0.8 + lit * 0.6 + flash * 0.6 + kick * 0.3;
        u.uWidth.value = 0.035 + lit * 0.025 + flash * 0.02;
      });
      tags.forEach((el, k) => {
        const s = screen[k];
        el.style.display = s.on ? "" : "none";
        if (!s.on) return;
        el.style.transform = `translate(${s.x}px, ${s.y + s.r + 8}px) translate(-50%, 0)`;
        el.classList.toggle("due", due.has(k));
        el.classList.toggle("hover", hover === k);
      });

      stepSparks(dt);
      bloom.strength = 0.5 + kick * 0.2 + hit * 0.15;
      post.uniforms.uTime.value = t;
      post.uniforms.uCA.value = 0.2 + kick * 0.35 + hit * 0.3 + hurt * 1.2;
      post.uniforms.uGlitch.value = hurt * 0.3;
      post.uniforms.uFlash.value = hit * 0.02 + hurt * 0.05;
      post.uniforms.uFlashColor.value.set(hurt > hit ? "#ff6b8a" : hitColor);
      composer.render();

      if (state !== "title") hudFrame(t, kick);
    }

    /** Upcoming keys slide right to left into the NOW box, arriving as their note is due. */
    function drawKeys(t, kick) {
      const lane = $("keylane");
      const span = lane.clientWidth - 28;
      lane.querySelector(".now").style.transform = `scale(${1 + kick * 0.08})`;
      let ki = 0;
      for (const n of chart) {
        const ahead = n.t - t;
        if (ahead > LANE_AHEAD) break;
        const since = n.judged ? t - (n.at ?? n.t) : 0;
        if (n.judged && (since > 0.3 || since < 0)) continue;
        if (!n.judged && ahead < -GOOD) continue;
        if (ki >= keyPool.length) break;
        const el = keyPool[ki++];
        const cls = `key${n.word ? " word" : ""}${n.target === SUN_T ? " sun" : ""}${n.result === "miss" ? " miss" : ""}`;
        if (el.className !== cls) el.className = cls;
        const label = keyLabel(n.target);
        if (el.textContent !== label) el.textContent = label;
        el.style.setProperty("--c", colorOf(n.target));
        el.style.display = "";
        const hitDone = n.judged && n.result !== "miss";
        const x = 28 + ((hitDone ? 0 : ahead) / LANE_AHEAD) * span;
        const scale = hitDone ? 1 + since * 2.2 : 1;
        el.style.transform = `translate(${x}px, ${n.result === "miss" ? since * 60 : 0}px) translate(-50%, 0) scale(${scale})`;
        el.style.opacity = n.judged ? String(1 - since / 0.3) : String(smooth(LANE_AHEAD, LANE_AHEAD - 0.3, ahead));
      }
      for (; ki < keyPool.length; ki++) keyPool[ki].style.display = "none";
    }

    /** Rings close on the tap button, one per upcoming note, landing as the note is due. */
    function drawTap(t, kick) {
      const size = tapBtn.offsetWidth;
      const next = chart.find((n) => !n.judged && n.t >= t - GOOD);
      tapBtn.style.setProperty("--c", next ? colorOf(next.target) : "#9fe6ff");
      tapBtn.style.boxShadow = `0 0 ${20 + kick * 24}px var(--c)`;
      let ri = 0;
      for (const n of chart) {
        const ahead = n.t - t;
        if (ahead > LEAD) break;
        if (n.judged || ahead < -GOOD || ri >= tapRings.length) continue;
        const el = tapRings[ri++];
        const d = size * (1 + 1.6 * clamp(ahead / LEAD, 0, 1));
        el.style.display = "";
        el.style.width = el.style.height = `${d}px`;
        el.style.setProperty("--c", colorOf(n.target));
        el.style.borderWidth = n.word ? "6px" : "4px";
        el.style.opacity = String(smooth(LEAD, LEAD - 0.25, ahead) * (ahead < 0 ? 1 + ahead / GOOD : 1));
      }
      for (; ri < tapRings.length; ri++) tapRings[ri].style.display = "none";
    }

    function hudFrame(t, kick) {
      $("progress").firstElementChild.style.width = `${clamp(t / SECTIONS.end, 0, 1) * 100}%`;
      if (simple) drawTap(t, kick);
      else drawKeys(t, kick);
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
    const api = { chart, tally: () => ({ ...tally, score, combo, maxCombo }), destroy };
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
