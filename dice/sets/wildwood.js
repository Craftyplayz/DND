// Wildwood: living carved wood wrapped in leafy vines, swaying leaves and drifting fireflies.
const mid = (c) => c.reduce((a, p) => [a[0] + p[0] / c.length, a[1] + p[1] / c.length], [0, 0]);
const rng = (s) => () => ((s = (s * 16807) % 2147483647) / 2147483647);

// vine along each real edge (pulled a little inward), with small leaves alternating on both sides
function vines(g, corners, seed, mode) {
    const r = rng(seed * 53 + 11), m = mid(corners), n = corners.length;
    g.lineCap = g.lineJoin = 'round';
    const leaves = [];
    corners.forEach(([x1, y1], i) => {
        const [x2, y2] = corners[(i + 1) % n], len = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / len, uy = (y2 - y1) / len;
        let nx = -uy, ny = ux; if ((m[0] - x1) * nx + (m[1] - y1) * ny < 0) { nx = -nx; ny = -ny; }
        const ph = r() * 6, pts = [];
        for (let k = 0; k <= 24; k++) {
            const t = k / 24, w = Math.sin(t * Math.PI * 3 + ph) * 5 + 13 * Math.sin(t * Math.PI) * 0.4 + 9;
            pts.push([x1 + ux * len * t + nx * w, y1 + uy * len * t + ny * w, t]);
        }
        const path = () => { g.beginPath(); pts.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y))); };
        if (mode === 'paint') {
            g.strokeStyle = '#173a14'; g.lineWidth = 9; path(); g.stroke();
            g.strokeStyle = '#3f8a2c'; g.lineWidth = 5; path(); g.stroke();
            g.strokeStyle = 'rgba(190,240,120,.55)'; g.lineWidth = 1.6; path(); g.stroke();
        } else { g.strokeStyle = '#fff'; g.lineWidth = 8; path(); g.stroke(); }
        for (let k = 2; k < 24; k += 3) {
            const [px, py] = pts[k], side = k % 2 ? 1 : -1, a = Math.atan2(uy, ux) + side * (0.9 + r() * 0.5), L = 11 + r() * 7;
            leaves.push([px, py, a, L, r()]);
        }
    });
    for (const [px, py, a, L, c] of leaves) {
        g.save(); g.translate(px, py); g.rotate(a);
        g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(L * 0.5, -L * 0.55, L, 0); g.quadraticCurveTo(L * 0.5, L * 0.55, 0, 0);
        if (mode === 'paint') {
            g.fillStyle = c < 0.5 ? '#4fa535' : '#7cc043'; g.fill(); g.strokeStyle = '#133010'; g.lineWidth = 1; g.stroke();
            g.beginPath(); g.moveTo(0, 0); g.lineTo(L * 0.9, 0); g.strokeStyle = 'rgba(220,255,160,.6)'; g.stroke();
        } else { g.fillStyle = '#ddd'; g.fill(); }
        g.restore();
    }
}

// shared across every die of this set (made on first decorate)
let SH = null;
function shared(THREE) {
    if (SH) return SH;
    const s = new THREE.Shape(); s.moveTo(0, 0); s.quadraticCurveTo(0.2, 0.12, 0, 0.5); s.quadraticCurveTo(-0.2, 0.12, 0, 0);
    const leafGeo = new THREE.ShapeGeometry(s, 4);
    const leafMats = [0x5fae3a, 0x3f8f35, 0x8cc84a].map((c) => new THREE.MeshStandardMaterial({ color: c, side: THREE.DoubleSide, roughness: 0.6, emissive: 0x1a4a10 }));
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const g = c.getContext('2d'), gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, 'rgba(255,255,220,1)'); gr.addColorStop(0.3, 'rgba(190,255,90,.8)'); gr.addColorStop(1, 'rgba(120,220,40,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
    const fireMat = new THREE.PointsMaterial({ size: 9, sizeAttenuation: false, map: new THREE.CanvasTexture(c), vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    return (SH = { leafGeo, leafMats, fireMat });
}

export default {
    name: 'Wildwood', ink: '#f6e9b4', metal: 0, rough: 0.7, glow: 0.18, bumpScale: 4, font: 'Georgia, serif',
    physical: true, mat: { clearcoat: 0.25, clearcoatRoughness: 0.6 },
    paint(g, S, seed, corners) {
        const r = rng(seed * 97 + 5);
        g.fillStyle = '#7a4a24'; g.fillRect(0, 0, S, S);
        // grain: long wobbling streaks
        const ang = r() * Math.PI; g.save(); g.translate(S / 2, S / 2); g.rotate(ang);
        for (let i = 0; i < 46; i++) {
            const y = (r() - 0.5) * S * 1.5, d = r();
            g.strokeStyle = d < 0.55 ? `rgba(40,20,8,${0.2 + r() * 0.3})` : `rgba(200,140,80,${0.1 + r() * 0.2})`; g.lineWidth = 1 + r() * 4;
            g.beginPath(); g.moveTo(-S, y); for (let x = -S; x <= S; x += 30) g.lineTo(x, y + Math.sin(x / 55 + i) * 7 + (r() - 0.5) * 3); g.stroke();
        }
        g.restore();
        // darker heartwood centre keeps the number readable
        const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * 0.5);
        gr.addColorStop(0, 'rgba(34,16,6,.92)'); gr.addColorStop(0.55, 'rgba(48,24,9,.7)'); gr.addColorStop(1, 'rgba(48,24,9,0)');
        g.fillStyle = gr; g.fillRect(0, 0, S, S);
        // a knot ring or two
        g.strokeStyle = 'rgba(20,8,2,.35)'; g.lineWidth = 2; for (let i = 1; i < 4; i++) { g.beginPath(); g.arc(S / 2, S / 2, 70 + i * 14, 0, 7); g.stroke(); }
        vines(g, corners, seed, 'paint');
        // soft moss glow near the edges
        g.strokeStyle = 'rgba(140,255,90,.18)'; g.lineWidth = 14; g.beginPath(); corners.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.stroke();
    },
    bump(g, S, seed, corners) {
        const r = rng(seed * 7 + 1); g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 2;
        for (let i = 0; i < 24; i++) { const y = r() * S; g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= S; x += 32) g.lineTo(x, y + Math.sin(x / 40 + i) * 5); g.stroke(); }
        vines(g, corners, seed, 'bump');
    },
    decorate({ THREE, mesh, faces, rnd }) {
        const sh = shared(THREE), rn = rnd((Math.random() * 1e6 | 0) + 1);
        // leaf mounts: distinct corners of the die
        const verts = []; for (const f of faces) for (const p of f.pts) if (!verts.some((q) => q.distanceTo(p) < 1e-3)) verts.push(p);
        const NL = Math.min(8, verts.length), NF = 5, up = new THREE.Vector3(0, 1, 0);
        const leaves = [];
        for (let i = 0; i < NL; i++) {
            const v = verts[Math.floor((i * verts.length) / NL)], dir = v.clone().normalize();
            const grp = new THREE.Group(); grp.position.copy(v).multiplyScalar(1.02); grp.quaternion.setFromUnitVectors(up, dir);
            const lf = new THREE.Mesh(sh.leafGeo, sh.leafMats[i % 3]); lf.scale.setScalar(1.1 + rn() * 0.7); grp.add(lf); mesh.add(grp);
            leaves.push({ grp, lf, ph: rn() * 6.28, sp: 1.2 + rn() * 1.2, yaw: rn() * 6.28 });
        }
        for (const l of leaves) l.lf.rotation.y = l.yaw;
        const pos = new Float32Array(NF * 3), col = new Float32Array(NF * 3), geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
        const pts = new THREE.Points(geo, sh.fireMat); pts.frustumCulled = false; mesh.add(pts);
        const fp = Array.from({ length: NF }, () => ({ a: rn() * 6.28, s: 0.25 + rn() * 0.35, R: 1.3 + rn() * 0.25, t: rn() * 6.28, h: (rn() - 0.5) * 2 }));
        const tick = (sec, dt, body) => {
            const sp = body ? Math.hypot(body.velocity.x, body.velocity.y, body.velocity.z) + Math.hypot(body.angularVelocity.x, body.angularVelocity.y, body.angularVelocity.z) * 0.3 : 0;
            const amp = 0.25 + Math.min(1.4, sp * 0.08);
            for (const l of leaves) {
                const w = sec * l.sp * (1 + Math.min(3, sp * 0.15)) + l.ph;
                l.lf.rotation.x = Math.sin(w) * amp + 0.5; l.lf.rotation.z = Math.cos(w * 1.3) * amp * 0.6;
            }
            fp.forEach((f, i) => {
                const a = f.a + sec * f.s, k = i * 3, ph = Math.sin(sec * 0.9 + f.t);
                pos[k] = Math.cos(a) * f.R; pos[k + 2] = Math.sin(a * 1.3) * f.R * 0.9; pos[k + 1] = f.h * 0.9 + Math.sin(a * 2 + f.t) * 0.3;
                const b = 0.6 + 0.4 * ph; col[k] = 0.8 * b; col[k + 1] = b; col[k + 2] = 0.3 * b;
            });
            geo.attributes.position.needsUpdate = geo.attributes.color.needsUpdate = true;
        };
        tick(1.5, 0, null);
        return { tick, dispose() { for (const l of leaves) mesh.remove(l.grp); mesh.remove(pts); geo.dispose(); } };
    },
    sound: {
        hit({ ac, out, noise, vol, onTable, t }) {
            const f = (onTable ? 340 : 520) * (0.85 + Math.random() * 0.3), g = ac.createGain();
            g.gain.setValueAtTime(vol * 0.7, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18); g.connect(out);
            const o = ac.createOscillator(); o.frequency.setValueAtTime(f * 1.3, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.04);
            o.connect(g); o.start(t); o.stop(t + 0.2);
            const s = ac.createBufferSource(); s.buffer = noise; const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f * 1.5; bp.Q.value = 6;
            const ng = ac.createGain(); ng.gain.setValueAtTime(vol * 0.8, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
            s.connect(bp).connect(ng).connect(out); s.start(t, Math.random() * 0.2, 0.1);
        },
        throw({ ac, out, noise, t }) {
            const s = ac.createBufferSource(); s.buffer = noise; s.loop = true;
            const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 4200; bp.Q.value = 0.7;
            const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t);
            for (let i = 0; i < 14; i++) { const tt = t + i * 0.04; g.gain.linearRampToValueAtTime(i % 2 ? 0.08 : 0.3 * (1 - i / 16), tt + 0.02); }
            g.gain.exponentialRampToValueAtTime(0.0005, t + 0.7);
            s.connect(bp).connect(g).connect(out); s.start(t); s.stop(t + 0.75);
        },
        settle({ ac, out, t }) {
            const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.connect(out);
            [[0, 2600, 3500], [0.13, 3000, 3900], [0.26, 2400, 3300]].forEach(([d, a, b]) => {
                const o = ac.createOscillator(), tt = t + d; o.frequency.setValueAtTime(a, tt); o.frequency.exponentialRampToValueAtTime(b, tt + 0.07);
                g.gain.setValueAtTime(0.0001, tt); g.gain.linearRampToValueAtTime(0.12, tt + 0.015); g.gain.exponentialRampToValueAtTime(0.0005, tt + 0.1);
                o.connect(g); o.start(tt); o.stop(tt + 0.11);
            });
        },
    },
};
