// Handouts for players (ROADMAP 3.4): the campaign page's Handouts section and the sheet's Handouts panel.
//   Handouts.load(campaignId)            -> the handouts you may see, newest first (campaigns/handouts.php), or null offline
//   Handouts.html(list, campaignId)      -> their markup: title, date, a thumbnail, the text and pictures on click
//   Handouts.tracker(onNew)              -> fn(list): calls onNew(handout) for each new one that wasn't in the last list
//   Handouts.notify(h, open)             -> a toast "New handout: <title>" with an Open button (open() runs on click)
//   Handouts.open(id)                    -> opens and scrolls to it
// Opening one marks it read on the server, so "New" follows the account to every device. Pictures open in a dialog
// (Escape closes) with a Download link. Everything, pictures too, comes through campaigns/handouts.php, which checks you
// may see it.
window.Handouts = (() => {
    'use strict';
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const date = (ms) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

    async function load(c) {
        try {
            const r = await fetch('/campaigns/handouts.php?c=' + encodeURIComponent(c), { cache: 'no-store' });
            if (r.ok) return (await r.json()).handouts;
        } catch (e) { }
        return null;
    }

    const mark = (h) => (h.new ? '<span class="badge b ho-mark">New</span>' : h.updated ? '<span class="badge ho-mark">Updated</span>' : '');
    const item = (h, c) => `<details class="ho-item" id="ho-${esc(h.id)}" data-ho="${esc(h.id)}" data-c="${esc(c)}"${h.new || h.updated ? ' data-unread' : ''}>
        <summary>${h.images[0] ? `<img class="ho-thumb" src="${esc(h.images[0].url)}" alt="" width="48" height="48" loading="lazy" decoding="async">` : '<span class="ho-thumb" aria-hidden="true"></span>'}
            <span class="ho-t"><b>${esc(h.title || 'Untitled handout')}</b>${mark(h)}<small>${esc(date(h.sent || h.updated || Date.now()))}</small></span></summary>
        <div class="ho-body">${h.text ? `<p class="ho-text">${esc(h.text)}</p>` : ''}
            ${h.images.length ? `<div class="ho-imgs">${h.images.map((i) => `<button type="button" class="ho-img" data-ho-img="${esc(i.url)}" data-name="${esc(i.name)}" aria-label="Open ${esc(i.name)}"><img src="${esc(i.url)}" alt="" width="120" height="120" loading="lazy" decoding="async"></button>`).join('')}</div>` : ''}</div></details>`;
    // list items are tagged with their campaign so opening one tells the right campaign
    const html = (list, c) => (list.length ? `<div class="ho-list">${list.map((h) => item(h, c)).join('')}</div>` : '<p class="muted">No handouts yet. They show up here when the DM sends you one.</p>');

    function tracker(onNew) {
        let known = null;
        return (list) => {
            if (known) for (const h of list) if (!known.has(h.id) && h.new) onNew(h);
            known = new Set(list.map((h) => h.id));
        };
    }

    function notify(h, open) {
        let box = document.querySelector('.toasts');
        if (!box) { box = document.createElement('div'); box.className = 'toasts'; box.setAttribute('role', 'status'); document.body.appendChild(box); }
        const el = document.createElement('div');
        el.className = 'note ho-toast';
        el.innerHTML = `<span>New handout: ${esc(h.title || 'Untitled handout')}</span><button type="button" class="btn small">Open</button>`;
        el.querySelector('button').addEventListener('click', () => { el.remove(); open(); });
        box.appendChild(el);
        setTimeout(() => el.remove(), 15000);
    }

    function open(id) {
        const d = document.getElementById('ho-' + id);
        if (!d) return;
        d.open = true;
        d.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // opened: read on the server (every device), and the mark goes here straight away
    document.addEventListener('toggle', (e) => {
        const d = e.target;
        if (!d.matches?.('.ho-item[data-unread]') || !d.open) return;
        delete d.dataset.unread;
        d.querySelector('.ho-mark')?.remove();
        fetch('/campaigns/handouts.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ c: d.dataset.c, act: 'open', id: d.dataset.ho }) }).catch(() => { });
    }, true);

    // a picture, full size, in a dialog of its own
    let dlg = null;
    document.addEventListener('click', (e) => {
        const b = e.target.closest('[data-ho-img]');
        if (b) {
            if (!dlg) {
                document.body.insertAdjacentHTML('beforeend', `<dialog class="dlg ho-dlg" id="ho-dlg" aria-label="Handout picture"><img alt=""><div class="actions">
                    <a class="btn" download>Download</a><button type="button" class="btn" data-ho-close>Close</button></div></dialog>`);
                dlg = document.getElementById('ho-dlg');
            }
            dlg.querySelector('img').src = b.dataset.hoImg;
            dlg.querySelector('img').alt = b.dataset.name;
            Object.assign(dlg.querySelector('a'), { href: b.dataset.hoImg, download: b.dataset.name });
            dlg.showModal();
        }
        else if (e.target.closest('[data-ho-close]')) dlg.close();
    });

    return { load, html, tracker, notify, open, esc };
})();
