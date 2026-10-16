import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { FONT_COND, FONT_MONO } from "@gizclaw/mvg-core/hud.js";
import { clamp, easeInOut, easeOutBack, hash, lerp, smooth } from "@gizclaw/mvg-core/timing.js";
import { beanGeometry, bladeGeometry, brassMaterial, canvasTexture, lathe, leafTexture, mesh, rbox, seedTexture, speckleTexture, taperTube, woodTexture } from "./parts.js";

// What the magnifier sees: a separate close-up world, rendered into the lens
// every frame. Stations sit far apart along x; the macro camera glides between
// them as the lens glides between subjects on the bench. One unit here is 1 mm
// for the seed, soil and leaf, 1 cm on the ruler and 1.2 cm on the notebook.

const AT = { seed: 0, soil: 40, leaf: 80, ruler: 120, paper: 160 };
const PAPER = { w: 6.4, h: 9.6, px: 120 };
const PAGE_W = 768;
const PAGE_H = 1152;
const INK = "#24324a";
const PENCIL = "#2b3a6a";

/** Where on the notebook page each paper station looks, in page pixels, and how far back. */
const PAGE_VIEW = { hypo: [384, 205, 10.5], table: [372, 540, 12], chart: [400, 885, 9.5], check: [470, 1065, 9.5], paper: [384, 576, 18.5] };
const pageToPlane = (x, y) => [(x - PAGE_W / 2) / PAPER.px, (PAGE_H / 2 - y) / PAPER.px];

const BOKEH = /* glsl */ `
  uniform vec3 uTint; uniform float uTime; varying vec2 vUv;
  float h21(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
  void main() {
    vec3 col = uTint * (0.55 + 0.45 * vUv.y);
    for (int i = 0; i < 14; i++) {
      float fi = float(i);
      vec2 c = vec2(h21(vec2(fi, 1.3)), h21(vec2(fi, 7.1))) + vec2(sin(uTime * 0.1 + fi), cos(uTime * 0.13 + fi)) * 0.02;
      float r = 0.05 + h21(vec2(fi, 3.7)) * 0.1;
      float d = length(vUv - c);
      col += vec3(1.0, 0.95, 0.75) * smoothstep(r, r * 0.8, d) * 0.06 * h21(vec2(fi, 9.2));
    }
    gl_FragColor = vec4(col, 1.0);
  }`;

const LEAF = /* glsl */ `
  uniform float uTime; varying vec2 vUv;
  vec2 h22(vec2 p) { return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453); }
  // Distance to the nearest Voronoi edge, and that cell's id.
  vec3 voro(vec2 p) {
    vec2 n = floor(p), f = fract(p);
    float d1 = 8.0, d2 = 8.0; vec2 id = vec2(0.0);
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 o = 0.5 + 0.4 * sin(6.2831 * h22(n + g));
      float d = length(g + o - f);
      if (d < d1) { d2 = d1; d1 = d; id = n + g; } else if (d < d2) d2 = d;
    }
    return vec3(d2 - d1, id);
  }
  void main() {
    vec2 p = (vUv - 0.5) * vec2(9.0, 6.0);
    float mid = smoothstep(0.16, 0.05, abs(p.y));
    float side = fract((p.x - 0.75 * abs(p.y)) * 0.42);
    float lateral = smoothstep(0.06, 0.0, abs(side - 0.5) - 0.01) * smoothstep(0.1, 0.6, abs(p.y));
    vec3 net = voro(p * 1.2);
    float veinlet = smoothstep(0.06, 0.0, net.x);
    vec3 cell = voro(p * 7.0);
    float wall = smoothstep(0.07, 0.0, cell.x);
    float dome = smoothstep(0.0, 0.45, cell.x);
    vec3 col = mix(vec3(0.05, 0.2, 0.03), vec3(0.09, 0.3, 0.05), dome);
    col *= 0.85 + 0.3 * h22(cell.yz).x;
    col = mix(col, vec3(0.03, 0.12, 0.02), wall * 0.7);
    // Chloroplasts glimpsed inside each cell.
    vec3 cp = voro(p * 30.0);
    col += vec3(0.04, 0.12, 0.02) * smoothstep(0.25, 0.4, cp.x) * dome;
    // Stomata: a guard-cell pair in some cells.
    vec2 sc = fract(p * 1.6) - 0.5;
    float hasSt = step(0.82, h22(floor(p * 1.6) + 3.1).x);
    float guard = smoothstep(0.1, 0.07, length(sc * vec2(1.0, 1.8))) - smoothstep(0.04, 0.02, abs(sc.y) + abs(sc.x) * 0.3);
    col = mix(col, vec3(0.16, 0.38, 0.08), clamp(guard, 0.0, 1.0) * hasSt);
    vec3 veinCol = vec3(0.24, 0.48, 0.1);
    col = mix(col, veinCol, max(mid, max(lateral * 0.85, veinlet * 0.55)));
    col *= 0.9 + 0.2 * smoothstep(-3.0, 3.0, p.y + p.x * 0.2);
    gl_FragColor = vec4(col, 1.0);
  }`;

/** The notebook page: question, hypothesis, variables, heights table, bar chart and conclusion, written on in time. */
export class Notebook {
  constructor(plan, cm) {
    this.plan = plan;
    this.cm = cm;
    this.canvas = document.createElement("canvas");
    this.canvas.width = PAGE_W;
    this.canvas.height = PAGE_H;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8;
    this.key = "";
    const p = plan;
    const rowY = (r) => 470 + r * 66;
    this.lines = [
      { t0: p.q, dur: 1.4, x: 50, y: 150, size: 40, text: "Q: Do beans grow taller in more sun?", color: INK },
      { t0: p.hypo, dur: 1.3, x: 50, y: 240, size: 50, text: "Hypothesis: more sun → taller", color: PENCIL },
      { t0: p.vars, dur: 1.4, x: 50, y: 316, size: 34, text: "Change: sunlight · Keep: water, soil, seeds", color: INK },
      ...p.rows.map((t0, r) => ({ t0, dur: 0.5, x: 70, y: rowY(r), size: 50, row: r, color: PENCIL })),
      { t0: p.concl, dur: 1.2, x: 50, y: 1090, size: 46, text: "Conclusion: YES! more sun → taller", color: PENCIL },
    ];
    this.rowY = rowY;
  }

  progress(t) {
    return this.lines.map((l) => clamp((t - l.t0) / l.dur, 0, 1));
  }

  /** Pencil tip in page pixels and whether it is writing. */
  pencil(t) {
    const prog = this.progress(t);
    let best = null;
    this.lines.forEach((l, i) => {
      if (t >= l.t0 - 0.3 && (!best || l.t0 > best.l.t0)) best = { l, p: prog[i] };
    });
    if (!best) return { x: 600, y: 200, down: 0 };
    const w = best.l.row !== undefined ? 560 : best.l.text.length * best.l.size * 0.42;
    return { x: best.l.x + w * best.p, y: best.l.y + 10, down: best.p > 0 && best.p < 1 ? 1 : smooth(0.4, 0, t - best.l.t0 - best.l.dur) };
  }

  draw(t, day) {
    const prog = this.progress(t);
    const p = this.plan;
    const bars = p.bars.map((b) => (t >= b - 0.05 ? easeOutBack(clamp((t - b + 0.05) / 0.45, 0, 1)) : 0));
    const trend = smooth(p.trend, p.trend + 0.5, t);
    const stamp = t >= p.stamp ? clamp((t - p.stamp) / 0.15, 0, 1) : 0;
    const hl = smooth(p.highlight - 0.1, p.highlight + 0.2, t);
    const key = [...prog, ...bars, trend, stamp, hl, Math.floor(day)].map((v) => Math.round(v * 60)).join(",");
    if (key === this.key) return;
    this.key = key;
    const g = this.canvas.getContext("2d");
    g.fillStyle = "#f7f1e1";
    g.fillRect(0, 0, PAGE_W, PAGE_H);
    for (let i = 0; i < 400; i++) {
      g.fillStyle = `rgba(160,140,100,${0.04 + hash(i) * 0.05})`;
      g.fillRect(hash(i * 1.3) * PAGE_W, hash(i * 2.9) * PAGE_H, 2, 2);
    }
    g.strokeStyle = "rgba(80,130,200,0.2)";
    g.lineWidth = 2;
    for (let y = 196; y < PAGE_H; y += 38) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(PAGE_W, y);
      g.stroke();
    }
    g.strokeStyle = "rgba(220,80,80,0.35)";
    g.beginPath();
    g.moveTo(36, 0);
    g.lineTo(36, PAGE_H);
    g.stroke();
    const text = (s, x, y, size, color, align = "left", family = FONT_COND) => {
      g.font = `800 ${size}px ${family}`;
      g.fillStyle = color;
      g.textAlign = align;
      g.textBaseline = "middle";
      g.fillText(s, x, y);
    };
    text("BEAN EXPERIMENT", 50, 70, 60, INK);
    text(`DAY ${Math.floor(day)}`, PAGE_W - 40, 72, 32, "#a04030", "right", FONT_MONO);

    const cols = [110, 290, 460, 630];
    if (hl > 0) {
      g.fillStyle = `rgba(255,220,60,${0.55 * hl})`;
      g.fillRect(cols[3] - 70, 370, 140, 66 * 5);
    }
    ["DAY", "SHADE", "HALF", "FULL"].forEach((s, c) => text(s, cols[c], 400, 38, INK, "center"));
    g.strokeStyle = INK;
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(50, 432);
    g.lineTo(PAGE_W - 40, 432);
    g.moveTo(195, 372);
    g.lineTo(195, 700);
    g.stroke();

    this.lines.forEach((l, i) => {
      const k = prog[i];
      if (k <= 0) return;
      g.save();
      const w = l.row !== undefined ? PAGE_W : l.text.length * l.size * 0.42 + 40;
      g.beginPath();
      g.rect(0, l.y - l.size, l.x + w * k, l.size * 2);
      g.clip();
      if (l.row !== undefined) {
        const d = p.days[l.row];
        text(String(d), cols[0], l.y, l.size, l.color, "center");
        for (let c = 0; c < 3; c++) text(String(this.cm(c, d)), cols[c + 1], l.y, l.size, l.color, "center");
      } else text(l.text, l.x, l.y, l.size, l.color);
      g.restore();
    });

    const base = 990;
    const top = 790;
    g.strokeStyle = INK;
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(130, top - 30);
    g.lineTo(130, base);
    g.lineTo(PAGE_W - 60, base);
    g.stroke();
    const colors = ["#6f9c86", "#8cc84a", "#f2b51d"];
    const labels = ["SHADE", "HALF", "FULL"];
    [235, 405, 575].forEach((x, k) => {
      const v = this.cm(k, 12);
      const h = ((base - top) * v * bars[k]) / 20;
      g.fillStyle = colors[k];
      g.fillRect(x - 55, base - h, 110, h);
      g.strokeStyle = INK;
      g.lineWidth = 3;
      g.strokeRect(x - 55, base - h, 110, h);
      text(labels[k], x, base + 32, 30, INK, "center");
      if (bars[k] > 0.6) text(`${v}`, x, base - h - 26, 40, INK, "center");
    });
    if (trend > 0) {
      const y0 = base - ((base - top) * this.cm(0, 12)) / 20 - 70;
      const y1 = base - ((base - top) * this.cm(2, 12)) / 20 - 70;
      g.strokeStyle = "#c0392b";
      g.lineWidth = 7;
      g.setLineDash([16, 12]);
      g.beginPath();
      g.moveTo(235, y0);
      g.lineTo(lerp(235, 575, trend), lerp(y0, y1, trend));
      g.stroke();
      g.setLineDash([]);
    }
    if (prog.at(-1) <= 0) text("Conclusion: ____________", 50, 1090, 46, "rgba(36,50,74,0.45)");
    if (stamp > 0) {
      g.save();
      g.translate(650, 1060);
      g.rotate(-0.15);
      g.scale(2 - stamp, 2 - stamp);
      g.globalAlpha = stamp * 0.9;
      g.strokeStyle = "#2f9a3e";
      g.lineWidth = 10;
      g.beginPath();
      g.arc(0, 0, 70, 0, Math.PI * 2);
      g.stroke();
      g.lineCap = "round";
      g.lineWidth = 16;
      g.beginPath();
      g.moveTo(-34, 0);
      g.lineTo(-8, 28);
      g.lineTo(38, -30);
      g.stroke();
      g.restore();
    }
    this.texture.needsUpdate = true;
  }
}

export class MacroWorld {
  constructor(renderer, notebook) {
    this.notebook = notebook;
    this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.3;
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.05, 300);
    this.rt = new THREE.WebGLRenderTarget(768, 768, { type: THREE.HalfFloatType, samples: 4 });
    const key = new THREE.DirectionalLight("#fff2dc", 1.4);
    key.position.set(4, 7, 8);
    const rim = new THREE.DirectionalLight("#cfe4ff", 0.8);
    rim.position.set(-5, 3, -4);
    this.scene.add(key, rim, new THREE.HemisphereLight("#dcecff", "#4a5a30", 0.5));
    this.bgU = { uTint: { value: new THREE.Color() }, uTime: { value: 0 } };
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ depthTest: false, depthWrite: false, uniforms: this.bgU, vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }", fragmentShader: BOKEH }));
    bg.renderOrder = -1;
    bg.frustumCulled = false;
    this.scene.add(bg);
    this.buildSeed();
    this.buildSoil();
    this.buildLeaf();
    this.buildRuler();
    this.buildPaper();
    renderer.compile(this.scene, this.camera);
  }

  /** The jar view: bean on wet paper towel, coat splitting, root with hairs, then the shoot. */
  buildSeed() {
    const g = new THREE.Group();
    g.position.x = AT.seed;
    this.scene.add(g);
    const towel = canvasTexture(512, 512, (c, w, h) => {
      c.fillStyle = "#dde6e2";
      c.fillRect(0, 0, w, h);
      for (let i = 0; i < 2400; i++) {
        c.strokeStyle = `rgba(140,160,160,${0.05 + hash(i) * 0.12})`;
        c.lineWidth = 1 + hash(i * 7) * 1.5;
        const x = hash(i * 1.3) * w;
        const y = hash(i * 2.7) * h;
        c.beginPath();
        c.moveTo(x, y);
        c.quadraticCurveTo(x + (hash(i * 3.1) - 0.5) * 40, y + (hash(i * 4.3) - 0.5) * 40, x + (hash(i * 5.1) - 0.5) * 60, y + (hash(i * 6.7) - 0.5) * 60);
        c.stroke();
      }
    });
    mesh(new THREE.PlaneGeometry(16, 16), new THREE.MeshStandardMaterial({ map: towel, bumpMap: towel, bumpScale: 1.5, roughness: 0.95, color: "#c8d8d4" }), g, 0, -1, -1.4);
    this.bean = new THREE.Group();
    this.bean.position.set(0, 0.9, 0);
    this.bean.rotation.set(0.35, 0, -0.08);
    g.add(this.bean);
    this.coat = mesh(beanGeometry(), new THREE.MeshPhysicalMaterial({ map: seedTexture(), color: new THREE.Color(0.72, 0.72, 0.72), roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.2, sheen: 0.4, sheenColor: new THREE.Color("#fff8e0") }), this.bean);
    mesh(new THREE.SphereGeometry(1, 32, 16).scale(0.42, 0.07, 0.16), new THREE.MeshStandardMaterial({ color: "#5a3a22", roughness: 0.5 }), this.bean, 0, -0.66, 0.08);
    mesh(new THREE.TorusGeometry(1, 0.05, 8, 40).scale(0.46, 0.12, 1).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: "#f4ecd8", roughness: 0.6 }), this.bean, 0, -0.66, 0.08);
    this.crack = mesh(taperTube([[-0.3, -0.62, 0.62], [-0.45, -0.1, 0.72], [-0.3, 0.45, 0.66], [0.1, 0.8, 0.5]], 0.035, 0.02, 40, 6), new THREE.MeshStandardMaterial({ color: "#6a4a28", roughness: 0.6 }), this.bean);
    const rootPts = [[0.25, -0.6, 0.2], [0.35, -1.2, 0.3], [0.15, -1.9, 0.35], [0.3, -2.7, 0.3], [0.1, -3.6, 0.35]];
    const rootMat = new THREE.MeshPhysicalMaterial({ color: "#f4ecd4", roughness: 0.45, sheen: 0.6, sheenColor: new THREE.Color("#ffffff") });
    this.root = mesh(taperTube(rootPts, 0.15, 0.05, 64, 14), rootMat, this.bean);
    const curve = new THREE.CatmullRomCurve3(rootPts.map((q) => new THREE.Vector3(...q)));
    const n = 160;
    this.hairs = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.006, 0.004, 0.32, 4).translate(0, 0.16, 0), rootMat, n);
    this.hairU = [];
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    for (let i = 0; i < n; i++) {
      const u = 0.25 + (i / n) * 0.6;
      const c = curve.getPointAt(u);
      const a = hash(i * 1.7) * Math.PI * 2;
      const dir = new THREE.Vector3(Math.cos(a), -0.3, Math.sin(a)).normalize();
      q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      m.compose(c.addScaledVector(dir, 0.08), q, new THREE.Vector3(1, 0.6 + hash(i) * 0.8, 1));
      this.hairs.setMatrixAt(i, m);
      this.hairU.push(u);
    }
    this.bean.add(this.hairs);
    this.shoot = mesh(taperTube([[-0.4, 0.7, 0.2], [-0.55, 1.3, 0.3], [-0.35, 1.9, 0.3], [0.05, 2.1, 0.25], [0.25, 1.85, 0.25]], 0.13, 0.1, 48, 12), new THREE.MeshStandardMaterial({ color: "#c2d47e", roughness: 0.5 }), this.bean);
    const drop = new THREE.MeshPhysicalMaterial({ color: "#ffffff", roughness: 0, metalness: 0, transparent: true, opacity: 0.35, clearcoat: 1 });
    for (let i = 0; i < 14; i++) {
      const d = mesh(new THREE.SphereGeometry(0.06 + hash(i) * 0.12, 16, 12), drop, g, (hash(i * 2.1) - 0.5) * 6, (hash(i * 3.7) - 0.5) * 5, 1.2);
      d.scale.z = 0.4;
    }
  }

  /** Soil surface in pot B: crumbs and perlite, the planted seed, the hooked sprout straightening, water beads. */
  buildSoil() {
    const g = new THREE.Group();
    g.position.x = AT.soil;
    this.scene.add(g);
    const geo = new THREE.PlaneGeometry(16, 16, 160, 160).rotateX(-Math.PI / 2);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      p.setY(i, 0.08 * Math.sin(x * 2.1 + Math.sin(z * 1.3)) * Math.cos(z * 1.7) + 0.04 * Math.sin(x * 7 + z * 5));
    }
    geo.computeVertexNormals();
    const soil = canvasTexture(512, 512, (c, w, h) => {
      c.fillStyle = "#3a2414";
      c.fillRect(0, 0, w, h);
      for (let i = 0; i < 5000; i++) {
        const v = hash(i * 0.7);
        c.fillStyle = v > 0.6 ? "rgba(110,70,38,0.55)" : "rgba(14,8,4,0.55)";
        c.beginPath();
        c.arc(hash(i * 1.7) * w, hash(i * 2.9) * h, 1 + hash(i * 3.3) * 5, 0, Math.PI * 2);
        c.fill();
      }
    });
    soil.wrapS = soil.wrapT = THREE.RepeatWrapping;
    soil.repeat.set(3, 3);
    this.soilMat = new THREE.MeshStandardMaterial({ map: soil, bumpMap: speckleTexture(512, 31, 5000), bumpScale: 4, roughness: 1 });
    mesh(geo, this.soilMat, g);
    const crumbs = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: "#2a1a0e", roughness: 1 }), 220);
    const perlite = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: "#a8a49c", roughness: 0.8 }), 40);
    const m = new THREE.Matrix4();
    const e = new THREE.Euler();
    for (let i = 0; i < 220; i++) {
      const s = 0.04 + hash(i * 1.1) * 0.16;
      m.compose(new THREE.Vector3((hash(i * 2.3) - 0.5) * 12, 0.04, (hash(i * 3.9) - 0.5) * 10), new THREE.Quaternion().setFromEuler(e.set(hash(i), hash(i * 2), 0)), new THREE.Vector3(s, s * 0.7, s));
      crumbs.setMatrixAt(i, m);
      if (i < 40) {
        const r = 0.07 + hash(i * 5.3) * 0.08;
        m.compose(new THREE.Vector3((hash(i * 6.1) - 0.5) * 11, 0.05, (hash(i * 7.7) - 0.5) * 9), new THREE.Quaternion(), new THREE.Vector3(r, r * 0.8, r));
        perlite.setMatrixAt(i, m);
      }
    }
    g.add(crumbs, perlite);
    this.soilSeed = mesh(beanGeometry().scale(0.32, 0.32, 0.32), new THREE.MeshPhysicalMaterial({ map: seedTexture(), color: new THREE.Color(0.75, 0.75, 0.75), roughness: 0.35, clearcoat: 0.6 }), g);
    const stemMat = new THREE.MeshStandardMaterial({ color: "#a8c86a", roughness: 0.5 });
    this.hook = mesh(taperTube([[0, -0.3, 0], [0, 0.5, 0], [0.08, 1.05, 0], [0.45, 1.3, 0], [0.7, 1.05, 0], [0.75, 0.8, 0]], 0.12, 0.09, 64, 12), stemMat, g);
    this.sprout = new THREE.Group();
    g.add(this.sprout);
    mesh(taperTube([[0, -0.3, 0], [0.03, 0.6, 0], [-0.02, 1.4, 0], [0, 2.2, 0]], 0.13, 0.1, 40, 12), stemMat, this.sprout);
    const coty = new THREE.MeshPhysicalMaterial({ color: "#d6d48a", roughness: 0.45, clearcoat: 0.3 });
    this.cotyledons = [1, -1].map((s) => {
      const c = mesh(beanGeometry().scale(0.3, 0.2, 0.24), coty, this.sprout, s * 0.33, 1.25, 0);
      c.rotation.z = s * 0.6;
      return c;
    });
    const leafMat = new THREE.MeshStandardMaterial({ map: leafTexture(41), side: THREE.DoubleSide, roughness: 0.5 });
    this.firstLeaves = [1, -1].map((s) => {
      const pivot = new THREE.Group();
      pivot.position.y = 2.2;
      pivot.rotation.y = s > 0 ? 0.3 : Math.PI + 0.3;
      mesh(bladeGeometry(1.5, 0.75, { cup: 0.3 }), leafMat, pivot).rotation.z = 0.35;
      this.sprout.add(pivot);
      return pivot;
    });
    const water = new THREE.MeshPhysicalMaterial({ color: "#ffffff", roughness: 0, transparent: true, opacity: 0.4, clearcoat: 1 });
    this.beads = Array.from({ length: 10 }, (_, i) => {
      const b = mesh(new THREE.SphereGeometry(0.1 + hash(i * 4.4) * 0.14, 20, 14), water, g, (hash(i * 1.9) - 0.5) * 5, 0.1, (hash(i * 2.6) - 0.5) * 3 + 0.5);
      b.scale.y = 0.6;
      return b;
    });
  }

  /** A leaflet seen through the lens: veins, epidermal cells with chloroplasts, stomata, a dew bead and hairs. */
  buildLeaf() {
    const g = new THREE.Group();
    g.position.x = AT.leaf;
    this.scene.add(g);
    const geo = new THREE.PlaneGeometry(9, 6, 64, 48);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, -0.25 * p.getY(i) * p.getY(i) * 0.12 + 0.08 * Math.sin(p.getX(i) * 0.8));
    geo.computeVertexNormals();
    this.leafU = { uTime: { value: 0 } };
    mesh(geo, new THREE.ShaderMaterial({ uniforms: this.leafU, vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }", fragmentShader: LEAF }), g);
    const hairMat = new THREE.MeshStandardMaterial({ color: "#d8f0b8", roughness: 0.4, transparent: true, opacity: 0.8 });
    const hairs = new THREE.InstancedMesh(new THREE.ConeGeometry(0.012, 0.35, 5).translate(0, 0.175, 0).rotateX(Math.PI / 2 - 0.5), hairMat, 60);
    const m = new THREE.Matrix4();
    for (let i = 0; i < 60; i++) hairs.setMatrixAt(i, m.makeTranslation((hash(i * 1.3) - 0.5) * 8.4, (hash(i * 2.1) - 0.5) * 0.3, 0.05));
    g.add(hairs);
    mesh(new THREE.SphereGeometry(0.35, 32, 20).scale(1, 1, 0.55), new THREE.MeshPhysicalMaterial({ color: "#ffffff", roughness: 0, transparent: true, opacity: 0.32, clearcoat: 1 }), g, 1.6, 1.1, 0.2);
  }

  /** The ruler's top end at mm scale beside the full-sun plant's growing tip, with a red marker and readout. */
  buildRuler() {
    const g = new THREE.Group();
    g.position.x = AT.ruler;
    this.scene.add(g);
    const tex = canvasTexture(256, 4096, (c, w, h) => {
      c.fillStyle = "#f0c95a";
      c.fillRect(0, 0, w, h);
      for (let i = 0; i < 80; i++) {
        c.strokeStyle = `rgba(150,100,30,${0.05 + hash(i) * 0.08})`;
        c.beginPath();
        const x = hash(i * 1.7) * w;
        c.moveTo(x, 0);
        c.lineTo(x + Math.sin(i) * 10, h);
        c.stroke();
      }
      c.fillStyle = "#1e1608";
      for (let mm = 0; mm <= 240; mm++) {
        const y = h - (mm / 240) * h;
        c.fillRect(0, y - 2, mm % 10 ? (mm % 5 ? 46 : 80) : 120, 4);
      }
      c.font = `800 72px ${FONT_COND}`;
      c.textAlign = "right";
      c.textBaseline = "middle";
      for (let k = 1; k < 24; k++) c.fillText(String(k), w - 18, h - (k / 24) * h);
      c.font = `700 30px ${FONT_MONO}`;
      c.fillText("cm", w - 18, h - (0.5 / 24) * h);
    });
    mesh(rbox(2.4, 24, 0.2, 0.08).translate(0, 12, 0), new THREE.MeshStandardMaterial({ map: tex, color: new THREE.Color(0.8, 0.8, 0.8), roughness: 0.45 }), g, 1.0, 0, -0.2);
    const stemMat = new THREE.MeshStandardMaterial({ color: "#6aae42", roughness: 0.5 });
    this.tipStem = mesh(new THREE.CylinderGeometry(0.16, 0.2, 1, 16).translate(0, -0.5, 0), stemMat, g, -0.9, 0, 0.3);
    this.tip = new THREE.Group();
    g.add(this.tip);
    const leafMat = new THREE.MeshStandardMaterial({ map: leafTexture(77), side: THREE.DoubleSide, roughness: 0.5 });
    for (const [yaw, s] of [[0.2, 1], [Math.PI - 0.3, 0.9], [-1.4, 0.75]]) {
      const pivot = new THREE.Group();
      pivot.rotation.y = yaw;
      mesh(bladeGeometry(1.6 * s, 0.6 * s, { cup: 0.35, droop: 0.05 }), leafMat, pivot).rotation.z = 0.9;
      this.tip.add(pivot);
    }
    const hairs = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.008, 0.004, 0.18, 4).translate(0, 0.09, 0), new THREE.MeshStandardMaterial({ color: "#c8e8a0", roughness: 0.5 }), 50);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    for (let i = 0; i < 50; i++) {
      const a = hash(i * 1.9) * Math.PI * 2;
      q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(Math.cos(a), 0.6, Math.sin(a)).normalize());
      m.compose(new THREE.Vector3(Math.cos(a) * 0.17, -hash(i * 3.1) * 3, Math.sin(a) * 0.17), q, new THREE.Vector3(1, 1, 1));
      hairs.setMatrixAt(i, m);
    }
    this.tip.add(hairs);
    this.marker = mesh(rbox(2.9, 0.22, 0.5, 0.06), new THREE.MeshStandardMaterial({ color: "#e8323c", roughness: 0.35 }), g, 1.0, 0, 0);
    this.readCanvas = document.createElement("canvas");
    this.readCanvas.width = 256;
    this.readCanvas.height = 96;
    this.readTex = new THREE.CanvasTexture(this.readCanvas);
    this.readTex.colorSpace = THREE.SRGBColorSpace;
    this.readKey = "";
    this.readout = mesh(new THREE.PlaneGeometry(1.8, 0.68), new THREE.MeshBasicMaterial({ map: this.readTex, transparent: true, color: new THREE.Color(0.8, 0.8, 0.8) }), g, -0.6, 0, 0.9);
  }

  /** The notebook page on its board with the clip, and a pencil that writes. */
  buildPaper() {
    const g = new THREE.Group();
    g.position.x = AT.paper;
    this.scene.add(g);
    mesh(rbox(PAPER.w + 0.6, PAPER.h + 0.8, 0.2, 0.15), new THREE.MeshStandardMaterial({ color: "#8a5a34", bumpMap: speckleTexture(256, 41), bumpScale: 0.5, roughness: 0.7 }), g, 0, 0.2, -0.12);
    const geo = new THREE.PlaneGeometry(PAPER.w, PAPER.h, 24, 36);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, 0.04 * Math.sin(p.getX(i) * 0.9) + 0.02 * Math.cos(p.getY(i) * 1.3));
    geo.computeVertexNormals();
    mesh(geo, new THREE.MeshStandardMaterial({ map: this.notebook.texture, color: new THREE.Color(0.62, 0.62, 0.62), roughness: 0.85 }), g, 0, 0, 0.1);
    const steel = new THREE.MeshStandardMaterial({ color: "#7a7e84", metalness: 0.8, roughness: 0.4 });
    mesh(rbox(3.2, 0.9, 0.18, 0.12), steel, g, 0, PAPER.h / 2 + 0.1, 0.12);
    mesh(new THREE.CylinderGeometry(0.18, 0.18, 3.2, 24).rotateZ(Math.PI / 2), steel, g, 0, PAPER.h / 2 + 0.55, 0.2);
    this.pencil = new THREE.Group();
    g.add(this.pencil);
    const body = new THREE.Group();
    body.rotation.set(0.5, 0, -0.75);
    this.pencil.add(body);
    const paint = new THREE.MeshPhysicalMaterial({ color: "#f2b51d", roughness: 0.35, clearcoat: 0.8 });
    mesh(new THREE.CylinderGeometry(0.16, 0.16, 4.2, 6).translate(0, 2.6, 0), paint, body);
    mesh(lathe([[0, 0], [0.04, 0.05], [0.07, 0.2], [0.15, 0.5]], 18), new THREE.MeshStandardMaterial({ map: woodTexture("#e0b888", 61, 128, 32), roughness: 0.7 }), body);
    mesh(new THREE.ConeGeometry(0.045, 0.16, 12).rotateX(Math.PI).translate(0, 0.07, 0), new THREE.MeshStandardMaterial({ color: "#2a2a2e", metalness: 0.4, roughness: 0.35 }), body);
    mesh(lathe([[0.165, 4.7], [0.175, 4.75], [0.17, 4.82], [0.175, 4.9], [0.17, 4.97], [0.175, 5.05], [0.165, 5.1]], 24), brassMaterial(), body);
    mesh(new THREE.CylinderGeometry(0.155, 0.15, 0.4, 20).translate(0, 5.3, 0), new THREE.MeshStandardMaterial({ color: "#f08aa0", roughness: 0.8 }), body);
  }

  /** Camera framing for a station; st carries the time-varying bits (root length, plant tip, zoom). */
  pose(station, st) {
    if (station === "seed") {
      const r = st.germ.root;
      return { pos: [AT.seed, 0.6 - r * 1.2, 7.5 + r * 3.5], look: [AT.seed, 0.4 - r * 1.2, 0], tint: [0.12, 0.16, 0.14] };
    }
    if (station === "soil") {
      const up = st.sprout * 1.2;
      return { pos: [AT.soil, 3.4 + up, 6.4], look: [AT.soil, 0.7 + up, 0], tint: [0.06, 0.05, 0.03] };
    }
    if (station === "leaf") {
      const d = lerp(6.8, 2.3, st.zoom);
      return { pos: [AT.leaf + 0.4 * st.zoom, 0.3 * st.zoom, d], look: [AT.leaf + 0.4 * st.zoom, 0.3 * st.zoom, 0], tint: [0.05, 0.12, 0.04] };
    }
    if (station === "ruler") return { pos: [AT.ruler + 0.3, st.tipCm + 0.1, 8], look: [AT.ruler + 0.3, st.tipCm - 0.2, 0], tint: [0.14, 0.2, 0.24] };
    const [x, y, d] = PAGE_VIEW[station];
    const [px, py] = pageToPlane(x, y);
    return { pos: [AT.paper + px, py, d], look: [AT.paper + px, py, 0], tint: [0.2, 0.15, 0.1] };
  }

  /**
   * st: { from, to, u, germ, sprout, wet, tipCm, zoom, day, t } — the lens glides from one station to
   * another with u (0..1).
   */
  update(st) {
    const { t, germ } = st;
    this.bgU.uTime.value = t;
    this.leafU.uTime.value = t;
    const a = this.pose(st.from, st);
    const b = this.pose(st.to, st);
    const u = easeInOut(st.u);
    const pos = new THREE.Vector3(...a.pos).lerp(new THREE.Vector3(...b.pos), u);
    const look = new THREE.Vector3(...a.look).lerp(new THREE.Vector3(...b.look), u);
    pos.y += Math.sin(Math.PI * u) * (a.pos[0] === b.pos[0] ? 0 : 1.5);
    this.camera.position.copy(pos);
    this.camera.lookAt(look);
    this.bgU.uTint.value.setRGB(...a.tint).lerp(new THREE.Color(...b.tint), u);

    this.bean.scale.setScalar(1 + germ.swell * 0.12);
    const reveal = (m, k) => m.geometry.setDrawRange(0, Math.floor((m.geometry.index.count * clamp(k, 0, 1)) / 6) * 6);
    reveal(this.crack, germ.crack);
    reveal(this.root, germ.root);
    reveal(this.shoot, germ.shoot);
    this.hairs.count = this.hairU.filter((h) => h < germ.root * 0.95 && germ.hairs > (h - 0.25) / 0.6).length;

    const s = st.sprout;
    this.soilSeed.visible = st.planted > 0 && s < 0.2;
    this.soilSeed.position.set(0, 0.12 + (1 - st.planted) * 4, 0.3);
    this.soilSeed.rotation.set(0.3, 0.4 + (1 - st.planted) * 4, 0.2);
    this.hook.visible = s > 0 && s < 0.45;
    reveal(this.hook, s / 0.45);
    this.sprout.visible = s >= 0.45;
    const open = smooth(0.45, 0.75, s);
    this.sprout.scale.set(1, lerp(0.75, 1, open), 1);
    this.cotyledons.forEach((c, i) => (c.rotation.z = (i ? -1 : 1) * lerp(0.15, 0.9, open)));
    this.firstLeaves.forEach((l) => l.scale.setScalar(smooth(0.6, 1, s)));
    this.soilMat.color.setScalar(1 - st.wet * 0.4);
    this.beads.forEach((bd, i) => {
      const k = smooth(0, 0.3, st.wet - hash(i) * 0.3);
      bd.visible = k > 0.01;
      bd.scale.set(k, k * 0.6, k);
    });

    this.tipStem.scale.y = st.tipCm + 1;
    this.tipStem.position.y = st.tipCm;
    this.tip.position.set(-0.9, st.tipCm, 0.3);
    this.tip.visible = st.tipCm > 0.05;
    this.tipStem.visible = st.tipCm > 0.05;
    this.marker.position.y = st.tipCm;
    this.readout.position.y = st.tipCm - 1.1;
    const read = `${st.tipCm.toFixed(1)} cm`;
    if (read !== this.readKey) {
      this.readKey = read;
      const c = this.readCanvas.getContext("2d");
      c.clearRect(0, 0, 256, 96);
      c.fillStyle = "rgba(20,24,34,0.85)";
      c.beginPath();
      c.roundRect(4, 4, 248, 88, 20);
      c.fill();
      c.fillStyle = "#ffe36b";
      c.font = `800 60px ${FONT_COND}`;
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText(read, 128, 52);
      this.readTex.needsUpdate = true;
    }

    this.notebook.draw(t, st.day);
    const pen = this.notebook.pencil(t);
    const [px, py] = pageToPlane(pen.x, pen.y);
    this.pencil.position.set(px, py, 0.15 + (1 - pen.down) * 0.6);
  }

  render(renderer) {
    renderer.setRenderTarget(this.rt);
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(null);
  }
}

