import { IntroScene, deriveIntro } from "@gizclaw/mvg-core/intro.js";
import { CHANGES, SECTIONS, STATES } from "./constants.js";
import { MatterScene } from "./matter.js";

export function createSong(ctx) {
  const { timing } = ctx;
  timing.setDownbeat(SECTIONS.drop);
  ctx.hud.wordColors = {
    ...Object.fromEntries(STATES.map((s) => [s.id, s.color])),
    ...Object.fromEntries(CHANGES.map((c) => [c.word, STATES[c.to].color])),
    hey: "#ffd23f",
    energy: "#ffb347",
    particles: "#ffffff",
  };
  const intro = deriveIntro(timing, {
    drop: SECTIONS.drop,
    end: SECTIONS.end,
    endTitle: "SOLID, LIQUID, GAS, PLASMA",
    endKicker: "STEM INSTITUTE  ·  No. 4",
    endFooter: "melt · freeze · vaporize · condense",
  });
  const scenes = { intro: new IntroScene(ctx, intro), matter: new MatterScene(ctx) };
  const order = ["verse1", "chorus1", "verse2", "chorus2", "verse3", "chorus3", "outro"];
  function pick(t) {
    if (t < SECTIONS.verse1) return ["intro", "intro"];
    if (t >= SECTIONS.end) return ["intro", "end"];
    let section = "verse1";
    for (const s of order) if (t >= SECTIONS[s]) section = s;
    return ["matter", section];
  }
  // Sit below the container and its burner so the particles keep the frame.
  return { scenes, pick, intro, lyricY: 1490 };
}
