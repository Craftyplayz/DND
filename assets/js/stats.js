// The action log's browser side (ROADMAP "Stats data"). Nothing here shows on a page and nothing here touches the character:
// it compares what a character holds before and after each save and sends what changed to the account.
//   Stats.prime(c)         c is what it should be (came from the account, a restore): compare later edits with this
//   Stats.saw(c, soon)     the sheet saved c. soon: a button's change, logged now; typing is logged 2 s after it stops
//   Stats.note(meta)       about the next change, within a second: {asked, why, undo}
//   Stats.applied(c, meta) a DM edit was just applied to c: logged with the time it reached the server ({edit, at, by, asked})
//   Stats.add(id, event)   an action a comparison can't see (a rest, a roll not shared to a campaign)
//   Stats.kind(title, key) what sort of roll it is
// The waiting actions (localStorage "stats-outbox") are only on their way to the account, so they aren't synced themselves.
// Signed out they wait in this browser. shortcut: at most MAX wait, oldest dropped, so they can never crowd characters out of
// the browser's ~5 MB; raise it if someone plays for months signed out and that history matters.
(() => {
    'use strict';
    const OUT = 'stats-outbox', MAX = 2000, BATCH = 200;
    const num = (x) => parseFloat(x) || 0;
    const uid = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

    // the numbers and words of a character that actions change, nothing else
    function facts(c) {
        const f = { hp: { cur: num(c.hp?.cur), temp: num(c.hp?.temp), max: num(c.calc?.hpMax) }, insp: !!c.insp, exh: num(c.exhaustion),
            conds: (c.conditions || []).map(String), classes: {}, uses: {}, coins: {}, items: {}, ok: 0, bad: 0 };
        for (const k of c.classes || []) {
            const n = k.name || 'Class';
            f.classes[n] = { level: num(k.level) };
            f.uses['hd:' + n] = { what: 'hitdie', name: n, used: num(k.hdUsed) };
        }
        for (const p of c.panels || []) {
            if (p.type === 'combat') { f.ok = num(p.ok); f.bad = num(p.bad); }
            if (p.type === 'spells') {
                (p.slots || []).forEach((s, i) => { f.uses[`slot:${p.id}:${i}`] = { what: 'slot', name: 'Spell slot', lvl: i + 1, used: num(s.used) }; });
                if (p.sp) f.uses[`sp:${p.id}`] = { what: 'points', name: 'Sorcery points', used: num(p.sp.used) };
            }
            if (p.type === 'trackers') for (const r of p.rows || []) {
                if (r.kind === 'levels') (r.levels || []).forEach((l, i) => { f.uses[`tr:${r.id}:${i}`] = { what: 'tracker', name: r.name, lvl: i + 1, used: num(l.used) }; });
                // "count" holds what's left, the others what's used
                else f.uses['tr:' + r.id] = { what: 'tracker', name: r.name, used: r.kind === 'pips' ? num(r.used) : -num(r.cur) };
            }
            if (p.type === 'list' || p.type === 'attacks') for (const r of p.rows || []) if (String(r.uses ?? '').trim() !== '') f.uses['ab:' + r.id] = { what: 'ability', name: r.name, used: num(r.used) };
            if (p.type === 'items') {
                for (const k in p.coins || {}) f.coins[k] = (f.coins[k] || 0) + num(p.coins[k]);
                for (const r of p.rows || []) f.items[r.id] = { name: r.name, cat: r.cat, qty: num(r.qty) };
            }
        }
        return f;
    }

    // what happened between two facts(), as events without their id and time
    function diff(a, b) {
        const out = [];
        if (a.hp.cur !== b.hp.cur || a.hp.temp !== b.hp.temp) out.push({ t: 'hp', d: b.hp.cur - a.hp.cur, td: b.hp.temp - a.hp.temp, cur: b.hp.cur, temp: b.hp.temp, max: b.hp.max });
        if (a.ok !== b.ok || a.bad !== b.bad) out.push({ t: 'death', dok: b.ok - a.ok, dbad: b.bad - a.bad, ok: b.ok, bad: b.bad });
        if (a.insp !== b.insp) out.push({ t: 'insp', on: b.insp });
        if (a.exh !== b.exh) out.push({ t: 'exh', d: b.exh - a.exh, now: b.exh });
        for (const n of b.conds) if (!a.conds.includes(n)) out.push({ t: 'cond', name: n, on: true });
        for (const n of a.conds) if (!b.conds.includes(n)) out.push({ t: 'cond', name: n, on: false });
        for (const k in b.classes) if (a.classes[k] && a.classes[k].level !== b.classes[k].level) out.push({ t: 'level', name: k, d: b.classes[k].level - a.classes[k].level, now: b.classes[k].level });
        // a row added or removed isn't an action on it; d > 0 is spent, d < 0 is got back
        for (const k in b.uses) if (a.uses[k] && a.uses[k].used !== b.uses[k].used) {
            const { what, name, lvl } = b.uses[k];
            out.push({ t: 'use', what, name, ...(lvl ? { lvl } : {}), d: b.uses[k].used - a.uses[k].used });
        }
        for (const k in b.coins) if ((a.coins[k] || 0) !== b.coins[k]) out.push({ t: 'coin', coin: k, d: b.coins[k] - (a.coins[k] || 0), now: b.coins[k] });
        for (const k of new Set([...Object.keys(a.items), ...Object.keys(b.items)])) {
            const x = a.items[k], y = b.items[k], d = (y ? y.qty : 0) - (x ? x.qty : 0);
            if (d) out.push({ t: 'item', name: (y || x).name, cat: (y || x).cat, d, qty: y ? y.qty : 0 });
        }
        return out;
    }

    const kind = (title, key = '') => {
        const k = String(key).split(':')[0], t = String(title);
        if (k === 'mod') return 'check';
        if (k === 'save' || k === 'skill' || k === 'tool') return k;
        if (k === 'fs' && /init/.test(key) || /^Initiative\b/.test(t)) return 'init';
        if (/ to hit( with (dis)?advantage)?$/.test(t)) return 'attack';
        if (/ damage( with (dis)?advantage)?$/.test(t)) return 'damage';
        if (t === 'Coin flip') return 'coin';
        return 'other';
    };

    // ---- the outbox: an action is kept here first, so a closed tab or lost connection can't lose it ----
    const read = () => { try { const q = JSON.parse(localStorage.getItem(OUT)); return Array.isArray(q) ? q : []; } catch (e) { return []; } };
    const keep = (q) => { try { localStorage.setItem(OUT, JSON.stringify(q)); } catch (e) { } };
    let signedIn = () => false, flushing = false, soonT = 0;
    const waiting = new Set(); // characters not in the account yet: tried again on the next page load
    async function flush() {
        if (flushing || !signedIn()) return;
        flushing = true;
        try {
            for (;;) {
                const batch = read().filter((x) => !waiting.has(x.id)).slice(0, BATCH);
                if (!batch.length) break;
                const r = await fetch('/sheets/player/stats.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ now: Date.now(), events: batch }) });
                if (!r.ok) break; // signed out, offline or a hiccup: they wait
                const wait = new Set((await r.json()).wait || []);
                wait.forEach((id) => waiting.add(id));
                const sent = new Set(batch.map((x) => x.id));
                keep(read().filter((x) => !sent.has(x.id) || wait.has(x.id)));
            }
        } catch (e) { }
        flushing = false;
    }
    const flushSoon = () => { clearTimeout(soonT); soonT = setTimeout(flush, 3000); };
    function add(char, ev) {
        keep([...read(), { at: Date.now(), ...ev, id: ev.id || uid(), char }].slice(-MAX));
        flushSoon();
    }

    // ---- comparing ----
    const seen = new Map(); // character id -> {obj, f}. A character object swapped for another came from elsewhere: nothing to log
    let note_ = null, pending = null, timer = 0;
    const noted = () => (note_ && Date.now() - note_.when < 1000 ? note_ : null);
    const prime = (c) => {
        if (!c) return;
        if (pending === c) run(c); // typing not logged yet goes first, under its own name
        if (seen.get(c.id)?.obj !== c) seen.set(c.id, { obj: c, f: facts(c) });
    };
    function run(c, meta) {
        clearTimeout(timer);
        if (pending === c) pending = null;
        const was = seen.get(c.id), f = facts(c);
        seen.set(c.id, { obj: c, f });
        if (!was) return;
        const evs = diff(was.f, f);
        if (!evs.length) return;
        const m = meta || noted() || {};
        if (!meta) note_ = null;
        // a DM edit is applied by every device open on the character: the same id from each, so it counts once
        evs.forEach((e, i) => add(c.id, { ...e, ...(m.edit ? { id: `dm-${String(m.edit).replace(/[^\w-]/g, '').slice(0, 30)}-${i}` } : {}), ...(m.at ? { at: +m.at, srv: 1 } : {}), ...(m.by ? { by: m.by } : {}), ...(m.why ? { why: m.why } : {}), ...(m.undo ? { undo: 1 } : {}),
            ...(e.t === 'hp' && m.asked !== undefined ? { asked: m.asked } : {}) }));
    }
    function saw(c, soon) {
        if (!c) return;
        if (pending && pending !== c) run(pending);
        // an Undo that put back a whole copy is still compared; any other new copy is what it is
        if (seen.get(c.id)?.obj !== c && !noted()?.undo) { prime(c); return; }
        if (soon || noted()) return run(c);
        pending = c;
        clearTimeout(timer);
        timer = setTimeout(() => run(c), 2000);
    }
    const api = { facts, diff, kind, prime, saw, add,
        note(m) { note_ = { ...m, when: Date.now() }; },
        applied(c, meta) { if (pending) run(pending); run(c, meta); },
        sync(c) { seen.set(c.id, { obj: c, f: facts(c) }); }, // changed by something already logged elsewhere
        start(fn) {
            signedIn = fn;
            addEventListener('online', flush);
            addEventListener('pagehide', () => { if (pending) run(pending); });
            setInterval(flush, 30000);
            flushSoon();
        } };
    if (typeof module !== 'undefined') module.exports = api; else window.Stats = api;
})();
