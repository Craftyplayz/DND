// What changed between two saved versions of a character, in words, for the sheet's Versions dialog (ROADMAP 0.5).
//   hbChanges(before, after) -> [{ t: 'HP 23 → 18' }, { t: "edited note 'Backstory'", old: '...', new: '...' }, ...]
// One entry per line the player sees, so "7 changes" always matches the list. Both versions should be normalised by the
// sheet first, so its one-time upgrades never show as changes. Not counted: save stamps, the roll log, view settings,
// which note or tab is open, and a portrait moving into the account (inline art swapped for its address).
(() => {
    'use strict';
    const SKIP = new Set(['id', 'updated', 'created', 'open', 'sub', 'rolls', 'view', 'miscCat', 'hbPanel', 'hb2', 'passSplit']);
    const TOP = {
        name: 'Name', race: 'Race', alignment: 'Alignment', age: 'Age', cr: 'CR', prof: 'Proficiency bonus', ac: 'AC', init: 'Initiative',
        insp: 'Inspiration', exhaustion: 'Exhaustion', res: 'Resistances', imm: 'Immunities', vul: 'Vulnerabilities', senses: 'Senses',
        condList: 'Condition list', conditions: 'Conditions', lists: 'Lists',
    };
    const HP = { cur: 'HP', base: 'Base HP', temp: 'Temp HP', mod: 'HP modifier' };
    const PROFS = { armour: 'Armour proficiencies', weapons: 'Weapon proficiencies', langs: 'Languages', tools: 'Tools', notes: 'Proficiency notes' };
    // field names as the sheet shows them; '' means the field is the thing itself (a note's text)
    const WORD = {
        qty: 'quantity', wt: 'weight', gp: 'value', eq: 'equipped', att: 'attunement', cat: 'category', dmg: 'damage', hit: 'to hit', dc: 'save DC',
        lvl: 'level', conc: 'concentration', prep: 'prepared', desc: 'description', higher: 'at higher levels', comp: 'components', dur: 'duration',
        trig: 'trigger', time: 'timing', props: 'properties', cur: 'current', max: 'maximum', src: 'source', text: '', body: '', grp: 'tab',
        sb: 'save bonus', p: 'proficiency', b: 'bonus', ab: 'ability', ft: 'ft', die: 'hit die', hdUsed: 'hit dice used', on: 'shown',
        attMax: 'attunement slots', sp: 'spell points', meta: 'metamagic', flex: 'flexible casting', f: 'formula', amt: 'amount',
        what: 'resource', fx: 'effects', k: 'kind', srd: 'SRD link', atk: 'spell attack', ok: 'death save successes', bad: 'death save failures',
    };
    // arrays of plain stat rows: each item is called by its own name ("Strength score 14 → 16")
    const NAMED = new Set(['abilities', 'skills', 'classes', 'speeds', 'passives', 'tools']);
    const KEY = { abilities: 'key', skills: 'name' };
    const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const show = (v) => (v === '' || v == null ? 'blank' : String(v));
    const isLong = (v) => typeof v === 'string' && (v.length > 60 || v.includes('\n'));
    const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
    const isNote = (o) => isObj(o) && 'body' in o && 'pinned' in o;
    const nameOf = (o, i) => (isNote(o) ? `note '${o.title || 'Untitled note'}'`
        : String((isObj(o) && (o.name || o.title || o.label || o.type || o.dice)) || '').trim() || (typeof o === 'string' ? o : `#${i + 1}`));
    const sub = (label, k) => (WORD[k] === '' ? label : `${label} ${WORD[k] || k}`);

    function val(a, b, label, out) {
        if (same(a, b)) return;
        if (Array.isArray(a) && Array.isArray(b)) return list(a, b, label, '', out);
        if (isObj(a) && isObj(b)) return obj(a, b, label, out);
        if (typeof a !== 'object' && typeof b !== 'object' && String(a ?? '') === String(b ?? '')) return; // 3 and "3"
        if (isLong(a) || isLong(b)) return out.push({ t: `edited ${label}`, old: String(a ?? ''), new: String(b ?? '') });
        if (typeof b === 'boolean') return out.push({ t: `${label} ${b ? 'on' : 'off'}` });
        out.push({ t: `${label} ${show(a)} → ${show(b)}` });
    }

    function obj(a, b, label, out) {
        for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
            if (SKIP.has(k) || same(a[k], b[k])) continue;
            if (k === 'archived') { out.push({ t: `${b[k] ? 'archived' : 'restored'} ${label}` }); continue; }
            if (k === 'pinned') { out.push({ t: `${b[k] ? 'pinned' : 'unpinned'} ${label}` }); continue; }
            if (Array.isArray(a[k]) && Array.isArray(b[k])) list(a[k], b[k], sub(label, k), k, out);
            else val(a[k], b[k], sub(label, k), out);
        }
    }

    // the items whose order changed: everything outside the longest run kept in order
    function moved(ids, before) {
        const pos = ids.map((id) => before.indexOf(id)), keep = new Set(), len = [], prev = [];
        pos.forEach((p, i) => { len[i] = 1; prev[i] = -1; for (let j = 0; j < i; j++) if (pos[j] < p && len[j] + 1 > len[i]) { len[i] = len[j] + 1; prev[i] = j; } });
        for (let i = len.length ? len.indexOf(Math.max(...len)) : -1; i >= 0; i = prev[i]) keep.add(ids[i]);
        return ids.filter((id) => !keep.has(id));
    }

    // label: what the list is ("Inventory"); notes are named on their own ("note 'Backstory'")
    function list(a, b, label, k, out) {
        if ([...a, ...b].every((v) => !isObj(v))) {
            for (const v of b) if (!a.includes(v)) out.push({ t: `${label}: added ${show(v)}` });
            for (const v of a) if (!b.includes(v)) out.push({ t: `${label}: removed ${show(v)}` });
            return;
        }
        const key = [...a, ...b].every((o) => isObj(o) && o.id) ? 'id' : KEY[k];
        const item = (o, i) => (isNote(o) ? nameOf(o, i) : NAMED.has(k) ? nameOf(o, i) : `${label}: ${nameOf(o, i)}`);
        if (key) {
            const A = new Map(a.map((o) => [o[key], o])), B = new Map(b.map((o) => [o[key], o]));
            // "added Longsword to Inventory", "removed note 'Backstory'", "moved Fireball in Spells"
            const say = (verb, o, i, where) => out.push({ t: `${verb} ${nameOf(o, i)}${isNote(o) ? '' : ` ${where} ${label}`}` });
            b.forEach((o, i) => { if (!A.has(o[key])) say('added', o, i, 'to'); });
            a.forEach((o, i) => { if (!B.has(o[key])) say('removed', o, i, 'from'); });
            const common = b.map((o) => o[key]).filter((id) => A.has(id));
            for (const id of moved(common, a.map((o) => o[key]).filter((x) => B.has(x)))) say('moved', B.get(id), 0, 'in');
            for (const [id, o] of B) if (A.has(id)) obj(A.get(id), o, item(A.get(id)), out);
            return;
        }
        for (let i = 0; i < Math.max(a.length, b.length); i++) {
            const lbl = NAMED.has(k) ? null : a.length > 1 || b.length > 1 ? `${label} ${i + 1}` : label;
            if (i >= a.length) out.push({ t: NAMED.has(k) ? `${label}: added ${nameOf(b[i], i)}` : `added ${lbl}` });
            else if (i >= b.length) out.push({ t: NAMED.has(k) ? `${label}: removed ${nameOf(a[i], i)}` : `removed ${lbl}` });
            else if (isObj(a[i]) && isObj(b[i])) obj(a[i], b[i], lbl || nameOf(a[i], i), out);
            else val(a[i], b[i], lbl || nameOf(a[i], i), out);
        }
    }

    function panels(a, b, out) {
        const A = new Map(a.map((p) => [p.id, p])), B = new Map(b.map((p) => [p.id, p]));
        for (const [id, p] of B) if (!A.has(id)) out.push({ t: `added ${p.title} panel` });
        for (const [id, p] of A) if (!B.has(id)) out.push({ t: `removed ${p.title} panel` });
        for (const id of moved(b.map((p) => p.id).filter((x) => A.has(x)), a.map((p) => p.id).filter((x) => B.has(x)))) out.push({ t: `moved ${B.get(id).title} panel` });
        for (const [id, q] of B) {
            const p = A.get(id);
            if (!p) continue;
            for (const k of new Set([...Object.keys(p), ...Object.keys(q)])) {
                if (SKIP.has(k) || same(p[k], q[k])) continue;
                if (k === 'title') out.push({ t: `renamed ${p.title} panel to ${q.title}` });
                else if (k === 'on') out.push({ t: `${q[k] ? 'showed' : 'hid'} ${q.title} panel` });
                else if (Array.isArray(p[k]) && Array.isArray(q[k])) list(p[k], q[k], k === 'rows' || k === 'notes' ? q.title : `${q.title} ${WORD[k] || k}`, k, out);
                else val(p[k], q[k], `${q.title} ${WORD[k] || k}`, out);
            }
        }
    }

    function hbChanges(a, b) {
        const out = [];
        a = isObj(a) ? a : {}; b = isObj(b) ? b : {};
        // a portrait: inline art (or its hash in the list) moving to the account's address is the same picture
        const moving = /^(data:|sha:)/.test(a.art || '') && !b.art && b.artUrl && !a.artUrl;
        if (!moving && (a.art !== b.art || a.artUrl !== b.artUrl)) out.push({ t: (b.art || b.artUrl) ? (a.art || a.artUrl ? 'Portrait changed' : 'Portrait added') : 'Portrait removed' });
        for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
            if (SKIP.has(k) || k === 'art' || k === 'artUrl' || same(a[k], b[k])) continue;
            if (k === 'archived') out.push({ t: b[k] ? 'Archived' : 'Unarchived' });
            else if (k === 'panels' && Array.isArray(a[k]) && Array.isArray(b[k])) panels(a[k], b[k], out);
            else if (k === 'hp' && isObj(a[k]) && isObj(b[k])) for (const h of new Set([...Object.keys(a.hp), ...Object.keys(b.hp)])) val(a.hp[h], b.hp[h], HP[h] || 'HP ' + h, out);
            else if (k === 'profs' && isObj(a[k]) && isObj(b[k])) {
                for (const h of new Set([...Object.keys(a.profs), ...Object.keys(b.profs)])) {
                    if (Array.isArray(a.profs[h]) && Array.isArray(b.profs[h])) list(a.profs[h], b.profs[h], PROFS[h] || h, h, out);
                    else val(a.profs[h], b.profs[h], PROFS[h] || h, out);
                }
            }
            else if (Array.isArray(a[k]) && Array.isArray(b[k])) list(a[k], b[k], TOP[k] || cap(k), k, out);
            else if (isObj(a[k]) && isObj(b[k])) obj(a[k], b[k], TOP[k] || cap(k), out);
            else val(a[k], b[k], TOP[k] || cap(WORD[k] || k), out);
        }
        return out;
    }
    globalThis.hbChanges = hbChanges;
})();
