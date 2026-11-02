// Ember Cage d20 nat 1 / nat 20 sounds, dragon theme: choked splutters, backfire roars, wingbeats and fire-breath gouts.
const G = (c, t, a, peak, dur, to = c.out) => { // gain with attack then exponential decay, connected to `to`
    const g = c.ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(to);
    return g;
};
// filtered noise burst; f0 -> f1 sweeps the filter
const N = (c, t, dur, type, f0, f1, q, peak, a = 0.005, to = c.out) => {
    const s = c.ac.createBufferSource(); s.buffer = c.noise; s.loop = true;
    const f = c.ac.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    s.connect(f); f.connect(G(c, t, a, peak, dur, to));
    s.start(t); s.stop(t + dur + 0.05);
};
// oscillator with pitch glide through a lowpass; optional vibrato (hz, depth in cents)
const O = (c, t, dur, type, f0, f1, peak, cut = 1200, a = 0.01, vib = 0, to = c.out) => {
    const o = c.ac.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const lp = c.ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cut;
    o.connect(lp); lp.connect(G(c, t, a, peak, dur, to));
    if (vib) {
        const l = c.ac.createOscillator(), lg = c.ac.createGain();
        l.frequency.value = vib; lg.gain.value = 40; l.connect(lg); lg.connect(o.detune);
        l.start(t); l.stop(t + dur + 0.05);
    }
    o.start(t); o.stop(t + dur + 0.05);
};
// growl: detuned low saws + noise through two vowel-ish formant bands, with pitch bend
const growl = (c, t, dur, f0, f1, peak, a = 0.05, form = [600, 1100]) => {
    const bus = c.ac.createGain(); bus.gain.value = 1; bus.connect(G(c, t, a, peak, dur));
    [-14, 0, 17].forEach(d => {
        const o = c.ac.createOscillator(); o.type = 'sawtooth'; o.detune.value = d;
        o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
        const am = c.ac.createGain(); am.gain.value = 0.3; // rough amplitude flutter
        const l = c.ac.createOscillator(), lg = c.ac.createGain();
        l.frequency.value = 28 + d; lg.gain.value = 0.2; l.connect(lg); lg.connect(am.gain);
        const sum = c.ac.createGain();
        form.forEach(fr => {
            const bp = c.ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = fr; bp.Q.value = 4;
            o.connect(bp); bp.connect(sum);
        });
        sum.connect(am); am.connect(bus);
        l.start(t); l.stop(t + dur + 0.05); o.start(t); o.stop(t + dur + 0.05);
    });
    N(c, t, dur, 'bandpass', form[0], form[1], 2, peak * 0.5, a, c.out);
};
const crackle = (c, t, dur, n, peak) => { // random fire pops
    for (let i = 0; i < n; i++) {
        const tt = t + Math.random() * dur, fade = 1 - (tt - t) / dur;
        N(c, tt, 0.02 + Math.random() * 0.03, 'highpass', 2500 + Math.random() * 3000, 1500, 1, peak * fade * (0.4 + Math.random() * 0.6), 0.001);
    }
};
const boom = (c, t, f0, f1, dur, peak) => O(c, t, dur, 'sine', f0, f1, peak, 400, 0.004);

const trim = list => list.map(s => ({ ...s, play(c) { const m = c.ac.createGain(); m.gain.value = 0.55; m.connect(c.out); s.play0({ ...c, out: m }); } }));
const D = {
    nat1: [
        {
            key: 'a04-dragon-splutter', name: 'Dragon Splutter',
            blurb: 'A choked growl, two wheezy coughs and a sad puff of smoke as the fire fizzles out.',
            play0(c) {
                const { t0, hit } = c, span = hit - t0;
                growl(c, t0, span, 80, 55, 0.5, 0.1, [500, 900]);
                N(c, t0, span, 'bandpass', 300, 1500, 3, 0.18, 0.2); // rising hot wheeze
                [0.55, 0.8].forEach(k => { // chokes
                    const t = t0 + span * k;
                    N(c, t, 0.07, 'bandpass', 700, 300, 2, 0.4, 0.005);
                    O(c, t, 0.08, 'sawtooth', 110, 70, 0.25, 500);
                });
                // the failed blast: weak whump and sputtering hiss
                boom(c, hit, 110, 38, 0.6, 1.0);
                N(c, hit, 0.9, 'lowpass', 2500, 200, 0.7, 0.7, 0.01);
                [0.25, 0.5, 0.8].forEach(d => N(c, hit + d, 0.12, 'bandpass', 900 - d * 400, 300, 3, 0.3, 0.005));
                // sad falling whine of a dying ember
                O(c, hit + 0.1, 1.2, 'triangle', 330, 90, 0.3, 900, 0.02, 5);
                crackle(c, hit, 0.8, 6, 0.15);
                N(c, hit + 0.5, 2.2, 'bandpass', 600, 250, 1, 0.12, 0.3); // smoke drift
            },
        },
        {
            key: 'a04-dragon-backfire', name: 'Backfire Roar',
            blurb: 'An angry snort and deep inhale, then the dragon blasts a fireball back in your face.',
            play0(c) {
                const { t0, hit } = c, span = hit - t0;
                N(c, t0, 0.1, 'bandpass', 500, 900, 2, 0.5, 0.005); // snort
                N(c, t0 + 0.12, span - 0.14, 'bandpass', 400, 3000, 1.5, 0.45, span * 0.8); // inhale sweep up
                O(c, t0 + 0.1, span - 0.1, 'sine', 50, 110, 0.35, 300, span * 0.7); // swelling rumble
                // explosion
                boom(c, hit, 140, 30, 0.9, 1.1);
                N(c, hit, 1.4, 'lowpass', 6000, 150, 0.8, 1.0, 0.003);
                growl(c, hit, 1.4, 95, 45, 0.7, 0.01, [450, 850]);
                N(c, hit, 0.12, 'highpass', 3000, 3000, 0.7, 0.5, 0.001); // shockwave crack
                crackle(c, hit + 0.1, 1.8, 18, 0.3);
                O(c, hit + 0.05, 1.5, 'sine', 70, 28, 0.6, 200);
                N(c, hit + 1.2, 1.8, 'lowpass', 700, 120, 0.5, 0.2, 0.3);
            },
        },
    ],
    nat20: [
        {
            key: 'a04-dragon-roar', name: 'Dragon Roar',
            blurb: 'A mighty rising roar with a pitch bend that erupts into a long gout of crackling fire breath.',
            play0(c) {
                const { t0, hit } = c, span = hit - t0;
                growl(c, t0, span + 0.2, 60, 140, 0.55, span * 0.6, [550, 1000]); // swelling roar to peak
                O(c, t0 + 0.2, span, 'sine', 40, 80, 0.4, 250, span * 0.8);
                // the breath
                growl(c, hit, 1.6, 150, 75, 0.7, 0.02, [700, 1300]);
                N(c, hit, 2.0, 'bandpass', 1800, 500, 0.7, 0.9, 0.02); // roaring flame
                N(c, hit, 0.8, 'lowpass', 5000, 400, 0.6, 0.8, 0.004);
                boom(c, hit, 90, 35, 0.8, 0.9);
                // golden shimmer
                [880, 1320, 1760].forEach((f, i) => O(c, hit + i * 0.05, 1.5, 'sine', f, f * 1.01, 0.1, 5000, 0.05));
                crackle(c, hit + 0.1, 2.2, 30, 0.3);
            },
        },
        {
            key: 'a04-dragon-wings', name: 'Wingbeats and Roar',
            blurb: 'Great wingbeats whoomp faster and faster, then a triumphant roar with flame and golden sparks.',
            play0(c) {
                const { t0, hit } = c, span = hit - t0;
                let t = t0, gap = 0.34, k = 0;
                while (t < hit - 0.05) { // accelerating, growing whoomps
                    const p = 0.35 + 0.65 * (t - t0) / span;
                    N(c, t, 0.22, 'lowpass', 700, 120, 0.8, 0.55 * p, 0.015);
                    boom(c, t, 90, 40, 0.3, 0.7 * p);
                    t += gap; gap = Math.max(0.14, gap * 0.82); k++;
                }
                growl(c, hit, 1.8, 130, 90, 0.7, 0.03, [650, 1150]);
                boom(c, hit, 110, 32, 0.9, 1.0);
                N(c, hit, 2.0, 'bandpass', 2200, 600, 0.8, 0.8, 0.02);
                N(c, hit, 0.6, 'lowpass', 6000, 500, 0.6, 0.7, 0.004);
                // golden sparks spiraling upward
                for (let i = 0; i < 8; i++) O(c, hit + 0.05 + i * 0.09, 0.6, 'sine', 1200 + i * 260, 1800 + i * 330, 0.1, 6000, 0.01);
                crackle(c, hit, 2.4, 26, 0.3);
            },
        },
    ],
};
export default { nat1: trim(D.nat1), nat20: trim(D.nat20) };
