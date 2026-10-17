import * as THREE from "three";
import { MarchingCubes } from "three/addons/objects/MarchingCubes.js";

function friendlyFace(o, form, z, y, kind) {
  const face = new THREE.Group(); face.position.y = y; form.add(face);
  const white = o.material("#f0fcff", { roughness: .2, clearcoat: 1 });
  const pupil = new THREE.MeshBasicMaterial({ color: "#102d48" });
  o.materials.add(pupil);
  const cheek = o.material(kind === 3 ? "#dfa6e5" : "#f1b8bd", { transparent:true,opacity:.52,roughness:.65,depthWrite:false });
  for (const side of [-1,1]) {
    const eye = new THREE.Group(); eye.name="element-eye"; eye.position.set(side*.245,.1,z); face.add(eye);
    const sclera=o.sphere(eye,.13,white); sclera.scale.set(.9,1.15,.47);
    const iris=o.sphere(eye,.105,pupil,side*-.012,-.002,.064); iris.scale.set(.85,1.06,.5);
    o.sphere(eye,.031,white,-.027,.043,.111);
    o.sphere(eye,.012,white,.029,-.038,.116);
    const blush=o.sphere(face,.1,cheek,side*.41,-.065,z-(kind===0?-.007:.06)); blush.scale.set(1,.52,.17);
  }
  const points=kind===2 ? [[-.13,-.13],[ -.065,-.19],[0,-.14],[.065,-.19],[.13,-.13]] : [[-.13,-.13],[0,kind===1?-.24:-.21],[.13,-.13]];
  o.mesh(face,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(([x,yy])=>new THREE.Vector3(x,yy,z+.035))),24,.021,8,false),pupil);
  form.userData.kind=kind;
}

/** Elemental game pieces: bevelled ice with inclusions, a refractive curved
 * drop, one continuous cloud surface and a moving plasma core. */
export function createElements(o) {
  const forms = Array.from({ length: 4 }, () => new THREE.Group());
  const ice = o.material("#77c9ed", { roughness: 0.12, metalness: 0.03, clearcoat: 1, clearcoatRoughness: 0.08, transmission: 0.22, thickness: 0.8, ior: 1.31, attenuationColor: new THREE.Color("#75bddd"), attenuationDistance: 2 });
  const frost = o.material("#d4f4ff", { transparent: true, opacity: 0.42, roughness: 0.6, depthWrite: false });
  o.box(forms[0], [1.4, 1.45, 1.28], ice, 0, 0, 0, 0.23);
  o.box(forms[0], [0.85, 0.92, 0.75], frost, 0, -0.03, -0.05, 0.2);
  const cracks = [
    [[-0.52,0.57,0.62],[-0.23,0.29,0.65],[-0.31,0.03,0.65],[-0.03,-0.33,0.65]],
    [[-0.23,0.29,0.65],[0.03,0.37,0.65],[0.23,0.17,0.65]],
    [[0.48,-0.5,0.63],[0.32,-0.26,0.65],[0.4,-0.04,0.65]],
  ];
  for (const pts of cracks) o.mesh(forms[0], new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p)=>new THREE.Vector3(...p))), 16, 0.009, 5, false), frost);
  for (let i=0;i<10;i++) o.sphere(forms[0],0.018+(i%3)*0.008,frost,Math.sin(i*5.2)*0.43,Math.cos(i*3.7)*0.45,Math.sin(i*2.1)*0.33);
  const water = o.material("#6edccb", { roughness: 0.08, metalness: 0.02, transmission: 0.2, thickness: 0.7, clearcoat: 1, clearcoatRoughness: 0.05, ior: 1.33, attenuationColor: new THREE.Color("#35abbd"), attenuationDistance: 2.5 });
  const profile = new THREE.SplineCurve([[0,-0.78],[0.43,-0.66],[0.7,-0.3],[0.73,0.08],[0.55,0.5],[0.26,0.88],[0.055,1.12],[0,1.21]].map(([x,y])=>new THREE.Vector2(x,y))).getPoints(56);
  profile.forEach((p)=>{p.x=Math.max(0,p.x);});
  const drop = new THREE.LatheGeometry(profile,80);
  const positions=drop.attributes.position;
  for(let i=0;i<positions.count;i++) {
    const y=positions.getY(i), bend=Math.max(0,y-0.45);
    positions.setXYZ(i,positions.getX(i)+bend*bend*0.24,y,positions.getZ(i)-bend*bend*0.13);
  }
  drop.computeVertexNormals();
  o.mesh(forms[1],drop,water);
  const bubble = o.material("#c2fff3",{transparent:true,opacity:0.28,roughness:0.08,metalness:0.1,depthWrite:false});
  for(const [x,y,z,r] of [[-.32,-.32,.15,.065],[.18,-.46,.14,.045],[-.21,.02,.13,.035]]) o.sphere(forms[1],r,bubble,x,y,z);
  const vapor=o.material("#e7dbbc",{roughness:0.68,metalness:0,clearcoat:0.12});
  const field=new MarchingCubes(38,vapor,false,false,20000);
  field.isolation=48;
  for(const [x,y,z,s] of [[.27,.48,.5,.6],[.42,.62,.5,.85],[.62,.59,.5,.8],[.76,.47,.5,.5],[.49,.4,.5,.7]]) field.addBall(x,y,z,s,12);
  field.update();
  const cloud=new THREE.BufferGeometry();
  for(const key of ["position","normal"]) cloud.setAttribute(key,new THREE.BufferAttribute(field.geometry.attributes[key].array.slice(0,field.count*3),3));
  cloud.computeBoundingSphere(); field.geometry.dispose();
  const cloudMesh=o.mesh(forms[2],cloud,vapor); cloudMesh.scale.set(1.25,1.45,1.35);
  const wisp=o.material("#f7ead0",{transparent:true,opacity:0.32,roughness:0.75,depthWrite:false});
  for(const side of [-1,1]) {
    const path=new THREE.CatmullRomCurve3([new THREE.Vector3(side*.85,-.06,0),new THREE.Vector3(side*1.1,.04,0),new THREE.Vector3(side*1.05,.24,0),new THREE.Vector3(side*.94,.22,0)]);
    o.mesh(forms[2],new THREE.TubeGeometry(path,24,.035,8,false),wisp);
  }
  const shell=o.material("#ada7ea",{roughness:0.13,metalness:0.12,clearcoat:1,transmission:0.15,thickness:0.55,transparent:true,opacity:0.75,depthWrite:false});
  o.sphere(forms[3],.7,shell);
  const plasma=new THREE.ShaderMaterial({
    uniforms:{uTime:{value:0}},
    vertexShader:"varying vec3 vP;void main(){vP=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
    fragmentShader:/* glsl */`varying vec3 vP;uniform float uTime;void main(){float a=atan(vP.z,vP.x);float f=sin(a*6.+vP.y*8.+uTime*1.7)+sin(vP.y*13.-uTime*2.1)*.35;float line=pow(max(0.,1.-abs(f)),9.);vec3 c=mix(vec3(.16,.08,.43),vec3(.55,.35,1.4),.5+.5*vP.y);c+=vec3(.35,.75,1.4)*line*1.5;gl_FragColor=vec4(c,1.);}`,
  });
  o.materials.add(plasma); o.sphere(forms[3],.56,plasma);
  const orbitMaterial=o.material("#a7d9ff",{emissive:"#9185ee",emissiveIntensity:.7,metalness:.5,roughness:.2});
  for(let i=0;i<2;i++) {
    const orbit=new THREE.Group(); orbit.name="element-orbit"; orbit.userData.orbit=i; forms[3].add(orbit);
    const band=o.ring(orbit,.95,.017,orbitMaterial); band.scale.set(1.12,.76,1);
    o.sphere(orbit,.065,o.lights[3],1.06,0,0);
    o.sphere(orbit,.045,o.lights[0],-1.06,0,0);
  }
  forms[3].userData.plasmaUniforms=plasma.uniforms;
  friendlyFace(o,forms[0],.657,0,0);
  friendlyFace(o,forms[1],.69,-.03,1);
  friendlyFace(o,forms[2],.40,.07,2);
  friendlyFace(o,forms[3],.66,0,3);
  return forms;
}

export function animateElement(form,t) {
  const cycle=(t+(form.userData.kind??0)*1.13)%4.7;
  const blink=cycle>4.44?Math.sin((cycle-4.44)/.26*Math.PI):0;
  form.traverse((node)=>{if(node.name==="element-eye")node.scale.y=1-blink*.94;});
  for(const child of form.children) if(child.name==="element-orbit") {
    const i=child.userData.orbit;
    child.rotation.set(.65+i*.9,.4-i*.8,t*(i?-.7:.6)+i);
  }
  if(form.userData.plasmaUniforms) form.userData.plasmaUniforms.uTime.value=t;
}
