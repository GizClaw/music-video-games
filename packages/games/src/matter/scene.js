import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { glowTexture } from "../kit.js";
import { ImpactRings, ImpactShader } from "./impact.js";
import { createElements, animateElement } from "./elements.js";
import { buildMachine } from "./machines.js";
import { buildPortal, updatePortal } from "./portal.js";
import { STATES } from "./song.js";
import { ElementGarden } from "./menu.js";
import { DaylightSky } from "./sky.js";
import { actionPose } from "./action.js";
import { runPace, gateOffset, gateApproaches } from "./pace.js";
import { RushTrail } from "./trail.js";

const TAU = Math.PI * 2;
const fract = (v) => v - Math.floor(v);
const random = (n) => fract(Math.sin(n * 127.1 + 311.7) * 43758.5453);

/** A miniature, fully modelled particle laboratory. All animation is driven by
 * song time; gate meshes and effects are pooled and disposed with the game. */
export class MatterScene {
  constructor(container) {
    this.container = container;
    this.materials = new Set();
    this.geometries = new Set();
    this.textures = new Set();
    this.phaseScale = [0, 1, 0, 0];
    this.lastEvent = null;
    this.lastPhase = 1;
    this.shiftAt = -99;
    this.lookTarget = new THREE.Vector3(0, 1.7, 0);
    this.cameraPosition = new THREE.Vector3();
    this.cameraTarget = new THREE.Vector3();
    this.rushPoint = new THREE.Vector3();
    this.sparks = [];
    this.reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#cde8ee");
    this.scene.fog = new THREE.FogExp2("#e1edeb", 0.0095);
    this.camera = new THREE.PerspectiveCamera(52, 1, 0.1, 220);
    this.camera.position.set(5, 6.3, 17);
    this.camera.lookAt(this.lookTarget);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.98;
    container.appendChild(this.renderer.domElement);
    // Antialias the offscreen scene, not only the unused canvas framebuffer.
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: Math.min(4, this.renderer.capabilities.maxSamples) });
    this.composer = new EffectComposer(this.renderer, target);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(800, 600), 0.14, 0.4, 1.5);
    this.composer.addPass(this.bloom);
    this.impactPass = new ShaderPass(ImpactShader);
    this.composer.addPass(this.impactPass);
    this.output = new OutputPass();
    this.composer.addPass(this.output);

    const room = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.environmentTarget = pmrem.fromScene(room, 0.04);
    this.scene.environment = this.environmentTarget.texture;
    this.scene.environmentIntensity = 0.5;
    room.dispose();
    pmrem.dispose();
    this.scene.add(new THREE.HemisphereLight("#e4f4ff", "#8eabbc", 1.6));
    const key = new THREE.DirectionalLight("#fff4dc", 2.4);
    key.position.set(-4, 12, 8);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -18, right: 18, top: 13, bottom: -10, far: 45 });
    key.shadow.normalBias = 0.04;
    this.scene.add(key);
    this.keyLight = key;
    const rim = new THREE.DirectionalLight("#83b8f4", 2.4);
    rim.position.set(6, 7, -8);
    this.scene.add(rim);
    this.point = new THREE.PointLight("#9bdfd0", 7, 14);
    this.point.position.set(-4, 3, 3);
    this.scene.add(this.point);

    this.glow = glowTexture();
    this.textures.add(this.glow);
    this.baseMat = this.material("#62a9bd", { metalness: 0.2, roughness: 0.35, clearcoat: 1 });
    this.darkMat = this.material("#5181b1", { roughness: 0.58 });
    this.metalMat = this.material("#c7dde5", { metalness: 0.35, roughness: 0.3 });
    this.creamMat = this.material("#e9f2db", { roughness: 0.32 });
    this.phaseMats = STATES.map((s) => this.material(s.color, { roughness: 0.22, metalness: 0.12, clearcoat: 1, clearcoatRoughness: 0.14 }));
    this.lights = STATES.map((s) => this.material(s.color, { emissive: s.color, emissiveIntensity: 0.9, roughness: 0.3 }));
    this.trackMat = this.material("#5a979d", { emissive: "#7ac9bd", emissiveIntensity: 0.4, roughness: 0.35 });
    this.trackNeutral = new THREE.Color("#7ac9bd");
    this.hitTint = new THREE.Color();
    this.buildLab();
    this.buildRunner();
    this.rushTrail = new RushTrail(this.scene);
    this.menu = new ElementGarden(this);
    this.sky = new DaylightSky(this);
    this.impactRings = new ImpactRings(this.scene);
    this.gates = Array.from({ length: 10 }, () => this.buildGate());
    this.gates.forEach((g) => this.scene.add(g.root));
    const sparkGeo = this.geometry(new THREE.SphereGeometry(0.07, 6, 4));
    for (let i = 0; i < 54; i++) {
      const material = this.material("#ffffff", { emissive: "#ffffff", emissiveIntensity: 1.8 });
      const mesh = new THREE.Mesh(sparkGeo, material);
      mesh.visible = false;
      this.scene.add(mesh);
      this.sparks.push({ mesh, material, seed: i });
    }
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    this.resize();
  }

  material(color, props = {}) {
    const m = new THREE.MeshPhysicalMaterial({ color, ...props });
    this.materials.add(m);
    return m;
  }
  geometry(g) { this.geometries.add(g); return g; }
  mesh(parent, geometry, material, x = 0, y = 0, z = 0) {
    const m = new THREE.Mesh(this.geometry(geometry), material);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  box(parent, size, mat, x = 0, y = 0, z = 0, radius = 0.1) {
    return this.mesh(parent, new RoundedBoxGeometry(...size, 3, radius), mat, x, y, z);
  }
  sphere(parent, radius, mat, x = 0, y = 0, z = 0) {
    return this.mesh(parent, new THREE.SphereGeometry(radius, 40, 24), mat, x, y, z);
  }
  ring(parent, radius, tube, mat, x = 0, y = 0, z = 0) {
    return this.mesh(parent, new THREE.TorusGeometry(radius, tube, 12, 128), mat, x, y, z);
  }
  sprite(parent, color, size, x, y, z, opacity = 0.45) {
    const mat = new THREE.SpriteMaterial({ map: this.glow, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending });
    this.materials.add(mat);
    const mesh = new THREE.Sprite(mat);
    mesh.position.set(x, y, z);
    mesh.scale.set(size, size, 1);
    parent.add(mesh);
    return mesh;
  }

  buildLab() {
    this.lab = new THREE.Group();
    this.scene.add(this.lab);
    this.box(this.lab, [180, 0.55, 5.8], this.baseMat, 65, -0.42, 0, 0.22);
    this.box(this.lab, [180, 0.13, 5.1], this.darkMat, 65, -0.08, 0, 0.05);
    for (const z of [-2.7, 2.7]) {
      this.box(this.lab, [180, 0.05, 0.06], this.trackMat, 65, 0.015, z, 0.025);
      this.box(this.lab, [180, 0.16, 0.2], this.metalMat, 65, -0.6, z);
    }
    this.road = [];
    for (let i = 0; i < 32; i++) {
      const g = new THREE.Group();
      for (const z of [-2.3, 2.3]) this.box(g, [0.9, 0.025, 0.12], this.creamMat, 0, 0.015, z, 0.03);
      for (const side of [-1, 1]) {
        const arrow = this.box(g, [0.6, 0.025, 0.055], this.metalMat, 0, 0.015, side * 0.15, 0.02);
        arrow.rotation.y = side * 0.55;
      }
      this.road.push(g);
      this.lab.add(g);
    }
    // Towers on both sides pass the chase camera and reveal the road's depth.
    this.pods = [];
    for (let i = 0; i < 20; i++) {
      const x = i * 9;
      const h = 1.6 + random(i + 2) * 4;
      const z = (i % 2 ? 1 : -1) * (5 + random(i + 8) * 5);
      const machine = buildMachine(this, i, h);
      machine.pod.position.set(x, 0, z);
      this.scene.add(machine.pod);
      this.pods.push({ ...machine, x });
    }
    // The rhythmic portals are the only full rings; scenery must not imply
    // a second, unscored set of gates.
    const positions = new Float32Array(150 * 3);
    for (let i = 0; i < 150; i++) {
      positions[i * 3] = random(i * 3) * 170 - 20;
      positions[i * 3 + 1] = random(i * 3 + 1) * 22 - 5;
      positions[i * 3 + 2] = (random(i * 3 + 2) - 0.5) * 42;
    }
    const geo = this.geometry(new THREE.BufferGeometry());
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ size: 0.08, color: "#b9f3d5", transparent: true, opacity: 0.7, sizeAttenuation: true });
    this.materials.add(mat);
    this.dust = new THREE.Points(geo, mat);
    this.scene.add(this.dust);
    const streakGeometry = this.geometry(new THREE.BufferGeometry());
    this.streakPositions = new Float32Array(84 * 6);
    streakGeometry.setAttribute("position", new THREE.BufferAttribute(this.streakPositions, 3));
    const streakMaterial = new THREE.LineBasicMaterial({ color: "#349cae", transparent: true, opacity: 0.18, depthWrite: false });
    this.materials.add(streakMaterial);
    this.streaks = new THREE.LineSegments(streakGeometry, streakMaterial);
    this.streaks.frustumCulled = false;
    this.scene.add(this.streaks);
  }

  buildRunner() {
    this.runner = new THREE.Group();
    this.forms = createElements(this);
    this.forms.forEach((f) => this.runner.add(f));
    this.scene.add(this.runner);
    this.aura = this.sprite(this.runner, STATES[1].color, 4.5, 0, 0, -0.3, 0.28);
    this.hitRing = this.ring(this.scene, 1.45, 0.045, this.lights[1]);
    this.hitRing.rotation.x = -Math.PI / 2;
    this.hitRing.position.y = 0.035;
    this.trail = Array.from({ length: 32 }, (_, i) => {
      const m = this.sphere(this.scene, 0.035 + random(i) * 0.045, this.lights[1]);
      return m;
    });
    const boltGeometry = this.geometry(new THREE.BufferGeometry());
    this.boltPositions = new Float32Array(32 * 6);
    boltGeometry.setAttribute("position", new THREE.BufferAttribute(this.boltPositions, 3));
    const boltMaterial = new THREE.LineBasicMaterial({ color: "#ac65df", transparent: true, opacity: 0, depthWrite: false });
    this.materials.add(boltMaterial);
    this.actionBolts = new THREE.LineSegments(boltGeometry, boltMaterial);
    this.actionBolts.frustumCulled = false;
    this.scene.add(this.actionBolts);
  }

  label(phase) {
    const canvas = document.createElement("canvas");
    canvas.width = 256; canvas.height = 96;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#082830";
    ctx.beginPath(); ctx.roundRect(4, 4, 248, 88, 22); ctx.fill();
    ctx.strokeStyle = STATES[phase].color; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = STATES[phase].color; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = "800 40px system-ui";
    ctx.fillText(`${STATES[phase].key} · ${STATES[phase].en}`, 128, 49);
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    this.textures.add(map);
    const material = new THREE.SpriteMaterial({ map, depthWrite: false });
    this.materials.add(material);
    const s = new THREE.Sprite(material);
    s.scale.set(2.05, 0.76, 1);
    s.position.set(0, 3.3, 0);
    return s;
  }

  buildGate() {
    const root = new THREE.Group();
    const chargeMaterial = new THREE.MeshBasicMaterial({ color: "#c9eee4", transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    this.materials.add(chargeMaterial);
    const charge = this.ring(root, 2.35, 0.016, chargeMaterial, 0, 2.5, 0);
    charge.rotation.y = Math.PI / 2;
    const forms = STATES.map((s, phase) => {
      const g = new THREE.Group();
      const label = this.label(phase);
      g.add(label);
      g.userData.label = label;
      this.box(g, [0.65, 0.1, 3.45], this.lights[phase], 0, 0.05, 0, 0.04);
      root.add(g);
      return g;
    });
    const bricks = [];
    for (let row = 0; row < 4; row++) for (let col = 0; col < 3; col++) {
      const b = this.box(forms[0], [0.48, 0.48, 0.84], this.phaseMats[0], 0, 0.38 + row * 0.5, (col - 1) * 0.9, 0.07);
      bricks.push({ mesh: b, y: b.position.y, z: b.position.z });
    }
    for (const z of [-1.48, 1.48]) {
      this.box(forms[1], [0.6, 2.6, 0.3], this.baseMat, 0, 1.3, z);
      this.box(forms[1], [0.65, 2.1, 0.05], this.lights[1], 0, 1.4, z + 0.17);
    }
    const pipe = this.mesh(forms[1], new THREE.CylinderGeometry(0.42, 0.42, 3.15, 24), this.phaseMats[1], 0, 1.48, 0);
    pipe.rotation.x = Math.PI / 2;
    for (const z of [-1.5, 1.5]) {
      this.mesh(forms[1], new THREE.CylinderGeometry(0.51, 0.51, 0.15, 24), this.metalMat, 0, 1.48, z).rotation.x = Math.PI / 2;
    }
    for (let j = -2; j <= 2; j++) this.box(forms[2], [0.23, 2.6, 0.18], this.phaseMats[2], 0, 1.4, j * 0.65, 0.07);
    for (const y of [0.5, 2.5]) this.box(forms[2], [0.3, 0.18, 3.2], this.lights[2], 0, y, 0, 0.07);
    const portal = buildPortal(this, root);
    return { root, forms, bricks, charge, chargeMaterial, portal };
  }

  resize() {
    const { width, height } = this.container.getBoundingClientRect();
    this.w = Math.max(1, width); this.h = Math.max(1, height);
    this.portrait = this.w / this.h < 0.85;
    this.camera.aspect = this.w / this.h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.w, this.h, false);
    this.composer.setSize(this.w, this.h);
  }

  /** A trailing perspective camera. Acceleration widens the lens, shifts have
   * a brief bank, and impacts make one short push. Song time freezes all these
   * effects on pause. Reduced motion keeps the forward view with a stable rig. */
  followCamera({ t, dt, phase, intro, pulse, action, paused = false, pace = runPace(t) }) {
    const boost = intro ? 0 : pace.intensity;
    const shiftAge = t - this.shiftAt;
    const shift = shiftAge >= 0 ? Math.exp(-shiftAge / 0.26) : 0;
    const impactAge = t - (this.sparkAt ?? -99);
    const impact = impactAge >= 0 ? Math.exp(-impactAge / 0.2) : 0;
    const motion = this.reduced ? 0 : 1;
    let fov;
    if (intro) {
      const short = this.h < 640 && !this.portrait;
      this.cameraPosition.set(0, short ? 6.1 : 4.4, this.portrait ? 22 : 17);
      this.cameraTarget.set(0, short ? 1.8 : 0.8, 0);
      this.cameraPosition.x += Math.sin(t * 0.18) * 0.5 * motion;
      fov = this.portrait ? 49 : 51;
    } else {
      const elevation = phase === 2 ? 0.32 + action * 0.5 : phase === 1 ? -action * 0.35 : 0;
      const shake = this.sparkMiss ? impact * 0.12 * Math.sin(impactAge * 85) : 0;
      this.cameraPosition.set(
        (this.portrait ? -14.5 : -13) + motion * (boost * 2.1 + impact * .8 + shift * .18),
        (this.portrait ? 5.3 : 4.4) + motion * (-boost * 1.65 + elevation + Math.sin(t * 12) * (.018 + boost * .035) + shake),
        (this.portrait ? 0.35 : 0.9) + motion * (Math.sin(t * .6) * (.12 + boost * .18) + shake),
      );
      this.cameraTarget.set(15 + motion * boost * 5, (this.h < 560 ? -1.8 : this.portrait ? -0.8 : -0.5) + motion * (elevation * .35 + boost * .55), 0);
      fov = (this.portrait ? 72 : 65) + motion * (-4 + boost * (this.portrait ? 23 : 26) + impact * 4 + pulse * boost * 1.6);
    }
    const spring = 1 - Math.exp(-dt * (intro ? 3 : impact > .08 ? 14 : 5));
    this.camera.position.lerp(this.cameraPosition, spring);
    this.lookTarget.lerp(this.cameraTarget, spring);
    this.camera.lookAt(this.lookTarget);
    if (!intro) this.camera.rotateZ(motion * (Math.sin(t * .6) * (.004 + boost * .009) + shift * [-.035, .027, -.022, .04][phase] * (.7 + boost * .8)));
    this.camera.fov += (fov - this.camera.fov) * spring;
    this.camera.updateProjectionMatrix();
    this.streaks.visible = !intro && !paused && !this.reduced;
    this.streaks.material.opacity = Math.min(.9, .12 + boost * .6 + impact * .3);
    const streakCount = this.streakPositions.length / 6;
    this.streaks.geometry.setDrawRange(0, Math.round(18 + boost * (streakCount - 18)) * 2);
    for (let i = 0; i < streakCount; i++) {
      const x = ((i * 5.1 - pace.distance * 2.4) % 110 + 110) % 110 - 20;
      const y = 0.6 + random(i + 7) * 8;
      const z = (i % 2 ? -1 : 1) * (3.3 + random(i + 9) * 7);
      this.streakPositions.set([x, y, z, x + .8 + boost * 12 + impact * 6, y, z], i * 6);
    }
    this.streaks.geometry.attributes.position.needsUpdate = true;
  }

  render({ t, dt, phase, pulse, notes, mode, event, actionEvent, pace = runPace(t) }) {
    const intro = mode === "title";
    const distance = intro ? t * 1.8 : pace.distance;
    const boost = intro ? 0 : pace.intensity;
    this.sky.update(t, dt, intro, phase, this.reduced);
    this.menu.root.visible = intro;
    this.lab.visible = this.dust.visible = !intro;
    const activeFx = mode === "play" || mode === "ending";
    if (phase !== this.lastPhase) { this.shiftAt = t; this.lastPhase = phase; }
    // On short screens, align the hero with the center of the right-hand dock.
    const menuX = this.h < 640 && !this.portrait
      ? (this.w * .92 - 340) / this.h * Math.tan(THREE.MathUtils.degToRad(25.5)) * 17
      : 0;
    const x = intro ? menuX : -3.8;
    if (intro) this.menu.update(t, dt, phase, x, this.reduced);
    const smooth = 1 - Math.exp(-dt * 13);
    const scale = intro ? (this.portrait ? 2 : 2.1) : 1;
    const pose = actionPose(intro ? null : actionEvent, t);
    const formPhase = pose.phase ?? phase;
    this.runner.position.x += (x + pose.forward - this.runner.position.x) * smooth;
    const lift = intro ? .1 : (formPhase === 2 ? .8 : formPhase === 3 ? .5 : 0) + pose.lift;
    this.runner.position.y += ((intro ? 1.9 : 1.03) + lift + Math.sin(t * 5) * 0.08 - this.runner.position.y) * smooth;
    this.runner.position.z = 0.2;
    this.runner.rotation.y += ((intro ? 0 : Math.PI / 2) - this.runner.rotation.y) * smooth;
    this.runner.rotation.z = this.reduced ? 0 : (intro ? 0 : -0.1) + Math.sin(t * 4) * 0.035 - (formPhase === 0 ? pose.power * .2 : 0);
    this.runner.scale.setScalar(scale);
    this.forms.forEach((f, i) => {
      this.phaseScale[i] += ((i === formPhase ? 1 : 0) - this.phaseScale[i]) * smooth;
      const s = this.phaseScale[i];
      f.visible = s > 0.01;
      f.scale.setScalar(Math.max(0.001, s));
      if (i === formPhase) f.scale.multiply(new THREE.Vector3(pose.stretch, pose.squash, 1 + (i === 1 ? pose.power * .25 : 0)));
      f.rotation.y = i === formPhase ? Math.sin(t * 1.7) * .13 + pose.charge * Math.PI : 0;
    });
    this.forms.forEach((form) => animateElement(form, t));
    this.aura.material.color.set(STATES[formPhase].color);
    this.aura.material.opacity = 0.055 + pulse * 0.035 + pose.charge * .22;
    this.aura.scale.setScalar(4.5 + pose.charge * 2);
    this.actionBolts.visible = pose.charge > .02;
    if (this.actionBolts.visible) {
      this.actionBolts.position.copy(this.runner.position);
      this.actionBolts.material.opacity = pose.charge;
      for (let i = 0; i < 8; i++) for (let j = 0; j < 4; j++) {
        const angle = i * TAU / 8;
        const point = (k) => {
          const jitter = this.reduced ? 0 : (random(i * 7 + k + Math.floor(t * 24)) - .5) * .28;
          const radius = .6 + k * .18 + jitter;
          return [k * .48, Math.sin(angle) * radius, Math.cos(angle) * radius];
        };
        this.boltPositions.set([...point(j), ...point(j + 1)], (i * 4 + j) * 6);
      }
      this.actionBolts.geometry.attributes.position.needsUpdate = true;
    }
    this.trackMat.emissiveIntensity = 0.35 + pulse * 0.35;
    this.point.color.set(STATES[phase].color);
    this.point.position.x = this.runner.position.x;
    this.hitRing.material = this.lights[phase];
    this.hitRing.position.x = x;
    this.hitRing.scale.setScalar(1 + pulse * 0.12);
    this.hitRing.visible = !intro;
    this.road.forEach((r, i) => { r.position.x = ((i * 3.8 - distance) % 121.6 + 121.6) % 121.6 - 18; });
    this.trail.forEach((m, i) => {
      m.visible = !intro && i < 10 + boost * 22;
      const p = fract(distance * .055 + i / this.trail.length);
      m.position.set(x - p * (3 + boost * 7), this.runner.position.y - .5 + Math.sin(i + t * 2) * .2, 0.2 + Math.cos(i * 2) * (.3 + boost * .4));
      const size = (1 - p) * (1.1 + boost * .8) * (1 + pose.power * .7);
      m.scale.set(size * (1 + boost * 4), size, size);
      m.material = this.lights[phase];
    });
    this.rushTrail.update(t, this.runner.position, STATES[formPhase].ink, boost, !intro, this.reduced);
    this.pods.forEach(({ pod, orb, y, detail, x: bx }, i) => {
      pod.position.x = ((bx - distance + 24) % 180 + 180) % 180 - 24;
      pod.visible = !intro;
      orb.position.y = y + Math.sin(t * 1.3 + i) * 0.09;
      orb.rotation.y = t * 0.35 + i;
      detail.visible = Math.abs(pod.position.x - this.camera.position.x) < 44;
    });
    this.dust.position.x = -(distance * 0.35) % 20;
    // The vocal beat stays fixed; each incoming gate keeps its chosen approach
    // speed while the road and effects respond immediately to combo changes.
    const visible = intro ? [] : gateApproaches(notes, t, pace.speed);
    this.gates.forEach((gate, i) => {
      const n = visible[i]?.note;
      gate.root.visible = !!n;
      if (!n) return;
      const cleared = n.result && n.result !== "miss";
      const departure = gateOffset(visible[i].distance);
      gate.root.position.set(x + (cleared ? Math.max(-3.2, departure) : departure), 0, 0);
      gate.forms.forEach((f, p) => { f.visible = p === n.phase; f.userData.label.visible = !n.result; });
      const age = Math.max(0, t - n.t);
      const charge = Math.max(0, 1 - Math.max(0, n.t - t) / 1.1);
      gate.charge.visible = !n.result && n.t >= t;
      gate.charge.scale.setScalar(1.35 - charge * 0.35);
      gate.chargeMaterial.color.set(STATES[n.phase].color);
      gate.chargeMaterial.opacity = charge * (0.35 + pulse * 0.5);
      gate.root.scale.setScalar(n.result === "miss" ? Math.max(0.01, 1 - Math.max(0, age - 0.12) * 5) : 1);
      gate.forms[n.phase].scale.setScalar(cleared && n.phase !== 0 ? Math.max(0.01, 1 - age * 2.4) : 1);
      if (!cleared) gate.forms[n.phase].scale.setScalar(1);
      for (const [b, brick] of gate.bricks.entries()) {
        const a = cleared ? age : 0;
        brick.mesh.position.set(a * (1 + random(b) * 2), brick.y + a * (3 + random(b + 5) * 5) - a * a * 6, brick.z + a * (random(b + 19) - 0.5) * 10);
        brick.mesh.rotation.set(a * (b + 1), a * 4, a * 3);
        brick.mesh.scale.setScalar(Math.max(0.01, 1 - a * 4.8));
      }
      updatePortal(gate.portal, t, n, STATES[n.phase].color, pulse);
    });
    if (event && event !== this.lastEvent) {
      this.lastEvent = event;
      this.sparkAt = t;
      this.sparkPhase = event.phase;
      this.sparkMiss = event.result === "miss";
      this.sparkOrigin = new THREE.Vector3(x, this.runner.position.y, 0.3);
      this.impactRings.trigger(t, STATES[event.phase].color, event.result, new THREE.Vector3(x + 0.3, 1.4, 0));
    }
    const age = t - (this.sparkAt ?? -99);
    for (const { mesh, material, seed } of this.sparks) {
      mesh.visible = activeFx && age >= 0 && age < 0.8 && (!this.reduced || seed < 10);
      if (!mesh.visible) continue;
      const angle = random(seed + 4) * TAU;
      const speed = 2 + random(seed + 12) * 6;
      mesh.position.copy(this.sparkOrigin).add(new THREE.Vector3(Math.cos(angle) * speed * age, Math.sin(angle) * speed * age - age * age * 3, (random(seed + 20) - 0.5) * age * 9));
      mesh.scale.setScalar((1 - age / 0.8) * (1 + random(seed + 2)));
      const color = this.sparkMiss ? "#ff7d8c" : STATES[this.sparkPhase].color;
      material.color.set(color); material.emissive.set(color);
    }
    this.followCamera({ t, dt, phase: formPhase, intro, pulse, action: pose.power, paused: mode === "pause", pace });
    this.impactRings.update(t, this.camera, this.impactPass, this.w, this.h, activeFx, this.reduced);
    this.rushPoint.set(90, 0, 0).project(this.camera);
    this.impactPass.uniforms.uVanishing.value.set(this.rushPoint.x * .5 + .5, this.rushPoint.y * .5 + .5);
    this.impactPass.uniforms.uRush.value = activeFx && !this.reduced ? boost : 0;
    this.impactPass.uniforms.uTime.value = distance * .08;
    const hitEnergy = activeFx && age >= 0 ? Math.exp(-age / .22) : 0;
    this.hitTint.set(this.sparkMiss ? "#ff486b" : STATES[this.sparkPhase ?? phase].color);
    this.trackMat.emissive.copy(this.trackNeutral).lerp(this.hitTint, hitEnergy);
    this.trackMat.emissiveIntensity = .4 + pulse * .55 + hitEnergy * 2.6;
    this.point.intensity = 7 + hitEnergy * 45;
    this.bloom.strength = this.reduced ? 0.12 : 0.12 + pulse * 0.04 + (age >= 0 && age < 0.4 && !this.sparkMiss ? (0.4 - age) * 0.45 : 0);
    this.composer.render();
  }

  destroy() {
    this.rushTrail.destroy();
    this.observer.disconnect();
    this.keyLight.shadow.map?.dispose();
    this.geometries.forEach((g) => g.dispose());
    this.materials.forEach((m) => m.dispose());
    this.textures.forEach((t) => t.dispose());
    this.bloom.dispose();
    this.impactRings.destroy();
    this.impactPass.dispose();
    this.environmentTarget.dispose();
    this.output.dispose();
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
