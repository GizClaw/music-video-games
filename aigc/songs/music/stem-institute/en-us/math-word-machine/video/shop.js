import * as THREE from "three";
import { clamp, easeInOut, easeOutBack, lerp, smooth } from "@gizclaw/mvg-core/timing.js";
import { ALGEBRA, BRIDGE, CHORUSES, FRACTION, OUTRO, PROBLEMS, SECTIONS, TERMS, TERM_ORDER, VERSE1 } from "./constants.js";
import { PRESS_X, SLOT_X, WordMachine } from "./machine.js";
import { Workshop } from "./workshop.js";

const MAIN = { px: -0.35, py: 0.75, pz: 11.5, tx: -0.35, ty: 0.52, tz: 0, fov: 40 };
const SCREEN = { px: 0, py: 1.3, pz: 8.0, tx: 0, ty: 1.25, tz: 0, fov: 40 };
const WIDE = { px: 0, py: 1.0, pz: 15.5, tx: 0, ty: 0.65, tz: 0, fov: 44 };
const KEYS = ["px", "py", "pz", "tx", "ty", "tz", "fov"];
const SPEED = 1.4;
const SYMBOL = { sum: "+", difference: "−", product: "×", quotient: "÷" };
const VERB = { sum: "ADD", difference: "SUBTRACT", product: "MULTIPLY", quotient: "DIVIDE" };
const TITLE = { text: "MATH WORD MACHINE", color: "#ffd9a0" };

/** Latest entry of a time-sorted list at or before t. */
function latest(list, t) {
  let e = null;
  for (const x of list) {
    if (x.t > t) break;
    e = x;
  }
  return e;
}

export class ShopScene {
  constructor(ctx) {
    this.ctx = ctx;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 9 / 16, 0.1, 200);
    this.workshop = new Workshop(this.scene);
    this.machine = new WordMachine();
    this.scene.add(this.machine.group);
    const fill = new THREE.DirectionalLight("#ffe2c0", 0.8);
    fill.position.set(2, 3, 8);
    this.scene.add(fill);
    this.buildTimeline(ctx.timing);
  }

  buildTimeline(timing) {
    const cue = (i) => timing.cues[i];
    const w = (ci, word, n = 0) => timing.wordTime(ci, word, n) ?? cue(ci).start;
    const beat = timing.period;
    const marquee = [{ t: 0, ...TITLE }];
    const screens = [{ t: 0, mode: "face" }];
    const views = [{ t: SECTIONS.verse1, v: MAIN, dur: 0.01 }];
    const say = (t, text, color = "#ffd9a0") => marquee.push({ t, text, color });
    const show = (t, mode, data = {}) => screens.push({ t, mode, ...data });
    const look = (t, v, dur = 0.8) => views.push({ t, v, dur });
    this.blocks = [];
    this.cards = [];
    this.presses = [];
    this.spins = [];
    this.pops = [];
    this.sung = Object.fromEntries(TERM_ORDER.map((id) => [id, []]));
    for (const c of timing.cues) for (const x of c.words) if (this.sung[x.clean]) this.sung[x.clean].push(x.start);

    // Word problems: the block goes in on the operation word, the answer card comes out on the term.
    for (const [ci, inWord, outWord, term, problem, answer] of PROBLEMS) {
      const tIn = w(ci, inWord);
      const tOut = w(ci, outWord);
      const color = term ? TERMS[term].color : "#ffd9a0";
      this.blocks.push({ tIn, label: problem, color: "#f2ead6" });
      this.presses.push(tIn - (SLOT_X - 0.4 - PRESS_X) / SPEED);
      this.spins.push([tIn, tOut, 9]);
      this.cards.push({ t: tOut, key: problem, parts: [{ text: `${problem} = ` }, { text: answer, color }] });
      this.pops.push(tIn, tOut);
      if (term) {
        say(w(ci, term), TERMS[term].name, color);
        show(tIn - 0.5, "op", { sym: SYMBOL[term], color, label: VERB[term], caption: `${VERB[term].toLowerCase()} → ${TERMS[term].name}` });
      } else {
        say(w(ci, "operation"), "OPERATION");
        say(tOut, "RESULT");
        show(tIn - 0.5, "op", { sym: "=", color: "#ffd9a0", label: "IN → OUT", caption: "operation in, result out" });
      }
    }
    const clicks = cue(VERSE1.clicks).words.at(-1).start;
    this.clicks = [0, 1, 2].map((k) => clicks - 0.05 + k * 0.3);
    const match = cue(VERSE1.match);
    say(match.start, "MATCH THE WORD");
    show(match.start - 0.2, "match", { lit: [0, 1, 2, 3].map((k) => lerp(match.start, match.end, k / 4)) });
    look(match.start - 0.5, SCREEN, 0.9);

    // Choruses: whirr, click, clack; name that word; the terms; terms in motion.
    this.chorus = [];
    for (const ch of CHORUSES) {
      const c0 = cue(ch.start);
      const sounds = ["whirr", "click", "clack"].map((s) => w(ch.start, s));
      this.spins.push([sounds[0] - 0.1, sounds[1], 30]);
      this.presses.push(sounds[2]);
      this.chorus.push({ sounds, send: w(ch.name, "send") });
      say(c0.start, TITLE.text, TITLE.color);
      say(w(ch.name, "name"), "NAME THAT WORD!", "#ffffff");
      show(c0.start - 0.2, "face");
      look(c0.start - 0.4, WIDE, 0.7);
      const [ci, ids] = ch.terms;
      look(cue(ci).start - 0.4, MAIN, 0.5);
      ids.forEach((id, k) => {
        const t0 = w(ci, id);
        say(t0, TERMS[id].name, TERMS[id].color);
        this.pops.push(t0);
        if (SYMBOL[id]) {
          show(t0 - 0.05, "op", { sym: SYMBOL[id], color: TERMS[id].color, label: VERB[id] });
          this.cards.push({ t: t0, key: id, parts: [{ text: TERMS[id].name, color: TERMS[id].color }] });
        } else if (k === 0) {
          if (id === "numerator") show(t0 - 0.1, "fraction", { top: t0, bottom: w(ci, ids[1]), marked: 3, outline: 4 });
          else show(t0 - 0.1, "balance", { equal: t0, level: t0 });
        } else if (id === "variable") show(t0 - 0.05, "variable", { cycle: [t0, cue(ci).end] });
      });
      const m = cue(ch.motion);
      look(m.start - 0.3, WIDE, 0.7);
      show(m.start - 0.1, "face");
      say(m.start, TITLE.text, TITLE.color);
      for (let k = 0; k < 6; k++) this.blocks.push({ tIn: m.start + 1.6 + k * beat, label: ["+", "−", "×", "÷", "=", "x"][k], color: TERMS[TERM_ORDER[k + 2]].color });
    }
    say(w(CHORUSES[1].motion, "fraction"), "FRACTION TRANSLATOR", "#ffd23f");
    const eight = cue(CHORUSES[2].motion);
    const e0 = w(CHORUSES[2].motion, "eight");
    show(e0 - 0.1, "terms", { lit: TERM_ORDER.map(() => e0), flash: TERM_ORDER.map((_, k) => lerp(e0, eight.end - 0.3, k / 7)) });
    TERM_ORDER.forEach((id, k) => say(lerp(e0, eight.end - 0.3, k / 7), TERMS[id].name, TERMS[id].color));
    this.eight = TERM_ORDER.map((_, k) => lerp(e0, eight.end - 0.3, k / 7));

    // Verse 2: one fraction, three quarters of a pie.
    const f = FRACTION;
    look(cue(f.top).start - 0.6, SCREEN, 1.0);
    const marks = ["counts", "parts", "choose"].map((x) => w(f.mark, x));
    const whole = ["counts", "equal", "parts", "whole"].map((x) => w(f.whole, x));
    const frac = { top: w(f.top, "numerator"), bottom: w(f.bottom, "denominator"), marks, whole, bar: w(f.bar, "bar"), divide: w(f.bar, "division") };
    show(cue(f.top).start - 0.3, "fraction", frac);
    say(frac.top, TERMS.numerator.name, TERMS.numerator.color);
    say(frac.bottom, TERMS.denominator.name, TERMS.denominator.color);
    say(frac.bar, "FRACTION BAR", "#ffd23f");
    say(frac.divide, "DIVISION", TERMS.quotient.color);
    say(w(f.words, "fraction"), "FRACTION", "#ffd23f");
    this.pops.push(frac.top, frac.bottom, frac.bar, frac.divide);

    // Verse 3: the balance, the x box, then the eight terms.
    const a = ALGEBRA;
    const eq = w(a.equation, "equation");
    look(cue(a.equation).start - 0.6, SCREEN, 1.0);
    show(cue(a.equation).start - 0.3, "balance", { equal: w(a.sides, "same"), level: w(a.sides, "value") });
    say(eq, TERMS.equation.name, TERMS.equation.color);
    const v0 = w(a.variable, "variable");
    show(cue(a.variable).start - 0.1, "variable", { cycle: [w(a.vary, "number"), w(a.vary, "unknown")] });
    say(v0, TERMS.variable.name, TERMS.variable.color);
    const l0 = cue(a.label).start;
    const l1 = cue(a.gears).end;
    show(l0 - 0.2, "terms", { lit: TERM_ORDER.map((_, k) => lerp(l0, l1 - 0.5, k / 7)), flash: TERM_ORDER.map((_, k) => lerp(l0, l1 - 0.5, k / 7)) });
    say(l0, "EIGHT TERMS", "#ffd9a0");
    this.pops.push(eq, v0);

    // Bridge: the four operations again, then fraction, balance and x.
    look(SECTIONS.bridge - 0.3, MAIN, 0.6);
    const bf = cue(BRIDGE.fraction);
    look(bf.start - 0.5, SCREEN, 0.7);
    const bTop = w(BRIDGE.fraction, "numerator");
    show(bf.start - 0.2, "fraction", { top: bTop, bar: w(BRIDGE.fraction, "over"), bottom: w(BRIDGE.fraction, "denominator"), marked: 3, outline: 4 });
    say(bTop, TERMS.numerator.name, TERMS.numerator.color);
    say(w(BRIDGE.fraction, "denominator"), TERMS.denominator.name, TERMS.denominator.color);
    const bb = cue(BRIDGE.balance);
    const bEq = w(BRIDGE.balance, "equation");
    const bVar = w(BRIDGE.balance, "variable");
    show(bb.start - 0.2, "balance", { equal: bEq, level: w(BRIDGE.balance, "balances") });
    say(bEq, TERMS.equation.name, TERMS.equation.color);
    show(bVar - 0.1, "variable", { cycle: [w(BRIDGE.balance, "change"), SECTIONS.breakdown] });
    say(bVar, TERMS.variable.name, TERMS.variable.color);
    this.pops.push(bTop, bEq, bVar);

    // Breakdown and outro: idle, align the definitions, power down.
    look(SECTIONS.breakdown, WIDE, 1.5);
    show(SECTIONS.breakdown + 0.3, "face");
    say(SECTIONS.breakdown + 0.3, TITLE.text, TITLE.color);
    const al = cue(OUTRO.align);
    const outroSounds = ["whirr", "click", "clack"].map((s) => w(OUTRO.align, s));
    this.spins.push([outroSounds[0] - 0.1, outroSounds[1], 30]);
    this.presses.push(outroSounds[2]);
    this.outroSounds = outroSounds;
    look(al.start - 0.4, MAIN, 0.6);
    const def = w(OUTRO.align, "definitions");
    look(def - 0.3, SCREEN, 0.8);
    show(def - 0.1, "terms", { lit: TERM_ORDER.map((_, k) => def + k * 0.08), flash: TERM_ORDER.map(() => w(OUTRO.align, "align")) });
    say(outroSounds[0], "WHIRR · CLICK · CLACK", "#ffb347");
    say(def, "DEFINITIONS ALIGN", "#ffd9a0");
    const pw = w(OUTRO.power, "power");
    const down = w(OUTRO.power, "down");
    say(pw, "POWER DOWN", "#ff5d5d");
    look(pw - 0.4, MAIN, 0.8);
    look(cue(OUTRO.power).end + 0.3, WIDE, 3);
    show(down, "off", { t0: down });
    show(down + 0.45, "face", { sleep: true });
    this.power = [down, down + 1.2];

    this.blocks.sort((x, y) => x.tIn - y.tIn);
    this.cards.sort((x, y) => x.t - y.t);
    this.presses.sort((x, y) => x - y);
    this.pops.sort((x, y) => x - y);
    marquee.sort((x, y) => x.t - y.t);
    screens.sort((x, y) => x.t - y.t);
    views.sort((x, y) => x.t - y.t);
    views.forEach((k, i) => (k.from = i > 0 ? this.viewSeg(views[i - 1], k.t) : k.v));
    this.marquee = marquee;
    this.screens = screens;
    this.views = views;
    // A card stays out until the next one, or until the camera moves in to the screen.
    this.cards.forEach((c, i) => {
      const close = views.find((v) => v.t > c.t && v.v === SCREEN);
      c.until = Math.min(c.t + 2.2, this.cards[i + 1] ? this.cards[i + 1].t - 0.05 : Infinity, close ? close.t + 0.2 : Infinity);
    });
    this.learned = TERM_ORDER.map((id) => this.sung[id][0] ?? Infinity);
  }

  viewSeg(k, t) {
    const u = easeInOut((t - k.t) / k.dur);
    const v = {};
    for (const key of KEYS) v[key] = lerp(k.from[key], k.v[key], u);
    return v;
  }

  viewAt(t) {
    let i = 0;
    for (let k = 0; k < this.views.length && this.views[k].t <= t; k++) i = k;
    return this.viewSeg(this.views[i], t);
  }

  pulse(list, t, life = 0.3) {
    let v = 0;
    for (const e of list) {
      if (e > t) break;
      v = Math.max(v, Math.exp(-(t - e) / life));
    }
    return v;
  }

  screenState(t, bf) {
    const s = latest(this.screens, t);
    const on = (x) => (x === undefined ? 1 : smooth(x - 0.05, x + 0.1, t));
    const count = (list) => list.reduce((n, x) => n + (t >= x ? 1 : 0), 0);
    const out = { mode: s.mode, caption: s.caption, flash: this.pulse(this.pops, t, 0.15) };
    if (s.mode === "op") Object.assign(out, { sym: s.sym, color: s.color, label: s.label, pop: this.pulse(this.pops, t, 0.2) });
    if (s.mode === "face") Object.assign(out, { sleep: s.sleep, blink: (bf % 8) > 7.75, look: Math.sin(t * 0.7) });
    if (s.mode === "match") out.lit = s.lit.map(on);
    if (s.mode === "fraction") {
      const top = on(s.top);
      const bottom = on(s.bottom);
      Object.assign(out, {
        top,
        bottom,
        bar: s.bar === undefined ? 0 : on(s.bar),
        divide: s.divide === undefined ? 0 : on(s.divide),
        marked: s.marks ? count(s.marks) : t >= s.top ? s.marked : 0,
        outline: s.whole ? count(s.whole) : t >= s.bottom ? s.outline : 0,
      });
      out.caption = t >= (s.divide ?? Infinity) ? "the fraction bar means divide" : t >= (s.bar ?? Infinity) ? "fraction bar between top and bottom" : bottom ? "denominator = equal parts in the whole" : top ? "numerator = the parts we choose" : "";
    }
    if (s.mode === "balance") {
      Object.assign(out, { left: "2 + 3", right: "5", tilt: (1 - easeOutBack(clamp((t - s.level) / 0.5, 0, 1))) * Math.cos((t - s.t) * 3), equal: on(s.equal) });
      out.caption = t >= s.equal ? "same value on both sides" : "";
    }
    if (s.mode === "variable") {
      const [c0, c1] = s.cycle;
      const n = Math.floor(bf * 2);
      const value = t < c0 ? "?" : t < c1 ? String(1 + ((n * 7) % 9)) : "?";
      Object.assign(out, { value, pop: t >= c0 && t < c1 ? Math.exp(-((bf * 2) % 1) / 0.3) : 0, caption: "a symbol for a number that can vary" });
    }
    if (s.mode === "terms") Object.assign(out, { lit: s.lit.map(on), flash: s.flash.map((x) => (t >= x ? Math.exp(-(t - x) / 0.25) : 0)) });
    if (s.mode === "off") out.collapse = smooth(s.t0, s.t0 + 0.4, t);
    return out;
  }

  machineState(t, kick, bf) {
    const { timing } = this.ctx;
    const m = latest(this.marquee, t);
    const blocks = [];
    for (const b of this.blocks) {
      const x = SLOT_X - 0.4 - SPEED * (b.tIn - t);
      if (x < -4.6 || t > b.tIn + 0.35) continue;
      const tp = b.tIn - (SLOT_X - 0.4 - PRESS_X) / SPEED;
      const squash = t >= tp && t < tp + 0.3 ? Math.sin(((t - tp) / 0.3) * Math.PI) : 0;
      if (blocks.length < 6) blocks.push({ x, label: b.label, color: b.color, squash });
    }
    let card = null;
    const c = latest(this.cards, t);
    if (c) {
      const end = c.until;
      const up = easeOutBack(clamp((t - c.t) / 0.28, 0, 1));
      const sink = smooth(end - 0.22, end, t);
      if (t < end) card = { key: c.key, parts: c.parts, y: lerp(-0.72, -0.17, up) - sink * 0.55, z: up * 0.15, tilt: (1 - up) * -0.9, roll: Math.sin((t - c.t) * 2) * 0.02, scale: 1 + this.pulse([c.t], t, 0.15) * 0.08 };
    }
    let press = 0;
    for (const e of this.presses) if (t >= e - 0.06 && t < e + 0.32) press = Math.max(press, smooth(e - 0.06, e, t) * (1 - smooth(e + 0.08, e + 0.32, t)));
    let gearAngle = t * 0.6 + 0.25 * (Math.floor(bf) + smooth(0, 0.18, bf % 1));
    for (const [a, b, speed] of this.spins) gearAngle += Math.max(0, Math.min(t, b) - a) * speed;
    gearAngle += this.clicks.reduce((n, x) => n + (t >= x ? 0.6 : 0), 0);
    const power = lerp(1, 0.2, smooth(this.power[0], this.power[1], t));
    return {
      t,
      kick,
      bf,
      power,
      marquee: m,
      screen: this.screenState(t, bf),
      blocks,
      card,
      press,
      gearAngle: gearAngle * (0.3 + 0.7 * power),
      beltShift: SPEED * t * (0.2 + 0.8 * power),
      bulbs: this.learned.map((x) => smooth(x - 0.05, x + 0.1, t)),
      bulbFlash: TERM_ORDER.map((id, k) => Math.max(this.pulse(this.sung[id], t, 0.25), this.pulse([this.eight[k]], t, 0.25))),
      chase: this.loud ? 1 : 0,
      gauge: [clamp(timing.env("low", t) * 1.6, 0, 1), clamp(timing.env("rms", t) * 1.8, 0, 1)],
    };
  }

  update(t, section) {
    const { timing } = this.ctx;
    const kick = timing.pulse(t, 0.12);
    const bf = timing.beatFloat(t);
    this.loud = section.startsWith("chorus") || section === "outro";
    this.machine.update(this.machineState(t, kick, bf));
    this.workshop.update(t, kick);

    // Robot camera: in the wide chorus shots it steps to a new angle every two beats.
    const view = this.viewAt(t);
    const wide = smooth(14, 16.5, view.pz);
    const step = Math.floor(bf / 2);
    const turn = [0, 0.14, 0, -0.14][((step % 4) + 4) % 4] * smooth(0, 0.12, (bf / 2) % 1) + [0, 0.14, 0, -0.14][(((step - 1) % 4) + 4) % 4] * (1 - smooth(0, 0.12, (bf / 2) % 1));
    const yaw = turn * wide * (this.loud ? 1 : 0.4);
    const r = view.pz - view.tz;
    const push = (this.pulse(this.pops, t, 0.25) * 0.35 + kick * 0.12) * smooth(8.5, 11, view.pz);
    this.camera.position.set(view.tx + Math.sin(yaw) * r + Math.sin(t * 0.3) * 0.08, view.py, view.tz + Math.cos(yaw) * r - push);
    this.camera.lookAt(view.tx, view.ty, view.tz);
    this.camera.fov = view.fov;
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    this.scene.updateMatrixWorld();

    const post = { bloom: [this.loud ? 0.65 : 0.5, 0.45, 0.7], ca: 0.1 + kick * (this.loud ? 0.3 : 0.15), vignette: 0.5, grain: 0.03 };
    const start = SECTIONS[section];
    if (start !== undefined && t - start < 0.3) post.flash = Math.exp(-(t - start) / 0.1) * 0.3;
    const clack = this.pulse(this.presses, t, 0.08);
    if (this.loud) post.glitch = clack * 0.3;
    post.flash = Math.max(post.flash || 0, clack * 0.12);
    this.drawHud(t, section);
    return post;
  }

  lyricBand() {
    const ctx = this.ctx.hud.ctx;
    const g = ctx.createLinearGradient(0, 1230, 0, 1600);
    g.addColorStop(0, "rgba(4,4,8,0)");
    g.addColorStop(0.4, "rgba(4,4,8,0.38)");
    g.addColorStop(0.6, "rgba(4,4,8,0.38)");
    g.addColorStop(1, "rgba(4,4,8,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 1230, 1080, 370);
  }

  drawHud(t, section) {
    const { hud } = this.ctx;
    this.lyricBand();
    const loud = section.startsWith("chorus") || section === "outro";
    const sounds = [...this.chorus.map((c) => c.sounds), this.outroSounds];
    for (const [wh, cl, ca] of sounds) {
      hud.stamp("WHIRR!", t, wh, { x: 790, y: 620, size: 100, color: "#ffb347", angle: 0.1, life: 0.55 });
      hud.stamp("CLICK!", t, cl, { x: 300, y: 820, size: 100, color: "#3de8ff", angle: -0.1, life: 0.55 });
      hud.stamp("CLACK!", t, ca, { x: 560, y: 1080, size: 110, color: "#ff5d8f", angle: 0.05, life: 0.6 });
    }
    if (loud) for (const c of this.chorus) hud.stamp("SEND IT BACK!", t, c.send, { x: 540, y: 1080, size: 84, color: "#ffffff", angle: -0.05, life: 0.9 });
    this.clicks.forEach((c, k) => hud.stamp("CLICK", t, c, { x: 870, y: 560 + k * 120, size: 70, color: "#b48cff", angle: -0.1 + k * 0.1, life: 0.35 }));
  }
}
