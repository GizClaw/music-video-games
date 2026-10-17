import * as THREE from "three";
import { FONT_COND } from "@gizclaw/mvg-core/hud.js";
import { easeInOut, hash, lerp, smooth } from "@gizclaw/mvg-core/timing.js";
import { Frog } from "./frog.js";
import { makeBanks, makeClouds, makeLotus, makePad, makeReeds, makeSky, makeWater } from "./pond.js";
import { CHORUSES, COLORS, CREW_PAD_R, PATH, RING, SECTIONS, STAGE, TITLE } from "./constants.js";

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const CREW = RING.length;
const FLIES = 160;

const bump = (t, t0, d) => (t > t0 && t < t0 + d ? Math.sin((Math.PI * (t - t0)) / d) : 0);
const decay = (t, t0, tau) => (t >= t0 ? Math.exp(-(t - t0) / tau) : 0);
const win = (t, a, b, f = 0.2) => smooth(a - f, a, t) * (1 - smooth(b, b + f, t));

function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.3, "rgba(255,255,255,0.5)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class PondScene {
  constructor(ctx) {
    this.ctx = ctx;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#ffb38a");
    this.camera = new THREE.PerspectiveCamera(42, 9 / 16, 0.05, 700);

    this.sky = makeSky();
    this.water = makeWater();
    this.scene.add(this.sky.mesh, this.water.mesh, makeBanks(), makeClouds());

    this.stagePad = makePad(STAGE.r, 0.4);
    this.scene.add(this.stagePad);
    this.ringPads = RING.map(([x, z], i) => {
      const p = makePad(CREW_PAD_R * (0.9 + hash(i) * 0.2), hash(i * 3) * 6.28);
      p.position.set(x, 0, z);
      this.scene.add(p);
      return p;
    });
    this.pathPads = PATH.map(([x, z, r], i) => {
      const p = makePad(r, hash(i * 7) * 6.28);
      p.position.set(x, 0, z);
      this.scene.add(p);
      return p;
    });
    [[-4.6, -3.2, 1.1], [4.4, -3.0, 0.9], [-5.5, 1.5, 0.8], [5.8, 0.6, 1.0], [1.8, -4.4, 0.8]].forEach(([x, z, r], i) => {
      const p = makePad(r, i * 1.3);
      p.position.set(x, 0, z);
      this.scene.add(p);
    });
    [[-4.5, -3.1, 1.2], [1.7, -4.4, 1.0], [5.7, 0.5, 1.1], [-5.2, 4.6, 0.8]].forEach(([x, z, s]) => {
      const l = makeLotus(s);
      l.position.set(x + 0.25, 0.04, z + 0.15);
      this.scene.add(l);
    });
    this.reeds = [[-6.5, -4.5, 9], [6.8, -4.2, 8], [4.8, 1.0, 7], [-7.2, 2.4, 7], [-2.5, -6.0, 6], [3.2, -6.2, 6]].map(([x, z, n], i) => {
      const r = makeReeds(n, i * 11);
      r.group.position.set(x, 0, z);
      this.scene.add(r.group);
      return r;
    });

    this.hemi = new THREE.HemisphereLight("#fff0f4", "#7aa6c8", 1.05);
    this.key = new THREE.DirectionalLight("#fff1e0", 1.4);
    this.key.position.set(-3, 6, 7);
    this.rim = new THREE.DirectionalLight("#ffb07a", 0.9);
    this.rim.position.set(2, 3, -8);
    this.scene.add(this.hemi, this.key, this.rim);

    this.lead = new Frog({ crown: true, scale: 1.05 });
    this.scene.add(this.lead.group);
    this.crew = RING.map((_, i) => {
      const f = new Frog({ tone: (i % 3) + 1, scale: 0.72 + hash(i * 5.1) * 0.14 });
      this.scene.add(f.group);
      return f;
    });

    const glow = glowTexture();
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(FLIES * 3), 3));
    this.flies = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.22, map: glow, color: "#ffe680", transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.flies.frustumCulled = false;
    this.scene.add(this.flies);
    const sgeo = new THREE.BufferGeometry();
    sgeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(1600 * 3), 3));
    sgeo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(1600 * 3), 3));
    this.sparks = new THREE.Points(sgeo, new THREE.PointsMaterial({ size: 0.13, map: glow, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.sparks.frustumCulled = false;
    this.scene.add(this.sparks);

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
    this.open = { ready: w(1, 2), hop: w(1, 3), stop: w(1, 5), rise: RING.map((_, i) => timing.beatTime(timing.beatIndexAt(SECTIONS.drop + 0.01) + 2 + i)) };
    this.v1 = {
      low: w(2, 2), ripples: w(3, 2), legs: w(4, 2), fold: w(4, 3), push: w(5, 2), flight: w(5, 6),
      reach: w(6, 3), front: cues[6].start, land: w(7, 3), bed: cues[7].start,
    };
    this.v2 = {
      four: [w(13, 2), w(13, 3), w(13, 4), w(13, 6)], leap: w(14, 4), back: cues[14].start,
      feet: [w(15, 2), w(15, 3), w(15, 4)], tiny: beatsIn(cues[16].start, cues[16].end), ground: cues[17].start,
      rest: w(18, 0), look: w(18, 4),
    };
    this.br = { leap: cues[24].start, peak: w(24, 5), small: [w(25, 2), w(25, 4), w(25, 6)], one: w(26, 0), two: w(26, 1), freeze: w(26, 2), breathe: w(27, 0) };
    this.out = { ribbit: w(33, 0), stop: w(33, 5), bow: w(34, 1), hop: w(34, 6) };
    this.choruses = {};
    const ends = { chorus1: SECTIONS.verse2, chorus2: SECTIONS.bridge, chorus3: SECTIONS.outro };
    for (const [name, b] of Object.entries(CHORUSES)) {
      this.choruses[name] = {
        name, start: SECTIONS[name], end: ends[name],
        ribbits: [0, 1, 2, 3].map((k) => w(b, k)), hop: w(b, 4),
        bend: w(b + 1, 0), low: w(b + 1, 2), stop: w(b + 1, 5),
        ska: cues[b + 2].start, heys: [3, 4, 5].map((k) => w(b + 2, k)),
        springs: beatsIn(w(b + 3, 2), w(b + 3, 6)), soft: w(b + 4, 0), hoorays: [w(b + 4, 3), w(b + 4, 4)], endLine: cues[b + 4].end,
      };
    }
    // Leaps of the lead: [start, end, from [x,z], to [x,z], height].
    const S = [STAGE.x, STAGE.z];
    const P = PATH.map(([x, z]) => [x, z]);
    const v = this.v1;
    this.leaps = [
      [this.open.hop - 0.05, this.open.hop + 0.6, [0, 1.6], S, 0.9],
      [v.push - 0.05, v.push + 1.0, S, P[1], 1.6],
      [v.flight - 0.1, v.flight + 0.8, P[1], P[2], 1.1],
      [v.front + 0.7, v.land, P[2], P[4], 2.2],
      [SECTIONS.chorus1 - 1.0, SECTIONS.chorus1 - 0.15, P[4], S, 1.2],
      [this.v2.back - 0.05, this.v2.back + 0.55, S, P[0], 0.8],
      [this.v2.leap - 0.6, this.v2.leap - 0.05, P[0], P[1], 0.8],
      [this.v2.leap - 0.05, this.v2.leap + 0.55, P[1], P[2], 0.9],
      [this.v2.feet[0] - 1.05, this.v2.feet[0] - 0.3, P[2], S, 1.1],
      [this.br.leap + 0.2, this.br.peak + 0.2, S, S, 2.6],
    ];
  }

  /** The lead's pad position and current leap (height, progress) at time t. */
  leadAt(t) {
    let pos = [0, 1.6];
    for (const [a, b, from, to, h] of this.leaps) {
      if (t < a) break;
      if (t < b) {
        const u = (t - a) / (b - a);
        return { x: lerp(from[0], to[0], u), z: lerp(from[1], to[1], u), y: h * 4 * u * (1 - u), u, air: true, dir: Math.atan2(to[0] - from[0], to[1] - from[1]), land: b };
      }
      pos = to;
    }
    return { x: pos[0], z: pos[1], y: 0, u: 0, air: false, dir: 0, land: -9 };
  }

  frogPose(t, i, section) {
    const timing = this.ctx.timing;
    const bf = timing.beatFloat(t) - i * 0.02;
    const s = Math.sin(Math.PI * bf);
    const p = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, hop: 0, tilt: 0, lean: 0, squash: 0, crouch: 0, stretch: 0, armL: 0, armR: 0, wave: 0, nod: 0, turn: 0, cock: Math.sin(t * 0.8 + i) * 0.06, croak: 0, blink: 0, glow: 0, crown: 1 };
    const period = 2.9 + hash(i * 7.3) * 2.2;
    p.blink = bump((t + hash(i) * 5) % period, 0, 0.16);
    const delay = Math.max(0, i) * 0.03;
    const groove = (amt) => {
      p.hop += amt * 0.06 * Math.abs(s);
      p.tilt += amt * 0.08 * s;
      p.crouch += amt * 0.15 * (1 - Math.abs(s));
      p.armL += amt * 0.12 * Math.max(0, s);
      p.armR += amt * 0.12 * Math.max(0, -s);
    };
    const hopUp = (t0, h = 0.5, d = 0.5) => {
      const k = bump(t, t0 - 0.04 + delay, d);
      p.hop += h * k;
      p.stretch += k;
      p.crouch += 0.5 * bump(t, t0 - 0.2 + delay, 0.2);
      p.squash += 0.5 * decay(t, t0 + d - 0.04 + delay, 0.08);
    };
    const c = this.choruses[section];
    if (section === "open") {
      groove(smooth(this.open.stop + 0.3, this.open.stop + 1, t) * 0.8);
      if (i < 0) {
        p.crouch += 0.8 * win(t, this.open.ready - 0.1, this.open.hop - 0.05, 0.15);
        const st = win(t, this.open.stop, this.open.stop + 0.9, 0.1);
        p.armL += 0.9 * st;
        p.armR += 0.9 * st;
        p.blink *= 1 - st;
      }
    } else if (c) {
      c.ribbits.forEach((r) => {
        p.croak = Math.max(p.croak, bump(t, r - 0.05 + delay, 0.42));
        p.nod += 0.15 * bump(t, r - 0.05, 0.42);
      });
      hopUp(c.hop, 0.55, 0.52);
      p.armL += 0.6 * bump(t, c.hop + delay, 0.5);
      p.armR += 0.6 * bump(t, c.hop + delay, 0.5);
      const bend = win(t, c.bend - 0.1, c.stop + 0.6, 0.2) * smooth(c.bend - 0.1, c.low + 0.1, t);
      p.crouch += bend;
      p.nod -= 0.1 * bend;
      const frozen = win(t, c.stop, c.stop + 0.6, 0.08);
      p.armL += 0.7 * frozen;
      p.armR += 0.4 * frozen;
      p.blink *= 1 - frozen;
      const ska = win(t, c.ska - 0.1, c.springs[0] - 0.1, 0.15);
      p.tilt += 0.18 * s * ska;
      p.armL += 0.5 * ska * Math.max(0, s);
      p.armR += 0.5 * ska * Math.max(0, -s);
      c.heys.forEach((h) => {
        hopUp(h, 0.42, 0.4);
        p.armR += 1.1 * bump(t, h - 0.05 + delay, 0.4);
        p.armL += 0.5 * bump(t, h - 0.05 + delay, 0.4);
      });
      c.springs.forEach((sp) => hopUp(sp, 0.16, 0.3));
      hopUp(c.soft, 0.3, 0.6);
      c.hoorays.forEach((h) => {
        const k = bump(t, h - 0.08 + delay, 0.7);
        p.armL += 1.2 * k;
        p.armR += 1.2 * k;
        p.hop += 0.12 * k;
        p.croak = Math.max(p.croak, 0.5 * k);
      });
      const busy = Math.max(bend, frozen, ska, win(t, c.springs[0], c.endLine, 0.2));
      groove(0.9 * (1 - busy) + 0.2);
    } else if (section === "verse1") {
      groove(0.4);
      const v = this.v1;
      if (i < 0) {
        p.crouch += 0.55 * win(t, v.low - 0.2, v.legs - 0.3, 0.3);
        p.turn += 0.35 * Math.sin((t - v.ripples) * 1.4) * win(t, v.ripples - 0.3, v.legs - 0.3, 0.3);
        p.crouch += 0.9 * win(t, v.fold - 0.2, v.push - 0.05, 0.2);
        p.glow += 0.35 * win(t, v.legs, v.push, 0.2);
        p.armL += 0.9 * win(t, v.reach - 0.3, v.land - 0.15, 0.2);
        p.armR += 0.9 * win(t, v.reach - 0.3, v.land - 0.15, 0.2);
      }
    } else if (section === "verse2") {
      groove(0.45);
      const v = this.v2;
      const together = win(t, v.feet[0] - 0.2, v.feet[2] + 0.5, 0.2);
      v.feet.forEach((f) => hopUp(f, 0.22, 0.34));
      p.crouch += 0.2 * together;
      v.tiny.forEach((tt) => hopUp(tt, 0.12, 0.28));
      const rest = win(t, v.rest, SECTIONS.chorus2 - 0.4, 0.3);
      p.crouch += 0.5 * rest;
      p.blink = Math.max(p.blink, 0.55 * win(t, v.rest, v.look - 0.1, 0.2));
      p.turn += 0.6 * Math.sin((t - v.look) * 2.4) * win(t, v.look, SECTIONS.chorus2 - 0.3, 0.2);
      if (i < 0) p.glow += 0.3 * win(t, v.four[0], v.back - 0.3, 0.2);
    } else if (section === "bridge") {
      const b = this.br;
      const frozen = t >= b.freeze && t < b.breathe;
      if (!frozen) groove(0.3);
      b.small.forEach((h) => hopUp(h, 0.14, 0.3));
      p.hop += 0.2 * bump(t, b.one - 0.05 + delay, 0.3) + 0.2 * bump(t, b.two - 0.05 + delay, 0.3);
      if (frozen) {
        p.armL = 0.8 + (i % 2) * 0.3;
        p.armR = 0.3 + (i % 3) * 0.3;
        p.tilt = i % 2 ? 0.12 : -0.12;
        p.crouch = 0.25;
        p.blink = 0;
      }
      const breathe = win(t, b.breathe, SECTIONS.chorus3 - 1.5, 0.4);
      const br = Math.sin((t - b.breathe) * 1.6);
      p.squash -= 0.12 * br * breathe;
      p.croak = Math.max(p.croak, 0.35 * Math.max(0, br) * breathe);
      p.blink = Math.max(p.blink, 0.6 * breathe);
      p.crouch += 0.6 * smooth(SECTIONS.chorus3 - 1.2, SECTIONS.chorus3 - 0.1, t);
    } else if (section === "outro") {
      const o = this.out;
      groove(0.6 * (1 - smooth(o.ribbit, o.stop, t)) + 0.1);
      p.croak = Math.max(p.croak, 0.6 * bump(t, o.ribbit - 0.05, 0.5));
      const bow = win(t, o.bow, o.hop - 0.35, 0.25);
      p.lean += 0.6 * bow;
      p.nod -= 0.3 * bow;
      hopUp(o.hop, 0.55, 0.55);
      p.armL += 1.0 * smooth(o.hop + 0.5, o.hop + 0.8, t);
      p.armR += 1.0 * smooth(o.hop + 0.5, o.hop + 0.8, t);
    }
    return p;
  }

  shots(t, section) {
    const L = this.leadNow;
    const c = this.choruses[section];
    if (section === "open") {
      return [
        [SECTIONS.drop, (tt) => {
          const k = easeInOut((tt - SECTIONS.drop) / 2.4);
          return { pos: V(lerp(-1.5, 0.4, k), lerp(4.5, 1.6, k), lerp(11, 5.6, k)), look: V(0, lerp(0.8, 0.45, k), lerp(-1, 0.6, k)) };
        }, 0],
        [this.open.stop + 0.6, () => ({ pos: V(0.6, 2.2, 7.6), look: V(0, 0.4, -0.5) }), 1.0],
      ];
    }
    if (section === "verse1") {
      const v = this.v1;
      return [
        [SECTIONS.verse1, (tt) => ({ pos: V(0.5 + (tt - SECTIONS.verse1) * 0.05, 0.9, 3.9), look: V(0, 0.58, 0) }), 0.5],
        [v.ripples - 0.3, () => ({ pos: V(-2.4, 0.6, 4.8), look: V(0.8, 0.0, -1.0) }), 0.5],
        [v.legs - 0.3, () => ({ pos: V(2.5, 0.7, 2.9), look: V(0, 0.48, 0) }), 0.5],
        [v.push - 0.4, () => ({ pos: V(2.0, 2.4, 9.6), look: V(L.x * 0.6, 0.8, L.z * 0.6 + 0.4) }), 0.5],
        [v.front + 0.5, () => ({ pos: V(L.x + 3.6, L.y * 0.6 + 1.4, L.z + 4.4), look: V(L.x, L.y * 0.8 + 0.4, L.z) }), 0.5],
        [v.land - 0.2, () => ({ pos: V(5.6, 1.1, 5.0), look: V(3.5, 0.4, 1.5) }), 0.5],
        [SECTIONS.chorus1 - 1.1, () => ({ pos: V(0.4, 2.6, 8.4), look: V(0, 0.5, -0.4) }), 0.9],
      ];
    }
    if (c) {
      const side = c.name === "chorus2" ? -1 : 1;
      return [
        [c.start, (tt) => ({ pos: V(side * (1.2 - (tt - c.start) * 0.3), 2.2, 8.2), look: V(0, 0.4, -0.6) }), 0.6],
        ...c.ribbits.map((r, k) => [r - 0.08, () => ({ pos: V(side * (k % 2 ? 0.7 : -0.7), 0.85, 3.5), look: V(0, 0.64, 0) }), 0.12]),
        [c.hop - 0.12, () => ({ pos: V(0, 1.2, 6.8), look: V(0, 0.8, -0.6) }), 0.15],
        [c.bend - 0.2, (tt) => ({ pos: V(side * 2.5, 0.5, 5.2 - (tt - c.bend) * 0.3), look: V(0, 0.25, -0.5) }), 0.4],
        [c.ska - 0.2, (tt) => {
          const a = side * (tt - c.ska) * 0.25;
          return { pos: V(Math.sin(a) * 7.5, 1.8, Math.cos(a) * 7.5), look: V(0, 0.45, -0.6) };
        }, 0.4],
        [c.springs[0] - 0.2, () => ({ pos: V(0, 0.4, 5.6), look: V(0, 0.7, -0.6) }), 0.35],
        [c.soft - 0.2, (tt) => {
          const k = easeInOut((tt - c.soft) / 3);
          return { pos: V(0, lerp(1.4, 4.2, k), lerp(6.5, 10, k)), look: V(0, lerp(0.6, 1.4, k), -0.6) };
        }, 0.35],
        [c.endLine + 0.2, (tt) => {
          const a = side * (tt - c.endLine) * 0.35;
          return { pos: V(Math.sin(a) * 8.5, 2.6, Math.cos(a) * 8.5), look: V(0, 0.4, 0) };
        }, 0.6],
      ];
    }
    if (section === "verse2") {
      const v = this.v2;
      return [
        [SECTIONS.verse2, () => ({ pos: V(1.2, 1.0, 4.2), look: V(0, 0.56, 0) }), 0.6],
        [v.back - 0.3, () => ({ pos: V(L.x + 1.2, 2.6, L.z + 5.6), look: V(L.x * 0.7, 0.5, L.z * 0.7) }), 0.5],
        [v.feet[0] - 0.4, (tt) => ({ pos: V(-1.2 + (tt - v.feet[0]) * 0.2, 1.6, 7.4), look: V(0, 0.4, -0.6) }), 0.6],
        [v.ground - 0.2, () => ({ pos: V(0, 6.5, 8.5), look: V(0, 0, -0.5) }), 0.6],
        [v.rest - 0.2, () => ({ pos: V(-1.4, 0.85, 4.6), look: V(0, 0.52, -0.4) }), 0.5],
      ];
    }
    if (section === "bridge") {
      const b = this.br;
      return [
        [SECTIONS.bridge, (tt) => ({ pos: V(-1.5 + (tt - SECTIONS.bridge) * 0.1, 0.6, 7.0), look: V(0.3, 1.7, -2) }), 0.5],
        [b.small[0] - 0.3, () => ({ pos: V(0.4, 1.8, 7.6), look: V(0, 0.4, -0.6) }), 0.6],
        [b.breathe - 0.2, (tt) => ({ pos: V(0, 1.0, 4.4 - (tt - b.breathe) * 0.12), look: V(0, 0.5, -0.2) }), 0.6],
      ];
    }
    if (section === "outro") {
      const o = this.out;
      return [
        [SECTIONS.outro, (tt) => ({ pos: V(Math.sin((tt - SECTIONS.outro) * 0.2) * 2, 2.2, 8.4), look: V(0, 0.45, -0.5) }), 0.6],
        [o.bow - 0.3, () => ({ pos: V(0.3, 0.9, 4.2), look: V(0, 0.56, 0) }), 0.5],
        [o.hop + 0.3, (tt) => {
          const k = easeInOut((tt - o.hop - 0.3) / 1.2);
          return { pos: V(0, lerp(0.9, 4.0, k), lerp(4.2, 10, k)), look: V(0, lerp(0.56, 3, k), lerp(0, -16, k)) };
        }, 0.3],
      ];
    }
    return [[0, () => ({ pos: V(0, 2, 8), look: V(0, 0.5, 0) }), 0]];
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
    return { pos: prev.pos.clone().lerp(cur.pos, e), look: prev.look.clone().lerp(cur.look, e) };
  }

  /** Every landing sends out ripples. */
  ripples(t) {
    const list = [];
    for (const [, b, , to] of this.leaps) if (t >= b - 0.05) list.push([to[0], to[1], b, 1]);
    const add = (t0, k) => list.push(k < 0 ? [this.leadNow.x, this.leadNow.z, t0, 0.8] : [RING[k][0], RING[k][1], t0, 0.6]);
    for (const c of Object.values(this.choruses)) {
      for (const h of [c.hop + 0.5, ...c.heys.map((x) => x + 0.36), c.soft + 0.56]) if (t >= h) for (let k = -1; k < CREW; k += 3) add(h, k);
    }
    for (const sp of this.v2.tiny) if (t >= sp) add(sp + 0.25, -1);
    if (t >= this.v1.ripples) for (let k = 0; k < 3; k++) list.push([1.2, -0.6, this.v1.ripples + k * 0.5, 1]);
    list.sort((a, b) => b[2] - a[2]);
    const u = this.water.uniforms.uRipples.value;
    u.forEach((r, i) => (list[i] ? r.set(...list[i]) : r.set(0, 0, -99, 0)));
  }

  update(t, section) {
    const { timing } = this.ctx;
    const kick = timing.pulse(t, 0.14);
    const chorus = this.choruses[section];
    const night = smooth(SECTIONS.chorus2 - 4, SECTIONS.bridge + 2, t) * 0.55 + smooth(SECTIONS.bridge + 8, SECTIONS.chorus3, t) * 0.45;

    // Frogs.
    const L = this.leadAt(t);
    this.leadNow = L;
    const lp = this.frogPose(t, -1, section);
    lp.x = L.x;
    lp.z = L.z;
    lp.y = L.y;
    if (L.air) {
      lp.yaw = L.dir * 0.9;
      lp.stretch = Math.max(lp.stretch, Math.sin(L.u * Math.PI) * 1.1);
      lp.pitch = lerp(-0.5, 0.4, L.u);
      lp.armL = Math.max(lp.armL, 0.5);
      lp.armR = Math.max(lp.armR, 0.5);
    } else {
      lp.squash += 0.6 * decay(t, L.land, 0.1);
      const toCam = Math.atan2(this.camera.position.x - L.x, this.camera.position.z - L.z);
      lp.yaw += toCam * 0.25;
    }
    if (section === "bridge" && L.air) lp.yaw = L.u * Math.PI * 2;
    this.lead.pose(lp);
    this.crew.forEach((f, i) => {
      const [x, z] = RING[i];
      const p = this.frogPose(t, i, section);
      const rise = this.open.rise[i];
      const up = smooth(rise - 0.1, rise + 0.35, t);
      p.x = x;
      p.z = z;
      p.y += lerp(-0.9, 0, up) + 0.25 * bump(t, rise + 0.1, 0.35);
      p.yaw += Math.atan2(-x * 0.6, 2.4) + Math.atan2(L.x - x, L.z - z) * 0.15;
      f.group.visible = t >= rise - 0.1;
      f.pose(p);
    });

    // World.
    this.sky.uniforms.uTime.value = t;
    this.sky.uniforms.uNight.value = night;
    this.sky.uniforms.uPulse.value = chorus ? kick : 0;
    this.water.uniforms.uTime.value = t;
    this.water.uniforms.uNight.value = night;
    this.ripples(t);
    const bf = timing.beatFloat(t);
    const rock = (chorus ? 0.12 : 0.05) * Math.sin(Math.PI * bf);
    this.reeds.forEach((r, k) => r.blades.forEach(({ b, phase }) => (b.rotation.z = rock + Math.sin(t * 1.3 + phase) * 0.05 + (k % 2 ? 0.02 : -0.02))));
    this.hemi.intensity = lerp(1.05, 0.85, night);
    this.hemi.color.set(night > 0.5 ? "#d8e0ff" : "#fff0f4");
    this.key.intensity = lerp(1.4, 1.0, night);
    this.key.color.set(night > 0.5 ? "#e6ecff" : "#fff1e0");
    this.rim.intensity = lerp(0.9, 0.5, night);

    // Fireflies at dusk.
    const fp = this.flies.geometry.attributes.position;
    const shown = Math.floor(FLIES * (0.08 + night * 0.92));
    for (let k = 0; k < FLIES; k++) {
      if (k >= shown) {
        fp.setXYZ(k, 0, -99, 0);
        continue;
      }
      const a = hash(k * 1.3) * 6.28 + t * (0.15 + hash(k) * 0.2);
      const r = 2 + hash(k * 2.1) * 7;
      fp.setXYZ(k, Math.cos(a) * r, 0.4 + hash(k * 3.7) * 2.2 + Math.sin(t * 1.1 + k) * 0.25, Math.sin(a) * r * 0.7 - 1);
    }
    fp.needsUpdate = true;
    this.flies.material.opacity = 0.35 + night * 0.65 * (0.75 + 0.25 * Math.sin(t * 3));
    this.updateSparks(t, section);

    // Camera.
    const pose = this.cameraPose(t, section);
    this.camera.position.copy(pose.pos);
    this.camera.lookAt(pose.look);
    this.camera.fov = 42 - (chorus ? kick * 1.8 : kick * 0.6);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();

    const post = { bloom: [0.3, 0.4, 0.95], ca: 0.08 + kick * (chorus ? 0.18 : 0.05), vignette: 0.18, grain: 0.008 };
    return this.hudAndPost(t, section, post, chorus);
  }

  updateSparks(t, section) {
    const bursts = [];
    const c = this.choruses[section];
    const lotus = ["#ffffff", "#ff9cc4", "#ffd23f", "#7fe0ff"];
    if (c) c.hoorays.forEach((h, k) => [0, 1, 2].forEach((j) => bursts.push({ t0: h + j * 0.12, pos: [(j - 1) * 2.6, 2.6 + j * 0.4, -1.5], color: lotus, speed: 2.6, life: 1.4, count: 60, seed: k * 7 + j })));
    if (section === "open") bursts.push({ t0: this.open.stop, pos: [0, 0.9, 0], color: ["#ffffff", COLORS.stop], speed: 1.6, life: 0.6, count: 40, seed: 30 });
    if (section === "verse2") this.v2.tiny.forEach((tt, k) => bursts.push({ t0: tt, pos: [this.leadNow.x, 0.6, this.leadNow.z], color: ["#ffffff"], speed: 0.8, life: 1.6, count: 6, seed: 50 + k, gravity: 0.15 }));
    if (section === "outro") [0, 1, 2, 3, 4].forEach((j) => bursts.push({ t0: this.out.hop + 0.5 + j * 0.12, pos: [(j - 2) * 2.4, 3 + (j % 2), -2], color: ["#ffe680", "#ffffff", "#ff9cc4"], speed: 3, life: 1.6, count: 70, seed: 80 + j }));
    const pos = this.sparks.geometry.attributes.position;
    const col = this.sparks.geometry.attributes.color;
    const tc = new THREE.Color();
    let n = 0;
    for (const b of bursts) {
      const age = t - b.t0;
      if (age < 0 || age > b.life) continue;
      for (let s = 0; s < b.count && n < 1600; s++, n++) {
        const seed = b.seed * 131 + s;
        const th = hash(seed * 1.3) * Math.PI * 2;
        const ph = Math.acos(hash(seed * 2.9) * 2 - 1);
        const r = (b.speed * (0.5 + hash(seed * 4.7) * 0.7) * (1 - Math.exp(-age * 3.5))) / 1.2;
        pos.setXYZ(n, b.pos[0] + Math.sin(ph) * Math.cos(th) * r, b.pos[1] + Math.cos(ph) * r - age * age * (b.gravity ?? 1.0), b.pos[2] + Math.sin(ph) * Math.sin(th) * r);
        tc.set(b.color[s % b.color.length]).multiplyScalar(0.95 * Math.max(0, 1 - age / b.life));
        col.setXYZ(n, tc.r, tc.g, tc.b);
      }
    }
    for (let i = n; i < 1600; i++) pos.setXYZ(i, 0, -99, 0);
    pos.needsUpdate = true;
    col.needsUpdate = true;
  }

  /** Screen position of a frog part, for labels. */
  screenOf(obj) {
    const v = new THREE.Vector3();
    obj.getWorldPosition(v);
    v.project(this.camera);
    return [(v.x * 0.5 + 0.5) * 1080, (-v.y * 0.5 + 0.5) * 1920];
  }

  hudAndPost(t, section, post, c) {
    const { hud } = this.ctx;
    const Y = 440;
    const flash = (t0, amt, tau = 0.1) => {
      if (t >= t0) post.flash = Math.max(post.flash || 0, amt * Math.exp(-(t - t0) / tau));
    };
    if (section === "open") {
      hud.slam(TITLE.line, t, SECTIONS.drop + 0.2, this.open.hop - 0.4, { y: Y - 40, size: 120, color: TITLE.accent, sub: TITLE.kicker, angle: -0.04 });
      hud.stamp("HOP!", t, this.open.hop, { x: 540, y: Y, size: 150, color: COLORS.hop, angle: -0.1, life: 0.9 });
      hud.stamp("STOP!", t, this.open.stop, { x: 540, y: Y + 20, size: 150, color: COLORS.stop, angle: 0.08, life: 1.2 });
      flash(SECTIONS.drop, 0.6, 0.12);
      flash(this.open.stop, 0.25);
    }
    if (section === "verse1") {
      const v = this.v1;
      hud.slam("SIT LOW", t, SECTIONS.verse1 + 0.1, v.ripples - 0.4, { y: Y, size: 170, color: COLORS.bend, sub: "beside the pond" });
      hud.slam("RIPPLES", t, v.ripples, v.legs - 0.4, { y: Y, size: 170, color: COLORS.ribbit });
      hud.slam("LONG BACK LEGS", t, v.legs, v.push - 0.15, { y: Y, size: 120, color: COLORS.leg, sub: "folded up tight" });
      hud.stamp("PUSH!", t, v.push, { x: 540, y: Y, size: 150, color: COLORS.hop, angle: -0.1, life: 0.8 });
      hud.slam("TAKE FLIGHT", t, v.flight, v.front - 0.2, { y: Y, size: 140, color: COLORS.ribbit });
      hud.slam("SHORT FRONT LEGS", t, v.front, v.land - 0.2, { y: Y, size: 110, color: COLORS.hooray, sub: "reach ahead to land" });
      hud.stamp("LAND!", t, v.land, { x: 540, y: Y, size: 150, color: COLORS.hop, angle: 0.08, life: 1.0 });
      flash(SECTIONS.verse1, 0.4);
      flash(v.push, 0.2);
      flash(v.land, 0.2);
    }
    if (c) {
      c.ribbits.forEach((r, k) => hud.stamp("RIBBIT!", t, r, { x: k % 2 ? 690 : 390, y: Y + (k > 1 ? 120 : 0), size: 110, color: COLORS.ribbit, angle: k % 2 ? 0.1 : -0.1, life: Math.min(0.6, c.hop - r - 0.05) }));
      hud.slam("HOP!", t, c.hop, c.bend - 0.3, { y: Y, size: 210, color: COLORS.hop });
      hud.slam("BEND DOWN LOW", t, c.bend, c.stop - 0.1, { y: Y, size: 120, color: COLORS.bend });
      hud.stamp("STOP!", t, c.stop, { x: 540, y: Y, size: 170, color: COLORS.stop, angle: -0.06, life: 0.8 });
      c.heys.forEach((h, k) => hud.stamp("HEY!", t, h, { x: [380, 540, 700][k], y: Y, size: 130, color: COLORS.hey, angle: k % 2 ? 0.12 : -0.12, life: 0.5 }));
      hud.slam("SPRING!", t, c.springs[0], c.soft - 0.2, { y: Y, size: 170, color: COLORS.hop, sub: "the safe small way" });
      hud.slam("HOORAY!", t, c.hoorays[0], c.endLine + 0.3, { y: Y, size: 180, color: COLORS.hooray });
      [...c.ribbits, c.hop, c.stop, ...c.heys].forEach((x) => flash(x, 0.15, 0.07));
      flash(c.start, 0.5, 0.12);
      c.hoorays.forEach((h) => flash(h, 0.3, 0.12));
      post.ca += 0.1 * this.ctx.timing.pulse(t, 0.14);
    }
    if (section === "verse2") {
      const v = this.v2;
      const legs = [this.lead.arms[0].hand, this.lead.arms[1].hand, this.lead.legs[0].foot, this.lead.legs[1].foot];
      v.four.forEach((ft, k) => {
        if (t < ft || t > v.back - 0.2) return;
        const [x, y] = this.screenOf(legs[k]);
        const a = smooth(ft, ft + 0.12, t) * (1 - smooth(v.back - 0.5, v.back - 0.2, t));
        hud.text(String(k + 1), x, y - 90, { size: Math.round(96 + 50 * decay(t, ft, 0.15)), weight: 800, family: FONT_COND, color: COLORS.leg, alpha: a, glow: 14 });
      });
      hud.slam("FOUR LEGS", t, v.four[0], v.back - 0.2, { y: Y, size: 170, color: COLORS.leg, sub: "neat and strong" });
      hud.slam("LEAP ALONG", t, v.back, v.feet[0] - 0.3, { y: Y, size: 160, color: COLORS.hop });
      hud.slam("FEET TOGETHER", t, v.feet[0], v.tiny[0] - 0.2, { y: Y, size: 130, color: COLORS.ribbit });
      hud.slam("TINY HOPS", t, v.tiny[0], v.ground - 0.2, { y: Y, size: 170, color: COLORS.hooray, sub: "light as feathers" });
      hud.slam("OPEN GROUND", t, v.ground, v.rest - 0.2, { y: Y, size: 150, color: COLORS.hop, sub: "stay dry and safe" });
      hud.slam("REST", t, v.rest, v.look - 0.1, { y: Y, size: 200, color: COLORS.bend, sub: "when you're tired" });
      flash(SECTIONS.verse2, 0.35);
      if (t > SECTIONS.chorus2 - 0.25) post.flash = Math.max(post.flash || 0, smooth(SECTIONS.chorus2 - 0.25, SECTIONS.chorus2, t) * 0.5);
    }
    if (section === "bridge") {
      const b = this.br;
      hud.slam("BIG LEAP", t, b.leap + 0.3, b.small[0] - 0.3, { y: Y, size: 170, color: COLORS.leg, sub: "long back legs" });
      hud.slam("SMALL HOPS", t, b.small[0], b.one - 0.1, { y: Y, size: 160, color: COLORS.hooray, sub: "not steep" });
      hud.stamp("1", t, b.one, { x: 400, y: Y, size: 180, color: COLORS.ribbit, angle: -0.08, life: b.freeze - b.one });
      hud.stamp("2", t, b.two, { x: 680, y: Y, size: 180, color: COLORS.ribbit, angle: 0.08, life: b.freeze - b.two });
      hud.stamp("FREEZE!", t, b.freeze, { x: 540, y: Y + 10, size: 160, color: COLORS.stop, angle: -0.05, life: b.breathe - b.freeze });
      hud.slam("BREATHE IN", t, b.breathe, SECTIONS.chorus3 - 1.2, { y: Y, size: 150, color: COLORS.ribbit, sub: "slowly, nice and calm" });
      flash(SECTIONS.bridge, 0.25, 0.2);
      flash(b.freeze, 0.35);
      if (t >= b.freeze && t < b.breathe) post.sat = 0.7;
      if (t > SECTIONS.chorus3 - 0.2) post.flash = Math.max(post.flash || 0, smooth(SECTIONS.chorus3 - 0.2, SECTIONS.chorus3, t) * 0.6);
    }
    if (section === "outro") {
      const o = this.out;
      hud.slam("RIBBIT…", t, o.ribbit, o.stop - 0.1, { y: Y, size: 160, color: COLORS.ribbit });
      hud.stamp("STOP", t, o.stop, { x: 540, y: Y, size: 150, color: COLORS.stop, angle: -0.06, life: o.bow - o.stop });
      hud.slam("TAKE A BOW", t, o.bow, o.hop - 0.1, { y: Y, size: 150, color: COLORS.hooray });
      hud.slam("TA-DA!", t, o.hop + 0.3, SECTIONS.end - 0.2, { y: Y, size: 200, color: COLORS.hop });
      flash(SECTIONS.outro, 0.3, 0.15);
      if (t > SECTIONS.end - 0.3) post.flash = Math.max(post.flash || 0, smooth(SECTIONS.end - 0.3, SECTIONS.end, t));
    }
    post.flash = (post.flash || 0) * 0.4;
    return post;
  }
}
