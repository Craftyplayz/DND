// Viper Venom: bone-white vertebrae frame over a bubbling acid-green core, drips falling off the dice.
const poly = (g, c) => { g.beginPath(); c.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); };
const mid = (c) => c.reduce((a, p) => [a[0] + p[0] / c.length, a[1] + p[1] / c.length], [0, 0]);
const shrink = (c, k) => { const m = mid(c); return c.map(([x, y]) => [m[0] + (x - m[0]) * k, m[1] + (y - m[1]) * k]); };
const rng = (seed) => { let s = seed * 97 + 5; return () => ((s = (s * 16807) % 2147483647) / 2147483647); };

// bone frame: a thick rim, vertebra knobs along each edge with ribs reaching inward, an inner line, scale arcs
function bone(g, corners, col, w) {
    g.strokeStyle = col; g.fillStyle = col; g.lineCap = g.lineJoin = 'round';
    g.lineWidth = w * 2.4; poly(g, corners); g.stroke();
    const m = mid(corners);
    corners.forEach(([x, y], i) => {
        const [x2, y2] = corners[(i + 1) % corners.length], len = Math.hypot(x2 - x, y2 - y), n = Math.max(3, Math.round(len / 26));
        const ix = m[0] - (x + x2) / 2, iy = m[1] - (y + y2) / 2, il = Math.hypot(ix, iy) || 1;
        for (let k = 0; k <= n; k++) {
            const f = k / n, px = x + (x2 - x) * f, py = y + (y2 - y) * f;
            g.beginPath(); g.arc(px, py, w * 1.7, 0, 7); g.fill();
            if (k < n) {
                const f2 = (k + 0.5) / n, qx = x + (x2 - x) * f2, qy = y + (y2 - y) * f2;
                g.lineWidth = w * 0.7; g.beginPath(); g.moveTo(qx, qy); g.lineTo(qx + ix / il * w * 5, qy + iy / il * w * 5); g.stroke();
            }
        }
        g.beginPath(); g.arc(x, y, w * 2.6, 0, 7); g.fill();
    });
    g.lineWidth = w * 0.8; poly(g, shrink(corners, 0.84)); g.stroke();
}

// shared swirl/bubble overlay and drip material
let SH = null, lastDraw = -1;
const NB = 14, bub = [];
function shared(THREE) {
    if (SH) return SH;
    const N = 128, cv = document.createElement('canvas'); cv.width = cv.height = N;
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const dc = document.createElement('canvas'); dc.width = dc.height = 32;
    const dg = dc.getContext('2d'), gr = dg.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, 'rgba(230,255,200,1)'); gr.addColorStop(0.4, 'rgba(110,255,40,.8)'); gr.addColorStop(1, 'rgba(40,200,0,0)');
    dg.fillStyle = gr; dg.fillRect(0, 0, 32, 32);
    const dropMat = new THREE.PointsMaterial({ size: 9, sizeAttenuation: false, map: new THREE.CanvasTexture(dc), vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let i = 0; i < NB; i++) bub.push({ x: 0, y: 0, r: 0, life: 1, age: Math.random() * 3 });
    return (SH = { cv, g: cv.getContext('2d'), tex, mat, dropMat, N });
}
function swirl(sh, sec, dt) {
    const { g, N } = sh;
    g.clearRect(0, 0, N, N);
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 6; i++) { // slow swirling light blobs
        const a = sec * (0.6 + i * 0.17) + i * 1.9, x = N / 2 + Math.cos(a) * N * 0.24, y = N / 2 + Math.sin(a * 1.2 + i) * N * 0.24, r = N * (0.2 + 0.05 * Math.sin(sec * 1.7 + i));
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, i % 2 ? 'rgba(120,255,40,.28)' : 'rgba(40,200,60,.26)'); gr.addColorStop(1, 'rgba(0,120,0,0)');
        g.fillStyle = gr; g.fillRect(0, 0, N, N);
    }
    for (const b of bub) { // bubbles grow, then pop with a ring flash
        b.age += dt;
        if (b.age > b.life) { b.age = 0; b.life = 0.7 + Math.random() * 1.1; b.x = N * (0.2 + Math.random() * 0.6); b.y = N * (0.2 + Math.random() * 0.6); b.r = 4 + Math.random() * 7; }
        const k = b.age / b.life, r = b.r * (0.3 + k * 0.7) + (k > 0.9 ? (k - 0.9) * 60 : 0), a = k > 0.9 ? (1 - k) * 8 : 0.3 + k * 0.5;
        g.strokeStyle = `rgba(200,255,150,${a})`; g.lineWidth = 1.6; g.beginPath(); g.arc(b.x, b.y - k * 6, r, 0, 7); g.stroke();
        g.fillStyle = `rgba(160,255,80,${a * 0.25})`; g.fill();
        g.fillStyle = `rgba(255,255,230,${a * 0.7})`; g.fillRect(b.x - r * 0.4, b.y - k * 6 - r * 0.45, 2, 2);
    }
    g.globalCompositeOperation = 'source-over';
    sh.tex.needsUpdate = true;
}

// snake hiss: high-passed noise swell
function hiss(ac, out, noise, t, dur, peak) {
    const s = ac.createBufferSource(); s.buffer = noise; s.loop = true;
    const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 4500;
    const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + dur * 0.4); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(hp).connect(g).connect(out); s.start(t); s.stop(t + dur + 0.05);
}

const ND = 14;
export default {
    name: 'Viper Venom', ink: '#02140a', metal: 0.05, rough: 0.35, glow: 0.4, bumpScale: 5, physical: true, mat: { clearcoat: 0.6, clearcoatRoughness: 0.2 },
    font: 'Georgia, serif',
    paint(g, S, seed, corners) {
        const r = rng(seed);
        g.fillStyle = '#e8e2c8'; g.fillRect(0, 0, S, S);
        g.save(); poly(g, shrink(corners, 0.86)); g.clip();
        const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * 0.5);
        gr.addColorStop(0, '#9be83a'); gr.addColorStop(0.5, '#3fb81c'); gr.addColorStop(1, '#157a10');
        g.fillStyle = gr; g.fillRect(0, 0, S, S);
        for (let i = 0; i < 26; i++) { g.fillStyle = r() < 0.5 ? 'rgba(20,100,10,.22)' : 'rgba(240,255,170,.25)'; g.beginPath(); g.arc(r() * S, r() * S, 6 + r() * 20, 0, 7); g.fill(); }
        g.restore();
        bone(g, corners, '#efe9d2', 7);
        g.strokeStyle = 'rgba(90,80,50,.55)'; g.lineWidth = 1.5; poly(g, shrink(corners, 0.84)); g.stroke(); // shadow line where bone meets liquid
    },
    bump(g, S, seed, corners) { bone(g, corners, '#fff', 7); },
    decorate({ THREE, scene, mesh, faces }) {
        const sh = shared(THREE);
        const ov = new THREE.Mesh(mesh.geometry, sh.mat); ov.scale.setScalar(1.004); mesh.add(ov);
        const pos = new Float32Array(ND * 3), col = new Float32Array(ND * 3), vy = new Float32Array(ND), age = new Float32Array(ND).fill(-1);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
        const pts = new THREE.Points(geo, sh.dropMat); pts.frustumCulled = false; scene.add(pts);
        const v = new THREE.Vector3(); let acc = 0;
        const spawn = (i) => {
            const f = faces[(Math.random() * faces.length) | 0], a = Math.random() - 0.5, b = Math.random() - 0.5;
            v.set(f.c.x + (f.u.x * a + f.v.x * b) * f.r + f.n.x * 0.05, f.c.y + (f.u.y * a + f.v.y * b) * f.r + f.n.y * 0.05, f.c.z + (f.u.z * a + f.v.z * b) * f.r + f.n.z * 0.05);
            mesh.localToWorld(v); pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z; vy[i] = 0; age[i] = 0;
        };
        const step = (dt, rate) => {
            acc = Math.min(2, acc + dt * rate);
            for (let i = 0; i < ND; i++) {
                const p = i * 3;
                if (age[i] < 0) { if (acc >= 1) { acc -= 1; spawn(i); } else { col[p] = col[p + 1] = col[p + 2] = 0; continue; } }
                age[i] += dt;
                if (pos[p + 1] > 0) { vy[i] -= 9 * dt; pos[p + 1] += vy[i] * dt; if (pos[p + 1] <= 0) { pos[p + 1] = 0; age[i] = 1; } }
                const splat = pos[p + 1] <= 0, f = splat ? Math.max(0, 1 - (age[i] - 1) * 4) : Math.min(1, age[i] * 8) * 0.9;
                if (splat && f <= 0) { age[i] = -1; col[p] = col[p + 1] = col[p + 2] = 0; continue; }
                col[p] = f * 0.55; col[p + 1] = f; col[p + 2] = f * 0.25;
            }
            geo.attributes.position.needsUpdate = geo.attributes.color.needsUpdate = true;
        };
        mesh.updateMatrixWorld(true);
        for (let i = 0; i < 4; i++) { spawn(i); pos[i * 3 + 1] = Math.max(0.05, pos[i * 3 + 1] - 0.2 - i * 0.25); age[i] = 0.3; col[i * 3] = 0.5; col[i * 3 + 1] = 0.9; col[i * 3 + 2] = 0.2; }
        return {
            tick(sec, dt, body) {
                if (sec - lastDraw > 0.05 || sec < lastDraw) { swirl(sh, sec, sec < lastDraw || lastDraw < 0 ? 0.05 : Math.min(0.1, sec - lastDraw)); lastDraw = sec; }
                if (!body) return;
                const sp = Math.hypot(body.velocity.x, body.velocity.y, body.velocity.z) + Math.hypot(body.angularVelocity.x, body.angularVelocity.y, body.angularVelocity.z) * 0.3;
                step(dt, 0.6 + sp * 1.2);
            },
            dispose() { scene.remove(pts); geo.dispose(); mesh.remove(ov); },
        };
    },
    sound: {
        hit({ ac, out, noise, vol, onTable, t }) {
            // dry bone clack: band-passed noise tick + short high resonance
            const s = ac.createBufferSource(); s.buffer = noise;
            const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.6; bp.frequency.value = (onTable ? 1500 : 2300) * (0.85 + Math.random() * 0.3);
            const g = ac.createGain(); g.gain.setValueAtTime(vol * 0.7, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
            s.connect(bp).connect(g).connect(out); s.start(t, Math.random() * 0.2, 0.1);
            const o = ac.createOscillator(); o.type = 'triangle'; o.frequency.value = (onTable ? 780 : 1250) * (0.9 + Math.random() * 0.2);
            const og = ac.createGain(); og.gain.setValueAtTime(vol * 0.3, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
            o.connect(og).connect(out); o.start(t); o.stop(t + 0.13);
            if (Math.random() < 0.3) { // wet bubble gurgle
                const b = ac.createOscillator(), bg = ac.createGain(), f0 = 250 + Math.random() * 200;
                b.type = 'sine'; b.frequency.setValueAtTime(f0, t + 0.02); b.frequency.exponentialRampToValueAtTime(f0 * 2.2, t + 0.1); b.frequency.exponentialRampToValueAtTime(f0 * 1.3, t + 0.2);
                bg.gain.setValueAtTime(0.0001, t + 0.02); bg.gain.linearRampToValueAtTime(vol * 0.25, t + 0.05); bg.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
                b.connect(bg).connect(out); b.start(t + 0.02); b.stop(t + 0.24);
            }
        },
        throw({ ac, out, noise, t }) { hiss(ac, out, noise, t, 0.7, 0.4); },
        settle({ ac, out, noise, t }) {
            const b = ac.createOscillator(), bg = ac.createGain();
            b.type = 'sine'; b.frequency.setValueAtTime(220, t); b.frequency.exponentialRampToValueAtTime(520, t + 0.15); b.frequency.exponentialRampToValueAtTime(300, t + 0.35);
            const lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = 18; lg.gain.value = 40; lfo.connect(lg).connect(b.frequency);
            bg.gain.setValueAtTime(0.0001, t); bg.gain.linearRampToValueAtTime(0.25, t + 0.08); bg.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
            b.connect(bg).connect(out); b.start(t); lfo.start(t); b.stop(t + 0.5); lfo.stop(t + 0.5);
        },
    },
};
