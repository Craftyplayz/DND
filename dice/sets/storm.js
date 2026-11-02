// Stormcaller: smoky slate glass with a roiling storm inside, crackled silver-blue edges, lightning flickering over the faces and arcs jumping off the edges.
const poly = (g, c) => { g.beginPath(); c.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); };
const mid = (c) => c.reduce((a, p) => [a[0] + p[0] / c.length, a[1] + p[1] / c.length], [0, 0]);
const rng = (seed) => { let s = seed * 97 + 5; return () => ((s = (s * 16807) % 2147483647) / 2147483647); };

// crackle: jagged branching cracks that start on the edges and wander inward
function cracks(g, corners, r, col, w) {
    const m = mid(corners);
    g.strokeStyle = col; g.lineCap = g.lineJoin = 'round';
    corners.forEach(([x, y], i) => {
        const [x2, y2] = corners[(i + 1) % corners.length];
        for (let k = 0; k < 2; k++) {
            const t = 0.2 + r() * 0.6; let px = x + (x2 - x) * t, py = y + (y2 - y) * t;
            g.lineWidth = w; g.beginPath(); g.moveTo(px, py);
            for (let s = 0; s < 5; s++) { px += (m[0] - px) * 0.14 + (r() - 0.5) * 22; py += (m[1] - py) * 0.14 + (r() - 0.5) * 22; g.lineTo(px, py); }
            g.stroke();
        }
    });
}

// shared animated overlays: 3 lightning canvases, redrawn together (<= ~20 fps)
let SH = null, lastDraw = -9;
const NB = 3, N = 128;
function shared(THREE) {
    if (SH) return SH;
    const lay = [];
    for (let i = 0; i < NB; i++) {
        const cv = document.createElement('canvas'); cv.width = cv.height = N;
        const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
        lay.push({ cv, g: cv.getContext('2d'), tex, mat: new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), flash: 0, next: Math.random() * 2, drawn: false });
    }
    const arcMat = new THREE.LineBasicMaterial({ color: 0xbfe4ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    return (SH = { lay, arcMat, act: 0.3 });
}
function bolt(g, x, y, ang, len, w, depth) {
    g.lineWidth = w; g.beginPath(); g.moveTo(x, y);
    const n = 7, st = len / n;
    for (let i = 0; i < n; i++) {
        ang += (Math.random() - 0.5) * 1.1; x += Math.cos(ang) * st; y += Math.sin(ang) * st; g.lineTo(x, y);
        if (depth > 0 && Math.random() < 0.3) { g.stroke(); bolt(g, x, y, ang + (Math.random() - 0.5) * 2, len * 0.45, w * 0.6, depth - 1); g.lineWidth = w; g.beginPath(); g.moveTo(x, y); }
    }
    g.stroke();
}
function strike(l) {
    const g = l.g; g.clearRect(0, 0, N, N);
    const a = Math.random() * 6.28, x = N / 2 + Math.cos(a) * N * 0.45, y = N / 2 + Math.sin(a) * N * 0.45;
    g.lineCap = g.lineJoin = 'round';
    g.shadowColor = '#7ab8ff'; g.shadowBlur = 8;
    g.strokeStyle = 'rgba(150,200,255,.9)'; bolt(g, x, y, a + Math.PI, N * 0.9, 4, 2);
    g.shadowBlur = 0; g.strokeStyle = '#fff'; // bright core over the same path is approximated by a thinner second pass
    bolt(g, x, y, a + Math.PI, N * 0.9, 1.6, 1);
    l.tex.needsUpdate = true; l.drawn = true;
}
function update(sh, sec, dt, act) {
    if (Math.abs(sec - lastDraw) < 0.05) return;
    const step = Math.min(0.2, Math.abs(sec - lastDraw)); lastDraw = sec;
    sh.act = act;
    for (const l of sh.lay) {
        l.next -= step * (0.35 + act * 4);
        if (l.next <= 0) { strike(l); l.flash = 1; l.next = 0.5 + Math.random() * 2.5; if (Math.random() < 0.3) l.flash = 1.4; }
        else l.flash = Math.max(0, l.flash - step * 4.5);
        l.mat.opacity = Math.min(1, l.flash * (0.6 + Math.random() * 0.4));
        l.mat.visible = l.flash > 0.02;
    }
}

const NA = 5, SEG = 4;
let fastAct = 0; // newest activity from the last die ticked, taken as max per frame
export default {
    name: 'Stormcaller', ink: '#e8f6ff', metal: 0.55, rough: 0.3, glow: 0.45, bumpScale: 5,
    physical: true, mat: { clearcoat: 0.5, clearcoatRoughness: 0.2 },
    font: '"Trebuchet MS", system-ui, sans-serif',
    paint(g, S, seed, corners) {
        const r = rng(seed);
        g.fillStyle = '#0c1118'; g.fillRect(0, 0, S, S);
        g.save(); poly(g, corners); g.clip();
        const bg = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * 0.62);
        bg.addColorStop(0, '#26303d'); bg.addColorStop(0.6, '#171e29'); bg.addColorStop(1, '#0b1018');
        g.fillStyle = bg; g.fillRect(0, 0, S, S);
        // storm clouds: many soft overlapping blobs, kept dim in the middle so the number reads
        for (let i = 0; i < 46; i++) {
            const x = r() * S, y = r() * S, rad = 18 + r() * 42, d = Math.hypot(x - S / 2, y - S / 2) / (S * 0.5);
            const a = (0.05 + r() * 0.12) * (0.4 + Math.min(1, d));
            const gr = g.createRadialGradient(x, y, 0, x, y, rad);
            const c = r() < 0.5 ? '120,140,170' : r() < 0.5 ? '60,75,100' : '6,9,14';
            gr.addColorStop(0, `rgba(${c},${a * 2})`); gr.addColorStop(1, `rgba(${c},0)`);
            g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
        }
        // dark core behind the number
        const core = g.createRadialGradient(S / 2, S / 2, 10, S / 2, S / 2, 85);
        core.addColorStop(0, 'rgba(5,8,13,.75)'); core.addColorStop(1, 'rgba(5,8,13,0)');
        g.fillStyle = core; g.fillRect(0, 0, S, S);
        // silver-blue crackled edges
        g.shadowColor = '#7fb6ff'; g.shadowBlur = 6;
        cracks(g, corners, r, 'rgba(170,205,240,.7)', 1.6);
        g.shadowBlur = 0;
        g.restore();
        g.lineJoin = 'round'; g.strokeStyle = '#a9c4e0'; g.lineWidth = 6; poly(g, corners); g.stroke();
        g.strokeStyle = '#e9f4ff'; g.lineWidth = 1.5; poly(g, corners); g.stroke();
    },
    bump(g, S, seed, corners) {
        const r = rng(seed);
        g.lineJoin = 'round'; g.strokeStyle = '#fff'; g.lineWidth = 9; poly(g, corners); g.stroke();
        cracks(g, corners, r, '#aaa', 2.5);
    },
    decorate({ THREE, mesh, faces }) {
        const sh = shared(THREE), lay = sh.lay[(Math.random() * NB) | 0];
        const ov = new THREE.Mesh(mesh.geometry, lay.mat); ov.scale.setScalar(1.004); mesh.add(ov);
        // edge list in local space for the arcs
        const edges = [];
        for (const f of faces) f.pts.forEach((p, i) => edges.push([p, f.pts[(i + 1) % f.pts.length], f.n]));
        const pos = new Float32Array(NA * SEG * 6), geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        const lines = new THREE.LineSegments(geo, sh.arcMat); lines.frustumCulled = false; mesh.add(lines);
        let acc = 0;
        const regen = (prob) => {
            for (let a = 0; a < NA; a++) {
                const o = a * SEG * 6;
                if (Math.random() > prob) { pos.fill(0, o, o + SEG * 6); continue; }
                const [p, q, n] = edges[(Math.random() * edges.length) | 0], t = Math.random();
                let x = p.x + (q.x - p.x) * t, y = p.y + (q.y - p.y) * t, z = p.z + (q.z - p.z) * t;
                // direction: outward along the face normal, wandering sideways
                let dx = n.x, dy = n.y, dz = n.z; const step = 0.1 + Math.random() * 0.08;
                for (let s = 0; s < SEG; s++) {
                    const k = o + s * 6;
                    pos[k] = x; pos[k + 1] = y; pos[k + 2] = z;
                    dx += (Math.random() - 0.5) * 1.6; dy += (Math.random() - 0.5) * 1.6; dz += (Math.random() - 0.5) * 1.6;
                    const L = Math.hypot(dx, dy, dz) || 1; dx /= L; dy /= L; dz /= L;
                    x += dx * step; y += dy * step; z += dz * step;
                    pos[k + 3] = x; pos[k + 4] = y; pos[k + 5] = z;
                }
            }
            geo.attributes.position.needsUpdate = true;
        };
        regen(0);
        return {
            tick(sec, dt, body) {
                const sp = body ? Math.hypot(body.velocity.x, body.velocity.y, body.velocity.z) + 0.3 * Math.hypot(body.angularVelocity.x, body.angularVelocity.y, body.angularVelocity.z) : 0;
                const act = Math.min(1, sp / 12);
                update(sh, sec, dt, act);
                if (!body) { if (!lines.userData.done) { lines.userData.done = 1; regen(1); } return; }
                acc += dt;
                const every = act > 0.1 ? 0.06 : 0.5;
                if (acc >= every) { acc = 0; regen(act > 0.1 ? 0.35 + act * 0.5 : 0.12); }
            },
            dispose() { mesh.remove(ov); mesh.remove(lines); geo.dispose(); },
        };
    },
    sound: {
        hit({ ac, out, noise, vol, onTable, t }) {
            // electric zap: bright noise burst through a high band-pass plus a quick descending buzz
            const s = ac.createBufferSource(); s.buffer = noise;
            const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 2.5; bp.frequency.value = (onTable ? 4200 : 6000) * (0.8 + Math.random() * 0.4);
            const g = ac.createGain(); g.gain.setValueAtTime(vol * 0.5, t);
            for (let i = 1; i < 5; i++) g.gain.setValueAtTime(vol * 0.5 * (Math.random() < 0.5 ? 1 : 0.2), t + i * 0.025);
            g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
            s.connect(bp).connect(g).connect(out); s.start(t, Math.random() * 0.2, 0.2);
            const o = ac.createOscillator(); o.type = 'sawtooth';
            o.frequency.setValueAtTime(1400 * (0.9 + Math.random() * 0.2), t); o.frequency.exponentialRampToValueAtTime(110, t + 0.14);
            const og = ac.createGain(); og.gain.setValueAtTime(vol * 0.18, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
            o.connect(og).connect(out); o.start(t); o.stop(t + 0.16);
        },
        throw({ ac, out, noise, t }) {
            // thunder: sharp crack, then a low-passed rumble swell
            const c = ac.createBufferSource(); c.buffer = noise;
            const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1500;
            const cg = ac.createGain(); cg.gain.setValueAtTime(0.7, t); cg.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
            c.connect(hp).connect(cg).connect(out); c.start(t); c.stop(t + 0.3);
            const s = ac.createBufferSource(); s.buffer = noise; s.loop = true;
            const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(900, t); lp.frequency.exponentialRampToValueAtTime(120, t + 1.4);
            const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.75, t + 0.12); g.gain.exponentialRampToValueAtTime(0.001, t + 1.5);
            s.connect(lp).connect(g).connect(out); s.start(t); s.stop(t + 1.55);
        },
        settle({ ac, out, noise, t }) {
            const s = ac.createBufferSource(); s.buffer = noise; s.loop = true;
            const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 150;
            const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.45, t + 0.4); g.gain.exponentialRampToValueAtTime(0.001, t + 2);
            s.connect(lp).connect(g).connect(out); s.start(t); s.stop(t + 2.05);
        },
    },
};
