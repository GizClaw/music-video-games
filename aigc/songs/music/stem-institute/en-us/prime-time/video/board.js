import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { FONT_COND, FONT_MONO, SAFE } from "@gizclaw/mvg-core/hud.js";
import { clamp, easeInOut, easeOutBack, lerp, smooth } from "@gizclaw/mvg-core/timing.js";
import { BRIDGE_CUES, CHORUSES, FOUR_CUE, GOLD, ONE_CUE, ORDER, PRIME_CUES, RULE_CUE, SCORE_CUE, SECTIONS, isPrime, numberWord } from "./constants.js";

// One unit per tile; the camera frames 80 px per unit with the board centred
// on screen row 755.
const PX = 80;
const BOARD_Y = (960 - 755) / PX;
const DIST = 960 / PX / Math.tan((15 * Math.PI) / 180);

const gridPos = (k) => new THREE.Vector3(((k - 1) % 10) - 4.5, BOARD_Y + 4.5 - Math.floor((k - 1) / 10), 0);

/** Ulam spiral position of k (1 at the centre), centred on the board. */
function spiralPos(k) {
  let x = 0;
  let y = 0;
  let n = 1;
  let step = 1;
  const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  let d = 0;
  while (n < k) {
    for (let rep = 0; rep < 2 && n < k; rep++) {
      for (let s = 0; s < step && n < k; s++) {
        x += dirs[d][0];
        y += dirs[d][1];
        n++;
      }
      d = (d + 1) % 4;
    }
    step++;
  }
  return new THREE.Vector3(x - 0.5, BOARD_Y + y + 0.5, 0);
}

export class BoardScene {
  constructor(ctx) {
    this.ctx = ctx;
    const { timing } = ctx;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 9 / 16, 1, 200);
    this.buildBackdrop();
    this.buildTiles();
    this.buildMarquee();

    const cue = (i) => timing.cues[i];
    const sung = (cues) => {
      const out = new Map();
      for (const ci of cues) for (const w of cue(ci).words) {
        const n = numberWord(w.clean);
        if (n !== null && isPrime(n) && !out.has(n)) out.set(n, w.start);
      }
      return out;
    };
    this.lit = sung(PRIME_CUES);
    this.bridgeLit = sung(BRIDGE_CUES);
    // Sieve sweeps: 2 and 3 in the first chorus, 5 and 7 in the second.
    const c1 = CHORUSES.chorus1;
    const c2 = CHORUSES.chorus2;
    this.sweeps = [[2, cue(c1).start], [3, cue(c1 + 1).start], [5, cue(c2).start], [7, cue(c2 + 1).start]];
    this.crossAt = new Map();
    for (const [p, t0] of this.sweeps) {
      for (let m = 2 * p, j = 0; m <= 100; m += p, j++) if (!this.crossAt.has(m)) this.crossAt.set(m, t0 + 0.15 + j * 0.035);
    }
    const rw = (word, n = 0) => timing.wordTime(RULE_CUE, word, n);
    this.rule = { start: cue(RULE_CUE).start, one: rw("one") ?? cue(RULE_CUE).start + 2, itself: rw("itself") ?? cue(RULE_CUE).start + 3, end: cue(RULE_CUE).end };
    this.one = { start: cue(ONE_CUE).start, end: cue(ONE_CUE).end };
    const fw = (word, n = 0) => timing.wordTime(FOUR_CUE, word, n);
    this.four = { start: cue(FOUR_CUE).start, end: cue(FOUR_CUE).end, chips: [fw("one"), fw("two"), fw("four", 1)].map((x, i) => x ?? cue(FOUR_CUE).start + 1 + i * 0.5) };
    this.choruses = Object.fromEntries(Object.entries(CHORUSES).map(([name, ci]) => [name, { start: SECTIONS[name], end: SECTIONS[ORDER[ORDER.indexOf(name) + 1]], check: cue(ci + 3).start }]));
    this.score = timing.wordTime(SCORE_CUE, "twenty") ?? cue(SCORE_CUE).start;
    this.buzzer = cue(SCORE_CUE - 1).start;
    this.tmp = new THREE.Vector3();
  }

  buildBackdrop() {
    this.bgU = { uTime: { value: 0 }, uKick: { value: 0 }, uWin: { value: 0 } };
    const bg = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        depthTest: false,
        depthWrite: false,
        uniforms: this.bgU,
        vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
        fragmentShader: /* glsl */ `
          uniform float uTime, uKick, uWin; varying vec2 vUv;
          void main() {
            vec2 p = (vUv - vec2(0.5, 0.59)) * vec2(0.5625, 1.0);
            float a = atan(p.y, p.x);
            float r = length(p);
            float rays = smoothstep(0.2, 0.8, 0.5 + 0.5 * sin(a * 16.0 + uTime * 0.4));
            vec3 base = mix(vec3(0.03, 0.02, 0.09), vec3(0.1, 0.04, 0.2), rays * smoothstep(0.75, 0.05, r));
            base += mix(vec3(0.25, 0.1, 0.5), vec3(0.9, 0.6, 0.15), uWin) * exp(-r * 3.2) * (0.25 + uKick * 0.15);
            gl_FragColor = vec4(base, 1.0);
          }`,
      }),
    );
    bg.renderOrder = -1;
    bg.frustumCulled = false;
    this.scene.add(bg);
  }

  buildTiles() {
    const geo = new RoundedBoxGeometry(0.9, 0.9, 0.26, 3, 0.1);
    this.state = new Float32Array(100 * 4);
    geo.setAttribute("aState", new THREE.InstancedBufferAttribute(this.state, 4));
    this.tileU = { uGold: { value: new THREE.Color(GOLD) } };
    this.tiles = new THREE.InstancedMesh(
      geo,
      new THREE.ShaderMaterial({
        uniforms: this.tileU,
        vertexShader: /* glsl */ `
          attribute vec4 aState;
          varying vec3 vN; varying vec2 vUv; varying vec4 vS;
          void main() {
            vUv = uv; vS = aState;
            mat4 m = modelMatrix * instanceMatrix;
            vec3 n = mat3(m) * normal;
            vN = dot(n, n) > 1e-12 ? normalize(n) : vec3(0.0, 0.0, 1.0);
            gl_Position = projectionMatrix * viewMatrix * m * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uGold;
          varying vec3 vN; varying vec2 vUv; varying vec4 vS;
          void main() {
            vec3 N = dot(vN, vN) > 1e-8 ? normalize(vN) : vec3(0.0, 0.0, 1.0);
            vec3 L = normalize(vec3(-0.4, 0.6, 0.7));
            float dif = 0.5 + 0.5 * max(dot(N, L), 0.0);
            vec3 c = mix(vec3(0.06, 0.08, 0.2), vec3(0.18, 0.04, 0.08), vS.y);
            c = mix(c, uGold * (1.05 + vS.w * 0.9), vS.x);
            c *= dif;
            float face = step(0.6, N.z);
            vec2 q = vUv - 0.5;
            float box = max(abs(q.x), abs(q.y));
            c += vec3(0.85, 0.92, 1.0) * smoothstep(0.36, 0.45, box) * vS.z * face * 0.55;
            float xx = max(1.0 - smoothstep(0.0, 0.03, abs(q.x - q.y)), 1.0 - smoothstep(0.0, 0.03, abs(q.x + q.y))) * step(box, 0.33);
            c = mix(c, vec3(0.7, 0.16, 0.24), xx * vS.y * face * 0.85);
            c += vec3(1.0) * pow(max(dot(reflect(-L, N), vec3(0.0, 0.0, 1.0)), 0.0), 24.0) * 0.18;
            c = clamp(c, 0.0, 4.0);
            gl_FragColor = vec4(c, 1.0);
          }`,
      }),
      100,
    );
    this.tiles.frustumCulled = false;
    this.scene.add(this.tiles);
    this.dummy = new THREE.Object3D();
  }

  buildMarquee() {
    this.bulbs = [];
    const w = 10.6;
    const h = 10.6;
    const per = 18;
    for (let side = 0; side < 4; side++) {
      for (let i = 0; i < per; i++) {
        const s = i / per;
        const p = [[-w / 2 + s * w, h / 2], [w / 2, h / 2 - s * h], [w / 2 - s * w, -h / 2], [-w / 2, -h / 2 + s * h]][side];
        this.bulbs.push(new THREE.Vector3(p[0], BOARD_Y + p[1], 0.1));
      }
    }
    this.marquee = new THREE.InstancedMesh(new THREE.SphereGeometry(0.11, 14, 10), new THREE.MeshBasicMaterial({ color: "#ffffff" }), this.bulbs.length);
    this.marquee.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.bulbs.length * 3), 3);
    const d = new THREE.Object3D();
    this.bulbs.forEach((p, i) => {
      d.position.copy(p);
      d.updateMatrix();
      this.marquee.setMatrixAt(i, d.matrix);
    });
    this.marquee.frustumCulled = false;
    this.scene.add(this.marquee);
    this.frame = new THREE.Mesh(
      new THREE.PlaneGeometry(10.9, 10.9),
      new THREE.MeshBasicMaterial({ color: "#120a28" }),
    );
    this.frame.position.set(0, BOARD_Y, -0.3);
    this.scene.add(this.frame);
  }

  litAmount(n, t, section) {
    const a = this.lit.get(n);
    let v = a !== undefined ? smooth(a - 0.02, a + 0.08, t) : 0;
    if (section === "bridge" || section === "outro") {
      const b = this.bridgeLit.get(n);
      v = b !== undefined ? Math.max(0.35, smooth(b - 0.02, b + 0.08, t)) : v;
    }
    return v;
  }

  update(t, section) {
    const { timing } = this.ctx;
    const kick = timing.pulse(t, 0.12);
    const bf = timing.beatFloat(t);
    const ch = this.choruses[section];

    // Board flips in during the rule line; tiles fly into an Ulam spiral in the bridge.
    const flipStart = SECTIONS.rules;
    const spiral = section === "bridge" ? smooth(SECTIONS.bridge, SECTIONS.bridge + 1.2, t) : section === "outro" ? 1 - smooth(SECTIONS.outro, SECTIONS.outro + 1.0, t) : 0;
    const sieveStarted = t >= this.sweeps[0][1];
    let litCount = 0;
    for (let k = 1; k <= 100; k++) {
      const i = k - 1;
      const row = Math.floor(i / 10);
      const col = i % 10;
      const flip = easeOutBack(clamp((t - flipStart - (row + col) * 0.04) / 0.45, 0, 1));
      const g = gridPos(k);
      const s = spiralPos(k);
      const stagger = clamp(spiral * 1.6 - (k / 100) * 0.6, 0, 1);
      const pos = g.clone().lerp(s, easeInOut(stagger));
      const lit = this.litAmount(k, t, section);
      if (lit > 0.5) litCount++;
      const ca = this.crossAt.get(k);
      let crossed = ca !== undefined ? smooth(ca, ca + 0.12, t) : 0;
      if (k === 1) crossed = smooth(this.one.start, this.one.start + 0.3, t) * 0.7;
      const candidate = sieveStarted && isPrime(k) && lit < 0.5 ? 1 : 0;
      const litAt = (section === "bridge" || section === "outro") && this.bridgeLit.has(k) ? this.bridgeLit.get(k) : this.lit.get(k);
      let pop = litAt !== undefined && t >= litAt ? Math.exp(-(t - litAt) / 0.25) : 0;
      if (ch && t >= ch.check && isPrime(k)) pop = Math.max(pop, Math.exp(-((((bf * 2 - (row + col) * 0.5) % 6) + 6) % 6) * 1.4));
      if (section === "chorus3" && isPrime(k)) pop = Math.max(pop, 0.35 * Math.exp(-((((bf - (row + col) * 0.25) % 2) + 2) % 2) * 2));
      if (section === "outro" && t >= this.score && isPrime(k)) pop = Math.max(pop, 0.5 + 0.5 * kick);
      this.state.set([lit, crossed, candidate, pop], i * 4);
      // Verse 3 presents the 1 and then the 4: the tile flies out in front of the board.
      const shown = k === 1 ? this.present(this.one, t) : k === 4 ? this.present(this.four, t) : 0;
      this.dummy.position.copy(pos);
      this.dummy.position.z = pop * 0.5 + (lit > 0.5 ? 0.08 : 0);
      this.dummy.position.lerp(new THREE.Vector3(0, BOARD_Y + 1.2, 9), easeInOut(shown));
      this.dummy.rotation.set(0, (1 - flip) * Math.PI + Math.sin(t * 2) * 0.15 * shown, 0);
      this.dummy.scale.setScalar(Math.max(0.001, (t >= flipStart ? 1 : 0) * (1 + pop * 0.12) * lerp(1, 2.2, shown)));
      this.dummy.updateMatrix();
      this.tiles.setMatrixAt(i, this.dummy.matrix);
    }
    this.tiles.instanceMatrix.needsUpdate = true;
    this.tiles.geometry.attributes.aState.needsUpdate = true;
    this.litCount = litCount;

    // Marquee: a chase that doubles in the choruses.
    const speed = ch ? 4 : 2;
    const color = new THREE.Color();
    this.bulbs.forEach((_, i) => {
      const on = Math.floor(bf * speed + i) % 3 === 0;
      color.set(on ? "#ffe6a8" : "#3a2a10").multiplyScalar(on ? 1 + kick * 0.6 : 1);
      this.marquee.setColorAt(i, color);
    });
    this.marquee.instanceColor.needsUpdate = true;
    this.marquee.visible = this.frame.visible = t >= flipStart;
    this.frame.scale.setScalar(smooth(flipStart, flipStart + 0.6, t));

    const kickDist = DIST - kick * 0.3;
    this.camera.position.set(Math.sin(t * 0.25) * 0.8, -0.8, kickDist);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    this.scene.updateMatrixWorld();
    this.bgU.uTime.value = t;
    this.bgU.uKick.value = kick;
    this.bgU.uWin.value = section === "outro" ? smooth(this.score, this.score + 0.4, t) : 0;

    const post = { bloom: [0.6, 0.45, 0.7], ca: 0.12 + kick * 0.25, vignette: 0.5 };
    const start = SECTIONS[section];
    if (start !== undefined && t - start < 0.3) post.flash = Math.exp(-(t - start) / 0.1) * 0.45;
    for (const [, t0] of this.sweeps) if (t >= t0 && t < t0 + 0.12) post.flash = Math.max(post.flash || 0, 0.25);
    if (section === "outro" && t >= this.buzzer && t < this.buzzer + 0.15) post.flash = Math.max(post.flash || 0, 0.5);

    this.drawHud(t, section);
    return post;
  }

  screen(v) {
    this.tmp.copy(v).project(this.camera);
    return [(this.tmp.x * 0.5 + 0.5) * 1080, (-this.tmp.y * 0.5 + 0.5) * 1920];
  }

  tileScreen(k) {
    const m = new THREE.Matrix4();
    this.tiles.getMatrixAt(k - 1, m);
    const c = this.screen(new THREE.Vector3(0, 0, 0.14).applyMatrix4(m));
    const e = this.screen(new THREE.Vector3(0.5, 0, 0.14).applyMatrix4(m));
    return [c[0], c[1], Math.hypot(e[0] - c[0], e[1] - c[1]) / (PX * 0.5)];
  }

  chip(text, x, y, color, a) {
    if (a <= 0) return;
    const { hud } = this.ctx;
    const ctx = hud.ctx;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = "rgba(10,8,30,0.85)";
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.shadowColor = color;
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.roundRect(x - 48, y - 38, 96, 76, 18);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    hud.text(text, x, y + 2, { size: 48, weight: 800, family: FONT_COND, color, alpha: a });
  }

  present(span, t) {
    return smooth(span.start - 0.1, span.start + 0.4, t) * (1 - smooth(span.end, span.end + 0.4, t));
  }

  drawHud(t, section) {
    const { hud, timing } = this.ctx;
    if (t < SECTIONS.rules) return;
    // Numbers on every tile.
    for (let k = 1; k <= 100; k++) {
      const [x, y, scale] = this.tileScreen(k);
      if (y < 300 || y > 1240 || x < 20 || x > 1060) continue;
      const s = this.state.subarray((k - 1) * 4, k * 4);
      const big = scale > 1.4;
      const color = big ? "#ffffff" : s[0] > 0.5 ? "#2a1400" : s[1] > 0.5 ? "#6a3848" : s[2] > 0.5 ? "#ffffff" : "#8f9ccc";
      hud.text(String(k), x, y, { size: Math.round(32 * scale), glow: big ? 20 : 0, weight: 800, family: FONT_COND, color, alpha: smooth(SECTIONS.rules + 0.3, SECTIONS.rules + 0.8, t) });
    }

    // Clock and score above the board.
    const ctx = hud.ctx;
    const cx = 150;
    const cy = SAFE.top + 30;
    ctx.save();
    ctx.strokeStyle = GOLD;
    ctx.lineWidth = 4;
    ctx.shadowColor = GOLD;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(cx, cy, 26, 0, Math.PI * 2);
    ctx.stroke();
    const tick = Math.floor(timing.beatFloat(t)) % 12;
    const ang = (tick / 12) * Math.PI * 2 - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(ang) * 20, cy + Math.sin(ang) * 20);
    ctx.stroke();
    ctx.restore();
    hud.keepout(cx - 30, cy - 30, cx + 30, cy + 30);
    hud.text("PRIME TIME", cx + 48, cy, { size: 34, weight: 800, family: FONT_COND, color: GOLD, align: "left", glow: 12 });
    hud.text(`PRIMES ${String(this.litCount).padStart(2, " ")} / 25`, 1080 - 150, cy, { size: 32, weight: 700, family: FONT_MONO, color: "#ffffff", align: "right", glow: 10 });

    // The rule, shown on 7: exactly two factors, 1 and itself.
    const r = this.rule;
    if (t >= r.start && t < r.end + 0.4) {
      const fade = 1 - smooth(r.end, r.end + 0.4, t);
      const [x, y] = this.tileScreen(7);
      this.chip("1", x - 110, y + 100, "#7fe8ff", smooth(r.one, r.one + 0.15, t) * fade);
      this.chip("7", x + 110, y + 100, GOLD, smooth(r.itself, r.itself + 0.15, t) * fade);
      hud.text("× ", x, y + 102, { size: 44, weight: 800, family: FONT_COND, color: "#ffffff", alpha: smooth(r.itself, r.itself + 0.15, t) * fade });
    }
    if (t >= this.one.start && t < this.one.end + 0.3) {
      const [x, y] = this.tileScreen(1);
      hud.stamp("NOT PRIME", t, this.one.start + 0.3, { x: 540, y: y + 250, size: 96, color: "#ff5d7a", angle: -0.08, life: this.one.end - this.one.start });
      this.chip("1", x, y + 135, "#7fe8ff", smooth(this.one.start + 0.6, this.one.start + 0.8, t));
    }
    if (t >= this.four.start && t < this.four.end + 0.3) {
      const [x, y] = this.tileScreen(4);
      ["1", "2", "4"].forEach((c, i) => this.chip(c, x - 130 + i * 130, y + 135, "#7fe8ff", smooth(this.four.chips[i], this.four.chips[i] + 0.15, t)));
      hud.stamp("COMPOSITE", t, this.four.chips[2] + 0.1, { x: 540, y: y + 250, size: 96, color: "#ff8a3d", angle: -0.06, life: this.four.end - this.four.chips[2] + 0.2 });
    }
    // Sieve call-outs.
    for (const [p, t0] of this.sweeps) hud.stamp(`×${p}`, t, t0, { x: 540, y: 790, size: 220, color: "#ff5d7a", angle: -0.08, life: 0.7 });
    if (section === "bridge") hud.slam("ULAM SPIRAL", t, SECTIONS.bridge + 0.3, SECTIONS.bridge + 2.6, { y: 790, size: 110, color: GOLD, sub: "primes line up on diagonals" });
    if (section === "outro") {
      hud.stamp("BUZZ!", t, this.buzzer, { x: 540, y: 600, size: 150, color: GOLD, angle: -0.1, life: 0.8 });
      hud.slam("25 PRIMES", t, this.score, SECTIONS.end - 0.2, { y: 790, size: 170, color: GOLD, sub: "below one hundred", angle: -0.04 });
    }
  }
}
