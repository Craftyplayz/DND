// Coin sound profiles, theme "the surface it lands on": tavern bar (damped wood) and glass tabletop (bright pings).
const env = (c, g, t, peak, dur, att = 0.002) => {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + att);
    g.gain.exponentialRampToValueAtTime(0.0001, t + att + dur);
};
// Decaying oscillator ping
const tone = (c, t, f, peak, dur, type = 'sine', f2 = 0) => {
    const o = c.ac.createOscillator(), g = c.ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    env(c, g, t, peak, dur);
    o.connect(g); g.connect(c.out);
    o.start(t); o.stop(t + dur + 0.05);
};
// Filtered noise burst; f/f2 sweep the filter frequency
const nz = (c, t, f, q, peak, dur, type = 'bandpass', f2 = 0, att = 0.002) => {
    const s = c.ac.createBufferSource(), b = c.ac.createBiquadFilter(), g = c.ac.createGain();
    s.buffer = c.noise; s.loop = dur > 0.35;
    b.type = type; b.Q.value = q;
    b.frequency.setValueAtTime(f, t);
    if (f2) b.frequency.exponentialRampToValueAtTime(f2, t + dur);
    env(c, g, t, peak, dur, att);
    s.connect(b); b.connect(g); g.connect(c.out);
    s.start(t); s.stop(t + dur + 0.05);
};
// Wobble rattle: hits whose gaps shrink (speed-up) or grow (slow-down); fn(time, strength 0..1)
const rattle = (t, n, g0, ratio, fn) => {
    let x = t, gap = g0;
    for (let i = 0; i < n; i++) { fn(x, 1 - i / n); x += gap; gap *= ratio; }
};

export default [
    {
        key: 'c02-tavern-bar', name: 'Tavern Bar',
        blurb: 'A coin on thick worn wood: a short damped ring over a hollow knock, a soft whir flip and a woody wobble that slows to a final knock.',
        throw(c) {
            const t = c.t;
            nz(c, t, 2500, 1.2, 0.5, 0.05, 'bandpass', 1200);       // thumb flick
            tone(c, t, 2300, 0.18, 0.12, 'triangle', 1500);
            nz(c, t + 0.03, 500, 3, 0.3, 0.55, 'bandpass', 1100, 0.2); // soft whir rising
            tone(c, t + 0.03, 330, 0.12, 0.55, 'sine', 700);
        },
        hit(c) {
            const t = c.t, v = c.vol, w = c.onTable ? 1 : 0.6;
            nz(c, t, 750, 2.5, 0.7 * v * w, 0.07);               // hollow wood knock
            tone(c, t, 160, 0.6 * v * w, 0.09, 'sine', 90);        // low thud
            tone(c, t, 2650, 0.22 * v, 0.14, 'sine');              // short damped ring
            tone(c, t, 3900, 0.1 * v, 0.07, 'sine');
        },
        settle(c) {
            const t = c.t;
            rattle(t, 11, 0.075, 1.17, (x, k) => {
                const a = 0.12 + 0.3 * k;
                nz(c, x, 800, 3, a, 0.04);
                tone(c, x, 2600 - 500 * (1 - k), a * 0.5, 0.08, 'sine');
            });
            const end = t + 1.3;
            nz(c, end, 700, 2.5, 0.35, 0.09);                      // final soft knock
            tone(c, end, 140, 0.3, 0.12, 'sine', 80);
        },
    },
    {
        key: 'c02-glass-tabletop', name: 'Glass Tabletop',
        blurb: 'A coin on glass: bright high pings with a long shimmer and almost no thud, a bright ting flip and a fast glittery wobble ending in a clear ring.',
        throw(c) {
            const t = c.t;
            tone(c, t, 6200, 0.3, 0.5, 'sine');                    // bright ting
            tone(c, t, 9100, 0.14, 0.3, 'sine');
            tone(c, t, 4100, 0.15, 0.4, 'sine');
            nz(c, t, 5000, 1.5, 0.3, 0.04, 'highpass');            // flick
            nz(c, t + 0.05, 5500, 4, 0.1, 0.5, 'bandpass', 8500, 0.2); // airy spin
        },
        hit(c) {
            const t = c.t, v = c.vol, w = c.onTable ? 1 : 0.7;
            nz(c, t, 5000, 1, 0.3 * v * w, 0.02, 'highpass');      // tick
            tone(c, t, 5300, 0.4 * v * w, 0.45, 'sine');           // glassy partials
            tone(c, t, 7700, 0.25 * v * w, 0.35, 'sine');
            tone(c, t, 10300, 0.12 * v * w, 0.25, 'sine');
            tone(c, t, 280, 0.08 * v, 0.03, 'sine');               // barely any thud
        },
        settle(c) {
            const t = c.t;
            rattle(t, 22, 0.07, 0.93, (x, k) => {
                const f = 5000 + (((x * 977) % 1) * 3000);       // glitter: varying pitch per tick
                tone(c, x, f, 0.1 + 0.2 * k, 0.1, 'sine');
                nz(c, x, 7000, 2, 0.06 + 0.1 * k, 0.015, 'highpass');
            });
            const end = t + 1.0;
            tone(c, end, 5300, 0.35, 0.8, 'sine');                 // clear final ring
            tone(c, end, 7700, 0.2, 0.6, 'sine');
            tone(c, end, 10300, 0.1, 0.4, 'sine');
        },
    },
];
