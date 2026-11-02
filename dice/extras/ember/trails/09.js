// Ember Cage trails 09: branded face imprints that cool from red-hot to burnt, and heat-wave rings from every impact.
let S = null; // shared textures/geometry, built lazily because THREE arrives as an argument
function shared(THREE) {
    if (S) return S;
    const mk = (draw) => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); draw(g); const t = new THREE.CanvasTexture(c); return t; };
    const poly = (n) => mk((g) => {
        const pts = []; for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + i * 2 * Math.PI / n; pts.push([64 + 54 * Math.cos(a), 64 + 54 * Math.sin(a)]); }
        const path = () => { g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); };
        g.lineJoin = 'round'; path(); g.fillStyle = 'rgba(255,255,255,0.18)'; g.fill();
        g.shadowColor = '#fff'; g.shadowBlur = 8; g.strokeStyle = '#fff'; g.lineWidth = 7; path(); g.stroke();
    });
    S = {
        poly: { 3: poly(3), 4: poly(4), 5: poly(5) },
        glow: mk((g) => { const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.3, 'rgba(255,255,255,0.45)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128); }),
        ring: mk((g) => { const r = g.createRadialGradient(64, 64, 34, 64, 64, 62); r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(0.55, 'rgba(255,255,255,0.35)'); r.addColorStop(0.8, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128); }),
        geo: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    };
    return S;
}
const corners = (sides) => (sides === 4 || sides === 8 || sides === 20) ? 3 : sides === 12 ? 5 : 4;

function pool(THREE, scene, n, tex, additive) {
    const sh = shared(THREE), items = [];
    for (let i = 0; i < n; i++) {
        const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
        const m = new THREE.Mesh(sh.geo, mat); m.visible = false; m.position.y = 0.02 + i * 0.001; scene.add(m);
        items.push({ m, mat, age: 99, size: 1, life: 1, p: 0 });
    }
    return items;
}
function drop(scene, items) { items.forEach((it) => { scene.remove(it.m); it.mat.dispose(); }); }

// Detects an impact (downward velocity flipping up near the table) and when the die slides along it.
function impactor(body, onHit) {
    let lastVy = 0, lastX = body.position.x, lastZ = body.position.z;
    return (mesh) => {
        const p = body.position, vy = body.velocity.y;
        if (mesh.visible && p.y < 1.5 && lastVy < -0.5 && vy > lastVy + 0.5) onHit(Math.min(1, Math.abs(lastVy) / 14), false);
        else if (mesh.visible && p.y < 1.35 && Math.hypot(p.x - lastX, p.z - lastZ) > 1.6) { onHit(0.35, true); lastX = p.x; lastZ = p.z; }
        lastVy = vy;
    };
}

export default [
    {
        key: 't09-brand', name: 'Branded Imprints', blurb: 'Each landing brands a glowing face outline into the table that cools from red-hot to a dark burn scar.',
        make(ctx) {
            const { THREE, scene, mesh, body, sides } = ctx, sh = shared(THREE), n = corners(sides);
            const items = pool(THREE, scene, 24, sh.poly[n], false); let next = 0;
            const check = impactor(body, (power, slide) => {
                const it = items[next]; next = (next + 1) % items.length;
                const yaw = Math.atan2(2 * (body.quaternion.w * body.quaternion.y + body.quaternion.x * body.quaternion.z), 1 - 2 * (body.quaternion.y ** 2 + body.quaternion.x ** 2));
                it.m.position.x = body.position.x; it.m.position.z = body.position.z; it.m.rotation.y = yaw;
                it.size = 1.5 + power * 0.7; it.m.scale.set(it.size, 1, it.size); it.age = 0; it.m.visible = true;
            });
            return {
                tick(sec, dt) {
                    check(mesh);
                    for (const it of items) {
                        if (!it.m.visible) continue;
                        it.age += dt; const a = it.age;
                        if (a > 9) { it.m.visible = false; continue; }
                        const k = Math.min(1, a / 2.5); // 0 hot -> 1 cold
                        it.mat.color.setRGB(1 - 0.75 * k, 0.75 * (1 - k) ** 2 + 0.06, 0.25 * (1 - k) ** 3 + 0.03);
                        it.mat.opacity = a < 0.06 ? a / 0.06 : 0.95 * (a < 2.5 ? 1 : 1 - (a - 2.5) / 6.5 * 0.8);
                    }
                },
                dispose() { drop(scene, items); },
            };
        },
    },
    {
        key: 't09-heatwave', name: 'Heat Wave Rings', blurb: 'Every impact sends an orange shimmer ring rolling across the table and leaves a small glowing hot spot.',
        make(ctx) {
            const { THREE, scene, mesh, body } = ctx, sh = shared(THREE);
            const rings = pool(THREE, scene, 10, sh.ring, true), spots = pool(THREE, scene, 10, sh.glow, true); let next = 0;
            rings.forEach((r) => r.mat.color.setRGB(1, 0.45, 0.08)); spots.forEach((s) => s.mat.color.setRGB(1, 0.35, 0.05));
            const check = impactor(body, (power, slide) => {
                if (slide) return; const i = next; next = (next + 1) % rings.length; const r = rings[i], s = spots[i];
                r.m.position.x = s.m.position.x = body.position.x; r.m.position.z = s.m.position.z = body.position.z;
                r.p = 0.3 + power; r.age = s.age = 0; r.m.visible = s.m.visible = true;
                s.size = 1.4 + power * 1.2;
            });
            return {
                tick(sec, dt) {
                    check(mesh);
                    for (let i = 0; i < rings.length; i++) {
                        const r = rings[i], s = spots[i]; if (!r.m.visible) continue;
                        r.age += dt; s.age += dt; const k = r.age / (1.1 + r.p);
                        if (k >= 1 && s.age > 3) { r.m.visible = s.m.visible = false; continue; }
                        const sz = 1.2 + (2 + r.p * 6) * Math.min(1, k) ** 0.6; r.m.scale.set(sz, 1, sz);
                        r.mat.opacity = k >= 1 ? 0 : 0.55 * (1 - k) ** 1.8 * (0.4 + r.p * 0.6);
                        s.m.scale.set(s.size, 1, s.size); s.mat.opacity = 0.6 * Math.max(0, 1 - s.age / 3) ** 1.5;
                    }
                },
                dispose() { drop(scene, rings); drop(scene, spots); },
            };
        },
    },
];
