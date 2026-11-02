// Ember Cage exits 33, True Melt: only the die's own shape moves. Its corners soften away, then it slumps and runs out into an uneven puddle
// with rounded lobes, different every time, and fades. No glows, particles or colour changes: the iron, core and numbers keep their look.

// a copy of the geometry with every triangle split into 4^n; split points come out bit-identical on both sides of an edge, so the surface stays joined
function subdivide(geo, n) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (let l = 0; l < n; l++) {
        const out = new g.constructor();
        for (const name of Object.keys(g.attributes)) {
            const a = g.attributes[name], s = a.itemSize, src = a.array, dst = new Float32Array(src.length * 4);
            let o = 0;
            const put = (i, j) => { for (let c = 0; c < s; c++) dst[o++] = j < 0 ? src[i * s + c] : (src[i * s + c] + src[j * s + c]) / 2; };
            for (let t = 0; t < a.count; t += 3) {
                const A = t, B = t + 1, C = t + 2;
                put(A, -1); put(A, B); put(C, A);
                put(A, B); put(B, -1); put(B, C);
                put(C, A); put(B, C); put(C, -1);
                put(A, B); put(B, C); put(C, A);
            }
            out.setAttribute(name, new a.constructor(dst, s));
        }
        for (const gr of g.groups) out.addGroup(gr.start * 4, gr.count * 4, gr.materialIndex);
        if (g !== geo) g.dispose(); g = out;
    }
    return g;
}
const sm = (a, b, k) => { const t = Math.max(0, Math.min(1, (k - a) / (b - a))); return t * t * (3 - 2 * t); };
const rnd = (a, b) => a + Math.random() * (b - a);
const NH = 3, NG = 4; // harmonics and tongues of the puddle's outline

const melt = {
    key: 'a33-true-melt', name: 'True Melt', blurb: 'The die itself softens, slumps and runs out across the table into a lopsided puddle, a different shape every time, then fades.',
    dur: 3.5,
    start(x) {
        const T = x.THREE;
        // the geometry is shared by every die of this kind: bend a fine copy, put the original back in end()
        x.geo0 = x.mesh.geometry;
        const tris = (x.geo0.index ? x.geo0.index.count : x.geo0.attributes.position.count) / 3;
        let L = 3; while (L < 5 && tris * 4 ** L < 5000) L++;
        x.geo = subdivide(x.geo0, L);
        x.kids = x.mesh.children.filter((c) => c.isMesh); x.dots = x.mesh.children.filter((c) => c.isPoints);
        x.mesh.geometry = x.geo; x.kids.forEach((c) => (c.geometry = x.geo));
        // fading happens on copies of the materials
        x.mats0 = x.mesh.material; x.kmats0 = x.kids.concat(x.dots).map((c) => c.material);
        const copy = (m) => { const c = m.clone(); c.transparent = true; c.op0 = m.opacity; return c; };
        x.mats = [].concat(x.mats0).map(copy); x.kmats = x.kmats0.map(copy);
        x.mesh.material = Array.isArray(x.mats0) ? x.mats : x.mats[0]; x.kids.concat(x.dots).forEach((c, i) => (c.material = x.kmats[i]));
        // the die stays put while it melts, whatever the physics does
        x.q0 = x.mesh.quaternion.clone(); x.p0 = x.mesh.position.clone();
        const q = x.q0, qi = q.clone().invert(), P = x.geo.attributes.position, N = P.count;
        // one entry per distinct position, so every copy of a point moves the same way and the normals come out smooth
        const map = new Map(), grp = new Int32Array(N), w = [], v = new T.Vector3();
        for (let i = 0; i < N; i++) {
            const key = Math.round(P.getX(i) * 1e4) + ',' + Math.round(P.getY(i) * 1e4) + ',' + Math.round(P.getZ(i) * 1e4);
            let u = map.get(key);
            if (u === undefined) { u = w.length / 3; map.set(key, u); v.fromBufferAttribute(P, i).applyQuaternion(q); w.push(v.x, v.y, v.z); }
            grp[i] = u;
        }
        const U = w.length / 3;
        let lo = Infinity, hi = -Infinity;
        for (let u = 0; u < U; u++) { lo = Math.min(lo, w[u * 3 + 1]); hi = Math.max(hi, w[u * 3 + 1]); }
        const cy = (lo + hi) / 2;
        // this melt's own character: outline harmonics, a few tongues that run out at their own speeds, a lean to one side
        const harm = [], tong = [];
        for (let j = 0; j < NH; j++) harm.push({ n: j + 2, ph: rnd(0, 6.283), a: rnd(0.03, 0.11) / (1 + j * 0.4), t0: rnd(0.2, 0.4), t1: rnd(0.65, 0.95) });
        const ng = 2 + Math.floor(Math.random() * (NG - 1)), a0 = rnd(0, 6.283);
        for (let i = 0; i < NG; i++) tong.push({ dir: a0 + (i / ng) * 6.283 + rnd(-0.5, 0.5), wd: rnd(0.32, 0.55), a: i < ng ? rnd(0.2, 0.6) : 0, t0: rnd(0.25, 0.5), t1: rnd(0.7, 1.05) });
        const lean = rnd(0, 6.283); x.lean = { x: Math.cos(lean), z: Math.sin(lean), d: rnd(0.05, 0.3) };
        // a smooth field over the die's surface for when each spot gives way
        const waves = [0, 1, 2].map(() => { const t = rnd(0, 6.283), c = rnd(-1, 1), s = Math.sqrt(1 - c * c); return { x: s * Math.cos(t), y: c, z: s * Math.sin(t), f: rnd(1.2, 2.4), ph: rnd(0, 6.283) }; });
        const runny = rnd(0.25, 0.5), topFirst = rnd(0.1, 0.35);
        // per point: direction from the centre, distance, horizontal heading, delay, and its share of each harmonic and tongue
        const S = 9 + NH + NG, st = new Float32Array(U * S);
        let rm = 0, rh = 0;
        for (let u = 0; u < U; u++) {
            const dx = w[u * 3], dy = w[u * 3 + 1] - cy, dz = w[u * 3 + 2], r = Math.hypot(dx, dy, dz) || 1e-6, o = u * S;
            const nx = dx / r, ny = dy / r, nz = dz / r, sf = Math.hypot(nx, nz), th = Math.atan2(nz, nx);
            rm += r; rh = Math.max(rh, Math.hypot(dx, dz));
            let n = 0; for (const W of waves) n += Math.sin((W.x * nx + W.y * ny + W.z * nz) * W.f * 3 + W.ph);
            st[o] = nx; st[o + 1] = ny; st[o + 2] = nz; st[o + 3] = r; st[o + 4] = sf;
            st[o + 5] = sf > 1e-5 ? nx / sf : 0; st[o + 6] = sf > 1e-5 ? nz / sf : 0;
            st[o + 7] = runny * (0.5 + n / 6) + topFirst * (1 - ny) / 2; // delay, 0 to about 0.85
            for (let j = 0; j < NH; j++) st[o + 9 + j] = Math.cos(harm[j].n * th + harm[j].ph);
            for (let i = 0; i < NG; i++) { let d = Math.abs(th - tong[i].dir) % 6.283; d = Math.min(d, 6.283 - d); st[o + 9 + NH + i] = Math.exp(-((d / tong[i].wd) ** 2)); }
        }
        Object.assign(x, { qi, grp, U, S, st, lo, cy, rm: rm / U, rh, tall: hi - lo, harm, tong, delayMax: runny + topFirst,
            pos: new Float32Array(U * 3), nrm: new Float32Array(U * 3), n0: x.geo.attributes.normal.array.slice() });
    },
    tick(k, x) {
        x.mesh.quaternion.copy(x.q0); x.mesh.position.copy(x.p0);
        const { st, S, U, pos, nrm, qi, harm, tong, lean } = x;
        const round = sm(0, 0.22, k), M = sm(0.06, 0.72, k) * (1 + x.delayMax), fade = sm(0.74, 0.95, k);
        // the outline right now: each harmonic and tongue grows on its own clock
        const ha = harm.map((h) => h.a * sm(h.t0, h.t1, k)), ta = tong.map((t) => t.a * sm(t.t0, t.t1, k));
        const Rp = x.rm * (1.5 + 0.6 * sm(0.25, 1, k)), pH = x.tall * 0.14, lx = lean.x * lean.d * x.rh * sm(0.2, 0.9, k), lz = lean.z * lean.d * x.rh * sm(0.2, 0.9, k);
        const qx = qi.x, qy = qi.y, qz = qi.z, qw = qi.w;
        for (let u = 0; u < U; u++) {
            const o = u * S, nx = st[o], ny = st[o + 1], nz = st[o + 2], r0 = st[o + 3], sf = st[o + 4];
            // rounded: every point drawn toward one sphere, so the corners and edges go first
            const r = r0 + (x.rm - r0) * 0.85 * round;
            let ax = nx * r, ay = x.cy + ny * r, az = nz * r;
            // the puddle: the upper half spreads into a low dome out to the outline, the underside flattens onto the table
            let B = 1; for (let j = 0; j < NH; j++) B += ha[j] * st[o + 9 + j]; for (let i = 0; i < NG; i++) B += ta[i] * st[o + 9 + NH + i];
            const rho = Rp * B * sf, s4 = sf * sf * sf * sf;
            const bx = st[o + 5] * rho + lx, bz = st[o + 6] * rho + lz, by = x.lo + (ny > 0 ? pH * Math.sqrt(Math.max(0, 1 - s4)) : 0);
            // how far this spot has melted: its own delay, eased so the flow starts and stops softly
            let s = Math.max(0, Math.min(1, M - st[o + 7])); s = s * s * (3 - 2 * s);
            ax += (bx - ax) * s; ay += (by - ay) * s; az += (bz - az) * s;
            if (ay < x.lo + 0.002) ay = x.lo + 0.002;
            // back from table space into the die's own: rotate by the inverse quaternion
            const ix = qw * ax + qy * az - qz * ay, iy = qw * ay + qz * ax - qx * az, iz = qw * az + qx * ay - qy * ax, iw = -qx * ax - qy * ay - qz * az;
            pos[u * 3] = ix * qw + iw * -qx + iy * -qz - iz * -qy;
            pos[u * 3 + 1] = iy * qw + iw * -qy + iz * -qx - ix * -qz;
            pos[u * 3 + 2] = iz * qw + iw * -qz + ix * -qy - iy * -qx;
        }
        // smooth normals: every triangle adds its area-weighted normal to its shared points
        const P = x.geo.attributes.position, Na = x.geo.attributes.normal, pa = P.array, na = Na.array, g = x.grp, n0 = x.n0;
        nrm.fill(0);
        for (let t = 0; t < g.length; t += 3) {
            const a = g[t] * 3, b = g[t + 1] * 3, c = g[t + 2] * 3;
            const e1x = pos[b] - pos[a], e1y = pos[b + 1] - pos[a + 1], e1z = pos[b + 2] - pos[a + 2], e2x = pos[c] - pos[a], e2y = pos[c + 1] - pos[a + 1], e2z = pos[c + 2] - pos[a + 2];
            const cx = e1y * e2z - e1z * e2y, cy = e1z * e2x - e1x * e2z, cz = e1x * e2y - e1y * e2x;
            nrm[a] += cx; nrm[a + 1] += cy; nrm[a + 2] += cz; nrm[b] += cx; nrm[b + 1] += cy; nrm[b + 2] += cz; nrm[c] += cx; nrm[c + 1] += cy; nrm[c + 2] += cz;
        }
        for (let u = 0; u < U * 3; u += 3) { const l = Math.hypot(nrm[u], nrm[u + 1], nrm[u + 2]) || 1; nrm[u] /= l; nrm[u + 1] /= l; nrm[u + 2] /= l; }
        // the flat facets blend into the smooth shading as the corners soften, so the start doesn't pop
        for (let i = 0; i < g.length; i++) {
            const u = g[i] * 3, j = i * 3;
            pa[j] = pos[u]; pa[j + 1] = pos[u + 1]; pa[j + 2] = pos[u + 2];
            const fx = n0[j] + (nrm[u] - n0[j]) * round, fy = n0[j + 1] + (nrm[u + 1] - n0[j + 1]) * round, fz = n0[j + 2] + (nrm[u + 2] - n0[j + 2]) * round, l = Math.hypot(fx, fy, fz) || 1;
            na[j] = fx / l; na[j + 1] = fy / l; na[j + 2] = fz / l;
        }
        P.needsUpdate = Na.needsUpdate = true; x.geo.computeBoundingSphere();
        for (const m of x.mats.concat(x.kmats)) m.opacity = m.op0 * (1 - fade);
        x.mesh.castShadow = fade < 0.4;
    },
    end(x) {
        x.mesh.geometry = x.geo0; x.mesh.material = x.mats0;
        x.kids.forEach((c) => (c.geometry = x.geo0)); x.kids.concat(x.dots).forEach((c, i) => (c.material = x.kmats0[i]));
        x.geo.dispose(); x.mats.concat(x.kmats).forEach((m) => m.dispose());
        x.mesh.castShadow = true;
    },
};

export default { mid: melt };
