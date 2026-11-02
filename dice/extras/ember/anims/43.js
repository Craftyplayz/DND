// Ember Cage exit 43: nat 20 Meteor Shower (golden meteors streak across the table from one random direction and strike around the die one after another, the last big one hits the die, which blazes white-gold and bursts into glittering stars).
let FX = null;
function fx(T) {
    if (FX) return FX;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    const r = document.createElement('canvas'); r.width = r.height = 128;
    const h = r.getContext('2d'), rg = h.createRadialGradient(64, 64, 40, 64, 64, 64);
    rg.addColorStop(0, 'rgba(255,255,255,0)'); rg.addColorStop(0.7, 'rgba(255,255,255,1)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    h.fillStyle = rg; h.fillRect(0, 0, 128, 128);
    // a tail: bright at the right (the head), fading to nothing at the left
    const t = document.createElement('canvas'); t.width = 128; t.height = 32;
    const q = t.getContext('2d'), tg = q.createLinearGradient(0, 0, 128, 0);
    tg.addColorStop(0, 'rgba(255,255,255,0)'); tg.addColorStop(1, 'rgba(255,255,255,1)');
    q.fillStyle = tg; q.fillRect(0, 0, 128, 32);
    q.globalCompositeOperation = 'destination-in';
    const vg = q.createLinearGradient(0, 0, 0, 32); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(0.5, 'rgba(0,0,0,1)'); vg.addColorStop(1, 'rgba(0,0,0,0)');
    q.fillStyle = vg; q.fillRect(0, 0, 128, 32);
    return (FX = { soft: new T.CanvasTexture(c), ring: new T.CanvasTexture(r), tail: new T.CanvasTexture(t), plane: new T.PlaneGeometry(1, 1) });
}
const add = (x, o) => (x.scene.add(o), x.own.push(o), o);
const glow = (x, map, color) => new x.THREE.MeshBasicMaterial({ map, color, transparent: true, depthWrite: false, blending: x.THREE.AdditiveBlending, opacity: 0 });
const sprite = (x, color) => { const s = add(x, new x.THREE.Sprite(new x.THREE.SpriteMaterial({ map: fx(x.THREE).soft, color, transparent: true, depthWrite: false, blending: x.THREE.AdditiveBlending, opacity: 0 }))); s.position.copy(x.mesh.position); return s; };
// a flat quad on the table; ring or tail texture
const flat = (x, map, color) => { const m = add(x, new x.THREE.Mesh(fx(x.THREE).plane, glow(x, map, color))); m.rotation.order = 'YXZ'; m.rotation.x = -Math.PI / 2; m.visible = false; return m; };
const at = (k, a, b) => Math.max(0, Math.min(1, (k - a) / (b - a)));
const ease = (k) => 1 - (1 - k) ** 3;

const nat20 = {
    key: 'a43-meteor-shower', name: 'Meteor Shower', impact: 1.2, dur: 3.0,
    blurb: 'Golden meteors streak across the table and strike around the die one by one, then a big one hits the die and it bursts into glittering stars.',
    start(x) {
        const T = x.THREE;
        x.own = []; x.p0 = x.mesh.position.clone(); x.s0 = x.mesh.scale.clone(); x.vis0 = x.mesh.visible; x.cast0 = x.mesh.castShadow;
        // one shared direction (angle a); each meteor lands at its own spot around the die
        x.a = Math.random() * 6.283; x.dir = [Math.cos(x.a), Math.sin(x.a)];
        x.m = [];
        for (let i = 0; i < 8; i++) {
            const last = i === 7, r = last ? 0 : 1.1 + Math.random() * 1.9, b = Math.random() * 6.283, t0 = last ? 0.5 : 0.03 + i * 0.065 + Math.random() * 0.02;
            x.m.push({ last, t0, t1: t0 + (last ? 0.22 : 0.17), tx: x.p0.x + Math.cos(b) * r, tz: x.p0.z + Math.sin(b) * r, big: last ? 1.8 : 0.8 + Math.random() * 0.5,
                head: sprite(x, 0xfff0c0), tail: flat(x, fx(T).tail, 0xffa820), fl: sprite(x, 0xffd060), ring: flat(x, fx(T).ring, 0xffc040) });
        }
        // the die gets its own materials so it can blaze
        x.mat0 = x.mesh.material; x.mats = [].concat(x.mat0).map((m) => m.clone());
        x.mesh.material = Array.isArray(x.mat0) ? x.mats : x.mats[0];
        x.mesh.castShadow = true;
        x.burst = sprite(x, 0xffffff); x.burst.scale.setScalar(0.1);
        // glittering stars, flung out flat across the table
        const n = 60, T3 = new Float32Array(n * 3), geo = new T.BufferGeometry();
        geo.setAttribute('position', new T.BufferAttribute(T3, 3));
        x.sv = Array.from({ length: n }, () => { const a = Math.random() * 6.283, s = 2 + Math.random() * 5; return [Math.cos(a) * s, Math.sin(a) * s, Math.random()]; });
        x.stars = add(x, new T.Points(geo, new T.PointsMaterial({ map: fx(T).soft, color: 0xfff2b0, size: 9, sizeAttenuation: false, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0 })));
        x.stars.frustumCulled = false; x.stars.visible = false;
    },
    tick(k, x) {
        const [dx, dz] = x.dir, hit = x.m[7].t1, hk = at(k, hit - 0.12, hit), b = at(k, hit, 1);
        for (const m of x.m) {
            const u = at(k, m.t0, m.t1), L = 16 * (1 - u), v = u > 0 && u < 1, ia = at(k, m.t1, m.t1 + (m.last ? 0.2 : 0.1));
            // head and tail travel along the direction; the tail trails behind the head
            const hx = m.tx - dx * L, hz = m.tz - dz * L, tl = m.last ? 4.5 : 3, o = 1 - ia;
            m.head.visible = m.tail.visible = v;
            if (v) {
                m.head.position.set(hx, 0.5, hz); m.head.scale.setScalar(0.7 * m.big); m.head.material.opacity = 1;
                m.tail.position.set(hx - dx * tl / 2, 0.45, hz - dz * tl / 2); m.tail.rotation.y = Math.atan2(dz, -dx) + Math.PI; m.tail.scale.set(tl, 0.55 * m.big, 1); m.tail.material.opacity = 0.9;
            }
            // impact: a bright flash and a ring on the table
            m.fl.position.set(m.tx, 0.4, m.tz); m.fl.scale.setScalar((m.last ? 4 : 1.4) * (0.5 + ia) * m.big); m.fl.material.opacity = u >= 1 ? o : 0;
            m.ring.visible = u >= 1 && o > 0; m.ring.position.set(m.tx, 0.06, m.tz); m.ring.scale.setScalar((m.last ? 1 : 0.4) + ia * (m.last ? 9 : 3)); m.ring.material.opacity = 0.9 * o;
        }
        // the die heats up toward the last strike, then is gone in the burst
        const heat = at(k, 0.3, hit) ** 2;
        for (const m of x.mats) { m.color.setRGB(1, 1 - 0.1 * heat + 0.1 * hk, 1 - 0.3 * heat + 0.3 * hk); if (m.emissive) m.emissive.setRGB(heat * 0.8 + hk * 0.2, heat * 0.6 + hk * 0.4, hk * 0.9); }
        x.mesh.scale.copy(x.s0).multiplyScalar(1 + 0.15 * hk);
        x.mesh.visible = k < hit + 0.015;
        x.burst.position.set(x.p0.x, 0.6, x.p0.z); x.burst.scale.setScalar(0.5 + hk * 3 + (b > 0 ? ease(at(b, 0, 0.3)) * 7 : 0));
        x.burst.material.opacity = b > 0 ? 1 - at(b, 0, 0.45) : hk * 0.9;
        // stars fly out and twinkle off
        x.stars.visible = b > 0; const P = x.stars.geometry.attributes.position, e = ease(b);
        x.sv.forEach((s, i) => P.setXYZ(i, x.p0.x + s[0] * e * 1.6, 0.8, x.p0.z + s[1] * e * 1.6));
        P.needsUpdate = true; x.stars.material.opacity = (1 - at(b, 0.5, 0.85)) * (0.7 + 0.3 * Math.sin(k * 90)); x.stars.material.size = 9 - 5 * b;
    },
    end(x) {
        x.mesh.scale.copy(x.s0); x.mesh.visible = x.vis0; x.mesh.castShadow = x.cast0 !== false;
        if (x.mat0) { x.mesh.material = x.mat0; x.mats.forEach((m) => m.dispose()); x.mat0 = null; }
        for (const o of x.own) { x.scene.remove(o); if (o.isPoints) o.geometry.dispose(); o.material.dispose(); }
        x.own = [];
    },
};

export default { nat20 };
