import * as THREE from "three";
import { FONT_COND } from "@gizclaw/mvg-core/hud.js";
import { clamp, easeInOut, hash, lerp, smooth } from "@gizclaw/mvg-core/timing.js";
import { BRIDGE, CHORUSES, COLORS, ELEVEN_CUE, INSTRUMENTS, NAMES, NAMES_CUE, ORDER, OUTRO_CUES, SECTIONS, TRACE_CUE, VERSE_LINES } from "./constants.js";

// World units: the camera frames 1 unit as about 217 px; the stage centre sits
// 220 px above the screen centre.
const PX = 217;
const HERO = new THREE.Vector3(0, 1.0, 0);
const toWorldY = (py) => (960 - py) / PX;
const UP = new THREE.Vector3(0, 1, 0);

/** Regular n-gon of unit circumradius with a flat bottom edge. */
function vertices(n) {
  const a0 = -Math.PI / 2 + Math.PI / n;
  return Array.from({ length: n }, (_, k) => new THREE.Vector3(Math.cos(a0 + (2 * Math.PI * k) / n), Math.sin(a0 + (2 * Math.PI * k) / n), 0));
}

class Polygon {
  constructor(n, color, { ghost = false } = {}) {
    this.n = n;
    this.color = new THREE.Color(color);
    this.verts = vertices(n);
    this.group = new THREE.Group();
    const shape = new THREE.Shape(this.verts.map((v) => new THREE.Vector2(v.x, v.y)));
    this.fill = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color: this.color, transparent: true, opacity: 0, depthWrite: false }));
    this.group.add(this.fill);
    const core = new THREE.CylinderGeometry(0.05, 0.05, 1, 12).translate(0, 0.5, 0);
    const halo = new THREE.CylinderGeometry(0.15, 0.15, 1, 12, 1, true).translate(0, 0.5, 0);
    const dot = new THREE.SphereGeometry(0.095, 20, 14);
    this.edges = this.verts.map((a, k) => {
      const b = this.verts[(k + 1) % n];
      const dir = b.clone().sub(a);
      const q = new THREE.Quaternion().setFromUnitVectors(UP, dir.clone().normalize());
      const m = new THREE.Mesh(core, new THREE.MeshBasicMaterial({ color: this.color.clone() }));
      const h = new THREE.Mesh(halo, new THREE.MeshBasicMaterial({ color: this.color.clone(), transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false }));
      for (const o of [m, h]) {
        o.position.copy(a);
        o.quaternion.copy(q);
      }
      const v = new THREE.Mesh(dot, new THREE.MeshBasicMaterial({ color: "#ffffff" }));
      v.position.copy(a);
      this.group.add(m, h, v);
      return { m, h, v, len: dir.length() };
    });
    this.ghost = ghost;
  }

  /** drawn: edges completed (fractional), glow: brightness boost, fill: face opacity. */
  set({ drawn = this.n, glow = 0, fill = 0.16, dash = 0, dots = 1 }) {
    this.edges.forEach((e, k) => {
      const g = clamp(drawn - k, 0, 1);
      e.m.visible = e.h.visible = g > 0;
      e.v.visible = drawn > k - 0.001 && drawn > 0;
      const len = e.len * g;
      const dashed = dash > 0 ? (Math.floor(k * 3 + 0.5) % 2 ? 0.55 : 1) : 1;
      e.m.scale.set(1, len * dashed, 1);
      e.h.scale.set(1 + glow * 0.4, len * dashed, 1 + glow * 0.4);
      e.m.material.color.copy(this.color).multiplyScalar(0.7 + glow * 0.55);
      e.h.material.opacity = 0.07 + glow * 0.14;
      e.v.scale.setScalar(k < drawn ? (1 + glow * 0.4) * dots : 0);
    });
    this.fill.material.opacity = fill * clamp(drawn - this.n + 1, 0, 1);
  }

  vertexWorld(k) {
    return this.verts[k % this.n].clone().applyMatrix4(this.group.matrixWorld);
  }
}

export class PartyScene {
  constructor(ctx) {
    this.ctx = ctx;
    const { timing } = ctx;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(35, 9 / 16, 0.1, 100);
    this.buildBackdrop();
    this.buildBunting();
    this.buildConfetti();

    const cue = (i) => timing.cues[i];
    const w = (ci, word) => timing.wordTime(ci, word) ?? cue(ci).start;
    this.lines = VERSE_LINES.map(([ci, n, word], i) => {
      const next = VERSE_LINES[i + 1];
      const start = cue(ci).start;
      const drawEnd = Math.max(start + 0.9, cue(ci).end - 0.15);
      const join = next && next[0] === ci + 1 ? cue(next[0]).start - 0.05 : cue(ci).end + 0.35;
      return { n, start, drawEnd, name: w(ci, word), join };
    });
    this.polys = Object.fromEntries(this.lines.map((l) => [l.n, new Polygon(l.n, COLORS[l.n])]));
    for (const p of Object.values(this.polys)) this.scene.add(p.group);
    this.eleven = new Polygon(11, COLORS[11], { ghost: true });
    this.scene.add(this.eleven.group);
    this.elevenCue = { start: cue(ELEVEN_CUE).start, end: cue(ELEVEN_CUE).end };
    this.names = { start: cue(NAMES_CUE).start, end: cue(TRACE_CUE).start };
    this.trace = { start: cue(TRACE_CUE).start, end: cue(TRACE_CUE).end };

    this.choruses = Object.fromEntries(Object.entries(CHORUSES).map(([name, ci]) => [name, {
      start: SECTIONS[name],
      end: SECTIONS[ORDER[ORDER.indexOf(name) + 1]],
      howMany: cue(ci + 1).start,
      closed: cue(ci + 2).start,
      feet: cue(ci + 3).start,
      feetEnd: cue(ci + 3).end,
    }]));
    const nOf = { triangle: 3, quadrilateral: 4, pentagon: 5, hexagon: 6, heptagon: 7, octagon: 8, nonagon: 9, decagon: 10, dodecagon: 12 };
    this.roll = BRIDGE.flatMap(([ci, words]) => words.map((word) => ({ n: nOf[word], t: w(ci, word) })));
    this.checkOnce = timing.wordTime(26, "check") ?? cue(26).end - 0.8;
    this.outro = { start: cue(OUTRO_CUES[0]).start, landed: timing.wordTime(OUTRO_CUES[1], "landed") ?? cue(OUTRO_CUES[1]).end - 0.6 };
    this.tmp = new THREE.Vector3();
  }

  buildBackdrop() {
    this.bgU = { uTime: { value: 0 }, uKick: { value: 0 }, uHue: { value: new THREE.Color("#ff3d5a") } };
    const bg = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        depthTest: false,
        depthWrite: false,
        uniforms: this.bgU,
        vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
        fragmentShader: /* glsl */ `
          uniform float uTime, uKick; uniform vec3 uHue; varying vec2 vUv;
          void main() {
            vec2 p = (vUv - vec2(0.5, 0.6)) * vec2(0.5625, 1.0);
            vec3 col = mix(vec3(0.05, 0.01, 0.07), vec3(0.16, 0.02, 0.14), smoothstep(-0.6, 0.5, p.y));
            // Two warm stage lights sweeping behind the dancers.
            for (int i = 0; i < 2; i++) {
              float fi = float(i);
              vec2 c = vec2(sin(uTime * 0.6 + fi * 3.1) * 0.22, 0.05 + 0.05 * cos(uTime * 0.8 + fi));
              col += mix(vec3(1.0, 0.25, 0.45), vec3(1.0, 0.55, 0.15), fi) * exp(-length(p - c) * 5.0) * (0.11 + uKick * 0.08);
            }
            col += uHue * exp(-length(p) * 4.0) * 0.09;
            // Dance floor: perspective tiles below the stage line.
            if (vUv.y < 0.3) {
              float d = (0.3 - vUv.y);
              vec2 f = vec2((vUv.x - 0.5) / (d + 0.05), 1.0 / (d + 0.05) + uTime * 0.6);
              vec2 g = abs(fract(f * 0.5) - 0.5);
              float tile = step(0.0, (g.x - 0.25) * (g.y - 0.25));
              col += mix(vec3(0.9, 0.2, 0.6), vec3(1.0, 0.6, 0.2), tile) * 0.06 * smoothstep(0.0, 0.25, d) * (1.0 + uKick);
            }
            gl_FragColor = vec4(col, 1.0);
          }`,
      }),
    );
    bg.renderOrder = -1;
    bg.frustumCulled = false;
    this.scene.add(bg);
  }

  // Papel picado: a string of triangular flags across the top of the frame.
  buildBunting() {
    this.flags = [];
    const tri = new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute([-0.18, 0, 0, 0.18, 0, 0, 0, -0.34, 0], 3));
    const pal = Object.values(COLORS).filter((c) => c !== "#8a8aa0");
    for (let i = 0; i < 15; i++) {
      const m = new THREE.Mesh(tri, new THREE.MeshBasicMaterial({ color: new THREE.Color(pal[i % pal.length]).multiplyScalar(0.8), side: THREE.DoubleSide }));
      this.scene.add(m);
      this.flags.push(m);
    }
    this.string = new THREE.Line(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 40 }, () => new THREE.Vector3())), new THREE.LineBasicMaterial({ color: "#ffe0f0", transparent: true, opacity: 0.6 }));
    this.scene.add(this.string);
  }

  buildConfetti() {
    const n = 500;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const pal = Object.values(COLORS).map((c) => new THREE.Color(c));
    this.confettiSeed = [];
    for (let i = 0; i < n; i++) {
      this.confettiSeed.push([hash(i * 1.7) * 6 - 3, hash(i * 2.3), hash(i * 3.9) * 4 - 3, 0.4 + hash(i * 5.1) * 0.6]);
      const c = pal[i % pal.length];
      col.set([c.r, c.g, c.b], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    this.confetti = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.07, vertexColors: true, transparent: true, opacity: 0.8, depthWrite: false }));
    this.scene.add(this.confetti);
  }

  /** Polygons that have joined the party by t, in side order. */
  members(t) {
    return this.lines.filter((l) => t >= l.join - 0.4).map((l) => l.n);
  }

  gridSlot(idx, count) {
    const cols = 3;
    const rows = Math.ceil(count / cols);
    const r = Math.floor(idx / cols);
    const inRow = Math.min(cols, count - r * cols);
    const c = idx % cols;
    const ys = [toWorldY(500), toWorldY(760), toWorldY(1020)];
    const y = rows === 1 ? toWorldY(760) : rows === 2 ? [toWorldY(600), toWorldY(940)][r] : ys[r];
    return new THREE.Vector3((c - (inRow - 1) / 2) * 1.62, y, 0);
  }

  update(t, section) {
    const { timing, hud } = this.ctx;
    const kick = timing.pulse(t, 0.12);
    const bf = timing.beatFloat(t);
    const ch = this.choruses[section];
    const members = this.members(t);
    const hop = Math.abs(Math.sin(Math.PI * bf)) * 0.12;

    const wGrid = ch
      ? smooth(ch.start - 0.1, ch.start + 0.5, t) * (1 - smooth(ch.end - 0.5, ch.end, t))
      : section === "bridge" ? smooth(SECTIONS.bridge - 0.1, SECTIONS.bridge + 0.5, t)
      : section === "verse2" ? smooth(this.names.start - 0.2, this.names.start + 0.4, t) * (1 - smooth(this.trace.end, this.trace.end + 0.6, t))
      : 0;
    const wNest = section === "outro" ? smooth(SECTIONS.outro - 0.1, SECTIONS.outro + 1.0, t) : 0;
    const feet = ch && t >= ch.feet ? smooth(ch.feet, ch.feet + 0.3, t) * (1 - smooth(ch.end - 0.4, ch.end, t)) : 0;

    for (const line of this.lines) {
      const p = this.polys[line.n];
      const g = p.group;
      const visible = t >= line.start - 0.05;
      g.visible = visible;
      if (!visible) continue;
      const idx = members.indexOf(line.n);
      const count = Math.max(members.length, 1);

      // Placement: orbit ring in verses, grid "side by side", nested mandala in the outro.
      const ringA = (idx / count) * Math.PI * 2 + t * 0.35;
      const ring = new THREE.Vector3(HERO.x + Math.cos(ringA) * 1.95, HERO.y + Math.sin(ringA) * 2.3 + hop, -0.5);
      const grid = this.gridSlot(Math.max(idx, 0), count).add(new THREE.Vector3(0, hop * (idx % 2 ? 1 : -1) * 0.6, 0));
      const nestScale = 0.36 + (line.n - 3) * 0.125;
      let pos = ring.clone().lerp(grid, wGrid).lerp(HERO, wNest);
      let scale = lerp(lerp(0.3, 0.56, wGrid), nestScale, wNest);
      let rotZ = lerp(Math.sin(t * 1.3 + line.n) * 0.25, 0, wGrid) + wNest * t * 0.25 * (line.n % 2 ? 1 : -1);
      let rotY = feet * Math.PI * 2 * easeInOut(bf % 1) * (line.n % 2 ? 1 : -1);

      // Hero: drawn edge by edge at centre stage while its verse line plays.
      let hero = idx < 0 ? 1 : smooth(line.start - 0.05, line.start + 0.2, t) * (1 - smooth(line.join - 0.35, line.join + 0.1, t));
      for (const r of this.roll) if (r.n === line.n) hero = Math.max(hero, smooth(r.t - 0.08, r.t + 0.08, t) * (1 - smooth(r.t + 0.4, r.t + 0.7, t)));
      pos = pos.lerp(HERO, hero);
      scale = lerp(scale, 1.38 * (1 + kick * 0.04), hero);
      rotZ = lerp(rotZ, 0, hero);
      g.position.copy(pos);
      g.scale.setScalar(scale);
      g.rotation.set(0, rotY, rotZ);

      const drawn = t < line.drawEnd ? clamp((t - line.start) / (line.drawEnd - line.start), 0, 1) * line.n : line.n;
      let glow = Math.exp(-Math.max(0, t - line.name) / 0.3) * (t >= line.name ? 1 : 0) + kick * 0.25;
      if (ch && t >= ch.closed && t < ch.feet) glow += Math.exp(-(((bf * 2 - idx) % count + count) % count) * 1.2);
      if (section === "bridge" && t >= this.checkOnce) glow += 0.6 * kick + 0.4;
      p.set({ drawn, glow: glow * (1 - wNest * 0.7), fill: (0.12 + hero * 0.06) * (1 - wNest), dots: 1 - wNest * 0.65 });
      g.renderOrder = hero > 0.5 ? 2 : 1;
    }

    // Eleven waits outside: a grey dashed hendecagon at the edge of the stage.
    const e = this.elevenCue;
    const eOn = smooth(e.start - 0.1, e.start + 0.3, t) * (1 - smooth(e.end - 0.1, e.end + 0.5, t));
    this.eleven.group.visible = eOn > 0;
    if (eOn > 0) {
      this.eleven.group.position.set(lerp(3.4, 1.55, eOn), HERO.y - 0.3 + Math.sin(t * 9) * 0.02, 0.2);
      this.eleven.group.scale.setScalar(0.85);
      this.eleven.group.rotation.set(0, 0, Math.sin(t * 2) * 0.1);
      this.eleven.set({ drawn: 11, glow: 0, fill: 0.06, dash: 1 });
    }

    // Bunting and confetti.
    const sway = Math.sin(t * 2.1) * 0.06 + kick * 0.04;
    const pts = [];
    for (let i = 0; i < 40; i++) {
      const x = -3.1 + (6.2 * i) / 39;
      pts.push(new THREE.Vector3(x, 3.75 - 0.35 * (1 - (x / 3.1) ** 2) + sway * (1 - (x / 3.1) ** 2), 0.5));
    }
    this.string.geometry.setFromPoints(pts);
    this.flags.forEach((f, i) => {
      const x = -2.9 + (5.8 * i) / 14;
      const y = 3.75 - 0.35 * (1 - (x / 3.1) ** 2) + sway * (1 - (x / 3.1) ** 2);
      f.position.set(x, y, 0.5);
      f.rotation.set(Math.sin(t * 3 + i) * 0.4, 0, Math.sin(t * 2.4 + i * 0.7) * 0.12);
    });
    const cp = this.confetti.geometry.attributes.position;
    const rate = ch ? 1.6 : section === "outro" ? 1.2 : 0.5;
    this.confettiSeed.forEach(([x, y0, z, sp], i) => {
      const y = 4.5 - (((y0 * 9 + t * sp * rate) % 9) + 9) % 9;
      cp.setXYZ(i, x + Math.sin(t * 1.7 + i) * 0.15, y, z);
    });
    cp.needsUpdate = true;
    this.confetti.material.opacity = ch ? 0.9 : 0.45;

    const heroLine = this.lines.findLast((l) => t >= l.start - 0.05 && t < l.join);
    this.bgU.uTime.value = t;
    this.bgU.uKick.value = kick;
    if (heroLine) this.bgU.uHue.value.set(COLORS[heroLine.n]);

    this.camera.position.set(Math.sin(t * 0.3) * 0.6, HERO.y * 0.2, 14 - kick * 0.25);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    this.scene.updateMatrixWorld();

    const post = { bloom: [0.6, 0.4, 0.68], ca: 0.15 + kick * 0.3, vignette: 0.5 };
    if (feet) post.mirror = 2;
    const start = SECTIONS[section];
    if (start !== undefined && t - start < 0.3) post.flash = Math.exp(-(t - start) / 0.1) * 0.5;
    for (const l of this.lines) if (t >= l.name && t < l.name + 0.12) post.flash = Math.max(post.flash || 0, 0.18);

    this.drawHud(t, section, ch, members, heroLine, wGrid);
    return post;
  }

  screen(v) {
    this.tmp.copy(v).project(this.camera);
    return [(this.tmp.x * 0.5 + 0.5) * 1080, (-this.tmp.y * 0.5 + 0.5) * 1920];
  }

  drawHud(t, section, ch, members, heroLine, wGrid) {
    const { hud, timing } = this.ctx;
    // Corner counter on the hero polygon: each vertex numbered as its edge lands.
    if (heroLine) {
      const p = this.polys[heroLine.n];
      const drawn = t < heroLine.drawEnd ? clamp((t - heroLine.start) / (heroLine.drawEnd - heroLine.start), 0, 1) * heroLine.n : heroLine.n;
      const fade = 1 - smooth(heroLine.join - 0.4, heroLine.join, t);
      const c = this.screen(p.group.position);
      for (let k = 0; k < Math.floor(drawn + 1e-6); k++) {
        const v = this.screen(p.vertexWorld(k + 1));
        const dx = v[0] - c[0];
        const dy = v[1] - c[1];
        const l = Math.hypot(dx, dy) || 1;
        hud.text(String(k + 1), v[0] + (dx / l) * 44, v[1] + (dy / l) * 44, { size: 38, weight: 800, family: FONT_COND, color: "#ffffff", alpha: fade, glow: 14 });
      }
      const n = heroLine.n;
      const sub = `${n} SIDES · ${n} CORNERS${INSTRUMENTS[n] ? " · " + INSTRUMENTS[n] : ""}`;
      hud.slam(NAMES[n], t, heroLine.name, heroLine.join - 0.2, { y: 1110, size: NAMES[n].length > 9 ? 104 : 124, color: COLORS[n], sub, angle: -0.04 });
    }
    const e = this.elevenCue;
    if (t >= e.start && t < e.end + 0.3) {
      hud.stamp("NOT IN THIS ROLL", t, e.start + 0.4, { x: 600, y: 1130, size: 72, color: "#8a8aa0", angle: -0.06, life: e.end - e.start });
      const c = this.screen(this.eleven.group.position);
      hud.text("11?", c[0], c[1], { size: 64, weight: 800, family: FONT_COND, color: "#c0c0d0", alpha: 0.9 });
    }

    // Grid captions: names, then side counts.
    if (wGrid > 0.5) {
      const names = section === "verse2" && t >= this.names.start && t < this.trace.end;
      const counting = ch && t >= ch.howMany && t < ch.closed;
      members.forEach((n, i) => {
        const g = this.polys[n].group;
        const c = this.screen(g.position);
        const radius = g.scale.x * PX;
        if (names || section === "bridge") hud.text(NAMES[n], c[0], c[1] + radius + 28, { size: 30, weight: 800, family: FONT_COND, color: COLORS[n], alpha: wGrid, glow: 10 });
        if (counting) {
          const at = ch.howMany + i * timing.period * 0.5;
          const a = smooth(at, at + 0.1, t);
          if (a > 0) hud.text(String(n), c[0], c[1], { size: 76, weight: 800, family: FONT_COND, color: "#ffffff", alpha: a, glow: 18 });
        }
      });
      // Trace: a spark runs each boundary in reading order.
      if (section === "verse2" && t >= this.trace.start && t < this.trace.end) {
        const span = (this.trace.end - this.trace.start) / members.length;
        const i = Math.min(members.length - 1, Math.floor((t - this.trace.start) / span));
        const k = ((t - this.trace.start) / span - i) * members[i];
        const p = this.polys[members[i]];
        const a = p.vertexWorld(Math.floor(k));
        const b = p.vertexWorld(Math.floor(k) + 1);
        const s = this.screen(a.lerp(b, k % 1));
        const ctx = hud.ctx;
        ctx.save();
        ctx.fillStyle = "#ffffff";
        ctx.shadowColor = COLORS[members[i]];
        ctx.shadowBlur = 30;
        ctx.beginPath();
        ctx.arc(s[0], s[1], 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
    if (ch) hud.stamp("HOW MANY?", t, ch.howMany, { x: 540, y: 330 + 70, size: 90, color: "#ffd23f", angle: -0.06, life: 0.9 });
    if (section === "outro") hud.slam("POLYGON PARTY", t, this.outro.landed, SECTIONS.end - 0.2, { y: 1110, size: 120, color: "#ffd23f", sub: "3 · 4 · 5 · 6 · 7 · 8 · 9 · 10 · 12", angle: -0.03 });
  }
}
