// Black Flag Reference Document (Kobold Press; ORC licence + CC-BY 4.0) from bfrd.net, converted to plain 5e shapes.
// bfrd.net is WordPress: its REST API gives every page/post's HTML in a dozen requests instead of a crawl.
// Conversion (owner's choice): lineage -> race, talent -> feat, heritage -> `cultures` (where they go is still open).
import { getJson, slug, text, paras, decode } from './fetch.mjs';

export const SKIPPED = [];
const SRC = 'bf', RULES = '2014', API = 'https://bfrd.net/wp-json/wp/v2/';
const base = (index, name) => ({ index, name, src: SRC, rules: RULES });
const ABIL = { strength: 'str', dexterity: 'dex', constitution: 'con', intelligence: 'int', wisdom: 'wis', charisma: 'cha' };
const NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
const SKILLS = ['acrobatics', 'animal-handling', 'arcana', 'athletics', 'deception', 'history', 'insight', 'intimidation', 'investigation',
    'medicine', 'nature', 'perception', 'performance', 'persuasion', 'religion', 'sleight-of-hand', 'stealth', 'survival'];
const CIRCLES = ['arcane', 'divine', 'primordial', 'wyrd'];
// Kobold Press blog previews mirrored on bfrd.net next to the BFRD; not part of the BFRD itself, so their licence is unclear.
const NOT_BFRD = ['gnoll-lineage', 'junker', 'badlander'];

async function all(type) {
    const out = [];
    for (let p = 1; ; p++) {
        let j;
        try { j = await getJson(`${API}${type}?per_page=100&page=${p}`); } catch (e) { if (p > 1) break; throw e; }   // WP answers 400 past the last page
        if (!j?.length) break;
        out.push(...j);
        if (j.length < 100) break;
    }
    return out;
}

// tables -> one paragraph per row ("a | b | c"); cells may hold <p>s (the Word-pasted magic item tables)
const tables = (h) => h.replace(/<table[\s\S]*?<\/table>/gi, (t) => [...t.matchAll(/<tr[\s\S]*?<\/tr>/gi)]
    .map((r) => [...r[0].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((c) => text(c[1])))
    .filter((cells) => cells.some(Boolean)).map((cells) => '<p>' + cells.join(' | ').replace(/</g, '&lt;') + '</p>').join(''));
const P = (h) => paras(tables(h).replace(/\s+/g, ' '));   // tags can span lines and paras() splits on newlines
const rows = (h) => [...h.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((r) => [...r[0].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((c) => text(c[1])));
const clean = (h) => h.replace(/<div class="wp-block-rank-math-toc-block"[\s\S]*?<\/div>/g, '');
// bold-italic labels ("<strong><em>Speed.</em></strong>") -> \u0001Speed\u0002 so they survive paras()
const LABEL = /<(strong|em)>\s*<(em|strong)>([^<]+?)<\/\2>((?:&nbsp;|\s)*)<\/\1>\.?/g;
const labelled = (h) => P(h.replace(LABEL, (m, a, b, n) => '\u0001' + decode(n).replace(/[.\s ]+$/, '') + '\u0002 '));

// HTML -> [{lvl, name, html}] split at every heading; [0] is whatever came before the first heading
function sections(h) {
    const out = [{ lvl: 0, name: '', html: '' }];
    let last = 0;
    for (const m of h.matchAll(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi)) {
        out[out.length - 1].html = h.slice(last, m.index);
        out.push({ lvl: +m[1], name: text(m[2]), html: '' });
        last = m.index + m[0].length;
    }
    out[out.length - 1].html = h.slice(last);
    return out;
}

// labelled paragraphs -> [{name, desc[]}]; unlabelled paragraphs before the first label go to intro
function traits(h) {
    const intro = [], list = [];
    for (const p of labelled(h)) {
        const m = p.match(/^\u0001(.+?)\u0002\s*(.*)$/);
        if (m) list.push({ name: m[1], desc: [m[2]].filter(Boolean) });
        else (list.length ? list[list.length - 1].desc : intro).push(p.replace(/\u0001(.+?)\u0002/g, '$1.'));   // labelled list items ("- Gnomish. ...")
    }
    return { intro, list };
}

const ord = (s) => [...String(s).matchAll(/(\d+)(?:st|nd|rd|th)/g)].map((m) => +m[1]);
const val = (s) => /^[+-]?\d+$/.test(s) ? +s : s;
const snake = (s) => slug(s).replace(/-/g, '_');
const isUA = (s) => /\bUA\b|unearthed arcana|playtest/i.test(s);

// "Choose two from A, B, and C" -> srd proficiency_choices entry (skills as skill-<slug>)
function skillChoice(t) {
    const m = t.match(/(?:choose )?(\w+)(?: skills of your choice| from (.*))/i);
    if (!m || !NUM[m[1].toLowerCase()]) return null;
    const names = m[2] ? m[2].replace(/\.$/, '').split(/,\s*(?:or\s+|and\s+)?|\s+(?:or|and)\s+/).filter(Boolean).map((s) => 'skill-' + slug(s))
        : SKILLS.map((s) => 'skill-' + s);   // "Any three skills of your choice": the srd bard does the same
    return { desc: t, choose: NUM[m[1].toLowerCase()], type: 'proficiencies',
        from: { option_set_type: 'options_array', options: names.map((item) => ({ option_type: 'reference', item })) } };
}
// "Light armor, medium armor, and shields" -> ["light-armor", ...]; choices ("one tool of your choice") are left to desc
const profList = (t) => /choice|^none$|^—$/i.test(t) ? [] : t.split(/,\s*(?:and\s+)?|\s+and\s+/).filter(Boolean).map(slug);

// "Prerequisite: STR 13 or Higher, Proficiency with ..." -> srd prerequisites
function prereqs(t) {
    if (!t) return [];
    return t.split(/,\s*/).map((part) => {
        const m = part.match(/^(STR|DEX|CON|INT|WIS|CHA) (\d+) or Higher$/i);
        return m ? { ability_score: m[1].toLowerCase(), minimum_score: +m[2] } : { desc: part };
    });
}

// one feature per "<em>Nth-Level X Feature</em>" section; deeper headings belong to the feature above them
function features(h) {
    const feats = [];
    let cur = null;
    for (const s of sections(clean(h)).slice(1)) {
        const ps = P(s.html), em = ps[0]?.match(/^([\w, ]*?\d+(?:st|nd|rd|th))-Level .* Feature$/);   // usually in <em>, not always
        if (em) {
            cur = { name: s.name, lvl: s.lvl, levels: ord(em[1]), desc: ps.slice(1), subs: [] };
            feats.push(cur);
        } else if (cur && s.lvl > cur.lvl) {
            cur.desc.push(s.name, ...ps);
            cur.subs.push({ name: s.name, desc: ps });
        } else if (cur) {
            // a heading with no level line: an option list for an earlier feature (Eldritch Invocations, Augment Effects,
            // "Channel Divinity: Turn the Profane") or, failing that, more text for the feature just above it
            const n = s.name.toLowerCase();
            const home = feats.find((f) => f.name === s.name) || feats.find((f) => n.startsWith(f.name.toLowerCase() + ':'))
                || feats.find((f) => f.desc.join(' ').toLowerCase().includes(n)) || feats[feats.length - 1];
            home.desc.push(s.name, ...ps);
            home.subs.push({ name: s.name, desc: ps });
            cur = { ...home, lvl: s.lvl };   // deeper headings that follow go to the same feature
        }
    }
    return feats;
}

function parseClass(pg, multi, log) {
    const name = decode(pg.title.rendered), index = slug(name), h = clean(pg.content.rendered);
    const all = P(h), line = (k) => (all.find((p) => p.startsWith(k + ':')) || '').slice(k.length + 1).trim();
    const hd = line('Hit Dice').match(/1d(\d+)/);
    const saves = line('Saves').split(/,\s*/).map((s) => s.toLowerCase()).filter((s) => /^(str|dex|con|int|wis|cha)$/.test(s));
    const skills = skillChoice(line('Skills'));
    if (!skills) log(`bf: ${name}: skill choice not parsed: "${line('Skills')}"`);
    const secs = sections(h);
    const eq = secs.find((s) => s.name === 'Starting Equipment');
    const eqItems = eq ? [...eq.html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((m) => text(m[1])) : [];
    const feats = features(h);

    // progression table: Level | PB | Features | <columns> | 1st..9th slot columns
    const prog = secs.find((s) => /Progression/.test(s.name) && /<table/.test(s.html));
    const [head, ...rest] = prog ? rows(prog.html) : [[]], body = rest.filter((r) => ord(r[0]).length);
    const spellsKnownCol = all.some((p) => /Spells Known column/.test(p)) && !head.some((c) => /Spells Known/i.test(c));
    let asi = 0;
    const levels = body.map((r) => {
        const level = ord(r[0])[0], L = { level, prof_bonus: +r[1].replace('+', ''), features: [] };
        const sc = {}, cs = {};
        head.forEach((col, i) => {
            const v = (r[i] || '').trim(), num = /^\d+$/.test(v) ? +v : 0, slot = col.match(/^(\d)(?:st|nd|rd|th|d|t)$/);
            if (i < 2 || col === 'Features') return;
            if (slot) sc['spell_slots_level_' + slot[1]] = num;
            else if (/^Cantrips Known$/i.test(col)) sc.cantrips_known = num;
            else if (/^Spells ?Known$/i.test(col) || (col === '' && spellsKnownCol)) sc.spells_known = num;
            else cs[snake(col || 'column ' + (i + 1))] = val(v);
        });
        if (Object.keys(sc).length) L.spellcasting = sc;
        if (Object.keys(cs).length) L.class_specific = cs;
        const seen = {};
        for (const f of feats) {
            const k = f.levels.indexOf(level);
            if (k < 0) continue;
            if (f.name === 'Improvement') asi++;
            const fi = `${index}-${slug(f.name)}` + (k ? '-' + (k + 1) : '');
            seen[fi] = (seen[fi] || 0) + 1;
            L.features.push({ index: seen[fi] > 1 ? fi + '-' + seen[fi] : fi, name: f.name, level, desc: f.desc });
        }
        L.ability_score_bonuses = asi;
        return L;
    });
    if (levels.length !== 20) log(`bf: ${name}: progression table has ${levels.length} rows`);

    const sf = feats.find((f) => f.name === 'Spellcasting');
    let spellcasting = null, circle = null;
    if (sf) {
        const t = sf.desc.join(' ');
        const ab = t.match(/(Intelligence|Wisdom|Charisma)(?: \(\w+\))? is your spellcasting ability/i);
        const counts = CIRCLES.map((c) => (t.match(new RegExp('\\b' + c + '\\b', 'gi')) || []).length);
        circle = Math.max(...counts) ? CIRCLES[counts.indexOf(Math.max(...counts))] : null;
        if (!circle) log(`bf: ${name}: spellcasting circle not found`);
        spellcasting = { level: sf.levels[0], spellcasting_ability: ab ? ABIL[ab[1].toLowerCase()] : null,
            info: [{ name: 'Spellcasting', desc: P(sections(h).find((s) => s.name === 'Spellcasting')?.html || '').filter((p) => !/-Level .* Feature$/.test(p)) }, ...sf.subs] };
        if (!ab) log(`bf: ${name}: spellcasting ability not found`);
    }
    const mc = multi[index] || {};
    return { ...base(index, name), hit_die: hd ? +hd[1] : null,
        proficiency_choices: skills ? [skills] : [],
        proficiencies: [...profList(line('Armor')), ...profList(line('Weapons')), ...profList(line('Tools')), ...saves.map((s) => 'saving-throw-' + s)],
        saving_throws: saves,
        starting_equipment: [],
        // shortcut: equipment kept as text; the lines mix choices and bundles ("An explorer's pack and four javelins")
        starting_equipment_options: eqItems.map((desc) => ({ desc, choose: 1, type: 'equipment', from: null })),
        multi_classing: mc,
        subclasses: [], spellcasting, spells: [], circle,
        levels,
        desc: ['Hit Dice', 'Hit Points at 1st Level', 'Hit Points at Higher Levels', 'Armor', 'Weapons', 'Tools', 'Saves', 'Skills']
            .filter(line).map((k) => k + ': ' + line(k)) };
}

// Multiclassing page: "Fighter | STR 13 or DEX 13", "Bard | Light armor, one tool of your choice"
function parseMulti(pg) {
    const out = {};
    for (const r of rows(pg?.content.rendered || '')) {
        if (r.length !== 2 || r[0] === 'Class') continue;
        const c = (out[slug(r[0])] ||= {});
        if (/\b(STR|DEX|CON|INT|WIS|CHA) \d+/.test(r[1])) {
            const score = (s) => { const m = s.match(/(\w{3}) (\d+)/); return { ability_score: m[1].toLowerCase(), minimum_score: +m[2] }; };
            for (const part of r[1].split(/\s+and\s+/)) {
                const ors = part.split(/\s+or\s+/);
                if (ors.length === 1) (c.prerequisites ||= []).push(score(part));
                else c.prerequisite_options = { type: 'ability-scores', choose: 1, from: { option_set_type: 'options_array',
                    options: ors.map((o) => ({ option_type: 'score_prerequisite', ...score(o) })) } };
            }
        } else c.proficiencies = r[1].split(/,\s*/).filter((s) => !/choice|^—$/.test(s)).map(slug);
    }
    return out;
}

function parseSubclass(pg, cls, spellIdx, log) {
    const name = decode(pg.title.rendered), h = clean(pg.content.rendered);
    const secs = sections(h);
    const feats = features(h);
    const featNames = new Set(feats.flatMap((f) => [f.name, ...f.subs.map((s) => s.name)]));
    const desc = [...P(secs[0].html), ...secs.slice(1).filter((s) => s.lvl && !/Progression/.test(s.name) && !featNames.has(s.name) && !feats.some((f) => f.lvl < s.lvl && f.desc.includes(s.name)))
        .flatMap((s) => [s.name, ...P(s.html)])];
    const lv = {};
    for (const f of feats) for (const l of f.levels) (lv[l] ||= []).push({ index: slug(name + '-' + f.name), name: f.name, level: l, desc: f.desc });
    // always-prepared list: "<Class> Level | Spells" tables
    const spells = [];
    // (Draconic's has no header row: "3rd | command, dragon ancestor spell")
    const lists = (h.match(/<table[\s\S]*?<\/table>/g) || []).map(rows)
        .filter((t) => (/Level$/.test(t[0]?.[0]) && t[0][1] === 'Spells') || t.every((r) => r.length === 2 && ord(r[0]).length));
    for (const r of lists.flatMap((t) => t.filter((r) => ord(r[0]).length))) {
        for (const s of r[1].split(/,\s*/)) {
            if (/ancestor spell/.test(s)) continue;   // depends on the dragon picked; that table stays in the feature text
            const si = slug(s);
            if (!spellIdx.has(si)) log(`bf: ${name}: subclass spell "${s}" not in the spell list`);
            spells.push({ prerequisites: [`${cls.index}-${ord(r[0])[0]}`], spell: si });
        }
    }
    return { ...base(slug(name), name), class: cls.index, subclass_flavor: `${cls.name} Subclass`, desc, spells,
        levels: Object.keys(lv).map(Number).sort((a, b) => a - b).map((level) => ({ level, features: lv[level] })) };
}

function parseSpell(p, log) {
    const name = decode(p.title.rendered), ps = P(p.content.rendered);
    const m = ps[0].match(/^(?:(\d)\w*-Circle )?(.+?)(?: (Cantrip))?(?: (Ritual))?\s*\((\w+)\)$/);
    if (!m) { log(`bf: spell ${name}: header not parsed: "${ps[0]}"`); SKIPPED.push({ cat: 'spells', name, why: 'header not parsed' }); return null; }
    const circles = m[2].split(/,\s*(?:and\s+)?|\s+and\s+/).map((s) => s.toLowerCase()).filter((s) => CIRCLES.includes(s));
    const f = (k) => { const x = ps.find((q) => q.startsWith(k + ':')); return x ? x.slice(k.length + 1).replace(/^[\s:]+/, '').trim() : ''; };
    const comp = f('Components'), mat = comp.match(/M \((.*)\)/);
    const body = ps.slice(1).filter((q) => !/^(Casting Time|Range|Components|Duration):/.test(q));
    const hi = body.findIndex((q) => /^At Higher Circles\./.test(q));
    const duration = f('Duration');
    const gaps = ['Casting Time', 'Range', 'Duration'].filter((k) => !f(k));
    if (gaps.length) log(`bf: spell ${name}: no ${gaps.join('/')} on bfrd.net, left empty`);
    return { ...base(slug(name), name), level: m[1] ? +m[1] : 0, school: m[5], classes: [], circles,
        casting_time: f('Casting Time'), range: f('Range'),
        components: comp.replace(/\(.*\)/, '').split(/,\s*/).map((s) => s.trim()).filter((s) => /^[VSM]$/.test(s)),
        material: mat ? mat[1] : null, duration, concentration: /^concentration/i.test(duration), ritual: !!m[4],
        desc: hi < 0 ? body : body.slice(0, hi), higher_level: hi < 0 ? [] : body.slice(hi) };
}

const money = (s) => { const m = String(s).replace(/,/g, '').match(/^(\d+)\s*(cp|sp|ep|gp|pp)$/); return m ? { quantity: +m[1], unit: m[2] } : null; };
const pounds = (s) => { if (!s || /^[—–-]$/.test(s)) return 0; const m = s.match(/^(\d+)?\s*(?:(\d+)\/(\d+))?\s*lb/); return m ? (+m[1] || 0) + (m[2] ? m[2] / m[3] : 0) : null; };
const ref = (n) => ({ index: slug(n), name: n });

function parseEquipment(pages, log) {
    const out = {};
    const add = (e) => { if (!out[e.index]) out[e.index] = { ...base(e.index, e.name), ...e }; else log(`bf: equipment ${e.name} twice`); };
    const cost = (name, s) => { const c = money(s); if (!c) log(`bf: ${name}: cost "${s}" not parsed`); return c; };
    const pg = (s) => pages.find((p) => p.slug === s)?.content.rendered || '';
    let group = '';
    for (const r of rows(pg('weapons'))) {
        if (r.length < 6 || r.slice(1).every((c) => !c)) { group = r[0]; continue; }
        if (r[0] === 'Weapon') continue;
        const [name, c, dmg, wt, opt, props] = r;
        const [wcat, wrange] = group.split(' ');
        const dm = dmg.match(/^([\dd]+)(?:\/([\dd]+))?\s+(\w+)/);
        const e = { name, index: slug(name), equipment_category: ref('Weapon'), weapon_category: wcat, weapon_range: wrange,
            category_range: `${wcat} ${wrange}`, cost: cost(name, c), weight: pounds(wt),
            damage: dm ? { damage_dice: dm[1], damage_type: ref(dm[3][0].toUpperCase() + dm[3].slice(1)) } : null,
            range: { normal: 5 }, properties: [], weapon_options: opt && opt !== '—' ? opt.split(/,\s*/) : [] };
        if (dm?.[2]) e.two_handed_damage = { damage_dice: dm[2], damage_type: e.damage.damage_type };
        for (const pr of props.split(/,\s*(?![^(]*\))/)) {
            const pm = pr.match(/^([\w-]+)(?: \(range (\d+)\/(\d+) ft\.\))?/);
            if (!pm || pr === '—') continue;
            e.properties.push(ref(pm[1]));
            if (pm[2] && pm[1] === 'Thrown') e.throw_range = { normal: +pm[2], long: +pm[3] };
            if (pm[2] && pm[1] === 'Ammunition') e.range = { normal: +pm[2], long: +pm[3] };
        }
        add(e);
    }
    for (const r of rows(pg('armor'))) {
        if (r[0] === 'Armor' || r.length !== 5) continue;
        if (r.slice(1).every((c) => !c)) { group = r[0]; continue; }
        const [name, c, ac, wt, props] = r;
        const am = ac.match(/^\+?(\d+)(?: \+ DEX modifier(?: \(max (\d+)\))?)?/), str = props.match(/Cumbersome \(STR (\d+)\)/);
        const shield = /^Shield/.test(group);
        add({ name, index: slug(shield ? name : name + ' armor'), equipment_category: ref('Armor'), armor_category: shield ? 'Shield' : group.replace(/ Armor$/, ''),
            armor_class: am ? { base: +am[1], dex_bonus: /DEX/.test(ac), max_bonus: am[2] ? +am[2] : null } : null,
            str_minimum: str ? +str[1] : 0, cost: cost(name, c), weight: pounds(wt),
            properties: props.split(/,\s*/).filter((p) => p && !/^[–—-]$/.test(p)).map((p) => ref(p.replace(/ \(.*\)/, ''))) });
    }
    // gear and tools: rows with no cost are group headings (Containers, Gaming set); where a group ends isn't marked, so no sub-category
    for (const [s, cat] of [['adventuring-gear-and-tools', 'Adventuring Gear'], ['tools', 'Tools']]) {
        const t = pg(s).match(/<table[\s\S]*?<\/table>/)?.[0] || '';   // first table only (the container capacity table follows)
        for (const [name, c, wt] of rows(t)) {
            if (!c || ['Gear', 'Tool'].includes(name)) continue;
            add({ name, index: slug(name), equipment_category: ref(cat), cost: cost(name, c), weight: pounds(wt) });
        }
    }
    return out;
}

function parseMagicItem(p) {
    const name = decode(p.title.rendered), ps = P(p.content.rendered);
    const head = ps[0].split(/,\s*(?![^(]*\))/);
    return { ...base(slug(name), name), type: head[0] || '', rarity: head[1] || '', attunement: /requires attunement/i.test(ps.slice(0, 2).join(' ')), desc: ps };
}

export default async function load(log = () => {}) {
    const [pages, posts, cats] = [await all('pages'), await all('posts'), await all('categories')];
    const C = Object.fromEntries(cats.map((c) => [c.id, c]));
    const top = (id) => { let c = C[id]; while (c?.parent) c = C[c.parent]; return c?.slug; };
    const inCat = (s) => posts.filter((p) => p.categories.some((id) => top(id) === s));
    const sub = (p, parentSlug) => p.categories.map((id) => C[id]).find((c) => c && C[c.parent]?.slug === parentSlug);
    const out = { classes: {}, subclasses: {}, races: {}, cultures: {}, feats: {}, backgrounds: {}, spells: {}, equipment: {}, magic_items: {} };
    const skip = (cat, p, why) => { SKIPPED.push({ cat, name: decode(p.title.rendered), why }); log(`bf: skipped ${cat} ${decode(p.title.rendered)}: ${why}`); };
    const blog = (p) => NOT_BFRD.includes(p.slug) || /koboldpress\.com[^"]*"[^>]*>Source</.test(p.content.rendered);
    const ua = (p) => isUA(decode(p.title.rendered)) || /-ua$/.test(p.slug);

    // spells and rituals (rituals are their own BF list; kept as spells with ritual: true)
    for (const p of [...inCat('spells'), ...inCat('rituals')]) {
        if (ua(p)) { skip('spells', p, 'UA/playtest'); continue; }
        const s = parseSpell(p, log);
        if (!s) continue;
        if (out.spells[s.index]) { log(`bf: spell ${s.name} listed twice, kept the first`); continue; }
        out.spells[s.index] = s;
    }

    // classes + subclasses
    const classRoot = pages.find((p) => p.slug === 'classes' && !p.parent);
    const multi = parseMulti(pages.find((p) => p.slug === 'multiclassing'));
    for (const pg of pages.filter((p) => p.parent === classRoot?.id)) {
        if (ua(pg)) { skip('classes', pg, 'UA/playtest'); continue; }
        const c = parseClass(pg, multi, log);
        out.classes[c.index] = c;
        const list = pages.find((p) => p.parent === pg.id && /-subclasses$/.test(p.slug));
        for (const sp of pages.filter((p) => p.parent === list?.id)) {
            if (ua(sp)) { skip('subclasses', sp, 'UA/playtest'); continue; }
            const s = parseSubclass(sp, c, new Set(Object.keys(out.spells)), log);
            out.subclasses[s.index] = s;
            c.subclasses.push(s.index);
        }
        // subclasses named on the class page with no page of their own (e.g. barbarian "Wild Fury") aren't in the BFRD
        const named = sections(clean(pg.content.rendered)).find((s) => s.name === `${c.name} Subclass`);
        for (const m of (named?.html || '').matchAll(/<li>([^<]+)<\/li>/g)) log(`bf: ${c.name}: subclass "${text(m[1])}" is named but has no text in the BFRD`);
    }
    for (const s of Object.values(out.spells)) s.classes = Object.values(out.classes).filter((c) => s.circles.includes(c.circle)).map((c) => c.index);

    // lineages -> races
    for (const p of inCat('lineages')) {
        if (blog(p)) { skip('races', p, 'Kobold Press blog preview mirrored on bfrd.net, not part of the BFRD'); continue; }
        const name = decode(p.title.rendered).replace(/ Lineage$/, ''), { intro, list } = traits(p.content.rendered);
        const t = (n) => list.find((x) => x.name === n)?.desc.join(' ') || '';
        const sp = t('Speed').match(/(\d+) feet/), sz = t('Size').match(/size is ([A-Za-z ]+?)\./);
        if (!sp || !sz) log(`bf: race ${name}: speed or size not parsed`);
        out.races[slug(name)] = { ...base(slug(name), name), speed: sp ? +sp[1] : null, ability_bonuses: [], alignment: '', age: t('Age'),
            size: sz ? sz[1] : '', size_description: t('Size'), languages: [], language_desc: '',
            traits: list.filter((x) => !['Age', 'Size', 'Speed', 'Languages'].includes(x.name)).map((x) => ({ index: slug(x.name), name: x.name, desc: x.desc })),
            subraces: [], desc: intro.filter((x) => !/hereditary traits/.test(x)) };
    }

    // heritages -> cultures (mix-and-match with any lineage; where they go in the sheet is still the owner's call)
    for (const p of inCat('heritages')) {
        if (blog(p)) { skip('cultures', p, 'Kobold Press blog preview mirrored on bfrd.net, not part of the BFRD'); continue; }
        const name = decode(p.title.rendered).replace(/ Heritage$/, ''), { intro, list } = traits(p.content.rendered);
        const lang = list.find((x) => x.name === 'Languages')?.desc.join(' ') || '';
        const known = (lang.match(/(?:know|speak, read, and write) ((?:[A-Z]\w+(?:,\s*|\s+and\s+)?)+)/)?.[1] || '').split(/,\s*|\s+and\s+/).filter(Boolean).map(slug);
        out.cultures[slug(name)] = { ...base(slug(name), name), desc: intro, traits: list.filter((x) => x.name !== 'Languages').map((x) => ({ index: slug(x.name), name: x.name, desc: x.desc })),
            languages: known, language_desc: lang, races: [] };
    }

    // talents -> feats
    for (const p of inCat('talents')) {
        const name = decode(p.title.rendered), ps = P(p.content.rendered);
        const pre = ps[0]?.match(/^Prerequisite:\s*(.*)$/);
        const type = sub(p, 'talents')?.name.replace(/ Talents$/, '') || '';
        if (!type) log(`bf: talent ${name} has no Magic/Martial/Technical group`);
        out.feats[slug(name)] = { ...base(slug(name), name), type, prerequisites: prereqs(pre?.[1]), desc: pre ? ps.slice(1) : ps };
    }

    // backgrounds
    for (const p of inCat('backgrounds')) {
        const name = decode(p.title.rendered), ps = P(p.content.rendered), secs = sections(p.content.rendered);
        const f = (k) => (ps.find((q) => q.startsWith(k + ':')) || '').slice(k.length + 1).trim();
        const skills = skillChoice(f('Skill Proficiencies')), gold = f('Equipment').match(/containing (\d+) gp/);
        const talent = secs.find((s) => s.name === 'Talent');
        out.backgrounds[slug(name)] = { ...base(slug(name), name), starting_proficiencies: [],
            proficiency_choices: skills ? [skills] : [],   // BF backgrounds offer a skill choice, which the srd background shape has no field for
            language_options: null, starting_equipment: [],
            starting_equipment_options: f('Equipment') ? [{ desc: f('Equipment'), choose: 1, type: 'equipment', from: null }] : [],
            feature: { name: 'Talent', desc: talent ? P(talent.html) : [] },
            personality_traits: null, ideals: null, bonds: null, flaws: null, starting_gold: gold ? +gold[1] : null, desc: ps };
    }

    out.equipment = parseEquipment(pages, log);
    for (const p of inCat('magic-items')) {
        const m = parseMagicItem(p);
        if (out.magic_items[m.index]) log(`bf: magic item ${m.name} twice`); else out.magic_items[m.index] = m;
    }
    return out;
}
