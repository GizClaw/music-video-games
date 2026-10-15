// Write site/universe.json from the mounted AIGC catalog: every song album is
// a galaxy and every song with audio a planet, named from the album's i18n
// files (zh-CN, en-US). Run again after the catalog gains albums or songs.
//
//   node scripts/universe-catalog.mjs [--catalog <dir>] [--verify]
//
// --catalog defaults to the catalog root the video CLI reads from; --verify
// checks every song's audio on the CDN.
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const CDN = "https://static-volc.gizclaw.com/aigc/v1";
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const catalog = option("--catalog", "/Volumes/H002-R02T-APFS/GizClaw/catalogs/aigc");
/** Galaxies that lead the carousel; the rest follow in catalog order. */
const FIRST = ["stem-institute"];

const dirs = (p) => readdirSync(p).filter((n) => !n.startsWith(".") && statSync(join(p, n)).isDirectory());
const titleCase = (id) => id.replace(/-en$/, "").split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
const readJson = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null);

const series = [];
const songs = join(catalog, "songs");
for (const category of dirs(songs)) {
  for (const album of dirs(join(songs, category))) {
    const base = join(songs, category, album);
    const zh = readJson(join(base, "i18n", "zh-CN.json"));
    const en = readJson(join(base, "i18n", "en-US.json"));
    const works = [];
    for (const lang of dirs(base).filter((d) => d !== "i18n")) {
      for (const file of readdirSync(join(base, lang)).filter((f) => f.endsWith(".ogg")).sort()) {
        const id = file.slice(0, -4);
        const key = `${lang}/${id}`;
        const fallback = titleCase(id);
        works.push({
          id,
          work: `songs/${category}/${album}/${lang}/${id}`,
          lang,
          title: { zh: zh?.works?.[key]?.title ?? en?.works?.[key]?.title ?? fallback, en: en?.works?.[key]?.title ?? zh?.works?.[key]?.title ?? fallback },
        });
      }
    }
    if (!works.length) continue;
    const enName = en?.album?.title ?? titleCase(album);
    series.push({ id: album, category, name: { zh: zh?.album?.title ?? enName, en: enName }, works });
  }
}

// An English edition of a Chinese album sits right after it and borrows its Chinese name.
for (const s of series) {
  const pair = s.id.endsWith("-en") && series.find((o) => o.id === s.id.slice(0, -3));
  if (pair) s.name.zh = `${pair.name.zh} · 英文版`;
}
const rank = (s) => {
  const i = FIRST.indexOf(s.id);
  return i >= 0 ? i : FIRST.length;
};
series.sort((a, b) => rank(a) - rank(b) || a.id.replace(/-en$/, "").localeCompare(b.id.replace(/-en$/, "")) || a.id.length - b.id.length);

if (flag("--verify")) {
  const missing = [];
  await Promise.all(
    series.flatMap((s) => s.works).map(async (w) => {
      const res = await fetch(`${CDN}/${w.work}.ogg`, { method: "HEAD" });
      if (!res.ok) missing.push(`${w.work} (${res.status})`);
    }),
  );
  if (missing.length) {
    console.error(`audio missing on the CDN:\n${missing.join("\n")}`);
    process.exit(1);
  }
}

const out = join(ROOT, "site", "universe.json");
writeFileSync(out, `${JSON.stringify({ series }, null, 2)}\n`);
console.log(`${series.length} galaxies, ${series.reduce((n, s) => n + s.works.length, 0)} planets -> ${out}`);
