// Builds the character builder's content files in sheets/player/content/ from every source in _dev/scripts/content/:
//   node _dev/scripts/build-content.mjs          (CONTENT_REFRESH=1 to download again instead of using _dev/cache/content)
// The result is committed; the site never fetches any of this at play time. srd-build.json is left alone.
//
// Each source module returns categories in the srd-build.json shapes, every entry tagged with `src` and `rules`.
// Here they are merged: Unearthed Arcana / playtest entries are dropped, and of entries with the same name in one
// category and rules version only one is kept, in this order: wikidot, then the SRDs, then Open5e documents, A5E,
// Black Flag. References (subclass -> class, subrace -> race, spell -> classes, subclass spells) are resolved by
// index or name against what was kept; anything pointing nowhere is dropped and counted.
// Indexes are unique within one rules version and category (the 2014 and 2024 Wizard are both "wizard").
//
// Output, per rules version R (2014, 2024), each file {meta, <categories>} keyed by index:
//   R-classes.json  classes, subclasses        R-origins.json  races, subraces, backgrounds, feats, languages
//   R-spells.json   spells                     R-items.json    equipment, magic_items
// and index.json: the files with their sizes, counts, what was dropped, and the credits for /credits/.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { slug } from './content/fetch.mjs';
import { writeAliases } from './content/aliases.mjs';
import { bookOf, bookCounts, BOOK_CATS } from './content/books.mjs';
import * as wikiClasses from './content/wikidot-classes.mjs';
import * as wikiOther from './content/wikidot-other.mjs';
import * as srd from './content/srd.mjs';
import * as open5e from './content/open5e.mjs';
import * as a5e from './content/a5e.mjs';
import * as bf from './content/blackflag.mjs';

// CONTENT_OUT: write to another folder, with the books as the wiki gives them and no aliases (build-books.mjs reads that)
const OUT = process.env.CONTENT_OUT || join(import.meta.dirname, '../../sheets/player/content');
const RULES = ['2014', '2024'];
const FILES = { classes: ['classes', 'subclasses'], origins: ['races', 'subraces', 'backgrounds', 'feats', 'languages'], spells: ['spells'], items: ['equipment', 'magic_items'] };
const CATS = Object.values(FILES).flat();
export { RULES, FILES, CATS };
const RANK = (src) => /^wikidot/.test(src) ? 0 : /^srd/.test(src) ? 1 : src === 'a5e' ? 3 : src === 'bf' ? 4 : 2;
export const isUA = (e) => /\bUA\b|unearthed arcana|playtest/i.test(e.name) || /-ua$/.test(e.index);

// names that mean the same thing: "School of Evocation" = "Evocation", "Melf's Acid Arrow" = "Acid Arrow"
const SPELL_ALIAS = { "bigby's hand": 'arcane hand', "nystul's magic aura": "arcanist's magic aura", "mordenkainen's sword": 'arcane sword' };
export function nameKey(cat, name, parent = '') {
    // tags like "(HB)" or "(Amonkhet)" don't make a different thing: Tal'Dorei's Path of the Juggernaut is the older
    // version of wikidot's "Path of the Juggernaut (HB)" (the Reborn rewrite), which wins as wikidot
    // (items keep them: "Armor of Resistance (Acid)" and "(Cold)" are different items)
    let n = String(name).toLowerCase().replace(/’/g, "'");
    if (!['equipment', 'magic_items'].includes(cat)) n = n.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
    if (cat === 'spells') n = SPELL_ALIAS[n] || (n.startsWith("jim's") ? n : n.replace(/^[a-z]+'s /, ''));
    let s = slug(n);
    if (cat === 'subclasses') s = s.replace(/^(path|college|circle|oath|way|school|order|warrior)-of-(the-)?/, '').replace(/^the-/, '').replace(/-(domain|bloodline|sorcery|patron|tradition|archetype|conclave)$/, '');
    if (cat === 'subraces' && parent) s = s.split('-').filter((w) => !slug(parent).split('-').includes(w)).join('-') || s;
    return s;
}

const sources = [
    ['wikidot-classes', wikiClasses.default, wikiClasses.SKIPPED],
    ['wikidot-other', wikiOther.default, wikiOther.SKIPPED],
    ['srd2014', srd.srd2014, srd.SKIPPED],
    ['srd2024', srd.srd2024, srd.SKIPPED],
    ['open5e', open5e.default, open5e.SKIPPED],
    ['a5e', a5e.default, a5e.SKIPPED],
    ['bf', bf.default, bf.SKIPPED],
];

// The owner's rule (2026-11-03, "merge in SRD picks"): when a wikidot entry wins over the SRD's own entry for the same class,
// subclass, race, subrace or background, it keeps wikidot's text but takes the SRD's structured fields wherever wikidot's are
// missing or only words: proficiency and equipment choices, ability bonuses, language and trait choices, feature options
// (fighting styles...), spellcasting and each level's numbers. fill(wiki, srd) returns the merged value.
const SRD_FILL = new Set(['classes', 'subclasses', 'races', 'subraces', 'backgrounds']);
const isEmpty = (v) => v == null || v === '' || (Array.isArray(v) && !v.length) || (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length);
// a choice the wiki gives only in words: {desc, choose, from: null}
const wordsOnly = (v) => v && typeof v === 'object' && !Array.isArray(v) && 'choose' in v && !v.from;
const isChoice = (v) => v && typeof v === 'object' && !Array.isArray(v) && 'choose' in v;
const matchKey = (o) => (o && typeof o === 'object' ? (o.level != null && !o.name ? 'L' + o.level : o.name ? 'N' + slug(String(o.name).replace(/^.*?:\s*/, '')) : o.index ? 'I' + o.index : null) : null);
export function fill(w, s) {
    if (isEmpty(w) || (wordsOnly(w) && isChoice(s) && !wordsOnly(s))) return s === undefined ? w : structuredClone(s);
    if (Array.isArray(w) && Array.isArray(s)) {
        // lists of choices: the SRD's whole list when any of the wiki's is words only
        if ((w.some(wordsOnly) || w.some((x) => x === null)) && s.length && s.every((x) => isChoice(x) && !wordsOnly(x))) return structuredClone(s);
        // levels, features, traits: matched by level or name, each filled in; the wiki's own order and entries stay
        if (w.every((x) => matchKey(x)) && s.every((x) => matchKey(x))) {
            // a name matches exactly, or as the end of the other ("Cantrip" is the SRD's "High Elf Cantrip")
            const by = new Map(s.map((x) => [matchKey(x), x]));
            const near = (k) => (k[0] === 'N' && k.length > 4 ? s.find((x) => { const q = matchKey(x); return q[0] === 'N' && (q.endsWith('-' + k.slice(1)) || k.endsWith('-' + q.slice(1))); }) : undefined);
            return w.map((x) => { const m = by.get(matchKey(x)) ?? near(matchKey(x)); return m ? fill(x, m) : x; });
        }
        return w;
    }
    if (w && typeof w === 'object' && !Array.isArray(w) && s && typeof s === 'object' && !Array.isArray(s)) {
        const o = { ...w };
        for (const k of Object.keys(s)) if (!['index', 'name', 'src', 'rules', 'desc', 'subclasses', 'subraces', 'spells', 'class', 'race'].includes(k) || isEmpty(o[k])) o[k] = fill(o[k], s[k]);
        // a subclass's spell list (domain and oath spells) when the wiki has none
        if (isEmpty(w.spells) && Array.isArray(s.spells) && s.spells.length && s.spells.every((x) => x?.spell)) o.spells = structuredClone(s.spells);
        return o;
    }
    return w;
}

export function merge(parts) {
    // parts: [{ id, data }] in source order. Returns { out: {R: {cat: {}}}, dropped: [...] }
    const out = Object.fromEntries(RULES.map((r) => [r, Object.fromEntries(CATS.map((c) => [c, {}]))]));
    const alias = Object.fromEntries(RULES.map((r) => [r, Object.fromEntries(CATS.map((c) => [c, new Map()]))]));
    const dropped = [];
    const all = (cat) => parts.flatMap(({ id, data }, order) => Object.values(data[cat] || {}).map((e) => ({ id, order, e })))
        .filter(({ e }) => RULES.includes(e.rules))
        .sort((a, b) => RANK(a.e.src) - RANK(b.e.src) || a.order - b.order);
    const resolve = (r, cat, ref, id) => {
        if (ref == null) return undefined;
        const m = alias[r][cat];
        return m.get(`m:${id}:${ref}`) ?? m.get(`s:${ref}`) ?? m.get(`k:${nameKey(cat, String(ref).replace(/-/g, ' '))}`);
    };
    const nameOf = (cat, ref, id) => parts.find((p) => p.id === id)?.data[cat]?.[ref]?.name;
    const keep = (cat, { id, e }, key, parentIdx) => {
        const r = e.rules, m = alias[r][cat];
        if (isUA(e)) { dropped.push({ why: 'UA', cat, rules: r, name: e.name, src: e.src }); return null; }
        const k = `k:${key}`;
        if (m.has(k)) {
            const won = m.get(k);
            m.set(`m:${id}:${e.index}`, won); if (!m.has(`s:${slug(e.name)}`)) m.set(`s:${slug(e.name)}`, won);
            // the SRD's picks go into the wikidot entry that won (see fill)
            const w = out[r][cat][won];
            if (SRD_FILL.has(cat) && /^wikidot/.test(w.src) && /^srd/.test(e.src)) {
                const f = fill(w, e);
                // references stay the wiki's (they're resolved against what was kept); a subclass with no spell list of its
                // own takes the SRD's (domain and oath spells), resolved later by spell index like the wiki's
                for (const key of ['class', 'race', 'subclasses', 'subraces', 'spells']) if (key in w) f[key] = w[key]; else delete f[key];
                if (cat === 'subclasses' && isEmpty(w.spells) && e.spells?.length) f.spells = structuredClone(e.spells);
                Object.defineProperty(f, '_id', { value: w._id });
                out[r][cat][won] = f;
                (f.filled ||= []).push(e.src);
            }
            dropped.push({ why: 'duplicate', cat, rules: r, name: e.name, src: e.src, kept: out[r][cat][won].src });
            return null;
        }
        let idx = r === '2024' ? e.index.replace(/-2024$/, '') : e.index;
        if (out[r][cat][idx]) idx = parentIdx && !idx.startsWith(parentIdx) ? `${parentIdx}-${idx}` : idx;
        if (out[r][cat][idx]) idx = `${idx}-${slug(e.src)}`;
        for (let n = 2; out[r][cat][idx]; n++) idx = idx.replace(/-\d+$/, '') + '-' + n;
        const o = { ...e, index: idx };
        Object.defineProperty(o, '_id', { value: id });   // the source module, for its own references; not written
        out[r][cat][idx] = o;
        m.set(k, idx); m.set(`m:${id}:${e.index}`, idx);
        if (!m.has(`s:${e.index}`)) m.set(`s:${e.index}`, idx);
        if (!m.has(`s:${slug(e.name)}`)) m.set(`s:${slug(e.name)}`, idx);
        return o;
    };
    const unresolved = (cat, e, what, ref) => dropped.push({ why: 'unresolved', cat, rules: e.rules, name: e.name, src: e.src, ref: `${what} ${ref}` });

    for (const x of all('classes')) keep('classes', x, nameKey('classes', x.e.name));
    for (const x of all('races')) keep('races', x, nameKey('races', x.e.name));
    for (const x of all('subclasses')) {
        const cls = resolve(x.e.rules, 'classes', x.e.class, x.id) ?? resolve(x.e.rules, 'classes', slug(nameOf('classes', x.e.class, x.id) || ''), x.id);
        if (!cls) { unresolved('subclasses', x.e, 'class', x.e.class); continue; }
        const o = keep('subclasses', x, cls + '|' + nameKey('subclasses', x.e.name), cls);
        if (o) o.class = cls;
    }
    for (const x of all('subraces')) {
        const race = resolve(x.e.rules, 'races', x.e.race, x.id) ?? resolve(x.e.rules, 'races', slug(nameOf('races', x.e.race, x.id) || ''), x.id);
        if (!race) { unresolved('subraces', x.e, 'race', x.e.race); continue; }
        const o = keep('subraces', x, race + '|' + nameKey('subraces', x.e.name, out[x.e.rules].races[race].name), race);
        if (o) o.race = race;
    }
    for (const cat of ['spells', 'backgrounds', 'feats', 'languages', 'equipment', 'magic_items'])
        for (const x of all(cat)) {
            const o = keep(cat, x, nameKey(cat, x.e.name));
            if (!o) continue;
            if (cat === 'spells') o.classes = [...new Set((x.e.classes || []).map((c) => resolve(o.rules, 'classes', c, x.id) ?? (unresolved('spells', o, 'class', c), null)).filter(Boolean))];
        }
    // lists that point back: rebuilt from what was kept
    for (const r of RULES) {
        const O = out[r];
        for (const c of Object.values(O.classes)) {
            c.subclasses = Object.values(O.subclasses).filter((s) => s.class === c.index).map((s) => s.index);
            c.spells = Object.values(O.spells).filter((s) => s.classes.includes(c.index)).map((s) => s.index);
        }
        for (const x of Object.values(O.races)) x.subraces = Object.values(O.subraces).filter((s) => s.race === x.index).map((s) => s.index);
        for (const s of Object.values(O.subclasses)) {
            if (!Array.isArray(s.spells)) continue;
            s.spells = s.spells.filter((sp) => {
                const v = resolve(r, 'spells', sp.spell, s._id);
                if (!v) { unresolved('subclasses', s, 'spell', sp.spell); return false; }
                sp.spell = v; return true;
            });
        }
    }
    return { out, dropped };
}

// one entry per line: readable diffs, still small
export const write = (obj) => '{' + Object.entries(obj).map(([k, v]) => k === 'meta' ? JSON.stringify(k) + ':' + JSON.stringify(v)
    : JSON.stringify(k) + ':{\n' + Object.entries(v).map(([i, e]) => JSON.stringify(i) + ':' + JSON.stringify(e)).join(',\n') + '\n}').join(',\n') + '}\n';

const STATIC_CREDITS = [
    { src: 'srd', name: 'System Reference Document 5.1', publisher: 'Wizards of the Coast', licences: ['CC-BY-4.0'], permalink: 'https://dnd.wizards.com/resources/systems-reference-document', copyright: 'This work includes material taken from the System Reference Document 5.1 ("SRD 5.1") by Wizards of the Coast LLC and available at https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License available at https://creativecommons.org/licenses/by/4.0/legalcode.' },
    { src: 'srd2024', name: 'System Reference Document 5.2', publisher: 'Wizards of the Coast', licences: ['CC-BY-4.0'], permalink: 'https://www.dndbeyond.com/srd', copyright: 'This work includes material from the System Reference Document 5.2 ("SRD 5.2") by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.' },
    { src: 'a5e', name: 'Level Up Advanced 5th Edition SRD (Adventurer\'s Guide)', publisher: 'EN Publishing', licences: ['CC-BY-4.0'], permalink: 'https://a5esrd.com/a5esrd', copyright: 'This work includes material taken from the A5E System Reference Document (A5ESRD) by EN Publishing and available at A5ESRD.com, based on Level Up: Advanced 5th Edition, available at www.levelup5e.com. The A5ESRD is licensed under the Creative Commons Attribution 4.0 International License available at https://creativecommons.org/licenses/by/4.0/legalcode.', via: 'https://a5e.tools' },
    { src: 'bf', name: 'Black Flag Roleplaying Reference Document v0.1', publisher: 'Kobold Press', licences: ['ORC'], permalink: 'https://koboldpress.com/black-flag-reference-document/', copyright: 'ORC Notice. This product is licensed under the ORC License, located at the Library of Congress at TX 9-307-067, and available online at various locations including www.azoralaw.com/orclicense and others. All warranties are disclaimed as set forth therein. Attribution: This work includes material taken from the System Reference Document 5.1 ("SRD 5.1") by Wizards of the Coast LLC and available at https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License available at https://creativecommons.org/licenses/by/4.0/legalcode. Black Flag Roleplaying Reference Document v0.1, © Open Design, LLC d/b/a Kobold Press. Reserved Material: Reserved Material elements in this product include all elements designated as Reserved Material under the ORC License. Expressly Designated Licensed Material: This product contains no Expressly Designated Licensed Material.', via: 'https://bfrd.net' },
    { src: 'wikidot', name: 'dnd5e.wikidot.com', publisher: 'community wiki', licences: [], permalink: 'https://dnd5e.wikidot.com', copyright: 'Text gathered from the dnd5e.wikidot.com fan wiki for private use by our group. Dungeons & Dragons material there is © Wizards of the Coast; other entries belong to their authors.' },
    { src: 'wikidot2024', name: 'dnd2024.wikidot.com', publisher: 'community wiki', licences: [], permalink: 'https://dnd2024.wikidot.com', copyright: 'Text gathered from the dnd2024.wikidot.com fan wiki for private use by our group. Dungeons & Dragons material there is © Wizards of the Coast; other entries belong to their authors.' },
];

if (import.meta.main) {
    const notes = [];
    const log = (m) => notes.push(m);
    const parts = [];
    await Promise.all(sources.map(async ([id, load], i) => { parts[i] = { id, data: await load(log) }; console.log('loaded', id); }));
    const { out, dropped } = merge(parts);
    const skipped = [...new Set(sources.map((s) => s[2]))].flat();
    const ua = skipped.filter((s) => /UA|unearthed|playtest/i.test(s.why)).length + dropped.filter((d) => d.why === 'UA').length;
    // a credit for every source with at least one entry kept
    const present = new Set(RULES.flatMap((r) => CATS.flatMap((c) => Object.values(out[r][c]).map((e) => e.src))));
    const o5 = parts.find((p) => p.id === 'open5e').data._credits.filter((c) => !/^srd/.test(c.src));
    const credits = [...STATIC_CREDITS, ...o5].filter((c) => present.has(c.src)).map(({ used, key, ...c }) => c);
    if (!process.env.CONTENT_OUT) { const names = Object.fromEntries(credits.map((c) => [c.src, c.name])); for (const r of RULES) for (const c of BOOK_CATS) for (const e of Object.values(out[r][c])) e.book = bookOf(e, c, names); }
    mkdirSync(OUT, { recursive: true });
    const built = new Date().toISOString().slice(0, 10);
    const files = [], counts = {};
    for (const r of RULES) {
        counts[r] = Object.fromEntries(CATS.map((c) => [c, Object.keys(out[r][c]).length]));
        for (const [name, cats] of Object.entries(FILES)) {
            const srcs = [...new Set(cats.flatMap((c) => Object.values(out[r][c]).map((e) => e.src)))].sort();
            const body = write({ meta: { rules: r, built, sources: srcs, credits: '/credits/' }, ...Object.fromEntries(cats.map((c) => [c, out[r][c]])) });
            const file = `${r}-${name}.json`;
            writeFileSync(join(OUT, file), body);
            files.push({ file, rules: r, keys: cats, bytes: Buffer.byteLength(body), gzip: gzipSync(body).length });
        }
    }
    const sum = (why) => dropped.filter((d) => d.why === why).length;
    writeFileSync(join(OUT, 'index.json'), JSON.stringify({ books: process.env.CONTENT_OUT ? undefined : bookCounts(out), built, note: 'Indexes are unique within one rules version and category. Load the files for the character\'s rules.', files, counts, dropped: { ua, duplicates: sum('duplicate'), unresolved: sum('unresolved'), skipped_by_sources: skipped.length }, credits }, null, 1) + '\n');
    if (!process.env.CONTENT_OUT) writeAliases();
    writeFileSync(join(import.meta.dirname, '../cache/content/build-report.json'), JSON.stringify({ notes, skipped, dropped }, null, 1));
    console.table(counts);
    console.table(files.map((f) => ({ file: f.file, kB: Math.round(f.bytes / 1024), gzip_kB: Math.round(f.gzip / 1024) })));
    console.log('dropped: UA', ua, 'duplicates', sum('duplicate'), 'unresolved refs', sum('unresolved'), '(details in _dev/cache/content/build-report.json)');
}
