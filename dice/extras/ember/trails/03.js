// Ember Cage trails 03: flickering flames left on the table, and a flowing fire tail.
let shared = null;
function init(THREE) {
    if (shared) return shared;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    // teardrop flame pointing up the screen, white core fading to orange edge
    g.translate(32, 36); g.scale(1, 1.35);
    const gr = g.createRadialGradient(0, 4, 1, 0, 0, 24);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,.75)');
    gr.addColorStop(0.7, 'rgba(255,255,255,.2)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.moveTo(0, -30); g.bezierCurveTo(14, -10, 24, 6, 0, 22); g.bezierCurveTo(-24, 6, -14, -10, 0, -30); g.fill();
    const flame = new THREE.CanvasTexture(c);
    const c2 = document.createElement('canvas'); c2.width = c2.height = 32;
    const g2 = c2.getContext('2d'), gr2 = g2.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr2.addColorStop(0, 'rgba(255,255,255,1)'); gr2.addColorStop(0.4, 'rgba(255,255,255,.5)'); gr2.addColorStop(1, 'rgba(255,255,255,0)');
    g2.fillStyle = gr2; g2.fillRect(0, 0, 32, 32);
    const puff = new THREE.CanvasTexture(c2);
    // colour ramp t 0..1: white-yellow, orange, red, dark smoke
    const stops = [[1, 0.95, 0.6], [1, 0.55, 0.1], [0.7, 0.12, 0.02], [0.12, 0.04, 0.03]];
    shared = { flame, puff, stops };
    return shared;
}
function ramp(out, stops, t) {
    const x = Math.min(0.999, Math.max(0, t)) * (stops.length - 1), i = x | 0, f = x - i, a = stops[i], b = stops[i + 1];
    out.setRGB(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f);
}
function pool(THREE, scene, tex, n) {
    const items = [];
    for (let i = 0; i < n; i++) {
        const m = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
        const s = new THREE.Sprite(m); s.visible = false; s.renderOrder = 5; scene.add(s);
        items.push({ s, m, age: 99, life: 1, ph: 0, size: 1, vx: 0, vz: 0 });
    }
    return items;
}
function free(scene, items) { for (const it of items) { scene.remove(it.s); it.m.dispose(); } }

export default [
    {
        key: 't03-flame-line', name: 'Burning Footprints', blurb: 'Small flames stay lit on the table behind the die, flickering and burning down over a few seconds.',
        make(ctx) {
            const { THREE, scene, body } = ctx, sh = init(THREE), rnd = ctx.rnd(31);
            const P = pool(THREE, scene, sh.flame, 60); let next = 0, lx = body.position.x, lz = body.position.z, acc = 0;
            return {
                tick(sec, dt, b) {
                    const d = Math.hypot(b.position.x - lx, b.position.z - lz);
                    if (ctx.mesh.visible && d > 0) {
                        acc += d; lx = b.position.x; lz = b.position.z;
                        if (acc > 0.4) {
                            acc = 0; const it = P[next++ % P.length];
                            it.age = 0; it.life = 2 + rnd() * 1.2; it.ph = rnd() * 50; it.size = 1.2 + rnd() * 0.6;
                            it.s.position.set(lx + (rnd() - 0.5) * 0.4, 0.3, lz + (rnd() - 0.5) * 0.4);
                        }
                    }
                    for (const it of P) {
                        if (it.age >= it.life) { it.s.visible = false; continue; }
                        it.age += dt; const t = it.age / it.life; if (t >= 1) { it.s.visible = false; continue; }
                        const fl = 0.75 + 0.25 * Math.sin(sec * 17 + it.ph) * Math.sin(sec * 9.3 + it.ph * 2);
                        const burn = t < 0.1 ? t * 10 : 1 - (t - 0.1) / 0.9; // flare up then burn down
                        const sz = it.size * (0.25 + 0.75 * burn) * fl;
                        it.s.visible = true; it.s.scale.set(sz * (0.9 + 0.2 * fl), sz * 1.35, 1);
                        it.s.position.x += Math.sin(sec * 11 + it.ph) * 0.002;
                        ramp(it.m.color, sh.stops, 0.2 + t * 0.6); it.m.opacity = Math.min(1, burn * 1.4) * (0.7 + 0.3 * fl);
                    }
                },
                dispose() { free(scene, P); },
            };
        },
    },
    {
        key: 't03-fire-tail', name: 'Fire Tail', blurb: 'A stream of fire licks out behind a fast die, fading from white-yellow through orange to red smoke.',
        make(ctx) {
            const { THREE, scene, body } = ctx, sh = init(THREE), rnd = ctx.rnd(77);
            const P = pool(THREE, scene, sh.puff, 60); let next = 0;
            return {
                tick(sec, dt, b) {
                    const v = b.velocity, sp = Math.hypot(v.x, v.z);
                    if (ctx.mesh.visible && sp > 1.5 && dt > 0) {
                        const n = Math.min(4, Math.ceil(Math.min(sp, 25) * dt * 12));
                        for (let k = 0; k < n; k++) {
                            const it = P[next++ % P.length], f = rnd();
                            it.age = 0; it.life = 0.5 + rnd() * 0.4; it.ph = rnd();
                            it.size = Math.min(1.6, 0.5 + sp * 0.07) * (0.8 + rnd() * 0.5);
                            it.vx = -v.x * (0.25 + rnd() * 0.25) + (rnd() - 0.5) * 1.2; it.vz = -v.z * (0.25 + rnd() * 0.25) + (rnd() - 0.5) * 1.2;
                            it.s.position.set(b.position.x - v.x * dt * f + (rnd() - 0.5) * 0.4, 0.35, b.position.z - v.z * dt * f + (rnd() - 0.5) * 0.4);
                        }
                    }
                    for (const it of P) {
                        if (it.age >= it.life) { it.s.visible = false; continue; }
                        it.age += dt; const t = it.age / it.life; if (t >= 1) { it.s.visible = false; continue; }
                        it.s.visible = true;
                        it.s.position.x += it.vx * dt; it.s.position.z += it.vz * dt - dt * 0.8; // licks drift up-screen
                        const sz = it.size * (1 - t * 0.7) * (0.9 + 0.1 * Math.sin(sec * 25 + it.ph * 40));
                        it.s.scale.set(sz, sz, 1);
                        ramp(it.m.color, sh.stops, t); it.m.opacity = (1 - t) * 0.9;
                    }
                },
                dispose() { free(scene, P); },
            };
        },
    },
];
