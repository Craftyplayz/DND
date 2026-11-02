// Ember Cage exits 11, Melt: the die's own shape slumps from the top down, runs out at the base into a glowing puddle, then cools and fades.
let FX = null;
function fx(T) {
    if (FX) return FX;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return (FX = { soft: new T.CanvasTexture(c), plane: new T.PlaneGeometry(1, 1) });
}
const sprite = (x, color) => { const s = new x.THREE.Sprite(new x.THREE.SpriteMaterial({ map: fx(x.THREE).soft, color, transparent: true, depthWrite: false, blending: x.THREE.AdditiveBlending }));
    s.position.copy(x.mesh.position); x.scene.add(s); x.own.push(s); return s; };
const pool = (x, color) => { const m = new x.THREE.Mesh(fx(x.THREE).plane, new x.THREE.MeshBasicMaterial({ map: fx(x.THREE).soft, color, transparent: true, depthWrite: false, blending: x.THREE.AdditiveBlending }));
    m.rotation.x = -Math.PI / 2; m.position.set(x.mesh.position.x, 0.05, x.mesh.position.z); x.scene.add(m); x.own.push(m); return m; };
// n points drifting up off the die; move(t) with t seconds since they started
function rise(x, n, color, size) {
    const T = x.THREE, pos = new Float32Array(n * 3), vel = [], o = x.mesh.position.clone();
    for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, s = 0.3 + Math.random() * 0.4; vel.push([Math.cos(a) * s, 1 + Math.random() * 1.5, Math.sin(a) * s]); }
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    const p = new T.Points(geo, new T.PointsMaterial({ map: fx(T).soft, color, size, sizeAttenuation: false, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
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

const clamp = (v) => Math.max(0, Math.min(1, v));
// shared setup: own copy of the geometry (and overlay), every vertex in table space around the die centre
function prep(x, n) {
    x.own = []; x.geo0 = x.mesh.geometry; x.geo = subdivide(x.geo0, n); x.mesh.geometry = x.geo;
    x.overlays = x.mesh.children.filter((c) => c.isMesh); x.overlays.forEach((c) => (c.geometry = x.geo));
    const p = x.geo.attributes.position, q = x.mesh.quaternion, v = new x.THREE.Vector3(); x.q0 = q.clone(); x.qi = q.clone().invert(); x.p0 = x.mesh.position.clone(); x.w0 = []; x.r = 0;
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyQuaternion(q); x.w0.push(v.clone()); x.r = Math.max(x.r, Math.hypot(v.x, v.z)); }
}
function put(x, fn) {
    const p = x.geo.attributes.position, v = new x.THREE.Vector3();
    for (let i = 0; i < p.count; i++) { fn(x.w0[i], v); v.applyQuaternion(x.qi); p.setXYZ(i, v.x, v.y, v.z); }
    p.needsUpdate = true; x.geo.computeVertexNormals(); x.geo.computeBoundingSphere();
}
function restore(x) {
    x.mesh.geometry = x.geo0; x.overlays.forEach((c) => (c.geometry = x.geo0)); x.geo.dispose();
    x.mesh.position.copy(x.p0); x.mesh.quaternion.copy(x.q0); x.mesh.scale.setScalar(1);
    for (const o of x.own || []) { x.scene.remove(o); o.material.dispose(); if (o.isPoints) o.geometry.dispose(); }
    x.own = [];
}

// nat 1: a hole opens, the die shrivels and crumples like a deflating balloon while darting about
const puncture = {
    key: 'a15-puncture', name: 'Puncture', blurb: 'A hole bursts open and the die hisses flat, crumpling and shrivelling as it darts about the table.',
    dur: 2.0, impact: 0.25,
    start(x) {
        prep(x, 2); x.hole = sprite(x, 0x0a0200); x.hole.material.blending = x.THREE.NormalBlending; x.hole.scale.setScalar(0.1);
        x.gl = sprite(x, 0xff7a18); x.gl.scale.setScalar(0.1); x.hiss = rise(x, 16, 0xff9a40, 4); x.phs = Math.random() * 9;
    },
    tick(k, x) {
        const c = clamp((k - 0.12) / 0.8), s = 1 - 0.88 * c * c * (3 - 2 * c), t = k * 2, T = x.THREE;
        // erratic darting: fast jittery sideways swings that die down as the air runs out
        const amp = x.r * 1.1 * Math.sin(Math.PI * clamp((k - 0.1) / 0.85)), ph = x.phs;
        const dx = amp * (Math.sin(t * 9 + ph) * 0.7 + Math.sin(t * 17 + ph * 2) * 0.3), dz = amp * (Math.cos(t * 11 + ph) * 0.7 + Math.sin(t * 23) * 0.3);
        x.mesh.position.set(x.p0.x + dx, x.p0.y, x.p0.z + dz);
        x.mesh.quaternion.setFromAxisAngle(new T.Vector3(0, 1, 0), Math.sin(t * 7 + ph) * 1.4 * c + t * 4 * c).multiply(x.q0);
        // crumple: positional noise grows as it shrivels, squashed flat as the air leaves
        put(x, (w, v) => { const n = Math.sin(w.x * 4.1 + w.z * 2.3 + w.y * 3.7) * Math.cos(w.z * 3.3 - w.y * 2.9 + w.x * 1.7); const f = s * (1 + c * 0.55 * n); v.set(w.x * f, w.y * s * (1 - 0.5 * c) * (1 + c * 0.4 * n), w.z * f); });
        const hp = Math.sin(Math.PI * clamp(k / 0.6));
        x.hole.position.set(x.mesh.position.x + x.r * 0.25 * s, x.p0.y + x.r, x.mesh.position.z + x.r * 0.15 * s); x.hole.scale.setScalar(0.1 + hp * x.r * 0.38); x.hole.material.opacity = clamp(k * 12) * (1 - clamp((k - 0.7) / 0.3));
        x.gl.position.copy(x.hole.position); x.gl.scale.setScalar(x.r * (1 + 2.5 * hp)); x.gl.material.opacity = 0.6 * hp;
        x.hiss.move(k * 1.4); x.hiss.material.opacity = 1 - k;
        x.mesh.scale.setScalar(1 - clamp((k - 0.88) / 0.12));
    },
    end: restore,
};

// nat 20: three heartbeats, each pulse bigger and brighter gold, the last bursting into light
const heartbeat = {
    key: 'a15-heartbeat', name: 'Heartbeat Surge', blurb: 'The die throbs three times, each beat bigger and more golden, and the last one bursts into light.',
    dur: 2.2, impact: 1.7,
    start(x) {
        x.own = []; x.s0 = x.mesh.scale.clone(); x.p0 = x.mesh.position.clone();
        x.halo = sprite(x, 0xffc83a); x.halo.scale.setScalar(0.1); x.halo.material.opacity = 0;
        x.core = sprite(x, 0xfff2b0); x.core.scale.setScalar(0.1); x.core.material.opacity = 0;
        x.ring = pool(x, 0xffb020); x.ring.position.y = x.p0.y + 3; x.ring.scale.setScalar(0.1); x.ring.material.opacity = 0;
        x.sparks = rise(x, 24, 0xffd860, 5); x.sparks.visible = false;
    },
    tick(k, x) {
        // a beat is a quick swell then a fall back; beats at 0.1, 0.33, 0.56 grow 1.15, 1.35, 1.65
        const beat = (t0, h) => { const u = (k - t0) / 0.2; return u < 0 || u > 1 ? 0 : h * Math.sin(Math.PI * Math.pow(u, 0.6)); };
        const b = beat(0.1, 0.15) + beat(0.33, 0.35) + beat(0.56, 0.65), burst = clamp((k - 0.78) / 0.22), gold = clamp(k / 0.75);
        x.mesh.scale.setScalar((1 + b) * (1 - burst * burst) + 0.0001);
        x.mesh.rotation.y += 0; x.mesh.position.copy(x.p0);
        x.halo.position.copy(x.p0); x.halo.position.y += 3; x.halo.scale.setScalar(2.2 + b * 6 + burst * 10); x.halo.material.opacity = clamp(0.15 + b * 0.8 + gold * 0.2) * (1 - burst);
        x.halo.material.color.setRGB(1, 0.6 + 0.3 * gold, 0.1 + 0.3 * gold);
        x.core.position.copy(x.halo.position); x.core.scale.setScalar(1 + burst * 22); x.core.material.opacity = Math.sin(Math.PI * clamp(burst * 1.1)) ;
        x.ring.position.x = x.p0.x; x.ring.position.z = x.p0.z; x.ring.scale.setScalar(1 + burst * 24); x.ring.material.opacity = 0.8 * (1 - burst) * (burst > 0 ? 1 : 0);
        x.sparks.visible = burst > 0; x.sparks.move(burst * 2.5); x.sparks.material.opacity = 1 - burst;
    },
    end(x) { x.mesh.scale.copy(x.s0); x.mesh.position.copy(x.p0); for (const o of x.own) { x.scene.remove(o); o.material.dispose(); if (o.isPoints) o.geometry.dispose(); } x.own = []; },
};

// every other roll: flattens like paper, folds in half, then in half again, and is gone
const fold = {
    key: 'a15-fold', name: 'Fold Away', blurb: 'The die flattens like paper, folds in half, folds in half again and vanishes.',
    dur: 1.3,
    start(x) { prep(x, 1); x.crease = sprite(x, 0xff8a28); x.crease.scale.setScalar(0.1); x.crease.material.opacity = 0; },
    tick(k, x) {
        const fl = clamp(k / 0.2), t1 = clamp((k - 0.2) / 0.28), t2 = clamp((k - 0.52) / 0.28), gone = clamp((k - 0.84) / 0.16), e = (t) => t * t * (3 - 2 * t);
        const a1 = Math.PI * e(t1), a2 = Math.PI * e(t2);
        // fold the +x half over the x=0 line, then the +z half over z=0; the lift is the paper arching over (the die stays centred on its own spot)
        put(x, (w, v) => {
            let X = w.x, Y = w.y * (1 - 0.8 * e(fl)), Z = w.z;
            if (X > 0) { Y += Math.sin(a1) * X * 0.8; X *= Math.cos(a1); }
            if (Z > 0) { Y += Math.sin(a2) * Z * 0.8; Z *= Math.cos(a2); }
            v.set(X, Y, Z);
        });
        const q = Math.sin(Math.PI * t1) + Math.sin(Math.PI * t2);
        x.crease.position.set(x.p0.x, x.p0.y + x.r, x.p0.z); x.crease.scale.setScalar(x.r * (1 + 1.5 * q)); x.crease.material.opacity = 0.5 * q;
        x.mesh.scale.setScalar(Math.max(0.001, 1 - gone));
    },
    end: restore,
};

export default { nat1: puncture, nat20: heartbeat, mid: fold };
