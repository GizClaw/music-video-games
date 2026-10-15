import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");

export default defineConfig({
  root: join(ROOT, "site"),
  base: process.env.MVG_BASE || "/",
  server: { port: 5179, fs: { allow: [ROOT] } },
  build: {
    outDir: join(ROOT, "dist"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 800,
    rolldownOptions: { input: { index: join(ROOT, "site/index.html") } },
  },
});
