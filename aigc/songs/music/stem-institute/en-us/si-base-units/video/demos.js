import * as THREE from "three";
import { hash, smooth } from "@gizclaw/mvg-core/timing.js";

// Each demonstrator stands on its pedestal top (y = 0) and is posed by
// update(t, beat, since): since is the time since its unit was last called.

function canvasTexture(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

const glass = () => new THREE.MeshStandardMaterial({ color: "#a8c8e8", transparent: true, opacity: 0.16, roughness: 0.1, depthWrite: false });
const hit = (since, life = 0.4) => (since >= 0 && since < life * 6 ? Math.exp(-since / life) : 0);

class MetreStick {
  constructor() {
    this.group = new THREE.Group();
    const tex = canvasTexture(64, 1024, (g, w, h) => {
      for (let d = 0; d < 10; d++) {
        g.fillStyle = d % 2 ? "#f4f0e2" : "#f2c230";
        g.fillRect(0, h - ((d + 1) * h) / 10, w, h / 10);
      }
      g.fillStyle = "#1a1a1a";
      for (let k = 0; k <= 100; k++) {
        const len = k % 10 === 0 ? 0.75 : k % 5 === 0 ? 0.5 : 0.28;
        g.fillRect(0, h - (k / 100) * h - 2, w * len, 4);
      }
    });
    this.stick = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1, 0.035).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }));
    this.group.add(this.stick);
  }

  update(t, beat, since) {
    this.stick.scale.y = 0.35 + 0.65 * smooth(0, 0.5, since < 0 ? 99 : since);
    this.stick.rotation.z = Math.sin(t * 1.3) * 0.04;
  }
}

class KilogramWeight {
  constructor() {
    this.group = new THREE.Group();
    const brass = new THREE.MeshStandardMaterial({ color: "#c9a24a", metalness: 0.85, roughness: 0.3 });
    this.body = new THREE.Group();
    const can = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.18, 0.24, 32).translate(0, 0.12, 0), brass);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.07, 20).translate(0, 0.27, 0), brass);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.085, 20, 14).translate(0, 0.34, 0), brass);
    this.body.add(can, neck, knob);
    this.group.add(this.body);
  }

  update(t, beat, since) {
    const fall = since >= 0 && since < 0.3 ? 0.7 * (1 - (since / 0.3) ** 2) : 0;
    const squash = since >= 0.3 ? 0.18 * Math.exp(-(since - 0.3) / 0.08) : 0;
    this.body.position.y = fall;
    this.body.scale.set(1 + squash, 1 - squash, 1 + squash);
  }
}

class Stopwatch {
  constructor() {
    this.group = new THREE.Group();
    const steel = new THREE.MeshStandardMaterial({ color: "#c8ced8", metalness: 0.85, roughness: 0.25 });
    const face = canvasTexture(256, 256, (g, w) => {
      g.fillStyle = "#c9ccc8";
      g.beginPath();
      g.arc(w / 2, w / 2, w / 2, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = "#222";
      for (let k = 0; k < 60; k++) {
        const a = (k / 60) * Math.PI * 2;
        const r0 = k % 5 === 0 ? 0.36 : 0.42;
        g.lineWidth = k % 5 === 0 ? 6 : 2;
        g.beginPath();
        g.moveTo(w / 2 + Math.sin(a) * w * r0, w / 2 - Math.cos(a) * w * r0);
        g.lineTo(w / 2 + Math.sin(a) * w * 0.47, w / 2 - Math.cos(a) * w * 0.47);
        g.stroke();
      }
    });
    this.clock = new THREE.Group();
    this.clock.position.y = 0.32;
    this.group.add(this.clock);
    this.clock.add(new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.08, 40).rotateX(Math.PI / 2), steel));
    const dial = new THREE.Mesh(new THREE.CircleGeometry(0.23, 40), new THREE.MeshStandardMaterial({ map: face, roughness: 0.5 }));
    dial.position.z = 0.042;
    this.clock.add(dial);
    this.hand = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.2, 0.01).translate(0, 0.08, 0), new THREE.MeshStandardMaterial({ color: "#e0262e", roughness: 0.4 }));
    this.hand.position.z = 0.05;
    this.clock.add(this.hand);
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.08, 16).translate(0, 0.31, 0), steel);
    this.clock.add(crown, new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.015, 8, 20).translate(0, 0.38, 0), steel));
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.08, 0.06, 16).translate(0, 0.03, 0), steel);
    this.group.add(stand);
  }

  update(t, beat, since) {
    const step = Math.floor(beat) + smooth(0, 0.12, beat - Math.floor(beat));
    this.hand.rotation.z = -(step / 60) * Math.PI * 2;
    this.clock.position.y = 0.32 + hit(since, 0.15) * 0.06;
  }
}

class Battery {
  constructor() {
    this.group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.34, 24).translate(0, 0.17, 0), new THREE.MeshStandardMaterial({ color: "#2a2d34", roughness: 0.4 }));
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.102, 0.102, 0.1, 24).translate(0, 0.29, 0), new THREE.MeshStandardMaterial({ color: "#d88a2a", metalness: 0.6, roughness: 0.35 }));
    const nub = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.04, 12).translate(0, 0.36, 0), new THREE.MeshStandardMaterial({ color: "#c8ced8", metalness: 0.9, roughness: 0.2 }));
    body.position.x = -0.18;
    band.position.x = -0.18;
    nub.position.x = -0.18;
    this.group.add(body, band, nub);
    this.curve = new THREE.CatmullRomCurve3([
      [-0.18, 0.38, 0], [-0.1, 0.58, 0], [0.12, 0.62, 0], [0.28, 0.45, 0], [0.28, 0.12, 0], [0.12, 0.02, 0], [-0.08, 0.02, 0], [-0.18, 0.0, 0],
    ].map((p) => new THREE.Vector3(...p)));
    this.wireMat = new THREE.MeshStandardMaterial({ color: "#c46a2a", metalness: 0.7, roughness: 0.3, emissive: "#ff9a3a", emissiveIntensity: 0.1 });
    this.group.add(new THREE.Mesh(new THREE.TubeGeometry(this.curve, 80, 0.018, 8), this.wireMat));
    this.dots = Array.from({ length: 10 }, () => {
      const d = new THREE.Mesh(new THREE.SphereGeometry(0.026, 10, 8), new THREE.MeshBasicMaterial({ color: "#ffe14a" }));
      this.group.add(d);
      return d;
    });
  }

  update(t, beat, since) {
    const boost = hit(since, 0.6);
    this.wireMat.emissiveIntensity = 0.1 + boost * 0.6;
    this.dots.forEach((d, i) => {
      d.position.copy(this.curve.getPointAt((i / 10 + t * (0.25 + boost * 0.6)) % 1));
      d.material.color.set("#ffe14a").multiplyScalar(0.6 + boost * 0.8);
    });
  }
}

class Thermometer {
  constructor() {
    this.group = new THREE.Group();
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.86, 0.03).translate(0, 0.45, -0.06), new THREE.MeshStandardMaterial({ color: "#7d8a96", roughness: 0.6 }));
    this.group.add(plate);
    const red = new THREE.MeshStandardMaterial({ color: "#e02a2a", roughness: 0.3, emissive: "#ff2a2a", emissiveIntensity: 0.15 });
    this.group.add(new THREE.Mesh(new THREE.SphereGeometry(0.075, 20, 14).translate(0, 0.1, 0), red));
    this.column = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1, 12).translate(0, 0.5, 0), red);
    this.column.position.y = 0.12;
    this.group.add(this.column);
    this.group.add(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.72, 16, 1, true).translate(0, 0.48, 0), glass()));
    for (let k = 0; k < 9; k++) {
      const tick = new THREE.Mesh(new THREE.BoxGeometry(k % 2 ? 0.04 : 0.07, 0.008, 0.01), new THREE.MeshBasicMaterial({ color: "#333" }));
      tick.position.set(0.075, 0.2 + k * 0.075, -0.04);
      this.group.add(tick);
    }
  }

  update(t, beat, since) {
    const warm = since < 0 ? 0 : smooth(0, 0.8, since);
    this.column.scale.y = Math.max(0.01, 0.2 + 0.42 * warm + hit(since, 0.3) * 0.06 + Math.sin(t * 2) * 0.005);
  }
}

class MoleJar {
  constructor(color) {
    this.group = new THREE.Group();
    this.group.add(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.2, 0.46, 32, 1, true).translate(0, 0.23, 0), glass()));
    this.group.add(new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.015, 8, 32).rotateX(Math.PI / 2).translate(0, 0.46, 0), new THREE.MeshStandardMaterial({ color: "#8fb0d0", roughness: 0.2 })));
    const n = 42;
    this.seeds = Array.from({ length: n }, (_, i) => {
      const a = hash(i * 1.7) * Math.PI * 2;
      const r = Math.sqrt(hash(i * 2.9)) * 0.15;
      return [Math.cos(a) * r, 0.05 + (i / n) * 0.34, Math.sin(a) * r, hash(i * 4.1) * 6.28];
    });
    this.balls = new THREE.InstancedMesh(new THREE.SphereGeometry(0.045, 12, 8), new THREE.MeshStandardMaterial({ roughness: 0.35 }), n);
    const pal = [color, "#5ab0e0", "#e0b050", "#d07090"].map((c) => new THREE.Color(c).multiplyScalar(0.8));
    for (let i = 0; i < n; i++) this.balls.setColorAt(i, pal[i % pal.length]);
    this.group.add(this.balls);
    this.dummy = new THREE.Object3D();
  }

  update(t, beat, since) {
    const shake = 0.012 + hit(since, 0.5) * 0.05;
    this.seeds.forEach(([x, y, z, ph], i) => {
      this.dummy.position.set(x + Math.sin(t * 9 + ph) * shake, y + Math.abs(Math.sin(t * 11 + ph * 2)) * shake * 1.5, z + Math.cos(t * 8 + ph) * shake);
      this.dummy.updateMatrix();
      this.balls.setMatrixAt(i, this.dummy.matrix);
    });
    this.balls.instanceMatrix.needsUpdate = true;
  }
}

class Candle {
  constructor() {
    this.group = new THREE.Group();
    this.group.add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.42, 28).translate(0, 0.21, 0), new THREE.MeshStandardMaterial({ color: "#f2e8d2", roughness: 0.7 })));
    this.group.add(new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.06, 6).translate(0, 0.45, 0), new THREE.MeshBasicMaterial({ color: "#222" })));
    this.flame = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 20, 14).translate(0, 0.06, 0),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uGlow: { value: 1 } },
        vertexShader: "varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
        fragmentShader: "uniform float uGlow; varying vec3 vP; void main(){ float y = clamp((vP.y - 0.01) / 0.1, 0.0, 1.0); vec3 c = mix(vec3(1.0, 0.85, 0.45), vec3(1.0, 0.45, 0.1), y); gl_FragColor = vec4(c * uGlow * 0.9, 1.0); }",
      }),
    );
    this.flameHolder = new THREE.Group();
    this.flameHolder.position.y = 0.46;
    this.flameHolder.add(this.flame);
    this.group.add(this.flameHolder);
    this.light = new THREE.PointLight("#ffb05a", 0, 3, 2);
    this.light.position.y = 0.6;
    this.group.add(this.light);
  }

  update(t, beat, since) {
    const lit = since < 0 ? 0 : smooth(0, 0.3, since);
    const boost = hit(since, 0.8);
    const flick = 1 + Math.sin(t * 23) * 0.08 + Math.sin(t * 37) * 0.05;
    this.flameHolder.scale.set(lit * (1 + boost * 0.5), lit * flick * (1.3 + boost * 0.8), lit * (1 + boost * 0.5));
    this.flameHolder.visible = lit > 0.01;
    this.flame.material.uniforms.uGlow.value = 0.8 + boost * 0.5;
    this.light.intensity = lit * (1.2 + boost * 2.5) * flick;
  }
}

export const DEMOS = [MetreStick, KilogramWeight, Stopwatch, Battery, Thermometer, MoleJar, Candle];
