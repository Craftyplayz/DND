// The Spectator window (campaigns/table.php): a tab the DM moves to the TV. Everything comes as the table (Live.as, ?as=table), so it only
// ever gets what players get. The map (assets/js/map.js, read-only) fills the screen with the turn tracker at the top (BattleMap.tiles);
// with no map displayed: the campaign's name and the party. Keys: F full screen, + and - zoom, 0 fits.
(() => {
    'use strict';
    const main = document.getElementById('main');
    if (!main?.matches('.tv')) return;
    const c = main.dataset.c, $ = (s) => main.querySelector(s);
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    const initials = (n) => String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase();
    const face = (e) => `<span class="fi-face">${e.art ? `<img src="${esc(e.art)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}<span aria-hidden="true">${esc(initials(e.name))}</span></span>`;
    const tracker = $('[data-mp=tracker]'), idle = $('.tv-idle'), badge = $('.tv-badge');
    const q = '?c=' + encodeURIComponent(c);
    let mapS = null, fight = null, trackerH = -1;
    // map.js keeps the fight and draws the tracker, here as on the map page
    let map = null; // (the fight can arrive while it mounts)
    map = window.BattleMap.mount(main, c, { table: true, top: () => tracker.offsetHeight, onDraw(S) { mapS = S; idle.hidden = !!S.m; }, onFight(f) {
        fight = f;
        if (tracker.offsetHeight !== trackerH) { trackerH = tracker.offsetHeight; if (!mapS?.moved && map) map.fit(); }
    } });
    window.Live.watch(c, {
        onMessage(m) {
            if (m.type === 'campaign') loadParty();
            else if (m.type === 'removed') { idle.hidden = false; idle.querySelector('.tv-party').innerHTML = '<li class="muted">This window is closed: the campaign is gone, or you no longer run it.</li>'; }
        },
        onPaused(p) { badge.hidden = !p; },
        onLoad() { checkVersion(); }, // on joining, every 10 s while the relay is down and when it's back
    });
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
    // the screen: F for full screen, awake, no cursor
    addEventListener('keydown', (e) => {
        if (e.key.toLowerCase() !== 'f' || e.ctrlKey || e.metaKey || e.altKey) return;
        if (document.fullscreenElement) document.exitFullscreen?.().catch(() => { }); else document.documentElement.requestFullscreen?.().catch(() => { });
    });
    addEventListener('resize', () => { if (!mapS?.moved) map.fit(); });
    let lock = null;
    const awake = async () => { try { if (!lock || lock.released) lock = await navigator.wakeLock?.request('screen'); } catch (e) { } };
    awake();
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') awake(); });
    let still = 0;
    const moved = () => { document.body.classList.remove('tv-still'); clearTimeout(still); still = setTimeout(() => document.body.classList.add('tv-still'), 2500); };
    addEventListener('pointermove', moved);
    moved();
    window.TableView = { state: () => ({ map: mapS, fight }) };
})();
