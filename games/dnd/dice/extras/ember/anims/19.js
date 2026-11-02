// Ember Cage exits 19: nat 1 a dying spinning top, nat 20 a comet loop, mid a jelly squash. All move the die's own model.
let FX = null;
function fx(T) {
    if (FX) return FX;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return (FX = { soft: new T.CanvasTexture(c), plane: new T.PlaneGeometry(1, 1) });
}
const add = (x, o) => { x.scene.add(o); x.own.push(o); return o; };
const sprite = (x, color, add_ = true) => add(x, new x.THREE.Sprite(new x.THREE.SpriteMaterial({ map: fx(x.THREE).soft, color, transparent: true, depthWrite: false, blending: add_ ? x.THREE.AdditiveBlending : x.THREE.NormalBlending })));
const pool = (x, color) => { const m = add(x, new x.THREE.Mesh(fx(x.THREE).plane, new x.THREE.MeshBasicMaterial({ map: fx(x.THREE).soft, color, transparent: true, depthWrite: false, blending: x.THREE.AdditiveBlending })));
    m.rotation.x = -Math.PI / 2; m.position.set(x.home.x, 0.05, x.home.z); return m; };
const cleanup = (x) => {
    for (const o of x.own || []) { x.scene.remove(o); o.material.dispose(); if (o.isPoints) o.geometry.dispose(); }
    x.own = [];
    if (x.geo0) { x.mesh.geometry = x.geo0; x.overlays.forEach((c) => (c.geometry = x.geo0)); x.geo.dispose(); x.geo0 = null; }
    x.mesh.scale.setScalar(1); x.mesh.visible = true; if (x.home) x.mesh.position.copy(x.home); if (x.q0) x.mesh.quaternion.copy(x.q0);
};
const at = (k, a, b) => Math.max(0, Math.min(1, (k - a) / (b - a)));
const ease = (k) => 1 - (1 - k) ** 3;
// radius of the die in world units, from its own geometry
const radius = (x) => { const g = x.mesh.geometry; if (!g.boundingSphere) g.computeBoundingSphere(); return g.boundingSphere.radius; };
// a fixed-size Points cloud whose positions and fades you set each tick
function dots(x, n, size, color) {
    const T = x.THREE, pos = new Float32Array(n * 3), geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    const p = add(x, new T.Points(geo, new T.PointsMaterial({ map: fx(T).soft, color, size, sizeAttenuation: false, transparent: true, depthWrite: false, blending: T.AdditiveBlending })));
    p.frustumCulled = false; p.pos = pos; p.n = n; return p;
}

export default {
    // the die spins like a top, wobbles wider as it runs down, topples over and goes dark
    nat1: {
        key: 'a19-dying-top', name: 'Dying Top', blurb: 'The die spins like a top, wobbles more and more as it runs down, then topples over and goes dark.',
        dur: 2.2, impact: 1.5,
        start(x) {
            x.own = []; x.home = x.mesh.position.clone(); x.q0 = x.mesh.quaternion.clone(); x.r = radius(x);
            x.Y = new x.THREE.Vector3(0, 1, 0); x.qa = new x.THREE.Quaternion(); x.qb = new x.THREE.Quaternion(); x.ax = new x.THREE.Vector3();
            x.glow = sprite(x, 0xff6a10); x.dark = sprite(x, 0x000000, false); x.ring = pool(x, 0xff8a20); x.sparks = dots(x, 24, 5, 0xffa040);
            x.dir = Math.random() * 6.283;
        },
        tick(k, x) {
            const m = x.mesh, h = x.home, r = x.r, run = at(k, 0, 0.68), fall = at(k, 0.68, 0.86);
            // spin slows (phase integrates a falling speed), wobble amplitude grows then it topples
            const ph = 60 * (k - 0.45 * k * k * 1.2), lean = 0.08 + 0.55 * run * run + 1.3 * ease(fall);
            const pa = x.dir + ph * 0.09 * (1 - 0.7 * run);
            x.ax.set(Math.cos(pa), 0, Math.sin(pa)).cross(x.Y);
            m.quaternion.copy(x.q0).premultiply(x.qa.setFromAxisAngle(x.Y, ph)).premultiply(x.qb.setFromAxisAngle(x.ax.set(-Math.sin(pa), 0, Math.cos(pa)), lean * (1 - 0.0 * fall)));
            // the tilted top drifts a little toward its lean; the fallen die slides on its side
            const sl = r * (0.4 * run * run + 0.9 * ease(fall));
            m.position.set(h.x + Math.cos(x.dir) * sl + Math.cos(pa) * 0.12 * r * run, h.y, h.z + Math.sin(x.dir) * sl + Math.sin(pa) * 0.12 * r * run);
            const hot = 1 - at(k, 0.4, 0.9);
            x.glow.position.set(m.position.x, 3, m.position.z); x.glow.scale.setScalar(r * 3 * (0.6 + hot)); x.glow.material.opacity = 0.6 * hot;
            x.ring.position.set(m.position.x, 0.05, m.position.z); x.ring.scale.setScalar(r * (2.2 + 1.6 * run)); x.ring.material.opacity = 0.7 * hot;
            x.dark.position.set(m.position.x, 4, m.position.z); x.dark.scale.setScalar(r * 3.4); x.dark.material.opacity = at(k, 0.78, 1);
            // sparks flick off the spinning edge while it still has speed
            const P = x.sparks.pos, sp = 1 - at(k, 0.3, 0.75);
            for (let i = 0; i < x.sparks.n; i++) { const a = ph * 0.5 + i * 2.4, rr = r * (0.9 + ((i * 0.37 + k * 3) % 1) * 1.8) * sp; P[i * 3] = m.position.x + Math.cos(a) * rr; P[i * 3 + 1] = 1; P[i * 3 + 2] = m.position.z + Math.sin(a) * rr; }
            x.sparks.geometry.attributes.position.needsUpdate = true; x.sparks.material.opacity = sp;
        },
        end: cleanup,
    },
    // the die flies a quick loop around the table trailing fire, then shoots off screen
    nat20: {
        key: 'a19-comet-loop', name: 'Comet Loop', blurb: 'The die flies a quick loop around the table leaving a fire trail, then shoots off the screen.',
        dur: 2.0, impact: 0.75,
        start(x) {
            x.own = []; x.home = x.mesh.position.clone(); x.q0 = x.mesh.quaternion.clone(); x.R = 3; x.sg = x.home.z > 0 ? -1 : 1; x.r = radius(x);
            x.Y = new x.THREE.Vector3(0, 1, 0); x.qa = new x.THREE.Quaternion(); x.qb = new x.THREE.Quaternion();
            x.trail = dots(x, 40, 11, 0xff7a18); x.trail2 = dots(x, 40, 5, 0xffe0a0); x.halo = sprite(x, 0xffa030);
            // the path: one circle through the start point, then straight off to +x, speeding up
            x.path = (k) => { const L = 0.5; if (k < L) { const t = 6.283 * k / L; return [x.home.x + x.R * Math.sin(t), x.home.z + x.sg * x.R * (1 - Math.cos(t))]; }
                const d = k - L; return [x.home.x + 37 * d + 90 * d * d, x.home.z]; };
        },
        tick(k, x) {
            const m = x.mesh, [px, pz] = x.path(k), r = x.r;
            m.position.set(px, x.home.y, pz);
            // rolls along its path while spinning, swelling at the loop's top
            m.quaternion.copy(x.q0).premultiply(x.qa.setFromAxisAngle(x.Y, k * 22)).premultiply(x.qb.setFromAxisAngle(x.Y.clone().set(0, 0, 1), -k * 30));
            m.scale.setScalar(1 + 0.3 * Math.sin(Math.PI * at(k, 0, 0.5)) - 0.6 * at(k, 0.85, 1));
            const out = 1 - at(k, 0.88, 1);
            for (const t of [x.trail, x.trail2]) {
                const P = t.pos, len = t === x.trail ? 0.22 : 0.12;
                for (let i = 0; i < t.n; i++) { const [tx, tz] = x.path(Math.max(0, k - len * i / t.n)); P[i * 3] = tx; P[i * 3 + 1] = 0.6; P[i * 3 + 2] = tz; }
                t.geometry.attributes.position.needsUpdate = true; t.material.opacity = out;
            }
            x.halo.position.set(px, 3, pz); x.halo.scale.setScalar(r * 3.2); x.halo.material.opacity = 0.7 * out;
        },
        end: cleanup,
    },
    // the die wobbles like jelly, then squashes flat into the table and is gone
    mid: {
        key: 'a19-jelly-squash', name: 'Jelly Squash', blurb: 'The die wobbles like jelly, then squashes down flat into the table and is gone.',
        dur: 1.3,
        start(x) {
            x.own = []; x.home = x.mesh.position.clone(); x.q0 = x.mesh.quaternion.clone();
            // a private copy of the shape (and its churn overlay) that we reshape every frame in table space
            x.geo0 = x.mesh.geometry; x.geo = x.geo0.clone(); x.mesh.geometry = x.geo;
            x.overlays = x.mesh.children.filter((c) => c.isMesh); x.overlays.forEach((c) => (c.geometry = x.geo));
            const p = x.geo.attributes.position, q = x.mesh.quaternion, v = new x.THREE.Vector3(); x.qi = q.clone().invert(); x.w0 = []; let lo = Infinity, hi = -Infinity;
            for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyQuaternion(q); x.w0.push(v.clone()); lo = Math.min(lo, v.y); hi = Math.max(hi, v.y); }
            x.lo = lo; x.tall = Math.max(0.01, hi - lo); x.r = radius(x);
            x.pool = pool(x, 0xff7a18); x.pool.scale.setScalar(0.1);
        },
        tick(k, x) {
            const p = x.geo.attributes.position, v = new x.THREE.Vector3(), w = at(k, 0, 0.6), sq = ease(at(k, 0.5, 0.8)), gone = at(k, 0.8, 1);
            // damped wobble: width and depth swap places, the top lags behind the base like jelly
            const a = 0.28 * (1 - w) * Math.sin(k * 40), spread = 1 + 0.9 * sq;
            for (let i = 0; i < p.count; i++) {
                const o = x.w0[i], h = (o.y - x.lo) / x.tall, lag = 0.3 * Math.sin(k * 40 - 1.5) * (1 - w) * h;
                v.set(o.x * (1 + a) * spread + lag * x.r, x.lo + h * x.tall * (1 - 0.97 * sq), o.z * (1 - a) * spread).applyQuaternion(x.qi);
                p.setXYZ(i, v.x, v.y, v.z);
            }
            p.needsUpdate = true; x.geo.computeVertexNormals(); x.geo.computeBoundingSphere();
            x.mesh.scale.setScalar(Math.max(0.001, 1 - gone)); x.mesh.visible = gone < 0.9;
            x.pool.scale.setScalar(x.r * (1 + 3.5 * sq)); x.pool.material.opacity = sq * (1 - gone);
        },
        end: cleanup,
    },
};
