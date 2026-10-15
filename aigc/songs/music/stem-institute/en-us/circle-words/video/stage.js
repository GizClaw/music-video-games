import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { hash } from "@gizclaw/mvg-core/timing.js";

// The ballroom around the circle: velvet drapes and a swagged valance, a
// panelled wall with sconces, a herringbone floor whose horizon is screen row
// 1229, a crystal chandelier in the top chrome and two follow spots.
export const BALLROOM = /* glsl */ `
  uniform float uTime, uKick, uSpin, uWarm; varying vec2 vUv;
  float h21(vec2 p) { return fract(sin(dot(p, vec2(27.1, 113.7))) * 43758.5453); }
  float blob(vec2 p, vec2 c, float r) { vec2 d = (p - c) * vec2(0.5625, 1.0); return exp(-dot(d, d) / (r * r)); }
  vec3 velvet(float x, float y, float freq) {
    float f = 0.5 + 0.5 * sin(x * freq + sin(y * 5.0 + x * 9.0) * 1.6);
    float g = 0.5 + 0.5 * sin(x * freq * 2.3 + 1.3);
    float shade = pow(f, 1.6) * 0.8 + g * 0.2;
    return vec3(0.42, 0.025, 0.06) * (0.18 + 0.95 * shade) + vec3(0.9, 0.3, 0.35) * pow(f, 14.0) * 0.25;
  }
  void main() {
    vec2 uv = vUv;
    float hz = 0.36;
    // Panelled wall: deep plum, gold mouldings, two warm sconces.
    vec3 col = mix(vec3(0.05, 0.02, 0.06), vec3(0.11, 0.05, 0.12), smoothstep(hz, 0.85, uv.y));
    vec2 pnl = vec2(abs(uv.x - 0.5), uv.y);
    float frameA = step(abs(pnl.x - 0.23), 0.075) * step(abs(pnl.y - 0.6), 0.2);
    float inner = step(abs(pnl.x - 0.23), 0.065) * step(abs(pnl.y - 0.6), 0.19);
    col += vec3(0.5, 0.36, 0.15) * (frameA - inner) * 0.14;
    col += vec3(0.5, 0.36, 0.15) * smoothstep(0.004, 0.0, abs(uv.y - (hz + 0.075))) * 0.4;
    for (int i = 0; i < 2; i++) {
      vec2 sc = vec2(i == 0 ? 0.27 : 0.73, 0.83);
      col += vec3(1.0, 0.65, 0.3) * (blob(uv, sc, 0.08) * 0.35 + blob(uv, sc, 0.012) * 2.0) * (0.8 + 0.2 * sin(uTime * 7.0 + float(i) * 2.0));
    }
    col += mix(vec3(0.3, 0.2, 0.5), vec3(0.7, 0.45, 0.2), uWarm) * blob(uv, vec2(0.5, 0.57), 0.3) * (0.22 + uKick * 0.1);

    // Herringbone floor with a polished sheen.
    if (uv.y < hz) {
      float d = hz - uv.y;
      vec2 fp = vec2((uv.x - 0.5) / (d + 0.035), 1.0 / (d + 0.035));
      vec2 q = fp * vec2(2.2, 0.55);
      float row = floor(q.y);
      float dir = mod(row, 2.0) * 2.0 - 1.0;
      float along = q.x + dir * fract(q.y);
      float board = floor(along);
      float seam = smoothstep(0.0, 0.04, fract(along)) * smoothstep(0.0, 0.06, fract(q.y)) * smoothstep(1.0, 0.94, fract(q.y));
      vec3 wood = mix(vec3(0.2, 0.09, 0.04), vec3(0.34, 0.17, 0.07), h21(vec2(board, row))) * (0.55 + 0.45 * seam);
      float fade = smoothstep(0.0, 0.012, d);
      col = mix(col, wood, fade);
      col += vec3(1.0, 0.75, 0.5) * exp(-abs(uv.x - 0.5) * 10.0) * exp(-d * 10.0) * 0.18;
      col += vec3(1.0, 0.85, 0.6) * blob(uv, vec2(0.5, 0.3), 0.12) * 0.35 * (1.0 + uKick * 0.4);
      col *= 1.0 - smoothstep(0.08, 0.36, d) * 0.65;
    }

    // Side drapes, tied back with gold rope and edged with fringe.
    for (int s = 0; s < 2; s++) {
      float x = s == 0 ? uv.x : 1.0 - uv.x;
      float tie = 0.47;
      float edge = 0.105 + 0.08 * smoothstep(tie, 0.95, uv.y) + 0.035 * smoothstep(tie, hz - 0.02, uv.y);
      float inDrape = smoothstep(edge + 0.002, edge - 0.002, x) * step(hz - 0.02, uv.y);
      vec3 v = velvet(x / edge, uv.y, 26.0);
      float fringe = smoothstep(0.012, 0.004, abs(x - edge + 0.006)) * step(hz - 0.02, uv.y);
      vec3 gold = vec3(0.85, 0.6, 0.22) * (0.6 + 0.4 * step(0.5, fract(uv.y * 160.0)));
      col = mix(col, v, inDrape);
      col = mix(col, gold, fringe * 0.9);
      float rope = smoothstep(0.012, 0.0, abs(uv.y - tie)) * step(x, edge + 0.01);
      col = mix(col, vec3(0.95, 0.7, 0.3), rope);
    }
    // Swagged valance along the top with gold trim and tassels.
    float scal = abs(sin(uv.x * 3.14159 * 4.0));
    float top = 0.935 - 0.03 * scal;
    if (uv.y > top) {
      vec3 v = velvet(uv.x * 1.3, uv.y * 3.0, 40.0);
      v *= 0.65 + 0.35 * smoothstep(top, 1.0, uv.y);
      col = v;
    }
    col = mix(col, vec3(0.9, 0.65, 0.25), smoothstep(0.004, 0.0, abs(uv.y - top)) * 0.9);
    float tassel = smoothstep(0.01, 0.0, abs(fract(uv.x * 4.0 + 0.5) - 0.5) * 0.25) * step(top - 0.025, uv.y) * step(uv.y, top) * step(scal, 0.08);
    col = mix(col, vec3(0.95, 0.7, 0.3), tassel);

    // Output is sRGB-encoded afterwards, which lifts these darks a lot; keep them low.
    gl_FragColor = vec4(col * 0.45, 1.0);
  }`;

export class Stage {
  constructor(scene, renderer) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.8;
    this.light = new THREE.PointLight("#ffd9a0", 2.5, 3, 1.5);
    scene.add(this.light, new THREE.AmbientLight("#ffffff", 0.3));

    // Chandelier: a brass stem, three tiers of crystal drops and candle bulbs.
    this.chandelier = new THREE.Group();
    this.chandelier.position.set(0, (960 - 150) / 320, -0.6);
    scene.add(this.chandelier);
    const brass = new THREE.MeshStandardMaterial({ color: "#c8a050", metalness: 0.9, roughness: 0.25 });
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.8, 8), brass);
    stem.position.y = 0.4;
    this.chandelier.add(stem);
    const tiers = [[0.18, 0.05, 10], [0.36, -0.06, 16], [0.54, -0.16, 22]];
    const count = tiers.reduce((a, [, , n]) => a + n, 0);
    this.crystals = new THREE.InstancedMesh(
      new THREE.OctahedronGeometry(0.022, 0).scale(1, 1.8, 1),
      new THREE.MeshStandardMaterial({ color: "#ffffff", metalness: 0.1, roughness: 0.05, emissive: "#ffffff", emissiveIntensity: 0.08 }),
      count * 2,
    );
    this.crystals.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 2 * 3), 3);
    const d = new THREE.Object3D();
    let i = 0;
    this.bulbs = [];
    for (const [r, y, n] of tiers) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.008, 6, 64).rotateX(Math.PI / 2), brass);
      ring.position.y = y;
      this.chandelier.add(ring);
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        for (const drop of [0, 1]) {
          d.position.set(Math.cos(a) * r, y - 0.05 - drop * 0.06, Math.sin(a) * r);
          d.scale.setScalar(drop ? 0.7 : 1);
          d.updateMatrix();
          this.crystals.setMatrixAt(i++, d.matrix);
        }
        if (k % 3 === 0) {
          const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 8), new THREE.MeshBasicMaterial({ color: "#ffe2a8" }));
          bulb.position.set(Math.cos(a) * r, y + 0.04, Math.sin(a) * r);
          this.chandelier.add(bulb);
          this.bulbs.push(bulb);
        }
      }
    }
    this.chandelier.add(this.crystals);

    // Two warm follow spots from the upper corners onto the circle.
    const beamGeo = new THREE.ConeGeometry(0.75, 4.2, 40, 1, true).translate(0, -2.1, 0);
    this.spots = [-1, 1].map((s) => {
      const m = new THREE.Mesh(
        beamGeo,
        new THREE.ShaderMaterial({
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
          uniforms: { uOpacity: { value: 0.1 } },
          vertexShader: "varying float vY; varying vec3 vN; varying vec3 vV; void main(){ vY = -position.y / 4.2; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }",
          fragmentShader: "uniform float uOpacity; varying float vY; varying vec3 vN; varying vec3 vV; void main(){ float edge = pow(abs(dot(vN, vV)), 1.5); gl_FragColor = vec4(vec3(1.0, 0.82, 0.55) * edge * (1.0 - vY * 0.7) * uOpacity, 1.0); }",
        }),
      );
      m.position.set(s * 1.75, 3.6, -0.8);
      m.lookAt(new THREE.Vector3(0, -0.6, -0.8));
      m.rotateX(-Math.PI / 2);
      scene.add(m);
      return m;
    });
  }

  update(t, kick, warm) {
    this.chandelier.rotation.y = t * 0.08;
    this.chandelier.rotation.z = Math.sin(t * 0.5) * 0.01;
    const c = new THREE.Color();
    const n = this.crystals.count;
    for (let i = 0; i < n; i++) {
      const tw = Math.pow(0.5 + 0.5 * Math.sin(t * (2 + hash(i) * 3) + i * 1.7), 8);
      this.crystals.setColorAt(i, c.setRGB(1, 0.95, 0.85).multiplyScalar(0.45 + tw * 1.4));
    }
    this.crystals.instanceColor.needsUpdate = true;
    for (const b of this.bulbs) b.material.color.set("#ffe2a8").multiplyScalar(1 + kick * 0.5);
    this.light.position.copy(this.chandelier.position).add(new THREE.Vector3(0, -0.1, 0.6));
    for (const s of this.spots) s.material.uniforms.uOpacity.value = (0.07 + warm * 0.05) * (1 + kick * 0.6);
  }
}
