// 3D dice for the homebrew sheet: three.js draws them, cannon-es throws them, and the face that lands up is the result.
// Loaded by sheet.js on the first roll. throwDice([[sides, count], ...], { body, ink }) -> Promise<[[sides, [values]], ...]>
const [THREE, CANNON] = await Promise.all([
    import('https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js'),
    import('https://cdn.jsdelivr.net/npm/cannon-es@0.20.0/dist/cannon-es.js'),
]);

// ---- shapes: triangles grouped into faces by their normal, each face numbered ----
const V = (x, y, z) => new THREE.Vector3(x, y, z);
function trisOf(geo) {
    const g = geo.index ? geo.toNonIndexed() : geo, p = g.attributes.position, out = [];
    for (let i = 0; i < p.count; i += 3) out.push([V(p.getX(i), p.getY(i), p.getZ(i)), V(p.getX(i + 1), p.getY(i + 1), p.getZ(i + 1)), V(p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2))]);
    return out;
}
// pentagonal trapezohedron (d10): ring height solved so each kite is flat
function d10Tris() {
    const h = 1.15, ang = (i) => (i * Math.PI) / 5;
    const kite = (k) => { const T = V(0, h, 0), U0 = V(1, k, 0), U1 = V(Math.cos(ang(2)), k, Math.sin(ang(2))), L0 = V(Math.cos(ang(1)), -k, Math.sin(ang(1)));
        return U0.clone().sub(T).cross(U1.clone().sub(T)).dot(L0.clone().sub(T)); };
    let lo = 0.001, hi = h; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; (kite(lo) > 0) === (kite(m) > 0) ? (lo = m) : (hi = m); }
    const k = (lo + hi) / 2, T = V(0, h, 0), B = V(0, -h, 0), ring = Array.from({ length: 10 }, (_, i) => V(Math.cos(ang(i)), i % 2 ? -k : k, Math.sin(ang(i))));
    const out = [];
    for (let j = 0; j < 10; j += 2) { const U0 = ring[j], L = ring[j + 1], U1 = ring[(j + 2) % 10]; out.push([T, U0, L], [T, L, U1]); }
    for (let j = 1; j < 10; j += 2) { const L0 = ring[j], U = ring[(j + 1) % 10], L1 = ring[(j + 2) % 10]; out.push([B, L0, U], [B, U, L1]); }
    return out;
}
const SHAPES = {
    4: () => trisOf(new THREE.TetrahedronGeometry(1.2)), 6: () => trisOf(new THREE.BoxGeometry(1.45, 1.45, 1.45)), 8: () => trisOf(new THREE.OctahedronGeometry(1.15)),
    10: d10Tris, 12: () => trisOf(new THREE.DodecahedronGeometry(1.1)), 20: () => trisOf(new THREE.IcosahedronGeometry(1.15)),
};
function faces(tris) {
    const list = [];
    for (const t of tris) {
        let n = t[1].clone().sub(t[0]).cross(t[2].clone().sub(t[0])).normalize();
        const c = t[0].clone().add(t[1]).add(t[2]).divideScalar(3);
        if (n.dot(c) < 0) { n.negate(); t.reverse(); }
        const f = list.find((x) => x.n.dot(n) > 0.999);
        f ? f.tris.push(t) : list.push({ n, tris: [t] });
    }
    for (const f of list) {
        const pts = []; for (const t of f.tris) for (const p of t) if (!pts.some((q) => q.distanceTo(p) < 1e-4)) pts.push(p);
        f.c = pts.reduce((a, p) => a.add(p), V(0, 0, 0)).divideScalar(pts.length);
        f.u = pts[0].clone().sub(f.c).normalize(); f.v = f.n.clone().cross(f.u);
        // corners in order around the face, for the physics shape
        f.pts = pts.sort((a, b) => Math.atan2(a.clone().sub(f.c).dot(f.v), a.clone().sub(f.c).dot(f.u)) - Math.atan2(b.clone().sub(f.c).dot(f.v), b.clone().sub(f.c).dot(f.u)));
        f.r = Math.max(...pts.map((p) => p.distanceTo(f.c)));
    }
    return list;
}
// numbers laid out like a real set, returned as the faces sorted by number (index i is the face showing i + 1; a d10's index is its digit):
// opposite faces add to N + 1 (a d10's digits to 9), d6 1-2-3 run counter-clockwise, d8/d10 odds round the top tip, d12/d20 highs and lows spread out
function realLayout(fs, sides) {
    if (sides === 4) return fs;
    const opp = fs.map((f) => fs.findIndex((g) => g.n.dot(f.n) < -0.999));
    const top = fs.map((f, i) => i).filter((i) => sides === 6 || sides === 12 || sides === 20 ? i < opp[i] : fs[i].n.y > 0);
    const num = new Array(fs.length), d10 = sides === 10, hi = d10 ? 9 : sides + 1;
    if (sides === 6) {
        top.forEach((i, k) => { num[i] = k + 1; num[opp[i]] = 6 - k; });
        if (fs[top[0]].n.clone().cross(fs[top[1]].n).dot(fs[top[2]].n) < 0) [num[top[2]], num[opp[top[2]]]] = [4, 3];
    } else if (sides === 8 || d10) {
        top.sort((a, b) => Math.atan2(fs[a].n.z, fs[a].n.x) - Math.atan2(fs[b].n.z, fs[b].n.x))
            .forEach((i, k) => { num[i] = 2 * k + 1; num[opp[i]] = hi - num[i]; });
    } else {
        // d12/d20: search pair placements for the most even sums round each corner
        const key = (p) => `${Math.round(p.x * 1e3)},${Math.round(p.y * 1e3)},${Math.round(p.z * 1e3)}`, corners = {};
        fs.forEach((f, i) => f.pts.forEach((p) => (corners[key(p)] ||= []).push(i)));
        const cs = Object.values(corners), cost = () => cs.reduce((s, c) => { const t = c.reduce((a, i) => a + num[i], 0); return s + t * t; }, 0);
        let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
        const place = (o) => top.forEach((i, k) => { num[i] = o[k] > 0 ? o[k] : hi + o[k]; num[opp[i]] = hi - num[i]; });
        let best = null, bestC = Infinity;
        for (let r = 0; r < 20; r++) {
            const o = top.map((_, k) => (rnd() < 0.5 ? k + 1 : -(k + 1))); place(o); let c = cost();
            for (let it = 0; it < 3000; it++) {
                const a = (rnd() * o.length) | 0, b = (rnd() * o.length) | 0, was = o.slice();
                if (a === b) o[a] = -o[a]; else [o[a], o[b]] = [o[b], o[a]];
                place(o); const n = cost(); if (n <= c) c = n; else o.splice(0, o.length, ...was);
            }
            if (c < bestC) { bestC = c; best = o.slice(); }
        }
        place(best);
    }
    return fs.map((f, i) => [num[i], f]).sort((a, b) => a[0] - b[0]).map(([, f]) => f);
}
// ---- styles: a surface painted behind the numbers, number colour, and how shiny or metal it is ----
const grad = (a, b) => (g, S) => { const r = g.createRadialGradient(S * 0.35, S * 0.3, S * 0.05, S / 2, S / 2, S * 0.75); r.addColorStop(0, a); r.addColorStop(1, b); g.fillStyle = r; g.fillRect(0, 0, S, S); };
// a small seeded random, so a face looks the same every time it's drawn
const rnd = (seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const wood = (g, S, seed) => {
    const r = rnd(seed + 7); g.fillStyle = '#8a5a2b'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 26; i++) { g.strokeStyle = `rgba(${60 + r() * 40},${30 + r() * 20},10,${0.25 + r() * 0.35})`; g.lineWidth = 2 + r() * 6; g.beginPath(); const y = r() * S;
        g.moveTo(0, y); for (let x = 0; x <= S; x += 32) g.lineTo(x, y + Math.sin(x / 40 + i) * 8 + (r() - 0.5) * 6); g.stroke(); }
};
const marble = (g, S, seed) => {
    const r = rnd(seed + 3); g.fillStyle = '#eceae6'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 7; i++) { g.strokeStyle = `rgba(90,95,110,${0.2 + r() * 0.35})`; g.lineWidth = 1 + r() * 3; g.beginPath(); let x = r() * S, y = 0; g.moveTo(x, y);
        while (y < S) { x += (r() - 0.5) * 40; y += 12 + r() * 20; g.lineTo(x, y); } g.stroke(); }
};
export const STYLES = {
    purple: { name: 'Purple', paint: null, ink: '#ffffff', metal: 0.05, rough: 0.45 },
    gold: { name: 'Gold', paint: grad('#ffe39a', '#b07d22'), ink: '#3b2905', metal: 0.9, rough: 0.32 },
    silver: { name: 'Silver', paint: grad('#f2f4f7', '#8f99a5'), ink: '#1c222b', metal: 0.9, rough: 0.28 },
    obsidian: { name: 'Obsidian', paint: grad('#2c2b33', '#0c0c10'), ink: '#e8c35c', metal: 0.3, rough: 0.12 },
    ruby: { name: 'Ruby', paint: grad('#d23048', '#5c0a18'), ink: '#ffe7a6', metal: 0.15, rough: 0.18 },
    wood: { name: 'Wood', paint: wood, ink: '#2a1606', metal: 0, rough: 0.75 },
    marble: { name: 'Marble', paint: marble, ink: '#1f2a44', metal: 0, rough: 0.25 },
    ivory: { name: 'Ivory', paint: grad('#fbf5e6', '#d8ccb0'), ink: '#2a2a2a', metal: 0, rough: 0.5 },
};
// a face's picture: its number (or, on a d4, the three corner numbers)
// corners: the face's corners in canvas pixels, so a style can draw along its edges; st.bump paints a height map the same way
function faceTexture(labels, st, d4, seed, corners) {
    const S = 256, canvas = () => { const c = document.createElement('canvas'); c.width = c.height = S; return c; }, cv = canvas();
    const g = cv.getContext('2d');
    if (st.paint) st.paint(g, S, seed, corners, d4); else { g.fillStyle = st.body; g.fillRect(0, 0, S, S); }
    let bump = null;
    if (st.bump) { const bc = canvas(), bg = bc.getContext('2d'); bg.fillStyle = '#000'; bg.fillRect(0, 0, S, S); st.bump(bg, S, seed, corners, d4); bump = new THREE.CanvasTexture(bc); }
    g.fillStyle = st.ink; g.textAlign = 'center'; g.textBaseline = 'middle';
    const draw = (txt, x, y, size, rot) => {
        g.save(); g.translate(x, y); g.rotate(rot); g.font = `700 ${size}px ${st.font || 'system-ui, sans-serif'}`;
        // a thin dark edge keeps light numbers readable on shiny faces
        g.lineWidth = size * 0.05; g.strokeStyle = 'rgba(0,0,0,.35)'; g.strokeText(txt, 0, 0); g.fillText(txt, 0, 0);
        if (txt === '6' || txt === '9') g.fillRect(-size * 0.22, size * 0.42, size * 0.44, size * 0.07);
        g.restore();
    };
    if (d4) labels.forEach(([txt, x, y]) => draw(txt, S / 2 + (x - 0.5) * S * 0.62, S / 2 + (y - 0.5) * S * 0.62, 60, Math.atan2(y - 0.5, x - 0.5) + Math.PI / 2));
    else draw(labels, S / 2, S / 2, labels.length > 1 ? 92 : 120, 0);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return { t, bump };
}
// builds one die type: mesh with a material per face, the physics shape, and how to read it
const built = {};
function buildDie(kind, st) {
    const key = kind + st.key;
    if (built[key]) return built[key];
    const sides = kind === 't' || kind === 'u' ? 10 : kind;
    const d4 = sides === 4;
    let fs = realLayout(faces(SHAPES[sides]()), sides);
    if (kind === 10) fs = [...fs.slice(1), fs[0]]; // a 1-10 die reads its 0 as 10
    const pos = [], uv = [], mats = [];
    // d4: each corner has a value; a face shows the three values of its corners
    const verts = []; if (d4) for (const f of fs) for (const p of f.pts) if (!verts.some((q) => q.distanceTo(p) < 1e-4)) verts.push(p);
    const geo = new THREE.BufferGeometry();
    fs.forEach((f, i) => {
        const start = pos.length / 3;
        const toUV = (p) => { const d = p.clone().sub(f.c); return [0.5 + d.dot(f.u) / (2 * f.r) * 0.98, 0.5 + d.dot(f.v) / (2 * f.r) * 0.98]; };
        for (const t of f.tris) for (const p of t) { pos.push(p.x, p.y, p.z); uv.push(...toUV(p)); }
        geo.addGroup(start, f.tris.length * 3, i);
        let label;
        if (d4) label = f.pts.map((p) => { const [x, y] = toUV(p); return [String(verts.findIndex((q) => q.distanceTo(p) < 1e-4) + 1), x, 1 - y]; });
        else label = kind === 't' ? (i === 0 ? '00' : i * 10 + '') : kind === 'u' ? String(i) : String(i + 1);
        f.value = d4 ? null : kind === 't' ? i * 10 : kind === 'u' ? i : i + 1;
        const { t, bump } = faceTexture(label, st, d4, i * 31 + sides, f.pts.map((p) => { const [x, y] = toUV(p); return [x * 256, (1 - y) * 256]; }));
        // glow: the face lights itself (dark parts stay dark); mat: extra material settings, physical for glass, clearcoat and the like
        mats.push(new (st.physical ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial)({ map: t, roughness: st.rough, metalness: st.metal, flatShading: true,
            ...(bump && { bumpMap: bump, bumpScale: st.bumpScale ?? 3 }), ...(st.glow && { emissive: 0xffffff, emissiveMap: t, emissiveIntensity: st.glow }), ...st.mat }));
    });
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.computeVertexNormals();
    const uniq = []; for (const f of fs) for (const p of f.pts) if (!uniq.some((q) => q.distanceTo(p) < 1e-4)) uniq.push(p);
    const shape = new CANNON.ConvexPolyhedron({
        vertices: uniq.map((p) => new CANNON.Vec3(p.x, p.y, p.z)),
        faces: fs.map((f) => f.pts.map((p) => uniq.findIndex((q) => q.distanceTo(p) < 1e-4))),
    });
    return (built[key] = { geo, mats, shape, fs, verts, d4, all: uniq });
}

// ---- the coin: an original, stylised take on Australia's twelve-sided 50 cent piece (not the Mint's artwork), the same in every style ----
// Heads: a profile with AUSTRALIA and the year; tails: a coat-of-arms design (shield, kangaroo, emu, star, wattle, 50). Raised relief
// is drawn once as a white mask, then turned into the silver colour map (lit edges, soft shadows) and a bump map.
const COIN_R = 1.35, COIN_H = 0.2, COIN_A = (i) => (i * Math.PI) / 6 + Math.PI / 12;
function coinArt(heads, S) {
    const cv = document.createElement('canvas'); cv.width = cv.height = S;
    const g = cv.getContext('2d'), c = S / 2, u = S / 100;
    g.fillStyle = g.strokeStyle = '#fff'; g.lineCap = g.lineJoin = 'round';
    // the raised rim follows the twelve sides, with a ring of beads inside it
    const poly = (r) => { g.beginPath(); for (let i = 0; i < 12; i++) { const a = COIN_A(i); g[i ? 'lineTo' : 'moveTo'](c + Math.cos(a) * r, c + Math.sin(a) * r); } g.closePath(); };
    g.lineWidth = 3.2 * u; poly(48.2 * u); g.stroke();
    for (let i = 0; i < 96; i++) { const a = (i / 96) * Math.PI * 2; g.beginPath(); g.arc(c + Math.cos(a) * 42.6 * u, c + Math.sin(a) * 42.6 * u, 0.62 * u, 0, 7); g.fill(); }
    // lettering round an arc: top runs left to right over the top, bottom runs left to right under the bottom
    const arc = (txt, r, size, top) => {
        g.save(); g.font = `700 ${size * u}px Georgia, 'Times New Roman', serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
        const w = [...txt].map((ch) => g.measureText(ch).width + size * u * 0.12), total = w.reduce((a, b) => a + b, 0);
        let ang = (top ? -Math.PI / 2 : Math.PI / 2) + ((top ? -1 : 1) * total) / 2 / r;
        [...txt].forEach((ch, i) => { const half = w[i] / 2 / r; ang += (top ? 1 : -1) * half;
            g.save(); g.translate(c + Math.cos(ang) * r, c + Math.sin(ang) * r); g.rotate(ang + (top ? Math.PI / 2 : -Math.PI / 2)); g.fillText(ch, 0, 0); g.restore();
            ang += (top ? 1 : -1) * half; });
        g.restore();
    };
    // a path in a 100 x 100 box, placed at x, y, w wide (mirror flips it left to right)
    const shape = (pts, x, y, w, mirror = false) => { g.save(); g.translate(x * u, y * u); g.scale((mirror ? -1 : 1) * w * u / 100, w * u / 100); if (mirror) g.translate(-100, 0);
        g.beginPath(); pts(g); g.restore(); };
    // engraved detail cut back into a raised shape, in the same 100 x 100 box
    const cut = (draw, x, y, w, width, mirror = false) => { g.save(); g.globalCompositeOperation = 'destination-out';
        g.translate(x * u, y * u); g.scale((mirror ? -1 : 1) * w * u / 100, w * u / 100); if (mirror) g.translate(-100, 0);
        g.lineWidth = width * 100 / w; g.beginPath(); draw(g); g.stroke(); g.restore(); };
    if (heads) {
        arc('AUSTRALIA', 35 * u, 7.4, true); arc(String(new Date().getFullYear()), 35 * u, 7.4, false);
        // a generic, crown-free classical profile facing right, cut off at the neck (not a portrait of anyone)
        const H = [21, 15, 60];
        shape((p) => { p.moveTo(34, 100); p.bezierCurveTo(35, 90, 34, 82, 30, 76); p.bezierCurveTo(20, 66, 16, 50, 20, 36); p.bezierCurveTo(24, 18, 40, 8, 56, 8);
            p.bezierCurveTo(68, 8, 74, 16, 75, 26); p.bezierCurveTo(76, 31, 75, 34, 76, 37); p.bezierCurveTo(78, 41, 82, 46, 83, 50); p.bezierCurveTo(83, 52, 80, 53, 78, 53);
            p.bezierCurveTo(79, 55, 80, 57, 78, 58); p.bezierCurveTo(79, 60, 79, 62, 77, 63); p.bezierCurveTo(78, 67, 76, 71, 70, 72); p.bezierCurveTo(64, 74, 62, 80, 63, 86);
            p.bezierCurveTo(64, 92, 66, 96, 68, 100); p.closePath(); }, ...H);
        g.fill();
        // hair swept back from the brow, the ear, the eye and a line at the base of the neck
        cut((p) => { for (let i = 0; i < 7; i++) { p.moveTo(70 - i * 2, 14 + i * 4.5); p.bezierCurveTo(56 - i * 2, 12 + i * 4, 40 - i, 18 + i * 4, 26 + i * 0.5, 34 + i * 5); } }, ...H, 0.55);
        cut((p) => { p.moveTo(46, 42); p.bezierCurveTo(52, 40, 54, 50, 50, 54); p.bezierCurveTo(47, 56, 45, 54, 46, 52); p.moveTo(64, 36); p.quadraticCurveTo(68, 33, 72, 36);
            p.moveTo(30, 84); p.bezierCurveTo(42, 80, 54, 82, 64, 88); }, ...H, 0.6);
    } else {
        // a seven-pointed star over the arms
        g.beginPath(); for (let i = 0; i < 14; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 7, r = (i % 2 ? 2.4 : 5.8) * u; g[i ? 'lineTo' : 'moveTo'](c + Math.cos(a) * r, 18 * u + Math.sin(a) * r); } g.closePath(); g.fill();
        // the shield, raised, with six panels and a small device in each cut in
        const sx = 39 * u, sy = 27 * u, sw = 22 * u, sh = 30 * u;
        g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + sw, sy); g.lineTo(sx + sw, sy + sh * 0.62); g.quadraticCurveTo(sx + sw, sy + sh, sx + sw / 2, sy + sh * 1.08);
        g.quadraticCurveTo(sx, sy + sh, sx, sy + sh * 0.62); g.closePath(); g.fill();
        g.save(); g.globalCompositeOperation = 'destination-out'; g.lineWidth = 0.7 * u;
        g.beginPath(); g.moveTo(sx, sy + sh * 0.45); g.lineTo(sx + sw, sy + sh * 0.45); g.moveTo(sx + sw / 3, sy); g.lineTo(sx + sw / 3, sy + sh * 0.95); g.moveTo(sx + (2 * sw) / 3, sy); g.lineTo(sx + (2 * sw) / 3, sy + sh * 0.95);
        g.moveTo(sx + 1.4 * u, sy + 1.4 * u); g.lineTo(sx + sw - 1.4 * u, sy + 1.4 * u); g.stroke();
        for (let r = 0; r < 2; r++) for (let k = 0; k < 3; k++) { const px = sx + (k + 0.5) * (sw / 3), py = sy + (r ? 0.7 : 0.24) * sh;
            g.beginPath(); [() => g.arc(px, py, 1.8 * u, 0, 7), () => g.rect(px - 1.8 * u, py - 1.4 * u, 3.6 * u, 2.8 * u), () => { g.moveTo(px, py - 2.2 * u); g.lineTo(px + 2 * u, py + 1.6 * u); g.lineTo(px - 2 * u, py + 1.6 * u); g.closePath(); }][(r * 3 + k) % 3](); g.stroke(); }
        g.restore();
        // a kangaroo on the left, rearing up to face the shield
        const K = [8, 22, 34];
        shape((p) => { p.moveTo(10, 98); p.bezierCurveTo(20, 92, 32, 84, 40, 74); p.bezierCurveTo(36, 62, 36, 50, 42, 40); p.bezierCurveTo(44, 34, 46, 30, 48, 26);
            p.lineTo(46, 14); p.lineTo(51, 23); p.lineTo(52, 12); p.lineTo(55, 24); p.bezierCurveTo(60, 24, 66, 26, 70, 29); p.lineTo(69, 32); p.bezierCurveTo(64, 33, 60, 34, 58, 37);
            p.bezierCurveTo(58, 40, 60, 42, 64, 44); p.lineTo(72, 46); p.lineTo(71, 49); p.lineTo(62, 48); p.bezierCurveTo(62, 56, 64, 62, 64, 68); p.bezierCurveTo(66, 78, 72, 88, 84, 94);
            p.lineTo(84, 98); p.lineTo(56, 98); p.bezierCurveTo(52, 92, 50, 86, 48, 80); p.bezierCurveTo(38, 90, 24, 98, 10, 100); p.closePath(); }, ...K);
        g.fill();
        cut((p) => { p.moveTo(46, 74); p.bezierCurveTo(54, 66, 60, 70, 62, 80); p.moveTo(61, 28.5); p.lineTo(62.5, 28.5); }, ...K, 0.55);
        // an emu on the right, facing the shield
        const E = [58, 22, 34];
        shape((p) => { p.moveTo(18, 62); p.bezierCurveTo(22, 42, 46, 36, 60, 42); p.bezierCurveTo(64, 30, 66, 18, 68, 12); p.bezierCurveTo(69, 8, 74, 7, 76, 10);
            p.lineTo(86, 14); p.lineTo(76, 15); p.bezierCurveTo(74, 24, 72, 34, 72, 46); p.bezierCurveTo(76, 56, 70, 68, 56, 70); p.bezierCurveTo(40, 72, 24, 70, 18, 62); p.closePath(); }, ...E, true);
        g.fill();
        shape((p) => { p.moveTo(44, 68); p.lineTo(40, 96); p.lineTo(33, 98); p.moveTo(56, 68); p.lineTo(60, 96); p.lineTo(67, 98); }, ...E, true);
        g.lineWidth = 1.5 * u; g.stroke();
        cut((p) => { for (let i = 0; i < 5; i++) { p.moveTo(26 + i * 7, 52 + (i % 2) * 3); p.quadraticCurveTo(32 + i * 7, 48, 36 + i * 7, 58); } }, ...E, 0.45, true);
        // wattle sprays: curving stems with little puff balls
        for (const side of [-1, 1]) { g.lineWidth = 0.9 * u; g.beginPath(); g.moveTo(c + side * 6 * u, 68 * u); g.quadraticCurveTo(c + side * 22 * u, 72 * u, c + side * 33 * u, 60 * u); g.stroke();
            for (let i = 0; i < 10; i++) { const t = i / 9, x = c + side * (6 + t * 27) * u, y = (68 + Math.sin(t * Math.PI) * 3 - t * 8) * u + ((i % 2) - 0.5) * 3.2 * u;
                g.beginPath(); g.arc(x, y, (1.15 + (i % 3) * 0.3) * u, 0, 7); g.fill(); } }
        // the scroll and the value
        g.beginPath(); g.moveTo(31 * u, 73 * u); g.quadraticCurveTo(c, 79 * u, 69 * u, 73 * u); g.lineTo(69 * u, 77.5 * u); g.quadraticCurveTo(c, 83.5 * u, 31 * u, 77.5 * u); g.closePath(); g.fill();
        g.save(); g.globalCompositeOperation = 'destination-out'; g.font = `700 ${3.3 * u}px Georgia, serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('AUSTRALIA', c, 77.8 * u); g.restore();
        g.save(); g.font = `700 ${11 * u}px Georgia, 'Times New Roman', serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('50', c, 89 * u); g.restore();
    }
    return cv;
}
function coinMaps(heads) {
    const S = 1024, art = coinArt(heads, S), make = () => { const cv = document.createElement('canvas'); cv.width = cv.height = S; return [cv, cv.getContext('2d')]; };
    const tint = (col) => { const [cv, g] = make(); g.drawImage(art, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = col; g.fillRect(0, 0, S, S); return cv; };
    // colour: a frosted, darker cupronickel field with the raised design polished bright, lifted by a soft shadow below-right and a lit top edge
    const [col, g] = make(), field = g.createRadialGradient(S * 0.38, S * 0.32, S * 0.05, S / 2, S / 2, S * 0.62);
    field.addColorStop(0, '#8d939b'); field.addColorStop(1, '#5f656d'); g.fillStyle = field; g.fillRect(0, 0, S, S);
    const r = rnd(heads ? 11 : 23); g.globalAlpha = 0.05; for (let i = 0; i < 900; i++) { g.fillStyle = r() < 0.5 ? '#fff' : '#000'; g.fillRect(r() * S, r() * S, 1 + r() * 2, 1 + r() * 2); } g.globalAlpha = 1;
    g.filter = 'blur(3px)'; g.drawImage(tint('rgba(30,34,40,.55)'), 4, 5); g.filter = 'none';
    g.drawImage(tint('#e4e7eb'), 0, 0); g.globalAlpha = 0.5; g.drawImage(tint('#ffffff'), -1.5, -1.5); g.globalAlpha = 1;
    const [bump, b] = make(); b.fillStyle = '#000'; b.fillRect(0, 0, S, S); b.filter = 'blur(2px)'; b.drawImage(art, 0, 0);
    const map = new THREE.CanvasTexture(col); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
    return { map, bump: new THREE.CanvasTexture(bump) };
}
let coinBuilt = null;
function buildCoin() {
    if (coinBuilt) return coinBuilt;
    const top = [], bot = [];
    for (let i = 0; i < 12; i++) { const a = COIN_A(i); top.push(V(Math.cos(a) * COIN_R, COIN_H / 2, Math.sin(a) * COIN_R)); bot.push(V(Math.cos(a) * COIN_R, -COIN_H / 2, Math.sin(a) * COIN_R)); }
    // geometry: heads cap (group 0), tails cap (group 1), the twelve flat edges (group 2); caps map so each reads the right way round from outside
    const pos = [], uv = [], geo = new THREE.BufferGeometry(), R2 = 2 * COIN_R, push = (p, uu, vv) => { pos.push(p.x, p.y, p.z); uv.push(uu, vv); };
    for (let i = 0; i < 12; i++) { const a = top[i], b = top[(i + 1) % 12];
        push(V(0, COIN_H / 2, 0), 0.5, 0.5); push(b, 0.5 - b.x / R2, 0.5 + b.z / R2); push(a, 0.5 - a.x / R2, 0.5 + a.z / R2); }
    geo.addGroup(0, 36, 0);
    for (let i = 0; i < 12; i++) { const a = bot[i], b = bot[(i + 1) % 12];
        push(V(0, -COIN_H / 2, 0), 0.5, 0.5); push(a, 0.5 - a.x / R2, 0.5 - a.z / R2); push(b, 0.5 - b.x / R2, 0.5 - b.z / R2); }
    geo.addGroup(36, 36, 1);
    for (let i = 0; i < 12; i++) { const j = (i + 1) % 12, u0 = i / 12, u1 = (i + 1) / 12;
        push(top[i], u0, 1); push(top[j], u1, 1); push(bot[j], u1, 0); push(top[i], u0, 1); push(bot[j], u1, 0); push(bot[i], u0, 0); }
    geo.addGroup(72, 72, 2);
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.computeVertexNormals();
    const metal = (m) => new THREE.MeshStandardMaterial({ metalness: 0.9, roughness: 0.4, envMapIntensity: 0.85, ...m });
    const h = coinMaps(true), t = coinMaps(false);
    const edge = document.createElement('canvas'); edge.width = 256; edge.height = 16; const eg = edge.getContext('2d'), eGrad = eg.createLinearGradient(0, 0, 0, 16);
    eGrad.addColorStop(0, '#8d939b'); eGrad.addColorStop(0.5, '#d9dde2'); eGrad.addColorStop(1, '#8d939b'); eg.fillStyle = eGrad; eg.fillRect(0, 0, 256, 16);
    const eMap = new THREE.CanvasTexture(edge); eMap.colorSpace = THREE.SRGBColorSpace;
    const mats = [metal({ map: h.map, bumpMap: h.bump, bumpScale: 6 }), metal({ map: t.map, bumpMap: t.bump, bumpScale: 6 }), metal({ map: eMap, roughness: 0.35, flatShading: true })];
    // physics: the same prism, faces wound outward (caps reversed so their normals point out)
    const all = [...top, ...bot];
    const shape = new CANNON.ConvexPolyhedron({ vertices: all.map((p) => new CANNON.Vec3(p.x, p.y, p.z)),
        faces: [[11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0], [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23], ...Array.from({ length: 12 }, (_, i) => [i, (i + 1) % 12, 12 + ((i + 1) % 12), 12 + i])] });
    // read like a die with two faces: whichever cap points up
    const fs = [{ n: V(0, 1, 0), value: 'heads', pts: top }, { n: V(0, -1, 0), value: 'tails', pts: bot }];
    return (coinBuilt = { geo, mats, shape, fs, verts: [], d4: false, all, coin: true });
}

// ---- model coins: "Fantasy Designed Coins - (Gold, Silver, Copper)" by Kigha, CC BY 4.0 (credited on the Dice Sets page) ----
// /games/dnd/dice/coins/fantasy-coins.glb: six coins sharing one textured material; keys are the coins' names: gold-new, gold-old,
// silver-new, silver-old, copper-new, copper-old. Any other key, or a model that won't load, is the 50 cent coin.
const COIN_GLB = '/games/dnd/dice/coins/fantasy-coins.glb';
export const MODEL_COINS = ['gold-new', 'gold-old', 'silver-new', 'silver-old', 'copper-new', 'copper-old'];
let glbP = null;
// a small reader for this file: tightly packed float positions, normals and uvs, index list, JPEG textures in the binary chunk
const coinGlb = () => (glbP ||= fetch(COIN_GLB).then((r) => { if (!r.ok) throw new Error('coin model ' + r.status); return r.arrayBuffer(); }).then(async (buf) => {
    const dv = new DataView(buf), jl = dv.getUint32(12, true), J = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jl))), bin = 20 + jl + 8;
    const at = (v) => bin + (J.bufferViews[v].byteOffset || 0);
    const acc = (i) => { const a = J.accessors[i], T = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array }[a.componentType];
        const n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type], o = at(a.bufferView) + (a.byteOffset || 0);
        return { data: new T(buf.slice(o, o + a.count * n * T.BYTES_PER_ELEMENT)), min: a.min, max: a.max }; };
    const tex = async (i, colour) => { const im = J.images[J.textures[i].source], v = J.bufferViews[im.bufferView];
        const t = new THREE.Texture(await createImageBitmap(new Blob([new Uint8Array(buf, at(im.bufferView), v.byteLength)], { type: im.mimeType })));
        // glTF textures aren't flipped
        t.flipY = false; t.anisotropy = 8; t.needsUpdate = true; if (colour) t.colorSpace = THREE.SRGBColorSpace; return t; };
    const m = J.materials[0], pbr = m.pbrMetallicRoughness;
    const [map, mr, normalMap] = await Promise.all([tex(pbr.baseColorTexture.index, true), tex(pbr.metallicRoughnessTexture.index), tex(m.normalTexture.index)]);
    // reflections turned down a little: at full strength the bright silver coin washes out to white
    const mat = new THREE.MeshStandardMaterial({ map, metalnessMap: mr, roughnessMap: mr, normalMap, metalness: 1, roughness: 1, envMapIntensity: 0.55 });
    const coins = {};
    for (const node of J.nodes) { const child = node.children && J.nodes[node.children[0]];
        if (!/^Coin_/.test(node.name || '') || child?.mesh == null) continue;
        const p = J.meshes[child.mesh].primitives[0];
        coins[node.name.slice(5).toLowerCase()] = { pos: acc(p.attributes.POSITION), nor: acc(p.attributes.NORMAL), uv: acc(p.attributes.TEXCOORD_0), idx: p.indices != null ? acc(p.indices).data : null }; }
    return { mat, coins };
}).catch((e) => { glbP = null; throw e; }));
// a round coin's physics: a 16-sided prism, caps wound outward
function roundCoin(R, H) {
    const top = [], bot = [], n = 16;
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; top.push(V(Math.cos(a) * R, H / 2, Math.sin(a) * R)); bot.push(V(Math.cos(a) * R, -H / 2, Math.sin(a) * R)); }
    const all = [...top, ...bot], shape = new CANNON.ConvexPolyhedron({ vertices: all.map((p) => new CANNON.Vec3(p.x, p.y, p.z)),
        faces: [Array.from({ length: n }, (_, i) => n - 1 - i), Array.from({ length: n }, (_, i) => n + i), ...Array.from({ length: n }, (_, i) => [i, (i + 1) % n, n + ((i + 1) % n), n + i])] });
    return { shape, all, fs: [{ n: V(0, 1, 0), value: 'heads', pts: top }, { n: V(0, -1, 0), value: 'tails', pts: bot }] };
}
const modelBuilt = {};
async function modelCoin(key) {
    if (modelBuilt[key]) return modelBuilt[key];
    const { mat, coins } = await coinGlb(), c = coins[key];
    if (!c) return buildCoin();
    // the model lies flat in x-y with its thickness along z: turn it face up (z to y) and centre it; gold and silver are the 50 cent coin's size,
    // copper keeps its smaller size from the model
    const rad = Math.max(c.pos.max[0], c.pos.max[1]), zc = (c.pos.min[2] + c.pos.max[2]) / 2, k = (COIN_R * (rad / 0.026)) / rad;
    const P = new Float32Array(c.pos.data.length), N = new Float32Array(c.nor.data.length);
    for (let i = 0; i < P.length; i += 3) { P[i] = c.pos.data[i] * k; P[i + 1] = (c.pos.data[i + 2] - zc) * k; P[i + 2] = -c.pos.data[i + 1] * k;
        N[i] = c.nor.data[i]; N[i + 1] = c.nor.data[i + 2]; N[i + 2] = -c.nor.data[i + 1]; }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(N, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(c.uv.data, 2));
    if (c.idx) geo.setIndex(new THREE.BufferAttribute(c.idx, 1));
    const body = roundCoin(rad * k, (c.pos.max[2] - c.pos.min[2]) * k);
    return (modelBuilt[key] = { geo, mats: mat, shape: body.shape, fs: body.fs, verts: [], d4: false, all: body.all, coin: true });
}
// the coin a style flips: style.coin is a model coin's key, anything else the 50 cent coin
const coinFor = (key) => (MODEL_COINS.includes(key) ? modelCoin(key).catch(() => buildCoin()) : Promise.resolve(buildCoin()));
// a still picture of one coin, heads up and tipped a little so its edge shows
export async function previewCoin(key, w = 96, h = 96) {
    const t = await coinFor(key);
    pvInit();
    pv.r.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); pv.r.setSize(w, h, false);
    const r = 1.7; Object.assign(pv.cam, { left: -r, right: r, top: (r * h) / w, bottom: (-r * h) / w }); pv.cam.position.set(0, 50, 0); pv.cam.up.set(0, 0, -1); pv.cam.lookAt(0, 0, 0); pv.cam.updateProjectionMatrix();
    for (const m of pv.meshes) { pv.s.remove(m); m.fx?.dispose?.(); }
    const m = new THREE.Mesh(t.geo, t.mats); m.quaternion.setFromEuler(new THREE.Euler(0.45, 0, 0.2)); pv.s.add(m); pv.meshes = [m];
    pv.r.render(pv.s, pv.cam);
    return pv.r.domElement.toDataURL('image/png');
}
// a coin rings when it lands: a bright, slowly fading metal tone (dice on a table only clack)
// a style's coinSound ({ throw, hit, settle }, the Dice Sets page's coin sound profiles) rings instead when it has one
function coinHit(speed, onTable, st) {
    const vol = Math.min(1, speed / 12) ** 1.3;
    if (!st?.coinSound?.hit) return coinRing(speed, onTable);
    if (audio && vol >= 0.02) st.coinSound.hit({ ac: audio, out: audio.out, noise, vol, onTable, t: audio.currentTime });
}
function coinRing(speed, onTable) {
    const vol = Math.min(1, speed / 12) ** 1.3;
    if (!audio || vol < 0.02) return;
    const t = audio.currentTime, base = (onTable ? 2350 : 3100) * (0.97 + Math.random() * 0.06), g = audio.createGain();
    g.gain.setValueAtTime(vol * 0.22, t); g.gain.exponentialRampToValueAtTime(0.0005, t + (onTable ? 0.55 : 0.8)); g.connect(audio.out);
    for (const [m, v] of [[1, 1], [2.32, 0.5], [4.25, 0.25], [6.8, 0.12]]) { const o = audio.createOscillator(), og = audio.createGain(); o.frequency.value = base * m; og.gain.value = v; o.connect(og).connect(g); o.start(t); o.stop(t + 0.85); }
    const s = audio.createBufferSource(); s.buffer = noise; const hp = audio.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 4000;
    const cg = audio.createGain(); cg.gain.setValueAtTime(vol * 0.3, t); cg.gain.exponentialRampToValueAtTime(0.0005, t + 0.03); s.connect(hp).connect(cg).connect(audio.out); s.start(t, Math.random() * 0.2, 0.05);
}
// the value showing: the face pointing most up (a d4: the corner pointing most up)
const UP = V(0, 1, 0);
// a die's numbered directions: its face normals, or a d4's corners
const dirOf = (t, i) => (t.d4 ? t.verts[i].clone().normalize() : t.fs[i].n.clone());
const topIndex = (t, q) => { let best = -9, k = 0; const n = t.d4 ? t.verts.length : t.fs.length;
    for (let i = 0; i < n; i++) { const y = dirOf(t, i).applyQuaternion(q).y; if (y > best) { best = y; k = i; } } return k; };
const quatOf = (b) => new THREE.Quaternion(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
// raw: what the physics landed on, ignoring a forced die's turned numbering (S)
function readDie(d, raw = false) {
    const q = quatOf(d.body); if (d.S && !raw) q.multiply(d.S);
    const k = topIndex(d.t, q);
    return d.t.d4 ? k + 1 : d.t.fs[k].value;
}
// a turn of the die onto itself (its shape doesn't change) that takes direction from to direction to;
// drawing the die turned by it moves one face's number onto another face, which is how a forced number gets on top
function symmetry(t, from, to) {
    const q1 = new THREE.Quaternion().setFromUnitVectors(from, to);
    const flat = (p) => p.clone().sub(to.clone().multiplyScalar(p.dot(to)));
    const anchor = t.all.find((p) => Math.abs(p.clone().normalize().dot(from)) < 0.99).clone().applyQuaternion(q1), pa = flat(anchor);
    for (const c of t.all) {
        const pc = flat(c);
        if (Math.abs(c.dot(to) - anchor.dot(to)) > 1e-3 || Math.abs(pc.length() - pa.length()) > 1e-3) continue;
        const q = new THREE.Quaternion().setFromAxisAngle(to, Math.atan2(pa.clone().cross(pc).dot(to), pa.dot(pc))).multiply(q1);
        if (t.all.every((p) => { const m = p.clone().applyQuaternion(q); return t.all.some((o) => o.distanceTo(m) < 1e-3); })) return q;
    }
    return null;
}
// the index of the face (or d4 corner) that carries a value
const indexOf = (t, v) => (t.d4 ? v - 1 : t.fs.findIndex((f) => f.value === v));
// turns a forced die's numbering so want shows where the physics put landed (both indexes)
const force = (d, landed) => { d.S = symmetry(d.t, dirOf(d.t, indexOf(d.t, d.want)), dirOf(d.t, landed)); };

// something for metal dice to reflect: a dark room with a bright sky and two soft lights
function roomEnv(r) {
    const room = new THREE.Scene(), sky = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.MeshBasicMaterial({ side: THREE.BackSide, vertexColors: true }));
    const sp = sky.geometry.attributes.position, col = [];
    for (let i = 0; i < sp.count; i++) { const t = (sp.getY(i) / 50 + 1) / 2; col.push(0.08 + t * 0.9, 0.08 + t * 0.88, 0.1 + t * 0.85); }
    sky.geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); room.add(sky);
    for (const [x, z] of [[-20, -10], [18, 12]]) { const lamp = new THREE.Mesh(new THREE.PlaneGeometry(18, 18), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })); lamp.position.set(x, 30, z); lamp.lookAt(0, 0, 0); room.add(lamp); }
    return new THREE.PMREMGenerator(r).fromScene(room, 0.04).texture;
}
// ---- the scene: a see-through layer over the page, an invisible table that takes shadows, walls at the screen edges ----
let scene, camera, renderer, world = null, cv, live = [], throws = [], raf = 0, fadeT = [];
function setup() {
    cv = document.createElement('canvas'); cv.id = 'hb-throw'; cv.setAttribute('aria-hidden', 'true'); document.body.appendChild(cv);
    renderer = new THREE.WebGLRenderer({ canvas: cv, alpha: true, antialias: true });
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x404040, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(-8, 30, -6); sun.castShadow = true;
    Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 80 }); sun.shadow.mapSize.set(2048, 2048);
    scene.add(sun);
    const table = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.ShadowMaterial({ opacity: 0.35 }));
    table.rotation.x = -Math.PI / 2; table.receiveShadow = true; scene.add(table);
    scene.environment = roomEnv(renderer);
    // straight down with no perspective, so a die looks the same anywhere on the screen
    camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 200);
}
// ---- sound: every hit in the physics makes a knock, louder and lower the harder it lands ----
let audio = null, noise = null;
function knock(speed, onTable, st) {
    const vol = Math.min(1, speed / 14) ** 1.4;
    if (!audio || vol < 0.02) return;
    const t = audio.currentTime, out = audio.out;
    // a style with its own sound makes it instead
    if (st?.sound?.hit) return st.sound.hit({ ac: audio, out, noise, vol, onTable, t });
    // the click: a burst of noise through a band-pass, higher for dice on dice
    const src = audio.createBufferSource(); src.buffer = noise; src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const bp = audio.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = onTable ? 700 + Math.random() * 500 : 2400 + Math.random() * 1600; bp.Q.value = onTable ? 1.1 : 2.5;
    const g = audio.createGain(); g.gain.setValueAtTime(vol * (onTable ? 0.9 : 0.6), t); g.gain.exponentialRampToValueAtTime(0.001, t + (onTable ? 0.14 : 0.07));
    src.connect(bp).connect(g).connect(out); src.start(t, Math.random() * 0.2, 0.2);
    // the weight: a short low thump when it hits the table
    if (onTable) {
        const o = audio.createOscillator(), og = audio.createGain();
        o.frequency.setValueAtTime(130 + Math.random() * 40, t); o.frequency.exponentialRampToValueAtTime(55, t + 0.09);
        og.gain.setValueAtTime(vol * 0.8, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        o.connect(og).connect(out); o.start(t); o.stop(t + 0.13);
    }
}
function startAudio() {
    if (!audio) {
        const A = window.AudioContext || window.webkitAudioContext; if (!A) return;
        audio = new A();
        audio.out = audio.createDynamicsCompressor(); audio.out.connect(audio.destination);
        noise = audio.createBuffer(1, audio.sampleRate * 0.4, audio.sampleRate);
        const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (audio.state === 'suspended') audio.resume();
}
// a table: the floor and four walls; the live one, or a silent copy for working out forced numbers
function walls(hw, hd) {
    const w = new CANNON.World({ gravity: new CANNON.Vec3(0, -50, 0), allowSleep: true });
    w.defaultContactMaterial.friction = 0.3; w.defaultContactMaterial.restitution = 0.35;
    const plane = (pos, axis, ang) => { const b = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() }); b.position.set(...pos); b.quaternion.setFromAxisAngle(new CANNON.Vec3(...axis), ang); w.addBody(b); };
    plane([0, 0, 0], [1, 0, 0], -Math.PI / 2);
    plane([-hw, 0, 0], [0, 1, 0], Math.PI / 2); plane([hw, 0, 0], [0, 1, 0], -Math.PI / 2);
    plane([0, 0, -hd], [0, 0, 1], 0); plane([0, 0, hd], [0, 1, 0], Math.PI);
    return w;
}
// takes a die off the table, and anything its style added to the scene
const drop = (d) => { scene.remove(d.mesh); d.fx?.dispose?.(); d.trail?.dispose?.(); };
function clear() {
    cancelAnimationFrame(raf); raf = 0;
    for (const d of live) drop(d);
    live = []; world = null; exiting = false;
}
function fade() { cv.style.transition = 'opacity .3s'; cv.style.opacity = '0'; fadeT.push(setTimeout(() => { fadeT = []; clear(); renderer.clear(); }, 320)); }

// ---- exits: how each die leaves the table, picked by what it rolled ----
// a style's exits map keys to animations, and the most specific key wins: 'd20:20' (one number), 'd20:2-19' (a range), 'd20' (that die), '*' (any die).
// The percentile dice are 'd100' (tens: 0, 10 ... 90) and 'd100u' (units: 0-9). A style without exits fades out as before.
// An animation is { dur (seconds), start(x), tick(k, x) with k from 0 to 1, end(x) }; x is { THREE, scene, st (the style), mesh, body, die, value, audio, sec, dt },
// and an animation can keep its own things on x. The die is hidden when its animation ends.
const dieName = (kind) => (kind === 't' ? 'd100' : kind === 'u' ? 'd100u' : 'd' + kind);
// a coin's default exit: blobby holes open in it until it is gone, the same dissolve as the Ember dice (extras/ember/anims/14.js)
const COIN_DISSOLVE = `float h1(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float vn(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
    return mix(mix(mix(h1(i), h1(i + vec3(1, 0, 0)), f.x), mix(h1(i + vec3(0, 1, 0)), h1(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(h1(i + vec3(0, 0, 1)), h1(i + vec3(1, 0, 1)), f.x), mix(h1(i + vec3(0, 1, 1)), h1(i + vec3(1, 1, 1)), f.x), f.y), f.z); }
float fbm(vec3 p){ return .6 * vn(p) + .3 * vn(p * 2.1 + 5.) + .1 * vn(p * 4.3 + 9.); }`;
const coinExit = {
    dur: 0.9,
    start(x) {
        x.u = { dis: { value: -0.1 } }; x.swap = [];
        // its shadow would stay as a dark disc under the holes, so it goes as the coin starts to dissolve
        x.mesh.traverse((o) => { if (!o.isMesh) return; x.swap.push([o, o.material, o.castShadow]); o.castShadow = false;
            o.material = [].concat(o.material).map((m0) => { const m = m0.clone();
                m.onBeforeCompile = (sh) => { sh.uniforms.uDis = x.u.dis;
                    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;').replace('#include <project_vertex>', '#include <project_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.)).xyz;');
                    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp; uniform float uDis;\n' + COIN_DISSOLVE)
                        .replace('void main() {', 'void main() {\n    if (fbm(vWp * 2.5) < uDis) discard;'); };
                m.customProgramCacheKey = () => 'coin-dissolve'; return m; });
            if (!Array.isArray(x.swap.at(-1)[1])) o.material = o.material[0]; });
    },
    tick(k, x) { x.u.dis.value = 0.15 + 0.75 * k; }, // the noise sits mostly between 0.15 and 0.9
    end(x) { for (const [o, m, sh] of x.swap) { [].concat(o.material).forEach((c) => c.dispose()); o.material = m; o.castShadow = sh; } },
};
function exitFor(st, d) {
    const x = st?.exits, die = dieName(d.kind), v = d.value;
    if (v == null) return null;
    // a coin only leaves with an exit made for coins, never a set's catch-all
    if (d.kind === 'coin') return x?.coin || coinExit;
    if (!x) return null;
    if (x[die + ':' + v]) return x[die + ':' + v];
    for (const k in x) { const m = /^(d\w+):(\d+)-(\d+)$/.exec(k); if (m && m[1] === die && v >= +m[2] && v <= +m[3]) return x[k]; }
    return x[die] || x['*'] || null;
}
let exiting = false;
// after the pause: start every die's exit, or fade straight away when none has one
function leave() {
    for (const d of live) { const a = exitFor(d.st, d);
        if (a) d.exit = { a, age: 0, x: { THREE, scene, st: d.st, mesh: d.mesh, body: d.body, die: dieName(d.kind), value: d.value, audio: d.sound && audio ? { ac: audio, out: audio.out, noise } : null } }; }
    exiting = live.some((d) => d.exit);
    if (!exiting) fade();
}
// one step of every running exit; false once they have all finished
function runExits(sec, dt) {
    let busy = false;
    for (const d of live) {
        const e = d.exit; if (!e || e.done) continue;
        Object.assign(e.x, { sec, dt });
        if (!e.started) { e.started = true; e.a.start?.(e.x); }
        e.age += dt; const k = Math.min(1, e.age / (e.a.dur || 1));
        e.a.tick?.(k, e.x);
        if (k >= 1) { e.done = true; e.a.end?.(e.x); d.mesh.visible = false; } else busy = true;
    }
    return busy;
}
// a new throw cuts running exits short and takes their dice off the table
function endExits() {
    if (!exiting) return;
    for (const d of live) if (d.exit) { if (!d.exit.done) { d.exit.done = true; d.exit.a.end?.(d.exit.x); } drop(d); world.removeBody(d.body); }
    live = live.filter((d) => !d.exit); exiting = false;
}
// the table size for this screen; kept while any dice are on it
let hw = 0, hd = 0;
function table() {
    // about D&D Beyond's size: a d20 is roughly 130 px across on a laptop, smaller on a phone
    const W = innerWidth, H = innerHeight, ppu = Math.max(28, Math.min(56, Math.min(W, H) / 16));
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); renderer.setSize(W, H, false);
    hd = H / ppu / 2; hw = W / ppu / 2;
    Object.assign(camera, { left: -hw, right: hw, top: hd, bottom: -hd });
    camera.position.set(0, 60, 0); camera.up.set(0, 0, -1); camera.lookAt(0, 0, 0); camera.updateProjectionMatrix();
    world = walls(hw - 0.3, hd - 0.3);
}
// glows (additive materials) brighten the page under the see-through table without touching its alpha; plain additive also writes alpha,
// which darkens the page around faint glows. Checked each frame because styles, trails and exits add glows as they go.
const glowOver = (root) => root.traverse((o) => { for (const m of [].concat(o.material || [])) if (m.blending === THREE.AdditiveBlending) {
    Object.assign(m, { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneFactor,
        blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor }); m.needsUpdate = true; } });
const asleep = (d) => d.body.sleepState === CANNON.Body.SLEEPING || (d.body.velocity.length() < 0.15 && d.body.angularVelocity.length() < 0.15);
// one loop for every throw on the table; each throw resolves when its own dice stop, the table clears when all have
// how many times faster than real time the table runs: the same 1/120 s physics steps, just more of them per frame
let speed = 1;
export function setSpeed(x) { speed = Math.max(1, Math.min(16, +x || 1)); }
function frame(now) {
    const real = Math.min(0.05, (now - (frame.last || now)) / 1000), dt = real * speed; frame.last = now;
    world.step(1 / 120, dt, Math.ceil(8 * speed));
    for (const d of live) { d.mesh.position.copy(d.body.position); d.mesh.quaternion.copy(d.body.quaternion); if (d.S) d.mesh.quaternion.multiply(d.S); d.fx?.tick?.(now / 1000, dt, d.body); d.trail?.tick?.(now / 1000, dt, d.body); }
    // exits run in real time, after the physics placed the die, so they can move, scale or hide it
    if (exiting && !runExits(now / 1000, real)) { exiting = false; fade(); }
    glowOver(scene); renderer.render(scene, camera);
    for (const t of throws) {
        // both counted in table time, so they hold at any speed
        t.age += dt; t.quiet = t.dice.every(asleep) ? t.quiet + dt : 0;
        if (t.quiet > 0.25 || t.age > 7) { t.done = true; t.resolve(t.results()); if (audio) t.snd?.settle?.({ ac: audio, out: audio.out, noise, t: audio.currentTime, count: t.dice.length }); }
    }
    throws = throws.filter((t) => !t.done);
    // leave them on the table a moment, then their exits (or a fade)
    if (!throws.length && !fadeT.length && !exiting) fadeT.push(setTimeout(leave, 1400));
    if (world) raf = requestAnimationFrame(frame);
}

// empties the table now instead of after the usual pause and fade (the dice test page uses it between rolls)
// force: also takes dice that are still rolling, reading them where they are (the Dice Sets page clears before every roll)
export function clearTable(force = false) {
    fadeT.forEach(clearTimeout); fadeT = [];
    if (force) { for (const t of throws) t.resolve(t.results()); throws = []; }
    if (world) endExits();
    if (scene && !throws.length) { clear(); renderer.clear(); }
}

// a style is a key of STYLES or a style object (the dice page's sets in dice/sets/*.js); key names its built dice
const styleOf = (style, accent) => { const base = typeof style === 'object' ? style : STYLES[style] || STYLES.purple;
    return { ...base, body: accent, key: (base.key || style) + accent }; };
// moving parts: a style's decorate() adds things to each die (children of its mesh, or to the scene) and returns { tick(sec, dt, body), dispose() }
const decorate = (st, d) => st.decorate?.({ THREE, scene, mesh: d.mesh, kind: d.kind, sides: d.kind === 't' || d.kind === 'u' ? 10 : d.kind, faces: d.t.fs, rnd }) || null;

// style: see styleOf; accent: the purple style's colour; sound: knock as they land
// land: numbers to force, shaped like groups' results ([[20], [3, 5]] for [[20, 1], [6, 2]]; a d100's are 1-100); a missing one rolls freely.
// The throw is first run silently on a copy of the table to see where each die lands, then the die's numbering is turned so the wanted number
// is on that face. That only matches when the table starts empty (clearTable(true) first); otherwise the numbers are turned once the dice stop.
export async function throwDice(groups, { style = 'purple', accent = '#5b3f8f', sound = true, land = null } = {}) {
    // dice already on the table stay; a fade that had started stops
    fadeT.forEach(clearTimeout); fadeT = [];
    if (!scene) setup();
    if (!world) table();
    endExits();
    if (sound) startAudio();
    // shortcut: past 40 dice the oldest settled ones are taken off so the page stays smooth
    while (live.length > 40 && !throws.some((t) => t.dice.includes(live[0]))) { drop(live[0]); world.removeBody(live[0].body); live.shift(); }
    const st = styleOf(style, accent);
    // a d100 is a tens die and a units die
    const kinds = groups.flatMap(([n, c]) => Array.from({ length: c }, () => (n === 100 ? ['t', 'u'] : [n])).flat());
    // each throw comes in from a random spot on the screen edge: a random direction out from the middle, stopped at the edge
    const a = Math.random() * Math.PI * 2, cx = Math.cos(a), cz = Math.sin(a), s = Math.min(hw / Math.abs(cx || 1e-9), hd / Math.abs(cz || 1e-9));
    const fit = (v, h) => Math.max(-h + 1.5, Math.min(h - 1.5, v));
    // a coin (groups: [['coin', 1]]) is the same in every style and lands heads or tails
    // which coin: style.coin, a model coin's key (MODEL_COINS) or the 50 cent coin
    const coinT = kinds.includes('coin') ? await coinFor(st.coin) : null;
    const build = (kind) => (kind === 'coin' ? coinT : buildDie(kind, st));
    // how each die starts: spread along the edge (i % 4) and inward (i % 3), then thrown at a spot near the middle;
    // a coin is flipped instead: tossed up from the same random edge spot, flying across to land past the middle, spinning end over end
    const starts = kinds.map((kind, i) => {
        if (kind === 'coin') { const along = (i - (kinds.length - 1) / 2) * 3, x = fit(cx * s - cx * 3 - cz * along, hw), z = fit(cz * s - cz * 3 + cx * along, hd);
            const vy = 24 + Math.random() * 5, air = (2 * vy) / 50, far = 0.1 + Math.random() * 0.35; // air: seconds up and down again under the table's gravity
            const tx = -cx * s * far + (Math.random() - 0.5) * hw * 0.3, tz = -cz * s * far + (Math.random() - 0.5) * hd * 0.3;
            const dx = tx - x, dz = tz - z, d = Math.hypot(dx, dz) || 1, sp = Math.random() < 0.5 ? -1 : 1, flip = sp * (32 + Math.random() * 14);
            return { pos: [x, 1.5, z], vel: [dx / air, vy, dz / air],
                spin: [(dz / d) * flip + (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, (-dx / d) * flip + (Math.random() - 0.5) * 3], turn: [Math.random() < 0.5 ? 0 : Math.PI, Math.random() * 6, 0] }; }
        const along = ((i % 4) - 1.5) * 1.6, inward = 2 + (i % 3) * 1.2;
        const x = fit(cx * s - cx * inward - cz * along, hw), z = fit(cz * s - cz * inward + cx * along, hd);
        const sp = 0.9 + Math.random() * 0.5, tx = (Math.random() - 0.5) * hw * 0.5, tz = (Math.random() - 0.5) * hd * 0.5;
        return { pos: [x, 3 + Math.floor(i / 4) * 1.8, z], vel: [(tx - x) * 1.2 * sp, -2, (tz - z) * 1.2 * sp],
            spin: [0, 0, 0].map(() => (Math.random() - 0.5) * 30), turn: [0, 0, 0].map(() => Math.random() * 6) };
    });
    const body = (t, a) => { const b = new CANNON.Body({ mass: 1, shape: t.shape, sleepSpeedLimit: 0.25, sleepTimeLimit: 0.3, angularDamping: 0.15, linearDamping: 0.1 });
        b.position.set(...a.pos); b.velocity.set(...a.vel); b.angularVelocity.set(...a.spin); b.quaternion.setFromEuler(...a.turn); return b; };
    // forced numbers, one per die in kinds' order; a d100 splits into its tens and units dice
    const wants = land ? groups.flatMap(([n, c], g) => Array.from({ length: c }, (_, j) => { const v = land[g]?.[j];
        return n === 100 ? (v == null ? [null, null] : [Math.floor((v % 100) / 10) * 10, v % 10]) : [v ?? null]; }).flat()) : [];
    // the silent run: same table, same starts, the same fixed physics steps, until everything sleeps
    let landed = null;
    if (wants.some((v) => v != null) && live.length === 0) {
        const w = walls(hw - 0.3, hd - 0.3), bs = starts.map((a, i) => { const b = body(build(kinds[i]), a); w.addBody(b); return b; });
        for (let i = 0; i < 120 * 8 && !bs.every((b) => b.sleepState === CANNON.Body.SLEEPING); i++) w.step(1 / 120);
        landed = bs.map((b, i) => topIndex(build(kinds[i]), quatOf(b)));
    }
    const dice = kinds.map((kind, i) => {
        const t = build(kind), mesh = new THREE.Mesh(t.geo, t.mats);
        mesh.castShadow = true; scene.add(mesh);
        const b = body(t, starts[i]);
        // each hit knocks once: dice on dice is handled by the lower id, and a die can't knock again within 30 ms
        if (sound) b.addEventListener('collide', (e) => {
            const other = e.body, now = performance.now();
            if (other.mass && other.id < b.id) return;
            if (now - (b.lastKnock || 0) < 30) return;
            b.lastKnock = now; (kind === 'coin' ? coinHit : knock)(Math.abs(e.contact.getImpactVelocityAlongNormal()), !other.mass, st);
        });
        world.addBody(b);
        const d = { kind, t, mesh, body: b, st, sound, want: wants[i] ?? null };
        if (d.want != null && landed) force(d, landed[i]);
        // a trail: what a die leaves on the table as it rolls, made like decorate() but given the table size; its marks go when the dice do
        // (a coin stays a plain coin: no set decorations or trails)
        if (kind !== 'coin') { d.fx = decorate(st, d); d.trail = st.trail?.({ THREE, scene, mesh, body: b, kind, sides: kind === 't' || kind === 'u' ? 10 : kind, hw, hd, rnd }) || null; }
        live.push(d); return d;
    });
    // a throw of only coins makes no throw or settle sound: a coin is only heard while it bounces (coinHit)
    const snd = kinds.every((k) => k === 'coin') ? null : st.sound;
    if (sound && audio) snd?.throw?.({ ac: audio, out: audio.out, noise, t: audio.currentTime, count: dice.length });
    cv.style.transition = 'none'; cv.style.opacity = '1';
    return new Promise((resolve) => {
        const results = () => {
            // a forced die that landed somewhere else than the silent run said gets its numbering turned now
            for (const d of dice) if (d.want != null && readDie(d) !== d.want) force(d, topIndex(d.t, quatOf(d.body)));
            // each die keeps its value, which picks its exit
            const out = [], vals = dice.map((d) => (d.value = readDie(d)));
            for (const [n, c] of groups) {
                const r = [];
                for (let j = 0; j < c; j++) {
                    if (n === 100) { const tens = vals.shift(), units = vals.shift(); r.push(tens + units || 100); }
                    else r.push(vals.shift());
                }
                out.push([n, r]);
            }
            return out;
        };
        throws.push({ dice, resolve, results, snd: sound ? snd : null, age: 0, quiet: 0 });
        if (!raf) { frame.last = 0; raf = requestAnimationFrame(frame); }
    });
}

// ---- previews: one still picture per style, the whole set in a row (d4 d6 d8 d10 d12 d20 and the percentile die) ----
let pv = null;
// kinds: which dice, left to right; one die (the sheet's picker shows a d20) gets a roomier frame so its moving parts fit
// one small renderer for every preview picture
function pvInit() {
    if (pv) return;
    const r = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    const s = new THREE.Scene();
    s.add(new THREE.HemisphereLight(0xffffff, 0x404040, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(-8, 30, -6); s.add(sun);
    s.environment = roomEnv(r);
    pv = { r, s, cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 100), meshes: [] };
}
export function previewStyle(style, accent = '#5b3f8f', w = 336, h = 56, kinds = [4, 6, 8, 10, 12, 20, 't']) {
    pvInit();
    const st = styleOf(style, accent);
    const gap = kinds.length === 1 ? 3.6 : 2.6, hw = (kinds.length * gap) / 2, hd = (hw * h) / w;
    pv.r.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); pv.r.setSize(w, h, false);
    Object.assign(pv.cam, { left: -hw, right: hw, top: hd, bottom: -hd }); pv.cam.position.set(0, 50, 0); pv.cam.up.set(0, 0, -1); pv.cam.lookAt(0, 0, 0); pv.cam.updateProjectionMatrix();
    for (const m of pv.meshes) { pv.s.remove(m); m.fx?.dispose?.(); }
    pv.meshes = kinds.map((kind, i) => {
        const t = buildDie(kind, st), m = new THREE.Mesh(t.geo, t.mats);
        // the top number faces the camera, tipped a little so the edges show
        const top = t.d4 ? t.verts[3].clone().normalize() : t.fs[t.fs.length - 1].n;
        m.quaternion.setFromUnitVectors(top, UP);
        if (kinds.length === 1 && !t.d4) {
            // a lone die: its top number faces the camera, turned upright (the text's up is the face's v, the screen's up is -z)
            const v = t.fs[t.fs.length - 1].v.clone().applyQuaternion(m.quaternion);
            m.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(UP, Math.PI - Math.atan2(v.x, v.z)));
        } else m.quaternion.premultiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.35, 0, -0.25)));
        m.position.set(-hw + gap / 2 + i * gap, 0, 0);
        // moving parts drawn once, part way into their motion
        pv.s.add(m); m.fx = st.decorate?.({ THREE, scene: pv.s, mesh: m, kind, sides: kind === 't' ? 10 : kind, faces: t.fs, rnd }) || null; m.fx?.tick?.(1.5, 0, null);
        return m;
    });
    pv.r.render(pv.s, pv.cam);
    return pv.r.domElement.toDataURL('image/png');
}
