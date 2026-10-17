import * as THREE from "three";

/** Contact ripples plus a peripheral rush. The character and central path
 * stay sharp; HUD and teaching captions are drawn above this scene pass. */
export const ImpactShader = {
  uniforms: {
    tDiffuse: { value: null },
    uCenter: { value: new THREE.Vector2(0.5, 0.6) },
    uAspect: { value: 1 },
    uAge: { value: 2 },
    uPower: { value: 0 },
    uMiss: { value: 0 },
    uColor: { value: new THREE.Color("#bcece0") },
    uRush: { value: 0 },
    uTime: { value: 0 },
    uVanishing: { value: new THREE.Vector2(.5, .55) },
  },
  vertexShader: "varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }",
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uCenter;
    uniform float uAge, uPower, uAspect, uMiss;
    uniform float uRush, uTime;
    uniform vec2 uVanishing;
    uniform vec3 uColor;
    varying vec2 vUv;
    void main() {
      vec2 p = (vUv - uCenter) * vec2(uAspect, 1.);
      float d = length(p);
      float life = max(0., 1. - uAge / .68) * uPower;
      float r = .025 + uAge * 1.65;
      float wave = exp(-pow((d - r) / .028, 2.)) * life;
      vec2 direction = p / max(d, .001) / vec2(uAspect, 1.);
      vec2 uv = vUv - direction * wave * .032;
      vec2 ca = direction * wave * .0025;
      vec3 color = vec3(texture2D(tDiffuse, uv + ca).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - ca).b);
      vec2 rushDirection = vUv - uVanishing;
      vec2 radial = rushDirection * vec2(uAspect, 1.);
      float radius = length(radial);
      float periphery = smoothstep(.32, .85, radius);
      float blur = periphery * uRush * uRush * .025;
      color = color * .6 + texture2D(tDiffuse, uv - rushDirection * blur).rgb * .25
        + texture2D(tDiffuse, uv - rushDirection * blur * 2.).rgb * .15;
      float sector = (atan(radial.y, radial.x) / 6.2831853 + .5) * 72.;
      float seed = fract(sin(floor(sector) * 127.1) * 43758.5453);
      float stroke = 1. - smoothstep(.008, .035, abs(fract(sector) - .5));
      float travel = fract(radius * (1.4 + seed) - uTime * (1.1 + seed * .5) + seed);
      float dash = smoothstep(.25, .55, travel) * (1. - smoothstep(.82, .97, travel));
      float rush = periphery * stroke * dash * uRush * .48;
      color = mix(color, mix(vec3(.16,.63,.73), vec3(.85,1.,.98), seed), rush);
      color += uColor * wave * .2;
      color += uColor * exp(-max(0., uAge) * 30.) * uPower * .22;
      color += vec3(.6,.025,.06) * pow(length(vUv-.5),1.5) * exp(-max(0.,uAge)*7.) * uMiss;
      gl_FragColor = vec4(color, 1.);
    }
  `,
};

/** Three thin shock rings peel off the gate with staggered timing. */
export class ImpactRings {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.geometry = new THREE.TorusGeometry(1, 0.018, 12, 128);
    this.rings = Array.from({ length: 3 }, (_, i) => {
      const material = new THREE.MeshBasicMaterial({ color: "#bcece0", transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
      const mesh = new THREE.Mesh(this.geometry, material);
      mesh.rotation.y = Math.PI / 2;
      this.group.add(mesh);
      return { mesh, material, delay: i * 0.06 };
    });
    this.at = -99;
    this.power = 0;
    this.origin = new THREE.Vector3();
    this.projected = new THREE.Vector3();
  }

  trigger(t, color, result, origin) {
    this.at = t;
    this.failed = result === "miss";
    this.power = result === "perfect" ? 1.2 : result === "great" ? 1 : result === "good" ? 0.9 : 0.52;
    this.origin.copy(origin);
    this.rings.forEach(({ material }) => material.color.set(this.failed ? "#ff486b" : color).multiplyScalar(4));
  }

  update(t, camera, pass, width, height, enabled, reduced) {
    const age = t - this.at;
    this.group.visible = enabled && age >= 0 && age < 0.8 && this.power > 0;
    this.group.position.copy(this.origin);
    for (const { mesh, material, delay } of this.rings) {
      const a = age - delay;
      mesh.visible = a >= 0 && a < 0.65;
      const progress = Math.max(0, a / 0.65);
      const radius = this.failed ? Math.max(.15,2.2-progress*2) : 0.85 + (1 - Math.pow(1 - Math.min(1, progress), 3)) * (reduced ? 1.6 : 4.8) * this.power;
      mesh.scale.setScalar(radius);
      mesh.position.x = a * 8;
      material.opacity = Math.pow(Math.max(0, 1 - progress), 2) * this.power * 0.85;
    }
    const u = pass.uniforms;
    this.projected.copy(this.origin).project(camera);
    u.uCenter.value.set(this.projected.x * 0.5 + 0.5, this.projected.y * 0.5 + 0.5);
    u.uAspect.value = width / height;
    u.uAge.value = age;
    u.uPower.value = enabled && !reduced && age >= 0 && age < 0.68 ? this.power : 0;
    u.uMiss.value = enabled && !reduced && this.failed && age>=0 && age<.8 ? 1 : 0;
    u.uColor.value.copy(this.rings[0].material.color).multiplyScalar(0.25);
  }

  destroy() {
    this.geometry.dispose();
    this.rings.forEach(({ material }) => material.dispose());
    this.group.removeFromParent();
  }
}
