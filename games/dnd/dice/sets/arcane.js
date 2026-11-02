// Arcane Orrery: violet glass, gold filigree, pulsing runes, three gold armillary rings with orbs.
const poly = (g, c) => { g.beginPath(); c.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); };
const mid = (c) => c.reduce((a, p) => [a[0] + p[0] / c.length, a[1] + p[1] / c.length], [0, 0]);
const shrink = (c, k) => { const m = mid(c); return c.map(([x, y]) => [m[0] + (x - m[0]) * k, m[1] + (y - m[1]) * k]); };
const RUNES = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ';
const rnd = (seed) => { let s = seed * 97 + 5; return () => ((s = (s * 16807) % 2147483647) / 2147483647); };

function filigree(g, corners, col, w) {
    g.strokeStyle = col; g.fillStyle = col; g.lineCap = g.lineJoin = 'round';
    g.lineWidth = w * 2; poly(g, corners); g.stroke();
    g.lineWidth = w * 0.6; poly(g, shrink(corners, 0.84)); g.stroke();
    const m = mid(corners);
    corners.forEach(([x, y], i) => {
        const [x2, y2] = corners[(i + 1) % corners.length];
        g.beginPath(); g.arc(x, y, w * 1.8, 0, 7); g.fill();
        // curl: little arc between the corner and the edge midpoint, and a spur toward the centre
        g.lineWidth = w * 0.5; g.beginPath(); g.moveTo(x, y); g.lineTo(m[0] + (x - m[0]) * 0.72, m[1] + (y - m[1]) * 0.72); g.stroke();
        g.beginPath(); g.arc((x + x2) / 2 * 0.9 + m[0] * 0.1, (y + y2) / 2 * 0.9 + m[1] * 0.1, w * 1.1, 0, 7); g.stroke();
    });
}

let SH = null, lastDraw = -1;
const N = 128;
function shared(THREE) {
    if (SH) return SH;
    const cv = document.createElement('canvas'); cv.width = cv.height = N;
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const ringGeo = new THREE.TorusGeometry(1, 0.014, 6, 64);
    const ringMat = new THREE.MeshStandardMaterial({ color: 0xffd36a, metalness: 1, roughness: 0.25, emissive: 0x6a4a10, emissiveIntensity: 0.6 });
    const orbGeo = new THREE.SphereGeometry(0.06, 10, 8);
    const orbMat = new THREE.MeshBasicMaterial({ color: 0xd9b8ff });
    return (SH = { cv, g: cv.getContext('2d'), tex, mat, ringGeo, ringMat, orbGeo, orbMat });
}
function pulse(sh, sec) {
    const { g } = sh;
    g.clearRect(0, 0, N, N);
    g.font = '15px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const n = 10;
    for (let i = 0; i < n; i++) {
        const a = i / n * 6.2832, k = 0.5 + 0.5 * Math.sin(sec * 2.2 - i * 0.63); // a wave runs round the ring
        g.fillStyle = `rgba(${190 + k * 65 | 0},${140 + k * 90 | 0},255,${0.12 + k * 0.85})`;
        g.shadowColor = '#b070ff'; g.shadowBlur = 6 * k;
        g.fillText(RUNES[(i * 5 + 3) % RUNES.length], N / 2 + Math.cos(a) * N * 0.4, N / 2 + Math.sin(a) * N * 0.4);
    }
    g.shadowBlur = 0;
    sh.tex.needsUpdate = true;
}

const SCALE = [0, 2, 4, 7, 9]; // major pentatonic
const note = (oct) => 261.63 * Math.pow(2, (SCALE[(Math.random() * 5) | 0] + 12 * oct) / 12);
function bell(ac, out, t, f, peak, dur) {
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    g.connect(out);
    for (const [m, a] of [[1, 1], [2.76, 0.4], [5.4, 0.15]]) {
        const o = ac.createOscillator(), og = ac.createGain(); o.type = 'sine'; o.frequency.value = f * m; og.gain.value = a;
        o.connect(og).connect(g); o.start(t); o.stop(t + dur + 0.02);
    }
}

export default {
    name: 'Arcane Orrery', ink: '#fff0c4', metal: 0.2, rough: 0.12, glow: 0.35, bumpScale: 4, font: 'Georgia, serif',
    physical: true, mat: { clearcoat: 1, clearcoatRoughness: 0.05, iridescence: 0.4 },
    paint(g, S, seed, corners) {
        const r = rnd(seed);
        const gr = g.createRadialGradient(S / 2, S / 2, 10, S / 2, S / 2, S * 0.62);
        gr.addColorStop(0, '#4a2290'); gr.addColorStop(0.6, '#2a0f5c'); gr.addColorStop(1, '#14052e');
        g.fillStyle = gr; g.fillRect(0, 0, S, S);
        for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(190,150,255,${r() * 0.12})`; g.beginPath(); g.arc(r() * S, r() * S, 4 + r() * 18, 0, 7); g.fill(); }
        for (let i = 0; i < 25; i++) { g.fillStyle = 'rgba(255,230,170,.7)'; g.fillRect(r() * S, r() * S, 1.5, 1.5); }
        // rune ring (static, dim): the live pulse is the overlay
        const m = mid(corners); g.fillStyle = 'rgba(214,170,255,.3)'; g.font = '22px serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        for (let i = 0; i < 8; i++) { const a = i / 8 * 6.2832 + 0.4; g.fillText(RUNES[(seed + i * 3) % RUNES.length], m[0] + Math.cos(a) * S * 0.37, m[1] + Math.sin(a) * S * 0.37); }
        g.strokeStyle = 'rgba(255,211,106,.45)'; g.lineWidth = 1.5; g.beginPath(); g.arc(m[0], m[1], S * 0.3, 0, 7); g.stroke();
        filigree(g, corners, '#e8b84a', 4);
    },
    bump(g, S, seed, corners) { filigree(g, corners, '#fff', 4); },
    decorate({ THREE, mesh }) {
        const sh = shared(THREE);
        const ov = new THREE.Mesh(mesh.geometry, sh.mat); ov.scale.setScalar(1.004); mesh.add(ov);
        const rings = [], root = new THREE.Group(); mesh.add(root);
        const R = [1.38, 1.5, 1.6], tilt = [[0.2, 0], [1.1, 0.6], [0.5, -1.2]], spd = [1.1, -0.8, 1.6];
        for (let i = 0; i < 3; i++) {
            const outer = new THREE.Group(), spin = new THREE.Group();
            outer.rotation.set(tilt[i][0] + Math.random() * 0.4, 0, tilt[i][1]);
            const ring = new THREE.Mesh(sh.ringGeo, sh.ringMat); ring.scale.setScalar(R[i]); ring.rotation.x = Math.PI / 2;
            const orb = new THREE.Mesh(sh.orbGeo, sh.orbMat); orb.position.set(R[i], 0, 0);
            spin.add(ring, orb); spin.rotation.y = i * 2; outer.add(spin); root.add(outer); rings.push(spin);
        }
        return {
            tick(sec, dt) {
                if (sec - lastDraw > 0.05 || sec < lastDraw) { lastDraw = sec; pulse(sh, sec); }
                if (dt === 0) { rings[0].rotation.y = 0.8; rings[1].rotation.y = 2.5; rings[2].rotation.y = 4.2; return; }
                for (let i = 0; i < 3; i++) rings[i].rotation.y += spd[i] * dt;
            },
            dispose() { mesh.remove(ov); mesh.remove(root); },
        };
    },
    sound: {
        hit({ ac, out, vol, onTable, t }) {
            bell(ac, out, t, note(onTable ? 1 : 2) , Math.min(0.5, vol * 0.5 + 0.03), onTable ? 0.35 : 0.6);
        },
        throw({ ac, out, t }) {
            const o = ac.createOscillator(), g = ac.createGain(), o2 = ac.createOscillator();
            o.type = 'triangle'; o2.type = 'sine';
            o.frequency.setValueAtTime(400, t); o.frequency.exponentialRampToValueAtTime(2400, t + 0.5);
            o2.frequency.setValueAtTime(603, t); o2.frequency.exponentialRampToValueAtTime(3600, t + 0.5);
            g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.12, t + 0.3); g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
            o.connect(g); o2.connect(g); g.connect(out); o.start(t); o2.start(t); o.stop(t + 0.65); o2.stop(t + 0.65);
        },
        settle({ ac, out, t }) {
            [0, 4, 7].forEach((s, i) => bell(ac, out, t + i * 0.06, 261.63 * Math.pow(2, s / 12), 0.15, 1.1));
        },
    },
};
