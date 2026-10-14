import * as THREE from "three";
import { FONT_COND, FONT_MONO, SAFE } from "@gizclaw/mvg-core/hud.js";
import { clamp, easeInOut, easeOutBack, lerp, smooth } from "@gizclaw/mvg-core/timing.js";
import { CHORUSES, DIGIT_COLORS, DIGIT_CUES, DIGIT_WORDS, ORDER, PI_DIGITS, REPLAY_CUES, SECTIONS } from "./constants.js";

// Pi walk: digit d steps one unit toward clock position d of a ten-way dial,
// rising slightly so the finished walk reads as a 3-D sculpture.
const RISE = 0.11;
const dirOf = (d) => {
  const a = Math.PI / 2 - (d * Math.PI * 2) / 10;
  return [Math.cos(a), Math.sin(a)];
};
// Screen row (px from the top) the walk is framed around.
const LIFT = 150;
const DIAL = { x: 175, y: 1135, r: 78 };

export class WalkScene {
  constructor(ctx) {
    this.ctx = ctx;
    const { timing } = ctx;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#03040c");
    this.camera = new THREE.PerspectiveCamera(46, 9 / 16, 0.1, 200);
    this.camera.setViewOffset(1080, 1920, 0, LIFT, 1080, 1920);

    this.digits = [...PI_DIGITS].map(Number);
    this.times = this.digitTimes(timing, DIGIT_CUES);
    this.replay = this.digitTimes(timing, REPLAY_CUES);
    if (this.times.length !== this.digits.length) console.warn(`pi walk: ${this.times.length} sung digits for ${this.digits.length}`);
    this.P = [new THREE.Vector3()];
    for (const d of this.digits) {
      const [dx, dy] = dirOf(d);
      const p = this.P.at(-1);
      this.P.push(new THREE.Vector3(p.x + dx, p.y + dy, p.z + RISE));
    }
    this.buildGrid();
    this.buildPath();
    this.buildStars();
    this.chorusInfo = Object.fromEntries(Object.entries(CHORUSES).map(([name, ci]) => [name, { start: SECTIONS[name], round: timing.cues[ci + 2].start, roundEnd: timing.cues[ci + 2].end, end: SECTIONS[ORDER[ORDER.indexOf(name) + 1]] }]));
    this.places = [14, 22, 30, 38].map((ci, k) => ({ t: timing.cues[ci].start, label: `PLACES ${k * 10 + 11}–${k * 10 + 20}` }));
    this.camTarget = new THREE.Vector3();
  }

  /** Start time of every sung digit word in the given cues, in order. */
  digitTimes(timing, cues) {
    const out = [];
    for (const ci of cues) for (const w of timing.cues[ci].words) if (DIGIT_WORDS.includes(w.clean)) out.push(w.start);
    return out;
  }

  buildGrid() {
    this.gridU = { uTime: { value: 0 }, uGlow: { value: 0 }, uHead: { value: new THREE.Vector2() } };
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(80, 80),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: this.gridU,
        vertexShader: "varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
        fragmentShader: /* glsl */ `
          uniform float uTime, uGlow; uniform vec2 uHead; varying vec2 vP;
          void main() {
            float r = length(vP);
            float a = atan(vP.y, vP.x);
            float dr = abs(fract(r + 0.5) - 0.5);
            float ring = 1.0 - smoothstep(0.0, fwidth(r) * 1.5 + 0.004, dr);
            float da = abs(fract(a / 6.2831853 * 10.0 + 0.25) - 0.5) * 0.6283185 * r;
            float spoke = (1.0 - smoothstep(0.0, fwidth(da) * 1.5 + 0.006, da)) * smoothstep(0.4, 1.0, r);
            vec3 col = vec3(0.25, 0.4, 0.9) * ring * 0.12 + vec3(0.35, 0.5, 1.0) * spoke * 0.07;
            col *= exp(-r * 0.06);
            col += vec3(0.3, 0.45, 1.0) * exp(-length(vP - uHead) * 0.7) * 0.08 * (1.0 + uGlow);
            gl_FragColor = vec4(col, 1.0);
          }`,
        blending: THREE.AdditiveBlending,
      }),
    );
    plane.position.z = -0.6;
    this.scene.add(plane);
  }

  buildPath() {
    const core = new THREE.CylinderGeometry(0.07, 0.07, 1, 16, 1, false).translate(0, 0.5, 0);
    const halo = new THREE.CylinderGeometry(0.18, 0.18, 1, 16, 1, true).translate(0, 0.5, 0);
    const node = new THREE.SphereGeometry(0.11, 24, 16);
    const up = new THREE.Vector3(0, 1, 0);
    this.segs = this.digits.map((d, i) => {
      const a = this.P[i];
      const b = this.P[i + 1];
      const dir = b.clone().sub(a);
      const len = dir.length();
      const q = new THREE.Quaternion().setFromUnitVectors(up, dir.clone().normalize());
      const color = new THREE.Color(DIGIT_COLORS[d]);
      const m = new THREE.Mesh(core, new THREE.MeshBasicMaterial({ color: color.clone() }));
      const h = new THREE.Mesh(halo, new THREE.MeshBasicMaterial({ color: color.clone(), transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }));
      const n = new THREE.Mesh(node, new THREE.MeshBasicMaterial({ color: color.clone().lerp(new THREE.Color("#ffffff"), 0.2).multiplyScalar(0.8) }));
      for (const o of [m, h]) {
        o.position.copy(a);
        o.quaternion.copy(q);
      }
      n.position.copy(b);
      this.scene.add(m, h, n);
      return { m, h, n, len, color, d };
    });
    this.head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 32, 24), new THREE.MeshBasicMaterial({ color: "#dfe6ff" }));
    this.scene.add(this.head);
    this.origin = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.3, 48), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.8 }));
    this.scene.add(this.origin);
  }

  buildStars() {
    const n = 2500;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const r = 30 + Math.random() * 60;
      const a = Math.random() * Math.PI * 2;
      const u = Math.random() * 2 - 1;
      pos.set([Math.sqrt(1 - u * u) * Math.cos(a) * r, Math.sqrt(1 - u * u) * Math.sin(a) * r, u * r], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(geo, new THREE.PointsMaterial({ color: "#9fb4ff", size: 0.12, transparent: true, opacity: 0.6, depthWrite: false }));
    this.scene.add(this.stars);
  }

  /** Number of steps drawn by t, fractional while a step grows. */
  drawn(t) {
    let n = 0;
    for (let i = 0; i < this.times.length; i++) {
      const g = clamp((t - this.times[i]) / 0.16, 0, 1);
      if (g <= 0) break;
      n = i + g;
    }
    return n;
  }

  pointAt(s) {
    const i = clamp(Math.floor(s), 0, this.P.length - 2);
    return this.P[i].clone().lerp(this.P[i + 1], clamp(s - i, 0, 1));
  }

  bounds(n) {
    const box = new THREE.Box3();
    for (let i = 0; i <= Math.min(Math.ceil(n), this.P.length - 1); i++) box.expandByPoint(this.P[i]);
    return box;
  }

  update(t, section) {
    const { timing, hud } = this.ctx;
    const kick = timing.pulse(t, 0.12);
    const ch = this.chorusInfo[section];
    const n = this.drawn(t);
    const headP = this.pointAt(n);

    // Replay: a light runs along the walk, reaching node k as decimal k is sung again.
    let replayS = -1;
    if (section === "outro" || section === "finale") {
      const R = this.replay;
      let k = 0;
      while (k < R.length - 1 && R[k + 1] <= t) k++;
      replayS = t < R[0] ? -1 : k + 1 + clamp((t - R[k]) / 0.25, 0, 1) * (k < R.length - 1 ? 0.9 : 0);
    }
    // Chorus flow: pulses race along everything drawn so far.
    const flowOn = ch ? smooth(ch.start, ch.start + 0.4, t) : section === "finale" ? 1 : 0;
    const bf = timing.beatFloat(t);

    this.segs.forEach((s, i) => {
      const g = clamp((t - this.times[i]) / 0.16, 0, 1);
      const on = g > 0;
      s.m.visible = s.h.visible = on;
      s.n.visible = g >= 1;
      if (!on) return;
      s.m.scale.set(1, s.len * g, 1);
      s.h.scale.set(1 + kick * 0.3, s.len * g, 1 + kick * 0.3);
      const age = t - this.times[i];
      let boost = 1 + 0.9 * Math.exp(-age / 0.35);
      if (flowOn > 0) {
        const phase = ((bf * 2 - i * 0.5) % 6 + 6) % 6;
        boost += flowOn * 0.8 * Math.exp(-phase * 2.2);
      }
      if (replayS >= 0) boost += 1.1 * Math.exp(-Math.abs(i + 1 - replayS) * 1.5) + (i + 1 <= replayS ? 0.2 : 0);
      s.m.material.color.copy(s.color).multiplyScalar(0.62 * boost);
      s.h.material.opacity = 0.05 + 0.06 * (boost - 1);
      const pop = easeOutBack(clamp(age / 0.25, 0, 1));
      s.n.scale.setScalar(pop * (1 + (replayS >= 0 ? 0.8 * Math.exp(-Math.abs(i + 1 - replayS) * 2) : 0)));
    });
    this.head.position.copy(replayS >= 0 ? this.pointAt(replayS) : headP);
    this.head.scale.setScalar(1 + kick * 0.4);
    this.head.visible = t >= this.times[0] - 0.1;
    this.origin.scale.setScalar(1 + kick * 0.3);

    // Camera: follow the head in verses, orbit the whole walk in choruses and the finale.
    const follow = replayS >= 0 ? this.pointAt(replayS) : headP;
    const box = this.bounds(n);
    const centre = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const wide = section === "finale" ? 1 : section === "outro" ? smooth(SECTIONS.outro - 0.2, SECTIONS.outro + 0.8, t) : ch ? smooth(ch.start - 0.2, ch.start + 0.7, t) * (1 - smooth(ch.end - 0.7, ch.end - 0.05, t)) : 0;
    const target = follow.clone().lerp(centre, wide);
    this.camTarget.lerp(target, 1);
    const extent = Math.max(size.x, size.y * 0.75, 4);
    const dist = lerp(13, extent * 1.75 + 7, wide) + (section === "finale" ? smooth(SECTIONS.finale, SECTIONS.end, t) * 2.5 : 0);
    const yaw = Math.sin(t * 0.23) * 0.35 + wide * t * 0.35;
    const pitch = lerp(0.62, 0.95, wide);
    this.camera.position.set(target.x + Math.sin(yaw) * Math.sin(pitch) * dist, target.y - Math.cos(yaw) * Math.sin(pitch) * dist, target.z + Math.cos(pitch) * dist);
    this.camera.up.set(0, 0, 1);
    this.camera.lookAt(target);
    this.camera.fov = 46 - kick * 2;
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    this.gridU.uTime.value = t;
    this.gridU.uGlow.value = kick;
    this.gridU.uHead.value.set(follow.x, follow.y);
    this.stars.rotation.z = t * 0.01;

    const post = { bloom: [0.7, 0.45, 0.62], ca: 0.15 + kick * 0.25, vignette: 0.5 };
    const start = SECTIONS[section];
    if (start !== undefined && t - start < 0.3) post.flash = Math.exp(-(t - start) / 0.1) * 0.45;
    const lastDigit = this.times.findLast((x) => x <= t);
    if (lastDigit !== undefined && t - lastDigit < 0.12) post.flash = Math.max(post.flash || 0, 0.06);

    this.drawHud(t, section, n, replayS, ch, kick);
    return post;
  }

  drawHud(t, section, n, replayS, ch, kick) {
    const { hud } = this.ctx;
    const ctx = hud.ctx;
    const shown = Math.floor(n + 0.001);
    const lit = replayS >= 0 ? Math.floor(replayS) : shown;

    // Ticker: 3. then fifty decimals in groups of five over two rows.
    const y0 = SAFE.top + 30;
    hud.font(44, 700, FONT_MONO);
    const cw = ctx.measureText("0").width;
    const rows = [PI_DIGITS.slice(1, 26), PI_DIGITS.slice(26)];
    const draw = (ch, x, y, k) => {
      const done = k < shown;
      const cur = k === lit - 1 || (replayS < 0 && k === shown - 1);
      ctx.save();
      ctx.font = `700 44px ${FONT_MONO}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.globalAlpha = done ? (cur ? 1 : 0.85) : 0.22;
      ctx.fillStyle = done ? (cur ? DIGIT_COLORS[+ch] : "#e8ecff") : "#6b7399";
      if (cur) {
        ctx.shadowColor = DIGIT_COLORS[+ch];
        ctx.shadowBlur = 22;
        ctx.translate(x, y);
        ctx.scale(1 + kick * 0.25, 1 + kick * 0.25);
        ctx.fillText(done ? ch : "·", 0, 0);
      } else ctx.fillText(done ? ch : "·", x, y);
      ctx.restore();
    };
    const rowW = (25 + 4) * cw;
    const x0 = 540 - rowW / 2 + 70;
    hud.text("π =", x0 - 130, y0, { size: 46, weight: 800, family: FONT_COND, color: "#ffd23f", glow: 12 });
    draw("3", x0 - 56, y0, 0);
    hud.text(".", x0 - 30, y0, { size: 44, weight: 700, family: FONT_MONO, color: "#e8ecff", alpha: shown > 0 ? 1 : 0.3 });
    rows.forEach((row, r) => {
      [...row].forEach((c, j) => {
        const k = 1 + r * 25 + j;
        draw(c, x0 + (j + Math.floor(j / 5)) * cw, y0 + r * 58, k);
      });
    });
    hud.keepout(80, y0 - 30, 1000, y0 + 92);
    const placed = Math.max(0, shown - 1);
    hud.text(`${placed} / 50`, 540, y0 + 128, { size: 30, weight: 700, family: FONT_MONO, color: "#8fa0ff", alpha: shown ? 0.9 : 0 });

    // Direction dial: the current digit's heading.
    const cur = this.digits[Math.max(0, (replayS >= 0 ? Math.floor(replayS) : shown) - 1)];
    const dialOn = smooth(SECTIONS.verse1, SECTIONS.verse1 + 0.6, t) * (section === "finale" ? 1 - smooth(SECTIONS.finale, SECTIONS.finale + 0.5, t) : 1);
    if (dialOn > 0) {
      const { x, y, r } = DIAL;
      hud.keepout(x - r - 30, y - r - 30, x + r + 30, y + r + 30);
      ctx.save();
      ctx.globalAlpha = dialOn;
      ctx.strokeStyle = "rgba(143,160,255,0.5)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
      for (let d = 0; d < 10; d++) {
        const [dx, dy] = dirOf(d);
        const on = d === cur && shown > 0;
        ctx.font = `800 ${on ? 30 : 22}px ${FONT_MONO}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = on ? DIGIT_COLORS[d] : "rgba(200,210,255,0.55)";
        ctx.shadowColor = DIGIT_COLORS[d];
        ctx.shadowBlur = on ? 18 : 0;
        ctx.fillText(String(d), x + dx * (r + 18), y - dy * (r + 18));
      }
      if (shown > 0) {
        const [dx, dy] = dirOf(cur);
        ctx.strokeStyle = DIGIT_COLORS[cur];
        ctx.shadowColor = DIGIT_COLORS[cur];
        ctx.shadowBlur = 16;
        ctx.lineWidth = 6;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + dx * (r - 12), y - dy * (r - 12));
        ctx.stroke();
      }
      ctx.restore();
    }

    // Labels on the newest nodes.
    const v = new THREE.Vector3();
    const labelUntil = replayS >= 0 ? Math.floor(replayS) : shown;
    for (let i = Math.max(0, labelUntil - 6); i < labelUntil; i++) {
      const age = replayS >= 0 ? labelUntil - 1 - i : t - this.times[i];
      const a = replayS >= 0 ? Math.exp(-age * 0.6) : clamp(1 - (shown - 1 - i) * 0.18, 0, 1) * smooth(0, 0.1, age);
      const wideFade = ch ? 1 - smooth(ch.start, ch.start + 0.5, t) * (1 - smooth(ch.end - 0.6, ch.end, t)) : section === "finale" ? 0 : 1;
      if (a * wideFade <= 0.02) continue;
      v.copy(this.P[i + 1]).project(this.camera);
      const sx = (v.x * 0.5 + 0.5) * 1080;
      const sy = (-v.y * 0.5 + 0.5) * 1920;
      if (sy > 1250 || sy < 420) continue;
      hud.text(String(this.digits[i]), sx + 34, sy - 34, { size: 46, weight: 800, family: FONT_COND, color: DIGIT_COLORS[this.digits[i]], alpha: a * wideFade, glow: 16 });
    }

    // Chorus: a unit-diameter circle rolls out one circumference, exactly pi long.
    if (ch && t >= ch.round - 0.1 && t < ch.end - 0.2) {
      const k = easeInOut((t - ch.round) / Math.max(0.6, ch.roundEnd - ch.round));
      const a = smooth(ch.round - 0.1, ch.round + 0.15, t) * (1 - smooth(ch.end - 0.6, ch.end - 0.2, t));
      const D = 170;
      const lx = 540 - (Math.PI * D) / 2;
      const ly = 1150;
      const cx = lx + Math.PI * D * k;
      hud.keepout(lx - 20, ly - D - 20, lx + Math.PI * D + 20, ly + 60);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(lx - 10, ly);
      ctx.lineTo(lx + Math.PI * D + 10, ly);
      ctx.stroke();
      ctx.strokeStyle = "#ffd23f";
      ctx.shadowColor = "#ffd23f";
      ctx.shadowBlur = 16;
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.lineTo(cx, ly);
      ctx.stroke();
      // The circle, with the unrolled part of its rim removed.
      const rot = Math.PI * 2 * k;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(cx, ly - D / 2, D / 2, Math.PI / 2 + rot, Math.PI / 2 + Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.7)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx, ly - D / 2);
      ctx.lineTo(cx + Math.cos(Math.PI / 2 + rot) * (D / 2), ly - D / 2 + Math.sin(Math.PI / 2 + rot) * (D / 2));
      ctx.stroke();
      ctx.restore();
      hud.text("d = 1", cx, ly - D / 2, { size: 26, weight: 700, family: FONT_MONO, color: "#ffffff", alpha: a * (1 - k) });
      hud.text("0", lx, ly + 34, { size: 28, weight: 700, family: FONT_MONO, color: "#ffffff", alpha: a });
      hud.text(k > 0.98 ? "π = 3.14159…" : (Math.PI * k).toFixed(2), lx + Math.PI * D * k, ly + 34, { size: 28, weight: 800, family: FONT_MONO, color: "#ffd23f", alpha: a, glow: 12 });
    }

    for (const p of this.places) hud.slam(p.label, t, p.t, p.t + 1.8, { y: SAFE.top + 260, size: 92, color: "#8fa0ff", angle: -0.03 });
    if (section === "finale") {
      hud.slam("π", t, SECTIONS.finale + 0.1, SECTIONS.end - 0.3, { y: 1110, size: 240, color: "#ffd23f", sub: "50 DECIMALS · ON AND ON", angle: 0 });
    }
  }
}
