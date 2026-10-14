import * as THREE from "three";
import { makeRibbon } from "@gizclaw/mvg-core/fx.js";
import { clamp, easeOutBack, hash, smooth } from "@gizclaw/mvg-core/timing.js";
import { FONT_COND } from "@gizclaw/mvg-core/hud.js";
import { BitRow, NES, NES_CYCLE, VoxelText, glyphPixels } from "./voxel.js";
import { CHORUS_CUES, SECTIONS, countEvents } from "./constants.js";

const COLS = 12;
const ROWS = 20;
const CELL = 0.62;
const RAIN = 140;

const CAMS = [
  { pos: [0, 0, 9.5], look: [0, 0, 0], roll: 0 },
  { pos: [-3.2, 0.8, 8.4], look: [0.4, 0, 0], roll: -0.06 },
  { pos: [3.2, -0.6, 8.4], look: [-0.4, 0, 0], roll: 0.06 },
  { pos: [0, -2.4, 8.2], look: [0, 0.6, 0], roll: 0 },
];

function digitTexture(ch, color) {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const g = c.getContext("2d");
  const { pixels } = glyphPixels(ch);
  g.fillStyle = color;
  for (const [x, y] of pixels) g.fillRect(12 + x * 8, 4 + y * 8, 7, 7);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class ArcadeScene {
  constructor(ctx) {
    this.ctx = ctx;
    const { timing } = ctx;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#05061a");
    this.camera = new THREE.PerspectiveCamera(55, 9 / 16, 0.1, 100);

    this.buildWall();
    this.buildRain();
    this.ones = new VoxelText({ cell: 0.42 });
    this.zeros = new VoxelText({ cell: 0.42 });
    this.ones.mesh.position.set(-1.1, 0.75, 1.5);
    this.zeros.mesh.position.set(1.1, 0.75, 1.5);
    this.scene.add(this.ones.mesh, this.zeros.mesh);
    this.buildStairs();
    this.row = new BitRow({ size: 0.62, gap: 0.12 });
    this.row.group.position.set(0, 2.15, 2);
    this.scene.add(this.row.group);
    this.beep = makeRibbon({
      segments: 400,
      width: 0.05,
      color: NES.green,
      uniforms: { uAmp: { value: 0.5 } },
      path: `float x = (u - 0.5) * 9.0; float s = sign(sin(x * 3.0)); return vec3(x, s * uAmp + 3.2, 1.0);`,
    });
    this.scene.add(this.beep);

    this.choruses = {};
    for (const [name, ci] of Object.entries(CHORUS_CUES)) {
      const c = (k) => timing.cues[ci + k];
      const start = SECTIONS[name];
      const end = { chorus1: SECTIONS.verse2, chorus2: SECTIONS.bridge, chorus3: SECTIONS.outro }[name];
      const beeps = [0, 1].map((n) => timing.wordTime(ci, "beep", n));
      const one = timing.wordTime(ci + 1, "one");
      const zero = timing.wordTime(ci + 1, "zero");
      const sb = timing.beatIndexAt(c(2).start) + 0;
      const stairs = [0, 1, 2, 3].map((k) => timing.beatTime(sb + k));
      // Per-beat counting through the chorus, double-time on "count along".
      const b0 = timing.beatIndexAt(start + 0.01);
      const fastFrom = c(3).start;
      const times = [];
      const values = [];
      let v = 0;
      for (let i = b0; timing.beatTime(i) < end - 0.05; i++) {
        const bt = timing.beatTime(i);
        times.push(bt);
        values.push(v++ % 16);
        if (bt >= fastFrom - 0.1) {
          times.push((bt + timing.beatTime(i + 1)) / 2);
          values.push(v++ % 16);
        }
      }
      this.choruses[name] = { start, end, beeps, one, zero, stairs, line2: c(1).start, line3: c(2).start, line4: c(3).start, events: countEvents(times, values) };
    }
  }

  buildWall() {
    const geo = new THREE.PlaneGeometry(CELL * 0.86, CELL * 0.86);
    this.wall = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: "#ffffff" }), COLS * ROWS);
    this.wall.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(COLS * ROWS * 3), 3);
    const d = new THREE.Object3D();
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        d.position.set((c - (COLS - 1) / 2) * CELL, (r - (ROWS - 1) / 2) * CELL, -4);
        d.updateMatrix();
        this.wall.setMatrixAt(r * COLS + c, d.matrix);
      }
    }
    this.scene.add(this.wall);
    this.color = new THREE.Color();
  }

  buildRain() {
    this.rain = ["1", "0"].map((ch, k) => {
      const m = new THREE.InstancedMesh(
        new THREE.PlaneGeometry(0.34, 0.34),
        new THREE.MeshBasicMaterial({ map: digitTexture(ch, k ? NES.blue : NES.yellow), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
        RAIN,
      );
      m.frustumCulled = false;
      this.scene.add(m);
      return m;
    });
    this.dummy = new THREE.Object3D();
  }

  buildStairs() {
    this.stairs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), new THREE.MeshBasicMaterial({ color: "#ffffff" }), 15);
    this.stairs.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(15 * 3), 3);
    this.stairs.frustumCulled = false;
    this.scene.add(this.stairs);
  }

  update(t, section) {
    const { timing, hud } = this.ctx;
    const ch = this.choruses[section];
    const kick = timing.pulse(t, 0.12);
    const bf = timing.beatFloat(t);
    const spec = timing.spectrum(t);

    // LED wall: each column a spectrum band, lit from the bottom.
    for (let c = 0; c < COLS; c++) {
      const level = Math.pow(spec[Math.min(31, 2 + c * 2)], 1.6) * ROWS * 1.1 + kick * 2;
      for (let r = 0; r < ROWS; r++) {
        const on = r < level;
        const col = NES_CYCLE[Math.floor(r / 4) % NES_CYCLE.length];
        this.color.set(on ? col : "#141a3a").multiplyScalar(on ? 0.42 + (r < level - 1 ? 0 : 0.4) : 0.55);
        this.wall.setColorAt(r * COLS + c, this.color);
      }
    }
    this.wall.instanceColor.needsUpdate = true;

    // Falling bits.
    this.rain.forEach((m, k) => {
      for (let i = 0; i < RAIN; i++) {
        const s = i * 2 + k;
        const x = (hash(s * 1.7) - 0.5) * 9;
        const speed = 1.5 + hash(s * 3.1) * 3;
        const y = 7 - ((((t * speed + hash(s * 5.3) * 14) % 14) + 14) % 14);
        const z = -3 + hash(s * 7.9) * 4;
        this.dummy.position.set(x, y, z);
        this.dummy.scale.setScalar(0.7 + hash(s * 2.3) * 0.8 + kick * 0.2);
        this.dummy.rotation.set(0, 0, 0);
        this.dummy.updateMatrix();
        m.setMatrixAt(i, this.dummy.matrix);
      }
      m.instanceMatrix.needsUpdate = true;
      m.material.opacity = 0.5 + kick * 0.4;
    });

    // "One and zero!" slam in, then burst when the next line starts.
    const burst = Math.max(0, t - ch.line3);
    for (const [vt, txt, seed] of [[ch.one, "1", 3], [ch.zero, "0", 7]]) {
      const m = txt === "1" ? this.ones : this.zeros;
      if (vt === null || t < vt - 0.05 || burst > 0.8) {
        m.mesh.visible = false;
        continue;
      }
      m.mesh.visible = true;
      m.update(txt, t, vt - 0.05, { colors: [txt === "1" ? NES.yellow : NES.blue], brightness: 1.6, explode: burst * 2.2, seed });
    }

    // "Double the place": columns of 1, 2, 4, 8 blocks pop on consecutive beats.
    let n = 0;
    const showStairs = t >= ch.line3 - 0.05 && t < ch.line4 + 0.4;
    if (showStairs) {
      [1, 2, 4, 8].forEach((count, k) => {
        const p = easeOutBack(clamp((t - ch.stairs[k]) / 0.25, 0, 1));
        const fade = 1 - smooth(ch.line4, ch.line4 + 0.4, t);
        for (let j = 0; j < count; j++) {
          this.dummy.position.set(-1.65 + k * 1.1, -0.45 + j * 0.38, 1.2);
          this.dummy.scale.setScalar(p * fade);
          this.dummy.rotation.set(0, (1 - p) * 2, 0);
          this.dummy.updateMatrix();
          this.stairs.setMatrixAt(n, this.dummy.matrix);
          this.color.set(NES_CYCLE[k + 1]).multiplyScalar(1.4);
          this.stairs.setColorAt(n, this.color);
          n++;
        }
      });
    }
    this.stairs.count = n;
    this.stairs.instanceMatrix.needsUpdate = true;
    if (this.stairs.instanceColor) this.stairs.instanceColor.needsUpdate = true;

    this.row.update(ch.events, t, { pulse: kick });
    this.row.group.visible = !showStairs || t >= ch.line4;

    // Beep: a square wave flashes on each "beep".
    let beepOn = 0;
    for (const b of ch.beeps) if (b !== null && t >= b) beepOn = Math.max(beepOn, Math.exp(-(t - b) / 0.18));
    this.beep.material.uniforms.uOpacity.value = beepOn;
    this.beep.material.uniforms.uAmp.value = 0.3 + beepOn * 0.3;

    // Camera cuts on every bar with an 8-bit pixel burst.
    const rel = timing.beatIndexAt(t) - timing.beatIndexAt(ch.start + 0.01);
    const shot = Math.floor(rel / 4);
    const shotStart = timing.beatTime(timing.beatIndexAt(ch.start + 0.01) + shot * 4);
    const cam = CAMS[(shot + (section === "chorus2" ? 1 : section === "chorus3" ? 2 : 0)) % CAMS.length];
    const k = (t - shotStart) / (timing.period * 4);
    this.camera.position.set(cam.pos[0], cam.pos[1] + kick * 0.06, cam.pos[2] - k * 0.8);
    this.camera.lookAt(...cam.look);
    this.camera.rotation.z += cam.roll + Math.sin(bf * Math.PI * 0.5) * 0.02;
    this.camera.fov = 55 - kick * 4;
    this.camera.updateProjectionMatrix();


    this.camera.updateMatrixWorld();
    const sy = (x, y, z) => (-new THREE.Vector3(x, y, z).project(this.camera).y * 0.5 + 0.5) * 1920;
    if (this.row.group.visible) hud.keepout(140, sy(0, 2.15 + 0.45, 2), 940, sy(0, 2.15 - 0.75, 2));
    if (this.ones.mesh.visible) hud.keepout(100, sy(-1.1, 0.75 + 1.6, 1.5), 980, sy(-1.1, 0.75 - 1.4, 1.5));
    if (this.zeros.mesh.visible) hud.keepout(100, sy(1.1, 0.75 + 1.6, 1.5), 980, sy(1.1, 0.75 - 1.4, 1.5));
    if (showStairs) hud.keepout(120, sy(0, -0.45 + 8 * 0.38, 1.2), 960, sy(0, -0.7, 1.2));

    const post = { bloom: [0.9, 0.45, 0.2], ca: 0.3 + kick * 0.7, scan: 0.14, vignette: 0.5 };
    const cut = t - shotStart;
    if (cut < 0.14) post.pixel = 16 * (1 - cut / 0.14);
    post.flash = Math.exp(-cut / 0.07) * 0.15;
    if (t - ch.start < 0.3) post.flash = Math.max(post.flash, Math.exp(-(t - ch.start) / 0.1) * 0.7);
    for (const b of ch.beeps) if (b !== null && t >= b && t < b + 0.1) post.glitch = 0.4;
    if (t > ch.end - 0.25) post.flash = Math.max(post.flash, smooth(ch.end - 0.25, ch.end, t) * 0.6);

    for (const [i, b] of ch.beeps.entries()) if (b !== null) hud.stamp("BEEP!", t, b, { x: i ? 720 : 360, y: 470 + i * 70, size: 110, color: NES.green, angle: i ? 0.12 : -0.12, life: 0.7 });
    if (showStairs) {
      const a = smooth(ch.stairs[1], ch.stairs[1] + 0.2, t) * (1 - smooth(ch.line4, ch.line4 + 0.3, t));
      hud.text("×2   ×2   ×2", 540, sy(0, -0.45 + 8 * 0.38 + 0.3, 1.2), { size: 56, weight: 800, family: FONT_COND, color: NES.pink, glow: 20, alpha: a });
    }
    return post;
  }
}
