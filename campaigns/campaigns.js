// Campaigns (/campaigns/, /campaigns/<id>, /campaigns/join/<code>): every button and form posts one change to
// campaigns/api.php, then the page reloads (or opens the campaign), so what you see is always what's saved.
document.addEventListener('DOMContentLoaded', () => {
    'use strict';
    const { $, toast, esc } = UI;
    const id = $('#main').dataset.id;
    async function send(change, btn) {
        if (btn) btn.disabled = true;
        try {
            const r = await fetch('/campaigns/api.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...change }) });
            const out = await r.json().catch(() => ({}));
            if (r.ok) return out;
            if (r.status === 409 && out.conflict) return out; // the caller explains it
            toast(out.error || "Couldn't save that. Try again.", 'err');
        } catch (e) { toast("Couldn't reach the site. Check your connection and try again.", 'err'); }
        if (btn) btn.disabled = false;
        return null;
    }
    const open = (cid) => { location.href = '/campaigns/' + encodeURIComponent(cid); };

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
    // the character rules (ROADMAP 4.2): which ability score methods and hit point ways the builder offers
    $('#cp-rulesf')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const pick = (n) => [...e.target.querySelectorAll(`[name=${n}]:checked`)].map((b) => b.value);
        if (await send({ act: 'rules', methods: pick('m'), hp: pick('hp') }, e.submitter)) { toast('Saved the character rules.', 'ok'); e.submitter.disabled = false; }
    });
    $('#cp-chars')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target, characters = [...form.querySelectorAll('[name=ch]:checked')].map((b) => b.value);
        const out = await send({ act: 'characters', characters }, e.submitter);
        if (!out?.conflict) return out && location.reload();
        // one campaign per character: offer a copy that plays here instead
        if (e.submitter) e.submitter.disabled = false;
        ask('Already in a campaign', out.error + ' Clone it to play a copy here. The clone is a separate character from then on.', 'Clone character', async (y) => {
            const made = await send({ act: 'clone', char: out.conflict.id }, y);
            if (!made) return false;
            // the clone is already in; send the rest of the list again with it in the original's place
            form.querySelector(`[name=ch][value="${CSS.escape(out.conflict.id)}"]`).checked = false;
            form.insertAdjacentHTML('beforeend', `<input type="checkbox" name="ch" value="${esc(made.char)}" checked hidden>`);
            form.requestSubmit();
            return true;
        });
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
        else if (act === 'codm' && b.dataset.on) {
            ask(`Make ${b.dataset.name} a co-DM?`, "They'll see every character sheet in the party, hidden rolls and rolls sent to the DM, and can run fights and sessions. They can't rename or delete the campaign, make a new link, remove players or pick co-DMs. You can make them a player again at any time.", 'Make co-DM',
                async (y) => !!(await send({ act: 'codm', member: b.dataset.sub, on: true }, y)) && (location.reload(), true));
        }
        else if (act === 'codm') { if (await send({ act: 'codm', member: b.dataset.sub, on: false }, b)) location.reload(); }
        else if (act === 'leave') {
            ask('Leave this campaign?', 'Your characters stay in My Characters. You can join again with a link from the DM.', 'Leave',
                async (y) => !!(await send({ act: 'leave' }, y)) && (location.href = '/campaigns/', true));
        }
        else if (act === 'delete') {
            ask('Delete this campaign?', 'Everyone loses the campaign page. Characters stay in each player\'s My Characters.', 'Delete campaign',
                async (y) => !!(await send({ act: 'delete' }, y)) && (location.href = '/campaigns/', true));
        }
    });

    // Live (assets/js/live.js): who's online, the table log, and a fresh party, session and player list whenever anyone
    // changes the campaign. With the relay down the page says so and checks every 10 s until it's back.
    if (!id || !window.Live) return;
    window.Fight?.panel($('#cp-fight'), id); // the DM runs it from the Monster Sheet; here it's to see, and for monster HP
    // handouts and DM notes (ROADMAP 3.4): the DM's side is dm.js, the players' list handouts.js. Both load again when the
    // relay says one changed ("handout", "handout-gone", "notes", "campaign"), on reconnect and every 10 s while it's down.
    const hoData = JSON.parse($('#cp-ho-data')?.textContent || '{}');
    const dmTools = window.DmTools && $('#dm-ho') ? DmTools.start(id, hoData) : null;
    const hoBox = $('#cp-holist');
    const hoTrack = window.Handouts?.tracker((h) => Handouts.notify(h, () => Handouts.open(h.id)));
    function hoDraw(list) {
        if (!list || !hoBox || !hoTrack) return;
        hoTrack(list);
        const opened = [...hoBox.querySelectorAll('details[open]')].map((d) => d.id);
        hoBox.innerHTML = Handouts.html(list, id);
        for (const o of opened) { const d = document.getElementById(o); if (d) d.open = true; }
    }
    hoDraw(hoData.handouts);
    const hoLoad = async () => (dmTools ? dmTools.refresh() : hoBox && hoDraw(await Handouts.load(id)));
    let online = [], rolls = [], paused = 0;
    const dots = () => document.querySelectorAll('#cp-players [data-key]').forEach((r) => { r.querySelector('.cp-on').hidden = !online.includes(r.dataset.key); });
    async function refresh() {
        try {
            const r = await fetch(location.href, { cache: 'no-store' });
            if (r.status === 404) { location.href = '/campaigns/'; return; } // removed, or the campaign was deleted
            if (!r.ok) return;
            const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
            // made a co-DM or a player again: more of the page changes (the invite card), so load it all
            if (doc.querySelector('#main')?.dataset.role !== $('#main').dataset.role) { location.reload(); return; }
            for (const sel of ['#cp-head', '#cp-sess', '#cp-players']) { const fresh = doc.querySelector(sel); if (fresh) $(sel)?.replaceWith(fresh); }
            dots();
        } catch (e) { }
    }
    // one roll, as cp_roll_html() in index.php draws it
    const time = (ms) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    function cpRoll(e) {
        const hidden = e.vis === 'hidden' && e.total === undefined;
        const tags = (e.vis === 'dm' ? '<span class="badge p">to DM</span>' : e.vis === 'hidden' ? '<span class="badge p">hidden</span>' : '') + (e.offline ? '<span class="badge">offline roll</span>' : '');
        return `<li class="cp-roll${e.nat === '20' ? ' cp-nat20' : e.nat === '1' ? ' cp-nat1' : ''}"><span class="cp-rh"><b>${esc(e.name)}</b> ${hidden ? 'rolled' : esc(e.title || '')}${tags}<small title="${esc(new Date(e.at).toLocaleString())}">${time(e.at)}</small></span>`
            + (hidden ? '' : `<span class="cp-rd">${[esc(e.expr), esc(e.shown).replace(/~([^~]*)~/g, '<s>$1</s>')].filter(Boolean).join(' · ')}</span><span class="cp-rt">${esc(String(e.total ?? ''))}</span>`) + '</li>';
    }
    function drawLog() {
        $('#cp-log').innerHTML = rolls.length ? rolls.slice(-200).reverse().map(cpRoll).join('') : '<li class="muted cp-empty">Rolls made on a character in this campaign show up here.</li>';
    }
    Live.watch(id, {
        onRolls(list, all) {
            if (all) rolls = list;
            else for (const e of list) { const i = rolls.findIndex((x) => x.id === e.id); if (i >= 0) rolls[i] = e; else rolls.push(e); }
            rolls.sort((a, b) => a.at - b.at);
            drawLog();
        },
        onMessage(m) {
            if (m.type === 'presence') { online = m.online; dots(); }
            else if (m.type === 'campaign' || m.type === 'session' || m.type === 'removed') refresh();
            if (['handout', 'handout-gone', 'notes', 'campaign'].includes(m.type)) hoLoad();
        },
        onLoad: hoLoad,
        // live.js checks the log every 10 s while paused; the party and players are checked here
        onPaused(on) {
            $('#cp-paused').hidden = !on;
            clearInterval(paused);
            if (on) { online = []; dots(); paused = setInterval(refresh, 10000); } else refresh();
        },
    });
    // the session button posts like everything else, then the page refreshes when the relay says so
    document.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-act=session]');
        if (b && await send({ act: 'session', start: !!b.dataset.start }, b)) refresh();
    });
});
