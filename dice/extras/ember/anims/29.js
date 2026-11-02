// Ember Cage exits 29, Core Breach Melt: the core melts first and bursts through the cage, magma floods across the faces, the shell slumps into a lobed pool, crusts to black stone with dimming cracks, then greys to ash and fades.
let FX = null, TX = null;
function fx(T) {
    if (FX) return FX;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return (FX = { soft: new T.CanvasTexture(c), plane: new T.PlaneGeometry(1, 1) });
}
// two seamless 256px tiles made once and shared by every die: flowing magma, and black stone whose cracks are holes (the magma shows through)
function tex(T) {
    if (TX) return TX;
    const S = 256; let s = 11; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const mk = (draw) => { const c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
        // drawn at 9 offsets so the tile repeats without a seam
        draw(g, (f) => { for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { g.save(); g.translate(i * S, j * S); f(); g.restore(); } });
        const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; if (T.SRGBColorSpace) t.colorSpace = T.SRGBColorSpace; return t; };
    const walk = (g, w, n, len, step) => { let x = r() * S, y = r() * S, a = r() * 6.283; g.lineWidth = w; g.beginPath(); g.moveTo(x, y);
        for (let j = 0; j < n; j++) { a += (r() - 0.5) * 1.5; x += Math.cos(a) * step; y += Math.sin(a) * step; g.lineTo(x, y); } g.stroke(); };
    const magma = mk((g, wrap) => {
        g.fillStyle = '#e8600e'; g.fillRect(0, 0, S, S);
        const cols = ['255,215,90', '255,150,30', '220,70,10', '255,190,60'];
        for (let i = 0; i < 46; i++) { const x = r() * S, y = r() * S, rad = 18 + r() * 40, c = cols[i % 4];
            wrap(() => { const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, `rgba(${c},.8)`); gr.addColorStop(1, `rgba(${c},0)`); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }); }
        // dark crust skin wandering over the flow, with bright seams beside it
        g.lineCap = 'round'; g.lineJoin = 'round';
        for (let i = 0; i < 16; i++) { const x0 = r() * S, y0 = r() * S, a0 = r() * 6.283; g.strokeStyle = 'rgba(110,22,6,.8)';
            wrap(() => { g.lineWidth = 3 + r() * 0; g.beginPath(); g.moveTo(x0, y0); let x = x0, y = y0, a = a0; for (let j = 0; j < 8; j++) { a += Math.sin(j * 1.7 + i) * 0.9; x += Math.cos(a) * 16; y += Math.sin(a) * 16; g.lineTo(x, y); } g.stroke(); }); }
    });
    const stone = mk((g, wrap) => {
        g.fillStyle = '#6e6761'; g.fillRect(0, 0, S, S);
        const cols = ['150,142,134', '70,64,60', '120,112,106'];
        for (let i = 0; i < 40; i++) { const x = r() * S, y = r() * S, rad = 14 + r() * 30, c = cols[i % 3];
            wrap(() => { const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, `rgba(${c},.7)`); gr.addColorStop(1, `rgba(${c},0)`); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }); }
        // cracks are holes in the stone
        g.globalCompositeOperation = 'destination-out'; g.strokeStyle = '#000'; g.lineCap = 'round'; g.lineJoin = 'round';
        for (let i = 0; i < 14; i++) { const x0 = r() * S, y0 = r() * S, a0 = r() * 6.283, w = 2 + r() * 2.5, sd = r() * 9;
            wrap(() => { g.lineWidth = w; g.beginPath(); g.moveTo(x0, y0); let x = x0, y = y0, a = a0; for (let j = 0; j < 10; j++) { a += Math.sin(j * 2.3 + sd) * 0.8; x += Math.cos(a) * 14; y += Math.sin(a) * 14; g.lineTo(x, y); } g.stroke(); }); }
    });
    return (TX = { magma, stone });
}
const sprite = (x, color) => { const s = new x.THREE.Sprite(new x.THREE.SpriteMaterial({ map: fx(x.THREE).soft, color, transparent: true, depthWrite: false, blending: x.THREE.AdditiveBlending }));
    s.position.copy(x.mesh.position); s.position.y += x.hi + 0.3; x.scene.add(s); x.own.push(s); return s; };
// a flat glow on the table that grows with the pool
const pool = (x, color) => { const m = new x.THREE.Mesh(fx(x.THREE).plane, new x.THREE.MeshBasicMaterial({ map: fx(x.THREE).soft, color, transparent: true, depthWrite: false, blending: x.THREE.AdditiveBlending }));
    m.rotation.x = -Math.PI / 2; m.position.set(x.mesh.position.x, 0.05, x.mesh.position.z); x.scene.add(m); x.own.push(m); return m; };
// n grey puffs that drift outward over the pool; move(t) with t in seconds-ish since they started
function steam(x, n) {
    const T = x.THREE, pos = new Float32Array(n * 3), a = [], o = x.mesh.position;
    for (let i = 0; i < n; i++) a.push([Math.random() * 6.283, 0.2 + Math.random() * 1.1, 0.25 + Math.random() * 0.5]);
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    const p = new T.Points(geo, new T.PointsMaterial({ map: fx(T).soft, color: 0xc4bcb4, size: 26, sizeAttenuation: false, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
    p.frustumCulled = false; p.visible = false; x.scene.add(p); x.own.push(p);
    p.move = (t) => { for (let i = 0; i < n; i++) { const q = a[i], r = (q[1] + t * q[2]) * x.R; pos[i * 3] = o.x + Math.cos(q[0]) * r; pos[i * 3 + 1] = o.y + x.hi + 0.5; pos[i * 3 + 2] = o.z + Math.sin(q[0]) * r; } geo.attributes.position.needsUpdate = true; };
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
const sm = (k) => k * k * (3 - 2 * k);
const at = (k, a, b) => Math.max(0, Math.min(1, (k - a) / (b - a)));
const SEG = 48;

const melt = {
    key: 'a29-melt-breach', name: 'Core Breach Melt', blurb: 'The core melts first and bursts through the cage, magma floods out across the die, then it crusts to black stone and fades to ash.',
    dur: 3.4,
    start(x) {
        const T = x.THREE, m = x.mesh;
        x.own = []; x.vis0 = m.visible;
        // the geometry and materials are shared by every die of this kind: bend a copy for the skins, and glow clones of the materials
        x.geo = subdivide(m.geometry, 2);
        x.mats0 = m.material; x.mats = [].concat(m.material).map((a) => a.clone()); m.material = Array.isArray(x.mats0) ? x.mats : x.mats[0];
        for (const a of x.mats) if (a.emissive) { a.emissiveMap = null; a.emissive.setRGB(1, 0.3, 0.04); a.emissiveIntensity = 0; a.needsUpdate = true; }
        // every vertex in table space (turned with the die, centred on it), its lowest and highest points and widest reach
        const p = x.geo.attributes.position, q = m.quaternion, v = new T.Vector3();
        x.qi = q.clone().invert(); x.w0 = []; let lo = Infinity, hi = -Infinity, R = 0;
        for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyQuaternion(q); x.w0.push(v.clone()); lo = Math.min(lo, v.y); hi = Math.max(hi, v.y); R = Math.max(R, Math.hypot(v.x, v.z)); }
        x.lo = lo; x.hi = hi; x.tall = hi - lo; x.R = R; x.us = 1 / (R * 3.2); x.ox = Math.random() * 9; x.oz = Math.random() * 9;
        // two skins on the bent copy, sharing its positions but with their own table-projected uvs, so the magma never stretches with the faces
        const t = tex(T), n = p.count;
        x.sg = new T.BufferGeometry(); x.sg.setAttribute('position', p); x.sg.setAttribute('uv', new T.BufferAttribute(new Float32Array(n * 2), 2));
        x.mm = new T.MeshBasicMaterial({ map: t.magma, transparent: true });
        x.sm = new T.MeshBasicMaterial({ map: t.stone, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
        for (const [mat, ro] of [[x.mm, 1], [x.sm, 2]]) { const s = new T.Mesh(x.sg, mat); s.position.copy(m.position); s.quaternion.copy(m.quaternion); s.frustumCulled = false; s.renderOrder = ro; s.visible = false; x.scene.add(s); x.own.push(s); mat.userData.s = s; }
        // the flood: a flat lobed fan above the die that grows from the middle and covers every face before the shape bends
        const dg = new T.BufferGeometry(), ix = [];
        dg.setAttribute('position', new T.BufferAttribute(new Float32Array((SEG + 1) * 3), 3)); dg.setAttribute('uv', new T.BufferAttribute(new Float32Array((SEG + 1) * 2), 2));
        for (let i = 0; i < SEG; i++) ix.push(0, 1 + ((i + 1) % SEG), 1 + i);
        dg.setIndex(ix);
        x.disc = new T.Mesh(dg, new T.MeshBasicMaterial({ map: t.magma, transparent: true, side: T.DoubleSide, depthWrite: false })); x.disc.renderOrder = 3; x.disc.frustumCulled = false; x.disc.visible = false;
        x.disc.position.set(m.position.x, m.position.y + hi + 0.15, m.position.z); x.scene.add(x.disc); x.own.push(x.disc);
        x.pool = pool(x, 0xff6a14); x.pool.scale.setScalar(0.1); x.core = sprite(x, 0xffa030); x.core.scale.setScalar(0.1); x.flash = sprite(x, 0xffe0a0); x.flash.scale.setScalar(0.1);
        x.steam = steam(x, 16);
    },
    tick(k, x) {
        // a see-through die still casts a shadow, so it stops once the pool is flat and fading
        x.mesh.castShadow = k < 0.8;
        // the set's own sparks would float on alone at the end
        for (const c of x.mesh.children) if (c.isPoints) c.visible = k < 0.85;
        const m = x.mesh, heat = at(k, 0, 0.16), br = sm(at(k, 0.14, 0.32)), sl = sm(at(k, 0.3, 0.7)), cool = at(k, 0.56, 0.84), crack = at(k, 0.8, 0.95), fade = at(k, 0.84, 0.95);
        // the core glows through the iron cage and the faces, then the real die is hidden under the flood
        const swap = br >= 1;
        m.visible = x.vis0 && !swap;
        for (const a of x.mats) if (a.emissive) a.emissiveIntensity = heat * 1.2 + br * 2;
        x.core.material.opacity = Math.min(1, heat * 0.8 + br * 0.4) * (1 - at(k, 0.3, 0.5)); x.core.scale.setScalar(x.R * (1.2 + heat * 1.2 + br * 2));
        // a flash and a bright ring at the moment the core bursts out
        const fl = Math.sin(Math.PI * at(k, 0.13, 0.4)); x.flash.material.opacity = fl * 0.8; x.flash.scale.setScalar(x.R * (2 + at(k, 0.13, 0.4) * 5));
        // the bent copy: bends only once the flood covers the faces; it spreads from underneath in uneven lobes
        const p = x.geo.attributes.position, uv = x.sg.attributes.uv, v = new x.THREE.Vector3(), us = x.us, dx = x.ox + k * 0.5, dz = x.oz + k * 0.3;
        for (let i = 0; i < p.count; i++) {
            const w = x.w0[i], h = (w.y - x.lo) / x.tall, a = Math.atan2(w.z, w.x);
            const wob = 0.75 + 0.25 * Math.sin(w.x * 5.1 / x.R * 1.2 + w.z * 3.7 / x.R * 1.2) * Math.cos(w.z * 4.3 / x.R - w.x * 2.2 / x.R);
            const s = Math.min(1, sl * wob * (1.25 - 0.5 * h));
            const lobe = 1 + 0.35 * Math.sin(3 * a + 1.3) + 0.2 * Math.sin(5 * a + 0.4);
            const nh = h * (1 - s) ** 1.6 * (1 - cool * 0.9), sp = 1 + s * (1.15 - nh) * 1.5 * lobe + cool * 0.2 * lobe;
            v.set(w.x * sp, x.lo + nh * x.tall + 0.01, w.z * sp);
            uv.setXY(i, (v.x + dx) * us, (v.z + dz) * us);
            v.applyQuaternion(x.qi); p.setXYZ(i, v.x, v.y, v.z);
        }
        p.needsUpdate = true; uv.needsUpdate = true;
        // the flood disc: grows from the middle with wobbling lobes, then thins away to show the skin under it (same texture, same uvs)
        const d = x.disc, dp = d.geometry.attributes.position, du = d.geometry.attributes.uv, Rc = x.R * 1.25 * br;
        d.visible = br > 0 && k < 0.5; d.material.opacity = 1 - at(k, 0.34, 0.46);
        du.setXY(0, dx * us, dz * us);
        for (let i = 0; i < SEG; i++) { const a = (i / SEG) * 6.283, r = Rc * (1 + 0.1 * Math.sin(3 * a + 1.3 + k * 6) + 0.06 * Math.sin(5 * a + 0.4 - k * 5)), px = Math.cos(a) * r, pz = Math.sin(a) * r;
            dp.setXYZ(i + 1, px, 0, pz); du.setXY(i + 1, (px + dx) * us, (pz + dz) * us); }
        dp.needsUpdate = true; du.needsUpdate = true;
        // colours: yellow-hot magma darkens to deep red, the black stone crusts over it, the cracks (holes in the stone) dim, then the stone greys to ash
        const mm = x.mm, sm_ = x.sm, op = 1 - fade, dim = 1 - crack * 0.95;
        mm.userData.s.visible = swap || br > 0.6; sm_.userData.s.visible = cool > 0 && fade < 1; mm.userData.s.visible = mm.userData.s.visible && fade < 1;
        mm.color.setRGB(1 - cool * 0.45, (1 - cool * 0.8) * (1 - cool * 0.2), 1 - cool * 0.9).multiplyScalar(dim); d.material.color.copy(mm.color);
        mm.opacity = op;
        sm_.opacity = sm(at(k, 0.58, 0.8)) * op; sm_.color.setScalar(0.17 + fade * 0.6);
        x.pool.scale.setScalar(x.R * (2 + sl * 5)); x.pool.material.opacity = Math.min(1, br * 1.5) * (1 - cool) * 0.8; x.pool.material.color.setRGB(1, 0.42 - cool * 0.3, 0.08);
        // steam drifts outward off the cooling pool
        const sv = at(k, 0.58, 1); x.steam.visible = sv > 0; x.steam.move(sv * 1.4); x.steam.material.opacity = 0.35 * Math.sin(Math.PI * sv);
    },
    end(x) {
        x.mesh.castShadow = true; for (const c of x.mesh.children) if (c.isPoints) c.visible = true;
        const m = x.mesh;
        m.visible = x.vis0; m.material = x.mats0; x.mats.forEach((a) => a.dispose()); x.geo.dispose(); x.sg.dispose(); x.mm.dispose(); x.sm.dispose();
        // the two shared tiles stay cached for the next die; everything else this exit made goes
        for (const o of x.own || []) { x.scene.remove(o); o.material.dispose(); if (o.isPoints || o === x.disc) o.geometry.dispose(); }
        x.own = [];
    },
};

export default { mid: melt };
