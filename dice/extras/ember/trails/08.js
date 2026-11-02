// Ember Cage trails 08: a tapered fiery comet-tail ribbon, and fading speed-streak afterimages with trailing sparks.
let mat = null;
function material(THREE) {
    return mat || (mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
}
function makeMesh(THREE, scene, verts, idx) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(verts * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, material(THREE));
    m.frustumCulled = false; m.renderOrder = -1;
    scene.add(m);
    return m;
}
// hot gradient: u 0 = white-hot, 0.35 = orange, 1 = dark red; k = brightness
function heat(u, k, out, o) {
    const r = 1, g = u < 0.2 ? 1 - 0.6 * (u / 0.2) : 0.4 - 0.32 * Math.min(1, (u - 0.2) / 0.8);
    const b = u < 0.2 ? 0.9 * (1 - u / 0.2) * (1 - u / 0.2) : 0;
    out[o] = r * k; out[o + 1] = g * k; out[o + 2] = b * k;
}
function dispose(scene, m) { scene.remove(m); m.geometry.dispose(); }

const N = 44, LIFE = 0.55;
function comet(ctx) {
    const { THREE, scene, mesh } = ctx;
    const idx = [];
    for (let i = 0; i < N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const m = makeMesh(THREE, scene, N * 2, idx);
    const P = m.geometry.attributes.position, C = m.geometry.attributes.color;
    const px = new Float32Array(N), pz = new Float32Array(N), age = new Float32Array(N).fill(99);
    let nx = 0, nz = 1, fade = 1, seen = false;
    return {
        tick(sec, dt, body) {
            if (dt <= 0) return;
            const vis = mesh.visible;
            fade = vis ? 1 : Math.max(0, fade - dt * 4);
            px.copyWithin(1, 0, N - 1); pz.copyWithin(1, 0, N - 1); age.copyWithin(1, 0, N - 1);
            px[0] = body.position.x; pz[0] = body.position.z; age[0] = 0;
            if (!seen) { px.fill(px[0]); pz.fill(pz[0]); seen = true; }
            for (let i = 1; i < N; i++) age[i] += dt;
            const v = Math.hypot(body.velocity.x, body.velocity.z), sp = Math.min(1, v / 8);
            const pa = P.array, ca = C.array;
            for (let i = 0; i < N; i++) {
                const a = Math.max(0, i - 1), b = Math.min(N - 1, i + 1);
                let tx = px[a] - px[b], tz = pz[a] - pz[b]; const l = Math.hypot(tx, tz);
                if (l > 1e-4) { nx = -tz / l; nz = tx / l; }
                const u = Math.min(1, age[i] / (LIFE * (0.4 + 0.6 * sp)));
                const w = 0.95 * Math.pow(1 - u, 0.9) * (0.5 + 0.5 * sp) * fade;
                const k = Math.pow(1 - u, 1.3) * (0.35 + 0.65 * sp) * fade;
                const o = i * 6;
                pa[o] = px[i] + nx * w; pa[o + 1] = 0.25; pa[o + 2] = pz[i] + nz * w;
                pa[o + 3] = px[i] - nx * w; pa[o + 4] = 0.25; pa[o + 5] = pz[i] - nz * w;
                heat(u, k, ca, o); heat(u, k, ca, o + 3);
            }
            P.needsUpdate = C.needsUpdate = true;
        },
        dispose() { dispose(scene, m); },
    };
}

const M = 28;
function streaks(ctx) {
    const { THREE, scene, mesh, rnd } = ctx;
    const r = rnd(8);
    const idx = [];
    for (let i = 0; i < M; i++) { const a = i * 4; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const m = makeMesh(THREE, scene, M * 4, idx);
    const P = m.geometry.attributes.position, C = m.geometry.attributes.color;
    // particle: head x,z; velocity; dir; length; width; life; age (age>=life = dead)
    const x = new Float32Array(M), z = new Float32Array(M), vx = new Float32Array(M), vz = new Float32Array(M),
        dx = new Float32Array(M), dz = new Float32Array(M), len = new Float32Array(M), wd = new Float32Array(M),
        life = new Float32Array(M).fill(1), age = new Float32Array(M).fill(9);
    let next = 0, acc = 0;
    function spawn(px, pz, ux, uz, spark) {
        const i = next; next = (next + 1) % M;
        const s = (r() - 0.5) * 1.3;
        x[i] = px - uz * s; z[i] = pz + ux * s; dx[i] = ux; dz[i] = uz; age[i] = 0;
        if (spark) { vx[i] = -ux * 1.5 + (r() - 0.5) * 3; vz[i] = -uz * 1.5 + (r() - 0.5) * 3; len[i] = 0.35 + r() * 0.3; wd[i] = 0.09; life[i] = 0.4 + r() * 0.4; }
        else { vx[i] = vz[i] = 0; len[i] = 1.6 + r() * 1.8; wd[i] = 0.1 + r() * 0.12; life[i] = 0.28 + r() * 0.2; }
        if (spark) { dx[i] = vx[i]; dz[i] = vz[i]; const l = Math.hypot(dx[i], dz[i]) || 1; dx[i] /= l; dz[i] /= l; }
    }
    let sparkFlag = false;
    return {
        tick(sec, dt, body) {
            if (dt <= 0) return;
            const vv = Math.hypot(body.velocity.x, body.velocity.z), vis = mesh.visible;
            if (vis && vv > 4) {
                acc += dt * (14 + vv * 3);
                const ux = body.velocity.x / vv, uz = body.velocity.z / vv;
                while (acc >= 1) { acc -= 1; sparkFlag = !sparkFlag; spawn(body.position.x, body.position.z, ux, uz, sparkFlag && r() < 0.8); if (!sparkFlag) len[(next + M - 1) % M] *= Math.min(1.6, vv / 8); }
            } else acc = 0;
            const pa = P.array, ca = C.array;
            for (let i = 0; i < M; i++) {
                const o = i * 12;
                age[i] += dt;
                const u = age[i] / life[i];
                if (u >= 1) { pa.fill(0, o, o + 12); ca.fill(0, o, o + 12); continue; }
                x[i] += vx[i] * dt; z[i] += vz[i] * dt;
                const L = len[i] * (1 - u * 0.7), w = wd[i] * (1 - u * 0.5), k = (1 - u) * 1.1;
                const hx = x[i], hz = z[i], tx = hx - dx[i] * L, tz = hz - dz[i] * L, nx = -dz[i] * w, nz = dx[i] * w;
                // head (two verts, hot) then tail (two verts, dark red)
                pa[o] = hx + nx; pa[o + 1] = 0.3; pa[o + 2] = hz + nz;
                pa[o + 3] = hx - nx; pa[o + 4] = 0.3; pa[o + 5] = hz - nz;
                pa[o + 6] = tx; pa[o + 7] = 0.3; pa[o + 8] = tz;
                pa[o + 9] = tx; pa[o + 10] = 0.3; pa[o + 11] = tz;
                heat(0.2 + u * 0.4, k, ca, o); heat(0.2 + u * 0.4, k, ca, o + 3);
                heat(0.8, k * 0.2, ca, o + 6); heat(0.8, k * 0.2, ca, o + 9);
            }
            P.needsUpdate = C.needsUpdate = true;
        },
        dispose() { dispose(scene, m); },
    };
}

export default [
    { key: 't08-comet-tail', name: 'Comet Tail', blurb: 'A tapered ribbon from white-hot to orange to red that stretches with speed and shrinks away as the die stops.', make: comet },
    { key: 't08-speed-streaks', name: 'Speed Streaks', blurb: 'Fading ember afterimage streaks stretched along the throw, with a few trailing sparks, only while fast.', make: streaks },
];
