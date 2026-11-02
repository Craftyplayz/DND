// Ember Cage exits 16: nat 1 drills itself into the table, nat 20 breaks into faces that orbit a fire sun, every other roll inflates round and pops into sparks.
let FX = null;
function fx(T) {
    if (FX) return FX;
    const mk = (draw) => { const c = document.createElement('canvas'); c.width = c.height = 128; draw(c.getContext('2d')); return new T.CanvasTexture(c); };
    const rad = (g, stops) => { const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); stops.forEach(([o, a]) => r.addColorStop(o, `rgba(255,255,255,${a})`)); g.fillStyle = r; g.fillRect(0, 0, 128, 128); };
    return (FX = {
        plane: new T.PlaneGeometry(1, 1),
        soft: mk((g) => rad(g, [[0, 1], [0.3, 0.55], [1, 0]])),
        disc: mk((g) => rad(g, [[0, 1], [0.72, 1], [1, 0]])),
        ring: mk((g) => rad(g, [[0, 0], [0.6, 0], [0.82, 1], [1, 0]])),
    });
}
const at = (k, a, b) => Math.max(0, Math.min(1, (k - a) / (b - a)));
const ease = (k) => 1 - (1 - k) ** 3;
const R = (a, b) => a + Math.random() * (b - a);
const add = (x, o) => { x.scene.add(o); x.own.push(o); return o; };
const mat = (x, tex, color, additive = true) => new x.THREE.MeshBasicMaterial({ map: tex, color, transparent: true, depthWrite: false, blending: additive ? x.THREE.AdditiveBlending : x.THREE.NormalBlending });
const spr = (x, color, additive = true) => { const s = add(x, new x.THREE.Sprite(new x.THREE.SpriteMaterial({ map: fx(x.THREE).soft, color, transparent: true, depthWrite: false, blending: additive ? x.THREE.AdditiveBlending : x.THREE.NormalBlending }))); s.position.copy(x.p0); s.position.y = 3; return s; };
// a flat disc or ring lying on the table
const flat = (x, tex, color, y, additive = true) => { const m = add(x, new x.THREE.Mesh(fx(x.THREE).plane, mat(x, tex, color, additive))); m.rotation.x = -Math.PI / 2; m.position.set(x.p0.x, y, x.p0.z); return m; };
const pts = (x, n, color, size, additive = true) => {
    const T = x.THREE, geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(new Float32Array(n * 3), 3));
    const p = add(x, new T.Points(geo, new T.PointsMaterial({ map: fx(T).soft, color, size, sizeAttenuation: false, transparent: true, depthWrite: false, blending: additive ? T.AdditiveBlending : T.NormalBlending })));
    p.frustumCulled = false; return p;
};
// the die's radius and a copy of its geometry in table space, from the geometry itself so every die shape works
function measure(x) {
    const p = x.mesh.geometry.attributes.position, q = x.mesh.quaternion, v = new x.THREE.Vector3(); let r = 0;
    for (let i = 0; i < p.count; i++) r = Math.max(r, v.fromBufferAttribute(p, i).length());
    return r;
}
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
const cleanup = (x) => {
    for (const o of x.own || []) { x.scene.remove(o); if (o.material) o.material.dispose(); if (o.isPoints) o.geometry.dispose(); }
    for (const g of x.geos || []) g.dispose();
    if (x.geo0) { x.mesh.geometry = x.geo0; (x.overlays || []).forEach((c) => (c.geometry = x.geo0)); x.geo0 = null; }
    x.own = []; x.geos = []; x.mesh.visible = true; x.mesh.scale.setScalar(1);
    if (x.p0) { x.mesh.position.copy(x.p0); x.mesh.quaternion.copy(x.q0); }
};
const init = (x) => { x.own = []; x.geos = []; x.p0 = x.mesh.position.clone(); x.q0 = x.mesh.quaternion.clone(); x.rad = measure(x); };

export default {
    // nat 1: spins faster and faster, screws itself into the table, shrinking, with a dust ring and cracks around the hole
    nat1: {
        key: 'a16-drill', name: 'Drill Down', dur: 2.0, impact: 0.8,
        blurb: 'The die spins faster and faster and screws itself into the table, shrinking away with a ring of dust and glowing cracks around the hole.',
        start(x) {
            init(x); const F = fx(x.THREE), r = x.rad;
            x.Y = new x.THREE.Vector3(0, 1, 0); x.qy = new x.THREE.Quaternion();
            x.hole = flat(x, F.disc, 0x050201, 0.04, false); x.hole.renderOrder = -2;
            x.glow = flat(x, F.soft, 0xff5a10, 0.06);
            x.cracks = []; for (let i = 0; i < 9; i++) { const m = add(x, new x.THREE.Mesh(F.plane, new x.THREE.MeshBasicMaterial({ color: 0xff7a1c, transparent: true, depthWrite: false, blending: x.THREE.AdditiveBlending }))); m.rotation.x = -Math.PI / 2; x.cracks.push({ m, a: (i / 9) * 6.283 + R(-0.2, 0.2), L: r * R(1.6, 3) }); }
            x.dust = pts(x, 70, 0x9a7a60, 14, false); x.dd = Array.from({ length: 70 }, () => ({ a: R(0, 6.283), s: R(0.6, 1.4), w: R(-2, 2) }));
            x.sp = pts(x, 40, 0xffa040, 6); x.sd = Array.from({ length: 40 }, () => ({ a: R(0, 6.283), s: R(0.6, 1.4) }));
        },
        tick(k, x) {
            const r = x.rad, h = x.p0, sink = ease(at(k, 0.08, 0.8)), fade = 1 - at(k, 0.82, 1);
            // the spin keeps accelerating; the die shrinks as it sinks and wobbles a little off-axis early on
            x.mesh.quaternion.copy(x.q0).premultiply(x.qy.setFromAxisAngle(x.Y, 70 * k * k));
            x.mesh.position.set(h.x + Math.sin(k * 60) * 0.08 * (1 - sink), h.y - sink * r * 0.8, h.z + Math.cos(k * 60) * 0.08 * (1 - sink));
            x.mesh.scale.setScalar(Math.max(0.001, 1 - sink * 0.97)); x.mesh.visible = k < 0.9;
            x.hole.scale.setScalar(0.1 + r * 1.8 * ease(at(k, 0.05, 0.5))); x.hole.material.opacity = 0.9 * fade;
            x.glow.scale.setScalar(r * 3.4 * ease(at(k, 0.1, 0.6))); x.glow.material.opacity = Math.min(1, sink * 1.5) * 0.7 * fade * (1 - at(k, 0.6, 0.9));
            // cracks split out of the hole once it bites
            const cg = ease(at(k, 0.35, 0.6));
            for (const c of x.cracks) { const L = c.L * cg + 0.01, cx = Math.cos(c.a), cz = Math.sin(c.a); c.m.position.set(h.x + cx * (r * 0.8 + L / 2), 0.07, h.z + cz * (r * 0.8 + L / 2)); c.m.scale.set(L, 0.12 + r * 0.04, 1); c.m.rotation.z = Math.atan2(-cz, cx); c.m.material.opacity = (1 - at(k, 0.6, 0.95)) * fade; }
            // dust thrown out in a spiralling ring, sparks flung off the drilling point
            const d = at(k, 0.15, 0.9), p = x.dust.geometry.attributes.position, q = x.sp.geometry.attributes.position;
            x.dd.forEach((e, i) => { const a = e.a + e.w * d * 1.5, rr = r * 0.6 + d * r * 3.2 * e.s; p.setXYZ(i, h.x + Math.cos(a) * rr, 0.3, h.z + Math.sin(a) * rr); });
            x.sd.forEach((e, i) => { const t = at(k, 0.1 + (i % 8) * 0.04, 0.55 + (i % 8) * 0.04), rr = r * (0.3 + t * 2.4 * e.s); q.setXYZ(i, h.x + Math.cos(e.a) * rr, 0.4, h.z + Math.sin(e.a) * rr); });
            p.needsUpdate = q.needsUpdate = true;
            x.dust.material.opacity = Math.sin(Math.PI * d) * 0.55 * fade; x.sp.material.opacity = Math.sin(Math.PI * at(k, 0.1, 0.7)) * fade;
        },
        end: cleanup,
    },
    // nat 20: the faces break off and orbit a small fire sun in a widening ring, speeding up, then fly outward
    nat20: {
        key: 'a16-orbit', name: 'Face Orbit', dur: 2.2, impact: 1.3,
        blurb: 'The die splits into its faces, which circle a small fire sun faster and faster before flying out across the table.',
        start(x) {
            init(x); const T = x.THREE, F = fx(T), g = x.mesh.geometry.index ? x.mesh.geometry.toNonIndexed() : x.mesh.geometry;
            if (g !== x.mesh.geometry) x.geos.push(g);
            const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv, q = x.q0;
            // one piece per face group (or per triangle if the geometry has no groups), centred on its own middle
            const gr = g.groups.length ? g.groups : Array.from({ length: P.count / 3 }, (_, i) => ({ start: i * 3, count: 3, materialIndex: 0 }));
            x.pieces = gr.map((G, n) => {
                const ge = new T.BufferGeometry(), c = new T.Vector3(), v = new T.Vector3();
                for (let i = 0; i < G.count; i++) c.add(v.fromBufferAttribute(P, G.start + i)); c.divideScalar(G.count);
                const pos = new Float32Array(G.count * 3), nor = new Float32Array(G.count * 3), uv = U && new Float32Array(G.count * 2);
                for (let i = 0; i < G.count; i++) { v.fromBufferAttribute(P, G.start + i).sub(c).toArray(pos, i * 3); N && nor.set([N.getX(G.start + i), N.getY(G.start + i), N.getZ(G.start + i)], i * 3); U && uv.set([U.getX(G.start + i), U.getY(G.start + i)], i * 2); }
                ge.setAttribute('position', new T.BufferAttribute(pos, 3)); N && ge.setAttribute('normal', new T.BufferAttribute(nor, 3)); U && ge.setAttribute('uv', new T.BufferAttribute(uv, 2));
                if (Array.isArray(x.mesh.material)) ge.addGroup(0, G.count, G.materialIndex);
                x.geos.push(ge);
                const m = new T.Mesh(ge, x.mesh.material); x.scene.add(m);
                const w = c.clone().applyQuaternion(q), flatLen = Math.hypot(w.x, w.z);
                return { m, r0: flatLen, a0: flatLen > 0.05 ? Math.atan2(w.z, w.x) : (n * 2.399), y0: w.y, orb: x.rad * R(1.8, 2.8), ph: R(-0.4, 0.4), out: R(0.8, 1.3) };
            });
            x.Y = new T.Vector3(0, 1, 0); x.qy = new T.Quaternion();
            x.sun = spr(x, 0xff7a14); x.core = spr(x, 0xfff0c0); x.ringA = flat(x, F.ring, 0xffb040, 0.08);
            x.sparks = pts(x, 50, 0xffb050, 6); x.sd = Array.from({ length: 50 }, () => ({ a: R(0, 6.283), s: R(0.6, 1.4), w: R(1, 3) }));
            x.mesh.visible = false;
        },
        tick(k, x) {
            const h = x.p0, r = x.rad, sep = ease(at(k, 0, 0.2)), fly = at(k, 0.62, 1) ** 2, fade = 1 - at(k, 0.9, 1);
            // spin gets steadily faster (a cubic term on top of a slow start)
            const spin = 2 * k + 22 * k ** 3;
            for (const p of x.pieces) {
                const a = p.a0 + spin + p.ph, rr = p.r0 + (p.orb - p.r0) * sep + fly * 26 * p.out;
                p.m.position.set(h.x + Math.cos(a) * rr, h.y + p.y0 * (1 - sep), h.z + Math.sin(a) * rr);
                p.m.quaternion.copy(x.q0).premultiply(x.qy.setFromAxisAngle(x.Y, -(spin + p.ph) - 0.001));
                p.m.scale.setScalar(1 - 0.35 * fly);
            }
            const s = ease(at(k, 0.05, 0.4)) * (1 - at(k, 0.8, 1)), pulse = 1 + Math.sin(k * 40) * 0.08;
            x.sun.position.set(h.x, 3, h.z); x.sun.scale.setScalar(r * (1 + 4 * s) * pulse * 1.6); x.sun.material.opacity = 0.9 * s;
            x.core.scale.setScalar(r * (0.6 + 1.6 * s) * pulse); x.core.material.opacity = s * fade;
            x.ringA.scale.setScalar(r * 5 * ease(at(k, 0.1, 0.5))); x.ringA.material.opacity = 0.5 * (1 - at(k, 0.6, 0.9));
            const q = x.sparks.geometry.attributes.position;
            x.sd.forEach((e, i) => { const a = e.a + spin * e.w * 0.5, rr = r * (0.6 + 2.6 * e.s * s) + fly * 20 * e.s; q.setXYZ(i, h.x + Math.cos(a) * rr, 0.5, h.z + Math.sin(a) * rr); });
            q.needsUpdate = true; x.sparks.material.opacity = s * fade;
        },
        end(x) { for (const p of x.pieces || []) x.scene.remove(p.m); x.pieces = []; cleanup(x); },
    },
    // every other roll: puffs up round like a balloon (the shape itself bends toward a sphere), then pops into a burst of sparks
    mid: {
        key: 'a16-inflate', name: 'Inflate Pop', dur: 1.2,
        blurb: 'The die puffs up round like a balloon, wobbling, then pops into a small burst of sparks.',
        start(x) {
            init(x); const T = x.THREE;
            x.geo0 = x.mesh.geometry; x.geo = subdivide(x.geo0, 2); x.mesh.geometry = x.geo;
            x.overlays = x.mesh.children.filter((c) => c.isMesh); x.overlays.forEach((c) => (c.geometry = x.geo));
            const p = x.geo.attributes.position, v = new T.Vector3(); x.w0 = []; let s = 0;
            for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyQuaternion(x.q0); x.w0.push(v.clone()); s += v.length(); }
            x.mean = s / p.count; x.qi = x.q0.clone().invert();
            x.flash = spr(x, 0xfff0c0); x.flash.material.opacity = 0; x.ringA = flat(x, fx(T).ring, 0xffa030, 0.1); x.ringA.material.opacity = 0;
            x.sp = pts(x, 36, 0xffa030, 6); x.sp.material.opacity = 0; x.sd = Array.from({ length: 36 }, () => ({ a: R(0, 6.283), s: R(0.5, 1.2) }));
        },
        tick(k, x) {
            const POP = 0.6, h = x.p0, r = x.rad, v = new x.THREE.Vector3();
            if (k < POP) {
                const t = k / POP, m = ease(t), p = x.geo.attributes.position, wob = 1 + Math.sin(t * 28) * 0.04 * t;
                // bend every vertex toward the mean radius (derived from position, so shared corners stay joined), then swell the whole die
                for (let i = 0; i < p.count; i++) { const w = x.w0[i]; v.copy(w).multiplyScalar(1 + m * (x.mean / w.length() - 1)).applyQuaternion(x.qi); p.setXYZ(i, v.x, v.y, v.z); }
                p.needsUpdate = true; x.geo.computeVertexNormals(); x.geo.computeBoundingSphere();
                x.mesh.scale.setScalar((1 + 0.7 * m) * wob);
                x.flash.scale.setScalar(r * 3); x.flash.material.opacity = 0.35 * t * t; x.flash.position.set(h.x, 3, h.z);
                return;
            }
            const t = at(k, POP, 1);
            x.mesh.visible = false;
            x.flash.scale.setScalar(r * (3 + 5 * t)); x.flash.material.opacity = (1 - at(t, 0, 0.5)) * 0.9;
            x.ringA.scale.setScalar(r * (1 + 5 * ease(t))); x.ringA.material.opacity = (1 - t) * 0.8;
            const q = x.sp.geometry.attributes.position;
            x.sd.forEach((e, i) => { const rr = r * (1 + 4 * e.s * ease(t)); q.setXYZ(i, h.x + Math.cos(e.a) * rr, 0.6, h.z + Math.sin(e.a) * rr); });
            q.needsUpdate = true; x.sp.material.opacity = 1 - t;
        },
        end(x) { x.geo && x.geo.dispose(); cleanup(x); },
    },
};
