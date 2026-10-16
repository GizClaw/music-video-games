import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { BRAND, clamp, easeInOut, easeOutBack, easeOutCubic, hash, lerp, smooth } from "@gizclaw/mvg-core/timing.js";
import { FONT_COND, FONT_MONO } from "@gizclaw/mvg-core/hud.js";
import { Bench, CLOCK, FRONT, ROW_X, TIERS } from "./bench.js";
import { lathe } from "./craft.js";
import { PROPS } from "./props.js";
import { Shine } from "./shine.js";
import { ACCENT, BRIDGE, CHORUSES, NO, OK, OUTRO, PROTECTS, RULES, SECTIONS } from "./constants.js";

// The camera looks down onto the bench so that its front edge lands on screen
// row ~1234, above the lyric band; a prop's big moment floats at HERO, around
// rows 400–690, between the title and the top tier.
const CAM = new THREE.Vector3(0, 9, 46);
const LOOK = new THREE.Vector3(0, 3.6, 0);
const HERO = new THREE.Vector3(-0.35, 7.75, 3);
const HERO_FIT = [4.4, 3.9];
const HERO_C = HERO.clone().add(new THREE.Vector3(0, HERO_FIT[1] / 2, 0));
const TITLE_Y = 290;
const MAT = lathe([[0, 0.04], [0.56, 0.04], [0.62, 0.035], [0.65, 0.015], [0.62, 0]], 48);
const RING = new THREE.TorusGeometry(0.66, 0.035, 8, 64).rotateX(Math.PI / 2);
const decay = (t, t0, tau) => (t >= t0 ? Math.exp(-(t - t0) / tau) : 0);

// Parking: three rows of 6 / 6 / 5 (top tier, middle tier, bench top), filled in
// rule order and centred on column 515, about 160 px apart; each prop is scaled so
// its bounding box fills the slot ([width, height] in world units).
const ROWS = [
  { n: 6, y: TIERS[0].y, z: TIERS[0].z, pitch: 2.45, fit: [2.25, 2.25] },
  { n: 6, y: TIERS[1].y, z: TIERS[1].z, pitch: 2.38, fit: [2.2, 2.35] },
  { n: 5, y: FRONT.y, z: FRONT.z, pitch: 2.6, fit: [2.3, 2.4] },
];
function slotOf(i) {
  for (const row of ROWS) {
    if (i < row.n) return { pos: new THREE.Vector3(ROW_X + (i - (row.n - 1) / 2) * row.pitch, row.y, row.z), fit: row.fit };
    i -= row.n;
  }
}

/** Bounds of a prop's solid and glass parts, measured once in its resting state. */
function propBox(group) {
  group.updateMatrixWorld(true);
  const box = new THREE.Box3();
  group.traverse((o) => {
    if (o.isMesh && (o.material.isMeshStandardMaterial || o.material.userData?.outline || Array.isArray(o.material))) box.expandByObject(o, true);
  });
  return box;
}

export class RulesScene {
  constructor(ctx) {
    this.ctx = ctx;
    const { renderer } = ctx;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene = new THREE.Scene();
    this.scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.2;
    this.camera = new THREE.PerspectiveCamera(34, 9 / 16, 0.5, 300);
    this.scene.add(new THREE.HemisphereLight("#c8d4e8", "#2a2420", 0.55));
    // The ceiling lamp over the bench is the key light and the only shadow caster.
    const lamp = new THREE.SpotLight("#fff2dc", 1.6, 0, 0.62, 0.8, 0);
    lamp.position.set(2, 24, 16);
    lamp.target.position.set(0, 2, 0);
    lamp.castShadow = true;
    lamp.shadow.mapSize.set(2048, 2048);
    lamp.shadow.camera.near = 8;
    lamp.shadow.camera.far = 60;
    lamp.shadow.bias = -0.0004;
    lamp.shadow.normalBias = 0.03;
    lamp.shadow.radius = 6;
    this.scene.add(lamp, lamp.target);
    const fill = new THREE.DirectionalLight("#9fc4ff", 0.5);
    fill.position.set(-8, 4, 6);
    this.scene.add(fill);
    this.bench = new Bench(this.scene);

    this.props = RULES.map((r, i) => {
      const { group, tick } = PROPS[r.prop]();
      tick?.(0, 1, 0);
      const box = propBox(group);
      const size = box.getSize(new THREE.Vector3());
      const { pos, fit } = slotOf(i);
      const slotS = Math.min(fit[0] / size.x, fit[1] / size.y);
      const heroS = Math.min(HERO_FIT[0] / size.x, HERO_FIT[1] / size.y, 2.2);
      const cx = (box.min.x + box.max.x) / 2;
      const holder = new THREE.Group();
      holder.add(group);
      this.scene.add(holder);
      const coaster = new THREE.Mesh(MAT, new THREE.MeshBasicMaterial({ color: r.ok ? OK : NO }));
      const ring = new THREE.Mesh(RING, new THREE.MeshBasicMaterial({ color: r.ok ? OK : NO, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      for (const m of [coaster, ring]) {
        m.position.copy(pos).add(new THREE.Vector3(0, 0.01, 0));
        m.scale.set(1, 1, 0.72).multiplyScalar((fit[0] * 0.47) / 0.65);
        this.scene.add(m);
      }
      const slot = pos.clone().add(new THREE.Vector3(-cx * slotS, -box.min.y * slotS, 0));
      const hero = HERO.clone().add(new THREE.Vector3(-cx * heroS, -box.min.y * heroS, 0));
      return { ...r, i, group, tick, holder, coaster, ring, box, slot, slotS, hero, heroS, heroes: [] };
    });
    this.byProp = Object.fromEntries(this.props.map((p) => [p.prop, p]));
    this.shine = new Shine(this.scene, renderer, HERO_C);
    for (const p of this.props) {
      p.holder.traverse((o) => [o.material].flat().forEach((m) => m && this.shine.dress(m)));
      this.shine.outline(p.holder);
    }
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
      this.titles.push({ t0: p.t0, t1: p.t1, kicker: `RULE ${p.i + 1} / ${RULES.length}`, text: p.title, color: p.ok ? OK : NO });
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
    this.arrivals = this.props.flatMap((p) => p.heroes.map(([t0]) => t0)).sort((a, b) => a - b);
    // A prop wears its verdict once it lands after its first stamp; it bounces on at every landing after that.
    for (const p of this.props) {
      const first = p.heroes.find(([t0, t1]) => this.stamps.some((s) => s.t >= t0 && s.t <= t1)) ?? [p.t0, p.t1];
      p.landings = p.heroes.filter(([t0]) => t0 >= first[0]).map(([, t1]) => t1 + 0.5);
      p.badgeT = p.landings[0];
    }
    this.stamps.sort((a, b) => a.t - b.t);
    // Gleams and star bursts: on every stamp at the hero spot, and as each prop lands in its slot.
    this.glints = [
      ...this.stamps.map((s) => ({ t: s.t, c: HERO_C, r: 2.6, life: 0.6, count: 10, size: 2.6 })),
      ...this.props.flatMap((p) => p.heroes.map(([, t1]) => ({ t: t1 + 0.5, c: p.slot.clone().add(new THREE.Vector3(0, 0.6, 0)), r: 0.9, life: 0.5, count: 5, size: 1.6 }))),
    ].sort((a, b) => a.t - b.t);
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
        pos.copy(p.hero);
        s = p.heroS * easeOutBack(u);
      } else {
        pos.lerpVectors(p.slot, p.hero, easeOutCubic(u));
        pos.y += Math.sin(u * Math.PI) * 1.2;
        s = lerp(p.slotS, p.heroS, easeOutCubic(u));
      }
      star = u;
      pos.y += this.ctx.timing.pulse(t, 0.2) * 0.15;
      holder.rotation.set(0.12, Math.sin(t * 0.9) * 0.45, 0);
    } else {
      const u = clamp((t - t1) / 0.5, 0, 1);
      pos.lerpVectors(p.hero, p.slot, easeInOut(u));
      pos.y += Math.sin(u * Math.PI) * 1.5;
      s = lerp(p.heroS, p.slotS, easeInOut(u));
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

    let heroOn = 0;
    let lead = null;
    for (const p of this.props) {
      const star = this.place(p, t, bf, bounce);
      if (star > heroOn) [heroOn, lead] = [star, p];
      const act = p.t0 <= t ? clamp((t - p.t0) / Math.max(0.2, p.stampT - p.t0), 0, 1) : 0;
      p.tick?.(t, act, star);
      const wave = decay(t, this.protects.word + p.i * 0.05, 0.25) + decay(t, o.start + p.i * 0.04, 0.25);
      p.holder.position.y += (wave + rock) * 0.6 * (1 - star);
      p.star = star;
      const lit = smooth(p.badgeT - 0.1, p.badgeT + 0.3, t);
      const flash = Math.max(decay(t, p.badgeT, 0.3), decay(t, o.smart, 0.4), ch ? decay(t, ch.sound, 0.3) : 0);
      const chase = section === "warmup" && timing.beatIndexAt(t) % this.props.length === p.i ? kick * 0.4 : 0;
      p.coaster.material.color.set(p.ok ? OK : NO).multiplyScalar(0.06 + chase + lit * (0.3 + flash * 0.4));
      p.ring.material.color.set(p.ok ? OK : NO).multiplyScalar(chase + lit * (0.75 + flash * 0.6 + 0.15 * kick));
    }

    const cp = this.confetti.geometry.attributes.position;
    this.confSeed.forEach(([x, y0, zz, sp], i) => cp.setXYZ(i, x + Math.sin(t + i) * 0.3, 19 - ((((y0 * 22 + t * sp * 5) % 22) + 22) % 22), zz - 1));
    cp.needsUpdate = true;
    this.confetti.material.opacity = Math.max(rock * 0.9, smooth(o.rock, o.rock + 0.4, t) * 0.8, chorus * 0.3);

    const live = this.glints.filter((g) => t >= g.t && t < g.t + 0.8);
    const sweep = live.filter((g) => t < g.t + g.life).at(-1);
    const bursts = live.map((g) => [g.c, g.r, g.t, g.count, g.life + 0.2, g.size]);
    if (heroOn > 0.5) {
      const b = timing.beatIndexAt(t);
      for (const k of [b - 1, b]) if (k >= 0) bursts.push([HERO_C, 1.9, timing.beatTime(k), 3, 0.45, 1.6]);
    }
    let pulse = 0;
    for (const s of this.stamps) pulse = Math.max(pulse, decay(t, s.t, 0.22));
    const arrival = this.arrivals.filter((a) => a <= t).at(-1) ?? -9;
    const scanU = clamp((t - arrival) / 0.7, 0, 1);
    this.shine.update(t, {
      gleam: sweep ? [sweep.c, sweep.r, (t - sweep.t) / sweep.life] : null,
      energy: heroOn * (0.55 + 0.45 * timing.pulse(t, 0.18)),
      pulse,
      scan: Math.sin(scanU * Math.PI),
      scanY: HERO.y + scanU * HERO_FIT[1] * 1.15,
      accent: lead && heroOn > 0.05 ? (lead.ok ? OK : NO) : "#3de8ff",
      bursts,
    });
    this.accent = lead?.ok === false ? NO : OK;
    this.heroOn = heroOn;

    const clockPop = ch ? decay(t, ch.clock, 0.35) : 0;
    const spin = this.choruses.reduce((a, c) => a + easeOutCubic(clamp((t - c.clock) / 0.8, 0, 1)), 0);
    this.bench.update(t, bf, 1 + chorus * 0.12 * timing.pulse(t, 0.25) + rock * 0.2, spin, clockPop, kick);
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
    const [hx, hy] = this.screen(HERO_C);

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

    // Parked props wear their verdict: a round ✓/✗ badge on the top-right corner and,
    // for the "don't" rules, a red prohibition ring with its slash.
    const pulse = Math.max(decay(t, this.outro.smart, 0.5), ch ? decay(t, ch.sound, 0.35) : 0, ...(ch ? ch.checks.map((c) => decay(t, c, 0.2) * 0.5) : [0]));
    for (const p of this.props) {
      const land = p.landings.filter((l) => l <= t).at(-1);
      if (land === undefined || p.star > 0.05) continue;
      const pop = easeOutBack(clamp((t - land) / 0.35, 0, 1)) * (1 + 0.25 * pulse);
      if (pop <= 0.01) continue;
      const s = p.holder.scale.x;
      const at = (x, y) => this.screen(p.holder.position.clone().add(new THREE.Vector3(x * s, y * s, 0)));
      const color = p.ok ? OK : NO;
      if (!p.ok) {
        const [cx, cy] = at((p.box.min.x + p.box.max.x) / 2, (p.box.min.y + p.box.max.y) / 2);
        const [ex, ey] = at(p.box.max.x, p.box.max.y);
        const r = Math.max(Math.abs(ex - cx), Math.abs(ey - cy)) * 0.8 * pop;
        ctx.save();
        ctx.strokeStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 14;
        ctx.globalAlpha = 0.9;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.moveTo(cx - r * 0.7071, cy - r * 0.7071);
        ctx.lineTo(cx + r * 0.7071, cy + r * 0.7071);
        ctx.stroke();
        ctx.restore();
      }
      const [bx, by] = at(p.box.max.x, p.box.max.y);
      ctx.save();
      ctx.translate(bx - 16, by + 14);
      ctx.scale(pop, pop);
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.arc(0, 0, 29, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      hud.font(40, 800, FONT_COND);
      ctx.fillText(p.ok ? "✓" : "✗", 0, 2);
      ctx.restore();
    }

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

    // Electric arcs crackle around the hero on the beat and on stamps, and around a prop as it lands.
    const { timing } = this.ctx;
    const arcs = [];
    if (this.heroOn > 0.5) {
      const b = timing.beatIndexAt(t);
      if (b >= 0) arcs.push([hx, hy + 10, 220, 200, timing.beatTime(b), 2, 0.22, this.accent]);
    }
    for (const s of this.stamps) if (t >= s.t && t < s.t + 0.4) arcs.push([hx, hy + 10, 230, 210, s.t, 5, 0.38, s.ok ? OK : NO]);
    for (const g of this.glints) {
      if (g.r > 1 || t < g.t || t > g.t + 0.35) continue;
      const [sx, sy] = this.screen(g.c);
      arcs.push([sx, sy, 50, 45, g.t, 3, 0.3, "#3de8ff"]);
    }
    for (const [cx, cy, rx, ry, t0, count, life, color] of arcs) {
      const u = (t - t0) / life;
      if (u < 0 || u >= 1) continue;
      const frame = Math.floor(t * 30);
      for (let k = 0; k < count; k++) {
        const seed = t0 * 7.13 + k * 3.7;
        const a0 = hash(seed) * Math.PI * 2;
        const a1 = a0 + (0.5 + hash(seed + 1) * 0.7) * (hash(seed + 2) > 0.5 ? 1 : -1);
        const pts = [[cx + Math.cos(a0) * rx, cy + Math.sin(a0) * ry], [cx + Math.cos(a1) * rx * 1.05, cy + Math.sin(a1) * ry * 1.05]];
        for (let level = 0; level < 4; level++) {
          const next = [pts[0]];
          for (let i = 1; i < pts.length; i++) {
            const [x0, y0] = pts[i - 1];
            const [x1, y1] = pts[i];
            const l = Math.hypot(x1 - x0, y1 - y0);
            const j = (hash(seed + frame * 0.37 + level * 11 + i * 1.3) - 0.5) * l * 0.5;
            next.push([(x0 + x1) / 2 + ((y0 - y1) / l) * j, (y0 + y1) / 2 + ((x1 - x0) / l) * j], pts[i]);
          }
          pts.splice(0, pts.length, ...next);
        }
        const fade = (1 - u) * (hash(seed + frame) > 0.15 ? 1 : 0.3);
        ctx.save();
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.beginPath();
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.globalAlpha = fade * 0.55;
        ctx.strokeStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 18;
        ctx.lineWidth = 7;
        ctx.stroke();
        ctx.globalAlpha = fade;
        ctx.strokeStyle = "#ffffff";
        ctx.shadowBlur = 8;
        ctx.lineWidth = 2.2;
        ctx.stroke();
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
