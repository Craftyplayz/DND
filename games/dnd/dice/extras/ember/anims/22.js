// Ember Cage exits 22, Magma Storyboard: the die heats up, a magma skin floods over the numbers, it slumps into a lobed pool, crusts over from the edge in with glowing cracks, steams, then greys to ash and fades.
let FX = null;
function fx(T) {
    if (FX) return FX;
    const mk = (w, f) => { const c = document.createElement('canvas'); c.width = c.height = w; f(c.getContext('2d'), w); return c; };
    const tex = (c) => { const t = new T.CanvasTexture(c); if (T.SRGBColorSpace) t.colorSpace = T.SRGBColorSpace; return t; };
    const soft = mk(64, (g) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
        gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
    let s = 7; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    // magma: orange rock with bright yellow veins and dark clots, drawn once
    const lava = mk(256, (g, w) => {
        g.fillStyle = '#e2560f'; g.fillRect(0, 0, w, w);
        for (let i = 0; i < 26; i++) { g.fillStyle = `rgba(90,12,2,${0.25 + rnd() * 0.3})`; g.beginPath(); g.arc(rnd() * w, rnd() * w, 10 + rnd() * 28, 0, 7); g.fill(); }
        g.globalCompositeOperation = 'lighter'; g.lineCap = 'round';
        for (let i = 0; i < 40; i++) { const x = rnd() * w, y = rnd() * w, a = rnd() * 6.28, t = (rnd() - 0.5) * 2.4;
            g.strokeStyle = `rgba(255,${170 + rnd() * 60 | 0},60,${0.25 + rnd() * 0.3})`; g.lineWidth = 3 + rnd() * 8;
            g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a + t) * 60, y + Math.sin(a + t) * 60, x + Math.cos(a + t * 2) * 100, y + Math.sin(a + t * 2) * 100); g.stroke(); }
    });
    // crust: voronoi plates; colour map is stone grey, alpha map holds when each plate hardens (edge plates first) and 0 in the cracks
    const N = 54, sd = Array.from({ length: N }, () => { const x = rnd(), y = rnd(); return { x, y, g: 50 + rnd() * 60, h: Math.min(1, Math.max(0.15, 0.25 + 1.5 * Math.hypot(x - 0.5, y - 0.5) + (rnd() - 0.5) * 0.25)) }; });
    const W = 256, col = new ImageData(W, W), hard = new ImageData(W, W);
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
        let d1 = 1e9, d2 = 1e9, b = null;
        for (const p of sd) { const d = Math.hypot(x / W - p.x, y / W - p.y) * W; if (d < d1) { d2 = d1; d1 = d; b = p; } else if (d < d2) d2 = d; }
        const e = d2 - d1, i = (y * W + x) * 4, v = e < 2.4 ? 0 : b.g * Math.min(1, 0.6 + e / 14);
        col.data.set([v, v * 0.95, v * 0.92, 255], i); hard.data.set(e < 2.4 ? [0, 0, 0, 255] : [b.h * 255, b.h * 255, b.h * 255, 255], i);
    }
    return (FX = { soft: tex(soft), plane: new T.PlaneGeometry(1, 1), lava: tex(lava), crust: tex(mk(W, (g) => g.putImageData(col, 0, 0))), hard: new T.CanvasTexture(mk(W, (g) => g.putImageData(hard, 0, 0))) });
}
const sprite = (x, color) => { const s = new x.THREE.Sprite(new x.THREE.SpriteMaterial({ map: fx(x.THREE).soft, color, transparent: true, depthWrite: false, blending: x.THREE.AdditiveBlending }));
    s.position.copy(x.mesh.position); x.scene.add(s); x.own.push(s); return s; };
const pool = (x, color) => { const m = new x.THREE.Mesh(fx(x.THREE).plane, new x.THREE.MeshBasicMaterial({ map: fx(x.THREE).soft, color, transparent: true, depthWrite: false, blending: x.THREE.AdditiveBlending }));
    m.rotation.x = -Math.PI / 2; m.position.set(x.mesh.position.x, 0.05, x.mesh.position.z); x.scene.add(m); x.own.push(m); return m; };
// n grey puffs drifting outward and up off the pool; move(t) with t seconds since they started
function steam(x, n, size) {
    const T = x.THREE, pos = new Float32Array(n * 3), vel = [], o = x.mesh.position.clone();
    for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, s = 0.6 + Math.random() * 0.9; vel.push([Math.cos(a) * s, 0.5 + Math.random(), Math.sin(a) * s]); }
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    const p = new T.Points(geo, new T.PointsMaterial({ map: fx(T).soft, color: 0xb9b2ac, size, sizeAttenuation: false, transparent: true, depthWrite: false }));
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
const at = (k, a, b) => Math.max(0, Math.min(1, (k - a) / (b - a)));
const ss = (k, a, b) => { const t = at(k, a, b); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const HOT = [1, 0.85, 0.45], MID = [1, 0.5, 0.12], DEEP = [0.8, 0.14, 0.05], STONE = [0.6, 0.55, 0.52], ASH = [1.1, 1.08, 1.05];

const melt = {
    key: 'a22-melt-storyboard', name: 'Magma Melt', blurb: 'The die glows, a magma skin floods over the numbers, it slumps into a lobed pool, crusts over from the edge in with glowing cracks, then greys to ash and fades.',
    dur: 3.4,
    start(x) {
        const T = x.THREE, f = fx(T);
        x.own = [];
        // the materials are shared by every die of this kind, so heat up and hide private clones; end() puts the originals back
        x.mats0 = x.mesh.material; x.mesh.material = Array.isArray(x.mats0) ? x.mats0.map((m) => m.clone()) : x.mats0.clone();
        x.mats = [].concat(x.mesh.material);
        // the geometry is shared too, so the melt bends a copy (the churn overlay too)
        x.geo0 = x.mesh.geometry; x.geo = subdivide(x.geo0, 2); x.mesh.geometry = x.geo;
        x.overlays = x.mesh.children.filter((c) => c.isMesh); x.overlays.forEach((c) => (c.geometry = x.geo));
        // every vertex in table space (turned with the die, centred on it), its lowest and highest points, and its widest reach
        const p = x.geo.attributes.position, q = x.mesh.quaternion, v = new T.Vector3();
        x.qi = q.clone().invert(); x.w0 = []; let lo = Infinity, hi = -Infinity, r0 = 0;
        for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyQuaternion(q); x.w0.push(v.clone()); lo = Math.min(lo, v.y); hi = Math.max(hi, v.y); r0 = Math.max(r0, Math.hypot(v.x, v.z)); }
        x.lo = lo; x.tall = hi - lo; x.r0 = r0;
        // two skins on the same bending vertices (flat map from the original table position, so the pattern flows with the melt): magma, and the crust over it
        const uv = new Float32Array(p.count * 2);
        x.w0.forEach((w, i) => { uv[i * 2] = 0.5 + w.x / (2.02 * r0); uv[i * 2 + 1] = 0.5 + w.z / (2.02 * r0); });
        const sg = new T.BufferGeometry(); sg.setAttribute('position', p); sg.setAttribute('normal', x.geo.attributes.normal); sg.setAttribute('uv', new T.BufferAttribute(uv, 2)); x.sg = sg;
        const skin = (mat, order, off) => { Object.assign(mat, { transparent: true, opacity: 0, polygonOffset: true, polygonOffsetFactor: off, polygonOffsetUnits: off });
            const m = new T.Mesh(sg, mat); m.frustumCulled = false; m.renderOrder = order; x.mesh.add(m); return m; };
        x.lava = skin(new T.MeshBasicMaterial({ map: f.lava }), 1, -2);
        x.crust = skin(new T.MeshBasicMaterial({ map: f.crust, alphaMap: f.hard, alphaTest: 1 }), 2, -4);
        x.crust.visible = false;
        x.pool = pool(x, 0xff7a18); x.pool.scale.setScalar(0.1);
        x.heat = sprite(x, 0xff6a10); x.heat.scale.setScalar(0.1); x.steam = steam(x, 16, 26);
        x.sz = Math.max(2 * r0, x.tall);
    },
    tick(k, x) {
        // a see-through die still casts a shadow, so it stops once the pool is flat and fading
        x.mesh.castShadow = k < 0.8;
        // the set's own sparks would float on alone at the end
        for (const c of x.mesh.children) if (c.isPoints) c.visible = k < 0.85;
        const heat = ss(k, 0, 0.18), molten = ss(k, 0.16, 0.34), m = ss(k, 0.34, 0.66), cool = at(k, 0.66, 0.86), crack = ss(k, 0.8, 0.92), fade = ss(k, 0.84, 0.96);
        // heat up: the cage and faces glow orange at first
        for (const a of x.mats) { if (a.emissive) a.emissive.setRGB(heat * 0.8, heat * 0.28, heat * 0.05); a.visible = molten < 1; }
        // the magma skin floods over the faces BEFORE anything bends, so the numbers are gone when the shape moves
        x.overlays.forEach((c) => (c.visible = molten < 0.5));
        const lc = mix(mix(mix(HOT, MID, m), DEEP, ss(cool, 0, 0.5)), [0.12, 0.03, 0.02], ss(cool, 0.4, 1) * (1 - 0.6 * (1 - crack)));
        x.lava.material.opacity = molten * (1 - fade); x.lava.material.color.setRGB(...lc);
        // the crust spreads in from the edge: the threshold on each plate's hardening time drops from 1 to 0
        x.crust.visible = cool > 0;
        const cc = mix(mix(DEEP.map((c) => c * 1.4), STONE, ss(cool, 0.1, 0.9)), ASH, fade * 0.8);
        x.crust.material.color.setRGB(...cc); x.crust.material.alphaTest = Math.max(0.03, 1.05 - cool * 1.25) * (1 - fade); x.crust.material.opacity = 1 - fade; x.crust.material.transparent = fade > 0;
        const p = x.geo.attributes.position, v = new x.THREE.Vector3(), rr = 1.2 / x.r0;
        for (let i = 0; i < p.count; i++) {
            const w = x.w0[i], h = (w.y - x.lo) / x.tall, a = Math.atan2(w.z, w.x);
            // a lumpy slump: each spot sags at its own speed (from where it is, so split vertices stay joined) and the top goes first
            const wob = 0.75 + 0.25 * Math.sin(w.x * 5.1 * rr + w.z * 3.7 * rr) * Math.cos(w.z * 4.3 * rr - w.x * 2.2 * rr);
            const s = Math.min(1, m * wob * (0.7 + 0.5 * h));
            // seen from above the melt is spreading: lower means wider, in uneven lobes like a running puddle
            const lobe = 1 + 0.35 * Math.sin(3 * a + 1.3) + 0.2 * Math.sin(5 * a + 0.4);
            const nh = h * (1 - s) ** 1.6 * (1 - cool * 0.9), spread = 1 + s * (1.15 - nh) * 2 * lobe + cool * 0.4 * lobe;
            v.set(w.x * spread, x.lo + nh * x.tall + 0.01, w.z * spread).applyQuaternion(x.qi);
            p.setXYZ(i, v.x, v.y, v.z);
        }
        p.needsUpdate = true; x.geo.computeVertexNormals(); x.geo.computeBoundingSphere();
        // glow under the pool, then steam drifting out while it cools
        x.pool.scale.setScalar(x.r0 * (2.4 + m * 7)); x.pool.material.opacity = molten * 0.9 * (1 - cool * 0.75) * (1 - fade); x.pool.material.color.setRGB(1, 0.5 - cool * 0.3, 0.1 - cool * 0.06);
        x.heat.scale.setScalar(x.sz * (1.6 + m * 2)); x.heat.material.opacity = 0.7 * heat * (1 - molten * 0.5) * (1 - cool);
        x.steam.move(Math.max(0, k - 0.62) * 2.2 * x.r0); x.steam.material.opacity = 0.5 * ss(k, 0.66, 0.78) * (1 - ss(k, 0.9, 1));
    },
    end(x) {
        x.mesh.castShadow = true; for (const c of x.mesh.children) if (c.isPoints) c.visible = true;
        x.mesh.geometry = x.geo0; x.overlays.forEach((c) => { c.geometry = x.geo0; c.visible = true; });
        x.mats.forEach((m) => m.dispose()); x.mesh.material = x.mats0;
        for (const s of [x.lava, x.crust]) { x.mesh.remove(s); s.material.dispose(); }
        x.sg.dispose(); x.geo.dispose();
        for (const o of x.own || []) { x.scene.remove(o); o.material.dispose(); if (o.isPoints) o.geometry.dispose(); }
        x.own = [];
    },
};

export default { mid: melt };
