// Exercise the installed tarballs outside the monorepo: workspace symlinks must
// not hide missing files, unresolved dependencies or renderer path assumptions.
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { packRelease, verifyRelease } from "./package-release.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const temporary = mkdtempSync(join(tmpdir(), "mvg-consumer-"));
const consumer = join(temporary, "consumer");
const project = join(temporary, "choreography");
const media = join(temporary, "media");
const npxConsumer = join(temporary, "npx-consumer");
const work = "songs/music/test/en-us/smoke";
let preview;
try {
  const directory = process.argv[2] ? resolve(process.argv[2]) : join(temporary, "release");
  const index = process.argv[2] ? verifyRelease(directory) : packRelease(directory);
  mkdirSync(consumer);
  mkdirSync(media);
  mkdirSync(join(project, "aigc", work, "video"), { recursive: true });
  writeFileSync(join(project, "aigc", work, "video/song.js"), "export const packageSmoke = true;\n");
  writeFileSync(join(consumer, "package.json"), JSON.stringify({ name: "mvg-package-smoke", private: true, type: "module" }));
  execFileSync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", ...index.packages.map((pkg) => join(directory, pkg.tarball))], {
    cwd: consumer, encoding: "utf8", env: { ...process.env, PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "1" },
  });
  for (const pkg of index.packages) {
    const installed = JSON.parse(readFileSync(join(consumer, "node_modules", pkg.name, "package.json"), "utf8"));
    assert.equal(installed.name, pkg.name);
    assert.equal(installed.version, pkg.version);
  }

  writeFileSync(join(consumer, "index.html"), '<div id="game"></div><script type="module" src="/main.js"></script>');
  writeFileSync(join(consumer, "main.js"), `
    import { mountSpectrumSlide, mountUniverse, SERIES, songAudioUrl } from "@gizclaw/mvg-games";
    import { Timing } from "@gizclaw/mvg-core/timing.js";
    import { deriveIntro } from "@gizclaw/mvg-core/intro.js";
    import logo from "@gizclaw/mvg-core/assets/haivivi-wordmark.svg?raw";
    window.packageSmoke = { Timing, deriveIntro, logo, songAudioUrl, mountUniverse, SERIES };
    mountSpectrumSlide("#game");
  `);
  // The complete entry must build from the installed SDK alone, including
  // its default catalog, styles, core logo and all lazy game loaders.
  writeFileSync(join(consumer, "universe.html"), '<div id="universe" style="height: 100vh"></div><script type="module" src="/universe.js"></script>');
  writeFileSync(join(consumer, "universe.js"), `
    import { mountUniverse, SERIES } from "@gizclaw/mvg-games/universe.js";
    window.catalog = SERIES;
    window.universe = mountUniverse("#universe", { routing: false });
  `);
  writeFileSync(join(consumer, "vite.config.js"), `export default {
    build: { rolldownOptions: { input: { game: "index.html", universe: "universe.html" } } }
  };\n`);
  execFileSync(process.execPath, [join(ROOT, "node_modules/vite/bin/vite.js"), "build", consumer], { cwd: consumer, encoding: "utf8" });
  assert(readFileSync(join(consumer, "dist/index.html"), "utf8").includes("/assets/"));
  assert(readFileSync(join(consumer, "dist/universe.html"), "utf8").includes("/assets/"));
  const games = join(consumer, "node_modules/@gizclaw/mvg-games/src");
  const catalog = JSON.parse(readFileSync(join(games, "universe/universe.json"), "utf8"));
  assert(catalog.series.length > 0);
  for (const id of ["spectrum-slide", "planet-parade", "binary-boogie", "prime-time", "penguin-steps", "states-of-matter", "polygon-party", "frog-hop-stop", "angle-gang"]) {
    assert(catalog.series.some((s) => s.works.some((w) => w.id === id)), `Packaged universe is missing ${id}`);
    assert(existsSync(join(games, `${id}.js`)), `Packaged universe cannot load ${id}`);
  }

  const cli = join(consumer, "node_modules/@gizclaw/mvg-video/bin/mvg-video.mjs");
  const videoVersion = index.packages.find((pkg) => pkg.name === "@gizclaw/mvg-video").version;
  assert.equal(execFileSync(process.execPath, [cli, "--version"], { cwd: consumer, encoding: "utf8" }).trim(), videoVersion);
  assert.match(execFileSync(process.execPath, [cli, "--help"], { cwd: consumer, encoding: "utf8" }), /--project/);
  assert.match(execFileSync(process.execPath, [cli, "--help"], { cwd: consumer, encoding: "utf8" }), /--subtitles embed\|external\|none/);

  // npx must fetch the release archives into its own cache, without an install
  // step, package.json or node_modules in the caller's directory.
  mkdirSync(npxConsumer);
  const npxPackages = ["@gizclaw/mvg-core", "@gizclaw/mvg-video"].map((name) => {
    const pkg = index.packages.find((pkg) => pkg.name === name);
    return `--package=${join(directory, pkg.tarball)}`;
  });
  const npxVersion = execFileSync("npx", ["--yes", ...npxPackages, "mvg-video", "--version"], {
    cwd: npxConsumer, encoding: "utf8", timeout: 120000,
    env: { ...process.env, npm_config_cache: join(temporary, "npx-cache"), npm_config_ignore_scripts: "true", PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "1" },
  }).trim();
  assert.equal(npxVersion, videoVersion);
  for (const file of ["package.json", "package-lock.json", "node_modules"]) assert(!existsSync(join(npxConsumer, file)), `npx wrote ${file} into the caller's directory`);
  for (const file of ["analyze.py", "align_vocals.py", "requirements.txt", "requirements-align.txt"]) {
    assert(readFileSync(join(consumer, "node_modules/@gizclaw/mvg-video/python", file)).length > 0);
  }
  preview = spawn(process.execPath, [cli, "--project", project, "--root", media, "--work", work, "--port", "0", "preview"], { cwd: consumer, stdio: ["ignore", "pipe", "pipe"] });
  const base = await new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => reject(new Error(`Installed video preview timed out: ${output}`)), 15000);
    preview.stdout.on("data", (chunk) => {
      output += chunk;
      const match = output.match(/preview: (http:\/\/127\.0\.0\.1:\d+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
    preview.stderr.on("data", (chunk) => { output += chunk; });
    preview.on("error", (error) => { clearTimeout(timer); reject(error); });
    preview.on("exit", (code) => { clearTimeout(timer); reject(new Error(`Installed video preview exited ${code}: ${output}`)); });
  });
  for (const [path, pattern] of [
    ["/packages/video/page/index.html", /type="importmap"/],
    ["/packages/video/page/main.js", /__video/],
    ["/packages/video/page/subtitles.js", /class StaticSubtitles/],
    ["/packages/video/page/captions.js", /function parseSrt/],
    ["/packages/core/src/timing.js", /class Timing/],
    ["/packages/core/assets/haivivi-wordmark.svg", /<svg/],
    ["/node_modules/three/build/three.module.js", /WebGLRenderer/],
    ["/node_modules/three/examples/jsm/postprocessing/EffectComposer.js", /class EffectComposer/],
    [`/aigc/${work}/video/song.js`, /packageSmoke/],
  ]) {
    const response = await fetch(`${base}${path}`);
    assert.equal(response.status, 200, `Installed renderer cannot serve ${path}`);
    assert.match(await response.text(), pattern);
  }
  assert.equal((await fetch(`${base}/package.json`)).status, 404);
  console.log(`Verified ${index.packages.length} npm tarballs: game and universe builds, packaged catalog, core assets, video CLI, renderer routes and npx without a project install`);
} finally {
  if (preview) {
    const closed = new Promise((resolve) => preview.once("close", resolve));
    preview.kill();
    if (preview.exitCode === null) await closed;
  }
  rmSync(temporary, { recursive: true, force: true });
}
