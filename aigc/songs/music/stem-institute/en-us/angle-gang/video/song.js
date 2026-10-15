import { IntroScene, deriveIntro } from "@gizclaw/mvg-core/intro.js";
import { DuskScene } from "./dusk.js";
import { KIND, ORDER, RETIME, SECTIONS } from "./constants.js";

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
    acute: KIND.acute.color,
    right: KIND.right.color,
    ninety: KIND.right.color,
    obtuse: KIND.obtuse.color,
    straight: KIND.straight.color,
    eighty: KIND.straight.color,
    full: KIND.full.color,
    sixty: KIND.full.color,
    seventy: KIND.reflex.color,
    "three-quarter": KIND.reflex.color,
    zero: KIND.zero.color,
    degrees: "#ffd27a",
    angle: "#ffd27a",
  };
  const intro = deriveIntro(timing, {
    drop: SECTIONS.drop,
    end: SECTIONS.end,
    endTitle: "THE ANGLE GANG",
    endKicker: "STEM INSTITUTE  ·  No. 11",
    endFooter: "0°  ·  90°  ·  180°  ·  360°",
  });
  const scenes = { intro: new IntroScene(ctx, intro), dusk: new DuskScene(ctx) };
  function pick(t) {
    if (t < SECTIONS.verse1) return ["intro", "intro"];
    if (t >= SECTIONS.end) return ["intro", "end"];
    let section = ORDER[0];
    for (const s of ORDER) if (t >= SECTIONS[s]) section = s;
    return ["dusk", section];
  }
  return { scenes, pick, intro };
}
