// My Characters (/characters/): a card per character in this browser's homebrew sheet storage (localStorage hb-sheet),
// each opening at /characters/<id>. Signed in, the account's newer characters come down first, the same rule as
// sheets/player/sheet.js (the newer "updated" wins), so a new device shows everything. The sheet tidies (normalises)
// characters when it opens them, so this page stores what the account sends as it is.
document.addEventListener('DOMContentLoaded', async () => {
    'use strict';
    const { $, esc, toast } = UI;
    const KEY = 'hb-sheet', API = '/sheets/player/cloud.php';
    const grid = $('#ch-grid'), q = $('#ch-q'), sort = $('#ch-sort'), dlg = $('#ch-del');
    const isObj = (o) => o && typeof o === 'object' && !Array.isArray(o);
    let cloud = 'cloud' in $('#main').dataset;
    // read fresh before every change, so a sheet open in another tab doesn't lose its edits to this page's older copy
    function load() {
        let db = null;
        try { db = JSON.parse(localStorage.getItem(KEY)); } catch (e) { }
        return isObj(db) && isObj(db.chars) ? db : { cur: '', chars: {} };
    }
    function store(db) {
        try { localStorage.setItem(KEY, JSON.stringify(db)); return true; }
        catch (e) { toast("Couldn't save: this browser's storage is full or blocked.", 'err'); return false; }
    }

    const level = (c) => (Array.isArray(c.classes) ? c.classes : []).reduce((n, k) => n + (+k.level || 0), 0) || 1;
    const classes = (c) => (Array.isArray(c.classes) ? c.classes : []).map((k) => k.name).filter(Boolean).join(' / ');
    const line = (c) => [`Level ${level(c)}`, c.race, classes(c)].filter(Boolean).join(' | ');
    // inline art, or the portrait kept in the account (sheets/player/art.php)
    const pic = (c) => (/^(data:image\/|https:\/\/)/.test(c.art || '') ? c.art : /^\/sheets\/player\/art\.php\?/.test(c.artUrl || '') ? c.artUrl : '');
    const art = (c) => (pic(c) ? `<img src="${esc(pic(c))}" alt="" referrerpolicy="no-referrer" width="64" height="64" loading="lazy">` : '<span class="ch-noart" aria-hidden="true"></span>');

    function draw() {
        // shortcut: characters have no "created" stamp, so creation order is the order they were added to this browser
        const all = Object.values(load().chars).filter((c) => isObj(c) && c.updated).map((c, i) => ({ c, i }));
        const want = q.value.trim().toLowerCase();
        const shown = all.filter(({ c }) => !want || `${c.name} level ${level(c)} ${c.race} ${classes(c)}`.toLowerCase().includes(want));
        const by = {
            created: (a, b) => a.i - b.i, '-created': (a, b) => b.i - a.i, '-updated': (a, b) => b.c.updated - a.c.updated,
            name: (a, b) => (a.c.name || '').localeCompare(b.c.name || ''), '-level': (a, b) => level(b.c) - level(a.c),
        }[sort.value];
        shown.sort(by);
        $('#ch-count').textContent = all.length === 1 ? '1 character' : `${all.length} characters`;
        grid.innerHTML = shown.map(({ c }) => {
            const url = '/characters/' + encodeURIComponent(c.id), name = c.name || 'Unnamed character';
            return `<article class="ch-card">
                <a class="ch-top" href="${url}">${art(c)}<span class="ch-who"><b>${esc(name)}</b><small>${esc(line(c))}</small></span></a>
                <div class="ch-acts"><a class="btn small" href="${url}">View</a><button type="button" class="btn small" data-act="del" data-id="${esc(c.id)}" data-name="${esc(name)}">Delete</button></div>
            </article>`;
        }).join('') || `<p class="muted">${all.length ? 'No characters match that search.' : 'No characters yet. Create one to get started.'}</p>`;
    }

    let gone = '';
    grid.addEventListener('click', (e) => {
        const b = e.target.closest('[data-act=del]');
        if (!b) return;
        gone = b.dataset.id;
        $('#ch-del-title').textContent = `Delete ${b.dataset.name}?`;
        $('#ch-del-text').textContent = 'This removes the character from this browser' + (cloud ? ' and from your account.' : '. Open it and use Export first if you want to keep a copy.');
        dlg.showModal();
    });
    $('#ch-del-no').addEventListener('click', () => dlg.close());
    $('#ch-del-yes').addEventListener('click', () => {
        dlg.close();
        const db = load();
        delete db.chars[gone];
        if (db.cur === gone) db.cur = '';
        if (!store(db)) return;
        if (cloud) fetch(API + '?id=' + encodeURIComponent(gone), { method: 'DELETE' }).catch(() => toast("Couldn't delete it from your account. Try again later.", 'err'));
        draw();
    });
    q.addEventListener('input', draw);
    sort.addEventListener('change', draw);
    draw();

    if (!cloud) return;
    try {
        const r = await fetch(API);
        if (r.status === 401) { cloud = false; return; }
        if (!r.ok) return;
        const { chars } = await r.json();
        const got = {};
        for (const [id, up] of Object.entries(chars)) {
            const have = load().chars[id];
            if (have && have.updated >= up) continue;
            const g = await fetch(API + '?id=' + encodeURIComponent(id));
            if (g.ok) got[id] = await g.json();
        }
        if (!Object.keys(got).length) return;
        const db = load();
        for (const [id, c] of Object.entries(got)) if (!db.chars[id] || db.chars[id].updated < c.updated) db.chars[id] = c;
        if (store(db)) draw();
    } catch (e) { }
});
