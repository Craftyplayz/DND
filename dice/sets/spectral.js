// Spectral: half-there glass dice, a wisp circling each one with a fading trail, swirling inner mist.
const poly = (g, c) => { g.beginPath(); c.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); };
const mid = (c) => c.reduce((a, p) => [a[0] + p[0] / c.length, a[1] + p[1] / c.length], [0, 0]);
const shrink = (c, k) => { const m = mid(c); return c.map(([x, y]) => [m[0] + (x - m[0]) * k, m[1] + (y - m[1]) * k]); };
const rng = (seed) => { let s = seed * 97 + 5; return () => ((s = (s * 16807) % 2147483647) / 2147483647); };

// faint wispy etchings: curling strands that start at the corners and fade toward the centre
function wisps(g, S, seed, corners, col, w) {
    const r = rng(seed), m = mid(corners);
    g.strokeStyle = col; g.lineCap = g.lineJoin = 'round';
    g.lineWidth = w * 1.6; poly(g, corners); g.stroke();
    g.lineWidth = w * 0.6; poly(g, shrink(corners, 0.84)); g.stroke();
    for (const [x, y] of corners) {
        for (let k = 0; k < 2; k++) {
            const side = k ? 1 : -1, t0 = 0.35 + r() * 0.2;
            const ex = m[0] + (x - m[0]) * t0, ey = m[1] + (y - m[1]) * t0;
            const cx = (x + ex) / 2 - (ey - y) * 0.35 * side, cy = (y + ey) / 2 + (ex - x) * 0.35 * side;
            g.lineWidth = w * 0.7; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(cx, cy, ex, ey); g.stroke();
            g.beginPath(); g.arc(ex + (cy - ey) * 0.25, ey - (cx - ex) * 0.25, w * (0.9 + r()), 0, 7); g.lineWidth = w * 0.45; g.stroke();
        }
    }
}

// shared across dice
let SH = null, lastDraw = -1;
const NT = 32;
function shared(THREE) {
    if (SH) return SH;
    const N = 128, cv = document.createElement('canvas'); cv.width = cv.height = N;
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.8 });
    const oc = document.createElement('canvas'); oc.width = oc.height = 64;
    const og = oc.getContext('2d'), gr = og.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(170,255,255,.8)'); gr.addColorStop(1, 'rgba(60,200,255,0)');
    og.fillStyle = gr; og.fillRect(0, 0, 64, 64);
    const orbMat = new THREE.PointsMaterial({ size: 34, sizeAttenuation: false, map: new THREE.CanvasTexture(oc), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const trailMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const dotMat = new THREE.PointsMaterial({ size: 9, sizeAttenuation: false, map: orbMat.map, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    return (SH = { cv, g: cv.getContext('2d'), tex, mat, orbMat, trailMat, dotMat, N });
}
function mist(sh, sec) {
    const { g, N } = sh;
    g.clearRect(0, 0, N, N); g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 8; i++) {
        const a = sec * (0.25 + i * 0.05) * (i % 2 ? 1 : -1) + i * 1.7, rad = N * (0.12 + 0.1 * ((i * 3) % 4) / 3);
        const x = N / 2 + Math.cos(a) * rad + Math.sin(sec * 0.4 + i) * 8, y = N / 2 + Math.sin(a) * rad + Math.cos(sec * 0.5 + i * 2) * 8, r = N * (0.2 + 0.05 * Math.sin(sec * 0.8 + i));
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, i % 3 ? 'rgba(150,235,255,.3)' : 'rgba(220,200,255,.28)'); gr.addColorStop(1, 'rgba(100,200,255,0)');
        g.fillStyle = gr; g.fillRect(0, 0, N, N);
    }
    g.globalCompositeOperation = 'source-over'; sh.tex.needsUpdate = true;
}

export default {
    name: 'Spectral', ink: '#06303f', metal: 0.1, rough: 0.12, glow: 0.35, bumpScale: 2, font: 'Georgia, serif',
    physical: true,
    mat: { transparent: true, opacity: 0.7, iridescence: 1, iridescenceIOR: 1.4, clearcoat: 1, clearcoatRoughness: 0.1, sheen: 0.5, sheenColor: 0x99ffff },
    paint(g, S, seed, corners) {
        const gr = g.createRadialGradient(S / 2, S / 2, 10, S / 2, S / 2, S * 0.62);
        gr.addColorStop(0, '#c8f6f8'); gr.addColorStop(0.6, '#74c6dc'); gr.addColorStop(1, '#3a8fb4');
        g.fillStyle = gr; g.fillRect(0, 0, S, S);
        const r = rng(seed); // soft cloudy patches (the centre stays calm for the number)
        for (let i = 0; i < 14; i++) { g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,.22)' : 'rgba(120,170,230,.18)'; g.beginPath(); g.arc(r() * S, r() * S, 12 + r() * 28, 0, 7); g.fill(); }
        g.shadowColor = '#ffffff'; g.shadowBlur = 10;
        wisps(g, S, seed, corners, 'rgba(255,255,255,.95)', 4);
        g.shadowBlur = 0;
    },
    bump(g, S, seed, corners) { wisps(g, S, seed, corners, '#fff', 4); },
    decorate({ THREE, scene, mesh }) {
        const sh = shared(THREE);
        const ov = new THREE.Mesh(mesh.geometry, sh.mat); ov.scale.setScalar(1.004); mesh.add(ov);
        const tp = new Float32Array(NT * 3), tc = new Float32Array(NT * 3), op = new Float32Array(3);
        for (let i = 0; i < NT; i++) { const f = Math.pow(1 - i / NT, 2); tc[i * 3] = 0.45 * f; tc[i * 3 + 1] = 0.95 * f; tc[i * 3 + 2] = f; }
        const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.BufferAttribute(tp, 3)); tg.setAttribute('color', new THREE.BufferAttribute(tc, 3));
        const trail = new THREE.Line(tg, sh.trailMat); trail.frustumCulled = false; scene.add(trail); const dots = new THREE.Points(tg, sh.dotMat); dots.frustumCulled = false; scene.add(dots);
        const og = new THREE.BufferGeometry(); og.setAttribute('position', new THREE.BufferAttribute(op, 3));
        const orb = new THREE.Points(og, sh.orbMat); orb.frustumCulled = false; scene.add(orb);
        const ph = Math.random() * 6.28, sp = 2.2 + Math.random() * 0.8, tilt = 0.5 + Math.random() * 0.5, R = 1.35, ty = 0.2;
        const at = (a, c, o, i) => { // a tilted circle round the die centre
            o[i] = c.x + Math.cos(a) * R; o[i + 1] = c.y + ty + Math.sin(a) * R * tilt; o[i + 2] = c.z + Math.sin(a) * R;
        };
        return {
            tick(sec, dt, body) {
                if (sec - lastDraw > 0.05 || sec < lastDraw) { lastDraw = sec; mist(sh, sec); }
                sh.mat.opacity = 0.6 + 0.25 * Math.sin(sec * 1.7); // half there
                const c = mesh.position, a = sec * sp + ph;
                if (!body) for (let i = 0; i < NT; i++) at(a - i * 0.09, c, tp, i * 3); // preview: trail laid along the orbit
                else { tp.copyWithin(3, 0, (NT - 1) * 3); at(a, c, tp, 0); }
                at(a, c, op, 0);
                tg.attributes.position.needsUpdate = og.attributes.position.needsUpdate = true;
            },
            dispose() { mesh.remove(ov); scene.remove(trail); scene.remove(dots); scene.remove(orb); tg.dispose(); og.dispose(); },
        };
    },
    sound: {
        hit({ ac, out, noise, vol, onTable, t }) {
            const s = ac.createBufferSource(); s.buffer = noise;
            const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 9; bp.frequency.value = (onTable ? 420 : 700) * (0.9 + Math.random() * 0.2);
            const g = ac.createGain(); g.gain.setValueAtTime(vol * 0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
            const d = ac.createDelay(0.5); d.delayTime.value = 0.09; const fb = ac.createGain(); fb.gain.value = 0.45; const eg = ac.createGain(); eg.gain.value = 0.5;
            s.connect(bp).connect(g); g.connect(out); g.connect(d); d.connect(fb).connect(d); d.connect(eg).connect(out);
            s.start(t, Math.random() * 0.15, 0.1);
            setTimeout(() => { try { g.disconnect(); d.disconnect(); fb.disconnect(); } catch (e) {} }, 700); // ends the echo loop
        },
        throw({ ac, out, noise, t }) {
            const s = ac.createBufferSource(); s.buffer = noise; s.loop = true;
            const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 2;
            bp.frequency.setValueAtTime(500, t); bp.frequency.linearRampToValueAtTime(1600, t + 0.5);
            const lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = 7; lg.gain.value = 120; lfo.connect(lg).connect(bp.frequency);
            const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.45, t + 0.3); g.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
            s.connect(bp).connect(g).connect(out); s.start(t); s.stop(t + 0.85); lfo.start(t); lfo.stop(t + 0.85);
        },
        settle({ ac, out, t }) {
            const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
            const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.22, t + 0.3); g.gain.exponentialRampToValueAtTime(0.001, t + 1.6);
            const vib = ac.createOscillator(), vg = ac.createGain(); vib.frequency.value = 5; vg.gain.value = 4; vib.connect(vg);
            for (const f of [150, 154]) { const o = ac.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(f * 1.1, t); o.frequency.exponentialRampToValueAtTime(f * 0.9, t + 1.6); vg.connect(o.frequency); o.connect(lp); o.start(t); o.stop(t + 1.65); }
            lp.connect(g).connect(out); vib.start(t); vib.stop(t + 1.65);
        },
    },
};
