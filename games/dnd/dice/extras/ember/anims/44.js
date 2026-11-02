// Ember Cage exit 44: nat 20 Constellation (the die breaks into points of starlight from its own vertices, which drift out and join up as a big "20" of twinkling stars and thin glowing lines).
let FX = null;
function fx(T) {
    if (FX) return FX;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return (FX = { soft: new T.CanvasTexture(c), plane: new T.PlaneGeometry(1, 1) });
}
const ease = (k) => 1 - (1 - k) ** 3;
const at = (k, a, b) => Math.max(0, Math.min(1, (k - a) / (b - a)));
// the digits as stars (x right, y up, about 2.4 wide and 5 tall) and the lines between them (pairs of star numbers)
const PTS = [[-1.2, 1.4], [-0.6, 2.4], [0.6, 2.4], [1.2, 1.4], [1.2, 0.4], [-1.2, -2.4], [1.2, -2.4],
    [-0.6, 0.9], [0.6, 0.9], [1.2, 0], [0.6, -0.9], [-0.6, -0.9], [-1.2, 0]].map(([a, b]) => [a, b]);
// "2" is points 0-6 in a line; "0" is a ring of 6 (the ring points sit in a second digit, shifted right in start())
const TWO = [0, 1, 2, 3, 4, 5, 6], ZERO = [[-0.6, 2.4], [0.6, 2.4], [1.2, 1.2], [1.2, -1.2], [0.6, -2.4], [-0.6, -2.4], [-1.2, -1.2], [-1.2, 1.2]];
const add = (x, o) => (x.scene.add(o), x.own.push(o), o);

const nat20 = {
    key: 'a44-constellation', name: 'Constellation', dur: 3.4,
    blurb: 'The die breaks into points of starlight that drift out and join up as a big twinkling "20" drawn in glowing lines.',
    start(x) {
        const T = x.THREE, f = fx(T), p0 = x.mesh.position.clone(), q0 = x.mesh.quaternion.clone();
        Object.assign(x, { own: [], p0, q0, s0: x.mesh.scale.clone(), vis0: x.mesh.visible });
        // the die's own vertices (unique), in table space
        const P = x.mesh.geometry.attributes.position, seen = new Set(), vs = [];
        for (let i = 0; i < P.count; i++) { const v = new T.Vector3().fromBufferAttribute(P, i), key = v.toArray().map((n) => n.toFixed(2)).join();
            if (!seen.has(key)) { seen.add(key); vs.push(v.applyQuaternion(q0).add(p0)); } }
        // the layout: the "2" then the "0", centred on the die and kept on screen
        const S = 1, off = 2.1, W = innerWidth, H = innerHeight, ppu = Math.max(28, Math.min(56, Math.min(W, H) / 16));
        const cx = Math.max(-(W / ppu / 2 - 5), Math.min(W / ppu / 2 - 5, p0.x)), cz = Math.max(-(H / ppu / 2 - 3.4), Math.min(H / ppu / 2 - 3.4, p0.z));
        const pts = [], seg = [];
        const chain = (list, loop) => { const s = pts.length; list.forEach(([a, b]) => pts.push([cx + a * S, cz - b * S])); for (let i = 0; i < list.length - (loop ? 0 : 1); i++) seg.push([s + i, s + (i + 1) % list.length]); };
        chain(TWO.map((i) => [PTS[i][0] - off, PTS[i][1]]));
        chain(ZERO.map(([a, b]) => [a + off, b]), true);
        // random stage order for the lines would look scattered; follow the pen order instead (2 first, then 0)
        x.stars = pts.map(([a, b], i) => {
            const s = add(x, new T.Sprite(new T.SpriteMaterial({ map: f.soft, color: i % 3 ? 0xfff2c0 : 0xbfd8ff, transparent: true, depthWrite: false, blending: T.AdditiveBlending })));
            const from = vs[i % vs.length], out = new T.Vector3(from.x - p0.x, 0, from.z - p0.z); if (out.lengthSq() < 1e-3) out.set(Math.random() - 0.5, 0, Math.random() - 0.5);
            out.normalize().multiplyScalar(1 + Math.random() * 1.5);
            // each star: start on a die vertex, drift out first, then settle on its place in the digit
            const o = { s, from: from.clone(), mid: from.clone().add(out), to: new T.Vector3(a, 0.2, b), ph: Math.random() * 6.28, sz: 0.9 + Math.random() * 0.7, last: 0.88 + Math.random() * 0.07 };
            s.position.copy(from); s.scale.setScalar(0.01); return o;
        });
        x.segs = seg.map(([a, b], n) => {
            const A = x.stars[a].to, B = x.stars[b].to, d = B.clone().sub(A), len = d.length(), ang = Math.atan2(-d.z, d.x);
            const mk = (w, op, map) => { const m = add(x, new T.Mesh(f.plane, new T.MeshBasicMaterial({ map, color: 0xcfe2ff, transparent: true, opacity: op, depthWrite: false, blending: T.AdditiveBlending }))); m.rotation.order = 'YXZ'; m.rotation.set(-Math.PI / 2, ang, 0); m.visible = false; return { m, w, op }; };
            return { A, d, len, t0: 0.4 + (n / seg.length) * 0.32, core: mk(0.05, 0.95, null), halo: mk(0.4, 0.3, f.soft) };
        });
        // loose dust that follows the stars out and ends up along the lines
        const N = 36, pos = new Float32Array(N * 3), geo = new T.BufferGeometry();
        geo.setAttribute('position', new T.BufferAttribute(pos, 3));
        x.dust = add(x, new T.Points(geo, new T.PointsMaterial({ map: f.soft, color: 0xdde8ff, size: 4, sizeAttenuation: false, transparent: true, depthWrite: false, blending: T.AdditiveBlending })));
        x.dust.frustumCulled = false;
        x.dd = Array.from({ length: N }, () => { const s = x.segs[Math.floor(Math.random() * x.segs.length)], u = Math.random(), from = vs[Math.floor(Math.random() * vs.length)]; return { from, to: s.A.clone().addScaledVector(s.d, u), a: Math.random() * 6.28 }; });
        x.flash = add(x, new T.Sprite(new T.SpriteMaterial({ map: f.soft, color: 0xfff0c0, transparent: true, depthWrite: false, blending: T.AdditiveBlending }))); x.flash.position.copy(p0);
    },
    tick(k, x) {
        const go = ease(at(k, 0.05, 0.42)), spread = at(k, 0.05, 0.18), twk = (i, ph) => 1 + 0.3 * Math.sin(k * 55 + ph + i), out = at(k, 0.8, 0.95);
        // the die gives way to the stars
        x.mesh.scale.setScalar(Math.max(0.001, 1 - ease(at(k, 0, 0.12)))); x.mesh.visible = k < 0.12; // its sparks keep their pixel size however small it gets
        x.flash.scale.setScalar(2 + at(k, 0, 0.2) * 5); x.flash.material.opacity = Math.sin(Math.PI * at(k, 0, 0.22));
        x.stars.forEach((o, i) => {
            const e = ease(at(k, 0.05 + (i % 5) * 0.015, 0.45)), pos = o.s.position;
            // out to the drift point, then on to the star's place
            if (e < 0.4) pos.lerpVectors(o.from, o.mid, ease(e / 0.4)); else pos.lerpVectors(o.mid, o.to, ease((e - 0.4) / 0.6));
            const live = 1 - at(k, o.last - 0.05, o.last + 0.03), arrive = at(k, 0.3, 0.45);
            o.s.scale.setScalar((0.3 + 0.5 * arrive + (1 - arrive) * 0.1) * (0.6 + o.sz * 0.6) * twk(i, o.ph) * live * 0.9 + 0.001);
            o.s.material.opacity = Math.min(1, spread * 3) * live;
        });
        const lineOut = 1 - out;
        x.segs.forEach((s) => {
            const p = ease(at(k, s.t0, s.t0 + 0.08)), v = p > 0 && lineOut > 0;
            for (const l of [s.core, s.halo]) {
                l.m.visible = v; if (!v) continue;
                const len = s.len * p;
                l.m.position.copy(s.A).addScaledVector(s.d, p / 2); l.m.scale.set(len + (l === s.halo ? 0.3 : 0), l.w, 1);
                l.m.material.opacity = l.op * lineOut * (0.85 + 0.15 * Math.sin(k * 40 + s.t0 * 20));
            }
        });
        const pos = x.dust.geometry.attributes.position;
        x.dd.forEach((d, i) => { const e = ease(at(k, 0.08, 0.5)), w = 0.2 * Math.sin(k * 20 + d.a); pos.setXYZ(i, d.from.x + (d.to.x - d.from.x) * e + w * (1 - e), 0.2, d.from.z + (d.to.z - d.from.z) * e + w * (1 - e)); });
        pos.needsUpdate = true;
        x.dust.material.opacity = Math.min(1, spread * 3) * (1 - at(k, 0.72, 0.9)) * (0.7 + 0.3 * Math.sin(k * 45));
    },
    end(x) {
        x.mesh.position.copy(x.p0); x.mesh.quaternion.copy(x.q0); x.mesh.scale.copy(x.s0); x.mesh.visible = x.vis0;
        for (const o of x.own) { x.scene.remove(o); if (o.isPoints) o.geometry.dispose(); if (o.material) { o.material.dispose(); } }
        x.own = []; x.stars = x.segs = x.dd = null;
    },
};

export default { nat20 };
