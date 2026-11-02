// Ember Cage trails 10: a sparkler fizz of branching white-gold streaks, and a string of firecracker pops.
let M = null; // shared materials, built lazily
function shared(THREE) {
    if (M) return M;
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const g = c.getContext('2d'), gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, '#fff'); gr.addColorStop(0.35, 'rgba(255,255,255,.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
    const tex = new THREE.CanvasTexture(c);
    M = {
        line: new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
        pts: new THREE.PointsMaterial({ map: tex, size: 12, sizeAttenuation: false, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    };
    return M;
}

// sparkler: 60 line segments in a ring; each spark is a streak that may fork once
function sparkler(ctx) {
    const { THREE, scene, mesh } = ctx, m = shared(THREE), R = ctx.rnd(10), N = 60;
    const pos = new Float32Array(N * 6), col = new Float32Array(N * 8);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
    const obj = new THREE.LineSegments(geo, m.line); obj.frustumCulled = false; scene.add(obj);
    const x = new Float32Array(N), z = new Float32Array(N), y = new Float32Array(N), vx = new Float32Array(N), vz = new Float32Array(N),
        life = new Float32Array(N), max = new Float32Array(N), fork = new Uint8Array(N);
    let head = 0, acc = 0;
    const spawn = (px, py, pz, a, s, f) => {
        const i = head; head = (head + 1) % N;
        x[i] = px; y[i] = py; z[i] = pz; vx[i] = Math.cos(a) * s; vz[i] = Math.sin(a) * s;
        max[i] = life[i] = 0.18 + R() * 0.3; fork[i] = f;
    };
    return {
        tick(sec, dt, body) {
            const p = body.position, sp = Math.hypot(body.velocity.x, body.velocity.z);
            if (mesh.visible) {
                acc += dt * (14 + sp * 7);
                while (acc >= 1) { acc--; spawn(p.x + (R() - .5) * .8, Math.min(p.y, 1.3) - 0.3, p.z + (R() - .5) * .8, R() * 6.283, 2 + R() * 5, R() < .5 ? 1 : 0); }
            }
            for (let i = 0; i < N; i++) {
                const o = i * 6, c = i * 8;
                if (life[i] <= 0) { col[c + 3] = col[c + 7] = 0; continue; }
                const l0 = life[i]; life[i] -= dt;
                if (fork[i] && l0 > max[i] * .5 && life[i] <= max[i] * .5) { // branch off at half life
                    fork[i] = 0; const a = Math.atan2(vz[i], vx[i]) + (R() < .5 ? -1 : 1) * (.7 + R() * .8);
                    spawn(x[i], y[i], z[i], a, 2 + R() * 3, 0);
                }
                x[i] += vx[i] * dt; z[i] += vz[i] * dt; y[i] += dt * 1.2; vx[i] *= .96; vz[i] *= .96;
                const t = Math.max(0, life[i] / max[i]), tl = 0.07 + 0.05 * t;
                pos[o] = x[i]; pos[o + 1] = y[i]; pos[o + 2] = z[i];
                pos[o + 3] = x[i] - vx[i] * tl; pos[o + 4] = y[i]; pos[o + 5] = z[i] - vz[i] * tl;
                col[c] = 1; col[c + 1] = .9; col[c + 2] = .55; col[c + 3] = t; col[c + 4] = 1; col[c + 5] = .5; col[c + 6] = .1; col[c + 7] = 0;
            }
            geo.attributes.position.needsUpdate = geo.attributes.color.needsUpdate = true;
        },
        dispose() { scene.remove(obj); geo.dispose(); },
    };
}

// firecrackers: a burst of 18 points every ~1.8 units of travel
function pops(ctx) {
    const { THREE, scene, mesh } = ctx, m = shared(THREE), R = ctx.rnd(11), N = 120;
    const pos = new Float32Array(N * 3), col = new Float32Array(N * 4);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
    const obj = new THREE.Points(geo, m.pts); obj.frustumCulled = false; scene.add(obj);
    const vx = new Float32Array(N), vy = new Float32Array(N), vz = new Float32Array(N), life = new Float32Array(N), max = new Float32Array(N);
    const rgb = new Float32Array(N * 3);
    const pal = [[1, .62, .08], [1, .38, .04], [1, .15, .04], [.8, .04, .1]];
    let head = 0, dist = 0, lx = null, lz = null;
    return {
        tick(sec, dt, body) {
            const p = body.position;
            if (lx === null) { lx = p.x; lz = p.z; }
            if (mesh.visible) {
                dist += Math.hypot(p.x - lx, p.z - lz);
                if (dist > 1.8 && p.y < 1.6) {
                    dist = 0;
                    const c = pal[(R() * 3.99) | 0], bx = p.x + (R() - .5) * .4, bz = p.z + (R() - .5) * .4;
                    for (let k = 0; k < 18; k++) {
                        const i = head, a = R() * 6.283, s = 1.5 + R() * 4; head = (head + 1) % N;
                        pos[i * 3] = bx; pos[i * 3 + 1] = .3; pos[i * 3 + 2] = bz;
                        vx[i] = Math.cos(a) * s; vz[i] = Math.sin(a) * s; vy[i] = 2 + R() * 3;
                        max[i] = life[i] = .7 + R() * .7;
                        const w = k < 2 ? [1, .9, .5] : c; rgb[i * 3] = w[0]; rgb[i * 3 + 1] = w[1]; rgb[i * 3 + 2] = w[2];
                    }
                }
            }
            lx = p.x; lz = p.z;
            for (let i = 0; i < N; i++) {
                if (life[i] <= 0) { col[i * 4 + 3] = 0; continue; }
                life[i] -= dt;
                pos[i * 3] += vx[i] * dt; pos[i * 3 + 2] += vz[i] * dt;
                pos[i * 3 + 1] = Math.max(0.05, pos[i * 3 + 1] + vy[i] * dt); vy[i] -= 9 * dt;
                const d = Math.pow(.02, dt); vx[i] *= d; vz[i] *= d;
                const t = Math.max(0, life[i] / max[i]);
                col[i * 4] = rgb[i * 3]; col[i * 4 + 1] = rgb[i * 3 + 1]; col[i * 4 + 2] = rgb[i * 3 + 2]; col[i * 4 + 3] = t;
            }
            geo.attributes.position.needsUpdate = geo.attributes.color.needsUpdate = true;
        },
        dispose() { scene.remove(obj); geo.dispose(); },
    };
}

export default [
    { key: 't10-sparkler', name: 'Sparkler Fizz', blurb: 'A crackle of tiny white-gold branching streaks spits off the die, thicker the faster it goes.', make: sparkler },
    { key: 't10-firecrackers', name: 'Firecracker String', blurb: 'Small bursts of gold, orange and red sparks pop off the table along the die\'s path.', make: pops },
];
