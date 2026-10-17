import { gateBeatStep } from "./pace.js";

/** States of Matter: four transformations, charted to the song's detected beats. */
export const WORK = "songs/music/stem-institute/en-us/states-of-matter";
export const ACTION_WINDOW = { early: 0.4, late: 0.28 };
export const STATES = [
  { id: "solid", key: "A", color: "#96dcff", ink: "#287eb8", zh: "冰块", en: "ICE", action: { zh: "撞碎砖墙", en: "Break the wall" }, symbol: "❄" },
  { id: "liquid", key: "S", color: "#64f1c5", ink: "#13866e", zh: "水滴", en: "WATER", action: { zh: "滑过窄口", en: "Slip under the pipe" }, symbol: "◕" },
  { id: "gas", key: "D", color: "#ffd18a", ink: "#ae6419", zh: "蒸汽", en: "VAPOR", action: { zh: "飞越高栏", en: "Float over the fence" }, symbol: "☁" },
  { id: "plasma", key: "F", color: "#dfb1ff", ink: "#9454ad", zh: "电浆", en: "PLASMA", action: { zh: "激活能量环", en: "Charge the energy ring" }, symbol: "ϟ" },
];

export const SECTIONS = [
  { t: 0, zh: "准备出发", en: "GET READY" },
  { t: 10.7, zh: "认识你的四种形态", en: "MEET YOUR FOUR FORMS" },
  { t: 31.95, zh: "变身派对", en: "CHANGE THAT STATE" },
  { t: 43.94, zh: "融化 · 凝固 · 汽化", en: "MELT · FREEZE · VAPORIZE" },
  { t: 60.15, zh: "跟上节拍", en: "FIND YOUR FLOW" },
  { t: 72.23, zh: "一跃变身", en: "MAKE THE LEAP" },
  { t: 86.55, zh: "最后的变身派对", en: "ONE MORE STATE CHANGE" },
  { t: 100.17, zh: "冲向终点", en: "BRING IT HOME" },
];

const chorus = (t) => (t >= 31.95 && t < 43.94) || (t >= 60.15 && t < 72.23) || t >= 86.55;
const wordState = (text) => STATES.findIndex((s) => text.toLowerCase().replace(/[^a-z]/g, "") === s.id);

/** No fixed BPM grid: obstacles arrive on the recorded beat list. Early notes
 * teach the state being sung; later verses follow the destination of a change.
 * Three opening gates make the spoken intro playable from about three seconds.
 * Choruses alternate all four forms. Gate spacing falls from four beats to
 * three, then two, and stays there. Every chart has the same fair pattern. */
export function buildChart(data) {
  const mentions = data.cues.flatMap((c) => (c.words ?? []).map((w) => ({ t: w.start, phase: wordState(w.text) }))).filter((w) => w.phase >= 0);
  const lessons = data.cues.filter((c) => c.start < 31.95 && wordState(c.words?.[0]?.text ?? "") >= 0).map((c) => ({ t: c.words[0].start, phase: wordState(c.words[0].text) }));
  const motif = [0, 1, 2, 3, 1, 0, 3, 2];
  const chart = [];
  const addGate = (t, phase) => chart.push({ id: chart.length, t, phase, practice: t < 31.95 });
  let nextBeat = data.beats.findIndex((t) => t >= 11);
  // Work backwards on the same four-beat grid, leaving every existing vocal
  // gate in place. Repeat the default water form before introducing ice.
  [1, 1, 0].forEach((phase, i) => {
    const t = data.beats[nextBeat - 12 + i * 4];
    if (t >= 2) addGate(t, phase);
  });
  let cycle = 0;
  for (let i = nextBeat; i < data.beats.length; i++) {
    const t = data.beats[i];
    if (i < nextBeat || t > data.duration - 3) continue;
    const inChorus = chorus(t);
    const mention = (t < 31.95 ? lessons : mentions).findLast((m) => m.t <= t + 0.35);
    const phase = !inChorus && mention ? mention.phase : motif[cycle++ % motif.length];
    addGate(t, phase);
    nextBeat = i + gateBeatStep(t);
  }
  return chart;
}

/** The action press, rather than form selection, determines the grade. */
export function judgeGate(note, phase, pressedAt) {
  if (phase !== note.phase || !Number.isFinite(pressedAt) || pressedAt < note.t - ACTION_WINDOW.early || pressedAt > note.t + ACTION_WINDOW.late) return "miss";
  const error = Math.abs(pressedAt - note.t);
  return error <= 0.14 ? "perfect" : error <= 0.26 ? "great" : "good";
}

/** One accepted press belongs to one gate. Changing form afterwards cannot
 * repair a wrong press or upgrade an already accepted timing judgement. */
export function recordAction(note, phase, at) {
  if (!note || !Number.isFinite(at)) return "none";
  if (note.result || note.activation) return "used";
  if (at < note.t - ACTION_WINDOW.early) return "early";
  if (at > note.t + ACTION_WINDOW.late) return "late";
  note.attempt = { phase, at };
  if (phase !== note.phase) return "wrong";
  note.activation = { phase, at };
  return "accepted";
}

/** A prepared action clears at contact; a late action clears immediately.
 * Merely being in the right form never clears a gate. */
export function gateResult(note, now) {
  if (now < note.t) return null;
  const action = note.activation;
  if (action && action.at <= now) {
    const grade = judgeGate(note, action.phase, action.at);
    if (grade !== "miss") return grade;
  }
  return now >= note.t + ACTION_WINDOW.late ? "miss" : null;
}
