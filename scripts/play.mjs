// Open a game in the universe: npm run play -- <work> [--start S] [--auto] [--port P | --base URL]
// <work> is a song id (binary-boogie) or <series>/<work>; the dev server must be running (npm run dev).
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

const { values: opts, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    start: { type: "string" },
    auto: { type: "boolean", default: false },
    port: { type: "string", default: "5179" },
    base: { type: "string" },
    print: { type: "boolean", default: false },
  },
});
const [id] = positionals;
const { series } = JSON.parse(readFileSync(new URL("../site/universe.json", import.meta.url), "utf8"));
if (!id) {
  console.log("usage: npm run play -- <work> [--start SECONDS] [--auto] [--port 5179 | --base URL] [--print]");
  process.exit(1);
}

const [a, b] = id.split("/").slice(-2);
const hits = series.flatMap((s) => s.works.filter((w) => w.id === (b ?? a) && (!b || s.id === a)).map((w) => ({ s, w })));
if (!hits.length) {
  console.error(`no song called ${id}`);
  process.exit(1);
}
if (hits.length > 1) console.warn(`${id} is in ${hits.map((h) => h.s.id).join(", ")}; opening ${hits[0].s.id}`);

const q = new URLSearchParams();
if (opts.start != null) q.set("start", opts.start);
if (opts.auto) q.set("auto", "");
const query = q.toString().replace(/=(&|$)/g, "$1");
const base = (opts.base ?? `http://localhost:${opts.port}`).replace(/\/$/, "");
const url = `${base}/#/${hits[0].s.id}/${hits[0].w.id}/play${query ? `?${query}` : ""}`;
console.log(url);
if (!opts.print) {
  const [cmd, args] = process.platform === "darwin" ? ["open", [url]] : process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : ["xdg-open", [url]];
  execFile(cmd, args, (err) => err && console.error(`could not open a browser: ${err.message}`));
}
