/** Fixed mathematical scale: right 0°, top 90°, left 180°, bottom 270°.
 * SVG y grows downward, so the pointer rotates by the negative chosen angle. */
export function targetDial(selected, target) {
  return {
    rotation: -selected || 0,
    targetRotation: -target || 0,
    labelX: 120 + 72 * Math.cos(target * Math.PI / 180),
    labelY: 120 - 72 * Math.sin(target * Math.PI / 180) + (target % 180 === 0 ? 22 : 0),
  };
}
