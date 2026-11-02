// Ember Cage exits 06: nat 1 = meltdown (overheat, slump, glowing puddle that cools to cracked slag); nat 20 = wings of fire (feathered flame wings beat, sweep forward, burst into golden feathers)
let TX = null;
function tex(T) {
    if (TX) return TX;
    const mk = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); return new T.CanvasTexture(c); };
    const soft = mk(64, 64, (g) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,.55)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); });
    // a feather of flame: base at the bottom, tip at the top, barbs sweeping out and up from a bright spine
    const feather = mk(64, 256, (g, w, h) => {
        const body = new Path2D(); body.moveTo(32, 254); body.bezierCurveTo(2, 190, 2, 80, 32, 2); body.bezierCurveTo(62, 80, 62, 190, 32, 254);
        const gr = g.createLinearGradient(0, h, 0, 0); gr.addColorStop(0, 'rgba(255,250,220,.95)'); gr.addColorStop(0.45, 'rgba(255,200,90,.8)'); gr.addColorStop(1, 'rgba(255,90,10,.15)');
        g.fillStyle = gr; g.fill(body);
        g.save(); g.clip(body); g.strokeStyle = 'rgba(255,255,255,.4)'; g.lineWidth = 1;
        for (let y = 250; y > 12; y -= 7) { g.beginPath(); g.moveTo(32, y); g.lineTo(2, y - 34); g.moveTo(32, y); g.lineTo(62, y - 34); g.stroke(); }
        g.restore();
        g.strokeStyle = 'rgba(255,255,255,.95)'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(32, 256); g.lineTo(32, 6); g.stroke();
    });
    return (TX = { soft, feather });
}
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const at = (k, a, b) => clamp01((k - a) / (b - a));
const ease = (k) => 1 - (1 - k) ** 3;
const smooth = (k) => k * k * (3 - 2 * k);
const lerp = (a, b, t) => a + (b - a) * t;
const spr = (x, tx, color, blend = true) => {
    const s = new x.THREE.Sprite(new x.THREE.SpriteMaterial({ map: tx, color, transparent: true, depthWrite: false, blending: blend ? x.THREE.AdditiveBlending : x.THREE.NormalBlending, opacity: 0 }));
    s.position.copy(x.home); x.scene.add(s); x.own.push(s); return s;
};
const points = (x, n, color, size) => {
    const T = x.THREE, geo = new T.BufferGeometry(), pos = new Float32Array(n * 3);
    geo.setAttribute('position', new T.BufferAttribute(pos, 3));
    const p = new T.Points(geo, new T.PointsMaterial({ map: tex(T).soft, color, size, sizeAttenuation: false, transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0 }));
    p.frustumCulled = false; p.pos = pos; x.scene.add(p); x.own.push(p); return p;
};
function cleanup(x) {
    for (const o of x.own || []) { x.scene.remove(o); o.material.dispose(); if (o.geometry && !o.keepGeo) o.geometry.dispose(); }
    if (x.puddleTex) x.puddleTex.dispose();
    x.own = []; x.mesh.scale.setScalar(1);
}

// ---- nat 1: meltdown ----
const MD = 2.0, M_IMPACT = 0.6, MK = M_IMPACT / MD;
const hot = [[255, 238, 160], [255, 150, 25], [170, 45, 8], [70, 22, 10]], cold = [[122, 118, 114], [96, 92, 90], [64, 62, 62], [38, 36, 36]];
const mix = (a, b, t) => `rgb(${a[0] + (b[0] - a[0]) * t | 0},${a[1] + (b[1] - a[1]) * t | 0},${a[2] + (b[2] - a[2]) * t | 0})`;
function drawPuddle(x, R, temp, cool, sec) {
    const g = x.pg, N = x.pN, c = N / 2, ppu = N / 8, Rp = R * ppu, ph = x.ph;
    const wob = 0.4 + 0.6 * temp;
    const rad = (a) => Rp * (1 + wob * (0.09 * Math.sin(2 * a + ph[0] + sec * 1.3) + 0.07 * Math.sin(3 * a + ph[1] - sec * 1.1) + 0.05 * Math.sin(5 * a + ph[2] + sec * 1.9) + 0.03 * Math.sin(8 * a + ph[3] - sec * 2.3)) + 0.05 * Math.sin(4 * a + ph[4]));
    g.clearRect(0, 0, N, N);
    g.beginPath();
    for (let i = 0; i <= 72; i++) { const a = i / 72 * 6.2832, r = rad(a); i ? g.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r) : g.moveTo(c + Math.cos(a) * r, c + Math.sin(a) * r); }
    g.closePath();
    const gr = g.createRadialGradient(c, c, 0, c, c, Rp * 1.12);
    [0, 0.45, 0.85, 1].forEach((s, i) => gr.addColorStop(s, mix(cold[i], hot[i], temp)));
    g.fillStyle = gr; g.fill();
    g.save(); g.clip();
    if (temp > 0.25) { // drifting hot blobs under the skin
        g.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 4; i++) { const a = sec * (0.8 + i * 0.3) + ph[i], bx = c + Math.cos(a) * Rp * 0.4, by = c + Math.sin(a * 1.2) * Rp * 0.4, bg = g.createRadialGradient(bx, by, 0, bx, by, Rp * 0.35);
            bg.addColorStop(0, `rgba(255,190,60,${0.5 * temp})`); bg.addColorStop(1, 'rgba(255,120,0,0)'); g.fillStyle = bg; g.fillRect(0, 0, N, N); }
        g.globalCompositeOperation = 'source-over';
    }
    if (cool > 0.05) { // slag cracks creep out as it cools, glowing while the heat still shows through
        const glow = Math.sin(Math.PI * clamp01(cool * 1.25)) * 0.85;
        g.lineCap = 'round'; g.lineJoin = 'round';
        for (const pass of [0, 1]) {
            g.strokeStyle = pass ? `rgba(255,140,30,${glow})` : `rgba(18,16,16,${Math.min(1, cool * 4)})`; g.lineWidth = pass ? 1.4 : 3.6;
            if (pass && glow < 0.03) break;
            g.beginPath();
            for (const cr of x.cracks) {
                const n = Math.ceil(cr.length * clamp01(cool * 2.2 - cr.d));
                for (let i = 0; i < n; i++) { const [a, f] = cr[i], px = c + Math.cos(a) * f * Rp, py = c + Math.sin(a) * f * Rp; i ? g.lineTo(px, py) : g.moveTo(px, py); }
            }
            g.stroke();
        }
    }
    g.restore();
    g.lineWidth = 3; g.strokeStyle = mix([70, 66, 64], [255, 190, 90], temp); g.globalAlpha = 0.65; g.stroke(); g.globalAlpha = 1;
    x.puddleTex.needsUpdate = true;
}
const nat1 = {
    key: 'n06-meltdown', name: 'Meltdown', blurb: 'The die overheats, sags and slumps into a glowing puddle that cools to cracked grey slag.', dur: MD, impact: M_IMPACT,
    start(x) {
        const T = x.THREE, t = tex(T); x.own = []; x.home = x.mesh.position.clone();
        x.glow = spr(x, t.soft, 0xff2a00); x.under = spr(x, t.soft, 0xff7a10); x.flash = spr(x, t.soft, 0xfff0b0);
        x.steam = Array.from({ length: 4 }, (_, i) => { const s = spr(x, t.soft, 0x8a8480, false); s.d = [Math.random() - 0.5, 0.4 + i * 0.2, Math.random() * 6]; return s; });
        // red-hot overlay in the die's own shape
        x.ov = new T.Mesh(x.mesh.geometry, new T.MeshBasicMaterial({ color: 0xff3008, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false }));
        x.ov.keepGeo = true; x.scene.add(x.ov); x.own.push(x.ov);
        // the puddle: a canvas redrawn every frame
        x.pN = 224; const cv = document.createElement('canvas'); cv.width = cv.height = x.pN; x.pg = cv.getContext('2d'); x.puddleTex = new T.CanvasTexture(cv); x.puddleTex.colorSpace = T.SRGBColorSpace;
        x.pud = new T.Mesh(new T.PlaneGeometry(8, 8), new T.MeshBasicMaterial({ map: x.puddleTex, transparent: true, depthWrite: false, opacity: 0 }));
        x.pud.rotation.x = -Math.PI / 2; x.pud.position.set(x.home.x, 0.06, x.home.z); x.scene.add(x.pud); x.own.push(x.pud);
        x.ph = Array.from({ length: 5 }, () => Math.random() * 6.28);
        x.cracks = Array.from({ length: 12 }, (_, j) => { let a = j / 12 * 6.28 + Math.random() * 0.4, f = 0.05; const cr = [[a, f]]; for (let i = 0; i < 10; i++) { a += (Math.random() - 0.5) * 0.28; f += 0.085 + Math.random() * 0.04; cr.push([a, Math.min(f, 0.97)]); } cr.d = Math.random() * 0.4; return cr; });
        x.bub = points(x, 36, 0xffa030, 7); x.bseed = Array.from({ length: 36 }, () => [Math.random() * 6.28, Math.sqrt(Math.random()), Math.random(), 0.8 + Math.random()]);
        x.drops = points(x, 34, 0xffc050, 8); x.dv = Array.from({ length: 34 }, () => { const a = Math.random() * 6.28, s = 2 + Math.random() * 5; return [Math.cos(a) * s, 4 + Math.random() * 5, Math.sin(a) * s]; });
        x.pud.visible = false;
    },
    tick(k, x) {
        const sec = k * MD, h = x.home, heat = at(k, 0, MK), sl = at(k, MK, 0.5), cool = at(k, 0.38, 0.78), temp = 1 - cool * 0.97;
        let sy, sxz;
        if (k < MK) { const s = heat * heat; sy = 1 - 0.32 * s; sxz = 1 + 0.22 * s; }
        else { const s = smooth(sl); sy = lerp(0.68, 0.03, s); sxz = lerp(1.22, 2.1, s); }
        const shake = k < MK ? heat * 0.12 : 0;
        x.mesh.scale.set(sxz, sy, sxz);
        x.mesh.position.set(h.x + (Math.random() - 0.5) * shake, h.y - (1 - sy) * 1.15, h.z + (Math.random() - 0.5) * shake);
        if (k > MK + 0.2 * (0.5 - MK)) x.mesh.visible = sl < 1;
        // overheat glow
        const pulse = 0.65 + 0.35 * Math.sin(sec * (14 + 30 * heat));
        x.ov.position.copy(x.mesh.position); x.ov.quaternion.copy(x.mesh.quaternion); x.ov.scale.copy(x.mesh.scale).multiplyScalar(1.03);
        x.ov.material.opacity = k < 0.5 ? (0.08 + 0.5 * heat) * pulse * (1 - sl) : 0;
        x.glow.position.set(h.x, h.y + 2, h.z);
        x.glow.scale.setScalar(2.4 + heat * 1.4 + sl * 2); x.glow.material.opacity = k < MK ? (0.15 + 0.6 * heat) * pulse : 0.75 * (1 - at(k, 0.35, 0.55));
        // puddle
        const R = k < MK ? 1.0 + 0.45 * heat : 1.45 + 2.1 * ease(at(k, MK, 0.72)) + 0.4 * at(k, 0.72, 1);
        x.pud.visible = true;
        drawPuddle(x, R, temp, cool, sec);
        x.pud.material.opacity = Math.min(1, 0.25 + heat * 0.75) * (1 - smooth(at(k, 0.86, 1)));
        x.under.position.set(h.x, 0.04, h.z); x.under.scale.setScalar(R * 2.9);
        x.under.material.opacity = (0.15 + 0.6 * Math.pow(temp, 1.6)) * (1 - at(k, 0.88, 1)) * (0.9 + 0.1 * Math.sin(sec * 9));
        // impact flash and flung drops
        const ti = Math.max(0, sec - M_IMPACT);
        x.flash.position.set(h.x, h.y + 2.4, h.z); x.flash.scale.setScalar(2 + ease(at(ti, 0, 0.35)) * 5); x.flash.material.opacity = ti > 0 ? Math.max(0, 1 - ti / 0.3) : 0;
        const dp = x.drops.pos, g = 14;
        for (let i = 0; i < 34; i++) { const v = x.dv[i], y = Math.max(0.1, 1 + v[1] * ti - g * ti * ti / 2), landed = y <= 0.1 && ti > 0.1, r = landed ? 1 : 1;
            dp[i * 3] = h.x + v[0] * ti * (landed ? 0.2 + 0.8 * Math.exp(-(ti - 0.4) * 2) : 1) * r; dp[i * 3 + 1] = y; dp[i * 3 + 2] = h.z + v[2] * ti * (landed ? 0.2 + 0.8 * Math.exp(-(ti - 0.4) * 2) : 1); }
        x.drops.geometry.attributes.position.needsUpdate = true; x.drops.material.opacity = ti > 0 ? Math.max(0, 1 - ti / 0.9) : 0;
        // bubbles popping on the puddle, steam
        const bp = x.bub.pos;
        for (let i = 0; i < 36; i++) { const b = x.bseed[i], f = (sec * b[3] * 0.9 + b[2]) % 1, rr = b[1] * R * 0.75;
            bp[i * 3] = h.x + Math.cos(b[0]) * rr; bp[i * 3 + 1] = 0.15 + f * 1.1; bp[i * 3 + 2] = h.z + Math.sin(b[0]) * rr; }
        x.bub.geometry.attributes.position.needsUpdate = true; x.bub.material.opacity = k < MK ? 0 : Math.pow(temp, 1.5) * (1 - at(k, 0.85, 1));
        for (const s of x.steam) { const f = at(k, 0.4 + s.d[1] * 0.08, 0.95);
            s.position.set(h.x + s.d[0] * 2 * f + Math.sin(sec * 2 + s.d[2]) * 0.3, 1.5 + f * 2, h.z + (s.d[0] - 0.2) * f); s.scale.setScalar(2 + f * 3.5); s.material.opacity = 0.22 * Math.sin(Math.PI * f); }
    },
    end: cleanup,
};

// ---- nat 20: wings of fire ----
const WD = 2.2, W_IMPACT = 0.9, WK = W_IMPACT / WD;
const NP = 11, NC = 8;
function placeWings(x, sp, ext, fade, lift, sec) {
    const h = x.home;
    for (const w of x.wings) {
        const side = w.side, armAng = sp * 0.9, f = w.f, armLen = 2.1 * ext;
        const th = sp * (0.5 + f * 1.95) + (w.cov ? 0.12 * sp : 0) + 0.035 * Math.sin(sec * 15 + w.i * 0.9);
        const L = ext * (w.cov ? 0.5 : 1) * (2.7 + 1.9 * Math.sin(Math.PI * (0.12 + 0.76 * f)));
        const s = w.s;
        s.position.set(h.x + side * (0.45 + Math.sin(armAng) * armLen * f), 1.6 + (w.cov ? 0.2 : 0), h.z - Math.cos(armAng) * armLen * f * 0.8 - lift);
        s.scale.set(Math.max(0.01, L * (w.cov ? 0.3 : 0.24)), Math.max(0.01, L), 1);
        s.material.rotation = -side * th;
        s.material.opacity = fade * (w.cov ? 0.85 : 0.7);
        // white-hot at the roots of a wing, orange at the tips of the long feathers and as the wing fades
        s.material.color.setRGB(1, (w.cov ? 0.86 : 0.62) + 0.3 * (1 - f) - 0.15 * (1 - fade), (w.cov ? 0.5 : 0.18) + 0.35 * (1 - f) * fade);
    }
}
const nat20 = {
    key: 'n06-wings-of-fire', name: 'Wings of Fire', blurb: 'Two great wings of flame unfurl and beat, sweep forward, and burst into drifting golden feathers.', dur: WD, impact: W_IMPACT,
    start(x) {
        const t = tex(x.THREE); x.own = []; x.home = x.mesh.position.clone(); x.spin = 0;
        x.halo = spr(x, t.soft, 0xffa820); x.flash = spr(x, t.soft, 0xfff4d0); x.span = spr(x, t.soft, 0xff9a20);
        x.beam = [0, 1].map((i) => { const s = spr(x, t.soft, 0xffe08a); s.material.rotation = i * Math.PI / 2; return s; });
        x.wings = [];
        for (const side of [-1, 1]) for (let i = 0; i < NP + NC; i++) { const cov = i >= NP, j = cov ? i - NP : i, n = cov ? NC : NP, s = spr(x, t.feather, 0xffc040);
            s.center.set(0.5, 0.02); s.renderOrder = cov ? 2 : 1; x.wings.push({ s, side, cov, i, f: cov ? 0.04 + (j / (n - 1)) * 0.7 : j / (n - 1) }); }
        x.sparks = points(x, 110, 0xffd24a, 7); x.sv = Array.from({ length: 110 }, () => { const a = Math.random() * 6.28, s = 3 + Math.random() * 8; return [Math.cos(a) * s, 1 + Math.random() * 3, Math.sin(a) * s * 0.8]; });
        x.loose = Array.from({ length: 22 }, () => { const s = spr(x, t.feather, 0xffcf60), a = Math.random() * 6.28, v = 3 + Math.random() * 6;
            s.center.set(0.5, 0.5); s.renderOrder = 3; s.d = { vx: Math.cos(a) * v, vz: Math.sin(a) * v * 0.8, r: Math.random() * 6.28, w: (Math.random() - 0.5) * 7, sz: 0.7 + Math.random() * 0.9, ph: Math.random() * 6.28 }; return s; });
        placeWings(x, 0.1, 0.02, 0, 0, 0);
    },
    tick(k, x) {
        const sec = k * WD, h = x.home, post = at(k, WK, 1), ti = Math.max(0, sec - W_IMPACT);
        let sp, ext, fade = 1, lift = 0;
        if (k < WK) {
            const un = ease(at(k, 0, 0.12));
            const beat = at(k, 0.12, 0.32), sweep = at(k, 0.32, WK);
            sp = k < 0.12 ? 0.1 + 0.9 * un : k < 0.32 ? 0.62 + 0.38 * Math.cos(beat * 6.2832 * 2) : 1 - 0.88 * sweep * sweep;
            ext = 0.05 + 0.95 * un; lift = k > 0.12 && k < 0.32 ? 0.6 * (1 - Math.cos(beat * 6.2832 * 2)) * 0.5 : 0;
            x.spin += x.dt * (3 + 14 * k / WK);
            x.mesh.rotateOnWorldAxis(x.UP ||= new x.THREE.Vector3(0, 1, 0), x.spin);
            x.mesh.scale.setScalar(1 + 0.3 * ease(k / WK));
            x.mesh.position.set(h.x + (Math.random() - 0.5) * 0.08 * (k / WK), h.y, h.z + (Math.random() - 0.5) * 0.08 * (k / WK));
        } else {
            sp = 0.12 + 0.2 * ease(post); ext = 1 + 0.5 * ease(post); fade = 1 - smooth(at(post, 0, 0.22)); lift = ease(post) * 1.5;
            x.mesh.visible = false;
        }
        placeWings(x, sp, ext, fade, lift, sec);
        const pre = k < WK ? k / WK : 1;
        x.halo.position.set(h.x, 1.2, h.z); x.halo.scale.setScalar(2.5 + 4 * ease(pre) + 5 * ease(ti / 0.5)); x.halo.material.opacity = k < WK ? 0.25 + 0.5 * pre : 0.9 * Math.max(0, 1 - ti / 0.6);
        x.span.position.set(h.x, 1.1, h.z - 1); x.span.scale.set((1 + 6.5 * sp) * ext * 1.6, 3.2 * ext, 1); x.span.material.opacity = 0.32 * fade * ease(at(k, 0, 0.1));
        x.flash.position.set(h.x, 2.6, h.z); x.flash.scale.setScalar(1.5 + ease(Math.min(1, ti / 0.4)) * 8); x.flash.material.opacity = ti > 0 ? Math.max(0, 1 - ti / 0.4) : 0;
        x.beam.forEach((b, i) => { b.position.set(h.x, 2.8, h.z); b.scale.set(0.5 + 0.2 * i, 2 + ease(Math.min(1, ti / 0.35)) * 22, 1); b.material.opacity = ti > 0 ? Math.max(0, 1 - ti / 0.35) * 0.8 : 0; });
        // golden feather burst: points drifting out with drag, and loose feathers tumbling
        const dr = (1 - Math.exp(-1.3 * ti)) / 1.3 * 2.2, sp2 = x.sparks.pos;
        for (let i = 0; i < 110; i++) { const v = x.sv[i]; sp2[i * 3] = h.x + v[0] * dr; sp2[i * 3 + 1] = 1.5 + v[1] * dr; sp2[i * 3 + 2] = h.z + v[2] * dr - ti * 0.3; }
        x.sparks.geometry.attributes.position.needsUpdate = true; x.sparks.material.opacity = ti > 0 ? Math.max(0, 1 - ti / 1.25) : 0;
        for (const s of x.loose) {
            const d = s.d;
            if (ti <= 0) { s.material.opacity = 0; continue; }
            s.position.set(h.x + d.vx * dr + Math.sin(sec * 3 + d.ph) * 0.35 * ti, 2 + ti * 0.2, h.z + d.vz * dr + Math.cos(sec * 2.3 + d.ph) * 0.3 * ti + ti * 0.4);
            s.material.rotation = d.r + d.w * ti * Math.exp(-ti); s.scale.set(0.45 * d.sz * (0.6 + 0.4 * Math.abs(Math.cos(sec * 3 + d.ph))), 1.4 * d.sz, 1);
            s.material.opacity = Math.max(0, 1 - ti / 1.25) * 0.95; s.material.color.setRGB(1, 0.85 - 0.3 * ti / 1.25, 0.4 - 0.25 * ti / 1.25);
        }
    },
    end: cleanup,
};

export default { nat1, nat20 };
