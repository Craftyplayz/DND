// Ember Cage nat 1 / nat 20 sounds, comedy fail vs heroic win: sad trombone, soot cough, level-up arpeggio, victory fanfare.
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

// Oscillator with attack/decay envelope, optional lowpass, pitch glide and vibrato.
function tone(c, type, f0, t, dur, g, o = {}) {
    const ac = c.ac, osc = ac.createOscillator(), env = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(o.f1, t + dur);
    if (o.vib) { // wobble pitch: [rate Hz, depth Hz]
        const l = ac.createOscillator(), lg = ac.createGain();
        l.frequency.value = o.vib[0]; lg.gain.value = o.vib[1];
        l.connect(lg); lg.connect(osc.frequency); l.start(t); l.stop(t + dur + 0.1);
    }
    const a = o.a || 0.01;
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(g, t + a);
    env.gain.setValueAtTime(g * (o.sus == null ? 1 : o.sus), t + Math.max(a, dur * 0.6));
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let n = osc;
    if (o.lp) {
        const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = o.q || 1;
        f.frequency.setValueAtTime(o.lp, t);
        if (o.lp1) f.frequency.exponentialRampToValueAtTime(o.lp1, t + dur);
        osc.connect(f); n = f;
    }
    n.connect(env); env.connect(o.dest || c.out);
    osc.start(t); osc.stop(t + dur + 0.05);
}

// Filtered noise burst; fa->fb sweeps the filter over the duration.
function puff(c, type, fa, fb, t, dur, g, o = {}) {
    const ac = c.ac, s = ac.createBufferSource(), f = ac.createBiquadFilter(), env = ac.createGain();
    s.buffer = c.noise; s.loop = true;
    f.type = type; f.Q.value = o.q || 1;
    f.frequency.setValueAtTime(fa, t);
    f.frequency.exponentialRampToValueAtTime(fb, t + dur);
    const a = o.a || 0.005;
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(g, t + a);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(env); env.connect(c.out);
    s.start(t, Math.random() * 0.2); s.stop(t + dur + 0.05);
}

export default {
    nat1: [
        {
            key: 'a05-sad-trombone', name: 'Sad Trombone Fizzle',
            blurb: 'A fuse hisses, the fire goes out with a pathetic pop, and a wah-wah-wah-waaah trombone slides downhill.',
            play(c) {
                const { t0, hit } = c;
                puff(c, 'highpass', 1500, 6000, t0, hit - t0, 0.35, { a: 0.3 }); // fuse hiss
                for (let i = 0; i < 6; i++) puff(c, 'bandpass', 3000 + i * 500, 5000, t0 + 0.05 + i * 0.07, 0.03, 0.2, { q: 4 }); // crackles
                tone(c, 'sine', 300, hit, 0.12, 0.7, { f1: 60 }); // pop
                puff(c, 'bandpass', 1200, 300, hit, 0.2, 0.7);
                const notes = [58, 57, 56, 55], starts = [0.35, 0.8, 1.25, 1.7], durs = [0.4, 0.4, 0.4, 1.3];
                notes.forEach((m, i) => {
                    const t = hit + starts[i], f = mtof(m), last = i === 3;
                    const o = { a: 0.06, lp: 500, lp1: 1800, q: 2, vib: last ? [5, 4] : [0.1, 0], sus: 0.8 };
                    if (last) o.f1 = f * 0.8; // final note sags flat
                    tone(c, 'sawtooth', f, t, durs[i], 0.3, o);
                    tone(c, 'square', f * 0.5, t, durs[i], 0.12, { a: 0.06, lp: 600, vib: o.vib });
                });
            },
        },
        {
            key: 'a05-soot-cough', name: 'Soot Cough',
            blurb: 'A cartoon fuse sputters, a tiny pfft of an explosion, a falling slide whistle and a soot-covered cough.',
            play(c) {
                const { t0, hit } = c;
                [0, 0.08, 0.15, 0.25, 0.32, 0.4, 0.44].forEach(d => puff(c, 'bandpass', 4000, 2500, t0 + d, 0.06, 0.3, { q: 3 }));
                tone(c, 'sine', 900, t0, hit - t0, 0.12, { f1: 1800 }); // fuse whine climbs
                puff(c, 'highpass', 2000, 5000, t0, hit - t0, 0.25, { a: 0.2 });
                puff(c, 'lowpass', 3000, 400, hit, 0.35, 0.9); // pfft
                tone(c, 'triangle', 220, hit, 0.15, 0.6, { f1: 50 });
                tone(c, 'sine', 1800, hit + 0.2, 1.0, 0.4, { f1: 150, a: 0.03, vib: [9, 30] }); // slide whistle fall
                [1.5, 1.95].forEach((d, i) => { // coughs: noise with formant sweep + voiced grunt
                    const t = hit + d;
                    puff(c, 'bandpass', 900, 500, t, 0.22, 0.9, { q: 2.5, a: 0.02 });
                    tone(c, 'sawtooth', 150 - i * 15, t, 0.2, 0.3, { f1: 90, lp: 700, a: 0.02 });
                });
                puff(c, 'highpass', 3000, 6000, hit + 2.2, 0.5, 0.1); // last ember sizzle
                tone(c, 'sine', 400, hit + 2.5, 0.25, 0.3, { f1: 100 }); // final plink down
            },
        },
    ],
    nat20: [
        {
            key: 'a05-level-up', name: 'Level Up Blaze',
            blurb: 'A rising arpeggio races up through the build and bursts into a bright fiery chord with sparkle.',
            play(c) {
                const { t0, hit } = c;
                const arp = [60, 64, 67, 72, 76, 79, 84, 88], step = (hit - t0) / arp.length;
                arp.forEach((m, i) => tone(c, 'square', mtof(m), t0 + i * step, step * 1.4, 0.16 + i * 0.015, { lp: 3500, a: 0.004 }));
                puff(c, 'bandpass', 300, 3000, t0, hit - t0, 0.3, { a: 0.5, q: 1 });
                puff(c, 'bandpass', 3000, 400, hit, 1.6, 0.35, { a: 0.02 }); // fire whoosh
                [72, 76, 79, 84, 91].forEach(m => {
                    tone(c, 'sawtooth', mtof(m), hit, 1.8, 0.08, { lp: 3000, lp1: 800, a: 0.01 });
                    tone(c, 'triangle', mtof(m - 12), hit, 1.8, 0.08, { a: 0.01 });
                });
                tone(c, 'sine', 90, hit, 0.6, 0.5, { f1: 40 }); // thump
                for (let i = 0; i < 14; i++) tone(c, 'sine', mtof(96 + [0, 4, 7, 12][i % 4]), hit + 0.1 + i * 0.09, 0.3, 0.1, { a: 0.003 });
            },
        },
        {
            key: 'a05-phoenix-fanfare', name: 'Phoenix Fanfare',
            blurb: 'A rolling drum and fire whoosh build to a bright brass victory sting that ends on a held golden chord.',
            play(c) {
                const { t0, hit } = c;
                for (let i = 0; i < 10; i++) tone(c, 'sine', 110, t0 + i * 0.09, 0.12, 0.2 + i * 0.05, { f1: 60 }); // drum roll
                puff(c, 'bandpass', 200, 2500, t0, hit - t0, 0.3, { a: 0.6 });
                const brass = (m, t, d, g) => {
                    const o = { a: 0.04, lp: 700, lp1: 2800, q: 1.5, sus: 0.8 };
                    tone(c, 'sawtooth', mtof(m), t, d, g, o);
                    tone(c, 'sawtooth', mtof(m) * 1.005, t, d, g * 0.7, o);
                };
                [0.0, 0.15, 0.3].forEach(d => brass(67, t0 + 0.2 + d, 0.14, 0.14));
                brass(72, hit - 0.01, 0.4, 0.15);
                brass(76, hit + 0.45, 0.25, 0.18);
                brass(79, hit + 0.7, 0.25, 0.18);
                [72, 76, 79, 84].forEach(m => brass(m, hit + 0.8, 1.7, 0.11));
                tone(c, 'sine', 70, hit, 0.8, 0.6, { f1: 35 });
                puff(c, 'lowpass', 5000, 300, hit, 1.5, 0.45);
                puff(c, 'highpass', 4000, 9000, hit + 0.9, 1.5, 0.12);
                for (let i = 0; i < 10; i++) tone(c, 'sine', mtof(91 + (i * 5) % 12), hit + 1.0 + i * 0.1, 0.25, 0.08, { a: 0.003 });
            },
        },
    ],
};
