// Ember Cage exits 41: nat 20 Midas Touch (polished gold creeps over the die from one side until it is solid shining gold with a sweeping shine, then it bursts into spinning gold coins that scatter, glint and fade).
const GOLD_V = `varying vec3 vN; varying vec3 vW;
void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`;
// uK = how much is covered, uDir/uLo/uHi = the sweep across the table, uShine = 0..1 position of the shine band
const GOLD_F = `uniform float uK, uLo, uHi, uShine; uniform vec2 uDir; varying vec3 vN; varying vec3 vW;
void main() {
    float t = (dot(vW.xz, uDir) - uLo) / (uHi - uLo);
    float wob = 0.06 * sin(vW.x * 9.0 + vW.z * 7.0) + 0.05 * sin(vW.z * 13.0 - vW.x * 5.0);
    float edge = uK * 1.3 - 0.15 - (t + wob);
    if (edge < 0.0) discard;
    vec3 n = normalize(vN), l = normalize(vec3(0.3, 1.0, 0.4));
    float d = max(dot(n, l), 0.0), s = pow(max(dot(n, normalize(l + vec3(0.0, 1.0, 0.0))), 0.0), 24.0);
    vec3 col = mix(vec3(0.55, 0.32, 0.04), vec3(1.0, 0.82, 0.36), 0.35 + 0.65 * d) + vec3(1.0, 0.95, 0.7) * s * 0.8;
    col += vec3(1.0, 0.7, 0.2) * (1.0 - smoothstep(0.0, 0.12, edge)) * 0.9; // molten leading edge
    float band = smoothstep(0.12, 0.0, abs(t - uShine)); // sweeping shine
    col += vec3(1.0, 0.97, 0.8) * band * 0.9;
    gl_FragColor = vec4(col, 1.0);
}`;
let SOFT = null;
const soft = (T) => {
    if (SOFT) return SOFT;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return (SOFT = new T.CanvasTexture(c));
};
const at = (k, a, b) => Math.max(0, Math.min(1, (k - a) / (b - a)));
const ease = (k) => 1 - (1 - k) ** 3;

function cleanup(x) {
    for (const o of x.own || []) { x.scene.remove(o); o.parent?.remove(o); o.material?.dispose?.(); }
    x.cgeo?.dispose();
    x.own = []; x.cgeo = null;
    x.mesh.visible = true; x.mesh.castShadow = true;
}

const nat20 = {
    key: 'a41-midas-touch', name: 'Midas Touch', dur: 3.4,
    blurb: 'Polished gold creeps over the die from one side until it is solid shining gold, then it bursts into spinning coins that scatter across the table.',
    start(x) {
        const T = x.THREE, a = Math.random() * 6.283, p = x.mesh.position;
        x.own = []; x.dir = new T.Vector2(Math.cos(a), Math.sin(a));
        const mid = p.x * x.dir.x + p.z * x.dir.y;
        x.gold = new T.Mesh(x.mesh.geometry, new T.ShaderMaterial({ vertexShader: GOLD_V, fragmentShader: GOLD_F, uniforms: { uK: { value: 0 }, uLo: { value: mid - 1.3 }, uHi: { value: mid + 1.3 }, uShine: { value: -1 }, uDir: { value: x.dir } } }));
        x.gold.scale.setScalar(1.012); x.mesh.add(x.gold); x.own.push(x.gold);
        const glow = (c) => { const s = new T.Sprite(new T.SpriteMaterial({ map: soft(T), color: c, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0 })); s.position.copy(p); x.scene.add(s); x.own.push(s); return s; };
        x.halo = glow(0xffc840); x.flash = glow(0xfff0b0);
        // coins: thin discs, each with its own scatter, spin axis and settle spot
        x.cgeo = new T.CylinderGeometry(0.28, 0.28, 0.05, 20);
        x.coins = [];
        for (let i = 0; i < 26; i++) {
            const m = new T.Mesh(x.cgeo, new T.MeshBasicMaterial({ color: 0xffc840, transparent: true })); m.visible = false; x.scene.add(m); x.own.push(m);
            const ang = Math.random() * 6.283, r = 1 + Math.random() * 4.5;
            x.coins.push({ m, dx: Math.cos(ang) * r, dz: Math.sin(ang) * r, ax: new T.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize(), sp: 10 + Math.random() * 14, h: 1.2 + Math.random() * 1.6, ph: Math.random() * 6.283, last: 0.6 + Math.random() * 0.2 });
        }
        x.q = new T.Quaternion(); x.qf = new T.Quaternion();
    },
    tick(k, x) {
        const u = x.gold.material.uniforms, p = x.mesh.position, creep = at(k, 0.02, 0.4), burst = at(k, 0.5, 1);
        u.uK.value = creep;
        u.uShine.value = k > 0.38 && k < 0.5 ? -0.3 + at(k, 0.38, 0.5) * 1.6 : -1;
        x.halo.position.copy(p); x.halo.scale.setScalar(3 + 2 * creep);
        x.halo.material.opacity = k < 0.5 ? 0.45 * creep : 0.45 * (1 - at(k, 0.5, 0.65));
        x.flash.position.copy(p); x.flash.scale.setScalar(2 + ease(at(k, 0.5, 0.7)) * 9); x.flash.material.opacity = k < 0.5 ? 0 : 1 - at(k, 0.5, 0.7);
        x.mesh.visible = k < 0.5; // the whole die is a coin spray from here
        for (const c of x.coins) {
            c.m.visible = k >= 0.5;
            if (k < 0.5) continue;
            const e = ease(at(k, 0.5, 0.5 + c.last * 0.5)), air = at(k, 0.5, 0.5 + c.last * 0.5);
            c.m.position.set(p.x + c.dx * e, 0.2 + Math.sin(Math.PI * Math.min(1, air * 1.2)) * c.h * 0.5, p.z + c.dz * e);
            // tumbles in the air, then lies flat as it lands
            x.q.setFromAxisAngle(c.ax, air * c.sp); x.qf.identity();
            c.m.quaternion.copy(x.q).slerp(x.qf, ease(at(air, 0.7, 1)));
            c.m.scale.setScalar(0.4 + 0.6 * ease(at(k, 0.5, 0.58)));
            // glint: flares white as it faces up, and a sparkle after landing
            const up = Math.abs(Math.cos(air * c.sp * 0.5 + c.ph)), tw = Math.max(0, Math.sin(k * 40 + c.ph)) ** 6 * at(air, 0.8, 1);
            const f = Math.min(1, 0.45 + 0.4 * up + tw), fade = 1 - at(k, 0.8, 0.95);
            c.m.material.color.setRGB(f, f * 0.8 + 0.2 * tw, f * 0.3 + 0.7 * tw);
            c.m.material.opacity = fade; c.m.scale.multiplyScalar(0.6 + 0.4 * fade);
        }
    },
    end: cleanup,
};

export default { nat20 };
