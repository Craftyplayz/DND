// Ember Cage exits 40, nat 20 Diamond: the molten die cools to ice and fades while a brilliant-cut diamond (table, crown, pavilion)
// crystallises in its place from the girdle inwards; it turns slowly, its facets flashing white, blue and rainbow fire, star glints twinkle, then it flashes away.
let FX = null;
function fx(T) {
    if (FX) return FX;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    // a four-point star with thinner diagonals, for glints
    const s = document.createElement('canvas'); s.width = s.height = 128;
    const h = s.getContext('2d'), ray = (a, len, w) => { h.save(); h.translate(64, 64); h.rotate(a); const lg = h.createLinearGradient(0, 0, len, 0); lg.addColorStop(0, 'rgba(255,255,255,1)'); lg.addColorStop(1, 'rgba(255,255,255,0)'); h.fillStyle = lg; h.beginPath(); h.moveTo(0, -w); h.lineTo(len, 0); h.lineTo(0, w); h.fill(); h.restore(); };
    for (let i = 0; i < 4; i++) { ray(i * Math.PI / 2, 62, 4); ray(i * Math.PI / 2 + Math.PI / 4, 30, 2.5); }
    const cg = h.createRadialGradient(64, 64, 0, 64, 64, 16); cg.addColorStop(0, 'rgba(255,255,255,1)'); cg.addColorStop(1, 'rgba(255,255,255,0)'); h.fillStyle = cg; h.fillRect(0, 0, 128, 128);
    // a soft ring for the frost closing in
    const r = document.createElement('canvas'); r.width = r.height = 128;
    const q = r.getContext('2d'), rg = q.createRadialGradient(64, 64, 44, 64, 64, 64);
    rg.addColorStop(0, 'rgba(255,255,255,0)'); rg.addColorStop(0.7, 'rgba(255,255,255,1)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    q.fillStyle = rg; q.fillRect(0, 0, 128, 128);
    return (FX = { soft: new T.CanvasTexture(c), star: new T.CanvasTexture(s), ring: new T.CanvasTexture(r), plane: new T.PlaneGeometry(1, 1), gem: gem(T) });
}
// a round brilliant, girdle radius 1, table up: 8-sided table, 8 star facets, 8 bezel kites, 16 upper girdle facets, 8 pavilion mains + 16 lower girdle halves
function gem(T) {
    const P = (r, a, y) => [r * Math.cos(a), y, r * Math.sin(a)], A = Math.PI / 8, pos = [];
    const G = (j) => P(1, j * A, 0), Tb = (i) => P(0.55, i * 2 * A, 0.34), S = (i) => P(0.8, (i * 2 + 1) * A, 0.2), L = (i) => P(0.5, i * 2 * A, -0.42), C = [0, -0.86, 0];
    const tri = (a, b, c) => pos.push(...a, ...c, ...b); // wound so normals face out
    for (let i = 0; i < 8; i++) {
        tri([0, 0.34, 0], Tb(i), Tb(i + 1)); // table
        tri(Tb(i), S(i), Tb(i + 1)); // star
        tri(Tb(i), S(i - 1), G(2 * i)); tri(Tb(i), G(2 * i), S(i)); // bezel kite
        tri(S(i), G(2 * i), G(2 * i + 1)); tri(S(i), G(2 * i + 1), G(2 * i + 2)); // upper girdle
        tri(G(2 * i), L(i), G(2 * i + 1)); tri(G(2 * i), G(2 * i - 1), L(i)); // lower girdle halves
        tri(L(i), C, G(2 * i + 1)); tri(L(i + 1), G(2 * i + 1), C); // pavilion mains (two halves)
    }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
    return g;
}
const add = (x, o) => (x.scene.add(o), x.own.push(o), o);
const sprite = (x, map, color) => { const s = add(x, new x.THREE.Sprite(new x.THREE.SpriteMaterial({ map, color, transparent: true, depthWrite: false, blending: x.THREE.AdditiveBlending }))); s.position.copy(x.mesh.position); s.scale.setScalar(0.01); return s; };
const ease = (k) => 1 - (1 - k) ** 3;
const at = (k, a, b) => Math.max(0, Math.min(1, (k - a) / (b - a)));
const fract = (v) => v - Math.floor(v);

const nat20 = {
    key: 'a40-diamond', name: 'Diamond', impact: 1.1, dur: 3.6,
    blurb: 'The molten core cools and clears, the cage melts away and the die crystallises into a brilliant-cut diamond that turns, glints and flashes.',
    start(x) {
        const T = x.THREE, F = fx(T);
        x.own = []; x.s0 = x.mesh.scale.clone(); x.q0 = x.mesh.quaternion.clone(); x.vis0 = x.mesh.visible; x.cast0 = x.mesh.castShadow;
        // the die's own materials swapped for copies we can cool and fade; the cage overlays hidden
        x.mat0 = x.mesh.material; x.mats = [].concat(x.mat0).map((m) => m.clone()); x.mesh.material = Array.isArray(x.mat0) ? x.mats : x.mats[0];
        x.mats.forEach((m) => { m.transparent = true; m.c0 = m.color?.clone(); m.e0 = m.emissive?.clone(); });
        x.kids = x.mesh.children.map((c) => [c, c.visible]);
        // the gem: its own geometry copy with per-vertex colour + alpha, recoloured each frame from where every facet points
        x.geo = F.gem.clone(); x.n0 = x.geo.attributes.normal.array.slice(); x.tris = x.geo.attributes.position.count / 3;
        x.col = new Float32Array(x.tris * 12); x.geo.setAttribute('color', new T.BufferAttribute(x.col, 4));
        // how far out each facet sits, so the outside crystallises first
        const p = x.geo.attributes.position; x.rad = [];
        for (let t = 0; t < x.tris; t++) { let r = 0; for (let i = 0; i < 3; i++) r += Math.hypot(p.getX(t * 3 + i), p.getZ(t * 3 + i)); x.rad.push(r / 3); }
        x.gem = add(x, new T.Mesh(x.geo, new T.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: true })));
        x.edges = add(x, new T.LineSegments(new T.EdgesGeometry(F.gem, 1), new T.LineBasicMaterial({ color: 0xe8f4ff, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false })));
        const p0 = x.mesh.position; x.size = 1.6 + Math.random() * 0.2; x.a0 = Math.random() * 6.283; x.spin = (Math.random() < 0.5 ? -1 : 1) * (0.8 + Math.random() * 0.5);
        x.tilt = new T.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
        for (const o of [x.gem, x.edges]) o.position.set(p0.x, p0.y + 0.2, p0.z);
        x.halo = sprite(x, F.soft, 0x9fd8ff); x.flash = sprite(x, F.soft, 0xffffff);
        x.frost = add(x, new T.Mesh(F.plane, new T.MeshBasicMaterial({ map: F.ring, color: 0xbfe6ff, transparent: true, depthWrite: false, blending: T.AdditiveBlending })));
        x.frost.rotation.x = -Math.PI / 2; x.frost.position.set(p0.x, p0.y + 0.9, p0.z);
        // glints sit on random crown facets and twinkle on their own beat
        x.glints = Array.from({ length: 9 }, (_, i) => { const s = sprite(x, F.star, i % 3 ? 0xffffff : 0xcfe8ff), t = 10 * Math.floor(Math.random() * 8) + Math.floor(Math.random() * 6);
            s.at = new T.Vector3(); for (let j = 0; j < 3; j++) s.at.add(new T.Vector3().fromBufferAttribute(p, t * 3 + j)); s.at.divideScalar(3); s.ph = Math.random(); s.sp = 1.2 + Math.random(); s.material.rotation = Math.random(); s.material.depthTest = false; return s; });
        x.q = new T.Quaternion(); x.n = new T.Vector3(); x.v = new T.Vector3(); x.c = new T.Color();
    },
    tick(k, x) {
        const T = x.THREE, cool = at(k, 0, 0.3), grow = at(k, 0.18, 0.55), fade = at(k, 0.86, 0.95), pos = x.gem.position;
        // the die: lava cools to pale ice, the cage dissolves, it shrinks and clears as the gem takes its place
        x.mats.forEach((m) => { m.c0 && m.color.copy(m.c0).lerp(x.c.setRGB(0.75, 0.88, 1), cool); m.e0 && m.emissive.copy(m.e0).lerp(x.c.setRGB(0.15, 0.3, 0.45), cool); m.opacity = 1 - at(k, 0.25, 0.5); });
        x.kids.forEach(([c]) => (c.visible = cool < 0.6));
        x.mesh.scale.copy(x.s0).multiplyScalar(1 - 0.35 * at(k, 0.2, 0.5)); x.mesh.visible = k < 0.5; x.mesh.castShadow = false;
        // the gem turns slowly about the vertical, tipping a little so facets catch the light
        const s = x.size * (0.8 + 0.2 * ease(grow)) * (1 + 0.15 * at(k, 0.86, 0.92) - 0.6 * fade), ang = x.a0 + x.spin * k * 2.4;
        x.q.setFromAxisAngle(x.tilt, 0.12 * Math.sin(k * 7)).multiply(new T.Quaternion().setFromAxisAngle(x.v.set(0, 1, 0), ang));
        for (const o of [x.gem, x.edges]) { o.quaternion.copy(x.q); o.scale.setScalar(s); }
        // every facet's colour: icy base shaded by a fake surrounding, sharp specular from three lights, and rainbow fire that shifts with the turn
        const reveal = ease(grow) * 1.25, alpha = 1 - fade, nA = x.n0;
        for (let t = 0; t < x.tris; t++) {
            const n = x.n.set(nA[t * 9], nA[t * 9 + 1], nA[t * 9 + 2]).applyQuaternion(x.q), az = Math.atan2(n.z, n.x);
            const env = 0.1 + 0.9 * (0.5 + 0.5 * Math.sin(az * 3 + n.y * 7 + t * 0.9 + k * 9)) ** 2;
            const spec = Math.max(0, n.x * 0.35 + n.y * 0.86 + n.z * 0.37) ** 60 + Math.max(0, -n.x * 0.5 + n.y * 0.7 + n.z * 0.5) ** 40 + Math.max(0, n.x * 0.1 + n.y * 0.8 - n.z * 0.6) ** 40;
            const fire = Math.max(0, Math.sin(az * 5 + t * 1.7 + k * 14)) ** 4 * 0.8;
            x.c.setHSL(fract(az / 6.283 * 2 + t * 0.13 + k), 1, 0.6);
            // crystallising: outer facets first, each frosts in white before it clears
            const on = Math.max(0, Math.min(1, (reveal - (1 - x.rad[t])) * 4)), frost = on * (1 - on) * 2.5;
            const r = (0.78 * env + fire * x.c.r + spec) * (0.6 + 0.4 * on) + frost, g = (0.88 * env + fire * x.c.g + spec) * (0.6 + 0.4 * on) + frost, b = (1 * env + fire * x.c.b + spec) * (0.6 + 0.4 * on) + frost;
            for (let i = 0; i < 3; i++) x.col.set([r, g, b, on * alpha], (t * 3 + i) * 4);
        }
        x.geo.attributes.color.needsUpdate = true;
        x.edges.material.opacity = 0.8 * at(k, 0.3, 0.55) * alpha;
        // frost ring closes in from outside onto the girdle while it forms
        x.frost.scale.setScalar(x.size * 2 * (1 + 1.8 * (1 - ease(at(k, 0.12, 0.5))))); x.frost.material.opacity = 0.8 * Math.sin(Math.PI * at(k, 0.12, 0.55));
        x.halo.position.copy(pos); x.halo.scale.setScalar(x.size * 3.4); x.halo.material.opacity = 0.35 * grow * alpha;
        // star glints twinkle on their facets once it has set
        const live = at(k, 0.42, 0.5) * alpha;
        for (const g of x.glints) {
            const tw = Math.max(0, Math.sin((k * g.sp * 6 + g.ph) * 6.283)) ** 2;
            g.position.copy(x.v.copy(g.at).applyQuaternion(x.q).multiplyScalar(s).add(pos)); g.position.y += 0.6;
            g.scale.setScalar(0.4 + 2.2 * tw); g.material.opacity = tw * live; g.material.rotation += x.dt * 0.6;
        }
        // the parting flash
        const fl = Math.sin(Math.PI * at(k, 0.84, 0.95));
        x.flash.position.copy(pos); x.flash.position.y += 0.8; x.flash.scale.setScalar(x.size * (2 + 7 * at(k, 0.84, 0.95))); x.flash.material.opacity = fl;
    },
    end(x) {
        x.mesh.material = x.mat0; x.mats.forEach((m) => m.dispose());
        x.kids.forEach(([c, v]) => (c.visible = v));
        x.mesh.scale.copy(x.s0); x.mesh.quaternion.copy(x.q0); x.mesh.visible = x.vis0; x.mesh.castShadow = true;
        for (const o of x.own) { x.scene.remove(o); o.material.dispose(); }
        x.geo.dispose(); x.edges.geometry.dispose(); x.own = [];
    },
};

export default { nat20 };
