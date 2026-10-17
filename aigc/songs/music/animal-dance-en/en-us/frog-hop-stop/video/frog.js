import * as THREE from "three";
import { CONE, OUTLINE, SPHERE, painted, part, toon, vec } from "./toon.js";

const LIMB = new THREE.CapsuleGeometry(0.5, 1, 6, 14);
const THIGH = 0.15;
const SHIN = 0.15;
const LEG_R = 0.046;
const HIP_Y = 0.29;
/** Rest angles of the legs: thighs out to the sides, shins back in, knees bowed out like a frog's. */
const REST = { out: 0.5, knee: 1.0, fwd: -0.15 };
/** A leg segment whose round ends are centred on the joints, so a bent knee stays smooth and even. */
const LEG_SEG = new THREE.CapsuleGeometry(1, THIGH / LEG_R, 8, 16);
function legSeg(parent, material) {
  const m = new THREE.Mesh(LEG_SEG, material);
  m.scale.setScalar(LEG_R);
  m.position.y = -THIGH / 2;
  m.add(new THREE.Mesh(LEG_SEG, OUTLINE));
  parent.add(m);
  return m;
}
const legHeight = (out, knee, fwd) => (THIGH * Math.cos(out) + SHIN * Math.cos(out - knee)) * Math.cos(fwd);
const REST_H = legHeight(REST.out, REST.knee, REST.fwd);

/** A capsule limb hanging from a joint: length `len` along -y, thickness `r`. */
function limb(parent, material, len, r) {
  return part(parent, material, LIMB, [0, -len / 2, 0], [r * 2, len / 2, r * 2]);
}

/**
 * Upright chibi frog, about one unit tall, pivoting between its feet: a big
 * round head with eyes on top, a small bean body, slender bent legs on wide
 * webbed feet, and a throat sac that puffs on "ribbit". `group` carries
 * position and heading; `body` crouches, leans and stretches for a hop.
 */
export class Frog {
  constructor({ crown = false, tone = 0, scale = 1 } = {}) {
    this.group = new THREE.Group();
    this.group.rotation.order = "YXZ";
    this.root = new THREE.Group();
    this.root.scale.setScalar(scale);
    this.group.add(this.root);
    this.body = new THREE.Group();
    this.root.add(this.body);

    const GREEN = vec(["#6cd85e", "#8ddc4e", "#4fcf8a", "#a6dc4a"][tone % 4]);
    const CREAM = vec("#fff6cf");
    const bodyMat = painted(`
      float belly = length(vec2(p.x / 0.62, (p.y + 0.05) / 0.9));
      return mix(${GREEN}, ${CREAM}, (1.0 - smoothstep(0.92, 1.0, belly)) * smoothstep(0.05, 0.35, p.z));`);
    const headMat = painted(`
      vec3 c = ${GREEN};
      c = mix(c, ${CREAM}, smoothstep(-0.25, -0.45, p.y) * smoothstep(0.1, 0.5, p.z));
      float smile = abs(p.y - (-0.22 + 0.9 * p.x * p.x));
      float mouth = (1.0 - smoothstep(0.035, 0.06, smile)) * step(abs(p.x), 0.3) * smoothstep(0.6, 0.75, p.z);
      c = mix(c, vec3(0.11, 0.15, 0.28), mouth);
      float blush = max(1.0 - length((p.xy - vec2(-0.5, -0.12)) / vec2(0.16, 0.1)), 1.0 - length((p.xy - vec2(0.5, -0.12)) / vec2(0.16, 0.1)));
      return mix(c, vec3(1.0, 0.55, 0.68), smoothstep(0.0, 0.5, blush) * 0.9 * smoothstep(0.3, 0.55, p.z));`);
    this.skin = painted(`return ${GREEN};`);
    const sacMat = toon("#ffd6e4");
    const pad = toon("#fff6cf");
    const eyeWhite = new THREE.MeshToonMaterial({ color: "#ffffff" });
    const pupil = new THREE.MeshStandardMaterial({ color: "#0d0e1c", roughness: 0.15 });
    const shine = new THREE.MeshBasicMaterial({ color: "#f4f6ff" });
    this.mats = { bodyMat, headMat };

    part(this.body, bodyMat, SPHERE, [0, 0.43, 0], [0.17, 0.2, 0.15]);

    // Back legs of even thickness: the knee bows out to the side and the webbed foot stays flat.
    this.legs = [-1, 1].map((s) => {
      const hip = new THREE.Group();
      hip.position.set(s * 0.075, HIP_Y, 0);
      this.body.add(hip);
      legSeg(hip, this.skin);
      const ankle = new THREE.Group();
      ankle.position.y = -THIGH;
      hip.add(ankle);
      legSeg(ankle, this.skin);
      const foot = new THREE.Group();
      foot.rotation.order = "ZXY";
      foot.position.y = -SHIN;
      ankle.add(foot);
      const web = new THREE.Group();
      web.rotation.y = s * 0.3;
      foot.add(web);
      part(web, this.skin, SPHERE, [0, -0.005, 0.045], [0.06, 0.022, 0.085]);
      for (const k of [-1, 0, 1]) part(web, pad, SPHERE, [k * 0.045, 0, 0.12 - Math.abs(k) * 0.02], [0.022, 0.016, 0.022], null, false);
      return { hip, ankle, foot };
    });

    // Slender front legs with round finger pads.
    this.arms = [-1, 1].map((s) => {
      const shoulder = new THREE.Group();
      shoulder.rotation.order = "YXZ";
      shoulder.position.set(s * 0.13, 0.54, 0.02);
      this.body.add(shoulder);
      limb(shoulder, this.skin, 0.2, 0.034);
      const hand = new THREE.Group();
      hand.position.set(0, -0.21, 0);
      shoulder.add(hand);
      part(hand, this.skin, SPHERE, [0, -0.01, 0], [0.042, 0.038, 0.034]);
      for (const k of [-1, 0, 1]) part(hand, pad, SPHERE, [k * 0.026, -0.042, 0.012], [0.016, 0.016, 0.016], null, false);
      return { shoulder, hand };
    });

    // Head: big and round, with the eyes sitting up on top.
    this.head = new THREE.Group();
    this.head.rotation.order = "YXZ";
    this.head.position.set(0, 0.62, 0.0);
    this.body.add(this.head);
    part(this.head, headMat, SPHERE, [0, 0.13, 0.01], [0.27, 0.2, 0.23]);
    this.eyes = [-1, 1].map((s) => {
      const dome = new THREE.Group();
      dome.position.set(s * 0.13, 0.3, 0.05);
      this.head.add(dome);
      part(dome, this.skin, SPHERE, [0, 0, -0.01], [0.115, 0.11, 0.105]);
      const ball = new THREE.Group();
      ball.position.set(0, 0.01, 0.045);
      dome.add(ball);
      part(ball, eyeWhite, SPHERE, [0, 0, 0], [0.095, 0.1, 0.08]);
      part(ball, pupil, SPHERE, [-s * 0.008, -0.008, 0.066], [0.062, 0.072, 0.025], null, false);
      part(ball, shine, SPHERE, [-s * 0.028, 0.03, 0.088], [0.024, 0.024, 0.008], null, false);
      part(ball, shine, SPHERE, [s * 0.018, -0.026, 0.09], [0.01, 0.01, 0.005], null, false);
      return ball;
    });
    this.sac = part(this.head, sacMat, SPHERE, [0, -0.03, 0.19], [0.1, 0.075, 0.08]);

    this.crown = null;
    if (crown) {
      const gold = toon("#ffcc33");
      const jewel = toon("#ff4f7a");
      this.crown = new THREE.Group();
      this.crown.position.set(0, 0.36, -0.03);
      this.crown.rotation.x = -0.12;
      this.head.add(this.crown);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.13, 0.67, 20), gold);
      band.scale.setScalar(0.075);
      band.add(new THREE.Mesh(band.geometry, OUTLINE));
      this.crown.add(band);
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        part(this.crown, gold, CONE, [Math.sin(a) * 0.068, 0.05, Math.cos(a) * 0.068], [0.024, 0.055, 0.024], null, false);
      }
      part(this.crown, jewel, SPHERE, [0, 0.0, 0.085], [0.02, 0.02, 0.01], null, false);
    }
  }

  /**
   * crouch 0–1 bends the knees deep (the feet stay planted); stretch 0–1
   * straightens the legs and trails them back for a leap; armL/armR raise
   * the front legs; croak puffs the throat sac.
   */
  pose({
    x = 0, y = 0, z = 0, yaw = 0, pitch = 0, roll = 0,
    hop = 0, tilt = 0, lean = 0, squash = 0, crouch = 0, stretch = 0,
    armL = 0, armR = 0, wave = 0, nod = 0, turn = 0, cock = 0, croak = 0, blink = 0, glow = 0, crown = 1,
  } = {}) {
    this.group.position.set(x, y + hop, z);
    this.group.rotation.set(pitch, yaw, roll);
    const c = Math.min(1.2, crouch);
    const out = REST.out + c * 0.45 - stretch * 0.4;
    const knee = REST.knee + c * 1.0 - stretch * 0.85;
    const fwd = REST.fwd - c * 0.2 + stretch * 1.0;
    this.body.position.y = legHeight(out, knee, fwd) - REST_H;
    this.body.rotation.set(lean + c * 0.12 - stretch * 0.25, 0, tilt);
    this.body.scale.set(1 + squash * 0.12, 1 - squash * 0.15 + stretch * 0.06, 1 + squash * 0.08);
    this.head.rotation.set(-nod, turn, cock);
    this.legs.forEach(({ hip, ankle, foot }, i) => {
      const s = i ? 1 : -1;
      hip.rotation.set(fwd, 0, s * out);
      ankle.rotation.z = -s * knee;
      foot.rotation.set(-fwd + stretch * 0.5, 0, -s * (out - knee));
    });
    this.arms.forEach(({ shoulder }, i) => {
      const up = i ? armR : armL;
      const s = i ? 1 : -1;
      shoulder.rotation.set(-up * 0.6 + stretch * 0.5 - c * 0.5, 0, s * (0.22 + up * 1.35 + (i ? wave : 0) * 0.4 * Math.sin(wave * 20)));
    });
    for (const e of this.eyes) e.scale.set(1, Math.max(0.08, 1 - blink), 1);
    const puff = Math.max(0, croak);
    this.sac.visible = puff > 0.03;
    this.sac.scale.set(0.1 * (0.4 + puff * 0.8), 0.075 * (0.4 + puff * 0.8), 0.08 * (0.4 + puff * 0.9));
    if (this.crown) {
      this.crown.scale.setScalar(Math.max(0.0001, crown));
      this.crown.visible = crown > 0.001;
    }
    this.skin.userData.uniforms.uGlow.value = glow;
  }
}
