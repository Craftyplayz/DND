// Ember Cage exit animations, Meteor: nat 1 is smashed flat by a flaming meteor, nat 20 rises like a meteor and bursts into a golden starburst.
let FX = null;
function fx(T) {
    if (FX) return FX;
    const mk = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t; };
    const rad = (g, s, stops) => { const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); stops.forEach(([o, c]) => r.addColorStop(o, c)); g.fillStyle = r; g.fillRect(0, 0, s, s); };
    const W = (a) => `rgba(255,255,255,${a})`;
    return (FX = {
        plane: new T.PlaneGeometry(1, 1),
        soft: mk(64, 64, (g) => rad(g, 64, [[0, W(1)], [0.3, W(0.55)], [1, W(0)]])),
        ring: mk(128, 128, (g) => rad(g, 128, [[0, W(0)], [0.6, W(0)], [0.82, W(1)], [1, W(0)]])),
        disc: mk(64, 64, (g) => rad(g, 64, [[0, W(1)], [0.72, W(1)], [1, W(0)]])),
        // a comet shape: bright at the right (+x) end, thinning to the left
        streak: mk(256, 32, (g, w, h) => {
            const a = g.createLinearGradient(0, 0, w, 0); a.addColorStop(0, W(0)); a.addColorStop(0.7, W(0.45)); a.addColorStop(0.9, W(1)); a.addColorStop(1, W(0));
            g.fillStyle = a; g.fillRect(0, 0, w, h);
            const b = g.createLinearGradient(0, 0, 0, h); b.addColorStop(0, W(0)); b.addColorStop(0.5, W(1)); b.addColorStop(1, W(0));
            g.globalCompositeOperation = 'destination-in'; g.fillStyle = b; g.fillRect(0, 0, w, h);
        }),
        // a four-point glint with fainter diagonal spikes
        star: mk(128, 128, (g) => {
            g.translate(64, 64);
            const spike = (rot, sy, al) => { g.save(); g.rotate(rot); g.scale(1, sy); const r = g.createRadialGradient(0, 0, 0, 0, 0, 64); r.addColorStop(0, W(al)); r.addColorStop(1, W(0)); g.fillStyle = r; g.fillRect(-64, -64, 128, 128); g.restore(); };
            spike(0, 0.06, 1); spike(Math.PI / 2, 0.06, 1); spike(Math.PI / 4, 0.04, 0.5); spike(-Math.PI / 4, 0.04, 0.5);
            const c = g.createRadialGradient(0, 0, 0, 0, 0, 22); c.addColorStop(0, W(1)); c.addColorStop(1, W(0)); g.fillStyle = c; g.fillRect(-64, -64, 128, 128);
        }),
    });
}
const clamp = (v) => Math.max(0, Math.min(1, v));
const at = (k, a, b) => clamp((k - a) / (b - a));
const ease = (k) => 1 - (1 - k) ** 3;
const R = (a, b) => a + Math.random() * (b - a);
const FIRE = [1, 0.95, 0.7, 1, 0.5, 0.1, 0.55, 0.1, 0.03, 0, 0, 0];
const GOLD = [1, 1, 0.85, 1, 0.82, 0.25, 0.75, 0.38, 0.06, 0, 0, 0];

const add = (x, o) => { x.scene.add(o); x.own.push(o); return o; };
const spr = (x, tex, color, y, additive = true) => {
    const s = new x.THREE.Sprite(new x.THREE.SpriteMaterial({ map: tex, color, transparent: true, depthWrite: false, blending: additive ? x.THREE.AdditiveBlending : x.THREE.NormalBlending }));
    s.position.set(x.home.x, y, x.home.z); return add(x, s);
};
const flat = (x, tex, color, y, additive = true) => {
    const m = new x.THREE.Mesh(fx(x.THREE).plane, new x.THREE.MeshBasicMaterial({ map: tex, color, transparent: true, depthWrite: false, blending: additive ? x.THREE.AdditiveBlending : x.THREE.NormalBlending }));
    m.rotation.x = -Math.PI / 2; m.position.set(x.home.x, y, x.home.z); return add(x, m);
};
// lay a streak so its bright end points along world direction angle a (a = atan2(-dz, dx)); place its centre
const lay = (m, px, y, pz, len, wid, a) => { m.position.set(px, y, pz); m.scale.set(len, wid, 1); m.rotation.z = a; };
const heat = (m, u) => { const b = Math.min(1, u * 1.6); m.color.setRGB(b, (0.1 + 0.7 * u * u) * b, (0.02 + 0.45 * u ** 4) * b); };

// a Points system with its own velocities, colour-over-life and (optional) turning velocities that bend the paths into spirals
function ps(x, n, size, pal, tw = 0) {
    const T = x.THREE, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), v = new Float32Array(n * 3);
    const w = new Float32Array(n), age = new Float32Array(n).fill(1), life = new Float32Array(n).fill(1);
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.setAttribute('color', new T.BufferAttribute(col, 3));
    const p = new T.Points(geo, new T.PointsMaterial({ map: fx(T).soft, size, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
    p.frustumCulled = false; add(x, p);
    let head = 0;
    return {
        emit(px, py, pz, vx, vy, vz, l, turn = 0) {
            const i = head++ % n, j = i * 3;
            pos[j] = px; pos[j + 1] = py; pos[j + 2] = pz; v[j] = vx; v[j + 1] = vy; v[j + 2] = vz; w[i] = turn; age[i] = 0; life[i] = l;
        },
        step(dt, grav, drag) {
            for (let i = 0; i < n; i++) {
                const j = i * 3;
                age[i] += dt;
                if (age[i] >= life[i]) { col[j] = col[j + 1] = col[j + 2] = 0; continue; }
                if (w[i]) { const c = Math.cos(w[i] * dt), s = Math.sin(w[i] * dt), vx = v[j], vz = v[j + 2]; v[j] = vx * c - vz * s; v[j + 2] = vx * s + vz * c; }
                v[j + 1] -= grav * dt; const d = 1 - drag * dt; v[j] *= d; v[j + 1] *= d; v[j + 2] *= d;
                pos[j] += v[j] * dt; pos[j + 1] += v[j + 1] * dt; pos[j + 2] += v[j + 2] * dt;
                const u = age[i] / life[i], a = u < 0.25 ? 0 : u < 0.65 ? 3 : 6, t = u < 0.25 ? u / 0.25 : u < 0.65 ? (u - 0.25) / 0.4 : (u - 0.65) / 0.35;
                const f = tw ? 1 - tw * 0.5 * (1 + Math.sin(age[i] * 38 + i * 7)) : 1;
                for (let c = 0; c < 3; c++) col[j + c] = (pal[a + c] + (pal[a + 3 + c] - pal[a + c]) * t) * f;
            }
            geo.attributes.position.needsUpdate = geo.attributes.color.needsUpdate = true;
        },
    };
}
const cleanup = (x) => {
    for (const o of x.own || []) { x.scene.remove(o); o.material.dispose(); if (o.isPoints) o.geometry.dispose(); }
    for (const g of x.geos || []) g.dispose();
    x.own = []; x.geos = []; x.mesh.scale.setScalar(1);
};

const D1 = 2.4, I1 = 0.6, D20 = 2.4, I20 = 1.0;

export default {
    nat1: {
        key: 'n01-meteor-crater', name: 'Meteor Strike', dur: D1, impact: I1,
        blurb: 'A flaming meteor streaks in from off-screen and smashes the die into a glowing crater that slowly cools.',
        start(x) {
            x.own = []; x.geos = []; x.home = x.mesh.position.clone(); x.lk = 0; x.hit = false;
            const n = Math.hypot(1, 0.7); x.dx = 1 / n; x.dz = 0.7 / n; x.ang = Math.atan2(-x.dz, x.dx);
            x.shadow = spr(x, fx(x.THREE).disc, 0x000000, 0.08, false); x.shadow.renderOrder = -3; x.shadow.material.opacity = 0;
            x.tail = flat(x, fx(x.THREE).streak, 0xff6a14, 3); x.tail2 = flat(x, fx(x.THREE).streak, 0xfff0c0, 3.2);
            x.halo = spr(x, fx(x.THREE).soft, 0xff5a10, 3.4); x.core = spr(x, fx(x.THREE).soft, 0xffe8b0, 3.6);
            x.trail = ps(x, 150, 9, FIRE);
            x.embers = ps(x, 110, 7, FIRE);
        },
        tick(k, x) {
            const T = k * D1, dt = Math.max(0, (k - x.lk) * D1); x.lk = k;
            const h = x.home, dx = x.dx, dz = x.dz, tn = x.THREE;
            if (T < I1) {
                const t = T / I1, p = t ** 1.5, d = -38 * (1 - p), hx = h.x + dx * d, hz = h.z + dz * d, len = 8 + 9 * p;
                lay(x.tail, hx - dx * len / 2, 3, hz - dz * len / 2, len, 2.4 + 1.6 * p, x.ang); x.tail.material.opacity = 0.9;
                lay(x.tail2, hx - dx * len * 0.3, 3.2, hz - dz * len * 0.3, len * 0.6, 0.9 + 0.7 * p, x.ang); x.tail2.material.opacity = 0.9;
                x.halo.position.set(hx, 3.4, hz); x.halo.scale.setScalar(2.4 + 3 * p); x.halo.material.opacity = 0.9;
                x.core.position.set(hx, 3.6, hz); x.core.scale.setScalar(0.9 + 1.5 * p);
                for (let i = dt * 240, e = 0; e < i; e++) x.trail.emit(hx - dx * R(0, 3), 2, hz - dz * R(0, 3), -dx * R(2, 7) + R(-2, 2), R(-1, 2), -dz * R(2, 7) + R(-2, 2), R(0.35, 0.7));
                x.trail.step(dt, 0, 1);
                x.shadow.scale.setScalar(0.5 + p * 4.5); x.shadow.material.opacity = p * 0.6;
                const sh = 0.05 * p; x.mesh.position.x += R(-sh, sh); x.mesh.position.z += R(-sh, sh);
                return;
            }
            const tt = T - I1;
            if (!x.hit) {
                x.hit = true; x.mesh.visible = false;
                const F = fx(tn);
                x.flash = spr(x, F.soft, 0xfff4d0, 4); x.fire = spr(x, F.soft, 0xff7a18, 3);
                x.shock = flat(x, F.ring, 0xffb050, 0.15); x.shock2 = flat(x, F.ring, 0xff6a20, 0.12);
                x.crater = flat(x, F.disc, 0x070302, 0.03, false); x.crater.renderOrder = -2;
                x.rim = flat(x, F.ring, 0xffa030, 0.1); x.molten = spr(x, F.soft, 0xffc060, 0.5);
                x.cracks = [];
                for (let i = 0; i < 9; i++) { const c = flat(x, F.streak, 0xff8a20, 0.2); x.cracks.push({ m: c, a: (i / 9) * 6.283 + R(-0.25, 0.25), len: R(1.6, 3.4) }); }
                x.smoke = []; x.rocks = [];
                for (let i = 0; i < 6; i++) { const s = spr(x, F.soft, 0x2a1a12, 0.3, false); s.renderOrder = -1; x.smoke.push({ s, a: R(0, 6.283), r: R(0.3, 1.6) }); }
                const g = new tn.IcosahedronGeometry(1, 0); x.geos.push(g);
                for (let i = 0; i < 10; i++) {
                    const a = R(0, 6.283), sp = R(4, 10), m = add(x, new tn.Mesh(g, new tn.MeshBasicMaterial({ color: 0x40200f })));
                    m.position.set(h.x, 0.3, h.z); x.rocks.push({ m, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: R(5, 11), y: 0.3, r: R(0.14, 0.34), sp: R(-9, 9), sq: R(0.6, 1) });
                }
                for (let i = 0; i < 110; i++) { const a = R(0, 6.283), sp = R(2, 12); x.embers.emit(h.x, 0.5, h.z, Math.cos(a) * sp, R(2, 10), Math.sin(a) * sp, R(0.8, 1.6)); }
                x.tail.material.opacity = 0; x.tail2.material.opacity = 0; x.halo.material.opacity = 0; x.core.material.opacity = 0; x.shadow.material.opacity = 0;
            }
            const heatU = 1 - at(tt, 0.05, 1.4), fade = 1 - at(T, 2.05, D1);
            const f = at(tt, 0, 0.35);
            x.flash.scale.setScalar(2 + ease(f) * 11); x.flash.material.opacity = (1 - f) ** 1.5;
            const ff = at(tt, 0, 0.9); x.fire.scale.setScalar(3 + ease(ff) * 6); x.fire.material.opacity = (1 - ff) * 0.85;
            const s1 = at(tt, 0, 0.7), s2 = at(tt, 0.08, 1.1);
            x.shock.scale.setScalar(1 + ease(s1) * 17); x.shock.material.opacity = (1 - s1) ** 1.4;
            x.shock2.scale.setScalar(1 + ease(s2) * 10); x.shock2.material.opacity = (1 - s2) * 0.6;
            x.crater.scale.setScalar(0.1 + 3.6 * ease(at(tt, 0, 0.18))); x.crater.material.opacity = 0.92 * fade;
            x.rim.scale.setScalar(0.1 + 4.8 * ease(at(tt, 0, 0.22))); heat(x.rim.material, heatU); x.rim.material.opacity = fade;
            x.molten.scale.setScalar(3.4 * ease(at(tt, 0, 0.2))); heat(x.molten.material, heatU); x.molten.material.opacity = heatU * heatU * fade;
            const cg = ease(at(tt, 0.02, 0.3));
            for (const c of x.cracks) {
                const len = c.len * cg, cx = Math.cos(c.a), cz = Math.sin(c.a);
                lay(c.m, h.x + cx * (0.7 + len / 2), 0.2, h.z + cz * (0.7 + len / 2), len + 0.01, 0.3, Math.atan2(cz, -cx));
                heat(c.m.material, heatU); c.m.material.opacity = heatU * fade;
            }
            for (const r of x.rocks) {
                r.vy -= 22 * dt; r.y += r.vy * dt;
                if (r.y < 0.1) { r.y = 0.1; r.vy = -r.vy * 0.3; r.vx *= 0.55; r.vz *= 0.55; r.sp *= 0.5; }
                const p = r.m.position; p.set(p.x + r.vx * dt, r.y, p.z + r.vz * dt);
                r.m.scale.set(r.r, r.r * r.sq, r.r).multiplyScalar((1 + r.y * 0.12) * (1 - at(T, 1.7, D1)));
                r.m.rotation.x += r.sp * dt; r.m.rotation.z += r.sp * 0.7 * dt;
                r.m.material.color.setRGB(0.25 + 0.75 * heatU * heatU, 0.12 + 0.3 * heatU ** 3, 0.06);
            }
            x.embers.step(dt, 14, 0.5); x.trail.step(dt, 0, 1);
            const sm = at(tt, 0.05, 1.9);
            for (const m of x.smoke) {
                m.s.position.set(h.x + Math.cos(m.a) * (m.r + tt * 1.6), 0.3, h.z + Math.sin(m.a) * (m.r + tt * 1.6) - tt * 0.8);
                m.s.scale.setScalar(1.5 + tt * 2.4); m.s.material.opacity = Math.sin(Math.PI * sm) * 0.42 * fade;
            }
        },
        end: cleanup,
    },
    nat20: {
        key: 'n01-meteor-rise', name: 'Rising Meteor', dur: D20, impact: I20,
        blurb: 'The die blazes and launches skyward like a rising meteor, trailing a fiery spiral before bursting into a golden starburst.',
        start(x) {
            x.own = []; x.geos = []; x.home = x.mesh.position.clone(); x.lk = 0; x.tot = 0; x.burst = false; x.wave2 = false; x.c = x.home.clone();
            const T = x.THREE, F = fx(T);
            x.qy = new T.Quaternion(); x.qx = new T.Quaternion(); x.Y = new T.Vector3(0, 1, 0); x.X = new T.Vector3(1, 0, 0);
            x.halo = spr(x, F.soft, 0xffa020, 2); x.halo.scale.setScalar(0.1);
            x.heart = spr(x, F.soft, 0xfff0c0, 3); x.heart.scale.setScalar(0.1);
            x.suck = [0, 1, 2].map(() => flat(x, F.ring, 0xffb030, 0.12));
            x.beams = []; for (let i = 0; i < 6; i++) x.beams.push(flat(x, F.streak, 0xffc040, 0.2));
            x.spiral = ps(x, 240, 9, FIRE);
            x.gold = ps(x, 170, 7, GOLD, 0.8);
        },
        tick(k, x) {
            const T = k * D20, dt = Math.max(0, (k - x.lk) * D20); x.lk = k;
            const h = x.home, m = x.mesh;
            if (T < I20) {
                const t = T / I20, e = t * t * (3 - 2 * t), p = m.position;
                x.tot += dt * (5 + 38 * t * t);
                p.set(h.x, h.y + e * 3, h.z - e * 1.4); m.scale.setScalar(1 + 2.6 * e); x.c.copy(p);
                m.quaternion.premultiply(x.qy.setFromAxisAngle(x.Y, x.tot)).premultiply(x.qx.setFromAxisAngle(x.X, Math.sin(x.tot * 0.5) * 0.35 * t));
                x.halo.position.set(p.x, 2, p.z); x.halo.scale.setScalar(2.5 + t * 6.5); x.halo.material.opacity = 0.35 + 0.65 * t; x.halo.material.color.setRGB(1, 0.62 + 0.3 * t, 0.12 + 0.55 * t);
                x.heart.position.set(p.x, 3, p.z); x.heart.scale.setScalar(1 + t * 3.5); x.heart.material.opacity = 0.2 + 0.7 * t * t;
                // three arms of fire thrown off the die; their velocities keep turning so they curl into a spiral and are left behind as it rises
                for (let i = dt * (150 + 200 * t), n = 0; n < i; n++) {
                    const arm = (Math.random() * 3) | 0, a = x.tot * 0.7 + arm * 2.0944 + R(-0.15, 0.15), sp = R(4, 8) * (0.6 + t);
                    const rr = 1 + 2.4 * e, ca = Math.cos(a), sa = Math.sin(a); x.spiral.emit(p.x + ca * rr, 5, p.z + sa * rr, ca * sp, R(0, 1), sa * sp + 1.5, R(0.9, 1.4), 1.3);
                }
                x.spiral.step(dt, 0, 0.5);
                // rings that gather in toward the die, and rays that open behind it
                x.suck.forEach((r, i) => {
                    const ph = (T / 0.45 + i / 3) % 1;
                    r.position.set(h.x, 0.12, h.z - e * 1.2); r.scale.setScalar(12 - 10.5 * ph); r.material.opacity = Math.sin(Math.PI * ph) * (0.35 + 0.45 * t);
                });
                x.beams.forEach((b, i) => {
                    const a = i * 1.0472 + x.tot * 0.25, len = 3 + 8 * t * t, cx = Math.cos(a), cz = Math.sin(a);
                    lay(b, p.x + cx * (len / 2 + 0.8), 0.2, p.z + cz * (len / 2 + 0.8), len, 0.5 + 0.7 * t, Math.atan2(cz, -cx)); b.material.opacity = 0.15 + 0.55 * t * t;
                });
                return;
            }
            const tt = T - I20, c = x.c;
            if (!x.burst) {
                x.burst = true; m.visible = false;
                const F = fx(x.THREE);
                x.flash = spr(x, F.soft, 0xffffff, 4); x.flash.position.set(c.x, 4, c.z);
                x.star = spr(x, F.star, 0xfff0b0, 4.2); x.star2 = spr(x, F.star, 0xffc840, 4.1); x.star.position.set(c.x, 4.2, c.z); x.star2.position.set(c.x, 4.1, c.z);
                x.w1 = flat(x, F.ring, 0xffd860, 0.15); x.w2 = flat(x, F.ring, 0xffffff, 0.14); x.w1.position.set(c.x, 0.15, c.z); x.w2.position.set(c.x, 0.14, c.z);
                x.rays = [];
                for (let i = 0; i < 20; i++) x.rays.push({ m: flat(x, F.streak, i % 3 ? 0xffd050 : 0xffffff, 0.3), a: (i / 20) * 6.283 + R(-0.12, 0.12), L: R(6, 14), w: R(0.25, 0.5) });
                for (let i = 0; i < 110; i++) { const a = R(0, 6.283), sp = R(3, 14); x.gold.emit(c.x, 0.6, c.z, Math.cos(a) * sp, R(0, 3), Math.sin(a) * sp + 0.8, R(0.8, 1.3), R(-1.5, 1.5)); }
                for (const b of x.beams) b.material.opacity = 0;
                for (const r of x.suck) r.material.opacity = 0;
            }
            if (!x.wave2 && tt > 0.25) { x.wave2 = true; for (let i = 0; i < 60; i++) { const a = R(0, 6.283), sp = R(2, 9); x.gold.emit(c.x, 0.6, c.z, Math.cos(a) * sp, R(0, 3), Math.sin(a) * sp + 0.8, R(0.7, 1.1), R(-1.5, 1.5)); } }
            const f = at(tt, 0, 0.4);
            x.flash.scale.setScalar(3 + ease(f) * 14); x.flash.material.opacity = (1 - f) ** 1.6;
            const hg = at(tt, 0, 0.9); x.halo.position.set(c.x, 2, c.z); x.halo.scale.setScalar(8 + ease(hg) * 6); x.halo.material.opacity = (1 - hg) * 0.8;
            x.heart.material.opacity = (1 - at(tt, 0, 0.25));
            const sa = at(tt, 0, 1.1), sc = 2 + ease(at(tt, 0, 0.45)) * 13;
            x.star.scale.setScalar(sc); x.star.material.rotation = tt * 0.9; x.star.material.opacity = (1 - sa) ** 1.2;
            x.star2.scale.setScalar(sc * 0.7); x.star2.material.rotation = 0.785 - tt * 1.3; x.star2.material.opacity = (1 - sa) * 0.8;
            const a1 = at(tt, 0, 0.8), a2 = at(tt, 0.1, 1.1);
            x.w1.scale.setScalar(1 + ease(a1) * 18); x.w1.material.opacity = (1 - a1) ** 1.3;
            x.w2.scale.setScalar(1 + ease(a2) * 11); x.w2.material.opacity = (1 - a2) * 0.7;
            for (const r of x.rays) {
                const front = r.L * ease(at(tt, 0, 0.5)), tail = r.L * 0.9 * ease(at(tt, 0.1, 0.85)), len = Math.max(0.05, front - tail), cx = Math.cos(r.a), cz = Math.sin(r.a), mid = (front + tail) / 2;
                lay(r.m, c.x + cx * mid, 0.3, c.z + cz * mid, len, r.w * (1 - 0.5 * at(tt, 0.4, 1)), Math.atan2(-cz, cx)); r.m.material.opacity = 1 - at(tt, 0.35, 0.95);
            }
            x.spiral.step(dt, 0, 0.5);
            x.gold.step(dt, -0.8, 1.4);
        },
        end: cleanup,
    },
};
