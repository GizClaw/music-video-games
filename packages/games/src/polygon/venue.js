import * as THREE from "three";
import { clamp, hash } from "@gizclaw/mvg-core/timing.js";

const FLOOR = -1.35;
/** A ten-sided LED drum hung over the centre of the stage. */
const DRUM = { sides: 10, radius: 3.4, height: 2.8, y: 8.6 };
const TRUSS = { radius: 10.6, y: 9.4, segments: 30 };
const HEADS = 12;
const LASERS = 12;
const BAND = { radius: 36, height: 9 };

// LED panels: a polygon tunnel in the active performer's side count, its
// outline and an equaliser (mode 0), or scrolling chevrons (mode 1), on an
// LED dot grid.
const ledShader = `
  varying vec2 vUv;
  uniform float uTime, uBeat, uPulse, uSides, uHit, uChorus, uAspect, uMode, uDots;
  uniform vec3 uPrimary, uSecondary, uAccent;
  float hash1(float n) { return fract(sin(n * 91.345) * 47453.5453); }
  float polyR(vec2 p, float n) {
    float seg = 6.2831853 / n;
    float a = atan(p.x, -p.y);
    float k = mod(a + seg * .5, seg) - seg * .5;
    return length(p) * cos(k);
  }
  float lineAt(float x, float w) { float d = abs(fract(x) - .5); return smoothstep(.5 - w, .5, d); }
  void main() {
    vec3 c = vec3(.012, .004, .024);
    if (uMode < .5) {
      vec2 p = (vUv - vec2(.5, .52)) * vec2(uAspect, 1.);
      float r = max(polyR(p, uSides), .001);
      float x = log(r) * 1.9 - uTime * .35 - uBeat * .5;
      c += mix(uPrimary, uSecondary, step(.5, fract(x * .5))) * lineAt(x, .1) * smoothstep(.03, .2, r) * (.45 + uPulse * .6 + uChorus * .15);
      c += uAccent * (1. - smoothstep(.0, .02, abs(r - .3))) * (1.2 + uHit * 1.8);
      float col = floor(vUv.x * 24.);
      float h = (.05 + hash1(col * 3.7 + floor(uBeat * 2.)) * .2) * (.45 + uPulse * .9);
      c += mix(uSecondary, uAccent, vUv.y / .3) * step(vUv.y, h) * step(.2, fract(vUv.x * 24.)) * .5;
    } else {
      float chev = lineAt(vUv.y * 4. - abs(fract(vUv.x * 18.) - .5) * 1.6 - uTime * .9 - uBeat * .25, .14);
      c += mix(uPrimary, uSecondary, vUv.y) * chev * (.22 + uPulse * .35);
    }
    c += uAccent * uPulse * uChorus * .05 + uAccent * uHit * .05;
    vec2 cell = fract(vUv * uDots) - .5;
    c *= (.3 + .7 * smoothstep(.5, .28, length(cell))) * .6;
    gl_FragColor = vec4(c, 1.);
  }`;

// A light cone in haze: brightest at the lens, soft at its silhouette, and
// thinned away close to the camera so it never washes out the frame.
const beamVertex = `
  varying float vAlong; varying float vDepth; varying vec3 vN; varying vec3 vV;
  void main() {
    vAlong = uv.y;
    vec4 mv = modelViewMatrix * vec4(position, 1.);
    vN = normalize(normalMatrix * normal);
    vV = normalize(-mv.xyz);
    vDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }`;
const beamFragment = `
  varying float vAlong; varying float vDepth; varying vec3 vN; varying vec3 vV;
  uniform vec3 uColor; uniform float uIntensity;
  void main() {
    float facing = pow(abs(dot(vN, vV)), 2.2);
    float fall = pow(vAlong, 1.4) * smoothstep(0., .25, vAlong);
    float near = smoothstep(3., 10., vDepth);
    gl_FragColor = vec4(uColor * facing * fall * near * uIntensity, 1.);
  }`;

/**
 * An arena in the round: the crowd all the way round the stage, a ring of
 * truss with moving heads, an LED drum hung over the centre, an LED band
 * round the far walls, and lasers fanning out from the drum.
 */
export function createVenue(scene) {
  const group = new THREE.Group();
  group.name = "polygon-party-venue";
  scene.add(group);
  const screens = [];
  const ledMaterial = (mode, aspect, dots, side = THREE.FrontSide) => {
    const uniforms = {
      uTime: { value: 0 }, uBeat: { value: 0 }, uPulse: { value: 0 }, uSides: { value: 3 }, uHit: { value: 0 }, uChorus: { value: 0 },
      uAspect: { value: aspect }, uMode: { value: mode }, uDots: { value: new THREE.Vector2(...dots) },
      uPrimary: { value: new THREE.Color() }, uSecondary: { value: new THREE.Color() }, uAccent: { value: new THREE.Color() },
    };
    screens.push(uniforms);
    return new THREE.ShaderMaterial({ uniforms, side, vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }", fragmentShader: ledShader });
  };
  // Each face of the drum is its own panel, facing outward like the performers below it.
  const panelWidth = 2 * DRUM.radius * Math.tan(Math.PI / DRUM.sides);
  const panelMaterial = ledMaterial(0, panelWidth / DRUM.height, [64, 80]);
  const panelGeometry = new THREE.PlaneGeometry(panelWidth, DRUM.height);
  for (let k = 0; k < DRUM.sides; k++) {
    const a = (k / DRUM.sides) * Math.PI * 2;
    const panel = new THREE.Mesh(panelGeometry, panelMaterial);
    panel.position.set(Math.sin(a) * DRUM.radius, DRUM.y, Math.cos(a) * DRUM.radius);
    panel.rotation.y = a;
    group.add(panel);
  }
  const drumCap = new THREE.Mesh(new THREE.CylinderGeometry(DRUM.radius * 1.03, DRUM.radius * 1.03, 0.12, DRUM.sides), new THREE.MeshBasicMaterial({ color: "#ff489f" }));
  for (const y of [DRUM.y - DRUM.height / 2, DRUM.y + DRUM.height / 2]) {
    const cap = drumCap.clone();
    cap.position.y = y;
    group.add(cap);
  }
  const band = new THREE.Mesh(new THREE.CylinderGeometry(BAND.radius, BAND.radius, BAND.height, 96, 1, true), ledMaterial(1, 1, [720, 40], THREE.BackSide));
  band.position.y = FLOOR + BAND.height / 2 + 2;
  group.add(band);

  // Truss: a ring of two chords with diagonals, hung over the stage on cables.
  const metal = new THREE.MeshStandardMaterial({ color: "#4a4258", metalness: 0.8, roughness: 0.35 });
  const struts = [];
  const strut = (a, b, r = 0.045) => struts.push([a, b, r]);
  const ringPoint = (k, y) => {
    const a = (k / TRUSS.segments) * Math.PI * 2;
    return new THREE.Vector3(Math.sin(a) * TRUSS.radius, y, Math.cos(a) * TRUSS.radius);
  };
  for (let k = 0; k < TRUSS.segments; k++) {
    for (const y of [TRUSS.y, TRUSS.y + 0.7]) strut(ringPoint(k, y), ringPoint(k + 1, y), 0.06);
    strut(ringPoint(k, TRUSS.y), ringPoint(k + 1, TRUSS.y + 0.7));
    if (k % 5 === 0) strut(ringPoint(k, TRUSS.y + 0.7), ringPoint(k, TRUSS.y + 14), 0.015);
  }
  const strutGeometry = new THREE.CylinderGeometry(1, 1, 1, 6).translate(0, 0.5, 0);
  const trussMesh = new THREE.InstancedMesh(strutGeometry, metal, struts.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3();
  struts.forEach(([a, b, r], i) => {
    dir.subVectors(b, a);
    q.setFromUnitVectors(up, dir.clone().normalize());
    trussMesh.setMatrixAt(i, m.compose(a, q, sc.set(r, dir.length(), r)));
  });
  group.add(trussMesh);

  // Moving heads hang under the ring; each casts a cone through the haze.
  const beamGeometry = new THREE.CylinderGeometry(0.1, 2.4, 17, 28, 1, true).translate(0, -8.5, 0);
  const fixtureGeometry = new THREE.CylinderGeometry(0.28, 0.34, 0.6, 12);
  const lensGeometry = new THREE.CircleGeometry(0.22, 16);
  const down = new THREE.Vector3(0, -1, 0), zAxis = new THREE.Vector3(0, 0, 1);
  const heads = Array.from({ length: HEADS }, (_, i) => {
    const angle = ((i + 0.5) / HEADS) * Math.PI * 2;
    const origin = new THREE.Vector3(Math.sin(angle) * TRUSS.radius, TRUSS.y - 0.3, Math.cos(angle) * TRUSS.radius);
    const body = new THREE.Mesh(fixtureGeometry, metal);
    body.position.copy(origin);
    const uniforms = { uColor: { value: new THREE.Color("#ffffff") }, uIntensity: { value: 0 } };
    const beam = new THREE.Mesh(beamGeometry, new THREE.ShaderMaterial({ uniforms, vertexShader: beamVertex, fragmentShader: beamFragment, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    beam.position.copy(origin);
    beam.renderOrder = 5;
    const lens = new THREE.Mesh(lensGeometry, new THREE.MeshBasicMaterial({ color: "#ffffff" }));
    group.add(body, beam, lens);
    return { angle, origin, body, beam, uniforms, lens, aim: new THREE.Vector3(origin.x * 0.5, FLOOR, origin.z * 0.5) };
  });

  // Lasers fan out from under the drum, turning with the music in the choruses.
  const laserGeometry = new THREE.BoxGeometry(0.035, 0.035, 46).translate(0, 0, 23);
  const lasers = Array.from({ length: LASERS }, () => {
    const mesh = new THREE.Mesh(laserGeometry, new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    mesh.position.set(0, DRUM.y - DRUM.height / 2 - 0.2, 0);
    mesh.rotation.order = "YXZ";
    group.add(mesh);
    return mesh;
  });

  // The crowd stands all the way round, light sticks waving on the beat.
  const fans = [];
  for (let r = 12; r < 23; r += 1.1) {
    const count = Math.floor((Math.PI * 2 * r) / 1.1);
    for (let k = 0; k < count; k++) {
      const n = fans.length;
      const a = ((k + hash(n * 1.3) * 0.6) / count) * Math.PI * 2;
      const rr = r + (hash(n * 2.1) - 0.5) * 0.4;
      fans.push({ x: Math.sin(a) * rr, z: Math.cos(a) * rr, a, h: (hash(n * 3.7) - 0.5) * 0.25, phase: hash(n * 5.3) * 6.283, stick: hash(n * 7.9) < 0.7 });
    }
  }
  const silhouette = new THREE.MeshBasicMaterial({ color: "#07030f" });
  const headMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.26, 10, 8), silhouette, fans.length);
  const bodyMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.5, 10, 8), silhouette, fans.length);
  const sticks = fans.filter((f) => f.stick);
  const stickMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.022, 0.022, 0.5, 6).translate(0, 0.25, 0), new THREE.MeshBasicMaterial({ color: "#ffffff" }), sticks.length);
  for (const mesh of [headMesh, bodyMesh, stickMesh]) {
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    group.add(mesh);
  }
  stickMesh.setColorAt(0, new THREE.Color());
  stickMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);

  const tmpColor = new THREE.Color(), white = new THREE.Color("#fff3e0"), e = new THREE.Euler(), pos = new THREE.Vector3(), desired = new THREE.Vector3();
  const angleTo = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  let lastT = 0;
  return {
    /**
     * `subject` is the active performer's world position, `eye` the camera,
     * `cueAt` when the camera last turned to the subject, `hit` a 0..1 flash
     * from the latest hit.
     */
    update(t, { beat = 0, pulse = 0, sides = 3, primary, secondary, accent, subject, eye, look, cueAt = -100, hit = 0, chorus = 0, finale = 0, motion = 1 }) {
      const dt = clamp(t - lastT, 0, 0.1);
      lastT = t;
      for (const u of screens) {
        u.uTime.value = t * motion;
        u.uBeat.value = beat * motion;
        u.uPulse.value = pulse;
        u.uSides.value = sides;
        u.uHit.value = hit;
        u.uChorus.value = chorus;
        u.uPrimary.value.copy(primary);
        u.uSecondary.value.copy(secondary);
        u.uAccent.value.copy(accent);
      }
      // Beams sweep the ring, converge on a new subject for a beat, and the
      // three heads nearest it stay on it as follow spots.
      const subjectAngle = Math.atan2(subject.x, subject.z);
      const converge = Math.exp(-Math.max(0, t - cueAt) / 0.7);
      const order = heads.map((h, i) => [angleTo(h.angle, subjectAngle), i]).sort((a, b) => a[0] - b[0]).slice(0, 3).map(([, i]) => i);
      const spin = t * (chorus ? 0.9 : 0.35) * motion + (chorus ? Math.sin(beat * Math.PI * 0.5) * 0.4 : 0);
      heads.forEach((h, i) => {
        const follow = order.includes(i);
        const a = h.angle + spin + Math.sin(t * 0.5 * motion + i) * 0.5;
        const reach = 9 + Math.sin(t * 0.4 * motion + i * 1.7) * 7;
        desired.set(Math.sin(a) * reach, FLOOR, Math.cos(a) * reach);
        desired.lerp(pos.set(subject.x, subject.y - 1.4, subject.z), follow ? 0.94 : converge * 0.85);
        h.aim.lerp(desired, 1 - Math.exp(-dt * (follow ? 7 : 3)));
        dir.subVectors(h.aim, h.origin).normalize();
        h.beam.quaternion.setFromUnitVectors(down, dir);
        h.body.quaternion.copy(h.beam.quaternion);
        h.lens.position.copy(h.origin).addScaledVector(dir, 0.32);
        h.lens.quaternion.setFromUnitVectors(zAxis, dir);
        tmpColor.copy(follow ? white : i % 2 ? primary : secondary);
        if (!follow && finale) tmpColor.lerp(accent, 0.5);
        const strobe = chorus ? 0.55 + pulse * 0.75 : 0.85 + pulse * 0.2;
        h.uniforms.uColor.value.copy(tmpColor);
        h.uniforms.uIntensity.value = (follow ? 0.2 + hit * 0.22 : 0.12 + converge * 0.1) * strobe;
        h.lens.material.color.copy(tmpColor).multiplyScalar(1.5 + pulse);
      });
      const laserOn = Math.max(chorus, finale);
      lasers.forEach((l, i) => {
        l.visible = laserOn > 0.01;
        if (!l.visible) return;
        l.rotation.set(0.32 + 0.1 * Math.sin(beat * Math.PI * 0.5 * motion + i * 0.7), (i / LASERS) * Math.PI * 2 + t * 0.6 * motion, 0);
        l.material.color.copy(i % 2 ? primary : accent).multiplyScalar((0.9 + pulse * 1.2) * laserOn);
      });
      // Light sticks wave together on the beat; the crowd jumps in the choruses.
      // Fans at the lens, or between it and the stage close enough to fill
      // the frame with silhouette, step out of the shot.
      const jump = (0.03 + chorus * 0.1 + finale * 0.08) * motion;
      const fx = look ? look.x : 0, fz = look ? look.z : 0, fl = Math.hypot(fx, fz) || 1;
      const reach = eye ? Math.max(7.5, (Math.hypot(eye.x, eye.z) - 12) * 0.7) : 0;
      const near = (f) => {
        if (!eye) return 1;
        const dx = f.x - eye.x, dz = f.z - eye.z, d = Math.hypot(dx, dz);
        if (d < 3.2) return 0;
        return d < reach && (dx * fx + dz * fz) / (d * fl) > 0.45 ? 0 : 1;
      };
      fans.forEach((f, i) => {
        const bounce = Math.abs(Math.sin(Math.PI * beat + f.phase * 0.15)) * jump;
        const k = near(f);
        headMesh.setMatrixAt(i, m.compose(pos.set(f.x, 0.1 + f.h + bounce, f.z), q.identity(), sc.set(k, 1.1 * k, k)));
        bodyMesh.setMatrixAt(i, m.compose(pos.set(f.x, -0.62 + f.h + bounce, f.z), q.setFromAxisAngle(up, f.a), sc.set(k, 1.45 * k, 0.7 * k)));
      });
      sticks.forEach((f, i) => {
        const bounce = Math.abs(Math.sin(Math.PI * beat + f.phase * 0.15)) * jump;
        const wave = Math.sin(Math.PI * beat + f.a * (chorus ? 3 : 1) + f.phase * (chorus ? 0.1 : 0.6)) * 0.55 * motion;
        q.setFromEuler(e.set(0, f.a, wave, "YXZ"));
        stickMesh.setMatrixAt(i, m.compose(pos.set(f.x, 0.35 + f.h + bounce, f.z), q, sc.setScalar(near(f))));
        stickMesh.setColorAt(i, tmpColor.copy(i % 3 === 0 ? accent : i % 2 ? primary : secondary).multiplyScalar(1.3 + pulse * 0.9));
      });
      for (const mesh of [headMesh, bodyMesh, stickMesh]) mesh.instanceMatrix.needsUpdate = true;
      stickMesh.instanceColor.needsUpdate = true;
    },
    diagnostics() {
      return { screens: screens.length, beams: heads.map((h) => ({ origin: h.origin.toArray(), aim: h.aim.toArray(), intensity: h.uniforms.uIntensity.value })), lasers: lasers.filter((l) => l.visible).length, fans: fans.length, sticks: sticks.length };
    },
  };
}
