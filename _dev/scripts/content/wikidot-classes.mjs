// Classes and subclasses from the two D&D wikidot wikis: dnd5e.wikidot.com (2014 rules, src "wikidot") and
// dnd2024.wikidot.com (2024 rules, src "wikidot2024"). Unearthed Arcana / playtest pages are skipped (SKIPPED).
// Shapes follow sheets/player/srd-build.json; numbers come only from the page's class table, never guessed.
import { get, slug, text, paras, decode } from './fetch.mjs';

export const SKIPPED = [];

export const SITES = {
    2014: { base: 'https://dnd5e.wikidot.com', src: 'wikidot', rules: '2014' },
    2024: { base: 'https://dnd2024.wikidot.com', src: 'wikidot2024', rules: '2024' },
};

const ABIL = { strength: 'str', dexterity: 'dex', constitution: 'con', intelligence: 'int', wisdom: 'wis', charisma: 'cha' };
const SKILLS = ['Acrobatics', 'Animal Handling', 'Arcana', 'Athletics', 'Deception', 'History', 'Insight', 'Intimidation', 'Investigation',
    'Medicine', 'Nature', 'Perception', 'Performance', 'Persuasion', 'Religion', 'Sleight of Hand', 'Stealth', 'Survival'];
const NUM = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twenty: 20 };
const num = (w) => NUM[String(w).toLowerCase()] ?? (+w || null);
const isUA = (s) => /\bUA\b|unearthed arcana|playtest/i.test(s || '');
const skip = (cat, name, why) => { if (!SKIPPED.some((s) => s.cat === cat && s.name === name)) SKIPPED.push({ cat, name, why }); };

// ---- page pieces ----
const content = (h) => {
    let c = h.slice(h.indexOf('<div id="page-content">'));
    const end = c.search(/<div id="wad-|<!-- floating video|<!-- mobile bottom|<div class="page-tags"/);
    return end > 0 ? c.slice(0, end) : c;
};
const title = (h) => { const t = decode((h.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '').trim(); const i = t.lastIndexOf(' - '); return i > 0 ? t.slice(0, i) : t; };
const sourceLine = (c) => (paras(c).find((p) => /^Sources?:/i.test(p)) || '').replace(/^Sources?:\s*/i, '');
const tables = (c) => [...c.matchAll(/<table[\s\S]*?<\/table>/g)].map((m) => m[0]);
const rows = (t) => [...t.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((r) => [...r[1].matchAll(/<(t[hd])([^>]*)>([\s\S]*?)<\/\1>/g)]
    .map((m) => ({ th: m[1] === 'th', html: m[3], text: text(m[3]), span: +((m[2].match(/colspan="(\d+)"/) || [])[1] || 1) })));
// h3 sections (a feature each on both wikis); `pre` is everything before the first h3
function sections(c) {
    const parts = c.split(/(?=<h[1-3][\s>])/);
    const out = { pre: '', list: [] };
    for (const p of parts) {
        const m = p.match(/^<h3[^>]*>([\s\S]*?)<\/h3>([\s\S]*)$/);
        if (m) out.list.push({ name: text(m[1]), anchors: [...m[1].matchAll(/<a name="([^"]+)"/g)].map((a) => a[1]), html: m[2] });
        else if (!out.list.length) out.pre += p;
        else if (/^<h[12]/.test(p)) out.list.push({ name: null, html: '' });   // an h1/h2 ends the previous feature
        else out.list[out.list.length - 1].html += p;
    }
    out.list = out.list.filter((s) => s.name);
    return out;
}
const levelPrefix = /^Level (\d+):\s*/i;

// "Simple weapons, martial weapons that have the Finesse property" -> items; the "that ..." clause stays on its item
function items(s) {
    s = String(s || '').replace(/\s*\([^)]*\)/g, '').replace(/\.$/, '').trim();
    if (!s || /^none$/i.test(s)) return [];
    const cut = s.search(/\s(that|with|which)\s/i);
    const head = cut > 0 ? s.slice(0, cut) : s, tail = cut > 0 ? s.slice(cut) : '';
    const out = head.split(/,\s*(?:and\s+|or\s+)?|\s+and\s+/i).map((x) => x.trim()).filter(Boolean);
    if (tail) out[out.length - 1] += tail;
    return out;
}
const armorIdx = (x) => { const l = x.toLowerCase().replace(/ training$/, ''); return /^(light|medium|heavy|all)( armor)?$/.test(l) ? l.split(' ')[0] + '-armor' : slug(l); };
const abilities = (s) => [...String(s).matchAll(/\b(strength|dexterity|constitution|intelligence|wisdom|charisma)\b/gi)].map((m) => ABIL[m[1].toLowerCase()]);

function skillChoice(s) {
    if (!s) return [];
    const n = num((s.match(/choose\s+(\w+)/i) || [])[1]);
    const opts = /\bany\b/i.test(s) ? SKILLS : SKILLS.filter((k) => new RegExp('\\b' + k + '\\b', 'i').test(s));
    if (!n || !opts.length) return [];
    return [{ desc: s, choose: n, type: 'proficiencies', from: { option_set_type: 'options_array', options: opts.map((k) => ({ option_type: 'reference', item: 'skill-' + slug(k) })) } }];
}
// "Strength or Dexterity score of 13 ... and an Intelligence score of 13" -> options (str|dex) + required int
function multiclass(prereqText) {
    const t = String(prereqText).replace(/\bor higher\b|\bin or out\b/gi, '');
    const ab = [...new Set(abilities(t))];
    if (!ab.length) return {};
    const A = '(strength|dexterity|constitution|intelligence|wisdom|charisma)';
    const either = [...new Set(abilities((t.match(new RegExp(`${A}(?:\\s+score)?\\s+or\\s+(?:an?\\s+)?${A}`, 'i')) || [''])[0]))];
    const out = { prerequisites: ab.filter((a) => !either.includes(a)).map((a) => ({ ability_score: a, minimum_score: 13 })), proficiencies: [] };
    if (either.length) out.prerequisite_options = { type: 'ability-scores', choose: 1, from: { option_set_type: 'options_array', options: either.map((a) => ({ option_type: 'score_prerequisite', ability_score: a, minimum_score: 13 })) } };
    if (!out.prerequisites.length && either.length) delete out.prerequisites;
    return out;
}
// "(a) a greataxe or (b) any martial melee weapon" -> text option; "An explorer's pack and four javelins" -> fixed items
function equipment(lines) {
    const fixed = [], opts = [];
    for (const l of lines) {
        if (/\([a-c]\)|\bor\b|\bany\b|choose/i.test(l)) { opts.push({ desc: l, choose: 1, type: 'equipment', from: null }); continue; }
        for (const it of items(l)) {
            const m = it.match(/^(a|an|one|two|three|four|five|six|seven|eight|nine|ten|twenty|\d+)\s+(.+)$/i);
            const q = m ? num(m[1]) : 1;
            let name = m ? m[2] : it;
            if (q > 1) name = name.replace(/(?<!s)s$/, '');   // daggers -> dagger
            fixed.push({ equipment: slug(name), quantity: q });
        }
    }
    return { fixed, opts };
}

// ---- class page ----
// The 1-20 level table(s). 2024 pages split it in two (features, then spellcasting): joined on the level.
function classTable(c) {
    let T = null;
    for (const t of tables(c)) {
        const r = rows(t);
        const head = r.filter((row) => row.length && row.every((x) => x.th)).pop();
        if (!head || !/^level$/i.test(head[0].text)) continue;
        const data = r.filter((row) => row.length && !row.every((x) => x.th) && /^\d+/.test(row[0].text));
        if (data.length < 20) continue;   // a Beast Shapes-style table, not the class progression
        if (!T) { T = { cols: head.map((x) => x.text), data }; continue; }
        T.cols.push(...head.slice(1).map((x) => x.text));
        for (const row of T.data) row.push(...(data.find((d) => parseInt(d[0].text) === parseInt(row[0].text)) || []).slice(1));
    }
    return T;
}
const val = (s) => (/^[+]?\d+$/.test(s) ? +s : s);
const slotNum = (s) => (/^\d+$/.test(s) ? +s : 0);
// "Channel Divinity (1/rest), Divine Domain feature" -> [{name, anchor}], commas inside brackets kept
function cellFeatures(html) {
    const out = []; let depth = 0, cur = '';
    for (const ch of html) {
        if (ch === '(' || ch === '[') depth++;
        if (ch === ')' || ch === ']') depth--;
        if (ch === ',' && depth <= 0) { out.push(cur); cur = ''; } else cur += ch;
    }
    out.push(cur);
    return out.map((h) => ({ name: text(h).trim(), anchor: (h.match(/href="#([^"]+)"/) || [])[1] }))
        .filter((f) => f.name && f.name !== '-' && f.name !== '—');
}
const norm = (s) => slug(String(s).replace(levelPrefix, '').replace(/\([^)]*\)/g, ''));

function spellcastingInfo(sec) {
    const h = sec.html
        .replace(/<h[4-6][^>]*>([\s\S]*?)<\/h[4-6]>/g, (m, t) => `<p>§§${text(t)}</p>`)
        .replace(/<p>\s*<strong>([^<]{1,60}?)\.?\s*<\/strong>\.?/g, (m, t) => `<p>§§${t}</p><p>`);
    const info = [];
    for (const p of paras(h)) {
        if (p.startsWith('§§')) info.push({ name: p.slice(2).replace(/[.:]$/, ''), desc: [] });
        else (info[info.length - 1] || (info[info.length] = { name: sec.name.replace(levelPrefix, ''), desc: [] })).desc.push(p);
    }
    return info.filter((i) => i.desc.length);
}

function parseClass(site, index, html, subLinks) {
    const c = content(html), name = title(html);
    const S = sections(c);
    const lines = paras(c.replace(/<table[\s\S]*?<\/table>/, (t) => /Core .* Traits/i.test(t) ? t : ''));   // the 2024 traits table, not the class table
    const trait = (...keys) => { for (const k of keys) { const l = lines.find((x) => new RegExp('^' + k + '\\s*[:|]\\s*', 'i').test(x)); if (l) return l.replace(new RegExp('^' + k + '\\s*[:|]\\s*', 'i'), ''); } return ''; };

    const hit = trait('Hit Dice', 'Hit Die', 'Hit Point Die').match(/d(\d+)/i);
    const saves = abilities(trait('Saving Throws', 'Saving Throw Proficiencies'));
    const profs = [...items(trait('Armor', 'Armor Training')).map(armorIdx), ...items(trait('Weapons', 'Weapon Proficiencies')).map((x) => slug(/^(simple|martial)$/i.test(x) ? x + ' weapons' : x))];   // "Simple and Martial weapons"
    const choices = skillChoice(trait('Skills', 'Skill Proficiencies'));
    const tools = trait('Tools', 'Tool Proficiencies');
    if (/choose|any|of your choice|one type/i.test(tools)) choices.push({ desc: tools, choose: num((tools.match(/^(?:choose\s+)?(\w+)/i) || [])[1]) || 1, type: 'proficiencies', from: null });
    else profs.push(...items(tools).map(slug));
    profs.push(...saves.map((a) => 'saving-throw-' + a));

    // equipment: 2014 list under the Equipment heading, 2024 one "Choose A or B" line
    let eqLines = [];
    const eqm = c.match(/>\s*(?:<span>)?Equipment(?:<\/span>)?\s*<\/h\d>([\s\S]*?)(?=<h\d)/);
    if (eqm) eqLines = [...eqm[1].matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => text(m[1]));
    const eq24 = trait('Starting Equipment');
    const eq = eqLines.length ? equipment(eqLines) : { fixed: [], opts: eq24 ? [{ desc: eq24, choose: 1, type: 'equipment', from: null }] : [] };

    // multiclass: 2014 states it in a sentence; 2024 needs 13 in the Primary Ability (rules on /class:multiclassing)
    const mcLine = paras(c).find((p) => /multiclass/i.test(p) && /\b13\b/.test(p));
    const multi_classing = site.rules === '2014' ? (mcLine ? multiclass(mcLine) : {}) : multiclass(trait('Primary Ability'));

    const descEnd = c.search(/<table/);
    const desc = paras(c.slice(0, descEnd > 0 ? descEnd : 0)).filter((p) => !/^Sources?:/i.test(p) && p !== mcLine);

    // feature descriptions by heading (or the table cell's #anchor)
    const secByKey = new Map(), secByAnchor = new Map();
    for (const s of S.list) { const k = norm(s.name); if (!secByKey.has(k)) secByKey.set(k, s); for (const a of s.anchors) secByAnchor.set(a, s); }
    const secDesc = (s) => paras(s.html.replace(/<table[\s\S]*?<\/table>/g, (t) => t.includes(`/${index}:`) ? '' : t));
    const findSec = (f) => secByAnchor.get(f.anchor) || secByKey.get(norm(f.name))
        || S.list.find((s) => norm(s.name).startsWith(norm(f.name)) || norm(f.name).startsWith(norm(s.name)));

    // subclass label: the feature whose section lists the subclasses
    const linkCount = (s) => subLinks.filter((l) => s.html.includes(`/${index}:${l}"`)).length;
    const subSec = S.list.filter(linkCount).sort((a, b) => linkCount(b) - linkCount(a))[0];
    const subclass_flavor = subSec ? subSec.name.replace(levelPrefix, '') : '';

    const T = classTable(c);
    const levels = [];
    let casting = null, asi = 0;
    if (!T) site.log(`${site.src} ${index}: no class table`);
    const col = (re) => T ? T.cols.findIndex((x) => re.test(x)) : -1;
    const iLvl = col(/^level$/i), iProf = col(/proficiency bonus/i), iFeat = col(/features$/i);
    const hasSlots = T && T.cols.some((x) => /^\d(st|nd|rd|th)?$/.test(x));
    for (const row of T ? T.data : []) {
        const level = parseInt(row[iLvl].text);
        if (!(level >= 1 && level <= 20) || levels.some((l) => l.level === level)) continue;
        const L = { level, prof_bonus: iProf >= 0 ? parseInt(row[iProf].text) || null : null, features: [] };
        for (const f of iFeat >= 0 && row[iFeat] ? cellFeatures(row[iFeat].html) : []) {
            if (/\bfeature$/i.test(f.name) || /^subclass feature/i.test(f.name)) continue;   // "Arcane Tradition feature": comes from the subclass
            const s = findSec(f);
            if (!s) site.log(`${site.src} ${index}: no description for "${f.name}" (level ${level})`);
            L.features.push({ index: norm(f.name), name: f.name, level, desc: s ? secDesc(s) : [] });
            if (/^ability score improvement$/i.test(f.name)) asi++;
        }
        L.ability_score_bonuses = asi;
        const sc = {}, cs = {};
        let pactSlots = null, pactLevel = null;
        T.cols.forEach((name, i) => {
            if (i === iLvl || i === iProf || i === iFeat || !row[i]) return;
            const v = row[i].text, m = name.match(/^(\d)(st|nd|rd|th)?$/);
            if (m) sc['spell_slots_level_' + m[1]] = slotNum(v);
            else if (/^cantrips( known)?$/i.test(name)) sc.cantrips_known = slotNum(v);
            else if (/^spells known$/i.test(name)) sc.spells_known = slotNum(v);
            else if (/^spell slots$/i.test(name)) pactSlots = slotNum(v);
            else if (/^slot level$/i.test(name)) pactLevel = parseInt(v) || null;
            else cs[slug(name).replace(/-/g, '_')] = val(v);
        });
        if (pactSlots !== null) { for (let n = 1; n <= 9; n++) sc['spell_slots_level_' + n] = 0; if (pactLevel) sc['spell_slots_level_' + pactLevel] = pactSlots; }
        else if (hasSlots) for (let n = 1; n <= 9; n++) sc['spell_slots_level_' + n] ??= 0;
        if (Object.keys(sc).length) L.spellcasting = sc;
        if (Object.keys(cs).length) L.class_specific = cs;
        levels.push(L);
    }
    if (T && levels.length !== 20) site.log(`${site.src} ${index}: class table has ${levels.length} levels`);

    const castSec = S.list.find((s) => /^(spellcasting|pact magic)$/i.test(s.name.replace(levelPrefix, '').trim()));
    if (castSec) {
        const ab = abilities((text(castSec.html).match(/(\w+) is (?:your|the) spellcasting ability/i) || [])[1] || '')[0] || null;
        const lvl = levels.find((l) => l.features.some((f) => /^(spellcasting|pact magic)$/i.test(f.name)))?.level
            ?? levels.find((l) => l.spellcasting && Object.entries(l.spellcasting).some(([k, v]) => k.startsWith('spell_slots') && v > 0))?.level ?? null;
        casting = { level: lvl, spellcasting_ability: ab, info: spellcastingInfo(castSec) };
    }

    return {
        index, name, src: site.src, rules: site.rules, desc,
        hit_die: hit ? +hit[1] : null,
        proficiency_choices: choices, proficiencies: profs, saving_throws: saves,
        starting_equipment: eq.fixed, starting_equipment_options: eq.opts,
        multi_classing, subclasses: [], spellcasting: casting, spells: [], levels,
        subclass_flavor, _subLevel: levels.find((l) => l.features.some((f) => norm(f.name) === norm(subclass_flavor)))?.level ?? null,
    };
}

// ---- subclass page ----
function subSpells(c, cls, subIndex) {
    const out = [];
    // "Cleric Level | Spells" tables; a spellcasting progression table (Level | Cantrips Known | 1st ...) has more columns
    const spellTables = tables(c).filter((t) => {
        const head = rows(t).filter((r) => r.length && r.every((x) => x.th)).pop() || [];
        return head.length === 2 && /level/i.test(head[0].text) && /spells?$/i.test(head[1].text) && /\/spell:/.test(t);
    });
    for (const t of spellTables) {
        const r = rows(t);
        let variant = r[0].length === 1 && r[0][0].th && !/spell/i.test(r[0][0].text) ? r[0][0].text : null;
        if (!variant && spellTables.length > 1) {   // 2024: "Arid Land" heading right before the table
            const before = c.slice(0, c.indexOf(t)).match(/<h[4-6][^>]*>([\s\S]*?)<\/h[4-6]>\s*$/);
            if (before) variant = text(before[1]);
        }
        for (const row of r) {
            if (row.some((x) => x.th) || row.length < 2) continue;
            const lvl = parseInt(row[0].text);
            if (!lvl) continue;
            const links = [...row[1].html.matchAll(/\/spell:([a-z0-9-]+)/g)].map((m) => m[1]);
            const names = links.length ? links : row[1].text.split(/,\s*/).map(slug).filter(Boolean);
            for (const s of names) out.push({ prerequisites: [`${cls}-${lvl}`, ...(variant ? [`${subIndex}-${slug(variant)}`] : [])], spell: s });
        }
    }
    return { spells: out, tables: spellTables };
}
const LEVEL_RE = /\b(?:at|reach|reaching|when you choose [^.]*? at)\s+(\d+)(?:st|nd|rd|th)[\s-]+level/i;

function parseSubclass(site, cls, index, name, html) {
    const c = content(html);
    const S = sections(c);
    const { spells, tables: spellT } = subSpells(c, cls.index, index);
    const desc = paras(spellT.reduce((h, t) => h.replace(t, ''), S.pre)).filter((p) => !/^Sources?:/i.test(p));
    const feats = [];
    let last = cls._subLevel;
    for (const s of S.list) {
        let lvl = null, fname = s.name;
        const m24 = fname.match(levelPrefix), m14 = fname.match(/^(\d+)(?:st|nd|rd|th)[- ]level:?\s*/i);
        const d = paras(s.html);
        if (m24 || m14) { lvl = +(m24 || m14)[1]; fname = fname.slice((m24 || m14)[0].length); }
        else if (site.rules === '2024') {   // a heading without "Level N:" (a spell table, an option list) belongs to the feature above
            const tgt = feats.length ? feats[feats.length - 1].desc : desc;
            tgt.push(fname, ...d);
            continue;
        } else { const m = (d[0] || '').match(/^(\d+)(?:st|nd|rd|th)[- ]level\b/i) || (d[0] || '').match(LEVEL_RE); if (m) lvl = +m[1]; }   // "6th-Level Path of the Giant Feature" or "Starting at 6th level"
        if (lvl === null) { lvl = last; if (lvl === null) site.log(`${site.src} ${cls.index}:${index}: no level for "${fname}"`); }
        last = lvl;
        feats.push({ index: slug(fname), name: fname, level: lvl, desc: d });
    }
    const byLevel = new Map();
    for (const f of feats) { if (!byLevel.has(f.level)) byLevel.set(f.level, []); byLevel.get(f.level).push(f); }
    const levels = [...byLevel].sort((a, b) => (a[0] ?? 99) - (b[0] ?? 99)).map(([level, features]) => ({ level, features }));
    if (!feats.length) site.log(`${site.src} ${cls.index}:${index}: no features found`);
    return { index, class: cls.index, name, src: site.src, rules: site.rules, subclass_flavor: cls.subclass_flavor, desc, spells, levels };
}

// ---- one wiki ----
export async function loadSite(key, log = () => {}) {
    const site = { ...SITES[key], log };
    const home = await get(site.base + '/');
    const hc = content(home);
    // class sections on the home page: <h1>The <a href="/wizard">Wizard</a></h1> (2014) or <a href="/wizard:main"> (2024)
    const classSlugs = [...new Set([...hc.matchAll(/<h1[^>]*>(?:(?!<\/h1>)[\s\S])*?href="\/([a-z0-9-]+)(?::main)?"/g)].map((m) => m[1]))]
        .filter((s) => !/^(spells?|lineage|species|background|feat|equipment|magic-item|hb|ua)$/.test(s) && !/:/.test(s));
    // 2014: the home page's "Archived Unearthed Arcana" section names UA-only classes (Mystic, Rune Scribe, ...)
    const ua = hc.indexOf('Archived Unearthed Arcana');
    if (ua > 0) for (const m of hc.slice(ua).matchAll(/href="\/([a-z0-9-]+)"/g)) skip('class', `${site.src}:${m[1]}`, 'Unearthed Arcana (home page UA section)');

    const classes = {}, subclasses = {};
    for (const cs of classSlugs) {
        const html = await get(`${site.base}/${cs}${key === '2024' ? ':main' : ''}`);
        if (!html) { log(`${site.src} ${cs}: page missing`); continue; }
        const c = content(html), name = title(html);
        if (/-ua$/.test(cs) || isUA(name) || isUA(sourceLine(c))) { skip('class', `${site.src}:${cs}`, 'Unearthed Arcana'); continue; }
        if (!classTable(c)) { log(`${site.src} ${cs}: no class table, not a class`); continue; }
        // subclass links: tables on the class page and home page (2024 home lists them in tables), plus 2014's home menus
        const re = new RegExp(`href="(?:https?://${new URL(site.base).host})?/${cs}:([a-z0-9-]+)"`, 'g');
        const pool = [...tables(c), ...tables(hc), ...(key === '2014' ? [hc] : [])].join('');
        const subs = [...new Set([...pool.matchAll(re)].map((m) => m[1]))].filter((s) => s !== 'main');
        const cls = parseClass(site, cs, html, subs);
        for (const s of subs) {
            if (/-ua$/.test(s)) { skip('subclass', `${site.src}:${cs}:${s}`, 'slug ends -ua'); continue; }
            const sh = await get(`${site.base}/${cs}:${s}`);
            if (!sh) { log(`${site.src} ${cs}:${s}: page missing`); continue; }
            let sname = title(sh);
            if (key === '2014') {   // 2014 subclass pages are titled "Wizard: School of Evocation"; other pages (Infusions, Mutagens) aren't subclasses
                if (!sname.toLowerCase().startsWith(cls.name.toLowerCase() + ':')) continue;
                sname = sname.slice(cls.name.length + 1).trim();
            }
            const src = sourceLine(content(sh));
            if (isUA(sname) || isUA(src)) { skip('subclass', `${site.src}:${cs}:${s}`, 'Unearthed Arcana: ' + (src || sname)); continue; }
            let idx = slug(sname);
            if (subclasses[idx]?.name === sname) { idx = `${cs}-${s}`; sname += ` (${s})`; }   // two pages, one title (Juggernaut / Juggernaut Reborn)
            else if (subclasses[idx]) idx = `${cs}-${idx}`;
            subclasses[idx] = parseSubclass(site, cls, idx, sname, sh);
            cls.subclasses.push(idx);
        }
        delete cls._subLevel;
        classes[cs] = cls;
    }
    return { classes, subclasses };
}

// Both wikis in one result. 2024 entries whose index the 2014 wiki already uses get "-2024" on the end.
export default async function load(log = () => {}) {
    const [a, b] = await Promise.all([loadSite('2014', log), loadSite('2024', log)]);
    const out = { classes: { ...a.classes }, subclasses: { ...a.subclasses } };
    const ren = (o, k) => (o[k] ? k + '-2024' : k);
    const clsMap = {};
    for (const [k, c] of Object.entries(b.classes)) { clsMap[k] = ren(out.classes, k); }
    const subMap = {};
    for (const k of Object.keys(b.subclasses)) subMap[k] = ren(out.subclasses, k);
    for (const [k, c] of Object.entries(b.classes)) out.classes[clsMap[k]] = { ...c, index: clsMap[k], subclasses: c.subclasses.map((s) => subMap[s]) };
    for (const [k, s] of Object.entries(b.subclasses)) out.subclasses[subMap[k]] = { ...s, index: subMap[k], class: clsMap[s.class] };
    return out;
}
