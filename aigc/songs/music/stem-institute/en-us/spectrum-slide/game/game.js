import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { StarStreaks } from "@gizclaw/mvg-core/fx.js";
import { Timing, clamp, easeInOut, hash, lerp, smooth } from "@gizclaw/mvg-core/timing.js";
import { AudioClock, GamePostShader, glowTexture, songAudioUrl } from "@gizclaw/mvg-games/kit.js";
import { BANDS, SECTIONS } from "../video/constants.js";
import { WORD_COLORS } from "../video/hud.js";
import analysis from "./analysis.json";

// Slide Down the Spectrum as a rhythm game: the video's light tunnel, a photon
// the player steers round the wall, and a chart generated from the song's beats.
const SP = 2.6; // world units travelled per beat
const RINGS = 44;
const RING_R = 2.3;
const PR = 1.75; // player radius on the wall
const AHEAD = 3.2; // player distance in front of the camera
const LANES = 16;
const LANE = (Math.PI * 2) / LANES;
const PERFECT = 0.17;
const GOOD = 0.38;
const WINDOW = 0.075; // seconds either side of a note's arrival
const GAP = 2.6 * LANE; // half-width of a gate's opening
const ATTRACT = [SECTIONS.chorus1, SECTIONS.chorus1 + 22];
const RING_N = [3, 5, 8, 12, 18, 26, 40];
const RING_AMP = [0.14, 0.11, 0.085, 0.065, 0.05, 0.04, 0.03];
const BAND_COLOR = BANDS.map((b) => (b.id === "visible" ? "#fff6a0" : b.color));
const GATE_COLOR = "#ff2a55";
const WORK = "songs/music/stem-institute/en-us/spectrum-slide";
const params = new URLSearchParams(location.search);

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const $ = (id) => document.getElementById(id);

// ---------- chart ----------

function sectionAt(t) {
  if (t < SECTIONS.drop) return "intro";
  if (t < SECTIONS.chorus1) return "verse";
  if (t < SECTIONS.break) return "chorus";
  if (t < SECTIONS.verse2) return "break";
  if (t < SECTIONS.chorus2) return "verse";
  if (t < SECTIONS.bridge) return "chorus";
  if (t < SECTIONS.outro) return "bridge";
  return "outro";
}

const MOTIFS = {
  intro: [[1, 1, 1, 1], [-1, -1, -1, -1], [2, 0, -2, 0]],
  verse: [[1, 1, 1, 1], [-1, -1, -1, -1], [2, 0, -2, 0], [0, 3, 0, -3], [2, 1, 2, 1], [-2, -1, -2, -1]],
  break: [[0, 0, 0, 0], [1, 0, -1, 0]],
  chorus: [[3, -3, 3, -3], [2, 2, 2, 2], [-2, -2, -2, -2], [4, 0, -4, 0], [1, 2, -1, -2], [-3, 1, -3, 1]],
  bridge: [[1, 1, 1, 1], [1, 1, 1, 1], [-1, -1, -1, -1], [-1, -1, -1, -1]],
  outro: [[2, 2, 2, 2], [-2, -2, -2, -2], [4, -4, 4, -4]],
};

function buildChart(tm) {
  const end = SECTIONS.end - 0.6;
  const dense = (s) => s === "chorus" || s === "outro" || s === "bridge";
  const slots = [];
  tm.beats.forEach((bt, i) => {
    if (bt < 4.0 || bt > end) return;
    const rel = i - tm.dropBeat;
    if (bt < SECTIONS.drop - 0.05) {
      if (rel % 2 === 0) slots.push({ t: bt, rel, half: false });
      return;
    }
    slots.push({ t: bt, rel, half: false });
    const next = tm.beats[i + 1];
    if (dense(sectionAt(bt)) && next) {
      const ht = (bt + next) / 2;
      if (ht < end && tm.onsets.some(([ot, s]) => Math.abs(ot - ht) < 0.07 && s >= 0.3)) slots.push({ t: ht, rel: rel + 0.5, half: true });
    }
  });
  let lane = 0;
  let prevT = slots[0]?.t ?? 0;
  let dir = 1;
  return slots.map((s, n) => {
    const section = sectionAt(s.t);
    const bar = Math.floor(s.rel / 4);
    const pos = (((Math.floor(s.rel) % 4) + 4) % 4);
    const motifs = MOTIFS[section];
    const motif = section === "bridge" ? motifs[((bar % 4) + 4) % 4] : motifs[Math.floor(hash(bar * 7.31 + 3) * motifs.length)];
    let step = s.half ? dir : motif[pos];
    const dt = s.t - prevT;
    const reach = Math.max(1, Math.floor(dt * 9.5));
    step = clamp(step, -reach, reach);
    if (n === 0) step = 0;
    if (step) dir = Math.sign(step);
    lane += step;
    prevT = s.t;
    const gate = !s.half && s.rel >= 0 && ((section === "chorus" && s.rel % 8 === 0) || (section === "bridge" && s.rel % 4 === 0) || (section === "outro" && s.rel % 8 === 4));
    return { t: s.t, b: tm.beatFloat(s.t), angle: lane * LANE, half: s.half, gate, section, judged: false, best: Infinity, result: null };
  });
}

// ---------- scene pieces ----------

function makeRings() {
  const seg = 384;
  const u = [];
  const side = [];
  const idx = [];
  for (let i = 0; i <= seg; i++) {
    u.push(i / seg, i / seg);
    side.push(-1, 1);
    if (i < seg) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(u.length * 3), 3));
  geo.setAttribute("aU", new THREE.Float32BufferAttribute(u, 1));
  geo.setAttribute("aSide", new THREE.Float32BufferAttribute(side, 1));
  geo.setIndex(idx);
  geo.setAttribute("aRing", new THREE.InstancedBufferAttribute(new Float32Array(Array.from({ length: RINGS }, (_, i) => i)), 1));
  geo.instanceCount = RINGS;
  const num = () => Array.from({ length: RINGS }, () => 0);
  const uniforms = {
    uZ: { value: num() },
    uN: { value: num() },
    uAmp: { value: num() },
    uGlow: { value: num() },
    uRainbow: { value: num() },
    uColor: { value: Array.from({ length: RINGS }, () => new THREE.Color()) },
    uCamZ: { value: 0 },
    uTime: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms,
    vertexShader: /* glsl */ `
      attribute float aU, aSide, aRing;
      uniform float uZ[${RINGS}], uN[${RINGS}], uAmp[${RINGS}], uGlow[${RINGS}], uRainbow[${RINGS}];
      uniform vec3 uColor[${RINGS}];
      uniform float uCamZ, uTime;
      varying vec3 vColor; varying float vSide, vFade, vU, vRain;
      void main() {
        int i = int(aRing);
        float a = aU * 6.2831853;
        float r = ${RING_R.toFixed(2)} * (1.0 + uAmp[i] * sin(a * uN[i] + uTime * 3.0 + float(i)));
        float d = uCamZ - uZ[i];
        r += aSide * 0.035 * (1.0 + uGlow[i] * 1.5) * (0.6 + d * 0.04);
        vSide = aSide;
        vFade = smoothstep(-0.3, 1.2, d) * smoothstep(95.0, 30.0, d);
        vColor = uColor[i] * (1.0 + uGlow[i] * 2.0);
        vRain = uRainbow[i];
        vU = aU;
        gl_Position = projectionMatrix * viewMatrix * vec4(cos(a) * r, sin(a) * r, uZ[i], 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vColor; varying float vSide, vFade, vU, vRain;
      vec3 hsv(float h) { return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
      void main() {
        float d = abs(vSide);
        vec3 c = mix(vColor, hsv(vU) * 1.3, vRain);
        gl_FragColor = vec4((c * smoothstep(1.0, 0.0, d) + vec3(1.0) * smoothstep(0.3, 0.0, d) * 0.5) * vFade, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  return { mesh, uniforms };
}

// ---------- game ----------

async function boot() {
  const tm = new Timing(analysis);
  tm.setDownbeat(SECTIONS.drop);
  const chart = buildChart(tm);

  // Band schedule from the lyric cues, as in the video.
  const cueStart = (re, fallback) => tm.cues.find((c) => re.test(c.text))?.start ?? fallback;
  const verse1 = [[SECTIONS.drop, 0], [cueStart(/^microwaves/i, 15.4), 1], [cueStart(/^infrared/i, 18.6), 2], [cueStart(/^visible/i, 21.8), 3]];
  const race = cueStart(/seven-part race/i, 38);
  const verse2 = [[SECTIONS.verse2, 4], [cueStart(/^x-rays/i, 72), 5], [cueStart(/^gamma rays/i, 75), 6]];
  const bandAt = (t) => {
    const bf = tm.beatFloat(t);
    const bar = Math.floor((bf - tm.dropBeat) / 4);
    if (t < SECTIONS.drop) return -1;
    if (t < SECTIONS.chorus1) {
      if (t >= race) return ((Math.floor(bf) % 7) + 7) % 7;
      let b = 0;
      for (const [st, v] of verse1) if (t >= st) b = v;
      return b;
    }
    if (t < SECTIONS.break) return ((bar % 7) + 7) % 7;
    if (t < SECTIONS.verse2) return 3;
    if (t < SECTIONS.chorus2) {
      let b = 4;
      for (const [st, v] of verse2) if (t >= st) b = v;
      return b;
    }
    if (t < SECTIONS.bridge) return ((bar % 7) + 7) % 7;
    if (t < SECTIONS.outro) return 6;
    return ((Math.floor(bf) % 7) + 7) % 7;
  };
  const bandSlams = [...verse1, ...verse2].map(([t, b]) => ({ t, b }));

  // Renderer
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  $("stage").appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#020208");
  const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 200);
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.6, 0.4, 0.2);
  const post = new ShaderPass(GamePostShader);
  [new RenderPass(scene, camera), bloom, post, new OutputPass()].forEach((p) => composer.addPass(p));
  function resize() {
    const w = innerWidth;
    const h = innerHeight;
    renderer.setSize(w, h, false);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(w, h);
    camera.aspect = w / h;
  }
  addEventListener("resize", resize);
  resize();

  const rings = makeRings();
  scene.add(rings.mesh);
  const stars = new StarStreaks({ count: 4500, radius: [0.6, 9], depth: 110 });
  stars.material.uniforms.uOpacity.value = 0.55;
  scene.add(stars.object);
  const glow = glowTexture();
  const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: "#ffffff", blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  core.scale.setScalar(26);
  scene.add(core);

  const gemGeo = new THREE.OctahedronGeometry(0.22, 0);
  const notePool = Array.from({ length: 90 }, () => {
    const g = new THREE.Group();
    const gem = new THREE.Mesh(gemGeo, new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true }));
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    halo.scale.setScalar(0.95);
    g.add(gem, halo);
    g.visible = false;
    scene.add(g);
    return { g, gem, halo };
  });
  const arcGeo = new THREE.TorusGeometry(PR, 0.06, 8, 120, Math.PI * 2 - GAP * 2);
  const wallGeo = new THREE.RingGeometry(PR - 0.55, RING_R + 0.05, 120, 1, 0, Math.PI * 2 - GAP * 2);
  const gatePool = Array.from({ length: 10 }, () => {
    const g = new THREE.Group();
    const arc = new THREE.Mesh(arcGeo, new THREE.MeshBasicMaterial({ color: GATE_COLOR, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    const wall = new THREE.Mesh(wallGeo, new THREE.MeshBasicMaterial({ color: GATE_COLOR, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    g.add(arc, wall);
    g.visible = false;
    scene.add(g);
    return { g, arc, wall };
  });

  const player = new THREE.Group();
  const playerCore = new THREE.Mesh(new THREE.SphereGeometry(0.1, 24, 16), new THREE.MeshBasicMaterial({ color: "#ffffff" }));
  const playerHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  playerHalo.scale.setScalar(0.9);
  player.add(playerCore, playerHalo);
  scene.add(player);

  const TRAIL = 48;
  const trailPos = new Float32Array(TRAIL * 2 * 3);
  const trailAlpha = new Float32Array(TRAIL * 2);
  const trailIdx = [];
  for (let i = 0; i < TRAIL - 1; i++) trailIdx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  for (let i = 0; i < TRAIL; i++) trailAlpha[i * 2] = trailAlpha[i * 2 + 1] = 1 - i / (TRAIL - 1);
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute("position", new THREE.BufferAttribute(trailPos, 3));
  trailGeo.setAttribute("aAlpha", new THREE.BufferAttribute(trailAlpha, 1));
  trailGeo.setIndex(trailIdx);
  const trailMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color() } },
    vertexShader: "attribute float aAlpha; varying float vA; void main(){ vA = aAlpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: "uniform vec3 uColor; varying float vA; void main(){ gl_FragColor = vec4((uColor * 0.7 + 0.1) * vA * vA, 1.0); }",
  });
  const trail = new THREE.Mesh(trailGeo, trailMat);
  trail.frustumCulled = false;
  scene.add(trail);
  const history = [];

  const SPARKS = 700;
  const sparkPos = new Float32Array(SPARKS * 3);
  const sparkCol = new Float32Array(SPARKS * 3);
  const sparkVel = new Float32Array(SPARKS * 3);
  const sparkLife = new Float32Array(SPARKS);
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute("position", new THREE.BufferAttribute(sparkPos, 3));
  sparkGeo.setAttribute("color", new THREE.BufferAttribute(sparkCol, 3));
  const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ size: 0.09, map: glow, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
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
      sparkVel.set([Math.cos(a) * r * s, Math.sin(a) * r * s, u * s - 3.5], i * 3);
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
      if (sparkLife[i] <= 0) sparkPos[i * 3 + 2] = 1e5;
    }
    sparkGeo.attributes.position.needsUpdate = true;
    sparkGeo.attributes.color.needsUpdate = true;
  }

  // ---------- audio clock ----------
  const audio = new Audio(params.get("audio") || songAudioUrl(WORK));
  audio.preload = "auto";
  const clock = new AudioClock(audio);
  let offset = Number(localStorage.getItem("spectrum-game-offset") || 0);
  const songTime = () => clock.now() + offset;
  await clock.ready();

  // ---------- state ----------
  let state = "title";
  let theta = 0;
  let omega = 0;
  let camTheta = 0;
  let score = 0;
  let combo = 0;
  let maxCombo = 0;
  const tally = { perfect: 0, good: 0, miss: 0, gatePass: 0, gateHit: 0 };
  let hitFlash = -9;
  let hitColor = "#ffffff";
  let crash = -9;
  let lastBandSlam = -1;
  let countdownShown = -1;
  let lastT = 0;
  const auto = params.has("auto");

  function reset() {
    for (const n of chart) Object.assign(n, { judged: false, best: Infinity, result: null });
    score = combo = maxCombo = 0;
    Object.keys(tally).forEach((k) => (tally[k] = 0));
    theta = omega = camTheta = 0;
    history.length = 0;
    hitFlash = crash = -9;
    lastBandSlam = countdownShown = -1;
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
  $("ruler").innerHTML = BANDS.map((b, i) => `<div style="color:${BAND_COLOR[i]}">${b.short}</div>`).join("");

  function noteColor(n, i) {
    const band = bandAt(n.t);
    if (band < 0) return "#2cade4";
    if (band === 3) return ["#ff3b3b", "#ff9a2e", "#ffe53b", "#3bff6e", "#3b9bff", "#9b5cff"][i % 6];
    return BAND_COLOR[band];
  }
  const noteColors = chart.map((n, i) => noteColor(n, i));
  const notePos = (n, out) => out.set(Math.cos(n.angle) * PR, Math.sin(n.angle) * PR, -n.b * SP - AHEAD);
  const tmpV = new THREE.Vector3();

  function judge(t) {
    for (let i = 0; i < chart.length; i++) {
      const n = chart[i];
      if (n.judged) continue;
      if (n.t > t + WINDOW) break;
      const d = Math.abs(wrap(theta - n.angle));
      if (n.gate) {
        if (t < n.t) continue;
        n.judged = true;
        const pass = d < GAP - 0.12;
        n.result = pass ? "pass" : "hit";
        if (pass) {
          tally.gatePass++;
          combo++;
          score += 500 * mult();
          judgeText("γ GATE +500", "#7cff4f");
          burst(player.position, "#7cff4f", 40, 5);
        } else {
          tally.gateHit++;
          combo = 0;
          crash = t;
          judgeText("γ HIT", GATE_COLOR);
          burst(player.position, GATE_COLOR, 60, 6);
        }
        maxCombo = Math.max(maxCombo, combo);
        updateScore();
        continue;
      }
      if (t >= n.t - WINDOW) n.best = Math.min(n.best, d);
      const done = n.best < PERFECT && t >= n.t - 0.02;
      if (!done && t < n.t + WINDOW) continue;
      n.judged = true;
      n.result = n.best < PERFECT ? "perfect" : n.best < GOOD ? "good" : "miss";
      if (n.result === "miss") {
        tally.miss++;
        if (combo >= 10) judgeText("MISS", "#8890b0");
        combo = 0;
      } else {
        tally[n.result]++;
        combo++;
        score += (n.result === "perfect" ? 300 : 120) * mult();
        hitFlash = t;
        hitColor = noteColors[i];
        burst(notePos(n, tmpV), noteColors[i], n.result === "perfect" ? 22 : 12, n.result === "perfect" ? 4 : 3);
        if (n.result === "perfect") judgeText(combo >= 10 && combo % 10 === 0 ? `${combo} COMBO!` : "PERFECT", noteColors[i]);
        else judgeText("GOOD", "#c9d6ff");
      }
      maxCombo = Math.max(maxCombo, combo);
      updateScore();
    }
  }

  function autopilot(t) {
    let k = chart.findIndex((n) => n.t >= t - 0.02 && !n.gate);
    if (k < 0) return theta;
    const next = chart[k];
    const prev = chart.slice(0, k).findLast((n) => !n.gate);
    if (!prev) return next.angle;
    return lerp(prev.angle, next.angle, easeInOut((t - prev.t) / (next.t - prev.t)));
  }

  // ---------- input ----------
  const keys = new Set();
  addEventListener("keydown", (e) => {
    keys.add(e.key.toLowerCase());
    if (e.key === "Escape" || e.key.toLowerCase() === "p") togglePause();
    if (e.key.toLowerCase() === "r" && state === "result") start();
    if ((e.key === " " || e.key === "Enter") && state === "title") start();
    if (e.key === "[" || e.key === "]") {
      offset = Math.round((offset + (e.key === "]" ? 0.01 : -0.01)) * 100) / 100;
      localStorage.setItem("spectrum-game-offset", String(offset));
      judgeText(`SYNC ${offset >= 0 ? "+" : ""}${Math.round(offset * 1000)} ms`, "#ffffff");
    }
  });
  addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
  let dragX = null;
  let dragged = 0;
  addEventListener("pointerdown", (e) => {
    dragX = e.clientX;
    dragged = 0;
  });
  addEventListener("pointermove", (e) => {
    if (dragX === null || state !== "play") return;
    const dx = e.clientX - dragX;
    dragX = e.clientX;
    dragged += Math.abs(dx);
    theta += (dx / Math.min(innerWidth, innerHeight)) * Math.PI * 1.6;
  });
  addEventListener("pointerup", () => (dragX = null));
  $("pause").addEventListener("click", togglePause);
  $("start").addEventListener("click", start);
  $("again").addEventListener("click", start);

  function start() {
    reset();
    state = "play";
    ["title", "result", "pause"].forEach((id) => ($(id).hidden = true));
    $("hud").hidden = false;
    audio.muted = false;
    audio.currentTime = Number(params.get("start") || 0);
    audio.play();
    lastT = audio.currentTime;
    // Notes before a mid-song start count as already played.
    for (const n of chart) if (n.t < audio.currentTime) n.judged = true;
  }
  function togglePause() {
    if (state === "play") {
      state = "pause";
      audio.pause();
      $("pause").hidden = false;
    } else if (state === "pause") {
      state = "play";
      $("pause").hidden = true;
      audio.play();
    }
  }
  function finish() {
    state = "result";
    audio.pause();
    const notes = chart.filter((n) => !n.gate).length;
    const gates = chart.filter((n) => n.gate).length;
    const acc = (tally.perfect + tally.good * 0.6 + tally.gatePass) / Math.max(1, notes + gates);
    const grade = acc >= 0.95 ? "S" : acc >= 0.85 ? "A" : acc >= 0.7 ? "B" : acc >= 0.5 ? "C" : "D";
    const gradeColor = { S: "#fff6a0", A: "#3de8ff", B: "#7cff4f", C: "#ff8c42", D: "#ff3d7f" }[grade];
    $("grade").textContent = grade;
    $("grade").style.color = gradeColor;
    $("grade").style.textShadow = `0 0 40px ${gradeColor}`;
    $("final").textContent = `${score.toLocaleString("en-US")} 分`;
    $("stats").innerHTML = [
      ["PERFECT", tally.perfect],
      ["GOOD", tally.good],
      ["MISS", tally.miss],
      ["γ 闸门", `${tally.gatePass} / ${gates}`],
      ["最大连击", maxCombo],
      ["命中率", `${(acc * 100).toFixed(1)}%`],
    ]
      .map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`)
      .join("");
    $("result").hidden = false;
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
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, frameClock.getDelta());
    let t;
    if (state === "title") {
      t = ATTRACT[0] + ((performance.now() / 1000) % (ATTRACT[1] - ATTRACT[0]));
      if (t < lastT) for (const n of chart) Object.assign(n, { judged: false, best: Infinity, result: null });
      theta = autopilot(t);
      judge(t);
    } else {
      t = state === "play" ? songTime() : lastT;
      if (state === "play") {
        const dir = (keys.has("arrowright") || keys.has("d") ? 1 : 0) - (keys.has("arrowleft") || keys.has("a") ? 1 : 0);
        omega = lerp(omega, dir * 7.2, 1 - Math.exp(-dt * 16));
        theta += omega * dt;
        if (auto) theta = autopilot(t);
        judge(t);
        if (t >= SECTIONS.end || audio.ended) finish();
      }
    }
    lastT = t;
    render(t, dt);
  }

  function render(t, dt) {
    const bf = tm.beatFloat(t);
    const camZ = -bf * SP;
    const kick = tm.pulse(t, 0.12);
    const band = bandAt(t);
    const hit = Math.exp(-(t - hitFlash) / 0.18);
    const hurt = Math.exp(-(t - crash) / 0.35);

    // Rings
    const ru = rings.uniforms;
    ru.uCamZ.value = camZ;
    ru.uTime.value = t;
    const firstK = Math.floor(-camZ / SP) - 1;
    const playerZ = camZ - AHEAD;
    for (let j = 0; j < RINGS; j++) {
      const k = firstK + j;
      const tr = tm.beatTime(k);
      const b = bandAt(tr);
      ru.uZ.value[j] = -k * SP;
      ru.uColor.value[j].set(b < 0 ? "#2cade4" : BAND_COLOR[b]);
      if (b < 0) ru.uColor.value[j].multiplyScalar(0.45);
      ru.uN.value[j] = RING_N[Math.max(0, b)];
      ru.uAmp.value[j] = RING_AMP[Math.max(0, b)] * (1 + 0.8 * kick);
      ru.uRainbow.value[j] = b === 3 ? 1 : 0;
      const near = Math.exp(-Math.abs(-k * SP - playerZ) / 2.2);
      ru.uGlow.value[j] = Math.exp(-Math.abs(camZ + k * SP) / 3) * (0.3 + kick * 0.7) + near * hit * 0.5;
      if (hurt > 0.02) ru.uColor.value[j].lerp(new THREE.Color(GATE_COLOR), hurt * near);
    }
    stars.material.uniforms.uCamZ.value = camZ;
    stars.material.uniforms.uStretch.value = 1.2 + kick * 1.2 + (sectionAt(t) === "chorus" ? 1 : 0);
    stars.material.uniforms.uRainbow.value = band === 3 || sectionAt(t) === "outro" ? 1 : 0.3;
    core.position.set(0, 0, camZ - 80);
    core.material.color.set(band < 0 ? "#2cade4" : BAND_COLOR[band]);
    core.material.opacity = 0.22 + kick * 0.15;

    // Notes and gates
    let ni = 0;
    let gi = 0;
    for (let i = 0; i < chart.length; i++) {
      const n = chart[i];
      const ahead = (n.b - bf) * SP;
      if (ahead > 85) break;
      if (ahead < -1.5) continue;
      const fade = smooth(85, 60, ahead) * (ahead < 0 ? smooth(-1.5, 0, ahead) : 1);
      if (n.gate) {
        if (gi >= gatePool.length) continue;
        const g = gatePool[gi++];
        g.g.visible = true;
        g.g.position.set(0, 0, -n.b * SP - AHEAD);
        g.g.rotation.z = n.angle + GAP;
        const passed = n.result === "pass";
        const flick = 0.75 + 0.25 * Math.sin(t * 40 + i);
        g.arc.material.color.set(passed ? "#7cff4f" : GATE_COLOR);
        g.arc.material.opacity = fade * flick;
        g.wall.material.color.set(passed ? "#7cff4f" : GATE_COLOR);
        g.wall.material.opacity = fade * 0.07 * flick;
        continue;
      }
      if (n.result && n.result !== "miss") continue;
      if (ni >= notePool.length) continue;
      const p = notePool[ni++];
      p.g.visible = true;
      notePos(n, p.g.position);
      const pulse = 1 + 0.35 * kick;
      p.gem.scale.setScalar((n.half ? 0.75 : 1) * pulse);
      p.gem.rotation.set(t * 2 + i, t * 3 + i * 0.5, 0);
      p.gem.material.color.set(noteColors[i]);
      p.gem.material.opacity = fade * (n.result === "miss" ? 0.25 : 1);
      p.halo.material.color.set(noteColors[i]);
      p.halo.material.opacity = fade * (n.result === "miss" ? 0.1 : 0.75);
      p.halo.scale.setScalar((n.half ? 0.9 : 1.25) * pulse);
    }
    for (; ni < notePool.length; ni++) notePool[ni].g.visible = false;
    for (; gi < gatePool.length; gi++) gatePool[gi].g.visible = false;

    // Player and trail
    player.position.set(Math.cos(theta) * PR, Math.sin(theta) * PR, playerZ);
    const pColor = band < 0 ? "#9fe6ff" : BAND_COLOR[band];
    playerHalo.material.color.set(hurt > 0.05 ? GATE_COLOR : pColor);
    playerHalo.scale.setScalar(0.5 + kick * 0.15 + hit * 0.25);
    history.unshift({ theta, z: playerZ });
    if (history.length > TRAIL) history.length = TRAIL;
    for (let i = 0; i < TRAIL; i++) {
      const h = history[Math.min(i, history.length - 1)];
      const w = 0.07 * (1 - i / TRAIL);
      const c = Math.cos(h.theta);
      const s = Math.sin(h.theta);
      trailPos.set([c * PR - s * w, s * PR + c * w, h.z, c * PR + s * w, s * PR - c * w, h.z], i * 6);
    }
    trailGeo.attributes.position.needsUpdate = true;
    trailMat.uniforms.uColor.value.set(pColor);
    stepSparks(dt);

    // Camera rides behind the photon, rolled so it stays at the bottom of the screen.
    camTheta = lerp(camTheta, theta, 1 - Math.exp(-dt * 10));
    const shake = hurt * 0.12;
    camera.position.set(Math.cos(camTheta) * 0.55 + (Math.random() - 0.5) * shake, Math.sin(camTheta) * 0.55 + (Math.random() - 0.5) * shake, camZ);
    camera.rotation.set(0, 0, camTheta + Math.PI / 2);
    camera.fov = (camera.aspect < 1 ? 82 : 66) - kick * 5 - hit * 2;
    camera.updateProjectionMatrix();

    bloom.strength = 0.55 + kick * 0.2 + hit * 0.15;
    post.uniforms.uTime.value = t;
    post.uniforms.uCA.value = 0.25 + kick * 0.6 + hit * 0.5 + hurt * 2;
    post.uniforms.uGlitch.value = hurt * 0.8;
    post.uniforms.uFlash.value = hit * 0.02 + hurt * 0.1;
    post.uniforms.uFlashColor.value.set(hurt > hit ? GATE_COLOR : hitColor);
    composer.render();

    if (state !== "title") hudFrame(t, band);
  }

  function hudFrame(t, band) {
    $("progress").firstElementChild.style.width = `${clamp(t / SECTIONS.end, 0, 1) * 100}%`;
    [...$("ruler").children].forEach((d, i) => d.classList.toggle("on", band === i));
    drawLyric(t);
    if (state !== "play") return;
    const s = bandSlams.findLast((x) => x.t <= t);
    if (s && s.t !== lastBandSlam && t - s.t < 0.5) {
      lastBandSlam = s.t;
      slam(BANDS[s.b].label, BAND_COLOR[s.b], `λ ${BANDS[s.b].lambda}`);
    }
    const dropBeat = tm.dropBeat;
    const bi = tm.beatIndexAt(t);
    const left = dropBeat - bi;
    if (left >= 1 && left <= 3 && countdownShown !== left) {
      countdownShown = left;
      slam(String(left), "#ffffff");
    }
    if (left === 0 && countdownShown !== 0) {
      countdownShown = 0;
      slam("SLIDE!", "#fff6a0", "radio → gamma");
    }
    const firstGate = chart.find((n) => n.gate);
    if (firstGate && countdownShown !== "gate" && t >= firstGate.t - 3.2 && t < firstGate.t - 2.6) {
      countdownShown = "gate";
      slam("γ GATE", GATE_COLOR, "钻过缺口");
    }
  }

  $("start").disabled = false;
  $("start").textContent = "开始";
  if (params.has("play")) start();
  frame();
  window.__game = { chart, tally: () => ({ ...tally, score, combo, maxCombo }) };
}

boot().catch((e) => {
  console.error(e);
  $("start").textContent = `出错了：${e.message}`;
});
