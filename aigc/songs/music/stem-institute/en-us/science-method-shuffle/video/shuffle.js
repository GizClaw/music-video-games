import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { FONT_COND, FONT_MONO, SAFE } from "@gizclaw/mvg-core/hud.js";
import { clamp, easeInOut, easeOutBack, easeOutCubic, hash, lerp, smooth } from "@gizclaw/mvg-core/timing.js";
import { BRIDGE, CHORUSES, DAYS, OUTRO, POTS, PRE, SECTIONS, STEPS, TABLE_DAYS, VERSE1, VERSE2 } from "./constants.js";
import { BENCH_Y, CLIP_AT, Garden, JAR_AT, POT_X, POT_Z, SKY } from "./garden.js";
import { Notebook, PAGE_H, PAGE_W } from "./notebook.js";
import { BeanPot, Clipboard, POT_H, SeedJar, WateringCan } from "./props.js";

const FOV = 30;
const VIEW = { y: 2.4, z: 15.5, look: 1.75 };
const SOIL_Y = BENCH_Y + POT_H - 0.04;
const TITLE_Y = 330;
const SUB_Y = 404;
const TRACK_Y = 468;
const STAMP_Y = 600;
/** The close-up each step cuts to; notebook shots name a spot on the page (0..1 from the top-left) and a distance. */
const STATION = ["seed", "hypo", "soil", "leaf", "table", "chart", "check"];
const PAGE_AT = { hypo: [0.5, 0.2, 2.0], table: [0.5, 0.46, 2.3], chart: [0.5, 0.77, 2.1], check: [0.6, 0.91, 1.7], paper: [0.5, 0.5, 3.4] };
/** Seconds a verse close-up is held before the camera pulls back to the whole bench. */
const HOLD = 2.8;

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
    // Depth haze that closes in for close-ups, standing in for a shallow focus.
    this.scene.fog = new THREE.Fog("#4f6457", 60, 400);

    this.focusU = { value: 0 };
    this.bgU = { uTime: { value: 0 }, uGlow: { value: 0 }, uHorizon: { value: 0.5 }, uFocus: this.focusU };
    const bg = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({ depthTest: false, depthWrite: false, uniforms: this.bgU, vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }", fragmentShader: SKY }),
    );
    bg.renderOrder = -1;
    bg.frustumCulled = false;
    this.scene.add(bg);

    this.garden = new Garden(this.scene, this.focusU);
    this.bench = new THREE.Group();
    this.bench.position.y = BENCH_Y;
    this.scene.add(this.bench);
    this.pots = POTS.map((p, k) => new BeanPot(this.bench, k, p, POT_X[k], POT_Z));
    this.jar = new SeedJar(this.bench);
    this.jar.group.position.set(JAR_AT[0], 0, JAR_AT[1]);
    this.can = new WateringCan(this.scene);

    this.buildTimeline(timing);
    this.notebook = new Notebook(this.plan, tableCm);
    this.clipboard = new Clipboard(this.bench, this.notebook.texture);
    this.clipboard.group.position.set(CLIP_AT[0], 0, CLIP_AT[1]);
    this.clipboard.group.rotation.y = 0.15;

    this.dot = dotTexture();
    this.drops = this.points(90, "#9fd8ff", 0.14);
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
      step(w(ci + 3, "shuffle"), 0, true, "wide");
      for (const [word, k] of [["ask", 0], ["hypothesize", 1], ["test", 2], ["see", 3]]) step(w(ci + 4, word), k, true);
      step(w(ci + 5, "conclusions"), 6, true);
      this.pings.push({ t: w(ci + 5, "question"), k: 0 });
    };
    chorus(CHORUSES.chorus1);

    const v2 = VERSE2;
    step(w(v2.run, "run"), 2);
    sub(w(v2.run, "run"), "Day after day, the beans grow");
    step(w(v2.observe, "observe"), 3, false, "ruler");
    step(w(v2.observe, "happens"), 3, false, "leaf1");
    step(w(v2.observe, "closely"), 3, false, "leaf2");
    sub(w(v2.observe, "observe"), "Look closely and measure each one");
    this.zoom = [w(v2.observe, "closely"), cue(v2.observe).end + 0.3];
    this.rulers.push([w(v2.observe, "observe") - 0.1, cue(v2.record).start + 0.2]);
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
    this.events = ev;

    // Shots: every step word lands a close-up of its subject (snapped in choruses); verse
    // close-ups are held, then the camera pulls back to the bench; bridge questions are asked wide.
    const shots = [{ t0: -1, dur: 0.01, station: "wide" }];
    ev.forEach((e, i) => {
      const next = ev[i + 1];
      const prev = shots.at(-1);
      const dur = e.chorus ? (e.station === "wide" ? 0.35 : 0.18) : clamp((e.t - prev.t0) * 0.5, 0.3, 0.8);
      shots.push({ t0: Math.max(e.t - dur * 0.75, prev.t0 + 0.05, SECTIONS.verse1), dur, station: e.station, snap: e.chorus });
      const gap = next ? next.t - e.t : 99;
      if (gap > HOLD + 1) shots.push({ t0: e.t + (e.chorus ? 1.8 : HOLD), dur: 1.0, station: "wide" });
    });
    for (const a of this.asks) shots.push({ t0: a.t0 - 0.15, dur: 0.5, station: "wide" });
    shots.sort((a, b) => a.t0 - b.t0);
    this.shots = shots;
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

  /** Camera framing for a station at time t: position, look target and how close-up it is. */
  pose(station, t, day) {
    if (station === "wide") {
      const sway = Math.sin(t * 0.31) * 0.2;
      return { pos: new THREE.Vector3(sway, VIEW.y + Math.sin(t * 0.23) * 0.05, VIEW.z), look: new THREE.Vector3(sway * 0.6, VIEW.look, 0), focus: 0, d: VIEW.z };
    }
    const S = new THREE.Vector3();
    const dir = new THREE.Vector3(0, 0.22, 1);
    let d;
    if (station === "seed") {
      this.jar.seedWorld(S, this.germNow);
      d = 1.9 + this.germNow.root * 0.6;
    } else if (station === "soil") {
      const h = heightAt(1, day);
      S.set(POT_X[1], SOIL_Y + 0.22 + h * 0.45, POT_Z);
      d = 3.0 + h * 1.6;
    } else if (station === "ruler") {
      this.pots[2].rulerWorld(S, heightAt(2, day));
      d = 1.5;
    } else if (station.startsWith("leaf")) {
      const k = Number(station[4] ?? 2);
      this.pots[k].leafWorld(S, heightAt(k, day));
      d = lerp(1.5, 0.8, this.zoomNow);
    } else {
      const [u, v, dist] = PAGE_AT[station];
      this.clipboard.paperWorld(S, u, v);
      this.clipboard.paperNormal(dir).y += 0.1;
      d = dist;
    }
    dir.normalize();
    // The subject sits a little above frame centre, clear of the lyric band.
    return { pos: S.clone().addScaledVector(dir, d), look: S.clone().setY(S.y - 0.03 * d), focus: 1, d };
  }

  /** Blend of shot i's transition at time t, starting from wherever the previous shot had got to. */
  shotAt(i, t, day, depth = 0) {
    const s = this.shots[i];
    const to = this.pose(s.station, t, day);
    if (i === 0) return to;
    const u = clamp((t - s.t0) / s.dur, 0, 1);
    if (u >= 1) return to;
    const prev = this.shots[i - 1];
    const from = depth < 3 && s.t0 < prev.t0 + prev.dur ? this.shotAt(i - 1, s.t0, day, depth + 1) : this.pose(prev.station, t, day);
    const e = s.snap ? easeOutCubic(u) : easeInOut(u);
    return { pos: from.pos.lerp(to.pos, e), look: from.look.lerp(to.look, e), focus: lerp(from.focus, to.focus, e), d: lerp(from.d, to.d, e) };
  }

  update(t, section) {
    const { timing } = this.ctx;
    const kick = timing.pulse(t, 0.12);
    const bf = timing.beatFloat(t);
    const loud = section.startsWith("chorus") || section === "outro";
    const day = dayAt(t);
    const last = this.lastEvent(t);
    const cur = last ? last.k : -1;
    const landed = last ? t - last.t : 9;
    const punch = last?.chorus ? Math.exp(-landed / 0.18) : 0;

    // Bench props first; the close-ups frame them where they are now.
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
    this.germNow = { swell: smooth(...g.swell, t), crack: smooth(...g.crack, t), root: smooth(...g.root, t), hairs: smooth(g.root[0] + 4, g.root[1] + 4, t), shoot: smooth(...g.shoot, t) };
    this.jar.update(this.germNow);
    this.notebook.draw(t, day);
    const pen = this.notebook.pencil(t);
    this.clipboard.update({ u: pen.x / PAGE_W, v: pen.y / PAGE_H, down: pen.down });
    this.updateCan(t);
    this.scene.updateMatrixWorld();

    // The camera: wide on the bench, or dollied (snapped, in choruses) to the step's subject.
    this.zoomNow = smooth(this.zoom[0] - 0.2, this.zoom[0] + 0.6, t) * (1 - smooth(this.zoom[1], this.zoom[1] + 0.5, t));
    let i = 0;
    while (i < this.shots.length - 1 && this.shots[i + 1].t0 <= t) i++;
    const shot = this.shotAt(i, t, day);
    const push = kick * (loud ? 0.04 : 0.015) * shot.d + punch * 0.03 * shot.d;
    this.camera.position.copy(shot.pos).addScaledVector(this.tmp.subVectors(shot.look, shot.pos).normalize(), push);
    this.camera.lookAt(shot.look);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    const focus = shot.focus;
    this.focusU.value = focus;
    this.scene.fog.near = lerp(60, shot.d * 2.2, focus);
    this.scene.fog.far = lerp(400, shot.d * 9, focus);
    const ask = this.asks.find((a) => t >= a.t0 - 0.1 && t < a.t1 - 0.05);

    // Sun motes, chorus petals; none right in front of the camera.
    const near = (x, y, z) => this.tmp.set(x, y, z).distanceTo(this.camera.position) < 1.2;
    const clap = timing.onsetPulse(t, 0.3, 0.1);
    const mp = this.motes.geometry.attributes.position;
    this.moteSeed.forEach(([mx, my, mz, msp], k) => {
      const x = (mx - 0.5) * 8 + Math.sin(t * 0.4 * msp + k) * 0.2;
      const y = 1.2 + ((((my * 4 + t * 0.05 * msp) % 4) + 4) % 4);
      const z = (mz - 0.5) * 3 + 0.5;
      mp.setXYZ(k, x, near(x, y, z) ? -99 : y, z);
    });
    mp.needsUpdate = true;
    this.motes.material.opacity = 0.35 + clap * 0.5;
    const petalsOn = section.startsWith("chorus") ? smooth(SECTIONS[section], SECTIONS[section] + 1.5, t) : section === "outro" ? smooth(this.finale - 1, this.finale + 1, t) : 0;
    this.petals.visible = petalsOn > 0;
    if (petalsOn > 0) {
      const pp = this.petals.geometry.attributes.position;
      this.petalSeed.forEach(([px, py, pz, psp], k) => {
        const x = (px - 0.5) * 9 + Math.sin(t * 1.3 * psp + k) * 0.4;
        const y = 6.5 - ((((py * 7 + t * 0.6 * psp) % 7) + 7) % 7);
        const z = (pz - 0.5) * 4 + 1;
        pp.setXYZ(k, x, near(x, y, z) ? -99 : y, z);
      });
      pp.needsUpdate = true;
      this.petals.material.opacity = petalsOn * 0.85;
    }

    this.tmp.set(this.camera.position.x, 0, this.camera.position.z - 400).project(this.camera);
    this.bgU.uHorizon.value = this.tmp.y * 0.5 + 0.5;
    this.bgU.uTime.value = t;
    this.bgU.uGlow.value = (loud ? 1 : 0.3) + kick * 0.3;
    this.garden.update(t);

    const post = { bloom: [loud ? 0.55 : 0.42, 0.4, 0.82], ca: 0.08 + kick * (loud ? 0.2 : 0.1), vignette: lerp(0.32, 0.6, focus), grain: 0.022, zoom: 1 + punch * 0.02 };
    const start = SECTIONS[section];
    if (start !== undefined && t - start < 0.3) post.flash = Math.exp(-(t - start) / 0.1) * 0.3;
    if (punch > 0) post.flash = Math.max(post.flash || 0, punch * 0.08);
    for (const s of this.stamps) if (t >= s.t0 && t < s.t0 + 0.15) post.flash = Math.max(post.flash || 0, 0.12 * (1 - (t - s.t0) / 0.15));
    this.drawHud(t, section, day, cur, landed, rulerOn * (1 - focus), ask, PAGE_AT[this.shots[i].station] ? focus : 0);
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

  /** paper: how much the shot is a notebook close-up, whose writing runs on below the subject. */
  drawHud(t, section, day, cur, landed, rulerOn, ask, paper) {
    const { hud } = this.ctx;
    const g = hud.ctx;
    // The lawn behind the lyric band is bright; shade it so the words stay crisp.
    const band = g.createLinearGradient(0, 1240, 0, 1700);
    band.addColorStop(0, "rgba(6,14,8,0)");
    const shade = 0.42 + 0.33 * paper;
    band.addColorStop(0.35, `rgba(6,14,8,${shade})`);
    band.addColorStop(0.7, `rgba(6,14,8,${shade})`);
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
        hud.text(`${Math.round(h * 10)} cm`, x + 58, y - 6, { size: 30, weight: 800, family: FONT_COND, color: "#ffe36b", alpha: smooth(0.5, 0.9, rulerOn), glow: 10 });
      });
    }
  }
}
