// Ember Cage exit animations 04: Fire Vortex (nat 1 implodes into a pile of ash, nat 20 is flung out of a fire tornado)
let TX = null;
function tx(T) {
    if (TX) return TX;
    const mk = (n, f) => { const c = document.createElement('canvas'); c.width = c.height = n; f(c.getContext('2d'), n); return new T.CanvasTexture(c); };
    const soft = mk(64, (g, n) => { const r = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,.55)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, n, n); });
    // three curling arms of flame, bright in the middle; spun to make the floor swirl
    const spiral = mk(256, (g, n) => {
        for (let arm = 0; arm < 3; arm++) for (let s = 0; s < 220; s++) {
            const q = s / 220, r = 10 + q * 116, a = arm * 2.0944 + q * 4.2, px = n / 2 + Math.cos(a) * r, py = n / 2 + Math.sin(a) * r, rad = 3 + q * 9;
            const gr = g.createRadialGradient(px, py, 0, px, py, rad), al = 0.22 * Math.sin(Math.PI * Math.min(1, q * 1.15));
            gr.addColorStop(0, `rgba(255,255,255,${al})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(px - rad, py - rad, rad * 2, rad * 2);
        }
    });
    return (TX = { soft, spiral, plane: new T.PlaneGeometry(1, 1) });
}
const sprite = (x, color, add = true, op = 1) => { const s = new x.THREE.Sprite(new x.THREE.SpriteMaterial({ map: tx(x.THREE).soft, color, transparent: true, opacity: op, depthWrite: false, blending: add ? x.THREE.AdditiveBlending : x.THREE.NormalBlending }));
    s.position.copy(x.home); x.own.push(s); x.scene.add(s); return s; };
const swirl = (x, color) => { const m = new x.THREE.Mesh(tx(x.THREE).plane, new x.THREE.MeshBasicMaterial({ map: tx(x.THREE).spiral, color, transparent: true, depthWrite: false, blending: x.THREE.AdditiveBlending }));
    m.rotation.x = -Math.PI / 2; m.position.set(x.home.x, 0.05, x.home.z); x.scene.add(m); x.own.push(m); return m; };
// n points with a per-point colour, updated in place
function points(x, n, size) {
    const T = x.THREE, geo = new T.BufferGeometry(), pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.setAttribute('color', new T.BufferAttribute(col, 3));
    const p = new T.Points(geo, new T.PointsMaterial({ map: tx(T).soft, size, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
    p.frustumCulled = false; p.pos = pos; p.col = col; x.scene.add(p); x.own.push(p); return p;
}
const cleanup = (x) => { for (const o of x.own || []) { x.scene.remove(o); o.material.dispose(); if (o.isPoints) o.geometry.dispose(); } x.own = []; if (x.mesh) x.mesh.scale.setScalar(1); };
const ease = (k) => 1 - (1 - k) ** 3;
const at = (k, a, b) => Math.max(0, Math.min(1, (k - a) / (b - a)));
// fire colour ramp: t 0 = white-yellow, 1 = deep red; b = brightness (additive, so it also fades)
const fire = (c, i, t, b) => { c[i] = b; c[i + 1] = b * Math.max(0, 0.95 - t * 0.8); c[i + 2] = b * Math.max(0, 0.55 - t * 0.7); };

export default {
    nat1: {
        key: 'n04-implosion', name: 'Vortex Implosion', dur: 2.0, impact: 0.95,
        blurb: 'Embers and flame spiral inward, the die crumples cold and grey, and it collapses into a pile of ash with a last puff of smoke.',
        start(x) {
            x.own = []; x.home = x.mesh.position.clone(); const N = 150;
            x.ph = Array.from({ length: N }, () => ({ a: Math.random() * 6.283, r: 2 + Math.random() * 4.5, d: Math.random() * 0.45, s: 0.8 + Math.random() * 0.5 }));
            x.pts = points(x, N, 6); x.sw = swirl(x, 0xff7a1a); x.sw2 = swirl(x, 0xffc060);
            x.glow = sprite(x, 0xff5a08); x.glow.scale.setScalar(0.1);
            x.cold = sprite(x, 0x555a60, false, 0); x.cold.scale.setScalar(2.4); x.cold.position.y += 2.5;
            x.ash = Array.from({ length: 22 }, () => { const s = sprite(x, 0x6c6762, false, 0); s.position.set(x.home.x + (Math.random() - 0.5) * 1.8, 0.3, x.home.z + (Math.random() - 0.5) * 1.8); s.scale.setScalar(0.3 + Math.random() * 0.5); s.rest = s.position.clone(); return s; });
            x.smoke = sprite(x, 0x2e2a28, false, 0); x.flash = sprite(x, 0xffd890); x.flash.material.opacity = 0;
        },
        tick(k, x) {
            const t = k * 2.0, imp = 0.95, pre = at(t, 0, imp), post = at(t, imp, 2.0), P = x.pts, home = x.home;
            // spiral particles: radius shrinks with ease-in, angular speed rises as they tighten
            for (let i = 0; i < x.ph.length; i++) {
                const p = x.ph[i], q = Math.min(1, at(pre, p.d, 1) * p.s), r = p.r * (1 - q * q) * (t < imp ? 1 : 0), a = p.a + q * (5 + q * 7) * (i % 2 ? 1 : 1.15);
                P.pos[i * 3] = home.x + Math.cos(a) * r; P.pos[i * 3 + 1] = 1 + (1 - q) * 0.8; P.pos[i * 3 + 2] = home.z + Math.sin(a) * r * 0.97;
                fire(P.col, i * 3, 1 - q, t < imp ? Math.min(1, q * 3) * (0.5 + 0.5 * q) : 0);
            }
            P.geometry.attributes.position.needsUpdate = P.geometry.attributes.color.needsUpdate = true;
            x.sw.rotation.z -= x.dt * (2 + pre * 14); x.sw2.rotation.z -= x.dt * (3 + pre * 20);
            const sc = t < imp ? 15 * (1 - pre * 0.9) : 1.5 * (1 - post); x.sw.scale.setScalar(Math.max(0.01, sc)); x.sw2.scale.setScalar(Math.max(0.01, sc * 0.6));
            x.sw.material.opacity = x.sw2.material.opacity = t < imp ? 0.3 + pre * 0.7 : Math.max(0, 1 - post * 6);
            if (t < imp) {
                // the die crumples unevenly, jittering, and goes cold
                const j = pre * pre, w = (Math.sin(t * 40) * 0.5 + 0.5);
                x.mesh.position.set(home.x + (Math.random() - 0.5) * 0.12 * pre, home.y, home.z + (Math.random() - 0.5) * 0.12 * pre);
                x.mesh.scale.set(1 - 0.35 * j - 0.04 * w * pre, 1 - 0.6 * j, 1 - 0.2 * j + 0.05 * w * pre);
                x.mesh.rotateOnWorldAxis(x.UP ||= new x.THREE.Vector3(0, 1, 0), pre * pre * 0.35);
                x.cold.material.opacity = Math.min(0.9, at(pre, 0.25, 1) * 0.9); x.cold.scale.setScalar(2.3 * (1 - 0.35 * j));
                x.glow.scale.setScalar(1.5 + pre * 3.5); x.glow.material.opacity = 0.2 + pre * 0.5;
                return;
            }
            if (!x.done) { x.done = true; x.mesh.visible = false; }
            const e = ease(post);
            x.cold.material.opacity = Math.max(0, 0.9 - post * 6);
            x.glow.scale.setScalar(5 - e * 3); x.glow.material.opacity = Math.max(0, 0.7 - post * 5);
            x.flash.scale.setScalar(1 + at(post, 0, 0.15) * 3); x.flash.material.opacity = Math.max(0, 1 - post * 7);
            // ash settles outward from the centre, then thins to a faint pile
            x.ash.forEach((s) => { const f = ease(at(post, 0, 0.3)); s.position.set(home.x + (s.rest.x - home.x) * f, 0.3, home.z + (s.rest.z - home.z) * f); s.material.opacity = Math.min(0.85, at(post, 0, 0.1)) * Math.max(0, 1 - at(post, 0.75, 1) * 0.8); });
            // smoke puff rises and swells
            x.smoke.position.y = 1 + e * 2.5; x.smoke.scale.setScalar(1 + e * 4); x.smoke.material.opacity = Math.min(0.5, post * 8) * (1 - post);
        },
        end: cleanup,
    },
    nat20: {
        key: 'n04-tornado', name: 'Fire Tornado', dur: 2.2, impact: 1.25,
        blurb: 'A spinning spiral of flame rises and widens around the die, which spins faster and faster until it is flung up out of the vortex in a blaze.',
        start(x) {
            x.own = []; x.home = x.mesh.position.clone(); const N = 260; x.spin = 0; x.ang = 0;
            x.ph = Array.from({ length: N }, (_, i) => ({ u: i / N, a: Math.random() * 6.283, j: 0.8 + Math.random() * 0.5, k: i % 3 }));
            x.pts = points(x, N, 7); x.sw = swirl(x, 0xff8a20); x.sw2 = swirl(x, 0xffd070); x.ring = swirl(x, 0xff5a10);
            x.glow = sprite(x, 0xff7a10); x.glow.scale.setScalar(0.1); x.hot = sprite(x, 0xffe090); x.hot.scale.setScalar(0.1);
            x.flash = sprite(x, 0xfff2c8); x.flash.material.opacity = 0;
        },
        tick(k, x) {
            const t = k * 2.2, imp = 1.25, pre = at(t, 0, imp), post = at(t, imp, 2.2), build = ease(at(t, 0, 0.5)), home = x.home, P = x.pts;
            x.ang += x.dt * (4 + pre * pre * 26);
            const e = ease(post), reach = 1 + pre * 1.6 + e * 3.2;
            for (let i = 0; i < x.ph.length; i++) {
                const p = x.ph[i], life = ((p.u + t * (0.55 + pre * 0.6)) % 1), grow = Math.min(1, build * 1.5 - p.u * 0.5);
                const r = (0.7 + life * 2.2 * reach) * p.j, a = p.a * 0.15 + p.k * 2.094 + x.ang * (1.3 - life * 0.6) + life * 5;
                P.pos[i * 3] = home.x + Math.cos(a) * r; P.pos[i * 3 + 1] = 0.6 + life * (3 + e * 3); P.pos[i * 3 + 2] = home.z + Math.sin(a) * r * 0.97;
                fire(P.col, i * 3, life, Math.max(0, grow) * Math.sin(Math.PI * Math.min(1, life * 1.05)) * (1 - post * 0.9) * (0.7 + pre * 0.5));
            }
            P.geometry.attributes.position.needsUpdate = P.geometry.attributes.color.needsUpdate = true;
            // swirling floor arms spin up and widen
            const w = 2 + build * 2 + pre * 4 + e * 9; x.sw.scale.setScalar(w * 1.6); x.sw2.scale.setScalar(w); x.ring.scale.setScalar(w * 2.4);
            x.sw.rotation.z += x.dt * (3 + pre * 16); x.sw2.rotation.z -= x.dt * (4 + pre * 22); x.ring.rotation.z += x.dt * (1.5 + pre * 8);
            const fade = Math.max(0, 1 - post * 1.1), a0 = Math.min(1, build * 2) * fade;
            x.sw.material.opacity = 0.55 * a0; x.sw2.material.opacity = 0.7 * a0; x.ring.material.opacity = 0.35 * a0 * pre;
            if (t < imp) {
                x.spin += x.dt * (3 + pre * pre * 40);
                x.mesh.rotateOnWorldAxis(x.UP ||= new x.THREE.Vector3(0, 1, 0), x.spin);
                x.mesh.position.set(home.x, home.y + pre * 1.5, home.z); x.mesh.scale.setScalar(1 + pre * 0.45);
                x.glow.scale.setScalar(1.5 + build * 2 + pre * 3); x.glow.material.opacity = 0.3 + pre * 0.5;
                x.hot.scale.setScalar(1 + pre * 2); x.hot.material.opacity = pre * 0.8; x.hot.position.y = home.y + 2.5 + pre * 1.5;
                return;
            }
            // the fling: scale up and away in a blaze
            x.spin += x.dt * 40; x.mesh.rotateOnWorldAxis(x.UP ||= new x.THREE.Vector3(0, 1, 0), x.spin);
            x.mesh.position.set(home.x, home.y + 3 + e * 6, home.z); x.mesh.scale.setScalar(1.45 + e * 3.2);
            if (post > 0.55) x.mesh.visible = false;
            x.flash.scale.setScalar(2 + e * 12); x.flash.material.opacity = Math.max(0, 1 - post * 3);
            x.glow.scale.setScalar(4.5 + e * 6); x.glow.material.opacity = Math.max(0, 0.8 - post * 0.9);
            x.hot.scale.setScalar(3 + e * 3); x.hot.material.opacity = Math.max(0, 0.8 - post * 1.4);
        },
        end: cleanup,
    },
};
