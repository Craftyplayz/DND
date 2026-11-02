// Ember Cage exit 39: nat 1 Black Hole (a void with a glowing orange ring opens beside the die, drags it in a tightening spiral while it stretches toward the hole, swallows it, flares once and snaps shut).
let FX = null;
function fx(T) {
    if (FX) return FX;
    const mk = (draw) => { const c = document.createElement('canvas'); c.width = c.height = 256; draw(c.getContext('2d')); return new T.CanvasTexture(c); };
    // the void: solid black with a soft rim
    const disc = mk((g) => { const r = g.createRadialGradient(128, 128, 0, 128, 128, 128); r.addColorStop(0, 'rgba(0,0,0,1)'); r.addColorStop(0.62, 'rgba(0,0,0,1)'); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(0, 0, 256, 256); });
    // the accretion ring: a thin hot line whose brightness varies round it, so turning it reads as swirling
    const ring = mk((g) => {
        g.shadowColor = '#ff7a10'; g.shadowBlur = 10; g.lineWidth = 5; g.lineCap = 'round';
        for (let i = 0; i < 180; i++) { const a = i / 180 * 6.283, b = 0.15 + 0.85 * Math.pow((Math.sin(a * 2 + 1) + 1) / 2, 2); g.strokeStyle = `rgba(255,${150 + 90 * b | 0},${60 + 120 * b * b | 0},${b})`; g.beginPath(); g.arc(128, 128, 94, a, a + 0.05); g.stroke(); }
    });
    const soft = mk((g) => { const r = g.createRadialGradient(128, 128, 0, 128, 128, 128); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.4, 'rgba(255,255,255,.4)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 256, 256); });
    return (FX = { disc, ring, soft, plane: new T.PlaneGeometry(1, 1) });
}
const ease = (k) => 1 - (1 - k) ** 3;
const at = (k, a, b) => Math.max(0, Math.min(1, (k - a) / (b - a)));

const nat1 = {
    key: 'a39-black-hole', name: 'Black Hole', dur: 3.2,
    blurb: 'A tiny void with a glowing orange ring opens beside the die, stretches it and spirals it in, then flares and snaps shut.',
    start(x) {
        const T = x.THREE, F = fx(T), m = x.mesh, p = m.position;
        x.p0 = p.clone(); x.q0 = m.quaternion.clone(); x.s0 = m.scale.clone(); x.own = [];
        // the hole sits a random way off; the die starts at (r0, a0) around it
        const side = Math.random() * 6.283, off = 2.4;
        x.h = new T.Vector3(p.x + Math.cos(side) * off, 0.06, p.z + Math.sin(side) * off);
        x.a0 = side + Math.PI; x.r0 = off; x.dir = Math.random() < 0.5 ? 1 : -1;
        const flat = (map, additive, y) => {
            const mesh = new T.Mesh(F.plane, new T.MeshBasicMaterial({ map, transparent: true, depthWrite: false, blending: additive ? T.AdditiveBlending : T.NormalBlending }));
            mesh.rotation.x = -Math.PI / 2; mesh.position.set(x.h.x, y, x.h.z); mesh.scale.setScalar(0.01); x.scene.add(mesh); x.own.push(mesh); return mesh;
        };
        const glow = flat(F.soft, true, 0.04), disc = flat(F.disc, false, 0.06), ring = flat(F.ring, true, 0.07);
        glow.material.color.set(0xff6a10);
        x.glow = glow; x.disc = disc; x.ring = ring;
        const flare = new T.Sprite(new T.SpriteMaterial({ map: F.soft, color: 0xffd090, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
        flare.position.copy(x.h); flare.scale.setScalar(0.01); x.scene.add(flare); x.own.push(flare); x.flare = flare;
        // the die rides in a group that is stretched along the way to the hole
        x.g = new T.Group(); x.scene.add(x.g); x.g.add(m); x.own.push(x.g);
    },
    tick(k, x) {
        const open = ease(at(k, 0, 0.18)), shut = at(k, 0.86, 0.97), t = at(k, 0.12, 0.84), tt = t * t;
        const size = (0.2 + 2.4 * open) * (1 - ease(shut)) * (1 + 0.5 * Math.sin(Math.PI * at(k, 0.8, 0.88)));
        x.disc.scale.setScalar(size * 0.75); x.ring.scale.setScalar(size); x.glow.scale.setScalar(size * 2.2);
        x.ring.rotation.z = -k * 22 * x.dir; x.ring.material.opacity = Math.min(1, open * 2); x.glow.material.opacity = 0.5 * open;
        x.flare.scale.setScalar(0.1 + 4 * Math.sin(Math.PI * at(k, 0.8, 0.95))); x.flare.material.opacity = Math.sin(Math.PI * at(k, 0.8, 0.95));
        // the die: spirals in (angle speeds up, radius shrinks), stretching toward the hole, shrinking at the very end
        const a = x.a0 + x.dir * (tt * 9 + t * 1.5), r = x.r0 * (1 - t) ** 1.6, px = x.h.x + Math.cos(a) * r, pz = x.h.z + Math.sin(a) * r;
        const fall = 1 - ease(at(t, 0.8, 1)), st = 1 + 2.8 * tt;
        x.g.position.set(px, x.p0.y, pz);
        x.g.rotation.y = Math.atan2(-(x.h.z - pz), x.h.x - px);
        x.g.scale.set(st * fall, fall, fall / Math.sqrt(st));
        x.mesh.position.set(0, 0, 0);
        x.mesh.quaternion.setFromAxisAngle(x.UP || (x.UP = new x.THREE.Vector3(0, 1, 0)), tt * 10 * x.dir).multiply(x.q0);
        x.mesh.scale.copy(x.s0);
        x.mesh.visible = t < 1;
    },
    end(x) {
        x.scene.add(x.mesh); x.mesh.position.copy(x.p0); x.mesh.quaternion.copy(x.q0); x.mesh.scale.copy(x.s0); x.mesh.visible = true;
        for (const o of x.own) { x.scene.remove(o); if (o.material) o.material.dispose(); }
        x.own = [];
    },
};

export default { nat1 };
