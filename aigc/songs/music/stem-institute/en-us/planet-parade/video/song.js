import { IntroScene, deriveIntro } from "@gizclaw/mvg-core/intro.js";
import { PLANETS, SECTIONS } from "./constants.js";
import { SolarScene } from "./solar.js";

export function createSong(ctx) {
  const { timing } = ctx;
  timing.setDownbeat(SECTIONS.drop);
  ctx.hud.wordColors = Object.fromEntries([
    ...PLANETS.map((p) => [p.id, p.color]),
    ["sun", "#ffb347"],
    ["pluto", "#e3d4c2"],
    ["march", "#ffb347"],
    ["eight", "#ffffff"],
  ]);
  const intro = deriveIntro(timing, {
    drop: SECTIONS.drop,
    end: SECTIONS.end,
    endTitle: "PLANET PARADE",
    endKicker: "STEM INSTITUTE  ·  No. 22",
    endFooter: "Mercury  →  Neptune",
  });
  const scenes = { intro: new IntroScene(ctx, intro), solar: new SolarScene(ctx) };
  const order = ["lineup", "verse1", "chorus1", "verse2", "chorus2", "bridge", "finale"];
  function pick(t) {
    if (t < SECTIONS.lineup) return ["intro", "intro"];
    if (t >= SECTIONS.end) return ["intro", "end"];
    let section = "lineup";
    for (const s of order) if (t >= SECTIONS[s]) section = s;
    return ["solar", section];
  }
  return { scenes, pick, intro };
}
