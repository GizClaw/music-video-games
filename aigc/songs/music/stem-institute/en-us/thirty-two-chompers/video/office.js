import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

// A bright dentist's office in centimetres: the counter top is y = 0, the back
// wall stands at z = WALL_Z, and the dental lamp hangs over the model.
const WALL_Z = -90;
export const LAMP = new THREE.Vector3(24, 44, 38);

const WALL = /* glsl */ `
  uniform float uTime; varying vec2 vP;
  float h21(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
  float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
  float box(vec2 p, vec2 c, vec2 b) { vec2 d = abs(p - c) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
  float tooth(vec2 p) { vec2 q = p * vec2(1.0, 0.8); return length(q) - 1.0; }
  void main() {
    vec2 p = vP;
    vec3 paint = vec3(0.6, 0.79, 0.76) * (0.96 + 0.04 * noise(p * 0.08));
    vec3 col = paint;
    // White tiled splashback above the counter.
    if (p.y < 22.0) {
      vec2 f = fract(p / 6.0);
      float grout = 1.0 - smoothstep(0.0, 0.05, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
      col = mix(vec3(0.86, 0.9, 0.92) * (0.93 + 0.07 * h21(floor(p / 6.0))), vec3(0.6, 0.66, 0.7), grout);
    }
    col = mix(col, vec3(0.92, 0.94, 0.95), 1.0 - smoothstep(0.0, 0.6, abs(p.y - 22.5) - 0.8));
    // Window on the left: sky, clouds, a tree and the town beyond.
    float wf = box(p, vec2(-30.0, 52.0), vec2(22.0, 26.0));
    if (wf < 0.0) {
      vec2 g = (p - vec2(-30.0, 26.0)) / vec2(44.0, 52.0);
      vec3 sky = mix(vec3(0.62, 0.82, 1.0), vec3(0.3, 0.58, 0.98), g.y);
      float cl = smoothstep(0.55, 0.8, noise(vec2(p.x * 0.09 + uTime * 0.08, p.y * 0.2)) * 0.7 + noise(p * 0.2) * 0.4);
      sky = mix(sky, vec3(1.0), cl * smoothstep(0.35, 0.7, g.y) * 0.8);
      float roofs = 34.0 + 4.0 * step(0.5, h21(vec2(floor(p.x / 5.0), 1.0))) + 2.5 * h21(vec2(floor(p.x / 3.0), 3.0));
      if (p.y < roofs) sky = mix(vec3(0.78, 0.66, 0.6), vec3(0.62, 0.7, 0.82), 0.5) * (0.85 + 0.15 * h21(floor(p / vec2(2.5, 2.0))));
      float tree = length((p - vec2(-44.0, 36.0)) / vec2(13.0, 11.0)) - 1.0 + 0.25 * noise(p * 0.5);
      if (tree < 0.0) sky = mix(vec3(0.22, 0.5, 0.2), vec3(0.4, 0.68, 0.28), noise(p * 0.7));
      col = sky;
      float bar = min(abs(p.x + 30.0), abs(p.y - 52.0));
      col = mix(col, vec3(0.95), 1.0 - smoothstep(0.5, 0.9, bar));
    }
    col = mix(col, vec3(0.97), (1.0 - smoothstep(2.0, 2.4, abs(wf))) );
    col += vec3(1.0, 0.95, 0.8) * 0.08 * exp(-max(wf, 0.0) / 20.0);
    // Framed tooth chart: a horseshoe of tooth shapes in the four type colours.
    float pf = box(p, vec2(30.0, 48.0), vec2(15.0, 19.0));
    if (pf < 0.0) {
      col = vec3(0.96, 0.94, 0.88);
      vec2 c = vec2(30.0, 44.0);
      for (int i = 0; i < 16; i++) {
        float a = (float(i) + 0.5) / 16.0 * 3.14159;
        vec2 q = c + vec2(-cos(a) * 10.0, sin(a) * 12.0 + 1.0);
        vec3 tc = i < 3 || i > 12 ? vec3(0.42, 1.0, 0.56) : i < 5 || i > 10 ? vec3(1.0, 0.76, 0.24) : i == 5 || i == 10 ? vec3(0.7, 0.55, 1.0) : vec3(0.24, 0.85, 1.0);
        float d = tooth((p - q) / 1.5);
        col = mix(col, tc * 0.85, smoothstep(0.08, -0.08, d));
      }
      col = mix(col, vec3(0.86, 0.45, 0.5), smoothstep(0.6, 0.0, abs(length((p - c) / vec2(7.0, 8.5)) - 0.9) * 6.0) * 0.6);
      col = mix(col, vec3(0.3, 0.42, 0.5), smoothstep(0.8, 0.3, abs(p.y - 35.0)) * step(abs(p.x - 30.0), 9.0));
    }
    col = mix(col, vec3(0.35, 0.28, 0.24), (1.0 - smoothstep(1.4, 1.8, pf)) * step(0.0, pf));
    // Output is sRGB-encoded afterwards; keep the wall well below the model.
    gl_FragColor = vec4(col * 0.42, 1.0);
  }`;

export class Office {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.wallU = { uTime: { value: 0 } };
    const wall = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 240),
      new THREE.ShaderMaterial({
        uniforms: this.wallU,
        vertexShader: "varying vec2 vP; void main(){ vP = position.xy + vec2(0.0, 120.0); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
        fragmentShader: WALL,
      }),
    );
    wall.position.set(0, 120, WALL_Z);
    this.group.add(wall);

    const top = new THREE.MeshStandardMaterial({ color: "#8f9ba3", roughness: 0.55, metalness: 0.05 });
    const door = new THREE.MeshStandardMaterial({ color: "#5e7f8c", roughness: 0.6 });
    const steel = new THREE.MeshStandardMaterial({ color: "#8a939e", metalness: 0.75, roughness: 0.35 });
    const counter = new THREE.Mesh(new RoundedBoxGeometry(320, 4, 116, 3, 1.5), top);
    counter.position.set(0, -2, -32);
    this.group.add(counter);
    const cabinet = new THREE.Mesh(new THREE.BoxGeometry(316, 86, 62), door);
    cabinet.position.set(0, -47, -14);
    this.group.add(cabinet);
    for (const x of [-120, -60, 0, 60, 120]) {
      const seam = new THREE.Mesh(new THREE.BoxGeometry(0.8, 80, 0.5), new THREE.MeshStandardMaterial({ color: "#3c5560", roughness: 0.7 }));
      seam.position.set(x, -47, 17.2);
      this.group.add(seam);
      const handle = new THREE.Mesh(new THREE.BoxGeometry(14, 1.6, 1.6), steel);
      handle.position.set(x + 30, -12, 18);
      this.group.add(handle);
    }
    this.group.add(new THREE.Mesh(new THREE.BoxGeometry(320, 1, 1), steel).translateY(0.2).translateZ(25));
    this.buildLamp(steel);
    this.buildProps(steel);
  }

  /** The dental operating light: an arm from the ceiling, a housing and its glowing lens. */
  buildLamp(steel) {
    const white = new THREE.MeshStandardMaterial({ color: "#d9dee4", roughness: 0.45 });
    this.lamp = new THREE.Group();
    this.lamp.position.copy(LAMP);
    this.group.add(this.lamp);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 60, 16), steel);
    arm.position.y = 41;
    const yoke = new THREE.Mesh(new THREE.TorusGeometry(9, 1.1, 10, 32, Math.PI), white);
    yoke.position.y = 2;
    this.lamp.add(arm, yoke);
    const head = new THREE.Group();
    head.add(new THREE.Mesh(new RoundedBoxGeometry(24, 7, 13, 4, 3), white));
    this.lens = new THREE.Mesh(new THREE.PlaneGeometry(19, 8).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: "#fff4dc" }));
    this.lens.position.y = -3.6;
    head.add(this.lens);
    this.lamp.add(head);
    head.lookAt(0, 16, 0);
    head.rotateX(-Math.PI / 2);
    this.light = new THREE.SpotLight("#fff1dc", 1.0, 0, 0.32, 0.8, 0);
    this.light.position.copy(LAMP);
    this.light.target.position.set(0, 16, 0);
    this.group.add(this.light, this.light.target);
  }

  buildProps(steel) {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.0, 9, 28), new THREE.MeshStandardMaterial({ color: "#7cc6e8", roughness: 0.3 }));
    cup.position.set(-27, 4.5, 6);
    this.group.add(cup);
    [["#ff7a8a", -0.18], ["#ffd23f", 0.2]].forEach(([c, a]) => {
      const brush = new THREE.Group();
      brush.add(new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, 16, 10), new THREE.MeshStandardMaterial({ color: c, roughness: 0.4 })));
      const head = new THREE.Mesh(new THREE.BoxGeometry(1.4, 3, 1.8), new THREE.MeshStandardMaterial({ color: "#f4f6f8", roughness: 0.8 }));
      head.position.set(0, 8.5, 0.6);
      brush.add(head);
      brush.position.set(-27 + a * 6, 12, 6);
      brush.rotation.z = a;
      this.group.add(brush);
    });
    const tray = new THREE.Mesh(new RoundedBoxGeometry(18, 1, 10, 2, 0.4), steel);
    tray.position.set(27, 0.5, 8);
    this.group.add(tray);
    for (const [x, len] of [[24, 13], [28, 12]]) {
      const tool = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, len, 8).rotateZ(Math.PI / 2 - 0.15), steel);
      tool.position.set(x + 2, 1.4, 6 + (x - 24) * 0.7);
      this.group.add(tool);
    }
    const mirror = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.3, 20), steel);
    mirror.position.set(32.5, 1.4, 6.2);
    this.group.add(mirror);
  }

  update(t, glow) {
    this.wallU.uTime.value = t;
    this.lens.material.color.set("#fff4dc").multiplyScalar(0.9 + glow * 0.4);
    this.light.intensity = 1.0 + glow * 0.3;
  }
}
