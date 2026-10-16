import * as THREE from "three";
import { seededRandom } from "@gizclaw/mvg-core/fx.js";
import { hash } from "@gizclaw/mvg-core/timing.js";
import { makePlanet } from "./space.js";

const PRIMES = new Set([2, 3, 5, 7, 11, 13, 17, 19, 23, 29]);
const RAINBOW = ["#ff3d7f", "#ff8c42", "#ff2e2e", "#fff6a0", "#9b5cff", "#3de8ff", "#7cff4f"];

const add = (opts = {}) => ({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, ...opts });
const greyOf = (c) => {
  const k = new THREE.Color(c);
  const l = (k.r + k.g + k.b) / 3;
  return k.setRGB(l, l, l);
};

/**
 * The accessory that gives each song's planet its own look, in units of the
 * planet radius. `kind` comes from the catalog (`feature`). Returns the
 * object and a per-frame `update(t, pulse)`; `sun` is the star's world
 * position for the lit pieces.
 */
export function makeFeature(kind, { colors, grey, sun, glow }) {
  const tint = (c) => (grey ? greyOf(c) : new THREE.Color(c));
  const group = new THREE.Group();
  const rand = seededRandom(kind.length * 97 + 13);
  let update = () => {};

  if (kind === "moons" || kind === "ellipse") {
    const n = kind === "moons" ? 3 : 1;
    const moons = Array.from({ length: n }, (_, i) => {
      const m = makePlanet({ colors: ["#d8d2c8", "#9b948a", "#5d5852"], look: "rock", seed: 40 + i, grey });
      m.material.uniforms.uSun.value.copy(sun);
      m.mesh.scale.setScalar(kind === "moons" ? 0.16 + i * 0.05 : 0.3);
      const pivot = new THREE.Group();
      pivot.rotation.set(rand() * 0.8 - 0.4, rand() * Math.PI, rand() * 0.5);
      pivot.add(m.mesh);
      group.add(pivot);
      return { m, pivot, r: 2.3 + i * 0.7, speed: 0.9 - i * 0.2 };
    });
    let trail = null;
    if (kind === "ellipse") {
      const pts = [];
      for (let i = 0; i <= 128; i++) {
        const a = (i / 128) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(a) * 3.2 - 1.2, 0, Math.sin(a) * 1.9));
      }
      trail = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial(add({ color: tint(colors[0]), opacity: 0.5 })));
      moons[0].pivot.add(trail);
    }
    update = (t) => {
      for (const o of moons) {
        const a = t * o.speed;
        if (kind === "ellipse") o.m.mesh.position.set(Math.cos(a * 1.4) * 3.2 - 1.2, 0, Math.sin(a * 1.4) * 1.9);
        else o.m.mesh.position.set(Math.cos(a) * o.r, 0, Math.sin(a) * o.r);
        o.m.mesh.updateMatrixWorld();
        o.m.material.uniforms.uTime.value = t;
      }
    };
  } else if (kind === "bands") {
    const rings = RAINBOW.map((c, i) => {
      const m = new THREE.Mesh(new THREE.TorusGeometry(1.55 + i * 0.13, 0.012, 6, 160), new THREE.MeshBasicMaterial(add({ color: tint(c) })));
      m.rotation.x = Math.PI / 2 + 0.35;
      group.add(m);
      return m;
    });
    update = (t, pulse) => {
      rings.forEach((m, i) => {
        m.rotation.z = t * (0.2 + i * 0.05);
        m.material.opacity = 0.45 + 0.55 * Math.max(0, Math.sin(t * 3 - i * 0.6)) * (0.5 + pulse);
      });
    };
  } else if (kind === "bits") {
    const n = 24;
    const mat = Array.from({ length: n }, () => new THREE.MeshBasicMaterial(add({ color: tint(colors[0]) })));
    const cubes = mat.map((m, i) => {
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), m);
      const a = (i / n) * Math.PI * 2;
      c.position.set(Math.cos(a) * 1.9, 0, Math.sin(a) * 1.9);
      group.add(c);
      return c;
    });
    group.rotation.x = 0.4;
    update = (t, pulse) => {
      group.rotation.y = t * 0.4;
      cubes.forEach((c, i) => {
        const on = hash(i * 7.1 + Math.floor(t * 4)) > 0.5;
        c.material.opacity = on ? 0.9 + pulse * 0.5 : 0.12;
        c.rotation.set(t + i, t * 1.3, 0);
      });
    };
  } else if (kind === "primes") {
    const n = 30;
    const dots = Array.from({ length: n }, (_, i) => {
      const prime = PRIMES.has(i + 1);
      const s = new THREE.Sprite(new THREE.SpriteMaterial(add({ map: glow, color: tint(prime ? colors[0] : "#ffffff"), opacity: prime ? 1 : 0.25 })));
      const a = (i / n) * Math.PI * 2;
      s.position.set(Math.cos(a) * 2.0, 0, Math.sin(a) * 2.0);
      s.scale.setScalar(prime ? 0.5 : 0.18);
      s.userData.prime = prime;
      group.add(s);
      return s;
    });
    group.rotation.x = -0.3;
    update = (t, pulse) => {
      group.rotation.y = -t * 0.25;
      for (const d of dots) if (d.userData.prime) d.scale.setScalar(0.45 + pulse * 0.35);
    };
  } else if (kind === "spiral") {
    const n = 900;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = i / n;
      const a = u * Math.PI * 2 * 3.14159;
      const r = 1.35 + u * 1.9;
      pos.set([Math.cos(a) * r, (rand() - 0.5) * 0.06, Math.sin(a) * r], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial(add({ map: glow, color: tint(colors[1]), size: 0.12, sizeAttenuation: true })));
    group.add(pts);
    group.rotation.x = 0.5;
    update = (t, pulse) => {
      group.rotation.y = t * 0.3;
      pts.material.size = 0.11 + pulse * 0.08;
    };
  } else if (kind === "crystals") {
    const geos = [new THREE.TetrahedronGeometry(0.4), new THREE.BoxGeometry(0.5, 0.5, 0.5), new THREE.OctahedronGeometry(0.4), new THREE.DodecahedronGeometry(0.38), new THREE.IcosahedronGeometry(0.38)];
    const shapes = geos.map((g, i) => {
      const l = new THREE.LineSegments(new THREE.EdgesGeometry(g), new THREE.LineBasicMaterial(add({ color: tint(colors[i % colors.length]) })));
      group.add(l);
      return l;
    });
    update = (t, pulse) => {
      shapes.forEach((s, i) => {
        const a = t * 0.5 + (i / shapes.length) * Math.PI * 2;
        s.position.set(Math.cos(a) * 2.3, Math.sin(a * 2) * 0.4, Math.sin(a) * 2.3);
        s.rotation.set(t * 0.9 + i, t * 1.2, 0);
        s.scale.setScalar(1 + pulse * 0.3);
      });
    };
  } else if (kind === "atoms") {
    const dirs = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]].map((d) => new THREE.Vector3(...d).normalize());
    dirs.forEach((d, i) => {
      const atom = new THREE.Mesh(new THREE.SphereGeometry(0.28, 24, 16), new THREE.MeshBasicMaterial({ color: tint(colors[i % colors.length]) }));
      atom.position.copy(d).multiplyScalar(2.1);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial(add({ map: glow, color: tint(colors[i % colors.length]), opacity: 0.8 })));
      halo.scale.setScalar(1.1);
      atom.add(halo);
      const bond = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.1, 8), new THREE.MeshBasicMaterial(add({ color: tint("#ffffff"), opacity: 0.5 })));
      bond.position.copy(d).multiplyScalar(1.5);
      bond.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
      group.add(atom, bond);
    });
    update = (t, pulse) => {
      group.rotation.set(t * 0.3, t * 0.45, 0);
      group.scale.setScalar(1 + pulse * 0.08);
    };
  } else if (kind === "vapor") {
    const n = 500;
    const seed = new Float32Array(n * 3);
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const u = rand() * 2 - 1;
      const a = rand() * Math.PI * 2;
      seed.set([a, u, rand()], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial(add({ map: glow, color: tint(colors[1]), size: 0.25, opacity: 0.6 })));
    group.add(pts);
    update = (t, pulse) => {
      for (let i = 0; i < n; i++) {
        const [a, u, k] = [seed[i * 3], seed[i * 3 + 1], seed[i * 3 + 2]];
        const life = (k + t * 0.12) % 1;
        const r = 1.05 + life * 1.3;
        const s = Math.sqrt(1 - u * u);
        pos.set([Math.cos(a + t * 0.1) * s * r, u * r + life * 0.4, Math.sin(a + t * 0.1) * s * r], i * 3);
      }
      geo.attributes.position.needsUpdate = true;
      pts.material.opacity = 0.45 + pulse * 0.4;
    };
  } else if (kind === "nested") {
    const rings = [1.5, 2.0, 2.7, 3.6].map((r, i) => {
      const m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.018 + i * 0.006, 6, 200), new THREE.MeshBasicMaterial(add({ color: tint(colors[i % colors.length]), opacity: 0.85 })));
      m.rotation.set(Math.PI / 2 + i * 0.25, i * 0.6, 0);
      group.add(m);
      return m;
    });
    update = (t, pulse) => {
      rings.forEach((m, i) => {
        m.rotation.z = t * (0.6 - i * 0.12) * (i % 2 ? -1 : 1);
        m.scale.setScalar(1 + pulse * 0.06 * (i + 1));
      });
    };
  } else if (kind === "flares") {
    const flares = Array.from({ length: 7 }, (_, i) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial(add({ map: glow, color: tint(colors[i % 2]) })));
      const u = rand() * 2 - 1;
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      s.position.set(Math.cos(a) * r * 1.02, u * 1.02, Math.sin(a) * r * 1.02);
      group.add(s);
      return { s, phase: rand() * 10 };
    });
    update = (t, pulse) => {
      group.rotation.y = t * 0.12;
      for (const f of flares) {
        const k = Math.max(0, Math.sin(t * 2 + f.phase));
        f.s.scale.setScalar(0.4 + k * 0.9 + pulse * 0.8);
        f.s.material.opacity = 0.4 + k * 0.6;
      }
    };
  }
  return { object: group, update };
}
