// Ember Cage exits 26, Tilted Melt: the die goes molten as if the table were tilted: magma hides the numbers, the shape runs one way into a teardrop pool, the front freezes first, then it greys and fades.
let FX = null;
function fx(T) {
    if (FX) return FX;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return (FX = { soft: new T.CanvasTexture(c), plane: new T.PlaneGeometry(1, 1) });
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
        for (const gr of g.groups) out.addGroup(gr.start * 4, gr.count * 4, gr.materialIndex);
        if (g !== geo) g.dispose(); g = out;
    }
    return g;
}
const at = (k, a, b) => Math.max(0, Math.min(1, (k - a) / (b - a)));
const ss = (k, a, b) => { const t = at(k, a, b); return t * t * (3 - 2 * t); };
const lerp = (a, b, k) => a + (b - a) * k;
// colour ramp: yellow-hot, orange, deep red, black stone, ash (t 0..1), written into out
const RAMP = [[1, 0.7, 0.22], [0.95, 0.38, 0.07], [0.55, 0.12, 0.03], [0.1, 0.08, 0.07], [0.36, 0.34, 0.33]];
function ramp(t, out) { const f = Math.min(3.999, t * 4), i = f | 0, a = RAMP[i], b = RAMP[i + 1], u = f - i; out[0] = lerp(a[0], b[0], u); out[1] = lerp(a[1], b[1], u); out[2] = lerp(a[2], b[2], u); }

const melt = {
    key: 'a26-melt-tilted', name: 'Tilted Melt', blurb: 'The die goes molten and runs one way like a tilted table, into a teardrop pool whose front freezes first, then it greys and fades.',
    dur: 3.4,
    start(x) {
        const T = x.THREE; x.own = [];
        // shared geometry and materials stay untouched: bend a copy, tint clones, and cover the faces with a magma skin before anything bends
        x.geo0 = x.mesh.geometry; x.geo = subdivide(x.geo0, 2); x.mesh.geometry = x.geo;
        x.overlays = x.mesh.children.filter((c) => c.isMesh); x.overlays.forEach((c) => (c.geometry = x.geo));
        x.mats0 = x.mesh.material; const arr = Array.isArray(x.mats0);
        x.mats = [].concat(x.mats0).map((m) => m.clone()); x.mesh.material = arr ? x.mats : x.mats[0];
        const p = x.geo.attributes.position, q = x.mesh.quaternion, v = new T.Vector3();
        x.qi = q.clone().invert(); x.w0 = []; let lo = Infinity, hi = -Infinity, r2 = 0;
        for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyQuaternion(q); x.w0.push(v.clone()); lo = Math.min(lo, v.y); hi = Math.max(hi, v.y); r2 = Math.max(r2, v.x * v.x + v.z * v.z); }
        x.lo = lo; x.tall = hi - lo; x.R = Math.sqrt(r2) || 1;
        // the table tilts toward a random side
        x.th = Math.random() * 6.283; x.dx = Math.cos(x.th); x.dz = Math.sin(x.th);
        x.col = new Float32Array(p.count * 3); x.geo.setAttribute('color', new T.BufferAttribute(x.col, 3));
        x.skin = new T.Mesh(x.geo, new T.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: true, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
        x.skin.position.copy(x.mesh.position); x.skin.quaternion.copy(x.mesh.quaternion); x.scene.add(x.skin);
        // a soft glow stretched along the flow under the pool
        const gl = new T.Mesh(fx(T).plane, new T.MeshBasicMaterial({ map: fx(T).soft, color: 0xff6a10, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0 }));
        gl.rotation.order = 'YXZ'; gl.rotation.set(-Math.PI / 2, -x.th, 0); gl.position.set(x.mesh.position.x, 0.04, x.mesh.position.z);
        x.scene.add(gl); x.own.push(gl); x.glow = gl;
        // steam: grey puffs drifting outward along the flow (the camera only sees sideways motion)
        const n = 16, pos = new Float32Array(n * 3), geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3));
        x.sv = Array.from({ length: n }, () => { const a = x.th + (Math.random() - 0.5) * 2.4, s = 0.3 + Math.random() * 0.7; return [Math.cos(a) * s, Math.sin(a) * s, Math.random() * 0.4]; });
        x.sp = new T.Points(geo, new T.PointsMaterial({ map: fx(T).soft, color: 0xb8b2ac, size: 14, sizeAttenuation: false, transparent: true, depthWrite: false, opacity: 0 }));
        x.sp.frustumCulled = false; x.scene.add(x.sp); x.own.push(x.sp);
    },
    tick(k, x) {
        // a see-through die still casts a shadow, so it stops once the pool is flat and fading
        x.mesh.castShadow = k < 0.8;
        // the set's own sparks would float on alone at the end
        for (const c of x.mesh.children) if (c.isPoints) c.visible = k < 0.85;
        const R = x.R, p = x.geo.attributes.position, nrm = x.geo.attributes.normal, v = new x.THREE.Vector3(), c = [0, 0, 0];
        const heat = ss(k, 0, 0.16), molten = ss(k, 0.1, 0.26), flow = ss(k, 0.2, 0.62), cool = at(k, 0.42, 0.76), crack = (1 - ss(k, 0.76, 0.9)) * ss(k, 0.5, 0.62), fade = ss(k, 0.82, 0.96);
        // the cage glows orange first; the numbers go under the skin before any vertex moves
        for (const m of x.mats) if (m.emissive) { m.emissive.setRGB(1, 0.4, 0.06); m.emissiveIntensity = 0.1 + heat * 0.7; }
        x.skin.material.opacity = molten * (1 - fade);
        if (molten >= 1) { x.mesh.visible = false; x.overlays.forEach((o) => (o.visible = false)); }
        for (let i = 0; i < p.count; i++) {
            const w = x.w0[i], h = (w.y - x.lo) / x.tall;
            // each spot runs at its own pace, from where it is, so split vertices stay joined
            const wob = Math.sin(w.x / R * 5.1 + w.z / R * 3.7) * Math.cos(w.z / R * 4.3 - w.x / R * 2.2);
            const m = Math.min(1, flow * (0.95 + 0.1 * wob)), mh = Math.min(1, flow * (0.8 + 0.4 * h));
            // the corners round off into a blob first (small radii grow, the rim eases in), so the flow has no spikes
            const rr = Math.hypot(w.x, w.z) / R, rn = lerp(rr, Math.min(1, Math.sqrt(rr)) * 0.95, m), kk = rr > 1e-4 ? rn / rr : 1;
            const u = w.x * kk * x.dx / R + w.z * kk * x.dz / R, s = (-w.x * x.dz + w.z * x.dx) * kk / R, f = u * 0.5 + 0.5;
            // height drops to a thin skin; the front runs farthest and the tail narrows into a teardrop
            const nh = h * (1 - mh) ** 1.7, lead = 0.3 + 0.7 * f, tear = 1 - 0.5 * m * f;
            const uu = u * (1 + 0.3 * m) + m * 2.3 * lead + 0.12 * m * wob, vv = s * (1 + 0.7 * m) * tear * (1 + 0.15 * m * wob);
            v.set((uu * x.dx - vv * x.dz) * R, x.lo + nh * x.tall + 0.06, (uu * x.dz + vv * x.dx) * R).applyQuaternion(x.qi); p.setXYZ(i, v.x, v.y, v.z);
            // skin colour: the front freezes first, patches at their own time; frozen rock keeps glowing cracks that dim
            const loc = Math.max(0, Math.min(1, cool * 1.6 - (0.55 * ss(uu, -0.6, 1.6) + 0.35 * (wob * 0.5 + 0.5))));
            ramp(loc * 0.75, c);
            const sh = 0.8 + 0.2 * (nrm ? Math.abs(nrm.getY(i)) : 1), liq = (1 - loc) * 0.35 * (0.5 + 0.5 * Math.sin(uu * 9 + wob * 3 - k * 14)) * flow, ash = fade * 0.5;
            const lit = Math.abs(Math.sin((w.x * 7 + w.z * 5) / R + wob * 2.2)) < 0.13 ? loc * crack : 0;
            x.col[i * 3] = Math.min(1, (c[0] * sh + liq + lit) * (1 - ash) + ash * 0.3);
            x.col[i * 3 + 1] = Math.min(1, (c[1] * sh + liq * 0.6 + lit * 0.4) * (1 - ash) + ash * 0.29);
            x.col[i * 3 + 2] = Math.min(1, (c[2] * sh + liq * 0.1) * (1 - ash) + ash * 0.28);
        }
        p.needsUpdate = true; x.geo.attributes.color.needsUpdate = true; x.geo.computeVertexNormals(); x.geo.computeBoundingSphere();
        // glow under the pool, pointed down the flow
        x.glow.scale.set(R * (2.6 + 4 * flow), R * (2.4 + 2 * flow), 1); x.glow.position.set(x.mesh.position.x + x.dx * R * 0.7 * flow, 0.04, x.mesh.position.z + x.dz * R * 0.7 * flow);
        x.glow.material.opacity = 0.55 * ss(k, 0.05, 0.3) * (1 - cool) * (1 - fade); x.glow.material.color.setRGB(1, 0.42 - cool * 0.2, 0.06);
        // steam rises once the front starts to freeze
        const sa = ss(k, 0.55, 0.68) * (1 - ss(k, 0.9, 0.97)), sp = x.sp.geometry.attributes.position, tt = at(k, 0.55, 1) * R * 2.2;
        for (let i = 0; i < x.sv.length; i++) sp.setXYZ(i, x.mesh.position.x + x.dx * R * 0.8 + x.sv[i][0] * (R * 0.4 + tt), 0.5 + x.sv[i][2], x.mesh.position.z + x.dz * R * 0.8 + x.sv[i][1] * (R * 0.4 + tt));
        sp.needsUpdate = true; x.sp.material.opacity = 0.3 * sa;
    },
    end(x) {
        x.mesh.castShadow = true; for (const c of x.mesh.children) if (c.isPoints) c.visible = true;
        x.mesh.geometry = x.geo0; x.overlays.forEach((c) => { c.geometry = x.geo0; c.visible = true; }); x.mesh.visible = true;
        x.mesh.material = x.mats0; x.mats.forEach((m) => m.dispose());
        x.scene.remove(x.skin); x.skin.material.dispose(); x.geo.dispose();
        for (const o of x.own || []) { x.scene.remove(o); o.material.dispose(); if (o.isPoints) o.geometry.dispose(); }
        x.own = [];
    },
};

export default { mid: melt };
