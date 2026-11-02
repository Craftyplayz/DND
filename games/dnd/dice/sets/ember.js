// Ember Cage: an iron lattice over a churning molten core, sparks rising off each die.
const poly = (g, c) => { g.beginPath(); c.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); };
const shrink = (c, k) => { const m = c.reduce((a, p) => [a[0] + p[0] / c.length, a[1] + p[1] / c.length], [0, 0]); return c.map(([x, y]) => [m[0] + (x - m[0]) * k, m[1] + (y - m[1]) * k]); };
const mid = (c) => c.reduce((a, p) => [a[0] + p[0] / c.length, a[1] + p[1] / c.length], [0, 0]);

// the lattice: frame along the real edges, an inner rim, and filigree bars from each corner toward the centre
function lattice(g, S, corners, col, w) {
    g.strokeStyle = col; g.lineCap = g.lineJoin = 'round';
    g.lineWidth = w * 2.2; poly(g, corners); g.stroke();
    g.lineWidth = w * 0.8; poly(g, shrink(corners, 0.74)); g.stroke();
    const m = mid(corners);
    g.lineWidth = w * 0.9;
    for (const [x, y] of corners) {
        g.beginPath(); g.moveTo(x, y); g.lineTo(m[0] + (x - m[0]) * 0.62, m[1] + (y - m[1]) * 0.62); g.stroke();
        g.beginPath(); g.arc(x, y, w * 1.9, 0, 7); g.fillStyle = col; g.fill();
    }
    // little curls on each edge midpoint
    corners.forEach(([x, y], i) => {
        const [x2, y2] = corners[(i + 1) % corners.length], ex = (x + x2) / 2, ey = (y + y2) / 2, k = 0.86;
        g.beginPath(); g.arc(m[0] + (ex - m[0]) * k, m[1] + (ey - m[1]) * k, w * 1.1, 0, 7); g.lineWidth = w * 0.6; g.stroke();
    });
}

// where the engine draws the numbers, as fractions of the face canvas: the centre, or on a d4 three spots 0.62 of the way to the corners
const D4_SPOTS = [0, 1, 2].map((i) => [0.5 + Math.cos(i * 2.0944) * 0.49 * 0.62, 0.5 + Math.sin(i * 2.0944) * 0.49 * 0.62]);
const spots = (S, corners, d4) => (d4 ? corners.map(([x, y]) => [S / 2 + (x - S / 2) * 0.62, S / 2 + (y - S / 2) * 0.62, S * 0.15]) : [[S / 2, S / 2, S * 0.3]]);
// a dark iron plate under each number, so the bright number never sits on the bright core
function plates(g, S, corners, d4, fill, rim) {
    for (const [x, y, r] of spots(S, corners, d4)) {
        g.beginPath(); g.arc(x, y, r, 0, 7); g.fillStyle = fill; g.fill();
        g.lineWidth = r * 0.12; g.strokeStyle = rim; g.stroke();
    }
}

// shared churning overlay (created on first decorate)
let SH = null, lastDraw = -1;
function shared(THREE) {
    if (SH) return SH;
    const N = 128, cv = document.createElement('canvas'); cv.width = cv.height = N;
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    // a d4 has its numbers in other places, so it gets its own copy with different holes
    const cv4 = document.createElement('canvas'); cv4.width = cv4.height = N;
    const tex4 = new THREE.CanvasTexture(cv4); tex4.colorSpace = THREE.SRGBColorSpace;
    const mat4 = new THREE.MeshBasicMaterial({ map: tex4, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const sc = document.createElement('canvas'); sc.width = sc.height = 32;
    const sg = sc.getContext('2d'), gr = sg.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,200,90,.8)'); gr.addColorStop(1, 'rgba(255,90,0,0)');
    sg.fillStyle = gr; sg.fillRect(0, 0, 32, 32);
    const sparkTex = new THREE.CanvasTexture(sc);
    const sparkMat = new THREE.PointsMaterial({ size: 7, sizeAttenuation: false, map: sparkTex, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    return (SH = { cv, g: cv.getContext('2d'), tex, mat, g4: cv4.getContext('2d'), tex4, mat4, sparkMat, sparkTex, N });
}
function churn(sh, sec) {
    const { g, N } = sh;
    g.clearRect(0, 0, N, N);
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 9; i++) {
        const a = sec * (0.7 + i * 0.13) + i * 2.1, x = N / 2 + Math.cos(a) * N * (0.18 + 0.05 * i % 3 * 0.5) + Math.sin(sec * 0.9 + i) * 10,
            y = N / 2 + Math.sin(a * 1.3) * N * 0.22 + Math.cos(sec * 1.1 + i * 1.7) * 10, r = N * (0.16 + 0.06 * Math.sin(sec * 1.5 + i));
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, i % 2 ? 'rgba(255,210,70,.55)' : 'rgba(255,110,10,.5)'); gr.addColorStop(1, 'rgba(255,60,0,0)');
        g.fillStyle = gr; g.fillRect(0, 0, N, N);
    }
    // copy for the d4, then cut soft holes where the numbers sit so the churn never washes over them
    sh.g4.clearRect(0, 0, N, N); sh.g4.globalCompositeOperation = 'source-over'; sh.g4.drawImage(sh.cv, 0, 0);
    const hole = (c, x, y, r) => { const h = c.createRadialGradient(x, y, r * 0.7, x, y, r * 1.15); h.addColorStop(0, 'rgba(0,0,0,1)'); h.addColorStop(1, 'rgba(0,0,0,0)');
        c.globalCompositeOperation = 'destination-out'; c.fillStyle = h; c.fillRect(0, 0, N, N); c.globalCompositeOperation = 'source-over'; };
    hole(g, N / 2, N / 2, N * 0.3);
    for (const [x, y] of D4_SPOTS) hole(sh.g4, x * N, y * N, N * 0.15);
    sh.tex.needsUpdate = sh.tex4.needsUpdate = true;
}

// ---- exits: how a die leaves the table (see exits in dice3d.js); a nat 1 explodes, a nat 20 flares like a phoenix, anything else crumbles to ash ----
let FX = null;
function fx(THREE) {
    if (FX) return FX;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    const r = document.createElement('canvas'); r.width = r.height = 128;
    const rg = r.getContext('2d'), rr = rg.createRadialGradient(64, 64, 40, 64, 64, 64);
    rr.addColorStop(0, 'rgba(255,255,255,0)'); rr.addColorStop(0.6, 'rgba(255,255,255,1)'); rr.addColorStop(1, 'rgba(255,255,255,0)');
    rg.fillStyle = rr; rg.fillRect(0, 0, 128, 128);
    return (FX = { soft: new THREE.CanvasTexture(c), ring: new THREE.CanvasTexture(r), plane: new THREE.PlaneGeometry(1, 1) });
}
// per-exit things, all removed in end
const sprite = (x, color, additive = true) => { const s = new x.THREE.Sprite(new x.THREE.SpriteMaterial({ map: fx(x.THREE).soft, color, transparent: true, depthWrite: false, blending: additive ? x.THREE.AdditiveBlending : x.THREE.NormalBlending }));
    s.position.copy(x.mesh.position); x.scene.add(s); x.own.push(s); return s; };
const floorRing = (x, color) => { const m = new x.THREE.Mesh(fx(x.THREE).plane, new x.THREE.MeshBasicMaterial({ map: fx(x.THREE).ring, color, transparent: true, depthWrite: false, blending: x.THREE.AdditiveBlending }));
    m.rotation.x = -Math.PI / 2; m.position.set(x.mesh.position.x, 0.05, x.mesh.position.z); x.scene.add(m); x.own.push(m); return m; };
// a burst of n points flying out from the die; each frame call move(t) with t seconds since the burst
function burst(x, n, color, size, speed, spiral = 0) {
    const T = x.THREE, pos = new Float32Array(n * 3), vel = [], o = x.mesh.position;
    for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, s = speed * (0.4 + Math.random() * 0.8); vel.push([Math.cos(a) * s, 2 + Math.random() * 3, Math.sin(a) * s, a]); }
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    const p = new T.Points(geo, new T.PointsMaterial({ map: fx(T).soft, color, size, sizeAttenuation: false, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
    p.frustumCulled = false; x.scene.add(p); x.own.push(p);
    p.move = (t) => { for (let i = 0; i < n; i++) { const [vx, vy, vz, a] = vel[i], r = spiral ? t * speed * (0.6 + (i % 7) / 10) : 0, sa = a + t * spiral;
        pos[i * 3] = o.x + (spiral ? Math.cos(sa) * r : vx * t); pos[i * 3 + 1] = o.y + vy * t; pos[i * 3 + 2] = o.z + (spiral ? Math.sin(sa) * r : vz * t); }
        geo.attributes.position.needsUpdate = true; };
    return p;
}
const cleanup = (x) => { for (const o of x.own || []) { x.scene.remove(o); o.material.dispose(); if (o.isPoints) o.geometry.dispose(); } x.own = []; };
const ease = (k) => 1 - (1 - k) ** 3;
const at = (k, a, b) => Math.max(0, Math.min(1, (k - a) / (b - a)));
// sounds for the exits; each is skipped when sound is off
function boom({ ac, out, noise }, when) {
    const t = ac.currentTime + when;
    const s = ac.createBufferSource(); s.buffer = noise; s.loop = true;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(2400, t); lp.frequency.exponentialRampToValueAtTime(160, t + 1.2);
    const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.8, t + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
    s.connect(lp).connect(g).connect(out); s.start(t); s.stop(t + 1.5);
    const o = ac.createOscillator(), og = ac.createGain(); o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(28, t + 0.6);
    og.gain.setValueAtTime(0.8, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.7); o.connect(og).connect(out); o.start(t); o.stop(t + 0.75);
}
// nat 20: a fire that roars up, a soft whoomp as it flares, then a ring of bells with sparkles and an echo
function fanfare({ ac, out, noise }, when) {
    const t0 = ac.currentTime, t = t0 + when;
    const env = (g, at, peak, rise, fall) => { g.gain.setValueAtTime(0.0001, at); g.gain.linearRampToValueAtTime(peak, at + rise); g.gain.exponentialRampToValueAtTime(0.0001, at + rise + fall); };
    // the build: fire noise that opens up and swells
    const roar = ac.createBufferSource(); roar.buffer = noise; roar.loop = true;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.7;
    lp.frequency.setValueAtTime(300, t0); lp.frequency.exponentialRampToValueAtTime(2600, t);
    const rg = ac.createGain(); rg.gain.setValueAtTime(0.0001, t0); rg.gain.exponentialRampToValueAtTime(0.32, t); rg.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    roar.connect(lp).connect(rg).connect(out); roar.start(t0); roar.stop(t + 0.4);
    // crackles that come faster as it builds
    const ck = ac.createBufferSource(); ck.buffer = noise; ck.loop = true;
    const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3000;
    const cg = ac.createGain(); cg.gain.setValueAtTime(0.0001, t0);
    for (let s = 0.03; s < when; s += 0.16 * (1 - s / when) + 0.025) { const a = t0 + s; cg.gain.setValueAtTime(0.12 + 0.2 * (s / when), a); cg.gain.exponentialRampToValueAtTime(0.0005, a + 0.015); }
    ck.connect(hp).connect(cg).connect(out); ck.start(t0); ck.stop(t);
    // a soft rising tone under it
    const rise = ac.createOscillator(), riseG = ac.createGain(); rise.type = 'triangle';
    rise.frequency.setValueAtTime(196, t0); rise.frequency.exponentialRampToValueAtTime(784, t);
    riseG.gain.setValueAtTime(0.0001, t0); riseG.gain.exponentialRampToValueAtTime(0.12, t - 0.05); riseG.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    rise.connect(riseG).connect(out); rise.start(t0); rise.stop(t + 0.15);
    // the flare: a low whoomp
    const thump = ac.createOscillator(), tg = ac.createGain(); thump.frequency.setValueAtTime(130, t); thump.frequency.exponentialRampToValueAtTime(45, t + 0.45);
    env(tg, t, 0.55, 0.01, 0.5); thump.connect(tg).connect(out); thump.start(t); thump.stop(t + 0.55);
    // the bells: a quick C major arpeggio up two octaves, bell-like partials, into an echo that dies away
    const echo = ac.createDelay(1), fb = ac.createGain(), wet = ac.createGain(), tone = ac.createBiquadFilter();
    echo.delayTime.value = 0.19; fb.gain.value = 0.32; wet.gain.value = 0.45; tone.type = 'lowpass'; tone.frequency.value = 4500;
    echo.connect(tone).connect(fb).connect(echo); tone.connect(wet).connect(out);
    const bells = ac.createGain(); bells.gain.value = 1; bells.connect(out); bells.connect(echo);
    [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568].forEach((f, i) => {
        const at = t + 0.05 + i * 0.07, g = ac.createGain(); env(g, at, 0.16, 0.004, 1.6 - i * 0.12); g.connect(bells);
        for (const [m, v] of [[1, 1], [2.01, 0.35], [3.02, 0.12]]) { const o = ac.createOscillator(), og = ac.createGain(); o.frequency.value = f * m; og.gain.value = v; o.connect(og).connect(g); o.start(at); o.stop(at + 1.8); }
    });
    // sparkles scattered over the ring-out
    for (let i = 0; i < 10; i++) { const at = t + 0.15 + Math.random() * 0.9, o = ac.createOscillator(), g = ac.createGain();
        o.frequency.value = 2400 + Math.random() * 2200; env(g, at, 0.05, 0.002, 0.12); o.connect(g).connect(bells); o.start(at); o.stop(at + 0.15); }
    // the echo loop is cut once everything has rung out, so it can't hang on
    setTimeout(() => { try { fb.disconnect(); echo.disconnect(); bells.disconnect(); } catch (e) { } }, (when + 3.2) * 1000);
}
// a nat 1 or nat 20 plays the style's chosen sound for it (natSounds, set by the Dice Sets page) or the original;
// a chosen one gets { ac, out, noise, t0: now, hit: when the die blows up or flares }
function natSound(x, n, when, original) {
    const s = x.st?.natSounds?.[n];
    if (!s) return original(x.audio, when);
    const t0 = x.audio.ac.currentTime; s({ ...x.audio, t0, hit: t0 + when });
}

const EXITS = {
    // nat 1: it heats up and shakes, then blows apart in a fireball with a shockwave across the table
    fireball: {
        dur: 1.7,
        start(x) {
            x.own = []; x.home = x.mesh.position.clone();
            x.heat = sprite(x, 0xff6a10); x.heat.scale.setScalar(0.1);
            if (x.audio) natSound(x, 1, 1.7 * 0.28, boom);
        },
        tick(k, x) {
            const pre = at(k, 0, 0.28), post = at(k, 0.28, 1);
            if (k < 0.28) {
                // heating up: shaking harder and glowing brighter
                x.mesh.position.set(x.home.x + (Math.random() - 0.5) * 0.25 * pre, x.home.y, x.home.z + (Math.random() - 0.5) * 0.25 * pre);
                x.heat.scale.setScalar(1 + pre * 2.6); x.heat.material.opacity = 0.3 + pre * 0.7;
                return;
            }
            if (!x.blown) {
                x.blown = true; x.mesh.visible = false;
                x.core = sprite(x, 0xfff2c0); x.fire = sprite(x, 0xff7a10); x.smoke = sprite(x, 0x2a1408, false);
                x.puffs = Array.from({ length: 7 }, () => { const s = sprite(x, 0xff9a30); s.dir = [Math.random() - 0.5, Math.random() - 0.5]; return s; });
                x.shock = floorRing(x, 0xffa040); x.debris = burst(x, 40, 0xffb040, 7, 9);
            }
            const e = ease(post);
            x.heat.material.opacity = Math.max(0, 1 - post * 4);
            x.core.scale.setScalar(1 + e * 4); x.core.material.opacity = Math.max(0, 1 - post * 2.2);
            x.fire.scale.setScalar(2 + e * 5); x.fire.material.opacity = Math.max(0, 1 - post * 1.3);
            x.fire.material.color.setRGB(1, 0.45 - post * 0.3, 0.06);
            x.smoke.scale.setScalar(2 + e * 6); x.smoke.material.opacity = Math.min(0.55, post * 2) * (1 - post);
            for (const s of x.puffs) { s.position.set(x.home.x + s.dir[0] * e * 5, x.home.y + 1, x.home.z + s.dir[1] * e * 5); s.scale.setScalar(1.5 + e * 3); s.material.opacity = Math.max(0, 0.9 - post * 1.2); }
            x.shock.scale.setScalar(1 + e * 11); x.shock.material.opacity = Math.max(0, 1 - post * 1.4);
            x.debris.move(post * 1.2); x.debris.material.opacity = Math.max(0, 1 - post);
        },
        end: cleanup,
    },
    // nat 20: it swells and spins, a ring of fire spreads, golden sparks spiral out like wings, then it bursts into gold
    phoenix: {
        dur: 2.1,
        start(x) {
            x.own = []; x.spin = 0;
            x.halo = sprite(x, 0xffc830); x.halo.scale.setScalar(0.1);
            if (x.audio) natSound(x, 20, 2.1 * 0.42, fanfare);
        },
        tick(k, x) {
            const rise = ease(at(k, 0, 0.42)), out = at(k, 0.42, 1);
            if (k < 0.42) {
                x.spin += x.dt * (4 + rise * 18);
                x.mesh.rotateOnWorldAxis(x.UP ||= new x.THREE.Vector3(0, 1, 0), x.spin);
                x.mesh.scale.setScalar(1 + rise * 0.7);
                x.halo.scale.setScalar(1 + rise * 5); x.halo.material.opacity = 0.4 + rise * 0.6;
                if (k > 0.2 && !x.ring) x.ring = floorRing(x, 0xff8a20);
                if (x.ring) { const r = ease(at(k, 0.2, 0.42)); x.ring.scale.setScalar(2 + r * 6); }
                return;
            }
            if (!x.flared) {
                x.flared = true; x.mesh.visible = false;
                x.flash = sprite(x, 0xfff6d0); x.wings = burst(x, 60, 0xffd040, 8, 6, 5); x.embers = burst(x, 36, 0xff9020, 6, 5);
                x.wave = floorRing(x, 0xffd860);
            }
            const e = ease(out);
            x.halo.scale.setScalar(6 + e * 3); x.halo.material.opacity = Math.max(0, 1 - out * 1.5);
            x.flash.scale.setScalar(2 + e * 6); x.flash.material.opacity = Math.max(0, 1 - out * 2.5);
            x.ring.scale.setScalar(8 + e * 4); x.ring.material.opacity = Math.max(0, 1 - out * 1.2);
            x.wave.scale.setScalar(1 + e * 13); x.wave.material.opacity = Math.max(0, 0.9 - out);
            x.wings.move(out * 1.4); x.wings.material.opacity = Math.max(0, 1 - out * 0.9);
            x.embers.move(out * 1.1); x.embers.material.opacity = Math.max(0, 1 - out);
        },
        end: cleanup,
    },
    // any other roll: the die cools, shrinks into a puff of ash and a few last sparks
    ash: {
        dur: 0.9,
        start(x) { x.own = []; x.puff = sprite(x, 0x6a5a50, false); x.puff.scale.setScalar(0.1); x.last = burst(x, 12, 0xff8a30, 5, 2.5); },
        tick(k, x) {
            const e = ease(k);
            x.mesh.scale.setScalar(Math.max(0.001, 1 - e));
            x.puff.scale.setScalar(0.5 + e * 3.5); x.puff.material.opacity = 0.6 * Math.sin(Math.PI * k);
            x.last.move(k * 0.8); x.last.material.opacity = 1 - k;
        },
        end: cleanup,
    },
};

const NS = 28;
export default {
    // which exit plays for which roll: the most specific key wins ('d20:20', then a range like 'd20:2-19', then 'd20', then '*')
    exits: { 'd20:1': EXITS.fireball, 'd20:20': EXITS.phoenix, '*': EXITS.ash },
    // the original nat 1 and nat 20 sounds, for other animations to play at their own impact ({ ac, out, noise, t0, hit })
    natOriginal: { 1: (c) => boom(c, c.hit - c.ac.currentTime), 20: (c) => fanfare(c, c.hit - c.ac.currentTime) },
    // bright bold numbers on dark plates: they glow like hot metal and read at a glance
    name: 'Ember Cage', ink: '#ffe9a8', metal: 0.55, rough: 0.38, glow: 0.55, bumpScale: 4,
    paint(g, S, seed, corners, d4) {
        const r = (() => { let s = seed * 97 + 5; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
        g.fillStyle = '#120806'; g.fillRect(0, 0, S, S);
        // molten core inside the cage
        g.save(); poly(g, shrink(corners, 0.9)); g.clip();
        const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * 0.5);
        gr.addColorStop(0, '#ffe27a'); gr.addColorStop(0.4, '#e8801c'); gr.addColorStop(1, '#7a2204');
        g.fillStyle = gr; g.fillRect(0, 0, S, S);
        for (let i = 0; i < 30; i++) { // darker crust cracks and bright blobs
            g.fillStyle = r() < 0.5 ? 'rgba(120,25,0,.28)' : 'rgba(255,230,120,.22)';
            g.beginPath(); g.arc(r() * S, r() * S, 8 + r() * 24, 0, 7); g.fill();
        }
        g.restore();
        // dark iron frame; the rim glows faintly where the heat leaks
        lattice(g, S, corners, '#070403', 14);
        g.strokeStyle = 'rgba(255,120,30,.55)'; g.lineWidth = 2; poly(g, shrink(corners, 0.9)); g.stroke();
        plates(g, S, corners, d4, '#160a05', '#070403');
    },
    bump(g, S, seed, corners, d4) { lattice(g, S, corners, '#fff', 14); plates(g, S, corners, d4, '#555', '#fff'); },
    decorate({ THREE, mesh, faces, sides }) {
        const sh = shared(THREE);
        const ov = new THREE.Mesh(mesh.geometry, sides === 4 ? sh.mat4 : sh.mat); ov.scale.setScalar(1.004); mesh.add(ov);
        const pos = new Float32Array(NS * 3), col = new Float32Array(NS * 3), age = new Float32Array(NS), life = new Float32Array(NS);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
        const pts = new THREE.Points(geo, sh.sparkMat); pts.frustumCulled = false; mesh.add(pts);
        const spawn = (i) => {
            const f = faces[(Math.random() * faces.length) | 0], a = Math.random() - 0.5, b = Math.random() - 0.5;
            pos[i * 3] = f.c.x + (f.u.x * a + f.v.x * b) * f.r * 1.2 + f.n.x * 0.1;
            pos[i * 3 + 1] = f.c.y + (f.u.y * a + f.v.y * b) * f.r * 1.2 + f.n.y * 0.1;
            pos[i * 3 + 2] = f.c.z + (f.u.z * a + f.v.z * b) * f.r * 1.2 + f.n.z * 0.1;
            life[i] = 0.8 + Math.random() * 1.2; age[i] = 0;
        };
        for (let i = 0; i < NS; i++) { spawn(i); age[i] = Math.random() * life[i]; }
        const q = new THREE.Quaternion(), up = new THREE.Vector3(), vel = new THREE.Vector3();
        const place = (dt) => {
            q.copy(mesh.quaternion).invert(); up.set(0, 1, 0).applyQuaternion(q);
            for (let i = 0; i < NS; i++) {
                age[i] += dt; if (age[i] > life[i]) spawn(i);
                const k = age[i] / life[i], p = i * 3, drift = 0.6 * dt;
                pos[p] += up.x * drift - vel.x * dt * 0.5 + (Math.random() - 0.5) * 0.01;
                pos[p + 1] += up.y * drift - vel.y * dt * 0.5; pos[p + 2] += up.z * drift - vel.z * dt * 0.5;
                const f = (1 - k) * Math.min(1, k * 6);
                col[p] = f; col[p + 1] = f * (0.45 + 0.4 * (1 - k)); col[p + 2] = f * 0.12;
            }
            geo.attributes.position.needsUpdate = geo.attributes.color.needsUpdate = true;
        };
        place(0);
        return {
            tick(sec, dt, body) {
                if (sec - lastDraw > 0.05 || sec < lastDraw) { lastDraw = sec; churn(sh, sec); }
                if (body) { q.copy(mesh.quaternion).invert(); vel.set(body.velocity.x, body.velocity.y, body.velocity.z).applyQuaternion(q); } else vel.set(0, 0, 0);
                place(dt);
            },
            dispose() { mesh.remove(ov); mesh.remove(pts); geo.dispose(); },
        };
    },
    sound: {
        hit({ ac, out, noise, vol, onTable, t }) {
            const base = (onTable ? 520 : 900) * (0.85 + Math.random() * 0.3), g = ac.createGain();
            g.gain.setValueAtTime(vol * 0.45, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3); g.connect(out);
            for (const m of [1, 2.76, 5.4]) { const o = ac.createOscillator(); o.type = 'sine'; o.frequency.value = base * m; o.connect(g); o.start(t); o.stop(t + 0.3); }
            // ember crackle: a few tiny noise ticks
            const s = ac.createBufferSource(); s.buffer = noise; const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3500;
            const cg = ac.createGain(); cg.gain.setValueAtTime(0.0001, t);
            for (let i = 0; i < 4; i++) { const tt = t + 0.01 + Math.random() * 0.2; cg.gain.setValueAtTime(vol * 0.35, tt); cg.gain.exponentialRampToValueAtTime(0.0005, tt + 0.02); }
            s.connect(hp).connect(cg).connect(out); s.start(t, Math.random() * 0.15, 0.25);
        },
        throw({ ac, out, noise, t }) {
            const s = ac.createBufferSource(); s.buffer = noise; s.loop = true;
            const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.8;
            bp.frequency.setValueAtTime(250, t); bp.frequency.exponentialRampToValueAtTime(1800, t + 0.45);
            const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.5, t + 0.2); g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
            s.connect(bp).connect(g).connect(out); s.start(t); s.stop(t + 0.65);
        },
    },
};
