// audio.js — WebAudio synth SFX + ambient loop. No audio files, no network.
export function initAudio(G) {
  let ctx = null;
  let engineOsc = null, engineGain = null, muted = false;
  let sirenOsc = null, sirenGain = null;

  function ensure() {
    if (ctx) return ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      // engine hum
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0.0;
      const filt = ctx.createBiquadFilter();
      filt.type = 'lowpass'; filt.frequency.value = 320;
      engineOsc.connect(filt); filt.connect(engineGain); engineGain.connect(ctx.destination);
      engineOsc.start();
      // ambient pad loop
      const pad = ctx.createOscillator();
      pad.type = 'sine'; pad.frequency.value = 110;
      const padGain = ctx.createGain(); padGain.gain.value = 0.012;
      pad.connect(padGain); padGain.connect(ctx.destination);
      pad.start();
    } catch { ctx = null; }
    return ctx;
  }

  function noiseBurst(dur, freq, vol) {
    if (!ensure() || muted) return;
    try {
      const len = Math.floor(ctx.sampleRate * dur);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource(); src.buffer = buf;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
      const g = ctx.createGain(); g.gain.value = vol;
      src.connect(f); f.connect(g); g.connect(ctx.destination);
      src.start();
    } catch { /* ignore */ }
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (!ensure() || muted) return;
    try {
      const o = ctx.createOscillator();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, ctx.currentTime);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      o.connect(g); g.connect(ctx.destination);
      o.start(); o.stop(ctx.currentTime + dur);
    } catch { /* ignore */ }
  }

  const api = {
    unlock() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {}); },
    gunshot() { noiseBurst(0.14, 1800, 0.5); tone(180, 0.08, 'square', 0.25, 60); },
    thud() { noiseBurst(0.1, 300, 0.5); tone(90, 0.12, 'sine', 0.4, 50); },
    chime() { tone(880, 0.15, 'sine', 0.25); setTimeout(() => tone(1320, 0.2, 'sine', 0.22), 90); },
    jingle() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.25, 'triangle', 0.25), i * 130)); },
    click() { tone(1200, 0.05, 'square', 0.12); },
    siren(on) {
      if (!ensure()) return;
      if (on && !sirenOsc) {
        try {
          sirenOsc = ctx.createOscillator(); sirenOsc.type = 'triangle';
          sirenGain = ctx.createGain(); sirenGain.gain.value = 0.03;
          sirenOsc.connect(sirenGain); sirenGain.connect(ctx.destination);
          sirenOsc.start();
          sirenOsc.frequency.setValueAtTime(700, ctx.currentTime);
          sirenOsc.frequency.linearRampToValueAtTime(950, ctx.currentTime + 0.5);
        } catch { sirenOsc = null; }
      } else if (!on && sirenOsc) {
        try { sirenOsc.stop(); } catch { /* ignore */ }
        sirenOsc = null;
      }
    },
    engine(speedNorm) {
      if (!ensure() || muted) return;
      try {
        engineGain.gain.value = speedNorm > 0.02 ? 0.02 + speedNorm * 0.05 : 0.0;
        engineOsc.frequency.value = 55 + speedNorm * 160;
      } catch { /* ignore */ }
    },
    toggleMute() {
      muted = !muted;
      if (ctx) { try { ctx.suspend(); } catch { /* ignore */ } if (!muted) ctx.resume().catch(() => {}); }
      return muted;
    },
    get muted() { return muted; },
  };
  G.audio = api;
  return api;
}
