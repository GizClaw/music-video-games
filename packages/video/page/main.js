import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { FinalShader, H, HudShader, W, seededRandom } from "@gizclaw/mvg-core/fx.js";
import { FONT_COND, FONT_HEAVY, FONT_MONO, Hud, LYRIC_Y } from "@gizclaw/mvg-core/hud.js";
import { Timing, smooth } from "@gizclaw/mvg-core/timing.js";
import { StaticSubtitles, SUBTITLE_FONT, SubtitleShader } from "./subtitles.js";
import { parseSrt } from "./captions.js";

Math.random = seededRandom(20261014);

const params = new URLSearchParams(location.search);

async function loadSubtitles() {
  if (["none", "external"].includes(params.get("subtitles"))) return null;
  if (params.get("subtitle-source") !== "json") {
    const srt = await fetch("/media/subtitles.zh-CN.srt");
    if (srt.ok) return parseSrt(await srt.text());
    if (srt.status !== 404) throw new Error(`Chinese SRT: HTTP ${srt.status}`);
  }
  const json = await fetch("/media/subtitles.zh-CN.json");
  if (json.status === 404) return null;
  if (!json.ok) throw new Error(`Chinese subtitles: HTTP ${json.status}`);
  return json.json();
}

async function boot() {
  const work = params.get("work");
  if (!/^songs\/[a-z0-9-]+\/[a-z0-9-]+\/[a-z-]+\/[a-z0-9-]+$/.test(work || "")) throw new Error("missing ?work=songs/<category>/<album>/<lang>/<id>");
  const [analysis, logoSvg, songModule, subtitleTrack] = await Promise.all([
    fetch("/media/analysis.json").then((r) => r.json()),
    fetch("/packages/core/assets/haivivi-wordmark.svg").then((r) => r.text()),
    import(`/aigc/${work}/video/song.js`),
    loadSubtitles(),
  ]);
  await Promise.all(
    [`800 64px ${FONT_HEAVY}`, `600 64px ${FONT_HEAVY}`, `800 64px ${FONT_COND}`, `600 30px ${FONT_MONO}`, `700 30px ${FONT_MONO}`, `500 36px ${SUBTITLE_FONT}`].map((f) => document.fonts.load(f)),
  );

  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const canvas = renderer.domElement;
  canvas.id = "stage";
  document.getElementById("wrap").appendChild(canvas);

  const timing = new Timing(analysis);
  const hud = new Hud();
  const hudTex = new THREE.CanvasTexture(hud.canvas);
  hudTex.colorSpace = THREE.NoColorSpace;
  hudTex.premultiplyAlpha = true;
  hudTex.minFilter = THREE.LinearFilter;
  hudTex.generateMipmaps = false;

  const ctx = { renderer, timing, hud, assets: { logoSvg } };
  const song = songModule.createSong(ctx);
  const subtitles = new StaticSubtitles(timing, subtitleTrack, song.intro.end);
  const subtitleTex = new THREE.CanvasTexture(subtitles.canvas);
  subtitleTex.colorSpace = THREE.NoColorSpace;
  subtitleTex.premultiplyAlpha = true;
  subtitleTex.minFilter = THREE.LinearFilter;
  subtitleTex.generateMipmaps = false;
  const lyricY = song.lyricY ?? LYRIC_Y;
  const { scenes, pick } = song;

  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 }));
  composer.setPixelRatio(1);
  composer.setSize(W, H);
  const renderPass = new RenderPass(scenes.intro.scene, scenes.intro.camera);
  const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 1.2, 0.5, 0.1);
  const finalPass = new ShaderPass(FinalShader);
  const outputPass = new OutputPass();
  const hudPass = new ShaderPass(HudShader);
  hudPass.uniforms.tHud.value = hudTex;
  [renderPass, bloom, finalPass, outputPass, hudPass].forEach((p) => composer.addPass(p));
  if (subtitleTrack) {
    const subtitlePass = new ShaderPass(SubtitleShader);
    subtitlePass.uniforms.tSubtitles.value = subtitleTex;
    composer.addPass(subtitlePass);
  }

  // Warm every scene once so shader compilation does not land inside a timed frame.
  for (const s of Object.values(scenes)) renderer.compile(s.scene, s.camera);

  const POST_DEFAULT = { bloom: [1.1, 0.5, 0.1], ca: 0.2, flash: 0, flashColor: "#ffffff", shock: undefined, glitch: 0, mirror: 0, invert: 0, pixel: 0, zoom: 1, sat: 1, fade: 0, vignette: 0.4, grain: 0.022, hudCA: 0, scan: 0 };

  function renderAt(t, frame = Math.round(t * 30), { lyrics = true, chinese = true } = {}) {
    const [key, section] = pick(t);
    const s = scenes[key];
    hud.clear();
    const post = { ...POST_DEFAULT, ...s.update(t, section) };
    if (lyrics && section !== "intro" && section !== "end") {
      hud.lyric(t, timing, { y: lyricY, ...(post.lyric || {}) });
    } else if (lyrics && section === "intro") {
      hud.lyric(t, timing, { y: lyricY, opacity: 1 - smooth(song.intro.build - 0.08, song.intro.build + 0.22, t) });
    }
    hudTex.needsUpdate = true;
    if (subtitles.renderAt(t, lyrics && chinese && section !== "end")) subtitleTex.needsUpdate = true;

    renderPass.scene = s.scene;
    renderPass.camera = s.camera;
    bloom.strength = post.bloom[0];
    bloom.radius = post.bloom[1];
    bloom.threshold = post.bloom[2];
    const fu = finalPass.uniforms;
    fu.uTime.value = t;
    fu.uCA.value = post.ca;
    fu.uGlitch.value = post.glitch;
    fu.uMirror.value = post.mirror;
    fu.uInvert.value = post.invert;
    fu.uZoom.value = post.zoom;
    fu.uSat.value = post.sat;
    fu.uPixel.value = post.pixel;
    if (post.shock) fu.uShock.value.set(...post.shock);
    else fu.uShock.value.set(0.5, 0.5, -1, 0);
    const hu = hudPass.uniforms;
    hu.uFlash.value = Math.min(1.2, post.flash);
    hu.uFlashColor.value.set(post.flashColor);
    hu.uFade.value = Math.min(1, post.fade);
    hu.uVignette.value = post.vignette;
    hu.uGrain.value = post.grain;
    hu.uFrame.value = frame;
    hu.uHudCA.value = post.hudCA + post.glitch * 0.6;
    hu.uScan.value = post.scan;
    composer.render();
  }

  window.__video = {
    fps: timing.fps,
    duration: timing.duration,
    frames: Math.ceil(timing.duration * timing.fps),
    renderFrame(i) {
      renderAt(i / timing.fps, i);
      return canvas.toDataURL("image/jpeg", 0.94);
    },
    renderAt,
    lyricY,
    subtitleCues: subtitles.cues,
    /** Screen rectangles of the foreground text drawn at t, rendered without lyrics. */
    keepouts(t) {
      renderAt(t, Math.round(t * 30), { lyrics: false });
      return hud.rects.slice();
    },
  };

  if (params.has("t")) renderAt(Number(params.get("t")));
  if (params.has("preview")) startPreview(renderAt, timing);
  window.__ready = true;
}

function startPreview(renderAt, timing) {
  const audio = new Audio("/media/audio.ogg");
  const ui = document.getElementById("ui");
  ui.hidden = false;
  const seek = document.getElementById("seek");
  const label = document.getElementById("time");
  seek.max = timing.duration;
  let playing = false;
  document.getElementById("play").onclick = () => {
    playing = !playing;
    if (playing) audio.play();
    else audio.pause();
  };
  seek.oninput = () => {
    audio.currentTime = Number(seek.value);
    renderAt(audio.currentTime);
  };
  const loop = () => {
    const t = audio.currentTime;
    if (playing) {
      renderAt(t);
      seek.value = t;
    }
    label.textContent = t.toFixed(2);
    requestAnimationFrame(loop);
  };
  const start = Number(params.get("start") || 0);
  audio.currentTime = start;
  renderAt(start);
  loop();
}

boot().catch((e) => {
  window.__error = String(e?.stack || e);
  console.error(e);
});
