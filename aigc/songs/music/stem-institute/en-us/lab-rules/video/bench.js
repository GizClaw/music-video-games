import * as THREE from "three";
import { vessel } from "./props.js";

// World layout (see rules.js for the camera): the bench top is y = 0 with its
// front edge at z = 2.7, the riser shelf for the back row sits at y = 2 and the
// tiled wall at z = -3. The cabinet front below the bench carries the lyrics.
export const RISER = { y: 2.0, z: -1.4 };
export const FRONT = { y: 0, z: 1.3 };
export const CLOCK = new THREE.Vector3(6.3, 9.6, -2.9);

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
    vec3 tile = mix(vec3(0.86, 0.83, 0.72), vec3(0.3, 0.68, 0.66), band) * (0.9 + 0.1 * h21(id));
    vec2 d = (vW.xy - vec2(0.0, 13.0)) * vec2(0.075, 0.07);
    float light = 0.06 + uLamp * (0.75 * exp(-dot(d, d)) + 0.2 * exp(-pow((vW.y - 17.0) * 0.4, 2.0)));
    vec3 col = mix(tile, vec3(0.06, 0.06, 0.07), grout) * light;
    col += vec3(1.0) * pow(max(0.0, 1.0 - abs(f.y - 0.25) * 6.0), 3.0) * light * 0.1 * (1.0 - grout);
    col += uHue * uFlash * 0.06;
    // Output is sRGB-encoded afterwards, which lifts these darks a lot; keep them low.
    gl_FragColor = vec4(col * 0.2, 1.0);
  }`;

const std = (color, roughness = 0.6, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
function put(parent, geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

export class Bench {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.wallU = { uLamp: { value: 1 }, uFlash: { value: 0 }, uHue: { value: new THREE.Color() } };
    put(
      this.group,
      new THREE.PlaneGeometry(90, 70),
      new THREE.ShaderMaterial({
        uniforms: this.wallU,
        vertexShader: "varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }",
        fragmentShader: WALL,
      }),
      0,
      10,
      -3,
    );

    // Bench: slate top, a steel riser shelf for the back row, dark cabinet doors below.
    const slate = std("#1a1f28", 0.5, 0.2);
    put(this.group, new THREE.BoxGeometry(26, 0.5, 5.7), slate, 0, -0.25, -0.15);
    put(this.group, new THREE.BoxGeometry(26, 0.12, 0.12), std("#3a4352", 0.4, 0.6), 0, -0.06, 2.72);
    const steel = std("#4a5262", 0.35, 0.7);
    put(this.group, new THREE.BoxGeometry(17.5, 0.16, 1.5), steel, 0, RISER.y - 0.08, RISER.z);
    for (const x of [-8.4, 0, 8.4]) put(this.group, new THREE.BoxGeometry(0.16, RISER.y, 0.16), steel, x, RISER.y / 2, RISER.z - 0.5);
    const wood = std("#2a2420", 0.75);
    put(this.group, new THREE.BoxGeometry(25, 16, 5), std("#141619", 0.8), 0, -8.5, -0.3);
    for (let k = 0; k < 6; k++) {
      const x = -10 + k * 4;
      put(this.group, new THREE.BoxGeometry(3.7, 6.5, 0.12), wood, x, -4.0, 2.25);
      put(this.group, new THREE.CylinderGeometry(0.07, 0.07, 0.9, 10), std("#8a94a8", 0.3, 0.8), x + (k % 2 ? -1.4 : 1.4), -1.6, 2.4);
    }

    // High wall shelf of reagent bottles, inside the platform's top chrome.
    put(this.group, new THREE.BoxGeometry(24, 0.22, 1.2), steel, 0, 14.3, -2.4);
    ["#3dff8a", "#3dc2ff", "#ff9d3d", "#ff5dc8", "#ffd23f", "#b48cff", "#3dffd8"].forEach((c, k) => {
      const v = new THREE.Group();
      v.position.set(-9 + k * 3, 14.4, -2.4);
      v.scale.setScalar(0.7 + (k % 3) * 0.12);
      vessel(v, ["erlen", "beaker", "bottle"][k % 3], c);
      this.group.add(v);
    });

    // First-aid box on the left of the wall, a clock on the right.
    const aid = new THREE.Group();
    aid.position.set(-6.4, 9.2, -2.75);
    put(aid, new THREE.BoxGeometry(2.0, 1.6, 0.5), std("#2fb36a", 0.5));
    put(aid, new THREE.BoxGeometry(0.9, 0.28, 0.06), std("#f4f4f0", 0.5), 0, 0, 0.27);
    put(aid, new THREE.BoxGeometry(0.28, 0.9, 0.06), std("#f4f4f0", 0.5), 0, 0, 0.27);
    this.group.add(aid);

    this.clock = new THREE.Group();
    this.clock.position.copy(CLOCK);
    put(this.clock, new THREE.CylinderGeometry(1.15, 1.15, 0.2, 40), std("#20252e", 0.5), 0, 0, 0).rotation.x = Math.PI / 2;
    put(this.clock, new THREE.CircleGeometry(1.0, 40), std("#c9cdc2", 0.85), 0, 0, 0.11);
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      put(this.clock, new THREE.BoxGeometry(0.06, k % 3 ? 0.12 : 0.22, 0.02), std("#20252e"), Math.sin(a) * 0.85, Math.cos(a) * 0.85, 0.12).rotation.z = -a;
    }
    this.hands = [
      [0.07, 0.5, "#20252e"],
      [0.05, 0.78, "#20252e"],
      [0.025, 0.85, "#ff4f5e"],
    ].map(([w, l, c]) => {
      const pivot = new THREE.Group();
      pivot.position.z = 0.13 + l * 0.01;
      put(pivot, new THREE.BoxGeometry(w, l, 0.02), std(c, 0.5), 0, l / 2 - 0.08, 0);
      this.clock.add(pivot);
      return pivot;
    });
    this.group.add(this.clock);
  }

  /** `beat` is the continuous beat count; the second hand ticks on every beat and `spin` whirls the minute hand. */
  update(t, beat, lamp, spin, pop) {
    this.wallU.uLamp.value = lamp;
    const [hour, minute, second] = this.hands;
    second.rotation.z = -(Math.floor(beat) / 60) * Math.PI * 2;
    minute.rotation.z = -((t / 120 + 0.3) * Math.PI * 2 + spin * Math.PI * 2);
    hour.rotation.z = -((t / 1440 + 0.42) * Math.PI * 2 + (spin * Math.PI * 2) / 12);
    this.clock.scale.setScalar(1 + pop * 0.35);
  }
}
