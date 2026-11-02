// Clockwork: brass faces etched with interlocking gears; little toothed gears turn at the corners while the die moves.
const poly = (g, c) => { g.beginPath(); c.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); };
const mid = (c) => c.reduce((a, p) => [a[0] + p[0] / c.length, a[1] + p[1] / c.length], [0, 0]);
const shrink = (c, k) => { const m = mid(c); return c.map(([x, y]) => [m[0] + (x - m[0]) * k, m[1] + (y - m[1]) * k]); };

// toothed wheel outline path (canvas), centred on x,y
function gearPath(g, x, y, r, n, rot) {
    g.beginPath();
    for (let i = 0; i < n * 4; i++) {
        const a = rot + (i / (n * 4)) * Math.PI * 2, rr = (i & 3) < 2 ? r : r * 0.8;
        g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    g.closePath();
}
// the etching: gears hugging the corners, spokes, rivets
function etch(g, corners, col, w) {
    const m = mid(corners);
    g.strokeStyle = g.fillStyle = col; g.lineJoin = 'round'; g.lineWidth = w;
    corners.forEach(([x, y], i) => {
        const cx = m[0] + (x - m[0]) * 0.72, cy = m[1] + (y - m[1]) * 0.72, r = 30 + (i % 2) * 8, n = 9 + (i % 2) * 2;
        gearPath(g, cx, cy, r, n, (i % 2) * Math.PI / n); g.stroke();
        g.beginPath(); g.arc(cx, cy, r * 0.35, 0, 7); g.stroke();
        for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + i; g.beginPath(); g.moveTo(cx + Math.cos(a) * r * 0.35, cy + Math.sin(a) * r * 0.35); g.lineTo(cx + Math.cos(a) * r * 0.78, cy + Math.sin(a) * r * 0.78); g.stroke(); }
        g.beginPath(); g.arc(cx, cy, 5, 0, 7); g.fill();
        g.beginPath(); g.arc(x + (m[0] - x) * 0.1, y + (m[1] - y) * 0.1, 5, 0, 7); g.fill(); // rivet
    });
}

// one crisp metal click: a short band-passed noise burst
function click(ac, out, noise, t, f, v) {
    const s = ac.createBufferSource(); s.buffer = noise;
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 4;
    const g = ac.createGain(); g.gain.setValueAtTime(Math.min(0.8, v), t); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.04);
    s.connect(bp).connect(g).connect(out); s.start(t, Math.random() * 0.3, 0.05);
}

// shared gear geometry and materials (made on first decorate; THREE arrives as an argument)
let SH = null;
function shared(THREE) {
    if (SH) return SH;
    const n = 8, sp = new THREE.Shape();
    for (let i = 0; i < n * 4; i++) {
        const a = (i / (n * 4)) * Math.PI * 2, rr = (i & 3) < 2 ? 1 : 0.78;
        i ? sp.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : sp.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    const hole = new THREE.Path(); hole.absarc(0, 0, 0.3, 0, Math.PI * 2, true); sp.holes.push(hole);
    for (let k = 0; k < 3; k++) { const h = new THREE.Path(), a = k * 2.094 + 0.5; h.absarc(Math.cos(a) * 0.55, Math.sin(a) * 0.55, 0.12, 0, Math.PI * 2, true); sp.holes.push(h); }
    const geo = new THREE.ExtrudeGeometry(sp, { depth: 0.3, bevelEnabled: false, curveSegments: 6 });
    geo.translate(0, 0, -0.15);
    const brass = new THREE.MeshStandardMaterial({ color: 0xe0a83c, metalness: 0.9, roughness: 0.3, flatShading: true });
    const bronze = new THREE.MeshStandardMaterial({ color: 0x8a5420, metalness: 0.85, roughness: 0.4, flatShading: true });
    const axle = new THREE.CylinderGeometry(0.05, 0.05, 0.12, 8);
    axle.rotateX(Math.PI / 2);
    return (SH = { geo, brass, bronze, axle, z: new THREE.Vector3(0, 0, 1) });
}

export default {
    name: 'Clockwork', ink: '#2a1400', metal: 0.85, rough: 0.34, bumpScale: 4, font: 'Georgia, serif',
    paint(g, S, seed, corners) {
        const rnd = (() => { let s = seed * 131 + 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
        g.fillStyle = '#6b3d14'; g.fillRect(0, 0, S, S);
        g.save(); poly(g, shrink(corners, 0.93)); g.clip();
        const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * 0.55);
        gr.addColorStop(0, '#f0c673'); gr.addColorStop(0.55, '#d3993f'); gr.addColorStop(1, '#a8702a');
        g.fillStyle = gr; g.fillRect(0, 0, S, S);
        g.globalAlpha = 0.07; // brushed streaks
        for (let i = 0; i < 90; i++) { g.fillStyle = rnd() < 0.5 ? '#fff' : '#000'; g.fillRect(0, rnd() * S, S, 1 + rnd()); }
        g.globalAlpha = 1;
        etch(g, corners, 'rgba(80,42,8,.75)', 2.2);
        g.restore();
        g.lineJoin = 'round'; g.strokeStyle = '#4a2608'; g.lineWidth = 10; poly(g, corners); g.stroke();
        g.strokeStyle = '#8a5a22'; g.lineWidth = 2; poly(g, shrink(corners, 0.9)); g.stroke();
    },
    bump(g, S, seed, corners) {
        g.save(); poly(g, shrink(corners, 0.93)); g.clip(); etch(g, corners, '#fff', 3); g.restore();
        g.strokeStyle = '#fff'; g.lineWidth = 3; poly(g, shrink(corners, 0.9)); g.stroke();
    },
    decorate({ THREE, mesh, faces }) {
        const sh = shared(THREE);
        // up to 6 corners spread over the die (farthest-point picking)
        const vs = [];
        for (const f of faces) for (const p of f.pts) if (!vs.some((q) => q.distanceTo(p) < 1e-3)) vs.push(p);
        const pick = [vs[0]];
        while (pick.length < Math.min(6, vs.length)) {
            let best = null, bd = -1;
            for (const p of vs) { const d = Math.min(...pick.map((q) => q.distanceTo(p))); if (d > bd) { bd = d; best = p; } }
            pick.push(best);
        }
        const gears = pick.map((p, i) => {
            const d = p.clone().normalize(), big = i % 2 === 0;
            const m = new THREE.Mesh(sh.geo, big ? sh.brass : sh.bronze);
            const s = big ? 0.3 : 0.23; m.scale.set(s, s, 1);
            m.position.copy(d).multiplyScalar(p.length() + 0.04);
            m.quaternion.setFromUnitVectors(sh.z, d);
            const axle = new THREE.Mesh(sh.axle, sh.bronze);
            axle.position.copy(d).multiplyScalar(p.length() - 0.02); axle.quaternion.copy(m.quaternion);
            mesh.add(m, axle);
            return { m, axle, base: m.quaternion.clone(), dir: i % 2 ? -1 : 1, ph: i * 0.7 };
        });
        const q = new THREE.Quaternion();
        let w = 0, ang = 0;
        const tick = (sec, dt, body) => {
            let target = 3; // preview: slow idle turn
            if (body) {
                const v = body.velocity, a = body.angularVelocity;
                target = Math.min(14, Math.hypot(v.x, v.y, v.z) * 1.2 + Math.hypot(a.x, a.y, a.z) * 0.6);
                if (target < 0.4) target = 0; // at rest the gears stop
            }
            w += (target - w) * Math.min(1, dt * (target > w ? 8 : 2.5));
            ang += w * dt;
            for (const g of gears) { q.setFromAxisAngle(sh.z, g.dir * ang * (g.dir > 0 ? 1 : 1.3) + g.ph); g.m.quaternion.copy(g.base).multiply(q); }
        };
        tick(1.5, 0, null);
        return { tick, dispose() { for (const g of gears) mesh.remove(g.m, g.axle); } };
    },
    sound: {
        hit({ ac, out, noise, vol, onTable, t }) {
            click(ac, out, noise, t, (onTable ? 2600 : 3800) * (0.85 + Math.random() * 0.3), vol * 0.6);
            if (vol > 0.25) click(ac, out, noise, t + 0.035 + Math.random() * 0.02, 1800, vol * 0.35);
            const o = ac.createOscillator(), g = ac.createGain(); o.type = 'triangle'; o.frequency.value = (onTable ? 1100 : 1700) * (0.9 + Math.random() * 0.2);
            g.gain.setValueAtTime(vol * 0.18 + 0.0002, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18); o.connect(g).connect(out); o.start(t); o.stop(t + 0.2);
        },
        throw({ ac, out, noise, t }) { // winding: a ratchet run speeding up
            let tt = t, gap = 0.06;
            for (let i = 0; i < 16; i++) { click(ac, out, noise, tt, 1500 + i * 70, 0.35); tt += gap; gap *= 0.93; }
        },
        settle({ ac, out, noise, t }) { // tick, tock, slowing, then a small bell
            let tt = t + 0.05, gap = 0.2;
            for (let i = 0; i < 5; i++) { click(ac, out, noise, tt, i % 2 ? 1700 : 2300, 0.45 - i * 0.04); tt += gap; gap *= 1.35; }
            for (const [m, v] of [[1, 0.25], [2.76, 0.1], [5.4, 0.04]]) {
                const o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine'; o.frequency.value = 1568 * m;
                g.gain.setValueAtTime(0.0001, tt); g.gain.linearRampToValueAtTime(v, tt + 0.005); g.gain.exponentialRampToValueAtTime(0.001, tt + 1.2);
                o.connect(g).connect(out); o.start(tt); o.stop(tt + 1.25);
            }
        },
    },
};
