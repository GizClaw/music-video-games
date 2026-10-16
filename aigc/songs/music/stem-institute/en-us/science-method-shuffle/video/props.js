import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { FONT_COND } from "@gizclaw/mvg-core/hud.js";
import { clamp, hash, lerp, smooth } from "@gizclaw/mvg-core/timing.js";
import { beanGeometry, bladeGeometry, brassMaterial, canvasTexture, lathe, leafTexture, mesh, rbox, seedTexture, speckleTexture, strut, taperTube, woodTexture } from "./parts.js";

// Props on the potting bench, in bench-local units (1 = 10 cm). Every group's
// origin sits on the surface it stands on.

export const POT_H = 0.6;
const NODES = [0.13, 0.36, 0.6, 0.84, 1.08, 1.32, 1.56, 1.8];

const stalk = (geo) => {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.01, 0.5);
  return geo;
};

/** Trifoliate bean leaf: petiole, pulvinus, a terminal and two lateral leaflets. Points +x. */
const TRIFOLIATE = (() => {
  const parts = [stalk(taperTube([[0, 0, 0], [0.1, 0.07, 0], [0.22, 0.1, 0]], 0.014, 0.009, 16, 6)), stalk(new THREE.SphereGeometry(0.016, 10, 8).translate(0.22, 0.1, 0))];
  parts.push(stalk(taperTube([[0.22, 0.1, 0], [0.27, 0.105, 0], [0.31, 0.1, 0]], 0.008, 0.006, 6, 6)));
  parts.push(bladeGeometry(0.3, 0.12).rotateZ(-0.12).translate(0.3, 0.1, 0));
  for (const s of [1, -1]) parts.push(bladeGeometry(0.25, 0.1).rotateY(s * 1.05).rotateZ(-0.05).translate(0.23, 0.1, 0));
  return mergeGeometries(parts);
})();
const UNIFOLIATE = mergeGeometries([stalk(taperTube([[0, 0, 0], [0.06, 0.04, 0], [0.1, 0.05, 0]], 0.012, 0.008, 10, 6)), bladeGeometry(0.26, 0.15, { cup: 0.2 }).translate(0.1, 0.05, 0)]);
const STEM = taperTube([[0, 0, 0], [0.015, 0.25, 0.01], [-0.012, 0.5, -0.005], [0.01, 0.75, 0.005], [0, 1, 0]], 0.042, 0.026, 40, 10);

/** Clay with throwing lines and grit; the rim gets a lighter weathered band. */
function clayTexture(seed) {
  return canvasTexture(512, 256, (g, w, h) => {
    g.fillStyle = "#c46a3e";
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = hash(seed + i) > 0.5 ? "rgba(255,210,170,0.10)" : "rgba(90,30,10,0.12)";
      g.fillRect(hash(seed + i * 1.3) * w, hash(seed + i * 2.1) * h, 1 + hash(i) * 2.5, 1 + hash(i * 3) * 2.5);
    }
    for (let y = 0; y < h; y += 7) {
      g.fillStyle = `rgba(80,30,10,${0.03 + hash(seed + y) * 0.05})`;
      g.fillRect(0, y, w, 2);
    }
    const rim = g.createLinearGradient(0, h * 0.72, 0, h);
    rim.addColorStop(0, "rgba(255,230,200,0)");
    rim.addColorStop(1, "rgba(255,230,200,0.22)");
    g.fillStyle = rim;
    g.fillRect(0, h * 0.72, w, h * 0.28);
  });
}

function soilTexture(seed) {
  const tex = canvasTexture(512, 512, (g, w, h) => {
    g.fillStyle = "#3a2414";
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 3200; i++) {
      const v = hash(seed + i);
      g.fillStyle = v > 0.92 ? "rgba(220,210,190,0.7)" : v > 0.5 ? "rgba(110,72,40,0.5)" : "rgba(15,8,4,0.5)";
      g.beginPath();
      g.arc(hash(seed + i * 1.7) * w, hash(seed + i * 2.9) * h, 1 + hash(seed + i * 3.3) * (v > 0.92 ? 2 : 4), 0, Math.PI * 2);
      g.fill();
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Fresnel glass: clear in the middle, bright at grazing angles, with soft vertical reflections. */
function glassMaterial(tint = [0.75, 0.88, 1.0], strength = 1) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { uTint: { value: new THREE.Vector3(...tint) }, uK: { value: strength } },
    vertexShader: "varying vec3 vN; varying vec3 vV; varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vec4 mv = viewMatrix * w; vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }",
    fragmentShader: /* glsl */ `
      uniform vec3 uTint; uniform float uK; varying vec3 vN; varying vec3 vV; varying vec3 vW;
      void main() {
        vec3 n = normalize(vN);
        float f = pow(1.0 - abs(dot(n, normalize(vV))), 2.4);
        float streak = smoothstep(0.62, 0.72, n.x) * (1.0 - smoothstep(0.72, 0.86, n.x)) + smoothstep(0.92, 1.0, -n.x) * 0.4;
        vec3 col = uTint * (0.04 + f * 0.45) + vec3(1.0) * streak * 0.28;
        gl_FragColor = vec4(col * uK, (0.05 + f * 0.5 + streak * 0.3) * uK);
      }`,
  });
}

/** Terracotta pot on its saucer with soil, plant label, ruler, bean plant and an optional parasol. */
export class BeanPot {
  constructor(parent, k, spec, x, z) {
    this.spec = spec;
    this.group = new THREE.Group();
    this.group.position.set(x, 0, z);
    parent.add(this.group);
    const clay = new THREE.MeshStandardMaterial({ map: clayTexture(k * 11 + 3), bumpMap: speckleTexture(256, k + 5), bumpScale: 0.6, roughness: 0.92 });
    this.potMat = clay;
    mesh(lathe([[0, 0], [0.3, 0], [0.34, 0.012], [0.36, 0.035], [0.355, 0.05], [0.3, 0.055], [0, 0.055]], 64), clay, this.group);
    const pot = [[0, 0.03], [0.24, 0.03], [0.255, 0.04], [0.262, 0.06], [0.33, 0.48], [0.335, 0.49], [0.37, 0.495], [0.385, 0.51], [0.39, 0.55], [0.386, 0.59], [0.372, POT_H], [0.352, POT_H], [0.338, 0.585], [0.334, 0.5]];
    mesh(lathe(pot, 72), clay, this.group);
    this.soilMat = new THREE.MeshStandardMaterial({ map: soilTexture(k + 1), bumpMap: speckleTexture(256, k * 3 + 1, 2600), bumpScale: 2.5, roughness: 1 });
    mesh(new THREE.CircleGeometry(0.336, 48).rotateX(-Math.PI / 2), this.soilMat, this.group, 0, POT_H - 0.04, 0, { cast: false });
    const crumbs = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.012, 0), new THREE.MeshStandardMaterial({ color: "#2e1c10", roughness: 1 }), 40);
    const m = new THREE.Matrix4();
    for (let i = 0; i < 40; i++) {
      const a = hash(k * 50 + i) * Math.PI * 2;
      const r = Math.sqrt(hash(k * 50 + i * 1.7)) * 0.3;
      crumbs.setMatrixAt(i, m.makeTranslation(Math.cos(a) * r, POT_H - 0.035, Math.sin(a) * r));
    }
    crumbs.castShadow = true;
    const perlite = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.009, 1), new THREE.MeshStandardMaterial({ color: "#b8b4aa", roughness: 0.8 }), 24);
    for (let i = 0; i < 24; i++) {
      const a = hash(k * 70 + i * 2.3) * Math.PI * 2;
      const r = Math.sqrt(hash(k * 70 + i * 3.1)) * 0.3;
      perlite.setMatrixAt(i, m.makeTranslation(Math.cos(a) * r, POT_H - 0.036, Math.sin(a) * r));
    }
    this.group.add(crumbs, perlite);
    const water = new THREE.MeshPhysicalMaterial({ color: "#ffffff", roughness: 0, transparent: true, opacity: 0.45, clearcoat: 1 });
    this.beads = Array.from({ length: 9 }, (_, i) => {
      const a = hash(k * 90 + i * 1.7) * Math.PI * 2;
      const r = 0.06 + hash(k * 90 + i * 2.9) * 0.22;
      const b = mesh(new THREE.SphereGeometry(0.008 + hash(i * 4.4) * 0.01, 14, 10), water, this.group, Math.cos(a) * r, POT_H - 0.035, Math.sin(a) * r, { cast: false });
      b.scale.y = 0.6;
      return b;
    });

    this.buildLabel(spec.label);
    this.buildRuler();
    this.buildPlant(k);
    if (spec.light < 1) this.shade = new Parasol(this.group, spec.light < 0.6);
  }

  /** White plastic T-label pushed into the soil at the front. */
  buildLabel(text) {
    const s = new THREE.Shape();
    s.moveTo(-0.24, 0.16);
    s.lineTo(0.24, 0.16);
    s.lineTo(0.24, 0.04);
    s.lineTo(0.04, 0.04);
    s.lineTo(0.0, -0.18);
    s.lineTo(-0.04, 0.04);
    s.lineTo(-0.24, 0.04);
    s.closePath();
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.01, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.006, bevelSegments: 2 });
    this.label = new THREE.Group();
    this.label.position.set(-0.17, POT_H - 0.02, 0.22);
    this.label.rotation.set(-0.18, 0.3, 0);
    this.group.add(this.label);
    this.labelMat = new THREE.MeshStandardMaterial({ color: "#f2f0ea", roughness: 0.45 });
    mesh(geo, this.labelMat, this.label);
    const tex = canvasTexture(256, 64, (g, w, h) => {
      g.fillStyle = "#2a2a30";
      g.font = `800 44px ${FONT_COND}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(text, w / 2, h / 2 + 2);
    });
    this.labelText = new THREE.MeshBasicMaterial({ map: tex, transparent: true, color: new THREE.Color(0.55, 0.55, 0.55) });
    mesh(new THREE.PlaneGeometry(0.44, 0.11), this.labelText, this.label, 0, 0.1, 0.02, { cast: false });
  }

  buildRuler() {
    const tex = canvasTexture(128, 4096, (g, w, h) => {
      g.fillStyle = "#f0c95a";
      g.fillRect(0, 0, w, h);
      g.fillStyle = "#1e1608";
      for (let mm = 0; mm <= 220; mm++) {
        const y = h - (mm / 220) * h;
        g.fillRect(0, y - 2, mm % 10 ? (mm % 5 ? 26 : 44) : 68, 4);
      }
      g.font = `800 46px ${FONT_COND}`;
      g.textAlign = "right";
      g.textBaseline = "middle";
      for (let cmk = 1; cmk <= 21; cmk++) g.fillText(String(cmk), w - 8, h - (cmk / 22) * h);
    });
    this.rulerMat = new THREE.MeshStandardMaterial({ map: tex, color: new THREE.Color(0.55, 0.55, 0.55), roughness: 0.5, transparent: true, opacity: 0 });
    this.ruler = mesh(rbox(0.09, 2.2, 0.018, 0.006).translate(0, 1.1, 0), this.rulerMat, this.group, 0.24, POT_H - 0.05, -0.1);
    this.mark = mesh(rbox(0.13, 0.03, 0.04, 0.008), new THREE.MeshStandardMaterial({ color: "#e8323c", roughness: 0.4, transparent: true, opacity: 0 }), this.group);
  }

  buildPlant(k) {
    this.plant = new THREE.Group();
    this.plant.position.y = POT_H - 0.04;
    this.group.add(this.plant);
    this.stemMat = new THREE.MeshStandardMaterial({ color: "#6aae42", roughness: 0.55 });
    this.leafMat = new THREE.MeshStandardMaterial({ map: leafTexture(), side: THREE.DoubleSide, roughness: 0.5 });
    this.stem = mesh(STEM, this.stemMat, this.plant);
    const leafAt = (geo, yaw, lift = 0.3) => {
      const pivot = new THREE.Group();
      pivot.rotation.y = yaw;
      const leaf = mesh(geo, this.leafMat, pivot);
      leaf.rotation.set(Math.cos(yaw) > 0 ? 0.95 : -0.95, 0, lift);
      this.plant.add(pivot);
      return pivot;
    };
    this.nodes = NODES.map((_, i) => (i ? [leafAt(TRIFOLIATE, i % 2 ? Math.PI - 0.55 : 0.55)] : [leafAt(UNIFOLIATE, 0.25, 0.2), leafAt(UNIFOLIATE, Math.PI + 0.25, 0.2)]));
    this.tip = leafAt(TRIFOLIATE, -1.3, 0.9);
    const coty = new THREE.MeshStandardMaterial({ color: "#c9cf7a", roughness: 0.6 });
    this.cotyledons = [1, -1].map((s) => {
      const c = mesh(beanGeometry().scale(0.045, 0.03, 0.04), coty, this.plant);
      c.rotation.z = s * 0.5;
      return c;
    });
    const petal = new THREE.MeshStandardMaterial({ color: "#c9a2f0", roughness: 0.55 });
    const calyx = new THREE.MeshStandardMaterial({ color: "#5a9a38", roughness: 0.6 });
    this.flowers = [0.4, 2.5, 4.4].map((yaw) => {
      const f = new THREE.Group();
      mesh(new THREE.SphereGeometry(0.035, 12, 8).scale(1, 1.3, 0.5), petal, f, 0, 0.03, 0);
      for (const s of [1, -1]) mesh(new THREE.SphereGeometry(0.025, 10, 8).scale(1.2, 0.8, 0.6), petal, f, s * 0.025, 0.01, 0.02);
      mesh(new THREE.ConeGeometry(0.018, 0.04, 8), calyx, f, 0, -0.01, 0);
      f.userData.yaw = yaw;
      this.plant.add(f);
      return f;
    });
    this.seed = mesh(beanGeometry().scale(0.05, 0.05, 0.05), new THREE.MeshPhysicalMaterial({ map: seedTexture(), roughness: 0.35, clearcoat: 0.5 }), this.group);
  }

  /** h: plant height, open: parasol 0..1, seedDrop 0..1, ruler/label 0..1, wet: soil darkening, bloom 0..1, groove: sway. */
  update({ t, h, open, seedDrop, ruler, wet, bloom, groove }) {
    const lightK = this.shade ? lerp(1, this.spec.light, clamp(open, 0, 1)) : 1;
    this.potMat.color.setScalar(lightK);
    this.soilMat.color.setScalar(lightK * (1 - wet * 0.45));
    this.labelMat.color.setScalar(0.42 * lightK);
    const vigour = this.spec.height / 1.95;
    this.stemMat.color.set("#6aae42").lerp(new THREE.Color("#b8c86a"), 1 - vigour).multiplyScalar(lightK);
    this.leafMat.color.setRGB(1, 1, 1).lerp(new THREE.Color("#e8f070"), (1 - vigour) * 0.8).multiplyScalar(lightK);
    this.plant.visible = h > 0.005;
    this.stem.scale.set(1, Math.max(0.001, h), 1);
    this.plant.rotation.z = Math.sin(t * 1.3 + this.group.position.x) * 0.02 + groove;
    const size = 0.95 + 0.45 * vigour;
    this.nodes.forEach((leaves, i) => {
      const y = NODES[i];
      const k = clamp((h - y) / 0.28, 0, 1);
      for (const p of leaves) {
        p.visible = k > 0;
        p.position.y = y;
        p.scale.setScalar(k * size);
      }
    });
    this.tip.position.y = h;
    this.tip.scale.setScalar(clamp(h / 0.1, 0, 1) * 0.42 * size);
    const coty = clamp(h / 0.06, 0, 1) * (1 - smooth(0.8, 1.4, h));
    this.cotyledons.forEach((c, i) => {
      c.visible = coty > 0.01;
      c.position.set(i ? -0.05 : 0.05, 0.05 + h * 0.05, 0);
      c.scale.setScalar(coty);
    });
    this.flowers.forEach((f, i) => {
      const k = clamp(bloom * 3 - i, 0, 1) * (vigour > 0.6 ? 1 : 0);
      f.visible = k > 0;
      const y = Math.min(h - 0.05, NODES[2 + i] + 0.04);
      f.position.set(Math.cos(f.userData.yaw) * 0.07, y, Math.sin(f.userData.yaw) * 0.07);
      f.scale.setScalar(k);
    });

    const fall = clamp(seedDrop, 0, 1);
    this.seed.visible = seedDrop > 0 && h < 0.03;
    this.seed.position.set(0, POT_H - 0.02 + (1 - fall * fall) * 1.5, 0.04);
    this.seed.rotation.z = fall * 6;

    this.rulerMat.opacity = ruler;
    this.ruler.scale.y = Math.max(0.001, smooth(0, 0.6, ruler));
    this.mark.material.opacity = ruler;
    this.mark.position.set(0.24, POT_H - 0.04 + h, -0.08);

    this.beads.forEach((b, i) => (b.visible = wet > 0.1 + hash(i) * 0.3));
    this.shade?.update(open);
  }

  /** Ruler marker position in world space. */
  markWorld(v) {
    return v.copy(this.mark.position).applyMatrix4(this.group.matrixWorld);
  }

  /** The ruler's scale at the plant top, or a few centimetres up while it is still a seed. */
  rulerWorld(v, h) {
    return v.set(0.2, POT_H - 0.04 + Math.max(h, 0.3), -0.08).applyMatrix4(this.group.matrixWorld);
  }

  /** A mid-height leaf, for the magnifier to look at. */
  /** Centre of a grown terminal leaflet about half-way up, for the magnifier. */
  leafWorld(v, h) {
    let i = 1;
    while (i < NODES.length - 1 && NODES[i + 1] + 0.3 < h * 0.7) i++;
    const leaf = NODES[i] + 0.2 < h ? this.nodes[i][0].children[0] : this.tip.children[0];
    return v.set(0.45, 0.08, 0).applyMatrix4(leaf.matrixWorld);
  }

  /** Just above the rim: the seed going in, then the sprout's base and the soil. */
  soilWorld(v) {
    return v.set(0.06, POT_H + 0.12, 0).applyMatrix4(this.group.matrixWorld);
  }
}

/** Garden parasol clipped to the back of the pot: pole, runner, eight ribs and stretchers, scalloped gores. */
class Parasol {
  constructor(parent, dense) {
    this.group = new THREE.Group();
    this.group.position.set(0, 0, -0.4);
    parent.add(this.group);
    this.height = dense ? 1.75 : 2.3;
    const R = 0.6;
    const Hc = 0.22;
    const N = 8;
    const steel = new THREE.MeshStandardMaterial({ color: "#d9d4c8", metalness: 0.7, roughness: 0.35 });
    const wood = new THREE.MeshStandardMaterial({ map: woodTexture("#9a6a40", dense ? 4 : 5, 256, 64), roughness: 0.6 });
    this.pole = mesh(new THREE.CylinderGeometry(0.022, 0.022, 1, 12).translate(0, 0.5, 0), wood, this.group);
    mesh(rbox(0.07, 0.09, 0.05, 0.01), steel, this.group, 0, POT_H - 0.02, 0.01);

    this.top = new THREE.Group();
    this.group.add(this.top);
    const fabric = canvasTexture(512, 64, (g, w, h) => {
      for (let i = 0; i < N; i++) {
        g.fillStyle = dense ? (i % 2 ? "#2d5a36" : "#36683f") : i % 2 ? "#9fd2a8" : "#b5dfb8";
        g.fillRect((i / N) * w, 0, w / N, h);
      }
      g.fillStyle = dense ? "#e8e0c8" : "#ffffff";
      g.fillRect(0, h - 6, w, 6);
    });
    const holes = canvasTexture(64, 64, (g, w) => {
      g.fillStyle = "#fff";
      g.fillRect(0, 0, w, w);
      g.fillStyle = "#000";
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) g.fillRect(x * 16 + 5, y * 16 + 5, 7, 7);
    }, false);
    holes.wrapS = holes.wrapT = THREE.RepeatWrapping;
    holes.repeat.set(40, 4);
    const cloth = new THREE.MeshPhysicalMaterial({ map: fabric, roughness: 0.85, sheen: 1, sheenColor: new THREE.Color(dense ? "#6a9a70" : "#e0ffe0"), sheenRoughness: 0.6, side: THREE.DoubleSide, alphaMap: dense ? null : holes, transparent: !dense, alphaTest: dense ? 0 : 0.5 });
    const seg = [96, 10];
    const pos = [];
    const uv = [];
    const idx = [];
    const at = (th, s) => {
      const gap = Math.pow(Math.sin((N * th) / 2), 2);
      const r = s * R * (1 - 0.06 * s * gap);
      return [r * Math.cos(th), Hc * (1 - Math.pow(s, 1.25)) - 0.035 * s * gap, r * Math.sin(th)];
    };
    for (let i = 0; i <= seg[0]; i++) {
      for (let j = 0; j <= seg[1]; j++) {
        const th = (i / seg[0]) * Math.PI * 2;
        const s = j / seg[1];
        pos.push(...at(th, s));
        uv.push(i / seg[0], s);
      }
    }
    for (let i = 0; i < seg[0]; i++) {
      for (let j = 0; j < seg[1]; j++) {
        const a = i * (seg[1] + 1) + j;
        const b = a + seg[1] + 1;
        idx.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    mesh(geo, cloth, this.top);
    const rib = new THREE.MeshStandardMaterial({ color: "#3a3a3a", metalness: 0.6, roughness: 0.4 });
    for (let i = 0; i < N; i++) {
      const th = (i / N) * Math.PI * 2;
      const pts = [0, 0.25, 0.5, 0.75, 1].map((s) => at(th, s).map((v, c) => (c === 1 ? v - 0.008 : v)));
      mesh(taperTube(pts, 0.007, 0.006, 16, 5), rib, this.top);
      const mid = new THREE.Vector3(...at(th, 0.55));
      strut(new THREE.Vector3(0, Hc - 0.22, 0), mid.setY(mid.y - 0.01), 0.004, rib, this.top, 5);
    }
    mesh(lathe([[0, 0], [0.02, 0], [0.026, 0.02], [0.018, 0.05], [0.01, 0.07], [0, 0.08]], 20), wood, this.top, 0, Hc, 0);
    mesh(lathe([[0.024, -0.03], [0.034, -0.02], [0.034, 0.02], [0.024, 0.03]], 20), steel, this.top, 0, Hc - 0.22, 0);
    this.top.rotation.x = -0.2;
  }

  update(open) {
    const k = clamp(open, 0, 1.2);
    this.group.visible = open > 0.001;
    const rise = this.height * Math.min(1, k * 1.4);
    this.pole.scale.y = rise;
    this.top.position.set(0, rise, 0.02);
    this.top.scale.set(k, 0.4 + 0.6 * Math.min(1, k), k);
  }
}

/** Enamelled watering can: shouldered barrel, filler rim, arched and rear handles, tapered spout with brace, brass rose. */
export class WateringCan {
  constructor(parent) {
    this.group = new THREE.Group();
    parent.add(this.group);
    const enamel = new THREE.MeshPhysicalMaterial({ color: "#2f8a52", roughness: 0.35, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.12 });
    const brass = brassMaterial();
    mesh(lathe([[0, 0], [0.19, 0], [0.205, 0.008], [0.212, 0.025], [0.218, 0.3], [0.205, 0.35], [0.165, 0.39], [0.115, 0.41], [0.1, 0.415], [0.098, 0.43], [0.092, 0.43]], 56), enamel, this.group);
    mesh(new THREE.TorusGeometry(0.096, 0.01, 8, 40).rotateX(Math.PI / 2), enamel, this.group, 0, 0.43, 0);
    mesh(new THREE.TorusGeometry(0.213, 0.008, 8, 48).rotateX(Math.PI / 2), enamel, this.group, 0, 0.3, 0);
    mesh(taperTube([[-0.15, 0.37, 0], [-0.1, 0.58, 0], [0.05, 0.63, 0], [0.13, 0.4, 0]], 0.02, 0.018, 32, 8), enamel, this.group);
    mesh(taperTube([[-0.2, 0.06, 0], [-0.31, 0.16, 0], [-0.3, 0.31, 0], [-0.19, 0.36, 0]], 0.018, 0.018, 24, 8), enamel, this.group);
    mesh(taperTube([[0.17, 0.06, 0], [0.33, 0.2, 0], [0.5, 0.38, 0], [0.62, 0.5, 0]], 0.042, 0.02, 40, 12), enamel, this.group);
    strut(new THREE.Vector3(0.2, 0.28, 0), new THREE.Vector3(0.43, 0.31, 0), 0.008, enamel, this.group);
    const rose = new THREE.Group();
    rose.position.set(0.63, 0.51, 0);
    rose.rotation.z = -Math.PI / 4;
    this.group.add(rose);
    mesh(lathe([[0.018, -0.02], [0.024, -0.02], [0.05, 0.02], [0.07, 0.04], [0.072, 0.05], [0, 0.05]], 32), brass, rose);
    const holes = canvasTexture(128, 128, (g, w) => {
      g.fillStyle = "#c8962e";
      g.fillRect(0, 0, w, w);
      g.fillStyle = "#3a2608";
      for (let r = 10; r < 60; r += 12) for (let a = 0; a < Math.PI * 2; a += 12 / r) g.fillRect(64 + Math.cos(a) * r - 2, 64 + Math.sin(a) * r - 2, 4, 4);
    });
    mesh(new THREE.CircleGeometry(0.068, 32).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: holes, metalness: 0.8, roughness: 0.35 }), rose, 0, 0.051, 0);
  }
}

/** Germination jar: a bean pressed between the glass and wet paper towel; the coat splits, a haired root and the shoot grow. */
export class SeedJar {
  constructor(parent) {
    this.group = new THREE.Group();
    parent.add(this.group);
    const glass = glassMaterial([0.8, 0.92, 0.9], 0.8);
    const g = mesh(lathe([[0, 0], [0.2, 0], [0.215, 0.015], [0.222, 0.05], [0.222, 0.5], [0.21, 0.54], [0.17, 0.57], [0.158, 0.58], [0.158, 0.62]], 56), glass, this.group, 0, 0, 0, { cast: false, receive: false });
    g.renderOrder = 3;
    const lid = brassMaterial(true);
    lid.color.set("#b8bcc0");
    mesh(lathe([[0.16, 0.585], [0.17, 0.59], [0.17, 0.65], [0.158, 0.66], [0, 0.662]], 48), lid, this.group);
    const towel = canvasTexture(256, 256, (c, w, h) => {
      c.fillStyle = "#e2e8e4";
      c.fillRect(0, 0, w, h);
      for (let i = 0; i < 900; i++) {
        c.strokeStyle = `rgba(140,160,160,${0.06 + hash(i) * 0.12})`;
        c.beginPath();
        const x = hash(i * 1.3) * w;
        const y = hash(i * 2.7) * h;
        c.moveTo(x, y);
        c.quadraticCurveTo(x + (hash(i * 3.1) - 0.5) * 20, y + (hash(i * 4.3) - 0.5) * 20, x + (hash(i * 5.1) - 0.5) * 30, y + (hash(i * 6.7) - 0.5) * 30);
        c.stroke();
      }
    });
    mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.5, 40, 1, true), new THREE.MeshStandardMaterial({ map: towel, color: new THREE.Color(0.75, 0.78, 0.76), roughness: 0.95, side: THREE.DoubleSide }), this.group, 0, 0.29, 0);
    mesh(new THREE.CylinderGeometry(0.208, 0.208, 0.06, 40), new THREE.MeshStandardMaterial({ color: "#8fc0d0", transparent: true, opacity: 0.4, roughness: 0.1 }), this.group, 0, 0.035, 0, { cast: false });

    // The bean is modelled at seed scale (about 2.9 × 1.9 units) and shrunk to fit.
    this.bean = new THREE.Group();
    this.bean.position.set(0, 0.42, 0.172);
    this.bean.rotation.set(0.25, 0, -0.08);
    this.bean.scale.set(0.09, 0.09, 0.06);
    this.group.add(this.bean);
    this.coat = mesh(beanGeometry(), new THREE.MeshPhysicalMaterial({ map: seedTexture(), color: new THREE.Color(0.8, 0.8, 0.8), roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.2 }), this.bean);
    mesh(new THREE.SphereGeometry(1, 32, 16).scale(0.42, 0.07, 0.16), new THREE.MeshStandardMaterial({ color: "#5a3a22", roughness: 0.5 }), this.bean, 0, -0.66, 0.08);
    mesh(new THREE.TorusGeometry(1, 0.05, 8, 40).scale(0.46, 0.12, 1).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: "#f4ecd8", roughness: 0.6 }), this.bean, 0, -0.66, 0.08);
    this.crack = mesh(taperTube([[-0.3, -0.62, 0.62], [-0.45, -0.1, 0.72], [-0.3, 0.45, 0.66], [0.1, 0.8, 0.5]], 0.05, 0.03, 40, 6), new THREE.MeshStandardMaterial({ color: "#5a3a1e", roughness: 0.6 }), this.bean);
    const rootPts = [[0.25, -0.6, 0.2], [0.35, -1.2, 0.3], [0.15, -1.9, 0.35], [0.3, -2.7, 0.3], [0.1, -3.6, 0.35]];
    const rootMat = new THREE.MeshPhysicalMaterial({ color: "#f4ecd4", roughness: 0.45, sheen: 0.6, sheenColor: new THREE.Color("#ffffff") });
    this.root = mesh(taperTube(rootPts, 0.17, 0.06, 64, 14), rootMat, this.bean);
    const curve = new THREE.CatmullRomCurve3(rootPts.map((q) => new THREE.Vector3(...q)));
    const n = 140;
    this.hairs = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.012, 0.008, 0.4, 4).translate(0, 0.2, 0), rootMat, n);
    this.hairU = [];
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    for (let i = 0; i < n; i++) {
      const u = 0.25 + (i / n) * 0.6;
      const c = curve.getPointAt(u);
      const a = hash(i * 1.7) * Math.PI * 2;
      const dir = new THREE.Vector3(Math.cos(a), -0.3, Math.sin(a) * 0.3).normalize();
      q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      m.compose(c.addScaledVector(dir, 0.1), q, new THREE.Vector3(1, 0.6 + hash(i) * 0.8, 1));
      this.hairs.setMatrixAt(i, m);
      this.hairU.push(u);
    }
    this.bean.add(this.hairs);
    this.shoot = mesh(taperTube([[-0.4, 0.7, 0.2], [-0.55, 1.3, 0.3], [-0.35, 1.9, 0.3], [0.05, 2.1, 0.25], [0.25, 1.85, 0.25]], 0.15, 0.12, 48, 12), new THREE.MeshStandardMaterial({ color: "#b8d07a", roughness: 0.5 }), this.bean);
  }

  update(germ) {
    this.coat.scale.setScalar(1 + germ.swell * 0.12);
    const reveal = (m, k) => m.geometry.setDrawRange(0, Math.floor((m.geometry.index.count * clamp(k, 0, 1)) / 6) * 6);
    reveal(this.crack, germ.crack);
    reveal(this.root, germ.root);
    reveal(this.shoot, germ.shoot);
    this.hairs.count = this.hairU.filter((h) => h < germ.root * 0.95 && germ.hairs > (h - 0.25) / 0.6).length;
  }

  /** The bean, or once it has grown, the middle of the seedling. */
  seedWorld(v, germ) {
    return v.set(0, -1.2 * germ.root, 0).applyMatrix4(this.bean.matrixWorld);
  }
}

/** Clipboard on an easel; the paper is the shared notebook texture and a pencil writes on it. */
export class Clipboard {
  constructor(parent, paperTex) {
    this.group = new THREE.Group();
    parent.add(this.group);
    const wood = new THREE.MeshStandardMaterial({ map: woodTexture("#a8784a", 9, 256, 64), roughness: 0.65 });
    for (const s of [1, -1]) {
      const leg = mesh(rbox(0.04, 1.3, 0.035, 0.012), wood, this.group, s * 0.3, 0.63, 0.06);
      leg.rotation.set(-0.16, 0, s * 0.05);
    }
    const back = mesh(rbox(0.035, 1.15, 0.035, 0.012), wood, this.group, 0, 0.55, -0.2);
    back.rotation.x = 0.33;
    mesh(rbox(0.72, 0.045, 0.07, 0.014), wood, this.group, 0, 0.32, 0.03);
    this.board = new THREE.Group();
    this.board.position.set(0, 0.34, 0.02);
    this.board.rotation.x = -0.16;
    this.group.add(this.board);
    const W = 0.7;
    const H = 0.98;
    mesh(rbox(W + 0.06, H + 0.1, 0.02, 0.025), new THREE.MeshStandardMaterial({ color: "#8a5a34", bumpMap: speckleTexture(256, 17), bumpScale: 0.4, roughness: 0.7 }), this.board, 0, H / 2 + 0.03, 0);
    mesh(new THREE.PlaneGeometry(W - 0.02, H - 0.03), new THREE.MeshStandardMaterial({ color: "#9c978c", roughness: 0.9 }), this.board, 0.008, H / 2 + 0.005, 0.012);
    this.paper = mesh(new THREE.PlaneGeometry(W - 0.04, H - 0.04), new THREE.MeshStandardMaterial({ map: paperTex, color: new THREE.Color(0.62, 0.62, 0.62), roughness: 0.85 }), this.board, 0, H / 2, 0.014, { cast: false });
    this.size = [W - 0.04, H - 0.04];
    const steel = new THREE.MeshStandardMaterial({ color: "#8a8e94", metalness: 0.8, roughness: 0.35 });
    mesh(rbox(0.26, 0.07, 0.014, 0.012), steel, this.board, 0, H + 0.01, 0.022);
    mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.26, 16).rotateZ(Math.PI / 2), steel, this.board, 0, H + 0.05, 0.024);
    const lever = mesh(rbox(0.16, 0.06, 0.01, 0.01), steel, this.board, 0, H + 0.07, 0.036);
    lever.rotation.x = 0.5;
    for (const s of [1, -1]) mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.012, 12).rotateX(Math.PI / 2), steel, this.board, s * 0.1, H + 0.01, 0.03);
    // A hexagonal yellow pencil: sharpened wood cone, graphite point, ribbed ferrule, eraser.
    this.pencil = new THREE.Group();
    this.board.add(this.pencil);
    const body = new THREE.Group();
    body.rotation.set(0.5, 0, -0.75);
    body.scale.setScalar(0.07);
    this.pencil.add(body);
    mesh(new THREE.CylinderGeometry(0.16, 0.16, 4.2, 6).translate(0, 2.6, 0), new THREE.MeshPhysicalMaterial({ color: "#f2b51d", roughness: 0.35, clearcoat: 0.8 }), body);
    mesh(lathe([[0, 0], [0.04, 0.05], [0.07, 0.2], [0.15, 0.5]], 18), new THREE.MeshStandardMaterial({ map: woodTexture("#e0b888", 61, 128, 32), roughness: 0.7 }), body);
    mesh(new THREE.ConeGeometry(0.045, 0.16, 12).rotateX(Math.PI).translate(0, 0.07, 0), new THREE.MeshStandardMaterial({ color: "#2a2a2e", metalness: 0.4, roughness: 0.35 }), body);
    mesh(lathe([[0.165, 4.7], [0.175, 4.75], [0.17, 4.82], [0.175, 4.9], [0.17, 4.97], [0.175, 5.05], [0.165, 5.1]], 24), brassMaterial(), body);
    mesh(new THREE.CylinderGeometry(0.155, 0.15, 0.4, 20).translate(0, 5.3, 0), new THREE.MeshStandardMaterial({ color: "#f08aa0", roughness: 0.8 }), body);
  }

  /** pen: page position (0..1 from the top-left) and how firmly it touches the paper. */
  update(pen) {
    const [w, h] = this.size;
    this.pencil.position.set((pen.u - 0.5) * w, h / 2 + 0.02 + (0.5 - pen.v) * h, 0.02 + (1 - pen.down) * 0.06);
  }

  /** World point on the sheet; u, v in 0..1 from the top-left. */
  paperWorld(v, u, w) {
    return v.set((u - 0.5) * this.size[0], (0.5 - w) * this.size[1], 0).applyMatrix4(this.paper.matrixWorld);
  }
}

/** The hero magnifier: knurled brass rim, a glass that magnifies the scene behind it, turned and varnished handle. */
export class Magnifier {
  constructor(parent, behind) {
    this.group = new THREE.Group();
    parent.add(this.group);
    this.inner = new THREE.Group();
    this.group.add(this.inner);
    const R = 0.72;
    const brass = brassMaterial();
    const knurl = brassMaterial(true);
    mesh(lathe([[R, -0.05], [R + 0.03, -0.055], [R + 0.06, -0.035], [R + 0.065, 0.0], [R + 0.06, 0.035], [R + 0.03, 0.055], [R, 0.05]], 128).rotateX(Math.PI / 2), brass, this.inner, 0, 0, 0, { cast: false });
    mesh(new THREE.CylinderGeometry(R + 0.068, R + 0.068, 0.05, 160, 1, true).rotateX(Math.PI / 2), knurl, this.inner, 0, 0, 0, { cast: false });
    for (const z of [-0.03, 0.03]) mesh(new THREE.TorusGeometry(R + 0.068, 0.006, 6, 160), brass, this.inner, 0, 0, z, { cast: false });
    this.uniforms = {
      tBehind: { value: behind },
      tQ: { value: canvasTexture(256, 256, (g, w) => {
        g.fillStyle = "#fff";
        g.font = `800 200px ${FONT_COND}`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText("?", w / 2, w / 2 + 10);
      }, false) },
      uCenter: { value: new THREE.Vector2() },
      uRegion: { value: 200 },
      uMag: { value: 2.3 },
      uQ: { value: 0 },
      uGlint: { value: 0 },
      uSweep: { value: -1 },
    };
    const lens = mesh(new THREE.CircleGeometry(R, 96), new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }", fragmentShader: LENS }), this.inner, 0, 0, 0.01, { cast: false, receive: false });
    lens.renderOrder = 4;
    const dir = new THREE.Vector3(Math.cos(0.7), Math.sin(0.7), 0);
    const yoke = new THREE.Group();
    yoke.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    yoke.position.copy(dir).multiplyScalar(R + 0.05);
    this.inner.add(yoke);
    mesh(lathe([[0.05, 0], [0.055, 0.02], [0.045, 0.08], [0.04, 0.14], [0.05, 0.16], [0.052, 0.19], [0.0, 0.19]], 32), brass, yoke, 0, 0, 0, { cast: false });
    const wood = new THREE.MeshPhysicalMaterial({ map: woodTexture("#7a3e1c", 21, 256, 64), roughness: 0.45, clearcoat: 0.8, clearcoatRoughness: 0.15 });
    wood.map.rotation = Math.PI / 2;
    const handle = [[0.045, 0.19], [0.062, 0.2], [0.07, 0.22], [0.062, 0.25], [0.066, 0.3], [0.078, 0.55], [0.085, 0.75], [0.08, 0.85], [0.07, 0.88], [0.08, 0.92], [0.088, 0.98], [0.085, 1.04], [0.07, 1.08], [0.0, 1.1]];
    mesh(lathe(handle, 40), wood, yoke, 0, 0, 0, { cast: false });
    mesh(lathe([[0.05, 1.075], [0.072, 1.08], [0.06, 1.12], [0.03, 1.14], [0, 1.145]], 32), brass, yoke, 0, 0, 0, { cast: false });
  }
}

// tBehind holds the square patch of the frame under the lens (uRegion screen px
// across, centred on uCenter, rendered without the magnifier at high resolution);
// the glass shows it enlarged about its centre.
const LENS = /* glsl */ `
  uniform sampler2D tBehind, tQ; uniform vec2 uCenter; uniform float uRegion, uMag, uQ, uGlint, uSweep; varying vec2 vUv;
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    vec2 d = gl_FragCoord.xy - uCenter;
    // Stronger in the middle, gently barrelled toward the rim, fringed at the edge.
    float k = (1.0 + 0.28 * r * r) / uMag / uRegion;
    float ca = 0.012 * r * r * r;
    vec3 col = vec3(texture2D(tBehind, 0.5 + d * k * (1.0 + ca)).r, texture2D(tBehind, 0.5 + d * k).g, texture2D(tBehind, 0.5 + d * k * (1.0 - ca)).b);
    if (uQ > 0.01) {
      vec3 acc = col;
      for (int i = 0; i < 12; i++) {
        float a = float(i) * 2.39996;
        float s = sqrt(float(i + 1) / 12.0) * uQ * 0.06;
        acc += texture2D(tBehind, 0.5 + d * k + vec2(cos(a), sin(a)) * s).rgb;
      }
      col = mix(col, acc / 13.0 * 0.8 + vec3(0.06), uQ);
      col += vec3(1.0, 0.95, 0.75) * texture2D(tQ, vUv).r * uQ * 0.55;
    }
    col *= 1.0 - 0.35 * smoothstep(0.86, 1.0, r);
    col += vec3(0.7, 0.85, 1.0) * pow(smoothstep(0.84, 1.0, r), 2.0) * 0.16;
    float spot = exp(-length(p - vec2(-0.45, 0.48)) * 7.0) * 0.12;
    float band = smoothstep(0.05, 0.0, abs(length(p - vec2(0.4, -0.4)) - 1.05)) * 0.04;
    float streak = exp(-pow((p.x + p.y - uSweep) * 4.0, 2.0)) * (1.0 - r * r) * uGlint * 0.3;
    col += vec3(1.0, 0.97, 0.9) * (spot + band + streak);
    gl_FragColor = vec4(col, 1.0);
  }`;
