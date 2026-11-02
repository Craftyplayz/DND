// Ember Cage exits 11, Melt: the die's own shape slumps from the top down, runs out at the base into a glowing puddle, then cools and fades.
let FX = null;
function fx(T) {
    if (FX) return FX;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return (FX = { soft: new T.CanvasTexture(c), plane: new T.PlaneGeometry(1, 1) });
}
const sprite = (x, color) => { const s = new x.THREE.Sprite(new x.THREE.SpriteMaterial({ map: fx(x.THREE).soft, color, transparent: true, depthWrite: false, blending: x.THREE.AdditiveBlending }));
    s.position.copy(x.mesh.position); x.scene.add(s); x.own.push(s); return s; };
const pool = (x, color) => { const m = new x.THREE.Mesh(fx(x.THREE).plane, new x.THREE.MeshBasicMaterial({ map: fx(x.THREE).soft, color, transparent: true, depthWrite: false, blending: x.THREE.AdditiveBlending }));
    m.rotation.x = -Math.PI / 2; m.position.set(x.mesh.position.x, 0.05, x.mesh.position.z); x.scene.add(m); x.own.push(m); return m; };
// n points drifting up off the die; move(t) with t seconds since they started
function rise(x, n, color, size) {
    const T = x.THREE, pos = new Float32Array(n * 3), vel = [], o = x.mesh.position.clone();
    for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, s = 0.3 + Math.random() * 0.4; vel.push([Math.cos(a) * s, 1 + Math.random() * 1.5, Math.sin(a) * s]); }
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    const p = new T.Points(geo, new T.PointsMaterial({ map: fx(T).soft, color, size, sizeAttenuation: false, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
    p.frustumCulled = false; x.scene.add(p); x.own.push(p);
    p.move = (t) => { for (let i = 0; i < n; i++) { pos[i * 3] = o.x + vel[i][0] * t; pos[i * 3 + 1] = o.y + vel[i][1] * t; pos[i * 3 + 2] = o.z + vel[i][2] * t; } geo.attributes.position.needsUpdate = true; };
    return p;
}
// a copy of a die's geometry with every triangle split into 4^n, so it bends smoothly instead of folding at the few real edges;
// each split triangle stays in place in the list, so the face groups (one material per face) only scale by 4^n
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
        for (const gr of g.groups) out.addGroup(gr.start * 4, gr.count * 4, gr.materialIndex);
        if (g !== geo) g.dispose(); g = out;
    }
    return g;
}
const ease = (k) => 1 - (1 - k) ** 3;
const at = (k, a, b) => Math.max(0, Math.min(1, (k - a) / (b - a)));

const melt = {
    key: 'a11-melt', name: 'Melt', blurb: 'The die itself slumps and sags from the top down, runs out into a glowing puddle, then cools and fades.',
    dur: 2.2,
    start(x) {
        x.own = [];
        // the geometry is shared by every die of this kind, so the melt bends a copy (the churn overlay too) and end() puts the original back
        x.geo0 = x.mesh.geometry; x.geo = subdivide(x.geo0, 2); x.mesh.geometry = x.geo;
        x.overlays = x.mesh.children.filter((c) => c.isMesh); x.overlays.forEach((c) => (c.geometry = x.geo));
        // every vertex in table space (turned with the die, centred on it), and its lowest and highest points
        const p = x.geo.attributes.position, q = x.mesh.quaternion, v = new x.THREE.Vector3();
        x.qi = q.clone().invert(); x.w0 = []; let lo = Infinity, hi = -Infinity;
        for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyQuaternion(q); x.w0.push(v.clone()); lo = Math.min(lo, v.y); hi = Math.max(hi, v.y); }
        x.lo = lo; x.tall = hi - lo;
        x.pool = pool(x, 0xff7a18); x.pool.scale.setScalar(0.1);
        x.heat = sprite(x, 0xff6a10); x.heat.scale.setScalar(0.1); x.steam = rise(x, 14, 0xff9a40, 5);
    },
    tick(k, x) {
        const m = ease(at(k, 0, 0.7)), cool = at(k, 0.55, 1), p = x.geo.attributes.position, v = new x.THREE.Vector3();
        for (let i = 0; i < p.count; i++) {
            const w = x.w0[i], h = (w.y - x.lo) / x.tall, a = Math.atan2(w.z, w.x);
            // a lumpy slump: each spot sags at its own speed (from where it is, so split vertices stay joined) and the top goes first
            const wob = 0.75 + 0.25 * Math.sin(w.x * 5.1 + w.z * 3.7) * Math.cos(w.z * 4.3 - w.x * 2.2);
            const s = Math.min(1, m * wob * (0.7 + 0.5 * h));
            // the camera looks straight down, so the melt has to read as spreading: lower means wider, in uneven lobes like a running puddle
            const lobe = 1 + 0.35 * Math.sin(3 * a + 1.3) + 0.2 * Math.sin(5 * a + 0.4);
            const nh = h * (1 - s) ** 1.6 * (1 - cool * 0.9), spread = 1 + s * (1.15 - nh) * 1.4 * lobe + cool * 0.35 * lobe;
            v.set(w.x * spread, x.lo + nh * x.tall + 0.01, w.z * spread).applyQuaternion(x.qi);
            p.setXYZ(i, v.x, v.y, v.z);
        }
        p.needsUpdate = true; x.geo.computeVertexNormals(); x.geo.computeBoundingSphere();
        x.pool.scale.setScalar(0.5 + m * 5 + cool * 1); x.pool.material.opacity = Math.min(1, m * 1.5) * (1 - cool);
        x.pool.material.color.setRGB(1, 0.5 - cool * 0.35, 0.1 - cool * 0.08);
        x.heat.scale.setScalar(1 + m * 2.5); x.heat.material.opacity = 0.5 * Math.sin(Math.PI * at(k, 0, 0.8));
        x.steam.move(k * 1.6); x.steam.material.opacity = 1 - k;
        // the last moment: what's left fades out with the puddle
        x.mesh.scale.y = Math.max(0.001, 1 - at(k, 0.85, 1));
    },
    end(x) {
        x.mesh.geometry = x.geo0; x.overlays.forEach((c) => (c.geometry = x.geo0)); x.geo.dispose(); x.mesh.scale.setScalar(1);
        for (const o of x.own || []) { x.scene.remove(o); o.material.dispose(); if (o.isPoints) o.geometry.dispose(); }
        x.own = [];
    },
};

export default { mid: melt };
