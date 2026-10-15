import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readMasterMode, saveMasterMode, writeSubtitleOutput } from "../packages/video/bin/subtitle-mode.mjs";
import { formatSrt, parseSrt } from "../packages/video/page/captions.js";

const temporary = mkdtempSync(join(tmpdir(), "mvg-subtitle-modes-"));
try {
  const build = join(temporary, "build");
  mkdirSync(build);
  const video = join(temporary, "song.mp4");
  const sidecar = join(temporary, "song.zh-CN.srt");
  const source = join(build, "subtitles.zh-CN.srt");
  const cues = [{ start: 1, end: 3, text: "第一句" }, { start: 4, end: 6, text: "第二句\n小字" }];
  writeFileSync(source, formatSrt(cues));
  assert.deepEqual(parseSrt(readFileSync(source, "utf8")), cues);
  writeSubtitleOutput(video, source, "external", build, 2, 5);
  assert.deepEqual(parseSrt(readFileSync(sidecar, "utf8")), [
    { start: 0, end: 1, text: "第一句" }, { start: 2, end: 3, text: "第二句\n小字" },
  ]);
  writeSubtitleOutput(video, source, "embed", build);
  assert(!existsSync(sidecar));
  assert(existsSync(join(build, "subtitles", "song.zh-CN.srt")));

  // An edited external track becomes the next input when switching back to
  // embed/none, rather than losing those edits or loading a duplicate track.
  writeFileSync(sidecar, formatSrt([{ start: 0, end: 2, text: "修改后的译文" }]));
  assert.equal(writeSubtitleOutput(video, sidecar, "none", build), source);
  assert(!existsSync(sidecar));
  assert.equal(parseSrt(readFileSync(source, "utf8"))[0].text, "修改后的译文");
  assert.throws(() => writeSubtitleOutput(video, null, "external", build), /require a Chinese/);

  const master = join(build, "master.mp4");
  writeFileSync(master, "fixture");
  for (const mode of ["external", "embed", "none"]) {
    saveMasterMode(master, mode);
    assert.equal(readMasterMode(master), mode);
  }
  writeFileSync(master, "replaced master");
  assert.throws(() => readMasterMode(master), /invalid or stale/);
  console.log("Subtitle modes verified: SRT clipping, edited-track preservation, duplicate prevention and master mode persistence");
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
