import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { FONT_COND, FONT_HEAVY, FONT_MONO } from "@gizclaw/mvg-core/hud.js";
import { clamp, easeOutBack, easeOutCubic, hash, lerp, smooth } from "@gizclaw/mvg-core/timing.js";
import { Lab } from "./lab.js";
import { CATEGORY, CHORUSES, DONE, ELEMENTS, ELEMENT_CUES, FIRST, MARKERS, PREDICTED, SECTIONS, shells } from "./constants.js";

// One world unit is one table cell, 48 px on screen at z = 0. The board is
// centred on column 515 (clear of the action column); period 1 sits on row 712
// and the f-block rows on 1062 and 1110, above the lyric band.
const PX = 48;
const DIST = 960 / PX / Math.tan((15 * Math.PI) / 180);
const BOARD_X = (515 - 540) / PX;
const rowY = (row) => 712 + (row - 1) * PX + (row > 7 ? 14 : 0);
const tilePos = (row, col) => new THREE.Vector3(col - 9.5 + BOARD_X, (960 - rowY(row)) / PX, 0);
const ATOM = new THREE.Vector3((735 - 540) / PX, (960 - 425) / PX, 0);
const CARD = { x: 90, y: 268, w: 290, h: 290 };
const ringR = (n) => 0.5 + n * 0.46;
const LAST = ELEMENTS.length;
const BAND_Y = 1185;

const BACKDROP = /* glsl */ `
  uniform float uLamp, uFlash; uniform vec3 uHue; varying vec2 vUv;
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
    float light = 0.05 + uLamp * (0.5 * blob(vUv, vec2(0.5, 0.53), 0.42) + 0.25 * blob(vUv, vec2(0.5, 0.92), 0.3));
    vec3 col = mix(tile, vec3(0.05, 0.06, 0.06), grout) * light;
    col += vec3(1.0) * pow(max(0.0, 1.0 - abs(f.y - 0.25) * 6.0), 3.0) * light * 0.12 * (1.0 - grout);
    col += uHue * uFlash * 0.05;
    col *= 1.0 - 0.6 * smoothstep(0.36, 0.12, vUv.y);
    // Output is sRGB-encoded afterwards, which lifts these darks a lot; keep them low.
    gl_FragColor = vec4(col * 0.12, 1.0);
  }`;

const decay = (t, t0, tau) => (t >= t0 ? Math.exp(-(t - t0) / tau) : 0);

export class TableScene {
  constructor(ctx) {
    this.ctx = ctx;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 9 / 16, 1, 300);
    this.scene.add(new THREE.AmbientLight("#8090b0", 1.2));
    const key = new THREE.DirectionalLight("#ffffff", 2.0);
    key.position.set(-3, 4, 10);
    this.scene.add(key);

    this.bgU = { uLamp: { value: 1 }, uFlash: { value: 0 }, uHue: { value: new THREE.Color() } };
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
    this.buildTimeline(ctx.timing);
    this.tmp = new THREE.Vector3();
  }

  buildTiles() {
    this.slots = [
      ...ELEMENTS.map((e) => ({ ...e, row: e.group ? e.period : e.period + 2, col: e.group || 3 + e.z - (e.period === 6 ? 57 : 89) })),
      ...MARKERS.map((m, k) => ({ ...m, row: m.period, col: 3, marker: k })),
    ];
    const n = this.slots.length;
    const geo = new RoundedBoxGeometry(0.9, 0.9, 0.3, 3, 0.1);
    this.state = new Float32Array(n * 4);
    this.tint = new Float32Array(n * 3);
    geo.setAttribute("aState", new THREE.InstancedBufferAttribute(this.state, 4));
    geo.setAttribute("aTint", new THREE.InstancedBufferAttribute(this.tint, 3));
    this.slots.forEach((s, i) => {
      const c = new THREE.Color(CATEGORY[s.category].color);
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
            c *= dif;
            vec2 q = vUv - 0.5;
            float box = max(abs(q.x), abs(q.y));
            c += vT * smoothstep(0.38, 0.46, box) * face * (0.12 + vS.w * 0.13 + vS.z * 1.2);
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
    for (let n = 1; n <= 7; n++) {
      const pts = Array.from({ length: 97 }, (_, k) => new THREE.Vector3(Math.cos((k / 96) * Math.PI * 2) * ringR(n), Math.sin((k / 96) * Math.PI * 2) * ringR(n), 0));
      const ring = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: "#7fdcff", transparent: true, opacity: 0 }));
      const holder = new THREE.Group();
      holder.add(ring);
      this.atom.add(holder);
      this.rings.push({ holder, ring });
    }
    this.electrons = new THREE.InstancedMesh(new THREE.SphereGeometry(0.17, 12, 8), new THREE.MeshBasicMaterial({ color: "#ffffff" }), LAST);
    this.electrons.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(LAST * 3), 3);
    this.electrons.frustumCulled = false;
    this.atom.add(this.electrons);
    const nuc = [];
    for (let i = 0; i < 48; i++) {
      const u = hash(i * 1.3) * 2 - 1;
      const a = hash(i * 2.9) * Math.PI * 2;
      const r = Math.cbrt(hash(i * 4.1)) * 0.5;
      nuc.push(new THREE.Vector3(Math.sqrt(1 - u * u) * Math.cos(a) * r, Math.sqrt(1 - u * u) * Math.sin(a) * r, u * r));
    }
    this.nucPts = nuc;
    this.nucleus = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 12, 8), new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.4 }), nuc.length);
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
    const words = (ci, ...keys) => cue(ci).words.filter((x) => keys.includes(x.clean)).map((x) => x.start);
    // Each element lights on its sung name, matched in order; Part One's are already lit.
    this.sung = new Array(LAST).fill(-Infinity);
    let next = FIRST - 1;
    for (const ci of ELEMENT_CUES) {
      for (const word of cue(ci).words) {
        if (next < LAST && word.clean === ELEMENTS[next].name.toLowerCase()) this.sung[next++] = word.start;
      }
    }
    for (; next < LAST; next++) this.sung[next] = this.sung[next - 1] + 0.4;

    const zs = (lo, hi) => ELEMENTS.filter((e) => e.z >= lo && e.z <= hi).map((e) => e.z);
    const closing = (ci) => ({ t0: cue(ci).start, t1: Math.min(cue(ci).end, cue(ci + 1).start) - 0.1 });
    this.rowsDone = {
      lanthanides: { ...closing(DONE.lanthanides), members: zs(57, 71), title: "LANTHANIDES ✓", color: CATEGORY.lanthanide.color, marker: 0 },
      six: { ...closing(DONE.six), members: ELEMENTS.filter((e) => e.period === 6 && e.group).map((e) => e.z), title: "ROW SIX ✓", color: CATEGORY.transition.color },
      actinides: { ...closing(DONE.actinides), members: zs(89, 103), title: "ACTINIDES ✓", color: CATEGORY.actinide.color, marker: 1 },
    };
    this.hold = { t0: w(DONE.six, "hold"), t1: SECTIONS.chorus2 + 0.25 };
    this.markerT = [this.rowsDone.lanthanides.t0, this.rowsDone.actinides.t0];
    this.choruses = CHORUSES.map(({ cue: ci, row }) => ({
      taps: words(ci, "tap", "table"),
      race: w(ci, "race"),
      row: this.rowsDone[row],
      fifty: w(ci + 1, "fifty"),
      gos: words(ci + 1, "go"),
      climb: [cue(ci + 2).start, cue(ci + 2).end],
      train: cue(ci + 3).words.map((x) => x.start),
    }));
    // Part One replays across "Part two, coming through"; all 118 across the last line.
    this.recaps = [
      { t0: cue(0).start, t1: w(0, "fifty") - 0.15, n: FIRST - 1 },
      { t0: cue(DONE.all).start, t1: w(DONE.all, "done") - 0.1, n: LAST },
    ];
    this.fiftySeven = w(0, "fifty");
    this.start = w(0, "start");
    this.top = { t0: cue(DONE.top).start, t1: cue(DONE.top).end };
    this.ends = w(DONE.ends, "oganesson");
    this.done = w(DONE.all, "done");
  }

  /** Recap pass at t: [progress 0–1, element count], or null. */
  recapAt(t) {
    for (const r of this.recaps) if (t >= r.t0 && t < r.t1 + 0.3) return [clamp((t - r.t0) / (r.t1 - r.t0), 0, 1), r.n];
    return null;
  }

  /** Element shown on the card: the latest sung, or the replay's sweep. */
  current(t) {
    const r = this.recapAt(t);
    if (r) return Math.min(r[1] - 1, Math.floor(r[0] * r[1]));
    let k = FIRST - 2;
    for (let i = FIRST - 1; i < LAST; i++) if (this.sung[i] <= t) k = i;
    return k;
  }

  update(t, section) {
    const { timing } = this.ctx;
    const kick = timing.pulse(t, 0.12);
    const bf = timing.beatFloat(t);
    const cur = this.current(t);
    this.cur = cur;
    const chorus = section.startsWith("chorus") ? 1 : 0;
    const hold = smooth(this.hold.t0 - 0.05, this.hold.t0 + 0.1, t) * (1 - smooth(this.hold.t1 - 0.2, this.hold.t1, t));
    const ch = this.choruses.find((c) => t >= c.taps[0] - 0.5 && t < c.train.at(-1) + 1.5);

    const bounce = chorus * (1 - hold);
    this.board.rotation.set(-0.08 + Math.sin(bf * Math.PI) * 0.03 * bounce, Math.sin(t * 0.35) * 0.04 * (1 - hold), Math.sin(bf * Math.PI * 2) * 0.015 * bounce);
    this.board.position.set(0, Math.abs(Math.sin(bf * Math.PI)) * 0.18 * bounce, 0);

    let train = 0;
    let gos = 0;
    if (ch) {
      for (const x of ch.train) train = Math.max(train, decay(t, x, 0.18));
      for (const g of ch.gos) gos = Math.max(gos, decay(t, g, 0.15));
    }
    const nextZ = cur + 2;
    const allDone = smooth(this.done - 0.05, this.done + 0.3, t);

    this.slots.forEach((s, i) => {
      const p = tilePos(s.row, s.col);
      let lit = 0;
      let pop = 0;
      let rim = 0;
      let hop = 0;
      if (s.marker !== undefined) {
        const mt = this.markerT[s.marker];
        lit = smooth(mt - 0.03, mt + 0.1, t);
        pop = decay(t, mt, 0.3);
      } else if (s.z < FIRST) {
        lit = 0.42 + 0.58 * allDone;
      } else {
        const st = this.sung[s.z - 1];
        lit = smooth(st - 0.03, st + 0.06, t);
        pop = decay(t, st, 0.3);
        if (s.z === nextZ && t > SECTIONS.count) rim = 0.25 + 0.45 * timing.pulse(t, 0.25);
      }
      const z = s.z ?? 0;
      for (const r of this.recaps) {
        if (z && z <= r.n && t >= r.t0) pop = Math.max(pop, 0.8 * decay(t, lerp(r.t0, r.t1, (z - 1) / r.n), 0.25));
      }
      for (const row of Object.values(this.rowsDone)) {
        const k = row.members.indexOf(z);
        if (k >= 0) {
          const rt = row.t0 + k * 0.04;
          pop = Math.max(pop, 0.7 * decay(t, rt, 0.25));
          if (t >= rt && t < row.t1) rim = Math.max(rim, 0.6);
        }
      }
      if (ch) {
        const k = ch.row.members.indexOf(z);
        if (k >= 0) rim = Math.max(rim, decay(t, ch.race + k * 0.035, 0.22));
        const [c0, c1] = ch.climb;
        const sungN = this.sung.filter((x) => x <= c0).length - (FIRST - 1);
        if (z >= FIRST && z < FIRST + sungN) pop = Math.max(pop, 0.7 * decay(t, lerp(c0, c1 - 0.3, (z - FIRST) / Math.max(1, sungN - 1)), 0.2));
        if (z >= FIRST) pop = Math.max(pop, gos * lit * 0.3);
        for (const tap of ch.taps) {
          const ht = tap + Math.hypot(s.col - 9.5, s.row - 5) * 0.025;
          if (t >= ht && t < ht + 0.32) hop = Math.max(hop, Math.sin((Math.PI * (t - ht)) / 0.32));
        }
      }
      if (z === LAST && t >= this.top.t0) rim = Math.max(rim, 0.7 + 0.3 * timing.pulse(t, 0.2));
      if (z === LAST && t >= this.ends) pop = Math.max(pop, 0.5 + 0.3 * kick);
      if (i === cur) rim = Math.max(rim, 0.8);
      rim = Math.max(rim, allDone * (0.35 + 0.25 * Math.sin(t * 5 + (s.col ?? 0) * 0.6 + s.row)));
      this.state.set([lit, pop, rim, s.marker !== undefined ? 1 : 0], i * 4);
      this.dummy.position.set(p.x, p.y + hop * 0.3, pop * 0.8 + hop * 0.5);
      this.dummy.rotation.set(0, 0, 0);
      const d = (s.col + s.row) * 0.02;
      const appear = smooth(SECTIONS.count + d, SECTIONS.count + 0.4 + d, t);
      this.dummy.scale.setScalar(Math.max(0.001, easeOutBack(appear) * (1 + pop * 0.25)));
      this.dummy.updateMatrix();
      this.tiles.setMatrixAt(i, this.dummy.matrix);
    });
    this.tiles.instanceMatrix.needsUpdate = true;
    this.tiles.geometry.attributes.aState.needsUpdate = true;

    // Bohr atom: one electron per proton, in the element's ground-state shells.
    const zc = cur + 1;
    const sh = shells(zc);
    const atomA = smooth(SECTIONS.count, SECTIONS.count + 0.5, t);
    this.atom.rotation.set(0.5 + Math.sin(t * 0.4) * 0.1, Math.sin(t * 0.3) * 0.22, 0);
    this.atom.scale.setScalar(atomA * (1 + kick * 0.03 + train * 0.08));
    const lastT = cur >= FIRST - 1 && !this.recapAt(t) ? this.sung[cur] : null;
    const fresh = lastT !== null ? decay(t, lastT, 0.3) : 0;
    let e = 0;
    const color = new THREE.Color();
    const hue = CATEGORY[ELEMENTS[cur].category].color;
    const spin = 1 + train * 2.5 + chorus * 0.5;
    for (let n = 0; n < 7; n++) {
      const { holder, ring } = this.rings[n];
      const count = sh[n] ?? 0;
      holder.rotation.set(0, 0, t * 0.1 * (n % 2 ? -1 : 1));
      ring.material.opacity = count > 0 ? 0.5 + train * 0.4 : 0;
      ring.material.color.set(hue);
      for (let k = 0; k < count; k++) {
        const a = (k / count) * Math.PI * 2 + bf * spin * (Math.PI / (n + 2)) * (n % 2 ? -1 : 1);
        const isNew = e === zc - 1;
        this.dummy.position.set(Math.cos(a) * ringR(n + 1), Math.sin(a) * ringR(n + 1), 0).applyEuler(holder.rotation);
        this.dummy.scale.setScalar(isNew ? 1 + fresh * 0.8 : 1);
        this.dummy.updateMatrix();
        this.electrons.setMatrixAt(e, this.dummy.matrix);
        this.electrons.setColorAt(e, color.set(isNew ? "#ffffff" : hue).multiplyScalar(isNew ? 1 + fresh * 0.3 : 0.85 + train * 0.3));
        e++;
      }
    }
    for (; e < LAST; e++) {
      this.dummy.scale.setScalar(0.0001);
      this.dummy.updateMatrix();
      this.electrons.setMatrixAt(e, this.dummy.matrix);
    }
    this.electrons.instanceMatrix.needsUpdate = true;
    this.electrons.instanceColor.needsUpdate = true;
    const nucN = clamp(Math.round(6 + zc * 0.36), 1, this.nucPts.length);
    const nucScale = 0.55 + Math.cbrt(zc) * 0.1;
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
    this.confetti.material.opacity = Math.max(chorus * 0.45, allDone * 0.9);

    this.lab.update(t, kick, chorus);
    const bridge = section === "bridge" ? 1 - smooth(this.top.t0 - 0.2, this.top.t0, t) : 0;
    this.bgU.uLamp.value = 1 - bridge * 0.35 + chorus * 0.15 * timing.pulse(t, 0.25);
    this.bgU.uFlash.value = Math.max(train, gos);
    this.bgU.uHue.value.set(hue);

    this.camera.position.set(Math.sin(t * 0.3) * 0.4 * (1 - hold), Math.cos(t * 0.23) * 0.25 * (1 - hold), DIST - kick * 0.4 - hold * 1.2 - bridge * 0.8);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    this.scene.updateMatrixWorld();

    const post = { bloom: [0.6 + chorus * 0.15, 0.4, 0.7], ca: 0.1 + kick * 0.2, vignette: 0.45, grain: 0.025, flash: Math.max(gos * 0.06, train * 0.04) };
    const start = SECTIONS[section];
    if (start !== undefined && t - start < 0.3) post.flash = Math.max(post.flash, Math.exp(-(t - start) / 0.1) * 0.4);
    post.flash = Math.max(post.flash, decay(t, this.start, 0.12) * 0.45, decay(t, this.top.t0, 0.15) * 0.5, decay(t, this.done, 0.12) * 0.5);
    for (const row of Object.values(this.rowsDone)) post.flash = Math.max(post.flash, decay(t, row.t0, 0.12) * 0.3);
    if (t >= this.start && t < this.start + 1) post.shock = [0.19, 1 - 1062 / 1920, (t - this.start) * 1.1, 0.6 * Math.exp(-(t - this.start) / 0.4)];
    this.drawHud(t, hue, fresh, ch);
    return post;
  }

  screen(v) {
    this.tmp.copy(v).project(this.camera);
    return [(this.tmp.x * 0.5 + 0.5) * 1080, (-this.tmp.y * 0.5 + 0.5) * 1920];
  }

  drawHud(t, hue, fresh, ch) {
    const { hud } = this.ctx;
    const ctx = hud.ctx;
    const a = smooth(SECTIONS.count, SECTIONS.count + 0.4, t);
    const m = new THREE.Matrix4();

    // Symbols and numbers on every tile.
    this.slots.forEach((s, i) => {
      this.tiles.getMatrixAt(i, m);
      const c = this.screen(new THREE.Vector3(0, 0, 0.16).applyMatrix4(m).applyMatrix4(this.board.matrixWorld));
      const e = this.screen(new THREE.Vector3(0.5, 0, 0.16).applyMatrix4(m).applyMatrix4(this.board.matrixWorld));
      const k = Math.hypot(e[0] - c[0], e[1] - c[1]) / (PX * 0.5);
      if (k < 0.2) return;
      const lit = this.state[i * 4];
      const color = lit > 0.4 ? "#0a0c14" : "#8a94b8";
      if (s.marker !== undefined) {
        hud.text(s.label, c[0], c[1], { size: Math.round(12 * k), weight: 700, family: FONT_MONO, color: lit > 0.4 ? color : "#7880a0", alpha: a * 0.9 });
        return;
      }
      hud.text(s.symbol, c[0], c[1] + 4 * k, { size: Math.round(24 * k), weight: 800, family: FONT_COND, color, alpha: a });
      hud.text(String(s.z), c[0] - 12 * k, c[1] - 14 * k, { size: Math.round((s.z > 99 ? 9 : 11) * k), weight: 700, family: FONT_MONO, color, alpha: a * 0.85 });
    });

    // The new element's electron flies from its tile into the atom.
    const cur = this.cur;
    if (fresh > 0.05) {
      this.tiles.getMatrixAt(cur, m);
      const [sx, sy] = this.screen(new THREE.Vector3(0, 0, 0.2).applyMatrix4(m).applyMatrix4(this.board.matrixWorld));
      const [ax, ay] = this.screen(ATOM);
      const u0 = clamp((t - this.sung[cur]) / 0.4, 0, 1);
      ctx.save();
      for (let k = 0; k < 8; k++) {
        const u = easeOutCubic(clamp(u0 - k * 0.025, 0, 1));
        if (u <= 0 || u >= 1) continue;
        const cx = lerp(lerp(sx, (sx + ax) / 2, u), lerp((sx + ax) / 2, ax, u), u);
        const cy = lerp(lerp(sy, Math.min(sy, ay) - 160, u), lerp(Math.min(sy, ay) - 160, ay, u), u);
        ctx.globalAlpha = (1 - k / 8) * (1 - u * 0.3);
        ctx.fillStyle = k ? hue : "#ffffff";
        ctx.shadowColor = hue;
        ctx.shadowBlur = 24;
        ctx.beginPath();
        ctx.arc(cx, cy, 11 - k, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // Element card.
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
    hud.text(String(el.z), x + 30, y + 42, { size: 44, weight: 800, family: FONT_COND, color: cat.color, align: "left", alpha: a, glow: 10 });
    hud.text(el.symbol, x + w / 2, y + h / 2 + 6, { size: Math.round((el.symbol.length > 1 ? 140 : 160) * s), weight: 800, family: FONT_HEAVY, color: "#ffffff", alpha: a, glow: 20 + fresh * 20 });
    hud.text(el.name.toUpperCase(), x + w / 2, y + h - 40, { size: el.name.length > 11 ? 26 : el.name.length > 9 ? 30 : 36, weight: 800, family: FONT_COND, color: cat.color, alpha: a, tracking: 2 });
    hud.text(`${el.z} / 118`, x + w - 26, y + 38, { size: 21, weight: 700, family: FONT_MONO, color: "#9aa4c8", align: "right", alpha: a });
    hud.text(cat.label, x + w / 2, y + h + 28, { size: 22, weight: 700, family: FONT_MONO, color: cat.color, alpha: a * 0.9, tracking: 2 });
    const [ax, ay] = this.screen(ATOM);
    const tail = el.z >= PREDICTED ? ", predicted" : "";
    hud.text(`${shells(el.z).join("·")}  (${el.z} e⁻${tail})`, ax, ay + 205, { size: 21, weight: 700, family: FONT_MONO, color: "#bfe8ff", alpha: a * 0.9 });

    // Progress through part two.
    const done = clamp(cur + 2 - FIRST, 0, LAST - FIRST + 1) / (LAST - FIRST + 1);
    const py = 670;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.fillRect(110, py - 4, 810, 8);
    ctx.fillStyle = hue;
    ctx.shadowColor = hue;
    ctx.shadowBlur = 12;
    ctx.fillRect(110, py - 4, 810 * done, 8);
    ctx.restore();
    hud.keepout(110, py - 4, 920, py + 4);

    // Call-outs in the band between the chart and the lyrics.
    hud.stamp("57", t, this.fiftySeven, { x: 515, y: BAND_Y - 20, size: 76, color: CATEGORY.lanthanide.color, angle: -0.08, life: this.start - this.fiftySeven + 0.4 });
    for (const row of Object.values(this.rowsDone)) if (t >= row.t0 && t < row.t1 + 0.2) hud.slam(row.title, t, row.t0, row.t1, { y: BAND_Y, size: 72, color: row.color, angle: -0.03 });
    if (ch) {
      hud.stamp("57", t, ch.fifty, { x: 515, y: BAND_Y - 20, size: 76, color: CATEGORY.lanthanide.color, angle: -0.08, life: ch.gos[0] - ch.fifty });
      ch.gos.forEach((g, k) => hud.stamp("GO!", t, g, { x: 300 + k * 215, y: BAND_Y - 20, size: 72, color: ["#3dff8a", "#ffd23f", "#ff5d5d"][k % 3], angle: -0.1 + k * 0.1, life: 0.55 }));
      const [c0, c1] = ch.climb;
      if (t >= c0 && t < c1 + 0.3) {
        const top = this.sung.filter((x) => x <= c0).length;
        const n = Math.round(lerp(FIRST, top, easeOutCubic((t - c0) / (c1 - c0 - 0.3))));
        const fade = smooth(c0, c0 + 0.15, t) * (1 - smooth(c1, c1 + 0.3, t));
        hud.text(String(n), 515, BAND_Y - 10, { size: 96, weight: 800, family: FONT_COND, color: "#ffffff", alpha: fade, glow: 24 });
      }
    }
    hud.stamp("118", t, this.top.t0, { x: 515, y: 880, size: 200, color: CATEGORY.noble.color, angle: -0.08, life: this.top.t1 - this.top.t0 + 0.4 });
    if (t >= this.done) hud.slam("ALL 118 ✓", t, this.done, SECTIONS.end - 0.2, { y: BAND_Y, size: 84, color: "#3dff8a", angle: -0.03 });
  }
}
