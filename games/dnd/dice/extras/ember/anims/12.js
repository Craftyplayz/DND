// Ember Cage exits 12: Crumpled cage (nat1), Flower bloom (nat20), Spin out (mid). The die's own model moves in all three.
let FX = null;
function fx(T) {
    if (FX) return FX;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return (FX = { soft: new T.CanvasTexture(c) });
}
// a soft glowing blob at the die (additive), or a dark one (soot) when add is false
const sprite = (x, color, add = true) => { const s = new x.THREE.Sprite(new x.THREE.SpriteMaterial({ map: fx(x.THREE).soft, color, transparent: true, depthWrite: false, blending: add ? x.THREE.AdditiveBlending : x.THREE.NormalBlending }));
    s.position.copy(x.p0); s.scale.setScalar(0.1); x.scene.add(s); x.own.push(s); return s; };
// n glowing points, placed each frame by put(i, out[x,y,z], t)
function points(x, n, color, size, put) {
    const T = x.THREE, pos = new Float32Array(n * 3), geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    const p = new T.Points(geo, new T.PointsMaterial({ map: fx(T).soft, color, size, sizeAttenuation: false, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
    p.frustumCulled = false; x.scene.add(p); x.own.push(p); const o = [0, 0, 0];
    p.move = (t) => { for (let i = 0; i < n; i++) { put(i, o, t); pos.set(o, i * 3); } geo.attributes.position.needsUpdate = true; };
    return p;
}
// a copy of a die's geometry with every triangle split into 4^n so it bends smoothly (face groups scale by 4^n)
function subdivide(geo, n) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (let l = 0; l < n; l++) {
        const out = new g.constructor();
        for (const name of Object.keys(g.attributes)) {
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
// common setup: saved pose and die radius
function base(x) {
    x.own = []; x.p0 = x.mesh.position.clone(); x.q0 = x.mesh.quaternion.clone(); x.s0 = x.mesh.scale.clone();
    x.mesh.geometry.computeBoundingSphere(); x.R = x.mesh.geometry.boundingSphere.radius * x.s0.x;
}
function clean(x) {
    x.mesh.position.copy(x.p0); x.mesh.quaternion.copy(x.q0); x.mesh.scale.copy(x.s0); x.mesh.visible = true;
    for (const o of x.own || []) { x.scene.remove(o); if (o.material) o.material.dispose(); if (o.isPoints || o.isGroup) o.geometry?.dispose(); if (o.isGroup) o.children.forEach((m) => m.geometry.dispose()); }
    x.own = [];
}

// the faces cave in toward the centre in uneven dents; the die crumples into a small lump, then a puff of soot
const nat1 = {
    key: 'a12-crumple', name: 'Crumpled Cage', blurb: 'The cage caves in on itself like scrap metal, crushes to a small dented lump and puffs out soot.',
    dur: 2.2, impact: 0.8,
    start(x) {
        base(x);
        x.geo0 = x.mesh.geometry; x.geo = subdivide(x.geo0, 2); x.mesh.geometry = x.geo;
        x.overlays = x.mesh.children.filter((c) => c.isMesh); x.overlays.forEach((c) => (c.geometry = x.geo));
        const p = x.geo.attributes.position, v = new x.THREE.Vector3();
        x.qi = x.q0.clone().invert(); x.w0 = [];
        for (let i = 0; i < p.count; i++) x.w0.push(v.fromBufferAttribute(p, i).applyQuaternion(x.q0).clone());
        x.flash = sprite(x, 0xff6a10);
        x.soot = [0, 1, 2, 3, 4].map((i) => { const s = sprite(x, 0x2a2622, false); s.a = i * 1.26 + 0.4; return s; });
        x.sparks = points(x, 16, 0xffa040, 4, (i, o, t) => { const a = i * 2.4, r = x.R * (0.3 + t * (0.8 + (i % 4) * 0.35)); o[0] = x.p0.x + Math.cos(a) * r; o[1] = x.p0.y + 0.3; o[2] = x.p0.z + Math.sin(a) * r; });
    },
    tick(k, x) {
        const f = ease(at(k, 0.08, 0.5)), p = x.geo.attributes.position, v = new x.THREE.Vector3(), R = x.R;
        for (let i = 0; i < p.count; i++) {
            const w = x.w0[i];
            // dents come from where the vertex is, so shared corners stay joined: some spots cave deep, others hold
            const n = Math.sin(w.x * 4.1 + w.z * 3.3 + w.y * 2.7) * Math.cos(w.y * 5.3 - w.x * 2.9);
            const r = Math.max(0.12, 1 - f * (0.55 + 0.25 * n + 0.3 * Math.max(0, n)));
            v.set(w.x * r + f * 0.18 * R * Math.sin(w.y * 3 + w.z * 2), w.y * r * (1 - f * 0.2), w.z * r + f * 0.18 * R * Math.cos(w.x * 3 - w.y * 2)).applyQuaternion(x.qi);
            p.setXYZ(i, v.x, v.y, v.z);
        }
        p.needsUpdate = true; x.geo.computeVertexNormals(); x.geo.computeBoundingSphere();
        // a shudder before it gives, then the lump fades out at the end
        const sh = Math.sin(k * 90) * 0.06 * R * at(k, 0, 0.1) * (1 - at(k, 0.1, 0.18));
        x.mesh.position.set(x.p0.x + sh, x.p0.y, x.p0.z - sh);
        x.mesh.scale.setScalar(x.s0.x * (1 - at(k, 0.8, 1)) + 0.001);
        x.flash.scale.setScalar(R * (0.5 + 4 * f)); x.flash.material.opacity = 0.7 * Math.sin(Math.PI * at(k, 0.1, 0.6));
        const s = at(k, 0.36, 1);
        x.soot.forEach((c) => { c.position.set(x.p0.x + Math.cos(c.a) * R * 1.8 * ease(s), x.p0.y + 0.4, x.p0.z + Math.sin(c.a) * R * 1.8 * ease(s)); c.scale.setScalar(R * (0.6 + 2.2 * s)); c.material.opacity = 0.75 * Math.sin(Math.PI * s); });
        x.sparks.move(at(k, 0.4, 1)); x.sparks.material.opacity = 1 - at(k, 0.4, 1);
    },
    end(x) { x.mesh.geometry = x.geo0; x.overlays.forEach((c) => (c.geometry = x.geo0)); x.geo.dispose(); clean(x); },
};

// every face swings open outward like a petal around a blazing golden core, then the petals burn away
const nat20 = {
    key: 'a12-bloom', name: 'Flower Bloom', blurb: 'Each face swings open outward like a petal around a blazing golden core, then the petals burn away.',
    dur: 2.4, impact: 0.45,
    start(x) {
        base(x);
        const T = x.THREE, g = x.mesh.geometry.index ? x.mesh.geometry.toNonIndexed() : x.mesh.geometry.clone(), P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
        const mi = (t) => { for (const gr of g.groups) if (t * 3 >= gr.start && t * 3 < gr.start + gr.count) return gr.materialIndex; return 0; };
        const multi = Array.isArray(x.mesh.material), cl = new Map(), v = new T.Vector3(), a = new T.Vector3(), b = new T.Vector3(), c = new T.Vector3();
        // group the triangles into flat faces by their normal (a d20 face is one triangle, a d6 face two)
        for (let t = 0; t < P.count / 3; t++) {
            a.fromBufferAttribute(P, t * 3); b.fromBufferAttribute(P, t * 3 + 1); c.fromBufferAttribute(P, t * 3 + 2);
            v.subVectors(b, a).cross(c.sub(a)).normalize();
            const key = [v.x, v.y, v.z].map((n) => Math.round(n * 8)).join(',');
            if (!cl.has(key)) cl.set(key, []);
            cl.get(key).push(t);
        }
        x.pieces = []; x.group = new T.Group(); x.scene.add(x.group); x.own.push(x.group);
        for (const tris of cl.values()) {
            const ct = new T.Vector3(); for (const t of tris) for (let j = 0; j < 3; j++) ct.add(v.fromBufferAttribute(P, t * 3 + j));
            ct.divideScalar(tris.length * 3);
            const pg = new T.BufferGeometry(), pos = [], nor = [], uv = [];
            tris.forEach((t, ti) => { for (let j = 0; j < 3; j++) { v.fromBufferAttribute(P, t * 3 + j).sub(ct); pos.push(v.x, v.y, v.z); v.fromBufferAttribute(N, t * 3 + j); nor.push(v.x, v.y, v.z); if (U) uv.push(U.getX(t * 3 + j), U.getY(t * 3 + j)); } if (multi) pg.addGroup(ti * 3, 3, mi(t)); });
            pg.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); pg.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); if (U) pg.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
            const m = new T.Mesh(pg, x.mesh.material), cw = ct.clone().applyQuaternion(x.q0);
            // outward direction on the table; faces pointing up or down get a spread-out heading
            const d = new T.Vector2(cw.x, cw.z); if (d.length() < 0.15 * x.R) d.set(Math.cos(x.pieces.length * 2.4), Math.sin(x.pieces.length * 2.4)); d.normalize();
            m.d = d; m.cw = cw; x.group.add(m); x.pieces.push(m);
        }
        g.dispose(); x.mesh.visible = false;
        x.core = sprite(x, 0xffc840); x.halo = sprite(x, 0xff7a18);
        x.sparks = points(x, 26, 0xffd060, 4, (i, o, t) => { const a = i * 2.4, r = x.R * (0.8 + t * (1.2 + (i % 5) * 0.4)); o[0] = x.p0.x + Math.cos(a) * r; o[1] = x.p0.y + 0.5 + t; o[2] = x.p0.z + Math.sin(a) * r; });
        x.axis = new T.Vector3(); x.qa = new T.Quaternion();
    },
    tick(k, x) {
        const open = ease(at(k, 0.05, 0.45)), burn = at(k, 0.6, 1), R = x.R;
        x.pieces.forEach((m, i) => {
            // each petal swings open about its hinge: pushed out along its heading and tipped flat, then twists and shrinks as it burns
            x.axis.set(-m.d.y, 0, m.d.x);
            x.qa.setFromAxisAngle(x.axis, open * 1.25 + burn * 0.5 * Math.sin(i));
            m.quaternion.copy(x.qa).multiply(x.q0);
            const out = open * R * 1.1 + burn * R * 0.5;
            m.position.set(x.p0.x + m.cw.x * (1 + open * 0.5) + m.d.x * out, x.p0.y + m.cw.y, x.p0.z + m.cw.z * (1 + open * 0.5) + m.d.y * out);
            m.scale.setScalar(Math.max(0.001, 1 - burn ** 1.5));
        });
        x.core.scale.setScalar(R * (0.8 + 5 * open + Math.sin(k * 40) * 0.15)); x.core.material.opacity = Math.min(1, open * 1.6) * (1 - burn * 0.8);
        x.halo.scale.setScalar(R * (2 + 6 * open)); x.halo.material.opacity = 0.6 * Math.sin(Math.PI * at(k, 0.05, 1));
        x.sparks.move(at(k, 0.45, 1)); x.sparks.material.opacity = Math.sin(Math.PI * at(k, 0.45, 1));
    },
    end(x) { clean(x); },
};

// it spins up faster and faster on the spot like a top, shrinking to nothing in a little swirl of sparks
const mid = {
    key: 'a12-spinout', name: 'Spin Out', blurb: 'The die spins up faster and faster on the spot like a top, shrinking to nothing in a swirl of sparks.',
    dur: 1.3,
    start(x) {
        base(x); x.qy = new x.THREE.Quaternion(); x.up = new x.THREE.Vector3(0, 1, 0);
        x.heat = sprite(x, 0xff6a10);
        x.sparks = points(x, 18, 0xffb040, 4, (i, o, t) => { const a = i * 0.7 + t * (8 + t * 14) * (1 + (i % 3) * 0.2), r = x.R * (0.5 + 1.6 * (1 - t) * (0.4 + (i % 4) * 0.2)); o[0] = x.p0.x + Math.cos(a) * r; o[1] = x.p0.y + 0.3; o[2] = x.p0.z + Math.sin(a) * r; });
    },
    tick(k, x) {
        // the angle grows with k squared, so it keeps accelerating
        x.qy.setFromAxisAngle(x.up, k * k * 40 + k * 4);
        x.mesh.quaternion.copy(x.qy).multiply(x.q0);
        x.mesh.scale.setScalar(x.s0.x * Math.max(0.001, 1 - k ** 2.2) * (1 + 0.08 * Math.sin(k * 30)));
        x.heat.scale.setScalar(x.R * (1 + 2 * k)); x.heat.material.opacity = 0.5 * Math.sin(Math.PI * k) * k;
        x.sparks.move(k); x.sparks.material.opacity = Math.sin(Math.PI * Math.min(1, k * 1.1));
    },
    end(x) { clean(x); },
};

export default { nat1, nat20, mid };
