// Ember Cage exits 14: nat1 Panic Hop, nat20 Exploded View, mid Iris Shrink. All move the die's own model.
let FX = null;
function fx(T) {
    if (FX) return FX;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return (FX = { soft: new T.CanvasTexture(c) });
}
const add = (x, o) => { x.scene.add(o); x.own.push(o); return o; };
const sprite = (x, color) => { const s = new x.THREE.Sprite(new x.THREE.SpriteMaterial({ map: fx(x.THREE).soft, color, transparent: true, depthWrite: false, blending: x.THREE.AdditiveBlending })); s.position.copy(x.mesh.position); return add(x, s); };
// n soft points drifting off the die; move(t) with t seconds since they started
function rise(x, n, color, size, spread = 1) {
    const T = x.THREE, pos = new Float32Array(n * 3), vel = [], o = x.mesh.position.clone();
    for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, s = (0.3 + Math.random() * 0.5) * spread; vel.push([Math.cos(a) * s, 1 + Math.random() * 1.5, Math.sin(a) * s]); }
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    const p = new T.Points(geo, new T.PointsMaterial({ map: fx(T).soft, color, size, sizeAttenuation: false, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
    p.frustumCulled = false; add(x, p);
    p.move = (t, ox = 0, oz = 0) => { for (let i = 0; i < n; i++) { pos[i * 3] = o.x + ox + vel[i][0] * t; pos[i * 3 + 1] = o.y + vel[i][1] * t; pos[i * 3 + 2] = o.z + oz + vel[i][2] * t; } geo.attributes.position.needsUpdate = true; };
    p.move(0); return p;
}
const clean = (x) => { for (const o of x.own || []) { x.scene.remove(o); if (o.material) o.material.dispose(); if (o.geometry) o.geometry.dispose(); } x.own = []; };
const ease = (k) => 1 - (1 - k) ** 3, io = (k) => k * k * (3 - 2 * k);
const at = (k, a, b) => Math.max(0, Math.min(1, (k - a) / (b - a)));
const radius = (x) => { const g = x.mesh.geometry; if (!g.boundingSphere) g.computeBoundingSphere(); return g.boundingSphere.radius * x.mesh.scale.x; };

// nat1: jitters, hops three times in random directions, stumbles and flops over with a wisp of smoke
const nat1 = {
    key: 'a14-panic-hop', name: 'Panic Hop', blurb: 'The die jitters, hops frantically three times in random directions, stumbles and flops flat with a wisp of smoke.',
    dur: 2.2, impact: 1.4,
    start(x) {
        x.own = []; x.R = radius(x); x.p0 = x.mesh.position.clone(); x.q0 = x.mesh.quaternion.clone();
        x.P = [x.p0.clone()]; let a = Math.random() * 6.283;
        for (let i = 0; i < 4; i++) { a += 1.5 + Math.random() * 2.2; const d = (i < 3 ? 1.3 : 0.6) * x.R, q = x.P[i]; x.P.push(new x.THREE.Vector3(q.x + Math.cos(a) * d, q.y, q.z + Math.sin(a) * d)); }
        x.tipAxis = new x.THREE.Vector3(-(x.P[4].z - x.P[3].z), 0, x.P[4].x - x.P[3].x).normalize();
        x.heat = sprite(x, 0xff3010); x.heat.scale.setScalar(0.1); x.smoke = rise(x, 12, 0x887766, 7, 0.5);
    },
    tick(k, x) {
        const T = x.THREE, m = x.mesh, R = x.R, tt = k * nat1.dur;
        const jit = 1 - at(k, 0.12, 0.2), hk = at(k, 0.15, 0.6) * 3, hi = Math.min(2, Math.floor(hk)), u = hk - hi;
        const st = at(k, 0.6, 0.78), pos = new T.Vector3();
        // jitter first, then hops from point to point, then a short stumble sliding on to the last point
        if (k < 0.15) pos.copy(x.P[0]).add(new T.Vector3(Math.sin(tt * 90) * 0.08 * R * jit, 0, Math.cos(tt * 77) * 0.08 * R * jit));
        else if (k < 0.6) pos.lerpVectors(x.P[hi], x.P[hi + 1], io(u));
        else pos.lerpVectors(x.P[3], x.P[4], ease(st));
        m.position.copy(pos);
        // each hop swells (stands in for height as seen from above) and spins a little about the vertical
        const air = k >= 0.15 && k < 0.6 ? Math.sin(Math.PI * u) : 0;
        m.scale.setScalar(1 + 0.3 * air);
        const spin = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), Math.sin(tt * 90) * 0.15 * jit + (k >= 0.15 ? hk * 0.9 : 0));
        // flop: tips over about a horizontal axis with a small bounce back
        const ang = 1.25 * ease(st) - 0.18 * Math.sin(Math.PI * at(k, 0.72, 0.9));
        m.quaternion.copy(new T.Quaternion().setFromAxisAngle(x.tipAxis, ang)).multiply(spin).multiply(x.q0);
        x.heat.position.copy(pos); x.heat.scale.setScalar(R * (1.5 + 2 * air)); x.heat.material.opacity = 0.35 * (1 - at(k, 0.8, 1)) * (0.7 + 0.3 * Math.sin(tt * 40));
        x.smoke.move(Math.max(0, k - 0.6) * nat1.dur * 1.3, x.P[4].x - x.P[0].x, x.P[4].z - x.P[0].z);
        x.smoke.material.opacity = k < 0.6 ? 0 : 0.8 * (1 - at(k, 0.65, 1));
    },
    end(x) { x.mesh.position.copy(x.p0); x.mesh.quaternion.copy(x.q0); x.mesh.scale.setScalar(1); clean(x); },
};

// the dissolve at the end, like D&D Beyond's dice: blobby holes open in the surface (3D noise in table space) and grow until nothing is left
const DISSOLVE = `float h1(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float vn(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
    return mix(mix(mix(h1(i), h1(i + vec3(1, 0, 0)), f.x), mix(h1(i + vec3(0, 1, 0)), h1(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(h1(i + vec3(0, 0, 1)), h1(i + vec3(1, 0, 1)), f.x), mix(h1(i + vec3(0, 1, 1)), h1(i + vec3(1, 1, 1)), f.x), f.y), f.z); }
float fbm(vec3 p){ return .6 * vn(p) + .3 * vn(p * 2.1 + 5.) + .1 * vn(p * 4.3 + 9.); }`;
// m: a material to dissolve; u: { dis, f } uniforms, dis from about 0.15 (whole) to 0.9 (gone), f the noise scale. Shatter (21.js) uses it too.
export function dissolving(m, u) {
    m.onBeforeCompile = (sh) => {
        sh.uniforms.uDis = u.dis; sh.uniforms.uF = u.f;
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;').replace('#include <project_vertex>', '#include <project_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.)).xyz;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp; uniform float uDis, uF;\n' + DISSOLVE)
            .replace('void main() {', 'void main() {\n    if (fbm(vWp * uF) < uDis) discard;');
    };
    m.customProgramCacheKey = () => 'a14-dissolve';
    return m;
}

// nat20: every face slides out along its own normal and turns, edges glowing, then snaps back together in a gold burst
const nat20 = {
    key: 'a14-exploded-view', name: 'Exploded View', blurb: 'Every face slides out along its own normal and slowly turns like a diagram, glowing at the seams, then snaps back together and bursts into gold.',
    dur: 4.0, impact: 1.45,
    start(x) {
        const T = x.THREE; x.own = []; x.R = radius(x);
        const g = x.mesh.geometry.index ? x.mesh.geometry.toNonIndexed() : x.mesh.geometry, P = g.attributes.position, U = g.attributes.uv, mat = x.mesh.material;
        const mi = (t) => { for (const gr of g.groups) if (t * 3 >= gr.start && t * 3 < gr.start + gr.count) return gr.materialIndex; return 0; };
        // bucket the triangles by face (same facing, same material)
        const buckets = new Map(), v = new T.Vector3(), a = new T.Vector3(), b = new T.Vector3();
        for (let t = 0; t < P.count / 3; t++) {
            a.fromBufferAttribute(P, t * 3 + 1).sub(v.fromBufferAttribute(P, t * 3)); b.fromBufferAttribute(P, t * 3 + 2).sub(v);
            const n = a.cross(b).normalize(), key = [n.x, n.y, n.z].map((c) => Math.round(c * 20)).join(',') + '|' + mi(t);
            if (!buckets.has(key)) buckets.set(key, { n: n.clone(), tris: [], mi: mi(t) });
            buckets.get(key).tris.push(t);
        }
        x.grp = new T.Group(); x.grp.position.copy(x.mesh.position); x.grp.quaternion.copy(x.mesh.quaternion); x.grp.scale.copy(x.mesh.scale); add(x, x.grp);
        // our own copies of the die's materials, so they can dissolve at the end
        x.u = { dis: { value: -0.1 }, f: { value: 1.8 / x.R } }; x.dm = [].concat(mat).map((m) => dissolving(m.clone(), x.u));
        x.edgeMat = dissolving(new T.LineBasicMaterial({ color: 0xff8a20, transparent: true, depthWrite: false, blending: T.AdditiveBlending }), x.u); x.pieces = []; x.geos = [];
        // the die's churning molten overlay goes with every face (our own copy, same live texture), and fades away while they turn
        const ov = x.mesh.children.find((c) => c.isMesh)?.material;
        if (ov) { x.churn = ov.clone(); x.churn.op0 = ov.opacity; Object.assign(x.churn, { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }); }
        for (const f of buckets.values()) {
            const pos = [], uv = [], nor = [], c = new T.Vector3();
            for (const t of f.tris) for (let i = 0; i < 3; i++) { c.fromBufferAttribute(P, t * 3 + i); pos.push(c.x, c.y, c.z); if (U) uv.push(U.getX(t * 3 + i), U.getY(t * 3 + i)); nor.push(f.n.x, f.n.y, f.n.z); }
            const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); if (U) geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
            geo.computeBoundingBox(); const cen = geo.boundingBox.getCenter(new T.Vector3()); geo.translate(-cen.x, -cen.y, -cen.z);
            const piece = new T.Mesh(geo, x.dm[Array.isArray(mat) ? f.mi : 0]), eg = new T.EdgesGeometry(geo, 5);
            piece.add(new T.LineSegments(eg, x.edgeMat)); if (x.churn) piece.add(new T.Mesh(geo, x.churn)); piece.userData = { cen, n: f.n, dir: Math.random() < 0.5 ? 1 : -1 }; x.grp.add(piece); x.pieces.push(piece); x.geos.push(geo, eg);
        }
        if (g !== x.mesh.geometry) x.geos.push(g);
        x.mesh.visible = false;
        x.core = sprite(x, 0xff7a18); x.core.scale.setScalar(0.1); x.gold = sprite(x, 0xffd24a); x.gold.scale.setScalar(0.1);
        x.ring = add(x, new T.Mesh(new T.RingGeometry(0.8, 1, 48), new T.MeshBasicMaterial({ color: 0xffd24a, transparent: true, side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending })));
        x.ring.rotation.x = -Math.PI / 2; x.ring.position.set(x.mesh.position.x, 0.06, x.mesh.position.z); x.ring.scale.setScalar(0.01);
        x.sparks = rise(x, 40, 0xffd24a, 6, 4);
    },
    tick(K, x) {
        // the burst runs on its own 2.9 s clock; the die then holds a moment before it dissolves
        const sec = K * nat20.dur, k = Math.min(1, sec / 2.9);
        const R = x.R, out = ease(at(k, 0.05, 0.4)) * (1 - ease(at(k, 0.6, 0.66))), turn = io(at(k, 0.1, 0.6)), bang = at(k, 0.6, 1);
        for (const p of x.pieces) {
            const d = p.userData; p.position.copy(d.cen).addScaledVector(d.n, out * R * 0.9);
            p.quaternion.setFromAxisAngle(d.n, d.dir * turn * 1.2 * (1 - at(k, 0.58, 0.66)));
        }
        // the change to the finished look is gradual: the churn fades out and the gold seams fade in as the faces move apart and turn
        const look = io(at(k, 0.05, 0.55));
        if (x.churn) x.churn.opacity = x.churn.op0 * (1 - look);
        x.edgeMat.opacity = look * (0.35 + 0.65 * out) + 0.5 * Math.sin(Math.PI * bang);
        x.edgeMat.color.setRGB(1, 0.5 + 0.4 * bang, 0.1 + 0.3 * bang);
        x.core.scale.setScalar(R * (0.5 + 2 * out)); x.core.material.opacity = 0.7 * out * (1 - bang);
        // the snap: a gold flash, an expanding ring and sparks
        x.gold.scale.setScalar(R * (1 + 4 * ease(bang))); x.gold.material.opacity = k > 0.6 ? 0.9 * Math.sin(Math.PI * Math.min(1, bang * 1.3)) : 0;
        x.ring.scale.setScalar(Math.max(0.01, R * (0.8 + 4.5 * ease(bang)))); x.ring.material.opacity = k > 0.6 ? 1 - bang : 0;
        const dis = at(sec, 3.2, 3.9); x.u.dis.value = 0.15 + 0.75 * dis; // the noise sits mostly between 0.15 and 0.9, so this spreads the holes over the whole fade
        x.sparks.move(bang * 2.9 * 0.4); x.sparks.material.opacity = k > 0.6 ? 1 - bang : 0;
    },
    end(x) { x.mesh.visible = true; for (const g of x.geos || []) g.dispose(); x.edgeMat.dispose(); x.dm?.forEach((m) => m.dispose()); x.churn?.dispose(); x.grp.clear(); clean(x); },
};

// mid: shrinks inside a narrowing ring of fire on the table that closes over it
const mid = {
    key: 'a14-iris-shrink', name: 'Iris Shrink', blurb: 'The die shrinks into a narrowing ring of fire on the table that closes over it.',
    dur: 1.2,
    start(x) {
        const T = x.THREE; x.own = []; x.R = radius(x); x.q0 = x.mesh.quaternion.clone();
        const flat = (geo, c, o) => { const m = add(x, new T.Mesh(geo, new T.MeshBasicMaterial({ color: c, transparent: true, opacity: o, side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending }))); m.rotation.x = -Math.PI / 2; m.position.set(x.mesh.position.x, 0.06, x.mesh.position.z); return m; };
        x.ring = flat(new T.RingGeometry(0.82, 1, 56), 0xff7a18, 1); x.glow = flat(new T.CircleGeometry(1, 40), 0xff4a08, 0.25); x.spark = sprite(x, 0xffc060); x.spark.scale.setScalar(0.1);
    },
    tick(k, x) {
        const R = x.R, c = io(at(k, 0.1, 1)), r = Math.max(0.001, R * (1.7 - 1.7 * c)), s = Math.max(0.001, 1 - io(at(k, 0.1, 0.95)));
        x.ring.scale.setScalar(r); x.glow.scale.setScalar(r * 0.9);
        x.ring.material.color.setRGB(1, 0.5 + 0.4 * c, 0.1 + 0.3 * c); x.ring.material.opacity = Math.min(1, k * 8); x.glow.material.opacity = 0.3 * (1 - c * 0.5);
        x.mesh.scale.setScalar(s);
        x.mesh.quaternion.copy(new x.THREE.Quaternion().setFromAxisAngle(new x.THREE.Vector3(0, 1, 0), c * 3)).multiply(x.q0);
        // a bright pinprick as the iris closes
        x.spark.scale.setScalar(R * 1.4 * Math.sin(Math.PI * at(k, 0.75, 1)));
    },
    end(x) { x.mesh.scale.setScalar(1); x.mesh.quaternion.copy(x.q0); clean(x); },
};

export default { nat1, nat20, mid };
