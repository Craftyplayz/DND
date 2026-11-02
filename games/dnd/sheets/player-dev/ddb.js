// D&D Beyond -> homebrew sheet. hbFromDdb(character, rules) returns plain data that sheet.js places into a new character.
// The derived numbers (scores, AC, HP, saves, skills, speeds, senses, defences, proficiencies, attacks, spell DCs and slots)
// are worked out the same way /games/dnd/characters/dnd.js does; that code is copied here so the live page stays untouched.
(function (g) {
    'use strict';
    const arr = (v) => (Array.isArray(v) ? v : v ? [v] : []);
    const byId = (list, id) => arr(list).find((x) => x && (x.id === id || (x.definition && x.definition.id === id)));
    const nameOf = (list, id, d = '') => { const x = byId(list, id); return x ? (x.name || (x.definition && x.definition.name)) : d; };
    const signed = (n) => (n >= 0 ? '+' : '−') + Math.abs(n);
    const slug = (s) => String(s || '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const sum = (a) => a.reduce((t, x) => t + (+x || 0), 0);
    const STATS = [[1, 'strength', 'STR'], [2, 'dexterity', 'DEX'], [3, 'constitution', 'CON'], [4, 'intelligence', 'INT'], [5, 'wisdom', 'WIS'], [6, 'charisma', 'CHA']];
    const statKey = (id) => (STATS.find((s) => s[0] === id) || [0, '', '?'])[2];
    const statName = (id) => (STATS.find((s) => s[0] === id) || [0, ''])[1];
    const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', mdash: '—', ndash: '–', hellip: '…', times: '×', minus: '−' };
    // D&D Beyond descriptions are HTML; the sheet stores plain text with line breaks
    const htmlText = (h) => String(h || '').replace(/<\s*(br|\/p|\/li|\/h\d|\/tr|\/div|\/blockquote)\b[^>]*>/gi, '\n').replace(/<li\b[^>]*>/gi, '• ')
        .replace(/<[^>]+>/g, '').replace(/&(#\d+|#x[\da-f]+|\w+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e.toLowerCase()] ?? m))
        .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    const label = (s) => String(s || '').replace(/[[\]]/g, '');
    const plus = (n, lab) => (n ? ` ${n < 0 ? '-' : '+'} ${Math.abs(n)}${lab ? ` [${label(lab)}]` : ''}` : '');

    function hbFromDdb(C, R) {
        R = R || {};
        const S = {};
        const level = sum(arr(C.classes).map((c) => c.level)) || 1;
        const featureLevel = {}, featureById = {}, scaleById = {};
        for (const cl of arr(C.classes)) for (const f of arr(cl.classFeatures)) {
            const d = f.definition || {};
            featureLevel[d.id] = { req: d.requiredLevel || 1, have: cl.level, cls: cl };
            featureById[d.id] = d;
            if (f.levelScale) scaleById[d.id] = f.levelScale;
        }
        const MODS = [];
        for (const src of ['race', 'class', 'background', 'feat', 'condition']) {
            for (const mod of arr((C.modifiers || {})[src])) {
                if (/^choose-/.test(mod.subType || '')) continue;
                const fl = featureLevel[mod.componentId];
                if (src === 'class' && fl && fl.req > fl.have) continue;
                MODS.push(Object.assign({ _src: src }, mod));
            }
        }
        for (const it of arr(C.inventory)) {
            const d = it.definition || {};
            if (!it.equipped) continue;
            for (const mod of arr(d.grantedModifiers)) { if (mod.requiresAttunement && !it.isAttuned) continue; MODS.push(Object.assign({ _src: 'item', _item: d.name }, mod)); }
        }
        const mods = (type, sub) => MODS.filter((m) => m.type === type && (sub === undefined || (Array.isArray(sub) ? sub.includes(m.subType) : m.subType === sub)));
        const modVal = (m) => (m.value != null ? +m.value : m.fixedValue != null ? +m.fixedValue : 0) + (m.statId ? S.mod ? S.mod[m.statId] || 0 : 0 : 0);
        const bonus = (sub) => sum(mods('bonus', sub).filter((m) => !m.restriction).map(modVal));
        const has = (type, sub) => mods(type, sub).length > 0;
        const cv = (typeId, valueId) => arr(C.characterValues).find((v) => v.typeId === typeId && (valueId === undefined || String(v.valueId) === String(valueId)));
        const cvNum = (typeId, valueId) => { const v = cv(typeId, valueId); return v && v.value != null && v.value !== '' ? +v.value : null; };

        // ---- ability scores, proficiency, saves, skills, initiative (as dnd.js compute()) ----
        S.score = {}; S.mod = {};
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
        }
        const pbRow = arr(R.levelProficiencyBonuses).find((r) => r.level === Math.min(level, 20));
        const pbBonus = bonus('proficiency-bonus');
        S.prof = (pbRow ? pbRow.bonus : Math.ceil(level / 4) + 1) + pbBonus;
        const half = () => Math.floor(S.prof / 2), halfUp = () => Math.ceil(S.prof / 2);

        const saves = {};
        for (const [id, nm, key] of STATS) {
            const lvlOver = cvNum(41, id);
            const prof = lvlOver != null ? lvlOver >= 3 : has('proficiency', nm + '-saving-throws');
            let total = S.mod[id] + (prof ? S.prof : 0) + bonus('saving-throws') + bonus(nm + '-saving-throws') + (cvNum(39, id) || 0) + (cvNum(40, id) || 0);
            const ov = cvNum(38, id); if (ov != null) total = ov;
            saves[key] = { prof, extra: total - S.mod[id] - (prof ? S.prof : 0) };
        }

        const skills = arr(R.abilitySkills).map((sk) => {
            const sub = slug(sk.name), statNm = statName(sk.stat);
            let lvl = has('expertise', sub) ? 3 : has('proficiency', sub) ? 2 : (has('half-proficiency-round-up', [sub, 'ability-checks', statNm + '-ability-checks']) ? 1.5 : has('half-proficiency', [sub, 'ability-checks', statNm + '-ability-checks']) ? 1 : 0);
            const lo = cvNum(26, sk.id); if (lo != null) lvl = { 1: 0, 2: 1, 3: 2, 4: 3 }[lo] ?? lvl;
            const stat = cvNum(27, sk.id) || sk.stat;
            const pb = lvl === 3 ? S.prof * 2 : lvl === 2 ? S.prof : lvl === 1.5 ? halfUp() : lvl === 1 ? half() : 0;
            let total = S.mod[stat] + pb + bonus(sub) + bonus('ability-checks') + bonus(statName(stat) + '-ability-checks') + (cvNum(24, sk.id) || 0) + (cvNum(25, sk.id) || 0);
            const ov = cvNum(23, sk.id); if (ov != null) total = ov;
            const p = { 0: 0, 1: 0.5, 1.5: 0.5, 2: 1, 3: 2 }[lvl] || 0;
            const b = total - S.mod[stat] - Math.floor(S.prof * p);
            return { name: sk.name, ab: statKey(stat), p, b: b ? String(b) : '', total };
        });
        for (const cp of arr(C.customProficiencies).filter((x) => x.type === 1)) {
            const lvl = { 1: 0, 2: 1, 3: 2, 4: 3 }[cp.proficiencyLevel] || 0, stat = cp.statId || 1;
            const p = [0, 0.5, 1, 2][lvl], total = cp.override != null ? cp.override : S.mod[stat] + [0, half(), S.prof, S.prof * 2][lvl] + (cp.magicBonus || 0) + (cp.miscBonus || 0);
            const b = total - S.mod[stat] - Math.floor(S.prof * p);
            skills.push({ name: cp.name, ab: statKey(stat), p, b: b ? String(b) : '', total });
        }
        skills.sort((a, b) => a.name.localeCompare(b.name));

        const initTotal = S.mod[2] + bonus('initiative') + (has('proficiency', 'initiative') ? S.prof : has('half-proficiency-round-up', ['initiative', 'ability-checks', 'dexterity-ability-checks']) ? halfUp() : has('half-proficiency', ['initiative', 'ability-checks', 'dexterity-ability-checks']) ? half() : 0) + bonus('ability-checks') + bonus('dexterity-ability-checks');

        // ---- armour class, as a formula with labelled parts ----
        const worn = arr(C.inventory).filter((i) => i.equipped && i.definition && i.definition.armorTypeId);
        const armor = worn.find((i) => i.definition.armorTypeId !== 4), shield = worn.find((i) => i.definition.armorTypeId === 4);
        let acF;
        if (armor) {
            const t = armor.definition.armorTypeId, ac = armor.definition.armorClass || 0;
            acF = `${ac} [${label(armor.definition.name)}]` + (t === 1 ? ' + DEX' : t === 2 ? ` + min(DEX, ${2 + bonus('ac-max-dex-armored-modifier')})` : '');
        } else {
            const dex = S.mod[2];
            const isMonk = (mod) => { const f = featureLevel[mod.componentId]; return f && f.cls.definition && f.cls.definition.name === 'Monk'; };
            const options = [{ v: (R.noArmorAcAmount || 10) + dex, f: `${R.noArmorAcAmount || 10} + DEX` }];
            for (const m of mods('set', 'unarmored-armor-class')) {
                if (shield && isMonk(m)) continue;
                if (m.statId) options.push({ v: 10 + dex + S.mod[m.statId], f: `10 + DEX + ${statKey(m.statId)} [Unarmoured defence]` });
                else if (m.value != null || m.fixedValue != null) { const v = +(m.value ?? m.fixedValue); options.push({ v: v + dex, f: `${v} + DEX` }); }
            }
            acF = options.sort((a, b) => b.v - a.v)[0].f;
        }
        const baseOver = cvNum(4); if (baseOver != null) acF = `${baseOver} [Base set on D&D Beyond]`;
        if (shield) acF += ` + ${shield.definition.armorClass || 0} [${label(shield.definition.name)}]`;
        acF += plus(bonus('armor-class') + (armor ? bonus('armored-armor-class') : bonus('unarmored-armor-class')) + (cvNum(2) || 0) + (cvNum(3) || 0), 'Other bonuses');
        const acOver = cvNum(1); if (acOver != null) acF = `${acOver} [Set on D&D Beyond]`;

        // ---- hit points, speeds, senses, defences ----
        const hpMax = C.overrideHitPoints || Math.max(R.minimumHpTotal || 1, (C.baseHitPoints || 0) + (C.bonusHitPoints || 0) + S.mod[3] * level + bonus('hit-points-per-level') * level + bonus('hit-points'));
        const ws = (C.race && C.race.weightSpeeds && C.race.weightSpeeds.normal) || { walk: 30 };
        const walk = (ws.walk || 0) + bonus('speed') + bonus('speed-walking') + (armor ? 0 : bonus('unarmored-movement'));
        const speeds = { Walk: walk };
        for (const [mode, key, set] of [['Fly', 'fly', 'flying'], ['Swim', 'swim', 'swimming'], ['Climb', 'climb', 'climbing'], ['Burrow', 'burrow', 'burrowing']]) {
            let v = ws[key] || 0;
            for (const m of mods('set', 'innate-speed-' + set)) v = Math.max(v, m.value ?? m.fixedValue ?? walk);
            if (v) v += bonus('speed-' + set);
            if (v) speeds[mode] = v;
        }
        for (const cs of arr(C.customSpeeds)) speeds[nameOf(R.movements, cs.movementId, 'Speed')] = cs.distance;
        for (const v of arr(C.characterValues).filter((x) => x.typeId === 37)) speeds[nameOf(R.movements, +v.valueId, 'Speed')] = +v.value;
        const senses = {};
        for (const m of [...mods('set-base'), ...mods('sense')]) {
            if (!/darkvision|blindsight|tremorsense|truesight/.test(m.subType)) continue;
            const lab = m.friendlySubtypeName || m.subType, v = +(m.value ?? m.fixedValue ?? 0);
            senses[lab] = m.type === 'sense' ? (senses[lab] || 0) + v : Math.max(senses[lab] || 0, v);
        }
        for (const cs of arr(C.customSenses)) senses[nameOf(R.senses, cs.senseId, 'Sense')] = cs.distance;
        for (const v of arr(C.characterValues).filter((x) => x.typeId === 36)) senses[nameOf(R.senses, +v.valueId, 'Sense')] = +v.value;
        const defs = { res: [], imm: [], vul: [] };
        for (const [type, key] of [['resistance', 'res'], ['immunity', 'imm'], ['vulnerability', 'vul']])
            for (const m of mods(type)) defs[key].push((m.friendlySubtypeName || m.subType) + (m.restriction ? ' (' + m.restriction + ')' : ''));
        for (const a of arr(C.customDefenseAdjustments)) {
            const da = byId(R.damageAdjustments, a.adjustmentId);
            if (da) defs[{ 1: 'res', 2: 'imm', 3: 'vul' }[da.type] || 'res'].push(da.name + (a.source ? ' (' + a.source + ')' : ''));
        }
        const advantages = [...mods('advantage'), ...mods('disadvantage')].filter((m) => !/saving-throws|^initiative$/.test(m.subType))
            .map((m) => (m.type === 'advantage' ? 'Advantage on ' : 'Disadvantage on ') + (m.friendlySubtypeName || m.subType).toLowerCase() + (m.restriction ? ' ' + m.restriction : ''));

        // ---- proficiencies by group ----
        const groups = { Armor: new Map(), Weapons: new Map(), Tools: new Map(), Languages: new Map(), Other: new Map() };
        const groupOf = (m) => { for (const gr of arr(R.proficiencyGroups)) if (arr(gr.entityTypeIds).includes(m.entityTypeId)) return gr.label; return null; };
        const skip = new Set(skills.map((s) => slug(s.name)).concat(STATS.map((s) => s[1] + '-saving-throws'), ['initiative']));
        for (const m of [...mods('proficiency'), ...mods('expertise'), ...mods('language')]) {
            if (skip.has(m.subType)) continue;
            const gr = m.type === 'language' ? 'Languages' : groupOf(m) || (/armor|shields/.test(m.subType) ? 'Armor' : /weapons?$/.test(m.subType) ? 'Weapons' : 'Other');
            (groups[gr] || groups.Other).set(m.subType, { name: m.friendlySubtypeName || m.subType, expert: m.type === 'expertise' });
        }
        for (const cp of arr(C.customProficiencies).filter((p) => p.type !== 1)) (groups[{ 2: 'Tools', 3: 'Languages', 4: 'Armor', 5: 'Weapons' }[cp.type] || 'Other']).set('custom-' + cp.id, { name: cp.name });
        const names = (gr) => [...groups[gr].values()].map((x) => x.name).sort();
        const profSet = new Set(mods('proficiency').map((m) => m.subType));
        const profs = {
            armour: names('Armor').map((n) => n.replace(/ Armor$/, ' armour')),
            weapons: names('Weapons').map((n) => n.replace(/^(Simple|Martial) Weapons$/, (m, k) => k + ' weapons')),
            langs: names('Languages'),
            tools: [...groups.Tools.values()].map((t) => ({ name: t.name, ab: /thieves|disguise|forgery/i.test(t.name) ? 'DEX' : 'INT', p: t.expert ? 2 : 1 })),
            notes: names('Other').length ? 'Other proficiencies: ' + names('Other').join(', ') : '',
        };

        // ---- {{ }} tokens in descriptions, e.g. "1d6{{modifier:str#signed}}" ----
        let tokenCtx = {};
        const limitedMax = (lu) => {
            if (!lu) return 0;
            let max = lu.maxUses || 0;
            if (lu.statModifierUsesId) max = lu.operator === 2 ? max * S.mod[lu.statModifierUsesId] : max + S.mod[lu.statModifierUsesId];
            if (lu.useProficiencyBonus) max = lu.proficiencyBonusOperator === 2 ? (max || 1) * S.prof : max + S.prof;
            return Math.max(max, lu.maxUses || lu.statModifierUsesId || lu.useProficiencyBonus ? 1 : 0);
        };
        function tokenValue(name) {
            const [k, a] = name.split(':');
            const statId = a ? (STATS.find((s) => s[2].toLowerCase() === a.split(',')[0]) || [])[0] : null;
            switch (k) {
                case 'modifier': return statId ? S.mod[statId] : null;
                case 'proficiency': return S.prof;
                case 'characterlevel': return level;
                case 'classlevel': return tokenCtx.cls ? tokenCtx.cls.level : level;
                case 'savedc': return statId ? 8 + S.prof + S.mod[statId] : null;
                case 'spellattack': return statId ? S.prof + S.mod[statId] : null;
                case 'scalevalue': { const s = tokenCtx.scale; return s ? (s.dice && s.dice.diceString ? s.dice.diceString : s.fixedValue) : null; }
                case 'hitpoints': case 'maxhp': return hpMax;
                case 'limiteduse': return tokenCtx.uses ?? null;
                default: return null;
            }
        }
        function tokens(s) {
            if (!s || s.indexOf('{{') < 0) return s || '';
            return s.replace(/\{\{([^}]+)\}\}/g, (all, body) => {
                let [expr, fmt = ''] = body.split('#'), round = '';
                const at = expr.indexOf('@'); if (at >= 0) { round = expr.slice(at + 1); expr = expr.slice(0, at); }
                let failed = false, dice = null;
                const replaced = expr.replace(/[a-z]+(?::[a-z,]+)?/gi, (tok) => {
                    const v = tokenValue(tok.toLowerCase());
                    if (v == null) { failed = true; return '0'; }
                    if (typeof v === 'string' && /d/.test(v)) { dice = v; return '0'; }
                    return '(' + v + ')';
                });
                if (failed) return '';
                if (dice) return dice;
                // only digits and arithmetic reach here, so evaluating it is safe
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
        const desc = (s, ctx) => { tokenCtx = ctx || {}; const o = htmlText(tokens(s)); tokenCtx = {}; return o; };
        const ctxFor = (a) => {
            const f = featureById[a.componentId];
            if (f) return { cls: (featureLevel[a.componentId] || {}).cls, scale: scaleById[a.componentId], uses: limitedMax(a.limitedUse) };
            return { uses: limitedMax(a.limitedUse) };
        };
        const timing = (act) => {
            const n = nameOf(R.activationTypes, act && act.activationType) || '';
            return { Action: 'Action', 'Bonus Action': 'Bonus action', Reaction: 'Reaction', 'No Action': 'Free' }[n] || (n ? 'Special' : 'Special');
        };
        const resetOf = (id) => { const n = nameOf(R.limitedUseResetTypes, id); return /short/i.test(n) ? 'short' : /long/i.test(n) ? 'long' : ''; };

        // ---- actions: weapons, D&D Beyond actions and custom actions ----
        const actions = [], trackers = [];
        const weaponProf = (d) => profSet.has(d.categoryId === 1 ? 'simple-weapons' : d.categoryId === 2 ? 'martial-weapons' : '') || profSet.has(slug(d.type || d.name)) || profSet.has(slug(d.name));
        for (const it of arr(C.inventory)) {
            const d = it.definition || {};
            if (d.filterType !== 'Weapon' && !d.damage) continue;
            if (!it.equipped && !it.displayAsAttack) continue;
            const props = arr(d.properties).map((p) => p.name);
            const finesse = props.includes('Finesse'), ranged = d.attackType === 2;
            const isMonk = arr(C.classes).some((c) => c.definition.name === 'Monk') && d.isMonkWeapon;
            const stat = (finesse || isMonk) ? (S.mod[1] >= S.mod[2] ? 1 : 2) : ranged ? 2 : 1;
            const magic = sum(arr(d.grantedModifiers).filter((m) => m.type === 'bonus' && m.subType === 'magic').map((m) => +(m.value ?? m.fixedValue) || 0));
            const profOver = cv(17, it.id), prof = profOver ? !!profOver.value : weaponProf(d);
            const hitExtra = magic + bonus('weapon-attacks') + bonus(ranged ? 'ranged-weapon-attacks' : 'melee-weapon-attacks') + (cvNum(12, it.id) || 0);
            const dmgExtra = magic + bonus('weapon-damage') + bonus(ranged ? 'ranged-weapon-damage' : 'melee-weapon-damage') + (cvNum(10, it.id) || 0);
            const hitOver = cvNum(13, it.id);
            const versatile = arr(d.properties).find((p) => p.name === 'Versatile');
            const reach = (R.baseWeaponReach || 5) + (props.includes('Reach') ? 5 : 0);
            actions.push({
                name: (cv(8, it.id) || {}).value || d.name, time: 'Action',
                range: ranged ? `${d.range}/${d.longRange} ft` : props.includes('Thrown') ? `${reach} ft, thrown ${d.range}/${d.longRange} ft` : `${reach} ft`,
                mode: 'hit', hit: hitOver != null ? `${hitOver} [Set on D&D Beyond]` : statKey(stat) + (prof ? ' + PROF' : '') + plus(hitExtra, 'Bonuses'),
                dmg: [{ dice: (d.damage && d.damage.diceString ? d.damage.diceString : '1') + ' + ' + statKey(stat) + plus(dmgExtra), type: d.damageType || '' }],
                props, desc: [versatile && versatile.notes ? 'Two-handed: ' + versatile.notes + ' + ' + statKey(stat) : '', prof ? '' : 'Not proficient.', htmlText(d.description)].filter(Boolean).join('\n\n'),
            });
        }
        // martial arts: unarmed strikes and monk attacks use the better of STR and DEX and the martial arts die
        const maFeat = Object.values(featureById).find((f) => f.name === 'Martial Arts' && featureLevel[f.id].req <= featureLevel[f.id].have);
        const maDie = maFeat && scaleById[maFeat.id] && scaleById[maFeat.id].dice ? scaleById[maFeat.id].dice.diceString : null;
        for (const list of Object.values(C.actions || {})) for (const a of arr(list)) {
            if (!a || !a.name) continue;
            const ma = a.isMartialArts && maDie;
            const ctx = ctxFor(a), stat = ma && (!a.abilityModifierStatId || a.abilityModifierStatId <= 2) ? (S.mod[2] > S.mod[1] ? 2 : 1) : a.abilityModifierStatId;
            const isAttack = a.displayAsAttack && (a.actionType === 1 || a.saveStatId);
            const row = { name: a.name, time: timing(a.activation), range: a.range && a.range.range ? a.range.range + (a.range.longRange ? '/' + a.range.longRange : '') + ' ft' : '', props: [], mode: 'none', dmg: [], desc: desc(a.description || a.snippet, ctx) };
            if (isAttack && a.saveStatId) Object.assign(row, { mode: 'save', save: statKey(a.saveStatId), dc: a.fixedSaveDc ? String(a.fixedSaveDc) : '8 + PROF' + (stat ? ' + ' + statKey(stat) : '') });
            else if (isAttack) row.hit = a.fixedToHit != null ? String(a.fixedToHit) : (stat ? statKey(stat) : '0') + (a.isProficient ? ' + PROF' : ''), row.mode = 'hit';
            const dice = a.dice ? (a.dice.diceString || (a.dice.fixedValue != null ? String(a.dice.fixedValue) : '')) : ma && a.actionType === 1 ? maDie : '';
            if (dice) row.dmg = [{ dice: dice + (isAttack && stat && a.actionType === 1 ? ' + ' + statKey(stat) : ''), type: nameOf(R.damageTypes, a.damageTypeId) }];
            actions.push(row);
            const max = limitedMax(a.limitedUse);
            if (max) trackers.push({ name: a.name, cur: Math.max(0, max - (a.limitedUse.numberUsed || 0)), max, reset: resetOf(a.limitedUse.resetType) });
        }
        for (const a of arr(C.customActions)) {
            const dice = a.diceCount && a.diceType ? a.diceCount + 'd' + a.diceType : a.fixedValue != null ? String(a.fixedValue) : '';
            const row = { name: a.name, time: timing(a.activation), range: a.range ? a.range + (a.longRange ? '/' + a.longRange : '') + ' ft' : '', props: [], mode: 'none', dmg: [], desc: htmlText(a.description || a.snippet) };
            if (a.saveStatId) Object.assign(row, { mode: 'save', save: statKey(a.saveStatId), dc: a.fixedSaveDc ? String(a.fixedSaveDc) : '8 + PROF' + (a.statId ? ' + ' + statKey(a.statId) : '') });
            else if (a.toHitBonus != null || a.isProficient != null) Object.assign(row, { mode: 'hit', hit: (a.statId ? statKey(a.statId) : '0') + (a.isProficient ? ' + PROF' : '') + plus(a.toHitBonus || 0) });
            if (dice) row.dmg = [{ dice: dice + (a.statId ? ' + ' + statKey(a.statId) : '') + plus(a.damageBonus || 0), type: nameOf(R.damageTypes, a.damageTypeId) }];
            actions.push(row);
        }

        // ---- spells: DC, attack, slots and every known spell ----
        const casting = arr(C.classes).map((cl) => {
            const def = cl.definition || {}, sub = cl.subclassDefinition || {};
            const ability = def.spellCastingAbilityId || sub.spellCastingAbilityId;
            if (!(def.canCastSpells || sub.canCastSpells) || !ability) return null;
            return { cls: cl, ability, rules: (def.canCastSpells ? def.spellRules : sub.spellRules) || {}, isPact: def.name === 'Warlock' };
        }).filter(Boolean);
        const normal = casting.filter((c) => !c.isPact);
        let slotRow = [];
        if (normal.length === 1) slotRow = arr(arr(normal[0].rules.levelSpellSlots)[normal[0].cls.level]);
        else if (normal.length > 1) {
            const cl = sum(normal.map((c) => { const div = c.rules.multiClassSpellSlotDivisor || 1, l = c.cls.level / div; return c.rules.multiClassSpellSlotRounding === 2 ? Math.ceil(l) : Math.floor(l); }));
            slotRow = arr(arr(R.multiClassSpellSlots)[Math.min(cl, 20)]);
        }
        const slots = Array.from({ length: 9 }, (_, i) => ({ max: slotRow[i] || 0, used: ((arr(C.spellSlots)[i]) || {}).used || 0 }));
        const pact = casting.find((c) => c.isPact);
        if (pact) arr(arr(pact.rules.levelSpellSlots)[pact.cls.level]).forEach((n, i) => { if (n) { slots[i].max += n; slots[i].used += ((arr(C.pactMagic)[i]) || {}).used || 0; } });
        const main = casting[0];
        const spellDc = main ? `8 + PROF + ${statKey(main.ability)}` + plus(bonus('spell-save-dc'), 'Bonuses') : '8 + PROF + INT';
        const spellAtk = main ? `PROF + ${statKey(main.ability)}` + plus(bonus('spell-attacks'), 'Bonuses') : 'PROF + INT';
        const comp = (ids) => arr(ids).map((i) => (byId(R.spellComponents, i) || {}).shortName || { 1: 'V', 2: 'S', 3: 'M' }[i]).filter(Boolean).join(', ');
        const dur = (d) => !d ? '' : d.durationType === 'Instantaneous' || d.durationType === 'Special' ? d.durationType : d.durationInterval ? `${d.durationInterval} ${d.durationUnit}${d.durationInterval > 1 ? 's' : ''}` : d.durationType || '';
        const rng = (r) => !r ? '' : [r.origin === 'Ranged' ? '' : r.origin, r.rangeValue ? r.rangeValue + ' ft' : '', r.aoeType ? `(${r.aoeValue || ''} ft ${String(r.aoeType).toLowerCase()})` : ''].filter(Boolean).join(' ');
        const spells = [], seen = new Set();
        const pushSpells = (list) => {
            for (const sp of arr(list)) {
                const d = sp && sp.definition;
                if (!d || seen.has(d.name)) continue;
                seen.add(d.name);
                spells.push({
                    lvl: d.level || 0, name: d.name, school: d.school || '', time: timing(sp.activation || d.activation), trig: d.castingTimeDescription || '', range: rng(sp.range || d.range),
                    comp: comp(d.components) + (d.componentsDescription ? ` (${d.componentsDescription})` : ''), dur: dur(d.duration),
                    conc: !!d.concentration, ritual: !!d.ritual, prep: !!(sp.prepared || sp.alwaysPrepared || !d.level),
                    mode: d.requiresSavingThrow ? 'save' : d.requiresAttackRoll ? 'atk' : 'none', save: d.saveDcAbilityId ? statKey(d.saveDcAbilityId) : 'DEX',
                    dc: sp.overrideSaveDc ? String(sp.overrideSaveDc) : '',
                    dmg: arr(d.modifiers).filter((m) => m.type === 'damage' && m.die).map((m) => ({ dice: m.die.diceString || (m.die.fixedValue != null ? String(m.die.fixedValue) : ''), type: m.friendlySubtypeName || m.subType || '' })).filter((x) => x.dice),
                    desc: htmlText(d.description), higher: '',
                });
            }
        };
        for (const cs of arr(C.classSpells)) pushSpells(cs.spells);
        for (const list of Object.values(C.spells || {})) pushSpells(list);

        // ---- inventory ----
        const catOf = (d) => d.filterType === 'Weapon' ? 'Weapons' : d.filterType === 'Armor' ? 'Armour' : /potion|scroll/i.test(d.filterType || d.type || '') ? 'Consumables' : d.magic ? 'Magic items' : 'Gear';
        const items = arr(C.inventory).map((it) => {
            const d = it.definition || {}, over = cvNum(22, it.id);
            return {
                name: (cv(8, it.id) || {}).value || d.name || 'Item', cat: catOf(d), qty: it.quantity || 1, eq: !!it.equipped,
                wt: Math.round(((over != null ? over : (d.weight || 0) * (d.weightMultiplier ?? 1)) / (d.bundleSize || 1)) * 100) / 100,
                att: it.isAttuned ? 'yes' : d.canAttune ? 'needs' : '', notes: [d.magic ? d.rarity : '', (cv(9, it.id) || {}).value].filter(Boolean).join(' · '),
                // item attributes as D&D Beyond lists them: properties, range, armour type and AC, then its tags
                props: [...new Set([...arr(d.properties).map((p) => p.name), d.longRange ? `Range (${d.range}/${d.longRange})` : '',
                    ['', 'Light armour', 'Medium armour', 'Heavy armour', 'Shield'][d.armorTypeId] || '', d.armorClass ? 'AC ' + (d.armorTypeId === 4 ? '+' : '') + d.armorClass : '', ...arr(d.tags)].filter(Boolean))],
            };
        }).concat(arr(C.customItems).map((c) => ({ name: c.name, cat: 'Gear', qty: c.quantity || 1, eq: false, wt: c.weight || 0, att: '', notes: c.notes || '' })));

        // ---- passive abilities: features, traits, background and feats that aren't already actions ----
        const actionNames = new Set(actions.map((a) => a.name));
        const passives = [];
        // class boilerplate the sheet already shows elsewhere
        const BOILER = new Set(['Hit Points', 'Proficiencies', 'Equipment', 'Core Barbarian Traits', 'Core Bard Traits', 'Core Cleric Traits', 'Core Druid Traits', 'Core Fighter Traits', 'Core Monk Traits', 'Core Paladin Traits', 'Core Ranger Traits', 'Core Rogue Traits', 'Core Sorcerer Traits', 'Core Warlock Traits', 'Core Wizard Traits']);
        // grp is the sheet's Passive abilities tab: race, class or other
        const addPassive = (name, src, text, grp = 'other') => { if (name && !actionNames.has(name) && !BOILER.has(name)) passives.push({ name, src, text, grp }); };
        for (const cl of arr(C.classes)) {
            const owned = arr(cl.classFeatures).filter((f) => (f.definition.requiredLevel || 1) <= cl.level && !f.definition.hideInSheet)
                .sort((a, b) => (a.definition.requiredLevel || 0) - (b.definition.requiredLevel || 0) || (a.definition.displayOrder || 0) - (b.definition.displayOrder || 0));
            for (const f of owned) addPassive(f.definition.name, `${cl.definition.name} ${f.definition.requiredLevel || 1}`, desc(f.definition.description, { cls: cl, scale: f.levelScale }), 'class');
        }
        const race = C.race || {};
        for (const t of arr(race.racialTraits).filter((x) => x.definition && !x.definition.hideInSheet)) addPassive(t.definition.name, race.fullName || 'Species', desc(t.definition.description), 'race');
        const bg = C.background && (C.background.definition || C.background.customBackground);
        if (bg && (bg.featureName || bg.featureDescription)) addPassive(bg.featureName || 'Background feature', 'Background: ' + (bg.name || ''), desc(bg.featureDescription));
        for (const f of arr(C.feats).filter((x) => x.definition)) addPassive(f.definition.name, 'Feat', desc(f.definition.description));
        for (const list of Object.values(C.options || {})) for (const o of arr(list)) if (o && o.definition) addPassive(o.definition.name, 'Option', desc(o.definition.description));
        if (advantages.length) passives.push({ name: 'Advantages and disadvantages', src: 'D&D Beyond', text: advantages.join('\n') });

        // ---- notes ----
        const t = C.traits || {}, n = C.notes || {};
        const looks = [['Gender', C.gender], ['Age', C.age], ['Height', C.height], ['Weight', C.weight ? C.weight + ' lb' : ''], ['Hair', C.hair], ['Eyes', C.eyes], ['Skin', C.skin], ['Faith', C.faith], ['Lifestyle', nameOf(R.lifestyles, C.lifestyleId)]]
            .filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join('\n');
        const notes = [['Personality traits', t.personalityTraits], ['Ideals', t.ideals], ['Bonds', t.bonds], ['Flaws', t.flaws],
            ['Appearance', [looks, t.appearance].filter(Boolean).join('\n\n')], ['Backstory', n.backstory]].map(([title, body]) => ({ title, group: 'Character', body }))
            .concat([['Allies', n.allies], ['Organisations', n.organizations], ['Enemies', n.enemies], ['Personal possessions', n.personalPossessions], ['Other holdings', n.otherHoldings], ['Other notes', n.otherNotes]]
                .map(([title, body]) => ({ title, group: 'Notes', body })))
            .filter((x) => String(x.body || '').trim()).map((x) => ({ ...x, body: htmlText(String(x.body)) }));

        const conds = arr(C.conditions).map((c) => ({ name: ((byId(R.conditions, c.id) || {}).definition || {}).name || '', level: c.level }));
        const sub = (cl) => cl.subclassDefinition ? cl.subclassDefinition.name : '';
        return {
            name: C.name || '', race: race.fullName || '', alignment: nameOf(R.alignments, C.alignmentId), age: C.age ? String(C.age) : '',
            art: C.decorations && C.decorations.avatarUrl ? C.decorations.avatarUrl.replace('width=150', 'width=300').replace('height=150', 'height=300') : '',
            insp: !!C.inspiration,
            classes: arr(C.classes).map((cl) => ({ name: cl.definition.name, level: cl.level, die: cl.definition.hitDice || 8, hdUsed: cl.hitDiceUsed || 0, sub: sub(cl) })),
            scores: Object.fromEntries(STATS.map(([id, , key]) => [key, S.score[id]])), saves,
            prof: 'ceil(LEVEL / 4) + 1' + plus(pbBonus, 'Bonuses'), ac: acF, init: 'DEX' + plus(initTotal - S.mod[2], 'Bonuses'),
            hp: { max: hpMax, cur: Math.max(0, hpMax - (C.removedHitPoints || 0)), temp: C.temporaryHitPoints || 0 },
            speeds: Object.entries(speeds).map(([type, ft]) => ({ type, ft, hover: false })),
            senses: Object.entries(senses).map(([k, v]) => `${k} ${v} ft`).join(', '),
            res: defs.res.join(', '), imm: defs.imm.join(', '), vul: defs.vul.join(', '),
            conditions: conds.filter((c) => c.name && c.name !== 'Exhaustion').map((c) => (c.name === 'Paralyzed' ? 'Paralysed' : c.name)),
            exhaustion: (conds.find((c) => c.name === 'Exhaustion') || {}).level || 0,
            skills, profs, actions, trackers,
            spells: { dc: spellDc, atk: spellAtk, slots, rows: spells },
            items: { rows: items, coins: Object.assign({ cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 }, C.currencies || {}), attMax: (R.defaultAttunedItemCountMax || 3) + bonus('attunement-slots') },
            passives, notes, deathSaves: { ok: (C.deathSaves || {}).successCount || 0, bad: (C.deathSaves || {}).failCount || 0 },
            ddbId: C.id, ddbUrl: C.readonlyUrl || '',
        };
    }

    g.hbFromDdb = hbFromDdb;
})(typeof window !== 'undefined' ? window : globalThis);
