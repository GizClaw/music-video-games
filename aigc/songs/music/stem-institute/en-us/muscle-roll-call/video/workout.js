import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { FONT_COND, FONT_MONO } from "@gizclaw/mvg-core/hud.js";
import { clamp, easeInOut, lerp, smooth } from "@gizclaw/mvg-core/timing.js";
import { BRIDGE, CHORUSES, CONTRACT, MUSCLES, OUTRO, PRE, RELAX, SECTIONS, TENDON, VERSE1, VERSE2 } from "./constants.js";
import { Figure } from "./figure.js";
import { Gym } from "./gym.js";

const FOV = 30;
const TAN = Math.tan(((FOV / 2) * Math.PI) / 180);
const TOP_Y = 330;
const PI = Math.PI;
const GROUPS = Object.keys(MUSCLES);

// Camera views: world point (x, y) shown on screen row Y from distance z.
const VIEWS = {
  wide: { x: 0, y: 0.95, z: 8.0, Y: 810 },
  arm: { x: -0.12, y: 1.15, z: 3.6, Y: 1110 },
  upper: { x: 0, y: 1.15, z: 4.0, Y: 1050 },
  core: { x: 0, y: 1.1, z: 4.8, Y: 1000 },
  legs: { x: 0, y: 0.5, z: 4.6, Y: 845 },
  calves: { x: 0, y: 0.3, z: 3.6, Y: 930 },
};
const PUNCH = { biceps: "arm", triceps: "arm", deltoid: "upper", abs: "core", quads: "legs", hams: "legs", calves: "calves" };

const win = (t, t0, t1, a = 0.06, b = 0.25) => smooth(t0 - a, t0 + a, t) * (1 - smooth(t1 - b, t1, t));
const kick = (t, t0, life) => (t >= t0 ? Math.exp(-(t - t0) / life) : 0);
const both = (key, v) => ({ [`${key}0`]: v, [`${key}1`]: v });

function blend(p, q, k) {
  for (const key of Object.keys(p)) {
    if (typeof p[key] === "number") p[key] = lerp(p[key], q[key], k);
  }
  p.arms.forEach((a, i) => {
    for (const key of Object.keys(a)) a[key] = lerp(a[key], q.arms[i][key], k);
  });
  p.legs.forEach((l, i) => {
    for (const key of Object.keys(l)) l[key] = lerp(l[key], q.legs[i][key], k);
  });
}

export class WorkoutScene {
  constructor(ctx) {
    this.ctx = ctx;
    const { timing, renderer } = ctx;
    this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.2;
    this.camera = new THREE.PerspectiveCamera(FOV, 9 / 16, 0.05, 100);
    const key = new THREE.DirectionalLight("#fff3e2", 1.9);
    key.position.set(-2.5, 4, 4);
    const windowLight = new THREE.DirectionalLight("#dceaff", 1.4);
    windowLight.position.set(1, 3.5, -5);
    this.scene.add(key, windowLight, new THREE.HemisphereLight("#d6e6ff", "#3a3430", 0.7));

    this.gym = new Gym(this.scene);
    this.fig = new Figure();
    this.scene.add(this.fig.root);
    this.tmp = new THREE.Vector3();
    this.tmp2 = new THREE.Vector3();
    this.buildTimeline(timing);
  }

  buildTimeline(timing) {
    const cue = (i) => timing.cues[i];
    const w = (ci, word, n = 0) => timing.wordTime(ci, word, n) ?? cue(ci).start;
    const v1 = VERSE1;
    const v2 = VERSE2;
    const end = (ci) => cue(ci).end;

    const shots = [
      [SECTIONS.verse1, "wide", 0.01],
      [cue(v1.bend).start - 0.5, "arm", 1.0],
      [cue(v1.deltoids).start - 0.4, "upper"],
      [cue(v1.pull).start - 0.4, "arm"],
      [cue(v1.teams).start - 0.3, "upper"],
      [cue(PRE.shorter).start - 0.4, "arm"],
      [cue(PRE.joints).start - 0.4, "wide"],
      [cue(PRE.tendons).start - 0.4, "arm"],
      [SECTIONS.chorus1, "wide", 0.5],
      [cue(v2.quads).start - 0.5, "legs", 1.0],
      [cue(v2.calves).start - 0.4, "calves"],
      [cue(v2.abs).start - 0.4, "core"],
      [cue(v2.many).start - 0.4, "wide"],
      [SECTIONS.breakdown, "wide"],
      [SECTIONS.bridge, "wide"],
      [SECTIONS.chorus2, "wide", 0.5],
      [SECTIONS.outro, "wide"],
    ];
    this.shots = shots.map(([t, v, dur = 0.8]) => ({ t, v: VIEWS[v], dur }));
    this.shots.forEach((s, i) => (s.from = i ? this.viewSeg(this.shots[i - 1], s.t) : s.v));

    this.facing = [
      [cue(v1.bend).start - 0.5, end(v1.control) + 0.3, 0.75],
      [cue(v1.pull).start - 0.4, end(v1.pull) + 0.2, 0.75],
      [cue(PRE.shorter).start - 0.4, end(PRE.easing) + 0.2, 0.75],
      [cue(PRE.tendons).start - 0.4, end(PRE.tendons) + 0.3, 0.75],
      [cue(v2.quads).start - 0.5, end(v2.hams) + 0.2, 0.85],
      [cue(v2.calves).start - 0.4, end(v2.toes) + 0.2, 0.95],
    ];
    this.bells = [[cue(v1.bend).start - 0.4, end(v1.teams) + 0.3], [cue(PRE.shorter).start - 0.3, end(PRE.easing) + 0.2], [cue(PRE.tendons).start - 0.3, end(PRE.tendons) + 0.3]];

    this.captions = [
      [w(v1.bend, "biceps"), cue(v1.folds).start - 0.05, "BICEPS", "contract to bend the elbow", "biceps"],
      [w(v1.folds, "triceps"), cue(v1.straighten).start - 0.05, "TRICEPS", "relax as the arm folds", "triceps"],
      [w(v1.straighten, "straighten"), end(v1.control) + 0.3, "TRICEPS", "contract to straighten the elbow", "triceps"],
      [w(v1.deltoids, "deltoids"), cue(v1.capping).start - 0.05, "DELTOIDS", "lift the arms from the side", "deltoid"],
      [cue(v1.capping).start, end(v1.capping) + 0.2, "DELTOIDS", "they cap the shoulder", "deltoid"],
      [cue(v1.pull).start, end(v1.pull) + 0.2, "MUSCLES PULL", "they never push", null, CONTRACT],
      [cue(v1.teams).start, end(v1.teams) + 0.3, "TEAMS TAKE TURNS", "one contracts, one rests", null, "#ffffff"],
      [cue(PRE.shorter).start, cue(PRE.easing).start - 0.05, "CONTRACT", "shorter, pulling with force", null, CONTRACT],
      [cue(PRE.easing).start, end(PRE.easing) + 0.2, "RELAX", "longer, easing back", null, RELAX],
      [w(PRE.joints, "joints"), end(PRE.joints) + 0.2, "JOINTS", "bones meet, motion starts", null, "#ffb03d"],
      [w(PRE.tendons, "tendons"), end(PRE.tendons) + 0.4, "TENDONS", "attach muscle to bone", null, TENDON],
      [w(v2.quads, "quadriceps"), end(v2.quads) + 0.2, "QUADRICEPS", "straighten the knee", "quads"],
      [w(v2.hams, "hamstrings"), end(v2.hams) + 0.2, "HAMSTRINGS", "bend the knee", "hams"],
      [w(v2.calves, "calf"), cue(v2.toes).start - 0.05, "CALVES", "lift the heel", "calves"],
      [cue(v2.toes).start, end(v2.toes) + 0.2, "CALVES", "up on your toes", "calves"],
      [w(v2.abs, "abdominal"), cue(v2.twist).start - 0.05, "ABDOMINALS", "support the trunk", "abs"],
      [cue(v2.twist).start, end(v2.twist) + 0.2, "ABDOMINALS", "steady through a twist or a jump", "abs"],
      [w(v2.many, "many"), end(v2.many) + 0.2, "MANY MUSCLES", "coordinate all day", null, "#ffffff"],
      [cue(v2.play).start, end(v2.play) + 0.4, "CONTRACT + RELAX", "teams that help us play", null, CONTRACT],
      [cue(OUTRO.crew).start, end(OUTRO.crew) + 0.4, "COORDINATED CREW", "contract · relax", null, "#ffffff"],
    ].map(([t0, t1, name, note, group, color]) => ({ t0, t1, name, note, group, color: color || MUSCLES[group].color }));

    // Tags pinned to the arm in verse 1: which muscle contracts and which relaxes.
    const tc = w(v1.bend, "contract");
    const tr = w(v1.folds, "relax");
    const sw = w(v1.straighten, "switch");
    const vEnd = end(v1.control) + 0.3;
    this.tags = [
      ["biceps0", "CONTRACT", CONTRACT, tc, sw],
      ["triceps0", "RELAX", RELAX, tr, sw],
      ["biceps0", "RELAX", RELAX, sw, vEnd],
      ["triceps0", "CONTRACT", CONTRACT, sw, vEnd],
      ["quads0", "CONTRACT", CONTRACT, w(v2.quads, "straighten"), end(v2.quads) + 0.2],
      ["hams0", "CONTRACT", CONTRACT, w(v2.hams, "bend"), end(v2.hams) + 0.2],
      ["biceps0", "PULL ✓", "#7cff6b", w(v1.pull, "pull"), w(v1.pull, "push") - 0.05],
      ["biceps0", "PUSH ✗", "#ff5d5d", w(v1.pull, "push"), end(v1.pull) + 0.2],
    ].map(([key, text, color, t0, t1]) => ({ key, text, color, t0, t1 }));
    this.bracket = [
      { text: "SHORTER", color: CONTRACT, t0: w(PRE.shorter, "shorter"), t1: cue(PRE.easing).start - 0.05 },
      { text: "LONGER", color: RELAX, t0: w(PRE.easing, "easing"), t1: end(PRE.easing) + 0.2 },
    ];

    const glow = Object.fromEntries(GROUPS.map((g) => [g, []]));
    const light = (g, t0, t1) => (g === "all" ? GROUPS : [g]).forEach((k) => glow[k].push([t0, t1]));
    for (const c of this.captions) if (c.group) light(c.group, c.t0, c.t1);
    for (let k = 0; k < GROUPS.length; k++) {
      const t0 = timing.beatTime(timing.beatIndexAt(SECTIONS.verse1 + 0.01) + k);
      light(GROUPS[k], t0, t0 + timing.period * 0.95);
    }
    light("biceps", w(v1.pull, "pull"), w(v1.pull, "pull") + 0.8);
    const many = cue(v2.many);
    for (let k = 0; k < GROUPS.length; k++) light(GROUPS[k], many.start + k * 0.3, many.start + k * 0.3 + 0.6);

    this.stamps = [];
    this.slams = [];
    this.flashes = [];
    this.punches = [];
    this.moves = [];
    const move = (t0, t1, fn) => this.moves.push({ t0, t1, fn });

    // Verse 1: curls, kickbacks, lateral raises, rows, alternate curls.
    const bend = w(v1.bend, "bend");
    move(cue(v1.bend).start - 0.3, cue(v1.straighten).start, (t, q, acts, u) => {
      const e = lerp(0.15, 2.25, easeInOut((t - bend) / 0.7)) + (t > bend + 0.7 ? 0.12 * u.beat : 0);
      q.arms.forEach((a) => Object.assign(a, { raise: 0.1, fwd: 0.15, elbow: e, roll: 0 }));
      Object.assign(acts, both("biceps", e / 2.25));
    });
    const straighten = w(v1.straighten, "straighten");
    move(cue(v1.straighten).start, cue(v1.control).start, (t, q, acts) => {
      const e = lerp(2.25, 0.12, easeInOut((t - straighten) / 0.7));
      q.arms.forEach((a) => Object.assign(a, { raise: 0.1, fwd: 0.15, elbow: e, roll: 0 }));
      Object.assign(acts, both("biceps", e / 2.25), both("triceps", 1 - e / 2.25));
    });
    move(cue(v1.control).start, end(v1.control) + 0.2, (t, q, acts, u) => {
      const ext = 0.5 - 0.5 * Math.cos(u.bf * PI);
      q.lean = 0.5;
      q.squat = 0.2;
      q.arms.forEach((a) => Object.assign(a, { raise: 0.08, fwd: -0.7, elbow: 1.7 * (1 - ext), roll: 0 }));
      Object.assign(acts, both("triceps", 0.3 + 0.7 * ext));
    });
    move(cue(v1.deltoids).start - 0.2, end(v1.capping) + 0.2, (t, q, acts, u) => {
      const r = 0.5 - 0.5 * Math.cos(u.bf * PI);
      q.arms.forEach((a) => Object.assign(a, { raise: 0.15 + 1.35 * r, fwd: 0.1, elbow: 0.25, roll: 0 }));
      Object.assign(acts, both("deltoid", r));
    });
    const push = w(v1.pull, "push");
    move(cue(v1.pull).start - 0.2, end(v1.pull) + 0.2, (t, q, acts, u) => {
      const k = 0.5 - 0.5 * Math.cos(u.bf * PI);
      const pushed = smooth(push - 0.1, push + 0.15, t);
      q.lean = 0.15;
      q.arms.forEach((a) => Object.assign(a, { raise: 0.1, fwd: lerp(1.45 - 1.1 * k, 1.5, pushed), elbow: lerp(2.2 * k, 0.05, pushed), roll: 0 }));
      Object.assign(acts, both("biceps", k * (1 - pushed)));
    });
    move(cue(v1.teams).start - 0.2, end(v1.teams) + 0.2, (t, q, acts, u) => {
      q.arms.forEach((a, i) => {
        const up = 0.5 + 0.5 * Math.cos((u.bf - i) * PI);
        Object.assign(a, { raise: 0.12, fwd: 0.15, elbow: 0.15 + 2.1 * up, roll: 0 });
        acts[`biceps${i}`] = up;
        acts[`triceps${i}`] = 1 - up;
      });
      q.yaw += 0.3;
    });
    // Pre-chorus: one slow curl up, one slow release; joints; tendons.
    const c9 = cue(PRE.shorter);
    const c10 = cue(PRE.easing);
    move(c9.start - 0.2, c10.start, (t, q, acts) => {
      const e = lerp(0.15, 2.3, easeInOut((t - c9.start) / 1.4));
      Object.assign(q.arms[0], { raise: 0.1, fwd: 0.15, elbow: e, roll: 0 });
      acts.biceps0 = e / 2.3;
    });
    move(c10.start, c10.end + 0.2, (t, q, acts) => {
      const e = lerp(2.3, 0.15, easeInOut((t - c10.start) / 1.6));
      Object.assign(q.arms[0], { raise: 0.1, fwd: 0.15, elbow: e, roll: 0 });
      acts.biceps0 = e / 2.3;
    });
    this.joint = [w(PRE.joints, "joints") - 0.1, end(PRE.joints) + 0.2];
    move(cue(PRE.joints).start - 0.2, end(PRE.joints) + 0.2, (t, q, acts, u) => {
      const k = 0.5 - 0.5 * Math.cos(u.bf * PI);
      q.squat = 0.1 + 0.4 * k;
      q.arms.forEach((a) => Object.assign(a, { raise: 0.2, fwd: 0.5, elbow: 0.2 + 1.6 * k, roll: 0 }));
      Object.assign(acts, both("biceps", k), both("quads", k));
    });
    this.tendon = [w(PRE.tendons, "tendons") - 0.1, end(PRE.tendons) + 0.4];
    move(cue(PRE.tendons).start - 0.2, end(PRE.tendons) + 0.3, (t, q, acts, u) => {
      const k = 0.5 - 0.5 * Math.cos(u.bf * PI);
      q.arms.forEach((a) => Object.assign(a, { raise: 0.1, fwd: 0.15, elbow: 0.2 + 2.0 * k, roll: 0 }));
      Object.assign(acts, both("biceps", k), both("triceps", 1 - k));
    });

    // Choruses.
    const flexPose = (q, acts, k = 1) => {
      q.arms.forEach((a) => Object.assign(a, { raise: lerp(a.raise, 1.45, k), fwd: lerp(a.fwd, 0, k), elbow: lerp(a.elbow, 2.1, k), roll: lerp(a.roll, 1, k) }));
      q.stance = 0.22;
      Object.assign(acts, both("biceps", k), both("deltoid", 0.7 * k), { abs: 0.6 * k }, both("quads", 0.4 * k));
    };
    this.flexPose = flexPose;
    const flexRelaxSwitch = (ci, tEnd) => {
      const flex = w(ci, "flex");
      const relax = w(ci, "relax");
      const sws = [0, 1, 2].map((n) => w(ci, "switch", n));
      this.stamps.push({ text: "FLEX!", t0: flex, t1: relax - 0.05, color: CONTRACT });
      this.stamps.push({ text: "RELAX", t0: relax, t1: sws[0] - 0.05, color: RELAX });
      sws.forEach((s, n) => this.stamps.push({ text: "SWITCH!", t0: s, t1: (sws[n + 1] ?? tEnd) - 0.05, color: "#ffe14a", angle: n % 2 ? 0.07 : -0.07 }));
      light("biceps", flex, relax);
      light("deltoid", flex, relax);
      this.flashes.push(flex);
      move(flex - 0.08, relax, (t, q, acts) => flexPose(q, acts));
      move(relax - 0.05, sws[0], (t, q) => q.arms.forEach((a) => Object.assign(a, { raise: 0.08, fwd: 0.05, elbow: 0.08, roll: 0 })));
      sws.forEach((s, n) => {
        const arm = n % 2;
        light("biceps", s, s + 0.4);
        move(s - 0.06, (sws[n + 1] ?? tEnd) - 0.02, (t, q, acts) => {
          q.arms.forEach((a, i) => Object.assign(a, { raise: 0.15, fwd: 0.2, elbow: i === arm ? 2.3 : 0.1, roll: 0 }));
          acts[`biceps${arm}`] = 1;
          acts[`triceps${1 - arm}`] = 0.8;
          q.twist = arm ? 0.35 : -0.35;
        });
      });
    };
    for (const c0 of CHORUSES) {
      flexRelaxSwitch(c0, cue(c0 + 1).start);
      this.slams.push({ text: "ROLL CALL", t0: w(c0 + 1, "muscle"), t1: w(c0 + 1, "quick") - 0.05, color: "#ffffff" });
      const quicks = [0, 1, 2].map((n) => w(c0 + 1, "quick", n));
      quicks.forEach((s, n) => this.stamps.push({ text: "QUICK!", t0: s, t1: (quicks[n + 1] ?? cue(c0 + 2).start) - 0.05, color: "#3dffd0", angle: n % 2 ? 0.06 : -0.06 }));
      move(cue(c0 + 1).start - 0.1, cue(c0 + 2).start - 0.05, (t, q, acts) => {
        const pop = quicks.reduce((m, s) => Math.max(m, kick(t, s, 0.18) * smooth(s - 0.06, s, t)), 0);
        q.squat = 0.1 + 0.5 * pop;
        q.arms.forEach((a, i) => Object.assign(a, { raise: 0.3 + 0.4 * pop, fwd: 0.6 + 0.9 * pop * (i ? 1 : 0.6), elbow: 1.6 - 1.4 * pop, roll: 0 }));
        Object.assign(acts, both("quads", pop), both("calves", pop * 0.6));
      });
      const names = [["biceps", "biceps", c0 + 2], ["triceps", "triceps", c0 + 2], ["deltoids", "deltoid", c0 + 2], ["abs", "abs", c0 + 3]].map(([word, g, ci]) => [w(ci, word), g]);
      names.forEach(([t0, g], n) => {
        const t1 = n < names.length - 1 ? names[n + 1][0] : end(c0 + 3);
        this.slams.push({ text: MUSCLES[g].name, t0, t1: t1 - 0.05, color: MUSCLES[g].color });
        light(g, t0, t1 + 0.2);
        this.punches.push({ t0, group: g });
        move(t0 - 0.08, t1, (t, q, acts, u) => this.namePose(g, t, t0, q, acts, u));
      });
      flexRelaxSwitch(c0 + 4, cue(c0 + 5).start);
      const click = w(c0 + 5, "click");
      this.slams.push({ text: "TEAMWORK", t0: w(c0 + 5, "muscle"), t1: click - 0.05, color: "#ffffff" });
      this.stamps.push({ text: "CLICK!", t0: click, t1: end(c0 + 5) + 0.4, color: "#ffe14a" });
      light("all", click, click + 0.8);
      this.flashes.push(click);
      move(cue(c0 + 5).start - 0.1, end(c0 + 5) + 0.3, (t, q, acts, u) => this.jack(t, q, acts, u, click));
    }
    const post1 = end(CHORUSES[0] + 5) + 0.3;
    move(post1, SECTIONS.verse2, (t, q, acts, u) => this.jack(t, q, acts, u));

    // Verse 2: squats, leg curls, heel raises, core, twist and jump.
    move(cue(v2.quads).start - 0.3, end(v2.quads) + 0.2, (t, q, acts, u) => {
      const s = 0.5 - 0.5 * Math.cos(u.bf * PI);
      q.squat = 0.08 + 0.55 * s;
      q.lean = 0.25 * s;
      q.arms.forEach((a) => Object.assign(a, { raise: 0.1, fwd: 0.4 + 1.0 * s, elbow: 0.2, roll: 0 }));
      Object.assign(acts, both("quads", 0.3 + 0.7 * Math.max(0, -Math.sin(u.bf * PI)) + 0.3 * s), both("hams", 0.2));
    });
    move(cue(v2.hams).start - 0.2, end(v2.hams) + 0.2, (t, q, acts, u) => {
      const k = 0.5 - 0.5 * Math.cos(u.bf * PI);
      q.legs[0].knee = 1.7 * k;
      q.legs[0].lift = -0.12 * k;
      q.arms.forEach((a) => Object.assign(a, { raise: 0.45, fwd: -0.2, elbow: 1.7, roll: 0 }));
      acts.hams0 = k;
      acts.quads1 = 0.3;
    });
    move(cue(v2.calves).start - 0.2, cue(v2.toes).start, (t, q, acts, u) => {
      const k = 0.5 - 0.5 * Math.cos(u.bf * PI);
      q.heel = k;
      q.arms.forEach((a) => Object.assign(a, { raise: 0.45, fwd: -0.2, elbow: 1.7, roll: 0 }));
      Object.assign(acts, both("calves", k));
    });
    move(cue(v2.toes).start, end(v2.toes) + 0.2, (t, q, acts, u) => {
      q.heel = 0.75 + 0.25 * u.beat;
      q.legs.forEach((l, i) => (l.lift = 0.12 * Math.max(0, Math.sin((u.bf + i) * PI))));
      q.arms.forEach((a, i) => Object.assign(a, { raise: 0.2, fwd: 0.4 * Math.sin((u.bf + i + 1) * PI), elbow: 1.2, roll: 0 }));
      Object.assign(acts, both("calves", 0.8 + 0.2 * u.beat));
    });
    move(cue(v2.abs).start - 0.2, cue(v2.twist).start, (t, q, acts, u) => {
      q.crunch = 0.12 + 0.18 * u.beat;
      q.arms.forEach((a) => Object.assign(a, { raise: 0.25, fwd: 0.9, elbow: 2.0, roll: 0 }));
      acts.abs = 0.7 + 0.3 * u.beat;
    });
    const jump = w(v2.twist, "jump");
    move(cue(v2.twist).start, end(v2.twist) + 0.2, (t, q, acts, u) => {
      const tw = Math.sin(u.bf * PI) * (1 - smooth(jump - 0.3, jump, t));
      q.twist = 0.9 * tw;
      q.arms.forEach((a) => Object.assign(a, { raise: 1.2, fwd: 0.2, elbow: 2.3, roll: 1 }));
      const h = clamp((t - jump) / 0.45, 0, 1);
      q.y = 0.22 * Math.sin(PI * h);
      q.squat = 0.1 + 0.3 * kick(t, jump - 0.15, 0.2) * smooth(jump - 0.3, jump - 0.15, t);
      acts.abs = 0.6 + 0.4 * Math.abs(tw);
      Object.assign(acts, both("quads", Math.sin(PI * h)), both("calves", Math.sin(PI * h)));
    });
    move(cue(v2.many).start - 0.2, end(v2.many) + 0.2, (t, q, acts, u) => {
      const s = 0.5 - 0.5 * Math.cos(u.bf * PI);
      q.squat = 0.08 + 0.45 * s;
      q.arms.forEach((a) => Object.assign(a, { raise: 0.3, fwd: lerp(2.9, 0.6, s), elbow: lerp(0.1, 2.2, s), roll: 0 }));
      Object.assign(acts, both("quads", s), both("deltoid", 1 - s), both("triceps", 1 - s), both("biceps", s), { abs: 0.5 });
    });
    move(cue(v2.play).start - 0.2, end(v2.play) + 0.3, (t, q, acts, u) => flexPose(q, acts, 0.5 + 0.5 * Math.cos(u.bf * PI)));
    move(SECTIONS.breakdown - 0.2, SECTIONS.bridge, (t, q, acts, u) => this.jack(t, q, acts, u));
    for (let b = timing.beatIndexAt(SECTIONS.breakdown + 0.01); timing.beatTime(b) < SECTIONS.bridge - 0.1; b++) light(GROUPS[b % GROUPS.length], timing.beatTime(b), timing.beatTime(b) + timing.period);

    // Bridge: question, then the answer muscles light and work.
    this.quiz = BRIDGE.map((b, k) => {
      const answers = b.words.map(([word, g]) => [w(b.cue, word), g]);
      const next = k < BRIDGE.length - 1 ? cue(BRIDGE[k + 1].cue).start - 0.05 : answers[0][0] + 2.4;
      answers.forEach(([t0, g]) => {
        light(g, t0, next);
        this.punches.push({ t0, group: g, low: 120 });
        this.flashes.push(t0);
      });
      const g0 = answers[0][1];
      move(answers[0][0] - 0.08, next, (t, q, acts, u) => this.namePose(g0 === "biceps" ? "arms" : g0, t, answers[0][0], q, acts, u));
      return { q: b.q, t0: cue(b.cue).start, tA: answers[0][0], t1: next, a: answers.map(([, g]) => MUSCLES[g].name).join(" · "), color: MUSCLES[g0].color };
    });

    // Outro: flex and relax, then the final pose.
    move(cue(OUTRO.crew).start - 0.2, cue(OUTRO.call).start, (t, q, acts, u) => flexPose(q, acts, 0.5 + 0.5 * Math.cos(u.bf * PI)));
    this.final = w(OUTRO.call, "muscle");
    move(this.final - 0.1, SECTIONS.end + 1, (t, q, acts) => flexPose(q, acts));
    light("all", this.final, SECTIONS.end + 1);
    this.glow = glow;
    this.titleEnd = cue(v1.bend).start - 0.3;
  }

  /** The pose for a named muscle group. */
  namePose(g, t, t0, q, acts, u) {
    const k = 0.5 - 0.5 * Math.cos(u.bf * PI);
    if (g === "arms") this.flexPose(q, acts);
    else if (g === "biceps") {
      q.arms.forEach((a) => Object.assign(a, { raise: 0.15, fwd: 0.2, elbow: 2.3, roll: 0 }));
      Object.assign(acts, both("biceps", 1));
    } else if (g === "triceps") {
      q.arms.forEach((a) => Object.assign(a, { raise: 0.25, fwd: 2.75, elbow: 1.9 * (1 - smooth(t0 + 0.05, t0 + 0.3, t)), roll: 0 }));
      Object.assign(acts, both("triceps", smooth(t0, t0 + 0.3, t)));
    } else if (g === "deltoid") {
      q.arms.forEach((a) => Object.assign(a, { raise: 1.5, fwd: 0.05, elbow: 0.2, roll: 0 }));
      Object.assign(acts, both("deltoid", 1));
    } else if (g === "abs") {
      q.crunch = 0.2 + 0.3 * k;
      q.twist = 0.5 * Math.sin(u.bf * PI);
      q.arms.forEach((a) => Object.assign(a, { raise: 1.2, fwd: 0.2, elbow: 2.4, roll: 1 }));
      acts.abs = 0.6 + 0.4 * k;
    } else if (g === "quads") {
      q.squat = 0.1 + 0.5 * k;
      q.arms.forEach((a) => Object.assign(a, { raise: 0.1, fwd: 1.3, elbow: 0.2, roll: 0 }));
      Object.assign(acts, both("quads", 0.5 + 0.5 * k));
    } else if (g === "hams") {
      q.legs[0].knee = 1.6 * k;
      q.legs[1].knee = 1.6 * (1 - k);
      q.y = 0.05;
      Object.assign(acts, { hams0: k, hams1: 1 - k });
    } else if (g === "calves") {
      q.heel = 0.3 + 0.7 * k;
      Object.assign(acts, both("calves", 0.5 + 0.5 * k));
    }
  }

  /** Jumping jacks, one open-close every two beats; a star jump on `star`. */
  jack(t, q, acts, u, star) {
    const open = 0.5 - 0.5 * Math.cos(u.bf * PI);
    q.stance = 0.08 + 0.28 * open;
    q.y = 0.07 * Math.abs(Math.sin(u.bf * PI));
    q.arms.forEach((a) => Object.assign(a, { raise: 0.2 + 2.5 * open, fwd: 0.05, elbow: 0.3, roll: 0 }));
    Object.assign(acts, both("deltoid", open), both("calves", 0.5 + 0.5 * open));
    if (star !== undefined) {
      const h = clamp((t - star) / 0.5, 0, 1);
      const s = Math.sin(PI * h);
      q.y += 0.25 * s;
      q.stance = lerp(q.stance, 0.42, s);
      q.arms.forEach((a) => (a.raise = lerp(a.raise, 2.6, s)));
    }
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

  poseAt(t, section, u) {
    const ch = section.startsWith("chorus") ? 1 : 0;
    const amp = ch ? 1 : section === "breakdown" ? 0.9 : 0.6;
    const side = Math.cos(u.bf * PI);
    const p = {
      x: side * 0.03 * amp,
      y: 0,
      yaw: side * 0.1 * amp,
      squat: 0.05 + 0.08 * u.beat * amp,
      stance: 0.1,
      lean: 0.03,
      crunch: 0,
      twist: -side * 0.15 * amp,
      bend: side * 0.08 * amp,
      heel: 0,
      nod: 0.08 * u.beat * amp,
      bells: 0,
      arms: [0, 1].map((i) => ({ raise: 0.18 + 0.06 * u.beat * amp, fwd: 0.1 + 0.25 * amp * (i ? side : -side), elbow: 0.35 + 0.25 * u.beat * amp, roll: 0 })),
      legs: [{ lift: 0, knee: 0 }, { lift: 0, knee: 0 }],
    };
    // Warm-up: march in place until the first line.
    const warm = 1 - smooth(this.titleEnd - 0.3, this.titleEnd + 0.2, t);
    if (warm > 0) {
      p.legs.forEach((l, i) => {
        const up = Math.max(0, Math.sin((u.bf + i) * PI));
        l.lift += 0.55 * up * warm;
        l.knee += 0.95 * up * warm;
      });
      p.arms.forEach((a, i) => {
        a.fwd = lerp(a.fwd, 0.55 * Math.sin((u.bf + i + 1) * PI), warm);
        a.elbow = lerp(a.elbow, 1.4, warm);
      });
    }
    const acts = {};
    for (const m of this.moves) {
      if (t < m.t0 - 0.2 || t > m.t1 + 0.25) continue;
      const k = win(t, m.t0, m.t1, 0.12, 0.2);
      if (k <= 0) continue;
      const q = structuredClone(p);
      const a = {};
      m.fn(t, q, a, u);
      blend(p, q, k);
      for (const [key, v] of Object.entries(a)) acts[key] = Math.max(acts[key] || 0, v * k);
    }
    for (const [t0, t1, yaw] of this.facing) p.yaw += yaw * win(t, t0, t1, 0.3, 0.4);
    p.bells = this.bells.reduce((m, [t0, t1]) => Math.max(m, win(t, t0, t1, 0.15, 0.25)), 0);
    return { p, acts };
  }

  glowOf(g, t) {
    let v = 0;
    for (const [t0, t1] of this.glow[g]) if (t > t0 - 0.1 && t < t1 + 0.1) v = Math.max(v, win(t, t0, t1, 0.05, 0.3));
    return v;
  }

  update(t, section) {
    const { timing } = this.ctx;
    const k = timing.pulse(t, 0.12);
    const bf = timing.beatFloat(t);
    const u = { bf, beat: 0.5 + 0.5 * Math.cos(bf * 2 * PI) };
    const loud = section.startsWith("chorus") || section === "breakdown";

    const { p, acts } = this.poseAt(t, section, u);
    this.fig.pose(p);
    const glow = Object.fromEntries(GROUPS.map((g) => [g, this.glowOf(g, t)]));
    this.fig.flex(acts, glow, win(t, ...this.tendon, 0.1, 0.3), win(t, ...this.joint, 0.1, 0.3));

    const view = this.viewAt(t);
    let best = null;
    for (const pc of this.punches) if (pc.t0 <= t + 0.04 && (!best || pc.t0 > best.t0)) best = pc;
    if (best && t - best.t0 < 1.0) {
      const a = smooth(best.t0 - 0.04, best.t0 + 0.08, t) * Math.exp(-Math.max(0, t - best.t0 - 0.25) / 0.3) * 0.65;
      const target = { ...VIEWS[PUNCH[best.group]] };
      target.Y += best.low || 0;
      for (const key of ["x", "y", "z", "Y"]) view[key] = lerp(view[key], target[key], a);
    }
    const upp = (2 * view.z * TAN) / 1920;
    const drift = Math.sin(t * 0.29) * 0.06;
    this.camera.position.set(view.x + drift, view.y - (960 - view.Y) * upp, view.z - k * (loud ? 0.14 : 0.05));
    const jolt = this.flashes.reduce((m, h) => Math.max(m, kick(t, h, 0.1)), 0);
    this.camera.rotation.set(0, drift * 0.02, Math.sin(t * 70) * 0.01 * jolt);
    this.camera.updateMatrixWorld();
    this.scene.updateMatrixWorld();

    const lit = GROUPS.reduce((m, g) => (glow[g] > glow[m] ? g : m), GROUPS[0]);
    this.gym.update(t, k, timing.sinceBeat(t), loud ? 1 : 0.35, glow[lit] > 0.2 ? MUSCLES[lit].color : "#9fd8ff");

    const post = { bloom: [loud ? 0.7 : 0.55, 0.42, 0.72], ca: 0.08 + k * (loud ? 0.28 : 0.12), vignette: 0.45, grain: 0.025 };
    const start = SECTIONS[section];
    if (start !== undefined && t - start < 0.3) post.flash = Math.exp(-(t - start) / 0.1) * 0.3;
    for (const h of this.flashes) {
      if (t >= h && t < h + 0.2) post.flash = Math.max(post.flash || 0, 0.25 * (1 - (t - h) / 0.2));
      if (t >= h && t < h + 0.5) post.shock = [0.5, 0.55, (t - h) * 1.2, 0.6];
    }
    this.drawHud(t);
    return post;
  }

  screen(v) {
    v.project(this.camera);
    return [(v.x * 0.5 + 0.5) * 1080, (-v.y * 0.5 + 0.5) * 1920];
  }

  panel(x, y, w, h, a) {
    const ctx = this.ctx.hud.ctx;
    ctx.save();
    ctx.globalAlpha = a * 0.72;
    ctx.fillStyle = "#0a0d18";
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - h / 2, w, h, 26);
    ctx.fill();
    ctx.restore();
  }

  tag(text, x, y, color, a, size = 38) {
    if (a <= 0) return;
    const { hud } = this.ctx;
    const ctx = hud.ctx;
    hud.font(size, 800, FONT_COND);
    const w = ctx.measureText(text).width + 32;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = "rgba(8,10,20,0.85)";
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - size * 0.72, w, size * 1.44, 12);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    hud.text(text, x, y + 1, { size, weight: 800, family: FONT_COND, color, alpha: a, tracking: 2 });
  }

  drawHud(t) {
    const { hud } = this.ctx;
    const ctx = hud.ctx;
    hud.title(t, SECTIONS.verse1 + 0.2, this.titleEnd, { kicker: "STEM INSTITUTE  ·  No. 20", lines: ["MUSCLE", "ROLL CALL"], accent: MUSCLES.biceps.color });

    const cap = this.captions.filter((c) => t >= c.t0 - 0.05 && t < c.t1).at(-1);
    if (cap) {
      const a = win(t, cap.t0, cap.t1, 0.05, 0.25);
      const size = cap.name.length > 12 ? 80 : 96;
      hud.font(36, 700, FONT_MONO);
      const noteW = ctx.measureText(cap.note).width;
      hud.font(size, 800, FONT_COND);
      this.panel(540, TOP_Y + 36, Math.max(noteW, ctx.measureText(cap.name).width) + 90, 190, a);
      const pop = 1 + 0.12 * kick(t, cap.t0, 0.15);
      hud.text(cap.name, 540, TOP_Y, { size: Math.round(size * pop), weight: 800, family: FONT_COND, color: cap.color, alpha: a, glow: 20, tracking: 2 });
      hud.text(cap.note, 540, TOP_Y + 78, { size: 36, weight: 700, family: FONT_MONO, color: "#eef2ff", alpha: a * 0.95 });
    }

    for (const tg of this.tags) {
      if (t < tg.t0 - 0.05 || t > tg.t1) continue;
      const a = win(t, tg.t0, tg.t1, 0.05, 0.2);
      const [x, y] = this.screen(this.fig.world(tg.key, this.tmp));
      const tx = clamp(x - 230, 150, 930);
      const ty = clamp(y + (tg.key.startsWith("triceps") ? 80 : -80), 520, 1180);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.strokeStyle = tg.color;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fillStyle = tg.color;
      ctx.fill();
      ctx.restore();
      this.tag(tg.text, tx, ty, tg.color, a, Math.round(44 * (1 + 0.25 * kick(t, tg.t0, 0.15))));
    }

    for (const b of this.bracket) {
      if (t < b.t0 - 0.1 || t > b.t1) continue;
      const a = win(t, b.t0, b.t1, 0.1, 0.25);
      const [p0, p1] = this.fig.ends("biceps0", this.tmp, this.tmp2);
      const [x0, y0] = this.screen(p0);
      const [x1, y1] = this.screen(p1);
      const bx = Math.min(x0, x1) - 70;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.strokeStyle = b.color;
      ctx.shadowColor = b.color;
      ctx.shadowBlur = 14;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(bx + 22, y0);
      ctx.lineTo(bx, y0);
      ctx.lineTo(bx, y1);
      ctx.lineTo(bx + 22, y1);
      ctx.stroke();
      ctx.restore();
      hud.text(b.text, bx - 16, (y0 + y1) / 2, { size: 54, weight: 800, family: FONT_COND, color: b.color, align: "right", alpha: a, glow: 14 });
    }

    const st = [...this.stamps, ...this.slams].filter((s) => s.t0 <= t + 0.02).sort((x, y) => x.t0 - y.t0).at(-1);
    if (st && t < st.t1 + 0.25) {
      if (this.stamps.includes(st)) hud.stamp(st.text, t, st.t0, { x: 540, y: TOP_Y + 20, size: 110, color: st.color, angle: st.angle ?? -0.06, life: st.t1 - st.t0 + 0.15 });
      else hud.slam(st.text, t, st.t0, st.t1, { y: TOP_Y, size: 120, color: st.color, angle: -0.03 });
    }

    for (const q of this.quiz) {
      if (t < q.t0 - 0.1 || t > Math.max(q.t1, q.tA + 0.75) + 0.2) continue;
      const a = win(t, q.t0, q.t1, 0.1, 0.25);
      hud.text(q.q, 540, TOP_Y - 25, { size: 58, weight: 800, family: FONT_COND, color: "#ffffff", alpha: a * (1 - 0.3 * smooth(q.tA, q.tA + 0.2, t)), glow: 10, tracking: 2 });
      hud.stamp(q.a, t, q.tA, { x: 540, y: TOP_Y + 110, size: q.a.length > 12 ? 76 : 96, color: q.color, angle: -0.05, life: Math.max(0.75, q.t1 - q.tA) });
    }

    if (t >= this.final - 0.05) {
      const a = smooth(this.final - 0.05, this.final + 0.2, t) * (1 - smooth(SECTIONS.end - 0.3, SECTIONS.end, t));
      this.panel(540, TOP_Y + 36, 760, 190, a);
      hud.text("MUSCLE ROLL CALL", 540, TOP_Y, { size: 92, weight: 800, family: FONT_COND, color: "#ffffff", alpha: a, glow: 24, tracking: 3 });
      hud.text("contract · relax · move", 540, TOP_Y + 78, { size: 36, weight: 700, family: FONT_MONO, color: CONTRACT, alpha: a });
    }
  }
}
