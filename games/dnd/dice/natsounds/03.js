// Volcano and lava nat 1 / nat 20 sounds for the Ember Cage d20.
const rng = s => () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;

// Looping filtered noise with a gain envelope [[time, gain], ...] and an optional filter sweep.
function nz(c, type, f0, f1, q, start, dur, env) {
    const { ac } = c, s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = c.noise; s.loop = true; f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, start);
    f.frequency.exponentialRampToValueAtTime(f1, start + dur);
    g.gain.setValueAtTime(0.0001, start);
    env.forEach(([t, v]) => g.gain.linearRampToValueAtTime(Math.max(v, 0.0001), start + t));
    s.connect(f); f.connect(g); g.connect(c.out); s.start(start); s.stop(start + dur + 0.05);
}
// Oscillator with a pitch glide and attack/decay envelope.
function tone(c, type, f0, f1, start, dur, peak, att = 0.01) {
    const { ac } = c, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, start);
    o.frequency.exponentialRampToValueAtTime(f1, start + dur);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.linearRampToValueAtTime(peak, start + att);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g); g.connect(c.out); o.start(start); o.stop(start + dur + 0.05);
}

export default {
    nat1: [
        {
            key: 'a03-magma-eruption', name: 'Magma Eruption',
            blurb: 'Ground rumble builds, then a massive blast with rocks pattering down.',
            play(c) {
                const { t0, hit } = c, r = rng(7), b = hit - t0;
                tone(c, 'sine', 38, 70, t0, b, 0.5, b * 0.8);
                nz(c, 'lowpass', 80, 400, 1, t0, b, [[b * 0.9, 0.5], [b, 0.6]]);
                tone(c, 'sine', 100, 28, hit, 1.6, 0.4, 0.005);
                tone(c, 'triangle', 220, 45, hit, 0.5, 0.25, 0.005);
                nz(c, 'lowpass', 4000, 200, 0.7, hit, 1.8, [[0.01, 0.45], [0.4, 0.3], [1.8, 0]]);
                nz(c, 'bandpass', 2500, 500, 0.8, hit, 1.0, [[0.01, 0.4], [1.0, 0]]);
                for (let i = 0; i < 22; i++) {
                    const t = hit + 0.35 + r() * 1.9, f = 300 + r() * 1500;
                    nz(c, 'bandpass', f, f * 0.6, 3, t, 0.08, [[0.004, 0.25 * (1 - (t - hit) / 2.6)], [0.08, 0]]);
                }
            },
        },
        {
            key: 'a03-molten-splat', name: 'Molten Splat',
            blurb: 'Magma bubbles and gurgles faster, pops in a thick splat, then hisses as it cools.',
            play(c) {
                const { t0, hit } = c, r = rng(21), b = hit - t0;
                for (let i = 0; i < 9; i++) {
                    const t = t0 + (i / 9) * b * 0.95, f = 130 + r() * 200 + i * 15;
                    tone(c, 'sine', f, f * 2.2, t, 0.06 + r() * 0.03, 0.35, 0.008);
                }
                nz(c, 'lowpass', 150, 500, 1, t0, b, [[b, 0.35]]);
                tone(c, 'sine', 140, 40, hit, 0.5, 0.75, 0.004);
                nz(c, 'lowpass', 1800, 250, 1.5, hit, 0.35, [[0.005, 0.8], [0.35, 0]]);
                tone(c, 'triangle', 120, 42, hit, 1.6, 0.35, 0.03);
                nz(c, 'highpass', 5000, 3500, 0.7, hit + 0.1, 2.2, [[0.1, 0.45], [2.2, 0]]);
                for (let i = 0; i < 5; i++) {
                    const t = hit + 0.5 + r() * 1.5, f = 200 + r() * 150;
                    tone(c, 'sine', f, f * 2, t, 0.07, 0.25, 0.008);
                }
            },
        },
    ],
    nat20: [
        {
            key: 'a03-geyser-roar', name: 'Fire Geyser Roar',
            blurb: 'A rising rumble erupts into a roaring geyser of fire with bright crackling.',
            play(c) {
                const { t0, hit } = c, r = rng(99), b = hit - t0;
                tone(c, 'sine', 45, 140, t0, b, 0.5, b * 0.9);
                nz(c, 'lowpass', 150, 1800, 1, t0, b, [[b, 0.6]]);
                nz(c, 'bandpass', 1000, 3200, 0.9, hit, 1.3, [[0.03, 0.85], [0.5, 0.55], [1.3, 0]]);
                nz(c, 'lowpass', 900, 150, 0.7, hit, 1.5, [[0.02, 0.7], [1.5, 0]]);
                tone(c, 'sine', 110, 55, hit, 1.0, 0.6, 0.005);
                [220, 277.2, 329.6, 440].forEach(f => tone(c, 'triangle', f, f * 1.003, hit, 2.2, 0.12, 0.08));
                for (let i = 0; i < 40; i++) {
                    const t = hit + 0.05 + r() * 2.5, f = 3000 + r() * 4000;
                    nz(c, 'highpass', f, f, 1, t, 0.03, [[0.002, 0.3 * (1 - (t - hit) / 3)], [0.03, 0]]);
                }
            },
        },
        {
            key: 'a03-lava-fountain', name: 'Lava Fountain Chord',
            blurb: 'A lava fountain whoosh resolves into a warm glowing major chord with sizzling sparks.',
            play(c) {
                const { t0, hit } = c, r = rng(5), b = hit - t0;
                nz(c, 'bandpass', 200, 2800, 1.5, t0, b, [[b * 0.9, 0.55], [b, 0.6]]);
                tone(c, 'sine', 110, 220, t0, b, 0.35, b * 0.9);
                tone(c, 'sine', 80, 40, hit, 0.6, 0.6, 0.005);
                nz(c, 'bandpass', 2800, 900, 1, hit, 0.6, [[0.01, 0.5], [0.6, 0]]);
                // A major chord, two slightly detuned layers for warmth
                [220, 277.2, 329.6, 440, 554.4].forEach((f, i) => {
                    tone(c, 'sine', f, f, hit, 2.7, 0.14 - i * 0.01, 0.06);
                    tone(c, 'triangle', f * 1.004, f * 1.004, hit, 2.5, 0.07, 0.08);
                });
                nz(c, 'highpass', 6000, 6000, 0.7, hit + 0.1, 2.5, [[0.2, 0.25], [2.5, 0]]);
                for (let i = 0; i < 14; i++) {
                    const t = hit + 0.1 + r() * 2.2, f = 1800 + r() * 2500;
                    tone(c, 'sine', f, f * 1.2, t, 0.12, 0.12 * (1 - (t - hit) / 2.8), 0.005);
                }
            },
        },
    ],
};
