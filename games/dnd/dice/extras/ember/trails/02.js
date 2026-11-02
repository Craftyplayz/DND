// Ember Cage trails 2: a scatter of flickering dying embers, and a spark spray on every impact.
let G = null; // shared lazily: material + uniform
function shared(THREE) {
    if (G) return G;
    const u = { uPx: { value: 400 } };
    const mat = new THREE.ShaderMaterial({
        uniforms: u, transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor,
        vertexShader: 'attribute vec4 col; attribute float sz; varying vec4 vc; uniform float uPx; void main(){ vc=col; vec4 p=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*p; gl_PointSize=max(sz*projectionMatrix[0][0]*uPx,0.); }',
        fragmentShader: 'varying vec4 vc; void main(){ float d=length(gl_PointCoord-.5)*2.; if(d>1.) discard; float g=pow(1.-d,1.6); vec3 c=vc.rgb*(g+.5*step(d,.3))*vc.a; gl_FragColor=vec4(c,max(c.r,max(c.g,c.b))); }',
    });
    return (G = { u, mat });
}
const N = 80;
function pool(ctx) {
    const { THREE, scene } = ctx, g = shared(THREE);
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 3), col = new Float32Array(N * 4), sz = new Float32Array(N);
    for (let i = 0; i < N; i++) pos[i * 3 + 1] = -5;
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('col', new THREE.BufferAttribute(col, 4));
    geo.setAttribute('sz', new THREE.BufferAttribute(sz, 1));
    const pts = new THREE.Points(geo, g.mat); pts.frustumCulled = false; pts.renderOrder = 2; scene.add(pts);
    const P = { age: new Float32Array(N).fill(1e9), life: new Float32Array(N).fill(1), vx: new Float32Array(N), vy: new Float32Array(N), vz: new Float32Array(N), ph: new Float32Array(N), s: new Float32Array(N), head: 0 };
    return { geo, pts, pos, col, sz, P, g, scene };
}
function add(o, x, y, z, vx, vy, vz, life, s, ph) {
    const P = o.P, i = P.head; P.head = (i + 1) % N;
    o.pos[i * 3] = x; o.pos[i * 3 + 1] = y; o.pos[i * 3 + 2] = z;
    P.vx[i] = vx; P.vy[i] = vy; P.vz[i] = vz; P.age[i] = 0; P.life[i] = life; P.s[i] = s; P.ph[i] = ph;
}
// k 0..1 remaining life -> colour: white-yellow -> orange -> deep red
function heat(c, i, k, a) {
    const h = k * k;
    c[i * 4] = 0.35 + 0.65 * Math.min(1, k * 1.6); c[i * 4 + 1] = 0.7 * h * k; c[i * 4 + 2] = 0.25 * h * h; c[i * 4 + 3] = a;
}
function step(o, dt, sec, drag, grav, twinkle) {
    const P = o.P, p = o.pos, c = o.col, s = o.sz;
    o.g.u.uPx.value = (window.innerWidth * (window.devicePixelRatio || 1)) / 2;
    for (let i = 0; i < N; i++) {
        if (P.age[i] > P.life[i]) { s[i] = 0; continue; }
        P.age[i] += dt;
        const k = 1 - P.age[i] / P.life[i];
        if (k <= 0) { s[i] = 0; P.age[i] = 1e9; continue; }
        if (drag) { const f = Math.exp(-drag * dt); P.vx[i] *= f; P.vz[i] *= f; }
        P.vy[i] -= grav * dt;
        p[i * 3] += P.vx[i] * dt; p[i * 3 + 2] += P.vz[i] * dt;
        p[i * 3 + 1] = Math.max(0.02, Math.min(0.4, p[i * 3 + 1] + P.vy[i] * dt));
        const tw = twinkle ? 0.55 + 0.45 * Math.sin(sec * (9 + P.ph[i] % 7) + P.ph[i] * 40) : 1;
        heat(c, i, k, Math.min(1, k * 2.2) * tw);
        s[i] = P.s[i] * (0.5 + 0.5 * k);
    }
    o.geo.attributes.position.needsUpdate = o.geo.attributes.col.needsUpdate = o.geo.attributes.sz.needsUpdate = true;
}
function kill(o) { o.scene.remove(o.pts); o.geo.dispose(); }

export default [
    { key: 't02-dying-embers', name: 'Dying Embers', blurb: 'Glowing embers drop behind the die, flicker, and cool from yellow to deep red before going out.',
      make(ctx) {
        const o = pool(ctx), r = ctx.rnd(7); let lx = null, lz = null;
        return {
            tick(sec, dt, body) {
                const x = body.position.x, z = body.position.z;
                if (ctx.mesh.visible && body.position.y < 3) {
                    if (lx === null) { lx = x; lz = z; }
                    if (Math.hypot(x - lx, z - lz) > 0.35) {
                        lx = x; lz = z;
                        for (let n = 0; n < 2; n++) add(o, x + (r() - 0.5) * 1.3, 0.04, z + (r() - 0.5) * 1.3, (r() - 0.5) * 0.3, 0, (r() - 0.5) * 0.3, 2 + r() * 2.2, 0.55 + r() * 0.5, r());
                    }
                }
                step(o, dt, sec, 3, 0, true);
            },
            dispose() { kill(o); },
        };
      } },
    { key: 't02-spark-spray', name: 'Spark Spray', blurb: 'Every bounce throws a burst of bright sparks sideways across the table, with a faint ember line while sliding.',
      make(ctx) {
        const o = pool(ctx), r = ctx.rnd(13); let lx = null, lz = null, pv = 0, py = 1, air = false;
        return {
            tick(sec, dt, body) {
                const x = body.position.x, z = body.position.z, y = body.position.y, v = body.velocity;
                const sp = Math.hypot(v.x, v.z), tot = Math.hypot(v.x, v.y, v.z);
                if (ctx.mesh.visible) {
                    const landed = (air && y < 1.3) || (pv > 3 && tot < pv * 0.65);
                    if (y > 1.45) air = true; else if (y < 1.3) air = false;
                    if (landed && pv > 2.5) {
                        const cnt = Math.min(16, 6 + Math.round(pv));
                        const base = Math.atan2(v.z, v.x);
                        for (let n = 0; n < cnt; n++) {
                            const a = n % 3 ? r() * 6.283 : base + (r() - 0.5) * 1.2, s = 3 + r() * 8;
                            add(o, x, 0.08, z, Math.cos(a) * s, 0.5 + r() * 1.5, Math.sin(a) * s, 0.35 + r() * 0.6, 0.4 + r() * 0.3, r());
                        }
                    }
                    if (y < 1.4 && sp > 1.5) {
                        if (lx === null) { lx = x; lz = z; }
                        if (Math.hypot(x - lx, z - lz) > 0.5) { lx = x; lz = z; add(o, x, 0.04, z, 0, 0, 0, 1 + r() * 0.6, 0.4, r()); }
                    }
                }
                pv = tot; py = y;
                step(o, dt, sec, 2.5, 6, false);
            },
            dispose() { kill(o); },
        };
      } },
];
