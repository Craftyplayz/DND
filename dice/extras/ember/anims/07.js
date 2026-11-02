// Ember Cage exits 07: fireworks. Nat 1 is a dud fuse that fizzles; nat 20 is a shell launch with a big chrysanthemum and two small bursts.
let TX;
const tex = (T) => TX || (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return (TX = new T.CanvasTexture(c));
})();
// additive that leaves the canvas alpha alone, so dim points never darken the page behind
const addBlend = (m, T) => Object.assign(m, { blending: T.CustomBlending, blendSrc: T.SrcAlphaFactor, blendDst: T.OneFactor, blendSrcAlpha: T.ZeroFactor, blendDstAlpha: T.OneFactor });
const at = (k, a, b) => Math.max(0, Math.min(1, (k - a) / (b - a)));
const sprite = (x, color, add = true) => {
    const T = x.THREE, m = new T.SpriteMaterial({ map: tex(T), color, transparent: true, depthWrite: false }), s = new T.Sprite(add ? addBlend(m, T) : m);
    s.position.copy(x.home); s.material.opacity = 0; x.scene.add(s); x.own.push(s); return s;
};
// one Points system; each particle: origin, launch time, velocity, trail lag, colour, life. Colour is faded instead of alpha.
function system(x, list, size) {
    const T = x.THREE, n = list.length, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.setAttribute('color', new T.BufferAttribute(col, 3));
    const p = new T.Points(geo, addBlend(new T.PointsMaterial({ map: tex(T), size, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false }), T));
    p.frustumCulled = false; x.scene.add(p); x.own.push(p);
    p.step = (sec) => {
        for (let i = 0; i < n; i++) {
            const q = list[i], t = sec - q.t0 - q.lag, j = i * 3;
            if (t <= 0 || t > q.life) { col[j] = col[j + 1] = col[j + 2] = 0; continue; }
            const u = t / q.life, r = (1 - Math.exp(-q.drag * t)) / q.drag;
            pos[j] = q.ox + q.vx * r; pos[j + 1] = 0.3; pos[j + 2] = q.oz + q.vz * r + q.g * t * t;
            // hot white-yellow at birth, settling to its own colour, twinkling near the end
            const heat = Math.max(0, 1 - u * 4), tw = u > 0.55 ? 0.55 + 0.45 * Math.sin(t * 60 + q.ph) : 1, f = (1 - u) ** 0.9 * tw * q.b * 1.5;
            col[j] = (q.c[0] + heat * (1 - q.c[0])) * f; col[j + 1] = (q.c[1] * (1 - u * 0.5) + heat * (1 - q.c[1])) * f; col[j + 2] = (q.c[2] + heat * (1 - q.c[2])) * f;
        }
        geo.attributes.position.needsUpdate = geo.attributes.color.needsUpdate = true;
    };
    return p;
}
const P = (o) => Object.assign({ ox: 0, oz: 0, t0: 99, vx: 0, vz: 0, lag: 0, life: 1, drag: 2, g: 0, b: 1, ph: Math.random() * 6.28, c: [1, 0.6, 0.15] }, o);
// shell burst: spokes with 3-particle trails
function shell(list, ox, oz, t0, spokes, speed, life, pal) {
    for (let i = 0; i < spokes; i++) {
        const a = (i / spokes) * 6.283 + Math.random() * 0.15, s = speed * (0.75 + 0.25 * Math.random() * (i % 2 ? 1 : 1.3)), c = pal[i % pal.length];
        for (let l = 0; l < 3; l++) list.push(P({ ox, oz, t0, lag: l * 0.045, vx: Math.cos(a) * s, vz: Math.sin(a) * s, life: life * (0.85 + 0.15 * Math.random()), drag: 1.8, g: 2.4, b: 1 - l * 0.3, c }));
    }
}
const done = (x) => { for (const o of x.own || []) { x.scene.remove(o); o.material.dispose(); if (o.isPoints) o.geometry.dispose(); } x.own = []; };

export default {
    nat1: {
        key: 'n07-dud', name: 'Dud Firework', blurb: 'The fuse fizzes round the die, it hops, sputters, and pops in a sad puff of grey smoke.',
        dur: 2.2, impact: 1.0,
        start(x) {
            x.own = []; x.home = x.mesh.position.clone(); x.popped = false;
            x.fuse = sprite(x, 0xffd070); x.fuseHalo = sprite(x, 0xff6a10);
            // fuse trail: 48 sparks reused in a ring, each dropped where the fuse was
            x.fl = Array.from({ length: 48 }, () => P({ life: 0.5, drag: 4, g: 1.2, c: [1, 0.7, 0.2] })); x.fi = 0;
            x.smoke = Array.from({ length: 6 }, (_, i) => { const s = sprite(x, 0x8a8a90, false); s.dir = (i / 6) * 6.283 + Math.random(); return s; });
            x.smudge = sprite(x, 0x000000, false);
            const d = [];
            for (let i = 0; i < 9; i++) { const a = Math.random() * 6.283, s = 1.5 + Math.random() * 1.8; d.push(P({ ox: x.home.x, oz: x.home.z, t0: 1.0, vx: Math.cos(a) * s, vz: Math.sin(a) * s, life: 0.9, drag: 3, g: 3.5, b: 0.8, c: [1, 0.45, 0.08] })); }
            x.drops = system(x, d, 5); x.trail = system(x, x.fl, 4);
        },
        tick(k, x) {
            const s = k * 2.2, h = x.home, m = x.mesh;
            const hop = (t0) => { const u = (s - t0) / 0.22; return u > 0 && u < 1 ? Math.sin(u * Math.PI) : 0; };
            if (s < 1.0) {
                const lift = hop(0.45) * 0.9 + hop(0.7) * 0.6 + hop(0.88) * 0.35;
                m.position.set(h.x + Math.sin(s * 70) * 0.05 * at(s, 0.4, 1), h.y, h.z); m.scale.setScalar(1 + lift * 0.14);
                // fuse spark circling the die, dropping a spark every frame, flickering out as it dies
                const a = s * (9 + s * 12), r = 1.3 - 0.15 * Math.sin(s * 5), fx = h.x + Math.cos(a) * r, fz = h.z + Math.sin(a) * r;
                x.fuse.position.set(fx, 1, fz); x.fuseHalo.position.set(fx, 1, fz);
                const flick = (0.6 + 0.4 * Math.random()) * (s > 0.8 ? Math.random() : 1);
                x.fuse.material.opacity = flick; x.fuseHalo.material.opacity = flick * 0.5;
                x.fuse.scale.setScalar(0.5 + Math.random() * 0.3); x.fuseHalo.scale.setScalar(1.4 + Math.random() * 0.6);
                const q = x.fl[x.fi++ % 48]; q.ox = fx + (Math.random() - 0.5) * 0.2; q.oz = fz + (Math.random() - 0.5) * 0.2;
                q.vx = (Math.random() - 0.5) * 1.5; q.vz = (Math.random() - 0.5) * 1.5; q.t0 = s;
            } else if (!x.popped) {
                x.popped = true; x.fuse.material.opacity = x.fuseHalo.material.opacity = 0;
                x.smudge.position.y = 0.1; x.smudge.scale.setScalar(2.4);
            }
            if (x.popped) {
                m.visible = false; const p = at(s, 1.0, 2.2), e = 1 - (1 - p) ** 3;
                x.smoke.forEach((sp) => { sp.position.set(h.x + Math.cos(sp.dir) * e * 1.3, 1 + e, h.z + Math.sin(sp.dir) * e * 1.3 - e * 0.6); sp.scale.setScalar(0.7 + e * 1.6); sp.material.opacity = 0.7 * (1 - p) * Math.min(1, p * 8); });
                x.smudge.material.opacity = Math.min(0.75, p * 6) * (1 - at(p, 0.55, 1));
            }
            x.trail.step(s); x.drops.step(s);
        },
        end: done,
    },
    nat20: {
        key: 'n07-finale', name: 'Firework Finale', blurb: 'The die swells into a glowing shell, then bursts into a golden chrysanthemum with two smaller bursts beside it.',
        dur: 2.8, impact: 0.8,
        start(x) {
            x.own = []; x.home = x.mesh.position.clone();
            const h = x.home, gold = [1, 0.72, 0.2], org = [1, 0.4, 0.08], red = [1, 0.12, 0.08], list = [];
            shell(list, h.x, h.z, 0.8, 80, 15, 1.8, [gold, org, gold, red]);
            // inner ring of paler white-gold sparkles
            for (let i = 0; i < 30; i++) { const a = i / 30 * 6.283; list.push(P({ ox: h.x, oz: h.z, t0: 0.8, vx: Math.cos(a) * 8, vz: Math.sin(a) * 8, life: 1.2, drag: 2.5, g: 1.2, c: [1, 0.9, 0.6] })); }
            [[-4.2, 3, 1.25, [org, red]], [4.5, -2.5, 1.55, [[0.6, 0.8, 1], [1, 0.9, 0.5]]]].forEach(([dx, dz, t, pal]) => shell(list, h.x + dx, h.z + dz, t, 26, 8, 1.3, pal));
            // ascent: the shell throws a spiralling tail of sparks while it swells
            for (let i = 0; i < 24; i++) list.push(P({ ox: h.x, oz: h.z, t0: 0.05 + i * 0.03, vx: Math.cos(i * 2.4) * 2.2, vz: Math.sin(i * 2.4) * 2.2, life: 0.5, drag: 3, g: 0.5, b: 0.8, c: [1, 0.6, 0.2] }));
            x.pts = system(x, list, 8);
            x.glow = sprite(x, 0xff8a20); x.flash = sprite(x, 0xfff2c8); x.f2 = sprite(x, 0xffe0a0); x.f3 = sprite(x, 0xa8c8ff);
            x.glow.position.y = 1;
            x.f2.position.set(h.x - 4.2, 1, h.z + 3); x.f3.position.set(h.x + 4.5, 1, h.z - 2.5);
        },
        tick(k, x) {
            const s = k * 2.8, m = x.mesh, h = x.home, up = at(s, 0, 0.8), pop = (t0, w) => (s >= t0 ? Math.max(0, 1 - (s - t0) / w) : 0);
            if (s < 0.8) {
                const e = up * up;
                m.position.set(h.x + Math.sin(s * 55) * 0.04 * up, h.y, h.z); m.scale.setScalar(1 + e * 0.9);
                x.glow.scale.setScalar(2.2 + e * 4 + Math.sin(s * 40) * 0.2); x.glow.material.opacity = 0.35 + e * 0.65;
            } else { m.visible = false; x.glow.material.opacity = 0; }
            x.flash.scale.setScalar(2 + (1 - pop(0.8, 0.5)) * 9); x.flash.material.opacity = pop(0.8, 0.5);
            x.f2.scale.setScalar(2 + (1 - pop(1.25, 0.35)) * 4); x.f2.material.opacity = pop(1.25, 0.35) * 0.8;
            x.f3.scale.setScalar(2 + (1 - pop(1.55, 0.35)) * 4); x.f3.material.opacity = pop(1.55, 0.35) * 0.8;
            x.pts.step(s);
        },
        end: done,
    },
};
