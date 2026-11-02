// Abyssal Tide: translucent deep-sea teal, pearly scalloped edges, drifting caustics, rising bubbles.
const poly = (g, c) => { g.beginPath(); c.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); };
const mid = (c) => c.reduce((a, p) => [a[0] + p[0] / c.length, a[1] + p[1] / c.length], [0, 0]);
const rng = (seed) => { let s = seed * 97 + 11; return () => ((s = (s * 16807) % 2147483647) / 2147483647); };

// scallops (small half-discs) along every real edge, pointing inward
function scallops(g, corners, fill, stroke, rad) {
    const m = mid(corners);
    corners.forEach(([x, y], i) => {
        const [x2, y2] = corners[(i + 1) % corners.length], L = Math.hypot(x2 - x, y2 - y), n = Math.max(3, Math.round(L / (rad * 1.8))), r = L / n / 2;
        for (let k = 0; k < n; k++) {
            const t = (k + 0.5) / n, px = x + (x2 - x) * t, py = y + (y2 - y) * t, a = Math.atan2(m[1] - py, m[0] - px);
            g.beginPath(); g.arc(px, py, r * 0.95, a - Math.PI / 2, a + Math.PI / 2); g.closePath();
            if (fill) { g.fillStyle = fill; g.fill(); }
            if (stroke) { g.strokeStyle = stroke; g.lineWidth = 2; g.stroke(); }
        }
    });
}

let SH = null, lastDraw = -1, img = null;
function shared(THREE) {
    if (SH) return SH;
    const N = 96, cv = document.createElement('canvas'); cv.width = cv.height = N;
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const sc = document.createElement('canvas'); sc.width = sc.height = 32;
    const sg = sc.getContext('2d'); sg.strokeStyle = 'rgba(190,255,255,.9)'; sg.lineWidth = 2.5;
    const gr = sg.createRadialGradient(16, 16, 0, 16, 16, 14); gr.addColorStop(0, 'rgba(120,230,255,.08)'); gr.addColorStop(1, 'rgba(120,230,255,.35)');
    sg.fillStyle = gr; sg.beginPath(); sg.arc(16, 16, 13, 0, 7); sg.fill(); sg.stroke();
    sg.fillStyle = '#fff'; sg.beginPath(); sg.arc(11, 11, 3, 0, 7); sg.fill();
    const bTex = new THREE.CanvasTexture(sc);
    const bMat = new THREE.PointsMaterial({ size: 9, sizeAttenuation: false, map: bTex, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    return (SH = { cv, g: cv.getContext('2d'), tex, mat, bMat, bTex, N });
}
// wavy bright network: ridges of summed sines, drifting
function caustics(sh, t) {
    const { g, N } = sh; img = img || g.createImageData(N, N); const d = img.data, T = Math.PI * 2 / N;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const a = Math.sin(x * T * 2 + t * 1.1 + Math.sin(y * T * 3 + t * 0.8) * 1.3),
            b = Math.sin(y * T * 3 - t * 0.9 + Math.sin(x * T * 2 - t * 0.6) * 1.3),
            c = Math.sin((x + y) * T * 2 + t * 0.7);
        const v = Math.abs(a + b + c * 0.6), k = Math.max(0, 1 - v * 1.1), i = (y * N + x) * 4, w = k * k * k;
        d[i] = 40 * w; d[i + 1] = 120 * w; d[i + 2] = 140 * w; d[i + 3] = 255 * w;
    }
    g.putImageData(img, 0, 0); sh.tex.needsUpdate = true;
}

// a bubble "bloop": sine with a fast upward sweep
function bloop(ac, out, t, vol, f0 = 300 + Math.random() * 200, len = 0.09) {
    const o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine';
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * 2.6, t + len);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + len + 0.03);
    o.connect(g).connect(out); o.start(t); o.stop(t + len + 0.05);
}

const NB = 32;
export default {
    name: 'Abyssal Tide', ink: '#e6fbff', metal: 0.1, rough: 0.18, glow: 0.25, bumpScale: 5,
    physical: true, mat: { clearcoat: 1, clearcoatRoughness: 0.08, ior: 1.4 },
    paint(g, S, seed, corners) {
        const r = rng(seed), m = mid(corners);
        const gr = g.createRadialGradient(m[0], m[1], 0, m[0], m[1], S * 0.62);
        gr.addColorStop(0, '#0e5a68'); gr.addColorStop(0.6, '#0a3a58'); gr.addColorStop(1, '#06182e');
        g.fillStyle = gr; g.fillRect(0, 0, S, S);
        for (let i = 0; i < 40; i++) { g.fillStyle = r() < 0.5 ? 'rgba(40,200,210,.07)' : 'rgba(2,10,30,.18)'; g.beginPath(); g.arc(r() * S, r() * S, 6 + r() * 26, 0, 7); g.fill(); }
        g.save(); poly(g, corners); g.clip();
        scallops(g, corners, 'rgba(210,245,240,.22)', 'rgba(150,255,245,.9)', 15);
        g.strokeStyle = 'rgba(80,240,255,.75)'; g.lineWidth = 5; poly(g, corners); g.stroke();
        g.restore();
        // dim the centre a little so the numbers stay readable
        const dk = g.createRadialGradient(S / 2, S / 2, 20, S / 2, S / 2, 95); dk.addColorStop(0, 'rgba(2,20,36,.55)'); dk.addColorStop(1, 'rgba(2,20,36,0)');
        g.fillStyle = dk; g.fillRect(0, 0, S, S);
    },
    bump(g, S, seed, corners) {
        g.save(); poly(g, corners); g.clip();
        scallops(g, corners, '#fff', '#fff', 15);
        g.strokeStyle = '#fff'; g.lineWidth = 6; poly(g, corners); g.stroke();
        g.restore();
    },
    decorate({ THREE, scene, mesh, faces }) {
        const sh = shared(THREE);
        const ov = new THREE.Mesh(mesh.geometry, sh.mat); ov.scale.setScalar(1.004); mesh.add(ov);
        const pos = new Float32Array(NB * 3), col = new Float32Array(NB * 3), age = new Float32Array(NB), life = new Float32Array(NB), sx = new Float32Array(NB);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
        const pts = new THREE.Points(geo, sh.bMat); pts.frustumCulled = false; scene.add(pts);
        // wisp: a tiny glowing jellyfish orbiting the die
        const wisp = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: 0x7ff8ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
        mesh.add(wisp);
        const spawn = (i) => {
            const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * 1.0, p = i * 3;
            pos[p] = mesh.position.x + Math.cos(a) * r; pos[p + 1] = mesh.position.y + 0.2 + Math.random() * 0.8; pos[p + 2] = mesh.position.z + Math.sin(a) * r;
            life[i] = 1 + Math.random() * 1.4; age[i] = 0; sx[i] = Math.random() * 6;
        };
        for (let i = 0; i < NB; i++) { spawn(i); age[i] = Math.random() * life[i]; }
        const place = (sec, dt, moving) => {
            // a few bubbles idle; many while moving
            const want = moving ? NB : 7;
            for (let i = 0; i < NB; i++) {
                const p = i * 3; age[i] += dt;
                if (age[i] > life[i]) { if (i < want) spawn(i); else { age[i] = life[i]; col[p] = col[p + 1] = col[p + 2] = 0; continue; } }
                const k = age[i] / life[i];
                pos[p + 1] += (0.8 + k) * dt; pos[p] += Math.sin(sec * 3 + sx[i]) * 0.2 * dt;
                const f = Math.min(1, k * 8) * (1 - k); col[p] = f * 0.6; col[p + 1] = f * 0.9; col[p + 2] = f;
            }
            geo.attributes.position.needsUpdate = geo.attributes.color.needsUpdate = true;
        };
        place(0, 0, false);
        return {
            tick(sec, dt, body) {
                if (sec - lastDraw > 0.05 || sec < lastDraw) { lastDraw = sec; caustics(sh, sec); }
                const sp = body ? Math.hypot(body.velocity.x, body.velocity.y, body.velocity.z) + Math.hypot(body.angularVelocity.x, body.angularVelocity.y, body.angularVelocity.z) * 0.3 : 0;
                place(sec, dt || 0, sp > 0.8);
                const a = sec * 1.6 + faces.length;
                wisp.position.set(Math.cos(a) * 1.35, Math.sin(a * 0.7) * 0.5, Math.sin(a) * 1.35);
                wisp.scale.setScalar(0.8 + 0.3 * Math.sin(sec * 5));
            },
            dispose() { mesh.remove(ov); mesh.remove(wisp); scene.remove(pts); geo.dispose(); wisp.geometry.dispose(); wisp.material.dispose(); },
        };
    },
    sound: {
        hit({ ac, out, noise, vol, onTable, t }) {
            const s = ac.createBufferSource(); s.buffer = noise;
            const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = onTable ? 420 : 650;
            const g = ac.createGain(); g.gain.setValueAtTime(vol * 0.7, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
            s.connect(lp).connect(g).connect(out); s.start(t, Math.random() * 0.15, 0.2);
            const o = ac.createOscillator(), og = ac.createGain(); o.type = 'sine';
            o.frequency.setValueAtTime((onTable ? 110 : 150) * (0.9 + Math.random() * 0.2), t); o.frequency.exponentialRampToValueAtTime(55, t + 0.2);
            og.gain.setValueAtTime(vol * 0.6, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
            o.connect(og).connect(out); o.start(t); o.stop(t + 0.27);
            if (Math.random() < 0.3) bloop(ac, out, t + 0.03, 0.12 * Math.max(vol, 0.3));
        },
        throw({ ac, out, noise, t }) {
            const s = ac.createBufferSource(); s.buffer = noise; s.loop = true;
            const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 2;
            lp.frequency.setValueAtTime(150, t); lp.frequency.exponentialRampToValueAtTime(700, t + 0.45); lp.frequency.exponentialRampToValueAtTime(120, t + 1.0);
            const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.6, t + 0.45); g.gain.exponentialRampToValueAtTime(0.001, t + 1.0);
            s.connect(lp).connect(g).connect(out); s.start(t); s.stop(t + 1.05);
        },
        settle({ ac, out, t, count }) {
            const n = Math.min(10, 4 + (count || 1));
            for (let i = 0; i < n; i++) bloop(ac, out, t + Math.random() * 0.5, 0.1 + Math.random() * 0.08, 500 + Math.random() * 900, 0.04);
        },
    },
};
