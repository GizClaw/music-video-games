import { sfx } from "../sfx.js";

/** A short response to the action button, separate from the scored impact. */
export function actionSound(phase) {
  const t = sfx.at();
  if (t == null) return;
  sfx.noise(t, { f0: [600, 1700, 500, 2400][phase], f1: [2400, 500, 3300, 900][phase], dur: .14, gain: .045, q: .6, attack: .004 });
  sfx.tone(t, { type: "triangle", f0: [180, 480, 300, 760][phase], f1: [90, 190, 680, 1300][phase], dur: .12, gain: .045 });
}

/** A physical pass: short bass impact, stereo air rush, then a material-specific
 * tail. Uses the shared audio context and site mute; never delays the song. */
export function portalSound(phase, grade) {
  const t = sfx.at();
  if (t == null) return;
  if (grade === "miss") {
    sfx.tone(t,{f0:145,f1:38,dur:.28,gain:.26});
    sfx.noise(t,{f0:1500,f1:180,dur:.2,gain:.13,q:.6,attack:.004,type:"lowpass"});
    sfx.tone(t+.08,{type:"triangle",f0:180,f1:115,dur:.12,gain:.07});
    return;
  }
  const power = grade === "perfect" ? 1.65 : grade === "great" ? 1.4 : 1.25;
  sfx.tone(t, { f0: 115, f1: 42, dur: 0.22, gain: 0.2 * power });
  sfx.tone(t, { type: "triangle", f0: 310, f1: 100, dur: 0.12, gain: 0.14 * power });
  sfx.noise(t, { f0: 800, f1: 4700, dur: 0.19, gain: 0.11 * power, q: 0.7, attack: 0.006, pan: -0.28 });
  sfx.noise(t + 0.025, { f0: 4200, f1: 900, dur: 0.24, gain: 0.07 * power, q: 0.8, attack: 0.008, pan: 0.28 });
  if (phase === 0) {
    sfx.bell(t + 0.01, 1568, 0.055 * power, 0.32, -0.2);
    sfx.bell(t + 0.035, 2352, 0.025 * power, 0.25, 0.2);
  } else if (phase === 1) {
    sfx.tone(t + 0.015, { f0: 660, f1: 190, dur: 0.2, gain: 0.09 * power });
    sfx.bell(t + 0.045, 784, 0.04 * power, 0.3);
  } else if (phase === 2) {
    sfx.noise(t + 0.035, { f0: 2200, f1: 600, dur: 0.36, gain: 0.075 * power, q: 0.5, attack: 0.03 });
    sfx.bell(t, 1046.5, 0.045 * power, 0.26);
  } else {
    sfx.tone(t, { type: "sawtooth", f0: 880, f1: 220, dur: 0.16, gain: 0.04 * power, lp: 2800 });
    sfx.bell(t + 0.025, 1318.5, 0.06 * power, 0.36);
  }
  if (grade === "perfect") sfx.bell(t + 0.055, 2093, 0.025, 0.24, 0.2);
}
