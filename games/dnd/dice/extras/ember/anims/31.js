// Ember Cage exits 31, Slow Melt: a calm, real-looking melt. Heat shimmer, the die sinks into glowing magma, which spreads very slowly
// into a soft rounded pool of plates with bright seams, crusts over with a dull red glow beneath, then fades to ash.
// The camera looks straight down, so the pool is a flat shader-drawn field of a few merging blobs: every outline stays a smooth curve.
const NB = 5;
const VERT = `varying vec2 vP; uniform float uHalf;
void main() { vP = (uv - 0.5) * 2.0 * uHalf; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FRAG = `varying vec2 vP;
uniform vec3 uB[${NB}]; uniform float uHeat, uCool, uCrackOut, uFade, uTime, uR, uAlpha;
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p *= 2.03; a *= 0.5; } return s; }
// distance to the nearest seam between soft round cells, and a per-cell shade
vec2 cells(vec2 p) { vec2 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0, t = 0.0;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 g = vec2(x, y), o = vec2(h21(i + g), h21(i + g + 17.0));
        float d = length(g + o - f); if (d < d1) { d2 = d1; d1 = d; t = h21(i + g + 5.0); } else if (d < d2) d2 = d; }
    return vec2(d2 - d1, t); }
void main() {
    // heat shimmer: the surface wavers slightly while it is hot
    vec2 P = vP + uR * 0.02 * uHeat * vec2(sin(vP.y / uR * 9.0 + uTime * 5.0), cos(vP.x / uR * 8.0 - uTime * 4.0));
    float f = 0.0; vec2 grad = vec2(0.0);
    for (int i = 0; i < ${NB}; i++) { vec2 d = P - uB[i].xy; float r2 = uB[i].z * uB[i].z, q = dot(d, d) + 1e-4; f += r2 / q; grad -= 2.0 * r2 * d / (q * q); }
    // capped, so the edge smoothing never blows up near a blob's centre
    float fc = min(f, 3.0), w = fwidth(fc) * 1.2, inside = smoothstep(1.0 - w, 1.0 + w, fc);
    if (inside <= 0.0) discard;
    // 1 - 1/f is a smooth dome that stays smooth where the blobs merge: thin at the rim, thick in the middle
    float h = smoothstep(0.0, 0.85, 1.0 - 1.0 / f);
    vec3 n = normalize(vec3(-grad / (f * f) * uR * 0.7, 1.0)), L = normalize(vec3(-0.45, 0.55, 0.7));
    // plates of magma with bright seams; the seams wave, so nothing runs straight
    vec2 q = P / uR, warp = vec2(fbm(q * 2.0 + uTime * 0.08), fbm(q * 2.0 + 7.3 - uTime * 0.06)) * 1.2;
    vec2 cl = cells(q * 1.7 + warp);
    float seam = 1.0 - smoothstep(0.0, 0.16, cl.x);
    vec3 HOT = vec3(1.0, 0.78, 0.45), RED = vec3(0.62, 0.1, 0.03), STONE = vec3(0.09, 0.11, 0.14), ASH = vec3(0.42, 0.43, 0.46);
    vec3 plate = mix(vec3(0.95, 0.42, 0.1), HOT, 0.35 + 0.45 * cl.y) * (0.82 + 0.18 * fbm(q * 4.0));
    vec3 hotCol = mix(plate, vec3(1.0, 0.92, 0.65), seam * 0.6);
    // cooling: hot plates dull to deep red, then black stone from the rim in, with the seams glowing red underneath and dimming last
    float crust = smoothstep(0.0, 0.3, uCool * 1.3 - h * 0.35);
    vec3 col = mix(hotCol, RED * (0.8 + 0.3 * cl.y), smoothstep(0.0, 0.55, uCool));
    vec3 stone = STONE * (0.8 + 0.45 * fbm(q * 5.0)) + max(dot(n, L), 0.0) * 0.04;
    stone += seam * (1.0 - uCrackOut) * vec3(0.9, 0.22, 0.04) + (1.0 - uCrackOut) * 0.08 * vec3(0.6, 0.08, 0.02);
    col = mix(col, stone, crust);
    // light: a soft sheen while liquid, and a darker thin rim
    col *= 0.72 + 0.28 * smoothstep(0.0, 0.5, h);
    col += pow(max(dot(reflect(-L, n), vec3(0, 0, 1)), 0.0), 24.0) * 0.35 * (1.0 - uCool);
    // ash: greys out and dissolves in soft patches
    float ash = fbm(q * 3.5 + 3.1);
    col = mix(col, ASH * (0.75 + 0.35 * ash), smoothstep(0.0, 0.6, uFade) * 0.8);
    float a = inside * uAlpha * smoothstep(uFade * 1.25 - 0.15, uFade * 1.25 + 0.05, ash);
    gl_FragColor = vec4(pow(col, vec3(2.2)), a);
    #include <colorspace_fragment>
}`;
let FX = null;
function fx(T) {
    if (FX) return FX;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return (FX = { soft: new T.CanvasTexture(c), plane: new T.PlaneGeometry(1, 1) });
}
const rng = (s) => () => ((s = (s * 16807) % 2147483647) / 2147483647);
const at = (k, a, b) => Math.max(0, Math.min(1, (k - a) / (b - a)));
const ss = (k, a, b) => { const t = at(k, a, b); return t * t * (3 - 2 * t); };

const melt = {
    key: 'a31-melt-slow', name: 'Slow Melt', blurb: 'A calm, real melt: the die shimmers, sinks into magma, spreads slowly into a soft rounded pool, crusts over with a dull red glow beneath, and fades to ash.',
    dur: 4,
    start(x) {
        const T = x.THREE, F = fx(T), p = x.mesh.geometry.attributes.position, v = new T.Vector3(), q = x.mesh.quaternion;
        x.own = [];
        // the die's footprint seen from above, so the first blob covers it exactly
        let R = 0; for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyQuaternion(q); R = Math.max(R, Math.hypot(v.x, v.z)); }
        x.R = R *= 0.92; x.o = x.mesh.position.clone();
        // the die heats and fades on its own copies of the materials (they're shared by every die of this kind)
        x.mats0 = x.mesh.material; x.mats = [].concat(x.mats0).map((m) => { const c = m.clone(); c.transparent = true; return c; });
        x.mesh.material = Array.isArray(x.mats0) ? x.mats : x.mats[0];
        x.kids = x.mesh.children.map((c) => [c, c.visible]);
        // one blob the size of the die, and a few that drift a little way out: a calm pool with soft, unhurried lobes
        const r = rng(5 + Math.round(Math.abs(x.o.x * 97 + x.o.z * 31)) % 1000), a0 = r() * 6.283;
        x.balls = [{ a: 0, d: 0, r0: R * 0.98, r1: R * 1.02 }];
        for (let i = 1; i < NB; i++) x.balls.push({ a: a0 + (i / (NB - 1)) * 6.283 + (r() - 0.5) * 0.9, d: R * (0.75 + r() * 0.55), r0: R * 0.3, r1: R * (0.55 + r() * 0.2), slow: 0.8 + r() * 0.4 });
        const half = R * 3.6;
        x.u = { uB: { value: Array.from({ length: NB }, () => new T.Vector3()) }, uHeat: { value: 0 }, uCool: { value: 0 }, uCrackOut: { value: 0 }, uFade: { value: 0 }, uTime: { value: 0 }, uR: { value: R }, uAlpha: { value: 0 }, uHalf: { value: half } };
        const add = (o) => { x.scene.add(o); x.own.push(o); return o; };
        x.pool = add(new T.Mesh(F.plane, new T.ShaderMaterial({ uniforms: x.u, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false })));
        x.pool.rotation.x = -Math.PI / 2; x.pool.scale.setScalar(half * 2); x.pool.position.set(x.o.x, 0.04, x.o.z); x.pool.renderOrder = 1;
        // the glow on the table under the pool, dull and red
        x.glow = add(new T.Mesh(F.plane, new T.MeshBasicMaterial({ map: F.soft, color: 0xff6010, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0 })));
        x.glow.rotation.x = -Math.PI / 2; x.glow.position.set(x.o.x, 0.02, x.o.z);
        // heat shimmer: a pale warm haze that breathes around the die
        x.haze = add(new T.Sprite(new T.SpriteMaterial({ map: F.soft, color: 0xffb070, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0 }))); x.haze.position.copy(x.o);
        // steam: a few soft grey puffs that drift outward and thin out
        x.n = 14; x.sp = new Float32Array(x.n * 3); x.sv = [];
        for (let i = 0; i < x.n; i++) { const a = r() * 6.283; x.sv.push([Math.cos(a), Math.sin(a), 0.4 + r() * 0.6, r() * 0.35]); }
        const sg = new T.BufferGeometry(); sg.setAttribute('position', new T.BufferAttribute(x.sp, 3));
        x.steam = add(new T.Points(sg, new T.PointsMaterial({ map: F.soft, color: 0xcfc8c2, size: 22, sizeAttenuation: false, transparent: true, depthWrite: false, opacity: 0 }))); x.steam.frustumCulled = false;
    },
    tick(k, x) {
        const R = x.R, heat = ss(k, 0, 0.14), swap = ss(k, 0.07, 0.25), sag = ss(k, 0.25, 0.68), cool = ss(k, 0.5, 0.8), fade = ss(k, 0.82, 0.97), ph = k * 5;
        // the numbers sink first: the die's faces heat up and fade into the first blob before anything spreads
        for (const m of x.mats) { if (m.emissive) m.emissive.setRGB(heat * 0.9, heat * 0.3, 0.03); m.opacity = 1 - swap; }
        x.mesh.castShadow = swap < 0.5; x.mesh.visible = swap < 0.99;
        for (const [c, vis] of x.kids) c.visible = vis && swap < 0.6;
        // the pool spreads very slowly, its lobes easing out and swaying while liquid, then holds still under the crust
        const live = 1 - cool;
        x.balls.forEach((b, i) => {
            const e = sag ** (b.slow || 1), sway = i ? 0.1 * Math.sin(ph * 0.9 + i * 2.1) * live * sag : 0;
            x.u.uB.value[i].set(Math.cos(b.a + sway) * b.d * e, Math.sin(b.a + sway) * b.d * e, b.r0 + (b.r1 - b.r0) * sag + R * 0.02 * Math.sin(ph * 1.3 + i) * live * sag);
        });
        x.u.uHeat.value = heat * live; x.u.uCool.value = cool; x.u.uCrackOut.value = ss(k, 0.7, 0.92); x.u.uFade.value = fade; x.u.uTime.value = ph; x.u.uAlpha.value = swap;
        // table glow: warm while liquid, then a dull red that outlasts the heat
        x.glow.material.opacity = (0.15 + 0.45 * heat) * (1 - 0.35 * cool) * (1 - fade);
        x.glow.material.color.setRGB(1, 0.5 - 0.3 * cool, 0.1 - 0.07 * cool); x.glow.scale.setScalar(R * (2.4 + 3.4 * sag + 0.6 * cool));
        x.haze.scale.setScalar(R * (3.2 + 0.25 * Math.sin(ph * 9) + 1.5 * sag)); x.haze.material.opacity = 0.22 * heat * live * (1 + 0.25 * Math.sin(ph * 11));
        // steam: starts as the crust forms, drifts outward and rises, gone by the end
        const st = at(k, 0.5, 1), sp = x.sp;
        for (let i = 0; i < x.n; i++) { const d = x.sv[i], t = Math.max(0, st - d[3]), rr = R * (0.5 + 1.8 * t * d[2]); sp[i * 3] = x.o.x + d[0] * rr; sp[i * 3 + 1] = x.o.y + 0.5 + t * 2; sp[i * 3 + 2] = x.o.z + d[1] * rr; }
        x.steam.geometry.attributes.position.needsUpdate = true; x.steam.material.opacity = 0.16 * ss(k, 0.5, 0.65) * (1 - ss(k, 0.85, 0.97));
    },
    end(x) {
        x.mesh.material = x.mats0; x.mesh.visible = true; x.mesh.castShadow = true; x.mats.forEach((m) => m.dispose());
        for (const [c, vis] of x.kids) c.visible = vis;
        for (const o of x.own || []) { x.scene.remove(o); o.material.dispose(); if (o.isPoints) o.geometry.dispose(); }
        x.own = [];
    },
};

export default { mid: melt };
