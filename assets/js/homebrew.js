// A player's homebrew (ROADMAP 4.6, 5.2): saved in this browser under "homebrew" and, signed in, per entry in the account through
// compendium/homebrew.php; the newest "updated" wins, as the sheets' cloud saves do. Signed out, everything works from the browser alone.
// Other people's entries (shared through a campaign) are only held in memory: they aren't this player's to keep.
window.Homebrew = (() => {
    'use strict';
    const KEY = 'homebrew', API = '/compendium/homebrew.php';
    const signedIn = () => 'cloud' in (document.getElementById('main') || { dataset: {} }).dataset;
    const read = () => {
        try { const d = JSON.parse(localStorage.getItem(KEY)); return d && typeof d === 'object' && !Array.isArray(d) ? d : {}; } catch (e) { return {}; }
    };
    const post = (path, body) => fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    let view = { shared: [], shares: {}, camps: [] };

    // pull what's newer, push what's newer; a failed request leaves the browser's copy to go up next time
    async function sync() {
        if (!signedIn()) return;
        const r = await fetch(API);
        if (!r.ok) return;
        const j = await r.json(), db = read(), have = new Map(j.mine.map((e) => [e.id, e]));
        view = { shared: j.shared, shares: j.shares, camps: j.camps };
        for (const e of j.mine) if (!db[e.id] || db[e.id].updated < e.updated) db[e.id] = e;
        localStorage.setItem(KEY, JSON.stringify(db));
        await Promise.all(Object.values(db).filter((e) => !have.has(e.id) || have.get(e.id).updated < e.updated).map((e) => post('', e).catch(() => { })));
    }
    // true: it reached the account. Throws when the browser can't store it, so a full browser never looks like a save.
    async function save(e) {
        const db = read(), prev = db[e.id];
        e.updated = Math.max(Date.now(), (prev ? prev.updated : 0) + 1);
        db[e.id] = e;
        localStorage.setItem(KEY, JSON.stringify(db));
        if (!signedIn()) return false;
        try { return (await post('', e)).ok; } catch (x) { return false; }
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
        view.shared = view.shared.map((e) => ({ ...e, camps: e.camps.filter((x) => x.ref !== ref) })).filter((e) => e.camps.length);
    }
    return {
        signedIn, sync, save, setArchived, share, removeFrom,
        id: () => 'h' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
        mine: () => Object.values(read()),
        shared: () => view.shared,
        camps: () => view.camps,
        sharedWith: (id) => view.shares[id] || [],
    };
})();
