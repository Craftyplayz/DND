// The character builder (/characters/build, ROADMAP 4.2) and Level up (?up=<id>, 4.3). The rules are sheets/player/build.js
// (HbBuild); this file is the screens. What the player picks lives in the character's "build" record (HbBuild.blankChoices):
// every change rebuilds the whole character from it and saves it like any character (this browser, the account, the server
// backups), marked "draft" until Finish, so a reload or another device carries on where it stopped (?id=<id>).
// Level up keeps its picks in this tab (sessionStorage) and changes the character only at Finish, with an Undo on the sheet.
document.addEventListener('DOMContentLoaded', async () => {
    'use strict';
    const { $, esc, toast, debounce } = UI;
    const B = HbBuild, KEY = 'hb-sheet', API = '/sheets/player/';
    const uid = () => Math.random().toString(36).slice(2, 10);
    const M = hbModel(uid);
    const main = $('#main'), stepBox = $('#bd-step');
    const cloud = 'cloud' in main.dataset;
    const camps = JSON.parse($('#bd-camps')?.textContent || '[]');
    const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
    const clone = (x) => JSON.parse(JSON.stringify(x));
    const sg = (n) => (n < 0 ? '−' + -n : '+' + n);
    const params = new URLSearchParams(location.search);
    const UP = params.get('up') || '';

    // ---- storage: the same localStorage as the sheet and My Characters, read fresh before every write ----
    function load() {
        let db = null;
        try { db = JSON.parse(localStorage.getItem(KEY)); } catch (e) { }
        return isObj(db) && isObj(db.chars) ? db : { cur: '', chars: {} };
    }
    let warned = false;
    function store(db) {
        try { localStorage.setItem(KEY, JSON.stringify(db)); warned = false; return true; }
        catch (e) { if (!warned) toast("Couldn't save: this browser's storage is full or blocked.", 'err'); warned = true; return false; }
    }
    const post = (url, c) => fetch(API + url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(c), keepalive: JSON.stringify(c).length < 60000 });


    // ---- the character being built, or levelled up ----
    let id = params.get('id') || '', ch = null, C = null, rolls = [];
    if (UP) {
        C = load().chars[UP];
        if (!C && cloud) C = await fetch(API + 'cloud.php?id=' + encodeURIComponent(UP)).then((r) => (r.ok ? r.json() : null)).catch(() => null);
        if (!C || C.archived) { stepBox.innerHTML = '<h2>Character not found</h2><p>Open the character on this device first, then press Level up on its sheet.</p><p><a class="btn" href="/characters/">My Characters</a></p>'; return; }
        try { ch = JSON.parse(sessionStorage.getItem('hb-up-' + UP)); } catch (e) { }
        ch = isObj(ch) ? ch : { step: 'class', cls: '', entry: {}, hp: { mode: '', roll: 0 } };
    } else if (id) {
        C = load().chars[id];
        if (!C && cloud) C = await fetch(API + 'cloud.php?id=' + encodeURIComponent(id)).then((r) => (r.ok ? r.json() : null)).catch(() => null);
        if (C && !C.draft) { location.replace('/characters/' + encodeURIComponent(id)); return; }
        if (!C || !isObj(C.build)) { id = ''; C = null; history.replaceState(null, '', '/characters/build'); }
        else { ch = Object.assign(B.blankChoices(), C.build); rolls = Array.isArray(C.rolls) ? C.rolls : []; }
    }
    if (!ch) ch = B.blankChoices();
    if (UP) ch.rules = C.build?.rules || '2014';
    const rules = () => ch.rules || '2014';

    // ---- data: the character's rules version only (content.js); spells and equipment load when a step needs them ----
    const BASE = ['classes', 'subclasses', 'races', 'subraces', 'backgrounds', 'feats', 'languages'];
    let D = await hbContent(rules(), BASE);
    if (!D) { stepBox.innerHTML = '<h2>Couldn\x27t load the rules</h2><p>The builder needs a connection once to load the classes, races and backgrounds. Check your connection and reload the page.</p>'; return; }
    const hbAdd = () => Homebrew.addTo(D, rules(), ch.hbc ||= {});
    hbAdd();
    let ICONS = {};
    const versions = await hbContent.versions();
    await Promise.all([rules() === '2014' ? hbSpellNames(D) : null, hbIcons().then((x) => { ICONS = x; })]);
    const has2024 = versions.includes('2024');
    // more of the rules version's content (spells, equipment), loaded once and drawn again when it's there; true when it's in
    const asked = {};
    const need = (keys) => {
        const k = rules() + keys.join();
        if (!asked[k]) asked[k] = hbContent(rules(), keys).then((d) => { if (d) D = d; asked[k] = 'done'; render(); });
        return asked[k] === 'done';
    };
    // the campaign this character is for: its DM's rules for ability scores and hit points
    const campOf = () => (UP ? camps.find((x) => x.mine.includes(UP)) : camps.find((x) => x.id === ch.camp)) || null;
    const allowed = (k) => campOf()?.rules?.[k] || (k === 'methods' ? ['pb', 'std', 'roll', 'man'] : ['avg', 'roll']);

    // ---- save: rebuild the character from the picks and keep it like any character ----
    let lastSaved = 0;
    const cloudLater = debounce(() => { const c = load().chars[id]; if (c) { post('backup.php', c).catch(() => { }); if (cloud) post('cloud.php', c).catch(() => { }); } }, 1500);
    // homebrew this character picked is copied into its picks at once (ch.hbc, id -> entry), so the source being edited or taken away changes nothing
    function hbKeep() {
        const kept = (ch.hbc ||= {}), add = (x) => { if (x && !kept[x.id]) kept[x.id] = x; };
        for (const [, i] of JSON.stringify([ch.classes, ch.entry]).matchAll(/"hb-([a-z0-9]{6,40})"/g)) add((D.spells?.['hb-' + i] || D.feats?.['hb-' + i])?.hbx);
        for (const n of ch.equip?.extra || []) add(D.hbItem?.(n));
    }
    function built() {
        hbKeep();
        const db = load(), prev = db.chars[id] || {};
        const c = B.build(ch, D, M);
        Object.assign(c, { id, draft: 1, updated: Date.now(), rolls: rolls.slice(0, 100), art: prev.art || '', artUrl: prev.artUrl || '' });
        return { db, c };
    }
    function save() {
        if (UP) { hbKeep(); try { sessionStorage.setItem('hb-up-' + UP, JSON.stringify(ch)); } catch (e) { } return; }
        if (!id) { id = uid(); history.replaceState(null, '', '/characters/build?id=' + id + location.hash); }
        const { db, c } = built();
        db.chars[id] = c;
        if (store(db)) { lastSaved = Date.now(); $('#bd-saved').textContent = 'Saved'; cloudLater(); }
        C = c;
    }
    const saveSoon = debounce(save, 300);

    // ---- dice: the sheet's 3D dice (dice/dice3d.js), rolls kept in this character's roll log ----
    const ver = (($('script[src*="/builder.js"]')?.src || '').match(/\?v=\d+/) || [''])[0];
    let d3 = null, styleMod = null, diceStyle = null;
    const die = (n) => { const a = new Uint32Array(1); crypto.getRandomValues(a); return (a[0] % n) + 1; };
    async function roll(title, groups, shown = null) {
        const quick = () => groups.map(([n, k]) => [n, Array.from({ length: k }, () => die(n))]);
        let got;
        if (matchMedia('(prefers-reduced-motion: reduce)').matches) got = quick();
        else {
            try {
                const m = await (d3 ||= import('/dice/dice3d.js' + ver));
                const cm = await (styleMod ||= import('/dice/choice.js' + ver).catch(() => null));
                // the dice style is made once per page and reused by every throw
                const style = await (diceStyle ||= cm ? cm.styleFrom(cm.readChoice() || { set: { key: 'purple', builtin: true } }, m) : 'purple');
                got = await m.throwDice(groups, { style, accent: getComputedStyle(main).getPropertyValue('--btn').trim() || '#5b3f8f', sound: true });
            } catch (e) { d3 = null; got = quick(); }
        }
        const all = got.flatMap(([, r]) => r), total = all.reduce((a, b) => a + b, 0);
        const entry = { at: Date.now(), title, expr: groups.map(([n, k]) => `${k}d${n}`).join(' + '), shown: shown ? shown(got) : all.join(', '), total, nat: '', dice: got.map(([n, r]) => [n, r.slice()]) };
        if (UP) (ch.rolls ||= []).unshift(entry); else rolls.unshift(entry);
        return got;
    }

    // ---- icons: a coloured tile with a white symbol (icons.json), else the name's first letter in the kind's own colour ----
    function iconFor(kind, index, name = '') {
        const e = ICONS?.[kind]?.[index] || (kind === 'races' && ICONS?.races?.[D.subraces[index]?.race?.index || D.subraces[index]?.race]);
        if (e?.svg) {
            const svg = /^\s*<svg/.test(e.svg) ? e.svg : `<svg viewBox="${esc(e.viewBox || '0 0 512 512')}" aria-hidden="true">${e.svg}</svg>`;
            return `<span class="bd-ic" style="background:${/^#[0-9a-f]{3,8}$/i.test(e.color || '') ? e.color : 'var(--btn)'}">${svg}</span>`;
        }
        return `<span class="bd-ic bd-ic-${esc(kind)}" aria-hidden="true">${esc(String(name || '?').trim()[0]?.toUpperCase() || '?')}</span>`;
    }

    // ---- small pieces ----
    const view = { cls: 'list', clsAt: 0, race: 'list', bg: 'list', q: {}, az: {}, more: {}, sq: {}, sf: {}, fold: {} };
    const get = (path, o = ch) => path.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o);
    function set(path, v, o = ch) {
        const ks = path.split('.');
        const last = ks.pop();
        // a missing step becomes a list when the next key is a number (raceOpts.lang.0), else an object
        const box = ks.reduce((x, k, i) => { if (!isObj(x[k]) && !Array.isArray(x[k])) x[k] = /^\d+$/.test(ks[i + 1] ?? last) ? [] : {}; return x[k]; }, o);
        box[last] = v;
    }
    const arr = (path) => { const v = get(path); return Array.isArray(v) ? v : []; };
    const desc = (d) => (Array.isArray(d) ? d : [d]).filter(Boolean).map((p) => `<p>${esc(p)}</p>`).join('');
    const sel = (path, opts, label, cur = get(path)) => `<select class="field" data-b="${path}" aria-label="${esc(label)}">${opts.map(([v, t]) => `<option value="${esc(v)}"${String(cur ?? '') === String(v) ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
    const back = (act, label) => `<div class="bd-crumb"><button type="button" class="btn small" data-act="${act}">‹ ${esc(label)}</button></div>`;
    // ---- the description panel: the NAME of anything is a button that opens it; only the box beside it ticks ----
    const infos = {}, NODESC = '<p class="muted">No description available.</p>';
    const nm = (label, key, fn, pk = '') => { infos[key] = fn; return `<button type="button" class="bd-link" data-info="${esc(key)}"${pk ? ` data-pk="${esc(pk)}"` : ''}>${esc(label)}</button>`; };
    const money = (c) => (c && c.quantity != null ? `${c.quantity} ${c.unit || ''}`.trim() : '');
    function eqInfo(e) {
        if (!e) return null;
        const props = (e.properties || []).map((p) => p.name || B.words(String(p.index || p)));
        return { title: e.name, html: desc(e.desc), meta: [e.category_range || (e.armor_category && e.armor_category + ' armour') || (e.gear_category && B.words(e.gear_category)) || '', money(e.cost) && 'Cost: ' + money(e.cost),
            e.weight ? `Weight: ${e.weight} lb` : '', e.damage ? `Damage: ${e.damage.damage_dice} ${e.damage.damage_type}` : '', e.armor_class ? `Armour class: ${e.armor_class.base}${e.armor_class.dex_bonus ? ' + Dex' : ''}` : '', props.length ? 'Properties: ' + props.join(', ') : ''].filter(Boolean) };
    }
    function spellInfo(s, name = '') {
        if (!s) return null;
        const hl = (s.higher_level || []).filter(Boolean);
        return { title: s.name || name, tags: [s.ritual && 'Ritual', s.concentration && 'Concentration'].filter(Boolean), html: desc(s.desc) + (hl.length ? `<p><b>At higher levels.</b> ${esc(hl.join(' '))}</p>` : ''),
            meta: [s.school ? (s.level ? `Level ${s.level} ${s.school}` : `${s.school} cantrip`) : s.level ? `Level ${s.level}` : 'Cantrip', s.casting_time && 'Casting time: ' + s.casting_time, s.range && 'Range: ' + s.range,
                s.components && `Components: ${[].concat(s.components).join(', ')}${s.material ? ` (${s.material})` : ''}`, s.duration && 'Duration: ' + s.duration].filter(Boolean) };
    }
    const featInfo = (f) => f && { title: f.name, html: desc(f.desc), meta: (f.prerequisites || []).map((p) => 'Prerequisite: ' + (typeof p === 'string' ? p : p.desc || `${String(p.ability_score?.index || p.ability_score || '').toUpperCase()} ${p.minimum_score || ''}`.trim())) };
    // the text for a name that has no data of its own: skills and languages (rules.js), then feats, spells and equipment by name
    function look(label, v = '') {
        const low = String(label).toLowerCase(), key = String(v).replace(/^(skill|tool)-/, ''), R = window.HB_RULES || {};
        if (D.spells?.[v]?.desc) return spellInfo(D.spells[v]);
        if (R.skill?.[low]) return { title: label, meta: ['Skill'], html: desc(R.skill[low]) };
        const lg = Object.values(D.languages || {}).find((l) => (l.name || '').toLowerCase() === low);
        if (lg || R.lang?.[low]) return { title: label, meta: ['Language', lg?.type && 'Type: ' + lg.type, lg?.script && 'Script: ' + lg.script, lg?.typical_speakers?.length && 'Typical speakers: ' + lg.typical_speakers.join(', ')].filter(Boolean), html: desc(lg?.desc || R.lang?.[low]) };
        const ft = Object.values(D.feats || {}).find((f) => (f.name || '').toLowerCase() === low);
        if (ft) return featInfo(ft);
        return eqInfo(D.equipment?.[key] || Object.values(D.equipment || {}).find((e) => (e.name || '').toLowerCase() === low));
    }
    const lookName = (v, t, pk) => nm(t, 'x:' + v + ':' + t, () => look(t, v), pk);
    // a feature option's text: its own, else its line in the feature's list ("- Archery (PHB). ...")
    const optInfo = (f, o) => {
        const short = o.name.replace(/^.*?: /, '').toLowerCase();
        const line = o.desc || (f.desc || []).filter((l) => l.slice(0, 2) === '- ' && l.slice(2).toLowerCase().startsWith(short)).map((l) => l.slice(2));
        return { title: o.name.replace(/^.*?: /, ''), html: desc(line) };
    };
    // a group of checkboxes that keeps at most n picked (a pick past n is refused with a note); the name beside each opens its text
    const checks = (path, options, n, label, nameOf = lookName) => {
        const have = arr(path);
        return `<fieldset class="bd-checks"><legend>${esc(label)} <span class="muted">${have.length} of ${n} chosen</span></legend><div class="bd-cgrid">${options.map(([v, t]) =>
            `<div class="bd-ck"><input type="checkbox" data-pick="${path}" data-n="${n}" value="${esc(v)}" aria-label="${esc(t)}"${have.includes(v) ? ' checked' : ''}${!have.includes(v) && have.length >= n ? ' disabled' : ''}>${nameOf(v, t, `[data-pick="${path}"][value="${v}"]`)}</div>`).join('')}</div></fieldset>`;
    };
    const tile = (label, value, sub = '') => `<div class="tile"><b>${esc(value)}</b><span>${esc(label)}</span>${sub ? `<span>${esc(sub)}</span>` : ''}</div>`;

    // a searchable list of rows (icon, name, chevron), with A to Z; the rows redraw on their own while typing
    const pickers = {};
    function rowsHtml(kind) {
        const { items, cur, act } = pickers[kind], q = (view.q[kind] || '').trim().toLowerCase(), L = view.az[kind] || '';
        const shown = items.filter((i) => (!q || i.name.toLowerCase().includes(q)) && (!L || i.name[0].toUpperCase() === L));
        const cut = shown.slice(0, view.more[kind] ? Infinity : 250);
        return cut.map((i) => `<button type="button" class="bd-row" data-act="${act}" data-id="${esc(i.id)}"${i.id === cur ? ' aria-current="true"' : ''}>${iconFor(i.kind || kind, i.id, i.name)}
            <span class="bd-nm">${esc(i.name)}${i.sub ? `<small>${esc(i.sub)}</small>` : ''}</span>${i.id === cur ? '<span class="badge g">Selected</span>' : ''}<span class="bd-chev" aria-hidden="true">›</span></button>`).join('')
            + (shown.length > cut.length ? `<button type="button" class="btn small" data-act="more" data-k="${kind}">Show all ${shown.length}</button>` : '')
            || '<p class="muted">Nothing matches that search.</p>';
    }
    function picker(kind, items, cur, act, label) {
        pickers[kind] = { items, cur, act };
        const letters = [...new Set(items.map((i) => i.name[0]?.toUpperCase()).filter(Boolean))].sort();
        return `<div class="bd-find"><input class="field" type="search" data-q="${kind}" value="${esc(view.q[kind] || '')}" placeholder="Search ${esc(label)}" aria-label="Search ${esc(label)}" autocomplete="off">
            ${letters.length > 8 ? `<div class="bd-az" role="group" aria-label="First letter">${letters.map((l) => `<button type="button" data-act="az" data-k="${kind}" data-v="${l}" aria-pressed="${view.az[kind] === l}">${l}</button>`).join('')}</div>` : ''}</div>
            <div class="bd-list" id="bd-list-${kind}">${rowsHtml(kind)}</div>`;
    }

    // ---- the steps ----
    const STEPS = UP ? [['class', 'Class and level'], ['review', 'Review']]
        : [['name', 'Name and look'], ['class', 'Class and level'], ['race', 'Race'], ['abilities', 'Ability scores'], ['background', 'Background'], ['equipment', 'Equipment'], ['review', 'Review']];
    let step = (location.hash.slice(1) && STEPS.some(([k]) => k === location.hash.slice(1))) ? location.hash.slice(1) : STEPS.some(([k]) => k === ch.step) ? ch.step : STEPS[0][0];
    const level = () => (UP ? 1 : +ch.level || 1);
    const scores = () => (UP ? Object.fromEntries(C.abilities.map((a) => [a.key, +a.score])) : Object.fromEntries((C || B.build(ch, D, M)).abilities.map((a) => [a.key, +a.score])));
    const now = () => (UP ? C : B.build(ch, D, M));

    // keep the class levels adding up to the character's level, and drop picks above a class's level (Q10: only tied picks)
    function fixLevels() {
        if (UP || !ch.classes.length) return;
        const others = ch.classes.slice(1);
        let rest = level() - 1;
        for (const e of others) { e.levels = rest > 0 ? Math.max(1, Math.min(+e.levels || 1, rest)) : 0; rest -= e.levels; }
        ch.classes = ch.classes.filter((e, i) => !i || e.levels > 0);
        ch.classes[0].levels = level() - ch.classes.slice(1).reduce((t, e) => t + e.levels, 0);
        for (const e of ch.classes) prune(e);
        for (const k of Object.keys(ch.hp.rolls || {})) if (+k > level()) delete ch.hp.rolls[k];
    }
    function prune(e) {
        const lv = +e.levels;
        if (e.sub && lv < B.subLevel(e.id, D)) e.sub = '';
        for (const k of Object.keys(e.asi || {})) if (+k > lv) delete e.asi[k];
        const keep = new Set(Array.from({ length: lv }, (_, i) => B.featuresAt(e.id, e.sub, i + 1, D).map((f) => B.fid(f, i + 1))).flat());
        for (const box of [e.opts, e.picks]) for (const k of Object.keys(box || {})) if (!keep.has(k)) delete box[k];
    }
    const newEntry = (cid) => ({ id: cid, levels: 1, sub: '', profs: {}, opts: {}, asi: {}, picks: {}, spells: [] });

    // what's still to pick on each step (shown, never blocking)
    function todo(k) {
        const out = [];
        if (UP) {
            if (k === 'class' && !ch.cls) out.push('Pick a class for the new level');
            return out;
        }
        if (k === 'name' && !String(ch.name).trim()) out.push('Give the character a name');
        if (k === 'class') {
            if (!ch.classes.length) out.push('Pick a class');
            for (const [i, e] of ch.classes.entries()) {
                const cls = D.classes[e.id];
                if (!cls) continue;
                if (+e.levels >= B.subLevel(e.id, D) && !e.sub && B.subsOf(e.id, D, rules()).length) out.push(`Pick a ${cls.name} subclass`);
                const pcs = i ? cls.multi_classing?.proficiency_choices || [] : cls.proficiency_choices || [];
                pcs.forEach((pc, j) => { if ((e.profs?.[j] || []).length < pc.choose) out.push(`${cls.name}: choose ${pc.choose} ${pc.desc ? '' : 'proficiencies'}`.trim()); });
                for (const lv of B.asiLevels(cls).filter((l) => l <= e.levels)) if (!e.asi?.[lv]) out.push(`${cls.name} ${lv}: pick an ability score improvement or a feat`);
            }
            if (ch.hp.mode === 'roll') for (let l = 2; l <= level(); l++) if (!ch.hp.rolls?.[l]) { out.push('Roll hit points for every level'); break; }
        }
        if (k === 'race' && !ch.race) out.push('Pick a race');
        if (k === 'abilities' && B.AB.some((a) => !B.baseScores(ch)[a])) out.push('Give every ability a score');
        if (k === 'abilities' && ch.method === 'pb' && B.pbCost(ch.pb) > B.PB_BUDGET) out.push(`Over the 27-point budget by ${B.pbCost(ch.pb) - B.PB_BUDGET}`);
        if (k === 'background' && !ch.bg) out.push('Pick a background');
        return out;
    }

    // ---- step: name and look ----
    const STEP = {};
    STEP.name = () => {
        const art = C?.art || C?.artUrl || '';
        return `<h2>Name and look</h2>
        <div class="form">
            <label>Character name<input class="field" data-b="name" value="${esc(ch.name)}" autocomplete="off" placeholder="Thorin Rockfist"></label>
            <fieldset><legend>Starting level</legend><div class="bd-lvl" role="radiogroup" aria-label="Starting level">${Array.from({ length: 20 }, (_, i) =>
                `<label><input type="radio" name="level" data-b="level" data-num data-redraw value="${i + 1}"${i + 1 === level() ? ' checked' : ''}><span>${i + 1}</span></label>`).join('')}</div>
                <p class="hint">Level ${level()}: proficiency bonus ${sg(B.profBonus(level()))}. The class step then asks for the subclass, ability score improvements and hit points for every level up to ${level()}.</p></fieldset>
            ${has2024 ? `<fieldset><legend>Rules</legend>${sel('rules', [['2014', '2014 rules'], ['2024', '2024 rules']], 'Rules')}<p class="hint">Lists only show classes, races and backgrounds for these rules.</p></fieldset>` : ''}
            ${cloud && camps.length ? `<label>Building for${sel('camp', [['', 'No campaign'], ...camps.map((x) => [x.id, x.name])], 'Building for a campaign')}</label>
                <p class="hint">The campaign's character rules apply, and the character joins it when you finish.</p>` : ''}
            <div class="bd-art">${art ? `<img src="${esc(art)}" alt="" width="96" height="96">` : '<span class="bd-noart">No portrait</span>'}
                <div><button class="btn small" type="button" data-act="art">${art ? 'Change portrait' : 'Upload portrait'}</button>${art ? ' <button class="btn small" type="button" data-act="artdel">Remove</button>' : ''}
                <p class="hint">Optional. JPG, PNG, WebP or GIF, cut to a square. You can crop it again on the sheet.</p></div></div>
        </div>`;
    };

    // ---- step: class (and level), with its skills, features, improvements, spells and hit points ----
    const classRows = () => B.listOf(D, 'classes', rules()).map((c) => ({ id: c.id, name: c.name, sub: `Hit die d${c.hit_die}` }));
    STEP.class = () => {
        if (UP) return upClass();
        if (view.cls === 'list' || !D.classes[ch.classes[view.cls]?.id]) {
            const adding = view.clsAt >= ch.classes.length && ch.classes.length;
            return `<h2>${adding ? 'Add another class' : 'Choose a class'}</h2><p class="hint">Tap a class to read about it and make its choices.${adding ? ' Multiclassing: the ability score minimums show as a warning, not a block.' : ''}</p>
                ${ch.classes.length ? `<div class="bd-chips">${ch.classes.map((e, i) => `<button type="button" class="btn small" data-act="clsopen" data-i="${i}">${esc(D.classes[e.id]?.name || e.id)} ${e.levels}</button>`).join('')}</div>` : ''}
                ${picker('classes', classRows(), ch.classes[view.clsAt]?.id, 'cls', 'classes')}`;
        }
        return classDetail(view.cls);
    };
    function prereq(cid) {
        const mc = D.classes[cid]?.multi_classing, S = scores();
        if (!mc) return '';
        const need = (mc.prerequisites || []).map((p) => [String(p.ability_score?.index || p.ability_score).toUpperCase(), +p.minimum_score]);
        const any = (mc.prerequisite_options?.from?.options || []).map((p) => [String(p.ability_score?.index || p.ability_score).toUpperCase(), +p.minimum_score]);
        const miss = need.filter(([a, n]) => (S[a] || 0) < n);
        const anyMiss = any.length && !any.some(([a, n]) => (S[a] || 0) >= n);
        return miss.length || anyMiss ? `<p class="note">Multiclassing into ${esc(D.classes[cid].name)} asks for ${[...need, ...(anyMiss ? [[any.map(([a]) => a).join(' or '), any[0][1]]] : [])].map(([a, n]) => `${a} ${n}`).join(' and ')}. You can still take it; your DM decides.</p>` : '';
    }
    function classDetail(ci, only = 0) {
        const e = ci === 'up' ? ch.entry : ch.classes[ci], cls = D.classes[e.id], lv = only || +e.levels, P = ci === 'up' ? 'entry' : `classes.${ci}`;
        const from = only || 1, multi = ci === 'up' ? C.classes.some((k) => k.name) && !C.classes.some((k) => k.name === cls.name) : ci > 0;
        const subL = B.subLevel(e.id, D), subs = B.subsOf(e.id, D, rules());
        const feats = Array.from({ length: lv - from + 1 }, (_, i) => from + i).flatMap((l) => B.featuresAt(e.id, e.sub, l, D).map((f) => [l, f]));
        const asiL = B.asiLevels(cls).filter((l) => l >= from && l <= lv);
        const unlock = [...feats.map(([l, f]) => [l, f.name, !!(f.choices?.options || B.pickOf(f)), f]),
            ...(subL >= from && subL <= lv && !e.sub ? [[subL, 'Subclass', true]] : []), ...asiL.map((l) => [l, 'Ability Score Improvement or a feat', true])].sort((a, b) => a[0] - b[0]);
        const out = [];
        if (ci !== 'up') out.push(back('clslist', ch.classes.length > 1 ? 'Classes' : 'Change class'));
        out.push(`<div class="bd-hero">${iconFor('classes', e.id, cls.name)}<div><h2>${esc(cls.name)}</h2><div class="badges"><span class="badge">Level ${only ? `${only - 1} → ${only}` : lv}</span><span class="badge">Hit die d${cls.hit_die}</span>
            ${(cls.saving_throws || []).length ? `<span class="badge">Saves: ${(cls.saving_throws || []).map((s) => String(s.index || s).toUpperCase()).join(', ')}</span>` : ''}</div></div></div>`);
        out.push(desc(cls.desc) || `<p>A ${esc(cls.name.toLowerCase())} has a d${cls.hit_die} hit die${cls.spellcasting ? ` and casts spells with ${esc(B.casterOf(e.id, D).ab)}` : ''}. Its features for each level are below; pick what it asks for.</p>`);
        if (multi) out.push(prereq(e.id));
        if (ci !== 'up' && ci > 0) out.push(`<label class="bd-inl">Levels in ${esc(cls.name)} ${sel(`${P}.levels`, Array.from({ length: Math.max(1, level() - 1) }, (_, i) => [i + 1, String(i + 1)]), 'Levels in this class')}</label>`);
        out.push(`<div class="bd-sect"><h3>${only ? `What level ${only} gets` : `What a level ${lv} ${esc(cls.name.toLowerCase())} gets`}</h3><ul class="bd-unlock">${unlock.map(([l, t, pick, f]) =>
            `<li${pick ? ' class="todo"' : ''}><span class="lv">Lv ${l}</span><span>${f ? nm(t, `feature:${e.id}:${B.fid(f, l)}`, () => ({ title: t, meta: [`${cls.name} level ${l}`], html: desc(f.desc) })) : esc(t)}${pick ? ' <span class="badge">you choose</span>' : ''}</span></li>`).join('') || '<li><span>No new features at this level.</span></li>'}</ul></div>`);
        // subclass, picked at its level (level-1 subclasses right here, Q27)
        if (lv >= subL && subs.length && (subL >= from || !e.sub)) out.push(`<div class="bd-sect"><h3>Subclass <span class="muted">level ${subL}</span></h3><div class="bd-picks" role="radiogroup" aria-label="Subclass">${subs.map((s) =>
            `<div class="bd-pick"><input type="radio" name="${P}.sub" data-b="${P}.sub" data-redraw value="${esc(s.id)}" aria-label="${esc(s.name)}"${e.sub === s.id ? ' checked' : ''}><div class="box">${iconFor('subclasses', `${e.id}--${s.id}`, s.name)}<b>${nm(s.name, 'sub:' + s.id, () => ({ title: s.name, meta: [s.subclass_flavor || ''].filter(Boolean), html: desc(s.desc) }), `[name="${P}.sub"][value="${s.id}"]`)}</b>${s.subclass_flavor ? `<small>${esc(s.subclass_flavor)}</small>` : ''}</div></div>`).join('')}</div>
            ${e.sub && D.subclasses[e.sub] ? `<div class="bd-desc">${desc(D.subclasses[e.sub].desc)}</div>` : ''}</div>`);
        // skills and other proficiencies: the class's own at character level 1, its multiclass ones later
        if (from === 1) {
            const pcs = multi ? cls.multi_classing?.proficiency_choices || [] : cls.proficiency_choices || [];
            if (pcs.length) out.push(`<div class="bd-sect"><h3>${multi ? 'Multiclass proficiencies' : 'Skills and proficiencies'}</h3>${pcs.map((pc, j) => !pc.from
                ? `<label class="bd-wide">${esc(pc.desc || 'Proficiencies of your choice')}<input class="field" data-b="${P}.ptext.${j}" value="${esc(e.ptext?.[j] || '')}" placeholder="Type your picks" autocomplete="off"></label>` :
                checks(`${P}.profs.${j}`, (pc.from?.options || []).map((o) => o.item?.index || o.item).filter(Boolean).map((x) => [x, B.profKind(x, M)[1] + '']), pc.choose, `Choose ${pc.choose}${pc.desc && !/^choose/i.test(pc.desc) ? ': ' + pc.desc : ''}`)).join('')}</div>`);
        }
        // feature picks (fighting style, metamagic, invocations, expertise, a Lore bard's skills)
        const fp = feats.filter(([, f]) => f.choices?.options || B.pickOf(f));
        if (fp.length) {
            const prof = UP ? C.skills.filter((s) => s.p >= 1).map((s) => s.name) : now().skills.filter((s) => s.p >= 1).map((s) => s.name);
            out.push(`<div class="bd-sect"><h3>Feature choices</h3>${fp.map(([l, f]) => {
                const pk = B.pickOf(f);
                if (pk) return checks(`${P}.picks.${B.fid(f, l)}`, (pk[0] === 'expert' ? prof : M.SKILLS.map(([s]) => s)).map((s) => [s, s]), pk[1], `Level ${l} ${f.name}: ${pk[0] === 'expert' ? `double proficiency in ${pk[1]} skills` : `${pk[1]} skills`}`);
                const n = B.chooseN(f, cls, l, 0);
                return n ? checks(`${P}.opts.${B.fid(f, l)}`, f.choices.options.map((o) => [o.index, o.name.replace(/^.*?: /, '')]), n, `Level ${l} ${f.name}`, (v, t, pk) => nm(t, 'opt:' + v, () => optInfo(f, f.choices.options.find((o) => o.index === v)), pk)) : '';
            }).join('')}</div>`);
        }
        // ability score improvements: +2 to one, +1 to two, or a feat where the rules grant one (Q78)
        if (asiL.length) {
            const feats2 = B.listOf(D, 'feats', rules());
            out.push(`<div class="bd-sect"><h3>Ability score improvements</h3>${asiL.map((l) => {
                const a = e.asi?.[l] || {}, p = `${P}.asi.${l}`, abs = B.AB.map((x) => [x, x]);
                return `<div class="bd-asi"><span class="lv">Level ${l}</span>${sel(p + '.k', [['', 'Choose...'], ['+2', '+2 to one score'], ['+1', '+1 to two scores'], ...(feats2.length ? [['feat', 'A feat']] : [])], `Level ${l} improvement`, a.k || '')}
                    ${a.k === '+2' ? sel(p + '.a.0', [['', 'Ability...'], ...abs], 'Ability', a.a?.[0] || '') : ''}
                    ${a.k === '+1' ? sel(p + '.a.0', [['', 'Ability...'], ...abs], 'First ability', a.a?.[0] || '') + sel(p + '.a.1', [['', 'Ability...'], ...abs], 'Second ability', a.a?.[1] || '') : ''}
                    ${a.k === 'feat' ? sel(p + '.feat', [['', 'Feat...'], ...feats2.map((f) => [f.id, f.name + (f.hbx ? Homebrew.SUFFIX : '')])], 'Feat', a.feat || '') : ''}</div>`;
            }).join('')}<p class="hint">Scores can't go over 20 this way.</p>${asiL.filter((l) => e.asi?.[l]?.k === 'feat' && D.feats[e.asi[l].feat]).map((l) => { const f = D.feats[e.asi[l].feat];
                return `<div class="bd-featdesc"><h4>Level ${l}: ${nm(f.name, 'feat:' + f.name, () => featInfo(f))}</h4>${(featInfo(f).meta || []).map((m) => `<p class="hint">${esc(m)}</p>`).join('')}${desc(f.desc) || NODESC}</div>`; }).join('')}</div>`);
        }
        out.push(spellsHtml(e, P, lv, from));
        return out.join('');
    }
    // spells inside the class step: cantrips and spells up to the highest level the class can cast, with the class's counts.
    // A fold per spell level (its picked count in the summary), a row per spell, search and filters, the picks as chips on top.
    function spellsHtml(e, P, lv, from) {
        const k = B.casterOf(e.id, D);
        if (k.kind === 'none') return '';
        if (!need(['spells'])) return '<div class="bd-sect"><h3>Spells</h3><p class="hint">Loading the spells...</p></div>';
        const top = B.maxSpellLevel(e.id, lv, D), n = B.spellCounts(e.id, lv, D, scores()), was = from > 1 ? B.spellCounts(e.id, from - 1, D, scores()) : { cantrips: 0, known: 0, prepared: 0, book: 0 };
        const always = new Set(B.alwaysPrepared(e.id, e.sub, lv, D));
        const pool = B.spellPool(e.id, e.sub, D).filter((s) => s.level !== null && s.level <= top && !always.has(s.index));
        if (!pool.length && !always.size) return `<div class="bd-sect"><h3>Spells</h3><p class="hint">No spells to pick at this level.</p></div>`;
        const picked = arr(`${P}.spells`), lvOf = (i) => D.spells[i]?.level ?? 0;
        const cant = picked.filter((i) => !lvOf(i)).length, rest = picked.length - cant;
        const want = n.book ? n.book - was.book : n.known ? n.known - was.known : n.prepared - (from > 1 ? was.prepared : 0), wantC = n.cantrips - was.cantrips;
        const q = (view.sq[P] || '').trim().toLowerCase(), F = (view.sf[P] ||= { school: '', ritual: false, conc: false }), det = (s) => D.spells[s.index] || {};
        const schools = [...new Set(pool.map((s) => det(s).school).filter(Boolean))].sort();
        const filtering = !!(q || F.school || F.ritual || F.conc);
        const shown = pool.filter((s) => (!q || s.name.toLowerCase().includes(q)) && (!F.school || det(s).school === F.school) && (!F.ritual || det(s).ritual) && (!F.conc || det(s).concentration));
        const pkOf = (i) => `[data-pick="${P}.spells"][value="${i}"]`;
        const row = (s) => {
            const d = det(s);
            return `<div class="bd-sprow"><input type="checkbox" data-pick="${P}.spells" data-n="999" value="${esc(s.index)}" aria-label="${esc(s.name)}"${picked.includes(s.index) ? ' checked' : ''}>${nm(s.name, 'spell:' + s.index, () => spellInfo(D.spells[s.index], s.name), pkOf(s.index))}
                <span class="bd-rm"><span class="bd-sm">${esc(d.school || '')}</span><span class="bd-sm">${esc(d.casting_time || '')}</span><span class="bd-tags">${d.hbx ? '<span class="badge p">Homebrew</span>' : ''}${d.ritual ? '<span class="badge">Ritual</span>' : ''}${d.concentration ? '<span class="badge">Conc.</span>' : ''}</span></span></div>`;
        };
        const lvls = [...new Set(pool.map((s) => s.level))].sort((a, b) => a - b);
        const fold = (l) => {
            const g = shown.filter((s) => s.level === l), key = P + '|' + l, cnt = picked.filter((i) => lvOf(i) === l).length, cap = l ? 0 : wantC;
            if (filtering && !g.length) return '';
            const cut = g.slice(0, view.more['sp' + key] ? Infinity : 100);
            return `<details class="bd-fold" data-fold="${esc(key)}"${filtering ? ' data-auto' : ''}${(filtering ? true : view.fold[key] ?? l === lvls[0]) ? ' open' : ''}><summary>${l ? `Level ${l}` : 'Cantrips'} <span class="muted">(${cap > 0 ? `${cnt} of ${cap} picked` : `${cnt} picked`}${filtering ? `, ${g.length} shown` : ''})</span></summary>
                <div class="bd-splist">${cut.map(row).join('')}${g.length > cut.length ? `<button type="button" class="btn small" data-act="more" data-k="sp${esc(key)}">Show all ${g.length}</button>` : ''}</div></details>`;
        };
        const over = (have, max) => (max && have > max ? ` <span class="badge r">${have - max} over</span>` : '');
        const total = wantC + Math.max(0, want);
        const chips = picked.length ? `<div class="bd-picked"><h4>Picked (${picked.length}${total > 0 ? ` of ${total}` : ''})</h4><div class="bd-chips">${picked.map((i) => `<span class="bd-chip">${nm(D.spells[i]?.name || B.words(i), 'spell:' + i, () => spellInfo(D.spells[i], B.words(i)), pkOf(i))}<button type="button" data-act="spdel" data-p="${P}.spells" data-v="${esc(i)}" aria-label="Remove ${esc(D.spells[i]?.name || B.words(i))}">×</button></span>`).join('')}</div></div>` : '';
        return `<div class="bd-sect"><h3>Spells</h3>
            <p class="hint">${wantC > 0 ? `Cantrips: ${wantC} to pick (${cant} picked)${over(cant, wantC)}. ` : ''}${want > 0 ? `${n.book ? 'Spellbook' : n.known ? 'Spells known' : 'Prepared spells'}: ${want} to pick (${rest} picked)${over(rest, want)}.` : ''}
            ${n.prepared && !n.book ? ' Prepared casters can change these after a long rest.' : ''}${n.book ? ` You prepare ${n.prepared} of them each day.` : ''}</p>
            ${always.size ? `<p class="hint">Always prepared: ${[...always].map((i) => esc(D.spells[i]?.name || B.words(i))).join(', ')}.</p>` : ''}
            ${chips}
            <div class="bd-spfilter"><input class="field bd-sq" type="search" data-sq="${P}" value="${esc(view.sq[P] || '')}" placeholder="Search spells" aria-label="Search spells" autocomplete="off">
                ${schools.length ? `<select class="field" data-sf="${P}" data-f="school" aria-label="School of magic"><option value="">Any school</option>${schools.map((x) => `<option${F.school === x ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select>
                <label class="check"><input type="checkbox" data-sf="${P}" data-f="ritual"${F.ritual ? ' checked' : ''}> Ritual</label><label class="check"><input type="checkbox" data-sf="${P}" data-f="conc"${F.conc ? ' checked' : ''}> Concentration</label>` : ''}</div>
            <div id="bd-sp-${P.replace(/\W/g, '')}">${lvls.map(fold).join('') || '<p class="muted">No spells match that search.</p>'}</div></div>`;
    }
    // hit points: every level's die, the average or a 3D roll (level 1 is always the maximum)
    function hpHtml() {
        const ways = allowed('hp');
        if (!ways.includes(ch.hp.mode)) ch.hp.mode = ways[0];
        const seq = B.levels(ch), con = B.mod(scores().CON || 10);
        const per = seq.map((L) => { const d = +D.classes[L.cls]?.hit_die || 8; return [L, d, L.at === 1 ? d : ch.hp.mode === 'roll' ? +ch.hp.rolls?.[L.at] || 0 : d / 2 + 1]; });
        const max = now().hp.cur;
        return `<div class="bd-sect"><h3>Hit points</h3>${ways.length > 1 ? `<div class="seg" role="radiogroup" aria-label="Hit points">${ways.map((w) => `<label><input type="radio" name="hpmode" data-b="hp.mode" data-redraw value="${w}"${ch.hp.mode === w ? ' checked' : ''}><span>${w === 'avg' ? 'Take the average' : 'Roll each level'}</span></label>`).join('')}</div>` : `<p class="hint">Your DM's rules: ${ways[0] === 'avg' ? 'take the average' : 'roll each level'}.</p>`}
            <p class="hint">Level 1 is the hit die's maximum. Each later level adds ${ch.hp.mode === 'avg' ? 'the average' : 'a roll of the hit die'}, plus your CON modifier (${sg(con)} now).</p>
            ${ch.hp.mode === 'roll' && seq.length > 1 ? `<p><button type="button" class="btn small" data-act="hproll">Roll ${per.some(([L, , v]) => L.at > 1 && !v) ? 'the rest' : 'them all again'}</button> <span class="hint">Every roll goes in the roll log.</span></p>` : ''}
            <div class="bd-hp">${per.map(([L, d, v]) => `<div><small>Lv ${L.at} · d${d}</small><b>${v || '–'}</b>${ch.hp.mode === 'roll' && L.at > 1 ? `<button type="button" class="btn small" data-act="hp1" data-l="${L.at}" aria-label="Roll level ${L.at}">Roll</button>` : ''}</div>`).join('')}</div>
            <p class="bd-big">Hit points: ${max}</p></div>`;
    }
    // Level up: which class gets the level, then that class's choices for the new level only
    function upClass() {
        if (!ch.cls || view.cls === 'list') {
            const mine = C.classes.filter((k) => k.name).map((k) => Object.keys(D.classes).find((x) => D.classes[x].name === k.name)).filter(Boolean);
            const rows = [...mine.map((x) => ({ id: x, name: D.classes[x].name, sub: `Level ${C.classes.find((k) => k.name === D.classes[x].name).level} → ${+C.classes.find((k) => k.name === D.classes[x].name).level + 1}` })),
                ...classRows().filter((r) => !mine.includes(r.id)).map((r) => ({ ...r, sub: 'New class (multiclass) · ' + r.sub }))];
            return `<h2>Level up ${esc(C.name || 'your character')}</h2><p class="hint">Level ${C.classes.reduce((t, k) => t + (+k.level || 0), 0)} → ${C.classes.reduce((t, k) => t + (+k.level || 0), 0) + 1}. Pick the class that gets the new level.</p>${picker('classes', rows, ch.cls, 'upcls', 'classes')}`;
        }
        const cls = D.classes[ch.cls], row = C.classes.find((k) => k.name === cls.name), n = (row ? +row.level : 0) + 1;
        ch.entry.id = ch.cls;
        // the subclass already chosen (in the builder's record), so its features come too
        if (!ch.entry.sub) ch.entry.sub = [...(C.build?.classes || []), ...(C.build?.ups || []).map((u) => u.entry)].find((x) => x?.id === ch.cls && x.sub)?.sub || '';
        const ways = allowed('hp');
        if (!ways.includes(ch.hp.mode)) ch.hp.mode = ways[0];
        const avg = cls.hit_die / 2 + 1;
        return back('upback', 'Pick another class') + classDetail('up', n) + `<div class="bd-sect"><h3>Hit points</h3>
            ${ways.length > 1 ? `<div class="seg" role="radiogroup" aria-label="Hit points">${ways.map((w) => `<label><input type="radio" name="hpmode" data-b="hp.mode" data-redraw value="${w}"${ch.hp.mode === w ? ' checked' : ''}><span>${w === 'avg' ? `Take the average (${avg})` : 'Roll the hit die'}</span></label>`).join('')}</div>` : `<p class="hint">Your DM's rules: ${ways[0] === 'avg' ? 'take the average' : 'roll the hit die'}.</p>`}
            ${ch.hp.mode === 'roll' ? `<p><button type="button" class="btn small" data-act="uproll">${ch.hp.roll ? 'Roll again' : `Roll the d${cls.hit_die}`}</button> ${ch.hp.roll ? `<b class="bd-big">${ch.hp.roll}</b>` : ''}</p>` : ''}
            <p class="hint">Plus your CON modifier (${sg(B.mod(scores().CON || 10))}).</p></div>`;
    }

    // ---- step: race (subraces replace the list, with Back) ----
    const subsOfRace = (rid) => B.listOf(D, 'subraces', rules()).filter((s) => (s.race?.index || s.race) === rid);
    const bonusText = (r, s) => [...(r?.ability_bonuses || []), ...(s?.ability_bonuses || [])].map((b) => `${String(b.ability_score?.index || b.ability_score).toUpperCase()} ${sg(+b.bonus)}`).join(', ')
        + (r?.ability_bonus_options ? `${r.ability_bonuses?.length ? ', ' : ''}+1 to ${r.ability_bonus_options.choose} of your choice` : '');
    STEP.race = () => {
        const r = D.races[ch.race], s = D.subraces[ch.sub];
        if (view.race === 'list' || !r) return `<h2>Choose a race</h2><p class="hint">Races with subraces open a second list.</p>${picker('races', B.listOf(D, 'races', rules()).map((x) => ({ id: x.id, name: x.name,
            sub: [bonusText(x), x.speed ? `Speed ${x.speed} ft` : '', x.size, subsOfRace(x.id).length > 1 ? `${subsOfRace(x.id).length} subraces` : ''].filter(Boolean).join(' · ') })), ch.race, 'race', 'races')}`;
        if (view.race === 'subs') return back('racelist', 'All races') + `<div class="bd-hero">${iconFor('races', r.id || ch.race, r.name)}<div><h2>${esc(r.name)}</h2><span class="hint">Pick a subrace</span></div></div>`
            + picker('subraces', subsOfRace(ch.race).map((x) => ({ id: x.id, name: x.name, kind: 'races', sub: bonusText(r, x) })), ch.sub, 'sub', 'subraces');
        const subs = subsOfRace(ch.race);
        return back(subs.length > 1 ? 'racesubs' : 'racelist', subs.length > 1 ? 'Subraces' : 'All races')
            + `<div class="bd-hero">${iconFor('races', ch.sub || ch.race, (s || r).name)}<div><h2>${esc((s || r).name)}</h2><div class="badges"><span class="badge b">${esc(bonusText(r, s))}</span>${r.speed ? `<span class="badge">Speed ${r.speed} ft</span>` : ''}<span class="badge">${esc(r.size || '')}</span></div></div></div>
            ${desc(r.desc)}${s ? desc(s.desc) : ''}<div class="bd-desc">${[r.age, r.size_description, r.language_desc].filter(Boolean).map((p) => `<p class="muted">${esc(p)}</p>`).join('')}</div>
            <div class="bd-sect"><h3>Traits</h3><dl class="bd-traits">${[...(r.traits || []), ...(s?.traits || [])].map((t) => `<div><dt>${nm(t.name, 'trait:' + (t.index || t.name), () => ({ title: t.name, html: desc(t.desc) }))}</dt><dd>${esc((Array.isArray(t.desc) ? t.desc : [t.desc]).filter(Boolean).join(' '))}</dd></div>`).join('') || '<p class="muted">No traits listed.</p>'}</dl></div>
            ${raceChoicesHtml()}`;
    };
    function raceChoicesHtml() {
        const list = B.raceChoices(ch, D);
        if (!list.length) return '<div class="bd-sect"><h3>Your picks</h3><p class="hint">No picks needed for this race.</p></div>';
        return `<div class="bd-sect"><h3>Your picks</h3>${list.map((x) => (x.n === 1
            ? `<label class="bd-inl">${esc(x.label)} ${sel(`raceOpts.${x.key}.0`, [['', 'Choose...'], ...x.options], x.label, (ch.raceOpts[x.key] || [])[0] || '')}</label>`
            : checks(`raceOpts.${x.key}`, x.options, x.n, x.label))).join('')}</div>`;
    }

    // ---- step: ability scores ----
    const METHODS = [['pb', 'Point buy'], ['std', 'Standard array'], ['roll', '4d6 drop lowest'], ['man', 'Manual']];
    STEP.abilities = () => {
        const ok = allowed('methods');
        if (!ok.includes(ch.method)) ch.method = ok[0];
        const base = B.baseScores(ch), bon = B.bonuses(ch, D), m = ch.method;
        let intro = '';
        if (m === 'pb') {
            const left = B.PB_BUDGET - B.pbCost(ch.pb);
            intro = `<p class="bd-big${left < 0 ? ' bd-over' : ''}">Points left: ${left}</p><p class="hint">Of 27. Scores 8 to 15 before racial bonuses.${left < 0 ? ' You\'re over the budget: that\'s allowed, but check with your DM.' : ''}</p>
                <div class="table-wrap"><table class="table bd-cost"><tr><th>Score</th>${[8, 9, 10, 11, 12, 13, 14, 15].map((v) => `<td>${v}</td>`).join('')}</tr><tr><th>Cost</th>${[0, 1, 2, 3, 4, 5, 7, 9].map((v) => `<td>${v}</td>`).join('')}</tr></table></div>`;
        }
        if (m === 'std') intro = '<p class="hint">Give 15, 14, 13, 12, 10 and 8 to one ability each. A value already used is greyed out.</p>';
        if (m === 'roll') {
            const n = ch.sets.length;
            intro = `<p><button type="button" class="btn primary" data-act="rollset"${n >= 6 ? ' disabled' : ''}>${n >= 6 ? 'All six sets rolled' : `Roll set ${n + 1} of 6`}</button>${n ? ' <button type="button" class="btn small" data-act="rollclear">Start over</button>' : ''}</p>
                <p class="hint">Each click throws four dice and drops the lowest. Every roll is kept in the character's roll log, re-rolls too.</p>
                <div class="bd-sets">${Array.from({ length: 6 }, (_, i) => { const x = ch.sets[i]; return x ? `<div class="bd-set"><span class="muted">Set ${i + 1}</span>${x.d.map((v, j) => `<span class="bd-die${j === x.lo ? ' lo' : ''}">${v}</span>`).join('')}<b>= ${x.t}</b></div>` : `<div class="bd-set dim"><span class="muted">Set ${i + 1}: not rolled yet</span></div>`; }).join('')}</div>`;
        }
        if (m === 'man') intro = '<p class="hint">Type any score from 1 to 30, for scores rolled at the table or given by your DM.</p>';
        const used = Object.values(ch.std || {}).map(String), as = Object.values(ch.assign || {}).map(String);
        const rows = B.AB.map((a) => {
            let ctl = '';
            if (m === 'pb') ctl = `<span class="bd-pm"><button type="button" class="btn small" data-act="pb" data-a="${a}" data-d="-1" aria-label="Lower ${a}"${ch.pb[a] <= 8 ? ' disabled' : ''}>−</button><b>${ch.pb[a]}</b><button type="button" class="btn small" data-act="pb" data-a="${a}" data-d="1" aria-label="Raise ${a}"${ch.pb[a] >= 15 ? ' disabled' : ''}>+</button></span>`;
            if (m === 'std') ctl = `<select class="field" data-b="std.${a}" data-num data-redraw aria-label="${a} score"><option value="">Pick...</option>${B.STD.map((v) => `<option${String(ch.std?.[a]) === String(v) ? ' selected' : ''}${used.includes(String(v)) && String(ch.std?.[a]) !== String(v) ? ' disabled' : ''}>${v}</option>`).join('')}</select>`;
            if (m === 'roll') ctl = `<select class="field" data-b="assign.${a}" data-redraw aria-label="${a} set"${ch.sets.length ? '' : ' disabled'}><option value="">${ch.sets.length ? 'Pick a set...' : 'Roll first'}</option>${ch.sets.map((x, j) => `<option value="${j}"${String(ch.assign?.[a]) === String(j) ? ' selected' : ''}${as.includes(String(j)) && String(ch.assign?.[a]) !== String(j) ? ' disabled' : ''}>Set ${j + 1} = ${x.t}</option>`).join('')}</select>`;
            if (m === 'man') ctl = `<input class="field" type="number" min="1" max="30" data-b="man.${a}" data-num value="${esc(ch.man?.[a] ?? 10)}" aria-label="${a} score">`;
            const t = (base[a] || 0) + bon[a];
            return `<div class="bd-ab"><span class="nm">${a}</span><span class="calc">${base[a] || '–'} ${sg(bon[a])} = <b>${base[a] ? t : '–'}</b>${base[a] ? `<span class="muted"> ${sg(B.mod(t))}</span>` : ''}</span><span class="ctl">${ctl}</span></div>`;
        }).join('');
        return `<h2>Ability scores</h2><p class="hint">Racial bonuses (${esc(D.subraces[ch.sub]?.name || D.races[ch.race]?.name || 'no race yet')}) are added for you: base + bonus = total. Improvements from your class levels come on top.</p>
            ${ok.length < 4 && campOf() ? `<p class="note">Your DM's rules for ${esc(campOf().name)}: ${ok.map((k) => METHODS.find(([x]) => x === k)[1]).join(', ')}.</p>` : ''}
            <div class="stabs" role="tablist">${METHODS.filter(([k]) => ok.includes(k)).map(([k, t]) => `<button type="button" role="tab" aria-selected="${m === k}" class="${m === k ? 'on' : ''}" data-act="method" data-m="${k}">${t}</button>`).join('')}</div>
            ${intro}<div class="bd-abil">${rows}</div>`;
    };

    // ---- step: background, with who the character is ----
    const PERS = [['traits', 'Personality traits', 'personality_traits'], ['ideals', 'Ideals', 'ideals'], ['bonds', 'Bonds', 'bonds'], ['flaws', 'Flaws', 'flaws']];
    const persOptions = (bg, k) => (bg?.[k]?.from?.options || []).map((o) => o.string || o.desc).filter(Boolean);
    STEP.background = () => {
        const bg = D.backgrounds[ch.bg];
        if (view.bg === 'list' || !ch.bg || (ch.bg !== 'custom' && !D.backgrounds[ch.bg])) return `<h2>Choose a background</h2>${picker('backgrounds', [...B.listOf(D, 'backgrounds', rules()).map((b) => ({ id: b.id, name: b.name,
            sub: (b.starting_proficiencies || []).map((p) => B.profKind(p, M)[1]).join(', ') })), { id: 'custom', name: 'Custom background', sub: 'Name it, then pick two skills and two languages' }], ch.bg, 'bg', 'backgrounds')}`;
        const det = ch.details, inp = (k, label, ph = '') => `<label>${esc(label)}<input class="field" data-b="details.${k}" value="${esc(det[k] || '')}" placeholder="${esc(ph)}" autocomplete="off"></label>`;
        const ta = (k, label, rows = 2) => `<label class="bd-wide">${esc(label)}<textarea class="field" data-b="details.${k}" rows="${rows}">${esc(det[k] || '')}</textarea></label>`;
        const langs = B.LANGS.filter((l) => l !== 'Common').map((l) => [l.toLowerCase().replace(/ /g, '-'), l]);
        const nLang = bg ? +bg.language_options?.choose || 0 : 2;
        const out = [back('bglist', 'All backgrounds'), `<div class="bd-hero">${iconFor('backgrounds', ch.bg, bg?.name || 'Custom')}<div><h2>${esc(bg?.name || 'Custom background')}</h2>
            ${bg ? `<div class="badges">${(bg.starting_proficiencies || []).map((p) => `<span class="badge g">${esc(B.profKind(p, M)[1])}</span>`).join('')}${nLang ? `<span class="badge">${nLang} language${nLang > 1 ? 's' : ''}</span>` : ''}</div>` : ''}</div></div>`];
        if (bg) out.push(desc(bg.desc), bg.feature ? `<div class="bd-sect"><h3>${esc(bg.feature.name)}</h3>${desc(bg.feature.desc)}</div>` : '');
        else out.push(`<div class="form"><label>Background name<input class="field" data-b="bgOpts.name" value="${esc(ch.bgOpts.name || '')}" placeholder="Wandering scholar" autocomplete="off"></label></div>`,
            checks('bgOpts.skills', M.SKILLS.map(([s]) => [s.toLowerCase().replace(/ /g, '-'), s]), 2, 'Skills: choose 2'));
        if (bg?.ability_scores?.length) {
            const abs = bg.ability_scores.map((a) => String(a).toUpperCase()), ab = ch.bgOpts.ab || {};
            out.push(`<div class="bd-sect"><h3>Ability scores</h3><p class="hint">This background raises ${abs.join(', ')}.</p>
                <div class="bd-asi">${sel('bgOpts.ab.k', [['', 'Choose...'], ['21', '+2 to one, +1 to another'], ['111', '+1 to all three']], 'Ability score increase', ab.k || '')}
                ${ab.k === '21' ? sel('bgOpts.ab.two', [['', '+2 to...'], ...abs.map((a) => [a, a])], '+2 to', ab.two || '') + sel('bgOpts.ab.one', [['', '+1 to...'], ...abs.map((a) => [a, a])], '+1 to', ab.one || '') : ''}</div></div>`);
        }
        if (bg?.feat) out.push(`<div class="bd-sect"><h3>Feat</h3><p>${lookName(bg.feat, bg.feat)}</p></div>`);
        if (nLang) out.push(`<div class="bd-sect"><h3>Languages</h3><div class="bd-fgrid">${Array.from({ length: nLang }, (_, i) => `<label>Language ${i + 1}${sel(`bgOpts.langs.${i}`, [['', 'Choose...'], ...langs], `Language ${i + 1}`, (ch.bgOpts.langs || [])[i] || '')}</label>`).join('')}</div></div>`);
        out.push(`<div class="bd-sect"><h3>Alignment, faith, lifestyle</h3><div class="bd-fgrid">
                <label>Alignment${sel('details.alignment', [['', 'Choose...'], ...['Lawful good', 'Neutral good', 'Chaotic good', 'Lawful neutral', 'True neutral', 'Chaotic neutral', 'Lawful evil', 'Neutral evil', 'Chaotic evil', 'Unaligned'].map((x) => [x, x])], 'Alignment', det.alignment || '')}</label>
                ${inp('faith', 'Faith', 'Deity or belief')}
                <label>Lifestyle${sel('details.lifestyle', [['', 'Choose...'], ...['Wretched', 'Squalid', 'Poor', 'Modest', 'Comfortable', 'Wealthy', 'Aristocratic'].map((x) => [x, x])], 'Lifestyle', det.lifestyle || '')}</label></div></div>
            <div class="bd-sect"><h3>Physical characteristics</h3><div class="bd-fgrid">${inp('age', 'Age')}${inp('height', 'Height')}${inp('weight', 'Weight')}
                <label>Size${sel('details.size', [['', D.races[ch.race]?.size ? `${D.races[ch.race].size} (race)` : 'Choose...'], ...['Tiny', 'Small', 'Medium', 'Large'].map((x) => [x, x])], 'Size', det.size || '')}</label>
                ${inp('skin', 'Skin')}${inp('hair', 'Hair')}${inp('eyes', 'Eyes')}${inp('gender', 'Gender and pronouns')}</div>${ta('appearance', 'Appearance notes')}</div>
            <div class="bd-sect"><h3>Personality</h3>${PERS.map(([k, label, key]) => { const opts = persOptions(bg, key);
                return `<div class="bd-pers">${ta(k, label)}${opts.length ? `<div class="bd-row2">${sel('', [['', 'Pick from the list...'], ...opts.map((o, i) => [String(i), o])], `${label} list`, '').replace('data-b=""', `data-pers="${k}"`)}
                    <button type="button" class="btn small" data-act="persroll" data-k="${k}">Roll d${opts.length}</button><span class="hint">or type your own</span></div>` : ''}</div>`; }).join('')}</div>
            <div class="bd-sect"><h3>Allies, enemies, organisations</h3>${ta('allies', 'Allies')}${ta('enemies', 'Enemies')}${ta('orgs', 'Organisations')}</div>
            <div class="bd-sect"><h3>Backstory</h3>${ta('backstory', 'Backstory', 6)}</div>
            <p class="hint">All of this is optional, and it all stays editable in the Character details panel on the sheet.</p>`);
        return out.join('');
    };

    // ---- step: equipment, or gold instead ----
    function optLabel(o) {
        if (!o) return '';
        if (o.option_type === 'counted_reference') { const r = o.of?.index || o.of; return `${+o.count > 1 ? o.count + ' ' : ''}${B.itemName(r, D, M)}${B.PACKS[r] ? '' : ''}`; }
        if (o.option_type === 'reference') return B.itemName(o.item?.index || o.item, D, M);
        if (o.option_type === 'multiple') return (o.items || []).map(optLabel).join(', ');
        if (o.option_type === 'choice') return o.choice?.desc || 'any ' + B.words(o.choice?.from?.equipment_category?.index || o.choice?.from?.equipment_category || '').toLowerCase();
        return '';
    }
    // the "any ..." choices inside an option, each a select
    const choicesIn = (o) => (!o ? [] : o.option_type === 'choice' ? Array.from({ length: +o.choice?.choose || 1 }, () => o.choice) : o.option_type === 'multiple' ? (o.items || []).flatMap(choicesIn) : []);
    function optHtml(o) {
        if (!o) return '';
        const ref = (r, pre = '') => esc(pre) + nm(B.itemName(r, D, M), 'eq:' + r, () => eqInfo(D.equipment?.[r]));
        if (o.option_type === 'counted_reference') return ref(o.of?.index || o.of, +o.count > 1 ? o.count + ' ' : '');
        if (o.option_type === 'reference') return ref(o.item?.index || o.item);
        if (o.option_type === 'multiple') return (o.items || []).map(optHtml).join(', ');
        return esc(optLabel(o));
    }
    function equipSet(set, key, label) {
        const pick = ch.equip.picks[key] || {}, direct = set.from?.option_set_type === 'equipment_category';
        if (!set.from) return `<fieldset class="bd-eq"><legend class="hint">${esc(label)}</legend><p>${esc(set.desc || '')}</p>
            <label class="bd-wide">What you take <input class="field" data-b="equip.picks.${key}.text" value="${esc(pick.text || '')}" placeholder="Separate items with commas" autocomplete="off"></label></fieldset>`;
        const opts = direct ? [] : set.from?.options || [], o = +pick.o || 0;
        const subs = direct ? Array.from({ length: +set.choose || 1 }, () => set) : choicesIn(opts[o]);
        const catSel = (c, j) => { const list = B.category(c.from?.equipment_category?.index || c.from?.equipment_category, D, M);
            return `<label>${esc(c.desc ? B.words(c.desc).replace(/^(\w)(.*)$/, (m, a, b) => a + b.toLowerCase()) : 'Pick one')}${sel(`equip.picks.${key}.items.${j}`, list.map((x) => [x, B.itemName(x, D, M)]), 'Pick one', (pick.items || [])[j] || list[0])}</label>`; };
        const packOf = (op) => { const r = op?.of?.index || op?.of; return B.PACKS[r] ? `<ul class="bd-pack">${B.PACKS[r].map(([n, x]) => `<li>${n > 1 ? n + ' × ' : ''}${esc(x)}</li>`).join('')}</ul>` : ''; };
        return `<fieldset class="bd-eq"><legend class="hint">${esc(label)}${set.desc ? `: ${esc(set.desc)}` : ''}</legend>
            ${opts.length > 1 ? `<div class="bd-picks" role="radiogroup">${opts.map((op, i) => `<div class="bd-pick"><input type="radio" name="eq-${key}" data-b="equip.picks.${key}.o" data-num data-redraw value="${i}" aria-label="${esc(optLabel(op))}"${o === i ? ' checked' : ''}><div class="box"><b>(${'abcdefg'[i]}) ${optHtml(op)}</b>${packOf(op)}</div></div>`).join('')}</div>`
                : opts.length ? `<p>${optHtml(opts[0])}</p>${packOf(opts[0])}` : ''}
            ${subs.length ? `<div class="bd-fgrid">${subs.map(catSel).join('')}</div>` : ''}</fieldset>`;
    }
    STEP.equipment = () => {
        if (!need(['equipment'])) return '<h2>Equipment</h2><p class="hint">Loading the equipment...</p>';
        const cls = D.classes[ch.classes[0]?.id], bg = D.backgrounds[ch.bg], gd = cls && B.goldDice(ch.classes[0].id, D);
        const fixed = (list, from) => (list || []).length ? `<p class="hint">${esc(from)} also gives: ${list.map((e) => { const r = e.equipment?.index || e.equipment; return `${+e.quantity > 1 ? e.quantity + ' × ' : ''}${nm(B.itemName(r, D, M), 'eq:' + r, () => eqInfo(D.equipment?.[r]))}`; }).join(', ')}.</p>` : '';
        const gear = `${cls ? (cls.starting_equipment_options || []).map((s, i) => equipSet(s, 'c' + i, `${cls.name} choice ${i + 1}`)).join('') + fixed(cls.starting_equipment, cls.name) : '<p class="hint">Pick a class first for its starting equipment.</p>'}
            ${bg ? (bg.starting_equipment_options || []).map((s, i) => equipSet(s, 'b' + i, `${bg.name}`)).join('') + fixed(bg.starting_equipment, bg.name) + (bg.starting_gold ? `<p class="hint">And ${bg.starting_gold.quantity} ${esc(bg.starting_gold.unit || 'gp')} in a pouch.</p>` : '') : ''}`;
        const gold = `<p><button type="button" class="btn" data-act="goldroll">Roll ${gd ? `${gd[0]}d4${gd[1] > 1 ? ' × ' + gd[1] : ''}` : 'starting gold'}</button>
            <label class="bd-inl">Gold pieces <input class="field" type="number" min="0" data-b="equip.gold" data-num value="${esc(ch.equip.gold || 0)}" aria-label="Starting gold"></label></p>
            <p class="hint">Gold instead of the class and background equipment. Buy gear on the sheet's Inventory.</p>`;
        const names = [...new Set([...M.GEAR.map((g) => g[0]), ...Object.values(D.equipment || {}).map((e) => e.name).filter(Boolean), ...Homebrew.of(['item', 'magic']).map((x) => x.name + Homebrew.SUFFIX)])].sort();
        return `<h2>Equipment</h2><p class="hint">Packs are unpacked into single items. Weapons become actions and armour sets your armour class.</p>
            ${gd ? `<div class="seg" role="radiogroup" aria-label="Equipment or gold"><label><input type="radio" name="eqmode" data-b="equip.mode" data-redraw value="gear"${ch.equip.mode !== 'gold' ? ' checked' : ''}><span>Starting equipment</span></label><label><input type="radio" name="eqmode" data-b="equip.mode" data-redraw value="gold"${ch.equip.mode === 'gold' ? ' checked' : ''}><span>Gold instead</span></label></div>` : ''}
            ${ch.equip.mode === 'gold' ? gold : gear}
            <div class="bd-sect"><h3>Extra gear <span class="muted">optional, anything your DM allows</span></h3>
                <div class="bd-row2"><input class="field" id="bd-extra" list="bd-dl-gear" placeholder="Search gear" aria-label="Extra gear" autocomplete="off"><button type="button" class="btn small" data-act="extra">Add</button></div>
                <datalist id="bd-dl-gear">${names.map((n) => `<option value="${esc(n)}">`).join('')}</datalist>
                ${(ch.equip.extra || []).length ? `<div class="rows">${ch.equip.extra.map((x, i) => `<div class="rowi"><span class="grow">${lookName(x, x)}</span><button type="button" class="btn small" data-act="extradel" data-i="${i}" aria-label="Remove ${esc(x)}">Remove</button></div>`).join('')}</div>` : ''}</div>`;
    };

    // ---- step: review ----
    STEP.review = () => {
        if (UP) return upReview();
        const c = now(), S = Object.fromEntries(c.abilities.map((a) => [a.key, +a.score])), V = vars(c);
        const P = (t) => c.panels.find((p) => p.type === t), det = P('details').f, d = ch.details;
        const ev = (f) => { try { return hbCalc(f, V).v; } catch (e) { return '?'; } };
        const left = STEPS.filter(([k]) => k !== 'review').flatMap(([k, t]) => todo(k).map((x) => [t, x]));
        const line = (k, t) => (det[k] ? `<li>${esc(t)}: ${esc(det[k])}</li>` : '');
        const txt = (k, t) => (det[k] ? `<p><b>${esc(t)}:</b> ${esc(det[k])}</p>` : '');
        const lvlRows = ch.classes.flatMap((e) => [e.sub && `${D.classes[e.id]?.name} subclass: ${D.subclasses[e.sub]?.name}`,
            ...Object.entries(e.opts || {}).map(([f, v]) => `${D.classes[e.id]?.name}: ${v.map((i) => B.words(i).replace(/^.*?(Fighting Style|Metamagic|Eldritch Invocation|Pact Of The) /, '')).join(', ')}`),
            ...Object.entries(e.asi || {}).map(([l, a]) => `${D.classes[e.id]?.name} ${l}: ${a.k === 'feat' ? D.feats[a.feat]?.name || 'a feat' : a.k === '+1' ? `+1 ${(a.a || []).join(', +1 ')}` : a.k ? `+2 ${(a.a || [])[0] || ''}` : 'not picked yet'}`)]).filter(Boolean);
        return `<h2>Review</h2><p class="hint">Check everything, then Finish. All of it stays editable on the sheet.</p>
            ${left.length ? `<div class="note"><b>Still to pick</b> (you can finish anyway):<ul>${left.map(([t, x]) => `<li>${esc(t)}: ${esc(x)}</li>`).join('')}</ul></div>` : ''}
            <div class="bd-review">
                <section class="card"><h3>Who</h3><p><b>${esc(c.name || 'Unnamed character')}</b><br>${esc(c.race || 'No race')} ${esc(c.classes.map((k) => `${k.name} ${k.level}`).join(' / '))}</p>
                    <p class="muted">${[det.background && 'Background: ' + det.background, c.alignment && 'Alignment: ' + c.alignment, det.faith && 'Faith: ' + det.faith, det.lifestyle && 'Lifestyle: ' + det.lifestyle].filter(Boolean).map(esc).join('<br>')}</p>
                    ${ch.camp && campOf() ? `<p class="muted">Joins ${esc(campOf().name)} when you finish.</p>` : ''}</section>
                <section class="card"><h3>Ability scores</h3><div class="tiles bd-tiles">${B.AB.map((a) => tile(`${a} ${sg(B.mod(S[a]))}`, S[a])).join('')}</div></section>
                <section class="card"><h3>Combat</h3><div class="tiles bd-tiles">${tile('HP', c.hp.cur)}${tile('AC', ev(c.ac))}${tile('Speed', c.speeds[0].ft + ' ft')}</div>
                    <p class="hint">Proficiency bonus ${sg(B.profBonus(level()))}. Hit dice ${c.classes.map((k) => `${k.level}d${k.die}`).join(' + ')}. Saves: ${c.abilities.filter((a) => a.save).map((a) => a.key).join(', ') || 'none'}.</p></section>
                <section class="card"><h3>Skills and proficiencies</h3><ul>${c.skills.filter((s) => s.p).map((s) => `<li>${esc(s.name)}${s.p === 2 ? ' (expertise)' : s.p === 0.5 ? ' (half)' : ''}</li>`).join('') || '<li class="muted">None yet</li>'}</ul>
                    <p class="hint">${[...c.profs.armour, ...c.profs.weapons, ...c.profs.tools.map((t) => t.name)].map(esc).join(', ')}${c.profs.langs.length ? `. Languages: ${c.profs.langs.map(esc).join(', ')}` : ''}</p></section>
                <section class="card"><h3>Attacks</h3><ul>${P('attacks').rows.map((r) => `<li>${esc(r.name)}: ${r.mode === 'save' ? `DC ${ev(r.dc)} ${esc(r.save)}` : `${sg(ev(r.hit))} to hit`}, ${esc(r.dmg.map((x) => x.dice.replace(/\b(STR|DEX|CON|INT|WIS|CHA)\b/g, (k) => String(B.mod(S[k])))).join(' + ').replace(/\+ -(\d)/g, '− $1').replace(/ \+ 0\b/g, ''))} ${esc(r.dmg[0]?.type || '')}</li>`).join('') || '<li class="muted">None</li>'}</ul></section>
                <section class="card"><h3>Spells</h3><p>${P('spells').rows.map((r) => esc(r.name) + (r.prep ? ' (prepared)' : '')).join(', ') || '<span class="muted">None</span>'}</p>
                    ${P('spells').slots.some((s) => +s.max) ? `<p class="hint">Slots: ${P('spells').slots.map((s, i) => (+s.max ? `${s.max} × level ${i + 1}` : '')).filter(Boolean).join(', ')}</p>` : ''}</section>
                <section class="card"><h3>Equipment</h3><ul>${P('items').rows.map((r) => `<li>${esc(r.name)}${+r.qty > 1 ? ' × ' + r.qty : ''}</li>`).join('')}${P('items').coins.gp ? `<li>${P('items').coins.gp} gp</li>` : ''}</ul></section>
                <section class="card"><h3>Features</h3><ul>${P('list').rows.map((r) => `<li>${esc(r.name)} <small class="muted">From: ${esc(r.src)}</small></li>`).join('')}</ul></section>
                ${lvlRows.length ? `<section class="card"><h3>Level choices</h3><ul>${lvlRows.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></section>` : ''}
                <section class="card"><h3>Physical</h3><ul>${[['age', 'Age']].map(([k, t]) => (d.age ? `<li>${t}: ${esc(d.age)}</li>` : '')).join('')}${[['height', 'Height'], ['weight', 'Weight'], ['size', 'Size'], ['skin', 'Skin'], ['hair', 'Hair'], ['eyes', 'Eyes'], ['gender', 'Gender and pronouns'], ['appearance', 'Appearance']].map(([k, t]) => line(k, t)).join('') || '<li class="muted">Nothing filled in yet</li>'}</ul></section>
                <section class="card"><h3>Personality</h3>${PERS.map(([k, t]) => txt(k, t)).join('') || '<p class="muted">Nothing filled in yet</p>'}</section>
                <section class="card"><h3>Allies, enemies, organisations</h3>${[['allies', 'Allies'], ['enemies', 'Enemies'], ['orgs', 'Organisations']].map(([k, t]) => txt(k, t)).join('') || '<p class="muted">Nothing filled in yet</p>'}</section>
                <section class="card"><h3>Backstory</h3>${det.backstory ? `<p>${esc(det.backstory)}</p>` : '<p class="muted">Nothing written yet</p>'}</section>
            </div>`;
    };
    function upReview() {
        if (!ch.cls) return '<h2>Review</h2><p class="hint">Pick the class for the new level first.</p>';
        const after = B.levelUp(C, { cls: ch.cls, entry: ch.entry, hp: { mode: ch.hp.mode, roll: ch.hp.roll } }, D, M);
        const L = (c) => c.panels.find((p) => p.type === 'list')?.rows || [];
        const newRows = L(after).filter((r) => !L(C).some((x) => x.id === r.id));
        const spells = (c) => c.panels.find((p) => p.type === 'spells')?.rows || [];
        const newSp = spells(after).filter((r) => !spells(C).some((x) => x.id === r.id));
        const scoresCh = after.abilities.filter((a, i) => +a.score !== +C.abilities[i]?.score).map((a, i) => `${a.key} ${C.abilities.find((x) => x.key === a.key)?.score} → ${a.score}`);
        return `<h2>Review</h2><p class="hint">Level up adds these and changes nothing else. The sheet offers an Undo straight after.</p>
            <div class="bd-review"><section class="card"><h3>Level</h3><p>${esc(after.classes.map((k) => `${k.name} ${k.level}`).join(' / '))}</p><p class="hint">Hit points: ${C.calc?.hpMax ?? '?'} → about ${(C.calc?.hpMax || 0) + (after.hp.base - C.hp.base) + B.mod(+after.abilities.find((a) => a.key === 'CON').score)}</p></section>
            <section class="card"><h3>New features</h3><ul>${newRows.map((r) => `<li>${esc(r.name)} <small class="muted">From: ${esc(r.src)}</small></li>`).join('') || '<li class="muted">None</li>'}</ul></section>
            ${scoresCh.length ? `<section class="card"><h3>Ability scores</h3><ul>${scoresCh.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></section>` : ''}
            ${newSp.length ? `<section class="card"><h3>New spells</h3><p>${newSp.map((r) => esc(r.name)).join(', ')}</p></section>` : ''}</div>`;
    }
    // the sheet's formula names for this character (sheet.js vars(), the parts the review needs)
    function vars(c) {
        const V = { level: c.classes.reduce((t, k) => t + (+k.level || 0), 0) };
        for (const a of c.abilities) { V[a.key.toLowerCase()] = B.mod(+a.score); V[a.key.toLowerCase() + '_score'] = +a.score; }
        for (const k of c.classes) if (k.name) V[k.name.toLowerCase().replace(/\W/g, '') + '_level'] = +k.level;
        try { V.prof = hbCalc(c.prof, V).v; } catch (e) { V.prof = 2; }
        return V;
    }

    // ---- the panel: a side panel on a desktop, a sheet from the bottom on a phone; Pick/Unpick ticks the box beside the name ----
    const panel = $('#bd-panel');
    let pOpen = null, fromPanel = false;
    const withKey = (key) => [...document.querySelectorAll('[data-info]')].filter((x) => x.dataset.info === key);
    function fillPanel() {
        if (!pOpen) return;
        let info = null;
        try { info = infos[pOpen.key]?.() || null; } catch (x) { }
        if (!info && !Object.keys(D.equipment || {}).length) need(['equipment']); // tools and gear are in the equipment file
        $('#bd-ptitle').textContent = info?.title || pOpen.label;
        $('#bd-pmeta').innerHTML = (info?.tags || []).map((t) => `<span class="badge">${esc(t)}</span>`).join('') + (info?.meta || []).map((m) => `<p>${esc(m)}</p>`).join('');
        $('#bd-pbody').innerHTML = info?.html || (info?.meta?.length ? '' : NODESC);
        const el = pOpen.pk ? $(pOpen.pk) : null, pb = $('#bd-ppick');
        pb.hidden = !el;
        if (el) { pb.textContent = el.type === 'radio' ? (el.checked ? 'Picked' : 'Pick') : el.checked ? 'Unpick' : 'Pick'; pb.disabled = el.type === 'radio' && el.checked; pb.setAttribute('aria-label', `${pb.textContent} ${info?.title || pOpen.label}`); }
    }
    function openPanel(btn) {
        pOpen = { key: btn.dataset.info, nth: withKey(btn.dataset.info).indexOf(btn), pk: btn.dataset.pk || '', label: btn.textContent };
        panel.hidden = false; fillPanel(); $('#bd-pclose').focus();
    }
    function closePanel(focus = true) {
        const o = pOpen;
        pOpen = null; panel.hidden = true;
        if (focus && o) { const l = withKey(o.key); (l[o.nth] || l[0])?.focus(); }
    }

    // ---- drawing ----
    function render() {
        const i = STEPS.findIndex(([k]) => k === step);
        stepBox.innerHTML = STEP[step]();
        $('#bd-steplist').innerHTML = STEPS.map(([k, t], j) => { const left = todo(k).length;
            return `<li><button type="button" data-act="go" data-k="${k}"${j === i ? ' aria-current="step"' : ''} class="${j < i && !left ? 'done' : ''}"><span class="n">${j < i && !left ? '✓' : j + 1}</span>${esc(t)}${left && j < i ? ' <span class="badge">to pick</span>' : ''}</button></li>`; }).join('');
        $('#bd-stepsum').textContent = `Step ${i + 1} of ${STEPS.length}: ${STEPS[i][1]}`;
        const back = $('[data-act=back]'), next = $('[data-act=next]');
        back.disabled = i === 0;
        next.textContent = i === STEPS.length - 1 ? (UP ? 'Finish level up' : 'Finish') : 'Next';
        fillPanel();
        const c = UP ? C : null;
        $('#bd-sum').textContent = UP ? (c.name || '') : [D.subraces[ch.sub]?.name || D.races[ch.race]?.name, ch.classes.map((e) => `${D.classes[e.id]?.name || ''} ${e.levels}`).join(' / ')].filter(Boolean).join(' ');
        if (step === 'class' && !UP && view.cls !== 'list') stepBox.insertAdjacentHTML('beforeend', `${hpHtml()}<div class="bd-sect"><h3>Multiclass</h3>${level() > ch.classes.reduce((t, e) => t + 1, 0)
            ? `<p><button type="button" class="btn small" data-act="clsadd">Add another class</button>${view.cls > 0 ? ` <button type="button" class="btn small" data-act="clsdel" data-i="${view.cls}">Remove ${esc(D.classes[ch.classes[view.cls]?.id]?.name || 'this class')}</button>` : ''}</p><p class="hint">Split your ${level()} levels between classes. The first class gets what's left.</p>`
            : '<p class="hint">Raise the starting level on Name and look to add another class.</p>'}
            <ul class="hint bd-mc"><li>You split your levels between classes. Your total level is the sum of them.</li><li>Each class only gives its features up to its own level, so spreading out means the high-level features come later, or never. That is the trade-off.</li><li>Your first class gives the full starting proficiencies; later classes give only a few.</li><li>Taking a class normally needs 13 in its main ability. Here that is only a warning.</li></ul></div>`);
    }
    function go(k) {
        closePanel(false);
        step = k; ch.step = k;
        if (location.hash.slice(1) !== k) history.replaceState(null, '', location.pathname + location.search + '#' + k);
        if (k === 'class' && !UP) view.cls = ch.classes.length ? 0 : 'list';
        if (k === 'race') view.race = ch.race ? 'detail' : 'list';
        if (k === 'background') view.bg = ch.bg ? 'detail' : 'list';
        if (matchMedia('(max-width: 760px)').matches) $('#bd-stepsdet').open = false;
        render(); scrollTo(0, 0);
        if (id || UP) save();
    }

    // ---- events ----
    function change(el) {
        const path = el.dataset.b;
        let v = el.type === 'checkbox' ? el.checked : el.value;
        if ('num' in el.dataset) v = v === '' ? '' : +v;
        // a change that resets what's tied to it, with a note (Q10)
        if (path === 'level') { set(path, Math.max(1, Math.min(20, +v || 1))); fixLevels(); }
        else if (/^classes\.\d+\.levels$/.test(path)) { set(path, +v); fixLevels(); }
        else if (/^classes\.\d+\.sub$/.test(path) || path === 'entry.sub') { const e = get(path.replace(/\.sub$/, '')); const had = Object.keys(e.opts || {}).length; e.sub = v; prune(e); if (had > Object.keys(e.opts || {}).length) toast('Picks from the old subclass were cleared.', 'note'); }
        else if (/\.asi\.\d+\.k$/.test(path)) { set(path.replace(/\.k$/, ''), { k: v, a: [], feat: '' }); }
        else if (path === 'rules') {
            ch.rules = v;
            // the other rules version's classes, race and background aren't in these lists: they're cleared, with a note
            return void hbContent(v, BASE).then(async (d) => {
                if (d) { D = d; hbAdd(); if (v === '2014') await hbSpellNames(D); }
                const had = ch.classes.length + !!ch.race + !!ch.bg;
                ch.classes = ch.classes.filter((e) => D.classes[e.id]?.rules === v);
                if (D.races[ch.race]?.rules !== v) Object.assign(ch, { race: '', sub: '', raceOpts: {} });
                if (ch.bg !== 'custom' && D.backgrounds[ch.bg]?.rules !== v) Object.assign(ch, { bg: '', bgOpts: {} });
                fixLevels();
                if (had > ch.classes.length + !!ch.race + !!ch.bg) toast(`Picks from the other rules were cleared: pick the class, race and background again from the ${v} lists.`, 'note');
                save(); render();
            });
        }
        else if (path === 'camp') ch.camp = v;
        else set(path, v);
        save();
        if ('redraw' in el.dataset || el.tagName === 'SELECT') { const f = el.name ? `[name="${CSS.escape(el.name)}"][value="${CSS.escape(el.value)}"]` : `[data-b="${CSS.escape(path)}"]`; render(); if (!fromPanel) $(f)?.focus(); }
        else if (step === 'review') render();
    }
    main.addEventListener('change', (e) => {
        const el = e.target;
        if (el.dataset.sf) { view.sf[el.dataset.sf][el.dataset.f] = el.type === 'checkbox' ? el.checked : el.value; render(); return void $(`[data-sf="${CSS.escape(el.dataset.sf)}"][data-f="${el.dataset.f}"]`)?.focus(); }
        if (el.dataset.pers) { if (el.value !== '') { const opts = persOptions(D.backgrounds[ch.bg], PERS.find(([k]) => k === el.dataset.pers)[2]); ch.details[el.dataset.pers] = opts[+el.value]; save(); render(); } return; }
        if (el.dataset.pick) {
            const list = arr(el.dataset.pick).filter((x) => x !== el.value), n = +el.dataset.n || 1;
            if (el.checked) { if (list.length >= n) { el.checked = false; return toast(`You can choose ${n}. Untick one first.`, 'note'); } list.push(el.value); }
            set(el.dataset.pick, list); save(); const keep = `[data-pick="${CSS.escape(el.dataset.pick)}"][value="${CSS.escape(el.value)}"]`; render(); if (!fromPanel) $(keep)?.focus();
            return;
        }
        if (el.dataset.b !== undefined && el.type !== 'text' && el.tagName !== 'TEXTAREA' && el.type !== 'search') change(el);
    });
    main.addEventListener('input', (e) => {
        const el = e.target;
        if (el.dataset.q) { view.q[el.dataset.q] = el.value; $('#bd-list-' + el.dataset.q).innerHTML = rowsHtml(el.dataset.q); return; }
        if (el.dataset.sq) { view.sq[el.dataset.sq] = el.value; const pos = el.selectionStart; render(); const f = $(`[data-sq="${CSS.escape(el.dataset.sq)}"]`); if (f) { f.focus(); f.setSelectionRange(pos, pos); } return; }
        if (el.dataset.b !== undefined && (el.type === 'text' || el.tagName === 'TEXTAREA' || el.type === 'number' && !el.closest('.bd-lvl'))) {
            let v = el.value;
            if ('num' in el.dataset) v = el.type === 'number' ? Math.max(+el.min || 0, Math.min(+el.max || 1e9, +v || 0)) : +v;
            set(el.dataset.b, v); saveSoon();
        }
    });
    main.addEventListener('toggle', (e) => { const d = e.target; if (d.dataset?.fold !== undefined && !('auto' in d.dataset)) view.fold[d.dataset.fold] = d.open; }, true);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) { e.preventDefault(); closePanel(); } });
    main.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'bd-extra') { e.preventDefault(); $('[data-act=extra]').click(); } });
    main.addEventListener('click', async (e) => {
        const nb = e.target.closest('[data-info]');
        if (nb) return openPanel(nb);
        const b = e.target.closest('[data-act]');
        if (!b) return;
        const act = b.dataset.act;
        if (act === 'go') return go(b.dataset.k);
        if (act === 'next') { const i = STEPS.findIndex(([k]) => k === step); return i === STEPS.length - 1 ? finish(b) : go(STEPS[i + 1][0]); }
        if (act === 'back') { const i = STEPS.findIndex(([k]) => k === step); return i > 0 && go(STEPS[i - 1][0]); }
        if (act === 'pclose') return closePanel();
        if (act === 'ppick') {
            const el = pOpen && $(pOpen.pk);
            if (!el) return;
            if (el.disabled) return toast('You can choose no more. Untick one first.', 'note');
            fromPanel = true; el.click(); fromPanel = false; return fillPanel();
        }
        if (act === 'spdel') { set(b.dataset.p, arr(b.dataset.p).filter((x) => x !== b.dataset.v)); save(); return render(); }
        if (act === 'az') { view.az[b.dataset.k] = view.az[b.dataset.k] === b.dataset.v ? '' : b.dataset.v; return render(); }
        if (act === 'more') { view.more[b.dataset.k] = true; return render(); }
        // class
        if (act === 'cls') {
            const at = view.clsAt, had = ch.classes[at];
            if (had?.id !== b.dataset.id) {
                if (had && (Object.keys(had.opts).length || Object.keys(had.profs).length || had.spells.length || had.sub)) toast(`The ${D.classes[had.id]?.name} picks were cleared.`, 'note');
                ch.classes[at] = Object.assign(newEntry(b.dataset.id), { levels: had?.levels || 1 });
                if (at === 0) { for (const k of Object.keys(ch.equip.picks)) if (k[0] === 'c') delete ch.equip.picks[k]; ch.hp.rolls = {}; }
                fixLevels();
            }
            view.cls = at; save(); render(); return scrollTo(0, 0);
        }
        if (act === 'clslist') { view.cls = 'list'; view.clsAt = ch.classes.length > 1 ? view.clsAt : 0; render(); return scrollTo(0, 0); }
        if (act === 'clsopen') { view.cls = +b.dataset.i; view.clsAt = +b.dataset.i; return render(); }
        if (act === 'clsadd') { view.clsAt = ch.classes.length; view.cls = 'list'; render(); return scrollTo(0, 0); }
        if (act === 'clsdel') { ch.classes.splice(+b.dataset.i, 1); fixLevels(); view.cls = 0; view.clsAt = 0; save(); return render(); }
        if (act === 'upcls') { if (ch.cls !== b.dataset.id) { ch.cls = b.dataset.id; ch.entry = newEntry(b.dataset.id); ch.hp.roll = 0; } view.cls = 'detail'; save(); render(); return scrollTo(0, 0); }
        if (act === 'upback') { view.cls = 'list'; return render(); }
        if (act === 'hp1' || act === 'hproll') {
            const seq = B.levels(ch).filter((L) => L.at > 1 && (act === 'hp1' ? L.at === +b.dataset.l : true));
            b.disabled = true;
            for (const L of seq) { const d = +D.classes[L.cls]?.hit_die || 8, r = await roll(`Hit points, level ${L.at}`, [[d, 1]]); ch.hp.rolls[L.at] = r[0][1][0]; }
            save(); return render();
        }
        if (act === 'uproll') { b.disabled = true; const d = +D.classes[ch.cls]?.hit_die || 8, r = await roll(`Hit points, level up`, [[d, 1]]); ch.hp.roll = r[0][1][0]; save(); return render(); }
        // race
        if (act === 'race') {
            if (ch.race !== b.dataset.id) { if (Object.keys(ch.raceOpts).length) toast('The race picks were cleared.', 'note'); ch.race = b.dataset.id; ch.sub = ''; ch.raceOpts = {}; }
            const subs = subsOfRace(ch.race);
            if (subs.length === 1) ch.sub = subs[0].id; // one subrace: picked for you (Q19)
            view.race = subs.length > 1 && !ch.sub ? 'subs' : 'detail';
            save(); render(); return scrollTo(0, 0);
        }
        if (act === 'sub') { if (ch.sub !== b.dataset.id) { ch.sub = b.dataset.id; for (const k of Object.keys(ch.raceOpts)) if (!B.raceChoices(ch, D).some((x) => x.key === k)) delete ch.raceOpts[k]; } view.race = 'detail'; save(); render(); return scrollTo(0, 0); }
        if (act === 'racelist') { view.race = 'list'; return render(); }
        if (act === 'racesubs') { view.race = 'subs'; return render(); }
        // abilities
        if (act === 'method') { ch.method = b.dataset.m; save(); return render(); }
        if (act === 'pb') { const a = b.dataset.a; ch.pb[a] = Math.max(8, Math.min(15, +ch.pb[a] + +b.dataset.d)); save(); render(); return $(`[data-act=pb][data-a=${a}][data-d="${b.dataset.d}"]`)?.focus(); }
        if (act === 'rollset') {
            if (ch.sets.length >= 6) return;
            b.disabled = true;
            const n = ch.sets.length + 1, r = await roll(`Ability scores: set ${n}`, [[6, 4]], (got) => { const x = B.dropLowest(got[0][1]); return x.d.map((v, j) => (j === x.lo ? `~${v}~` : v)).join(', '); });
            const x = B.dropLowest(r[0][1]);
            rolls[0].total = x.t; rolls[0].expr = '4d6 drop lowest';
            ch.sets.push(x); save(); render(); return $('[data-act=rollset]')?.focus();
        }
        if (act === 'rollclear') { ch.sets = []; ch.assign = {}; save(); return render(); }
        // background
        if (act === 'bg') {
            if (ch.bg !== b.dataset.id) { if (Object.keys(ch.bgOpts).length) toast('The background picks were cleared.', 'note'); ch.bg = b.dataset.id; ch.bgOpts = {}; for (const k of Object.keys(ch.equip.picks)) if (k[0] === 'b') delete ch.equip.picks[k]; }
            view.bg = 'detail'; save(); render(); return scrollTo(0, 0);
        }
        if (act === 'bglist') { view.bg = 'list'; return render(); }
        if (act === 'persroll') {
            const [, label, key] = PERS.find(([k]) => k === b.dataset.k), opts = persOptions(D.backgrounds[ch.bg], key);
            b.disabled = true;
            const n = [4, 6, 8, 10, 12, 20].includes(opts.length) ? opts.length : 20; // a list of another size: a d20, counted round it
            const r = await roll(`${label} (d${n})`, [[n, 1]]);
            ch.details[b.dataset.k] = opts[(r[0][1][0] - 1) % opts.length]; save(); return render();
        }
        // equipment
        if (act === 'goldroll') {
            const gd = B.goldDice(ch.classes[0]?.id, D) || [4, 10];
            b.disabled = true;
            const r = await roll('Starting gold', [[4, gd[0]]]);
            ch.equip.gold = r[0][1].reduce((a, x) => a + x, 0) * gd[1]; ch.equip.mode = 'gold';
            if (gd[1] > 1) rolls[0].shown += ` × ${gd[1]}`, rolls[0].total = ch.equip.gold;
            save(); return render();
        }
        if (act === 'extra') { const v = $('#bd-extra').value.trim(); if (!v) return $('#bd-extra').focus(); (ch.equip.extra ||= []).push(v); save(); render(); return $('#bd-extra')?.focus(); }
        if (act === 'extradel') { ch.equip.extra.splice(+b.dataset.i, 1); save(); return render(); }
        // portrait
        if (act === 'art') return $('#bd-artfile').click();
        if (act === 'artdel') { const db = load(); if (db.chars[id]) { db.chars[id].art = ''; db.chars[id].artUrl = ''; store(db); C = db.chars[id]; } return render(); }
        // leaving
        if (act === 'exit') { if (!UP && id) save(); return void (location.href = UP ? '/characters/' + encodeURIComponent(UP) : '/characters/'); }
        if (act === 'cancel') {
            if (UP) { try { sessionStorage.removeItem('hb-up-' + UP); } catch (x) { } return void (location.href = '/characters/' + encodeURIComponent(UP)); }
            if (id && !confirm('Cancel this character? It goes to Archived in My Characters, where you can bring it back.')) return;
            if (id) { save(); done = true; const db = load(); const c = db.chars[id]; c.archived = Date.now(); c.updated = Date.now(); store(db); if (cloud) await post('cloud.php', c).catch(() => { }); }
            location.href = '/characters/';
        }
    });
    // a portrait, cut to a square in the middle (480 px, as the sheet's crop)
    $('#bd-artfile').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        e.target.value = '';
        if (!file) return;
        try {
            const img = await createImageBitmap(file), s = Math.min(img.width, img.height), cv = document.createElement('canvas');
            cv.width = cv.height = Math.min(480, s);
            cv.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, cv.width, cv.height);
            save();
            const db = load();
            db.chars[id].art = cv.toDataURL('image/jpeg', 0.85); db.chars[id].artUrl = ''; db.chars[id].updated = Date.now();
            store(db); C = db.chars[id]; cloudLater(); render();
        } catch (x) { toast("Couldn't read that picture. Try a JPG or PNG.", 'err'); }
    });

    // ---- finish: the draft becomes a normal character (its first version), joins its campaign, and opens on the sheet ----
    let done = false; // finished or cancelled: nothing is saved over it on the way out
    async function finish(btn) {
        btn.disabled = true; btn.textContent = 'Finishing...';
        if (UP) {
            const after = B.levelUp(C, { cls: ch.cls, entry: ch.entry, hp: { mode: ch.hp.mode, roll: ch.hp.roll } }, D, M);
            after.rolls = [...(ch.rolls || []), ...(after.rolls || [])].slice(0, 100);
            after.updated = Date.now();
            after.calc = { hpMax: after.hp.base + B.mod(+after.abilities.find((a) => a.key === 'CON').score) * after.classes.reduce((t, k) => t + +k.level, 0) + (+after.hp.mod || 0) };
            const db = load();
            db.chars[UP] = after;
            if (!store(db)) { btn.disabled = false; btn.textContent = 'Finish level up'; return; }
            try { sessionStorage.setItem('hb-levelup', JSON.stringify({ id: UP, before: C })); sessionStorage.removeItem('hb-up-' + UP); } catch (x) { }
            if (cloud) await post('cloud.php', after).catch(() => { });
            await post('backup.php', after).catch(() => { }); // waited for: a navigation while it's still sending broke the next page in Firefox
            return void (location.href = '/characters/' + encodeURIComponent(UP) + '?levelled=1');
        }
        save();
        done = true;
        const db = load(), c = db.chars[id];
        c.draft = 0; c.updated = Date.now();
        if (!store(db)) { btn.disabled = false; btn.textContent = 'Finish'; return; }
        await post('backup.php', c).catch(() => { });
        if (cloud) {
            const r = await post('cloud.php', c).catch(() => null);
            const camp = campOf();
            if (r?.ok && camp) {
                const j = await fetch('/campaigns/api.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ act: 'characters', id: camp.id, characters: [...camp.mine, id] }) }).catch(() => null);
                if (!j?.ok) try { sessionStorage.setItem('hb-built-note', `Couldn't add it to ${camp.name}. Add it on the campaign page.`); } catch (x) { }
            }
        }
        location.href = '/characters/' + encodeURIComponent(id) + '?built=1';
    }

    addEventListener('hashchange', () => { const k = location.hash.slice(1); if (STEPS.some(([x]) => x === k) && k !== step) go(k); });
    addEventListener('pagehide', () => { if (!UP && id && !done) save(); });
    if (step === 'class' && !UP) view.cls = ch.classes.length ? 0 : 'list';
    if (step === 'race') view.race = ch.race ? 'detail' : 'list';
    if (step === 'background') view.bg = ch.bg ? 'detail' : 'list';
    if (matchMedia('(max-width: 760px)').matches) $('#bd-stepsdet').open = false; // on a phone the steps fold under one line
    render();
    // the account's and the campaigns' homebrew, when they differ from this browser's
    const hbSig = () => JSON.stringify(Homebrew.all().map((x) => [x.id, x.updated]));
    { const was = hbSig(); Homebrew.ready().then(() => { if (hbSig() !== was) { hbAdd(); render(); } }); }
});
