#!/usr/bin/env node
// Beat-synced three.js music video for an AIGC song.
//
//   mvg-video --work songs/<category>/<album>/<lang>/<id>|<id> [--catalog <aigc catalog dir>] <command>
//
// --work is the song's path in the AIGC catalog; its choreography lives at the
// same path under the project's aigc/ directory (aigc/<work>/video/song.js).
//
//   prepare                 analyse the catalog song's beats into the cache
//   snap <name> <t> [t...]  render timestamps into a contact sheet under build/
//   preview                 serve a live preview with audio
//   game-data               write the game's trimmed analysis to aigc/<work>/game/analysis.json
//   render [--workers N] [--from S --to S]
//   encode                  rewrite the MP4 and WebM from an existing master
//   inspect                 print aligned cues, energy and intro drop candidates
//   clearance               report lyric lines whose fixed bottom band crowds foreground text
//   subtitles               write the aligned Chinese SubRip sidecar from the translation track
import { spawn, execFileSync } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { startServer } from "../serve.mjs";
import { formatSrt, parseSrt } from "../page/captions.js";
import { readMasterMode, saveMasterMode, SUBTITLE_MODES, writeSubtitleOutput } from "./subtitle-mode.mjs";
import { readLocalConfig } from "./local-config.mjs";

const PKG = join(dirname(fileURLToPath(import.meta.url)), "..");
const PY = join(PKG, "python");
const GPU_ARGS = ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"];
const W = 1080;
const H = 1920;

const { values: opts, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    root: { type: "string", default: process.env.GIZCLAW_ROOT },
    catalog: { type: "string", default: process.env.MVG_CATALOG },
    project: { type: "string", default: process.cwd() },
    help: { type: "boolean", default: false },
    version: { type: "boolean", default: false },
    work: { type: "string" },
    workers: { type: "string", default: "4" },
    from: { type: "string" },
    to: { type: "string" },
    force: { type: "boolean", default: false },
    port: { type: "string", default: "5178" },
    format: { type: "string", default: "both" },
    subtitles: { type: "string" },
  },
});
if (opts.version) {
  console.log(JSON.parse(readFileSync(join(PKG, "package.json"), "utf8")).version);
  process.exit(0);
}
if (opts.help) {
  console.log("usage: mvg-video [--project <choreography project>] --work <catalog work path or id> [--root <media root>] [--format mp4|webm|both] [--subtitles embed|external|none] prepare|snap|preview|game-data|render|encode|inspect|clearance|subtitles");
  console.log("Media root: --root or GIZCLAW_ROOT is required. Optional <project>/.env.local supplies GIZCLAW_ROOT and MVG_CATALOG defaults; command-line options override environment variables, which override local defaults.");
  console.log("Chinese subtitles: embed (default) burns static text into render; external writes a companion .zh-CN.srt; none omits Chinese. Encode preserves the master's recorded mode; rerender to change it.");
  process.exit(0);
}
const MVG = resolve(opts.project);
const local = readLocalConfig(MVG);
opts.root ||= local.GIZCLAW_ROOT;
opts.catalog ||= local.MVG_CATALOG;
if (!opts.root) {
  console.error("--root <media root> or GIZCLAW_ROOT (environment or <project>/.env.local) is required");
  process.exit(64);
}
const [command, ...rest] = positionals;
const SUBTITLE_MODE = opts.subtitles ?? "embed";
if (!["mp4", "webm", "both"].includes(opts.format)) throw new Error("--format must be mp4, webm or both");
if (!SUBTITLE_MODES.includes(SUBTITLE_MODE)) throw new Error("--subtitles must be embed, external or none");
if (command === "encode" && opts.subtitles !== undefined) throw new Error("--subtitles applies to render, preview and snap. Encode copies the existing master; run render to change burned-in subtitles.");
const WORK_PATH = /^songs\/[a-z0-9-]+\/[a-z0-9-]+\/[a-z-]+\/[a-z0-9-]+$/;

/** Choreographed work paths under aigc/, e.g. songs/music/stem-institute/en-us/spectrum-slide. */
function choreographedWorks(dir = join(MVG, "aigc"), out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (!statSync(p).isDirectory()) continue;
    if (name === "video" || name === "game") {
      if (name === "video" && existsSync(join(p, "song.js"))) out.push(relative(join(MVG, "aigc"), dir));
      continue;
    }
    choreographedWorks(p, out);
  }
  return out;
}

// --work takes the full catalog work path or, when it is unique, just the song id.
let WORK = opts.work;
if (WORK && !WORK.includes("/")) {
  const matches = choreographedWorks().filter((w) => w.split("/").at(-1) === WORK);
  if (matches.length === 1) WORK = matches[0];
  else {
    console.error(matches.length ? `song id ${WORK} is ambiguous:\n  ${matches.join("\n  ")}` : `no choreography named ${WORK}; known songs:\n  ${choreographedWorks().join("\n  ")}`);
    process.exit(64);
  }
}
if (!WORK_PATH.test(WORK || "")) {
  console.error("--work songs/<category>/<album>/<lang>/<id> (or a unique song id) is required");
  process.exit(64);
}
const SONG_ID = WORK.split("/").at(-1);
const SONG_DIR = join(MVG, "aigc", WORK);
if (!existsSync(join(SONG_DIR, "video", "song.js"))) {
  console.error(`no choreography at aigc/${WORK}/video/song.js`);
  process.exit(64);
}

// The catalog's work YAML supplies the published title for the file metadata.
const workYaml = opts.catalog ? join(resolve(opts.catalog), `${WORK}.yaml`) : null;
const title = (workYaml && existsSync(workYaml) && readFileSync(workYaml, "utf8").match(/^\s+title:\s*"?([^"\n]+)"?/m)?.[1]) || SONG_ID;
if (!existsSync(opts.root)) {
  console.error(`GizClaw root ${opts.root} is not mounted; refusing to write media to internal storage.`);
  process.exit(2);
}
const SONG = join(opts.root, "catalogs/aigc", WORK);
const AUDIO = `${SONG}.ogg`;
const LYRICS = `${SONG}.srt`;
const FINAL = `${SONG}.mp4`;
const FINAL_WEBM = `${SONG}.webm`;
const CACHE = join(opts.root, "cache/aigc", WORK);
const BUILD = join(opts.root, "build/aigc", WORK);
const ANALYSIS = join(CACHE, "analysis.json");
const MASTER = join(BUILD, "master.mp4");
const MEDIA = { "audio.ogg": AUDIO, "analysis.json": ANALYSIS };
const SUBTITLES = `${SONG}.zh-CN.json`;
let SUBTITLE_SRT = existsSync(`${SONG}.zh-CN.srt`) ? `${SONG}.zh-CN.srt` : join(BUILD, "subtitles.zh-CN.srt");
if (existsSync(SUBTITLES)) MEDIA["subtitles.zh-CN.json"] = SUBTITLES;
if (existsSync(SUBTITLE_SRT)) MEDIA["subtitles.zh-CN.srt"] = SUBTITLE_SRT;

function prepare() {
  for (const f of [AUDIO, LYRICS]) if (!existsSync(f)) throw new Error(`missing catalog song file ${f}`);
  mkdirSync(CACHE, { recursive: true });
  const inputs = [AUDIO, LYRICS, join(PY, "analyze.py")];
  const stale = !existsSync(ANALYSIS) || inputs.some((f) => statSync(ANALYSIS).mtimeMs < statSync(f).mtimeMs);
  if (stale || opts.force) {
    execFileSync(
      "uv",
      ["run", "--quiet", "--python", "3.12", "--with-requirements", join(PY, "requirements.txt"), "python", join(PY, "analyze.py"), AUDIO, LYRICS, ANALYSIS],
      { stdio: "inherit" },
    );
  }
  const asr = findAlignment();
  const refiner = join(PY, "align_vocals.py");
  if (asr) {
    const meta = JSON.parse(readFileSync(ANALYSIS, "utf8")).word_alignment;
    const mtime = statSync(ANALYSIS).mtimeMs;
    if (!meta || meta.source !== asr || mtime < statSync(asr).mtimeMs || (meta.refined && mtime < statSync(refiner).mtimeMs)) {
      execFileSync("python3", [join(PY, "analyze.py"), "align", ANALYSIS, LYRICS, asr], { stdio: "inherit" });
    }
  } else if (JSON.parse(readFileSync(ANALYSIS, "utf8")).word_alignment) console.log("using cached lyric word alignment; ASR source is unavailable");
  else console.warn("no ASR word alignment found; lyric word times are syllable estimates");
  if (asr && !JSON.parse(readFileSync(ANALYSIS, "utf8")).word_alignment?.refined) {
    mkdirSync(BUILD, { recursive: true });
    const models = join(opts.root, "cache/models");
    execFileSync(
      "uv",
      ["run", "--quiet", "--python", "3.12", "--with-requirements", join(PY, "requirements-align.txt"), "python", refiner, AUDIO, ANALYSIS, join(CACHE, "vocals16k.wav"), join(BUILD, "lyric-clicks.wav")],
      { stdio: ["ignore", "inherit", "inherit"], env: { ...process.env, TORCH_HOME: join(models, "torch"), HF_HOME: join(models, "huggingface"), PYTHONWARNINGS: "ignore" } },
    );
  }
  console.log(`analysis ready: ${ANALYSIS}`);
}

/**
 * The catalog's lyrics-alignment.json for this song: its approved cues plus the
 * audio-mark offset reproduce the published SRT. The newest match wins; the
 * choice is remembered in the cache.
 */
function findAlignment() {
  const memo = join(CACHE, "asr-source.json");
  if (existsSync(memo) && !opts.force) {
    const { path } = JSON.parse(readFileSync(memo, "utf8"));
    if (existsSync(path)) return path;
  }
  const srt = readFileSync(LYRICS, "utf8");
  const starts = [...srt.matchAll(/(\d+):(\d+):(\d+),(\d+) -->/g)].map((m) => ((+m[1] * 60 + +m[2]) * 60 + +m[3]) * 1000 + +m[4]);
  const firstLine = srt.split(/\r?\n/).find((l, i, all) => i > 1 && /-->/.test(all[i - 1]));
  const root = join(opts.root, "catalogs/aigc", "build/work");
  let best = null;
  for (const dir of existsSync(root) ? readdirSync(root) : []) {
    const file = join(root, dir, "lyrics-alignment.json");
    if (!existsSync(file)) continue;
    const text = readFileSync(file, "utf8");
    if (!firstLine || !text.includes(firstLine.slice(0, 24))) continue;
    const a = JSON.parse(text);
    const cues = (a.cues || []).map((c) => c.start_ms + (a.marker_offset_ms || 0));
    if (cues.length !== starts.length || cues.some((c, i) => Math.abs(c - starts[i]) > 5)) continue;
    const mtime = statSync(file).mtimeMs;
    if (!best || mtime > best.mtime) best = { path: file, mtime };
  }
  if (best) writeFileSync(memo, JSON.stringify({ path: best.path }) + "\n");
  return best?.path ?? null;
}

async function openPage(browser, port, query = "") {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on("pageerror", (e) => console.error("pageerror:", e.message));
  page.on("console", (m) => m.type() === "error" && console.error("console:", m.text()));
  const url = new URL(`http://127.0.0.1:${port}/packages/video/page/index.html`);
  url.searchParams.set("work", WORK);
  url.searchParams.set("subtitles", SUBTITLE_MODE);
  for (const [key, value] of new URLSearchParams(query)) url.searchParams.set(key, value);
  await page.goto(url.href);
  await page.waitForFunction("window.__ready || window.__error", null, { timeout: 120000 });
  const err = await page.evaluate("window.__error");
  if (err) throw new Error(err);
  return page;
}

async function withBrowser(fn) {
  const { chromium } = await import("playwright");
  const server = await startServer(MEDIA, 0, MVG);
  const browser = await chromium.launch({ args: GPU_ARGS });
  try {
    return await fn(browser, server.address().port);
  } finally {
    await browser.close();
    server.close();
  }
}

/** Generate an editable SRT from the aligned song, outside the delivery directory. */
async function writeSubtitles() {
  if (!existsSync(SUBTITLES)) throw new Error(`missing translation track ${SUBTITLES}`);
  const cues = await withBrowser(async (browser, port) => {
    const page = await openPage(browser, port, "&subtitle-source=json&subtitles=embed");
    return page.evaluate(() => window.__video.subtitleCues);
  });
  mkdirSync(dirname(SUBTITLE_SRT), { recursive: true });
  writeFileSync(SUBTITLE_SRT, formatSrt(cues));
  MEDIA["subtitles.zh-CN.srt"] = SUBTITLE_SRT;
  console.log(`${SUBTITLE_SRT}  (${cues.length} Chinese cues)`);
  return SUBTITLE_SRT;
}

async function subtitleFile(mode = SUBTITLE_MODE) {
  if (mode === "none") return null;
  if (!existsSync(SUBTITLE_SRT) && existsSync(SUBTITLES)) await writeSubtitles();
  if (!existsSync(SUBTITLE_SRT)) return null;
  if (!parseSrt(readFileSync(SUBTITLE_SRT, "utf8")).length) throw new Error(`empty Chinese subtitles: ${SUBTITLE_SRT}`);
  return SUBTITLE_SRT;
}

function subtitleOutput(video, source, mode, from = 0, to = Infinity) {
  const knownSource = source || (existsSync(SUBTITLE_SRT) ? SUBTITLE_SRT : null);
  const preserved = writeSubtitleOutput(video, knownSource, mode, BUILD, from, to);
  if (preserved && preserved !== SUBTITLE_SRT) {
    SUBTITLE_SRT = preserved;
    MEDIA["subtitles.zh-CN.srt"] = preserved;
  }
  return preserved;
}

async function snap(name, times) {
  const dir = join(BUILD, "sheets", name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const files = await withBrowser(async (browser, port) => {
    const page = await openPage(browser, port);
    const out = [];
    for (const [i, t] of times.entries()) {
      const url = await page.evaluate((tt) => {
        window.__video.renderAt(tt);
        return document.getElementById("stage").toDataURL("image/jpeg", 0.9);
      }, Number(t));
      const f = join(dir, `${String(i).padStart(2, "0")}-${t}s.jpg`);
      writeFileSync(f, Buffer.from(url.split(",")[1], "base64"));
      out.push(f);
    }
    return out;
  });
  const cols = Math.min(files.length, 4);
  const cells = cols * Math.ceil(files.length / cols);
  const args = ["-y", "-loglevel", "error", ...files.flatMap((f) => ["-i", f])];
  const graph = files.map((_, i) => `[${i}:v]scale=360:640[v${i}]`);
  for (let k = files.length; k < cells; k++) graph.push(`color=black:s=360x640:d=1[v${k}]`);
  const layout = Array.from({ length: cells }, (_, i) => `${(i % cols) * 360}_${Math.floor(i / cols) * 640}`).join("|");
  graph.push(`${Array.from({ length: cells }, (_, i) => `[v${i}]`).join("")}xstack=inputs=${cells}:layout=${layout}`);
  const sheet = join(BUILD, "sheets", `${name}.jpg`);
  execFileSync("ffmpeg", [...args, "-filter_complex", graph.join(";"), "-frames:v", "1", sheet]);
  console.log(`${sheet}  (${times.join(" ")})`);
}

function encoder(file, log) {
  // Constant GOP/profile across segments so they can be concatenated without re-encoding.
  const ff = spawn(
    "ffmpeg",
    ["-y", "-loglevel", "error", "-f", "image2pipe", "-c:v", "mjpeg", "-framerate", "30", "-i", "-",
      "-vf", "scale=in_range=pc:out_range=tv:out_color_matrix=bt709,format=yuv420p",
      "-c:v", "libx264", "-preset", "slow", "-crf", "19", "-maxrate", "10M", "-bufsize", "20M",
      "-profile:v", "high", "-level:v", "4.1", "-g", "60", "-keyint_min", "60", "-sc_threshold", "0",
      "-color_range", "tv", "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-r", "30", file],
    { stdio: ["pipe", "ignore", "pipe"] },
  );
  ff.stderr.on("data", (d) => log.write(d));
  const done = new Promise((resolve, reject) => ff.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code} for ${file}`)))));
  return { ff, done };
}

/**
 * Lyrics sit at one fixed bottom position for the whole video, so the scenes must
 * keep that band clear. Render five lyric-free frames per line and report every
 * foreground text rectangle that comes within MARGIN of the line's block.
 */
async function clearance() {
  prepare();
  const data = JSON.parse(readFileSync(ANALYSIS, "utf8"));
  const { Timing } = await import("@gizclaw/mvg-core/timing.js");
  const tm = new Timing(data);
  const MARGIN = 40;
  const COLUMN = [80, 950];
  const report = await withBrowser(async (browser, port) => {
    const page = await openPage(browser, port);
    const lyricY = await page.evaluate(() => window.__video.lyricY);
    const out = [];
    for (const [i, c] of tm.cues.entries()) {
      const half = c.text.length > 30 ? 95 : 55;
      const y0 = lyricY - half - MARGIN;
      const y1 = lyricY + half + MARGIN;
      for (const f of [0.05, 0.3, 0.5, 0.7, 0.95]) {
        const t = c.start + (c.end - c.start) * f;
        const rects = await page.evaluate((tt) => window.__video.keepouts(tt), t);
        const hit = rects.find(([rx0, ry0, rx1, ry1]) => rx1 > COLUMN[0] && rx0 < COLUMN[1] && ry1 > y0 && ry0 < y1);
        if (hit) {
          out.push(`${String(i).padStart(2)} ${t.toFixed(2).padStart(7)}  y ${Math.round(hit[1])}..${Math.round(hit[3])}  ${c.text}`);
          break;
        }
      }
    }
    return out;
  });
  mkdirSync(BUILD, { recursive: true });
  const file = join(BUILD, "lyric-clearance.txt");
  writeFileSync(file, report.join("\n") + (report.length ? "\n" : ""));
  if (report.length) console.warn(`${report.length} lyric line(s) crowd foreground text (${file}):\n${report.join("\n")}`);
  else console.log(`lyric band clear for all ${tm.cues.length} lines`);
}

async function render() {
  await clearance();
  const source = await subtitleFile();
  if (SUBTITLE_MODE === "external" && !source) throw new Error("External subtitles require a Chinese SRT or JSON translation track");
  const analysis = JSON.parse(readFileSync(ANALYSIS, "utf8"));
  const total = Math.ceil(analysis.duration * analysis.fps);
  const first = opts.from ? Math.round(Number(opts.from) * 30) : 0;
  const last = opts.to ? Math.min(total, Math.round(Number(opts.to) * 30)) : total;
  const partial = first !== 0 || last !== total;
  const workers = Math.max(1, Number(opts.workers));
  const segDir = join(BUILD, "segments");
  rmSync(segDir, { recursive: true, force: true });
  mkdirSync(segDir, { recursive: true });
  const log = createWriteStream(join(BUILD, "render.log"), { flags: "a" });
  log.write(`\n# ${new Date().toISOString()} render frames ${first}-${last} with ${workers} workers\n`);

  const per = Math.ceil((last - first) / workers / 60) * 60;
  const ranges = [];
  for (let s = first; s < last; s += per) ranges.push([s, Math.min(last, s + per)]);
  const started = Date.now();
  let doneFrames = 0;
  const tick = setInterval(() => {
    const el = (Date.now() - started) / 1000;
    const fps = doneFrames / el;
    process.stdout.write(`\r${doneFrames}/${last - first} frames  ${fps.toFixed(1)} fps  eta ${((last - first - doneFrames) / Math.max(fps, 0.1)).toFixed(0)}s   `);
  }, 2000);

  const segments = await withBrowser(async (browser, port) =>
    Promise.all(
      ranges.map(async ([a, b], i) => {
        const page = await openPage(browser, port);
        const file = join(segDir, `part-${String(i).padStart(2, "0")}.mp4`);
        const { ff, done } = encoder(file, log);
        for (let f = a; f < b; f++) {
          const url = await page.evaluate((n) => window.__video.renderFrame(n), f);
          const buf = Buffer.from(url.slice(url.indexOf(",") + 1), "base64");
          if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
          doneFrames++;
        }
        ff.stdin.end();
        await done;
        await page.close();
        return file;
      }),
    ),
  );
  clearInterval(tick);
  console.log(`\nrendered ${last - first} frames in ${((Date.now() - started) / 1000).toFixed(0)}s`);

  const list = join(segDir, "parts.txt");
  writeFileSync(list, segments.map((f) => `file '${f}'`).join("\n") + "\n");
  const out = partial ? join(BUILD, `preview-${first}-${last}.mp4`) : MASTER;
  execFileSync(
    "ffmpeg",
    ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list,
      "-ss", String(first / 30), "-t", String((last - first) / 30), "-i", AUDIO,
      "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "256k", "-ar", "44100",
      "-movflags", "+faststart", "-shortest", out],
    { stdio: "inherit" },
  );
  log.end();
  console.log(out);
  if (!partial) {
    saveMasterMode(MASTER, SUBTITLE_MODE);
    await encode(SUBTITLE_MODE);
  } else {
    subtitleOutput(out, source, SUBTITLE_MODE, first / 30, last / 30);
    if (source && SUBTITLE_MODE === "embed") {
      const sidecar = join(BUILD, "subtitles", `preview-${first}-${last}.zh-CN.srt`);
      const cues = parseSrt(readFileSync(source, "utf8"));
      const clipped = formatSrt(cues, first / 30, last / 30);
      mkdirSync(dirname(sidecar), { recursive: true });
      writeFileSync(sidecar, clipped);
    }
  }
}

function ffmpeg(args, label) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const p = spawn("ffmpeg", ["-y", "-loglevel", "error", ...args], { stdio: ["ignore", "inherit", "inherit"] });
    p.on("close", (code) => {
      if (code !== 0) return reject(new Error(`${label}: ffmpeg exited ${code}`));
      console.log(`${label} done in ${((Date.now() - started) / 1000).toFixed(0)}s`);
      resolve();
    });
  });
}

/** Write the deliverables beside the song: the full-quality MP4 and a compressed WebM. */
async function encode(mode) {
  if (!existsSync(MASTER)) throw new Error(`missing master ${MASTER}; run render first`);
  mode ??= readMasterMode(MASTER);
  let source = await subtitleFile(mode);
  if (mode === "external" && !source) throw new Error("External subtitles require a Chinese SRT or JSON translation track");
  const meta = ["-metadata", `title=${title}`, "-metadata", "artist=haivivi · STEM Institute"];
  const color = ["-color_range", "tv", "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709"];
  const input = ["-i", MASTER, "-i", AUDIO, "-map", "0:v", "-map", "1:a", "-shortest"];
  // The MP4 keeps the master's full quality; only the WebM is size-reduced.
  const jobs = [];
  const outputs = [];
  if (opts.format !== "webm") {
    jobs.push(ffmpeg(["-i", MASTER, "-map", "0:v:0", "-map", "0:a:0", "-c:v", "copy", "-c:a", "copy", "-movflags", "+faststart", ...meta, FINAL], "mp4"));
    outputs.push(FINAL);
  }
  const passlog = join(BUILD, "vp9-pass");
  const vp9 = ["-c:v", "libvpx-vp9", "-b:v", "3M", "-maxrate", "3M", "-minrate", "0", "-deadline", "good", "-row-mt", "1",
    "-tile-columns", "2", "-auto-alt-ref", "1", "-lag-in-frames", "25", "-g", "120", "-pix_fmt", "yuv420p", ...color, "-passlogfile", passlog];
  if (opts.format !== "mp4") {
    jobs.push(ffmpeg(["-i", MASTER, "-an", ...vp9, "-pass", "1", "-cpu-used", "4", "-f", "null", "/dev/null"], "webm pass 1").then(() =>
      ffmpeg([...input, ...vp9, "-pass", "2", "-cpu-used", "2", "-c:a", "libopus", "-b:a", "128k", "-ar", "48000", ...meta, FINAL_WEBM], "webm pass 2"),
    ));
    outputs.push(FINAL_WEBM);
  }
  await Promise.all(jobs);
  for (const file of outputs) source = subtitleOutput(file, source, mode);
  for (const f of outputs) console.log(`${f}  ${(statSync(f).size / 1048576).toFixed(1)} MB`);
}

/** Print aligned cues, energy and beats so section boundaries and the intro drop can be chosen. */
async function inspect() {
  prepare();
  const { Timing } = await import("@gizclaw/mvg-core/timing.js");
  const data = JSON.parse(readFileSync(ANALYSIS, "utf8"));
  const tm = new Timing(data);
  const markEnd = 1.647;
  const first = tm.beatIndexAt(markEnd + 0.08) + 1;
  console.log(`tempo ${data.tempo.toFixed(1)}  period ${tm.period.toFixed(3)}s  duration ${data.duration.toFixed(2)}s  words ${data.word_alignment?.matched ?? "-"}/${data.word_alignment?.parts ?? "-"}`);
  const near = (t) => {
    const i = tm.beatIndexAt(t);
    return [i, i + 1].filter((k) => k >= 0).map((k) => `${k}@${tm.beatTime(k).toFixed(2)}`).join(" ");
  };
  tm.cues.forEach((c, i) => console.log(`${String(i).padStart(2)} ${c.start.toFixed(2).padStart(7)}–${c.end.toFixed(2).padEnd(7)} [${near(c.start)}]  ${c.text}`));
  const row = [];
  for (let f = 0; f < data.frames.low.length; f += 60) {
    const avg = (k) => (data.frames[k].slice(f, f + 60).reduce((a, b) => a + b, 0) / 60).toFixed(2);
    row.push(`${(f / 30).toFixed(0)}:${avg("rms")}/${avg("low")}`);
  }
  console.log("energy rms/low per 2s:", row.join(" "));
  const strong = data.onsets.filter(([t, s]) => t < 16 && s >= 0.25).map(([t, s]) => `${t.toFixed(2)}(${s.toFixed(2)})`);
  console.log("onsets ≥0.25 before 16s:", strong.join(" "));
  const constants = join(SONG_DIR, "video", "constants.js");
  const drop = existsSync(constants) ? (await import(constants)).SECTIONS?.drop : undefined;
  if (drop === undefined) {
    console.log("intro beats after the mark (drop candidates need ≥16):");
    for (let i = first + 15; i < first + 40 && i < tm.beats.length; i++) console.log(`  drop ${tm.beatTime(i).toFixed(2)}  beats=${i - first}  low=${tm.frame("low", tm.beatTime(i)).toFixed(2)}`);
    return;
  }
  const { deriveIntro } = await import("@gizclaw/mvg-core/intro.js");
  const c = deriveIntro(tm, { drop, end: 0 });
  const mark = (t) => {
    const o = tm.onsets.reduce((a, b) => (Math.abs(b[0] - t) < Math.abs(a[0] - t) ? b : a));
    return `${t.toFixed(2)}${Math.abs(o[0] - t) < 0.03 ? `*${o[1].toFixed(2)}` : ""}`;
  };
  console.log(`intro for drop ${drop} (* = on an onset):`);
  console.log(`  split    ${c.split.map(mark).join(" ")}`);
  console.log(`  glyph    ${c.glyph.map(mark).join(" ")}`);
  console.log(`  presents ${mark(c.presents)}   build ${mark(c.build)}`);
}

async function preview() {
  const server = await startServer(MEDIA, Number(opts.port), MVG);
  console.log(`preview: http://127.0.0.1:${server.address().port}/packages/video/page/index.html?work=${WORK}&subtitles=${SUBTITLE_MODE}&preview  (add &start=SECONDS)`);
}

/** The game needs beats, onsets and aligned lyrics only; drop the per-frame energy and spectrum. */
function gameData() {
  const dir = join(SONG_DIR, "game");
  if (!existsSync(dir)) throw new Error(`no game at aigc/${WORK}/game/`);
  prepare();
  const a = JSON.parse(readFileSync(ANALYSIS, "utf8"));
  const round = (x) => Math.round(x * 1000) / 1000;
  const out = {
    fps: a.fps,
    duration: a.duration,
    tempo: a.tempo,
    beats: a.beats.map(round),
    onsets: a.onsets.map(([ot, s]) => [round(ot), round(s)]),
    cues: a.cues.map((c) => ({ start: c.start, end: c.end, text: c.text, words: c.words?.map((w) => ({ text: w.text, start: w.start, end: w.end })) })),
  };
  const file = join(dir, "analysis.json");
  writeFileSync(file, JSON.stringify(out) + "\n");
  console.log(`${file}  ${(statSync(file).size / 1024).toFixed(0)} KiB`);
}

switch (command) {
  case "prepare":
    prepare();
    break;
  case "snap":
    if (rest.length < 2) throw new Error("usage: snap <name> <seconds...>");
    await snap(rest[0], rest.slice(1));
    break;
  case "preview":
    await preview();
    break;
  case "game-data":
    gameData();
    break;
  case "render":
    await render();
    break;
  case "encode":
    await encode();
    break;
  case "inspect":
    await inspect();
    break;
  case "clearance":
    await clearance();
    break;
  case "subtitles":
    prepare();
    await writeSubtitles();
    break;
  default:
    console.error("usage: mvg-video --work songs/<category>/<album>/<lang>/<id> prepare|snap|preview|game-data|render|encode|inspect|clearance|subtitles");
    process.exit(64);
}
