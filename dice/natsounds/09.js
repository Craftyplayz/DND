// Ember Cage nat 1 / nat 20 sounds: dark epic doom bells, demonic stabs, choir blooms and organ fire.
const END = 3.4;
// deterministic pseudo-random so every render is identical
function rng(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

// oscillator with envelope: attack to g at t+a, exponential decay to silence by t+d
function tone(c, type, f0, t, a, d, g, dest, f1, det) {
    const o = c.ac.createOscillator(), e = c.ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + d);
    if (det) o.detune.value = det;
    e.gain.setValueAtTime(0.0001, t);
    e.gain.linearRampToValueAtTime(g, t + a);
    e.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(e); e.connect(dest || c.out);
    o.start(t); o.stop(Math.min(t + d + 0.05, c.t0 + END));
    return o;
}
// looping noise through a filter with a frequency sweep and gain shape
function noise(c, ftype, fa, fb, t, a, d, g, q, dest) {
    const s = c.ac.createBufferSource(), f = c.ac.createBiquadFilter(), e = c.ac.createGain();
    s.buffer = c.noise; s.loop = true;
    f.type = ftype; f.Q.value = q || 0.7;
    f.frequency.setValueAtTime(fa, t); f.frequency.exponentialRampToValueAtTime(fb, t + d);
    e.gain.setValueAtTime(0.0001, t);
    e.gain.linearRampToValueAtTime(g, t + a);
    e.gain.exponentialRampToValueAtTime(0.0001, t + d);
    s.connect(f); f.connect(e); e.connect(dest || c.out);
    s.start(t); s.stop(Math.min(t + d + 0.05, c.t0 + END));
}
// crackling ember ticks between t and t+len, density rises/falls via the dens(x) function
function crackle(c, t, len, seed, dens, g) {
    const r = rng(seed), n = Math.floor(len * 60);
    for (let i = 0; i < n; i++) {
        const x = i / n;
        if (r() > dens(x)) continue;
        noise(c, 'bandpass', 2000 + r() * 4500, 1500, t + x * len, 0.002, 0.012 + r() * 0.02, g * (0.4 + r() * 0.6), 2);
    }
}
// trim a sound by routing it through a gain stage
function trim(c, g) { const m = c.ac.createGain(); m.gain.value = g; m.connect(c.out); return { ...c, out: m }; }

export default {
    nat1: [
        {
            key: 'a09-doom-bell', name: 'Doom Bell Hellfire',
            blurb: 'A low drone swells with crackling embers, then one deep inharmonic bell tolls under a hellfire blast and sub drop.',
            play(c0) {
                const c = trim(c0, 0.32);
                const { ac, out, t0, hit } = c;
                const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(120, t0);
                lp.frequency.exponentialRampToValueAtTime(700, hit); lp.connect(out);
                // swelling drone (dark minor second cluster)
                [[55, 'sawtooth'], [58.3, 'sawtooth'], [82.4, 'triangle'], [27.5, 'sine']].forEach(([f, ty]) => {
                    const o = ac.createOscillator(), e = ac.createGain();
                    o.type = ty; o.frequency.value = f;
                    e.gain.setValueAtTime(0.0001, t0); e.gain.exponentialRampToValueAtTime(0.35, hit);
                    e.gain.exponentialRampToValueAtTime(0.0001, hit + 1.4);
                    o.connect(e); e.connect(lp); o.start(t0); o.stop(hit + 1.5);
                });
                crackle(c, t0, hit - t0 + 0.6, 11, x => 0.1 + x * 0.6, 0.25);
                // hellfire blast
                noise(c, 'lowpass', 5000, 150, hit, 0.01, 1.5, 1.1, 0.8);
                noise(c, 'bandpass', 900, 200, hit, 0.005, 0.7, 0.7, 0.9);
                tone(c, 'sine', 95, hit, 0.005, 1.2, 1.2, out, 28);
                // doom bell: inharmonic partials of a 98 Hz strike tone
                [[0.5, 0.5, 2.8], [1, 1, 2.6], [1.19, 0.6, 2.2], [1.56, 0.5, 1.8], [2, 0.5, 1.6], [2.51, 0.35, 1.2], [3.0, 0.3, 1.0], [4.17, 0.2, 0.7]]
                    .forEach(([r, g, d]) => tone(c, 'sine', 98 * r, hit, 0.004, d, g * 0.6, out));
                crackle(c, hit + 0.3, 2.4, 29, x => 0.5 * (1 - x), 0.25);
            }
        },
        {
            key: 'a09-demon-stab', name: 'Demonic Stab',
            blurb: 'A rising whine and rumble snap into a diminished minor chord stab with a sub-bass drop and dying embers.',
            play(c0) {
                const c = trim(c0, 0.36);
                const { ac, out, t0, hit } = c;
                // rising whine and rumble build
                tone(c, 'triangle', 110, t0, hit - t0 - 0.02, hit - t0, 0.25, out, 520);
                tone(c, 'sine', 40, t0, hit - t0 - 0.02, hit - t0, 0.5, out, 70);
                noise(c, 'lowpass', 200, 1500, t0, hit - t0 - 0.02, hit - t0, 0.3, 1);
                crackle(c, t0, hit - t0, 5, x => 0.1 + x * 0.5, 0.2);
                // chord stab through a closing lowpass
                const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 3;
                lp.frequency.setValueAtTime(3500, hit); lp.frequency.exponentialRampToValueAtTime(250, hit + 1.6);
                lp.connect(out);
                [55, 82.4, 98, 116.5, 164.8, 196].forEach((f, i) => {
                    [-9, 9].forEach(d => tone(c, 'sawtooth', f, hit, 0.006, 1.7 - i * 0.05, 0.2, lp, null, d));
                });
                tone(c, 'sine', 80, hit, 0.004, 1.5, 1.3, out, 24);
                noise(c, 'lowpass', 4000, 200, hit, 0.004, 0.9, 0.8, 0.8);
                crackle(c, hit + 0.2, 2.6, 31, x => 0.6 * (1 - x), 0.28);
            }
        }
    ],
    nat20: [
        {
            key: 'a09-choir-bloom', name: 'Choir Bloom',
            blurb: 'A heavenly choir "aah" swells from the halo, then blooms into a radiant major chord with a fire roar and golden shimmer.',
            play(c0) {
                const c = trim(c0, 0.9);
                const { ac, out, t0, hit } = c;
                // two formant bands shared by all voices
                const mix = ac.createGain(); mix.gain.value = 1;
                [[700, 1], [1200, 0.7], [2600, 0.25]].forEach(([fr, g]) => {
                    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = fr; bp.Q.value = 4;
                    const gg = ac.createGain(); gg.gain.value = g;
                    mix.connect(bp); bp.connect(gg); gg.connect(out);
                });
                // pre-flare: D major, quiet; after hit: wider voicing, full
                const notes = [146.8, 220, 293.7, 370, 440, 587.3, 740];
                notes.forEach((f, i) => {
                    [-12, 0, 12].forEach(d => {
                        const o = ac.createOscillator(), e = ac.createGain();
                        o.type = i % 2 ? 'triangle' : 'sawtooth'; o.frequency.value = f; o.detune.value = d;
                        // slow vibrato
                        const l = ac.createOscillator(), lg = ac.createGain(); l.frequency.value = 5 + i * 0.2; lg.gain.value = 6;
                        l.connect(lg); lg.connect(o.detune);
                        e.gain.setValueAtTime(0.0001, t0);
                        e.gain.exponentialRampToValueAtTime(0.06, hit);
                        e.gain.linearRampToValueAtTime(i > 3 ? 0.16 : 0.12, hit + 0.12);
                        e.gain.exponentialRampToValueAtTime(0.0001, hit + 2.4);
                        o.connect(e); e.connect(mix);
                        o.start(t0); l.start(t0); o.stop(hit + 2.5); l.stop(hit + 2.5);
                    });
                });
                noise(c, 'bandpass', 500, 2500, t0, hit - t0, hit - t0 + 0.4, 0.2, 0.8);
                noise(c, 'lowpass', 2500, 300, hit, 0.05, 2.0, 0.6, 0.7);
                tone(c, 'sine', 73.4, hit, 0.01, 1.8, 0.8, out);
                [1760, 2349, 2960, 3520].forEach((f, i) => tone(c, 'sine', f, hit + i * 0.05, 0.01, 1.6, 0.12, out));
                crackle(c, hit, 2.2, 47, x => 0.5 * (1 - x), 0.2);
            }
        },
        {
            key: 'a09-organ-fire', name: 'Organ Fire Roar',
            blurb: 'A cathedral-organ chord swells under a warm roaring fire and erupts into a full major chord with a shimmering high octave.',
            play(c0) {
                const c = trim(c0, 0.5);
                const { ac, out, t0, hit } = c;
                const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5000; lp.connect(out);
                // organ: additive drawbar partials of C major
                const chord = (freqs, t, a, d, g) => freqs.forEach(f =>
                    [[1, 1], [2, 0.7], [3, 0.4], [4, 0.45], [6, 0.2], [8, 0.12]].forEach(([r, w]) =>
                        tone(c, 'sine', f * r, t, a, d, g * w, lp)));
                chord([65.4, 130.8, 196, 261.6], t0, hit - t0, hit - t0 + 0.05, 0.1);
                chord([65.4, 130.8, 196, 261.6, 329.6, 392, 523.3], hit, 0.02, 2.5, 0.1);
                chord([1046.5, 1568, 2093], hit, 0.03, 2.2, 0.03);
                // fire roar under it
                noise(c, 'lowpass', 300, 1800, t0, hit - t0, hit - t0 + 0.1, 0.45, 0.8);
                noise(c, 'lowpass', 2800, 400, hit, 0.04, 2.2, 0.8, 0.7);
                tone(c, 'sine', 55, hit, 0.01, 1.8, 0.9, out, 40);
                // shimmer: fast rising golden sparkles
                const r = rng(77);
                for (let i = 0; i < 18; i++) tone(c, 'sine', 2000 + r() * 3500, hit + i * 0.06, 0.005, 0.5, 0.07, out);
                crackle(c, t0, 3, 61, x => 0.3, 0.15);
            }
        }
    ],
};
