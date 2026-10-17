import { IntroScene, deriveIntro } from "@gizclaw/mvg-core/intro.js";
import { COLORS, ORDER, RETIME, SECTIONS } from "./constants.js";
import { PondScene } from "./scene.js";

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
    ribbit: COLORS.ribbit,
    hop: COLORS.hop,
    hops: COLORS.hop,
    leap: COLORS.hop,
    stop: COLORS.stop,
    freeze: COLORS.stop,
    hey: COLORS.hey,
    bend: COLORS.bend,
    low: COLORS.bend,
    hooray: COLORS.hooray,
    legs: COLORS.leg,
    frog: "#3fc84a",
    frogs: "#3fc84a",
    pond: COLORS.ribbit,
    ripples: COLORS.ribbit,
  };
  const intro = deriveIntro(timing, {
    drop: SECTIONS.drop,
    end: SECTIONS.end,
    tagline: "ANIMAL MOVES",
    endTitle: "FROG HOP STOP",
    endKicker: "ANIMAL MOVES",
    endFooter: "ribbit  ·  hop  ·  bend  ·  stop",
  });
  const scenes = { intro: new IntroScene(ctx, intro), pond: new PondScene(ctx) };
  const starts = { open: SECTIONS.drop, verse1: SECTIONS.verse1, chorus1: SECTIONS.chorus1, verse2: SECTIONS.verse2, chorus2: SECTIONS.chorus2, bridge: SECTIONS.bridge, chorus3: SECTIONS.chorus3, outro: SECTIONS.outro };
  function pick(t) {
    if (t < SECTIONS.drop) return ["intro", "intro"];
    if (t >= SECTIONS.end) return ["intro", "end"];
    let section = "open";
    for (const s of ORDER) if (t >= starts[s]) section = s;
    return ["pond", section];
  }
  return { scenes, pick, intro };
}
