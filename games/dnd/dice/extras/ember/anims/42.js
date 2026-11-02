// Ember Cage exits 42: nat 20 Aurora (soft additive ribbons of green, teal, violet and gold spiral out around the die like a whirlpool of light seen from above, the die brightens, dissolves into them, and they unwind outward and fade).
let TEX = null;
const ease = (k) => 1 - (1 - k) ** 3;
const at = (k, a, b) => Math.max(0, Math.min(1, (k - a) / (b - a)));
const COLORS = [[0.15, 1, 0.45], [0.1, 0.9, 0.85], [0.6, 0.3, 1], [1, 0.8, 0.3], [0.3, 1, 0.7], [0.75, 0.35, 1], [0.2, 0.8, 1]];
const N = 7, S = 48; // ribbons, segments per ribbon

// one flat ribbon: a triangle strip of S+1 cross-sections on the table, vertex colours carry the glow (dark = invisible when additive)
function ribbon(x, c) {
    const T = x.THREE, geo = new T.BufferGeometry(), idx = [];
    geo.setAttribute('position', new T.BufferAttribute(new Float32Array((S + 1) * 6), 3));
    geo.setAttribute('color', new T.BufferAttribute(new Float32Array((S + 1) * 6), 3));
    for (let i = 0; i < S; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    geo.setIndex(idx);
    const m = new T.Mesh(geo, new T.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending }));
    m.frustumCulled = false; x.scene.add(m); x.own.push(m);
    return { m, geo, c, a0: Math.random() * 6.283, ph: Math.random() * 6.283, turns: 0.45 + Math.random() * 0.3, w: 0.07 + Math.random() * 0.06, dir: 1 };
}

export default { nat20: {
    key: 'a42-aurora', name: 'Aurora', dur: 3.4,
    blurb: 'Shimmering ribbons of green, teal, violet and gold whirl out around the die, which glows, dissolves into them, and fades as they unwind.',
    start(x) {
        x.own = []; x.p0 = x.mesh.position.clone(); x.s0 = x.mesh.scale.clone(); x.mat0 = x.mesh.material; x.vis0 = x.mesh.visible;
        // own copies of the die's materials so it can brighten without touching the shared ones
        x.mats = [].concat(x.mat0).map((m) => m.clone());
        x.mesh.material = Array.isArray(x.mat0) ? x.mats : x.mats[0];
        x.rib = COLORS.slice(0, N).map((c) => ribbon(x, c));
        x.sp = Math.random() < 0.5 ? 1 : -1; // spin direction
        x.glow = new x.THREE.Sprite(new x.THREE.SpriteMaterial({ map: x.tex = tex(x.THREE), color: 0xb0ffd8, transparent: true, depthWrite: false, blending: x.THREE.AdditiveBlending }));
        x.glow.position.copy(x.p0); x.glow.scale.setScalar(0.1); x.scene.add(x.glow); x.own.push(x.glow);
    },
    tick(k, x) {
        const grow = ease(at(k, 0.05, 0.6)), out = ease(at(k, 0.45, 1)), fade = 1 - at(k, 0.72, 0.96), t = k * 3.4;
        // die: brightens to pale light, then shrinks away into the ribbons
        const b = ease(at(k, 0, 0.3)), dis = at(k, 0.3, 0.55);
        for (const m of x.mats) { m.color.setRGB(1 - 0.2 * b, 1, 1 - 0.1 * b); if (m.emissive) m.emissive.setRGB(0.3 * b, 0.9 * b, 0.6 * b); m.transparent = true; m.opacity = 1 - dis; }
        x.mesh.scale.copy(x.s0).multiplyScalar(Math.max(0.001, 1 + 0.12 * b - ease(dis)));
        x.mesh.visible = dis < 1;
        x.glow.position.copy(x.p0); x.glow.scale.setScalar(1.2 + 1.5 * b);
        x.glow.material.opacity = (0.1 + 0.3 * b) * (1 - at(k, 0.5, 0.85));
        for (const r of x.rib) {
            const P = r.geo.attributes.position, C = r.geo.attributes.color, len = 0.12 + 0.88 * grow;
            for (let i = 0; i <= S; i++) {
                const u = (i / S) * len, a = r.a0 + x.sp * (u * r.turns * 6.283 + ease(k) * 2.6 + t * 0.5);
                // radius: opens from the die, widens as the whirl unwinds; a slow wave makes the curtain ripple
                const rad = 0.9 + u * (3.2 + 6 * out) + 0.18 * Math.sin(u * 11 + t * 4 + r.ph) * (0.3 + u);
                const w = r.w * (0.4 + 1.4 * Math.sin(Math.PI * Math.min(1, u * 1.1))) * (1 + out);
                const cx = x.p0.x + Math.cos(a) * rad, cz = x.p0.z + Math.sin(a) * rad, nx = Math.cos(a), nz = Math.sin(a);
                // brightness: bright body, soft ends, shimmer along the length
                const g = Math.sin(Math.PI * Math.min(1, i / S * 1.05)) ** 1.3 * (0.65 + 0.35 * Math.sin(u * 25 - t * 7 + r.ph)) * fade * 0.55 * at(k, 0.02, 0.2 + 0.05 * (r.a0 % 1));
                const y = 0.05;
                P.setXYZ(i * 2, cx - nx * w, y, cz - nz * w); P.setXYZ(i * 2 + 1, cx + nx * w, y, cz + nz * w);
                // edges dim, centre line would be brighter: edges get half so the ribbon reads as a soft curtain
                C.setXYZ(i * 2, r.c[0] * g * 0.35, r.c[1] * g * 0.35, r.c[2] * g * 0.35); C.setXYZ(i * 2 + 1, r.c[0] * g, r.c[1] * g, r.c[2] * g);
            }
            P.needsUpdate = C.needsUpdate = true;
        }
    },
    end(x) {
        x.mesh.material = x.mat0; x.mesh.scale.copy(x.s0); x.mesh.visible = x.vis0; x.mesh.castShadow = true;
        for (const o of x.own) { x.scene.remove(o); if (o.geometry && !o.isSprite) o.geometry.dispose(); o.material.dispose(); }
        for (const m of x.mats) m.dispose();
        x.own = []; x.mats = null;
    },
} };

// soft round glow texture, shared by every die
function tex(T) {
    if (TEX) return TEX;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return (TEX = new T.CanvasTexture(c));
}
