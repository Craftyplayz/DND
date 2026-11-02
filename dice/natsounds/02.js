// Ember Cage nat 1 / nat 20 sounds, iron cage theme: bars snapping, molten collapse, latch and gong, chime bloom.
const rng = seed => () => (seed = (seed * 16807) % 2147483647) / 2147483647;

// oscillator with frequency ramp and gain envelope (attack a, exp decay to t+d)
function tone(c, type, f0, f1, t, d, g, a = 0.005, dest = c.out) {
    const o = c.ac.createOscillator(), v = c.ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + d);
    v.gain.setValueAtTime(0.0001, t);
    v.gain.linearRampToValueAtTime(g, t + a);
    v.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(v).connect(dest);
    o.start(t); o.stop(t + d + 0.02);
}
// filtered noise burst with filter sweep and envelope
function hiss(c, ftype, f0, f1, q, t, d, g, a = 0.005, dest = c.out) {
    const s = c.ac.createBufferSource(), f = c.ac.createBiquadFilter(), v = c.ac.createGain();
    s.buffer = c.noise; s.loop = true;
    f.type = ftype; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + d);
    v.gain.setValueAtTime(0.0001, t);
    v.gain.linearRampToValueAtTime(g, t + a);
    v.gain.exponentialRampToValueAtTime(0.0001, t + d);
    s.connect(f).connect(v).connect(dest);
    s.start(t); s.stop(t + d + 0.02);
}
// struck iron: inharmonic sine partials
const IRON = [1, 2.76, 5.4, 8.93, 13.3];
function strike(c, f, t, d, g) {
    IRON.forEach((r, i) => tone(c, 'sine', f * r, f * r, t, d / (1 + i * 0.7), g / (1 + i * 0.6), 0.002));
    hiss(c, 'bandpass', f * 6, f * 3, 2, t, 0.05, g * 0.8, 0.001);
}
// gong: slow bloom partials
function gong(c, f, t, d, g) {
    [1, 1.51, 2.02, 2.76, 3.9, 5.2].forEach((r, i) => {
        tone(c, 'sine', f * r * 1.004, f * r, t, d / (1 + i * 0.35), g / (1 + i * 0.5), 0.02 + i * 0.01);
        tone(c, 'sine', f * r * 0.996, f * r, t, d / (1 + i * 0.35), g / (1 + i * 0.5), 0.02 + i * 0.01);
    });
    hiss(c, 'bandpass', f * 4, f * 2, 1, t, 0.4, g * 0.6, 0.01);
}
function clatter(c, t, n, span, g, lo, hi, seed) {
    const r = rng(seed);
    for (let i = 0; i < n; i++) {
        const p = i / n, tt = t + span * p * p + r() * 0.03;
        strike(c, lo + r() * (hi - lo), tt, 0.12 + r() * 0.2, g * (1 - p * 0.8));
    }
}
function creak(c, t, d, f0, f1, g) {
    const o = c.ac.createOscillator(), f = c.ac.createBiquadFilter(), v = c.ac.createGain(), l = c.ac.createOscillator(), lg = c.ac.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + d);
    f.type = 'bandpass'; f.Q.value = 6;
    f.frequency.setValueAtTime(f0 * 4, t); f.frequency.exponentialRampToValueAtTime(f1 * 5, t + d);
    l.frequency.value = 23; lg.gain.value = g * 0.5; l.connect(lg).connect(v.gain);
    v.gain.setValueAtTime(0.0001, t);
    v.gain.linearRampToValueAtTime(g, t + d * 0.85);
    v.gain.linearRampToValueAtTime(0.0001, t + d);
    o.connect(f).connect(v).connect(c.out);
    o.start(t); o.stop(t + d + 0.02); l.start(t); l.stop(t + d + 0.02);
}

const sounds = {
    nat1: [
        {
            key: 'a02-bars-burst', name: 'Bars Burst Apart',
            blurb: 'The cage groans and pings under heat, then snaps apart and clatters across the floor.',
            play(c) {
                const { t0, hit: h } = c;
                creak(c, t0, h - t0, 70, 160, 0.3);
                [0.1, 0.2, 0.28, 0.34, 0.39, 0.43].forEach((o, i) => tone(c, 'sine', 1400 + i * 260, 1400 + i * 260, t0 + o, 0.08, 0.1 + i * 0.02, 0.001));
                hiss(c, 'highpass', 2000, 6000, 1, t0, h - t0, 0.12, h - t0 - 0.02);
                // burst
                tone(c, 'sine', 140, 28, h, 0.9, 0.9, 0.003);
                hiss(c, 'lowpass', 5000, 300, 0.7, h, 0.9, 0.7, 0.002);
                hiss(c, 'highpass', 3000, 5000, 1, h, 0.15, 0.6, 0.001);
                strike(c, 330, h, 1.4, 0.3);
                strike(c, 210, h + 0.04, 1.6, 0.25);
                clatter(c, h + 0.12, 18, 1.8, 0.18, 400, 1600, 7);
                tone(c, 'sine', 55, 40, h + 0.15, 1.5, 0.35, 0.05);
            },
        },
        {
            key: 'a02-molten-collapse', name: 'Molten Collapse',
            blurb: 'A low metal groan sags into a heavy iron crash and a hissing molten splash.',
            play(c) {
                const { t0, hit: h } = c;
                creak(c, t0, h - t0, 200, 55, 0.3);
                tone(c, 'sine', 90, 60, t0, h - t0, 0.3, 0.3);
                hiss(c, 'bandpass', 300, 1500, 3, t0 + 0.1, h - t0 - 0.1, 0.15, 0.3);
                // crash
                tone(c, 'sine', 100, 25, h, 1.2, 0.9, 0.003);
                tone(c, 'triangle', 60, 30, h, 1.2, 0.4, 0.003);
                hiss(c, 'lowpass', 4000, 200, 0.7, h, 1.4, 0.8, 0.002);
                strike(c, 150, h, 1.8, 0.35);
                strike(c, 237, h + 0.02, 1.5, 0.25);
                strike(c, 93, h + 0.05, 2, 0.3);
                // molten splash: sizzle and bubbles
                hiss(c, 'bandpass', 3000, 1200, 1.5, h + 0.1, 1.8, 0.3, 0.1);
                const r = rng(11);
                for (let i = 0; i < 14; i++) {
                    const f = 150 + r() * 250;
                    tone(c, 'sine', f, f * 2.2, h + 0.3 + i * 0.12 + r() * 0.05, 0.1, 0.12, 0.005);
                }
                clatter(c, h + 0.3, 6, 1.5, 0.12, 300, 900, 3);
            },
        },
    ],
    nat20: [
        {
            key: 'a02-cage-unlocks', name: 'Cage Unlocks',
            blurb: 'A heavy latch clunks, chains rattle loose, then a huge iron gong blooms with fire.',
            play(c) {
                const { t0, hit: h } = c;
                // latch clunk
                tone(c, 'sine', 120, 50, t0 + 0.05, 0.25, 0.6, 0.002);
                strike(c, 480, t0 + 0.05, 0.3, 0.3);
                // chain rattle, accelerating
                const r = rng(5);
                let t = t0 + 0.3;
                while (t < h - 0.05) {
                    hiss(c, 'bandpass', 3500 + r() * 3000, 2500, 5, t, 0.05, 0.2, 0.001);
                    tone(c, 'sine', 1800 + r() * 1500, 1800 + r() * 1500, t, 0.06, 0.06, 0.001);
                    t += 0.07 - (t - t0) * 0.04;
                }
                hiss(c, 'bandpass', 400, 3000, 1.5, h - 0.35, 0.35, 0.3, 0.3);
                // gong
                tone(c, 'sine', 70, 55, h, 2.5, 0.6, 0.01);
                gong(c, 110, h, 3, 0.45);
                gong(c, 220, h, 2.2, 0.2);
                hiss(c, 'lowpass', 600, 4000, 0.7, h, 0.5, 0.4, 0.2);
                hiss(c, 'highpass', 4000, 9000, 1, h, 1.2, 0.18, 0.05);
                tone(c, 'sine', 880, 880, h + 0.05, 1.5, 0.12, 0.01);
            },
        },
        {
            key: 'a02-bar-chime-bloom', name: 'Bar Chime Bloom',
            blurb: 'Iron bars ring like tuned chimes, rising and swelling into a bright bell chord.',
            play(c) {
                const { t0, hit: h } = c;
                const notes = [293.66, 349.23, 440, 523.25, 587.33, 698.46, 880];
                const step = (h - t0) / notes.length;
                notes.forEach((f, i) => {
                    strike(c, f, t0 + i * step, 0.5 + i * 0.1, 0.12 + i * 0.015);
                });
                tone(c, 'triangle', 146.83, 293.66, t0, h - t0, 0.25, h - t0 - 0.02);
                hiss(c, 'bandpass', 800, 6000, 2, t0, h - t0, 0.14, h - t0 - 0.02);
                // bell chord D major add9 with iron overtones
                [[293.66, 0.35], [369.99, 0.3], [440, 0.3], [587.33, 0.3], [880, 0.2], [1174.66, 0.12]].forEach(([f, g], i) => {
                    strike(c, f, h, 2.6 - i * 0.2, g * 0.7);
                    tone(c, 'sine', f, f, h, 2.8 - i * 0.2, g * 0.4, 0.01);
                });
                tone(c, 'sine', 73.4, 70, h, 2.2, 0.6, 0.01);
                hiss(c, 'highpass', 3000, 8000, 1, h, 0.8, 0.3, 0.003);
                hiss(c, 'lowpass', 3000, 400, 0.7, h, 0.6, 0.3, 0.003);
                const r = rng(9);
                for (let i = 0; i < 8; i++) tone(c, 'sine', 2000 + r() * 2500, 2000 + r() * 2500, h + 0.1 + i * 0.12, 0.3, 0.05, 0.002);
            },
        },
    ],
};

// scale down so the compressed peak stays under 0.9
for (const k of ['nat1', 'nat20']) sounds[k].forEach(s => { const p = s.play; s.play = c => { const g = c.ac.createGain(); g.gain.value = k === "nat20" ? 0.42 : 0.5; g.connect(c.out); p({ ...c, out: g }); }; });
export default sounds;
