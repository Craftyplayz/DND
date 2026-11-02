// Ember Cage trails, scorch marks: cooling char brands, and a smouldering skid streak with ember specks.
let SH = null; // shared geometry + materials, built on first make()
const NOISE = `
float hs(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(hs(i), hs(i + vec2(1., 0.)), f.x), mix(hs(i + vec2(0., 1.)), hs(i + vec2(1., 1.)), f.x), f.y); }
float fbm(vec2 p){ return .5 * vn(p) + .3 * vn(p * 2.1 + 5.) + .2 * vn(p * 4.3 + 11.); }`;
const VERT = `
attribute vec4 aD; // birth, seed, cool seconds, strength
uniform float uTime; varying vec2 vUv; varying vec4 vD; varying float vAge;
void main(){ vUv = uv; vD = aD; vAge = uTime - aD.x; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.); }`;
const FRAG_BRAND = `${NOISE}
varying vec2 vUv; varying vec4 vD; varying float vAge;
void main(){
  vec2 p = (vUv - .5) * 2.; float s = vD.y * 31.;
  float n = fbm(p * 2.4 + s);
  float d = length(p) - (n - .5) * 1.0 + (vn(p * 9. + s) - .5) * .12;
  float body = 1. - smoothstep(.55, .78, d);
  float rim = exp(-pow((d - .58) / .17, 2.));
  float vein = (1. - smoothstep(0., .07, abs(fbm(p * 5. + s * 2.) - .5))) * body * smoothstep(.1, .35, d);
  float cool = vD.z, life = cool + 1.8;
  float heat = pow(clamp(1. - vAge / cool, 0., 1.), 1.3);
  float fade = 1. - smoothstep(cool * .8, life, vAge);
  float a = body * (.5 + .4 * n) * fade * clamp(vAge / .05, 0., 1.) * (.7 + .3 * vD.w);
  float fl = .85 + .15 * sin(vAge * 17. + s);
  vec3 glow = mix(vec3(1., .38, .04), vec3(1., .85, .5), heat * heat) * (rim * 1.1 + vein * .9) * body * heat * fl * fade;
  glow += vec3(.5, .12, .01) * body * (1. - d) * heat * heat * .5;
  if (a < .004 && dot(glow, glow) < .0004) discard;
  gl_FragColor = vec4(vec3(.025, .017, .013) * a + glow, a);
}`;
const FRAG_STREAK = `${NOISE}
varying vec2 vUv; varying vec4 vD; varying float vAge;
void main(){
  float s = vD.y * 29.; float across = (vUv.y - .5) * 2.; float along = vUv.x;
  float edge = abs(across) + (fbm(vec2(along * 3. + s, across * 2. + s)) - .5) * .25;
  float body = 1. - smoothstep(.45, .9, edge);
  body *= smoothstep(0., .4, along) * smoothstep(1., .6, along);
  float cool = vD.z, life = cool * 1.6 + 1.5;
  float fade = 1. - smoothstep(cool * 1.2, life, vAge);
  float soot = (.55 + .45 * fbm(vec2(along * 6., across * 3.) + s)) * body;
  vec2 g = vec2(along * 5., across * 1.6) + s; vec2 c = floor(g); float h = hs(c);
  vec2 off = vec2(hs(c + 3.1), hs(c + 7.7)) * .6 + .2;
  float dt_ = step(.55, h) * (1. - smoothstep(.06, .24, length(fract(g) - off)));
  float eh = clamp(1. - vAge / (cool * 1.7), 0., 1.) * (.5 + .5 * sin(vAge * 8. + h * 40.));
  float spec = dt_ * body * eh;
  float core = (1. - smoothstep(0., .5, abs(across) * 1.4 + (fbm(vec2(along * 8. + s, 1.)) - .5) * .5)) * body;
  float heat = pow(clamp(1. - vAge / cool, 0., 1.), 1.5) * (.5 + .5 * vD.w);
  float a = soot * fade * .8 * clamp(vAge / .05, 0., 1.);
  vec3 glow = (vec3(1., .3, .03) * core * heat * .9 + mix(vec3(1., .5, .1), vec3(1., .9, .6), eh) * spec * 1.6) * fade;
  if (a < .004 && dot(glow, glow) < .0004) discard;
  gl_FragColor = vec4(vec3(.02, .015, .012) * a + glow, a);
}`;
function shared(THREE) {
    if (SH) return SH;
    const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
    const mk = f => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: f, uniforms: { uTime: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor });
    return SH = { geo, brand: mk(FRAG_BRAND), streak: mk(FRAG_STREAK), Y: new THREE.Vector3(0, 1, 0) };
}
function pool(THREE, scene, mat, N, y) {
    const S = shared(THREE), m = new THREE.InstancedMesh(S.geo.clone(), mat, N), d = new Float32Array(N * 4);
    const attr = new THREE.InstancedBufferAttribute(d, 4); attr.setUsage(THREE.DynamicDrawUsage); m.geometry.setAttribute('aD', attr);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; m.renderOrder = 1; m.position.y = y;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0); for (let i = 0; i < N; i++) m.setMatrixAt(i, zero);
    scene.add(m);
    const q = new THREE.Quaternion(), P = new THREE.Vector3(), Sc = new THREE.Vector3(), M = new THREE.Matrix4(); let k = 0;
    return {
        add(x, z, ang, sx, sz, birth, seed, cool, str) {
            q.setFromAxisAngle(S.Y, ang); M.compose(P.set(x, 0, z), q, Sc.set(sx, 1, sz)); m.setMatrixAt(k, M);
            d[k * 4] = birth; d[k * 4 + 1] = seed; d[k * 4 + 2] = cool; d[k * 4 + 3] = str; attr.needsUpdate = true; m.instanceMatrix.needsUpdate = true; k = (k + 1) % N;
        },
        dispose() { scene.remove(m); m.geometry.dispose(); m.dispose(); },
    };
}
export default [
    { key: 't01-scorch-brands', name: 'Scorch Brands', blurb: 'The die brands the board with charred, cracked marks whose glowing orange edges cool to black char before fading.',
      make(ctx) {
        const { THREE, scene, mesh, rnd } = ctx, S = shared(THREE), r = rnd(11), P = pool(THREE, scene, S.brand, 70, 0.03);
        let lx = 0, lz = 0, has = false, pvy = 0, acc = 0;
        return {
            tick(sec, dt, body) {
                S.brand.uniforms.uTime.value = sec;
                const p = body.position; if (!mesh.visible || p.y > 1.7) { has = false; pvy = body.velocity.y; return; }
                if (!has) { lx = p.x; lz = p.z; has = true; }
                const hit = pvy < -1.5 && body.velocity.y > pvy + 1.5; pvy = body.velocity.y;
                acc += Math.hypot(p.x - lx, p.z - lz); lx = p.x; lz = p.z;
                if (hit || acc > 0.5) {
                    const sp = Math.hypot(body.velocity.x, body.velocity.z), sz = (1.0 + Math.min(sp, 12) * 0.05) * (hit ? 1.6 : 1) * (0.8 + r() * 0.5);
                    P.add(p.x, p.z, r() * 6.28, sz, sz, sec, r(), 2.4 + r() * 1.6, hit ? 1 : 0.4 + 0.4 * r()); acc = 0;
                }
            },
            dispose() { P.dispose(); },
        };
      } },
    { key: 't01-smoulder-skid', name: 'Smouldering Skid', blurb: 'A continuous burnt streak with a glowing seam and drifting ember specks, wider where the die slams down.',
      make(ctx) {
        const { THREE, scene, mesh, rnd } = ctx, S = shared(THREE), r = rnd(23), P = pool(THREE, scene, S.streak, 80, 0.02);
        let lx = 0, lz = 0, has = false, pvy = 0, hit = 0;
        return {
            tick(sec, dt, body) {
                S.streak.uniforms.uTime.value = sec;
                const p = body.position; if (!mesh.visible || p.y > 1.7) { has = false; pvy = body.velocity.y; return; }
                if (body.velocity.y > pvy + 1.5 && pvy < -1.5) hit = 1; pvy = body.velocity.y; hit *= 0.9;
                if (!has) { lx = p.x; lz = p.z; has = true; return; }
                const dx = p.x - lx, dz = p.z - lz, L = Math.hypot(dx, dz); if (L < 0.22) return;
                const sp = Math.hypot(body.velocity.x, body.velocity.z), str = Math.min(1, sp / 10 + hit), w = 0.35 + 0.5 * str + 0.7 * hit;
                P.add((p.x + lx) / 2, (p.z + lz) / 2, Math.atan2(-dz, dx), L * 1.9, w, sec, r(), 2.6 + r() * 1.4, str);
                lx = p.x; lz = p.z;
            },
            dispose() { P.dispose(); },
        };
      } },
];
