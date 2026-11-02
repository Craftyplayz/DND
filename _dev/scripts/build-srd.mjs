// Builds sheets/player/srd-build.json from dnd5eapi.co /api/2014 (SRD 5.1, CC-BY-4.0). Run by hand:
//   node _dev/scripts/build-srd.mjs
// The result is committed; the site never calls the API for this. References become plain index strings.
import { writeFileSync } from 'node:fs';
const API = 'https://www.dnd5eapi.co';
const cache = new Map();
async function get(path) {
    if (cache.has(path)) return cache.get(path);
    const p = (async () => {
        for (let i = 0; i < 4; i++) {
            try { const r = await fetch(API + path); if (r.ok) return await r.json(); if (r.status === 404) return null; } catch { /* retry */ }
            await new Promise((s) => setTimeout(s, 500 * (i + 1)));
        }
        throw new Error('failed ' + path);
    })();
    cache.set(path, p);
    return p;
}
// {index,name,url} -> index; drops url / updated_at everywhere
function slim(v) {
    if (Array.isArray(v)) return v.map(slim);
    if (v && typeof v === 'object') {
        if (typeof v.url === 'string' && v.url.startsWith('/api/2014/') && v.index) return v.index;
        const o = {};
        for (const [k, x] of Object.entries(v)) if (k !== 'url' && k !== 'updated_at') o[k] = slim(x);
        return o;
    }
    return v;
}
const body = (o) => slim({ ...o, url: undefined });
const entry = (o, extra = {}) => ({ ...body(o), srd: true, homebrew: false, ...extra });
async function feature(ref) {
    const f = await get(ref.url);
    const o = { index: f.index, name: f.name, level: f.level, desc: f.desc };
    if (f.prerequisites?.length) o.prerequisites = slim(f.prerequisites);
    const fs = f.feature_specific;
    if (fs) {
        const refs = [...(fs.subfeature_options?.from?.options || []).map((x) => x.item), ...(fs.invocations || [])];
        if (refs.length) {
            o.choices = { choose: fs.subfeature_options?.choose ?? null, options: [] };
            for (const r of refs) { const c = await get(r.url); o.choices.options.push({ index: c.index, name: c.name, desc: c.desc, ...(c.prerequisites?.length ? { prerequisites: slim(c.prerequisites) } : {}) }); }
        }
        const rest = slim({ ...fs, subfeature_options: undefined, invocations: undefined });
        if (Object.keys(JSON.parse(JSON.stringify(rest))).length) o.feature_specific = JSON.parse(JSON.stringify(rest));
    }
    return o;
}
async function levels(path) {
    const out = [];
    for (const l of (await get(path)) || []) {
        const o = body({ ...l, features: undefined, class: undefined, subclass: undefined, index: undefined });
        o.features = [];
        for (const f of l.features || []) o.features.push(await feature(f));
        out.push(JSON.parse(JSON.stringify(o)));
    }
    return out;
}
async function pool(items, fn, n = 6) {
    const res = new Array(items.length); let i = 0;
    await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; res[k] = await fn(items[k]); } }));
    return res;
}
const list = async (p) => (await get(p)).results;
const out = { meta: { source: 'dnd5eapi.co /api/2014 (D&D 5e SRD 5.1)', licence: 'CC-BY-4.0', credit: 'This work includes material from the System Reference Document 5.1 by Wizards of the Coast LLC, licensed under CC-BY-4.0.', built: new Date().toISOString().slice(0, 10) }, classes: {}, subclasses: {}, races: {}, subraces: {}, backgrounds: {}, feats: {} };

await pool(await list('/api/2014/classes'), async (r) => {
    const c = await get(r.url);
    out.classes[c.index] = entry({ ...c, class_levels: undefined, subclasses: undefined }, {
        levels: await levels(c.url + '/levels'),
        spells: (await list(c.url + '/spells')).map((s) => s.index),
        subclasses: c.subclasses.map((s) => s.index),
    });
});
await pool(await list('/api/2014/subclasses'), async (r) => {
    const s = await get(r.url);
    out.subclasses[s.index] = entry({ ...s, subclass_levels: undefined }, { levels: await levels(s.url + '/levels') });
});
await pool(await list('/api/2014/races'), async (r) => {
    const x = await get(r.url);
    const traits = [];
    for (const t of x.traits) { const d = await get(t.url); traits.push({ ...body({ ...d, races: undefined, subraces: undefined, parent: undefined }) }); }
    out.races[x.index] = entry({ ...x, traits: undefined, subraces: undefined }, { traits, subraces: x.subraces.map((s) => s.index) });
});
await pool(await list('/api/2014/subraces'), async (r) => {
    const x = await get(r.url);
    const traits = [];
    for (const t of x.racial_traits) { const d = await get(t.url); traits.push(body({ ...d, races: undefined, subraces: undefined })); }
    out.subraces[x.index] = entry({ ...x, racial_traits: undefined }, { traits });
});
for (const r of await list('/api/2014/backgrounds')) out.backgrounds[r.index] = entry(await get(r.url));
for (const r of await list('/api/2014/feats')) out.feats[r.index] = entry(await get(r.url));

writeFileSync(new URL('../../sheets/player/srd-build.json', import.meta.url), JSON.stringify(out, null, 1) + '\n');
console.log('wrote', Object.keys(out).map((k) => k + ':' + Object.keys(out[k]).length).join(' '));
