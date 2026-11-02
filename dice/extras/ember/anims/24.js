// Ember Cage exits 24, Pahoehoe: a magma skin floods over the numbers, the die slumps and spreads in toes, the surface wrinkles into coiled ropes that harden into black crust, then ash fades.
let FX = null;
function fx(T) {
    if (FX) return FX;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return (FX = { soft: new T.CanvasTexture(c), plane: new T.PlaneGeometry(1, 1) });
}
// a copy of a die's geometry with every triangle split into 4^n (same trick as Melt, face groups scale by 4^n)
function subdivide(geo, n) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (let l = 0; l < n; l++) {
        const out = new g.constructor(), names = Object.keys(g.attributes);
        for (const name of names) {
            const a = g.attributes[name], s = a.itemSize, src = a.array, dst = new Float32Array(src.length * 4);
            let o = 0;
            for (let t = 0; t < a.count; t += 3) {
                const P = (i) => src.subarray((t + i) * s, (t + i + 1) * s), A = P(0), B = P(1), C = P(2);
                const M = (u, v) => Array.from(u, (x, j) => (x + v[j]) / 2), ab = M(A, B), bc = M(B, C), ca = M(C, A);
                for (const tri of [[A, ab, ca], [ab, B, bc], [ca, bc, C], [ab, bc, ca]]) for (const p of tri) { dst.set(p, o); o += s; }
            }
            out.setAttribute(name, new a.constructor(dst, s));
        }
        for (const gr of g.groups) out.addGroup(gr.start * 4, gr.count * 4, gr.materialIndex);
        if (g !== geo) g.dispose(); g = out;
    }
    return g;
}
const ease = (k) => 1 - (1 - k) ** 3;
const at = (k, a, b) => Math.max(0, Math.min(1, (k - a) / (b - a)));
// the skin is painted in table space (not on the die's UVs), so the numbers can't show or stretch through it
const VS = 'varying vec2 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }';
const FS = `varying vec2 vW; uniform vec2 uC; uniform float uR, uT, uWr, uCool, uAsh, uAlpha, uHeat;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f); return mix(mix(h(i), h(i + vec2(1., 0.)), f.x), mix(h(i + vec2(0., 1.)), h(i + vec2(1., 1.)), f.x), f.y); }
float fb(vec2 p){ return .5 * n(p) + .3 * n(p * 2.1 + 7.) + .2 * n(p * 4.3 + 3.); }
void main(){
    vec2 d = (vW - uC) / uR; float r = length(d);
    // churning molten colour
    float sw = fb(d * 2.4 + vec2(uT * .25, -uT * .18));
    vec3 hot = mix(vec3(1., .3, .03), vec3(1., .86, .38), sw * sw * 1.6 + uHeat * .25);
    // coiled ropes: arcs across the flow, warped by noise so they fold and buckle, creeping outward while liquid
    float ph = r * 2.6 + (fb(d * 1.4 + 5.) - .5) * 3.4 * uWr - uT * .5 * (1. - uCool) * uWr;
    float rope = 1. - abs(sin(ph * 3.1416));
    float gap = pow(rope, 2.5) * uWr;
    // fine cross-wrinkles on every rope
    float fine = fb(vec2(atan(d.y, d.x) * 6., ph * 3.)) * uWr;
    vec3 skin = mix(hot, hot * vec3(.55, .3, .25), uWr * .75);
    skin = mix(skin, vec3(.5, .06, .015), smoothstep(0., .5, uCool));
    skin = mix(skin, vec3(.11, .1, .1) + .16 * fine * (1. - rope) + .08 * rope, smoothstep(.35, .9, uCool));
    // gaps between folds stay glowing, and dim last
    vec3 c = skin + vec3(1., .52, .1) * gap * (1.15 - smoothstep(.65, 1., uCool)) * (1. - .3 * smoothstep(.2, .7, uCool)) * (.7 + .5 * sw);
    c = mix(c, vec3(.22, .21, .2) * (.6 + .6 * fine), uAsh);
    // fade: dissolve through the noise
    float al = clamp(uAlpha * 1.5 - (1. - uAlpha) * fb(d * 3.) * 1., 0., 1.);
    gl_FragColor = vec4(c, al);
}`;

const melt = {
    key: 'a24-melt-pahoehoe', name: 'Pahoehoe Melt', blurb: 'Magma floods over the die, which spreads into toes of ropy lava that wrinkle, harden to black crust and fade to ash.',
    dur: 3.6,
    start(x) {
        const T = x.THREE; x.own = [];
        // the geometry is shared by every die of this kind, so we bend a copy and end() puts the original back
        x.geo0 = x.mesh.geometry; x.geo = subdivide(x.geo0, 2); x.mesh.geometry = x.geo;
        x.overlays = x.mesh.children.filter((c) => c.isMesh); x.overlays.forEach((c) => (c.geometry = x.geo));
        // every vertex in table space, the lowest and highest points, and the widest reach (everything is sized from these)
        const p = x.geo.attributes.position, q = x.mesh.quaternion, v = new T.Vector3();
        x.qi = q.clone().invert(); x.w0 = []; let lo = Infinity, hi = -Infinity, rad = 0;
        for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyQuaternion(q); x.w0.push(v.clone()); lo = Math.min(lo, v.y); hi = Math.max(hi, v.y); rad = Math.max(rad, Math.hypot(v.x, v.z)); }
        x.lo = lo; x.tall = hi - lo; x.rad = rad;
        // the magma skin: the same bending geometry, drawn over the die's faces
        const u = { uC: { value: new T.Vector2() }, uR: { value: rad }, uT: { value: 0 }, uWr: { value: 0 }, uCool: { value: 0 }, uAsh: { value: 0 }, uAlpha: { value: 1 }, uHeat: { value: 0 } };
        x.skin = new T.Mesh(x.geo, new T.ShaderMaterial({ uniforms: u, vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
        x.skin.frustumCulled = false; x.skin.visible = false; x.scene.add(x.skin); x.own.push(x.skin); x.u = u;
        x.vis0 = x.mesh.visible; x.ov0 = x.overlays.map((c) => c.visible);
        // soft heat halo on the table under the die
        x.halo = new T.Mesh(fx(T).plane, new T.MeshBasicMaterial({ map: fx(T).soft, color: 0xff6a10, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
        x.halo.rotation.x = -Math.PI / 2; x.halo.position.set(x.mesh.position.x, 0.04, x.mesh.position.z); x.halo.scale.setScalar(0.1); x.scene.add(x.halo); x.own.push(x.halo);
        // steam: grey puffs that drift outward along the table (the camera can't see them rise)
        const n = 18; x.sp = new Float32Array(n * 3); x.sd = [];
        for (let i = 0; i < n; i++) { const a = Math.random() * 6.283; x.sd.push([Math.cos(a), Math.sin(a), 0.3 + Math.random() * 0.7, Math.random() * 0.4]); }
        const sg = new T.BufferGeometry(); sg.setAttribute('position', new T.BufferAttribute(x.sp, 3));
        x.steam = new T.Points(sg, new T.PointsMaterial({ map: fx(T).soft, color: 0xb8b2ac, size: 26, sizeAttenuation: false, transparent: true, depthWrite: false, opacity: 0 }));
        x.steam.frustumCulled = false; x.scene.add(x.steam); x.own.push(x.steam);
    },
    tick(k, x) {
        // a see-through die still casts a shadow, so it stops once the pool is flat and fading
        x.mesh.castShadow = k < 0.8;
        // the set's own sparks would float on alone at the end
        for (const c of x.mesh.children) if (c.isPoints) c.visible = k < 0.85;
        const u = x.u, o = x.mesh.position, p = x.geo.attributes.position, v = new x.THREE.Vector3();
        const flood = at(k, 0.04, 0.2), m = ease(at(k, 0.22, 0.72)), cool = at(k, 0.46, 0.9), fade = at(k, 0.9, 1);
        // the skin follows the die; it is solid before the shape bends, so the numbers are gone by then
        x.skin.position.copy(o); x.skin.quaternion.copy(x.mesh.quaternion); x.skin.scale.copy(x.mesh.scale); x.skin.visible = k < 0.995 && flood > 0;
        if (flood >= 1) { x.mesh.visible = false; x.overlays.forEach((c) => (c.visible = false)); }
        u.uC.value.set(o.x, o.z); u.uT.value = k * 3.6;
        u.uHeat.value = flood * (1 - cool); u.uWr.value = at(k, 0.25, 0.7); u.uCool.value = cool; u.uAsh.value = at(k, 0.9, 1); u.uAlpha.value = 1 - fade;
        for (let i = 0; i < p.count; i++) {
            const w = x.w0[i], h = (w.y - x.lo) / x.tall, a = Math.atan2(w.z, w.x);
            // the top sags first, each spot at its own speed (taken from where it is, so split vertices stay joined)
            const wob = 0.75 + 0.25 * Math.sin(w.x * 5.1 / x.rad * 0.8 + w.z * 3.7 / x.rad * 0.8) * Math.cos(w.z * 4.3 / x.rad - w.x * 2.2 / x.rad);
            const s = Math.min(1, m * wob * (0.7 + 0.5 * h));
            // pahoehoe spreads in rounded toes that bud off the edge: uneven lobes plus a small scallop
            const lobe = 1 + 0.3 * Math.sin(3 * a + 1.3) + 0.18 * Math.sin(5 * a + 0.4) + 0.1 * Math.sin(9 * a + 2.1) * m;
            const nh = h * (1 - s) ** 1.6 * (1 - cool * 0.9), spread = 1 + s * (1.15 - nh) * 1.5 * lobe + cool * 0.15 * lobe;
            v.set(w.x * spread, x.lo + nh * x.tall + 0.01, w.z * spread).applyQuaternion(x.qi);
            p.setXYZ(i, v.x, v.y, v.z);
        }
        p.needsUpdate = true; x.geo.computeBoundingSphere();
        x.halo.scale.setScalar(x.rad * (2.5 + m * 4.5)); x.halo.material.opacity = 0.75 * Math.min(1, flood + m) * (1 - cool * 0.85) * (1 - fade);
        // steam drifts out across the cooling stone
        const st = at(k, 0.6, 0.78) * (1 - at(k, 0.93, 1)), t = at(k, 0.6, 1);
        for (let i = 0; i < x.sd.length; i++) { const d = x.sd[i], r = x.rad * (0.8 + d[2] * 1.8 + t * d[2] * 1.6); x.sp[i * 3] = o.x + d[0] * r; x.sp[i * 3 + 1] = o.y + 0.5; x.sp[i * 3 + 2] = o.z + d[1] * r; }
        x.steam.geometry.attributes.position.needsUpdate = true; x.steam.material.opacity = 0.22 * st;
    },
    end(x) {
        x.mesh.castShadow = true; for (const c of x.mesh.children) if (c.isPoints) c.visible = true;
        x.mesh.geometry = x.geo0; x.overlays.forEach((c, i) => { c.geometry = x.geo0; c.visible = x.ov0[i]; }); x.mesh.visible = x.vis0; x.geo.dispose();
        for (const o of x.own || []) { x.scene.remove(o); o.material.dispose(); if (o.isPoints) o.geometry.dispose(); }
        x.own = [];
    },
};

export default { mid: melt };
