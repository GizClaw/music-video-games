import { IntroScene, deriveIntro } from "@gizclaw/mvg-core/intro.js";
import { FORMS, ORDER, SECTIONS } from "./constants.js";
import { MachineScene } from "./machine.js";

export function createSong(ctx) {
  const { timing } = ctx;
  timing.setDownbeat(SECTIONS.drop);
  ctx.hud.wordColors = { ...Object.fromEntries(Object.entries(FORMS).map(([id, f]) => [id, f.color])), energy: "#ffd23f", total: "#ffffff", conservation: "#ffd23f" };
  const intro = deriveIntro(timing, {
    drop: SECTIONS.drop,
    end: SECTIONS.end,
    endTitle: "ENERGY SHAPESHIFTER",
    endKicker: "STEM INSTITUTE  ·  No. 17",
    endFooter: "change the form · keep the total",
  });
  const scenes = { intro: new IntroScene(ctx, intro), machine: new MachineScene(ctx) };
  function pick(t) {
    if (t < SECTIONS.verse1) return ["intro", "intro"];
    if (t >= SECTIONS.end) return ["intro", "end"];
    let section = ORDER[0];
    for (const s of ORDER) if (t >= SECTIONS[s]) section = s;
    return ["machine", section];
  }
  return { scenes, pick, intro };
}
