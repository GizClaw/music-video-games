import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { toothbrushModel } from "./food.js";
import { lathe } from "./model.js";

// A bright dentist's office in centimetres: the counter top is y = 0, the back
// wall stands at z = WALL_Z, and the dental lamp hangs over the model.
const WALL_Z = -90;
export const LAMP = new THREE.Vector3(16, 44, -12);

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
    // Window on the left: sky, soft clouds, rooftops and a tree, all smooth shapes.
    float wf = box(p, vec2(-30.0, 52.0), vec2(22.0, 26.0));
    if (wf < 0.0) {
      float gy = (p.y - 26.0) / 52.0;
      vec3 sky = mix(vec3(0.66, 0.84, 1.0), vec3(0.32, 0.6, 0.98), smoothstep(0.2, 1.0, gy));
      float cl = 0.0;
      for (int i = 0; i < 5; i++) {
        vec2 c = vec2(-46.0 + float(i) * 8.5 + sin(float(i) * 3.1) * 2.0 + uTime * 0.12, 64.0 + sin(float(i) * 1.7) * 4.0);
        cl = max(cl, smoothstep(1.0, 0.75, length((p - c) / vec2(5.5, 2.6))));
        cl = max(cl, smoothstep(1.0, 0.75, length((p - c - vec2(3.0, 1.4)) / vec2(4.0, 2.4))));
      }
      sky = mix(sky, vec3(0.98, 0.99, 1.0), cl * 0.85);
      vec3 col2 = sky;
      for (int i = 0; i < 6; i++) {
        float cx = -50.0 + float(i) * 7.5;
        float hw = 2.6 + mod(float(i) * 1.7, 1.5);
        float hh = 34.0 + mod(float(i) * 3.3, 6.0);
        float d = max(abs(p.x - cx) - hw, p.y - hh);
        float roof = p.y - hh - (hw - abs(p.x - cx)) * 0.6;
        vec3 wallc = mix(vec3(0.86, 0.74, 0.66), vec3(0.74, 0.8, 0.88), mod(float(i), 2.0));
        float win = smoothstep(0.15, 0.0, abs(fract((p.x - cx) / 1.6) - 0.5) - 0.18) * smoothstep(0.15, 0.0, abs(fract(p.y / 2.2) - 0.5) - 0.2) * step(p.y, hh - 1.0);
        if (d < 0.0) col2 = mix(wallc, vec3(0.45, 0.55, 0.68), win * 0.6);
        else if (abs(p.x - cx) < hw + 0.3 && roof < 0.0 && p.y >= hh) col2 = vec3(0.62, 0.32, 0.26);
      }
      float tree = length((p - vec2(-44.0, 37.0)) / vec2(11.0, 9.0)) - 1.0 + 0.1 * sin(atan(p.y - 37.0, p.x + 44.0) * 7.0);
      float lobe = length((p - vec2(-36.0, 33.0)) / vec2(7.0, 6.0)) - 1.0 + 0.08 * sin(atan(p.y - 33.0, p.x + 36.0) * 6.0);
      float t = min(tree, lobe);
      vec3 leaf = mix(vec3(0.2, 0.46, 0.2), vec3(0.42, 0.68, 0.3), smoothstep(-0.6, 0.4, (p.y - 33.0) / 10.0));
      col2 = mix(col2, leaf, smoothstep(0.03, -0.03, t));
      col2 = mix(col2, vec3(0.38, 0.27, 0.18), smoothstep(0.5, 0.2, abs(p.x + 42.0)) * step(p.y, 30.0));
      col = col2;
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

    const top = new THREE.MeshPhysicalMaterial({ color: "#8f9ba3", roughness: 0.45, clearcoat: 0.4, clearcoatRoughness: 0.3 });
    const door = new THREE.MeshStandardMaterial({ color: "#5e7f8c", roughness: 0.6 });
    const steel = new THREE.MeshPhysicalMaterial({ color: "#8a929c", metalness: 1, roughness: 0.25, envMapIntensity: 0.7 });
    const counter = new THREE.Mesh(new RoundedBoxGeometry(320, 4, 116, 3, 1.5), top);
    counter.position.set(0, -2, -32);
    counter.receiveShadow = true;
    this.group.add(counter);
    const cabinet = new THREE.Mesh(new THREE.BoxGeometry(316, 86, 62), door);
    cabinet.position.set(0, -47, -14);
    this.group.add(cabinet);
    for (const x of [-120, -60, 0, 60, 120]) {
      const seam = new THREE.Mesh(new THREE.BoxGeometry(0.8, 80, 0.5), new THREE.MeshStandardMaterial({ color: "#3c5560", roughness: 0.7 }));
      seam.position.set(x, -47, 17.2);
      this.group.add(seam);
      const handle = new THREE.Mesh(new THREE.CapsuleGeometry(0.8, 12, 4, 12).rotateZ(Math.PI / 2), steel);
      handle.position.set(x + 30, -12, 18.2);
      this.group.add(handle);
    }
    this.buildLamp();
    this.buildProps(steel);
  }

  /** The dental operating light: arm, yoke, a turned housing with handles, reflector and glowing lens. */
  buildLamp() {
    const white = new THREE.MeshPhysicalMaterial({ color: "#e4e8ec", roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.15 });
    const grey = new THREE.MeshPhysicalMaterial({ color: "#7d8792", roughness: 0.4, clearcoat: 0.4 });
    this.lamp = new THREE.Group();
    this.lamp.position.copy(LAMP);
    this.group.add(this.lamp);
    const arm = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0, 9, 0), new THREE.Vector3(2, 26, -4), new THREE.Vector3(10, 60, -14)]), 32, 1.5, 16), white);
    this.lamp.add(arm);
    const head = new THREE.Group();
    this.lamp.add(head);
    head.lookAt(0, 16, 0);
    head.rotateX(-Math.PI / 2);
    head.add(new THREE.Mesh(new THREE.TorusGeometry(9.5, 0.9, 12, 48, Math.PI).rotateZ(Math.PI).translate(0, 5, 0), grey));
    const housing = new THREE.Mesh(lathe([[0, 3.2], [5, 3.1], [8.4, 2.4], [9.6, 1.0], [9.8, -0.6], [9.2, -1.6], [8.2, -1.9]], 64), white);
    housing.scale.set(1.25, 1, 0.82);
    head.add(housing);
    const dish = new THREE.Mesh(lathe([[8, -1.6], [6.5, -0.4], [3.5, 0.6], [0, 0.9]], 64), new THREE.MeshPhysicalMaterial({ color: "#ffffff", metalness: 1, roughness: 0.08, side: THREE.DoubleSide }));
    dish.scale.set(1.25, 1, 0.82);
    head.add(dish);
    this.lens = new THREE.Mesh(new THREE.CircleGeometry(5.2, 48).rotateX(Math.PI / 2).scale(1.25, 1, 0.82), new THREE.MeshBasicMaterial({ color: "#fff4dc" }));
    this.lens.position.y = -1.2;
    head.add(this.lens);
    for (const s of [-1, 1]) {
      const grip = new THREE.Mesh(new THREE.CapsuleGeometry(0.9, 4.5, 4, 12).rotateZ(Math.PI / 2), grey);
      grip.position.set(s * 14, -0.2, 0);
      head.add(grip);
    }
    head.traverse((o) => (o.castShadow = false));
    this.light = new THREE.SpotLight("#fff1dc", 0.9, 0, 0.36, 0.8, 0);
    this.light.position.copy(LAMP);
    this.light.target.position.set(0, 16, 0);
    this.light.castShadow = true;
    this.light.shadow.mapSize.set(2048, 2048);
    this.light.shadow.bias = -0.0004;
    this.light.shadow.radius = 4;
    this.light.shadow.camera.near = 10;
    this.light.shadow.camera.far = 140;
    this.group.add(this.light, this.light.target);
  }

  /** On the counter: an instrument tray (mirror, probe, cotton rolls) and a cup of toothbrushes. */
  buildProps(steel) {
    const tray = new THREE.Group();
    tray.position.set(16, 0, -16);
    tray.rotation.y = -0.35;
    this.group.add(tray);
    const plate = new THREE.Shape();
    plate.moveTo(-8, -5);
    [[8, -5], [8, 5], [-8, 5]].forEach(([x, y]) => plate.lineTo(x, y));
    const pan = new THREE.Mesh(new THREE.ExtrudeGeometry(plate, { depth: 0.5, bevelEnabled: true, bevelThickness: 0.5, bevelSize: 0.6, bevelSegments: 4 }).rotateX(-Math.PI / 2).translate(0, 0.5, 0), steel);
    pan.receiveShadow = true;
    tray.add(pan);
    const tool = (len, tip) => {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(lathe([[0, 0], [0.42, 0.1], [0.45, len * 0.85], [0.3, len], [0.12, len + 1.2], [0, len + 1.25]], 24).rotateZ(-Math.PI / 2), steel));
      for (let k = 0; k < 6; k++) g.add(new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.05, 6, 20).rotateY(Math.PI / 2).translate(1.5 + k * 0.5, 0, 0), steel));
      g.add(tip);
      return g;
    };
    const mirrorHead = new THREE.Group();
    mirrorHead.position.set(-1.6, 0.2, 0);
    mirrorHead.add(new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.25, 32).rotateZ(Math.PI / 2 - 0.5), steel));
    const glass = new THREE.Mesh(new THREE.CircleGeometry(0.95, 32), new THREE.MeshPhysicalMaterial({ color: "#ffffff", metalness: 1, roughness: 0.02 }));
    glass.rotation.y = -Math.PI / 2 + 0.5;
    glass.position.x = -0.14;
    mirrorHead.add(glass);
    const mirror = tool(10, mirrorHead);
    mirror.position.set(-4.5, 1.6, -1.5);
    const probeTip = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(11.2, 0, 0), new THREE.Vector3(12.4, 0.1, 0), new THREE.Vector3(13, 0.6, 0.2), new THREE.Vector3(12.8, 1.1, 0.4)]), 16, 0.06, 6), steel);
    const probe = tool(10, probeTip);
    probe.position.set(-4.5, 1.6, 1.5);
    tray.add(mirror, probe);
    const cotton = new THREE.MeshPhysicalMaterial({ color: "#f4f4f0", roughness: 0.95, sheen: 1, sheenColor: new THREE.Color("#ffffff") });
    for (let k = 0; k < 3; k++) {
      const roll = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 2.6, 6, 16).rotateZ(Math.PI / 2), cotton);
      roll.position.set(-2 + k * 0.4, 1.6, 3.2 - k * 1.2);
      roll.rotation.y = 0.2 * k;
      tray.add(roll);
    }
    tray.traverse((o) => (o.castShadow = o.isMesh));

    const cup = new THREE.Mesh(lathe([[0, 0], [2.8, 0], [3.1, 0.3], [3.6, 8.6], [3.9, 9], [3.5, 9], [3.2, 8.6], [2.7, 0.8], [0, 0.8]], 48), new THREE.MeshPhysicalMaterial({ color: "#7cc6e8", roughness: 0.25, clearcoat: 0.8 }));
    cup.position.set(-17, 0, -18);
    cup.castShadow = true;
    this.group.add(cup);
    [["#ff7a8a", -0.2, 0.15], ["#ffd23f", 0.22, -0.1]].forEach(([c, a, b]) => {
      const brush = toothbrushModel(c);
      brush.scale.setScalar(0.85);
      brush.rotation.set(Math.PI / 2 + b, 0, a);
      brush.position.set(-17 + a * 4, 17, -18);
      this.group.add(brush);
    });
  }

  update(t, glow) {
    this.wallU.uTime.value = t;
    this.lens.material.color.set("#fff4dc").multiplyScalar(0.9 + glow * 0.4);
    this.light.intensity = 0.9 + glow * 0.2;
  }
}
