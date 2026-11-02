// Ember Cage exits 17: nat 1 is stomped flat by an unseen weight, nat 20 fans into a spinning kaleidoscope of dice, other rolls scatter their faces apart like embers.
let FX = null;
function fx(T) {
    if (FX) return FX;
    const mk = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t; };
    const rad = (g, s, stops) => { const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); stops.forEach(([o, c]) => r.addColorStop(o, c)); g.fillStyle = r; g.fillRect(0, 0, s, s); };
    const W = (a) => `rgba(255,255,255,${a})`;
    return (FX = {
        plane: new T.PlaneGeometry(1, 1),
        soft: mk(64, 64, (g) => rad(g, 64, [[0, W(1)], [0.35, W(0.6)], [1, W(0)]])),
        ring: mk(128, 128, (g) => rad(g, 128, [[0, W(0)], [0.6, W(0)], [0.82, W(1)], [1, W(0)]])),
        disc: mk(64, 64, (g) => rad(g, 64, [[0, W(1)], [0.72, W(1)], [1, W(0)]])),
        // a thin line, bright in the middle, fading to both ends
        line: mk(256, 32, (g, w, h) => {
            const a = g.createLinearGradient(0, 0, w, 0); a.addColorStop(0, W(0)); a.addColorStop(0.5, W(1)); a.addColorStop(1, W(0)); g.fillStyle = a; g.fillRect(0, 0, w, h);
            const b = g.createLinearGradient(0, 0, 0, h); b.addColorStop(0, W(0)); b.addColorStop(0.5, W(1)); b.addColorStop(1, W(0));
            g.globalCompositeOperation = 'destination-in'; g.fillStyle = b; g.fillRect(0, 0, w, h);
        }),
    });
}
const clamp = (v) => Math.max(0, Math.min(1, v));
const at = (k, a, b) => clamp((k - a) / (b - a));
const ease = (k) => 1 - (1 - k) ** 3;
const R = (a, b) => a + Math.random() * (b - a);
const add = (x, o) => { x.scene.add(o); x.own.push(o); return o; };
const spr = (x, tex, color, y, additive = true) => {
    const s = new x.THREE.Sprite(new x.THREE.SpriteMaterial({ map: tex, color, transparent: true, depthWrite: false, blending: additive ? x.THREE.AdditiveBlending : x.THREE.NormalBlending }));
    s.position.set(x.home.x, y, x.home.z); return add(x, s);
};
const flat = (x, tex, color, y, additive = true) => {
    const m = new x.THREE.Mesh(fx(x.THREE).plane, new x.THREE.MeshBasicMaterial({ map: tex, color, transparent: true, depthWrite: false, blending: additive ? x.THREE.AdditiveBlending : x.THREE.NormalBlending }));
    m.rotation.x = -Math.PI / 2; m.position.set(x.home.x, y, x.home.z); return add(x, m);
};
// lay a flat line through (px, pz) pointing along (cx, cz)
const lay = (m, px, y, pz, len, wid, cx, cz) => { m.position.set(px, y, pz); m.scale.set(len, wid, 1); m.rotation.z = Math.atan2(-cz, cx); };
const common = (x) => {
    x.own = []; x.home = x.mesh.position.clone(); x.q0 = x.mesh.quaternion.clone();
    x.mesh.geometry.computeBoundingSphere(); x.r0 = x.mesh.geometry.boundingSphere.radius;
};
const cleanup = (x) => {
    for (const o of x.own || []) { x.scene.remove(o); o.material.dispose?.(); if (o.isPoints) o.geometry.dispose(); }
    x.own = [];
    if (x.geo0) { x.mesh.geometry = x.geo0; (x.overlays || []).forEach((c) => (c.geometry = x.geo0)); x.geo.dispose(); x.geo0 = null; }
    x.mesh.visible = true; x.mesh.scale.setScalar(1); x.mesh.position.copy(x.home); x.mesh.quaternion.copy(x.q0);
};

export default {
    nat1: {
        key: 'a17-stomped', name: 'Stomped', dur: 2.0, impact: 0.5,
        blurb: 'A shadow darkens over the die, then an unseen weight squashes it flat in one hit; it splats out wide, cracks glow, and the splat fades.',
        start(x) {
            common(x); const F = fx(x.THREE), r = x.r0, q = x.mesh.quaternion, v = new x.THREE.Vector3();
            // squash a private copy of the shape in table space (the die lies tilted, so a plain scale would not flatten it downward)
            x.geo0 = x.mesh.geometry; x.geo = x.geo0.clone(); x.mesh.geometry = x.geo; x.qi = q.clone().invert();
            x.overlays = x.mesh.children.filter((c) => c.isMesh); x.overlays.forEach((c) => (c.geometry = x.geo));
            const p = x.geo.attributes.position; x.w0 = []; for (let i = 0; i < p.count; i++) x.w0.push(v.fromBufferAttribute(p, i).applyQuaternion(q).clone());
            x.shadow = spr(x, F.disc, 0x000000, 4, false); x.shadow.material.opacity = 0;
            x.scorch = flat(x, F.disc, 0x0a0403, 0.04, false); x.scorch.material.opacity = 0; x.scorch.renderOrder = -2;
            x.flash = spr(x, F.soft, 0xfff0c0, 5); x.flash.material.opacity = 0;
            x.shock = flat(x, F.ring, 0xffb050, 0.15); x.shock.material.opacity = 0;
            x.cracks = []; for (let i = 0; i < 9; i++) x.cracks.push({ m: flat(x, F.line, 0xff8a20, 4), a: (i / 9) * 6.283 + R(-0.25, 0.25), len: r * R(1.4, 2.8) });
            x.sparks = []; for (let i = 0; i < 14; i++) { const s = spr(x, F.soft, 0xff9a30, 4.5); s.scale.setScalar(0.01); x.sparks.push({ s, a: R(0, 6.283), sp: r * R(3, 7) }); }
        },
        tick(k, x) {
            const T = k * 2.0, h = x.home, r = x.r0, m = x.mesh, s = T - 0.5;
            m.position.copy(h); m.quaternion.copy(x.q0);
            const sq = (W, Hs) => { const p = x.geo.attributes.position, v = new x.THREE.Vector3(); for (let i = 0; i < p.count; i++) { const w = x.w0[i]; v.set(w.x * W, w.y * Hs, w.z * W).applyQuaternion(x.qi); p.setXYZ(i, v.x, v.y, v.z); } p.needsUpdate = true; x.geo.computeVertexNormals(); x.geo.computeBoundingSphere(); };
            if (s < 0) {
                // the weight looms: a dark shadow gathers over the die, which creaks under the pressure
                const t = T / 0.5;
                x.shadow.scale.setScalar(r * (7 - 2.5 * t)); x.shadow.material.opacity = 0.45 * t;
                const sh = 0.04 * t; m.position.x += R(-sh, sh); m.position.z += R(-sh, sh); sq(1 - 0.06 * t, 1 + 0.12 * t);
                return;
            }
            // one hit: squash thin and wide with a springy overshoot
            const e = 1 - Math.exp(-s * 16) * Math.cos(s * 26), W = 1 + 0.95 * e, fade = 1 - at(T, 1.55, 2.0);
            sq(W * fade + 0.001, Math.max(0.03, 1 - 0.95 * e)); m.scale.setScalar(fade + 0.001);
            x.shadow.material.opacity = 0.45 * (1 - at(s, 0, 0.15)); x.shadow.scale.setScalar(r * 4.5);
            const sc = 1 - at(T, 1.5, 2.0), heat = 1 - at(s, 0.1, 1.0);
            x.scorch.scale.setScalar(r * 2.4 * (1 + 0.8 * ease(at(s, 0, 0.12)))); x.scorch.material.opacity = 0.85 * sc;
            x.flash.scale.setScalar(r * (4 + 9 * ease(at(s, 0, 0.3)))); x.flash.material.opacity = (1 - at(s, 0, 0.3)) ** 1.5;
            const sw = at(s, 0, 0.55); x.shock.scale.setScalar(r * (2 + 12 * ease(sw))); x.shock.material.opacity = (1 - sw) ** 1.4;
            for (const c of x.cracks) {
                const len = c.len * ease(at(s, 0.02, 0.3)), cx = Math.cos(c.a), cz = Math.sin(c.a), d = r * 0.5 * W + len / 2;
                lay(c.m, h.x + cx * d, 4, h.z + cz * d, len + 0.01, r * 0.18, cx, cz);
                c.m.material.color.setRGB(1, 0.15 + 0.6 * heat * heat, 0.03); c.m.material.opacity = heat * sc;
            }
            for (const p of x.sparks) {
                const u = at(s, 0, 0.7), d = r * 0.8 + p.sp * ease(u);
                p.s.position.set(h.x + Math.cos(p.a) * d, 4.5, h.z + Math.sin(p.a) * d); p.s.scale.setScalar(r * 0.5 * (1 - u)); p.s.material.opacity = 1 - u;
            }
        },
        end: cleanup,
    },
    nat20: {
        key: 'a17-kaleidoscope', name: 'Kaleidoscope', dur: 2.3, impact: 1.65,
        blurb: 'Copies of the die fan out in two rings that turn together like a kaleidoscope, then fold back into the die with a golden flash.',
        start(x) {
            common(x); const T = x.THREE, F = fx(T);
            x.qy = new T.Quaternion(); x.Y = new T.Vector3(0, 1, 0);
            x.copies = [];
            for (let i = 0; i < 12; i++) {
                const outer = i >= 6, c = add(x, new T.Mesh(x.mesh.geometry, x.mesh.material)), g = spr(x, F.soft, outer ? 0xffc040 : 0xff6a10, 2);
                c.visible = false; x.copies.push({ c, g, outer, a0: ((i % 6) / 6) * 6.283 + (outer ? 0.5236 : 0) });
            }
            x.halo = spr(x, F.soft, 0xffa020, 1.5); x.halo.material.opacity = 0;
            x.flash = spr(x, F.soft, 0xfff4c0, 6); x.flash.material.opacity = 0;
            x.wave = flat(x, F.ring, 0xffd860, 0.15); x.wave.material.opacity = 0;
            x.rays = []; for (let i = 0; i < 12; i++) x.rays.push({ m: flat(x, F.line, 0xffd050, 0.3), a: (i / 12) * 6.283 });
        },
        tick(k, x) {
            const T = k * 2.3, h = x.home, r = x.r0, m = x.mesh, qy = x.qy;
            const out = ease(at(T, 0.1, 0.65)), fold = at(T, 1.2, 1.65), rad = out * (1 - fold * fold * fold);
            // the whole ring turns together, speeding up as it folds back in
            const th = 7 * (at(T, 0.1, 1.65) ** 1.5), pop = at(T, 1.65, 2.3);
            for (const c of x.copies) {
                const o = c.outer, R2 = r * (o ? 5.6 : 3.2) * rad, a = (o ? -th * 0.8 : th) + c.a0, cx = Math.cos(a), cz = Math.sin(a), vis = T < 1.66 && rad > 0.01;
                c.c.visible = vis; c.g.visible = vis; if (!vis) continue;
                c.c.position.set(h.x + cx * R2, h.y, h.z + cz * R2); c.c.scale.setScalar((o ? 0.6 : 0.85) * (0.4 + 0.6 * out));
                c.c.quaternion.copy(x.q0).premultiply(qy.setFromAxisAngle(x.Y, (o ? 1 : -1) * th * 2.2 + c.a0));
                c.g.position.set(c.c.position.x, 2, c.c.position.z); c.g.scale.setScalar(r * 2.6 * (o ? 0.8 : 1)); c.g.material.opacity = 0.5 * out;
            }
            // the real die spins at the centre and swells as the copies fold into it
            m.position.copy(h); m.quaternion.copy(x.q0).premultiply(qy.setFromAxisAngle(x.Y, th * 1.6));
            m.scale.setScalar((1 + 0.25 * fold) * (T < 1.65 ? 1 : 1.2 * (1 - ease(pop)) + 0.001));
            x.halo.scale.setScalar(r * (3 + 5 * rad + 4 * fold)); x.halo.material.opacity = 0.35 * out * (1 - pop);
            const f = at(T, 1.65, 2.05);
            x.flash.scale.setScalar(r * (3 + 11 * ease(f))); x.flash.material.opacity = T < 1.65 ? 0.6 * fold : (1 - f) ** 1.5;
            const w = at(T, 1.65, 2.3); x.wave.scale.setScalar(r * (2 + 12 * ease(w))); x.wave.material.opacity = T < 1.65 ? 0 : (1 - w) ** 1.3;
            for (const y of x.rays) {
                const cx = Math.cos(y.a + th * 0.3), cz = Math.sin(y.a + th * 0.3), len = r * 7 * ease(at(T, 1.65, 1.95)) + 0.01;
                lay(y.m, h.x + cx * len / 2, 0.3, h.z + cz * len / 2, len, r * 0.25, cx, cz); y.m.material.opacity = T < 1.65 ? 0 : 1 - at(T, 1.8, 2.3);
            }
        },
        end: cleanup,
    },
    mid: {
        key: 'a17-scatter-faces', name: 'Scatter Faces', dur: 1.3,
        blurb: 'The faces of the die drift gently apart, turning and shrinking away like embers while sparks float off.',
        start(x) {
            common(x); const T = x.THREE, q = x.mesh.quaternion;
            // work on a flat-shaded copy so each triangle can move on its own
            x.geo0 = x.mesh.geometry; x.geo = x.geo0.index ? x.geo0.toNonIndexed() : x.geo0.clone(); x.mesh.geometry = x.geo;
            x.overlays = x.mesh.children.filter((c) => c.isMesh); x.overlays.forEach((c) => (c.geometry = x.geo));
            const p = x.geo.attributes.position, n = p.count / 3, v = [new T.Vector3(), new T.Vector3(), new T.Vector3()], e1 = new T.Vector3(), e2 = new T.Vector3(), nm = new T.Vector3();
            x.w0 = []; const key = [], faces = {}; let mid = new T.Vector3();
            for (let i = 0; i < p.count; i++) { const w = new T.Vector3().fromBufferAttribute(p, i).applyQuaternion(q); x.w0.push(w); mid.add(w); }
            mid.divideScalar(p.count);
            for (let t = 0; t < n; t++) {
                for (let j = 0; j < 3; j++) v[j].copy(x.w0[t * 3 + j]);
                nm.crossVectors(e1.subVectors(v[1], v[0]), e2.subVectors(v[2], v[0])).normalize();
                const d = nm.dot(v[0]), k = [nm.x, nm.y, nm.z].map((a) => Math.round(a * 8)).join() + ':' + Math.round(d / (x.r0 * 0.15)), f = faces[k] || (faces[k] = { c: new T.Vector3(), n: 0, id: Object.keys(faces).length });
                f.c.add(v[0]).add(v[1]).add(v[2]); f.n += 3; key.push(k);
            }
            for (const k in faces) { const f = faces[k]; f.c.divideScalar(f.n); f.dir = new T.Vector3(f.c.x - mid.x, 0, f.c.z - mid.z); if (f.dir.length() < x.r0 * 0.3) f.dir.set(Math.cos(f.id * 2.4), 0, Math.sin(f.id * 2.4)); f.dir.normalize(); f.spin = (f.id % 2 ? 1 : -1) * R(0.8, 2); }
            x.fk = key.map((k) => faces[k]);
            // sparks start on the faces and drift sideways
            const N = 26, pos = new Float32Array(N * 3), geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3));
            const fl = Object.values(faces); x.sp = [];
            for (let i = 0; i < N; i++) { const f = fl[i % fl.length], a = R(0, 6.283); x.sp.push({ p: f.c.clone(), v: [f.dir.x * R(0.5, 1.4) + Math.cos(a) * 0.5, R(0, 1), f.dir.z * R(0.5, 1.4) + Math.sin(a) * 0.5] }); }
            x.pts = add(x, new T.Points(geo, new T.PointsMaterial({ map: fx(T).soft, color: 0xff9a40, size: 6, sizeAttenuation: false, transparent: true, depthWrite: false, blending: T.AdditiveBlending })));
            x.pts.frustumCulled = false; x.qi = q.clone().invert();
        },
        tick(k, x) {
            const p = x.geo.attributes.position, v = new x.THREE.Vector3(), c = new x.THREE.Vector3(), h = x.home, r = x.r0;
            x.mesh.position.copy(h); x.mesh.quaternion.copy(x.q0);
            const drift = ease(k) * r * 1.8, shrink = 1 - at(k, 0.3, 1) ** 1.3;
            for (let i = 0; i < p.count; i++) {
                const f = x.fk[(i / 3) | 0], a = f.spin * k, ca = Math.cos(a), sa = Math.sin(a);
                // turn the face about the vertical axis around its own centre, shrink it, and slide it outward
                v.copy(x.w0[i]).sub(f.c); const vx = v.x * ca - v.z * sa, vz = v.x * sa + v.z * ca; v.set(vx, v.y, vz).multiplyScalar(shrink);
                v.add(f.c).addScaledVector(f.dir, drift).applyQuaternion(x.qi); p.setXYZ(i, v.x, v.y, v.z);
            }
            p.needsUpdate = true; x.geo.computeVertexNormals(); x.geo.computeBoundingSphere();
            const sp = x.pts.geometry.attributes.position.array;
            x.sp.forEach((s, i) => { sp[i * 3] = h.x + s.p.x + s.v[0] * k * r * 2.5; sp[i * 3 + 1] = h.y + s.p.y + s.v[1] * k; sp[i * 3 + 2] = h.z + s.p.z + s.v[2] * k * r * 2.5; });
            x.pts.geometry.attributes.position.needsUpdate = true; x.pts.material.opacity = 1 - at(k, 0.2, 1);
        },
        end: cleanup,
    },
};
