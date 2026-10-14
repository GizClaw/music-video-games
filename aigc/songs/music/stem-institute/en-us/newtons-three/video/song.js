import { IntroScene, deriveIntro } from "@gizclaw/mvg-core/intro.js";
import { COLORS, ORDER, SECTIONS } from "./constants.js";
import { GraphScene } from "./graph.js";

export function createSong(ctx) {
  const { timing } = ctx;
  timing.setDownbeat(SECTIONS.drop);
  ctx.hud.wordColors = { force: COLORS.force, acceleration: COLORS.accel, mass: "#cfe0ff", inertia: COLORS.a, velocity: COLORS.velocity, pairs: COLORS.b, opposite: COLORS.force, equal: COLORS.force, stomp: COLORS.a, clap: COLORS.b };
  const intro = deriveIntro(timing, {
    drop: SECTIONS.drop,
    end: SECTIONS.end,
    endTitle: "NEWTON'S THREE",
    endKicker: "STEM INSTITUTE  ·  No. 12",
    endFooter: "inertia · F = ma · action–reaction",
  });
  const scenes = { intro: new IntroScene(ctx, intro), graph: new GraphScene(ctx) };
  function pick(t) {
    if (t < SECTIONS.verse1) return ["intro", "intro"];
    if (t >= SECTIONS.end) return ["intro", "end"];
    let section = ORDER[0];
    for (const s of ORDER) if (t >= SECTIONS[s]) section = s;
    return ["graph", section];
  }
  return { scenes, pick, intro };
}
