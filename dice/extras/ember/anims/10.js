// Ember Cage, Elegant Embers: nat 1 gutters like a candle and crumbles top-down to grey ash and a curl of smoke; nat 20 is crowned in flame, levitates, flares, then rises as gold embers.
let TX = null;
function tx(THREE) {
    if (TX) return TX;
    const mk = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')); return new THREE.CanvasTexture(c); };
    const soft = mk(64, 64, (g) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,.55)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); });
    // a teardrop flame, base at the bottom, tip at the top
    const flame = mk(64, 128, (g) => {
        g.filter = 'blur(2px)';
        const l = g.createLinearGradient(0, 124, 0, 4); l.addColorStop(0, 'rgba(255,255,255,1)'); l.addColorStop(0.5, 'rgba(255,255,255,.8)'); l.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = l; g.beginPath(); g.moveTo(32, 122); g.bezierCurveTo(5, 104, 9, 56, 34, 6); g.bezierCurveTo(54, 50, 59, 104, 32, 122); g.fill();
    });
    const ring = mk(128, 128, (g) => { const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(0.82, 'rgba(255,255,255,0)'); r.addColorStop(0.9, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128); });
    return (TX = { soft, flame, ring, plane: new THREE.PlaneGeometry(1, 1), fplane: new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0) });
}
const cl = (k) => Math.max(0, Math.min(1, k));
const at = (k, a, b) => cl((k - a) / (b - a));
const sm = (k) => k * k * (3 - 2 * k);
const ease = (k) => 1 - (1 - k) ** 3;
const fl = (t, p = 0) => 0.62 + 0.2 * Math.sin(t * 21 + p) + 0.12 * Math.sin(t * 37 + 1.3 + p) + 0.06 * Math.sin(t * 71 + 0.4 + p * 2);
const R = Math.random;

const cleanup = (x) => {
    for (const o of x.own || []) { o.removeFromParent(); o.material.dispose(); if (o.isPoints) o.geometry.dispose(); }
    x.own = []; if (x.s0) x.mesh.scale.setScalar(x.s0);
};
const add = (x, o) => { x.scene.add(o); x.own.push(o); return o; };
const spr = (x, color, additive, dy = 2.6) => {
    const T = x.THREE, s = new T.Sprite(new T.SpriteMaterial({ map: tx(T).soft, color, transparent: true, opacity: 0, depthWrite: false, blending: additive ? T.AdditiveBlending : T.NormalBlending }));
    s.position.copy(x.home); s.position.y += dy; return add(x, s);
};
const overlay = (x, color, additive) => {
    const T = x.THREE, m = new T.Mesh(x.mesh.geometry, new T.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, blending: additive ? T.AdditiveBlending : T.NormalBlending }));
    m.scale.setScalar(1.006); x.mesh.add(m); x.own.push(m); return m;
};
// points with per-particle alpha / size / colour; arrays are updated in place and flushed once per frame
function particles(x, n, additive) {
    const T = x.THREE, geo = new T.BufferGeometry(), a = { n, pos: new Float32Array(n * 3), al: new Float32Array(n), sz: new Float32Array(n), col: new Float32Array(n * 3) };
    geo.setAttribute('position', new T.BufferAttribute(a.pos, 3)); geo.setAttribute('aAlpha', new T.BufferAttribute(a.al, 1));
    geo.setAttribute('aSize', new T.BufferAttribute(a.sz, 1)); geo.setAttribute('aColor', new T.BufferAttribute(a.col, 3));
    const mat = new T.ShaderMaterial({
        uniforms: { map: { value: tx(T).soft } }, transparent: true, depthWrite: false, blending: additive ? T.AdditiveBlending : T.NormalBlending,
        vertexShader: 'attribute float aAlpha; attribute float aSize; attribute vec3 aColor; varying float vA; varying vec3 vC; void main(){ vA = aAlpha; vC = aColor; gl_PointSize = aSize; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
        fragmentShader: 'uniform sampler2D map; varying float vA; varying vec3 vC; void main(){ float a = vA * texture2D(map, gl_PointCoord).a; if (a < .003) discard; gl_FragColor = vec4(vC, a); }',
    });
    a.p = new T.Points(geo, mat); a.p.frustumCulled = false; add(x, a.p);
    a.flush = () => { for (const k of ['position', 'aAlpha', 'aSize', 'aColor']) geo.attributes[k].needsUpdate = true; };
    return a;
}
// the cold stone the die turns to: flat grey shading, and everything above a moving line (screen-up = -z) is gone, with a hot ember rim on that line
function ghost(x) {
    const T = x.THREE, u = { uCut: { value: -99 }, uGlow: { value: 1 } }, m = new T.MeshBasicMaterial({ color: 0x3a3b42, side: T.DoubleSide });
    m.onBeforeCompile = (s) => {
        s.uniforms.uCut = u.uCut; s.uniforms.uGlow = u.uGlow;
        s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vW;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvW = (modelMatrix * vec4(transformed, 1.)).xyz;');
        s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vW; uniform float uCut; uniform float uGlow;')
            .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (vW.z < uCut) discard;')
            .replace('#include <dithering_fragment>', `#include <dithering_fragment>
vec3 n = normalize(cross(dFdx(vW), dFdy(vW)));
float l = .45 + .55 * abs(dot(n, normalize(vec3(-.3, 1., .4))));
gl_FragColor.rgb *= gl_FrontFacing ? l : .5 * l;
float e = 1. - smoothstep(0., .22, vW.z - uCut);
gl_FragColor.rgb += vec3(1., .42, .08) * e * e * uGlow;`);
    };
    const g = new T.Mesh(x.mesh.geometry, m); g.uniforms = u; return add(x, g);
}

const D1 = 2.8, I1 = 0.8, N_ASH = 110, N_EMB = 16, N_SMK = 20, N1 = {
    key: 'n10-candle', name: 'Candle Out', blurb: 'The glow gutters like a dying candle, the die goes cold grey and crumbles top-down into drifting ash, a last few embers and a curl of smoke.',
    dur: D1, impact: I1,
    start(x) {
        const h = x.home = x.mesh.position.clone(); x.own = []; x.s0 = x.mesh.scale.x;
        x.glow = spr(x, 0xff7a18, true); x.edge = spr(x, 0xff6a10, true); x.puff = spr(x, 0x8a8a92, false);
        x.ov = overlay(x, 0x1b1c22, false);
        const A = x.ash = particles(x, N_ASH, false), E = x.emb = particles(x, N_EMB, true), S = x.smk = particles(x, N_SMK, false);
        const row = (n) => ({ sx: new Float32Array(n), sz: new Float32Array(n), vx: new Float32Array(n), vz: new Float32Array(n), ph: new Float32Array(n), tb: new Float32Array(n), life: new Float32Array(n) });
        const spawn = (P, i, c) => { // born on the crumble line at progress c
            const z = h.z - 1.4 + sm(c) * 2.8, ch = Math.sqrt(Math.max(0, 1.69 - (z - h.z) ** 2));
            P.sx[i] = h.x + (R() * 2 - 1) * ch; P.sz[i] = z; P.ph[i] = R() * 6.28; P.tb[i] = I1 + 1.1 * c;
        };
        x.A = row(N_ASH); x.E = row(N_EMB); x.S = row(N_SMK);
        for (let i = 0; i < N_ASH; i++) {
            const c = (i + R()) / N_ASH, P = x.A; spawn(P, i, c);
            P.vx[i] = 0.25 + R() * 0.45; P.vz[i] = -0.05 - R() * 0.3 + (R() - 0.5) * 0.2; P.life[i] = Math.min(1.1 + R() * 0.9, 2.78 - P.tb[i]);
            const g = 0.4 + R() * 0.22; A.col.set([g * 1.03, g, g * 0.96], i * 3); A.sz[i] = 9 + R() * 8;
        }
        for (let i = 0; i < N_EMB; i++) {
            const P = x.E, tb = 0.9 + R() * 1.0; spawn(P, i, cl((tb - I1) / 1.1)); P.tb[i] = tb;
            P.vx[i] = 0.1 + R() * 0.3; P.vz[i] = -0.2 - R() * 0.35; P.life[i] = Math.min(0.9 + R() * 0.8, 2.74 - tb); E.sz[i] = 4 + R() * 2.5;
        }
        for (let j = 0; j < N_SMK; j++) { x.S.tb[j] = 0.95 + j * 0.04; x.S.life[j] = 0.9; x.S.ph[j] = j * 0.15; }
    },
    tick(k, x) {
        const t = k * D1, h = x.home, m = x.mesh, f = fl(t), y = h.y + 3;
        if (t < I1) {
            // the flame gutters: dims, flickers, gasps back once, then goes out while the die cools to dark grey
            const u = t / I1, e = sm(u), lit = cl((1 - e) * (0.55 + 0.5 * f) + 0.4 * Math.exp(-(((u - 0.58) / 0.07) ** 2)));
            x.glow.material.opacity = lit; x.glow.scale.setScalar(1.6 + lit * 2.2);
            x.ov.material.opacity = 0.92 * (1 - lit) * cl(u * 5);
        } else if (!x.stone) {
            x.stone = ghost(x); x.ov.visible = false; x.glow.material.opacity = 0;
        }
        if (x.stone) {
            m.visible = false;
            const c = at(t, I1, 1.9), ce = sm(c), g = x.stone, cut = h.z - 1.4 + ce * 2.8;
            g.position.copy(m.position); g.quaternion.copy(m.quaternion); g.scale.setScalar(x.s0 * (1 - 0.05 * ce));
            g.uniforms.uCut.value = cut; g.uniforms.uGlow.value = 0.7 + 0.3 * f; g.visible = cut < h.z + 1.4;
            const ch = Math.sqrt(Math.max(0, 1.69 - (cut - h.z) ** 2));
            x.edge.position.set(h.x, y, cut); x.edge.scale.set(ch * 2.2 + 0.5, 0.9, 1);
            x.edge.material.opacity = c > 0 && c < 1 ? 0.5 * (0.6 + 0.4 * f) * (1 - at(c, 0.8, 1)) : 0;
            const p = at(t, I1, 1.5); x.puff.scale.setScalar(2.2 + 2.2 * ease(p)); x.puff.material.opacity = 0.28 * (1 - p);
        }
        // ash drifting off the crumble line
        const A = x.ash, P = x.A;
        for (let i = 0; i < N_ASH; i++) {
            const a = t - P.tb[i], L = P.life[i], j = i * 3;
            if (a < 0 || a > L) { A.al[i] = 0; continue; }
            A.pos[j] = P.sx[i] + P.vx[i] * a * (1 - 0.25 * a) + Math.sin(a * 3 + P.ph[i]) * 0.08; A.pos[j + 1] = y; A.pos[j + 2] = P.sz[i] + P.vz[i] * a + Math.cos(a * 2.3 + P.ph[i]) * 0.05;
            const hot = Math.max(0, 1 - a / 0.4) * 0.7, g = A.col[j + 1];
            A.al[i] = Math.min(1, a / 0.12) * (1 - a / L) ** 1.3 * 0.8;
            A.col[j] = g * 1.03 + (1 - g) * hot; A.col[j + 2] = g * 0.96 + (0.15 - g * 0.96) * hot;
        }
        // last embers that wink out
        const E = x.emb, Q = x.E;
        for (let i = 0; i < N_EMB; i++) {
            const a = t - Q.tb[i], L = Q.life[i], j = i * 3;
            if (a < 0 || a > L) { E.al[i] = 0; continue; }
            const u = a / L;
            E.pos[j] = Q.sx[i] + Q.vx[i] * a + Math.sin(a * 4 + Q.ph[i]) * 0.1; E.pos[j + 1] = y + 0.1; E.pos[j + 2] = Q.sz[i] + Q.vz[i] * a;
            const wink = u < 0.6 ? 1 : (Math.sin(a * 47 + Q.ph[i] * 5) > 0.15 ? 1 : 0);
            E.al[i] = Math.min(1, a / 0.1) * (1 - u) * (0.6 + 0.4 * Math.sin(a * 19 + Q.ph[i])) * wink;
            E.col[j] = 1; E.col[j + 1] = 0.55 * (1 - 0.6 * u); E.col[j + 2] = 0.12;
        }
        // a thin curling wisp of smoke
        const S = x.smk, W = x.S;
        for (let i = 0; i < N_SMK; i++) {
            const a = t - W.tb[i], L = W.life[i], j = i * 3;
            if (a < 0 || a > L) { S.al[i] = 0; continue; }
            S.pos[j] = h.x + 0.2 + Math.sin(a * 5.5 + W.tb[i] * 2.1) * (0.1 + 0.3 * a); S.pos[j + 1] = y - 0.1; S.pos[j + 2] = h.z - 0.3 - a * 1.0;
            S.al[i] = 0.2 * Math.sin(Math.PI * a / L) ** 1.2; S.sz[i] = 14 + a * 30; S.col[j] = 0.46; S.col[j + 1] = 0.46; S.col[j + 2] = 0.49;
        }
        A.flush(); E.flush(); S.flush();
    },
    end: cleanup,
};

const D2 = 2.8, I2 = 1.4, NT = 10, N_ORB = 26, N_DIS = 150, N2 = {
    key: 'n10-crown', name: 'Crown of Flame', blurb: 'A ring of tall flames rises into a crown while the golden die levitates inside two orbiting rings of embers, then the crown flares and everything rises as gold.',
    dur: D2, impact: I2,
    start(x) {
        const T = x.THREE, h = x.home = x.mesh.position.clone(); x.own = []; x.s0 = x.mesh.scale.x; x.ang = 0; x.UP = new T.Vector3(0, 1, 0);
        x.cA = new T.Color(0xff8a18); x.cB = new T.Color(0xffe9a0); x.cI = new T.Color(0xfff2b0);
        x.shadow = spr(x, 0x000000, false, 0.15);
        x.ringM = add(x, new T.Mesh(tx(T).plane, new T.MeshBasicMaterial({ map: tx(T).ring, color: 0xffc040, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending })));
        x.ringM.rotation.x = -Math.PI / 2; x.ringM.position.set(h.x, 0.08, h.z);
        x.halo = spr(x, 0xffc030, true); x.flash = spr(x, 0xfff0b0, true, 3);
        x.gold = overlay(x, 0xffb830, true);
        x.fl = [];
        const flame = (col) => add(x, new T.Mesh(tx(T).fplane, new T.MeshBasicMaterial({ map: tx(T).flame, color: col, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide })));
        for (let i = 0; i < NT * 2; i++) { // 10 tall flames and 10 short ones between them
            const tall = i < NT, n = i % NT;
            x.fl.push({ tall, th: (n + (tall ? 0 : 0.5)) * 6.2832 / NT, i, base: tall ? 1.55 : 1.4, L: tall ? 1.9 : 1.0, W: tall ? 0.8 : 0.55, d: 0.08 + (n / NT) * 0.45 + (tall ? 0 : 0.12), o: flame(0xff8a18), c: flame(0xfff2b0) });
        }
        const O = x.orb = particles(x, N_ORB * 2, true), D = x.dis = particles(x, N_DIS, true);
        for (let i = 0; i < N_ORB * 2; i++) { O.col.set([1, 0.72 + R() * 0.2, 0.25 + R() * 0.2], i * 3); }
        x.O = { ph: new Float32Array(N_ORB * 2).map(() => R() * 6.28) };
        const Dd = x.D = { sx: new Float32Array(N_DIS), sz: new Float32Array(N_DIS), vx: new Float32Array(N_DIS), vz: new Float32Array(N_DIS), ph: new Float32Array(N_DIS), tb: new Float32Array(N_DIS), life: new Float32Array(N_DIS) };
        for (let i = 0; i < N_DIS; i++) {
            if (R() < 0.55) { const f = x.fl[(R() * NT) | 0], th = f.th + 0.63, r = f.base + R() * f.L * 1.5; Dd.sx[i] = h.x + Math.cos(th) * r; Dd.sz[i] = h.z + Math.sin(th) * r; }
            else { const a = R() * 6.28, r = Math.sqrt(R()) * 1.3; Dd.sx[i] = h.x + Math.cos(a) * r; Dd.sz[i] = h.z + Math.sin(a) * r; }
            Dd.tb[i] = I2 + R() * 0.45; Dd.life[i] = Math.min(0.7 + R() * 0.5, 2.74 - Dd.tb[i]); Dd.ph[i] = R() * 6.28;
            Dd.vx[i] = (R() - 0.5) * 0.6; Dd.vz[i] = -(0.9 + R() * 1.6); D.sz[i] = 5 + R() * 6;
        }
    },
    tick(k, x) {
        const t = k * D2, h = x.home, m = x.mesh, f = fl(t), e = ease(at(t, 0, I2)), up = ease(at(t, I2, I2 + 0.2)), dis = at(t, 1.6, 2.1), y = h.y + 3.2;
        // the die: gold, spinning slowly, levitating and swelling; after the flare it shrinks into the embers
        x.ang += x.dt * (0.9 + 2 * up);
        m.rotateOnWorldAxis(x.UP, x.ang);
        const sc = x.s0 * (1 + 0.4 * e + 0.03 * Math.sin(t * 3)) * (t > I2 ? 1 - ease(at(t, 1.45, 1.95)) : 1);
        m.scale.setScalar(Math.max(0.001, sc)); m.position.y += 0.6 * e; if (t > 1.95) m.visible = false;
        x.gold.material.color.copy(x.cA).lerp(x.cB, up).offsetHSL(0.03, 0, 0); x.gold.material.opacity = (0.15 + 0.3 * e) * (0.8 + 0.2 * f) + 0.6 * up;
        x.halo.scale.setScalar(2.8 + 2.2 * e + 5 * ease(at(t, I2, 1.9))); x.halo.material.opacity = (0.3 + 0.35 * e * f) * (1 - at(t, 1.6, 2.2));
        const fp = cl((t - 1.32) / 0.08) * (1 - at(t, 1.4, 1.85)); x.flash.scale.setScalar(4 + 4 * ease(at(t, 1.32, 1.85))); x.flash.material.opacity = 0.9 * fp;
        x.shadow.scale.setScalar(2.8 + 1.2 * e); x.shadow.material.opacity = (0.3 - 0.15 * e) * cl(t * 4) * (1 - at(t, 1.4, 1.8));
        const rp = ease(at(t, I2, 2.1));
        x.ringM.scale.setScalar(3.3 + 10 * rp); x.ringM.material.opacity = 0.5 * cl(t * 2) * (1 - rp) * (0.8 + 0.2 * f);
        // the crown
        for (const F of x.fl) {
            const r = ease(at(t, F.d, F.d + 0.6)), fade = 1 - at(t, 1.6 + F.i % NT * 0.025, 2.1 + F.i % NT * 0.025), th = F.th + t * 0.45;
            const st = 1 + 0.8 * up + 0.6 * at(t, 1.6, 2.4), i = F.i;
            const len = F.L * r * st * (1 + 0.1 * Math.sin(t * 13 + i * 1.9) + 0.06 * Math.sin(t * 27 + i * 3.1)), wid = F.W * (0.4 + 0.6 * r) * (0.9 + 0.1 * Math.sin(t * 17 + i) + 0.2 * up);
            const rot = -th - Math.PI / 2 + 0.07 * Math.sin(t * 9 + i * 2.3), px = h.x + Math.cos(th) * F.base, pz = h.z + Math.sin(th) * F.base, op = fade * (0.8 + 0.2 * Math.sin(t * 22 + i));
            F.o.position.set(px, y, pz); F.o.rotation.set(-Math.PI / 2, 0, rot); F.o.scale.set(wid, Math.max(0.001, len), 1);
            F.o.material.opacity = op; F.o.material.color.copy(x.cA).lerp(x.cB, Math.max(up, e * 0.15));
            F.c.position.set(px, y + 0.02, pz); F.c.rotation.set(-Math.PI / 2, 0, rot); F.c.scale.set(wid * 0.4, Math.max(0.001, len * 0.55), 1);
            F.c.material.opacity = op * 0.45;
        }
        // two tilted rings of embers
        const O = x.orb, ph = x.O.ph, env = at(t, 0.35, 0.85) * (1 - at(t, 1.55, 2.05)), ex = 1 + 1.2 * ease(at(t, I2, 2.0));
        for (let i = 0; i < N_ORB * 2; i++) {
            const ring = i < N_ORB ? 0 : 1, n = i % N_ORB, rad = (ring ? 2.6 : 2.0) * ex, tilt = ring ? -0.9 : 1.05, psi = ring ? 1.3 : 0;
            const phi = n * 6.2832 / N_ORB + (ring ? -1.9 : 2.4) * (t - 0.2) * (1 + 0.3 * up), u = rad * Math.cos(phi), v = rad * Math.sin(phi);
            const zz = v * Math.cos(tilt), d = Math.sin(phi) * (tilt > 0 ? 1 : -1) * Math.sign(Math.sin(Math.abs(tilt))), j = i * 3, c = Math.cos(psi), s = Math.sin(psi), dn = 0.5 + 0.5 * d;
            O.pos[j] = h.x + u * c - zz * s; O.pos[j + 1] = y + 0.2; O.pos[j + 2] = h.z + u * s + zz * c;
            O.al[i] = env * (0.3 + 0.7 * dn) * (0.7 + 0.3 * Math.sin(t * 20 + ph[i])); O.sz[i] = 4 + 4 * dn;
        }
        // everything dissolving upward as gold
        const D = x.dis, Q = x.D;
        for (let i = 0; i < N_DIS; i++) {
            const a = t - Q.tb[i], L = Q.life[i], j = i * 3;
            if (a < 0 || a > L) { D.al[i] = 0; continue; }
            D.pos[j] = Q.sx[i] + Q.vx[i] * a + Math.sin(a * 6 + Q.ph[i]) * 0.15 * a; D.pos[j + 1] = y + 0.3; D.pos[j + 2] = Q.sz[i] + Q.vz[i] * a * (1 - 0.3 * a);
            const u = a / L; D.al[i] = Math.min(1, a / 0.08) * (1 - u) ** 0.8 * (0.65 + 0.35 * Math.sin(a * 38 + Q.ph[i]));
            D.col[j] = 1; D.col[j + 1] = 0.82 + 0.13 * u; D.col[j + 2] = 0.35 + 0.35 * u;
        }
        O.flush(); D.flush();
    },
    end: cleanup,
};

export default { nat1: N1, nat20: N2 };
