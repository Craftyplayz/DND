// Compendium (/compendium/): one searchable list of spells, monsters, items, magic items and rules.
// Lists load on first open (spells.json + extra-spells.json, monsters.json, items.php?list=1, rules.js); an entry's full text
// loads when it is clicked, through the cached proxies. "Add to sheet" and "Add to encounter" leave a request in localStorage
// (hb-pending / mon-pending) that the sheet applies when it opens, or at once if it is already open (see sheet.js, monster.js).
// Settings follow the account through assets/js/sync.js: compendium-view (tab and filters), compendium-favs, compendium-recent.
document.addEventListener('DOMContentLoaded', () => {
    'use strict';
    const { $, esc, toast, store, debounce, num } = UI;
    const cloud = 'cloud' in $('#main').dataset;
    const TABS = [['all', 'All'], ['spell', 'Spells'], ['monster', 'Monsters'], ['item', 'Items'], ['magic', 'Magic items'], ['rule', 'Rules'], ['fav', 'Favourites'], ['recent', 'Recent']];
    const TYPE_NAME = { spell: 'Spell', monster: 'Monster', item: 'Item', magic: 'Magic item', rule: 'Rule' };
    const TYPE_PLURAL = { spell: 'spells', monster: 'monsters', item: 'items', magic: 'magic items', rule: 'rules' };
    const BATCH = 50, GROUP = 5, SRD = 'SRD 5.1';
    const RARITY = ['Common', 'Uncommon', 'Rare', 'Very Rare', 'Legendary', 'Artifact', 'Varies'];
    const CRS = [0, 0.125, 0.25, 0.5, ...Array.from({ length: 30 }, (_, i) => i + 1)];
    const crText = (n) => ({ 0.125: '1/8', 0.25: '1/4', 0.5: '1/2' })[n] || String(n);
    const SECTION = { sense: 'Sense', cond: 'Condition', skill: 'Skill', prop: 'Weapon property', lang: 'Language', armour: 'Armour', dmg: 'Damage type', act: 'Action', spell: 'Spellcasting rule', hp: 'Hit points' };
    // the filters each type has: [name, label, kind]
    const FILTERS = {
        spell: [['level', 'Level'], ['school', 'School'], ['conc', 'Concentration', 'yn'], ['ritual', 'Ritual', 'yn'], ['src', 'Source']],
        monster: [['crmin', 'Lowest CR', 'cr'], ['crmax', 'Highest CR', 'cr'], ['mtype', 'Type'], ['src', 'Source book']],
        item: [['cat', 'Category']],
        magic: [['cat', 'Category'], ['rarity', 'Rarity']],
    };

    const entries = [], byKey = new Map(), texts = new Map(), failed = new Set(), loaded = new Set();
    const key = (e) => e.t + ':' + e.id;
    function addEntry(e) {
        if (byKey.has(key(e))) return;
        entries.push(e); byKey.set(key(e), e);
    }
    const byName = (a, b) => a.name.localeCompare(b.name);

    // ---- lists ----
    const getJson = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error(r.status); return r.json(); };
    const loaders = {
        async spell() {
            const [srd, extra] = await Promise.all([getJson('/compendium/spells.json'), getJson('/sheets/player/extra-spells.json')]);
            for (const [id, name, level, school, time, conc, ritual, range, dur] of srd.list) {
                addEntry({ t: 'spell', id, name, sub: [level ? 'Level ' + level : 'Cantrip', school, time].join(' · '), hay: school, tags: [], f: { level, school, conc: !!conc, ritual: !!ritual, src: SRD }, raw: { level, school, time, range, dur, conc, ritual } });
            }
            for (const s of extra) {
                addEntry({ t: 'spell', id: 'wd:' + s.index, name: s.name, sub: [s.level ? 'Level ' + s.level : 'Cantrip', s.school, s.casting_time].join(' · '), hay: s.school, extra: true, tags: [['Extra', 'p'], [s.source]],
                    f: { level: s.level, school: s.school, conc: !!s.concentration, ritual: !!s.ritual, src: s.source }, raw: s });
            }
        },
        async monster() {
            const j = await getJson('/sheets/monster/monsters.json');
            sources = j.sources;
            for (const [id, name, cr, type, src] of j.list) {
                const book = src === 'srd' ? SRD : (j.sources[src] || {}).title || src;
                addEntry({ t: 'monster', id, name, sub: `CR ${crText(cr)} · ${type}`, hay: type, tags: [[book, src === 'srd' ? 'g' : '']], f: { cr, mtype: type, src: book }, src });
            }
        },
        async item() {
            const j = await getJson('/compendium/items.php?list=1');
            for (const [id, name, cat] of j.eq) addEntry({ t: 'item', id, name, sub: cat, hay: cat, tags: [[SRD, 'g']], f: { cat, src: SRD } });
            for (const [id, name, cat, rarity, variant] of j.magic) {
                addEntry({ t: 'magic', id, name, sub: [cat, rarity].filter(Boolean).join(' · '), hay: cat, tags: [[SRD, 'g']].concat(rarity ? [[rarity]] : []), f: { cat, rarity, src: SRD }, variant });
            }
        },
        rule: () => new Promise((ok, no) => {
            const s = document.createElement('script');
            s.src = '/sheets/player/rules.js';
            s.onload = () => {
                for (const [sec, items] of Object.entries(window.HB_RULES || {})) for (const [k, text] of Object.entries(items)) {
                    addEntry({ t: 'rule', id: sec + ':' + k, name: k.replace(/\b[a-z]/g, (c) => c.toUpperCase()), sub: SECTION[sec] || sec, hay: SECTION[sec] || '', tags: [[SRD, 'g']], f: { src: SRD }, text });
                }
                ok();
            };
            s.onerror = () => no(new Error('rules'));
            document.head.appendChild(s);
        }),
    };
    let sources = {};
    function load(t) {
        failed.delete(t);
        return loaders[t]().then(() => loaded.add(t)).catch(() => failed.add(t)).then(() => { entries.sort(byName); refresh(); openFromUrl(); });
    }

    // ---- state ----
    const params = new URLSearchParams(location.search);
    const saved = store.get('compendium-view', {});
    const S = { tab: 'all', q: '', f: {}, sel: null };
    S.tab = TABS.some(([k]) => k === (params.get('tab') || saved.tab)) ? params.get('tab') || saved.tab : 'all';
    S.q = params.get('q') || '';
    S.f = Object.assign({}, saved.f || {});
    for (const [k, v] of params) if (k.startsWith('f.')) S.f[k.slice(2)] = v;
    if (params.get('t') && params.get('i') && !params.get('tab') && TABS.some(([k]) => k === params.get('t'))) S.tab = params.get('t');
    let want = params.get('t') && params.get('i') ? params.get('t') + ':' + params.get('i') : '';

    const favs = () => store.get('compendium-favs', []).filter((k) => typeof k === 'string');
    const recents = () => store.get('compendium-recent', []).filter((k) => typeof k === 'string');
    const isFav = (e) => favs().includes(key(e));

    // ---- search ----
    function matches(e) {
        const f = S.f, t = S.tab;
        if (!FILTERS[t]) return true;
        const v = e.f;
        if (f.level !== undefined && f.level !== '' && v.level !== +f.level) return false;
        for (const k of ['school', 'mtype', 'src', 'cat', 'rarity']) if (f[k] && v[k] !== f[k]) return false;
        for (const k of ['conc', 'ritual']) if (f[k] && v[k] !== (f[k] === 'yes')) return false;
        if (f.crmin !== undefined && f.crmin !== '' && v.cr < +f.crmin) return false;
        if (f.crmax !== undefined && f.crmax !== '' && v.cr > +f.crmax) return false;
        return true;
    }
    function results() {
        const t = S.tab;
        let pool = t === 'all' ? entries : t === 'fav' ? favs().map((k) => byKey.get(k)).filter(Boolean) : t === 'recent' ? recents().map((k) => byKey.get(k)).filter(Boolean) : entries.filter((e) => e.t === t);
        pool = pool.filter(matches);
        if (!S.q.trim()) return pool;
        const scored = [];
        for (const e of pool) {
            let s = Fuzzy.score(S.q, e.name);
            if (e.hay) { const h = Fuzzy.score(S.q, e.hay); if (h >= 700) s = Math.max(s, h - 400); }
            if (s > 0) scored.push([e, s]);
        }
        // a stable sort, so equal scores stay in name order
        return scored.sort((a, b) => b[1] - a[1]).map((x) => x[0]);
    }

    // ---- list ----
    const list = $('#cp-list'), more = $('#cp-more'), detail = $('#cp-detail'), dbody = $('#cp-dbody');
    let shown = [], at = 0, grouped = false;
    const tag = ([text, kind]) => `<span class="badge${kind ? ' ' + kind : ''}">${esc(text)}</span>`;
    const row = (e) => `<button type="button" class="cp-row${S.sel === key(e) ? ' on' : ''}" data-k="${esc(key(e))}"${S.sel === key(e) ? ' aria-current="true"' : ''}>
        <span class="cp-name">${esc(e.name)}</span><span class="cp-tags">${(e.hb ? [['Homebrew', 'p']] : []).concat(e.tags).map(tag).join('')}</span><small class="cp-sub">${esc(e.sub)}</small></button>`;
    const skeleton = () => '<div class="cp-sk" aria-hidden="true"></div>'.repeat(8);

    let io;
    function refresh() {
        const all = results();
        shown = all; at = 0;
        const total = all.length;
        const busy = Object.keys(loaders).some((t) => !loaded.has(t) && !failed.has(t));
        grouped = S.tab === 'all';
        $('#cp-count').textContent = total ? `${num(total)} ${total === 1 ? 'result' : 'results'}` : '';
        let html = '';
        for (const t of Object.keys(loaders)) if (failed.has(t) && (S.tab === 'all' || S.tab === t)) {
            html += `<p class="err">Couldn't load the ${TYPE_PLURAL[t]} list. <button type="button" class="btn small" data-retry="${t}">Try again</button></p>`;
        }
        if (grouped) {
            for (const t of Object.keys(loaders)) {
                const g = all.filter((e) => e.t === t);
                if (!g.length) continue;
                html += `<h2 class="cp-gh">${TYPE_NAME[t] === 'Rule' ? 'Rules' : TYPE_NAME[t] + 's'} <span class="n">${num(g.length)}</span></h2>${g.slice(0, GROUP).map(row).join('')}`;
                if (g.length > GROUP) html += `<button type="button" class="btn small cp-showall" data-tab="${t}">Show all ${num(g.length)} ${TYPE_PLURAL[t]}</button>`;
            }
            shown = [];
        } else html += all.slice(0, BATCH).map(row).join('');
        at = Math.min(BATCH, all.length);
        if (!total && busy) html += skeleton();
        else if (!total && !html) {
            const filtered = Object.values(S.f).some((v) => v !== '' && v !== undefined);
            html += S.tab === 'fav' ? '<p class="muted">No favourites yet. Open an entry and press the star.</p>'
                : S.tab === 'recent' ? '<p class="muted">Nothing opened yet.</p>'
                    : `<p class="note">Nothing found${S.q.trim() ? ` for '${esc(S.q.trim())}'` : ''}. Try fewer filters.${filtered ? ' <button type="button" class="btn small" data-clear>Clear filters</button>' : ''}</p>`;
        }
        list.innerHTML = html;
        // endless scroll: the sentinel under the list asks for the next batch while it is near the screen
        if (!io) io = new IntersectionObserver((hits) => { if (hits.some((h) => h.isIntersecting)) next(); }, { rootMargin: '600px' });
        io.disconnect(); io.observe(more);
    }
    function next() {
        if (grouped || at >= shown.length) return;
        list.insertAdjacentHTML('beforeend', shown.slice(at, at + BATCH).map(row).join(''));
        at += BATCH;
    }

    // ---- tabs and filters ----
    $('#cp-tabs').innerHTML = TABS.map(([k, n]) => `<button type="button" role="tab" data-tab="${k}">${n}</button>`).join('');
    function drawTabs() {
        for (const b of $('#cp-tabs').children) { const on = b.dataset.tab === S.tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); }
        const fl = FILTERS[S.tab] || [], box = $('#cp-filters');
        const pool = entries.filter((e) => e.t === S.tab);
        const opts = (name, kind) => {
            if (kind === 'yn') return ['yes', 'Yes', 'no', 'No'];
            if (kind === 'cr') return CRS.flatMap((c) => [c, crText(c)]);
            if (name === 'level') return Array.from({ length: 10 }, (_, i) => [i, i ? 'Level ' + i : 'Cantrip']).flat();
            let vals = [...new Set(pool.map((e) => e.f[name]).filter(Boolean))];
            vals = name === 'rarity' ? vals.sort((a, b) => RARITY.indexOf(a) - RARITY.indexOf(b)) : vals.sort((a, b) => (a === SRD ? -1 : b === SRD ? 1 : a.localeCompare(b)));
            return vals.flatMap((v) => [v, v]);
        };
        box.innerHTML = fl.map(([name, label, kind]) => {
            const o = opts(name, kind), cur = S.f[name] === undefined ? '' : String(S.f[name]);
            let h = '<option value="">Any</option>';
            for (let i = 0; i < o.length; i += 2) h += `<option value="${esc(o[i])}"${String(o[i]) === cur ? ' selected' : ''}>${esc(o[i + 1])}</option>`;
            return `<label>${label}<select class="field" data-f="${name}">${h}</select></label>`;
        }).join('') + (fl.length ? '<button type="button" class="btn small" data-clear>Clear filters</button>' : '');
        $('#cp-fbtn').hidden = !fl.length;
        box.hidden = !fl.length;
    }
    function persist() {
        store.set('compendium-view', { tab: S.tab, f: S.f });
        const p = new URLSearchParams();
        if (S.tab !== 'all') p.set('tab', S.tab);
        if (S.q.trim()) p.set('q', S.q.trim());
        for (const [k, v] of Object.entries(S.f)) if (v !== '' && v !== undefined) p.set('f.' + k, v);
        if (S.sel) { const e = byKey.get(S.sel); if (e) { p.set('t', e.t); p.set('i', e.id); } }
        history.replaceState(null, '', location.pathname + (p.toString() ? '?' + p : ''));
    }
    function setTab(t) { S.tab = t; drawTabs(); refresh(); persist(); }

    $('#cp-tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) setTab(b.dataset.tab); });
    $('#cp-q').value = S.q;
    $('#cp-q').addEventListener('input', debounce((e) => { S.q = e.target.value; refresh(); persist(); }, 80));
    $('#cp-filters').addEventListener('change', (e) => { const s = e.target.closest('[data-f]'); if (s) { S.f[s.dataset.f] = s.value; refresh(); persist(); } });
    $('#cp-fbtn').addEventListener('click', () => { const open = $('#cp-filters').classList.toggle('open'); $('#cp-fbtn').setAttribute('aria-expanded', open); });
    const clearFilters = () => { S.f = {}; drawTabs(); refresh(); persist(); };

    list.addEventListener('click', (e) => {
        const r = e.target.closest('[data-k]'), t = e.target.closest('[data-tab]');
        if (r) openEntry(byKey.get(r.dataset.k));
        else if (t) setTab(t.dataset.tab);
        else if (e.target.closest('[data-clear]')) clearFilters();
        else if (e.target.closest('[data-retry]')) { const t2 = e.target.closest('[data-retry]').dataset.retry; load(t2); }
    });
    $('#cp-filters').addEventListener('click', (e) => { if (e.target.closest('[data-clear]')) clearFilters(); });

    // ---- detail ----
    const para = (p) => `<p>${esc(p)}</p>`;
    const kv = (rows) => `<div class="kv">${rows.filter((r) => r[1] !== '' && r[1] != null).map(([k, v]) => `<span>${esc(k)}</span><span>${esc(v)}</span>`).join('')}</div>`;
    const fmtSpeed = (sp) => Object.entries(sp || {}).filter(([k, v]) => k !== 'hover' && v).map(([k, v]) => { const t = typeof v === 'number' ? v + ' ft.' : v; return k === 'walk' ? t : `${k} ${t}`; }).join(', ');
    const signed = (n) => (n >= 0 ? '+' : '−') + Math.abs(n);

    function spellHtml(e, s) {
        const r = e.raw;
        if (e.extra) {
            return `${kv([['Level', r.level ? 'Level ' + r.level : 'Cantrip'], ['School', r.school], ['Casting time', r.casting_time], ['Range', r.range], ['Components', (r.components || []).join(', ') + (r.material ? ` (${r.material})` : '')], ['Duration', r.duration], ['Book', r.source]])}
                <p class="note">Only the numbers are kept here. Read the spell's text on <a href="https://dnd5e.wikidot.com/spell:${esc(r.index)}" target="_blank" rel="noopener">dnd5e.wikidot.com</a>.</p>`;
        }
        return `${kv([['Level', s.level ? 'Level ' + s.level : 'Cantrip'], ['School', s.school], ['Casting time', s.casting_time], ['Range', s.range], ['Components', (s.components || []).join(', ') + (s.material ? ` (${s.material})` : '')], ['Duration', s.duration]])}
            <div class="badges">${s.concentration ? '<span class="badge">Concentration</span>' : ''}${s.ritual ? '<span class="badge">Ritual</span>' : ''}</div>
            <div class="cp-text">${(s.desc || []).map(para).join('')}${(s.higher_level || []).length ? `<h3>At higher levels</h3>${s.higher_level.map(para).join('')}` : ''}</div>`;
    }
    function monsterHtml(e, { src, m }) {
        const srd = src === 'srd', FULL = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'];
        const ac = srd ? (m.armor_class || [])[0] || {} : { value: m.armor_class, type: m.armor_desc };
        const acText = srd ? `${ac.value}${ac.type ? ' (' + ac.type + ')' : ''}` : `${ac.value ?? ''}${ac.type ? ' (' + ac.type + ')' : ''}`;
        const saves = [], skills = [];
        if (srd) for (const p of m.proficiencies || []) {
            const n = p.proficiency?.name || '';
            if (n.startsWith('Saving Throw: ')) saves.push(`${n.slice(14)} ${signed(p.value)}`);
            else if (n.startsWith('Skill: ')) skills.push(`${n.slice(7)} ${signed(p.value)}`);
        } else {
            FULL.forEach((f) => { if (m[f + '_save'] != null) saves.push(`${f.slice(0, 3).replace(/^./, (c) => c.toUpperCase())} ${signed(m[f + '_save'])}`); });
            for (const [k, v] of Object.entries(m.skills || {})) skills.push(`${k.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())} ${signed(v)}`);
        }
        const txt = (x) => (Array.isArray(x) ? x.map((y) => (typeof y === 'string' ? y : y.name)).join(', ') : String(x || ''));
        const senses = srd ? Object.entries(m.senses || {}).map(([k, v]) => `${k.replace(/_/g, ' ')} ${v}`).join(', ') : m.senses;
        const block = (title, items) => (Array.isArray(items) && items.length ? `<h3>${title}</h3>${items.map((a) => `<p><b>${esc(a.name)}.</b> ${esc(a.desc)}</p>`).join('')}` : '');
        const book = srd ? sources.srd : sources[m.document__slug];
        return `<p class="muted">${esc([m.size, String(m.type || '').toLowerCase() + (m.subtype ? ` (${m.subtype})` : ''), m.alignment].filter(Boolean).join(', '))}</p>
            ${kv([['Armour class', acText], ['Hit points', `${m.hit_points}${m.hit_points_roll || m.hit_dice ? ' (' + (m.hit_points_roll || m.hit_dice) + ')' : ''}`], ['Speed', fmtSpeed(m.speed)]])}
            <div class="table-wrap"><table class="table cp-abil"><thead><tr>${FULL.map((f) => `<th class="num">${f.slice(0, 3).toUpperCase()}</th>`).join('')}</tr></thead>
            <tbody><tr>${FULL.map((f) => `<td class="num">${m[f] ?? 10} (${signed(Math.floor(((m[f] ?? 10) - 10) / 2))})</td>`).join('')}</tr></tbody></table></div>
            ${kv([['Saving throws', saves.join(', ')], ['Skills', skills.join(', ')], ['Vulnerabilities', txt(m.damage_vulnerabilities)], ['Resistances', txt(m.damage_resistances)], ['Damage immunities', txt(m.damage_immunities)],
                ['Condition immunities', txt(m.condition_immunities)], ['Senses', senses], ['Languages', m.languages], ['Challenge', crText(e.f.cr) + (m.xp ? ` (${num(m.xp)} XP)` : '')]])}
            ${block('Traits', m.special_abilities)}${block('Actions', m.actions)}${block('Bonus actions', m.bonus_actions)}${block('Reactions', m.reactions)}
            ${m.legendary_desc || (m.legendary_actions || []).length ? `<h3>Legendary actions</h3>${m.legendary_desc ? para(m.legendary_desc) : ''}${(m.legendary_actions || []).map((a) => `<p><b>${esc(a.name)}.</b> ${esc(a.desc)}</p>`).join('')}` : ''}
            ${book ? `<p class="muted cp-credit">${esc(book.title)} (${esc(book.licence)}). ${esc(book.copyright)}</p>` : ''}`;
    }
    function itemHtml(e, s) {
        if (e.t === 'magic') {
            const [type, ...rest] = s.desc || [];
            return `<div class="badges">${s.rarity ? `<span class="badge${/legendary|artifact/i.test(s.rarity) ? ' cp-gold' : ''}">${esc(s.rarity)}</span>` : ''}${s.attunement ? `<span class="badge b">${esc(s.attunement)}</span>` : ''}</div>
                ${type ? `<p class="muted">${esc(type)}</p>` : ''}<div class="cp-text">${rest.map(para).join('')}</div>
                ${(s.variants || []).length ? `<h3>Variants</h3><ul>${s.variants.map((v) => `<li>${esc(v)}</li>`).join('')}</ul>` : ''}`;
        }
        return `${kv([['Category', s.category], ['Cost', s.cost], ['Weight', s.weight ? s.weight + ' lb' : ''], ['Damage', s.damage], ['Armour class', s.ac]])}
            <div class="badges">${(s.props || []).map((p) => `<span class="badge">${esc(p)}</span>`).join('')}</div><div class="cp-text">${(s.desc || []).map(para).join('')}</div>`;
    }
    function ruleHtml(e) {
        let h = '', ul = false;
        for (const p of e.text) {
            if (p.startsWith('- ')) { h += (ul ? '' : '<ul>') + `<li>${esc(p.slice(2))}</li>`; ul = true; } else { h += (ul ? '</ul>' : '') + para(p); ul = false; }
        }
        return `<p class="muted">${esc(e.sub)}</p><div class="cp-text">${h}${ul ? '</ul>' : ''}</div>`;
    }

    const sourceLink = (e) => (e.t === 'spell' ? `https://www.dnd5eapi.co/api/2014/spells/${e.id}` : e.t === 'monster' ? (e.src === 'srd' ? `https://www.dnd5eapi.co/api/2014/monsters/${e.id.slice(4)}` : `https://open5e.com/monsters/${e.id.slice(4)}`)
        : e.t === 'item' ? `https://www.dnd5eapi.co/api/2014/equipment/${e.id.slice(3)}` : `https://www.dnd5eapi.co/api/2014/magic-items/${e.id.slice(6)}`);
    const url = (e) => (e.t === 'spell' ? `/sheets/player/spells.php?i=${encodeURIComponent(e.id)}` : e.t === 'monster' ? `/sheets/monster/monsters.php?i=${encodeURIComponent(e.id)}` : `/compendium/items.php?i=${encodeURIComponent(e.id)}`);
    async function fetchText(e) {
        if (texts.has(key(e))) return texts.get(key(e));
        const r = await fetch(url(e));
        if (!r.ok) throw new Error(r.status);
        const j = await r.json();
        texts.set(key(e), j);
        return j;
    }

    const STAR = (on) => `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M8 1.5l1.9 4.1 4.5.5-3.3 3.1.9 4.4L8 11.3 3.99 13.6l.9-4.4L1.6 6.1l4.5-.5z" fill="${on ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
    let qty = 1;
    function actions(e) {
        if (e.t === 'rule') return '';
        if (e.t === 'monster') return `<div class="cp-add"><span class="cp-qty"><button type="button" class="btn small" data-qty="-1" aria-label="One fewer">&minus;</button><b id="cp-n">${qty}</b><button type="button" class="btn small" data-qty="1" aria-label="One more">+</button></span>
            <button type="button" class="btn primary" data-add="enc">Add to encounter</button></div>`;
        return '<div class="cp-add"><button type="button" class="btn primary" data-add="sheet">Add to sheet</button></div>';
    }
    function head(e) {
        const on = isFav(e);
        return `<div class="cp-title"><h2>${esc(e.name)}</h2><span class="cp-tools">
            <button type="button" class="btn small" data-fav aria-pressed="${on}" aria-label="${on ? 'Remove from favourites' : 'Add to favourites'}" title="${on ? 'Remove from favourites' : 'Add to favourites'}">${STAR(on)}</button>
            <button type="button" class="btn small" data-link>Copy link</button></span></div>
            <div class="badges">${(e.hb ? [['Homebrew', 'p']] : []).concat(e.tags).map(tag).join('')}</div>`;
    }
    let token = 0;
    async function openEntry(e) {
        if (!e) return;
        const mine = ++token;
        S.sel = key(e); qty = 1;
        const r = recents().filter((k) => k !== key(e));
        r.unshift(key(e));
        store.set('compendium-recent', r.slice(0, 10));
        for (const b of list.querySelectorAll('.cp-row')) { const on = b.dataset.k === S.sel; b.classList.toggle('on', on); if (on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); }
        detail.classList.add('open'); document.body.classList.add('cp-lock');
        persist();
        const top = head(e);
        const draw = (body) => { if (mine === token) { dbody.innerHTML = top + body + actions(e) + '<div id="cp-msg"></div>'; detail.scrollTop = 0; } };
        if (e.html !== undefined) return draw(e.html);
        if (e.t === 'rule') return draw(ruleHtml(e));
        if (e.extra) return draw(spellHtml(e));
        dbody.innerHTML = top + '<div class="cp-sk" aria-hidden="true"></div><div class="cp-sk" aria-hidden="true"></div><p class="muted">Loading ' + esc(e.name) + '...</p>';
        detail.focus({ preventScroll: true });
        try {
            const j = await fetchText(e);
            draw(e.t === 'spell' ? spellHtml(e, j) : e.t === 'monster' ? monsterHtml(e, j) : itemHtml(e, j));
        } catch (err) {
            if (mine === token) dbody.innerHTML = top + `<p class="err">Couldn't load ${esc(e.name)}. Try again in a minute, or read it at <a href="${esc(sourceLink(e))}" target="_blank" rel="noopener">its source</a>. <button type="button" class="btn small" data-reopen>Try again</button></p>`;
        }
    }
    function closeDetail() { detail.classList.remove('open'); document.body.classList.remove('cp-lock'); }
    function openFromUrl() {
        if (!want) return;
        const e = byKey.get(want);
        if (e) { want = ''; openEntry(e); return; }
        // the entry's list hasn't come in yet (or failed): wait for the list that has it
        const t = want.split(':')[0];
        if (loaded.has(t) || failed.has(t)) { want = ''; dbody.innerHTML = '<p class="note">That entry isn\'t in the compendium.</p>'; detail.classList.add('open'); document.body.classList.add('cp-lock'); }
    }

    $('#cp-back').addEventListener('click', () => { S.sel = null; closeDetail(); persist(); for (const b of list.querySelectorAll('.cp-row.on')) b.classList.remove('on'); });
    detail.addEventListener('click', (ev) => {
        const e = byKey.get(S.sel), b = ev.target.closest('button');
        if (!e || !b) return;
        if (b.dataset.fav !== undefined) {
            const f = favs(), i = f.indexOf(key(e));
            if (i >= 0) f.splice(i, 1); else f.push(key(e));
            store.set('compendium-favs', f);
            b.setAttribute('aria-pressed', i < 0); b.innerHTML = STAR(i < 0);
            b.setAttribute('aria-label', i < 0 ? 'Remove from favourites' : 'Add to favourites'); b.title = b.getAttribute('aria-label');
            if (S.tab === 'fav') refresh();
        } else if (b.dataset.link !== undefined) UI.copy(location.href, b);
        else if (b.dataset.qty) { qty = Math.max(1, qty + +b.dataset.qty); $('#cp-n').textContent = qty; }
        else if (b.dataset.add === 'sheet') addToSheet(e);
        else if (b.dataset.add === 'enc') addToEncounter(e);
        else if (b.dataset.reopen !== undefined) openEntry(e);
    });

    // ---- requests to the sheets (applied there, see sheet.js and monster.js) ----
    const uid = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const isObj = (o) => o && typeof o === 'object' && !Array.isArray(o);
    const lock = (name, fn) => (navigator.locks ? navigator.locks.request(name, fn) : fn());
    const queue = (k, item) => lock(k, () => {
        let q = [];
        try { q = JSON.parse(localStorage.getItem(k)); } catch (e) { }
        if (!Array.isArray(q)) q = [];
        q.push(item);
        localStorage.setItem(k, JSON.stringify(q));
    });
    const note = (html, kind = 'ok') => { const m = $('#cp-msg'); if (m) m.innerHTML = `<p class="${kind}">${html}</p>`; };

    // the characters in this browser, plus (signed in) the ones only in the account
    async function characters() {
        let db = null;
        try { db = JSON.parse(localStorage.getItem('hb-sheet')); } catch (e) { }
        const out = {};
        if (isObj(db) && isObj(db.chars)) for (const c of Object.values(db.chars)) if (isObj(c) && c.updated && c.id) out[c.id] = c;
        if (cloud) {
            try {
                const r = await fetch('/sheets/player/cloud.php');
                if (r.ok) {
                    const ids = Object.keys((await r.json()).chars || {}).filter((id) => !out[id]);
                    await Promise.all(ids.map((id) => fetch('/sheets/player/cloud.php?id=' + encodeURIComponent(id)).then((x) => (x.ok ? x.json() : null)).then((c) => { if (isObj(c) && c.id) out[c.id] = c; }).catch(() => { })));
                }
            } catch (e) { }
        }
        return Object.values(out).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }
    const level = (c) => (Array.isArray(c.classes) ? c.classes : []).reduce((n, k) => n + (+k.level || 0), 0) || 1;
    const line = (c) => [`Level ${level(c)}`, c.race, (Array.isArray(c.classes) ? c.classes : []).map((k) => k.name).filter(Boolean).join(' / ')].filter(Boolean).join(' | ');
    function hasEntry(c, e) {
        const type = e.t === 'spell' ? 'spells' : 'items', n = e.name.trim().toLowerCase();
        const onSheet = (Array.isArray(c.panels) ? c.panels : []).some((p) => p && p.type === type && (p.rows || []).some((r) => r && String(r.name || '').trim().toLowerCase() === n));
        let q = [];
        try { q = JSON.parse(localStorage.getItem('hb-pending')) || []; } catch (x) { }
        return onSheet || (Array.isArray(q) && q.some((x) => x && x.char === c.id && String(x.name).toLowerCase() === n));
    }
    function sheetRequest(c, e) {
        const base = { id: uid(), char: c.id, name: e.name };
        if (e.t === 'spell') return { ...base, kind: 'spell', lvl: e.f.level };
        const cat = e.t === 'magic' ? 'Magic items' : e.f.cat === 'Weapon' ? 'Weapons' : e.f.cat === 'Armor' ? 'Armour' : 'Gear';
        const s = texts.get(key(e));
        return { ...base, kind: 'item', cat, fill: e.t === 'item', notes: e.t === 'magic' && s ? (s.desc || []).join('\n\n') : '' };
    }
    const dlg = (id) => document.getElementById(id);
    document.addEventListener('click', (ev) => { if (ev.target.closest('[data-close]')) ev.target.closest('dialog').close(); });
    async function addToSheet(e) {
        // a magic item's text is saved on the row, so it needs to have loaded
        if (e.t === 'magic' && !texts.has(key(e))) { try { await fetchText(e); } catch (x) { return note("Couldn't load the item's text. Try again in a minute.", 'err'); } }
        const chars = await characters();
        const body = dlg('cp-pick-body');
        if (!chars.length) {
            body.innerHTML = '<p>You have no characters yet.</p><p><a class="btn" href="/characters/new">Create a character</a></p>';
            return dlg('cp-pick').showModal();
        }
        if (chars.length === 1) return give(chars[0], e);
        body.innerHTML = chars.map((c) => `<button type="button" class="rowi cp-char" data-char="${esc(c.id)}"><span class="grow"><b>${esc(c.name || 'Unnamed character')}</b><br><small>${esc(line(c))}</small></span></button>`).join('');
        body.onclick = (ev) => {
            const b = ev.target.closest('[data-char]');
            if (!b) return;
            dlg('cp-pick').close();
            give(chars.find((c) => c.id === b.dataset.char), e);
        };
        dlg('cp-pick').showModal();
    }
    async function give(c, e) {
        const name = c.name || 'Unnamed character';
        const go = async () => {
            try { await queue('hb-pending', sheetRequest(c, e)); } catch (x) { return note("Couldn't save the request: this browser's storage is full or blocked.", 'err'); }
            note(`${esc(e.name)} will be on ${esc(name)}'s sheet. <a href="/characters/${encodeURIComponent(c.id)}">Open ${esc(name)}</a>`);
        };
        if (!hasEntry(c, e)) return go();
        $('#cp-dup-text').textContent = `${name} already has ${e.name}. Add another?`;
        dlg('cp-dup').showModal();
        $('#cp-dup-yes').onclick = () => { dlg('cp-dup').close(); go(); };
    }
    async function addToEncounter(e) {
        try { await queue('mon-pending', { id: uid(), key: e.id, n: qty, name: e.name }); } catch (x) { return note("Couldn't save the request: this browser's storage is full or blocked.", 'err'); }
        note(`${esc(e.name)}${qty > 1 ? ' ×' + qty : ''} will be on the Monster Sheet. <a href="/sheets/monster/">Open the Monster Sheet</a>`);
    }

    // ---- keyboard ----
    $('#cp-credits-btn').addEventListener('click', () => dlg('cp-credits').showModal());
    document.addEventListener('keydown', (ev) => {
        const tg = ev.target, typing = /^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName) || tg.isContentEditable;
        if (ev.key === '/' && !typing && !ev.ctrlKey && !ev.metaKey && !ev.altKey) { ev.preventDefault(); $('#cp-q').focus(); return; }
        if (ev.key === 'Escape' && detail.classList.contains('open') && !document.querySelector('dialog[open]')) { $('#cp-back').click(); return; }
        if ((ev.key === 'ArrowDown' || ev.key === 'ArrowUp') && (tg === $('#cp-q') || list.contains(tg))) {
            const items = [...list.querySelectorAll('.cp-row, .cp-showall')], i = items.indexOf(tg);
            const n = ev.key === 'ArrowDown' ? (i < 0 ? 0 : i + 1) : i - 1;
            if (n < 0) { $('#cp-q').focus(); ev.preventDefault(); } else if (items[n]) { items[n].focus(); ev.preventDefault(); }
        }
    });

    // homebrew (5.2) hands its entries over with Compendium.add([{ t, id, name, sub, f: {...}, html }]); they show with a Homebrew badge
    window.Compendium = { add(more) { for (const e of more) addEntry(Object.assign({ tags: [], f: {}, sub: '', hb: true }, e, { f: Object.assign({ src: 'Homebrew' }, e.f) })); entries.sort(byName); drawTabs(); refresh(); } };

    drawTabs();
    refresh();
    for (const t of Object.keys(loaders)) load(t).then(drawTabs);
});
