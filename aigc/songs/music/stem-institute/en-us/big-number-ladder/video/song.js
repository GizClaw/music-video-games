import { IntroScene, deriveIntro } from "@gizclaw/mvg-core/intro.js";
import { LadderScene } from "./ladder.js";
import { GOLD, HUES, NAMES, ORDER, RETIME, SECTIONS } from "./constants.js";

function retime(timing, fixes) {
  for (const [index, starts] of Object.entries(fixes)) {
    const cue = timing.cues[index];
    cue.words.forEach((w, k) => {
      w.start = starts[k];
      w.end = starts[k + 1] ?? starts[k] + 0.4;
    });
    cue.start = starts[0];
    cue.end = Math.max(cue.words.at(-1).end, starts.at(-1) + 0.5);
  }
}

export function createSong(ctx) {
  const { timing } = ctx;
  retime(timing, RETIME);
  timing.setDownbeat(SECTIONS.drop);
  ctx.hud.wordColors = {
    ...Object.fromEntries(NAMES.slice(1).map((n, k) => [n.toLowerCase(), HUES[k + 1]])),
    googol: GOLD,
    climb: GOLD,
    zeroes: "#9fe8ff",
  };
  const intro = deriveIntro(timing, {
    drop: SECTIONS.drop,
    end: SECTIONS.end,
    endTitle: "BIG NUMBER LADDER",
    endKicker: "STEM INSTITUTE  ·  No. 10",
    endFooter: "10³  ·  10⁶  ·  10⁹  ·  …  ·  10¹⁰⁰",
  });
  const scenes = { intro: new IntroScene(ctx, intro), ladder: new LadderScene(ctx) };
  function pick(t) {
    if (t < SECTIONS.verse1) return ["intro", "intro"];
    if (t >= SECTIONS.end) return ["intro", "end"];
    let section = ORDER[0];
    for (const s of ORDER) if (t >= SECTIONS[s]) section = s;
    return ["ladder", section];
  }
  return { scenes, pick, intro };
}
