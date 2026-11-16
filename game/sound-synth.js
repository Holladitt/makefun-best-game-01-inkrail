// INKRAIL — sound-synth.js
// All sound is synthesised live with WebAudio — no audio files, no network.
// Whistle, pencil scratch, station bell, crash thud and UI clicks.

export function createSoundSynth() {
  const synth = {
    ctx: null, master: null, scratchNode: null,
    ensure, playWhistle, playDing, playCrash, playClick, playDrawTick, startScratch, stopScratch,
    playVictory, playGameOver,
  };
  return synth;

  function ensure() {
    if (!synth.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      synth.ctx = new AC();
      synth.master = synth.ctx.createGain();
      synth.master.gain.value = 0.25;
      synth.master.connect(synth.ctx.destination);
    }
    if (synth.ctx.state === 'suspended') synth.ctx.resume();
    return true;
  }

  function tone(freq, dur, type, vol, when) {
    if (!ensure()) return;
    const t0 = synth.ctx.currentTime + (when || 0);
    const osc = synth.ctx.createOscillator();
    const gain = synth.ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol || 0.5, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain);
    gain.connect(synth.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function playWhistle() {
    tone(880, 0.28, 'sine', 0.5, 0);
    tone(1174, 0.34, 'sine', 0.45, 0.18);
  }

  function playDing() {
    tone(1318, 0.5, 'triangle', 0.5, 0);
    tone(1760, 0.6, 'triangle', 0.35, 0.08);
  }

  function playCrash() {
    if (!ensure()) return;
    const t0 = synth.ctx.currentTime;
    const len = synth.ctx.sampleRate * 0.35;
    const buffer = synth.ctx.createBuffer(1, len, synth.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = synth.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = synth.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    const gain = synth.ctx.createGain();
    gain.gain.value = 0.8;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(synth.master);
    src.start(t0);
    tone(110, 0.4, 'sawtooth', 0.3, 0);
  }

  function playClick() {
    tone(660, 0.08, 'square', 0.25, 0);
  }

  function playVictory() {
    tone(523, 0.22, 'triangle', 0.5, 0);
    tone(659, 0.22, 'triangle', 0.5, 0.14);
    tone(784, 0.22, 'triangle', 0.5, 0.28);
    tone(1046, 0.5, 'triangle', 0.5, 0.42);
  }

  function playGameOver() {
    tone(392, 0.3, 'sawtooth', 0.3, 0);
    tone(311, 0.3, 'sawtooth', 0.3, 0.25);
    tone(233, 0.6, 'sawtooth', 0.3, 0.5);
  }

  function playDrawTick() {
    tone(2200 + Math.random() * 800, 0.03, 'sine', 0.08, 0);
  }

  function startScratch() {
    if (!ensure() || synth.scratchNode) return;
    const len = synth.ctx.sampleRate * 0.5;
    const buffer = synth.ctx.createBuffer(1, len, synth.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    const src = synth.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const filter = synth.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 2800;
    filter.Q.value = 1.2;
    const gain = synth.ctx.createGain();
    gain.gain.value = 0.05;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(synth.master);
    src.start();
    synth.scratchNode = src;
  }

  function stopScratch() {
    if (synth.scratchNode) {
      try { synth.scratchNode.stop(); } catch (e) { /* already stopped */ }
      synth.scratchNode = null;
    }
  }
}
