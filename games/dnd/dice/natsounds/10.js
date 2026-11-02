// Subtle, warm Ember Cage nat 1 / nat 20 sounds: muffled whumps, coal pops, hearth blooms and bell tones.
const tone = (c, type, f0, f1, at, atk, dur, peak, lp) => {
    const { ac, out } = c, o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, at);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, at + dur);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(peak, at + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    let n = o;
    if (lp) { const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; o.connect(f); n = f; }
    n.connect(g); g.connect(out);
    o.start(at); o.stop(at + dur + 0.05);
};
// filtered noise: freq may be [from, to] for a sweep
const hiss = (c, type, freq, q, at, atk, dur, peak) => {
    const { ac, out } = c, s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = c.noise; s.loop = true;
    f.type = type; f.Q.value = q;
    const [a, b] = [].concat(freq);
    f.frequency.setValueAtTime(a, at);
    if (b) f.frequency.exponentialRampToValueAtTime(b, at + dur);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(peak, at + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    s.connect(f); f.connect(g); g.connect(out);
    s.start(at); s.stop(at + dur + 0.05);
};
const pop = (c, at, f, peak) => { // tiny crackle tick
    hiss(c, 'bandpass', f, 3, at, 0.002, 0.03, peak);
};

// scale each sound's level before the shared compressor
const vol = (k, p) => ({ ...p, play(c) { const g = c.ac.createGain(); g.gain.value = k; g.connect(c.out); p.play({ ...c, out: g }); } });
const V = { 'a10-fire-out': 0.5, 'a10-coal-crack': 0.42, 'a10-hearth-bloom': 0.9, 'a10-glow-bell': 0.5 };
const raw = {
    nat1: [
        {
            key: 'a10-fire-out', name: 'Fire Going Out',
            blurb: 'The glow dims under a low hum, then a muffled whump snuffs it with a soft sizzle and one sad low tone.',
            play(c) {
                const { t0, hit } = c;
                tone(c, 'triangle', 220, 150, t0, 0.3, hit - t0 + 0.05, 0.12, 700); // dimming hum
                hiss(c, 'bandpass', 1800, 1.5, t0, 0.4, hit - t0, 0.04);
                tone(c, 'sine', 95, 38, hit, 0.01, 0.55, 0.9, 400); // whump
                hiss(c, 'lowpass', 500, 0.7, hit, 0.01, 0.3, 0.9);
                hiss(c, 'highpass', [5000, 2500], 0.8, hit + 0.1, 0.15, 1.4, 0.16); // sizzle
                tone(c, 'sine', 165, 140, hit + 0.15, 0.08, 1.9, 0.38, 900); // sad tone
                tone(c, 'sine', 196, 165, hit + 0.15, 0.08, 1.5, 0.12, 900);
                for (let i = 0; i < 6; i++) pop(c, hit + 0.6 + i * 0.22 + (i % 2) * 0.07, 2500 + i * 300, 0.12);
            },
        },
        {
            key: 'a10-coal-crack', name: 'Cracked Coal',
            blurb: 'A coal tightens with ticks, cracks with a quiet pop, and embers drift away in a falling hiss.',
            play(c) {
                const { t0, hit } = c;
                for (let i = 0; i < 9; i++) pop(c, t0 + 0.05 + i * (0.4 / 9) + (i % 3) * 0.01, 1800 + i * 250, 0.05 + i * 0.012);
                tone(c, 'sine', 70, 70, t0, 0.4, hit - t0 + 0.05, 0.08, 300);
                hiss(c, 'bandpass', 1500, 1, hit, 0.002, 0.08, 1.0); // crack
                tone(c, 'sine', 320, 90, hit, 0.003, 0.25, 0.7, 800); // pop body
                tone(c, 'triangle', 110, 70, hit + 0.05, 0.05, 0.9, 0.3, 500);
                hiss(c, 'bandpass', [4500, 1200], 2, hit + 0.08, 0.2, 2.0, 0.22); // drifting embers
                for (let i = 0; i < 7; i++) pop(c, hit + 0.35 + i * 0.28 + (i % 2) * 0.1, 3500 - i * 250, 0.14);
                tone(c, 'sine', 130, 98, hit + 0.3, 0.2, 2.0, 0.22, 600);
            },
        },
    ],
    nat20: [
        {
            key: 'a10-hearth-bloom', name: 'Hearth Bloom',
            blurb: 'A warm hum rises over cosy hearth crackle and blooms into a soft, rich major chord.',
            play(c) {
                const { t0, hit } = c, d = hit - t0;
                tone(c, 'sine', 110, 130.8, t0, d * 0.8, d + 0.1, 0.22, 600); // rising hum
                tone(c, 'triangle', 165, 196, t0, d * 0.8, d + 0.1, 0.1, 700);
                hiss(c, 'bandpass', [900, 2200], 1, t0, d * 0.9, d, 0.05);
                for (let i = 0; i < 12; i++) pop(c, t0 + 0.05 + i * (d / 12) + (i % 3) * 0.02, 2200 + (i % 4) * 500, 0.1);
                // chord: C major, C3 E3 G3 C4 E4
                [130.8, 164.8, 196, 261.6, 329.6].forEach((f, i) => {
                    tone(c, i % 2 ? 'triangle' : 'sine', f, f, hit, 0.12 + i * 0.03, 2.3 - i * 0.1, 0.2 - i * 0.015, 1400);
                });
                hiss(c, 'highpass', 3500, 1, hit, 0.1, 1.2, 0.05);
                for (let i = 0; i < 8; i++) pop(c, hit + 0.3 + i * 0.2 + (i % 2) * 0.06, 2800 + (i % 3) * 600, 0.1);
            },
        },
        {
            key: 'a10-glow-bell', name: 'Golden Glow Bell',
            blurb: 'A faint shimmer swells, then a single golden bell tone rings out with a slow shimmer and soft sparks.',
            play(c) {
                const { ac, t0, hit } = c, d = hit - t0;
                tone(c, 'sine', 440, 660, t0, d * 0.9, d + 0.05, 0.1, 1500); // swelling shimmer
                tone(c, 'sine', 444, 666, t0, d * 0.9, d + 0.05, 0.1, 1500);
                hiss(c, 'highpass', [4000, 7000], 1, t0, d, d, 0.03);
                // bell: inharmonic partials with slow beating pairs
                [[660, 0.5, 2.9], [1320, 0.2, 2.2], [1650, 0.12, 1.6], [1990, 0.1, 1.2], [662.5, 0.4, 3.0], [330, 0.18, 2.6]].forEach(([f, a, len]) => {
                    tone(c, 'sine', f, f, hit, 0.004, len, a * 0.7);
                });
                // slow shimmer: tremolo on a high partial
                const o = ac.createOscillator(), g = ac.createGain(), l = ac.createOscillator(), lg = ac.createGain();
                o.frequency.value = 2640; l.frequency.value = 5; lg.gain.value = 0.02;
                g.gain.setValueAtTime(0.0001, hit);
                g.gain.linearRampToValueAtTime(0.05, hit + 0.3);
                g.gain.exponentialRampToValueAtTime(0.0001, hit + 2.4);
                l.connect(lg); lg.connect(g.gain); o.connect(g); g.connect(c.out);
                o.start(hit); l.start(hit); o.stop(hit + 2.5); l.stop(hit + 2.5);
                for (let i = 0; i < 8; i++) pop(c, hit + 0.1 + i * 0.17 + (i % 2) * 0.05, 4000 + (i % 4) * 700, 0.1);
            },
        },
    ],
};
const wrap = a => a.map(p => vol(V[p.key], p));
export default { nat1: wrap(raw.nat1), nat20: wrap(raw.nat20) };
