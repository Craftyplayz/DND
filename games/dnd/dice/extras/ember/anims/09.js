// Ember Cage nat 1 / nat 20 exits: Magic Circles (a cursed infernal sigil swallows the die; a golden summoning circle raises it into a pillar of light)
let TX = null;
const TAU = Math.PI * 2;
function rng(seed) { return () => (seed = (seed * 16807) % 2147483647) / 2147483647; }
function canvas(S, draw) { const c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d'); g.translate(S / 2, S / 2); g.lineCap = g.lineJoin = 'round'; draw(g, S / 2); return c; }
const ring = (g, r, w, col) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.stroke(); };
// a band of jagged rune glyphs between radii r0 and r1
function runes(g, n, r0, r1, col, w, seed) {
    const R = rng(seed); g.strokeStyle = col; g.lineWidth = w;
    for (let i = 0; i < n; i++) {
        g.save(); g.rotate((i / n) * TAU); g.beginPath();
        let px = 0, py = r0 + R() * (r1 - r0) * 0.3; g.moveTo(px, py);
        for (let j = 0, m = 3 + (R() * 3 | 0); j < m; j++) { px = (R() - 0.5) * (r1 - r0) * 0.7; py = r0 + R() * (r1 - r0); g.lineTo(px, py); }
        g.stroke(); g.restore();
    }
}
const star = (g, r, n, step, col, w) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); for (let i = 0; i <= n; i++) { const a = ((i * step) / n) * TAU - Math.PI / 2; i ? g.lineTo(Math.cos(a) * r, Math.sin(a) * r) : g.moveTo(Math.cos(a) * r, Math.sin(a) * r); } g.stroke(); };
function spikes(g, n, r0, r1, half, col, inward) { g.fillStyle = col; for (let i = 0; i < n; i++) { g.save(); g.rotate((i / n) * TAU); g.beginPath(); g.moveTo(-half, r0); g.lineTo(0, inward ? r0 - (r1 - r0) : r1); g.lineTo(half, r0); g.closePath(); g.fill(); g.restore(); } }
const glow = (g, col, b) => { g.shadowColor = col; g.shadowBlur = b; };

function tex(THREE) {
    if (TX) return TX;
    const T = (c) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
    const soft = canvas(64, (g, h) => { const gr = g.createRadialGradient(0, 0, 0, 0, 0, h); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(-h, -h, 2 * h, 2 * h); });
    // cursed sigil: thorned outer rim, rune band, 12-point star, inward thorns, slit eye
    const curse = canvas(512, (g, h) => {
        glow(g, '#ff1a00', 10);
        ring(g, 244, 4, '#ff3a14'); ring(g, 226, 2, '#c01808'); ring(g, 180, 3, '#ff3a14'); ring(g, 172, 1.5, '#a01006');
        spikes(g, 36, 244, 255, 5, '#ff3a14', false);
        runes(g, 44, 188, 220, '#ff5a22', 2.2, 7);
        star(g, 168, 12, 5, '#e02a10', 2); star(g, 120, 8, 3, '#ff4a1a', 2);
        ring(g, 120, 3, '#ff3a14'); ring(g, 84, 2, '#a01006');
        spikes(g, 12, 120, 70, 9, '#c01808', true);
        runes(g, 16, 88, 112, '#ff6a2a', 2, 21);
        g.fillStyle = '#ff2a08'; g.beginPath(); g.moveTo(-46, 0); g.quadraticCurveTo(0, -34, 46, 0); g.quadraticCurveTo(0, 34, -46, 0); g.fill();
        g.fillStyle = '#000'; g.shadowBlur = 0; g.beginPath(); g.ellipse(0, 0, 6, 22, 0, 0, TAU); g.fill();
    });
    const curseBase = canvas(512, (g, h) => { const gr = g.createRadialGradient(0, 0, 0, 0, 0, h); gr.addColorStop(0, 'rgba(10,0,0,.92)'); gr.addColorStop(0.85, 'rgba(20,0,0,.85)'); gr.addColorStop(1, 'rgba(20,0,0,0)'); g.fillStyle = gr; g.fillRect(-h, -h, 2 * h, 2 * h); });
    // golden rings
    const gold = '#ffd24a', pale = '#fff1b0';
    const gA = canvas(512, (g) => { glow(g, '#ffb020', 12); ring(g, 246, 3, gold); ring(g, 214, 3, gold); ring(g, 208, 1.5, pale); runes(g, 56, 218, 242, pale, 2, 3); for (let i = 0; i < 24; i++) { g.save(); g.rotate((i / 24) * TAU); g.fillStyle = gold; g.beginPath(); g.arc(0, -230, 3.5, 0, TAU); g.fill(); g.restore(); } });
    const gB = canvas(512, (g) => { glow(g, '#ffb020', 12); ring(g, 240, 3, gold); ring(g, 150, 2.5, gold); star(g, 232, 8, 3, gold, 2.5); star(g, 232, 8, 1, pale, 1.5); star(g, 160, 6, 2, pale, 2); runes(g, 32, 158, 190, gold, 2, 11); });
    const gC = canvas(512, (g) => { glow(g, '#ffb020', 14); ring(g, 236, 4, pale); ring(g, 200, 2, gold); spikes(g, 48, 236, 200, 5, gold, true); spikes(g, 12, 236, 256, 9, pale, false); runes(g, 24, 140, 190, pale, 2.2, 31); ring(g, 130, 2.5, gold); });
    // radial rays (starburst) for the pillar seen from above
    const rays = canvas(512, (g, h) => { const R = rng(5); g.globalCompositeOperation = 'lighter'; for (let i = 0; i < 28; i++) { const a = R() * TAU, w = 0.03 + R() * 0.07, l = h * (0.55 + R() * 0.45); const gr = g.createRadialGradient(0, 0, 0, 0, 0, l); gr.addColorStop(0, 'rgba(255,240,170,.9)'); gr.addColorStop(1, 'rgba(255,200,60,0)'); g.fillStyle = gr; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, l, a - w, a + w); g.closePath(); g.fill(); } });
    return (TX = { soft: T(soft), curse: T(curse), curseBase: T(curseBase), gA: T(gA), gB: T(gB), gC: T(gC), rays: T(rays), plane: new THREE.PlaneGeometry(1, 1) });
}

const ease = (k) => 1 - (1 - k) ** 3;
const inout = (k) => (k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2);
const at = (k, a, b) => Math.max(0, Math.min(1, (k - a) / (b - a)));
const S = (x) => x.own;
function sprite(x, color, add = true) {
    const m = new x.THREE.Sprite(new x.THREE.SpriteMaterial({ map: tex(x.THREE).soft, color, transparent: true, depthWrite: false, blending: add ? x.THREE.AdditiveBlending : x.THREE.NormalBlending }));
    m.position.copy(x.home); m.position.y += 2; m.scale.setScalar(0.01); x.scene.add(m); S(x).push(m); return m;
}
function disc(x, map, color, add, y) {
    const m = new x.THREE.Mesh(tex(x.THREE).plane, new x.THREE.MeshBasicMaterial({ map, color, transparent: true, depthWrite: false, blending: add ? x.THREE.AdditiveBlending : x.THREE.NormalBlending, opacity: 0 }));
    m.rotation.x = -Math.PI / 2; m.position.set(x.home.x, y, x.home.z); m.scale.setScalar(0.01); x.scene.add(m); S(x).push(m); return m;
}
// n points with per-vertex colour (fade by scaling the colour, additive); fill(i, out) is called by the caller each frame
function points(x, n, size) {
    const T = x.THREE, geo = new T.BufferGeometry(), pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.setAttribute('color', new T.BufferAttribute(col, 3));
    const p = new T.Points(geo, new T.PointsMaterial({ map: tex(T).soft, size, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
    p.frustumCulled = false; p.pos = pos; p.col = col; p.n = n; x.scene.add(p); S(x).push(p); return p;
}
const put = (p, i, X, Y, Z, r, g, b) => { const j = i * 3; p.pos[j] = X; p.pos[j + 1] = Y; p.pos[j + 2] = Z; p.col[j] = r; p.col[j + 1] = g; p.col[j + 2] = b; };
const flush = (p) => { p.geometry.attributes.position.needsUpdate = true; p.geometry.attributes.color.needsUpdate = true; };
function init(x) { x.own = []; x.home = x.mesh.position.clone(); x.UP = new x.THREE.Vector3(0, 1, 0); x.ph = Array.from({ length: 400 }, () => Math.random()); x.spin = 0; }
function cleanup(x) { for (const o of x.own || []) { x.scene.remove(o); o.material.dispose(); if (o.isPoints) o.geometry.dispose(); } x.own = []; x.mesh.scale.setScalar(1); }

export default {
    nat1: {
        key: 'n09-cursed-sigil', name: 'Cursed Sigil', blurb: 'A dark infernal circle burns into the table, drags the die down into it and snaps shut in a burst of black embers.', dur: 2.2, impact: 0.8,
        start(x) {
            init(x); const t = tex(x.THREE);
            x.base = disc(x, t.curseBase, 0xffffff, false, 0.04);
            x.sig = disc(x, t.curse, 0xff4020, true, 0.06);
            x.sig2 = disc(x, t.curse, 0x901000, true, 0.07); // counter-rotating ghost copy for depth
            x.under = sprite(x, 0xff2000); x.dark = sprite(x, 0x0a0000, false); x.dark.position.y = x.home.y + 3;
            x.flash = sprite(x, 0xff5a20); x.flame = points(x, 140, 15); x.emb = points(x, 90, 8);
            x.emv = Array.from({ length: 90 }, (_, i) => { const a = x.ph[i] * TAU; return [Math.cos(a), Math.sin(a), 0.5 + x.ph[i + 90] * 1.2]; });
        },
        tick(k, x) {
            const snap = 0.364, t = k * 2.2, burn = ease(at(k, 0, 0.28)), pull = at(k, 0.08, snap), post = at(k, snap, 1);
            const R = 7.4 * (k < snap ? 0.55 + 0.45 * burn : 1 - ease(at(k, snap, snap + 0.2)));
            const fade = k < snap ? 1 : Math.max(0, 1 - at(k, snap + 0.12, 0.85));
            x.base.scale.setScalar(Math.max(0.01, R * 1.08)); x.base.material.opacity = Math.min(1, burn * 1.2) * fade;
            x.sig.scale.setScalar(Math.max(0.01, R)); x.sig.rotation.z = -t * (0.9 + pull * 2.5); x.sig.material.opacity = (0.55 + 0.25 * Math.sin(t * 9) ** 2 + burn * 0.3) * fade * Math.min(1, burn * 2);
            x.sig2.scale.setScalar(Math.max(0.01, R * 0.97)); x.sig2.rotation.z = t * 0.7; x.sig2.material.opacity = 0.5 * fade * burn;
            x.under.scale.setScalar(1 + burn * 3.2 + Math.sin(t * 14) * 0.2); x.under.material.opacity = Math.min(0.8, pull * 1.2) * (k < snap ? 1 : Math.max(0, 1 - post * 6));
            // die dragged down: spins faster, shrinks, darkens
            if (k < snap) {
                const e = inout(pull);
                x.mesh.rotateOnWorldAxis(x.UP, (x.spin += x.dt * (3 + pull * 30)));
                x.mesh.scale.setScalar(Math.max(0.02, 1 - e * 0.97));
                x.mesh.position.set(x.home.x + (Math.random() - 0.5) * 0.12 * pull, x.home.y - e * 0.7, x.home.z + (Math.random() - 0.5) * 0.12 * pull);
                x.dark.scale.setScalar(3 * Math.max(0.1, 1 - e * 0.6)); x.dark.material.opacity = Math.min(0.92, e * 1.3);
            } else { x.mesh.visible = false; x.dark.material.opacity = Math.max(0, 0.9 - post * 5); }
            // dark flames licking up from the rim, pulled inward as the circle tightens
            const f = x.flame, fr = k < snap ? 1 : Math.max(0, 1 - post * 5);
            for (let i = 0; i < f.n; i++) {
                const life = (t * (0.9 + x.ph[i] * 0.8) + x.ph[i + 200]) % 1, a = x.ph[i] * TAU + t * 0.5 + life * 0.8;
                const rr = R * 0.5 * (1 - life * 0.45) + Math.sin(t * 7 + i) * 0.12, b = Math.sin(life * Math.PI) * burn * fr;
                put(f, i, x.home.x + Math.cos(a) * rr, 2 + life * 2, x.home.z + Math.sin(a) * rr, b, b * (0.12 + 0.2 * (1 - life)), b * 0.04);
            }
            flush(f);
            // snap: flash, black embers
            const e = x.emb;
            if (k >= snap) {
                const q = post, d = ease(q) * 9, fl = Math.max(0, 1 - q * 7);
                x.flash.scale.setScalar(2 + ease(q) * 6); x.flash.material.opacity = fl;
                for (let i = 0; i < e.n; i++) { const v = x.emv[i], c = Math.max(0, 1 - q * 1.15); put(e, i, x.home.x + v[0] * d * v[2] * 0.55, 2 + q * 3, x.home.z + v[1] * d * v[2] * 0.55, c, c * (0.18 + 0.15 * (i % 3)), c * 0.05); }
            } else for (let i = 0; i < e.n; i++) put(e, i, x.home.x, 2, x.home.z, 0, 0, 0);
            flush(e);
        },
        end: cleanup,
    },
    nat20: {
        key: 'n09-summoning-circle', name: 'Golden Summoning', blurb: 'Layered gold rune circles unfurl and counter-rotate under the die as a pillar of light bursts up through it and carries it away in spiralling motes.', dur: 2.4, impact: 1.0,
        start(x) {
            init(x); const t = tex(x.THREE);
            x.ca = disc(x, t.gA, 0xffd060, true, 0.05); x.cb = disc(x, t.gB, 0xffe090, true, 0.06); x.cc = disc(x, t.gC, 0xfff0b8, true, 0.07);
            x.glow = sprite(x, 0xffb020); x.rays = disc(x, t.rays, 0xffffff, true, 8.5); x.rays2 = disc(x, t.rays, 0xffd870, true, 8.6);
            x.core = sprite(x, 0xffffff); x.pil = sprite(x, 0xfff0b0); x.core.position.y = 9; x.pil.position.y = 8.8; x.wave = disc(x, t.gA, 0xfff0b0, true, 0.08);
            x.motes = points(x, 160, 10);
        },
        tick(k, x) {
            const imp = 0.417, t = k * 2.4, build = ease(at(k, 0, imp)), post = at(k, imp, 1), out = ease(post);
            const fade = 1 - at(k, 0.62, 1);
            const ra = ease(at(k, 0.0, 0.3)), rb = ease(at(k, 0.08, 0.36)), rc = ease(at(k, 0.16, 0.42));
            const grow = 1 + out * 0.5;
            x.ca.scale.setScalar(Math.max(0.01, 8.8 * ra * grow)); x.ca.rotation.z = t * 0.5; x.ca.material.opacity = Math.min(1, ra * 2) * fade;
            x.cb.scale.setScalar(Math.max(0.01, 6.6 * rb * grow)); x.cb.rotation.z = -t * 0.9; x.cb.material.opacity = Math.min(1, rb * 2) * fade;
            x.cc.scale.setScalar(Math.max(0.01, 4.4 * rc * grow)); x.cc.rotation.z = t * 1.4; x.cc.material.opacity = Math.min(1, rc * 2) * fade * (0.8 + 0.2 * Math.sin(t * 12));
            x.glow.scale.setScalar(1 + build * 5 + out * 3); x.glow.material.opacity = (0.15 + build * 0.6) * fade;
            // die rises: swells, spins, then bursts up through the light and dissolves
            if (k < imp + 0.14) {
                x.mesh.rotateOnWorldAxis(x.UP, (x.spin += x.dt * (1.5 + build * 8)));
                x.mesh.scale.setScalar(1 + build * 0.5 + at(k, imp, imp + 0.14) * 1.6); x.mesh.position.y = x.home.y + build * 1.5;
            } else x.mesh.visible = false;
            // the pillar seen from above: intense core glow with rays, born at the impact
            const hit = k >= imp, pk = Math.max(0, 1 - post * 1.6);
            x.core.scale.setScalar(hit ? 2 + Math.sin(post * 30) * 0.1 + out * 7 : 0.5 + build * 1.2); x.core.material.opacity = hit ? pk : build * 0.5;
            x.pil.scale.setScalar(hit ? 3 + out * 10 : 0.01); x.pil.material.opacity = hit ? Math.max(0, 0.9 - post * 1.4) : 0;
            const rs = hit ? 3 + out * 9 : 0.01;
            x.rays.scale.setScalar(rs); x.rays.rotation.z = t * 0.6; x.rays.material.opacity = hit ? pk * 0.95 : 0;
            x.rays2.scale.setScalar(rs * 0.8); x.rays2.rotation.z = -t * 0.9; x.rays2.material.opacity = hit ? pk * 0.8 : 0;
            x.wave.scale.setScalar(hit ? 1 + out * 16 : 0.01); x.wave.rotation.z = t; x.wave.material.opacity = hit ? Math.max(0, 0.9 - post * 1.2) : 0;
            // gold motes spiral inward, then burst out in a spiral
            const m = x.motes;
            for (let i = 0; i < m.n; i++) {
                const p = x.ph[i], a = p * TAU + t * (1.5 + p * 2) * (i % 2 ? 1 : -1);
                let r, c;
                if (!hit) { const l = (build * 1.4 + p) % 1; r = (5.5 - 4.5 * l) * (0.6 + p * 0.5) * ra; c = Math.sin(l * Math.PI) * build; }
                else { r = 0.4 + out * (3 + p * 7); c = Math.max(0, 1 - post * 1.05); }
                put(m, i, x.home.x + Math.cos(a) * r, 2 + post * 4, x.home.z + Math.sin(a) * r, c, c * (0.78 - p * 0.15), c * (0.25 + 0.2 * p));
            }
            flush(m);
        },
        end: cleanup,
    },
};
