// Write packages/games/src/universe/universe.json from the mounted AIGC catalog: every song album
// with English songs is a galaxy and every English song with audio a planet,
// named from the album's i18n files (zh-CN, en-US). Chinese-language songs
// are left out. Run again after the catalog gains albums or songs.
//
//   node scripts/universe-catalog.mjs [--catalog <dir>] [--verify]
//
// --catalog defaults to MVG_CATALOG or <GIZCLAW_ROOT>/catalogs/aigc, configured
// through the environment or the project's .env.local; --verify checks audio on the CDN.
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readLocalConfig } from "../packages/video/bin/local-config.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const CDN = "https://static-volc.gizclaw.com/aigc/v1";
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const local = readLocalConfig(ROOT);
const mediaRoot = process.env.GIZCLAW_ROOT || local.GIZCLAW_ROOT;
const catalog = option("--catalog", process.env.MVG_CATALOG || local.MVG_CATALOG || (mediaRoot && join(mediaRoot, "catalogs/aigc")));
if (!catalog) {
  console.error("--catalog <directory>, MVG_CATALOG or GIZCLAW_ROOT (environment or .env.local) is required");
  process.exit(64);
}
/** Galaxies that lead the carousel; the rest follow in catalog order. */
const FIRST = ["stem-institute"];

const dirs = (p) => readdirSync(p).filter((n) => !n.startsWith(".") && statSync(join(p, n)).isDirectory());
const titleCase = (id) => id.replace(/-en$/, "").split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
const readJson = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null);

const series = [];
/** Chinese album titles, so an English edition can borrow its Chinese album's name. */
const zhTitles = {};
const songs = join(catalog, "songs");
for (const category of dirs(songs)) {
  for (const album of dirs(join(songs, category))) {
    const base = join(songs, category, album);
    const zh = readJson(join(base, "i18n", "zh-CN.json"));
    const en = readJson(join(base, "i18n", "en-US.json"));
    if (zh?.album?.title) zhTitles[album] = zh.album.title;
    const works = [];
    for (const lang of dirs(base).filter((d) => d.startsWith("en-"))) {
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

// An English edition of a Chinese album takes the Chinese album's name.
for (const s of series) {
  const zhTitle = s.id.endsWith("-en") && zhTitles[s.id.slice(0, -3)];
  if (zhTitle) s.name.zh = zhTitle;
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

const out = join(ROOT, "packages", "games", "src", "universe", "universe.json");
writeFileSync(out, `${JSON.stringify({ series }, null, 2)}\n`);
console.log(`${series.length} galaxies, ${series.reduce((n, s) => n + s.works.length, 0)} planets -> ${out}`);
