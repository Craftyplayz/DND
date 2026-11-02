// Ember Cage exits 20: nat 1 is cut into slices that topple like dominoes, nat 20 grows a crown of flame spikes and flashes away, every other roll rolls off the table.
let FX = null;
function fx(T) {
    if (FX) return FX;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    // spike points along +x, base at the origin
    const cone = new T.ConeGeometry(0.5, 1, 6); cone.rotateZ(-Math.PI / 2); cone.translate(0.5, 0, 0);
    return (FX = { soft: new T.CanvasTexture(c), plane: new T.PlaneGeometry(1, 1), cone });
}
const clamp = (v) => Math.max(0, Math.min(1, v));
const at = (k, a, b) => clamp((k - a) / (b - a));
const ease = (k) => 1 - (1 - k) ** 3;
const add = (x, o) => { x.scene.add(o); x.own.push(o); return o; };
const sprite = (x, color) => { const s = add(x, new x.THREE.Sprite(new x.THREE.SpriteMaterial({ map: fx(x.THREE).soft, color, transparent: true, depthWrite: false, blending: x.THREE.AdditiveBlending }))); s.position.copy(x.mesh.position); return s; };
const cleanup = (x) => {
    for (const o of x.own || []) { x.scene.remove(o); o.material.dispose(); }
    for (const g of x.geos || []) g.dispose();
    x.own = []; x.geos = []; x.mesh.visible = true; x.mesh.scale.setScalar(1);
};
const radius = (x) => { const g = x.mesh.geometry; g.computeBoundingSphere(); return g.boundingSphere.radius; };

export default {
    nat1: {
        key: 'a20-dominoes', name: 'Domino Slices', dur: 2.2, impact: 1.0,
        blurb: 'The die is cut into upright slices that topple sideways one after another like dominoes, glowing hot where they fall.',
        start(x) {
            x.own = []; x.geos = []; const T = x.THREE, N = 8, g = x.mesh.geometry.index ? x.mesh.geometry.toNonIndexed() : x.mesh.geometry;
            x.p0 = x.mesh.position.clone(); x.q0 = x.mesh.quaternion.clone(); x.R = radius(x);
            const P = g.attributes.position, U = g.attributes.uv, mats = Array.isArray(x.mesh.material), v = new T.Vector3(), w = [];
            for (let i = 0; i < P.count; i++) w.push(v.fromBufferAttribute(P, i).applyQuaternion(x.q0).clone());
            // face -> material index, then triangles go to the slice that holds their centre (table-space x)
            const mi = new Int32Array(P.count / 3); for (const gr of g.groups) for (let t = gr.start / 3; t < (gr.start + gr.count) / 3; t++) mi[t] = gr.materialIndex;
            const bins = Array.from({ length: N }, () => []);
            for (let t = 0; t < P.count / 3; t++) bins[Math.min(N - 1, Math.max(0, Math.floor(((w[t * 3].x + w[t * 3 + 1].x + w[t * 3 + 2].x) / 3 / x.R / 2 + 0.5) * N)))].push(t);
            x.sl = [];
            bins.forEach((ts, b) => {
                if (!ts.length) return;
                const pos = new Float32Array(ts.length * 9), uv = new Float32Array(ts.length * 6), geo = new T.BufferGeometry(), sc = new T.Vector3();
                ts.forEach((t, j) => { for (let c = 0; c < 9; c++) pos[j * 9 + c] = P.array[t * 9 + c]; if (U) for (let c = 0; c < 6; c++) uv[j * 6 + c] = U.array[t * 6 + c]; for (let c = 0; c < 3; c++) sc.add(w[t * 3 + c]); if (mats) geo.addGroup(j * 3, 3, mi[t]); });
                geo.setAttribute('position', new T.BufferAttribute(pos, 3)); if (U) geo.setAttribute('uv', new T.BufferAttribute(uv, 2)); geo.computeVertexNormals(); x.geos.push(geo);
                const m = add(x, new T.Mesh(geo, x.mesh.material)); m.rotation.order = 'YXZ';
                const cen = sc.divideScalar(ts.length * 3).add(x.p0);
                x.sl.push({ m, S: cen, Pv: new T.Vector3(x.p0.x + (-1 + (b + 1) * 2 / N) * x.R, x.p0.y - x.R, cen.z), t0: 0.1 + b * 0.07, i: x.sl.length });
            });
            x.mesh.visible = false; x.glow = sprite(x, 0xff6a10); x.glow.scale.setScalar(0.1); x.qz = new T.Quaternion(); x.Z = new T.Vector3(0, 0, 1);
            x.pv = new T.Vector3(); x.s1 = new T.Vector3();
        },
        tick(k, x) {
            const fade = 1 - ease(at(k, 0.82, 1));
            for (const s of x.sl) {
                // topple toward +x: ease-in fall, a small bounce and slide, then it lies flat
                const u = at(k, s.t0, s.t0 + 0.35), th = -1.5 * u * u, slide = x.R * 0.5 * s.i * ease(at(k, s.t0 + 0.1, s.t0 + 0.6));
                x.qz.setFromAxisAngle(x.Z, th);
                x.pv.copy(x.p0).sub(s.Pv).applyQuaternion(x.qz).add(s.Pv); // slice-origin after rotating about its bottom-right edge
                x.s1.copy(s.S).sub(s.Pv).applyQuaternion(x.qz).add(s.Pv);
                const sc = Math.max(0.001, fade);
                s.m.position.copy(x.pv).multiplyScalar(sc).addScaledVector(x.s1, 1 - sc); s.m.position.x += slide; s.m.scale.setScalar(sc);
                s.m.quaternion.copy(x.qz).multiply(x.q0);
                // hot where it has fallen: tint by how far down it is
                const mt = s.m.material; if (!Array.isArray(mt) && mt.emissive) mt.emissive.setRGB(0.6 * u, 0.2 * u, 0);
            }
            x.glow.position.set(x.p0.x + 0.5 * x.R * at(k, 0.1, 0.8) * 2, x.p0.y, x.p0.z); x.glow.scale.setScalar(x.R * (1 + 4 * at(k, 0.1, 0.8)));
            x.glow.material.opacity = 0.55 * Math.sin(Math.PI * at(k, 0.05, 0.95));
        },
        end(x) { cleanup(x); },
    },
    nat20: {
        key: 'a20-flame-crown', name: 'Crown of Flames', dur: 2.2, impact: 1.5,
        blurb: 'The die spins up and a ring of flame spikes grows out of its sides like a crown, then it flashes away in white fire.',
        start(x) {
            x.own = []; x.geos = []; const T = x.THREE;
            x.p0 = x.mesh.position.clone(); x.q0 = x.mesh.quaternion.clone(); x.R = radius(x); x.qy = new T.Quaternion(); x.Y = new T.Vector3(0, 1, 0);
            x.sp = []; const N = 14;
            for (let i = 0; i < N; i++) {
                const m = add(x, new T.Mesh(fx(T).cone, new T.MeshBasicMaterial({ color: 0xff6a10, transparent: true, depthWrite: false, blending: T.AdditiveBlending })));
                x.sp.push({ m, a: i / N * 6.283, t0: 0.18 + (i % 7) * 0.03, L: 1.3 + (i % 2) * 0.7 });
            }
            x.halo = sprite(x, 0xffa020); x.halo.scale.setScalar(0.1); x.flash = sprite(x, 0xffffff); x.flash.scale.setScalar(0.1);
        },
        tick(k, x) {
            const spin = 14 * k ** 2.2, R = x.R, gone = at(k, 0.72, 0.9);
            // the die: spins faster and faster, swells, then bursts bigger and vanishes
            x.qy.setFromAxisAngle(x.Y, spin); x.mesh.quaternion.copy(x.qy).multiply(x.q0);
            x.mesh.scale.setScalar(Math.max(0.001, (1 + 0.25 * at(k, 0, 0.7) + 0.9 * gone) * (1 - at(k, 0.78, 0.92))));
            for (const s of x.sp) {
                const g = ease(at(k, s.t0, s.t0 + 0.4)), a = s.a + spin * 0.6, fl = 1 + 0.12 * Math.sin(k * 60 + s.a * 5), L = s.L * R * g * fl * (1 + 0.8 * gone);
                s.m.position.set(x.p0.x + Math.cos(a) * R * 0.75, x.p0.y + 0.1, x.p0.z - Math.sin(a) * R * 0.75); s.m.rotation.set(0, a, 0);
                s.m.scale.set(Math.max(0.001, L), R * 0.5 * (0.4 + g), R * 0.5 * (0.4 + g) * 0.2 + 0.01);
                s.m.material.color.setRGB(1, 0.35 + 0.6 * at(k, 0.3, 0.8), 0.05 + 0.6 * gone); s.m.material.opacity = (1 - at(k, 0.85, 1)) * 0.9;
            }
            x.halo.scale.setScalar(R * (2 + 5 * at(k, 0.1, 0.75))); x.halo.material.opacity = 0.7 * at(k, 0.1, 0.7) * (1 - at(k, 0.85, 1));
            const f = at(k, 0.68, 0.95); x.flash.scale.setScalar(R * (3 + 12 * ease(f))); x.flash.material.opacity = f > 0 ? (1 - f) ** 1.5 : 0;
        },
        end(x) { cleanup(x); },
    },
    mid: {
        key: 'a20-roll-away', name: 'Roll Away', dur: 1.2,
        blurb: 'The die tumbles over and over along the table, away from the middle, and rolls off the edge leaving a short ember trail.',
        start(x) {
            const T = x.THREE; x.own = []; x.geos = [];
            x.p0 = x.mesh.position.clone(); x.q0 = x.mesh.quaternion.clone(); x.R = radius(x) || 1;
            const h = Math.hypot(x.p0.x, x.p0.z); x.d = h > 0.5 ? new T.Vector3(x.p0.x / h, 0, x.p0.z / h) : new T.Vector3(1, 0, 0);
            x.ax = new T.Vector3(x.d.z, 0, -x.d.x); x.qr = new T.Quaternion();
            x.tr = [0, 1, 2, 3, 4].map(() => sprite(x, 0xff7a18));
        },
        tick(k, x) {
            // a slow wobble up onto an edge first, then accelerating tumble; rolling without slipping: angle = distance / radius
            const dist = 24 * k ** 1.8, ang = dist / x.R;
            x.qr.setFromAxisAngle(x.ax, ang); x.mesh.quaternion.copy(x.qr).multiply(x.q0);
            x.mesh.position.copy(x.p0).addScaledVector(x.d, dist);
            x.tr.forEach((t, i) => { const back = (i + 1) * 0.06; t.position.copy(x.p0).addScaledVector(x.d, 24 * Math.max(0, k - back) ** 1.8); t.scale.setScalar(x.R * (1.6 - i * 0.22)); t.material.opacity = 0.5 * at(k, 0.05, 0.3) * (1 - i / 5); });
        },
        end(x) { x.mesh.position.copy(x.p0); x.mesh.quaternion.copy(x.q0); cleanup(x); },
    },
};
