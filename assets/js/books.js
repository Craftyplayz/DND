// The Sources tick list, shared by the Compendium and the character builder: one choice of books for both, kept in "compendium-books"
// (the books turned off, so a book added later starts on) and following the account through sync.js. An entry with no book, like homebrew, always shows.
window.Books = (() => {
    'use strict';
    const KEY = 'compendium-books';
    const off = () => { const v = UI.store.get(KEY, []); return Array.isArray(v) ? v : []; };
    // an entry in several books ("A; B", content/books.mjs) shows while any of them is ticked
    const allows = (book) => { if (!book) return true; const o = off(); return !o.length || String(book).split('; ').some((b) => !o.includes(b)); };
    let dlg, after = () => { };
    // { book: how many entries }: the content's, plus the monsters' when asked for
    async function books(monsters) {
        const out = { ...(await (await fetch('/sheets/player/content/index.json')).json()).books };
        if (monsters) {
            const j = await (await fetch('/sheets/monster/monsters.json')).json();
            for (const [, , , , src] of j.list) { const b = (j.sources[src] || {}).title || src; out[b] = (out[b] || 0) + 1; }
        }
        return out;
    }
    function setOff(list) { UI.store.set(KEY, [...new Set(list)]); after(); }
    function build() {
        dlg = document.createElement('dialog');
        dlg.className = 'dlg';
        dlg.id = 'books-dlg';
        dlg.setAttribute('aria-labelledby', 'books-t');
        dlg.innerHTML = `<h2 id="books-t">Sources</h2><p class="muted">Show only what comes from the ticked books. Your homebrew always shows.</p>
            <input class="field" type="search" id="books-q" placeholder="Search books" aria-label="Search books" autocomplete="off">
            <div class="actions books-bulk"><button type="button" class="btn small" data-bk="all">Tick all</button><button type="button" class="btn small" data-bk="none">Untick all</button></div>
            <div class="books-list" id="books-list"></div>
            <div class="actions"><button type="button" class="btn primary" data-bk="close">Close</button></div>`;
        document.getElementById('main').appendChild(dlg);
        const shown = () => [...dlg.querySelectorAll('#books-list label:not([hidden]) input')];
        dlg.addEventListener('change', (ev) => {
            const b = ev.target.closest('[data-book]');
            if (b) setOff(b.checked ? off().filter((x) => x !== b.dataset.book) : [...off(), b.dataset.book]);
        });
        dlg.addEventListener('input', (ev) => {
            if (ev.target.id !== 'books-q') return;
            const q = ev.target.value.trim().toLowerCase();
            for (const l of dlg.querySelectorAll('#books-list label')) l.hidden = !l.textContent.toLowerCase().includes(q);
        });
        dlg.addEventListener('click', (ev) => {
            const a = ev.target.closest('[data-bk]');
            if (!a) return;
            if (a.dataset.bk === 'close') return dlg.close();
            // only the books the search shows, so "Tome" then Untick all does what it looks like
            const list = shown(), names = list.map((i) => i.dataset.book), on = a.dataset.bk === 'all';
            for (const i of list) i.checked = on;
            setOff(on ? off().filter((x) => !names.includes(x)) : [...off(), ...names]);
        });
    }
    // onChange runs after every tick, so the list behind the dialog follows along
    async function open(onChange, { monsters = false } = {}) {
        if (!dlg) build();
        after = onChange;
        dlg.querySelector('#books-q').value = '';
        const list = dlg.querySelector('#books-list');
        list.innerHTML = '<p class="muted">Loading...</p>';
        dlg.showModal();
        try {
            const all = await books(monsters), now = off();
            list.innerHTML = Object.entries(all).sort((a, b) => a[0].localeCompare(b[0])).map(([b, n]) => `<label class="check"><input type="checkbox" data-book="${UI.esc(b)}"${now.includes(b) ? '' : ' checked'}> ${UI.esc(b)} <small class="muted">${UI.num(n)}</small></label>`).join('');
        } catch (e) { list.innerHTML = '<p class="err">Couldn\'t load the books. Check your connection and try again.</p>'; }
    }
    return { allows, open, label: () => (off().length ? 'Sources (filtered)' : 'Sources') };
})();
