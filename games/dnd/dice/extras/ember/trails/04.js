// Ember Cage molten-metal trails: splats of liquid iron that cool to grey, and a leaking glowing ribbon.
let S = null;
function shared(THREE) {
    if (S) return S;
    const tex = [];
    for (let v = 0; v < 4; v++) {
        const c = document.createElement('canvas'); c.width = c.height = 64;
        const g = c.getContext('2d'), r = (function (s) { return () => (s = (s * 16807) % 2147483647) / 2147483647; })(v * 97 + 13);
        g.translate(32, 32);
        const blob = (R, a) => {
            g.beginPath(); const n = 11;
            for (let i = 0; i <= n; i++) {
                const an = i / n * 6.2832, rr = R * (0.6 + r() * 0.5) * (v === 1 ? 1 + 0.6 * Math.cos(an * 2) : 1);
                const x = Math.cos(an) * rr, y = Math.sin(an) * rr;
                i ? g.lineTo(x, y) : g.moveTo(x, y);
            }
            g.closePath(); g.fillStyle = a; g.fill();
        };
        g.filter = 'blur(2px)';
        blob(17, 'rgba(255,255,255,0.55)'); blob(13, '#fff');
        for (let i = 0; i < 3; i++) { g.save(); g.rotate(r() * 6); g.translate(14 + r() * 8, 0); g.scale(1, 0.5); g.beginPath(); g.arc(0, 0, 3 + r() * 3, 0, 6.3); g.fill(); g.restore(); }
        const t = new THREE.CanvasTexture(c); tex.push(t);
    }
    S = { tex, geo: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), col: new THREE.Color() };
    return S;
}
// heat 1 = white-orange, 0.5 = red, 0 = grey metal
function heatColor(c, h) {
    if (h > 0.5) { const k = (h - 0.5) * 2; c.setRGB(1, 0.2 + 0.5 * k, 0.02 + 0.3 * k * k); c.multiplyScalar(0.75 + 0.35 * k); }
    else { const k = h * 2; c.setRGB(0.3 + 0.5 * k, 0.28 - 0.2 * k, 0.28 - 0.22 * k); }
    return c;
}

const splats = {
    key: 't04-molten-splats', name: 'Molten Splats', blurb: 'Blobs of liquid iron fall off the die, glow white-hot, cool to red and grey, then fade.',
    make(ctx) {
        const { THREE, scene, rnd } = ctx, s = shared(THREE), R = rnd(7), N = 60;
        const marks = [];
        for (let i = 0; i < N; i++) {
            const m = new THREE.Mesh(s.geo, new THREE.MeshBasicMaterial({ map: s.tex[i & 3], transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
            m.visible = false; scene.add(m); marks.push({ m, age: 99, life: 3.5, size: 1 });
        }
        let head = 0, lx = null, lz = null, acc = 0;
        return {
            tick(sec, dt, body) {
                const p = body.position;
                if (ctx.mesh.visible && p.y < 3.5) {
                    if (lx === null) { lx = p.x; lz = p.z; }
                    acc += Math.hypot(p.x - lx, p.z - lz); lx = p.x; lz = p.z;
                    if (acc > 0.5) {
                        acc = 0;
                        const k = marks[head++ % N], a = R() * 6.28, off = R() * 0.5, big = R() < 0.2;
                        k.age = 0; k.life = 3 + R(); k.size = (big ? 1.5 : 0.7) + R() * 0.6;
                        k.m.position.set(p.x + Math.cos(a) * off, 0.01 + (head % 7) * 0.008, p.z + Math.sin(a) * off);
                        k.m.rotation.y = R() * 6.28; k.m.scale.set(k.size, 1, k.size * (0.7 + R() * 0.5));
                        k.m.visible = true;
                    }
                }
                for (const k of marks) {
                    if (!k.m.visible) continue;
                    k.age += dt; const u = k.age / k.life;
                    if (u >= 1) { k.m.visible = false; continue; }
                    const mt = k.m.material, hot = u < 0.6;
                    mt.blending = hot ? THREE.AdditiveBlending : THREE.NormalBlending;
                    const heat = Math.max(0, 1 - u * 1.0);
                    heatColor(mt.color, heat);
                    mt.opacity = hot ? 1 : Math.min(1, (1 - u) * 1.6) * 0.85;
                    if (k.age < 0.15) k.m.scale.x = k.size * (0.5 + k.age * 3.3); // spreads on landing
                }
            },
            dispose() { for (const k of marks) { scene.remove(k.m); k.m.material.dispose(); } },
        };
    },
};

const ribbon = {
    key: 't04-leaking-core', name: 'Leaking Core', blurb: 'A smeared ribbon of liquid metal streams from the die and cools from the tail.',
    make(ctx) {
        const { THREE, scene } = ctx, N = 56, col = new THREE.Color();
        const px = new Float32Array(N), pz = new Float32Array(N), pt = new Float32Array(N);
        const pos = new Float32Array(N * 6), cl = new Float32Array(N * 8), idx = [];
        for (let i = 0; i < N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
        geo.setAttribute('color', new THREE.BufferAttribute(cl, 4).setUsage(THREE.DynamicDrawUsage));
        geo.setIndex(idx); geo.drawRange.count = 0;
        const mk = (bl) => { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: bl, side: THREE.DoubleSide })); m.frustumCulled = false; m.position.y = bl === THREE.AdditiveBlending ? 0.03 : 0.02; scene.add(m); return m; };
        const base = mk(THREE.NormalBlending), glow = mk(THREE.AdditiveBlending); glow.material.opacity = 0.45;
        let n = 0, head = 0, T = 0, lx = null, lz = null;
        const LIFE = 3.5;
        return {
            tick(sec, dt, body) {
                T += dt; const p = body.position;
                if (ctx.mesh.visible && p.y < 1.6) {
                    if (lx === null || Math.hypot(p.x - lx, p.z - lz) > 0.22) { px[head] = lx = p.x; pz[head] = lz = p.z; pt[head] = T; head = (head + 1) % N; if (n < N) n++; }
                }
                // drop expired tail points
                while (n > 0 && T - pt[(head - n + N) % N] > LIFE) n--;
                if (n < 2) { geo.drawRange.count = 0; return; }
                for (let i = 0; i < n; i++) {
                    const j = (head - n + i + N) % N, a = (j + N - (i ? 1 : 0)) % N, b = (j + (i < n - 1 ? 1 : 0)) % N;
                    let dx = px[b] - px[a], dz = pz[b] - pz[a]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
                    const age = (T - pt[j]) / LIFE, w = 0.42 * (1 - age * 0.5) * (0.85 + 0.25 * Math.sin(i * 1.7 + pt[j] * 3)) * Math.min(1, (i + 1) / 4 + 0.3);
                    const heat = Math.max(0, 1 - age * 1.5);
                    heatColor(col, heat);
                    const al = Math.min(1, (1 - age) * 2) * 0.9, o = i * 6, c = i * 8;
                    pos[o] = px[j] - dz * w; pos[o + 1] = 0; pos[o + 2] = pz[j] + dx * w;
                    pos[o + 3] = px[j] + dz * w; pos[o + 4] = 0; pos[o + 5] = pz[j] - dx * w;
                    for (let v = 0; v < 2; v++) { cl[c + v * 4] = col.r; cl[c + v * 4 + 1] = col.g; cl[c + v * 4 + 2] = col.b; cl[c + v * 4 + 3] = al; }
                }
                geo.attributes.position.needsUpdate = geo.attributes.color.needsUpdate = true;
                geo.drawRange.count = (n - 1) * 6;
            },
            dispose() { scene.remove(base); scene.remove(glow); base.material.dispose(); glow.material.dispose(); geo.dispose(); },
        };
    },
};
export default [splats, ribbon];
