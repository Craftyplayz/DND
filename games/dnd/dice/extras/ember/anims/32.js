// Ember Cage exits 32, Metaballs: the die glows and dissolves into round magma blobs that ooze apart and merge into a smooth pool,
// which crusts over to dark stone with glowing cracks and dissolves into ash. The camera looks straight down, so the melt is a flat
// shader-drawn metaball field on the table: every outline is a smooth curve however far it spreads.
const NB = 7;
const VERT = `varying vec2 vP; uniform float uHalf;
void main() { vP = (uv - 0.5) * 2.0 * uHalf; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FRAG = `varying vec2 vP;
uniform vec3 uB[${NB}]; uniform float uHeat, uCool, uCrackOut, uFade, uTime, uR, uAlpha;
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p *= 2.03; a *= 0.5; } return s; }
// distance to the nearest crack: the edges between soft round cells
float cracks(vec2 p) { vec2 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 g = vec2(x, y), o = vec2(h21(i + g), h21(i + g + 17.0));
        float d = length(g + o - f); if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d; }
    return d2 - d1; }
void main() {
    // the field: each blob adds r^2/d^2, so nearby blobs bridge into one smooth surface
    float f = 0.0; vec2 grad = vec2(0.0);
    for (int i = 0; i < ${NB}; i++) { vec2 d = vP - uB[i].xy; float r2 = uB[i].z * uB[i].z, q = dot(d, d) + 1e-4; f += r2 / q; grad -= 2.0 * r2 * d / (q * q); }
    // capped, so the edge smoothing never blows up near a blob's centre
    float fc = min(f, 3.0), w = fwidth(fc) * 1.2, inside = smoothstep(1.0 - w, 1.0 + w, fc);
    if (inside <= 0.0) discard;
    // how thick the melt is here: thin at the rim, thick in the middle
    // (1 - 1/f is a smooth dome over every blob and stays smooth where they merge, with no hot spot at each centre)
    float g = 1.0 - 1.0 / f, h = smoothstep(0.0, 0.85, g);
    vec3 n = normalize(vec3(-grad / (f * f) * uR * 0.9, 1.0));
    // magma: glowing from inside, brighter where thick, with slow flowing veins
    vec2 q = vP / uR;
    float vein = fbm(q * 2.2 + vec2(uTime * 0.35, -uTime * 0.25) + fbm(q * 1.4 - uTime * 0.2) * 1.5);
    vec3 deep = vec3(0.55, 0.08, 0.02), mid = vec3(1.0, 0.42, 0.06), hot = vec3(1.0, 0.86, 0.45);
    vec3 magma = mix(deep, mid, smoothstep(0.0, 0.35, h));
    magma = mix(magma, hot, smoothstep(0.35, 1.0, h) * (0.55 + 0.45 * uHeat) + smoothstep(0.55, 0.8, vein) * 0.5);
    // a wet sheen from the light above and to one side
    vec3 L = normalize(vec3(-0.45, 0.55, 0.7)); float spec = pow(max(dot(reflect(-L, n), vec3(0, 0, 1)), 0.0), 28.0);
    magma += spec * 0.6 * (1.0 - uCool);
    // the crust forms from the thin rim inwards: dark stone with soft grain, glowing cracks that dim last
    float crust = smoothstep(0.0, 0.25, uCool * 1.35 - h * 0.45);
    vec3 stone = vec3(0.13, 0.1, 0.09) * (0.75 + 0.5 * fbm(q * 5.0)) + max(dot(n, L), 0.0) * 0.05;
    // big cells with wavy edges, so the cracks curve instead of running straight
    float c = cracks(q * 1.5 + vec2(fbm(q * 2.4), fbm(q * 2.4 + 7.3)) * 1.1), glow = (1.0 - smoothstep(0.0, 0.09, c)) * (1.0 - uCrackOut);
    stone += glow * mix(vec3(1.0, 0.35, 0.05), vec3(1.0, 0.7, 0.3), h);
    vec3 col = mix(magma, stone, crust);
    // ash: greys out and dissolves in soft patches
    float ash = fbm(q * 3.5 + 3.1);
    col = mix(col, vec3(0.42, 0.4, 0.39) * (0.7 + 0.4 * ash), smoothstep(0.0, 0.6, uFade));
    float a = inside * uAlpha * smoothstep(uFade * 1.25 - 0.15, uFade * 1.25 + 0.05, ash);
    gl_FragColor = vec4(pow(col, vec3(2.2)), a);
    #include <colorspace_fragment>
}`;
let FX = null;
function fx(T) {
    if (FX) return FX;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return (FX = { soft: new T.CanvasTexture(c), plane: new T.PlaneGeometry(1, 1) });
}
const clamp = (v) => Math.max(0, Math.min(1, v));
const ss = (k, a, b) => { const t = clamp((k - a) / (b - a)); return t * t * (3 - 2 * t); };

const metaballs = {
    key: 'a32-melt-metaballs', name: 'Metaball Melt', blurb: 'The die dissolves into round magma blobs that ooze apart and merge into a smooth glowing pool, then crust over and crumble to ash.',
    dur: 3.6,
    start(x) {
        const T = x.THREE, p = x.mesh.geometry.attributes.position, v = new T.Vector3(), q = x.mesh.quaternion;
        x.own = [];
        // the die's footprint seen from above, so the first blob covers it exactly
        let R = 0; for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyQuaternion(q); R = Math.max(R, Math.hypot(v.x, v.z)); }
        x.R = R *= 0.92; x.o = x.mesh.position.clone();
        // the die fades out on its own copies of the materials (they're shared by every die of this kind)
        x.mats0 = x.mesh.material; x.mats = [].concat(x.mats0).map((m) => { const c = m.clone(); c.transparent = true; return c; });
        x.mesh.material = Array.isArray(x.mats0) ? x.mats : x.mats[0];
        x.kids = x.mesh.children.map((c) => [c, c.visible]);
        // the blobs: one in the middle the size of the die, the rest start inside it and ooze out on their own paths
        const a0 = Math.random() * 6.283;
        x.balls = [{ d: 0, a: 0, r0: R * 0.98, r1: R * 0.72 }];
        for (let i = 1; i < NB; i++) x.balls.push({ a: a0 + (i / (NB - 1)) * 6.283 + (Math.random() - 0.5) * 0.7, d: R * (1.05 + Math.random() * 0.8), r0: R * 0.3, r1: R * (0.42 + Math.random() * 0.22), wob: Math.random() * 6.283, slow: 0.7 + Math.random() * 0.5 });
        const half = R * 4.2;
        x.u = { uB: { value: Array.from({ length: NB }, () => new T.Vector3()) }, uHeat: { value: 0 }, uCool: { value: 0 }, uCrackOut: { value: 0 }, uFade: { value: 0 }, uTime: { value: 0 }, uR: { value: R }, uAlpha: { value: 0 }, uHalf: { value: half } };
        x.pool = new T.Mesh(fx(T).plane, new T.ShaderMaterial({ uniforms: x.u, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false }));
        x.pool.rotation.x = -Math.PI / 2; x.pool.scale.setScalar(half * 2); x.pool.position.set(x.o.x, 0.04, x.o.z); x.pool.renderOrder = 1;
        x.scene.add(x.pool); x.own.push(x.pool);
        x.glow = new T.Sprite(new T.SpriteMaterial({ map: fx(T).soft, color: 0xff6a18, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
        x.glow.position.set(x.o.x, 0.02, x.o.z); x.scene.add(x.glow); x.own.push(x.glow);
    },
    tick(k, x) {
        const heat = ss(k, 0, 0.18), swap = ss(k, 0.1, 0.3), ooze = ss(k, 0.22, 0.7), cool = ss(k, 0.62, 0.84);
        // the die heats up and dissolves into the first blob before anything moves, so its numbers never bend
        for (const m of x.mats) { if (m.emissive) m.emissive.setRGB(heat * 0.85, heat * 0.32, heat * 0.05); m.opacity = 1 - swap; }
        x.mesh.castShadow = swap < 0.5; x.mesh.visible = swap < 0.99;
        for (const [c, vis] of x.kids) c.visible = vis && swap < 0.6;
        // the blobs drift out, swelling and wobbling while liquid, and hold still once the crust has formed
        const t = x.sec || 0, live = 1 - cool;
        x.balls.forEach((b, i) => {
            const e = ooze ** (b.slow || 1), wob = b.wob === undefined ? 0 : Math.sin(t * 1.7 + b.wob) * 0.12 * live * ooze;
            const d = b.d * e * (1 + wob), a = b.a + (b.wob === undefined ? 0 : 0.25 * e);
            x.u.uB.value[i].set(Math.cos(a) * d, Math.sin(a) * d, b.r0 + (b.r1 - b.r0) * ooze + x.R * 0.03 * Math.sin(t * 2.3 + i) * live * ooze);
        });
        Object.assign(x.u.uHeat, { value: heat * (1 - cool) }); x.u.uCool.value = cool; x.u.uCrackOut.value = ss(k, 0.76, 0.9);
        x.u.uFade.value = ss(k, 0.84, 0.99); x.u.uTime.value = k * 3.6; x.u.uAlpha.value = swap;
        // warm light on the table while it is molten
        x.glow.scale.setScalar(x.R * (3 + 4 * ooze)); x.glow.material.opacity = 0.55 * heat * (1 - cool * 0.9) * (1 - x.u.uFade.value);
    },
    end(x) {
        x.mesh.material = x.mats0; x.mesh.visible = true; x.mats.forEach((m) => m.dispose()); x.mesh.castShadow = true;
        for (const [c, vis] of x.kids) c.visible = vis;
        for (const o of x.own || []) { x.scene.remove(o); o.material.dispose(); }
        x.own = [];
    },
};

export default { mid: metaballs };
