import { sfx } from "../sfx.js";

/** A soft ignition under the vocal, then a physical contact and a melodic release. */
export function ignition(side) {
  const t = sfx.at(); if (t == null) return;
  sfx.noise(t, { f0: 700, f1: 3300, dur: 0.13, gain: 0.055, pan: side ? 0.3 : -0.3, attack: 0.004 });
  sfx.tone(t, { f0: 190, f1: 420, dur: 0.11, gain: 0.065 });
}

export function turnSound(degrees, result, combo) {
  const t = sfx.at(); if (t == null) return;
  if (result === "miss") {
    sfx.tone(t, { f0: 170, f1: 48, dur: 0.24, gain: 0.2 });
    sfx.noise(t, { f0: 1200, f1: 200, dur: 0.25, gain: 0.12, type: "lowpass" });
    return;
  }
  const power = result === "perfect" ? 1.3 : 1;
  sfx.tone(t, { f0: 135, f1: 43, dur: 0.18, gain: 0.2 * power });
  sfx.noise(t, { f0: 900, f1: 4800, dur: 0.22, gain: 0.1 * power, pan: -0.3 });
  sfx.noise(t + 0.04, { f0: 4300, f1: 600, dur: 0.35, gain: 0.07 * power, pan: 0.3 });
  const note = [523.25, 587.33, 659.25, 783.99, 880][Math.floor(degrees / 45) % 5];
  sfx.bell(t + 0.025, note, 0.055 * power, 0.4);
  if (result === "perfect") sfx.bell(t + 0.09, note * 2, 0.035, 0.3);
  if (combo && combo % 8 === 0) [1, 1.25, 1.5, 2].forEach((n, i) => sfx.bell(t + i * 0.065, 523.25 * n, 0.055, 0.45));
}
