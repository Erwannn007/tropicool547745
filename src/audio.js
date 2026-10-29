// Procedural soundscape (no sample files): lagoon swell and lapping water that
// follow the shore, breeze in the leaves, several kinds of birds placed around
// the listener, faint insects, footsteps per ground type + SFX.
export class Audio {
  constructor() { this.ctx = null; this.volume = 0.7; this.shore = 0.5; this.timers = []; this.night = 0; this.fire = 0; }

  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(ctx.destination);

    // brown noise (soft rumble) + white noise (hiss, crunch, splash)
    const len = ctx.sampleRate * 4;
    this.brown = ctx.createBuffer(1, len, ctx.sampleRate);
    this.white = ctx.createBuffer(1, len, ctx.sampleRate);
    const b = this.brown.getChannelData(0), w = this.white.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      w[i] = Math.random() * 2 - 1;
      last = (last + 0.02 * w[i]) / 1.02; b[i] = last * 3.5;
    }

    // ambience buses: sea follows the shore distance, nature stays constant
    this.seaBus = ctx.createGain(); this.seaBus.connect(this.master);
    this.natureBus = ctx.createGain(); this.natureBus.gain.value = 0.9; this.natureBus.connect(this.master);
    this.setShore(this.shore);

    const loop = (buf, gain, type, freq, q, lfoRate, lfoDepth, out) => {
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain(); g.gain.value = gain;
      const lfo = ctx.createOscillator(); lfo.frequency.value = lfoRate;
      const lg = ctx.createGain(); lg.gain.value = lfoDepth;
      lfo.connect(lg); lg.connect(g.gain);
      src.connect(f); f.connect(g); g.connect(out);
      src.start(0, Math.random() * 3); lfo.start();
      return g;
    };
    loop(this.brown, 0.32, 'lowpass', 420, 0.4, 0.11, 0.18, this.seaBus);       // calm lagoon bed
    loop(this.white, 0.012, 'bandpass', 2600, 0.5, 0.07, 0.009, this.natureBus); // leaves in the breeze
    loop(this.brown, 0.05, 'lowpass', 1400, 0.2, 0.05, 0.035, this.natureBus);  // soft wind

    // rain: a hiss bed + low patter, faded by setRain()
    this.rainBus = ctx.createGain(); this.rainBus.gain.value = 0; this.rainBus.connect(this.master);
    loop(this.white, 0.05, 'bandpass', 3800, 0.35, 0.3, 0.012, this.rainBus);
    loop(this.brown, 0.18, 'lowpass', 900, 0.4, 0.2, 0.05, this.rainBus);
    this.every(0.05, 0.16, () => { if (this.rainBus.gain.value > 0.05) this.noise({ type: 'highpass', f0: 2500 + Math.random() * 3000, q: 0.8, dur: 0.02, gain: 0.03 * this.rainBus.gain.value, out: this.spot((Math.random() - 0.5) * 1.8, Math.random() * 0.6) }); });
    this.every(25, 60, () => { if (this.rainBus.gain.value > 0.6) this.thunder(); });
    // fire crackle near camp fires and torches
    this.fireBus = ctx.createGain(); this.fireBus.gain.value = 0; this.fireBus.connect(this.master);
    loop(this.brown, 0.12, 'lowpass', 500, 0.5, 0.4, 0.05, this.fireBus);
    this.every(0.04, 0.22, () => { if (this.fire > 0.03) this.noise({ type: 'highpass', f0: 1500 + Math.random() * 3500, q: 1.5, dur: 0.012 + Math.random() * 0.02, attack: 0.001, gain: 0.09 * this.fire, out: this.fireBus }); });
    this.every(0.3, 0.9, () => { if (this.night > 0.5) this.crickets(); });

    this.every(5.5, 9, () => this.swell());
    this.every(0.7, 2.4, () => this.lap());
    this.every(1.6, 4.5, () => this.birdCall());
    this.every(9, 20, () => this.insects());
  }

  // run fn at random intervals, only while the page is visible and audible
  every(min, max, fn) {
    const tick = () => {
      if (this.ctx && this.ctx.state === 'running' && !document.hidden) fn();
      this.timers.push(setTimeout(tick, (min + Math.random() * (max - min)) * 1000));
    };
    this.timers.push(setTimeout(tick, Math.random() * max * 1000));
  }

  setRain(k) { if (this.rainBus) this.rainBus.gain.setTargetAtTime(k, this.ctx.currentTime, 1.5); }
  setFire(k) { this.fire = k; if (this.fireBus) this.fireBus.gain.setTargetAtTime(k, this.ctx.currentTime, 0.4); }
  setNight(k) { this.night = k; if (this.natureBus) this.natureBus.gain.setTargetAtTime(0.9 - k * 0.3, this.ctx.currentTime, 2); }

  thunder() {
    const d = Math.random() * 0.6;
    this.noise({ type: 'lowpass', f0: 220, f1: 60, q: 0.4, dur: 3.5, attack: 0.25, gain: 0.35, delay: d, buf: this.brown });
    this.noise({ type: 'lowpass', f0: 500, f1: 120, q: 0.4, dur: 1.2, attack: 0.02, gain: 0.12, delay: d + 0.1, buf: this.brown });
  }
  // night: crickets chirping in pairs
  crickets() {
    const out = this.spot((Math.random() - 0.5) * 1.8, 0.2 + Math.random() * 0.5, this.natureBus);
    const f = 4200 + Math.random() * 600;
    for (let i = 0; i < 3; i++) this.tone(f, f * 0.98, 0.03, 'sine', 0.01 * this.night, i * 0.06, out);
  }

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }

  // 0 = deep inland / up a hill, 1 = standing at the waterline
  setShore(s) {
    this.shore = s;
    if (this.seaBus) this.seaBus.gain.setTargetAtTime(0.15 + 0.85 * s, this.ctx.currentTime, 0.8);
  }

  // output node at a stereo position, farther = quieter and duller
  spot(pan = 0, dist = 0, bus = this.master) {
    const ctx = this.ctx;
    let out = bus;
    if (ctx.createStereoPanner && pan) {
      const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); p.connect(out); out = p;
    }
    if (dist > 0) {
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 9000 - dist * 6500; f.connect(out); out = f;
    }
    return out;
  }

  tone(freq0, freq1, dur, type = 'sine', gain = 0.12, delay = 0, out = this.master, vib = 0) {
    const ctx = this.ctx; if (!ctx) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator(); o.type = type;
    const g = ctx.createGain();
    o.frequency.setValueAtTime(freq0, t);
    o.frequency.exponentialRampToValueAtTime(freq1, t + dur);
    if (vib) { // little warble, for coos and gulls
      const l = ctx.createOscillator(), lg = ctx.createGain();
      l.frequency.value = 18 + Math.random() * 10; lg.gain.value = freq0 * vib;
      l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + dur + 0.05);
    }
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + Math.min(0.02, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(out);
    o.start(t); o.stop(t + dur + 0.05);
  }

  // filtered noise burst; f1 lets the filter sweep (splashes, whooshes)
  noise({ type = 'bandpass', f0 = 1000, f1 = f0, q = 1, dur = 0.1, gain = 0.1, attack = 0.005, delay = 0, out = this.master, buf = this.white }) {
    const ctx = this.ctx; if (!ctx) return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(out);
    src.start(t, Math.random() * 3); src.stop(t + dur + 0.05);
  }

  // ------------------------------------------------------------ ambience
  // a slow wave rolling onto the sand and draining back
  swell() {
    const out = this.spot((Math.random() - 0.5) * 1.2, 0, this.seaBus);
    const dur = 3.5 + Math.random() * 2;
    this.noise({ type: 'lowpass', f0: 300, f1: 900, q: 0.3, dur: dur * 0.55, attack: dur * 0.45, gain: 0.22, out, buf: this.brown });
    this.noise({ type: 'bandpass', f0: 1800, f1: 3200, q: 0.4, dur: dur * 0.6, attack: dur * 0.35, gain: 0.02, delay: dur * 0.3, out }); // foam fizz
    this.noise({ type: 'lowpass', f0: 700, f1: 250, q: 0.3, dur: dur * 0.7, attack: 0.4, gain: 0.1, delay: dur * 0.5, out, buf: this.brown }); // backwash
  }

  // small water laps and glugs against the shore / pier posts
  lap() {
    if (Math.random() > this.shore * 0.9 + 0.1) return;
    const out = this.spot((Math.random() - 0.5) * 1.6, Math.random() * 0.5, this.seaBus);
    const f = 380 + Math.random() * 420;
    this.noise({ type: 'bandpass', f0: f, f1: f * 0.6, q: 2.5, dur: 0.18 + Math.random() * 0.15, attack: 0.03, gain: 0.09, out, buf: this.brown });
    if (Math.random() < 0.4) this.tone(f * 1.4, f * 2.2, 0.06, 'sine', 0.012, 0.05, out); // glug
  }

  birdCall() {
    const pan = (Math.random() - 0.5) * 1.8, dist = Math.random() * 0.8;
    const out = this.spot(pan, dist, this.natureBus);
    const vol = 1 - dist * 0.6;
    const r = Math.random();
    if (r < 0.28) { // little chirps
      const base = 2400 + Math.random() * 1600, n = 2 + Math.floor(Math.random() * 4);
      for (let i = 0; i < n; i++) this.tone(base, base * (1.2 + Math.random() * 0.3), 0.06, 'sine', 0.03 * vol, i * (0.09 + Math.random() * 0.05), out);
    } else if (r < 0.48) { // warbler trill
      const base = 3000 + Math.random() * 900, n = 8 + Math.floor(Math.random() * 8);
      for (let i = 0; i < n; i++) this.tone(base * (1 + (i % 2) * 0.18), base * (1.1 - (i % 2) * 0.12), 0.035, 'sine', 0.022 * vol, i * 0.045, out);
    } else if (r < 0.66) { // tropical "wee-oo" whistle, sometimes answered
      const b = 1400 + Math.random() * 500;
      this.tone(b, b * 1.7, 0.18, 'sine', 0.035 * vol, 0, out);
      this.tone(b * 1.6, b * 0.9, 0.26, 'sine', 0.032 * vol, 0.22, out);
      if (Math.random() < 0.5) {
        const o2 = this.spot(-pan, dist, this.natureBus);
        this.tone(b * 1.05, b * 1.8, 0.18, 'sine', 0.025 * vol, 0.9, o2);
        this.tone(b * 1.7, b * 0.95, 0.26, 'sine', 0.022 * vol, 1.12, o2);
      }
    } else if (r < 0.8) { // dove: hoo-hoo-hoooo
      const b = 360 + Math.random() * 80;
      [[0, 0.22], [0.32, 0.22], [0.66, 0.6]].forEach(([d, l]) => this.tone(b * 1.05, b * 0.92, l, 'sine', 0.05 * vol, d, out, 0.012));
    } else if (r < 0.92) { // gull over the water
      const o = this.spot(pan, dist, this.seaBus);
      for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) {
        this.tone(1300, 1700, 0.08, 'triangle', 0.016 * vol, i * 0.32, o);
        this.tone(1700, 950, 0.22, 'triangle', 0.018 * vol, i * 0.32 + 0.08, o, 0.02);
      }
    } else { // far parrot squawk
      const o = this.spot(pan, 0.7, this.natureBus);
      this.tone(900, 1400, 0.09, 'sawtooth', 0.008, 0, o, 0.04);
      this.tone(1300, 800, 0.14, 'sawtooth', 0.008, 0.1, o, 0.04);
    }
  }

  // cicadas fading in and out somewhere in the trees
  insects() {
    if (Math.random() < 0.4) return;
    const ctx = this.ctx, t = ctx.currentTime, dur = 4 + Math.random() * 4;
    const out = this.spot((Math.random() - 0.5) * 1.6, 0.3, this.natureBus);
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 4800 + Math.random() * 900;
    const am = ctx.createOscillator(); am.frequency.value = 38 + Math.random() * 20;
    const amg = ctx.createGain(); amg.gain.value = 0.5;
    const g = ctx.createGain(), env = ctx.createGain();
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = o.frequency.value; f.Q.value = 4;
    g.gain.value = 0.5; am.connect(amg); amg.connect(g.gain);
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.006, t + dur * 0.4);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f); f.connect(g); g.connect(env); env.connect(out);
    o.start(t); am.start(t); o.stop(t + dur + 0.1); am.stop(t + dur + 0.1);
  }

  // ------------------------------------------------------------ player
  // one footstep; k = 0..1 walking speed
  step(surface, k = 0.6) {
    if (!this.ctx) return;
    const j = () => 0.85 + Math.random() * 0.3, v = 0.6 + 0.5 * k;
    const out = this.spot((Math.random() - 0.5) * 0.3);
    if (surface === 'sand') {
      this.noise({ type: 'bandpass', f0: 1500 * j(), f1: 700, q: 0.8, dur: 0.13, attack: 0.015, gain: 0.11 * v, out });
      this.noise({ type: 'highpass', f0: 3500 * j(), q: 0.5, dur: 0.07, gain: 0.025 * v, delay: 0.02, out }); // grains
      this.noise({ type: 'lowpass', f0: 260, q: 0.5, dur: 0.08, gain: 0.12 * v, out, buf: this.brown });
    } else if (surface === 'grass') {
      this.noise({ type: 'bandpass', f0: 3200 * j(), f1: 1800, q: 0.6, dur: 0.16, attack: 0.02, gain: 0.05 * v, out });
      this.noise({ type: 'bandpass', f0: 1100 * j(), q: 1, dur: 0.07, gain: 0.05 * v, delay: 0.03, out }); // a twig
      this.noise({ type: 'lowpass', f0: 220, q: 0.5, dur: 0.09, gain: 0.14 * v, out, buf: this.brown });
    } else if (surface === 'wood') {
      const p = 150 * j();
      this.tone(p, p * 0.7, 0.12, 'triangle', 0.14 * v, 0, out);
      this.tone(p * 2.6, p * 2, 0.05, 'sine', 0.04 * v, 0, out);
      this.noise({ type: 'bandpass', f0: 900 * j(), q: 3, dur: 0.05, gain: 0.06 * v, out });
      if (Math.random() < 0.15) this.tone(260, 200, 0.18, 'sawtooth', 0.008, 0.04, out); // creaky plank
    } else if (surface === 'rock') {
      this.noise({ type: 'highpass', f0: 2200 * j(), q: 0.7, dur: 0.04, gain: 0.06 * v, out });
      this.tone(420 * j(), 300, 0.04, 'triangle', 0.05 * v, 0, out);
      this.noise({ type: 'lowpass', f0: 300, q: 0.5, dur: 0.06, gain: 0.1 * v, out, buf: this.brown });
    } else if (surface === 'water') {
      this.noise({ type: 'bandpass', f0: 600 * j(), f1: 2400, q: 0.9, dur: 0.28, attack: 0.02, gain: 0.12 * v, out });
      this.noise({ type: 'lowpass', f0: 500, q: 0.5, dur: 0.2, gain: 0.08 * v, delay: 0.06, out, buf: this.brown });
      for (let i = 0; i < 2; i++) this.tone(700 * j(), 1400 * j(), 0.05, 'sine', 0.015, 0.1 + i * 0.07, out); // drips
    } else if (surface === 'swim') {
      this.noise({ type: 'lowpass', f0: 400, f1: 1300, q: 0.7, dur: 0.6, attack: 0.25, gain: 0.12, out, buf: this.brown });
      this.noise({ type: 'bandpass', f0: 1500, f1: 900, q: 0.8, dur: 0.45, attack: 0.15, gain: 0.03, delay: 0.1, out });
      for (let i = 0; i < 3; i++) this.tone(500 * j(), 1100 * j(), 0.05, 'sine', 0.012, 0.3 + i * 0.08, out); // bubbles
    }
  }

  land(surface, speed) {
    if (!this.ctx) return;
    const k = Math.min(1, speed / 9);
    if (surface === 'water' || surface === 'swim') { this.sfx('splash'); return; }
    this.step(surface, 1);
    this.noise({ type: 'lowpass', f0: 180, q: 0.5, dur: 0.18, gain: 0.25 * k, buf: this.brown });
  }

  // axe biting into a trunk; prog = 0..1 how deep the cut already is
  chop(type, prog = 0) {
    const palm = type === 'palms', j = 0.93 + Math.random() * 0.14;
    const body = (palm ? 150 : 205) * j * (1 - prog * 0.18); // duller as the cut deepens
    this.noise({ type: 'highpass', f0: 2600, q: 0.7, dur: 0.025, attack: 0.001, gain: 0.22 });           // steel bite
    this.noise({ type: 'bandpass', f0: body * 2, q: 9, dur: 0.24, attack: 0.002, gain: 0.55 });          // wooden knock
    this.noise({ type: 'bandpass', f0: body * 3.4, q: 7, dur: 0.13, attack: 0.002, gain: 0.28 });
    this.tone(body, body * 0.78, 0.17, 'sine', 0.22);
    this.noise({ type: 'lowpass', f0: 200, q: 0.5, dur: 0.12, gain: 0.3, buf: this.brown });           // weight of the blow
    if (palm) {
      this.noise({ type: 'bandpass', f0: 1700, f1: 1100, q: 1.5, dur: 0.1, gain: 0.09, delay: 0.012 }); // fibres tearing
      this.noise({ type: 'bandpass', f0: 3600, f1: 2600, q: 0.6, dur: 0.75, attack: 0.08, gain: 0.05, delay: 0.06 }); // fronds shaking
    } else {
      for (let i = 0; i < 3; i++) this.noise({ type: 'highpass', f0: 3000 + Math.random() * 2000, q: 1, dur: 0.02, gain: 0.05, delay: 0.03 + i * 0.03 * Math.random() }); // splinters
      this.noise({ type: 'bandpass', f0: 3000, q: 0.6, dur: 0.5, attack: 0.06, gain: 0.035, delay: 0.05 }); // leaves
    }
  }

  // trunk gives way: splintering, a long fibre creak, then the crown rushing through the air
  fall(type) {
    for (let i = 0; i < 8; i++) this.noise({ type: 'highpass', f0: 1500 + Math.random() * 2500, q: 1, dur: 0.035, gain: 0.12, delay: i * 0.04 * Math.random() * 2 });
    this.tone(120, 70, 1.1, 'sawtooth', 0.03, 0.05, this.master, 0.05);
    this.tone(180, 110, 0.7, 'sawtooth', 0.015, 0.15, this.master, 0.06);
    this.noise({ f0: 600, f1: 2200, q: 0.7, dur: 1.3, attack: 1.1, gain: type === 'palms' ? 0.11 : 0.09 });
    this.noise({ type: 'lowpass', f0: 300, f1: 900, q: 0.4, dur: 1.3, attack: 1.1, gain: 0.14, buf: this.brown });
  }

  // crown hits the ground: boom, leaves crashing, and a blast of wind along the ground
  landTree(type) {
    this.tone(90, 35, 0.6, 'sine', 0.4);
    this.noise({ type: 'lowpass', f0: 500, f1: 120, q: 0.5, dur: 1.0, attack: 0.005, gain: 0.35, buf: this.brown });
    this.noise({ f0: 2500, f1: 1500, q: 0.5, dur: 0.8, attack: 0.01, gain: 0.13 });
    if (type === 'palms') for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++) { // coconuts bouncing
      const f = 260 + Math.random() * 80, d = 0.15 + i * 0.18 + Math.random() * 0.08;
      this.tone(f, f * 0.7, 0.09, 'triangle', 0.08, d); this.tone(f * 0.9, f * 0.65, 0.06, 'triangle', 0.04, d + 0.16);
    }
    this.noise({ f0: 900, f1: 280, q: 0.6, dur: 1.7, attack: 0.08, gain: 0.14, delay: 0.04, buf: this.brown }); // gust
    this.noise({ type: 'highpass', f0: 2500, f1: 4500, q: 0.4, dur: 1.3, attack: 0.15, gain: 0.035, delay: 0.05 }); // grass hiss
  }

  // steel point into stone: a bright ring, the crack of the blow, the knock
  // of the rock (deeper as it splits), grit trickling down; prog = 0..1
  mine(prog = 0) {
    const j = 0.94 + Math.random() * 0.12, body = 520 * j * (1 - prog * 0.3);
    this.noise({ type: 'highpass', f0: 3200, q: 0.8, dur: 0.03, attack: 0.001, gain: 0.3 });           // the bite
    this.tone(2650 * j, 2550 * j, 0.22, 'sine', 0.06 * (1 - prog * 0.5));                               // steel ring...
    this.tone(4170 * j, 4050 * j, 0.14, 'sine', 0.035 * (1 - prog * 0.5));                              // ...inharmonic partial
    this.noise({ type: 'bandpass', f0: body, q: 6, dur: 0.16, attack: 0.002, gain: 0.5 });              // stone knock
    this.noise({ type: 'bandpass', f0: body * 2.3, q: 5, dur: 0.08, attack: 0.002, gain: 0.22 });
    this.tone(body * 0.42, body * 0.3, 0.12, 'triangle', 0.16);
    this.noise({ type: 'lowpass', f0: 220, q: 0.5, dur: 0.12, gain: 0.32, buf: this.brown });          // weight of the blow
    for (let i = 0; i < 4 + Math.round(prog * 5); i++) {                                                 // grit and chips falling
      const d = 0.05 + Math.random() * 0.35;
      this.noise({ type: 'bandpass', f0: 2200 + Math.random() * 3000, q: 4, dur: 0.018, attack: 0.001, gain: 0.05 + Math.random() * 0.04, delay: d });
    }
    if (prog > 0.5) this.noise({ type: 'bandpass', f0: 900, f1: 500, q: 2, dur: 0.1, gain: 0.12, delay: 0.015 }); // a crack opening
  }

  // the stone gives way: a sharp split, a heavy crunch, rubble rattling down
  crumble() {
    this.noise({ type: 'highpass', f0: 2600, q: 0.7, dur: 0.04, attack: 0.001, gain: 0.32 });
    this.tone(2400, 2300, 0.12, 'sine', 0.03);
    this.noise({ type: 'bandpass', f0: 380, f1: 180, q: 1.5, dur: 0.35, attack: 0.003, gain: 0.45 });
    this.tone(110, 50, 0.4, 'sine', 0.35);
    this.noise({ type: 'lowpass', f0: 700, f1: 150, q: 0.5, dur: 0.6, attack: 0.005, gain: 0.35, buf: this.brown });
    for (let i = 0; i < 16; i++) { // pieces knocking together as they land
      const d = 0.08 + Math.random() * 0.7, f = 700 + Math.random() * 2200;
      this.noise({ type: 'bandpass', f0: f, q: 6, dur: 0.03 + Math.random() * 0.03, attack: 0.001, gain: 0.07 + Math.random() * 0.08, delay: d });
    }
    this.noise({ f0: 2400, f1: 1200, q: 0.5, dur: 0.9, attack: 0.1, gain: 0.04, delay: 0.1 }); // grit settling
  }

  sfx(name) {
    if (!this.ctx) return;
    const [kind, a, b] = name.split(':');
    if (kind === 'chop') return this.chop(a, +b || 0);
    if (kind === 'fall') return this.fall(a);
    if (kind === 'thud') return this.landTree(a);
    if (kind === 'mine') return this.mine(+a || 0);
    if (name === 'crumble') return this.crumble();
    if (name === 'pickSwing') { // heavy head rocked back, then whooshing down
      this.noise({ type: 'lowpass', f0: 300, f1: 500, q: 0.6, dur: 0.16, attack: 0.08, gain: 0.05, buf: this.brown });
      this.noise({ f0: 450, f1: 1500, q: 1.1, dur: 0.12, attack: 0.08, gain: 0.08, delay: 0.17 });
    }
    if (name === 'clank') { // a cliff rock too big for the pick
      this.noise({ type: 'highpass', f0: 3000, q: 0.8, dur: 0.03, attack: 0.001, gain: 0.3 });
      this.tone(2900, 2800, 0.35, 'sine', 0.07); this.tone(4400, 4300, 0.25, 'sine', 0.04); this.tone(1900, 1850, 0.3, 'triangle', 0.03);
      this.noise({ type: 'bandpass', f0: 700, q: 5, dur: 0.1, gain: 0.25 });
      this.noise({ type: 'lowpass', f0: 200, q: 0.5, dur: 0.1, gain: 0.25, buf: this.brown });
    }
    if (name === 'clack') { const f = 900 + Math.random() * 900; this.noise({ type: 'bandpass', f0: f, q: 7, dur: 0.05, attack: 0.001, gain: 0.12 }); this.tone(f * 0.5, f * 0.4, 0.05, 'triangle', 0.04); }
    if (kind === 'dig') { // point into the ground
      this.noise({ type: 'lowpass', f0: 300, q: 0.5, dur: 0.14, gain: 0.35, buf: this.brown });
      this.noise({ type: 'bandpass', f0: a === 'sand' ? 1700 : 1000, f1: 600, q: 0.8, dur: 0.18, attack: 0.004, gain: 0.12 });
      this.noise({ type: 'highpass', f0: 3500, q: 0.5, dur: 0.25, attack: 0.02, gain: 0.03, delay: 0.04 }); // earth sprinkling back
    }
    if (name === 'cast') { this.tone(900, 300, 0.35, 'triangle', 0.04); this.noise({ f0: 2500, f1: 900, q: 0.8, dur: 0.3, attack: 0.08, gain: 0.04 }); }
    if (name === 'plop') { this.tone(420, 140, 0.18, 'sine', 0.16); this.noise({ f0: 900, f1: 2000, q: 1, dur: 0.25, gain: 0.06, delay: 0.02 }); }
    if (name === 'bite') { this.tone(700, 500, 0.08, 'square', 0.05); this.tone(700, 500, 0.08, 'square', 0.05, 0.12); }
    if (name === 'catch') [523, 659, 784, 1046].forEach((f, i) => this.tone(f, f, 0.18, 'triangle', 0.09, i * 0.09));
    if (name === 'click') this.tone(1200, 900, 0.04, 'square', 0.03);
    if (name === 'swing') this.noise({ f0: 500, f1: 1800, q: 1.2, dur: 0.2, attack: 0.1, gain: 0.07, delay: 0.12 });
    if (name === 'swish') { // scythe through the air, then grass shearing
      this.noise({ f0: 700, f1: 2600, q: 0.9, dur: 0.28, attack: 0.12, gain: 0.08, delay: 0.1 });
    }
    if (name === 'mow') {
      this.noise({ type: 'highpass', f0: 3200, f1: 5200, q: 0.6, dur: 0.22, attack: 0.01, gain: 0.08 });
      this.noise({ f0: 1800, f1: 900, q: 0.8, dur: 0.18, gain: 0.06, delay: 0.02 });
      for (let i = 0; i < 4; i++) this.noise({ type: 'highpass', f0: 4000 + Math.random() * 2000, q: 1, dur: 0.015, gain: 0.04, delay: 0.02 + i * 0.03 });
    }
    if (name === 'place') {
      this.tone(160, 110, 0.12, 'triangle', 0.14);
      this.noise({ type: 'lowpass', f0: 500, q: 0.5, dur: 0.14, gain: 0.18, buf: this.brown });
      this.noise({ f0: 2400, f1: 1200, q: 0.8, dur: 0.12, gain: 0.03, delay: 0.03 });
    }
    if (name === 'page') { // paper turning
      this.noise({ f0: 1800, f1: 3800, q: 0.6, dur: 0.22, attack: 0.06, gain: 0.05 });
      this.noise({ type: 'highpass', f0: 4000, q: 0.5, dur: 0.08, gain: 0.02, delay: 0.14 });
    }
    if (name === 'chestOpen') { // latch click, then the old hinge creaking
      this.tone(1900, 1500, 0.03, 'square', 0.03);
      this.noise({ type: 'highpass', f0: 3000, q: 1, dur: 0.02, gain: 0.05 });
      this.tone(210, 340, 0.42, 'sawtooth', 0.016, 0.06, this.master, 0.08);
      this.noise({ type: 'bandpass', f0: 900, f1: 1500, q: 7, dur: 0.4, attack: 0.08, gain: 0.05, delay: 0.06 });
      this.noise({ type: 'lowpass', f0: 400, q: 0.5, dur: 0.25, gain: 0.05, delay: 0.1, buf: this.brown });
    }
    if (name === 'chestClose') this.noise({ type: 'bandpass', f0: 1200, f1: 700, q: 6, dur: 0.22, attack: 0.04, gain: 0.04 }); // hinge going back
    if (name === 'chestShut') { // heavy lid lands on the box
      this.tone(120, 70, 0.22, 'sine', 0.3);
      this.noise({ type: 'lowpass', f0: 700, f1: 200, q: 0.6, dur: 0.2, attack: 0.002, gain: 0.3, buf: this.brown });
      this.noise({ type: 'bandpass', f0: 380, q: 5, dur: 0.12, gain: 0.12 });
      this.tone(2300, 2000, 0.05, 'triangle', 0.02, 0.03); // brass rattle
    }
    if (name === 'deny') { this.tone(300, 220, 0.09, 'square', 0.025); this.tone(240, 180, 0.12, 'square', 0.025, 0.09); }
    if (name === 'craft') {
      [0, 0.08, 0.16].forEach((d) => this.tone(200 + d * 600, 150, 0.06, 'triangle', 0.1, d));
      [784, 988, 1318].forEach((f, i) => this.tone(f, f, 0.12, 'triangle', 0.05, 0.26 + i * 0.07));
    }
    if (name === 'whiff') this.noise({ f0: 1600, f1: 600, q: 1.2, dur: 0.14, attack: 0.03, gain: 0.05 });
    if (name === 'pickup') { this.tone(880, 1320, 0.08, 'sine', 0.06); this.tone(1320, 1760, 0.08, 'sine', 0.05, 0.07); }
    if (name === 'tick') this.tone(1800, 1400, 0.035, 'sine', 0.04);
    if (name === 'open') { this.tone(500, 900, 0.12, 'sine', 0.05); }
    if (name === 'jump') this.noise({ f0: 700, f1: 1500, q: 0.8, dur: 0.12, attack: 0.02, gain: 0.04 });
    if (name === 'splash') {
      this.noise({ type: 'lowpass', f0: 2500, f1: 400, q: 0.5, dur: 0.7, attack: 0.01, gain: 0.25, buf: this.brown });
      this.noise({ f0: 2200, f1: 800, q: 0.7, dur: 0.5, gain: 0.1 });
      for (let i = 0; i < 5; i++) this.tone(400 + Math.random() * 600, 900 + Math.random() * 900, 0.06, 'sine', 0.02, 0.15 + i * 0.07);
    }
  }
}
