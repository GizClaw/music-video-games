import { IntroScene, deriveIntro } from "@gizclaw/mvg-core/intro.js";
import { BallroomScene } from "./ballroom.js";
import { COLORS, ORDER, RETIME, SECTIONS } from "./constants.js";

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
  ctx.hud.wordColors = { ...COLORS, center: "#ffd98a", radii: COLORS.radius, pi: "#ffd98a", squared: COLORS.area };
  const intro = deriveIntro(timing, {
    drop: SECTIONS.drop,
    end: SECTIONS.end,
    endTitle: "ROUND THE CIRCLE",
    endKicker: "STEM INSTITUTE  ·  No. 7",
    endFooter: "d = 2r  ·  C = 2πr  ·  A = πr²",
  });
  const scenes = { intro: new IntroScene(ctx, intro), ballroom: new BallroomScene(ctx) };
  function pick(t) {
    if (t < SECTIONS.verse1) return ["intro", "intro"];
    if (t >= SECTIONS.end) return ["intro", "end"];
    let section = ORDER[0];
    for (const s of ORDER) if (t >= SECTIONS[s]) section = s;
    return ["ballroom", section];
  }
  return { scenes, pick, intro };
}
