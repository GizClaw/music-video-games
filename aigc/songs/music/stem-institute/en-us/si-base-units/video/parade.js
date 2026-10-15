import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { FONT_COND, FONT_HEAVY, FONT_MONO } from "@gizclaw/mvg-core/hud.js";
import { clamp, easeInOut, easeOutBack, hash, lerp, smooth } from "@gizclaw/mvg-core/timing.js";
import { CALLS, OUTRO, REPORTS, ROLLS, ROWS, SECTIONS, UNITS, VERSE1, VERSE2, VERSE3 } from "./constants.js";
import { Courtyard } from "./courtyard.js";
import { BANNER, Soldier } from "./soldiers.js";

const ROW_Z = -3.8;
const FRONT_Z = 1.2;
const REPORT = { x: -0.3, z: 3.8 };
const MOVE = 0.7;
const rowSlot = (k) => ({ x: (k - 3) * 1.02 - 0.1, z: ROW_Z });
const lineSlot = (i, n) => ({ x: (i - (n - 1) / 2) * (n > 3 ? 1.15 : 1.35), z: FRONT_Z });
const VIEWS = {
  row: { p: [0, 2.6, 22.5], t: [0.1, 1.45, ROW_Z] },
  report: { p: [0, 1.15, 17.3], t: [0, 1.45, REPORT.z] },
  three: { p: [0, 2.1, 16.8], t: [0.1, 1.35, FRONT_Z] },
  line: { p: [0, 3.0, 29.5], t: [0.1, 1.45, FRONT_Z] },
};
const CARD = { quantity: 290, unit: 382, symbol: 520 };
const ROW_Y = 360;

const BAND = /* glsl */ `
  varying vec2 vUv;
  void main() {
    float y = (1.0 - vUv.y) * 1920.0;
    float band = smoothstep(1200.0, 1300.0, y) * (1.0 - smoothstep(1520.0, 1620.0, y));
    float top = smoothstep(180.0, 300.0, y) * (1.0 - smoothstep(560.0, 700.0, y));
    gl_FragColor = vec4(0.0, 0.0, 0.0, band * 0.45 + top * 0.3);
  }`;

export class ParadeScene {
  constructor(ctx) {
    this.ctx = ctx;
    const { timing, renderer } = ctx;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#6a8cb8");
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.35;
    this.camera = new THREE.PerspectiveCamera(30, 9 / 16, 0.1, 200);
    const sun = new THREE.DirectionalLight("#fff0d6", 2.4);
    sun.position.set(8, 12, 9);
    this.scene.add(sun, new THREE.HemisphereLight("#cfe4ff", "#6a5a48", 0.7));
    this.courtyard = new Courtyard(this.scene);
    this.soldiers = UNITS.map((u, k) => {
      const s = new Soldier(u, k);
      this.scene.add(s.group);
      return s;
    });
    const band = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({ transparent: true, depthTest: false, depthWrite: false, vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }", fragmentShader: BAND }),
    );
    band.renderOrder = 10;
    band.frustumCulled = false;
    this.scene.add(band);
    this.buildConfetti();
    this.buildTimeline(timing);
    this.tmp = new THREE.Vector3();
  }

  buildConfetti() {
    const n = 420;
    this.confSeed = Array.from({ length: n }, (_, i) => [hash(i * 1.7) * 14 - 7, hash(i * 2.3), hash(i * 3.9) * 8 - 4, 0.5 + hash(i * 5.1)]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const col = new Float32Array(n * 3);
    const pal = UNITS.map((u) => new THREE.Color(u.color));
    for (let i = 0; i < n; i++) col.set(pal[i % pal.length].toArray(), i * 3);
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    this.confetti = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.2, vertexColors: true, transparent: true, opacity: 0, depthWrite: false }));
    this.confetti.frustumCulled = false;
    this.scene.add(this.confetti);
  }

  buildTimeline(timing) {
    const cue = (i) => timing.cues[i];
    const w = (ci, word, n = 0) => timing.wordTime(ci, word, n) ?? cue(ci).start;
    const unitWord = (x) => UNITS.findIndex((u) => x.startsWith(u.name));

    this.reports = REPORTS.map(([ci, si], k) => {
      const words = cue(si).words;
      const at = words.findIndex((x) => x.clean === "symbol");
      return { k, tq: cue(ci).start, tu: w(ci, UNITS[k].name), letters: words.slice(at + 1, at + 1 + UNITS[k].symbol.replace(/\s/g, "").length).map((x) => x.start) };
    });
    // Every moment a unit is called: its report words, the verses' uses and the roll calls.
    this.calls = UNITS.map(() => []);
    for (const r of this.reports) this.calls[r.k].push(r.tq, r.tu, ...r.letters);
    for (const ci of [...VERSE1.measures, ...VERSE2.uses, ...VERSE3.roll, ...ROLLS]) {
      for (const x of cue(ci).words) {
        const k = unitWord(x.clean);
        if (k >= 0) this.calls[k].push(x.start);
      }
    }
    this.rowCalls = ROWS.map((ci) => {
      const c = cue(ci);
      return { t0: c.start, t1: c.words.at(-1).start };
    });
    for (const rc of this.rowCalls) UNITS.forEach((_, k) => this.calls[k].push(lerp(rc.t0, rc.t1, k / 6)));
    this.calls.forEach((list) => list.sort((a, b) => a - b));

    this.chants = CALLS.map((ci) => {
      const ws = cue(ci).words;
      return { t: ws.map((x) => x.start), last: ws[3].clean, end: cue(ci).end };
    });
    this.heys = ROLLS.flatMap((ci) => cue(ci).words.filter((x) => x.clean === "hey").map((x) => x.start));
    this.capitals = w(VERSE2.capitals, "capitals");
    this.checks = cue(OUTRO.checked);

    // Formation: where each soldier stands, as moves that start at t.
    const moves = UNITS.map((_, k) => [{ t: -1, ...rowSlot(k) }]);
    const go = (k, t, slot) => moves[k].push({ t, ...slot });
    const line = (ks, t) => ks.forEach((k, i) => go(k, t, lineSlot(i, ks.length)));
    this.reports.forEach((r, i) => {
      go(r.k, r.tq - 0.6, REPORT);
      const next = this.reports[i + 1];
      if (next && next.tq - r.tq < 6) go(r.k, next.tq - 0.6, rowSlot(r.k));
    });
    const three = cue(VERSE1.three).start - 0.4;
    line([0, 1, 2], three);
    for (const k of [0, 1, 2]) go(k, cue(VERSE1.march).end + 0.2, rowSlot(k));
    go(5, cue(VERSE2.capitals).start - 0.4, rowSlot(5));
    line([3, 4, 5], cue(VERSE2.uses[0]).start - 0.4);
    line([0, 1, 2, 3, 4, 5], cue(VERSE2.six).start - 0.4);
    for (let k = 0; k < 6; k++) go(k, SECTIONS.chorus2 - 0.3, rowSlot(k));
    line([0, 1, 2, 3, 4, 5, 6], cue(VERSE3.last).start - 0.4);
    moves.forEach((list) => list.sort((a, b) => a.t - b.t));
    this.moves = moves;

    // Roll calls: the camera tracks along the line to each unit as it is named.
    const track = (ci, ks) => ({ t0: cue(ci).start - 0.2, t1: cue(ci).end + 0.2, at: ks.map((k) => [cue(ci).words.find((x) => unitWord(x.clean) === k)?.start ?? cue(ci).start, k]) });
    this.tracks = [
      ...ROWS.map((ci, i) => ({ t0: this.rowCalls[i].t0 - 0.2, t1: this.rowCalls[i].t1 + 0.5, at: UNITS.map((_, k) => [lerp(this.rowCalls[i].t0, this.rowCalls[i].t1, k / 6), k]) })),
      track(ROLLS[0], [0, 1, 2]),
      track(ROLLS[1], [3, 4, 5]),
      track(VERSE3.roll[0], [0, 1, 2]),
      track(VERSE3.roll[1], [3, 4, 5]),
      track(VERSE3.roll[2], [6]),
      track(ROLLS[2], [0, 1, 2]),
      track(ROLLS[3], [3, 4, 5, 6]),
    ];

    const views = [{ t: SECTIONS.verse1, v: VIEWS.row, dur: 0.01 }];
    for (const r of this.reports) views.push({ t: r.tq - 0.6, v: VIEWS.report, dur: 0.8 });
    views.push({ t: three, v: VIEWS.three, dur: 0.8 }, { t: cue(VERSE1.march).end + 0.2, v: VIEWS.row, dur: 1.0 });
    views.push({ t: cue(VERSE2.capitals).start - 0.4, v: VIEWS.row, dur: 0.8 }, { t: cue(VERSE2.uses[0]).start - 0.4, v: VIEWS.three, dur: 0.8 }, { t: cue(VERSE2.six).start - 0.4, v: VIEWS.line, dur: 0.9 });
    views.push({ t: SECTIONS.chorus2 - 0.3, v: VIEWS.row, dur: 0.9 }, { t: cue(VERSE3.last).start - 0.4, v: VIEWS.line, dur: 1.0 });
    views.sort((a, b) => a.t - b.t);
    views.forEach((k, i) => (k.from = i ? this.viewSeg(views[i - 1], k.t) : k.v));
    this.views = views;

    // HUD rows of symbols: which units, when each pops, and from when to when.
    const rowOf = (ks, t0, t1, pops) => ({ ks, t0, t1, pops: pops ?? ks.map((_, i) => t0 + i * 0.12) });
    const say = (ci, ks) => ks.map((k) => cue(ci).words.find((x) => unitWord(x.clean) === k)?.start ?? cue(ci).start);
    this.rows = [
      rowOf([0, 1, 2], cue(VERSE1.three).start, cue(VERSE1.march).end + 0.3),
      rowOf([0, 1, 2, 3, 4, 5], cue(VERSE2.capitals).start, cue(VERSE2.capitals).end + 0.3),
      rowOf([3, 4, 5], cue(VERSE2.uses[0]).start, cue(VERSE2.six).start - 0.1, VERSE2.uses.map((ci, i) => say(ci, [3 + i])[0])),
      rowOf([0, 1, 2, 3, 4, 5], cue(VERSE2.six).start, SECTIONS.chorus2 - 0.2),
      ...ROWS.map((ci, i) => rowOf([0, 1, 2, 3, 4, 5, 6], cue(ci).start, cue(ci).end, UNITS.map((_, k) => lerp(this.rowCalls[i].t0, this.rowCalls[i].t1, k / 6)))),
      rowOf([0, 1, 2], cue(ROLLS[0]).start, cue(ROLLS[0]).end, say(ROLLS[0], [0, 1, 2])),
      rowOf([3, 4, 5], cue(ROLLS[1]).start, cue(ROLLS[1]).end, say(ROLLS[1], [3, 4, 5])),
      rowOf([0, 1, 2, 3, 4, 5, 6], cue(VERSE3.last).start, SECTIONS.chorus3 - 0.2, [...say(VERSE3.roll[0], [0, 1, 2]), ...say(VERSE3.roll[1], [3, 4, 5]), ...say(VERSE3.roll[2], [6])]),
      rowOf([0, 1, 2, 3, 4, 5, 6], cue(ROLLS[2]).start, cue(ROLLS[3]).end, [...say(ROLLS[2], [0, 1, 2]), ...say(ROLLS[3], [3, 4, 5, 6])]),
      rowOf([0, 1, 2, 3, 4, 5, 6], SECTIONS.outro, SECTIONS.end, UNITS.map((_, k) => SECTIONS.outro + k * 0.1)),
    ];
  }

  viewSeg(k, t) {
    const u = easeInOut((t - k.t) / k.dur);
    return { p: k.from.p.map((a, i) => lerp(a, k.v.p[i], u)), t: k.from.t.map((a, i) => lerp(a, k.v.t[i], u)) };
  }

  viewAt(t) {
    let i = 0;
    for (let k = 0; k < this.views.length && this.views[k].t <= t; k++) i = k;
    return this.viewSeg(this.views[i], t);
  }

  /** Position of soldier k and whether it is marching between slots. */
  place(k, t) {
    const list = this.moves[k];
    let i = 0;
    for (let j = 0; j < list.length && list[j].t <= t; j++) i = j;
    const to = list[i];
    const from = i ? list[i - 1] : to;
    const u = easeInOut((t - to.t) / MOVE);
    return { x: lerp(from.x, to.x, u), z: lerp(from.z, to.z, u), moving: t >= to.t && t < to.t + MOVE ? 1 : 0 };
  }

  since(list, t) {
    let s = -1;
    for (const e of list) if (e <= t) s = t - e;
    return s;
  }

  update(t, section) {
    const { timing } = this.ctx;
    const kick = timing.pulse(t, 0.12);
    const bf = timing.beatFloat(t);
    const chorus = section.startsWith("chorus");
    const chantGo = this.chants.reduce((m, c) => Math.max(m, c.last === "go" && t >= c.t[3] ? 1 - smooth(c.end + 0.4, c.end + 0.8, t) : 0), 0);
    const march = timing.cues[VERSE1.march];
    const marking = section === "outro" || (t >= march.start && t < march.end + 0.4) ? 1 : 0;
    const chant = this.chants.reduce((m, c) => Math.max(m, ...c.t.map((e) => (t >= e ? Math.exp(-(t - e) / 0.12) : 0))), 0);

    this.soldiers.forEach((s, k) => {
      const at = this.place(k, t);
      s.group.position.set(at.x, 0, at.z);
      s.group.rotation.y = Math.sin(t * 0.7 + k) * 0.06;
      const since = this.since(this.calls[k], t);
      const hopT = since >= 0 && since < 0.36 ? Math.sin((since / 0.36) * Math.PI) * 0.22 : 0;
      const rep = this.reports[k];
      const salute = smooth(rep.tq + 0.1, rep.tq + 0.35, t) * (1 - smooth(rep.tu + 1.2, rep.tu + 1.6, t));
      const outroSalute = smooth(timing.cues[OUTRO.zone].start, timing.cues[OUTRO.zone].start + 0.4, t);
      const named = t >= rep.tq;
      const flash = since >= 0 ? Math.exp(-since / 0.35) : 0;
      s.pose(t, {
        beat: bf,
        march: Math.max(at.moving, chantGo, marking),
        hop: hopT + chant * 0.04,
        salute: Math.max(salute, outroSalute),
        lit: (named ? 0.35 : 0) + flash * 0.65,
        named,
        shown: easeOutBack(clamp((t - rep.tu + 0.05) / 0.35, 0, 1)),
      });
      s.demo.update(t, bf, since);
    });
    this.courtyard.update(t);
    const cp = this.confetti.geometry.attributes.position;
    this.confSeed.forEach(([x, y0, z, sp], i) => cp.setXYZ(i, x + Math.sin(t * 1.3 + i) * 0.2, 7 - ((((y0 * 9 + t * sp * 1.6) % 9) + 9) % 9), z));
    cp.needsUpdate = true;
    this.confetti.material.opacity = smooth(this.checks.start - 0.2, this.checks.start + 0.3, t) * 0.9;

    const view = this.viewAt(t);
    const p = new THREE.Vector3(...view.p);
    const target = new THREE.Vector3(...view.t);
    const tr = this.tracks.find((x) => t >= x.t0 - 0.3 && t < x.t1 + 0.4);
    if (tr) {
      const a = smooth(tr.t0 - 0.3, tr.t0, t) * (1 - smooth(tr.t1, tr.t1 + 0.4, t));
      let i = 0;
      for (let j = 0; j < tr.at.length && tr.at[j][0] <= t; j++) i = j;
      const [t0, k0] = tr.at[i];
      const [t1, k1] = tr.at[Math.min(i + 1, tr.at.length - 1)];
      const x0 = this.place(k0, t).x;
      const x1 = this.place(k1, t).x;
      const x = lerp(x0, x1, t1 > t0 ? easeInOut((t - t0) / (t1 - t0)) : 0) + 0.25;
      const z = this.place(k0, t).z;
      p.lerp(new THREE.Vector3(x, 1.7, z + 13.5), a);
      target.lerp(new THREE.Vector3(x, 1.4, z), a);
    }
    p.sub(target).multiplyScalar(1 - kick * (chorus ? 0.015 : 0.008) - chant * 0.02).add(target);
    p.x += Math.sin(t * 0.3) * 0.4;
    p.y += Math.cos(t * 0.23) * 0.12;
    this.camera.position.copy(p);
    this.camera.lookAt(target);
    this.camera.updateMatrixWorld();
    this.scene.updateMatrixWorld();

    const post = { bloom: [chorus ? 0.6 : 0.45, 0.4, 0.72], ca: 0.08 + kick * (chorus ? 0.3 : 0.15), vignette: 0.4, grain: 0.025 };
    const start = SECTIONS[section];
    if (start !== undefined && t - start < 0.3) post.flash = Math.exp(-(t - start) / 0.1) * 0.35;
    for (const h of this.heys) if (t >= h && t < h + 0.2) post.flash = Math.max(post.flash ?? 0, 0.3 * (1 - (t - h) / 0.2));
    if (chant > 0.5) post.shock = [0.5, 0.75, (1 - chant) * 0.6, 0.5];
    this.drawHud(t, section);
    return post;
  }

  screen(v) {
    this.tmp.copy(v).project(this.camera);
    return [(this.tmp.x * 0.5 + 0.5) * 1080, (-this.tmp.y * 0.5 + 0.5) * 1920];
  }

  /** Banners carry symbols; keep the lyric band clear of them. */
  keepBanners() {
    const { hud } = this.ctx;
    for (const s of this.soldiers) {
      const xs = [];
      const ys = [];
      for (const [dx, dy] of [[0, -0.5], [1, -0.5], [0, 0.5], [1, 0.5]]) {
        const [x, y] = this.screen(this.tmp.set(BANNER.x + dx * BANNER.w, BANNER.y + dy * BANNER.h, 0.12).applyMatrix4(s.body.matrixWorld));
        xs.push(x);
        ys.push(y);
      }
      hud.keepout(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys));
    }
  }

  drawHud(t, section) {
    const { hud } = this.ctx;
    this.keepBanners();

    // The report card: quantity, unit, then the symbol spelled as it is sung.
    const live = this.reports.findLast((r) => t >= r.tq - 0.1);
    const card = live && t < this.cardEnd(live);
    if (card) {
      const u = UNITS[live.k];
      const end = this.cardEnd(live);
      const a = smooth(live.tq - 0.1, live.tq + 0.1, t) * (1 - smooth(end - 0.25, end, t));
      const qPop = Math.exp(-Math.max(0, t - live.tq) / 0.25);
      hud.text(u.quantity, 540, CARD.quantity, { size: Math.round((u.quantity.length > 16 ? 52 : 64) * (1 + qPop * 0.12)), weight: 800, family: FONT_COND, color: "#ffffff", alpha: a, glow: 14, tracking: 3 });
      const ua = a * smooth(live.tu - 0.05, live.tu + 0.1, t);
      const uPop = t >= live.tu ? Math.exp(-(t - live.tu) / 0.25) : 0;
      hud.text(u.name, 540, CARD.unit, { size: Math.round(84 * (1 + uPop * 0.15)), weight: 800, family: FONT_COND, color: u.color, alpha: ua, glow: 18 });
      const letters = u.symbol.split("");
      const shown = letters.filter((_, i) => t >= (live.letters[i] ?? live.tu) - 0.04).join("");
      if (shown) {
        const lastT = live.letters[shown.length - 1] ?? live.tu;
        const pop = Math.exp(-Math.max(0, t - lastT) / 0.2);
        hud.text(shown, 540, CARD.symbol, { size: Math.round(180 * (1 + pop * 0.15)), weight: 800, family: FONT_HEAVY, color: u.color, alpha: a, glow: 30 + pop * 30 });
      }
    }

    // Chorus chant: NAME! UNIT! SYMBOL! across the top, then GO! or SI!
    for (const c of this.chants) {
      if (t < c.t[0] - 0.05 || t > c.end + 0.4) continue;
      const a = 1 - smooth(c.end + 0.1, c.end + 0.4, t);
      ["NAME!", "UNIT!", "SYMBOL!"].forEach((word, i) => {
        const e = c.t[i];
        const k = clamp((t - e) / 0.18, 0, 1);
        if (k <= 0) return;
        hud.text(word, [215, 505, 820][i], 330, { size: Math.round(88 * (0.6 + 0.4 * easeOutBack(k)) * (1 + Math.exp(-(t - e) / 0.15) * 0.15)), weight: 800, family: FONT_COND, color: ["#ffffff", "#ffd23f", "#3dc2ff"][i], alpha: a, glow: 20 });
      });
      hud.stamp(c.last === "si" ? "SI!" : "GO!", t, c.t[3], { x: 540, y: 560, size: 150, color: c.last === "si" ? "#ffd23f" : "#7cff6b", angle: -0.08, life: Math.min(1.0, c.end + 0.4 - c.t[3]) });
    }
    for (const h of this.heys) hud.stamp("HEY!", t, h, { x: 540, y: 515, size: 100, color: "#ff5d8f", angle: 0.08, life: 0.5 });

    // Rows of symbols.
    for (const row of this.rows) {
      if (t < row.t0 - 0.2 || t > row.t1 + 0.2) continue;
      if (card && row.t0 < this.cardEnd(live) - 0.2 && t < this.cardEnd(live)) continue;
      const a = smooth(row.t0 - 0.2, row.t0, t) * (1 - smooth(row.t1 - 0.1, row.t1 + 0.2, t));
      const n = row.ks.length;
      const gap = n > 6 ? 136 : n > 3 ? 150 : 230;
      row.ks.forEach((k, i) => {
        const u = UNITS[k];
        const x = 540 + (i - (n - 1) / 2) * gap;
        const known = t >= this.reports[k].tq;
        const pt = row.pops[i];
        const pop = t >= pt ? Math.exp(-(t - pt) / 0.25) : 0;
        const on = smooth(pt - 0.05, pt + 0.1, t);
        const capital = /[A-Z]/.test(u.symbol) && t >= this.capitals && row.t0 <= this.capitals && row.t1 >= this.capitals;
        const size = (n > 6 ? 62 : n > 3 ? 72 : 110) * (1 + pop * 0.3);
        hud.text(known ? u.symbol : "?", x, ROW_Y, { size: Math.round(size), weight: 800, family: FONT_HEAVY, color: known ? u.color : "#8a90a0", alpha: a * (0.45 + 0.55 * on), glow: 10 + pop * 30 + (capital ? 20 : 0) });
        if (capital) {
          const ca = a * smooth(this.capitals, this.capitals + 0.2, t);
          hud.ctx.save();
          hud.ctx.globalAlpha = ca;
          hud.ctx.fillStyle = "#ffd23f";
          hud.ctx.shadowColor = "#ffd23f";
          hud.ctx.shadowBlur = 14;
          hud.ctx.fillRect(x - 34, ROW_Y + 46, 68, 6);
          hud.ctx.restore();
          hud.text("CAPITAL", x, ROW_Y + 74, { size: 18, weight: 700, family: FONT_MONO, color: "#ffd23f", alpha: ca, tracking: 2 });
        }
        else if (known) hud.text(u.name, x, ROW_Y + 66, { size: n > 3 ? 18 : 26, weight: 700, family: FONT_MONO, color: u.color, alpha: a * 0.85 * (0.4 + 0.6 * on) });
        if (section === "outro") {
          const ct = lerp(this.checks.start, this.checks.words.at(-1).start, k / 6);
          hud.text("✓", x, ROW_Y + 120, { size: 52, weight: 800, family: FONT_COND, color: "#7cff6b", alpha: a * smooth(ct - 0.05, ct + 0.1, t), glow: 16 });
        }
      });
    }
  }

  /** The card holds while its soldier stands at the report spot. */
  cardEnd(r) {
    const next = this.moves[r.k].find((m) => m.t > r.tq);
    return next ? next.t + 0.2 : r.tq + 6;
  }
}
