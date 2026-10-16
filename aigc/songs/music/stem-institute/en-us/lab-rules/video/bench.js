import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { hash } from "@gizclaw/mvg-core/timing.js";
import { GLASS, Parts, canvasTexture, curve, lathe, mesh, phys, rounded, speckle, std, tube } from "./craft.js";

// World layout (see rules.js for the camera): the bench top is y = 0 with its
// front edge at z = 2.7, two stepped tiers rise behind it (top tier first) and
// the tiled wall is at z = -3. The cabinet front below the bench carries the lyrics.
export const TIERS = [
  { y: 4.85, z: -2.1, w: 16.2, d: 1.7 },
  { y: 2.4, z: -0.5, w: 16.8, d: 1.7 },
];
export const FRONT = { y: 0, z: 1.3 };
export const ROW_X = -0.37;
export const CLOCK = new THREE.Vector3(6.3, 9.6, -2.75);

const WALL = /* glsl */ `
  uniform float uLamp, uFlash; uniform vec3 uHue; varying vec3 vW;
  float h21(vec2 p) { return fract(sin(dot(p, vec2(27.1, 113.7))) * 43758.5453); }
  void main() {
    // Glazed school-lab tiles: cream above, a teal band behind the bench, lit by the ceiling lamps.
    vec2 cell = vec2(vW.x / 1.6, vW.y / 0.8);
    cell.x += mod(floor(cell.y), 2.0) * 0.5;
    vec2 id = floor(cell);
    vec2 f = fract(cell);
    float grout = 1.0 - smoothstep(0.0, 0.05, min(min(f.x, 1.0 - f.x) * 2.0, min(f.y, 1.0 - f.y)));
    float band = step(1.6, vW.y) * (1.0 - step(5.6, vW.y));
    vec3 tile = mix(vec3(0.8, 0.79, 0.75), vec3(0.42, 0.58, 0.57), band) * (0.9 + 0.1 * h21(id));
    vec2 d = (vW.xy - vec2(0.0, 13.0)) * vec2(0.075, 0.07);
    float light = 0.06 + uLamp * (0.75 * exp(-dot(d, d)) + 0.2 * exp(-pow((vW.y - 17.0) * 0.4, 2.0)));
    vec3 col = mix(tile, vec3(0.06, 0.06, 0.07), grout) * light;
    col += vec3(1.0) * pow(max(0.0, 1.0 - abs(f.y - 0.25) * 6.0), 3.0) * light * 0.1 * (1.0 - grout);
    col += uHue * uFlash * 0.06;
    // Output is sRGB-encoded afterwards, which lifts these darks a lot; keep them low.
    gl_FragColor = vec4(col * 0.2, 1.0);
  }`;

const DARKER = std("#20252e", 0.5);
const BRUSHED = () =>
  canvasTexture(512, 64, (ctx, w, h) => {
    ctx.fillStyle = "#8c96a4";
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y++) {
      ctx.fillStyle = `rgba(${hash(y) > 0.5 ? "255,255,255" : "20,24,30"},${0.04 + hash(y * 3.1) * 0.08})`;
      ctx.fillRect(0, y, w, 1);
    }
  }, { repeat: [3, 1] });
const GRAIN = () =>
  canvasTexture(128, 512, (ctx, w, h) => {
    ctx.fillStyle = "#4a3426";
    ctx.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x++) {
      const v = Math.sin(x * 0.35 + Math.sin(x * 0.07) * 4) * 0.5 + 0.5;
      ctx.fillStyle = `rgba(${v > 0.5 ? "120,86,60" : "24,16,10"},${0.15 + Math.abs(v - 0.5) * 0.4})`;
      ctx.fillRect(x, 0, 1, h);
    }
    speckle(ctx, w, h, 120, 0.5, 1.5, "rgba(20,12,8,0.4)", 2);
  });
const EPOXY = () =>
  canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = "#1c222c";
    ctx.fillRect(0, 0, w, h);
    speckle(ctx, w, h, 400, 0.4, 1.0, "rgba(120,130,150,0.25)", 5);
  }, { repeat: [8, 2] });

export class Bench {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.wallU = { uLamp: { value: 1 }, uFlash: { value: 0 }, uHue: { value: new THREE.Color() } };
    const wall = new THREE.ShaderMaterial({
      uniforms: this.wallU,
      vertexShader: "varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }",
      fragmentShader: WALL,
    });
    mesh(this.group, new THREE.PlaneGeometry(90, 70), wall, 0, 10, -3);
    const catcher = new THREE.Mesh(new THREE.PlaneGeometry(40, 30), new THREE.ShadowMaterial({ opacity: 0.32 }));
    catcher.position.set(0, 9, -2.97);
    catcher.receiveShadow = true;
    this.group.add(catcher);

    // Bench: a black epoxy top, a stadium riser of two gloss tiers with brushed-steel
    // fascias and epoxy tops, grained cabinet doors with raised panels and pulls.
    const steel = phys({ color: "#9aa0a8", map: BRUSHED(), metalness: 0.85, roughness: 0.4 });
    const epoxy = phys({ color: "#ffffff", map: EPOXY(), roughness: 0.4, clearcoat: 0.35, clearcoatRoughness: 0.35 });
    const body = phys({ color: "#252c38", metalness: 0.5, roughness: 0.38, clearcoat: 0.5, clearcoatRoughness: 0.3 });
    const parts = new Parts();
    parts.add(new RoundedBoxGeometry(26, 0.5, 5.7, 4, 0.12), epoxy, { p: [0, -0.25, -0.15] });
    for (const { y, z, w, d } of TIERS) {
      parts.add(new RoundedBoxGeometry(w, y, d, 3, 0.06), body, { p: [ROW_X, y / 2, z] });
      parts.add(new RoundedBoxGeometry(w + 0.12, 0.14, d + 0.14, 3, 0.05), epoxy, { p: [ROW_X, y - 0.07, z] });
      parts.add(new RoundedBoxGeometry(w - 0.1, 0.36, 0.06, 2, 0.025), steel, { p: [ROW_X, y - 0.36, z + d / 2 + 0.03] });
      for (const dx of [-w / 2 + 0.35, w / 2 - 0.35]) parts.add(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 12), std("#5a6270", 0.4, 0.8), { p: [ROW_X + dx, y - 0.36, z + d / 2 + 0.07], r: [Math.PI / 2, 0, 0] });
    }
    parts.add(new RoundedBoxGeometry(25, 16, 5, 2, 0.1), std("#121418", 0.8), { p: [0, -8.5, -0.3] });
    const grain = GRAIN();
    const wood = std("#6a625c", 0.72, 0, { map: grain });
    const panel = std("#4c4642", 0.75, 0, { map: grain });
    const pull = new THREE.TubeGeometry(curve([[0, 0.5, 0], [0, 0.48, 0.12], [0, 0.0, 0.14], [0, -0.48, 0.12], [0, -0.5, 0]]), 32, 0.045, 10);
    for (let k = 0; k < 6; k++) {
      const x = -10 + k * 4;
      parts.add(new RoundedBoxGeometry(3.7, 6.5, 0.14, 3, 0.05), wood, { p: [x, -4.0, 2.25] });
      parts.add(new THREE.ExtrudeGeometry(rounded(2.9, 5.7, 0.2), { depth: 0.04, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.06, bevelSegments: 3 }), panel, { p: [x, -4.0, 2.32] });
      const hx = x + (k % 2 ? -1.55 : 1.55);
      parts.add(pull, steel, { p: [hx, -1.6, 2.4] });
      for (const y of [-1.1, -2.1]) parts.add(new THREE.CylinderGeometry(0.06, 0.06, 0.1, 12), steel, { p: [hx, y, 2.38], r: [Math.PI / 2, 0, 0] });
      for (const y of [-1.2, -6.6]) parts.add(new THREE.CylinderGeometry(0.06, 0.06, 0.4, 12), steel, { p: [x + (k % 2 ? 1.85 : -1.85), y, 2.33] });
    }
    parts.add(new THREE.BoxGeometry(25, 0.5, 0.2), std("#0b0c0e", 0.9), { p: [0, -7.5, 2.1] });

    // First-aid box on the left of the wall.
    parts.add(new RoundedBoxGeometry(2.0, 1.6, 0.5, 4, 0.12), phys({ color: "#2fb36a", roughness: 0.35, clearcoat: 0.5 }), { p: [-6.4, 9.2, -2.75] });
    parts.add(new RoundedBoxGeometry(0.9, 0.28, 0.06, 2, 0.02), std("#f4f4f0", 0.5), { p: [-6.4, 9.2, -2.48] });
    parts.add(new RoundedBoxGeometry(0.28, 0.9, 0.06, 2, 0.02), std("#f4f4f0", 0.5), { p: [-6.4, 9.2, -2.48] });
    parts.add(tube(curve([[-6.85, 10.0, -2.7], [-6.8, 10.3, -2.65], [-6.0, 10.3, -2.65], [-5.95, 10.0, -2.7]]), 0.05, { segments: 24, radial: 8 }), DARKER);
    parts.add(new RoundedBoxGeometry(0.3, 0.16, 0.1, 2, 0.03), std("#d8dde4", 0.3, 0.8), { p: [-6.4, 8.38, -2.48] });
    parts.build(this.group);
    // LED strips under each tier's fascia and along the bench front, pulsing with the beat.
    this.led = new THREE.MeshBasicMaterial({ color: "#3de8ff" });
    for (const { y, z, w, d } of TIERS) mesh(this.group, new RoundedBoxGeometry(w - 0.4, 0.05, 0.04, 1, 0.02), this.led, ROW_X, y - 0.6, z + d / 2 + 0.03);
    mesh(this.group, new RoundedBoxGeometry(25.6, 0.045, 0.04, 1, 0.02), this.led, 0, -0.12, 2.74);
    this.group.traverse((o) => {
      if (o.isMesh) o.castShadow = false;
    });

    // The wall clock: bezel, face, tick marks, three hands, a glass cover.
    this.clock = new THREE.Group();
    this.clock.position.copy(CLOCK);
    const cp = new Parts();
    cp.add(lathe([[0.98, -0.1], [1.12, -0.12], [1.2, 0.0], [1.16, 0.12], [1.02, 0.14]], 64), phys({ color: "#20252e", roughness: 0.3, clearcoat: 0.8 }), { r: [Math.PI / 2, 0, 0] });
    cp.add(new THREE.CircleGeometry(1.02, 64), std("#c9cdc2", 0.85), { p: [0, 0, -0.05] });
    for (let k = 0; k < 60; k++) {
      const a = (k / 60) * Math.PI * 2;
      const big = k % 5 === 0;
      cp.add(new THREE.BoxGeometry(big ? 0.06 : 0.02, big ? 0.18 : 0.07, 0.02), std("#20252e"), { p: [Math.sin(a) * (big ? 0.8 : 0.86), Math.cos(a) * (big ? 0.8 : 0.86), -0.03], r: [0, 0, -a] });
    }
    cp.build(this.clock);
    this.hands = [
      [0.08, 0.5, "#20252e"],
      [0.055, 0.76, "#20252e"],
      [0.025, 0.86, "#ff4f5e"],
    ].map(([w, l, c], k) => {
      const pivot = new THREE.Group();
      pivot.position.z = -0.01 + k * 0.012;
      mesh(pivot, new RoundedBoxGeometry(w, l, 0.015, 1, w * 0.4), std(c, 0.5), 0, l / 2 - 0.08, 0);
      this.clock.add(pivot);
      return pivot;
    });
    mesh(this.clock, new THREE.CylinderGeometry(0.06, 0.06, 0.05, 20), std("#ff4f5e", 0.4), 0, 0, 0.03).rotation.x = Math.PI / 2;
    const cover = mesh(this.clock, new THREE.SphereGeometry(1.4, 48, 12, 0, Math.PI * 2, 0, 0.75), GLASS, 0, 0, -1.2);
    cover.rotation.x = Math.PI / 2;
    cover.renderOrder = 2;
    this.group.add(this.clock);
  }

  /** `beat` is the continuous beat count; the second hand ticks on every beat and `spin` whirls the minute hand. */
  update(t, beat, lamp, spin, pop, kick) {
    this.led.color.set("#3de8ff").multiplyScalar(0.35 + 0.45 * kick);
    this.wallU.uLamp.value = lamp;
    const [hour, minute, second] = this.hands;
    second.rotation.z = -(Math.floor(beat) / 60) * Math.PI * 2;
    minute.rotation.z = -((t / 120 + 0.3) * Math.PI * 2 + spin * Math.PI * 2);
    hour.rotation.z = -((t / 1440 + 0.42) * Math.PI * 2 + (spin * Math.PI * 2) / 12);
    this.clock.scale.setScalar(1 + pop * 0.35);
  }
}

