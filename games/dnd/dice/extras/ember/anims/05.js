// Ember Cage exits, THE FORGE: nat 1 a giant smith's hammer slams the die flat; nat 20 the die is reforged under three hammer strikes into polished gold.
let TX;
function tex(T) {
    if (TX) return TX;
    const mk = (w, h, fn) => { const c = document.createElement('canvas'); c.width = w; c.height = h; fn(c.getContext('2d'), w, h); return new T.CanvasTexture(c); };
    const soft = mk(64, 64, (g) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,.55)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); });
    const ring = mk(128, 128, (g) => { const r = g.createRadialGradient(64, 64, 40, 64, 64, 64); r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(0.7, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128); });
    const streak = mk(64, 16, (g) => { const r = g.createLinearGradient(0, 0, 64, 0); r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(0.5, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 16);
        const v = g.createLinearGradient(0, 0, 0, 16); v.addColorStop(0, 'rgba(0,0,0,1)'); v.addColorStop(0.5, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,1)'); g.globalCompositeOperation = 'destination-out'; g.fillStyle = v; g.fillRect(0, 0, 64, 16); });
    const star = mk(128, 128, (g) => { g.translate(64, 64); const r = g.createRadialGradient(0, 0, 0, 0, 0, 64); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r;
        for (let i = 0; i < 4; i++) { g.rotate(Math.PI / 4); g.beginPath(); g.moveTo(-64, 0); g.lineTo(0, -4); g.lineTo(64, 0); g.lineTo(0, 4); g.fill(); } });
    return (TX = { soft, ring, streak, star, plane: new T.PlaneGeometry(1, 1) });
}
const ease = (k) => 1 - (1 - k) ** 3;
const at = (t, a, b) => Math.max(0, Math.min(1, (t - a) / (b - a)));
const lerp = (a, b, k) => a + (b - a) * k;

// everything added goes through add() so end() can remove and dispose it
const add = (x, o) => { x.scene.add(o); x.own.push(o); return o; };
const glow = (x, color, y = 2.2) => { const s = add(x, new x.THREE.Sprite(new x.THREE.SpriteMaterial({ map: tex(x.THREE).soft, color, transparent: true, depthWrite: false, blending: x.THREE.AdditiveBlending }))); s.position.set(x.home.x, y, x.home.z); return s; };
const flat = (x, map, color, y) => { const m = add(x, new x.THREE.Mesh(tex(x.THREE).plane, new x.THREE.MeshBasicMaterial({ map, color, transparent: true, depthWrite: false, blending: x.THREE.AdditiveBlending }))); m.rotation.x = -Math.PI / 2; m.position.set(x.home.x, y, x.home.z); return m; };
// scale along the WORLD axes (a local scale would squash the die sideways once it lies tilted): matrix = S * R, then position
const place = (x, px, py, pz, sx, sy, sz) => { const m = x.mesh; m.matrixAutoUpdate = false; x.M.makeRotationFromQuaternion(m.quaternion); x.S.makeScale(x.base.x * sx, x.base.y * sy, x.base.z * sz); x.M.premultiply(x.S); x.M.setPosition(px, py, pz); m.matrix.copy(x.M); m.matrixWorldNeedsUpdate = true; };
const begin = (x) => { x.M = new x.THREE.Matrix4(); x.S = new x.THREE.Matrix4(); x.own = []; x.geos = []; x.home = x.mesh.position.clone(); x.base = x.mesh.scale.clone(); x.last = 0; tex(x.THREE); };
const finish = (x) => {
    for (const o of x.own || []) {
        x.scene.remove(o);
        if (o.isGroup) o.traverse((c) => { if (c.material) c.material.dispose(); });
        else if (o.material) o.material.dispose();
        if (o.isPoints) o.geometry.dispose();
    }
    for (const g of x.geos || []) g.dispose();
    x.own = []; x.geos = []; if (x.base) x.mesh.scale.copy(x.base); x.mesh.matrixAutoUpdate = true;
};

// pooled spark system: emit() on events, update() each frame, no allocations
function sparks(x, n, size, gold) {
    const T = x.THREE, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), vel = new Float32Array(n * 3), life = new Float32Array(n), max = new Float32Array(n);
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.setAttribute('color', new T.BufferAttribute(col, 3));
    const p = add(x, new T.Points(geo, new T.PointsMaterial({ map: tex(T).soft, size, vertexColors: true, sizeAttenuation: false, transparent: true, depthWrite: false, blending: T.AdditiveBlending })));
    p.frustumCulled = false; for (let i = 0; i < n; i++) pos[i * 3 + 1] = -50;
    let head = 0;
    p.emit = (ox, oy, oz, cnt, speed, a0, arc, up) => {
        for (let c = 0; c < cnt; c++) {
            const i = head++ % n, a = a0 + Math.random() * arc, s = speed * (0.35 + Math.random() * 0.8);
            pos[i * 3] = ox; pos[i * 3 + 1] = oy; pos[i * 3 + 2] = oz;
            vel[i * 3] = Math.cos(a) * s; vel[i * 3 + 1] = up * (0.4 + Math.random()); vel[i * 3 + 2] = Math.sin(a) * s;
            life[i] = max[i] = 0.5 + Math.random() * 0.9;
        }
    };
    p.update = (dt) => {
        for (let i = 0; i < n; i++) {
            if (life[i] <= 0) continue;
            life[i] -= dt; const j = i * 3;
            if (life[i] <= 0) { col[j] = col[j + 1] = col[j + 2] = 0; pos[j + 1] = -50; continue; }
            vel[j + 1] -= 16 * dt; pos[j] += vel[j] * dt; pos[j + 1] += vel[j + 1] * dt; pos[j + 2] += vel[j + 2] * dt;
            if (pos[j + 1] < 0.2 && vel[j + 1] < 0) { pos[j + 1] = 0.2; vel[j + 1] *= -0.35; vel[j] *= 0.7; vel[j + 2] *= 0.7; }
            const f = 1 - life[i] / max[i], m = 1 - f * f;
            col[j] = m; col[j + 1] = m * (gold ? 0.9 - f * 0.4 : 0.95 - f * 0.75); col[j + 2] = m * Math.max(0, (gold ? 0.7 : 0.55) * (1 - f * 1.8));
        }
        geo.attributes.position.needsUpdate = geo.attributes.color.needsUpdate = true;
    };
    return p;
}
// seconds since last tick, derived from k so stretched test time still looks right
const step = (x, k, dur) => { const dt = Math.max(0, (k - x.last) * dur); x.last = k; return Math.min(dt, 0.1); };

function hammer(x) {
    const T = x.THREE, g = new T.Group();
    const iron = new T.MeshStandardMaterial({ color: 0x4a4a54, metalness: 0.7, roughness: 0.45 });
    const wood = new T.MeshStandardMaterial({ color: 0x3a2314, metalness: 0.1, roughness: 0.8 });
    x.hotMat = new T.MeshStandardMaterial({ color: 0x401000, emissive: 0xff5a10, emissiveIntensity: 0.4, metalness: 0.3, roughness: 0.5 });
    const part = (geo, mat, px, py, pz, rz = 0) => { const m = new T.Mesh(geo, mat); m.position.set(px, py, pz); m.rotation.z = rz; g.add(m); x.geos.push(geo); return m; };
    part(new T.BoxGeometry(2, 1.5, 3), iron, 0, 0, 0);                              // head
    part(new T.BoxGeometry(2.1, 0.12, 3.1), iron, 0, 0.5, 0);                       // dark band on top
    part(new T.BoxGeometry(1.7, 0.25, 2.6), x.hotMat, 0, -0.85, 0);                 // glowing striking face, underneath
    part(new T.BoxGeometry(1.3, 1.1, 0.5), iron, 0, 0, 1.7);                        // flared ends
    part(new T.BoxGeometry(1.3, 1.1, 0.5), iron, 0, 0, -1.7);
    part(new T.CylinderGeometry(0.28, 0.2, 8, 10), wood, 5, 0.05, 0, Math.PI / 2);  // handle
    part(new T.CylinderGeometry(0.32, 0.32, 0.5, 10), iron, 1.4, 0.05, 0, Math.PI / 2);
    part(new T.CylinderGeometry(0.36, 0.36, 0.7, 10), iron, 8.9, 0.05, 0, Math.PI / 2);
    x.scene.add(g); x.own.push(g); g.visible = false; return g;
}

export default {
    nat1: {
        key: 'n05-forge-slam', name: 'Forge Slam', dur: 2.2, impact: 0.85,
        blurb: "A giant smith's hammer swings in, winds up and slams the die flat, then the glowing disc cools to dark iron.",
        start(x) {
            begin(x); const T = x.THREE;
            x.ham = hammer(x);
            x.sp = sparks(x, 220, 7, false);
            x.aura = glow(x, 0xff6a10); x.aura.material.opacity = 0; x.aura.scale.setScalar(3);
            x.flash = glow(x, 0xfff0c0, 3); x.flash.material.opacity = 0;
            x.disc = flat(x, tex(T).soft, 0xffe0a0, 0.45); x.disc.material.opacity = 0; x.disc.scale.setScalar(4);
            x.dark = add(x, new T.Mesh(tex(T).plane, new T.MeshBasicMaterial({ map: tex(T).soft, color: 0x120e0c, transparent: true, depthWrite: false })));
            x.dark.rotation.x = -Math.PI / 2; x.dark.position.set(x.home.x, 0.4, x.home.z); x.dark.scale.setScalar(3.6); x.dark.material.opacity = 0;
            x.ring = flat(x, tex(T).ring, 0xffa040, 0.1); x.ring.material.opacity = 0;
            x.hit = false;
        },
        tick(k, x) {
            const D = 2.2, t = k * D, dt = step(x, k, D), I = 0.85, h = x.home, g = x.ham;
            // hammer path: swing in from the right, wind up, slam
            g.visible = t < 1.7;
            const enter = ease(at(t, 0, 0.5)), wind = ease(at(t, 0.5, 0.68)), slam = at(t, 0.68, I), sl = slam * slam * slam, out = ease(at(t, 1.0, 1.7));
            const px = lerp(lerp(lerp(10, 4, enter), 4.6, wind), 0, sl) + out * 12;
            const py = lerp(lerp(lerp(8, 9, enter), 13, wind), 1.35, sl) + out * 6;
            g.position.set(h.x + px, py, h.z - (1 - enter) * 3 * (1 - sl));
            g.rotation.set(0, lerp(lerp(0.9, 0.5, enter) + wind * 0.15, 0, sl), lerp(0.1, 0.5, wind) * (1 - sl) - out * 0.4);
            g.scale.setScalar(lerp(lerp(1.1, 1.35, enter) + wind * 0.2, 1, sl) + out * 0.3);
            // face heats as it comes down
            x.hotMat.emissiveIntensity = Math.max(0.2, 0.4 + wind * 1.0 + sl * 1.8 - out * 1.8);
            x.aura.material.opacity = 0.35 * (wind + sl) * (1 - out); x.aura.position.set(g.position.x, g.position.y + 2.5, g.position.z); x.aura.scale.setScalar(3 + wind * 2);
            if (t >= I && !x.hit) {
                x.hit = true;
                x.sp.emit(h.x, 0.8, h.z, 130, 13, 0, 6.283, 7); x.sp.emit(h.x, 0.8, h.z, 60, 6, 0, 6.283, 14);
            }
            const a = at(t, I, I + 0.9), cool = at(t, I + 0.2, 1.7), die = at(t, 1.65, 2.15);
            if (t >= I) {
                const j = Math.exp(-(t - I) * 22) * Math.sin((t - I) * 70);          // impact wobble
                const sp = 1 + 0.95 * ease(at(t, I, I + 0.07)) + j * 0.1, sy = 0.1 + Math.max(0, j) * 0.12;
                place(x, h.x, 0.15, h.z, sp * (1 - die), sy, sp * (1 - die));
                x.flash.scale.setScalar(2 + ease(at(t, I, I + 0.25)) * 7); x.flash.material.opacity = Math.max(0, 1 - at(t, I, I + 0.3));
                x.ring.scale.setScalar(2 + ease(at(t, I, I + 0.8)) * 13); x.ring.material.opacity = 0.9 * (1 - at(t, I, I + 0.8));
                // cooling disc: white-yellow, orange, deep red, then dark iron
                x.disc.material.color.setRGB(lerp(1, 0.55, cool), lerp(0.88, 0.1, Math.sqrt(cool)), lerp(0.6, 0.02, Math.sqrt(cool)));
                x.disc.material.opacity = (1 - cool * 0.9) * (1 - die); x.disc.scale.setScalar(3.6 + a * 0.6);
                x.dark.material.opacity = cool * 0.7 * (1 - die);
                x.aura.material.opacity = Math.max(x.aura.material.opacity, 0.5 * (1 - cool)) * (1 - die);
                x.aura.position.set(h.x, 2.2, h.z); x.aura.scale.setScalar(5 * (1 - cool * 0.5));
                // a few late embers pop off the cooling metal
                if (dt > 0 && Math.random() < 0.25 * (1 - cool) && t < 1.6) x.sp.emit(h.x + (Math.random() - 0.5) * 2, 0.6, h.z + (Math.random() - 0.5) * 2, 2, 2, 0, 6.283, 4);
            }
            x.sp.update(dt);
        },
        end: finish,
    },
    nat20: {
        key: 'n05-reforged', name: 'Reforged in Gold', dur: 2.6, impact: 1.5,
        blurb: 'The die glows white-hot on an unseen anvil, takes three hammer strikes, then turns to polished gold and shines away.',
        start(x) {
            begin(x); const T = x.THREE;
            x.sp = sparks(x, 260, 6, false); x.gs = sparks(x, 120, 8, true);
            x.heat = glow(x, 0xff5010); x.heat.scale.setScalar(2.5); x.heat.material.opacity = 0;
            x.white = glow(x, 0xfff4d8, 2.6); x.white.material.opacity = 0;
            x.bloom = glow(x, 0xffd860, 3); x.bloom.material.opacity = 0;
            x.anvil = flat(x, tex(T).ring, 0xff7a20, 0.08); x.anvil.material.opacity = 0; x.anvil.scale.setScalar(3.2);
            x.shock = flat(x, tex(T).ring, 0xffd860, 0.1); x.shock.material.opacity = 0;
            x.gold = add(x, new T.Mesh(x.mesh.geometry, new T.MeshStandardMaterial({ color: 0xffc23a, metalness: 0.95, roughness: 0.22, emissive: 0x8a5410, emissiveIntensity: 0.9, transparent: true, opacity: 0, polygonOffset: true, polygonOffsetFactor: -1 })));
            x.star = add(x, new T.Mesh(tex(T).plane, new T.MeshBasicMaterial({ map: tex(T).star, color: 0xffe9a0, transparent: true, depthWrite: false, blending: T.AdditiveBlending })));
            x.star.rotation.x = -Math.PI / 2; x.star.position.set(x.home.x, 3.4, x.home.z); x.star.material.opacity = 0;
            x.sweeps = [0, 1].map(() => { const m = flat(x, tex(T).streak, 0xfff0b0, 3.2); m.material.opacity = 0; return m; });
            x.v1 = new T.Vector3(1.015, 1.015, 1.015); x.UP = new T.Vector3(0, 1, 0); x.q = new T.Quaternion();
            x.strikes = [{ t: 0.45, p: 0.6, a: 0.6 }, { t: 0.85, p: 0.8, a: 2.7 }, { t: 1.25, p: 1, a: 4.9 }];
            x.flashes = []; x.spin = 0; x.boomed = false;
            for (let i = 0; i < 3; i++) { const f = glow(x, 0xfff0b0, 3); f.material.opacity = 0; x.flashes.push(f); }
        },
        tick(k, x) {
            const D = 2.6, t = k * D, dt = step(x, k, D), I = 1.5, h = x.home;
            const heat = ease(at(t, 0, I)), shine = at(t, I, I + 0.5);
            // spin on the anvil, faster as it heats
            x.spin += dt * (3 + heat * 14);
            x.q.setFromAxisAngle(x.UP, x.spin); x.mesh.quaternion.premultiply(x.q);
            // jolt on each strike
            let jolt = 0;
            for (let i = 0; i < 3; i++) {
                const s = x.strikes[i], d = t - s.t;
                if (d >= 0 && !s.done) {
                    s.done = true; const ox = h.x + Math.cos(s.a) * 1.1, oz = h.z + Math.sin(s.a) * 1.1;
                    x.sp.emit(ox, 1.1, oz, 55 + i * 25, 7 + i * 2, s.a - 0.9, 1.8, 6 + i * 2);
                }
                if (d >= 0) {
                    jolt = Math.max(jolt, Math.exp(-d * 14) * s.p);
                    const f = x.flashes[i]; f.position.set(h.x + Math.cos(s.a) * 1.2, 3, h.z + Math.sin(s.a) * 1.2);
                    f.scale.setScalar(1 + s.p * 2.8 * ease(at(d, 0, 0.12))); f.material.opacity = Math.max(0, 1 - d * 6);
                }
            }
            const squash = jolt * 0.14, sc = 1 + heat * 0.08 + (t > I ? 0.12 * Math.sin(Math.PI * shine) : 0);
            const vanish = 1 - ease(at(t, 2.15, 2.5));
            place(x, h.x, h.y + 0.25 * heat - jolt * 0.2, h.z, sc * (1 + squash) * vanish, sc * (1 - squash * 1.6) * vanish, sc * (1 + squash) * vanish);
            // anvil glow and heat overlays
            x.anvil.material.opacity = 0.6 * heat * (1 - shine); x.anvil.scale.setScalar(3.2 + jolt * 0.8);
            const hot = at(t, 0, I);
            x.heat.material.color.setRGB(1, 0.3 + hot * 0.65, 0.06 + hot * 0.6);
            x.heat.scale.setScalar((2.6 + heat * 1.8 + jolt) * (1 + shine * 0.6)); x.heat.material.opacity = Math.min(1, heat * 1.1) * (1 - at(t, I + 0.05, I + 0.45) * 0.92);
            x.white.scale.setScalar(2.1 + heat * 0.5); x.white.material.opacity = 0.55 * hot * hot * (1 - shine);
            // transformation: flash, gold copy in, shockwave, gold sparks
            if (t >= I && !x.boomed) { x.boomed = true; x.gs.emit(h.x, 1.2, h.z, 110, 10, 0, 6.283, 9); x.gs.emit(h.x, 1.2, h.z, 10, 3, 0, 6.283, 14); }
            const gold = x.gold;
            gold.visible = t >= I - 0.05; gold.matrixAutoUpdate = false; gold.matrix.copy(x.mesh.matrix); gold.matrix.scale(x.v1); gold.matrixWorldNeedsUpdate = true;
            gold.material.opacity = at(t, I, I + 0.18) * (1 - at(t, 2.3, 2.5));
            gold.material.emissiveIntensity = lerp(1.6, 0.55, at(t, I, I + 0.9));
            if (t >= I) {
                const f = at(t, I, I + 0.5), st = at(t, I, 2.5);
                x.bloom.scale.setScalar(2 + ease(f) * 6 - at(t, 2.2, 2.6) * 3); x.bloom.material.opacity = Math.max(0, 1 - at(t, I + 0.05, I + 0.5)) + 0.2 * Math.sin(Math.PI * at(t, I + 0.3, 2.6));
                x.shock.scale.setScalar(2 + ease(at(t, I, I + 0.9)) * 14); x.shock.material.opacity = 0.9 * (1 - at(t, I, I + 0.9));
                x.star.scale.setScalar(1 + ease(st) * 9); x.star.rotation.z = st * 1.8;
                x.star.material.opacity = (st < 0.12 ? st / 0.12 : 1 - at(st, 0.12, 0.7)) * 0.55;
                // two polished-shine sweeps across the gold die
                for (let i = 0; i < 2; i++) {
                    const s = at(t, I + 0.12 + i * 0.28, I + 0.62 + i * 0.28), m = x.sweeps[i];
                    m.position.set(h.x + (s - 0.5) * 4.4, 3.2, h.z); m.rotation.z = 0.7; m.scale.set(2.8 - i * 0.6, 0.9, 1);
                    m.material.opacity = Math.sin(Math.PI * s) * (1 - at(t, 2.2, 2.4)); m.visible = s > 0 && s < 1;
                }
            }
            x.sp.update(dt); x.gs.update(dt);
        },
        end: finish,
    },
};
