import { dissolving } from './14.js';
// Ember Cage exits 45: Dissolve for nat 1, nat 20 and other rolls. Just the dissolve from Exploded View, Shatter and the coin: blobby holes open in the die until it is gone.
const make = (key) => ({
    key, name: 'Dissolve', blurb: 'Blobby holes open in the die and grow until nothing is left.',
    dur: 0.9,
    start(x) {
        if (!x.mesh.geometry.boundingSphere) x.mesh.geometry.computeBoundingSphere();
        x.u = { dis: { value: -0.1 }, f: { value: 1.8 / (x.mesh.geometry.boundingSphere.radius * x.mesh.scale.x) } }; x.swap = [];
        // the die and its churning overlay get dissolving copies of their materials (they are shared by every die of this kind); its shadow goes with it
        x.mesh.traverse((o) => { if (!o.isMesh) return; x.swap.push([o, o.material, o.castShadow]); o.castShadow = false;
            const ms = [].concat(o.material).map((m) => dissolving(m.clone(), x.u)); o.material = Array.isArray(o.material) ? ms : ms[0]; });
    },
    tick(k, x) { x.u.dis.value = 0.15 + 0.75 * k; }, // the noise sits mostly between 0.15 and 0.9
    end(x) { for (const [o, m, sh] of x.swap) { [].concat(o.material).forEach((c) => c.dispose()); o.material = m; o.castShadow = sh; } },
});

export default { nat1: make('a45-dissolve-1'), nat20: make('a45-dissolve-20'), mid: make('a45-dissolve') };
