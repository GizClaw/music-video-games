import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { FONT_HEAVY, FONT_MONO } from "@gizclaw/mvg-core/hud.js";
import { hash, smooth } from "@gizclaw/mvg-core/timing.js";

// Each demonstrator stands on its pedestal top (y = 0) and is posed by
// update(t, beat, since): since is the time since its unit was last called.

export function canvasTexture(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** A turned profile [[r, y], …] as a smooth lathe; phiStart π puts the texture's middle at the front. */
export function lathe(points, segments = 48, phiStart = 0) {
  return new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), segments, phiStart);
}

const glass = () => new THREE.MeshPhysicalMaterial({ color: "#d8ecff", transparent: true, opacity: 0.22, roughness: 0.05, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false });
const brass = () => new THREE.MeshPhysicalMaterial({ color: "#d4a84a", metalness: 1, roughness: 0.25 });
const steel = () => new THREE.MeshPhysicalMaterial({ color: "#c9ced6", metalness: 1, roughness: 0.18 });
const hit = (since, life = 0.4) => (since >= 0 && since < life * 6 ? Math.exp(-since / life) : 0);

class MetreStick {
  constructor() {
    this.group = new THREE.Group();
    const tex = canvasTexture(160, 2048, (g, w, h) => {
      g.fillStyle = "#f2c94c";
      g.fillRect(0, 0, w, h);
      g.fillStyle = "#1a1a1a";
      for (let mm = 0; mm <= 1000; mm += 2) {
        const len = mm % 100 === 0 ? 0.62 : mm % 10 === 0 ? 0.4 : mm % 5 === 0 ? 0.26 : 0.16;
        g.fillRect(0, h - (mm / 1000) * h - 1, w * len, mm % 10 === 0 ? 3 : 1.5);
      }
      g.font = `700 34px ${FONT_MONO}`;
      g.textAlign = "center";
      for (let cm = 10; cm < 100; cm += 10) {
        g.save();
        g.translate(w * 0.8, h - (cm / 100) * h);
        g.rotate(-Math.PI / 2);
        g.fillText(String(cm), 0, 12);
        g.restore();
      }
      g.fillStyle = "#c0392b";
      g.font = `800 30px ${FONT_HEAVY}`;
      g.save();
      g.translate(w * 0.8, h * 0.06);
      g.rotate(-Math.PI / 2);
      g.fillText("1 m", 0, 10);
      g.restore();
    });
    const wood = new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.5, clearcoat: 0.6 });
    this.stick = new THREE.Group();
    this.stick.add(new THREE.Mesh(new RoundedBoxGeometry(0.1, 1, 0.03, 2, 0.008).translate(0, 0.5, 0), wood));
    for (const y of [0.012, 0.988]) this.stick.add(new THREE.Mesh(new RoundedBoxGeometry(0.106, 0.03, 0.036, 2, 0.006).translate(0, y, 0), brass()));
    this.group.add(this.stick);
    this.group.add(new THREE.Mesh(lathe([[0, 0], [0.09, 0], [0.09, 0.03], [0.06, 0.05], [0, 0.05]], 24), brass()));
  }

  update(t, beat, since) {
    this.stick.scale.y = 0.35 + 0.65 * smooth(0, 0.5, since < 0 ? 99 : since);
    this.stick.rotation.z = Math.sin(t * 1.3) * 0.04;
  }
}

class KilogramWeight {
  constructor() {
    this.group = new THREE.Group();
    const label = canvasTexture(512, 256, (g, w, h) => {
      g.fillStyle = "#ffffff";
      g.fillRect(0, 0, w, h);
      g.fillStyle = "#4a4e56";
      g.font = `800 56px ${FONT_HEAVY}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.translate(w / 2, h * 0.58);
      g.scale(1, 0.5);
      g.fillText("1 kg", 0, 0);
    });
    const body = new THREE.MeshPhysicalMaterial({ color: "#d2d6dc", metalness: 1, roughness: 0.16, map: label });
    this.body = new THREE.Group();
    this.body.add(new THREE.Mesh(lathe([[0, 0], [0.15, 0], [0.172, 0.02], [0.175, 0.05], [0.175, 0.19], [0.17, 0.215], [0.15, 0.23], [0.07, 0.24], [0, 0.24]], 64, Math.PI), body));
    this.body.add(new THREE.Mesh(lathe([[0.07, 0.24], [0.05, 0.255], [0.048, 0.28], [0.06, 0.29], [0.088, 0.31], [0.093, 0.34], [0.078, 0.37], [0.04, 0.385], [0, 0.39]], 48), steel()));
    this.group.add(this.body);
  }

  update(t, beat, since) {
    const fall = since >= 0 && since < 0.3 ? 0.7 * (1 - (since / 0.3) ** 2) : 0;
    const squash = since >= 0.3 ? 0.14 * Math.exp(-(since - 0.3) / 0.08) : 0;
    this.body.position.y = fall;
    this.body.scale.set(1 + squash, 1 - squash, 1 + squash);
  }
}

class Stopwatch {
  constructor() {
    this.group = new THREE.Group();
    const face = canvasTexture(512, 512, (g, w) => {
      const c = w / 2;
      g.fillStyle = "#f4f2ea";
      g.beginPath();
      g.arc(c, c, c, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "#1e1e22";
      for (let k = 0; k < 300; k++) {
        const a = (k / 300) * Math.PI * 2;
        const major = k % 25 === 0;
        const r0 = major ? 0.39 : k % 5 === 0 ? 0.43 : 0.455;
        g.lineWidth = major ? 7 : k % 5 === 0 ? 3 : 1.2;
        g.beginPath();
        g.moveTo(c + Math.sin(a) * w * r0, c - Math.cos(a) * w * r0);
        g.lineTo(c + Math.sin(a) * w * 0.48, c - Math.cos(a) * w * 0.48);
        g.stroke();
      }
      g.fillStyle = "#1e1e22";
      g.font = `700 40px ${FONT_HEAVY}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      for (let n = 5; n <= 60; n += 5) {
        const a = (n / 60) * Math.PI * 2;
        g.fillText(String(n), c + Math.sin(a) * w * 0.32, c - Math.cos(a) * w * 0.32);
      }
      g.strokeStyle = "#6a6a70";
      g.lineWidth = 3;
      g.beginPath();
      g.arc(c, c + w * 0.17, w * 0.08, 0, Math.PI * 2);
      g.stroke();
      g.font = `700 18px ${FONT_MONO}`;
      g.fillText("SECONDS", c, c - w * 0.15);
    });
    const chrome = steel();
    this.clock = new THREE.Group();
    this.clock.position.y = 0.36;
    this.group.add(this.clock);
    this.clock.add(new THREE.Mesh(lathe([[0, -0.045], [0.25, -0.045], [0.275, -0.03], [0.285, 0], [0.275, 0.03], [0.255, 0.045], [0.235, 0.048]], 64).rotateX(Math.PI / 2), chrome));
    const dial = new THREE.Mesh(new THREE.CircleGeometry(0.235, 64), new THREE.MeshPhysicalMaterial({ map: face, color: "#b4b2aa", roughness: 0.6 }));
    dial.position.z = 0.046;
    this.clock.add(dial);
    const red = new THREE.MeshPhysicalMaterial({ color: "#d42a2a", roughness: 0.35, clearcoat: 0.6 });
    this.hand = new THREE.Group();
    this.hand.position.z = 0.05;
    this.hand.add(new THREE.Mesh(new THREE.ConeGeometry(0.009, 0.2, 12).translate(0, 0.1, 0), red));
    this.hand.add(new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.012, 20).rotateX(Math.PI / 2), red));
    this.hand.add(new THREE.Mesh(new RoundedBoxGeometry(0.02, 0.06, 0.006, 2, 0.003).translate(0, -0.04, 0), red));
    this.clock.add(this.hand);
    this.sub = new THREE.Mesh(new RoundedBoxGeometry(0.006, 0.035, 0.004, 1, 0.002).translate(0, 0.016, 0), new THREE.MeshStandardMaterial({ color: "#222" }));
    this.sub.position.set(0, -0.04, 0.05);
    this.clock.add(this.sub);
    const dome = new THREE.Mesh(lathe([[0, 0.03], [0.12, 0.024], [0.2, 0.012], [0.235, 0]], 48).rotateX(Math.PI / 2), glass());
    dome.position.z = 0.047;
    dome.renderOrder = 2;
    this.clock.add(dome);
    const crown = new THREE.CylinderGeometry(0.035, 0.035, 0.07, 96, 1);
    const cp = crown.attributes.position;
    for (let i = 0; i < cp.count; i++) {
      const a = Math.atan2(cp.getZ(i), cp.getX(i));
      const r = 0.035 + 0.004 * (Math.cos(a * 24) > 0 ? 1 : 0);
      if (Math.hypot(cp.getX(i), cp.getZ(i)) > 0.01) cp.setXYZ(i, Math.cos(a) * r, cp.getY(i), Math.sin(a) * r);
    }
    crown.computeVertexNormals();
    this.clock.add(new THREE.Mesh(lathe([[0.02, 0.28], [0.022, 0.31]], 16), chrome));
    this.crown = new THREE.Mesh(crown.translate(0, 0.33, 0), chrome);
    this.clock.add(this.crown);
    this.clock.add(new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.012, 10, 32).translate(0, 0.41, 0), chrome));
    for (const s of [-1, 1]) {
      const btn = new THREE.Mesh(new THREE.CapsuleGeometry(0.014, 0.035, 4, 10), chrome);
      btn.position.set(s * 0.2, 0.2, 0);
      btn.rotation.z = -s * 0.8;
      this.clock.add(btn);
    }
    this.group.add(new THREE.Mesh(lathe([[0, 0], [0.11, 0], [0.11, 0.02], [0.03, 0.05], [0.025, 0.1], [0, 0.1]], 32), brass()));
  }

  update(t, beat, since) {
    const step = Math.floor(beat) + smooth(0, 0.12, beat - Math.floor(beat));
    this.hand.rotation.z = -(step / 60) * Math.PI * 2;
    this.sub.rotation.z = -(step / 3600) * Math.PI * 2;
    const press = hit(since, 0.12);
    this.crown.position.y = -press * 0.015;
    this.clock.position.y = 0.36 + press * 0.04;
  }
}

class BatteryBulb {
  constructor() {
    this.group = new THREE.Group();
    const label = canvasTexture(512, 256, (g, w, h) => {
      g.fillStyle = "#1d2026";
      g.fillRect(0, 0, w, h);
      g.fillStyle = "#e08a2a";
      g.fillRect(0, 0, w, h * 0.3);
      g.fillStyle = "#ffffff";
      g.font = `800 52px ${FONT_HEAVY}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("1.5 V", w / 2, h * 0.62);
      g.fillStyle = "#1d2026";
      g.fillText("+", w / 2, h * 0.15);
    });
    const can = new THREE.MeshPhysicalMaterial({ map: label, roughness: 0.3, clearcoat: 0.8 });
    const metal = steel();
    const cell = new THREE.Group();
    cell.position.x = -0.2;
    cell.add(new THREE.Mesh(lathe([[0, 0], [0.085, 0], [0.095, 0.012], [0.095, 0.32], [0.085, 0.332], [0, 0.332]], 48, Math.PI), can));
    cell.add(new THREE.Mesh(lathe([[0, 0.332], [0.03, 0.332], [0.03, 0.36], [0, 0.362]], 20), metal));
    this.group.add(cell);
    const socket = new THREE.Group();
    socket.position.set(0.2, 0, 0);
    socket.add(new THREE.Mesh(lathe([[0, 0], [0.09, 0], [0.09, 0.05], [0.05, 0.07], [0, 0.07]], 32), new THREE.MeshPhysicalMaterial({ color: "#2a2a30", roughness: 0.4, clearcoat: 0.6 })));
    const thread = lathe(Array.from({ length: 13 }, (_, i) => [0.034 + (i % 2) * 0.006, 0.07 + i * 0.008]), 32);
    socket.add(new THREE.Mesh(thread, brass()));
    const bulb = new THREE.Mesh(lathe([[0.033, 0.17], [0.05, 0.2], [0.085, 0.27], [0.095, 0.33], [0.08, 0.39], [0.045, 0.42], [0, 0.43]], 40), glass());
    bulb.renderOrder = 2;
    socket.add(bulb);
    this.filamentMat = new THREE.MeshBasicMaterial({ color: "#ffd27a" });
    const coil = Array.from({ length: 40 }, (_, i) => {
      const a = (i / 40) * Math.PI * 10;
      return new THREE.Vector3(-0.03 + (i / 39) * 0.06, 0.31 + Math.sin(a) * 0.008, Math.cos(a) * 0.008);
    });
    socket.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(coil), 60, 0.0025, 5), this.filamentMat));
    for (const s of [-1, 1]) socket.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(s * 0.01, 0.17, 0), new THREE.Vector3(s * 0.025, 0.25, 0), new THREE.Vector3(s * 0.03, 0.31, 0)]), 10, 0.002, 4), metal));
    this.glow = new THREE.PointLight("#ffcf7a", 0, 1.5, 2);
    this.glow.position.y = 0.31;
    socket.add(this.glow);
    this.group.add(socket);
    this.curve = new THREE.CatmullRomCurve3([
      [-0.2, 0.36, 0], [-0.18, 0.5, 0.02], [0.0, 0.56, 0.05], [0.16, 0.35, 0.05], [0.16, 0.08, 0.06], [0.1, 0.02, 0.06], [-0.05, 0.02, 0.1], [-0.2, 0.0, 0.08],
    ].map((p) => new THREE.Vector3(...p)));
    this.group.add(new THREE.Mesh(new THREE.TubeGeometry(this.curve, 96, 0.012, 10), new THREE.MeshPhysicalMaterial({ color: "#c62e2e", roughness: 0.35, clearcoat: 0.8 })));
    this.dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.016, 10, 8), new THREE.MeshBasicMaterial({ color: "#ffe14a" }), 10);
    this.group.add(this.dots);
    this.dummy = new THREE.Object3D();
  }

  update(t, beat, since) {
    const boost = hit(since, 0.6);
    for (let i = 0; i < 10; i++) {
      this.dummy.position.copy(this.curve.getPointAt((i / 10 + t * (0.25 + boost * 0.6)) % 1));
      this.dummy.position.z += 0.015;
      this.dummy.scale.setScalar(0.7 + boost * 0.6);
      this.dummy.updateMatrix();
      this.dots.setMatrixAt(i, this.dummy.matrix);
    }
    this.dots.instanceMatrix.needsUpdate = true;
    const glow = 0.45 + boost * 0.55 + Math.sin(t * 31) * 0.02;
    this.filamentMat.color.set("#ffd27a").multiplyScalar(0.6 + glow);
    this.glow.intensity = glow * 0.6;
  }
}

class Thermometer {
  constructor() {
    this.group = new THREE.Group();
    const scale = canvasTexture(256, 1024, (g, w, h) => {
      g.fillStyle = "#f6f1e4";
      g.fillRect(0, 0, w, h);
      g.fillStyle = "#1e1e22";
      const yOf = (k) => h * 0.86 - ((k - 250) / 125) * h * 0.72;
      for (let k = 250; k <= 375; k += 5) {
        const major = k % 25 === 0;
        g.fillRect(w * 0.56, yOf(k) - (major ? 2 : 1), w * (major ? 0.2 : 0.11), major ? 4 : 2);
      }
      g.font = `700 34px ${FONT_MONO}`;
      g.textAlign = "left";
      g.textBaseline = "middle";
      for (let k = 250; k <= 375; k += 25) g.fillText(String(k), w * 0.08, yOf(k));
      g.font = `800 64px ${FONT_HEAVY}`;
      g.textAlign = "center";
      g.fillStyle = "#c0392b";
      g.fillText("K", w * 0.5, h * 0.06);
    });
    const board = new THREE.Mesh(new RoundedBoxGeometry(0.24, 0.92, 0.03, 3, 0.012), [
      ...Array(4).fill(new THREE.MeshPhysicalMaterial({ color: "#8a6240", roughness: 0.5, clearcoat: 0.6 })),
      new THREE.MeshPhysicalMaterial({ map: scale, color: "#a8a498", roughness: 0.6, clearcoat: 0.3 }),
      new THREE.MeshPhysicalMaterial({ color: "#8a6240", roughness: 0.5 }),
    ]);
    board.position.set(0, 0.48, -0.03);
    this.group.add(board);
    const red = new THREE.MeshPhysicalMaterial({ color: "#d42020", roughness: 0.25, clearcoat: 1, emissive: "#ff2a2a", emissiveIntensity: 0.12 });
    this.group.add(new THREE.Mesh(new THREE.SphereGeometry(0.036, 20, 14).translate(0.025, 0.11, 0.015), red));
    this.column = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 1, 10).translate(0, 0.5, 0), red);
    this.column.position.set(0.025, 0.12, 0.015);
    this.group.add(this.column);
    const tube = new THREE.Mesh(lathe([[0, 0.065], [0.03, 0.075], [0.046, 0.11], [0.03, 0.15], [0.02, 0.17], [0.02, 0.86], [0.012, 0.88], [0, 0.885]], 32), glass());
    tube.position.set(0.025, 0, 0.015);
    tube.renderOrder = 2;
    this.group.add(tube);
    for (const y of [0.2, 0.8]) this.group.add(new THREE.Mesh(new RoundedBoxGeometry(0.07, 0.018, 0.03, 2, 0.006).translate(0.025, y, 0.004), brass()));
  }

  update(t, beat, since) {
    const warm = since < 0 ? 0 : smooth(0, 0.8, since);
    this.column.scale.y = Math.max(0.01, 0.2 + 0.42 * warm + hit(since, 0.3) * 0.06 + Math.sin(t * 2) * 0.004);
  }
}

class MoleJar {
  constructor(color) {
    this.group = new THREE.Group();
    const jar = new THREE.Mesh(lathe([[0, 0.002], [0.17, 0], [0.2, 0.02], [0.21, 0.06], [0.21, 0.36], [0.195, 0.4], [0.15, 0.43], [0.14, 0.45], [0.14, 0.47]], 64), glass());
    jar.renderOrder = 2;
    this.group.add(jar);
    const lid = lathe([[0.13, 0.45], ...Array.from({ length: 9 }, (_, i) => [0.155 + (i % 2) * 0.006, 0.455 + i * 0.008]), [0.15, 0.53], [0.1, 0.535], [0, 0.535]], 64);
    this.group.add(new THREE.Mesh(lid, new THREE.MeshPhysicalMaterial({ color: "#c8ccd4", metalness: 1, roughness: 0.3 })));
    this.group.add(new THREE.Mesh(lathe([[0.212, 0.16], [0.212, 0.27]], 64, Math.PI), new THREE.MeshPhysicalMaterial({ color: new THREE.Color(color).multiplyScalar(0.7), roughness: 0.6, side: THREE.DoubleSide })));
    const n = 70;
    this.seeds = Array.from({ length: n }, (_, i) => {
      const a = hash(i * 1.7) * Math.PI * 2;
      const r = Math.sqrt(hash(i * 2.9)) * 0.15;
      return [Math.cos(a) * r, 0.04 + (i / n) * 0.3, Math.sin(a) * r, hash(i * 4.1) * 6.28, 0.7 + hash(i * 6.3) * 0.5];
    });
    this.balls = new THREE.InstancedMesh(new THREE.SphereGeometry(0.035, 14, 10), new THREE.MeshPhysicalMaterial({ roughness: 0.25, clearcoat: 1 }), n);
    const pal = [color, "#5ab0e0", "#e0b050", "#d07090", "#7cd88a"].map((c) => new THREE.Color(c).multiplyScalar(0.8));
    for (let i = 0; i < n; i++) this.balls.setColorAt(i, pal[i % pal.length]);
    this.group.add(this.balls);
    this.dummy = new THREE.Object3D();
  }

  update(t, beat, since) {
    const shake = 0.01 + hit(since, 0.5) * 0.04;
    this.seeds.forEach(([x, y, z, ph, s], i) => {
      this.dummy.position.set(x + Math.sin(t * 9 + ph) * shake, y + Math.abs(Math.sin(t * 11 + ph * 2)) * shake * 1.5, z + Math.cos(t * 8 + ph) * shake);
      this.dummy.scale.setScalar(s);
      this.dummy.updateMatrix();
      this.balls.setMatrixAt(i, this.dummy.matrix);
    });
    this.balls.instanceMatrix.needsUpdate = true;
  }
}

const FLAME_FRAG = /* glsl */ `
  uniform float uGlow, uTime; varying vec3 vP; varying vec3 vN; varying vec3 vV;
  void main() {
    float y = clamp(vP.y / 0.14, 0.0, 1.0);
    float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.5);
    vec3 c = mix(vec3(0.25, 0.45, 1.0), vec3(1.0, 0.86, 0.5), smoothstep(0.0, 0.25, y));
    c = mix(c, vec3(1.0, 0.5, 0.12), smoothstep(0.45, 1.0, y) * rim);
    gl_FragColor = vec4(c * uGlow * (1.0 - rim * 0.6), 1.0);
  }`;

class Candle {
  constructor() {
    this.group = new THREE.Group();
    const holder = brass();
    this.group.add(new THREE.Mesh(lathe([[0, 0], [0.2, 0], [0.22, 0.015], [0.21, 0.035], [0.15, 0.04], [0.12, 0.06], [0.125, 0.09], [0, 0.09]], 48), holder));
    const loop = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 10, 28), holder);
    loop.position.set(0.24, 0.03, 0);
    this.group.add(loop);
    const wax = lathe([[0, 0.08], [0.1, 0.08], [0.1, 0.42], [0.094, 0.44], [0.07, 0.43], [0.02, 0.425], [0, 0.425]], 64);
    const p = wax.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      const r = Math.hypot(x, z);
      if (r < 0.09) continue;
      const a = Math.atan2(z, x);
      let drip = 0;
      for (let d = 0; d < 5; d++) {
        const da = Math.atan2(Math.sin(a - d * 1.3 - 0.4), Math.cos(a - d * 1.3 - 0.4));
        const len = 0.08 + hash(d * 3.1) * 0.18;
        drip = Math.max(drip, Math.exp(-(da * da) / 0.012) * smooth(0.42 - len, 0.42 - len + 0.04, y));
      }
      const k = 1 + drip * 0.12 + (y > 0.4 ? 0.03 : 0);
      p.setXYZ(i, x * k, y, z * k);
    }
    wax.computeVertexNormals();
    this.group.add(new THREE.Mesh(wax, new THREE.MeshPhysicalMaterial({ color: "#d8ccb4", roughness: 0.5, clearcoat: 0.2, sheen: 0.4, sheenColor: new THREE.Color("#fff2dc") })));
    this.group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.42, 0), new THREE.Vector3(0.004, 0.45, 0), new THREE.Vector3(0.01, 0.47, 0)]), 8, 0.004, 6), new THREE.MeshBasicMaterial({ color: "#1a1410" })));
    this.flameU = { uGlow: { value: 1 }, uTime: { value: 0 } };
    this.flame = new THREE.Mesh(
      lathe([[0, 0], [0.025, 0.02], [0.035, 0.05], [0.03, 0.09], [0.015, 0.125], [0, 0.145]], 24),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: this.flameU,
        vertexShader: "varying vec3 vP; varying vec3 vN; varying vec3 vV; void main(){ vP = position; vN = normalMatrix * normal; vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }",
        fragmentShader: FLAME_FRAG,
      }),
    );
    this.flameHolder = new THREE.Group();
    this.flameHolder.position.y = 0.455;
    this.flameHolder.add(this.flame);
    this.halo = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 12), new THREE.MeshBasicMaterial({ color: "#ff9a3a", transparent: true, opacity: 0.15, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.halo.position.y = 0.06;
    this.flameHolder.add(this.halo);
    this.group.add(this.flameHolder);
    this.light = new THREE.PointLight("#ffb05a", 0, 3, 2);
    this.light.position.set(0, 0.85, 0.25);
    this.group.add(this.light);
  }

  update(t, beat, since) {
    const lit = since < 0 ? 0 : smooth(0, 0.3, since);
    const boost = hit(since, 0.8);
    const flick = 1 + Math.sin(t * 23) * 0.07 + Math.sin(t * 37 + 1) * 0.05 + Math.sin(t * 61) * 0.03;
    this.flameHolder.visible = lit > 0.01;
    this.flameHolder.scale.set(lit * (1 + boost * 0.5), lit * flick * (1 + boost * 0.7), lit * (1 + boost * 0.5));
    this.flameHolder.rotation.z = Math.sin(t * 5.3) * 0.08;
    this.flameU.uGlow.value = 0.85 + boost * 0.4;
    this.halo.material.opacity = 0.12 + boost * 0.15;
    this.light.intensity = lit * (0.5 + boost * 1.2) * flick;
  }
}

export const DEMOS = [MetreStick, KilogramWeight, Stopwatch, BatteryBulb, Thermometer, MoleJar, Candle];
