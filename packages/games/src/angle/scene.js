import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { clamp, hash } from "@gizclaw/mvg-core/timing.js";
import { KINDS, kindOf } from "./song.js";
import { createAircraft, ENGINE_PORTS } from "./aircraft.js";
import { gateDeparture, GATE_PASS_TIME } from "./gate.js";

const RAD = Math.PI / 180;
const TAU = Math.PI * 2;
const ease = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
const FlightPost = {
  uniforms: { tDiffuse: { value: null }, rush: { value: 0 }, hit: { value: 0 }, miss: { value: 0 }, time: { value: 0 } },
  vertexShader: "varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;uniform float rush,hit,miss,time;varying vec2 vUv;
    void main(){vec2 d=vUv-vec2(.5,.55);float r=length(d);float edge=smoothstep(.22,.65,r);
      vec2 drag=d*edge*rush*.018;vec3 col=texture2D(tDiffuse,vUv).rgb*.6+texture2D(tDiffuse,vUv-drag).rgb*.25+texture2D(tDiffuse,vUv-drag*2.).rgb*.15;
      float a=dot(d,d)>1.e-10?atan(d.y,d.x):0.;float stripe=pow(max(0.,sin(a*67.+sin(a*11.)*2.)),80.);
      float streak=pow(max(0.,sin(r*22.-time*19.+sin(a*83.)*10.)),8.);
      col+=vec3(.55,.9,1.)*stripe*streak*edge*rush*.18;
      col+=vec3(.55,.35,.1)*hit*.09;
      col=mix(col,vec3(.95,.27,.28),miss*edge*.28);
      col*=1.-smoothstep(.3,.8,r)*.08;
      gl_FragColor=vec4(col,1.);}
  `,
};

function angleTexture(degrees, color) {
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = 512;
  const c = canvas.getContext("2d"), x = 256, y = 223, r = 148;
  const a = -degrees * RAD;
  c.lineCap = "round";
  c.fillStyle = color; c.globalAlpha = 0.13;
  c.beginPath(); c.moveTo(x, y); c.arc(x, y, r * .75, 0, a, true); c.closePath(); c.fill(); c.globalAlpha = 1;
  c.strokeStyle = "#9bb7c6"; c.lineWidth = 13;
  c.beginPath(); c.moveTo(x, y); c.lineTo(x + r, y); c.stroke();
  c.strokeStyle = color; c.lineWidth = 16;
  c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); c.stroke();
  c.lineWidth = 7; c.beginPath(); c.arc(x, y, r * .52, 0, a, true); c.stroke();
  c.fillStyle = color; c.beginPath(); c.arc(x, y, 13, 0, TAU); c.fill();
  if (degrees === 90) { c.lineWidth = 5; c.beginPath(); c.moveTo(x + 34, y); c.lineTo(x + 34, y - 34); c.lineTo(x, y - 34); c.stroke(); }
  c.fillStyle = "#234d65"; c.font = "900 93px 'Arial Rounded MT Bold', 'Avenir Next', sans-serif"; c.textAlign = "center";
  c.fillText(`${degrees}°`, 256, 441);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Full-screen sky course. All game movement, impacts and camera cues use song time. */
export class AngleScene {
  constructor(host) {
    this.host = host; this.materials = new Set(); this.geometries = new Set(); this.textures = new Set();
    this.energy = 0; this.action = null; this.cameraHeading = null;
    this.viewAngle = Math.PI; this.frameChecks = [];
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color("#c9e8e6");
    this.scene.fog = new THREE.FogExp2("#c9e8e6", 0.009);
    this.camera = new THREE.PerspectiveCamera(54, 1, 0.1, 350);
    this.camera.position.set(4, 4, 10); this.look = new THREE.Vector3(0, 1.3, -10);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.65));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = .92;
    this.renderer.info.autoReset = false;
    host.appendChild(this.renderer.domElement);
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: Math.min(4, this.renderer.capabilities.maxSamples) });
    this.composer = new EffectComposer(this.renderer, target);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(800, 600), .28, .5, 1.4);
    this.post = new ShaderPass(FlightPost);
    this.composer.addPass(new RenderPass(this.scene, this.camera)); this.composer.addPass(this.bloom); this.composer.addPass(this.post); this.composer.addPass(new OutputPass());
    const room = new RoomEnvironment(), pmrem = new THREE.PMREMGenerator(this.renderer);
    this.environment = pmrem.fromScene(room, .04); this.scene.environment = this.environment.texture; this.scene.environmentIntensity = .32;
    room.dispose(); pmrem.dispose();
    this.scene.add(new THREE.HemisphereLight("#eaffff", "#7291ab", 1.35));
    const sun = new THREE.DirectionalLight("#fff0d4", 2); sun.position.set(-12, 18, 10); this.scene.add(sun);
    const rim = new THREE.DirectionalLight("#90dafa", 1); rim.position.set(8, 6, -12); this.scene.add(rim);
    this.flash = new THREE.PointLight("#ffe8a3", 0, 22); this.scene.add(this.flash);
    this.pearl = this.material("#fff5df", { roughness: .28, clearcoat: 1 });
    this.teal = this.material("#369fae", { roughness: .25, metalness: .16, clearcoat: 1 });
    this.gold = this.material("#ffcd75", { roughness: .2, metalness: .28 });
    this.glow = this.material("#b1fff1", { emissive: "#84ffdd", emissiveIntensity: 2.3 });
    this.cloudMaterial = this.material("#fff6f0", { roughness: 1 });
    this.makeSky(); this.makeLandscape();
    this.aircraft = createAircraft(this); this.scene.add(this.aircraft.root);
    this.gates = [this.makeGate(), this.makeGate()];
    this.trails = [-1, 1].map((side) => this.makeTrail(side));
    this.shocks = Array.from({ length: 3 }, () => {
      const mat = this.trackMaterial(new THREE.MeshBasicMaterial({ color: "#fff2ad", transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      const mesh = this.mesh(new THREE.TorusGeometry(1, .024, 8, 96), mat); mesh.visible = false; return mesh;
    });
    this.sparkDummy = new THREE.Object3D();
    this.sparkMesh = new THREE.InstancedMesh(this.trackGeometry(new THREE.SphereGeometry(.075, 8, 6)), this.gold, 56); this.sparkMesh.frustumCulled = false; this.scene.add(this.sparkMesh);
    this.sparkMesh.count = 0;
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(host); this.resize();
  }
  trackGeometry(g) { this.geometries.add(g); return g; }
  trackMaterial(m) { this.materials.add(m); return m; }
  material(color, options = {}) { return this.trackMaterial(new THREE.MeshPhysicalMaterial({ color, roughness: .5, ...options })); }
  mesh(geometry, material, parent = this.scene) { const m = new THREE.Mesh(this.trackGeometry(geometry), material); parent.add(m); return m; }
  box(size, material, pos, parent = this.scene, round = .15) {
    const m = this.mesh(new RoundedBoxGeometry(...size, 3, round), material, parent); m.position.set(...pos); return m;
  }
  makeSky() {
    const mat = this.trackMaterial(new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false,
      vertexShader: "varying vec3 vP;void main(){vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
      fragmentShader: "varying vec3 vP;void main(){vec3 d=normalize(vP);float h=smoothstep(-.6,.45,d.y);vec3 col=mix(vec3(.53,.8,.79),vec3(.08,.39,.62),h);float sun=max(0.,dot(d,normalize(vec3(-.45,.34,-1.))));col+=vec3(1.,.75,.35)*pow(sun,180.)*.35+vec3(1.,.91,.66)*pow(sun,2200.)*1.5;gl_FragColor=vec4(col,1.);}" }));
    this.sky = this.mesh(new THREE.SphereGeometry(280, 32, 20), mat);
  }
  makeLandscape() {
    const dummy = new THREE.Object3D();
    this.clouds = new THREE.InstancedMesh(this.trackGeometry(new THREE.SphereGeometry(1, 16, 12)), this.cloudMaterial, 130);
    this.clouds.frustumCulled = false; this.scene.add(this.clouds); this.cloudSeeds = [];
    for (let i = 0; i < 130; i++) this.cloudSeeds.push({ x: hash(i * 7) * 280 - 140, y: -7 - hash(i * 9) * 4, z: hash(i * 19) * 280 - 140, r: 2 + hash(i * 13) * 3 });
    this.guide = new THREE.InstancedMesh(this.trackGeometry(new THREE.CapsuleGeometry(.04, .55, 3, 6)), this.glow, 100);
    this.guide.frustumCulled = false; this.scene.add(this.guide);
    this.towers = [];
    const coral = this.material("#ee9b8c", { clearcoat: 1, roughness: .3 });
    for (let i = 0; i < 14; i++) {
      const root = new THREE.Group(); this.scene.add(root);
      const height = 3 + hash(i * 7) * 3;
      this.box([1.7, height, 1.7], i % 3 ? this.teal : coral, [0, -height / 2, 0], root, .3);
      this.box([2.2, .22, 2.2], this.pearl, [0, .1, 0], root, .1);
      const ring = this.mesh(new THREE.TorusGeometry(1.45, .09, 10, 64, Math.PI * 1.5), this.gold, root);
      ring.position.y = 2; ring.rotation.z = i;
      const heart = this.mesh(new THREE.OctahedronGeometry(.4, 1), this.glow, root); heart.position.y = 2;
      this.towers.push({ root, ring, heart, x: (i % 4 - 1.5) * 29 + hash(i) * 9, z: (Math.floor(i / 4) - 1.5) * 36 });
    }
    this.farRings = [];
    for (let i = 0; i < 5; i++) {
      const ring = this.mesh(new THREE.TorusGeometry(15 + i * 2, .2, 8, 128, Math.PI * 1.7), i % 2 ? this.pearl : this.gold);
      ring.position.set(Math.sin(i * 2) * 13, 9 + i, -95 - i * 21); ring.rotation.z = i * .9;
      this.farRings.push(ring);
    }
    this.instanceDummy = dummy;
  }
  makeGate() {
    const root = new THREE.Group(); this.scene.add(root);
    const frame = new THREE.Group(); root.add(frame);
    const glowMat = this.material("#74e4d2", { emissive: "#38c9b9", emissiveIntensity: .4, roughness: .25 });
    const segments = [];
    for (let i = 0; i < 12; i++) {
      const m = this.mesh(new THREE.TorusGeometry(2.35, .095, 10, 12, TAU / 12 * .85), this.pearl, frame);
      m.rotation.z = i * TAU / 12; segments.push(m);
    }
    const inner = this.mesh(new THREE.TorusGeometry(2.17, .038, 8, 96), glowMat, frame);
    const outer = this.mesh(new THREE.TorusGeometry(2.49, .024, 8, 96), this.gold, frame);
    const panelMat = this.trackMaterial(new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    const panel = this.mesh(new THREE.PlaneGeometry(1.5, 1.5), panelMat, frame); panel.position.set(0, 3.05, .1);
    const pad = this.box([4.5, .22, 2.3], this.pearl, [0, -2.4, -.35], root, .1);
    this.box([3.5, .05, .12], glowMat, [0, -2.24, .6], root, .02);
    return { root, frame, glowMat, panel, segments, inner, outer, pad, degrees: null };
  }
  setGate(item, degrees) {
    if (degrees === item.degrees) return;
    item.degrees = degrees;
    const color = KINDS[kindOf(degrees)].color;
    const previous = item.panel.material.map;
    if (previous) { previous.dispose(); this.textures.delete(previous); }
    const texture = angleTexture(degrees, color); this.textures.add(texture);
    item.panel.material.map = texture; item.panel.material.needsUpdate = true;
    item.glowMat.color.set(color); item.glowMat.emissive.set(color);
  }
  makeTrail(side) {
    const geometry = this.trackGeometry(new THREE.BufferGeometry());
    const position = new Float32Array(90 * 6); const indices = [];
    for (let i = 0; i < 89; i++) { const j = i * 2; indices.push(j, j + 1, j + 2, j + 1, j + 3, j + 2); }
    geometry.setAttribute("position", new THREE.BufferAttribute(position, 3)); geometry.setIndex(indices);
    const uv = new Float32Array(90 * 4);
    for (let i = 0; i < 90; i++) uv.set([i / 89, 0, i / 89, 1], i * 4);
    geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    const mat = this.trackMaterial(new THREE.ShaderMaterial({
      uniforms: { color: { value: new THREE.Color(side < 0 ? "#83fff1" : "#ffca75") }, power: { value: .65 } },
      vertexShader: "varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
      // Raster interpolation can overshoot a UV endpoint by an epsilon. A fractional
      // power of a negative base produces NaNs that spread through HDR bloom.
      fragmentShader: "varying vec2 vUv;uniform vec3 color;uniform float power;void main(){vec2 uv=clamp(vUv,0.,1.);float a=pow(max(0.,1.-uv.x),.7)*(1.-abs(uv.y*2.-1.)*.6);gl_FragColor=vec4(color*1.2,clamp(a*power,0.,1.));}",
      transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    const mesh = new THREE.Mesh(geometry, mat); mesh.frustumCulled = false; this.scene.add(mesh);
    return { mesh, position, side };
  }
  resize() {
    const r = this.host.getBoundingClientRect(); this.w = Math.max(1, r.width); this.h = Math.max(1, r.height); this.portrait = this.w / this.h < .85;
    this.renderer.setSize(this.w, this.h, false); this.composer.setSize(this.w, this.h);
    this.camera.aspect = this.w / this.h; this.camera.updateProjectionMatrix();
  }
  reset() { this.action = null; this.energy = 0; this.cameraHeading = null; }
  burst(note, result, time) {
    this.action = { time: note.t, degrees: note.degrees, result, note: note.id, ...note.gate };
  }
  draw(t, note, { pulse = 0, dt = 0, reduced = false, idle = false, combo = 0, chorus = false, flight, gate: approach, aligned = false, history = [] } = {}) {
    if (!flight) return;
    const boost = clamp(combo / 24, 0, 1);
    this.energy += ((boost * .8 + (chorus ? .2 : 0)) - this.energy) * Math.min(1, dt * 4);
    const age = this.action ? t - this.action.time : 99;
    const hit = this.action?.result !== "miss", impact = age >= 0 ? Math.exp(-age * 7) : 0;
    const heading = (90 - flight.heading) * RAD, steering = -flight.steering;
    const craft = this.aircraft.root;
    craft.position.set(flight.x, (idle ? 1.4 : 1.9) + (reduced ? 0 : Math.sin(t * 2.1) * .045 + pulse * .035), flight.z);
    craft.scale.setScalar(idle ? (this.portrait ? 1.25 : 1.8) : this.portrait ? .95 : 1.05);
    craft.rotation.order = "YXZ";
    craft.rotation.y = -heading;
    craft.rotation.x = .025 - (reduced ? 0 : impact * .08);
    const bank = reduced ? -steering * .12 : -steering * .48 + (!hit ? impact * Math.sin(age * 34) * .12 : 0);
    craft.rotation.z += (bank - craft.rotation.z) * Math.min(1, dt * 12);
    this.aircraft.animate(t, pulse, this.energy, reduced, steering);
    this.sky.position.set(flight.x, 0, flight.z);
    const wrap = (seed, centre, size) => centre + ((seed - centre + size / 2) % size + size) % size - size / 2;
    const d = this.instanceDummy;
    this.cloudSeeds.forEach((seed, i) => {
      d.position.set(wrap(seed.x, flight.x, 280), seed.y, wrap(seed.z, flight.z, 280));
      d.scale.set(seed.r * 1.5, seed.r * .65, seed.r); d.rotation.set(0, 0, 0); d.updateMatrix(); this.clouds.setMatrixAt(i, d.matrix);
    }); this.clouds.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < 100; i++) {
      const side = i % 2 ? 1 : -1, ahead = Math.floor(i / 2) * 3.9 + 4 - flight.distance % 3.9;
      d.position.set(flight.x + Math.sin(heading) * ahead + Math.cos(heading) * side * 2.2, -.2, flight.z - Math.cos(heading) * ahead + Math.sin(heading) * side * 2.2);
      d.scale.setScalar(.55 + pulse * .15); d.rotation.set(Math.PI / 2, 0, -heading); d.updateMatrix(); this.guide.setMatrixAt(i, d.matrix);
    } this.guide.instanceMatrix.needsUpdate = true;
    this.towers.forEach((o, i) => {
      o.root.position.set(wrap(o.x, flight.x, 170), -3, wrap(o.z, flight.z, 170));
      o.ring.rotation.z = i + t * .2 + pulse * .08; o.heart.rotation.set(t * .6, t, 0); o.heart.scale.setScalar(1 + pulse * (chorus ? .35 : .12));
    });
    this.farRings.forEach((r, i) => {
      r.position.set(wrap(Math.sin(i * 2) * 100, flight.x, 360), 8 + i, wrap(-90 - i * 45, flight.z, 360));
      r.rotation.z = i * .9 + (reduced ? 0 : t * .025); r.scale.setScalar(1 + pulse * (chorus ? .018 : .006));
    });
    this.gates.forEach((gate) => { gate.root.visible = false; });
    let activeGate = null, departingGate = null;
    if (note && approach && !idle) {
      const gate = this.gates[note.id % 2];
      const goalHeading = (90 - note.degrees) * RAD;
      gate.root.visible = true; this.setGate(gate, note.degrees);
      gate.root.position.set(approach.x, 1.9, approach.z);
      gate.root.rotation.y = -goalHeading; gate.root.scale.setScalar(1);
      gate.frame.scale.setScalar(1 + (reduced ? 0 : pulse * .025));
      gate.glowMat.emissiveIntensity = .35 + pulse * .5 + (aligned ? .65 : 0);
      gate.inner.visible = gate.outer.visible = gate.pad.visible = gate.panel.visible = true;
      gate.segments.forEach((m, i) => { m.position.set(0, 0, 0); m.rotation.z = i * TAU / 12; m.scale.setScalar(1); });
      activeGate = { note: note.id, ...approach, aligned };
    }
    if (this.action && age >= 0 && age < (hit ? .6 : GATE_PASS_TIME)) {
      const gate = this.gates[this.action.note % 2];
      const passed = gateDeparture(this.action, age);
      gate.root.visible = true; this.setGate(gate, this.action.degrees);
      gate.root.position.set(passed.x, 1.9, passed.z); gate.root.rotation.y = (this.action.heading - 90) * RAD;
      gate.root.scale.setScalar(hit ? Math.max(.01, 1 - ease(age / .6)) : 1);
      gate.inner.visible = gate.outer.visible = gate.pad.visible = gate.panel.visible = !hit;
      gate.glowMat.emissiveIntensity = hit ? 1 + impact : .16;
      gate.segments.forEach((m, i) => {
        const a = i * TAU / 12;
        m.position.set(hit ? Math.cos(a) * age * 5 : 0, hit ? Math.sin(a) * age * 5 : 0, 0);
        m.rotation.z = a + (hit ? age : 0); m.scale.setScalar(hit ? Math.max(.02, 1 - age) : 1);
      });
      departingGate = { ...passed, age, intact: !hit };
    }
    const points = history.slice(-140);
    const tip = new THREE.Vector3();
    for (const trail of this.trails) {
      const port = ENGINE_PORTS[trail.side < 0 ? 0 : 1];
      tip.copy(port).applyEuler(craft.rotation).multiplyScalar(craft.scale.x).add(craft.position);
      for (let i = 0; i < 90; i++) {
        // Interpolate history instead of repeating the same vertex dozens of times
        // while the trail is young. Those zero-area ribbons made the artifact frequent.
        const u = i / 89, at = (1 - u) * Math.max(0, points.length - 1), index = Math.floor(at), mix = at - index;
        const p = points[index] ?? flight, q = points[Math.min(index + 1, points.length - 1)] ?? p;
        const a = (90 - p.heading - (q.heading - p.heading) * mix) * RAD, width = (.095 + this.energy * .1) * (1 - u * .5);
        const x = i ? p.x + (q.x - p.x) * mix + (Math.cos(a) * port.x - Math.sin(a) * port.z) * craft.scale.x : tip.x;
        const z = i ? p.z + (q.z - p.z) * mix + (Math.sin(a) * port.x + Math.cos(a) * port.z) * craft.scale.x : tip.z;
        const y = i ? (idle ? 1.4 : 1.9) + port.y * craft.scale.x : tip.y;
        trail.position.set([x - Math.cos(a) * width, y, z - Math.sin(a) * width, x + Math.cos(a) * width, y, z + Math.sin(a) * width], i * 6);
      }
      trail.mesh.geometry.attributes.position.needsUpdate = true; trail.mesh.material.uniforms.power.value = reduced ? .28 : .6 + this.energy * .25;
    }
    const origin = this.action ?? { x: flight.x, z: flight.z, heading: flight.heading };
    this.shocks.forEach((m, i) => {
      const a = age - i * .06; m.visible = !reduced && a >= 0 && a < .75;
      if (!m.visible) return;
      m.position.set(origin.x, 1.9, origin.z); m.rotation.y = (origin.heading - 90) * RAD;
      m.scale.setScalar(hit ? 1.8 + ease(a / .75) * 5 : 2.3 * (1 - a / .75));
      m.material.color.set(hit ? "#aaffdc" : "#ff7f86"); m.material.opacity = (1 - a / .75) * .8;
    });
    this.sparkMesh.count = !reduced && age >= 0 && age < .8 ? 56 : 0;
    for (let i = 0; i < this.sparkMesh.count; i++) {
      const a = hash(i * 3) * TAU, v = 3 + hash(i * 17) * 7;
      this.sparkDummy.position.set(origin.x + Math.cos(a) * age * v, 1.9 + Math.sin(a) * age * v - age * age * 5, origin.z + (hash(i * 7) - .5) * age * 10);
      this.sparkDummy.scale.setScalar((1 - age / .8) * (hit ? 1.2 : .6)); this.sparkDummy.updateMatrix(); this.sparkMesh.setMatrixAt(i, this.sparkDummy.matrix);
    } this.sparkMesh.instanceMatrix.needsUpdate = true;
    this.flash.position.set(origin.x, 3, origin.z); this.flash.intensity = reduced ? 0 : impact * (hit ? 6 : 3);
    this.cameraHeading ??= heading;
    const rotation = Math.atan2(Math.sin(heading - this.cameraHeading), Math.cos(heading - this.cameraHeading));
    this.cameraHeading += rotation * (reduced ? 1 : Math.min(1, dt * 8));
    // Show the aircraft from its front quarter on the cover; launch orbits to the tail.
    this.viewAngle += ((idle ? Math.PI : 0) - this.viewAngle) * (reduced ? 1 : Math.min(1, dt * 4));
    const lobby = this.viewAngle / Math.PI;
    const h = this.cameraHeading + this.viewAngle;
    const targetDistance = idle ? (this.portrait ? 12.8 * Math.max(1, .47 / this.camera.aspect) : 10.3) : (this.portrait ? 17 : 12.5) - this.energy * 1.1;
    this.cameraDistance ??= targetDistance;
    this.cameraDistance += (targetDistance - this.cameraDistance) * (reduced ? 1 : Math.min(1, dt * 5));
    const behind = this.cameraDistance, side = (this.portrait ? 2.8 : 4.5) * lobby;
    const cam = new THREE.Vector3(flight.x - Math.sin(h) * behind + Math.cos(h) * side, 5 + lobby * 1.15 - this.energy * .6, flight.z + Math.cos(h) * behind + Math.sin(h) * side);
    const ahead = 6 - lobby * 6.5;
    const aim = new THREE.Vector3(flight.x + Math.sin(heading) * ahead, 2.6 + lobby * (this.portrait ? .1 : .35), flight.z - Math.cos(heading) * ahead);
    // Follow position immediately so a tight turn cannot leave the aircraft outside the frame.
    this.camera.position.copy(cam); this.camera.lookAt(aim);
    if (!idle && !reduced) this.camera.rotateZ(-steering * .075);
    const fov = (idle ? 48 : this.portrait ? 65 : 57) + (reduced ? 0 : this.energy * 10 + impact * 2);
    this.camera.fov += (fov - this.camera.fov) * (reduced ? 1 : Math.min(1, dt * 6)); this.camera.updateProjectionMatrix();
    this.post.uniforms.rush.value = !idle && !reduced ? this.energy : 0; this.post.uniforms.hit.value = !reduced && hit ? impact : 0; this.post.uniforms.miss.value = !reduced && !hit ? impact : 0; this.post.uniforms.time.value = t;
    this.bloom.strength = reduced ? .15 : .2 + pulse * .04 + (hit ? impact * .12 : 0);
    const checkOptions = this.frameChecks[0]?.options ?? {};
    this.trails.forEach((trail) => { trail.mesh.visible = points.length > 1 && !checkOptions.withoutTrails; });
    this.bloom.enabled = !checkOptions.withoutBloom;
    this.post.enabled = !checkOptions.withoutPost;
    this.renderer.info.reset(); this.composer.render();
    this.last = { target: note?.degrees, turn: flight.heading, heading: flight.heading, steering, energy: this.energy, speed: flight.speed, cameraFov: this.camera.fov, aircraftX: flight.x, aircraftZ: flight.z, activeGate, departingGate, lastAction: this.action ? { ...this.action, age } : null, drawCalls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles, contextLost: this.renderer.getContext().isContextLost() };
    if (this.frameChecks.length) {
      const gl = this.renderer.getContext(), pixel = new Uint8Array(4), samples = [];
      for (const [x, y] of [[.1, .15], [.5, .15], [.9, .15], [.1, .8], [.5, .8], [.9, .8]]) {
        gl.readPixels(Math.floor(gl.drawingBufferWidth * x), Math.floor(gl.drawingBufferHeight * y), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        samples.push([...pixel]);
      }
      const check = { t, heading: flight.heading, options: checkOptions, lost: gl.isContextLost(), error: gl.getError(), black: samples.every((p) => Math.max(...p.slice(0, 3)) < 8), samples };
      this.frameChecks.splice(0).forEach(({ resolve }) => resolve(check));
    }
  }
  inspectFrame(options = {}) { return new Promise((resolve) => this.frameChecks.push({ resolve, options })); }
  aircraftBounds() {
    this.aircraft.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.aircraft.root);
    let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
    const point = new THREE.Vector3();
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      point.set(x, y, z).project(this.camera);
      const px = (point.x * .5 + .5) * this.w, py = (.5 - point.y * .5) * this.h;
      left = Math.min(left, px); right = Math.max(right, px); top = Math.min(top, py); bottom = Math.max(bottom, py);
    }
    return { left, right, top, bottom, width: this.w, height: this.h };
  }
  destroy() {
    this.ro.disconnect();
    this.frameChecks.splice(0).forEach(({ resolve }) => resolve({ destroyed: true }));
    this.geometries.forEach((g) => g.dispose()); this.materials.forEach((m) => m.dispose()); this.textures.forEach((t) => t.dispose());
    this.clouds.dispose(); this.guide.dispose(); this.sparkMesh.dispose();
    this.composer.passes.forEach((p) => p.dispose?.()); this.composer.dispose(); this.environment.dispose();
    this.renderer.dispose(); this.renderer.forceContextLoss(); this.renderer.domElement.remove();
  }
}
