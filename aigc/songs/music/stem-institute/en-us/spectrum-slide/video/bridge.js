import * as THREE from "three";
import { StarStreaks, makeRibbon } from "@gizclaw/mvg-core/fx.js";
import { BANDS, SECTIONS } from "./constants.js";
import { ruler } from "./hud.js";
import { RAINBOW, clamp, easeInCubic, easeOutBack, easeOutCubic, lerp, smooth } from "@gizclaw/mvg-core/timing.js";

export class BridgeScene {
  constructor(ctx) {
    this.ctx = ctx;
    const { timing } = ctx;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#020107");
    this.camera = new THREE.PerspectiveCamera(45, 9 / 16, 0.1, 200);
    const c = timing.cues;
    this.t = {
      see: c[34].start,
      rainbow: c[35].start,
      air: c[36].start,
      vacuum: c[37].start,
      riser: c[37].end,
    };
    const beatsAfter = (t0, n) => {
      const i = timing.beatIndexAt(t0) + 1;
      return Array.from({ length: n }, (_, k) => timing.beatTime(i + k));
    };
    this.no1 = beatsAfter(c[34].end - 1.0, 3);
    this.no2 = beatsAfter(c[36].end - 1.4, 3);

    this.stars = new StarStreaks({ count: 3000, radius: [2, 30], depth: 150 });
    this.scene.add(this.stars.object);
    this.buildEye();
    this.buildPrism();
    this.buildBubble();
    this.buildEmWave();
  }

  buildEye() {
    this.eye = new THREE.Group();
    this.eye.position.set(0, 0.6, 0);
    const n = 2600;
    const pos = new Float32Array(n * 2 * 3);
    const col = new Float32Array(n * 2 * 3);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r0 = 0.42 + Math.random() * 0.15;
      const r1 = 0.95 + Math.random() * 0.25;
      pos.set([Math.cos(a) * r0, Math.sin(a) * r0, 0, Math.cos(a) * r1, Math.sin(a) * r1, 0], i * 6);
      c.setHSL(a / (Math.PI * 2), 1, 0.55);
      col.set([c.r, c.g, c.b, c.r * 0.3, c.g * 0.3, c.b * 0.3], i * 6);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    this.iris = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending }));
    this.eye.add(this.iris);
    this.pupil = new THREE.Mesh(new THREE.CircleGeometry(0.42, 64), new THREE.MeshBasicMaterial({ color: "#000000" }));
    this.pupil.position.z = 0.01;
    this.eye.add(this.pupil);
    const lid = (sign) => {
      const uniforms = { uOpen: { value: 1 } };
      const r = makeRibbon({
        segments: 200,
        width: 0.03,
        color: "#ffffff",
        uniforms,
        path: `float x = (u - 0.5) * 3.6; float y = ${sign.toFixed(1)} * uOpen * 1.25 * (1.0 - pow(x / 1.8, 2.0)); return vec3(x, y, 0.02);`,
      });
      this.eye.add(r);
      return r;
    };
    this.lids = [lid(1), lid(-1)];
    this.scene.add(this.eye);
  }

  buildPrism() {
    this.prism = new THREE.Group();
    this.prism.position.set(0, 0.5, 0);
    const tri = makeRibbon({
      segments: 300,
      width: 0.025,
      color: "#ffffff",
      path: `float s = u * 3.0; float i = floor(s); float f = fract(s);
        vec2 A = vec2(0.0, 1.0), B = vec2(-0.87, -0.5), C = vec2(0.87, -0.5);
        vec2 p = i < 1.0 ? mix(A, B, f) : i < 2.0 ? mix(B, C, f) : mix(C, A, f);
        return vec3(p, 0.0);`,
    });
    this.prism.add(tri);
    this.beam = makeRibbon({ segments: 60, width: 0.05, color: "#ffffff", path: `return mix(vec3(-3.2, 2.6, 0.0), vec3(-0.43, 0.25, 0.0), u);` });
    this.prism.add(this.beam);
    this.fan = RAINBOW.map((color, i) => {
      const ang = -0.35 - i * 0.12;
      const r = makeRibbon({
        segments: 60,
        width: 0.045,
        color,
        path: `vec3 a = vec3(0.45, 0.15, 0.0); return a + vec3(cos(${ang.toFixed(3)}), sin(${ang.toFixed(3)}), 0.0) * u * 4.5;`,
      });
      this.prism.add(r);
      return r;
    });
    this.invisible = [0, 1, 2, 4, 5, 6].map((bi, j) => {
      const ang = j < 3 ? -0.0 - j * 0.11 : -1.25 - (j - 3) * 0.11;
      const r = makeRibbon({
        segments: 60,
        width: 0.02,
        color: BANDS[bi].color,
        path: `vec3 a = vec3(0.45, 0.15, 0.0); return a + vec3(cos(${ang.toFixed(3)}), sin(${ang.toFixed(3)}), 0.0) * u * 4.5;`,
      });
      this.prism.add(r);
      return r;
    });
    this.scene.add(this.prism);
  }

  buildBubble() {
    this.bubbleU = { uPop: { value: 0 }, uTime: { value: 0 } };
    this.bubble = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.5, 5),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: this.bubbleU,
        vertexShader: /* glsl */ `
          uniform float uPop, uTime; varying vec3 vN; varying vec3 vV; varying float vR;
          float h(vec3 p){ return fract(sin(dot(floor(p * 6.0), vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
          void main(){
            vec3 p = position * (1.0 + 0.03 * sin(position.y * 6.0 + uTime * 3.0));
            vR = h(position);
            p += normal * uPop * (1.0 + vR * 3.0);
            vN = normalize(normalMatrix * normal);
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            vV = normalize(-mv.xyz);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `
          uniform float uPop; varying vec3 vN; varying vec3 vV; varying float vR;
          vec3 hsv(float h){ return clamp(abs(mod(h*6.0+vec3(0.0,4.0,2.0),6.0)-3.0)-1.0,0.0,1.0); }
          void main(){
            float f = pow(1.0 - abs(dot(vN, vV)), 2.5);
            vec3 c = mix(vec3(0.5, 0.8, 1.0), hsv(f * 0.8 + vN.y * 0.2), 0.6) * f * 1.2;
            float a = 1.0 - smoothstep(0.0, 0.8, uPop);
            if (uPop > 0.0 && vR < uPop * 1.2) discard;
            gl_FragColor = vec4(c * a, 1.0);
          }`,
      }),
    );
    this.bubble.position.y = 0.6;
    this.scene.add(this.bubble);
  }

  buildEmWave() {
    this.em = new THREE.Group();
    const mk = (color, plane) => {
      const uniforms = { uK: { value: 2.5 }, uPh: { value: 0 }, uAmp: { value: 0.7 } };
      const r = makeRibbon({
        segments: 600,
        width: 0.035,
        color,
        uniforms,
        path: `float x = (u - 0.5) * 12.0; float s = uAmp * sin(uK * x - uPh); return ${plane === "E" ? "vec3(x, s, 0.0)" : "vec3(x, 0.0, s)"};`,
      });
      this.em.add(r);
      return r;
    };
    this.eWave = mk("#ff3d7f", "E");
    this.bWave = mk("#3de8ff", "B");
    const axis = makeRibbon({ segments: 2, width: 0.01, color: "#ffffff", path: `return vec3((u - 0.5) * 12.0, 0.0, 0.0);` });
    axis.material.uniforms.uOpacity.value = 0.4;
    this.em.add(axis);
    const n = 80;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 4 * 3), 3));
    const col = new Float32Array(n * 4 * 3);
    const e = new THREE.Color("#ff3d7f");
    const b = new THREE.Color("#3de8ff");
    for (let i = 0; i < n; i++) col.set([e.r, e.g, e.b, e.r, e.g, e.b, b.r, b.g, b.b, b.r, b.g, b.b], i * 12);
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    this.vectors = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending }));
    this.em.add(this.vectors);
    this.em.position.set(0, 0.5, 0);
    this.scene.add(this.em);
  }

  update(t) {
    const { timing, hud } = this.ctx;
    const T = this.t;
    const kick = timing.pulse(t, 0.13);
    const k0 = t - SECTIONS.bridge;
    const eyeOn = t < T.rainbow;
    const prismOn = t >= T.rainbow && t < T.air;
    const bubbleOn = t >= T.air - 0.1 && t < T.vacuum + 0.6;
    const emOn = t >= T.vacuum - 0.4;

    this.stars.material.uniforms.uCamZ.value = -t * 2;
    this.stars.material.uniforms.uStretch.value = 0.25 + smooth(T.riser, SECTIONS.outro, t) * 8;
    this.stars.material.uniforms.uRainbow.value = smooth(T.riser, SECTIONS.outro, t);
    this.stars.object.position.z = 0;

    // Eye: opens, looks around, blinks on every "No".
    this.eye.visible = eyeOn;
    if (eyeOn) {
      let open = smooth(SECTIONS.bridge, SECTIONS.bridge + 0.5, t);
      for (const nt of this.no1) if (t >= nt - 0.06 && t < nt + 0.18) open *= Math.abs((t - nt) / 0.12) > 1 ? 1 : Math.abs(t - nt) / 0.12;
      this.lids.forEach((l) => (l.material.uniforms.uOpen.value = 0.08 + 0.92 * open));
      this.iris.scale.setScalar(open * (1 + kick * 0.05));
      this.pupil.scale.setScalar(open * (0.9 + 0.3 * Math.sin(t * 3)));
      this.iris.position.x = this.pupil.position.x = Math.sin(t * 2.2) * 0.35 * open;
      this.iris.rotation.z = t * 0.3;
      this.eye.scale.setScalar(1.15);
    }

    this.prism.visible = prismOn;
    if (prismOn) {
      const k = t - T.rainbow;
      this.beam.material.uniforms.uReveal.value = easeOutCubic(k / 0.5);
      this.fan.forEach((f, i) => {
        f.material.uniforms.uReveal.value = easeOutCubic((k - 0.5 - i * 0.05) / 0.6);
        f.material.uniforms.uGlow.value = 1 + kick * 0.8;
      });
      this.invisible.forEach((f, i) => {
        f.material.uniforms.uReveal.value = easeOutCubic((k - 1.4 - i * 0.05) / 0.6);
        f.material.uniforms.uOpacity.value = 0.18 + 0.08 * Math.sin(t * 8 + i);
      });
      this.prism.rotation.z = Math.sin(k * 0.6) * 0.05;
      this.prism.scale.setScalar(1.05);
    }

    this.bubble.visible = bubbleOn;
    if (bubbleOn) {
      let pop = 0;
      const lastNo = this.no2[2];
      if (t >= lastNo) pop = (t - lastNo) / 0.6;
      this.bubbleU.uPop.value = clamp(pop, 0, 1);
      this.bubbleU.uTime.value = t;
      let squash = 1;
      for (const nt of this.no2) if (t >= nt && t < nt + 0.25) squash = 1 + 0.15 * Math.exp(-(t - nt) / 0.08);
      this.bubble.scale.set(squash, 2 - squash, squash);
      this.bubble.rotation.y = t * 0.4;
    }

    this.em.visible = emOn;
    if (emOn) {
      const riser = smooth(T.riser, SECTIONS.outro, t);
      const kk = lerp(1.6, 7, easeInCubic(riser));
      const ph = timing.beatFloat(t) * Math.PI * (1 + riser * 3);
      const bandIdx = Math.min(6, Math.floor(riser * 7));
      for (const w of [this.eWave, this.bWave]) {
        const u = w.material.uniforms;
        u.uK.value = kk;
        u.uPh.value = ph;
        u.uAmp.value = 0.75 * (1 + kick * 0.2);
        u.uReveal.value = easeOutCubic((t - T.vacuum + 0.4) / 1.2);
      }
      if (riser > 0) {
        this.eWave.material.uniforms.uColor.value.set(BANDS[bandIdx].color === "#ffffff" ? "#fff6a0" : BANDS[bandIdx].color);
      } else this.eWave.material.uniforms.uColor.value.set("#ff3d7f");
      const p = this.vectors.geometry.attributes.position;
      const n = p.count / 4;
      const reveal = this.eWave.material.uniforms.uReveal.value;
      for (let i = 0; i < n; i++) {
        const u = i / (n - 1);
        const x = (u - 0.5) * 12;
        const s = u <= reveal ? 0.75 * Math.sin(kk * x - ph) : 0;
        p.setXYZ(i * 4, x, 0, 0);
        p.setXYZ(i * 4 + 1, x, s, 0);
        p.setXYZ(i * 4 + 2, x, 0, 0);
        p.setXYZ(i * 4 + 3, x, 0, s);
      }
      p.needsUpdate = true;
      this.em.rotation.set(0.35, -0.6 + Math.sin(t * 0.4) * 0.3 + riser * 1.2, 0.0);
    }

    const riser = smooth(T.riser, SECTIONS.outro, t);
    const shake = riser * riser * 0.12;
    this.camera.position.set(Math.sin(t * 51) * shake, 0.4 + Math.cos(t * 43) * shake, lerp(8, 6.5, smooth(T.vacuum, SECTIONS.outro, t)));
    this.camera.lookAt(0, 0.4, 0);
    this.camera.rotation.z += riser * Math.sin(t * 2) * 0.1;
    this.camera.fov = 45 - kick * 3 * riser;
    this.camera.updateProjectionMatrix();

    const post = { bloom: [0.9, 0.5, 0.12], ca: 0.2 + riser * 1.4, vignette: 0.6 };
    post.flash = Math.exp(-k0 / 0.12) * 0.5;
    for (const nt of [...this.no1, ...this.no2]) if (t >= nt) post.flash = Math.max(post.flash, Math.exp(-(t - nt) / 0.08) * 0.25);
    for (const st of [T.rainbow, T.air, T.vacuum]) if (t >= st && t < st + 0.2) post.flash = Math.max(post.flash, (1 - (t - st) / 0.2) * 0.3);
    if (riser > 0) {
      // Eighth-note strobe during the riser.
      const half = (timing.beatFloat(t) * 2) % 1;
      post.flash = Math.max(post.flash, Math.exp(-half * timing.period * 2 / 0.05) * 0.25 * riser);
      post.zoom = 1 + riser * 0.08;
      post.glitch = riser * 0.25;
    }
    if (t > SECTIONS.outro - 0.15) post.flash = Math.max(post.flash, 1);
    if (this.bubble.visible && this.bubbleU.uPop.value > 0 && this.bubbleU.uPop.value < 0.4) post.shock = [0.5, 0.6, this.bubbleU.uPop.value * 1.4, 1.2];

    // HUD
    ruler(hud, prismOn ? 3 : -1, prismOn ? 1 : riser, { highlightAll: prismOn ? 0 : riser });
    this.no1.forEach((nt, i) => hud.stamp("NO", t, nt, { x: 300 + i * 230, y: 560 + (i % 2) * 90, size: 150, angle: -0.2 + i * 0.18, life: T.rainbow - nt }));
    this.no2.forEach((nt, i) => hud.stamp("NO", t, nt, { x: 300 + i * 230, y: 560 + (i % 2) * 90, size: 150, angle: -0.2 + i * 0.18, color: "#3de8ff", life: Math.max(0.3, T.vacuum - nt) }));
    if (prismOn) {
      const k = t - T.rainbow;
      hud.slam("ONLY VISIBLE", t, T.rainbow + 0.5, T.air - 0.2, { size: 130, y: 560, color: "#fff6a0", sub: "makes the rainbow" });
      const a = smooth(1.4, 1.8, k) * (1 - smooth(T.air - T.rainbow - 0.3, T.air - T.rainbow, k));
      hud.text("IR · radio · micro — invisible", 540, 1120, { size: 28, weight: 600, family: '"Menlo"', alpha: a * 0.85, color: "#ff8c42" });
      hud.text("UV · X-ray · gamma — invisible", 540, 1165, { size: 28, weight: 600, family: '"Menlo"', alpha: a * 0.85, color: "#9b5cff" });
    }
    if (bubbleOn && t < this.no2[0]) hud.text("AIR?", 540, 560, { size: 150, weight: 800, family: '"Avenir Next Condensed"', alpha: smooth(T.air, T.air + 0.3, t), glow: 30, color: "#bfeaff" });
    if (emOn) {
      const a = smooth(T.vacuum, T.vacuum + 0.4, t) * (1 - riser);
      hud.text("E field", 220, 520, { size: 40, weight: 800, family: '"Avenir Next Condensed"', alpha: a, color: "#ff3d7f", glow: 16 });
      hud.text("B field", 860, 520, { size: 40, weight: 800, family: '"Avenir Next Condensed"', alpha: a, color: "#3de8ff", glow: 16 });
      hud.text("VACUUM · NO AIR NEEDED", 540, 1120, { size: 32, weight: 600, family: '"Menlo"', alpha: a * 0.9 });
      if (riser > 0) hud.slam("FREQUENCY ↑", t, T.riser + 0.2, SECTIONS.outro - 0.1, { size: 140, y: 600, color: "#ffffff" });
    }
    return post;
  }
}
