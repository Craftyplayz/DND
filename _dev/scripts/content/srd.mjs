// The two Wizards SRDs from dnd5eapi.co: SRD 5.1 (2014, src "srd") and SRD 5.2 (2024, src "srd2024"), both CC-BY-4.0.
// 2014 classes/subclasses/races/subraces/backgrounds/feats come from sheets/player/srd-build.json (built from the same
// API by build-srd.mjs); this adds languages and equipment (packs keep their contents). 2024 is read from /api/2024 and
// turned into the same shapes. SRD spells and magic items come through open5e.mjs (whole pages, far fewer requests).
import { readFileSync } from 'node:fs';
import { getJson } from './fetch.mjs';

const API = 'https://www.dnd5eapi.co';
export const SKIPPED = [];
// {index,name,url} -> index; drops url / updated_at everywhere
function slim(v) {
    if (Array.isArray(v)) return v.map(slim);
    if (v && typeof v === 'object') {
        if (typeof v.url === 'string' && /^\/api\/20\d\d\//.test(v.url) && v.index) return v.index;
        const o = {};
        for (const [k, x] of Object.entries(v)) if (k !== 'url' && k !== 'updated_at') o[k] = slim(x);
        return o;
    }
    return v;
}
const paras = (s) => String(s || '').split(/\n+/).map((x) => x.replace(/\*\*/g, '').trim()).filter(Boolean);
const list = async (p) => (await getJson(API + p))?.results || [];

async function common(ver, tag) {
    const out = { languages: {}, equipment: {} };
    for (const r of await list(`/api/${ver}/languages`)) {
        const l = await getJson(API + r.url);
        out.languages[l.index] = { index: l.index, name: l.name, src: tag.src, rules: tag.rules, type: l.type || (l.is_rare ? 'Rare' : 'Standard'), script: slim(l.script) || null, typical_speakers: l.typical_speakers || [], desc: l.desc || '' };
    }
    for (const r of await list(`/api/${ver}/equipment`)) {
        const e = slim({ ...(await getJson(API + r.url)), url: undefined });
        out.equipment[e.index] = { ...e, ...tag };
    }
    return out;
}

export async function srd2014() {
    const tag = { src: 'srd', rules: '2014' };
    const d = JSON.parse(readFileSync(new URL('../../../sheets/player/srd-build.json', import.meta.url), 'utf8'));
    const out = await common('2014', tag);
    for (const k of ['classes', 'subclasses', 'races', 'subraces', 'backgrounds', 'feats']) {
        out[k] = {};
        for (const [i, e] of Object.entries(d[k])) { const { srd, homebrew, ...rest } = e; out[k][i] = { ...rest, ...tag }; }
    }
    return out;
}

export async function srd2024(log = () => {}) {
    const tag = { src: 'srd2024', rules: '2024' };
    const out = { ...(await common('2024', tag)), classes: {}, subclasses: {}, races: {}, subraces: {}, backgrounds: {}, feats: {} };
    const feature = async (ref) => {
        const f = await getJson(API + ref.url);
        return { index: f.index, name: f.name, level: f.level?.name ? +f.level.name.match(/\d+$/)[0] : f.level, desc: paras(f.description || f.desc) };
    };
    for (const r of await list('/api/2024/classes')) {
        const c = await getJson(API + r.url);
        const levels = [];
        for (const l of (await getJson(API + r.url + '/levels')) || []) {
            const o = slim({ ...l, features: undefined, class: undefined, subclass: undefined, index: undefined, name: undefined });
            o.features = [];
            for (const f of l.features || []) o.features.push({ ...(await feature(f)), level: l.level });
            levels.push(JSON.parse(JSON.stringify(o)));
        }
        const sc = slim(c.spellcasting);
        if (sc?.info) sc.info = sc.info.map((x) => ({ name: x.name, desc: [].concat(x.desc).flatMap(paras) }));
        out.classes[c.index] = {
            index: c.index, name: c.name, ...tag, hit_die: c.hit_die,
            proficiency_choices: slim(c.proficiency_choices || []), proficiencies: slim(c.proficiencies || []),
            saving_throws: slim(c.saving_throws || []), starting_equipment: slim(c.starting_equipment || []),
            starting_equipment_options: slim(c.starting_equipment_options || []), multi_classing: slim(c.multi_classing || {}),
            primary_ability: slim(c.primary_ability) || null,
            subclasses: (c.subclasses || []).map((s) => s.index), spellcasting: sc || null,
            spells: (await list(`/api/2024/classes/${c.index}/spells`)).map((s) => s.index), levels,
        };
    }
    for (const r of await list('/api/2024/subclasses')) {
        const s = await getJson(API + r.url);
        const by = new Map();
        for (const f of s.features || []) {
            if (!by.has(f.level)) by.set(f.level, []);
            by.get(f.level).push({ index: s.index + '-' + f.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), name: f.name, level: f.level, desc: paras(f.description) });
        }
        out.subclasses[s.index] = {
            index: s.index, class: slim(s.class), name: s.name, ...tag, subclass_flavor: s.summary || '', desc: paras(s.description),
            spells: [], levels: [...by].sort((a, b) => a[0] - b[0]).map(([level, features]) => ({ level, features })),
        };
    }
    const trait = async (ref) => { const t = await getJson(API + ref.url); return t ? { index: t.index, name: t.name, desc: paras(t.description || t.desc) } : { index: ref.index, name: ref.name, desc: [] }; };
    for (const r of await list('/api/2024/species')) {
        const x = await getJson(API + r.url);
        const traits = [];
        for (const t of x.traits || []) traits.push(await trait(t));
        out.races[x.index] = {
            index: x.index, name: x.name, ...tag, speed: x.speed, ability_bonuses: [], alignment: '', age: '', size: x.size || '',
            size_description: x.size_options ? 'Choose: ' + (x.size_options.from?.options || []).map((o) => o.size).join(' or ') : '', languages: [], language_desc: '',
            traits, subraces: (x.subspecies || []).map((s) => s.index),
        };
    }
    for (const r of await list('/api/2024/subspecies')) {
        const x = await getJson(API + r.url);
        const traits = [];
        for (const t of x.traits || []) traits.push(await trait(t));
        out.subraces[x.index] = { index: x.index, name: x.name, ...tag, race: slim(x.species), desc: '', ability_bonuses: [], traits };
    }
    for (const r of await list('/api/2024/backgrounds')) {
        const b = await getJson(API + r.url);
        const opts = slim(b.equipment_options || []);
        const gold = (b.equipment_options?.[0]?.from?.options?.[0]?.items || []).find((i) => i.option_type === 'money');
        out.backgrounds[b.index] = {
            index: b.index, name: b.name, ...tag, starting_proficiencies: slim(b.proficiencies || []), language_options: null,
            starting_equipment: [], starting_equipment_options: opts, feature: { name: '', desc: [] },
            personality_traits: null, ideals: null, bonds: null, flaws: null, starting_gold: gold ? gold.count : null,
            proficiency_choices: slim(b.proficiency_choices || []),
            ability_scores: slim(b.ability_scores || []), feat: b.feat ? b.feat.index + (b.feat.note ? ` (${b.feat.note})` : '') : null,
        };
    }
    for (const r of await list('/api/2024/feats')) {
        const f = await getJson(API + r.url);
        const pre = f.prerequisites ? slim(f.prerequisites) : f.prerequisite ? [{ desc: f.prerequisite }] : [];
        out.feats[f.index] = { index: f.index, name: f.name, ...tag, type: f.type || null, prerequisites: Array.isArray(pre) ? pre : [pre], desc: paras(f.description) };
    }
    log(`srd2024: ${Object.keys(out.classes).length} classes, ${Object.keys(out.subclasses).length} subclasses`);
    return out;
}
