// Ember Cage exits 18: Wrung out (nat 1), Golden sphere (nat 20), Ember float (mid). All three move the die's own model.
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
const ring = (x, color) => { const m = new x.THREE.Mesh(fx(x.THREE).plane, new x.THREE.MeshBasicMaterial({ map: fx(x.THREE).soft, color, transparent: true, depthWrite: false, blending: x.THREE.AdditiveBlending }));
    m.rotation.x = -Math.PI / 2; m.position.set(x.mesh.position.x, 0.05, x.mesh.position.z); x.scene.add(m); x.own.push(m); return m; };
// n points bursting outward from the die (sideways, since the camera looks down); move(t) with t seconds since they started
function burst(x, n, color, size, speed) {
    const T = x.THREE, pos = new Float32Array(n * 3), vel = [], o = x.mesh.position.clone();
    for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, s = speed * (0.4 + Math.random() * 0.8); vel.push([Math.cos(a) * s, 0.5 + Math.random(), Math.sin(a) * s]); }
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    const p = new T.Points(geo, new T.PointsMaterial({ map: fx(T).soft, color, size, sizeAttenuation: false, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
    p.frustumCulled = false; x.scene.add(p); x.own.push(p);
    p.move = (t) => { for (let i = 0; i < n; i++) { pos[i * 3] = o.x + vel[i][0] * t; pos[i * 3 + 1] = o.y + vel[i][1] * t; pos[i * 3 + 2] = o.z + vel[i][2] * t; } geo.attributes.position.needsUpdate = true; };
    p.move(0); return p;
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
// swap in our own bendable copy; w0 = every vertex in table space relative to the die, R = its average radius, lo/tall = vertical extent
function own(x, n) {
    const T = x.THREE;
    x.p0 = x.mesh.position.clone(); x.q0 = x.mesh.quaternion.clone(); x.qi = x.q0.clone().invert();
    x.geo0 = x.mesh.geometry; x.geo = subdivide(x.geo0, n); x.mesh.geometry = x.geo;
    x.overlays = x.mesh.children.filter((c) => c.isMesh); x.overlays.forEach((c) => (c.geometry = x.geo));
    const p = x.geo.attributes.position, v = new T.Vector3(); x.w0 = []; x.R = 0; let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyQuaternion(x.q0); x.w0.push(v.clone()); x.R += v.length(); lo = Math.min(lo, v.y); hi = Math.max(hi, v.y); }
    x.R /= p.count; x.lo = lo; x.tall = hi - lo; x.v = v; x.w = new T.Vector3();
}
const put = (x, i, w) => { x.v.copy(w).applyQuaternion(x.qi); x.geo.attributes.position.setXYZ(i, x.v.x, x.v.y, x.v.z); };
const done = (x) => { x.geo.attributes.position.needsUpdate = true; x.geo.computeVertexNormals(); x.geo.computeBoundingSphere(); };
// a copy of the die's current shape laid over it, following the mesh
function shell(x, material) { const m = new x.THREE.Mesh(x.geo, material); x.scene.add(m); x.own.push(m); x.shells = (x.shells || []).concat(m); return m; }
const follow = (x) => (x.shells || []).forEach((m) => { m.position.copy(x.mesh.position); m.quaternion.copy(x.mesh.quaternion); m.scale.copy(x.mesh.scale).multiplyScalar(1.01); });
function cleanup(x) {
    x.mesh.geometry = x.geo0; x.overlays.forEach((c) => (c.geometry = x.geo0)); x.geo.dispose();
    x.mesh.scale.setScalar(1); x.mesh.visible = true; x.mesh.position.copy(x.p0); x.mesh.quaternion.copy(x.q0);
    for (const o of x.own || []) { x.scene.remove(o); o.material.dispose(); if (o.isPoints) o.geometry.dispose(); }
    x.own = []; x.shells = [];
}
const ease = (k) => 1 - (1 - k) ** 3;
const at = (k, a, b) => Math.max(0, Math.min(1, (k - a) / (b - a)));
const rotY = (o, a, out) => { const c = Math.cos(a), s = Math.sin(a); return out.set(o.x * c + o.z * s, o.y, -o.x * s + o.z * c); };
const toBall = (x, m) => { const p = x.geo.attributes.position, w = x.w; for (let i = 0; i < p.count; i++) { const o = x.w0[i]; w.copy(o).multiplyScalar(1 + m * (x.R / o.length() - 1)); put(x, i, w); } done(x); };

// the die is twisted round the vertical axis tighter and tighter (top one way, bottom the other) until it snaps into two counter-spinning halves
const nat1 = {
    key: 'a18-wrung', name: 'Wrung Out', blurb: 'The die is twisted tighter and tighter around its middle until it snaps in two and the halves spin away.',
    dur: 2.1, impact: 1.0,
    start(x) {
        x.own = []; own(x, 3);
        // each triangle belongs to the top or bottom half by its centre, so after the snap the halves tear apart cleanly
        x.half = new Int8Array(x.w0.length);
        for (let i = 0; i < x.w0.length; i += 3) { const s = (x.w0[i].y + x.w0[i + 1].y + x.w0[i + 2].y) / 3 > x.lo + x.tall / 2 ? 1 : -1; x.half[i] = x.half[i + 1] = x.half[i + 2] = s; }
        x.flash = sprite(x, 0xff5a10); x.flash.scale.setScalar(0.1); x.flash.material.opacity = 0;
        x.sparks = burst(x, 26, 0xffa040, 6, 6); x.sparks.material.opacity = 0;
    },
    tick(k, x) {
        const tw = ease(at(k, 0, 0.48)) * 5.5, snap = at(k, 0.48, 1), mid = x.lo + x.tall / 2, w = x.w, p = x.geo.attributes.position;
        const spread = ease(snap) * 3.5;
        for (let i = 0; i < p.count; i++) {
            const o = x.w0[i], h = (o.y - mid) / (x.tall / 2);
            if (k < 0.48) {
                // wringing: the further from the middle, the more it is turned, and the waist pinches in
                rotY(o, tw * h, w); const pinch = 1 - 0.3 * (tw / 5.5) * (1 - Math.abs(h)); w.x *= pinch; w.z *= pinch;
            } else {
                // two halves: the twist carried on as a free spin, one each way, drifting apart
                const s = x.half[i]; rotY(o, s * (tw + snap * 7), w); w.x += s * spread; w.z -= s * spread * 0.4; w.y += s * snap * 0.1;
            }
            put(x, i, w);
        }
        done(x);
        x.mesh.scale.setScalar(Math.max(0.001, 1 - at(k, 0.85, 1)));
        x.flash.scale.setScalar(1 + snap * 9); x.flash.material.opacity = k < 0.48 ? 0 : 0.9 * (1 - snap) ** 1.5;
        x.sparks.move(snap * 1.6); x.sparks.material.opacity = k < 0.48 ? 0 : 1 - snap;
        x.mesh.position.set(x.p0.x + (k < 0.48 ? Math.sin(k * 90) * 0.05 * k : 0), x.p0.y, x.p0.z);
    },
    end(x) { cleanup(x); },
};

// every sharp edge rounds off into a perfect polished gold sphere, which pops bigger with a flash and ring and shines
const nat20 = {
    key: 'a18-gold', name: 'Golden Sphere', blurb: 'The edges smooth and round off until the die is a polished gold ball that pops and shines.',
    dur: 2.2, impact: 1.45,
    start(x) {
        const T = x.THREE; x.own = []; own(x, 3);
        x.gold = shell(x, new T.MeshPhongMaterial({ color: 0xffc233, specular: 0xffffff, shininess: 120, emissive: 0x4a2a00, transparent: true, opacity: 0 }));
        x.glow = sprite(x, 0xffc040); x.glow.material.opacity = 0;
        x.rg = ring(x, 0xffe090); x.rg.material.opacity = 0;
        x.star = sprite(x, 0xfff2c0); x.star.material.opacity = 0;
        x.sparks = burst(x, 30, 0xffe080, 6, 7); x.sparks.material.opacity = 0;
        x.ay = new T.Vector3(0, 1, 0); x.qt = new T.Quaternion();
    },
    tick(k, x) {
        const m = ease(at(k, 0, 0.62)), pop = at(k, 0.66, 1), out = 1 - at(k, 0.9, 1);
        toBall(x, m);
        // slow turn while it rounds, then the pop: a quick overshoot that settles into a shine, and out
        const bump = k < 0.66 ? 1 : 1 + 0.45 * Math.sin(Math.PI * Math.min(1, pop * 2.2)) * (1 - pop);
        x.mesh.scale.setScalar(Math.max(0.001, bump * out));
        x.mesh.quaternion.copy(x.q0).premultiply(x.qt.setFromAxisAngle(x.ay, m * 3));
        follow(x); x.gold.material.opacity = Math.min(1, m * 1.3);
        x.glow.scale.setScalar(2 + m * 3 + pop * 4); x.glow.material.opacity = 0.35 * m * out;
        x.rg.scale.setScalar(1 + pop * 14); x.rg.material.opacity = k < 0.66 ? 0 : 0.8 * (1 - pop);
        x.star.scale.setScalar(k < 0.66 ? 0.1 : 3 + 6 * Math.sin(Math.PI * pop)); x.star.material.opacity = k < 0.66 ? 0 : Math.sin(Math.PI * pop);
        x.sparks.move(pop * 1.8); x.sparks.material.opacity = k < 0.66 ? 0 : 1 - pop;
    },
    end(x) { cleanup(x); },
};

// it rounds into a glowing ball, shrinks to a bright ember and drifts sideways away
const mid = {
    key: 'a18-float', name: 'Ember Float', blurb: 'The die rounds into a glowing ball, shrinks to a bright ember and drifts away.',
    dur: 1.3,
    start(x) {
        const T = x.THREE; x.own = []; own(x, 2);
        x.hot = shell(x, new T.MeshBasicMaterial({ color: 0xff7a18, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false }));
        x.glow = sprite(x, 0xff8a28); x.glow.material.opacity = 0;
        const a = Math.random() * 6.283; x.dir = new T.Vector3(Math.cos(a), 0, Math.sin(a)); x.wob = new T.Vector3();
        x.trail = burst(x, 12, 0xff9a40, 4, 0.5); x.trail.material.opacity = 0;
    },
    tick(k, x) {
        const m = ease(at(k, 0, 0.35)), sh = ease(at(k, 0.25, 0.65)), dr = at(k, 0.5, 1);
        toBall(x, m);
        x.mesh.scale.setScalar(Math.max(0.001, (1 - sh * 0.85) * (1 - at(k, 0.85, 1))));
        x.wob.set(Math.sin(k * 14) * 0.3, 0, Math.cos(k * 11) * 0.3);
        x.mesh.position.copy(x.p0).addScaledVector(x.dir, dr * dr * 6).addScaledVector(x.wob, dr);
        follow(x); x.hot.material.opacity = 0.85 * m;
        x.glow.position.copy(x.mesh.position); x.glow.scale.setScalar(1.5 + 2.5 * sh * (1 - dr * 0.5)); x.glow.material.opacity = 0.7 * sh * (1 - at(k, 0.8, 1));
        x.trail.position.copy(x.mesh.position).sub(x.p0); x.trail.move(dr * 0.8); x.trail.material.opacity = dr * (1 - dr);
    },
    end(x) { cleanup(x); },
};

export default { nat1, nat20, mid };
