import { IntroScene, deriveIntro } from "@gizclaw/mvg-core/intro.js";
import { ClinicScene } from "./clinic.js";
import { ORDER, RETIME, SECTIONS, TYPES } from "./constants.js";

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
    incisors: TYPES.incisor.color,
    cut: TYPES.incisor.color,
    canines: TYPES.canine.color,
    tear: TYPES.canine.color,
    premolars: TYPES.premolar.color,
    crush: TYPES.premolar.color,
    molars: TYPES.molar.color,
    grind: TYPES.molar.color,
    grinding: TYPES.molar.color,
    "thirty-two": "#ffd23f",
    twenty: "#bfe8ff",
    chomp: "#ff7a8a",
    brush: "#7cc6ff",
  };
  const intro = deriveIntro(timing, {
    drop: SECTIONS.drop,
    end: SECTIONS.end,
    endTitle: "THIRTY-TWO CHOMPERS",
    endKicker: "STEM INSTITUTE  ·  No. 19",
    endFooter: "8 incisors · 4 canines · 8 premolars · 12 molars",
  });
  const scenes = { intro: new IntroScene(ctx, intro), clinic: new ClinicScene(ctx) };
  function pick(t) {
    if (t < SECTIONS.verse1) return ["intro", "intro"];
    if (t >= SECTIONS.end) return ["intro", "end"];
    let section = ORDER[0];
    for (const s of ORDER) if (t >= SECTIONS[s]) section = s;
    return ["clinic", section];
  }
  return { scenes, pick, intro };
}
