// Velora City — all sound is synthesised with WebAudio. No audio files, no network.
export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.musicTimer = null;
    this.musicStep = 0;
    this.engineOsc = null;
    this.engineOsc2 = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenOn = false;
  }

  // Must be called from a user gesture (the Play button) — browsers block audio before that.
  init() {
    if (this.ctx) { this.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    this.startEngine();
    this.startMusic();
  }

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  now() { return this.ctx ? this.ctx.currentTime : 0; }

  // --- engine hum: two detuned saws through a lowpass, pitch follows speed ---
  startEngine() {
    const c = this.ctx;
    this.engineGain = c.createGain();
    this.engineGain.gain.value = 0.0;
    const filt = c.createBiquadFilter();
    filt.type = 'lowpass'; filt.frequency.value = 420; filt.Q.value = 2;
    this.engineOsc = c.createOscillator();
    this.engineOsc.type = 'sawtooth'; this.engineOsc.frequency.value = 55;
    this.engineOsc2 = c.createOscillator();
    this.engineOsc2.type = 'sawtooth'; this.engineOsc2.frequency.value = 55 * 1.5;
    const g2 = c.createGain(); g2.gain.value = 0.4;
    this.engineOsc.connect(filt);
    this.engineOsc2.connect(g2); g2.connect(filt);
    filt.connect(this.engineGain); this.engineGain.connect(this.master);
    this.engineOsc.start(); this.engineOsc2.start();
  }
  setEngine(speed01, on) {
    if (!this.ctx) return;
    const t = this.now();
    const target = on ? 0.05 + speed01 * 0.09 : 0.0;
    this.engineGain.gain.setTargetAtTime(target, t, 0.1);
    const f = 48 + speed01 * 130;
    this.engineOsc.frequency.setTargetAtTime(f, t, 0.08);
    this.engineOsc2.frequency.setTargetAtTime(f * 1.5, t, 0.08);
  }

  // --- police siren: two alternating tones, only while a chase is on ---
  setSiren(on) {
    if (!this.ctx || on === this.sirenOn) return;
    this.sirenOn = on;
    if (on) {
      const c = this.ctx;
      this.sirenGain = c.createGain(); this.sirenGain.gain.value = 0.045;
      this.sirenOsc = c.createOscillator(); this.sirenOsc.type = 'triangle';
      this.sirenOsc.frequency.value = 720;
      const lfo = c.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 1.6;
      const lfoGain = c.createGain(); lfoGain.gain.value = 260;
      lfo.connect(lfoGain); lfoGain.connect(this.sirenOsc.frequency);
      this.sirenOsc.connect(this.sirenGain); this.sirenGain.connect(this.master);
      this.sirenOsc.start(); lfo.start();
      this.sirenLfo = lfo;
    } else {
      try { this.sirenOsc.stop(); this.sirenLfo.stop(); } catch { /* already stopped */ }
      this.sirenOsc = null; this.sirenGain = null; this.sirenLfo = null;
    }
  }

  // --- one-shot blips and bangs ---
  blip(freq = 880, dur = 0.09, type = 'square', vol = 0.12) {
    if (!this.ctx || this.muted) return;
    const c = this.ctx, t = this.now();
    const o = c.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  pickup() { this.blip(660, 0.07); setTimeout(() => this.blip(990, 0.1), 70); }
  cash() { this.blip(1320, 0.06); setTimeout(() => this.blip(1760, 0.12), 60); }
  error() { this.blip(160, 0.18, 'sawtooth', 0.14); }
  missionDone() {
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.blip(f, 0.16, 'triangle', 0.14), i * 110));
  }
  gunshot() {
    if (!this.ctx || this.muted) return;
    const c = this.ctx, t = this.now();
    const len = Math.floor(c.sampleRate * 0.14);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
    const src = c.createBufferSource(); src.buffer = buf;
    const filt = c.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 1800;
    const g = c.createGain(); g.gain.value = 0.5;
    src.connect(filt); filt.connect(g); g.connect(this.master);
    src.start(t);
    this.blip(90, 0.1, 'sine', 0.25);
  }
  thud() { this.blip(70, 0.22, 'sine', 0.3); }
  skid() {
    if (!this.ctx || this.muted) return;
    const c = this.ctx, t = this.now();
    const len = Math.floor(c.sampleRate * 0.25);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * 0.25 * (1 - i / len);
    const src = c.createBufferSource(); src.buffer = buf;
    const filt = c.createBiquadFilter(); filt.type = 'highpass'; filt.frequency.value = 900;
    const g = c.createGain(); g.gain.value = 0.12;
    src.connect(filt); filt.connect(g); g.connect(this.master);
    src.start(t);
  }

  // --- music: a lazy sunset groove. Bass + sparkle, scheduled in 8th notes. ---
  startMusic() {
    if (this.musicTimer) return;
    // A minor groove: Am – F – C – G, one bar each.
    const bassNotes = [55, 43.65, 65.41, 49];
    const spark = [220, 261.6, 329.6, 392, 440, 523.25];
    const stepDur = 60 / 96 / 2; // 96 bpm, 8th notes
    this.musicTimer = setInterval(() => {
      if (!this.ctx || this.muted) return;
      const bar = Math.floor(this.musicStep / 8) % 4;
      const step = this.musicStep % 8;
      if (step === 0 || step === 3 || step === 6) {
        this.note(bassNotes[bar], stepDur * 1.8, 'triangle', 0.16);
      }
      if (step % 2 === 0) {
        const n = spark[(this.musicStep * 7 + bar * 3) % spark.length];
        this.note(n, stepDur * 0.9, 'sine', 0.045);
      }
      if (step === 4) this.note(bassNotes[bar] * 2, stepDur, 'sine', 0.05);
      this.musicStep++;
    }, stepDur * 1000);
  }
  note(freq, dur, type, vol) {
    const c = this.ctx, t = this.now();
    const o = c.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }
}
