export class EngineAudio {
  constructor() {
    this.ctx = null;
    this.started = false;
  }

  start() {
    if (this.started) return;
    this.started = true;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();

    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(ctx.destination);

    // --- Moteur : oscillateurs ---
    this.osc1 = ctx.createOscillator();
    this.osc1.type = 'sawtooth';
    this.osc2 = ctx.createOscillator();
    this.osc2.type = 'square';
    this.osc3 = ctx.createOscillator();
    this.osc3.type = 'sawtooth';

    this.oscGain1 = ctx.createGain(); this.oscGain1.gain.value = 0.30;
    this.oscGain2 = ctx.createGain(); this.oscGain2.gain.value = 0.14;
    this.oscGain3 = ctx.createGain(); this.oscGain3.gain.value = 0.10;

    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 900;
    this.engineFilter.Q.value = 2.2;

    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0.0001;

    this.osc1.connect(this.oscGain1).connect(this.engineFilter);
    this.osc2.connect(this.oscGain2).connect(this.engineFilter);
    this.osc3.connect(this.oscGain3).connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain).connect(this.master);

    this.osc1.start(); this.osc2.start(); this.osc3.start();

    // --- Cricri des pneus : bruit filtré ---
    const noiseLen = ctx.sampleRate * 2;
    const noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < noiseLen; i++) data[i] = Math.random() * 2 - 1;

    this.tireNoise = ctx.createBufferSource();
    this.tireNoise.buffer = noiseBuf;
    this.tireNoise.loop = true;
    this.tireFilter = ctx.createBiquadFilter();
    this.tireFilter.type = 'bandpass';
    this.tireFilter.frequency.value = 950;
    this.tireFilter.Q.value = 1.4;
    this.tireGain = ctx.createGain();
    this.tireGain.gain.value = 0.0001;
    this.tireNoise.connect(this.tireFilter).connect(this.tireGain).connect(this.master);
    this.tireNoise.start();

    // --- Vent ---
    this.windNoise = ctx.createBufferSource();
    this.windNoise.buffer = noiseBuf;
    this.windNoise.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'lowpass';
    this.windFilter.frequency.value = 420;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.0001;
    this.windNoise.connect(this.windFilter).connect(this.windGain).connect(this.master);
    this.windNoise.start();
  }

  update(vehicle) {
    if (!this.started) return;
    const t = this.ctx.currentTime;
    const v = vehicle;

    // Fréquences : fondamental + harmoniques (profils psychoacoustiques d'un 6 cyl.)
    const f0 = 28 + (v.engineRpm / 60) * 1.9;
    this.osc1.frequency.setTargetAtTime(f0 * 1.0, t, 0.02);
    this.osc2.frequency.setTargetAtTime(f0 * 0.5, t, 0.02);
    this.osc3.frequency.setTargetAtTime(f0 * 2.02, t, 0.02);

    this.engineFilter.frequency.setTargetAtTime(500 + v.engineRpm * 0.55 + v.throttle * 900, t, 0.05);

    const load = 0.16 + v.throttle * 0.5 + (v.engineRpm / 8000) * 0.25;
    this.engineGain.gain.setTargetAtTime(load * (v.gearIndex === -2 ? 0.35 : 0.8), t, 0.05);

    const slip = Math.max(
      ...v.wheels.map((w) => (w.grounded ? Math.max(0, w.slipMag - 0.7) : 0)),
    );
    const screech = Math.min(1, slip * 1.6) * (v.speedKmh > 8 ? 1 : 0);
    this.tireGain.gain.setTargetAtTime(0.020 * screech + (v.wheels.some((w) => w.surface !== 'asphalt' && w.grounded) ? 0.05 : 0), t, 0.08);
    this.tireFilter.frequency.setTargetAtTime(720 + screech * 500, t, 0.1);

    this.windGain.gain.setTargetAtTime(Math.min(0.09, (v.vel.length() / 70) ** 2 * 0.09), t, 0.15);
  }
}
