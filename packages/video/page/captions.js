/** SubRip helpers shared by the renderer and full-song / trimmed preview exports. */
export function parseSrt(source) {
  if (!source.trim()) return [];
  return source.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").trim().split(/\n\s*\n/).map((block) => {
    const lines = block.split("\n");
    const i = lines.findIndex((line) => line.includes("-->"));
    const match = lines[i]?.match(/^(\d+):(\d{2}):(\d{2})[,.](\d{3})\s+-->\s+(\d+):(\d{2}):(\d{2})[,.](\d{3})\s*$/);
    const time = (offset) => (+match[offset] * 3600 + +match[offset + 1] * 60 + +match[offset + 2]) + +match[offset + 3] / 1000;
    const text = lines.slice(i + 1).join("\n").trim();
    if (!match || !text) throw new Error(`Invalid SRT cue: ${block}`);
    const start = time(1);
    const end = time(5);
    if (end <= start) throw new Error(`Invalid SRT interval: ${lines[i]}`);
    return { start, end, text };
  });
}

export function formatSrt(cues, from = 0, to = Infinity) {
  const stamp = (seconds) => {
    const ms = Math.round(seconds * 1000);
    const pad = (n, width = 2) => String(n).padStart(width, "0");
    return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
  };
  return cues.filter((cue) => cue.end > from && cue.start < to).map((cue, i) =>
    `${i + 1}\n${stamp(Math.max(from, cue.start) - from)} --> ${stamp(Math.min(to, cue.end) - from)}\n${cue.text}\n`,
  ).join("\n");
}
