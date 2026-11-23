// Everything synthesized at runtime: wind, whoosh, water, gulls, ship horn, tram, bells & gentle sky chimes.
export class Sound {
  constructor(city) {
    this.city = city;
    this.ctx = null;
    this.muted = false;
    this.t = { gull: 2, horn: 28, bell: 13, chime: 6 };
  }

  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const ctx = this.ctx = new AudioContext();
    this.master = ctx.createGain();
    this.master.gain.value = 0.88;
    this.master.connect(ctx.destination);
    const buf = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < d.length; i++) {
      b = 0.97 * b + 0.03 * (Math.random() * 2 - 1);
      d[i] = (Math.random() * 2 - 1) * 0.5 + b * 3;
    }
    const noise = () => {
      const s = ctx.createBufferSource();
      s.buffer = buf; s.loop = true; s.start(0, Math.random() * 2.5);
      return s;
    };
    const chain = (type, f, q, g) => {
      const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
      const gn = ctx.createGain(); gn.gain.value = g;
      noise().connect(fl).connect(gn).connect(this.master);
      return [fl, gn];
    };
    [this.windF, this.windG] = chain('bandpass', 400, 0.6, 0);
    [this.whF, this.whG] = chain('bandpass', 1100, 1.2, 0);
    [this.seaF, this.seaG] = chain('lowpass', 420, 0.5, 0);
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.88, this.ctx.currentTime, 0.1);
    return this.muted;
  }

  update(dt, s) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime, sp = s.speed / 24;
    this.windF.frequency.setTargetAtTime(220 + sp * 900, now, 0.25);
    this.windG.gain.setTargetAtTime(0.045 + sp * 0.18, now, 0.3);
    this.whF.frequency.setTargetAtTime(700 + s.near * 900 + sp * 500, now, 0.1);
    this.whG.gain.setTargetAtTime(Math.min(0.28, Math.abs(s.bank) * 0.2 * sp + s.near * 0.28), now, 0.08);
    const lap = (0.5 + 0.5 * Math.sin(now * 0.9)) * (0.6 + 0.4 * Math.sin(now * 0.37 + 1));
    this.seaG.gain.setTargetAtTime(s.harbour * (0.05 + 0.08 * lap), now, 0.3);

    this.t.gull -= dt; this.t.horn -= dt; this.t.bell -= dt; this.t.chime -= dt;
    if (this.t.gull < 0) { this.t.gull = 2.2 + Math.random() * 6; if (s.gulls > 0.05) this.gull(s.gulls); }
    if (this.t.horn < 0) {
      if (this.city === 'prague') { this.t.horn = 20 + Math.random() * 25; this.tram(); }
      else { this.t.horn = 42 + Math.random() * 38; this.horn(); }
    }
    if (this.t.bell < 0) {
      this.t.bell = this.city === 'prague' ? 16 + Math.random() * 18 : 30 + Math.random() * 24;
      this.bell(s.bell, this.city === 'prague' ? [330, 262, 392][Math.floor(Math.random() * 3)] : 330);
    }
    if (this.t.chime < 0) {
      this.t.chime = 7 + Math.random() * 11;
      this.skyChime(0.015 + Math.min(0.018, (s.alt || 0) * 0.00015));
    }
  }

  skyChime(vol) {
    // Delicate Joe-Hisaishi-inspired pentatonic wind-chime shimmer
    const ctx = this.ctx;
    const notes = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66];
    const count = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < count; i++) {
      const f = notes[Math.floor(Math.random() * notes.length)];
      const t0 = ctx.currentTime + 0.05 + i * (0.28 + Math.random() * 0.22);
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(vol, t0 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.8);
      const pan = ctx.createStereoPanner();
      pan.pan.value = Math.random() * 1.4 - 0.7;
      o.connect(g).connect(pan).connect(this.master);
      o.start(t0); o.stop(t0 + 2.9);
    }
  }

  gull(level) {
    const ctx = this.ctx, t0 = ctx.currentTime + 0.05;
    const osc = ctx.createOscillator(); osc.type = 'triangle';
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1700; bp.Q.value = 2.5;
    const g = ctx.createGain(); g.gain.value = 0;
    const pan = ctx.createStereoPanner(); pan.pan.value = Math.random() * 1.6 - 0.8;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 26 + Math.random() * 8;
    const lg = ctx.createGain(); lg.gain.value = 80;
    lfo.connect(lg).connect(osc.frequency);
    osc.connect(bp).connect(g).connect(pan).connect(this.master);
    const n = 2 + Math.floor(Math.random() * 3), base = 0.9 + Math.random() * 0.25, vol = 0.08 * Math.min(1, level);
    for (let i = 0; i < n; i++) {
      const st = t0 + i * (0.3 + Math.random() * 0.08);
      osc.frequency.setValueAtTime(1500 * base, st);
      osc.frequency.linearRampToValueAtTime(2300 * base, st + 0.05);
      osc.frequency.exponentialRampToValueAtTime(1050 * base, st + 0.27);
      g.gain.setValueAtTime(0, st);
      g.gain.linearRampToValueAtTime(vol, st + 0.03);
      g.gain.linearRampToValueAtTime(0, st + 0.27);
    }
    const end = t0 + n * 0.4 + 0.1;
    osc.start(t0); lfo.start(t0); osc.stop(end); lfo.stop(end);
  }

  horn() {
    const ctx = this.ctx, t0 = ctx.currentTime + 0.05;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 360;
    const g = ctx.createGain(); g.gain.value = 0;
    lp.connect(g).connect(this.master);
    for (const f of [92, 138.5]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
      o.connect(lp); o.start(t0); o.stop(t0 + 4.2);
    }
    g.gain.linearRampToValueAtTime(0.055, t0 + 0.4);
    g.gain.setValueAtTime(0.055, t0 + 2.6);
    g.gain.linearRampToValueAtTime(0, t0 + 4);
  }

  tram() {
    const ctx = this.ctx;
    for (let k = 0; k < 2; k++) {
      const t0 = ctx.currentTime + 0.05 + k * 0.22;
      for (const [f, a] of [[1580, 1], [3950, 0.35], [2230, 0.25]]) {
        const o = ctx.createOscillator(); o.frequency.value = f;
        const g = ctx.createGain(); g.gain.value = 0;
        o.connect(g).connect(this.master);
        g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.018 * a, t0 + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.9);
        o.start(t0); o.stop(t0 + 1);
      }
    }
  }

  bell(level, base = 330) {
    const ctx = this.ctx;
    const vol = 0.012 + 0.065 * level;
    const partials = [[0.5, 0.6, 5], [1, 1, 3.5], [1.19, 0.5, 2.5], [1.5, 0.35, 2], [2, 0.3, 1.6], [2.51, 0.2, 1.2], [3.01, 0.12, 0.9]];
    for (let k = 0; k < 3; k++) {
      const t0 = ctx.currentTime + 0.05 + k * 1.9;
      for (const [m, a, dec] of partials) {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = base * m;
        const g = ctx.createGain(); g.gain.value = 0;
        o.connect(g).connect(this.master);
        g.gain.setValueAtTime(0, t0);
        g.gain.linearRampToValueAtTime(vol * a, t0 + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dec);
        o.start(t0); o.stop(t0 + dec + 0.05);
      }
    }
  }
}
