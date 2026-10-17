import * as THREE from "three";

/** Two tapered streams stay attached to the character. Their length, width
 * and opacity follow actual speed, so downshifts visibly release the thrust. */
export class RushTrail {
  constructor(scene) {
    this.root = new THREE.Group();
    scene.add(this.root);
    this.material = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color() }, uOpacity: { value: 0 } },
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: "attribute float fade; varying float vFade; void main(){vFade=fade;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
      fragmentShader: "uniform vec3 uColor;uniform float uOpacity;varying float vFade;void main(){gl_FragColor=vec4(uColor,uOpacity*vFade);}",
    });
    this.streams = [-1, 1].map((side) => {
      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array(34 * 2 * 3);
      const fade = new Float32Array(34 * 2);
      const indices = [];
      for (let i = 0; i < 34; i++) {
        fade[i * 2] = fade[i * 2 + 1] = (1 - i / 33) ** 1.3;
        if (i < 33) indices.push(i*2, i*2+1, i*2+2, i*2+1, i*2+3, i*2+2);
      }
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute("fade", new THREE.BufferAttribute(fade, 1));
      geometry.setIndex(indices);
      const mesh = new THREE.Mesh(geometry, this.material);
      mesh.frustumCulled = false;
      this.root.add(mesh);
      return { side, geometry, positions };
    });
  }

  update(t, origin, color, intensity, enabled, reduced) {
    this.root.visible = enabled && !reduced;
    if (!this.root.visible) return;
    this.root.position.copy(origin);
    this.material.uniforms.uColor.value.set(color).multiplyScalar(1.6);
    this.material.uniforms.uOpacity.value = .13 + intensity * .72;
    const length = 1.4 + intensity * 8;
    for (const { side, positions, geometry } of this.streams) {
      for (let i = 0; i < 34; i++) {
        const p = i / 33;
        const width = (.025 + intensity * .17) * (1 - p) ** .7;
        const x = -.3 - p * length;
        const y = -.3 - p * .35 + Math.sin(p * 9 - t * 11 + side) * .07 * p;
        const z = side * (.38 + p * .35) + Math.sin(p * 8 - t * 9) * .07 * p;
        positions.set([x, y, z - width, x, y, z + width], i * 6);
      }
      geometry.attributes.position.needsUpdate = true;
    }
  }

  destroy() {
    this.root.removeFromParent();
    this.streams.forEach(({ geometry }) => geometry.dispose());
    this.material.dispose();
  }
}
