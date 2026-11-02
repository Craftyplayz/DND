// Ember Cage exit 35: nat 1 Sinkhole (cracks spread across the table, the ground gives way into a dark pit, the die tips in and is swallowed, dust puffs, the pit closes).
const ease = (k) => 1 - (1 - k) ** 3;
const at = (k, a, b) => Math.max(0, Math.min(1, (k - a) / (b - a)));
// a canvas with a ragged blob (the pit) or jagged cracks, centred; white-on-clear drawn in the given colour
function tex(T, draw) { const c = document.createElement('canvas'); c.width = c.height = 256; draw(c.getContext('2d')); return new T.CanvasTexture(c); }
function crackTex(T) {
    return tex(T, (g) => {
        g.translate(128, 128); g.lineCap = 'round'; g.strokeStyle = '#000';
        for (let i = 0, n = 9 + Math.floor(Math.random() * 4); i < n; i++) {
            let a = (i / n) * 6.283 + Math.random() * 0.4, r = 14, px = Math.cos(a) * r, py = Math.sin(a) * r;
            g.lineWidth = 6; g.beginPath(); g.moveTo(px, py);
            while (r < 124) { r += 10 + Math.random() * 16; a += (Math.random() - 0.5) * 0.5; px = Math.cos(a) * r; py = Math.sin(a) * r; g.lineWidth = Math.max(2, 6 - r / 30); g.lineTo(px, py);
                if (Math.random() < 0.25) { const b = a + (Math.random() < 0.5 ? -1 : 1) * 0.7; g.moveTo(px, py); g.lineTo(px + Math.cos(b) * 22, py + Math.sin(b) * 22); g.moveTo(px, py); } }
            g.stroke();
        }
    });
}
function pitTex(T) {
    return tex(T, (g) => {
        g.translate(128, 128); g.fillStyle = '#000'; g.beginPath();
        for (let i = 0, n = 28; i < n; i++) { const a = (i / n) * 6.283, r = 96 + Math.random() * 28 * (i % 2); g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
        g.closePath(); g.fill();
        const gr = g.createRadialGradient(0, 0, 0, 0, 0, 100); gr.addColorStop(0.7, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(70,28,8,.8)'); g.globalCompositeOperation = 'source-atop'; g.fillStyle = gr; g.fillRect(-128, -128, 256, 256);
    });
}
const dustTex = (T) => tex(T, (g) => { const r = g.createRadialGradient(128, 128, 0, 128, 128, 128); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 256, 256); });

export default { nat1: {
    key: 'a35-sinkhole', name: 'Sinkhole', dur: 3.2,
    blurb: 'Cracks spread across the table, the ground gives way into a dark pit, and the die tips in and is swallowed.',
    start(x) {
        const T = x.THREE, m = x.mesh;
        x.p0 = m.position.clone(); x.q0 = m.quaternion.clone(); x.s0 = m.scale.clone(); x.vis0 = m.visible; x.mat0 = m.material; x.cs0 = m.castShadow;
        x.own = [];
        x.plane = new T.PlaneGeometry(1, 1);
        const flat = (map, y, extra) => { const o = new T.Mesh(x.plane, new T.MeshBasicMaterial(Object.assign({ map, transparent: true, depthWrite: false }, extra))); o.rotation.x = -Math.PI / 2; o.rotation.z = Math.random() * 6.283; o.position.set(x.p0.x, y, x.p0.z); o.scale.setScalar(0.01); x.scene.add(o); x.own.push(o); return o; };
        x.crack = flat(crackTex(T), 0.05); x.pit = flat(pitTex(T), 0.08, { depthWrite: true });
        // the way the die tips and the way the dust drifts
        x.dir = Math.random() * 6.283; x.dust = [];
        const dt = dustTex(T);
        for (let i = 0; i < 8; i++) { const s = new T.Sprite(new T.SpriteMaterial({ map: dt, color: 0x8a7a68, transparent: true, depthWrite: false })); s.visible = false; x.scene.add(s); x.own.push(s); x.dust.push({ s, a: (i / 8) * 6.283 + Math.random() * 0.6, v: 0.8 + Math.random() * 0.8 }); }
        // our own dark copies of the die's materials
        x.mats = [].concat(m.material).map((q) => q.clone()); m.material = Array.isArray(m.material) ? x.mats : x.mats[0];
        x.cols = x.mats.map((q) => q.color.clone());
        m.castShadow = false;
    },
    tick(k, x) {
        const m = x.mesh, spread = ease(at(k, 0, 0.3)), open = ease(at(k, 0.22, 0.6)), close = ease(at(k, 0.8, 0.97)), fall = at(k, 0.4, 0.7);
        // cracks radiate, then fade as the pit closes
        x.crack.scale.setScalar(0.5 + spread * 7); x.crack.material.opacity = 0.95 * (1 - at(k, 0.85, 0.97));
        // the pit opens wider, then shrinks shut
        const R = Math.max(0.01, (open * 4.6 + 0.5 * Math.sin(k * 40) * open * (1 - fall)) * (1 - close * 0.99));
        x.pit.scale.setScalar(R); x.pit.material.opacity = at(k, 0.2, 0.3) * (1 - at(k, 0.92, 0.97));
        // before the fall the die shudders; then it tips toward the pit centre-side and sinks, shrinking and darkening
        const sh = (1 - fall) * at(k, 0.05, 0.4) * 0.03, tip = ease(fall);
        m.position.set(x.p0.x + Math.sin(k * 90) * sh, x.p0.y - tip * 3.5, x.p0.z + Math.cos(k * 77) * sh);
        m.quaternion.setFromAxisAngle(new x.THREE.Vector3(Math.cos(x.dir), 0, Math.sin(x.dir)), tip * 1.3).multiply(x.q0);
        m.scale.copy(x.s0).multiplyScalar(Math.max(0.01, 1 - tip * 0.6)); m.visible = fall < 1;
        const d = 1 - tip * 0.85; x.mats.forEach((q, i) => q.color.copy(x.cols[i]).multiplyScalar(d));
        // dust puffs at the rim
        const p = at(k, 0.45, 0.85);
        for (const u of x.dust) { u.s.visible = p > 0 && p < 1; u.s.position.set(x.p0.x + Math.cos(u.a) * (R * 0.5 + p * u.v), 0.4, x.p0.z + Math.sin(u.a) * (R * 0.5 + p * u.v)); u.s.scale.setScalar(0.5 + p * 1.6); u.s.material.opacity = 0.5 * Math.sin(Math.PI * p); }
    },
    end(x) {
        const m = x.mesh;
        m.position.copy(x.p0); m.quaternion.copy(x.q0); m.scale.copy(x.s0); m.visible = x.vis0; m.material = x.mat0; m.castShadow = true;
        for (const o of x.own) { x.scene.remove(o); o.material.map?.dispose(); o.material.dispose(); }
        x.plane.dispose(); x.mats.forEach((q) => q.dispose()); x.own = [];
    },
} };
