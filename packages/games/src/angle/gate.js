const RAD = Math.PI / 180;
export const GATE_APPROACH_SPEED = 15;
export const GATE_PASS_TIME = 1.15;
const smooth = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };

/** A moving guide, not a fixed world obstacle. Angular error opens a visible
 * passing gap before the beat instead of bringing every gate onto the plane. */
export function gateApproach(note, flight, time, { turn, selectedAngle }) {
  const remaining = Math.max(0, note.t - time);
  const heading = flight.heading * RAD, goal = note.degrees * RAD;
  const actualError = note.degrees - turn, selectedError = note.degrees - selectedAngle;
  const error = Math.abs(actualError) >= Math.abs(selectedError) ? actualError : selectedError;
  // A good 15-degree choice still fits through the opening; 30+ degrees leaves
  // room for both the wing and rim. This is continuous while the pilot corrects.
  const offset = 6.8 * Math.tanh((Math.abs(error) / 30) ** 3) * smooth(1 - remaining / 2);
  const side = Math.sign(error), back = Math.min(60, Math.abs(error) / 4) * RAD;
  const lateral = offset * side * Math.cos(back), behind = offset * Math.sin(back);
  return {
    x: flight.x + Math.cos(goal) * remaining * GATE_APPROACH_SPEED - Math.sin(heading) * lateral - Math.cos(heading) * behind,
    z: flight.z - Math.sin(goal) * remaining * GATE_APPROACH_SPEED - Math.cos(heading) * lateral + Math.sin(heading) * behind,
    heading: note.degrees, offset, error,
  };
}

/** Keep the actual encounter point and velocity after judging. A missed gate
 * remains whole and flies past; it never teleports onto the plane to explode. */
export function gateDeparture(encounter, age) {
  const distance = (encounter.speed - GATE_APPROACH_SPEED) * Math.max(0, age);
  const heading = encounter.flightHeading * RAD;
  return { ...encounter, x: encounter.x + Math.cos(heading) * distance, z: encounter.z - Math.sin(heading) * distance };
}
