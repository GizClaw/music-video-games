import * as THREE from "three";
import { FONT_HEAVY } from "@gizclaw/mvg-core/hud.js";
import { DEMOS } from "./demos.js";

// A toy soldier about 2.1 units tall with a waving symbol banner on its pole
// and its demonstrator on a pedestal at its side.
const HIP = 0.85;
export const BANNER = { x: 0.38, y: 2.02, w: 0.66, h: 0.5 };

function bannerTexture(text, color) {
  const c = document.createElement("canvas");
  c.width = 320;
  c.height = 240;
  const g = c.getContext("2d");
  g.fillStyle = new THREE.Color(color).multiplyScalar(0.55).getStyle();
  g.fillRect(0, 0, 320, 240);
  g.strokeStyle = "#e8c45a";
  g.lineWidth = 14;
  g.strokeRect(10, 10, 300, 220);
  g.fillStyle = "#ffffff";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = `800 ${text.length > 2 ? 120 : text.length > 1 ? 140 : 170}px ${FONT_HEAVY}`;
  g.fillText(text, 160, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

const BANNER_VERT = /* glsl */ `
  uniform float uTime, uPhase; varying vec2 vUv; varying float vShade;
  void main() {
    vUv = uv;
    vec3 p = position;
    float k = uv.x;
    float w = sin(k * 5.0 - uTime * 5.0 + uPhase);
    p.z += w * 0.07 * k;
    p.y += cos(k * 4.0 - uTime * 4.0 + uPhase) * 0.02 * k;
    vShade = 0.82 + 0.18 * cos(k * 5.0 - uTime * 5.0 + uPhase);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }`;
const BANNER_FRAG = /* glsl */ `
  uniform sampler2D uMap; uniform float uLit; varying vec2 vUv; varying float vShade;
  void main() {
    vec3 c = texture2D(uMap, vUv).rgb;
    gl_FragColor = vec4(c * vShade * (0.42 + 0.3 * uLit), 1.0);
  }`;

let shadowTex;
function shadowTexture() {
  if (shadowTex) return shadowTex;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(0,0,0,0.55)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  shadowTex = new THREE.CanvasTexture(c);
  return shadowTex;
}

export class Soldier {
  constructor(unit, k) {
    this.unit = unit;
    this.group = new THREE.Group();
    this.body = new THREE.Group();
    this.group.add(this.body);
    const mat = (color, rough = 0.5, metal = 0) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
    this.tunic = new THREE.MeshStandardMaterial({ color: new THREE.Color(unit.color).multiplyScalar(0.7), roughness: 0.5, emissive: unit.color, emissiveIntensity: 0 });
    const navy = mat("#1c2238");
    const black = mat("#121216", 0.35);
    const white = mat("#ecebe4", 0.6);
    const gold = mat("#d8b048", 0.3, 0.8);
    const skin = mat("#efc59c", 0.6);
    const add = (geo, m, x, y, z, parent = this.body) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      parent.add(mesh);
      return mesh;
    };

    this.legs = [-1, 1].map((s) => {
      const hip = new THREE.Group();
      hip.position.set(s * 0.1, HIP, 0);
      this.body.add(hip);
      add(new THREE.CylinderGeometry(0.085, 0.08, 0.74, 14).translate(0, -0.37, 0), navy, 0, 0, 0, hip);
      add(new THREE.BoxGeometry(0.035, 0.6, 0.02).translate(0, -0.35, 0), mat(unit.color, 0.5), s * 0.07, 0, 0.0, hip);
      add(new THREE.BoxGeometry(0.17, 0.12, 0.26), black, 0, -0.78, 0.035, hip);
      return hip;
    });
    add(new THREE.CylinderGeometry(0.2, 0.23, 0.64, 24), this.tunic, 0, HIP + 0.31, 0);
    add(new THREE.CylinderGeometry(0.236, 0.236, 0.08, 24), white, 0, HIP + 0.05, 0);
    add(new THREE.BoxGeometry(0.08, 0.07, 0.02), gold, 0, HIP + 0.05, 0.236);
    const strap = add(new THREE.BoxGeometry(0.055, 0.7, 0.02), white, 0, HIP + 0.33, 0.21);
    strap.rotation.z = 0.55;
    for (let b = 0; b < 3; b++) add(new THREE.SphereGeometry(0.022, 10, 8), gold, -0.07, HIP + 0.2 + b * 0.13, 0.205);
    for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.12, 0.04, 0.16), gold, s * 0.23, HIP + 0.64, 0);
    add(new THREE.SphereGeometry(0.16, 24, 18), skin, 0, HIP + 0.8, 0);
    for (const s of [-1, 1]) {
      add(new THREE.SphereGeometry(0.02, 8, 6), black, s * 0.055, HIP + 0.83, 0.145);
      add(new THREE.SphereGeometry(0.032, 10, 8), mat("#ff9a9a", 0.7), s * 0.095, HIP + 0.76, 0.12).scale.set(1, 0.6, 0.4);
    }
    add(new THREE.CylinderGeometry(0.17, 0.18, 0.38, 24), black, 0, HIP + 1.09, 0);
    add(new THREE.SphereGeometry(0.17, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), black, 0, HIP + 1.28, 0).scale.y = 0.55;
    add(new THREE.TorusGeometry(0.15, 0.012, 6, 24, Math.PI).rotateZ(Math.PI), gold, 0, HIP + 0.8, 0.02);
    add(new THREE.SphereGeometry(0.06, 12, 10), this.tunic, 0.17, HIP + 1.12, 0.03).scale.set(0.6, 1.4, 0.6);

    this.arms = [-1, 1].map((s) => {
      const sh = new THREE.Group();
      sh.position.set(s * 0.27, HIP + 0.56, 0);
      this.body.add(sh);
      add(new THREE.CylinderGeometry(0.06, 0.055, 0.5, 12).translate(0, -0.25, 0), this.tunic, 0, 0, 0, sh);
      add(new THREE.SphereGeometry(0.065, 12, 10), white, 0, -0.53, 0, sh);
      return sh;
    });
    this.arms[1].rotation.set(-0.5, 0, 0.18);

    add(new THREE.CylinderGeometry(0.022, 0.022, 2.1, 10), mat("#7a5230", 0.6), BANNER.x, 1.25, 0.12);
    add(new THREE.SphereGeometry(0.05, 12, 10), gold, BANNER.x, 2.33, 0.12);
    this.symbolTex = bannerTexture(unit.symbol, unit.color);
    this.blankTex = bannerTexture("?", "#5a6070");
    this.bannerU = { uMap: { value: this.blankTex }, uTime: { value: 0 }, uPhase: { value: k * 1.7 }, uLit: { value: 0 } };
    this.banner = add(
      new THREE.PlaneGeometry(BANNER.w, BANNER.h, 20, 4).translate(BANNER.w / 2, 0, 0),
      new THREE.ShaderMaterial({ uniforms: this.bannerU, vertexShader: BANNER_VERT, fragmentShader: BANNER_FRAG, side: THREE.DoubleSide }),
      BANNER.x,
      BANNER.y,
      0.12,
    );

    this.stand = new THREE.Group();
    this.stand.position.set(-0.62, 0, 0.2);
    this.group.add(this.stand);
    add(new THREE.CylinderGeometry(0.2, 0.24, 0.5, 24).translate(0, 0.25, 0), mat("#8a6240", 0.7), 0, 0, 0, this.stand);
    this.ring = add(new THREE.CylinderGeometry(0.245, 0.245, 0.05, 24), new THREE.MeshStandardMaterial({ color: unit.color, emissive: unit.color, emissiveIntensity: 0.1, roughness: 0.4 }), 0, 0.42, 0, this.stand);
    this.demo = new DEMOS[k](unit.color);
    this.demo.group.position.y = 0.5;
    this.stand.add(this.demo.group);

    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.0).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }));
    shadow.position.set(-0.2, 0.01, 0.1);
    this.group.add(shadow);
  }

  /** march 0..1 swings legs on the beat; hop lifts the body; salute raises the free arm. */
  pose(t, { beat, march, hop, salute, lit, named, shown }) {
    const swing = Math.sin(beat * Math.PI) * 0.55 * march;
    this.legs[0].rotation.x = swing;
    this.legs[1].rotation.x = -swing;
    this.arms[0].rotation.set(-swing * 0.8 - 2.5 * salute, 0, -0.1 - 0.5 * salute);
    this.body.position.y = hop + Math.abs(Math.sin(beat * Math.PI)) * 0.05 * march;
    this.tunic.emissiveIntensity = 0.05 + lit * 0.3;
    this.ring.material.emissiveIntensity = 0.1 + lit * 0.9;
    this.bannerU.uMap.value = named ? this.symbolTex : this.blankTex;
    this.bannerU.uTime.value = t;
    this.bannerU.uLit.value = lit;
    this.demo.group.scale.setScalar(Math.max(0.001, shown));
  }
}
