// Fantasy coin-flip sound profiles: a dragon's treasure hoard and an enchanted arcane coin.
const R = (a, b) => a + Math.random() * (b - a);

// Enveloped oscillator: attack, exponential decay to `dur`, optional glide to f2.
function tone(c, t, f, dur, g, type = 'sine', f2 = 0, att = 0.003) {
    const o = c.ac.createOscillator(), a = c.ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    a.gain.setValueAtTime(0.0001, t);
    a.gain.linearRampToValueAtTime(g, t + att);
    a.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(a); a.connect(c.out);
    o.start(t); o.stop(t + dur + 0.02);
    return a;
}

// Filtered noise burst (bandpass/highpass), optional frequency sweep.
function puff(c, t, f, q, dur, g, type = 'bandpass', f2 = 0, att = 0.003) {
    const s = c.ac.createBufferSource(), fl = c.ac.createBiquadFilter(), a = c.ac.createGain();
    s.buffer = c.noise; s.loop = dur > 0.38;
    fl.type = type; fl.Q.value = q;
    fl.frequency.setValueAtTime(f, t);
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
    a.gain.setValueAtTime(0.0001, t);
    a.gain.linearRampToValueAtTime(g, t + att);
    a.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(a); a.connect(c.out);
    s.start(t); s.stop(t + dur + 0.02);
}

// One bright gold clink: two inharmonic high partials plus a tick.
function clink(c, t, g, base) {
    const f = base || R(2400, 4800);
    tone(c, t, f, R(0.07, 0.16), g, 'sine');
    tone(c, t, f * 1.504, R(0.05, 0.1), g * 0.6, 'sine');
    tone(c, t, f * 2.76, 0.04, g * 0.3, 'sine');
    puff(c, t, 7000, 1, 0.012, g * 0.5, 'highpass');
}

export default [
    {
        key: 'c03-hoard',
        name: 'Dragon Hoard',
        blurb: 'A flick and a purse jingle; every bounce knocks the gold pile, and the coin ends in a little avalanche and a sparkle.',
        throw(c) {
            const t = c.t;
            // coin-purse jingle
            for (let i = 0; i < 6; i++) clink(c, t + i * 0.035 + R(0, 0.015), 0.16 + 0.05 * (i % 2), R(2600, 4200));
            // thumb flick
            puff(c, t + 0.1, 2500, 2, 0.04, 0.35);
            tone(c, t + 0.1, 900, 0.05, 0.3, 'triangle', 500);
            // spin rising through the air
            tone(c, t + 0.14, 1800, 0.45, 0.12, 'sine', 3400, 0.12);
            tone(c, t + 0.14, 1810 * 1.5, 0.45, 0.06, 'sine', 5100, 0.12);
            puff(c, t + 0.14, 2500, 3, 0.45, 0.07, 'bandpass', 5000, 0.15);
        },
        hit(c) {
            const v = Math.max(0.12, c.vol), t = c.t;
            if (c.onTable) {
                tone(c, t, 1400, 0.05, 0.3 * v, 'triangle', 700);
                puff(c, t, 3000, 1.5, 0.03, 0.3 * v);
            }
            const n = 2 + Math.floor(Math.random() * 3);
            let at = 0.004;
            for (let i = 0; i < n; i++) {
                clink(c, t + at, (0.2 + 0.4 * v) * (1 - i * 0.12));
                at += R(0.012, 0.03);
            }
        },
        settle(c) {
            const t = c.t;
            // avalanche: dense trickle of clinks that thins out
            let at = 0, gap = 0.012, g = 0.28;
            while (at < 1.3) {
                clink(c, t + at, g * R(0.5, 1));
                gap *= 1.09; g *= 0.97;
                at += gap * R(0.6, 1.4);
            }
            puff(c, t, 4000, 0.8, 0.9, 0.08, 'bandpass', 1800, 0.05);
            // soft magical sparkle: descending-order random high pings
            const sp = [1568, 2093, 2637, 3136, 4186];
            for (let i = 0; i < 6; i++) {
                const f = sp[Math.floor(Math.random() * sp.length)];
                tone(c, t + 0.9 + i * 0.1 + R(0, 0.04), f, 0.5, 0.14 - i * 0.012, 'sine', 0, 0.01);
            }
        },
    },
    {
        key: 'c03-arcane',
        name: 'Arcane Coin',
        blurb: 'A shimmering rising chime; each bounce rings like a detuned enchanted bell and the coin hums upward before a soft major chord.',
        throw(c) {
            const t = c.t, d = 0.65;
            puff(c, t, 600, 1.5, d, 0.3, 'bandpass', 5000, 0.2); // soft whoosh
            [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => {
                const st = t + i * 0.09;
                tone(c, st, f, 0.5, 0.2, 'sine', 0, 0.02);
                tone(c, st, f * 1.006, 0.5, 0.12, 'triangle', 0, 0.02);
            });
            tone(c, t, 400, d, 0.08, 'sine', 1600, 0.3);
        },
        hit(c) {
            const v = Math.max(0.12, c.vol), t = c.t;
            const f = c.onTable ? 880 : 1175;
            const dur = 0.25 + 0.35 * v;
            const g = 0.2 + 0.45 * v;
            puff(c, t, 4000, 1, 0.015, 0.25 * v, 'highpass');
            // bell partials, slightly detuned
            [[1, 1], [2.01, 0.5], [2.76, 0.35], [4.07, 0.2], [1.004, 0.6]].forEach(([r, m]) => {
                tone(c, t, f * r, dur * (r > 3 ? 0.5 : 1), g * m * 0.6, 'sine');
            });
            // shimmer tail: partial with slow tremolo
            const o = c.ac.createOscillator(), a = c.ac.createGain(), l = c.ac.createOscillator(), lg = c.ac.createGain();
            o.frequency.value = f * 3.01; l.frequency.value = R(6, 9); lg.gain.value = 0.04 * g;
            a.gain.setValueAtTime(0.0001, t);
            a.gain.linearRampToValueAtTime(0.1 * g, t + 0.02);
            a.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.1);
            l.connect(lg); lg.connect(a.gain); o.connect(a); a.connect(c.out);
            o.start(t); l.start(t); o.stop(t + dur + 0.12); l.stop(t + dur + 0.12);
        },
        settle(c) {
            const t = c.t;
            // hum rising in pitch as it wobbles down, with growing flutter
            const o = c.ac.createOscillator(), o2 = c.ac.createOscillator(), a = c.ac.createGain();
            const l = c.ac.createOscillator(), lg = c.ac.createGain();
            o.type = 'triangle'; o2.type = 'sine';
            o.frequency.setValueAtTime(260, t); o.frequency.exponentialRampToValueAtTime(900, t + 1.0);
            o2.frequency.setValueAtTime(262, t); o2.frequency.exponentialRampToValueAtTime(907, t + 1.0);
            l.frequency.setValueAtTime(6, t); l.frequency.linearRampToValueAtTime(22, t + 1.0);
            lg.gain.value = 0.12;
            a.gain.setValueAtTime(0.0001, t);
            a.gain.linearRampToValueAtTime(0.28, t + 0.15);
            a.gain.linearRampToValueAtTime(0.35, t + 0.95);
            a.gain.exponentialRampToValueAtTime(0.0001, t + 1.05);
            l.connect(lg); lg.connect(a.gain);
            o.connect(a); o2.connect(a); a.connect(c.out);
            [o, o2, l].forEach(n => { n.start(t); n.stop(t + 1.1); });
            // resolving major chord (C major, up an octave)
            [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
                tone(c, t + 1.0 + i * 0.02, f, 1.0, 0.18, 'sine', 0, 0.02);
                tone(c, t + 1.0 + i * 0.02, f * 2.003, 0.7, 0.05, 'sine', 0, 0.02);
            });
            puff(c, t + 1.0, 6000, 1, 0.3, 0.05, 'highpass', 0, 0.02);
        },
    },
];
