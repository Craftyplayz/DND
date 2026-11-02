// Ember Cage exits 27, Obsidian Melt: magma floods over the numbers, the die slumps into a pool, then chills fast into glossy black glass that splits with a bright crack and fades.
let FX = null;
const rng = (s) => () => ((s = (s * 16807) % 2147483647) / 2147483647);
// canvas textures and the flat plane, made once and shared by every die: soft glow, lava mottling, crack web, glass glint streaks
function fx(T) {
    if (FX) return FX;
    const mk = (n, draw) => { const c = document.createElement('canvas'); c.width = c.height = n; draw(c.getContext('2d'), n, rng(11)); return new T.CanvasTexture(c); };
    return (FX = {
        plane: new T.PlaneGeometry(1, 1),
        soft: mk(64, (g, n) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, n, n); }),
        lava: mk(128, (g, n, r) => {
            g.fillStyle = '#c23a06'; g.fillRect(0, 0, n, n);
            for (let i = 0; i < 40; i++) { const x = r() * n, y = r() * n, s = 10 + r() * 26, gr = g.createRadialGradient(x, y, 0, x, y, s); gr.addColorStop(0, r() < 0.5 ? 'rgba(255,225,120,.9)' : 'rgba(80,10,0,.8)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, n, n); }
        }),
        crack: mk(256, (g, n, r) => {
            g.translate(n / 2, n / 2); g.lineCap = 'round'; g.shadowColor = '#fff'; g.shadowBlur = 6; g.strokeStyle = '#fff';
            const branch = (x, y, a, len, w) => {
                if (len < 10) return; g.lineWidth = w; g.beginPath(); g.moveTo(x, y);
                for (let j = 0; j < 4; j++) { a += (r() - 0.5) * 0.7; x += Math.cos(a) * len / 4; y += Math.sin(a) * len / 4; g.lineTo(x, y); }
                g.stroke(); branch(x, y, a + (r() - 0.5) * 0.4, len * 0.7, w * 0.8); if (r() < 0.7) branch(x, y, a + (r() < 0.5 ? 1 : -1) * (0.6 + r() * 0.6), len * 0.5, w * 0.6);
            };
            for (let i = 0; i < 7; i++) branch(0, 0, (i / 7) * 6.283 + r() * 0.5, 50 + r() * 22, 3.2);
            g.setTransform(1, 0, 0, 1, 0, 0); g.shadowBlur = 0; g.globalCompositeOperation = 'destination-in'; const m = g.createRadialGradient(128, 128, 60, 128, 128, 110); m.addColorStop(0, '#fff'); m.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = m; g.fillRect(0, 0, n, n);
        }),
        glint: mk(128, (g, n) => {
            const gr = g.createLinearGradient(0, 0, n, n); gr.addColorStop(0.3, 'rgba(255,255,255,0)'); gr.addColorStop(0.42, 'rgba(255,255,255,.9)'); gr.addColorStop(0.48, 'rgba(255,255,255,0)'); gr.addColorStop(0.58, 'rgba(255,255,255,.5)'); gr.addColorStop(0.62, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, n, n);
            g.globalCompositeOperation = 'destination-in'; const m = g.createRadialGradient(64, 64, 0, 64, 64, 64); m.addColorStop(0.5, '#fff'); m.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = m; g.fillRect(0, 0, n, n);
        }),
    });
}
// a flat plane on the table at the die's spot
const flat = (x, map, color, blending, y) => {
    const m = new x.THREE.Mesh(fx(x.THREE).plane, new x.THREE.MeshBasicMaterial({ map, color, transparent: true, opacity: 0, depthWrite: false, blending }));
    m.rotation.x = -Math.PI / 2; m.position.set(x.mesh.position.x, y, x.mesh.position.z); x.scene.add(m); x.own.push(m); return m;
};
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
        for (const gr of g.groups) out.addGroup(gr.start * 4, gr.count * 4, gr.materialIndex);
        if (g !== geo) g.dispose(); g = out;
    }
    return g;
}
const ease = (k) => 1 - (1 - k) ** 3;
const at = (k, a, b) => Math.max(0, Math.min(1, (k - a) / (b - a)));
const mix = (a, b, k) => a + (b - a) * k;

const melt = {
    key: 'a27-melt-obsidian', name: 'Obsidian Melt', blurb: 'Magma floods over the numbers, the die slumps into a pool, then chills into glossy black glass that cracks open and fades.',
    dur: 3.4,
    start(x) {
        const T = x.THREE, f = fx(T); x.own = [];
        // shared geometry: bend a copy (overlay glow too); end() puts the original back
        x.geo0 = x.mesh.geometry; x.geo = subdivide(x.geo0, 2); x.mesh.geometry = x.geo;
        x.overlays = x.mesh.children.filter((c) => c.isMesh); x.overlays.forEach((c) => (c.geometry = x.geo));
        const p = x.geo.attributes.position, q = x.mesh.quaternion, v = new T.Vector3();
        x.qi = q.clone().invert(); x.w0 = []; let lo = Infinity, hi = -Infinity, R = 0;
        for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyQuaternion(q); x.w0.push(v.clone()); lo = Math.min(lo, v.y); hi = Math.max(hi, v.y); R = Math.max(R, Math.hypot(v.x, v.z)); }
        x.lo = lo; x.tall = hi - lo; x.R = R;
        // the magma/glass skin, a child sharing the bending geometry: it covers the printed faces and cage before anything bends
        x.mats0 = x.mesh.material; x.off = new T.MeshBasicMaterial({ visible: false });
        x.skin = new T.Mesh(x.geo, new T.MeshStandardMaterial({ color: 0x1a0500, emissive: 0xffffff, emissiveMap: f.lava, roughness: 0.5, metalness: 0.1, transparent: true, opacity: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
        x.skin.scale.setScalar(1.012); x.mesh.add(x.skin);
        // table: a dark pool under the die, a bright crack web and a sliding glint over it, soft heat glow
        x.pool = flat(x, f.soft, 0xff5a10, T.NormalBlending, 0.03);
        x.web = flat(x, f.crack, 0xfff0b0, T.AdditiveBlending, 1.5);
        x.glint = flat(x, f.glint, 0xffffff, T.AdditiveBlending, 1.6);
        x.glow = flat(x, f.soft, 0xff6a10, T.AdditiveBlending, 0.02);
        // steam: grey puffs drifting outward along the table (up is invisible from above)
        x.n = 16; x.sp = new Float32Array(x.n * 3); x.sv = [];
        for (let i = 0; i < x.n; i++) { const a = Math.random() * 6.283; x.sv.push([Math.cos(a), Math.sin(a), 0.5 + Math.random() * 0.8]); }
        const sg = new T.BufferGeometry(); sg.setAttribute('position', new T.BufferAttribute(x.sp, 3));
        x.steam = new T.Points(sg, new T.PointsMaterial({ map: f.soft, color: 0xb8b2ac, size: 34, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false }));
        x.steam.frustumCulled = false; x.scene.add(x.steam); x.own.push(x.steam);
        x.origin = x.mesh.position.clone();
    },
    tick(k, x) {
        // a see-through die still casts a shadow, so it stops once the pool is flat and fading
        x.mesh.castShadow = k < 0.8;
        // the set's own sparks would float on alone at the end
        for (const c of x.mesh.children) if (c.isPoints) c.visible = k < 0.85;
        const m = ease(at(k, 0.14, 0.58)), chill = at(k, 0.46, 0.58), fade = at(k, 0.8, 0.95), crack = at(k, 0.68, 0.76), R = x.R;
        const p = x.geo.attributes.position, v = new x.THREE.Vector3(), mat = x.skin.material;
        // the skin comes in first, so the bend only ever moves molten rock; the churn overlay steps aside once covered
        const cover = at(k, 0.02, 0.16);
        x.overlays.forEach((c) => (c.visible = cover < 0.5));
        mat.opacity = cover * (1 - fade);
        // once the skin is solid the original die is switched off, so no cage or number shows through the bend
        x.mesh.material = cover >= 1 ? x.off : x.mats0;
        // yellow-white heat settles to orange as it slumps, then goes out as the glass forms
        const e = Math.min(1, at(k, 0, 0.2) * 1.6) * (1 - chill) * (1 - at(k, 0.3, 0.5) * 0.35) * (0.9 + 0.1 * Math.sin(k * 30));
        mat.emissive.setRGB(1, 0.8 - 0.3 * m, 0.4 - 0.25 * m).multiplyScalar(e);
        // the split lights the glass from inside for a moment
        mat.emissive.r += 0.12 * crack * (1 - at(k, 0.72, 0.92)); mat.emissive.g += 0.03 * crack * (1 - at(k, 0.72, 0.9));
        mat.color.setRGB(mix(0.5, 0.012, chill), mix(0.12, 0.012, chill), mix(0.02, 0.016, chill));
        // glass: glossy, smooth, a little metallic so the lights streak across it
        mat.roughness = mix(0.55, 0.05, chill); mat.metalness = mix(0.1, 0.25, chill);
        for (let i = 0; i < p.count; i++) {
            const w = x.w0[i], hh = (w.y - x.lo) / x.tall, a = Math.atan2(w.z, w.x);
            // each spot sags at its own pace (from its position, so split vertices stay joined), the top first
            const wob = 0.75 + 0.25 * Math.sin(w.x / R * 4) * Math.cos(w.z / R * 3.4 - w.x / R * 1.8);
            const s = Math.min(1, m * wob * (0.7 + 0.5 * hh));
            // top-down the melt reads as spreading: lower means wider, in uneven lobes
            const lobe = 1 + 0.35 * Math.sin(3 * a + 1.3) + 0.2 * Math.sin(5 * a + 0.4);
            const nh = hh * (1 - s) ** 1.6, spread = 1 + s * (1.15 - nh) * 1.3 * lobe;
            v.set(w.x * spread, x.lo + nh * x.tall + 0.01, w.z * spread).applyQuaternion(x.qi);
            p.setXYZ(i, v.x, v.y, v.z);
        }
        p.needsUpdate = true; x.geo.computeVertexNormals(); x.geo.computeBoundingSphere();
        const sz = R * 2 * (1.1 + m * 2.6);
        // dark pool under the die, orange while liquid, black glass after
        x.pool.scale.setScalar(sz * 0.9); x.pool.material.opacity = Math.min(0.95, m * 1.4) * (1 - fade);
        x.pool.material.color.setRGB(mix(1, 0.01, chill), mix(0.35, 0.01, chill), mix(0.06, 0.012, chill));
        x.glow.scale.setScalar(sz * 1.5); x.glow.material.opacity = 0.55 * Math.sin(Math.PI * at(k, 0.02, 0.7)) * (1 - fade);
        // the bright split: cracks flash white-yellow, run outward, then dim to ember red as the glass fades
        const cd = at(k, 0.72, 0.92);
        x.web.scale.setScalar(sz * (0.8 + 0.25 * ease(crack))); x.web.rotation.z = x.origin.x;
        x.web.material.opacity = crack * (1 - at(k, 0.78, 0.94)); x.web.material.color.setRGB(1, mix(0.95, 0.35, cd), mix(0.7, 0.05, cd));
        // a glint streak sliding over the finished glass
        const gl = at(k, 0.6, 0.9);
        x.glint.scale.setScalar(sz * 0.5); x.glint.position.x = x.origin.x + (gl - 0.5) * R * 1.6; x.glint.position.z = x.origin.z - (gl - 0.5) * R;
        x.glint.material.opacity = 0.2 * chill * (1 - fade) * (1 - gl * 0.4);
        // steam wafts out of the cooling pool, sideways along the table
        const st = at(k, 0.45, 1), sp = x.sp;
        for (let i = 0; i < x.n; i++) { const d = R * (0.4 + st * 2.2 * x.sv[i][2]); sp[i * 3] = x.origin.x + x.sv[i][0] * d; sp[i * 3 + 1] = x.origin.y + 0.5; sp[i * 3 + 2] = x.origin.z + x.sv[i][1] * d; }
        x.steam.geometry.attributes.position.needsUpdate = true; x.steam.material.opacity = 0.35 * Math.sin(Math.PI * st) * (1 - fade);
    },
    end(x) {
        x.mesh.castShadow = true; for (const c of x.mesh.children) if (c.isPoints) c.visible = true;
        x.mesh.material = x.mats0; x.off.dispose(); x.mesh.geometry = x.geo0; x.overlays.forEach((c) => { c.geometry = x.geo0; c.visible = true; });
        x.mesh.remove(x.skin); x.skin.material.dispose(); x.geo.dispose();
        for (const o of x.own || []) { x.scene.remove(o); o.material.dispose(); if (o.isPoints) o.geometry.dispose(); }
        x.own = [];
    },
};

export default { mid: melt };
