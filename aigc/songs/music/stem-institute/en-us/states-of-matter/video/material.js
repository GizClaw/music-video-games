// Full-screen ray-marched "one material, four states" view. Weights in uW mix
// ice crystals, a water blob, a vapour cloud and a plasma globe; uSplit swaps
// to a 2x2 grid with one pure state per tile.
export const MATERIAL_FRAG = /* glsl */ `
precision highp float;
uniform vec2 uRes;
uniform float uTime, uKick, uOrbit, uDist, uLift;
uniform vec4 uW;
uniform float uFlask, uBoil, uMelt, uFrost, uFern, uHeat, uSplit, uSub;
uniform vec4 uGrid;
varying vec2 vUv;

#define PI 3.14159265

float hash3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), f.x), mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), f.x), mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; } return s; }
float fbm3(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 3; i++) { s += a * noise(p); p = p * 2.07 + vec3(4.1, 1.3, 7.7); a *= 0.5; } return s; }
float smin(float a, float b, float k) { float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

float sdHexPrism(vec3 p, vec2 h) {
  const vec3 k = vec3(-0.8660254, 0.5, 0.57735);
  p = abs(p);
  p.xy -= 2.0 * min(dot(k.xy, p.xy), 0.0) * k.xy;
  vec2 d = vec2(length(p.xy - vec2(clamp(p.x, -k.z * h.x, k.z * h.x), h.x)) * sign(p.y - h.x), p.z - h.y);
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}
// Hexagonal column with pyramid tips along y.
float crystal(vec3 p, float r, float h) {
  float apex = h + r * 1.1;
  float prism = sdHexPrism(p.xzy, vec2(r, apex));
  float tip = dot(vec2(length(p.xz), abs(p.y) - apex), normalize(vec2(1.1, 1.0)));
  return max(prism, tip);
}

// Per-tile state weights and time (set in main()).
vec4 W;
float T;

// Tumbling ice cube with chamfered edges.
mat3 iceRot() {
  float a = T * 0.35, b = T * 0.23 + 0.6;
  mat3 ry = mat3(cos(a), 0.0, -sin(a), 0.0, 1.0, 0.0, sin(a), 0.0, cos(a));
  mat3 rx = mat3(1.0, 0.0, 0.0, 0.0, cos(b), sin(b), 0.0, -sin(b), cos(b));
  return rx * ry;
}
float iceSDF(vec3 p) {
  float s = max(W.x, 0.001);
  p = iceRot() * (p / s);
  p.y += uMelt * 0.22 * (1.0 - p.y);
  vec3 q = abs(p) - vec3(0.58);
  float d = length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - 0.07 - uMelt * 0.16;
  return d * s;
}

float flaskInner(vec3 p) {
  float bulb = length(p - vec3(0.0, -0.32, 0.0)) - 0.74;
  float neck = max(length(p.xz) - 0.22, abs(p.y - 0.5) - 0.62);
  return smin(bulb, neck, 0.12);
}

float liquidSDF(vec3 p) {
  float s = pow(max(W.y, 0.0), 0.34);
  float r = 0.36 * s + 0.001;
  float d = 1e3;
  for (int i = 0; i < 5; i++) {
    float fi = float(i);
    vec3 c = vec3(sin(T * 0.7 + fi * 1.3) * 0.32, cos(T * 0.9 + fi * 2.1) * 0.2 - 0.08, sin(T * 0.6 + fi * 0.7) * 0.28) * s;
    d = smin(d, length(p - c) - r * (1.0 + 0.25 * sin(fi * 1.7)), 0.34 * s + 0.01);
  }
  float level = -0.12 + 0.03 * sin(p.x * 7.0 + T * 3.0) + 0.02 * sin(p.z * 9.0 - T * 2.0);
  float filled = max(flaskInner(p) + 0.03, p.y - level);
  d = mix(d, filled, uFlask);
  d += uBoil * 0.05 * (noise(p * 9.0 + vec3(0.0, -T * 4.0, 0.0)) - 0.5);
  return d;
}

float mapS(vec3 p, out float m) {
  float di = iceSDF(p);
  float dl = liquidSDF(p);
  m = clamp(0.5 + (dl - di) / 0.12, 0.0, 1.0);
  return smin(di, dl, 0.08);
}
float map(vec3 p) { float m; return mapS(p, m); }

vec3 calcNormal(vec3 p) {
  const vec2 e = vec2(1.0, -1.0) * 0.0015;
  return normalize(e.xyy * map(p + e.xyy) + e.yyx * map(p + e.yyx) + e.yxy * map(p + e.yxy) + e.xxx * map(p + e.xxx));
}

vec3 stateTint() {
  return W.x * vec3(0.45, 0.75, 1.0) + W.y * vec3(0.2, 1.0, 0.8) + W.z * vec3(1.0, 0.68, 0.3) + W.w * vec3(1.0, 0.3, 0.85);
}

// Studio environment: dark gradient, two soft boxes, warm floor bounce when heating.
vec3 env(vec3 d) {
  vec3 c = mix(vec3(0.012, 0.014, 0.03), vec3(0.05, 0.06, 0.1), smoothstep(-0.5, 0.9, d.y));
  c += vec3(1.0, 0.97, 0.92) * 3.2 * smoothstep(0.93, 0.985, dot(d, normalize(vec3(-0.55, 0.65, 0.52))));
  c += stateTint() * 1.6 * smoothstep(0.86, 0.98, dot(d, normalize(vec3(0.75, 0.15, -0.6))));
  c += vec3(0.7, 0.85, 1.0) * 0.6 * smoothstep(0.75, 0.99, dot(d, normalize(vec3(0.2, -0.2, 0.95))));
  c += vec3(1.0, 0.4, 0.08) * max(uHeat, 0.0) * 0.9 * smoothstep(0.1, -0.9, d.y);
  c += vec3(0.45, 0.75, 1.0) * max(-uHeat, 0.0) * 1.4 * smoothstep(0.2, 1.0, d.y);
  return c;
}

// Glowing particle lattice seen through the ice; each site vibrates on the beat.
float iceLattice(vec3 p, vec3 rd) {
  float g = 0.0;
  mat3 R = iceRot();
  float sc = max(W.x, 0.001);
  vec3 o = R * (p / sc);
  vec3 d = normalize(R * rd);
  vec3 q = o;
  vec3 last = vec3(1e3);
  for (int i = 0; i < 24; i++) {
    q += d * 0.05;
    if (iceSDF(p + rd * float(i + 1) * 0.05 * sc) > 0.0) break;
    vec3 cell = floor(q / 0.3 + 0.5);
    if (cell == last || any(greaterThan(abs(cell), vec3(1.5)))) continue;
    last = cell;
    float h = hash3(cell);
    vec3 off = (vec3(hash3(cell + 3.1), hash3(cell + 7.7), hash3(cell + 1.9)) - 0.5) * (0.012 + uKick * 0.035) * sin(T * 32.0 + h * 40.0);
    vec3 c = (cell + 0.0) * 0.3 + off - o;
    vec3 perp = c - d * dot(c, d);
    g += exp(-dot(perp, perp) * 1800.0) * (0.7 + 0.3 * h);
  }
  return g;
}

float liquidDots(vec3 p, vec3 rd) {
  float g = 0.0;
  vec3 q = p;
  for (int i = 0; i < 14; i++) {
    q += rd * 0.06;
    if (liquidSDF(q) > 0.0) break;
    vec3 a = q + vec3(sin(q.y * 4.0 + T * 1.3), sin(q.z * 3.0 + T * 1.1), cos(q.x * 4.0 + T * 0.9)) * 0.08;
    vec3 cell = floor(a / 0.13 + 0.5);
    vec3 lq = a - cell * 0.13;
    g += exp(-dot(lq, lq) * 1100.0) * step(0.35, hash3(cell));
  }
  return g;
}

vec3 shadeSurface(vec3 p, vec3 rd, float m) {
  vec3 n = calcNormal(p);
  float cosi = max(dot(n, -rd), 0.0);
  vec3 L = normalize(vec3(-0.55, 0.65, 0.52));
  vec3 refl = env(reflect(rd, n));
  float spec = pow(max(dot(reflect(rd, n), L), 0.0), 90.0) * 3.0;

  // Ice: faceted, cold, with a visible vibrating lattice inside.
  vec3 ri = refract(rd, n, 1.0 / 1.31);
  vec3 iceIn = env(ri) * vec3(0.6, 0.82, 1.0) * 0.55 + vec3(0.015, 0.04, 0.09);
  iceIn += vec3(0.55, 0.88, 1.0) * iceLattice(p, ri) * 0.6;
  iceIn += vec3(0.8, 0.9, 1.0) * 0.12 * smoothstep(0.55, 0.8, fbm3(iceRot() * p * 5.0));
  float fi = 0.06 + 0.94 * pow(1.0 - cosi, 4.0);
  vec3 ice = mix(iceIn, refl, fi) + spec + vec3(0.55, 0.8, 1.0) * pow(1.0 - cosi, 2.5) * 0.45;
  float frost = (uFrost + max(-uHeat, 0.0) * 0.5) * smoothstep(0.45, 0.75, fbm3(p * 14.0));
  ice = mix(ice, vec3(0.75, 0.88, 1.0) * (0.6 + 0.6 * cosi), frost);

  // Water: clear teal body with drifting particles and sharp highlights.
  vec3 rl = refract(rd, n, 1.0 / 1.33);
  vec3 watIn = env(rl) * vec3(0.2, 0.8, 0.75) * 0.35 + vec3(0.0, 0.05, 0.07);
  watIn += vec3(0.5, 1.0, 0.9) * liquidDots(p, rl) * 0.3;
  float caust = pow(abs(sin(p.x * 11.0 + T * 2.0) * sin(p.z * 9.0 - T * 1.7) * sin(p.y * 7.0 + T)), 3.0);
  watIn += vec3(0.3, 1.0, 0.85) * caust * 0.18;
  float fw = 0.04 + 0.96 * pow(1.0 - cosi, 5.0);
  vec3 water = mix(watIn, refl, fw) + spec * 1.4;
  water += vec3(1.0, 0.6, 0.3) * uBoil * 0.25 * noise(p * 12.0 + T * 5.0);

  return mix(water, ice, m);
}

// Vapour cloud: lit fbm density inside a radius that grows to fill the frame.
vec4 gasVolume(vec3 ro, vec3 rd, float tEnd) {
  float wg = W.z + W.w * 0.35;
  if (wg < 0.01) return vec4(0.0);
  float R = mix(0.7, 3.4, smoothstep(0.0, 1.0, W.z)) + uSub * 0.4;
  float b = dot(ro, rd);
  float c = dot(ro, ro) - R * R;
  float h = b * b - c;
  if (h < 0.0) return vec4(0.0);
  h = sqrt(h);
  float t0 = max(-b - h, 0.0);
  float t1 = min(-b + h, tEnd);
  if (t1 <= t0) return vec4(0.0);
  float dt = (t1 - t0) / 36.0;
  vec3 col = vec3(0.0);
  float tr = 1.0;
  vec3 warm = mix(vec3(1.0, 0.7, 0.32), vec3(1.0, 0.35, 0.9), W.w);
  for (int i = 0; i < 36; i++) {
    float t = t0 + dt * (float(i) + hash2(gl_FragCoord.xy + float(i)) * 0.9);
    vec3 p = ro + rd * t;
    float r = length(p);
    vec3 fp = p * 1.4 + vec3(0.0, -T * 0.45, T * 0.15);
    fp.xz *= rot(T * 0.08);
    float dens = (fbm(fp) - 0.5 + 0.18 * smoothstep(R, 0.0, r)) * smoothstep(R, R * 0.55, r);
    if (uSub > 0.0) dens += uSub * smoothstep(0.4, -0.9, p.y) * smoothstep(1.8, 0.4, length(p.xz)) * (fbm3(p * 3.0 + vec3(T * 0.5, 0.0, 0.0)) - 0.25);
    dens = max(dens, 0.0) * wg * 1.6;
    if (dens > 0.001) {
      float light = 0.3 + 1.7 * smoothstep(0.35, 0.78, fbm3(fp * 1.3 + vec3(0.3, 0.6, 0.2)));
      vec3 e = warm * light * (0.35 + 0.45 * smoothstep(R, 0.0, r)) + warm * uKick * 0.15;
      col += tr * e * dens * dt * 1.35;
      tr *= exp(-dens * dt * 2.4);
      if (tr < 0.02) break;
    }
  }
  return vec4(col, 1.0 - tr);
}

// Plasma globe filaments in the projected plane of the hero, plus glass shell.
vec3 plasmaGlow(vec2 sp, vec3 ro, vec3 rd, float scale) {
  float wp = W.w;
  if (wp < 0.01) return vec3(0.0);
  vec3 col = vec3(0.0);
  float R = 1.05 * scale;
  float r = length(sp);
  // Inner haze and electrode.
  col += vec3(0.55, 0.15, 0.6) * exp(-r / (0.55 * scale)) * 0.35;
  col += vec3(1.0, 0.8, 1.0) * exp(-r / (0.05 * scale)) * 2.0;
  for (int k = 0; k < 9; k++) {
    float fk = float(k);
    float base = fk / 9.0 * 2.0 * PI + 0.6 * sin(T * 0.4 + fk * 1.7) + T * 0.15;
    float a = atan(sp.y, sp.x);
    float s = clamp(r / R, 0.0, 1.0);
    float wig = (noise(vec3(s * 5.0, fk * 3.1, T * 1.6)) - 0.5) * 1.6 * s + (noise(vec3(s * 17.0, fk * 7.3, T * 3.0)) - 0.5) * 0.35 * s;
    float da = a - (base + wig);
    da = mod(da + PI, 2.0 * PI) - PI;
    float dist = abs(da) * r;
    float w = 0.006 * scale + 0.004 * scale * s;
    float flick = 0.7 + 0.3 * sin(T * 23.0 + fk * 5.0) + uKick * 0.6;
    float g = w / (dist + w) * smoothstep(R, R * 0.92, r) * smoothstep(0.0, 0.08 * scale, r);
    vec3 fc = mix(vec3(0.5, 0.75, 1.0), vec3(1.0, 0.35, 0.9), fract(fk * 0.37));
    col += fc * g * g * 2.4 * flick;
    // Contact glow where the filament touches the glass.
    col += fc * exp(-abs(r - R) / (0.02 * scale)) * exp(-abs(da) * 6.0) * 0.8 * flick;
  }
  // Glass shell rim.
  col += vec3(0.6, 0.55, 1.0) * exp(-abs(r - R * 1.02) / (0.012 * scale)) * 0.7;
  col += vec3(0.8, 0.7, 1.0) * smoothstep(R * 1.02, R * 0.4, r) * 0.04;
  return col * wp;
}

// Frost ferns creeping in from the frame edges (deposition).
float ferns(vec2 uv) {
  float edge = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y) * 0.56);
  float grow = uFern * 0.14;
  float n = fbm3(vec3(uv * 6.0, 1.0));
  float front = smoothstep(grow + 0.02, grow - 0.04, edge + n * 0.12);
  vec2 q = uv * vec2(9.0, 16.0);
  float ridges = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec2 r = q * (1.0 + fi * 1.9);
    r *= rot(fi * 1.05 + 0.4);
    float v = fbm3(vec3(r, fi * 3.0));
    ridges += pow(1.0 - abs(sin(v * 9.0 + r.x * 0.6)), 22.0) * (0.9 - fi * 0.2);
  }
  return front * (0.08 + ridges);
}

vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }

void main() {
  vec2 frag = vUv * uRes;
  vec2 res = uRes;
  W = uW;
  T = uTime;
  float lift = uLift;
  float dist = uDist;
  // 2x2 grid of pure states inside uGrid (x, y, w, h in GL pixels).
  if (uSplit > 0.5) {
    vec2 lp = frag - uGrid.xy;
    if (lp.y < 0.0 || lp.y > uGrid.w) { gl_FragColor = vec4(aces(vec3(0.01, 0.012, 0.025)), 1.0); return; }
    vec2 tile = uGrid.zw * 0.5;
    vec2 cell = min(floor(lp / tile), vec2(1.0));
    float idx = (1.0 - cell.y) * 2.0 + cell.x;
    W = vec4(idx == 0.0, idx == 1.0, idx == 2.0, idx == 3.0);
    frag = lp - cell * tile;
    res = tile;
    lift = 0.0;
    dist *= 0.62;
  }
  vec2 uv = (frag - 0.5 * res) / res.y;
  uv.y -= lift;

  vec3 ta = vec3(0.0, -0.02, 0.0);
  vec3 ro = ta + vec3(sin(uOrbit) * dist, dist * 0.1, cos(uOrbit) * dist);
  vec3 ww = normalize(ta - ro);
  vec3 uu = normalize(cross(ww, vec3(0.0, 1.0, 0.0)));
  vec3 vv = cross(uu, ww);
  const float FOCAL = 1.6;
  vec3 rd = normalize(uv.x * uu + uv.y * vv + FOCAL * ww);

  // Background: dark stage with a tinted halo behind the hero and drifting dust.
  vec3 col = mix(vec3(0.008, 0.01, 0.022), vec3(0.02, 0.025, 0.05), smoothstep(-0.6, 0.5, uv.y));
  col += stateTint() * 0.09 * exp(-length(uv) * 3.2);
  vec2 dg = uv * 22.0 + vec2(0.0, T * 0.15);
  vec2 di = floor(dg);
  float dh = hash2(di);
  col += vec3(0.6, 0.7, 1.0) * smoothstep(0.08, 0.0, length(fract(dg) - 0.5 - (vec2(hash2(di + 1.3), hash2(di + 2.7)) - 0.5) * 0.6)) * step(0.82, dh) * 0.25;
  col += vec3(1.0, 0.45, 0.1) * max(uHeat, 0.0) * 0.25 * smoothstep(0.1, -0.7, uv.y);
  col += vec3(0.3, 0.6, 1.0) * max(-uHeat, 0.0) * 0.15 * smoothstep(-0.2, 0.7, uv.y);

  // Surfaces (ice/water) inside a bounding sphere.
  float tHit = 1e3;
  float solidish = W.x + W.y;
  if (solidish > 0.01) {
    float b = dot(ro, rd);
    float c = dot(ro, ro) - 1.7 * 1.7;
    float h = b * b - c;
    if (h > 0.0) {
      float t = max(-b - sqrt(h), 0.0);
      float tEnd = -b + sqrt(h);
      for (int i = 0; i < 110; i++) {
        vec3 p = ro + rd * t;
        float m;
        float d = mapS(p, m);
        if (d < 0.0012) { tHit = t; break; }
        t += d * 0.85;
        if (t > tEnd) break;
      }
      if (tHit < 1e2) {
        vec3 p = ro + rd * tHit;
        float m;
        mapS(p, m);
        col = shadeSurface(p, rd, m);
      }
    }
  }

  // Flask glass (outline glow) while the liquid takes the container's shape.
  if (uFlask > 0.01) {
    float g = 0.0;
    float t = dist - 1.6;
    for (int i = 0; i < 40; i++) {
      vec3 p = ro + rd * t;
      float d = abs(flaskInner(p) - 0.035) - 0.012;
      g += 0.0025 / (abs(d) + 0.004);
      t += max(abs(d) * 0.8, 0.02);
      if (t > dist + 1.6) break;
    }
    col += vec3(0.7, 0.9, 1.0) * g * 0.035 * uFlask;
  }

  vec4 gas = gasVolume(ro, rd, tHit);
  col = col * (1.0 - gas.a) + gas.rgb;

  // Hero-centred plane coordinates for the plasma globe.
  vec3 toC = -ro;
  float zc = dot(toC, ww);
  vec2 spc = vec2(dot(toC, uu), dot(toC, vv)) / zc * FOCAL;
  float scale = FOCAL / zc;
  col += plasmaGlow(uv - spc, ro, rd, scale);

  if (uFern > 0.0) {
    float f = ferns(frag / res);
    col = mix(col, vec3(0.8, 0.92, 1.0) * 1.3, clamp(f, 0.0, 1.0) * 0.6);
  }

  // Tile seams in split mode.
  if (uSplit > 0.5) {
    vec2 e = min(frag, res - frag);
    col += stateTint() * smoothstep(3.0, 0.0, min(e.x, e.y)) * 0.8;
  }

  gl_FragColor = vec4(aces(col * 1.05), 1.0);
}
`;

export const MATERIAL_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;
