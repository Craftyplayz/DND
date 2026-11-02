// Ember Cage trails 5: Smoke Plume (swirling smoke puffs) and Ash Fall (grey flakes, cinders, faint haze).
let T = null; // shared canvas textures, built on the first make()
function tex(THREE, draw) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    draw(c.getContext('2d'));
    const t = new THREE.CanvasTexture(c); return t;
}
function init(THREE) {
    if (T) return T;
    T = {};
    T.smoke = tex(THREE, g => {
        for (let i = 0; i < 12; i++) { // lumpy cloud: overlapping soft blobs
            const a = i * 2.4, r = i ? 8 + (i % 3) * 5 : 0, x = 32 + Math.cos(a) * r, y = 32 + Math.sin(a) * r;
            const gr = g.createRadialGradient(x, y, 2, x, y, 15);
            gr.addColorStop(0, 'rgba(255,255,255,0.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
            g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
        }
    });
    T.flake = tex(THREE, g => {
        g.fillStyle = '#fff'; g.beginPath(); g.moveTo(14, 36); g.lineTo(26, 14); g.lineTo(46, 20);
        g.lineTo(52, 40); g.lineTo(34, 52); g.closePath(); g.fill();
    });
    T.glow = tex(THREE, g => {
        const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
        gr.addColorStop(0, 'rgba(255,200,120,1)'); gr.addColorStop(0.3, 'rgba(255,120,20,0.85)'); gr.addColorStop(1, 'rgba(255,60,0,0)');
        g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    });
    return T;
}

// pooled sprite trail. cfg: n, gap (distance between spawns), spawn(item, r, body)
function pooled(ctx, n, gap, spawn, update) {
    const { THREE, scene, mesh, body } = ctx, r = ctx.rnd(7);
    const items = [];
    for (let i = 0; i < n; i++) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, opacity: 0 }));
        s.visible = false; scene.add(s); items.push({ s, age: 99, life: 1, vx: 0, vz: 0, spin: 0, s0: 1, s1: 1, a: 1, kind: 0 });
    }
    let next = 0, lx = body.position.x, lz = body.position.z, acc = 0;
    return {
        tick(sec, dt, b) {
            if (mesh.visible) {
                const d = Math.hypot(b.position.x - lx, b.position.z - lz); acc += d; lx = b.position.x; lz = b.position.z;
                if (b.position.y < 2.5) while (acc >= gap) { acc -= gap; const it = items[next]; next = (next + 1) % n; spawn(it, r, b); it.age = 0; it.s.visible = true; }
                else acc = 0;
            }
            for (let i = 0; i < n; i++) {
                const it = items[i]; if (it.age >= it.life) { it.s.visible = false; continue; }
                it.age += dt; const t = Math.min(it.age / it.life, 1);
                it.s.position.x += it.vx * dt; it.s.position.z += it.vz * dt;
                it.s.material.rotation += it.spin * dt;
                update(it, t);
            }
        },
        dispose() { for (const it of items) { scene.remove(it.s); it.s.material.dispose(); } }
    };
}

export default [
    { key: 't05-smoke-plume', name: 'Smoke Plume', blurb: 'Billowing smoke puffs with an orange underglow that swell, swirl and thin out behind each die.',
        make(ctx) {
            const T = init(ctx.THREE), C = ctx.THREE.Color, hot = new C(0xff8a30), cool = new C(0xd2cac4), tmp = new C();
            return pooled(ctx, 36, 0.55, (it, r, b) => {
                const m = it.s.material; m.map = T.smoke; m.blending = 1; it.life = 2.2 + r() * 1.0;
                it.s.position.set(b.position.x + (r() - .5) * .5, 0.15 + r() * 0.4, b.position.z + (r() - .5) * .5);
                it.vx = (r() - .5) * 0.9; it.vz = (r() - .5) * 0.9 - 0.3; it.spin = (r() - .5) * 1.4;
                m.rotation = r() * 6.28; it.s0 = 1.6 + r() * .6; it.s1 = 4.2 + r() * 1.6;
            }, (it, t) => {
                const m = it.s.material, k = 1 - Math.pow(1 - t, 2);
                const sc = it.s0 + (it.s1 - it.s0) * k; it.s.scale.set(sc, sc, 1);
                m.color.copy(tmp.copy(hot).lerp(cool, Math.min(1, t * 4)));
                m.opacity = Math.min(1, t * 12) * (1 - t) * 0.55;
            });
        } },
    { key: 't05-ash-fall', name: 'Ash Fall', blurb: 'Grey ash flakes settle on the table with a few glowing cinders and a faint smoky haze.',
        make(ctx) {
            const T = init(ctx.THREE), C = ctx.THREE.Color, tmp = new C(), ash = new C(0xf0ebe6), ash2 = new C(0xb0aaa4);
            return pooled(ctx, 90, 0.16, (it, r, b) => {
                const m = it.s.material, q = r();
                it.kind = q < .18 ? 1 : q < .26 ? 2 : 0;
                m.blending = it.kind === 1 ? 2 : 1; m.map = it.kind === 1 ? T.glow : it.kind === 2 ? T.smoke : T.flake;
                const sp = it.kind === 2 ? .3 : 1.2;
                it.s.position.set(b.position.x + (r() - .5) * 1.4, 0.1 + r() * 0.5, b.position.z + (r() - .5) * 1.4);
                it.vx = (r() - .5) * sp; it.vz = (r() - .5) * sp; it.spin = (r() - .5) * 3; m.rotation = r() * 6.28;
                it.a = r();
                it.life = it.kind === 1 ? 1.2 + r() * 1.0 : it.kind === 2 ? 2.4 : 2.2 + r() * 1.6;
                it.s0 = it.s1 = it.kind === 1 ? .3 + r() * .25 : it.kind === 2 ? 2.6 : .3 + r() * .4;
            }, (it, t) => {
                const m = it.s.material, damp = 1 - t * .03; it.vx *= damp; it.vz *= damp; it.spin *= damp;
                if (it.kind === 2) { const sc = it.s0 * (1 + t); it.s.scale.set(sc, sc, 1); m.color.setHex(0xa8887a); m.opacity = Math.min(1, t * 10) * (1 - t) * .35; }
                else if (it.kind === 1) { const sc = it.s0 * (1 - t * .5); it.s.scale.set(sc, sc, 1); m.color.setHex(0xffffff); m.opacity = (1 - t) * (0.7 + 0.3 * Math.sin(it.age * 18 + it.a * 9)); }
                else { it.s.scale.set(it.s0, it.s0 * (.6 + .4 * Math.abs(Math.cos(it.age * 2 + it.a * 6))), 1); m.color.copy(tmp.copy(ash).lerp(ash2, it.a)); m.opacity = Math.min(1, t * 10) * (1 - t * t) * .95; }
            });
        } },
];
