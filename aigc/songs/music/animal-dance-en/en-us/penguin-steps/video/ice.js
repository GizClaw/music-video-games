import * as THREE from "three";
import { makeRibbon } from "@gizclaw/mvg-core/fx.js";
import { FONT_COND, SAFE } from "@gizclaw/mvg-core/hud.js";
import { clamp, easeInOut, easeOutBack, easeOutCubic, hash, lerp, smooth } from "@gizclaw/mvg-core/timing.js";
import { Penguin } from "./penguin.js";
import { makeBeams, makeBergs, makeBird, makeLamps, makeSea, makeSky, makeSnow, makeStage, Sparks } from "./world.js";
import { CHICK, CHORUSES, COLORS, CREW, LAMP_HUES, SECTIONS, SIDE_SLOTS, SLOTS, STAGE_R, TITLE } from "./constants.js";

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const N = SLOTS.length;
const LAMPS = 12;
const RING = SLOTS.map((_, i) => (i === 0 ? [0, 0.4] : [Math.sin(((i - 0.5) / 12) * Math.PI * 2) * 2.8, 0.2 + Math.cos(((i - 0.5) / 12) * Math.PI * 2) * 2.8]));

const bump = (t, t0, d) => (t > t0 && t < t0 + d ? Math.sin((Math.PI * (t - t0)) / d) : 0);
const decay = (t, t0, tau) => (t >= t0 ? Math.exp(-(t - t0) / tau) : 0);
const win = (t, a, b, f = 0.2) => smooth(a - f, a, t) * (1 - smooth(b, b + f, t));
const hueOf = (hex) => new THREE.Color(hex).getHSL({}).h;

export class IceScene {
  constructor(ctx) {
    this.ctx = ctx;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#3a4fa0");
    this.camera = new THREE.PerspectiveCamera(42, 9 / 16, 0.05, 700);

    this.sky = makeSky();
    this.stage = makeStage();
    this.sea = makeSea();
    this.bergs = makeBergs();
    this.lamps = makeLamps(LAMPS, STAGE_R - 0.55);
    this.snow = makeSnow();
    this.sparks = new Sparks();
    this.beams = makeBeams(5);
    this.birds = [0, 1, 2].map(() => makeBird());
    this.scene.add(this.sky.mesh, this.stage.group, this.sea.mesh, this.bergs.group, this.lamps.group, this.snow.points, this.sparks.points);
    this.beams.forEach((b) => this.scene.add(b));
    this.birds.forEach((b) => this.scene.add(b.group));

    this.hemi = new THREE.HemisphereLight("#e4eeff", "#8a9cc8", 1.0);
    this.moon = new THREE.DirectionalLight("#fff6ea", 1.4);
    this.moon.position.set(-2.5, 5, 7);
    this.rim = new THREE.DirectionalLight("#bff6ff", 0.8);
    this.rim.position.set(1, 3, -6);
    this.discoA = new THREE.PointLight("#ff4fd8", 0, 0, 0);
    this.discoB = new THREE.PointLight("#3de8ff", 0, 0, 0);
    this.scene.add(this.hemi, this.moon, this.rim, this.discoA, this.discoB);

    this.penguins = SLOTS.map((_, i) => {
      const p = new Penguin({ bow: i === 0, chick: i === CHICK, scale: i === 0 ? 1.06 : i === CHICK ? 0.66 : 0.86 + hash(i * 3.1) * 0.14 });
      this.scene.add(p.group);
      return p;
    });

    this.rings = [0, 1, 2].map(() => {
      const r = makeRibbon({ segments: 96, width: 0.018, color: COLORS.hey, uniforms: { uR: { value: 0.2 } }, path: `float a = (u - 0.5) * 2.2; return vec3(sin(a) * uR, cos(a) * uR, 0.0);` });
      r.material.uniforms.uOpacity.value = 0;
      this.scene.add(r);
      return r;
    });

    this.buildEvents(ctx.timing);
  }

  buildEvents(timing) {
    const cues = timing.cues;
    const w = (ci, k) => cues[ci].words[k].start;
    const beatsIn = (a, b) => {
      const out = [];
      for (let i = timing.beatIndexAt(a - 0.06) + 1; timing.beatTime(i) <= b + 0.06; i++) out.push(timing.beatTime(i));
      return out;
    };
    this.dropBeat = timing.beatIndexAt(SECTIONS.drop + 0.01);
    this.lampOn = this.lamps.lamps.map((_, i) => timing.beatTime(this.dropBeat + Math.floor(Math.abs(i - (LAMPS - 1) / 2) / 1)));
    this.entry = SLOTS.map((_, i) => {
      if (i < CREW.open) return timing.beatTime(this.dropBeat + 3 + i);
      if (i < CREW.chorus2) return timing.beatTime(timing.beatIndexAt(SECTIONS.chorus2 - 0.4) + (i - CREW.open));
      return timing.beatTime(timing.beatIndexAt(SECTIONS.dance + 0.01) + (i - CREW.chorus2));
    });
    this.v1 = {
      feathered: w(2, 3), call: w(3, 2), can: w(3, 4), heard: w(3, 6),
      back: w(4, 0), belly: w(4, 2), suit: w(4, 4),
      legs: cues[5].start, shuffle: w(5, 2), step: w(5, 3), scoot: w(5, 5),
      cannot: cues[6].start, fly: w(6, 2), air: w(6, 4),
      wings: cues[7].start, useful: w(7, 4), there: w(7, 5),
    };
    this.choruses = {};
    const ends = { chorus1: SECTIONS.dive, chorus2: SECTIONS.bridge, chorus3: SECTIONS.outro };
    for (const [name, b] of Object.entries(CHORUSES)) {
      this.choruses[name] = {
        name,
        start: SECTIONS[name],
        end: ends[name],
        steps: [0, 1, 2, 3].map((k) => w(b, k)),
        crew: w(b, 4),
        clap0: w(b + 1, 0),
        clapEnd: cues[b + 1].end,
        claps: beatsIn(w(b + 1, 0), w(b + 1, 5)),
        wad0: w(b + 2, 0), left: w(b + 2, 1), right: w(b + 2, 4), wadEnd: cues[b + 2].end,
        flap0: w(b + 3, 0), flash: [w(b + 3, 3), w(b + 3, 4)], bright: w(b + 3, 5),
        hey: [w(b + 4, 0), w(b + 4, 1)], own: w(b + 4, 2), night: w(b + 4, 5), heyEnd: cues[b + 4].end,
      };
    }
    this.v2 = {
      pretend: cues[15].start, small: cues[16].start, feet: cues[17].start, floor: w(17, 5),
      slow: cues[18].start, steps: [w(18, 1), w(18, 2), w(18, 5), w(18, 6)],
    };
    this.br = { birds: cues[24].start, fly: w(24, 5), freeze: w(26, 0), sway: w(26, 4), stop: w(27, 0), away: w(27, 4) };
    this.danceBeats = beatsIn(SECTIONS.dance, SECTIONS.chorus3 - 0.1);
    this.out = { dim: w(33, 0), dimEnd: w(33, 2) + 0.3, stand: w(33, 3), party: w(34, 0), grand: w(34, 4) };
  }

  /** Crew slots at time t, blended between formations, with how hard each penguin is walking. */
  formation(t) {
    const keys = [[0, SLOTS, 0], [SECTIONS.verse1, SIDE_SLOTS, 1.4], [30.9, SLOTS, 1.2], [SECTIONS.dance, RING, 1.0], [SECTIONS.chorus3 + 0.2, SLOTS, 1.0]];
    let k = 0;
    for (let i = 0; i < keys.length; i++) if (t >= keys[i][0]) k = i;
    const [t0, to, dur] = keys[k];
    const from = keys[Math.max(0, k - 1)][1];
    const u = dur > 0 ? clamp((t - t0) / dur, 0, 1) : 1;
    const e = easeInOut(u);
    const walking = u > 0 && u < 1 ? 1 : 0;
    return to.map((s, i) => ({ x: lerp(from[i][0], s[0], e), z: lerp(from[i][1], s[1], e), walk: walking * Math.min(1, Math.hypot(from[i][0] - s[0], from[i][1] - s[1]) * 2) }));
  }

  visible(i, t) {
    return t >= this.entry[i] - 0.05;
  }

  groove(p, t, i, amt) {
    const bf = this.ctx.timing.beatFloat(t) - i * 0.015;
    const s = Math.sin(Math.PI * bf);
    p.hop += amt * 0.06 * Math.abs(s);
    p.tilt += amt * 0.1 * s;
    p.flapL += amt * 0.25 * Math.abs(s);
    p.flapR += amt * 0.25 * Math.abs(s);
    p.nod += amt * 0.07 * Math.cos(Math.PI * bf * 2);
  }

  walkCycle(p, t, amt) {
    if (amt <= 0) return;
    const ph = t * 10;
    p.tilt += amt * 0.18 * Math.sin(ph);
    p.stepL = Math.max(p.stepL, amt * 0.7 * Math.max(0, Math.sin(ph)));
    p.stepR = Math.max(p.stepR, amt * 0.7 * Math.max(0, -Math.sin(ph)));
    p.flapL += amt * 0.25;
    p.flapR += amt * 0.25;
  }

  /** Belly slide onto the stage from offstage, then a hop up onto the feet. */
  slideIn(p, t, i, target) {
    const te = this.entry[i];
    const arrive = te + 0.85;
    if (t >= arrive + 0.35) return;
    const side = target.x === 0 ? 0 : Math.sign(target.x);
    const start = side === 0 ? [0, -9] : [side * 9, target.z - 2];
    const u = easeOutCubic((t - te) / 0.85);
    p.x = lerp(start[0], target.x, u);
    p.z = lerp(start[1], target.z, u);
    const travel = Math.atan2(target.x - start[0], target.z - start[1]);
    const stand = smooth(arrive, arrive + 0.3, t);
    p.yaw = lerp(travel, 0, stand);
    p.lean = lerp(1.35, 0, stand);
    p.hop = 0.28 * (1 - stand) + 0.3 * bump(t, arrive, 0.35);
    p.flapL = p.flapR = lerp(0.35, 0.12, stand);
    p.fwdL = p.fwdR = lerp(-0.7, 0, stand);
  }

  chorusPose(c, p, t, i) {
    const timing = this.ctx.timing;
    const bf = timing.beatFloat(t);
    const delay = i * 0.025;
    // Steps: alternate feet, stomp on the word.
    c.steps.forEach((s, k) => {
      const lift = bump(t, s - 0.18, 0.24);
      if (k % 2) p.stepR = Math.max(p.stepR, lift);
      else p.stepL = Math.max(p.stepL, lift);
      p.tilt += (k % 2 ? -1 : 1) * 0.14 * bump(t, s - 0.18, 0.4);
      p.squash += 0.5 * decay(t, s + 0.04, 0.08);
      p.flapL += 0.5 * bump(t, s - 0.18, 0.4);
      p.flapR += 0.5 * bump(t, s - 0.18, 0.4);
    });
    // Crew: a staggered jump with flippers up.
    const h = bump(t, c.crew - 0.08 + delay, 0.46);
    p.hop += 0.5 * h;
    p.flapL += 1.4 * h;
    p.flapR += 1.4 * h;
    p.squash += 0.5 * decay(t, c.crew + 0.38 + delay, 0.1) - 0.3 * h;
    // Clap on every beat of the clap line.
    const ca = win(t, c.clap0 - 0.25, c.clapEnd, 0.25);
    if (ca > 0) {
      let hit = 0;
      for (const ct of c.claps) hit = Math.max(hit, Math.exp(-(((t - ct) / 0.07) ** 2)));
      p.fwdL += 1.2 * ca;
      p.fwdR += 1.2 * ca;
      p.inL += ca * (0.05 + 0.55 * hit);
      p.inR += ca * (0.05 + 0.55 * hit);
      p.hop += 0.05 * hit;
      p.nod += 0.12 * hit;
    }
    // Waddle left, then right, then home.
    const wa = win(t, c.wad0 - 0.1, c.wadEnd + 0.2, 0.2);
    if (wa > 0) {
      const toL = easeInOut((t - c.wad0 + 0.1) / (c.left + 0.25 - c.wad0));
      const toR = easeInOut((t - c.left - 0.25) / (c.right + 0.2 - c.left - 0.25));
      const home = easeInOut((t - c.wadEnd) / 0.6);
      p.x += lerp(lerp(-0.95 * toL, 0.95, toR), 0, home);
      p.yaw += (t < c.left + 0.25 ? -0.5 * toL : lerp(-0.5, 0.5, smooth(c.left + 0.2, c.left + 0.5, t)) * (1 - home)) * wa;
      const s = Math.sin(Math.PI * bf);
      p.tilt += 0.26 * s * wa;
      p.stepL = Math.max(p.stepL, 0.75 * Math.max(0, s) * wa);
      p.stepR = Math.max(p.stepR, 0.75 * Math.max(0, -s) * wa);
      p.flapL += 0.35 * wa;
      p.flapR += 0.35 * wa;
    }
    // Flap small wings; flash, flash; arms up on "bright".
    const fa = win(t, c.flap0 - 0.1, c.hey[0] - 0.15, 0.15);
    if (fa > 0) {
      const flap = 0.5 + 0.8 * Math.abs(Math.sin(Math.PI * 2 * bf));
      const up = smooth(c.bright - 0.1, c.bright + 0.1, t);
      p.flapL += fa * lerp(flap, 2.2, up);
      p.flapR += fa * lerp(flap, 2.2, up);
      for (const f of c.flash) p.squash += 0.45 * decay(t, f, 0.1);
      p.hop += 0.25 * bump(t, c.bright - 0.05 + delay, 0.4);
      p.nod += 0.25 * up * fa;
    }
    // Hey, hey! then one flipper raised to the night.
    c.hey.forEach((ht) => {
      const hh = bump(t, ht - 0.12 + delay, 0.38);
      p.hop += 0.42 * hh;
      p.flapL += 1.0 * hh;
      p.flapR += 1.0 * hh;
    });
    const own = win(t, c.own - 0.1, c.heyEnd + 0.1, 0.25);
    p.flapR += own * 2.4;
    p.flapL += own * 0.5;
    p.lean -= own * 0.12;
    p.nod += own * 0.3;
    p.glow += own * 0.6 * (0.6 + 0.4 * timing.pulse(t, 0.2));
    // Fill: groove between the moves.
    const busy = Math.max(ca, wa, fa, own, win(t, c.steps[0] - 0.3, c.crew + 0.6, 0.2));
    this.groove(p, t, i, 1.1 * (1 - busy) + 0.3);
  }

  verse1Lead(p, t) {
    const v = this.v1;
    this.groove(p, t, 0, 0.35);
    p.squash -= 0.5 * bump(t, v.feathered - 0.05, 0.5);
    p.flapL += 0.8 * bump(t, v.feathered - 0.05, 0.5);
    p.flapR += 0.8 * bump(t, v.feathered - 0.05, 0.5);
    // A call that can be heard: beak up and open.
    const up = win(t, v.call - 0.3, v.heard + 0.6, 0.25);
    p.nod += 0.5 * up;
    p.lean -= 0.12 * up;
    p.beak = Math.max(bump(t, v.call - 0.05, 0.5), bump(t, v.can - 0.05, 0.35) * 0.6, bump(t, v.heard - 0.05, 0.8));
    p.flapL += up * (0.4 + 0.5 * p.beak);
    p.flapR += up * (0.4 + 0.5 * p.beak);
    // Dark back, bright belly, tidy suit.
    const turn = smooth(v.back - 0.15, v.back + 0.25, t) * (1 - smooth(v.belly - 0.2, v.belly + 0.15, t));
    p.yaw += Math.PI * turn;
    const proud = win(t, v.belly, v.legs - 0.2, 0.2);
    p.lean -= 0.12 * proud;
    p.flapL += 0.5 * proud;
    p.flapR += 0.5 * proud;
    p.bow = t < v.suit ? 0 : easeOutBack((t - v.suit) / 0.35);
    // Short legs shuffle, step and scoot.
    const sh = win(t, v.shuffle - 0.1, v.step - 0.1, 0.1);
    const ph = t * 26;
    p.stepL = Math.max(p.stepL, sh * 0.45 * Math.max(0, Math.sin(ph)));
    p.stepR = Math.max(p.stepR, sh * 0.45 * Math.max(0, -Math.sin(ph)));
    p.tilt += sh * 0.1 * Math.sin(ph);
    p.stepL = Math.max(p.stepL, bump(t, v.step - 0.15, 0.4) * 1.1);
    p.squash += 0.4 * decay(t, v.step + 0.25, 0.08);
    const scoot = easeOutCubic((t - v.scoot) / 0.35) * (1 - easeInOut((t - v.cannot + 0.3) / 0.7));
    p.z += 0.55 * scoot;
    p.lean += 0.25 * bump(t, v.scoot - 0.05, 0.4);
    // Cannot fly: furious flapping, a hop, a plop and a head shake.
    const tryFly = win(t, v.cannot + 0.4, v.air, 0.15);
    p.flapL += tryFly * (0.7 + 1.1 * Math.abs(Math.sin(t * 30)));
    p.flapR += tryFly * (0.7 + 1.1 * Math.abs(Math.sin(t * 30 + 0.4)));
    p.hop += 0.75 * bump(t, v.fly - 0.15, 0.62);
    p.squash += 0.6 * decay(t, v.fly + 0.47, 0.1);
    p.turn += 0.45 * Math.sin((t - v.air) * 22) * decay(t, v.air, 0.35);
    // Still their wings are useful: flippers glow and stroke.
    const wg = win(t, v.wings - 0.1, SECTIONS.chorus1 - 0.6, 0.3);
    p.glow += wg * (0.7 + 0.3 * Math.sin(t * 6));
    p.flapL += wg * (0.9 + 0.35 * Math.sin(t * 7));
    p.flapR += wg * (0.9 + 0.35 * Math.sin(t * 7 + Math.PI));
    const stroke = bump(t, v.useful - 0.1, 0.7);
    p.fwdL += 1.2 * stroke;
    p.fwdR += 1.2 * stroke;
  }

  /** Lead: chorus-1 tail walk to the floe edge and dive; verse-2 leap back onto the ice. */
  leadSea(p, t) {
    if (t >= SECTIONS.chorus1 && t < SECTIONS.dive) {
      const c = this.choruses.chorus1;
      const go = c.heyEnd + 0.1;
      if (t < go) return;
      const jump = SECTIONS.dive - 0.72;
      if (t < jump) {
        p.z = lerp(SLOTS[0][1], STAGE_R - 0.55, easeInOut((t - go) / (jump - go - 0.05)));
        this.walkCycle(p, t, 1);
        p.flapL += 0.3;
        p.flapR += 0.3;
        return;
      }
      const u = (t - jump) / 0.72;
      p.z = STAGE_R - 0.55 + 1.9 * u;
      p.y = 0.9 * Math.sin(Math.PI * Math.min(u, 1) * 0.85) - 1.3 * u * u;
      p.pitch = lerp(0, 1.65, easeInOut(u));
      p.fwdL = p.fwdR = -0.8;
      p.flapL = p.flapR = 0.25;
      p.squash -= 0.2;
      return;
    }
    if (t >= SECTIONS.verse2 && t < 60.4) {
      const t0 = SECTIONS.verse2;
      const land = t0 + 0.5;
      if (t < land) {
        const u = (t - t0) / 0.5;
        p.z = lerp(STAGE_R + 0.9, STAGE_R - 1.4, u);
        p.y = 1.2 * Math.sin(Math.PI * u) - 0.7 * (1 - u) * (1 - u);
        p.yaw = Math.PI;
        p.pitch = lerp(-0.4, 1.1, u);
        p.fwdL = p.fwdR = -0.7;
        return;
      }
      const slideEnd = land + 0.55;
      const up = smooth(slideEnd, slideEnd + 0.3, t);
      const face = smooth(slideEnd + 0.3, slideEnd + 0.7, t);
      p.z = lerp(STAGE_R - 1.4, 3.7, easeOutCubic((t - land) / 0.55));
      p.z = lerp(p.z, SLOTS[0][1], easeInOut((t - slideEnd - 0.8) / 1.4));
      p.yaw = lerp(Math.PI, 0, face);
      p.lean = 1.25 * (1 - up);
      p.hop = 0.22 * (1 - up) + 0.3 * bump(t, slideEnd, 0.35);
      p.fwdL = p.fwdR = -0.7 * (1 - up);
      this.walkCycle(p, t, win(t, slideEnd + 0.8, slideEnd + 2.2, 0.1));
    }
  }

  penguinPose(i, t, section, slots) {
    const timing = this.ctx.timing;
    const s = slots[i];
    const p = { x: s.x, y: 0, z: s.z, yaw: 0, pitch: 0, hop: 0, tilt: 0, lean: 0, squash: 0, flapL: 0.12, flapR: 0.12, fwdL: 0, fwdR: 0, inL: 0, inR: 0, stepL: 0, stepR: 0, nod: 0, turn: 0, cock: 0, beak: 0, blink: 0, bow: 1, glow: 0 };
    const period = 3.1 + hash(i * 7.3) * 2.2;
    p.blink = bump(((t + hash(i) * 5) % period), 0, 0.16);
    p.cock = Math.sin(t * 0.7 + i * 1.7) * 0.06;
    const chorus = this.choruses[section];
    if (section === "open") this.groove(p, t, i, smooth(SECTIONS.drop + 3, SECTIONS.drop + 4.5, t) * 1.1);
    else if (section === "verse1") {
      if (i === 0) this.verse1Lead(p, t);
      else {
        this.groove(p, t, i, 0.45);
        p.turn += Math.atan2(slots[0].x - s.x, Math.max(0.3, slots[0].z - s.z)) * 0.6 * (1 - s.walk);
        p.flapL += 0.4 * bump(t, this.v1.heard + 0.2 + i * 0.05, 0.5);
        p.flapR += 0.4 * bump(t, this.v1.heard + 0.2 + i * 0.05, 0.5);
      }
    } else if (chorus) {
      if (!(chorus.name === "chorus3" && t < chorus.steps[0] - 0.3 && i > 0)) this.chorusPose(chorus, p, t, i);
      if (chorus.name === "chorus3" && t < chorus.crew - 0.1) {
        const crouch = win(t, SECTIONS.chorus3, chorus.steps[0] - 0.2, 0.1);
        p.squash += 0.2 * crouch;
      }
    } else if (section === "verse2") this.verse2Pose(p, t, i);
    else if (section === "bridge") {
      this.groove(p, t, i, 0.3);
      const look = win(t, this.br.birds - 0.6, this.br.fly + 0.6, 0.5);
      p.nod += 0.55 * look;
      p.turn += -0.25 * look * Math.sin((t - this.br.birds) * 0.4);
      const shrug = bump(t, this.br.fly - 0.1, 0.7);
      p.flapL += 0.9 * shrug;
      p.flapR += 0.9 * shrug;
      p.hop += 0.1 * shrug;
    } else if (section === "freeze") this.freezePose(p, t, i);
    else if (section === "dance") this.dancePose(p, t, i);
    else if (section === "outro") this.outroPose(p, t, i);

    if (i === 0) this.leadSea(p, t);
    this.walkCycle(p, t, s.walk);
    if (i > 0 || section === "open") this.slideIn(p, t, i, s);
    return p;
  }

  verse2Pose(p, t, i) {
    const v = this.v2;
    const bf = this.ctx.timing.beatFloat(t);
    const ready = i === 0 ? smooth(SECTIONS.verse2 + 1.4, SECTIONS.verse2 + 1.8, t) : 1;
    const swim = win(t, v.pretend - 0.2, v.feet - 0.2, 0.3) * ready;
    const small = lerp(1, 0.45, smooth(v.small - 0.2, v.small + 0.2, t));
    const st = Math.sin(Math.PI * bf - i * 0.2);
    p.fwdL += swim * (0.75 + 0.55 * small * st);
    p.fwdR += swim * (0.75 - 0.55 * small * st);
    p.flapL += swim * 0.35 * small;
    p.flapR += swim * 0.35 * small;
    p.lean += swim * 0.1;
    p.tilt += swim * 0.06 * st;
    const feet = win(t, v.feet - 0.1, v.slow - 0.1, 0.2);
    p.tilt += feet * 0.12 * Math.sin(Math.PI * bf * 0.5 + i * 0.3);
    p.flapL += feet * 0.3;
    p.flapR += feet * 0.3;
    p.nod -= feet * 0.25;
    let forward = 0;
    v.steps.forEach((s, k) => {
      const lift = bump(t, s - 0.25, 0.34);
      if (k % 2) p.stepR = Math.max(p.stepR, lift);
      else p.stepL = Math.max(p.stepL, lift);
      p.tilt += (k % 2 ? -1 : 1) * 0.12 * lift;
      forward += 0.22 * easeInOut((t - s + 0.25) / 0.34);
    });
    p.z += forward * (1 - easeInOut((t - SECTIONS.chorus2) / 0.9));
    this.groove(p, t, i, 0.35 * ready);
  }

  freezePose(p, t, i) {
    const b = this.br;
    const frozen = t >= b.freeze && t < b.sway;
    const tf = frozen ? b.freeze : t;
    if (t < b.freeze) this.groove(p, t, i, 0.8);
    if (frozen) {
      const jitter = 0.04 * Math.sin((t - b.freeze) * 40) * decay(t, b.freeze, 0.12);
      p.flapL += 0.9 + hash(i) * 0.6;
      p.flapR += 0.4 + hash(i + 3) * 1.2;
      p.stepL = i % 2 ? 0.6 : 0;
      p.stepR = i % 2 ? 0 : 0.5;
      p.tilt += (i % 2 ? 0.16 : -0.16) + jitter;
      p.nod += 0.15;
      p.blink = 0;
    }
    const sway = win(t, b.sway, b.stop - 0.1, 0.4);
    p.tilt += sway * 0.14 * Math.sin((tf - b.sway) * 2.6 + i * 0.35);
    p.flapL += sway * 0.35;
    p.flapR += sway * 0.35;
    const rest = win(t, b.stop, b.away + 0.05, 0.3);
    p.squash += 0.35 * rest;
    p.blink = Math.max(p.blink, 0.65 * rest);
    p.nod -= 0.2 * rest;
    p.hop += 0.3 * bump(t, b.away, 0.35);
  }

  dancePose(p, t, i) {
    const timing = this.ctx.timing;
    const bf = timing.beatFloat(t);
    const k = Math.floor(bf - timing.beatIndexAt(SECTIONS.dance + 0.01));
    const frac = bf - Math.floor(bf);
    const end = SECTIONS.chorus3;
    if (i === 0) {
      const spin = Math.floor(k / 2);
      p.yaw += Math.PI * 2 * (spin + easeInOut(((bf - timing.beatIndexAt(SECTIONS.dance + 0.01)) / 2) % 1));
      p.hop += 0.3 * Math.abs(Math.sin(Math.PI * bf));
      p.flapL += 1.2;
      p.flapR += 1.2;
    } else {
      const wave = (k - (i - 1) + 120) % 12;
      const h = wave === 0 ? Math.sin(Math.PI * frac) : 0;
      p.hop += 0.55 * h;
      p.flapL += 0.4 + 1.6 * h;
      p.flapR += 0.4 + 1.6 * h;
      p.yaw += Math.atan2(p.x, p.z - 0.2) * 0.85;
      this.groove(p, t, i, 0.8);
    }
    const crouch = smooth(end - 0.75, end - 0.05, t);
    p.squash += 0.45 * crouch;
    p.flapL *= 1 - crouch * 0.7;
    p.flapR *= 1 - crouch * 0.7;
  }

  outroPose(p, t, i) {
    const o = this.out;
    const calm = 1 - smooth(o.dim, o.stand, t);
    this.groove(p, t, i, 0.8 * calm + 0.15);
    const wave = win(t, o.party, o.grand - 0.1, 0.3);
    p.flapR += wave * (1.6 + 0.6 * Math.sin(t * 7 + i));
    const bowing = smooth(o.grand - 0.15, o.grand + 0.25, t);
    p.lean += 0.75 * bowing;
    p.nod -= 0.3 * bowing;
    p.flapL += 0.3 * bowing;
    p.flapR += 0.3 * bowing;
  }

  /** Camera shots: [start, pose(t), blend seconds]. */
  shots(t, section) {
    const lead = this.leadPos;
    if (section === "open") {
      return [
        [SECTIONS.drop, (tt) => {
          const k = easeInOut((tt - SECTIONS.drop) / 3.6);
          return { pos: V(Math.sin(k * 0.6) * 3, lerp(7.5, 2.3, k), lerp(15, 9.6, k)), look: V(0, lerp(1.5, 0.6, k), 0) };
        }, 0],
        [12.3, () => ({ pos: V(0.7, 1.25, 5.4), look: V(0, 0.75, 1.0) }), 1.6],
      ];
    }
    if (section === "verse1") {
      const v = this.v1;
      return [
        [SECTIONS.verse1, (tt) => ({ pos: V(0.55 + (tt - 14) * 0.08, 1.05, 4.5), look: V(0, 0.72, 1.0) }), 0.6],
        [v.call - 0.35, () => ({ pos: V(-0.85, 0.45, 3.6), look: V(0, 1.0, 1.0) }), 0.35],
        [v.back - 0.3, (tt) => ({ pos: V(0.25 - (tt - v.back) * 0.1, 0.95, 4.4), look: V(0, 0.66, 1.0) }), 0.35],
        [v.legs - 0.15, () => ({ pos: V(1.25, 0.42, lead.z + 3.1), look: V(0, 0.36, lead.z) }), 0.45],
        [v.cannot - 0.15, () => ({ pos: V(2.5, 1.35, 6.4), look: V(0, 1.05, 1.0) }), 0.45],
        [v.wings - 0.2, () => ({ pos: V(1.7, 0.95, 3.4), look: V(0.2, 0.66, 1.0) }), 0.45],
        [31.15, () => ({ pos: V(0, 2.0, 9.6), look: V(0, 0.75, 0) }), 0.9],
      ];
    }
    const c = this.choruses[section];
    if (c) {
      const side = section === "chorus2" ? -1 : 1;
      const list = [];
      if (section === "chorus3") {
        list.push([c.start, (tt) => ({ pos: V(0, 1.8, 7.0 - (tt - c.start) * 0.2), look: V(0, 0.7, 1.3) }), 0.3]);
        c.steps.forEach((s, k) => list.push([s - 0.06, () => ({ pos: V((k % 2 ? 1 : -1) * 0.7, 1.2, 5.6), look: V(0, 0.55, 1.3) }), 0.1]));
      } else {
        list.push([c.start, (tt) => ({ pos: V(side * (1.5 - (tt - c.start) * 0.4), 1.6, 9.2), look: V(0, 0.8, 0) }), section === "chorus2" ? 0.2 : 0.7]);
        c.steps.forEach((s, k) => list.push([s - 0.06, () => ({ pos: V(side * (k % 2 ? 1.6 : -1.6), 0.55, 5.8), look: V(0, 0.42, 0.4) }), 0.1]));
      }
      list.push([c.crew - 0.1, (tt) => ({ pos: V(side * 0.5, 6.8 - (tt - c.crew) * 0.6, 8.6), look: V(0, 0, 0) }), 0.22]);
      list.push([c.clap0 - 0.25, (tt) => {
        const a = side * (tt - c.clap0) * 0.12;
        return { pos: V(Math.sin(a) * 6.4, 1.3, Math.cos(a) * 6.4), look: V(0, 0.85, 0.4) };
      }, 0.35]);
      list.push([c.wad0 - 0.2, () => ({ pos: V(-this.wadX * 0.5, 1.5, 7.4), look: V(this.wadX * 0.6, 0.7, 0) }), 0.35]);
      list.push([c.flap0 - 0.2, (tt) => ({ pos: V(side * (0.6 - (tt - c.flap0) * 0.2), 0.32, 5.3), look: V(0, 1.35, 0) }), 0.3]);
      list.push([c.hey[0] - 0.15, (tt) => {
        const k = easeInOut((tt - c.hey[0]) / 3);
        return { pos: V(0, lerp(1.3, 4.4, k), lerp(7, 10.5, k)), look: V(0, lerp(0.9, 1.6, k), 0) };
      }, 0.3]);
      if (section === "chorus1") {
        list.push([c.heyEnd + 0.1, (tt) => ({ pos: V(2.2, 2.4, 11.2 - (tt - c.heyEnd) * 0.3), look: V(0, 0.5, lead.z) }), 0.7]);
        list.push([SECTIONS.dive - 0.75, () => ({ pos: V(5.6, 1.5, 10.8), look: V(0, Math.max(-0.3, lead.y ?? 0) + 0.3, lead.z) }), 0.5]);
      } else {
        list.push([c.heyEnd + 0.1, (tt) => {
          const a = side * (tt - c.heyEnd) * 0.45;
          return { pos: V(Math.sin(a) * 9, 2.6, Math.cos(a) * 9), look: V(0, 0.6, 0) };
        }, 0.6]);
      }
      return list;
    }
    if (section === "verse2") {
      const v = this.v2;
      return [
        [SECTIONS.verse2, () => ({ pos: V(4.6, 2.1, 10.6), look: V(-0.3, 0.5, 3.4) }), 0],
        [v.pretend + 0.6, (tt) => ({ pos: V(0.8 - (tt - v.pretend) * 0.25, 1.8, 8.0), look: V(0, 0.75, 0) }), 1.3],
        [v.small - 0.15, (tt) => ({ pos: V(-2.4 + (tt - v.small) * 0.2, 1.3, 6.2), look: V(0, 0.85, 0.4) }), 0.5],
        [v.feet - 0.15, () => ({ pos: V(0.45, 0.32, 5.4), look: V(0, 0.12, 0.6) }), 0.45],
        [v.slow - 0.15, (tt) => ({ pos: V(2.6 - (tt - v.slow) * 0.3, 1.35, 7.4), look: V(0, 0.6, 0.8) }), 0.5],
      ];
    }
    if (section === "bridge") {
      const b = this.br;
      return [
        [SECTIONS.bridge, (tt) => {
          const k = easeInOut((tt - SECTIONS.bridge) / 2.6);
          return { pos: V(lerp(0.2, 1.8, k), lerp(1.4, 0.65, k), lerp(5.5, 5.6, k)), look: V(lerp(0, -1.2, k), lerp(0.85, 2.4, k), lerp(0.5, -6, k)) };
        }, 0.3],
        [b.fly - 0.3, () => ({ pos: V(0.4, 1.1, 4.8), look: V(0, 0.8, 1.2) }), 0.45],
      ];
    }
    if (section === "freeze") {
      const b = this.br;
      return [
        [SECTIONS.freeze, (tt) => {
          const tf = tt >= b.freeze && tt < b.sway ? b.freeze : tt;
          return { pos: V(Math.sin((tf - 94.9) * 0.3) * 1.5, 1.7, 8.2 - smooth(b.sway, b.stop, tt) * 1.6), look: V(0, 0.7, 0) };
        }, 0.2],
        [b.stop - 0.1, () => ({ pos: V(-1.6, 0.9, 5.2), look: V(0, 0.5, 0.5) }), 0.6],
      ];
    }
    if (section === "dance") {
      return [
        [SECTIONS.dance, (tt) => {
          const a = (tt - SECTIONS.dance) * 0.95;
          return { pos: V(Math.sin(a) * 7.6, 3.4 + Math.sin(tt * 1.3) * 0.5, Math.cos(a) * 7.6), look: V(0, 0.5, 0.3) };
        }, 0.2],
        [103.65, (tt) => {
          const a = (tt - 103.65) * 1.6;
          return { pos: V(Math.sin(a) * 4.2, 7.2, Math.cos(a) * 4.2), look: V(0, 0.3, 0.3), roll: Math.sin((tt - 103.65) * 2.2) * 0.35 };
        }, 0.4],
        [105.45, () => ({ pos: V(0, 2.3, 7.8), look: V(0, 0.6, 0.2) }), 0.3],
      ];
    }
    if (section === "outro") {
      const o = this.out;
      return [
        [SECTIONS.outro, (tt) => ({ pos: V(Math.sin((tt - SECTIONS.outro) * 0.2) * 2, 2.0, 9.2), look: V(0, 0.65, 0) }), 0.6],
        [o.dim - 0.3, () => ({ pos: V(0, 4.6, 11.2), look: V(0, 0.3, 0) }), 0.7],
        [o.stand - 0.2, () => ({ pos: V(0.5, 0.3, 4.9), look: V(0, 0.22, 0.9) }), 0.45],
        [o.party - 0.15, () => ({ pos: V(0, 1.45, 7.6), look: V(0, 0.85, 0) }), 0.6],
        [o.grand + 0.1, (tt) => {
          const k = easeInOut((tt - o.grand - 0.1) / 1.2);
          return { pos: V(0, lerp(1.45, 5.0, k), lerp(7.6, 12.5, k)), look: V(0, lerp(0.85, 3.6, k), lerp(0, -16, k)) };
        }, 0.3],
      ];
    }
    return [[0, () => ({ pos: V(0, 2, 9), look: V(0, 0.7, 0) }), 0]];
  }

  cameraPose(t, section) {
    const list = this.shots(t, section);
    let k = 0;
    for (let i = 0; i < list.length; i++) if (t >= list[i][0]) k = i;
    const [st, fn, blend] = list[k];
    const cur = fn(t);
    if (k === 0 || blend <= 0 || t - st >= blend) return cur;
    const prev = list[k - 1][1](t);
    const e = easeInOut((t - st) / blend);
    return { pos: prev.pos.clone().lerp(cur.pos, e), look: prev.look.clone().lerp(cur.look, e), roll: lerp(prev.roll || 0, cur.roll || 0, e) };
  }

  update(t, section) {
    const { timing } = this.ctx;
    const kick = timing.pulse(t, 0.14);
    const bf = timing.beatFloat(t);
    const chorus = this.choruses[section];
    const party = chorus || section === "dance";
    const dropout = section === "chorus3" ? win(t, SECTIONS.chorus3 + 0.35, chorus.crew - 0.05, 0.15) : 0;

    // Penguins.
    const slots = this.formation(t);
    if (chorus) {
      const c = chorus;
      const toL = easeInOut((t - c.wad0 + 0.1) / (c.left + 0.25 - c.wad0));
      const toR = easeInOut((t - c.left - 0.25) / (c.right + 0.2 - c.left - 0.25));
      this.wadX = lerp(lerp(-0.95 * toL, 0.95, toR), 0, easeInOut((t - c.wadEnd) / 0.6));
    } else this.wadX = 0;
    const poses = this.penguins.map((pg, i) => {
      const vis = this.visible(i, t);
      pg.group.visible = vis;
      if (!vis) return null;
      const p = this.penguinPose(i, t, section, slots);
      pg.pose(p);
      return p;
    });
    this.leadPos = poses[0] || { x: 0, z: 1.3 };

    // Stage, lamps and lights.
    const st = this.stage.uniforms;
    st.uTime.value = t;
    st.uBeat.value = bf;
    st.uPulse.value = kick;
    const lampsLit = this.lampOn.filter((lt) => t >= lt).length;
    st.uDisco.value = party ? (section === "dance" ? 1.3 : 0.9) * (1 - dropout * 0.8) : section === "open" ? 0.5 * smooth(SECTIONS.drop + 1.5, SECTIONS.drop + 3, t) : section === "outro" ? 0.8 * (1 - smooth(this.out.dim, this.out.dimEnd, t)) : section === "verse2" ? 0.25 : 0.12;
    st.uHue.value = section === "chorus2" ? 0.55 : section === "chorus3" ? t * 0.05 : 0;
    const freezeK = section === "freeze" ? win(t, this.br.freeze, this.br.sway, 0.25) : 0;
    st.uFreeze.value = freezeK * (0.5 + 0.5 * decay(t, this.br.freeze, 0.4));
    const dim = section === "bridge" || section === "freeze" ? 0.93 : 1;
    st.uDim.value = dim * (1 - dropout * 0.3) * (section === "outro" ? 1 - 0.18 * smooth(this.out.dim, this.out.dimEnd, t) : 1);
    st.uRim.value = section === "open" ? smooth(SECTIONS.drop, SECTIONS.drop + 0.6, t) : 1 - dropout * 0.7;
    const spots = st.uSpots.value;
    spots.forEach((s) => s.set(0, 0, 0, 0));
    poses.forEach((p, i) => {
      if (!p || i >= 16) return;
      let e = 0;
      let hue = hueOf(LAMP_HUES[i % LAMP_HUES.length]);
      if (chorus) {
        for (const s of chorus.steps) e = Math.max(e, decay(t, s + 0.04, 0.3));
        for (const ct of chorus.claps) e = Math.max(e, 0.5 * decay(t, ct, 0.2));
        for (const ht of [...chorus.hey, chorus.crew + 0.38]) e = Math.max(e, decay(t, ht + 0.26, 0.25));
      }
      if (section === "verse2") {
        e = Math.max(e, 0.7 * win(t, this.v2.feet, this.v2.slow, 0.3));
        for (const s of this.v2.steps) e = Math.max(e, decay(t, s + 0.08, 0.35));
        hue = 0.52;
      }
      if (section === "dance") e = Math.max(e, 0.5 * kick + (i === 0 ? 0.4 : 0));
      if (section === "outro") e = Math.max(e, 0.6 * win(t, this.out.stand, this.out.party, 0.3));
      if (section === "freeze") {
        e = Math.max(e, 0.8 * freezeK);
        hue = 0.53;
      }
      spots[i].set(p.x, p.z, e, hue);
    });

    this.lamps.lamps.forEach((l, i) => {
      const base = new THREE.Color(LAMP_HUES[i % LAMP_HUES.length]);
      let k = t >= this.lampOn[i] ? 1 + 2.5 * decay(t, this.lampOn[i], 0.25) : 0.04;
      if (party) k *= 0.8 + 0.9 * kick;
      if (section === "dance") k = 0.4 + 2.6 * (Math.floor(bf) % LAMPS === i || Math.floor(bf + 6) % LAMPS === i ? 1 : 0) * (0.5 + kick);
      if (chorus) {
        for (const f of chorus.flash) k += 3 * decay(t, f, 0.2);
        k += 1.5 * decay(t, chorus.bright, 0.5);
        k *= 1 - dropout * 0.85;
      }
      if (section === "freeze") base.lerp(new THREE.Color("#dff8ff"), freezeK);
      if (section === "bridge" || section === "freeze") k *= 0.6;
      if (section === "outro") k *= 1 - smooth(this.out.dim + (i / LAMPS) * (this.out.dimEnd - this.out.dim), this.out.dim + ((i + 1) / LAMPS) * (this.out.dimEnd - this.out.dim), t) * 0.92;
      l.mat.color.copy(base).multiplyScalar(0.55 + Math.min(1, k) * 0.45 + Math.max(0, k - 1) * 0.15);
      l.halo.material.color.copy(base).multiplyScalar(Math.min(1.2, k * 0.35));
      l.halo.scale.setScalar(1.0 + k * 0.4);
      l.gem.rotation.y = t * 0.8 + i;
    });
    const discoOn = party ? 1 - dropout : section === "open" ? 0.4 : 0;
    this.discoA.intensity = discoOn * (0.25 + 0.8 * kick);
    this.discoB.intensity = discoOn * (0.25 + 0.8 * timing.pulse(t + timing.period * 0.5, 0.14));
    this.discoA.position.set(Math.sin(t * 1.3) * 4, 2.5, Math.cos(t * 1.3) * 4);
    this.discoB.position.set(Math.sin(t * 1.3 + Math.PI) * 4, 2.5, Math.cos(t * 1.3 + Math.PI) * 4);
    this.hemi.intensity = (section === "bridge" || section === "freeze" ? 0.9 : 1.0) * (1 - dropout * 0.35);
    this.moon.intensity = 1.4 * (1 - dropout * 0.3);
    this.rim.intensity = 0.8 + (party ? 0.3 * kick : 0);

    // Sky.
    const sky = this.sky.uniforms;
    sky.uTime.value = t;
    sky.uPulse.value = party ? kick : 0;
    let aurora = { open: 0.8, verse1: 0.6, verse2: 0.7, bridge: 0.55, freeze: 0.5, dance: 1.2, outro: 1.0 }[section] ?? 1.0;
    if (chorus) {
      aurora = 0.9 + 0.8 * win(t, chorus.bright, chorus.heyEnd + 0.4, 0.3) + 0.5 * decay(t, chorus.bright, 0.6);
      aurora *= 1 - dropout * 0.6;
    }
    if (section === "outro") aurora = lerp(1.0, 1.6, smooth(this.out.grand - 0.2, this.out.grand + 0.5, t));
    sky.uAurora.value = aurora;
    sky.uRainbow.value = section === "chorus3" || section === "dance" ? 0.7 : section === "outro" ? 0.5 : chorus ? 0.25 * win(t, chorus.own, chorus.heyEnd, 0.3) : 0;
    sky.uDim.value = 1 - dropout * 0.25;
    this.sea.uniforms.uTime.value = t;
    this.sea.uniforms.uAurora.value = aurora;
    this.sea.uniforms.uRainbow.value = sky.uRainbow.value;

    // Snow (stops in mid-air on "freeze").
    const fr = this.br;
    const snowT = section === "freeze" && t >= fr.freeze && t < fr.sway ? fr.freeze : t;
    this.snow.uniforms.uT.value = snowT;
    this.snow.uniforms.uOpacity.value = section === "bridge" || section === "freeze" ? 1.0 : 0.65;

    // Beams for the dance break and the final chorus.
    const beamsOn = section === "dance" ? 1 : section === "chorus3" ? Math.max(dropout, 0.6) : chorus ? 0.25 * win(t, chorus.own, chorus.heyEnd, 0.3) : 0;
    this.beams.forEach((b, j) => {
      const a = t * (0.9 + j * 0.13) + j * 1.3;
      if (dropout > 0 && j === 0) {
        b.position.set(this.leadPos.x, 11, this.leadPos.z);
        b.rotation.set(0, 0, 0);
      } else {
        b.position.set(Math.sin(j * 1.26) * 3.5, 11, Math.cos(j * 1.26) * 3.5 - 1);
        b.rotation.set(Math.sin(a) * 0.35, 0, Math.cos(a * 1.1) * 0.35);
      }
      b.material.uniforms.uColor.value.set(LAMP_HUES[j % LAMP_HUES.length]);
      if (dropout > 0 && j === 0) b.material.uniforms.uColor.value.set("#ffffff");
      b.material.uniforms.uOpacity.value = (dropout > 0 ? (j === 0 ? 2.2 * dropout : beamsOn * (1 - dropout)) : beamsOn) * (0.7 + 0.5 * kick);
    });

    // Birds crossing the moon in the bridge.
    this.birds.forEach((b, j) => {
      const on = section === "bridge";
      b.group.visible = on;
      if (!on) return;
      const u = (t - this.br.birds + 0.8 + j * 0.35) / 4.2;
      b.group.position.set(lerp(-32, 24, u) + j * 2.5, 19 + j * 1.6 + Math.sin(u * 6 + j) * 0.6, -44 + j * 2);
      b.group.rotation.set(0, Math.PI / 2, 0);
      b.group.scale.setScalar(3.4);
      const flap = Math.sin(t * 9 + j * 1.7) * 0.55;
      b.wings[0].rotation.z = flap;
      b.wings[1].rotation.z = -flap;
    });

    // Camera.
    const pose = this.cameraPose(t, section);
    this.camera.position.copy(pose.pos);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(pose.look);
    if (pose.roll) this.camera.rotateZ(pose.roll);
    this.camera.fov = 42 - (party ? kick * 2.2 : kick * 0.8);
    this.camera.updateProjectionMatrix();
    this.snow.uniforms.uCenter.value.copy(pose.look);
    for (const l of this.lamps.lamps) {
      const near = smooth(3.4, 6.2, l.holder.position.distanceTo(pose.pos));
      l.holder.scale.setScalar(Math.max(0.0001, near));
    }

    // Call rings.
    const lead = this.penguins[0];
    const beakPos = new THREE.Vector3();
    lead.beak.getWorldPosition(beakPos);
    this.rings.forEach((r, j) => {
      const u = r.material.uniforms;
      let a = 0;
      let rad = 0.2;
      if (section === "verse1") {
        for (const ct of [this.v1.call, this.v1.heard]) {
          const age = t - ct - j * 0.14;
          if (age > 0 && age < 0.9) {
            a = Math.max(a, (1 - age / 0.9) * 0.9);
            rad = 0.15 + age * 1.2;
          }
        }
      }
      u.uOpacity.value = a;
      u.uR.value = rad;
      r.position.copy(beakPos).add(V(0, 0.08, 0.1));
      r.quaternion.copy(this.camera.quaternion);
      r.rotateZ(-0.6);
    });

    this.updateSparks(t, section, poses);
    const post = { bloom: [0.3, 0.4, 0.95], ca: 0.08 + kick * (party ? 0.2 : 0.06), vignette: 0.18, grain: 0.008 };
    return this.hudAndPost(t, section, post, { kick, chorus, dropout, freezeK });
  }

  updateSparks(t, section, poses) {
    const bursts = [];
    const at = (i, dy = 0.7) => (poses[i] ? [poses[i].x, dy + (poses[i].hop || 0), poses[i].z + 0.3] : [0, dy, 0]);
    const c = this.choruses[section];
    if (c) {
      c.claps.forEach((ct, k) => [0, 1, 2].forEach((i) => bursts.push({ t0: ct, pos: at(i, 0.75), color: [COLORS.clap, "#ffffff"], speed: 1.4, life: 0.6, count: 22, seed: k * 7 + i, gravity: 0.5 })));
      c.flash.forEach((f, k) => [3, 4, 0].forEach((i) => bursts.push({ t0: f, pos: at(i, 1.0), color: [COLORS.flap, "#ffffff", COLORS.step], speed: 2.6, life: 0.9, count: 50, seed: 40 + k * 5 + i })));
      [c.night, c.bright].forEach((ft, k) => [0, 1, 2].forEach((j) => bursts.push({ t0: ft + j * 0.16, pos: [(j - 1) * 3.2, 4.2 + j * 0.6, -2.5], color: ["#ffffff", COLORS.step, COLORS.night, COLORS.clap], speed: 3.2, life: 1.5, count: 70, seed: 80 + k * 9 + j, gravity: 1.0 })));
    }
    if (section === "chorus1") bursts.push({ t0: SECTIONS.dive - 0.12, pos: [0, -0.2, STAGE_R + 1.2], color: ["#ffffff", "#bff4ff"], speed: 2.4, life: 0.9, count: 90, seed: 200, up: 1.2, gravity: 2.5 });
    if (section === "verse2") bursts.push({ t0: SECTIONS.verse2, pos: [0, -0.2, STAGE_R + 0.9], color: ["#ffffff", "#bff4ff"], speed: 2.4, life: 1.0, count: 90, seed: 210, up: 1.2, gravity: 2.5 });
    if (section === "verse1") bursts.push({ t0: this.v1.fly + 0.47, pos: [this.leadPos.x, 0.05, this.leadPos.z], color: ["#ffffff", "#dff6ff"], speed: 1.2, life: 0.7, count: 40, seed: 220, up: 0.6, gravity: 1.5 });
    if (section === "dance") this.danceBeats.forEach((bt, k) => k % 4 === 0 && bursts.push({ t0: bt, pos: [Math.sin(k) * 3, 4 + (k % 3), -3], color: ["#ffffff", COLORS.flap, COLORS.step, COLORS.clap], speed: 3, life: 1.3, count: 60, seed: 300 + k }));
    if (section === "chorus3") bursts.push(...[0, 1, 2, 3].map((j) => ({ t0: this.choruses.chorus3.crew + j * 0.12, pos: [(j - 1.5) * 2.6, 4.5, -2], color: ["#ffffff", COLORS.flap, COLORS.step, COLORS.clap], speed: 3.4, life: 1.5, count: 80, seed: 400 + j })));
    if (section === "outro") bursts.push(...[0, 1, 2, 3, 4].map((j) => ({ t0: this.out.grand + j * 0.14, pos: [(j - 2) * 2.8, 5 + (j % 2) * 1.2, -3], color: ["#ffffff", COLORS.flap, COLORS.step, COLORS.clap, COLORS.night], speed: 3.6, life: 1.8, count: 90, seed: 500 + j })));
    this.sparks.update(t, bursts);
  }

  arrow(x, y, dir, color, alpha) {
    if (alpha <= 0.01) return;
    const { hud } = this.ctx;
    const g = hud.ctx;
    g.save();
    g.globalAlpha = alpha;
    g.translate(x, y);
    g.scale(dir, 1);
    g.beginPath();
    g.moveTo(-70, -26);
    g.lineTo(10, -26);
    g.lineTo(10, -58);
    g.lineTo(80, 0);
    g.lineTo(10, 58);
    g.lineTo(10, 26);
    g.lineTo(-70, 26);
    g.closePath();
    g.lineJoin = "round";
    g.lineWidth = 12;
    g.strokeStyle = "rgba(5,5,25,0.9)";
    g.stroke();
    g.shadowColor = color;
    g.shadowBlur = 30;
    g.fillStyle = color;
    g.fill();
    g.restore();
    hud.keepout(x - 90, y - 65, x + 90, y + 65);
  }

  hudAndPost(t, section, post, { kick, chorus, dropout, freezeK }) {
    const { hud } = this.ctx;
    const Y = 440;
    const flash = (t0, amt, tau = 0.1) => {
      if (t >= t0) post.flash = Math.max(post.flash || 0, amt * Math.exp(-(t - t0) / tau));
    };
    if (section === "open") {
      hud.slam(TITLE.lines.join(" "), t, SECTIONS.drop + 0.25, 12.9, { y: Y - 40, size: 110, color: TITLE.accent, sub: TITLE.kicker, angle: -0.04 });
      flash(SECTIONS.drop, 0.7, 0.12);
      this.lampOn.forEach((lt) => flash(lt, 0.08, 0.08));
      this.entry.slice(0, CREW.open).forEach((et) => flash(et + 0.85, 0.06, 0.08));
    }
    if (section === "verse1") {
      const v = this.v1;
      hud.slam("BIRD", t, SECTIONS.verse1 + 0.1, v.call - 0.5, { y: Y, size: 190, color: COLORS.ice, sub: "with feathers" });
      hud.stamp("SQUAWK!", t, v.call, { x: 540, y: Y, size: 120, color: COLORS.hey, angle: -0.12, life: 0.9 });
      hud.stamp("SQUAWK!", t, v.heard, { x: 540, y: Y + 20, size: 130, color: COLORS.hey, angle: 0.1, life: 1.0 });
      hud.slam("DARK BACK", t, v.back, v.belly - 0.12, { y: Y, size: 150, color: "#8fb0e8" });
      hud.slam("BRIGHT BELLY", t, v.belly, v.suit - 0.12, { y: Y, size: 140, color: "#ffffff" });
      hud.slam("TIDY SUIT", t, v.suit, v.legs - 0.25, { y: Y, size: 150, color: "#ff2f6e", sub: "bow tie on!" });
      hud.slam("SHORT LEGS", t, v.legs, v.step - 0.1, { y: Y, size: 150, color: "#ff9330" });
      hud.stamp("STEP", t, v.step, { x: 400, y: Y, size: 120, color: COLORS.step, angle: -0.1, life: 0.55 });
      hud.stamp("SCOOT!", t, v.scoot, { x: 660, y: Y + 30, size: 120, color: COLORS.waddle, angle: 0.08, life: 0.8 });
      hud.slam("NO FLYING", t, v.fly, v.wings - 0.3, { y: Y, size: 150, color: COLORS.no, sub: "penguins can't fly" });
      hud.slam("FLIPPERS", t, v.wings, SECTIONS.chorus1 - 0.6, { y: Y, size: 170, color: COLORS.swim, sub: "wings made for swimming" });
      flash(SECTIONS.verse1, 0.35);
      flash(v.call, 0.12);
      flash(v.suit, 0.25);
      flash(v.fly + 0.47, 0.18);
      if (t >= 31.0 && t < SECTIONS.chorus1) post.flash = Math.max(post.flash || 0, smooth(SECTIONS.chorus1 - 0.25, SECTIONS.chorus1, t) * 0.5);
    }
    if (chorus) {
      const c = chorus;
      c.steps.forEach((s, k) => {
        hud.stamp("STEP!", t, s, { x: k % 2 ? 690 : 390, y: Y + (k > 1 ? 120 : 0), size: 120, color: COLORS.step, angle: k % 2 ? 0.1 : -0.1, life: Math.min(0.55, c.crew - s - 0.05) });
        flash(s, 0.18, 0.07);
      });
      hud.slam("PENGUIN CREW!", t, c.crew, c.clap0 - 0.12, { y: Y, size: 140, color: COLORS.ice });
      flash(c.crew, 0.35);
      c.claps.forEach((ct, k) => {
        hud.stamp("CLAP!", t, ct, { x: k % 2 ? 680 : 400, y: Y, size: 110, color: COLORS.clap, angle: k % 2 ? 0.1 : -0.1, life: 0.34 });
        flash(ct, 0.12, 0.06);
      });
      const la = win(t, c.left - 0.05, c.left + 0.9, 0.15);
      const ra = win(t, c.right - 0.05, c.right + 0.8, 0.15);
      this.arrow(300 - 40 * easeOutCubic((t - c.left) / 0.3), Y + 10, -1, COLORS.waddle, la);
      hud.text("LEFT", 300, Y + 110, { size: 64, weight: 800, family: FONT_COND, color: COLORS.waddle, alpha: la, glow: 18 });
      this.arrow(780 + 40 * easeOutCubic((t - c.right) / 0.3), Y + 10, 1, COLORS.waddle, ra);
      hud.text("RIGHT", 780, Y + 110, { size: 64, weight: 800, family: FONT_COND, color: COLORS.waddle, alpha: ra, glow: 18 });
      hud.slam("WADDLE", t, c.wad0, c.left - 0.1, { y: Y, size: 160, color: COLORS.waddle });
      hud.slam("FLAP!", t, c.flap0, c.flash[0] - 0.28, { y: Y, size: 180, color: COLORS.flap });
      c.flash.forEach((f, k) => {
        hud.stamp("FLASH!", t, f, { x: k ? 690 : 390, y: Y, size: 120, color: "#ffffff", angle: k ? 0.12 : -0.12, life: 0.4 });
        flash(f, 0.7, 0.09);
      });
      hud.slam("BRIGHT!", t, c.bright, c.hey[0] - 0.12, { y: Y, size: 180, color: COLORS.clap });
      flash(c.bright, 0.4, 0.15);
      c.hey.forEach((ht, k) => {
        hud.stamp("HEY!", t, ht, { x: k ? 700 : 380, y: Y, size: 140, color: COLORS.hey, angle: k ? 0.12 : -0.12, life: 0.6 });
        flash(ht, 0.22, 0.08);
      });
      hud.slam("OWN THE NIGHT!", t, c.own, c.heyEnd + 0.3, { y: Y, size: 130, color: COLORS.night });
      flash(c.start, c.name === "chorus3" ? 0.3 : 0.6, 0.12);
      if (c.name === "chorus1" && t >= SECTIONS.dive - 0.2) post.flash = Math.max(post.flash || 0, smooth(SECTIONS.dive - 0.2, SECTIONS.dive, t) * 0.9);
      if (c.name === "chorus3") {
        post.sat = 1 - dropout * 0.2;
        flash(c.crew, 0.9, 0.15);
      }
      post.ca += kick * 0.1;
      post.bloom = [0.32 + 0.2 * decay(t, c.bright, 0.5), 0.45, 0.94];
    }
    if (section === "verse2") {
      const v = this.v2;
      flash(SECTIONS.verse2, 0.9, 0.12);
      hud.slam("PRETEND SWIM", t, v.pretend + 0.1, v.small - 0.12, { y: Y, size: 140, color: COLORS.swim, sub: "flippers forward" });
      hud.slam("SMALL MOVES", t, v.small, v.feet - 0.12, { y: Y, size: 150, color: COLORS.ice, sub: "arms stay close" });
      hud.slam("FEET ON THE FLOOR", t, v.feet, v.slow - 0.12, { y: Y, size: 120, color: COLORS.step });
      hud.slam("SLOW STEPS", t, v.slow, v.steps[2] - 0.12, { y: Y, size: 150, color: COLORS.waddle });
      v.steps.slice(2).forEach((s, k) => {
        hud.stamp(String(k + 1), t, s, { x: k ? 640 : 440, y: Y + 10, size: 200, color: COLORS.waddle, angle: k ? 0.08 : -0.08, life: SECTIONS.chorus2 - s + 0.1 });
        flash(s, 0.15, 0.08);
      });
      if (t > SECTIONS.chorus2 - 0.25) post.flash = Math.max(post.flash || 0, smooth(SECTIONS.chorus2 - 0.25, SECTIONS.chorus2, t) * 0.6);
    }
    if (section === "bridge") {
      hud.slam("BIRDS", t, this.br.birds, this.br.fly + 0.5, { y: Y, size: 180, color: COLORS.ice, sub: "with wings that can't fly" });
      post.sat = 0.95;
      flash(SECTIONS.bridge, 0.25, 0.2);
      if (t > SECTIONS.glide - 0.25) post.flash = Math.max(post.flash || 0, smooth(SECTIONS.glide - 0.25, SECTIONS.glide, t) * 0.7);
    }
    if (section === "freeze") {
      const b = this.br;
      flash(SECTIONS.freeze, 0.6, 0.12);
      hud.stamp("FREEZE!", t, b.freeze, { x: 540, y: Y, size: 170, color: COLORS.ice, angle: -0.06, life: b.sway - b.freeze });
      flash(b.freeze, 0.6, 0.1);
      post.flashColor = "#cff6ff";
      post.sat = 1 - 0.4 * freezeK;
      hud.slam("GENTLY SWAY", t, b.sway, b.stop - 0.12, { y: Y, size: 140, color: COLORS.night });
      hud.slam("REST", t, b.stop, b.away, { y: Y, size: 200, color: COLORS.hey, sub: "stop when you're tired" });
      if (t > SECTIONS.dance - 0.3) post.flash = Math.max(post.flash || 0, smooth(SECTIONS.dance - 0.3, SECTIONS.dance, t) * 0.7);
    }
    if (section === "dance") {
      hud.slam("DANCE BREAK!", t, SECTIONS.dance + 0.1, 102.4, { y: Y, size: 140, color: COLORS.flap });
      hud.slam("PENGUIN SPIN", t, 103.7, 105.3, { y: Y, size: 140, color: COLORS.step });
      this.danceBeats.forEach((bt) => flash(bt, 0.1, 0.06));
      flash(SECTIONS.dance, 0.7, 0.12);
      post.ca += kick * 0.2;
      post.bloom = [0.35, 0.45, 0.94];
      if (t > SECTIONS.chorus3 - 0.15) post.flash = Math.max(post.flash || 0, smooth(SECTIONS.chorus3 - 0.15, SECTIONS.chorus3, t) * 0.8);
    }
    if (section === "outro") {
      const o = this.out;
      flash(SECTIONS.outro, 0.35, 0.15);
      hud.slam("LIGHTS DIM", t, o.dim, o.stand - 0.12, { y: Y, size: 150, color: COLORS.ice });
      hud.slam("STAND STILL", t, o.stand, o.party - 0.15, { y: Y, size: 140, color: COLORS.step });
      hud.slam("TA-DA!", t, o.grand, SECTIONS.end - 0.25, { y: Y, size: 200, color: COLORS.clap, sub: "take a bow" });
      flash(o.grand, 0.6, 0.15);
      if (t > SECTIONS.end - 0.3) post.flash = Math.max(post.flash || 0, smooth(SECTIONS.end - 0.3, SECTIONS.end, t));
    }
    post.flash = (post.flash || 0) * 0.4;
    return post;
  }
}
