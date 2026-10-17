import * as THREE from "three";

const vertex = "varying vec3 vPosition; void main(){vPosition=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}";
const fragment = /* glsl */ `
  varying vec3 vPosition;
  uniform vec3 uColor;
  uniform float uTime, uCharge, uFade;
  void main(){
    float r=length(vPosition.xy), a=atan(vPosition.y,vPosition.x);
    float edge=smoothstep(2.32,2.345,r)*(1.-smoothstep(2.395,2.42,r));
    float stream=pow(.5+.5*sin(a*13.-uTime*7.),6.);
    float filament=pow(.5+.5*sin(a*29.+uTime*4.),12.);
    vec3 c=uColor*(.7+uCharge*1.5+stream*.7)+vec3(.7,.9,1.)*filament*.45;
    gl_FragColor=vec4(c,edge*(.45+uCharge*.5)*uFade);
  }
`;

/** Every complete light ring on the course is a charted, judged portal. Its
 * machined sectors separate on a clear instead of sliding through the camera. */
export function buildPortal(owner, root) {
  const frame = new THREE.Group(); frame.position.y = 2.5; frame.rotation.y = Math.PI / 2; root.add(frame);
  const sectors = [];
  for (let i = 0; i < 12; i++) {
    const angle = i * Math.PI / 6;
    const sector = new THREE.Group(); sector.rotation.z = angle; frame.add(sector);
    owner.mesh(sector, new THREE.TorusGeometry(2.5, 0.065, 10, 16, Math.PI / 6 * 0.82), owner.metalMat);
    owner.mesh(sector, new THREE.TorusGeometry(2.57, 0.014, 8, 16, Math.PI / 6 * 0.82), owner.creamMat);
    const a = Math.PI / 12 * 0.82;
    const latch = owner.box(sector, [0.13, 0.24, 0.18], owner.baseMat, Math.cos(a) * 2.5, Math.sin(a) * 2.5, 0, 0.035);
    latch.rotation.z = a;
    sectors.push({ group: sector, angle, center: angle + a });
  }
  const material = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color("#a9d8cc") }, uTime: { value: 0 }, uCharge: { value: 0 }, uFade: { value: 1 } },
    vertexShader: vertex, fragmentShader: fragment, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  });
  owner.materials.add(material);
  const energy = owner.mesh(frame, new THREE.RingGeometry(2.32, 2.42, 160), material);
  energy.castShadow = energy.receiveShadow = false;
  for (const z of [-2.38, 2.38]) owner.box(root, [0.6, 0.36, 0.45], owner.baseMat, 0, 0.18, z, 0.1);
  return { frame, sectors, material };
}

export function updatePortal(portal, t, note, color, pulse) {
  const age = Math.max(0, t - note.t);
  const clear = note.result && note.result !== "miss";
  const charge = Math.max(0, 1 - Math.max(0, note.t - t) / 1.1);
  portal.material.uniforms.uTime.value = t;
  portal.material.uniforms.uColor.value.set(note.result === "miss" ? "#e894a9" : color);
  portal.material.uniforms.uCharge.value = charge * 0.8 + pulse * 0.2;
  portal.material.uniforms.uFade.value = note.result ? Math.max(0, 1 - age * 3.5) : 1;
  for (const { group, angle, center } of portal.sectors) {
    const a = clear ? age : 0;
    group.position.set(Math.cos(center) * a * 5, Math.sin(center) * a * 5, a * 4);
    group.rotation.z = angle + a * (angle > Math.PI ? 1 : -1) * 0.6;
    group.scale.setScalar(Math.max(0.01, 1 - a * 1.5));
  }
}
