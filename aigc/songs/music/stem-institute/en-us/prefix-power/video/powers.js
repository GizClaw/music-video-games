// "Powers of Ten" zoom: one top-down view centred on a picnic blanket, drawn as
// one layer per decade from 10^-10 m (atoms) to 10^14 m (stars). uE is the
// log10 of the visible half-width in metres (times 1/0.6).
export const POWERS_FRAG = /* glsl */ `
precision highp float;
uniform vec2 uRes;
uniform float uE, uTime, uKick, uSpin, uCenterY;
varying vec2 vUv;

#define PI 3.14159265

float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec2 h22(vec2 p) { float n = h21(p); return vec2(n, h21(p + n * 17.3)); }
float vnoise(vec2 x) {
  vec2 i = floor(x); vec2 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s; }
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
float aaw;  // anti-alias width in layer units
float fill(float d) { return 1.0 - smoothstep(-aaw, aaw, d); }
float line(float d, float w) { return 1.0 - smoothstep(w - aaw, w + aaw, abs(d)); }
float sdBox(vec2 p, vec2 b) { vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
float sdSeg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
vec3 over(vec3 c, vec3 o, float a) { return mix(c, o, clamp(a, 0.0, 1.0)); }

// ---------- Earth (metres): shared height field so every zoom level agrees ----------
float geoH(vec2 X, float E) {
  float px = pow(10.0, E) / 400.0;
  float h = 0.0, amp = 0.55, lam = 4.0e6;
  for (int i = 0; i < 12; i++) {
    if (lam < px) break;
    h += amp * (vnoise(X / lam + float(i) * 7.13) - 0.5);
    lam *= 0.42;
    amp *= 0.55;
  }
  h += 0.32 * exp(-length(X) / 9.0e5);
  h -= 0.55 * smoothstep(1.2e4, 9.0e4, X.x + 2.0e4 * vnoise(X / 3.0e4));
  return h;
}
float cityMask(vec2 X, float E) {
  float r = length(X * vec2(1.0, 1.3));
  float edge = 1.1e4 + 5.0e3 * (vnoise(X / 6.0e3) - 0.5) + 3.0e3 * (vnoise(X / 1.5e3) - 0.5) * step(E, 4.5);
  return 1.0 - smoothstep(edge - 600.0, edge + 600.0, r);
}
vec3 terrain(vec2 X, float E) {
  float h = geoH(X, E);
  vec3 sea = mix(vec3(0.02, 0.09, 0.22), vec3(0.05, 0.28, 0.45), smoothstep(-0.25, 0.0, h));
  vec3 land = mix(vec3(0.16, 0.36, 0.14), vec3(0.42, 0.38, 0.22), smoothstep(0.08, 0.32, h));
  land = mix(land, vec3(0.92), smoothstep(0.42, 0.52, h));
  vec3 c = h < 0.0 ? sea : mix(vec3(0.75, 0.68, 0.48), land, smoothstep(0.0, 0.02, h));
  float city = cityMask(X, E) * step(0.0, h);
  c = mix(c, vec3(0.42, 0.42, 0.44) + 0.08 * (vnoise(X / 400.0) - 0.5), city * 0.85);
  return c;
}
float clouds(vec2 X) { return smoothstep(0.52, 0.75, fbm(X / 6.0e5 + vec2(uTime * 0.01, 0.0))); }

// ---------- per-decade layers; q is in units of 10^k metres ----------
// Stars sit at infinity, so they live in screen space under every space layer.
vec3 stars(vec2 uv) {
  vec3 c = vec3(0.004, 0.005, 0.012);
  for (int l = 0; l < 2; l++) {
    vec2 g = uv * (26.0 + float(l) * 31.0); vec2 i = floor(g); vec2 r = h22(i + float(l) * 9.1);
    c += vec3(0.8, 0.85, 1.0) * smoothstep(0.07, 0.0, length(fract(g) - r)) * step(0.72, r.x) * (0.3 + r.y) * (1.0 - float(l) * 0.4);
  }
  c += vec3(0.22, 0.16, 0.32) * smoothstep(0.5, 0.9, fbm(uv * 1.6 + 3.0)) * 0.35;
  return c;
}
vec4 L14(vec2 q) { return vec4(0.0); }
vec3 orbit(vec3 c, vec2 q, vec2 sun, float R, vec3 tint, float w) { return over(c, tint, line(length(q - sun) - R, w) * 0.7); }
vec4 L12(vec2 q) {  // Tm: outer orbits around the Sun at (-0.15, 0)
  vec2 sun = vec2(-0.15, 0.0);
  vec3 c = vec3(0.0); float a = 0.0;
  float w = aaw * 0.9;
  float lj = line(length(q - sun) - 0.78, w), ls = line(length(q - sun) - 1.43, w), lu = line(length(q - sun) - 2.87, w), ln = line(length(q - sun) - 4.5, w);
  c += vec3(1.0, 0.75, 0.5) * lj + vec3(1.0, 0.9, 0.6) * ls + vec3(0.5, 0.9, 1.0) * lu + vec3(0.4, 0.6, 1.0) * ln;
  a = max(max(lj, ls), max(lu, ln)) * 0.6;
  float sg = exp(-length(q - sun) / 0.02);
  c += vec3(1.0, 0.85, 0.5) * sg * 2.0; a = max(a, sg);
  return vec4(c, clamp(a, 0.0, 1.0));
}
vec4 L11(vec2 q) {  // 100 Gm: inner planets, Earth's orbit passes through the origin
  vec2 sun = vec2(-1.5, 0.0);
  float w = aaw * 0.9;
  float d = length(q - sun);
  vec3 c = vec3(0.0); float a = 0.0;
  float o1 = line(d - 0.58, w), o2 = line(d - 1.08, w), o3 = line(d - 1.5, w * 1.2), o4 = line(d - 2.28, w);
  c += vec3(0.7) * o1 + vec3(1.0, 0.85, 0.6) * o2 + vec3(0.4, 0.8, 1.0) * o3 * 1.4 + vec3(1.0, 0.45, 0.3) * o4;
  a = max(max(o1, o2), max(o3, o4)) * 0.7;
  float sg = exp(-d / max(0.007, aaw * 3.0)) * 1.6 + exp(-d / 0.3) * 0.25;
  c += vec3(1.0, 0.8, 0.45) * sg; a = max(a, min(sg, 1.0));
  float e = exp(-length(q) / (aaw * 3.0));
  c += vec3(0.4, 0.75, 1.0) * e * 1.5; a = max(a, e);
  return vec4(c, clamp(a, 0.0, 1.0));
}
vec4 L9(vec2 q) {  // Gm: Moon's orbit (0.384) around Earth
  float a0 = uTime * 0.05 + 0.8;
  vec2 moon = vec2(cos(a0), sin(a0)) * 0.384;
  float o = line(length(q) - 0.384, aaw * 0.9);
  float m = exp(-length(q - moon) / 0.004) + fill(length(q - moon) - 0.0017);
  float e = exp(-length(q) / 0.008) * 1.3;
  vec3 c = vec3(0.6, 0.7, 0.9) * o * 0.6 + vec3(0.85) * m + vec3(0.35, 0.65, 1.0) * e;
  return vec4(c, clamp(max(o * 0.5, max(m, e)), 0.0, 1.0));
}
vec4 earthDisk(vec2 q, float R, float E) {
  float r = length(q);
  vec3 L = normalize(vec3(-0.8, 0.25, 0.55));
  float atm = exp(-max(r - R, 0.0) / (R * 0.06)) * smoothstep(R * 0.6, R, r);
  if (r > R) return vec4(vec3(0.3, 0.6, 1.0) * atm * 0.9, atm * 0.8);
  vec3 n = vec3(q / R, sqrt(max(1.0 - dot(q, q) / (R * R), 0.0)));
  vec2 X = normalize(q + 1e-9) * asin(min(r / R, 1.0)) * 6.371e6 * 1.0;
  vec3 c = terrain(X, E);
  c = mix(c, vec3(0.95), clouds(X) * 0.85);
  float dif = max(dot(n, L), 0.0);
  c *= 0.08 + 1.1 * dif;
  c += vec3(0.3, 0.55, 1.0) * pow(1.0 - n.z, 3.0) * 0.6;
  c += vec3(1.0, 0.9, 0.7) * pow(max(dot(reflect(-L, n), vec3(0, 0, 1)), 0.0), 40.0) * 0.4 * step(geoH(X, E), 0.0);
  return vec4(c, 1.0);
}
vec4 L7(vec2 q) { return earthDisk(q, 0.6371, uE); }  // 10 Mm: the globe
vec4 L6(vec2 q) {  // Mm: continent with clouds
  vec2 X = q * 1.0e6;
  vec3 c = terrain(X, uE);
  c = mix(c, vec3(0.95), clouds(X) * 0.8 * smoothstep(4.6, 5.6, uE));
  return vec4(c * 0.95, 1.0);
}
vec4 L4(vec2 q) {  // 10 km: city and coast
  vec2 X = q * 1.0e4;
  vec3 c = terrain(X, uE);
  float city = cityMask(X, uE) * step(0.0, geoH(X, uE));
  vec2 g = X / 160.0;
  float blocks = step(0.12, fract(g.x)) * step(0.12, fract(g.y));
  vec3 roofs = vec3(0.38, 0.38, 0.4) + 0.12 * (h21(floor(g)) - 0.5);
  c = mix(c, mix(vec3(0.62, 0.62, 0.6), roofs, blocks), city * smoothstep(4.6, 3.6, uE));
  float hw = line(X.y - 900.0 * sin(X.x / 4.0e3), 22.0 * pow(10.0, uE - 4.0) * 0.0 + 18.0);
  c = mix(c, vec3(0.95, 0.85, 0.5), hw * city * 0.7);
  return vec4(c, 1.0);
}
vec4 L3(vec2 q) {  // km: street grid around a central park
  vec2 X = q * 1000.0;
  float city = cityMask(X, uE);
  vec2 g = (X + vec2(40.0)) / 110.0;
  vec2 f = fract(g);
  float road = 1.0 - step(0.13, f.x) * step(0.13, f.y);
  float hb = h21(floor(g));
  vec3 roof = mix(vec3(0.33, 0.34, 0.37), vec3(0.62, 0.5, 0.42), step(0.7, hb));
  roof = mix(roof, vec3(0.2, 0.42, 0.2), step(0.93, hb));
  vec2 sub = fract(g * 3.0);
  roof *= 0.85 + 0.25 * step(0.08, sub.x) * step(0.08, sub.y);
  vec3 c = mix(roof, vec3(0.16, 0.16, 0.18), road);
  c = mix(c, vec3(0.9, 0.85, 0.6), line(f.x - 0.065, 0.004) * road + line(f.y - 0.065, 0.004) * road);
  float park = fill(sdBox(X, vec2(260.0, 200.0)) / 1000.0);
  c = mix(c, vec3(0.18, 0.4, 0.17) + 0.06 * (vnoise(X / 20.0) - 0.5), park);
  return vec4(c, max(city, park));
}
vec4 L2(vec2 q) {  // 100 m: the park
  vec2 X = q * 100.0;
  float park = fill(sdBox(X, vec2(260.0, 200.0)) / 100.0);
  vec3 c = vec3(0.2, 0.43, 0.18) + 0.07 * (fbm(X / 6.0) - 0.5);
  float path = line(X.y - 25.0 * sin(X.x / 40.0) - 14.0, 2.2 / 100.0 * 100.0) ;
  float path2 = line(X.x + 18.0 * sin(X.y / 30.0) - 40.0, 2.0);
  c = mix(c, vec3(0.78, 0.72, 0.58), max(path, path2));
  float pond = fbm(X / 30.0) * 30.0;
  float pd = length((X - vec2(-110.0, 70.0)) * vec2(1.0, 1.4)) - 48.0 - pond * 0.6;
  c = mix(c, vec3(0.75, 0.7, 0.55), fill((pd - 2.0) / 100.0));
  c = mix(c, mix(vec3(0.08, 0.28, 0.35), vec3(0.15, 0.45, 0.5), smoothstep(-40.0, 0.0, pd)), fill(pd / 100.0));
  // Trees with soft shadows.
  vec2 tg = X / 14.0; vec2 ti = floor(tg); vec2 tr = h22(ti);
  vec2 tc = (ti + 0.2 + 0.6 * tr) * 14.0;
  float keep = step(0.45, tr.x) * step(18.0, length(tc)) * step(4.0, abs(tc.y - 25.0 * sin(tc.x / 40.0) - 14.0)) * step(0.0, pd - 6.0 + 0.0 * pd);
  float rad = 3.5 + 2.5 * tr.y;
  float sh = fill((length(X - tc - vec2(1.8, -1.8)) - rad) / 100.0) * keep;
  c *= 1.0 - 0.45 * sh;
  float can = fill((length(X - tc) - rad) / 100.0) * keep;
  vec3 tcol = mix(vec3(0.1, 0.3, 0.1), vec3(0.25, 0.48, 0.15), tr.y) * (0.8 + 0.4 * vnoise(X * 0.8));
  c = mix(c, tcol, can);
  return vec4(c, park);
}
vec4 L1(vec2 q) {  // 10 m: lawn, a tree's shade and the blanket
  vec2 X = q * 10.0;
  vec3 c = L2(q * 0.1).rgb;
  c *= (0.88 + 0.24 * fbm(X * 1.5)) * (0.9 + 0.2 * vnoise(X * 14.0));
  float shade = fill((length(X - vec2(9.0, 7.0)) - 5.5 - 0.8 * fbm(X)) / 10.0);
  c *= 1.0 - 0.4 * shade;
  return vec4(c, 1.0);
}
vec3 gingham(vec2 X, float s) {
  vec2 b = step(0.5, fract(X / s));
  float k = (b.x + b.y) * 0.5;
  return mix(vec3(0.97, 0.95, 0.9), vec3(0.82, 0.08, 0.1), k);
}
vec4 L0(vec2 q) {  // m: picnic blanket, basket, plates, an apple
  vec2 X = q;
  vec2 B = rot(0.12) * X;
  float blanket = sdBox(B, vec2(0.85, 0.7));
  vec3 c = gingham(B + 0.85, 0.1);
  c *= 0.92 + 0.12 * vnoise(B * 40.0);
  c *= 1.0 - 0.25 * smoothstep(0.0, -0.04, blanket) * 0.0;
  float a = fill(blanket);
  // Basket.
  float bk = sdBox(B - vec2(-0.48, 0.34), vec2(0.2, 0.14)) - 0.02;
  vec3 wick = vec3(0.6, 0.42, 0.2) * (0.8 + 0.3 * step(0.5, fract((B.x + B.y) * 40.0)));
  c *= 1.0 - 0.5 * fill(sdBox(B - vec2(-0.45, 0.31), vec2(0.21, 0.15)) - 0.03);
  c = mix(c, wick, fill(bk));
  // Plates and an apple.
  for (int i = 0; i < 2; i++) {
    vec2 pc = vec2(0.25 + float(i) * 0.3, -0.22 + float(i) * 0.12);
    c *= 1.0 - 0.3 * fill(length(B - pc - vec2(0.015, -0.015)) - 0.12);
    c = mix(c, vec3(0.96), fill(length(B - pc) - 0.12));
    c = mix(c, vec3(0.88), line(length(B - pc) - 0.085, 0.004));
  }
  vec2 ap = B - vec2(0.25, -0.22);
  c = mix(c, vec3(0.75, 0.08, 0.06) * (0.7 + 0.5 * smoothstep(0.05, -0.03, length(ap + vec2(0.015, -0.015)))), fill(length(ap) - 0.045));
  c = mix(c, vec3(0.3, 0.18, 0.08), line(sdSeg(ap, vec2(0.0), vec2(0.008, 0.03)), 0.004));
  return vec4(c, a);
}
vec4 Lm1(vec2 q) {  // dm: gingham squares with a visible weave
  vec2 X = q * 0.1;
  vec3 c = gingham(rot(0.12) * X + 0.85, 0.1);
  vec2 w = rot(0.12) * X * 600.0;
  c *= 0.85 + 0.15 * (0.5 + 0.5 * sin(w.x * PI) * sin(w.y * PI));
  return vec4(c, 1.0);
}
vec4 Lm2(vec2 q) {  // cm: over-under weave of red and white threads
  vec2 X = rot(0.12) * q * 0.01;
  vec2 g = X * 600.0;
  vec2 i = floor(g); vec2 f = fract(g) - 0.5;
  vec3 base = gingham(X + 0.85, 0.1);
  bool up = mod(i.x + i.y, 2.0) < 1.0;
  float warp = 1.0 - smoothstep(0.32, 0.45, abs(f.x));
  float weft = 1.0 - smoothstep(0.32, 0.45, abs(f.y));
  float shadeW = 0.65 + 0.35 * cos(f.y * PI);
  float shadeF = 0.65 + 0.35 * cos(f.x * PI);
  vec3 cw = base * shadeW * (0.9 + 0.2 * sin(f.x * 30.0));
  vec3 cf = base * shadeF * (0.9 + 0.2 * sin(f.y * 30.0));
  vec3 c = vec3(0.05) ;
  if (up) { c = mix(c, cf, weft); c = mix(c, cw, warp); } else { c = mix(c, cw, warp); c = mix(c, cf, weft); }
  return vec4(c, 1.0);
}
vec4 Lm3(vec2 q) {  // mm: one thread, many twisted fibres
  vec2 X = q;
  float band = 1.0 - smoothstep(0.38, 0.5, abs(X.y));
  vec3 c = vec3(0.04, 0.02, 0.03);
  float tw = fract((X.x * 1.2 + X.y * 2.2) * 6.0 + vnoise(X * 8.0) * 0.3);
  vec3 fib = mix(vec3(0.75, 0.1, 0.12), vec3(1.0, 0.45, 0.45), smoothstep(0.2, 0.5, tw) * (1.0 - smoothstep(0.5, 0.9, tw)));
  fib *= 0.6 + 0.4 * cos(X.y / 0.5 * PI * 0.5);
  c = mix(c, fib, band);
  float stray = line(X.y - 0.55 - 0.08 * sin(X.x * 6.0), 0.012) + line(X.y + 0.58 + 0.06 * sin(X.x * 5.0 + 1.0), 0.01);
  c = mix(c, vec3(0.85, 0.25, 0.25), stray * 0.8);
  return vec4(c, 1.0);
}
vec4 Lm4(vec2 q) {  // 100 um: a twisted cotton fibre ribbon
  vec2 X = q;
  float y = X.y - 0.1 * sin(X.x * 2.5);
  float wdt = 0.22 * (0.55 + 0.45 * abs(cos(X.x * 3.0)));
  float rib = 1.0 - smoothstep(wdt - 0.02, wdt, abs(y));
  vec3 c = vec3(0.02, 0.02, 0.04) + vec3(0.04, 0.02, 0.06) * fbm(X * 3.0);
  vec3 fc = mix(vec3(0.8, 0.25, 0.3), vec3(1.0, 0.75, 0.7), 0.5 + 0.5 * cos(X.x * 3.0));
  fc *= 0.7 + 0.3 * sin((y / wdt) * PI * 0.5 + PI * 0.5);
  fc *= 0.9 + 0.1 * sin(X.x * 120.0 + y * 40.0);
  c = mix(c, fc, rib);
  return vec4(c, 1.0);
}
vec4 Lm5(vec2 q) {  // 10 um: fibre surface ridges with rod bacteria
  vec2 X = q;
  vec3 c = mix(vec3(0.55, 0.2, 0.25), vec3(0.85, 0.55, 0.5), 0.5 + 0.5 * sin(X.x * 9.0 + X.y * 4.0 + fbm(X * 2.0) * 3.0));
  c *= 0.75 + 0.25 * vnoise(X * 6.0);
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    vec2 p = vec2(sin(fi * 2.1 + 0.4) * 0.45, cos(fi * 1.7) * 0.6);
    vec2 d = rot(fi * 1.3 + uTime * 0.2) * (X - p);
    float cap = sdSeg(d, vec2(-0.07, 0.0), vec2(0.07, 0.0)) - 0.035;
    c *= 1.0 - 0.4 * fill(cap - 0.01);
    c = mix(c, vec3(0.35, 0.85, 0.45) * (0.7 + 0.5 * smoothstep(0.03, -0.02, cap)), fill(cap));
  }
  return vec4(c, 1.0);
}
vec4 Lm6(vec2 q) {  // um: one bacterium on a microfibril mesh
  vec2 X = q;
  vec3 c = vec3(0.15, 0.06, 0.1);
  for (int i = 0; i < 3; i++) {
    vec2 r = rot(float(i) * 1.05 + 0.3) * X;
    float v = fbm(r * vec2(1.0, 8.0) + float(i) * 3.0);
    c += vec3(0.55, 0.25, 0.3) * pow(1.0 - abs(sin(r.y * 22.0 + v * 4.0)), 6.0) * 0.5;
  }
  vec2 d = rot(0.5 + 0.1 * sin(uTime)) * (X - vec2(0.05, -0.05));
  float cap = sdSeg(d, vec2(-0.32, 0.0), vec2(0.32, 0.0)) - 0.16;
  for (int k = 0; k < 4; k++) {
    float fk = float(k);
    float s = (d.x + 0.4 + fk * 0.1);
    float fl = line(d.y - (0.18 + fk * 0.03) * sign(fk - 1.5) - 0.06 * sin(d.x * 18.0 - uTime * 8.0 + fk), 0.008) * step(-0.6, d.x) * step(d.x, 0.6);
    c = mix(c, vec3(0.5, 1.0, 0.6), fl * 0.6);
    s += 0.0;
  }
  c *= 1.0 - 0.5 * fill(cap - 0.03);
  vec3 body = mix(vec3(0.2, 0.7, 0.35), vec3(0.6, 1.0, 0.6), smoothstep(0.1, -0.12, cap));
  body *= 0.85 + 0.25 * vnoise(d * 30.0);
  c = mix(c, body, fill(cap));
  return vec4(c, 1.0);
}
vec4 Lm7(vec2 q) {  // 100 nm: microfibril bundles
  vec2 X = q;
  vec3 c = vec3(0.04, 0.03, 0.06);
  for (int i = 0; i < 3; i++) {
    vec2 r = rot(float(i) * 0.9 - 0.4) * X;
    float v = fbm(r * vec2(0.8, 3.0) + float(i) * 5.0);
    float s = pow(1.0 - abs(sin(r.y * 9.0 + v * 3.0)), 4.0);
    c += mix(vec3(0.9, 0.5, 0.4), vec3(0.6, 0.6, 1.0), float(i) / 2.0) * s * 0.45;
  }
  return vec4(c, 1.0);
}
vec4 Lm8(vec2 q) {  // 10 nm: parallel cellulose chains of beads
  vec2 X = rot(-0.3) * q;
  vec3 c = vec3(0.02, 0.02, 0.05);
  float row = floor(X.y / 0.12);
  float y = fract(X.y / 0.12) - 0.5;
  float x = fract((X.x + h21(vec2(row)) * 0.3) / 0.1) - 0.5;
  float bead = fill(length(vec2(x * 0.1, y * 0.12)) - 0.032);
  float chain = line(y * 0.12, 0.006);
  c = mix(c, vec3(0.5, 0.75, 1.0) * 0.6, chain);
  c = mix(c, vec3(0.75, 0.9, 1.0) * (0.6 + 0.4 * h21(vec2(row, floor(X.x / 0.1)))), bead);
  return vec4(c, 1.0);
}
vec4 Lm9(vec2 q) {  // nm: glucose rings, hexagons linked in a chain
  vec2 X = q * 2.0;
  vec3 c = vec3(0.01, 0.015, 0.04);
  vec2 g = vec2(1.0, 0.8);
  vec2 i = floor(X / g + 0.5);
  vec2 f = X - i * g;
  f = rot(mod(i.x, 2.0) * PI / 6.0) * f;
  float a = atan(f.y, f.x);
  float r = length(f);
  float hexr = 0.26 / cos(mod(a + PI / 6.0, PI / 3.0) - PI / 6.0);
  float ring = line(r - hexr * 0.95, 0.018);
  float link = line(f.y, 0.016) * step(0.26, abs(f.x)) * step(abs(f.x), 0.52);
  c = mix(c, vec3(0.45, 0.65, 1.0), max(ring, link) * 0.8);
  float atoms = 0.0;
  for (int k = 0; k < 6; k++) {
    float ak = float(k) * PI / 3.0 + PI / 6.0;
    atoms = max(atoms, fill(length(f - vec2(cos(ak), sin(ak)) * 0.25) - 0.045));
  }
  c = mix(c, vec3(0.85, 0.9, 1.0), atoms);
  float ox = fill(length(f - vec2(0.0, 0.33)) - 0.05);
  c = mix(c, vec3(1.0, 0.3, 0.25), ox);
  return vec4(c, 1.0);
}
vec4 Lm10(vec2 q) {  // 0.1 nm: atoms with electron clouds
  vec2 X = q * 0.5;
  vec3 c = vec3(0.005, 0.008, 0.03);
  vec2 g = vec2(1.0, 0.8);
  vec2 i = floor(X / g + 0.5);
  vec2 f = X - i * g;
  f = rot(mod(i.x, 2.0) * PI / 6.0) * f;
  for (int k = 0; k < 6; k++) {
    float ak = float(k) * PI / 3.0 + PI / 6.0;
    vec2 p = f - vec2(cos(ak), sin(ak)) * 0.25;
    float d = length(p);
    float cloud = exp(-d / 0.05) * (0.7 + 0.3 * sin(atan(p.y, p.x) * 3.0 + uTime * 6.0 + float(k)));
    c += vec3(0.35, 0.55, 1.0) * cloud * 0.6;
    vec3 nuc = mix(vec3(0.9, 0.95, 1.0), vec3(0.55, 0.6, 0.7), smoothstep(0.0, 0.025, d));
    c = mix(c, nuc, fill(d - 0.022));
  }
  return vec4(c, 1.0);
}

vec4 layer(int k, vec2 q) {
  if (k >= 14) return L14(q);
  if (k == 13) return L12(q * 10.0);
  if (k == 12) return L12(q);
  if (k == 11) return L11(q);
  if (k == 10) return L11(q * 0.1);
  if (k == 9) return L9(q);
  if (k == 8) return earthDisk(q * 10.0, 0.6371, uE);
  if (k == 7) return L7(q);
  if (k == 6) return L6(q);
  if (k == 5) return L6(q * 0.1);
  if (k == 4) return L4(q);
  if (k == 3) return L3(q);
  if (k == 2) return L2(q);
  if (k == 1) return L1(q);
  if (k == 0) return L0(q);
  if (k == -1) return Lm1(q);
  if (k == -2) return Lm2(q);
  if (k == -3) return Lm3(q);
  if (k == -4) return Lm4(q);
  if (k == -5) return Lm5(q);
  if (k == -6) return Lm6(q);
  if (k == -7) return Lm7(q);
  if (k == -8) return Lm8(q);
  if (k == -9) return Lm9(q);
  return Lm10(q);
}

vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }

void main() {
  vec2 frag = vUv * uRes;
  vec2 uv = (frag - vec2(0.5 * uRes.x, uCenterY)) / (0.5 * uRes.x);
  uv = rot(uSpin) * uv;
  float E = uE;
  vec3 col = stars(uv) * smoothstep(5.2, 6.8, E);
  // Coarse to fine: each layer paints over the previous where it is present.
  int kHi = int(floor(E)) + 3;
  int kLo = int(floor(E)) - 2;
  for (int j = 0; j < 7; j++) {
    int k = kHi - j;
    if (k < kLo || k < -10) break;
    if (k > 14) continue;
    float fk = float(k);
    // Small objects on transparent layers appear early; full-frame textures only
    // once the coarser layer's feature has grown to fill the view.
    vec2 win = k >= 7 ? vec2(2.3, 1.3) : k >= 4 ? vec2(1.1, 0.5) : k >= 2 ? vec2(1.4, 0.6) : k == 1 ? vec2(1.0, 0.3) : k == 0 ? vec2(1.6, 0.8) : k == -1 ? vec2(1.0, 0.3) : vec2(0.5, -0.1);
    float vis = smoothstep(fk + win.x, fk + win.y, E);
    if (vis <= 0.0) continue;
    float s = 0.6 * pow(10.0, E - fk);
    vec2 q = uv * s;
    aaw = 2.2 * s / uRes.x;
    vec4 L = layer(k, q);
    col = mix(col, L.rgb, L.a * vis);
  }
  col *= 1.0 + uKick * 0.08;
  float vig = smoothstep(1.6, 0.4, length((frag / uRes - 0.5) * vec2(1.0, 1.4)));
  col *= 0.55 + 0.45 * vig;
  gl_FragColor = vec4(pow(aces(col * 1.1), vec3(2.2)), 1.0);
}
`;
