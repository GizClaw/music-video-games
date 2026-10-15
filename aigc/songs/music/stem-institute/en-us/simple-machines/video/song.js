import { IntroScene, deriveIntro } from "@gizclaw/mvg-core/intro.js";
import { FactoryScene } from "./factory.js";
import { MACHINES, ORDER, RETIME, SECTIONS, SUNG_CUES } from "./constants.js";

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
  timing.cues.length = SUNG_CUES;
  timing.setDownbeat(SECTIONS.drop);
  ctx.hud.wordColors = {
    ...Object.fromEntries(MACHINES.map((m) => [m.word, m.color])),
    axle: MACHINES[2].color,
    plane: MACHINES[3].color,
    planes: MACHINES[3].color,
    fulcrum: MACHINES[0].color,
    force: "#ffffff",
    six: "#ffd23f",
    hey: "#ffd23f",
  };
  const intro = deriveIntro(timing, {
    drop: SECTIONS.drop,
    end: SECTIONS.end,
    endTitle: "SIX MACHINES AT WORK",
    endKicker: "STEM INSTITUTE  ·  No. 18",
    endFooter: "lever · pulley · wheel & axle · plane · wedge · screw",
  });
  const scenes = { intro: new IntroScene(ctx, intro), factory: new FactoryScene(ctx) };
  function pick(t) {
    if (t < SECTIONS.verse1) return ["intro", "intro"];
    if (t >= SECTIONS.end) return ["intro", "end"];
    let section = ORDER[0];
    for (const s of ORDER) if (t >= SECTIONS[s]) section = s;
    return ["factory", section];
  }
  return { scenes, pick, intro };
}
