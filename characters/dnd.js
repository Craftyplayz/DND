// D&D character sheet. index.php embeds the D&D Beyond character JSON and trimmed rule data in #dnd-data;
// this works out the derived numbers the API doesn't send (scores, AC, HP, saves, skills, attacks, spell DCs,
// slots, weight) from the modifiers, the same way D&D Beyond's own sheet does, then draws the sheet.
(function () {
    'use strict';
    const { $, $$, esc, store, debounce, toast, copy, ago, num } = window.UI;
    const dataEl = $('#dnd-data');
    if (!dataEl) return;
    const P = JSON.parse(dataEl.textContent);
    const C = P.character, R = P.rules || {};
    const DDB = 'https://www.dndbeyond.com';

    /* ---------- small helpers ---------- */
    const arr = (v) => (Array.isArray(v) ? v : v ? [v] : []);
    const byId = (list, id) => arr(list).find((x) => x && (x.id === id || (x.definition && x.definition.id === id)));
    const nameOf = (list, id, d = '') => { const x = byId(list, id); return x ? (x.name || (x.definition && x.definition.name)) : d; };
    const signed = (n) => (n >= 0 ? '+' : '−') + Math.abs(n);
    const slug = (s) => String(s || '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const plural = (n, w) => num(n) + ' ' + w + (n === 1 ? '' : 's');
    const ft = (n) => (n == null ? '' : num(n) + ' ft.');
    const sum = (a) => a.reduce((t, x) => t + (+x || 0), 0);
    const STATS = [[1, 'strength', 'STR'], [2, 'dexterity', 'DEX'], [3, 'constitution', 'CON'], [4, 'intelligence', 'INT'], [5, 'wisdom', 'WIS'], [6, 'charisma', 'CHA']];
    const statKey = (id) => (STATS.find((s) => s[0] === id) || [0, '', '?'])[2];
    const statName = (id) => (STATS.find((s) => s[0] === id) || [0, ''])[1];

    // descriptions from D&D Beyond are HTML: keep basic formatting only, absolutise links, drop everything else
    const ALLOWED = new Set(['P', 'BR', 'EM', 'I', 'STRONG', 'B', 'U', 'UL', 'OL', 'LI', 'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TD', 'TH', 'CAPTION', 'A', 'HR', 'SPAN', 'DIV', 'SUP', 'SUB', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'DL', 'DT', 'DD']);
    const DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'MATH', 'FORM', 'INPUT', 'BUTTON', 'TEXTAREA', 'SELECT', 'IMG', 'VIDEO', 'AUDIO', 'LINK', 'META']);
    function clean(htmlText) {
        if (!htmlText) return '';
        const t = document.createElement('template');
        t.innerHTML = tokens(String(htmlText));
        (function walk(node) {
            for (const el of [...node.children]) {
                if (DROP.has(el.tagName)) { el.remove(); continue; }
                walk(el);
                if (!ALLOWED.has(el.tagName)) { el.replaceWith(...el.childNodes); continue; }
                for (const a of [...el.attributes]) if (!['href', 'colspan', 'rowspan'].includes(a.name)) el.removeAttribute(a.name);
                if (el.tagName === 'A') {
                    const href = el.getAttribute('href') || '';
                    if (/^https?:\/\//i.test(href)) el.setAttribute('href', href);
                    else if (href.startsWith('/')) el.setAttribute('href', DDB + href);
                    else { el.replaceWith(...el.childNodes); continue; }
                    el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener noreferrer');
                }
            }
        })(t.content);
        const d = document.createElement('div'); d.append(t.content); return d.innerHTML;
    }
    const text = (htmlText) => { const t = document.createElement('template'); t.innerHTML = String(htmlText || ''); return t.content.textContent.replace(/\s+/g, ' ').trim(); };

    /* ---------- the derived numbers ---------- */
    const S = {}; // everything computed lives here
    const level = sum(arr(C && C.classes).map((c) => c.level)) || 1;

    // class feature id -> required level, so modifiers from features above the character's level are ignored
    const featureLevel = {}, featureById = {}, scaleById = {};
    for (const cl of arr(C && C.classes)) for (const f of arr(cl.classFeatures)) {
        const d = f.definition || {};
        featureLevel[d.id] = { req: d.requiredLevel || 1, have: cl.level, cls: cl };
        featureById[d.id] = d;
        if (f.levelScale) scaleById[d.id] = f.levelScale;
    }

    function activeModifiers() {
        const out = [];
        const m = (C && C.modifiers) || {};
        for (const src of ['race', 'class', 'background', 'feat', 'condition']) {
            for (const mod of arr(m[src])) {
                if (/^choose-/.test(mod.subType || '')) continue; // an unmade choice
                const fl = featureLevel[mod.componentId];
                if (src === 'class' && fl && fl.req > fl.have) continue;
                out.push(Object.assign({ _src: src }, mod));
            }
        }
        // item modifiers come from the items themselves: only equipped ones, and attuned when they need it
        for (const it of arr(C && C.inventory)) {
            const d = it.definition || {};
            if (!it.equipped) continue;
            for (const mod of arr(d.grantedModifiers)) {
                if (mod.requiresAttunement && !it.isAttuned) continue;
                out.push(Object.assign({ _src: 'item', _item: d.name }, mod));
            }
        }
        return out;
    }
    const MODS = C ? activeModifiers() : [];
    const mods = (type, sub) => MODS.filter((m) => m.type === type && (sub === undefined || (Array.isArray(sub) ? sub.includes(m.subType) : m.subType === sub)));
    const modVal = (m) => (m.value != null ? +m.value : m.fixedValue != null ? +m.fixedValue : 0) + (m.statId ? S.mod ? S.mod[m.statId] || 0 : 0 : 0);
    const bonus = (sub) => sum(mods('bonus', sub).filter((m) => !m.restriction).map(modVal));
    const has = (type, sub) => mods(type, sub).length > 0;
    const cv = (typeId, valueId) => arr(C && C.characterValues).find((v) => v.typeId === typeId && (valueId === undefined || String(v.valueId) === String(valueId)));
    const cvNum = (typeId, valueId) => { const v = cv(typeId, valueId); return v && v.value != null && v.value !== '' ? +v.value : null; };

    function compute() {
        // ability scores: base (or override) + bonus scores + racial/class/feat bonuses (capped at 20) + item bonuses, then "set" floors
        S.score = {}; S.mod = {}; S.scoreParts = {};
        for (const [id, nm] of STATS) {
            const base = (byId(C.stats, id) || {}).value || 10;
            const extra = (byId(C.bonusStats, id) || {}).value || 0;
            const over = (byId(C.overrideStats, id) || {}).value;
            const b = mods('bonus', nm + '-score');
            const capped = sum(b.filter((m) => m._src !== 'item').map((m) => +(m.value != null ? m.value : m.fixedValue) || 0));
            const items = sum(b.filter((m) => m._src === 'item').map((m) => +(m.value != null ? m.value : m.fixedValue) || 0));
            let score = Math.max(base + extra, Math.min(20, base + extra + capped)) + items;
            for (const m of mods('set', nm + '-score')) score = Math.max(score, +(m.value != null ? m.value : m.fixedValue) || 0);
            if (over) score = over;
            S.score[id] = score; S.mod[id] = Math.floor((score - 10) / 2);
            S.scoreParts[id] = { base, extra, capped, items, over };
        }
        const pbRow = arr(R.levelProficiencyBonuses).find((r) => r.level === Math.min(level, 20));
        S.prof = (pbRow ? pbRow.bonus : Math.ceil(level / 4) + 1) + bonus('proficiency-bonus');
        const half = () => Math.floor(S.prof / 2), halfUp = () => Math.ceil(S.prof / 2);

        // saving throws
        S.saves = STATS.map(([id, nm, key]) => {
            const lvlOver = cvNum(41, id);
            const prof = lvlOver != null ? lvlOver >= 3 : has('proficiency', nm + '-saving-throws');
            let total = S.mod[id] + (prof ? S.prof : 0) + bonus('saving-throws') + bonus(nm + '-saving-throws') + (cvNum(39, id) || 0) + (cvNum(40, id) || 0);
            const ov = cvNum(38, id); if (ov != null) total = ov;
            const notes = [...mods('advantage', nm + '-saving-throws').map((m) => 'Advantage' + (m.restriction ? ' ' + m.restriction : '')),
                ...mods('disadvantage', nm + '-saving-throws').map((m) => 'Disadvantage' + (m.restriction ? ' ' + m.restriction : ''))];
            return { id, key, name: nm, prof, total, notes };
        });
        S.saveNotes = [...mods('advantage', 'saving-throws').map((m) => 'Advantage on saves' + (m.restriction ? ' ' + m.restriction : '')), ...mods('disadvantage', 'saving-throws').map((m) => 'Disadvantage on saves' + (m.restriction ? ' ' + m.restriction : ''))];
        // plain ability checks: half proficiency (Jack of All Trades, Remarkable Athlete) and check bonuses
        S.check = {};
        for (const [id, nm] of STATS) {
            const subs = ['ability-checks', nm + '-ability-checks'];
            S.check[id] = S.mod[id] + (has('half-proficiency-round-up', subs) ? halfUp() : has('half-proficiency', subs) ? half() : 0) + bonus('ability-checks') + bonus(nm + '-ability-checks');
        }

        // skills (plus custom ones from customProficiencies type 1)
        S.skills = arr(R.abilitySkills).map((sk) => {
            const sub = slug(sk.name), statNm = statName(sk.stat);
            let lvl = has('expertise', sub) ? 3 : has('proficiency', sub) ? 2 : (has('half-proficiency-round-up', [sub, 'ability-checks', statNm + '-ability-checks']) ? 1.5 : has('half-proficiency', [sub, 'ability-checks', statNm + '-ability-checks']) ? 1 : 0);
            const lo = cvNum(26, sk.id); if (lo != null) lvl = { 1: 0, 2: 1, 3: 2, 4: 3 }[lo] ?? lvl;
            const stat = cvNum(27, sk.id) || sk.stat;
            const pb = lvl === 3 ? S.prof * 2 : lvl === 2 ? S.prof : lvl === 1.5 ? halfUp() : lvl === 1 ? half() : 0;
            let total = S.mod[stat] + pb + bonus(sub) + bonus('ability-checks') + bonus(statName(stat) + '-ability-checks') + (cvNum(24, sk.id) || 0) + (cvNum(25, sk.id) || 0);
            const ov = cvNum(23, sk.id); if (ov != null) total = ov;
            const notes = [...mods('advantage', sub).map((m) => 'Advantage' + (m.restriction ? ' ' + m.restriction : '')), ...mods('disadvantage', sub).map((m) => 'Disadvantage' + (m.restriction ? ' ' + m.restriction : ''))];
            return { id: sk.id, name: sk.name, stat, lvl, total, notes, description: sk.description };
        });
        for (const cp of arr(C.customProficiencies).filter((p) => p.type === 1)) {
            const lvl = { 1: 0, 2: 1, 3: 2, 4: 3 }[cp.proficiencyLevel] || 0, stat = cp.statId || 1;
            const total = cp.override != null ? cp.override : S.mod[stat] + [0, half(), S.prof, S.prof * 2][lvl] + (cp.magicBonus || 0) + (cp.miscBonus || 0);
            S.skills.push({ id: 'c' + cp.id, name: cp.name, stat, lvl, total, notes: cp.notes ? [cp.notes] : [], description: cp.description, custom: true });
        }
        S.skills.sort((a, b) => a.name.localeCompare(b.name));
        const sk = (n) => (S.skills.find((s) => s.name === n) || { total: 0 }).total;
        S.passive = {
            Perception: cvNum(5) ?? 10 + sk('Perception') + bonus('passive-perception'),
            Investigation: cvNum(6) ?? 10 + sk('Investigation') + bonus('passive-investigation'),
            Insight: cvNum(7) ?? 10 + sk('Insight') + bonus('passive-insight'),
        };

        // initiative
        S.init = S.mod[2] + bonus('initiative') + (has('proficiency', 'initiative') ? S.prof : has('half-proficiency-round-up', ['initiative', 'ability-checks', 'dexterity-ability-checks']) ? halfUp() : has('half-proficiency', ['initiative', 'ability-checks', 'dexterity-ability-checks']) ? half() : 0) + bonus('ability-checks') + bonus('dexterity-ability-checks');
        S.initNotes = [...mods('advantage', 'initiative').map((m) => 'Advantage' + (m.restriction ? ' ' + m.restriction : '')), ...mods('disadvantage', 'initiative').map(() => 'Disadvantage')];

        // armour class
        const worn = arr(C.inventory).filter((i) => i.equipped && i.definition && i.definition.armorTypeId);
        const armor = worn.find((i) => i.definition.armorTypeId !== 4), shield = worn.find((i) => i.definition.armorTypeId === 4);
        const dex = S.mod[2];
        let base, acParts = [];
        if (armor) {
            const t = armor.definition.armorTypeId, ac = armor.definition.armorClass || 0;
            const d = t === 1 ? dex : t === 2 ? Math.min(dex, 2 + bonus('ac-max-dex-armored-modifier')) : 0;
            base = ac + d; acParts.push(armor.definition.name + ' ' + ac, t !== 3 ? 'DEX ' + signed(d) : '');
        } else {
            const isMonk = (mod) => { const f = featureLevel[mod.componentId]; return f && f.cls.definition && f.cls.definition.name === 'Monk'; };
            const options = [{ v: (R.noArmorAcAmount || 10) + dex, label: 'Unarmored 10 + DEX ' + signed(dex) }];
            for (const m of mods('set', 'unarmored-armor-class')) {
                if (shield && isMonk(m)) continue;
                if (m.statId) options.push({ v: 10 + dex + S.mod[m.statId], label: '10 + DEX ' + signed(dex) + ' + ' + statKey(m.statId) + ' ' + signed(S.mod[m.statId]) });
                else if (m.value != null || m.fixedValue != null) { const v = +(m.value ?? m.fixedValue); options.push({ v: v + dex, label: v + ' + DEX ' + signed(dex) }); }
            }
            const best = options.sort((a, b) => b.v - a.v)[0];
            base = best.v; acParts.push(best.label);
        }
        const baseOver = cvNum(4); if (baseOver != null) { base = baseOver; acParts = ['Base ' + baseOver]; }
        let ac = base;
        if (shield) { ac += shield.definition.armorClass || 0; acParts.push(shield.definition.name + ' +' + (shield.definition.armorClass || 0)); }
        const acBonus = bonus('armor-class') + (armor ? bonus('armored-armor-class') : bonus('unarmored-armor-class')) + (cvNum(2) || 0) + (cvNum(3) || 0);
        if (acBonus) { ac += acBonus; acParts.push('bonuses ' + signed(acBonus)); }
        const acOver = cvNum(1); if (acOver != null) { ac = acOver; acParts = ['Overridden on D&D Beyond']; }
        S.ac = ac; S.acParts = acParts.filter(Boolean); S.armor = armor; S.shield = shield;

        // hit points
        const con = S.mod[3];
        S.hpMax = C.overrideHitPoints || Math.max(R.minimumHpTotal || 1, (C.baseHitPoints || 0) + (C.bonusHitPoints || 0) + con * level + bonus('hit-points-per-level') * level + bonus('hit-points'));
        S.hp = Math.max(0, S.hpMax - (C.removedHitPoints || 0));
        S.temp = C.temporaryHitPoints || 0;

        // speeds
        const ws = (C.race && C.race.weightSpeeds && C.race.weightSpeeds.normal) || { walk: 30 };
        const walk = (ws.walk || 0) + bonus('speed') + bonus('speed-walking') + (armor ? 0 : bonus('unarmored-movement'));
        S.speeds = { Walk: walk };
        for (const [mode, key] of [['Fly', 'fly'], ['Swim', 'swim'], ['Climb', 'climb'], ['Burrow', 'burrow']]) {
            let v = ws[key] || 0;
            for (const m of mods('set', 'innate-speed-' + (key === 'fly' ? 'flying' : key === 'swim' ? 'swimming' : key === 'climb' ? 'climbing' : 'burrowing'))) v = Math.max(v, m.value ?? m.fixedValue ?? walk);
            if (v) v += bonus('speed-' + (key === 'fly' ? 'flying' : key === 'swim' ? 'swimming' : key === 'climb' ? 'climbing' : 'burrowing'));
            if (v) S.speeds[mode] = v;
        }
        for (const cs of arr(C.customSpeeds)) S.speeds[nameOf(R.movements, cs.movementId, 'Speed')] = cs.distance;
        for (const v of arr(C.characterValues).filter((x) => x.typeId === 37)) S.speeds[nameOf(R.movements, +v.valueId, 'Speed')] = +v.value;

        // senses
        S.senses = {};
        for (const m of [...mods('set-base'), ...mods('sense')]) {
            if (!/darkvision|blindsight|tremorsense|truesight/.test(m.subType)) continue;
            const label = m.friendlySubtypeName || m.subType;
            const v = +(m.value ?? m.fixedValue ?? 0);
            S.senses[label] = m.type === 'sense' ? (S.senses[label] || 0) + v : Math.max(S.senses[label] || 0, v);
        }
        for (const cs of arr(C.customSenses)) S.senses[nameOf(R.senses, cs.senseId, 'Sense')] = cs.distance;
        for (const v of arr(C.characterValues).filter((x) => x.typeId === 36)) S.senses[nameOf(R.senses, +v.valueId, 'Sense')] = +v.value;

        // defenses
        const defs = { Resistances: [], Immunities: [], Vulnerabilities: [] };
        for (const [type, key] of [['resistance', 'Resistances'], ['immunity', 'Immunities'], ['vulnerability', 'Vulnerabilities']])
            for (const m of mods(type)) defs[key].push((m.friendlySubtypeName || m.subType) + (m.restriction ? ' (' + m.restriction + ')' : ''));
        for (const a of arr(C.customDefenseAdjustments)) {
            const da = byId(R.damageAdjustments, a.adjustmentId);
            if (da) defs[{ 1: 'Resistances', 2: 'Immunities', 3: 'Vulnerabilities' }[da.type] || 'Resistances'].push(da.name + (a.source ? ' (' + a.source + ')' : ''));
        }
        S.defenses = defs;
        S.advantages = [...mods('advantage'), ...mods('disadvantage')].filter((m) => !/saving-throws|^initiative$/.test(m.subType) && !S.skills.some((s) => slug(s.name) === m.subType))
            .map((m) => (m.type === 'advantage' ? 'Advantage on ' : 'Disadvantage on ') + (m.friendlySubtypeName || m.subType).toLowerCase() + (m.restriction ? ' ' + m.restriction : ''));

        // proficiencies by group (armour, weapons, tools, languages, other)
        const groups = { Armor: new Map(), Weapons: new Map(), Tools: new Map(), Languages: new Map(), Other: new Map() };
        const groupOf = (m) => { for (const g of arr(R.proficiencyGroups)) if (arr(g.entityTypeIds).includes(m.entityTypeId)) return g.label; return null; };
        const skip = new Set(S.skills.map((s) => slug(s.name)).concat(STATS.map((s) => s[1] + '-saving-throws'), ['initiative']));
        for (const m of [...mods('proficiency'), ...mods('expertise'), ...mods('language')]) {
            if (skip.has(m.subType)) continue;
            const g = m.type === 'language' ? 'Languages' : groupOf(m) || (/armor|shields/.test(m.subType) ? 'Armor' : /weapons?$/.test(m.subType) ? 'Weapons' : 'Other');
            (groups[g] || groups.Other).set(m.subType, (m.friendlySubtypeName || m.subType) + (m.type === 'expertise' ? ' (expertise)' : ''));
        }
        for (const cp of arr(C.customProficiencies).filter((p) => p.type !== 1)) {
            const g = { 2: 'Tools', 3: 'Languages', 4: 'Armor', 5: 'Weapons' }[cp.type] || 'Other';
            groups[g].set('custom-' + cp.id, cp.name);
        }
        S.profs = Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, [...v.values()].sort()]));
        S.profSet = new Set([...mods('proficiency').map((m) => m.subType)]);

        // carrying
        const sizeId = (C.race && C.race.sizeId) || 4;
        const size = byId(R.creatureSizes, sizeId) || { name: 'Medium', weightType: 2 };
        const sizeMod = mods('size')[0] || mods('set', 'size')[0];
        S.size = sizeMod ? sizeMod.friendlySubtypeName : size.name;
        S.capacity = S.score[1] * 15 * ({ 1: 0.5, 2: 1, 3: 2 }[size.weightType] || 1) * (1 + bonus('carrying-capacity'));
        S.inv = arr(C.inventory);
        const items = new Map(S.inv.map((i) => [i.id, i]));
        const itemWeight = (it) => {
            const d = it.definition || {}, over = cvNum(22, it.id);
            return (over != null ? over : (d.weight || 0) * (d.weightMultiplier ?? 1)) * (it.quantity || 1) / (d.bundleSize || 1);
        };
        const counts = (it) => { // weight inside a container with weightMultiplier 0 (bag of holding) doesn't count
            const cont = items.get(it.containerEntityId);
            return !cont || (cont.definition && (cont.definition.weightMultiplier ?? 1) !== 0) ? (cont ? counts(cont) : true) : false;
        };
        const coins = sum(['cp', 'sp', 'ep', 'gp', 'pp'].map((k) => (C.currencies || {})[k]));
        S.coinWeight = C.preferences && C.preferences.ignoreCoinWeight ? 0 : coins / 50;
        S.weight = sum(S.inv.filter(counts).map(itemWeight)) + sum(arr(C.customItems).map((c) => (c.weight || 0) * (c.quantity || 1))) + S.coinWeight;
        S.itemWeight = itemWeight;
        S.gp = sum(arr(R.currencyData).map((c) => ((C.currencies || {})[c.name.toLowerCase()] || 0) * (c.conversionFromGp || 0)));
        S.attuned = S.inv.filter((i) => i.isAttuned).length;
        S.attuneMax = (R.defaultAttunedItemCountMax || 3) + bonus('attunement-slots');

        // spellcasting per class
        S.casting = arr(C.classes).map((cl) => {
            const def = cl.definition || {}, sub = cl.subclassDefinition || {};
            const ability = def.spellCastingAbilityId || sub.spellCastingAbilityId;
            const canCast = def.canCastSpells || sub.canCastSpells;
            if (!canCast || !ability) return null;
            const rules = (def.canCastSpells ? def.spellRules : sub.spellRules) || {};
            const mod = S.mod[ability];
            return {
                cls: cl, name: def.name, ability, mod,
                dc: 8 + S.prof + mod + bonus('spell-save-dc'),
                attack: S.prof + mod + bonus('spell-attacks'),
                rules, isPact: def.name === 'Warlock',
            };
        }).filter(Boolean);
        // spell slots: a single caster uses its own table, several use the multiclass table; warlocks have pact slots
        const normal = S.casting.filter((c) => !c.isPact);
        let slots = [];
        if (normal.length === 1) slots = arr(arr(normal[0].rules.levelSpellSlots)[normal[0].cls.level]);
        else if (normal.length > 1) {
            const cl = sum(normal.map((c) => { const div = c.rules.multiClassSpellSlotDivisor || 1, l = c.cls.level / div; return c.rules.multiClassSpellSlotRounding === 2 ? Math.ceil(l) : Math.floor(l); }));
            slots = arr(arr(R.multiClassSpellSlots)[Math.min(cl, 20)]);
        }
        S.slots = slots.map((n, i) => ({ level: i + 1, max: n, used: ((arr(C.spellSlots)[i]) || {}).used || 0 })).filter((s) => s.max);
        const pact = S.casting.find((c) => c.isPact);
        S.pact = [];
        if (pact) arr(arr(pact.rules.levelSpellSlots)[pact.cls.level]).forEach((n, i) => { if (n) S.pact.push({ level: i + 1, max: n, used: ((arr(C.pactMagic)[i]) || {}).used || 0 }); });
    }

    /* ---------- {{ }} tokens in D&D Beyond snippets, e.g. "1d6{{modifier:str#signed}}" ---------- */
    let tokenCtx = {}; // the feature a snippet belongs to (for scalevalue / classlevel)
    function tokenValue(name) {
        const [k, arg] = name.split(':');
        const statId = arg ? (STATS.find((s) => s[2].toLowerCase() === arg.split(',')[0]) || [])[0] : null;
        switch (k) {
            case 'modifier': return statId ? S.mod[statId] : null;
            case 'proficiency': return S.prof;
            case 'characterlevel': return level;
            case 'classlevel': return tokenCtx.cls ? tokenCtx.cls.level : level;
            case 'savedc': return statId ? 8 + S.prof + S.mod[statId] : null;
            case 'spellattack': return statId ? S.prof + S.mod[statId] : null;
            case 'scalevalue': { const s = tokenCtx.scale; return s ? (s.dice && s.dice.diceString ? s.dice.diceString : s.fixedValue) : null; }
            case 'hitpoints': return S.hpMax;
            case 'maxhp': return S.hpMax;
            case 'limiteduse': return tokenCtx.uses ?? null;
            default: return null;
        }
    }
    function tokens(s) {
        if (!S.mod || s.indexOf('{{') < 0) return s;
        return s.replace(/\{\{([^}]+)\}\}/g, (all, body) => {
            let [expr, fmt = ''] = body.split('#');
            let round = '';
            const at = expr.indexOf('@'); if (at >= 0) { round = expr.slice(at + 1); expr = expr.slice(0, at); }
            const dice = { v: null };
            let failed = false;
            const replaced = expr.replace(/[a-z]+(?::[a-z,]+)?/gi, (tok) => {
                const v = tokenValue(tok.toLowerCase());
                if (v == null) { failed = true; return '0'; }
                if (typeof v === 'string' && /d/.test(v)) { dice.v = v; return '0'; }
                return '(' + v + ')';
            });
            if (failed) return '';
            if (dice.v) return dice.v;
            if (!/^[\d\s+\-*/().]+$/.test(replaced)) return '';
            let v; try { v = Function('"use strict";return (' + replaced + ')')(); } catch (e) { return ''; }
            for (const r of round.split(',')) {
                if (r === 'roundup') v = Math.ceil(v); else if (r === 'rounddown') v = Math.floor(v);
                else if (/^min:/.test(r)) v = Math.max(v, +r.slice(4)); else if (/^max:/.test(r)) v = Math.min(v, +r.slice(4));
            }
            v = Math.floor(v);
            return /signed/.test(fmt) ? signed(v) : String(v);
        });
    }
    const snippet = (thing, ctx) => { tokenCtx = ctx || {}; const out = clean(thing.snippet || ''); tokenCtx = {}; return out; };

    /* ---------- dice ---------- */
    let rollMode = store.get('dnd.rollMode', 'normal');
    const rollLog = [];
    function roll(expr, label, d20) {
        const parts = String(expr).replace(/\s+/g, '').replace(/−/g, '-').match(/[+-]?[^+-]+/g) || [];
        let total = 0; const shown = [];
        let nat = null;
        for (const p of parts) {
            const sign = p[0] === '-' ? -1 : 1, body = p.replace(/^[+-]/, '');
            const m = body.match(/^(\d*)d(\d+)$/i);
            if (m) {
                const n = +(m[1] || 1), faces = +m[2];
                if (faces === 20 && n === 1 && d20 && rollMode !== 'normal') {
                    const a = 1 + Math.floor(Math.random() * 20), b = 1 + Math.floor(Math.random() * 20);
                    const keep = rollMode === 'adv' ? Math.max(a, b) : Math.min(a, b);
                    nat = keep; total += sign * keep; shown.push(`d20 [${a}, ${b}] → ${keep}`);
                } else {
                    const rolls = Array.from({ length: Math.min(n, 100) }, () => 1 + Math.floor(Math.random() * faces));
                    if (faces === 20 && n === 1) nat = rolls[0];
                    total += sign * sum(rolls); shown.push((sign < 0 ? '−' : '') + `${n}d${faces} [${rolls.join(', ')}]`);
                }
            } else if (/^\d+$/.test(body)) { total += sign * +body; shown.push((sign < 0 ? '− ' : '+ ') + body); }
        }
        const mode = d20 && rollMode !== 'normal' ? (rollMode === 'adv' ? ' (advantage)' : ' (disadvantage)') : '';
        const crit = nat === 20 ? ' · natural 20!' : nat === 1 ? ' · natural 1' : '';
        const line = `${label}${mode}: ${total}${crit}`;
        toast(line + '  —  ' + shown.join(' '), nat === 20 ? 'ok' : nat === 1 ? 'err' : 'note', 5000);
        rollLog.unshift({ t: Date.now(), line, detail: shown.join(' ') });
        rollLog.length = Math.min(rollLog.length, 50);
    }
    const rollBtn = (expr, label, shownText, d20) => `<button type="button" class="roll" data-roll="${esc(expr)}" data-label="${esc(label)}"${d20 ? ' data-d20="1"' : ''} title="Roll ${esc(expr)}">${esc(shownText ?? expr)}</button>`;
    const d20 = (bonusN, label) => rollBtn('1d20' + (bonusN ? signed(bonusN).replace('−', '-') : ''), label, signed(bonusN), true);
    const dmg = (dice, modN, label) => {
        const e = (dice || '') + (modN ? (modN > 0 ? '+' : '-') + Math.abs(modN) : '');
        return e ? rollBtn(e || '0', label, e.replace('-', '−')) : '';
    };

    /* ---------- render ---------- */
    const sheet = $('#sheet');
    const sections = []; // [id, title] for the jump links
    const card = (id, title, body, count, cls = '') => {
        if (!body) return '';
        if (id) sections.push([id, title]);
        return `<section class="card ${cls}" id="${id || ''}"><h2>${esc(title)}${count != null && count !== '' ? `<span class="n">${count}</span>` : ''}</h2>${body}</section>`;
    };
    const kv = (rows) => { const r = rows.filter((x) => x && x[1] !== null && x[1] !== undefined && x[1] !== ''); return r.length ? `<div class="kv">${r.map(([k, v]) => `<span>${esc(k)}</span><span>${v}</span>`).join('')}</div>` : ''; };
    const pips = (max, used, label, kind = '') => max ? `<span class="pips ${kind}" title="${esc(label || '')}${used} of ${max} used">${Array.from({ length: Math.min(max, 30) }, (_, i) => `<i class="${i < used ? 'used' : ''}"></i>`).join('')}</span>` : '';
    const badge = (t, c = '') => (t ? `<span class="badge ${c}">${esc(t)}</span>` : '');

    // details drawer content, keyed so clicks can find them
    const details = new Map(); let detailN = 0;
    const detail = (title, sub, body) => { const k = 'd' + ++detailN; details.set(k, { title, sub, body }); return k; };
    const source = (sources) => arr(sources).map((s) => { const src = byId(R.sources, s.sourceId); return src ? (src.description || src.name) + (s.pageNumber ? ', p. ' + s.pageNumber : '') : ''; }).filter(Boolean).join(' · ');
    const activation = (a) => { if (!a || !a.activationType) return ''; const n = nameOf(R.activationTypes, a.activationType); return (a.activationTime && a.activationTime > 1 ? a.activationTime + ' ' : '') + (n || ''); };
    const resetName = (id) => nameOf(R.limitedUseResetTypes, id);
    const limitedMax = (lu) => {
        if (!lu) return 0;
        let max = lu.maxUses || 0;
        if (lu.statModifierUsesId) max = lu.operator === 2 ? max * S.mod[lu.statModifierUsesId] : max + S.mod[lu.statModifierUsesId];
        if (lu.useProficiencyBonus) max = lu.proficiencyBonusOperator === 2 ? (max || 1) * S.prof : max + S.prof;
        return Math.max(max, lu.maxUses || lu.statModifierUsesId || lu.useProficiencyBonus ? 1 : 0);
    };

    function hero() {
        const d = C.decorations || {};
        const cls = arr(C.classes).map((c) => `${c.definition.name} ${c.level}${c.subclassDefinition ? ' · ' + c.subclassDefinition.name : ''}`).join(' / ');
        const align = nameOf(R.alignments, C.alignmentId);
        const xpRow = arr(R.levelExperiencePoints);
        const next = xpRow[Math.min(level, 19)], cur = xpRow[level - 1] || 0;
        const xp = C.currentXp || 0;
        const xpBar = level < 20 && next ? `<div class="xp" title="${num(xp)} / ${num(next)} XP"><div class="progress"><i style="width:${Math.max(0, Math.min(100, ((xp - cur) / (next - cur)) * 100)).toFixed(1)}%"></i></div><small>${num(xp)} XP · ${num(Math.max(0, next - xp))} to level ${level + 1}</small></div>` : `<small class="muted">${num(xp)} XP</small>`;
        const updated = C.dateModified ? Date.parse(C.dateModified) : 0;
        return `<div class="hero">
            ${d.avatarUrl ? `<img class="avatar" src="${esc(d.avatarUrl)}" width="112" height="112" alt="" referrerpolicy="no-referrer">` : ''}
            <div class="hero-main">
                <h1 class="page-title">${esc(C.name || 'Unnamed')}</h1>
                <p class="page-lede">${esc([C.race && C.race.fullName, cls].filter(Boolean).join(' · '))}</p>
                <div class="badges">${badge('Level ' + level, 'g')}${badge(align)}${badge(S.size)}${C.inspiration ? badge('Inspiration', 'p') : ''}${C.background && C.background.definition ? badge(C.background.definition.name) : C.background && C.background.customBackground && C.background.customBackground.name ? badge(C.background.customBackground.name) : ''}${C.campaign ? badge(C.campaign.name, 'b') : ''}</div>
                ${xpBar}
            </div>
            <div class="hero-side">
                <a class="btn small" href="/games/dnd/characters/">All characters</a>
                <a class="btn small" href="${esc(C.readonlyUrl || DDB + '/characters/' + C.id)}" target="_blank" rel="noopener noreferrer">Open on D&amp;D Beyond</a>
                <button class="btn small" type="button" data-act="share">Copy link</button>
                <small class="muted">${updated ? `Edited <span title="${esc(new Date(updated).toLocaleString())}">${esc(ago(updated))}</span> · ` : ''}by ${esc(C.username || '?')}<br>Fetched <span title="${esc(new Date(P.fetched * 1000).toLocaleString())}">${esc(ago(P.fetched * 1000))}</span>${P.stale ? ' (D&amp;D Beyond didn\'t answer, showing the last copy)' : ''}</small>
            </div>
        </div>`;
    }

    function toolbar() {
        const list = arr(P.list);
        const opts = list.map((c) => `<option value="${esc(c.id)}"${c.id === P.id ? ' selected' : ''}>${esc(c.name)}${c.summary ? ' — ' + esc(c.summary) : ''}</option>`).join('');
        const extra = C && !list.some((c) => c.id === P.id) ? `<option value="${esc(P.id)}" selected>${esc(C.name)}</option>` : '';
        return `<div class="bar dnd-bar">
            ${list.length > 1 || extra ? `<label class="sr" for="dnd-pick">Character</label><select id="dnd-pick" class="field">${extra}${opts}</select>` : ''}
            <form class="dnd-open" data-act="open"><label class="sr" for="dnd-id">D&amp;D Beyond link or ID</label><input id="dnd-id" class="field" placeholder="D&amp;D Beyond link or ID" inputmode="url" autocomplete="off"><button class="btn small" type="submit">Open</button></form>
            ${C ? `<label class="sr" for="dnd-q">Search the sheet</label><input id="dnd-q" class="field grow" type="search" placeholder="Search features, items, spells…  ( / )" autocomplete="off">
            <span class="rollmode" role="group" aria-label="d20 rolls">${['normal', 'adv', 'dis'].map((m) => `<button type="button" data-mode="${m}" class="${rollMode === m ? 'on' : ''}" title="${{ normal: 'Normal d20 rolls', adv: 'Roll d20s with advantage', dis: 'Roll d20s with disadvantage' }[m]}">${{ normal: 'd20', adv: 'Adv', dis: 'Dis' }[m]}</button>`).join('')}</span>
            <button class="btn small" type="button" data-act="log">Roll log</button>` : ''}
        </div>
        ${C ? `<div class="chips" aria-label="Key numbers">
            <span title="${esc(S.acParts.join(' · '))}"><b>${S.ac}</b> AC</span>
            <span><b>${S.hp}${S.temp ? '+' + S.temp : ''}</b>/${S.hpMax} HP</span>
            <span><b>${d20(S.init, 'Initiative')}</b> Init</span>
            <span><b>${ft(S.speeds.Walk)}</b> Speed</span>
            <span><b>${signed(S.prof)}</b> Prof</span>
            <span><b>${S.passive.Perception}</b> Passive Perc.</span>
        </div>` : ''}`;
    }

    function combat() {
        const hpPct = S.hpMax ? Math.min(100, (S.hp / S.hpMax) * 100) : 0;
        const ds = C.deathSaves || {};
        const hitDice = arr(C.classes).map((c) => `<span>${c.level - (c.hitDiceUsed || 0)}/${c.level} ${rollBtn('1d' + c.definition.hitDice + (S.mod[3] ? signed(S.mod[3]).replace('−', '-') : ''), 'Hit die (' + c.definition.name + ')', 'd' + c.definition.hitDice)}</span>`).join(' ');
        const cond = arr(C.conditions).map((c) => { const def = (byId(R.conditions, c.id) || {}).definition || {}; const k = detail(def.name || 'Condition', c.level ? 'Level ' + c.level : '', clean(def.description)); return `<button class="badge r" data-detail="${k}">${esc(def.name || 'Condition')}${c.level ? ' ' + c.level : ''}</button>`; }).join(' ');
        const tiles = `<div class="tiles">
            <div class="tile" title="${esc(S.acParts.join(' · '))}"><b>${S.ac}</b><span>Armor class</span></div>
            <div class="tile"><b>${S.hp}<small>/${S.hpMax}</small></b><span>Hit points${S.temp ? ' · ' + S.temp + ' temp' : ''}</span><div class="progress hp"><i style="width:${hpPct.toFixed(1)}%"></i></div></div>
            <div class="tile"><b>${d20(S.init, 'Initiative')}</b><span>Initiative${S.initNotes.length ? ' · ' + esc(S.initNotes.join(', ')) : ''}</span></div>
            <div class="tile"><b>${signed(S.prof)}</b><span>Proficiency bonus</span></div>
            ${Object.entries(S.speeds).map(([k, v]) => `<div class="tile"><b>${v}<small> ft.</small></b><span>${esc(k)} speed</span></div>`).join('')}
            ${Object.entries(S.passive).map(([k, v]) => `<div class="tile"><b>${v}</b><span>Passive ${esc(k)}</span></div>`).join('')}
        </div>`;
        const rows = kv([
            ['AC from', esc(S.acParts.join(' · '))],
            ['Hit dice', hitDice],
            ['Death saves', ds.successCount || ds.failCount || ds.isStabilized ? `${pips(R.maxDeathsavesSuccess || 3, ds.successCount || 0, 'Successes: ', 'mark ok')} successes · ${pips(R.maxDeathsavesFail || 3, ds.failCount || 0, 'Failures: ', 'mark bad')} failures${ds.isStabilized ? ' · stabilised' : ''}` : ''],
            ['Senses', Object.entries(S.senses).map(([k, v]) => esc(k) + ' ' + ft(v)).join(', ')],
            ['Conditions', cond],
            ...Object.entries(S.defenses).map(([k, v]) => [k, esc(v.join(', '))]),
        ]);
        return card('combat', 'Combat', tiles + (rows ? '<div class="sep"></div>' + rows : ''));
    }

    function abilities() {
        const tiles = STATS.map(([id, nm, key]) => {
            const p = S.scoreParts[id];
            const why = p.over ? 'Overridden' : `Base ${p.base}${p.extra ? ' + ' + p.extra : ''}${p.capped ? ' + ' + p.capped + ' bonuses' : ''}${p.items ? ' + ' + p.items + ' items' : ''}`;
            const sv = S.saves[id - 1];
            const k = detail(R.stats && byId(R.stats, id) ? byId(R.stats, id).name : nm, 'Score ' + S.score[id], clean((byId(R.stats, id) || {}).compendiumText));
            return `<div class="abil" data-s="${esc(nm + ' ' + key)}">
                <button class="abil-key" data-detail="${k}">${key}</button>
                <b>${rollBtn('1d20' + (S.check[id] ? signed(S.check[id]).replace('−', '-') : ''), nm[0].toUpperCase() + nm.slice(1) + ' check', signed(S.mod[id]), true)}</b>
                <span class="muted" title="${esc(why)}">${S.score[id]}</span>
                <span class="save${sv.prof ? ' prof' : ''}" title="${esc(sv.notes.join('; '))}"><i class="dot${sv.prof ? ' on' : ''}" aria-label="${sv.prof ? 'Proficient' : 'Not proficient'}"></i>Save ${d20(sv.total, key + ' save')}${sv.notes.length ? ' <em>' + (sv.notes.some((n) => /^Adv/.test(n)) ? 'A' : '') + (sv.notes.some((n) => /^Dis/.test(n)) ? 'D' : '') + '</em>' : ''}</span>
            </div>`;
        }).join('');
        const notes = [...S.saves.flatMap((s) => s.notes.map((n) => `${s.key}: ${n}`)), ...S.saveNotes];
        return card('abilities', 'Abilities and saves', `<div class="abils">${tiles}</div>${notes.length ? `<p class="small muted">${esc(notes.join(' · '))}</p>` : ''}`);
    }

    function skills() {
        const lvlName = ['', 'Half proficient', 'Proficient', 'Expertise'];
        const rows = S.skills.map((s) => {
            const k = detail(s.name, statKey(s.stat) + ' · ' + signed(s.total) + (s.lvl ? ' · ' + (lvlName[Math.ceil(s.lvl)] || '') : ''), clean(s.description) + (s.notes.length ? `<p class="note">${esc(s.notes.join('; '))}</p>` : ''));
            return `<div class="rowi" data-s="${esc(s.name + ' ' + statKey(s.stat))}">
                <i class="dot l${Math.floor(s.lvl)}" title="${esc(lvlName[Math.floor(s.lvl)] || 'Not proficient')}"></i>
                <button class="grow link" data-detail="${k}">${esc(s.name)}${s.custom ? ' <small>custom</small>' : ''}</button>
                <small>${statKey(s.stat)}</small>
                ${s.notes.length ? `<small title="${esc(s.notes.join('; '))}">${s.notes.some((n) => /^Adv/.test(n)) ? 'A' : ''}${s.notes.some((n) => /^Dis/.test(n)) ? 'D' : ''}</small>` : ''}
                ${d20(s.total, s.name)}
            </div>`;
        }).join('');
        return card('skills', 'Skills', `<div class="rows two">${rows}</div>`, S.skills.filter((s) => s.lvl >= 2).length + ' proficient');
    }

    function profs() {
        const body = kv(Object.entries(S.profs).map(([k, v]) => [k, esc(v.join(', '))]))
            + (S.advantages.length ? `<div class="sep"></div><ul class="plain">${S.advantages.map((a) => `<li data-s="${esc(a)}">${esc(a)}</li>`).join('')}</ul>` : '');
        return card('proficiencies', 'Proficiencies and languages', body);
    }

    // weapons, attack actions, unarmed strike and custom actions as one attack table
    function attacks() {
        const out = [];
        const weaponProf = (d) => S.profSet.has(d.categoryId === 1 ? 'simple-weapons' : d.categoryId === 2 ? 'martial-weapons' : '') || S.profSet.has(slug(d.type || d.name)) || S.profSet.has(slug(d.name));
        for (const it of S.inv) {
            const d = it.definition || {};
            if (d.filterType !== 'Weapon' && !d.damage) continue;
            if (!it.equipped && !it.displayAsAttack) continue;
            const props = arr(d.properties).map((p) => p.name);
            const finesse = props.includes('Finesse'), ranged = d.attackType === 2;
            const isMonk = arr(C.classes).some((c) => c.definition.name === 'Monk') && d.isMonkWeapon;
            const stat = (finesse || isMonk) ? (S.mod[1] >= S.mod[2] ? 1 : 2) : ranged ? 2 : 1;
            const magic = sum(arr(d.grantedModifiers).filter((m) => m.type === 'bonus' && m.subType === 'magic').map((m) => +(m.value ?? m.fixedValue) || 0));
            const profOver = cv(17, it.id);
            const prof = profOver ? !!profOver.value : weaponProf(d);
            const hitOver = cvNum(13, it.id);
            const hit = hitOver ?? S.mod[stat] + (prof ? S.prof : 0) + magic + bonus('weapon-attacks') + bonus(ranged ? 'ranged-weapon-attacks' : 'melee-weapon-attacks') + (cvNum(12, it.id) || 0);
            const dmgBonus = S.mod[stat] + magic + bonus('weapon-damage') + bonus(ranged ? 'ranged-weapon-damage' : 'melee-weapon-damage') + (cvNum(10, it.id) || 0);
            const versatile = arr(d.properties).find((p) => p.name === 'Versatile');
            const reach = (R.baseWeaponReach || 5) + (props.includes('Reach') ? 5 : 0);
            const range = ranged ? `${d.range}/${d.longRange} ft.` : props.includes('Thrown') ? `${reach} ft. · thrown ${d.range}/${d.longRange}` : `${reach} ft.`;
            const name = (cv(8, it.id) || {}).value || d.name;
            const k = detail(name, [d.type, d.rarity, props.join(', ')].filter(Boolean).join(' · '), clean(d.description) + (prof ? '' : '<p class="note">Not proficient: no proficiency bonus on the attack.</p>'));
            out.push({ name, k, range, hit: d20(hit, name + ' to hit'), dmg: dmg(d.damage && d.damage.diceString, dmgBonus, name + ' damage') + ' ' + esc(d.damageType || '') + (versatile && versatile.notes ? ' · two-handed ' + dmg(versatile.notes, dmgBonus, name + ' two-handed damage') : ''), notes: [it.quantity > 1 ? '×' + it.quantity : '', props.join(', '), prof ? '' : 'not proficient'].filter(Boolean).join(' · ') });
        }
        const maFeat = Object.values(featureById).find((f) => f.name === 'Martial Arts' && featureLevel[f.id].req <= featureLevel[f.id].have);
        const maDie = maFeat && scaleById[maFeat.id] && scaleById[maFeat.id].dice ? scaleById[maFeat.id].dice.diceString : null;
        for (const [src, list] of Object.entries(C.actions || {})) for (const a of arr(list)) {
            if (!a.displayAsAttack) continue;
            const ma = a.isMartialArts && maDie;
            const stat = ma && (!a.abilityModifierStatId || a.abilityModifierStatId <= 2) ? (S.mod[2] > S.mod[1] ? 2 : 1) : a.abilityModifierStatId;
            const mod = stat ? S.mod[stat] : 0;
            const ctx = ctxFor(a);
            const hit = a.fixedToHit ?? (mod + (a.isProficient ? S.prof : 0));
            const save = a.saveStatId ? `DC ${a.fixedSaveDc || 8 + S.prof + mod} ${statKey(a.saveStatId)}` : '';
            const k = detail(a.name, source(ctx.sources), clean(tokensIn(a.description, ctx)));
            const dice = a.dice ? (a.dice.diceString || (a.dice.fixedValue != null ? String(a.dice.fixedValue) : '')) : ma && a.actionType === 1 ? maDie : '';
            const isAttack = a.actionType === 1 || a.saveStatId;
            out.push({ name: a.name, k, range: a.range && a.range.range ? ft(a.range.range) + (a.range.longRange ? '/' + a.range.longRange : '') : a.attackTypeRange === 2 ? 'Ranged' : '5 ft.', hit: save ? esc(save) : isAttack ? d20(hit, a.name + ' to hit') : '', dmg: !isAttack && dice ? rollBtn(dice.replace(/s+/g, ''), a.name, dice) : dice ? dmg(dice, ma && !a.dice ? mod : a.value != null ? +a.value : mod, a.name + ' damage') + ' ' + esc(nameOf(R.damageTypes, a.damageTypeId)) : '', notes: activation(a.activation) });
        }
        if (C.preferences && C.preferences.showUnarmedStrike && !Object.values(C.actions || {}).flat().some((a) => a && /^Unarmed Strike/.test(a.name))) {
            const ua = arr(R.naturalActions)[0];
            const k = detail('Unarmed Strike', '', clean(ua && ua.description));
            out.push({ name: 'Unarmed Strike', k, range: '5 ft.', hit: d20(S.mod[1] + S.prof, 'Unarmed strike to hit'), dmg: rollBtn(String(Math.max(1, 1 + S.mod[1])), 'Unarmed strike damage', String(Math.max(1, 1 + S.mod[1]))) + ' Bludgeoning', notes: '' });
        }
        for (const a of arr(C.customActions)) {
            const mod = a.statId ? S.mod[a.statId] : 0;
            const hit = a.toHitBonus != null || a.isProficient != null ? mod + (a.isProficient ? S.prof : 0) + (a.toHitBonus || 0) : null;
            const dice = a.diceCount && a.diceType ? a.diceCount + 'd' + a.diceType : a.fixedValue != null ? String(a.fixedValue) : '';
            const k = detail(a.name, 'Custom action', clean(a.description || a.snippet));
            out.push({ name: a.name, k, range: a.range ? ft(a.range) + (a.longRange ? '/' + a.longRange : '') : '', hit: a.saveStatId ? 'DC ' + (a.fixedSaveDc || 8 + S.prof + mod) + ' ' + statKey(a.saveStatId) : hit != null ? d20(hit, a.name + ' to hit') : '', dmg: dice ? dmg(dice, (a.damageBonus || 0) + (a.statId ? mod : 0), a.name + ' damage') + ' ' + esc(nameOf(R.damageTypes, a.damageTypeId)) : '', notes: 'custom' });
        }
        if (!out.length) return '';
        const rows = out.map((a) => `<tr data-s="${esc(a.name + ' ' + a.notes)}"><td><button class="link" data-detail="${a.k}">${esc(a.name)}</button>${a.notes ? `<small>${esc(a.notes)}</small>` : ''}</td><td>${esc(a.range)}</td><td>${a.hit}</td><td>${a.dmg}</td></tr>`).join('');
        return card('attacks', 'Attacks', `<div class="tbl"><table><thead><tr><th>Attack</th><th>Range</th><th>Hit / DC</th><th>Damage</th></tr></thead><tbody>${rows}</tbody></table></div><p class="small muted">Click a bonus or damage to roll it. Shift-click rolls with advantage, Alt-click with disadvantage.</p>`, out.length);
    }

    // which feature/trait/feat an action or option came from, for tokens and sources
    function ctxFor(a) {
        const f = featureById[a.componentId];
        if (f) return { cls: (featureLevel[a.componentId] || {}).cls, scale: scaleById[a.componentId], sources: f.sources, uses: limitedMax(a.limitedUse) };
        const rt = arr(C.race && C.race.racialTraits).find((t) => t.definition && t.definition.id === a.componentId);
        if (rt) return { sources: rt.definition.sources, uses: limitedMax(a.limitedUse) };
        return { uses: limitedMax(a.limitedUse) };
    }
    const tokensIn = (s, ctx) => { tokenCtx = ctx || {}; const o = s ? tokens(s) : ''; tokenCtx = {}; return o; };

    function actions() {
        const groups = new Map();
        for (const [src, list] of Object.entries(C.actions || {})) for (const a of arr(list)) {
            const g = nameOf(R.activationTypes, a.activation && a.activation.activationType) || 'Other';
            if (!groups.has(g)) groups.set(g, []);
            groups.get(g).push(a);
        }
        let total = 0;
        const order = ['Action', 'Bonus Action', 'Reaction', 'No Action', 'Minute', 'Hour', 'Special', 'Other'];
        const body = [...groups.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0])).map(([g, list]) => `<h3>${esc(g)}</h3><div class="rows">${list.map((a) => {
            total++;
            const ctx = ctxFor(a);
            const max = limitedMax(a.limitedUse);
            const k = detail(a.name, [g, max ? `${max} use${max === 1 ? '' : 's'} per ${resetName(a.limitedUse.resetType) || 'rest'}` : '', source(ctx.sources)].filter(Boolean).join(' · '), clean(tokensIn(a.description, ctx)));
            return `<div class="rowi feat" data-s="${esc(a.name + ' ' + text(a.snippet))}"><div class="grow"><button class="link" data-detail="${k}">${esc(a.name)}</button>${a.snippet ? `<div class="snip">${snippet(a, ctx)}</div>` : ''}</div>${max ? `<span class="uses">${pips(max, a.limitedUse.numberUsed || 0)}<small>${esc(resetName(a.limitedUse.resetType) || '')}</small></span>` : ''}</div>`;
        }).join('')}</div>`).join('');
        const basic = arr(R.basicActions).map((b) => { const k = detail(b.name, 'Basic action', clean(b.description)); return `<button class="badge" data-detail="${k}" data-s="${esc(b.name)}">${esc(b.name)}</button>`; }).join(' ');
        return card('actions', 'Actions', body + (basic ? `<details class="more"><summary>Basic actions everyone has</summary><div class="badges">${basic}</div></details>` : ''), total);
    }

    function spells() {
        const all = [];
        const push = (list, from, castingFor) => { for (const sp of arr(list)) if (sp && sp.definition) all.push({ sp, from, casting: castingFor }); };
        for (const cs of arr(C.classSpells)) {
            const cl = arr(C.classes).find((c) => c.id === cs.characterClassId);
            push(cs.spells, cl ? cl.definition.name : 'Class', S.casting.find((c) => c.cls === cl));
        }
        for (const [k, list] of Object.entries(C.spells || {})) push(list, { race: 'Species', class: 'Class feature', background: 'Background', item: 'Item', feat: 'Feat' }[k] || k, null);
        if (!all.length && !S.casting.length) return '';
        const head = S.casting.map((c) => `<div class="tile"><b>${c.dc}</b><span>${esc(c.name)} save DC · ${statKey(c.ability)}</span></div><div class="tile"><b>${d20(c.attack, c.name + ' spell attack')}</b><span>${esc(c.name)} spell attack</span></div>`).join('');
        const slots = [...S.slots.map((s) => ['Level ' + s.level, s]), ...S.pact.map((s) => ['Pact level ' + s.level, s])].map(([n, s]) => `<span class="slot">${esc(n)} ${pips(s.max, s.used)}</span>`).join('');
        const byLevel = new Map();
        for (const x of all) { const l = x.sp.definition.level || 0; if (!byLevel.has(l)) byLevel.set(l, []); byLevel.get(l).push(x); }
        const comp = (ids) => arr(ids).map((i) => (byId(R.spellComponents, i) || {}).shortName).filter(Boolean).join(', ');
        const dur = (d) => !d ? '' : d.durationType === 'Instantaneous' || d.durationType === 'Special' ? d.durationType : d.durationInterval ? `${d.durationInterval} ${d.durationUnit}${d.durationInterval > 1 ? 's' : ''}` : d.durationType || '';
        const rng = (r) => !r ? '' : (r.origin || '') + (r.rangeValue ? ' ' + r.rangeValue + ' ft.' : '') + (r.aoeType ? ' (' + (r.aoeValue || '') + ' ft. ' + r.aoeType + ')' : '');
        const body = [...byLevel.entries()].sort((a, b) => a[0] - b[0]).map(([l, list]) => `<h3>${l ? 'Level ' + l : 'Cantrips'} <small class="muted">${list.length}</small></h3><div class="rows">${list.sort((a, b) => a.sp.definition.name.localeCompare(b.sp.definition.name)).map(({ sp, from, casting }) => {
            const d = sp.definition;
            const ab = sp.spellCastingAbilityId || (casting && casting.ability);
            const dc = sp.overrideSaveDc || (ab ? 8 + S.prof + S.mod[ab] + bonus('spell-save-dc') : null);
            const hit = ab ? S.prof + S.mod[ab] + bonus('spell-attacks') : null;
            const effect = d.requiresSavingThrow && d.saveDcAbilityId ? `DC ${dc} ${statKey(d.saveDcAbilityId)}` : d.requiresAttackRoll && hit != null ? d20(hit, d.name + ' spell attack') : '';
            const tags = [sp.alwaysPrepared ? 'always prepared' : sp.prepared ? 'prepared' : '', d.concentration ? 'concentration' : '', d.ritual ? 'ritual' : '', sp.limitedUse ? `${limitedMax(sp.limitedUse)}/${resetName(sp.limitedUse.resetType) || 'rest'}` : ''].filter(Boolean);
            const sub = [d.school, activation(sp.activation || d.activation), rng(sp.range || d.range), comp(d.components), dur(d.duration), from].filter(Boolean).join(' · ');
            const k = detail(d.name, (l ? 'Level ' + l + ' ' : 'Cantrip · ') + sub, clean(d.description) + (d.componentsDescription ? `<p class="muted">Material: ${esc(d.componentsDescription)}</p>` : '') + (d.atHigherLevels && d.atHigherLevels.higherLevelDefinitions ? '' : ''));
            return `<div class="rowi feat${!l || sp.prepared || sp.alwaysPrepared || !(casting && casting.cls.definition.spellPrepareType) ? '' : ' dim'}" data-s="${esc(d.name + ' ' + sub + ' ' + tags.join(' '))}"><div class="grow"><button class="link" data-detail="${k}">${esc(d.name)}</button> ${tags.map((t) => badge(t)).join(' ')}<div class="snip muted">${esc(sub)}</div></div>${effect ? `<span>${effect}</span>` : ''}</div>`;
        }).join('')}</div>`).join('');
        return card('spells', 'Spells', (head ? `<div class="tiles">${head}</div>` : '') + (slots ? `<p class="slots">${slots}</p>` : '') + body, all.length);
    }

    function features() {
        const parts = [];
        let total = 0;
        const choiceLabel = (componentId, group) => {
            const out = [];
            for (const k of group ? [group] : ['race', 'class', 'background', 'feat', 'item']) for (const ch of arr(C.choices && C.choices[k])) {
                if (ch.componentId !== componentId || ch.optionValue == null) continue;
                const def = arr(C.choices.choiceDefinitions).find((cd) => cd.id === `${ch.componentTypeId}-${ch.type}`);
                const opt = def && arr(def.options).find((o) => o.id === ch.optionValue);
                const optLabel = opt ? opt.label : (arr(ch.options).find((o) => o.id === ch.optionValue) || {}).label;
                if (optLabel && optLabel !== featureById[componentId]?.name && !(C.race && arr(C.race.racialTraits).some((t) => t.definition.id === componentId && t.definition.name === optLabel))) out.push((ch.label ? ch.label.replace(/^Choose (an? )?/i, '') + ': ' : '') + optLabel);
            }
            return out;
        };
        const featRow = (name, sub, desc, snip, ctx, id, group) => {
            total++;
            const chosen = id ? choiceLabel(id, group).filter((c) => c !== name) : [];
            const k = detail(name, sub, clean(tokensIn(desc, ctx)) + (chosen.length ? `<p class="note">${esc(chosen.join(' · '))}</p>` : ''));
            const s = snip ? clean(tokensIn(snip, ctx)) : '';
            return `<div class="rowi feat" data-s="${esc(name + ' ' + text(snip || '') + ' ' + chosen.join(' '))}"><div class="grow"><button class="link" data-detail="${k}">${esc(name)}</button>${chosen.length ? ' ' + chosen.map((c) => badge(c)).join(' ') : ''}${s ? `<div class="snip">${s}</div>` : ''}</div>${/^Level \d/.test(sub || '') ? `<small>${esc(sub.split(' · ')[0])}</small>` : ''}</div>`;
        };
        for (const cl of arr(C.classes)) {
            const owned = arr(cl.classFeatures).filter((f) => (f.definition.requiredLevel || 1) <= cl.level && !f.definition.hideInSheet)
                .sort((a, b) => (a.definition.requiredLevel || 0) - (b.definition.requiredLevel || 0) || (a.definition.displayOrder || 0) - (b.definition.displayOrder || 0));
            const rows = owned.map((f) => featRow(f.definition.name, 'Level ' + (f.definition.requiredLevel || 1) + ' · ' + (source(f.definition.sources) || ''), f.definition.description, f.definition.snippet, { cls: cl, scale: f.levelScale, sources: f.definition.sources }, f.definition.id, 'class')).join('');
            const opt = arr(C.optionalClassFeatures).length ? `<p class="small muted">Optional class features: ${esc(arr(C.optionalClassFeatures).map((o) => o.classFeatureId).join(', '))}</p>` : '';
            parts.push(`<h3>${esc(cl.definition.name)} ${cl.level}${cl.subclassDefinition ? ' · ' + esc(cl.subclassDefinition.name) : ''}</h3><div class="rows">${rows}</div>${opt}`);
        }
        const race = C.race || {};
        const traits = arr(race.racialTraits).filter((t) => t.definition && !t.definition.hideInSheet);
        if (traits.length) parts.push(`<h3>${esc(race.fullName || 'Species')} traits</h3><div class="rows">${traits.map((t) => featRow(t.definition.name, source(t.definition.sources), t.definition.description, t.definition.snippet, { sources: t.definition.sources }, t.definition.id, 'race')).join('')}</div>`);
        const bg = C.background && (C.background.definition || C.background.customBackground);
        if (bg && (bg.featureName || bg.featureDescription)) parts.push(`<h3>Background: ${esc(bg.name || '')}</h3><div class="rows">${featRow(bg.featureName || 'Feature', source(bg.sources), bg.featureDescription, '', {}, bg.id, 'background')}</div>`);
        const feats = arr(C.feats).filter((f) => f.definition);
        if (feats.length) parts.push(`<h3>Feats</h3><div class="rows">${feats.map((f) => featRow(f.definition.name, (arr(f.definition.prerequisites).map((p) => p.description).join(', ') || 'Feat') + ' · ' + source(f.definition.sources), f.definition.description, f.definition.snippet, { sources: f.definition.sources }, f.definition.id, 'feat')).join('')}</div>`);
        const options = [];
        for (const [k, list] of Object.entries(C.options || {})) for (const o of arr(list)) if (o && o.definition) options.push(featRow(o.definition.name, { race: 'Species option', class: 'Class option', background: 'Background option', item: 'Item option', feat: 'Feat option' }[k] || 'Option', o.definition.description, o.definition.snippet, {}, o.componentId, k));
        if (options.length) parts.push(`<h3>Chosen options</h3><div class="rows">${options.join('')}</div>`);
        return card('features', 'Features and traits', parts.join(''), total);
    }

    function inventory() {
        const items = S.inv;
        const byContainer = new Map();
        for (const it of items) { const k = it.containerEntityId === C.id ? 'self' : it.containerEntityId; if (!byContainer.has(k)) byContainer.set(k, []); byContainer.get(k).push(it); }
        const row = (it, depth) => {
            const d = it.definition || {};
            const kids = byContainer.get(it.id) || [];
            const flags = [it.equipped ? 'equipped' : '', it.isAttuned ? 'attuned' : d.canAttune ? 'needs attunement' : '', d.magic ? d.rarity : '', d.isConsumable ? 'consumable' : ''].filter(Boolean);
            const name = (cv(8, it.id) || {}).value || d.name;
            const w = S.itemWeight(it);
            const lu = it.limitedUse;
            const k = detail(name, [d.type || d.filterType, d.rarity, d.cost ? num(d.cost) + ' gp' : '', w ? num(w, 2) + ' lb.' : ''].filter(Boolean).join(' · '),
                clean(d.description) + (d.armorClass ? `<p>AC ${d.armorClass}${d.strengthRequirement ? ' · needs STR ' + d.strengthRequirement : ''}${d.stealthCheck === 2 ? ' · stealth disadvantage' : ''}</p>` : '') + (d.attunementDescription ? `<p class="muted">Attunement: ${esc(d.attunementDescription)}</p>` : '') + (cv(9, it.id) ? `<p class="note">${esc(cv(9, it.id).value)}</p>` : ''));
            const filter = [d.filterType, it.equipped ? 'equipped' : '', d.magic ? 'magic' : ''].join(' ').toLowerCase();
            return `<div class="rowi item" data-s="${esc(name + ' ' + d.type + ' ' + flags.join(' '))}" data-f="${esc(filter)}" style="--depth:${depth}">
                <div class="grow"><button class="link${d.magic ? ' magic' : ''}" data-detail="${k}">${esc(name)}</button>${it.quantity > 1 ? ` <small>×${num(it.quantity)}</small>` : ''} ${flags.map((f) => badge(f, f === 'equipped' ? 'g' : f === 'attuned' ? 'p' : '')).join(' ')}${lu ? ' ' + pips(limitedMax(lu), it.chargesUsed || lu.numberUsed || 0) : ''}</div>
                <small>${w ? num(w, 2) + ' lb.' : ''}</small>
            </div>${kids.map((c) => row(c, depth + 1)).join('')}`;
        };
        const top = (byContainer.get('self') || []).sort((a, b) => (b.equipped - a.equipped) || a.definition.name.localeCompare(b.definition.name));
        const custom = arr(C.customItems).map((c) => { const k = detail(c.name, 'Custom item', (c.description ? `<p>${esc(c.description)}</p>` : '') + (c.notes ? `<p class="note">${esc(c.notes)}</p>` : '')); return `<div class="rowi item" data-s="${esc(c.name)}" data-f="other gear custom"><div class="grow"><button class="link" data-detail="${k}">${esc(c.name)}</button>${c.quantity > 1 ? ` <small>×${c.quantity}</small>` : ''} ${badge('custom')}</div><small>${c.weight ? c.weight + ' lb.' : ''}</small></div>`; }).join('');
        const cur = C.currencies || {};
        const coins = ['pp', 'gp', 'ep', 'sp', 'cp'].map((k) => `<div class="tile"><b>${num(cur[k] || 0)}</b><span>${k.toUpperCase()}</span></div>`).join('');
        const encType = C.preferences && C.preferences.encumbranceType;
        const pct = S.capacity ? Math.min(100, (S.weight / S.capacity) * 100) : 0;
        const enc = encType === 2 ? '' : `<div class="carry"><div class="progress${pct > 100 ? ' over' : ''}"><i style="width:${pct.toFixed(1)}%"></i></div><small>${num(S.weight, 2)} / ${num(S.capacity)} lb. carried${S.coinWeight ? ' (coins ' + num(S.coinWeight, 2) + ' lb.)' : ''} · push, drag or lift ${num(S.capacity * 2)} lb.${encType === 3 ? ` · encumbered over ${num(S.score[1] * 5)}, heavily over ${num(S.score[1] * 10)}` : ''}</small></div>`;
        const filters = ['All', 'Equipped', 'Weapon', 'Armor', 'Gear', 'Magic'].map((f, i) => `<button type="button" data-filter="${f.toLowerCase()}" class="${i ? '' : 'on'}">${f}</button>`).join('');
        const lifestyle = byId(R.lifestyles, C.lifestyleId);
        return card('inventory', 'Inventory', `<div class="tiles coins">${coins}<div class="tile"><b>${num(S.gp, 2)}</b><span>Total in GP</span></div></div>
            ${enc}
            <p class="small muted">${S.attuned}/${S.attuneMax} attuned${lifestyle ? ' · lifestyle: ' + esc(lifestyle.name) + (lifestyle.cost && lifestyle.cost !== '-' ? ' (' + esc(lifestyle.cost) + '/day)' : '') : ''}</p>
            <div class="stabs" role="group" aria-label="Filter items">${filters}</div>
            <div class="rows inv">${top.map((it) => row(it, 0)).join('')}${custom}</div>`, items.length + arr(C.customItems).length + ' items');
    }

    function about() {
        const t = C.traits || {}, n = C.notes || {};
        const look = kv([
            ['Gender', esc(C.gender)], ['Age', esc(C.age)], ['Height', esc(C.height)], ['Weight', C.weight ? esc(C.weight) + ' lb.' : ''],
            ['Hair', esc(C.hair)], ['Eyes', esc(C.eyes)], ['Skin', esc(C.skin)], ['Faith', esc(C.faith)], ['Size', esc(S.size)],
            ['Alignment', esc(nameOf(R.alignments, C.alignmentId))], ['Lifestyle', esc(nameOf(R.lifestyles, C.lifestyleId))], ['Social name', esc(C.socialName)],
        ]);
        const para = (title, v) => (v ? `<h3>${esc(title)}</h3><div class="desc">${clean(String(v).replace(/\n/g, '<br>'))}</div>` : '');
        const personality = para('Personality traits', t.personalityTraits) + para('Ideals', t.ideals) + para('Bonds', t.bonds) + para('Flaws', t.flaws) + para('Appearance', t.appearance);
        const notes = para('Backstory', n.backstory) + para('Allies', n.allies) + para('Organizations', n.organizations) + para('Enemies', n.enemies) + para('Personal possessions', n.personalPossessions) + para('Other holdings', n.otherHoldings) + para('Other notes', n.otherNotes);
        return card('about', 'Appearance and personality', look + personality) + card('notes', 'Notes', notes);
    }

    function origins() {
        const parts = [];
        for (const cl of arr(C.classes)) {
            const d = cl.definition || {}, sub = cl.subclassDefinition;
            const k = detail(d.name, source(d.sources), clean(d.description) + (sub ? `<h3>${esc(sub.name)}</h3>` + clean(sub.description) : ''));
            parts.push(`<div class="origin">${d.avatarUrl ? `<img src="${esc(d.avatarUrl)}" width="56" height="56" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}<div class="grow"><button class="link" data-detail="${k}"><b>${esc(d.name)} ${cl.level}</b></button>${cl.isStartingClass && arr(C.classes).length > 1 ? ' ' + badge('starting class') : ''}
                ${kv([['Subclass', sub ? esc(sub.name) : ''], ['Hit die', 'd' + d.hitDice + ' · ' + (cl.level - (cl.hitDiceUsed || 0)) + ' left'], ['Primary ability', esc(arr(d.primaryAbilities).map(statKey).join(', '))], ['Spellcasting', d.spellCastingAbilityId || (sub && sub.spellCastingAbilityId) ? statKey(d.spellCastingAbilityId || sub.spellCastingAbilityId) : ''], ['Tagline', esc(d.tagline || '')]])}</div></div>`);
        }
        const r = C.race;
        if (r) {
            const k = detail(r.fullName, source(r.sources), clean(r.description));
            parts.push(`<div class="origin">${r.portraitAvatarUrl || r.avatarUrl ? `<img src="${esc(r.portraitAvatarUrl || r.avatarUrl)}" width="56" height="56" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}<div class="grow"><button class="link" data-detail="${k}"><b>${esc(r.fullName)}</b></button>${r.isHomebrew ? ' ' + badge('homebrew') : ''}${r.isLegacy ? ' ' + badge('legacy') : ''}
                ${kv([['Base species', r.isSubRace ? esc(r.baseRaceName) : ''], ['Size', esc(S.size)], ['Speeds', esc(Object.entries(S.speeds).map(([k2, v]) => k2 + ' ' + v + ' ft.').join(', '))], ['About', esc(text(r.cardDescription || ''))]])}</div></div>`);
        }
        const bgw = C.background || {};
        const bg = bgw.definition || bgw.customBackground;
        if (bg && bg.name) {
            const k = detail(bg.name, source(bg.sources), clean(bg.description || bg.shortDescription) + (bg.featureName ? `<h3>${esc(bg.featureName)}</h3>${clean(bg.featureDescription)}` : ''));
            parts.push(`<div class="origin"><div class="grow"><button class="link" data-detail="${k}"><b>${esc(bg.name)}</b></button>${bgw.hasCustomBackground ? ' ' + badge('custom') : ''}
                ${kv([['Skills', esc(text(bg.skillProficienciesDescription || ''))], ['Tools', esc(text(bg.toolProficienciesDescription || ''))], ['Languages', esc(text(bg.languagesDescription || ''))], ['Equipment', esc(text(bg.equipmentDescription || ''))]])}</div></div>`);
        }
        return card('origins', 'Class, species and background', parts.join(''));
    }

    function creatures() {
        const list = arr(C.creatures);
        if (!list.length) return '';
        return card('creatures', 'Creatures', `<div class="rows">${list.map((cr) => {
            const d = cr.definition || {};
            const hpMax = (cvNum(43, cr.id) ?? d.averageHitPoints) || 0;
            const stats = arr(d.stats).map((s) => `${statKey(s.statId)} ${s.value} (${signed(Math.floor((s.value - 10) / 2))})`).join(' · ');
            const body = kv([['AC', esc((cvNum(42, cr.id) ?? d.armorClass) + (d.armorClassDescription ? ' ' + d.armorClassDescription : ''))], ['HP', `${hpMax - (cr.removedHitPoints || 0)}/${hpMax}${d.hitPointDice ? ' (' + esc(d.hitPointDice.diceString) + ')' : ''}`], ['Speed', esc(arr(d.movements).map((m) => nameOf(R.movements, m.movementId) + ' ' + m.speed + ' ft.').join(', '))], ['Abilities', esc(stats)], ['Challenge', esc((byId(R.challengeRatings, d.challengeRatingId) || {}).value ?? '')], ['Type', esc(nameOf(R.monsterTypes, d.typeId))], ['Senses', esc(text(d.sensesHtml || ''))], ['Languages', esc(d.languageDescription || '')]])
                + clean(d.specialTraitsDescription) + (d.actionsDescription ? '<h3>Actions</h3>' + clean(d.actionsDescription) : '') + (d.bonusActionsDescription ? '<h3>Bonus actions</h3>' + clean(d.bonusActionsDescription) : '') + (d.reactionsDescription ? '<h3>Reactions</h3>' + clean(d.reactionsDescription) : '') + (d.legendaryActionsDescription ? '<h3>Legendary actions</h3>' + clean(d.legendaryActionsDescription) : '') + (cr.description ? `<p class="note">${esc(cr.description)}</p>` : '');
            const k = detail(cr.name || d.name, [d.name, cr.isActive ? 'active' : ''].filter(Boolean).join(' · '), body);
            return `<div class="rowi" data-s="${esc((cr.name || '') + ' ' + d.name)}">${d.avatarUrl ? `<img src="${esc(d.avatarUrl)}" width="40" height="40" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}<div class="grow"><button class="link" data-detail="${k}">${esc(cr.name || d.name)}</button> <small>${esc(d.name || '')}</small></div><small>AC ${d.armorClass} · HP ${hpMax - (cr.removedHitPoints || 0)}/${hpMax}</small></div>`;
        }).join('')}</div>`, list.length);
    }

    function campaign() {
        const cp = C.campaign;
        if (!cp) return '';
        const party = arr(cp.characters).map((ch) => `<div class="rowi" data-s="${esc(ch.characterName + ' ' + ch.username)}">${ch.avatarUrl ? `<img src="${esc(ch.avatarUrl)}" width="32" height="32" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}<div class="grow">${ch.privacyType === 3 ? `<a href="?id=${encodeURIComponent(ch.characterId)}">${esc(ch.characterName)}</a>` : esc(ch.characterName)}</div><small>${esc(ch.username || '')}${ch.privacyType !== 3 ? ' · private' : ''}</small></div>`).join('');
        return card('campaign', 'Campaign', kv([['Name', cp.link ? `<a href="${esc(DDB + cp.link)}" target="_blank" rel="noopener noreferrer">${esc(cp.name)}</a>` : esc(cp.name)], ['Dungeon master', esc(cp.dmUsername || '')]]) + (cp.description ? `<div class="desc">${clean(cp.description)}</div>` : '') + (cp.publicNotes ? `<h3>Public notes</h3><div class="desc">${clean(cp.publicNotes)}</div>` : '') + (party ? `<h3>Party</h3><div class="rows">${party}</div>` : ''));
    }

    function settings() {
        const p = C.preferences || {}, cfg = C.configuration || {}, d = C.decorations || {};
        const yes = (v) => (v ? 'Yes' : 'No');
        const sources = arr(C.activeSourceCategories).length;
        const choiceRows = [];
        for (const k of ['race', 'class', 'background', 'feat', 'item']) for (const ch of arr(C.choices && C.choices[k])) {
            if (!ch.label) continue;
            const def = arr(C.choices.choiceDefinitions).find((cd) => cd.id === `${ch.componentTypeId}-${ch.type}`);
            const opt = def && arr(def.options).find((o) => o.id === ch.optionValue);
            choiceRows.push([ch.label, opt ? esc(opt.label) : ch.optionValue == null ? '<span class="muted">not chosen yet</span>' : esc(String(ch.optionValue))]);
        }
        const adj = arr(C.characterValues).map((v) => [nameOf(R.adjustmentTypes, v.typeId, 'Adjustment ' + v.typeId), esc(String(v.value)) + (v.notes ? ' · ' + esc(v.notes) : '')]);
        const look = [d.backdropAvatarUrl || (d.defaultBackdrop || {}).thumbnailBackdropAvatarUrl, d.frameAvatarUrl].filter(Boolean);
        return card('settings', 'Choices and sheet settings',
            (choiceRows.length ? `<h3>Choices made</h3>${kv(choiceRows)}` : '')
            + (adj.length ? `<h3>Manual adjustments on D&amp;D Beyond</h3>${kv(adj)}` : '')
            + `<h3>Sheet settings</h3>` + kv([
                ['Privacy', esc(nameOf(R.privacyTypes, p.privacyType))], ['Sharing', esc(nameOf(R.sharingTypes, p.sharingType))],
                ['Advancement', p.progressionType === 1 ? 'Milestone' : p.progressionType === 2 ? 'XP' : ''],
                ['Hit points', p.hitPointType === 1 ? 'Fixed' : p.hitPointType === 2 ? 'Manual (rolled)' : ''],
                ['Encumbrance', { 1: 'Standard', 2: 'Off', 3: 'Variant' }[p.encumbranceType] || ''],
                ['Coin weight', p.ignoreCoinWeight ? 'Ignored' : 'Counted'], ['Homebrew', yes(p.useHomebrewContent)],
                ['Feat rules', yes(p.enforceFeatRules)], ['Multiclass rules', yes(p.enforceMulticlassRules)],
                ['Optional class features', yes(p.enableOptionalClassFeatures)], ['Optional origins', yes(p.enableOptionalOrigins)],
                ['Unarmed strike shown', yes(p.showUnarmedStrike)], ['Scaled spells shown', yes(p.showScaledSpells)],
                ['Ability scores', { 1: 'Scores on top', 2: 'Modifiers on top' }[p.abilityScoreDisplayType] || ''],
                ['Ability score method', { 1: 'Standard array', 2: 'Manual / rolled', 3: 'Point buy' }[cfg.abilityScoreType] || ''],
                ['Starting equipment', { 1: 'Equipment', 2: 'Gold', 3: 'Chosen' }[cfg.startingEquipmentType] || ''],
                ['Source categories on', sources ? sources + '' : ''], ['Theme colour', d.themeColor ? `<span class="swatch" style="background:${/^#[0-9a-f]{3,8}$/i.test(d.themeColor.themeColor || '') ? d.themeColor.themeColor : 'transparent'}"></span>` : ''],
                ['Character ID', `<span class="mono">${esc(C.id)}</span>`], ['Status', esc(C.statusSlug || (C.status === 0 ? 'active' : C.status))],
            ]) + (look.length ? `<div class="looks">${look.map((u) => `<img src="${esc(u)}" alt="" loading="lazy" referrerpolicy="no-referrer">`).join('')}</div>` : ''));
    }

    function raw() {
        sections.push(['raw', 'Raw data']);
        return `<section class="card" id="raw"><h2>Raw data<span class="n">everything D&amp;D Beyond sent</span></h2><div class="tree" id="raw-tree"></div><p class="small muted">Open a branch to load it. <button type="button" class="btn small" data-act="copyjson">Copy JSON</button></p></section>`;
    }

    // lazy JSON tree: children build when a branch opens, 250 at a time
    function treeNode(key, value) {
        if (value === null || typeof value !== 'object') {
            const div = document.createElement('div'); div.className = 'tl';
            const type = value === null ? 'null' : typeof value;
            div.innerHTML = `<span class="k">${esc(key)}</span>: <span class="v ${type}">${esc(type === 'string' ? JSON.stringify(value.length > 400 ? value.slice(0, 400) + '…' : value) : String(value))}</span>`;
            return div;
        }
        const det = document.createElement('details');
        const keys = Object.keys(value);
        det.innerHTML = `<summary><span class="k">${esc(key)}</span> <span class="ty">${Array.isArray(value) ? '[' + keys.length + ']' : '{' + keys.length + '}'}</span></summary>`;
        let shown = 0;
        const more = () => {
            const frag = document.createDocumentFragment();
            for (const k of keys.slice(shown, shown + 250)) frag.append(treeNode(k, value[k]));
            shown += 250;
            const btn = det.querySelector(':scope > .tmore'); if (btn) btn.remove();
            det.append(frag);
            if (shown < keys.length) { const b = document.createElement('button'); b.className = 'btn small tmore'; b.type = 'button'; b.textContent = `Show ${keys.length - shown} more`; b.onclick = more; det.append(b); }
        };
        det.addEventListener('toggle', () => { if (det.open && !shown) more(); }, { once: false });
        return det;
    }

    /* ---------- page ---------- */
    function render() {
        if (!C) { // no character: just the picker above the error PHP printed
            const err = $('.page .err');
            const box = document.createElement('div'); box.innerHTML = toolbar();
            (err || $('#main')).before(box);
            wire();
            return;
        }
        compute();
        const blocks = [combat(), abilities(), skills(), attacks(), actions(), spells(), features(), inventory(), profs(), origins(), about(), creatures(), campaign(), settings()];
        sheet.dataset.state = 'ready';
        sheet.innerHTML = hero() + toolbar() + `<nav class="jump" aria-label="Sections">${sections.map(([id, t]) => `<a href="#${id}">${esc(t)}</a>`).join('')}<a href="#raw">Raw data</a></nav>`
            + `<div class="masonry">${blocks.join('')}</div>` + raw()
            + `<p class="small muted search-none hide">Nothing on the sheet matches that search.</p>`
            + `<aside class="drawer" id="drawer" aria-hidden="true" tabindex="-1"><button class="close" type="button" aria-label="Close">×</button><div id="drawer-body"></div></aside>`;
        $('#raw-tree').append(treeNode('character', C));
        wire();
    }

    function openDrawer(title, sub, body) {
        const dr = $('#drawer');
        $('#drawer-body').innerHTML = `<h2>${esc(title)}</h2>${sub ? `<p class="muted small">${esc(sub)}</p>` : ''}<div class="desc">${body || '<p class="muted">No description.</p>'}</div>`;
        dr.classList.add('open'); dr.setAttribute('aria-hidden', 'false');
        lastFocus = document.activeElement; dr.focus();
    }
    let lastFocus = null;
    function closeDrawer() {
        const dr = $('#drawer'); if (!dr || !dr.classList.contains('open')) return false;
        dr.classList.remove('open'); dr.setAttribute('aria-hidden', 'true');
        if (lastFocus) lastFocus.focus();
        return true;
    }

    function search(q) {
        q = q.trim().toLowerCase();
        const words = q.split(/\s+/).filter(Boolean);
        let hits = 0;
        for (const el of $$('[data-s]', sheet)) {
            const ok = !words.length || words.every((w) => el.dataset.s.toLowerCase().includes(w));
            el.classList.toggle('miss', !ok); if (ok && words.length) hits++;
        }
        for (const c of $$('.masonry > .card', sheet)) c.classList.toggle('miss', !!words.length && !c.querySelector('[data-s]:not(.miss)'));
        for (const h of $$('.masonry h3', sheet)) { // hide a sub-heading whose list is all filtered out
            const list = h.nextElementSibling;
            h.classList.toggle('miss', !!words.length && !!list && list.querySelector('[data-s]') && !list.querySelector('[data-s]:not(.miss)'));
        }
        $('.search-none', sheet).classList.toggle('hide', !words.length || hits > 0);
    }

    function wire() {
        const pick = $('#dnd-pick');
        if (pick) pick.addEventListener('change', () => { location.search = '?id=' + encodeURIComponent(pick.value); });
        const q = $('#dnd-q');
        if (q) q.addEventListener('input', debounce(() => search(q.value), 80));
        document.addEventListener('click', (e) => {
            const r = e.target.closest('[data-roll]');
            if (r) {
                const keep = rollMode;
                if (r.dataset.d20 && e.shiftKey) rollMode = 'adv'; else if (r.dataset.d20 && e.altKey) rollMode = 'dis';
                roll(r.dataset.roll, r.dataset.label, !!r.dataset.d20);
                rollMode = keep;
                return;
            }
            const dt = e.target.closest('[data-detail]');
            if (dt) { const d = details.get(dt.dataset.detail); if (d) openDrawer(d.title, d.sub, d.body); return; }
            if (e.target.closest('#drawer .close')) { closeDrawer(); return; }
            const m = e.target.closest('[data-mode]');
            if (m) { rollMode = m.dataset.mode; store.set('dnd.rollMode', rollMode); $$('[data-mode]').forEach((b) => b.classList.toggle('on', b === m)); return; }
            const f = e.target.closest('[data-filter]');
            if (f) {
                $$('[data-filter]').forEach((b) => b.classList.toggle('on', b === f));
                const v = f.dataset.filter;
                for (const it of $$('.inv .item')) it.classList.toggle('filtered', v !== 'all' && !it.dataset.f.includes(v));
                return;
            }
            const act = e.target.closest('[data-act]');
            if (!act || act.tagName === 'FORM') return;
            if (act.dataset.act === 'share') copy(location.origin + location.pathname + '?id=' + encodeURIComponent(P.id), act);
            else if (act.dataset.act === 'copyjson') copy(JSON.stringify(C, null, 2), act);
            else if (act.dataset.act === 'log') openDrawer('Roll log', rollLog.length ? plural(rollLog.length, 'roll') + ' this visit' : '', rollLog.length ? `<div class="rows">${rollLog.map((l) => `<div class="rowi"><div class="grow">${esc(l.line)}<div class="snip muted">${esc(l.detail)}</div></div><small>${esc(new Date(l.t).toLocaleTimeString())}</small></div>`).join('')}</div>` : '<p class="muted">Click any bonus or damage on the sheet to roll it.</p>');
        });
        const form = $('form.dnd-open');
        if (form) form.addEventListener('submit', (e) => {
            e.preventDefault();
            const m = ($('#dnd-id').value || '').match(/(\d{4,12})/);
            if (m) location.search = '?id=' + m[1]; else toast('Paste a D&D Beyond character link or its number.', 'err');
        });
        // "/" focuses the sheet search (before the site-wide search sees it), Esc closes the drawer first
        window.addEventListener('keydown', (e) => {
            const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName);
            if (e.key === '/' && !typing && q && !e.ctrlKey && !e.metaKey) { e.preventDefault(); q.focus(); q.select(); }
            else if (e.key === 'Escape') {
                if (closeDrawer()) { e.preventDefault(); e.stopPropagation(); }
                else if (document.activeElement === q && q.value) { q.value = ''; search(''); e.stopPropagation(); }
            }
        }, true);
    }

    render();
})();
