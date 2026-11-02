// Phoenix-themed Ember Cage nat 1 / nat 20 sounds: dying cry, burning crash, soaring screech, wingbeat fanfare.
const g_ = (c, t, pk, a, d, dest) => { const g = c.ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(pk, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); g.connect(dest || c.out); return g; };
// oscillator with pitch glide, optional vibrato and lowpass
const tone = (c, type, f0, f1, t, a, d, pk, o = {}) => {
    const osc = c.ac.createOscillator(); osc.type = type;
    osc.frequency.setValueAtTime(f0, t); osc.frequency.exponentialRampToValueAtTime(f1, t + a + d);
    let dest = c.out;
    const g = g_(c, t, pk, a, d);
    if (o.lp) { const f = c.ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; f.Q.value = o.q || 0.7; f.connect(g); dest = f; } else dest = g;
    osc.connect(dest);
    if (o.vib) {
        const l = c.ac.createOscillator(), lg = c.ac.createGain();
        l.frequency.value = o.vr || 7; lg.gain.setValueAtTime(o.vib * 0.3, t); lg.gain.linearRampToValueAtTime(o.vib, t + a + d);
        l.connect(lg); lg.connect(osc.frequency); l.start(t); l.stop(t + a + d + 0.05);
    }
    osc.start(t); osc.stop(t + a + d + 0.05);
};
// filtered noise burst with filter sweep
const nz = (c, type, f0, f1, q, t, a, d, pk) => {
    const s = c.ac.createBufferSource(); s.buffer = c.noise; s.loop = true;
    const f = c.ac.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + a + d);
    s.connect(f); f.connect(g_(c, t, pk, a, d));
    s.start(t); s.stop(t + a + d + 0.05);
};
const boom = (c, t, pk) => { tone(c, 'sine', 140, 38, t, 0.004, 0.6, pk); nz(c, 'lowpass', 2500, 120, 0.7, t, 0.005, 0.7, pk * 0.9); };
const crackles = (c, t, n, span, pk) => { for (let i = 0; i < n; i++) { const x = t + Math.pow(Math.random(), 0.7) * span; nz(c, 'highpass', 2500 + Math.random() * 4000, 6000, 1, x, 0.001, 0.015 + Math.random() * 0.02, pk * (1 - (x - t) / span * 0.8) * (0.5 + Math.random() * 0.5)); } };
const pings = (c, t, n, span, pk) => { for (let i = 0; i < n; i++) { const x = t + (i / n) * span, f = 6500 - (i / n) * 3500 + Math.random() * 800; tone(c, 'sine', f, f * 0.98, x, 0.002, 0.15, pk * (1 - i / n * 0.7)); } };

export default {
    nat1: [
        { key: 'a08-dying-cry', name: 'Phoenix Dying Cry', blurb: 'A trembling heat-rise, then a falling, wavering screech that collapses into a boom and a puff of ash.',
          play(c) {
              const { t0, hit } = c;
              nz(c, 'bandpass', 400, 1800, 2, t0, hit - t0 - 0.02, 0.02, 0.25);
              tone(c, 'sawtooth', 500, 900, t0, hit - t0 - 0.02, 0.02, 0.18, { lp: 1800, vib: 30, vr: 14 });
              boom(c, hit, 0.65);
              tone(c, 'sawtooth', 1500, 280, hit, 0.02, 1.3, 0.38, { lp: 2800, q: 2, vib: 90, vr: 6.5 });
              tone(c, 'sine', 750, 140, hit, 0.02, 1.3, 0.2, { vib: 40, vr: 6.5 });
              nz(c, 'bandpass', 3000, 400, 1.5, hit, 0.01, 1.0, 0.3);
              nz(c, 'highpass', 1500, 800, 0.5, hit + 1.2, 0.15, 0.8, 0.12);
              crackles(c, hit + 0.2, 22, 2.0, 0.28);
          } },
        { key: 'a08-burning-crash', name: 'Burning Bird Crash', blurb: 'Wingbeats falter and slow, then the burning bird slams the iron cage in a clang of fire and settling embers.',
          play(c) {
              const { t0, hit } = c;
              [0, 0.1, 0.22, 0.36, 0.45].forEach((d, i) => { const t = t0 + d; nz(c, 'lowpass', 900 - i * 120, 150, 1, t, 0.01, 0.09, 0.45 - i * 0.05); tone(c, 'sine', 110 - i * 12, 50, t, 0.005, 0.1, 0.4); });
              tone(c, 'triangle', 700, 150, t0, hit - t0, 0.01, 0.15, { lp: 1500 });
              boom(c, hit, 0.6);
              [310, 487, 733, 1180, 1750].forEach((f, i) => tone(c, 'sine', f, f * 0.995, hit, 0.002, 0.9 - i * 0.12, 0.2 / (1 + i * 0.4)));
              nz(c, 'bandpass', 1800, 300, 0.8, hit, 0.01, 1.1, 0.3);
              nz(c, 'lowpass', 600, 80, 0.7, hit + 0.1, 0.1, 1.5, 0.25);
              crackles(c, hit + 0.1, 28, 2.4, 0.3);
          } },
    ],
    nat20: [
        { key: 'a08-soaring-screech', name: 'Soaring Phoenix Screech', blurb: 'A swelling wing-whoosh erupts into a bright rising screech with vibrato and a cascade of golden sparks.',
          play(c) {
              const { t0, hit } = c;
              nz(c, 'bandpass', 250, 3000, 1.2, t0, hit - t0 - 0.02, 0.02, 0.45);
              tone(c, 'sine', 200, 600, t0, hit - t0 - 0.02, 0.02, 0.2);
              nz(c, 'lowpass', 4000, 300, 0.7, hit, 0.01, 1.3, 0.55);
              tone(c, 'sine', 90, 45, hit, 0.004, 0.5, 0.7);
              tone(c, 'sawtooth', 900, 2400, hit, 0.05, 1.0, 0.36, { lp: 4200, q: 3, vib: 60, vr: 8 });
              tone(c, 'sawtooth', 903, 1805, hit, 0.05, 1.0, 0.18, { lp: 3500, vib: 40, vr: 8.5 });
              nz(c, 'bandpass', 3500, 6000, 3, hit, 0.05, 1.0, 0.18);
              pings(c, hit + 0.1, 30, 1.8, 0.12);
          } },
        { key: 'a08-wingbeat-fanfare', name: 'Wingbeat Fanfare', blurb: 'Wing whoomps accelerate toward the flare, then a bright fire chord, a short triumphant cry and a shimmering spark rain.',
          play(c) {
              const { t0, hit } = c;
              let d = 0.2, t = 0;
              while (t < hit - t0 - 0.05) { const x = t0 + t, k = t / (hit - t0); nz(c, 'lowpass', 500 + k * 1200, 100, 1, x, 0.02, 0.15, 0.3 + k * 0.3); tone(c, 'sine', 100, 48, x, 0.01, 0.15, 0.3 + k * 0.3); t += d; d = Math.max(0.06, d * 0.82); }
              boom(c, hit, 0.6);
              [262, 330, 392, 523, 784].forEach((f, i) => tone(c, 'sawtooth', f, f, hit, 0.01, 1.4 - i * 0.1, 0.13, { lp: 2400, vib: 3, vr: 5.5 }));
              tone(c, 'sawtooth', 1200, 2000, hit + 0.1, 0.05, 0.6, 0.25, { lp: 4000, q: 2, vib: 50, vr: 8 });
              nz(c, 'highpass', 1000, 2500, 0.6, hit, 0.01, 1.2, 0.3);
              pings(c, hit + 0.05, 36, 2.2, 0.13);
          } },
    ],
};
