import * as THREE from "three";
import { clamp } from "@gizclaw/mvg-core/timing.js";

export const STAGE_RADIUS = 6.2;
/** The performers stand in a ring, each facing outward from the centre. */
export const polygonAngle = (sides) => ((sides - 3) / 10) * Math.PI * 2;
export const polygonPosition = (sides) => {
  const angle = polygonAngle(sides);
  return { x: Math.sin(angle) * STAGE_RADIUS, y: 1.05, z: Math.cos(angle) * STAGE_RADIUS, angle };
};

const smoothstep = (x) => x * x * (3 - 2 * x);
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
/** Rises quickly then settles: a move that keeps drifting through a long hold. */
const drift = (s, rate = 0.22) => 1 - Math.exp(-s * rate);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Broadcast shots of one performer, `s` seconds into the shot. Offsets are
 * in the performer's own frame: [right, up, out], where out points away from
 * the centre, so every shot looks at the performer's face from outside the
 * ring. `side` (±1) is the way the camera travelled round, so a move carries
 * on through the cut. fov is vertical degrees.
 */
const SHOTS = {
  push: (s, side) => ({ offset: [side * 0.8, 0.9, 11.6 - 2.6 * drift(s)], look: [0, 0.25, 0], fov: 38 }),
  quarter: (s, side) => {
    const yaw = side * (0.6 - 0.26 * drift(s));
    return { offset: [Math.sin(yaw) * 10.4, 1.6, Math.cos(yaw) * 10.4], look: [-side * 0.35, 0.2, 0], fov: 37 };
  },
  low: (s, side) => ({ offset: [side * 1.8, -0.5, 9.4 - 1.2 * drift(s)], look: [0, 0.8, 0], fov: 42 }),
  crane: (s, side) => ({ offset: [side * 1.3, 6.4 - 4.2 * drift(s, 0.35), 11.4 - 1.8 * drift(s, 0.35)], look: [0, 0.15, 0], fov: 40 }),
  arc: (s, side) => {
    const yaw = side * (0.58 - 1.16 * smoothstep(clamp(s / 7, 0, 1)));
    return { offset: [Math.sin(yaw) * 10.6, 1.2, Math.cos(yaw) * 10.6], look: [0, 0.25, 0], fov: 38 };
  },
  crowd: (s, side) => ({ offset: [side * (3.2 - 0.8 * drift(s)), 1.1, 19.5], look: [0, 0.3, 0], fov: 23 }),
};
const SEQUENCES = {
  verse: ["push", "quarter", "low", "arc", "crane", "crowd"],
  chorus: ["quarter", "crowd", "low", "push", "arc", "crane"],
  bridge: ["crane", "arc", "push", "crowd", "quarter", "low"],
  outro: ["low", "crowd", "arc", "crane", "push", "quarter"],
};
/** Shots that look past the crowd; the cover's demo and portrait screens leave them out. */
const CROWDED = new Set(["crowd", "low"]);
/** Seconds a whole-ring shot opens a chorus before the camera swoops in. */
const WIDE_HOLD = 1.6;

const v = () => new THREE.Vector3();
/** Point at (right, up, out) in the frame of a performer at p facing outward along angle a. */
function local(p, a, [r, u, o], out) {
  return out.set(p.x + Math.cos(a) * r + Math.sin(a) * o, p.y + u, p.z - Math.sin(a) * r + Math.cos(a) * o);
}
/** A world point as (angle round the centre, distance from the centre axis, height). */
const polar = (p) => [Math.atan2(p.x, p.z), Math.hypot(p.x, p.z), p.y];
const fromPolar = (a, r, y, out) => out.set(Math.sin(a) * r, y, Math.cos(a) * r);

/**
 * The camera director. The camera always stays outside the ring: a new
 * subject gets a swing around the outside to stand in front of it (the pan
 * leads, the dolly follows on a rising arc with a little roll) that lands as
 * a beat. Choruses open on the whole ring and cut between angles every bar.
 * Hits punch in; a completed shape punches harder. Performers never turn.
 */
export class ShotDirector {
  constructor() {
    this.sides = null;
    this.shot = null;
    this.side = 1;
    this.count = 0;
    this.calm = false;
    this.shotAt = 0;
    this.moveAt = -100;
    this.duration = 0.8;
    this.from = { pos: [0, 0, 0], look: [0, 0, 0], fov: 40 };
    this.punchAt = -100;
    this.punch = 0;
    this.wideUntil = -100;
    this.pose = { position: v(), target: v(), fov: 40, roll: 0, moving: false, progress: 1 };
    this.shotPose = { position: v(), target: v(), fov: 40 };
    this.widePose = { position: v(), target: v(), fov: 40 };
    this.tmp = { p: v() };
  }

  /** Point the show at `sides`. The camera starts its swing from wherever it is now. */
  aim(sides, t, { snap = false, phase = "verse", wide = false, calm = false } = {}) {
    if (sides === this.sides && !snap) return;
    const delta = this.sides == null ? 0 : wrap(polygonAngle(sides) - polygonAngle(this.sides));
    this.side = delta < 0 ? -1 : 1;
    this.calm = calm;
    const sequence = (SEQUENCES[phase] ?? SEQUENCES.verse).filter((s) => !calm || !CROWDED.has(s));
    this.shot = sequence[this.count++ % sequence.length];
    this.from = { pos: polar(this.pose.position), look: polar(this.pose.target), fov: this.pose.fov };
    this.duration = snap ? 0 : clamp(0.62 + Math.abs(delta) * 0.25, 0.66, 1.15);
    this.moveAt = t;
    this.shotAt = t;
    this.sides = sides;
    if (wide) this.openWide(t);
  }

  /** Cut to the next angle on the same performer, as a broadcast does on the bar. */
  cut(t, phase = "chorus") {
    const sequence = (SEQUENCES[phase] ?? SEQUENCES.chorus).filter((s) => !this.calm || !CROWDED.has(s));
    this.shot = sequence[this.count++ % sequence.length];
    this.side = -this.side;
    this.shotAt = t;
    this.moveAt = -100;
  }

  /** Open on the whole ring, then swoop back into the current shot. */
  openWide(t) {
    this.wideUntil = t + WIDE_HOLD;
  }

  hit(t, strength = 1) {
    this.punchAt = t;
    this.punch = strength;
  }

  /** Where the camera frames `sides`' shot at t, before any swing or punch. */
  frame(sides, t, aspect, out) {
    const p = polygonPosition(sides);
    const shot = SHOTS[this.shot ?? "push"](Math.max(0, t - this.shotAt), this.side);
    // Narrow screens keep the whole polygon and a margin across the width.
    const reach = 2.6 / (Math.tan(THREE.MathUtils.degToRad(shot.fov / 2)) * Math.min(aspect, 1.6));
    const length = Math.hypot(...shot.offset);
    const k = length < reach ? reach / length : 1;
    local(p, p.angle, shot.offset.map((x) => x * k), out.position);
    local(p, p.angle, shot.look, out.target);
    out.fov = shot.fov;
    return out;
  }

  /** The whole ring, from high up outside the subject. */
  wide(sides, aspect, out) {
    const p = polygonPosition(sides);
    fromPolar(p.angle, aspect < 1 ? 34 : 24, aspect < 1 ? 14 : 10, out.position);
    out.target.set(p.x * 0.35, 0.8, p.z * 0.35);
    out.fov = aspect < 1 ? 46 : 40;
    return out;
  }

  sample(t, { aspect = 16 / 9, beat = 0, pulse = 0, reducedMotion = false, demo = false } = {}) {
    const pose = this.pose;
    const motion = reducedMotion ? 0 : 1;
    const shot = this.frame(this.sides ?? 3, t, aspect, this.shotPose);
    if (motion && t < this.wideUntil) {
      const wide = this.wide(this.sides ?? 3, aspect, this.widePose);
      const w = smoothstep(clamp((this.wideUntil - t) / 0.45, 0, 1));
      shot.position.lerp(wide.position, w);
      shot.target.lerp(wide.target, w);
      shot.fov += (wide.fov - shot.fov) * w;
    }
    const u = motion && this.duration > 0 ? clamp((t - this.moveAt) / this.duration, 0, 1) : 1;
    const moving = u < 1;
    pose.position.copy(shot.position);
    pose.target.copy(shot.target);
    pose.fov = shot.fov;
    pose.roll = 0;
    if (moving) {
      // Round the outside of the ring, never across it: interpolate around
      // the centre. The pan leads and the dolly catches up, a swing.
      const pan = 1 - (1 - u) ** 3;
      const dolly = ease(u);
      const arc = Math.sin(Math.PI * u);
      const [a1, r1, y1] = polar(shot.position);
      const [a0, r0, y0] = this.from.pos;
      fromPolar(a0 + wrap(a1 - a0) * dolly, r0 + (r1 - r0) * dolly + arc * 2.2, y0 + (y1 - y0) * dolly + arc * 1.3, pose.position);
      const [b1, s1, h1] = polar(shot.target);
      const [b0, s0, h0] = this.from.look;
      fromPolar(b0 + wrap(b1 - b0) * pan, s0 + (s1 - s0) * pan, h0 + (h1 - h0) * pan, pose.target);
      pose.fov = this.from.fov + (shot.fov - this.from.fov) * dolly + arc * 7;
      pose.roll = -this.side * arc * 0.08;
    }
    // A steadicam breathes; the shot bounces with the chorus.
    const sway = motion * (demo ? 0.6 : 1);
    pose.position.x += (Math.sin(t * 0.83) * 0.05 + Math.sin(t * 1.91) * 0.025) * sway;
    pose.position.y += (Math.sin(t * 1.17 + 1) * 0.04 + pulse * 0.05) * sway;
    pose.target.x += Math.sin(t * 0.61 + 2) * 0.03 * sway;
    pose.roll += Math.sin(t * 0.47) * 0.006 * sway + Math.sin(beat * Math.PI) * 0.004 * sway;
    // Hits punch toward the subject and squeeze the lens.
    const punch = motion * this.punch * Math.exp(-Math.max(0, t - this.punchAt) / 0.14) * (t >= this.punchAt ? 1 : 0);
    if (punch > 0.001) {
      const toward = this.tmp.p.subVectors(pose.target, pose.position).normalize();
      pose.position.addScaledVector(toward, punch * 0.55);
      pose.fov -= punch * 5;
      pose.roll += punch * this.side * 0.025;
    }
    pose.moving = moving;
    pose.progress = u;
    return pose;
  }
}
