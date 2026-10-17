// A small, song-specific vocabulary. Color follows the same four playable
// states; the sung word remains legible before and after its highlighted turn.
export const VOCABULARY = {
  solid: "#287eb8", liquid: "#13866e", gas: "#ae6419", plasma: "#9454ad",
  melting: "#13866e", freezing: "#287eb8", vaporization: "#ae6419", condensation: "#13866e",
  sublimation: "#ae6419", deposition: "#287eb8", matter: "#a06c18", state: "#a06c18",
  energy: "#a06c18", particles: "#9454ad", particle: "#9454ad", vibrate: "#287eb8",
  shape: "#287eb8", volume: "#13866e", ionized: "#9454ad", charged: "#9454ad",
};

export const vocabularyFor = (word) => VOCABULARY[word.toLowerCase().replace(/[^a-z]/g, "")];

/** Caption segments sometimes finish before their aligned final word. Keep
 * the entire sung line, including its teaching keyword, on screen. */
export function prepareLyrics(cues) {
  let previousEnd = -Infinity;
  const lines = cues.filter((c) => c.words?.length).map((cue) => {
    const first = cue.words[0].start;
    const last = Math.max(...cue.words.map((w) => w.end));
    const start = Math.max(first - 0.35, previousEnd);
    const words = cue.words.map((w) => ({ ...w, vocabulary: vocabularyFor(w.text) }));
    const end = Math.max(start + 0.2, last);
    previousEnd = end;
    return { words, start, end };
  });
  return lines.map((line, i) => ({ ...line, end: Math.min(line.end + 0.65, lines[i + 1]?.start ?? Infinity) }));
}

export class SingAlong {
  constructor(container, cues) {
    this.container = container;
    this.lines = prepareLyrics(cues);
    this.index = -1;
    this.words = [];
    container.lang = "en";
  }

  reset() {
    this.index = -1;
    this.words = [];
    this.container.replaceChildren();
  }

  update(t) {
    const index = this.lines.findIndex((line) => t >= line.start && t < line.end);
    if (index !== this.index) {
      this.index = index;
      this.container.replaceChildren();
      this.words = [];
      if (index < 0) return;
      const line = document.createElement("div");
      line.className = "mr-lyric-line";
      this.lines[index].words.forEach((word) => {
        const el = document.createElement("span");
        el.className = "mr-word";
        el.textContent = word.text;
        if (word.vocabulary) {
          el.classList.add("is-keyword");
          el.style.setProperty("--word-color", word.vocabulary);
        }
        this.words.push(el);
        line.append(el, document.createTextNode(" "));
      });
      this.container.append(line);
    }
    if (index < 0) return;
    const words = this.lines[index].words;
    // Alignment can overlap adjacent words; only the latest sung word leads.
    const active = words.findLastIndex((w) => w.start <= t);
    this.words.forEach((el, i) => {
      const word = words[i];
      const current = i === active && t <= word.end + 0.16;
      el.classList.toggle("sung", t >= word.start);
      el.classList.toggle("singing", current);
      el.style.setProperty("--fill", `${Math.max(0, Math.min(1, (t - word.start) / Math.max(0.08, word.end - word.start))) * 100}%`);
    });
  }
}
