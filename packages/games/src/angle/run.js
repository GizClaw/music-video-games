import { Flight, MAX_TURN_RATE, headingAngle, headingTarget, snapAngle } from "./motion.js";
import { gateApproach } from "./gate.js";

export const PERFECT_ANGLE = 7;
export const GOOD_ANGLE = 18;
const EPSILON = 1e-7;

/** Player input chooses a fixed heading. A new musical question changes only
 * the requested angle and scoring window, never the aircraft target. */
export class AngleRun {
  constructor(chart, start = 0) {
    // Mid-song practice starts at the next turn with enough remaining flying time.
    this.notes = chart.filter((n) => n.t - start >= n.degrees / MAX_TURN_RATE + .25).map((n) => ({ ...n, result: null }));
    this.cursor = 0; this.time = start; this.autoNote = null;
    this.score = this.combo = this.maxCombo = 0;
    this.counts = { perfect: 0, good: 0, miss: 0 };
    this.flight = new Flight(); this.selectedAngle = 0; this.selectionMade = false;
    this.history = [{ t: start, x: 0, z: 0, heading: 0 }];
    this.lastTrace = start;
    this.begin();
  }
  get next() { return this.notes[this.cursor] ?? null; }
  get multiplier() { return Math.min(4, 1 + Math.floor(this.combo / 8)); }
  get turn() { return headingAngle(this.flight.heading, this.selectedAngle, this.arrived); }
  get error() { return this.next ? Math.abs(Math.abs(this.turn) - this.next.degrees) : 0; }
  get selectionError() { return this.next ? Math.abs(Math.abs(this.selectedAngle) - this.next.degrees) : 0; }
  get arrived() { return Math.abs(this.flight.targetHeading - this.flight.heading) < .01; }
  get aligned() { return !!this.next && this.selectionMade && this.selectionError <= PERFECT_ANGLE && this.error <= PERFECT_ANGLE && this.arrived; }
  get gate() { return this.next ? gateApproach(this.next, this.flight, this.time, this) : null; }
  setAngle(degrees) {
    if (!this.next || !Number.isFinite(degrees)) return;
    const selected = snapAngle(degrees);
    if (this.selectionMade && selected === this.selectedAngle) return;
    this.selectedAngle = selected; this.selectionMade = true;
    this.flight.setTarget(headingTarget(this.flight.heading, selected));
  }
  begin() {
    if (!this.next) return;
    Object.assign(this.next, { from: this.time, startHeading: this.flight.heading, startX: this.flight.x, startZ: this.flight.z });
  }
  judge() {
    const note = this.next;
    if (!note) return null;
    const turn = this.turn, error = Math.max(this.error, this.selectionError);
    const result = this.selectionMade && this.arrived && error <= PERFECT_ANGLE + EPSILON ? "perfect" : this.selectionMade && this.arrived && error <= GOOD_ANGLE + EPSILON ? "good" : "miss";
    const gate = { ...this.gate, flightHeading: this.flight.heading, speed: this.flight.speed };
    Object.assign(note, { result, turn, selectedAngle: this.selectedAngle, error, endHeading: this.flight.heading, endX: this.flight.x, endZ: this.flight.z, gate });
    this.counts[result]++;
    if (result === "miss") this.combo = 0;
    else {
      this.combo++; this.maxCombo = Math.max(this.maxCombo, this.combo);
      this.score += (result === "perfect" ? 300 : 150) * this.multiplier;
    }
    this.cursor++; this.begin();
    return { type: result, note };
  }
  advance(t, auto = false) {
    if (!Number.isFinite(t) || t <= this.time) return [];
    const events = [];
    while (this.time < t - EPSILON) {
      const note = this.next;
      let step = Math.min(1 / 60, t - this.time, note ? Math.max(0, note.t - this.time) : Infinity);
      if (step <= EPSILON) {
        this.time = note.t; events.push(this.judge()); continue;
      }
      if (auto && note && this.autoNote !== note.id) {
        this.autoNote = note.id; this.setAngle(note.degrees);
      }
      this.flight.step(step, 18 + Math.min(1, this.combo / 24) * 9);
      this.time += step;
      if (this.time - this.lastTrace >= .04 - EPSILON) {
        this.history.push({ t: this.time, x: this.flight.x, z: this.flight.z, heading: this.flight.heading }); this.lastTrace = this.time;
        if (this.history.length > 600) this.history.shift();
      }
      if (note && this.time >= note.t - EPSILON) {
        this.time = note.t; events.push(this.judge());
      }
    }
    return events;
  }
}
