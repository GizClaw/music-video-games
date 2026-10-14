import { IntroScene } from "@gizclaw/mvg-core/intro.js";
import { SECTIONS } from "./constants.js";
import { WORD_COLORS } from "./hud.js";
import { TunnelScene } from "./tunnel.js";
import { ChorusScene } from "./chorus.js";
import { BreakScene } from "./break.js";
import { OceanScene } from "./ocean.js";
import { BridgeScene } from "./bridge.js";

// Hand-placed on this song's intro: the vocal enters before the drop, with a
// short hush and pickup hit in between.
const INTRO = {
  split: [2.2059, 2.6935, 3.1695, 3.6571, 4.1215, 4.5743, 5.0503],
  glyph: [5.9907, 6.4551, 6.9312, 7.4072, 7.86, 8.3244, 8.7771],
  ignite: 8.7771,
  presents: 9.2764,
  hush: 11.62,
  pickup: 11.7957,
  build: 11.989,
  drop: SECTIONS.drop,
  end: SECTIONS.end,
  endTitle: "SLIDE DOWN THE SPECTRUM",
  endKicker: "STEM INSTITUTE  ·  No. 15",
  endFooter: "Radio  →  Gamma",
};

export function createSong(ctx) {
  ctx.hud.wordColors = WORD_COLORS;
  ctx.timing.setDownbeat(SECTIONS.drop);
  const scenes = {
    intro: new IntroScene(ctx, INTRO),
    tunnel: new TunnelScene(ctx),
    chorus: new ChorusScene(ctx),
    break: new BreakScene(ctx),
    ocean: new OceanScene(ctx),
    bridge: new BridgeScene(ctx),
  };
  function pick(t) {
    if (t < SECTIONS.verse1) return ["intro", "intro"];
    if (t < SECTIONS.chorus1) return ["tunnel", "verse1"];
    if (t < SECTIONS.break) return ["chorus", "chorus1"];
    if (t < SECTIONS.verse2) return ["break", "break"];
    if (t < SECTIONS.chorus2) return ["ocean", "verse2"];
    if (t < SECTIONS.bridge) return ["chorus", "chorus2"];
    if (t < SECTIONS.outro) return ["bridge", "bridge"];
    if (t < SECTIONS.end) return ["tunnel", "outro"];
    return ["intro", "end"];
  }
  return { scenes, pick, intro: INTRO };
}
