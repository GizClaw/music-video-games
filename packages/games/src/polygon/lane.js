import { clip } from "./style.js";

/** Seconds of the future the lane shows to the right of the target. */
export const LANE_AHEAD = 2.4;
const TARGET = 0.14; // share of the lane's width left of the target
const TICKS = 18;
const CHIPS = 20;

/**
 * The note lane under the stage: notes slide in from the right on the beat
 * grid and are hit as they cross the target. Each note shows the polygon it
 * will draw, so the shape change after a completing note is visible ahead.
 */
export function createLane(root) {
  const el = root.querySelector("#lane");
  const track = el.querySelector(".track");
  const target = el.querySelector(".target");
  const make = (tag, n) => Array.from({ length: n }, () => track.appendChild(document.createElement(tag)));
  const ticks = make("b", TICKS);
  const chips = make("i", CHIPS);
  const chipKey = new Array(CHIPS).fill("");
  let targetKey = "";
  let lastHit = -1;
  return {
    /**
     * Draw at song time t: `beats` is `[time, isBarLine]` for the beats in
     * view, `notes` the notes in view as `{ t, sides, color, last, state, at }`
     * (state "wait", "perfect", "good" or "miss"; `at` its wall time), `now`
     * wall time, `due` whether the next note is inside its window.
     */
    draw(t, { beats, notes, now, due, sides, color, hitAt }) {
      const w = el.clientWidth;
      const x0 = w * TARGET;
      const px = (w - x0) / LANE_AHEAD;
      const at = (time) => x0 + (time - t) * px;
      ticks.forEach((tick, i) => {
        const b = beats[i];
        tick.style.display = b ? "" : "none";
        if (!b) return;
        tick.className = b[1] ? "bar" : "";
        tick.style.transform = `translateX(${at(b[0]).toFixed(1)}px)`;
      });
      chips.forEach((chip, i) => {
        const n = notes[i];
        chip.style.display = n ? "" : "none";
        if (!n) return;
        const key = `${n.sides}/${n.last ? 1 : 0}/${n.state}`;
        if (chipKey[i] !== key) {
          chipKey[i] = key;
          chip.style.setProperty("--shape", clip(n.sides));
          chip.style.setProperty("--c", n.color);
          chip.className = `${n.last ? "last " : ""}${n.state === "wait" ? "" : n.state === "miss" ? "miss" : "hit"}`;
        }
        // A hit bursts on the target; a miss slides on past it and fades.
        const age = n.state === "wait" ? 0 : Math.max(0, now - n.at);
        const x = n.state === "wait" || n.state === "miss" ? at(n.t) : x0;
        const scale = n.state === "wait" || n.state === "miss" ? 1 : 1 + age * 5;
        chip.style.transform = `translateX(${x.toFixed(1)}px) scale(${scale.toFixed(2)})`;
        chip.style.opacity = n.state === "wait" ? "1" : String(Math.max(0, 1 - age / (n.state === "miss" ? 0.5 : 0.25)));
      });
      const key = `${sides}/${color}`;
      if (key !== targetKey) {
        targetKey = key;
        target.style.setProperty("--shape", clip(sides));
        target.style.setProperty("--c", color);
      }
      target.style.left = `${x0}px`;
      target.classList.toggle("due", due);
      if (hitAt !== lastHit) {
        lastHit = hitAt;
        target.classList.remove("hit");
        void target.offsetWidth;
        target.classList.add("hit");
      }
    },
  };
}
