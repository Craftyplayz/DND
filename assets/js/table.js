// The Table view (ROADMAP 1.7, campaigns/table.php): the TV. Everything comes as the table (Live.as, ?as=table), so it only
// ever gets what players get. Nothing here is clickable: the map (assets/js/map.js, read-only) fills the screen, the turn order
// runs along the top (assets/js/fight.js keeps it), the last rolls sit in the bottom-left corner with big 3D dice for each new
// public roll (dice/dice3d.js, the roller's own dice set, no sound), and the DM's "Show on TV now" handout covers the map.
// With no map on the table: the campaign's name and the party. Keys: F full screen, + and - zoom, 0 fits.
(() => {
    'use strict';
    const main = document.getElementById('main');
    if (!main?.matches('.tv')) return;
    const c = main.dataset.c, $ = (s) => main.querySelector(s);
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    const initials = (n) => String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase();
    const face = (e) => `<span class="fi-face">${e.art ? `<img src="${esc(e.art)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}<span aria-hidden="true">${esc(initials(e.name))}</span></span>`;
    const strip = $('.tv-strip'), log = $('.tv-log'), idle = $('.tv-idle'), ho = $('.tv-ho'), badge = $('.tv-badge'), full = $('.tv-full'), fightEl = $('[data-mp=fight]');
    const q = '?c=' + encodeURIComponent(c);

    // ---- the map: always fitted below the strip; the party screen when no map is on the table ----
    let mapS = null;
    const map = window.BattleMap.mount($('.tv-map'), c, { table: true, top: () => (strip.hidden ? 0 : strip.offsetHeight + 8), onDraw(S) { mapS = S; idle.hidden = !!S.m; } });

    // ---- the turn order: from whoever's turn it is, the current card bigger, "Next" on the one after ----
    const MAX = 14; // past this many the cards stop shrinking and the rest is "+N"
    let turnWas = null, stripH = -1;
    function card(e, f) {
        const now = f.phase === 'running' && e.id === f.turn, down = (e.kind === 'monster' && e.status === 'down') || (e.kind === 'pc' && e.down);
        const cls = ['tv-card', e.kind, now && 'now', e.id === f.next && 'next', down && 'down', e.status === 'bloodied' && 'bloodied'].filter(Boolean).join(' ');
        const extra = e.kind === 'pc' ? (e.down ? window.Conds.saves(e.saves) : '') + window.Conds.row(e.conds) : '';
        return `<li class="${cls}"${now ? ' aria-current="true"' : ''}>${e.kind === 'dm' ? '<span class="fi-face fi-dm" aria-hidden="true">DM</span>' : face(e)}
            <b class="tv-n">${esc(e.name)}</b>${e.id === f.next && !now ? '<span class="tv-next">Next</span>' : ''}${extra}</li>`;
    }
    function drawStrip(f) {
        fightEl.hidden = true; // fight.js keeps the fight; this page draws its own strip
        strip.hidden = !f;
        if (f) {
            const i = Math.max(0, f.entries.findIndex((e) => e.id === f.turn));
            const order = f.phase === 'running' ? [...f.entries.slice(i), ...f.entries.slice(0, i)] : f.entries;
            const shown = order.length > MAX ? order.slice(0, MAX - 1) : order;
            strip.style.setProperty('--n', Math.max(4, Math.min(MAX, order.length)));
            strip.innerHTML = `<div class="tv-round">${f.phase === 'rolling' ? 'Rolling initiative' : `Round <b>${f.round}</b>`}</div>
                <ol class="tv-cards">${shown.map((e) => card(e, f)).join('')}${order.length > shown.length ? `<li class="tv-card tv-more">+${order.length - shown.length}</li>` : ''}</ol>
                ${f.phase === 'rolling' && f.waiting?.length ? `<p class="tv-wait">Waiting for: ${f.waiting.map(esc).join(', ')}</p>` : ''}`;
            // a new turn slides the order along by one card
            if (f.phase === 'running' && turnWas && f.turn !== turnWas) strip.querySelector('.tv-cards').classList.add('slide');
            turnWas = f.phase === 'running' ? f.turn : null;
        } else turnWas = null;
        const h = strip.hidden ? 0 : strip.offsetHeight;
        if (h !== stripH) { stripH = h; map.fit(); }
    }
    window.Fight.panel(fightEl, c, { onChange: drawStrip });

    // ---- the rolls: the last 8 of this session, newest at the bottom; a hidden DM roll is only "DM rolled" ----
    let rolls = [];
    function line(e) {
        if (e.vis === 'hidden') return `<li class="tv-roll"><b>DM</b> rolled</li>`;
        const nat = e.nat === '20' ? ' nat20' : e.nat === '1' ? ' nat1' : '';
        return `<li class="tv-roll${nat}"><b>${esc(e.name)}</b> ${esc(e.title)}${e.total !== '' && e.total != null ? ` <span class="tv-tot">${esc(e.total)}</span>` : ''}${e.shown ? `<small>${esc(e.shown.replace(/~/g, ''))}</small>` : ''}</li>`;
    }
    const drawLog = () => { log.innerHTML = rolls.map(line).join(''); };
    // 3D dice for a new public roll, landing on the numbers it rolled, in the roller's set; none for an old, late or offline roll,
    // or without WebGL (the log line is all)
    const gl = (() => { try { const cv = document.createElement('canvas'); return !!(cv.getContext('webgl2') || cv.getContext('webgl')); } catch (e) { return false; } })();
    let engine = null, choice = null, landed = null; // landed: the last throw's dice as they came to rest (for the checks)
    async function throwDice(e, set) {
        if (!gl || !Array.isArray(e.dice) || !e.dice.length || e.vis !== 'public' || e.offline || Math.abs(Date.now() - e.at) > 120000) return;
        try {
            const m = await (engine ||= import(main.dataset.dice));
            let style = 'purple';
            if (set) try { style = await (await (choice ||= import(main.dataset.choice))).styleFrom(set, m); } catch (x) { }
            // rolls that arrive together land on the table together (dice already there stay)
            m.throwDice(e.dice.map(([n, v]) => [n, v.length]), { style, sound: false, land: e.dice.map(([, v]) => v) }).then((r) => { landed = { id: e.id, dice: r }; }, () => { });
        } catch (x) { engine = null; }
    }
    const watch = window.Live.watch(c, {
        onRolls(entries, all, out) {
            if (all) rolls = [];
            for (const e of entries) {
                if (rolls.some((x) => x.id === e.id)) continue;
                rolls.push(e);
                if (!all) throwDice(e, out?.set);
            }
            rolls.sort((a, b) => a.at - b.at);
            rolls = rolls.slice(-8);
            drawLog();
        },
        onMessage(m) {
            if (m.type === 'tv') loadHandout();
            else if (m.type === 'campaign') loadParty();
            else if (m.type === 'removed') { idle.hidden = false; idle.querySelector('.tv-party').innerHTML = '<li class="muted">This Table view is closed: the campaign is gone, or you no longer run it.</li>'; }
        },
        onPaused(p) { badge.hidden = !p; },
        // on joining, every 10 s while the relay is down and when it's back: the handout, and a new version of the site
        onLoad() { loadHandout(); checkVersion(); },
    });

    // ---- the handout on the TV: full screen over the map; several pictures as a grid; text alone, big ----
    let hoWas = '';
    async function loadHandout() {
        try {
            const r = await fetch('/campaigns/handouts.php' + q + '&as=table', { cache: 'no-store' });
            if (!r.ok) return;
            const h = (await r.json()).tv, key = JSON.stringify(h);
            if (key === hoWas) return;
            hoWas = key;
            ho.hidden = !h;
            if (!h) { ho.innerHTML = ''; return; }
            const n = h.images.length;
            ho.className = 'tv-ho' + (n ? '' : ' tv-hotext-only');
            ho.innerHTML = `<h2>${esc(h.title || 'Handout')}</h2>${h.text ? `<p class="tv-hotext">${esc(h.text)}</p>` : ''}
                ${n ? `<div class="tv-pics" style="--n: ${Math.min(n, 3)}">${h.images.map((i) => `<img src="${esc(i.url)}" alt="${esc(i.name)}">`).join('')}</div>` : ''}`;
        } catch (e) { }
    }
    async function loadParty() {
        try {
            const r = await fetch('/campaigns/table.php' + q + '&party', { cache: 'no-store' });
            if (!r.ok) return;
            const p = await r.json();
            idle.querySelector('.tv-name').textContent = p.name;
            idle.querySelector('.tv-party').innerHTML = p.party.map((x) => `<li>${face(x)}<b>${esc(x.name)}</b></li>`).join('');
        } catch (e) { }
    }
    async function checkVersion() {
        try {
            const r = await fetch('/campaigns/table.php' + q + '&ver', { cache: 'no-store' });
            if (r.ok && (await r.json()).ver !== main.dataset.ver) location.reload();
        } catch (e) { }
    }

    // ---- the screen: full screen (a click once, then F), awake, no cursor ----
    const goFull = () => { full.hidden = true; document.documentElement.requestFullscreen?.().catch(() => { }); };
    full.addEventListener('click', goFull);
    setTimeout(() => { full.hidden = true; }, 30000); // nobody clicked: the TV shouldn't keep saying it
    if (document.fullscreenElement) full.hidden = true;
    addEventListener('keydown', (e) => {
        if (e.key.toLowerCase() !== 'f' || e.ctrlKey || e.metaKey || e.altKey) return;
        if (document.fullscreenElement) document.exitFullscreen?.().catch(() => { }); else goFull();
    });
    addEventListener('resize', () => map.fit());
    let lock = null;
    const awake = async () => { try { if (!lock || lock.released) lock = await navigator.wakeLock?.request('screen'); } catch (e) { } };
    awake();
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') awake(); });
    let still = 0;
    const moved = () => { document.body.classList.remove('tv-still'); clearTimeout(still); still = setTimeout(() => document.body.classList.add('tv-still'), 2500); };
    addEventListener('pointermove', moved);
    moved();
    window.TableView = { state: () => ({ map: mapS, rolls, watch, landed }) };
})();
