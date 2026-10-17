import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { clamp, easeInOut, easeOutCubic, hash, lerp, smooth } from "@gizclaw/mvg-core/timing.js";
import { Penguin } from "./penguin.js";
import { makeBeams, NOISE, RAMP } from "./world.js";
import { COLORS, SECTIONS } from "./constants.js";

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const FISH = 70;
const CEILING = 6;
const SCHOOL = V(0, 0.6, -1.6);

/** Time-keyed Catmull-Rom path: keys are [t, x, y, z]. */
function path(keys, t) {
  let i = 0;
  while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
  const k1 = keys[i];
  const k2 = keys[i + 1];
  const k0 = keys[Math.max(0, i - 1)];
  const k3 = keys[Math.min(keys.length - 1, i + 2)];
  const u = clamp((t - k1[0]) / (k2[0] - k1[0]), 0, 1);
  const u2 = u * u;
  const u3 = u2 * u;
  const c = (a) => 0.5 * (2 * k1[a] + (-k0[a] + k2[a]) * u + (2 * k0[a] - 5 * k1[a] + 4 * k2[a] - k3[a]) * u2 + (-k0[a] + 3 * k1[a] - 3 * k2[a] + k3[a]) * u3);
  return V(c(1), c(2), c(3));
}

const DIVE = [
  [50.6, 0.6, 7.6, 3.2], [50.95, 0.3, 4.6, 2.2], [51.35, -1.6, 2.3, 0.8], [51.8, -4.6, 1.2, -0.2],
  [52.3, -2.6, 1.0, 0.5], [52.95, 0.6, 1.25, 0.6], [53.55, 4.0, 1.0, -0.2], [54.05, 5.0, 0.6, -2.0],
  [54.65, 2.6, 0.2, -3.9], [55.25, -1.0, 0.55, -3.8], [55.85, -3.3, 1.0, -1.5], [56.4, -1.9, 0.85, 0.3],
  [56.85, 0.0, 0.6, -1.2], [57.1, 0.6, 2.6, -0.4], [57.4, 0.8, 7.2, 0.6],
];
const GLIDE = [0, 1, 2].map((j) => {
  const x = (j - 1) * 1.6;
  return [[SECTIONS.glide - 0.5, x - 1.5, -2.6 - j * 0.4, 1.0 - j], [SECTIONS.glide + 1.2, x - 0.4, -0.6 - j * 0.3, 0.3 - j], [SECTIONS.glide + 2.4, x + 0.6, 1.2 - j * 0.2, -0.4 - j], [SECTIONS.freeze + 0.6, x + 1.2, 3.4, -1.2 - j]];
});

function ringTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(32, 32, 10, 32, 32, 31);
  grad.addColorStop(0, "rgba(255,255,255,0.05)");
  grad.addColorStop(0.75, "rgba(255,255,255,0.25)");
  grad.addColorStop(0.92, "rgba(255,255,255,1)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = "rgba(255,255,255,0.9)";
  g.beginPath();
  g.arc(24, 22, 5, 0, Math.PI * 2);
  g.fill();
  return new THREE.CanvasTexture(c);
}

export class SeaScene {
  constructor(ctx) {
    this.ctx = ctx;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#2a8fd0");
    this.scene.fog = new THREE.FogExp2("#3a9ad6", 0.045);
    this.camera = new THREE.PerspectiveCamera(48, 9 / 16, 0.05, 400);

    this.water = this.makeWater();
    this.ceiling = this.makeCeiling();
    this.scene.add(this.water.mesh, this.ceiling.mesh);
    this.shafts = makeBeams(6);
    this.shafts.forEach((b, j) => {
      b.position.set((j - 2.5) * 2.4, CEILING, -2 + Math.sin(j * 2.1) * 2);
      b.rotation.set(0.12 * Math.sin(j), 0, 0.25 * Math.cos(j * 1.7));
      b.scale.set(1.4, 1, 1.4);
      b.material.uniforms.uColor.value.set("#9ff0ff");
      this.scene.add(b);
    });

    this.scene.add(new THREE.HemisphereLight("#e8fbff", "#7cc0e8", 1.5));
    this.sun = new THREE.DirectionalLight("#fffaf0", 1.5);
    this.sun.position.set(1, 8, 2);
    this.scene.add(this.sun);
    const bounce = new THREE.DirectionalLight("#bfeaff", 0.6);
    bounce.position.set(0.5, -6, 2);
    this.scene.add(bounce);

    this.penguins = [0, 1, 2].map((j) => {
      const p = new Penguin({ bow: j === 0, scale: j === 0 ? 1.06 : 0.9 });
      this.scene.add(p.group);
      return p;
    });

    const body = new THREE.SphereGeometry(1, 12, 8);
    body.scale(0.055, 0.075, 0.22);
    const tail = new THREE.ConeGeometry(0.07, 0.12, 4);
    tail.rotateX(Math.PI / 2);
    tail.translate(0, 0, -0.24);
    tail.scale(0.4, 1, 1);
    this.fish = new THREE.InstancedMesh(mergeGeometries([body, tail]), new THREE.MeshToonMaterial({ color: "#ffffff", gradientMap: RAMP }), FISH);
    const fishColors = ["#ffa23a", "#ffd23f", "#ff7aa8", "#7fe0ff"].map((c) => new THREE.Color(c));
    for (let k = 0; k < FISH; k++) this.fish.setColorAt(k, fishColors[k % fishColors.length]);
    this.fish.frustumCulled = false;
    this.scene.add(this.fish);
    this.dummy = new THREE.Object3D();

    const max = 1400;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(max * 3), 3));
    this.bubbles = new THREE.Points(geo, new THREE.PointsMaterial({ map: ringTexture(), size: 0.14, transparent: true, depthWrite: false, color: "#ffffff" }));
    this.bubbles.frustumCulled = false;
    this.bubbleMax = max;
    this.scene.add(this.bubbles);

    const timing = ctx.timing;
    const cues = timing.cues;
    const w = (ci, k) => cues[ci].words[k].start;
    this.ev = { swim: cues[13].start, wings: w(13, 1), speed: w(13, 5), steer: cues[14].start, where: w(14, 2), feed: w(14, 4), glide: cues[25].start, bubbles: w(25, 3), rise: w(25, 4) };
  }

  makeWater() {
    const uniforms = { uTime: { value: 0 }, uCalm: { value: 0 } };
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(200, 48, 24),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms,
        vertexShader: /* glsl */ `varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          uniform float uTime, uCalm; varying vec3 vD;
          ${NOISE}
          void main() {
            vec3 d = normalize(vD);
            vec3 col = mix(vec3(0.12, 0.36, 0.7), vec3(0.22, 0.62, 0.86), smoothstep(-0.7, 0.35, d.y));
            col = mix(col, vec3(0.55, 0.88, 0.98), smoothstep(0.35, 1.0, d.y));
            float az = atan(d.x, d.z);
            float rays = vnoise(vec2(az * 9.0, uTime * 0.25)) * vnoise(vec2(az * 23.0 + 3.0, uTime * 0.4));
            col = mix(col, vec3(0.85, 0.98, 1.0), step(0.55, rays) * smoothstep(-0.1, 0.8, d.y) * 0.35);
            gl_FragColor = vec4(col, 1.0);
          }`,
      }),
    );
    mesh.frustumCulled = false;
    return { mesh, uniforms };
  }

  makeCeiling() {
    const uniforms = { uTime: { value: 0 }, uHole: { value: new THREE.Vector2(0.6, 1.5) } };
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(160, 160),
      new THREE.ShaderMaterial({
        side: THREE.DoubleSide,
        uniforms,
        vertexShader: /* glsl */ `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
        fragmentShader: /* glsl */ `
          uniform float uTime; uniform vec2 uHole; varying vec3 vW;
          ${NOISE}
          void main() {
            vec2 p = vW.xz;
            vec3 v = voronoi(p * 0.45);
            float crack = smoothstep(0.05, 0.02, v.z);
            float caus = step(0.55, vnoise(p * 1.4 + uTime * 0.6) * 0.6 + vnoise(p * 2.3 - uTime * 0.4) * 0.6);
            vec3 col = mix(vec3(0.62, 0.86, 0.96), vec3(0.78, 0.94, 1.0), h21(v.xy));
            col = mix(col, vec3(0.92, 1.0, 1.0), caus * 0.5);
            col = mix(col, vec3(0.3, 0.55, 0.82), crack * 0.8);
            float hole = smoothstep(2.0, 1.85, length(p - uHole));
            col = mix(col, vec3(0.97, 1.0, 1.0), hole);
            float far = smoothstep(12.0, 50.0, length(p - cameraPosition.xz));
            col = mix(col, vec3(0.3, 0.68, 0.9), far);
            gl_FragColor = vec4(col, 1.0);
          }`,
      }),
    );
    mesh.rotation.x = Math.PI / 2;
    mesh.position.y = CEILING;
    return { mesh, uniforms };
  }

  swimPose(pg, P, H, t, j, { power = 1, bank = 0, scale = 1.06 } = {}) {
    const h = H.clone().normalize();
    const phi = Math.asin(clamp(h.y, -1, 1));
    const yaw = Math.atan2(h.x, h.z);
    const pitch = Math.PI / 2 - phi;
    const base = P.clone().sub(h.clone().multiplyScalar(0.55 * scale));
    const f = Math.sin(t * (9 + power * 6) + j);
    pg.pose({
      x: base.x, y: base.y, z: base.z, yaw, pitch, bank,
      flapL: 0.5 + 0.7 * power * f, flapR: 0.5 + 0.7 * power * f, fwdL: -0.5, fwdR: -0.5,
      nod: -0.25, blink: bump(t % 3.3, 0, 0.15), squash: -0.08 * power, bow: 1,
    });
  }

  update(t, section) {
    const { timing, hud } = this.ctx;
    const kick = timing.pulse(t, 0.14);
    const glide = section === "glide";
    const e = this.ev;
    this.water.uniforms.uTime.value = t;
    this.ceiling.uniforms.uTime.value = t;
    this.shafts.forEach((b, j) => (b.material.uniforms.uOpacity.value = (0.25 + 0.12 * Math.sin(t * 0.8 + j * 1.9)) * (glide ? 0.8 : 1)));
    this.scene.fog.density = glide ? 0.04 : 0.045;

    // Penguins.
    const trails = [];
    if (!glide) {
      const P = path(DIVE, t);
      const H = path(DIVE, t + 0.05).sub(path(DIVE, t - 0.05));
      const turn = path(DIVE, t + 0.15).sub(P).normalize().cross(P.clone().sub(path(DIVE, t - 0.15)).normalize()).y;
      const power = t < e.swim ? 0.6 : t < e.steer ? 1.3 : 0.9;
      this.swimPose(this.penguins[0], P, H, t, 0, { power, bank: clamp(-turn * 3, -0.55, 0.55) });
      this.penguins[0].group.visible = true;
      this.penguins[1].group.visible = this.penguins[2].group.visible = false;
      this.lead = P;
      this.heading = H.clone().normalize();
      trails.push((tt) => path(DIVE, tt));
    } else {
      this.penguins.forEach((pg, j) => {
        pg.group.visible = true;
        const P = path(GLIDE[j], t);
        const H = path(GLIDE[j], t + 0.05).sub(path(GLIDE[j], t - 0.05));
        this.swimPose(pg, P, H, t, j, { power: 0.45, bank: Math.sin(t * 0.8 + j) * 0.3, scale: j ? 0.9 : 1.06 });
        trails.push((tt) => path(GLIDE[j], tt));
      });
      this.lead = path(GLIDE[0], t);
      this.heading = V(0, 1, 0);
    }

    // Fish school, scattering when the penguin snaps at it.
    const scatter = glide ? 0 : easeOutCubic((t - e.feed - 0.05) / 0.9) * (t > e.feed ? 1 : 0);
    const C = SCHOOL.clone().add(V(Math.sin(t * 0.4) * 1.2, Math.sin(t * 0.7) * 0.3, Math.cos(t * 0.3) * 0.6));
    for (let k = 0; k < FISH; k++) {
      const h1 = hash(k * 1.7);
      const h2 = hash(k * 3.1);
      const h3 = hash(k * 5.3);
      const dir = k % 5 === 0 ? -1 : 1;
      const r = 0.6 + h1 * 1.1 + scatter * (2.5 + h2 * 3);
      const a = t * (1.1 + h2 * 0.6) * dir * (1 + scatter * 1.5) + h3 * Math.PI * 2;
      const yo = (h2 - 0.5) * 1.3 + Math.sin(a * 2 + k) * 0.12 + scatter * (h1 - 0.4) * 2;
      const pos = V(C.x + Math.cos(a) * r, C.y + yo, C.z + Math.sin(a) * r * 0.7);
      const tan = V(-Math.sin(a) * dir, 0, Math.cos(a) * 0.7 * dir).add(V(Math.cos(a), 0, Math.sin(a)).multiplyScalar(scatter * 2));
      this.dummy.position.copy(pos);
      this.dummy.lookAt(pos.clone().add(tan));
      this.dummy.rotateY(Math.sin(t * 14 + k) * 0.25);
      const vis = glide ? 0.0001 : smooth(e.steer - 1.5, e.steer - 0.3, t) * (1 - smooth(e.feed + 1.0, e.feed + 1.6, t)) * (0.85 + h3 * 0.3);
      this.dummy.scale.setScalar(Math.max(0.0001, vis));
      this.dummy.updateMatrix();
      this.fish.setMatrixAt(k, this.dummy.matrix);
    }
    this.fish.instanceMatrix.needsUpdate = true;

    // Bubbles: ambient risers, penguin trails and the entry burst.
    const pos = this.bubbles.geometry.attributes.position;
    let n = 0;
    const ambient = glide ? 700 : 380;
    for (let k = 0; k < ambient; k++) {
      const h1 = hash(k * 0.91 + 3);
      const h2 = hash(k * 1.37 + 7);
      const h3 = hash(k * 2.11 + 1);
      const speed = 0.5 + h3 * 0.9 + (glide ? 0.4 : 0);
      const y = ((h2 * 14 + t * speed) % 14) - 6;
      pos.setXYZ(n++, (h1 - 0.5) * 16 + Math.sin(t * 2 + k) * 0.08, y, (h3 - 0.5) * 12 - 2);
    }
    for (const tr of trails) {
      for (let k = 0; k < 90 && n < this.bubbleMax; k++) {
        const age = k * 0.035;
        const te = t - age;
        const p = tr(te);
        const s = hash(k * 4.3 + Math.floor(te * 30));
        pos.setXYZ(n++, p.x + (s - 0.5) * 0.3 + Math.sin(age * 9 + k) * 0.06 * age, p.y + age * 1.1, p.z + (hash(k * 7.9) - 0.5) * 0.3);
      }
    }
    if (!glide) {
      const age = t - SECTIONS.dive + 0.1;
      for (let k = 0; k < 220 && n < this.bubbleMax && age < 2.5; k++) {
        const th = hash(k * 1.1) * Math.PI * 2;
        const r = (0.3 + hash(k * 2.3) * 1.6) * (1 - Math.exp(-age * 3));
        pos.setXYZ(n++, 0.4 + Math.cos(th) * r, CEILING - 1.2 - hash(k * 3.7) * 2.5 * (1 - Math.exp(-age * 2)) + age * (0.6 + hash(k) * 1.2), 2.2 + Math.sin(th) * r * 0.6);
      }
    }
    for (let k = n; k < this.bubbleMax; k++) pos.setXYZ(k, 0, -999, 0);
    pos.needsUpdate = true;

    // Camera.
    const cam = this.cameraPose(t, glide);
    this.camera.position.copy(cam.pos);
    this.camera.lookAt(cam.look);
    this.camera.fov = cam.fov ?? 48;
    this.camera.updateProjectionMatrix();

    // HUD and post.
    const post = { bloom: [0.3, 0.4, 0.95], ca: 0.1 + kick * 0.08, vignette: 0.2, grain: 0.008 };
    const Y = 440;
    const flash = (t0, amt, tau = 0.1) => {
      if (t >= t0) post.flash = Math.max(post.flash || 0, amt * Math.exp(-(t - t0) / tau));
    };
    if (!glide) {
      flash(SECTIONS.dive, 0.9, 0.15);
      post.flashColor = "#cff6ff";
      hud.slam("FLIPPER POWER", t, e.wings, e.speed - 0.1, { y: Y, size: 130, color: COLORS.swim, sub: "wings help them swim" });
      hud.slam("SPEED!", t, e.speed, e.steer - 0.1, { y: Y, size: 200, color: "#ffffff" });
      hud.slam("STEERING", t, e.steer, e.feed - 0.15, { y: Y, size: 160, color: COLORS.waddle });
      hud.stamp("FISH SNACK!", t, e.feed, { x: 540, y: Y, size: 120, color: COLORS.hey, angle: -0.1, life: SECTIONS.verse2 - e.feed });
      flash(e.speed, 0.3, 0.12);
      flash(e.feed, 0.35, 0.1);
      const zoom = Math.exp(-Math.max(0, t - e.speed) / 0.4) * (t > e.speed ? 1 : 0);
      post.zoom = 1 + zoom * 0.06;
      post.ca += zoom * 1.2;
      if (t > SECTIONS.verse2 - 0.25) post.flash = Math.max(post.flash || 0, smooth(SECTIONS.verse2 - 0.25, SECTIONS.verse2, t));
    } else {
      flash(SECTIONS.glide, 0.6, 0.15);
      post.flashColor = "#cff6ff";
      hud.slam("BUBBLES RISE", t, e.bubbles, SECTIONS.freeze - 0.25, { y: Y, size: 140, color: COLORS.swim });
      hud.slam("SWIM", t, e.glide + 0.1, e.bubbles - 0.1, { y: Y, size: 190, color: COLORS.ice, sub: "wings work underwater" });
      post.sat = 0.95;
      if (t > SECTIONS.freeze - 0.25) post.flash = Math.max(post.flash || 0, smooth(SECTIONS.freeze - 0.25, SECTIONS.freeze, t) * 0.8);
    }
    post.flash = (post.flash || 0) * 0.4;
    return post;
  }

  cameraPose(t, glide) {
    const e = this.ev;
    if (glide) {
      const k = easeInOut((t - SECTIONS.glide) / 3);
      const L = this.lead;
      return { pos: V(L.x + lerp(3.2, 2.6, k), L.y - lerp(2.0, 1.4, k), L.z + lerp(4.8, 4.2, k)), look: V(L.x * 0.6, L.y + 0.9, L.z - 0.6), fov: 50 };
    }
    const P = this.lead;
    const H = this.heading;
    const side = V(H.z, 0, -H.x).normalize();
    const shots = [
      [SECTIONS.dive, () => ({ pos: V(3.0, -0.4, 6.6), look: V(0.2, 2.6, 1.0) })],
      [e.swim - 0.2, () => ({ pos: P.clone().add(V(0.3, -2.7, 2.7)), look: P.clone().add(V(0.15, 0.3, 0)) })],
      [e.steer - 0.1, () => ({ pos: P.clone().sub(H.clone().multiplyScalar(3.4)).add(V(0, 0.2, 0)).add(side.clone().multiplyScalar(1.9)), look: P.clone().add(H.clone().multiplyScalar(1.4)) })],
      [e.feed - 0.55, () => ({ pos: V(2.6, 1.4, 3.6), look: V(0, 0.7, -1.2) })],
      [e.feed + 0.35, () => ({ pos: V(1.6, -0.6, 3.4), look: V(0.7, 4.0, -0.2) })],
    ];
    let k = 0;
    for (let i = 0; i < shots.length; i++) if (t >= shots[i][0]) k = i;
    const cur = shots[k][1]();
    const blend = 0.45;
    if (k === 0 || t - shots[k][0] >= blend) return cur;
    const prev = shots[k - 1][1]();
    const u = easeInOut((t - shots[k][0]) / blend);
    return { pos: prev.pos.lerp(cur.pos, u), look: prev.look.lerp(cur.look, u) };
  }
}

function bump(t, t0, d) {
  return t > t0 && t < t0 + d ? Math.sin((Math.PI * (t - t0)) / d) : 0;
}
