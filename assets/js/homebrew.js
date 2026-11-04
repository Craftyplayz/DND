// A player's homebrew (ROADMAP 4.6, 5.2): saved in this browser under "homebrew" and, signed in, per entry in the account through
// compendium/homebrew.php; the newest "updated" wins, as the sheets' cloud saves do. Signed out, everything works from the browser alone.
// Each entry is marked with its account ("acct") the first time it meets one, and only ever goes to that account, so two people on one
// browser can't upload each other's entries. Other people's entries (shared through a campaign) aren't this player's to keep: only a
// read-only copy for offline use, "homebrew-shared", replaced on every sync and never shown signed out.
// parts() turns an entry into the rows a sheet keeps as its own copy (the sheet, the Compendium's "Add to sheet" and the builder all use it).
window.Homebrew = (() => {
    'use strict';
    const KEY = 'homebrew', API = '/compendium/homebrew.php', ME = 'homebrew-me', SHARED = 'homebrew-shared';
    const signedIn = () => 'cloud' in (document.getElementById('main') || { dataset: {} }).dataset;
    // set when this browser can't hold the entries: signed in, they stay on the account and in memory for this page
    let mem = null, acct = '', once = null;
    const read = () => {
        if (mem) return mem;
        try { const d = JSON.parse(localStorage.getItem(KEY)); return d && typeof d === 'object' && !Array.isArray(d) ? d : {}; } catch (e) { return {}; }
    };
    // throws when the browser can't store it and there's no account to hold it, so a full browser never looks like a save
    const write = (db) => {
        try { localStorage.setItem(KEY, JSON.stringify(db)); mem = null; } catch (e) { if (!signedIn()) throw e; mem = db; }
    };
    const stored = (k) => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
    const me = () => (signedIn() ? acct || stored(ME) : '');
    const post = (path, body) => fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    let view = { shared: null, shares: {}, camps: [] };
    const sharedList = () => {
        if (!signedIn()) return [];
        if (view.shared) return view.shared;
        try { const c = JSON.parse(stored(SHARED)); return c && c.acct === me() && Array.isArray(c.list) ? c.list : []; } catch (e) { return []; }
    };
    const keepShared = () => { try { localStorage.setItem(SHARED, JSON.stringify({ acct, list: view.shared })); } catch (e) { } };
    const mine = () => Object.values(read()).filter((e) => e && (!e.acct || !me() || e.acct === me()));
    const all = () => [...mine().filter((e) => !e.archived), ...sharedList()].filter((e) => e && typeof e.name === 'string');

    // pull what's newer, push what's newer; a failed request leaves the browser's copy to go up next time
    async function sync() {
        if (!signedIn()) return;
        const r = await fetch(API);
        if (!r.ok) return;
        const j = await r.json(), db = read(), have = new Map(j.mine.map((e) => [e.id, e]));
        acct = j.acct;
        try { localStorage.setItem(ME, acct); } catch (e) { }
        view = { shared: j.shared, shares: j.shares, camps: j.camps };
        keepShared();
        for (const e of j.mine) if (!db[e.id] || db[e.id].updated < e.updated) db[e.id] = e;
        for (const e of Object.values(db)) if (!e.acct) e.acct = acct;
        write(db);
        await Promise.all(Object.values(db).filter((e) => e.acct === acct && (!have.has(e.id) || have.get(e.id).updated < e.updated)).map((e) => post('', e).catch(() => { })));
    }
    // true: it reached the account. Throws when it's kept nowhere.
    async function save(e) {
        const db = read(), prev = db[e.id];
        e.updated = Math.max(Date.now(), (prev ? prev.updated : 0) + 1);
        if (me()) e.acct = me();
        db[e.id] = e;
        write(db);
        if (!signedIn()) return false;
        let ok = false;
        try { ok = (await post('', e)).ok; } catch (x) { }
        if (!ok && mem) throw new Error('full');
        return ok;
    }
    async function setArchived(id, on) {
        const e = Object.assign({}, read()[id]);
        if (on) e.archived = Date.now(); else delete e.archived;
        return save(e);
    }
    // the entry goes up first: a campaign can only link what the account has
    async function share(id, c, on) {
        await post('', read()[id]);
        const r = await post('?act=share', { id, c, on });
        if (!r.ok) throw new Error(r.status);
        const list = (view.shares[id] || []).filter((x) => x !== c);
        view.shares[id] = on ? [...list, c] : list;
    }
    async function removeFrom(c, ref) {
        const r = await post('?act=remove', { c, ref });
        if (!r.ok) throw new Error(r.status);
        view.shared = sharedList().map((e) => ({ ...e, camps: e.camps.filter((x) => x.ref !== ref) })).filter((e) => e.camps.length);
        keepShared();
    }

    // ---- entries as sheet rows ----
    const str = (v) => (v === undefined || v === null ? '' : String(v));
    const arr = (v) => (Array.isArray(v) ? v : []);
    const cleanRows = (v) => arr(v).filter((d) => d && str(d.dice).trim()).map((d) => ({ dice: str(d.dice), type: str(d.type) }));
    const mod = (c, k) => Math.floor((+((c?.abilities || []).find((a) => a.key === k) || {}).score - 10) / 2) || 0;
    const armourLine = (x) => (x.ac === '' || x.ac == null ? '' : `AC ${x.akind === 'Shield' ? '+' : ''}${x.ac}${x.dex ? ' + DEX' + (x.dexmax ? ` (max ${x.dexmax})` : '') : ''}`);
    const isWeapon = (x) => (x.kind === 'magic' ? x.type === 'Weapon' : x.cat === 'Weapon');
    const isArmour = (x) => (x.kind === 'magic' ? ['Armor', 'Shield'].includes(x.type) : x.cat === 'Armor');
    const SHEET_CAT = { Weapon: 'Weapons', Armor: 'Armour', Consumable: 'Consumables', Treasure: 'Treasure' };
    const RATE = { cp: 0.01, sp: 0.1, ep: 0.5, gp: 1, pp: 10 };
    function itemProps(x) {
        const p = [];
        if (x.kind === 'magic') p.push(x.type, x.rarity);
        if (isWeapon(x)) p.push(x.wcat, x.wrange);
        p.push(...arr(x.props), ...str(x.other).split(',').map((s) => s.trim()));
        if (isArmour(x)) p.push(x.akind === 'Shield' ? 'Shield' : x.akind ? x.akind + ' armour' : '', armourLine(x), x.strmin ? 'Str ' + x.strmin : '', x.stealth ? 'Stealth disadvantage' : '', +x.acbonus ? `AC bonus +${+x.acbonus}` : '');
        return p.filter(Boolean).map(str);
    }
    // the Actions row of a weapon: STR or DEX by its properties and the character's scores, PROF if the character has the proficiency
    function attackRow(x, c) {
        const props = arr(x.props).map(str), fin = props.includes('Finesse'), ranged = x.wrange === 'Ranged';
        const ab = fin ? (mod(c, 'DEX') > mod(c, 'STR') ? 'DEX' : 'STR') : ranged ? 'DEX' : 'STR';
        const pro = !c?.profs || !x.wcat || arr(c.profs.weapons).some((p) => p === x.wcat + ' weapons' || str(p).toLowerCase() === (str(x.name) + 's').toLowerCase());
        const bonus = +x.bonus ? ` + ${+x.bonus} [Magic]` : '';
        return { name: str(x.name), time: 'Action', range: str(x.range) || (ranged ? '' : '5 ft'), props, mode: 'hit', hit: ab + (pro ? ' + PROF' : '') + bonus,
            dmg: [{ dice: `${str(x.dice)} + ${ab}${bonus}`, type: str(x.dtype) }], desc: [x.dice2 ? `Two-handed: ${str(x.dice2)} ${str(x.dtype).toLowerCase()}.` : '', str(x.text)].filter(Boolean).join('\n\n') };
    }
    // a row's definition in a form that doesn't care about key order, or a number typed as a string
    const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : str(v));
    const hash = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) >>> 0; return h.toString(36); };
    const sum = (row) => hash(JSON.stringify(canon(row)));
    // [{panel, row, hbsrc}]: the definition of the entry, for a character c. A row's play state (prepared, quantity, equipped, uses spent) isn't in here.
    function parts(x, c) {
        let out = [];
        if (x.kind === 'spell') {
            const grow = (d) => (x.grows ? d.replace(/^1d(\d+)/, 'CANTRIPd$1') : d);
            out = [{ panel: 'spells', row: { name: str(x.name), lvl: +x.level || 0, school: str(x.school), time: str(x.time) || 'Action', trig: str(x.trig), range: str(x.range),
                comp: arr(x.comps).map(str).join(', ') + (x.material ? ` (${str(x.material)})` : ''), dur: str(x.duration), conc: !!x.conc, ritual: !!x.ritual,
                mode: ['atk', 'save'].includes(x.mode) ? x.mode : 'none', save: str(x.save) || 'DEX', dmg: cleanRows(x.dmg).map((d) => ({ dice: grow(d.dice), type: d.type })),
                fx: [...(x.heal ? [{ k: 'heal', dice: str(x.heal), type: '', text: '' }] : []), ...arr(x.fx).map((k) => ({ k: str(k), dice: '', type: '', text: '' }))],
                desc: str(x.text), higher: str(x.higher), srd: '', mech: 1 } }];
        } else if (x.kind === 'item' || x.kind === 'magic') {
            const att = x.kind === 'magic' && x.att ? 'needs' : '';
            out = [{ panel: 'items', row: { name: str(x.name), cat: x.kind === 'magic' ? 'Magic items' : SHEET_CAT[x.cat] || 'Gear', att, wt: +x.wt || 0,
                gp: x.cost === '' || x.cost == null ? '' : Math.round(+x.cost * (RATE[x.coin] ?? 1) * 100) / 100, props: itemProps(x),
                notes: [att && x.attreq ? `Requires attunement ${str(x.attreq)}.` : '', str(x.text)].filter(Boolean).join('\n\n') } }];
            if (isWeapon(x) && str(x.dice).trim()) out.push({ panel: 'attacks', row: attackRow(x, c) });
        } else if (x.kind === 'feat') {
            out = [{ panel: 'list', row: { name: str(x.name), src: 'Feat', text: [x.prereq ? `Prerequisite: ${str(x.prereq)}` : '', str(x.text)].filter(Boolean).join('\n\n'), uses: str(x.uses), reset: str(x.reset), grp: 'other' } }];
        }
        for (const p of out) p.hbsrc = { id: x.id, by: str(x.by), at: +x.updated || 0, sum: sum(p.row) };
        return out;
    }
    // the row's definition fields; "Attuned" is play state, so it counts as "Needs attunement"
    const KEYS = { spells: ['name', 'lvl', 'school', 'time', 'trig', 'range', 'comp', 'dur', 'conc', 'ritual', 'mode', 'save', 'dmg', 'fx', 'desc', 'higher', 'srd', 'mech'], items: ['name', 'cat', 'att', 'wt', 'gp', 'props', 'notes'],
        attacks: ['name', 'time', 'range', 'props', 'mode', 'hit', 'dmg', 'desc'], list: ['name', 'src', 'text', 'uses', 'reset', 'grp'] };
    const defOf = (row, keys) => Object.fromEntries(keys.map((k) => [k, k === 'att' && row[k] === 'yes' ? 'needs' : row[k]]));
    const keysOf = (row) => ('lvl' in row ? KEYS.spells : 'qty' in row ? KEYS.items : 'text' in row ? KEYS.list : KEYS.attacks);
    // has the player changed this row since it came from the entry?
    const edited = (row) => !!row.hbsrc && row.hbsrc.sum !== sum(defOf(row, keysOf(row)));
    const LABEL = { name: 'Name', lvl: 'Level', school: 'School', time: 'Timing', trig: 'Trigger', range: 'Range', comp: 'Components', dur: 'Duration', conc: 'Concentration', ritual: 'Ritual', mode: 'Resolves with', save: 'Save',
        dmg: 'Damage', fx: 'Effects', desc: 'Description', higher: 'At higher levels', cat: 'Category', att: 'Attunement', wt: 'Weight', gp: 'Cost', props: 'Attributes', notes: 'Notes', hit: 'To hit', src: 'Source', text: 'Text', uses: 'Uses', reset: 'Resets on', grp: 'Tab' };
    const plain = (v) => (Array.isArray(v) ? v.map((d) => (d && typeof d === 'object' ? [d.dice, d.type || d.k].filter(Boolean).join(' ') : str(d))).join(', ') : v === true ? 'Yes' : v === false ? 'No' : str(v));
    // what an update would change: [[label, old, new]]
    const changes = (row, part) => Object.keys(part.row).filter((k) => LABEL[k] && JSON.stringify(canon(defOf(row, [k])[k])) !== JSON.stringify(canon(part.row[k]))).map((k) => [LABEL[k], plain(row[k]), plain(part.row[k])]);
    // the definition changes, play state stays; an attuned item stays attuned
    const apply = (row, part) => { const att = row.att; Object.assign(row, JSON.parse(JSON.stringify(part.row))); if (att === 'yes' && part.row.att === 'needs') row.att = 'yes'; row.hbsrc = { ...part.hbsrc }; return row; };

    const SUFFIX = ' (homebrew)';
    const of = (kinds) => all().filter((e) => kinds.includes(e.kind));
    // what the player typed or picked: "Zap (homebrew)", or plain "Zap" when plainToo
    const named = (kinds, typed, plainToo) => {
        const t = str(typed).trim().toLowerCase(), tag = t.endsWith(SUFFIX) ? t.slice(0, -SUFFIX.length) : plainToo ? t : null;
        return tag === null ? null : of(kinds).find((e) => e.name.trim().toLowerCase() === tag) || null;
    };
    // homebrew in the builder's data, in the content files' shape; kept is what this character already picked, which wins over the source
    function addTo(d, rules, kept) {
        const put = (x) => {
            if (x.kind === 'spell') d.spells['hb-' + x.id] = { index: 'hb-' + x.id, name: x.name, level: +x.level || 0, school: str(x.school), casting_time: str(x.time), range: str(x.range), components: arr(x.comps), duration: str(x.duration),
                concentration: !!x.conc, ritual: !!x.ritual, classes: arr(x.classes), desc: [str(x.text)], higher_level: x.higher ? [str(x.higher)] : [], rules, hbx: x };
            if (x.kind === 'feat') d.feats['hb-' + x.id] = { index: 'hb-' + x.id, name: x.name, desc: [str(x.text)], prerequisites: x.prereq ? [str(x.prereq)] : [], rules, hbx: x };
        };
        all().forEach(put);
        Object.values(kept || {}).forEach(put);
        d.hbParts = parts;
        d.hbItem = (name) => Object.values(kept || {}).find((x) => ['item', 'magic'].includes(x.kind) && x.name.trim().toLowerCase() + SUFFIX === str(name).trim().toLowerCase()) || named(['item', 'magic'], name);
    }

    return {
        signedIn, sync, save, setArchived, share, removeFrom, mine, all, of, named, parts, edited, changes, apply, addTo, SUFFIX,
        id: () => 'h' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
        shared: sharedList,
        camps: () => view.camps,
        sharedWith: (id) => view.shares[id] || [],
        full: () => !!mem,
        // a sync at most once per page, for the pages that only read homebrew
        ready: () => once || (once = sync().catch(() => { })),
        find: (id) => all().find((e) => e.id === id) || null,
    };
})();
