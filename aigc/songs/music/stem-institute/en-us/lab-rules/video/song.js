import { IntroScene, deriveIntro } from "@gizclaw/mvg-core/intro.js";
import { RulesScene } from "./rules.js";
import { ACCENT, NO, OK, ORDER, RETIME, SECTIONS } from "./constants.js";

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
    check: OK,
    goggles: OK,
    gloves: OK,
    tie: OK,
    clear: OK,
    read: OK,
    listen: OK,
    ask: OK,
    wash: OK,
    clean: OK,
    labeled: OK,
    closed: OK,
    tell: OK,
    report: OK,
    on: OK,
    tied: OK,
    safe: OK,
    safety: OK,
    no: NO,
    never: NO,
    not: NO,
    taste: NO,
    smell: NO,
    sniff: NO,
    rock: ACCENT,
    rules: ACCENT,
    help: ACCENT,
    hand: ACCENT,
  };
  const intro = deriveIntro(timing, {
    drop: SECTIONS.drop,
    end: SECTIONS.end,
    endTitle: "LAB RULES ROCK",
    endKicker: "STEM INSTITUTE  ·  No. 24",
    endFooter: "goggles · gloves · ask · never taste · wash",
  });
  const scenes = { intro: new IntroScene(ctx, intro), lab: new RulesScene(ctx) };
  function pick(t) {
    if (t < SECTIONS.warmup) return ["intro", "intro"];
    if (t >= SECTIONS.end) return ["intro", "end"];
    let section = ORDER[0];
    for (const s of ORDER) if (t >= SECTIONS[s]) section = s;
    return ["lab", section];
  }
  return { scenes, pick, intro };
}
