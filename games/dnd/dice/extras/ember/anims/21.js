import * as CANNON from 'https://cdn.jsdelivr.net/npm/cannon-es@0.20.0/dist/cannon-es.js';
import { dissolving } from './14.js';
// Ember Cage exits 21: nat 1 Shatter (the die's own faces crack apart and dim), nat 20 Supernova (it implodes to a point, then its faces blast out in gold), mid Twist out (it wrings itself into a fading swirl).
let FX = null;
function fx(T) {
    if (FX) return FX;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    const r = document.createElement('canvas'); r.width = r.height = 128;
    const h = r.getContext('2d'), rg = h.createRadialGradient(64, 64, 40, 64, 64, 64);
    rg.addColorStop(0, 'rgba(255,255,255,0)'); rg.addColorStop(0.7, 'rgba(255,255,255,1)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    h.fillStyle = rg; h.fillRect(0, 0, 128, 128);
    return (FX = { soft: new T.CanvasTexture(c), ring: new T.CanvasTexture(r), plane: new T.PlaneGeometry(1, 1) });
}
const add = (x, o) => (x.scene.add(o), x.own.push(o), o);
const sprite = (x, color) => { const s = add(x, new x.THREE.Sprite(new x.THREE.SpriteMaterial({ map: fx(x.THREE).soft, color, transparent: true, depthWrite: false, blending: x.THREE.AdditiveBlending }))); s.position.copy(x.mesh.position); return s; };
const flat = (x, color) => { const m = add(x, new x.THREE.Mesh(fx(x.THREE).plane, new x.THREE.MeshBasicMaterial({ map: fx(x.THREE).ring, color, transparent: true, depthWrite: false, blending: x.THREE.AdditiveBlending }))); m.rotation.x = -Math.PI / 2; m.position.set(x.mesh.position.x, 0.06, x.mesh.position.z); return m; };
// n points that spiral around the die; spin(k) lays them out
function swirl(x, n, color, size) {
    const T = x.THREE, pos = new Float32Array(n * 3), geo = new T.BufferGeometry(), o = x.mesh.position.clone(), a0 = [], r0 = [];
    for (let i = 0; i < n; i++) { a0.push(Math.random() * 6.283); r0.push(0.3 + Math.random() * 0.9); }
    geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    const p = add(x, new T.Points(geo, new T.PointsMaterial({ map: fx(T).soft, color, size, sizeAttenuation: false, transparent: true, depthWrite: false, blending: T.AdditiveBlending })));
    p.frustumCulled = false;
    p.spin = (k) => { for (let i = 0; i < n; i++) { const a = a0[i] + k * (5 + (i % 3) * 1.5), r = r0[i] * (1 + k * 2.2); pos.set([o.x + Math.cos(a) * r, o.y + 0.3 + k * 1.5, o.z + Math.sin(a) * r], i * 3); } geo.attributes.position.needsUpdate = true; };
    return p;
}
// a copy of a die's geometry with every triangle split into 4^n (face groups scale with it)
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

// splits the die into separate meshes made of its own triangles (lists[i] = triangle numbers of piece i), each centred on itself, with cloned materials
function pieces(x, g, lists) {
    const T = x.THREE, P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv, tm = [];
    for (const gr of g.groups) for (let t = gr.start / 3; t < (gr.start + gr.count) / 3; t++) tm[t] = gr.materialIndex;
    const mats = Array.isArray(x.mesh.material) ? x.mesh.material.map((m) => m.clone()) : x.mesh.material.clone();
    x.mats = [].concat(mats); x.parts = [];
    for (const l of lists) {
        const ts = g.groups.length ? l.slice().sort((a, b) => tm[a] - tm[b]) : l, pos = [], nor = [], uv = [], c = new T.Vector3(), geo = new T.BufferGeometry();
        for (const t of ts) for (let i = 0; i < 3; i++) { const j = t * 3 + i; pos.push(P.getX(j), P.getY(j), P.getZ(j)); N && nor.push(N.getX(j), N.getY(j), N.getZ(j)); U && uv.push(U.getX(j), U.getY(j)); }
        for (let i = 0; i < pos.length; i += 3) c.add(new T.Vector3(pos[i], pos[i + 1], pos[i + 2]));
        c.divideScalar(pos.length / 3);
        for (let i = 0; i < pos.length; i += 3) { pos[i] -= c.x; pos[i + 1] -= c.y; pos[i + 2] -= c.z; }
        geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
        if (N) geo.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
        if (U) geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
        if (g.groups.length) for (let i = 0; i < ts.length; ) { let j = i; while (j < ts.length && tm[ts[j]] === tm[ts[i]]) j++; geo.addGroup(i * 3, (j - i) * 3, tm[ts[i]]); i = j; }
        const m = add(x, new T.Mesh(geo, mats)); m.visible = false;
        // c in table space (relative to the die), the way out sideways, and a tumble axis
        const cw = c.clone().applyQuaternion(x.q0), d = new T.Vector3(cw.x, 0, cw.z);
        if (d.lengthSq() < 1e-4) d.set(Math.random() - 0.5, 0, Math.random() - 0.5);
        x.parts.push({ m, geo, c: cw, d: d.normalize(), ax: new T.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(), sp: 0.6 + Math.random() * 0.8 });
    }
}
// place a piece at the die's spot, moved by off (table space), tumbled ang about its axis, scaled s
function place(x, p, off, ang, s) {
    p.m.position.copy(x.p0).addScaledVector(p.c, s).add(off); p.m.scale.setScalar(s);
    p.m.quaternion.setFromAxisAngle(p.ax, ang).multiply(x.q0);
}
function dim(x, c, e, o) {
    for (const m of x.mats) { m.color.setRGB(c[0], c[1], c[2]); if (m.emissive) m.emissive.setRGB(e[0], e[1], e[2]); if (o < 1) { if (!m.transparent) { m.transparent = true; m.needsUpdate = true; } m.opacity = o; } }
}
function save(x) { x.own = []; x.p0 = x.mesh.position.clone(); x.q0 = x.mesh.quaternion.clone(); x.s0 = x.mesh.scale.clone(); x.vis0 = x.mesh.visible; }
function cleanup(x) {
    x.mesh.position.copy(x.p0); x.mesh.quaternion.copy(x.q0); x.mesh.scale.copy(x.s0); x.mesh.visible = x.vis0;
    if (x.geo0) { x.mesh.geometry = x.geo0; x.overlays.forEach((c) => (c.geometry = x.geo0)); x.geo.dispose(); x.geo0 = null; }
    for (const o of x.own) { x.scene.remove(o); if (o.isPoints) o.geometry.dispose(); if (!o.parts && o.material && !Array.isArray(o.material) && !x.mats?.includes(o.material)) o.material.dispose(); }
    for (const p of x.parts || []) p.geo.dispose();
    for (const m of x.mats || []) m.dispose();
    x.own = []; x.parts = x.mats = null;
}

// Shatter: the die cracks, then breaks into solid chunks cut right through it (Voronoi cells of the die itself, so each has a piece of the
// real faces outside and raw glowing rock where it broke). Every chunk is its own rigid body on the dice table: they fly, bounce off each other
// and the walls, and settle; a few seconds after the last one stops they fade.
const NB = 45;
// clip a convex solid (polygons with uvs and a material each) to the side n·p <= d; the cut is closed with a cap of material `inner`
function clip(T, polys, n, d, inner) {
    const out = [], cut = [];
    for (const f of polys) {
        const P = [], U = [], L = f.p.length;
        for (let i = 0; i < L; i++) {
            const a = f.p[i], b = f.p[(i + 1) % L], ua = f.uv[i], ub = f.uv[(i + 1) % L], da = a.dot(n) - d, db = b.dot(n) - d;
            if (da <= 1e-7) { P.push(a); U.push(ua); if (da > -1e-7) cut.push(a); }
            if ((da < -1e-7 && db > 1e-7) || (da > 1e-7 && db < -1e-7)) { const t = da / (da - db), q = a.clone().lerp(b, t); P.push(q); U.push([ua[0] + (ub[0] - ua[0]) * t, ua[1] + (ub[1] - ua[1]) * t]); cut.push(q); }
        }
        if (P.length >= 3) out.push({ p: P, uv: U, mi: f.mi });
    }
    const pts = []; for (const q of cut) if (!pts.some((r) => r.distanceToSquared(q) < 1e-10)) pts.push(q);
    if (pts.length >= 3) {
        // the cap, wound to face outward along n
        const c = pts.reduce((s, q) => s.add(q), new T.Vector3()).divideScalar(pts.length);
        const u = new T.Vector3().crossVectors(n, Math.abs(n.x) < 0.9 ? new T.Vector3(1, 0, 0) : new T.Vector3(0, 1, 0)).normalize(), v = new T.Vector3().crossVectors(n, u);
        const ang = (q) => { const r = q.clone().sub(c); return Math.atan2(r.dot(v), r.dot(u)); };
        pts.sort((a, b) => ang(a) - ang(b));
        out.push({ p: pts, uv: pts.map(() => [0.5, 0.5]), mi: inner });
    }
    return out;
}
// the chunks: the die's own triangles as a solid, cut into the Voronoi cell of each random point inside it
function chunks(T, geo, n) {
    const g = geo.index ? geo.toNonIndexed() : geo, P = g.attributes.position, U = g.attributes.uv, tm = [];
    const inner = g.groups.length ? Math.max(...g.groups.map((r) => r.materialIndex)) + 1 : 1;
    for (const gr of g.groups) for (let t = gr.start / 3; t < (gr.start + gr.count) / 3; t++) tm[t] = gr.materialIndex;
    const die = [];
    for (let t = 0; t < P.count / 3; t++) die.push({ p: [0, 1, 2].map((i) => new T.Vector3().fromBufferAttribute(P, t * 3 + i)), uv: [0, 1, 2].map((i) => (U ? [U.getX(t * 3 + i), U.getY(t * 3 + i)] : [0, 0])), mi: tm[t] ?? 0 });
    const planes = die.map((f) => { const nn = new T.Vector3().subVectors(f.p[1], f.p[0]).cross(new T.Vector3().subVectors(f.p[2], f.p[0])).normalize(); return [nn, nn.dot(f.p[0])]; });
    let R = 0; for (const f of die) for (const q of f.p) R = Math.max(R, q.length());
    const seeds = [];
    while (seeds.length < n) { const s = new T.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).multiplyScalar(R); if (planes.every(([nn, d]) => nn.dot(s) < d - 0.02)) seeds.push(s); }
    const out = [];
    for (const s of seeds) {
        let polys = die;
        for (const o of seeds) { if (o === s) continue; const nn = o.clone().sub(s).normalize(); polys = clip(T, polys, nn, nn.dot(o.clone().add(s).multiplyScalar(0.5)), inner); if (polys.length < 4) break; }
        if (polys.length >= 4) out.push(polys);
    }
    if (g !== geo) g.dispose();
    return { out, inner, R };
}
// a chunk's mesh geometry (centred on itself, faces grouped by material) and its cannon shape
function solid(T, polys) {
    const c = new T.Vector3(); let k = 0; for (const f of polys) for (const q of f.p) { c.add(q); k++; } c.divideScalar(k);
    const pos = [], uv = [], nor = [], geo = new T.BufferGeometry(), verts = [], faces = [];
    const id = (q) => { let i = verts.findIndex((r) => r.distanceToSquared(q) < 1e-9); if (i < 0) { i = verts.length; verts.push(q); } return i; };
    let r = 0;
    for (const f of polys.slice().sort((a, b) => a.mi - b.mi)) {
        const L = f.p.map((q) => q.clone().sub(c)), nn = new T.Vector3();
        for (let i = 0; i < L.length; i++) { const a = L[i], b = L[(i + 1) % L.length]; nn.x += (a.y - b.y) * (a.z + b.z); nn.y += (a.z - b.z) * (a.x + b.x); nn.z += (a.x - b.x) * (a.y + b.y); }
        nn.normalize();
        const start = pos.length / 3;
        for (let i = 1; i < L.length - 1; i++) for (const j of [0, i, i + 1]) { pos.push(L[j].x, L[j].y, L[j].z); uv.push(...f.uv[j]); nor.push(nn.x, nn.y, nn.z); }
        if (geo.groups.length && geo.groups.at(-1).materialIndex === f.mi) geo.groups.at(-1).count += pos.length / 3 - start; else geo.addGroup(start, pos.length / 3 - start, f.mi);
        const fi = []; for (const q of L) { const i = id(q); if (fi.at(-1) !== i && fi[0] !== i) fi.push(i); r = Math.max(r, q.length()); }
        if (fi.length >= 3) faces.push(fi);
    }
    geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); geo.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
    const shape = new CANNON.ConvexPolyhedron({ vertices: verts.map((q) => new CANNON.Vec3(q.x, q.y, q.z)), faces });
    return { geo, shape, c, r };
}
const nat1 = {
    key: 'a21-shatter', name: 'Shatter', impact: 0.55, dur: 9,
    blurb: 'Cracks split the die into dozens of solid chunks of itself that fly apart, tumble, bounce off each other and settle, then fade a few seconds later.',
    start(x) {
        save(x);
        const T = x.THREE, { out, inner, R } = chunks(T, x.mesh.geometry, NB);
        x.R = R; x.world = x.body.world;
        // our own copies of the die's materials, plus raw rock for the broken insides, glowing at first
        // they dissolve away at the end in growing holes, the same way as Exploded View
        x.u = { dis: { value: 0 }, f: { value: 4 / R } };
        const mats = [].concat(x.mesh.material).map((m) => dissolving(m.clone(), x.u));
        while (mats.length < inner) mats.push(mats[0]);
        x.rock = dissolving(new T.MeshStandardMaterial({ color: 0x24201d, roughness: 0.95, metalness: 0.1, emissive: 0xff5410, emissiveIntensity: 1.4, flatShading: true }), x.u);
        mats[inner] = x.rock; x.mats = [...new Set(mats)];
        x.parts = out.map((polys) => {
            const { geo, shape, c, r } = solid(T, polys), m = add(x, new T.Mesh(geo, mats)); m.visible = false; m.castShadow = true;
            const b = new CANNON.Body({ mass: Math.max(0.03, r ** 3), shape, sleepSpeedLimit: 0.2, sleepTimeLimit: 0.4, angularDamping: 0.2, linearDamping: 0.1 });
            // where it sits in the die now, and its kick: outward from the middle and up
            const w = c.clone().applyQuaternion(x.q0), dir = w.clone().normalize(), sp = 6 + Math.random() * 8;
            b.position.set(x.p0.x + w.x, x.p0.y + w.y, x.p0.z + w.z); b.quaternion.set(x.q0.x, x.q0.y, x.q0.z, x.q0.w);
            b.velocity.set(dir.x * sp, Math.abs(dir.y) * sp * 0.5 + 5 + Math.random() * 6, dir.z * sp);
            b.angularVelocity.set((Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16);
            return { m, b, geo };
        });
        x.glow = sprite(x, 0xff5a10); x.glow.scale.setScalar(0.1);
    },
    tick(k, x) {
        x.t0 ??= x.sec; const t = x.sec - x.t0, BREAK = 0.55;
        if (t < BREAK) {
            // cracking: the die shudders as the glow builds inside it
            const c = t / BREAK, j = 0.05 * x.R * c; x.mesh.position.set(x.p0.x + (Math.random() - 0.5) * j, x.p0.y, x.p0.z + (Math.random() - 0.5) * j);
            x.glow.scale.setScalar(x.R * (1 + 2.5 * c)); x.glow.material.opacity = 0.8 * c;
            return;
        }
        if (!x.broke && x.world) {
            // the break: the die's own body steps aside (asleep, colliding with nothing) and the chunks take its place
            x.broke = true; x.mesh.visible = false; x.mask0 = x.body.collisionFilterMask; x.body.collisionFilterMask = 0; x.body.sleep();
            for (const p of x.parts) { x.world.addBody(p.b); p.m.visible = true; }
        }
        const s = t - BREAK;
        x.glow.scale.setScalar(x.R * (3.5 + 3 * s)); x.glow.material.opacity = Math.max(0, 0.8 - s * 2.5);
        x.rock.emissiveIntensity = 1.4 * Math.exp(-s * 1.6);
        let still = true;
        for (const p of x.parts) {
            p.m.position.copy(p.b.position); p.m.quaternion.copy(p.b.quaternion);
            if (p.b.sleepState !== CANNON.Body.SLEEPING && (p.b.velocity.length() > 0.3 || p.b.angularVelocity.length() > 0.8)) still = false;
        }
        // all settled: wait a second and a quarter, then dissolve (and always be gone before the exit ends)
        // (a chunk that never quite stops jittering counts as settled four seconds after the break)
        if ((!still || s < 0.4) && s < 4) x.calm = null; else x.calm ??= t;
        const fade = Math.max(x.calm == null ? 0 : at(t, x.calm + 1.25, x.calm + 2.05), at(k, 0.9, 0.98));
        x.u.dis.value = fade > 0 ? 0.15 + 0.75 * fade : 0;
        if (fade > 0) for (const p of x.parts) p.m.castShadow = false; // a shadow can't show the holes, so it goes as they open
        if (fade >= 1 && !x.gone) { x.gone = true; for (const p of x.parts) { p.m.visible = false; x.world.removeBody(p.b); } }
    },
    end(x) {
        if (x.world) for (const p of x.parts || []) x.world.removeBody(p.b);
        if (x.broke) { x.body.collisionFilterMask = x.mask0; x.body.wakeUp(); }
        cleanup(x);
    },
};

// the die squeezes into a bright point, holds, then its faces burst out as an expanding gold shell and shockwave
const nat20 = {
    key: 'a21-supernova', name: 'Supernova', impact: 1.2, dur: 2.2,
    blurb: 'The die shrinks to a tiny bright point, pauses, then blasts outward as a shell of its own golden faces.',
    start(x) {
        save(x);
        const g = subdivide(x.mesh.geometry, 1), n = g.attributes.position.count / 3;
        pieces(x, g, Array.from({ length: n }, (_, t) => [t])); g.dispose();
        dim(x, [1, 0.85, 0.4], [1, 0.65, 0.1], 1);
        x.star = sprite(x, 0xfff0b0); x.star.scale.setScalar(0.1); x.flash = sprite(x, 0xffc040); x.flash.scale.setScalar(0.1); x.ring = flat(x, 0xffd060); x.ring.scale.setScalar(0.1);
    },
    tick(k, x) {
        const T = x.THREE, s = at(k, 0, 0.5), b = at(k, 0.55, 1), e = ease(b), off = new T.Vector3(), hold = k < 0.55;
        // implosion: shrinks while spinning faster, the glow gathers
        x.mesh.visible = hold;
        if (hold) {
            x.mesh.scale.setScalar(Math.max(0.04, 1 - ease(s) * 0.97));
            x.mesh.quaternion.setFromAxisAngle(new T.Vector3(0, 1, 0), s * s * 14).multiply(x.q0);
        }
        x.star.scale.setScalar(hold ? 0.4 + s * 1.2 + 0.25 * Math.sin(k * 60) * at(k, 0.45, 0.55) : 0.1); x.star.material.opacity = hold ? 0.3 + s * 0.7 : 0;
        x.parts.forEach((p) => {
            p.m.visible = !hold;
            if (!hold) { off.copy(p.d).multiplyScalar(e * (5 + 3 * p.sp)); place(x, p, off, e * 4 * p.sp, 0.2 + e * 0.8); }
        });
        dim(x, [1, 0.85 - 0.3 * b, 0.4], [1 - 0.5 * b, 0.65 - 0.5 * b, 0.1], 1 - at(k, 0.8, 1));
        x.flash.scale.setScalar(2 + e * 14); x.flash.material.opacity = b > 0 ? 1 - at(k, 0.55, 0.8) : 0;
        x.ring.scale.setScalar(0.5 + e * 16); x.ring.material.opacity = b > 0 ? 1 - at(k, 0.55, 1) : 0;
    },
    end: cleanup,
};

// twist out: every height turns a different amount around the vertical axis, so the die wrings into a spiral that thins away in a swirl of sparks
const mid = {
    key: 'a21-twist-out', name: 'Twist out', dur: 1.2,
    blurb: 'The die wrings itself around the vertical axis and thins into a fading swirl of embers.',
    start(x) {
        save(x);
        x.geo0 = x.mesh.geometry; x.geo = subdivide(x.geo0, 2); x.mesh.geometry = x.geo;
        x.overlays = x.mesh.children.filter((c) => c.isMesh); x.overlays.forEach((c) => (c.geometry = x.geo));
        const p = x.geo.attributes.position, v = new x.THREE.Vector3();
        x.qi = x.q0.clone().invert(); x.w0 = []; let lo = Infinity, hi = -Infinity;
        for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyQuaternion(x.q0); x.w0.push(v.clone()); lo = Math.min(lo, v.y); hi = Math.max(hi, v.y); }
        x.lo = lo; x.tall = hi - lo || 1;
        x.sw = swirl(x, 18, 0xff8a30, 5); x.heat = sprite(x, 0xff6a10); x.heat.scale.setScalar(0.1);
    },
    tick(k, x) {
        const m = ease(at(k, 0, 0.85)), p = x.geo.attributes.position, v = new x.THREE.Vector3();
        for (let i = 0; i < p.count; i++) {
            const w = x.w0[i], h = (w.y - x.lo) / x.tall, a = m * (3 + 6 * h), c = Math.cos(a), s = Math.sin(a), r = Math.max(0.02, 1 - m * (0.65 + 0.35 * h));
            v.set((w.x * c - w.z * s) * r, w.y + m * (h - 0.3) * x.tall * 0.4, (w.x * s + w.z * c) * r).applyQuaternion(x.qi);
            p.setXYZ(i, v.x, v.y, v.z);
        }
        p.needsUpdate = true; x.geo.computeVertexNormals(); x.geo.computeBoundingSphere();
        x.mesh.scale.setScalar(Math.max(0.001, 1 - at(k, 0.8, 1)));
        x.sw.spin(k); x.sw.material.opacity = Math.sin(Math.PI * at(k, 0.05, 1));
        x.heat.scale.setScalar(1 + m * 2.5); x.heat.material.opacity = 0.45 * Math.sin(Math.PI * at(k, 0, 0.9));
    },
    end: cleanup,
};

export default { nat1, nat20, mid };
