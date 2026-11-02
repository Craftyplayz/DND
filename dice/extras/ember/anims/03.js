// Ember Cage lava exits: nat 1 sinks into a swirling lava pool, nat 20 erupts as a lava fountain that rains golden droplets.
let FX = null;
function fx(THREE) {
    if (FX) return FX;
    const mk = (N, f) => { const c = document.createElement('canvas'); c.width = c.height = N; f(c.getContext('2d'), N); return new THREE.CanvasTexture(c); };
    const soft = mk(64, (g, N) => { const r = g.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,.6)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, N, N); });
    const ring = mk(128, (g, N) => { const r = g.createRadialGradient(N / 2, N / 2, N * 0.3, N / 2, N / 2, N / 2); r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(0.6, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, N, N); });
    return (FX = { soft, ring, plane: new THREE.PlaneGeometry(1, 1) });
}
const ease = (k) => 1 - (1 - k) ** 3;
const at = (k, a, b) => Math.max(0, Math.min(1, (k - a) / (b - a)));
const rnd = (a, b) => a + Math.random() * (b - a);

const sprite = (x, color, additive = true, y = 0) => {
    const T = x.THREE, s = new T.Sprite(new T.SpriteMaterial({ map: fx(T).soft, color, transparent: true, depthWrite: false, blending: additive ? T.AdditiveBlending : T.NormalBlending }));
    s.position.set(x.home.x, y || x.home.y + 1, x.home.z); x.scene.add(s); x.own.push(s); return s;
};
const floorRing = (x, color) => {
    const T = x.THREE, m = new T.Mesh(fx(T).plane, new T.MeshBasicMaterial({ map: fx(T).ring, color, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
    m.rotation.x = -Math.PI / 2; m.position.set(x.home.x, 0.08, x.home.z); m.scale.setScalar(0.01); x.scene.add(m); x.own.push(m); return m;
};
const cleanup = (x) => {
    for (const o of x.own || []) { x.scene.remove(o); o.material.dispose(); if (o.isPoints) o.geometry.dispose(); if (o.userData.tex) o.userData.tex.dispose(); }
    x.own = []; x.mesh.scale.setScalar(1);
};

// the animated lava disc: swirling molten blobs, a jagged glowing edge, a cracked dark crust; crust 0..1 closes the molten part over
function makePool(x) {
    const T = x.THREE, N = 160, c = document.createElement('canvas'); c.width = c.height = N;
    const tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace;
    const m = new T.Mesh(fx(T).plane, new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(x.home.x, 0.04, x.home.z); m.scale.setScalar(0.01);
    m.userData.tex = tex; m.userData.g = c.getContext('2d'); m.userData.N = N; m.userData.seed = Math.random() * 9;
    x.scene.add(m); x.own.push(m); return m;
}
function drawPool(p, sec, crust) {
    const g = p.userData.g, N = p.userData.N, h = N / 2, s = p.userData.seed, mr = h * (0.82 - 0.62 * crust);
    g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, N, N);
    g.fillStyle = '#1b0b06'; g.beginPath(); g.arc(h, h, h, 0, 7); g.fill();
    // dark crust plates, a lighter speckle
    g.fillStyle = "#3a1a0e";
    for (let i = 0; i < 12; i++) { const a = i * 0.52 + s; g.beginPath(); g.arc(h + Math.cos(a) * h * 0.8, h + Math.sin(a) * h * 0.8, h * (0.13 + 0.05 * Math.sin(i * 3 + s)), 0, 7); g.fill(); }
    // glowing cracks running out of the molten part
    g.strokeStyle = 'rgba(255,110,20,' + (0.85 - crust * 0.5) + ')'; g.lineWidth = 2; g.lineJoin = 'round';
    for (let i = 0; i < 11; i++) {
        let a = i * 0.57 + s, r = mr * 0.9; g.beginPath(); g.moveTo(h + Math.cos(a) * r, h + Math.sin(a) * r);
        while (r < h * 0.97) { r += h * 0.11; a += Math.sin(i * 7 + r * 0.2 + s) * 0.18; g.lineTo(h + Math.cos(a) * r, h + Math.sin(a) * r); }
        g.stroke();
    }
    // the molten body with a wobbling edge
    g.beginPath();
    for (let i = 0; i <= 64; i++) { const a = i / 64 * 6.2832, r = mr * (1 + 0.07 * Math.sin(a * 3 + sec * 2 + s) + 0.04 * Math.sin(a * 7 - sec * 3)); i ? g.lineTo(h + Math.cos(a) * r, h + Math.sin(a) * r) : g.moveTo(h + Math.cos(a) * r, h + Math.sin(a) * r); }
    g.closePath(); g.fillStyle = '#b32a05'; g.fill();
    g.save(); g.clip(); g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 9; i++) {
        const a = sec * (0.8 + i * 0.11) * (i % 2 ? 1 : -1) + i * 2.3, d = mr * (0.15 + 0.5 * ((i * 0.37) % 1)), bx = h + Math.cos(a) * d, by = h + Math.sin(a) * d, r = mr * (0.35 + 0.15 * Math.sin(sec * 2 + i));
        const gr = g.createRadialGradient(bx, by, 0, bx, by, r); gr.addColorStop(0, i % 3 ? 'rgba(255,170,40,.85)' : 'rgba(255,235,140,.95)'); gr.addColorStop(1, 'rgba(255,60,0,0)');
        g.fillStyle = gr; g.fillRect(0, 0, N, N);
    }
    g.restore();
    // soft outer edge
    g.globalCompositeOperation = 'destination-in';
    const e = g.createRadialGradient(h, h, h * 0.72, h, h, h); e.addColorStop(0, '#fff'); e.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = e; g.fillRect(0, 0, N, N);
    p.userData.tex.needsUpdate = true;
}

// n points with per-particle launch time; call p.update(t) (seconds), colours cool from gold to dark red as they fly and land
function drops(x, n) {
    const T = x.THREE, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), P = [];
    for (let i = 0; i < n; i++) P.push({ tl: 99, vx: 0, vz: 0, vh: 0, fl: 1 });
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.setAttribute('color', new T.BufferAttribute(col, 3));
    const pts = new T.Points(geo, new T.PointsMaterial({ map: fx(T).soft, size: 14, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
    pts.frustumCulled = false; pts.userData = {}; x.scene.add(pts); x.own.push(pts);
    pts.set = (i, tl, vx, vz, vh) => { Object.assign(P[i], { tl, vx, vz, vh, fl: 2 * vh / 14 }); };
    pts.update = (t, fade) => {
        for (let i = 0; i < n; i++) {
            const p = P[i], tt = t - p.tl, j = i * 3;
            if (tt < 0) { col[j] = col[j + 1] = col[j + 2] = 0; pos[j] = pos[j + 2] = 1e4; continue; }
            const f = Math.min(tt, p.fl), hgt = Math.max(0, p.vh * f - 7 * f * f), heat = 1 - Math.min(1, tt / (p.fl + 0.7)), a = Math.min(1, heat * 1.6 + 0.15) * fade;
            pos[j] = x.home.x + p.vx * f; pos[j + 1] = 1; pos[j + 2] = x.home.z + p.vz * f - hgt * 0.35;
            col[j] = a; col[j + 1] = a * (0.18 + 0.62 * heat); col[j + 2] = a * 0.35 * heat * heat;
        }
        geo.attributes.position.needsUpdate = geo.attributes.color.needsUpdate = true;
    };
    pts.update(-1, 0); return pts;
}

export default {
    nat1: {
        key: 'n03-lava-pool', name: 'Lava Pool Swallow', dur: 2.2, impact: 0.9,
        blurb: 'A swirling lava pool opens under the die, which wobbles, darkens and sinks in with a gloopy splash before the crust closes over.',
        start(x) {
            x.own = []; x.home = x.mesh.position.clone(); x.acc = 1; x.rot = 0;
            x.pool = makePool(x); x.glow = sprite(x, 0xff5a10, true, 0.02); x.glow.scale.setScalar(0.1);
            x.char = sprite(x, 0x120603, false, 3); x.char.scale.setScalar(2.9); x.char.material.opacity = 0;
            x.hot = sprite(x, 0xff8a20, true, 3.2); x.hot.scale.setScalar(2.6); x.hot.material.opacity = 0;
            x.rings = [floorRing(x, 0xffa030), floorRing(x, 0xff5a10)]; x.gloop = drops(x, 48);
            x.bub = Array.from({ length: 12 }, (_, i) => { const s = new x.THREE.Mesh(fx(x.THREE).plane, new x.THREE.MeshBasicMaterial({ map: fx(x.THREE).ring, color: 0xffc060, transparent: true, depthWrite: false, blending: x.THREE.AdditiveBlending }));
                const a = Math.random() * 6.28, d = rnd(0.5, 2.7); s.rotation.x = -Math.PI / 2; s.position.set(x.home.x + Math.cos(a) * d, 0.1, x.home.z + Math.sin(a) * d); s.scale.setScalar(0.01); s.userData.t0 = 0.3 + i * 0.12 + Math.random() * 0.1; x.scene.add(s); x.own.push(s); return s; });
            x.sunk = false;
        },
        tick(k, x) {
            const T = x.dur || 2.2, t = k * T, ki = 0.9 / T, open = ease(at(k, 0, 0.22)), sink = at(k, 0.14, ki), crust = at(k, ki + 0.1, 0.9), fade = 1 - at(k, 0.86, 1);
            x.acc += x.dt;
            if (x.acc > 0.05) { x.acc = 0; drawPool(x.pool, t, crust); }
            const R = 2 * 3.5 * open * (1 + 0.04 * Math.sin(t * 6));
            x.pool.scale.setScalar(Math.max(0.01, R)); x.pool.material.opacity = fade;
            x.glow.scale.setScalar(R * 1.5 + 0.1); x.glow.material.opacity = (0.55 - crust * 0.4) * open * fade;
            if (!x.sunk) {
                // the die wobbles, tilts and shrinks into the pool, going dark and then glowing at the edges
                const w = 0.18 * (1 - sink * 0.5) * open;
                x.mesh.position.set(x.home.x + Math.sin(t * 27) * w, x.home.y, x.home.z + Math.cos(t * 23) * w);
                x.rot += x.dt * (2 + sink * 6); x.mesh.rotateX(Math.sin(t * 9) * 0.5 * sink); x.mesh.rotateOnWorldAxis(x.UP ||= new x.THREE.Vector3(0, 1, 0), x.rot);
                x.mesh.scale.setScalar(Math.max(0.001, 1 - sink ** 1.6));
                x.char.scale.setScalar(2.9 * (1 - sink * 0.6)); x.char.material.opacity = sink * 0.85;
                x.hot.material.opacity = Math.sin(Math.PI * sink) * 0.45;
                if (k >= ki) { x.sunk = true; x.mesh.visible = false; x.char.material.opacity = x.hot.material.opacity = 0; x.gloop.base = t;
                    for (let i = 0; i < 48; i++) { const a = Math.random() * 6.28, s = rnd(1, 4.2); x.gloop.set(i, t + Math.random() * 0.12, Math.cos(a) * s, Math.sin(a) * s, rnd(2.5, 6)); } }
            }
            if (x.sunk) {
                const p = at(k, ki, 1) * (T - 0.9);
                x.rings[0].scale.setScalar(1 + ease(at(p, 0, 0.9)) * 8); x.rings[0].material.opacity = Math.max(0, 1 - p / 0.9);
                x.rings[1].scale.setScalar(1 + ease(at(p, 0.12, 1)) * 5.5); x.rings[1].material.opacity = Math.max(0, 0.8 - at(p, 0.12, 1));
                x.glow.material.opacity += Math.max(0, 0.8 - p * 2.5);
                x.gloop.update(t, 1);
            }
            for (const b of x.bub) {
                const u = at(t - b.userData.t0, 0, 0.45);
                b.scale.setScalar(u > 0 ? 0.3 + u * (u < 0.7 ? 0.9 : 1.8) : 0.01);
                b.material.opacity = u > 0 && u < 1 ? (u < 0.7 ? 0.5 + u * 0.5 : (1 - u) * 3) * fade : 0;
            }
        },
        end: cleanup,
    },
    nat20: {
        key: 'n03-lava-eruption', name: 'Lava Eruption', dur: 2.4, impact: 0.95,
        blurb: 'The table cracks and glows, then a pillar of lava blasts the die skyward and bursts into golden droplets that rain down and cool.',
        start(x) {
            x.own = []; x.home = x.mesh.position.clone(); x.acc = 1; x.rot = 0; x.burstDone = false;
            x.pool = makePool(x); x.glow = sprite(x, 0xff5a10, true, 0.02); x.glow.scale.setScalar(0.1);
            x.core = sprite(x, 0xfff0b0, true, 4); x.core.scale.setScalar(0.1);
            x.col = Array.from({ length: 10 }, (_, i) => { const s = sprite(x, new x.THREE.Color().setHSL(0.02 + i * 0.009, 1, 0.5 + i * 0.03), true, 1 + i * 0.3); s.material.opacity = 0; return s; });
            x.rings = [floorRing(x, 0xffa030), floorRing(x, 0xffe090)];
            x.drops = drops(x, 220);
            for (let i = 0; i < 130; i++) { const a = Math.random() * 6.28, s = rnd(0.2, 2.4); x.drops.set(i, 0.95 + Math.random() * 0.7, Math.cos(a) * s, Math.sin(a) * s, rnd(5, 10)); }
        },
        tick(k, x) {
            const T = x.dur || 2.4, t = k * T, ki = 0.95 / T, kb = 1.7 / T, build = at(k, 0, ki), fade = 1 - at(k, 0.9, 1);
            x.acc += x.dt;
            if (x.acc > 0.05) { x.acc = 0; drawPool(x.pool, t, 0.35 * at(k, 0.75, 1)); }
            const R = 2 * (1 + 2.6 * ease(at(k, 0, 0.3)) + 1.4 * ease(at(k, ki, ki + 0.15)));
            x.pool.scale.setScalar(R); x.pool.material.opacity = Math.min(1, build * 3) * fade;
            x.glow.scale.setScalar(R * 1.6); x.glow.material.opacity = (0.3 + 0.6 * build) * fade * (0.9 + 0.1 * Math.sin(t * 20));
            x.rot += x.dt * (3 + build * 20); x.mesh.rotateOnWorldAxis(x.UP ||= new x.THREE.Vector3(0, 1, 0), x.rot);
            if (k < ki) {
                const s = 0.25 * build; x.mesh.position.set(x.home.x + (Math.random() - 0.5) * s, x.home.y, x.home.z + (Math.random() - 0.5) * s);
                x.mesh.scale.setScalar(1 + 0.2 * build);
                x.core.scale.setScalar(1 + build * 3); x.core.material.opacity = build * 0.5;
            } else if (!x.burstDone) {
                // blasted up on the pillar: the die swells as it nears the viewer, then bursts at the top
                const u = at(k, ki, kb);
                x.mesh.scale.setScalar(1.2 + 2.6 * ease(u));
                x.mesh.position.set(x.home.x, x.home.y, x.home.z - 1.6 * ease(u));
                const env = Math.min(1, (k - ki) * 28) * (1 - at(k, kb, kb + 0.12));
                x.col.forEach((s, i) => { const j = i / 9, w = t * 17 + i * 1.9; s.position.set(x.home.x + Math.sin(w) * 0.25 * j, 1 + i * 0.3, x.home.z - 1.6 * ease(u) * j * 0.6 + Math.cos(w) * 0.2 * j);
                    s.scale.setScalar((1.3 + j * 2.4) * (0.4 + 0.6 * env) * (1 + 0.12 * Math.sin(w * 1.3))); s.material.opacity = env * (0.85 - j * 0.3); });
                x.core.scale.setScalar(2.5 + 4 * ease(u)); x.core.material.opacity = 0.9 * env;
                const r0 = ease(at(k, ki, ki + 0.3));
                x.rings[0].scale.setScalar(1 + r0 * 11); x.rings[0].material.opacity = (1 - r0) * 0.9;
                if (k >= kb) {
                    x.burstDone = true; x.mesh.visible = false;
                    for (let i = 130; i < 220; i++) { const a = Math.random() * 6.28, s = rnd(1.5, 7); x.drops.set(i, t + Math.random() * 0.05, Math.cos(a) * s, Math.sin(a) * s, rnd(3, 8)); }
                }
            }
            if (x.burstDone) {
                const p = t - 1.7, r1 = ease(at(p, 0, 0.5));
                x.core.scale.setScalar(6.5 + r1 * 3); x.core.material.opacity = Math.max(0, 1 - p * 4);
                x.rings[1].scale.setScalar(1 + r1 * 14); x.rings[1].material.opacity = Math.max(0, 1 - at(p, 0, 0.55));
                for (const s of x.col) s.material.opacity = 0;
            }
            x.drops.update(t, 1);
        },
        end: cleanup,
    },
};
