// Tiny procedural soundscape: rolling waves, breeze, distant birds + SFX.
export class Audio {
  constructor() { this.ctx = null; this.volume = 0.7; }

  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(ctx.destination);

    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
    const noise = (gain, freq, q, lfoRate, lfoDepth) => {
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain(); g.gain.value = gain;
      const lfo = ctx.createOscillator(); lfo.frequency.value = lfoRate;
      const lg = ctx.createGain(); lg.gain.value = lfoDepth;
      lfo.connect(lg); lg.connect(g.gain);
      src.connect(f); f.connect(g); g.connect(this.master);
      src.start(0, Math.random() * 3); lfo.start();
      return g;
    };
    this.waves = noise(0.5, 520, 0.4, 0.12, 0.35);
    noise(0.12, 1800, 0.2, 0.05, 0.08);
    this.birdTimer = setInterval(() => this.bird(), 2600);
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }

  tone(freq0, freq1, dur, type = 'sine', gain = 0.12, delay = 0) {
    const ctx = this.ctx; if (!ctx) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator(); o.type = type;
    const g = ctx.createGain();
    o.frequency.setValueAtTime(freq0, t);
    o.frequency.exponentialRampToValueAtTime(freq1, t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  bird() {
    if (!this.ctx || document.hidden || Math.random() < 0.45) return;
    const base = 2200 + Math.random() * 1600;
    const n = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) this.tone(base, base * (1.2 + Math.random() * 0.3), 0.07, 'sine', 0.025, i * 0.11);
  }

  sfx(name) {
    if (!this.ctx) return;
    if (name === 'cast') this.tone(900, 300, 0.35, 'triangle', 0.05);
    if (name === 'plop') { this.tone(420, 140, 0.18, 'sine', 0.18); }
    if (name === 'bite') { this.tone(700, 500, 0.08, 'square', 0.05); this.tone(700, 500, 0.08, 'square', 0.05, 0.12); }
    if (name === 'catch') [523, 659, 784, 1046].forEach((f, i) => this.tone(f, f, 0.18, 'triangle', 0.09, i * 0.09));
    if (name === 'click') this.tone(1200, 900, 0.04, 'square', 0.03);
    if (name === 'tick') this.tone(1800, 1400, 0.035, 'sine', 0.04);
    if (name === 'open') { this.tone(500, 900, 0.12, 'sine', 0.05); }
  }
}
