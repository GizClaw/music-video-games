import { IntroScene, deriveIntro } from "@gizclaw/mvg-core/intro.js";
import { WorkoutScene } from "./workout.js";
import { CONTRACT, MUSCLES, ORDER, RELAX, RETIME, SECTIONS } from "./constants.js";

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
    biceps: MUSCLES.biceps.color,
    triceps: MUSCLES.triceps.color,
    deltoids: MUSCLES.deltoid.color,
    abs: MUSCLES.abs.color,
    abdominal: MUSCLES.abs.color,
    abdominals: MUSCLES.abs.color,
    quadriceps: MUSCLES.quads.color,
    hamstrings: MUSCLES.hams.color,
    calf: MUSCLES.calves.color,
    contract: CONTRACT,
    flex: CONTRACT,
    relax: RELAX,
    tendons: "#ffffff",
  };
  const intro = deriveIntro(timing, {
    drop: SECTIONS.drop,
    end: SECTIONS.end,
    endTitle: "MUSCLE ROLL CALL",
    endKicker: "STEM INSTITUTE  ·  No. 20",
    endFooter: "biceps · triceps · deltoids · abs · quads · hamstrings · calves",
  });
  const scenes = { intro: new IntroScene(ctx, intro), workout: new WorkoutScene(ctx) };
  function pick(t) {
    if (t < SECTIONS.verse1) return ["intro", "intro"];
    if (t >= SECTIONS.end) return ["intro", "end"];
    let section = ORDER[0];
    for (const s of ORDER) if (t >= SECTIONS[s]) section = s;
    return ["workout", section];
  }
  return { scenes, pick, intro };
}
