export const ACTION_NAMES = {
  zh: ["撞击", "滑行", "跳跃", "放电"],
  en: ["SMASH", "SLIDE", "JUMP", "ZAP"],
};

/** Input-driven poses. Song time freezes the animation on pause/buffering;
 * approaching a gate alone produces no action. */
export function actionPose(event, t) {
  const age = event ? t - event.at : Infinity;
  const active = age >= 0 && age < .74;
  const release = Math.max(0, Math.min(1, (age - .3) / .44));
  const power = active ? (age < .1 ? Math.sin(age / .1 * Math.PI / 2) : 1 - release * release * (3 - 2 * release)) : 0;
  const phase = active ? event.phase : null;
  return {
    phase, power,
    forward: phase === 0 ? power * 1.05 : phase === 1 ? power * .55 : phase === 3 ? power * .3 : 0,
    lift: phase === 2 ? power * 2.7 : phase === 1 ? -power * .65 : 0,
    squash: phase === 1 ? 1 - power * .76 : phase === 0 ? 1 - power * .12 : 1,
    stretch: phase === 1 ? 1 + power * .7 : phase === 0 ? 1 + power * .16 : 1,
    charge: phase === 3 ? power : 0,
  };
}
