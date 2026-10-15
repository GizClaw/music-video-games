// Structural check: every song directory mirrors an AIGC catalog work path and
// carries a video choreography; a game directory carries its beat data.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const WORK = /^songs\/[a-z0-9-]+\/[a-z0-9-]+\/[a-z-]+\/[a-z0-9-]+$/;
const errors = [];
const sources = [];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === "node_modules" || name === "dist" || name.startsWith(".")) continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const aigc = join(ROOT, "aigc");
const works = new Set();
for (const file of walk(aigc)) {
  const rel = relative(aigc, file);
  const m = rel.match(/^(.*?)\/(video|game)\//);
  if (!m) {
    errors.push(`${rel}: songs live at aigc/<work>/video/ or aigc/<work>/game/`);
    continue;
  }
  if (!WORK.test(m[1])) errors.push(`${rel}: ${m[1]} is not songs/<category>/<album>/<lang>/<id>`);
  works.add(m[1]);
  if (/\.(m?js)$/.test(file)) sources.push(file);
}
for (const work of works) {
  if (!existsSync(join(aigc, work, "video", "song.js"))) errors.push(`aigc/${work}: missing video/song.js`);
  const game = join(aigc, work, "game");
  if (existsSync(game) && !existsSync(join(game, "analysis.json"))) errors.push(`aigc/${work}/game: missing analysis.json`);
}
for (const pkg of ["core", "video", "games"]) sources.push(...walk(join(ROOT, "packages", pkg)).filter((f) => /\.(m?js)$/.test(f)));
sources.push(...walk(join(ROOT, "site")).filter((f) => /\.(m?js)$/.test(f)));
for (const f of sources) {
  try {
    execFileSync(process.execPath, ["--check", f], { stdio: "pipe" });
  } catch (e) {
    errors.push(`${relative(ROOT, f)}: ${e.stderr.toString().trim().split("\n")[0]}`);
  }
}
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`${works.size} songs, ${sources.length} modules ok`);
await import("./check-subtitles.mjs");
