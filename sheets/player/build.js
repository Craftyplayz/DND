// The character builder's rules (ROADMAP 4.2 and 4.3), with no page in it: shared by /characters/build/ (builder.js) and the
// Node tests (_dev/scripts/builder.test.js).
//   HbBuild.build(choices, data, model) -> a character for the sheet, from everything picked in the builder
//   HbBuild.levelUp(c, choice, data, model) -> a copy of c one level higher; it only adds rows and raises numbers
//   HbBuild.mergeContent(srd, ...more) -> one data set from srd-build.json and the content files (same shape, later wins)
// data is srd-build.json's shape (classes, subclasses, races, subraces, backgrounds, feats) plus spells {index: {name, level}};
// model is hbModel(uid) from model.js. choices is what the builder keeps in the character's "build" (see blankChoices).
(function (root) {
    'use strict';
    const AB = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];
    const STD = [15, 14, 13, 12, 10, 8];
    const PB_COST = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
    const PB_BUDGET = 27;
    const mod = (s) => Math.floor((s - 10) / 2);
    const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
    const clone = (x) => JSON.parse(JSON.stringify(x));
    const cap = (s) => String(s).replace(/(^|[\s(-])([a-z])/g, (m, a, b) => a + b.toUpperCase());
    const words = (index) => cap(String(index).replace(/-/g, ' '));
    const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
    const AK = (k) => String(k).toUpperCase(); // "str" -> "STR"

    // ---- ability scores ----
    const pbCost = (base) => AB.reduce((t, a) => t + (PB_COST[base[a]] ?? 99), 0);
    // four d6, the lowest dropped: {d, lo (index of the dropped die), t}
    function dropLowest(d) {
        const lo = d.indexOf(Math.min(...d));
        return { d: d.slice(), lo, t: d.reduce((a, b) => a + b, 0) - d[lo] };
    }
    // the scores before racial bonuses, for the method picked
    function baseScores(ch) {
        const out = {};
        for (const a of AB) {
            const m = ch.method;
            out[a] = m === 'pb' ? +(ch.pb?.[a] ?? 8) : m === 'man' ? +(ch.man?.[a] ?? 10) : m === 'std' ? +(ch.std?.[a] || 0)
                : m === 'roll' ? +(ch.sets?.[ch.assign?.[a]]?.t || 0) : 10;
        }
        return out;
    }
    // racial (and 2024 background) bonuses: {STR: 2, ...}
    function bonuses(ch, data) {
        const out = Object.fromEntries(AB.map((a) => [a, 0]));
        const add = (list) => (list || []).forEach((b) => { const k = AK(b.ability_score?.index || b.ability_score); if (k in out) out[k] += +b.bonus || 0; });
        const race = data.races?.[ch.race], sub = data.subraces?.[ch.sub], bg = data.backgrounds?.[ch.bg];
        add(race?.ability_bonuses); add(sub?.ability_bonuses); add(bg?.ability_bonuses);
        const opt = race?.ability_bonus_options;
        if (opt) for (const k of (ch.raceOpts?.ab || []).slice(0, opt.choose)) { const o = (opt.from?.options || []).find((x) => AK(x.ability_score?.index || x.ability_score) === AK(k)); if (o) out[AK(k)] += +o.bonus || 1; }
        // 2024 backgrounds: +2 and +1, or +1 to all three, of the background's three abilities
        const bgAb = (bg?.ability_scores || []).map(AK), pick = ch.bgOpts?.ab || {};
        if (bgAb.length) {
            if (pick.k === '111') for (const a of bgAb) out[a] += 1;
            else if (pick.k === '21') { if (bgAb.includes(AK(pick.two))) out[AK(pick.two)] += 2; if (bgAb.includes(AK(pick.one)) && AK(pick.one) !== AK(pick.two)) out[AK(pick.one)] += 1; }
        }
        return out;
    }

    // ---- content ----
    const KINDS = ['classes', 'subclasses', 'races', 'subraces', 'cultures', 'backgrounds', 'feats', 'spells', 'languages', 'equipment', 'magic_items', 'packs', 'categories'];
    // one content file into a rules version's data; an entry with the same index is replaced (the importer keeps one of each)
    function addContent(out, d, rules = '2014', src = '') {
        if (!isObj(d)) return out;
        for (const k of KINDS) for (const [id, e] of Object.entries(isObj(d[k]) ? d[k] : {})) {
            (out[k] ||= {})[id] = isObj(e) ? Object.assign({ rules, src }, e) : e;
        }
        return out;
    }
    // srd-build.json (or {} for 2024, which has no srd-build) first, then the content files of the same rules version
    function mergeContent(srd, ...more) {
        const out = { meta: srd?.meta || {}, loaded: [] };
        for (const k of KINDS) out[k] = {};
        addContent(out, srd, '2014', 'SRD 5.1');
        for (const d of more) addContent(out, d, d?.meta?.rules || '2014');
        return out;
    }
    // one kind's entries for this rules version (2014 or 2024), sorted by name
    const listOf = (data, kind, rules = '2014') => Object.entries(data[kind] || {}).filter(([, e]) => isObj(e) && (e.rules || '2014') === rules)
        .map(([id, e]) => Object.assign({ id }, e)).sort((a, b) => String(a.name).localeCompare(String(b.name)));

    // ---- classes and levels ----
    // every character level in order: the first class's levels, then the next class's ({cls, n: class level, at: character level, entry})
    function levels(ch) {
        const out = [];
        for (const entry of ch.classes || []) for (let n = 1; n <= (+entry.levels || 0); n++) out.push({ cls: entry.id, n, at: out.length + 1, entry });
        return out;
    }
    const total = (ch) => levels(ch).length;
    const profBonus = (lvl) => Math.ceil(lvl / 4) + 1;
    // the class levels that give an Ability Score Improvement (fighter 6 and 14, rogue 10 too)
    function asiLevels(cls) {
        const out = [];
        let prev = 0;
        for (const l of cls?.levels || []) { if ((+l.ability_score_bonuses || 0) > prev) out.push(l.level); prev = +l.ability_score_bonuses || 0; }
        return out;
    }
    // the level a class picks its subclass: the first level with a feature of that subclass
    function subLevel(clsId, data) {
        const subs = Object.values(data.subclasses || {}).filter((s) => s.class === clsId || s.class?.index === clsId);
        const lv = subs.flatMap((s) => (s.levels || []).filter((l) => l.features?.length).map((l) => l.level));
        return lv.length ? Math.min(...lv) : 3;
    }
    const subsOf = (clsId, data, rules) => listOf(data, 'subclasses', rules).filter((s) => (s.class?.index || s.class) === clsId);
    // the features a class (and its subclass) gets at class level n
    function featuresAt(clsId, subId, n, data) {
        const cls = data.classes?.[clsId], sub = data.subclasses?.[subId];
        const own = (cls?.levels?.[n - 1]?.features || []).filter((f) => !/ability-score-improvement/.test(f.index));
        const subF = (sub?.levels || []).filter((l) => l.level === n).flatMap((l) => l.features || []);
        return [...own, ...subF];
    }
    // features where the player picks something besides the data's own options: [kind, how many]
    const PICKS = {
        'rogue-expertise-1': ['expert', 2], 'rogue-expertise-2': ['expert', 2], 'bard-expertise-1': ['expert', 2], 'bard-expertise-2': ['expert', 2],
        'bonus-proficiencies': ['skill', 3], // College of Lore
    };
    // how many options a feature with choices takes (eldritch invocations: the class table's invocations known)
    function chooseN(f, cls, n, prevTaken) {
        if (f.choices?.choose) return f.choices.choose;
        if (f.index === 'eldritch-invocations') return Math.max(0, (+cls?.levels?.[n - 1]?.class_specific?.invocations_known || 0) - prevTaken);
        return 1;
    }

    // ---- spellcasting ----
    // a class's spellcasting: {ab, kind: full | half | third | pact | none}
    function casterOf(clsId, data) {
        const c = data.classes?.[clsId];
        const ab = AK(c?.spellcasting?.spellcasting_ability?.index || c?.spellcasting?.spellcasting_ability || '');
        if (!c?.spellcasting) return { ab: '', kind: 'none' };
        // shortcut: Pact Magic is the warlock's (or a content class marked pact: true); add a data flag if another class gets it
        if (clsId === 'warlock' || c.pact) return { ab, kind: 'pact' };
        const top = c.levels?.[19]?.spellcasting || {};
        return { ab, kind: +top.spell_slots_level_9 ? 'full' : +top.spell_slots_level_5 ? 'half' : +top.spell_slots_level_4 ? 'third' : 'none' };
    }
    const slotRow = (sc) => Array.from({ length: 9 }, (_, i) => +sc?.['spell_slots_level_' + (i + 1)] || 0);
    // the multiclass spellcaster table (SRD 5.1): slots by caster level
    const MC = [[], [2], [3], [4, 2], [4, 3], [4, 3, 2], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 2], [4, 3, 3, 3, 1], [4, 3, 3, 3, 2], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1],
        [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1, 1], [4, 3, 3, 3, 3, 1, 1, 1, 1],
        [4, 3, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 3, 2, 2, 1, 1]];
    // {slots: [9], pact: {n, level} | null, casterLevel} for class levels {id: n}
    function slotsFor(byClass, data) {
        let cl = 0, casters = 0, single = null, pact = null;
        for (const [id, n] of Object.entries(byClass)) {
            const k = casterOf(id, data).kind, sc = data.classes?.[id]?.levels?.[n - 1]?.spellcasting;
            if (k === 'pact') { const row = slotRow(sc), lv = row.findIndex((x) => x > 0); if (lv >= 0) pact = { n: row[lv], level: lv + 1 }; continue; }
            if (k === 'none') continue;
            casters++; single = slotRow(sc);
            cl += k === 'full' ? n : k === 'half' ? Math.floor(n / 2) : Math.floor(n / 3);
        }
        const slots = casters === 1 ? single : Array.from({ length: 9 }, (_, i) => MC[Math.min(20, cl)][i] || 0);
        return { slots: casters ? slots : Array(9).fill(0), pact, casterLevel: cl };
    }
    // the highest spell level a class can pick at class level n (its own table, as for a single class)
    function maxSpellLevel(clsId, n, data) {
        const row = slotRow(data.classes?.[clsId]?.levels?.[n - 1]?.spellcasting);
        return row.reduce((m, x, i) => (x > 0 ? i + 1 : m), 0);
    }
    // how many cantrips and spells a class takes at class level n (prepared casters: ability modifier + level, at least 1)
    const PREPARED = { cleric: 1, druid: 1, wizard: 1, paladin: 0.5 };
    function spellCounts(clsId, n, data, scores) {
        const sc = data.classes?.[clsId]?.levels?.[n - 1]?.spellcasting || {}, k = casterOf(clsId, data);
        const prep = PREPARED[clsId] ? Math.max(1, mod(scores?.[k.ab] || 10) + Math.floor(n * PREPARED[clsId])) : 0;
        return { cantrips: +sc.cantrips_known || 0, known: +sc.spells_known || 0, prepared: prep, book: clsId === 'wizard' ? 6 + 2 * (n - 1) : 0 };
    }
    // the spells a class can pick: its list, plus its subclass's expanded list; [{index, name, level}]
    function spellPool(clsId, subId, data) {
        const cls = data.classes?.[clsId], sub = data.subclasses?.[subId], all = data.spells || {};
        const ids = new Set([...(cls?.spells || []), ...(sub?.spells || []).filter((s) => !(s.prerequisites || []).some((p) => !/-\d+$/.test(p))).map((s) => s.spell || s.index)]);
        // content spells say which classes have them
        for (const [id, s] of Object.entries(all)) if ((s.classes || []).some((c) => norm(c.index || c.name || c) === norm(clsId) || norm(c.name || c) === norm(cls?.name || ''))) ids.add(id);
        return [...ids].map((id) => ({ index: id, name: all[id]?.name || words(id), level: all[id]?.level ?? null })).sort((a, b) => (a.level ?? 9) - (b.level ?? 9) || a.name.localeCompare(b.name));
    }
    // subclass spells a prepared caster always has (domain and oath spells) at class level n
    function alwaysPrepared(clsId, subId, n, data) {
        if (!PREPARED[clsId]) return [];
        return (data.subclasses?.[subId]?.spells || []).filter((s) => {
            const pre = s.prerequisites || [];
            return pre.length && pre.every((p) => { const m = /^(.+)-(\d+)$/.exec(p.index || p); return m && m[1] === clsId && +m[2] <= n; });
        }).map((s) => s.spell?.index || s.spell || s.index);
    }

    // ---- proficiencies, languages, equipment names ----
    const ARMOUR_IDX = { 'light-armor': ['Light armour'], 'medium-armor': ['Medium armour'], 'heavy-armor': ['Heavy armour'], 'all-armor': ['Light armour', 'Medium armour', 'Heavy armour'], shields: ['Shields'] };
    const WEAPON_CATS = { 'simple-weapons': 'Simple weapons', 'martial-weapons': 'Martial weapons' };
    const weaponIdx = (name) => ({ 'light crossbow': 'crossbow-light', 'hand crossbow': 'crossbow-hand', 'heavy crossbow': 'crossbow-heavy' }[name.toLowerCase()] || name.toLowerCase().replace(/ /g, '-'));
    function profKind(index, M) {
        const i = String(index?.index || index);
        if (i.startsWith('saving-throw-')) return ['save', AK(i.slice(13))];
        if (i.startsWith('skill-')) { const s = M.SKILLS.find(([n]) => norm(n) === norm(i.slice(6))); return s ? ['skill', s[0]] : ['tool', words(i.slice(6))]; }
        if (ARMOUR_IDX[i]) return ['armour', ARMOUR_IDX[i]];
        if (WEAPON_CATS[i]) return ['weapons', [WEAPON_CATS[i]]];
        const single = i.replace(/s$/, '').replace(/^crossbows-(\w+)$/, 'crossbow-$1');
        const w = M.WEAPONS.find((x) => weaponIdx(x[0]) === single || weaponIdx(x[0]) === i || norm(x[0]) === norm(single));
        if (w) return ['weapons', [w[0].replace(/^(\w)/, (c) => c.toUpperCase()) + 's']];
        const t = M.TOOLS.find((x) => norm(x) === norm(i));
        return ['tool', t || words(i)];
    }
    // give one proficiency to the character
    function giveProf(c, index, M) {
        const [k, v] = profKind(index, M);
        if (k === 'save') { const a = c.abilities.find((x) => x.key === v); if (a) a.save = true; }
        else if (k === 'skill') { const s = c.skills.find((x) => x.name === v); if (s && s.p < 1) s.p = 1; }
        else if (k === 'armour' || k === 'weapons') for (const x of v) { if (!c.profs[k].includes(x)) c.profs[k].push(x); }
        else if (!c.profs.tools.some((t) => norm(t.name) === norm(v))) c.profs.tools.push(Object.assign(M.ROW.tool(), { name: v }));
    }
    const LANGS = ['Common', 'Dwarvish', 'Elvish', 'Giant', 'Gnomish', 'Goblin', 'Halfling', 'Orc', 'Abyssal', 'Celestial', 'Draconic', 'Deep Speech', 'Infernal', 'Primordial', 'Sylvan', 'Undercommon'];
    const langName = (i) => LANGS.find((l) => norm(l) === norm(i?.index || i)) || words(i?.index || i);
    const giveLang = (c, i) => { const n = langName(i); if (n && !c.profs.langs.includes(n)) c.profs.langs.push(n); };

    // SRD armour: [name, AC, light | medium | heavy | shield]
    const ARMOUR = { 'padded-armor': ['Padded armour', 11, 'light'], 'leather-armor': ['Leather armour', 11, 'light'], 'studded-leather-armor': ['Studded leather armour', 12, 'light'],
        'hide-armor': ['Hide armour', 12, 'medium'], 'chain-shirt': ['Chain shirt', 13, 'medium'], 'scale-mail': ['Scale mail', 14, 'medium'], breastplate: ['Breastplate', 14, 'medium'],
        'half-plate-armor': ['Half plate', 15, 'medium'], 'ring-mail': ['Ring mail', 14, 'heavy'], 'chain-mail': ['Chain mail', 16, 'heavy'], 'splint-armor': ['Splint armour', 17, 'heavy'],
        'plate-armor': ['Plate armour', 18, 'heavy'], shield: ['Shield', 2, 'shield'] };
    // SRD equipment categories the starting equipment picks from (the content files can add their own as "categories")
    function category(id, data, M) {
        if (Array.isArray(data.categories?.[id])) return data.categories[id];
        // the content's equipment lists its categories
        const own = Object.entries(data.equipment || {}).filter(([, e]) => (e.equipment_categories || []).includes(id) || e.equipment_category === id || e.equipment_category?.index === id).map(([k]) => k);
        if (own.length) return own;
        const w = M.WEAPONS.map((x) => weaponIdx(x[0]));
        return { 'simple-weapons': w.slice(0, 14), 'simple-melee-weapons': w.slice(0, 10), 'martial-weapons': w.slice(14), 'martial-melee-weapons': w.slice(14, 32),
            'holy-symbols': ['amulet', 'emblem', 'reliquary'], 'arcane-foci': ['crystal', 'orb', 'rod', 'staff', 'wand'], 'druidic-foci': ['sprig-of-mistletoe', 'totem', 'wooden-staff', 'yew-wand'],
            'musical-instruments': ['bagpipes', 'drum', 'dulcimer', 'flute', 'lute', 'lyre', 'horn', 'pan-flute', 'shawm', 'viol'] }[id] || [];
    }
    // SRD packs, unpacked into single items: [count, name]
    const PACKS = {
        'burglars-pack': [[1, 'Backpack'], [1, 'Ball bearings (bag of 1,000)'], [1, 'String (10 feet)'], [1, 'Bell'], [5, 'Candle'], [1, 'Crowbar'], [1, 'Hammer'], [10, 'Piton'], [1, 'Hooded lantern'], [2, 'Oil (flask)'], [5, 'Rations (1 day)'], [1, 'Tinderbox'], [1, 'Waterskin'], [1, 'Hempen rope (50 ft)']],
        'diplomats-pack': [[1, 'Chest'], [2, 'Case, map or scroll'], [1, 'Fine clothes'], [1, 'Ink (1 ounce bottle)'], [1, 'Ink pen'], [1, 'Lamp'], [2, 'Oil (flask)'], [5, 'Paper (one sheet)'], [1, 'Perfume (vial)'], [1, 'Sealing wax'], [1, 'Soap']],
        'dungeoneers-pack': [[1, 'Backpack'], [1, 'Crowbar'], [1, 'Hammer'], [10, 'Piton'], [10, 'Torch'], [1, 'Tinderbox'], [10, 'Rations (1 day)'], [1, 'Waterskin'], [1, 'Hempen rope (50 ft)']],
        'entertainers-pack': [[1, 'Backpack'], [1, 'Bedroll'], [2, 'Costume clothes'], [5, 'Candle'], [5, 'Rations (1 day)'], [1, 'Waterskin'], [1, 'Disguise kit']],
        'explorers-pack': [[1, 'Backpack'], [1, 'Bedroll'], [1, 'Mess kit'], [1, 'Tinderbox'], [10, 'Torch'], [10, 'Rations (1 day)'], [1, 'Waterskin'], [1, 'Hempen rope (50 ft)']],
        'priests-pack': [[1, 'Backpack'], [1, 'Blanket'], [10, 'Candle'], [1, 'Tinderbox'], [1, 'Alms box'], [2, 'Block of incense'], [1, 'Censer'], [1, 'Vestments'], [2, 'Rations (1 day)'], [1, 'Waterskin']],
        'scholars-pack': [[1, 'Backpack'], [1, 'Book'], [1, 'Ink (1 ounce bottle)'], [1, 'Ink pen'], [10, 'Parchment (one sheet)'], [1, 'Little bag of sand'], [1, 'Small knife']],
    };
    const ITEM_NAMES = { arrow: 'Arrow', 'crossbow-bolt': 'Crossbow bolt', 'clothes-common': 'Common clothes', 'thieves-tools': "Thieves' tools", 'sprig-of-mistletoe': 'Sprig of mistletoe', 'wooden-staff': 'Wooden staff', 'yew-wand': 'Yew wand', 'pan-flute': 'Pan flute' };
    const itemName = (ref, data, M) => data.equipment?.[ref]?.name || ARMOUR[ref]?.[0] || M.WEAPONS.find((w) => weaponIdx(w[0]) === ref)?.[0] || ITEM_NAMES[ref] || words(ref).replace(/^(\w)(.*)$/, (m, a, b) => a + b.toLowerCase());
    // class starting wealth (SRD 5.1 / PHB): [dice count, multiplier] of d4s, for "take gold instead"
    const GOLD = { barbarian: [2, 10], bard: [5, 10], cleric: [5, 10], druid: [2, 10], fighter: [5, 10], monk: [5, 1], paladin: [5, 10], ranger: [5, 10], rogue: [4, 10], sorcerer: [3, 10], warlock: [4, 10], wizard: [4, 10] };
    const goldDice = (clsId, data) => data.classes?.[clsId]?.gold || GOLD[clsId] || null;

    // the items one equipment option gives: [{ref, n}]; picks fills each "any X" choice in order (else its first item)
    function optionItems(opt, picks, data, M) {
        if (!opt) return [];
        const t = opt.option_type;
        if (t === 'counted_reference') return [{ ref: opt.of?.index || opt.of, n: +opt.count || 1 }];
        if (t === 'reference') return [{ ref: opt.item?.index || opt.item, n: 1 }];
        if (t === 'multiple') return (opt.items || []).flatMap((x) => optionItems(x, picks, data, M));
        if (t === 'choice') return choiceItems(opt.choice, picks, data, M);
        return [];
    }
    function choiceItems(ch, picks, data, M) {
        const from = ch?.from || {};
        if (from.option_set_type === 'equipment_category') {
            const list = category(from.equipment_category?.index || from.equipment_category, data, M);
            return Array.from({ length: +ch.choose || 1 }, () => { const p = picks.shift(); return { ref: list.includes(p) ? p : list[0], n: 1 }; }).filter((x) => x.ref);
        }
        return [];
    }
    // one starting-equipment choice (an "(a) or (b)" line): pick = {o: option, items: [category picks]}
    function equipChoice(set, pick, data, M) {
        const items = [...(pick?.items || [])];
        if (!set.from) return String(pick?.text || '').split(',').map((x) => x.trim()).filter(Boolean).map((name) => ({ ref: '', name, n: 1 }));
        if (set.from?.option_set_type === 'options_array') return optionItems(set.from.options?.[+pick?.o || 0], items, data, M);
        return choiceItems(set, items, data, M);
    }
    // every item the character starts with: [{ref, n, from}]
    function startingItems(ch, data, M) {
        const out = [], first = ch.classes?.[0]?.id, cls = data.classes?.[first], bg = data.backgrounds?.[ch.bg];
        const eq = ch.equip || {};
        if (eq.mode !== 'gold') {
            for (const e of cls?.starting_equipment || []) out.push({ ref: e.equipment?.index || e.equipment, n: +e.quantity || 1, from: cls.name });
            (cls?.starting_equipment_options || []).forEach((set, i) => out.push(...equipChoice(set, eq.picks?.['c' + i], data, M).map((x) => ({ ...x, from: cls.name }))));
            for (const e of bg?.starting_equipment || []) out.push({ ref: e.equipment?.index || e.equipment, n: +e.quantity || 1, from: bg.name });
            (bg?.starting_equipment_options || []).forEach((set, i) => out.push(...equipChoice(set, eq.picks?.['b' + i], data, M).map((x) => ({ ...x, from: bg.name }))));
        }
        for (const name of eq.extra || []) out.push({ ref: '', name, n: 1, from: 'Equipment' });
        return out;
    }

    // ---- races ----
    const ANCESTRY = { black: ['Acid', 'DEX', '5 by 30 ft line'], blue: ['Lightning', 'DEX', '5 by 30 ft line'], brass: ['Fire', 'DEX', '5 by 30 ft line'], bronze: ['Lightning', 'DEX', '5 by 30 ft line'],
        copper: ['Acid', 'DEX', '5 by 30 ft line'], gold: ['Fire', 'DEX', '15 ft cone'], green: ['Poison', 'CON', '15 ft cone'], red: ['Fire', 'DEX', '15 ft cone'], silver: ['Cold', 'CON', '15 ft cone'], white: ['Cold', 'CON', '15 ft cone'] };
    const TRAIT_RES = { 'dwarven-resilience': 'Poison', 'hellish-resistance': 'Fire' };
    const SENSES = { darkvision: 60, 'superior-darkvision': 120 };
    // the choices a race (and subrace) asks for: [{key, label, n, options: [[value, label]]}]
    function raceChoices(ch, data) {
        const race = data.races?.[ch.race], sub = data.subraces?.[ch.sub], out = [];
        const refs = (set) => (set?.from?.options || []).map((o) => o.item?.index || o.item || o.ability_score?.index || o.ability_score).filter(Boolean);
        if (race?.ability_bonus_options) out.push({ key: 'ab', label: `Ability score increase: +1 to ${race.ability_bonus_options.choose}`, n: race.ability_bonus_options.choose, options: refs(race.ability_bonus_options).map((a) => [AK(a), AK(a)]) });
        for (const r of [race, sub]) if (r?.language_options) out.push({ key: 'lang', label: 'Extra language', n: r.language_options.choose, options: refs(r.language_options).map((l) => [l, langName(l)]) });
        for (const r of [race, sub]) for (const t of r?.traits || []) {
            if (t.proficiency_choices) out.push({ key: 'p:' + t.index, label: t.name, n: t.proficiency_choices.choose, options: refs(t.proficiency_choices).map((p) => [p, words(p.replace(/^skill-/, ''))]) });
            if (t.trait_specific?.subtrait_options) out.push({ key: 't:' + t.index, label: t.name, n: 1, options: refs(t.trait_specific.subtrait_options).map((p) => [p, words(p.replace(/^draconic-ancestry-/, ''))]) });
            if (t.trait_specific?.spell_options) out.push({ key: 's:' + t.index, label: t.name, n: t.trait_specific.spell_options.choose || 1, options: refs(t.trait_specific.spell_options).map((p) => [p, data.spells?.[p]?.name || words(p)]) });
        }
        return out;
    }

    // ---- building ----
    const sumText = (desc) => (Array.isArray(desc) ? desc : [desc]).filter(Boolean).join('\n\n');
    const passive = (c, M, name, text, src, grp, source) => {
        const p = c.panels.find((x) => x.type === 'list' && x.split) || c.panels.find((x) => x.type === 'list');
        if (!p || p.rows.some((r) => r.name === name && r.src === src)) return;
        p.rows.push(Object.assign(M.ROW.list(), { name, text, src, grp, source: source || src }));
    };
    const panel = (c, type) => c.panels.find((p) => p.type === type);
    // a resource in Resources, made once and only ever raised
    function tracker(c, M, name, max, reset, kind = 'count', source = '') {
        const p = panel(c, 'trackers');
        if (!p) return null;
        let r = p.rows.find((x) => norm(x.name) === norm(name));
        if (!r) { r = Object.assign(M.ROW.tracker(), { name, kind, max: String(max), cur: +max || 0, reset, source }); p.rows.push(r); return r; }
        if (/^\d+$/.test(String(r.max)) && /^\d+$/.test(String(max)) && +max > +r.max) { r.cur = +r.cur + (+max - +r.max); r.max = String(max); }
        if (reset === 'short' && r.reset === 'long') r.reset = 'short';
        return r;
    }
    // class features that make resources: index -> (class level data, class level) => [name, max, reset, kind]
    const RES = {
        rage: (l) => ['Rage', Math.min(+l.class_specific?.rage_count || 2, 99), 'long'],
        'second-wind': () => ['Second Wind', 1, 'short'],
        'action-surge-1-use': (l) => ['Action Surge', +l.class_specific?.action_surges || 1, 'short'],
        'action-surge-2-uses': (l) => ['Action Surge', +l.class_specific?.action_surges || 2, 'short'],
        'indomitable-1-use': (l) => ['Indomitable', +l.class_specific?.indomitable_uses || 1, 'long'],
        'indomitable-2-uses': (l) => ['Indomitable', 2, 'long'], 'indomitable-3-uses': () => ['Indomitable', 3, 'long'],
        ki: () => ['Ki points', 'MONK_LEVEL', 'short'],
        'bardic-inspiration-d6': () => ['Bardic Inspiration', 'max(1, CHA)', 'long'],
        'font-of-inspiration': () => ['Bardic Inspiration', 'max(1, CHA)', 'short'],
        'channel-divinity-1-rest': () => ['Channel Divinity', 1, 'short'], 'channel-divinity-2-rest': () => ['Channel Divinity', 2, 'short'], 'channel-divinity-3-rest': () => ['Channel Divinity', 3, 'short'],
        'channel-divinity': () => ['Channel Divinity', 1, 'short'],
        'divine-sense': () => ['Divine Sense', '1 + CHA', 'long'],
        'lay-on-hands': () => ['Lay on Hands', 'PALADIN_LEVEL * 5', 'long'],
        'font-of-magic': () => ['Sorcery points', 'SORCERER_LEVEL', 'long', 'pips'],
        'arcane-recovery': () => ['Arcane Recovery', 1, 'long'],
    };
    const isWild = (i) => /^wild-shape/.test(i);

    // put one level on the character: class row, hit points, proficiencies, features and their picks, resources, ASI.
    // L = {cls, n (the class's new level), at (character level), entry (the class's choices)}; hp: the hit points it adds
    function applyLevel(c, L, hp, data, M) {
        const cls = data.classes?.[L.cls];
        if (!cls) return;
        const e = L.entry || {}, src = `${cls.name} ${L.n}`;
        let row = c.classes.find((k) => norm(k.name) === norm(cls.name));
        if (!row) {
            // the blank character's one empty class row is this class
            row = c.classes.length === 1 && !c.classes[0].name ? c.classes[0] : (c.classes.push(M.ROW.cls()), c.classes[c.classes.length - 1]);
            Object.assign(row, { name: cls.name, level: 0, die: cls.hit_die, hdUsed: 0 });
        }
        row.level = (+row.level || 0) + 1;
        c.hp.base = (L.at === 1 ? 0 : +c.hp.base || 0) + hp;
        // first level of the character: the class's own proficiencies and skill picks; a later class: its multiclass ones
        if (L.n === 1) {
            const first = L.at === 1, set = first ? cls : cls.multi_classing || {};
            for (const p of first ? cls.proficiencies || [] : set.proficiencies || []) giveProf(c, p, M);
            if (first) for (const a of cls.saving_throws || []) giveProf(c, 'saving-throw-' + (a.index || a), M);
            (set.proficiency_choices || []).forEach((pc, i) => {
                for (const p of (e.profs?.[i] || []).slice(0, pc.choose)) giveProf(c, p, M);
                // a choice the content gives only in words: what the player typed goes in the proficiency notes
                const t = String(e.ptext?.[i] || '').trim();
                if (!pc.from && t) c.profs.notes = [c.profs.notes, `${cls.name}: ${t}`].filter(Boolean).join('\n');
            });
        }
        const lvl = cls.levels?.[L.n - 1] || {};
        for (const f of featuresAt(L.cls, L.n >= subLevel(L.cls, data) ? e.sub : '', L.n, data)) {
            if (f.index === 'primal-champion') for (const a of ['STR', 'CON']) { const x = c.abilities.find((y) => y.key === a); if (x) x.score = Math.min(24, +x.score + 4); }
            if (f.index === 'diamond-soul') for (const a of c.abilities) a.save = true;
            if (f.index === 'slippery-mind') giveProf(c, 'saving-throw-wis', M);
            if (f.index === 'bonus-proficiency' && e.sub === 'life') giveProf(c, 'heavy-armor', M);
            const rs = RES[f.index] || (isWild(f.index) && (() => ['Wild Shape', 2, 'short']));
            if (rs) { const [name, max, reset, kind] = rs(lvl, L.n); tracker(c, M, name, max, reset, kind, src); }
            // options picked for this feature, each its own passive row
            const picked = (e.opts?.[f.index] || []).map((i) => f.choices?.options?.find((o) => o.index === i)).filter(Boolean);
            const pk = PICKS[f.index], extra = pk ? (e.picks?.[f.index] || []).slice(0, pk[1]) : [];
            if (pk?.[0] === 'expert') for (const s of extra) { const x = c.skills.find((y) => y.name === s); if (x) x.p = 2; }
            if (pk?.[0] === 'skill') for (const s of extra) { const x = c.skills.find((y) => y.name === s); if (x && x.p < 1) x.p = 1; }
            const chose = [...picked.map((o) => o.name.replace(/^.*?: /, '')), ...extra];
            passive(c, M, f.name, sumText(f.desc) + (chose.length ? `\n\nChosen: ${chose.join(', ')}` : ''), src, 'class');
            for (const o of picked) passive(c, M, o.name, sumText(o.desc), src, 'class');
        }
        // an Ability Score Improvement at this class level: +2, +1 and +1, or a feat
        const asi = asiLevels(cls).includes(L.n) ? e.asi?.[L.n] : null;
        if (asi) {
            if (asi.k === 'feat' && data.feats?.[asi.feat]) { const ft = data.feats[asi.feat]; passive(c, M, ft.name, sumText(ft.desc), 'Feat', 'other', src); }
            else for (const [a, n] of asi.k === '+1' ? (asi.a || []).slice(0, 2).map((a) => [a, 1]) : [[asi.a?.[0], 2]]) {
                const x = c.abilities.find((y) => y.key === a);
                if (x) x.score = Math.max(+x.score, Math.min(20, +x.score + n));
            }
        }
    }

    // spell slots from the class levels (only ever raised), the casting ability, Pact Magic as its own short-rest resource
    function applySlots(c, data, M) {
        const by = {};
        for (const k of c.classes) { const id = Object.keys(data.classes || {}).find((x) => norm(data.classes[x].name) === norm(k.name)); if (id) by[id] = +k.level; }
        const { slots, pact } = slotsFor(by, data), sp = panel(c, 'spells');
        if (sp) slots.forEach((n, i) => { if (n > +sp.slots[i].max) sp.slots[i].max = n; });
        if (pact) {
            const t = tracker(c, M, 'Pact slots', 0, 'short', 'levels', 'Warlock');
            if (t && !t.levels.length) t.levels = ['1st', '2nd', '3rd', '4th', '5th'].map((label) => Object.assign(M.ROW.level(), { label, max: '0' }));
            // pact slots move up a level: the old level's boxes go, the new level gets them all
            if (t) t.levels.forEach((l, i) => { const want = i + 1 === pact.level ? pact.n : 0; if (String(l.max) !== String(want) && /^\d+$/.test(String(l.max))) l.max = String(want); });
        }
        // the first caster class's ability for the save DC and attack, unless the player changed them
        const caster = Object.keys(by).find((id) => casterOf(id, data).kind !== 'none');
        if (sp && caster) {
            const ab = casterOf(caster, data).ab;
            if (sp.dc === '8 + PROF + INT') sp.dc = '8 + PROF + ' + ab;
            if (sp.atk === 'PROF + INT') sp.atk = 'PROF + ' + ab;
        }
    }

    // add spells (by index) to the Spells panel; prepared marks them prepared (domain and oath spells, picks of prepared casters)
    function addSpells(c, list, data, M, how) {
        const sp = panel(c, 'spells');
        if (!sp) return;
        for (const id of list) {
            if (!id || sp.rows.some((r) => r.srd === id || norm(r.name) === norm(data.spells?.[id]?.name || id))) continue;
            const s = data.spells?.[id] || {};
            sp.rows.push(Object.assign(M.ROW.spell(), { name: s.name || words(id), lvl: +s.level || 0, school: s.school?.name || s.school || '', srd: id, prep: !!how.prep && +s.level > 0, source: how.source }));
        }
    }

    // weapons and armour from the items: attack rows, and the best AC formula
    function applyGear(c, items, data, M) {
        const S = Object.fromEntries(c.abilities.map((a) => [a.key, +a.score])), m = (a) => mod(S[a] || 10);
        const inv = panel(c, 'items'), atk = panel(c, 'attacks');
        const styles = (panel(c, 'list')?.rows || []).map((r) => r.name);
        const has = (n) => styles.some((s) => s.toLowerCase() === 'fighting style: ' + n);
        const monk = c.classes.find((k) => k.name === 'Monk'), ma = monk ? (+monk.level >= 17 ? 10 : +monk.level >= 11 ? 8 : +monk.level >= 5 ? 6 : 4) : 0;
        const profW = (w) => {
            const i = M.WEAPONS.indexOf(w), cat = i < 14 ? 'Simple weapons' : 'Martial weapons';
            return c.profs.weapons.some((p) => p === cat || norm(p) === norm(w[0] + 's'));
        };
        let armour = null, shield = false;
        for (const it of items) {
            const w = M.WEAPONS.find((x) => weaponIdx(x[0]) === it.ref || norm(x[0]) === norm(it.ref) || (it.name && norm(x[0]) === norm(it.name)));
            const a = ARMOUR[it.ref] || Object.values(ARMOUR).find(([n]) => [it.ref, it.name, String(it.ref).replace(/-armou?r$/, '')].some((x) => x && norm(n).replace(/armour$/, '') === norm(x).replace(/armou?r$/, '')));
            const name = it.name || (it.ref ? itemName(it.ref, data, M) : '');
            const pack = PACKS[it.ref] || data.packs?.[it.ref];
            if (pack) { for (const [n, nmx] of pack) addItem(inv, M, nmx, n * it.n, 'Gear', it.from); continue; }
            addItem(inv, M, name, it.n, w ? 'Weapons' : a ? 'Armour' : 'Gear', it.from, !!(w || a));
            if (a) { if (a[2] === 'shield') shield = true; else if (!armour || a[1] > armour[1]) armour = a; }
            if (w && atk && !atk.rows.some((r) => r.name === w[0])) {
                // WEAPONS order: simple melee 0-9, simple ranged 10-13, martial melee 14-31, martial ranged 32-35
                const wi = M.WEAPONS.indexOf(w), props = w[3] ? w[3].split(', ') : [], ranged = (wi >= 10 && wi < 14) || wi >= 32, fin = props.includes('Finesse');
                const monkW = monk && !ranged && !props.includes('Two-handed') && !props.includes('Heavy') && (wi < 10 || w[0] === 'Shortsword');
                const ab = (ranged && !fin) ? 'DEX' : (fin || monkW) && m('DEX') > m('STR') ? 'DEX' : 'STR';
                let die = w[1];
                const one = /^1d(\d+)$/.exec(die);
                if (monkW && ma && one && +one[1] < ma) die = '1d' + ma; // the Martial Arts die, when it's bigger
                const arch = ranged && has('archery') ? ' + 2 [Archery]' : '', duel = !ranged && !props.includes('Two-handed') && has('dueling') ? ' + 2 [Dueling]' : '';
                atk.rows.push(Object.assign(M.ROW.attack(), { name: w[0], range: w[4], props, mode: 'hit', hit: ab + (profW(w) ? ' + PROF' : '') + arch,
                    dmg: [{ dice: `${die} + ${ab}${duel}`, type: w[2] }], source: it.from }));
            }
        }
        // AC: armour (+ shield, + Defense) or Unarmored Defense / Draconic Resilience, whichever is highest now
        const def = has('defense') ? ' + 1 [Defense]' : '', sh = shield ? ' + 2 [Shield]' : '';
        const feats = (panel(c, 'list')?.rows || []).map((r) => r.name);
        const opts = [[10 + m('DEX'), '10 + DEX']];
        if (armour) {
            const [n, base, kind] = armour, dx = kind === 'light' ? m('DEX') : kind === 'medium' ? Math.min(2, m('DEX')) : 0;
            opts.push([base + dx + 1 * !!def, `${base} [${n}]${kind === 'light' ? ' + DEX' : kind === 'medium' ? ' + min(DEX, 2)' : ''}${def}`]);
        }
        if (feats.includes('Unarmored Defense') && c.classes.some((k) => k.name === 'Barbarian')) opts.push([10 + m('DEX') + m('CON'), '10 + DEX + CON']);
        if (feats.includes('Unarmored Defense') && monk) opts.push([10 + m('DEX') + m('WIS') - (shield ? 2 : 0), '10 + DEX + WIS']);
        if (feats.includes('Draconic Resilience')) opts.push([13 + m('DEX'), '13 + DEX']);
        opts.sort((a, b) => b[0] - a[0]);
        // the monk's Unarmored Defense doesn't work with a shield
        c.ac = opts[0][1] + (opts[0][1] === '10 + DEX + WIS' ? '' : sh);
    }
    function addItem(inv, M, name, n, cat, from, eq = false) {
        if (!inv || !name) return;
        const have = inv.rows.find((r) => r.name === name);
        if (have) { have.qty = +have.qty + n; return; }
        const g = M.GEAR.find((x) => norm(x[0]) === norm(name));
        inv.rows.push(Object.assign(M.ROW.item(), { name, qty: n, wt: g ? g[1] : 0, cat: g?.[2] || cat, eq, source: from }));
    }

    // the hit points a level after the first adds (the die's average, or the roll)
    const hpAt = (ch, at, die) => (ch.hp?.mode === 'roll' && +ch.hp?.rolls?.[at] ? +ch.hp.rolls[at] : die / 2 + 1);
    // extra hit points per level: Dwarven Toughness (every level), Draconic Resilience (each sorcerer level)
    const hasRow = (c, name) => (panel(c, 'list')?.rows || []).some((r) => r.name === name);
    const hpExtra = (c, clsId) => (hasRow(c, 'Dwarven Toughness') ? 1 : 0) + (clsId === 'sorcerer' && hasRow(c, 'Draconic Resilience') ? 1 : 0);

    // the whole character from the builder's choices
    function build(ch, data, M) {
        const c = M.blank();
        c.build = clone(ch);
        // a built character keeps personality and backstory in Character details, so the blank sheet's empty notes for them go
        const np = panel(c, 'notes');
        if (np) np.notes = np.notes.filter((n) => String(n.body).trim());
        c.name = ch.name || '';
        c.art = ch.art || ''; c.artUrl = ch.artUrl || '';
        const det = ch.details || {};
        c.alignment = det.alignment || ''; c.age = det.age || '';
        const dp = panel(c, 'details');
        if (dp) for (const k of Object.keys(dp.f)) if (typeof det[k] === 'string') dp.f[k] = det[k];
        // race
        const race = data.races?.[ch.race], sub = data.subraces?.[ch.sub], ro = ch.raceOpts || {};
        if (race) {
            c.race = sub?.name || race.name;
            c.speeds[0].ft = +race.speed || 30;
            if (dp && !dp.f.size) dp.f.size = race.size || '';
            for (const l of race.languages || []) giveLang(c, l);
            for (const l of ro.lang || []) giveLang(c, l);
            for (const [r, nm] of [[race, race.name], [sub, sub?.name]]) for (const t of r?.traits || []) {
                for (const p of t.proficiencies || []) giveProf(c, p, M);
                for (const p of ro['p:' + t.index] || []) giveProf(c, p, M);
                if (TRAIT_RES[t.index] && !c.res.includes(TRAIT_RES[t.index])) c.res = [c.res, TRAIT_RES[t.index]].filter(Boolean).join(', ');
                if (SENSES[t.index]) { c.passives = c.passives.filter((p) => !/darkvision/i.test(p.name)); c.passives.push(Object.assign(M.ROW.passive(), { name: t.name, f: String(SENSES[t.index]), unit: 'ft' })); }
                let text = sumText(t.desc);
                const anc = (ro['t:' + t.index] || [])[0];
                if (anc) {
                    const col = String(anc).replace(/^draconic-ancestry-/, ''), a = ANCESTRY[col];
                    text += `\n\nAncestry: ${words(col)} dragon`;
                    if (a) {
                        c.res = [c.res, a[0]].filter(Boolean).join(', ');
                        const at = panel(c, 'attacks');
                        if (at) at.rows.push(Object.assign(M.ROW.attack(), { name: 'Breath Weapon', range: a[2], mode: 'save', save: a[1], dc: '8 + CON + PROF', dmg: [{ dice: '2d6', type: a[0] }], uses: '1', reset: 'short', source: race.name,
                            desc: 'Each creature in the area makes the saving throw: full damage on a fail, half on a success. The damage is 3d6 at 6th level, 4d6 at 11th and 5d6 at 16th.' }));
                    }
                }
                const spell = (ro['s:' + t.index] || [])[0];
                if (spell) { text += `\n\nCantrip: ${data.spells?.[spell]?.name || words(spell)}`; addSpells(c, [spell], data, M, { source: nm }); }
                passive(c, M, t.name, text, nm, 'race');
            }
            if (race.traits?.some((t) => t.index === 'breath-weapon')) tracker(c, M, 'Breath Weapon', 1, 'short', 'count', race.name);
            if (race.traits?.some((t) => t.index === 'relentless-endurance')) tracker(c, M, 'Relentless Endurance', 1, 'long', 'count', race.name);
        }
        const cu = data.cultures?.[ch.culture];
        if (cu) {
            for (const l of cu.languages || []) if (typeof (l?.index || l) === 'string' && LANGS.some((x) => norm(x) === norm(l?.index || l))) giveLang(c, l);
            passive(c, M, cu.name, sumText(cu.desc), cu.name, 'race', 'Culture');
            for (const t of cu.traits || []) passive(c, M, t.name, sumText(t.desc), cu.name, 'race', 'Culture');
        }
        // ability scores: base + bonuses (ASIs come with the levels)
        const base = baseScores(ch), bon = bonuses(ch, data);
        for (const a of c.abilities) if (a.key in base) a.score = base[a.key] + bon[a.key];
        // background
        const bg = data.backgrounds?.[ch.bg], bo = ch.bgOpts || {};
        if (bg) {
            if (dp) dp.f.background = bg.name;
            for (const p of bg.starting_proficiencies || []) giveProf(c, p, M);
            for (const l of (bo.langs || []).slice(0, bg.language_options?.choose || 0)) giveLang(c, l);
            if (bg.feature?.name) passive(c, M, bg.feature.name, sumText(bg.feature.desc), 'Background', 'other', bg.name);
            // 2024: the background's feat, by name ("Magic Initiate (Cleric)" finds Magic Initiate)
            if (typeof bg.feat === 'string' && bg.feat) {
                const ft = Object.values(data.feats || {}).find((f) => norm(f.name) === norm(bg.feat)) || Object.values(data.feats || {}).find((f) => norm(bg.feat).startsWith(norm(f.name)));
                passive(c, M, bg.feat, ft ? sumText(ft.desc) : '', 'Background', 'other', bg.name);
            }
        } else if (ch.bg === 'custom') {
            if (dp) dp.f.background = bo.name || 'Custom background';
            for (const s of (bo.skills || []).slice(0, 2)) giveProf(c, 'skill-' + s, M);
            for (const l of (bo.langs || []).slice(0, 2)) giveLang(c, l);
        }
        // the levels, in order
        for (const L of levels(ch)) {
            const die = +data.classes?.[L.cls]?.hit_die || 8;
            applyLevel(c, L, (L.at === 1 ? die : hpAt(ch, L.at, die)), data, M);
            c.hp.base += hpExtra(c, L.cls);
        }
        // spells: each class's picks, and the subclass spells a prepared caster always has
        for (const e of ch.classes || []) {
            const cls = data.classes?.[e.id];
            if (!cls) continue;
            addSpells(c, alwaysPrepared(e.id, e.sub, +e.levels, data), data, M, { prep: true, source: data.subclasses?.[e.sub]?.name || cls.name });
            addSpells(c, e.spells || [], data, M, { prep: !!PREPARED[e.id], source: cls.name });
        }
        applySlots(c, data, M);
        // equipment, coins
        const items = startingItems(ch, data, M);
        applyGear(c, items, data, M);
        const inv = panel(c, 'items');
        if (inv) inv.coins.gp = (ch.equip?.mode === 'gold' ? +ch.equip.gold || 0 : (+data.backgrounds?.[ch.bg]?.starting_gold?.quantity || +data.backgrounds?.[ch.bg]?.starting_gold || 0));
        jackOfAllTrades(c);
        const con = c.abilities.find((a) => a.key === 'CON');
        c.hp.cur = c.hp.base + mod(+con?.score || 10) * total(ch) + (+c.hp.mod || 0);
        c.calc = { hpMax: c.hp.cur };
        return c;
    }
    // Jack of All Trades: half proficiency on every skill without one
    function jackOfAllTrades(c) {
        if ((panel(c, 'list')?.rows || []).some((r) => r.name === 'Jack of All Trades')) for (const s of c.skills) if (!s.p) s.p = 0.5;
    }

    // one level more on a finished character (ROADMAP 4.3). choice: {cls, entry (that class's choices for this level), hp: {mode, roll}}.
    // Returns a new character: rows are only added and numbers only raised; c itself is left as it was (the sheet's Undo).
    function levelUp(c0, choice, data, M) {
        const c = clone(c0), cls = data.classes?.[choice.cls];
        if (!cls) return c;
        const row = c.classes.find((k) => norm(k.name) === norm(cls.name));
        const at = c.classes.reduce((t, k) => t + (+k.level || 0), 0) + 1, n = (row ? +row.level : 0) + 1;
        const die = +cls.hit_die || 8, hp = choice.hp?.mode === 'roll' && +choice.hp.roll ? +choice.hp.roll : die / 2 + 1;
        if (!isObj(c.build)) c.build = {};
        applyLevel(c, { cls: choice.cls, n, at, entry: choice.entry || {} }, hp, data, M);
        c.hp.base += hpExtra(c, choice.cls);
        addSpells(c, alwaysPrepared(choice.cls, choice.entry?.sub, n, data), data, M, { prep: true, source: data.subclasses?.[choice.entry?.sub]?.name || cls.name });
        addSpells(c, choice.entry?.spells || [], data, M, { prep: !!PREPARED[choice.cls], source: cls.name });
        applySlots(c, data, M);
        jackOfAllTrades(c);
        // the new level's hit points are added to what's left now
        c.hp.cur = +c.hp.cur + hp + mod(+c.abilities.find((a) => a.key === 'CON')?.score || 10);
        (c.build.ups ||= []).push({ at, cls: choice.cls, n, hp, entry: choice.entry || {} });
        return c;
    }

    // a new, empty set of choices (the builder's "build" record)
    function blankChoices() {
        return { v: 1, step: 'name', rules: '2014', camp: '', name: '', level: 1, classes: [], hp: { mode: 'avg', rolls: {} }, race: '', sub: '', culture: '', raceOpts: {},
            method: 'pb', pb: Object.fromEntries(AB.map((a) => [a, 8])), std: {}, man: Object.fromEntries(AB.map((a) => [a, 10])), sets: [], assign: {},
            bg: '', bgOpts: {}, details: {}, equip: { mode: 'gear', picks: {}, gold: 0, extra: [] } };
    }

    const HbBuild = { AB, STD, PB_COST, PB_BUDGET, mod, pbCost, dropLowest, baseScores, bonuses, addContent, mergeContent, listOf, levels, total, profBonus, asiLevels, subLevel, subsOf,
        featuresAt, PICKS, chooseN, casterOf, slotsFor, maxSpellLevel, spellCounts, spellPool, alwaysPrepared, PREPARED, profKind, langName, LANGS, ARMOUR, PACKS, category,
        itemName, goldDice, equipChoice, startingItems, raceChoices, ANCESTRY, hpAt, build, levelUp, blankChoices, words };
    if (typeof module === 'object' && module.exports) module.exports = HbBuild; else root.HbBuild = HbBuild;
})(this);
