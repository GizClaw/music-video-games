import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { makeRibbon } from "@gizclaw/mvg-core/fx.js";
import { FONT_COND, FONT_MONO, SAFE } from "@gizclaw/mvg-core/hud.js";
import { clamp, easeInOut, easeOutBack, easeOutCubic, hash, lerp, smooth } from "@gizclaw/mvg-core/timing.js";
import { BRIDGE, CHORUSES, DAYS, OUTRO, POTS, PRE, SECTIONS, STEPS, TABLE_DAYS, VERSE1, VERSE2 } from "./constants.js";
import { BENCH_Y, BeanPot, EDGE_Z, Garden, POT_X, SKY, SOIL_Y, growth, ladybug, magnifier, plaqueCenter, plaqueX, wateringCan } from "./garden.js";

const FOV = 30;
const WIDE = { x: 0, y: 2.4, z: 16.5, look: 1.45 };
const CLOSE = { x: 0, y: 2.5, z: 15, look: 1.6 };
const TITLE_Y = 330;
const SUB_Y = 410;
const STAMP_Y = 600;
const CLIP_W = 600;
const CLIP_H = 780;
const BAR_COLORS = ["#6f9c86", "#8cc84a", "#f2b51d"];

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
    this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.35;
    this.camera = new THREE.PerspectiveCamera(FOV, 9 / 16, 0.1, 400);
    this.scene.add(this.camera);
    // Late-morning sun from the upper right, blue sky fill from above.
    const sun = new THREE.DirectionalLight("#fff0d2", 1.8);
    sun.position.set(6, 9, 7);
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
    this.pots = POTS.map((p, k) => new BeanPot(this.scene, k, p));
    this.bug = ladybug();
    this.can = wateringCan();
    this.glass = magnifier();
    this.scene.add(this.bug, this.can, this.glass);

    this.trail = makeRibbon({
      segments: 96,
      width: 0.035,
      color: "#ffffff",
      uniforms: { uA: { value: new THREE.Vector3() }, uB: { value: new THREE.Vector3() }, uH: { value: 1 } },
      path: "vec3 p = mix(uA, uB, u); p.y += sin(u * 3.14159) * uH; return p;",
    });
    this.scene.add(this.trail);

    this.dot = dotTexture();
    this.drops = this.points(90, "#9fd8ff", 0.14);
    this.burst = this.points(36, "#ffffff", 0.16);
    this.motes = this.points(160, "#fff2c0", 0.12);
    this.moteSeed = Array.from({ length: 160 }, (_, i) => [hash(i * 1.7), hash(i * 3.1), hash(i * 5.3), 0.3 + hash(i * 7.9) * 0.7]);
    this.petals = this.points(220, "#ffd6e6", 0.42, true);
    this.petalSeed = Array.from({ length: 220 }, (_, i) => [hash(i * 2.3), hash(i * 4.7), hash(i * 6.1), 0.5 + hash(i * 8.3) * 0.5]);
    const pc = this.petals.geometry.attributes.color;
    for (let i = 0; i < 220; i++) pc.setXYZ(i, ...new THREE.Color(["#ffc2d8", "#f4f4f4", "#ffe27a", "#ff8fb8", ...STEPS.map((x) => x.color)][i % 11]).multiplyScalar(0.8).toArray());

    this.buildClipboard();
    this.buildTimeline(timing);
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

  /** Clipboard held up to the camera: a heights table above a bar chart. */
  buildClipboard() {
    this.clipCanvas = document.createElement("canvas");
    this.clipCanvas.width = CLIP_W;
    this.clipCanvas.height = CLIP_H;
    this.clipTex = new THREE.CanvasTexture(this.clipCanvas);
    this.clipTex.colorSpace = THREE.SRGBColorSpace;
    this.clipTex.anisotropy = 4;
    this.clip = new THREE.Group();
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.55, 0.012), new THREE.MeshStandardMaterial({ color: "#8a5a34", roughness: 0.7 }));
    const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.494), new THREE.MeshBasicMaterial({ map: this.clipTex, color: new THREE.Color(0.6, 0.6, 0.6) }));
    paper.position.set(0, -0.014, 0.007);
    const clasp = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.045, 0.03), new THREE.MeshStandardMaterial({ color: "#7a8088", metalness: 0.6, roughness: 0.4 }));
    clasp.position.set(0, 0.265, 0.015);
    this.clip.add(board, paper, clasp);
    this.clip.visible = false;
    this.camera.add(this.clip);
  }

  buildTimeline(timing) {
    const cue = (i) => timing.cues[i];
    const w = (ci, word, n = 0) => timing.wordTime(ci, word, n) ?? cue(ci).start;
    const ev = [];
    const step = (t, k, chorus = false) => ev.push({ t, k, chorus });
    this.subs = [];
    const sub = (t0, text, t1) => this.subs.push({ t0, text, t1 });
    this.stamps = [];
    const stamp = (text, t0, color, life = 1.0) => this.stamps.push({ text, t0, color, life });
    this.pings = [];

    const v1 = VERSE1;
    step(w(v1.ask, "ask"), 0);
    sub(w(v1.ask, "question"), "Do beans grow taller in more sunlight?");
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

    step(w(PRE.measure, "measure"), 3);
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
      stamp("✓", w(ci + 3, "check"), STEPS[6].color, 0.7);
      for (const [word, k] of [["ask", 0], ["hypothesize", 1], ["test", 2], ["see", 3]]) step(w(ci + 4, word), k, true);
      step(w(ci + 5, "conclusions"), 6, true);
      this.pings.push({ t: w(ci + 5, "question"), k: 0 });
    };
    chorus(CHORUSES.chorus1);

    const v2 = VERSE2;
    step(w(v2.run, "run"), 2);
    sub(w(v2.run, "run"), "Day after day, the beans grow");
    step(w(v2.observe, "observe"), 3);
    sub(w(v2.observe, "observe"), "Look closely and measure each one");
    this.closeWin = [w(v2.observe, "closely") - 0.5, cue(v2.record).start - 0.1];
    this.magKeys = [[cue(v2.observe).start - 0.3, -1], [w(v2.observe, "what"), 0], [w(v2.observe, "happens"), 1], [w(v2.observe, "closely"), 2], [cue(v2.observe).end + 0.2, 3]];
    this.rulers.push([w(v2.observe, "observe") - 0.1, cue(v2.record).start + 0.2]);
    step(w(v2.record, "record"), 4);
    this.clipWin = [cue(v2.record).start - 0.3, w(v2.support, "hypothesis") - 0.1];
    this.rows = [w(v2.record, "record"), w(v2.record, "data"), w(v2.record, "numbers"), w(v2.record, "notes")];
    this.highlight = w(v2.tables, "result");
    step(w(v2.analyze, "analyze"), 5);
    this.bars = [w(v2.analyze, "analyze"), w(v2.analyze, "patterns"), w(v2.analyze, "compare")];
    this.trend = w(v2.analyze, "every");
    sub(cue(v2.support).start, "Evidence: full sun grew tallest");
    this.pings.push({ t: w(v2.support, "hypothesis"), k: 1 });
    sub(w(v2.support, "hypothesis"), "Guess: more sunlight → taller beans");
    stamp("SUPPORTED ✓", w(v2.support, "drew"), STEPS[6].color, 1.2);
    step(w(v2.conclusion, "conclusion"), 6);
    sub(w(v2.conclusion, "conclusion"), "Yes! More sunlight → taller beans");
    this.pings.push({ t: w(v2.conclusion, "start"), k: 0 });
    step(w(v2.change, "idea"), 1);
    sub(w(v2.change, "change"), "Facts disagree? Change your idea", SECTIONS.bridge);

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
    sub(this.finale, "ask · test · observe · conclude", SECTIONS.end);

    ev.sort((a, b) => a.t - b.t);
    ev.forEach((e, i) => {
      const prev = ev[i - 1];
      e.from = prev ? prev.k : e.k;
      const gap = prev ? e.t - prev.t : 1;
      const span = Math.abs(e.k - e.from);
      e.dur = Math.min(span ? 0.2 + 0.05 * span : 0.2, 0.55, Math.max(0.12, gap - 0.06));
      e.lift = span ? 0.22 + 0.07 * span : 0.14;
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

  /** Ladybug position on the bench edge plus hop progress. */
  bugAt(t, bf, loud) {
    const next = this.events.find((e) => e.t > t);
    const last = this.lastEvent(t);
    const p = new THREE.Vector3(plaqueX(last ? last.k : 0), BENCH_Y, EDGE_Z);
    let facing = -Math.PI / 2;
    let squash = 1;
    let hop = null;
    if (next && t >= next.t - next.dur) {
      const u = (t - (next.t - next.dur)) / next.dur;
      p.x = lerp(plaqueX(next.from), plaqueX(next.k), easeInOut(u));
      p.y += Math.sin(Math.PI * u) * next.lift;
      if (next.k !== next.from) facing = next.k > next.from ? 0 : Math.PI;
      squash = 1 + 0.12 * Math.sin(Math.PI * u);
      hop = { e: next, u };
    } else if (last) {
      const since = t - last.t;
      squash = 1 - 0.3 * Math.exp(-since / 0.09) * Math.sin(Math.min(Math.PI, since * 18));
      const bounce = Math.abs(Math.sin(Math.PI * bf)) * (loud ? 0.07 : 0.025);
      p.y += bounce;
      p.x += Math.sin(Math.PI * bf) * 0.035;
      if (since < 0.25 && last.k !== last.from) facing = lerp(last.k > last.from ? 0 : Math.PI, -Math.PI / 2, since / 0.25);
    }
    return { p, facing, squash, hop, last };
  }

  update(t, section) {
    const { timing } = this.ctx;
    const kick = timing.pulse(t, 0.12);
    const bf = timing.beatFloat(t);
    const loud = section.startsWith("chorus") || section === "outro";
    const day = dayAt(t);

    // Plaques: the current step glows; pings and the "evidence leads" chase flash others.
    const bug = this.bugAt(t, bf, loud);
    const cur = bug.last ? bug.last.k : -1;
    const landed = bug.last ? t - bug.last.t : 9;
    const lit = STEPS.map((_, k) => (k === cur ? 0.75 + 0.5 * Math.exp(-landed / 0.25) + kick * 0.15 : 0));
    for (const p of this.pings) if (t >= p.t && t < p.t + 1) lit[p.k] = Math.max(lit[p.k], Math.exp(-(t - p.t) / 0.35) * 1.2);
    if (loud) {
      const beat = timing.beatIndexAt(t);
      for (let k = 0; k < 7; k++) if ((beat + k) % 2 === 0) lit[k] = Math.max(lit[k], 0.35 * timing.pulse(t, 0.22));
    }
    if (t >= this.chase) for (let k = 0; k < 7; k++) lit[k] = Math.max(lit[k], Math.exp(-Math.max(0, t - this.chase - k * 0.09) / 0.3) * (t >= this.chase + k * 0.09 ? 1 : 0));
    if (t >= this.finale) {
      for (let k = 0; k < 7; k++) {
        const ph = (((bf - k * 0.5) % 4) + 4) % 4;
        lit[k] = Math.max(lit[k], 0.45 + 0.55 * Math.exp(-ph / 0.5));
      }
    }
    this.garden.update(t, lit, STEPS.map((s) => s.color));

    // The ladybug.
    this.bug.position.copy(bug.p);
    this.bug.rotation.set(0, bug.facing, 0);
    this.bug.scale.set(1.8 / Math.sqrt(bug.squash), 1.8 * bug.squash, 1.8 / Math.sqrt(bug.squash));
    const backHop = bug.hop && bug.hop.e.from - bug.hop.e.k >= 3 ? bug.hop : null;
    const trailEvent = backHop ? backHop.e : bug.last && bug.last.from - bug.last.k >= 3 && landed < 0.6 ? bug.last : null;
    this.trail.visible = !!trailEvent;
    if (trailEvent) {
      const u = this.trail.material.uniforms;
      u.uA.value.set(plaqueX(trailEvent.from), BENCH_Y + 0.15, EDGE_Z);
      u.uB.value.set(plaqueX(trailEvent.k), BENCH_Y + 0.15, EDGE_Z);
      u.uH.value = trailEvent.lift;
      u.uColor.value.set(STEPS[trailEvent.k].color);
      u.uReveal.value = backHop ? easeInOut(backHop.u) : 1;
      u.uOpacity.value = backHop ? 0.8 : 0.8 * (1 - landed / 0.6);
    }
    const bp = this.burst.geometry.attributes.position;
    const bAge = landed;
    const origin = cur >= 0 ? plaqueCenter(cur) : plaqueCenter(0);
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2 + hash(i) * 0.3;
      const r = 0.32 + easeOutCubic(bAge / 0.6) * (0.35 + hash(i * 2.1) * 0.35);
      bp.setXYZ(i, origin.x + Math.cos(a) * r, origin.y + Math.sin(a) * r * 0.9, origin.z + 0.05);
    }
    bp.needsUpdate = true;
    this.burst.material.opacity = bAge < 0.6 ? (1 - bAge / 0.6) * (bug.last?.chorus ? 1 : 0.6) : 0;
    if (cur >= 0) this.burst.material.color.set(STEPS[cur].color);

    // Beans: seeds, shades, watering, growth, rulers.
    const groove = loud ? Math.sin(Math.PI * bf) * 0.08 : Math.sin(Math.PI * bf * 0.5) * 0.015;
    const rulerOn = this.rulers.reduce((m, [a, b]) => Math.max(m, smooth(a, a + 0.4, t) * (1 - smooth(b - 0.3, b, t))), 0);
    const kept = t >= this.kept ? Math.exp(-(t - this.kept) / 0.2) : 0;
    this.pots.forEach((pot, k) => {
      const h = heightAt(k, day);
      const open = t >= this.opens[k] ? easeOutBack(clamp((t - this.opens[k]) / 0.45, 0, 1)) : 0;
      const pour = this.pours[k];
      pot.update({
        t,
        h,
        open,
        seedDrop: (t - (this.seeds[k] - 0.35)) / 0.35,
        ruler: rulerOn * (h > 0.01 || t < SECTIONS.pre ? 1 : 0),
        label: smooth(this.opens[k], this.opens[k] + 0.3, t),
        wet: smooth(pour, pour + 0.4, t) * (1 - 0.6 * smooth(pour + 3, pour + 10, t)),
        bloom: smooth(12.6, 13.6, day),
        groove: groove * (k % 2 ? -1 : 1),
      });
      pot.group.scale.setScalar(1 + kept * 0.06 + (loud ? kick * 0.025 : 0));
    });
    this.updateCan(t);
    this.updateMagnifier(t);

    // Sun motes, chorus petals.
    const clap = timing.onsetPulse(t, 0.3, 0.1);
    const mp = this.motes.geometry.attributes.position;
    this.moteSeed.forEach(([sx, sy, sz, sp], i) => {
      const y = 1.2 + ((((sy * 4 + t * 0.05 * sp) % 4) + 4) % 4);
      mp.setXYZ(i, (sx - 0.5) * 8 + Math.sin(t * 0.4 * sp + i) * 0.2, y, (sz - 0.5) * 3 + 0.5);
    });
    mp.needsUpdate = true;
    this.motes.material.opacity = 0.35 + clap * 0.5;
    const petalsOn = section.startsWith("chorus") ? smooth(SECTIONS[section], SECTIONS[section] + 1.5, t) : section === "outro" ? smooth(this.finale - 1, this.finale + 1, t) : 0;
    this.petals.visible = petalsOn > 0;
    if (petalsOn > 0) {
      const pp = this.petals.geometry.attributes.position;
      this.petalSeed.forEach(([sx, sy, sz, sp], i) => {
        const y = 6.5 - ((((sy * 7 + t * 0.6 * sp) % 7) + 7) % 7);
        pp.setXYZ(i, (sx - 0.5) * 9 + Math.sin(t * 1.3 * sp + i) * 0.4, y, (sz - 0.5) * 4 + 1);
      });
      pp.needsUpdate = true;
      this.petals.material.opacity = petalsOn * 0.85;
    }

    // Camera: wide on the bench, closer while we "observe closely", punch-ins on chorus hops.
    const close = smooth(this.closeWin[0], this.closeWin[0] + 0.8, t) * (1 - smooth(this.closeWin[1] - 0.6, this.closeWin[1], t));
    const v = {};
    for (const key of ["x", "y", "z", "look"]) v[key] = lerp(WIDE[key], CLOSE[key], easeInOut(close));
    const sway = Math.sin(t * 0.31) * 0.25;
    const punch = bug.last?.chorus ? Math.exp(-landed / 0.18) : 0;
    this.camera.position.set(v.x + sway, v.y + Math.sin(t * 0.23) * 0.05, v.z - kick * (loud ? 0.18 : 0.08) - punch * 0.5);
    this.camera.lookAt(v.x + sway * 0.6, v.look, 0);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    this.scene.updateMatrixWorld();
    this.tmp.set(this.camera.position.x, 0, this.camera.position.z - 400).project(this.camera);
    this.bgU.uHorizon.value = this.tmp.y * 0.5 + 0.5;
    this.bgU.uTime.value = t;
    this.bgU.uGlow.value = (loud ? 1 : 0.3) + kick * 0.3;

    this.updateClipboard(t, day);

    const post = { bloom: [loud ? 0.6 : 0.45, 0.4, 0.8], ca: 0.08 + kick * (loud ? 0.22 : 0.1), vignette: 0.32, grain: 0.022, zoom: 1 + punch * 0.025 };
    const start = SECTIONS[section];
    if (start !== undefined && t - start < 0.3) post.flash = Math.exp(-(t - start) / 0.1) * 0.3;
    if (punch > 0) post.flash = Math.max(post.flash || 0, punch * 0.1);
    for (const s of this.stamps) if (t >= s.t0 && t < s.t0 + 0.15) post.flash = Math.max(post.flash || 0, 0.12 * (1 - (t - s.t0) / 0.15));
    this.drawHud(t, section, day, cur, landed, rulerOn);
    return post;
  }

  updateCan(t) {
    const [inT, outT] = this.canOut;
    const rest = { x: -1.9, y: 0.23, z: 0.15, tilt: 0 };
    const over = (k) => ({ x: POT_X[k] - 0.46, y: SOIL_Y + 0.74, z: 0.05, tilt: -1 });
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
    this.can.position.set(pos.x, pos.y, pos.z);
    this.can.rotation.set(0, 0, pos.tilt);
    this.can.scale.setScalar(0.85);
    const dp = this.drops.geometry.attributes.position;
    let on = 0;
    this.pours.forEach((p, k) => {
      for (let j = 0; j < 30; j++) {
        const age = t - p - hash(k * 40 + j) * 0.5;
        const live = age > 0 && t < p + 0.6;
        const fall = age * 2.4;
        dp.setXYZ(k * 30 + j, live ? POT_X[k] + 0.2 + (hash(j * 3.3) - 0.5) * 0.2 : 0, live ? SOIL_Y + 0.5 - fall - age * age * 4 : -99, live ? 0.05 + (hash(j * 5.1) - 0.5) * 0.2 : 0);
      }
      if (t >= p && t < p + 0.6) on = 1;
    });
    dp.needsUpdate = true;
    this.drops.material.opacity = on * 0.9;
  }

  updateMagnifier(t) {
    const keys = this.magKeys;
    const visible = t >= keys[0][0] && t <= keys.at(-1)[0];
    this.glass.visible = visible;
    if (!visible) return;
    let i = 0;
    while (i < keys.length - 2 && keys[i + 1][0] < t) i++;
    const [t0, a] = keys[i];
    const [t1, b] = keys[i + 1];
    const d = Math.min(0.5, t1 - t0);
    const u = easeInOut(clamp((t - (t1 - d)) / d, 0, 1));
    const xAt = (k) => (k < 0 ? -4 : k > 2 ? 4 : POT_X[k]);
    const x = lerp(xAt(a), xAt(b), u);
    const k = clamp(Math.round(x / 1.78) + 1, 0, 2);
    this.glass.position.set(x - 0.15, SOIL_Y + Math.max(0.35, heightAt(k, dayAt(t)) * 0.6), 0.9);
    this.glass.rotation.set(0, 0, Math.sin(t * 2) * 0.08);
    this.glass.scale.setScalar(1.1);
  }

  updateClipboard(t, day) {
    const [a, b] = this.clipWin;
    const k = smooth(a, a + 0.5, t) * (1 - smooth(b - 0.4, b, t));
    this.clip.visible = k > 0.001;
    if (!this.clip.visible) return;
    const e = easeOutCubic(k);
    this.clip.position.set(0.02, lerp(-0.85, 0.07, e), -2.6);
    this.clip.rotation.set(-0.06, 0.04, lerp(-0.35, -0.03, e));
    this.drawClip(t, day);
    this.clipTex.needsUpdate = true;
  }

  drawClip(t, day) {
    const g = this.clipCanvas.getContext("2d");
    g.fillStyle = "#f7f0de";
    g.fillRect(0, 0, CLIP_W, CLIP_H);
    g.strokeStyle = "rgba(80,130,200,0.18)";
    g.lineWidth = 2;
    for (let y = 120; y < CLIP_H; y += 36) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(CLIP_W, y);
      g.stroke();
    }
    const ink = "#24324a";
    const text = (s, x, y, size, color = ink, family = FONT_COND, align = "center", alpha = 1) => {
      g.globalAlpha = alpha;
      g.font = `800 ${size}px ${family}`;
      g.fillStyle = color;
      g.textAlign = align;
      g.textBaseline = "middle";
      g.fillText(s, x, y);
      g.globalAlpha = 1;
    };
    text("BEAN HEIGHT (cm)", 40, 62, 50, ink, FONT_COND, "left");
    text(`DAY ${Math.floor(day)}`, CLIP_W - 40, 64, 30, "#a04030", FONT_MONO, "right");

    const cols = [100, 255, 385, 515];
    const head = ["DAY", "SHADE", "HALF", "FULL"];
    const rowY = (r) => 192 + r * 56;
    const hl = smooth(this.highlight - 0.1, this.highlight + 0.2, t);
    if (hl > 0) {
      g.fillStyle = `rgba(255,220,60,${0.55 * hl})`;
      g.fillRect(cols[3] - 58, rowY(-1) - 26, 116, 56 * 5);
    }
    head.forEach((s, c) => text(s, cols[c], rowY(-1) + 2, 34));
    g.strokeStyle = ink;
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(36, rowY(-1) + 28);
    g.lineTo(CLIP_W - 36, rowY(-1) + 28);
    g.moveTo(170, rowY(-1) - 26);
    g.lineTo(170, rowY(3) + 28);
    g.stroke();
    TABLE_DAYS.forEach((d, r) => {
      const t0 = this.rows[r];
      if (t < t0 - 0.05) return;
      const pop = 1 + 0.5 * Math.exp(-(t - t0) / 0.12);
      const a = smooth(t0 - 0.05, t0 + 0.1, t);
      text(String(d), cols[0], rowY(r), 40, ink, FONT_COND, "center", a);
      POTS.forEach((_, k) => text(String(tableCm(k, d)), cols[k + 1], rowY(r), Math.round(42 * (k === 2 ? 1 + hl * 0.12 : 1) * pop), "#1f3f8a", FONT_COND, "center", a));
    });

    // Bar chart of the day-12 heights.
    const base = 700;
    const top = 470;
    const max = 22;
    g.strokeStyle = ink;
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(80, top - 20);
    g.lineTo(80, base);
    g.lineTo(CLIP_W - 50, base);
    g.stroke();
    const barX = [175, 315, 455];
    POTS.forEach((p, k) => {
      const t0 = this.bars[k];
      const grow = t >= t0 - 0.05 ? easeOutBack(clamp((t - t0 + 0.05) / 0.4, 0, 1)) : 0;
      const v = tableCm(k, 12);
      const hgt = ((base - top) * v * grow) / max;
      g.fillStyle = BAR_COLORS[k];
      g.fillRect(barX[k] - 45, base - hgt, 90, hgt);
      g.strokeStyle = ink;
      g.lineWidth = 3;
      g.strokeRect(barX[k] - 45, base - hgt, 90, hgt);
      text(p.label, barX[k], base + 34, 30, ink);
      if (grow > 0.5) text(String(v), barX[k], base - hgt - 26, 38, ink, FONT_COND, "center", clamp(grow * 2 - 1, 0, 1));
    });
    const tr = smooth(this.trend, this.trend + 0.5, t);
    if (tr > 0) {
      const x0 = barX[0];
      const y0 = base - ((base - top) * tableCm(0, 12)) / max - 60;
      const x1 = lerp(x0, barX[2], tr);
      const y1 = lerp(y0, base - ((base - top) * tableCm(2, 12)) / max - 60, tr);
      g.strokeStyle = "#c0392b";
      g.lineWidth = 7;
      g.setLineDash([16, 12]);
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x1, y1);
      g.stroke();
      g.setLineDash([]);
      const ang = Math.atan2(y1 - y0, x1 - x0);
      g.fillStyle = "#c0392b";
      g.beginPath();
      g.moveTo(x1 + Math.cos(ang) * 18, y1 + Math.sin(ang) * 18);
      g.lineTo(x1 + Math.cos(ang + 2.4) * 22, y1 + Math.sin(ang + 2.4) * 22);
      g.lineTo(x1 + Math.cos(ang - 2.4) * 22, y1 + Math.sin(ang - 2.4) * 22);
      g.fill();
      text("more sun → taller", 150, top - 6, 32, "#c0392b", FONT_COND, "left", smooth(0.6, 1, tr));
    }
  }

  screen(v) {
    this.tmp.copy(v).project(this.camera);
    return [(this.tmp.x * 0.5 + 0.5) * 1080, (-this.tmp.y * 0.5 + 0.5) * 1920];
  }

  drawHud(t, section, day, cur, landed, rulerOn) {
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

    // Title: the current step, or the bridge question while it is being asked, on a dark
    // backing panel sized to the text so it reads against the bright sky.
    const ask = this.asks.find((a) => t >= a.t0 - 0.1 && t < a.t1 - 0.05);
    let title = null;
    if (ask) title = { text: ask.text, size: 84, pop: 1, color: "#ffffff", alpha: smooth(ask.t0 - 0.1, ask.t0 + 0.15, t), tracking: 2 };
    else if (cur >= 0) title = { text: `${cur + 1} · ${STEPS[cur].name}`, size: 92, pop: 1 + 0.2 * Math.exp(-landed / 0.15), color: STEPS[cur].color, alpha: smooth(SECTIONS.verse1, SECTIONS.verse1 + 0.3, t), tracking: 3 };
    const loud = section.startsWith("chorus");
    const subNow = this.subs.find((s) => t >= s.t0 && t < s.t1);
    const subA = subNow && !loud && !ask && !this.clip.visible ? smooth(subNow.t0, subNow.t0 + 0.25, t) * (1 - smooth(subNow.t1 - 0.25, subNow.t1, t)) : 0;
    if (title) {
      const width = (text, size, family, tracking) => {
        hud.font(size, 800, family);
        return g.measureText(text).width + tracking * text.length;
      };
      const w = Math.max(width(title.text, title.size, FONT_COND, title.tracking), subA > 0 ? width(subNow.text, 34, FONT_MONO, 0) * subA : 0) + 84;
      const top = TITLE_Y - 66;
      const h = 132 + 64 * subA;
      g.save();
      g.globalAlpha = 0.72 * title.alpha;
      g.fillStyle = "#07080e";
      g.beginPath();
      g.roundRect(540 - w / 2, top, w, h, 28);
      g.fill();
      g.restore();
      hud.text(title.text, 540, TITLE_Y, { size: Math.round(title.size * title.pop), weight: 800, family: FONT_COND, color: title.color, alpha: title.alpha, glow: 16, tracking: title.tracking });
    }
    if (subA > 0) hud.text(subNow.text, 540, SUB_Y, { size: 34, weight: 700, family: FONT_MONO, color: "#ffffff", alpha: subA });
    if (day > 0 && !this.clip.visible) {
      const a = 0.9 * smooth(DAYS[0][0], DAYS[0][0] + 0.5, t);
      g.save();
      g.globalAlpha = 0.62 * a;
      g.fillStyle = "#07080e";
      g.beginPath();
      g.roundRect(SAFE.left - 14, 478 - 26, 150, 52, 16);
      g.fill();
      g.restore();
      hud.text(`DAY ${Math.floor(day)}`, SAFE.left, 478, { size: 30, weight: 700, family: FONT_MONO, color: "#fff4c8", align: "left", alpha: a });
    }

    for (const s of this.stamps) hud.stamp(s.text, t, s.t0, { x: 540, y: STAMP_Y, size: s.text.length > 3 ? 96 : 150, color: s.color, angle: -0.07, life: s.life });

    if (rulerOn > 0.5 && !this.clip.visible) {
      this.pots.forEach((pot, k) => {
        const h = heightAt(k, day);
        if (h < 0.05) return;
        const [x, y] = this.screen(pot.markWorld(this.markPos));
        hud.text(`${Math.round(h * 10)} cm`, x + 62, y - 6, { size: 30, weight: 800, family: FONT_COND, color: "#ffe36b", alpha: smooth(0.5, 0.9, rulerOn), glow: 10 });
      });
    }
  }
}
