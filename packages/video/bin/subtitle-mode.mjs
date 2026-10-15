import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { formatSrt, parseSrt } from "../page/captions.js";

export const SUBTITLE_MODES = ["embed", "external", "none"];

export function saveMasterMode(master, mode) {
  const { size, mtimeMs } = statSync(master);
  writeFileSync(join(dirname(master), "master.json"), JSON.stringify({ version: 1, subtitles: mode, size, mtimeMs }) + "\n");
}

export function readMasterMode(master) {
  const file = join(dirname(master), "master.json");
  if (!existsSync(file)) return "embed";
  const info = JSON.parse(readFileSync(file, "utf8"));
  const { size, mtimeMs } = statSync(master);
  if (info.version !== 1 || !SUBTITLE_MODES.includes(info.subtitles) || info.size !== size || info.mtimeMs !== mtimeMs) {
    throw new Error("Master subtitle metadata is invalid or stale; run render again before encode");
  }
  return info.subtitles;
}

/** Return the preserved source path if a former external sidecar was archived. */
export function writeSubtitleOutput(video, source, mode, build, from = 0, to = Infinity) {
  const target = video.replace(/\.(mp4|webm)$/, ".zh-CN.srt");
  if (mode === "external") {
    if (!source) throw new Error("External subtitles require a Chinese SRT or JSON translation track");
    const text = formatSrt(parseSrt(readFileSync(source, "utf8")), from, to);
    writeFileSync(target, text);
    return source;
  }
  if (!existsSync(target)) return source;
  // Keep edited text when a new render switches from an external to a burned-in
  // or subtitle-free video, and prevent players from auto-loading it twice.
  const archive = target === source ? join(build, "subtitles.zh-CN.srt") : join(build, "subtitles", basename(target));
  mkdirSync(dirname(archive), { recursive: true });
  copyFileSync(target, archive);
  rmSync(target);
  return target === source ? archive : source;
}
