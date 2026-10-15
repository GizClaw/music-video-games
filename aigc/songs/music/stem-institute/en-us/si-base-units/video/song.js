import { IntroScene, deriveIntro } from "@gizclaw/mvg-core/intro.js";
import { ParadeScene } from "./parade.js";
import { ORDER, RETIME, SECTIONS, UNITS } from "./constants.js";

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
    ...Object.fromEntries(UNITS.map((u) => [u.name, u.color])),
    length: UNITS[0].color,
    mass: UNITS[1].color,
    time: UNITS[2].color,
    current: UNITS[3].color,
    temperature: UNITS[4].color,
    substance: UNITS[5].color,
    luminous: UNITS[6].color,
    intensity: UNITS[6].color,
    name: "#ffffff",
    unit: "#ffd23f",
    symbol: "#3dc2ff",
    si: "#ffd23f",
    hey: "#ff5d8f",
  };
  const intro = deriveIntro(timing, {
    drop: SECTIONS.drop,
    end: SECTIONS.end,
    endTitle: "SEVEN BASE UNITS",
    endKicker: "STEM INSTITUTE  ·  No. 13",
    endFooter: "m · kg · s · A · K · mol · cd",
  });
  const scenes = { intro: new IntroScene(ctx, intro), parade: new ParadeScene(ctx) };
  function pick(t) {
    if (t < SECTIONS.verse1) return ["intro", "intro"];
    if (t >= SECTIONS.end) return ["intro", "end"];
    let section = ORDER[0];
    for (const s of ORDER) if (t >= SECTIONS[s]) section = s;
    return ["parade", section];
  }
  return { scenes, pick, intro };
}
