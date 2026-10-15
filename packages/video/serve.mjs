import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const VIDEO = fileURLToPath(new URL(".", import.meta.url));
const CORE = fileURLToPath(new URL("../", import.meta.resolve("@gizclaw/mvg-core/timing.js")));
const THREE = fileURLToPath(new URL("../", import.meta.resolve("three")));
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".ogg": "audio/ogg",
  ".srt": "text/plain; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

/** Serve installed renderer dependencies, project choreography and explicitly mapped media. */
export function startServer(media, port = 0, project = process.cwd()) {
  const routes = [
    ["packages/core/", CORE],
    ["packages/video/page/", join(VIDEO, "page")],
    ["aigc/", join(resolve(project), "aigc")],
    ["node_modules/three/", THREE],
  ];
  const server = createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    const rel = normalize(decodeURIComponent(url.pathname)).replace(/^[/\\]+/, "") || "index.html";
    let file;
    if (rel.startsWith("media/")) {
      file = media[rel.slice("media/".length)];
      if (!file) return void res.writeHead(404).end();
    } else {
      const route = routes.find(([prefix]) => rel.startsWith(prefix));
      if (!route) return void res.writeHead(404).end();
      file = join(route[1], rel.slice(route[0].length));
    }
    let size;
    try {
      size = statSync(file).size;
    } catch {
      return void res.writeHead(404).end();
    }
    const headers = { "Content-Type": TYPES[extname(file)] || "application/octet-stream", "Accept-Ranges": "bytes" };
    const range = req.headers.range?.match(/bytes=(\d*)-(\d*)/);
    if (range) {
      const start = range[1] ? Number(range[1]) : 0;
      const end = range[2] ? Number(range[2]) : size - 1;
      res.writeHead(206, { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": end - start + 1 });
      createReadStream(file, { start, end }).pipe(res);
      return;
    }
    res.writeHead(200, { ...headers, "Content-Length": size });
    createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}
