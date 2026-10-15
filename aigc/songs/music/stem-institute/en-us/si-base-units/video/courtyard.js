import * as THREE from "three";

// A castle courtyard in daylight. One unit is about half a toy soldier; the
// ground is y = 0 and the curtain wall stands at z = WALL_Z.
const WALL_Z = -16;

const NOISE = /* glsl */ `
  float h21(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
  float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
  float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }`;

const WALL = /* glsl */ `
  uniform float uTime; varying vec2 vP;
  ${NOISE}
  vec3 stone(vec2 p, float scale) {
    vec2 q = p / vec2(1.3, 0.62) * scale;
    q.x += mod(floor(q.y), 2.0) * 0.5;
    vec2 id = floor(q), f = fract(q);
    float mortar = 1.0 - smoothstep(0.0, 0.06, min(min(f.x, 1.0 - f.x) * 1.3, min(f.y, 1.0 - f.y)));
    vec3 c = mix(vec3(0.84, 0.7, 0.52), vec3(0.7, 0.6, 0.5), h21(id)) * (0.86 + 0.14 * noise(p * 6.0));
    return mix(c, vec3(0.45, 0.38, 0.32), mortar);
  }
  void main() {
    vec2 p = vP;
    float k = clamp(p.y / 30.0, 0.0, 1.0);
    vec3 col = mix(vec3(0.55, 0.78, 1.0), vec3(0.12, 0.36, 0.9), smoothstep(0.25, 0.85, k));
    vec2 sp = p - vec2(17.0, 22.0);
    col += vec3(1.0, 0.92, 0.75) * (exp(-length(sp) * 0.35) * 0.5 + smoothstep(1.4, 1.2, length(sp)) * 0.6);
    float cl = smoothstep(0.42, 0.72, fbm(vec2(p.x * 0.16 + uTime * 0.02, p.y * 0.42)));
    col = mix(col, vec3(1.0, 0.99, 0.97) * (0.9 + 0.1 * smoothstep(8.0, 12.0, p.y)), cl * smoothstep(7.6, 9.5, p.y) * 0.9);
    // Curtain wall with merlons, two round towers with slate cones and flags.
    float merlon = step(fract(p.x / 1.5), 0.55);
    float wallTop = 7.0 + 0.8 * merlon;
    float tower = 0.0;
    for (int i = 0; i < 2; i++) {
      float cx = i == 0 ? -6.6 : 6.6;
      float dx = abs(p.x - cx);
      float tTop = 11.0 + 0.8 * step(fract((p.x - cx) / 1.0 + 0.25), 0.5);
      if (dx < 2.4 && p.y < tTop) tower = 1.0 + float(i);
      float cone = 11.6 + (2.6 - dx) * 1.7;
      if (dx < 2.6 && p.y >= 11.0 && p.y < cone && p.y > 11.6) col = mix(vec3(0.24, 0.32, 0.48), vec3(0.32, 0.42, 0.6), step(0.5, fract(p.y * 2.0 + dx))) * (0.8 + 0.25 * smoothstep(0.0, 2.6, cx > 0.0 ? cx - p.x : p.x - cx));
      float poleTop = 11.6 + 2.6 * 1.7;
      if (abs(p.x - cx) < 0.06 && p.y > poleTop - 0.2 && p.y < poleTop + 2.4) col = vec3(0.3);
      vec2 fq = vec2(p.x - cx, p.y - poleTop - 1.5);
      float wave = sin(fq.x * 2.2 - uTime * 4.0 + cx) * 0.18 * fq.x;
      if (fq.x > 0.0 && fq.x < 2.4 && abs(fq.y - wave) < 0.55) col = mix(vec3(0.85, 0.12, 0.16), vec3(1.0, 0.82, 0.2), step(abs(fq.y - wave), 0.14)) * (0.85 + 0.15 * sin(fq.x * 2.2 - uTime * 4.0));
    }
    if (p.y < wallTop || tower > 0.0) {
      col = stone(p, 1.0);
      float slit = 0.0;
      for (int i = 0; i < 2; i++) {
        float cx = i == 0 ? -6.6 : 6.6;
        vec2 s = abs(p - vec2(cx, 9.0));
        slit = max(slit, step(s.x, 0.12) * step(s.y, 0.6));
        if (abs(p.x - cx) < 2.4) col *= 0.88 + 0.12 * smoothstep(2.4, 0.0, abs(p.x - cx));
      }
      col = mix(col, vec3(0.08, 0.07, 0.06), slit);
      // The gate: a round-topped arch of oak planks with iron bands.
      vec2 g = p - vec2(0.0, 0.0);
      float arch = max(abs(g.x) - 2.2, g.y - 3.6 - sqrt(max(0.0, 4.84 - g.x * g.x)) * 0.6);
      if (arch < 0.0) {
        col = vec3(0.32, 0.2, 0.12) * (0.75 + 0.25 * step(0.08, fract(g.x / 0.55)));
        col = mix(col, vec3(0.14, 0.14, 0.15), step(abs(fract(g.y / 1.4) - 0.5), 0.05));
      }
      col = mix(col, vec3(0.5, 0.46, 0.4), (1.0 - smoothstep(0.0, 0.25, abs(arch + 0.15))) * 0.8);
      col *= 0.7 + 0.3 * smoothstep(0.0, 3.0, p.y);
    }
    // Bunting along the wall: pennants in the seven unit colours.
    float span = 8.4;
    if (abs(p.x) < span) {
      float sag = 6.3 - 0.9 * (1.0 - (p.x / span) * (p.x / span));
      float cell = floor((p.x + span) / 0.8);
      float fx = fract((p.x + span) / 0.8) - 0.5;
      float dy = sag - p.y;
      vec3 pc[7] = vec3[7](vec3(0.24, 0.76, 1.0), vec3(1.0, 0.62, 0.24), vec3(0.49, 1.0, 0.42), vec3(1.0, 0.88, 0.29), vec3(1.0, 0.36, 0.36), vec3(0.7, 0.55, 1.0), vec3(1.0, 0.56, 0.85));
      float tri = step(0.0, dy) * step(dy, 0.55 * (1.0 - abs(fx) * 2.2));
      col = mix(col, pc[int(mod(cell, 7.0))] * 0.95, tri);
      col = mix(col, vec3(0.9), step(abs(dy), 0.03));
    }
    // Output is sRGB-encoded afterwards; keep the backdrop well under the soldiers.
    gl_FragColor = vec4(col * 0.5, 1.0);
  }`;

const GROUND = /* glsl */ `
  varying vec3 vW;
  ${NOISE}
  void main() {
    vec2 p = vW.xz * 2.4;
    p.x += mod(floor(p.y), 2.0) * 0.5;
    vec2 id = floor(p), f = fract(p) - 0.5;
    float r = length(max(abs(f) - 0.28, 0.0)) - 0.12;
    float cob = smoothstep(0.02, -0.04, r);
    vec3 stoneC = mix(vec3(0.7, 0.6, 0.5), vec3(0.56, 0.5, 0.46), h21(id)) * (0.9 + 0.1 * noise(vW.xz * 8.0));
    vec3 col = mix(vec3(0.3, 0.26, 0.22), stoneC * (0.85 + 0.15 * (0.5 - f.y)), cob);
    float lane = smoothstep(0.08, 0.0, abs(abs(vW.x) - 4.6)) * step(vW.z, 6.0);
    col = mix(col, vec3(0.85, 0.85, 0.8), lane * 0.6);
    col *= 1.0 - 0.45 * smoothstep(-6.0, -16.0, vW.z);
    gl_FragColor = vec4(col * 0.5, 1.0);
  }`;

export class Courtyard {
  constructor(scene) {
    this.wallU = { uTime: { value: 0 } };
    const wall = new THREE.Mesh(
      new THREE.PlaneGeometry(80, 40),
      new THREE.ShaderMaterial({
        uniforms: this.wallU,
        vertexShader: "varying vec2 vP; void main(){ vP = position.xy + vec2(0.0, 20.0); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
        fragmentShader: WALL,
      }),
    );
    wall.position.set(0, 20, WALL_Z);
    scene.add(wall);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(80, 60).rotateX(-Math.PI / 2),
      new THREE.ShaderMaterial({ vertexShader: "varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }", fragmentShader: GROUND }),
    );
    ground.position.z = WALL_Z + 30;
    scene.add(ground);
  }

  update(t) {
    this.wallU.uTime.value = t;
  }
}
