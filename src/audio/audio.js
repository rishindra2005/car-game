// Fully synthesized WebAudio: engine (rpm-driven oscillators + noise), tire squeal,
// nitro whoosh, collision thump, simple synth music loop. Call init() from a user gesture.

export class AudioSystem {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.volume = 0.7;
    this.musicVolume = 0.35;
    this._musicStep = 0;
    this._nextNote = 0;
  }

  init() {
    if (this.ready) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = this.volume; this.master.connect(ctx.destination);
    this.comp = ctx.createDynamicsCompressor(); this.comp.connect(this.master);

    // white noise buffer
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;

    // engine: two saws + square sub through lowpass
    this.engGain = ctx.createGain(); this.engGain.gain.value = 0;
    this.engFilter = ctx.createBiquadFilter(); this.engFilter.type = 'lowpass'; this.engFilter.frequency.value = 800; this.engFilter.Q.value = 4;
    this.engFilter.connect(this.engGain); this.engGain.connect(this.comp);
    this.osc1 = ctx.createOscillator(); this.osc1.type = 'sawtooth';
    this.osc2 = ctx.createOscillator(); this.osc2.type = 'sawtooth'; this.osc2.detune.value = 12;
    this.osc3 = ctx.createOscillator(); this.osc3.type = 'square';
    const g3 = ctx.createGain(); g3.gain.value = 0.4;
    this.osc1.connect(this.engFilter); this.osc2.connect(this.engFilter); this.osc3.connect(g3); g3.connect(this.engFilter);
    // engine rumble noise
    this.rumble = this._noiseSource(); const rf = ctx.createBiquadFilter(); rf.type = 'bandpass'; rf.frequency.value = 200; rf.Q.value = 1;
    this.rumbleGain = ctx.createGain(); this.rumbleGain.gain.value = 0;
    this.rumble.connect(rf); rf.connect(this.rumbleGain); this.rumbleGain.connect(this.comp);
    this.rumbleFilter = rf;

    // tire squeal: bandpassed noise + high sine
    this.squeal = this._noiseSource(); const sf = ctx.createBiquadFilter(); sf.type = 'bandpass'; sf.frequency.value = 2200; sf.Q.value = 8;
    this.squealGain = ctx.createGain(); this.squealGain.gain.value = 0;
    this.squeal.connect(sf); sf.connect(this.squealGain); this.squealGain.connect(this.comp);

    // nitro whoosh: highpassed noise
    this.whoosh = this._noiseSource(); const wf = ctx.createBiquadFilter(); wf.type = 'highpass'; wf.frequency.value = 1500;
    this.whooshGain = ctx.createGain(); this.whooshGain.gain.value = 0;
    this.whoosh.connect(wf); wf.connect(this.whooshGain); this.whooshGain.connect(this.comp);
    this.whooshFilter = wf;

    // wind
    this.wind = this._noiseSource(); const wl = ctx.createBiquadFilter(); wl.type = 'lowpass'; wl.frequency.value = 600;
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0;
    this.wind.connect(wl); wl.connect(this.windGain); this.windGain.connect(this.comp);

    for (const s of [this.osc1, this.osc2, this.osc3, this.rumble, this.squeal, this.whoosh, this.wind]) s.start();

    // music bus
    this.musicGain = ctx.createGain(); this.musicGain.gain.value = this.musicVolume; this.musicGain.connect(this.master);
    this._nextNote = ctx.currentTime + 0.1;
    this.ready = true;
  }

  _noiseSource() {
    const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true; return s;
  }

  /** {rpm (0..9000 or 0..1), throttle 0..1, speed m/s, drifting bool, nitro bool} */
  update({ rpm = 1000, throttle = 0, speed = 0, drifting = false, nitro = false } = {}) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const r = rpm <= 1.5 ? rpm : rpm / 8000; // normalized
    const base = 30 + Math.max(0, Math.min(1.2, r)) * 170;
    const tc = 0.05;
    this.osc1.frequency.setTargetAtTime(base, t, tc);
    this.osc2.frequency.setTargetAtTime(base * 2, t, tc);
    this.osc3.frequency.setTargetAtTime(base * 0.5, t, tc);
    this.engFilter.frequency.setTargetAtTime(400 + throttle * 2200 + r * 1500, t, tc);
    this.engGain.gain.setTargetAtTime(0.12 + throttle * 0.16, t, tc);
    this.rumbleGain.gain.setTargetAtTime(0.05 + throttle * 0.08, t, tc);
    this.rumbleFilter.frequency.setTargetAtTime(120 + r * 300, t, tc);
    const sp = Math.abs(speed);
    this.squealGain.gain.setTargetAtTime(drifting && sp > 5 ? Math.min(0.25, 0.08 + sp * 0.003) : 0, t, 0.08);
    this.whooshGain.gain.setTargetAtTime(nitro ? 0.22 : 0, t, nitro ? 0.05 : 0.3);
    this.whooshFilter.frequency.setTargetAtTime(nitro ? 3000 : 1500, t, 0.2);
    this.windGain.gain.setTargetAtTime(Math.min(0.2, sp * 0.0025), t, 0.2);
    this._scheduleMusic();
  }

  playCollision(strength = 0.5) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const s = Math.max(0.05, Math.min(1, strength));
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.25);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.6 * s, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g); g.connect(this.comp); o.start(t); o.stop(t + 0.32);
    const n = this._noiseSource(); const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1200;
    const ng = ctx.createGain(); ng.gain.setValueAtTime(0.4 * s, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    n.connect(f); f.connect(ng); ng.connect(this.comp); n.start(t); n.stop(t + 0.22);
  }

  /** UI blip */
  playBlip(freq = 880, dur = 0.08) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = freq;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.15, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }

  // Simple synthwave-ish loop: bass + arp, 110 BPM, minor progression.
  _scheduleMusic() {
    const ctx = this.ctx;
    const stepDur = 60 / 110 / 4;
    const prog = [57, 53, 48, 55]; // A F C G (midi roots)
    while (this._nextNote < ctx.currentTime + 0.2) {
      const step = this._musicStep % 64;
      const root = prog[Math.floor(step / 16)];
      const t = this._nextNote;
      if (step % 4 === 0) this._note(root - 24, t, stepDur * 3, 'sawtooth', 0.12, 400);
      const arp = [0, 3, 7, 12, 7, 3, 0, 10][step % 8];
      if (step % 2 === 0) this._note(root + arp, t, stepDur * 1.5, 'square', 0.035, 2000);
      if (step % 8 === 4) this._hat(t, 0.05);
      this._nextNote += stepDur;
      this._musicStep++;
    }
  }
  _note(midi, t, dur, type, vol, cutoff) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    o.connect(f); f.connect(g); g.connect(this.musicGain); o.start(t); o.stop(t + dur + 0.02);
  }
  _hat(t, vol) {
    const ctx = this.ctx;
    const n = this._noiseSource(); const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.05);
    n.connect(f); f.connect(g); g.connect(this.musicGain); n.start(t); n.stop(t + 0.06);
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master) this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05);
  }
  setMusicVolume(v) {
    this.musicVolume = Math.max(0, Math.min(1, v));
    if (this.musicGain) this.musicGain.gain.setTargetAtTime(this.musicVolume, this.ctx.currentTime, 0.05);
  }
  suspend() { if (this.ctx) this.ctx.suspend(); }
  resume() { if (this.ctx) this.ctx.resume(); }
}
