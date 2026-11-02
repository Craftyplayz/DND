// Ember Cage trails 07: lava cracks stamped on impacts, and a continuous molten fissure.
let S = null;
function shared(THREE) {
    if (S) return S;
    const tex = [];
    for (let v = 0; v < 4; v++) {
        const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
        let s = 1234 + v * 777; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
        const branch = (x, y, a, len, w, d) => {
            const pts = [[x, y]];
            for (let i = 0; i < 6; i++) { a += (r() - 0.5) * 1.2; x += Math.cos(a) * len / 6; y += Math.sin(a) * len / 6; pts.push([x, y]); }
            for (const [col, lw, blur] of [['rgba(255,70,0,0.6)', w * 3, 10], ['#ff9a1a', w * 1.5, 4], ['#fff0b0', w * 0.6, 0]]) {
                g.strokeStyle = col; g.lineWidth = lw; g.shadowColor = '#ff5500'; g.shadowBlur = blur; g.lineCap = 'round'; g.lineJoin = 'round';
                g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.stroke();
            }
            if (d < 3) for (let k = 1; k < 6; k += 2) if (r() < 0.8) branch(pts[k][0], pts[k][1], a + (r() < 0.5 ? -1 : 1) * (0.5 + r() * 0.8), len * 0.55, w * 0.7, d + 1);
        };
        const n = 5 + (v % 3);
        for (let i = 0; i < n; i++) branch(128, 128, (i / n) * 6.283 + r(), 85, 2.2, 0);
        const t = new THREE.CanvasTexture(c); tex.push(t);
    }
    const line = [2, 6].map((pw) => { const c = document.createElement("canvas"); c.width = 64; c.height = 2; const g = c.getContext("2d"), d = g.createImageData(64, 2); for (let x = 0; x < 64; x++) for (let y = 0; y < 2; y++) d.data.set([255, 255, 255, 255 * Math.pow(1 - Math.abs(x / 31.5 - 1), pw)], (y * 64 + x) * 4); g.putImageData(d, 0, 0); return new THREE.CanvasTexture(c); });
    S = { line, tex, plane: new THREE.PlaneGeometry(5.5, 5.5).rotateX(-Math.PI / 2) };
    return S;
}

const stamps = {
    key: 't07-impact-cracks', name: 'Impact Lava Cracks', blurb: 'Every hard landing splits the table with a branching crack of lava that cools and seals over.',
    make(ctx) {
        const { THREE, scene, body } = ctx, sh = shared(THREE), N = 12, pool = [];
        for (let i = 0; i < N; i++) {
            const m = new THREE.MeshBasicMaterial({ map: sh.tex[0], transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
            const mesh = new THREE.Mesh(sh.plane, m); mesh.visible = false; mesh.position.y = 0.02 + i * 0.004; scene.add(mesh);
            pool.push({ mesh, m, born: -99 });
        }
        let next = 0, pvy = 0, last = -9, n = 0;
        return {
            tick(sec, dt, b) {
                const vy = b.velocity.y;
                if (ctx.mesh.visible && sec - last > 0.15 && b.position.y < 1.8 && vy - pvy > 2.5) {
                    last = sec; const p = pool[next++ % N]; n++;
                    p.m.map = sh.tex[(n * 7 + (next & 3)) & 3]; p.born = sec;
                    p.mesh.position.x = b.position.x; p.mesh.position.z = b.position.z; p.mesh.rotation.y = Math.random() * 6.283;
                    const sc = 0.45 + Math.min(0.6, (vy - pvy) / 20); p.mesh.scale.set(sc, 1, sc); p.mesh.visible = true;
                }
                pvy = vy;
                for (const p of pool) {
                    if (!p.mesh.visible) continue;
                    const a = (sec - p.born) / 2.8;
                    if (a >= 1) { p.mesh.visible = false; continue; }
                    p.m.opacity = (1 - a) * (1 - a);
                    p.m.color.setRGB(1, 1 - a * 0.6, 1 - a * 0.9); // cools toward dull red
                }
            },
            dispose() { for (const p of pool) { scene.remove(p.mesh); p.m.dispose(); } },
        };
    },
};

const fissure = {
    key: 't07-molten-fissure', name: 'Molten Fissure', blurb: 'A jagged glowing crack zig-zags along the path, cooling from the oldest end.',
    make(ctx) {
        const { THREE, scene } = ctx, sh = shared(THREE), N = 80, pts = new Float32Array(N * 3), cnt = { n: 0 }, parts = [];
        for (const [w, k] of [[0.8, 0.55], [0.28, 1]]) {
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 6), 3));
            geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 8), 4));
            const idx = []; for (let i = 0; i < N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
            geo.setIndex(idx); const uv = new Float32Array(N * 4); for (let i = 0; i < N; i++) uv.set([0, 0, 1, 0], i * 4); geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
            const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: sh.line[k === 1 ? 1 : 0], vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
            mesh.frustumCulled = false; mesh.position.y = k === 1 ? 0.04 : 0.03; scene.add(mesh); parts.push({ geo, mesh, w, k });
        }
        let lx = 1e9, lz = 1e9, flip = 1;
        const born = new Float32Array(N), px = new Float32Array(N), pz = new Float32Array(N);
        return {
            tick(sec, dt, b) {
                const x = b.position.x, z = b.position.z;
                if (ctx.mesh.visible && b.position.y < 1.6 && Math.hypot(x - lx, z - lz) > 0.3) {
                    const dx = lx > 1e8 ? 0 : x - lx, dz = lx > 1e8 ? 0 : z - lz, l = Math.hypot(dx, dz) || 1;
                    flip = -flip; const j = flip * (0.12 + Math.random() * 0.3);
                    if (cnt.n === N) { px.copyWithin(0, 1); pz.copyWithin(0, 1); born.copyWithin(0, 1); cnt.n--; }
                    px[cnt.n] = x - dz / l * j; pz[cnt.n] = z + dx / l * j; born[cnt.n] = sec; cnt.n++; lx = x; lz = z;
                }
                const n = cnt.n;
                for (const p of parts) {
                    const pos = p.geo.attributes.position.array, col = p.geo.attributes.color.array;
                    for (let i = 0; i < n; i++) {
                        const a = Math.min(1, (sec - born[i]) / 3.2), br = (1 - a) * (1 - a) * p.k;
                        const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1);
                        let tx = px[i1] - px[i0], tz = pz[i1] - pz[i0]; const tl = Math.hypot(tx, tz) || 1;
                        const nx = -tz / tl * p.w, nz = tx / tl * p.w;
                        pos.set([px[i] + nx, 0, pz[i] + nz, px[i] - nx, 0, pz[i] - nz], i * 6);
                        const hot = p.k === 1 ? 0.75 : 0.3;
                        const r = 1, g = hot * 0.9 * (1 - a * 0.5) + 0.1, bl = hot * 0.5 * (1 - a); // alpha carries brightness so the transparent canvas stays clear
                        col.set([r, g, bl, br, r, g, bl, br], i * 8);
                    }
                    p.geo.attributes.position.needsUpdate = p.geo.attributes.color.needsUpdate = true;
                    p.geo.setDrawRange(0, Math.max(0, n - 1) * 6);
                }
            },
            dispose() { for (const p of parts) { scene.remove(p.mesh); p.geo.dispose(); p.mesh.material.dispose(); } },
        };
    },
};
export default [stamps, fissure];
