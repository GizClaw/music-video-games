import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { FONT_HEAVY } from "@gizclaw/mvg-core/hud.js";
import { hash } from "@gizclaw/mvg-core/timing.js";
import { DEMOS, canvasTexture, lathe } from "./demos.js";

// A lacquered wooden nutcracker soldier about 2.2 units tall, a fringed symbol
// banner on a turned pole, and its demonstrator on a turned pedestal at its side.
const HIP = 0.85;
export const BANNER = { x: 0.4, y: 1.98, w: 0.68, h: 0.56 };

function bannerTexture(text, color) {
  return canvasTexture(320, 264, (g) => {
    g.clearRect(0, 0, 320, 264);
    const c = new THREE.Color(color).multiplyScalar(0.55);
    g.fillStyle = c.getStyle();
    g.fillRect(0, 0, 320, 220);
    for (let y = 0; y < 220; y += 3) {
      g.fillStyle = `rgba(255,255,255,${y % 6 ? 0.03 : 0.06})`;
      g.fillRect(0, y, 320, 1);
    }
    g.strokeStyle = "#e8c45a";
    g.lineWidth = 12;
    g.strokeRect(12, 12, 296, 196);
    g.lineWidth = 3;
    g.strokeRect(26, 26, 268, 168);
    g.fillStyle = "#ffffff";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = `800 ${text.length > 2 ? 110 : text.length > 1 ? 130 : 156}px ${FONT_HEAVY}`;
    g.fillText(text, 160, 116);
    for (let x = 4; x < 320; x += 7) {
      g.strokeStyle = x % 14 < 7 ? "#e8c45a" : "#c99a32";
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(x, 218);
      g.lineTo(x + 1, 252 + (hash(x) - 0.5) * 8);
      g.stroke();
    }
  });
}

const BANNER_VERT = /* glsl */ `
  uniform float uTime, uPhase; varying vec2 vUv; varying float vShade;
  void main() {
    vUv = uv;
    vec3 p = position;
    float k = uv.x;
    float a = k * 5.0 - uTime * 5.0 + uPhase;
    float folds = sin(k * 19.0 + uPhase) * 0.018;
    p.z += sin(a) * 0.07 * k + folds * (0.4 + k);
    p.y += cos(k * 4.0 - uTime * 4.0 + uPhase) * 0.02 * k - k * k * 0.03;
    vShade = 0.78 + 0.14 * cos(a) + 0.1 * cos(k * 19.0 + uPhase);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }`;
const BANNER_FRAG = /* glsl */ `
  uniform sampler2D uMap; uniform float uLit; varying vec2 vUv; varying float vShade;
  void main() {
    vec4 c = texture2D(uMap, vUv);
    if (c.a < 0.5) discard;
    gl_FragColor = vec4(c.rgb * vShade * (0.46 + 0.32 * uLit), 1.0);
  }`;

let shared;
/** Materials and geometries every soldier shares. */
function parts() {
  if (shared) return shared;
  const furTex = canvasTexture(256, 256, (g) => {
    g.fillStyle = "#808080";
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2600; i++) {
      const v = 60 + hash(i * 3.1) * 150;
      g.strokeStyle = `rgb(${v},${v},${v})`;
      g.lineWidth = 1 + hash(i * 1.7);
      const x = hash(i * 1.3) * 256;
      const y = hash(i * 2.3) * 256;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (hash(i * 5.1) - 0.5) * 6, y + 6 + hash(i * 7.7) * 10);
      g.stroke();
    }
  });
  furTex.colorSpace = THREE.NoColorSpace;
  furTex.wrapS = furTex.wrapT = THREE.RepeatWrapping;
  furTex.repeat.set(4, 2);
  const grain = canvasTexture(128, 512, (g) => {
    g.fillStyle = "#9a6a42";
    g.fillRect(0, 0, 128, 512);
    for (let i = 0; i < 70; i++) {
      g.strokeStyle = `rgba(${70 + hash(i) * 40},${40 + hash(i * 2) * 25},20,0.45)`;
      g.lineWidth = 1 + hash(i * 3) * 3;
      g.beginPath();
      const x = hash(i * 5) * 128;
      g.moveTo(x, 0);
      g.bezierCurveTo(x + 8, 170, x - 8, 340, x + 4, 512);
      g.stroke();
    }
  });
  const lacquer = (color, rough = 0.3) => new THREE.MeshPhysicalMaterial({ color, roughness: rough, clearcoat: 1, clearcoatRoughness: 0.08 });
  shared = {
    navy: lacquer("#1c2240"),
    boot: lacquer("#0c0c10", 0.25),
    sole: new THREE.MeshStandardMaterial({ color: "#3a2a1e", roughness: 0.7 }),
    sash: new THREE.MeshPhysicalMaterial({ color: "#d8d2c4", roughness: 0.6, sheen: 0.6, sheenColor: new THREE.Color("#ffffff") }),
    glove: new THREE.MeshPhysicalMaterial({ color: "#f6f4ee", roughness: 0.75, sheen: 0.8, sheenColor: new THREE.Color("#ffffff") }),
    gold: new THREE.MeshPhysicalMaterial({ color: "#e0b448", metalness: 1, roughness: 0.22 }),
    skin: new THREE.MeshPhysicalMaterial({ color: "#e8bc96", roughness: 0.55, clearcoat: 0.35, clearcoatRoughness: 0.35 }),
    cheek: lacquer("#f08a8a", 0.45),
    lip: lacquer("#b8343c", 0.35),
    black: lacquer("#101014", 0.2),
    eye: lacquer("#ffffff", 0.2),
    iris: lacquer("#2f6fd0", 0.2),
    hair: new THREE.MeshPhysicalMaterial({ color: "#f2efe8", roughness: 0.8, sheen: 1, sheenColor: new THREE.Color("#ffffff") }),
    fur: new THREE.MeshPhysicalMaterial({ color: "#121216", roughness: 0.85, sheen: 1, sheenRoughness: 0.5, sheenColor: new THREE.Color("#5a5a66"), bumpMap: furTex, bumpScale: 3 }),
    wood: new THREE.MeshPhysicalMaterial({ map: grain, roughness: 0.45, clearcoat: 0.8, clearcoatRoughness: 0.15 }),
    finger: new THREE.CapsuleGeometry(0.016, 0.05, 4, 10),
    fringe: new THREE.CylinderGeometry(0.006, 0.006, 0.07, 5).translate(0, -0.035, 0),
    button: new THREE.SphereGeometry(0.018, 14, 10),
  };
  return shared;
}

let shadowTex;
function shadowTexture() {
  if (shadowTex) return shadowTex;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(0,0,0,0.4)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  shadowTex = new THREE.CanvasTexture(c);
  return shadowTex;
}

export class Soldier {
  constructor(unit, k) {
    this.unit = unit;
    this.k = k;
    const P = parts();
    this.group = new THREE.Group();
    this.body = new THREE.Group();
    this.group.add(this.body);
    this.tunic = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(unit.color).multiplyScalar(0.62), roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08, emissive: unit.color, emissiveIntensity: 0 });
    const add = (geo, m, x, y, z, parent = this.body) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      parent.add(mesh);
      return mesh;
    };

    // Legs: striped trousers into glossy boots with soles and heels.
    this.legs = [-1, 1].map((s) => {
      const hip = new THREE.Group();
      hip.position.set(s * 0.1, HIP, 0);
      this.body.add(hip);
      add(lathe([[0.086, 0], [0.092, -0.08], [0.088, -0.4], [0.082, -0.5], [0, -0.52]], 24), P.navy, 0, 0, 0, hip);
      add(new RoundedBoxGeometry(0.018, 0.42, 0.02, 2, 0.008), P.gold, s * 0.086, -0.24, 0, hip);
      add(lathe([[0, -0.74], [0.09, -0.74], [0.096, -0.6], [0.1, -0.47], [0.108, -0.44], [0, -0.44]], 24), P.boot, 0, 0, 0, hip);
      add(new RoundedBoxGeometry(0.17, 0.09, 0.27, 3, 0.04), P.boot, 0, -0.73, 0.04, hip);
      add(new RoundedBoxGeometry(0.18, 0.025, 0.29, 2, 0.01), P.sole, 0, -0.785, 0.04, hip);
      return hip;
    });

    // Tunic: turned torso with a short skirt, collar, piping, buttons, sash, belt and buckle.
    this.torso = new THREE.Group();
    this.torso.position.y = HIP;
    this.body.add(this.torso);
    add(lathe([[0.2, -0.16], [0.26, -0.12], [0.25, 0.0], [0.23, 0.08], [0.24, 0.3], [0.25, 0.5], [0.235, 0.6], [0.17, 0.67], [0.1, 0.7], [0, 0.71]], 40), this.tunic, 0, 0, 0, this.torso);
    add(lathe([[0.1, 0.66], [0.112, 0.67], [0.112, 0.75], [0.09, 0.76]], 32), P.gold, 0, 0, 0, this.torso);
    add(new RoundedBoxGeometry(0.035, 0.5, 0.02, 2, 0.01), P.gold, 0, 0.36, 0.238, this.torso);
    for (let b = 0; b < 5; b++) for (const s of [-1, 1]) add(P.button, P.gold, s * 0.06, 0.16 + b * 0.1, 0.236 - b * 0.004, this.torso);
    const sash = add(new THREE.TorusGeometry(0.252, 0.016, 10, 64), P.sash, 0, 0.34, 0, this.torso);
    sash.rotation.set(Math.PI / 2, 0.62, 0);
    sash.scale.set(1, 1.05, 3.4);
    add(lathe([[0.24, 0.02], [0.252, 0.03], [0.252, 0.1], [0.24, 0.11]], 40), P.black, 0, 0, 0, this.torso);
    const ring = new THREE.Shape();
    ring.moveTo(-0.045, -0.035);
    [[0.045, -0.035], [0.045, 0.035], [-0.045, 0.035]].forEach(([x, y]) => ring.lineTo(x, y));
    const hole = new THREE.Path();
    hole.moveTo(-0.025, -0.017);
    [[0.025, -0.017], [0.025, 0.017], [-0.025, 0.017]].forEach(([x, y]) => hole.lineTo(x, y));
    ring.holes.push(hole);
    add(new THREE.ExtrudeGeometry(ring, { depth: 0.012, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.006, bevelSegments: 2 }), P.gold, 0, 0.065, 0.248, this.torso);

    // Epaulettes with fringe.
    for (const s of [-1, 1]) {
      const ep = add(lathe([[0, 0.03], [0.07, 0.025], [0.095, 0.005], [0.09, -0.01], [0, -0.01]], 24), P.gold, s * 0.22, 0.62, 0, this.torso);
      ep.rotation.z = -s * 0.35;
      const fr = new THREE.InstancedMesh(P.fringe, P.gold, 12);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        fr.setMatrixAt(i, new THREE.Matrix4().makeTranslation(Math.cos(a) * 0.088, -0.004, Math.sin(a) * 0.088));
      }
      fr.castShadow = true;
      ep.add(fr);
    }

    // Arms: sleeves with gold cuffs and four-fingered gloves.
    this.arms = [-1, 1].map((s) => {
      const sh = new THREE.Group();
      sh.position.set(s * 0.29, HIP + 0.57, 0);
      this.body.add(sh);
      add(new THREE.SphereGeometry(0.075, 20, 14), this.tunic, 0, 0, 0, sh);
      add(new THREE.CapsuleGeometry(0.06, 0.38, 6, 16).translate(0, -0.24, 0), this.tunic, 0, 0, 0, sh);
      add(lathe([[0.066, -0.42], [0.072, -0.43], [0.072, -0.47], [0.064, -0.48]], 24), P.gold, 0, 0, 0, sh);
      const hand = new THREE.Group();
      hand.position.y = -0.53;
      sh.add(hand);
      add(new THREE.SphereGeometry(0.05, 18, 14), P.glove, 0, 0, 0, hand).scale.set(0.8, 1, 1.05);
      for (let f = 0; f < 4; f++) {
        const fin = add(P.finger, P.glove, -s * 0.012 + (f - 1.5) * 0.002, -0.05, 0.033 - f * 0.022, hand);
        fin.rotation.set(0.5, 0, 0);
      }
      add(P.finger, P.glove, s * 0.035, -0.015, 0.03, hand).rotation.set(0.4, 0, s * 0.8);
      return sh;
    });
    this.arms[1].rotation.set(-0.5, 0, 0.18);

    // Head: turned face with eyes, brows, nose, cheeks, moustache, whiskers and a fur bearskin.
    this.head = new THREE.Group();
    this.head.position.y = HIP + 0.8;
    this.body.add(this.head);
    add(lathe([[0, -0.17], [0.09, -0.165], [0.145, -0.12], [0.165, -0.03], [0.165, 0.06], [0.15, 0.13], [0.1, 0.17], [0, 0.18]], 40), P.skin, 0, 0, 0, this.head);
    this.eyes = [-1, 1].map((s) => {
      const e = new THREE.Group();
      e.position.set(s * 0.058, 0.035, 0.138);
      this.head.add(e);
      add(new THREE.SphereGeometry(0.03, 20, 14), P.eye, 0, 0, 0, e).scale.set(1, 1.15, 0.6);
      add(new THREE.CircleGeometry(0.018, 24), P.iris, 0, 0, 0.0185, e);
      add(new THREE.CircleGeometry(0.009, 16), P.black, 0, 0, 0.019, e);
      add(new THREE.CircleGeometry(0.004, 10), P.eye, 0.006, 0.007, 0.0195, e);
      const brow = add(new THREE.CapsuleGeometry(0.008, 0.04, 4, 8).rotateZ(Math.PI / 2), P.hair, s * 0.06, 0.088, 0.142, this.head);
      brow.rotation.z = s * -0.25;
      return e;
    });
    add(new THREE.SphereGeometry(0.034, 20, 14), P.skin, 0, -0.005, 0.168, this.head).scale.set(0.9, 1.1, 1);
    for (const s of [-1, 1]) {
      add(new THREE.SphereGeometry(0.034, 16, 12), P.cheek, s * 0.098, -0.035, 0.12, this.head).scale.set(1, 0.75, 0.45);
      const mo = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0, -0.045, 0.17), new THREE.Vector3(s * 0.045, -0.06, 0.162), new THREE.Vector3(s * 0.085, -0.045, 0.138), new THREE.Vector3(s * 0.1, -0.018, 0.122)]), 16, 0.016, 10), P.hair);
      mo.castShadow = true;
      this.head.add(mo);
      add(new THREE.SphereGeometry(0.06, 16, 12), P.hair, s * 0.15, 0.04, -0.03, this.head).scale.set(0.5, 1.1, 0.9);
    }
    add(new RoundedBoxGeometry(0.07, 0.022, 0.02, 2, 0.008), P.lip, 0, -0.09, 0.15, this.head);
    add(lathe([[0.17, 0], [0.205, 0.06], [0.222, 0.22], [0.215, 0.4], [0.19, 0.52], [0.13, 0.59], [0, 0.615]], 48), P.fur, 0, 0.12, 0, this.head);
    add(new THREE.TorusGeometry(0.16, 0.01, 8, 40, Math.PI).rotateZ(Math.PI), P.gold, 0, 0.0, 0.01, this.head).rotation.y = 0;
    add(lathe([[0, 0], [0.045, 0.004], [0.05, 0.012], [0.04, 0.02], [0, 0.022]], 24).rotateX(Math.PI / 2), P.gold, 0, 0.2, 0.205, this.head);
    add(lathe([[0, -0.06], [0.03, -0.04], [0.038, 0.02], [0.025, 0.09], [0, 0.12]], 20), this.tunic, 0.2, 0.36, 0.02, this.head).rotation.z = -0.2;

    // Pole, finial, tassels and banner.
    add(lathe([[0.024, -0.9], [0.024, 0.8], [0, 0.8]], 14), P.wood, BANNER.x, 1.25, 0.12);
    for (const y of [0.4, 2.27]) add(lathe([[0.03, -0.02], [0.034, 0], [0.03, 0.02]], 16), P.gold, BANNER.x, y, 0.12);
    add(lathe([[0, 0], [0.04, 0.01], [0.045, 0.04], [0.025, 0.06], [0.04, 0.1], [0.012, 0.2], [0, 0.22]], 20), P.gold, BANNER.x, 2.28, 0.12);
    for (const s of [-1, 1]) {
      add(new THREE.CylinderGeometry(0.004, 0.004, 0.18, 5).translate(0, -0.09, 0), P.gold, BANNER.x + s * 0.025, 2.27, 0.12);
      add(lathe([[0, 0], [0.02, -0.01], [0.026, -0.05], [0.032, -0.09], [0, -0.09]], 14), P.gold, BANNER.x + s * 0.025, 2.09, 0.12);
    }
    this.symbolTex = bannerTexture(unit.symbol, unit.color);
    this.blankTex = bannerTexture("?", "#5a6070");
    this.bannerU = { uMap: { value: this.blankTex }, uTime: { value: 0 }, uPhase: { value: k * 1.7 }, uLit: { value: 0 } };
    add(
      new THREE.PlaneGeometry(BANNER.w, BANNER.h, 32, 6).translate(BANNER.w / 2, 0, 0),
      new THREE.ShaderMaterial({ uniforms: this.bannerU, vertexShader: BANNER_VERT, fragmentShader: BANNER_FRAG, side: THREE.DoubleSide }),
      BANNER.x + 0.025,
      BANNER.y,
      0.12,
    ).castShadow = false;

    // Turned wooden pedestal with a ring in the unit colour.
    this.stand = new THREE.Group();
    this.stand.position.set(-0.62, 0, 0.2);
    this.group.add(this.stand);
    add(lathe([[0, 0], [0.25, 0], [0.26, 0.04], [0.21, 0.07], [0.15, 0.1], [0.13, 0.2], [0.15, 0.3], [0.13, 0.38], [0.19, 0.42], [0.24, 0.46], [0.24, 0.5], [0, 0.5]], 40), P.wood, 0, 0, 0, this.stand);
    this.ring = add(lathe([[0.152, 0.22], [0.162, 0.24], [0.162, 0.28], [0.152, 0.3]], 32), new THREE.MeshPhysicalMaterial({ color: unit.color, emissive: unit.color, emissiveIntensity: 0.1, roughness: 0.3, clearcoat: 1 }), 0, 0, 0, this.stand);
    this.demo = new DEMOS[k](unit.color);
    this.demo.group.position.y = 0.5;
    this.demo.group.traverse((o) => (o.castShadow = o.isMesh && !o.material.transparent));
    this.stand.add(this.demo.group);

    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.9).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }));
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
    const breath = 1 + 0.012 * Math.sin(t * 2.3 + this.k);
    this.torso.scale.set(breath, 1, breath);
    this.head.rotation.set(-hop * 0.4, Math.sin(t * 0.9 + this.k * 2) * 0.08, 0);
    const blink = (t * 0.31 + hash(this.k) * 7) % 3.7;
    const lid = blink < 0.14 ? 1 - Math.sin((blink / 0.14) * Math.PI) * 0.9 : 1;
    for (const e of this.eyes) e.scale.y = lid;
    this.tunic.emissiveIntensity = 0.04 + lit * 0.25;
    this.ring.material.emissiveIntensity = 0.1 + lit * 0.9;
    this.bannerU.uMap.value = named ? this.symbolTex : this.blankTex;
    this.bannerU.uTime.value = t;
    this.bannerU.uLit.value = lit;
    this.demo.group.scale.setScalar(Math.max(0.001, shown));
  }
}
