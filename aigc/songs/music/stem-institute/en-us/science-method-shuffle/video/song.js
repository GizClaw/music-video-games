import { IntroScene, deriveIntro } from "@gizclaw/mvg-core/intro.js";
import { ShuffleScene } from "./shuffle.js";
import { ORDER, RETIME, SECTIONS, STEPS } from "./constants.js";

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
  const [question, hypothesis, experiment, observe, record, analyze, conclusion] = STEPS.map((s) => s.color);
  ctx.hud.wordColors = {
    ask: question,
    question,
    testable: question,
    hypothesis,
    hypothesize: hypothesis,
    experiment,
    test: experiment,
    tested: experiment,
    variable: experiment,
    variables: experiment,
    controlled: "#ffffff",
    observe,
    observation: observe,
    watch: observe,
    measure: observe,
    record,
    data: record,
    tables: record,
    write: record,
    analyze,
    patterns: analyze,
    evidence: analyze,
    conclusion,
    conclusions: conclusion,
  };
  const intro = deriveIntro(timing, {
    drop: SECTIONS.drop,
    end: SECTIONS.end,
    endTitle: "SCIENTIFIC METHOD SHUFFLE",
    endKicker: "STEM INSTITUTE  ·  No. 25",
    endFooter: "ask · hypothesize · test · conclude",
  });
  const scenes = { intro: new IntroScene(ctx, intro), garden: new ShuffleScene(ctx) };
  function pick(t) {
    if (t < SECTIONS.verse1) return ["intro", "intro"];
    if (t >= SECTIONS.end) return ["intro", "end"];
    let section = ORDER[0];
    for (const s of ORDER) if (t >= SECTIONS[s]) section = s;
    return ["garden", section];
  }
  return { scenes, pick, intro };
}
