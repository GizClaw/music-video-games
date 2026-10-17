import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { Timing, clamp, easeOutBack, lerp, smooth } from "@gizclaw/mvg-core/timing.js";
import { AudioClock, GamePostShader, glowTexture, songAudioUrl } from "./kit.js";
import analysis from "./prime/analysis.json";
import { COLORS, FAKES, GOLD, ORDER, PRIMES, RANGES, SECTIONS, SIEVES, WORD_COLORS, explain, isPrime, numberWord, sungNumbers, wordKey } from "./prime/song.js";
import { primeMarkup, primeStyle } from "./prime/style.js";
import { COMMON, gameLang } from "./lang.js";
import { Life, createFinale } from "./finale.js";

const TEXT = {
  zh: {
    touchKeys: ["质数会踩着节拍弹起来", "跟着节拍闪到最亮时点它", "漏掉质数会掉血，血条空了就失败；撑过 2 轮就通关"],
    intro: "只有质数会弹起来，闪到最亮时点它",
    singAlong: "跟着唱！",
    verse1: "唱到的质数都会弹起来",
    chorus1: "唱到 line 时 ×2 · ×3 自动筛掉倍数",
    verse2: "一拍一个",
    chorus2: "×5 · ×7 筛子",
    verse3: "25、1、4 不是质数，会被乘法划掉",
    chorus3: "双重筛子",
    bridge: "25 个质数连发，点亮整块板",
    outro: "越来越快",
    fullBoard: "25 个质数全部点亮",
    prime: (e) => `${e} · 质数`,
    sieveSub: (ps) => `${ps.join("、")} 的倍数全部按下去`,
    sieveWhy: (ps) => `${ps.map((p) => `${p} 的倍数`).join("和")}都不是质数`,
    tipPrime: (n) => `${n} 是质数：等它跟着节拍闪到最亮时点下去，就是 PERFECT`,
    missed: "漏掉质数",
    sieves: "引爆筛子",
    boards: "点满质数板",
    times: (n) => `${n} 次`,
  },
  en: {
    touchKeys: ["Primes pop up on the beat", "Tap them as they flash brightest", "A missed prime drains your life; last 2 rounds to clear"],
    intro: "only primes pop up: hit them as they flash brightest",
    singAlong: "SING ALONG!",
    verse1: "every prime sung pops up",
    chorus1: "on “line” the ×2 · ×3 sieve clears the multiples",
    verse2: "one a beat",
    chorus2: "the ×5 · ×7 sieve",
    verse3: "25, 1 and 4 are not prime: multiplication crosses them out",
    chorus3: "a double sieve",
    bridge: "all 25 primes in a row: light the whole board",
    outro: "faster and faster",
    fullBoard: "all 25 primes lit",
    prime: (e) => `${e} · prime`,
    sieveSub: (ps) => `every multiple of ${ps.join(" and ")} knocked down`,
    sieveWhy: (ps) => `multiples of ${ps.join(" and ")} are not prime`,
    tipPrime: (n) => `${n} is prime: hit it as it flashes brightest on the beat for a PERFECT`,
    missed: "Primes missed",
    sieves: "Sieves",
    boards: "Full boards",
    times: (n) => `${n}`,
  },
};
import { backGuard, buzz, goFullscreen, isTouch, lockGestures, wakeLock } from "./mobile.js";
import { sfx } from "./sfx.js";

const WORK = "songs/music/stem-institute/en-us/prime-time";
const TILE = 0.9;
const BEST = { perfect: 0.09, great: 0.18 }; // seconds either side of a beat a hit counts as on it
const RISE = 0.08; // seconds a tile takes to pop up
const LIFE_RULES = { miss: 10, good: 1, great: 2, perfect: 3, board: 30 };
const ROUNDS = 2; // passes through the song to clear the stage
const LABELS = 10; // multiplication labels on screen at once
const LESSON = [2, 4, 3, 9, 5, 6, 7, 8, 3, 10, 2, 9]; // the intro's fillers: primes and non-primes taking turns
const AIM = { mouse: 1.25, touch: 1.6 }; // how far from a tile that is up a tap still counts, in its own half-widths
const POP = { mouse: 0.45, touch: 1.4 }; // how much a tile that is up grows; on phones it pops out big enough for a finger
const HIT_KEYS = new Set([" ", "j", "f", "k", "d"]);
const ATTRACT = [SECTIONS.chorus1, SECTIONS.verse2];
const HALOS = 24; // glows under the tiles that are up
const RIPPLES = 16;
const KIND_COLOR = { prime: GOLD, not: COLORS.red, sieve: "#bff6ff" };
/** "21" -> "3×7": smallest factor first. */
const product = (n) => {
  if (n === 1) return "1×1";
  let a = 2;
  while (n % a) a++;
  return `${a}×${n / a}`;
};

/** The board fills the free band. */
/** How much of the world the camera frames. Phones frame the board tightly so the tiles stay big enough to tap. */
const layout = (aspect, touch) => (touch ? { w: 10.4, h: 10.5 } : aspect >= 1.15 ? { w: 12.6, h: 11.6 } : { w: 11.4, h: 12.4 });

/** 1 to 100 on a 10×10 sheet; the tile shader cuts its number out by instance. */
function numberAtlas() {
  const c = document.createElement("canvas");
  c.width = c.height = 2048;
  const g = c.getContext("2d");
  const cell = c.width / 10;
  g.fillStyle = "#ffffff";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = `800 ${Math.round(cell * 0.56)}px "Avenir Next Condensed", "Arial Narrow", sans-serif`;
  for (let k = 1; k <= 100; k++) g.fillText(String(k), (((k - 1) % 10) + 0.5) * cell, (Math.floor((k - 1) / 10) + 0.54) * cell);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}

/** Small seeded generator, so each pass deals the same chart every game. */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let styleMounted = false;
function ensureStyle() {
  if (styleMounted) return;
  const el = document.createElement("style");
  el.dataset.mvg = "prime-time";
  el.textContent = primeStyle;
  document.head.appendChild(el);
  styleMounted = true;
}

function sectionAt(t) {
  let s = ORDER[0];
  for (const k of ORDER) if (t >= SECTIONS[k]) s = k;
  return s;
}
const colOf = (k) => (k - 1) % 10;
const rowOf = (k) => Math.floor((k - 1) / 10);

/**
 * Mount Prime Time into `target` (an element or a selector). The HUD and
 * canvas are created inside that element. `options.audio`, `options.start`,
 * `options.play` and `options.auto` override the page query.
 * `options.backHref` shows a link back to a gallery; omit it when embedding.
 * @param {Element | string} target
 * `options.lang` (`zh` or `en`) picks the language, else the universe hub's choice.
 * @param {{ audio?: string, start?: number | string, play?: boolean, auto?: boolean, backHref?: string, search?: string, lang?: "zh" | "en" }} [options]
 * @returns {Promise<{ destroy: () => void, tally: () => object }>}
 */
export async function mountPrimeTime(target, options = {}) {
  const root = typeof target === "string" ? document.querySelector(target) : target;
  if (!root) throw new Error("mountPrimeTime: target not found");
  ensureStyle();
  root.classList.add("mvg-game", "prime");
  const lang = gameLang(options.lang);
  const ui = COMMON[lang];
  const T = TEXT[lang];
  const why = (n) => explain(n, lang);
  root.innerHTML = primeMarkup(lang);
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
    root.classList.remove("mvg-game", "prime");
    if (root.mvgGame) delete root.mvgGame;
    if (window.__game?.destroy === destroy) delete window.__game;
  }

  try {
    const tm = new Timing(analysis);
    tm.setDownbeat(SECTIONS.drop);
    const period = tm.period;

    // ---------- renderer ----------
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    $("stage").appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
    const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.45, 0.72);
    const post = new ShaderPass(GamePostShader);
    [new RenderPass(scene, camera), bloom, post, new OutputPass()].forEach((p) => composer.addPass(p));
    let lay = layout(16 / 9, touch);
    let view = { w: 1, h: 1 };
    /** The screen band [top, bottom] in px between the lyric line and the factor line; measured once the HUD shows. */
    let band = null;
    function measureBand() {
      if ($("hud").hidden) return null;
      // On a phone the board fills the screen: the score sits beside it in landscape and above it in portrait.
      if (touch) return camera.aspect >= 1.15 ? [6, view.h - 58] : [118, view.h - 12];
      const top = (parseFloat(getComputedStyle($("lyric")).top) || 60) + (camera.aspect < 1.15 ? 66 : 36);
      const bottom = view.h - Math.max(14, view.h * 0.025) - (view.h < 500 ? 44 : 92);
      return bottom - top > 80 ? [top, bottom] : null;
    }
    function resize() {
      band = null;
      const rect = root.getBoundingClientRect();
      view = { w: Math.max(1, rect.width), h: Math.max(1, rect.height) };
      renderer.setSize(view.w, view.h, false);
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(view.w, view.h);
      camera.aspect = view.w / view.h;
      lay = layout(camera.aspect, touch);
    }
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(root);
    resize();

    // ---------- scene ----------
    const bgU = { uTime: { value: 0 }, uKick: { value: 0 }, uWin: { value: 0 }, uHurt: { value: 0 } };
    const bg = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        depthTest: false,
        depthWrite: false,
        uniforms: bgU,
        vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
        fragmentShader: /* glsl */ `
          uniform float uTime, uKick, uWin, uHurt; varying vec2 vUv;
          void main() {
            vec2 p = vUv - 0.5;
            float a = atan(p.y, p.x);
            float r = length(p);
            float rays = smoothstep(0.2, 0.8, 0.5 + 0.5 * sin(a * 16.0 + uTime * 0.4));
            vec3 base = mix(vec3(0.03, 0.02, 0.09), vec3(0.1, 0.04, 0.2), rays * smoothstep(0.75, 0.05, r));
            base += mix(vec3(0.25, 0.1, 0.5), vec3(0.9, 0.6, 0.15), uWin) * exp(-r * 3.2) * (0.25 + uKick * 0.2 + uWin * 0.5);
            base += vec3(0.5, 0.0, 0.08) * uHurt * smoothstep(0.2, 0.75, r);
            gl_FragColor = vec4(base, 1.0);
          }`,
      }),
    );
    bg.renderOrder = -1;
    bg.frustumCulled = false;
    scene.add(bg);

    const atlas = numberAtlas();
    const tileGeo = new RoundedBoxGeometry(TILE, TILE, 0.26, 3, 0.1);
    const tileState = new Float32Array(100 * 4);
    const tileMore = new Float32Array(100 * 4);
    tileGeo.setAttribute("aState", new THREE.InstancedBufferAttribute(tileState, 4));
    tileGeo.setAttribute("aMore", new THREE.InstancedBufferAttribute(tileMore, 4));
    const tiles = new THREE.InstancedMesh(
      tileGeo,
      new THREE.ShaderMaterial({
        uniforms: { uGold: { value: new THREE.Color(GOLD) }, uAtlas: { value: atlas } },
        vertexShader: /* glsl */ `
          attribute vec4 aState; attribute vec4 aMore;
          varying vec3 vN; varying vec2 vFace; varying float vFront; varying vec4 vS; varying vec4 vM;
          void main() {
            vS = aState; vM = aMore;
            vFace = position.xy / ${TILE.toFixed(2)} + 0.5;
            vFront = step(0.6, normal.z);
            mat4 m = modelMatrix * instanceMatrix;
            vec3 n = mat3(m) * normal;
            vN = dot(n, n) > 1e-12 ? normalize(n) : vec3(0.0, 0.0, 1.0);
            gl_Position = projectionMatrix * viewMatrix * m * vec4(position, 1.0);
          }`,
        // aState: lit, crossed, rim, pop. aMore: number - 1, white flash, red flash.
        fragmentShader: /* glsl */ `
          uniform vec3 uGold; uniform sampler2D uAtlas;
          varying vec3 vN; varying vec2 vFace; varying float vFront; varying vec4 vS; varying vec4 vM;
          void main() {
            vec3 N = dot(vN, vN) > 1e-8 ? normalize(vN) : vec3(0.0, 0.0, 1.0);
            vec3 L = normalize(vec3(-0.4, 0.6, 0.7));
            float dif = 0.55 + 0.45 * max(dot(N, L), 0.0);
            vec3 c = mix(vec3(0.018, 0.024, 0.075), vec3(0.07, 0.012, 0.03), vS.y);
            c = mix(c, uGold * (1.05 + vS.w * 0.9), vS.x);
            c = mix(c, vec3(0.95, 0.12, 0.28), vM.z);
            c += vec3(0.5, 0.55, 0.7) * vM.y;
            c *= dif;
            vec2 q = vFace - 0.5;
            float box = max(abs(q.x), abs(q.y));
            c += vec3(0.85, 0.92, 1.0) * smoothstep(0.36, 0.45, box) * vS.z * vFront * 0.8;
            vec2 cr = vec2(mod(vM.x, 10.0), floor(vM.x / 10.0 + 0.01));
            vec2 f = clamp(vFace, 0.0, 1.0);
            float ink = texture2D(uAtlas, vec2((cr.x + f.x) / 10.0, 1.0 - (cr.y + 1.0 - f.y) / 10.0)).a * vFront * step(box, 0.47);
            vec3 txt = mix(mix(vec3(0.52, 0.58, 0.78), vec3(0.45, 0.2, 0.28), vS.y), vec3(0.17, 0.08, 0.0), vS.x);
            txt = mix(txt, vec3(1.0), clamp(vS.z, 0.0, 1.0) * 0.7);
            c = mix(c, mix(txt, vec3(1.0), vM.z), ink);
            float xx = max(1.0 - smoothstep(0.0, 0.035, abs(q.x - q.y)), 1.0 - smoothstep(0.0, 0.035, abs(q.x + q.y))) * step(box, 0.36);
            c = mix(c, vec3(1.0, 0.32, 0.42), xx * vS.y * vFront * 0.75);
            c += vec3(1.0) * pow(max(dot(reflect(-L, N), vec3(0.0, 0.0, 1.0)), 0.0), 24.0) * 0.18;
            gl_FragColor = vec4(clamp(c, 0.0, 4.0), 1.0);
          }`,
      }),
      100,
    );
    tiles.frustumCulled = false;
    scene.add(tiles);
    const dummy = new THREE.Object3D();
    const place = (mesh, i, x, y, z, s, rz = 0) => {
      dummy.position.set(x, y, z);
      dummy.rotation.set(0, 0, rz);
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    };
    const tileX = (k) => colOf(k) - 4.5;
    /** Where each tile was last drawn, as x, y, z and scale, so taps meet a tile that has popped out. */
    const drawn = new Float32Array(101 * 4);
    const grow = touch ? POP.touch : POP.mouse;
    const tileY = (k) => 4.5 - rowOf(k);

    // Marquee bulbs round the board and its dark backing.
    const bulbSpots = [];
    for (let side = 0; side < 4; side++) {
      for (let i = 0; i < 18; i++) {
        const s = i / 18;
        const w = 10.6;
        bulbSpots.push([[-w / 2 + s * w, w / 2], [w / 2, w / 2 - s * w], [w / 2 - s * w, -w / 2], [-w / 2, -w / 2 + s * w]][side]);
      }
    }
    const marquee = new THREE.InstancedMesh(new THREE.SphereGeometry(0.11, 14, 10), new THREE.MeshBasicMaterial({ color: "#ffffff" }), bulbSpots.length);
    bulbSpots.forEach(([x, y], i) => {
      place(marquee, i, x, y, 0.1, 1);
      marquee.setColorAt(i, new THREE.Color("#3a2a10"));
    });
    const backing = new THREE.Mesh(new THREE.PlaneGeometry(10.9, 10.9), new THREE.MeshBasicMaterial({ color: COLORS.ink }));
    backing.position.z = -0.3;
    scene.add(backing, marquee);

    // A glow under each tile that is up, and ripples where a tap lands.
    const ringMat = () => new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false });
    const halos = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: glowTexture(), color: "#ffffff", transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), HALOS);
    const ripples = new THREE.InstancedMesh(new THREE.RingGeometry(0.9, 1, 48), ringMat(), RIPPLES);
    halos.renderOrder = 1;
    for (const m of [halos, ripples]) {
      for (let i = 0; i < m.count; i++) m.setColorAt(i, new THREE.Color("#000000"));
      m.frustumCulled = false;
      m.renderOrder ||= 2;
      scene.add(m);
    }
    const ripple = Array.from({ length: RIPPLES }, () => ({ x: 0, y: 0, at: -9, color: new THREE.Color() }));
    let rippleHead = 0;
    function addRipple(x, y, color) {
      const r = ripple[rippleHead];
      rippleHead = (rippleHead + 1) % RIPPLES;
      Object.assign(r, { x, y, at: performance.now() / 1000 });
      r.color.set(color);
    }

    const SPARKS = 900;
    const sparkPos = new Float32Array(SPARKS * 3);
    const sparkCol = new Float32Array(SPARKS * 3);
    const sparkVel = new Float32Array(SPARKS * 3);
    const sparkLife = new Float32Array(SPARKS);
    const sparkGeo = new THREE.BufferGeometry();
    sparkGeo.setAttribute("position", new THREE.BufferAttribute(sparkPos, 3));
    sparkGeo.setAttribute("color", new THREE.BufferAttribute(sparkCol, 3));
    const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ size: 0.14, vertexColors: true }));
    sparks.frustumCulled = false;
    scene.add(sparks);
    let sparkHead = 0;
    const tmpColor = new THREE.Color();
    function burst(x, y, n, colors, speed = 4) {
      for (let k = 0; k < n; k++) {
        const i = sparkHead;
        sparkHead = (sparkHead + 1) % SPARKS;
        tmpColor.set(colors[k % colors.length]);
        const a = Math.random() * Math.PI * 2;
        const s = speed * (0.3 + Math.random() * 0.8);
        sparkPos.set([x, y, 0.8], i * 3);
        sparkVel.set([Math.cos(a) * s, Math.sin(a) * s, 0], i * 3);
        sparkCol.set([tmpColor.r, tmpColor.g, tmpColor.b], i * 3);
        sparkLife[i] = 0.35 + Math.random() * 0.45;
      }
    }
    function stepSparks(dt) {
      for (let i = 0; i < SPARKS; i++) {
        if (sparkLife[i] <= 0) continue;
        sparkLife[i] -= dt;
        sparkVel[i * 3 + 1] -= 5 * dt;
        for (let a = 0; a < 2; a++) sparkPos[i * 3 + a] += sparkVel[i * 3 + a] * dt;
        if (sparkLife[i] <= 0) sparkPos[i * 3 + 1] = 1e5;
      }
      sparkGeo.attributes.position.needsUpdate = true;
      sparkGeo.attributes.color.needsUpdate = true;
    }

    // ---------- chart ----------
    const onBar = (b) => b - ((((b - tm.dropBeat) % 4) + 4) % 4);
    const LOOP_TO = onBar(tm.beatIndexAt(SECTIONS.chorus1 + 0.05));
    const LOOP_FROM = LOOP_TO + Math.floor((tm.beatIndexAt(SECTIONS.end) - LOOP_TO) / 4) * 4;
    const T_TO = tm.beatTime(LOOP_TO);
    const T_FROM = tm.beatTime(LOOP_FROM);
    const SPAN = T_FROM - T_TO;
    const atBeat = (f) => {
      const i = Math.floor(f);
      return lerp(tm.beatTime(i), tm.beatTime(i + 1), f - i);
    };
    /** Each chorus's "Check the line!": the beat of "line", and the primes it sieves. */
    const LINES = Object.entries(SIEVES).flatMap(([s, groups]) => {
      const end = SECTIONS[ORDER[ORDER.indexOf(s) + 1]];
      const words = tm.cues.flatMap((c) => c.words).filter((w) => w.clean === "line" && w.start >= SECTIONS[s] && w.start < end);
      return words.slice(0, groups.length).map((w, i) => ({ f: Math.round(tm.beatFloat(w.start)), sieve: groups[i] }));
    });
    /** Every sung number on its nearest beat, at most two to a beat; a third moves on to the next. */
    const SUNG = (() => {
      const per = new Map();
      let last = -Infinity;
      return sungNumbers(tm.cues).map(({ n, t }) => {
        let f = Math.max(last, Math.round(tm.beatFloat(t)));
        while ((per.get(f) ?? 0) >= 2) f++;
        per.set(f, (per.get(f) ?? 0) + 1);
        last = f;
        return { f, n };
      });
    })();
    /** Beats a tile stays up: long in practice, then shorter every pass. */
    const stayBeats = (p, t) => (p === 1 && t < SECTIONS.chorus1 ? 5 : Math.max(1.5, 3 - 0.4 * (p - 1)));

    /**
     * The notes of pass p, in game time (song time plus the loops before it).
     * Everything pops on a beat. Every number the song sings is a note on
     * the beat of its word, gold when prime and red when not; each "Check
     * the line!" is a white sieve note on its prime. Filler notes fill the
     * beats nobody sings on: every beat in the choruses, bridge and outro,
     * every 2 beats in the intro and verses of the first pass and every
     * beat after. Fillers are
     * primes from the section's range, from the third pass with a red
     * non-prime now and then.
     */
    function buildPass(p) {
      const off = (p - 1) * SPAN;
      const from = p === 1 ? 0 : T_TO;
      const rand = seeded(p * 7919 + 17);
      const raw = [];
      for (const s of SUNG) {
        const t = atBeat(s.f);
        if (t >= from && t < T_FROM) raw.push({ f: s.f, n: s.n, kind: isPrime(s.n) ? "prime" : "not", sung: true });
      }
      for (const l of LINES) {
        const t = tm.beatTime(l.f);
        if (t >= from && t < T_FROM) raw.push({ f: l.f, n: l.sieve[0], kind: "sieve", sieve: l.sieve, sung: false });
      }
      const taken = raw.filter((x) => x.kind !== "sieve").map((x) => x.f);
      const recent = [];
      let lesson = 0;
      const firstBeat = Math.max(tm.beatIndexAt(from) + 1, p === 1 ? tm.beatIndexAt(3) + 1 : 0);
      for (let b = firstBeat; b < LOOP_FROM; b++) {
        const s = sectionAt(tm.beatTime(b));
        const step = s.startsWith("chorus") || s === "bridge" || s === "outro" || p > 1 ? 1 : 2;
        if ((((b - tm.dropBeat) % step) + step) % step) continue;
        if (taken.includes(b)) continue;
        if (s === "rules") {
          const n = LESSON[lesson++ % LESSON.length];
          raw.push({ f: b, n, kind: isPrime(n) ? "prime" : "not", sung: false });
          continue;
        }
        const [lo, hi] = RANGES[s];
        const not = rand() < 0.5;
        const pool = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i).filter((x) => isPrime(x) !== not && !recent.includes(x) && !raw.some((r) => r.sung && r.n === x && Math.abs(r.f - b) <= 4));
        const fakes = not ? pool.filter((x) => FAKES.includes(x)) : [];
        const list = fakes.length && rand() < Math.min(0.6, 0.15 + 0.15 * (p - 1)) ? fakes : pool;
        const n = list[Math.floor(rand() * list.length)];
        recent.push(n);
        if (recent.length > 3) recent.shift();
        raw.push({ f: b, n, kind: not ? "not" : "prime", sung: false });
      }
      raw.sort((a, b) => a.f - b.f);
      return raw.map((x) => {
        const t = atBeat(x.f);
        return { ...x, t, g: t + off, practice: p === 1 && t < SECTIONS.chorus1, stay: (x.kind === "prime" ? stayBeats(p, t) : 0) * period, pass: p, state: "wait", at: 0, grade: "" };
      });
    }

    // ---------- audio clock ----------
    audio = new Audio(params.get("audio") || songAudioUrl(WORK));
    audio.preload = "auto";
    const clock = new AudioClock(audio);
    let offset = Number(localStorage.getItem("prime-game-offset") || 0);
    const songTime = () => clock.now() + offset;
    await clock.ready();

    // ---------- state ----------
    let state = "title";
    let score = 0;
    let combo = 0;
    let maxCombo = 0;
    const life = new Life($("hp"), LIFE_RULES);
    const finale = createFinale(root, { c: ui, audio, signal });
    const tally = { perfect: 0, great: 0, good: 0, miss: 0, passed: 0, sieves: 0, boards: 0 };
    /** Board slot k: lit gold (a prime hit), crossed out (a non-prime hit or sieved), the last tap and the last miss. */
    const board = Array.from({ length: 101 }, () => ({ lit: 0, litAt: -9, cross: 0, crossAt: -9, tapAt: -9, redAt: -9, hitAt: -9 }));
    let litCount = 0;
    let notes = [];
    let pass = 1;
    let gameOff = 0;
    // Animation timers run on the wall clock: song time jumps back at each loop.
    const now = () => performance.now() / 1000;
    let crash = -9;
    let winAt = -9;
    let startedAt = 0;
    let lastCall = -1;
    let lastT = 0;
    let tipShown = "";
    const auto = params.has("auto");
    const loud = () => state === "play";
    const gNow = () => lastT + gameOff;
    /** Whether note n is up (and can be hit) at game time g. */
    const isUp = (n, g) => n.state === "wait" && n.kind === "prime" && g >= n.g - 0.03 && g <= n.g + n.stay;
    /** Seconds from game time g to the nearest beat after note n popped: its best moments. */
    const offBest = (n, g) => {
      const k = clamp(Math.round((g - n.g) / period), 1, Math.max(1, Math.floor(n.stay / period)));
      return g - (n.g + k * period);
    };
    const guard = backGuard({ signal, playing: () => state === "play", onBack: () => togglePause() });
    const calls = [
      { t: 0.3, text: "PRIME TIME", color: GOLD, sub: T.intro },
      { t: SECTIONS.verse1, text: T.singAlong, color: GOLD, sub: T.verse1 },
      { t: SECTIONS.chorus1, text: "CHECK THE LINE!", color: GOLD, sub: T.chorus1 },
      { t: SECTIONS.verse2, text: "37 → 71", color: COLORS.orange, sub: T.verse2 },
      { t: SECTIONS.chorus2, text: "CHECK THE LINE!", color: GOLD, sub: T.chorus2 },
      { t: SECTIONS.verse3, text: "73 → 97", color: COLORS.orange, sub: T.verse3 },
      { t: SECTIONS.chorus3, text: "PRIME TIME!", color: GOLD, sub: T.chorus3 },
      { t: SECTIONS.bridge, text: "PRIME RUSH", color: COLORS.red, sub: T.bridge },
      { t: SECTIONS.outro, text: "FINAL CHECK", color: GOLD, sub: T.outro },
    ];

    function showTally(pop = false) {
      const el = $("tally");
      el.innerHTML = `PRIMES <b>${litCount}</b> / 25`;
      if (!pop) return;
      el.classList.remove("pop");
      void el.offsetWidth;
      el.classList.add("pop");
    }
    function setTip(text) {
      if (text === tipShown) return;
      tipShown = text;
      $("tip").textContent = text;
      $("tip").classList.toggle("on", !!text);
    }
    function clearBoard() {
      board.forEach((b) => Object.assign(b, { lit: 0, cross: 0, tapAt: -9, redAt: -9, hitAt: -9 }));
      litCount = 0;
      showTally();
    }
    /** Back to an empty board; `fresh` also clears the score (a new game rather than a demo loop). */
    function reset(fresh = true) {
      crash = winAt = -9;
      clearBoard();
      setTip("");
      setExplain("");
      if (!fresh) {
        notes = buildPass(2);
        return;
      }
      pass = 1;
      gameOff = 0;
      notes = [...buildPass(1), ...buildPass(2)];
      life.reset();
      score = combo = maxCombo = 0;
      Object.keys(tally).forEach((k) => (tally[k] = 0));
      lastCall = -1;
      $("lyric").dataset.cue = "";
      $("lyric").innerHTML = "";
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
    let judgeAt = [0, 0];
    function judgeText(text, color, k) {
      const j = $("judge");
      j.textContent = text;
      j.style.color = color;
      j.style.textShadow = `0 0 18px ${color}`;
      judgeAt = [tileX(k), tileY(k) + (rowOf(k) < 2 ? -0.95 : 0.95)];
      j.classList.remove("show");
      void j.offsetWidth;
      j.classList.add("show");
    }
    function setExplain(text, color = "#ffffff") {
      const el = $("explain");
      el.textContent = text;
      el.style.color = color;
      el.classList.toggle("on", !!text);
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

    const labelEls = Array.from({ length: LABELS }, () => {
      const el = document.createElement("span");
      $("mults").appendChild(el);
      return { el, k: 0, at: -9 };
    });
    let labelHead = 0;
    /** A multiplication (or ×p) rising off tile k. */
    function label(k, text, color) {
      const l = labelEls[labelHead];
      labelHead = (labelHead + 1) % LABELS;
      Object.assign(l, { k, at: now() });
      l.el.textContent = text;
      l.el.style.color = color;
      l.el.style.textShadow = `0 0 12px ${color}, 0 2px 6px #000`;
    }

    function light(k) {
      const b = board[k];
      if (b.lit) return;
      Object.assign(b, { lit: 1, litAt: now() });
      litCount++;
      showTally(true);
      if (litCount === PRIMES.length) fullBoard();
    }
    function cross(k, at) {
      const b = board[k];
      if (b.cross || isPrime(k)) return;
      Object.assign(b, { cross: 1, crossAt: at });
    }

    function fullBoard() {
      tally.boards++;
      score += 2000 * mult();
      winAt = now();
      if (loud()) life.heal("board");
      slam("FULL BOARD!", GOLD, T.fullBoard);
      burst(0, 0, 220, [GOLD, "#ffe6a8", COLORS.orange, "#ffffff"], 9);
      buzz(40);
      if (loud()) {
        sfx.collect(4);
        sfx.combo();
      }
      updateScore();
    }

    /** Misses and pruning for game time g. */
    function direct(g) {
      for (const n of notes) {
        if (n.g - g > 1) break;
        if (n.state !== "wait") continue;
        if (n.kind === "sieve" && g >= n.g) sieve(n);
        else if (n.kind === "not" && g >= n.g) knock(n);
        else if (n.kind === "prime" && g > n.g + n.stay) miss(n);
      }
      while (notes.length && notes[0].g < g - 3 && notes[0].state !== "wait") notes.shift();
    }

    /** A prime knocked down `dt` seconds from its nearest best beat. */
    function hit(n, dt) {
      const err = Math.abs(dt);
      const grade = err <= BEST.perfect ? "perfect" : err <= BEST.great ? "great" : "good";
      Object.assign(n, { state: "hit", at: now(), grade });
      combo++;
      maxCombo = Math.max(maxCombo, combo);
      tally[grade]++;
      score += { perfect: 300, great: 200, good: 100 }[grade] * mult();
      if (!n.practice && loud()) life.heal(grade);
      const x = tileX(n.n);
      const y = tileY(n.n);
      board[n.n].hitAt = now();
      addRipple(x, y, GOLD);
      burst(x, y, grade === "perfect" ? 30 : 16, [GOLD, "#ffe6a8", "#ffffff"], grade === "perfect" ? 4.5 : 3);
      buzz(8);
      light(n.n);
      judgeText(grade.toUpperCase(), GOLD, n.n);
      setExplain(T.prime(why(n.n)), GOLD);
      if (loud()) {
        sfx.hit(combo % 8, grade === "perfect");
        if (combo % 10 === 0) sfx.combo();
      }
      updateScore();
    }

    /** A non-prime on its beat: it never pops up; its multiplication shows and crosses it out. */
    function knock(n) {
      Object.assign(n, { state: "auto", at: now() });
      tally.passed++;
      combo++;
      maxCombo = Math.max(maxCombo, combo);
      score += 50 * mult();
      board[n.n].hitAt = now();
      cross(n.n, now());
      label(n.n, product(n.n), COLORS.orange);
      if (loud()) sfx.stamp();
      updateScore();
    }

    /** "Check the line!": every multiple of the sieve's primes pops and is knocked down, one after another. */
    function sieve(n) {
      Object.assign(n, { state: "auto", at: now() });
      tally.sieves++;
      const wall = now();
      let j = 0;
      for (const p of n.sieve) {
        label(p, `×${p}`, KIND_COLOR.sieve);
        for (let m = 2 * p; m <= 100; m += p) if (!board[m].cross) cross(m, wall + 0.12 + j++ * 0.03);
      }
      slam(n.sieve.map((p) => `×${p}`).join(" "), KIND_COLOR.sieve, T.sieveSub(n.sieve));
      setExplain(T.sieveWhy(n.sieve), KIND_COLOR.sieve);
      if (loud()) {
        sfx.boom(true);
        for (let i = 0; i < 6; i++) setTimeout(() => sfx.chip(i * 2, i === 5), 120 + i * 80);
      }
    }

    function miss(n) {
      Object.assign(n, { state: "miss", at: now() });
      tally.miss++;
      combo = 0;
      board[n.n].redAt = now();
      judgeText("MISS", "#c8b8ff", n.n);
      updateScore();
      if (!loud()) return;
      sfx.miss();
      if (n.practice) return;
      crash = now();
      buzz(30);
      if (life.hurt("miss")) finish(false);
    }

    const open = (g) => notes.filter((n) => isUp(n, g));

    /** A tap at board position (col, row): the up tile nearest it within `reach` tiles, or just a flash. */
    function tap(px, py, col, row, reach) {
      const g = gNow();
      if (loud()) sfx.press();
      let best = null;
      let bestD = Infinity;
      for (const n of open(g)) {
        const [x, y, z, sc] = drawn.subarray(n.n * 4, n.n * 4 + 4);
        const [cx, cy] = toScreen(x, y, z);
        const [ex] = toScreen(x + TILE * 0.5 * sc, y, z);
        const d = Math.hypot(cx - px, cy - py) / Math.max(18, Math.abs(ex - cx));
        if (d <= reach && d < bestD) {
          best = n;
          bestD = d;
        }
      }
      if (best) return hit(best, offBest(best, g));
      const k = clamp(Math.round(row), 0, 9) * 10 + clamp(Math.round(col), 0, 9) + 1;
      if (col > -0.6 && col < 9.6 && row > -0.6 && row < 9.6) {
        board[k].tapAt = now();
        addRipple(tileX(k), tileY(k), "#c8b8ff");
      }
    }
    /** A key: the earliest tile that is up, prime or not. */
    function strike() {
      const g = gNow();
      if (loud()) sfx.press();
      const n = open(g)[0];
      if (n) return hit(n, offBest(n, g));
      addRipple(0, 0, "#c8b8ff");
    }

    /** The demo and `?auto`: hits each note right on time. */
    function autopilot() {
      const g = gNow();
      for (const n of notes) {
        if (n.g > g) break;
        if (isUp(n, g) && g - n.g > period * 0.5 && Math.abs(offBest(n, g)) < 0.02) hit(n, offBest(n, g));
      }
    }

    // ---------- input ----------
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const boardPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const hitPoint = new THREE.Vector3();
    root.addEventListener("pointerdown", (e) => {
      sfx.unlock();
      if (state !== "play" || e.target.closest("button, a, .overlay")) return;
      e.preventDefault();
      const rect = root.getBoundingClientRect();
      ndc.set(((e.clientX - rect.left) / view.w) * 2 - 1, -((e.clientY - rect.top) / view.h) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      if (!raycaster.ray.intersectPlane(boardPlane, hitPoint)) return;
      tap(e.clientX - rect.left, e.clientY - rect.top, hitPoint.x + 4.5, 4.5 - hitPoint.y, e.pointerType === "touch" ? AIM.touch : AIM.mouse);
    }, { signal });
    window.addEventListener("keydown", (e) => {
      sfx.unlock();
      const k = e.key.toLowerCase();
      if (e.key === "Escape" || k === "p") togglePause();
      else if (k === "r" && state === "result") start();
      else if ((e.key === " " || e.key === "Enter") && state === "title") start();
      else if (HIT_KEYS.has(k)) {
        if (state === "play" && !e.repeat) strike();
      } else if (e.key === "[" || e.key === "]") {
        offset = Math.round((offset + (e.key === "]" ? 0.01 : -0.01)) * 100) / 100;
        localStorage.setItem("prime-game-offset", String(offset));
        judgeText(`SYNC ${offset >= 0 ? "+" : ""}${Math.round(offset * 1000)} ms`, "#ffffff", 45);
      } else return;
      e.preventDefault();
    }, { signal });
    root.querySelectorAll("#title button, #result button").forEach((b) => b.addEventListener("pointerenter", () => sfx.hover(4), { signal }));
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
      band = null;
      audio.muted = false;
      const from = Number(params.get("start") || 0);
      audio.currentTime = from;
      audio.play();
      lastT = from;
      notes = notes.filter((n) => n.pass > 1 || n.t >= from + 0.3);
      startedAt = now();
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
    /** On the bar before the song's end, jump back to the first chorus with a fresh board, faster; the next pass is dealt ahead. */
    function loopBack(t) {
      const to = T_TO + Math.max(0, t - T_FROM);
      audio.currentTime = to;
      if (audio.paused) audio.play();
      gameOff += SPAN;
      pass++;
      notes.push(...buildPass(pass + 1));
      clearBoard();
      lastCall = calls.findLast((c) => c.t <= to + 0.5)?.t ?? -1;
      slam(ui.round(pass), GOLD, pass === ROUNDS ? ui.lastRound : ui.faster);
      return to;
    }
    /** How much of the whole run (all rounds) game time g has covered. */
    const runProgress = (g) => clamp(g / (T_FROM + (ROUNDS - 1) * SPAN), 0, 1);

    /** The last round played out (`cleared`) or the power ran out. */
    function finish(cleared) {
      state = "result";
      awake.release();
      setTip("");
      setExplain("");
      const judged = tally.perfect + tally.great + tally.good + tally.miss;
      const ratio = (tally.perfect + tally.great * 0.8 + tally.good * 0.5) / Math.max(1, judged);
      const secs = Math.round(now() - startedAt);
      finale.end({
        cleared,
        score,
        ratio,
        reached: `${ui.round(pass)} · ${Math.round(runProgress(gNow()) * 100)}%`,
        best: "prime-game-best",
        record: !auto && !params.has("start"),
        stats: [
          ["PERFECT", tally.perfect],
          ["GREAT", tally.great],
          ["GOOD", tally.good],
          [T.missed, tally.miss],
          [T.sieves, T.times(tally.sieves)],
          [T.boards, T.times(tally.boards)],
          [ui.rounds, `${pass} / ${ROUNDS} · ${ui.duration(secs)}`],
          [ui.accuracy, `${(ratio * 100).toFixed(1)}%`],
          [ui.maxCombo, maxCombo],
        ],
      });
    }

    // ---------- lyrics ----------
    const wordColor = (w) => {
      const n = numberWord(wordKey(w.text));
      return WORD_COLORS[w.clean] ?? (n ? (isPrime(n) ? GOLD : COLORS.orange) : w.clean === "line" ? KIND_COLOR.sieve : null);
    };
    function drawLyric(t) {
      const el = $("lyric");
      const at = tm.cueAt(t);
      const key = at ? String(at.index) : "";
      if (el.dataset.cue !== key) {
        el.dataset.cue = key;
        el.innerHTML = at ? at.cue.words.map((w) => `<span style="${wordColor(w) ? `color:${wordColor(w)}` : ""}">${w.text}</span>`).join(" ") : "";
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
        lastT = t;
        autopilot();
        direct(gNow());
      } else {
        t = state === "play" ? songTime() : lastT;
        if (state === "play" && (t >= T_FROM || audio.ended)) {
          if (pass >= ROUNDS) finish(true);
          else t = loopBack(t);
        }
        if (state === "play") {
          lastT = t;
          if (auto) autopilot();
          direct(gNow());
        }
      }
      lastT = t;
      render(t, dt);
    }

    const proj = new THREE.Vector3();
    /** Screen position of a world point, in CSS pixels of the root. */
    function toScreen(x, y, z = 0) {
      proj.set(x, y, z).project(camera);
      return [(proj.x * 0.5 + 0.5) * view.w, (-proj.y * 0.5 + 0.5) * view.h];
    }
    const off = new THREE.Color("#3a2a10");
    const warm = new THREE.Color("#ffe6a8");

    function render(t, dt) {
      const kick = tm.pulse(t, 0.12);
      const wall = now();
      const g = t + gameOff;
      const bf = tm.beatFloat(t);
      const hurtFx = Math.exp(-Math.max(0, wall - crash) / 0.3);
      const winFx = Math.exp(-Math.max(0, wall - winAt) / 0.9);
      const section = sectionAt(t);
      const chorus = section.startsWith("chorus");

      // Fit the board into the free band, centred on it.
      band ??= measureBand();
      const [top, bottom] = band ?? [view.h * 0.12, view.h * 0.9];
      const visH = Math.max(lay.h / ((bottom - top) / view.h), lay.w / 0.96 / camera.aspect);
      const dist = visH / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
      const cy = -((view.h / 2 - (top + bottom) / 2) / view.h) * visH;
      const shake = hurtFx * 0.12;
      camera.position.set((Math.random() - 0.5) * shake, cy + (Math.random() - 0.5) * shake, dist - kick * 0.15);
      camera.lookAt(0, cy, 0);
      camera.updateProjectionMatrix();

      // Tiles that are up: they pop on their beat, stay, then sink back.
      const upOf = new Float32Array(101);
      const bestOf = new Float32Array(101);
      let h = 0;
      for (const n of notes) {
        if (n.g > g + 0.05) break;
        if (!isUp(n, g)) continue;
        const since = g - n.g;
        const up = easeOutBack(clamp(since / RISE, 0, 1)) * (1 - smooth(n.stay - 0.15, n.stay, since));
        if (up <= upOf[n.n]) continue;
        // Best: a flash on every beat after the pop, the moment a hit counts as PERFECT.
        const best = since > period * 0.5 ? Math.exp(-Math.abs(offBest(n, g)) / 0.07) : 0;
        upOf[n.n] = up;
        bestOf[n.n] = best;
        // A ring goes out from the tile on each best beat: hit now.
        const beat = Math.floor((since + 0.02) / period);
        if (beat >= 1 && beat !== n.rang && beat * period <= n.stay) {
          n.rang = beat;
          addRipple(drawn[n.n * 4], drawn[n.n * 4 + 1], "#fff2c4");
        }
        if (h >= HALOS) continue;
        place(halos, h, drawn[n.n * 4], drawn[n.n * 4 + 1], -0.2, TILE * 2.6 * (1 + best * 0.9 + kick * 0.1) * (1 + grow * 0.5));
        tmpColor.set(GOLD).lerp(warm, best).multiplyScalar(clamp(up, 0, 1) * (0.4 + best * 1.1));
        halos.setColorAt(h++, tmpColor);
      }
      for (; h < HALOS; h++) place(halos, h, 0, 0, 0, 1e-4);
      halos.instanceMatrix.needsUpdate = true;
      if (halos.instanceColor) halos.instanceColor.needsUpdate = true;

      for (let i = 0; i < RIPPLES; i++) {
        const p = ripple[i];
        const u = (wall - p.at) / 0.4;
        if (u < 0 || u > 1) {
          place(ripples, i, 0, 0, 0, 1e-4);
          continue;
        }
        place(ripples, i, p.x, p.y, 0.5, TILE * (0.55 + u * 0.9));
        tmpColor.copy(p.color).multiplyScalar(1 - u);
        ripples.setColorAt(i, tmpColor);
      }
      ripples.instanceMatrix.needsUpdate = true;
      ripples.instanceColor.needsUpdate = true;

      // Board tiles.
      for (let k = 1; k <= 100; k++) {
        const b = board[k];
        let pop = b.lit ? Math.exp(-Math.max(0, wall - b.litAt) / 0.3) : 0;
        if (b.lit && winFx > 0.01) pop = Math.max(pop, winFx * (0.5 + 0.5 * Math.sin(wall * 12 - k * 0.3)));
        if (b.lit && chorus) pop = Math.max(pop, 0.25 * Math.exp(-((((bf - (colOf(k) + rowOf(k)) * 0.25) % 2) + 2) % 2) * 2));
        const tapped = Math.exp(-Math.max(0, wall - b.tapAt) / 0.12);
        const crossed = b.cross * smooth(b.crossAt, b.crossAt + 0.12, wall);
        const crossPop = b.cross && wall >= b.crossAt ? Math.exp(-(wall - b.crossAt) / 0.15) : 0;
        const sieving = b.cross ? smooth(b.crossAt - 0.12, b.crossAt - 0.03, wall) * (1 - smooth(b.crossAt, b.crossAt + 0.05, wall)) : 0;
        const slam = Math.exp(-Math.max(0, wall - b.hitAt) / 0.1);
        const up = Math.max(upOf[k], sieving);
        const best = bestOf[k];
        const i = k - 1;
        const red = Math.exp(-Math.max(0, wall - b.redAt) / 0.4) * 0.8;
        tileState.set([Math.max(b.lit, upOf[k] * (0.6 + best * 0.4)), crossed, 0, Math.max(pop, best * 0.35)], i * 4);
        tileMore.set([i, Math.max(tapped * 0.5, sieving * 0.5), red, 0], i * 4);
        const z = pop * 0.5 + b.lit * 0.08 + up * (1.2 + grow * 1.2 + kick * 0.5) - tapped * 0.15 - crossPop * 0.2 - slam * 0.45;
        const sc = 1 + pop * 0.12 + up * (grow + kick * 0.1 + best * 0.14) - tapped * 0.08 - slam * 0.12;
        // A big pop leans in from the board's edge so it stays on screen.
        const x = tileX(k) * (1 - up * grow * 0.12);
        const y = tileY(k) * (1 - up * grow * 0.12);
        place(tiles, i, x, y, z, sc, up * Math.sin(wall * 14 + k) * 0.08);
        drawn.set([x, y, z, sc], k * 4);
      }
      tiles.instanceMatrix.needsUpdate = true;
      tileGeo.attributes.aState.needsUpdate = true;
      tileGeo.attributes.aMore.needsUpdate = true;

      // Marquee: a chase that doubles in the choruses, all on for a full board.
      const speed = chorus || section === "bridge" ? 4 : 2;
      for (let i = 0; i < bulbSpots.length; i++) {
        const on = winFx > 0.05 || Math.floor(bf * speed + i) % 3 === 0;
        tmpColor.copy(on ? warm : off).multiplyScalar(on ? 1 + kick * 0.6 : 1);
        marquee.setColorAt(i, tmpColor);
      }
      marquee.instanceColor.needsUpdate = true;

      stepSparks(dt);
      bgU.uTime.value = t;
      bgU.uKick.value = kick;
      bgU.uWin.value = winFx;
      bgU.uHurt.value = hurtFx;
      bloom.strength = 0.55 + kick * 0.2 + winFx * 0.4;
      post.uniforms.uTime.value = t;
      post.uniforms.uCA.value = 0.12 + kick * 0.25 + hurtFx * 1.2;
      post.uniforms.uGlitch.value = hurtFx * 0.3;
      post.uniforms.uFlash.value = hurtFx * 0.05 + winFx * 0.05;
      post.uniforms.uFlashColor.value.set(hurtFx > winFx ? COLORS.red : GOLD);
      composer.render();

      if (state !== "title") hudFrame(t, g);
    }

    function hudFrame(t, g) {
      $("progress").firstElementChild.style.width = `${runProgress(g) * 100}%`;
      drawLyric(t);
      const [jx, jy] = toScreen(judgeAt[0], judgeAt[1]);
      const edge = Math.min(120, view.w / 2);
      Object.assign($("judge").style, { left: `${clamp(jx, edge, view.w - edge)}px`, top: `${jy - 30}px` });
      const wall = now();
      for (const l of labelEls) {
        const u = (wall - l.at) / 0.9;
        l.el.style.opacity = u >= 0 && u < 1 ? String(Math.min(1, (1 - u) * 2.5)) : "0";
        if (u < 0 || u >= 1) continue;
        const [lx, ly] = toScreen(tileX(l.k), tileY(l.k) + 0.2 + u * 0.9);
        l.el.style.left = `${lx}px`;
        l.el.style.top = `${ly}px`;
      }
      const next = notes.find((n) => n.state === "wait" && n.kind === "prime" && g <= n.g + n.stay);
      setTip(next?.practice ? T.tipPrime(next.n) : "");
      if (state !== "play") return;
      const c = calls.findLast((x) => x.t <= t);
      if (c && c.t !== lastCall && t - c.t < 0.5 && (pass === 1 || c.t >= SECTIONS.chorus1)) {
        lastCall = c.t;
        slam(c.text, c.color, c.sub);
      }
    }

    reset();
    pass = 2;
    gameOff = SPAN;
    notes = buildPass(2);
    showTally();
    $("start").disabled = false;
    $("start").textContent = ui.start;
    if (params.has("play")) start();
    frame();
    const api = {
      tally: () => {
        const g = gNow();
        const n = notes.find((x) => x.state === "wait" && g <= x.g + x.stay);
        return { ...tally, score, combo, maxCombo, hp: life.value, lit: litCount, pass, g, next: n && { n: n.n, kind: n.kind, g: n.g, practice: n.practice }, up: open(g).map((x) => ({ n: x.n, g: x.g, kind: x.kind })) };
      },
      chart: (p = 1) => buildPass(p).map((n) => [Math.round(n.t * 100) / 100, n.n, n.kind[0]]),
      /** Tap the tile of number k, as a player would. */
      tap: (k, reach = AIM.mouse) => {
        if (state !== "play") return;
        const [x, y, z] = drawn.subarray(k * 4, k * 4 + 3);
        const [px, py] = toScreen(x, y, z);
        tap(px, py, colOf(k), rowOf(k), reach);
      },
      strike: () => state === "play" && strike(),
      /** Where tile k is on screen, in CSS pixels of the root. */
      screenOf: (k) => toScreen(...drawn.subarray(k * 4, k * 4 + 3)),
      /** How wide tile k is drawn on screen, in CSS pixels. */
      sizeOf: (k) => {
        const [x, y, z, sc] = drawn.subarray(k * 4, k * 4 + 4);
        return Math.abs(toScreen(x + TILE * sc, y, z)[0] - toScreen(x, y, z)[0]);
      },
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
