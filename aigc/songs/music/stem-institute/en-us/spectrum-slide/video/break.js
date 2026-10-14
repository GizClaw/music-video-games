import * as THREE from "three";
import { makeRibbon } from "@gizclaw/mvg-core/fx.js";
import { BANDS, SECTIONS } from "./constants.js";
import { easeOutCubic, lerp, smooth } from "@gizclaw/mvg-core/timing.js";

export class BreakScene {
  constructor(ctx) {
    this.ctx = ctx;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#04040c");
    this.camera = new THREE.PerspectiveCamera(45, 9 / 16, 0.1, 100);
    const geo = new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(1.5, 2));
    this.wireMat = new THREE.LineBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending });
    this.wire = new THREE.LineSegments(geo, this.wireMat);
    this.wire.position.y = 0.9;
    this.scene.add(this.wire);
    this.orbits = BANDS.map((b, i) => {
      const uniforms = { uR: { value: 2.3 + i * 0.12 }, uTilt: { value: (i / 7) * Math.PI }, uN: { value: 3 + i * 2 } };
      const r = makeRibbon({
        segments: 360,
        width: 0.012,
        color: b.id === "visible" ? "#fff6a0" : b.color,
        uniforms,
        path: `float a = u * 6.2831853; float rr = uR * (1.0 + 0.04 * sin(a * uN)); vec3 p = vec3(cos(a) * rr, 0.0, sin(a) * rr); float c = cos(uTilt), s = sin(uTilt); return vec3(p.x, p.z * s + 0.9, p.z * c);`,
      });
      this.scene.add(r);
      return r;
    });
  }

  update(t) {
    const { timing, hud } = this.ctx;
    const k = t - SECTIONS.break;
    const snare = timing.env("snare", t, 0.08);
    this.wire.rotation.set(t * 0.4, t * 0.6, 0);
    const s = 1 + snare * 0.25 + timing.pulse(t, 0.1) * 0.08;
    this.wire.scale.setScalar(s);
    this.wireMat.opacity = 0.35 + snare * 0.8;
    this.orbits.forEach((o, i) => {
      const u = o.material.uniforms;
      u.uTilt.value = (i / 7) * Math.PI + t * 0.5;
      u.uReveal.value = easeOutCubic((k - i * 0.08) / 0.6);
      u.uOpacity.value = 0.9;
    });
    this.camera.position.set(Math.sin(t * 0.5) * 0.5, 0.4, lerp(10, 8, smooth(0, 3.3, k)));
    this.camera.lookAt(0, 0.5, 0);
    const post = { bloom: [0.9, 0.4, 0.1], ca: 0.2 + snare * 0.8, sat: lerp(0.3, 1, smooth(0, 1.2, k)), vignette: 0.6 };
    post.flash = Math.exp(-k / 0.1) * 0.5;
    post.zoom = lerp(1.15, 1, easeOutCubic(k / 0.4));
    const end = SECTIONS.verse2;
    if (t > end - 0.3) post.flash = Math.max(post.flash, smooth(end - 0.3, end, t) * 0.6);

    const a = smooth(SECTIONS.break + 0.2, SECTIONS.break + 0.6, t);
    hud.text("λ × f = c", 540, 470, { size: 128, weight: 800, family: '"Avenir Next Condensed"', alpha: a, glow: 30 });
    hud.text("every wave · same speed", 540, 565, { size: 32, weight: 600, family: '"Menlo"', alpha: a * 0.9, color: "#bfeaff" });
    return post;
  }
}
