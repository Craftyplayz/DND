// Ember Cage exits 28, Clinker Melt: rough a'a lava. Magma floods the faces, the die breaks into a rubbly pile of glowing clinker lumps that cool to dark rock, then crumbles to ash.
let FX = null;
function fx(T) {
    if (FX) return FX;
    const mk = (draw) => { const c = document.createElement('canvas'); c.width = c.height = 128; draw(c.getContext('2d')); const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; return t; };
    const soft = mk((g) => { const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); });
    // clinker skin: lumpy dark clots with bright molten cracks between them (the same picture lights and colours the surface)
    let s = 7; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const skin = mk((g) => {
        g.fillStyle = '#fff'; g.fillRect(0, 0, 128, 128);
        for (let i = 0; i < 46; i++) { const cx = r() * 128, cy = r() * 128, rad = 8 + r() * 12, sh = 70 + r() * 90;
            for (const [ox, oy] of [[0, 0], [-128, 0], [128, 0], [0, -128], [0, 128]]) { g.fillStyle = `rgb(${sh},${sh},${sh})`; g.beginPath();
                for (let j = 0; j < 7; j++) { const a = j / 7 * 6.283, q = rad * (0.7 + 0.35 * Math.sin(i * 3.1 + j * 2.3)); g[j ? 'lineTo' : 'moveTo'](cx + ox + Math.cos(a) * q, cy + oy + Math.sin(a) * q); } g.closePath(); g.fill(); } }
    });
    const lump = new T.IcosahedronGeometry(1, 0), pos = lump.attributes.position;
    // each lump is a knobbly rock: the same corner always moves the same way
    for (let i = 0; i < pos.count; i++) { const f = 0.7 + 0.5 * Math.abs(Math.sin(pos.getX(i) * 7.3 + pos.getY(i) * 3.9 + pos.getZ(i) * 5.1)); pos.setXYZ(i, pos.getX(i) * f, pos.getY(i) * f * 0.7, pos.getZ(i) * f); }
    lump.computeVertexNormals();
    return (FX = { soft, skin, lump });
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
const hash = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
// glow colour for a heat 0..1: black rock, deep red, orange, yellow-white
const heatRGB = (h, o) => { o[0] = Math.min(1, h * 2.2); o[1] = Math.max(0, Math.min(1, (h - 0.25) * 1.5)); o[2] = Math.max(0, (h - 0.7) * 1.8); return o; };

const clinker = {
    key: 'a28-melt-clinker', name: 'Clinker Melt', blurb: 'The die breaks into a rubbly pile of glowing magma lumps that cool to dark rock and crumble to ash.',
    dur: 3.6,
    start(x) {
        const T = x.THREE, F = fx(T);
        x.own = []; x.rgb = [0, 0, 0];
        // the materials are shared by every die of this kind: this die gets its own clones, wearing the clinker skin
        x.mats0 = x.mesh.material; x.arr = Array.isArray(x.mats0);
        x.mine = [].concat(x.mats0).map((m) => { const c = m.clone(); c.map = null; c.emissiveMap = F.skin; c.roughness = 1; c.metalness = 0; c.transparent = true; c.flatShading = true; c.needsUpdate = true; return c; });
        x.mesh.material = x.arr ? x.mine : x.mine[0];
        // the geometry is shared too, so the melt bends a copy (the churn overlay too) and end() puts the original back
        x.geo0 = x.mesh.geometry; x.geo = subdivide(x.geo0, 2); x.mesh.geometry = x.geo;
        x.overlays = x.mesh.children.filter((c) => c.isMesh); x.overlays.forEach((c) => (c.geometry = x.geo));
        // every vertex in table space (turned with the die, centred on it), and the die's size
        const p = x.geo.attributes.position, q = x.mesh.quaternion, v = new T.Vector3();
        x.qi = q.clone().invert(); x.w0 = []; let lo = Infinity, hi = -Infinity, rr = 0;
        for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyQuaternion(q); x.w0.push(v.clone()); lo = Math.min(lo, v.y); hi = Math.max(hi, v.y); rr = Math.max(rr, Math.hypot(v.x, v.z)); }
        x.lo = lo; x.tall = hi - lo; x.R = rr;
        // the lumps that break off, each with its own size, direction, speed and cooling pace
        x.lumps = [];
        for (let i = 0; i < 14; i++) {
            const m = new T.Mesh(F.lump, new T.MeshStandardMaterial({ color: 0x1a1412, emissive: 0xff5a10, roughness: 1, flatShading: true, transparent: true }));
            const a = i / 14 * 6.283 + hash(i, 1) * 0.8; m.visible = false; m.rotation.set(hash(i, 2) * 6, hash(i, 3) * 6, hash(i, 4) * 6);
            x.scene.add(m); x.own.push(m);
            x.lumps.push({ m, a, d: 0.9 + hash(i, 5) * 1.2, s: (0.2 + hash(i, 6) * 0.3) * rr, t0: 0.22 + hash(i, 7) * 0.2, cool: hash(i, 8) * 0.1 });
        }
        x.glow = new T.Sprite(new T.SpriteMaterial({ map: F.soft, color: 0xff5a10, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
        x.glow.position.copy(x.mesh.position); x.scene.add(x.glow); x.own.push(x.glow);
        // steam: grey puffs drifting outward from the pile
        x.puffs = [];
        for (let i = 0; i < 8; i++) {
            const s = new T.Sprite(new T.SpriteMaterial({ map: F.soft, color: 0xb8b0aa, transparent: true, depthWrite: false, opacity: 0 }));
            s.position.copy(x.mesh.position); s.userData = { a: hash(i, 9) * 6.283, d: 0.6 + hash(i, 10) * 0.8 }; x.scene.add(s); x.own.push(s); x.puffs.push(s);
        }
    },
    tick(k, x) {
        // a see-through die still casts a shadow, so it stops once the pool is flat and fading
        x.mesh.castShadow = k < 0.8;
        // the set's own sparks would float on alone at the end
        for (const c of x.mesh.children) if (c.isPoints) c.visible = k < 0.85;
        const T = x.THREE, o = x.mesh.position, R = x.R, rgb = x.rgb;
        const heat = at(k, 0, 0.2), flood = at(k, 0.12, 0.3), m = ease(at(k, 0.26, 0.62)), cool = at(k, 0.45, 0.82), gone = at(k, 0.78, 0.94);
        // heat of the whole body: white-hot while liquid, red as it cools, black rock at the end (the cracks keep a little longer)
        const h = (0.3 + 0.45 * heat) * (1 - cool * 0.95) * (1 - 0.2 * gone), ash = at(k, 0.7, 0.9);
        heatRGB(h, rgb);
        // magma floods the faces first: the printed numbers are swapped for the skin before anything bends
        const body = 1 - flood;
        for (const c of x.mine) {
            c.emissive.setRGB(rgb[0], rgb[1], rgb[2]); c.emissiveIntensity = 0.4 + 0.9 * flood * (1 - cool * 0.5);
            c.color.setRGB(0.02 + 0.09 * ash + body * 0.2, 0.02 + 0.09 * ash + body * 0.16, 0.02 + 0.09 * ash + body * 0.12);
            c.opacity = 1 - gone;
            if (flood > 0 && c.map) c.map = null;
            else if (flood === 0 && x.mats0 && !c.map && false) c.map = null;
        }
        x.overlays.forEach((c) => (c.visible = flood < 0.1));
        // the last moment: the stone, its shadow and the die's own sparks are gone for good
        x.mesh.children.forEach((c) => { if (!c.isMesh) c.visible = gone < 0.3; }); x.mesh.visible = gone < 1;
        // clinker: the body bulges and cracks into rough blocky bumps (stepped noise from the spot itself) and sags outward, so the outline turns ragged
        const p = x.geo.attributes.position, v = new T.Vector3(), cell = R * 0.4;
        for (let i = 0; i < p.count; i++) {
            const w = x.w0[i], hh = (w.y - x.lo) / x.tall;
            const bl = hash(Math.floor(w.x / cell + 0.5), Math.floor(w.z / cell + 0.5)), bl2 = hash(Math.floor(w.x / cell * 2.3), Math.floor(w.z / cell * 2.3) + 7);
            const s = Math.min(1, m * (0.6 + 0.6 * bl));
            const spread = 1 + s * (0.55 + 0.7 * bl2) * (1.1 - hh * 0.5), nh = hh * (1 - s * 0.85) * (1 - cool * 0.5) + 0.12 * bl * s;
            v.set(w.x * spread, x.lo + nh * x.tall + 0.01, w.z * spread).applyQuaternion(x.qi);
            p.setXYZ(i, v.x, v.y, v.z);
        }
        p.needsUpdate = true; x.geo.computeVertexNormals(); x.geo.computeBoundingSphere();
        // lumps break off the pile and slide outward, glowing, then darken at their own pace
        for (const l of x.lumps) {
            const t = at(k, l.t0, 0.7), e = ease(t), mm = l.m;
            mm.visible = t > 0 && gone < 1; mm.position.set(o.x + Math.cos(l.a) * R * l.d * e * 1.3, o.y + 0.02 + l.s * 0.3, o.z + Math.sin(l.a) * R * l.d * e * 1.3);
            mm.scale.setScalar(l.s * Math.min(1, t * 3)); mm.rotation.y += 0.02;
            const lh = Math.max(0, h * (1 - l.cool * 3) * (1 - at(k, 0.55 + l.cool, 0.85) * 0.6)); heatRGB(Math.min(1, lh), rgb);
            mm.material.emissive.setRGB(rgb[0], rgb[1], rgb[2]); mm.material.emissiveIntensity = 0.9 + 0.5 * t;
            mm.material.color.setRGB(0.02 + 0.09 * ash, 0.02 + 0.09 * ash, 0.02 + 0.09 * ash); mm.material.opacity = 1 - gone;
        }
        x.glow.scale.setScalar(R * (3 + 5 * m)); x.glow.material.opacity = 0.7 * Math.sin(Math.PI * at(k, 0, 0.75)) * (1 - cool);
        for (const s of x.puffs) { const u = at(k, 0.6, 1), d = s.userData; s.position.set(o.x + Math.cos(d.a) * R * (0.8 + u * d.d * 2), o.y + 0.5, o.z + Math.sin(d.a) * R * (0.8 + u * d.d * 2)); s.scale.setScalar(R * (1.5 + u * 2)); s.material.opacity = 0.16 * Math.sin(Math.PI * u) * (1 - gone); }
    },
    end(x) {
        x.mesh.castShadow = true; for (const c of x.mesh.children) if (c.isPoints) c.visible = true;
        x.mesh.material = x.mats0; x.mine.forEach((c) => c.dispose());
        x.mesh.geometry = x.geo0; x.overlays.forEach((c) => { c.geometry = x.geo0; c.visible = true; }); x.geo.dispose(); x.mesh.scale.setScalar(1); x.mesh.visible = true; x.mesh.children.forEach((c) => (c.visible = true));
        for (const o of x.own || []) { x.scene.remove(o); o.material.dispose(); }
        x.own = [];
    },
};

export default { mid: clinker };
