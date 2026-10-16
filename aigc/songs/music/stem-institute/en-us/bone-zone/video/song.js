import { IntroScene, deriveIntro } from "@gizclaw/mvg-core/intro.js";
import { BeachScene } from "./beach.js";
import { BONES, COUNT, LIGAMENT, MUSCLE, ORDER, RETIME, SECTIONS } from "./constants.js";

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
    skull: BONES.skull.color,
    brain: BONES.skull.color,
    ribs: BONES.ribs.color,
    vertebral: BONES.spine.color,
    vertebrae: BONES.spine.color,
    spine: BONES.spine.color,
    clavicle: BONES.clavicle.color,
    clavicles: BONES.clavicle.color,
    collarbones: BONES.clavicle.color,
    femur: BONES.femur.color,
    joint: BONES.joint.color,
    joints: BONES.joint.color,
    ligaments: LIGAMENT,
    tendons: MUSCLE,
    "two-oh-six": COUNT,
    six: COUNT,
  };
  const intro = deriveIntro(timing, {
    drop: SECTIONS.drop,
    end: SECTIONS.end,
    endTitle: "WELCOME TO THE BONE ZONE",
    endKicker: "STEM INSTITUTE  ·  No. 21",
    endFooter: "skull · ribs · spine · clavicle · femur",
  });
  const scenes = { intro: new IntroScene(ctx, intro), beach: new BeachScene(ctx) };
  function pick(t) {
    if (t < SECTIONS.verse1) return ["intro", "intro"];
    if (t >= SECTIONS.end) return ["intro", "end"];
    let section = ORDER[0];
    for (const s of ORDER) if (t >= SECTIONS[s]) section = s;
    return ["beach", section];
  }
  return { scenes, pick, intro };
}
