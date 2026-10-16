const MUTED_KEY = "mvg-universe-muted";

/**
 * Song decks with crossfades. Each song keeps its own element, so a song
 * resumes where it left off when the player comes back to it. Nothing plays until `unlock()` runs inside a user gesture; `play()`
 * before that only records the wish. `levels()` reads bass and mid energy of
 * whatever is audible, for the scene to pulse with.
 */
export class Music {
  constructor() {
    this.ctx = null;
    this.decks = new Map();
    this.want = null;
    this.unlocked = false;
    this.held = false;
    this.muted = localStorage.getItem(MUTED_KEY) === "1";
    this.bass = 0;
    this.mid = 0;
    this.onchange = () => {};
  }

  /** Call from user gestures: starts the audio graph, then whatever was wished for. */
  unlock() {
    if (!this.unlocked) {
      this.unlocked = true;
      try {
        this.ctx = new AudioContext();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 1;
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 512;
        this.analyser.smoothingTimeConstant = 0.7;
        this.bins = new Uint8Array(this.analyser.frequencyBinCount);
        this.master.connect(this.analyser);
        this.analyser.connect(this.ctx.destination);
      } catch {
        this.ctx = null;
      }
    }
    this.ctx?.resume();
    const d = this.want && this.decks.get(this.want.url);
    if (this.want && !this.held && (!d || d.el.paused)) this.play(this.want.url, this.want);
  }

  deck(url, start) {
    let d = this.decks.get(url);
    if (d) return d;
    const el = new Audio();
    el.crossOrigin = "anonymous";
    el.loop = true;
    el.preload = "auto";
    el.src = start ? `${url}#t=${start}` : url;
    d = { url, el, timer: 0 };
    if (this.ctx) {
      d.gain = this.ctx.createGain();
      d.gain.gain.value = 0;
      d.source = this.ctx.createMediaElementSource(el);
      d.source.connect(d.gain);
      d.gain.connect(this.master);
    } else {
      el.volume = 0;
      el.muted = this.muted;
    }
    this.decks.set(url, d);
    return d;
  }

  fade(d, to, sec, pauseAfter = false) {
    clearTimeout(d.timer);
    if (d.gain) {
      const g = d.gain.gain;
      const t = this.ctx.currentTime;
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(to, t + sec);
    } else d.el.volume = to;
    if (pauseAfter) d.timer = setTimeout(() => d.el.pause(), sec * 1000 + 60);
  }

  /** Crossfade to `url`, starting at `start` seconds the first time it plays. */
  play(url, { start = 0, volume = 1, title = "", loop = true, shuffled = false } = {}) {
    this.want = { url, start, volume, title, loop, shuffled };
    this.onchange(this.want);
    if (!this.unlocked || this.held) return;
    const d = this.deck(url, start);
    d.el.loop = loop;
    if (d.el.ended) d.el.currentTime = start;
    for (const o of this.decks.values()) if (o !== d && !o.el.paused) this.fade(o, 0, 1.6, true);
    d.el.play().catch(() => {});
    this.fade(d, volume, 1.6);
  }

  /**
   * Play random `tracks` ({ url, title, start }) back to back from their
   * `start`, crossfading near each end. Coming back to the same list resumes
   * the track that was playing.
   */
  shuffle(tracks) {
    if (this.tracks !== tracks) this.lastShuffled = null;
    this.tracks = tracks;
    const last = this.lastShuffled && this.decks.get(this.lastShuffled.url);
    if (last && !last.el.ended) this.play(last.url, { ...this.lastShuffled, shuffled: true, loop: false });
    else this.next();
  }

  next() {
    const pool = this.tracks.filter((t) => t.url !== this.want?.url);
    const t = pool[Math.floor(Math.random() * pool.length)] ?? this.tracks[0];
    this.lastShuffled = { url: t.url, title: t.title, start: t.start, volume: 0.85 };
    this.play(t.url, { title: t.title, start: t.start, volume: 0.85, loop: false, shuffled: true });
  }

  /** Call every frame: advances the shuffle before the current track ends. */
  tick() {
    if (!this.want?.shuffled || this.held || !this.unlocked) return;
    const el = this.decks.get(this.want.url)?.el;
    if (el && el.duration && (el.ended || el.duration - el.currentTime < 2)) this.next();
  }

  /** Fade everything out and keep quiet until `release()` (a game is playing). */
  hold() {
    this.held = true;
    for (const d of this.decks.values()) if (!d.el.paused) this.fade(d, 0, 0.5, true);
  }

  release() {
    this.held = false;
    if (this.want) this.play(this.want.url, this.want);
  }

  setMuted(muted) {
    this.muted = muted;
    localStorage.setItem(MUTED_KEY, muted ? "1" : "0");
    if (this.master) {
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setValueAtTime(this.master.gain.value, t);
      this.master.gain.linearRampToValueAtTime(muted ? 0 : 1, t + 0.3);
    } else for (const d of this.decks.values()) d.el.muted = muted;
    this.onchange(this.want);
  }

  levels() {
    if (!this.analyser) return this;
    this.analyser.getByteFrequencyData(this.bins);
    let bass = 0;
    let mid = 0;
    for (let i = 1; i < 6; i++) bass += this.bins[i];
    for (let i = 8; i < 48; i++) mid += this.bins[i];
    bass = bass / (5 * 255);
    mid = mid / (40 * 255);
    this.bass += (bass - this.bass) * (bass > this.bass ? 0.6 : 0.12);
    this.mid += (mid - this.mid) * 0.2;
    return this;
  }

  /** Stop every deck and release the audio graph when its hub is unmounted. */
  destroy() {
    this.held = true;
    this.want = null;
    this.onchange = () => {};
    for (const d of this.decks.values()) {
      clearTimeout(d.timer);
      d.el.pause();
      d.el.removeAttribute("src");
      d.el.load();
      d.source?.disconnect();
      d.gain?.disconnect();
    }
    this.decks.clear();
    this.master?.disconnect();
    this.analyser?.disconnect();
    this.ctx?.close().catch(() => {});
    this.ctx = null;
  }
}
