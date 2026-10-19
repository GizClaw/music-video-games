import assert from "node:assert/strict";
import { readFileSync, realpathSync } from "node:fs";
import { Timing } from "../packages/core/src/timing.js";
import { buildChart, kindOf, prepareTiming } from "../packages/games/src/angle/song.js";
import { AngleRun } from "../packages/games/src/angle/run.js";
import { Flight, MAX_TURN_RATE, rollAngle, snapAngle } from "../packages/games/src/angle/motion.js";
import * as THREE from "three";
import { createAircraft, ENGINE_PORTS } from "../packages/games/src/angle/aircraft.js";
import { targetDial } from "../packages/games/src/angle/dial.js";
import { SteeringWheel } from "../packages/games/src/angle/wheel.js";
import { gateApproach, gateDeparture, GATE_APPROACH_SPEED } from "../packages/games/src/angle/gate.js";

const close = (a, b, message) => assert(Math.abs(a - b) < 1e-7, `${message}: ${a} != ${b}`);
const path = new URL("../packages/games/src/angle/analysis.json", import.meta.url);
const data = JSON.parse(readFileSync(path));
const tm = prepareTiming(new Timing(data));
const chart = buildChart(tm);
assert.equal(realpathSync(new URL("../aigc/songs/music/stem-institute/en-us/angle-gang/game/analysis.json", import.meta.url)), realpathSync(path));
assert.deepEqual(new Set(chart.map((n) => n.kind)), new Set(["acute", "right", "obtuse", "straight", "reflex", "full"]));
for (const [deg, kind] of [[0, "zero"], [45, "acute"], [89.9, "acute"], [90, "right"], [90.1, "obtuse"], [180, "straight"], [180.1, "reflex"], [270, "reflex"], [359.9, "reflex"], [360, "full"]]) assert.equal(kindOf(deg), kind);
chart.forEach((n, i) => {
  assert(data.beats.includes(n.t), "Every checkpoint uses a detected beat");
  assert(n.t - (chart[i - 1]?.t ?? 0) > n.degrees / MAX_TURN_RATE + .25, "There is enough real time to make and finish the turn");
  assert(n.t < data.duration);
});
assert(chart[0].t < 4);
assert(tm.cues[14].words[1].start > 43.5);
assert.deepEqual(prepareTiming(new Timing(data)).cues, tm.cues, "Mounts do not mutate shared alignment data");
for (const [lo, hi, degrees] of [[90, 92, 90], [93, 95, 180], [96, 98, 270], [99, 101, 360]]) assert(chart.some((n) => n.t > lo && n.t < hi && n.degrees === degrees));

const flight = new Flight(); flight.setTarget(90);
assert.equal(flight.heading, 0, "Selecting an angle does not teleport the plane");
flight.step(90 / MAX_TURN_RATE);
const radius = flight.speed / (MAX_TURN_RATE * Math.PI / 180);
close(flight.heading, 90, "The aircraft reaches its selected angle automatically");
close(flight.x, radius, "A quarter circle moves laterally"); close(flight.z, -radius, "A quarter circle also moves forward");
const before = flight.snapshot(); flight.step(1);
close(flight.heading, 90, "The selected heading stays fixed without additional input");
close(flight.targetHeading, 90, "The target stays latched after arrival");
close(flight.x, before.x, "At 90 degrees the plane no longer moves along the rightward zero axis");
close(flight.z - before.z, -flight.speed, "At 90 degrees the plane flies up on the map");
const circle = new Flight(); circle.setTarget(-360); circle.step(360 / MAX_TURN_RATE);
close(circle.heading, -360, "A full-circle target does not collapse to zero"); close(circle.x, 0, "Full circle closes in X"); close(circle.z, 0, "Full circle closes in Z");
const coarse = new Flight(), fine = new Flight(); coarse.setTarget(135); fine.setTarget(135); coarse.step(3.25);
for (let i = 0; i < 195; i++) fine.step(1 / 60);
for (const key of ["heading", "x", "z"]) close(coarse[key], fine[key], "Arrival and subsequent straight flight are frame-rate independent");
const retarget = new Flight(); retarget.setTarget(90); retarget.step(.2); retarget.setTarget(45); retarget.step(2);
close(retarget.heading, 45, "Changing the target mid-flight reaches the new absolute target without overshoot");
retarget.setTarget(NaN); assert.equal(retarget.targetHeading, 45, "Invalid input cannot poison flight motion");
for (const degrees of [45, -45, 90, -90, 180, 270, -360, 360]) {
  const f = new Flight(); f.setTarget(degrees); f.step(5); close(f.heading, degrees, "All requested angles settle exactly");
  assert.equal(f.steering, 0, "The aircraft levels out automatically at its target");
}
assert.equal(snapAngle(43), 45); assert.equal(snapAngle(-43), 0); assert.equal(snapAngle(900), 360); assert.equal(snapAngle(-900), 0);

const model = createAircraft({
  material: (color, options) => new THREE.MeshPhysicalMaterial({ color, ...options }),
  mesh: (geometry, material, parent) => { const mesh = new THREE.Mesh(geometry, material); parent.add(mesh); return mesh; },
});
for (const degrees of [0, 45, 90, 180, 270, 360, -90]) {
  const radians = degrees * Math.PI / 180;
  model.root.rotation.y = radians - Math.PI / 2; model.root.updateMatrixWorld(true);
  const forward = new THREE.Vector3(Math.cos(radians), 0, -Math.sin(radians));
  const nose = model.nose.getWorldPosition(new THREE.Vector3());
  assert(nose.dot(forward) > 1, "The aircraft's nose leads its direction of travel");
  model.exhausts.forEach((port, i) => {
    const world = port.getWorldPosition(new THREE.Vector3());
    assert(world.dot(forward) < -1, "Engine exhausts and trails stay behind the aircraft");
    close(port.position.distanceTo(ENGINE_PORTS[i]), 0, "The renderer and aircraft share exhaust anchors");
  });
}
const materials = new Set();
model.root.traverse((m) => { m.geometry?.dispose(); if (m.material) materials.add(m.material); });
materials.forEach((m) => m.dispose());

const task = (degrees, t = 4) => [{ id: 0, t, degrees, kind: kindOf(degrees), suggested: 1 }];
for (const degrees of [45, 90, 270, 360]) {
  const run = new AngleRun(task(degrees)); run.setAngle(degrees); run.advance(3);
  close(run.turn, degrees, "One selection is enough to reach the target"); assert.equal(run.selectedAngle, degrees);
  const snapshot = run.flight.snapshot(); assert.equal(run.advance(run.time).length, 0); assert.deepEqual(run.flight.snapshot(), snapshot, "Pause freezes the plane without discarding its target");
  assert.equal(run.advance(4)[0].type, "perfect", "A latched angle passes without timing a release");
  assert.equal(run.advance(4).length, 0, "A checkpoint judges once");
}
const changed = new AngleRun(task(90)); changed.setAngle(45); changed.advance(.1); changed.setAngle(90); changed.advance(2);
close(changed.turn, 90, "Changing 45 to 90 means a total 90-degree target, not another 90-degree turn");
changed.setAngle(NaN); assert.equal(changed.selectedAngle, 90); assert.equal(changed.advance(4)[0].type, "perfect");
const wrong = new AngleRun(task(90)); wrong.setAngle(180); assert.equal(wrong.advance(4)[0].type, "miss", "Passing through 90 on the way to an incorrect target cannot count as a correct choice");
const near = new AngleRun(task(90)); near.setAngle(105); assert.equal(near.advance(4)[0].type, "good");
const zero = new AngleRun(task(360)); zero.setAngle(0); assert.equal(zero.advance(4)[0].type, "miss", "Zero is not a completed 360-degree turn");
const noChoice = new AngleRun(task(90)); assert.equal(noChoice.advance(4)[0].type, "miss", "The player must select an angle");
const late = new AngleRun(task(360)); late.advance(3.9); late.setAngle(360); assert.equal(late.advance(4)[0].type, "miss", "The aircraft still has to complete its turn before the gate");
for (const [required, chosen, result] of [[45, 45, "perfect"], [90, 105, "good"], [45, 0, "miss"], [90, 60, "miss"], [180, 0, "miss"], [360, 0, "miss"], [360, 360, "perfect"]]) {
  const approach = new AngleRun(task(required)); approach.setAngle(chosen); approach.advance(4 - .0001);
  const beforeGate = approach.gate;
  const event = approach.advance(4)[0], encounter = event.note.gate;
  assert.equal(event.type, result);
  assert(Math.hypot(encounter.x - beforeGate.x, encounter.z - beforeGate.z) < .01, "Judging preserves the approaching gate's position without snapping it onto the plane");
  const gap = Math.hypot(encounter.x - event.note.endX, encounter.z - event.note.endZ);
  if (result === "perfect") close(gap, 0, "A correct heading passes through the gate centre");
  else if (result === "good") assert(gap < 1, "A near-correct heading still fits inside the opening");
  else assert(gap > 4.8, "A wrong heading leaves a visible passing gap, including zero versus a full circle");
  const passed = gateDeparture(encounter, .5), h = encounter.flightHeading * Math.PI / 180;
  close((passed.x - encounter.x) * Math.cos(h) - (passed.z - encounter.z) * Math.sin(h), (encounter.speed - GATE_APPROACH_SPEED) * .5, "The gate keeps its encounter velocity after the beat");
  close((passed.x - encounter.x) * Math.sin(h) + (passed.z - encounter.z) * Math.cos(h), 0, "The passed gate does not slide sideways or follow later steering");
}
const corrected = new AngleRun(task(45)); corrected.advance(2.6);
assert(corrected.gate.offset > 1, "The missed flight path is visible before the checkpoint");
corrected.setAngle(45); corrected.advance(3.5);
close(corrected.gate.offset, 0, "Correcting in time brings the gate back into the flight path");
assert.equal(corrected.advance(4)[0].type, "perfect");
const guideFlight = { x: 14, z: 20, heading: 45 };
const firstGuide = gateApproach(task(90)[0], guideFlight, 3, { turn: 45, selectedAngle: 45 });
const translatedGuide = gateApproach(task(90)[0], { ...guideFlight, x: 114, z: -30 }, 3, { turn: 45, selectedAngle: 45 });
close(translatedGuide.x - firstGuide.x, 100, "An upcoming guide inherits aircraft translation");
close(translatedGuide.z - firstGuide.z, -50, "Turning cannot strand the guide at an old world position");
const next = new AngleRun([...task(45), { id: 1, t: 8, degrees: 90, kind: "right", suggested: 1 }]);
next.setAngle(45); next.advance(4);
close(next.flight.heading, 45, "A new question preserves the previous heading");
assert.equal(next.selectedAngle, 45, "A new question preserves the user's selection");
close(next.flight.targetHeading, 45, "The next question cannot command an extra turn");
next.setAngle(90); next.advance(8); close(next.flight.heading, 90, "90 degrees is always the same target heading, across questions"); assert.equal(next.counts.perfect, 2);
const steady = new AngleRun([...task(45), { id: 1, t: 8, degrees: 90, kind: "right" }, { id: 2, t: 12, degrees: 45, kind: "acute" }]);
steady.setAngle(45); steady.advance(4); steady.advance(8);
close(steady.flight.heading, 45, "Changing the requested angle alone cannot turn the aircraft");
close(steady.flight.targetHeading, 45, "The old angle is not added again at a new question");
steady.setAngle(45); steady.advance(12);
close(steady.flight.heading, 45, "Repeating an unchanged setting never issues another relative turn");
assert.equal(steady.counts.perfect, 2); assert.equal(steady.counts.miss, 1);
const untouched = new AngleRun(chart); untouched.advance(data.duration);
assert.equal(untouched.flight.heading, 0, "With no wheel input, the aircraft holds its starting heading for the whole song");
assert.equal(untouched.flight.targetHeading, 0); assert.equal(untouched.selectedAngle, 0);
const unfinished = new AngleRun([...task(360), { id: 1, t: 8, degrees: 90, kind: "right" }]);
unfinished.advance(3.9); unfinished.setAngle(360); unfinished.advance(4.1);
assert.equal(unfinished.flight.targetHeading, 360, "A new question must not cancel a player-commanded turn still in progress");
unfinished.advance(6.5); assert.equal(unfinished.flight.heading, 360);
for (const degrees of [45, 270, 360]) {
  const release = new AngleRun(task(degrees, 12)); release.setAngle(degrees); release.advance(3);
  const heading = release.flight.heading; release.setAngle(0);
  assert(Math.abs(release.flight.targetHeading - heading) <= 180, "Release returns to the nearest neutral heading instead of unwinding full laps");
  release.advance(5); close(release.turn, 0, "The aircraft displays zero after returning to neutral");
  assert.equal(release.selectedAngle, 0);
}
for (const [degrees, x, y] of [[0, 1, 0], [90, 0, -1], [180, -1, 0], [270, 0, 1], [360, 1, 0]]) {
  const dial = targetDial(degrees, degrees), radians = dial.rotation * Math.PI / 180;
  close(Math.cos(radians), x, "Dial pointer agrees with the fixed mathematical horizontal axis");
  close(Math.sin(radians), y, "Dial pointer agrees with the fixed mathematical vertical axis");
  close(dial.targetRotation, dial.rotation, "Selected and required markers meet at the correct angle");
  const f = new Flight(); f.setTarget(degrees); f.step(3);
  const at = f.snapshot(); f.step(1);
  close((f.x - at.x) / f.speed, x, "Plane direction and the dial's horizontal direction agree");
  close((f.z - at.z) / f.speed, y, "Plane direction and the dial's vertical direction agree");
}
assert.equal(targetDial(360, 360).rotation, -360); assert.equal(targetDial(0, 360).rotation, 0);
close(targetDial(45, 45).labelX - 120, 120 - targetDial(45, 45).labelY, "The target label follows the 45-degree mark and stays upright");

// Exercise the real controller: only the final release commands neutral.
// Questions and spring animation must not emit extra input commands.
class WheelElement extends EventTarget {
  constructor() { super(); this.attributes = {}; this.face = { style: {} }; this.classList = { add() {}, remove() {} }; }
  querySelector() { return this.face; }
  getBoundingClientRect() { return { x: 0, y: 0, width: 240, height: 240 }; }
  getAttribute(name) { return this.attributes[name]; }
  setAttribute(name, value) { this.attributes[name] = value; }
  focus() {}
  setPointerCapture(id) { this.capture = id; }
  hasPointerCapture(id) { return this.capture === id; }
  releasePointerCapture() { this.capture = null; }
}
const element = new WheelElement(), abort = new AbortController(), inputs = [];
let chosen = 0;
const controlledFlight = new Flight();
const wheel = new SteeringWheel(element, { signal: abort.signal, onInput: (degrees, relative = false) => {
  chosen = relative ? rollAngle(chosen + degrees) : snapAngle(degrees); inputs.push(chosen); controlledFlight.setTarget(chosen); wheel.draw(chosen, 0);
} });
const pointer = (type, x, y) => { const e = new Event(type, { cancelable: true }); Object.assign(e, { clientX: x, clientY: y, pointerId: 1, isPrimary: true, button: 0 }); element.dispatchEvent(e); };
const settle = () => { for (let i = 0; i < 90; i++) wheel.draw(chosen, 1 / 60); };
pointer("pointerdown", 220, 120); pointer("pointermove", 190, 50);
assert.equal(chosen, 45); close(wheel.rotation, 45, "The rim follows the hand while held"); assert.equal(element.face.style.transform, "rotate(-45deg)");
controlledFlight.step(1); assert.equal(controlledFlight.heading, 45, "Holding 45 reaches and keeps the commanded heading");
pointer("pointerup", 280, 20);
assert.equal(chosen, 0); assert.equal(controlledFlight.targetHeading, 0, "Releasing commands the aircraft back to zero");
assert.equal(controlledFlight.heading, 45, "Release changes the target without teleporting the aircraft");
controlledFlight.step(.1); assert(controlledFlight.heading > 0 && controlledFlight.heading < 45, "The aircraft turns back smoothly");
controlledFlight.step(1); assert.equal(controlledFlight.heading, 0);
const beforeSpring = wheel.rotation; wheel.draw(chosen, 1 / 60);
assert(wheel.rotation > 0 && wheel.rotation < beforeSpring, "Release starts a smooth return instead of snapping");
settle(); assert.equal(element.face.style.transform, "rotate(0deg)"); assert.equal(chosen, 0); assert.equal(wheel.readout, 0, "The central numeric readout returns to zero with the rim");
assert.equal(element.getAttribute("aria-valuenow"), "0");
wheel.release(); assert.deepEqual(inputs, [45, 0], "A release sends one neutral command; spring frames and redundant releases send none");

pointer("pointerdown", 220, 120); pointer("pointermove", 120, 20);
close(wheel.rotation, 90, "A new grab starts from the rim's resting position"); assert.equal(chosen, 90, "The previous 45-degree choice must not be added to a fresh 90-degree turn");
const heldRun = new AngleRun([...task(90), { id: 1, t: 8, degrees: 180, kind: "straight" }]);
heldRun.setAngle(chosen); heldRun.advance(4);
assert.equal(heldRun.selectedAngle, 90, "A held wheel keeps its selected angle at the checkpoint boundary");
chosen = heldRun.selectedAngle; wheel.draw(chosen, 2);
assert.equal(wheel.pointer, 1, "A new checkpoint must not release pointer capture");
close(wheel.rotation, 90, "The rim stays under the hand across a checkpoint");
pointer("pointermove", 20, 120);
assert.equal(chosen, 180, "Continuing the same drag measures the rim angle without resetting or accumulating the previous question");
for (let lap = 0; lap < 2; lap++) for (const [x, y] of [[120, 220], [220, 120], [120, 20], [20, 120]]) pointer("pointermove", x, y);
close(wheel.rotation, 900, "Holding permits multiple uninterrupted revolutions"); assert.equal(chosen, 180, "The selected angle wraps while the physical rim keeps rolling");
pointer("pointerup", 20, 120);
assert(Math.abs(wheel.restRotation - wheel.rotation) <= 180, "Return uses the nearest neutral orientation, not several reverse revolutions");
settle(); assert.equal(wheel.rotation, 0); assert.equal(chosen, 0); assert.equal(wheel.readout, 0);
pointer("pointerdown", 220, 120); pointer("pointermove", 190, 50);
assert.equal(chosen, 45, "After returning to centre, another 45-degree drag selects 45, not the old target plus 45");
pointer("pointerup", 190, 50); settle(); assert.equal(chosen, 0);
assert.equal(rollAngle(375), 15); assert.equal(rollAngle(-15), 345); assert.equal(rollAngle(720), 360);

wheel.turnKey("arrowright", 15); wheel.draw(chosen, 1);
assert.equal(wheel.rotation, 15, "Holding a key retains the turned rim");
pointer("pointerdown", 220, 120); pointer("pointermove", 190, 50); wheel.releaseKey("arrowright");
wheel.draw(chosen, 1); close(wheel.rotation, 60, "Key-up cannot recenter while the pointer is still held");
const cancelledTarget = chosen; pointer("pointercancel", 190, 50); settle();
assert.equal(wheel.rotation, 0); assert(cancelledTarget > 0); assert.equal(chosen, 0, "Cancellation commands neutral flight as well as recentering the rim");
pointer("pointerdown", 190, 50); pointer("pointerup", 190, 50);
assert.equal(chosen, 0, "A stationary press and release cannot leave a latched turn command");
wheel.turnKey("arrowleft", -15); wheel.releaseKey("arrowleft"); wheel.draw(chosen, 0, true);
assert.equal(wheel.rotation, 0, "Reduced motion recentres immediately"); assert.equal(chosen, 0); assert.equal(wheel.readout, 0);
wheel.turnKey("end", 360); wheel.draw(360, 0); assert.equal(wheel.readout, 360);
wheel.releaseKey("end"); wheel.draw(chosen, 0, true); assert.equal(wheel.readout, 0, "Releasing a complete revolution displays zero, not 360");
abort.abort(); assert.equal(wheel.held, false);
const demo = new AngleRun(chart); assert.equal(demo.advance(data.duration, true).length, chart.length); assert.equal(demo.counts.perfect, chart.length); assert.equal(demo.next, null); assert.equal(demo.multiplier, 4); assert(demo.history.length <= 600);
const practice = new AngleRun(chart, 89); assert(practice.notes.every((n) => n.t - 89 >= n.degrees / MAX_TURN_RATE + .25)); assert.equal(practice.advance(89).length, 0);
console.log(`Angle Gang: ${chart.length} target selections, moving gates with continuous hit/miss flight paths, continuous held rotation, release-only recentering, automatic arrival/hold, retargeting, full circles, pause, scoring and practice verified`);
