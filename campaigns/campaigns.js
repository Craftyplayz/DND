// Campaigns (/campaigns/, /campaigns/?c=<id>, /campaigns/join/<code>): every button and form posts one change to
// campaigns/api.php, then the page reloads (or opens the campaign), so what you see is always what's saved.
document.addEventListener('DOMContentLoaded', () => {
    'use strict';
    const { $, toast } = UI;
    const id = $('#main').dataset.id;
    async function send(change, btn) {
        if (btn) btn.disabled = true;
        try {
            const r = await fetch('/campaigns/api.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...change }) });
            const out = await r.json().catch(() => ({}));
            if (r.ok) return out;
            toast(out.error || "Couldn't save that. Try again.", 'err');
        } catch (e) { toast("Couldn't reach the site. Check your connection and try again.", 'err'); }
        if (btn) btn.disabled = false;
        return null;
    }
    const open = (cid) => { location.href = '/campaigns/?c=' + encodeURIComponent(cid); };

    // the yes/no dialog for the changes that can't be undone from the page
    const dlg = $('#cp-ask');
    let onYes = null;
    function ask(title, text, yes, then) {
        $('#cp-ask-title').textContent = title;
        $('#cp-ask-text').textContent = text;
        $('#cp-ask-yes').textContent = yes;
        $('#cp-ask-yes').disabled = false;
        onYes = then;
        dlg.showModal();
    }
    $('#cp-ask-no')?.addEventListener('click', () => dlg.close());
    $('#cp-ask-yes')?.addEventListener('click', async (e) => { if (await onYes(e.target)) dlg.close(); });

    $('#cp-create')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const out = await send({ act: 'create', name: e.target.name.value }, e.submitter);
        if (out) open(out.id);
    });
    $('#cp-rename')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (await send({ act: 'rename', name: e.target.name.value }, e.submitter)) location.reload();
    });
    $('#cp-chars')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const characters = [...e.target.querySelectorAll('[name=ch]:checked')].map((b) => b.value);
        if (await send({ act: 'characters', characters }, e.submitter)) location.reload();
    });

    document.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-act]');
        if (!b) return;
        const act = b.dataset.act;
        if (act === 'join') { const out = await send({ act: 'join', code: b.dataset.code }, b); if (out) open(out.id); }
        else if (act === 'copy') { UI.copy($('#cp-link').value); }
        else if (act === 'code') { if (await send({ act: 'code' }, b)) location.reload(); }
        else if (act === 'remove') {
            ask(`Remove ${b.dataset.name}?`, 'Their characters leave the campaign too. They can join again with the link, so make a new link if they shouldn\'t.', 'Remove',
                async (y) => !!(await send({ act: 'remove', member: b.dataset.sub }, y)) && (location.reload(), true));
        }
        else if (act === 'leave') {
            ask('Leave this campaign?', 'Your characters stay in My Characters. You can join again with a link from the DM.', 'Leave',
                async (y) => !!(await send({ act: 'leave' }, y)) && (location.href = '/campaigns/', true));
        }
        else if (act === 'delete') {
            ask('Delete this campaign?', 'Everyone loses the campaign page. Characters stay in each player\'s My Characters.', 'Delete campaign',
                async (y) => !!(await send({ act: 'delete' }, y)) && (location.href = '/campaigns/', true));
        }
    });

    // Live (live/relay.js): who's online, and a fresh party and player list whenever anyone changes the campaign.
    // With the relay down the page says so and checks for changes every 10 s until it's back.
    const live = $('#main').dataset.live;
    if (!id || !live) return;
    let online = [], ws = null, timer = 0;
    const dots = () => document.querySelectorAll('#cp-players [data-key]').forEach((r) => { r.querySelector('.cp-on').hidden = !online.includes(r.dataset.key); });
    async function refresh() {
        try {
            const r = await fetch(location.href, { cache: 'no-store' });
            if (r.status === 404) { location.href = '/campaigns/'; return; } // removed, or the campaign was deleted
            if (!r.ok) return;
            const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
            for (const sel of ['#cp-head', '#cp-players']) { const fresh = doc.querySelector(sel); if (fresh) $(sel)?.replaceWith(fresh); }
            dots();
        } catch (e) { }
    }
    function paused(on) {
        $('#cp-paused').hidden = !on;
        clearInterval(timer);
        if (on) timer = setInterval(() => { refresh(); connect(); }, 10000);
    }
    function connect() {
        if (ws) return;
        const url = new URL(live, location.href);
        url.protocol = url.protocol === 'https:' ? 'wss:' : url.protocol === 'http:' ? 'ws:' : url.protocol;
        url.searchParams.set('c', id);
        ws = new WebSocket(url);
        ws.onopen = () => { if (!$('#cp-paused').hidden) refresh(); paused(false); }; // catch up on what changed while away
        ws.onmessage = (e) => {
            const m = JSON.parse(e.data);
            if (m.type === 'presence') { online = m.online; dots(); }
            else if (m.type === 'campaign') refresh();
        };
        ws.onclose = (e) => {
            ws = null; online = []; dots();
            if (e.code === 4403) refresh(); else if ($('#cp-paused').hidden) paused(true);
        };
    }
    connect();
});
