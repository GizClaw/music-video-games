import { IntroScene, deriveIntro } from "@gizclaw/mvg-core/intro.js";
import { TableScene } from "./table.js";
import { CATEGORY, ELEMENTS, ORDER, RETIME_WORDS, SECTIONS } from "./constants.js";

export function createSong(ctx) {
  const { timing } = ctx;
  for (const [ci, fixes] of Object.entries(RETIME_WORDS)) {
    const cue = timing.cues[ci];
    for (const [k, t0] of Object.entries(fixes)) cue.words[k].start = t0;
    cue.start = cue.words[0].start;
  }
  timing.setDownbeat(SECTIONS.drop);
  ctx.hud.wordColors = {
    ...Object.fromEntries(ELEMENTS.map((e) => [e.name.toLowerCase(), CATEGORY[e.category].color])),
    "peri-peri-periodic": "#ffd23f",
    bop: "#ff5dc8",
    hop: "#3dc2ff",
    faster: "#ff5d5d",
  };
  const intro = deriveIntro(timing, {
    drop: SECTIONS.drop,
    end: SECTIONS.end,
    endTitle: "THE ELEMENT GALOP",
    endKicker: "STEM INSTITUTE  ·  No. 1",
    endFooter: "H  ·  He  ·  Li  ·  …  ·  Cs  ·  Ba",
  });
  const scenes = { intro: new IntroScene(ctx, intro), table: new TableScene(ctx) };
  function pick(t) {
    if (t < SECTIONS.verse1) return ["intro", "intro"];
    if (t >= SECTIONS.end) return ["intro", "end"];
    let section = ORDER[0];
    for (const s of ORDER) if (t >= SECTIONS[s]) section = s;
    return ["table", section];
  }
  return { scenes, pick, intro };
}
