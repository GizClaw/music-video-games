import { IntroScene, deriveIntro } from "@gizclaw/mvg-core/intro.js";
import { NES } from "./voxel.js";
import { SECTIONS } from "./constants.js";
import { CounterScene } from "./counter.js";
import { ArcadeScene } from "./arcade.js";

export function createSong(ctx) {
  const { timing } = ctx;
  timing.setDownbeat(SECTIONS.drop);
  ctx.hud.wordColors = { one: NES.yellow, zero: NES.blue, bit: NES.pink, beep: NES.green, boogie: NES.orange, binary: NES.orange, eight: NES.red, four: NES.orange, two: NES.green, double: NES.pink };
  const intro = deriveIntro(timing, {
    drop: SECTIONS.drop,
    end: SECTIONS.end,
    endTitle: "BINARY BOOGIE",
    endKicker: "STEM INSTITUTE  ·  No. 23",
    endFooter: "0000  →  1111",
  });
  const scenes = {
    intro: new IntroScene(ctx, intro),
    counter: new CounterScene(ctx),
    arcade: new ArcadeScene(ctx),
  };
  function pick(t) {
    if (t < SECTIONS.verse1) return ["intro", "intro"];
    if (t < SECTIONS.chorus1) return ["counter", "verse1"];
    if (t < SECTIONS.verse2) return ["arcade", "chorus1"];
    if (t < SECTIONS.chorus2) return ["counter", "verse2"];
    if (t < SECTIONS.bridge) return ["arcade", "chorus2"];
    if (t < SECTIONS.chorus3) return ["counter", "bridge"];
    if (t < SECTIONS.outro) return ["arcade", "chorus3"];
    if (t < SECTIONS.end) return ["counter", "outro"];
    return ["intro", "end"];
  }
  return { scenes, pick, intro };
}
