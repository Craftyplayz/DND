// Level Up Advanced 5th Edition (A5E) SRD content (CC-BY 4.0, EN Publishing), read from a5e.tools and turned into
// plain 5e shapes: heritage -> race (gifts and paragon gifts as choice traits), cultures left out (owner's call),
// class -> class, archetype -> subclass, plus the
// Adventurer's Guide feats that Open5e's A5E document lacks. a5e.tools also carries other EN Publishing books
// (Gate Pass Gazette, Voidrunner's Codex, ...); only items whose source is the Adventurer's Guide are kept.
// Drupal serves every page as JSON with ?_format=json, so pages are read from that; the listings are HTML views.
import { get, getJson, slug, text, paras } from './fetch.mjs';

const SITE = 'https://a5e.tools';
const AG = '/sources/adventurers-guide';
const base = { src: 'a5e', rules: '2014' };
export const SKIPPED = [];

const ABIL = { strength: 'str', dexterity: 'dex', constitution: 'con', intelligence: 'int', wisdom: 'wis', charisma: 'cha' };
const SKILLS = ['Acrobatics', 'Animal Handling', 'Arcana', 'Athletics', 'Culture', 'Deception', 'Engineering', 'History', 'Insight',
    'Intimidation', 'Investigation', 'Medicine', 'Nature', 'Perception', 'Performance', 'Persuasion', 'Religion', 'Sleight of Hand',
    'Stealth', 'Survival'];
const NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, any: 1 };
const MARKER = /additionally available/i;   // a5e.tools appends other books' gifts/cultures after this line

const page = (path) => getJson(SITE + path.replace(/^https?:\/\/a5e\.tools/, '') + '?_format=json');
// Drupal's processed HTML without its theme-debug comments; unresolved freelinks [[target|label]] become the label;
// raw newlines (the comments leave them inside paragraphs) become spaces; table cells flattened to one line so
// P() gives "a | b" rows
const clean = (h) => String(h || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/<t([dh])\b([^>]*)>([\s\S]*?)<\/t\1>/gi, (m, t, a, c) => `<t${t}${a}>${c.replace(/<\/?(p|div|br)\b[^>]*>/gi, ' ')}</t${t}>`);
// paras() plus "long rest ." -> "long rest." (the links leave a space before punctuation)
const P = (h) => paras(h).map((l) => l.replace(/\s+([.,;:!?)])/g, '$1'));
const body = (j, f = 'body') => clean(j?.[f]?.[0]?.processed ?? j?.[f]?.[0]?.value);
const sourceOf = (j) => Object.keys(j).filter((k) => /_source$/.test(k)).map((k) => j[k]?.[0]?.url).find(Boolean) || '';
const links = (h) => [...h.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)].map((m) => ({ href: m[1], name: text(m[2]) }));
const rows = (tbl) => (tbl.match(/<tr\b[\s\S]*?<\/tr>/gi) || []).map((tr) => (tr.match(/<t[dh]\b[\s\S]*?<\/t[dh]>/gi) || []).map(text));
const listSplit = (s) => s.split(/,\s*(?:and\s+|or\s+)?|\s+(?:and|or)\s+/).map((x) => x.trim()).filter(Boolean);
const levelIn = (s) => +((/\b(?:at|reach|by|from)\s+(\d+)(?:st|nd|rd|th)\s+level/i.exec(s) || [])[1]) || null;
const skillRef = (n) => SKILLS.find((k) => k.toLowerCase() === n.toLowerCase().trim()) ? 'skill-' + slug(n) : null;
const skillOpts = (names) => ({ option_set_type: 'options_array', options: names.map((n) => ({ option_type: 'reference', item: skillRef(n) || slug(n) })) });

// the HTML split at headings: [{lvl, title, html}], lvl 0 = text before the first heading
function sections(h) {
    const parts = h.split(/(<h[1-6]\b[^>]*>[\s\S]*?<\/h[1-6]>)/i);
    const out = [{ lvl: 0, title: '', html: parts[0] }];
    for (let i = 1; i < parts.length; i += 2) {
        out.push({ lvl: +parts[i][2], ind: /^<h\d[^>]*class="[^"]*Indent/i.test(parts[i]), title: text(parts[i]).replace(/[.:]\s*$/, ''), html: parts[i + 1] || '' });
    }
    return out;
}
// HTML cut before the paragraph that says other books' options follow; [kept html, rest]
function cutMarker(h) {
    const m = MARKER.exec(h);
    if (!m) return [h, ''];
    const at = h.lastIndexOf('<p', m.index);
    return [h.slice(0, at < 0 ? m.index : at), h.slice(at < 0 ? m.index : at)];
}
// "<p><strong>Name.</strong> text</p>" paragraphs -> traits; other paragraphs belong to the trait before them (or intro)
function boldTraits(h) {
    const intro = [], traits = [];
    for (const m of h.matchAll(/<(p|ul|ol|table)\b[^>]*>[\s\S]*?<\/\1>/gi)) {
        const b = m[0].match(/^<p\b[^>]*>(?:\s*<(?:span|font|em|a)\b[^>]*>)*\s*<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/i);
        const all = P(m[0]);
        if (!all.length) continue;
        const name = b && text(b[2]);
        if (name && name.length < 60) {
            const rest = all.join(' ').slice(name.length).trim();
            traits.push({ name: name.replace(/[.:]\s*$/, ''), desc: rest ? [rest] : [] });
        } else (traits.length ? traits[traits.length - 1].desc : intro).push(...all);
    }
    return { intro, traits };
}

// ---------- heritages and cultures ----------

// a gift/paragon section and its option subsections -> one trait with choices
function giftTrait(raceIdx, secs, i, kind) {
    const s = secs[i];
    const options = [];
    let stopped = false;
    const optLvl = secs[i + 1]?.lvl;
    for (let k = i + 1; k < secs.length && secs[k].lvl > s.lvl; k++) {
        const o = secs[k];
        if (stopped) { SKIPPED.push({ cat: 'races', name: `${s.title}: ${o.title}`, why: 'listed as from another book (not the Adventurer\'s Guide)' }); continue; }
        if (o.lvl > optLvl) { options[options.length - 1]?.desc.push(o.title + '.', ...P(o.html)); continue; }
        const [keep, rest] = cutMarker(o.html);
        options.push({ index: `${raceIdx}-${kind}-${slug(o.title)}`, name: o.title, desc: P(keep) });
        if (rest) stopped = true;
    }
    return { index: `${raceIdx}-${kind}s`, name: s.title, desc: P(cutMarker(s.html)[0]), choices: { choose: 1, options } };
}

async function heritage(path, name, log) {
    const j = await page(path);
    if (!j) { log(`a5e: heritage ${name} not found at ${path}`); return null; }
    const idx = slug(name);
    const race = { index: idx, name, ...base, speed: null, ability_bonuses: [], alignment: '', age: '', size: '', size_description: '',
        languages: [], language_desc: '', traits: [], subraces: [] };
    const suggested = [];
    const secs = sections(body(j));
    let seenTraits = false;
    for (let i = 0; i < secs.length; i++) {
        const s = secs[i];
        if (s.lvl !== 2) continue;
        if (/traits$/i.test(s.title)) {
            seenTraits = true;
            for (const t of boldTraits(s.html).traits) {
                const d = t.desc.join(' ');
                if (t.name === 'Age') race.age = d;
                else if (t.name === 'Size') { race.size_description = d; race.size = (/Your size is (Tiny|Small|Medium|Large)/i.exec(d) || [])[1] || ''; }   // "Medium (or Small with ...)" -> the rest stays in size_description
                else if (t.name === 'Speed') {
                    race.speed = +((/Speed is (\d+) feet/i.exec(d) || [])[1]) || null;
                    if (d.replace(/^Your base Speed is \d+ feet\.\s*/i, '')) race.traits.push({ index: `${idx}-speed`, name: 'Speed', desc: t.desc });
                    if (!race.speed) log(`a5e: no speed number in ${name}: ${d}`);
                } else race.traits.push({ index: `${idx}-${slug(t.name)}`, name: t.name, desc: t.desc });
            }
        } else if (/paragon/i.test(s.title)) race.traits.push(giftTrait(idx, secs, i, 'paragon-gift'));
        else if (/gifts?$/i.test(s.title)) race.traits.push(giftTrait(idx, secs, i, 'gift'));
        else if (/culture$/i.test(s.title)) {
            for (let k = i + 1; k < secs.length && secs[k].lvl > 2; k++) {
                if (/suggested cultures/i.test(secs[k].title)) suggested.push(...links(cutMarker(secs[k].html)[0]).map((l) => slug(l.name)));
            }
        } else if (seenTraits) {
            // e.g. Dragonborn "Draconic Ancestry": a rule the traits refer to, kept as a trait
            let h = s.html;
            for (let k = i + 1; k < secs.length && secs[k].lvl > 2; k++) h += `<p>${secs[k].title}.</p>` + secs[k].html;
            race.traits.push({ index: `${idx}-${slug(s.title)}`, name: s.title, desc: P(h) });
        }
    }
    if (!race.speed) log(`a5e: heritage ${name} has no speed`);
    return { race, suggested };
}

// ---------- classes and archetypes ----------

// "Ability Score Increase" = "Ability Score Improvement", "Extra Attack (2)" = "Extra Attack", "Signature Spell" = "Signature Spells"
const norm = (s) => slug(s.replace(/\([^)]*\)/g, '')).replace(/increase/g, 'improvement').replace(/-features?$/, '').replace(/s\b/g, '');
const same = (a, b) => { a = norm(a); b = norm(b); return a === b || a.endsWith('-' + b) || b.endsWith('-' + a); };
const prefixed = (a, b) => norm(a).startsWith(norm(b) + '-');   // "Wild Shape Improvement" -> "Wild Shape"

// heading sections -> features [{name, intro[], subs:[{name, desc[]}]}]. The site's heading levels vary per class
// (fighter: h2 features + h3.Indent1 options; bard: h3 features, some h2): a heading starts a feature when it is
// no deeper than the current feature's, or no deeper than the first feature's and not indented; else it's an option
function collect(secs) {
    const top = secs.find((s) => s.title)?.lvl;
    const out = [];
    let curLvl = 0;
    for (const s of secs) {
        const cur = out[out.length - 1];
        if (!s.title) { if (cur) cur.intro.push(...P(s.html)); continue; }
        if (!cur || s.lvl <= curLvl || (s.lvl <= top && !s.ind)) { out.push({ name: s.title, intro: P(s.html), subs: [] }); curLvl = s.lvl; }
        else cur.subs.push({ name: s.title, desc: P(s.html) });
    }
    return out;
}

// collected feature -> srd feature; subs become choices when the text asks for a choice, else "Name. text" paragraphs
function toFeature(prefix, f, level) {
    const index = `${prefix}-${slug(f.name)}`;
    const feat = { index, name: f.name, level, desc: [...f.intro] };
    const ask = /\b(choose|select)\b|one of the following/i.exec(f.intro.join(' '));
    if (f.subs.length > 1 && ask) {
        const n = (/\b(?:choose|select)\s+(one|two|three|four)\b/i.exec(f.intro.join(' ')) || [])[1];
        feat.choices = { choose: NUM[(n || 'one').toLowerCase()], options: f.subs.map((o) => ({ index: `${index}-${slug(o.name)}`, name: `${f.name}: ${o.name}`, desc: o.desc })) };
    } else for (const o of f.subs) feat.desc.push(`${o.name}. ${o.desc[0] || ''}`.trim(), ...o.desc.slice(1));
    return feat;
}

// "Dexterity 13 and Wisdom 13" / "Strength 13 or Dexterity 13" -> srd multi_classing prerequisites
function mcPrereq(s) {
    const scores = [...s.matchAll(/(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s+(\d+)/gi)].map((m) => ({ ability_score: ABIL[m[1].toLowerCase()], minimum_score: +m[2] }));
    if (/\bor\b/i.test(s)) return { prerequisite_options: { type: 'ability-scores', choose: 1, from: { option_set_type: 'options_array', options: scores.map((x) => ({ option_type: 'score_prerequisite', ...x })) } } };
    return { prerequisites: scores };
}
function mcProfs(s, cls, log) {
    const out = { proficiencies: [] };
    const choices = [];
    const paren = /\(([^)]*)\)/.exec(s);
    if (paren) log(`a5e: ${cls.name} multiclass note not kept in data (in the class text): ${paren[1]}`);
    s = s.replace(/\([^)]*\)/g, '').trim();
    const whole = /^(one|two|three) from (.+)$/i.exec(s);
    for (const item of whole ? [s] : s.split(/,\s*/)) {
        const c = /^(one|two|three)\b(.*)$/i.exec(item);
        if (!c) { out.proficiencies.push(skillRef(item) || slug(item)); continue; }
        const n = NUM[c[1].toLowerCase()];
        let from = null;
        if (whole) from = skillOpts(listSplit(whole[2]));
        else if (/class.? skill list/i.test(item)) from = cls.proficiency_choices.find((p) => /skill/i.test(p.desc))?.from || null;
        else if (/^one skill\b/i.test(item)) from = skillOpts(SKILLS);
        choices.push({ desc: item, choose: n, type: 'proficiencies', from });
    }
    if (choices.length) out.proficiency_choices = choices;
    return out;
}

// Hit Points / Proficiencies / Equipment blocks of a class page
function classBasics(cls, title, h, log) {
    const lines = P(h);
    const all = lines.join('\n');
    if (/hit points/i.test(title)) cls.hit_die = +((/Hit Dice:\s*1d(\d+)/i.exec(all) || [])[1]) || null;
    else if (/proficiencies/i.test(title)) {
        for (const l of lines) {
            const m = /^(Armor|Weapons|Tools|Saving Throws|Skills):\s*(.*)$/i.exec(l);
            if (!m) continue;
            const [, kind, v] = m;
            if (/^none\.?$/i.test(v)) continue;
            if (/saving/i.test(kind)) {
                cls.saving_throws = listSplit(v).map((a) => ABIL[a.toLowerCase()]).filter(Boolean);
                cls.proficiencies.push(...cls.saving_throws.map((a) => 'saving-throw-' + a));
                continue;
            }
            const ch = /^(?:choose\s+)?(one|two|three|four|any \w+)\b.*?\bfrom\s+(.+?)\.?$/i.exec(v) || /^choose (any \w+)/i.exec(v);
            if (ch) {
                const n = NUM[ch[1].toLowerCase()] || NUM[ch[1].split(' ')[1]?.toLowerCase()] || 1;
                const names = ch[2] ? listSplit(ch[2]) : SKILLS;
                cls.proficiency_choices.push({ desc: `${kind}: ${v}`, choose: n, type: 'proficiencies', from: /skills/i.test(kind) ? skillOpts(names) : { option_set_type: 'options_array', options: names.map((x) => ({ option_type: 'reference', item: slug(x) })) } });
            } else if (/^(?:choose\s+)?(one|two|three)\b/i.test(v)) {
                // "Choose one type of artisan's tools or one musical instrument": no list to pick from
                cls.proficiency_choices.push({ desc: `${kind}: ${v}`, choose: NUM[/(one|two|three)/i.exec(v)[1].toLowerCase()], type: 'proficiencies', from: null });
            } else {
                const note = /\(([^)]*)\)/.exec(v);
                if (note) log(`a5e: ${cls.name} ${kind} note kept only in the class text: ${note[1]}`);
                cls.proficiencies.push(...listSplit(v.replace(/\([^)]*\)/g, '').replace(/\.$/, '')).map((x) => skillRef(x) || slug(x)));
            }
        }
    } else if (/equipment/i.test(title)) {
        const sets = lines.filter((l) => l.startsWith('- ')).map((l) => l.slice(2));
        const intro = lines.filter((l) => !l.startsWith('- ')).join(' ');
        const letters = 'abcdefghij';
        cls.starting_equipment_options.push({ desc: [intro, sets.map((s, i) => `(${letters[i]}) ${s}`).join(' or ')].filter(Boolean).join(' '), choose: 1, type: 'equipment', from: null });
    }
}

// level table + spell table -> 20 srd level entries
function classLevels(cls, feats, main, slots, log) {
    const head = main[0].map((c) => c.toLowerCase());
    const col = (re) => head.findIndex((c) => re.test(c));
    const cProf = col(/proficiency/), cFeat = col(/^features$/);
    const slotHead = slots ? slots[0].map((c) => c.toLowerCase()) : [];
    const byLevel = (t) => Object.fromEntries(t.slice(1).map((r) => [+((/^(\d+)/.exec(r[0]) || [])[1]), r]).filter(([l]) => l));
    const mainRows = byLevel(main), slotRows = slots ? byLevel(slots) : {};
    const num = (v) => (/^[+-]?\d+$/.test(v) ? +v : v);
    const spellCol = (h) => (/^cantrips known$/.test(h) ? 'cantrips_known' : /^spells known$/.test(h) ? 'spells_known'
        : /^(\d)(st|nd|rd|th)$/.test(h) ? 'spell_slots_level_' + h[0] : null);
    const levels = [];
    let asi = 0;
    for (let L = 1; L <= 20; L++) {
        const r = mainRows[L];
        if (!r) { log(`a5e: ${cls.name} table has no row for level ${L}`); continue; }
        const lv = { level: L, ability_score_bonuses: 0, prof_bonus: +r[cProf] || null, features: feats.filter((f) => f.level === L) };
        const sp = {}, cs = {};
        head.forEach((h, i) => {
            if (i === 0 || i === cProf || i === cFeat) return;
            const k = spellCol(h);
            if (k) sp[k] = r[i] === '—' || r[i] === '-' ? 0 : num(r[i]);
            else cs[slug(main[0][i]).replace(/-/g, '_')] = num(r[i]);
        });
        slotHead.forEach((h, i) => {
            const k = spellCol(h);
            const v = slotRows[L]?.[i];
            if (k && v !== undefined) sp[k] = v === '—' || v === '-' ? 0 : num(v);
        });
        // table names with no feature text at this level: the same feature again (ASI, Extra Attack (2), ...)
        for (const n of (r[cFeat] || '').split(/,\s*(?![^()]*\))/).map((x) => x.trim()).filter((x) => x && !/^[—–-]$/.test(x))) {
            if (/ability score (increase|improvement)/i.test(n)) asi++;
            if (lv.features.some((f) => same(f.name, n))) continue;
            const f = feats.find((x) => same(x.name, n)) || feats.find((x) => prefixed(n, x.name));
            if (f) lv.features.push({ ...f, index: `${f.index}-${L}`, name: n, level: L });
            else {
                // "Archetype Feature" rows are the subclass's; anything else is a name the page has no heading for
                lv.features.push({ index: `${cls.index}-${slug(n)}-${L}`, name: n, level: L, desc: [] });
                if (!/feature$/i.test(n)) log(`a5e: ${cls.name} level ${L} "${n}" has no feature text`);
            }
        }
        lv.ability_score_bonuses = asi;
        if (Object.keys(sp).length) {
            if (slots || Object.keys(sp).some((k) => k.startsWith('spell_slots'))) for (let s = 1; s <= 9; s++) sp['spell_slots_level_' + s] ??= 0;
            lv.spellcasting = sp;
        }
        if (Object.keys(cs).length) lv.class_specific = cs;
        levels.push(lv);
    }
    return levels;
}

// the floated "<Class> Archetypes" box: links to every archetype (any book); returns [links, html without it]
function archetypeBox(h) {
    const at = h.search(/Archetypes\s*<\//i);
    if (at < 0) return [[], h];
    const s = h.lastIndexOf('<div', at), e = h.indexOf('</div>', at);
    if (s < 0 || e < 0) return [[], h];
    return [links(h.slice(s, e)), h.slice(0, s) + h.slice(e + 6)];
}

async function klass(path, name, mc, log) {
    const j = await page(path);
    if (!j) { log(`a5e: class ${name} not found at ${path}`); return null; }
    const idx = slug(name);
    const cls = { index: idx, name, ...base, desc: [], hit_die: null, proficiency_choices: [], proficiencies: [], saving_throws: [],
        starting_equipment: [], starting_equipment_options: [], multi_classing: {}, subclasses: [], spellcasting: null, spells: [], levels: [] };
    let [arch, h] = archetypeBox(body(j));
    const tables = (h.match(/<table\b[\s\S]*?<\/table>/gi) || []);
    const main = tables.find((t) => /proficiency\s*bonus/i.test(rows(t)[0]?.join(' ')));
    const slots = tables.find((t) => t !== main && /^level$/i.test(rows(t)[0]?.[0]) && rows(t)[0].some((c) => /^(1st|cantrips known|spells known)$/i.test(c)));
    if (!main) { log(`a5e: class ${name} has no level table, skipped`); SKIPPED.push({ cat: 'classes', name, why: 'no level table' }); return null; }
    for (const t of [main, slots]) if (t) h = h.replace(t, '');
    if (MARKER.test(h)) log(`a5e: class ${name} says other books' options follow somewhere; check its feature options`);

    const secs = sections(h);
    const start = secs.findIndex((s) => /^class features$/i.test(s.title));
    for (const s of secs.slice(0, start)) cls.desc.push(...P(s.html));
    let k = start + 1;
    for (; k < secs.length && /^(hit points|proficiencies|equipment)$/i.test(secs[k].title); k++) classBasics(cls, secs[k].title, secs[k].html, log);
    if (!cls.hit_die) log(`a5e: class ${name}: no hit die found`);

    // features; a repeated heading with no level of its own (the knack list at the end) joins the first one
    const raw = [];
    for (const f of collect(secs.slice(k))) {
        const prev = raw.find((x) => x.name === f.name);
        if (prev && !levelIn(f.intro.join(' '))) { prev.intro.push(...f.intro); prev.subs.push(...f.subs); } else raw.push(f);
    }
    const tableLevel = (n) => { for (const r of rows(main).slice(1)) if (r[2] && r[2].split(/,\s*/).some((x) => same(x, n))) return +((/^(\d+)/.exec(r[0]) || [])[1]); return null; };
    let last = 1;
    const feats = [];
    for (const f of raw) {
        const level = levelIn(f.intro.slice(0, 2).join(' ')) || tableLevel(f.name) || last;
        last = level;
        const feat = toFeature(idx, f, level);
        feats.push(feat);
        if (/^(spellcasting|pact magic)$/i.test(f.name)) {
            const all = [...f.intro, ...f.subs.flatMap((s) => s.desc)].join(' ');
            cls.spellcasting = { level, spellcasting_ability: ABIL[((/(Intelligence|Wisdom|Charisma) is your spellcasting ability/i.exec(all) || [])[1] || '').toLowerCase()] || null,
                info: f.subs.map((s) => ({ name: s.name, desc: s.desc })) };
            if (f.intro.length) cls.spellcasting.info.unshift({ name: f.name, desc: f.intro });
        }
    }
    cls.levels = classLevels(cls, feats, rows(main), slots && rows(slots), log);
    const flavor = (feats.find((f) => /archetype$/i.test(f.name)) || {}).name || `${name} Archetype`;

    // multiclassing table rows (Adventurer's Guide tables on /rules/multiclassing)
    if (mc.pre[idx]) Object.assign(cls.multi_classing, mcPrereq(mc.pre[idx]));
    if (mc.prof[idx]) Object.assign(cls.multi_classing, mcProfs(mc.prof[idx], cls, log));
    if (!mc.pre[idx]) log(`a5e: no multiclassing prerequisites for ${name}`);

    // archetypes: every one the class page links to, kept when its source is the Adventurer's Guide
    const subclasses = {};
    for (const l of arch) {
        if (!/^\/node\/|\/rules\//.test(l.href.replace(SITE, ''))) continue;
        const a = await page(l.href);
        if (!a || a.type?.[0]?.target_id !== 'archetype') continue;
        const aname = text(a.title?.[0]?.value || l.name);
        const src = sourceOf(a);
        if (src !== AG) { SKIPPED.push({ cat: 'subclasses', name: `${name}: ${aname}`, why: `not in the Adventurer's Guide (${src || 'no source'})` }); continue; }
        const sc = archetype(a, aname, idx, name, flavor, log);
        if (subclasses[sc.index]) log(`a5e: duplicate archetype ${sc.index}`);
        subclasses[sc.index] = sc;
    }
    cls.subclasses = Object.keys(subclasses);
    return { cls, subclasses };
}

function archetype(j, name, clsIdx, clsName, flavor, log) {
    const idx = slug(name);
    const sc = { index: idx, class: clsIdx, name, ...base, subclass_flavor: flavor, desc: [], spells: [], levels: [] };
    const [, h] = archetypeBox(body(j));
    const secs = sections(h);
    // the always-prepared list: "1st level - cure wounds, healing word" lines
    const spellLines = (lines) => lines.filter((l) => {
        const m = /^(\d+)(?:st|nd|rd|th)[ -]level\s*[-–—:]\s*(.+)$/i.exec(l);
        if (!m) return false;
        for (const s of listSplit(m[2])) sc.spells.push({ prerequisites: [`${clsIdx}-${m[1]}`], spell: slug(s) });
        return true;
    });
    const intro = P(secs[0].html);
    const kept = new Set(spellLines(intro));
    sc.desc = intro.filter((l) => !kept.has(l) && !/archetype spells$/i.test(l));
    const rest = secs.slice(1).filter((s) => {
        if (!/spells$/i.test(s.title)) return true;
        if (!spellLines(P(s.html)).length) return true;
        return false;
    });
    // a feature without "at Nth level" takes the level of the one before it, or (first ones) the next one that has it
    const fs = rest.length ? collect(rest) : [];
    const lvls = fs.map((f) => levelIn(f.intro.slice(0, 2).join(' ')));
    for (let i = 0; i < lvls.length; i++) lvls[i] ||= lvls[i - 1] || lvls.slice(i).find(Boolean) || null;
    const byLevel = new Map();
    fs.forEach((f, i) => {
        let level = lvls[i];
        if (!level) { log(`a5e: ${clsName} ${name}: no level for "${f.name}", put at 1`); level = 1; }
        if (!byLevel.has(level)) byLevel.set(level, []);
        byLevel.get(level).push(toFeature(`${clsIdx}-${idx}`, f, level));
    });
    sc.levels = [...byLevel].sort((a, b) => a[0] - b[0]).map(([level, features]) => ({ level, features }));
    if (!sc.levels.length) log(`a5e: ${clsName} ${name}: no features found`);
    return sc;
}

async function multiclassTables(log) {
    const j = await page('/rules/multiclassing');
    const pre = {}, prof = {};
    if (!j) { log('a5e: multiclassing page not found'); return { pre, prof }; }
    const h = body(j);
    // the first table of each kind is the Adventurer's Guide one (the Voidrunner's Codex tables follow)
    const tables = (h.match(/<table\b[\s\S]*?<\/table>/gi) || []).map(rows);
    const pick = (re, into) => {
        const t = tables.find((r) => re.test(r[0]?.join(' ')));
        for (const r of t ? t.slice(1) : []) if (r[0]) into[slug(r[0])] = r[1] || '';
    };
    pick(/ability score minimum/i, pre);
    pick(/proficiencies gained/i, prof);
    return { pre, prof };
}

// ---------- listings ----------

// a listing page (srd_page with a table): rows whose last cell names the Adventurer's Guide -> [{name, href}]
async function agRows(path, what, log) {
    const j = await page(path);
    const out = [];
    for (const tr of body(j).match(/<tr\b[\s\S]*?<\/tr>/gi) || []) {
        const cells = tr.match(/<td\b[\s\S]*?<\/td>/gi) || [];
        if (cells.length < 2) continue;
        const name = text(cells[0]);
        const href = links(cells[0])[0]?.href;
        const src = text(cells[cells.length - 1]);
        if (!/Adventurer.s Guide/i.test(src)) { SKIPPED.push({ cat: what, name, why: `not in the Adventurer's Guide (${src || 'no source'})` }); continue; }
        if (!href) { log(`a5e: ${what} ${name} has no link`); continue; }
        out.push({ name, href });
    }
    return out;
}

// the Adventurer's Guide table of contents: classes in chapter 3
async function agClasses() {
    const h = body(await page('/rules/adventurers-guide'));
    const ch3 = h.slice(h.search(/Adventuring Classes/i), h.search(/Chapter 4/i));
    return (ch3.match(/<li\b[\s\S]*?<\/li>/gi) || []).map((li) => links(li)[0]).filter((l) => l && !/^classes$/i.test(l.name));
}

async function feats(log) {
    // Open5e's A5E document already has most of them; take only the ones it lacks
    let have = null;
    try {
        const o = await getJson('https://api.open5e.com/v1/feats/?document__slug=a5e&limit=500');
        have = new Set((o?.results || []).map((f) => slug(f.name)));
    } catch (e) { log(`a5e: Open5e feat list unreadable (${e.message}); importing every Adventurer's Guide feat`); }
    const h = (await get(SITE + '/feats')).replace(/<!--[\s\S]*?-->/g, '');
    if (/pager__item--next/.test(h)) log('a5e: /feats has more than one page; only the first was read');
    const out = {};
    for (const tr of h.match(/<tr>[\s\S]*?<\/tr>/g) || []) {
        const l = links(tr)[0];
        const src = (/href="(\/sources\/[^"]*)"/.exec(tr) || [])[1];
        if (!l || src !== AG) continue;
        const idx = slug(l.name);
        if (have?.has(idx)) continue;
        const j = await page(l.href);
        if (!j || sourceOf(j) !== AG) { log(`a5e: feat ${l.name} unreadable or not Adventurer's Guide`); continue; }
        const pre = text(clean(j.field_feat_prerequisite_formattd?.[0]?.processed ?? j.field_feat_prerequisite_formattd?.[0]?.value ?? ''));
        const m = /^(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) (\d+) or higher$/i.exec(pre);
        out[idx] = { index: idx, name: l.name, ...base, prerequisites: m ? [{ ability_score: ABIL[m[1].toLowerCase()], minimum_score: +m[2] }] : pre ? [{ desc: pre }] : [],
            desc: P(body(j, 'field_feat_details')) };
    }
    if (have) log(`a5e: ${Object.keys(out).length} Adventurer's Guide feats that Open5e's A5E document lacks`);
    return out;
}

export default async function load(log = () => {}) {
    const races = {}, subraces = {}, classes = {}, subclasses = {};

    for (const { name, href } of await agRows('/rules/heritages', 'races', log)) {
        const r = await heritage(href, name, log);
        if (!r) continue;
        races[r.race.index] = r.race;
    }

    // cultures are left out (owner's call, 2026-11-03): neither subraces nor a separate pick

    const mc = await multiclassTables(log);
    for (const { name, href } of await agClasses()) {
        const r = await klass(href, name, mc, log);
        if (!r) continue;
        classes[r.cls.index] = r.cls;
        for (const [k, v] of Object.entries(r.subclasses)) {
            // two classes with a same-named archetype: the second gets the class in its index
            const i = subclasses[k] ? `${v.class}-${k}` : k;
            if (i !== k) { log(`a5e: archetype ${k} in both ${subclasses[k].class} and ${v.class}; the second is ${i}`); r.cls.subclasses[r.cls.subclasses.indexOf(k)] = i; }
            subclasses[i] = { ...v, index: i };
        }
    }

    return { races, subraces, classes, subclasses, feats: await feats(log) };
}
