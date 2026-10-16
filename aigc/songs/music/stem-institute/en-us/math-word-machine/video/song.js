import { IntroScene, deriveIntro } from "@gizclaw/mvg-core/intro.js";
import { ShopScene } from "./shop.js";
import { ORDER, RETIME, SECTIONS, TERMS } from "./constants.js";

function retime(timing, fixes) {
  for (const [index, starts] of Object.entries(fixes)) {
    const cue = timing.cues[index];
    cue.words.forEach((w, k) => {
      w.start = starts[k];
      w.end = starts[k + 1] ?? starts[k] + 0.4;
    });
    cue.start = starts[0];
    cue.end = Math.max(cue.words.at(-1).end, starts.at(-1) + 0.5);
  }
}

export function createSong(ctx) {
  const { timing } = ctx;
  retime(timing, RETIME);
  timing.setDownbeat(SECTIONS.drop);
  ctx.hud.wordColors = {
    ...Object.fromEntries(Object.entries(TERMS).map(([k, v]) => [k, v.color])),
    add: TERMS.sum.color,
    adding: TERMS.sum.color,
    subtract: TERMS.difference.color,
    subtracting: TERMS.difference.color,
    multiply: TERMS.product.color,
    multiplying: TERMS.product.color,
    divide: TERMS.quotient.color,
    dividing: TERMS.quotient.color,
    division: TERMS.quotient.color,
    fraction: "#ffd23f",
    whirr: "#ffb347",
    click: "#ffb347",
    "click-click-click": "#ffb347",
    clack: "#ffb347",
  };
  const intro = deriveIntro(timing, {
    drop: SECTIONS.drop,
    end: SECTIONS.end,
    endTitle: "MATH WORD MACHINE",
    endKicker: "STEM INSTITUTE  ·  No. 9",
    endFooter: "+  −  ×  ÷   ·   ½   ·   x = ?",
  });
  const scenes = { intro: new IntroScene(ctx, intro), shop: new ShopScene(ctx) };
  function pick(t) {
    if (t < SECTIONS.verse1) return ["intro", "intro"];
    if (t >= SECTIONS.end) return ["intro", "end"];
    let section = ORDER[0];
    for (const s of ORDER) if (t >= SECTIONS[s]) section = s;
    return ["shop", section];
  }
  return { scenes, pick, intro };
}
