// Ember Cage nat 1 / nat 20 sounds, fireworks theme: a dud rocket, a crate going off, a skyrocket burst, a crossette.
const rnd = (s => () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)(7);

// Gain node with a fast attack and exponential decay, connected to out.
function env(c, t, peak, att, dur) {
    const g = c.ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + att);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(c.out);
    return g;
}
// Filtered noise burst; f1 -> f2 sweeps the filter.
function nz(c, type, f1, f2, q, t, dur, peak, att = 0.004) {
    const s = c.ac.createBufferSource();
    s.buffer = c.noise; s.loop = true;
    const f = c.ac.createBiquadFilter();
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f1, t);
    f.frequency.exponentialRampToValueAtTime(f2, t + dur);
    s.connect(f); f.connect(env(c, t, peak, att, dur));
    s.start(t, rnd() * 0.3); s.stop(t + dur + 0.05);
}
// Oscillator with a pitch sweep f1 -> f2.
function tone(c, type, f1, f2, t, dur, peak, att = 0.01) {
    const o = c.ac.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f1, t);
    o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    o.connect(env(c, t, peak, att, dur));
    o.start(t); o.stop(t + dur + 0.05);
}
// Dense crackle: random gain spikes on one highpassed noise source. dens = clicks per second at start, decays to ~10%.
function crackle(c, t, dur, dens, peak, hp = 3000) {
    const s = c.ac.createBufferSource();
    s.buffer = c.noise; s.loop = true;
    const f = c.ac.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = hp;
    const g = c.ac.createGain();
    g.gain.setValueAtTime(0, t);
    let x = 0;
    while (x < dur) {
        const k = x / dur, d = dens * (1 - 0.9 * k);
        x += -Math.log(1 - rnd()) / d;
        if (x >= dur) break;
        const a = peak * (1 - k) * (0.3 + 0.7 * rnd());
        g.gain.setValueAtTime(a, t + x);
        g.gain.setValueAtTime(0, t + x + 0.002 + 0.004 * rnd());
    }
    s.connect(f); f.connect(g); g.connect(c.out);
    s.start(t, rnd() * 0.3); s.stop(t + dur + 0.05);
}
// Deep boom: sine drop plus lowpassed noise body and a bright crack.
function boom(c, t, peak, len = 1.0) {
    tone(c, 'sine', 140, 32, t, len, peak, 0.003);
    nz(c, 'lowpass', 2500, 120, 0.7, t, len * 0.7, peak * 0.9, 0.002);
    nz(c, 'highpass', 4000, 1500, 0.5, t, 0.12, peak * 0.5, 0.001);
}
// Short bang: pop with pitch drop.
function bang(c, t, peak, f = 200) {
    tone(c, 'sine', f * 1.5, f * 0.5, t, 0.18, peak, 0.002);
    nz(c, 'bandpass', 3500, 900, 0.8, t, 0.14, peak * 0.8, 0.001);
}

export default {
    nat1: [
        {
            key: 'a07-dud-rocket', name: 'Dud Rocket',
            blurb: 'A fuse sputters, the rocket whistles up weakly, chokes, and drops with a dead thud and sad crackles.',
            play(c) {
                const { t0, hit } = c;
                // sputtering fuse: hiss gated by irregular spikes, growing
                const s = c.ac.createBufferSource();
                s.buffer = c.noise; s.loop = true;
                const f = c.ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 5000; f.Q.value = 0.7;
                const g = c.ac.createGain(); g.gain.setValueAtTime(0.0001, t0);
                for (let x = 0; x < hit - t0; x += 0.03 + rnd() * 0.05) {
                    const k = x / (hit - t0);
                    g.gain.setValueAtTime((0.1 + 0.3 * k) * (0.3 + rnd()), t0 + x);
                    g.gain.setValueAtTime(0.03, t0 + x + 0.02);
                }
                g.gain.setValueAtTime(0.0001, hit);
                s.connect(f); f.connect(g); g.connect(c.out);
                s.start(t0); s.stop(hit + 0.05);
                // weak wobbling whistle rising then stalling
                tone(c, 'sine', 500, 900, t0 + 0.35, hit - t0 - 0.35, 0.12, 0.2);
                // dud: flat low thud + sagging tone
                boom(c, hit, 0.55, 0.6);
                tone(c, 'triangle', 700, 90, hit, 0.9, 0.35, 0.005);
                nz(c, 'bandpass', 1500, 300, 1.5, hit + 0.02, 0.5, 0.35);
                // sad sparse crackles falling away
                crackle(c, hit + 0.1, 2.2, 30, 0.5, 2000);
                tone(c, 'sine', 300, 70, hit + 0.5, 1.4, 0.18, 0.2);
            }
        },
        {
            key: 'a07-crate-goes-off', name: 'Crate Goes Off',
            blurb: 'The whole crate ignites by accident: a wall of bangs, whistles and pops all at once.',
            play(c) {
                const { t0, hit } = c;
                // fuse hiss + early pops as it cooks off
                nz(c, 'highpass', 3000, 7000, 0.5, t0, hit - t0, 0.25, hit - t0 - 0.02);
                crackle(c, t0 + 0.1, hit - t0, 25, 0.35, 3000);
                // main blast
                boom(c, hit, 0.75, 1.2);
                // chaotic bangs, whistles
                for (let i = 0; i < 14; i++) {
                    const t = hit + 0.05 + rnd() * 1.4;
                    bang(c, t, 0.3 + rnd() * 0.3, 120 + rnd() * 250);
                }
                for (let i = 0; i < 5; i++) {
                    const t = hit + rnd() * 0.8, f = 600 + rnd() * 1500;
                    tone(c, 'sine', f, rnd() < 0.5 ? f * 2.2 : f * 0.4, t, 0.4 + rnd() * 0.5, 0.12);
                }
                crackle(c, hit, 2.8, 120, 0.5, 2500);
            }
        },
    ],
    nat20: [
        {
            key: 'a07-skyrocket-burst', name: 'Skyrocket Burst',
            blurb: 'A rising whistle climbs, bursts into a huge boom, then a long glittering crackle rains down.',
            play(c) {
                const { t0, hit } = c;
                const d = hit - t0;
                // whistle with vibrato, sweeping up
                const o = c.ac.createOscillator(); o.type = 'sine';
                o.frequency.setValueAtTime(500, t0);
                o.frequency.exponentialRampToValueAtTime(3200, hit);
                const lfo = c.ac.createOscillator(); lfo.frequency.value = 14;
                const lg = c.ac.createGain(); lg.gain.value = 40;
                lfo.connect(lg); lg.connect(o.frequency);
                const e = c.ac.createGain();
                e.gain.setValueAtTime(0.0001, t0);
                e.gain.linearRampToValueAtTime(0.28, hit - 0.03);
                e.gain.linearRampToValueAtTime(0.0001, hit + 0.02);
                o.connect(e); e.connect(c.out);
                o.start(t0); lfo.start(t0); o.stop(hit + 0.05); lfo.stop(hit + 0.05);
                nz(c, 'bandpass', 1500, 6000, 2, t0, d, 0.12, d * 0.8);
                // burst
                boom(c, hit, 0.7, 1.3);
                nz(c, 'bandpass', 2500, 800, 0.6, hit, 1.0, 0.4, 0.003);
                // golden shimmer chord
                [1568, 2093, 2637].forEach((f, i) => tone(c, 'sine', f, f * 1.01, hit + 0.03 * i, 1.6, 0.07, 0.03));
                // long glitter
                crackle(c, hit + 0.05, 2.3, 260, 0.5, 4500);
            }
        },
        {
            key: 'a07-crossette', name: 'Crossette Bursts',
            blurb: 'Three bursts in quick succession, each higher, ending in a shimmering crackle shower.',
            play(c) {
                const { t0, hit } = c;
                // quick climbing whistle under everything
                tone(c, 'sine', 400, 1800, t0, hit - t0, 0.15, 0.3);
                // two preliminary bursts, each higher and brighter
                [[hit - 0.62, 1.0, 0.45], [hit - 0.3, 1.4, 0.55]].forEach(([t, m, p]) => {
                    nz(c, 'bandpass', 3000 * m, 1000 * m, 0.7, t, 0.35, p, 0.002);
                    tone(c, 'sine', 220 * m, 60, t, 0.35, p, 0.002);
                    crackle(c, t, 0.4, 150, 0.3, 4000 * m);
                    tone(c, 'sine', 1200 * m, 1250 * m, t + 0.02, 0.3, 0.08, 0.01);
                });
                // grand finale
                boom(c, hit, 0.7, 1.2);
                [1319, 1760, 2349, 3136].forEach((f, i) => tone(c, 'triangle', f, f, hit + i * 0.07, 1.2, 0.06, 0.02));
                // shower of sparks
                crackle(c, hit, 2.3, 300, 0.5, 5000);
                nz(c, 'highpass', 6000, 9000, 0.5, hit, 1.5, 0.15, 0.1);
            }
        },
    ],
};
