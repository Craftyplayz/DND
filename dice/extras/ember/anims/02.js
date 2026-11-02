// Ember Cage exits, "The Iron Cage": nat 1 bursts into clattering hot iron bars and a cooling molten puddle; nat 20 opens like an iron flower around a golden fire spirit.
let TX = null;
function tex(THREE) {
    if (TX) return TX;
    const mk = (draw) => { const c = document.createElement('canvas'); c.width = c.height = 128; draw(c.getContext('2d')); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
    const soft = mk((g) => { const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,.7)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128); });
    const ring = mk((g) => { const r = g.createRadialGradient(64, 64, 40, 64, 64, 64); r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(0.6, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128); });
    const rays = mk((g) => {
        g.translate(64, 64); const l = g.createLinearGradient(0, 0, 62, 0); l.addColorStop(0, 'rgba(255,255,255,1)'); l.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = l;
        for (let i = 0; i < 14; i++) { g.rotate(Math.PI / 7); const len = i % 2 ? 62 : 42; g.beginPath(); g.moveTo(0, -2); g.lineTo(len, -0.8); g.lineTo(len, 0.8); g.lineTo(0, 2); g.fill(); }
    });
    return (TX = { soft, ring, rays, plane: new THREE.PlaneGeometry(1, 1) });
}
const at = (k, a, b) => Math.max(0, Math.min(1, (k - a) / (b - a)));
const ease = (k) => 1 - (1 - k) ** 3;
const back = (k) => 1 + 2.9 * (k - 1) ** 3 + 1.9 * (k - 1) ** 2;
const rnd = Math.random;

// everything an exit adds lives under one group at the die's spot; mats/geos are disposed in end
function mk(x) {
    x.mats = []; x.geos = []; x.g = new x.THREE.Group(); x.g.position.copy(x.mesh.position); x.scene.add(x.g); x.home = x.mesh.position.clone();
}
const M = (x, m) => (x.mats.push(m), m);
const G = (x, g) => (x.geos.push(g), g);
function spr(x, color, map = 'soft', add = true) {
    const s = new x.THREE.Sprite(M(x, new x.THREE.SpriteMaterial({ map: tex(x.THREE)[map], color, transparent: true, depthWrite: false, blending: add ? x.THREE.AdditiveBlending : x.THREE.NormalBlending })));
    x.g.add(s); return s;
}
function flat(x, map, mat, y) {
    const m = new x.THREE.Mesh(tex(x.THREE).plane, mat); m.rotation.x = -Math.PI / 2; m.position.y = y; x.g.add(m); return m;
}
const addMat = (x, map, color) => M(x, new x.THREE.MeshBasicMaterial({ map: tex(x.THREE)[map], color, transparent: true, depthWrite: false, blending: x.THREE.AdditiveBlending }));
function pts(x, n, size) {
    const T = x.THREE, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), geo = G(x, new T.BufferGeometry());
    geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.setAttribute('color', new T.BufferAttribute(col, 3));
    const p = new T.Points(geo, M(x, new T.PointsMaterial({ map: tex(T).soft, size, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false, blending: T.AdditiveBlending })));
    p.frustumCulled = false; p.visible = false; x.g.add(p); return { p, pos, col, geo };
}
function cleanup(x) {
    if (x.g) x.scene.remove(x.g);
    for (const m of x.mats || []) m.dispose();
    for (const g of x.geos || []) g.dispose();
    x.mats = x.geos = x.g = null; x.mesh.scale.setScalar(1);
}

const N1 = 12, NP = 90;
const nat1 = {
    key: 'n02-cage-burst', name: 'Cage Burst', impact: 0.6, dur: 2.0,
    blurb: 'The cage shudders and bursts into hot iron bars that clatter across the table while the molten core spills out and cools.',
    start(x) {
        const T = x.THREE; mk(x);
        x.heat = spr(x, 0xff5a10); x.heat.scale.setScalar(0.1);
        x.leaks = Array.from({ length: 8 }, (_, i) => { const s = spr(x, 0xff9a30); s.a = i * 0.785 + 0.2; s.scale.setScalar(0.01); return s; });
        x.flash = spr(x, 0xfff2c8); x.core = spr(x, 0xffd060);
        x.ringM = addMat(x, 'ring', 0xffa040); x.ring = flat(x, 'ring', x.ringM, 0.05);
        x.flash.visible = x.core.visible = x.ring.visible = false;
        // puddle: a glowing additive layer over a dark scorch, both made of a few overlapping soft blobs
        x.gm = addMat(x, 'soft', 0xffe080); x.sm = M(x, new T.MeshBasicMaterial({ map: tex(T).soft, color: 0x1c0a05, transparent: true, depthWrite: false, opacity: 0 }));
        x.pud = Array.from({ length: 7 }, (_, i) => {
            const a = rnd() * 6.283, r = i ? 0.5 + rnd() * 1.3 : 0, s = i ? 0.5 + rnd() * 0.5 : 1;
            const gl = flat(x, 'soft', x.gm, 0.05), sc = flat(x, 'soft', x.sm, 0.02); gl.visible = sc.visible = false;
            return { gl, sc, gx: Math.cos(a) * r, gz: Math.sin(a) * r, s };
        });
        // bars: dark iron with glowing ends, sharing two materials so they cool together
        x.iron = M(x, new T.MeshBasicMaterial({ color: 0x2b2420, transparent: true })); x.hot = M(x, new T.MeshBasicMaterial({ color: 0xfff0a0, transparent: true }));
        x.bgm = M(x, new T.SpriteMaterial({ map: tex(T).soft, color: 0xff8a20, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
        const endG = G(x, new T.BoxGeometry(0.36, 0.24, 0.24));
        x.bars = Array.from({ length: N1 }, (_, i) => {
            const len = i % 4 === 3 ? 0.5 + rnd() * 0.3 : 0.9 + rnd() * 1.4, grp = new T.Group(), inner = new T.Group();
            const body = new T.Mesh(G(x, new T.BoxGeometry(len, 0.2, 0.2)), x.iron); inner.add(body);
            for (const sgn of [-1, 1]) { const e = new T.Mesh(endG, x.hot); e.position.x = sgn * (len / 2 - 0.14); inner.add(e); }
            grp.add(inner); grp.visible = false; x.g.add(grp);
            const gs = new T.Sprite(x.bgm); gs.visible = false; x.g.add(gs);
            return { grp, inner, gs, len, a: (i / N1) * 6.283 + rnd() * 0.4, v: 9 + rnd() * 8, vy: 0.6 + rnd() * 1.2, w: (rnd() < 0.5 ? -1 : 1) * (9 + rnd() * 14), tum: (rnd() - 0.5) * 14, yaw: rnd() * 6.283 };
        });
        x.dr = pts(x, NP, 7);
        x.dv = Array.from({ length: NP }, () => { const a = rnd() * 6.283, s = 3 + rnd() * 11; return { vx: Math.cos(a) * s, vz: Math.sin(a) * s, vy: 3 + rnd() * 6, y: 0.3, px: 0, pz: 0, f: 0.6 + rnd() * 0.4 }; });
    },
    tick(k, x) {
        const ki = 0.3, p = Math.min(1, k / ki), h = x.home;
        if (k < ki) {
            const sh = 0.04 + 0.3 * p * p;
            x.mesh.position.set(h.x + (rnd() - 0.5) * sh, h.y, h.z + (rnd() - 0.5) * sh); x.mesh.scale.setScalar(1 + 0.12 * p);
            x.heat.scale.setScalar(1.5 + p * 3.5 + Math.sin(k * 90) * 0.2); x.heat.material.opacity = 0.25 + p * 0.65;
            for (const s of x.leaks) { s.position.set(Math.cos(s.a) * 1.05, 0.2, Math.sin(s.a) * 1.05); s.scale.setScalar((0.3 + 1.3 * p) * (0.6 + 0.4 * Math.sin(k * 70 + s.a * 5))); s.material.opacity = p; }
            return;
        }
        if (!x.blown) {
            x.blown = true; x.mesh.visible = false;
            x.flash.visible = x.core.visible = x.ring.visible = x.dr.p.visible = true;
            for (const s of x.leaks) s.visible = false;
            for (const b of x.bars) b.grp.visible = b.gs.visible = true;
            for (const u of x.pud) u.gl.visible = u.sc.visible = true;
        }
        const q = at(k, ki, 1), t = q * 1.4, e = ease(q), dt = Math.max(0, (q - (x.lq || q)) * 1.4); x.lq = q;
        x.heat.material.opacity = Math.max(0, 1 - q * 5);
        x.flash.scale.setScalar(2.5 + e * 12); x.flash.material.opacity = Math.max(0, 1 - q * 5);
        x.core.scale.setScalar(1.5 + e * 5); x.core.material.opacity = Math.max(0, 1 - q * 4); x.core.material.color.setRGB(1, 0.85 - q * 0.6, 0.4 - q * 0.3);
        x.ring.scale.setScalar(1 + e * 15); x.ringM.opacity = Math.max(0, 0.9 - q * 1.4);
        // iron cools from white-yellow to orange to a dull red and then fades
        const c = q < 0.35 ? [1, 0.95 - q * 1.57, 0.55 - q * 1.43] : [1 - (q - 0.35) * 1.4, 0.4 - (q - 0.35) * 0.65, 0.05 - (q - 0.35) * 0.04];
        x.hot.color.setRGB(c[0], c[1], c[2]);
        const fade = 1 - at(q, 0.78, 1); x.iron.opacity = x.hot.opacity = fade; x.bgm.opacity = Math.max(0, 0.9 - q * 1.3);
        for (const b of x.bars) {
            const d = b.v * (1 - Math.exp(-2.4 * t)) / 2.4, yaw = b.yaw + b.w * (1 - Math.exp(-2.6 * t)) / 2.6;
            const px = Math.cos(b.a) * d, pz = Math.sin(b.a) * d, py = 0.08 + Math.abs(Math.sin(t * 9)) * b.vy * Math.exp(-t * 3.5);
            b.grp.position.set(px, py, pz); b.grp.rotation.y = yaw; b.inner.rotation.x = b.tum * Math.exp(-3.5 * t);
            b.gs.position.set(px + Math.cos(yaw) * b.len / 2, py + 0.1, pz - Math.sin(yaw) * b.len / 2); b.gs.scale.setScalar(0.9 * (1 - q * 0.8));
        }
        // molten puddle: spreads fast then creeps, glows white to orange to dull red, leaves a dark scorch
        const sp = 0.5 + 3.4 * ease(at(q, 0, 0.4)) + 0.8 * at(q, 0.4, 1);
        x.gm.color.setRGB(1, 0.85 - q * 0.65, Math.max(0.02, 0.35 - q * 0.33)); x.gm.opacity = Math.min(1, q * 8) * (1 - at(q, 0.7, 1));
        x.sm.opacity = 0.7 * at(q, 0.08, 0.4) * (1 - at(q, 0.85, 1));
        for (const u of x.pud) {
            u.gl.position.set(u.gx * sp / 3.5, 0.05, u.gz * sp / 3.5); u.gl.scale.setScalar(u.s * sp * 2.4);
            u.sc.position.set(u.gx * sp / 3.5, 0.02, u.gz * sp / 3.5); u.sc.scale.setScalar(u.s * sp * 2.3);
        }
        // molten droplets thrown out, bouncing and cooling
        const { pos, col } = x.dr;
        for (let i = 0; i < NP; i++) {
            const d = x.dv[i];
            d.vy -= 26 * dt; d.y += d.vy * dt;
            if (d.y < 0.05) { d.y = 0.05; d.vy = Math.abs(d.vy) > 1.5 ? -d.vy * 0.35 : 0; d.vx *= 0.6; d.vz *= 0.6; }
            d.px += d.vx * dt; d.pz += d.vz * dt;
            pos[i * 3] = d.px; pos[i * 3 + 1] = d.y; pos[i * 3 + 2] = d.pz;
            const f = Math.max(0, 1 - q * 0.95) * d.f * (0.8 + rnd() * 0.2);
            col[i * 3] = f; col[i * 3 + 1] = f * (0.65 - q * 0.4); col[i * 3 + 2] = f * 0.12;
        }
        x.dr.geo.attributes.position.needsUpdate = x.dr.geo.attributes.color.needsUpdate = true;
    },
    end: cleanup,
};

const NPET = 8, NSP = 110, NEM = 36;
// a leaf-shaped iron petal lying flat on x/z, base at the origin
function leaf(T, L, w, depth) {
    const s = new T.Shape(); s.moveTo(0, 0); s.bezierCurveTo(L * 0.3, w * 0.65, L * 0.75, w * 0.45, L, 0); s.bezierCurveTo(L * 0.75, -w * 0.45, L * 0.3, -w * 0.65, 0, 0);
    const g = depth ? new T.ExtrudeGeometry(s, { depth, bevelEnabled: false }) : new T.ShapeGeometry(s);
    g.rotateX(-Math.PI / 2); return g;
}
const nat20 = {
    key: 'n02-cage-bloom', name: 'Cage Bloom', impact: 0.9, dur: 2.4,
    blurb: 'The cage opens like an iron flower, its petals swinging out to free a golden fire spirit that swells, rises and dissolves into sparks.',
    start(x) {
        const T = x.THREE; mk(x);
        x.aura = spr(x, 0xffb020); x.aura.scale.setScalar(0.1);
        x.rays1 = spr(x, 0xffd860, 'rays'); x.rays2 = spr(x, 0xff9a20, 'rays'); x.core = spr(x, 0xfff4c8); x.flash = spr(x, 0xffffff);
        x.rays1.visible = x.rays2.visible = x.core.visible = x.flash.visible = false;
        x.r1 = addMat(x, 'ring', 0xffd860); x.r2 = addMat(x, 'ring', 0xffa030);
        x.ring1 = flat(x, 'ring', x.r1, 0.05); x.ring2 = flat(x, 'ring', x.r2, 0.05); x.ring1.visible = x.ring2.visible = false;
        // the cage: 8 leaf petals and 8 thin bars standing on a ring, which swing outward
        x.fl = new T.Group(); x.g.add(x.fl);
        x.iron = M(x, new T.MeshBasicMaterial({ color: 0x241d19, transparent: true }));
        x.glow = M(x, new T.MeshBasicMaterial({ color: 0xff9020, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
        const petG = G(x, leaf(T, 2.3, 0.9, 0.08)), inG = G(x, leaf(T, 1.7, 0.3, 0)), barG = G(x, new T.BoxGeometry(1.5, 0.08, 0.1)), tipG = G(x, new T.BoxGeometry(0.28, 0.1, 0.12));
        x.pet = [];
        for (let i = 0; i < NPET * 2; i++) {
            const sep = i % 2, yaw = new T.Group(), piv = new T.Group();
            yaw.rotation.y = (Math.floor(i / 2) + sep * 0.5) * (6.283 / NPET); piv.position.x = 0.85; piv.rotation.z = 1.5708;
            if (!sep) {
                piv.add(new T.Mesh(petG, x.iron)); const m = new T.Mesh(inG, x.glow); m.position.set(0.25, 0.09, 0); piv.add(m);
            } else {
                const b = new T.Mesh(barG, x.iron); b.position.x = 0.75; piv.add(b); const t = new T.Mesh(tipG, x.glow); t.position.set(1.45, 0.06, 0); piv.add(t);
            }
            yaw.add(piv); x.fl.add(yaw); x.pet.push({ piv, sep, d: sep ? 0.05 : (i / 2 % 2) * 0.03 });
        }
        x.em = pts(x, NEM, 8); x.sp = pts(x, NSP, 7);
        x.em.ph = Array.from({ length: NEM }, (_, i) => ({ a: (i / NEM) * 6.283, w: 2.2 + (i % 5) * 0.35, r: 0.8 + rnd() * 0.4, ph: rnd() * 6 }));
        x.sp.d = Array.from({ length: NSP }, () => ({ a: rnd() * 6.283, r0: rnd(), v: 2 + rnd() * 5, bt: 0.55 + rnd() * 0.45, life: 0.6 + rnd() * 0.5, sw: (rnd() - 0.5) * 3 }));
    },
    tick(k, x) {
        const ki = 0.375, p = Math.min(1, k / ki), h = x.home, dur = 2.4;
        if (k < ki) {
            const sh = 0.07 * p;
            x.mesh.position.set(h.x + (rnd() - 0.5) * sh, h.y, h.z + (rnd() - 0.5) * sh); x.mesh.scale.setScalar(1 + 0.25 * p * p);
            x.aura.scale.setScalar(1.5 + p * 3 + Math.sin(k * 50) * 0.15); x.aura.material.opacity = 0.2 + p * 0.6;
            for (let i = 0; i < x.pet.length; i++) x.pet[i].piv.rotation.z = 1.5708 - 0.15 * p - 0.05 * p * Math.sin(k * 80 + i);
            x.glow.opacity = 0.15 + p * 0.3;
            return;
        }
        if (!x.lit) {
            x.lit = true; x.mesh.visible = false;
            x.rays1.visible = x.rays2.visible = x.core.visible = x.flash.visible = x.ring1.visible = x.ring2.visible = x.em.p.visible = x.sp.p.visible = true;
        }
        const t = (k - ki) * dur, fade = 1 - at(k, 0.66, 0.96), e = ease(at(k, ki, 0.85));
        const s = 0.6 + 3.2 * e + at(k, 0.85, 1);
        // petals swing open with a little overshoot, then slowly turn and fade
        for (const q of x.pet) {
            const o = back(at(k, ki + q.d, ki + q.d + 0.2)), fin = q.sep ? 0.55 : 0.14;
            q.piv.rotation.z = Math.max(0.02, 1.5708 + (fin - 1.5708) * o);
        }
        x.fl.rotation.y = 0.6 * t; x.iron.opacity = 1 - at(k, 0.75, 1); x.glow.opacity = (0.35 + 0.35 * at(k, ki, ki + 0.15)) * (1 - at(k, 0.75, 1));
        x.glow.color.setRGB(1, 0.4 + 0.25 * at(k, ki, 0.6), 0.05 + 0.1 * at(k, ki, 0.6));
        x.flash.scale.setScalar(3 + e * 10); x.flash.material.opacity = 1 - at(k, ki, ki + 0.14);
        x.aura.scale.setScalar(s * 3.8); x.aura.material.opacity = 0.4 * (1 - at(k, 0.72, 1));
        x.core.scale.setScalar(s * 1.1); x.core.material.opacity = fade; x.core.material.color.setRGB(1, 0.96 - 0.1 * Math.sin(t * 9), 0.78 + 0.1 * Math.sin(t * 7));
        x.rays1.scale.setScalar(s * 3.2); x.rays1.material.rotation = t * 1.1; x.rays1.material.opacity = 0.85 * fade;
        x.rays2.scale.setScalar(s * 2.2); x.rays2.material.rotation = -t * 1.7; x.rays2.material.opacity = 0.7 * fade;
        const r1 = ease(at(k, ki, 0.7)), r2 = ease(at(k, ki + 0.05, 0.75));
        x.ring1.scale.setScalar(1 + r1 * 14); x.r1.opacity = Math.max(0, 0.9 - at(k, ki, 0.7) * 1.1);
        x.ring2.scale.setScalar(1 + r2 * 9); x.r2.opacity = Math.max(0, 0.7 - at(k, ki + 0.05, 0.75));
        // orbiting embers
        const { pos, col } = x.em;
        for (let i = 0; i < NEM; i++) {
            const o = x.em.ph[i], a = o.a + t * o.w, r = (0.5 + s * 0.55) * (o.r + 0.2 * Math.sin(t * 3 + o.ph));
            pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = 0.6 + Math.sin(a * 2) * 0.2; pos[i * 3 + 2] = Math.sin(a) * r * 0.85;
            const f = fade * (0.7 + 0.3 * Math.sin(t * 12 + o.ph)); col[i * 3] = f; col[i * 3 + 1] = f * 0.7; col[i * 3 + 2] = f * 0.2;
        }
        x.em.geo.attributes.position.needsUpdate = x.em.geo.attributes.color.needsUpdate = true;
        // the spirit dissolves into golden sparks that drift out in a swirl
        const sp = x.sp;
        for (let i = 0; i < NSP; i++) {
            const d = sp.d[i], tt = t - d.bt, j = i * 3;
            if (tt < 0 || tt > d.life) { sp.col[j] = sp.col[j + 1] = sp.col[j + 2] = 0; continue; }
            const dist = d.r0 * 1.2 + d.v * (1 - Math.exp(-2.2 * tt)) / 2.2, a = d.a + d.sw * tt * 0.4, f = (1 - tt / d.life) ** 1.2;
            sp.pos[j] = Math.cos(a) * dist; sp.pos[j + 1] = 0.6 + tt * 1.5; sp.pos[j + 2] = Math.sin(a) * dist;
            sp.col[j] = f; sp.col[j + 1] = f * (0.78 + 0.2 * (1 - tt / d.life)); sp.col[j + 2] = f * (0.3 + 0.4 * (1 - tt / d.life));
        }
        sp.geo.attributes.position.needsUpdate = sp.geo.attributes.color.needsUpdate = true;
    },
    end: cleanup,
};

export default { nat1, nat20 };
