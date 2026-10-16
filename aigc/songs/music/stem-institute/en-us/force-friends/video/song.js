import { IntroScene, deriveIntro } from "@gizclaw/mvg-core/intro.js";
import { ParkScene } from "./park.js";
import { FORCES, ORDER, RETIME, SECTIONS } from "./constants.js";

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
    ...Object.fromEntries(FORCES.map((f) => [f.word, f.color])),
    buoyant: FORCES[3].color,
    magnetic: FORCES[4].color,
    drag: FORCES[5].color,
    resistance: FORCES[5].color,
    down: FORCES[0].color,
    slow: FORCES[1].color,
    boing: FORCES[2].color,
    float: FORCES[3].color,
    click: FORCES[4].color,
    whoosh: FORCES[5].color,
    push: "#ffffff",
    pull: "#ffffff",
    size: "#ffd23f",
    direction: "#ffd23f",
    balanced: "#7cff6b",
    unbalanced: "#ff5d8f",
  };
  const intro = deriveIntro(timing, {
    drop: SECTIONS.drop,
    end: SECTIONS.end,
    endTitle: "FORCE FRIENDS",
    endKicker: "STEM INSTITUTE  ·  No. 16",
    endFooter: "down · slow · boing · float · click · whoosh",
  });
  const scenes = { intro: new IntroScene(ctx, intro), park: new ParkScene(ctx) };
  function pick(t) {
    if (t < SECTIONS.verse1) return ["intro", "intro"];
    if (t >= SECTIONS.end) return ["intro", "end"];
    let section = ORDER[0];
    for (const s of ORDER) if (t >= SECTIONS[s]) section = s;
    return ["park", section];
  }
  return { scenes, pick, intro };
}
