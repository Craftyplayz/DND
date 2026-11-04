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
        else if (act === 'chars') { $('#cp-chardlg').showModal(); }
        else if (act === 'charsno') { $('#cp-chardlg').close(); }
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

    // Live (assets/js/live.js): who's online, the rolls, and a fresh header, party, player list, link and rules whenever
    // anyone changes the campaign. With the relay down the page says so and checks every 10 s until it's back.
    if (!id || !window.Live) return;
    const role = $('#main').dataset.role, over = $('#cp-over');

    // ---- tabs (ROADMAP 1.9): #rolls, #handouts, #notes, #campaign; plain address = Overview. Each click is a step for Back.
    const pills = [...document.querySelectorAll('#cp-tabs [data-tab]')];
    const tabFromHash = () => { const t = location.hash.slice(1); return pills.some((p) => p.dataset.tab === t && t !== 'overview') ? t : 'overview'; };
    let tab = '', map = null;
    function show(name) {
        const changed = tab && name !== tab;
        tab = name;
        for (const p of pills) { const on = p.dataset.tab === name; p.classList.toggle('on', on); if (on) p.setAttribute('aria-current', 'page'); else p.removeAttribute('aria-current'); }
        for (const el of document.querySelectorAll('[data-panel]')) el.hidden = el.dataset.panel !== name;
        if (name === 'overview') mapShown();
        // the new tab starts at its top, with the title and pills in view if you'd scrolled past them
        if (changed) { const y = $('#cp-tabs').getBoundingClientRect().top; if (y < 0) scrollBy(0, y - 8); }
    }
    function go(name) { if (name !== tab) { location.hash = name; show(name); } }
    // a tab you can't have (a player's #notes, a co-DM made a player again) opens Overview, with the address cleaned
    function fromHash() {
        const t = tabFromHash();
        if (location.hash && t === 'overview') history.replaceState(null, '', location.pathname);
        if (t !== tab) show(t);
    }
    addEventListener('hashchange', fromHash);
    $('#cp-tabs').addEventListener('click', (e) => {
        const b = e.target.closest('[data-tab=overview]');
        if (!b || e.ctrlKey || e.metaKey || e.shiftKey) return;
        e.preventDefault();
        if (tab !== 'overview') { history.pushState(null, '', location.pathname); show('overview'); }
    });

    // ---- the map on the table: it only starts when Overview first shows (ROADMAP 1.9). Players get nothing until its fog has been sent.
    const mapEl = $('#cp-map'), noMap = $('#cp-nomap');
    let mapOn = false;
    function mapDrawn(S) {
        const on = S.failed || (S.dm ? !!S.m : !!S.m?.sent);
        if (noMap) noMap.hidden = on;
        if (on === mapOn) return;
        mapOn = on;
        mapEl.hidden = !on;
        if (on) map?.draw(); // it can only fit itself once it has a size
    }
    function mapShown() {
        if (!map) { map = BattleMap.mount(mapEl, id, { dm: role !== 'player', me: mapEl.dataset.me, onDraw: mapDrawn }); return; }
        map.draw();
        if (mapOn && !map.state.moved) map.fit();
    }

    // ---- the header's times, in this viewer's own time zone
    function stamps() {
        const clock = (d) => d.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true });
        for (const el of document.querySelectorAll('[data-day]')) el.textContent = +el.dataset.day ? new Date(el.dataset.day * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
        const b = $('#cp-sbadge');
        if (b) {
            const d = new Date(b.dataset.since * 1000), today = d.toDateString() === new Date().toDateString();
            b.textContent = `Session ${b.dataset.n}` + (+b.dataset.since ? ' since ' + (today ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ', ') + clock(d) : '');
        }
    }
    // ---- Overview's order: Party, Fight, Map, then the rest while a session or fight is on; otherwise the map goes last
    let playing = null;
    function arrange() {
        const f = window.Fight?.state(id), on = !!f || !!$('#cp-head').dataset.running;
        $('#cp-fdot').hidden = !f;
        $('#cp-last').hidden = on || !$('#cp-last').textContent.trim();
        if (on === playing) return;
        playing = on;
        const parts = [$('#cp-fight'), mapEl, noMap].filter(Boolean);
        if (on) parts.forEach((p) => over.insertBefore(p, $('#cp-extras'))); else parts.forEach((p) => over.append(p));
    }
    // the DM runs the fight on the map page; here it's to see, and for HP
    window.Fight?.panel($('#cp-fight'), id, { onChange: arrange, link: role === 'player' ? '' : ` <a class="btn small" href="/campaigns/${esc(id)}/map">Run the fight</a>` });

    // handouts and DM notes (ROADMAP 3.4): the DM's side is dm.js, the players' list handouts.js. Both load again when the
    // relay says one changed ("handout", "handout-gone", "notes", "campaign"), on reconnect and every 10 s while it's down.
    const hoData = JSON.parse($('#cp-ho-data')?.textContent || '{}');
    const dmTools = window.DmTools && $('#dm-ho') ? DmTools.start(id, hoData) : null;
    const hoBox = $('#cp-holist');
    const hoGo = (hid) => { go('handouts'); Handouts.open(hid); };
    const hoTrack = window.Handouts?.tracker((h) => Handouts.notify(h, () => hoGo(h.id)));
    // what's unopened, on the pill (new and updated) and on Overview (new ones by name); read from the list, so opening one counts at once
    function hoMarks() {
        if (!hoBox) return;
        const open = [...hoBox.querySelectorAll('.ho-item[data-unread]')], fresh = open.filter((d) => d.querySelector('.ho-mark.b'));
        const n = $('#cp-hocount'), line = $('#cp-newho');
        n.hidden = !open.length;
        n.textContent = open.length;
        line.hidden = !fresh.length;
        line.innerHTML = 'New handouts: ' + fresh.map((d) => `<a href="#handouts" data-ho-go="${esc(d.dataset.ho)}">${esc(d.querySelector('.ho-t b').textContent)}</a>`).join(', ');
    }
    function hoDraw(list) {
        if (!list || !hoBox || !hoTrack) return;
        hoTrack(list);
        const opened = [...hoBox.querySelectorAll('details[open]')].map((d) => d.id);
        hoBox.innerHTML = Handouts.html(list, id);
        for (const o of opened) { const d = document.getElementById(o); if (d) d.open = true; }
        hoMarks();
    }
    document.addEventListener('toggle', (e) => { if (e.target.matches?.('.ho-item')) hoMarks(); }, true); // after handouts.js marks it read
    document.addEventListener('click', (e) => {
        const a = e.target.closest('[data-ho-go]');
        if (a) { e.preventDefault(); hoGo(a.dataset.hoGo); }
    });
    hoDraw(hoData.handouts);
    const hoLoad = async () => (dmTools ? dmTools.refresh() : hoBox && hoDraw(await Handouts.load(id)));

    let online = [], rolls = [], page = null, paused = 0;
    const dots = () => {
        document.querySelectorAll('#cp-players [data-key]').forEach((r) => { r.querySelector('.cp-on').hidden = !online.includes(r.dataset.key); });
        document.querySelectorAll('.ch-tile[data-key]').forEach((t) => { t.querySelector('.cp-dot').hidden = !online.includes(t.dataset.key); });
    };
    async function refresh() {
        try {
            const r = await fetch(location.href, { cache: 'no-store' });
            if (r.status === 404) { location.href = '/campaigns/'; return; } // removed, or the campaign was deleted
            if (!r.ok) return;
            const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
            // made a co-DM or a player again: more of the page changes (the invite card), so load it all
            if (doc.querySelector('#main')?.dataset.role !== $('#main').dataset.role) { location.reload(); return; }
            // the DM's own rules form is never replaced; a player's read-only rules are
            for (const sel of ['#cp-head', '#cp-last', '#cp-party', '#cp-players', '#cp-invite', ...(role === 'player' ? ['#cp-rules'] : [])]) { const fresh = doc.querySelector(sel); if (fresh) $(sel)?.replaceWith(fresh); }
            document.title = doc.title;
            const crumbs = doc.querySelectorAll('.crumbs');
            document.querySelectorAll('.crumbs').forEach((c, i) => { if (crumbs[i]) c.replaceWith(crumbs[i]); });
            stamps(); dots(); arrange();
        } catch (e) { }
    }
    // one roll
    const time = (ms) => new Date(ms).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true });
    function cpRoll(e) {
        const hidden = e.vis === 'hidden' && e.total === undefined;
        const tags = (e.vis === 'dm' ? '<span class="badge p">to DM</span>' : e.vis === 'hidden' ? '<span class="badge p">hidden</span>' : '') + (e.offline ? '<span class="badge">offline roll</span>' : '');
        return `<li class="cp-roll${e.nat === '20' ? ' cp-nat20' : e.nat === '1' ? ' cp-nat1' : ''}"><span class="cp-rh"><b>${esc(e.name)}</b> ${hidden ? 'rolled' : esc(e.title || '')}${tags}<small title="${esc(UI.when(e.at))}">${time(e.at)}</small></span>`
            + (hidden ? '' : `<span class="cp-rd">${[esc(e.expr), esc(e.shown).replace(/~([^~]*)~/g, '<s>$1</s>')].filter(Boolean).join(' · ')}</span><span class="cp-rt">${esc(String(e.total ?? ''))}</span>`) + '</li>';
    }
    // the Rolls tab: the running or last session (tl_page, ROADMAP 1.9)
    function drawLog() {
        const day = page?.started ? new Date(page.started * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
        $('#cp-rhead').textContent = !page ? 'Rolls' : page.running ? `Session ${page.n}`
            : [`Last session: ${page.n}`, day, page.count === 1 ? '1 roll' : `${page.count} rolls`].filter(Boolean).join(' · ');
        const empty = page ? 'No rolls yet in this session.' : role === 'player' ? 'No sessions yet.' : 'No sessions yet. Rolls show here once you start a session.';
        $('#cp-log').innerHTML = rolls.length ? [...rolls].reverse().map(cpRoll).join('') : `<li class="muted cp-empty">${empty}</li>`;
    }
    stamps();
    drawLog();
    arrange();
    fromHash();

    Live.watch(id, {
        query: '&page=1',
        onRolls(list, all, out) {
            if (all) { rolls = list; page = out.page; }
            else if (!page?.running) return; // rolls between sessions stay saved and don't show here
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
    // the session button posts like everything else, then the page refreshes when the relay says so. Ending asks first.
    document.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-act=session]');
        if (!b) return;
        if (b.dataset.start) { if (await send({ act: 'session', start: true }, b)) refresh(); return; }
        ask(`End session ${b.dataset.n}?`, "Rolls made after this won't show on the Rolls tab. They're still saved." + (window.Fight?.state(id) ? ' A fight is still running; it stays on.' : ''), 'End session',
            async (y) => { const ok = !!(await send({ act: 'session', start: false }, y)); if (ok) refresh(); return ok; });
    });
});
