import * as THREE from "three";
import { FONT_COND, FONT_MONO } from "@gizclaw/mvg-core/hud.js";
import { clamp, easeInOut, hash, lerp, smooth } from "@gizclaw/mvg-core/timing.js";
import { BRIDGE, CHORUSES, CLOSEUPS, FORCES, OUTRO, QUIZ, SECTIONS, VERSE1, VERSE2, VERSE_FIRES, WIDE } from "./constants.js";
import { ANGLES, Grounds, spot } from "./grounds.js";
import { BUILDERS, DOT } from "./stations.js";

// Close-ups look outward from the plaza: camera distance and the height it looks at.
const FRAME = [[6.6, 0.55], [6.6, 0.4], [6.4, 0.5], [5.8, 0.2], [6.2, 0.45], [6.6, 0.75]];
const closeView = (k) => {
  const s = spot(k);
  const [d, h] = FRAME[k];
  const p = spot(k, 5.5 - d);
  return { px: p.x, py: h + 1.1, pz: p.z, tx: s.x, ty: h, tz: s.z, fov: 40 };
};
const WIDE_VIEW = { px: 0, py: 15, pz: 15, tx: 0, ty: 0, tz: -3.0, fov: 54 };
const KEYS = ["px", "py", "pz", "tx", "ty", "tz", "fov"];
const TOP_Y = 312;

/** Image-based light from a blue sky over green lawn, with a bright patch where the sun is. */
function outdoorEnvironment(renderer) {
  const env = new THREE.Scene();
  env.add(
    new THREE.Mesh(
      new THREE.SphereGeometry(10, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        vertexShader: "varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
        fragmentShader: /* glsl */ `
          varying vec3 vD;
          void main() {
            vec3 d = normalize(vD);
            vec3 sky = mix(vec3(0.75, 0.85, 0.95), vec3(0.25, 0.45, 0.85), smoothstep(0.0, 0.8, d.y));
            vec3 ground = mix(vec3(0.25, 0.32, 0.18), vec3(0.08, 0.14, 0.05), smoothstep(0.0, 0.5, -d.y));
            vec3 col = d.y > 0.0 ? sky : ground;
            col += vec3(6.0, 5.4, 4.6) * pow(max(dot(d, normalize(vec3(-7.5, 12.5, 10.0))), 0.0), 220.0);
            gl_FragColor = vec4(col, 1.0);
          }`,
      }),
    ),
  );
  return new THREE.PMREMGenerator(renderer).fromScene(env, 0.02).texture;
}

export class ParkScene {
  constructor(ctx) {
    this.ctx = ctx;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, 9 / 16, 0.1, 400);
    const { renderer } = ctx;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene.environment = outdoorEnvironment(renderer);
    this.scene.environmentIntensity = 0.4;
    // The sun is the only key light; it casts soft shadows over the arc of stations.
    const sun = new THREE.DirectionalLight("#fff1d6", 2.2);
    sun.position.set(-7.5, 12.5, 6.5);
    sun.target.position.set(0, 0, -3.5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 7, bottom: -7, near: 2, far: 40 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    sun.shadow.radius = 3;
    this.scene.add(sun, sun.target, new THREE.HemisphereLight("#bcd8ff", "#4a6a2a", 0.6));
    this.grounds = new Grounds(this.scene);
    const catcher = new THREE.Mesh(new THREE.PlaneGeometry(30, 22).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: 0.32 }));
    catcher.position.set(0, 0.004, -3);
    catcher.receiveShadow = true;
    this.scene.add(catcher);
    this.stations = FORCES.map((f, k) => {
      const s = new BUILDERS[k](f.color);
      s.group.position.copy(spot(k));
      s.group.rotation.y = -ANGLES[k];
      s.group.traverse((o) => {
        if (o.isMesh && !o.material.transparent && o.renderOrder === 0) o.castShadow = o.receiveShadow = true;
      });
      this.scene.add(s.group);
      return s;
    });
    this.buildPollen();
    this.buildTimeline(ctx.timing);
    this.tmp = new THREE.Vector3();
  }

  buildPollen() {
    const n = 260;
    this.pollenSeed = Array.from({ length: n }, (_, i) => [hash(i * 1.3) * 16 - 8, hash(i * 2.9) * 4, hash(i * 4.1) * 18 - 12, 0.3 + hash(i * 6.7)]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.pollen = new THREE.Points(geo, new THREE.PointsMaterial({ color: "#fff6d8", map: DOT, size: 0.06, transparent: true, opacity: 0.7, depthWrite: false }));
    this.pollen.frustumCulled = false;
    this.scene.add(this.pollen);
  }

  buildTimeline(timing) {
    const cue = (i) => timing.cues[i];
    const w = (ci, word, n = 0) => timing.wordTime(ci, word, n) ?? cue(ci).start;
    const events = FORCES.map(() => []);
    for (const [k, ci, a, b] of VERSE_FIRES) events[k].push({ t0: w(ci, a), t1: w(ci, b) });
    const repel = w(VERSE2.repel, "repel");
    events[4].push({ t0: repel, t1: repel + 0.7, kind: "repel" });
    this.tug = { t0: cue(VERSE2.balanced).start, tu: cue(VERSE2.unbalanced).start, t1: cue(VERSE2.unbalanced).end };
    events[1].push(this.tug);

    this.calls = [];
    this.pushes = [];
    this.moves = [];
    for (const ch of CHORUSES) {
      for (const [ci, k, a, b] of ch.calls) {
        const ev = { t0: w(ci, a), t1: w(ci, b) };
        events[k].push(ev);
        this.calls.push({ k, ...ev });
      }
      for (const ci of [ch.push, ch.tag]) for (const x of cue(ci).words) if (x.clean === "push" || x.clean === "pull") this.pushes.push({ t0: x.start, word: x.clean.toUpperCase() + "!" });
      for (const word of ["faster", "stop", "turn"]) this.moves.push({ t0: w(ch.moves, word), word: word.toUpperCase() + "!" });
    }
    this.quiz = QUIZ.map(([ci, k, word]) => {
      const t0 = w(ci, word);
      events[k].push({ t0, t1: t0 + 0.8 });
      return { ci, k, t0, q0: cue(ci).start };
    });
    const all = cue(OUTRO.all);
    this.finale = FORCES.map((_, k) => {
      const t0 = lerp(all.start, all.end - 0.5, k / 5);
      events[k].push({ t0, t1: t0 + 0.32 });
      return { k, t0 };
    });
    events.forEach((list, k) => this.stations[k].setEvents(list.sort((a, b) => a.t0 - b.t0)));
    this.hits = events.map((list) => list.map((e) => e.t1));

    this.mutual = [cue(VERSE1.masses).start, cue(VERSE1.masses).end];
    this.field = [cue(VERSE2.field).start, cue(VERSE2.field).end + 0.4];
    this.contact = [VERSE1.contact, OUTRO.contact].map((ci) => ({ c: w(ci, "contact"), n: w(ci, ci === VERSE1.contact ? "non" : "distant"), t1: cue(ci).end + 0.4 }));
    this.sizes = [VERSE1.size, BRIDGE.size].map((ci) => ({ t0: w(ci, "size"), t1: cue(ci).end + 0.3 }));
    this.title = [cue(OUTRO.contact).start - 0.2, all.start - 0.1];

    const views = [{ t: SECTIONS.verse1, v: closeView(0), dur: 0.01, focus: 0 }];
    for (const [ci, k] of CLOSEUPS) if (ci !== CLOSEUPS[0][0]) views.push({ t: cue(ci).start - 0.35, v: closeView(k), dur: 0.9, focus: k });
    for (const ci of WIDE) views.push({ t: cue(ci).start - 0.3, v: WIDE_VIEW, dur: 1.1, focus: -1 });
    for (const ch of CHORUSES) views.push({ t: cue(ch.push).start - 0.4, v: WIDE_VIEW, dur: 0.9, focus: -1 }, { t: cue(ch.tag).start - 0.25, v: WIDE_VIEW, dur: 0.6, focus: -1 });
    for (const c of [...this.calls, ...this.finale]) views.push({ t: c.t0 - 0.18, v: closeView(c.k), dur: 0.32, focus: c.k });
    this.quiz.forEach((q) => views.push({ t: q.q0 - 0.3, v: WIDE_VIEW, dur: 0.6, focus: -1 }, { t: q.t0 - 0.2, v: closeView(q.k), dur: 0.35, focus: q.k }));
    views.sort((a, b) => a.t - b.t);
    views.forEach((k, i) => (k.from = i > 0 ? this.viewSeg(views[i - 1], k.t) : k.v));
    this.views = views;
  }

  viewSeg(k, t) {
    const u = easeInOut((t - k.t) / k.dur);
    const v = {};
    for (const key of KEYS) v[key] = lerp(k.from[key], k.v[key], u);
    v.py += Math.sin(Math.PI * u) * Math.min(2, Math.hypot(k.v.tx - k.from.tx, k.v.tz - k.from.tz) * 0.25);
    return v;
  }

  viewAt(t) {
    let i = 0;
    for (let k = 0; k < this.views.length && this.views[k].t <= t; k++) i = k;
    const k = this.views[i];
    return { ...this.viewSeg(k, t), focus: t >= k.t + k.dur * 0.5 ? k.focus : i > 0 ? this.views[i - 1].focus : k.focus };
  }

  pulse(list, t, life = 0.4) {
    let v = 0;
    for (const e of list) {
      if (e > t) break;
      v = Math.max(v, Math.exp(-(t - e) / life));
    }
    return v;
  }

  update(t, section) {
    const { timing } = this.ctx;
    const kick = timing.pulse(t, 0.12);
    const chorus = section.startsWith("chorus");
    const beat = { kick, bf: timing.beatFloat(t) };
    const view = this.viewAt(t);
    this.view = view;
    this.close = 1 - smooth(9, 15, Math.hypot(view.px - view.tx, view.py - view.ty, view.pz - view.tz));

    this.stations[0].mutual = smooth(this.mutual[0], this.mutual[0] + 0.3, t) * (1 - smooth(this.mutual[1], this.mutual[1] + 0.4, t));
    this.stations[4].fieldOn = smooth(this.field[0], this.field[0] + 0.4, t) * (1 - smooth(this.field[1] - 0.3, this.field[1], t));
    let sizeUp = 0;
    for (const s of this.sizes) sizeUp = Math.max(sizeUp, smooth(s.t0 - 0.05, s.t0 + 0.2, t) * (1 - smooth(s.t1 - 0.3, s.t1, t)));
    this.stations.forEach((s, k) => {
      s.pose(t, beat);
      const hit = this.pulse(this.hits[k], t, 0.3);
      s.group.scale.setScalar(1 + hit * 0.05);
      // Arrows draw over everything, so only the station in front shows them in a close-up.
      const seen = view.focus === k ? 1 : 1 - this.close;
      for (const a of s.arrows) {
        a.mat.opacity *= seen;
        a.ink.opacity *= seen;
        a.group.scale.setScalar(1 + sizeUp * 0.35 * (0.5 + 0.5 * Math.sin(t * 9 + k)));
      }
    });
    const b = this.stations[3].group.position;
    const bev = this.stations[3].locate(t)[0];
    if (bev) this.grounds.ripple(b.x, b.z, bev.t1);
    this.grounds.update(t, timing.pulse(t, 0.22) * (chorus ? 1 : 0.5));

    const pp = this.pollen.geometry.attributes.position;
    const drift = chorus ? 1.6 : 0.7;
    this.pollenSeed.forEach(([x, y, z, s], i) => {
      const u = ((x + 8 + t * s * drift * 0.4) % 16) - 8;
      pp.setXYZ(i, u, 0.3 + y + Math.sin(t * s * 1.3 + i) * 0.3, z + Math.cos(t * 0.5 + i) * 0.2);
    });
    pp.needsUpdate = true;
    this.pollen.material.opacity = (chorus ? 0.85 : 0.55) * (0.8 + 0.2 * kick);

    const push = this.pulse(this.pushes.map((p) => p.t0), t, 0.15);
    const dolly = kick * (chorus ? 0.05 : 0.025) + push * 0.06;
    const sway = Math.sin(t * 0.4) * 0.15;
    this.camera.position.set(lerp(view.px, view.tx, dolly) + sway, lerp(view.py, view.ty, dolly), lerp(view.pz, view.tz, dolly));
    this.camera.lookAt(view.tx + sway * 0.3, view.ty, view.tz);
    this.camera.rotation.z += Math.sin(t * 0.6) * 0.01 + push * Math.sin(t * 60) * 0.01;
    this.camera.fov = view.fov;
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    this.scene.updateMatrixWorld();

    const post = { bloom: [chorus ? 0.6 : 0.45, 0.4, 0.72], ca: 0.08 + kick * (chorus ? 0.3 : 0.15), vignette: 0.38, grain: 0.025 };
    const start = SECTIONS[section];
    if (start !== undefined && t - start < 0.3) post.flash = Math.exp(-(t - start) / 0.1) * 0.35;
    for (const c of this.calls) if (t >= c.t1 && t < c.t1 + 0.25) post.flash = Math.max(post.flash || 0, 0.18 * (1 - (t - c.t1) / 0.25));
    for (const p of this.pushes) if (t >= p.t0 && t < p.t0 + 0.5) post.shock = [0.5, 0.45, (t - p.t0) * 1.3, 0.7];
    this.drawHud(t, section);
    return post;
  }

  screen(k, v) {
    this.tmp.copy(v).applyMatrix4(this.stations[k].group.matrixWorld).project(this.camera);
    return [(this.tmp.x * 0.5 + 0.5) * 1080, (-this.tmp.y * 0.5 + 0.5) * 1920];
  }

  tag(text, x, y, color, a, size = 28) {
    if (a <= 0.02) return;
    const { hud } = this.ctx;
    const ctx = hud.ctx;
    hud.font(size, 800, FONT_COND);
    const w = ctx.measureText(text).width + 26;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = "rgba(10,14,22,0.8)";
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - size * 0.72, w, size * 1.44, 10);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    hud.text(text, x, y + 1, { size, weight: 800, family: FONT_COND, color, alpha: a, tracking: 1 });
  }

  panel(y0, h, a) {
    const ctx = this.ctx.hud.ctx;
    ctx.save();
    ctx.globalAlpha = 0.62 * a;
    ctx.fillStyle = "#0a0e18";
    ctx.beginPath();
    ctx.roundRect(110, y0, 860, h, 26);
    ctx.fill();
    ctx.restore();
  }

  /** Keeps the karaoke readable over the sunny lawn. */
  lyricBand() {
    const ctx = this.ctx.hud.ctx;
    const g = ctx.createLinearGradient(0, 1220, 0, 1600);
    g.addColorStop(0, "rgba(6,10,16,0)");
    g.addColorStop(0.4, "rgba(6,10,16,0.42)");
    g.addColorStop(0.6, "rgba(6,10,16,0.42)");
    g.addColorStop(1, "rgba(6,10,16,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 1220, 1080, 380);
  }

  drawHud(t, section) {
    const { hud } = this.ctx;
    const view = this.view;
    const chorus = section.startsWith("chorus");
    const verse = section.startsWith("verse");
    this.lyricBand();

    // Close-up: name, what the force does, contact or not, and labelled arrows.
    if (view.focus >= 0 && this.close > 0.3) {
      const k = view.focus;
      const f = FORCES[k];
      const a = smooth(0.3, 0.8, this.close);
      const tug = k === 1 && t >= this.tug.t0 - 0.4 && t < this.tug.t1 + 0.4;
      const sizing = this.sizes.some((s) => t >= s.t0 - 0.1 && t < s.t1);
      if (verse && !tug && !sizing) {
        this.panel(TOP_Y - 52, 164, a);
        hud.text(f.name, 540, TOP_Y - 4, { size: 72, weight: 800, family: FONT_COND, color: f.color, alpha: a, glow: 20, tracking: 2 });
        hud.text(f.def, 540, TOP_Y + 50, { size: 28, weight: 700, family: FONT_MONO, color: "#eef2ff", alpha: a * 0.92 });
        hud.text(f.contact ? "CONTACT FORCE" : "NON-CONTACT FORCE", 540, TOP_Y + 88, { size: 22, weight: 700, family: FONT_MONO, color: f.color, alpha: a * 0.9, tracking: 3 });
      }
      if (tug) {
        const bal = t < this.tug.tu;
        this.panel(TOP_Y - 52, 140, a);
        hud.text(bal ? "BALANCED" : "UNBALANCED", 540, TOP_Y - 4, { size: 76, weight: 800, family: FONT_COND, color: bal ? "#7cff6b" : "#ff5d8f", alpha: a, glow: 20, tracking: 3 });
        hud.text(bal ? "equal and opposite: speed stays the same" : "one side wins: it speeds up", 540, TOP_Y + 54, { size: 28, weight: 700, family: FONT_MONO, color: "#eef2ff", alpha: a * 0.92 });
      }
      for (const arrow of this.stations[k].arrows) {
        if (arrow.alpha < 0.3 || !arrow.label) continue;
        const [x, y] = this.screen(k, arrow.labelPoint());
        this.tag(arrow.label, clamp(x, 150, 930), clamp(y, 560, 1190), arrow.color, a * arrow.alpha);
      }
    }

    // Whole park: a name tag under each station, then contact versus non-contact.
    const wide = smooth(0.7, 0.2, this.close);
    if (wide > 0.02) {
      FORCES.forEach((f, k) => {
        const [x, y] = this.screen(k, this.stations[k].label);
        this.tag(f.name, x, clamp(y, 480, 1180), f.color, wide, 26);
        for (const c of this.contact) {
          if (t < c.c || t > c.t1) continue;
          const on = f.contact ? smooth(c.c, c.c + 0.2, t) : smooth(c.n, c.n + 0.2, t);
          const fade = 1 - smooth(c.t1 - 0.3, c.t1, t);
          hud.text(f.contact ? "CONTACT" : "NON-CONTACT", x, clamp(y, 480, 1180) - 48, { size: 26, weight: 700, family: FONT_MONO, color: f.contact ? "#ffffff" : "#ffd23f", alpha: wide * on * fade, tracking: 2, glow: 10 });
        }
      });
    }

    // Chorus: push/pull, the moves, and the call-and-response roll.
    if (chorus) {
      for (const c of this.calls) {
        if (t >= c.t0 && t < c.t1) hud.slam(FORCES[c.k].name, t, c.t0, c.t1 - 0.2, { y: TOP_Y, size: 96, color: FORCES[c.k].color, angle: -0.03 });
        hud.stamp(FORCES[c.k].call, t, c.t1, { x: 540, y: TOP_Y + 10, size: 120, color: FORCES[c.k].color, angle: c.k % 2 ? 0.06 : -0.06, life: 0.7 });
      }
      this.pushes.forEach((p, i) => hud.stamp(p.word, t, p.t0, { x: 540 + (i % 2 ? 150 : -150), y: TOP_Y + 40, size: 110, color: "#ffffff", angle: i % 2 ? 0.08 : -0.08, life: 0.5 }));
      this.moves.forEach((m, i) => hud.stamp(m.word, t, m.t0, { x: 540, y: TOP_Y + 40, size: 104, color: ["#7cff6b", "#ff5d5d", "#3dc8ff"][i % 3], angle: -0.06 + (i % 3) * 0.06, life: 0.45 }));
    }

    for (const s of this.sizes) if (t >= s.t0 && t < s.t1) hud.slam("SIZE + DIRECTION", t, s.t0, s.t1 - 0.2, { y: TOP_Y, size: 92, color: "#ffd23f", sub: "longer arrow = bigger force", angle: -0.03 });

    // Bridge quiz: the question, then the answer from its station.
    if (section === "bridge") {
      for (const q of this.quiz) {
        if (t >= q.q0 && t < q.t0) hud.slam("WHICH ONE?", t, q.q0, q.t0 - 0.1, { y: TOP_Y, size: 100, color: "#ffffff", angle: -0.03 });
        if (t >= q.t0 && t < q.t0 + 1.6) hud.slam(FORCES[q.k].name, t, q.t0, q.t0 + 1.3, { y: TOP_Y, size: 100, color: FORCES[q.k].color, angle: -0.03 });
      }
    }
    const [ti0, ti1] = this.title;
    if (t >= ti0 && t < ti1) hud.text("FORCE FRIENDS", 540, TOP_Y, { size: 96, weight: 800, family: FONT_COND, color: "#ffd23f", alpha: smooth(ti0, ti0 + 0.4, t) * (1 - smooth(ti1 - 0.25, ti1, t)), glow: 24, tracking: 4 });
    for (const f of this.finale) if (t >= f.t0 - 0.05 && t < f.t0 + 0.5) hud.slam(FORCES[f.k].name, t, f.t0, f.t0 + 0.18, { y: TOP_Y, size: 96, color: FORCES[f.k].color, angle: -0.03 });
  }
}
