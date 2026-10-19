export const MAX_TURN_RATE = 160; // automatic heading slew, degrees/second
export const ANGLE_STEP = 15;
const RAD = Math.PI / 180;
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
export const snapAngle = (degrees) => Number.isFinite(degrees) ? clamp(Math.round(degrees / ANGLE_STEP) * ANGLE_STEP, 0, 360) : 0;

/** Endless adjustment through 0…360; a completed positive revolution stays 360. */
export function rollAngle(degrees) {
  if (!Number.isFinite(degrees)) return 0;
  const snapped = Math.round(degrees / ANGLE_STEP) * ANGLE_STEP;
  const wrapped = ((snapped % 360) + 360) % 360;
  return wrapped || (snapped === 0 ? 0 : 360);
}

/** Keep winding continuous; neutral uses the nearest equivalent 0° so releasing
 * at 270° or after a full circle cannot make the aircraft unwind a whole lap. */
export function headingTarget(current, degrees) {
  return degrees === 0 ? Math.round(current / 360) * 360 : Math.floor((current + 1e-7) / 360) * 360 + degrees;
}
export function headingAngle(heading, selected, arrived) {
  const angle = ((heading % 360) + 360) % 360;
  return selected === 360 && arrived && angle < 1e-7 ? 360 : angle;
}

/** Mathematical heading: 0 points along +X (right), 90 along -Z (up on a map).
 * Positive angles turn counter-clockwise. Select an unwrapped heading once. The aircraft turns there, stops yaw exactly
 * on arrival, and keeps flying along that heading without further input. */
export class Flight {
  constructor() {
    this.x = 0; this.z = 0; this.heading = 0; this.targetHeading = 0;
    this.steering = 0; this.distance = 0; this.speed = 18;
  }
  setTarget(heading) { if (Number.isFinite(heading)) { this.targetHeading = heading; if (heading === this.heading) this.steering = 0; } }
  step(dt, speed = this.speed) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    this.speed = speed;
    const remaining = this.targetHeading - this.heading;
    const direction = Math.sign(remaining), turningTime = Math.min(dt, Math.abs(remaining) / MAX_TURN_RATE);
    if (turningTime > 0) {
      const start = this.heading * RAD, omega = direction * MAX_TURN_RATE * RAD;
      const end = start + omega * turningTime;
      this.x += speed * (Math.sin(end) - Math.sin(start)) / omega;
      this.z += speed * (Math.cos(end) - Math.cos(start)) / omega;
      this.heading = Math.abs(remaining) <= MAX_TURN_RATE * dt ? this.targetHeading : this.heading + direction * MAX_TURN_RATE * dt;
    }
    // Split the exact arrival frame: the remaining time is straight flight.
    const straightTime = dt - turningTime;
    this.x += Math.cos(this.heading * RAD) * speed * straightTime;
    this.z -= Math.sin(this.heading * RAD) * speed * straightTime;
    this.steering = Math.abs(this.targetHeading - this.heading) < 1e-7 ? 0 : direction;
    this.distance += speed * dt;
  }
  snapshot() { return { x: this.x, z: this.z, heading: this.heading, targetHeading: this.targetHeading, steering: this.steering, speed: this.speed, distance: this.distance }; }
}
