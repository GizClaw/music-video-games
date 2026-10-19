import * as THREE from "three";

// Local -Z is forward. The trails use these same exhaust ports, including scale/bank.
export const ENGINE_PORTS = [-1, 1].map((side) => new THREE.Vector3(side * .85, -.19, 1.12));

/** Soft, tapered airfoils, rather than slabs. Each station is [span, leading, trailing, rise, thickness]. */
function wingGeometry(stations, side, tipColor) {
  const positions = [], indices = [], colors = [], spans = 28, chords = 24;
  const curves = [1, 2, 3, 4].map((axis) => new THREE.CatmullRomCurve3(stations.map((p) => new THREE.Vector3(p[0], p[axis], 0))));
  const pearl = new THREE.Color("#fff6df"), tip = new THREE.Color(tipColor);
  for (let i = 0; i <= spans; i++) {
    const u = i / spans, [lead, trail, rise, thickness] = curves.map((c) => c.getPoint(u));
    for (let j = 0; j <= chords; j++) {
      const a = j / chords * Math.PI * 2, chord = (1 - Math.cos(a)) / 2;
      const y = rise.y + Math.sin(a) * thickness.y * (a <= Math.PI ? .6 : .28);
      positions.push(side * lead.x, y, THREE.MathUtils.lerp(lead.y, trail.y, chord));
      const color = pearl.clone().lerp(tip, THREE.MathUtils.smoothstep(u, .78, .88));
      colors.push(color.r, color.g, color.b);
      if (i < spans && j < chords) {
        const k = i * (chords + 1) + j, n = k + chords + 1;
        indices.push(...(side > 0 ? [k, k + 1, n, k + 1, n + 1, n] : [k, n, k + 1, k + 1, n, n + 1]));
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

/** An unmanned pearl-and-teal touring aircraft; every visible part belongs to the plane. */
export function createAircraft(owner) {
  const root = new THREE.Group(); root.name = "sky-turn-aircraft";
  const body = new THREE.Group(); root.add(body);
  const pearl = owner.material("#fff6df", { roughness: .25, metalness: .08, clearcoat: 1 });
  const teal = owner.material("#279f9f", { roughness: .23, metalness: .16, clearcoat: 1 });
  const coral = owner.material("#f4a060", { roughness: .27, clearcoat: 1 });
  const gold = owner.material("#f3cb86", { metalness: .65, roughness: .24 });
  const glass = owner.material("#155f79", { roughness: .12, metalness: .42, clearcoat: 1, clearcoatRoughness: .08 });
  const dark = owner.material("#224451", { roughness: .38, metalness: .3 });
  const seam = owner.material("#78aaa9", { roughness: .5 });
  const glow = owner.material("#c1fff1", { emissive: "#58decd", emissiveIntensity: 1.35, roughness: .25 });
  const wingMaterial = owner.material("#ffffff", { vertexColors: true, roughness: .28, metalness: .08, clearcoat: 1 });
  const sphere = (radius, material, position, scale = [1, 1, 1], parent = body) => {
    const m = owner.mesh(new THREE.SphereGeometry(radius, 32, 20), material, parent);
    m.position.set(...position); m.scale.set(...scale); return m;
  };
  const line = (points, radius, material, parent = body) => owner.mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p))), 40, radius, 6, false), material, parent);
  const hull = (profile, material, parent = body) => {
    const curve = new THREE.SplineCurve(profile.map(([z, r]) => new THREE.Vector2(r, z)));
    const m = owner.mesh(new THREE.LatheGeometry(curve.getPoints(64), 48), material, parent);
    m.rotation.x = Math.PI / 2; return m;
  };
  const fuselage = hull([[-2.06, 0], [-1.92, .12], [-1.63, .25], [-1.18, .37], [-.55, .44], [.15, .43], [.8, .3], [1.48, .15], [1.94, .025], [1.98, 0]], pearl);
  fuselage.scale.z = .82;
  const belly = sphere(1, teal, [0, -.12, -.13], [.37, .255, 1.4]);
  belly.name = "painted-belly";
  const nose = sphere(.12, coral, [0, -.006, -1.94], [.95, .8, 1]); nose.name = "aircraft-nose";
  // Dark glazed canopy, edged in satin metal. No avatar or face inside it.
  sphere(1, gold, [0, .265, -.55], [.308, .15, .67]);
  const canopy = sphere(1, glass, [0, .285, -.56], [.285, .245, .63]); canopy.name = "canopy";
  line([[-.26, .34, -.75], [-.17, .49, -.7], [0, .531, -.67], [.17, .49, -.7], [.26, .34, -.75]], .012, pearl);
  for (const side of [-1, 1]) {
    line([[side * .17, .02, -1.78], [side * .35, .07, -1.2], [side * .431, .07, -.4], [side * .36, .055, .42], [side * .2, .04, 1.2]], .018, teal);
    line([[side * .23, -.025, -1.5], [side * .4, -.025, -.7], [side * .39, -.025, .15], [side * .28, -.025, .8]], .008, gold);
    const wing = owner.mesh(wingGeometry([[.27, -.61, .96, -.025, .18], [.72, -.43, .98, -.005, .15], [1.35, -.04, .91, .025, .12], [1.84, .32, .81, .1, .07], [2.13, .57, .77, .23, .03], [2.2, .7, .73, .31, .005]], side, "#f5a26b"), wingMaterial, body);
    wing.name = side < 0 ? "port-wing" : "starboard-wing";
    line([[side * .53, .083, -.35], [side * 1.01, .096, -.12], [side * 1.49, .12, .18], [side * 1.87, .18, .48]], .022, teal);
    line([[side * .83, .055, .82], [side * 1.35, .075, .78], [side * 1.75, .115, .72]], .008, seam);
    sphere(.045, side < 0 ? coral : glow, [side * 2.16, .295, .715], [.7, .65, 1.4]);
    // Real intakes at the front, turbine cores and a small luminous exhaust behind.
    const engine = new THREE.Group(); engine.position.set(side * .85, -.19, .46); body.add(engine);
    hull([[-.74, .115], [-.63, .18], [-.35, .205], [.22, .2], [.52, .155], [.65, .123]], pearl, engine);
    const intake = owner.mesh(new THREE.TorusGeometry(.137, .024, 10, 36), gold, engine); intake.position.z = -.7;
    sphere(.133, dark, [0, 0, -.706], [1, 1, .12], engine);
    sphere(.047, teal, [0, 0, -.73], [1, 1, 1.7], engine);
    for (let i = 0; i < 7; i++) {
      const a = i / 7 * Math.PI * 2;
      line([[Math.cos(a) * .05, Math.sin(a) * .05, -.727], [Math.cos(a + .35) * .113, Math.sin(a + .35) * .113, -.718]], .009, seam, engine);
    }
    const nozzle = owner.mesh(new THREE.TorusGeometry(.127, .025, 10, 36), dark, engine); nozzle.position.z = .63;
    sphere(.105, glow, [0, 0, .66], [1, 1, .32], engine);
    const stabilizer = owner.mesh(wingGeometry([[.08, 1.11, 1.78, .15, .085], [.52, 1.32, 1.82, .19, .055], [.96, 1.67, 1.83, .28, .02], [1.01, 1.78, 1.82, .31, .005]], side, "#39aaaa"), wingMaterial, body);
    stabilizer.name = "tailplane";
  }
  const finShape = new THREE.Shape();
  finShape.moveTo(.93, .14); finShape.lineTo(1.35, .97); finShape.quadraticCurveTo(1.41, 1.1, 1.56, 1.06);
  finShape.lineTo(1.86, .94); finShape.quadraticCurveTo(1.91, .92, 1.88, .83); finShape.lineTo(1.77, .15); finShape.closePath();
  const finGeometry = new THREE.ExtrudeGeometry(finShape, { depth: .065, bevelEnabled: true, bevelSize: .035, bevelThickness: .025, bevelSegments: 3, steps: 1, curveSegments: 12 });
  finGeometry.translate(0, 0, -.0325); finGeometry.rotateY(-Math.PI / 2);
  const fin = owner.mesh(finGeometry, pearl, body); fin.name = "tail-fin";
  line([[0, .98, 1.4], [0, 1.05, 1.53], [0, .95, 1.83]], .045, coral);
  for (const side of [-1, 1]) {
    line([[side * .069, .51, 1.48], [side * .069, .76, 1.58], [side * .069, .67, 1.76]], .026, teal);
    line([[side * .069, .4, 1.54], [side * .069, .59, 1.62], [side * .069, .54, 1.78]], .013, gold);
  }
  const exhausts = ENGINE_PORTS.map((position) => {
    const port = new THREE.Object3D(); port.name = "engine-exhaust"; port.position.copy(position); body.add(port); return port;
  });
  return {
    root, body, nose, exhausts,
    animate(t, pulse, energy, reduced, steering = 0) {
      // One gentle rudder response and thrust pulse, with no flapping aircraft parts.
      fin.rotation.y = reduced ? 0 : -steering * .05;
      glow.emissiveIntensity = 1.1 + energy * .6 + (reduced ? 0 : pulse * .22);
    },
  };
}
