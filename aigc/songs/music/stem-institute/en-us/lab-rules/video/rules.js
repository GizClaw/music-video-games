import * as THREE from "three";
import { BRAND, clamp, easeInOut, easeOutBack, easeOutCubic, hash, lerp, smooth } from "@gizclaw/mvg-core/timing.js";
import { FONT_COND, FONT_MONO } from "@gizclaw/mvg-core/hud.js";
import { Bench, CLOCK, FRONT, RISER } from "./bench.js";
import { PROPS } from "./props.js";
import { ACCENT, BRIDGE, CHORUSES, NO, OK, OUTRO, PROTECTS, RULES, SECTIONS } from "./constants.js";

// The camera looks down onto the bench so that its front edge lands on screen
// row ~1234, above the lyric band; a prop's big moment floats at HERO, around
// row 760, between the checklist and the riser shelf.
const CAM = new THREE.Vector3(0, 9, 46);
const LOOK = new THREE.Vector3(0, 3.6, 0);
const HERO = new THREE.Vector3(-0.35, 4.9, 3);
const HERO_S = 2.0;
const SLOT_S = 0.5;
const TITLE_Y = 372;
const LIST_Y = 470;
const decay = (t, t0, tau) => (t >= t0 ? Math.exp(-(t - t0) / tau) : 0);

/** Bench slots: verse one's nine on the riser shelf, verse two's eight on the bench top. */
function slotOf(i) {
  if (i < 9) return new THREE.Vector3(-6.0 + i * 1.5 - 0.35, RISER.y, RISER.z);
  return new THREE.Vector3(-5.6 + (i - 9) * 1.6 - 0.35, FRONT.y, FRONT.z);
}

export class RulesScene {
  constructor(ctx) {
    this.ctx = ctx;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(34, 9 / 16, 0.5, 300);
    this.scene.add(new THREE.AmbientLight("#b0b8d0", 1.1));
    const key = new THREE.DirectionalLight("#fff4e0", 2.1);
    key.position.set(3, 14, 12);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight("#9fc4ff", 0.6);
    fill.position.set(-8, 4, 6);
    this.scene.add(fill);
    this.bench = new Bench(this.scene);

    this.props = RULES.map((r, i) => {
      const { group, tick } = PROPS[r.prop]();
      const holder = new THREE.Group();
      holder.add(group);
      this.scene.add(holder);
      const coaster = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.05, 32), new THREE.MeshBasicMaterial({ color: r.ok ? OK : NO }));
      coaster.position.copy(slotOf(i)).add(new THREE.Vector3(0, 0.03, 0));
      this.scene.add(coaster);
      return { ...r, i, group, tick, holder, coaster, slot: slotOf(i), heroes: [] };
    });
    this.byProp = Object.fromEntries(this.props.map((p) => [p.prop, p]));
    this.buildConfetti();
    this.buildTimeline(ctx.timing);
    this.tmp = new THREE.Vector3();
  }

  buildConfetti() {
    const n = 300;
    this.confSeed = Array.from({ length: n }, (_, i) => [hash(i * 1.7) * 26 - 13, hash(i * 2.3), hash(i * 3.9) * 6, 0.5 + hash(i * 5.1) * 0.8]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const col = new Float32Array(n * 3);
    const pal = [OK, NO, ACCENT, "#3dc2ff", "#ff5dc8"].map((c) => new THREE.Color(c));
    for (let i = 0; i < n; i++) col.set(pal[i % pal.length].toArray(), i * 3);
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    this.confetti = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.3, vertexColors: true, transparent: true, opacity: 0, depthWrite: false }));
    this.scene.add(this.confetti);
  }

  buildTimeline(timing) {
    const cue = (i) => timing.cues[i];
    const w = (ci, word, n = 0) => timing.wordTime(ci, word, n) ?? cue(ci).start;
    const all = (ci, word) => cue(ci).words.filter((x) => x.clean === word).map((x) => x.start);
    const hero = (prop, t0, t1) => this.byProp[prop].heroes.push([t0, t1]);
    this.stamps = [];
    const stamp = (t, ok, text = ok ? "✓" : "✗", dx = 0, life = 0.85) => this.stamps.push({ t, ok, text, dx, life });

    this.titles = [];
    for (const p of this.props) {
      const [word, nth] = Array.isArray(p.stamp) ? p.stamp : [p.stamp, 0];
      p.t0 = cue(p.cue).start - 0.08;
      p.t1 = cue(p.cue + 1).start - 0.05;
      p.stampT = w(p.cue, word, nth);
      hero(p.prop, p.t0, p.t1);
      stamp(p.stampT, p.ok);
      this.titles.push({ t0: p.t0, t1: p.t1, kicker: `RULE ${p.i + 1}`, text: p.title, color: p.ok ? OK : NO });
    }
    this.protects = { t0: cue(PROTECTS).start, word: w(PROTECTS, "protects") };
    this.titles.push({ t0: this.protects.t0, t1: SECTIONS.chorus1, kicker: "ALL RULES", text: "CAREFUL SCIENCE!", color: ACCENT });

    this.choruses = CHORUSES.map((c) => {
      const ch = {
        t0: cue(c).start - 0.3,
        t1: cue(c + 5).end + 0.3,
        checks: [...all(c, "check"), ...all(c + 4, "check")],
        rock: w(c, "rock"),
        clock: w(c + 1, "clock"),
        sound: w(c + 4, "sound"),
        look: [w(c + 5, "look"), cue(c + 5).end + 0.4],
      };
      hero("goggles", w(c + 1, "goggles") - 0.1, ch.clock - 0.05);
      hero("mouth", w(c + 2, "taste") - 0.1, w(c + 2, "do", 1) - 0.05);
      hero("fumes", w(c + 2, "do", 1) - 0.05, cue(c + 3).start - 0.1);
      hero("hand", cue(c + 3).start - 0.1, cue(c + 3).end);
      stamp(w(c + 2, "taste"), false);
      stamp(w(c + 2, "smell"), false);
      ch.checks.forEach((x, k) => stamp(x, true, "✓", k % 2 ? 1 : -1));
      this.titles.push({ t0: ch.t0, t1: ch.t1, kicker: "CHORUS", text: "LAB RULES ROCK!", color: ACCENT, chorus: true });
      return ch;
    });

    for (const b of BRIDGE) {
      const t0 = cue(b.cue).start - 0.08;
      const t1 = b === BRIDGE.at(-1) ? cue(b.cue).end + 0.1 : cue(b.cue + 1).start - 0.1;
      const a = w(b.cue, b.word);
      hero(b.prop, t0, t1);
      stamp(a, b.ok, b.a, 0, t1 - a);
      this.titles.push({ t0, t1, kicker: "TEAM CHECK", text: b.q, color: "#ffffff", card: true });
    }

    const o = OUTRO.start;
    this.outro = { read: w(o, "read"), ask: w(o, "ask"), check: w(o, "check"), start: w(o, "start"), rock: w(OUTRO.rock, "rock"), smart: w(OUTRO.rock, "smart") };
    hero("steps", this.outro.read - 0.1, this.outro.ask - 0.08);
    hero("hand", this.outro.ask - 0.08, this.outro.check + 0.4);
    stamp(this.outro.check, true);
    this.titles.push({ t0: cue(o).start - 0.1, t1: cue(OUTRO.rock).start - 0.1, kicker: "BEFORE YOU START", text: "READ · ASK · CHECK", color: OK });
    this.titles.push({ t0: cue(OUTRO.rock).start - 0.1, t1: SECTIONS.end, kicker: "STEM INSTITUTE  ·  No. 24", text: "LAB RULES ROCK!", color: ACCENT, chorus: true });
    this.titles.push({ t0: SECTIONS.warmup + 0.2, t1: this.props[0].t0, kicker: "STEM INSTITUTE  ·  No. 24", text: "LAB RULES ROCK!", color: ACCENT, chorus: true });
    for (const p of this.props) p.heroes.sort((a, b) => a[0] - b[0]);
    this.stamps.sort((a, b) => a.t - b.t);
  }

  /** Holder transform for a prop: popping in, starring at HERO, flying to its slot. */
  place(p, t, bf, bounce) {
    const { holder } = p;
    let k = -1;
    p.heroes.forEach(([t0], i) => {
      if (t0 <= t) k = i;
    });
    if (k < 0) {
      holder.visible = false;
      return 0;
    }
    holder.visible = true;
    const [t0, t1] = p.heroes[k];
    const pos = holder.position;
    let s;
    let star = 0;
    if (t < t1) {
      const u = clamp((t - t0) / 0.35, 0, 1);
      if (k === 0) {
        pos.copy(HERO);
        s = HERO_S * easeOutBack(u);
      } else {
        pos.lerpVectors(p.slot, HERO, easeOutCubic(u));
        pos.y += Math.sin(u * Math.PI) * 1.2;
        s = lerp(SLOT_S, HERO_S, easeOutCubic(u));
      }
      star = u;
      pos.y += this.ctx.timing.pulse(t, 0.2) * 0.15;
      holder.rotation.set(0.12, Math.sin(t * 0.9) * 0.45, 0);
    } else {
      const u = clamp((t - t1) / 0.5, 0, 1);
      pos.lerpVectors(HERO, p.slot, easeInOut(u));
      pos.y += Math.sin(u * Math.PI) * 1.5;
      s = lerp(HERO_S, SLOT_S, easeInOut(u));
      star = 1 - u;
      holder.rotation.set(0.12 * (1 - u), Math.sin(t * 0.9) * 0.45 * (1 - u), 0);
      pos.y += Math.abs(Math.sin(bf * Math.PI)) * 0.35 * bounce * u;
    }
    holder.scale.setScalar(Math.max(0.001, s));
    return star;
  }

  update(t, section) {
    const { timing } = this.ctx;
    const kick = timing.pulse(t, 0.12);
    const clap = timing.env("snare", t, 0.08);
    const bf = timing.beatFloat(t);
    const chorus = section.startsWith("chorus") ? 1 : 0;
    const ch = this.choruses.find((c) => t >= c.t0 && t < c.t1);
    const o = this.outro;
    const rock = Math.max(decay(t, o.rock, 0.5), ...this.choruses.map((c) => decay(t, c.rock, 0.4)));
    const bounce = Math.max(chorus, smooth(o.rock - 0.2, o.rock, t));

    for (const p of this.props) {
      const star = this.place(p, t, bf, bounce);
      const act = p.t0 <= t ? clamp((t - p.t0) / Math.max(0.2, p.stampT - p.t0), 0, 1) : 0;
      p.tick?.(t, act);
      const wave = decay(t, this.protects.word + p.i * 0.05, 0.25) + decay(t, o.start + p.i * 0.04, 0.25);
      p.holder.position.y += (wave + rock) * 0.6 * (1 - star);
      const lit = smooth(p.stampT, p.stampT + 0.4, t);
      const flash = Math.max(decay(t, p.stampT + 0.3, 0.3), decay(t, o.smart, 0.4), ch ? decay(t, ch.sound, 0.3) : 0);
      const chase = section === "warmup" && timing.beatIndexAt(t) % this.props.length === p.i ? kick * 0.4 : 0;
      p.coaster.material.color.set(p.ok ? OK : NO).multiplyScalar(0.06 + chase + lit * (0.3 + flash * 0.5));
    }

    const cp = this.confetti.geometry.attributes.position;
    this.confSeed.forEach(([x, y0, zz, sp], i) => cp.setXYZ(i, x + Math.sin(t + i) * 0.3, 19 - ((((y0 * 22 + t * sp * 5) % 22) + 22) % 22), zz - 1));
    cp.needsUpdate = true;
    this.confetti.material.opacity = Math.max(rock * 0.9, smooth(o.rock, o.rock + 0.4, t) * 0.8, chorus * 0.3);

    const clockPop = ch ? decay(t, ch.clock, 0.35) : 0;
    const spin = this.choruses.reduce((a, c) => a + easeOutCubic(clamp((t - c.clock) / 0.8, 0, 1)), 0);
    this.bench.update(t, bf, 1 + chorus * 0.12 * timing.pulse(t, 0.25) + rock * 0.2, spin, clockPop);
    this.bench.wallU.uFlash.value = rock;
    this.bench.wallU.uHue.value.set(ACCENT);

    // Camera: drift, a punch-in on every stamp, chorus bounce, a pan for "look around".
    let punch = 0;
    for (const s of this.stamps) punch = Math.max(punch, decay(t, s.t, 0.25));
    let pan = 0;
    if (ch) pan = Math.sin(clamp((t - ch.look[0]) / (ch.look[1] - ch.look[0]), 0, 1) * Math.PI * 2) * 4.5;
    this.camera.position.set(CAM.x + Math.sin(t * 0.3) * 0.7 + pan, CAM.y + Math.cos(t * 0.25) * 0.3 + Math.abs(Math.sin(bf * Math.PI)) * 0.35 * bounce, CAM.z - punch * 1.4 - chorus * 1.5 + clap * 0.2 + 3.5 * (1 - easeInOut((t - SECTIONS.warmup) / (SECTIONS.verse1 - SECTIONS.warmup))));
    this.camera.lookAt(LOOK.x + pan * 0.35, LOOK.y, LOOK.z);
    this.camera.rotation.z += Math.sin(bf * Math.PI) * 0.006 * bounce;
    this.camera.updateMatrixWorld();
    this.scene.updateMatrixWorld();

    const post = { bloom: [0.55 + chorus * 0.15, 0.4, 0.72], ca: 0.1 + kick * 0.15, vignette: 0.42, grain: 0.022, flash: rock * 0.15 };
    const start = SECTIONS[section];
    if (start !== undefined && t - start < 0.3) post.flash = Math.max(post.flash, Math.exp(-(t - start) / 0.1) * 0.35);
    this.drawHud(t, ch, clap);
    return post;
  }

  screen(v) {
    this.tmp.copy(v).project(this.camera);
    return [(this.tmp.x * 0.5 + 0.5) * 1080, (-this.tmp.y * 0.5 + 0.5) * 1920];
  }

  drawHud(t, ch, clap) {
    const { hud } = this.ctx;
    const ctx = hud.ctx;
    const [hx, hy] = this.screen(HERO.clone().add(new THREE.Vector3(0, 2, 0)));

    // Rule title, chorus banner or bridge question.
    const title = this.titles.find((x) => t >= x.t0 && t < x.t1);
    if (title) {
      const k = smooth(title.t0, title.t0 + 0.25, t) * (1 - smooth(title.t1 - 0.2, title.t1, t));
      const slide = (1 - easeOutCubic((t - title.t0) / 0.35)) * 40;
      const beat = title.chorus ? 1 + this.ctx.timing.pulse(t, 0.15) * 0.05 + clap * 0.03 : 1;
      if (title.card) {
        ctx.save();
        ctx.globalAlpha = k;
        ctx.fillStyle = "rgba(10,16,30,0.82)";
        ctx.strokeStyle = BRAND;
        ctx.lineWidth = 5;
        ctx.shadowColor = BRAND;
        ctx.shadowBlur = 20;
        ctx.beginPath();
        ctx.roundRect(110, TITLE_Y - 110, 810, 170, 30);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
      hud.text(title.kicker, 515, TITLE_Y - 68 + slide * 0.5, { size: 26, weight: 600, family: FONT_MONO, color: BRAND, alpha: k, tracking: 4, glow: 10 });
      hud.font(84, 800, FONT_COND);
      const fit = Math.min(84, Math.floor((84 * 820) / ctx.measureText(title.text).width));
      ctx.save();
      ctx.translate(515, TITLE_Y + slide);
      ctx.scale(beat, beat);
      hud.text(title.text, 0, 0, { size: fit, weight: 800, family: FONT_COND, color: title.color, alpha: k, glow: 18 });
      ctx.restore();
      hud.keepout(515 - 420, TITLE_Y - 55, 515 + 420, TITLE_Y + 55);
    }

    // The checklist: one box per rule, filled with its verdict when stamped.
    const n = this.props.length;
    const pitch = 50;
    const x0 = 515 - ((n - 1) * pitch) / 2;
    const appear = (i) => smooth(SECTIONS.warmup + 0.5 + i * 0.22, SECTIONS.warmup + 0.8 + i * 0.22, t);
    const allFlash = Math.max(decay(t, this.outro.smart, 0.5), ch ? decay(t, ch.sound, 0.35) : 0, ...(ch ? ch.checks.map((c) => decay(t, c, 0.2) * 0.6) : [0]));
    this.props.forEach((p, i) => {
      const a = appear(i);
      if (a <= 0) return;
      const x = x0 + i * pitch;
      const done = smooth(p.stampT, p.stampT + 0.12, t);
      const pop = 1 + 0.35 * decay(t, p.stampT, 0.18) + 0.15 * allFlash * done;
      const active = t >= p.t0 && t < p.stampT;
      const color = p.ok ? OK : NO;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(x, LIST_Y);
      ctx.scale(pop * easeOutBack(a), pop * easeOutBack(a));
      ctx.lineWidth = 4;
      ctx.strokeStyle = done ? color : active ? "#ffffff" : "rgba(200,210,230,0.5)";
      ctx.fillStyle = done ? color : "rgba(10,14,24,0.7)";
      if (active || done) {
        ctx.shadowColor = done ? color : "#ffffff";
        ctx.shadowBlur = active ? 10 + 10 * Math.sin(t * 10) : 14;
      }
      ctx.beginPath();
      ctx.roundRect(-20, -20, 40, 40, 8);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      if (done > 0.5) hud.text(p.ok ? "✓" : "✗", x, LIST_Y + 2, { size: Math.round(32 * pop), weight: 800, family: FONT_COND, color: "#0a0e18", alpha: a });
    });
    hud.keepout(x0 - 24, LIST_Y - 24, x0 + (n - 1) * pitch + 24, LIST_Y + 24);

    // Verdict stamps and answer stamps over the hero, with a burst of sparks.
    for (const s of this.stamps) {
      if (t < s.t || t > s.t + s.life) continue;
      const color = s.ok ? OK : NO;
      const big = s.text.length <= 1;
      const x = !big ? 515 : s.dx ? 515 + s.dx * 270 : hx + 190;
      const y = big ? hy - 40 : hy + 230;
      hud.stamp(s.text, t, s.t, { x, y, size: big ? 170 : 110, color, angle: big ? -0.12 : -0.06, life: s.life });
      const u = (t - s.t) / 0.6;
      if (u < 1) {
        ctx.save();
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 16;
        for (let k = 0; k < 14; k++) {
          const a = (k / 14) * Math.PI * 2 + hash(k + s.t) * 0.4;
          const r = 60 + easeOutCubic(u) * (140 + hash(k * 3.1 + s.t) * 80);
          ctx.globalAlpha = (1 - u) * 0.9;
          ctx.beginPath();
          ctx.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, 7 * (1 - u) + 2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    }

    // The clock is checked in every chorus.
    if (ch && t >= ch.clock && t < ch.clock + 0.8) {
      const [cx, cy] = this.screen(CLOCK);
      const u = (t - ch.clock) / 0.8;
      ctx.save();
      ctx.globalAlpha = 1 - u;
      ctx.strokeStyle = ACCENT;
      ctx.shadowColor = ACCENT;
      ctx.shadowBlur = 20;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(cx, cy, 90 + u * 80, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
}
