import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { makeRibbon } from "@gizclaw/mvg-core/fx.js";
import { FONT_COND, FONT_MONO } from "@gizclaw/mvg-core/hud.js";
import { clamp, easeInOut, easeOutCubic, hash, lerp, smooth } from "@gizclaw/mvg-core/timing.js";
import { CHORUS_CUES, DISCO, SECTIONS, TITLE } from "./constants.js";
import { Molecule, SHAPES, bentDirs, makeArc } from "./molecules.js";

const ORDER = ["linear", "bent", "trigonal", "tetra"];

export class DiscoScene {
  constructor(ctx) {
    this.ctx = ctx;
    const { timing, renderer } = ctx;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#05060b");
    this.scene.fog = new THREE.Fog("#05060b", 10, 24);
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.32;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.camera = new THREE.PerspectiveCamera(42, 9 / 16, 0.1, 100);

    this.scene.add(new THREE.HemisphereLight("#9fb6ff", "#120a18", 0.25));
    // Soft key from above casts the molecule's shadow on the stage.
    this.key = new THREE.SpotLight("#fff4e8", 190, 24, 0.42, 0.65, 1.6);
    this.key.position.set(1.5, 8, 3);
    this.key.target.position.set(0, 0, 0);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.radius = 6;
    this.key.shadow.bias = -0.0004;
    this.scene.add(this.key, this.key.target);
    // Coloured spots sweep the stage on the beat.
    this.spots = DISCO.slice(0, 3).map((c) => {
      const s = new THREE.SpotLight(c, 40, 22, 0.32, 0.7, 1.4);
      s.target.position.set(0, -2.6, 0);
      this.scene.add(s, s.target);
      return s;
    });

    this.buildFloor();
    this.buildBall();
    this.molecules = Object.fromEntries(ORDER.map((id) => {
      const m = new Molecule(SHAPES[id]);
      this.scene.add(m.group);
      return [id, m];
    }));
    this.arcs = [0, 1, 2].map((i) => {
      const a = makeArc(DISCO[i + 1]);
      this.scene.add(a);
      return a;
    });
    this.laser = makeRibbon({ segments: 2, width: 0.05, color: "#ff3344", path: `return vec3((u - 0.5) * 9.0, 0.0, 0.0);` });
    this.scene.add(this.laser);
    this.core = new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 24), new THREE.MeshBasicMaterial({ color: "#ffffff" }));
    this.scene.add(this.core);
    this.buildEvents(timing);
  }

  buildFloor() {
    this.floor = new THREE.Mesh(
      new THREE.CircleGeometry(16, 96),
      new THREE.MeshPhysicalMaterial({ color: "#07080d", roughness: 0.22, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.15 }),
    );
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.y = -2.6;
    this.floor.receiveShadow = true;
    this.scene.add(this.floor);
    // Volumetric beams under each coloured spot.
    this.beams = this.spots.map((spot, i) => {
      const m = new THREE.Mesh(
        new THREE.ConeGeometry(1.6, 9, 48, 1, true).translate(0, -4.5, 0),
        new THREE.ShaderMaterial({
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
          uniforms: { uColor: { value: new THREE.Color(DISCO[i]) }, uOpacity: { value: 0.1 } },
          vertexShader: "varying float vY; varying vec3 vN; varying vec3 vV; void main(){ vY = -position.y / 9.0; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }",
          fragmentShader: "uniform vec3 uColor; uniform float uOpacity; varying float vY; varying vec3 vN; varying vec3 vV; void main(){ float edge = pow(abs(dot(vN, vV)), 1.5); gl_FragColor = vec4(uColor * edge * (1.0 - vY) * uOpacity, 1.0); }",
        }),
      );
      this.scene.add(m);
      return m;
    });
    this.color = new THREE.Color();
  }

  buildBall() {
    const n = 700;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos.set([(hash(i * 1.3) - 0.5) * 16, (hash(i * 2.9) - 0.3) * 10, (hash(i * 4.7) - 0.7) * 14], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.dots = new THREE.Points(geo, new THREE.PointsMaterial({ color: "#ffffff", size: 0.05, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.scene.add(this.dots);
  }

  buildEvents(timing) {
    const cue = (i) => timing.cues[i];
    const w = (ci, word, n = 0) => timing.wordTime(ci, word, n) ?? cue(ci).start;
    const P = timing.period;
    this.v1 = { two: cue(2).start, center: w(3, "center"), carbon: w(4, "dioxide"), arc: w(5, "one"), arcEnd: w(5, "degrees"), laser: cue(6).start, linear: w(7, "linear") };
    this.v2 = { water: cue(12).start, hyd: w(12, "bent"), lone: w(13, "lone"), arc: w(14, "about"), arcEnd: w(14, "degrees"), twoH: w(15, "hydrogen"), line: w(16, "line"), angle: w(16, "angle"), bent: w(17, "bent") };
    this.v3 = { boron: cue(22).start, tri: w(22, "trifluoride"), bonds: cue(23).start, arc: cue(24).start, planar: w(25, "trigonal"), methane: cue(26).start, points: w(26, "points"), four: cue(27).start, arc4: cue(28).start, tetra: w(29, "tetrahedral") };
    this.P = P;
    this.choruses = {};
    for (const [name, ci] of Object.entries(CHORUS_CUES)) {
      this.choruses[name] = {
        start: SECTIONS[name],
        end: { chorus1: SECTIONS.verse2, chorus2: SECTIONS.verse3, chorus3: SECTIONS.outro }[name],
        scatter: w(ci, "shape"),
        place: w(ci, "place"),
        which: cue(ci + 1).start,
        groups: w(ci + 1, "electron"),
        picks: [w(ci + 2, "line"), w(ci + 2, "v"), w(ci + 2, "flat"), w(ci + 2, "tetra")],
        dance: cue(ci + 3).start,
        danceEnd: cue(ci + 3).end,
      };
    }
    this.outro = { count: cue(34).start, shapes: w(35, "shapes"), angles: w(35, "angles") };
  }

  /** Beat-snapped dance rotation: a quarter turn per beat, eased. */
  danceRotation(t, k) {
    const { timing } = this.ctx;
    const bi = timing.beatIndexAt(t);
    const since = t - timing.beatTime(bi);
    const e = easeOutCubic(since / 0.22);
    const step = bi + e;
    return [Math.sin(k) * 0.3, (step * Math.PI) / 2 + k, 0];
  }

  update(t, section) {
    const { timing, hud } = this.ctx;
    const kick = timing.pulse(t, 0.13);
    const bf = timing.beatFloat(t);
    const chorus = this.choruses[section];

    // Coloured spots sweep the stage; beams pulse with the kick.
    this.dots.rotation.y = t * 0.03;
    this.dots.material.opacity = 0.18 + kick * 0.15;
    const bi = timing.beatIndexAt(t);
    this.spots.forEach((s, i) => {
      const a = t * (0.5 + i * 0.17) + (i * Math.PI * 2) / 3;
      s.position.set(Math.cos(a) * 4.2, 6.5, Math.sin(a) * 2.5 - 0.5);
      s.target.position.set(Math.cos(a + 0.7) * 1.8, -2.6, Math.sin(a + 0.7) * 1.4);
      s.color.set(DISCO[(i + bi) % DISCO.length]);
      s.intensity = 80 + kick * 120;
      const beam = this.beams[i];
      beam.position.copy(s.position);
      beam.lookAt(s.target.position);
      beam.rotateX(-Math.PI / 2);
      beam.scale.set(1, s.position.distanceTo(s.target.position) / 9, 1);
      beam.material.uniforms.uColor.value.copy(s.color);
      beam.material.uniforms.uOpacity.value = 0.07 + kick * 0.08;
    });

    Object.values(this.molecules).forEach((m) => (m.group.visible = false));
    this.arcs.forEach((a) => (a.visible = false));
    this.laser.material.uniforms.uOpacity.value = 0;
    this.core.visible = false;

    const post = { bloom: [0.45, 0.4, 0.8], ca: 0.12 + kick * 0.3, vignette: 0.5 };
    if (section.startsWith("verse")) this.verse(t, section, post, kick);
    else if (chorus) this.chorus(t, chorus, post, kick, bf);
    else if (section === "outro") this.outroScene(t, post, kick);

    const start = SECTIONS[section];
    if (start !== undefined && t - start < 0.3) post.flash = Math.max(post.flash || 0, Math.exp(-(t - start) / 0.1) * 0.6);
    return post;
  }

  hero(id, t, opts, { x = 0, y = 0.6, scale = 0.92, spin = 0 } = {}) {
    const m = this.molecules[id];
    m.group.visible = true;
    m.group.position.set(x, y, 0);
    m.group.scale.setScalar(scale);
    m.group.rotation.set(0.25, spin, 0);
    m.update(opts);
    return m;
  }

  arc(i, m, a, b, k, label, t, t0) {
    const arc = this.arcs[i];
    arc.visible = k > 0;
    if (!arc.visible) return;
    arc.position.copy(m.group.position);
    arc.rotation.copy(m.group.rotation);
    arc.scale.copy(m.group.scale);
    const mid = arc.userData.set(a, b, 0.62, k);
    if (label && k >= 1) {
      const p = mid.clone().applyEuler(m.group.rotation).multiplyScalar(m.group.scale.x).add(m.group.position).project(this.camera);
      this.ctx.hud.text(label, (p.x * 0.5 + 0.5) * 1080, (-p.y * 0.5 + 0.5) * 1920, { size: 48, weight: 800, family: FONT_COND, color: "#ffffff", glow: 18, alpha: smooth(t0, t0 + 0.2, t) });
    }
  }

  verse(t, section, post, kick) {
    const { hud } = this.ctx;
    const P = this.P;
    const assemble = (t0, n, stride = P) => Array.from({ length: n }, (_, i) => (t - t0 - i * stride) / 0.45);
    const camOrbit = Math.sin(t * 0.35) * 0.5;
    this.camera.position.set(Math.sin(camOrbit) * 8.2, 1.3 + kick * 0.05, Math.cos(camOrbit) * 8.2);
    this.camera.lookAt(0, 0.05, 0);
    const spin = (t * 0.4) % (Math.PI * 2);
    const slam = (text, t0, t1, color, sub) => hud.slam(text, t, t0, t1, { y: 1040, size: 140, color, sub, angle: -0.04 });

    if (section === "verse1") {
      const V = this.v1;
      hud.title(t, SECTIONS.verse1 + 0.1, V.center, TITLE);
      const domains = smooth(V.two - 0.1, V.two + 0.4, t) * (1 - smooth(V.arc, V.arc + 0.5, t));
      const m = this.hero("linear", t, { progress: assemble(V.carbon, 2, P * 0.5), domains, pulse: Math.exp(-Math.abs(t - V.center) / 0.15), glow: t >= V.center && t < V.carbon ? 1 : 0 }, { spin: t < V.laser ? spin * 0.2 : spin });
      m.center.scale.multiplyScalar(easeOutCubic((t - V.two) / 0.3));
      const k = clamp((t - V.arc) / Math.max(0.3, V.arcEnd - V.arc), 0, 1);
      this.arc(0, m, SHAPES.linear.dirs[0], new THREE.Vector3(0, 1, 0), k, null, t, V.arcEnd);
      this.arc(1, m, new THREE.Vector3(0, 1, 0), SHAPES.linear.dirs[1], k, k >= 1 ? "180°" : null, t, V.arcEnd);
      if (t >= V.laser && t < V.linear + 1) {
        this.laser.material.uniforms.uOpacity.value = 0.6 + kick * 0.6;
        this.laser.position.copy(m.group.position);
        this.laser.rotation.set(0.25, m.group.rotation.y, 0);
      }
      slam("CO₂", V.carbon, V.arc - 0.1, "#ff3344", "carbon dioxide");
      slam("LINEAR", V.linear, SECTIONS.chorus1 - 0.2, "#ff3344", "180°");
    }
    if (section === "verse2") {
      const V = this.v2;
      let dirs = null;
      if (t >= V.line - 0.1 && t < V.angle + 0.5) {
        const toLine = easeInOut((t - V.line + 0.1) / 0.3);
        const back = easeInOut((t - V.angle) / 0.4);
        dirs = bentDirs(lerp(104.5, lerp(180, 104.5, back), toLine));
        if (t < V.angle) hud.stamp("✕", t, V.line, { x: 540, y: 560, size: 200, color: "#ff3344", life: V.angle - V.line });
      }
      const m = this.hero("bent", t, { progress: assemble(V.hyd, 2, P * 0.5), dirs, lobe: smooth(V.lone, V.lone + 0.5, t), domains: smooth(V.lone, V.lone + 0.5, t) * (1 - smooth(V.arc, V.arc + 0.5, t)), pulse: Math.exp(-Math.abs(t - V.twoH) / 0.2), glow: t >= V.twoH && t < V.line ? 0.8 : 0 }, { spin: spin * 0.6 });
      m.center.scale.multiplyScalar(easeOutCubic((t - V.water) / 0.3));
      const k = clamp((t - V.arc) / Math.max(0.3, V.arcEnd - V.arc), 0, 1) * (t >= V.line - 0.1 && t < V.angle + 0.4 ? 0 : 1);
      const d = dirs || SHAPES.bent.dirs;
      this.arc(0, m, d[0], d[1], k, "104.5°", t, V.arcEnd);
      slam("H₂O", V.water, V.lone - 0.1, "#3de8ff", "water");
      slam("LONE PAIRS", V.lone, V.arc - 0.1, "#b07cff", "push the bonds down");
      slam("BENT", V.bent, SECTIONS.chorus2 - 0.2, "#3de8ff", "104.5°");
    }
    if (section === "verse3") {
      const V = this.v3;
      if (t < V.methane - 0.1) {
        const pulses = [0, 1, 2].map((i) => Math.exp(-Math.abs(t - V.bonds - i * P) / 0.12));
        const m = this.hero("trigonal", t, { progress: assemble(V.tri, 3, P * 0.5), domains: smooth(V.bonds - 0.1, V.bonds + 0.4, t) * (1 - smooth(V.planar - 0.2, V.planar + 0.3, t)), pulse: Math.max(...pulses), glow: Math.max(...pulses) }, { spin: Math.sin(t * 0.8) * 0.25 });
        const edge = easeInOut((t - V.planar) / 0.6);
        m.group.rotation.set(lerp(0.12, 1.42, edge), Math.sin(t * 0.8) * 0.25 * (1 - edge), t * 0.15);
        m.center.scale.multiplyScalar(easeOutCubic((t - V.boron) / 0.3));
        const dirs = SHAPES.trigonal.dirs;
        [0, 1, 2].forEach((i) => this.arc(i, m, dirs[i], dirs[(i + 1) % 3], clamp((t - V.arc - i * P * 0.5) / 0.4, 0, 1) * (t < V.planar ? 1 : 0), i === 0 ? "120°" : null, t, V.arc + 0.4));
        slam("BF₃", V.boron, V.bonds - 0.1, "#5dff7a", "boron trifluoride");
        slam("TRIGONAL PLANAR", V.planar, V.methane - 0.2, "#5dff7a", "120° · flat");
      } else {
        const pulses = [0, 1, 2, 3].map((i) => Math.exp(-Math.abs(t - V.four - i * P * 0.5) / 0.12));
        const m = this.hero("tetra", t, { progress: assemble(V.points, 4, P * 0.5), domains: smooth(V.four - 0.1, V.four + 0.4, t) * (1 - smooth(V.tetra - 0.2, V.tetra + 0.3, t)), pulse: Math.max(...pulses), glow: Math.max(...pulses) }, { spin: spin * 0.8 });
        m.center.scale.multiplyScalar(easeOutCubic((t - V.methane) / 0.3));
        this.arc(0, m, SHAPES.tetra.dirs[0], SHAPES.tetra.dirs[2], clamp((t - V.arc4) / 0.6, 0, 1), "109.5°", t, V.arc4 + 0.6);
        slam("CH₄", V.methane, V.arc4 - 0.1, "#ffd23f", "methane · 3-D");
        slam("TETRAHEDRAL", V.tetra, SECTIONS.chorus3 - 0.2, "#ffd23f", "109.5°");
      }
    }
    if (t > SECTIONS[{ verse1: "chorus1", verse2: "chorus2", verse3: "chorus3" }[section]] - 0.25) post.flash = Math.max(post.flash || 0, 0.5);
  }

  chorus(t, ch, post, kick, bf) {
    const { hud, timing } = this.ctx;
    const scatter = t >= ch.scatter && t < ch.place ? 1 - easeOutCubic((t - ch.scatter) / 0.25) : 1;
    const slots = [[-1.05, 1.75], [1.05, 1.75], [-1.05, -0.55], [1.05, -0.55]];
    let pick = -1;
    ch.picks.forEach((p, i) => p !== null && t >= p - 0.05 && (pick = i));
    if (t >= ch.dance) pick = -1;
    ORDER.forEach((id, i) => {
      const m = this.molecules[id];
      m.group.visible = true;
      const hop = Math.abs(Math.sin(Math.PI * bf)) * 0.18;
      m.group.position.set(slots[i][0], slots[i][1] + hop, 0);
      const focus = pick === i ? 1.3 : pick >= 0 ? 0.75 : 1;
      m.group.scale.setScalar(0.62 * focus);
      const [rx, ry] = this.danceRotation(t, i * 1.3);
      m.group.rotation.set(rx, ry * (t >= ch.dance ? 2 : 1), 0);
      const progress = m.shape.dirs.map((_, k) => (t < ch.place ? scatter : (t - ch.place - k * 0.05) / 0.3));
      const domains = smooth(ch.groups - 0.1, ch.groups + 0.3, t) * (1 - smooth(ch.picks[0] - 0.2, ch.picks[0] + 0.2, t));
      m.update({ progress, domains, lobe: id === "bent" ? 1 : 0, pulse: kick, glow: (pick === i ? 1 : 0) });
    });
    const rel = timing.beatIndexAt(t) - timing.beatIndexAt(ch.start + 0.01);
    const shot = Math.floor(rel / 4);
    const angles = [0, 0.5, -0.5, 0.25];
    const a = angles[shot % angles.length] + Math.sin(t * 0.5) * 0.1 + (t >= ch.which && t < ch.which + 0.4 ? easeInOut((t - ch.which) / 0.4) * Math.PI * 2 : 0);
    this.camera.position.set(Math.sin(a) * 8.6, 1.4, Math.cos(a) * 8.6);
    this.camera.lookAt(0, 0.3, 0);
    const shotStart = timing.beatTime(timing.beatIndexAt(ch.start + 0.01) + shot * 4);
    post.flash = Math.max(post.flash || 0, Math.exp(-(t - shotStart) / 0.07) * 0.15);
    if (t >= ch.dance && t < ch.danceEnd + 0.3) post.mirror = 2;
    if (t >= ch.scatter && t < ch.scatter + 0.12) post.glitch = 0.5;
    if (t >= ch.place && t < ch.place + 0.15) post.flash = Math.max(post.flash, 0.35);
    hud.stamp("WHICH WAY?", t, ch.which, { x: 540, y: 560, size: 100, color: "#ffd23f", angle: -0.1, life: 0.9 });
    ch.picks.forEach((p, i) => p !== null && hud.slam(SHAPES[ORDER[i]].label, t, p, Math.min(ch.picks[i + 1] ?? ch.dance, p + 1.0) - 0.05, { y: 1040, size: 120, color: SHAPES[ORDER[i]].color, sub: `${SHAPES[ORDER[i]].formula} · ${SHAPES[ORDER[i]].angle}°`, angle: i % 2 ? 0.04 : -0.04 }));
    if (t > ch.end - 0.25) post.flash = Math.max(post.flash, smooth(ch.end - 0.25, ch.end, t) * 0.6);
  }

  outroScene(t, post, kick) {
    const { hud, timing } = this.ctx;
    const O = this.outro;
    this.core.visible = true;
    this.core.position.set(0, 0.6, 0);
    this.core.scale.setScalar(0.32 + kick * 0.12);
    this.core.material.color.set("#bfe6ff").multiplyScalar(0.7);
    ORDER.forEach((id, i) => {
      const m = this.molecules[id];
      m.group.visible = true;
      const a = (i / 4) * Math.PI * 2 + t * 0.6;
      m.group.position.set(Math.cos(a) * 1.9, 0.6 + Math.sin(a) * 0.4, Math.sin(a) * 1.9);
      m.group.scale.setScalar(0.55);
      const [rx, ry] = this.danceRotation(t, i);
      m.group.rotation.set(rx, ry, 0);
      m.update({ lobe: id === "bent" ? 1 : 0, pulse: kick });
      if (t >= O.shapes) {
        const p = m.group.position.clone().add(new THREE.Vector3(0, 0.95, 0)).project(this.camera);
        const at = O.shapes + i * this.P * 0.5;
        hud.text(`${SHAPES[id].label} ${SHAPES[id].angle}°`, (p.x * 0.5 + 0.5) * 1080, (-p.y * 0.5 + 0.5) * 1920, { size: 30, weight: 800, family: FONT_COND, color: SHAPES[id].color, alpha: smooth(at, at + 0.2, t) * (1 - smooth(SECTIONS.end - 0.4, SECTIONS.end - 0.1, t)), glow: 14 });
      }
    });
    const a = t * 0.15;
    this.camera.position.set(Math.sin(a) * 7.5, 2.8, Math.cos(a) * 7.5);
    this.camera.lookAt(0, 0.1, 0);
    hud.slam("COUNT THE GROUPS", t, O.count, O.shapes - 0.1, { y: 1040, size: 110, color: "#ffffff", sub: "around the core" });
    if (t > SECTIONS.end - 0.3) post.flash = Math.max(post.flash || 0, smooth(SECTIONS.end - 0.3, SECTIONS.end, t));
    void timing;
  }
}
