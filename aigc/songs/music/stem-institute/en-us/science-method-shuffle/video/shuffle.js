import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { makeRibbon } from "@gizclaw/mvg-core/fx.js";
import { FONT_COND, FONT_MONO, SAFE } from "@gizclaw/mvg-core/hud.js";
import { clamp, easeInOut, easeOutBack, easeOutCubic, hash, lerp, smooth } from "@gizclaw/mvg-core/timing.js";
import { BRIDGE, CHORUSES, DAYS, OUTRO, POTS, PRE, SECTIONS, STEPS, TABLE_DAYS, VERSE1, VERSE2 } from "./constants.js";
import { BENCH_Y, CLIP_AT, Garden, JAR_AT, POT_X, POT_Z, SKY } from "./garden.js";
import { MacroWorld, Notebook } from "./macro.js";
import { BeanPot, Clipboard, Magnifier, POT_H, SeedJar, WateringCan } from "./props.js";

const FOV = 30;
const VIEW = { y: 2.4, z: 15.5, look: 1.75 };
const SOIL_Y = BENCH_Y + POT_H - 0.04;
const TITLE_Y = 330;
const SUB_Y = 404;
const TRACK_Y = 468;
const STAMP_Y = 600;
/** Distance of the magnifier from the camera, and where on screen it may go. */
const LENS_DIST = 11;
const LENS_BOX = [230, 850, 730, 1030];
/** What the lens looks at for each step; the notebook stations name a spot on the clipboard page (0..1 from the top). */
const STATION = ["seed", "hypo", "soil", "leaf", "table", "chart", "check"];
const PAGE_V = { hypo: 0.22, table: 0.47, chart: 0.77, check: 0.94, paper: 0.5 };

const growth = (day) => {
  const L = (d) => 1 / (1 + Math.exp(-(d - 6.5) / 2));
  return day <= 0 ? 0 : (L(day) - L(0)) / (L(14) - L(0));
};
const dayAt = (t) => {
  if (t <= DAYS[0][0]) return DAYS[0][1];
  for (let i = 1; i < DAYS.length; i++) {
    const [t1, d1] = DAYS[i];
    const [t0, d0] = DAYS[i - 1];
    if (t <= t1) return lerp(d0, d1, (t - t0) / (t1 - t0));
  }
  return DAYS.at(-1)[1];
};
const heightAt = (k, day) => POTS[k].height * growth(day);
const tableCm = (k, day) => Math.round(heightAt(k, day) * 10);

/** Step icons for the track, drawn around the origin in a ±80 box. */
const ICONS = [
  (g) => {
    g.font = `800 190px ${FONT_COND}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText("?", 0, 8);
  },
  (g) => {
    g.beginPath();
    g.arc(0, -22, 52, Math.PI * 0.8, Math.PI * 2.2);
    g.lineTo(24, 42);
    g.lineTo(-24, 42);
    g.closePath();
    g.stroke();
    g.beginPath();
    g.moveTo(-22, 66);
    g.lineTo(22, 66);
    g.stroke();
  },
  (g) => {
    g.beginPath();
    g.moveTo(-18, -70);
    g.lineTo(-18, -18);
    g.lineTo(-62, 64);
    g.lineTo(62, 64);
    g.lineTo(18, -18);
    g.lineTo(18, -70);
    g.stroke();
  },
  (g) => {
    g.beginPath();
    g.moveTo(-78, 0);
    g.quadraticCurveTo(0, -70, 78, 0);
    g.quadraticCurveTo(0, 70, -78, 0);
    g.stroke();
    g.beginPath();
    g.arc(0, 0, 24, 0, Math.PI * 2);
    g.fill();
  },
  (g) => {
    g.strokeRect(-50, -66, 100, 132);
    for (const y of [-24, 10, 44]) {
      g.beginPath();
      g.moveTo(-30, y);
      g.lineTo(30, y);
      g.stroke();
    }
  },
  (g) => {
    g.beginPath();
    g.moveTo(-70, -70);
    g.lineTo(-70, 66);
    g.lineTo(72, 66);
    g.stroke();
    [[-44, 30], [-6, 64], [32, 104]].forEach(([x, hgt]) => g.fillRect(x, 52 - hgt, 26, hgt));
  },
  (g) => {
    g.beginPath();
    g.moveTo(-62, 4);
    g.lineTo(-18, 48);
    g.lineTo(66, -50);
    g.stroke();
  },
];

function dotTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, "rgba(255,255,255,1)");
  r.addColorStop(0.55, "rgba(255,255,255,0.85)");
  r.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class ShuffleScene {
  constructor(ctx) {
    this.ctx = ctx;
    const { timing, renderer } = ctx;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.35;
    this.camera = new THREE.PerspectiveCamera(FOV, 9 / 16, 0.1, 400);
    this.scene.add(this.camera);
    // Late-morning sun from the upper right casts the only shadows; blue sky fill from above.
    const sun = new THREE.DirectionalLight("#fff0d2", 1.9);
    sun.position.set(5, 10, 7);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -2, near: 2, far: 30 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    this.scene.add(sun, new THREE.HemisphereLight("#bcd8ff", "#5a7a3a", 0.8));

    this.bgU = { uTime: { value: 0 }, uGlow: { value: 0 }, uHorizon: { value: 0.5 } };
    const bg = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({ depthTest: false, depthWrite: false, uniforms: this.bgU, vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }", fragmentShader: SKY }),
    );
    bg.renderOrder = -1;
    bg.frustumCulled = false;
    this.scene.add(bg);

    this.garden = new Garden(this.scene);
    this.bench = new THREE.Group();
    this.bench.position.y = BENCH_Y;
    this.scene.add(this.bench);
    this.pots = POTS.map((p, k) => new BeanPot(this.bench, k, p, POT_X[k], POT_Z));
    this.jar = new SeedJar(this.bench);
    this.jar.group.position.set(JAR_AT[0], 0, JAR_AT[1]);
    this.can = new WateringCan(this.scene);

    this.buildTimeline(timing);
    this.notebook = new Notebook(this.plan, tableCm);
    this.macro = new MacroWorld(renderer, this.notebook);
    this.clipboard = new Clipboard(this.bench, this.notebook.texture);
    this.clipboard.group.position.set(CLIP_AT[0], 0, CLIP_AT[1]);
    this.clipboard.group.rotation.y = 0.25;
    this.lens = new Magnifier(this.scene, this.macro.rt.texture);
    this.lens.group.scale.setScalar(0.85);

    this.trail = makeRibbon({
      segments: 96,
      width: 0.03,
      color: "#ffffff",
      uniforms: { uA: { value: new THREE.Vector3() }, uB: { value: new THREE.Vector3() }, uH: { value: 1 } },
      path: "vec3 p = mix(uA, uB, u); p.y += sin(u * 3.14159) * uH; return p;",
    });
    this.scene.add(this.trail);

    this.dot = dotTexture();
    this.drops = this.points(90, "#9fd8ff", 0.14);
    this.burst = this.points(40, "#ffffff", 0.14);
    this.motes = this.points(160, "#fff2c0", 0.12);
    this.moteSeed = Array.from({ length: 160 }, (_, i) => [hash(i * 1.7), hash(i * 3.1), hash(i * 5.3), 0.3 + hash(i * 7.9) * 0.7]);
    this.petals = this.points(220, "#ffd6e6", 0.42, true);
    this.petalSeed = Array.from({ length: 220 }, (_, i) => [hash(i * 2.3), hash(i * 4.7), hash(i * 6.1), 0.5 + hash(i * 8.3) * 0.5]);
    const pc = this.petals.geometry.attributes.color;
    for (let i = 0; i < 220; i++) pc.setXYZ(i, ...new THREE.Color(["#ffc2d8", "#f4f4f4", "#ffe27a", "#ff8fb8", ...STEPS.map((x) => x.color)][i % 11]).multiplyScalar(0.8).toArray());

    this.tmp = new THREE.Vector3();
    this.markPos = new THREE.Vector3();
  }

  points(n, color, size, vertexColors = false) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    if (vertexColors) g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const p = new THREE.Points(g, new THREE.PointsMaterial({ color: vertexColors ? "#ffffff" : color, vertexColors, size, map: this.dot, transparent: true, depthWrite: false, blending: vertexColors ? THREE.NormalBlending : THREE.AdditiveBlending }));
    p.frustumCulled = false;
    this.scene.add(p);
    return p;
  }

  buildTimeline(timing) {
    const cue = (i) => timing.cues[i];
    const w = (ci, word, n = 0) => timing.wordTime(ci, word, n) ?? cue(ci).start;
    const ev = [];
    const step = (t, k, chorus = false, station = STATION[k]) => ev.push({ t, k, chorus, station });
    this.subs = [];
    const sub = (t0, text, t1) => this.subs.push({ t0, text, t1 });
    this.stamps = [];
    const stamp = (text, t0, color, life = 1.0) => this.stamps.push({ text, t0, color, life });
    this.pings = [];

    const v1 = VERSE1;
    step(w(v1.ask, "ask"), 0);
    sub(w(v1.ask, "question"), "Do beans grow taller in more sunlight?");
    step(w(v1.measure, "measure"), 0, false, "ruler");
    sub(w(v1.measure, "measure"), "What can we measure? Height, in cm");
    step(w(v1.hypothesis, "hypothesis"), 1);
    sub(w(v1.hypothesis, "hypothesis"), "Guess: more sunlight → taller beans");
    stamp("FAIR TEST", w(v1.fair, "test"), STEPS[2].color, 1.1);
    step(w(v1.plan, "experiment"), 2);
    sub(w(v1.plan, "experiment"), "Three pots, one bean seed in each");
    sub(w(v1.choose, "changes"), "Change ONE thing · keep the rest");
    sub(w(v1.keep, "keep"), "Controlled: same water · soil · seeds");
    sub(w(v1.change, "change"), "Tested variable: sunlight");
    this.seeds = [w(v1.plan, "step", 0), w(v1.plan, "by"), w(v1.plan, "step", 1)];
    this.kept = w(v1.choose, "kept");
    this.opens = [w(v1.change, "tested"), w(v1.change, "variable"), w(v1.change, "game")];
    this.pours = [w(v1.keep, "keep"), w(v1.keep, "variables"), w(v1.keep, "controlled")];
    this.canOut = [cue(v1.keep).start - 0.7, w(v1.keep, "same") + 0.9];
    this.rulers = [[w(v1.measure, "measure") - 0.1, cue(v1.measure).end]];
    this.germ = { swell: [w(v1.ask, "question"), w(v1.hypothesis, "hypothesis")], crack: [w(v1.hypothesis, "hypothesis") - 0.2, w(v1.hypothesis, "hypothesis") + 1.4], root: [cue(v1.fair).start, cue(v1.change).end], shoot: [cue(v1.keep).start, w(PRE.repeat, "repeat")] };

    step(w(PRE.measure, "measure"), 3, false, "ruler");
    sub(w(PRE.measure, "measure"), "Measure every plant, every day");
    step(w(PRE.measure, "record"), 4);
    sub(w(PRE.measure, "record"), "Write every height down");
    step(w(PRE.measure, "evidence"), 5);
    this.chase = w(PRE.measure, "lead");
    step(w(PRE.repeat, "repeat"), 2);
    stamp("REPEAT ↻", w(PRE.repeat, "repeat"), STEPS[2].color, 1.3);
    sub(w(PRE.repeat, "repeat"), "Repeat it: more results, stronger answer", SECTIONS.chorus1);
    this.rulers.push([w(PRE.measure, "measure") - 0.1, cue(PRE.repeat).end]);

    const chorus = (ci) => {
      for (const [word, k] of [["ask", 0], ["hypothesize", 1], ["test", 2], ["see", 3]]) step(w(ci, word), k, true);
      step(w(ci + 1, "observe"), 3, true);
      step(w(ci + 1, "record"), 4, true);
      step(w(ci + 2, "evidence"), 5, true);
      step(w(ci + 2, "conclusion"), 6, true);
      step(w(ci + 3, "shuffle"), 0, true);
      for (const [word, k] of [["ask", 0], ["hypothesize", 1], ["test", 2], ["see", 3]]) step(w(ci + 4, word), k, true);
      step(w(ci + 5, "conclusions"), 6, true);
      this.pings.push({ t: w(ci + 5, "question"), k: 0 });
    };
    chorus(CHORUSES.chorus1);

    const v2 = VERSE2;
    step(w(v2.run, "run"), 2);
    sub(w(v2.run, "run"), "Day after day, the beans grow");
    step(w(v2.observe, "observe"), 3, false, "leaf0");
    step(w(v2.observe, "happens"), 3, false, "leaf1");
    step(w(v2.observe, "closely"), 3, false, "leaf2");
    sub(w(v2.observe, "observe"), "Look closely and measure each one");
    this.zoom = [w(v2.observe, "closely"), cue(v2.observe).end + 0.3];
    step(w(v2.record, "record"), 4);
    sub(w(v2.record, "record"), "Write every height in the table");
    const rows = [w(CHORUSES.chorus1 + 1, "record"), w(v2.record, "data"), w(v2.record, "numbers"), w(v2.record, "notes")];
    step(w(v2.analyze, "analyze"), 5);
    sub(w(v2.analyze, "analyze"), "Compare: which beans grew tallest?");
    sub(cue(v2.support).start, "Evidence: full sun grew tallest");
    step(w(v2.support, "hypothesis"), 5, false, "hypo");
    this.pings.push({ t: w(v2.support, "hypothesis"), k: 1 });
    sub(w(v2.support, "hypothesis"), "Guess: more sunlight → taller beans");
    stamp("SUPPORTED ✓", w(v2.support, "drew"), STEPS[6].color, 1.2);
    step(w(v2.conclusion, "conclusion"), 6);
    sub(w(v2.conclusion, "conclusion"), "Yes! More sunlight → taller beans");
    this.pings.push({ t: w(v2.conclusion, "start"), k: 0 });
    step(w(v2.change, "idea"), 1);
    sub(w(v2.change, "change"), "Facts disagree? Change your idea", SECTIONS.bridge);
    this.plan = {
      q: w(v1.ask, "question"),
      hypo: w(v1.hypothesis, "hypothesis"),
      vars: w(v1.choose, "changes"),
      rows,
      days: TABLE_DAYS,
      highlight: w(v2.tables, "result"),
      bars: [w(v2.analyze, "analyze"), w(v2.analyze, "patterns"), w(v2.analyze, "compare")],
      trend: w(v2.analyze, "every"),
      concl: w(v2.conclusion, "conclusion"),
      stamp: w(v2.conclusion, "conclusion") + 1.1,
    };

    this.asks = [];
    for (const [ci, word, k] of BRIDGE) {
      const answer = w(ci, word);
      if (word === "observation") {
        step(w(ci, "watch"), 3);
        step(w(ci, "write"), 4);
      } else {
        if (word === "conclusion") step(w(ci, "evidence"), 5);
        this.asks.push({ t0: cue(ci).start, t1: answer, text: cue(ci).text.replace(/\s*\(.*$/, "").toUpperCase() });
      }
      step(answer, k);
    }
    this.rulers.push([cue(BRIDGE[3][0]).start, cue(BRIDGE[3][0]).end]);

    chorus(CHORUSES.chorus2);

    const o = OUTRO;
    for (const [ci, word, k] of [[o.first, "question", 0], [o.first, "hypothesis", 1], [o.first, "experiment", 2], [o.last, "observation", 3], [o.last, "evidence", 5], [o.last, "conclusion", 6]]) step(w(ci, word), k, true);
    this.finale = w(o.last, "conclusion") + 0.8;
    step(this.finale, 6, false, "paper");
    sub(this.finale, "ask · test · observe · conclude", SECTIONS.end);

    ev.sort((a, b) => a.t - b.t);
    ev.forEach((e, i) => {
      const prev = ev[i - 1];
      e.from = prev ? prev.k : e.k;
      e.fromStation = prev ? prev.station : e.station;
      const gap = prev ? e.t - prev.t : 1;
      e.dur = Math.max(0.12, Math.min(e.chorus ? 0.2 : 0.45, gap * 0.4));
      e.lift = e.chorus ? 40 : 90;
    });
    this.events = ev;
    this.subs.sort((a, b) => a.t0 - b.t0);
    this.subs.forEach((s, i) => (s.t1 ??= this.subs[i + 1]?.t0 ?? SECTIONS.end));
  }

  lastEvent(t) {
    let e = null;
    for (const x of this.events) {
      if (x.t > t) break;
      e = x;
    }
    return e;
  }

  /** Where the lens is headed: the current event, the one it is gliding toward, and how far along. */
  lensState(t) {
    const last = this.lastEvent(t);
    const next = this.events.find((e) => e.t > t);
    if (next && t >= next.t - next.dur) return { last, glide: next, u: (t - (next.t - next.dur)) / next.dur };
    return { last, glide: null, u: 1 };
  }

  /** Screen point of a station's subject on the bench. */
  target(station, day) {
    const v = this.tmp;
    if (station === "seed") this.jar.seedWorld(v);
    else if (station === "soil") this.pots[1].soilWorld(v);
    else if (station === "ruler") this.pots[2].markWorld(v);
    else if (station.startsWith("leaf")) {
      const k = Number(station[4] ?? 2);
      this.pots[k].leafWorld(v, heightAt(k, day));
    } else this.clipboard.paperWorld(v, 0.5, PAGE_V[station]);
    const [x, y] = this.screen(v);
    return [clamp(x, LENS_BOX[0], LENS_BOX[1]), clamp(y, LENS_BOX[2], LENS_BOX[3])];
  }

  /** World point at the lens distance from the camera under a screen point. */
  unproject(x, y, out) {
    out.set((x / 1080) * 2 - 1, 1 - (y / 1920) * 2, 0.5).unproject(this.camera).sub(this.camera.position).normalize();
    return out.multiplyScalar(LENS_DIST).add(this.camera.position);
  }

  update(t, section) {
    const { timing, renderer } = this.ctx;
    const kick = timing.pulse(t, 0.12);
    const bf = timing.beatFloat(t);
    const loud = section.startsWith("chorus") || section === "outro";
    const day = dayAt(t);

    // Camera first: the lens is placed in screen space.
    const sway = Math.sin(t * 0.31) * 0.25;
    const ls = this.lensState(t);
    const cur = ls.last ? ls.last.k : -1;
    const landed = ls.last ? t - ls.last.t : 9;
    const punch = ls.last?.chorus ? Math.exp(-landed / 0.18) : 0;
    this.camera.position.set(sway, VIEW.y + Math.sin(t * 0.23) * 0.05, VIEW.z - kick * (loud ? 0.18 : 0.08) - punch * 0.4);
    this.camera.lookAt(sway * 0.6, VIEW.look, 0);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();

    // Bench props.
    const groove = loud ? Math.sin(Math.PI * bf) * 0.08 : Math.sin(Math.PI * bf * 0.5) * 0.015;
    const rulerOn = this.rulers.reduce((m, [a, b]) => Math.max(m, smooth(a, a + 0.4, t) * (1 - smooth(b - 0.3, b, t))), 0);
    const kept = t >= this.kept ? Math.exp(-(t - this.kept) / 0.2) : 0;
    const wet = this.pours.map((p) => smooth(p, p + 0.4, t) * (1 - 0.6 * smooth(p + 3, p + 10, t)));
    this.pots.forEach((pot, k) => {
      const h = heightAt(k, day);
      pot.update({
        t,
        h,
        open: t >= this.opens[k] ? easeOutBack(clamp((t - this.opens[k]) / 0.45, 0, 1)) : 0,
        seedDrop: (t - (this.seeds[k] - 0.35)) / 0.35,
        ruler: rulerOn,
        wet: wet[k],
        bloom: smooth(12.6, 13.6, day),
        groove: groove * (k % 2 ? -1 : 1),
      });
      pot.group.scale.setScalar(1 + kept * 0.06 + (loud ? kick * 0.025 : 0));
    });
    const g = this.germ;
    const germ = { swell: smooth(...g.swell, t), crack: smooth(...g.crack, t), root: smooth(...g.root, t), hairs: smooth(g.root[0] + 4, g.root[1] + 4, t), shoot: smooth(...g.shoot, t) };
    this.jar.update(germ);
    this.updateCan(t);
    this.scene.updateMatrixWorld();

    // The magnifier: glides (or snaps, in choruses) to each step's subject on its word.
    const e = ls.glide;
    const fromSt = e ? e.fromStation : ls.last ? ls.last.station : "seed";
    const toSt = e ? e.station : fromSt;
    const u = e ? (e.chorus ? easeOutBack(clamp(ls.u, 0, 1)) : easeInOut(clamp(ls.u, 0, 1))) : 1;
    const [ax, ay] = this.target(fromSt, day);
    const [bx, by] = this.target(toSt, day);
    const lift = e ? Math.sin(Math.PI * clamp(ls.u, 0, 1)) * e.lift : 0;
    const bob = Math.abs(Math.sin(Math.PI * bf)) * (loud ? 22 : 6);
    const sx = lerp(ax, bx, u);
    const sy = lerp(ay, by, u) - lift - bob;
    this.unproject(sx, sy, this.lens.group.position);
    this.lens.group.lookAt(this.camera.position);
    let tilt = Math.sin(Math.PI * bf * 0.5) * 0.03 - Math.sign(bx - ax) * 0.25 * Math.sin(Math.PI * clamp(ls.u, 0, 1)) * (e ? 1 : 0);
    if (!e && ls.last && landed < 1) tilt += Math.sign(this.target(ls.last.station, day)[0] - this.target(ls.last.fromStation, day)[0]) * 0.18 * Math.exp(-landed / 0.16) * Math.cos(landed * 16);
    this.lens.inner.rotation.set(0, 0, tilt);
    const lu = this.lens.uniforms;
    lu.uGlint.value = landed < 0.7 ? Math.exp(-landed / 0.35) : 0;
    lu.uSweep.value = lerp(-1.2, 1.2, clamp(landed / 0.45, 0, 1));
    const ask = this.asks.find((a) => t >= a.t0 - 0.1 && t < a.t1 - 0.05);
    const fog = this.asks.reduce((m, a) => Math.max(m, smooth(a.t0 - 0.1, a.t0 + 0.2, t) * (1 - smooth(a.t1 - 0.05, a.t1 + 0.2, t))), 0);
    const far = e && fromSt.replace(/\d$/, "") !== toSt.replace(/\d$/, "") ? Math.sin(Math.PI * clamp(ls.u, 0, 1)) : 0;
    lu.uQ.value = fog;
    lu.uBlur.value = Math.max(fog, far * 0.7);

    // What the lens sees.
    const station = (s) => s.replace(/\d$/, "");
    const tipH = heightAt(2, day);
    this.macro.update({
      t,
      day,
      germ,
      from: station(fromSt),
      to: station(toSt),
      u: e ? clamp(ls.u, 0, 1) : 1,
      planted: clamp((t - (this.seeds[1] - 0.35)) / 0.35, 0, 1),
      sprout: clamp(day / 3, 0, 1),
      wet: wet[1],
      tipCm: tipH * 10,
      zoom: smooth(this.zoom[0] - 0.2, this.zoom[0] + 0.8, t) * (1 - smooth(this.zoom[1], this.zoom[1] + 0.5, t)),
    });
    this.macro.render(renderer);

    // Back sweeps leave a trail; every arrival throws a ring of glints round the rim.
    const back = e && e.from - e.k >= 3 ? e : !e && ls.last && ls.last.from - ls.last.k >= 3 && landed < 0.6 ? ls.last : null;
    this.trail.visible = !!back;
    if (back) {
      const tu = this.trail.material.uniforms;
      this.unproject(...this.target(back.fromStation, day), tu.uA.value);
      this.unproject(...this.target(back.station, day), tu.uB.value);
      tu.uH.value = 0.6;
      tu.uColor.value.set(STEPS[back.k].color);
      tu.uReveal.value = e ? clamp(ls.u, 0, 1) : 1;
      tu.uOpacity.value = e ? 0.8 : 0.8 * (1 - landed / 0.6);
    }
    const bp = this.burst.geometry.attributes.position;
    const c = this.lens.group.position;
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2 + hash(i) * 0.2;
      const r = 0.64 + easeOutCubic(landed / 0.6) * (0.25 + hash(i * 2.1) * 0.3);
      this.tmp.set(Math.cos(a) * r, Math.sin(a) * r, 0).applyQuaternion(this.lens.group.quaternion);
      bp.setXYZ(i, c.x + this.tmp.x, c.y + this.tmp.y, c.z + this.tmp.z);
    }
    bp.needsUpdate = true;
    this.burst.material.opacity = landed < 0.6 ? (1 - landed / 0.6) * (ls.last?.chorus ? 0.9 : 0.5) : 0;
    if (cur >= 0) this.burst.material.color.set(STEPS[cur].color);

    // Sun motes, chorus petals.
    const clap = timing.onsetPulse(t, 0.3, 0.1);
    const mp = this.motes.geometry.attributes.position;
    this.moteSeed.forEach(([mx, my, mz, msp], i) => {
      const y = 1.2 + ((((my * 4 + t * 0.05 * msp) % 4) + 4) % 4);
      mp.setXYZ(i, (mx - 0.5) * 8 + Math.sin(t * 0.4 * msp + i) * 0.2, y, (mz - 0.5) * 3 + 0.5);
    });
    mp.needsUpdate = true;
    this.motes.material.opacity = 0.35 + clap * 0.5;
    const petalsOn = section.startsWith("chorus") ? smooth(SECTIONS[section], SECTIONS[section] + 1.5, t) : section === "outro" ? smooth(this.finale - 1, this.finale + 1, t) : 0;
    this.petals.visible = petalsOn > 0;
    if (petalsOn > 0) {
      const pp = this.petals.geometry.attributes.position;
      this.petalSeed.forEach(([px, py, pz, psp], i) => {
        const y = 6.5 - ((((py * 7 + t * 0.6 * psp) % 7) + 7) % 7);
        pp.setXYZ(i, (px - 0.5) * 9 + Math.sin(t * 1.3 * psp + i) * 0.4, y, (pz - 0.5) * 4 + 1);
      });
      pp.needsUpdate = true;
      this.petals.material.opacity = petalsOn * 0.85;
    }

    this.tmp.set(this.camera.position.x, 0, this.camera.position.z - 400).project(this.camera);
    this.bgU.uHorizon.value = this.tmp.y * 0.5 + 0.5;
    this.bgU.uTime.value = t;
    this.bgU.uGlow.value = (loud ? 1 : 0.3) + kick * 0.3;
    this.garden.update(t);

    const post = { bloom: [loud ? 0.55 : 0.42, 0.4, 0.82], ca: 0.08 + kick * (loud ? 0.2 : 0.1), vignette: 0.32, grain: 0.022, zoom: 1 + punch * 0.02 };
    const start = SECTIONS[section];
    if (start !== undefined && t - start < 0.3) post.flash = Math.exp(-(t - start) / 0.1) * 0.3;
    if (punch > 0) post.flash = Math.max(post.flash || 0, punch * 0.08);
    for (const s of this.stamps) if (t >= s.t0 && t < s.t0 + 0.15) post.flash = Math.max(post.flash || 0, 0.12 * (1 - (t - s.t0) / 0.15));
    this.drawHud(t, section, day, cur, landed, rulerOn, ask, [sx, sy]);
    return post;
  }

  updateCan(t) {
    const [inT, outT] = this.canOut;
    const rest = { x: -0.5, y: 0.245, z: 0.1, tilt: 0 };
    const over = (k) => ({ x: POT_X[k] - 0.46, y: SOIL_Y + 0.74, z: POT_Z, tilt: -1 });
    const keys = [[inT - 0.01, rest], [inT + 0.5, { ...over(0), tilt: 0 }]];
    this.pours.forEach((p, k) => {
      keys.push([p, over(k)], [p + 0.55, over(k)]);
      if (k < 2) keys.push([this.pours[k + 1] - 0.25, { ...over(k + 1), tilt: -0.1 }]);
    });
    keys.push([outT - 0.5, { ...over(2), tilt: 0 }], [outT, rest]);
    let i = 0;
    while (i < keys.length - 1 && keys[i + 1][0] <= t) i++;
    const [t0, a] = keys[i];
    const [t1, b] = keys[Math.min(i + 1, keys.length - 1)];
    const u = t1 > t0 ? easeInOut((t - t0) / (t1 - t0)) : 1;
    const pos = {};
    for (const key of ["x", "y", "z", "tilt"]) pos[key] = lerp(a[key], b[key], t < t0 ? 0 : u);
    this.can.group.position.set(pos.x, pos.y, pos.z);
    this.can.group.rotation.set(0, 0, pos.tilt);
    this.can.group.scale.setScalar(0.85);
    const dp = this.drops.geometry.attributes.position;
    let on = 0;
    this.pours.forEach((p, k) => {
      for (let j = 0; j < 30; j++) {
        const age = t - p - hash(k * 40 + j) * 0.5;
        const live = age > 0 && t < p + 0.6;
        const fall = age * 2.4;
        dp.setXYZ(k * 30 + j, live ? POT_X[k] + 0.2 + (hash(j * 3.3) - 0.5) * 0.2 : 0, live ? SOIL_Y + 0.5 - fall - age * age * 4 : -99, live ? POT_Z + (hash(j * 5.1) - 0.5) * 0.2 : 0);
      }
      if (t >= p && t < p + 0.6) on = 1;
    });
    dp.needsUpdate = true;
    this.drops.material.opacity = on * 0.9;
  }

  screen(v) {
    this.tmp.copy(v).project(this.camera);
    return [(this.tmp.x * 0.5 + 0.5) * 1080, (-this.tmp.y * 0.5 + 0.5) * 1920];
  }

  /** Step track: seven icon chips, the current one filled in its colour. */
  drawTrack(t, cur, landed, alpha) {
    const g = this.ctx.hud.ctx;
    const gap = 84;
    const x0 = 540 - gap * 3;
    const lit = STEPS.map((_, k) => (k === cur ? 1 : 0));
    for (const p of this.pings) if (t >= p.t && t < p.t + 1) lit[p.k] = Math.max(lit[p.k], Math.exp(-(t - p.t) / 0.35));
    if (t >= this.chase) for (let k = 0; k < 7; k++) lit[k] = Math.max(lit[k], t >= this.chase + k * 0.09 ? Math.exp(-(t - this.chase - k * 0.09) / 0.3) : 0);
    if (t >= this.finale) for (let k = 0; k < 7; k++) lit[k] = Math.max(lit[k], 0.6);
    g.save();
    g.globalAlpha = alpha;
    g.strokeStyle = "rgba(255,255,255,0.25)";
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(x0, TRACK_Y);
    g.lineTo(x0 + gap * 6, TRACK_Y);
    g.stroke();
    STEPS.forEach((s, k) => {
      const x = x0 + k * gap;
      const on = lit[k];
      const r = 21 + (k === cur ? 7 + 6 * Math.exp(-landed / 0.15) : 0);
      g.fillStyle = "#11141c";
      g.beginPath();
      g.arc(x, TRACK_Y, r, 0, Math.PI * 2);
      g.fill();
      if (on > 0) {
        g.globalAlpha = alpha * on;
        g.fillStyle = s.color;
        g.fill();
        g.globalAlpha = alpha;
      }
      g.strokeStyle = s.color;
      g.lineWidth = 2.5;
      g.stroke();
      g.save();
      g.translate(x, TRACK_Y);
      g.scale((r / 21) * 0.12, (r / 21) * 0.12);
      g.lineCap = g.lineJoin = "round";
      g.lineWidth = 18;
      g.strokeStyle = g.fillStyle = on > 0.5 ? "#11141c" : "rgba(235,235,240,0.8)";
      ICONS[k](g);
      g.restore();
    });
    g.restore();
  }

  drawHud(t, section, day, cur, landed, rulerOn, ask, lensAt) {
    const { hud } = this.ctx;
    const g = hud.ctx;
    // The lawn behind the lyric band is bright; shade it so the words stay crisp.
    const band = g.createLinearGradient(0, 1240, 0, 1700);
    band.addColorStop(0, "rgba(6,14,8,0)");
    band.addColorStop(0.35, "rgba(6,14,8,0.42)");
    band.addColorStop(0.7, "rgba(6,14,8,0.42)");
    band.addColorStop(1, "rgba(6,14,8,0)");
    g.fillStyle = band;
    g.fillRect(0, 1240, 1080, 460);

    // Title panel: the current step (or the bridge question), its one-line detail and the step track.
    let title = null;
    if (ask) title = { text: ask.text, size: 84, pop: 1, color: "#ffffff", alpha: smooth(ask.t0 - 0.1, ask.t0 + 0.15, t), tracking: 2 };
    else if (cur >= 0) title = { text: `${cur + 1} · ${STEPS[cur].name}`, size: 92, pop: 1 + 0.2 * Math.exp(-landed / 0.15), color: STEPS[cur].color, alpha: smooth(SECTIONS.verse1, SECTIONS.verse1 + 0.3, t), tracking: 3 };
    const loud = section.startsWith("chorus");
    const subNow = this.subs.find((s) => t >= s.t0 && t < s.t1);
    const subA = subNow && !loud && !ask ? smooth(subNow.t0, subNow.t0 + 0.25, t) * (1 - smooth(subNow.t1 - 0.25, subNow.t1, t)) : 0;
    if (title) {
      const width = (text, size, family, tracking) => {
        hud.font(size, 800, family);
        return g.measureText(text).width + tracking * text.length;
      };
      const w = Math.max(width(title.text, title.size, FONT_COND, title.tracking), subA > 0 ? width(subNow.text, 34, FONT_MONO, 0) * subA : 0, 560) + 84;
      g.save();
      g.globalAlpha = 0.74 * title.alpha;
      g.fillStyle = "#07080e";
      g.beginPath();
      g.roundRect(540 - w / 2, TITLE_Y - 66, w, 244, 28);
      g.fill();
      g.restore();
      hud.text(title.text, 540, TITLE_Y, { size: Math.round(title.size * title.pop), weight: 800, family: FONT_COND, color: title.color, alpha: title.alpha, glow: 16, tracking: title.tracking });
      this.drawTrack(t, cur, landed, title.alpha);
    }
    if (subA > 0) hud.text(subNow.text, 540, SUB_Y, { size: 34, weight: 700, family: FONT_MONO, color: "#ffffff", alpha: subA });
    if (day > 0) {
      const a = 0.9 * smooth(DAYS[0][0], DAYS[0][0] + 0.5, t);
      g.save();
      g.globalAlpha = 0.62 * a;
      g.fillStyle = "#07080e";
      g.beginPath();
      g.roundRect(SAFE.left - 14, 548 - 26, 150, 52, 16);
      g.fill();
      g.restore();
      hud.text(`DAY ${Math.floor(day)}`, SAFE.left, 548, { size: 30, weight: 700, family: FONT_MONO, color: "#fff4c8", align: "left", alpha: a });
    }

    for (const s of this.stamps) hud.stamp(s.text, t, s.t0, { x: 540, y: STAMP_Y, size: s.text.length > 3 ? 96 : 150, color: s.color, angle: -0.07, life: s.life });

    if (rulerOn > 0.5) {
      this.pots.forEach((pot, k) => {
        const h = heightAt(k, day);
        if (h < 0.05) return;
        const [x, y] = this.screen(pot.markWorld(this.markPos));
        if (Math.hypot(x - lensAt[0], y - lensAt[1]) < 230) return;
        hud.text(`${Math.round(h * 10)} cm`, x + 58, y - 6, { size: 30, weight: 800, family: FONT_COND, color: "#ffe36b", alpha: smooth(0.5, 0.9, rulerOn), glow: 10 });
      });
    }
  }
}
