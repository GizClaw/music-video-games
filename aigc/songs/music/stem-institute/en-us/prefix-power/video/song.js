import { IntroScene, deriveIntro } from "@gizclaw/mvg-core/intro.js";
import { PREFIXES, SECTIONS, hueOf } from "./constants.js";
import { ZoomScene } from "./zoom.js";

export function createSong(ctx) {
  const { timing } = ctx;
  timing.setDownbeat(SECTIONS.drop);
  const colors = Object.fromEntries(PREFIXES.map((p) => [p.id, `hsl(${Math.round(hueOf(p.exp) * 360)}, 100%, 62%)`]));
  ctx.hud.wordColors = { ...colors, drop: "#ff4fd8", small: "#3de8ff", tall: "#ff4fd8", stop: "#ff3d5a", prefix: "#ffd23f", power: "#ffd23f" };
  const intro = deriveIntro(timing, {
    drop: SECTIONS.drop,
    end: SECTIONS.end,
    endTitle: "PREFIX POWER",
    endKicker: "STEM INSTITUTE  ·  No. 14",
    endFooter: "nano  →  tera",
  });
  const scenes = { intro: new IntroScene(ctx, intro), zoom: new ZoomScene(ctx) };
  const order = ["verse1", "chorus1", "verse2", "chorus2", "bridge", "chorus3", "outro"];
  function pick(t) {
    if (t < SECTIONS.verse1) return ["intro", "intro"];
    if (t >= SECTIONS.end) return ["intro", "end"];
    let section = "verse1";
    for (const s of order) if (t >= SECTIONS[s]) section = s;
    return ["zoom", section];
  }
  return { scenes, pick, intro };
}
