import { IntroScene, deriveIntro } from "@gizclaw/mvg-core/intro.js";
import { COLORS, NAMES, ORDER, SECTIONS } from "./constants.js";
import { PartyScene } from "./party.js";

export function createSong(ctx) {
  const { timing } = ctx;
  timing.setDownbeat(SECTIONS.drop);
  const words = { three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
  ctx.hud.wordColors = {
    ...Object.fromEntries(Object.entries(NAMES).map(([n, name]) => [name.toLowerCase(), COLORS[n]])),
    ...Object.fromEntries(Object.entries(words).map(([w, n]) => [w, COLORS[n]])),
    party: "#ffd23f",
    polygon: "#ffd23f",
  };
  const intro = deriveIntro(timing, {
    drop: SECTIONS.drop,
    end: SECTIONS.end,
    endTitle: "POLYGON PARTY",
    endKicker: "STEM INSTITUTE  ·  No. 6",
    endFooter: "triangle  →  dodecagon",
  });
  const scenes = { intro: new IntroScene(ctx, intro), party: new PartyScene(ctx) };
  function pick(t) {
    if (t < SECTIONS.verse1) return ["intro", "intro"];
    if (t >= SECTIONS.end) return ["intro", "end"];
    let section = ORDER[0];
    for (const s of ORDER) if (t >= SECTIONS[s]) section = s;
    return ["party", section];
  }
  return { scenes, pick, intro };
}
