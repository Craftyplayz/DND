// Fun / game-like coin sound profiles: arcade coin-op blips and a cartoon boing coin.
const osc = (c, type, f0, f1, t, dur) => {
    const o = c.ac.createOscillator();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    o.start(t); o.stop(t + dur + 0.05);
    return o;
};
// one enveloped note: osc -> lowpass -> gain -> out
const note = (c, type, f0, f1, t, dur, peak, lp = 4000, atk = 0.004) => {
    const o = osc(c, type, f0, f1, t, dur), f = c.ac.createBiquadFilter(), g = c.ac.createGain();
    f.type = 'lowpass'; f.frequency.value = lp;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f); f.connect(g); g.connect(c.out);
    return o;
};

export default [
    {
        key: 'c04-arcade', name: 'Arcade Coin',
        blurb: 'Coin-op blips: a two-note collect chirp with sparkle, stepping-down square bounces and a ka-ching finish.',
        throw(c) {
            const t = c.t;
            note(c, 'square', 988, 988, t, 0.09, 0.3, 3500);
            note(c, 'square', 1319, 1319, t + 0.09, 0.4, 0.3, 3500);
            [2637, 3136, 3951].forEach((f, i) => note(c, 'sine', f, f, t + 0.2 + i * 0.07, 0.18, 0.12, 6000));
        },
        hit(c) {
            const v = Math.max(0.15, c.vol), t = c.t;
            const f = 450 + 900 * v; // smaller bounce = lower step
            note(c, 'square', f, f * 0.8, t, 0.05 + 0.09 * v, 0.1 + 0.4 * v, 2800);
            note(c, 'triangle', f * 2, f * 1.6, t, 0.04 + 0.05 * v, 0.1 * v + 0.03, 4000);
        },
        settle(c) {
            const t = c.t;
            [1047, 1319, 1568].forEach((f, i) => note(c, 'square', f, f, t + i * 0.09, 0.12, 0.28, 3500));
            const d = t + 0.27;
            note(c, 'sine', 2093, 2093, d, 1.3, 0.35, 8000, 0.002);
            note(c, 'sine', 2093 * 2.76, 2093 * 2.76, d, 0.5, 0.12, 9000, 0.002);
            note(c, 'sine', 2093 * 5.4, 2093 * 5.4, d, 0.2, 0.05, 9000, 0.002);
        },
    },
    {
        key: 'c04-cartoon', name: 'Cartoon Boing Coin',
        blurb: 'A slide-whistle flip, springy boing bounces and a wobble-wobble settle ending in a plink.',
        throw(c) {
            const t = c.t, dur = 0.55;
            const o = note(c, 'sine', 350, 2000, t, dur, 0.4, 6000, 0.03);
            const l = osc(c, 'sine', 14, 14, t, dur), lg = c.ac.createGain();
            lg.gain.value = 40; l.connect(lg); lg.connect(o.frequency); // whistle vibrato
            note(c, 'sine', 700, 4000, t, dur, 0.1, 8000, 0.03);
        },
        hit(c) {
            const v = Math.max(0.15, c.vol), t = c.t;
            const base = 260 + 420 * (1 - v), dur = 0.1 + 0.25 * v;
            const o = note(c, 'sine', base * 1.6, base * 0.8, t, dur, 0.15 + 0.5 * v, 3000);
            const l = osc(c, 'sine', 28, 28, t, dur), lg = c.ac.createGain();
            lg.gain.value = base * 0.25; l.connect(lg); lg.connect(o.frequency); // springy wobble
        },
        settle(c) {
            const t = c.t, dur = 1.0;
            const o = osc(c, 'sine', 600, 600, t, dur), g = c.ac.createGain();
            g.gain.setValueAtTime(0.4, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            // wobble LFO that speeds up: phase-accumulated stepwise via a frequency-ramped LFO
            const l = osc(c, 'sine', 3, 22, t, dur), lg = c.ac.createGain();
            lg.gain.setValueAtTime(110, t); lg.gain.linearRampToValueAtTime(40, t + dur);
            l.connect(lg); lg.connect(o.frequency);
            o.connect(g); g.connect(c.out);
            note(c, 'sine', 1800, 1800, t + 1.05, 0.35, 0.4, 8000, 0.002);
            note(c, 'sine', 3600, 3600, t + 1.05, 0.15, 0.1, 9000, 0.002);
        },
    },
];
