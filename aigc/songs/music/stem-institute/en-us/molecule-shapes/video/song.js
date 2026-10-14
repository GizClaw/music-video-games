import { IntroScene, deriveIntro } from "@gizclaw/mvg-core/intro.js";
import { CPK } from "./molecules.js";
import { SECTIONS } from "./constants.js";
import { DiscoScene } from "./disco.js";

export function createSong(ctx) {
  const { timing } = ctx;
  timing.setDownbeat(SECTIONS.drop);
  ctx.hud.wordColors = { carbon: CPK.O, dioxide: CPK.O, water: "#3de8ff", hydrogen: "#ffffff", boron: CPK.B, trifluoride: CPK.F, methane: "#ffd23f", linear: "#ff3344", bent: "#3de8ff", trigonal: "#5dff7a", planar: "#5dff7a", tetrahedral: "#ffd23f", tetra: "#ffd23f", shape: "#ff4fd8", lone: "#b07cff", pairs: "#b07cff" };
  const intro = deriveIntro(timing, {
    drop: SECTIONS.drop,
    end: SECTIONS.end,
    endTitle: "SHAPE UP, MOLECULE!",
    endKicker: "STEM INSTITUTE  ·  No. 3",
    endFooter: "180°  ·  104.5°  ·  120°  ·  109.5°",
  });
  const scenes = { intro: new IntroScene(ctx, intro), disco: new DiscoScene(ctx) };
  const order = ["verse1", "chorus1", "verse2", "chorus2", "verse3", "chorus3", "outro"];
  function pick(t) {
    if (t < SECTIONS.verse1) return ["intro", "intro"];
    if (t >= SECTIONS.end) return ["intro", "end"];
    let section = "verse1";
    for (const s of order) if (t >= SECTIONS[s]) section = s;
    return ["disco", section];
  }
  return { scenes, pick, intro };
}
