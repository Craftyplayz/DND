// DM edits on a player's sheet (ROADMAP 1.5): the DM's changes travel as small field-level edits, never whole characters.
// includes/dmedits.php is the same rules in PHP (checks, the queue, and the server's copy of apply); dm-edits.test.js keeps
// the two in step. An edit: {id, at, t (its words, from the DM's sheet), op, path?, ...}
//   set   {path, value, was}   refused as a conflict when the field no longer equals was (the player's value stays)
//   add   {path, amt}          an amount (HP, coins, quantity, used slots and resources, hit dice, exhaustion, death saves): never conflicts
//   hp    {how: dmg|heal|temp, amt}   the sheet's rules: temp HP soaks damage first, healing stops at max, temp HP doesn't stack
//   tag   {path, value, on}    adds or removes one entry of a list of words (conditions, languages, proficiencies, properties)
//   row   {path, row}          adds a row (from the sheet's own ROW maker) at the end of the list at path
//   unrow {path}               removes the row at path; a note is archived instead
//   roll  {roll}               a roll the DM made as the character, into its roll log
// A path is a list of steps: a key, "#<id>[:label]" (a row by id), "@<name>" (a skill by name, an ability by key) or
// "<n>[:name]" (any other list by position, refused when that entry's name changed).
//   hbDm.apply(c, e, {hpMax, make}) -> {ok, inv} | {ok: false, why, conflict}; inv: the edits that undo it
//   hbDm.run(c, e, ctx)    apply once per id (c.dmApplied), not on an archived character, with a "DM: ..." line in the roll log
//   hbDm.diff(before, after) -> the edits that turn one into the other (the DM's sheet)
//   hbDm.words(e, before, after, hbChanges) -> what the edit says ("−7 HP", "+50 gp", "Strength score 14 → 16")
//   hbDm.where(c, path) -> the sheet's own index path ("panels.3.rows.0.qty"), or null
// In the browser also: hbDm.send(campaign, char, edits) (queued in "dm-outbox" until the site has them), hbDm.waiting(char),
// hbDm.onChange(fn) ({paused} when the site can't be reached).
(() => {
    'use strict';
    const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
    const nm = (x) => parseFloat(x) || 0;
    const clone = (x) => JSON.parse(JSON.stringify(x));
    const kind = (v) => (typeof v === 'boolean' ? 'b' : typeof v === 'number' || typeof v === 'string' ? 'v' : Array.isArray(v) ? 'l' : isObj(v) ? 'o' : 'x');
    const same = (a, b) => (kind(a) === 'l' || kind(a) === 'o' || kind(b) === 'l' || kind(b) === 'o' ? JSON.stringify(a) === JSON.stringify(b) : String(a ?? '') === String(b ?? ''));
    const show = (v) => (v === '' || v == null ? 'blank' : typeof v === 'boolean' ? (v ? 'on' : 'off') : String(v));
    const KEEP = 500; // applied edit ids a character remembers

    // what the DM never changes: the roll log (except rolls), view settings, panel layout, portrait, archive, save stamps
    const NO_TOP = new Set(['id', 'updated', 'archived', 'art', 'artUrl', 'rolls', 'view', 'calc', 'dmApplied', 'miscCat', 'hbPanel', 'hb2', 'passSplit', 'hoPanel', 'draft', 'build', 'campRules']); // draft, build: the builder's own (4.2); campRules: a copy of the campaign's (4.4)
    const NO_PANEL = new Set(['id', 'type', 'title', 'on', 'sub', 'open', 'sort', 'split']);
    const NO_ANY = new Set(['id', 'updated', 'created', 'open', 'sub']);
    const AMOUNT = /^(hp\.(cur|temp)|exhaustion|spellPts\.used|classes\.N\.hdUsed|panels\.#\.(coins\.(cp|sp|ep|gp|pp)|ok|bad|sp\.(used|cur|extra)|slots\.N\.(used|extra)|rows\.#\.(qty|used|cur|extra)|rows\.#\.levels\.N\.(used|extra)))$/;
    const TAGS = /^(conditions|profs\.(armour|weapons|langs)|panels\.#\.tabs|panels\.#\.rows\.#\.props)$/;
    const FIXED = /^(panels\.#\.(slots|flex)|spellPts\.(pts|cost))$/; // lists whose entries are edited but never added or removed
    const pat = (path) => path.map((s) => (s[0] === '#' ? '#' : s[0] === '@' ? '@' : /^\d/.test(s) ? 'N' : s)).join('.');
    const allowed = (path) => Array.isArray(path) && path.length > 0 && path.every((s) => typeof s === 'string' && s !== '') && !NO_TOP.has(path[0])
        && !path.some((s) => NO_ANY.has(s)) && !(path[0] === 'panels' && (path.length < 3 || NO_PANEL.has(path[2])));

    // a list entry's name, for the check on lists without ids and for messages
    const nameOf = (o) => (isObj(o) ? String(o.name ?? o.title ?? o.label ?? o.type ?? o.key ?? '') : '');
    const label = (s) => (s[0] === '@' ? s.slice(1) : s.includes(':') ? s.slice(s.indexOf(':') + 1) : '');
    // the step naming entry i of list (whose own key is k)
    function step(list, i, k) {
        const o = list[i];
        if (isObj(o) && typeof o.id === 'string' && o.id) return '#' + o.id + ':' + nameOf(o);
        if (k === 'skills' && isObj(o)) return '@' + o.name;
        if (k === 'abilities' && isObj(o)) return '@' + o.key;
        return i + (isObj(o) ? ':' + nameOf(o) : '');
    }
    function find(list, s) {
        if (s[0] === '#') { const id = s.slice(1).split(':')[0]; return list.findIndex((o) => isObj(o) && o.id === id); }
        if (s[0] === '@') { const n = s.slice(1); return list.findIndex((o) => isObj(o) && ('key' in o ? o.key : o.name) === n); }
        const c = s.indexOf(':'), n = c < 0 ? s : s.slice(0, c), i = +n;
        if (!/^\d+$/.test(n) || i >= list.length) return -1;
        return c >= 0 && nameOf(list[i]) !== s.slice(c + 1) ? -1 : i;
    }
    // the container and key the path ends at, or {why}; a missing amount ("extra" boxes) counts as 0
    function walk(c, path) {
        let o = c;
        for (let j = 0; j < path.length; j++) {
            const s = path[j];
            let k;
            if (Array.isArray(o)) { k = find(o, s); if (k < 0) return { why: `${label(s) || 'That'} was removed` }; }
            else if (isObj(o) && (Object.prototype.hasOwnProperty.call(o, s) || (j === path.length - 1 && AMOUNT.test(pat(path))))) k = s;
            else return { why: 'That part of the sheet is gone' };
            if (j === path.length - 1) return { o, k };
            o = o[k];
        }
        return { why: 'That part of the sheet is gone' };
    }
    function where(c, path) {
        if (!allowed(path)) return null;
        const out = [];
        let o = c;
        for (const s of path) {
            const k = Array.isArray(o) ? find(o, s) : isObj(o) && s in o ? s : -1;
            if (k === -1) return null;
            out.push(k); o = o[k];
        }
        return out.join('.');
    }
    // a row the DM added, cut to the shape the sheet makes (its own ROW maker, from ctx.make)
    function fit(t, row) {
        const out = {};
        for (const k in t) out[k] = k in row && kind(row[k]) === kind(t[k]) ? clone(row[k]) : t[k];
        if (typeof row.id === 'string' && row.id) out.id = row.id;
        return out;
    }

    function apply(c, e, ctx = {}) {
        const no = (why, conflict = false) => ({ ok: false, why, conflict });
        const max = nm(ctx.hpMax);
        if (!isObj(e)) return no("That isn't a DM edit");
        if (e.op === 'roll') {
            if (!isObj(e.roll)) return no("That isn't a roll");
            if (!Array.isArray(c.rolls)) c.rolls = [];
            c.rolls.unshift(clone(e.roll));
            c.rolls.length = Math.min(c.rolls.length, 100);
            return { ok: true, inv: [] };
        }
        if (e.op === 'hp') {
            if (!isObj(c.hp)) return no('This character has no hit points');
            const amt = Math.abs(nm(e.amt)), cur = nm(c.hp.cur), temp = nm(c.hp.temp);
            if (e.how === 'dmg') { const soak = Math.min(temp, amt); c.hp.temp = temp - soak; c.hp.cur = Math.max(0, cur - (amt - soak)); }
            else if (e.how === 'temp') c.hp.temp = Math.max(temp, amt);
            else if (e.how === 'heal') c.hp.cur = max > 0 ? Math.min(max, cur + amt) : cur + amt;
            else return no("That isn't a change to hit points");
            return { ok: true, inv: [['cur', cur], ['temp', temp]].filter(([k, was]) => nm(c.hp[k]) !== was).map(([k, was]) => ({ op: 'add', path: ['hp', k], amt: was - nm(c.hp[k]) })) };
        }
        if (!allowed(e.path)) return no("The DM can't change that");
        const p = pat(e.path), w = walk(c, e.path);
        if (w.why) return no(w.why);
        const { o, k } = w, cur = o[k];
        if (e.op === 'row') {
            if (!Array.isArray(cur) || TAGS.test(p) || FIXED.test(p) || !isObj(e.row)) return no("That isn't a row");
            const t = ctx.make && ctx.make(c, e.path);
            cur.push(t ? fit(t, e.row) : clone(e.row));
            return { ok: true, inv: [{ op: 'unrow', path: [...e.path, step(cur, cur.length - 1, e.path[e.path.length - 1])] }] };
        }
        if (e.op === 'unrow') {
            if (!Array.isArray(o) || !isObj(cur) || FIXED.test(pat(e.path.slice(0, -1)))) return no("That isn't a row");
            if ('body' in cur && 'pinned' in cur) { // notes are archived, never deleted
                if (cur.archived) return { ok: true, inv: [] };
                cur.archived = +e.at || Date.now();
                return { ok: true, inv: [{ op: 'set', path: [...e.path, 'archived'], value: 0, was: cur.archived }] };
            }
            o.splice(k, 1);
            return { ok: true, inv: [{ op: 'row', path: e.path.slice(0, -1), row: cur }] };
        }
        if (e.op === 'tag') {
            if (!Array.isArray(cur) || !cur.every((x) => typeof x === 'string') || typeof e.value !== 'string') return no("That isn't a list of words");
            const i = cur.indexOf(e.value);
            if (e.on && i < 0) cur.push(e.value);
            else if (!e.on && i >= 0) cur.splice(i, 1);
            else return { ok: true, inv: [] };
            return { ok: true, inv: [{ op: 'tag', path: e.path, value: e.value, on: !e.on }] };
        }
        if (e.op === 'add') {
            if (!AMOUNT.test(p) || (cur !== undefined && kind(cur) !== 'v') || !Number.isFinite(+e.amt)) return no("That isn't an amount");
            let v = Math.max(0, nm(cur) + +e.amt);
            if (p === 'hp.cur' && max > 0 && +e.amt > 0) v = Math.min(v, Math.max(max, nm(cur)));
            o[k] = v;
            return { ok: true, inv: [{ op: 'add', path: e.path, amt: nm(cur) - v }] };
        }
        if (e.op === 'set') {
            if (!['v', 'b'].includes(kind(cur)) || kind(e.value) !== kind(cur)) return no("That isn't the right kind of value");
            if (same(cur, e.value)) return { ok: true, inv: [] };
            if (!same(cur, e.was)) return no(`it was ${show(cur)} already`, true);
            o[k] = e.value;
            return { ok: true, inv: [{ op: 'set', path: e.path, value: e.was, was: e.value }] };
        }
        return no("That isn't a DM edit");
    }

    // once per edit id; an archived character waits until it's unarchived. The roll log gets "DM: <words>".
    function run(c, e, ctx) {
        if (!isObj(e) || typeof e.id !== 'string') return { skip: true };
        if (!Array.isArray(c.dmApplied)) c.dmApplied = [];
        if (c.dmApplied.includes(e.id)) return { skip: true };
        if (c.archived) return { wait: true };
        let r;
        try { r = apply(c, e, ctx); } catch (x) { r = { ok: false, why: "That couldn't be applied" }; }
        c.dmApplied.push(e.id);
        if (c.dmApplied.length > KEEP) c.dmApplied.splice(0, c.dmApplied.length - KEEP);
        if (r.ok && e.op !== 'roll') {
            if (!Array.isArray(c.rolls)) c.rolls = [];
            c.rolls.unshift({ at: +e.at || Date.now(), title: (e.self ? '' : 'DM: ') + String(e.t || ''), expr: '', shown: '', total: '', dm: 1 });
            c.rolls.length = Math.min(c.rolls.length, 100);
        }
        return r;
    }

    // the edits from before to after (two copies of one character), skipping what the DM can't change
    function diff(a, b, path = [], out = []) {
        if (path.length && (NO_TOP.has(path[0]) || NO_ANY.has(path[path.length - 1]) || (path[0] === 'panels' && path.length === 3 && NO_PANEL.has(path[2])))) return out;
        const p = pat(path), key = path[path.length - 1];
        if (Array.isArray(a) && Array.isArray(b)) {
            if (TAGS.test(p)) {
                for (const v of b) if (!a.includes(v)) out.push({ op: 'tag', path, value: v, on: true });
                for (const v of a) if (!b.includes(v)) out.push({ op: 'tag', path, value: v, on: false });
                return out;
            }
            const objs = [...a, ...b].every(isObj);
            const byId = objs && [...a, ...b].every((o) => typeof o.id === 'string' && o.id), byName = objs && (key === 'skills' || key === 'abilities');
            if (byId || byName) {
                const id = (o) => (byId ? o.id : key === 'skills' ? o.name : o.key);
                const A = new Map(a.map((o) => [id(o), o])), B = new Map(b.map((o) => [id(o), o]));
                a.forEach((o, i) => { if (B.has(id(o))) diff(o, B.get(id(o)), [...path, step(a, i, key)], out); });
                if (p === 'panels') return out; // adding, removing and moving panels is the layout
                a.forEach((o, i) => { if (!B.has(id(o))) out.push({ op: 'unrow', path: [...path, step(a, i, key)] }); });
                b.forEach((o) => { if (!A.has(id(o))) out.push({ op: 'row', path, row: clone(o) }); });
                return out;
            }
            // by position: rows are only added at the end and removed anywhere, so a shorter list lost the first rows that differ
            let i = 0;
            const d = FIXED.test(p) ? 0 : a.length - b.length;
            if (d > 0) {
                while (i < b.length && same(a[i], b[i])) i++;
                for (let j = i + d - 1; j >= i; j--) out.push({ op: 'unrow', path: [...path, step(a, j, key)] });
            }
            const n = Math.min(a.length, b.length);
            for (let j = 0; j < n; j++) {
                const aj = d > 0 && j >= i ? j + d : j;
                // where it is once the rows before it are gone, named as it was
                if (aj < a.length) diff(a[aj], b[j], [...path, step(a, aj, key).replace(/^\d+/, String(j))], out);
            }
            if (d < 0 && !FIXED.test(p)) for (let j = a.length; j < b.length; j++) out.push({ op: 'row', path, row: clone(b[j]) });
            return out;
        }
        if (isObj(a) && isObj(b)) {
            for (const k of Object.keys(b)) if (k in a || (AMOUNT.test(pat([...path, k])) && kind(b[k]) === 'v')) diff(a[k], b[k], [...path, k], out);
            return out;
        }
        if (!path.length || same(a, b) || kind(b) === 'l' || kind(b) === 'o') return out;
        if (AMOUNT.test(p) && kind(b) === 'v') { const amt = nm(b) - nm(a); if (amt) out.push({ op: 'add', path, amt }); return out; }
        if (kind(a) === kind(b)) out.push({ op: 'set', path, value: b, was: a });
        return out;
    }

    const sg = (n) => (n < 0 ? '−' + -n : '+' + n);
    // the words for one edit, as the Versions dialog words the change (amounts as "+50 gp", HP as "−7 HP")
    function words(e, before, after, changes) {
        if (e.op === 'hp') return e.how === 'dmg' ? `−${Math.abs(nm(e.amt))} HP` : e.how === 'heal' ? `+${Math.abs(nm(e.amt))} HP` : `${Math.abs(nm(e.amt))} temp HP`;
        if (e.op === 'roll') return String(e.roll?.title || 'Roll');
        const lines = changes ? changes(before, after).map((x) => x.t) : [];
        if (e.op === 'add') {
            const p = pat(e.path), coin = /coins\.(\w+)$/.exec(p);
            const what = coin ? coin[1] : p === 'hp.cur' ? 'HP' : p === 'hp.temp' ? 'temp HP' : /\.ok$/.test(p) ? 'death save successes' : /\.bad$/.test(p) ? 'death save failures'
                : (lines[0] || e.path[e.path.length - 1]).replace(/ \S+ → \S+$/, '');
            return `${sg(nm(e.amt))} ${what}`;
        }
        return lines.join(', ') || (e.op === 'set' ? `${e.path[e.path.length - 1]} ${show(e.was)} → ${show(e.value)}` : 'a change');
    }

    const hbDm = { apply, run, diff, words, where, pat, allowed, AMOUNT, TAGS, FIXED, NO_TOP, NO_PANEL, NO_ANY, KEEP };
    globalThis.hbDm = hbDm;
    if (typeof window === 'undefined' || typeof fetch === 'undefined' || typeof localStorage === 'undefined') return;

    // ---- sending (the DM's pages): every edit waits in this browser until the site has it, so going offline loses none ----
    const OUT = 'dm-outbox';
    const outbox = () => { try { const q = JSON.parse(localStorage.getItem(OUT)); return Array.isArray(q) ? q : []; } catch (x) { return []; } };
    const keep = (q) => { try { localStorage.setItem(OUT, JSON.stringify(q)); } catch (x) { } };
    const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
    const fns = new Set();
    let paused = false, busy = null;
    const tell = (m) => fns.forEach((f) => { try { f(m); } catch (x) { } });
    function setPaused(on) { if (paused !== on) { paused = on; tell({ paused }); } }
    // oldest first, a character's edits together; one the site turns down is reported (refused) and dropped
    function flush() {
        return busy || (busy = (async () => {
            for (let q = outbox(); q.length; q = outbox()) {
                const { c, char } = q[0], batch = q.filter((x) => x.c === c && x.char === char).map((x) => x.e);
                let r;
                try {
                    r = await fetch('/sheets/player/dm.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ act: 'send', c, char, edits: batch }) });
                } catch (x) { setPaused(true); break; }
                if (r.status >= 500 || [401, 408, 429].includes(r.status)) { setPaused(true); break; }
                const out = await r.json().catch(() => ({}));
                const ids = new Set(batch.map((e) => e.id));
                keep(outbox().filter((x) => !ids.has(x.e.id)));
                setPaused(false);
                if (!r.ok) tell({ char, error: out.error || "Couldn't send that change." });
                for (const x of out.refused || []) tell({ char, refused: x });
                tell({ char, sent: batch });
            }
            busy = null;
        })());
    }
    function send(c, char, edits) {
        const now = Date.now();
        for (const e of edits) { e.id ||= uid(); e.at ||= now; }
        keep([...outbox(), ...edits.map((e) => ({ c, char, e }))]);
        return flush();
    }
    addEventListener('online', flush);
    setInterval(() => { if (outbox().length) flush(); }, 15000);
    if (outbox().length) flush();
    Object.assign(hbDm, { send, flush, waiting: (char) => outbox().filter((x) => x.char === char).map((x) => x.e), onChange: (f) => fns.add(f), paused: () => paused });
})();
