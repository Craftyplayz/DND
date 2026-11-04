// Compendium (/compendium/): one searchable list of spells, monsters, items, magic items, classes, races, backgrounds, feats and rules.
// Player content comes from sheets/player/content/<rules>-<file>.json (built by _dev/scripts/build-content.mjs), one file per tab group,
// loaded the first time a tab (or the All tab, or a link) needs it; an entry's text is in the data, so it opens without another fetch.
// Monsters are monsters.json, with a stat block fetched through monsters.php when one is opened; rules are rules.js.
// Entries from the content files are keyed by rules version ("spell:2014:fireball"): 2014 and 2024 share indexes, so they never merge.
// "Add to sheet" and "Add to encounter" leave a request in localStorage (hb-pending / mon-pending) that the sheet applies when it opens,
// or at once if it is already open (see sheet.js, monster.js).
// Monsters are the 2014 rules except the SRD 5.2 book, so the rules switch filters them too.
// Settings follow the account through assets/js/sync.js: compendium-view (tab and filters), compendium-rules (2014 / 2024 / both),
// compendium-favs, compendium-recent.
document.addEventListener('DOMContentLoaded', () => {
    'use strict';
    const { $, esc, store, debounce, num } = UI;
    const cloud = 'cloud' in $('#main').dataset;
    // the popup (assets/js/popup.js) runs this page in a frame: creating or editing homebrew opens the full page, and the page it sits beside
    // can say which character or encounter "Add to" means (parent.cpContext, set by the sheets)
    const EMBED = document.documentElement.classList.contains('cp-embed');
    const ctx = () => { try { return (EMBED && parent.cpContext && parent.cpContext()) || null; } catch (e) { return null; } };
    const fullPage = (url) => { if (EMBED) window.open(url || '/compendium/' + location.search, '_blank'); else location.href = url; };
    const TABS = [['all', 'All'], ['spell', 'Spells'], ['monster', 'Monsters'], ['item', 'Items'], ['magic', 'Magic items'], ['class', 'Classes'], ['race', 'Races'],
        ['background', 'Backgrounds'], ['feat', 'Feats'], ['rule', 'Rules'], ['fav', 'Favourites'], ['recent', 'Recent']];
    const TYPE_NAME = { spell: 'Spell', monster: 'Monster', item: 'Item', magic: 'Magic item', class: 'Class', subclass: 'Subclass', race: 'Race', subrace: 'Subrace', background: 'Background', feat: 'Feat', rule: 'Rule' };
    const TYPE_PLURAL = { spell: 'spells', monster: 'monsters', item: 'items', magic: 'magic items', class: 'classes', subclass: 'subclasses', race: 'races', subrace: 'subraces', background: 'backgrounds', feat: 'feats', rule: 'rules' };
    // the types each tab lists (subclasses sit with classes, subraces with races)
    const TAB_TYPES = { class: ['class', 'subclass'], race: ['race', 'subrace'] };
    const typesOf = (t) => TAB_TYPES[t] || [t];
    const GROUPS = ['spell', 'monster', 'item', 'magic', 'class', 'race', 'background', 'feat', 'rule'];
    const BATCH = 50, GROUP = 5, SRD = 'SRD 5.1', RULES = ['2014', '2024'];
    const RARITY = ['Common', 'Uncommon', 'Rare', 'Very Rare', 'Legendary', 'Artifact', 'Varies'];
    const SIZES = ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan', 'Titanic'];
    const CRS = [0, 0.125, 0.25, 0.5, ...Array.from({ length: 30 }, (_, i) => i + 1)];
    const crText = (n) => ({ 0.125: '1/8', 0.25: '1/4', 0.5: '1/2' })[n] || String(n);
    const SECTION = { sense: 'Sense', cond: 'Condition', skill: 'Skill', prop: 'Weapon property', lang: 'Language', armour: 'Armour', dmg: 'Damage type', act: 'Action', spell: 'Spellcasting rule', hp: 'Hit points' };
    const ABIL = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' };
    // the filters each tab has: [name, label, kind]
    const HB_ONLY = ['hb', 'Homebrew only', 'tick'];
    const FILTERS = {
        spell: [['level', 'Level'], ['school', 'School'], ['cls', 'Class'], ['conc', 'Concentration', 'yn'], ['ritual', 'Ritual', 'yn'], HB_ONLY],
        monster: [['crmin', 'Lowest CR', 'cr'], ['crmax', 'Highest CR', 'cr'], ['size', 'Size'], ['mtype', 'Type'], HB_ONLY],
        item: [['cat', 'Category'], HB_ONLY],
        magic: [['cat', 'Category'], ['rarity', 'Rarity'], HB_ONLY],
        class: [['kind', 'Show'], ['cls', 'Class'], HB_ONLY],
        race: [['kind', 'Show'], HB_ONLY],
        background: [HB_ONLY],
        feat: [HB_ONLY],
        rule: [HB_ONLY],
    };

    const entries = [], byKey = new Map(), texts = new Map(), failed = new Set(), loaded = new Set(), loading = new Map();
    const key = (e) => e.t + ':' + e.id;
    function addEntry(e) {
        if (byKey.has(key(e))) return;
        e.book ??= e.d?.book;
        entries.push(e); byKey.set(key(e), e);
    }
    const byName = (a, b) => a.name.localeCompare(b.name) || String(a.r || '').localeCompare(String(b.r || ''));
    // "a-slug_like-this" -> "A slug like this"
    const nice = (s) => String(s || '').replace(/^(skill|saving-throw)-/, '').replace(/[-_]+/g, ' ').replace(/^./, (c) => c.toUpperCase());
    const name = (x) => (x && typeof x === 'object' ? x.name || nice(x.index) : nice(x));
    // Compendium keys from before the content files ("spell:fireball", "spell:wd:x", "item:eq:x", "magic:magic:x") are the 2014 entries now
    // or, where the entry moved or was renamed, whatever the build scripts' aliases say (content/aliases.json, monster/aliases.json).
    // Only reads go through this: stored favourites and recents keep the key they were saved under.
    let ALIAS = {};
    function canon(k) {
        if (ALIAS[k]) return ALIAS[k];
        const i = k.indexOf(':'), t = k.slice(0, i);
        let id = k.slice(i + 1);
        if (!['spell', 'item', 'magic'].includes(t) || /^(\d{4}|hb):/.test(id)) return k;
        id = id.replace(/^(wd|eq|magic):/, '');
        return `${t}:2014:${id}`;
    }

    // ---- lists ----
    const getJson = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error(r.status); return r.json(); };
    const CONTENT = '/sheets/player/content/';
    // which content file each type lives in
    const FILE = { spell: 'spells', item: 'items', magic: 'items', class: 'classes', subclass: 'classes', race: 'origins', subrace: 'origins', background: 'origins', feat: 'origins' };
    const prereq = (list) => (Array.isArray(list) ? list : []).map((p) => (typeof p === 'string' ? p : p.desc || (p.ability_score ? `${ABIL[p.ability_score] || p.ability_score} ${p.minimum_score}+` : ''))).filter(Boolean).join('; ');
    const itemCat = (x) => {
        const c = [x.equipment_category && (x.equipment_category.index || x.equipment_category), ...(x.equipment_categories || [])].join(' ');
        return /weapon/.test(c) ? 'Weapon' : /armor/.test(c) ? 'Armor' : /ammunition/.test(c) ? 'Ammunition' : /tool|gaming|instrument/.test(c) ? 'Tools' : /mount|vehicle/.test(c) ? 'Mounts and vehicles' : 'Adventuring gear';
    };
    const skills = (list) => (list || []).filter((p) => /^skill-/.test(p)).map(nice);
    const content = {
        spells(r, j) {
            for (const s of Object.values(j.spells || {})) {
                addEntry({ t: 'spell', id: r + ':' + s.index, r, name: s.name, sub: [s.level ? 'Level ' + s.level : 'Cantrip', s.school, s.casting_time].join(' · '), hay: s.school, tags: [],
                    f: { level: s.level, school: s.school, conc: !!s.concentration, ritual: !!s.ritual, cls: (s.classes || []).map(nice) }, d: s });
            }
        },
        items(r, j) {
            for (const x of Object.values(j.equipment || {})) {
                const cat = itemCat(x);
                addEntry({ t: 'item', id: r + ':' + x.index, r, name: x.name, sub: cat, hay: cat, tags: [], f: { cat }, d: x });
            }
            for (const x of Object.values(j.magic_items || {})) {
                const cat = String(x.type || '').replace(/\s*\(.*$/, ''), rarity = /varies|by /i.test(x.rarity) ? 'Varies' : x.rarity;
                addEntry({ t: 'magic', id: r + ':' + x.index, r, name: x.name, sub: [cat, rarity].filter(Boolean).join(' · '), hay: cat, tags: rarity ? [[rarity]] : [], f: { cat, rarity }, d: x });
            }
        },
        classes(r, j) {
            const cls = j.classes || {};
            for (const c of Object.values(cls)) {
                addEntry({ t: 'class', id: r + ':' + c.index, r, name: c.name, sub: `Hit die d${c.hit_die}` + (c.spellcasting ? ` · Spellcaster (${ABIL[c.spellcasting.spellcasting_ability] || ''})` : ''), hay: 'class', tags: [], f: { kind: 'Classes', cls: c.name }, d: c });
            }
            for (const s of Object.values(j.subclasses || {})) {
                const of = (cls[s.class] || {}).name || nice(s.class);
                addEntry({ t: 'subclass', id: r + ':' + s.index, r, name: s.name, sub: `${of} subclass` + (s.subclass_flavor ? ' · ' + s.subclass_flavor : ''), hay: of, tags: [], f: { kind: 'Subclasses', cls: of }, d: s });
            }
        },
        origins(r, j) {
            const races = j.races || {};
            for (const x of Object.values(races)) addEntry({ t: 'race', id: r + ':' + x.index, r, name: x.name, sub: [x.size, x.speed ? `Speed ${x.speed} ft.` : ''].filter(Boolean).join(' · '), hay: 'race', tags: [], f: { kind: 'Races' }, d: x });
            for (const x of Object.values(j.subraces || {})) {
                const of = (races[x.race] || {}).name || nice(x.race);
                addEntry({ t: 'subrace', id: r + ':' + x.index, r, name: x.name, sub: `${of} subrace`, hay: of, tags: [], f: { kind: 'Subraces' }, d: x });
            }
            for (const x of Object.values(j.backgrounds || {})) addEntry({ t: 'background', id: r + ':' + x.index, r, name: x.name, sub: skills(x.starting_proficiencies).join(', ') || 'Background', hay: '', tags: [], f: {}, d: x });
            for (const x of Object.values(j.feats || {})) addEntry({ t: 'feat', id: r + ':' + x.index, r, name: x.name, sub: prereq(x.prerequisites) ? 'Prerequisite: ' + prereq(x.prerequisites) : 'No prerequisite', hay: '', tags: [], f: {}, d: x });
        },
    };
    // a job is one file: "2014-spells", "monster" or "rule"
    const jobs = {
        async monster() {
            const j = await getJson('/sheets/monster/monsters.json');
            sources = j.sources;
            for (const [id, name, cr, type, src, size] of j.list) {
                const book = src === 'srd' ? SRD : (j.sources[src] || {}).title || src;
                addEntry({ t: 'monster', id, r: src === 'srd-2024' ? '2024' : '2014', name, sub: `CR ${crText(cr)} · ${[size, type].filter(Boolean).join(' ')}`, hay: type, tags: [[book, /^srd/.test(src) ? 'g' : '']], f: { cr, size, mtype: type, src: book }, src, book });
            }
        },
        rule: () => new Promise((ok, no) => {
            const s = document.createElement('script');
            s.src = '/sheets/player/rules.js';
            s.onload = () => {
                for (const [sec, items] of Object.entries(window.HB_RULES || {})) for (const [k, text] of Object.entries(items)) {
                    addEntry({ t: 'rule', id: sec + ':' + k, name: k.replace(/\b[a-z]/g, (c) => c.toUpperCase()), sub: SECTION[sec] || sec, hay: SECTION[sec] || '', tags: [[SRD, 'g']], f: {}, text });
                }
                ok();
            };
            s.onerror = () => no(new Error('rules'));
            document.head.appendChild(s);
        }),
        // the browser's copy shows at once; the account's and the campaigns' come after
        async homebrew() {
            showHomebrew();
            await Homebrew.sync().catch(() => { });
            showHomebrew();
            // an entry opened from the browser's copy: the account has now said which campaigns there are
            const e = S.sel && S.sel.includes(':hb:') && byKey.get(S.sel);
            if (e) openEntry(e);
        },
    };
    for (const r of RULES) for (const f of Object.keys(content)) jobs[r + '-' + f] = async () => content[f](r, await getJson(`${CONTENT}${r}-${f}.json`));
    let sources = {};
    // the jobs a type needs, for the rules picked (or for one version)
    const jobsOf = (t, rules) => (FILE[t] ? (rules ? [rules] : rulesOn()).map((r) => r + '-' + FILE[t]) : [t]);
    const jobsOfKey = (k) => { const [t, r] = k.split(':'); return r === 'hb' ? ['homebrew'] : jobsOf(t, FILE[t] && RULES.includes(r) ? r : null).filter((j) => jobs[j]); };
    function wanted() {
        const t = S.tab;
        const keys = t === 'fav' ? favs() : t === 'recent' ? recents() : null;
        const out = keys ? keys.flatMap(jobsOfKey) : (t === 'all' ? GROUPS : typesOf(t)).flatMap((x) => jobsOf(x));
        if (want) out.push(...jobsOfKey(want));
        out.push('homebrew');
        return [...new Set(out)];
    }
    function load(j) {
        if (loaded.has(j)) return Promise.resolve();
        if (loading.has(j)) return loading.get(j);
        failed.delete(j);
        const p = jobs[j]().then(() => loaded.add(j)).catch(() => failed.add(j)).then(() => { loading.delete(j); entries.sort(byName); drawTabs(); refresh(); openFromUrl(); });
        loading.set(j, p);
        return p;
    }
    const ensure = () => { for (const j of wanted()) load(j); };

    // ---- state ----
    const params = new URLSearchParams(location.search);
    const saved = store.get('compendium-view', {});
    const S = { tab: 'all', q: '', f: {}, sel: null, rules: 'both' };
    S.tab = TABS.some(([k]) => k === (params.get('tab') || saved.tab)) ? params.get('tab') || saved.tab : 'all';
    S.q = params.get('q') || '';
    // resolved once the aliases are in
    let want = params.get('t') && params.get('i') ? params.get('t') + ':' + params.get('i') : '';
    const wantTab = want && TABS.find(([k]) => typesOf(k).includes(want.split(':')[0]));
    if (wantTab && !params.get('tab')) S.tab = wantTab[0];
    S.f = S.tab === saved.tab ? Object.assign({}, saved.f || {}) : {};
    for (const [k, v] of params) if (k.startsWith('f.')) S.f[k.slice(2)] = v;
    const r0 = store.get('compendium-rules', 'both');
    S.rules = ['2014', '2024', 'both'].includes(r0) ? r0 : 'both';
    const rulesOn = () => (S.rules === 'both' ? RULES : [S.rules]);

    const favs = () => store.get('compendium-favs', []).filter((k) => typeof k === 'string').map(canon);
    const recents = () => store.get('compendium-recent', []).filter((k) => typeof k === 'string').map(canon);
    const isFav = (e) => favs().includes(key(e));

    // ---- search ----
    function matches(e) {
        const f = S.f, v = e.f;
        if (!FILTERS[S.tab]) return true;
        if (f.hb && !e.hb) return false;
        if (f.level !== undefined && f.level !== '' && v.level !== +f.level) return false;
        for (const k of ['school', 'mtype', 'size', 'src', 'cat', 'rarity', 'kind']) if (f[k] && v[k] !== f[k]) return false;
        if (f.cls && !(Array.isArray(v.cls) ? v.cls.includes(f.cls) : v.cls === f.cls)) return false;
        for (const k of ['conc', 'ritual']) if (f[k] && v[k] !== (f[k] === 'yes')) return false;
        if (f.crmin !== undefined && f.crmin !== '' && v.cr < +f.crmin) return false;
        if (f.crmax !== undefined && f.crmax !== '' && v.cr > +f.crmax) return false;
        return true;
    }
    // entries of the other rules version are hidden (favourites and recent show everything)
    const inRules = (e) => (!e.r || S.rules === 'both' || e.r === S.rules) && Books.allows(e.book);
    function results() {
        const t = S.tab, types = typesOf(t);
        let pool = t === 'fav' ? favs().map((k) => byKey.get(k)).filter(Boolean) : t === 'recent' ? recents().map((k) => byKey.get(k)).filter(Boolean)
            : entries.filter((e) => (t === 'all' || types.includes(e.t)) && inRules(e));
        pool = pool.filter(matches);
        // with no search, classes and races come before their subclasses and subraces
        const under = (e) => e.t === 'subclass' || e.t === 'subrace';
        if (!S.q.trim()) return t === 'fav' || t === 'recent' ? pool : [...pool.filter((e) => !under(e)), ...pool.filter(under)];
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
    // the rules version is shown only when both are listed (or the entry is from the version not picked)
    const tagsOf = (e) => (e.hb ? [['Homebrew', 'p']] : []).concat(e.r && (S.rules === 'both' || e.r !== S.rules) ? [[e.r, 'b']] : [], e.tags);
    const row = (e) => `<button type="button" class="cp-row${S.sel === key(e) ? ' on' : ''}" data-k="${esc(key(e))}"${S.sel === key(e) ? ' aria-current="true"' : ''}>
        <span class="cp-name">${esc(e.name)}</span><span class="cp-tags">${tagsOf(e).map(tag).join('')}</span><small class="cp-sub">${esc(e.sub)}</small></button>`;
    const skeleton = () => '<div class="cp-sk" aria-hidden="true"></div>'.repeat(8);
    const jobName = (j) => { const [r, f] = j.split('-'); return f ? `${r} ${({ spells: 'spells', items: 'items and magic items', classes: 'classes', origins: 'races, backgrounds and feats' })[f]}` : TYPE_PLURAL[j]; };

    let io;
    function refresh() {
        const all = results(), need = wanted();
        shown = all; at = 0;
        const total = all.length;
        const busy = need.some((j) => !loaded.has(j) && !failed.has(j));
        grouped = S.tab === 'all';
        $('#cp-count').textContent = total ? `${num(total)} ${total === 1 ? 'result' : 'results'}` : '';
        let html = '';
        for (const j of need) if (failed.has(j)) html += `<p class="err">Couldn't load the ${esc(jobName(j))} list. <button type="button" class="btn small" data-retry="${esc(j)}">Try again</button></p>`;
        if (grouped) {
            // while searching, the type with the best match comes first
            const tabOf = (t) => (t === 'subclass' ? 'class' : t === 'subrace' ? 'race' : t);
            for (const t of S.q.trim() ? [...new Set(all.map((e) => tabOf(e.t)))] : GROUPS) {
                const g = all.filter((e) => typesOf(t).includes(e.t));
                if (!g.length) continue;
                const label = TABS.find(([k]) => k === t)[1];
                html += `<h2 class="cp-gh">${label} <span class="n">${num(g.length)}</span></h2>${g.slice(0, GROUP).map(row).join('')}`;
                if (g.length > GROUP) html += `<button type="button" class="btn small cp-showall" data-tab="${t}">Show all ${num(g.length)} ${label.toLowerCase()}</button>`;
            }
            shown = [];
        } else html += all.slice(0, BATCH).map(row).join('');
        at = Math.min(BATCH, all.length);
        if (!total && busy) html += skeleton();
        else if (!total && !html) {
            const filtered = Object.values(S.f).some((v) => v !== '' && v !== undefined);
            html += S.f.hb && !S.q.trim() ? `<p class="muted">No homebrew here yet.${FORMS[S.tab] ? ` Press New ${FORMS[S.tab].noun} to make one.` : ''}</p>`
                : S.tab === 'fav' ? '<p class="muted">No favourites yet. Open an entry and press the star.</p>'
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
        // a batch that leaves the sentinel near the screen (a scroll in the same frame, short rows) never re-crosses the
        // observer's edge, so it gets no new callback: check again once the batch is laid out
        requestAnimationFrame(() => { if (more.getClientRects().length && more.getBoundingClientRect().top < innerHeight + 600) next(); });
    }

    // ---- tabs, rules and filters ----
    $('#cp-tabs').innerHTML = TABS.map(([k, n]) => `<button type="button" role="tab" data-tab="${k}">${n}</button>`).join('');
    function drawTabs() {
        for (const b of $('#cp-tabs').children) { const on = b.dataset.tab === S.tab; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); }
        for (const i of document.querySelectorAll('#cp-rules input')) i.checked = i.value === S.rules;
        const fl = FILTERS[S.tab] || [], box = $('#cp-filters');
        const pool = entries.filter((e) => typesOf(S.tab).includes(e.t) && inRules(e));
        const opts = (name, kind) => {
            if (kind === 'yn') return ['yes', 'Yes', 'no', 'No'];
            if (kind === 'cr') return CRS.flatMap((c) => [c, crText(c)]);
            if (name === 'level') return Array.from({ length: 10 }, (_, i) => [i, i ? 'Level ' + i : 'Cantrip']).flat();
            let vals = [...new Set(pool.flatMap((e) => e.f[name]).filter(Boolean))];
            vals = name === 'size' ? vals.sort((a, b) => SIZES.indexOf(a) - SIZES.indexOf(b)) : name === 'rarity' ? vals.sort((a, b) => RARITY.indexOf(a) - RARITY.indexOf(b)) : vals.sort((a, b) => (a === SRD ? -1 : b === SRD ? 1 : a.localeCompare(b)));
            return vals.flatMap((v) => [v, v]);
        };
        box.innerHTML = fl.map(([name, label, kind]) => {
            if (kind === 'tick') return `<label class="check"><input type="checkbox" data-f="${name}" value="1"${S.f[name] ? ' checked' : ''}> ${label}</label>`;
            const o = opts(name, kind), cur = S.f[name] === undefined ? '' : String(S.f[name]);
            let h = '<option value="">Any</option>';
            for (let i = 0; i < o.length; i += 2) h += `<option value="${esc(o[i])}"${String(o[i]) === cur ? ' selected' : ''}>${esc(o[i + 1])}</option>`;
            return `<label>${label}<select class="field" data-f="${name}">${h}</select></label>`;
        }).join('') + (fl.length ? '<button type="button" class="btn small" data-clear>Clear filters</button>' : '');
        // a saved filter this tab no longer has (the old spell Source, an old item category) would hide everything with no way to see why
        const settled = wanted().every((j) => loaded.has(j));
        for (const k of Object.keys(S.f)) {
            const sel = box.querySelector(`[data-f="${CSS.escape(k)}"]`);
            if (S.f[k] !== '' && (!sel || (settled && sel.value !== String(S.f[k])))) delete S.f[k];
        }
        $('#cp-fbtn').hidden = !fl.length;
        box.hidden = !fl.length;
        drawHomebrewBar();
        $('#cp-books').hidden = S.tab === 'rule';
        $('#cp-books').textContent = Books.label();
    }
    function persist() {
        store.set('compendium-view', { tab: S.tab, f: S.f });
        const p = new URLSearchParams();
        if (S.tab !== 'all') p.set('tab', S.tab);
        if (S.q.trim()) p.set('q', S.q.trim());
        for (const [k, v] of Object.entries(S.f)) if (v !== '' && v !== undefined) p.set('f.' + k, v);
        if (S.sel) { const e = byKey.get(S.sel); if (e) { p.set('t', e.t); p.set('i', e.id); } }
        history.replaceState(null, '', location.pathname + (p.toString() ? '?' + p : ''));
        if (EMBED) try { sessionStorage.setItem('cp-popup-url', location.search); } catch (e) { } // the next page's popup opens here
    }
    function setTab(t) { S.tab = t; S.f = {}; drawTabs(); refresh(); persist(); ensure(); }

    $('#cp-tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) setTab(b.dataset.tab); });
    $('#cp-rules').addEventListener('change', (e) => {
        S.rules = e.target.value;
        store.set('compendium-rules', S.rules);
        drawTabs(); refresh(); ensure();
    });
    $('#cp-books').addEventListener('click', () => Books.open(() => { drawTabs(); refresh(); }, { monsters: true }));
    $('#cp-q').value = S.q;
    $('#cp-q').addEventListener('input', debounce((e) => { S.q = e.target.value; refresh(); persist(); }, 80));
    $('#cp-filters').addEventListener('change', (e) => { const s = e.target.closest('[data-f]'); if (s) { S.f[s.dataset.f] = s.type === 'checkbox' ? (s.checked ? '1' : '') : s.value; refresh(); persist(); } });
    $('#cp-fbtn').addEventListener('click', () => { const open = $('#cp-filters').classList.toggle('open'); $('#cp-fbtn').setAttribute('aria-expanded', open); });
    const clearFilters = () => { S.f = {}; drawTabs(); refresh(); persist(); };

    list.addEventListener('click', (e) => {
        const r = e.target.closest('[data-k]'), t = e.target.closest('[data-tab]');
        if (r) openEntry(byKey.get(r.dataset.k));
        else if (t) setTab(t.dataset.tab);
        else if (e.target.closest('[data-clear]')) clearFilters();
        else if (e.target.closest('[data-retry]')) load(e.target.closest('[data-retry]').dataset.retry);
    });
    $('#cp-filters').addEventListener('click', (e) => { if (e.target.closest('[data-clear]')) clearFilters(); });

    // ---- detail ----
    const para = (p) => `<p>${esc(p)}</p>`;
    const kv = (rows) => `<div class="kv">${rows.filter((r) => r[1] !== '' && r[1] != null).map(([k, v]) => `<span>${esc(k)}</span><span>${esc(v)}</span>`).join('')}</div>`;
    const fmtSpeed = (sp) => Object.entries(sp || {}).filter(([k, v]) => k !== 'hover' && v).map(([k, v]) => { const t = typeof v === 'number' ? v + ' ft.' : v; return k === 'walk' ? t : `${k} ${t}`; }).join(', ');
    const signed = (n) => (n >= 0 ? '+' : '−') + Math.abs(n);
    // text paragraphs as the content files keep them: "- " lines are a list, runs of "a | b" lines are a table (the first row its head)
    function textHtml(ps) {
        let h = '';
        const lines = (Array.isArray(ps) ? ps : [ps]).flatMap((p) => String(p ?? '').split('\n')).map((p) => p.trim()).filter(Boolean);
        for (let i = 0; i < lines.length;) {
            if (lines[i].startsWith('- ')) {
                let ul = '';
                for (; i < lines.length && lines[i].startsWith('- '); i++) ul += `<li>${esc(lines[i].slice(2))}</li>`;
                h += `<ul>${ul}</ul>`;
            } else if (lines[i].includes(' | ')) {
                const rows = [];
                for (; i < lines.length && lines[i].includes(' | '); i++) rows.push(lines[i].split(' | '));
                const [top, ...rest] = rows;
                h += `<div class="table-wrap"><table class="table"><thead><tr>${top.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rest.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
            } else h += para(lines[i++]);
        }
        return `<div class="cp-text">${h}</div>`;
    }
    const openLink = (k, label) => `<button type="button" class="cp-link" data-open="${esc(k)}">${esc(label)}</button>`;
    const build = '<div class="cp-add"><a class="btn primary" href="/characters/build">Build a character</a></div>';

    function spellHtml(s) {
        return `${kv([['Level', s.level ? 'Level ' + s.level : 'Cantrip'], ['School', s.school], ['Casting time', s.casting_time], ['Range', s.range], ['Components', (s.components || []).join(', ') + (s.material ? ` (${s.material})` : '')],
            ['Duration', s.duration], ['Classes', (s.classes || []).map(nice).join(', ')]])}
            <div class="badges">${s.concentration ? '<span class="badge">Concentration</span>' : ''}${s.ritual ? '<span class="badge">Ritual</span>' : ''}</div>
            ${textHtml(s.desc)}${(s.higher_level || []).length ? `<h3>At higher levels</h3>${textHtml(s.higher_level)}` : ''}`;
    }
    function monsterHtml(e, { src, m }) {
        const srd = src === 'srd', FULL = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'];
        const ac = srd ? (m.armor_class || [])[0] || {} : { value: m.armor_class, type: m.armor_desc };
        const acText = srd ? `${ac.value}${ac.type ? ' (' + ac.type + ')' : ''}` : `${ac.value ?? ''}${ac.type ? ' (' + ac.type + ')' : ''}`;
        const saves = [], skl = [];
        if (srd) for (const p of m.proficiencies || []) {
            const n = p.proficiency?.name || '';
            if (n.startsWith('Saving Throw: ')) saves.push(`${n.slice(14)} ${signed(p.value)}`);
            else if (n.startsWith('Skill: ')) skl.push(`${n.slice(7)} ${signed(p.value)}`);
        } else {
            FULL.forEach((f) => { if (m[f + '_save'] != null) saves.push(`${f.slice(0, 3).replace(/^./, (c) => c.toUpperCase())} ${signed(m[f + '_save'])}`); });
            for (const [k, v] of Object.entries(m.skills || {})) skl.push(`${k.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())} ${signed(v)}`);
        }
        const txt = (x) => (Array.isArray(x) ? x.map((y) => (typeof y === 'string' ? y : y.name)).join(', ') : String(x || ''));
        const senses = srd ? Object.entries(m.senses || {}).map(([k, v]) => `${k.replace(/_/g, ' ')} ${v}`).join(', ') : m.senses;
        const block = (title, items) => (Array.isArray(items) && items.length ? `<h3>${title}</h3>${items.map((a) => `<p><b>${esc(a.name)}.</b> ${esc(a.desc)}</p>`).join('')}` : '');
        const book = srd ? sources.srd : sources[m.document__slug];
        return `<p class="muted">${esc([m.size, String(m.type || '').toLowerCase() + (m.subtype ? ` (${m.subtype})` : ''), m.alignment].filter(Boolean).join(', '))}</p>
            ${kv([['Armour class', acText], ['Hit points', `${m.hit_points}${m.hit_points_roll || m.hit_dice ? ' (' + (m.hit_points_roll || m.hit_dice) + ')' : ''}`], ['Speed', fmtSpeed(m.speed)]])}
            <div class="table-wrap"><table class="table cp-abil"><thead><tr>${FULL.map((f) => `<th class="num">${f.slice(0, 3).toUpperCase()}</th>`).join('')}</tr></thead>
            <tbody><tr>${FULL.map((f) => `<td class="num">${m[f] ?? 10} (${signed(Math.floor(((m[f] ?? 10) - 10) / 2))})</td>`).join('')}</tr></tbody></table></div>
            ${kv([['Saving throws', saves.join(', ')], ['Skills', skl.join(', ')], ['Vulnerabilities', txt(m.damage_vulnerabilities)], ['Resistances', txt(m.damage_resistances)], ['Damage immunities', txt(m.damage_immunities)],
                ['Condition immunities', txt(m.condition_immunities)], ['Senses', senses], ['Languages', m.languages], ['Challenge', crText(e.f.cr) + (m.xp ? ` (${num(m.xp)} XP)` : '')]])}
            ${block('Traits', m.special_abilities)}${block('Actions', m.actions)}${block('Bonus actions', m.bonus_actions)}${block('Reactions', m.reactions)}
            ${m.legendary_desc || (m.legendary_actions || []).length ? `<h3>Legendary actions</h3>${m.legendary_desc ? para(m.legendary_desc) : ''}${(m.legendary_actions || []).map((a) => `<p><b>${esc(a.name)}.</b> ${esc(a.desc)}</p>`).join('')}` : ''}
            ${book ? `<p class="muted cp-credit">${esc(book.title)} (${esc(book.licence)}). ${esc(book.copyright)}</p>` : ''}`;
    }
    const cost = (c) => (c && c.quantity != null ? `${num(c.quantity)} ${c.unit}` : '');
    const dmg = (d) => (d && d.damage_dice ? `${d.damage_dice} ${String(name(d.damage_type)).toLowerCase()}` : '');
    function itemHtml(e) {
        const x = e.d;
        if (e.t === 'magic') {
            const att = x.attunement === true ? 'Requires attunement' : x.attunement ? String(x.attunement) : '';
            return `<div class="badges">${x.rarity ? `<span class="badge${/legendary|artifact/i.test(x.rarity) ? ' cp-gold' : ''}">${esc(x.rarity)}</span>` : ''}${att ? `<span class="badge b">${esc(att)}</span>` : ''}</div>
                ${x.type ? `<p class="muted">${esc(x.type)}</p>` : ''}${textHtml(x.desc)}`;
        }
        const ac = x.armor_class, rng = x.range || {}, thr = x.throw_range || {};
        const props = (x.properties || []).map(name);
        return `${kv([['Category', [e.f.cat, x.weapon_category || x.category_range, x.armor_category, x.tool_category, x.vehicle_category].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' · ')], ['Cost', cost(x.cost)], ['Weight', x.weight ? x.weight + ' lb' : ''],
            ['Damage', [dmg(x.damage), x.two_handed_damage ? `${dmg(x.two_handed_damage)} two-handed` : ''].filter(Boolean).join(', ')],
            ['Range', rng.long ? `${rng.normal}/${rng.long} ft.` : thr.long ? `${thr.normal}/${thr.long} ft. thrown` : ''],
            ['Armour class', ac && ac.base != null ? `${ac.base}${ac.dex_bonus ? ' + DEX' + (ac.max_bonus ? ` (max ${ac.max_bonus})` : '') : ''}` : ''], ['Strength', x.str_minimum ? x.str_minimum + '+' : ''],
            ['Stealth', x.stealth_disadvantage ? 'Disadvantage' : ''], ['Mastery', x.mastery ? nice(x.mastery) : ''], ['Speed', x.speed && x.speed.quantity ? `${x.speed.quantity} ${x.speed.unit}` : ''],
            ['Contents', (x.contents || []).map((c) => `${c.quantity > 1 ? c.quantity + ' ' : ''}${nice(c.item)}`).join(', ')],
            ['Uses', (x.utilize || []).map((u) => u.name + (u.dc ? ` (DC ${u.dc.dc_value})` : '')).join(', ')]])}
            <div class="badges">${props.map((p) => `<span class="badge">${esc(p)}</span>`).join('')}</div>${textHtml([...(x.desc || []), ...(x.description || []), ...(x.special || [])])}`;
    }
    // features per level: [{ level, features: [{ name, desc, choices }] }]
    const features = (levels) => (levels || []).flatMap((l) => (l.features || []).map((f) => `<h3>${esc(f.name)} <small class="muted">Level ${l.level}</small></h3>${textHtml(f.desc)}
        ${f.choices && (f.choices.options || []).length ? `<ul>${f.choices.options.map((o) => `<li><b>${esc(o.name)}.</b> ${esc((o.desc || []).join(' '))}</li>`).join('')}</ul>` : ''}`)).join('');
    function classHtml(e) {
        const c = e.d, lv = c.levels || [];
        // the table's columns: the class's own counters, then cantrips, spells known and each slot level that is ever above 0
        const cs = [...new Set(lv.flatMap((l) => Object.keys(l.class_specific || {})))];
        const sp = [...new Set(lv.flatMap((l) => Object.keys(l.spellcasting || {})))].filter((k) => lv.some((l) => l.spellcasting && +l.spellcasting[k]));
        const head = ['Level', 'Proficiency bonus', 'Features', ...cs.map(nice), ...sp.map((k) => k.replace(/^spell_slots_level_(\d)$/, (m, n) => ['1st', '2nd', '3rd'][n - 1] || n + 'th') .replace(/_/g, ' ').replace(/^./, (x) => x.toUpperCase()))];
        const cell = (v) => (v === undefined || v === null || v === 0 ? '–' : String(v));
        const table = `<div class="table-wrap"><table class="table cp-levels"><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${lv.map((l) => `<tr><td class="num">${l.level}</td><td class="num">+${l.prof_bonus}</td>
            <td>${esc((l.features || []).map((f) => f.name).join(', ') || '–')}</td>${cs.map((k) => `<td>${esc(cell((l.class_specific || {})[k]))}</td>`).join('')}${sp.map((k) => `<td class="num">${esc(cell((l.spellcasting || {})[k]))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
        const subs = [...(c.subclasses || []).map((s) => byKey.get(`subclass:${e.r}:${s}`)).filter(Boolean), ...entries.filter((x) => x.hb && x.t === 'subclass' && x.d.class === c.index)].sort(byName);
        const mc = c.multi_classing || {}, mcPre = prereq(mc.prerequisites) || ((mc.prerequisite_options || {}).from?.options || []).map((o) => `${ABIL[o.ability_score]} ${o.minimum_score}+`).join(' or ');
        const eq = [...(c.starting_equipment || []).map((x) => `${x.quantity > 1 ? x.quantity + ' ' : ''}${nice(x.equipment)}`), ...(c.starting_equipment_options || []).map((o) => o.desc)].filter(Boolean);
        return `${textHtml(c.desc)}
            ${kv([['Hit die', 'd' + c.hit_die], ['Saving throws', (c.saving_throws || []).map((s) => ABIL[s] || nice(s)).join(', ')], ['Proficiencies', (c.proficiencies || []).filter((p) => !/^saving-throw-/.test(p)).map(nice).join(', ')],
                ['Skills', (c.proficiency_choices || []).map((p) => p.desc).filter(Boolean).join('; ')], ['Spellcasting', c.spellcasting ? ABIL[c.spellcasting.spellcasting_ability] || '' : ''], ['Multiclassing', mcPre]])}
            ${eq.length ? `<h3>Starting equipment</h3><ul>${eq.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
            <h3>${esc(c.name)} table</h3>${table}
            ${subs.length ? `<h3>${esc(c.subclass_flavor || 'Subclasses')}</h3><ul class="cp-subs">${subs.map((s) => `<li>${openLink(key(s), s.name)}</li>`).join('')}</ul>` : ''}
            <h2 class="cp-h">Features</h2>${features(lv)}${build}`;
    }
    function subclassHtml(e) {
        const s = e.d, of = e.hb ? hbParent('class', s.class) : byKey.get(`class:${e.r}:${s.class}`);
        const spellName = (i) => (s.spellNames || {})[i] || (byKey.get(`spell:${e.r}:${i}`) || {}).name || nice(i);
        const sp = (s.spells || []).map((x) => [(x.prerequisites || []).map((p) => String(p).replace(/^.*-(\d+)$/, 'Level $1')).join(', '), spellName(x.spell)]);
        return `<p class="muted">${of ? openLink(key(of), of.name) : /^hb-/.test(s.class) ? "Its class isn't shared with you, or has been archived." : esc(nice(s.class))}${of || !/^hb-/.test(s.class) ? ' subclass' : ''}${s.subclass_flavor ? ' · ' + esc(s.subclass_flavor) : ''}</p>${textHtml(s.desc)}
            ${sp.length ? `<h3>Subclass spells</h3>${kv(sp)}` : ''}<h2 class="cp-h">Features</h2>${features(s.levels)}${build}`;
    }
    const bonuses = (b) => (b || []).map((x) => `${ABIL[x.ability_score] || nice(x.ability_score)} ${signed(x.bonus)}`).join(', ');
    const traits = (t) => (t || []).map((x) => `<h3>${esc(x.name)}</h3>${textHtml(x.desc)}`).join('');
    function raceHtml(e) {
        const x = e.d, subs = [...(x.subraces || []).map((s) => byKey.get(`subrace:${e.r}:${s}`)).filter(Boolean), ...entries.filter((y) => y.hb && y.t === 'subrace' && y.d.race === x.index)].sort(byName);
        return `${x.desc ? textHtml(x.desc) : ''}${kv([['Ability scores', bonuses(x.ability_bonuses)], ['Size', x.size], ['Speed', x.speed ? x.speed + ' ft.' : ''], ['Languages', x.language_desc || (x.languages || []).map(nice).join(', ')]])}
            ${x.size_description ? `<h3>Size</h3>${textHtml(x.size_description)}` : ''}${x.age ? `<h3>Age</h3>${textHtml(x.age)}` : ''}${x.alignment ? `<h3>Alignment</h3>${textHtml(x.alignment)}` : ''}
            ${traits(x.traits)}${subs.length ? `<h3>Subraces</h3><ul class="cp-subs">${subs.map((s) => `<li>${openLink(key(s), s.name)}</li>`).join('')}</ul>` : ''}${build}`;
    }
    function subraceHtml(e) {
        const x = e.d, of = e.hb ? hbParent('race', x.race) : byKey.get(`race:${e.r}:${x.race}`);
        return `<p class="muted">${of ? `${openLink(key(of), of.name)} subrace` : /^hb-/.test(x.race) ? "Its race isn't shared with you, or has been archived." : `${esc(nice(x.race))} subrace`}</p>${x.desc ? textHtml(x.desc) : ''}${kv([['Ability scores', bonuses(x.ability_bonuses)]])}${traits(x.traits)}${build}`;
    }
    // a background's d6 / d8 table of personality traits, ideals, bonds or flaws
    const rollTable = (title, o) => {
        const opts = ((o || {}).from || {}).options || [];
        if (!opts.length) return '';
        const die = 'd' + opts.length;
        return `<h3>${title}</h3><div class="table-wrap"><table class="table"><thead><tr><th class="num">${die}</th><th>${title.replace(/s$/, '')}</th></tr></thead><tbody>${opts.map((x, i) => `<tr><td class="num">${i + 1}</td><td>${esc(x.string || x.desc || '')}</td></tr>`).join('')}</tbody></table></div>`;
    };
    function backgroundHtml(e) {
        const x = e.d, ft = x.feature || {}, lang = x.language_options;
        return `${textHtml(x.desc)}${kv([['Proficiencies', (x.starting_proficiencies || []).map(nice).join(', ')], ['Languages', lang && lang.choose ? `${lang.choose} of your choice` : ''],
            ['Ability scores', (x.ability_scores || []).map((a) => ABIL[a] || nice(a)).join(', ')], ['Feat', x.feat || ''],
            ['Equipment', [...(x.starting_equipment || []).map((q) => `${q.quantity > 1 ? q.quantity + ' ' : ''}${nice(q.equipment)}`), ...(x.starting_equipment_options || []).map((o) => o.desc)].filter(Boolean).join('; ')]])}
            ${ft.name ? `<h3>Feature: ${esc(ft.name)}</h3>${textHtml(ft.desc)}` : ''}
            ${rollTable('Personality traits', x.personality_traits)}${rollTable('Ideals', x.ideals)}${rollTable('Bonds', x.bonds)}${rollTable('Flaws', x.flaws)}${build}`;
    }
    const featHtml = (e) => `${prereq(e.d.prerequisites) ? kv([['Prerequisite', prereq(e.d.prerequisites)]]) : ''}${textHtml(e.d.desc)}`;
    function ruleHtml(e) { return `<p class="muted">${esc(e.sub)}</p>${textHtml(e.text)}`; }
    const HTML = { spell: (e) => spellHtml(e.d), item: itemHtml, magic: itemHtml, class: classHtml, subclass: subclassHtml, race: raceHtml, subrace: subraceHtml, background: backgroundHtml, feat: featHtml, rule: ruleHtml };

    // only monsters, and content entries without their text, are fetched
    const hasText = (e) => e.t !== 'monster' && !(e.d && (e.t === 'spell' || e.t === 'magic') && !(e.d.desc || []).join('').trim());
    const fallback = (e) => (e.t === 'spell' ? `/sheets/player/spells.php?i=${encodeURIComponent(e.d.src === 'srd' ? e.d.index : 'wd:' + e.d.index)}` : `/compendium/items.php?i=magic:${encodeURIComponent(e.d.index)}`);
    const sourceLink = (e) => (e.t === 'monster' ? (e.src === 'srd' ? `https://www.dnd5eapi.co/api/2014/monsters/${e.id.slice(4)}` : `https://open5e.com/monsters/${e.src === 'srd-2024' ? 'srd-2024_' : ''}${e.id.slice(4)}`) : fallback(e));
    async function fetchText(e) {
        if (texts.has(key(e))) return texts.get(key(e));
        const r = await fetch(e.t === 'monster' ? `/sheets/monster/monsters.php?i=${encodeURIComponent(e.id)}` : fallback(e));
        if (!r.ok) throw new Error(r.status);
        const j = await r.json();
        texts.set(key(e), j);
        return j;
    }

    const STAR = (on) => `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M8 1.5l1.9 4.1 4.5.5-3.3 3.1.9 4.4L8 11.3 3.99 13.6l.9-4.4L1.6 6.1l4.5-.5z" fill="${on ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
    let qty = 1;
    // the Monster Sheet's encounters as this browser holds them, with the last one picked (compendium-enc follows the account)
    function encOptions() {
        let list = [];
        try { const l = JSON.parse(localStorage.getItem('monster-sheet'))?.encs; if (Array.isArray(l)) list = l.filter((x) => x && typeof x.id === 'string' && !x.archived).sort((a, b) => a.order - b.order); } catch (x) { }
        const last = store.get('compendium-enc', '');
        return [['', 'Unsorted'], ...list.map((x) => [x.id, String(x.name || '').trim() || 'Unnamed encounter'])].map(([v, t]) => `<option value="${esc(v)}"${v === last ? ' selected' : ''}>${esc(t)}</option>`).join('');
    }
    function actions(e) {
        if (e.t === 'monster') return `<div class="cp-add"><span class="cp-qty"><button type="button" class="btn small" data-qty="-1" aria-label="One fewer">&minus;</button><b id="cp-n">${qty}</b><button type="button" class="btn small" data-qty="1" aria-label="One more">+</button></span>
            ${ctx() && typeof ctx().enc === 'string' ? '' : `<label class="cp-enc">Encounter <select class="field" id="cp-enc">${encOptions()}</select></label>`}
            <button type="button" class="btn primary" data-add="enc">Add to encounter</button></div>`;
        return ['spell', 'item', 'magic', 'feat'].includes(e.t) ? '<div class="cp-add"><button type="button" class="btn primary" data-add="sheet">Add to sheet</button></div>' : '';
    }
    function head(e) {
        const on = isFav(e);
        return `<div class="cp-title"><h2>${esc(e.name)}</h2><span class="cp-tools">
            <button type="button" class="btn small" data-fav aria-pressed="${on}" aria-label="${on ? 'Remove from favourites' : 'Add to favourites'}" title="${on ? 'Remove from favourites' : 'Add to favourites'}">${STAR(on)}</button>
            <button type="button" class="btn small" data-link>Copy link</button></span></div>
            <div class="badges">${tagsOf(e).map(tag).join('')}</div>${e.book && e.t !== 'monster' ? `<p class="muted cp-book">Source: ${esc(e.book)}</p>` : ''}`;
    }
    let token = 0;
    async function openEntry(e) {
        if (!e) return;
        const mine = ++token;
        S.sel = key(e); qty = 1;
        const r = store.get('compendium-recent', []).filter((k) => typeof k === 'string' && canon(k) !== key(e));
        r.unshift(key(e));
        store.set('compendium-recent', r.slice(0, 10));
        for (const b of list.querySelectorAll('.cp-row')) { const on = b.dataset.k === S.sel; b.classList.toggle('on', on); if (on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); }
        detail.classList.add('open'); document.body.classList.add('cp-lock');
        persist();
        const top = head(e);
        const draw = (body) => { if (mine === token) { dbody.innerHTML = top + body + actions(e) + homebrewTools(e) + '<div id="cp-msg"></div>'; detail.scrollTop = 0; } };
        if (e.html !== undefined) return draw(e.html);
        if (hasText(e)) return draw(HTML[e.t](e));
        dbody.innerHTML = top + '<div class="cp-sk" aria-hidden="true"></div><div class="cp-sk" aria-hidden="true"></div><p class="muted">Loading ' + esc(e.name) + '...</p>';
        detail.focus({ preventScroll: true });
        try {
            const j = await fetchText(e);
            if (e.t === 'monster') draw(monsterHtml(e, j));
            else { Object.assign(e.d, { desc: j.desc || [], higher_level: e.d.higher_level?.length ? e.d.higher_level : j.higher_level || [] }); draw(HTML[e.t](e)); }
        } catch (err) {
            if (mine === token) dbody.innerHTML = top + `<p class="err">Couldn't load ${esc(e.name)}. Try again in a minute, or read it at <a href="${esc(sourceLink(e))}" target="_blank" rel="noopener">its source</a>. <button type="button" class="btn small" data-reopen>Try again</button></p>`;
        }
    }
    function closeDetail() { detail.classList.remove('open'); document.body.classList.remove('cp-lock'); }
    function openFromUrl() {
        if (!want) return;
        const e = byKey.get(want), [, wr, wid] = want.split(':');
        if (e) { want = ''; openEntry(e); return; }
        // a link to homebrew: your own archived entry opens read-only; anyone else's has been taken away
        if (wr === 'hb' && loaded.has('homebrew')) {
            const old = Homebrew.mine().find((x) => x.id === wid);
            want = '';
            if (old) return readArchived(old);
            dbody.innerHTML = '<p class="note">This isn\'t shared with you any more.</p>'; detail.classList.add('open'); document.body.classList.add('cp-lock');
            return;
        }
        // the entry's list hasn't come in yet (or failed): wait for the file that has it
        if (jobsOfKey(want).every((j) => loaded.has(j) || failed.has(j))) { want = ''; dbody.innerHTML = '<p class="note">That entry isn\'t in the compendium.</p>'; detail.classList.add('open'); document.body.classList.add('cp-lock'); }
    }

    $('#cp-back').addEventListener('click', () => { S.sel = null; closeDetail(); persist(); for (const b of list.querySelectorAll('.cp-row.on')) b.classList.remove('on'); });
    detail.addEventListener('click', (ev) => {
        const e = byKey.get(S.sel), b = ev.target.closest('button');
        if (!e || !b) return;
        if (b.dataset.open) openEntry(byKey.get(b.dataset.open));
        else if (b.dataset.fav !== undefined) {
            const all = store.get('compendium-favs', []).filter((k) => typeof k === 'string'), i = all.findIndex((k) => canon(k) === key(e));
            if (i >= 0) all.splice(i, 1); else all.push(key(e));
            store.set('compendium-favs', all);
            b.setAttribute('aria-pressed', i < 0); b.innerHTML = STAR(i < 0);
            b.setAttribute('aria-label', i < 0 ? 'Remove from favourites' : 'Add to favourites'); b.title = b.getAttribute('aria-label');
            if (S.tab === 'fav') refresh();
        } else if (b.dataset.link !== undefined) UI.copy(location.href, b);
        else if (b.dataset.qty) { qty = Math.max(1, qty + +b.dataset.qty); $('#cp-n').textContent = qty; }
        else if (b.dataset.add === 'sheet') addToSheet(e);
        else if (b.dataset.add === 'enc') addToEncounter(e);
        else if (b.dataset.reopen !== undefined) openEntry(e);
        else if (b.dataset.hbEdit !== undefined) { if (e.raw.kind === 'monster') fullPage('/sheets/monster/?hb=edit:' + encodeURIComponent(e.raw.id)); else openForm(e.raw.kind, e.raw); }
        else if (b.dataset.hbCopy !== undefined) {
            if (e.t === 'monster') fullPage('/sheets/monster/?hb=' + (e.hb ? 'copy:' + encodeURIComponent(e.raw.id) : 'key:' + encodeURIComponent(e.id)));
            else if (FORMS[e.hb ? e.raw.kind : e.t].wizard && !e.hb) officialCopy(e);
            else openForm(e.hb ? e.raw.kind : e.t, null, seedOf(e));
        }
        else if (b.dataset.unarchive) unarchive(b.dataset.unarchive);
        else if (b.dataset.hbArchive !== undefined) archive(e.raw);
        else if (b.dataset.hbRemove) removeFromCampaign(e, b.dataset.hbRemove, b.dataset.ref);
    });
    detail.addEventListener('change', (ev) => { const i = ev.target.closest('[data-hb-share],[data-hb-dmonly]'), e = byKey.get(S.sel); if (i && e) shareTo(e, i); });

    // ---- requests to the sheets (applied there, see sheet.js and monster.js) ----
    const uid = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const isObj = (o) => o && typeof o === 'object' && !Array.isArray(o);
    const lock = (n, fn) => (navigator.locks ? navigator.locks.request(n, fn) : fn());
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
        const type = e.t === 'spell' ? 'spells' : e.t === 'feat' ? 'list' : 'items', n = e.name.trim().toLowerCase();
        const onSheet = (Array.isArray(c.panels) ? c.panels : []).some((p) => p && p.type === type && (p.rows || []).some((r) => r && String(r.name || '').trim().toLowerCase() === n));
        let q = [];
        try { q = JSON.parse(localStorage.getItem('hb-pending')) || []; } catch (x) { }
        return onSheet || (Array.isArray(q) && q.some((x) => x && x.char === c.id && String(x.name).toLowerCase() === n));
    }
    // a content spell in the shape the sheet's fromSrd() reads. Save, spell attack, damage and healing come from the text, as spells.php does for
    // spells without them; a summoned creature's stat block at the end isn't the spell's.
    function spellDetails(s) {
        const stop = (s.desc || []).findIndex((p) => /^armor class/i.test(p)), t = (stop < 0 ? s.desc || [] : s.desc.slice(0, stop)).join(' ');
        const [, ct, trigger] = /^((?:1 )?(?:action|bonus action|reaction))(?:, (.*))?$/i.exec(s.casting_time || '') || [];
        const save = /(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) saving throw/i.exec(t), atk = /(melee|ranged) spell attack/i.exec(t), damage = [], seen = new Set();
        for (const [, dice, type] of t.matchAll(/(\d+d\d+(?:\s*\+\s*\d+)?)\s+(acid|bludgeoning|cold|fire|force|lightning|necrotic|piercing|poison|psychic|radiant|slashing|thunder)\s+damage/gi)) {
            const ty = type[0].toUpperCase() + type.slice(1).toLowerCase(), die = /^1d(\d+)$/.exec(dice);
            if (seen.has(ty)) continue;
            seen.add(ty);
            // cantrips take the usual 1dX..4dX steps, so the sheet scales them with character level
            damage.push(s.level || !die ? { type: ty, slot: { [s.level]: dice } } : { type: ty, char: { 1: dice, 5: `2d${die[1]}`, 11: `3d${die[1]}`, 17: `4d${die[1]}` } });
        }
        const heal = /regains? (?:a number of )?hit points equal to (\d+d\d+)/i.exec(t);
        return { name: s.name, level: s.level, school: s.school, range: s.range, duration: s.duration, casting_time: ct ? (/^1 /.test(ct) ? ct : '1 ' + ct).toLowerCase() : s.casting_time, trigger: trigger || '',
            components: s.components, material: s.material, concentration: s.concentration, ritual: s.ritual, desc: s.desc, higher_level: s.higher_level,
            save: save ? save[1].slice(0, 3).toUpperCase() : '', attack_type: atk ? atk[1].toLowerCase() : '', damage, heal_at_slot_level: heal ? { [s.level]: heal[1] } : null };
    }
    // an item's cost in gp, weight and attributes, in the order spells.php gives the sheet's own SRD items
    function itemDetails(e) {
        const x = e.d;
        if (e.t === 'magic') return { wt: 0, gp: '', att: x.attunement ? 'needs' : '', props: [x.type, x.rarity].filter(Boolean) };
        const cats = x.equipment_categories || [], has = (re) => cats.some((c) => re.test(c)), p = [];
        const label = (q) => (q && typeof q === 'object' ? q.name : String(q || '').replace(/(^|-)([a-z])/g, (m, a, b) => a + b.toUpperCase()));
        for (const v of [x.weapon_category || (has(/^martial/) ? 'Martial' : has(/^simple/) ? 'Simple' : ''), x.weapon_range || (has(/melee/) ? 'Melee' : has(/ranged/) ? 'Ranged' : ''), x.tool_category, x.vehicle_category, x.gear_category && nice(x.gear_category)]) if (v) p.push(v);
        for (const q of x.properties || []) p.push(label(q));
        const r = x.throw_range || (p.includes('Ranged') ? x.range : null);
        if (r && r.long) p.push(`Range (${r.normal}/${r.long})`);
        const arm = x.armor_category || (has(/^shields?$/) ? 'Shield' : (cats.find((c) => /^(light|medium|heavy)-armor$/.test(c)) || '').replace(/-armor$/, '').replace(/^./, (c) => c.toUpperCase()));
        if (arm) p.push(arm === 'Shield' ? 'Shield' : arm + ' armour');
        if (x.armor_class && x.armor_class.base != null) p.push(`AC ${arm === 'Shield' ? '+' : ''}${x.armor_class.base}${x.armor_class.dex_bonus ? ' + DEX' + (x.armor_class.max_bonus ? ` (max ${x.armor_class.max_bonus})` : '') : ''}`);
        if (x.str_minimum) p.push('Str ' + x.str_minimum);
        if (x.stealth_disadvantage) p.push('Stealth disadvantage');
        if (x.mastery) p.push(`Mastery (${nice(x.mastery)})`);
        const rate = { cp: 0.01, sp: 0.1, ep: 0.5, gp: 1, pp: 10 }[(x.cost || {}).unit] ?? 1;
        return { wt: x.weight || 0, gp: x.cost && x.cost.quantity != null ? Math.round(x.cost.quantity * rate * 100) / 100 : '', att: '', props: p };
    }
    function sheetRequest(c, e) {
        const base = { id: uid(), char: c.id, name: e.name };
        if (e.hb) return { ...base, kind: 'hb', parts: Homebrew.parts(e.raw, c) };
        if (e.t === 'spell') return { ...base, kind: 'spell', lvl: e.f.level, spell: spellDetails(e.d) };
        // a feat is a Passive abilities row (the sheet's ROW.list) with the feat's text
        if (e.t === 'feat') return { ...base, kind: 'feat', src: 'Feat', text: [prereq(e.d.prerequisites) && 'Prerequisite: ' + prereq(e.d.prerequisites), ...(e.d.desc || [])].filter(Boolean).join('\n\n') };
        const cat = e.t === 'magic' ? 'Magic items' : e.f.cat === 'Weapon' ? 'Weapons' : e.f.cat === 'Armor' ? 'Armour' : 'Gear';
        return { ...base, kind: 'item', cat, item: itemDetails(e), notes: [...(e.d.desc || []), ...(e.d.description || []), ...(e.d.special || [])].join('\n\n') };
    }
    const dlg = (id) => document.getElementById(id);
    document.addEventListener('click', (ev) => { if (ev.target.closest('[data-close]')) ev.target.closest('dialog').close(); });
    async function addToSheet(e) {
        const chars = await characters(), here = ctx() && ctx().char, mine = here && chars.find((c) => c.id === here);
        if (mine) return give(mine, e, true);
        const body = dlg('cp-pick-body');
        if (!chars.length) {
            body.innerHTML = '<p>You have no characters yet.</p><p><a class="btn" href="/characters/#create">Create a character</a></p>';
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
    async function give(c, e, beside) {
        const nm = c.name || 'Unnamed character';
        const go = async () => {
            try { await queue('hb-pending', sheetRequest(c, e)); } catch (x) { return note("Couldn't save the request: this browser's storage is full or blocked.", 'err'); }
            if (beside) return note(`${esc(e.name)} sent to ${esc(nm)}'s sheet.`);
            note(`${esc(e.name)} will be on ${esc(nm)}'s sheet. <a href="/characters/${encodeURIComponent(c.id)}">Open ${esc(nm)}</a>`);
        };
        if (!hasEntry(c, e)) return go();
        $('#cp-dup-text').textContent = `${nm} already has ${e.name}. Add another?`;
        dlg('cp-dup').showModal();
        $('#cp-dup-yes').onclick = () => { dlg('cp-dup').close(); go(); };
    }
    async function addToEncounter(e) {
        const pick = $('#cp-enc'), here = ctx() && typeof ctx().enc === 'string', enc = here ? ctx().enc : pick?.value || '';
        if (!here) store.set('compendium-enc', enc);
        try { await queue('mon-pending', { id: uid(), key: e.id, n: qty, name: e.name, enc }); } catch (x) { return note("Couldn't save the request: this browser's storage is full or blocked.", 'err'); }
        if (here) return note(`${esc(e.name)}${qty > 1 ? ' ×' + qty : ''} sent to the shown encounter.`);
        note(`${esc(e.name)}${qty > 1 ? ' ×' + qty : ''} will be in ${esc(pick?.selectedOptions[0]?.textContent || 'Unsorted')} on the Monster Sheet. <a href="/sheets/monster/">Open the Monster Sheet</a>`);
    }

    // ---- keyboard ----
    $('#cp-credits-btn').addEventListener('click', () => dlg('cp-credits').showModal());
    document.addEventListener('keydown', (ev) => {
        const tg = ev.target, typing = /^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName) || tg.isContentEditable;
        if (ev.key === '/' && !typing && !ev.ctrlKey && !ev.metaKey && !ev.altKey) { ev.preventDefault(); $('#cp-q').focus(); return; }
        if (EMBED && (ev.ctrlKey || ev.metaKey) && !ev.altKey && !ev.shiftKey && ev.key.toLowerCase() === 'k') { ev.preventDefault(); parent.cpPopup?.toggle(); return; }
        if (ev.key === 'Escape' && detail.classList.contains('open') && !document.querySelector('dialog[open]')) { $('#cp-back').click(); return; }
        if (ev.key === 'Escape' && EMBED && !document.querySelector('dialog[open]')) { parent.cpPopup?.close(); return; }
        if ((ev.key === 'ArrowDown' || ev.key === 'ArrowUp') && (tg === $('#cp-q') || list.contains(tg))) {
            const items = [...list.querySelectorAll('.cp-row, .cp-showall')], i = items.indexOf(tg);
            const n = ev.key === 'ArrowDown' ? (i < 0 ? 0 : i + 1) : i - 1;
            if (n < 0) { $('#cp-q').focus(); ev.preventDefault(); } else if (items[n]) { items[n].focus(); ev.preventDefault(); }
        }
    });

    // ---- homebrew (assets/js/homebrew.js): your own entries and your campaigns', keyed "<type>:hb:<id>", listed whatever rules version is picked ----
    // each kind: what the New button says, the form's fields, and how an entry becomes a row in the list
    const TEXT_HINT = 'A line starting with "- " becomes a list, and lines like "a | b" make a table.';
    const SCHOOLS = ['Abjuration', 'Conjuration', 'Divination', 'Enchantment', 'Evocation', 'Illusion', 'Necromancy', 'Transmutation'];
    const DMG_TYPES = ['Acid', 'Bludgeoning', 'Cold', 'Fire', 'Force', 'Lightning', 'Necrotic', 'Piercing', 'Poison', 'Psychic', 'Radiant', 'Slashing', 'Thunder'];
    const ABILS = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];
    const COINS = ['cp', 'sp', 'ep', 'gp', 'pp'];
    const SPELL_FX = [['buff', 'Buff'], ['debuff', 'Debuff'], ['control', 'Control'], ['teleport', 'Teleport / movement'], ['summon', 'Summon'], ['defence', 'Defence'], ['utility', 'Utility']];
    const WEAPON_PROPS = ['Ammunition', 'Finesse', 'Heavy', 'Light', 'Loading', 'Reach', 'Silvered', 'Thrown', 'Two-handed', 'Versatile'];
    const ITEM_CATS = [['Weapon', 'Weapon'], ['Armor', 'Armour'], ['Ammunition', 'Ammunition'], ['Tools', 'Tools'], ['Mounts and vehicles', 'Mounts and vehicles'], ['Adventuring gear', 'Gear'], ['Consumable', 'Consumable'], ['Treasure', 'Treasure']];
    const MAGIC_TYPES = ['Armor', 'Potion', 'Ring', 'Rod', 'Scroll', 'Staff', 'Wand', 'Weapon', 'Wondrous Item', 'Shield', 'Ammunition'];
    // the classes a spell can be ticked for: every class any listed spell has
    const spellClasses = () => [...new Set([...entries.filter((e) => e.t === 'spell' && !e.hb).flatMap((e) => e.f.cls), ...Homebrew.of(['class']).map((x) => x.name)])].sort();
    const itemFields = (magic) => {
        const w = (v) => (magic ? v.type === 'Weapon' : v.cat === 'Weapon'), a = (v) => (magic ? ['Armor', 'Shield'].includes(v.type) : v.cat === 'Armor');
        return [
            { k: 'name', label: 'Name', need: 'Give it a name.' },
            ...(magic ? [{ k: 'type', label: 'Type', opts: MAGIC_TYPES, other: true, dflt: 'Wondrous Item' }, { k: 'rarity', label: 'Rarity', opts: RARITY, dflt: 'Common' }, { k: 'att', label: 'Requires attunement', check: true },
                { k: 'attreq', label: 'Attunement by (optional)', hint: 'For example "by a wizard".', when: (v) => v.att }] : [{ k: 'cat', label: 'Category', opts: ITEM_CATS, dflt: 'Adventuring gear' }]),
            { k: 'cost', label: 'Cost (optional)', num: 0 }, { k: 'coin', label: 'Coin', opts: COINS, dflt: 'gp' }, { k: 'wt', label: 'Weight in lb (optional)', num: 0 },
            { head: 'Weapon', when: w }, { k: 'wcat', label: 'Kind', opts: ['Simple', 'Martial'], when: w }, { k: 'wrange', label: 'Melee or ranged', opts: ['Melee', 'Ranged'], when: w },
            { k: 'dice', label: 'Damage dice (optional)', dice: true, hint: 'For example 1d8. With dice here, adding it to a sheet also adds an action.', when: w }, { k: 'dtype', label: 'Damage type', opts: DMG_TYPES, dflt: 'Slashing', when: w },
            { k: 'dice2', label: 'Two-handed damage dice (optional)', dice: true, when: w }, { k: 'range', label: 'Range (optional)', hint: 'For example 80/320 ft. Melee weapons are 5 ft if left empty.', when: w },
            ...(magic ? [{ k: 'bonus', label: 'Bonus to attack and damage (optional)', num: 0, when: w }] : []),
            { k: 'props', label: 'Properties (optional)', checks: WEAPON_PROPS, when: w },
            { head: 'Armour', when: a }, { k: 'akind', label: 'Kind', opts: ['Light', 'Medium', 'Heavy', 'Shield'], when: a }, { k: 'ac', label: 'Armour class (optional)', num: 0, hint: "This is shown on the item. It never changes a character's armour class.", when: a },
            { k: 'dex', label: 'Adds DEX', check: true, when: a }, { k: 'dexmax', label: 'Most DEX it adds (optional)', num: 0, when: (v) => a(v) && v.dex }, { k: 'strmin', label: 'Minimum STR (optional)', num: 0, when: a },
            { k: 'stealth', label: 'Stealth disadvantage', check: true, when: a }, ...(magic ? [{ k: 'acbonus', label: 'Bonus to armour class (optional)', num: 0, when: a }] : []),
            { head: 'Description' }, { k: 'other', label: 'Attributes (optional)', hint: 'Separate them with commas.' }, { k: 'text', label: 'Description (optional)', area: 6, hint: TEXT_HINT },
        ];
    };
    const money = (x) => (x.cost === '' || x.cost == null ? '' : `${num(+x.cost)} ${x.coin || 'gp'}`);
    const itemBits = (x) => kv([['Cost', money(x)], ['Weight', +x.wt ? x.wt + ' lb' : ''], ['Kind', [x.wcat, x.wrange].filter(Boolean).join(' · ')], ['Damage', x.dice ? `${x.dice} ${String(x.dtype || '').toLowerCase()}` : ''], ['Two-handed', x.dice2 || ''], ['Range', x.range],
        ['Bonus', +x.bonus ? `+${+x.bonus} to attack and damage` : ''], ['Armour', x.akind], ['Armour class', x.ac === '' || x.ac == null ? '' : `${x.ac}${x.dex ? ' + DEX' + (x.dexmax ? ` (max ${x.dexmax})` : '') : ''}${+x.acbonus ? `, +${+x.acbonus}` : ''}`],
        ['Strength', x.strmin ? x.strmin + '+' : ''], ['Stealth', x.stealth ? 'Disadvantage' : '']])
        + `<div class="badges">${[...(x.props || []), ...String(x.other || '').split(',').map((s) => s.trim()).filter(Boolean)].map((p) => `<span class="badge">${esc(p)}</span>`).join('')}</div>${x.text ? textHtml(x.text) : ''}`;
    function rollsHtml(x) {
        const rows = [['Resolves with', x.mode === 'atk' ? 'Spell attack' : x.mode === 'save' ? `${x.save} save` : ''], ['Damage', (x.dmg || []).map((d) => `${d.dice} ${String(d.type).toLowerCase()}`).join(', ') + (x.grows ? ' (grows at levels 5, 11 and 17)' : '')],
            ['Healing', x.heal], ['Effects', (x.fx || []).map((k) => (SPELL_FX.find(([v]) => v === k) || [k, k])[1]).join(', ')]];
        return rows.some((r) => r[1]) ? `<h3>How it rolls</h3>${kv(rows)}` : '';
    }
    // a homebrew monster: the numbers were worked out when it was saved (the Compendium has no sheet to work them out with)
    function hbMonsterHtml(x) {
        const b = x.block || {}, list = (title, l) => ((l || []).length ? `<h3>${esc(title)}</h3>${l.map((a) => `<p><b>${esc(a.name)}.</b> ${esc(a.text)}</p>`).join('')}` : '');
        const acts = (t) => (b.actions || []).filter((a) => a.time === t);
        const other = (b.actions || []).filter((a) => !['Action', 'Bonus action', 'Reaction', 'Legendary'].includes(a.time));
        return `${/^data:image\//.test(x.sheet?.art || '') ? `<img class="cp-hbart" src="${esc(x.sheet.art)}" alt="">` : ''}<p class="muted">${esc([x.size, x.type].filter(Boolean).join(' '))}</p>
            ${kv([['Armour class', b.ac], ['Hit points', b.hp], ['Speed', b.speed]])}
            <div class="table-wrap"><table class="table cp-abil"><thead><tr>${(b.abilities || []).map((a) => `<th class="num">${esc(a.key)}</th>`).join('')}</tr></thead>
            <tbody><tr>${(b.abilities || []).map((a) => `<td class="num">${esc(a.score)} (${signed(Math.floor((a.score - 10) / 2))})</td>`).join('')}</tr></tbody></table></div>
            ${kv([['Saving throws', b.saves], ['Skills', b.skills], ['Vulnerabilities', b.vul], ['Resistances', b.res], ['Immunities', b.imm], ['Senses', b.senses], ['Languages', b.langs], ['Challenge', crText(+x.cr || 0)]])}
            ${list('Traits', b.traits)}${list('Actions', [...acts('Action'), ...other])}${list('Bonus actions', acts('Bonus action'))}${list('Reactions', acts('Reaction'))}${list('Legendary actions', acts('Legendary'))}
            ${(b.spells || []).length ? `<h3>Spells</h3><p>${esc(b.spells.join(', '))}</p>` : ''}${x.credit ? `<p class="muted cp-credit">${esc(x.credit)}</p>` : ''}`;
    }
    const FORMS = {
        spell: {
            noun: 'spell',
            fields: [{ k: 'name', label: 'Name', need: 'Give the spell a name.' },
                { k: 'level', label: 'Level', opts: [[0, 'Cantrip'], ...Array.from({ length: 9 }, (_, i) => [i + 1, 'Level ' + (i + 1)])], dflt: 1 },
                { k: 'school', label: 'School', opts: SCHOOLS, other: true, dflt: 'Evocation' },
                { k: 'time', label: 'Casting time', opts: ['Action', 'Bonus action', 'Reaction', '1 minute', '10 minutes', '1 hour'], other: true, dflt: 'Action' },
                { k: 'trig', label: 'Trigger (optional)', when: (v) => v.time === 'Reaction' },
                { k: 'range', label: 'Range (optional)', hint: 'For example 60 feet.' },
                { k: 'comps', label: 'Components (optional)', checks: ['V', 'S', 'M'] },
                { k: 'material', label: 'Material (optional)', when: (v) => (v.comps || []).includes('M') },
                { k: 'duration', label: 'Duration', dflt: 'Instantaneous' },
                { k: 'conc', label: 'Concentration', check: true }, { k: 'ritual', label: 'Ritual', check: true },
                { k: 'classes', label: 'Classes that can pick it (optional)', checks: spellClasses, hint: 'With none ticked, any spellcaster can pick it in the character builder.' },
                { k: 'text', label: 'Description', area: 8, need: 'Write what the spell does.', hint: TEXT_HINT },
                { k: 'higher', label: 'At higher levels (optional)', area: 3 },
                { head: 'How it rolls' },
                { k: 'mode', label: 'Resolves with', opts: [['none', 'None'], ['atk', 'Spell attack'], ['save', 'Save']], dflt: 'none' },
                { k: 'save', label: 'Saving throw', opts: ABILS, dflt: 'DEX', when: (v) => v.mode === 'save' },
                { k: 'dmg', label: 'Damage (optional)', rows: true, hint: "Dice can use the sheet's formulas: 2d6 + 3, PROF, LEVEL, CANTRIPd10." },
                { k: 'grows', label: 'Grows at levels 5, 11 and 17', check: true, when: (v) => String(v.level) === '0' },
                { k: 'heal', label: 'Healing dice (optional)', dice: true },
                { k: 'fx', label: 'Effects (optional)', checks: SPELL_FX }],
            entry: (x) => {
                const d = { name: x.name, level: +x.level || 0, school: x.school, casting_time: x.time, range: x.range, components: x.comps || [], material: x.material, duration: x.duration, concentration: !!x.conc, ritual: !!x.ritual, classes: x.classes || [], desc: [x.text], higher_level: x.higher ? [x.higher] : [] };
                return { t: 'spell', sub: [d.level ? 'Level ' + d.level : 'Cantrip', x.school, x.time].filter(Boolean).join(' · '), hay: x.school || '', f: { level: d.level, school: x.school, conc: d.concentration, ritual: d.ritual, cls: d.classes }, d, html: spellHtml(d) + rollsHtml(x) };
            },
        },
        item: {
            noun: 'item',
            fields: itemFields(false),
            entry: (x) => { const label = (ITEM_CATS.find(([v]) => v === x.cat) || [0, x.cat])[1]; return { t: 'item', sub: label, hay: label, f: { cat: x.cat }, d: {}, html: itemBits(x) }; },
        },
        magic: {
            noun: 'magic item',
            fields: itemFields(true),
            entry: (x) => ({ t: 'magic', sub: [x.type, x.rarity].filter(Boolean).join(' · '), hay: x.type || '', tags: x.rarity ? [[x.rarity]] : [], f: { cat: x.type, rarity: x.rarity }, d: {},
                html: `<div class="badges">${x.att ? `<span class="badge b">${esc('Requires attunement' + (x.attreq ? ' ' + x.attreq : ''))}</span>` : ''}</div>${itemBits(x)}` }),
        },
        feat: {
            noun: 'feat',
            fields: [{ k: 'name', label: 'Name', need: 'Give the feat a name.' }, { k: 'prereq', label: 'Prerequisite (optional)', hint: 'For example Strength 13+. It shows as a note and never blocks anyone.' },
                { k: 'text', label: 'Description', area: 8, need: 'Write what the feat does.', hint: TEXT_HINT },
                { k: 'uses', label: 'Uses (optional)', calc: true, hint: 'A number or a sheet formula, like PROF. It gives the row a counter on the sheet.' }, { k: 'reset', label: 'Uses come back on', opts: [['', 'No reset'], ['short', 'Short rest'], ['long', 'Long rest']], dflt: '', when: (v) => v.uses }],
            entry: (x) => ({ t: 'feat', sub: x.prereq ? 'Prerequisite: ' + x.prereq : 'No prerequisite', hay: '', f: {}, d: {}, html: `${kv([['Prerequisite', x.prereq], ['Uses', x.uses ? x.uses + (x.reset ? `, back on a ${x.reset} rest` : '') : '']])}${textHtml(x.text)}` }),
        },
        class: { noun: 'class', wizard: true, entry: (x) => { const d = HomebrewContent.toContent(x).e; return { t: 'class', sub: `Hit die d${d.hit_die}` + (d.spellcasting ? ` · Spellcaster (${ABIL[d.spellcasting.spellcasting_ability] || ''})` : ''), hay: 'class', f: { kind: 'Classes', cls: x.name }, d }; } },
        subclass: { noun: 'subclass', wizard: true, entry: (x) => { const d = HomebrewContent.toContent(x).e, of = (hbParent('class', d.class) || {}).name || 'Homebrew'; return { t: 'subclass', sub: `${of} subclass` + (d.subclass_flavor ? ' · ' + d.subclass_flavor : ''), hay: of, f: { kind: 'Subclasses', cls: of }, d }; } },
        race: { noun: 'race', wizard: true, entry: (x) => { const d = HomebrewContent.toContent(x).e; return { t: 'race', sub: [d.size, d.speed ? `Speed ${d.speed} ft.` : ''].filter(Boolean).join(' · '), hay: 'race', f: { kind: 'Races' }, d }; } },
        subrace: { noun: 'subrace', wizard: true, entry: (x) => { const d = HomebrewContent.toContent(x).e, of = (hbParent('race', d.race) || {}).name || 'Homebrew'; return { t: 'subrace', sub: `${of} subrace`, hay: of, f: { kind: 'Subraces' }, d }; } },
        background: { noun: 'background', wizard: true, entry: (x) => { const d = HomebrewContent.toContent(x).e; return { t: 'background', sub: skills(d.starting_proficiencies).join(', ') || 'Background', hay: '', f: {}, d }; } },
        // no form: a monster is made on the Monster Sheet and saved from there, so there's one stat block editor
        monster: {
            noun: 'monster',
            link: '/sheets/monster/?hb=new',
            entry: (x) => ({ t: 'monster', sub: `CR ${crText(+x.cr || 0)} · ${[x.size, x.type].filter(Boolean).join(' ')}`, hay: x.type || '', f: { cr: +x.cr || 0, size: x.size, mtype: x.type, src: 'Homebrew' }, html: hbMonsterHtml(x) }),
        },
        rule: {
            noun: 'rule',
            fields: [{ k: 'name', label: 'Name', need: 'Give the rule a name.' },
                { k: 'text', label: 'The rule', area: 8, need: 'Write the rule.', hint: 'A line starting with "- " becomes a list.' }],
            entry: (x) => ({ t: 'rule', sub: 'House rule', hay: 'house rule', text: x.text }),
        },
    };
    // an entry as the form's starting values, for "Copy to homebrew"
    function seedOf(e) {
        if (e.hb) { const { id, updated, acct, archived, by, camps, ...rest } = e.raw; return rest; }
        const d = e.d || {}, text = (...l) => l.flatMap((x) => x || []).join('\n\n'), first = (o) => Object.values(o || {})[0] || '';
        if (e.t === 'rule') return { name: e.name, text: Array.isArray(e.text) ? e.text.join('\n') : e.text };
        if (e.t === 'feat') return { name: e.name, prereq: prereq(d.prerequisites), text: text(d.desc) };
        if (e.t === 'spell') {
            const s = spellDetails(d);
            return { name: e.name, level: d.level, school: d.school, time: ({ '1 action': 'Action', '1 bonus action': 'Bonus action', '1 reaction': 'Reaction' })[s.casting_time] || s.casting_time, trig: s.trigger, range: d.range, comps: d.components || [], material: d.material || '', duration: d.duration,
                conc: !!d.concentration, ritual: !!d.ritual, classes: (d.classes || []).map(nice), text: text(d.desc), higher: text(d.higher_level), mode: s.save ? 'save' : s.attack_type ? 'atk' : 'none', save: s.save || 'DEX',
                dmg: s.damage.map((x) => ({ dice: first(x.slot || x.char), type: x.type })), grows: s.damage.some((x) => x.char), heal: first(s.heal_at_slot_level) };
        }
        if (e.t === 'magic') return { name: e.name, type: e.f.cat, rarity: e.f.rarity, att: !!d.attunement, attreq: typeof d.attunement === 'string' ? d.attunement.replace(/^requires attunement\s*/i, '') : '', text: text(d.desc) };
        const props = (d.properties || []).map(name), known = (p) => WEAPON_PROPS.find((w) => w.toLowerCase().replace('-', ' ') === p.toLowerCase().replace('-', ' ')), rng = d.range || d.throw_range || {}, ac = d.armor_class || {};
        return { name: e.name, cat: e.f.cat, cost: d.cost ? d.cost.quantity : '', coin: d.cost ? d.cost.unit : 'gp', wt: d.weight || '', wcat: /martial/i.test(d.weapon_category || (d.equipment_categories || []).join()) ? 'Martial' : 'Simple',
            wrange: /ranged/i.test(d.weapon_range || d.category_range || (d.equipment_categories || []).join()) ? 'Ranged' : 'Melee', dice: (d.damage || {}).damage_dice || '', dtype: d.damage ? name(d.damage.damage_type) : 'Slashing', dice2: (d.two_handed_damage || {}).damage_dice || '',
            range: rng.long ? `${rng.normal}/${rng.long} ft` : '', props: props.map(known).filter(Boolean), other: props.filter((p) => !known(p)).join(', '),
            akind: ({ light: 'Light', medium: 'Medium', heavy: 'Heavy', shield: 'Shield' })[String(d.armor_category || '').toLowerCase()] || 'Light', ac: ac.base ?? '', dex: !!ac.dex_bonus, dexmax: ac.max_bonus || '', strmin: d.str_minimum || '', stealth: !!d.stealth_disadvantage, text: text(d.desc, d.description, d.special) };
    }
    // homebrew's parent: another homebrew entry, or the official one (either rules version has the same index)
    const hbParent = (t, index) => entries.find((e) => e.t === t && (e.hb ? e.d.index === index : e.d && e.d.index === index));
    function hbEntry(x, shared) {
        let made = null;
        // a shared entry another browser made: anything odd in it costs that entry, not the page
        try { made = FORMS[x.kind] && FORMS[x.kind].entry(x); } catch (err) { }
        if (!made) return null;
        if (x.unfinished) made.tags = [['Unfinished', 'r']];
        return Object.assign({ id: 'hb:' + x.id, name: x.name, tags: [], f: {}, hb: true, raw: x, shared }, made, shared ? { sub: `${made.sub} · ${x.by}` } : {});
    }
    function showHomebrew() {
        for (let i = entries.length - 1; i >= 0; i--) if (entries[i].hb) { byKey.delete(key(entries[i])); entries.splice(i, 1); }
        // parents first: a subclass names its class
        const parentsFirst = (a, b) => (['class', 'race'].includes(b.kind) ? 1 : 0) - (['class', 'race'].includes(a.kind) ? 1 : 0);
        for (const [x, shared] of [...Homebrew.mine().filter((y) => !y.archived).map((y) => [y, false]), ...Homebrew.shared().map((y) => [y, true])].sort((a, b) => parentsFirst(a[0], b[0]))) { const e = hbEntry(x, shared); if (e) addEntry(e); }
        entries.sort(byName); drawTabs(); refresh();
    }
    const archivedOf = (kinds) => Homebrew.mine().filter((x) => x.archived && kinds.includes(x.kind));
    const SECOND = { class: 'subclass', race: 'subrace' };
    function drawHomebrewBar() {
        const form = FORMS[S.tab], kinds = form ? typesOf(S.tab) : [], old = archivedOf(kinds).length, two = SECOND[S.tab];
        $('#cp-new').hidden = !form;
        if (form) $('#cp-new').textContent = 'New ' + form.noun;
        $('#cp-new2').hidden = !two;
        if (two) $('#cp-new2').textContent = 'New ' + two;
        $('#cp-arch').hidden = !old;
        $('#cp-arch').textContent = `Archived (${old})`;
    }
    function homebrewTools(e) {
        if (e.hb && e.raw.unfinished) return `<div class="cp-hb"><p class="muted">Unfinished. Only you can see this. Finish it to share it or use it in the character builder.</p><div class="actions"><button type="button" class="btn primary" data-hb-edit>Carry on</button><button type="button" class="btn" data-hb-archive>Archive</button></div></div>`;
        const copy = FORMS[e.hb ? e.raw.kind : e.t] ? '<button type="button" class="btn" data-hb-copy>Copy to homebrew</button>' : '';
        if (!e.hb) return copy ? `<div class="cp-hb">${copy}</div>` : '';
        if (e.raw.archived) return `<div class="cp-hb"><p class="muted">Archived.</p><div class="actions"><button type="button" class="btn" data-unarchive="${esc(e.raw.id)}">Unarchive</button></div></div>`;
        if (e.shared) {
            const camps = e.raw.camps;
            return `<div class="cp-hb"><p class="muted">Shared by ${esc(e.raw.by)} in ${esc(camps.map((c) => c.name + (c.dmonly ? ' (DM only)' : '')).join(', '))}.</p>
                <div class="actions">${copy}</div>${camps.filter((c) => c.dm).map((c) => `<button type="button" class="btn small" data-hb-remove="${esc(c.id)}" data-ref="${esc(c.ref)}">Remove from ${esc(c.name)}</button>`).join(' ')}</div>`;
        }
        const on = Homebrew.sharedWith(e.raw.id), camps = Homebrew.camps(), monster = e.raw.kind === 'monster', dmOnly = Homebrew.dmOnlyIn(e.raw.id);
        const share = !Homebrew.signedIn() ? '<p class="muted">Sign in to save this to your account and share it with a campaign.</p>'
            : camps.length ? `<fieldset class="cp-hbshare"><legend>Share with</legend>${camps.map((c) => `<label class="check"><input type="checkbox" data-hb-share="${esc(c.id)}"${on.includes(c.id) ? ' checked' : ''}> ${esc(c.name)}</label>
                ${monster ? `<label class="check cp-hbdm"><input type="checkbox" data-hb-dmonly="${esc(c.id)}"${dmOnly.includes(c.id) ? ' checked' : ''}${on.includes(c.id) ? '' : ' disabled'}> DM only</label>` : ''}`).join('')}
                ${monster ? '<small class="muted">Everyone in the campaign can read this, unless you tick DM only: then only its DM and co-DMs can.</small>' : ''}</fieldset>` : '';
        return `<div class="cp-hb"><div class="actions"><button type="button" class="btn" data-hb-edit>Edit</button><button type="button" class="btn" data-hb-archive>Archive</button>${copy}</div>${share}</div>`;
    }
    const hbDlg = $('#cp-hb'), hbForm = $('#cp-hb-form');
    let editing = null, dirty = false;
    // a yes-or-no question over whatever is open: resolves true on yes
    function ask(text, yes, no = 'Cancel') {
        const d = dlg('cp-hbask');
        $('#cp-hbask-t').textContent = text; $('#cp-hbask-yes').textContent = yes; $('#cp-hbask-no').textContent = no;
        d.showModal();
        return new Promise((ok) => {
            const done = (v) => { $('#cp-hbask-yes').onclick = $('#cp-hbask-no').onclick = d.oncancel = null; d.close(); ok(v); };
            $('#cp-hbask-yes').onclick = () => done(true);
            $('#cp-hbask-no').onclick = () => done(false);
            d.oncancel = (e) => { e.preventDefault(); done(false); };
        });
    }
    const pairs = (o) => o.map((x) => (Array.isArray(x) ? x : [x, x]));
    const options = (o, cur) => pairs(o).map(([v, t]) => `<option value="${esc(v)}"${String(v) === String(cur) ? ' selected' : ''}>${esc(t)}</option>`).join('');
    const damageRow = (r = {}) => `<div class="cp-hbrow"><label>Dice<input class="field" data-dice value="${esc(r.dice || '')}" autocomplete="off"><small hidden></small></label>
        <label>Type<select class="field" data-type>${options(DMG_TYPES, r.type)}</select></label><button type="button" class="btn small" data-rowdel>Remove</button></div>`;
    const small = (f) => `<small${f.hint ? '' : ' hidden'}>${esc(f.hint || '')}</small>`;
    function fieldHtml(f, v) {
        if (f.head) return `<h3 class="cp-hbhead" data-fi>${esc(f.head)}</h3>`;
        if (f.check) return `<label class="check" data-fi><input type="checkbox" name="${f.k}"${v ? ' checked' : ''}> ${esc(f.label)}</label>`;
        if (f.checks) {
            const on = Array.isArray(v) ? v.map(String) : [], o = pairs(typeof f.checks === 'function' ? f.checks() : f.checks);
            // a class this list doesn't have stays ticked rather than being dropped
            for (const x of on) if (!o.some(([k]) => String(k) === x)) o.push([x, x]);
            return `<fieldset class="cp-hbchecks" data-fi><legend>${esc(f.label)}</legend>${o.map(([k, t]) => `<label class="check"><input type="checkbox" name="${f.k}" value="${esc(k)}"${on.includes(String(k)) ? ' checked' : ''}> ${esc(t)}</label>`).join('')}${small(f)}</fieldset>`;
        }
        if (f.rows) return `<div class="cp-hbrows" data-fi data-rows="${f.k}"><span>${esc(f.label)}</span><div data-list>${(Array.isArray(v) ? v : []).map(damageRow).join('')}</div><button type="button" class="btn small" data-rowadd>Add damage</button>${small(f)}</div>`;
        if (f.opts) {
            const known = pairs(f.opts).some(([k]) => String(k) === String(v)), isOther = f.other && v !== '' && v != null && !known;
            return `<label data-fi>${esc(f.label)}<select class="field" name="${f.k}">${options(f.opts, v)}${f.other ? `<option value="Other"${isOther ? ' selected' : ''}>Other</option>` : ''}</select>
                ${f.other ? `<input class="field cp-hbother" name="${f.k}__o" aria-label="${esc(f.label)}: other" value="${isOther ? esc(v) : ''}" autocomplete="off"${isOther ? '' : ' hidden'}>` : ''}${small(f)}</label>`;
        }
        if (f.area) return `<label data-fi>${esc(f.label)}<textarea class="field" name="${f.k}" rows="${f.area}">${esc(v ?? '')}</textarea>${small(f)}</label>`;
        if (f.num !== undefined) return `<label data-fi>${esc(f.label)}<input class="field" type="number" inputmode="decimal" step="any" min="${f.num}" name="${f.k}" value="${esc(v ?? '')}">${small(f)}</label>`;
        return `<label data-fi>${esc(f.label)}<input class="field" name="${f.k}" value="${esc(v ?? '')}" autocomplete="off">${small(f)}</label>`;
    }
    // what a field holds now
    function fieldValue(f) {
        const el = hbForm.elements[f.k];
        if (f.check) return el.checked;
        if (f.checks) return [...hbForm.querySelectorAll(`[name="${f.k}"]:checked`)].map((i) => i.value);
        if (f.rows) return [...hbForm.querySelectorAll(`[data-rows="${f.k}"] .cp-hbrow`)].map((r) => ({ dice: r.querySelector('[data-dice]').value.trim(), type: r.querySelector('[data-type]').value })).filter((r) => r.dice);
        if (f.other && el.value === 'Other') return hbForm.elements[f.k + '__o'].value.trim();
        if (f.num !== undefined) return el.value === '' ? '' : +el.value;
        return el.value.trim();
    }
    const formValues = (form) => { const v = {}; for (const f of form.fields) if (f.k) v[f.k] = fieldValue(f); return v; };
    // fields that only apply to some answers (a weapon's damage, a reaction's trigger)
    function showFields(form) {
        const v = formValues(form), boxes = $('#cp-hb-fields').querySelectorAll('[data-fi]');
        form.fields.forEach((f, i) => { boxes[i].hidden = !!f.when && !f.when(v); });
        for (const f of form.fields) if (f.other) hbForm.elements[f.k + '__o'].hidden = hbForm.elements[f.k].value !== 'Other';
    }
    // syntax only: names like LEVEL or a resource's name depend on the character the row lands on
    const ANY = new Proxy({}, { getOwnPropertyDescriptor: () => ({ value: 1, configurable: true, enumerable: true, writable: true }), get: () => 1 });
    const formulaError = (fn, v) => { try { fn(v, ANY); return ''; } catch (err) { return `Check this: ${err.message}.`; } };
    function nameNote(form) {
        const el = hbForm.elements.name, v = el.value.trim().toLowerCase(), s = el.parentElement.querySelector('small');
        const clash = v && entries.some((e) => e.t === editing.kind && e.name.trim().toLowerCase() === v && !(e.raw && editing.x && e.raw.id === editing.x.id));
        s.textContent = clash ? `There's already a ${form.noun} called this. You can still save it.` : '';
        s.hidden = !clash;
    }
    async function openForm(kind, x, seed) {
        if (EMBED) return fullPage();
        const form = FORMS[kind], from = x || seed || {};
        if (form.wizard) return openWizard(kind, x, seed);
        // the spell form ticks classes from the spell lists
        if (kind === 'spell') await Promise.all(jobsOf('spell').map(load));
        editing = { kind, x }; dirty = !!seed;
        $('#cp-hb-t').textContent = (x ? 'Edit ' : 'New ') + form.noun;
        $('#cp-hb-fields').innerHTML = form.fields.map((f) => fieldHtml(f, f.k && from[f.k] !== undefined ? from[f.k] : f.dflt)).join('')
            + (Homebrew.signedIn() ? '' : '<p class="muted">Saved in this browser. Sign in to keep it on your account.</p>');
        showFields(form);
        $('#cp-hb-err').hidden = true;
        hbDlg.showModal();
        if (seed) nameNote(form);
    }
    const closeForm = async () => { if (!dirty || await ask('Discard your changes?', 'Discard changes', 'Keep editing')) { dirty = false; hbDlg.close(); } };
    hbForm.addEventListener('input', () => { dirty = true; });
    hbForm.addEventListener('change', () => { dirty = true; if (editing) showFields(FORMS[editing.kind]); });
    hbForm.addEventListener('focusout', (ev) => { if (editing && ev.target.name === 'name') nameNote(FORMS[editing.kind]); });
    hbForm.addEventListener('click', (ev) => {
        if (ev.target.closest('[data-hb-cancel]')) return void closeForm();
        if (ev.target.closest('[data-rowdel]')) { ev.target.closest('.cp-hbrow').remove(); dirty = true; }
        else if (ev.target.closest('[data-rowadd]')) { const box = ev.target.closest('[data-rows]').querySelector('[data-list]'); box.insertAdjacentHTML('beforeend', damageRow()); box.lastElementChild.querySelector('input').focus(); dirty = true; }
    });
    hbDlg.addEventListener('cancel', (ev) => { ev.preventDefault(); closeForm(); });
    hbDlg.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && !dlg('cp-hbask').open) { ev.preventDefault(); closeForm(); } });
    // a field's message under it, or its hint back again
    function mark(el, hint, msg) {
        if (msg) el.setAttribute('aria-invalid', 'true'); else el.removeAttribute('aria-invalid');
        const s = el.parentElement.querySelector('small');
        if (s) { s.textContent = msg || hint || ''; s.hidden = !s.textContent; }
        return !!msg;
    }
    hbForm.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const form = FORMS[editing.kind], out = Object.assign({}, editing.x || { id: Homebrew.id(), kind: editing.kind }), vals = formValues(form);
        let bad = null;
        const check = (el, hint, msg) => { if (mark(el, hint, msg) && !bad) bad = el; };
        for (const f of form.fields) {
            if (!f.k) continue;
            if (f.when && !f.when(vals)) { delete out[f.k]; continue; }
            const v = fieldValue(f), el = hbForm.elements[f.k];
            if (f.rows) for (const i of hbForm.querySelectorAll(`[data-rows="${f.k}"] [data-dice]`)) check(i, '', i.value.trim() ? formulaError(hbDice, i.value) : '');
            else if (f.dice || f.calc) check(el, f.hint, v ? formulaError(f.dice ? hbDice : hbCalc, v) : '');
            else if (f.need) check(el, f.hint, v ? '' : f.need);
            else if (f.other && el.value === 'Other') check(hbForm.elements[f.k + '__o'], '', v ? '' : 'Say what it is.');
            // a number the browser couldn't read comes back empty and invalid
            else if (f.num !== undefined && el.validity.badInput) check(el, f.hint, 'Enter a number.');
            else if (f.num !== undefined && el.value !== '' && +el.value < f.num) check(el, f.hint, `Enter ${f.num} or more.`);
            out[f.k] = f.k === 'level' ? +v : v;
        }
        if (bad) return bad.focus();
        try { await Homebrew.save(out); } catch (x) {
            $('#cp-hb-err').className = 'err';
            $('#cp-hb-err').textContent = "Couldn't save it: this browser's storage is full or blocked.";
            $('#cp-hb-err').hidden = false;
            return;
        }
        dirty = false;
        hbDlg.close();
        if (Homebrew.full()) UI.toast('Saved to your account. This browser is full, so it only has a copy for this visit.', 'note');
        showHomebrew();
        openEntry(byKey.get(`${form.entry(out).t}:hb:${out.id}`));
    });
    $('#cp-new').addEventListener('click', () => { if (FORMS[S.tab].link) fullPage(FORMS[S.tab].link); else openForm(S.tab); });
    $('#cp-new2').addEventListener('click', () => openForm(SECOND[S.tab]));
    // ---- the guided form for classes, races and backgrounds (assets/js/homebrew-form.js, loaded the first time it's needed) ----
    let wizardLoad = null;
    const loadWizard = () => wizardLoad || (wizardLoad = new Promise((ok, no) => { const s = document.createElement('script'); s.src = $('#main').dataset.hbform; s.onload = ok; s.onerror = () => { wizardLoad = null; no(new Error('form')); }; document.head.appendChild(s); }));
    const officialOf = (t) => { const seen = new Map(); for (const e of entries) if (e.t === t && !e.hb && (!seen.has(e.d.index) || e.r === '2014')) seen.set(e.d.index, e); return [...seen.values()].sort(byName); };
    const spellsFor = (c) => { const n = String(c).toLowerCase(), seen = new Map(); for (const e of entries) if (e.t === 'spell' && !e.hb && e.f.cls.some((x) => x.toLowerCase() === n)) seen.set(e.d.index, { id: e.d.index, name: e.name, level: e.f.level }); return [...seen.values()]; };
    function officialSeed(kind, e) {
        const seed = { ...HomebrewContent.fromOfficial(kind, e.d), name: e.name };
        if (kind === 'class' && seed.caster !== 'none') seed.spells = spellsFor(e.name);
        return seed;
    }
    const wizardCtx = () => ({
        classes: () => [...officialOf('class').map((e) => [e.d.index, e.name]), ...Homebrew.of(['class']).map((x) => ['hb-' + x.id, x.name])],
        races: () => [...officialOf('race').map((e) => [e.d.index, e.name]), ...Homebrew.of(['race']).map((x) => ['hb-' + x.id, x.name])],
        officials: (kind) => officialOf(kind).map((e) => [e.d.index, e.name]),
        officialName: (kind, id) => (officialOf(kind).find((e) => e.d.index === id) || {}).name || '',
        seedOf: (kind, id) => { const { name: _, ...rest } = officialSeed(kind, officialOf(kind).find((e) => e.d.index === id)); return rest; },
        officialClassNamed: (n) => officialOf('class').some((e) => e.name.trim().toLowerCase() === n.trim().toLowerCase()),
        // the level a class picks its subclass, for the form's warning
        subLevelOf: (parent) => {
            if (!parent) return 0;
            if (/^hb-/.test(parent)) return +(Homebrew.all().find((x) => 'hb-' + x.id === parent) || {}).subLevel || 3;
            const lv = entries.filter((e) => e.t === 'subclass' && !e.hb && e.d.class === parent).flatMap((e) => (e.d.levels || []).filter((l) => l.features?.length).map((l) => l.level));
            return lv.length ? Math.min(...lv) : 3;
        },
        spells: () => [...spellChoices().values()].map((s) => ({ label: s.label })),
        spellNamed: (label) => { const s = spellChoices().get(String(label).trim().toLowerCase()); return s ? { id: s.id, name: s.name, level: s.level } : null; },
        classSpells: (id) => { const e = officialOf('class').find((x) => x.d.index === id); return e ? spellsFor(e.name) : []; },
        items: () => [...new Set([...entries.filter((e) => (e.t === 'item') && !e.hb).map((e) => e.name), ...Homebrew.of(['item', 'magic']).map((x) => x.name + Homebrew.SUFFIX)])].sort(),
        itemRef: (name) => {
            const n = String(name).trim(), hb = Homebrew.named(['item', 'magic'], n);
            if (hb) return 'hb-' + hb.id;
            const e = entries.find((x) => x.t === 'item' && !x.hb && x.name.toLowerCase() === n.toLowerCase());
            return e ? e.d.index : n.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        },
        feats: () => [...new Set(entries.filter((e) => e.t === 'feat').map((e) => e.name))].sort(),
        formulaError: (v) => (String(v ?? '').trim() ? formulaError(hbCalc, String(v)) : ''),
        preview: (x) => { const e = hbEntry(x, false); return e ? HTML[e.t](e).replace(build, '') : '<p class="muted">Give it a name to see it here.</p>'; },
        save: (x) => Homebrew.save(x),
        ask,
        done: (x) => {
            if (Homebrew.full()) UI.toast('Saved to your account. This browser is full, so it only has a copy for this visit.', 'note');
            showHomebrew();
            const e = byKey.get(`${FORMS[x.kind].entry(x).t}:hb:${x.id}`);
            if (e) openEntry(e);
        },
    });
    // "Name (level 3)" or "Name (homebrew)": each spell once, whichever rules version has it
    function spellChoices() {
        const out = new Map();
        for (const e of entries) if (e.t === 'spell' && !e.hb && !out.has(e.name.toLowerCase())) out.set(e.name.toLowerCase(), { id: e.d.index, name: e.name, level: e.f.level, label: e.name });
        for (const x of Homebrew.of(['spell'])) { const label = x.name + Homebrew.SUFFIX; out.set(label.toLowerCase(), { id: 'hb-' + x.id, name: x.name, level: +x.level || 0, label }); }
        return out;
    }
    async function openWizard(kind, x, seed) {
        try {
            await loadWizard();
            await Promise.all(RULES.flatMap((r) => ['classes', 'spells', 'items', 'origins'].map((f) => load(r + '-' + f))));
        } catch (err) { return UI.toast("Couldn't load the form. Check your connection and try again.", 'err'); }
        HbWizard.open(kind, x, seed, wizardCtx());
    }
    async function archive(x) {
        const camps = Homebrew.sharedWith(x.id).map((c) => (Homebrew.camps().find((k) => k.id === c) || {}).name).filter(Boolean);
        if (camps.length && !await ask(`Archive ${x.name}? It leaves ${camps.join(', ')}. Sheets keep their copy.`, 'Archive')) return;
        try { await Homebrew.setArchived(x.id, true); } catch (err) { return note("Couldn't archive it: this browser's storage is full or blocked.", 'err'); }
        S.sel = null; closeDetail(); dbody.innerHTML = '<p class="note">Archived. Sheets that already have it keep their copy.</p>';
        showHomebrew(); persist();
    }
    $('#cp-arch').addEventListener('click', () => {
        const kinds = Object.keys(FORMS).filter((k) => k === S.tab);
        $('#cp-hbarch-body').innerHTML = archivedOf(kinds).map((x) => `<div class="rowi"><span class="grow"><button type="button" class="cp-link" data-hb-read="${esc(x.id)}">${esc(x.name)}</button></span><button type="button" class="btn small" data-unarchive="${esc(x.id)}">Unarchive</button></div>`).join('');
        dlg('cp-hbarch').showModal();
    });
    // an archived entry opens read-only; it isn't in the lists, only reachable from here
    function readArchived(x) {
        const e = hbEntry(x, false);
        if (!e) return;
        byKey.set(key(e), e);
        openEntry(e);
    }
    async function unarchive(id) {
        try { await Homebrew.setArchived(id, false); } catch (err) { UI.toast("Couldn't unarchive it: this browser's storage is full or blocked.", 'err'); return false; }
        const open = S.sel && S.sel.endsWith(':hb:' + id);
        showHomebrew();
        if (open) openEntry(byKey.get(S.sel));
        return true;
    }
    $('#cp-hbarch-body').addEventListener('click', async (ev) => {
        const r = ev.target.closest('[data-hb-read]');
        if (r) { dlg('cp-hbarch').close(); return readArchived(Homebrew.mine().find((x) => x.id === r.dataset.hbRead)); }
        const b = ev.target.closest('[data-unarchive]');
        if (!b || !await unarchive(b.dataset.unarchive)) return;
        b.closest('.rowi').remove();
        if (!$('#cp-hbarch-body').children.length) dlg('cp-hbarch').close();
    });
    // Copy to homebrew from an official class, race or background: the lists it needs load first
    async function officialCopy(e) {
        if (EMBED) return fullPage();
        await Promise.all(RULES.map((r) => load(r + '-spells')));
        openForm(e.t, null, officialSeed(e.t, e));
    }
    // sharing a class or a race offers its subclasses or subraces too
    async function shareChildren(e, c) {
        const kids = Homebrew.mine().filter((x) => !x.archived && !x.unfinished && x.parent === 'hb-' + e.raw.id && !Homebrew.sharedWith(x.id).includes(c));
        if (!kids.length) return;
        const noun = e.raw.kind === 'class' ? (kids.length > 1 ? 'subclasses' : 'subclass') : kids.length > 1 ? 'subraces' : 'subrace';
        if (!await ask(`Also share its ${kids.length} ${noun}?`, 'Share them too', 'Not now')) return;
        for (const k of kids) await Homebrew.share(k.id, c, true).catch(() => { });
    }
    async function shareTo(e, box) {
        const c = box.dataset.hbShare || box.dataset.hbDmonly, dm = dbody.querySelector(`[data-hb-dmonly="${CSS.escape(c)}"]`), sh = dbody.querySelector(`[data-hb-share="${CSS.escape(c)}"]`);
        box.disabled = true;
        try { await Homebrew.share(e.raw.id, c, sh.checked, !!dm && dm.checked); } catch (x) {
            box.checked = !box.checked;
            note("Couldn't change that. Check your connection and try again.", 'err');
        }
        box.disabled = false;
        if (sh.checked && ['class', 'race'].includes(e.raw.kind)) shareChildren(e, c);
        if (dm) { if (!sh.checked) dm.checked = false; dm.disabled = !sh.checked; }
    }
    async function removeFromCampaign(e, c, ref) {
        const camp = (e.raw.camps || []).find((x) => x.ref === ref);
        if (!await ask(`Take ${e.name} out of ${camp ? camp.name : 'the campaign'}? Sheets keep their copy.`, 'Remove')) return;
        try { await Homebrew.removeFrom(c, ref); } catch (x) { return note("Couldn't remove it. Check your connection and try again.", 'err'); }
        showHomebrew();
        const still = byKey.get(key(e));
        if (still) openEntry(still); else { S.sel = null; closeDetail(); dbody.innerHTML = '<p class="note">Removed from the campaign.</p>'; persist(); }
    }

    drawTabs();
    refresh();
    Promise.all([getJson(CONTENT + 'aliases.json').catch(() => ({})), getJson('/sheets/monster/aliases.json').catch(() => ({}))]).then(([a, m]) => {
        ALIAS = a;
        for (const [k, v] of Object.entries(m)) ALIAS['monster:' + k] = 'monster:' + v;
        if (want) want = canon(want);
        ensure();
    });
});
