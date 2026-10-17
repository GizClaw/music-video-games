import * as THREE from "three";
import { STATES } from "./song.js";

const TAU = Math.PI * 2;

/** A little floating home for the chosen character, separate from the track.
 * Materials and geometry belong to the main scene's disposal registry. */
export class ElementGarden {
  constructor(owner) {
    this.owner = owner;
    this.root = new THREE.Group();
    this.stage = new THREE.Group();
    this.root.add(this.stage);
    owner.scene.add(this.root);
    this.tint = new THREE.Color(STATES[1].color);
    this.targetTint = new THREE.Color();

    const porcelain = owner.material("#b3ccd8", { roughness: .24, metalness: .2, clearcoat: 1 });
    this.rim = owner.material("#7de7d6", { roughness: .2, metalness: .3, emissive: "#7de7d6", emissiveIntensity: .45 });
    this.surface = owner.material("#509fbd", { roughness: .22, metalness: .22, clearcoat: 1 });
    owner.mesh(this.stage, new THREE.CylinderGeometry(2.72, 2.5, .32, 96), porcelain, 0, -.20);
    owner.mesh(this.stage, new THREE.CylinderGeometry(2.64, 2.64, .09, 96), this.rim, 0, -.04);
    owner.mesh(this.stage, new THREE.CylinderGeometry(2.51, 2.58, .12, 96), this.surface, 0, .045);
    const lip = owner.ring(this.stage, 2.59, .085, porcelain, 0, .095);
    lip.rotation.x = Math.PI / 2;
    const underside = owner.sphere(this.stage, 2.48, porcelain, 0, -.35);
    underside.scale.set(1, .18, 1);
    this.underGlow = owner.sprite(this.stage, STATES[1].color, 8, 0, -.65, -.5, .24);
    const dots = owner.geometry(new THREE.SphereGeometry(.045, 12, 8));
    for (let i = 0; i < 36; i++) {
      const a = i / 36 * TAU;
      owner.mesh(this.stage, dots, this.rim, Math.cos(a) * 2.68, -.15, Math.sin(a) * 2.68);
    }

    this.forms = STATES.map(() => { const g = new THREE.Group(); this.stage.add(g); return g; });
    const frost = owner.material("#b6eaff", { transmission: .35, thickness: .6, roughness: .12, clearcoat: 1 });
    for (let i = 0; i < 8; i++) {
      const a = i * TAU / 8;
      const ice = owner.box(this.forms[0], [.3 + i % 2 * .15, .6 + i % 3 * .2, .4], frost, Math.cos(a) * 2.2, .36, Math.sin(a) * 2.2, .08);
      ice.rotation.set(.1 * Math.sin(a), a, .18 * Math.cos(a));
      const inner = owner.box(ice, [.14, .32, .18], porcelain, 0, -.07, 0, .04);
      inner.material = frost;
    }
    const water = owner.material("#65d5cc", { transmission: .32, thickness: .3, roughness: .08, clearcoat: 1 });
    owner.mesh(this.forms[1], new THREE.CylinderGeometry(2.48, 2.48, .08, 96), water, 0, .15);
    this.ripples = [1.3, 1.8, 2.3].map((r) => {
      const ring = owner.ring(this.forms[1], r, .018, owner.lights[1], 0, .21);
      ring.rotation.x = Math.PI / 2;
      return ring;
    });
    const cloud = owner.material("#f5e3c5", { roughness: .7, clearcoat: .1 });
    for (let i = 0; i < 11; i++) {
      const a = i / 11 * TAU;
      const puff = owner.sphere(this.forms[2], .44 + .17 * Math.sin(i * 3), cloud, Math.cos(a) * 2.2, .2, Math.sin(a) * 2.2);
      puff.scale.set(1.2, .75, 1);
    }
    this.orbits = [];
    for (let i = 0; i < 3; i++) {
      const orbit = owner.ring(this.forms[3], 2.46 + .14 * i, .025, owner.lights[3], 0, .65 + i * .18);
      orbit.rotation.set(Math.PI / 2 - .13, .23 * i, i * .7);
      const mote = owner.sphere(orbit, .1, owner.lights[3], 2.46 + .14 * i);
      mote.userData.radius = 2.46 + .14 * i;
      this.orbits.push({ orbit, mote });
    }
    this.bubbles = [];
    for (let i = 0; i < 16; i++) {
      const bubble = owner.sphere(this.stage, .045 + i % 4 * .025, frost);
      this.bubbles.push(bubble);
    }
    this.fireflies = [];
    for (let i = 0; i < 32; i++) {
      const a = i * 2.399;
      const r = 4 + i % 7;
      const firefly = owner.sprite(this.root, i % 3 ? "#a8e5fb" : "#ffe2b3", .08 + i % 3 * .06, Math.cos(a) * r, Math.sin(a) * r + 2, -4 - i % 9, .55);
      this.fireflies.push(firefly);
    }
  }

  update(t, dt, phase, x, reduced) {
    const smooth = 1 - Math.exp(-dt * 4);
    this.targetTint.set(STATES[phase].color);
    this.tint.lerp(this.targetTint, smooth);
    this.rim.color.copy(this.tint);
    this.rim.emissive.copy(this.tint);
    this.surface.color.copy(this.tint).multiplyScalar(.5);
    this.underGlow.material.color.copy(this.tint);
    this.stage.position.set(x, reduced ? 0 : Math.sin(t * 1.2) * .045, 0);
    this.forms.forEach((form, i) => { form.visible = i === phase; });
    this.ripples.forEach((ring, i) => ring.scale.setScalar(1 + (reduced ? 0 : Math.sin(t * 2 - i) * .035)));
    this.orbits.forEach(({ orbit, mote }, i) => {
      const a = (reduced ? 0 : t * .6) + i * TAU / 3;
      mote.position.set(Math.cos(a) * mote.userData.radius, Math.sin(a) * mote.userData.radius, 0);
      orbit.rotation.y = i * .23 + (reduced ? 0 : Math.sin(t * .5) * .1);
    });
    this.bubbles.forEach((bubble, i) => {
      const a = i * 2.399 + (reduced ? 0 : t * .14);
      bubble.position.set(Math.cos(a) * (2.4 + i % 3 * .2), .3 + ((i * .33 + (reduced ? 0 : t * .22)) % 3.5), Math.sin(a) * 2.4);
      bubble.material = phase === 1 ? this.owner.phaseMats[1] : this.owner.lights[phase];
      bubble.scale.setScalar(phase === 2 ? 2.3 : 1);
    });
    this.fireflies.forEach((sprite, i) => { sprite.material.opacity = reduced ? .5 : .3 + .3 * Math.sin(t * .8 + i) ** 2; });
  }
}
