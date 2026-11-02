// Fire magic rune trails for Ember Cage: rune circles stamped at impacts, and fire glyph footprints along the path.
let G = null; // shared geometry + textures, built lazily
function init(THREE) {
    if (G) return G;
    const mk = (c) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
    const flame = (g, x, y, s, a) => { g.save(); g.translate(x, y); g.rotate(a); g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(s * .6, -s * .5, 0, -s * 1.5); g.quadraticCurveTo(-s * .6, -s * .5, 0, 0); g.fill(); g.restore(); };
    const glyphPath = (g, r, s, n) => { // random angular rune: a few connected strokes plus a spine
        let x = (r() - .5) * s, y = -s * .5; g.beginPath(); g.moveTo(x, y);
        for (let i = 0; i < n; i++) { x = (r() - .5) * s; y = (r() - .5) * s * 1.1; g.lineTo(x, y); } g.stroke();
        g.beginPath(); g.moveTo(0, -s * .6); g.lineTo(0, s * .6); g.stroke();
    };
    const rune = (seed) => {
        let a = seed * 9301 + 49297; const r = () => (a = (a * 9301 + 49297) % 233280) / 233280;
        const c = document.createElement('canvas'); c.width = c.height = 384; const g = c.getContext('2d'), C = 192;
        g.translate(C, C); g.lineCap = g.lineJoin = 'round'; g.shadowColor = '#ff6a10'; g.shadowBlur = 10;
        g.fillStyle = '#ff7a1a';
        const ring = (rad, w, col) => { g.lineWidth = w; g.strokeStyle = col; g.beginPath(); g.arc(0, 0, rad, 0, 6.2832); g.stroke(); };
        ring(176, 3, '#ffc070'); ring(150, 2, '#ff8a28'); ring(118, 2.5, '#ffb347'); ring(62, 2, '#ff8a28');
        const nr = 12 + seed * 2, tk = 36;
        for (let i = 0; i < tk; i++) { const an = i / tk * 6.2832; g.lineWidth = 1.5; g.strokeStyle = '#ff9a38'; g.beginPath(); g.moveTo(Math.cos(an) * 150, Math.sin(an) * 150); g.lineTo(Math.cos(an) * 160, Math.sin(an) * 160); g.stroke(); }
        for (let i = 0; i < nr; i++) { const an = i / nr * 6.2832; g.save(); g.rotate(an); g.translate(0, -134); g.lineWidth = 2; g.strokeStyle = '#ffd08a'; glyphPath(g, r, 18, 3); g.restore(); }
        for (let i = 0; i < 16; i++) { g.save(); g.rotate(i / 16 * 6.2832); g.translate(0, -178); flame(g, 0, 0, 7, 0); g.restore(); }
        const pts = 5 + (seed % 2) * 2, step = pts === 5 ? 2 : 3; // pentagram / heptagram
        g.lineWidth = 2.2; g.strokeStyle = '#ffa040'; g.beginPath();
        for (let i = 0; i <= pts; i++) { const an = -1.5708 + (i * step % pts) / pts * 6.2832, px = Math.cos(an) * 116, py = Math.sin(an) * 116; i ? g.lineTo(px, py) : g.moveTo(px, py); }
        g.stroke();
        for (let i = 0; i < pts; i++) { const an = -1.5708 + i / pts * 6.2832; g.save(); g.translate(Math.cos(an) * 90, Math.sin(an) * 90); g.rotate(an + 1.5708); g.lineWidth = 1.6; g.strokeStyle = '#ffd9a0'; glyphPath(g, r, 14, 2); g.restore(); }
        g.fillStyle = '#ffe0a0'; g.shadowBlur = 18; g.beginPath(); g.arc(0, 0, 9, 0, 6.2832); g.fill();
        g.fillStyle = '#ff7a1a'; flame(g, 0, 22, 18, 0); flame(g, -20, 20, 10, -.4); flame(g, 20, 20, 10, .4);
        return mk(c);
    };
    const sigil = (seed) => {
        let a = seed * 7919 + 13; const r = () => (a = (a * 9301 + 49297) % 233280) / 233280;
        const c = document.createElement('canvas'); c.width = c.height = 96; const g = c.getContext('2d');
        g.translate(48, 48); g.lineCap = g.lineJoin = 'round'; g.shadowColor = '#ff5a00'; g.shadowBlur = 8;
        g.strokeStyle = '#ffc060'; g.fillStyle = '#ff8a20'; g.lineWidth = 4;
        if (seed % 3 === 0) { g.beginPath(); g.arc(0, 0, 30, 0, 6.2832); g.stroke(); }
        g.lineWidth = 5; g.strokeStyle = '#ffd890'; glyphPath(g, r, 40, 3 + seed % 2);
        flame(g, 0, -26, 8, 0);
        return mk(c);
    };
    const mat = (map) => new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
    G = { geo: new THREE.PlaneGeometry(1, 1), runes: [0, 1, 2].map(rune), sigils: [0, 1, 2, 3, 4, 5].map(sigil), mat };
    return G;
}

function make(kind) {
    return function (ctx) {
        const { THREE, scene } = ctx, g = init(THREE), rnd = ctx.rnd(600 + kind);
        const N = kind === 0 ? 10 : 36, life = kind === 0 ? 2.7 : 1.5;
        const items = [];
        for (let i = 0; i < N; i++) {
            const m = new THREE.Mesh(g.geo, g.mat(kind === 0 ? g.runes[i % 3] : g.sigils[i % 6]));
            m.rotation.x = -Math.PI / 2; m.visible = false; scene.add(m);
            items.push({ m, age: 99, spin: 0, ph: 0, sc: 1 });
        }
        let next = 0, air = false, prevSp = 0, cool = 0, dist = 0, side = 1, lx = null, lz = 0;
        const spawn = (x, z, rot, sc) => {
            const it = items[next]; next = (next + 1) % N;
            it.age = 0; it.spin = (rnd() < .5 ? -1 : 1) * (0.5 + rnd()); it.ph = rnd() * 6.28; it.sc = sc;
            it.m.position.set(x, 0.02 + (next % 6) * 0.01, z); it.m.rotation.z = rot; it.m.visible = true;
        };
        return {
            tick(sec, dt, body) {
                const p = body.position, v = body.velocity, sp = Math.hypot(v.x, v.z);
                cool -= dt;
                if (ctx.mesh.visible && cool <= 0) {
                    if (kind === 0) {
                        if ((air && p.y < 1.35) || (prevSp - sp > 5 && p.y < 1.6)) { spawn(p.x, p.z, rnd() * 6.28, 3.2 + Math.min(sp, 12) * 0.12); cool = 0.3; }
                    } else if (p.y < 1.7 && sp > 1.2) {
                        if (lx === null) { lx = p.x; lz = p.z; }
                        dist += Math.hypot(p.x - lx, p.z - lz); lx = p.x; lz = p.z;
                        if (dist > 0.85) {
                            dist = 0; side = -side; const h = Math.atan2(v.z, v.x);
                            spawn(p.x - Math.sin(h) * 0.5 * side, p.z + Math.cos(h) * 0.5 * side, -h - Math.PI / 2 + (rnd() - .5) * .5, 1.1 + rnd() * .35);
                        }
                    }
                }
                air = p.y > 1.4; prevSp = sp;
                for (let i = 0; i < N; i++) {
                    const it = items[i]; if (!it.m.visible) continue;
                    it.age += dt; const u = it.age / life;
                    if (u >= 1) { it.m.visible = false; continue; }
                    if (kind === 0) {
                        const pop = Math.min(it.age / 0.18, 1), s = it.sc * (0.7 + 0.3 * pop + u * 0.12);
                        it.m.scale.set(s, s, 1); it.m.rotation.z += it.spin * dt;
                        it.m.material.opacity = Math.min(1, 1.6 * (1 - u) * (1 - u) + (it.age < .15 ? .5 : 0)) * (0.85 + 0.15 * Math.sin(sec * 18 + it.ph));
                    } else {
                        const s = it.sc * (1 - u * 0.25);
                        it.m.scale.set(s, s, 1);
                        it.m.material.opacity = Math.min(it.age / 0.08, 1) * (1 - u) * (0.55 + 0.45 * Math.sin(sec * 30 + it.ph + i)) * 1.3;
                    }
                }
            },
            dispose() { for (const it of items) { scene.remove(it.m); it.m.material.dispose(); } },
        };
    };
}

export default [
    { key: 't06-rune-circles', name: 'Rune Circle Stamps', blurb: 'Each landing burns a rotating fire magic circle into the table that flares and fades.', make: make(0) },
    { key: 't06-glyph-prints', name: 'Fire Glyph Footprints', blurb: 'Small flickering fire sigils are left in alternating steps along the path and burn out.', make: make(1) },
];
