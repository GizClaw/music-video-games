import { IntroScene, deriveIntro } from "@gizclaw/mvg-core/intro.js";
import { TableScene } from "./table.js";
import { CATEGORY, ELEMENTS, FIRST, ORDER, RETIME, SECTIONS } from "./constants.js";

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
    ...Object.fromEntries(ELEMENTS.slice(FIRST - 1).map((e) => [e.name.toLowerCase(), CATEGORY[e.category].color])),
    lanthanides: CATEGORY.lanthanide.color,
    actinides: CATEGORY.actinide.color,
    "fifty-seven": CATEGORY.lanthanide.color,
    "one-one-eight": CATEGORY.noble.color,
    eighteen: CATEGORY.noble.color,
    go: "#3dff8a",
    tap: "#ffd23f",
    hold: CATEGORY.transition.color,
  };
  const intro = deriveIntro(timing, {
    drop: SECTIONS.drop,
    end: SECTIONS.end,
    endTitle: "THE ELEMENT GALOP, PART TWO",
    endKicker: "STEM INSTITUTE  ·  No. 2",
    endFooter: "La  ·  Hf  ·  Au  ·  U  ·  …  ·  Og",
  });
  const scenes = { intro: new IntroScene(ctx, intro), table: new TableScene(ctx) };
  function pick(t) {
    if (t < SECTIONS.count) return ["intro", "intro"];
    if (t >= SECTIONS.end) return ["intro", "end"];
    let section = ORDER[0];
    for (const s of ORDER) if (t >= SECTIONS[s]) section = s;
    return ["table", section];
  }
  return { scenes, pick, intro };
}
