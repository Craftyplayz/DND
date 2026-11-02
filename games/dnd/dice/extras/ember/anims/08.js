// Ember Cage exits 08: nat 1 cracks open and shatters into its faces; nat 20 splits along a seam and reveals a blazing mini sun.
let T0 = null;
function tex(THREE) {
    if (T0) return T0;
    const mk = (w, h, fn) => { const c = document.createElement('canvas'); c.width = w; c.height = h; fn(c.getContext('2d'), w, h); return new THREE.CanvasTexture(c); };
    const soft = mk(64, 64, (g) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,.55)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); });
    // a thin line of light, brightest in the middle and gone at both ends, for rays and the seam
    const streak = mk(256, 32, (g) => { const h = g.createLinearGradient(0, 0, 256, 0); h.addColorStop(0, 'rgba(255,255,255,0)'); h.addColorStop(0.5, 'rgba(255,255,255,1)'); h.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = h; g.beginPath(); g.moveTo(0, 16); g.quadraticCurveTo(128, 3, 256, 16); g.quadraticCurveTo(128, 29, 0, 16); g.fill(); });
    const ring = mk(128, 128, (g) => { const r = g.createRadialGradient(64, 64, 40, 64, 64, 64); r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(0.6, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128); });
    return (T0 = { soft, streak, ring, plane: new THREE.PlaneGeometry(1, 1) });
}
const at = (t, a, b) => Math.max(0, Math.min(1, (t - a) / (b - a)));
const ease = (k) => 1 - (1 - k) ** 3;

function spr(x, map, color, rot = 0) {
    const s = new x.THREE.Sprite(new x.THREE.SpriteMaterial({ map, color, transparent: true, depthWrite: false, blending: x.THREE.AdditiveBlending, rotation: rot }));
    s.position.copy(x.home); s.position.y += 2; s.renderOrder = 5; x.scene.add(s); x.own.push(s); return s;
}
function ringMesh(x, color) {
    const m = new x.THREE.Mesh(tex(x.THREE).plane, new x.THREE.MeshBasicMaterial({ map: tex(x.THREE).ring, color, transparent: true, depthWrite: false, blending: x.THREE.AdditiveBlending }));
    m.rotation.x = -Math.PI / 2; m.position.set(x.home.x, 0.08, x.home.z); x.scene.add(m); x.own.push(m); return m;
}
function sparks(x, n, color, size) {
    const T = x.THREE, pos = new Float32Array(n * 3), vel = new Float32Array(n * 3);
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    const p = new T.Points(geo, new T.PointsMaterial({ map: tex(T).soft, color, size, sizeAttenuation: false, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
    p.frustumCulled = false; p.visible = false; p.pos = pos; p.vel = vel; p.n = n; x.scene.add(p); x.own.push(p); return p;
}
function sparkInit(p, x, speed, lift) {
    for (let i = 0; i < p.n; i++) {
        const a = Math.random() * 6.283, s = speed * (0.25 + Math.random() * 0.9);
        p.vel[i * 3] = Math.cos(a) * s; p.vel[i * 3 + 1] = lift * Math.random(); p.vel[i * 3 + 2] = Math.sin(a) * s;
        p.pos[i * 3] = x.home.x; p.pos[i * 3 + 1] = x.home.y + 1; p.pos[i * 3 + 2] = x.home.z;
    }
    p.visible = true;
}
function sparkMove(p, dt, drag, grav) {
    const d = Math.exp(-drag * dt);
    for (let i = 0; i < p.n; i++) { const j = i * 3;
        p.vel[j] *= d; p.vel[j + 2] *= d; p.vel[j + 1] -= grav * dt;
        p.pos[j] += p.vel[j] * dt; p.pos[j + 1] += p.vel[j + 1] * dt; p.pos[j + 2] += p.vel[j + 2] * dt; }
    p.geometry.attributes.position.needsUpdate = true;
}

// split the die's triangles into its flat faces; each becomes a shard (world space, centred on its middle) wearing the die's own material for that face
function makeShards(x) {
    const T = x.THREE, m = x.mesh, g = m.geometry, P = g.attributes.position, UV = g.attributes.uv, idx = g.index;
    m.updateMatrixWorld(true);
    const nT = (idx ? idx.count : P.count) / 3, vi = (t, c) => (idx ? idx.getX(t * 3 + c) : t * 3 + c);
    const a = new T.Vector3(), b = new T.Vector3(), c = new T.Vector3(), n = new T.Vector3(), groups = [];
    const matOf = (t) => { if (!Array.isArray(m.material)) return m.material; const o = t * 3; for (const gr of g.groups) if (o >= gr.start && o < gr.start + gr.count) return m.material[gr.materialIndex]; return m.material[0]; };
    for (let t = 0; t < nT; t++) {
        a.fromBufferAttribute(P, vi(t, 0)).applyMatrix4(m.matrixWorld); b.fromBufferAttribute(P, vi(t, 1)).applyMatrix4(m.matrixWorld); c.fromBufferAttribute(P, vi(t, 2)).applyMatrix4(m.matrixWorld);
        n.subVectors(c, b).cross(new T.Vector3().subVectors(a, b)).normalize();
        let grp = groups.find((q) => q.n.dot(n) > 0.97);
        if (!grp) groups.push((grp = { n: n.clone(), tris: [], mat: matOf(t) }));
        grp.tris.push(t);
    }
    const out = [], v = new T.Vector3();
    for (const grp of groups.slice(0, 60)) {
        const pos = [], uv = [], cen = new T.Vector3(); let cnt = 0;
        for (const t of grp.tris) for (let k = 0; k < 3; k++) { v.fromBufferAttribute(P, vi(t, k)).applyMatrix4(m.matrixWorld); pos.push(v.x, v.y, v.z); cen.add(v); cnt++; if (UV) uv.push(UV.getX(vi(t, k)), UV.getY(vi(t, k))); }
        cen.divideScalar(cnt);
        for (let i = 0; i < pos.length; i += 3) { pos[i] -= cen.x; pos[i + 1] -= cen.y; pos[i + 2] -= cen.z; }
        const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
        if (UV) geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
        geo.computeVertexNormals();
        const mesh = new T.Mesh(geo, grp.mat); mesh.visible = false; mesh.position.copy(cen);
        const heat = new T.Mesh(geo, x.heatMat); heat.scale.setScalar(1.012); mesh.add(heat);
        const edge = new T.LineSegments(new T.EdgesGeometry(geo, 20), x.edgeMat); edge.scale.setScalar(1.012); mesh.add(edge);
        x.scene.add(mesh);
        out.push({ mesh, geo, edge, n: grp.n, cx: cen.x, cy: cen.y, cz: cen.z, axis: new T.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(), spin: 4 + Math.random() * 9, sp: 3 + Math.random() * 6, vy: 4 + Math.random() * 6, ph: Math.random() });
    }
    return out;
}
function setupFx(x, heatColor, edgeColor) {
    const T = x.THREE;
    x.own = []; x.home = x.mesh.position.clone(); x.t = 0; x.done = false;
    x.heatMat = new T.MeshBasicMaterial({ color: heatColor, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide });
    x.edgeMat = new T.LineBasicMaterial({ color: edgeColor, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false });
    x.shards = makeShards(x);
    // heat veil over the whole die before it breaks
    x.veil = new T.Mesh(x.mesh.geometry, x.heatMat.clone()); x.veil.scale.setScalar(1.01); x.mesh.add(x.veil);
}
function cleanup(x) {
    for (const o of x.own || []) { x.scene.remove(o); o.material.dispose(); if (o.isPoints || o.geometry !== undefined && o.userData.own) o.geometry.dispose(); }
    for (const s of x.shards || []) { x.scene.remove(s.mesh); s.edge.geometry.dispose(); s.geo.dispose(); }
    if (x.veil) { x.mesh.remove(x.veil); x.veil.material.dispose(); }
    if (x.crackTex) { x.mesh.remove(x.crack); x.crack.material.dispose(); x.crackTex.dispose(); }
    x.heatMat?.dispose(); x.edgeMat?.dispose();
    x.own = []; x.shards = []; x.veil = x.crack = x.crackTex = null;
}

// ---- cracks: precomputed jagged branches, drawn progressively into a canvas texture ----
function makeCracks(x) {
    const T = x.THREE, S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S;
    const segs = [];
    const grow = (px, py, ang, len, depth, t0) => {
        let cx = px, cy = py;
        for (let i = 0; i < len; i++) {
            ang += (Math.random() - 0.5) * 0.9; const st = 8 + Math.random() * 10, nx = cx + Math.cos(ang) * st, ny = cy + Math.sin(ang) * st;
            segs.push([cx, cy, nx, ny, t0 + i * 0.045, depth]); cx = nx; cy = ny;
            if (depth < 2 && Math.random() < 0.28) grow(cx, cy, ang + (Math.random() < 0.5 ? -1 : 1) * (0.6 + Math.random() * 0.5), 3 + (Math.random() * 4 | 0), depth + 1, t0 + i * 0.045 + 0.05);
        }
    };
    for (let i = 0; i < 7; i++) grow(S / 2, S / 2, (i / 7) * 6.283 + Math.random() * 0.6, 8 + (Math.random() * 5 | 0), 0, 0);
    // also from the corners of the face so all edges look fractured
    for (let i = 0; i < 6; i++) { const a = Math.random() * 6.283; grow(S / 2 + Math.cos(a) * 110, S / 2 + Math.sin(a) * 110, a + 3.14, 5 + (Math.random() * 4 | 0), 1, 0.1); }
    x.crackTex = new T.CanvasTexture(cv); x.crackSegs = segs; x.crackCv = cv;
    x.crack = new T.Mesh(x.mesh.geometry, new T.MeshBasicMaterial({ map: x.crackTex, transparent: true, blending: T.AdditiveBlending, depthWrite: false, opacity: 1 }));
    x.crack.scale.setScalar(1.008); x.mesh.add(x.crack);
}
function drawCracks(x, p) {
    const g = x.crackCv.getContext('2d'), S = 256; g.clearRect(0, 0, S, S); g.lineCap = 'round';
    for (const [pass, w, col] of [[0, 9, 'rgba(255,90,0,.45)'], [1, 4, 'rgba(255,170,40,.9)'], [2, 1.6, 'rgba(255,255,230,1)']]) {
        g.strokeStyle = col; g.beginPath();
        for (const s of x.crackSegs) { if (s[4] > p) continue; g.lineWidth = w * (s[5] === 0 ? 1 : s[5] === 1 ? 0.7 : 0.5); g.moveTo(s[0], s[1]); g.lineTo(s[2], s[3]); }
        g.stroke();
    }
    x.crackTex.needsUpdate = true;
}

export default {
    nat1: {
        key: 'n08-shatter', name: 'Shatter', blurb: 'Glowing cracks spread across the die, then it bursts into white-hot faces that tumble, land, cool and fade away.',
        dur: 2.4, impact: 0.6,
        start(x) {
            setupFx(x, 0xff7a20, 0xffb050); makeCracks(x);
            x.glow = spr(x, tex(x.THREE).soft, 0xff5a10); x.glow.scale.setScalar(0.1);
            x.flash = spr(x, tex(x.THREE).soft, 0xfff0c0); x.flash.material.opacity = 0;
            x.ring = ringMesh(x, 0xffa040); x.ring.material.opacity = 0;
            x.ring2 = ringMesh(x, 0xfff0b0); x.ring2.material.opacity = 0;
            x.sp = sparks(x, 160, 0xffb040, 6); x.sp2 = sparks(x, 40, 0xffffff, 9);
        },
        tick(k, x) {
            const sec = k * 2.4, pre = at(sec, 0, 0.6), t = Math.max(0, sec - 0.6);
            if (sec < 0.6) {
                const sh = pre * pre * 0.3;
                x.mesh.position.set(x.home.x + (Math.random() - 0.5) * sh, x.home.y, x.home.z + (Math.random() - 0.5) * sh);
                x.mesh.scale.setScalar(1 + pre * 0.06 * Math.sin(sec * 60));
                drawCracks(x, at(sec, 0, 0.5) * 1.1);
                x.glow.scale.setScalar(1.5 + pre * 2.5 + Math.sin(sec * 30) * 0.15); x.glow.material.opacity = 0.2 + pre * 0.7;
                x.veil.material.opacity = Math.pow(at(sec, 0.25, 0.6), 2) * 0.9; x.veil.material.color.setRGB(1, 0.5 + 0.5 * pre, 0.15 + 0.7 * pre * pre);
                return;
            }
            if (!x.done) {
                x.done = true; x.mesh.visible = false; sparkInit(x.sp, x, 11, 4); sparkInit(x.sp2, x, 16, 2);
                for (const s of x.shards) { s.mesh.visible = true; s.dx = s.cx - x.home.x; s.dz = s.cz - x.home.z; const l = Math.hypot(s.dx, s.dz) || 1; const a = Math.random() * 6.283;
                    s.dx = (s.dx / l) * 0.6 + Math.cos(a) * 0.5; s.dz = (s.dz / l) * 0.6 + Math.sin(a) * 0.5; }
            }
            const fl = Math.exp(-t * 7);
            x.flash.scale.setScalar(2 + ease(at(t, 0, 0.35)) * 9); x.flash.material.opacity = fl;
            x.glow.scale.setScalar(4 + ease(at(t, 0, 0.8)) * 4); x.glow.material.opacity = Math.max(0, 0.9 - t * 1.3);
            x.ring.scale.setScalar(1 + ease(at(t, 0, 0.9)) * 22); x.ring.material.opacity = Math.max(0, 0.95 - t * 1.1);
            x.ring2.scale.setScalar(1 + ease(at(t, 0, 0.5)) * 13); x.ring2.material.opacity = Math.max(0, 0.9 - t * 2.1);
            // faces: fly out with drag, rise and fall in height (shown as scale), tumble, heat cools from white to red to nothing
            const heat = Math.exp(-t * 2.2);
            x.heatMat.opacity = heat * 0.8; x.heatMat.color.setRGB(1, 0.35 + 0.65 * heat * heat, 0.1 + 0.8 * heat ** 4);
            x.edgeMat.opacity = Math.max(0, 1 - t * 0.6); x.edgeMat.color.setRGB(1, 0.4 + 0.5 * heat, 0.1 + 0.4 * heat * heat);
            for (const s of x.shards) {
                // they fall back and land (by t = vy / 10), and only fade once they are lying on the table
                const run = (1 - Math.exp(-t * 2.4)) / 2.4 * s.sp, h = Math.max(0, s.vy * t - 10 * t * t), land = s.vy / 10, h4 = at(t, land + 0.15, land + 0.6);
                s.mesh.position.set(s.cx + s.dx * run, s.cy + h, s.cz + s.dz * run);
                s.mesh.quaternion.setFromAxisAngle(s.axis, s.spin * (1 - Math.exp(-t * 2)) * 0.6 + t * s.spin * 0.4 * (h > 0 ? 1 : 0.1));
                s.mesh.scale.setScalar(Math.max(0.001, (1 + h * 0.07) * (1 - h4 * h4))); s.mesh.visible = h4 < 1;
            }
            sparkMove(x.sp, x.dt || 0.016, 1.6, 0); x.sp.material.opacity = Math.max(0, 1 - t * 0.6);
            sparkMove(x.sp2, x.dt || 0.016, 3.5, 0); x.sp2.material.opacity = Math.max(0, 1 - t * 2.2);
        },
        end: cleanup,
    },
    nat20: {
        key: 'n08-inner-sun', name: 'Inner Sun', blurb: 'A golden seam splits the die, its halves drift apart and a blazing sun swells inside, flares, then dissolves into gold light.',
        dur: 2.2, impact: 0.9,
        start(x) {
            const T = x.THREE; setupFx(x, 0xffc040, 0xffe080);
            x.seam = spr(x, tex(T).streak, 0xffe9a0); x.seam.scale.set(0.1, 0.1, 1); x.seam.material.opacity = 0;
            x.halo = spr(x, tex(T).soft, 0xff8a10); x.halo.scale.setScalar(0.1);
            x.corona = spr(x, tex(T).soft, 0xffa020); x.corona.scale.setScalar(0.1);
            x.core = spr(x, tex(T).soft, 0xffffff); x.core.scale.setScalar(0.1);
            x.gold = spr(x, tex(T).soft, 0xffd860); x.gold.material.opacity = 0;
            x.rays = [];
            for (let i = 0; i < 18; i++) { const r = spr(x, tex(T).streak, i % 3 ? 0xffc040 : 0xfff0b0, 0); r.ang = (i / 18) * 3.1416; r.len = i % 3 ? 5 : 8; r.dir = i % 2 ? 1 : -1; r.ph = Math.random() * 6; r.material.opacity = 0; x.rays.push(r); }
            x.ring = ringMesh(x, 0xffd860); x.ring.material.opacity = 0;
            x.ring2 = ringMesh(x, 0xffffff); x.ring2.material.opacity = 0;
            x.sp = sparks(x, 140, 0xffd050, 6);
            // the halves: faces on one side of the seam go one way; the seam runs left to right on screen
            for (const s of x.shards) s.side = s.cz < x.home.z - 0.01 ? -1 : s.cz > x.home.z + 0.01 ? 1 : (Math.random() < 0.5 ? -1 : 1);
        },
        tick(k, x) {
            const sec = k * 2.2, pre = at(sec, 0, 0.9), t = Math.max(0, sec - 0.9), pul = 0.5 + 0.5 * Math.sin(sec * 16);
            if (sec < 0.9) {
                x.mesh.position.set(x.home.x, x.home.y, x.home.z);
                x.mesh.scale.setScalar(1 + ease(pre) * 0.12);
                x.mesh.rotation.y; // physics already set the pose; only scale/position are driven here
                x.veil.material.opacity = pre * 0.55 * (0.8 + 0.2 * pul); x.veil.material.color.setRGB(1, 0.75, 0.25 + pre * 0.4);
                const sl = ease(at(sec, 0.1, 0.8));
                x.seam.scale.set(0.1 + sl * 5.2, 0.15 + pre * 0.5, 1); x.seam.material.opacity = Math.min(1, sl * 1.3) * (0.7 + 0.3 * pul);
                x.halo.scale.setScalar(1 + pre * 3.5); x.halo.material.opacity = pre * 0.7;
                x.core.scale.setScalar(0.3 + pre * 1.3); x.core.material.opacity = pre * pre;
                return;
            }
            if (!x.done) {
                x.done = true; x.mesh.visible = false; x.mesh.scale.setScalar(1); sparkInit(x.sp, x, 6, 0.5);
                for (const s of x.shards) { s.mesh.visible = true; s.mesh.position.set(s.cx, s.cy, s.cz); }
            }
            const open = ease(at(t, 0, 0.75)), drift = 3.2 * open + t * 0.7, fade = at(t, 0.85, 1.3), flare = Math.exp(-((t - 0.3) ** 2) / 0.04);
            // the halves swing apart on a slight tilt and fade into the light
            x.heatMat.opacity = 0.7 * Math.exp(-t * 1.3) + 0.25; x.heatMat.color.setRGB(1, 0.85 - t * 0.2, 0.45);
            x.edgeMat.opacity = Math.max(0, 1 - fade); x.veil.material.opacity = 0;
            for (const s of x.shards) {
                s.mesh.position.set(s.cx + (s.cx - x.home.x) * open * 0.25, s.cy + open * 0.6, s.cz + s.side * (drift + Math.abs(s.cz - x.home.z) * 0.3 * open));
                s.mesh.quaternion.setFromAxisAngle(s.axis, s.side * open * (0.5 + s.ph) * 0.9 + t * s.side * 0.35);
                s.mesh.scale.setScalar(Math.max(0.001, 1 - fade * fade * (0.8 + 0.2 * s.ph)));
            }
            // the sun: core swells and pulses, flares white at ~0.3 s, then everything settles into gold light
            const life = 1 - at(t, 0.9, 1.3), swell = 1.8 + ease(at(t, 0, 0.5)) * 2.4 + flare * 3.2 + pul * 0.35 * life;
            x.seam.material.opacity = Math.max(0, 1 - t * 4); x.seam.scale.x = 5.3 + t * 4;
            x.core.scale.setScalar(swell); x.core.material.opacity = life;
            x.corona.scale.setScalar(swell * 2.2 + pul * 0.6); x.corona.material.opacity = 0.85 * life;
            x.corona.material.color.setRGB(1, 0.62 + 0.3 * flare, 0.1 + 0.5 * flare);
            x.halo.scale.setScalar(6 + ease(at(t, 0, 0.8)) * 5 + flare * 3); x.halo.material.opacity = 0.6 * life + 0.2 * flare;
            for (const r of x.rays) {
                const a = r.ang + t * 0.9 * r.dir + Math.sin(sec * 3 + r.ph) * 0.08, grow = ease(at(t, 0.03, 0.4)) * (0.8 + 0.3 * Math.sin(sec * 9 + r.ph) + flare * 0.7);
                r.material.rotation = a; r.scale.set(r.len * grow * (0.6 + 0.6 * life) + 0.01, 0.35 + flare * 0.3, 1); r.material.opacity = (0.8 + 0.2 * pul) * life * Math.min(1, t * 8);
            }
            const gf = at(t, 0.7, 1.6);
            x.gold.scale.setScalar(5 + gf * 12); x.gold.material.opacity = Math.sin(gf * 3.1416) * 0.75;
            x.ring.scale.setScalar(1 + ease(at(t, 0, 0.9)) * 18); x.ring.material.opacity = Math.max(0, 0.9 - t * 0.85);
            x.ring2.scale.setScalar(1 + ease(at(t, 0.28, 0.7)) * 10); x.ring2.material.opacity = t < 0.28 ? 0 : Math.max(0, 0.9 - (t - 0.28) * 2.3);
            sparkMove(x.sp, x.dt || 0.016, 0.5, 0); x.sp.material.opacity = Math.max(0, 1 - t * 0.7);
        },
        end: cleanup,
    },
};
