import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { clamp, easeInOut, easeOutCubic, hash, lerp, smooth } from "@gizclaw/mvg-core/timing.js";
import wordmark from "@gizclaw/mvg-core/assets/haivivi-wordmark.svg?raw";
import { GamePostShader, glowTexture, songAudioUrl } from "@gizclaw/mvg-games/kit.js";
import { lockGestures } from "@gizclaw/mvg-games/mobile.js";
import { sfx } from "@gizclaw/mvg-games/sfx.js";
import { makeFeature } from "./features.js";
import { LOGO_HALF, LOGO_Y, makeGate } from "./gate.js";
import { STRINGS, local, saveLang, savedLang } from "./i18n.js";
import { makeBrandLogo } from "./logo.js";
import { Music } from "./music.js";
import {
  makeAccretion,
  makeBeacon,
  makeGalaxy,
  makeOrbit,
  makePlanet,
  makeRing,
  makeShock,
  makeShootingStars,
  makeSky,
  makeSun,
  makeWarp,
  ringTexture,
} from "./space.js";
import "./universe.css";

const GALAXY_R = 340;
/** Distance between galaxies on the carousel. */
const SPACING = 820;
const UP = new THREE.Vector3(0, 1, 0);
const GREY = "#9aa3b2";
const SHOCKS = 6;
/** Planets and orbits of galaxies farther than this from the camera are not drawn. */
const SYSTEM_RANGE = 1300;
/** Galaxies farther than this along the carousel are not drawn at all. */
const GALAXY_RANGE = 2600;
/** Seconds the carousel has to rest on a galaxy before its music fades in. */
const SLIDE_DWELL = 0.4;
/** Where the opening stage hangs, away from the galaxies; the flight in starts here. */
const GATE = new THREE.Vector3(0, 2500, 9000);

const MARKUP = `
  <div class="uv-stage"></div>
  <div class="uv-labels"></div>
  <div class="uv-hud">
    <button class="uv-back" data-title="up"><span>←</span><b></b></button>
    <div class="uv-tools">
      <span class="uv-eq"><i></i><i></i><i></i><i></i></span>
      <button class="uv-lang"></button>
      <button class="uv-mute" data-title="mute"></button>
      <button class="uv-fs" data-title="fullscreen">⛶</button>
    </div>
    <button class="uv-arrow" data-step="-1" data-title="prev">‹</button>
    <button class="uv-arrow" data-step="1" data-title="next">›</button>
    <section class="uv-panel">
      <h1></h1>
      <button class="uv-go" data-title="go">▶</button>
      <span class="uv-soon" data-t="soon"></span>
      <p class="uv-howto"></p>
    </section>
    <div class="uv-tip" data-html="tip"></div>
    <div class="uv-toast"></div>
  </div>
  <div class="uv-flash"></div>
  <div class="uv-play" hidden>
    <button class="uv-quit" data-title="quit">←</button>
    <button class="uv-langplay"></button>
    <button class="uv-exit" data-t="back"></button>
  </div>
  <div class="uv-portal"></div>
  <div class="uv-gate"><button class="uv-gate-mute" data-title="mute"></button><div class="uv-press"><kbd>Enter ⏎</kbd><span data-t="press"></span></div></div>
`;

/**
 * Mount the universe hub into `target`. Series are galaxies on a horizontal
 * carousel; inside one, works are planets and clicking a playable planet
 * dives into it and mounts its game in place. The location hash holds the
 * route (`#/<series>/<work>/play`), so browser back walks out a level.
 * @param {Element | string} target
 * @param {{ series: object[] }} options
 */
export function mountUniverse(target, { series }) {
  const root = typeof target === "string" ? document.querySelector(target) : target;
  root.classList.add("uv", "uv-silent");
  root.innerHTML = MARKUP;
  const $ = (sel) => root.querySelector(sel);
  const ac = new AbortController();
  const { signal } = ac;
  lockGestures(root, signal);
  let lang = savedLang();
  const S = (key) => STRINGS[lang][key];

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  } catch {
    return fallback(root, series, lang);
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  $(".uv-stage").appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 0.5, 30000);
  scene.add(camera);
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.85, 0.55, 0.18);
  const post = new ShaderPass(GamePostShader);
  [new RenderPass(scene, camera), bloom, post, new OutputPass()].forEach((p) => composer.addPass(p));
  let W = 1;
  let H = 1;
  function resize() {
    const r = root.getBoundingClientRect();
    W = Math.max(1, r.width);
    H = Math.max(1, r.height);
    renderer.setSize(W, H, false);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(W, H);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(root);
  resize();

  // ---------- world ----------
  const glow = glowTexture();
  const ringTex = ringTexture();
  const sprite = (color, scale, opacity = 1, map = glow) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, color, opacity, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    s.scale.setScalar(scale);
    return s;
  };
  const sky = makeSky();
  scene.add(sky.group);
  const logos = [makeBrandLogo(wordmark, 3000), makeBrandLogo(wordmark, 3000)];
  logos[0].group.position.set(0, -150, -6500);
  logos[1].group.position.set(0, -150, 6500);
  for (const l of logos) {
    l.group.lookAt(0, -150, 0);
    sky.group.add(l.group);
  }
  const gateFx = makeGate(wordmark, glow);
  gateFx.group.position.copy(GATE);
  scene.add(gateFx.group);
  const warp = makeWarp();
  camera.add(warp.object);
  const meteors = makeShootingStars();
  scene.add(meteors.object);

  const slot = (i) => new THREE.Vector3(i * SPACING, 0, 0);
  const galaxies = series.map((s, i) => {
    const group = new THREE.Group();
    group.position.copy(slot(i));
    group.rotation.set(0.16, 0, 0.07);
    scene.add(group);
    const disc = makeGalaxy({ seed: 11 + i * 7, radius: GALAXY_R, arms: 2 + (i % 3), colors: s.colors });
    const clouds = makeGalaxy({ seed: 5 + i * 7, radius: GALAXY_R, count: 260, colors: s.colors, cloud: true });
    group.add(disc.points, clouds.points);
    const halo = sprite(s.colors[0], GALAXY_R * 2.6, 0.3);
    const sun = makeSun();
    sun.mesh.scale.setScalar(6);
    const sunGlow = sprite("#ffd9a0", 40, 0.55);
    const disk = makeAccretion(s.colors[1] ?? s.colors[0]);
    disk.mesh.scale.setScalar(6);
    group.add(halo, sun.mesh, sunGlow, disk.mesh);
    const shocks = Array.from({ length: SHOCKS }, () => {
      const sh = makeShock();
      group.add(sh.mesh);
      return sh;
    });
    group.updateMatrixWorld(true);
    const gap = Math.min(13, 270 / Math.max(1, s.works.length - 1));
    const planets = s.works.map((w, k) => {
      const live = !!w.game;
      const r = 64 + k * gap;
      const size = live ? 7 : (3.2 + hash(k * 3.1 + i) * 1.8) * Math.min(1, gap / 11);
      const holder = new THREE.Group();
      const body = makePlanet({ colors: w.colors, look: w.look, seed: k + 1 + i * 13, grey: !live });
      body.mesh.scale.setScalar(size);
      body.material.uniforms.uSun.value.copy(group.position);
      const atmo = sprite(live ? w.colors[0] : GREY, size * 3.6, live ? 0.75 : 0.35);
      holder.add(atmo, body.mesh);
      if (w.ring) {
        const ring = makeRing(w.colors[0], !live);
        ring.mesh.scale.setScalar(size);
        holder.add(ring.mesh);
      }
      const feature = w.feature ? makeFeature(w.feature, { colors: w.colors, grey: !live, sun: group.position, glow }) : null;
      if (feature) {
        feature.object.scale.setScalar(size);
        holder.add(feature.object);
      }
      let beacon = null;
      if (live) {
        beacon = makeBeacon(w.colors[0]);
        beacon.mesh.scale.set(size * 0.32, 160, size * 0.32);
        holder.add(beacon.mesh);
      }
      const orbit = makeOrbit(r);
      if (live) orbit.material.color.set(w.colors[0]);
      group.add(holder, orbit.line);
      return { w, k, r, size, live, phase: k * 2.399 + i, speed: 1.1 / r, holder, body, atmo, feature, beacon, orbit, world: new THREE.Vector3(), label: null };
    });
    return { s, i, group, disc, clouds, halo, sun, sunGlow, disk, shocks, shockHead: 0, planets, label: null, fade: 1 };
  });
  const stops = galaxies.map((g) => g.group);
  const marker = sprite("#ffffff", 1, 0.9, ringTex);
  scene.add(marker);

  // ---------- labels ----------
  const labels = $(".uv-labels");
  const tag = (cls, html, onClick) => {
    const el = document.createElement("button");
    el.className = `uv-tag ${cls}`;
    el.innerHTML = html;
    el.addEventListener("click", (e) => (e.stopPropagation(), onClick()), { signal });
    labels.appendChild(el);
    return el;
  };
  const hoverTag = tag("hover", "<b></b>", () => state.hover != null && activate(state.hover));
  for (const g of galaxies) {
    g.label = tag("galaxy", "<b></b>", () => (state.sel === g.i ? go({ level: "galaxy", si: g.i }) : slide(g.i)));
    for (const p of g.planets) if (p.live) p.label = tag("planet live", "<em>▶</em>", () => activate(p.k));
  }

  // ---------- language ----------
  function relabel() {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
    document.title = S("doc");
    root.querySelectorAll("[data-t]").forEach((el) => (el.textContent = S(el.dataset.t)));
    root.querySelectorAll("[data-html]").forEach((el) => (el.innerHTML = S(el.dataset.html)));
    root.querySelectorAll("[data-title]").forEach((el) => (el.title = S(el.dataset.title)));
    $(".uv-lang").textContent = $(".uv-langplay").textContent = S("switch");
    $(".uv-lang").title = $(".uv-langplay").title = S("switchTitle");
    for (const g of galaxies) g.label.firstChild.textContent = local(g.s.name, lang);
    music.onchange(music.want);
    hud();
  }
  const toggleLang = () => {
    lang = lang === "zh" ? "en" : "zh";
    saveLang(lang);
    relabel();
    // A game renders its text when it mounts, so it is mounted again in the new language.
    if (state.level === "game" && gameHost) remountGame();
  };
  $(".uv-lang").addEventListener("click", toggleLang, { signal });
  $(".uv-langplay").addEventListener("click", toggleLang, { signal });

  // ---------- music ----------
  const music = new Music();
  const track = (w) => ({ url: songAudioUrl(w.work), title: local(w.title, lang), start: w.preview });
  const seriesTracks = series.map((s) => s.works.map(track));
  const muteBtn = $(".uv-mute");
  const gateMute = $(".uv-gate-mute");
  music.onchange = (want) => {
    for (const b of [muteBtn, gateMute]) {
      b.textContent = music.muted ? "🔇" : "🔊";
      b.title = want ? `♪ ${want.title}` : S("mute");
    }
    root.classList.toggle("uv-muted", music.muted);
  };
  const playPick = () => {
    const w = series[state.si].works[state.sel];
    music.play(songAudioUrl(w.work), { start: w.preview, title: local(w.title, lang) });
  };

  // ---------- state & routing ----------
  const state = { level: "cosmos", si: 0, sel: 0, hover: null };
  let started = false;
  let yaw = 0;
  let pitch = 0;
  let zoom = 1;
  /** `#/<series>/<work>/play?start=31&auto` also carries options for the game (`start`, `auto`, `play`). */
  const parse = (h) => {
    const [path, query = ""] = h.replace(/^#\/?/, "").split("?");
    const [sid, wid, act] = path.split("/").filter(Boolean);
    const si = series.findIndex((s) => s.id === sid);
    if (si < 0) return { level: "cosmos" };
    const wi = series[si].works.findIndex((w) => w.id === wid);
    if (wi < 0) return { level: "galaxy", si };
    if (act === "play" && series[si].works[wi].game) return { level: "game", si, wi, opts: gameOptions(new URLSearchParams(query)) };
    return { level: "galaxy", si, wi };
  };
  const gameOptions = (q) => {
    const opts = {};
    if (q.has("start")) opts.start = Number(q.get("start")) || 0;
    if (q.has("auto")) opts.auto = true;
    if (q.has("play") || opts.start != null || opts.auto) opts.play = true;
    return opts;
  };
  let pendingGame = {};
  const hashOf = (r) => {
    if (r.level === "cosmos") return "#/";
    const s = series[r.si];
    if (r.wi == null) return `#/${s.id}`;
    return `#/${s.id}/${s.works[r.wi].id}${r.level === "game" ? "/play" : ""}`;
  };
  /** Whether the game route was pushed from here, so leaving can step back instead of piling up entries. */
  let playPushed = false;
  function go(r) {
    music.unlock();
    const h = hashOf(r);
    if (location.hash !== h) {
      if (r.level === "game") playPushed = true;
      location.hash = h;
    } else apply(r);
  }
  addEventListener("hashchange", () => apply(parse(location.hash)), { signal });

  function apply(r, instant = false) {
    const prev = state.level;
    if (prev === "game" && r.level !== "game") exitGame();
    if (r.level !== "game") yaw = pitch = 0;
    zoom = 1;
    state.hover = null;
    if (r.level === "cosmos") {
      if (prev === "galaxy") sfx.back();
      state.level = "cosmos";
      state.sel = state.si;
      music.shuffle(seriesTracks[state.si]);
    } else {
      const fresh = prev === "cosmos" || state.si !== r.si;
      state.si = r.si;
      if (r.wi != null) state.sel = r.wi;
      else if (fresh) state.sel = Math.max(0, series[r.si].works.findIndex((w) => w.game));
      if (r.level === "game") {
        pendingGame = r.opts ?? {};
        if (prev !== "galaxy" || instant) {
          state.level = "galaxy";
          snap();
        }
        state.level = "game";
        enterGame();
        hud();
        return;
      }
      if (prev === "cosmos" && started) sfx.enter();
      state.level = "galaxy";
      if (prev === "game" || r.wi != null) playPick();
      else music.shuffle(seriesTracks[r.si]);
    }
    if (instant) snap();
    else if (started) fly();
    hud();
  }

  /** Centre carousel stop `i` in the cosmos view. */
  function slide(i) {
    music.unlock();
    if (state.level !== "cosmos") return;
    const sel = clamp(i, 0, stops.length - 1);
    if (sel === state.sel) return;
    sfx.slide(Math.sign(sel - state.sel));
    state.sel = state.si = sel;
    slideAt = clockT + SLIDE_DWELL;
    hud();
  }
  /** Select planet `k` in the current galaxy and fade its song in. */
  function select(k) {
    if (state.level !== "galaxy" || k === state.sel) return;
    root.classList.add("uv-tipped");
    sfx.select(k % 8);
    state.sel = k;
    history.replaceState(null, "", hashOf({ level: "galaxy", si: state.si, wi: k }));
    playPick();
    hud();
  }
  /** Click on planet `k`: the first click selects it; clicking the selected planet opens its game. */
  function activate(k) {
    music.unlock();
    if (k !== state.sel) return select(k);
    if (series[state.si].works[k].game) go({ level: "game", si: state.si, wi: k });
    else {
      sfx.denied();
      toast(S("soon"));
    }
  }

  // ---------- camera ----------
  const cam = { pos: new THREE.Vector3(), target: new THREE.Vector3(), fov: 55 };
  const live = { pos: new THREE.Vector3(), target: new THREE.Vector3(), fov: 55 };
  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();
  const tmpC = new THREE.Vector3();
  let flight = null;
  let clockT = 0;

  function pose() {
    const aspectK = clamp(1.3 / (W / H), 1, 2.3);
    live.fov = 55;
    if (state.level === "cosmos") {
      live.target.copy(stops[state.sel].position);
      live.pos.set(0, 300 * aspectK, 920 * aspectK).add(live.target);
      return live;
    }
    const g = galaxies[state.si];
    const p = g.planets[state.sel];
    if (state.level === "galaxy") {
      const drift = Math.sin(clockT * 0.05) * 0.3;
      const d = 250 * aspectK * zoom;
      live.target.copy(g.group.position).addScaledVector(UP, -12).lerp(p.world, 0.3);
      live.pos.set(Math.sin(yaw + drift) * d, 125 * aspectK * zoom * (1 + pitch), Math.cos(yaw + drift) * d).applyQuaternion(g.group.quaternion).add(live.target);
      return live;
    }
    const P = p.world;
    const radial = tmpA.copy(P).sub(g.group.position).normalize();
    const tangent = tmpB.crossVectors(UP, radial).normalize();
    const dir = tmpC.copy(radial).multiplyScalar(-0.3).addScaledVector(tangent, 0.9).addScaledVector(UP, 0.3).normalize();
    live.pos.copy(P).addScaledVector(dir, p.size * 1.15);
    live.target.copy(P);
    live.fov = 80;
    return live;
  }
  function snap() {
    place();
    pose();
    cam.pos.copy(live.pos);
    cam.target.copy(live.target);
    cam.fov = live.fov;
    flight = null;
  }
  function fly(onDone, dur) {
    pose();
    const dist = cam.pos.distanceTo(live.pos);
    flight = {
      fromPos: cam.pos.clone(),
      fromTarget: cam.target.clone(),
      fromFov: cam.fov,
      t0: performance.now(),
      dur: (dur ?? clamp(0.9 + Math.log10(1 + dist) * 0.6, 1.1, 3.4)) * 1000,
      arc: Math.min(dist * 0.12, 320),
      fovKick: clamp(dist / 70, 0, 24),
      warp: clamp(dist / 500, 0.15, 1),
      onDone,
    };
  }

  // ---------- game ----------
  const playEl = $(".uv-play");
  const flash = $(".uv-flash");
  const portal = $(".uv-portal");
  let game = null;
  /** Options the current game was mounted with, so a language switch can mount it again the same way. */
  let mountedOpts = {};
  let gameHost = null;
  let gameToken = 0;
  let exitPoll = 0;
  let covering = false;
  let coverTimer = 0;
  function enterGame() {
    const token = ++gameToken;
    const p = galaxies[state.si].planets[state.sel];
    music.hold();
    sfx.warp();
    root.style.setProperty("--accent", p.w.colors[0]);
    flash.style.background = `radial-gradient(circle, #fff 0%, ${p.w.colors[0]} 45%, #020208 100%)`;
    flash.classList.add("on");
    const modulePromise = p.w.game();
    fly(async () => {
      if (token !== gameToken) return;
      gameHost = document.createElement("div");
      gameHost.className = "uv-game";
      playEl.prepend(gameHost);
      openPlay();
      flash.classList.remove("on");
      exitPoll = setInterval(() => {
        const reading = !!gameHost?.querySelector(".overlay:not([hidden])");
        $(".uv-exit").classList.toggle("show", reading);
        $(".uv-langplay").classList.toggle("show", reading);
      }, 250);
      try {
        const mount = await modulePromise;
        if (token !== gameToken) return;
        const opts = pendingGame;
        pendingGame = {};
        mountedOpts = opts;
        const g = await mount(gameHost, { search: "", lang, ...opts });
        if (token !== gameToken) g.destroy();
        else game = g;
      } catch (e) {
        console.error(e);
        if (token !== gameToken) return;
        toast(S("failed"));
        leaveGame();
      }
    }, 1.4);
  }
  /** Reveal the game through a portal opening from the centre of the dive. */
  function openPlay() {
    playEl.hidden = false;
    playEl.classList.remove("open");
    portal.classList.remove("go");
    void playEl.offsetWidth;
    playEl.classList.add("open");
    portal.classList.add("go");
    clearTimeout(coverTimer);
    coverTimer = setTimeout(() => (covering = playEl.classList.contains("open")), 900);
  }
  /** Mount the current game again, in the language just chosen. It starts over from its title. */
  async function remountGame() {
    const token = ++gameToken;
    const host = gameHost;
    game?.destroy();
    game = null;
    try {
      const mount = await galaxies[state.si].planets[state.sel].w.game();
      if (token !== gameToken) return;
      const g = await mount(host, { search: "", lang, ...mountedOpts });
      if (token !== gameToken) g.destroy();
      else game = g;
    } catch (e) {
      console.error(e);
      if (token === gameToken) toast(S("failed"));
    }
  }

  /** Close the portal over the game, then tear it down; the camera pulls back out meanwhile. */
  function exitGame() {
    gameToken++;
    playPushed = false;
    clearInterval(exitPoll);
    clearTimeout(coverTimer);
    covering = false;
    const g = game;
    const host = gameHost;
    sfx.back();
    game = null;
    gameHost = null;
    playEl.classList.remove("open");
    $(".uv-exit").classList.remove("show");
    flash.classList.remove("on");
    setTimeout(() => {
      g?.destroy();
      host?.remove();
      if (!playEl.classList.contains("open")) playEl.hidden = true;
    }, 700);
    music.release();
  }
  /** Back out of the game; a game's back-button guard entry is stepped over too. */
  const leaveGame = () => {
    if (playPushed && state.level === "game") history.go(history.state?.mvgGuard ? -2 : -1);
    else go({ level: "galaxy", si: state.si, wi: state.sel });
  };
  $(".uv-exit").addEventListener("click", leaveGame, { signal });
  $(".uv-quit").addEventListener("click", leaveGame, { signal });

  // ---------- HUD ----------
  let toastTimer = 0;
  function toast(text) {
    const el = $(".uv-toast");
    el.textContent = text;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 1600);
  }
  function hud() {
    root.dataset.level = state.level;
    root.classList.toggle("uv-first", state.level === "cosmos" && state.sel === 0);
    root.classList.toggle("uv-last", state.level === "cosmos" && state.sel === stops.length - 1);
    $(".uv-back b").textContent = local(series[state.si].name, lang);
    if (state.level !== "galaxy") return;
    const w = series[state.si].works[state.sel];
    const panel = $(".uv-panel");
    panel.classList.toggle("live", !!w.game);
    panel.style.setProperty("--accent", w.game ? w.colors[0] : GREY);
    panel.querySelector("h1").textContent = local(w.title, lang);
    panel.querySelector(".uv-howto").replaceChildren(...[local(w.howto, lang) ?? []].flat().map((line) => Object.assign(document.createElement("span"), { textContent: line })));
  }
  $(".uv-go").addEventListener("click", () => activate(state.sel), { signal });
  $(".uv-back").addEventListener("click", () => up(), { signal });
  root.querySelectorAll(".uv-arrow").forEach((b) => b.addEventListener("click", () => step(Number(b.dataset.step)), { signal }));
  const toggleMute = () => {
    music.unlock();
    music.setMuted(!music.muted);
    sfx.click();
  };
  muteBtn.addEventListener("click", toggleMute, { signal });
  gateMute.addEventListener("click", toggleMute, { signal });
  root.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (b && b !== muteBtn && b !== gateMute && !b.closest(".uv-game")) sfx.click();
  }, { signal, capture: true });
  root.addEventListener("pointerover", (e) => {
    const b = e.target.closest("button");
    if (b && !b.contains(e.relatedTarget) && !b.closest(".uv-game")) sfx.hover(b.classList.contains("uv-go") ? 7 : 4);
  }, { signal });
  const toggleFullscreen = () => (document.fullscreenElement ? document.exitFullscreen() : root.requestFullscreen?.())?.catch?.(() => {});
  $(".uv-fs").addEventListener("click", toggleFullscreen, { signal });

  function step(d) {
    if (state.level === "cosmos") slide(state.sel + d);
    else if (state.level === "galaxy") {
      const n = galaxies[state.si].planets.length;
      select((state.sel + d + n) % n);
    }
  }
  function enter() {
    if (state.level === "cosmos") go({ level: "galaxy", si: state.sel });
    else if (state.level === "galaxy") activate(state.sel);
  }
  function up() {
    if (state.level === "galaxy") go({ level: "cosmos" });
  }

  // ---------- input ----------
  const gate = $(".uv-gate");
  function start() {
    if (started) return;
    started = true;
    hear();
    sfx.gate();
    gateFx.burst(clockT);
    gate.classList.add("gone");
    root.classList.add("uv-started");
    fly(undefined, 3.4);
  }
  /** Browsers only allow sound after a gesture: the first click or key anywhere turns it on. */
  const hear = () => {
    music.unlock();
    sfx.unlock();
    root.classList.remove("uv-silent");
  };
  addEventListener("pointerdown", hear, { signal, capture: true });
  addEventListener("keydown", (e) => {
    if (state.level === "game") {
      if (e.key === "Escape" && gameHost?.querySelector("#title:not([hidden]), #result:not([hidden])")) leaveGame();
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    hear();
    const k = e.key;
    if (!started) {
      if (k === "Enter" || k === " ") start();
      return;
    }
    if (k === "ArrowLeft" || k === "ArrowUp" || k.toLowerCase() === "a") step(-1);
    else if (k === "ArrowRight" || k === "ArrowDown" || k.toLowerCase() === "d") step(1);
    else if (k === "Enter" || k === " ") enter();
    else if (k === "Escape" || k === "Backspace") up();
    else if (k.toLowerCase() === "m") {
      music.setMuted(!music.muted);
      sfx.click();
    }
    else if (k.toLowerCase() === "f") toggleFullscreen();
    else return;
    e.preventDefault();
  }, { signal });

  const canvas = renderer.domElement;
  const ndc = new THREE.Vector3();
  function screen(v) {
    ndc.copy(v).project(camera);
    return { x: (ndc.x * 0.5 + 0.5) * W, y: (-ndc.y * 0.5 + 0.5) * H, front: ndc.z < 1 };
  }
  function pxRadius(v, r) {
    const d = camera.position.distanceTo(v);
    return (r / (d * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)))) * (H / 2);
  }
  function pick(x, y) {
    let best = null;
    let bestD = Infinity;
    const consider = (v, r, hit) => {
      const s = screen(v);
      if (!s.front) return;
      const d = Math.hypot(s.x - x, s.y - y);
      if (d < Math.max(30, r) && d < bestD) {
        best = hit;
        bestD = d;
      }
    };
    if (state.level === "cosmos") stops.forEach((g, i) => consider(g.position, pxRadius(g.position, GALAXY_R * 0.6), { stop: i }));
    else if (state.level === "galaxy") for (const p of galaxies[state.si].planets) consider(p.world, pxRadius(p.world, p.size * 2), { planet: p.k });
    return best;
  }
  let gateHover = false;
  const logoCenter = new THREE.Vector3();
  /** Whether screen point (x, y) is on the opening stage's wordmark. */
  function overLogo(x, y) {
    logoCenter.copy(GATE).addScaledVector(UP, LOGO_Y);
    const s = screen(logoCenter);
    return Math.abs(x - s.x) < pxRadius(logoCenter, LOGO_HALF[0]) && Math.abs(y - s.y) < pxRadius(logoCenter, LOGO_HALF[1] * 1.6);
  }
  let down = null;
  canvas.addEventListener("pointerdown", (e) => {
    down = { x: e.clientX, y: e.clientY, x0: e.clientX, moved: 0 };
    canvas.setPointerCapture(e.pointerId);
  }, { signal });
  canvas.addEventListener("pointermove", (e) => {
    const r = canvas.getBoundingClientRect();
    if (down) {
      const dx = e.clientX - down.x;
      const dy = e.clientY - down.y;
      down.moved += Math.abs(dx) + Math.abs(dy);
      down.x = e.clientX;
      down.y = e.clientY;
      if (down.moved > 6 && state.level === "galaxy") {
        yaw -= dx * 0.005;
        pitch = clamp(pitch + dy * 0.004, -0.7, 1.4);
      }
      return;
    }
    if (!started) {
      const over = overLogo(e.clientX - r.left, e.clientY - r.top);
      if (over && !gateHover) sfx.hover(7);
      gateHover = over;
      canvas.style.cursor = gateHover ? "pointer" : "default";
      return;
    }
    if (flight) return;
    const hit = pick(e.clientX - r.left, e.clientY - r.top);
    const next = hit?.stop ?? hit?.planet ?? null;
    if (next != null && next !== state.hover) sfx.hover(next % 8);
    state.hover = next;
    canvas.style.cursor = hit ? "pointer" : state.level === "galaxy" ? "grab" : "default";
  }, { signal });
  canvas.addEventListener("pointerup", (e) => {
    const d = down;
    down = null;
    if (!d) return;
    if (!started) {
      const r = canvas.getBoundingClientRect();
      if (d.moved < 6 && overLogo(e.clientX - r.left, e.clientY - r.top)) start();
      return;
    }
    music.unlock();
    if (state.level === "cosmos" && Math.abs(e.clientX - d.x0) > 60) return step(e.clientX < d.x0 ? 1 : -1);
    if (d.moved > 6) return;
    const r = canvas.getBoundingClientRect();
    const hit = pick(e.clientX - r.left, e.clientY - r.top);
    if (!hit) return;
    if (hit.stop != null) {
      if (hit.stop !== state.sel) slide(hit.stop);
      else enter();
    } else if (hit.planet != null) activate(hit.planet);
  }, { signal });
  let wheelAcc = 0;
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    if (state.level === "cosmos") {
      wheelAcc += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (Math.abs(wheelAcc) > 80) {
        step(Math.sign(wheelAcc));
        wheelAcc = 0;
      }
    } else zoom = clamp(zoom * Math.exp(e.deltaY * 0.001), 0.55, 1.8);
  }, { signal, passive: false });

  // ---------- frame ----------
  let orbitT = 0;
  let orbitRate = 1;
  let last = performance.now();
  let raf = 0;
  let bassAvg = 0;
  let lastKick = -1;
  let kick = 0;
  let warpLevel = 0;
  let warpT = 0;
  let nextMeteor = 2;
  let slideAt = Infinity;
  let logoDim = 1;
  function place() {
    for (const g of galaxies)
      for (const p of g.planets) {
        const a = p.phase + orbitT * p.speed;
        p.holder.position.set(Math.cos(a) * p.r, 0, Math.sin(a) * p.r);
        p.holder.updateMatrixWorld(true);
        p.holder.getWorldPosition(p.world);
      }
  }
  function fireShock(g) {
    const sh = g.shocks[g.shockHead];
    g.shockHead = (g.shockHead + 1) % SHOCKS;
    sh.life = 1;
    sh.mesh.visible = true;
    sh.material.uniforms.uColor.value.set(g.s.colors[Math.floor(Math.random() * g.s.colors.length)]);
  }
  function frame() {
    raf = requestAnimationFrame(frame);
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    clockT += dt;
    if (clockT >= slideAt) {
      slideAt = Infinity;
      if (state.level === "cosmos") music.shuffle(seriesTracks[state.sel]);
    }
    music.tick();
    const { bass } = music.levels();
    if (state.level === "game" && covering) return;

    bassAvg += (bass - bassAvg) * Math.min(1, dt * 1.5);
    if (bass > 0.2 && bass > bassAvg * 1.12 + 0.03 && clockT - lastKick > 0.28) {
      lastKick = clockT;
      kick = 1;
      for (const g of galaxies) fireShock(g);
    }
    kick *= Math.exp(-dt * 6);
    const pulse = Math.max(bass * bass * 0.6, kick);

    orbitRate += ((state.level === "game" ? 0 : 1) - orbitRate) * Math.min(1, dt * 3);
    orbitT += dt * orbitRate;
    place();

    let warpWant = 0;
    if (flight) {
      const u = clamp((now - flight.t0) / flight.dur, 0, 1);
      const e = easeInOut(u);
      pose();
      cam.pos.lerpVectors(flight.fromPos, live.pos, e).addScaledVector(UP, Math.sin(Math.PI * u) * flight.arc);
      cam.target.lerpVectors(flight.fromTarget, live.target, easeInOut(Math.min(1, u * 1.3)));
      cam.fov = lerp(flight.fromFov, live.fov, e) + Math.sin(Math.PI * u) * flight.fovKick;
      warpWant = Math.pow(Math.sin(Math.PI * u), 0.7) * flight.warp;
      if (u >= 1) {
        const done = flight.onDone;
        flight = null;
        done?.();
      }
    } else if (started) {
      pose();
      const k = 1 - Math.exp(-dt * (state.level === "cosmos" ? 4.5 : 3));
      cam.pos.lerp(live.pos, k);
      cam.target.lerp(live.target, k);
      cam.fov = lerp(cam.fov, live.fov, k);
    } else {
      const aspectK = clamp(1.1 / (W / H), 1, 2.4);
      cam.target.copy(GATE).addScaledVector(UP, 25);
      cam.pos.set(Math.sin(clockT * 0.3) * 40, 25 + Math.sin(clockT * 0.23) * 15, 1000 * aspectK).add(GATE);
      cam.fov = 55;
    }
    camera.position.copy(cam.pos);
    camera.lookAt(cam.target);
    camera.fov = cam.fov;
    camera.updateProjectionMatrix();

    warpLevel += (warpWant - warpLevel) * Math.min(1, dt * 6);
    warpT += dt * (40 + warpLevel * 1100);
    warp.material.uniforms.uTime.value = warpT;
    warp.material.uniforms.uSpeed.value = warpLevel;
    warp.object.visible = warpLevel > 0.01;
    bloom.strength = 0.85 + warpLevel * 0.2 + kick * 0.25;
    post.uniforms.uCA.value = 0.12 + pulse * 0.4 + warpLevel * 2.5;
    post.uniforms.uTime.value = clockT;

    if (started && clockT > nextMeteor && !flight) {
      meteors.spawn(camera, camera.position.distanceTo(cam.target) * 0.9 + 200);
      nextMeteor = clockT + 1.2 + Math.random() * 3;
    }
    meteors.update(dt);

    const px = renderer.getPixelRatio();
    sky.group.position.copy(camera.position);
    sky.stars.material.uniforms.uTime.value = clockT;
    sky.stars.material.uniforms.uPixel.value = px;
    sky.stars.material.uniforms.uPulse.value = pulse;
    sky.nebula.material.uniforms.uTime.value = clockT;
    logoDim += ((state.level === "cosmos" ? 0.8 : 0.55) - logoDim) * Math.min(1, dt * 2);
    if (gateFx.group.visible) gateFx.update(clockT, pulse, gateHover, px);
    for (const l of logos) {
      l.group.visible = started;
      l.update(clockT, kick);
      l.material.uniforms.uDim.value = logoDim;
    }
    root.style.setProperty("--beat", pulse.toFixed(3));

    for (const g of galaxies) {
      const d = camera.position.distanceTo(g.group.position);
      g.fade += ((state.level === "cosmos" || g.i === state.si ? 1 : 0) - g.fade) * Math.min(1, dt * 3);
      g.group.visible = started && g.fade > 0.01 && Math.abs(g.group.position.x - camera.position.x) < GALAXY_RANGE;
      const near = smooth(1400, 700, d);
      const system = d < SYSTEM_RANGE;
      for (const p of g.planets) p.holder.visible = p.orbit.line.visible = system;
      if (!g.group.visible) continue;
      g.disc.points.rotation.y = g.clouds.points.rotation.y = clockT * 0.012;
      for (const m of [g.disc.material, g.clouds.material]) {
        m.uniforms.uPixel.value = px;
        m.uniforms.uPulse.value = pulse;
      }
      g.disc.material.uniforms.uOpacity.value = g.fade;
      g.clouds.material.uniforms.uOpacity.value = 0.07 * g.fade;
      g.halo.material.opacity = smooth(500, 1600, d) * (0.25 + pulse * 0.25) * g.fade;
      g.sunGlow.material.opacity = 0.55 * g.fade;
      g.sun.mesh.scale.setScalar(6 * g.fade);
      g.disk.mesh.scale.setScalar(6 * g.fade);
      g.sun.material.uniforms.uTime.value = clockT;
      g.sun.material.uniforms.uPulse.value = pulse;
      g.sunGlow.scale.setScalar(38 + pulse * 30);
      g.disk.material.uniforms.uTime.value = clockT;
      g.disk.material.uniforms.uPulse.value = pulse;
      for (const sh of g.shocks) {
        if (!sh.mesh.visible) continue;
        sh.life -= dt / 2.2;
        if (sh.life <= 0) {
          sh.mesh.visible = false;
          continue;
        }
        sh.mesh.scale.setScalar(10 + easeOutCubic(1 - sh.life) * 260);
        sh.material.uniforms.uLife.value = sh.life * 0.6;
      }
      const inside = state.si === g.i && state.level === "galaxy";
      if (system) for (const p of g.planets) {
        const picked = inside && state.sel === p.k;
        const lit = picked || (inside && state.hover === p.k);
        p.body.material.uniforms.uTime.value = clockT;
        p.body.material.uniforms.uPulse.value = pulse;
        p.body.mesh.rotation.y = clockT * 0.12 + p.k;
        p.atmo.material.opacity = (p.live ? 0.55 + pulse * 0.6 : 0.3) * (lit ? 1.5 : 1);
        p.feature?.update(clockT, pulse);
        if (p.beacon) {
          p.beacon.mesh.visible = state.level !== "game";
          p.beacon.material.uniforms.uTime.value = clockT;
          p.beacon.material.uniforms.uPulse.value = pulse;
        }
        p.orbit.material.opacity = near * (picked ? 0.55 : lit ? 0.35 : p.live ? 0.28 : 0.1) * (1 + pulse * 0.6);
      }
    }
    if (state.level === "galaxy") {
      const p = galaxies[state.si].planets[state.sel];
      marker.visible = true;
      marker.position.copy(p.world);
      marker.scale.setScalar(p.size * (4.4 + pulse * 0.6));
      marker.material.rotation = clockT * 0.6;
      marker.material.color.set(p.live ? p.w.colors[0] : "#ffffff");
    } else marker.visible = false;

    updateLabels();
    composer.render();
  }
  function updateLabels() {
    const showStops = started && state.level === "cosmos" && !flight;
    const showPlanets = started && state.level === "galaxy";
    const put = (el, v, show) => {
      const s = show && screen(v);
      if (!s || !s.front || s.x < -100 || s.x > W + 100 || s.y < -50 || s.y > H + 50) {
        el.classList.remove("show");
        return;
      }
      el.classList.add("show");
      el.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px) translate(-50%, -100%)`;
    };
    const hp = showPlanets && state.hover != null && state.hover !== state.sel ? galaxies[state.si].planets[state.hover] : null;
    if (hp) {
      hoverTag.firstChild.textContent = local(hp.w.title, lang);
      hoverTag.classList.toggle("soon", !hp.live);
      tmpA.copy(hp.world).addScaledVector(UP, hp.size * 2.2);
    }
    put(hoverTag, tmpA, !!hp);
    galaxies.forEach((g, i) => {
      tmpA.copy(g.group.position).addScaledVector(UP, 150);
      put(g.label, tmpA, showStops);
      g.label.classList.toggle("on", state.sel === i);
    });
    for (const g of galaxies)
      for (const p of g.planets) {
        if (!p.label) continue;
        tmpA.copy(p.world).addScaledVector(UP, p.size * 2.4);
        put(p.label, tmpA, showPlanets && state.si === g.i);
      }
  }

  const first = parse(location.hash);
  relabel();
  apply(first, true);
  if (first.level === "game") skipGate();
  hud();
  frame();

  /** Find a work by id (`binary-boogie`) or `<series>/<work>`. */
  function find(id) {
    const [a, b] = String(id).split("/").slice(-2);
    const sid = b ? a : null;
    const wid = b ?? a;
    for (const [si, s] of series.entries()) {
      if (sid && s.id !== sid) continue;
      const wi = s.works.findIndex((w) => w.id === wid);
      if (wi >= 0) return { si, wi };
    }
    return null;
  }
  function skipGate() {
    if (started) return;
    started = true;
    gateFx.burst(-10);
    gate.classList.add("gone");
    root.classList.add("uv-started");
  }

  return {
    /** Jump straight into a game: `play("binary-boogie", { start: 31, auto: true })`. */
    play(id, opts = {}) {
      const at = find(id);
      if (!at || !series[at.si].works[at.wi].game) throw new Error(`no game for ${id}`);
      skipGate();
      if (state.level === "game") {
        exitGame();
        state.level = "galaxy";
      }
      const q = new URLSearchParams();
      if (opts.start != null) q.set("start", String(opts.start));
      if (opts.auto) q.set("auto", "");
      if (opts.play) q.set("play", "");
      const r = { level: "game", si: at.si, wi: at.wi, opts: gameOptions(q) };
      history.pushState(null, "", hashOf(r));
      playPushed = true;
      apply(r);
    },
    /** Fly to a galaxy, or a planet in it: `open("stem-institute")`, `open("planet-parade")`. */
    open(id) {
      skipGate();
      const si = series.findIndex((s) => s.id === id);
      const at = si >= 0 ? { si } : find(id);
      if (!at) throw new Error(`nothing called ${id}`);
      go({ level: "galaxy", ...at });
    },
    destroy() {
      cancelAnimationFrame(raf);
      ac.abort();
      ro.disconnect();
      exitGame();
      music.hold();
      renderer.dispose();
      root.replaceChildren();
      root.classList.remove("uv");
    },
  };
}

/** Plain links for browsers without WebGL. */
function fallback(root, series, lang) {
  root.innerHTML = `<main class="uv-fallback">${series
    .map(
      (s) => `<h1>${local(s.name, lang)}</h1><ul>${s.works
        .map((w) => (w.game ? `<li>${local(w.title, lang)}</li>` : `<li class="soon">${local(w.title, lang)} · ${STRINGS[lang].soon}</li>`))
        .join("")}</ul>`,
    )
    .join("")}</main>`;
  return { destroy: () => root.replaceChildren() };
}
