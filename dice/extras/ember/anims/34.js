// Ember Cage exits 34, Ash in the Wind: the die heats up glowing like magma, melts into a puddle (True Melt's shape, 33.js),
// cools and hardens into grey ash, then a gust sweeps across it from one side and blows the ash away in flakes, with its own sound.
import base from './33.js';
const M = base.mid;

let ASH = null;
// grey speckle for the ash crust, made once
function ashTex(T) {
    if (ASH) return ASH;
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'); g.fillStyle = '#8f8a85'; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 1400; i++) { const l = 90 + Math.random() * 110 | 0; g.fillStyle = `rgba(${l},${l - 4},${l - 8},.55)`; g.fillRect(Math.random() * 128, Math.random() * 128, 1 + Math.random() * 2, 1 + Math.random() * 2); }
    ASH = new T.CanvasTexture(c); ASH.colorSpace = T.SRGBColorSpace; ASH.wrapS = ASH.wrapT = T.RepeatWrapping;
    return ASH;
}
let LAVA = null;
// molten rock: bright orange with yellow-hot blobs and darker cooling veins, made once
function lavaTex(T) {
    if (LAVA) return LAVA;
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'); g.fillStyle = '#ff6a0c'; g.fillRect(0, 0, 128, 128);
    // drawn three times over so it tiles without seams
    const blob = (x, y, r, a, b) => { for (const dx of [-128, 0, 128]) for (const dy of [-128, 0, 128]) { const gr = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r); gr.addColorStop(0, a); gr.addColorStop(1, b); g.fillStyle = gr; g.fillRect(x + dx - r, y + dy - r, r * 2, r * 2); } };
    for (let i = 0; i < 14; i++) blob(Math.random() * 128, Math.random() * 128, 10 + Math.random() * 18, 'rgba(120,20,0,.75)', 'rgba(120,20,0,0)');
    for (let i = 0; i < 18; i++) blob(Math.random() * 128, Math.random() * 128, 6 + Math.random() * 14, 'rgba(255,225,90,.9)', 'rgba(255,170,30,0)');
    LAVA = new T.CanvasTexture(c); LAVA.colorSpace = T.SRGBColorSpace; LAVA.wrapS = LAVA.wrapT = T.RepeatWrapping;
    return LAVA;
}
// the magma skin. Laid out by the die's face uvs it breaks at every face edge, so as the melt starts it slides over to a layout taken from
// the die's own unmelted shape (three projections blended by direction from the middle), which has no seams and flows with the melt; uMix runs 0 (face uvs) to 1 (seamless)
const LVERT = `attribute vec3 p0; varying vec2 vUv; varying vec3 vP; void main(){ vUv = uv; vP = p0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`;
const LFRAG = `uniform sampler2D map; uniform vec3 uColor; uniform vec2 uOff; uniform float uOp, uMix, uS; varying vec2 vUv; varying vec3 vP;
void main(){
    vec3 w = abs(normalize(vP + 1e-5)); w = w * w * w; w /= w.x + w.y + w.z;
    vec3 tri = texture2D(map, vP.yz * uS + uOff).rgb * w.x + texture2D(map, vP.zx * uS + uOff + .31).rgb * w.y + texture2D(map, vP.xy * uS + uOff + .67).rgb * w.z;
    gl_FragColor = vec4(mix(texture2D(map, vUv + uOff).rgb, tri, uMix) * uColor, uOp);
    #include <colorspace_fragment>
}`;
// ash flakes: points with their own alpha and size
const VERT = 'attribute float a; attribute float sz; attribute float sh; varying float va; varying float vs; void main(){ va=a; vs=sh; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); gl_PointSize=sz; }';
const FRAG = 'varying float va; varying float vs; void main(){ float d=length(gl_PointCoord-.5); if(d>.5) discard; gl_FragColor=vec4(vec3(.55,.53,.5)*vs, va*smoothstep(.5,.15,d)); }';
const sm = (a, b, k) => { const t = Math.max(0, Math.min(1, (k - a) / (b - a))); return t * t * (3 - 2 * t); };
const rnd = (a, b) => a + Math.random() * (b - a);
// flakes, and when the gust's front crosses the ash on the LEN-second melt clock; dur adds time for the last flakes to blow off the screen
const NP = 420, W0 = 0.72, W1 = 0.95, LEN = 5.4;
// every die leaving in the same moment gets the same wind
let windDir = 0, windAt = -1;

// the sound, all scheduled at the start against the animation's clock: a sizzle and bubbling magma as it melts,
// a few cooling cracks as it hardens, then a gust of wind with a fine hiss of ash. Dice leaving together share one copy.
let lastSound = -1;
function sound(x) {
    const a = x.audio; if (!a) return;
    const { ac, out, noise } = a, t0 = ac.currentTime, D = LEN, at = (k) => t0 + k * D;
    if (t0 - lastSound < 0.15) return; lastSound = t0;
    const bus = ac.createGain(); bus.connect(out); const srcs = [];
    x.snd = { bus, srcs };
    const hiss = (type, f, q, from, to) => { const s = ac.createBufferSource(); s.buffer = noise; s.loop = true; s.playbackRate.value = 0.8 + Math.random() * 0.4;
        const b = ac.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; const g = ac.createGain(); g.gain.value = 0;
        s.connect(b).connect(g).connect(bus); s.start(from); s.stop(to); srcs.push(s); return { b, g }; };
    // the sizzle swells as the magma covers it, and dies away as it cools
    const z = hiss('bandpass', 4200, 0.8, t0, at(0.68));
    z.g.gain.setValueAtTime(0.0001, t0); z.g.gain.exponentialRampToValueAtTime(0.1, at(0.2)); z.g.gain.setValueAtTime(0.1, at(0.45)); z.g.gain.exponentialRampToValueAtTime(0.0001, at(0.66));
    // a deep molten rumble under it while it slumps
    const r = hiss('lowpass', 220, 0.7, t0, at(0.66));
    r.g.gain.setValueAtTime(0.0001, t0); r.g.gain.exponentialRampToValueAtTime(0.3, at(0.3)); r.g.gain.exponentialRampToValueAtTime(0.0001, at(0.64));
    // thick bubbles popping, quickest while it runs out
    for (let i = 0; i < 26; i++) {
        const k = 0.1 + Math.random() * 0.48, t = at(k), o = ac.createOscillator(), g = ac.createGain(), f = 110 + Math.random() * 160;
        o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * (1.8 + Math.random()), t + 0.07);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12 + Math.random() * 0.1, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
        o.connect(g).connect(bus); o.start(t); o.stop(t + 0.1); srcs.push(o);
    }
    // cooling cracks as the crust sets
    const c = hiss('highpass', 2500, 0.7, at(0.5), at(0.74));
    c.g.gain.setValueAtTime(0, at(0.5));
    for (let i = 0; i < 9; i++) { const t = at(0.52 + Math.random() * 0.2); c.g.gain.setValueAtTime(0.15 + Math.random() * 0.15, t); c.g.gain.exponentialRampToValueAtTime(0.0005, t + 0.02); }
    // the gust: wind that rises fast, whistles up and falls away, and the ash hissing off with it
    const end = t0 + ash.dur, w = hiss('bandpass', 400, 1.6, at(0.68), end + 0.05);
    w.b.frequency.setValueAtTime(350, at(0.68)); w.b.frequency.exponentialRampToValueAtTime(1100, at(0.8)); w.b.frequency.exponentialRampToValueAtTime(700, at(0.93)); w.b.frequency.exponentialRampToValueAtTime(450, end);
    w.g.gain.setValueAtTime(0.0001, at(0.68)); w.g.gain.exponentialRampToValueAtTime(0.45, at(0.79)); w.g.gain.linearRampToValueAtTime(0.3, at(0.97)); w.g.gain.exponentialRampToValueAtTime(0.0001, end);
    const h = hiss('highpass', 5000, 0.7, at(0.72), end + 0.05);
    h.g.gain.setValueAtTime(0.0001, at(0.72)); h.g.gain.exponentialRampToValueAtTime(0.07, at(0.82)); h.g.gain.setValueAtTime(0.07, at(0.97)); h.g.gain.exponentialRampToValueAtTime(0.0001, end);
}
// a new throw cuts it short with a quick fade, never a click
function hush(x) {
    if (!x.snd) return;
    const { bus, srcs } = x.snd, t = x.audio.ac.currentTime; x.snd = null;
    bus.gain.setValueAtTime(bus.gain.value, t); bus.gain.linearRampToValueAtTime(0, t + 0.05);
    for (const s of srcs) try { s.stop(t + 0.06); } catch (e) { }
    setTimeout(() => bus.disconnect(), 400);
}

const ash = {
    key: 'a34-ash-wind', name: 'Ash in the Wind', blurb: 'Magma creeps over the die until it is molten through, it melts into a puddle, hardens into grey ash, then a gust of wind blows the ash away.',
    dur: 7.4,
    start(x) {
        M.start(x);
        const T = x.THREE, poly = { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 };
        // a magma skin over the die and an ash crust under it, both on the melting geometry so they follow its shape
        x.lava = lavaTex(T).clone(); x.lava.needsUpdate = true;
        x.geo.setAttribute('p0', new T.BufferAttribute(x.geo.attributes.position.array.slice(), 3)); // where each point started, for the magma pattern
        x.heat = new T.Mesh(x.geo, new T.ShaderMaterial({ vertexShader: LVERT, fragmentShader: LFRAG, transparent: true, depthWrite: false, ...poly,
            uniforms: { map: { value: x.lava }, uColor: { value: new T.Color() }, uOff: { value: new T.Vector2() }, uOp: { value: 0 }, uMix: { value: 0 }, uS: { value: 0.55 / x.rm } } }));
        x.heat.renderOrder = 1;
        x.crust = new T.Mesh(x.geo, new T.MeshStandardMaterial({ map: ashTex(T), color: 0xb8b2ac, roughness: 1, metalness: 0, transparent: true, opacity: 0, ...poly }));
        x.crust.renderOrder = 2; x.mesh.add(x.heat, x.crust);
        x.kb = -1; x.snap = null;
        if (!(Math.abs(x.sec - windAt) < 0.3)) windDir = rnd(0, 6.283);
        windAt = x.sec; x.wind = { x: Math.cos(windDir), z: Math.sin(windDir) };
        sound(x);
    },
    tick(kk, x) {
        const T = x.THREE, sec = kk * ash.dur, k = Math.min(1, sec / LEN);
        // melt along True Melt's own clock, held once the puddle is spread
        const kb = 0.72 * Math.max(0, Math.min(1, (k - 0.1) / 0.45));
        if (kb !== x.kb) { x.kb = kb; M.tick(kb, x); }
        x.mesh.quaternion.copy(x.q0); x.mesh.position.copy(x.p0);
        // heat: magma creeps over the die until the iron and numbers are gone, glows hottest as it melts, then dulls to dark red as it cools
        const cover = sm(0, 0.24, k), peak = sm(0.12, 0.4, k), cool = sm(0.48, 0.64, k), harden = sm(0.56, 0.7, k);
        const b = (0.55 + 0.45 * peak) * (1 - 0.7 * cool);
        const u = x.heat.material.uniforms;
        u.uColor.value.setRGB(b, b * (0.6 + 0.4 * peak) * (1 - 0.6 * cool), b * (1 - cool));
        u.uOp.value = cover * (1 - harden);
        u.uOff.value.set(k * 0.35, k * 0.2); // it slowly flows
        u.uMix.value = sm(0.1, 0.32, k); // the face seams melt away as the die starts to slump
        // the die underneath goes once the magma hides it
        const gone = sm(0.14, 0.26, k);
        for (const m of x.mats.concat(x.kmats)) m.opacity = m.op0 * (1 - gone);
        x.crust.material.opacity = harden * (1 - sm(0.9, 0.97, k));
        x.mesh.castShadow = k < 0.8; x.heat.castShadow = x.crust.castShadow = false;
        if (k >= 0.7) blow(k, sec, x, T);
    },
    end(x) {
        x.mesh.remove(x.heat, x.crust); x.heat.material.dispose(); x.lava.dispose(); x.crust.material.dispose();
        if (x.flakes) { x.scene.remove(x.flakes); x.flakes.geometry.dispose(); x.flakes.material.dispose(); x.flakes = null; }
        hush(x); M.end(x);
    },
};

// the gust: a ragged front crosses the ash from the upwind side, sweeping it to nothing and lifting it off as flakes
function blow(k, sec, x, T) {
        const P = x.geo.attributes.position, pa = P.array;
        if (!x.snap) {
            x.snap = pa.slice();
            // the wind and the line across it, in the die's own space
            const qi = x.q0.clone().invert(), w = new T.Vector3(x.wind.x, 0, x.wind.z).applyQuaternion(qi), s = new T.Vector3(-x.wind.z, 0, x.wind.x).applyQuaternion(qi);
            const n = pa.length / 3, c = (x.c = new Float32Array(n)), f1 = rnd(1.5, 3), f2 = rnd(4, 6), p1 = rnd(0, 6.283), p2 = rnd(0, 6.283), rag = x.rm * 0.35;
            let lo = Infinity, hi = -Infinity;
            for (let i = 0; i < n; i++) {
                const px = pa[i * 3], py = pa[i * 3 + 1], pz = pa[i * 3 + 2], d = px * w.x + py * w.y + pz * w.z, e = (px * s.x + py * s.y + pz * s.z) / x.rm;
                c[i] = d - rag * (0.65 * Math.sin(e * f1 + p1) + 0.35 * Math.sin(e * f2 + p2));
                lo = Math.min(lo, c[i]); hi = Math.max(hi, c[i]);
            }
            Object.assign(x, { wo: w, clo: lo - 0.01, chi: hi + 0.01 });
            // flakes: each starts on a spot of the crust and leaves when the front reaches it
            const pos = new Float32Array(NP * 3), al = new Float32Array(NP), sz = new Float32Array(NP), sh = new Float32Array(NP), v = new T.Vector3();
            x.fl = [];
            for (let j = 0; j < NP; j++) {
                const i = Math.random() * n | 0; v.set(pa[i * 3], pa[i * 3 + 1], pa[i * 3 + 2]).applyQuaternion(x.q0).add(x.p0);
                x.fl.push({ x: v.x, y: v.y, z: v.z, born: W0 + (W1 - W0) * (c[i] - lo) / (hi - lo), sp: rnd(2, 4), acc: rnd(14, 26), up: rnd(0.2, 1.2), sw: rnd(0.2, 0.7), f: rnd(4, 9), ph: rnd(0, 6.283) });
                sz[j] = rnd(2.5, 6.5); sh[j] = rnd(0.7, 1.5);
            }
            const g = new T.BufferGeometry();
            g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('a', new T.BufferAttribute(al, 1));
            g.setAttribute('sz', new T.BufferAttribute(sz, 1)); g.setAttribute('sh', new T.BufferAttribute(sh, 1));
            x.flakes = new T.Points(g, new T.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, depthTest: false }));
            x.flakes.frustumCulled = false; x.scene.add(x.flakes);
            // the camera, to know when a flake has left the screen
            x.flakes.onBeforeRender = (r, s, cam) => (x.cam = cam);
        }
        // everything upwind of the front is swept onto it, so the crust shrinks away downwind
        const front = x.clo + (x.chi - x.clo) * sm(W0, W1, k), sn = x.snap, c = x.c, w = x.wo;
        for (let i = 0; i < c.length; i++) {
            const push = c[i] < front ? front - c[i] : 0;
            pa[i * 3] = sn[i * 3] + w.x * push; pa[i * 3 + 1] = sn[i * 3 + 1] + w.y * push; pa[i * 3 + 2] = sn[i * 3 + 2] + w.z * push;
        }
        P.needsUpdate = true;
        // flakes ride the gust: faster and faster downwind, a sideways flutter, a little lift; each stays until it is off the screen
        const g = x.flakes.geometry, pos = g.attributes.position.array, al = g.attributes.a.array, sx = -x.wind.z, sz = x.wind.x, ex = (x.cam?.right ?? 40) + 1, ez = (x.cam?.top ?? 40) + 1;
        for (let j = 0; j < NP; j++) {
            const f = x.fl[j], s = sec - f.born * LEN;
            if (s <= 0) { al[j] = 0; continue; }
            const run = f.sp * s + 0.5 * f.acc * s * s, fl = Math.sin(s * f.f + f.ph) * f.sw * s;
            pos[j * 3] = f.x + x.wind.x * run + sx * fl; pos[j * 3 + 1] = f.y + f.up * s; pos[j * 3 + 2] = f.z + x.wind.z * run + sz * fl;
            const px = pos[j * 3], pz = pos[j * 3 + 2];
            al[j] = Math.abs(px) > ex || Math.abs(pz) > ez ? 0 : Math.min(1, s / 0.1);
        }
        g.attributes.position.needsUpdate = g.attributes.a.needsUpdate = true;
}

export default { mid: ash };
