import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PerspectiveCamera, Vector3 } from "three";
import { MatterScene } from "../packages/games/src/matter/scene.js";
import { ACTION_WINDOW, buildChart, gateResult, judgeGate, recordAction } from "../packages/games/src/matter/song.js";
import { AudioClock } from "../packages/games/src/kit.js";
import { actionPose } from "../packages/games/src/matter/action.js";
import { prepareLyrics, vocabularyFor } from "../packages/games/src/matter/lyrics.js";
import { RUN_PACE, runPace, AdaptivePace, speedBonus, gateOffset, gateApproaches } from "../packages/games/src/matter/pace.js";

const data = JSON.parse(readFileSync(new URL("../packages/games/src/matter/analysis.json", import.meta.url)));
const chart = buildChart(data);
assert(chart.length > 40, "The complete song needs more than an introductory chart");
assert(chart[0].t >= 2 && chart[0].t <= 3.5, "The first gate must arrive promptly with enough time to react");
assert.deepEqual(chart, buildChart(data), "Restarts must have the same obstacles");
assert.deepEqual([...new Set(chart.filter((n) => n.practice).map((n) => n.phase))].sort(), [0, 1, 2, 3], "Teach all four transformations before penalties begin");
let previousBeatGap = Infinity;
for (let i = 0; i < chart.length; i++) {
  const n = chart[i];
  assert(data.beats.includes(n.t), `Gate ${i} must land on a detected beat`);
  assert(n.phase >= 0 && n.phase <= 3 && Number.isInteger(n.phase));
  assert(n.t >= 2 && n.t < data.duration - 2);
  if (i) {
    assert(n.t - chart[i - 1].t > 0.9, "Players need time to see and choose the next form");
    const beatGap = data.beats.indexOf(n.t) - data.beats.indexOf(chart[i - 1].t);
    assert(beatGap <= previousBeatGap, "Later verses must not reduce the gate cadence");
    previousBeatGap = beatGap;
    if (chart[i - 1].t >= 60.15) assert.equal(beatGap, 2, "The fast section keeps a two-beat cadence");
  }
  const approaching = { ...n };
  gateApproaches([approaching], n.t - 1.2, 52);
  assert.equal(gateApproaches([approaching], n.t, 24)[0].distance, 0, "A visible gate must meet the player on its original musical beat after a speed change");
  assert(gateOffset(gateApproaches([approaching], n.t + ACTION_WINDOW.late, 24)[0].distance) > -6, "A gate must stay visible throughout the late action window");
}
assert.equal(data.beats.indexOf(chart[1].t) - data.beats.indexOf(chart[0].t), 4, "The opening gives four beats between actions");
const adaptive = new AdaptivePace();
assert.equal(adaptive.speed, 36, "Start substantially faster than the old 22.5-unit ceiling");
assert.equal(adaptive.at(1).distance, 36, "Initial world travel uses elapsed original song time");
const originalDistance = adaptive.at(22).distance;
let gain = 0;
for (let i = 0; i < 5; i++) {
  const previous = adaptive.speed;
  assert.equal(adaptive.resolve("perfect", 22), 1);
  assert(adaptive.speed - previous > gain, "An increasing combo adds more acceleration per clear");
  gain = adaptive.speed - previous;
}
const fastBonus = adaptive.at(22).bonus;
const beforeMiss = adaptive.speed;
assert.equal(adaptive.resolve("miss", 22), -1);
assert.equal(adaptive.speed, beforeMiss - 6, "Every missed gate immediately removes speed");
assert.equal(adaptive.streak, 0);
assert(adaptive.at(22).bonus < fastBonus, "Slower clears must earn a smaller speed bonus");
assert.equal(adaptive.at(22).distance, originalDistance, "Changing speed must not teleport the world or upcoming gates");
for (let i = 0; i < 40; i++) adaptive.resolve("great");
assert.equal(adaptive.speed, 52, "Successful combos settle at a capped fast speed");
assert.equal(adaptive.at(100).bonus, 3);
for (let i = 0; i < 5; i++) {
  adaptive.resolve("miss");
  assert(!adaptive.failed, "Remaining speed keeps the run alive");
}
adaptive.resolve("miss");
assert(adaptive.failed, "Hitting the minimum speed ends the run");
assert.equal(adaptive.speed, 16);
adaptive.resolve("perfect");
assert(adaptive.failed, "An ended run cannot revive without a restart");
adaptive.reset();
assert.equal(adaptive.speed, 36);
assert.equal(adaptive.streak, 0);
assert(!adaptive.failed);
assert.equal(speedBonus(16), 1);
assert.equal(speedBonus(52), 3);
const course = buildChart(data);
const driving = new AdaptivePace();
let nextSpeedChange = 0;
for (let t = 0; t <= data.duration; t += .1) {
  const before = gateApproaches(course, t, driving.speed);
  while (nextSpeedChange < chart.length && chart[nextSpeedChange].t <= t) {
    driving.resolve(nextSpeedChange % 3 === 0 ? "miss" : "perfect", t);
    nextSpeedChange++;
  }
  const visible = gateApproaches(course, t, driving.speed);
  assert(visible.length <= 10, "The full approach must fit in the gate pool");
  for (let i = 1; i < visible.length; i++) assert(visible[i].distance > visible[i-1].distance, "Speed changes must not reorder approaching gates");
  for (const previous of before) assert.equal(visible.find((g) => g.note.id === previous.note.id)?.distance, previous.distance, "Visible gates must not jump on a speed change");
}
for (const outcomes of [[], ["miss", "miss"], Array(10).fill("perfect")]) {
  const motion = new AdaptivePace();
  outcomes.forEach((result) => motion.resolve(result, 10));
  assert.equal(motion.at(10).distance, 360, "Speed changes preserve the distance already travelled");
  const movement = motion.at(10.1).distance - motion.at(10).distance;
  assert(Math.abs(movement / .1 - motion.speed) < .00001, "The road must change speed while music time advances at one second per second");
  assert.equal(motion.at(5).distance, 180, "Later speed changes must not rewrite previous movement");
}
const approaching = [{ id: 0, t: 5 }, { id: 1, t: 6.4 }];
assert.equal(gateApproaches(approaching, 3, 36)[0].distance, 72);
assert.equal(gateApproaches(approaching, 3, 52)[0].distance, 72, "The visible gate keeps its approach speed");
const nextApproach = gateApproaches(approaching, 5, 52);
assert.equal(nextApproach[1].note.approachSpeed, 52, "New gates adopt the current faster approach speed");
assert.equal(gateApproaches(approaching, 6.4, 30)[0].distance, 0);
// English lyrics keep the original media-time clock at normal speed.
const audio = Object.assign(new EventTarget(), { currentTime: 10, playbackRate: 1, paused: false });
const clock = new AudioClock(audio);
clock.reanchor();
clock.anchorPerf = performance.now() - 1000;
audio.currentTime = 10.96;
assert(Math.abs(clock.now() - 11) < .02);
audio.paused = true;
assert.equal(clock.now(), 10.96, "Pausing freezes the original music clock");
console.log("Matter Run pace: independent race speed, continuous travel, fixed-beat gate arrivals, miss slowdown, speed-floor defeat and speed bonuses verified");
const first = chart[0];
assert.equal(judgeGate(first, first.phase, first.t), "perfect");
assert.equal(judgeGate(first, first.phase, first.t - 0.1), "perfect");
assert.equal(judgeGate(first, first.phase, first.t + 0.1), "perfect", "Late taps inside the judgement window count");
assert.equal(judgeGate(first, first.phase, first.t - 0.23), "great");
assert.equal(judgeGate(first, first.phase, first.t - .35), "good");
assert.equal(judgeGate(first, first.phase, first.t - 2), "miss", "An old form selection or action cannot clear a later gate");
assert.equal(judgeGate(first, (first.phase + 1) % 4, first.t), "miss", "Perfect timing cannot bypass a wrong form");
assert.equal(gateResult(first, first.t), null, "A form without an action must not auto-clear at contact");
assert.equal(gateResult(first, first.t + ACTION_WINDOW.late), "miss", "Every gate needs its own action press");
const prepared = { ...first };
assert.equal(recordAction(prepared, first.phase, first.t - .35), "accepted");
assert.equal(recordAction(prepared, first.phase, first.t), "used", "Mashing cannot upgrade a stored judgement");
assert.equal(gateResult(prepared, first.t - .01), null, "An early press animates now but scores on contact");
assert.equal(gateResult(prepared, first.t), "good");
const late = { ...first };
assert.equal(recordAction(late, first.phase, first.t + .1), "accepted");
assert.equal(gateResult(late, first.t + .1), "perfect", "A valid late action reacts immediately");
const wrong = { ...first };
assert.equal(recordAction(wrong, (first.phase + 1) % 4, first.t), "wrong");
assert.equal(gateResult(wrong, first.t + ACTION_WINDOW.late), "miss", "Changing form alone cannot repair an earlier wrong action");
const corrected = { ...first };
recordAction(corrected, (first.phase + 1) % 4, first.t - .1);
assert.equal(recordAction(corrected, first.phase, first.t + .1), "accepted", "A second, correctly shaped action can recover inside the window");
assert.equal(gateResult(corrected, first.t + .1), "perfect");
const outside = { ...first };
assert.equal(recordAction(outside, first.phase, first.t - ACTION_WINDOW.early - .001), "early");
assert.equal(recordAction(outside, first.phase, first.t + ACTION_WINDOW.late + .001), "late");
assert.equal(recordAction(outside, first.phase, NaN), "none");
assert.equal(outside.activation, undefined, "Outside-window presses cannot be buffered into a success");
for (const note of chart) {
  const n = { ...note };
  assert.equal(recordAction(n, n.phase, n.t), "accepted");
  assert.equal(gateResult(n, n.t), "perfect");
}
assert.equal(actionPose(null, first.t).power, 0, "A nearby gate must not start an animation");
for (let phase = 0; phase < 4; phase++) {
  const event = { phase, at: 10 };
  assert.equal(actionPose(event, 9.99).power, 0);
  assert.equal(actionPose(event, 10.8).power, 0, "Actions release without holding a key");
  assert.deepEqual(actionPose(event, 10.2), actionPose(event, 10.2), "Paused song time must freeze the pose");
}
assert(actionPose({ phase: 0, at: 10 }, 10.2).forward > .8, "Ice lunges forward");
assert(actionPose({ phase: 1, at: 10 }, 10.2).squash < .3, "Water flattens beneath the pipe");
assert(actionPose({ phase: 2, at: 10 }, 10.2).lift > 2.5, "Vapor jumps above the fence");
assert(actionPose({ phase: 3, at: 10 }, 10.2).charge > .9, "Plasma energizes its electrical effects");
console.log(`Matter Run: ${chart.length} gates, required action presses, timing windows, retry rules and four input-driven poses verified`);

// The original segment boundaries cut off "melting" before it was sung.
// Protect the actual final-word timing while moving forward through lines.
const lyrics = prepareLyrics(data.cues);
for (let i = 0; i < lyrics.length; i++) {
  assert(lyrics[i].end >= Math.max(...lyrics[i].words.map((w) => w.end)), "A lyric must survive its last sung word");
  if (i) assert(lyrics[i].start >= lyrics[i - 1].end, "Only one lyric line should be active");
}
assert.equal(vocabularyFor("Liquid:"), "#13866e");
assert.equal(vocabularyFor("freezing."), "#287eb8");
assert.equal(vocabularyFor("the"), undefined);
console.log("Matter Run lyrics: complete sung lines and punctuated teaching vocabulary verified");

// Exercise the camera rig without a GPU: the race must recede ahead of the
// player, optics must build with speed, and reduced motion must remain steady.
const rig = Object.assign(Object.create(MatterScene.prototype), {
  camera: new PerspectiveCamera(52, 1.6, 0.1, 220),
  cameraPosition: new Vector3(), cameraTarget: new Vector3(), lookTarget: new Vector3(),
  h: 900, portrait: false, reduced: false, shiftAt: -99, sparkAt: -99,
  streakPositions: new Float32Array(84 * 6),
  streaks: { material: {}, geometry: { attributes: { position: {} }, setDrawRange() {} } },
});
const settle = (opts) => {
  for (let i = 0; i < 180; i++) rig.followCamera({ t: 22, dt: 1 / 60, phase: 1, intro: false, pulse: 0, action: 0, ...opts });
  rig.camera.updateMatrixWorld();
};
settle({});
assert(rig.camera.getWorldDirection(new Vector3()).x > 0.95, "Chase camera must face down the track, not across it");
const near = new Vector3(-3.8, 0, 0).project(rig.camera);
const far = new Vector3(45, 0, 0).project(rig.camera);
assert(far.y > near.y + 0.1, "The track must converge toward the horizon");
settle({ pace: { ...runPace(22), intensity: 0 } });
const slowFov = rig.camera.fov;
const slowPosition = rig.camera.position.clone();
settle({ pace: { ...runPace(22), intensity: 1 } });
assert(rig.camera.fov > slowFov + 20, "High speed visibly expands the lens");
assert(rig.camera.position.y < slowPosition.y - 1, "High speed lowers the camera toward the track");
assert(rig.camera.position.x > slowPosition.x + 1.5, "High speed brings the chase camera closer");
assert(Math.abs(rig.camera.fov - 87) < .001, "The high-speed lens stays bounded");
settle({ paused: true });
assert.equal(rig.streaks.visible, false, "Pausing suppresses the speed streaks");
rig.reduced = true;
settle({});
const stablePosition = rig.camera.position.clone();
const stableDirection = rig.camera.getWorldDirection(new Vector3());
const stableFov = rig.camera.fov;
rig.shiftAt = rig.sparkAt = 34;
settle({ t: 34, phase: 2, pulse: 1, action: 1 });
assert(rig.camera.position.distanceTo(stablePosition) < 0.001);
assert(rig.camera.getWorldDirection(new Vector3()).distanceTo(stableDirection) < 0.001);
assert(Math.abs(rig.camera.fov - stableFov) < 0.001);
assert([...rig.streakPositions].every(Number.isFinite));
console.log("Matter Run camera: forward convergence, speed-driven chase rig and reduced-motion stability verified");
