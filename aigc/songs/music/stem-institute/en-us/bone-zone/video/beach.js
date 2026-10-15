import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { FONT_COND, FONT_MONO } from "@gizclaw/mvg-core/hud.js";
import { clamp, easeInOut, lerp, smooth } from "@gizclaw/mvg-core/timing.js";
import { BONES, BRIDGE, CHORUSES, COUNT, LIGAMENT, MUSCLE, OUTRO, PRE, SECTIONS, VERSE1, VERSE2 } from "./constants.js";
import { Skeleton } from "./skeleton.js";
import { SKY, Shore } from "./shore.js";

const FOV = 30;
const TAN = Math.tan(((FOV / 2) * Math.PI) / 180);
const TOP_Y = 330;
const TAU = Math.PI * 2;
const BOARD_TOP = 0.1;

// Camera views: world point (x, y) shown on screen row Y from distance z.
const VIEWS = {
  wide: { x: 0, y: 0.95, z: 8.2, Y: 836 },
  chorus: { x: 0, y: 0.95, z: 8.2, Y: 836 },
  bridge: { x: 0, y: 0.95, z: 9.2, Y: 885 },
  skull: { x: 0, y: 1.76, z: 2.4, Y: 760 },
  ribs: { x: 0, y: 1.4, z: 3.1, Y: 790 },
  spine: { x: 0, y: 1.25, z: 4.2, Y: 800 },
  clavicle: { x: 0, y: 1.6, z: 2.8, Y: 760 },
  femur: { x: 0, y: 0.75, z: 3.9, Y: 870 },
  knee: { x: -0.1, y: 0.56, z: 1.75, Y: 800 },
};
const GROUPS = {
  skull: ["skull"],
  ribs: ["ribs"],
  spine: ["spine"],
  clavicle: ["clavicle0", "clavicle1"],
  femur: ["femur"],
  pelvis: ["pelvis"],
  joint: ["shoulder", "elbow", "hip", "knee"],
};
const MAT_COLOR = {
  skull: BONES.skull.color, ribs: BONES.ribs.color, spine: BONES.spine.color, clavicle0: BONES.clavicle.color, clavicle1: BONES.clavicle.color,
  pelvis: BONES.pelvis.color, femur: BONES.femur.color, arm: "#ffffff", shin: "#ffffff",
  shoulder: BONES.joint.color, elbow: BONES.joint.color, hip: BONES.joint.color, knee: BONES.joint.color,
};
const ROLL = ["skull", "clavicle", "ribs", "spine", "pelvis", "femur"];
const JOINT_WORDS = [["shoulders", "shoulder"], ["elbows", "elbow"], ["hips", "hip"], ["knees", "knee"]];

const win = (t, t0, t1, a = 0.06, b = 0.25) => smooth(t0 - a, t0 + a, t) * (1 - smooth(t1 - b, t1, t));
const kick = (t, t0, life) => (t >= t0 ? Math.exp(-(t - t0) / life) : 0);

export class BeachScene {
  constructor(ctx) {
    this.ctx = ctx;
    const { timing, renderer } = ctx;
    this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.12;
    this.camera = new THREE.PerspectiveCamera(FOV, 9 / 16, 0.05, 200);
    const moon = new THREE.DirectionalLight("#a9c0ff", 1.5);
    moon.position.set(3, 6, 2);
    const rim = new THREE.DirectionalLight("#7f9cff", 1.1);
    rim.position.set(-2, 3, -5);
    this.scene.add(moon, rim, new THREE.HemisphereLight("#3a4a80", "#20160f", 0.5));

    this.bgU = { uTime: { value: 0 }, uKick: { value: 0 }, uSwell: { value: 0 } };
    const bg = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({ depthTest: false, depthWrite: false, uniforms: this.bgU, vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }", fragmentShader: SKY }),
    );
    bg.renderOrder = -1;
    bg.frustumCulled = false;
    this.scene.add(bg);

    this.shore = new Shore(this.scene);
    this.rig = new Skeleton();
    this.rig.root.position.y = BOARD_TOP;
    this.scene.add(this.rig.root);
    this.baseColor = new THREE.Color("#e6dcc4");
    this.tint = new THREE.Color();
    this.tmp = new THREE.Vector3();
    this.buildTimeline(timing);
  }

  buildTimeline(timing) {
    const cue = (i) => timing.cues[i];
    const w = (ci, word, n = 0) => timing.wordTime(ci, word, n) ?? cue(ci).start;
    const v1 = VERSE1;
    const v2 = VERSE2;

    const shots = [
      [SECTIONS.verse1, "wide", 0.01],
      [cue(v1.skull).start - 0.35, "skull"],
      [cue(v1.ribs).start - 0.3, "ribs"],
      [cue(v1.column).start - 0.45, "spine", 1.1],
      [cue(v1.clavicles).start - 0.4, "clavicle"],
      [cue(PRE.support).start - 0.3, "wide"],
      [SECTIONS.chorus1, "chorus", 0.4],
      [cue(v2.femur).start - 0.5, "femur"],
      [cue(v2.joint).start - 0.4, "wide"],
      [cue(v2.ligaments).start - 0.45, "knee"],
      [cue(v2.living).start - 0.4, "wide"],
      [SECTIONS.bridge, "bridge"],
      [SECTIONS.chorus2, "chorus", 0.4],
      [SECTIONS.outro, "wide", 1.6],
    ];
    this.shots = shots.map(([t, v, dur = 0.9]) => ({ t, v: VIEWS[v], dur }));
    this.shots.forEach((s, i) => (s.from = i ? this.viewSeg(this.shots[i - 1], s.t) : s.v));

    this.six = w(v1.count, "six");
    this.living = w(v1.frame, "living");
    this.countEnd = cue(v1.frame).end + 0.4;

    this.captions = [
      [w(v1.skull, "skull"), cue(v1.skull).end + 0.1, "SKULL", "protects the brain", "skull"],
      [w(v1.ribs, "ribs"), cue(v1.ribs).end + 0.5, "RIBS", "shield the heart and lungs", "ribs"],
      [w(v1.column, "vertebral"), cue(v1.column).end + 0.6, "VERTEBRAL COLUMN", "supports the back", "spine"],
      [w(v1.stack, "vertebrae"), cue(v1.stack).end + 0.5, "VERTEBRAE", "a flexible stack", "spine"],
      [w(v1.clavicles, "clavicles"), cue(v1.clavicles).end, "CLAVICLES", "the collarbones", "clavicle"],
      [cue(v1.link).start, cue(v1.link).end + 0.4, "CLAVICLES", "link shoulders to the chest", "clavicle"],
      [w(v2.femur, "femur"), cue(v2.femur).end + 0.2, "FEMUR", "the thigh bone", "femur"],
      [cue(v2.longest).start, cue(v2.longest).end + 0.3, "FEMUR", "the longest bone in the body", "femur"],
      [w(v2.joint, "joint"), cue(v2.joints).end + 0.6, "JOINTS", "where bones meet", "joint"],
      [w(v2.ligaments, "ligaments"), cue(v2.ligaments).end + 0.2, "LIGAMENTS", "connect bone to bone", null, LIGAMENT],
      [w(v2.tendons, "tendons"), cue(v2.tendons).end + 0.3, "TENDONS", "connect muscle to bone", null, MUSCLE],
      [w(v2.living, "living"), cue(v2.living).end + 0.2, "LIVING TISSUE", "bones grow as we grow", null, "#ff9ab8"],
      [w(v2.muscles, "muscles"), cue(v2.muscles).end + 0.6, "BONES + MUSCLES", "working together", null, MUSCLE],
      [cue(OUTRO.framework).start, cue(OUTRO.framework).end + 0.4, "LIVING FRAMEWORK", "support · protect · move", null, COUNT],
    ].map(([t0, t1, name, note, bone, color]) => ({ t0, t1, name, note, bone, color: color || BONES[bone].color }));
    this.jointWords = JOINT_WORDS.map(([word, mat]) => ({ word, mat, t0: w(v2.joints, word) }));
    this.sides = [["right", 0], ["left", 1]].map(([word, side]) => ({ word: word.toUpperCase(), side, t0: w(v1.clavicles, word), t1: cue(v1.clavicles).end + 0.2 }));
    this.longest = { t0: w(v2.longest, "longest"), t1: cue(v2.longest).end + 0.3 };

    // Glow windows per material.
    const glow = Object.fromEntries(Object.keys(MAT_COLOR).map((k) => [k, []]));
    const light = (bone, t0, t1) => {
      const mats = bone === "all" ? Object.keys(MAT_COLOR) : GROUPS[bone] || [bone];
      for (const m of mats) glow[m].push([t0, t1]);
    };
    for (const c of this.captions) if (c.bone) light(c.bone, c.t0, c.t1);
    for (const s of this.sides) light(`clavicle${s.side}`, s.t0, s.t0 + 0.8);
    for (const j of this.jointWords) light(j.mat, j.t0, cue(v2.joints).end + 0.6);
    light("all", this.six, this.six + 0.7);
    light("pelvis", w(v1.column, "supports"), cue(v1.column).end);
    light("all", w(PRE.support, "frame"), w(PRE.support, "frame") + 0.8);

    const c10 = cue(PRE.name);
    const b0 = timing.beatIndexAt(c10.start - 0.1) + 1;
    this.roll = ROLL.map((bone, k) => {
      const t0 = timing.beatTime(b0 + k * 2);
      light(bone, t0, t0 + timing.period * 2);
      return { bone, t0, t1: t0 + timing.period * 2 - 0.05 };
    });
    this.stamps = [
      ["SUPPORT", w(PRE.support, "support"), "#7ce8ff"],
      ["PROTECT", w(PRE.support, "protect"), "#ff8fb0"],
      ["FRAME", w(PRE.support, "frame"), COUNT],
    ];

    this.slams = [];
    this.punches = [];
    this.hops = [];
    this.bends = [];
    this.spins = [];
    this.shrugs = [];
    this.kicks = [];
    this.flashes = [];
    for (const c0 of CHORUSES) {
      const bone = w(c0, "bone");
      const two = w(c0, "two");
      this.slams.push({ text: "BONE ZONE", t0: bone, t1: two - 0.05, color: "#ffffff", size: 120 });
      this.slams.push({ text: "206", t0: two, t1: cue(c0 + 1).start - 0.1, color: COUNT, size: 190, stamp: true });
      light("all", two, two + 0.6);
      this.hops.push(two);
      this.flashes.push(two);
      const joints = w(c0 + 1, "joints");
      light("joint", joints, joints + 0.9);
      this.bends.push(w(c0 + 1, "bends"));
      this.slams.push({ text: "BEND!", t0: w(c0 + 1, "bends"), t1: cue(c0 + 2).start - 0.1, color: BONES.joint.color, size: 130 });
      const names = [["skull", "skull"], ["clavicle", "clavicle"], ["ribs", "ribs"], ["spine", "spine"]].map(([word, b]) => [w(c0 + 2, word), b]);
      names.push([w(c0 + 3, "femur"), "femur"]);
      names.forEach(([t0, b], k) => {
        const t1 = k < names.length - 1 ? names[k + 1][0] - 0.04 : cue(c0 + 4).start - 0.1;
        this.slams.push({ text: BONES[b].name, t0, t1, color: BONES[b].color, size: 130 });
        light(b, t0, t0 + 0.9);
        this.punches.push({ t0, bone: b });
        if (b === "spine") this.spins.push(t0);
        if (b === "clavicle") this.shrugs.push(t0);
        if (b === "femur") this.kicks.push(t0);
      });
      const two2 = w(c0 + 4, "two");
      this.slams.push({ text: "BONE ZONE", t0: w(c0 + 4, "bone"), t1: two2 - 0.05, color: "#ffffff", size: 120 });
      this.slams.push({ text: "206", t0: two2, t1: cue(c0 + 5).start - 0.1, color: COUNT, size: 190, stamp: true });
      light("all", two2, two2 + 0.6);
      this.hops.push(two2);
      this.flashes.push(two2);
      const sp = [["support", "SUPPORT", "#7ce8ff"], ["protect", "PROTECT", "#ff8fb0"], ["move", "MOVE!", COUNT]].map(([word, text, color]) => [w(c0 + 5, word), text, color]);
      sp.forEach(([t0, text, color], k) => this.slams.push({ text, t0, t1: k < 2 ? sp[k + 1][0] - 0.04 : cue(c0 + 5).end + 0.3, color, size: 130, stamp: true }));
    }

    this.quiz = BRIDGE.map((b, k) => {
      const tA = w(b.cue, b.word);
      const next = k < BRIDGE.length - 1 ? cue(BRIDGE[k + 1].cue).start - 0.05 : SECTIONS.chorus2 - 0.1;
      light(b.bone, tA, next);
      this.hops.push(tA);
      if (b.bone !== "all") this.punches.push({ t0: tA, bone: b.bone, low: 170 });
      if (b.bone === "spine") this.spins.push(tA);
      else this.flashes.push(tA);
      return { ...b, t0: cue(b.cue).start, tA, t1: next, color: b.bone === "all" ? COUNT : BONES[b.bone].color };
    });

    this.final = { t0: w(OUTRO.count, "two"), t1: SECTIONS.end };
    light("all", this.final.t0, this.final.t1 + 1);
    this.flashes.push(this.final.t0);
    this.glow = glow;

    this.ripples = [w(v1.stack, "vertebrae"), w(v1.stack, "stack"), ...this.spins];
    this.xray = [[w(v1.skull, "skull") - 0.1, cue(v1.skull).end + 0.1], [this.quiz[0].tA - 0.05, this.quiz[0].t1]];
    this.organs = [[w(v1.ribs, "ribs") - 0.05, cue(v1.ribs).end + 0.5], [this.quiz[1].tA - 0.05, this.quiz[1].t1]];
    this.spineShow = [cue(v1.column).start - 0.45, cue(v1.stack).end + 0.2];
    this.clavShow = [cue(v1.clavicles).start - 0.2, cue(v1.link).end + 0.2];
    this.femurShow = [cue(v2.femur).start - 0.3, cue(v2.longest).end + 0.2];
    this.kneeShow = [cue(v2.ligaments).start - 0.3, cue(v2.tendons).end + 0.3];
    this.ligament = [w(v2.ligaments, "ligaments") - 0.05, cue(v2.tendons).end + 0.3];
    this.muscle = [[w(v2.tendons, "tendons") - 0.05, cue(v2.tendons).end + 0.3], [w(v2.muscles, "muscles") - 0.05, cue(v2.muscles).end + 0.6]];
    this.grow = { t0: cue(v2.living).start, t1: w(v2.living, "grow") + 0.3, end: cue(v2.living).end + 0.4 };
    this.flex = [cue(v2.muscles).start, cue(v2.muscles).end + 0.4];
  }

  viewSeg(k, t) {
    const u = easeInOut((t - k.t) / k.dur);
    const v = {};
    for (const key of ["x", "y", "z", "Y"]) v[key] = lerp(k.from[key], k.v[key], u);
    return v;
  }

  viewAt(t) {
    let i = 0;
    for (let k = 0; k < this.shots.length && this.shots[k].t <= t; k++) i = k;
    return this.viewSeg(this.shots[i], t);
  }

  glowOf(mat, t) {
    let v = 0;
    for (const [t0, t1] of this.glow[mat]) if (t > t0 - 0.1 && t < t1 + 0.1) v = Math.max(v, win(t, t0, t1, 0.05, 0.3));
    return v;
  }

  anyWin(list, t, a = 0.15, b = 0.3) {
    return list.reduce((m, [t0, t1]) => Math.max(m, win(t, t0, t1, a, b)), 0);
  }

  poseAt(t, section, bf, beat) {
    const { timing } = this.ctx;
    const ch = section.startsWith("chorus") ? 1 : 0;
    const amp = ch ? 1 : section === "bridge" || section === "outro" ? 0.8 : 0.6;
    const side = Math.cos(bf * Math.PI);
    const assembled = smooth(this.six - 0.2, this.six + 0.6, t);
    const live = assembled * amp;
    const p = {
      x: side * 0.035 * live,
      y: 0,
      yaw: side * 0.12 * live,
      scale: 1,
      squat: 0.08 + 0.16 * beat * live,
      stance: 0.17,
      lean: 0.06 + 0.06 * beat * live,
      bend: side * 0.2 * live,
      twist: -side * 0.25 * live,
      nod: 0.14 * beat * live,
      jaw: 0,
      arms: [0, 1].map((i) => {
        const wave = 0.5 + 0.5 * Math.sin(bf * Math.PI + i * Math.PI);
        const up = 0.5 + 0.5 * Math.cos((bf - i) * Math.PI);
        return {
          raise: lerp(0.18, lerp(1.05 + 0.2 * (i ? side : -side), 1.0 + 1.5 * up, ch), assembled),
          fwd: lerp(0.05, lerp(0.25, 0.1, ch), assembled),
          elbow: lerp(0.15, lerp(0.3 + 0.45 * wave, 0.25 + 0.7 * (1 - up), ch), assembled),
        };
      }),
      legs: [{ lift: 0, knee: 0 }, { lift: 0, knee: 0 }],
      shrug: [0, 0],
      pop: new Array(12).fill(0),
    };

    // Spine: turn around, sway the stack, ripple the vertebrae.
    const sp = win(t, ...this.spineShow, 0.4, 0.5);
    p.yaw = lerp(p.yaw, Math.PI * 0.92 + side * 0.08, sp);
    p.bend = lerp(p.bend, side * 0.55, sp);
    for (const r of this.ripples) for (let i = 0; i < 12; i++) p.pop[i] = Math.max(p.pop[i], kick(t, r + i * 0.045, 0.14));
    for (const s0 of this.spins) {
      const k = clamp((t - s0) / 0.7, 0, 1);
      p.yaw += TAU * easeInOut(k);
    }

    // Clavicles: shrug on the beat, each side on its word.
    const cl = win(t, ...this.clavShow, 0.2, 0.3);
    p.shrug = [0, 1].map((i) => cl * 0.6 * beat + this.sides.filter((s) => s.side === i).reduce((m, s) => Math.max(m, kick(t, s.t0, 0.35)), 0));
    for (const s0 of this.shrugs) p.shrug = p.shrug.map((v) => Math.max(v, kick(t, s0, 0.3)));

    // Joints flex one pair at a time.
    const jw = this.jointWords.map((j, k) => win(t, j.t0, (this.jointWords[k + 1]?.t0 ?? j.t0 + 1.4) + 0.1, 0.06, 0.15));
    p.arms.forEach((a) => {
      a.raise = lerp(a.raise, 2.5, jw[0]);
      a.elbow = lerp(a.elbow, 1.9, jw[1]);
      a.raise = lerp(a.raise, 0.5, jw[1]);
      a.fwd = lerp(a.fwd, 0.6, jw[1]);
    });
    p.legs[1].lift += 0.9 * jw[2];
    p.legs[1].knee += 1.2 * jw[2];
    p.squat = lerp(p.squat, 0.55 + 0.1 * beat, jw[3]);

    // Femur: alternate knee lifts; knee close-up: slow deep bends.
    const fm = win(t, ...this.femurShow, 0.3, 0.3);
    p.legs.forEach((l, i) => {
      const lift = Math.max(0, Math.sin((bf / 2 + i * 0.5) * Math.PI));
      l.lift += fm * 0.5 * lift;
      l.knee += fm * 0.7 * lift;
    });
    const kn = win(t, ...this.kneeShow, 0.3, 0.3);
    p.squat = lerp(p.squat, 0.12 + 0.42 * (0.5 - 0.5 * Math.cos(bf * (Math.PI / 2))), kn);
    p.arms.forEach((a) => (a.fwd = lerp(a.fwd, 1.2, kn)));

    // Living tissue: shrink to child size, then grow back on "grow".
    p.scale = 1 - 0.24 * smooth(this.grow.t0 - 0.3, this.grow.t0, t) * (1 - smooth(this.grow.t0 + 0.2, this.grow.t1, t));
    const fx = win(t, ...this.flex, 0.2, 0.3);
    p.arms.forEach((a, i) => {
      const curl = 0.5 + 0.5 * Math.cos((bf - i) * Math.PI);
      a.raise = lerp(a.raise, 1.45, fx);
      a.fwd = lerp(a.fwd, 0, fx);
      a.elbow = lerp(a.elbow, 0.6 + 1.3 * curl, fx);
    });

    // Chorus and bridge hits.
    for (const h of this.hops) {
      const k = (t - h) / 0.44;
      if (k > 0 && k < 1) {
        p.y += 0.2 * Math.sin(Math.PI * k);
        p.legs.forEach((l) => (l.knee += 0.5 * Math.sin(Math.PI * k)));
        p.arms.forEach((a) => (a.raise = lerp(a.raise, 2.6, Math.sin(Math.PI * k))));
      }
    }
    for (const b of this.bends) p.squat += 0.4 * kick(t, b, 0.35) * smooth(b - 0.05, b, t);
    for (const k0 of this.kicks) {
      const k = clamp((t - k0) / 0.6, 0, 1);
      const s = Math.sin(Math.PI * k);
      p.legs[0].lift += 0.9 * s;
      p.legs[0].knee += 0.6 * s;
    }
    const fin = smooth(this.final.t0 - 0.1, this.final.t0 + 0.25, t);
    p.arms.forEach((a) => {
      a.raise = lerp(a.raise, 2.45, fin);
      a.elbow = lerp(a.elbow, 0.15, fin);
      a.fwd = lerp(a.fwd, 0.1, fin);
    });

    // Sing along: the jaw drops on every sung word.
    const active = timing.cueAt(t);
    if (active) for (const word of active.cue.words) if (t >= word.start && t < word.start + 0.5) p.jaw = Math.max(p.jaw, Math.exp(-(t - word.start) / 0.12));
    p.jaw *= assembled;
    return p;
  }

  update(t, section) {
    const { timing } = this.ctx;
    const k = timing.pulse(t, 0.12);
    const bf = timing.beatFloat(t);
    const beat = 0.5 + 0.5 * Math.cos(bf * TAU);
    const loud = section.startsWith("chorus");

    const rig = this.rig;
    rig.assemble(clamp((t - SECTIONS.verse1 - 0.1) / (this.six - SECTIONS.verse1 - 0.1), 0, 1));
    rig.pose(this.poseAt(t, section, bf, beat));
    rig.soft({ muscle: this.anyWin(this.muscle, t), ligament: win(t, ...this.ligament, 0.15, 0.3), organs: this.anyWin(this.organs, t), xray: this.anyWin(this.xray, t, 0.12, 0.3) }, k);
    for (const [name, mat] of Object.entries(rig.mats)) {
      const g = this.glowOf(name, t);
      const color = MAT_COLOR[name];
      mat.emissive.set(color);
      mat.emissiveIntensity = 0.03 + g * 0.75 + k * 0.03 * (loud ? 1 : 0);
      mat.color.copy(this.baseColor).lerp(this.tint.set(color), g * 0.35);
    }

    // Camera: shot list, with chorus and quiz punch-ins toward the named bone.
    const view = this.viewAt(t);
    let best = null;
    for (const p of this.punches) if (p.t0 <= t + 0.04 && (!best || p.t0 > best.t0)) best = p;
    if (best && t - best.t0 < 1.0) {
      const a = smooth(best.t0 - 0.04, best.t0 + 0.08, t) * Math.exp(-Math.max(0, t - best.t0 - 0.25) / 0.3) * 0.7;
      const target = { ...VIEWS[best.bone] };
      target.Y += best.low || 0;
      for (const key of ["x", "y", "z", "Y"]) view[key] = lerp(view[key], target[key], a);
    }
    const upp = (2 * view.z * TAN) / 1920;
    const drift = Math.sin(t * 0.31) * 0.08;
    this.camera.position.set(view.x + drift, view.y - (960 - view.Y) * upp, view.z - k * (loud ? 0.12 : 0.05));
    const jolt = this.flashes.reduce((m, h) => Math.max(m, kick(t, h, 0.1)), 0);
    this.camera.rotation.set(0, drift * 0.02, Math.sin(t * 70) * 0.01 * jolt);
    this.camera.updateMatrixWorld();
    this.scene.updateMatrixWorld();

    this.bgU.uTime.value = t;
    this.bgU.uKick.value = k;
    this.bgU.uSwell.value = loud ? 1 : 0.3;
    this.shore.update(t, k, bf, loud);

    const post = { bloom: [loud ? 0.8 : 0.65, 0.45, 0.68], ca: 0.1 + k * (loud ? 0.3 : 0.15), vignette: 0.5, grain: 0.03 };
    const start = SECTIONS[section];
    if (start !== undefined && t - start < 0.3) post.flash = Math.exp(-(t - start) / 0.1) * 0.35;
    for (const h of this.flashes) {
      if (t >= h && t < h + 0.25) post.flash = Math.max(post.flash || 0, 0.3 * (1 - (t - h) / 0.25));
      if (t >= h && t < h + 0.5) post.shock = [0.5, 0.55, (t - h) * 1.2, 0.7];
    }
    if (t >= this.six && t < this.six + 0.25) post.flash = Math.max(post.flash || 0, 0.3 * (1 - (t - this.six) / 0.25));
    this.drawHud(t);
    return post;
  }

  screen(name) {
    this.rig.world(name, this.tmp).project(this.camera);
    return [(this.tmp.x * 0.5 + 0.5) * 1080, (-this.tmp.y * 0.5 + 0.5) * 1920];
  }

  tag(text, x, y, color, a, size = 34) {
    if (a <= 0) return;
    const { hud } = this.ctx;
    const ctx = hud.ctx;
    hud.font(size, 800, FONT_COND);
    const w = ctx.measureText(text).width + 30;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = "rgba(6,8,22,0.8)";
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - size * 0.72, w, size * 1.44, 12);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    hud.text(text, x, y + 1, { size, weight: 800, family: FONT_COND, color, alpha: a, tracking: 1 });
  }

  drawHud(t) {
    const { hud } = this.ctx;
    const ctx = hud.ctx;

    // 0 → 206 as the bones fly in.
    if (t < this.countEnd) {
      const a = smooth(SECTIONS.verse1, SECTIONS.verse1 + 0.3, t) * (1 - smooth(this.countEnd - 0.4, this.countEnd, t));
      const n = Math.round(206 * clamp((t - SECTIONS.verse1 - 0.1) / (this.six - SECTIONS.verse1 - 0.1), 0, 1));
      const pop = 1 + 0.25 * kick(t, this.six, 0.15);
      hud.text(String(n), 540, 345, { size: Math.round(150 * pop), weight: 800, family: FONT_COND, color: COUNT, alpha: a, glow: t >= this.six ? 30 : 12 });
      hud.text("BONES", 540, 445, { size: 40, weight: 800, family: FONT_COND, color: "#ffffff", alpha: a, tracking: 8 });
      hud.text("in an adult skeleton", 540, 495, { size: 28, weight: 600, family: FONT_MONO, color: "#cfd8ff", alpha: a * smooth(this.six, this.six + 0.4, t) * (1 - smooth(this.living - 0.2, this.living, t)) });
      hud.text("a living framework", 540, 495, { size: 28, weight: 600, family: FONT_MONO, color: "#ff9ab8", alpha: a * smooth(this.living, this.living + 0.3, t) });
    }

    // Verse captions: one at a time.
    const cap = this.captions.filter((c) => t >= c.t0 - 0.05 && t < c.t1).at(-1);
    if (cap) {
      const a = win(t, cap.t0, cap.t1, 0.05, 0.25);
      const size = cap.name.length > 12 ? 84 : 100;
      const pop = 1 + 0.12 * kick(t, cap.t0, 0.15);
      hud.text(cap.name, 540, TOP_Y, { size: Math.round(size * pop), weight: 800, family: FONT_COND, color: cap.color, alpha: a, glow: 24, tracking: 2 });
      if (cap.name === "JOINTS" && t >= this.jointWords[0].t0 - 0.1) {
        hud.font(40, 800, FONT_COND);
        const words = this.jointWords.map((j) => j.word.toUpperCase());
        const gap = 34;
        const widths = words.map((s) => ctx.measureText(s).width);
        let x = 540 - (widths.reduce((s, v) => s + v, 0) + gap * 3) / 2;
        words.forEach((s, k) => {
          const on = t >= this.jointWords[k].t0 - 0.05;
          const hit = kick(t, this.jointWords[k].t0, 0.2);
          hud.text(s, x + widths[k] / 2, TOP_Y + 80, { size: Math.round(40 * (1 + hit * 0.3)), weight: 800, family: FONT_COND, color: on ? BONES.joint.color : "#5a6080", alpha: a, glow: on ? 14 : 0 });
          x += widths[k] + gap;
        });
      } else hud.text(cap.note, 540, TOP_Y + 78, { size: 36, weight: 700, family: FONT_MONO, color: "#e8ecff", alpha: a * 0.92 });
    }

    // Clavicles: which is the left and which the right (the skeleton faces us).
    for (const s of this.sides) {
      if (t < s.t0 - 0.05 || t > s.t1) continue;
      const [x, y] = this.screen(`clavicle${s.side}`);
      const a = win(t, s.t0, s.t1, 0.05, 0.25);
      this.tag(s.word, clamp(x + (s.side ? 70 : -70), 140, 940), clamp(y - 150, 480, 1150), BONES.clavicle.color, a, Math.round(46 * (1 + 0.3 * kick(t, s.t0, 0.15))));
    }

    // The longest bone: a bracket along the femur.
    if (t > this.longest.t0 - 0.1 && t < this.longest.t1) {
      const a = win(t, this.longest.t0, this.longest.t1, 0.1, 0.3);
      const [hx, hy] = this.screen("hip0");
      const [kx, ky] = this.screen("knee0");
      const bx = Math.min(hx, kx) - 90;
      const grow = smooth(this.longest.t0, this.longest.t0 + 0.4, t);
      const y1 = lerp(hy, ky, grow);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.strokeStyle = BONES.femur.color;
      ctx.shadowColor = BONES.femur.color;
      ctx.shadowBlur = 16;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(bx + 24, hy);
      ctx.lineTo(bx, hy);
      ctx.lineTo(bx, y1);
      ctx.lineTo(bx + 24, y1);
      ctx.stroke();
      ctx.restore();
      hud.text("LONGEST", bx - 18, (hy + ky) / 2 - 22, { size: 40, weight: 800, family: FONT_COND, color: BONES.femur.color, align: "right", alpha: a * grow, glow: 14 });
      hud.text("BONE", bx - 18, (hy + ky) / 2 + 22, { size: 40, weight: 800, family: FONT_COND, color: BONES.femur.color, align: "right", alpha: a * grow, glow: 14 });
    }

    // Pre-chorus: support, protect, frame; then every major bone by name.
    this.stamps.forEach(([text, t0, color], k) => {
      const t1 = k < this.stamps.length - 1 ? this.stamps[k + 1][1] : t0 + 1.0;
      hud.stamp(text, t, t0, { x: 540, y: TOP_Y + 20, size: 120, color, angle: -0.06, life: t1 - t0 });
    });
    for (const r of this.roll) if (t >= r.t0 && t < r.t1 + 0.2) hud.slam(BONES[r.bone].name, t, r.t0, r.t1, { y: TOP_Y, size: 120, color: BONES[r.bone].color, angle: -0.03 });

    // Chorus call-outs, one at a time.
    const s = this.slams.filter((x) => x.t0 <= t + 0.02).at(-1);
    if (s && t < s.t1 + 0.25) {
      if (s.stamp) hud.stamp(s.text, t, s.t0, { x: 540, y: TOP_Y + 20, size: s.size * 0.8, color: s.color, angle: -0.06, life: s.t1 - s.t0 + 0.15 });
      else hud.slam(s.text, t, s.t0, s.t1, { y: TOP_Y, size: s.size, color: s.color, angle: -0.03 });
    }

    // Bridge quiz: question, then the answer.
    for (const q of this.quiz) {
      if (t < q.t0 - 0.1 || t > Math.max(q.t1, q.tA + 0.75) + 0.2) continue;
      const a = win(t, q.t0, q.t1, 0.1, 0.25);
      hud.text(q.q, 540, TOP_Y - 25, { size: 52, weight: 800, family: FONT_COND, color: "#ffffff", alpha: a * (1 - 0.35 * smooth(q.tA, q.tA + 0.2, t)), glow: 10, tracking: 1 });
      hud.stamp(q.a, t, q.tA, { x: 540, y: TOP_Y + 110, size: q.bone === "all" ? 150 : 100, color: q.color, angle: -0.05, life: Math.max(0.75, q.t1 - q.tA) });
    }

    // Outro: the count one last time.
    if (t >= this.final.t0 - 0.05) {
      const a = smooth(this.final.t0 - 0.05, this.final.t0 + 0.1, t) * (1 - smooth(this.final.t1 - 0.3, this.final.t1, t));
      const pop = 1 + 0.3 * kick(t, this.final.t0, 0.18);
      hud.text("206", 540, 345, { size: Math.round(160 * pop), weight: 800, family: FONT_COND, color: COUNT, alpha: a, glow: 30 });
      hud.text("BONES", 540, 455, { size: 40, weight: 800, family: FONT_COND, color: "#ffffff", alpha: a, tracking: 8 });
    }
  }
}
