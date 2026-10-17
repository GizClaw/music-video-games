import { IntroScene, deriveIntro } from "@gizclaw/mvg-core/intro.js";
import { COLORS, ICE_ORDER, RETIME, SECTIONS } from "./constants.js";
import { IceScene } from "./ice.js";
import { SeaScene } from "./sea.js";

/** Replace word starts: a full list, or a { wordIndex: start } patch. */
function retime(timing, fixes) {
  for (const [index, fix] of Object.entries(fixes)) {
    const cue = timing.cues[index];
    const starts = cue.words.map((w, k) => (Array.isArray(fix) ? fix[k] : fix[k] ?? w.start));
    cue.words.forEach((w, k) => {
      w.start = starts[k];
      w.end = starts[k + 1] ?? Math.max(w.end, starts[k] + 0.4);
    });
    cue.start = starts[0];
    cue.end = Math.max(cue.end, cue.words.at(-1).end);
  }
}

export function createSong(ctx) {
  const { timing } = ctx;
  retime(timing, RETIME);
  timing.setDownbeat(SECTIONS.drop);
  ctx.hud.wordColors = {
    step: COLORS.step,
    steps: COLORS.step,
    clap: COLORS.clap,
    waddle: COLORS.waddle,
    left: COLORS.waddle,
    right: COLORS.waddle,
    flap: COLORS.flap,
    flash: "#ffffff",
    bright: COLORS.clap,
    hey: COLORS.hey,
    penguin: "#8fd3ff",
    penguins: "#8fd3ff",
    night: COLORS.night,
    swim: COLORS.swim,
    swimming: COLORS.swim,
    underwater: COLORS.swim,
    bubbles: COLORS.swim,
    wings: COLORS.flap,
    freeze: COLORS.ice,
    ice: COLORS.ice,
    icy: COLORS.ice,
    fly: COLORS.no,
    sway: COLORS.night,
  };
  const intro = deriveIntro(timing, {
    drop: SECTIONS.drop,
    end: SECTIONS.end,
    tagline: "ANIMAL MOVES",
    endTitle: "PENGUIN STEP PARTY",
    endKicker: "ANIMAL MOVES",
    endFooter: "step  ·  clap  ·  waddle  ·  flap",
  });
  const scenes = { intro: new IntroScene(ctx, intro), ice: new IceScene(ctx), sea: new SeaScene(ctx) };
  const starts = { open: SECTIONS.drop, verse1: SECTIONS.verse1, chorus1: SECTIONS.chorus1, verse2: SECTIONS.verse2, chorus2: SECTIONS.chorus2, bridge: SECTIONS.bridge, freeze: SECTIONS.freeze, dance: SECTIONS.dance, chorus3: SECTIONS.chorus3, outro: SECTIONS.outro };
  function pick(t) {
    if (t < SECTIONS.drop) return ["intro", "intro"];
    if (t >= SECTIONS.end) return ["intro", "end"];
    if (t >= SECTIONS.dive && t < SECTIONS.verse2) return ["sea", "dive"];
    if (t >= SECTIONS.glide && t < SECTIONS.freeze) return ["sea", "glide"];
    let section = "open";
    for (const s of ICE_ORDER) if (t >= starts[s]) section = s;
    return ["ice", section];
  }
  return { scenes, pick, intro };
}
