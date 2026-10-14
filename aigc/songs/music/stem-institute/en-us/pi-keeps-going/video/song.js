import { IntroScene, deriveIntro } from "@gizclaw/mvg-core/intro.js";
import { DIGIT_COLORS, DIGIT_WORDS, ORDER, SECTIONS } from "./constants.js";
import { WalkScene } from "./walk.js";

// The generated vocal stops early: the last outro digits ("three two seven
// nine") arrive late and the final three lyric lines are never sung.
const TAIL = [[104.66, 104.95], [105.09, 105.31], [105.47, 105.97], [106.09, 106.68]];

export function createSong(ctx) {
  const { timing } = ctx;
  const last = timing.cues[42];
  last.words.slice(-TAIL.length).forEach((w, k) => ([w.start, w.end] = TAIL[k]));
  last.end = TAIL.at(-1)[1];
  timing.cues.length = 43;

  timing.setDownbeat(SECTIONS.drop);
  ctx.hud.wordColors = { ...Object.fromEntries(DIGIT_WORDS.map((w, d) => [w, DIGIT_COLORS[d]])), pi: "#ffd23f", circle: "#ffd23f", order: "#8fa0ff" };
  const intro = deriveIntro(timing, {
    drop: SECTIONS.drop,
    end: SECTIONS.end,
    endTitle: "PI KEEPS GOING",
    endKicker: "STEM INSTITUTE  ·  No. 5",
    endFooter: "3.14159 26535 89793 …",
  });
  const scenes = { intro: new IntroScene(ctx, intro), walk: new WalkScene(ctx) };
  function pick(t) {
    if (t < SECTIONS.verse1) return ["intro", "intro"];
    if (t >= SECTIONS.end) return ["intro", "end"];
    let section = ORDER[0];
    for (const s of ORDER) if (t >= SECTIONS[s]) section = s;
    return ["walk", section];
  }
  return { scenes, pick, intro };
}
