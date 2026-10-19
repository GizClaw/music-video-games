import { rollAngle, snapAngle } from "./motion.js";
const wrap = (degrees) => ((degrees + 180) % 360 + 360) % 360 - 180;

/** The rim follows the hand continuously, across questions and full rotations.
 * Releasing the last active hand/key recentres the rim and commands neutral flight. */
export class SteeringWheel {
  constructor(element, { signal, onInput, onRelease = () => onInput(0) }) {
    this.element = element; this.onInput = onInput; this.onRelease = onRelease; this.value = 0; this.pointer = null;
    this.rotation = 0; this.restRotation = 0; this.keys = new Set();
    this.face = element.querySelector(".ag-wheel-face");
    const point = (e) => {
      const r = element.getBoundingClientRect(), x = e.clientX - r.x - r.width / 2, y = e.clientY - r.y - r.height / 2;
      return { angle: Math.atan2(-y, x) * 180 / Math.PI, radius: Math.hypot(x, y) / r.width };
    };
    element.addEventListener("pointerdown", (e) => {
      if (!e.isPrimary || e.button !== 0 || element.getAttribute("aria-disabled") === "true" || point(e).radius < .20) return;
      e.preventDefault(); element.focus({ preventScroll: true });
      this.pointer = e.pointerId; this.lastAngle = point(e).angle;
      this.startX = e.clientX; this.startY = e.clientY; this.dragged = false;
      element.setPointerCapture(e.pointerId); element.classList.add("held");
    }, { signal });
    element.addEventListener("pointermove", (e) => {
      if (e.pointerId !== this.pointer || point(e).radius < .12) return;
      const next = point(e).angle, delta = wrap(next - this.lastAngle);
      this.rotation += delta; this.lastAngle = next;
      this.dragged ||= Math.hypot(e.clientX - this.startX, e.clientY - this.startY) > 4;
      if (this.dragged) this.onInput(rollAngle(this.rotation));
    }, { signal });
    element.addEventListener("pointerup", (e) => {
      if (e.pointerId !== this.pointer) return;
      this.releasePointer();
    }, { signal });
    for (const event of ["pointercancel", "lostpointercapture"]) element.addEventListener(event, (e) => {
      if (e.pointerId === this.pointer) this.releasePointer();
    }, { signal });
    signal.addEventListener("abort", () => this.release());
  }
  get held() { return this.pointer != null || this.keys.size > 0; }
  get readout() {
    if (!this.rotation) return 0;
    const angle = rollAngle(this.rotation);
    return !this.held && angle === 360 ? 0 : angle;
  }
  recenter() {
    if (this.held) return;
    // Return by the nearest route, not by unwinding every completed revolution.
    this.restRotation = Math.round(this.rotation / 360) * 360;
    this.element.classList.remove("held");
  }
  releasePointer() {
    const pointer = this.pointer; this.pointer = null;
    if (pointer != null && this.element.hasPointerCapture(pointer)) this.element.releasePointerCapture(pointer);
    this.recenter();
    if (pointer != null && !this.held) this.onRelease();
  }
  turnKey(key, degrees) {
    this.keys.add(key); this.rotation += degrees; this.element.classList.add("held");
  }
  releaseKey(key) {
    if (!this.keys.delete(key)) return;
    this.recenter(); if (!this.held) this.onRelease();
  }
  release() {
    const hadKeys = this.keys.size > 0; this.keys.clear();
    if (this.pointer != null) this.releasePointer();
    else { this.recenter(); if (hadKeys) this.onRelease(); }
  }
  draw(degrees, dt = 1 / 60, reduced = false) {
    this.value = snapAngle(degrees);
    if (!this.held) {
      this.rotation += (this.restRotation - this.rotation) * (reduced ? 1 : 1 - Math.exp(-Math.max(0, dt) * 15));
      if (Math.abs(this.rotation - this.restRotation) < .02) this.rotation = this.restRotation = 0;
    }
    this.face.style.transform = `rotate(${-this.rotation || 0}deg)`;
    this.element.setAttribute("aria-valuenow", String(this.readout));
  }
}
