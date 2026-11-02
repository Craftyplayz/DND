// Ember Cage exits 13: nat 1 skids off the table scraping sparks, nat 20 ascends spinning in white-gold, mid hops away off the edge.
let FX = null;
function fx(T) {
    if (FX) return FX;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    const r = document.createElement('canvas'); r.width = r.height = 128;
    const h = r.getContext('2d'), rg = h.createRadialGradient(64, 64, 0, 64, 64, 64);
    rg.addColorStop(0, 'rgba(255,255,255,0)'); rg.addColorStop(0.6, 'rgba(255,255,255,0)'); rg.addColorStop(0.82, 'rgba(255,255,255,1)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    h.fillStyle = rg; h.fillRect(0, 0, 128, 128);
    return (FX = { soft: new T.CanvasTexture(c), ring: new T.CanvasTexture(r), plane: new T.PlaneGeometry(1, 1) });
}
const clamp = (v) => Math.max(0, Math.min(1, v));
const at = (k, a, b) => clamp((k - a) / (b - a));
const ease = (k) => 1 - (1 - k) ** 3;
const R = (a, b) => a + Math.random() * (b - a);
const add = (x, o) => { x.scene.add(o); x.own.push(o); return o; };
const mat = (x, tex, color, additive = true) => new x.THREE.MeshBasicMaterial({ map: tex, color, transparent: true, depthWrite: false, blending: additive ? x.THREE.AdditiveBlending : x.THREE.NormalBlending });
// a camera-facing glow
const spr = (x, color, y, additive = true) => { const s = new x.THREE.Sprite(new x.THREE.SpriteMaterial({ map: fx(x.THREE).soft, color, transparent: true, depthWrite: false, blending: additive ? x.THREE.AdditiveBlending : x.THREE.NormalBlending })); s.position.set(x.home.x, y, x.home.z); return add(x, s); };
// a glow or ring lying flat on the table; (px, pz) centre, len along direction angle a (a = atan2(-dz, dx)), wid across
const flat = (x, tex, color, y, additive = true) => { const m = new x.THREE.Mesh(fx(x.THREE).plane, mat(x, tex, color, additive)); m.rotation.x = -Math.PI / 2; m.position.set(x.home.x, y, x.home.z); return add(x, m); };
const lay = (m, px, y, pz, len, wid, a) => { m.position.set(px, y, pz); m.scale.set(len, wid, 1); m.rotation.z = a; };
// tiny spark system: emit(pos, vel, life), step(dt) with gravity-free drag, orange cooling to dark
function sparks(x, n, size) {
    const T = x.THREE, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), v = new Float32Array(n * 3), age = new Float32Array(n).fill(9), life = new Float32Array(n).fill(1);
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.setAttribute('color', new T.BufferAttribute(col, 3));
    const p = new T.Points(geo, new T.PointsMaterial({ map: fx(T).soft, size, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
    p.frustumCulled = false; add(x, p); let head = 0;
    p.emit = (px, py, pz, vx, vy, vz, l) => { const i = head++ % n, j = i * 3; pos.set([px, py, pz], j); v.set([vx, vy, vz], j); age[i] = 0; life[i] = l; };
    p.step = (dt) => {
        for (let i = 0; i < n; i++) {
            const j = i * 3; age[i] += dt;
            if (age[i] >= life[i]) { col[j] = col[j + 1] = col[j + 2] = 0; continue; }
            for (let c = 0; c < 3; c++) pos[j + c] += v[j + c] * dt; const u = age[i] / life[i];
            col[j] = 1 - 0.4 * u; col[j + 1] = 0.85 * (1 - u) ** 1.5 + 0.1; col[j + 2] = 0.5 * (1 - u) ** 4;
        }
        geo.attributes.position.needsUpdate = geo.attributes.color.needsUpdate = true;
    };
    return p;
}
const base = (x) => {
    x.own = []; x.home = x.mesh.position.clone(); x.q0 = x.mesh.quaternion.clone(); x.lk = 0;
    const g = x.mesh.geometry; if (!g.boundingSphere) g.computeBoundingSphere(); x.r = g.boundingSphere.radius || 1;
};
const cleanup = (x) => {
    for (const o of x.own || []) { x.scene.remove(o); o.material.dispose(); if (o.isPoints) o.geometry.dispose(); }
    x.own = []; x.mesh.scale.setScalar(1); x.mesh.visible = true; if (x.home) x.mesh.position.copy(x.home); if (x.q0) x.mesh.quaternion.copy(x.q0);
};

const D1 = 2.0, D20 = 2.2, DM = 1.3;

export default {
    // the die tips onto an edge and scrapes sideways faster and faster, scorching the table and throwing sparks, until it slides off screen
    nat1: {
        key: 'a13-skid', name: 'Skid Off', dur: D1, impact: 0.3,
        blurb: 'The die tips over and scrapes sideways across the table, throwing sparks and leaving a scorch streak, until it slides off the edge.',
        start(x) {
            base(x); const T = x.THREE, a = R(-0.4, 0.4) + (x.home.x > 0 ? 0 : Math.PI);
            x.dx = Math.cos(a); x.dz = Math.sin(a); x.ang = Math.atan2(-x.dz, x.dx);
            x.axis = new T.Vector3(-x.dz, 0, x.dx); x.qt = new T.Quaternion(); x.qy = new T.Quaternion(); x.Y = new T.Vector3(0, 1, 0);
            x.scorch = flat(x, fx(T).soft, 0x120805, 0.04, false); x.scorch.material.opacity = 0; x.scorch.renderOrder = -2;
            x.glow = flat(x, fx(T).soft, 0xff5a10, 0.06); x.glow.material.opacity = 0;
            x.hot = spr(x, 0xff7a20, 3); x.hot.scale.setScalar(0.1);
            x.sp = sparks(x, 220, 7);
        },
        tick(k, x) {
            const dt = Math.max(0, (k - x.lk) * D1); x.lk = k;
            const h = x.home, m = x.mesh, r = x.r;
            // a short wobble as it tips (0-0.2), then the skid speeds up
            const tip = ease(at(k, 0, 0.2)), d = 28 * at(k, 0.12, 1) ** 2 + 0.25 * r * Math.sin(at(k, 0, 0.2) * 3.1416);
            const rock = tip * (0.55 + 0.12 * Math.sin(k * 40) * at(k, 0.2, 0.8));
            m.quaternion.copy(x.qt.setFromAxisAngle(x.axis, rock)).multiply(x.q0);
            m.quaternion.premultiply(x.qy.setFromAxisAngle(x.Y, -k * 0.9));
            const px = h.x + x.dx * d, pz = h.z + x.dz * d;
            m.position.set(px, h.y, pz); m.scale.setScalar(1);
            // scorch streak from the start to the die, with a hot edge that fades as it cools behind
            const len = Math.max(0.01, d);
            lay(x.scorch, h.x + x.dx * d / 2, 0.04, h.z + x.dz * d / 2, len + r * 1.2, r * 1.3, x.ang); x.scorch.material.opacity = 0.9 * at(k, 0.1, 0.25);
            lay(x.glow, h.x + x.dx * d / 2, 0.06, h.z + x.dz * d / 2, len + r, r * 0.7, x.ang); x.glow.material.opacity = 0.7 * at(k, 0.1, 0.2) * (1 - at(k, 0.6, 1));
            x.hot.position.set(px, 3, pz); x.hot.scale.setScalar(r * 3.5); x.hot.material.opacity = 0.6 * at(k, 0.1, 0.25) * (1 - at(k, 0.8, 1));
            if (k > 0.1) for (let i = dt * 260, e = 0; e < i; e++) {
                const s = R(3, 11), sd = R(-0.7, 0.7);
                x.sp.emit(px - x.dx * r * 0.5, 2, pz - x.dz * r * 0.5, -x.dx * s * 0.6 - x.dz * sd * s + R(-1, 1), R(0, 1), -x.dz * s * 0.6 + x.dx * sd * s + R(-1, 1), R(0.25, 0.7));
            }
            x.sp.step(dt);
        },
        end: cleanup,
    },
    // the die swells toward the camera, spinning faster and faster as it burns white-gold, then flashes out
    nat20: {
        key: 'a13-ascend', name: 'Ascension', dur: D20, impact: 1.6,
        blurb: 'The die lifts toward the viewer, growing and spinning while it glows white-gold, then vanishes in a flash.',
        start(x) {
            base(x); const T = x.THREE;
            x.qy = new T.Quaternion(); x.Y = new T.Vector3(0, 1, 0);
            x.halo = spr(x, 0xffc040, 4); x.halo.scale.setScalar(0.1);
            x.heart = spr(x, 0xfff4d0, 5); x.heart.scale.setScalar(0.1);
            x.flash = spr(x, 0xffffff, 6); x.flash.scale.setScalar(0.1); x.flash.material.opacity = 0;
            x.rings = [0, 1, 2].map(() => flat(x, fx(T).ring, 0xffd860, 0.12));
            x.rays = [0, 1, 2, 3, 4, 5, 6, 7].map(() => flat(x, fx(T).soft, 0xffe080, 0.2));
            x.sp = sparks(x, 160, 7);
        },
        tick(k, x) {
            const dt = Math.max(0, (k - x.lk) * D20); x.lk = k;
            const h = x.home, m = x.mesh, r = x.r, T = k * D20, up = at(k, 0, 0.72), e = up * up * (3 - 2 * up);
            // spin about the vertical axis, faster and faster
            m.quaternion.copy(x.qy.setFromAxisAngle(x.Y, 2 * up + 22 * up ** 3)).multiply(x.q0);
            const s = 1 + 2.4 * e; m.scale.set(s, Math.min(s, 1.6), s); m.position.set(h.x, h.y, h.z);
            const gone = k > 0.76; m.visible = !gone;
            x.halo.position.set(h.x, 4, h.z); x.halo.scale.setScalar(r * (2.5 + 7 * e)); x.halo.material.opacity = gone ? 0 : 0.25 + 0.6 * e;
            x.halo.material.color.setRGB(1, 0.72 + 0.28 * e, 0.25 + 0.7 * e);
            x.heart.position.set(h.x, 5, h.z); x.heart.scale.setScalar(r * (1 + 3.5 * e)); x.heart.material.opacity = gone ? 0 : 0.7 * e * e;
            // rings gather inward while it rises
            x.rings.forEach((g, i) => { const ph = (T / 0.5 + i / 3) % 1; g.scale.setScalar(r * (14 - 11 * ph)); g.material.opacity = k < 0.76 ? Math.sin(3.1416 * ph) * (0.2 + 0.5 * e) : 0; });
            if (k < 0.76) for (let i = dt * 120 * (0.3 + e), n = 0; n < i; n++) { const a = R(0, 6.283), c = Math.cos(a), sn = Math.sin(a); x.sp.emit(h.x + c * r * s, 3, h.z + sn * r * s, c * R(1, 3) + -sn * 5, R(0, 1), sn * R(1, 3) + c * 5, R(0.4, 0.8)); }
            // the flash and the rays it throws
            const f = at(k, 0.74, 0.86), fo = at(k, 0.86, 1);
            x.flash.scale.setScalar(r * (4 + 24 * ease(f))); x.flash.material.opacity = k < 0.74 ? 0 : (1 - fo) ** 1.5;
            x.rays.forEach((g, i) => { const a = i * 0.785 + 0.3, L = r * 14 * ease(f), c = Math.cos(a), sn = Math.sin(a); lay(g, h.x + c * L / 2, 0.2, h.z + sn * L / 2, L + 0.01, r * 0.5 * (1 - fo), Math.atan2(-sn, c)); g.material.opacity = k < 0.74 ? 0 : (1 - fo); });
            if (k > 0.74 && !x.bang) { x.bang = 1; for (let i = 0; i < 100; i++) { const a = R(0, 6.283), v = R(4, 14); x.sp.emit(h.x, 2, h.z, Math.cos(a) * v, R(0, 2), Math.sin(a) * v, R(0.5, 1)); } }
            x.sp.step(dt);
        },
        end: (x) => { x.bang = 0; cleanup(x); },
    },
    // two little hops toward the nearest table edge, then a long hop off the screen
    mid: {
        key: 'a13-hop', name: 'Hop Away', dur: DM,
        blurb: 'The die hops twice toward the nearest table edge, then leaps off the screen.',
        start(x) {
            base(x); const T = x.THREE, l = Math.hypot(x.home.x, x.home.z) || 1;
            x.dx = x.home.x / l; x.dz = x.home.z / l; if (l < 0.01) { x.dx = 0; x.dz = 1; }
            x.qy = new T.Quaternion(); x.Y = new T.Vector3(0, 1, 0);
            x.shadow = flat(x, fx(T).soft, 0x000000, 0.03, false); x.shadow.renderOrder = -2;
            x.puff = [0, 1].map(() => flat(x, fx(T).ring, 0xff8a28, 0.1));
            x.sp = sparks(x, 40, 5);
        },
        tick(k, x) {
            const dt = Math.max(0, (k - x.lk) * DM); x.lk = k;
            const h = x.home, m = x.mesh, r = x.r;
            // hop 1 and 2 are short, hop 3 is a long leap; arc = 0..1..0 within a hop
            const seg = k < 0.25 ? 0 : k < 0.5 ? 1 : 2, u = seg < 2 ? (k - seg * 0.25) / 0.25 : (k - 0.5) / 0.5;
            const arc = Math.sin(3.1416 * u), start = [0, 1.6 * r, 3.4 * r][seg], end = [1.6 * r, 3.4 * r, 30][seg];
            const d = start + (end - start) * (seg < 2 ? u : u * u);
            const px = h.x + x.dx * d, pz = h.z + x.dz * d, s = 1 + 0.3 * arc * (seg < 2 ? 1 : 1.6);
            m.position.set(px, h.y, pz); m.scale.setScalar(s);
            m.quaternion.copy(x.qy.setFromAxisAngle(x.Y, (0.5 + 0.6 * seg) * (seg < 2 ? u : u * 2) + seg * 0.5)).multiply(x.q0);
            // shadow stays where it took off and shrinks while the die is in the air; the landing puffs a ring
            const sx = h.x + x.dx * start, sz = h.z + x.dz * start;
            x.shadow.position.set(seg < 2 ? px : sx + (px - sx) * 0.98, 0.03, seg < 2 ? pz : sz + (pz - sz) * 0.98); x.shadow.scale.setScalar(r * 2.4 * (1 - 0.35 * arc)); x.shadow.material.opacity = 0.45 * (1 - at(k, 0.6, 0.85));
            x.puff.forEach((g, i) => { const t = at(k, 0.25 * (i + 1), 0.25 * (i + 1) + 0.15); const L = (i ? 3.4 : 1.6) * r; g.position.set(h.x + x.dx * L, 0.1, h.z + x.dz * L); g.scale.setScalar(r * (1 + 3 * t)); g.material.opacity = k < 0.25 * (i + 1) ? 0 : (1 - t) * 0.6; });
            if (u > 0.9 && seg < 2 || (seg === 2 && u > 0.05)) for (let i = dt * 90, e = 0; e < i; e++) x.sp.emit(px, 1.5, pz, R(-3, 3), R(0, 1), R(-3, 3), R(0.2, 0.45));
            x.sp.step(dt);
        },
        end: cleanup,
    },
};
