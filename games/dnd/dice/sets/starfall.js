// Starfall: midnight nebula dice, a galaxy drifting inside the faces, bright stars orbiting each die.
const poly = (g, c) => { g.beginPath(); c.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); };
const shrink = (c, k) => { const m = mid(c); return c.map(([x, y]) => [m[0] + (x - m[0]) * k, m[1] + (y - m[1]) * k]); };
function mid(c) { return c.reduce((a, p) => [a[0] + p[0] / c.length, a[1] + p[1] / c.length], [0, 0]); }
const rng = (seed) => { let s = (seed * 7919 + 13) % 2147483647 || 1; return () => ((s = (s * 16807) % 2147483647) / 2147483647); };

// silver rim + constellation lines joining a few points inside the face
function silver(g, corners, col, w, r, withStars) {
    g.strokeStyle = col; g.fillStyle = col; g.lineCap = g.lineJoin = 'round';
    g.lineWidth = w * 1.6; poly(g, corners); g.stroke();
    g.lineWidth = w * 0.5; poly(g, shrink(corners, 0.86)); g.stroke();
    const m = mid(corners), pts = [];
    const n = 5 + ((r() * 3) | 0);
    for (let i = 0; i < n; i++) { // constellation on a ring around the number, kept off the centre
        const a = (i / n) * 6.283 + r() * 0.5, d = 70 + r() * 28;
        pts.push([m[0] + Math.cos(a) * d, m[1] + Math.sin(a) * d]);
    }
    g.lineWidth = w * 0.35; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
    pts.forEach(([x, y]) => { g.beginPath(); g.arc(x, y, withStars ? w * 0.9 : w * 0.6, 0, 7); g.fill(); });
    corners.forEach(([x, y]) => { g.beginPath(); g.arc(x, y, w * 1.4, 0, 7); g.fill(); });
}

let SH = null;
function shared(THREE) {
    if (SH) return SH;
    const N = 256, mk = (draw) => {
        const cv = document.createElement('canvas'); cv.width = cv.height = N;
        const g = cv.getContext('2d'); draw(g);
        const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.center.set(0.5, 0.5); return t;
    };
    const r = rng(77);
    // tileable: every blob/star is also drawn shifted by +-N so the edges match
    const wrap = (g, x, y, f) => { for (const dx of [-N, 0, N]) for (const dy of [-N, 0, N]) f(x + dx, y + dy); };
    const nebula = mk((g) => {
        g.globalCompositeOperation = 'lighter';
        const cols = ['120,70,255', '60,120,255', '255,80,190', '90,60,200'];
        for (let i = 0; i < 14; i++) {
            const x = r() * N, y = r() * N, rad = 40 + r() * 50, c = cols[i % 4];
            wrap(g, x, y, (X, Y) => { const gr = g.createRadialGradient(X, Y, 0, X, Y, rad); gr.addColorStop(0, `rgba(${c},.25)`); gr.addColorStop(1, `rgba(${c},0)`); g.fillStyle = gr; g.fillRect(X - rad, Y - rad, rad * 2, rad * 2); });
        }
    });
    const stars = (count, seed) => mk((g) => {
        const q = rng(seed); g.globalCompositeOperation = 'lighter';
        for (let i = 0; i < count; i++) {
            const x = q() * N, y = q() * N, big = q() < 0.12, rad = big ? 2.4 : 0.8 + q() * 0.8, tint = q() < 0.5 ? '255,255,255' : q() < 0.5 ? '190,210,255' : '255,200,240';
            wrap(g, x, y, (X, Y) => { const gr = g.createRadialGradient(X, Y, 0, X, Y, rad * 2.2); gr.addColorStop(0, `rgba(${tint},1)`); gr.addColorStop(1, `rgba(${tint},0)`); g.fillStyle = gr; g.fillRect(X - rad * 3, Y - rad * 3, rad * 6, rad * 6); });
        }
    });
    const lay = (map, opacity) => new THREE.MeshBasicMaterial({ map, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
    const neb = lay(nebula, 0.1), sA = lay(stars(90, 5), 0.9), sB = lay(stars(70, 9), 0.9);
    sA.map.repeat.set(1.4, 1.4); sB.map.repeat.set(2, 2); neb.map.repeat.set(1.2, 1.2);
    const sc = document.createElement('canvas'); sc.width = sc.height = 32;
    const sg = sc.getContext('2d'), gr = sg.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(200,215,255,.8)'); gr.addColorStop(1, 'rgba(120,140,255,0)');
    sg.fillStyle = gr; sg.fillRect(0, 0, 32, 32);
    const pm = new THREE.PointsMaterial({ size: 8, sizeAttenuation: false, map: new THREE.CanvasTexture(sc), vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    return (SH = { neb, sA, sB, pm });
}

const NB = 3, TR = 9; // orbiting stars per die, trail points per star
// dreamy pentatonic (Hz)
const SCALE = [784, 880, 988, 1175, 1319, 1568, 1760, 2093, 2349];
function ping(ac, out, t, f, vol, len) {
    const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0005, t + len); g.connect(out);
    for (const [m, a] of [[1, 1], [2.01, 0.35], [3.02, 0.12]]) {
        const o = ac.createOscillator(), og = ac.createGain(); o.type = 'sine'; o.frequency.value = f * m; og.gain.value = a; o.connect(og).connect(g); o.start(t); o.stop(t + len + 0.02);
    }
}

export default {
    name: 'Starfall', ink: '#f2f6ff', metal: 0, rough: 0.7, glow: 0.2, bumpScale: 3, physical: true,
    mat: { clearcoat: 0.1, clearcoatRoughness: 0.15 },
    paint(g, S, seed, corners) {
        const r = rng(seed);
        g.fillStyle = '#050a28'; g.fillRect(0, 0, S, S);
        g.save(); poly(g, corners); g.clip();
        const cols = ['100,60,230', '40,100,240', '230,60,170', '70,40,170'];
        for (let i = 0; i < 9; i++) {
            const x = r() * S, y = r() * S, rad = 45 + r() * 60, c = cols[i % 4], gr = g.createRadialGradient(x, y, 0, x, y, rad);
            gr.addColorStop(0, `rgba(${c},.28)`); gr.addColorStop(1, `rgba(${c},0)`); g.fillStyle = gr; g.fillRect(0, 0, S, S);
        }
        // darken the middle a touch so the number stays crisp
        const dk = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, 85); dk.addColorStop(0, 'rgba(4,6,24,.7)'); dk.addColorStop(1, 'rgba(4,6,24,0)');
        g.fillStyle = dk; g.fillRect(0, 0, S, S);
        for (let i = 0; i < 160; i++) { // dense starfield
            const a = 0.3 + r() * 0.7; g.fillStyle = `rgba(${r() < 0.3 ? '255,210,245' : '215,228,255'},${a})`;
            g.beginPath(); g.arc(r() * S, r() * S, r() < 0.08 ? 1.7 : 0.5 + r() * 0.7, 0, 7); g.fill();
        }
        g.restore();
        silver(g, corners, '#cfd8ee', 4, r, true);
    },
    bump(g, S, seed, corners) { silver(g, corners, '#fff', 4, rng(seed), false); },
    decorate({ THREE, mesh }) {
        const sh = shared(THREE);
        const ov = [sh.neb, sh.sA, sh.sB].map((m) => { const o = new THREE.Mesh(mesh.geometry, m); o.scale.setScalar(1.004); mesh.add(o); return o; });
        const n = NB * TR, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
        const pts = new THREE.Points(geo, sh.pm); pts.frustumCulled = false; mesh.add(pts);
        // each star: orbit axes (two orthonormal vectors), radius, speed, phase
        const orb = [];
        for (let i = 0; i < NB; i++) {
            const ax = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
            const a = new THREE.Vector3().crossVectors(ax, Math.abs(ax.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)).normalize();
            orb.push({ a, b: new THREE.Vector3().crossVectors(ax, a), rad: 1.3 + Math.random() * 0.25, sp: (0.9 + Math.random() * 0.8) * (i % 2 ? 1 : -1), ph: Math.random() * 6.28, hue: i });
        }
        const tint = [[1, 1, 1], [0.7, 0.85, 1], [1, 0.75, 0.95]];
        const place = (sec) => {
            for (let i = 0; i < NB; i++) {
                const o = orb[i], c = tint[o.hue];
                for (let k = 0; k < TR; k++) {
                    const ang = o.ph + sec * o.sp - k * 0.09 * Math.sign(o.sp), cs = Math.cos(ang) * o.rad, sn = Math.sin(ang) * o.rad, p = (i * TR + k) * 3, f = Math.pow(1 - k / TR, 1.6);
                    pos[p] = o.a.x * cs + o.b.x * sn; pos[p + 1] = o.a.y * cs + o.b.y * sn; pos[p + 2] = o.a.z * cs + o.b.z * sn;
                    col[p] = c[0] * f; col[p + 1] = c[1] * f; col[p + 2] = c[2] * f;
                }
            }
            geo.attributes.position.needsUpdate = geo.attributes.color.needsUpdate = true;
        };
        place(1.5);
        let last = -1;
        return {
            tick(sec) {
                place(sec);
                if (sec === last) return; last = sec; // shared layers: same value for every die in a frame
                sh.neb.map.rotation = sec * 0.05; sh.neb.map.offset.set(sec * 0.012, sec * 0.007);
                sh.sA.map.rotation = -sec * 0.09; sh.sA.map.offset.set(-sec * 0.02, sec * 0.015);
                sh.sB.map.rotation = sec * 0.13; sh.sB.map.offset.set(sec * 0.03, sec * 0.01);
                sh.sA.opacity = 0.55 + 0.45 * Math.sin(sec * 2.3); sh.sB.opacity = 0.55 + 0.45 * Math.sin(sec * 1.7 + 2);
            },
            dispose() { ov.forEach((o) => mesh.remove(o)); mesh.remove(pts); geo.dispose(); },
        };
    },
    sound: {
        hit({ ac, out, vol, onTable, t }) {
            const f = SCALE[(Math.random() * SCALE.length) | 0] * (onTable ? 0.5 : 1);
            ping(ac, out, t, f, 0.05 + vol * 0.16, 0.7);
        },
        throw({ ac, out, noise, t }) {
            const s = ac.createBufferSource(); s.buffer = noise; s.loop = true;
            const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 2.5;
            bp.frequency.setValueAtTime(500, t); bp.frequency.exponentialRampToValueAtTime(3200, t + 0.6);
            const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.22, t + 0.25); g.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
            s.connect(bp).connect(g).connect(out); s.start(t); s.stop(t + 0.85);
        },
        settle({ ac, out, t }) {
            const n = 4 + ((Math.random() * 3) | 0);
            let i = (Math.random() * 3) | 0;
            for (let k = 0; k < n; k++) { i = Math.min(SCALE.length - 1, i + 1 + ((Math.random() * 2) | 0)); ping(ac, out, t + k * 0.075, SCALE[i] * 1.5, 0.09, 0.6); }
        },
    },
};
