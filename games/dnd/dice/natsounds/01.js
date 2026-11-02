// Ember Cage d20 nat 1 / nat 20 sounds: cinematic explosions and heroic fanfares.
const R = (a, b) => a + Math.random() * (b - a);
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

// oscillator with gain envelope (attack a, decay to t+d), optional lowpass sweep and pitch glide to f2
function osc(c, type, f, t, d, g, o = {}) {
    const { ac, out } = c, x = ac.createOscillator(), v = ac.createGain();
    let n = x; x.type = type; x.frequency.setValueAtTime(f, t);
    if (o.f2) x.frequency.exponentialRampToValueAtTime(o.f2, t + (o.gd || d));
    if (o.det) x.detune.value = o.det;
    if (o.lp) {
        const l = ac.createBiquadFilter(); l.type = 'lowpass'; l.frequency.setValueAtTime(o.lp, t);
        if (o.lp2) l.frequency.exponentialRampToValueAtTime(o.lp2, t + (o.ld || d));
        x.connect(l); n = l;
    }
    v.gain.setValueAtTime(0.0001, t); v.gain.linearRampToValueAtTime(g, t + (o.a || 0.005));
    v.gain.exponentialRampToValueAtTime(0.0001, t + d);
    n.connect(v); v.connect(out); x.start(t); x.stop(t + d + 0.05);
}
// filtered noise with envelope; filter sweeps f -> f2
function nz(c, t, d, g, type, f, f2, o = {}) {
    const { ac, out, noise } = c, s = ac.createBufferSource(), l = ac.createBiquadFilter(), v = ac.createGain();
    s.buffer = noise; s.loop = true;
    l.type = type; l.Q.value = o.q || 0.7; l.frequency.setValueAtTime(f, t);
    if (f2) l.frequency.exponentialRampToValueAtTime(f2, t + d);
    v.gain.setValueAtTime(0.0001, t); v.gain.linearRampToValueAtTime(g, t + (o.a || 0.003));
    v.gain.exponentialRampToValueAtTime(0.0001, t + d);
    s.connect(l); l.connect(v); v.connect(out); s.start(t, R(0, 0.3)); s.stop(t + d + 0.05);
}
// scattered crackle/debris ticks between ta and tb, thinning out over time
function ticks(c, ta, tb, n, g, lo, hi) {
    for (let i = 0; i < n; i++) {
        const k = Math.pow(Math.random(), 1.6), t = ta + k * (tb - ta);
        nz(c, t, R(0.015, 0.05), g * (1 - k * 0.6) * R(0.5, 1), 'bandpass', R(lo, hi), 0, { q: 3 });
    }
}

export default {
    nat1: [
        {
            key: 'a01-detonation', name: 'Core Detonation',
            blurb: 'Heat whine and rumble build, then a sub-dropping boom, a roaring blast and a long rain of debris.',
            play(c) {
                const { t0, hit: h } = c, bd = h - t0;
                osc(c, 'sine', 180, t0, bd + 0.02, 0.18, { f2: 700, a: bd * 0.9 });
                nz(c, t0, bd + 0.02, 0.45, 'lowpass', 120, 700, { a: bd * 0.95 });
                ticks(c, t0 + 0.05, h, 14, 0.12, 2000, 6000);
                osc(c, 'sine', 110, h, 1.6, 0.45, { f2: 26, gd: 0.9, a: 0.004 });
                osc(c, 'triangle', 220, h, 0.4, 0.3, { f2: 45, gd: 0.3 });
                nz(c, h, 1.3, 0.45, 'lowpass', 5000, 150, { a: 0.002 });
                nz(c, h, 0.12, 0.45, 'highpass', 1500, 0);
                nz(c, h + 0.05, 2.2, 0.35, 'lowpass', 400, 80, { a: 0.1 });
                ticks(c, h + 0.25, h + 2.2, 36, 0.4, 600, 3500);
            }
        },
        {
            key: 'a01-doom-stab', name: 'Doom Collapse',
            blurb: 'A dark swelling drone snaps into a dissonant falling brass stab with an iron clang and a crashing fireball.',
            play(c) {
                const { t0, hit: h } = c, bd = h - t0;
                [55, 55 * 1.4142, 82.4].forEach((f, i) =>
                    osc(c, 'sawtooth', f, t0, bd + 0.03, 0.2, { lp: 150, lp2: 900, ld: bd, a: bd * 0.9, det: i * 9 - 9 }));
                osc(c, 'sine', 300, t0, bd + 0.02, 0.1, { f2: 900, a: bd * 0.9 });
                [110, 155.6, 164.8, 233].forEach((f, i) =>
                    osc(c, 'sawtooth', f, h, 1.4, 0.22, { f2: f * 0.5, gd: 1.2, lp: 2500, lp2: 200, ld: 1.2, a: 0.01, det: (i - 1.5) * 8 }));
                [1, 2.76, 5.4, 8.9].forEach((m, i) =>
                    osc(c, 'sine', 210 * m, h, 1.8 - i * 0.3, 0.3 / (i + 1), { a: 0.002 }));
                osc(c, 'sine', 80, h, 1.8, 0.4, { f2: 30, gd: 1.0 });
                nz(c, h, 1.6, 0.45, 'lowpass', 3500, 120, { a: 0.003 });
                nz(c, h, 0.08, 0.4, 'highpass', 2000, 0);
                ticks(c, h + 0.1, h + 2.4, 28, 0.35, 500, 3000);
            }
        }
    ],
    nat20: [
        {
            key: 'a01-brass-fanfare', name: 'Phoenix Brass Fanfare',
            blurb: 'A detuned brass chord stack swells upward, lands on a huge major chord, and blazes into a fiery roar with crackle.',
            play(c) {
                const { t0, hit: h } = c, bd = h - t0;
                [48, 55, 60, 64, 67, 72, 76].forEach(m => [-9, 9].forEach(det => {
                    osc(c, 'sawtooth', mtof(m - 7), t0, bd, 0.05, { lp: 300, lp2: 1800, ld: bd, a: bd * 0.8, det });
                    osc(c, 'sawtooth', mtof(m), h, 1.9, 0.07, { lp: 3500, lp2: 700, ld: 1.9, a: 0.03, det });
                }));
                osc(c, 'sine', mtof(36), h, 2.2, 0.55, { a: 0.02 });
                osc(c, 'triangle', mtof(84), h, 1.2, 0.2, { a: 0.01 });
                nz(c, t0, bd, 0.2, 'bandpass', 400, 1500, { a: bd * 0.9 });
                nz(c, h, 1.8, 0.45, 'bandpass', 1500, 500, { a: 0.05, q: 0.5 });
                nz(c, h, 0.1, 0.4, 'highpass', 3000, 0);
                ticks(c, h + 0.1, h + 2.4, 40, 0.3, 2500, 8000);
            }
        },
        {
            key: 'a01-horn-call', name: 'Rising Horn Call',
            blurb: 'A three-note horn call climbs through the build-up, lands on a big chord, and golden sparkles spiral over a crackling blaze.',
            play(c) {
                const { t0, hit: h } = c, bd = h - t0, step = bd / 3;
                [60, 64, 67].forEach((m, i) => [-7, 7].forEach(det =>
                    osc(c, 'sawtooth', mtof(m), t0 + i * step, step + 0.08, 0.14, { lp: 500 + i * 400, lp2: 1200 + i * 600, ld: step, a: 0.12, det })));
                osc(c, 'sine', mtof(48), t0, bd, 0.2, { a: bd * 0.5 });
                nz(c, t0, bd, 0.12, 'bandpass', 800, 3000, { a: bd * 0.9 });
                [48, 60, 64, 67, 72, 79].forEach(m => [-6, 6].forEach(det =>
                    osc(c, 'square', mtof(m), h, 2.0, 0.045, { lp: 2800, lp2: 600, ld: 2, a: 0.04, det })));
                osc(c, 'sine', mtof(36), h, 2.0, 0.65, { a: 0.01 });
                [84, 88, 91, 96, 100, 103].forEach((m, i) =>
                    osc(c, 'triangle', mtof(m), h + 0.05 + i * 0.08, 0.9, 0.16, { a: 0.004 }));
                nz(c, h, 1.6, 0.5, 'bandpass', 1200, 400, { a: 0.04, q: 0.5 });
                ticks(c, h + 0.05, h + 2.4, 45, 0.3, 3000, 9000);
            }
        }
    ],
};
