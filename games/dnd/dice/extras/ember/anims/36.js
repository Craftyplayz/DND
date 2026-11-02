// Ember Cage exit 36: nat 1 Rust Away (the core's glow dies, rust blotches creep over the cage, flakes peel off and drift, the die crumbles into a small rust heap that settles and fades).
let TEX = null;
const soft = (T) => {
    if (TEX) return TEX;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return (TEX = new T.CanvasTexture(c));
};
const ease = (k) => 1 - (1 - k) ** 3;
const at = (k, a, b) => Math.max(0, Math.min(1, (k - a) / (b - a)));
// n round dots (normal blending, so they read as dull rust, not light)
function dots(x, n, color, size) {
    const T = x.THREE, geo = new T.BufferGeometry(), pos = new Float32Array(n * 3);
    geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    const p = new T.Points(geo, new T.PointsMaterial({ map: soft(T), color, size, sizeAttenuation: false, transparent: true, depthWrite: false }));
    p.frustumCulled = false; x.scene.add(p); x.own.push(p); p.pos = pos; return p;
}
// a copy of the geometry with every triangle split into 4^n, unindexed
function subdivide(geo, n) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (let l = 0; l < n; l++) {
        const out = new g.constructor();
        for (const name of Object.keys(g.attributes)) {
            const a = g.attributes[name], s = a.itemSize, src = a.array, dst = new Float32Array(src.length * 4);
            let o = 0;
            for (let t = 0; t < a.count; t += 3) {
                const P = (i) => src.subarray((t + i) * s, (t + i + 1) * s), A = P(0), B = P(1), C = P(2);
                const M = (u, v) => Array.from(u, (q, j) => (q + v[j]) / 2), ab = M(A, B), bc = M(B, C), ca = M(C, A);
                for (const tri of [[A, ab, ca], [ab, B, bc], [ca, bc, C], [ab, bc, ca]]) for (const p of tri) { dst.set(p, o); o += s; }
            }
            out.setAttribute(name, new a.constructor(dst, s));
        }
        if (g !== geo) g.dispose(); g = out;
    }
    return g;
}

const nat1 = {
    key: 'a36-rust-away', name: 'Rust Away', dur: 3.4,
    blurb: 'The core goes dark, rust creeps over the cage in patches, flakes peel off, and the die crumbles into a small heap of rust.',
    start(x) {
        const T = x.THREE, m = x.mesh;
        x.p0 = m.position.clone(); x.s0 = m.scale.clone(); x.own = [];
        x.kids = m.children.map((c) => [c, c.visible]);
        x.mats = (Array.isArray(m.material) ? m.material : [m.material]).map((q) => q.clone());
        x.orig = m.material; m.material = Array.isArray(x.orig) ? x.mats : x.mats[0];
        x.e0 = x.mats.map((q) => (q.emissive ? q.emissive.clone() : null));
        // rust overlay: the die's triangles (split finer) sorted by a blotchy noise, so drawing more of them grows patches
        const g = subdivide(m.geometry, 3), P = g.attributes.position, n = P.count / 3, ph = Array.from({ length: 6 }, () => Math.random() * 20), v = new T.Vector3(), key = [];
        for (let t = 0; t < n; t++) {
            v.set(0, 0, 0); for (let i = 0; i < 3; i++) v.x += P.getX(t * 3 + i) / 3, v.y += P.getY(t * 3 + i) / 3, v.z += P.getZ(t * 3 + i) / 3;
            key.push([Math.sin(v.x * 2.7 + ph[0]) * Math.sin(v.y * 3.1 + ph[1]) + Math.sin(v.z * 2.3 + ph[2] + v.x * 1.7) * 0.8 + Math.sin((v.x + v.y + v.z) * 6 + ph[3]) * 0.35 + Math.random() * 0.25, t]);
        }
        key.sort((a, b) => a[0] - b[0]);
        const pos = new Float32Array(n * 9), nor = new Float32Array(n * 9), N = g.attributes.normal;
        key.forEach(([, t], j) => { for (let i = 0; i < 9; i++) { pos[j * 9 + i] = P.array[t * 9 + i]; nor[j * 9 + i] = N.array[t * 9 + i]; } });
        x.og = new T.BufferGeometry(); g.dispose();
        x.og.setAttribute('position', new T.BufferAttribute(pos, 3)); x.og.setAttribute('normal', new T.BufferAttribute(nor, 3)); x.og.setDrawRange(0, 0);
        x.on = n;
        x.om = new T.MeshStandardMaterial({ color: 0x6b2d0e, roughness: 0.95, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
        x.ov = new T.Mesh(x.og, x.om); x.ov.scale.setScalar(1.015); x.ov.castShadow = false; m.add(x.ov);
        x.fl = dots(x, 36, 0xb8582a, 9); x.heap = dots(x, 26, 0x6e3414, 14); x.heap.material.opacity = 0;
        x.fv = Array.from({ length: 36 }, () => { const a = Math.random() * 6.283, s = 0.8 + Math.random() * 1.6; return [Math.cos(a) * s, Math.sin(a) * s, Math.random() * 0.5 + 0.2, Math.random()]; });
        x.hv = Array.from({ length: 26 }, () => { const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * 0.55; return [Math.cos(a) * r, Math.sin(a) * r]; });
    },
    tick(k, x) {
        const m = x.mesh, rust = at(k, 0.05, 0.6), crumble = ease(at(k, 0.55, 0.85)), fade = 1 - at(k, 0.85, 0.97);
        // the core's glow dies: the additive churn/spark children go out, emissive drops
        for (const [c] of x.kids) c.visible = k < 0.2;
        x.mats.forEach((q, i) => { if (q.emissive) q.emissive.copy(x.e0[i]).multiplyScalar(Math.max(0, 1 - at(k, 0, 0.2))); });
        x.og.setDrawRange(0, Math.floor(x.on * 0.62 * ease(rust)) * 3);
        // the cage itself browns over as rust takes it
        x.mats.forEach((q) => q.color.setRGB(1 - 0.1 * rust, 1 - 0.3 * rust, 1 - 0.5 * rust));
        // crumbling: shrinks to a stub and shudders, still shown over the heap
        m.scale.setScalar(Math.max(0.001, (1 - 0.8 * crumble) * (k < 0.97 ? 1 : 0)));
        m.position.x = x.p0.x + Math.sin(k * 90) * 0.03 * crumble * (1 - crumble); m.visible = crumble < 1 && k < 0.88;
        // flakes peel off from the start of rusting and drift sideways, shrinking away
        const fl = x.fl, o = x.p0;
        x.fv.forEach((f, i) => {
            const a = at(k, 0.15 + f[3] * 0.4, 0.95), r = 0.5 * (1 - f[3] * 0.3) + a * 1.2;
            fl.pos.set([o.x + f[0] * r * (0.5 + a), 0.2 - a * 0.1, o.z + f[1] * r * (0.5 + a) + a * a * f[2]], i * 3);
        });
        fl.geometry.attributes.position.needsUpdate = true; fl.material.opacity = Math.min(at(k, 0.15, 0.3), fade); fl.material.size = 9 + 3 * Math.sin(k * 20);
        // heap of rust on the table, settles (grows then sags) and fades
        const h = x.heap, grow = ease(at(k, 0.6, 0.9));
        x.hv.forEach((p, i) => h.pos.set([o.x + p[0] * (0.6 + 0.4 * grow), 0.1, o.z + p[1] * (0.6 + 0.4 * grow)], i * 3));
        h.geometry.attributes.position.needsUpdate = true; h.material.opacity = 0.9 * grow * fade; h.material.size = 10 + 6 * grow;
    },
    end(x) {
        const m = x.mesh;
        m.position.copy(x.p0); m.scale.copy(x.s0); m.visible = true; m.castShadow = true;
        m.material = x.orig; x.mats.forEach((q) => q.dispose());
        x.kids.forEach(([c, v]) => (c.visible = v));
        m.remove(x.ov); x.og.dispose(); x.om.dispose();
        for (const o of x.own) { x.scene.remove(o); o.geometry.dispose(); o.material.dispose(); }
        x.own = [];
    },
};

export default { nat1 };
