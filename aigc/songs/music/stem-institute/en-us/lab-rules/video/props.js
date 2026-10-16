import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { hash, lerp, smooth } from "@gizclaw/mvg-core/timing.js";
import { BEAKER, ERLEN, GLASS, Parts, TUBE, canvasTexture, once, cracks, curve, glassware, glow, lathe, mesh, phys, rounded, speckle, std, tube } from "./craft.js";
import { earField, handField, mesh as sdfMesh, mirrorX } from "./sdf.js";

// Every prop stands on y = 0, about two units wide and two to three tall, facing
// +z; the scene scales it up for its moment and down for its place on the bench.
const SKIN = phys({ color: "#e89c7c", vertexColors: true, roughness: 0.55, sheen: 0.4, sheenColor: new THREE.Color("#ff6a50"), sheenRoughness: 0.5 });
SKIN.userData.saturation = 1.2;
const NAIL = phys({ color: "#ffd9d0", roughness: 0.12, clearcoat: 1 });
const STEEL = phys({ color: "#d6dde6", metalness: 1, roughness: 0.16 });
const DARK = phys({ color: "#1d222b", roughness: 0.45, clearcoat: 0.4 });
const WHITE = phys({ color: "#cfcdc6", roughness: 0.35, clearcoat: 0.8 });
const BUBBLE = phys({ color: "#ffffff", transparent: true, opacity: 0.35, roughness: 0.05, iridescence: 1, iridescenceIOR: 1.3, clearcoat: 1, depthWrite: false });
const ridge = (geo, n, amp) => {
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z);
    if (r < 1e-4) continue;
    const k = 1 + (amp * Math.sign(Math.sin(Math.atan2(z, x) * n))) / r;
    pos.setX(i, x * k);
    pos.setZ(i, z * k);
  }
  geo.computeVertexNormals();
  return geo;
};

/* ---------- Hands and the ear: signed-distance surfaces meshed once (see sdf.js). ---------- */

const handGeo = (opts) => {
  const h = handField(opts);
  const geo = sdfMesh(h.f, ...h.bounds, 0.02, { dark: opts.glove ? [0.58, 0.68, 0.9] : [0.66, 0.4, 0.38] });
  return { geo, tips: h.tips, left: mirrorX(geo), leftTips: h.tips.map((tip) => ({ ...tip, at: [-tip.at[0], tip.at[1], tip.at[2]], dir: [-tip.dir[0], tip.dir[1], tip.dir[2]], back: [-tip.back[0], tip.back[1], tip.back[2]] })) };
};
const HAND = once(() => handGeo({ curl: 0.06 }));
const SPREAD = once(() => handGeo({ curl: 0.16, spread: 2.3 }));
const GLOVE = once(() => handGeo({ glove: true, curl: 0.1 }));
const EAR = once(() => {
  const e = earField();
  return sdfMesh(e.f, ...e.bounds, 0.014, { dark: [0.5, 0.26, 0.26] });
});
const NAIL_GEO = new THREE.SphereGeometry(1, 24, 16);

/** A skinned hand with glossy nails on its fingertips; `left` uses the mirrored surface. */
function skinHand(set, left = false) {
  const group = new THREE.Group();
  mesh(group, left ? set.left : set.geo, SKIN);
  const basis = new THREE.Matrix4();
  for (const { at, dir, back, r } of left ? set.leftTips : set.tips) {
    const d = new THREE.Vector3(...dir).normalize();
    const b = new THREE.Vector3(...back).normalize();
    const x = new THREE.Vector3().crossVectors(d, b).normalize();
    b.crossVectors(x, d);
    const nail = mesh(group, NAIL_GEO, NAIL);
    nail.quaternion.setFromRotationMatrix(basis.makeBasis(x, d, b));
    nail.position.set(...at).addScaledVector(d, -r * 1.25).addScaledVector(b, r * 0.7);
    nail.scale.set(r * 0.8, r * 1.2, r * 0.32);
  }
  return group;
}

/* ---------- Goggles: a wrap-around polycarbonate lens in a soft vinyl frame, vents and an elastic strap. ---------- */

const LENS_R = 1.55;
const goggleOutline = (n) =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const x = Math.sign(c) * Math.abs(c) ** 0.65 * 1.25;
    let y = Math.sign(s) * Math.abs(s) ** 0.8 * 0.52;
    if (s < 0) y += 0.34 * Math.exp(-((x / 0.3) ** 2)) * -s;
    return [x, y];
  });
const bend = (u, y, inset = 0) => new THREE.Vector3((LENS_R - inset) * Math.sin(u / LENS_R), y, (LENS_R - inset) * Math.cos(u / LENS_R) - LENS_R);

function goggles() {
  const group = new THREE.Group();
  const outline = goggleOutline(96);
  const lensAlpha = canvasTexture(512, 256, (ctx, w, h) => {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    outline.forEach(([x, y], i) => ctx[i ? "lineTo" : "moveTo"](((x * 0.97 + 1.3) / 2.6) * w, ((0.56 - y * 0.97) / 1.12) * h));
    ctx.fill();
  }, { color: false });
  const lensGeo = new THREE.PlaneGeometry(2.6, 1.12, 64, 16);
  const lp = lensGeo.attributes.position;
  for (let i = 0; i < lp.count; i++) lp.setXYZ(i, ...bend(lp.getX(i), lp.getY(i)).toArray());
  lensGeo.computeVertexNormals();
  const lens = mesh(group, lensGeo, phys({ color: "#dff6ff", transparent: true, opacity: 0.32, roughness: 0.04, clearcoat: 1, alphaMap: lensAlpha, side: THREE.DoubleSide, depthWrite: false }), 0, 1.1, 0);
  lens.renderOrder = 2;

  const vinyl = phys({ color: "#14e86a", roughness: 0.3, clearcoat: 1, transparent: true, opacity: 0.9 });
  const parts = new Parts();
  const front = outline.map(([x, y]) => bend(x * 1.01, y * 1.01, -0.01));
  const back = outline.map(([x, y]) => bend(x * 1.08, y * 1.12, 0.42));
  parts.add(tube(new THREE.CatmullRomCurve3(front, true), 0.075, { segments: 160, radial: 10 }), vinyl, { p: [0, 1.1, 0] });
  parts.add(tube(new THREE.CatmullRomCurve3(back, true), 0.09, { segments: 160, radial: 10 }), DARK, { p: [0, 1.1, 0] });
  // The skirt: a loft between the lens rim and the face seal.
  const skirt = new THREE.BufferGeometry();
  const verts = [];
  const uvs = [];
  for (let i = 0; i <= outline.length; i++) {
    const a = front[i % outline.length];
    const b = back[i % outline.length];
    verts.push(...a.toArray(), ...b.toArray());
    uvs.push(i / outline.length, 0, i / outline.length, 1);
  }
  const idx = [];
  for (let i = 0; i < outline.length; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  skirt.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  skirt.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  skirt.setIndex(idx);
  skirt.computeVertexNormals();
  const skirtMesh = mesh(group, skirt, phys({ color: "#14e86a", roughness: 0.4, clearcoat: 0.6, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }), 0, 1.1, 0);
  skirtMesh.renderOrder = 1;
  // Indirect vents along the top of the frame.
  for (const u of [-0.95, -0.45, 0.45, 0.95]) {
    const p = bend(u, 0.5, 0.2).add(new THREE.Vector3(0, 1.1, 0));
    parts.add(new THREE.CylinderGeometry(0.13, 0.15, 0.1, 24), vinyl, { p: p.toArray(), r: [0, -u / LENS_R, 0] });
    for (let k = 0; k < 3; k++) parts.add(new THREE.BoxGeometry(0.2, 0.03, 0.03), DARK, { p: [p.x, p.y + 0.06, p.z - 0.06 + k * 0.06], r: [0, -u / LENS_R, 0] });
  }
  // Elastic strap behind, with buckles at the frame.
  const strapTex = canvasTexture(512, 64, (ctx, w, h) => {
    ctx.fillStyle = "#22283a";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#3a4560";
    for (let x = 0; x < w; x += 8) ctx.fillRect(x, 0, 3, h);
    ctx.fillStyle = "#3fcf7f";
    ctx.fillRect(0, 6, w, 5);
    ctx.fillRect(0, h - 11, w, 5);
  }, { repeat: [4, 1] });
  const path = curve([[-1.33, 0, -0.35], [-1.55, 0.02, -1.3], [-1.0, 0.05, -2.4], [0, 0.06, -2.75], [1.0, 0.05, -2.4], [1.55, 0.02, -1.3], [1.33, 0, -0.35]]);
  const strap = new THREE.BufferGeometry();
  const sv = [];
  const su = [];
  for (let i = 0; i <= 80; i++) {
    const p = path.getPointAt(i / 80);
    sv.push(p.x, p.y - 0.17, p.z, p.x, p.y + 0.17, p.z);
    su.push(i / 80, 0, i / 80, 1);
  }
  const si = [];
  for (let i = 0; i < 80; i++) si.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  strap.setAttribute("position", new THREE.Float32BufferAttribute(sv, 3));
  strap.setAttribute("uv", new THREE.Float32BufferAttribute(su, 2));
  strap.setIndex(si);
  strap.computeVertexNormals();
  mesh(group, strap, std("#ffffff", 0.8, 0, { map: strapTex, side: THREE.DoubleSide }), 0, 1.1, 0);
  for (const s of [-1, 1]) parts.add(new RoundedBoxGeometry(0.16, 0.42, 0.3, 3, 0.05), DARK, { p: [s * 1.33, 1.1, -0.35], r: [0, s * 0.5, 0] });
  parts.build(group);
  return { group };
}

/* ---------- Nitrile gloves: five fingers, a flared cuff with a rolled rim. ---------- */

function gloves() {
  const group = new THREE.Group();
  const nitrile = phys({ color: "#3f78e8", vertexColors: true, roughness: 0.3, clearcoat: 0.85, clearcoatRoughness: 0.2, sheen: 0.7, sheenColor: new THREE.Color("#c4dcff"), sheenRoughness: 0.35 });
  const set = GLOVE();
  const pair = [-1, 1].map((s) => {
    const g = new THREE.Group();
    mesh(g, s < 0 ? set.left : set.geo, nitrile);
    g.position.set(s * 0.72, 0.58, 0);
    g.scale.setScalar(0.92);
    group.add(g);
    return g;
  });
  return { group, tick: (t, act) => pair.forEach((h, k) => (h.rotation.z = (k ? -1 : 1) * (0.1 + 0.08 * Math.sin(t * 8) * (1 - act)))) };
}

/* ---------- Long hair: a ponytail of tapered strands under a gathered crown, tied with a ruffled scrunchie. ---------- */

const HAIR_TEX = once(() => canvasTexture(64, 256, (ctx, w, h) => {
  for (let y = 0; y < h; y++) {
    const v = 0.55 + 0.45 * hash(y * 0.37) * hash(y * 1.3 + 2);
    ctx.fillStyle = `rgb(${Math.round(150 * v)},${Math.round(98 * v)},${Math.round(62 * v)})`;
    ctx.fillRect(0, y, w, 1);
  }
}));

function hair() {
  const group = new THREE.Group();
  group.scale.setScalar(0.8);
  const mat = phys({ color: "#ffffff", map: HAIR_TEX(), roughness: 0.42, sheen: 1, sheenRoughness: 0.3, sheenColor: new THREE.Color("#e0a878") });
  const TIE_Y = 2.0;
  const crown = new Parts();
  crown.add(lathe([[0.22, TIE_Y - 0.05], [0.42, TIE_Y + 0.1], [0.72, TIE_Y + 0.42], [0.84, TIE_Y + 0.8], [0.76, TIE_Y + 1.15], [0.46, TIE_Y + 1.38], [0, TIE_Y + 1.45]], 64), mat, { s: [1, 1, 0.85], r: [-0.25, 0, 0], p: [0, 0, -0.1] });
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2;
    const pts = [0, 1, 2, 3, 4].map((i) => {
      const u = i / 4;
      const r = lerp(0.2, 0.8, Math.sin(u * Math.PI * 0.55)) * (1 - u * 0.15);
      return [Math.cos(a) * r + Math.sin(a * 3) * 0.02, TIE_Y + u * 1.4, Math.sin(a) * r * 0.85 - 0.1 - u * 0.2];
    });
    crown.add(tube(curve(pts), 0.05, { segments: 20, radial: 6, taper: (u) => 1 - u * 0.6 }), mat);
  }
  crown.build(group);
  const tie = new THREE.TorusGeometry(0.28, 0.14, 16, 64);
  const tp = tie.attributes.position;
  for (let i = 0; i < tp.count; i++) {
    const x = tp.getX(i);
    const y = tp.getY(i);
    const k = 1 + 0.12 * Math.sin(Math.atan2(y, x) * 14);
    tp.setXYZ(i, x * k, y * k, tp.getZ(i) * (1 + 0.25 * Math.cos(Math.atan2(y, x) * 14)));
  }
  tie.computeVertexNormals();
  const scrunchie = mesh(group, tie, phys({ color: "#ff5dc8", roughness: 0.6, sheen: 1, sheenColor: new THREE.Color("#ffc0ec") }), 0, TIE_Y, -0.05);
  scrunchie.rotation.x = Math.PI / 2;
  const strands = Array.from({ length: 30 }, (_, k) => {
    const a = (k / 30) * Math.PI * 2 + hash(k) * 0.4;
    const pivot = new THREE.Group();
    pivot.position.set(Math.cos(a) * 0.12, TIE_Y, Math.sin(a) * 0.12 - 0.05);
    const len = 1.6 + hash(k * 3.3) * 0.5;
    const phase = hash(k * 1.7) * 6;
    const pts = [0, 1, 2, 3, 4, 5].map((i) => [Math.sin(phase + i * 0.9) * 0.06 * i, -len * (i / 5), Math.cos(phase + i) * 0.03 * i]);
    mesh(pivot, tube(curve(pts), 0.09 + hash(k * 5.1) * 0.05, { segments: 24, radial: 8, taper: (u) => 1 - u * 0.85 }), mat);
    group.add(pivot);
    return { pivot, a };
  });
  return {
    group,
    tick: (t, act) => {
      const spread = lerp(0.75, 0.12, act) + Math.sin(t * 5) * 0.05 * (1 - act);
      for (const { pivot, a } of strands) pivot.rotation.set(-Math.sin(a) * spread, 0, Math.cos(a) * spread + Math.sin(t * 2.2) * 0.04);
      scrunchie.scale.setScalar(Math.max(0.001, act));
    },
  };
}

/* ---------- Books: cloth covers, rounded spines, page blocks and headbands. ---------- */

const PAGES = once(() => canvasTexture(64, 256, (ctx, w, h) => {
  ctx.fillStyle = "#f4efdf";
  ctx.fillRect(0, 0, w, h);
  for (let y = 0; y < h; y += 3) {
    ctx.fillStyle = `rgba(120,100,70,${0.08 + hash(y) * 0.12})`;
    ctx.fillRect(0, y, w, 1);
  }
}));

function book(color, w = 1.8, d = 1.25, th = 0.36) {
  const cover = phys({ color, roughness: 0.55, sheen: 0.25, sheenColor: new THREE.Color(color), sheenRoughness: 0.6, clearcoat: 0.3, clearcoatRoughness: 0.4 });
  const parts = new Parts();
  for (const y of [0.03, th - 0.03]) parts.add(new RoundedBoxGeometry(w, 0.06, d, 2, 0.025), cover, { p: [0.03, y, 0] });
  parts.add(new THREE.CylinderGeometry(th / 2, th / 2, d, 24, 1, false, Math.PI, Math.PI), cover, { p: [-w / 2 + 0.05, th / 2, 0], r: [Math.PI / 2, 0, 0], s: [0.55, 1, 1] });
  parts.add(new THREE.BoxGeometry(w - 0.1, th - 0.1, d - 0.1), std("#c8c4b8", 0.9, 0, { map: PAGES() }), { p: [0.02, th / 2, 0] });
  parts.add(new THREE.BoxGeometry(0.06, 0.012, d * 0.9), std("#ffd23f", 0.3, 0.8), { p: [-w / 2 + 0.32, th + 0.002, 0] });
  parts.add(new THREE.BoxGeometry(0.06, 0.012, d * 0.9), std("#ffd23f", 0.3, 0.8), { p: [-w / 2 + 0.42, th + 0.002, 0] });
  parts.add(new RoundedBoxGeometry(0.75, 0.01, 0.42, 1, 0.004), WHITE, { p: [0.25, th + 0.002, 0] });
  for (const z of [-1, 1]) parts.add(new THREE.CylinderGeometry(0.03, 0.03, th - 0.1, 8), std("#ff5d5d", 0.6), { p: [-w / 2 + 0.07, th / 2, z * (d / 2 - 0.03)] });
  return parts.build();
}

function books() {
  const group = new THREE.Group();
  const stack = ["#d94a4a", "#2f8fd8", "#e8b52a"].map((c, k) => {
    const b = book(c, 1.8 - k * 0.12, 1.25 - k * 0.05, 0.36 + (k % 2) * 0.06);
    group.add(b);
    return b;
  });
  const messy = [[-1.3, 0, 0.2, 0.6, 0], [1.2, 0, -0.1, 2.3, 0], [0, 0.55, 0, 1.2, 0.35]];
  return {
    group,
    tick: (t, act) =>
      stack.forEach((b, k) => {
        const [x, y, z, ry, rz] = messy[k];
        b.position.set(lerp(x, 0, act), lerp(y, k * 0.4, act), lerp(z, 0, act));
        b.rotation.set(0, lerp(ry, (k - 1) * 0.12, act), lerp(rz, 0, act));
      }),
  };
}

/* ---------- Clipboard: grained board, sprung metal clip, a checklist sheet that ticks itself. ---------- */

const MASONITE = once(() => canvasTexture(256, 256, (ctx, w, h) => {
  ctx.fillStyle = "#9a6a3a";
  ctx.fillRect(0, 0, w, h);
  speckle(ctx, w, h, 900, 0.5, 1.6, "rgba(60,35,15,0.35)", 3);
  speckle(ctx, w, h, 500, 0.5, 1.2, "rgba(220,170,110,0.25)", 7);
}));
const SHEET = once(() => canvasTexture(384, 512, (ctx, w, h) => {
  ctx.fillStyle = "#fbfaf4";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#2f8fd8";
  ctx.fillRect(0, 0, w, 64);
  ctx.fillStyle = "#ffffff";
  ctx.font = "800 34px Avenir Next Condensed";
  ctx.fillText("SAFETY CHECKLIST", 30, 45);
  ctx.strokeStyle = "#c8d4e8";
  ctx.lineWidth = 2;
  for (let y = 96; y < h; y += 26) {
    ctx.beginPath();
    ctx.moveTo(20, y);
    ctx.lineTo(w - 20, y);
    ctx.stroke();
  }
  ctx.strokeStyle = "#30384a";
  ctx.lineWidth = 5;
  for (let k = 0; k < 4; k++) {
    const y = 130 + k * 96;
    ctx.strokeRect(36, y - 22, 44, 44);
    ctx.fillStyle = "#30384a";
    ctx.fillRect(104, y - 8, 170 + hash(k) * 60, 12);
    ctx.fillStyle = "#8a94a8";
    ctx.fillRect(104, y + 14, 120 + hash(k + 4) * 60, 8);
  }
}));
const CHECK = (() => {
  const s = new THREE.Shape();
  [[-0.1, 0.0], [-0.03, -0.08], [0.12, 0.1], [0.09, 0.13], [-0.03, -0.02], [-0.07, 0.03]].forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  return new THREE.ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2 });
})();

function steps() {
  const group = new THREE.Group();
  const parts = new Parts();
  parts.add(new THREE.ExtrudeGeometry(rounded(1.7, 2.3, 0.14), { depth: 0.06, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 3 }), std("#ffffff", 0.7, 0, { map: MASONITE() }), { p: [0, 1.15, -0.03] });
  parts.add(new THREE.PlaneGeometry(1.44, 1.92), std("#c4c4be", 0.85, 0, { map: SHEET() }), { p: [0, 1.04, 0.07] });
  parts.add(new THREE.PlaneGeometry(1.44, 1.92), std("#b8b6ae", 0.9), { p: [0.02, 1.02, 0.065], r: [0, 0, -0.02] });
  parts.add(new RoundedBoxGeometry(0.95, 0.3, 0.07, 3, 0.03), STEEL, { p: [0, 2.12, 0.08] });
  parts.add(new THREE.CylinderGeometry(0.05, 0.05, 0.86, 16), STEEL, { p: [0, 2.0, 0.13], r: [0, 0, Math.PI / 2] });
  parts.add(tube(curve([[-0.4, 2.0, 0.14], [-0.38, 2.28, 0.2], [0, 2.38, 0.22], [0.38, 2.28, 0.2], [0.4, 2.0, 0.14]]), 0.035, { segments: 40, radial: 8 }), STEEL);
  for (const x of [-0.33, 0.33]) parts.add(new THREE.SphereGeometry(0.04, 12, 8), STEEL, { p: [x, 2.18, 0.12], s: [1, 1, 0.5] });
  parts.add(new THREE.TorusGeometry(0.08, 0.025, 8, 24), DARK, { p: [0, 2.2, 0.0] });
  parts.build(group);
  const ticks = [0, 1, 2, 3].map((k) => {
    const m = mesh(group, CHECK, std("#2fb36a", 0.4), -0.5, 1.04 + (0.5 - (130 + k * 96) / 512) * 1.92, 0.08);
    return m;
  });
  return { group, tick: (t, act) => ticks.forEach((m, k) => m.scale.setScalar(0.9 * smooth((k + 0.6) / 5, (k + 1) / 5, act) + 0.001)) };
}

/* ---------- Ear: an ear-shaped pinna with helix rim, antihelix, concha, tragus and lobe; sound waves come in. ---------- */

function listen() {
  const group = new THREE.Group();
  const ear = mesh(group, EAR(), SKIN, -0.4, 1.2, 0);
  ear.scale.setScalar(1.05);
  const waves = [0, 1, 2].map(() => {
    const w = mesh(group, new THREE.TorusGeometry(1, 0.05, 8, 40, Math.PI * 0.55), glow("#3dc2ff"), -0.3, 1.15, 0.3);
    w.rotation.z = -Math.PI * 0.275;
    return w;
  });
  return {
    group,
    tick: (t) =>
      waves.forEach((w, k) => {
        const u = (t * 0.9 + k / 3) % 1;
        w.scale.setScalar(2.1 - u * 1.2);
        w.material.opacity = smooth(0, 0.2, u) * (1 - smooth(0.7, 1, u)) * 0.9;
      }),
  };
}

/* ---------- Sandwich (crust, crumb, lettuce, tomato, cheese) and a lidded cup with a bendy straw. ---------- */

const CRUMB = once(() => canvasTexture(256, 256, (ctx, w, h) => {
  ctx.fillStyle = "#f4dca4";
  ctx.fillRect(0, 0, w, h);
  speckle(ctx, w, h, 700, 0.6, 2.2, "rgba(190,140,70,0.35)", 11);
  speckle(ctx, w, h, 300, 0.5, 1.4, "rgba(255,250,230,0.6)", 5);
}, { repeat: [2, 2] }));
const TOMATO = once(() => canvasTexture(128, 128, (ctx, w) => {
  ctx.fillStyle = "#d8282b";
  ctx.beginPath();
  ctx.arc(w / 2, w / 2, w / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ff6a50";
  ctx.beginPath();
  ctx.arc(w / 2, w / 2, w * 0.4, 0, Math.PI * 2);
  ctx.fill();
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.4;
    ctx.fillStyle = "#ffb08a";
    ctx.beginPath();
    ctx.ellipse(w / 2 + Math.cos(a) * w * 0.2, w / 2 + Math.sin(a) * w * 0.2, w * 0.13, w * 0.08, a, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f4e2a0";
    for (let s = 0; s < 4; s++) ctx.fillRect(w / 2 + Math.cos(a) * w * (0.14 + s * 0.035) - 2, w / 2 + Math.sin(a) * w * (0.14 + s * 0.035) - 2, 4, 6);
  }
  ctx.fillStyle = "#ff8a6a";
  ctx.beginPath();
  ctx.arc(w / 2, w / 2, w * 0.07, 0, Math.PI * 2);
  ctx.fill();
}));
const CUP_PRINT = once(() => canvasTexture(512, 128, (ctx, w, h) => {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#ff4f5e";
  for (let x = 0; x < w; x += 64) {
    ctx.beginPath();
    ctx.arc(x + 32, h * 0.25, 10, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillRect(0, h * 0.75, w, 10);
}, { repeat: [1, 1] }));
const STRAW = once(() => canvasTexture(256, 32, (ctx, w, h) => {
  for (let x = 0; x < w; x += 32) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x, 0, 16, h);
    ctx.fillStyle = "#3dc2ff";
    ctx.fillRect(x + 16, 0, 16, h);
  }
}, { repeat: [3, 1] }));

function food() {
  const group = new THREE.Group();
  const tri = new THREE.Shape();
  tri.moveTo(-0.95, -0.6);
  tri.lineTo(0.75, -0.6);
  tri.quadraticCurveTo(0.95, -0.6, 0.8, -0.42);
  tri.lineTo(-0.8, 0.85);
  tri.quadraticCurveTo(-0.95, 0.98, -0.95, 0.75);
  tri.lineTo(-0.95, -0.6);
  const slice = new THREE.ExtrudeGeometry(tri, { depth: 0.14, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.07, bevelSegments: 4, curveSegments: 12 }).rotateX(-Math.PI / 2);
  const crumb = std("#c8c0b0", 0.95, 0, { map: CRUMB() });
  const crust = phys({ color: "#b8732c", roughness: 0.75, sheen: 0.3, sheenColor: new THREE.Color("#ffd08a") });
  const sw = new THREE.Group();
  sw.position.set(-0.55, 0, 0.1);
  sw.rotation.y = 0.35;
  group.add(sw);
  for (const y of [0.06, 0.54]) mesh(sw, slice, [crumb, crust], 0, y, 0);
  const leafShape = new THREE.Shape(tri.getPoints(60).map((p, i) => new THREE.Vector2(p.x * 1.1 + Math.sin(i * 1.3) * 0.03, p.y * 1.1 + Math.cos(i * 1.7) * 0.03)));
  const leaf = new THREE.ExtrudeGeometry(leafShape, { depth: 0.03, bevelEnabled: false, curveSegments: 4 }).rotateX(-Math.PI / 2);
  const lp = leaf.attributes.position;
  for (let i = 0; i < lp.count; i++) lp.setY(i, lp.getY(i) + 0.04 * Math.sin(lp.getX(i) * 11) * Math.cos(lp.getZ(i) * 9));
  leaf.computeVertexNormals();
  mesh(sw, leaf, phys({ color: "#5fcf4f", roughness: 0.5, sheen: 0.6, sheenColor: new THREE.Color("#c8ff9a"), side: THREE.DoubleSide }), 0, 0.3, 0);
  for (const [x, z] of [[-0.45, 0.25], [0.15, 0.4], [-0.5, -0.35]]) {
    mesh(sw, new THREE.CylinderGeometry(0.3, 0.3, 0.06, 40), [std("#c81e22", 0.5), std("#ffffff", 0.4, 0, { map: TOMATO() }), std("#ffffff", 0.4, 0, { map: TOMATO() })], x, 0.37, z);
  }
  mesh(sw, new RoundedBoxGeometry(1.25, 0.04, 1.25, 2, 0.015), phys({ color: "#ffc93a", roughness: 0.35, clearcoat: 0.4 }), -0.3, 0.44, 0.1).rotation.y = 0.75;

  const cup = new Parts();
  cup.add(lathe([[0.3, 0], [0.33, 0.02], [0.45, 1.32], [0.47, 1.36]], 56), std("#c8c8c4", 0.6, 0, { map: CUP_PRINT(), side: THREE.DoubleSide }));
  cup.add(new THREE.CircleGeometry(0.31, 40), WHITE, { p: [0, 0.01, 0], r: [Math.PI / 2, 0, 0] });
  cup.add(lathe([[0.385, 0.42], [0.415, 0.45], [0.455, 0.92], [0.43, 0.95]], 56), std("#b5895a", 0.85));
  cup.add(lathe([[0.48, 1.3], [0.5, 1.36], [0.49, 1.43], [0.42, 1.45], [0.4, 1.5], [0.2, 1.53], [0, 1.54]], 56), phys({ color: "#b4b4b0", roughness: 0.25, clearcoat: 0.6 }));
  cup.add(new THREE.TorusGeometry(0.5, 0.025, 8, 56), WHITE, { p: [0, 1.36, 0], r: [Math.PI / 2, 0, 0] });
  cup.add(tube(curve([[0.05, 0.9, 0], [0.06, 1.7, 0], [0.08, 1.95, 0], [0.18, 2.08, 0], [0.42, 2.14, 0]]), 0.045, { segments: 40, radial: 10 }), std("#ffffff", 0.4, 0, { map: STRAW() }));
  for (let k = 0; k < 4; k++) cup.add(new THREE.TorusGeometry(0.05, 0.008, 6, 16), std("#e8f8ff", 0.4), { p: [0.065 + k * 0.012, 1.86 + k * 0.035, 0], r: [Math.PI / 2, 0, -0.3 - k * 0.15] });
  const cg = cup.build();
  cg.position.set(0.8, 0, -0.1);
  group.add(cg);
  return { group };
}

/* ---------- Running sneaker: midsole, treaded outsole, padded collar, tongue, laces and eyelets. ---------- */

const MESH = once(() => canvasTexture(128, 128, (ctx, w, h) => {
  ctx.fillStyle = "#e84a4a";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "rgba(120,10,20,0.35)";
  for (let y = 0; y < h; y += 8) for (let x = (y / 8) % 2 ? 4 : 0; x < w; x += 8) ctx.fillRect(x, y, 3, 3);
}, { repeat: [4, 4] }));

function shoe() {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const side = (pts) => new THREE.Shape(curve(pts.map(([x, y]) => [x, y, 0]), true).getPoints(80).map((p) => new THREE.Vector2(p.x, p.y)));
  const parts = new Parts();
  const upper = side([[-1.0, 0.28], [-1.1, 0.6], [-0.98, 0.92], [-0.72, 0.86], [-0.38, 0.92], [0.1, 0.74], [0.55, 0.5], [0.95, 0.38], [1.1, 0.28], [0.2, 0.27]]);
  const fabric = phys({ color: "#ffffff", map: MESH(), roughness: 0.65, sheen: 0.6, sheenColor: new THREE.Color("#ffb0b0") });
  parts.add(new THREE.ExtrudeGeometry(upper, { depth: 0.5, bevelEnabled: true, bevelThickness: 0.17, bevelSize: 0.13, bevelSegments: 6, curveSegments: 10 }), fabric, { p: [0, 0, -0.25] });
  const sole = side([[-1.12, 0.02], [0.4, 0.0], [1.2, 0.04], [1.27, 0.16], [1.18, 0.33], [0.2, 0.3], [-1.16, 0.34], [-1.2, 0.14]]);
  parts.add(new THREE.ExtrudeGeometry(sole, { depth: 0.82, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 3 }), phys({ color: "#a2a29e", roughness: 0.55, clearcoat: 0.3 }), { p: [0, 0, -0.41] });
  parts.add(new RoundedBoxGeometry(2.36, 0.08, 0.92, 2, 0.03), std("#2a2e38", 0.85), { p: [0.03, 0.02, 0] });
  for (let k = 0; k < 12; k++) parts.add(new THREE.BoxGeometry(0.06, 0.07, 0.96), std("#2a2e38", 0.85), { p: [-1.0 + k * 0.19, 0.06, 0] });
  const stripe = side([[-0.75, 0.42], [-0.2, 0.5], [0.45, 0.42], [0.7, 0.36], [0.4, 0.36], [-0.2, 0.42]]);
  parts.add(new THREE.ShapeGeometry(stripe, 12), std("#c4c4c4", 0.4), { p: [0, 0, 0.43] });
  parts.add(tube(curve([[-1.02, 0.99, 0], [-0.84, 1.02, 0.28], [-0.52, 1.01, 0.3], [-0.34, 1.03, 0], [-0.52, 1.01, -0.3], [-0.84, 1.02, -0.28]], true), 0.075, { segments: 60, radial: 10 }), std("#30343e", 0.7));
  parts.add(new THREE.SphereGeometry(1, 32, 12), std("#14161b", 0.9), { p: [-0.68, 0.99, 0], s: [0.34, 0.05, 0.27] });
  const tongue = side([[-0.45, 0.78], [-0.42, 1.14], [-0.22, 1.18], [0.0, 0.8]]);
  parts.add(new THREE.ExtrudeGeometry(tongue, { depth: 0.36, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 3 }), std("#c43838", 0.8), { p: [0, 0, -0.18] });
  parts.add(new RoundedBoxGeometry(0.14, 0.3, 0.2, 2, 0.05), std("#30343e", 0.6), { p: [-1.1, 0.95, 0] });
  const lace = std("#ffffff", 0.6);
  for (let k = 0; k < 5; k++) {
    const x = -0.25 + k * 0.17;
    const y = 0.99 - k * 0.078;
    parts.add(tube(curve([[x, y, -0.3], [x + 0.04, y + 0.07, 0], [x, y, 0.3]]), 0.028, { segments: 16, radial: 6 }), lace);
    for (const z of [-0.31, 0.31]) parts.add(new THREE.TorusGeometry(0.04, 0.014, 6, 16), STEEL, { p: [x, y - 0.01, z], r: [Math.PI / 2 - 0.4, 0, 0] });
  }
  parts.add(tube(curve([[-0.25, 1.04, 0], [-0.4, 1.0, 0.25], [-0.45, 0.8, 0.42], [-0.38, 0.62, 0.45]]), 0.026, { segments: 20, radial: 6 }), lace);
  parts.add(tube(curve([[-0.25, 1.04, 0], [-0.1, 1.05, 0.22], [-0.05, 0.85, 0.42], [0.05, 0.7, 0.45]]), 0.026, { segments: 20, radial: 6 }), lace);
  parts.build(body);
  const lines = [0.35, 0.65, 0.95].map((y) => mesh(group, new THREE.CapsuleGeometry(0.035, 1, 4, 8).rotateZ(Math.PI / 2), glow("#ffffff", 0.7), -1.9, y, 0));
  return {
    group,
    tick: (t, act, star) => {
      body.position.y = Math.abs(Math.sin(t * 9)) * 0.25 * star;
      body.rotation.z = (0.12 + Math.sin(t * 9) * 0.08) * star;
      lines.forEach((l, k) => {
        const u = (t * 3 + k * 0.37) % 1;
        l.scale.x = 0.3 + u;
        l.position.x = -1.6 - u * 0.8;
        l.material.opacity = 0.7 * (1 - u) * star;
      });
    },
  };
}

/* ---------- Raised hand: five-fingered hand in a buttoned sleeve. ---------- */

function raisedHand() {
  const group = new THREE.Group();
  group.add(skinHand(HAND()));
  const sleeve = phys({ color: "#ff9d3d", roughness: 0.7, sheen: 0.9, sheenColor: new THREE.Color("#ffd2a0"), side: THREE.DoubleSide });
  const parts = new Parts();
  parts.add(lathe([[0.5, -1.0], [0.48, -0.4], [0.44, -0.02], [0.42, 0.04]], 48), sleeve, { s: [1, 1, 0.85] });
  parts.add(new THREE.TorusGeometry(0.43, 0.06, 10, 48), sleeve, { p: [0, 0.02, 0], r: [Math.PI / 2, 0, 0], s: [1, 0.85, 1] });
  parts.add(lathe([[0.47, -0.22], [0.475, 0.0]], 48), std("#e07a24", 0.8, 0, { side: THREE.DoubleSide }), { s: [1, 1, 0.86] });
  for (const y of [-0.14, -0.4]) parts.add(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 16), WHITE, { p: [0.3, y, 0.33], r: [Math.PI / 2 - 0.2, 0, 0.4] });
  parts.add(new THREE.BoxGeometry(0.02, 0.6, 0.02), std("#c86a20", 0.8), { p: [0.3, -0.6, 0.38], r: [0, 0, 0.1] });
  parts.build(group);
  group.position.y = 0.8;
  group.scale.setScalar(0.8);
  const holder = new THREE.Group();
  holder.add(group);
  return { group: holder, tick: (t) => (group.rotation.z = Math.sin(t * 7) * 0.15) };
}

/* ---------- Never taste: lips with a cupid's bow, teeth and tongue, beside a test tube in a block stand. ---------- */

function mouth() {
  const group = new THREE.Group();
  const lips = phys({ color: "#e8435e", roughness: 0.3, clearcoat: 0.6, sheen: 0.3 });
  const parts = new Parts();
  const at = [-0.45, 1.25, 0];
  const lift = (u) => 0.25 + 0.75 * Math.sin(u * Math.PI) ** 0.7;
  parts.add(tube(curve([[-0.78, 0, 0.05], [-0.42, 0.22, 0.2], [-0.13, 0.3, 0.26], [0, 0.22, 0.28], [0.13, 0.3, 0.26], [0.42, 0.22, 0.2], [0.78, 0, 0.05]]), 0.16, { segments: 64, radial: 16, taper: lift }), lips, { p: at });
  parts.add(tube(curve([[-0.78, 0, 0.05], [-0.42, -0.34, 0.22], [0, -0.46, 0.3], [0.42, -0.34, 0.22], [0.78, 0, 0.05]]), 0.2, { segments: 64, radial: 16, taper: lift }), lips, { p: at });
  parts.add(new THREE.SphereGeometry(0.62, 32, 20), std("#4a0f1c", 0.9), { p: [at[0], at[1] - 0.08, at[2] - 0.05], s: [1.05, 0.5, 0.3] });
  for (let k = 0; k < 4; k++) parts.add(new RoundedBoxGeometry(0.16, 0.15, 0.08, 2, 0.04), phys({ color: "#e0dfd6", roughness: 0.2, clearcoat: 1 }), { p: [at[0] - 0.24 + k * 0.16, at[1] + 0.1, at[2] + 0.17] });
  parts.build(group);
  const tg = new THREE.SphereGeometry(0.42, 32, 20);
  const tp = tg.attributes.position;
  for (let i = 0; i < tp.count; i++) if (tp.getY(i) > 0) tp.setY(i, tp.getY(i) - 0.12 * Math.exp(-((tp.getX(i) / 0.1) ** 2)));
  tg.computeVertexNormals();
  const tongue = mesh(group, tg, phys({ color: "#ff7f98", roughness: 0.45, clearcoat: 0.5 }), at[0], at[1] - 0.2, 0.28);
  tongue.scale.set(0.82, 0.42, 0.6);
  const stand = new Parts();
  stand.add(new RoundedBoxGeometry(0.62, 0.32, 0.62, 3, 0.06), std("#9a6a3a", 0.7, 0, { map: MASONITE() }), { p: [1.0, 0.16, 0] });
  stand.build(group);
  const tubeG = new THREE.Group();
  tubeG.position.set(1.0, 0.12, 0);
  tubeG.scale.setScalar(1.15);
  glassware(tubeG, TUBE, { color: "#7cff4f", fill: 0.55, marks: false });
  group.add(tubeG);
  return { group, tick: (t) => (tongue.position.y = at[1] - 0.2 - 0.06 * Math.abs(Math.sin(t * 5))) };
}

/* ---------- Never sniff: an Erlenmeyer flask with soft, drifting fumes. ---------- */

const PUFF = /* glsl */ `
  uniform float uOpacity; varying vec3 vN; varying vec3 vV;
  void main() {
    float d = abs(dot(normalize(vN), normalize(vV)));
    gl_FragColor = vec4(vec3(0.72, 1.0, 0.6) * d, pow(d, 1.6) * uOpacity);
  }`;

function fumes() {
  const group = new THREE.Group();
  const flask = new THREE.Group();
  flask.scale.setScalar(0.9);
  glassware(flask, ERLEN, { color: "#8fff4a", fill: 0.4 });
  group.add(flask);
  const geo = new THREE.SphereGeometry(0.3, 20, 14);
  const puffs = Array.from({ length: 9 }, () => {
    const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uOpacity: { value: 0 } }, vertexShader: GLASS.vertexShader, fragmentShader: PUFF });
    const m = new THREE.Mesh(geo, mat);
    group.add(m);
    return m;
  });
  return {
    group,
    tick: (t) =>
      puffs.forEach((p, k) => {
        const u = (t * 0.42 + k / 9) % 1;
        p.position.set(Math.sin(u * 6 + k) * 0.5 * u, 2.15 + u * 1.7, Math.cos(u * 5 + k) * 0.2 * u);
        p.scale.setScalar(0.35 + u * 1.5);
        p.material.uniforms.uOpacity.value = 0.55 * Math.sin(u * Math.PI);
      }),
  };
}

/* ---------- Amber reagent bottle: printed label, neck threads and a knurled screw cap. ---------- */

const LABEL = once(() => canvasTexture(512, 256, (ctx, w, h) => {
  ctx.fillStyle = "#fbf8ee";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#2f8fd8";
  ctx.fillRect(0, 0, w, 52);
  ctx.fillStyle = "#ffffff";
  ctx.font = "800 36px Avenir Next Condensed";
  ctx.fillText("SODIUM CHLORIDE", 140, 40);
  ctx.fillStyle = "#1d2433";
  ctx.font = "800 64px Avenir Next";
  ctx.fillText("NaCl", 160, 130);
  ctx.font = "600 24px Menlo";
  ctx.fillText("500 mL · LAB GRADE", 160, 172);
  for (let x = 160; x < 360; x += 6) ctx.fillRect(x, 196, hash(x) > 0.5 ? 3 : 1.5, 40);
  ctx.save();
  ctx.translate(390, 120);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#e0242f";
  ctx.lineWidth = 9;
  ctx.fillRect(-42, -42, 84, 84);
  ctx.strokeRect(-42, -42, 84, 84);
  ctx.restore();
  ctx.fillStyle = "#1d2433";
  ctx.font = "800 64px Avenir Next";
  ctx.fillText("!", 380, 143);
}));

function bottle() {
  const group = new THREE.Group();
  const parts = new Parts();
  const amber = phys({ color: "#8a3a0a", roughness: 0.06, clearcoat: 1, transparent: true, opacity: 0.86 });
  parts.add(lathe([[0, 0], [0.6, 0], [0.66, 0.04], [0.68, 0.14], [0.68, 1.25], [0.62, 1.45], [0.42, 1.62], [0.28, 1.72], [0.26, 1.8], [0.28, 1.84], [0.28, 2.0]], 64), amber);
  parts.add(lathe([[0, 0.05], [0.6, 0.05], [0.62, 0.95], [0, 0.95]], 48), std("#3a1404", 0.4));
  parts.add(lathe([[0.688, 0.42], [0.688, 1.08]], 64, -1.25, 2.5), std("#d0ccc0", 0.75, 0, { map: LABEL(), side: THREE.DoubleSide }));
  const thread = curve(Array.from({ length: 25 }, (_, i) => [Math.cos(i * 0.75) * 0.29, 1.86 + i * 0.005, Math.sin(i * 0.75) * 0.29]));
  parts.add(tube(thread, 0.018, { segments: 80, radial: 6 }), amber);
  parts.build(group);
  const capG = ridge(new THREE.CylinderGeometry(0.34, 0.34, 0.36, 96, 1), 40, 0.012);
  const cap = new THREE.Group();
  const capMat = phys({ color: "#1d2433", roughness: 0.35, clearcoat: 0.7 });
  mesh(cap, capG, capMat, 0, 0, 0);
  mesh(cap, new THREE.CylinderGeometry(0.3, 0.33, 0.06, 48), capMat, 0, 0.2, 0);
  group.add(cap);
  return {
    group,
    tick: (t, act) => {
      cap.position.y = 2.0 + 0.6 * (1 - act);
      cap.rotation.y = (1 - act) * 8;
    },
  };
}

/* ---------- Crucible tongs (finger loops, rivet, bowed jaws) gripping a porcelain crucible. ---------- */

function tongs() {
  const group = new THREE.Group();
  group.scale.setScalar(0.82);
  const porcelain = phys({ color: "#d4d2cc", roughness: 0.2, clearcoat: 1, side: THREE.DoubleSide });
  const cr = new Parts();
  cr.add(lathe([[0, 0], [0.18, 0], [0.22, 0.03], [0.3, 0.38], [0.34, 0.44], [0.36, 0.46]], 56), porcelain);
  cr.add(new THREE.TorusGeometry(0.36, 0.02, 8, 48), porcelain, { p: [0, 0.46, 0], r: [Math.PI / 2, 0, 0] });
  cr.add(new THREE.TorusGeometry(0.2, 0.015, 6, 40), std("#8a7a6a", 0.6), { p: [0, 0.02, 0], r: [Math.PI / 2, 0, 0] });
  cr.build(group);
  const arms = [-1, 1].map((s) => {
    const pivot = new THREE.Group();
    pivot.position.y = 1.75;
    const p = new Parts();
    const path = curve([[-s * 0.32, 1.0, 0], [-s * 0.18, 0.55, 0], [0, 0, s * 0.03], [s * 0.16, -0.5, 0], [s * 0.3, -0.95, 0], [s * 0.22, -1.25, 0]]);
    p.add(tube(path, 0.045, { segments: 60, radial: 10 }), STEEL);
    p.add(new THREE.TorusGeometry(0.14, 0.04, 10, 32), STEEL, { p: [-s * 0.36, 1.13, 0] });
    p.add(new THREE.TorusGeometry(0.1, 0.03, 8, 24, Math.PI), STEEL, { p: [s * 0.14, -1.3, 0], r: [Math.PI / 2, 0, s > 0 ? Math.PI : 0] });
    p.build(pivot);
    group.add(pivot);
    return { pivot, s };
  });
  const rivet = new Parts();
  rivet.add(new THREE.CylinderGeometry(0.08, 0.08, 0.2, 20), STEEL, { p: [0, 1.75, 0], r: [Math.PI / 2, 0, 0] });
  for (const z of [-0.1, 0.1]) rivet.add(new THREE.SphereGeometry(0.09, 16, 10), STEEL, { p: [0, 1.75, z], s: [1, 1, 0.45] });
  rivet.build(group);
  return { group, tick: (t, act) => arms.forEach(({ pivot, s }) => (pivot.rotation.z = s * lerp(0.2, 0.03, act))) };
}

/* ---------- Spill: a tipped spouted beaker, a trickle and a glossy puddle with a raised meniscus edge. ---------- */

function puddleGeometry() {
  const rings = 10;
  const segs = 96;
  const pos = [0, 0.07, 0];
  for (let k = 1; k <= rings; k++) {
    const f = k / rings;
    for (let j = 0; j < segs; j++) {
      const a = (j / segs) * Math.PI * 2;
      const r = f * (1 + 0.16 * Math.sin(a * 3 + 0.5) + 0.08 * Math.sin(a * 5 + 2) + 0.05 * Math.sin(a * 9));
      pos.push(Math.cos(a) * r, 0.07 * (1 - f ** 6) + 0.012 * Math.sin(f * Math.PI) * (f > 0.8 ? 1 : 0), Math.sin(a) * r);
    }
  }
  const idx = [];
  for (let j = 0; j < segs; j++) idx.push(0, 1 + ((j + 1) % segs), 1 + j);
  for (let k = 1; k < rings; k++) {
    for (let j = 0; j < segs; j++) {
      const a = 1 + (k - 1) * segs + j;
      const b = 1 + (k - 1) * segs + ((j + 1) % segs);
      idx.push(a, b, a + segs, b, b + segs, a + segs);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

function spill() {
  const group = new THREE.Group();
  const water = phys({ color: "#3d9cff", roughness: 0.03, clearcoat: 1, transparent: true, opacity: 0.78 });
  const tipped = new THREE.Group();
  tipped.position.set(-1.05, 0.86, 0);
  tipped.rotation.z = -Math.PI / 2 + 0.08;
  glassware(tipped, BEAKER, { spout: true });
  group.add(tipped);
  const puddle = mesh(group, puddleGeometry(), water, 0.95, 0.005, 0.25);
  puddle.renderOrder = 1;
  mesh(group, tube(curve([[0.55, 0.75, 0], [0.62, 0.45, 0.06], [0.6, 0.12, 0.14], [0.66, 0.03, 0.2]]), 0.05, { segments: 24, radial: 10, taper: (u) => 0.6 + u * 0.6 }), water);
  const drops = [[1.9, 0.6], [2.05, -0.2], [0.2, 0.9]].map(([x, z]) => {
    const d = mesh(group, new THREE.SphereGeometry(0.09, 16, 10), water, x, 0.02, z);
    d.scale.set(1, 0.4, 1);
    return d;
  });
  return {
    group,
    tick: (t, act) => {
      const k = 0.35 + 0.65 * act + Math.sin(t * 3) * 0.02;
      puddle.scale.set(1.05 * k, 1, 0.7 * k);
      drops.forEach((d) => d.scale.set(act + 0.001, 0.4, act + 0.001));
    },
  };
}

/* ---------- Cracked beaker: branching hairline cracks across the glass and a chipped shard. ---------- */

function cracked() {
  const group = new THREE.Group();
  const glass = new THREE.Group();
  glass.scale.setScalar(1.2);
  glassware(glass, BEAKER, { color: "#ff9d3d", fill: 0.48, spout: true });
  group.add(glass);
  const crack = glow("#ffffff", 0.95);
  const parts = new Parts();
  for (const c of cracks(0.835, 0.15, 1.45, 4.2)) parts.add(tube(c, 0.011, { segments: 24, radial: 4 }), crack, { s: 1.2 });
  parts.build(group, { shadow: false });
  const shardShape = new THREE.Shape([[0, 0], [0.32, 0.05], [0.12, 0.26]].map(([x, y]) => new THREE.Vector2(x, y)));
  mesh(group, new THREE.ExtrudeGeometry(shardShape, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 1 }), phys({ color: "#dff2ff", roughness: 0.05, transparent: true, opacity: 0.45, clearcoat: 1 }), 1.25, 0.02, 0.55).rotation.set(-Math.PI / 2, 0, 0.6);
  return { group, tick: (t, act) => crack.color.set(act > 0 && act < 1 && Math.sin(t * 20) > 0 ? "#ff6a5e" : "#ffffff") };
}

/* ---------- Sponge: porous foam under a fibrous scouring pad, iridescent suds. ---------- */

const FOAM = once(() => canvasTexture(256, 256, (ctx, w, h) => {
  ctx.fillStyle = "#ffd23f";
  ctx.fillRect(0, 0, w, h);
  speckle(ctx, w, h, 650, 1.2, 4.5, "rgba(150,95,0,0.55)", 21);
  speckle(ctx, w, h, 300, 0.8, 2.2, "rgba(255,240,170,0.6)", 9);
}, { repeat: [2, 1] }));
const PORES = once(() => canvasTexture(256, 256, (ctx, w, h) => {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  speckle(ctx, w, h, 650, 1.2, 4.5, "#000000", 21);
}, { repeat: [2, 1], color: false }));
const SCOUR = once(() => canvasTexture(256, 64, (ctx, w, h) => {
  ctx.fillStyle = "#2fa85a";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(10,60,25,0.6)";
  for (let i = 0; i < 500; i++) {
    const x = hash(i * 1.1) * w;
    const y = hash(i * 2.3) * h;
    const a = hash(i * 3.7) * Math.PI;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * 9, y + Math.sin(a) * 9);
    ctx.stroke();
  }
}, { repeat: [2, 1] }));

function sponge() {
  const group = new THREE.Group();
  const body = new Parts();
  body.add(new RoundedBoxGeometry(1.9, 0.62, 1.15, 5, 0.18), std("#ffffff", 0.95, 0, { map: FOAM(), bumpMap: PORES(), bumpScale: 2 }), { p: [0, 0.31, 0] });
  body.add(new RoundedBoxGeometry(1.92, 0.2, 1.17, 3, 0.07), std("#ffffff", 0.95, 0, { map: SCOUR(), bumpMap: SCOUR(), bumpScale: 1.5 }), { p: [0, 0.72, 0] });
  const pad = body.build();
  group.add(pad);
  const bubbles = Array.from({ length: 10 }, () => mesh(group, new THREE.SphereGeometry(0.16, 20, 14), BUBBLE));
  return {
    group,
    tick: (t) => {
      pad.position.x = Math.sin(t * 10) * 0.15;
      bubbles.forEach((b, k) => {
        const u = (t * 0.6 + k / 10) % 1;
        b.position.set(Math.sin(k * 2.3) * 1.0, 0.9 + u * 1.3, Math.cos(k * 1.7) * 0.3);
        b.scale.setScalar((0.6 + u * 0.8) * (u < 0.92 ? 1 : 0.001));
      });
    },
  };
}

/* ---------- Sink: steel basin with a drain, gooseneck faucet with lever, running water and hands washing. ---------- */

const WATER = /* glsl */ `
  uniform float uTime; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
  void main() {
    float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.5);
    float streak = 0.5 + 0.5 * sin(vUv.x * 40.0 + sin(vUv.y * 9.0 + uTime * 6.0) * 2.0);
    float flow = 0.6 + 0.4 * sin(vUv.y * 30.0 + uTime * 40.0);
    gl_FragColor = vec4(vec3(0.6, 0.85, 1.0), 0.1 + f * 0.4 + streak * flow * 0.15);
  }`;

function sink() {
  const group = new THREE.Group();
  const steel = phys({ color: "#7c848e", metalness: 1, roughness: 0.55, side: THREE.DoubleSide });
  const parts = new Parts();
  parts.add(lathe([[0.14, 0.06], [0.8, 0.06], [0.98, 0.12], [1.08, 0.3], [1.12, 0.58], [1.24, 0.62], [1.3, 0.66], [1.28, 0.7]], 64), steel);
  parts.add(new THREE.TorusGeometry(0.15, 0.03, 8, 32), steel, { p: [0, 0.07, 0], r: [Math.PI / 2, 0, 0] });
  parts.add(new THREE.CircleGeometry(0.14, 32), std("#15181d", 0.6), { p: [0, 0.065, 0], r: [-Math.PI / 2, 0, 0] });
  for (let k = 0; k < 6; k++) parts.add(new THREE.BoxGeometry(0.22, 0.01, 0.025), steel, { p: [0, 0.07, -0.1 + k * 0.04] });
  parts.add(lathe([[0, 0.66], [0.26, 0.66], [0.24, 0.74], [0.15, 0.8], [0.13, 0.84]], 40), STEEL, { p: [-1.15, 0, -0.35] });
  parts.add(tube(curve([[-1.15, 0.8, -0.35], [-1.15, 1.8, -0.35], [-1.05, 2.3, -0.35], [-0.6, 2.5, -0.35], [-0.15, 2.32, -0.35], [0, 2.05, -0.35]]), 0.1, { segments: 80, radial: 16 }), STEEL);
  parts.add(new THREE.CylinderGeometry(0.12, 0.11, 0.16, 24), STEEL, { p: [0, 1.95, -0.35] });
  parts.add(new THREE.CircleGeometry(0.1, 24), std("#3a4048", 0.5), { p: [0, 1.869, -0.35], r: [Math.PI / 2, 0, 0] });
  parts.add(new THREE.SphereGeometry(0.13, 20, 14), STEEL, { p: [-1.15, 1.25, -0.35] });
  parts.add(tube(curve([[-1.15, 1.3, -0.35], [-1.3, 1.5, -0.3], [-1.55, 1.58, -0.3]]), 0.04, { segments: 20, radial: 8 }), STEEL);
  parts.add(new THREE.SphereGeometry(0.06, 12, 8), std("#3d8cff", 0.4), { p: [-1.57, 1.58, -0.3] });
  parts.build(group);
  const waterU = { uTime: { value: 0 } };
  const water = mesh(group, new THREE.CylinderGeometry(0.075, 0.1, 1.82, 20, 8, true), new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: waterU, vertexShader: "varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }", fragmentShader: WATER }), 0, 0.96, -0.35);
  water.renderOrder = 3;
  const splash = mesh(group, new THREE.TorusGeometry(0.2, 0.025, 8, 32), glow("#d8f2ff", 0.5), 0, 0.1, -0.35);
  splash.rotation.x = Math.PI / 2;
  // Two hands from either side, palms facing, fingers interlaced under the stream.
  const set = SPREAD();
  const right = skinHand(set);
  right.rotation.set(0, 0, Math.PI / 2);
  const left = skinHand(set, true);
  left.rotation.set(Math.PI, 0, -Math.PI / 2);
  for (const h of [right, left]) {
    h.scale.setScalar(0.6);
    group.add(h);
  }
  const suds = Array.from({ length: 8 }, () => mesh(group, new THREE.SphereGeometry(0.1, 16, 10), BUBBLE));
  return {
    group,
    tick: (t) => {
      waterU.uTime.value = t;
      const u = (t * 2.5) % 1;
      splash.scale.setScalar(0.6 + u * 1.4);
      splash.material.opacity = 0.5 * (1 - u);
      const rub = Math.sin(t * 11);
      right.position.set(1.12 + rub * 0.07, 1.05 + Math.sin(t * 22) * 0.015, 0.12);
      left.position.set(-1.12 - rub * 0.07, 1.075 - Math.sin(t * 22) * 0.015, -0.12);
      suds.forEach((b, k) => {
        const v = (t * 0.7 + k / 8) % 1;
        b.position.set(Math.sin(k * 2.1) * 0.55, 0.95 + v * 1.0, 0.25);
        b.scale.setScalar((0.5 + v) * (v < 0.9 ? 1 : 0.001));
      });
    },
  };
}

export const PROPS = { goggles, gloves, hair, books, steps, listen, food, shoe, hand: raisedHand, mouth, fumes, bottle, tongs, spill, cracked, sponge, sink };
