// Polygon Party: the chart lands on the beats, the performers keep their
// marks, and the camera always films them from outside the ring.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Timing } from "../packages/core/src/timing.js";
import { END, SECTIONS, SHAPES, chart } from "../packages/games/src/polygon/song.js";
import { STAGE_RADIUS, ShotDirector, polygonAngle, polygonPosition } from "../packages/games/src/polygon/camera.js";

const tm = new Timing(JSON.parse(readFileSync(new URL("../packages/games/src/polygon/analysis.json", import.meta.url))));
tm.setDownbeat(SECTIONS.drop);
const notes = chart(tm);
assert(Math.abs(notes[0].t - tm.beatTime(tm.dropBeat)) < 1e-9, "The first note is the drop's downbeat");
notes.forEach((n, i) => i && assert.equal(n.beat - notes[i - 1].beat, 2, "A note on every second beat"));
assert(notes.at(-1).t < END);
const edges = SHAPES.reduce((sum, s) => sum + s.sides, 0);
assert(notes.length > edges, "The song is long enough to draw every shape at least once");

for (const s of SHAPES) {
  const p = polygonPosition(s.sides);
  assert(Math.abs(Math.hypot(p.x, p.z) - STAGE_RADIUS) < 1e-9, "The performers stand in a ring");
  assert.equal(p.angle, polygonAngle(s.sides), "Each faces outward from its own mark");
}

const camera = new ShotDirector();
camera.aim(3, 0, { snap: true });
const settled = camera.sample(0.5).position.clone();
camera.aim(4, 1);
assert(camera.sample(1).position.distanceTo(settled) < 0.2, "A new subject swings from the current pose instead of teleporting");
for (const [from, to, at] of [[4, 9, 3], [9, 12, 5], [12, 3, 7]]) {
  camera.aim(from, at - 1);
  camera.aim(to, at);
  for (let t = at; t < at + camera.duration; t += 0.04) {
    const p = camera.sample(t).position;
    assert(Math.hypot(p.x, p.z) > STAGE_RADIUS + 3, "Travel goes round the outside of the ring, never across it");
  }
  const end = camera.sample(at + camera.duration + 0.01);
  const p = polygonPosition(to);
  assert(!end.moving);
  assert((end.position.x - p.x) * Math.sin(p.angle) + (end.position.z - p.z) * Math.cos(p.angle) > 5, "The shot lands in front of the performer, outside the ring");
}
for (let i = 0; i < 12; i++) {
  camera.aim(3 + (i % 10), 20 + i, { calm: true });
  assert(!["crowd", "low"].includes(camera.shot), "The cover and portrait screens keep clear of the crowd");
  camera.cut(20.5 + i);
  assert(!["crowd", "low"].includes(camera.shot));
}
camera.aim(5, 40);
assert.equal(camera.sample(40, { reducedMotion: true }).moving, false, "Reduced motion bypasses travel");
console.log("Polygon Party: chart, ring marks and outside-the-ring camera verified");
