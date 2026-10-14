import { IntroScene, deriveIntro } from "@gizclaw/mvg-core/intro.js";
import { BoardScene } from "./board.js";
import { GOLD, ORDER, SECTIONS } from "./constants.js";

export function createSong(ctx) {
  const { timing } = ctx;
  timing.setDownbeat(SECTIONS.drop);
  ctx.hud.wordColors = { prime: GOLD, primes: GOLD, composite: "#ff8a3d", factors: "#7fe8ff", factor: "#7fe8ff", itself: GOLD, one: "#7fe8ff" };
  const intro = deriveIntro(timing, {
    drop: SECTIONS.drop,
    end: SECTIONS.end,
    endTitle: "PRIME TIME",
    endKicker: "STEM INSTITUTE  ·  No. 8",
    endFooter: "2 · 3 · 5 · 7 · … · 97",
  });
  const scenes = { intro: new IntroScene(ctx, intro), board: new BoardScene(ctx) };
  function pick(t) {
    if (t < SECTIONS.rules) return ["intro", "intro"];
    if (t >= SECTIONS.end) return ["intro", "end"];
    let section = ORDER[0];
    for (const s of ORDER) if (t >= SECTIONS[s]) section = s;
    return ["board", section];
  }
  return { scenes, pick, intro };
}
