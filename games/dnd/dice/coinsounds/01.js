// Real-coin flip sounds: a bright silver coin and a heavy gold coin (throw, bounce, wobble-settle).
const rnd = (a, b) => a + Math.random() * (b - a);

// gain node with a fast attack and exponential decay
function env(c, t, peak, dec, att = 0.001) {
    const g = c.ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + att);
    g.gain.exponentialRampToValueAtTime(0.0001, t + att + dec);
    g.connect(c.out);
    return g;
}
// one sine/tri partial, optionally gliding from f to f2
function tone(c, t, f, vol, dec, type = 'sine', f2 = f, att = 0.001) {
    const o = c.ac.createOscillator(), g = env(c, t, vol, dec, att);
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (f2 !== f) o.frequency.exponentialRampToValueAtTime(f2, t + dec);
    o.connect(g);
    o.start(t);
    o.stop(t + att + dec + 0.02);
}
// inharmonic metal ring: base x ratios, higher partials die faster
function ring(c, t, base, vol, dec, ratios = [1, 2.76, 5.4, 8.9], amps = [1, 0.6, 0.35, 0.2]) {
    ratios.forEach((r, i) => {
        if (base * r < 15000) tone(c, t, base * r * rnd(0.99, 1.01), vol * amps[i], dec / (1 + i * 0.6));
    });
}
// filtered noise burst
function burst(c, t, vol, dur, type, f, q = 1, f2 = f, att = 0.001) {
    const s = c.ac.createBufferSource(), flt = c.ac.createBiquadFilter(), g = env(c, t, vol, dur, att);
    s.buffer = c.noise;
    s.loop = true;
    flt.type = type;
    flt.Q.value = q;
    flt.frequency.setValueAtTime(f, t);
    if (f2 !== f) flt.frequency.exponentialRampToValueAtTime(f2, t + dur);
    s.connect(flt);
    flt.connect(g);
    s.start(t, rnd(0, 0.3));
    s.stop(t + att + dur + 0.02);
}
// wobble rattle: clicks whose gaps shrink from gap0 to gap1 over total seconds; returns end time
function rattle(c, t, total, gap0, gap1, click) {
    let el = 0, i = 0;
    while (el < total) {
        const p = el / total;
        click(t + el, 1 - 0.65 * p, p, i++);
        el += gap0 * Math.pow(gap1 / gap0, p);
    }
    return t + el;
}

export default [
    {
        key: 'c01-classic-silver', name: 'Classic Silver Coin',
        blurb: 'A thumb-flick ting and a faint whir, bright ringing bounces, and a rattle that speeds up to a soft final ring.',
        throw(c) {
            const t = c.t;
            tone(c, t, 3600, 0.3, 0.22);
            tone(c, t, 9900, 0.12, 0.1);
            burst(c, t, 0.35, 0.02, 'highpass', 4000);
            // airy whir rising as the coin spins up
            burst(c, t + 0.03, 0.14, 0.55, 'bandpass', 1800, 2.5, 4200, 0.12);
            tone(c, t + 0.03, 700, 0.025, 0.5, 'triangle', 1500, 0.1);
        },
        hit(c) {
            const t = c.t, v = c.vol, base = (c.onTable ? 3300 : 3800) * rnd(0.97, 1.04);
            ring(c, t, base, 0.4 * v, 0.1 + 0.4 * v);
            burst(c, t, 0.5 * v, 0.012, 'bandpass', 5500, 1.2);
            tone(c, t, 420, 0.25 * v, 0.03);
        },
        settle(c) {
            const end = rattle(c, c.t, 1.25, 0.09, 0.008, (t, a, p) => {
                const f = 3000 + 900 * p;
                tone(c, t, f * rnd(0.97, 1.03), 0.22 * a, 0.05);
                tone(c, t, f * 2.76, 0.1 * a, 0.03);
                burst(c, t, 0.2 * a, 0.01, 'highpass', 5000);
            });
            ring(c, end, 3400, 0.16, 0.5);
            burst(c, end, 0.18, 0.01, 'bandpass', 5000, 1);
        },
    },
    {
        key: 'c01-heavy-gold', name: 'Heavy Gold Coin',
        blurb: 'A weighty tunk of a flip, thudding bounces with a long rich ring, and a slow heavy wobble ending in a low clunk.',
        throw(c) {
            const t = c.t;
            tone(c, t, 520, 0.45, 0.14, 'sine', 300);
            tone(c, t, 1500, 0.2, 0.3);
            burst(c, t, 0.25, 0.03, 'lowpass', 1800);
            burst(c, t + 0.05, 0.16, 0.7, 'bandpass', 600, 2, 1300, 0.2);
            tone(c, t + 0.05, 220, 0.05, 0.65, 'triangle', 480, 0.2);
        },
        hit(c) {
            const t = c.t, v = c.vol, base = (c.onTable ? 1400 : 1650) * rnd(0.97, 1.03);
            ring(c, t, base, 0.38 * v, 0.2 + 0.45 * v, [1, 2.4, 4.9, 7.6], [1, 0.55, 0.3, 0.15]);
            tone(c, t, 170, 0.6 * v, 0.07, 'sine', 90);
            burst(c, t, 0.3 * v, 0.02, 'lowpass', 2500);
        },
        settle(c) {
            const end = rattle(c, c.t, 1.6, 0.13, 0.02, (t, a, p) => {
                const f = 1350 + 300 * p;
                ring(c, t, f * rnd(0.98, 1.02), 0.2 * a, 0.12, [1, 2.4], [1, 0.5]);
                tone(c, t, 160, 0.25 * a, 0.04, 'sine', 100);
            });
            tone(c, end, 150, 0.7, 0.16, 'sine', 70);
            burst(c, end, 0.3, 0.03, 'lowpass', 2000);
            ring(c, end, 1450, 0.3, 0.7, [1, 2.4, 4.9], [1, 0.55, 0.3]);
        },
    },
];
