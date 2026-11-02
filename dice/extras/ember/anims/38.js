// Ember Cage exit 38: nat 1 gets a small grumbling storm cloud: rain splashes on the table, lightning zaps the die, it goes charred and smoking, the cloud drifts off.
let FX = null;
function fx(T) {
    if (FX) return FX;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    const r = document.createElement('canvas'); r.width = r.height = 128;
    const h = r.getContext('2d'), rg = h.createRadialGradient(64, 64, 0, 64, 64, 64);
    rg.addColorStop(0, 'rgba(255,255,255,0)'); rg.addColorStop(0.6, 'rgba(255,255,255,0)'); rg.addColorStop(0.82, 'rgba(255,255,255,1)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    h.fillStyle = rg; h.fillRect(0, 0, 128, 128);
    return (FX = { soft: new T.CanvasTexture(c), ring: new T.CanvasTexture(r), plane: new T.PlaneGeometry(1, 1) });
}
const clamp = (v) => Math.max(0, Math.min(1, v));
const at = (k, a, b) => clamp((k - a) / (b - a));
const ease = (k) => 1 - (1 - k) ** 3;
const R = (a, b) => a + Math.random() * (b - a);
const add = (x, o) => { x.scene.add(o); x.own.push(o); return o; };
const mat = (x, tex, color, additive) => new x.THREE.MeshBasicMaterial({ map: tex, color, transparent: true, depthWrite: false, blending: additive ? x.THREE.AdditiveBlending : x.THREE.NormalBlending });
// a camera-facing sprite
const spr = (x, color, y, additive) => { const s = new x.THREE.Sprite(new x.THREE.SpriteMaterial({ map: fx(x.THREE).soft, color, transparent: true, depthWrite: false, blending: additive ? x.THREE.AdditiveBlending : x.THREE.NormalBlending })); s.position.set(x.home.x, y, x.home.z); s.material.opacity = 0; return add(x, s); };
// a glow, ring or bar lying flat on the table
const flat = (x, tex, color, y, additive) => { const m = new x.THREE.Mesh(fx(x.THREE).plane, mat(x, tex, color, additive)); m.rotation.x = -Math.PI / 2; m.position.set(x.home.x, y, x.home.z); m.material.opacity = 0; return add(x, m); };
// a flat bar from (ax, az) to (bx, bz), wid across
const bar = (m, ax, az, bx, bz, y, wid) => { m.position.set((ax + bx) / 2, y, (az + bz) / 2); m.scale.set(Math.hypot(bx - ax, bz - az) + 0.01, wid, 1); m.rotation.z = Math.atan2(-(bz - az), bx - ax); };

export default {
    nat1: {
        key: 'a38-storm', name: 'Storm Cloud', dur: 3.4, impact: 0.55,
        blurb: 'A small dark cloud gathers over the die and rains on the table, then a lightning bolt zaps it black and smoking while the cloud drifts away.',
        start(x) {
            const T = x.THREE, g = x.mesh.geometry; x.own = []; x.home = x.mesh.position.clone();
            if (!g.boundingSphere) g.computeBoundingSphere(); const r = x.r = g.boundingSphere.radius || 1;
            // the cloud: a puffy blob of dark grey sprites with a few lighter ones on top
            x.puffs = []; for (let i = 0; i < 11; i++) { const a = R(0, 6.283), d = R(0, 1) * r * 0.9, dark = i < 7;
                const s = spr(x, dark ? 0x2c3038 : 0x555b66, 6 + i * 0.01, false); s.ox = Math.cos(a) * d; s.oz = Math.sin(a) * d; s.sz = r * R(2.2, 3.2); s.ph = R(0, 6.28); s.max = dark ? 0.6 : 0.4; x.puffs.push(s); }
            x.dir = R(0, 6.283); x.cx = x.cz = 0;
            // rain splashes: rings popping up at random spots under the cloud
            x.rain = []; for (let i = 0; i < 14; i++) { const m = flat(x, fx(T).ring, 0xa8c4e0, 0.1, true); m.t0 = R(0.18, 0.55); m.per = R(0.07, 0.11); m.px = R(-1.5, 1.5) * r; m.pz = R(-1.5, 1.5) * r; x.rain.push(m); }
            // falling drops seen from above: small dots that shrink as they hit
            x.drops = []; for (let i = 0; i < 16; i++) { const s = spr(x, 0xcfe4ff, 4, true); s.t0 = R(0.18, 0.55); s.per = R(0.05, 0.08); s.px = R(-1.4, 1.4) * r; s.pz = R(-1.4, 1.4) * r; x.drops.push(s); }
            // the bolt: a jagged chain of bars from beside the die to its centre, plus a flash
            x.bolt = []; let px = R(-1, 1) * r * 3.5, pz = R(-1, 1) * r * 3.5; x.pts = [[px, pz]];
            for (let i = 1; i < 7; i++) { px = px * (1 - 1 / (8 - i)) + R(-0.4, 0.4) * r; pz = pz * (1 - 1 / (8 - i)) + R(-0.4, 0.4) * r; x.pts.push([px, pz]); } x.pts.push([0, 0]);
            for (let i = 0; i < 7; i++) { x.bolt.push(flat(x, fx(T).soft, 0xe8f0ff, 0.3, true), flat(x, fx(T).soft, 0x7aa8ff, 0.29, true)); }
            x.flash = spr(x, 0xdce8ff, 7, true); x.flash.scale.setScalar(r * 3);
            // charred skin: a black copy of the die just over the real one (shared geometry is only read, never edited)
            x.char = new T.Mesh(g, new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthWrite: false })); x.char.scale.setScalar(1.015); x.char.renderOrder = 5;
            x.scene.add(x.char); x.own.push(x.char);
            // smoke: soft grey puffs rising off the burnt die
            x.smoke = []; for (let i = 0; i < 9; i++) { const s = spr(x, 0x3a3a3c, 5, false); s.t0 = 0.58 + i * 0.03; s.a = R(0, 6.283); s.sp = R(0.5, 1.4); x.smoke.push(s); }
        },
        tick(k, x) {
            const h = x.home, m = x.mesh, r = x.r, T = k * 3.4;
            // the cloud swells in (0-0.2), grumbles in place, then drifts away and thins (0.68-0.97)
            const inn = ease(at(k, 0, 0.2)), go = at(k, 0.66, 0.9), drift = go * go * r * 22;
            x.cx = Math.cos(x.dir) * drift; x.cz = Math.sin(x.dir) * drift;
            x.puffs.forEach((s) => { const w = Math.sin(T * 7 + s.ph) * r * 0.05;
                s.position.set(h.x + x.cx + s.ox * inn + w, 6, h.z + x.cz + s.oz * inn + w); s.scale.setScalar(s.sz * (0.3 + 0.7 * inn) * (1 + 0.05 * Math.sin(T * 9 + s.ph)));
                s.material.opacity = s.max * inn * (1 - at(k, 0.78, 0.9)); });
            // rain: rings and drops while the cloud sits there (0.18-0.58)
            const raining = k < 0.6;
            x.rain.forEach((g) => { const u = ((k - g.t0) / g.per) % 1, on = raining && k > g.t0 && k < 0.6; g.position.set(h.x + g.px, 0.1, h.z + g.pz); g.scale.setScalar(r * (0.2 + 0.9 * u)); g.material.opacity = on ? 0.6 * (1 - u) : 0; });
            x.drops.forEach((s) => { const u = ((k - s.t0) / s.per) % 1, on = raining && k > s.t0; s.position.set(h.x + s.px, 4, h.z + s.pz); s.scale.setScalar(r * 0.3 * (1.2 - u)); s.material.opacity = on ? 0.7 * u : 0; });
            // lightning: the bolt flickers on at 0.6-0.7, the flash is bright then falls away
            const f = at(k, 0.6, 0.64), fo = at(k, 0.64, 0.8), flick = k > 0.6 && k < 0.7 ? (Math.sin(T * 80) > -0.3 ? 1 : 0.35) : 0, bo = k > 0.6 && k < 0.71 ? flick : 0;
            for (let i = 0; i < 7; i++) { const a = x.pts[i], b = x.pts[i + 1]; for (let j = 0; j < 2; j++) { const g = x.bolt[i * 2 + j];
                bar(g, h.x + a[0], h.z + a[1], h.x + b[0], h.z + b[1], 0.3 - j * 0.01, r * (j ? 1 : 0.3)); g.material.opacity = bo * (j ? 0.5 : 1); } }
            x.flash.position.set(h.x, 7, h.z); x.flash.scale.setScalar(r * (2 + 2 * f)); x.flash.material.opacity = k < 0.6 ? 0 : (1 - fo) ** 2 * 0.7;
            // charring snaps on with the strike; the die shakes during it, then crumbles away at the end
            const cp = k < 0.6 ? 0 : 1; x.char.material.opacity = cp * (1 - 0.0 * at(k, 0.9, 0.95)); x.char.material.color.setRGB(0.02, 0.02, 0.02);
            const sh = k > 0.6 && k < 0.7 ? r * 0.06 * Math.sin(T * 90) : 0, sc = 1 - ease(at(k, 0.84, 0.95));
            m.position.set(h.x + sh, h.y, h.z); m.scale.setScalar(sc); x.char.position.copy(m.position); x.char.quaternion.copy(m.quaternion); x.char.scale.setScalar(1.015 * sc); x.char.visible = m.visible = sc > 0.01;
            // smoke curls up and out, growing and fading
            x.smoke.forEach((s) => { const u = at(k, s.t0, s.t0 + 0.3), d = u * r * s.sp;
                s.position.set(h.x + Math.cos(s.a) * d + x.cx * 0.1, 5, h.z + Math.sin(s.a) * d); s.scale.setScalar(r * (0.5 + 1.6 * u)); s.material.opacity = u > 0 && u < 1 ? 0.55 * Math.sin(3.1416 * u) ** 0.7 * (1 - at(k, 0.85, 0.94)) : 0; });
        },
        end(x) {
            for (const o of x.own || []) { x.scene.remove(o); o.material.dispose(); }
            x.own = []; x.mesh.scale.setScalar(1); x.mesh.visible = true; x.mesh.castShadow = true; if (x.home) x.mesh.position.copy(x.home);
        },
    },
};
