// Ember Cage forge sounds: bellows blowout + shattered blade (nat 1), hammer strikes + sword draw (nat 20).
const env = (g, t, pts) => { g.gain.setValueAtTime(0.0001, t); for (const [dt, v] of pts) g.gain.linearRampToValueAtTime(Math.max(v, 0.0001), t + dt); };
// filtered noise burst: pts = [[dt, gain]...]; f = [startHz, endHz]
function nz(c, t, dur, type, f, q, pts, gain = 1) {
    const s = c.ac.createBufferSource(); s.buffer = c.noise; s.loop = true;
    const fl = c.ac.createBiquadFilter(); fl.type = type; fl.Q.value = q;
    fl.frequency.setValueAtTime(f[0], t); fl.frequency.exponentialRampToValueAtTime(f[1], t + dur);
    const g = c.ac.createGain(); env(g, t, pts.map(([d, v]) => [d, v * gain]));
    s.connect(fl); fl.connect(g); g.connect(c.out); s.start(t); s.stop(t + dur + 0.05);
}
// oscillator with pitch glide and attack/decay
function tone(c, type, f, t, dur, peak, att = 0.005) {
    const o = c.ac.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f[0], t); o.frequency.exponentialRampToValueAtTime(f[1], t + dur);
    const g = c.ac.createGain(); env(g, t, [[att, peak], [dur, 0.0001]]);
    o.connect(g); g.connect(c.out); o.start(t); o.stop(t + dur + 0.05);
}
// inharmonic metal ring
function ring(c, t, base, dur, peak, ratios = [1, 2.76, 5.4, 8.93]) {
    ratios.forEach((r, i) => tone(c, 'sine', [base * r, base * r * 0.998], t, dur / (1 + i * 0.6), peak / (1 + i * 0.5), 0.002));
}
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

const sounds = {
    nat1: [
        { key: 'a06-bellows-blowout', name: 'Bellows Blowout', blurb: 'Bellows pump faster and harder until the forge blows out in a boom, then a quench-steam hiss.',
          play(c) {
            const { t0, hit } = c, n = 5;
            for (let i = 0; i < n; i++) { // pulses speed up and swell
                const a = t0 + (hit - t0) * (1 - Math.pow(1 - i / n, 1.5)), d = Math.max(0.1, (hit - a) / (n - i) * 0.95);
                nz(c, a, d, 'bandpass', [350 + i * 150, 1200 + i * 500], 1.2, [[d * 0.45, 0.25 + i * 0.1], [d, 0.01]]);
            }
            tone(c, 'triangle', [60, 140], t0, hit - t0, 0.3, 0.2);
            nz(c, hit, 0.9, 'lowpass', [3500, 90], 0.7, [[0.01, 1.3], [0.9, 0.001]]);
            tone(c, 'sine', [140, 30], hit, 1.0, 1.0, 0.004);
            nz(c, hit + 0.1, 1.9, 'highpass', [5000, 2500], 0.5, [[0.15, 0.4], [1.9, 0.001]]);
            nz(c, hit + 0.1, 1.6, 'bandpass', [900, 300], 0.8, [[0.1, 0.5], [1.6, 0.001]]);
          } },
        { key: 'a06-shattered-blade', name: 'Shattered Blade', blurb: 'A blade rings higher as it overheats, cracks bright, and scatters in tinkling shards.',
          play(c) {
            const { t0, hit } = c; seed = 11;
            tone(c, 'sine', [900, 2600], t0, hit - t0, 0.35, 0.15);
            tone(c, 'sine', [905, 2640], t0, hit - t0, 0.25, 0.15);
            nz(c, t0, hit - t0, 'bandpass', [400, 3000], 4, [[hit - t0, 0.25]]);
            nz(c, hit, 0.25, 'highpass', [2500, 6000], 0.7, [[0.002, 1.3], [0.25, 0.001]]);
            ring(c, hit, 1500, 1.2, 0.45, [1, 1.51, 2.76, 4.1]);
            tone(c, 'sine', [110, 45], hit, 0.5, 0.9, 0.003);
            for (let i = 0; i < 26; i++) { // scattering shards
                const t = hit + 0.04 + Math.pow(rnd(), 1.6) * 1.8, f = 2500 + rnd() * 5500;
                tone(c, 'sine', [f, f * 0.98], t, 0.12 + rnd() * 0.25, 0.14 + rnd() * 0.12, 0.001);
            }
            nz(c, hit, 1.2, 'lowpass', [2500, 200], 0.5, [[0.02, 0.8], [1.2, 0.001]]);
          } },
    ],
    nat20: [
        { key: 'a06-three-hammer-strikes', name: 'Three Hammer Strikes', blurb: 'Three rising anvil strikes, the last ringing out huge over a fire roar.',
          play(c) {
            const { t0, hit } = c, gap = (hit - t0) / 3;
            [[hit - 2 * gap, 520, 0.4], [hit - gap, 620, 0.55], [hit, 780, 0.9]].forEach(([t, f, p], i) => {
                nz(c, t, 0.05, 'bandpass', [3000, 3000], 1, [[0.002, 0.8 + i * 0.2], [0.05, 0.001]]);
                tone(c, 'sine', [120, 60], t, 0.15, 0.5 + i * 0.2, 0.002);
                ring(c, t, f, i === 2 ? 1.7 : 0.5, p * 0.5);
            });
            nz(c, hit - gap, 1.9 + gap, 'lowpass', [300, 1400], 0.8, [[gap, 0.2], [gap + 0.15, 0.6], [1.9 + gap, 0.001]]);
            nz(c, hit, 1.8, 'highpass', [3000, 6000], 0.6, [[0.05, 0.25], [1.8, 0.001]]);
            tone(c, 'sine', [1560, 1566], hit, 1.8, 0.15, 0.01);
          } },
        { key: 'a06-sword-drawn', name: 'Sword Drawn', blurb: 'A rising metal scrape from the sheath ends in a gleaming shing and a flare of flame.',
          play(c) {
            const { t0, hit } = c, d = hit - t0;
            nz(c, t0, d, 'bandpass', [600, 5000], 5, [[d * 0.7, 0.7], [d, 0.9]]);
            nz(c, t0, d, 'bandpass', [1200, 7000], 8, [[d, 0.4]]);
            tone(c, 'triangle', [300, 1500], t0, d, 0.2, 0.1);
            nz(c, hit, 0.12, 'highpass', [4000, 4000], 0.7, [[0.002, 1.0], [0.12, 0.001]]);
            [2093, 3136, 4186, 6272].forEach((f, i) => tone(c, 'sine', [f, f], hit, 2.0 - i * 0.3, 0.4 / (1 + i * 0.4), 0.003));
            tone(c, 'sine', [90, 70], hit, 0.6, 0.6, 0.005);
            nz(c, hit, 2.2, 'lowpass', [400, 2200], 0.8, [[0.25, 0.9], [2.2, 0.001]]);
            nz(c, hit + 0.1, 1.6, 'highpass', [4500, 7000], 0.5, [[0.2, 0.3], [1.6, 0.001]]);
          } },
    ],
};

// master trim so peaks stay under 0.9 after the compressor
const trim = (c) => { const m = c.ac.createGain(); m.gain.value = 0.4; m.connect(c.out); return { ...c, out: m }; };
for (const list of Object.values(sounds)) for (const s of list) { const p = s.play; s.play = (c) => p(trim(c)); }
export default sounds;
