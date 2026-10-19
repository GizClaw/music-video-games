/** Song sections, colours and alignment repairs shared with The Angle Gang video. */
export const SECTIONS = { drop: 9.26, chorus1: 31.41, verse2: 45.93, chorus2: 71.09, bridge: 88.82, chorus3: 104.76, outro: 120.71, end: 129.2 };
export const KINDS = {
  acute: { en: "ACUTE", zh: "锐角", color: "#38bdb1", rule: "0° < θ < 90°" },
  right: { en: "RIGHT", zh: "直角", color: "#e8ad30", rule: "θ = 90°" },
  obtuse: { en: "OBTUSE", zh: "钝角", color: "#ed8251", rule: "90° < θ < 180°" },
  straight: { en: "STRAIGHT", zh: "平角", color: "#e7758e", rule: "θ = 180°" },
  reflex: { en: "REFLEX", zh: "优角", color: "#a58bd5", rule: "180° < θ < 360°" },
  full: { en: "FULL TURN", zh: "周角", color: "#e8ad30", rule: "θ = 360°" },
  zero: { en: "ZERO", zh: "零角", color: "#7f95af", rule: "θ = 0°" },
};

export function kindOf(deg) {
  return deg <= 0 ? "zero" : deg < 90 ? "acute" : deg === 90 ? "right" : deg < 180 ? "obtuse" : deg === 180 ? "straight" : deg < 360 ? "reflex" : "full";
}

export function prepareTiming(tm) {
  // The video corrected these collapsed ASR word times against the vocal stem.
  const tag = [0, 0.72, 1.41, 1.77, 2.09];
  const repairs = { 14: tag.map((d) => 43.05 + d), 23: tag.map((d) => 71.21 + d), 27: tag.map((d) => 82.75 + d), 15: [49.3, 49.78, 50.1, 50.5, 50.87] };
  for (const [index, starts] of Object.entries(repairs)) {
    const c = tm.cues[index];
    c.words.forEach((w, i) => { w.start = starts[i]; w.end = starts[i + 1] ?? starts[i] + 0.4; });
    c.start = starts[0];
    c.end = starts.at(-1) + 0.5;
  }
  tm.setDownbeat(SECTIONS.drop);
  return tm;
}

/** One real heading manoeuvre per musical phrase, with time to steer and level out. */
export function buildChart(tm) {
  const snap = (t) => tm.beatTime(Math.min(tm.beats.length - 1, Math.round(tm.beatFloat(t))));
  const turns = [
    [0, 45], [1, 90], [2, 45], [3, 60], [5, 75], [6, 90], [7, 90], [9, 90],
    [11, 45], [13, 360], [14, 90], [15, 120], [17, 150], [19, 180], [20, 180], [22, 180],
    [24, 45], [26, 360], [27, 180], [28, 90], [29, 180], [30, 270], [31, 360],
    [33, 360], [35, 45], [36, 135], [37, 360], [38, 180], [39, 360], [40, 90],
  ];
  return turns.map(([cue, degrees], id) => {
    const line = tm.cues[cue];
    const end = Math.max(line.end, line.words.at(-1).end);
    const t = snap(cue === 0 ? 3.448 : end);
    return { id, t, degrees, kind: kindOf(degrees), cue };
  });
}
