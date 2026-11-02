// Ember Cage exit 23, Lava lamp melt: magma floods over the numbers first, then the die bulges into big slow blobs that sag and merge into a thick round puddle, crusts over to black stone with glowing cracks, and fades.
let FX = null;
const rng = (s) => () => ((s = (s * 16807) % 2147483647) / 2147483647);
function fx(T) {
    if (FX) return FX;
    const mk = (draw) => { const c = document.createElement('canvas'); c.width = c.height = 128; draw(c.getContext('2d')); const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; return t; };
    const soft = mk((g) => { const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); });
    // magma skin: dim base with big bright slow cells (grey, so the colour tint decides hot or cold)
    const lava = mk((g) => {
        const r = rng(11); g.fillStyle = '#2c2c2c'; g.fillRect(0, 0, 128, 128);
        for (let i = 0; i < 16; i++) for (const [ox, oy] of [[0, 0], [128, 0], [-128, 0], [0, 128], [0, -128]]) {
            const x = r() * 128, y = r() * 128, s = 18 + r() * 26, gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, s);
            gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
        }
    });
    // cracks: thin jagged white lines on black, drawn additive in glowing orange
    const crack = mk((g) => {
        const r = rng(53); g.fillStyle = '#000'; g.fillRect(0, 0, 128, 128); g.strokeStyle = '#fff'; g.lineCap = 'round';
        for (let i = 0; i < 14; i++) { let x = r() * 128, y = r() * 128, a = r() * 6.28; g.lineWidth = 2 + r() * 2.4; g.beginPath(); g.moveTo(x, y); for (let j = 0; j < 5; j++) { a += (r() - 0.5) * 1.6; x += Math.cos(a) * 16; y += Math.sin(a) * 16; g.lineTo(x, y); } g.stroke(); }
    });
    lava.repeat.set(4, 4); crack.repeat.set(4, 4); return (FX = { soft, lava, crack });
}
// a copy of a die's geometry with every triangle split into 4^n, so it bends smoothly; split triangles stay in place so face groups only scale by 4^n
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
const HOT = [1, 0.82, 0.38], MID = [0.95, 0.42, 0.09], DEEP = [0.5, 0.1, 0.03], STONE = [0.1, 0.08, 0.08], ASH = [0.38, 0.36, 0.35];
const NB = 24;

const melt = {
    key: 'a23-melt-lamp', name: 'Lava Lamp Melt', blurb: 'Magma floods over the numbers, the die swells into big slow blobs that merge into a thick puddle, then it hardens to black stone and fades.',
    dur: 3.6,
    start(x) {
        const T = x.THREE, F = fx(T); x.own = [];
        // shared geometry: bend a copy (overlay too), put the original back in end()
        x.geo0 = x.mesh.geometry; x.geo = subdivide(x.geo0, 2); x.mesh.geometry = x.geo;
        x.overlays = x.mesh.children.filter((c) => c.isMesh); x.overlays.forEach((c) => (c.geometry = x.geo));
        const p = x.geo.attributes.position, q = x.mesh.quaternion, v = new T.Vector3();
        x.qi = q.clone().invert(); x.w0 = []; let lo = Infinity, hi = -Infinity;
        x.bm = new Float32Array(NB);
        for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyQuaternion(q); x.w0.push(v.clone()); lo = Math.min(lo, v.y); hi = Math.max(hi, v.y); }
        x.lo = lo; x.tall = Math.max(1e-3, hi - lo);
        // furthest reach of the die at each angle, so the rounding pulls every direction to the same radius
        for (const w of x.w0) { const b = Math.floor(((Math.atan2(w.z, w.x) + Math.PI) / 6.2832) * NB) % NB; x.bm[b] = Math.max(x.bm[b], Math.hypot(w.x, w.z)); }
        let sum = 0; for (let i = 0; i < NB; i++) { x.bm[i] = Math.max(x.bm[i], 1e-3); sum += x.bm[i]; } x.Rm = sum / NB;
        // own materials: a dark stone body under a magma skin (child mesh on the same bent geometry, a hair bigger)
        x.mats0 = x.mesh.material;
        x.body = new T.MeshLambertMaterial({ color: 0x1a1210, emissive: 0x401006, transparent: true });
        x.skinMat = new T.MeshLambertMaterial({ color: 0x777777, map: F.lava, emissive: 0xffa040, emissiveMap: F.lava, transparent: true, opacity: 0, depthWrite: false });
        x.skin = new T.Mesh(x.geo, x.skinMat); x.skin.scale.setScalar(1.012); x.mesh.add(x.skin);
        x.crackMat = new T.MeshBasicMaterial({ map: F.crack, color: 0xff7a18, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false });
        x.cracks = new T.Mesh(x.geo, x.crackMat); x.cracks.scale.setScalar(1.02); x.mesh.add(x.cracks);
        x.glow = new T.Sprite(new T.SpriteMaterial({ map: F.soft, color: 0xff6a10, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
        x.glow.position.copy(x.mesh.position); x.scene.add(x.glow); x.own.push(x.glow);
        // steam: soft puffs drifting outward from the pool
        const n = 12, sp = new Float32Array(n * 3); x.sv = [];
        for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, s = 0.25 + Math.random() * 0.4; x.sv.push([Math.cos(a) * s, 0.6 + Math.random(), Math.sin(a) * s]); }
        const sg = new T.BufferGeometry(); sg.setAttribute('position', new T.BufferAttribute(sp, 3));
        x.steam = new T.Points(sg, new T.PointsMaterial({ map: F.soft, color: 0xb8b2ac, size: 14, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false }));
        x.steam.frustumCulled = false; x.scene.add(x.steam); x.own.push(x.steam);
    },
    tick(k, x) {
        // a see-through die still casts a shadow, so it stops once the pool is flat and fading
        x.mesh.castShadow = k < 0.8;
        // the set's own sparks would float on alone at the end
        for (const c of x.mesh.children) if (c.isPoints) c.visible = k < 0.85;
        const T = x.THREE, s = ss(k, 0.2, 0.58), round = ss(k, 0.4, 0.66), cool = at(k, 0.58, 0.84), fade = ss(k, 0.84, 0.965), skinIn = ss(k, 0.02, 0.2);
        const p = x.geo.attributes.position, v = new T.Vector3(), amp = Math.sin(Math.PI * at(k, 0.2, 0.72)) * 1.0, ph = k * 3.2;
        // magma covers the numbers (and cage) before anything bends: the skin is opaque by k = 0.2, melt starts at 0.2, then the dark body replaces the printed material
        x.mesh.material = skinIn >= 1 ? x.body : x.mats0;
        for (let i = 0; i < p.count; i++) {
            const w = x.w0[i], h = (w.y - x.lo) / x.tall, a = Math.atan2(w.z, w.x), f = ((a + Math.PI) / 6.2832) * NB, b0 = Math.floor(f) % NB, bm = x.bm[b0] + (x.bm[(b0 + 1) % NB] - x.bm[b0]) * (f - Math.floor(f));
            // a few huge lobes drifting round (the rounding pull is capped: a d4 has directions it barely reaches, which would shoot out as spikes), like blobs in a lamp, that merge as the rounding pulls them together
            const lobe = Math.sin(2 * a + ph) * 0.55 + Math.sin(3 * a - ph * 0.7 + 1.3) * 0.45;
            const g = (1 + round * (Math.min(1.6, x.Rm / bm) - 1)) * (1 + s * 1.3 * (1.15 - h * 0.6) * (1 + amp * lobe));
            const nh = h * (1 - s * 0.9);
            v.set(w.x * g, x.lo + nh * x.tall + 0.01, w.z * g).applyQuaternion(x.qi);
            p.setXYZ(i, v.x, v.y, v.z);
        }
        p.needsUpdate = true; x.geo.computeVertexNormals(); x.geo.computeBoundingSphere();
        x.overlays.forEach((c) => (c.visible = false)); x.mesh.visible = fade < 1;
        // colour: yellow-hot, orange, deep red, black stone, then ash grey while it fades
        const heat = Math.min(1, at(k, 0, 0.2) * 0.6 + s);
        let c = mix(MID, HOT, Math.max(0, 1 - cool * 2.2) * heat * (0.6 + 0.4 * Math.sin(k * 14)));
        c = mix(c, DEEP, ss(cool, 0, 0.5)); c = mix(c, STONE, ss(cool, 0.35, 1)); c = mix(c, ASH, fade * 0.6);
        x.skinMat.emissive.setRGB(c[0], c[1], c[2]); x.skinMat.color.setScalar(0.12 + 0.3 * cool);
        x.skinMat.map.offset.set(k * 0.15, k * 0.1);
        x.skinMat.opacity = skinIn * (1 - fade); x.body.opacity = 1 - fade;
        x.body.emissive.setRGB(c[0] * 0.3, c[1] * 0.3, c[2] * 0.3);
        // cracks glow once the crust forms and dim before the end
        x.crackMat.opacity = ss(cool, 0.25, 0.7) * (1 - ss(k, 0.8, 0.95)) * (1 - fade);
        x.glow.scale.setScalar(1.5 + s * 3.5 + cool); x.glow.material.opacity = 0.35 * Math.sin(Math.PI * at(k, 0, 0.8)) * (1 - fade);
        // steam drifts outward after the crust forms
        const sp = x.steam.geometry.attributes.position, o = x.mesh.position, t = Math.max(0, k - 0.55) * 2.2;
        for (let i = 0; i < x.sv.length; i++) sp.setXYZ(i, o.x + x.sv[i][0] * t * 1.8, o.y + x.sv[i][1] * t, o.z + x.sv[i][2] * t * 1.8);
        sp.needsUpdate = true; x.steam.material.opacity = 0.35 * ss(k, 0.58, 0.7) * (1 - ss(k, 0.8, 0.95));
    },
    end(x) {
        x.mesh.castShadow = true; for (const c of x.mesh.children) if (c.isPoints) c.visible = true;
        x.mesh.geometry = x.geo0; x.overlays.forEach((c) => { c.geometry = x.geo0; c.visible = true; }); x.mesh.visible = true;
        x.mesh.material = x.mats0; x.mesh.scale.setScalar(1);
        for (const m of [x.skin, x.cracks]) if (m) x.mesh.remove(m);
        for (const m of [x.body, x.skinMat, x.crackMat]) if (m) m.dispose();
        if (x.geo) x.geo.dispose();
        for (const o of x.own || []) { x.scene.remove(o); o.material.dispose(); if (o.isPoints) o.geometry.dispose(); }
        x.own = [];
    },
};

export default { mid: melt };
