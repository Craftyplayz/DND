// Every Open5e document (api.open5e.com v2) as plain 5e shapes. src = the Open5e document key, except the two Wizards
// SRDs, whose spells and magic items come from here as src "srd" / "srd2024" (their classes, races, backgrounds and feats
// come from srd.mjs, which has the structured level tables). The A5E Adventurer's Guide and Black Flag classes are left
// to a5e.mjs and blackflag.mjs, which read the full class pages. rules: "2024" for 5e-2024 documents, else "2014".
// Also returns _credits: one notice per document used (licences from v2, the copyright line from v1).
import { getJson, slug } from './fetch.mjs';

const V2 = 'https://api.open5e.com/v2/';
export const SKIPPED = [];
const SRD = { 'srd-2014': 'srd', 'srd-2024': 'srd2024' };
const SKILLS = ['Acrobatics', 'Animal Handling', 'Arcana', 'Athletics', 'Deception', 'History', 'Insight', 'Intimidation', 'Investigation',
    'Medicine', 'Nature', 'Perception', 'Performance', 'Persuasion', 'Religion', 'Sleight of Hand', 'Stealth', 'Survival'];
const ABIL = { strength: 'str', dexterity: 'dex', constitution: 'con', intelligence: 'int', wisdom: 'wis', charisma: 'cha' };
const NUM = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4 };
const A5E = 'This work includes material taken from the A5E System Reference Document (A5ESRD) by EN Publishing and available at A5ESRD.com, based on Level Up: Advanced 5th Edition, available at www.levelup5e.com. The A5ESRD is licensed under the Creative Commons Attribution 4.0 International License available at https://creativecommons.org/licenses/by/4.0/legalcode.';
const isUA =(s) => /\bUA\b|unearthed arcana|playtest/i.test(s || '');

// markdown -> plain paragraphs; table rows become "a | b", separator rows go
const md = (s) => String(s || '').replace(/\r/g, '').split(/\n+/)
    .map((l) => l.trim()).filter((l) => l && !/^\|?\s*:?-{2,}/.test(l))
    .map((l) => l.startsWith('|') ? l.replace(/^\||\|$/g, '').split('|').map((c) => c.trim()).join(' | ') : l)
    .map((l) => l.replace(/^#+\s*/, '').replace(/\*\*\*|\*\*|__/g, '').replace(/(^|\W)[*_]([^*_]+)[*_](?=\W|$)/g, '$1$2').replace(/^\* /, '- '))
    .filter(Boolean);
const one = (s) => md(s).join(' ');

async function all(path, doc) {
    const out = [];
    let url = `${V2}${path}/?document__key__iexact=${doc}&limit=100`;
    while (url) { const r = await getJson(url); out.push(...(r?.results || [])); url = r?.next || null; }
    return out;
}

function tables(text) {
    // markdown tables -> { header: [rows] } using the table's second header cell ("Personality Trait", "Ideal", ...)
    const out = {};
    let head = null;
    for (const l of String(text || '').replace(/\r/g, '').split('\n').map((x) => x.trim())) {
        if (!l.startsWith('|')) { head = null; continue; }
        const cells = l.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
        if (/^:?-{2,}/.test(cells[0])) continue;
        if (!head) { head = cells[1] || cells[0]; out[head] = []; continue; }
        out[head].push(one(cells[cells.length - 1]));
    }
    return out;
}
const options = (rows, ideal) => rows?.length ? { choose: 1, type: ideal ? 'ideals' : 'strings', from: { option_set_type: 'options_array', options: rows.map((r) => ideal ? { option_type: 'ideal', desc: r, alignments: [] } : { option_type: 'string', string: r }) } } : null;

function subclass(c, tag) {
    const by = new Map();
    for (const f of c.features || []) {
        const lv = f.gained_at?.[0]?.level ?? Math.min(...(c.features || []).flatMap((g) => g.gained_at || []).map((g) => g.level).concat(99));
        if (!by.has(lv)) by.set(lv, []);
        by.get(lv).push({ index: slug(c.name + ' ' + f.name), name: f.name, level: lv, desc: md(f.desc) });
    }
    return {
        index: slug(c.name), class: slug(c.subclass_of.name), name: c.name, ...tag, subclass_flavor: '', desc: md(c.desc), spells: [],
        levels: [...by].sort((a, b) => a[0] - b[0]).map(([level, features]) => ({ level: level === 99 ? null : level, features })),
    };
}

function race(s, tag) {
    const traits = [], o = { index: slug(s.name), name: s.name, ...tag, speed: null, ability_bonuses: [], alignment: '', age: '', size: '', size_description: '', languages: [], language_desc: '', traits };
    for (const t of s.traits || []) {
        const d = one(t.desc).replace(new RegExp('^' + t.name + '\\.\\s*'), '');
        const n = t.name.toLowerCase();
        if (n === 'ability score increase') {
            const fixed = [...d.matchAll(/\b(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) score increases by (\d)/gi)];
            if (fixed.length && !/choice|choose|another|other/i.test(d)) o.ability_bonuses = fixed.map((m) => ({ ability_score: ABIL[m[1].toLowerCase()], bonus: +m[2] }));
            else traits.push({ index: slug(t.name), name: t.name, desc: [d] });
        } else if (n === 'speed') { o.speed = +(d.match(/(\d+)\s*feet/) || [])[1] || null; if (!o.speed) traits.push({ index: 'speed', name: t.name, desc: [d] }); }
        else if (n === 'size') { o.size = (d.match(/Your size is (\w+)/i) || [])[1] || ''; o.size_description = d; }
        else if (n === 'age') o.age = d;
        else if (n === 'alignment') o.alignment = d;
        else if (n === 'languages') { o.language_desc = d; o.languages = [...d.matchAll(/\b(Common|Dwarvish|Elvish|Giant|Gnomish|Goblin|Halfling|Orc|Abyssal|Celestial|Draconic|Deep Speech|Infernal|Primordial|Sylvan|Undercommon)\b/g)].map((m) => slug(m[1])).filter((x, i, a) => a.indexOf(x) === i); }
        else traits.push({ index: slug(t.name), name: t.name, desc: md(t.desc) });
    }
    if (s.desc) o.desc = md(s.desc);
    return o;
}

function background(b, tag) {
    const o = { index: slug(b.name), name: b.name, ...tag, starting_proficiencies: [], language_options: null, starting_equipment: [], starting_equipment_options: [], feature: { name: '', desc: [] }, personality_traits: null, ideals: null, bonds: null, flaws: null, starting_gold: null, desc: md(b.desc) };
    for (const x of b.benefits || []) {
        const d = one(x.desc);
        if (x.type === 'skill_proficiency') {
            const found = SKILLS.filter((s) => new RegExp('\\b' + s + '\\b', 'i').test(d));
            if (found.length && !/choice|choose/i.test(d)) o.starting_proficiencies.push(...found.map((s) => 'skill-' + slug(s)));
            else o.desc.push('Skill Proficiencies: ' + d);
        } else if (x.type === 'language') {
            const m = d.match(/\b(one|two|three|a|an)\b[^.]*\b(choice|choose)/i) || d.match(/\b(one|two|three)\b/i);
            if (m && /choice|choose|other/i.test(d)) o.language_options = { choose: NUM[m[1].toLowerCase()] || 1, type: 'languages', from: null };
            o.desc.push('Languages: ' + d);
        } else if (x.type === 'equipment') {
            o.starting_equipment_options.push({ desc: d, choose: 1, type: 'equipment', from: null });
            const g = d.match(/(\d+)\s*gp/i); if (g) o.starting_gold = +g[1];
        } else if (x.type === 'feature') o.feature = { name: x.name, desc: md(x.desc) };
        else if (x.type === 'suggested_characteristics') {
            const t = tables(x.desc), pick = (re) => Object.entries(t).find(([h]) => re.test(h))?.[1];
            o.personality_traits = options(pick(/personality/i)); o.ideals = options(pick(/ideal/i), true);
            o.bonds = options(pick(/bond/i)); o.flaws = options(pick(/flaw/i));
            const intro = md(x.desc.split('\n|')[0]); if (intro.length) o.desc.push(...intro);
        } else o.desc.push(`${x.name}: ${d}`);
    }
    return o;
}

function feat(f, tag) {
    const pre = (f.prerequisite || '').replace(/[*_]/g, '').trim();
    const m = pre.match(/^(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) (\d+) or higher$/i);
    return {
        index: slug(f.name), name: f.name, ...tag, type: f.type || null,
        prerequisites: m ? [{ ability_score: ABIL[m[1].toLowerCase()], minimum_score: +m[2] }] : pre ? [{ desc: pre }] : [],
        desc: [...md(f.desc), ...(f.benefits || []).map((x) => '- ' + one(x.desc))],
    };
}

const TIME = { action: '1 action', bonus_action: '1 bonus action', reaction: '1 reaction' };
function spell(s, tag) {
    const ct = TIME[String(s.casting_time).replace('-', '_')] || String(s.casting_time || '').replace(/^(\d+)([a-z]+)$/i, '$1 $2');
    const comps = [s.verbal && 'V', s.somatic && 'S', s.material && 'M'].filter(Boolean);
    const cap = (x) => x ? x[0].toUpperCase() + x.slice(1) : '';
    return {
        index: slug(s.name), name: s.name, ...tag, level: s.level, school: s.school?.name || '',
        classes: (s.classes || []).map((c) => slug(c.name)), casting_time: cap(ct) + (s.casting_time === 'reaction' && s.reaction_condition ? ', ' + s.reaction_condition : ''),
        range: s.range_text || '', components: comps, material: s.material ? (s.material_specified || null) : null,
        duration: cap(s.duration || ''), concentration: !!s.concentration, ritual: !!s.ritual,
        desc: md(s.desc), higher_level: md(s.higher_level),
    };
}

function magicItem(m, tag) {
    return { index: slug(m.name), name: m.name, ...tag, rarity: m.rarity?.name || '', type: m.category?.name || '', attunement: !!m.requires_attunement, desc: md(m.desc) };
}

export default async function load(log = () => {}) {
    const out = { classes: {}, subclasses: {}, races: {}, subraces: {}, backgrounds: {}, feats: {}, spells: {}, languages: {}, magic_items: {}, _credits: [] };
    const docs = (await getJson(V2 + 'documents/?limit=100')).results;
    const v1 = Object.fromEntries(((await getJson('https://api.open5e.com/v1/documents/?limit=100'))?.results || []).map((d) => [d.v2_related_key, d]));
    for (const doc of docs) {
        const tag = { src: SRD[doc.key] || doc.key, rules: doc.gamesystem?.key === '5e-2024' ? '2024' : '2014' };
        const srd = !!SRD[doc.key];
        let used = 0;
        const put = (cat, e) => {
            if (isUA(e.name)) { SKIPPED.push({ cat, name: e.name, why: 'UA/playtest' }); return; }
            // a5e-ag and others share names (e.g. "Fireball" in several docs): one index per doc in this module
            let i = e.index; if (out[cat][i]) i = e.index = `${e.index}-${doc.key}`;
            out[cat][i] = e; used++;
        };
        if (!srd && !['a5e-ag', 'bfrd'].includes(doc.key)) {
            const cls = await all('classes', doc.key);
            for (const c of cls) {
                if (c.subclass_of) put('subclasses', subclass(c, tag));
                else { SKIPPED.push({ cat: 'classes', name: c.name, why: `base class from Open5e ${doc.key} not converted` }); log(`open5e: base class ${c.name} (${doc.key}) not converted`); }
            }
            const species = await all('species', doc.key);
            const byKey = Object.fromEntries(species.map((s) => [s.key, s]));
            for (const s of species) {
                if (!s.subspecies_of) { put('races', { ...race(s, tag), subraces: [] }); continue; }
                const parent = byKey[s.subspecies_of.key || s.subspecies_of];
                const sub = race(s, tag);
                put('subraces', { index: sub.index, name: s.name, ...tag, race: slug(parent ? parent.name : String(s.subspecies_of.name || s.subspecies_of).replace(/^[a-z0-9-]+_/, '')), desc: one(s.desc), ability_bonuses: sub.ability_bonuses, traits: sub.traits });
            }
            for (const b of await all('backgrounds', doc.key)) put('backgrounds', background(b, tag));
            for (const f of await all('feats', doc.key)) put('feats', feat(f, tag));
        }
        for (const s of await all('spells', doc.key)) put('spells', spell(s, tag));
        for (const m of await all('magicitems', doc.key)) put('magic_items', magicItem(m, tag));
        if (!srd) for (const l of await all('languages', doc.key)) put('languages', { index: slug(l.name), name: l.name, ...tag, type: l.is_exotic ? 'Exotic' : 'Standard', script: l.script_language || null, typical_speakers: [], desc: one(l.desc) });
        const c = v1[doc.key];
        out._credits.push({ key: doc.key, src: tag.src, name: doc.name, publisher: doc.publisher?.name || doc.publisher?.key || '', author: doc.author || c?.author || '', licences: (doc.licenses || []).map((l) => l.name || l.key || l), permalink: doc.permalink || '',
            // v1 has the Section 15 / attribution line for most documents; the rest get one built from v2's fields
            copyright: c?.copyright || (doc.publisher?.key === 'en-publishing' ? A5E : `${doc.name}${doc.author ? ' by ' + doc.author : ''}, ${doc.publisher?.name || ''}. Used under the ${(doc.licenses || []).map((l) => l.name || l.key).join(' and ')}.`), used });
    }
    // subclasses point at the base class by name; races list their subraces
    for (const s of Object.values(out.subraces)) out.races[s.race]?.subraces.push(s.index);
    return out;
}
