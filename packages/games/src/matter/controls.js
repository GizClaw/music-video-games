import * as THREE from "three";
import { animateElement } from "./elements.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

/** Four live 3D portraits share one small transparent canvas. Button hit
 * targets stay in the DOM; this canvas never intercepts a finger or key. */
export class FormControls3D {
  constructor(container, forms) {
    this.container = container;
    this.buttons = [...container.querySelectorAll(".mr-form")];
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
    this.renderer.setClearColor(0, 0);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.domElement.className = "mr-models";
    this.renderer.domElement.setAttribute("aria-hidden", "true");
    container.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight("#d9edff", "#253745", 2));
    const light = new THREE.DirectionalLight("#fff8e9", 3.2);
    light.position.set(-3, 5, 6);
    this.scene.add(light);
    const rim = new THREE.DirectionalLight("#98d4f0", 2);
    rim.position.set(4, 2, -3);
    this.scene.add(rim);
    const room = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.environment = pmrem.fromScene(room, 0.04);
    this.scene.environment = this.environment.texture;
    this.scene.environmentIntensity = 0.45;
    room.dispose(); pmrem.dispose();
    this.models = forms.map((form) => {
      const model = form.clone();
      model.userData.plasmaUniforms = form.userData.plasmaUniforms;
      model.position.set(0, 0, 0);
      model.rotation.set(0, 0, 0);
      model.scale.setScalar(1);
      this.scene.add(model);
      return model;
    });
    this.camera = new THREE.OrthographicCamera(-1.22, 1.22, 1.22, -1.22, 0.1, 20);
    this.camera.position.set(2.4, 1.5, 7);
    this.camera.lookAt(0, 0.14, 0);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    this.resize();
    container.classList.add("mr-model-ready");
  }

  resize() {
    const parent = this.container.getBoundingClientRect();
    this.width = Math.max(1, parent.width);
    this.height = Math.max(1, parent.height);
    this.renderer.setSize(this.width, this.height, false);
    this.rects = this.buttons.map((button) => {
      const r = button.querySelector(".mr-orb").getBoundingClientRect();
      return { x: r.left - parent.left, y: this.height - (r.top - parent.top + r.height), w: r.width, h: r.height };
    });
  }

  render(t, phase, pressTimes, now, enabled, reduced) {
    this.renderer.domElement.hidden = !enabled;
    if (!enabled) return;
    this.renderer.setScissorTest(false);
    this.renderer.clear();
    this.renderer.setScissorTest(true);
    this.models.forEach((model, i) => {
      this.models.forEach((m, j) => { m.visible = i === j; });
      const pressed = now - pressTimes[i] < 130;
      model.scale.setScalar(pressed ? 0.84 : phase === i ? 1.08 : 0.94);
      model.position.y = (phase === i ? 0.05 : -0.04) + (reduced ? 0 : Math.sin(t*2.8+i)*.025);
      model.rotation.y = reduced ? 0 : Math.sin(t * 0.8 + i) * 0.16;
      model.rotation.z = pressed ? -0.06 : 0;
      animateElement(model, t);
      const r = this.rects[i];
      if (!r || r.w <= 0 || r.h <= 0) return;
      this.renderer.setViewport(r.x, r.y, r.w, r.h);
      this.renderer.setScissor(r.x, r.y, r.w, r.h);
      this.renderer.render(this.scene, this.camera);
    });
  }

  destroy() {
    this.observer.disconnect();
    this.environment.dispose();
    // Portraits borrow the game's geometry and materials; their owner disposes them.
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
    this.container.classList.remove("mr-model-ready");
  }
}
