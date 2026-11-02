// Ember Cage exit 37: nat 1 Frostbite. The fire slowly goes out, then ice takes hold at one spot and spreads over the die, crazing it with thousands
// of fine cracks. Frozen through, it simply falls apart under its own weight into about 50 pieces of the die itself, and each one melts and drains away where it lies.
let FX = null;
function fx(T) {
    if (FX) return FX;
    const mk = (f) => { const c = document.createElement('canvas'); c.width = c.height = 64; f(c.getContext('2d')); return new T.CanvasTexture(c); };
    const soft = mk((g) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); });
    return (FX = { soft, plane: new T.PlaneGeometry(1, 1) });
}
// ice on the die's own surface. It spreads from uS (a spot on the die) as uT grows, with a ragged edge; behind it the surface frosts over
// and fine cracks appear, a few at first and then more and more, at two sizes (Voronoi cell edges, so thousands of small cells).
const VERT = `uniform vec3 uC; varying vec3 vP; varying vec3 vN;
void main(){ vP = position + uC; vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`;
const FRAG = `uniform float uT, uOp, uSpan, uF; uniform vec3 uS; varying vec3 vP; varying vec3 vN;
vec3 h3(vec3 p){ p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6))); return fract(sin(p) * 43758.5453); }
// distance to the nearest cell edge, and a random number for the cell
vec2 cells(vec3 x){ vec3 p = floor(x), f = fract(x); float d1 = 9., d2 = 9., id = 0.;
    for (int k = -1; k <= 1; k++) for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) { vec3 b = vec3(i, j, k), h = h3(p + b), r = b + h - f; float d = dot(r, r);
        if (d < d1) { d2 = d1; d1 = d; id = h.x; } else if (d < d2) d2 = d; }
    return vec2(sqrt(d2) - sqrt(d1), id); }
float line(vec2 c, float on, float w){ float e = c.x / max(fwidth(c.x), 1e-4); return (1. - smoothstep(w * .5, w, e)) * step(c.y, on); }
void main(){
    float wob = sin(vP.x * 5. + sin(vP.z * 4.)) * sin(vP.y * 6. + sin(vP.x * 3.)) + .5 * sin(dot(vP, vec3(9., -7., 11.)));
    float lp = clamp((uT - length(vP - uS) / uSpan + wob * .06) * 3., 0., 1.);
    if (lp <= 0.) discard;
    vec3 n = normalize(vN); float lit = .6 + .4 * max(0., dot(n, normalize(vec3(-.3, .8, .5)))), fres = pow(1. - abs(n.z), 2.);
    float big = line(cells(vP * uF), lp * 1.05 - .1, 1.1), fine = line(cells(vP * uF * 2.4 + 7.), lp * .55 - .1, .9);
    float edge = (1. - smoothstep(0., .25, lp));
    vec3 c = mix(vec3(.55, .74, .92), vec3(.85, .94, 1.), .4 * lit + .5 * fres);
    float crack = max(big, fine * .7);
    c = mix(c, vec3(.97, .99, 1.), crack) + edge * .2;
    // clear ice over the die, milky toward the edges, with the cracks standing out white
    gl_FragColor = vec4(c, uOp * clamp(.1 + .3 * lp + .25 * fres * lp + crack * .75 + edge * .15, 0., 1.));
}`;
// a copy of the geometry with every triangle split into 4^n, so it can break into many pieces
function subdivide(geo, n) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (let l = 0; l < n; l++) {
        const out = new g.constructor();
        for (const name of Object.keys(g.attributes)) {
            const a = g.attributes[name], s = a.itemSize, src = a.array, dst = new Float32Array(src.length * 4);
            let o = 0;
            const put = (i, j) => { for (let c = 0; c < s; c++) dst[o++] = j < 0 ? src[i * s + c] : (src[i * s + c] + src[j * s + c]) / 2; };
            for (let t = 0; t < a.count; t += 3) { const A = t, B = t + 1, C = t + 2; put(A, -1); put(A, B); put(C, A); put(A, B); put(B, -1); put(B, C); put(C, A); put(B, C); put(C, -1); put(A, B); put(B, C); put(C, A); }
            out.setAttribute(name, new a.constructor(dst, s));
        }
        for (const gr of g.groups) out.addGroup(gr.start * 4, gr.count * 4, gr.materialIndex);
        if (g !== geo) g.dispose(); g = out;
    }
    return g;
}
// cut the geometry into n pieces: spread-out seed triangles, every triangle joins its nearest seed; each piece is centred on its own middle
function shatter(T, geo, n) {
    const P = geo.attributes.position, N = P.count / 3, cen = new Float32Array(N * 3), mat = new Int32Array(N);
    for (let t = 0; t < N; t++) for (let c = 0; c < 3; c++) cen[t * 3 + c] = (P.array[t * 9 + c] + P.array[t * 9 + 3 + c] + P.array[t * 9 + 6 + c]) / 3;
    for (const gr of geo.groups) for (let t = gr.start / 3; t < (gr.start + gr.count) / 3; t++) mat[t] = gr.materialIndex;
    const d2 = (t, s) => (cen[t * 3] - s[0]) ** 2 + (cen[t * 3 + 1] - s[1]) ** 2 + (cen[t * 3 + 2] - s[2]) ** 2;
    const seeds = [], best = new Float32Array(N).fill(Infinity), own = new Int32Array(N);
    let next = Math.random() * N | 0;
    for (let i = 0; i < n; i++) {
        const s = [cen[next * 3], cen[next * 3 + 1], cen[next * 3 + 2]]; seeds.push(s);
        let far = 0, fd = -1;
        for (let t = 0; t < N; t++) { const d = d2(t, s); if (d < best[t]) { best[t] = d; own[t] = i; } if (best[t] * (0.6 + Math.random() * 0.8) > fd) { fd = best[t] * (0.6 + Math.random() * 0.8); far = t; } }
        next = far;
    }
    return seeds.map((_, i) => {
        const tris = []; for (let t = 0; t < N; t++) if (own[t] === i) tris.push(t);
        if (!tris.length) return null;
        const g = new T.BufferGeometry(), c = new T.Vector3();
        for (const t of tris) c.x += cen[t * 3] / tris.length, c.y += cen[t * 3 + 1] / tris.length, c.z += cen[t * 3 + 2] / tris.length;
        for (const name of Object.keys(geo.attributes)) {
            const a = geo.attributes[name], s = a.itemSize, dst = new Float32Array(tris.length * 3 * s);
            tris.forEach((t, j) => dst.set(a.array.subarray(t * 3 * s, (t + 1) * 3 * s), j * 3 * s));
            if (name === 'position') for (let v = 0; v < dst.length; v += 3) { dst[v] -= c.x; dst[v + 1] -= c.y; dst[v + 2] -= c.z; }
            g.setAttribute(name, new T.BufferAttribute(dst, s));
        }
        let r = 0; for (let v = 0; v < g.attributes.position.array.length; v += 3) r = Math.max(r, Math.hypot(...g.attributes.position.array.subarray(v, v + 3)));
        if (geo.groups.length) for (let j = 0, s = 0; j <= tris.length; j++) if (j === tris.length || mat[tris[j]] !== mat[tris[s]]) { g.addGroup(s * 3, (j - s) * 3, mat[tris[s]]); s = j; }
        return { g, c, r };
    }).filter(Boolean);
}
const ease = (k) => 1 - (1 - k) ** 3;
const at = (k, a, b) => Math.max(0, Math.min(1, (k - a) / (b - a)));
const rnd = (a, b) => a + Math.random() * (b - a);
const add = (x, o) => (x.scene.add(o), x.own.push(o), o);
const NP = 50, BREAK = 0.62;

const nat1 = {
    key: 'a37-frostbite', name: 'Frostbite', dur: 5.4,
    blurb: 'The fire slowly dies, ice spreads over the die and crazes it with thousands of fine cracks, then it falls apart into pieces that melt and drain away where they lie.',
    start(x) {
        const T = x.THREE, F = fx(T), m = x.mesh;
        x.own = []; x.p0 = m.position.clone(); x.q0 = m.quaternion.clone(); x.vis0 = m.visible; x.cast0 = m.castShadow; x.kb = -1;
        // our own copies of the die's materials and its churn and spark overlays, so the shared ones are never touched
        x.mat0 = m.material; x.mats = [].concat(m.material).map((a) => { const c = a.clone(); c.side = T.DoubleSide; return c; });
        m.material = Array.isArray(m.material) ? x.mats : x.mats[0];
        x.c0 = x.mats.map((a) => a.color.clone()); x.e0 = x.mats.map((a) => a.emissive?.clone()); x.ei0 = x.mats.map((a) => a.emissiveIntensity);
        x.kids = m.children.map((c) => { const cm = c.material.clone(); cm.transparent = true; cm.op0 = cm.opacity; const k = { c, m0: c.material, cm }; c.material = cm; return k; });
        // how far the die reaches, and where the ice takes hold: a corner on the upper side, so it is seen spreading from the start
        const P = m.geometry.attributes.position, nt = (m.geometry.index ? m.geometry.index.count : P.count) / 3, v = new T.Vector3();
        let R = 0, S = null, sy = -Infinity;
        for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i); R = Math.max(R, v.length()); const y = v.clone().applyQuaternion(x.q0).y + Math.random() * R * 0.8; if (y > sy) { sy = y; S = v.clone(); } }
        x.R = R;
        const ice = (c) => new T.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, side: T.DoubleSide,
            polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
            uniforms: { uT: { value: 0 }, uOp: { value: 1 }, uSpan: { value: 2 * R }, uF: { value: 4 / R }, uS: { value: S }, uC: { value: c } } });
        x.frost = new T.Mesh(m.geometry, ice(new T.Vector3())); x.frost.renderOrder = 1; m.add(x.frost);
        // the pieces, cut now from a fine copy of the die, each with its own frost; they wait hidden until the break
        let L = 0; while (nt * 4 ** L < NP * 14 && L < 4) L++;
        x.fine = subdivide(m.geometry, L);
        x.bits = shatter(T, x.fine, NP).map(({ g, c, r }) => {
            const p = add(x, new T.Mesh(g, m.material)), f = new T.Mesh(g, ice(c)); f.renderOrder = 1; f.material.uniforms.uT.value = 2; p.add(f); p.visible = false; p.castShadow = true;
            const w = c.clone().applyQuaternion(x.q0), out = new T.Vector3(w.x, 0, w.z); if (out.lengthSq() < 1e-4) out.set(rnd(-1, 1), 0, rnd(-1, 1)); out.normalize();
            const up = (w.y + R) / (2 * R); // 0 at the bottom of the die, 1 at the top
            // nothing throws them: each just tips a little outward as the piece below gives way, and falls
            return { p, f, g, w, r, ell: rnd(0.75, 1), rot: rnd(0, 3.14), v: out.multiplyScalar(rnd(0.15, 0.6) * up), ax: new T.Vector3(-out.z, 0, out.x).add(new T.Vector3(rnd(-.3, .3), rnd(-.3, .3), rnd(-.3, .3))).normalize(),
                spin: rnd(1, 3.5) * up, go: BREAK + (1 - up) * 0.03 + rnd(0, 0.015), lag: rnd(0, 0.06) };
        });
        // the water: every melting piece's pool is painted into one canvas, so the pools run together into one puddle with one wet edge
        const cv = document.createElement('canvas'); cv.width = cv.height = 256; x.pg = cv.getContext('2d'); x.pt = new T.CanvasTexture(cv); x.pw = 9 * R;
        x.puddle = add(x, new T.Mesh(F.plane, new T.MeshBasicMaterial({ map: x.pt, transparent: true, opacity: 0.4, depthWrite: false })));
        x.puddle.rotation.x = -Math.PI / 2; x.puddle.position.set(x.p0.x, 0.03, x.p0.z); x.puddle.scale.setScalar(x.pw); x.puddle.visible = false;
        x.dq = new T.Quaternion();
    },
    tick(k, x) {
        const m = x.mesh, T = x.THREE, dt = Math.max(0, k - Math.max(0, x.kb)) * nat1.dur; x.kb = k;
        // the fire slowly goes out: the glow and churn fade and the iron turns cold blue-grey
        const cool = at(k, 0, 0.3), cold = new T.Color(0x4f6a8a);
        x.mats.forEach((a, i) => { a.color.copy(x.c0[i]).lerp(cold, cool * 0.6); if (a.emissive) a.emissiveIntensity = x.ei0[i] * (1 - cool); });
        for (const kd of x.kids) kd.cm.opacity = kd.cm.op0 * (1 - at(k, 0, 0.22));
        // the ice takes hold at one spot and spreads over the die, cracking as it goes
        x.frost.material.uniforms.uT.value = 1.4 * at(k, 0.12, 0.6);
        m.position.copy(x.p0); m.quaternion.copy(x.q0);
        const broke = k >= BREAK; m.visible = !broke; m.castShadow = !broke && x.cast0;
        if (!broke) return;
        const melt = (b) => at(k, 0.72 + b.lag, 0.86 + b.lag), drain = (b) => at(k, 0.84 + b.lag * 0.5, 0.97);
        for (const b of x.bits) {
            // every piece is where it was in the die until its hold gives way
            if (!b.started) { b.started = true; b.p.visible = true; b.p.position.copy(x.p0).add(b.w); b.p.quaternion.copy(x.q0); }
            if (k < b.go) continue;
            // then gravity: it falls, lands with a little bounce and comes to rest
            const mt = melt(b), floor = b.r * 0.3 * (1 - mt);
            b.v.y -= 22 * dt; b.p.position.addScaledVector(b.v, dt);
            if (b.p.position.y < floor) { b.p.position.y = floor; if (b.v.y < 0) { b.v.y *= -0.2; b.v.x *= 0.5; b.v.z *= 0.5; b.spin *= 0.4; } }
            if (b.p.position.y <= floor + 0.01) { const fr = Math.max(0, 1 - 6 * dt); b.v.x *= fr; b.v.z *= fr; b.spin *= fr; }
            b.p.quaternion.premultiply(x.dq.setFromAxisAngle(b.ax, b.spin * dt));
            // it melts where it lies: the ice shrinks as its water spreads out under it
            b.p.scale.setScalar(Math.max(0.001, 1 - ease(mt))); b.p.visible = mt < 1; b.f.material.uniforms.uOp.value = 1 - 0.5 * mt;
            if (mt > 0 && b.px == null) { b.px = b.p.position.x; b.pz = b.p.position.z; }
        }
        // paint the puddle: wet edges first, then the water over them, so only the outside edge of the joined pools shows
        const g = x.pg, sc = 256 / x.pw, wet = x.bits.filter((b) => b.px != null);
        x.puddle.visible = wet.length > 0; if (!wet.length) return;
        g.clearRect(0, 0, 256, 256);
        for (const [pad, col] of [[2, '#eaf6ff'], [0, '#3f73a8']]) {
            g.fillStyle = col; g.beginPath();
            for (const b of wet) { const r = b.r * 1.6 * Math.sqrt(melt(b)) * (1 - 0.85 * ease(drain(b))) * sc; if (r < 0.5) continue;
                const cx = 128 + (b.px - x.p0.x) * sc, cy = 128 + (b.pz - x.p0.z) * sc; g.moveTo(cx + (r + pad) * Math.cos(b.rot), cy + (r + pad) * Math.sin(b.rot)); g.ellipse(cx, cy, r + pad, r * b.ell + pad, b.rot, 0, 6.283); }
            g.fill();
        }
        // a few glints of light on the water
        g.fillStyle = 'rgba(255,255,255,.9)';
        for (const b of wet.slice(0, 8)) { const r = b.r * 0.5 * Math.sqrt(melt(b)) * (1 - ease(drain(b))) * sc; if (r > 1) { g.beginPath(); g.ellipse(128 + (b.px - x.p0.x) * sc - r, 128 + (b.pz - x.p0.z) * sc - r * 0.6, r, r * 0.3, -0.5, 0, 6.283); g.fill(); } }
        x.pt.needsUpdate = true; x.puddle.material.opacity = 0.4 * (1 - at(k, 0.93, 0.98));
    },
    end(x) {
        const m = x.mesh;
        m.remove(x.frost); x.frost.material.dispose();
        m.material = x.mat0; m.visible = x.vis0; m.castShadow = true; m.position.copy(x.p0); m.quaternion.copy(x.q0);
        for (const kd of x.kids) { kd.c.material = kd.m0; kd.cm.dispose(); }
        for (const b of x.bits) { b.g.dispose(); b.f.material.dispose(); }
        x.mats.forEach((a) => a.dispose()); x.fine.dispose();
        for (const o of x.own) { x.scene.remove(o); if (o.material !== m.material && !Array.isArray(o.material)) o.material?.dispose(); } // the pieces share x.mats, already gone
        x.pt?.dispose(); x.own = [];
    },
};

export default { nat1 };
