// Frostbound: pale glassy ice, silver filigree on the edges, frost ferns on the faces,
// crystals that twinkle across them and snowflakes circling each die.
const poly = (g, c) => { g.beginPath(); c.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); };
const mid = (c) => c.reduce((a, p) => [a[0] + p[0] / c.length, a[1] + p[1] / c.length], [0, 0]);
const shrink = (c, k) => { const m = mid(c); return c.map(([x, y]) => [m[0] + (x - m[0]) * k, m[1] + (y - m[1]) * k]); };
const rng = (seed) => { let s = (seed * 131 + 7) % 2147483647 || 1; return () => ((s = (s * 16807) % 2147483647) / 2147483647); };

// silver filigree: double rim, corner knots, little scrolls on each edge
function filigree(g, corners, col, w) {
    g.strokeStyle = g.fillStyle = col; g.lineCap = g.lineJoin = 'round';
    g.lineWidth = w * 1.8; poly(g, corners); g.stroke();
    g.lineWidth = w * 0.6; poly(g, shrink(corners, 0.86)); g.stroke();
    const m = mid(corners);
    corners.forEach(([x, y], i) => {
        const [x2, y2] = corners[(i + 1) % corners.length];
        g.beginPath(); g.arc(x, y, w * 1.7, 0, 7); g.fill();
        const ex = (x + x2) / 2, ey = (y + y2) / 2, px = m[0] + (ex - m[0]) * 0.88, py = m[1] + (ey - m[1]) * 0.88;
        g.lineWidth = w * 0.5; g.beginPath(); g.arc(px, py, w * 1.2, 0, 7); g.stroke();
        g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(m[0] + (x - m[0]) * 0.9, m[1] + (y - m[1]) * 0.6, m[0] + (x - m[0]) * 0.62, m[1] + (y - m[1]) * 0.62); g.stroke();
    });
}

// frost fern: a branching stalk with symmetrical side twigs
function fern(g, x, y, ang, len, depth, r) {
    const x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
    g.lineWidth = Math.max(0.6, depth * 0.45);
    g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke();
    if (depth <= 0) return;
    for (let k = 1; k <= 3; k++) {
        const t = k / 3.4, bx = x + (x2 - x) * t, by = y + (y2 - y) * t, l = len * (0.5 - t * 0.25);
        fern(g, bx, by, ang + 0.9 + r() * 0.2, l, depth - 1, r);
        fern(g, bx, by, ang - 0.9 - r() * 0.2, l, depth - 1, r);
    }
}

let SH = null, lastDraw = -1;
function shared(THREE) {
    if (SH) return SH;
    const N = 128, cv = document.createElement('canvas'); cv.width = cv.height = N;
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    // snowflake sprite
    const sc = document.createElement('canvas'); sc.width = sc.height = 32;
    const s = sc.getContext('2d'); s.translate(16, 16); s.strokeStyle = '#fff'; s.lineWidth = 1.6; s.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
        s.rotate(Math.PI / 3); s.beginPath(); s.moveTo(0, 0); s.lineTo(0, 13);
        s.moveTo(0, 8); s.lineTo(4, 11); s.moveTo(0, 8); s.lineTo(-4, 11); s.stroke();
    }
    const flakeTex = new THREE.CanvasTexture(sc);
    const flakeMat = new THREE.PointsMaterial({ size: 11, sizeAttenuation: false, map: flakeTex, color: 0xd8f0ff, transparent: true, opacity: 0.9, depthWrite: false });
    // crystal positions (uv-space), fixed set, twinkling at different phases
    const r = rng(11), cr = [];
    for (let i = 0; i < 14; i++) { const a = r() * 6.283, d = 0.3 + r() * 0.18; cr.push({ x: 0.5 + Math.cos(a) * d, y: 0.5 + Math.sin(a) * d, ph: r() * 6.283, sp: 0.8 + r() * 1.4, sz: 4 + r() * 6, a }); }
    return (SH = { cv, g: cv.getContext('2d'), tex, mat, flakeMat, flakeTex, N, cr });
}
function crystals(sh, sec) {
    const { g, N, cr } = sh;
    g.clearRect(0, 0, N, N); g.globalCompositeOperation = 'lighter'; g.lineCap = 'round';
    for (const c of cr) {
        const k = Math.max(0, Math.sin(sec * c.sp + c.ph)); if (k < 0.05) continue;
        // creep slowly along the ring
        const a = c.a + sec * 0.05, d = 0.37 + 0.09 * Math.sin(c.ph + sec * 0.2);
        const x = (0.5 + Math.cos(a) * d) * N, y = (0.5 + Math.sin(a) * d) * N, L = c.sz * (0.4 + k * 0.6);
        g.strokeStyle = `rgba(190,235,255,${(0.75 * k).toFixed(2)})`; g.lineWidth = 1.2;
        g.beginPath();
        for (let i = 0; i < 3; i++) { const t = i * Math.PI / 3 + c.ph; g.moveTo(x - Math.cos(t) * L, y - Math.sin(t) * L); g.lineTo(x + Math.cos(t) * L, y + Math.sin(t) * L); }
        g.stroke();
        g.fillStyle = `rgba(255,255,255,${(0.9 * k).toFixed(2)})`; g.fillRect(x - 1, y - 1, 2, 2);
    }
    g.globalCompositeOperation = 'source-over'; sh.tex.needsUpdate = true;
}

const NF = 7;
export default {
    name: 'Frostbound', ink: '#06213f', metal: 0.2, rough: 0.12, glow: 0, bumpScale: 4,
    font: 'Georgia, serif',
    physical: true,
    mat: { clearcoat: 0.6, clearcoatRoughness: 0.05, transmission: 0.1, thickness: 0.6, ior: 1.31, sheen: 0.1, sheenColor: 0xbfe8ff },
    paint(g, S, seed, corners) {
        const r = rng(seed), m = mid(corners);
        const gr = g.createRadialGradient(m[0], m[1], 0, m[0], m[1], S * 0.7);
        gr.addColorStop(0, '#7cc6f0'); gr.addColorStop(0.55, '#4a9bd6'); gr.addColorStop(1, '#1f5d93');
        g.fillStyle = gr; g.fillRect(0, 0, S, S);
        g.save(); poly(g, shrink(corners, 0.95)); g.clip();
        // trapped bubbles and cloudy patches
        for (let i = 0; i < 16; i++) { g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,.18)' : 'rgba(70,130,200,.12)'; g.beginPath(); g.arc(r() * S, r() * S, 5 + r() * 22, 0, 7); g.fill(); }
        // frost ferns creeping in from each corner, kept off the number area
        g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineCap = 'round';
        for (const [x, y] of corners) {
            const a = Math.atan2(m[1] - y, m[0] - x), dist = Math.hypot(m[0] - x, m[1] - y);
            fern(g, x, y, a + (r() - 0.5) * 0.4, dist * 0.34, 3, r);
        }
        g.strokeStyle = 'rgba(120,175,225,.5)';
        corners.forEach(([x, y], i) => {
            const [x2, y2] = corners[(i + 1) % corners.length], ex = (x + x2) / 2, ey = (y + y2) / 2;
            fern(g, ex, ey, Math.atan2(m[1] - ey, m[0] - ex), Math.hypot(m[0] - ex, m[1] - ey) * 0.3, 2, r);
        });
        // soft frosted halo behind the number: keeps it readable
        const hg = g.createRadialGradient(m[0], m[1], 0, m[0], m[1], S * 0.22);
        hg.addColorStop(0, 'rgba(225,245,255,.7)'); hg.addColorStop(1, 'rgba(240,250,255,0)');
        g.fillStyle = hg; g.fillRect(0, 0, S, S);
        g.restore();
        filigree(g, corners, '#f4f8ff', 5);
        g.strokeStyle = 'rgba(60,100,160,.55)'; g.lineWidth = 1.2; poly(g, shrink(corners, 0.97)); g.stroke();
    },
    bump(g, S, seed, corners) { filigree(g, corners, '#fff', 5); },
    decorate({ THREE, mesh }) {
        const sh = shared(THREE);
        const ov = new THREE.Mesh(mesh.geometry, sh.mat); ov.scale.setScalar(1.004); mesh.add(ov);
        const pos = new Float32Array(NF * 3), geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        const pts = new THREE.Points(geo, sh.flakeMat); pts.frustumCulled = false; mesh.add(pts);
        // each flake: orbit radius, speed, phase, tilt of its ring (in world space)
        const fl = Array.from({ length: NF }, (_, i) => ({ r: 1.35 + Math.random() * 0.2, sp: (0.5 + Math.random() * 0.6) * (i % 2 ? 1 : -1), ph: Math.random() * 6.283, tilt: Math.random() * 3.14, bob: Math.random() * 6.283 }));
        const q = new THREE.Quaternion(), v = new THREE.Vector3();
        const place = (sec) => {
            q.copy(mesh.quaternion).invert();
            fl.forEach((f, i) => {
                const a = sec * f.sp + f.ph;
                // ring in the table plane (x, y), tilted a bit through z, then undone for the die's own rotation
                v.set(Math.cos(a) * f.r, Math.sin(a) * f.r * Math.cos(f.tilt), Math.sin(a) * f.r * Math.sin(f.tilt) * 0.5 + Math.sin(sec * 1.3 + f.bob) * 0.08).applyQuaternion(q);
                pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
            });
            geo.attributes.position.needsUpdate = true;
        };
        place(1.5);
        return {
            tick(sec) {
                if (sec - lastDraw > 0.05 || sec < lastDraw) { lastDraw = sec; crystals(sh, sec); }
                place(sec);
            },
            dispose() { mesh.remove(ov); mesh.remove(pts); geo.dispose(); },
        };
    },
    sound: {
        hit({ ac, out, noise, vol, onTable, t }) {
            const g = ac.createGain();
            if (onTable) { // icy crunch: band-passed noise grains
                const s = ac.createBufferSource(); s.buffer = noise;
                const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2200 + Math.random() * 1500; bp.Q.value = 1.2;
                g.gain.setValueAtTime(0.0001, t);
                for (let i = 0; i < 4; i++) { const tt = t + i * 0.025 + Math.random() * 0.02; g.gain.setValueAtTime(vol * 0.6, tt); g.gain.exponentialRampToValueAtTime(0.001, tt + 0.03); }
                s.connect(bp).connect(g).connect(out); s.start(t, Math.random() * 0.15, 0.2);
                const o = ac.createOscillator(); o.type = 'triangle'; o.frequency.value = 260 + Math.random() * 60;
                const og = ac.createGain(); og.gain.setValueAtTime(vol * 0.25, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
                o.connect(og).connect(out); o.start(t); o.stop(t + 0.12);
            } else { // glassy clink: inharmonic high partials
                const base = 1700 * (0.85 + Math.random() * 0.5);
                g.gain.setValueAtTime(vol * 0.4, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35); g.connect(out);
                for (const m of [1, 2.32, 4.17]) { const o = ac.createOscillator(); o.type = 'sine'; o.frequency.value = base * m; o.connect(g); o.start(t); o.stop(t + 0.36); }
            }
        },
        throw({ ac, out, noise, t }) { // cold gust: noise swept through a low band-pass
            const s = ac.createBufferSource(); s.buffer = noise; s.loop = true;
            const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 2.5;
            bp.frequency.setValueAtTime(400, t); bp.frequency.exponentialRampToValueAtTime(1400, t + 0.3); bp.frequency.exponentialRampToValueAtTime(500, t + 0.8);
            const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.5, t + 0.3); g.gain.exponentialRampToValueAtTime(0.001, t + 0.85);
            s.connect(bp).connect(g).connect(out); s.start(t); s.stop(t + 0.9);
        },
        settle({ ac, out, t }) { // wind chime shimmer: a few descending-ish pure bells
            [0, 0.09, 0.19, 0.3, 0.42].forEach((d, i) => {
                const f = [2093, 2637, 3136, 2349, 3520][i], o = ac.createOscillator(), g = ac.createGain();
                o.type = 'sine'; o.frequency.value = f;
                g.gain.setValueAtTime(0.0001, t + d); g.gain.linearRampToValueAtTime(0.16, t + d + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + d + 1.1);
                o.connect(g).connect(out); o.start(t + d); o.stop(t + d + 1.15);
            });
        },
    },
};
