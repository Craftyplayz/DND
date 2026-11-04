// Homebrew classes, subclasses, races, subraces and backgrounds (ROADMAP 4.6). A form keeps an entry in plain fields; toContent() turns it into the shape of
// srd-build.json, so the builder, level up and the Compendium use it as they use official content. fromOfficial() goes the other way, for "Start from".
// Features and traits never act by their names here: what they do is in their own fields (see build.js), so a homebrew "Rage" is only a name.
// Loaded as a plain script (window.HomebrewContent) and by the Node tests (module.exports).
(function (root) {
    'use strict';
    const str = (v) => (v === undefined || v === null ? '' : String(v)), arr = (v) => (Array.isArray(v) ? v : []), obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
    const slug = (s) => str(s).trim().toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const words = (s) => str(s).replace(/[-_]+/g, ' ').replace(/(^|\s)([a-z])/g, (m, a, b) => a + b.toUpperCase());
    const texts = (t) => (str(t).trim() ? [str(t)] : []);
    const list = (s) => str(s).split(',').map((x) => x.trim()).filter(Boolean);
    const SKILLS = ['Acrobatics', 'Animal Handling', 'Arcana', 'Athletics', 'Deception', 'History', 'Insight', 'Intimidation', 'Investigation', 'Medicine', 'Nature', 'Perception', 'Performance', 'Persuasion', 'Religion', 'Sleight of Hand', 'Stealth', 'Survival'];
    const LANGS = ['Common', 'Dwarvish', 'Elvish', 'Giant', 'Gnomish', 'Goblin', 'Halfling', 'Orc', 'Abyssal', 'Celestial', 'Draconic', 'Deep Speech', 'Infernal', 'Primordial', 'Sylvan', 'Undercommon'];
    const skillRef = (s) => 'skill-' + slug(s);
    // what someone typed as a proficiency: a skill is a skill, the rest as the content files spell them
    const profRef = (s) => (SKILLS.some((k) => k.toLowerCase() === str(s).trim().toLowerCase()) ? skillRef(s) : slug(s));

    // slots by character level (the same table as the SRD's casters): [count of 1st, 2nd, ...]
    const MC = [[], [2], [3], [4, 2], [4, 3], [4, 3, 2], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 2], [4, 3, 3, 3, 1], [4, 3, 3, 3, 2], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1],
        [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1, 1], [4, 3, 3, 3, 3, 1, 1, 1, 1], [4, 3, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 3, 2, 2, 1, 1]];
    const PACT = [[1, 1], [2, 1], [2, 2], [2, 2], [2, 3], [2, 3], [2, 4], [2, 4], [2, 5], [2, 5], [3, 5], [3, 5], [3, 5], [3, 5], [3, 5], [3, 5], [4, 5], [4, 5], [4, 5], [4, 5]];
    const pad = (r) => Array.from({ length: 9 }, (_, i) => r[i] || 0);
    function slotsFor(type) {
        return Array.from({ length: 20 }, (_, i) => {
            const l = i + 1;
            if (type === 'full') return pad(MC[l]);
            if (type === 'half') return pad(l < 2 ? [] : MC[Math.ceil(l / 2)]);
            if (type === 'third') return pad(l < 3 ? [] : MC[Math.ceil(l / 3)]);
            if (type === 'pact') { const [n, lv] = PACT[i], r = pad([]); r[lv - 1] = n; return r; }
            return pad([]);
        });
    }

    function feature(f, n) {
        const opts = arr(f.options).filter((o) => str(o.name).trim());
        return { index: 'hb-' + str(f.id || slug(f.name)), name: str(f.name), level: n, desc: texts(f.text), hb: true, uses: str(f.uses), reset: str(f.reset), grants: list(f.grants).map(profRef),
            ...(opts.length ? { choices: { choose: +f.choose || 1, options: opts.map((o, i) => ({ index: 'hb-' + str(f.id) + '-' + (o.id || i), name: str(o.name), desc: texts(o.text) })) } } : {}),
            ...(f.pick === 'skill' || f.pick === 'expert' ? { pick: f.pick, pickN: +f.pickN || 1 } : {}) };
    }
    const featuresOf = (x, n) => arr(x.levels).filter((l) => +l.n === n).flatMap((l) => arr(l.feats).filter((f) => str(f.name).trim()).map((f) => feature(f, n)));
    const refOf = (it) => str(it.ref) || slug(it.name);
    const itemOption = (it) => (it.cat ? { option_type: 'choice', choice: { desc: 'any ' + words(it.cat).toLowerCase(), choose: +it.n || 1, type: 'equipment', from: { option_set_type: 'equipment_category', equipment_category: str(it.cat) } } }
        : { option_type: 'counted_reference', count: +it.n || 1, of: refOf(it) });
    const itemText = (it) => (it.cat ? 'any ' + words(it.cat).toLowerCase() : `${+it.n > 1 ? it.n + ' ' : ''}${str(it.name) || words(refOf(it))}`);
    function equipment(e) {
        e = obj(e);
        const names = {};
        for (const it of [...arr(e.fixed), ...arr(e.choices).flatMap((c) => arr(c.options).flatMap((o) => arr(o.items)))]) if (!it.cat && (it.name || it.ref)) names[refOf(it)] = str(it.name) || words(refOf(it));
        return { names, starting_equipment: arr(e.fixed).filter((it) => it.name || it.ref).map((it) => ({ equipment: refOf(it), quantity: +it.n || 1 })),
            starting_equipment_options: arr(e.choices).map((c) => {
                if (str(c.text).trim()) return { desc: str(c.text), choose: 1, type: 'equipment' };
                const opts = arr(c.options).map((o) => arr(o.items).filter((it) => it.cat || it.name || it.ref)).filter((o) => o.length);
                return { desc: opts.map((o, i) => `(${String.fromCharCode(97 + i)}) ${o.map(itemText).join(', ')}`).join(' or '), choose: 1, type: 'equipment',
                    from: { option_set_type: 'options_array', options: opts.map((o) => (o.length === 1 ? itemOption(o[0]) : { option_type: 'multiple', items: o.map(itemOption) })) } };
            }).filter((s) => s.desc) };
    }
    function bonuses(x) {
        const fixed = arr(x.bonuses).filter((b) => b.ab && +b.n).map((b) => ({ ability_score: str(b.ab).toLowerCase(), bonus: +b.n }));
        return { ability_bonuses: fixed, ...(+x.bonusChoose > 0 ? { ability_bonus_options: { choose: +x.bonusChoose, type: 'ability_bonuses', from: { option_set_type: 'options_array', options: ['str', 'dex', 'con', 'int', 'wis', 'cha'].map((a) => ({ option_type: 'ability_bonus', ability_score: a, bonus: 1 })) } } } : {}) };
    }
    const traitsOf = (x) => arr(x.traits).filter((t) => str(t.name).trim()).map((t, i) => ({ index: 'hb-' + str(t.id || i), name: str(t.name), desc: texts(t.text), proficiencies: [], hb: true, uses: str(t.uses), reset: str(t.reset) }));
    // what a race or subrace does beyond its traits; build.js reads these, and only these, for homebrew
    const effects = (x) => ({ hbDark: +x.darkvision || 0, hbRes: list(x.resist), hbSpeeds: arr(x.speeds).filter((s) => s.type && +s.ft).map((s) => ({ type: str(s.type), ft: +s.ft })), hbProfs: [...arr(x.skills).map(skillRef), ...list(x.tools).map(profRef)],
        hbSkillChoice: +x.skillChoose > 0 ? { n: +x.skillChoose, from: arr(x.skillFrom).length ? arr(x.skillFrom) : SKILLS } : null, hbCantrips: arr(x.cantrips).map((s) => s.id), hbCantripChoice: +x.cantripChoose > 0 ? { n: +x.cantripChoose, ids: arr(x.cantripFrom).map((s) => s.id) } : null,
        hbLangs: [...arr(x.langs).map(slug), ...list(x.langOther)], language_options: +x.langChoose > 0 ? { choose: +x.langChoose, type: 'languages', from: { option_set_type: 'options_array', options: LANGS.map((l) => ({ option_type: 'reference', item: slug(l) })) } } : undefined });
    const spellSeeds = (l) => arr(l).filter((s) => s && s.id).map((s) => ({ id: str(s.id), name: str(s.name), level: +s.level || 0 }));

    // an entry as content: {key: the kind's list in the data, id, e: the entry there}
    function toContent(x) {
        const id = 'hb-' + x.id, base = { index: id, name: str(x.name), hbx: x, hb: true };
        if (x.kind === 'class') {
            const col = arr(x.columns).filter((c) => str(c.name).trim()), type = str(x.caster) || 'none', caster = type !== 'none', eq = equipment(x.equip), slots = arr(x.slots), cnt = (a, i) => +arr(a)[i] || 0;
            const profs = [...arr(x.armour), ...arr(x.weapons), ...list(x.weaponOther).map(slug), ...list(x.tools).map(slug), ...arr(x.skillsFixed).map(skillRef)];
            const levels = Array.from({ length: 20 }, (_, i) => {
                const n = i + 1, row = { level: n, ability_score_bonuses: 0, prof_bonus: Math.ceil(n / 4) + 1, features: featuresOf(x, n), class_specific: Object.fromEntries(col.map((c) => [str(c.name), str(arr(c.values)[i])])) };
                if (caster) row.spellcasting = { cantrips_known: cnt(x.cantripsKnown, i), ...(x.prep === 'known' ? { spells_known: cnt(x.spellsKnown, i) } : {}), ...Object.fromEntries(Array.from({ length: 9 }, (_, s) => ['spell_slots_level_' + (s + 1), +arr(slots[i])[s] || 0])) };
                return row;
            });
            const mins = arr(x.multiMin).filter((m) => m.ab && +m.score).map((m) => ({ ability_score: str(m.ab).toLowerCase(), minimum_score: +m.score }));
            return { key: 'classes', id, names: eq.names, seeds: spellSeeds(x.spells), e: { ...base, desc: texts(x.text), hit_die: +x.hitDie || 8, saving_throws: arr(x.saves).map((s) => str(s).toLowerCase()), proficiencies: profs,
                proficiency_choices: +x.skillChoose > 0 ? [{ desc: `Choose ${+x.skillChoose} from ${arr(x.skillFrom).join(', ')}`, choose: +x.skillChoose, type: 'proficiencies', from: { option_set_type: 'options_array', options: arr(x.skillFrom).map((s) => ({ option_type: 'reference', item: skillRef(s) })) } }] : [],
                starting_equipment: eq.starting_equipment, starting_equipment_options: eq.starting_equipment_options, subclasses: [], levels, spells: spellSeeds(x.spells).map((s) => s.id),
                multi_classing: { ...(x.multiAny ? { prerequisite_options: { choose: 1, from: { options: mins } } } : { prerequisites: mins }), proficiencies: [...arr(x.multiArmour), ...arr(x.multiWeapons)], proficiency_choices: [] },
                ...(caster ? { spellcasting: { level: 1, spellcasting_ability: str(x.ability || 'int').toLowerCase() }, hbCaster: type === 'custom' ? str(x.counts) || 'none' : type, pact: type === 'pact' } : {}),
                hbPrep: x.prep === 'known' ? 0 : x.prepHalf ? 0.5 : 1, ...(x.prep === 'book' ? { hbBook: [+x.book1 || 6, +x.bookN || 2] } : {}), hbAsi: arr(x.asi).map(Number), hbSubLevel: +x.subLevel || 3, subclass_flavor: str(x.subLabel),
                resources: arr(x.resources).filter((r) => str(r.name).trim()), hpPerLevel: +x.hpPerLevel || 0, ...(+x.goldN > 0 ? { gold: [+x.goldN, +x.goldMult || 1] } : {}) } };
        }
        if (x.kind === 'subclass') {
            const parent = str(x.parent);
            return { key: 'subclasses', id, seeds: spellSeeds(x.spells), e: { ...base, class: parent, subclass_flavor: str(x.flavour), desc: texts(x.text), hpPerLevel: +x.hpPerLevel || 0,
                spells: spellSeeds(x.spells).map((s, i) => ({ spell: s.id, prerequisites: [`${parent}-${+arr(x.spells)[i]?.at || 1}`] })), spellNames: Object.fromEntries(spellSeeds(x.spells).map((s) => [s.id, s.name])),
                levels: Array.from({ length: 20 }, (_, i) => ({ level: i + 1, features: featuresOf(x, i + 1) })).filter((l) => l.features.length) } };
        }
        if (x.kind === 'race' || x.kind === 'subrace') {
            const fx = effects(x), lang = [...arr(x.langs).map((l) => str(l)), ...list(x.langOther)];
            const seeds = spellSeeds([...arr(x.cantrips), ...arr(x.cantripFrom)]);
            if (x.kind === 'subrace') return { key: 'subraces', id, seeds, e: { ...base, race: str(x.parent), desc: str(x.text), ...bonuses(x), traits: traitsOf(x), ...fx } };
            return { key: 'races', id, seeds, e: { ...base, desc: str(x.text), speed: +x.speed || 30, size: str(x.size) || 'Medium', size_description: str(x.sizeText), age: str(x.age), alignment: str(x.alignment), ...bonuses(x), languages: [], language_desc: lang.join(', '), traits: traitsOf(x), ...fx } };
        }
        if (x.kind === 'background') {
            const eq = equipment(x.equip), table = (t) => { const l = str(t).split('\n').map((s) => s.trim()).filter(Boolean); return l.length ? { from: { options: l.map((string) => ({ string })) } } : undefined; };
            return { key: 'backgrounds', id, names: eq.names, e: { ...base, desc: texts(x.text), starting_proficiencies: [...arr(x.skills).map(skillRef), ...list(x.tools).map(slug)], language_options: +x.langChoose > 0 ? { choose: +x.langChoose } : null,
                starting_equipment: eq.starting_equipment, starting_equipment_options: eq.starting_equipment_options, ...(+x.gold > 0 ? { starting_gold: { quantity: +x.gold, unit: 'gp' } } : {}), ...(str(x.featureName).trim() ? { feature: { name: str(x.featureName), desc: texts(x.featureText) } } : {}),
                personality_traits: table(x.traitsTable), ideals: table(x.idealsTable), bonds: table(x.bondsTable), flaws: table(x.flawsTable), ...(arr(x.abilities).length ? { ability_scores: arr(x.abilities).map((a) => str(a).toLowerCase()) } : {}), ...(str(x.feat).trim() ? { feat: str(x.feat) } : {}) } };
        }
        return null;
    }
    // into a rules version's data. A spell or item it names but this version hasn't got shows by name; the real one replaces that when its file loads.
    function add(d, c, rules) {
        if (!c) return d;
        (d[c.key] ||= {})[c.id] = Object.assign({ rules, src: 'homebrew' }, c.e);
        for (const s of c.seeds || []) if (!(d.spells ||= {})[s.id]) d.spells[s.id] = { name: s.name, level: s.level, rules };
        for (const [ref, name] of Object.entries(c.names || {})) if (!(d.equipment ||= {})[ref]) d.equipment[ref] = { name, rules };
        return d;
    }

    // ---- official content as a form's starting values ("Start from") ----
    const ABS = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'], ARMOUR = ['light-armor', 'medium-armor', 'heavy-armor', 'shields'], WEAPONS = ['simple-weapons', 'martial-weapons'];
    const ref = (p) => str(p?.index || p), nameOfSkill = (i) => SKILLS.find((s) => skillRef(s) === ref(i));
    let n = 0;
    const uid = () => 'f' + Date.now().toString(36) + (n++).toString(36);
    const join = (d) => (Array.isArray(d) ? d : [d]).filter(Boolean).join('\n\n');
    const feats = (levels) => arr(levels).filter((l) => arr(l.features).length).map((l) => ({ n: l.level, feats: l.features.filter((f) => !/^ability score improvement/i.test(f.name)).map((f) => ({ id: uid(), name: f.name, text: join(f.desc),
        ...(f.choices?.options ? { choose: f.choices.choose || 1, options: f.choices.options.map((o, i) => ({ id: 'o' + i, name: o.name, text: join(o.desc) })) } : {}) })) }));
    const optionsOut = (e) => {
        const item = (o) => (o.option_type === 'choice' ? { cat: ref(o.choice?.from?.equipment_category), n: o.choice?.choose || 1 } : o.option_type === 'reference' ? { ref: ref(o.item), name: words(ref(o.item)), n: 1 } : { ref: ref(o.of), name: words(ref(o.of)), n: o.count || 1 });
        return { fixed: arr(e.starting_equipment).map((q) => ({ ref: ref(q.equipment), name: words(ref(q.equipment)), n: q.quantity || 1 })),
            choices: arr(e.starting_equipment_options).map((s) => {
                if (s.from?.option_set_type === 'equipment_category') return { options: [{ items: [{ cat: ref(s.from.equipment_category), n: s.choose || 1 }] }] };
                if (!s.from?.options) return { text: str(s.desc) };
                return { options: s.from.options.map((o) => ({ items: o.option_type === 'multiple' ? arr(o.items).map(item) : [item(o)] })) };
            }) };
    };
    function fromOfficial(kind, d) {
        if (kind === 'class') {
            const profs = arr(d.proficiencies).map(ref), pc = arr(d.proficiency_choices)[0], sc = arr(d.levels).map((l) => l.spellcasting || {}), top = sc[19] || {};
            const isSkill = (p) => !!nameOfSkill(p), other = profs.filter((p) => !ARMOUR.includes(p) && !WEAPONS.includes(p) && !isSkill(p) && !/^saving-throw-/.test(p));
            const cols = [...new Set(arr(d.levels).flatMap((l) => Object.keys(l.class_specific || {})))].map((k) => ({ name: words(k), values: arr(d.levels).map((l) => str(l.class_specific?.[k])) }));
            const type = !d.spellcasting ? 'none' : d.pact ? 'pact' : +top.spell_slots_level_9 ? 'full' : +top.spell_slots_level_5 ? 'half' : +top.spell_slots_level_4 ? 'third' : 'custom';
            const mc = obj(d.multi_classing), mins = mc.prerequisites || mc.prerequisite_options?.from?.options || [], asi = arr(d.levels).filter((l) => (l.features || []).some((f) => /^ability score improvement/i.test(f.name))).map((l) => l.level);
            return { text: join(d.desc), hitDie: d.hit_die, saves: arr(d.saving_throws).map((s) => ref(s).toUpperCase()), armour: profs.filter((p) => ARMOUR.includes(p)), weapons: profs.filter((p) => WEAPONS.includes(p)), weaponOther: '', tools: other.map(words).join(', '),
                skillChoose: pc?.choose || 0, skillFrom: arr(pc?.from?.options).map((o) => nameOfSkill(o.item)).filter(Boolean), skillsFixed: profs.map(nameOfSkill).filter(Boolean), levels: feats(d.levels), asi: asi.length ? asi : [4, 8, 12, 16, 19], columns: cols, subLabel: str(d.subclass_flavor),
                caster: type, ability: ref(d.spellcasting?.spellcasting_ability).toUpperCase(), counts: 'none', slots: sc.map((s) => Array.from({ length: 9 }, (_, i) => +s['spell_slots_level_' + (i + 1)] || 0)), cantripsKnown: sc.map((s) => +s.cantrips_known || 0), spellsKnown: sc.map((s) => +s.spells_known || 0),
                prep: sc.some((s) => s.spells_known) ? 'known' : 'prepared', equip: optionsOut(d), multiMin: mins.map((m) => ({ ab: ref(m.ability_score).toUpperCase(), score: m.minimum_score })), multiAny: !mc.prerequisites && !!mc.prerequisite_options, multiArmour: arr(mc.proficiencies).map(ref).filter((p) => ARMOUR.includes(p)), multiWeapons: arr(mc.proficiencies).map(ref).filter((p) => WEAPONS.includes(p)), resources: [] };
        }
        if (kind === 'subclass') return { flavour: str(d.subclass_flavor), text: join(d.desc), parent: ref(d.class), levels: feats(d.levels), spells: [] };
        const traits = arr(d.traits).map((t) => ({ id: uid(), name: t.name, text: join(t.desc) })), bon = arr(d.ability_bonuses).map((b) => ({ ab: ref(b.ability_score).toUpperCase(), n: b.bonus }));
        if (kind === 'subrace') return { text: join(d.desc), parent: ref(d.race), bonuses: bon, traits };
        if (kind === 'race') return { text: join(d.desc), speed: d.speed, size: d.size, sizeText: str(d.size_description), age: str(d.age), alignment: str(d.alignment), bonuses: bon, bonusChoose: d.ability_bonus_options?.choose || 0, langs: arr(d.languages).map(ref), langChoose: d.language_options?.choose || 0, traits };
        if (kind === 'background') {
            const profs = arr(d.starting_proficiencies).map(ref), table = (t) => arr(t?.from?.options).map((o) => o.string || o.desc || '').join('\n');
            return { text: join(d.desc), skills: profs.map(nameOfSkill).filter(Boolean), tools: profs.filter((p) => !nameOfSkill(p)).map(words).join(', '), langChoose: +d.language_options?.choose || 0, equip: optionsOut(d), gold: +d.starting_gold?.quantity || 0, featureName: str(d.feature?.name), featureText: join(d.feature?.desc),
                traitsTable: table(d.personality_traits), idealsTable: table(d.ideals), bondsTable: table(d.bonds), flawsTable: table(d.flaws), abilities: arr(d.ability_scores).map((a) => ref(a).toUpperCase()), feat: str(d.feat) };
        }
        return {};
    }
    const HomebrewContent = { toContent, add, fromOfficial, slotsFor, SKILLS, LANGS, ABS, KINDS: ['class', 'subclass', 'race', 'subrace', 'background'] };
    if (typeof module === 'object' && module.exports) module.exports = HomebrewContent; else root.HomebrewContent = HomebrewContent;
})(this);
