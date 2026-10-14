import * as THREE from "three";
import { makeRibbon } from "@gizclaw/mvg-core/fx.js";
import { FONT_COND, FONT_MONO, SAFE } from "@gizclaw/mvg-core/hud.js";
import { clamp, easeInOut, easeOutBack, easeOutCubic, hash, lerp, smooth } from "@gizclaw/mvg-core/timing.js";
import { makeBelt, makeRings, makeStarfield, makeSun, planetMaterial } from "./bodies.js";
import { PLANETS, PLUTO, SECTIONS, SUN_RADIUS, TITLE } from "./constants.js";

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const OMEGA = PLANETS.map((p) => 0.9 / Math.pow(p.R / PLANETS[0].R, 1.5));
const CHORUS_CUES = { chorus1: 10, chorus2: 24 };
const FIREWORKS = 6;
const SPARKS = 90;

export class SolarScene {
  constructor(ctx) {
    this.ctx = ctx;
    const { timing } = ctx;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#02030a");
    this.camera = new THREE.PerspectiveCamera(55, 9 / 16, 0.05, 600);

    this.stars = makeStarfield();
    this.scene.add(this.stars);
    this.sun = makeSun(SUN_RADIUS);
    this.scene.add(this.sun.group);
    const sunLight = new THREE.PointLight("#ffe2b0", 3.2, 0, 0);
    this.scene.add(sunLight, new THREE.AmbientLight("#334466", 0.35));

    this.planets = PLANETS.map((p) => {
      const mat = planetMaterial(p);
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), mat);
      const holder = new THREE.Group();
      holder.add(mesh);
      if (p.tilt) holder.rotation.z = p.tilt;
      let rings = null;
      if (p.rings) {
        rings = makeRings(1);
        rings.rotation.x = -Math.PI / 2 + 0.45;
        holder.add(rings);
      }
      this.scene.add(holder);
      const orbit = makeRibbon({ segments: 360, width: 0.04, color: p.color, uniforms: { uR: { value: p.R } }, path: `float a = u * 6.2831853; return vec3(cos(a) * uR, 0.0, sin(a) * uR);` });
      orbit.material.uniforms.uOpacity.value = 0;
      this.scene.add(orbit);
      return { p, mesh, mat, holder, rings, orbit };
    });

    this.belt = makeBelt(2200, 10.0, 11.6, 0.4, "#b8a48c", 0.04);
    this.kuiper = makeBelt(1400, 29, 40, 3, "#9fb6d8", 0.12);
    this.scene.add(this.belt, this.kuiper);

    this.pluto = new THREE.Mesh(
      new THREE.SphereGeometry(PLUTO.size, 48, 32),
      planetMaterial({ color: PLUTO.color, caps: 0, look: { a: "#a8917a", b: "#efe2cf", c: "#6e5644", bands: 0, warp: 0.5, scale: 3 } }),
    );
    this.pluto.position.set(...PLUTO.pos);
    this.scene.add(this.pluto);
    this.plutoOrbit = makeRibbon({
      segments: 400,
      width: 0.06,
      color: PLUTO.color,
      path: `float a = u * 6.2831853; vec3 p = vec3(cos(a) * 30.0 + 6.0, 0.0, sin(a) * 26.0); float c = cos(0.3), s = sin(0.3); return vec3(p.x, p.z * s * 0.5 + p.x * 0.06, p.z * c);`,
    });
    this.plutoOrbit.material.uniforms.uOpacity.value = 0;
    this.scene.add(this.plutoOrbit);

    this.earthClone = new THREE.Mesh(new THREE.SphereGeometry(PLANETS[2].size, 48, 32), planetMaterial(PLANETS[2]));
    this.scene.add(this.earthClone);

    this.buildFireworks();
    this.buildEvents(timing);
  }

  buildFireworks() {
    const n = FIREWORKS * SPARKS;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.fireworks = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.16, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.fireworks.frustumCulled = false;
    this.scene.add(this.fireworks);
  }

  buildEvents(timing) {
    const cues = timing.cues;
    const w = (ci, word, n = 0) => timing.wordTime(ci, word, n);
    const ids = PLANETS.map((p) => p.id);
    this.lineupBeats = [];
    const lb = timing.beatIndexAt(cues[1].start - 0.05) + 1;
    for (let k = 0; k < 8; k++) this.lineupBeats.push(timing.beatTime(lb + k));
    this.verseNames = { 0: cues[2].start, 1: cues[3].start, 2: cues[4].start, 3: cues[5].start, 4: cues[16].start, 5: cues[17].start, 6: cues[18].start, 7: cues[19].start };
    this.choruses = {};
    for (const [name, ci] of Object.entries(CHORUS_CUES)) {
      const names = [...ids.slice(0, 4).map((id) => w(ci + 2, id)), ...ids.slice(4).map((id) => w(ci + 3, id))];
      this.choruses[name] = {
        start: SECTIONS[name],
        end: name === "chorus1" ? SECTIONS.verse2 : SECTIONS.bridge,
        marches: [0, 1, 2].map((n) => w(ci, "march", n)),
        arc: cues[ci + 1].start,
        names,
        hooray: w(ci + 3, "hooray") ?? cues[ci + 3].end - 0.6,
        order: cues[ci + 4].start,
        eight: w(ci + 5, "eight") ?? cues[ci + 5].end - 0.6,
        last: cues[ci + 5].start,
      };
    }
    this.v2 = { orbits: cues[20].start, years: cues[21].start, order: cues[22].start, line: cues[23].start, flyby: cues[23].end + 0.4 };
    this.pl = { where: cues[30].start, orbits: cues[31].start, year: cues[32].start, dwarf: w(33, "dwarf") ?? cues[33].start, notIn: w(33, "not") ?? cues[33].start + 1.5, drift: cues[33].end + 0.2 };
    this.finale = { names: [...ids.slice(0, 4).map((id) => w(34, id)), ...ids.slice(4).map((id) => w(35, id))], eight: w(35, "eight") ?? cues[35].end - 2 };
  }

  orbitAngles(t, section) {
    const T = this.v2;
    if (section === "verse2" && t >= T.orbits - 0.3) {
      const k = easeInOut((t - T.orbits + 0.3) / 1.6);
      const back = easeInOut((t - T.line) / 1.8);
      return OMEGA.map((w) => {
        const raw = w * Math.max(0, t - T.orbits + 0.3) * 1.6 * k;
        return lerp(raw, Math.round(raw / (Math.PI * 2)) * Math.PI * 2, back);
      });
    }
    if (section === "finale") return OMEGA.map((w, i) => w * (t - SECTIONS.finale) * 1.2 + i * 0.35 * smooth(SECTIONS.finale, SECTIONS.finale + 3, t));
    if (section === "lineup") {
      return OMEGA.map((w, i) => {
        const free = 2.3 + i * 2.1 + w * (t - SECTIONS.lineup);
        const k = easeInOut((t - this.lineupBeats[i] + 0.25) / 0.5);
        return lerp(free, Math.ceil(free / (Math.PI * 2)) * Math.PI * 2, k);
      });
    }
    return OMEGA.map(() => 0);
  }

  planetScale(section, t) {
    if (section === "verse2" && t >= this.v2.orbits - 0.3 && t < this.v2.line + 1.5) return 1 + 1.6 * smooth(this.v2.orbits - 0.3, this.v2.orbits + 1.2, t) * (1 - smooth(this.v2.line, this.v2.line + 1.5, t));
    if (section === "finale") return 2.2;
    return 1;
  }

  tourPose(i, extraY = 0) {
    const p = this.planets[i];
    const P = p.holder.position;
    const s = p.p.size;
    const d = s * 3.6 + 0.7;
    return { pos: V(P.x - d * 0.4, P.y + d * (0.22 + extraY), P.z + d), look: V(P.x, P.y - s * 0.6, P.z) };
  }

  shots(t, section) {
    const T = this.v2;
    const PROC = { pos: V(-4.5, 6.2, 4.6), look: V(11, -0.5, 0) };
    if (section === "lineup") {
      const k = smooth(SECTIONS.lineup, this.lineupBeats[0], t);
      return [
        [SECTIONS.lineup, () => ({ pos: V(lerp(-1.2, -2.4, k), lerp(0.8, 2.6, k), lerp(6.4, 11.5, k)), look: V(0.5, 0.6, 0) }), 0],
        [this.lineupBeats[0] - 0.4, () => PROC, 0.9],
      ];
    }
    if (section === "verse1") {
      const n = this.verseNames;
      return [
        [SECTIONS.verse1, () => this.tourPose(0), 0.6],
        [n[1] - 0.75, () => this.tourPose(1), 0.7],
        [n[2] - 0.75, () => this.tourPose(2), 0.7],
        [n[3] - 0.75, () => this.tourPose(3), 0.7],
        [this.ctx.timing.cues[6].start - 0.5, () => ({ pos: V(1.5, 7.5, 12.5), look: V(6, -1.5, 0) }), 0.8],
        [this.ctx.timing.cues[7].start - 0.2, (tt) => {
          const a = -0.42 + (tt - this.ctx.timing.cues[7].start) * 0.2;
          return { pos: V(Math.cos(a) * 10.8, 0.35, Math.sin(a) * 10.8), look: V(Math.cos(a + 0.3) * 10.8, 0.1, Math.sin(a + 0.3) * 10.8) };
        }, 0.5],
        [this.ctx.timing.cues[8].start - 0.2, () => ({ pos: V(-3, 13, 16), look: V(12, -2, 0) }), 0.6],
        [this.ctx.timing.cues[9].start - 0.4, () => ({ pos: V(8.6, 0.9, 2.7), look: V(12.8, 0.3, 0) }), 0.8],
      ];
    }
    if (section === "verse2") {
      const n = this.verseNames;
      return [
        [SECTIONS.verse2, () => {
          const tp = this.tourPose(4);
          return { pos: tp.pos.clone().add(V(-0.8, 0.2, 0.8)), look: tp.look.clone().add(V(-0.9, 0, 0)) };
        }, 0.6],
        [n[5] - 0.75, () => this.tourPose(5, 0.35), 0.7],
        [n[6] - 0.75, () => this.tourPose(6), 0.7],
        [n[7] - 0.75, () => this.tourPose(7), 0.7],
        [T.orbits - 0.3, () => ({ pos: V(0, 80, 20), look: V(0, 0, 0) }), 1.4],
        [T.order - 0.3, () => ({ pos: V(0, 30, 44), look: V(0, -1, 0) }), 1.0],
        [T.line - 0.2, () => PROC, 1.2],
        [T.flyby, (tt) => {
          const x = -3 + (tt - T.flyby) * 5.2;
          return { pos: V(x, 1.4, 3.4), look: V(x + 9, -0.2, 0) };
        }, 0.8],
      ];
    }
    if (section === "chorus1" || section === "chorus2") {
      const c = this.choruses[section];
      const side = section === "chorus2" ? -1 : 1;
      const list = [[c.start, () => ({ pos: V(-3.5, 3.2, 5.5 * side), look: V(12, 0, 0) }), 0]];
      list.push([c.arc - 0.1, (tt) => {
        const a = (tt - c.arc) * 0.22 * side;
        return { pos: V(Math.cos(a + Math.PI) * 7 + 6, 4.2, Math.sin(a + Math.PI) * 7 * side + 4 * side), look: V(10, 0, 0) };
      }, 0.5]);
      c.names.forEach((nt, i) => nt !== null && list.push([nt - 0.08, () => this.tourPose(i), 0.12]));
      list.push([c.order - 0.1, () => ({ pos: V(4, 14, 17 * side), look: V(12, 0, 0) }), 0.4]);
      list.push([c.last - 0.1, () => ({ pos: V(-2.5, 1.1, 3.2 * side), look: V(12, 1.6, 0) }), 0.3]);
      return list;
    }
    if (section === "bridge") {
      const P = V(...PLUTO.pos);
      const L = this.pl;
      return [
        [SECTIONS.bridge, (tt) => {
          const k = easeInOut((tt - L.where) / 2.6);
          return { pos: V(18, 2.5, 6).lerp(P.clone().add(V(-1.4, 0.4, 2.0)), k), look: V(23.6, 0, 0).lerp(P, k) };
        }, 0],
        [L.orbits - 0.3, () => ({ pos: V(12, 26, 44), look: V(14, 0, -3) }), 1.0],
        [L.year - 0.2, () => ({ pos: P.clone().add(V(-0.8, 0.25, 1.15)), look: P.clone().add(V(0, -0.12, 0)) }), 0.9],
        [L.notIn - 0.2, () => ({ pos: V(14, 9, 25), look: V(16, 1, -3) }), 1.4],
        [L.drift, (tt) => {
          const k = smooth(L.drift, SECTIONS.finale, tt);
          return { pos: V(lerp(14, 4, k), lerp(9, 16, k), lerp(25, 30, k)), look: V(lerp(16, 0, k), 0, 0) };
        }, 2.0],
      ];
    }
    if (section === "finale") {
      return [[SECTIONS.finale, (tt) => {
        const a = (tt - SECTIONS.finale) * 0.07;
        return { pos: V(Math.sin(a) * 50, 40, Math.cos(a) * 50), look: V(0, -2, 0) };
      }, 0.6]];
    }
    return [[0, () => PROC, 0]];
  }

  cameraPose(t, section) {
    const list = this.shots(t, section);
    let k = 0;
    for (let i = 0; i < list.length; i++) if (t >= list[i][0]) k = i;
    const [st, fn, blend] = list[k];
    const cur = fn(t);
    if (k === 0 || blend <= 0 || t - st >= blend) return cur;
    const prev = list[k - 1][1](t);
    const e = easeInOut((t - st) / blend);
    return { pos: prev.pos.clone().lerp(cur.pos, e), look: prev.look.clone().lerp(cur.look, e) };
  }

  update(t, section) {
    const { timing, hud } = this.ctx;
    const kick = timing.pulse(t, 0.14);
    const bf = timing.beatFloat(t);
    const chorus = this.choruses[section];
    this.sun.uniforms.uTime.value = t;
    this.sun.uniforms.uPulse.value = kick;

    // Planet layout.
    const angles = this.orbitAngles(t, section);
    const scale = this.planetScale(section, t);
    let named = -1;
    let namedAt = -99;
    const nameTimes = section === "verse1" || section === "verse2" ? this.verseNames : chorus ? Object.fromEntries(chorus.names.map((x, i) => [i, x])) : section === "finale" ? Object.fromEntries(this.finale.names.map((x, i) => [i, x])) : {};
    for (const [i, nt] of Object.entries(nameTimes)) if (nt !== null && t >= nt - 0.1 && nt > namedAt) [named, namedAt] = [Number(i), nt];
    this.planets.forEach((pl, i) => {
      const a = angles[i];
      let y = 0;
      if (chorus) y = Math.abs(Math.sin(Math.PI * bf)) * 0.35 * (0.6 + pl.p.size * 0.4);
      pl.holder.position.set(Math.cos(a) * pl.p.R, y, -Math.sin(a) * pl.p.R);
      const pop = named === i ? 1 + 0.25 * Math.exp(-(t - namedAt) / 0.25) : 1;
      pl.holder.scale.setScalar(pl.p.size * scale * pop);
      pl.mesh.rotation.y = t * (0.3 + 0.15 * i);
      pl.mat.uniforms.uTime.value = t;
      pl.mat.uniforms.uFlash.value = named === i ? Math.exp(-(t - namedAt) / 0.2) * 0.6 : 0;
      if (chorus) pl.holder.rotation.z = (pl.p.tilt || 0) + Math.sin(Math.PI * bf) * 0.08;
      const orbitsOn = section === "finale" ? 0.9 : section === "verse2" ? smooth(this.v2.orbits - 0.3, this.v2.orbits + 0.8, t) * (1 - smooth(this.v2.line + 0.5, this.v2.line + 2, t)) : section === "bridge" ? 0.25 : 0.12;
      let ringPulse = 0;
      if (section === "verse2" && t >= this.v2.order) ringPulse = Math.exp(-Math.abs(t - this.v2.order - i * 0.32) / 0.12);
      if (section === "finale" && this.finale.names[i] !== null && t >= this.finale.names[i]) ringPulse = Math.exp(-(t - this.finale.names[i]) / 0.5);
      pl.orbit.material.uniforms.uOpacity.value = orbitsOn * (0.6 + kick * 0.3) + ringPulse;
      pl.orbit.material.uniforms.uWidth.value = section === "verse2" || section === "finale" ? 0.09 + ringPulse * 0.12 : 0.04;
    });

    this.belt.rotation.y = t * 0.02;
    const closeOuter = (section === "verse2" && t < this.v2.orbits - 0.3) || (chorus && named >= 3 && t < chorus.order) || (section === "verse1" && t >= this.ctx.timing.cues[9].start - 0.4);
    this.belt.visible = !closeOuter;
    this.kuiper.rotation.y = t * 0.006;
    this.pluto.rotation.y = t * 0.2;
    this.pluto.material.uniforms.uSun.value.set(0, 0, 0);
    this.pluto.material.uniforms.uTime.value = t;
    this.pluto.material.uniforms.uAmbient.value = 0.18;
    const dwarfAge = section === "bridge" ? t - this.pl.dwarf : -1;
    this.pluto.material.uniforms.uFlash.value = dwarfAge > 0 ? Math.exp(-dwarfAge / 0.25) * 0.8 : 0;
    this.plutoOrbit.material.uniforms.uOpacity.value = section === "bridge" ? smooth(this.pl.orbits, this.pl.orbits + 0.8, t) * (1 - smooth(this.pl.notIn, this.pl.notIn + 1, t)) * 0.8 : 0;

    const jup = this.planets[4].holder.position;
    const showClone = section === "verse2" && t < this.verseNames[5] - 0.6;
    this.earthClone.visible = showClone;
    this.earthClone.position.set(jup.x - 2.1, jup.y - 0.3, jup.z + 0.6);
    this.earthClone.material.uniforms.uSun.value.set(0, 0, 0);
    this.earthClone.material.uniforms.uTime.value = t;

    this.updateFireworks(t, chorus);

    // Camera.
    const pose = this.cameraPose(t, section);
    this.camera.position.copy(pose.pos);
    this.camera.lookAt(pose.look);
    this.camera.fov = 55 - kick * 2.5;
    this.camera.updateProjectionMatrix();
    this.sun.corona.quaternion.copy(this.camera.quaternion);
    this.planets.forEach((pl) => pl.mat.uniforms.uSun.value.set(0, 0, 0));
    this.stars.position.copy(this.camera.position);

    const post = { bloom: [0.75, 0.5, 0.55], ca: 0.2 + kick * 0.35, vignette: 0.55 };
    return this.hudAndPost(t, section, post, { named, namedAt, chorus, kick });
  }

  updateFireworks(t, chorus) {
    const pos = this.fireworks.geometry.attributes.position;
    const col = this.fireworks.geometry.attributes.color;
    const bursts = [];
    if (chorus) {
      for (const [k, bt] of [chorus.hooray, chorus.eight].entries()) if (bt !== null) for (let j = 0; j < 3; j++) bursts.push({ t0: bt + j * 0.18, seed: k * 3 + j });
    }
    const c = new THREE.Color();
    for (let b = 0; b < FIREWORKS; b++) {
      const burst = bursts[b];
      for (let s = 0; s < SPARKS; s++) {
        const idx = b * SPARKS + s;
        const age = burst ? t - burst.t0 : -1;
        if (!burst || age < 0 || age > 1.6) {
          pos.setXYZ(idx, 0, -999, 0);
          col.setXYZ(idx, 0, 0, 0);
          continue;
        }
        const seed = burst.seed * 97 + s;
        const center = V(4 + hash(burst.seed * 5.1) * 14, 3.5 + hash(burst.seed * 2.3) * 3, -2 + hash(burst.seed * 7.7) * 4);
        const th = hash(seed * 1.3) * Math.PI * 2;
        const ph = Math.acos(hash(seed * 2.9) * 2 - 1);
        const sp = 2.2 + hash(seed * 4.7) * 1.2;
        const r = sp * (1 - Math.exp(-age * 3));
        pos.setXYZ(idx, center.x + Math.sin(ph) * Math.cos(th) * r, center.y + Math.cos(ph) * r - age * age * 0.8, center.z + Math.sin(ph) * Math.sin(th) * r);
        c.set(PLANETS[(burst.seed + s) % 8].color).multiplyScalar(1.6 * Math.max(0, 1 - age / 1.6));
        col.setXYZ(idx, c.r, c.g, c.b);
      }
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
  }

  orderDots(t, active, opacity = 1, { pluto = 0 } = {}) {
    const { hud } = this.ctx;
    const ctx = hud.ctx;
    const y = SAFE.top + 60;
    const n = pluto > 0 ? 9 : 8;
    const gap = 96;
    const x0 = 540 - ((n - 1) * gap) / 2;
    if (opacity > 0.05) hud.keepout(x0 - 30, y - 30, x0 + (n - 1) * gap + 30, y + 55);
    ctx.save();
    for (let i = 0; i < n; i++) {
      const isPluto = i === 8;
      const color = isPluto ? PLUTO.color : PLANETS[i].color;
      const on = active === i ? 1 : 0;
      const r = isPluto ? 9 : 10 + PLANETS[i].size * 9 + on * 8;
      ctx.globalAlpha = opacity * (isPluto ? pluto : 0.55 + on * 0.45);
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = on ? 26 : 8;
      ctx.beginPath();
      ctx.arc(x0 + i * gap, y, r, 0, Math.PI * 2);
      if (isPluto) {
        ctx.lineWidth = 3;
        ctx.strokeStyle = color;
        ctx.stroke();
      } else ctx.fill();
      ctx.shadowBlur = 0;
      hud.font(18, 700, FONT_MONO);
      ctx.textAlign = "center";
      ctx.fillStyle = "#ffffff";
      ctx.fillText(isPluto ? "×" : String(i + 1), x0 + i * gap, y + 44);
    }
    ctx.restore();
  }

  hudAndPost(t, section, post, { named, namedAt, chorus, kick }) {
    const { hud, timing } = this.ctx;
    const label = (i, t0, t1) => {
      const p = PLANETS[i];
      hud.slam(p.name, t, t0, t1, { y: 1010, size: 150, color: p.color, sub: `${p.ord} · ${p.fact}`, angle: -0.03 });
    };
    if (section === "lineup") {
      hud.title(t, SECTIONS.lineup + 0.1, this.lineupBeats[0] - 0.2, TITLE);
      this.orderDots(t, -1, smooth(this.lineupBeats[0] - 0.3, this.lineupBeats[0], t));
      this.lineupBeats.forEach((bt, i) => t >= bt && t < bt + 0.12 && (post.flash = Math.max(post.flash || 0, 0.12)));
      const k = this.lineupBeats.filter((bt) => t >= bt).length;
      if (k > 0) this.orderDots(t, k - 1, 1);
      if (t - SECTIONS.lineup < 0.3) post.flash = Math.max(post.flash || 0, Math.exp(-(t - SECTIONS.lineup) / 0.12) * 0.6);
    }
    if (section === "verse1" || section === "verse2") {
      const idx = section === "verse1" ? [0, 1, 2, 3] : [4, 5, 6, 7];
      idx.forEach((i, k) => {
        const nt = this.verseNames[i];
        const next = k < 3 ? this.verseNames[idx[k + 1]] : nt + 3.6;
        label(i, nt, Math.min(next - 0.8, nt + 3.2));
        if (t >= nt && t < nt + 0.15) post.flash = Math.max(post.flash || 0, (1 - (t - nt) / 0.15) * 0.25);
      });
      this.orderDots(t, named, 1);
      if (section === "verse1") {
        const cue = timing.cues;
        hud.slam("ROCKY 4", t, cue[6].start, cue[7].start - 0.1, { y: 640, size: 150, color: "#e0a070", sub: "inner planets" });
        hud.slam("ASTEROID BELT", t, cue[7].start, cue[8].start - 0.1, { y: 640, size: 130, color: "#d8c3a5" });
        hud.slam("GIANTS AHEAD", t, cue[9].start, SECTIONS.chorus1 - 0.2, { y: 640, size: 140, color: PLANETS[4].color });
      } else {
        if (this.earthClone.visible) {
          const p = this.earthClone.position.clone().project(this.camera);
          hud.text("EARTH", (p.x * 0.5 + 0.5) * 1080, (-p.y * 0.5 + 0.5) * 1920 + 70, { size: 30, weight: 700, family: FONT_MONO, color: PLANETS[2].color, alpha: smooth(this.verseNames[4] + 0.5, this.verseNames[4] + 0.9, t) });
        }
        const T = this.v2;
        hud.slam("ORBITS", t, T.orbits, T.years - 0.1, { y: 640, size: 170, color: "#ffffff", sub: "held by gravity" });
        if (t >= T.years && t < T.order) {
          this.planets.forEach((pl) => {
            const p = pl.holder.position.clone().project(this.camera);
            hud.text(pl.p.year, (p.x * 0.5 + 0.5) * 1080, (-p.y * 0.5 + 0.5) * 1920 - 38, { size: 24, weight: 700, family: FONT_MONO, color: pl.p.color, alpha: smooth(T.years, T.years + 0.4, t), glow: 10 });
          });
        }
        hud.slam("SAME ORDER", t, T.order, T.line - 0.1, { y: 640, size: 150, color: "#ffffff", sub: "Mercury → Neptune" });
        if (t >= T.orbits - 0.3 && t < T.orbits) post.flash = smooth(T.orbits - 0.3, T.orbits, t) * 0.4;
      }
      if (t - (section === "verse1" ? SECTIONS.verse1 : SECTIONS.verse2) < 0.3) post.flash = Math.max(post.flash || 0, 0.4 * Math.exp(-(t - (section === "verse1" ? SECTIONS.verse1 : SECTIONS.verse2)) / 0.1));
    }
    if (chorus) {
      this.orderDots(t, named, 1);
      for (const m of chorus.marches) if (m !== null && t >= m && t < m + 0.12) post.flash = Math.max(post.flash || 0, (1 - (t - m) / 0.12) * 0.3);
      chorus.marches.forEach((m, i) => m !== null && hud.stamp("MARCH", t, m, { x: 540, y: 520 + i * 130, size: 110, color: "#ffb347", angle: i % 2 ? 0.08 : -0.08, life: 0.5 }));
      chorus.names.forEach((nt, i) => {
        if (nt === null) return;
        const next = chorus.names[i + 1] ?? chorus.order;
        hud.slam(PLANETS[i].name, t, nt, Math.min(next, nt + 1.2) - 0.05, { y: 1010, size: 150, color: PLANETS[i].color, angle: i % 2 ? 0.04 : -0.04 });
        if (t >= nt && t < nt + 0.1) post.flash = Math.max(post.flash || 0, 0.18);
      });
      if (t >= chorus.order && t < chorus.last) {
        this.planets.forEach((pl, i) => {
          const at = chorus.order + i * 0.3;
          const p = pl.holder.position.clone().add(V(0, pl.p.size + 0.5, 0)).project(this.camera);
          const a = smooth(at, at + 0.12, t);
          hud.text(String(i + 1), (p.x * 0.5 + 0.5) * 1080, (-p.y * 0.5 + 0.5) * 1920, { size: Math.round(40 + 28 * Math.exp(-(t - at) / 0.15) * a), weight: 800, family: FONT_COND, color: pl.p.color, alpha: a, glow: 18 });
        });
      }
      hud.slam("8", t, chorus.eight, chorus.end - 0.2, { y: 700, size: 360, color: "#ffffff", sub: "planets", angle: 0 });
      const ch = chorus.hooray;
      if (ch !== null) hud.stamp("HOORAY!", t, ch, { x: 540, y: 600, size: 130, color: "#7cff4f", angle: -0.1, life: 0.9 });
      if (t - chorus.start < 0.3) post.flash = Math.max(post.flash || 0, Math.exp(-(t - chorus.start) / 0.1) * 0.7);
      if (t > chorus.end - 0.25) post.flash = Math.max(post.flash || 0, smooth(chorus.end - 0.25, chorus.end, t) * 0.6);
      post.ca += kick * 0.3;
    }
    if (section === "bridge") {
      const L = this.pl;
      this.orderDots(t, -1, 1, { pluto: smooth(L.where, L.where + 0.5, t) * (1 - 0.7 * smooth(L.notIn, L.notIn + 0.6, t)) });
      hud.slam("FAR BEYOND", t, L.where + 1.0, L.orbits - 0.2, { y: 640, size: 140, color: "#bcd3ff", sub: "the Kuiper belt" });
      hud.slam("2006", t, L.year + 0.4, L.dwarf - 0.6, { y: 990, size: 220, color: "#ffffff", sub: "reclassified", angle: 0 });
      hud.stamp("DWARF PLANET", t, L.dwarf, { x: 540, y: 660, size: 100, color: "#ff5d7a", angle: -0.12, life: L.drift - L.dwarf + 1.5 });
      if (t >= L.notIn) hud.text("8 PLANETS  ·  1 DWARF", 540, 820, { size: 40, weight: 700, family: FONT_MONO, alpha: smooth(L.notIn + 0.3, L.notIn + 0.8, t) * (1 - smooth(L.drift + 1.5, L.drift + 2.5, t)), color: "#ffffff" });
      if (t >= L.dwarf && t < L.dwarf + 0.12) post.flash = 0.35;
      if (t - SECTIONS.bridge < 0.3) post.flash = Math.max(post.flash || 0, Math.exp(-(t - SECTIONS.bridge) / 0.1) * 0.5);
      post.sat = 0.75 + 0.25 * smooth(SECTIONS.finale - 2.5, SECTIONS.finale, t);
      if (t > SECTIONS.finale - 0.3) post.flash = Math.max(post.flash || 0, smooth(SECTIONS.finale - 0.3, SECTIONS.finale, t) * 0.9);
    }
    if (section === "finale") {
      this.orderDots(t, named, 1);
      this.finale.names.forEach((nt, i) => {
        if (nt === null) return;
        const p = this.planets[i].holder.position.clone().add(V(0, this.planets[i].p.size * 2.2 + 1.2, 0)).project(this.camera);
        const a = smooth(nt, nt + 0.15, t) * (1 - smooth(SECTIONS.end - 0.6, SECTIONS.end - 0.1, t));
        hud.text(PLANETS[i].name, (p.x * 0.5 + 0.5) * 1080, (-p.y * 0.5 + 0.5) * 1920, { size: Math.round(30 + 24 * Math.exp(-(t - nt) / 0.2) * a), weight: 800, family: FONT_COND, color: PLANETS[i].color, alpha: a, glow: 16 });
        if (t >= nt && t < nt + 0.1) post.flash = Math.max(post.flash || 0, 0.2);
      });
      hud.slam("8 AROUND OUR STAR", t, this.finale.eight, SECTIONS.end - 0.3, { y: 520, size: 110, color: "#ffd36b", angle: -0.03 });
      if (t - SECTIONS.finale < 0.4) post.flash = Math.max(post.flash || 0, Math.exp(-(t - SECTIONS.finale) / 0.15) * 0.8);
      if (t > SECTIONS.end - 0.3) post.flash = Math.max(post.flash || 0, smooth(SECTIONS.end - 0.3, SECTIONS.end, t));
    }
    return post;
  }
}
