// Ember Cage exits 25, Rivulets: magma floods over the die, then runs off it in long fingers across the table that freeze in place, glow, go dark and fade.
let FX = null;
function fx(T) {
    if (FX) return FX;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return (FX = { soft: new T.CanvasTexture(c), plane: new T.PlaneGeometry(1, 1) });
}
// n points drifting up and out off the die; move(t) with t seconds since they started
function rise(x, n, color, size) {
    const T = x.THREE, pos = new Float32Array(n * 3), vel = [], o = x.mesh.position.clone();
    for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, s = 0.3 + Math.random() * 0.7; vel.push([Math.cos(a) * s, 0.8 + Math.random(), Math.sin(a) * s]); }
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    const p = new T.Points(geo, new T.PointsMaterial({ map: fx(T).soft, color, size, sizeAttenuation: false, transparent: true, depthWrite: false }));
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
const mixc = (a, b, t, o) => { for (let i = 0; i < 3; i++) o[i] = a[i] + (b[i] - a[i]) * t; return o; };
// magma colour as it cools: c = 0 yellow-hot, 0.35 orange, 0.7 deep red, 1 black stone; f greys it to ash
const HOT = [255, 214, 110], MID = [240, 110, 24], DEEP = [140, 30, 8], STONE = [38, 30, 28], ASH = [92, 88, 86], CC = [0, 0, 0];
function col(c, f) {
    c = 0.15 + 0.85 * Math.max(0, Math.min(1, c));
    if (c < 0.35) mixc(HOT, MID, c / 0.35, CC); else if (c < 0.7) mixc(MID, DEEP, (c - 0.35) / 0.35, CC); else mixc(DEEP, STONE, (c - 0.7) / 0.3, CC);
    return f ? mixc(CC, ASH, f * 0.7, CC) : CC;
}
const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

const melt = {
    key: 'a25-melt-rivulets', name: 'Rivulet Melt', blurb: 'Magma floods over the die, runs off it in long fingers across the table, then the streams freeze, glow, go dark and fade.',
    dur: 3.4,
    start(x) {
        const T = x.THREE; x.own = [];
        // the geometry and materials are shared by every die of this kind, so the melt bends a copy and tints clones; end() puts the originals back
        x.geo0 = x.mesh.geometry; x.geo = subdivide(x.geo0, 2); x.mesh.geometry = x.geo;
        x.overlays = x.mesh.children.filter((c) => c.isMesh); x.overlays.forEach((c) => (c.geometry = x.geo));
        x.mats0 = x.mesh.material; x.mats = [].concat(x.mats0).map((m) => m.clone()); x.mesh.material = Array.isArray(x.mats0) ? x.mats : x.mats[0];
        // every vertex in table space, the die's footprint radius R and its lowest and highest points
        const p = x.geo.attributes.position, q = x.mesh.quaternion, v = new T.Vector3();
        x.qi = q.clone().invert(); x.w0 = []; let lo = Infinity, hi = -Infinity, R = 0;
        for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyQuaternion(q); x.w0.push(v.clone()); lo = Math.min(lo, v.y); hi = Math.max(hi, v.y); R = Math.max(R, Math.hypot(v.x, v.z)); }
        x.lo = lo; x.tall = hi - lo; x.R = R;
        // the streams: main fingers fanned round the die (angle, length in R, width, wobble, when they start and freeze), a few with a side branch
        const n = 5 + (Math.random() * 3 | 0), a0 = Math.random() * 6.283; x.ss = [];
        for (let i = 0; i < n; i++) {
            const s = { a: a0 + (i + Math.random() * 0.6) * 6.283 / n, len: 2.8 + Math.random() * 1.8, w: 0.2 + Math.random() * 0.12, ph: Math.random() * 6, d: Math.random() * 0.1, f: 0.55 + Math.random() * 0.12 };
            x.ss.push(s);
        }
        for (let i = 0; i < Math.min(4, n); i++) { const m = x.ss[i], t0 = 0.4 + Math.random() * 0.2; x.ss.push({ a: m.a + (i % 2 ? 0.8 : -0.8), len: m.len * 0.5, w: m.w * 0.6, ph: Math.random() * 6, d: m.d, f: m.f + 0.04, par: m, t0 }); }
        // magma skin: the same bending geometry on top of it, with a baked dark-and-bright mottle, that covers the faces before the shape moves
        const cols = new Float32Array(p.count * 3);
        for (let i = 0; i < p.count; i++) { const w = x.w0[i], b = 0.55 + 0.45 * Math.sin(w.x / R * 7 + w.z / R * 5) * Math.cos(w.z / R * 6 - w.y / R * 4); cols.fill(b, i * 3, i * 3 + 3); }
        x.geo.setAttribute('color', new T.BufferAttribute(cols, 3));
        x.skin = new T.Mesh(x.geo, new T.MeshStandardMaterial({ color: 0xffb040, emissive: 0xff6a10, roughness: 0.55, vertexColors: true, transparent: true, opacity: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
        x.mesh.add(x.skin);
        // the flow on the table: one canvas per die laid flat under it, 12R across
        x.px = 384; x.cv = document.createElement('canvas'); x.cv.width = x.cv.height = x.px; x.cx = x.cv.getContext('2d');
        x.tex = new T.CanvasTexture(x.cv);
        x.flow = new T.Mesh(fx(T).plane, new T.MeshBasicMaterial({ map: x.tex, transparent: true, depthWrite: false }));
        x.flow.rotation.x = -Math.PI / 2; x.flow.position.set(x.mesh.position.x, 0.04, x.mesh.position.z); x.flow.scale.setScalar(R * 12); x.scene.add(x.flow); x.own.push(x.flow);
        x.steam = rise(x, 16, 0xc8c3be, 6); x.steam.material.opacity = 0;
    },
    tick(k, x) {
        // a see-through die still casts a shadow, so it stops once the pool is flat and fading
        x.mesh.castShadow = k < 0.8;
        // the set's own sparks would float on alone at the end
        for (const c of x.mesh.children) if (c.isPoints) c.visible = k < 0.85;
        const T = x.THREE, R = x.R, ctx = x.cx, S = x.px, u = S / (R * 12), C = S / 2;
        const heat = at(k, 0, 0.16), molten = at(k, 0.1, 0.26), m = ease(at(k, 0.22, 0.62)), cool = at(k, 0.56, 0.82), fade = at(k, 0.82, 0.96);
        // heat-up: the clones glow orange before the skin takes over
        for (const mt of x.mats) { mt.transparent = true; mt.opacity = 1 - at(k, 0.88, 1); if (mt.emissive) { mt.emissive.setRGB(1, 0.35, 0.05); mt.emissiveIntensity = 0.15 + heat * 0.9; } }
        x.overlays.forEach((c) => (c.visible = molten < 0.5));
        const sc = col(cool * 0.9, fade), sk = x.skin.material;
        sk.color.setRGB(sc[0] / 600, sc[1] / 600, sc[2] / 600); sk.emissive.setRGB(sc[0] / 255, sc[1] / 255, sc[2] / 255); sk.emissiveIntensity = 0.55 * (1 - at(cool, 0.2, 1));
        sk.opacity = molten * (1 - at(k, 0.88, 1));
        // the bend: lobes of the outline lean toward the streams, so the die spreads where the magma runs; the numbers are already hidden
        const main = x.ss.filter((s) => !s.par), p = x.geo.attributes.position, v = new T.Vector3();
        const lobe = (a) => { let L = 0; for (const s of main) { let d = a - s.a; d = Math.atan2(Math.sin(d), Math.cos(d)); L += Math.exp(-d * d / 0.12); } return L; };
        for (let i = 0; i < p.count; i++) {
            const w = x.w0[i], h = (w.y - x.lo) / x.tall, a = Math.atan2(w.z, w.x);
            // each spot sags at its own speed (from where it is, so split vertices stay joined), the top first
            const wob = 0.75 + 0.25 * Math.sin(w.x * 5.1 + w.z * 3.7) * Math.cos(w.z * 4.3 - w.x * 2.2);
            const s = Math.min(1, m * wob * (0.7 + 0.5 * h)), nh = h * (1 - s) ** 1.6 * (1 - cool * 0.5);
            const spread = 1 + s * (1.15 - nh) * (0.3 + 0.8 * lobe(a)) + cool * 0.1;
            v.set(w.x * spread, x.lo + nh * x.tall + 0.01, w.z * spread).applyQuaternion(x.qi);
            p.setXYZ(i, v.x, v.y, v.z);
        }
        p.needsUpdate = true; x.geo.computeVertexNormals(); x.geo.computeBoundingSphere();
        // the flow on the table, redrawn: a lobed pool under the die, then each finger running out, freezing from deep red to black with glowing cracks
        ctx.clearRect(0, 0, S, S); ctx.lineCap = ctx.lineJoin = 'round';
        const pc = col(at(k, 0.5, 0.78) * 0.95, fade);
        ctx.fillStyle = rgba(pc, 0.95); ctx.beginPath();
        for (let i = 0; i <= 48; i++) { const a = i / 48 * 6.283, r = R * (0.9 + 0.5 * m) * (1 + 0.5 * m * lobe(a)) * u; ctx.lineTo(C + Math.cos(a) * r, C + Math.sin(a) * r); }
        ctx.fill();
        const g = new Array(x.ss.length), P = [];
        for (let j = 0; j < x.ss.length; j++) {
            const s = x.ss[j];
            g[j] = s.par ? at(g[x.ss.indexOf(s.par)], s.t0, 1) * ease(at(k, 0.3, 0.7)) : ease(at(k, 0.22 + s.d, 0.66 + s.d));
            const gr = g[j]; if (gr <= 0.001) continue;
            const c = at(k, s.f, s.f + 0.26), N = 12, ca = Math.cos(s.a), sa = Math.sin(s.a);
            // the path: steps out along the angle, swaying side to side; a branch starts on its parent's path
            const ox = s.par ? (s.par.px || 0) : 0, oy = s.par ? (s.par.py || 0) : 0;
            let px0 = s.par ? ox : C, py0 = s.par ? oy : C; P.length = 0;
            for (let i = 0; i <= N; i++) {
                const t = i / N, d = t * s.len * gr * R * u, lat = Math.sin(t * 5 + s.ph) * 0.3 * R * u * t;
                P.push(px0 + ca * d - sa * lat, py0 + sa * d + ca * lat);
            }
            // remember a point near 40-60% along for the branches
            if (!s.par) { const bi = Math.min(N, Math.round(N * 0.5)) * 2; s.px = P[bi]; s.py = P[bi + 1]; }
            const wid = s.w * R * u, lit = (1 - at(c, 0.55, 1)) * at(c, 0.05, 0.3);
            for (let pass = 0; pass < 3; pass++) {
                for (let i = 1; i <= N; i++) {
                    const t = i / N, ww = wid * (1 - 0.65 * t) * (pass == 0 ? 2.3 : pass == 1 ? 1 : 0.4);
                    if (pass == 2 && c > 0.8) continue;
                    ctx.strokeStyle = pass == 0 ? rgba(col(c * 0.8 + 0.25, fade), 0.35) : pass == 1 ? rgba(col(c, fade), 1) : rgba(col(c - 0.3, 0), 0.8 * (1 - c));
                    ctx.lineWidth = ww; ctx.beginPath(); ctx.moveTo(P[i * 2 - 2], P[i * 2 - 1]); ctx.lineTo(P[i * 2], P[i * 2 + 1]); ctx.stroke();
                }
            }
            // the head of the finger
            ctx.fillStyle = rgba(col(c * 0.9, fade), 1); ctx.beginPath(); ctx.arc(P[N * 2], P[N * 2 + 1], wid * 0.4, 0, 7); ctx.fill();
            // cracks: dashes of glow along the frozen stream that dim last
            if (lit > 0.01) {
                ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = rgba([255, 120 + 60 * s.ph % 80, 20], lit * 0.8); ctx.lineWidth = Math.max(1, wid * 0.14); ctx.setLineDash([wid * 0.9, wid * 1.3]);
                ctx.beginPath(); ctx.moveTo(P[0], P[1]); for (let i = 1; i <= N; i++) ctx.lineTo(P[i * 2], P[i * 2 + 1]); ctx.stroke(); ctx.setLineDash([]); ctx.globalCompositeOperation = 'source-over';
            }
        }
        x.tex.needsUpdate = true; x.flow.material.opacity = 1 - fade;
        x.steam.move(k * 1.6); x.steam.material.opacity = 0.35 * at(k, 0.6, 0.75) * (1 - fade);
        // the last moment: what is left sinks flat as it fades
        x.mesh.scale.y = Math.max(0.001, 1 - at(k, 0.88, 1));
    },
    end(x) {
        x.mesh.castShadow = true; for (const c of x.mesh.children) if (c.isPoints) c.visible = true;
        x.mesh.geometry = x.geo0; x.overlays.forEach((c) => { c.geometry = x.geo0; c.visible = true; }); x.mesh.material = x.mats0;
        x.mesh.remove(x.skin); x.skin.material.dispose(); x.geo.dispose(); x.mats.forEach((m) => m.dispose()); x.tex.dispose(); x.mesh.scale.setScalar(1);
        for (const o of x.own || []) { x.scene.remove(o); o.material.dispose(); if (o.isPoints) o.geometry.dispose(); }
        x.own = [];
    },
};

export default { mid: melt };
