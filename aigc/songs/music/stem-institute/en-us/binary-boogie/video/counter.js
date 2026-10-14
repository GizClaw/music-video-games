import * as THREE from "three";
import { clamp, easeOutCubic, lerp, smooth } from "@gizclaw/mvg-core/timing.js";
import { FONT_MONO } from "@gizclaw/mvg-core/hud.js";
import { BitRow, NES, NES_CYCLE, VoxelCity, VoxelText } from "./voxel.js";
import { SECTIONS, countEvents, parseCounting } from "./constants.js";

const VERSE_CUES = { verse1: [2, 3, 4, 5, 6, 7], verse2: [12, 13, 14, 15, 16, 17, 18, 19] };

export class CounterScene {
  constructor(ctx) {
    this.ctx = ctx;
    const { timing } = ctx;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#070b22");
    this.scene.fog = new THREE.Fog("#070b22", 8, 30);
    this.camera = new THREE.PerspectiveCamera(50, 9 / 16, 0.1, 100);

    this.row = new BitRow({ size: 0.8, gap: 0.16 });
    this.row.group.position.set(0, 0.1, 0);
    this.scene.add(this.row.group);
    this.number = new VoxelText({ cell: 0.17 });
    this.number.mesh.position.set(0, 1.5, 0);
    this.scene.add(this.number.mesh);
    this.city = new VoxelCity();
    this.scene.add(this.city.group);
    this.buildStars();

    const all = [...VERSE_CUES.verse1, ...VERSE_CUES.verse2];
    const parsed = parseCounting(timing, all);
    this.numbers = parsed.numbers;
    this.events = [...parsed.bits];

    // Bridge: light each place as it is named, then show 1011 and add it up.
    const c = (i) => timing.cues[i];
    this.bridge = { places: c(24).start, names: [], example: c(26).start, sum: c(27).start };
    this.events.push(...countEvents([SECTIONS.bridge + 0.05], [0]));
    ["eight", "four", "two", "one"].forEach((w, i) => {
      const t = timing.wordTime(25, w);
      this.bridge.names.push(t);
      this.events.push({ t, index: i, value: 1 });
    });
    this.events.push(...countEvents([c(25).end + 0.1], [0]));
    const exBeat = timing.beatIndexAt(c(26).start) + 1;
    [1, 0, 1, 1].forEach((v, i) => this.events.push({ t: timing.beatTime(exBeat + i), index: i, value: v }));

    // Outro: count 0..15 on the beat.
    const ob = timing.beatIndexAt(SECTIONS.outro + 0.05) + 1;
    this.outroTimes = Array.from({ length: 16 }, (_, k) => timing.beatTime(ob + k));
    this.events.push(...countEvents(this.outroTimes, Array.from({ length: 16 }, (_, k) => k)));
    this.events.sort((a, b) => a.t - b.t);
  }

  buildStars() {
    const n = 500;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) pos.set([(Math.random() - 0.5) * 40, Math.random() * 18 - 1, -12 - Math.random() * 20], i * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(geo, new THREE.PointsMaterial({ color: "#9fb4ff", size: 0.12, sizeAttenuation: true }));
    this.scene.add(this.stars);
  }

  currentNumber(t, section) {
    if (section === "outro") {
      let v = null;
      let at = 0;
      this.outroTimes.forEach((tt, k) => {
        if (t >= tt) {
          v = k;
          at = tt;
        }
      });
      return v === null ? null : { value: v, t: at };
    }
    if (section === "bridge") {
      if (t >= this.bridge.sum + 1.2) return { value: 11, t: this.bridge.sum + 1.2 };
      return null;
    }
    let cur = null;
    for (const n of this.numbers) if (t >= n.t - 0.05) cur = n;
    return cur;
  }

  update(t, section) {
    const { timing, hud } = this.ctx;
    const bf = timing.beatFloat(t);
    const kick = timing.pulse(t, 0.13);
    const start = { verse1: SECTIONS.verse1, verse2: SECTIONS.verse2, bridge: SECTIONS.bridge, outro: SECTIONS.outro }[section];

    let labelGlow = null;
    if (section === "bridge" && t >= this.bridge.places && t < this.bridge.names[0]) {
      const k = (t - this.bridge.places) / (this.bridge.names[0] - this.bridge.places);
      labelGlow = [0, 1, 2, 3].map((i) => clamp(1 - Math.abs(k * 4 - i - 0.5), 0, 1));
    }
    this.row.update(this.events, t, { pulse: kick, labelGlow });

    const num = this.currentNumber(t, section);
    if (num) {
      const str = String(num.value);
      this.number.update(str, t, num.t, { colors: NES_CYCLE.slice(num.value % 6).concat(NES_CYCLE), scale: str.length > 1 ? 1 : 1.2, brightness: 1.0, seed: num.value + 1 });
      this.number.mesh.visible = true;
    } else this.number.mesh.visible = false;
    this.number.mesh.rotation.y = Math.sin(t * 1.3) * 0.25;
    this.number.mesh.position.y = 1.5 + kick * 0.06;

    this.city.update(t, timing, { scroll: bf * 0.9, heightScale: section === "bridge" ? 0.6 : 1 });

    const sway = Math.sin(t * 0.6);
    this.camera.position.set(sway * 0.6, 0.55 + kick * 0.05, 8.2);
    this.camera.lookAt(0, -0.35, 0);
    this.camera.rotation.z += sway * 0.03;
    this.camera.fov = 50 - kick * 3;
    this.camera.updateProjectionMatrix();


    this.camera.updateMatrixWorld();
    const sy = (y) => (-new THREE.Vector3(0, y, 0).project(this.camera).y * 0.5 + 0.5) * 1920;
    const eqY = (sy(this.number.mesh.position.y - 0.62) + sy(0.1 + 0.45)) / 2;
    if (this.number.mesh.visible) hud.keepout(140, sy(this.number.mesh.position.y + 0.75), 940, sy(this.number.mesh.position.y - 0.62));
    hud.keepout(120, sy(0.1 + 0.45), 960, sy(-0.9));

    const post = { bloom: [0.85, 0.45, 0.2], ca: 0.25 + kick * 0.5, scan: 0.1, vignette: 0.55 };
    if (t - start < 0.3) {
      post.flash = Math.exp(-(t - start) / 0.08) * 0.5;
      post.pixel = 14 * (1 - (t - start) / 0.3);
    }
    if (num && t - num.t < 0.12) post.pixel = Math.max(post.pixel || 0, 8 * (1 - (t - num.t) / 0.12));

    // HUD: binary readout and the place-value sum.
    const showEq = section !== "bridge" || t >= this.bridge.example;
    if (num && showEq && section !== "bridge") {
      const ready = num.end ?? num.t;
      const target = num.value.toString(2).padStart(4, "0");
      hud.text(`${target}₂ = ${num.value}`, 540, eqY, { size: 40, weight: 700, family: FONT_MONO, color: NES.peach, glow: 14, alpha: smooth(ready + 0.1, ready + 0.3, t) });
    }
    if (section === "bridge") {
      if (t >= this.bridge.names[0] && t < this.bridge.example) {
        hud.text("8 · 4 · 2 · 1", 540, eqY, { size: 42, weight: 700, family: FONT_MONO, color: NES.yellow, glow: 16 });
      }
      if (t >= this.bridge.example) {
        const terms = ["8", "0", "2", "1"];
        const k = Math.floor(clamp((t - this.bridge.sum) / 0.32, 0, 5));
        const shown = t < this.bridge.sum ? "1011₂" : terms.slice(0, Math.min(k, 4)).join(" + ") + (k >= 5 ? " = 11" : "");
        hud.text(shown, 540, eqY, { size: 42, weight: 700, family: FONT_MONO, color: NES.peach, glow: 16 });
      }
    }
    if (section === "outro") {
      const a = smooth(this.outroTimes[15], this.outroTimes[15] + 0.3, t);
      hud.text("0000 → 1111", 540, 560, { size: 64, weight: 700, family: FONT_MONO, color: NES.green, glow: 20, alpha: a });
      if (t > SECTIONS.end - 0.3) post.flash = smooth(SECTIONS.end - 0.3, SECTIONS.end, t) * 0.9;
    }
    return post;
  }
}
