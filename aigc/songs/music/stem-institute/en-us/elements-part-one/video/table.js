import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { FONT_COND, FONT_HEAVY, FONT_MONO } from "@gizclaw/mvg-core/hud.js";
import { clamp, easeOutBack, easeOutCubic, hash, lerp, smooth } from "@gizclaw/mvg-core/timing.js";
import { Lab } from "./lab.js";
import { CATEGORY, CHORUSES, ELEMENTS, ELEMENT_CUES, OUTRO, PART_TWO, SECTIONS, shells } from "./constants.js";

// One world unit is one table cell, 48 px on screen; the board centre sits on row 840.
const PX = 48;
const BOARD_Y = (960 - 865) / PX;
const DIST = 960 / PX / Math.tan((15 * Math.PI) / 180);
const tilePos = (period, group) => new THREE.Vector3(group - 9.5, BOARD_Y + 3.5 - period, 0);
const ATOM = new THREE.Vector3((760 - 540) / PX, (960 - 435) / PX, 0);
const CARD = { x: 110, y: 275, w: 310, h: 310 };
const ringR = (n) => 0.75 + n * 0.5;

const BACKDROP = /* glsl */ `
  uniform float uTime, uKick, uSpin, uChorus, uFlash; uniform vec3 uHue; varying vec2 vUv;
  float h21(vec2 p) { return fract(sin(dot(p, vec2(27.1, 113.7))) * 43758.5453); }
  float blob(vec2 p, vec2 c, float r) { vec2 d = (p - c) * vec2(0.5625, 1.0); return exp(-dot(d, d) / (r * r)); }
  void main() {
    // A lab wall of glazed subway tiles, lit by a lamp over the chart.
    vec2 P = vec2(vUv.x * 1080.0, (1.0 - vUv.y) * 1920.0);
    vec2 cell = vec2(P.x / 96.0, P.y / 48.0);
    cell.x += mod(floor(cell.y), 2.0) * 0.5;
    vec2 id = floor(cell);
    vec2 f = fract(cell);
    float grout = 1.0 - smoothstep(0.0, 0.04, min(min(f.x, 1.0 - f.x) * 2.0, min(f.y, 1.0 - f.y)));
    float bevel = smoothstep(0.0, 0.18, f.y) * (1.0 - smoothstep(0.8, 1.0, f.y));
    vec3 tile = vec3(0.62, 0.72, 0.72) * (0.9 + 0.1 * h21(id)) * (0.85 + 0.15 * bevel);
    float light = 0.05 + 0.5 * blob(vUv, vec2(0.5, 0.56), 0.42) + 0.25 * blob(vUv, vec2(0.5, 0.92), 0.3);
    vec3 col = mix(tile, vec3(0.05, 0.06, 0.06), grout) * light;
    col += vec3(1.0) * pow(max(0.0, 1.0 - abs(f.y - 0.25) * 6.0), 3.0) * light * 0.12 * (1.0 - grout);
    col += uHue * uFlash * 0.05;
    col *= 1.0 - 0.6 * smoothstep(0.36, 0.12, vUv.y);
    // Output is sRGB-encoded afterwards, which lifts these darks a lot; keep them low.
    gl_FragColor = vec4(col * 0.12, 1.0);
  }`;

export class TableScene {
  constructor(ctx) {
    this.ctx = ctx;
    const { timing } = ctx;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 9 / 16, 1, 300);
    this.scene.add(new THREE.AmbientLight("#8090b0", 1.2));
    const key = new THREE.DirectionalLight("#ffffff", 2.0);
    key.position.set(-3, 4, 10);
    this.scene.add(key);

    this.bgU = { uTime: { value: 0 }, uKick: { value: 0 }, uSpin: { value: 0 }, uChorus: { value: 0 }, uFlash: { value: 0 }, uHue: { value: new THREE.Color() } };
    const bg = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({ depthTest: false, depthWrite: false, uniforms: this.bgU, vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }", fragmentShader: BACKDROP }),
    );
    bg.renderOrder = -1;
    bg.frustumCulled = false;
    this.scene.add(bg);

    this.board = new THREE.Group();
    this.scene.add(this.board);
    this.buildTiles();
    this.buildAtom();
    this.buildConfetti();
    this.lab = new Lab(this.scene);
    this.buildTimeline(timing);
    this.tmp = new THREE.Vector3();
  }

  buildTiles() {
    this.slots = [...ELEMENTS.map((e) => ({ ...e, ghost: false })), ...PART_TWO.map((p) => ({ period: 6, group: p.group, symbol: p.label, ghost: true }))];
    const n = this.slots.length;
    const geo = new RoundedBoxGeometry(0.9, 0.9, 0.3, 3, 0.1);
    this.state = new Float32Array(n * 4);
    this.tint = new Float32Array(n * 3);
    geo.setAttribute("aState", new THREE.InstancedBufferAttribute(this.state, 4));
    geo.setAttribute("aTint", new THREE.InstancedBufferAttribute(this.tint, 3));
    this.slots.forEach((s, i) => {
      const c = new THREE.Color(s.ghost ? "#556" : CATEGORY[s.category].color);
      this.tint.set([c.r, c.g, c.b], i * 3);
    });
    this.tiles = new THREE.InstancedMesh(
      geo,
      new THREE.ShaderMaterial({
        vertexShader: /* glsl */ `
          attribute vec4 aState; attribute vec3 aTint;
          varying vec3 vN; varying vec2 vUv; varying vec4 vS; varying vec3 vT;
          void main() {
            vUv = uv; vS = aState; vT = aTint;
            mat4 m = modelMatrix * instanceMatrix;
            vec3 n = mat3(m) * normal;
            vN = dot(n, n) > 1e-12 ? normalize(n) : vec3(0.0, 0.0, 1.0);
            gl_Position = projectionMatrix * viewMatrix * m * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          varying vec3 vN; varying vec2 vUv; varying vec4 vS; varying vec3 vT;
          void main() {
            vec3 N = dot(vN, vN) > 1e-8 ? normalize(vN) : vec3(0.0, 0.0, 1.0);
            vec3 L = normalize(vec3(-0.4, 0.6, 0.7));
            float dif = 0.55 + 0.45 * max(dot(N, L), 0.0);
            float face = step(0.6, N.z);
            vec3 dark = mix(vec3(0.05, 0.07, 0.11), vT * 0.18, 0.6);
            vec3 c = mix(dark, vT * (0.75 + vS.y * 0.8), vS.x);
            c = mix(c, vec3(0.08, 0.09, 0.12), vS.w);
            c *= dif;
            vec2 q = vUv - 0.5;
            float box = max(abs(q.x), abs(q.y));
            c += vT * smoothstep(0.38, 0.46, box) * face * (0.25 + vS.z * 1.2) * (1.0 - vS.w);
            c += vec3(1.0) * vS.y * face * 0.25;
            gl_FragColor = vec4(clamp(c, 0.0, 4.0), 1.0);
          }`,
      }),
      n,
    );
    this.tiles.frustumCulled = false;
    this.board.add(this.tiles);
    this.dummy = new THREE.Object3D();
  }

  buildAtom() {
    this.atom = new THREE.Group();
    this.atom.position.copy(ATOM);
    this.scene.add(this.atom);
    this.rings = [];
    for (let n = 1; n <= 6; n++) {
      const pts = Array.from({ length: 97 }, (_, k) => new THREE.Vector3(Math.cos((k / 96) * Math.PI * 2) * ringR(n), Math.sin((k / 96) * Math.PI * 2) * ringR(n), 0));
      const ring = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: "#7fdcff", transparent: true, opacity: 0 }));
      const holder = new THREE.Group();
      holder.add(ring);
      this.atom.add(holder);
      this.rings.push({ holder, ring });
    }
    this.electrons = new THREE.InstancedMesh(new THREE.SphereGeometry(0.24, 14, 10), new THREE.MeshBasicMaterial({ color: "#ffffff" }), 56);
    this.electrons.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(56 * 3), 3);
    this.electrons.frustumCulled = false;
    this.atom.add(this.electrons);
    const nuc = [];
    for (let i = 0; i < 40; i++) {
      const u = hash(i * 1.3) * 2 - 1;
      const a = hash(i * 2.9) * Math.PI * 2;
      const r = Math.cbrt(hash(i * 4.1)) * 0.5;
      nuc.push(new THREE.Vector3(Math.sqrt(1 - u * u) * Math.cos(a) * r, Math.sqrt(1 - u * u) * Math.sin(a) * r, u * r));
    }
    this.nucPts = nuc;
    this.nucleus = new THREE.InstancedMesh(new THREE.SphereGeometry(0.2, 14, 10), new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.4 }), nuc.length);
    this.nucleus.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(nuc.length * 3), 3);
    nuc.forEach((_, i) => this.nucleus.setColorAt(i, new THREE.Color(i % 2 ? "#ff5d5d" : "#8fa0c0")));
    this.atom.add(this.nucleus);
  }

  buildConfetti() {
    const n = 360;
    this.confSeed = Array.from({ length: n }, (_, i) => [hash(i * 1.7) * 24 - 12, hash(i * 2.3), hash(i * 3.9) * 6 - 3, 0.5 + hash(i * 5.1) * 0.8]);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const col = new Float32Array(n * 3);
    const pal = Object.values(CATEGORY).map((c) => new THREE.Color(c.color));
    for (let i = 0; i < n; i++) col.set(pal[i % pal.length].toArray(), i * 3);
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    this.confetti = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.28, vertexColors: true, transparent: true, opacity: 0, depthWrite: false }));
    this.scene.add(this.confetti);
  }

  buildTimeline(timing) {
    const cue = (i) => timing.cues[i];
    const w = (ci, word, n = 0) => timing.wordTime(ci, word, n) ?? cue(ci).start;
    // Each element lights on its sung name, matched in order.
    this.sung = new Array(ELEMENTS.length).fill(null);
    let next = 0;
    for (const ci of ELEMENT_CUES) {
      for (const word of cue(ci).words) {
        if (next < ELEMENTS.length && word.clean === ELEMENTS[next].name.toLowerCase()) this.sung[next++] = word.start;
      }
    }
    for (let i = 0; i < this.sung.length; i++) if (this.sung[i] === null) this.sung[i] = (this.sung[i - 1] ?? SECTIONS.verse1) + 0.4;

    this.bops = [];
    this.hops = [];
    this.rows = [];
    this.ones = [];
    this.shakes = [];
    for (const ci of Object.values(CHORUSES)) {
      this.bops.push(...cue(ci).words.filter((x) => x.clean.startsWith("bop")).map((x) => x.start));
      this.hops.push(...cue(ci + 1).words.filter((x) => x.clean.startsWith("hop")).map((x) => x.start));
      this.rows.push(w(ci + 2, "row"), w(ci + 2, "row", 1));
      this.ones.push([w(ci + 2, "one"), Math.max(w(ci + 2, "one", 1), w(ci + 2, "one") + 0.6)]);
      this.shakes.push([cue(ci + 3).start, cue(ci + 3).end + 0.3]);
    }
    this.periodic = Object.values(CHORUSES).map((ci) => cue(ci).start);
    this.faster = { t0: cue(OUTRO.faster).start, t1: cue(OUTRO.faster).end };
    this.done = { barium: w(OUTRO.done, "barium"), fifty: w(OUTRO.done, "fifty"), done: w(OUTRO.done, "done") };
  }

  /** Element shown on the card: the latest sung, or the outro's quick replay. */
  current(t) {
    const f = this.faster;
    if (t >= f.t0 && t < f.t1 + 0.3) return clamp(Math.floor(((t - f.t0) / (f.t1 - f.t0)) * 56), 0, 55);
    if (t >= f.t1 + 0.3) return 55;
    let k = -1;
    for (let i = 0; i < this.sung.length; i++) if (this.sung[i] <= t) k = i;
    return k;
  }

  update(t, section) {
    const { timing } = this.ctx;
    const kick = timing.pulse(t, 0.12);
    const bf = timing.beatFloat(t);
    const cur = this.current(t);
    this.cur = cur;
    const f = this.faster;

    let shake = 0;
    for (const [a, b] of this.shakes) shake = Math.max(shake, smooth(a - 0.1, a + 0.2, t) * (1 - smooth(b - 0.3, b, t)));
    this.board.rotation.set(-0.16 + Math.sin(bf * Math.PI) * 0.06 * shake, Math.sin(t * 0.35) * 0.06, Math.sin(bf * Math.PI * 2) * 0.035 * shake);
    this.board.position.set(Math.sin(bf * Math.PI * 2) * 0.25 * shake, Math.abs(Math.sin(bf * Math.PI)) * 0.25 * shake, 0);
    const bop = this.bops.reduce((m, e) => Math.max(m, t >= e ? Math.exp(-(t - e) / 0.18) : 0), 0);

    this.slots.forEach((s, i) => {
      const p = tilePos(s.period, s.group);
      let lit = 0;
      let pop = 0;
      let rim = 0;
      if (!s.ghost) {
        const st = this.sung[i];
        lit = smooth(st - 0.03, st + 0.06, t);
        pop = t >= st ? Math.exp(-(t - st) / 0.3) : 0;
        if (t >= f.t0 && t < f.t1 + 0.3) {
          const rt = lerp(f.t0, f.t1, i / 56);
          pop = Math.max(pop, t >= rt ? Math.exp(-(t - rt) / 0.25) : 0);
        }
        for (const r of this.rows) {
          const rt = r + (s.period - 1) * 0.12;
          if (t >= rt) rim = Math.max(rim, Math.exp(-(t - rt) / 0.25));
        }
        for (const [a, b] of this.ones) {
          const ot = lerp(a, b, i / 55);
          if (t >= ot) pop = Math.max(pop, 0.7 * Math.exp(-(t - ot) / 0.2));
        }
        if (i === 55 && t >= this.done.barium) pop = Math.max(pop, 0.6 + 0.4 * kick);
      } else {
        rim = t >= this.done.done ? 0.4 + 0.3 * Math.sin(t * 6 + s.group) : 0;
      }
      if (i === cur) rim = Math.max(rim, 0.8);
      let hop = 0;
      for (const h of this.hops) {
        const ht = h + s.group * 0.025;
        if (t >= ht && t < ht + 0.35) hop = Math.max(hop, Math.sin((Math.PI * (t - ht)) / 0.35));
      }
      this.state.set([lit, Math.max(pop, bop * lit * 0.6), rim, s.ghost ? 1 : 0], i * 4);
      this.dummy.position.set(p.x, p.y + hop * 0.35, pop * 0.8 + hop * 0.4);
      this.dummy.rotation.set(0, 0, 0);
      const appear = s.ghost ? smooth(SECTIONS.verse1, SECTIONS.verse1 + 0.6, t) : smooth(SECTIONS.verse1 + (s.group + s.period) * 0.02, SECTIONS.verse1 + 0.4 + (s.group + s.period) * 0.02, t);
      this.dummy.scale.setScalar(Math.max(0.001, easeOutBack(appear) * (1 + pop * 0.25)));
      this.dummy.updateMatrix();
      this.tiles.setMatrixAt(i, this.dummy.matrix);
    });
    this.tiles.instanceMatrix.needsUpdate = true;
    this.tiles.geometry.attributes.aState.needsUpdate = true;

    // Bohr atom: one electron per proton, shells filled in their real ground-state order.
    const z = cur + 1;
    const sh = shells(Math.max(1, z));
    const atomA = smooth(SECTIONS.verse1, SECTIONS.verse1 + 0.5, t);
    this.atom.rotation.set(0.55 + Math.sin(t * 0.4) * 0.1, Math.sin(t * 0.3) * 0.25, 0);
    this.atom.scale.setScalar(atomA * (1 + kick * 0.03));
    const lastT = cur >= 0 ? (t >= f.t0 ? null : this.sung[cur]) : null;
    const fresh = lastT !== null ? Math.exp(-(t - lastT) / 0.3) : 0;
    let e = 0;
    const color = new THREE.Color();
    const hue = cur >= 0 ? CATEGORY[ELEMENTS[cur].category].color : "#7fdcff";
    for (let n = 0; n < 6; n++) {
      const { holder, ring } = this.rings[n];
      holder.rotation.set(0, 0, t * 0.1 * (n % 2 ? -1 : 1));
      ring.material.opacity = sh[n] > 0 ? 0.55 : 0.0;
      ring.material.color.set(hue);
      for (let k = 0; k < sh[n]; k++) {
        const a = (k / sh[n]) * Math.PI * 2 + bf * (Math.PI / (n + 2)) * (n % 2 ? -1 : 1);
        const isNew = e === z - 1;
        const s = isNew ? 1 + fresh * 0.7 : 1;
        this.dummy.position.set(Math.cos(a) * ringR(n + 1), Math.sin(a) * ringR(n + 1), 0).applyEuler(holder.rotation);
        this.dummy.scale.setScalar(s);
        this.dummy.updateMatrix();
        this.electrons.setMatrixAt(e, this.dummy.matrix);
        this.electrons.setColorAt(e, color.set(isNew ? "#ffffff" : hue).multiplyScalar(isNew ? 1 + fresh * 0.3 : 0.9));
        e++;
      }
    }
    for (; e < 56; e++) {
      this.dummy.scale.setScalar(0.0001);
      this.dummy.updateMatrix();
      this.electrons.setMatrixAt(e, this.dummy.matrix);
    }
    this.electrons.instanceMatrix.needsUpdate = true;
    this.electrons.instanceColor.needsUpdate = true;
    const nucN = clamp(Math.round(4 + z * 0.65), 1, this.nucPts.length);
    const nucScale = 0.6 + Math.cbrt(z) * 0.25;
    this.nucPts.forEach((p, i) => {
      this.dummy.position.copy(p).multiplyScalar(nucScale);
      this.dummy.scale.setScalar(i < nucN ? 1 : 0.0001);
      this.dummy.updateMatrix();
      this.nucleus.setMatrixAt(i, this.dummy.matrix);
    });
    this.nucleus.instanceMatrix.needsUpdate = true;

    const cp = this.confetti.geometry.attributes.position;
    this.confSeed.forEach(([x, y0, zz, sp], i) => cp.setXYZ(i, x + Math.sin(t + i) * 0.3, 20 - ((((y0 * 40 + t * sp * 6) % 40) + 40) % 40), zz));
    cp.needsUpdate = true;
    this.confetti.material.opacity = Math.max(shake, smooth(this.done.done - 0.1, this.done.done + 0.3, t)) * 0.9;

    this.lab.update(t, kick, section.startsWith("chorus") ? 1 : 0);
    this.bgU.uTime.value = t;
    this.bgU.uKick.value = kick;
    // The galop speeds up: the beams turn faster as the song goes on.
    const chorus = section.startsWith("chorus") ? 1 : 0;
    this.bgU.uSpin.value = t * 0.25 + (t * t) / 900 + chorus * bf * 0.4;
    this.bgU.uChorus.value = chorus ? 0.6 + 0.4 * timing.pulse(t, 0.2) : 0;
    this.bgU.uFlash.value = bop;
    const cats = Object.values(CATEGORY);
    this.bgU.uHue.value.set(chorus ? cats[Math.floor(bf) % cats.length].color : hue);

    this.camera.position.set(Math.sin(t * 0.3) * 0.8, Math.cos(t * 0.23) * 0.4, DIST - kick * 0.6);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    this.scene.updateMatrixWorld();

    const post = { bloom: [0.6, 0.4, 0.7], ca: 0.1 + kick * 0.2, vignette: 0.45, grain: 0.025, flash: bop * 0.15 };
    const start = SECTIONS[section];
    if (start !== undefined && t - start < 0.3) post.flash = Math.max(post.flash, Math.exp(-(t - start) / 0.1) * 0.4);
    if (t >= this.done.done && t < this.done.done + 0.3) post.flash = Math.max(post.flash, 0.5 * (1 - (t - this.done.done) / 0.3));
    this.drawHud(t, section, hue, fresh);
    return post;
  }

  screen(v) {
    this.tmp.copy(v).project(this.camera);
    return [(this.tmp.x * 0.5 + 0.5) * 1080, (-this.tmp.y * 0.5 + 0.5) * 1920];
  }

  drawHud(t, section, hue, fresh) {
    const { hud } = this.ctx;
    const ctx = hud.ctx;
    const a = smooth(SECTIONS.verse1, SECTIONS.verse1 + 0.4, t);
    const m = new THREE.Matrix4();

    // Symbols and numbers on every tile.
    this.slots.forEach((s, i) => {
      this.tiles.getMatrixAt(i, m);
      const c = this.screen(new THREE.Vector3(0, 0, 0.16).applyMatrix4(m).applyMatrix4(this.board.matrixWorld));
      const e = this.screen(new THREE.Vector3(0.5, 0, 0.16).applyMatrix4(m).applyMatrix4(this.board.matrixWorld));
      const k = Math.hypot(e[0] - c[0], e[1] - c[1]) / (PX * 0.5);
      if (k < 0.2) return;
      const lit = this.state[i * 4];
      if (s.ghost) {
        hud.text(s.symbol, c[0], c[1], { size: Math.round((s.symbol.length > 3 ? 13 : 16) * k), weight: 700, family: FONT_MONO, color: "#7880a0", alpha: a * 0.8 });
        return;
      }
      const color = lit > 0.5 ? "#0a0c14" : "#8a94b8";
      hud.text(s.symbol, c[0], c[1] + 4 * k, { size: Math.round(24 * k), weight: 800, family: FONT_COND, color, alpha: a });
      hud.text(String(s.z), c[0] - 13 * k, c[1] - 14 * k, { size: Math.round(11 * k), weight: 700, family: FONT_MONO, color, alpha: a * 0.85 });
    });

    // The new element's electron flies from its tile into the atom.
    const cur = this.cur;
    if (cur >= 0 && fresh > 0.05 && t < this.faster.t0) {
      this.tiles.getMatrixAt(cur, m);
      const [sx, sy] = this.screen(new THREE.Vector3(0, 0, 0.2).applyMatrix4(m).applyMatrix4(this.board.matrixWorld));
      const [ax, ay] = this.screen(ATOM);
      const u0 = clamp((t - this.sung[cur]) / 0.4, 0, 1);
      const color = CATEGORY[ELEMENTS[cur].category].color;
      ctx.save();
      for (let k = 0; k < 8; k++) {
        const u = easeOutCubic(clamp(u0 - k * 0.025, 0, 1));
        if (u <= 0 || u >= 1) continue;
        const cx = lerp(lerp(sx, (sx + ax) / 2, u), lerp((sx + ax) / 2, ax, u), u);
        const cy = lerp(lerp(sy, Math.min(sy, ay) - 160, u), lerp(Math.min(sy, ay) - 160, ay, u), u);
        ctx.globalAlpha = (1 - k / 8) * (1 - u * 0.3);
        ctx.fillStyle = k ? color : "#ffffff";
        ctx.shadowColor = color;
        ctx.shadowBlur = 24;
        ctx.beginPath();
        ctx.arc(cx, cy, 11 - k, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // Element card.
    if (cur >= 0) {
      const el = ELEMENTS[cur];
      const cat = CATEGORY[el.category];
      const s = 1 + 0.08 * fresh;
      const { x, y, w, h } = CARD;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(x + w / 2, y + h / 2);
      ctx.scale(s, s);
      ctx.fillStyle = "rgba(8,12,22,0.88)";
      ctx.strokeStyle = cat.color;
      ctx.lineWidth = 6;
      ctx.shadowColor = cat.color;
      ctx.shadowBlur = 24 + fresh * 30;
      ctx.beginPath();
      ctx.roundRect(-w / 2, -h / 2, w, h, 26);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      hud.text(String(el.z), x + 34, y + 44, { size: 46, weight: 800, family: FONT_COND, color: cat.color, align: "left", alpha: a, glow: 10 });
      hud.text(el.symbol, x + w / 2, y + h / 2 + 6, { size: Math.round((el.symbol.length > 1 ? 150 : 170) * s), weight: 800, family: FONT_HEAVY, color: "#ffffff", alpha: a, glow: 20 + fresh * 20 });
      hud.text(el.name.toUpperCase(), x + w / 2, y + h - 42, { size: el.name.length > 9 ? 30 : 36, weight: 800, family: FONT_COND, color: cat.color, alpha: a, tracking: 2 });
      hud.text(`${el.z} / 56`, x + w - 30, y + 40, { size: 22, weight: 700, family: FONT_MONO, color: "#9aa4c8", align: "right", alpha: a });
      hud.text(cat.label, x + w / 2, y + h + 30, { size: 24, weight: 700, family: FONT_MONO, color: cat.color, alpha: a * 0.9, tracking: 2 });
      const sh = shells(el.z).filter((n) => n > 0).join(" · ");
      const [ax, ay] = this.screen(ATOM);
      hud.text(`${sh}   (${el.z} e⁻)`, ax, ay + 205, { size: 24, weight: 700, family: FONT_MONO, color: "#bfe8ff", alpha: a * 0.9 });
    }

    // Progress through part one.
    const done = cur + 1;
    const py = 690;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(110, py - 4, 860, 8);
    ctx.fillStyle = hue;
    ctx.shadowColor = hue;
    ctx.shadowBlur = 12;
    ctx.fillRect(110, py - 4, 860 * (done / 56), 8);
    ctx.restore();
    hud.keepout(110, py - 4, 970, py + 4);

    // Category legend under the board.
    const cats = Object.values(CATEGORY);
    cats.forEach((c, i) => {
      const col = i % 4;
      const row = Math.floor(i / 4);
      const lx = 150 + col * 215;
      const ly = 1060 + row * 38;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = c.color;
      ctx.beginPath();
      ctx.arc(lx - 14, ly, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      hud.text(c.label, lx, ly + 1, { size: 17, weight: 700, family: FONT_MONO, color: c.color, align: "left", alpha: a * 0.85 });
    });

    // Chorus and outro call-outs.
    this.bops.forEach((b, k) => hud.stamp("BOP!", t, b, { x: 300 + (k % 3) * 240, y: 1150, size: 80, color: ["#ff5dc8", "#ffd23f", "#3dff8a"][k % 3], angle: -0.1 + (k % 3) * 0.1, life: 0.5 }));
    this.hops.forEach((h, k) => hud.stamp("HOP!", t, h, { x: 300 + (k % 3) * 240, y: 1150, size: 80, color: ["#3dc2ff", "#ff9d3d", "#b48cff"][k % 3], angle: 0.1 - (k % 3) * 0.1, life: 0.45 }));
    for (const p of this.periodic) if (t >= p && t < p + 2.2) hud.slam("PERI-PERI-PERIODIC!", t, p, p + 1.9, { y: 1150, size: 70, color: "#ffd23f", angle: -0.03 });
    for (const [s0, s1] of this.shakes) if (t >= s0 && t < s1) hud.slam("SHAKE THE TABLE!", t, s0, s1 - 0.25, { y: 1150, size: 74, color: "#ff5dc8", angle: -0.04 });
    if (t >= this.faster.t0 && t < this.faster.t1) hud.slam("FASTER!", t, this.faster.t0, this.faster.t1 - 0.2, { y: 1150, size: 110, color: "#ff5d5d", angle: -0.05 });
    hud.stamp("56", t, this.done.fifty, { x: 270, y: 900, size: 150, color: CATEGORY.alkaline.color, angle: -0.1, life: this.done.done - this.done.fifty });
    if (t >= this.done.done) hud.slam("PART ONE ✓", t, this.done.done, SECTIONS.end - 0.2, { y: 1150, size: 100, color: "#3dff8a", sub: "57 → 118 in part two", angle: -0.03 });
  }
}
