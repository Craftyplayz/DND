// Thirty-four sound mockups for the dice: each has throw (as the dice leave the hand) and hit (every bump while they roll), in the same shape as a set's sound.
// hit ctx: { ac, out, noise, vol 0-1, onTable, t }; throw ctx: { ac, out, noise, t, count }. Everything is scheduled from ctx.t.
const env = (ac, at, peak, a, d) => { const g = ac.createGain(); g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(Math.max(0.0002, peak), at + a); g.gain.exponentialRampToValueAtTime(0.0001, at + a + d); return g; };
const nz = (ac, noise, at, dur) => { const s = ac.createBufferSource(); s.buffer = noise; s.loop = true; s.start(at, Math.random() * 0.3); s.stop(at + dur + 0.02); return s; };
const filt = (ac, type, f, q = 1) => { const b = ac.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
const osc = (ac, at, f, dur, type = 'sine') => { const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, at); o.start(at); o.stop(at + dur + 0.02); return o; };
const chain = (...n) => { for (let i = 0; i < n.length - 1; i++) n[i].connect(n[i + 1]); };
const r = (a, b) => a + Math.random() * (b - a);
// a filtered noise click: the basic "die touches something"
const click = (c, at, f, q, peak, d) => chain(nz(c.ac, c.noise, at, d + 0.01), filt(c.ac, 'bandpass', f, q), env(c.ac, at, peak, 0.002, d), c.out);
// a sine that drops in pitch: weight landing
const thump = (c, at, f1, f2, peak, d) => { const o = osc(c.ac, at, f1, d); o.frequency.exponentialRampToValueAtTime(f2, at + d); chain(o, env(c.ac, at, peak, 0.003, d), c.out); };
// a ringing tone made of partials: metal or glass
const ring = (c, at, base, parts, peak, d, type = 'sine') => { const g = env(c.ac, at, peak, 0.002, d); g.connect(c.out);
    parts.forEach(([m, v]) => { const o = osc(c.ac, at, base * m, d, type), og = c.ac.createGain(); og.gain.value = v; chain(o, og, g); }); };
// a burst of noise swept through a filter: air, cloth, fire
const sweep = (c, at, type, f1, f2, q, peak, d) => { const f = filt(c.ac, type, f1, q); f.frequency.exponentialRampToValueAtTime(f2, at + d);
    chain(nz(c.ac, c.noise, at, d), f, env(c.ac, at, peak, d * 0.35, d * 0.65), c.out); };
// many small clicks spread over a time: dice rattling together
const rattle = (c, at, n, span, f1, f2, peak, lp) => { for (let i = 0; i < n; i++) { const tt = at + Math.random() * span;
    const s = nz(c.ac, c.noise, tt, 0.03), b = filt(c.ac, 'bandpass', r(f1, f2), 3), g = env(c.ac, tt, peak * r(0.5, 1), 0.001, 0.025);
    lp ? chain(s, b, filt(c.ac, 'lowpass', lp), g, c.out) : chain(s, b, g, c.out); } };

// a room: one short reverb per audio context, made once from decaying noise
const rooms = new WeakMap();
const room = (c) => { if (!rooms.has(c.ac)) { const ac = c.ac, n = ac.sampleRate * 1.1, ir = ac.createBuffer(2, n, ac.sampleRate);
        for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 3; }
        const cv = ac.createConvolver(), wet = ac.createGain(); cv.buffer = ir; wet.gain.value = 0.5; cv.connect(wet).connect(c.out); rooms.set(ac, cv); }
    return { ...c, out: rooms.get(c.ac) }; };
// metal grinding: noise through a few narrow inharmonic resonances
const grind = (c, at, base, peak, d) => { const g = env(c.ac, at, peak, d * 0.3, d * 0.7); g.connect(c.out);
    for (const m of [1, 1.47, 2.09, 2.83]) { const f = filt(c.ac, 'bandpass', base * m, 30); chain(nz(c.ac, c.noise, at, d), f, g); } };

export default [
    {
        key: 'felt', name: 'Felt mat', blurb: 'Soft, muffled thuds like dice on a cloth playmat; a quiet swish of cloth on the throw.',
        throw: (c) => sweep(c, c.t, 'bandpass', 350, 900, 0.8, 0.3, 0.32),
        hit: (c) => c.onTable ? (click(c, c.t, 500, 0.7, c.vol * 0.5, 0.06), thump(c, c.t, 95, 60, c.vol * 0.35, 0.08)) : click(c, c.t, 2000, 2, c.vol * 0.25, 0.03),
    },
    {
        key: 'wood', name: 'Wooden tray', blurb: 'Hollow wooden clacks with a little body to them; a short rattle in the hand as they go.',
        throw: (c) => rattle(c, c.t, 6, 0.22, 2200, 3200, 0.3),
        hit: (c) => { const f = c.onTable ? r(800, 1000) : r(2800, 3400); click(c, c.t, f, 4, c.vol * 0.55, 0.05);
            if (c.onTable) ring(c, c.t, r(200, 240), [[1, 1], [2.3, 0.3]], c.vol * 0.25, 0.12); },
    },
    {
        key: 'hands', name: 'Shaken in hands', blurb: 'Dice shaken in cupped hands before they fly, then crisp resin clicks on a hard table.',
        throw: (c) => { rattle(c, c.t, 14, 0.42, 3000, 4500, 0.4, 2600); sweep(c, c.t + 0.4, 'highpass', 1500, 3500, 0.7, 0.08, 0.18); },
        hit: (c) => { click(c, c.t, 4200, 1.2, c.vol * 0.55, 0.022); click(c, c.t, 1200, 1.5, c.vol * (c.onTable ? 0.3 : 0.12), 0.04); },
    },
    {
        key: 'glass', name: 'Glass table', blurb: 'Bright, glassy tinks that ring briefly; a quick airy swish on the throw.',
        throw: (c) => sweep(c, c.t, 'highpass', 2500, 6000, 0.7, 0.1, 0.18),
        hit: (c) => { ring(c, c.t, r(2300, 2900) * (c.onTable ? 1 : 1.3), [[1, 1], [1.59, 0.4], [2.71, 0.2]], c.vol * 0.22, c.onTable ? 0.25 : 0.35); click(c, c.t, 5000, 1, c.vol * 0.2, 0.01); },
    },
    {
        key: 'metal', name: 'Metal dice on stone', blurb: 'Heavy clanks with a metal ring; two clinks in the palm on the throw.',
        throw: (c) => { ring(c, c.t, 1500, [[1, 1], [2.76, 0.4]], 0.08, 0.3); ring(c, c.t + 0.09, 1750, [[1, 1], [2.76, 0.4]], 0.07, 0.3); },
        hit: (c) => { ring(c, c.t, r(600, 750) * (c.onTable ? 1 : 2), [[1, 1], [2.76, 0.45], [5.4, 0.2]], c.vol * 0.3, c.onTable ? 0.3 : 0.5);
            if (c.onTable) thump(c, c.t, 120, 70, c.vol * 0.35, 0.07); },
    },
    {
        key: 'cup', name: 'Leather dice cup', blurb: 'A muffled rattle in a leather cup, slapped down; firm, medium clacks as they roll.',
        throw: (c) => { rattle(c, c.t, 10, 0.45, 1500, 2600, 0.45, 1400); thump(c, c.t + 0.5, 80, 50, 0.4, 0.12); click(c, c.t + 0.5, 300, 0.7, 0.3, 0.08); },
        hit: (c) => { click(c, c.t, c.onTable ? 1600 : 2800, 3, c.vol * 0.5, 0.04); if (c.onTable) ring(c, c.t, 160, [[1, 1]], c.vol * 0.2, 0.06); },
    },
    {
        key: 'hearth', name: 'Ember hearth', blurb: 'Low iron thunks with a crackle of embers; a soft, low fwoomp of fire on the throw instead of a bright whoosh.',
        throw: (c) => { const f = filt(c.ac, 'lowpass', 200, 0.8); f.frequency.exponentialRampToValueAtTime(1100, c.t + 0.18); f.frequency.exponentialRampToValueAtTime(250, c.t + 0.55);
            chain(nz(c.ac, c.noise, c.t, 0.6), f, env(c.ac, c.t, 0.3, 0.12, 0.45), c.out); thump(c, c.t, 70, 45, 0.25, 0.4); },
        hit: (c) => { thump(c, c.t, c.onTable ? 160 : 320, c.onTable ? 90 : 200, c.vol * 0.4, 0.12); click(c, c.t, 900, 1, c.vol * 0.25, 0.07);
            for (let i = 0; i < 2; i++) click(c, c.t + r(0.02, 0.14), 5000, 1, c.vol * 0.12, 0.012); },
    },
    {
        key: 'whisper', name: 'Whisper quiet', blurb: 'Barely-there soft ticks so rolling never gets in the way; no sound on the throw.',
        throw: () => { },
        hit: (c) => click(c, c.t, c.onTable ? 2500 : 4000, 1.5, c.vol * 0.16, 0.02),
    },
    {
        key: 'arcade', name: 'Arcade', blurb: 'Little game-like blips that rise with each harder hit; a rising chirp on the throw.',
        throw: (c) => { const o = osc(c.ac, c.t, 300, 0.16, 'square'); o.frequency.exponentialRampToValueAtTime(1200, c.t + 0.15); chain(o, filt(c.ac, 'lowpass', 3000), env(c.ac, c.t, 0.14, 0.01, 0.15), c.out); },
        hit: (c) => { const o = osc(c.ac, c.t, (c.onTable ? 260 : 520) + c.vol * 700, 0.07, c.onTable ? 'square' : 'triangle'); chain(o, filt(c.ac, 'lowpass', 2500), env(c.ac, c.t, c.vol * 0.1, 0.002, 0.06), c.out); },
    },
    {
        key: 'real', name: 'Realistic resin', blurb: 'A sharp click with a low table knock under it, like real plastic dice on a wooden table; a quick rattle and swish as they leave the hand.',
        throw: (c) => { rattle(c, c.t, 4, 0.08, 3000, 4200, 0.3); sweep(c, c.t + 0.05, 'bandpass', 600, 1800, 0.8, 0.18, 0.2); },
        hit: (c) => { click(c, c.t, r(3200, 3900), 1, c.vol * 0.5, 0.02); click(c, c.t, 420, 1, c.vol * (c.onTable ? 0.35 : 0.1), 0.05);
            if (c.onTable) thump(c, c.t, 115, 85, c.vol * 0.25, 0.09); },
    },
    {
        key: 'steel', name: 'Heavy steel', blurb: 'Dense steel dice: a deep, weighty thunk with a short dull clank, no long ring; two heavy clunks in the hand on the throw.',
        throw: (c) => { for (const dt of [0, 0.11]) { ring(c, c.t + dt, r(380, 440), [[1, 1], [2.4, 0.5], [4.1, 0.2]], 0.16, 0.09); thump(c, c.t + dt, 110, 70, 0.25, 0.06); } },
        hit: (c) => { thump(c, c.t, c.onTable ? 85 : 140, c.onTable ? 45 : 90, c.vol * 0.6, 0.14);
            ring(c, c.t, r(320, 400) * (c.onTable ? 1 : 1.8), [[1, 1], [2.4, 0.6], [4.1, 0.3], [6.3, 0.12]], c.vol * 0.32, c.onTable ? 0.1 : 0.16);
            click(c, c.t, 1800, 1.5, c.vol * 0.25, 0.02); },
    },
    {
        key: 'brass', name: 'Heavy brass bells', blurb: 'Big solid-brass dice that clang and ring out with a slow shimmer; metal grinding against metal as they leave the hand.',
        throw: (c) => { grind(c, c.t, r(900, 1100), 0.7, 0.4); ring(c, c.t + 0.38, 820, [[1, 1], [2.76, 0.4]], 0.08, 0.6); },
        hit: (c) => { const b = r(260, 330) * (c.onTable ? 1 : 1.6);
            // two slightly detuned copies beat against each other like a big bell
            ring(c, c.t, b, [[1, 1], [2.32, 0.55], [3.98, 0.3], [5.85, 0.15]], c.vol * 0.24, c.onTable ? 0.9 : 1.2);
            ring(c, c.t, b * 1.006, [[1, 0.7], [2.32, 0.3]], c.vol * 0.16, c.onTable ? 0.9 : 1.2);
            thump(c, c.t, 100, 55, c.vol * 0.45, 0.1); },
    },
    {
        key: 'bone', name: 'Bone dice', blurb: 'Dry, hollow little clicks like carved bone; a light bony rattle on the throw.',
        throw: (c) => rattle(c, c.t, 8, 0.3, 1800, 2600, 0.3),
        hit: (c) => { click(c, c.t, r(1700, 2300) * (c.onTable ? 1 : 1.4), 6, c.vol * 1.5, 0.04); click(c, c.t, 600, 2, c.vol * 0.15, 0.03); },
    },
    {
        key: 'stone', name: 'Carved stone', blurb: 'Gritty, solid stone knocks with a bit of scrape; a rough grind as they slide off the hand.',
        throw: (c) => sweep(c, c.t, 'bandpass', 900, 500, 1.5, 0.25, 0.3),
        hit: (c) => { click(c, c.t, r(1200, 1500), 2, c.vol * 0.5, 0.05); sweep(c, c.t, 'bandpass', 2500, 1200, 2, c.vol * 0.15, 0.08);
            if (c.onTable) thump(c, c.t, 130, 80, c.vol * 0.3, 0.07); },
    },
    {
        key: 'chime', name: 'Crystal chimes', blurb: 'Every bump plays a soft note from a gentle scale, so a roll becomes a little tune; a rising sparkle on the throw.',
        throw: (c) => [0, 0.06, 0.12, 0.18].forEach((dt, i) => ring(c, c.t + dt, [1046.5, 1318.5, 1568, 2093][i], [[1, 1], [2, 0.2]], 0.08, 0.4)),
        hit: (c) => { const n = [523.25, 587.33, 659.25, 783.99, 880, 1046.5][(Math.random() * 6) | 0] * (c.onTable ? 1 : 2);
            ring(c, c.t, n, [[1, 1], [2.01, 0.25], [3.01, 0.08]], c.vol * 0.2, 0.7); },
    },
    {
        key: 'bouncy', name: 'Bouncy rubber', blurb: 'Soft rubbery boings that bend up in pitch; a springy twang on the throw.',
        throw: (c) => { const o = osc(c.ac, c.t, 140, 0.35, 'triangle'); o.frequency.exponentialRampToValueAtTime(420, c.t + 0.3); chain(o, env(c.ac, c.t, 0.18, 0.01, 0.32), c.out); },
        hit: (c) => { const o = osc(c.ac, c.t, (c.onTable ? 110 : 220) * (1 + c.vol * 0.5), 0.14, 'sine'); o.frequency.exponentialRampToValueAtTime((c.onTable ? 260 : 480) * (1 + c.vol * 0.3), c.t + 0.1);
            chain(o, env(c.ac, c.t, c.vol * 0.4, 0.003, 0.13), c.out); },
    },
    {
        key: 'sparkle', name: 'Magic sparkle', blurb: 'A soft click with a twinkle of fairy dust on each bump; a whoosh full of sparkles on the throw.',
        throw: (c) => { sweep(c, c.t, 'bandpass', 800, 4000, 1, 0.15, 0.35); for (let i = 0; i < 8; i++) ring(c, c.t + r(0.05, 0.4), r(3000, 6000), [[1, 1]], 0.04, 0.15); },
        hit: (c) => { click(c, c.t, 3000, 1.2, c.vol * 0.3, 0.02); for (let i = 0; i < 3; i++) ring(c, c.t + r(0, 0.12), r(3500, 7000), [[1, 1]], c.vol * 0.06, 0.12); },
    },
    {
        key: 'tavern', name: 'Tavern table', blurb: 'Solid knocks on a thick oak table with the echo of a busy room around them; a rattle and swish that echo too.',
        throw: (c) => { const w = room(c); rattle(w, c.t, 6, 0.15, 2500, 3500, 0.3); rattle(c, c.t, 6, 0.15, 2500, 3500, 0.2); sweep(c, c.t + 0.1, 'bandpass', 700, 1600, 0.8, 0.12, 0.2); },
        hit: (c) => { const w = room(c), f = c.onTable ? r(700, 850) : r(2600, 3100);
            click(c, c.t, f, 3, c.vol * 0.5, 0.05); click(w, c.t, f, 3, c.vol * 0.4, 0.05); if (c.onTable) thump(c, c.t, 140, 90, c.vol * 0.3, 0.08); },
    },
    {
        key: 'ice', name: 'Ice cubes', blurb: 'Clinks and crunches like ice cubes knocking in a glass; a cold rattle on the throw.',
        throw: (c) => { rattle(c, c.t, 7, 0.25, 3500, 5500, 0.25); },
        hit: (c) => { ring(c, c.t, r(1800, 2400) * (c.onTable ? 1 : 1.4), [[1, 1], [2.3, 0.3]], c.vol * 0.15, 0.12);
            if (c.onTable) sweep(c, c.t, 'highpass', 3000, 6000, 0.8, c.vol * 0.25, 0.07); },
    },
    {
        key: 'cinema', name: 'Cinematic', blurb: 'Big, deep booms on the hard hits like a film trailer, softer taps on the small ones; a long, low whoosh on the throw.',
        throw: (c) => { sweep(c, c.t, 'lowpass', 200, 1500, 0.7, 0.35, 0.7); thump(c, c.t + 0.1, 60, 35, 0.3, 0.6); },
        hit: (c) => { if (c.vol > 0.4) { thump(c, c.t, 75, 32, c.vol * 0.7, 0.45); sweep(c, c.t, 'lowpass', 900, 150, 0.7, c.vol * 0.35, 0.4); }
            click(c, c.t, c.onTable ? 1200 : 2600, 2, c.vol * 0.35, 0.04); },
    },
    // ---- metal dice: ten more, each a different metal ----
    {
        key: 'anvil', name: 'Iron anvil', blurb: 'A hard, bright strike like a hammer on an anvil: a sharp ping over a solid iron body.',
        throw: (c) => ring(c, c.t, 1900, [[1, 1], [2.4, 0.3]], 0.3, 0.25),
        hit: (c) => { ring(c, c.t, r(1700, 2100) * (c.onTable ? 1 : 1.3), [[1, 1], [2.4, 0.5], [3.9, 0.25]], c.vol * 0.25, 0.3);
            click(c, c.t, 3500, 1, c.vol * 0.35, 0.012); if (c.onTable) thump(c, c.t, 150, 90, c.vol * 0.35, 0.06); },
    },
    {
        key: 'skillet', name: 'Cast iron', blurb: 'Thick cast iron: a dull, chunky clonk with only a short, low ring.',
        throw: (c) => { ring(c, c.t, 420, [[1, 1], [2.1, 0.4]], 0.14, 0.1); ring(c, c.t + 0.1, 470, [[1, 1], [2.1, 0.4]], 0.12, 0.1); },
        hit: (c) => { ring(c, c.t, r(260, 320) * (c.onTable ? 1 : 1.5), [[1, 1], [2.1, 0.5], [3.3, 0.2]], c.vol * 0.35, 0.16);
            click(c, c.t, 900, 1.2, c.vol * 0.3, 0.05); },
    },
    {
        key: 'aluminium', name: 'Hollow aluminium', blurb: 'Light, hollow metal dice: tinny high plinks that stop almost at once.',
        throw: (c) => rattle(c, c.t, 5, 0.15, 4000, 5500, 0.25),
        hit: (c) => { ring(c, c.t, r(2800, 3400) * (c.onTable ? 1 : 1.25), [[1, 1], [1.8, 0.5], [3.1, 0.3]], c.vol * 0.22, 0.07);
            click(c, c.t, 5000, 1, c.vol * 0.25, 0.01); },
    },
    {
        key: 'copper', name: 'Warm copper', blurb: 'Soft, mellow copper with a rounded attack and a warm ring that fades gently.',
        throw: (c) => sweep(c, c.t, 'bandpass', 500, 1200, 1, 0.35, 0.25),
        hit: (c) => { const g = env(c.ac, c.t, c.vol * 0.28, 0.008, 0.45); g.connect(c.out);
            for (const [m, v] of [[1, 1], [2.02, 0.35], [3.5, 0.1]]) { const o = osc(c.ac, c.t, r(520, 600) * (c.onTable ? 1 : 1.4) * m, 0.46, 'triangle'), og = c.ac.createGain(); og.gain.value = v; chain(o, og, g); }
            if (c.onTable) thump(c, c.t, 120, 80, c.vol * 0.25, 0.07); },
    },
    {
        key: 'silver', name: 'Silver bells', blurb: 'Pure, sweet silver: high, clean notes that ring out long and clear.',
        throw: (c) => { ring(c, c.t, 2349, [[1, 1], [2, 0.2]], 0.07, 0.5); ring(c, c.t + 0.08, 2793, [[1, 1], [2, 0.2]], 0.06, 0.5); },
        hit: (c) => ring(c, c.t, [1568, 1760, 2093, 2349][(Math.random() * 4) | 0] * (c.onTable ? 1 : 1.5), [[1, 1], [2, 0.18], [3, 0.05]], c.vol * 0.2, c.onTable ? 0.8 : 1.1),
    },
    {
        key: 'titanium', name: 'Titanium', blurb: 'Hard, precise and modern: a crisp, clean click with a very short bright ring.',
        throw: (c) => sweep(c, c.t, 'highpass', 3000, 7000, 0.7, 0.1, 0.12),
        hit: (c) => { click(c, c.t, r(4500, 5500), 2, c.vol * 0.45, 0.012);
            ring(c, c.t, r(3600, 4200) * (c.onTable ? 1 : 1.2), [[1, 1], [1.63, 0.4]], c.vol * 0.14, 0.12); },
    },
    {
        key: 'tungsten', name: 'Tungsten', blurb: 'Incredibly dense and heavy: a very deep thud that you feel more than hear, with almost no ring.',
        throw: (c) => { thump(c, c.t, 90, 55, 0.35, 0.1); thump(c, c.t + 0.12, 85, 50, 0.3, 0.1); },
        hit: (c) => { thump(c, c.t, c.onTable ? 70 : 120, c.onTable ? 35 : 70, c.vol * 0.75, 0.16);
            ring(c, c.t, r(220, 260), [[1, 1], [2.6, 0.3]], c.vol * 0.12, 0.06); click(c, c.t, 700, 1, c.vol * 0.25, 0.04); },
    },
    // ---- heavier, louder takes on tungsten ----
    {
        key: 'tungsten2', name: 'Heavy tungsten', blurb: 'Tungsten, louder and deeper: a bigger thud with more weight behind it and a dull knock on top.',
        throw: (c) => { for (const dt of [0, 0.12]) { thump(c, c.t + dt, 75, 40, 0.5, 0.14); chain(nz(c.ac, c.noise, c.t + dt, 0.1), filt(c.ac, 'lowpass', 350), env(c.ac, c.t + dt, 0.35, 0.003, 0.09), c.out); } },
        hit: (c) => { thump(c, c.t, c.onTable ? 58 : 100, c.onTable ? 28 : 55, c.vol * 1, 0.22);
            chain(nz(c.ac, c.noise, c.t, 0.12), filt(c.ac, 'lowpass', 420), env(c.ac, c.t, c.vol * 0.5, 0.002, 0.1), c.out);
            ring(c, c.t, r(170, 200), [[1, 1], [2.6, 0.3]], c.vol * 0.14, 0.05); click(c, c.t, 550, 1, c.vol * 0.35, 0.03); },
    },
    {
        key: 'tungsten3', name: 'Tungsten slab', blurb: 'The heaviest: every landing has a deep sub-bass thump that rumbles into the table, like dropping a lead weight.',
        throw: (c) => { thump(c, c.t, 65, 32, 0.55, 0.2); thump(c, c.t + 0.13, 60, 30, 0.5, 0.2); },
        hit: (c) => { thump(c, c.t, c.onTable ? 52 : 95, c.onTable ? 24 : 50, c.vol * 1, 0.26);
            if (c.onTable) { thump(c, c.t + 0.01, 38, 22, c.vol * 0.7, 0.32); chain(nz(c.ac, c.noise, c.t, 0.3), filt(c.ac, 'lowpass', 180), env(c.ac, c.t, c.vol * 0.6, 0.01, 0.28), c.out); }
            click(c, c.t, 450, 1, c.vol * 0.35, 0.04); },
    },
    {
        key: 'tungsten4', name: 'Tungsten clank', blurb: 'Heavy tungsten with a little dull metal edge: a deep thud with a short, low clank on top.',
        throw: (c) => { for (const dt of [0, 0.11]) { thump(c, c.t + dt, 80, 45, 0.45, 0.12); ring(c, c.t + dt, 300, [[1, 1], [2.6, 0.4]], 0.14, 0.08); } },
        hit: (c) => { thump(c, c.t, c.onTable ? 62 : 110, c.onTable ? 30 : 60, c.vol * 0.95, 0.2);
            ring(c, c.t, r(240, 290) * (c.onTable ? 1 : 1.4), [[1, 1], [2.6, 0.45], [4.3, 0.15]], c.vol * 0.28, 0.1); click(c, c.t, 800, 1.2, c.vol * 0.3, 0.03); },
    },
    {
        key: 'tungsten5', name: 'Tungsten on oak', blurb: 'Heavy tungsten landing on a thick oak table: a deep thud with the table knocking back under it.',
        throw: (c) => { for (const dt of [0, 0.12]) thump(c, c.t + dt, 80, 42, 0.45, 0.13); },
        hit: (c) => { thump(c, c.t, c.onTable ? 60 : 105, c.onTable ? 30 : 58, c.vol * 0.95, 0.2);
            if (c.onTable) { click(c, c.t, r(320, 380), 4, c.vol * 0.6, 0.09); ring(c, c.t, r(130, 150), [[1, 1], [2.3, 0.3]], c.vol * 0.25, 0.14); }
            else click(c, c.t, 900, 2, c.vol * 0.35, 0.04); },
    },
    {
        key: 'chainmail', name: 'Chain mail', blurb: 'Every bump jingles like a handful of tiny metal rings; a loud jangle on the throw.',
        throw: (c) => { for (let i = 0; i < 14; i++) ring(c, c.t + r(0, 0.35), r(3000, 5500), [[1, 1], [1.7, 0.4]], 0.05, 0.08); },
        hit: (c) => { const n = 2 + Math.round(c.vol * 5);
            for (let i = 0; i < n; i++) ring(c, c.t + r(0, 0.07), r(3200, 5600), [[1, 1], [1.7, 0.4]], c.vol * 0.1, 0.07); },
    },
    {
        key: 'coins', name: 'Gold coins', blurb: 'Clinks like gold coins dropped on a table, with a little spinning wobble as they settle; a pouch of coins on the throw.',
        throw: (c) => { for (let i = 0; i < 9; i++) ring(c, c.t + r(0, 0.3), r(2600, 3600), [[1, 1], [2.3, 0.3]], 0.06, 0.15); },
        hit: (c) => { const f = r(2500, 3200) * (c.onTable ? 1 : 1.2), g = env(c.ac, c.t, c.vol * 0.2, 0.002, 0.35); g.connect(c.out);
            // a coin's ring wobbles as it spins down
            const o = osc(c.ac, c.t, f, 0.36), lfo = osc(c.ac, c.t, 9, 0.36), depth = c.ac.createGain(); depth.gain.value = f * 0.01; chain(lfo, depth, o.frequency); chain(o, g);
            click(c, c.t, 4500, 1, c.vol * 0.2, 0.01); },
    },
    {
        key: 'rusty', name: 'Rusty iron', blurb: 'Old, pitted iron: a gritty, scraping clank with a rough, rattly edge; a dry scrape on the throw.',
        throw: (c) => { grind(c, c.t, 600, 0.4, 0.3); sweep(c, c.t, 'bandpass', 1500, 800, 2, 0.15, 0.3); },
        hit: (c) => { ring(c, c.t, r(500, 650) * (c.onTable ? 1 : 1.5), [[1, 1], [2.2, 0.5], [3.7, 0.3]], c.vol * 0.22, 0.14);
            sweep(c, c.t, 'bandpass', 2200, 900, 3, c.vol * 0.3, 0.09); rattle(c, c.t, 3, 0.05, 2000, 3000, c.vol * 0.2); },
    },
];
