import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");

/** Every aigc/<work>/game/index.html becomes a page at the same path on the site. */
function gamePages(dir = join(ROOT, "aigc"), out = {}) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (!statSync(p).isDirectory()) continue;
    if (name === "game") {
      if (existsSync(join(p, "index.html"))) out[relative(join(ROOT, "aigc"), dir)] = join(p, "index.html");
      continue;
    }
    gamePages(p, out);
  }
  return out;
}

export default defineConfig({
  root: ROOT,
  base: process.env.MVG_BASE || "/",
  server: { port: 5179, fs: { allow: [ROOT] } },
  build: {
    outDir: join(ROOT, "dist"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 800,
    rolldownOptions: { input: { index: join(ROOT, "index.html"), ...gamePages() } },
  },
});
