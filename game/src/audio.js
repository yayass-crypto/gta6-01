// Solmar Heat sound: every effect is synthesised with WebAudio — no audio
// files, no network. The context starts lazily on the first user gesture, so
// headless screenshot runs stay silent and error-free.
export function createAudio() {
  const A = {
    ctx: null,
    master: null,
    muted: false,
    engineNodes: null,
    sirenNodes: null,
    ambientNodes: null,
  };

  function ensure() {
    if (A.ctx) return A.ctx;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      A.ctx = new Ctx();
      A.master = A.ctx.createGain();
      A.master.gain.value = A.muted ? 0 : 0.5;
      A.master.connect(A.ctx.destination);
    } catch {
      A.ctx = null;
    }
    return A.ctx;
  }

  function noiseBuffer(seconds) {
    const ctx = A.ctx;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  function blip(freq, dur, type, vol, slideTo) {
    if (!ensure() || A.muted) return;
    const ctx = A.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
    gain.gain.setValueAtTime(vol || 0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.connect(gain).connect(A.master);
    osc.start();
    osc.stop(ctx.currentTime + dur + 0.02);
  }

  function burst(dur, vol, cutoff) {
    if (!ensure() || A.muted) return;
    const ctx = A.ctx;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(dur);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff || 3000, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol || 0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    src.connect(filter).connect(gain).connect(A.master);
    src.start();
  }

  return {
    unlock() { ensure(); },
    setMuted(m) {
      A.muted = m;
      if (A.master) A.master.gain.value = m ? 0 : 0.5;
    },
    get muted() { return A.muted; },
    click() { blip(660, 0.06, 'square', 0.12); },
    shot() { burst(0.14, 0.5, 4000); blip(160, 0.1, 'square', 0.25, 60); },
    punch() { blip(120, 0.12, 'sine', 0.4, 55); },
    pickup() { blip(659, 0.09, 'sine', 0.2); setTimeout(() => blip(880, 0.12, 'sine', 0.2), 70); },
    cash() { blip(523, 0.08, 'triangle', 0.2); setTimeout(() => blip(784, 0.1, 'triangle', 0.2), 80); },
    jingle() {
      [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => blip(f, 0.16, 'triangle', 0.22), i * 110));
    },
    busted() { [392, 330, 262].forEach((f, i) => setTimeout(() => blip(f, 0.25, 'sawtooth', 0.18), i * 160)); },
    engineStart() {
      if (!ensure() || A.engineNodes) return;
      const ctx = A.ctx;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 55;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      const gain = ctx.createGain();
      gain.gain.value = 0.0;
      osc.connect(filter).connect(gain).connect(A.master);
      osc.start();
      A.engineNodes = { osc, gain };
    },
    engineSet(speed01, on) {
      if (!A.engineNodes) return;
      const t = A.ctx.currentTime;
      A.engineNodes.osc.frequency.setTargetAtTime(55 + speed01 * 140, t, 0.08);
      A.engineNodes.gain.gain.setTargetAtTime(on && !A.muted ? 0.05 + speed01 * 0.06 : 0.0, t, 0.1);
    },
    siren(on) {
      if (on && !A.sirenNodes) {
        if (!ensure()) return;
        const ctx = A.ctx;
        const osc = ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.value = 720;
        const lfo = ctx.createOscillator();
        lfo.type = 'square';
        lfo.frequency.value = 0.55;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 190;
        lfo.connect(lfoGain).connect(osc.frequency);
        const gain = ctx.createGain();
        gain.gain.value = 0.045;
        osc.connect(gain).connect(A.master);
        osc.start();
        lfo.start();
        A.sirenNodes = { osc, lfo, gain };
      } else if (!on && A.sirenNodes) {
        try { A.sirenNodes.osc.stop(); A.sirenNodes.lfo.stop(); } catch { /* already stopped */ }
        A.sirenNodes = null;
      }
    },
    ambient(on) {
      if (on && !A.ambientNodes) {
        if (!ensure()) return;
        const ctx = A.ctx;
        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer(2);
        src.loop = true;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 240;
        const gain = ctx.createGain();
        gain.gain.value = 0.05;
        src.connect(filter).connect(gain).connect(A.master);
        src.start();
        A.ambientNodes = { src, gain };
      } else if (!on && A.ambientNodes) {
        try { A.ambientNodes.src.stop(); } catch { /* already stopped */ }
        A.ambientNodes = null;
      }
    },
  };
}
