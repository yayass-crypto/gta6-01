// WebAudio synth sound for Solmar Heat — no audio files, everything synthesized.
export class Synth {
  constructor() {
    this.ctx = null; this.muted = false; this.engineOsc = null; this.engineGain = null;
    this.sirenOsc = null; this.sirenGain = null; this.ambient = null;
  }
  ensure() {
    if (this.ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain(); this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      return true;
    } catch { return false; }
  }
  resume() { if (this.ensure() && this.ctx.state === 'suspended') this.ctx.resume(); }
  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }
  _noiseBuf(dur = 0.5) {
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }
  blip(freq, dur, type = 'sine', vol = 0.25, slideTo = null) {
    if (!this.ensure() || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }
  noise(dur, vol, filterFreq = 1200) {
    if (!this.ensure() || this.muted) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource(); src.buffer = this._noiseBuf(dur + 0.1);
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master); src.start(t); src.stop(t + dur + 0.05);
  }
  shot() { this.noise(0.16, 0.5, 2800); this.blip(160, 0.1, 'square', 0.18, 60); }
  punch() { this.blip(110, 0.12, 'sine', 0.35, 45); this.noise(0.08, 0.2, 500); }
  pickup() { this.blip(660, 0.09, 'sine', 0.22); setTimeout(() => this.blip(990, 0.14, 'sine', 0.22), 90); }
  cash() { this.blip(880, 0.08, 'triangle', 0.2); setTimeout(() => this.blip(1320, 0.16, 'triangle', 0.2), 80); }
  jingle() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.blip(f, 0.18, 'triangle', 0.25), i * 110)); }
  fail() { [392, 330, 262].forEach((f, i) => setTimeout(() => this.blip(f, 0.22, 'sawtooth', 0.18), i * 140)); }
  reload() { this.blip(300, 0.06, 'square', 0.15); setTimeout(() => this.blip(420, 0.06, 'square', 0.15), 120); }
  engine(speed01, on) {
    if (!this.ensure()) return;
    if (!on) { if (this.engineGain) this.engineGain.gain.value = 0; return; }
    if (!this.engineOsc) {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = 'sawtooth'; o.frequency.value = 55;
      g.gain.value = 0.0;
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
      o.connect(f); f.connect(g); g.connect(this.master); o.start();
      this.engineOsc = o; this.engineGain = g;
    }
    this.engineOsc.frequency.value = 50 + speed01 * 130;
    this.engineGain.gain.value = this.muted ? 0 : 0.03 + speed01 * 0.05;
  }
  siren(on) {
    if (!this.ensure()) return;
    if (!on) { if (this.sirenGain) this.sirenGain.gain.value = 0; return; }
    if (!this.sirenOsc) {
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = 'triangle'; o.frequency.value = 700;
      g.gain.value = 0;
      const lfo = this.ctx.createOscillator(); lfo.frequency.value = 0.9;
      const lg = this.ctx.createGain(); lg.gain.value = 260;
      lfo.connect(lg); lg.connect(o.frequency); lfo.start();
      o.connect(g); g.connect(this.master); o.start();
      this.sirenOsc = o; this.sirenGain = g;
    }
    this.sirenGain.gain.value = this.muted ? 0 : 0.035;
  }
  startAmbient() {
    if (!this.ensure() || this.ambient) return;
    const src = this.ctx.createBufferSource(); src.buffer = this._noiseBuf(2); src.loop = true;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 240;
    const g = this.ctx.createGain(); g.gain.value = 0.05;
    src.connect(f); f.connect(g); g.connect(this.master); src.start();
    this.ambient = src;
  }
}
