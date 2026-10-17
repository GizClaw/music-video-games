/** Music time stays at its original tempo. Track distance integrates the
 * runner's independent speed changes against that unmodified clock. */
export const RUN_PACE = { minimum: 16, start: 36, maximum: 52, sightline: 76, missLoss: 6 };
const intensityAt = (speed) => Math.max(0, Math.min(1,
  (speed - RUN_PACE.minimum) / (RUN_PACE.maximum - RUN_PACE.minimum)));
export const speedBonus = (speed) => 1 + intensityAt(speed) * 2;

/** Speed is the life resource. Clears accelerate, a growing combo adds more
 * thrust, and missed gates remove speed. Reaching the floor ends the run. */
export class AdaptivePace {
  constructor() { this.reset(); }

  reset(from = 0) {
    this.speed = RUN_PACE.start;
    this.streak = 0;
    this.segments = [{ at: from, distance: from * RUN_PACE.start, speed: this.speed }];
  }

  get reserve() { return intensityAt(this.speed); }
  get failed() { return this.speed <= RUN_PACE.minimum; }

  resolve(result, at = this.segments.at(-1).at) {
    if (this.failed) return 0;
    at = Math.max(at, this.segments.at(-1).at);
    const distance = this.at(at).distance;
    const before = this.speed;
    if (result === "miss") {
      this.streak = 0;
      this.speed = Math.max(RUN_PACE.minimum, this.speed - RUN_PACE.missLoss);
    } else {
      this.streak++;
      this.speed = Math.min(RUN_PACE.maximum, this.speed + 1 + Math.min(10, this.streak) * .15);
    }
    this.speed = Math.round(this.speed * 100) / 100;
    if (this.speed !== before) this.segments.push({ at, distance, speed: this.speed });
    return Math.sign(this.speed - before);
  }

  at(t) {
    const segment = this.segments.findLast((s) => s.at <= t) ?? this.segments[0];
    return { speed: segment.speed, distance: segment.distance + Math.max(0, t - segment.at) * segment.speed,
      streak: this.streak, bonus: speedBonus(segment.speed), intensity: intensityAt(segment.speed), failed: this.failed };
  }
}

export function runPace(t) {
  return { speed: RUN_PACE.start, distance: Math.max(0, t) * RUN_PACE.start,
    intensity: intensityAt(RUN_PACE.start) };
}

/** Gate density only increases; a later verse never slows the challenge. */
export const gateBeatStep = (t) => t < 31.95 ? 4 : t < 60.15 ? 3 : 2;

/** Passed gates stay ahead of the near plane for the late-action grace period. */
export const gateOffset = (distance) => distance >= 0 ? distance : -6 * (1 - Math.exp(distance / 6));

/** Lock a gate's approach speed once it enters view. Later gates use the new
 * running speed, but visible gates never jump or move off their musical beat. */
export function gateApproaches(notes, t, speed) {
  const visible = [];
  let previousDistance = -Infinity;
  for (const note of notes) {
    const remaining = note.t - t;
    if (remaining < -.4) continue;
    if (note.approachSpeed === undefined) {
      const distance = remaining * speed;
      // Reveal in chart order, with separation even during a large slowdown.
      if (distance > RUN_PACE.sightline || distance < previousDistance + 4) break;
      note.approachSpeed = speed;
    }
    const distance = remaining * note.approachSpeed;
    visible.push({ note, distance });
    previousDistance = distance;
  }
  return visible;
}
