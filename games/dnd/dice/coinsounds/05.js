// Atmosphere coin sounds: a pirate doubloon on a ship's deck and a cursed haunted coin.
function env(c, g, t, peak, a, d) { // fast attack, exponential decay, then stop point
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}
function tone(c, type, f0, f1, t, dur, peak, a, dest, lp) {
    const o = c.ac.createOscillator(), g = c.ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    env(c, g, t, peak, a, dur);
    let n = o;
    if (lp) { const f = c.ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; o.connect(f); n = f; }
    n.connect(g); g.connect(dest || c.out);
    o.start(t); o.stop(t + a + dur + 0.05);
    return o;
}
function puff(c, ftype, f0, f1, q, t, dur, peak, a, dest) { // filtered noise burst with a sweeping filter
    const s = c.ac.createBufferSource(), f = c.ac.createBiquadFilter(), g = c.ac.createGain();
    s.buffer = c.noise; s.loop = true;
    f.type = ftype; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(f1, t + a + dur);
    env(c, g, t, peak, a, dur);
    s.connect(f); f.connect(g); g.connect(dest || c.out);
    s.start(t); s.stop(t + a + dur + 0.05);
}
function thud(c, t, v, f) { // dull heavy wooden clunk
    tone(c, 'sine', f * 1.6, f, t, 0.16, 0.7 * v, 0.003);
    puff(c, 'lowpass', 700, 200, 0.7, t, 0.07, 0.45 * v, 0.002);
}

export default [
    {
        key: 'c05-doubloon', name: 'Pirate Doubloon',
        blurb: 'A heavy old gold doubloon flipped on ship planks: dull clunks, a low whir and a creaking wobble.',
        throw(c) {
            const t = c.t;
            puff(c, 'bandpass', 3000, 1500, 1.5, t, 0.06, 0.4, 0.004);
            const o = tone(c, 'sawtooth', 70, 180, t + 0.02, 0.55, 0.3, 0.05, c.out, 450);
            const l = c.ac.createOscillator(), lg = c.ac.createGain(); // wobbly whir
            l.frequency.value = 28; lg.gain.value = 12; l.connect(lg); lg.connect(o.frequency);
            l.start(t); l.stop(t + 0.7);
            tone(c, 'triangle', 300, 700, t + 0.05, 0.5, 0.2, 0.08);
        },
        hit(c) {
            const t = c.t, v = c.onTable ? c.vol : c.vol * 0.7;
            thud(c, t, v, c.onTable ? 110 : 160);
            const lp = c.ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400; lp.connect(c.out);
            tone(c, 'sine', 520, 500, t, 0.22, 0.2 * v, 0.003, lp);
            tone(c, 'sine', 810, 790, t, 0.14, 0.12 * v, 0.003, lp);
            setTimeout(() => lp.disconnect(), 800);
        },
        settle(c) {
            const t = c.t;
            [[0, 1], [0.32, 0.75], [0.56, 0.55], [0.73, 0.4], [0.85, 0.3], [0.93, 0.25]]
                .forEach(([d, v]) => thud(c, t + d, v * 0.8, 105 - d * 12));
            thud(c, t + 1.0, 0.9, 80); // final thunk
            // timber creak: wavering sawtooth through a narrow band
            const o = c.ac.createOscillator(), f = c.ac.createBiquadFilter(), g = c.ac.createGain();
            const l = c.ac.createOscillator(), lg = c.ac.createGain();
            o.type = 'sawtooth'; o.frequency.setValueAtTime(95, t + 0.1); o.frequency.linearRampToValueAtTime(70, t + 1.9);
            l.frequency.value = 5; lg.gain.value = 9; l.connect(lg); lg.connect(o.frequency);
            f.type = 'bandpass'; f.frequency.value = 420; f.Q.value = 9;
            g.gain.setValueAtTime(0.0001, t + 0.1);
            g.gain.linearRampToValueAtTime(0.35, t + 0.6);
            g.gain.linearRampToValueAtTime(0.0001, t + 2.0);
            o.connect(f); f.connect(g); g.connect(c.out);
            o.start(t + 0.1); o.stop(t + 2.1); l.start(t); l.stop(t + 2.1);
        },
    },
    {
        key: 'c05-cursed', name: 'Cursed Coin',
        blurb: 'A haunted coin: echoing hollow rings with whispers, a ghostly whoosh and a pitch-bending fade into a low hum.',
        throw(c) {
            const t = c.t;
            puff(c, 'bandpass', 500, 2200, 3, t, 0.5, 0.55, 0.15);
            puff(c, 'bandpass', 1800, 700, 4, t + 0.25, 0.4, 0.25, 0.1);
            const o = tone(c, 'sine', 320, 620, t, 0.6, 0.22, 0.2);
            const l = c.ac.createOscillator(), lg = c.ac.createGain();
            l.frequency.value = 7; lg.gain.value = 14; l.connect(lg); lg.connect(o.frequency);
            l.start(t); l.stop(t + 0.9);
        },
        hit(c) {
            const t = c.t, v = c.onTable ? c.vol : c.vol * 0.7;
            const lp = c.ac.createBiquadFilter(), d = c.ac.createDelay(0.5), fb = c.ac.createGain(), dl = c.ac.createBiquadFilter();
            lp.type = 'lowpass'; lp.frequency.value = 2200;
            dl.type = 'lowpass'; dl.frequency.value = 1100;
            d.delayTime.value = 0.11; fb.gain.value = 0.42;
            lp.connect(c.out); lp.connect(d); d.connect(dl); dl.connect(fb); fb.connect(d); dl.connect(c.out);
            tone(c, 'sine', 640, 620, t, 0.4, 0.4 * v, 0.003, lp);
            tone(c, 'sine', 1010, 980, t, 0.25, 0.18 * v, 0.003, lp);
            tone(c, 'sine', 160, 130, t, 0.1, 0.35 * v, 0.003, lp);
            puff(c, 'bandpass', 3000, 1800, 2, t + 0.02, 0.3, 0.14 * v, 0.05, lp);
            setTimeout(() => { lp.disconnect(); dl.disconnect(); fb.disconnect(); d.disconnect(); }, 2500);
        },
        settle(c) {
            const t = c.t;
            const o = c.ac.createOscillator(), g = c.ac.createGain(), l = c.ac.createOscillator(), lg = c.ac.createGain();
            o.type = 'sine'; o.frequency.setValueAtTime(700, t); o.frequency.exponentialRampToValueAtTime(300, t + 1.6);
            l.frequency.value = 6; lg.gain.value = 8; l.connect(lg); lg.connect(o.frequency);
            env(c, g, t, 0.5, 0.005, 1.7);
            o.connect(g); g.connect(c.out);
            o.start(t); o.stop(t + 1.8); l.start(t); l.stop(t + 1.8);
            tone(c, 'sine', 1100, 520, t, 1.0, 0.15, 0.005);
            // low ominous hum
            const h = c.ac.createOscillator(), h2 = c.ac.createOscillator(), hg = c.ac.createGain();
            h.type = 'sine'; h.frequency.value = 55; h2.type = 'triangle'; h2.frequency.value = 82.5;
            hg.gain.setValueAtTime(0.0001, t + 0.3);
            hg.gain.linearRampToValueAtTime(0.4, t + 1.2);
            hg.gain.linearRampToValueAtTime(0.0001, t + 2.5);
            h.connect(hg); h2.connect(hg); hg.connect(c.out);
            h.start(t + 0.3); h.stop(t + 2.6); h2.start(t + 0.3); h2.stop(t + 2.6);
            puff(c, 'bandpass', 1400, 600, 1.5, t + 0.9, 1.2, 0.3, 0.5); // whispery exhale
        },
    },
];
