import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { Timing, clamp, hash, lerp, smooth } from "@gizclaw/mvg-core/timing.js";
import { AudioClock, GamePostShader, glowTexture, songAudioUrl } from "./kit.js";
import { BRIDGE_VALUES, GRAY, NES, NES_CYCLE, PLACES, SECTIONS, VERSE2_VALUES, WORD_COLORS } from "./binary/song.js";
import analysis from "./binary/analysis.json";
import { binaryMarkup, binaryStyle } from "./binary/style.js";
import { COMMON, gameLang } from "./lang.js";
import { backGuard, buzz, goFullscreen, isTouch, lockGestures, wakeLock } from "./mobile.js";
import { sfx } from "./sfx.js";

const WORK = "songs/music/stem-institute/en-us/binary-boogie";
const XS = 0.62; // world units between neighbouring numbers on the number line
const LINE_Y = 1.1; // an invader that reaches this height gets through
const SPAWN_Y = 8.6;
const KEYS = { a: 0, s: 1, d: 2, f: 3 };
const KEY_LABELS = ["A", "S", "D", "F"];
const BIN = /^(one|zero)(-(one|zero))*$/;
const ATTRACT = [SECTIONS.chorus1, SECTIONS.verse2];
const TUTOR_END = SECTIONS.chorus1 - 3; // lessons run until here
const MARCH = [20, 4]; // beats an invader takes to reach the line: after the lessons, and at the fastest
const SPEEDUP = 24; // beats of play per beat taken off the march
const LIVES = 3;
const MAX_LIVES = 5;
const LESSON_MARCH = 16; // lessons come down this slowly, then wait on the line
const LESSONS = [
  { value: 1, tip: { zh: "拨出 1：打开最右边的「1」开关", en: "Dial 1: flip on the rightmost “1” switch" } },
  { value: 2, tip: { zh: "拨出 2 = 0010：照着闪的开关按", en: "2 = 0010: flip the switch that blinks" } },
  { value: 3, tip: { zh: "3 = 2 + 1：「2」和「1」一起亮", en: "3 = 2 + 1: light “2” and “1” together" } },
  { value: 8, tip: { zh: "最左边是 8：打开「8」", en: "The leftmost is 8: flip on “8”" } },
  { value: 4, tip: { zh: "打完会自动清零，拨错了按空格重来", en: "The switches clear after each shot; Space starts over" } },
  { value: 5, tip: { zh: "5 = 4 + 1", en: "5 = 4 + 1" } },
  { value: 6, tip: { zh: "6 = 4 + 2", en: "6 = 4 + 2" } },
  { value: 7, tip: { zh: "7 = 4 + 2 + 1", en: "7 = 4 + 2 + 1" } },
];
const TEXT = {
  zh: {
    touchKeys: ["下面四个开关是 8 · 4 · 2 · 1，点一下开、再点一下关，红色键一键清零", "拨出外星人身上的数字，下一拍就开火打爆它", "3 条命，溜走一只扣一条；无限循环，越来越快 · 横屏玩更舒服"],
    training: "先学会拨开关",
    ready: "它会等你，拨对下一拍就开火",
    oneFlip: "每只只差一个开关",
    allFour: "四个开关全用上",
    boss: "boogie 时打 15 号 Boss",
    lights: "8 · 4 · 2 · 1 一盏盏点亮",
    lastWave: "最后一波",
    faster: "越来越快",
    clear: "清零",
    space: "空格",
    nice: "✓ 打得好！",
    want: (v, bits) => `要拨 ${v} = ${bits}`,
    shot: "打爆",
    shotN: (n) => `${n} 只`,
    through: "溜走",
    collected: "集齐 0–15",
  },
  en: {
    touchKeys: ["The four switches below are 8 · 4 · 2 · 1: tap to flip, the red one clears", "Spell the number an invader carries and it is shot on the next beat", "Three lives, one lost for each that gets through; loops for ever, faster each time · best played sideways"],
    training: "learn the switches first",
    ready: "it waits; spell it and it is shot on the next beat",
    oneFlip: "each one a single flip away",
    allFour: "all four switches now",
    boss: "a 15 boss on “boogie”",
    lights: "8 · 4 · 2 · 1, one light at a time",
    lastWave: "the last wave",
    faster: "faster and faster",
    clear: "CLEAR",
    space: "Space",
    nice: "✓ Nice shot!",
    want: (v, bits) => `That was ${v} = ${bits}`,
    shot: "Shot down",
    shotN: (n) => `${n}`,
    through: "Got through",
    collected: "Collected 0–15",
  },
};
const DRILLS = [4, 9, 12, 10, 15, 11, 13, 14];
const xOf = (v) => (v - 7.5) * XS;
const bitsOf = (v) => PLACES.map((p) => (v & p ? 1 : 0));

const SHIP = [
  "000000010000000",
  "000000111000000",
  "000000111000000",
  "000001111100000",
  "001111111111100",
  "011111111111110",
  "111111111111111",
  "111111111111111",
  "110011000110011",
];
const SHIP_ROWS = ["#ffffff", "#b8ffcf", "#7dffa6", "#3cf07a", "#5effa0", "#00e436", "#00c22e", "#008751", "#5f574f"];
const SHIP_LEDS = [2, 5, 9, 12]; // columns of the bit lights on row 6
const PIX = 0.1;

// 5×7 pixel digits and two frames of an 11×8 invader, rows top to bottom.
const FONT = {
  0: ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  1: ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  2: ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  3: ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  4: ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  5: ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  6: ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  7: ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  8: ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  9: ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
};
const INVADER = [
  ["00100000100", "00010001000", "00111111100", "01101110110", "11111111111", "10111111101", "10100000101", "00011011000"],
  ["00100000100", "10010001001", "10111111101", "11101110111", "11111111111", "01111111110", "00100000100", "01000000010"],
];

let styleMounted = false;
function ensureStyle() {
  if (styleMounted) return;
  const el = document.createElement("style");
  el.dataset.mvg = "binary-boogie";
  el.textContent = binaryStyle;
  document.head.appendChild(el);
  styleMounted = true;
}

function pixelText(g, text, x, y, px) {
  [...text].forEach((ch, ci) => FONT[ch]?.forEach((row, r) => [...row].forEach((bit, c) => bit === "1" && g.fillRect(x + (ci * 6 + c) * px, y + r * px, px, px))));
}
function canvasTexture(c) {
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  return tex;
}
/** An invader carrying its number underneath. */
function invaderTexture(value, frame, color) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  g.fillStyle = color;
  INVADER[frame].forEach((row, r) => [...row].forEach((bit, k) => bit === "1" && g.fillRect(9 + k * 10, 4 + r * 9, 10, 9)));
  const s = String(value);
  const px = 6;
  const w = (s.length * 6 - 1) * px;
  g.fillStyle = "#ffffff";
  pixelText(g, s, (128 - w) / 2, 80, px);
  return canvasTexture(c);
}
function labelTexture(text, color) {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 32;
  const g = c.getContext("2d");
  g.fillStyle = color;
  const px = 3;
  pixelText(g, text, (64 - (text.length * 6 - 1) * px) / 2, 5, px);
  return canvasTexture(c);
}


const ORDER = ["chorus1", "verse2", "chorus2", "bridge", "chorus3", "outro"];
function sectionAt(t) {
  let s = "verse1";
  for (const k of ORDER) if (t >= SECTIONS[k]) s = k;
  return s;
}

/**
 * Mount Binary Boogie into `target` (an element or a selector). The HUD and
 * canvas are created inside that element. `options.audio`, `options.start`,
 * `options.play` and `options.auto` override the page query.
 * `options.backHref` shows a link back to a gallery; omit it when embedding.
 * @param {Element | string} target
 * `options.lang` (`zh` or `en`) picks the language, else the universe hub's choice.
 * @param {{ audio?: string, start?: number | string, play?: boolean, auto?: boolean, backHref?: string, search?: string, lang?: "zh" | "en" }} [options]
 * @returns {Promise<{ destroy: () => void, history: unknown, tally: () => object }>}
 */
export async function mountBinaryBoogie(target, options = {}) {
  const root = typeof target === "string" ? document.querySelector(target) : target;
  if (!root) throw new Error("mountBinaryBoogie: target not found");
  ensureStyle();
  root.classList.add("mvg-game", "binary");
  const lang = gameLang(options.lang);
  const ui = COMMON[lang];
  const T = TEXT[lang];
  root.innerHTML = binaryMarkup(lang);
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
  if (isTouch()) {
    root.querySelector("#title .keys").innerHTML = T.touchKeys.map((k) => `<div>${k}</div>`).join("");
    root.querySelector("#pause .sub").textContent = ui.resumeTouch;
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
    root.classList.remove("mvg-game", "binary");
    if (root.mvgGame) delete root.mvgGame;
    if (window.__game?.destroy === destroy) delete window.__game;
  }

  try {
    const tm = new Timing(analysis);
    tm.setDownbeat(SECTIONS.drop);
    const boogies = tm.cues.flatMap((c) => c.words).filter((w) => w.clean === "boogie" && sectionAt(w.start).startsWith("chorus")).map((w) => w.start);

    // ---------- renderer ----------
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    $("stage").appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#05061a");
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
    const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.5, 0.4, 0.7);
    const post = new ShaderPass(GamePostShader);
    [new RenderPass(scene, camera), bloom, post, new OutputPass()].forEach((p) => composer.addPass(p));
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

    // ---------- scene ----------
    const flat = (w, h, color, opacity = 1) => new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
    (() => {
      const n = 700;
      const pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) pos.set([(Math.random() - 0.5) * 70, -6 + Math.random() * 30, -10 - Math.random() * 30], i * 3);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: "#9fb4ff", size: 0.12 })));
    })();
    const city = (() => {
      const n = 70;
      const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: "#ffffff" }), n);
      const d = new THREE.Object3D();
      const c = new THREE.Color();
      for (let i = 0; i < n; i++) {
        const h = 1 + hash(i * 1.7) * 4;
        d.position.set((i - n / 2) * 1.2 + (hash(i * 3.1) - 0.5) * 0.8, -2 + h / 2, -16 - hash(i * 5.3) * 6);
        d.scale.set(0.7 + hash(i * 2.3) * 0.8, h, 1);
        d.updateMatrix();
        mesh.setMatrixAt(i, d.matrix);
        c.set(NES_CYCLE[i % NES_CYCLE.length]).multiplyScalar(0.04 + hash(i * 7.7) * 0.04);
        mesh.setColorAt(i, c);
      }
      scene.add(mesh);
      return mesh;
    })();

    const line = flat(XS * 16.4, 0.05, NES.blue, 0.7);
    line.position.set(0, -0.35, 0);
    const dead = flat(XS * 16.4, 0.04, NES.red, 0.35);
    dead.position.set(0, LINE_Y - 0.55, 0);
    scene.add(line, dead);
    const ticks = Array.from({ length: 16 }, (_, v) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.3), new THREE.MeshBasicMaterial({ map: labelTexture(String(v), "#ffffff"), transparent: true, opacity: 0.45, depthWrite: false }));
      m.position.set(xOf(v), -0.7, 0);
      scene.add(m);
      return m;
    });

    scene.add(new THREE.AmbientLight("#ffffff", 1.4));
    const sun = new THREE.DirectionalLight("#ffffff", 1.8);
    sun.position.set(-2, 4, 6);
    scene.add(sun);
    const cannon = new THREE.Group();
    const ship = new THREE.Group();
    const cells = SHIP.flatMap((row, r) => [...row].map((bit, c) => (bit === "1" && !(r === 6 && SHIP_LEDS.includes(c)) ? [r, c] : null)).filter(Boolean));
    const hull = new THREE.InstancedMesh(new THREE.BoxGeometry(PIX * 0.96, PIX * 0.96, 0.3), new THREE.MeshLambertMaterial({ color: "#ffffff" }), cells.length);
    const cellAt = (r, c, out) => out.set((c - 7) * PIX, (SHIP.length - 1 - r) * PIX + PIX / 2, 0);
    const d = new THREE.Object3D();
    cells.forEach(([r, c], i) => {
      cellAt(r, c, d.position);
      d.updateMatrix();
      hull.setMatrixAt(i, d.matrix);
      hull.setColorAt(i, new THREE.Color(SHIP_ROWS[r]));
    });
    const leds = SHIP_LEDS.map((c) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(PIX * 1.15, PIX * 1.15, 0.36), new THREE.MeshBasicMaterial({ color: NES.navy }));
      cellAt(6, c, m.position);
      return m;
    });
    const glow = glowTexture();
    const muzzle = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: NES.green, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    muzzle.position.set(0, SHIP.length * PIX + 0.04, 0.2);
    const thruster = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: NES.blue, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.6 }));
    thruster.position.set(0, -0.02, 0.1);
    ship.add(hull, ...leds, muzzle, thruster);
    cannon.add(ship);
    cannon.position.set(xOf(0), 0, 0);
    scene.add(cannon);
    const MUZZLE_Y = SHIP.length * PIX + 0.05;
    const aim = flat(0.05, 1, NES.green, 0);
    scene.add(aim);
    const beam = flat(0.12, 1, NES.yellow, 0);
    scene.add(beam);

    const tex = {};
    const invTex = (v, f, boss) => (tex[`${v}${f}${boss}`] ??= invaderTexture(v, f, boss ? NES.pink : NES_CYCLE[v % NES_CYCLE.length]));
    const invPool = Array.from({ length: 1 }, () => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }));
      m.visible = false;
      scene.add(m);
      return m;
    });
    const hints = PLACES.map(() => {
      const m = flat(0.3, 0.3, "#ffffff", 0);
      scene.add(m);
      return m;
    });

    const SPARKS = 700;
    const sparkPos = new Float32Array(SPARKS * 3);
    const sparkCol = new Float32Array(SPARKS * 3);
    const sparkVel = new Float32Array(SPARKS * 3);
    const sparkLife = new Float32Array(SPARKS);
    const sparkGeo = new THREE.BufferGeometry();
    sparkGeo.setAttribute("position", new THREE.BufferAttribute(sparkPos, 3));
    sparkGeo.setAttribute("color", new THREE.BufferAttribute(sparkCol, 3));
    const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ size: 0.15, vertexColors: true }));
    sparks.frustumCulled = false;
    scene.add(sparks);
    let sparkHead = 0;
    const tmpColor = new THREE.Color();
    function burst(x, y, n, color, speed = 5) {
      for (let k = 0; k < n; k++) {
        const i = sparkHead;
        sparkHead = (sparkHead + 1) % SPARKS;
        tmpColor.set(color ?? NES_CYCLE[k % NES_CYCLE.length]);
        const a = Math.random() * Math.PI * 2;
        const s = speed * (0.3 + Math.random() * 0.8);
        sparkPos.set([x, y, 0.2], i * 3);
        sparkVel.set([Math.cos(a) * s, Math.sin(a) * s, 0], i * 3);
        sparkCol.set([tmpColor.r, tmpColor.g, tmpColor.b], i * 3);
        sparkLife[i] = 0.4 + Math.random() * 0.4;
      }
    }
    function stepSparks(dt) {
      for (let i = 0; i < SPARKS; i++) {
        if (sparkLife[i] <= 0) continue;
        sparkLife[i] -= dt;
        sparkVel[i * 3 + 1] -= 6 * dt;
        for (let a = 0; a < 2; a++) sparkPos[i * 3 + a] += sparkVel[i * 3 + a] * dt;
        if (sparkLife[i] <= 0) sparkPos[i * 3 + 1] = 1e5;
      }
      sparkGeo.attributes.position.needsUpdate = true;
      sparkGeo.attributes.color.needsUpdate = true;
    }

    // ---------- audio clock ----------
    audio = new Audio(params.get("audio") || songAudioUrl(WORK));
    audio.preload = "auto";
    const clock = new AudioClock(audio);
    let offset = Number(localStorage.getItem("binary-game-offset") || 0);
    const songTime = () => clock.now() + offset;
    await clock.ready();

    // ---------- state ----------
    let state = "title";
    let reg = 0;
    let cannonX = xOf(0);
    let score = 0;
    let combo = 0;
    let maxCombo = 0;
    const tally = { hits: 0, misses: 0, bosses: 0, bossTotal: 0, flips: 0 };
    const got = new Set();
    const history = [];
    let cur = null;
    let lesson = 0;
    let picks = {};
    // Animation timers run on the wall clock: song time jumps back at each loop.
    const now = () => performance.now() / 1000;
    let fireAt = -9;
    let fireY = LINE_Y;
    let crash = -9;
    let clearAt = Infinity;
    let lives = LIVES;
    let pass = 1;
    let beatBase = 0;
    let startedAt = 0;
    const gBeat = (t) => beatBase + tm.beatIndexAt(t);
    const gBeatFloat = (t) => beatBase + tm.beatFloat(t);
    const gTime = (b) => tm.beatTime(b - beatBase);
    const onBar = (b) => b - ((((b - tm.dropBeat) % 4) + 4) % 4);
    const LOOP_TO = onBar(tm.beatIndexAt(SECTIONS.chorus1 + 0.05));
    const LOOP_FROM = LOOP_TO + Math.floor((tm.beatIndexAt(SECTIONS.end) - LOOP_TO) / 4) * 4;
    const TUTOR_BEAT = tm.beatIndexAt(TUTOR_END);
    let lastCall = -1;
    let lastT = 0;
    const auto = params.has("auto");
    const touch = isTouch();
    const loud = () => state === "play";
    const guard = backGuard({ signal, playing: () => state === "play", onBack: () => togglePause() });
    const calls = [
      { t: 0.3, text: "TRAINING", color: NES.yellow, sub: T.training },
      { t: TUTOR_END, text: "READY?", color: NES.green, sub: T.ready },
      { t: SECTIONS.chorus1, text: "INVADERS!", color: NES.pink, sub: T.oneFlip },
      { t: SECTIONS.verse2, text: "8 → 15", color: NES.orange, sub: T.allFour },
      { t: SECTIONS.chorus2, text: "INVADERS!", color: NES.pink, sub: T.boss },
      { t: SECTIONS.bridge, text: "LIGHTS ON", color: NES.green, sub: T.lights },
      { t: SECTIONS.chorus3, text: "BOOGIE!", color: NES.pink, sub: T.lastWave },
      { t: SECTIONS.outro, text: "FINAL WAVE", color: NES.yellow, sub: T.faster },
    ];

    $("nums").innerHTML = Array.from({ length: 16 }, (_, v) => `<i>${v}</i>`).join("");
    const numChips = [...$("nums").children];
    $("switches").innerHTML =
      PLACES.map((p, l) => `<button class="sw" data-lane="${l}"><small>${p}</small><b>0</b><em>${KEY_LABELS[l]}</em></button>`).join("") +
      `<button class="sw clr"><small>${T.clear}</small><b>0</b><em>${T.space}</em></button>` +
      `<div class="readout"><small>VALUE</small><span>= 0</span></div>`;
    const switches = [...$("switches").querySelectorAll(".sw:not(.clr)")];
    const clearBtn = $("switches").querySelector(".clr");
    const readout = $("switches").querySelector(".readout span");

    function showReg() {
      switches.forEach((s, l) => {
        const on = !!(reg & PLACES[l]);
        s.classList.toggle("on", on);
        s.querySelector("b").textContent = on ? 1 : 0;
        leds[l].material.color.set(on ? NES.yellow : NES.navy);
      });
      readout.textContent = `= ${reg}`;
    }
    function showLives() {
      $("lives").innerHTML = Array.from({ length: Math.max(LIVES, lives) }, (_, i) => `<i class="${i < lives ? "on" : ""}">♥</i>`).join("");
    }
    function setTip(text) {
      $("tip").textContent = text;
      $("tip").classList.toggle("on", !!text);
    }
    /** Back to an empty sky; `fresh` also clears the score (a new game rather than a demo loop). */
    function reset(fresh = true) {
      cur = null;
      lesson = 0;
      picks = {};
      history.length = 0;
      fireAt = crash = -9;
      clearAt = Infinity;
      beatBase = 0;
      pass = 1;
      setTip("");
      if (!fresh) return;
      lives = LIVES;
      showLives();
      reg = 0;
      score = combo = maxCombo = 0;
      Object.keys(tally).forEach((k) => (tally[k] = 0));
      got.clear();
      numChips.forEach((c) => c.classList.remove("got", "pop"));
      lastCall = -1;
      $("lyric").dataset.cue = "";
      $("lyric").innerHTML = "";
      showReg();
      updateScore();
    }
    const mult = () => (combo >= 30 ? 4 : combo >= 15 ? 3 : combo >= 6 ? 2 : 1);
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
      j.style.textShadow = `0 4px 0 #1d2b53, 0 0 18px ${color}`;
      j.classList.remove("show");
      void j.offsetWidth;
      j.classList.add("show");
    }
    function slam(text, color, sub = "") {
      const b = $("band");
      b.innerHTML = `${text}${sub ? `<small>${sub}</small>` : ""}`;
      b.style.color = color;
      b.style.textShadow = `0 5px 0 #1d2b53, 0 0 28px ${color}`;
      b.classList.remove("show");
      void b.offsetWidth;
      b.classList.add("show");
    }

    function flip(l) {
      reg ^= PLACES[l];
      tally.flips++;
      showReg();
      switches[l].classList.add("down");
      setTimeout(() => switches[l].classList.remove("down"), 80);
      if (loud()) sfx.chip(reg & PLACES[l] ? 7 - l : 2 - l, true);
    }
    /** All switches off: back to 0. */
    function clearAll() {
      clearBtn.classList.add("down");
      setTimeout(() => clearBtn.classList.remove("down"), 80);
      if (!reg) return;
      reg = 0;
      showReg();
      if (loud()) sfx.chip(0, false);
    }

    /** Height of invader n: one quick step down per beat until it reaches the line, where it waits. */
    function yOf(n, t) {
      const b = gBeatFloat(t) - n.b0;
      const k = Math.floor(b);
      return lerp(SPAWN_Y, LINE_Y, clamp((k + smooth(0, 0.3, b - k)) / (n.b1 - n.b0), 0, 1));
    }

    /**
     * The next invader for a spawn at time t: lessons, then drills, until
     * the lessons end; then Gray code in the choruses and outro (a 15 boss
     * when a chorus's "boogie" falls during its march), 8 to 15 in verse 2
     * and the bridge's clear-and-light sequence.
     */
    function pick(t, landing, lessonTime) {
      if (lessonTime) {
        const L = LESSONS[lesson] ?? { value: DRILLS[(lesson - LESSONS.length) % DRILLS.length], tip: null };
        lesson++;
        return { value: L.value, tip: L.tip?.[lang] ?? "", lesson: true };
      }
      const s = sectionAt(t);
      const next = (key, list) => {
        picks[key] ??= 0;
        return list[picks[key]++ % list.length];
      };
      if (s.startsWith("chorus") && !picks[`boss${s}`] && boogies.some((b) => b >= t && b <= landing + 0.5)) {
        picks[`boss${s}`] = 1;
        return { value: 15, boss: true };
      }
      if (s === "verse2" && (picks.verse2 ?? 0) < VERSE2_VALUES.length) return { value: next("verse2", VERSE2_VALUES) };
      if (s === "bridge" && (picks.bridge ?? 0) < BRIDGE_VALUES.length) return { value: next("bridge", BRIDGE_VALUES) };
      return { value: next("gray", GRAY) };
    }

    /**
     * One invader at a time. It appears on a beat and marches one step per
     * beat toward the line; the beat after the switches spell its number it
     * is shot. Later invaders get through on the beat they reach the line,
     * and march faster over the song; lessons wait on the line for ever. The next one appears two beats
     * after the last is shot or gets through, skipping a number the switches
     * already spell. The switches clear themselves a moment after each shot.
     */
    function direct(t) {
      const bi = gBeat(t);
      if (now() >= clearAt) {
        clearAt = Infinity;
        reg = 0;
        showReg();
      }
      if (!cur || (cur.done && bi >= cur.next)) {
        const b0 = bi + 1;
        const lessonTime = b0 < TUTOR_BEAT;
        const march = lessonTime ? LESSON_MARCH : clamp(Math.round(MARCH[0] - (b0 - TUTOR_BEAT) / SPEEDUP), MARCH[1], MARCH[0]);
        const b1 = b0 + march;
        if (lessonTime && b0 + 6 > TUTOR_BEAT) return;
        let next = pick(gTime(b0), gTime(b1), lessonTime);
        if (!next.lesson && next.value === reg) next = pick(gTime(b0), gTime(b1), lessonTime);
        const n = { ...next, b0, b1, done: false, result: null, at: 0, armed: null };
        n.deadline = n.lesson ? Infinity : b1;
        if (n.boss) tally.bossTotal++;
        cur = n;
        history.push(n);
        if (history.length > 200) history.shift();
        setTip(n.tip ?? "");
        return;
      }
      if (cur.done || bi < cur.b0) return;
      if (cur.lesson && bi >= TUTOR_BEAT) {
        Object.assign(cur, { done: true, result: "gone", at: now(), next: bi + 1 });
        setTip("");
        return;
      }
      if (reg === cur.value) {
        cur.armed ??= bi + 1;
        if (bi >= cur.armed) kill(cur, t, bi);
        return;
      }
      cur.armed = null;
      if (bi >= cur.deadline) escape(cur, t, bi);
    }

    function kill(n, t, bi) {
      Object.assign(n, { done: true, result: "hit", at: now(), next: bi + 2 });
      tally.hits++;
      if (n.boss) tally.bosses++;
      combo++;
      maxCombo = Math.max(maxCombo, combo);
      score += (n.boss ? 1000 : 300) * mult();
      fireAt = now();
      clearAt = now() + 0.25;
      fireY = yOf(n, t);
      burst(xOf(n.value), fireY, n.boss ? 90 : 34, null, n.boss ? 7 : 5);
      buzz(n.boss ? 30 : 10);
      got.add(n.value);
      const chip = numChips[n.value];
      chip.classList.add("got");
      chip.classList.remove("pop");
      void chip.offsetWidth;
      chip.classList.add("pop");
      if (loud()) {
        sfx.laser();
        sfx.boom(n.boss);
        if (n.boss) sfx.collect(4);
        else if (combo % 10 === 0) sfx.combo();
      }
      const bits = n.value.toString(2).padStart(4, "0");
      if (n.boss && lives < MAX_LIVES) {
        lives++;
        showLives();
      }
      judgeText(n.boss ? "BOSS DOWN! +1 ♥" : combo >= 6 && combo % 5 === 0 ? `${combo} COMBO!` : `${n.value} = ${bits}`, n.boss ? NES.pink : NES_CYCLE[n.value % NES_CYCLE.length]);
      if (n.lesson) setTip(lesson >= LESSONS.length ? "" : T.nice);
      updateScore();
    }

    function escape(n, t, bi) {
      Object.assign(n, { done: true, result: "miss", at: now(), next: bi + 2 });
      tally.misses++;
      combo = 0;
      crash = now();
      lives--;
      showLives();
      burst(xOf(n.value), LINE_Y, 16, NES.red, 3);
      buzz(45);
      if (loud()) sfx.wrong();
      judgeText(T.want(n.value, n.value.toString(2).padStart(4, "0")), NES.red);
      updateScore();
      if (lives <= 0 && state === "play") finish();
    }

    /** The demo and `?auto`: flips toward the invader a beat after it lands. */
    function autopilot(t) {
      if (!cur || cur.done || reg === cur.value || t < gTime(cur.b1) - 0.3) return;
      const l = PLACES.findIndex((p) => (reg ^ cur.value) & p);
      if (l >= 0) flip(l);
    }

    // ---------- input ----------
    window.addEventListener("keydown", (e) => {
      sfx.unlock();
      const k = e.key.toLowerCase();
      if (e.key === "Escape" || k === "p") togglePause();
      else if (k === "r" && state === "result") start();
      else if ((e.key === " " || e.key === "Enter") && state === "title") start();
      else if (e.key === " " && state === "play") clearAll();
      else if (k in KEYS) {
        if (state === "play" && !e.repeat) flip(KEYS[k]);
      } else if (e.key === "[" || e.key === "]") {
        offset = Math.round((offset + (e.key === "]" ? 0.01 : -0.01)) * 100) / 100;
        localStorage.setItem("binary-game-offset", String(offset));
        judgeText(`SYNC ${offset >= 0 ? "+" : ""}${Math.round(offset * 1000)} ms`, "#ffffff");
      } else return;
      if (e.key === " ") e.preventDefault();
    }, { signal });
    root.addEventListener("pointerdown", () => sfx.unlock(), { signal });
    clearBtn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      if (state === "play") clearAll();
    }, { signal });
    switches.forEach((s, l) => s.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      if (state === "play") flip(l);
    }, { signal }));
    root.querySelectorAll("#title button, #result button").forEach((b) => b.addEventListener("pointerenter", () => sfx.hover(4), { signal }));
    $("pause").addEventListener("click", togglePause);
    $("start").addEventListener("click", start);
    $("again").addEventListener("click", start);

    function start() {
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
      startedAt = now();
      if (audio.currentTime >= TUTOR_END) lesson = LESSONS.length;
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
    /** The song never ends: on the bar before its end, jump back to the first chorus and speed up. */
    function loopBack(t) {
      const to = tm.beatTime(LOOP_TO) + Math.max(0, t - tm.beatTime(LOOP_FROM));
      audio.currentTime = to;
      if (audio.paused) audio.play();
      beatBase += LOOP_FROM - LOOP_TO;
      pass++;
      picks = {};
      lastCall = -1;
      slam(ui.round(pass), NES.yellow, ui.faster);
      return to;
    }

    function finish() {
      state = "result";
      audio.pause();
      awake.release();
      setTip("");
      const played = tally.hits + tally.misses;
      const grade = tally.hits >= 60 ? "S" : tally.hits >= 40 ? "A" : tally.hits >= 25 ? "B" : tally.hits >= 12 ? "C" : "D";
      const gradeColor = { S: NES.yellow, A: NES.blue, B: NES.green, C: NES.orange, D: NES.red }[grade];
      const secs = Math.round(now() - startedAt);
      $("result").querySelector(".kicker").textContent = "GAME OVER";
      $("grade").textContent = grade;
      $("grade").style.color = gradeColor;
      $("grade").style.textShadow = `0 6px 0 #1d2b53, 0 0 40px ${gradeColor}`;
      $("final").textContent = ui.points(score.toLocaleString("en-US"));
      sfx.result(grade <= "B");
      $("stats").innerHTML = [
        [T.shot, T.shotN(tally.hits)],
        [T.through, `${tally.misses} / ${played}`],
        ["Boss", `${tally.bosses} / ${tally.bossTotal}`],
        [ui.lasted, ui.round(pass)],
        [ui.survived, ui.duration(secs)],
        [T.collected, `${got.size} / 16`],
        [ui.maxCombo, maxCombo],
      ]
        .map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`)
        .join("");
      $("result").hidden = false;
    }

    // ---------- lyrics ----------
    const colorWord = (text) =>
      BIN.test(text.toLowerCase().replace(/[^a-z-]/g, ""))
        ? text.replace(/one|zero/gi, (m) => `<em style="font-style:normal;color:${WORD_COLORS[m.toLowerCase()]}">${m}</em>`)
        : text;
    function drawLyric(t) {
      const el = $("lyric");
      const at = tm.cueAt(t);
      const key = at ? String(at.index) : "";
      if (el.dataset.cue !== key) {
        el.dataset.cue = key;
        el.innerHTML = at ? at.cue.words.map((w) => `<span style="${WORD_COLORS[w.clean] ? `color:${WORD_COLORS[w.clean]}` : ""}">${colorWord(w.text)}</span>`).join(" ") : "";
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
        if (t < lastT) reset(false);
        autopilot(t);
        direct(t);
      } else {
        t = state === "play" ? songTime() : lastT;
        if (state === "play") {
          if (t >= tm.beatTime(LOOP_FROM) || audio.ended) t = loopBack(t);
          if (auto) autopilot(t);
          direct(t);
        }
      }
      lastT = t;
      render(t, dt);
    }

    function render(t, dt) {
      const kick = tm.pulse(t, 0.12);
      const wall = now();
      const shot = Math.exp(-Math.max(0, wall - fireAt) / 0.12);
      const hurt = Math.exp(-Math.max(0, wall - crash) / 0.3);
      const bi = gBeat(t);
      const beatFrame = bi & 1;

      const portrait = camera.aspect < 0.9;
      const dist = portrait ? clamp(5.6 / (Math.tan(THREE.MathUtils.degToRad(27)) * camera.aspect), 13, 30) : 12.5;
      const shake = hurt * 0.15 + shot * 0.03;
      const cy = portrait ? 3.6 : touch ? 2.3 : 3.3;
      camera.position.set((Math.random() - 0.5) * shake, cy + (Math.random() - 0.5) * shake, dist);
      camera.lookAt(0, cy, 0);
      camera.fov = 54;
      camera.updateProjectionMatrix();
      city.material.color.setScalar(0.55 + kick * 0.45);

      const front = cur && !cur.done && bi >= cur.b0 ? cur : null;
      switches.forEach((s, l) => s.classList.toggle("need", !!front?.lesson && !!((reg ^ front.value) & PLACES[l])));
      clearBtn.classList.toggle("need", !!front?.lesson && front.value === 0 && reg !== 0);
      const lag = xOf(reg) - cannonX;
      cannonX = lerp(cannonX, xOf(reg), 1 - Math.exp(-dt * 22));
      cannon.position.set(cannonX, 0, 0);
      ship.position.y = kick * 0.04 - shot * 0.12;
      ship.rotation.z = clamp(-lag * 0.12, -0.35, 0.35);
      muzzle.scale.setScalar(0.3 + kick * 0.12 + shot * 0.6);
      muzzle.material.color.set(shot > 0.2 ? NES.yellow : front && reg === front.value ? NES.green : NES.lilac);
      thruster.scale.set(1.5 + kick * 0.4 + Math.abs(lag) * 0.6, 0.45 + kick * 0.15, 1);
      ticks.forEach((m, v) => {
        m.material.opacity = v === reg ? 1 : 0.4;
        m.scale.setScalar(v === reg ? 1.35 : 1);
      });

      const shown = cur && bi >= cur.b0 && (!cur.done || (cur.result !== "hit" && wall - cur.at < 0.5)) ? cur : null;
      invPool.forEach((m, i) => (m.visible = i === 0 && !!shown));
      let y = LINE_Y;
      if (shown) {
        const m = invPool[0];
        const landed = bi >= shown.b1;
        y = shown.result === "miss" ? LINE_Y - (wall - shown.at) * 6 : shown.result === "gone" ? yOf(shown, t) + (wall - shown.at) * 12 : yOf(shown, t) + (landed ? kick * 0.12 : 0);
        const urgent = !shown.done && shown.deadline !== Infinity && shown.deadline - bi <= 2;
        m.material.map = invTex(shown.value, beatFrame, shown.boss);
        m.position.set(xOf(shown.value) + (beatFrame ? 0.04 : -0.04), y, 0.1);
        m.scale.setScalar((shown.boss ? 1.8 : 1) * clamp((gBeatFloat(t) - shown.b0) * 2.5, 0, 1) * (1.08 + kick * 0.06));
        m.material.opacity = shown.done ? Math.max(0, 1 - (wall - shown.at) * 2.5) : 1;
        m.material.color.set(shown.result === "miss" || (urgent && beatFrame) ? NES.red : "#ffffff");
      }

      const answer = front && (front.lesson || bi >= front.b0 + Math.ceil((front.b1 - front.b0) / 2));
      hints.forEach((h, l) => {
        h.material.opacity = answer ? 0.95 : 0;
        if (!answer) return;
        h.material.color.set(bitsOf(front.value)[l] ? NES.yellow : NES.blue);
        h.position.set(xOf(front.value) + (l - 1.5) * 0.36, y - (front.boss ? 1.4 : 0.98), 0.2);
      });

      aim.material.opacity = front && reg === front.value ? 0.35 + kick * 0.3 : 0;
      if (front) {
        aim.scale.y = Math.max(0.01, y - MUZZLE_Y);
        aim.position.set(cannonX, (y + MUZZLE_Y) / 2, 0);
      }
      beam.material.opacity = shot;
      beam.scale.y = Math.max(0.01, fireY - MUZZLE_Y);
      beam.position.set(cannonX, (fireY + MUZZLE_Y) / 2, 0.15);

      stepSparks(dt);
      bloom.strength = 0.5 + kick * 0.2 + shot * 0.3;
      post.uniforms.uTime.value = t;
      post.uniforms.uCA.value = 0.3 + kick * 0.4 + shot * 0.4 + hurt * 1.5;
      post.uniforms.uGlitch.value = hurt * 0.5;
      post.uniforms.uFlash.value = shot * 0.03 + hurt * 0.06;
      post.uniforms.uFlashColor.value.set(hurt > shot ? NES.red : NES.yellow);
      composer.render();

      if (state !== "title") hudFrame(t);
    }

    function hudFrame(t) {
      $("progress").firstElementChild.style.width = `${clamp(t / SECTIONS.end, 0, 1) * 100}%`;
      drawLyric(t);
      if (state !== "play") return;
      const c = calls.findLast((x) => x.t <= t);
      if (c && c.t !== lastCall && t - c.t < 0.5) {
        lastCall = c.t;
        slam(c.text, c.color, c.sub);
      }
    }

    showReg();
    showLives();
    $("start").disabled = false;
    $("start").textContent = ui.start;
    if (params.has("play")) start();
    frame();
    const api = { history, tally: () => ({ ...tally, score, combo, maxCombo, collected: got.size, reg, lives, pass, beatBase, current: cur && { value: cur.value, done: cur.done, lesson: !!cur.lesson } }), destroy };
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
