// Source module: races, subraces, backgrounds, feats and spells from two wikidot wikis.
//   dnd5e.wikidot.com  -> src "wikidot",     rules "2014"
//   dnd2024.wikidot.com -> src "wikidot2024", rules "2024"
// Unearthed Arcana / playtest pages and sections are skipped and listed in SKIPPED.
// Fetches only through ./fetch.mjs (cached, polite). See the contract notes in build-content.mjs.
import { get, slug, text, paras } from './fetch.mjs';

export const SKIPPED = [];
const skip = (cat, name, why) => SKIPPED.push({ cat, name, why });

const W14 = { base: 'https://dnd5e.wikidot.com', src: 'wikidot', rules: '2014' };
const W24 = { base: 'https://dnd2024.wikidot.com', src: 'wikidot2024', rules: '2024' };

const ABIL = { strength: 'str', dexterity: 'dex', constitution: 'con', intelligence: 'int', wisdom: 'wis', charisma: 'cha' };
const ABIL_RE = 'Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma';
const SKILLS = ['Acrobatics', 'Animal Handling', 'Arcana', 'Athletics', 'Deception', 'History', 'Insight', 'Intimidation', 'Investigation', 'Medicine', 'Nature', 'Perception', 'Performance', 'Persuasion', 'Religion', 'Sleight of Hand', 'Stealth', 'Survival'];
const LANGS = ['Common', 'Dwarvish', 'Elvish', 'Giant', 'Gnomish', 'Goblin', 'Halfling', 'Orc', 'Abyssal', 'Celestial', 'Draconic', 'Deep Speech', 'Infernal', 'Primordial', 'Sylvan', 'Undercommon', 'Auran', 'Aquan', 'Ignan', 'Terran', 'Gith', 'Druidic', "Thieves' Cant"];
const NUM = { one: 1, two: 2, three: 3, four: 4, a: 1, an: 1 };

const isUA = (s) => /\bUA\b|unearthed arcana|playtest/i.test(s || '');

// ---- page helpers -------------------------------------------------------------------------------------------
const title = (h) => text((h.match(/class="page-title page-header"><span>([\s\S]*?)<\/span>/) || [])[1] || (h.match(/<title>([\s\S]*?) - /) || [])[1] || '');

// the wiki page body, with hover tooltips ("pouch<span>Value:5sp</span>") reduced to their word and ads/scripts removed
function content(h) {
    const i = h.indexOf('id="page-content">');
    if (i < 0) return '';
    let b = h.slice(i + 18);
    const ends = [b.search(/<\/div>\s*<!-- (floating|mobile)/), b.indexOf('<div class="page-tags"')].filter((n) => n >= 0);
    if (ends.length) b = b.slice(0, Math.min(...ends));
    return b
        .replace(/<!--[\s\S]*?-->/g, '').replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<div id="toc"[\s\S]*?<\/div>\s*<\/div>/, '')
        .replace(/<span class="hover">([^<]*)<span>[\s\S]*?<\/span><\/span>/g, '$1');
}

// Page body -> blocks: {k:'h',n,text} | {k:'t',lines} | {k:'p',li,depth,html,text,lead,rest,intro}
// lead = the bold opening ("Speed." -> "Speed"), rest = the text after it, intro = a bold-italic flavour paragraph.
function blocks(body) {
    const out = [];
    let depth = 0;
    for (const c of body.split(/(?=<(?:p|li|table|h[1-6])\b)/i)) {
        const tag = (c.match(/^<(p|li|table|h[1-6])\b/i) || [])[1]?.toLowerCase();
        const d = depth;
        depth += (c.match(/<ul\b/gi) || []).length - (c.match(/<\/ul>/gi) || []).length;
        if (!tag) continue;
        if (tag[0] === 'h' && tag.length === 2) { out.push({ k: 'h', n: +tag[1], text: text(c) }); continue; }
        if (tag === 'table') { const lines = paras(c.slice(0, c.indexOf('</table>') + 8)); if (lines.length) out.push({ k: 't', lines }); continue; }
        const t = text(c);
        if (!t) continue;
        const m = c.match(/^<(?:p|li)[^>]*>\s*<(strong|b|em)>([\s\S]*?)<\/\1>/i);
        let lead = '', rest = t, intro = false;
        if (m && m[1] !== 'em' || m && /<(strong|b)>/i.test(m[2])) {
            lead = text(m[2]);
            rest = text(c.slice(m[0].length));
            intro = !rest && /<(em|strong)>/i.test(m[2]);   // <strong><em>flavour text</em></strong>
            lead = lead.replace(/[.:]\s*$/, '').trim();
            if (intro || lead.length > 60) { lead = ''; rest = t; }
        }
        out.push({ k: 'p', li: tag === 'li', depth: d, html: c, text: t, lead, rest, intro });
    }
    return out;
}

// blocks -> {intro:[text], entries:[{name, desc:[...]}]}; a bold lead starts an entry, anything else continues the last one.
// liEntries: whether top-level list items start entries (races) or are just "- item" lines (2024 pages).
function entries(bl, liEntries = true) {
    const intro = [], list = [];
    let cur = null;
    for (const b of bl) {
        if (b.k === 'h') { cur = { name: b.text, desc: [] }; list.push(cur); continue; }
        if (b.k === 't') { (cur ? cur.desc : intro).push(...b.lines); continue; }
        if (b.intro) { intro.push(b.text); continue; }
        if (/^Source:/i.test(b.text)) continue;
        const asEntry = b.lead && (liEntries ? b.depth <= 1 : !b.li);
        if (asEntry) { cur = { name: b.lead, desc: b.rest ? [b.rest] : [] }; list.push(cur); }
        else (cur ? cur.desc : intro).push(b.li ? '- ' + b.text : b.text);
    }
    return { intro, entries: list };
}

const sourceOf = (bl) => (bl.find((b) => b.k === 'p' && /^Source:/i.test(b.text)) || {}).text?.replace(/^Source:\s*/i, '') || '';
const abilities = (t) => {
    const out = [];
    const add = (names, n) => { for (const a of names.match(new RegExp(ABIL_RE, 'gi'))) out.push({ ability_score: ABIL[a.toLowerCase()], bonus: +n }); };
    for (const m of t.matchAll(new RegExp(`((?:(?:${ABIL_RE})(?:,\\s*|\\s+and\\s+|\\s*,?\\s+and\\s+)?)+)\\s+scores?\\s+(?:each\\s+)?increases?\\s+by\\s+(\\d)`, 'gi'))) add(m[1], m[2]);
    for (const m of t.matchAll(new RegExp(`increase\\s+(?:your\\s+)?(${ABIL_RE})\\s+score\\s+by\\s+(\\d)`, 'gi'))) add(m[1], m[2]);
    return out;
};
const dedupeSlug = (name, used) => { let s = slug(name) || 'x', n = 2; const base = s; while (used.has(s)) s = base + '-' + n++; used.add(s); return s; };
const traitsOf = (list) => { const used = new Set(); return list.map((e) => ({ index: dedupeSlug(e.name, used), name: e.name, desc: e.desc })); };

// ---- races / subraces ---------------------------------------------------------------------------------------
const sizeOf = (t) => { const m = (t || '').match(/\b(tiny|small|medium|large|huge|gargantuan)\b/i); return m ? m[1][0].toUpperCase() + m[1].slice(1).toLowerCase() : ''; };   // first size named ("Small or Medium" -> Small)
const RACE_STATS =['Ability Score Increase', 'Age', 'Alignment', 'Size', 'Speed', 'Languages'];

function raceFromEntries(index, name, E, { src, rules }, bonusTrait = true) {
    const get1 = (n) => E.entries.find((e) => e.name.toLowerCase() === n.toLowerCase());
    const asi = get1('Ability Score Increase'), sz = get1('Size'), sp = get1('Speed'), lg = get1('Languages');
    const asiT = asi ? asi.desc.join(' ') : '';
    const traits = traitsOf(E.entries.filter((e) => !RACE_STATS.includes(e.name)));
    if (bonusTrait && asi && /choice|another|different|other|choose|any|one /i.test(asiT)) traits.unshift({ index: 'ability-score-increase', name: 'Ability Score Increase', desc: asi.desc });
    const langText = lg ? lg.desc.join(' ') : '';
    return {
        index, name, src, rules,
        speed: +((sp?.desc.join(' ').match(/(\d+)\s*(?:feet|ft)/) || [])[1] || 0),
        ability_bonuses: abilities(asiT),
        alignment: (get1('Alignment') || { desc: [] }).desc.join(' '),
        age: (get1('Age') || { desc: [] }).desc.join(' '),
        size: sizeOf(sz?.desc.join(' ')),
        size_description: sz ? sz.desc.join(' ') : '',
        languages: LANGS.filter((l) => new RegExp(`\\b${l}\\b`).test(langText.split(/\.\s/)[0].replace(/\bElven\b/g, 'Elvish'))).map(slug),
        language_desc: langText,
        traits,
        subraces: [],
    };
}

async function races14(log, out) {
    const idx = new Set();
    for (const u of ['/', '/lineage']) {
        const h = await get(W14.base + u);
        for (const m of (h || '').matchAll(/href="(?:https?:\/\/dnd5e\.wikidot\.com)?\/lineage:([^"#?]+)"/g)) idx.add(m[1]);
    }
    const subUsed = new Set();
    for (const pageSlug of idx) {
        const h = await get(`${W14.base}/lineage:${pageSlug}`);
        if (!h) { skip('races', pageSlug, 'page not found'); continue; }
        const name = title(h);
        if (/-ua$/.test(pageSlug) || isUA(name)) { skip('races', name, 'Unearthed Arcana'); continue; }
        const body = content(h);
        // versions: one <h1> per book; a page with no <h1> is a single version
        const parts = body.split(/(?=<h1\b)/i).map((s) => ({ head: /^<h1/i.test(s) ? text(s.slice(0, s.indexOf('</h1>'))) : '', html: s }));
        const versions = [];
        for (const p of parts) {
            if (isUA(p.head)) { skip('races', `${name} (${p.head})`, 'Unearthed Arcana section'); continue; }
            let [top, ...subs] = p.html.split(/(?=<h2\b)/i);
            const hasBase = (h) => entries(blocks(h).filter((b) => b.k !== 'h')).entries.some((e) => e.name === 'Speed' || e.name === 'Size');
            // some pages put the base traits under a first <h2> ("Kender Traits") instead of at the top
            if (!hasBase(top) && subs.length && hasBase(subs[0])) { top += subs[0]; subs = subs.slice(1); }
            const bl = blocks(top).filter((b) => b.k !== 'h');
            if (hasBase(top)) versions.push({ p, E: entries(bl), subs, bl });
        }
        if (!versions.length) {
            const wholeUA = isUA(sourceOf(blocks(body)));
            skip('races', name, wholeUA ? 'Unearthed Arcana (Source line)' : 'no version with base traits found');
            if (!wholeUA) log(`wikidot race ${pageSlug}: no section with Speed/Size, not parsed`);
            continue;
        }
        const v = versions[0];   // first non-UA version = the newest core book (Monsters of the Multiverse, else the Player's Handbook)
        const src14 = sourceOf(v.bl);
        if (isUA(src14)) { skip('races', name, 'Unearthed Arcana (Source line)'); continue; }
        const race = raceFromEntries(slug(pageSlug), name, v.E, W14);
        for (const s of v.subs) {
            const sb = blocks(s);
            const sname = sb[0]?.k === 'h' ? sb[0].text : '';
            if (!sname) continue;
            if (isUA(sname)) { skip('subraces', `${name}: ${sname}`, 'Unearthed Arcana'); continue; }
            const E = entries(sb.slice(1));
            const asi = E.entries.find((e) => e.name === 'Ability Score Increase');
            const asiT = asi ? asi.desc.join(' ') : '';
            const traits = traitsOf(E.entries.filter((e) => e.name !== 'Ability Score Increase'));
            if (asi && /choice|another|different|other|choose|any|one /i.test(asiT)) traits.unshift({ index: 'ability-score-increase', name: 'Ability Score Increase', desc: asi.desc });
            const sidx = dedupeSlug(subUsed.has(slug(sname)) ? `${race.index}-${sname}` : sname, subUsed);
            out.subraces[sidx] = { index: sidx, name: sname, src: W14.src, rules: W14.rules, race: race.index, desc: E.intro.join(' '), ability_bonuses: abilities(asiT), traits };
            race.subraces.push(sidx);
        }
        out.races[race.index] = race;
        if (versions.length > 1 || parts.length > 1) log(`wikidot race ${pageSlug}: used "${v.p.head || 'whole page'}" of ${parts.map((p) => p.head).filter(Boolean).join(' / ') || 'one version'}`);
    }
}

async function races24(log, out) {
    const list = await get(W24.base + '/species:all');
    const idx = [...new Set([...(list || '').matchAll(/href="\/species:([^"#?]+)"/g)].map((m) => m[1]))].filter((s) => s !== 'all');
    for (const pageSlug of idx) {
        const h = await get(`${W24.base}/species:${pageSlug}`);
        if (!h) { skip('races', pageSlug, 'page not found'); continue; }
        const name = title(h);
        const bl = blocks(content(h));
        if (isUA(name) || isUA(sourceOf(bl))) { skip('races', name, 'Unearthed Arcana / playtest'); continue; }
        const at = bl.findIndex((b) => b.k === 'h' && /Traits$/i.test(b.text));
        if (at < 0) { skip('races', name, 'no "Traits" heading'); log(`wikidot2024 species ${pageSlug}: no Traits heading, not parsed`); continue; }
        // "Creature Type / Size / Speed" come as one paragraph with line breaks, or one paragraph each, with ":" or "." after the label
        const stat = {};
        const isStat = (b) => {
            if (b.k !== 'p') return false;
            const ls = paras(b.html).map((l) => l.match(/^(Creature Type|Size|Speed)[.:]\s*(.*)$/));
            ls.forEach((m) => m && (stat[m[1]] = m[2]));
            return ls.length > 0 && ls.every(Boolean);
        };
        const E = entries(bl.slice(at + 1).filter((b) => !isStat(b)), false);
        const traits = traitsOf(E.entries);
        if (stat['Creature Type']) traits.unshift({ index: 'creature-type', name: 'Creature Type', desc: [stat['Creature Type']] });
        const index = slug(pageSlug);
        out.races[index] = {
            index, name, src: W24.src, rules: W24.rules,
            speed: +((stat.Speed || '').match(/(\d+)/) || [])[1] || 0,
            ability_bonuses: [], alignment: '', age: '',
            size: sizeOf(stat.Size),
            size_description: stat.Size || '', languages: [], language_desc: '',
            traits, subraces: [],
        };
    }
}

// ---- backgrounds --------------------------------------------------------------------------------------------
const choiceCount = (t) => { const m = t.match(/\b(one|two|three|four|any|\d+)\b/i); return m ? (NUM[m[1].toLowerCase()] ?? (+m[1] || 1)) : 1; };
const gold = (t, last) => { const m = [...t.matchAll(/(\d[\d,]*)\s*gp\b/gi)]; const x = m[last ? m.length - 1 : 0]; return x ? +x[1].replace(/,/g, '') : null; };
const lineMap = (html, keys) => {
    const o = {};
    for (const l of paras(html)) { const m = l.match(new RegExp(`^(${keys.join('|')}):\\s*(.*)$`, 'i')); if (m && !(m[1].toLowerCase() in o)) o[m[1].toLowerCase()] = m[2]; }
    return o;
};
const skillSlugs = (t) => SKILLS.filter((s) => new RegExp(`\\b${s}\\b`, 'i').test(t)).map((s) => 'skill-' + slug(s));

function background(index, name, bl, { src, rules }, log) {
    const head = bl.find((b) => b.k === 'p' && /Skill Proficienc/i.test(b.text));
    // the lines are one paragraph with line breaks (2014) or one paragraph each (2024)
    const f = lineMap(bl.filter((b) => b.k === 'p' && !b.li).map((b) => b.html).join('\n'), ['Ability Scores', 'Feat', 'Skill Proficiencies', 'Skill Proficiency', 'Tool Proficiencies', 'Tool Proficiency', 'Languages', 'Equipment']);
    const skillsT = f['skill proficiencies'] || f['skill proficiency'] || '';
    const toolsT = f['tool proficiencies'] || f['tool proficiency'] || '';
    const langT = f.languages || '';
    const equip = f.equipment || '';
    if (!head) log(`${src} background ${index}: no proficiency lines found`);
    const profs = skillsT && !/choice|choose/i.test(skillsT) ? skillSlugs(skillsT) : [];
    const tools = toolsT && !/^none$/i.test(toolsT) && !/choice|choose|one type|any/i.test(toolsT) ? toolsT.split(/,\s*|\s+and\s+/).map((s) => slug(s.replace(/\(.*?\)/g, ''))).filter(Boolean) : [];
    const desc = [];
    // raw text for anything that could not be turned into an index
    if (skillsT && !profs.length) desc.push('Skill Proficiencies: ' + skillsT);
    if (toolsT && !/^none$/i.test(toolsT) && !tools.length) desc.push('Tool Proficiencies: ' + toolsT);
    if (langT && !/choice|choose|any/i.test(langT) && !/^none$/i.test(langT)) desc.push('Languages: ' + langT);
    // feature: the first heading after "Features" (2014)
    let feature = { name: '', desc: [] };
    // 2014 pages: h1 "Features" then h2 "<Feature name>", or a single h2 "Feature: <name>"
    const fi = bl.findIndex((b) => b.k === 'h' && /^features?$/i.test(b.text));
    const nh = fi >= 0 ? bl.findIndex((b, i) => i > fi && b.k === 'h' && b.n === 2) : bl.findIndex((b) => b.k === 'h' && /^Feature:/i.test(b.text));
    if (nh >= 0) {
        const end = bl.findIndex((b, i) => i > nh && b.k === 'h');
        feature = { name: bl[nh].text.replace(/^Feature:\s*/i, ''), desc: bl.slice(nh + 1, end < 0 ? undefined : end).flatMap((b) => (b.k === 't' ? b.lines : [(b.li ? '- ' : '') + b.text])) };
    }
    // characteristic tables: the first table after each heading
    const tab = {};
    let cur = '';
    for (const b of bl) {
        if (b.k === 'h') cur = (b.text.match(/(personality traits?|ideals?|bonds?|flaws?)$/i) || [])[1]?.toLowerCase().replace(/s$/, '') || '';
        else if (b.k === 't' && cur && !tab[cur]) tab[cur] = b.lines.map((l) => l.split(' | ')).filter((c) => c.length >= 2 && /^\d+(\s*[-–]\s*\d+)?$/.test(c[0].trim())).map((c) => c.slice(1).join(' | '));
    }
    const mk = (key, type, n, opt) => (tab[key]?.length ? { choose: n, type, from: { option_set_type: 'options_array', options: tab[key].map(opt) } } : null);
    const str = (s) => ({ option_type: 'string', string: s });
    const e = {
        index, name, src, rules,
        starting_proficiencies: [...profs, ...tools],
        language_options: /choice|choose|any/i.test(langT) ? { choose: choiceCount(langT), type: 'languages', from: null } : null,
        starting_equipment: [],
        starting_equipment_options: equip ? [{ desc: equip, choose: 1, type: 'equipment', from: null }] : [],
        feature,
        personality_traits: mk('personality trait', 'personality_traits', 2, str),
        ideals: mk('ideal', 'ideals', 1, (s) => ({ option_type: 'ideal', desc: s, alignments: [] })),
        bonds: mk('bond', 'bonds', 1, str),
        flaws: mk('flaw', 'flaws', 1, str),
        starting_gold: equip ? gold(equip, rules === '2014') : null,
        // flavour text: bold-italic intro paragraphs (2014) or the plain paragraphs that are not field lines (2024)
        desc: [...bl.filter((b) => b.k === 'p' && !b.li && (b.intro || (rules === '2024' && !/^(Source|Ability Scores|Feat|Skill Proficienc|Tool Proficienc|Languages|Equipment):/i.test(b.text)))).map((b) => b.text), ...desc],
    };
    if (f['ability scores']) e.ability_scores = (f['ability scores'].match(new RegExp(ABIL_RE, 'gi')) || []).map((a) => ABIL[a.toLowerCase()]);
    if (f.feat) e.feat = f.feat;
    return e;
}

async function backgrounds(site, log, out) {
    const list = [];
    if (site === W14) {
        const h = await get(site.base + '/');
        for (const m of (h || '').matchAll(/href="\/background:([^"#?]+)"/g)) list.push(m[1]);
    } else {
        const h = await get(site.base + '/background:all');
        for (const m of (h || '').matchAll(/href="\/background:([^"#?]+)"/g)) list.push(m[1]);
    }
    for (const pageSlug of new Set(list)) {
        if (pageSlug === 'all') continue;
        const h = await get(`${site.base}/background:${pageSlug}`);
        if (!h) { skip('backgrounds', pageSlug, 'page not found'); continue; }
        const name = title(h).replace(/^Background:\s*/i, '');
        const bl = blocks(content(h));
        if (/-ua$/.test(pageSlug) || isUA(name) || isUA(sourceOf(bl))) { skip('backgrounds', name, 'Unearthed Arcana / playtest'); continue; }
        if (!bl.some((b) => b.k === 'p' && /Skill Proficienc/i.test(b.text))) { skip('backgrounds', name, 'no "Skill Proficiencies" line (guide page or unusual layout)'); log(`${site.src} background ${pageSlug}: no Skill Proficiencies line, skipped`); continue; }
        out.backgrounds[slug(pageSlug)] =background(slug(pageSlug), name, bl, site, log);
    }
}

// ---- feats --------------------------------------------------------------------------------------------------
function prereqs(t) {
    if (!t) return [];
    const m = t.match(new RegExp(`^(${ABIL_RE})\\s+(\\d+)(?:\\s+or\\s+higher|\\+)?\\.?$`, 'i'));
    return m ? [{ ability_score: ABIL[m[1].toLowerCase()], minimum_score: +m[2] }] : [{ desc: t }];
}

async function feats(site, log, out) {
    const list = [];
    const h = await get(site.base + (site === W14 ? '/' : '/feat:all'));
    for (const m of (h || '').matchAll(/href="\/feat:([^"#?]+)"/g)) list.push(m[1]);
    for (const pageSlug of new Set(list)) {
        if (pageSlug === 'all') continue;
        const p = await get(`${site.base}/feat:${pageSlug}`);
        if (!p) { skip('feats', pageSlug, 'page not found'); continue; }
        const name = title(p);
        const bl = blocks(content(p));
        if (/-ua$/.test(pageSlug) || isUA(name) || isUA(sourceOf(bl))) { skip('feats', name, 'Unearthed Arcana / playtest'); continue; }
        let pre = '';
        const desc = [];
        for (const b of bl) {
            if (b.k === 'h') continue;
            if (b.k === 't') { desc.push(...b.lines); continue; }
            if (/^Source:/i.test(b.text)) continue;
            const m = b.text.match(/^Prerequisites?:\s*(.*)$/i);
            if (m && !pre) { pre = m[1].trim(); continue; }
            desc.push(b.li ? '- ' + b.text : b.text);
        }
        const index = slug(pageSlug);
        out.feats[index] = { index, name, src: site.src, rules: site.rules, prerequisites: prereqs(pre), desc };
    }
}

// ---- spells -------------------------------------------------------------------------------------------------
async function spells(site, log, out) {
    const h = await get(site.base + (site === W14 ? '/spells' : '/spell:all'));
    const pages = [...new Set([...(h || '').matchAll(/href="(?:https?:\/\/dnd[0-9a-z]*\.wikidot\.com)?\/spell:([^"#?]+)"/g)].map((m) => m[1]))].filter((s) => s !== 'all' && !/-school$/.test(s));
    for (const pageSlug of pages) {
        const p = await get(`${site.base}/spell:${pageSlug}`);
        if (!p) { skip('spells', pageSlug, 'page not found'); continue; }
        const name = title(p);
        const bl = blocks(content(p));
        const src = sourceOf(bl);
        if (/-ua$/.test(pageSlug) || isUA(name) || isUA(src)) { skip('spells', name, 'Unearthed Arcana / playtest'); continue; }
        const statB = bl.find((b) => b.k === 'p' && /Casting Time:/i.test(b.text));
        // the level line ("3rd-level evocation" / "Level 3 Evocation (Wizard)") is its own paragraph or shares one with Source/the stats
        const lvlT = statB && bl.slice(0, bl.indexOf(statB) + 1).filter((b) => b.k === 'p').flatMap((b) => paras(b.html)).find((l) => /^(\d+(st|nd|rd|th)[- ]level\s+[a-z]+|[a-z]+\s+cantrip|Level \d+\s+[a-z]+)/i.test(l));
        const lvlB = lvlT && { text: lvlT };
        if (!lvlB || !statB) { skip('spells', name, 'no level line / stats block'); log(`${site.src} spell ${pageSlug}: could not find level line or stat block, not parsed`); continue; }
        let level, school, ritual = false, classes = [];
        let m;
        if ((m = lvlB.text.match(/^(\d+)(?:st|nd|rd|th)[- ]level\s+([a-z]+)/i))) { level = +m[1]; school = m[2]; }
        else if ((m = lvlB.text.match(/^([a-z]+)\s+cantrip/i))) { level = 0; school = m[1]; }
        else if ((m = lvlB.text.match(/^Level (\d+)\s+([a-z]+)/i))) { level = +m[1]; school = m[2]; }
        else { skip('spells', name, 'level line not understood: ' + lvlB.text); log(`${site.src} spell ${pageSlug}: level line "${lvlB.text}" not understood`); continue; }
        school = school[0].toUpperCase() + school.slice(1).toLowerCase();
        if (/ritual/i.test(lvlB.text)) ritual = true;
        if (site === W24) { const c = lvlB.text.match(/\(([^)]*)\)/); if (c) classes = c[1].split(',').map((s) => slug(s.replace(/\(.*$/, ''))).filter(Boolean); }
        // stat lines: one paragraph with line breaks, or one paragraph each ("Component:" on a few 2024 pages)
        const STAT = /^(Casting Time|Range|Components?|Duration):/i;
        const isStat = (b) => b.k === 'p' && paras(b.html).every((l) => STAT.test(l));
        const f = lineMap(bl.filter((b) => b.k === 'p' && !b.li).map((b) => b.html).join('\n'), ['Casting Time', 'Range', 'Components?', 'Duration']);
        f.components ??= f.component;
        let ct = f['casting time'] || '';
        if (/\bor ritual\b|\(ritual\)/i.test(ct)) { ritual = true; ct = ct.replace(/\s*(or ritual|\(ritual\))/i, '').trim(); }
        const comp = f.components || '';
        const mat = comp.match(/\bM\s*\(([\s\S]*)\)\s*$/);
        const components = (comp.replace(/\(([\s\S]*)\)\s*$/, '').match(/\b[VSM]\b/g)) || [];
        const dur = f.duration || '';
        const desc = [], higher = [];
        let afterStat = false;
        for (const b of bl) {
            if (b === statB) { afterStat = true; continue; }
            if (!afterStat || b.k === 'h' || isStat(b)) continue;
            if (b.k === 't') { desc.push(...b.lines); continue; }
            if (/^Spell Lists?\b/i.test(b.text)) {
                if (site === W14) classes = [...new Set([...b.html.matchAll(/<a [^>]*>([^<]*)<\/a>/g)].map((a) => slug(text(a[1]).replace(/\(.*?\)/g, ''))).filter(Boolean))];
                continue;
            }
            if (/^(At Higher Levels|Using a Higher-Level Spell Slot|Cantrip Upgrade)\b/i.test(b.text)) { higher.push(b.rest || b.text.replace(/^[^.]*\.\s*/, '')); continue; }
            desc.push(b.li ? '- ' + b.text : b.text);
        }
        const index = slug(pageSlug);
        out.spells[index] = {
            index, name, src: site.src, rules: site.rules, level, school, classes,
            casting_time: ct, range: f.range || '', components, material: mat ? mat[1].trim() : null,
            duration: dur.replace(/^Concentration,\s*u/i, 'U'), concentration: /^Concentration/i.test(dur), ritual, desc, higher_level: higher,
        };
    }
}

// ---- entry point --------------------------------------------------------------------------------------------
export default async function load(log = () => {}) {
    const run = async (site, racesFn) => {
        const o = { races: {}, subraces: {}, backgrounds: {}, feats: {}, spells: {} };
        // each step is isolated: one broken page type must not lose the others
        for (const [what, fn] of [['races', () => racesFn(log, o)], ['backgrounds', () => backgrounds(site, log, o)], ['feats', () => feats(site, log, o)], ['spells', () => spells(site, log, o)]]) {
            try { await fn(); } catch (e) { log(`${site.src} ${what}: stopped: ${e.message}`); }
        }
        return o;
    };
    const [a, b] = await Promise.all([run(W14, races14), run(W24, races24)]);
    // the 2024 wiki reuses names; on a clash the 2024 entry gets "-2024" (only races/backgrounds/feats/spells can clash, 2024 has no subraces)
    for (const cat of Object.keys(b)) {
        for (const [k, v] of Object.entries(b[cat])) {
            let idx = k;
            if (a[cat][idx]) { idx = k + '-2024'; v.index = idx; }
            a[cat][idx] = v;
        }
    }
    return a;
}
