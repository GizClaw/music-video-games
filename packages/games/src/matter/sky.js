import * as THREE from "three";

const PALETTES = ["#74bdf0", "#66c8d1", "#eeb584", "#b69ae7"];

/** A sunlit sky and soft cloud islands, shared by the lobby and the run. */
export class DaylightSky {
  constructor(owner) {
    this.root = new THREE.Group();
    owner.scene.add(this.root);
    this.top = new THREE.Color("#66c8d1");
    this.target = new THREE.Color();
    const sky = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: { uTop: { value: this.top }, uLow: { value: new THREE.Color("#d8ecf4") } },
      vertexShader: "varying vec3 vDirection;void main(){vDirection=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
      fragmentShader: `varying vec3 vDirection;uniform vec3 uTop,uLow;
        void main(){vec3 d=normalize(vDirection);float h=smoothstep(-.45,.4,d.y);
        vec3 color=mix(uLow,uTop,h);float sun=pow(max(0.,dot(d,normalize(vec3(-.65,.65,-.3)))),22.);
        color=mix(color,vec3(1.,.97,.86),sun*.35);gl_FragColor=vec4(color,1.);}`,
    });
    owner.materials.add(sky);
    const dome = owner.mesh(this.root, new THREE.SphereGeometry(170, 32, 24), sky);
    dome.castShadow = dome.receiveShadow = false;
    dome.renderOrder = -10;

    this.lobby = new THREE.Group();
    this.course = new THREE.Group();
    this.root.add(this.lobby, this.course);
    const geometry = owner.geometry(new THREE.SphereGeometry(1, 24, 16));
    const materials = ["#fff9ec", "#e2eef8", "#f4e3f3"].map((color) => owner.material(color, { roughness: 1, metalness: 0 }));
    this.clouds = [];
    const cloud = (parent, x, y, z, scale, seed) => {
      const group = new THREE.Group();
      parent.add(group);
      group.position.set(x, y, z);
      group.scale.setScalar(scale);
      for (let i = 0; i < 7; i++) {
        const a = i / 7 * Math.PI * 2;
        const puff = owner.mesh(group, geometry, materials[seed % 3], Math.cos(a) * 1.25, Math.sin(a * 2) * .25, Math.sin(a) * .6);
        puff.scale.set(.9 + i % 3 * .12, .55 + (i % 3) * .16, .8);
        puff.castShadow = puff.receiveShadow = false;
      }
      this.clouds.push({ group, x, y, seed, course: parent === this.course });
    };
    // A clear central opening keeps the avatar and the reading line exposed.
    for (let i = 0; i < 8; i++) {
      cloud(this.lobby, (i % 2 ? 1 : -1) * (7 + i % 3 * 3), -1 + Math.sin(i * 2.1) * 4, -7 - i * 2, 1.1 + i % 3 * .5, i);
    }
    for (let i = 0; i < 20; i++) {
      cloud(this.course, i * 9 - 14, -4 + Math.sin(i * 2.4) * 4, (i % 2 ? 1 : -1) * (14 + i % 4 * 4), 2 + i % 4 * .7, i);
    }
  }

  update(t, dt, intro, phase, reduced) {
    this.target.set(intro ? PALETTES[phase] : "#78bcea");
    this.top.lerp(this.target, 1 - Math.exp(-dt * 3));
    this.lobby.visible = intro;
    this.course.visible = !intro;
    for (const item of this.clouds) {
      if (item.course === intro) continue;
      item.group.position.x = item.course ? ((item.x - (reduced ? 0 : t * 2) + 25) % 190 + 190) % 190 - 25 : item.x;
      item.group.position.y = item.y + (reduced ? 0 : Math.sin(t * .28 + item.seed) * .18);
    }
  }
}
