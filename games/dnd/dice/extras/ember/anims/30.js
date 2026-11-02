// Ember Cage exits 30, Spiral Melt: a magma skin swallows the numbers, then the die swirls out into a two-armed spiral that hardens into coiled stone and fades.
let FX = null;
const hash = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
// smooth value noise on a grid, so the rock grain and cracks have no visible tiles
const noise = (x, y) => { const i = Math.floor(x), j = Math.floor(y), u = x - i, v = y - j, s = u * u * (3 - 2 * u), t = v * v * (3 - 2 * v);
    return (hash(i, j) * (1 - s) + hash(i + 1, j) * s) * (1 - t) + (hash(i, j + 1) * (1 - s) + hash(i + 1, j + 1) * s) * t; };
// shared by every die: soft glow, a spiral rock texture (grooves between coils) and a matching crack map (glowing grooves plus jagged cracks)
function fx(T) {
    if (FX) return FX;
    const N = 256, mk = () => { const c = document.createElement('canvas'); c.width = c.height = N; return c; };
    const sc = mk(), g = sc.getContext('2d'), gr = g.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, N, N);
    const rc = mk(), cc = mk(), rg = rc.getContext('2d'), cg = cc.getContext('2d'), ri = rg.createImageData(N, N), ci = cg.createImageData(N, N);
    for (let py = 0; py < N; py++) for (let px = 0; px < N; px++) {
        const u = px / N - 0.5, v = py / N - 0.5, r = Math.hypot(u, v), a = Math.atan2(v, u);
        // two arms: the phase turns with the angle and with the radius, so the coils wind outward
        const p = 2 * a - 24 * r + 2.5 * noise(u * 9, v * 9), ridge = 0.5 + 0.5 * Math.cos(p), groove = Math.max(0, -Math.cos(p)) ** 6;
        const grain = noise(u * 40, v * 40) * 0.6 + noise(u * 90, v * 90) * 0.4, val = 0.35 + 0.4 * ridge + 0.3 * grain - 0.35 * groove, o = (py * N + px) * 4;
        ri.data[o] = ri.data[o + 1] = ri.data[o + 2] = Math.max(0, Math.min(255, val * 255)); ri.data[o + 3] = 255;
        const gl = groove * (0.55 + 0.7 * noise(u * 30, v * 30)); ci.data[o] = ci.data[o + 1] = ci.data[o + 2] = Math.min(255, gl * 255); ci.data[o + 3] = 255;
    }
    rg.putImageData(ri, 0, 0); cg.putImageData(ci, 0, 0);
    // jagged cracks across the coils
    cg.strokeStyle = '#fff'; cg.lineCap = 'round';
    for (let i = 0; i < 26; i++) { let x = N / 2 + (hash(i, 1) - 0.5) * N * 0.8, y = N / 2 + (hash(i, 2) - 0.5) * N * 0.8, a = hash(i, 3) * 6.28; cg.lineWidth = 1 + hash(i, 4) * 1.6; cg.beginPath(); cg.moveTo(x, y);
        for (let j = 0; j < 5; j++) { a += (hash(i, 5 + j) - 0.5) * 1.5; x += Math.cos(a) * 14; y += Math.sin(a) * 14; cg.lineTo(x, y); } cg.stroke(); }
    return (FX = { soft: new T.CanvasTexture(sc), rock: new T.CanvasTexture(rc), crack: new T.CanvasTexture(cc), plane: new T.PlaneGeometry(1, 1) });
}
// a copy of a die's geometry with every triangle split into 4^n, so it bends smoothly instead of folding at the few real edges
function subdivide(geo, n) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (let l = 0; l < n; l++) {
        const out = new g.constructor(), names = Object.keys(g.attributes);
        for (const name of names) {
            const a = g.attributes[name], s = a.itemSize, src = a.array, dst = new Float32Array(src.length * 4);
            let o = 0;
            for (let t = 0; t < a.count; t += 3) {
                const P = (i) => src.subarray((t + i) * s, (t + i + 1) * s), A = P(0), B = P(1), C = P(2);
                const M = (u, v) => Array.from(u, (x, j) => (x + v[j]) / 2), ab = M(A, B), bc = M(B, C), ca = M(C, A);
                for (const tri of [[A, ab, ca], [ab, B, bc], [ca, bc, C], [ab, bc, ca]]) for (const p of tri) { dst.set(p, o); o += s; }
            }
            out.setAttribute(name, new a.constructor(dst, s));
        }
        if (g !== geo) g.dispose(); g = out;
    }
    return g;
}
const ease = (k) => 1 - (1 - k) ** 3;
const ss = (k) => k * k * (3 - 2 * k);
const at = (k, a, b) => Math.max(0, Math.min(1, (k - a) / (b - a)));
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

const melt = {
    key: 'a30-melt-spiral', name: 'Spiral Melt', blurb: 'The die sinks under glowing magma, swirls out into a slow two-armed spiral, then hardens into a coiled stone fossil and fades.',
    dur: 3.4,
    start(x) {
        const T = x.THREE, F = fx(T);
        x.own = [];
        // the skin is a bendable copy of the die's own shape; the original is hidden once the magma has covered it, so its numbers are never bent
        x.geo = subdivide(x.mesh.geometry, 2);
        if (!x.geo.attributes.uv) x.geo.setAttribute('uv', new T.BufferAttribute(new Float32Array(x.geo.attributes.position.count * 2), 2));
        x.geo.deleteAttribute('normal');
        const p = x.geo.attributes.position, q = x.mesh.quaternion, v = new T.Vector3();
        x.qi = q.clone().invert(); x.w0 = []; let lo = Infinity, hi = -Infinity, R = 0;
        for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyQuaternion(q); x.w0.push(v.clone()); lo = Math.min(lo, v.y); hi = Math.max(hi, v.y); R = Math.max(R, Math.hypot(v.x, v.z)); }
        x.lo = lo; x.tall = hi - lo; x.R = R;
        x.skin = new T.Mesh(x.geo, new T.MeshBasicMaterial({ map: F.rock, transparent: true, opacity: 0, depthWrite: true }));
        x.crack = new T.Mesh(x.geo, new T.MeshBasicMaterial({ map: F.crack, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
        for (const m of [x.skin, x.crack]) { m.frustumCulled = false; m.position.copy(x.mesh.position); m.quaternion.copy(x.mesh.quaternion); m.renderOrder = 2; x.scene.add(m); x.own.push(m); }
        x.skin.material.color.setRGB(1, 0.6, 0.2);
        // a warm glow on the table under the spreading magma
        x.pool = new T.Mesh(F.plane, new T.MeshBasicMaterial({ map: F.soft, color: 0xff7a18, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
        x.pool.rotation.x = -Math.PI / 2; x.pool.position.set(x.mesh.position.x, 0.05, x.mesh.position.z); x.pool.scale.setScalar(0.1); x.scene.add(x.pool); x.own.push(x.pool);
        // steam: grey puffs that drift outward along the table, the only thing the camera can see rise
        const n = 18, pos = new Float32Array(n * 3), geo = new T.BufferGeometry(); x.dirs = [];
        for (let i = 0; i < n; i++) x.dirs.push([Math.random() * 6.283, 0.5 + Math.random() * 0.8, Math.random() * 0.5]);
        geo.setAttribute('position', new T.BufferAttribute(pos, 3));
        x.steam = new T.Points(geo, new T.PointsMaterial({ map: F.soft, color: 0xc8c3be, size: 26, sizeAttenuation: false, transparent: true, depthWrite: false, opacity: 0 }));
        x.steam.frustumCulled = false; x.scene.add(x.steam); x.own.push(x.steam);
        x.mesh.userData.hidden0 = x.mesh.visible;
    },
    tick(k, x) {
        // a see-through die still casts a shadow, so it stops once the pool is flat and fading
        x.mesh.castShadow = k < 0.8;
        // the set's own sparks would float on alone at the end
        for (const c of x.mesh.children) if (c.isPoints) c.visible = k < 0.85;
        const s = ease(at(k, 0.24, 0.66)), twist = ease(at(k, 0.2, 0.85)), cool = at(k, 0.6, 0.84), fade = ss(at(k, 0.8, 0.95)), cover = ss(at(k, 0.06, 0.26));
        const p = x.geo.attributes.position, uv = x.geo.attributes.uv, v = new x.THREE.Vector3(), R = x.R, S = R * 8, sw = 2.4 * twist, cs = Math.cos(sw), sn = Math.sin(sw);
        for (let i = 0; i < p.count; i++) {
            const w = x.w0[i], h = (w.y - x.lo) / x.tall, r = Math.hypot(w.x, w.z), a = Math.atan2(w.z, w.x);
            // a two-armed spiral: arms reach out further than the gaps between them, and the farther out a spot is, the more it is twisted around
            const arm = 1 + 0.7 * Math.sin(2 * a - 2.5 * r / R + 1), sag = Math.min(1, s * (1.2 - 0.4 * h));
            const rr = r * (1.03 + sag * 1.2 * arm) + sag * R * 0.35 * arm, ta = a + s * 2.2 * Math.min(1.6, rr / R);
            const nh = h * (1 - sag) ** 1.8 + 0.015, x2 = Math.cos(ta) * rr, z2 = Math.sin(ta) * rr;
            v.set(x2, x.lo + nh * x.tall * 1.03, z2).applyQuaternion(x.qi); p.setXYZ(i, v.x, v.y, v.z);
            // the rock and crack textures are laid on the table and turn with the swirl, so the coils wind as the magma spreads
            uv.setXY(i, 0.5 + (x2 * cs - z2 * sn) / S, 0.5 + (x2 * sn + z2 * cs) / S);
        }
        p.needsUpdate = true; uv.needsUpdate = true;
        // the magma covers the die before it bends, then the original is hidden for good
        const sm = x.skin.material, cm = x.crack.material;
        sm.opacity = cover * (1 - fade); x.mesh.visible = cover < 1; if (x.mesh.userData.hidden0 === false) x.mesh.visible = false;
        // colour: yellow-white hot, orange, deep red, black stone, then ash grey
        let c = lerp3([1.6, 1.1, 0.4], [1.3, 0.45, 0.1], at(k, 0.2, 0.58));
        c = lerp3(c, [0.62, 0.12, 0.03], at(cool, 0, 0.55)); c = lerp3(c, [0.3, 0.26, 0.24], at(cool, 0.45, 1)); c = lerp3(c, [0.75, 0.72, 0.7], fade * 0.4);
        sm.color.setRGB(c[0], c[1], c[2]);
        // cracks: the grooves glow bright while liquid, then dim last
        cm.opacity = (0.35 * at(k, 0.2, 0.4) + 0.65 * at(k, 0.58, 0.72)) * (1 - at(k, 0.72, 0.9)) * (1 - 0.3 * fade); cm.color.setRGB(1, 0.5 - 0.25 * cool, 0.12);
        // the table glow follows the spread and goes out as the stone cools
        x.pool.scale.setScalar(R * (1.5 + s * 6)); x.pool.material.opacity = 0.9 * cover * (1 - cool) * (1 - fade);
        x.pool.material.color.setRGB(1, 0.5 - cool * 0.3, 0.1);
        // steam drifts outward over the cooling stone
        const t = at(k, 0.62, 0.97), sp = x.steam.geometry.attributes.position, o = x.mesh.position;
        for (let i = 0; i < x.dirs.length; i++) { const d = x.dirs[i], rad = R * (0.8 + d[2] * 2.2 + t * d[1] * 2); sp.setXYZ(i, o.x + Math.cos(d[0] + t * 0.8) * rad, 0.3 + t, o.z + Math.sin(d[0] + t * 0.8) * rad); }
        sp.needsUpdate = true; x.steam.material.opacity = 0.35 * ss(at(k, 0.62, 0.74)) * (1 - ss(at(k, 0.8, 0.94)));
        if (k > 0.995) { x.skin.visible = x.crack.visible = false; }
    },
    end(x) {
        x.mesh.castShadow = true; for (const c of x.mesh.children) if (c.isPoints) c.visible = true;
        x.mesh.visible = x.mesh.userData.hidden0 !== false;
        for (const o of x.own || []) { x.scene.remove(o); o.material.dispose(); if (o.isPoints) o.geometry.dispose(); }
        x.geo.dispose(); x.own = [];
    },
};

export default { mid: melt };
