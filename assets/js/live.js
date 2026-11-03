// Live play for any page (ROADMAP 1.2, 1.3), signed in. <meta name="dnd-live"> (page_head) gives the relay's address.
//   Live.watch(campaignId, { onRolls(entries, all), onMessage(m), onPaused(bool) }) -> { close() }
//       the table log: the last 200 rolls this player may see (all = true: replace what you have), then each new one live.
//       With the relay down (or none) it checks campaigns/log.php every 10 s, and catches up when the relay is back.
//       onMessage gets everything else the relay sends (presence, campaign, session, fight) and {type: "removed"}.
//       load: what to fetch instead of the table log, on join, every 10 s while paused and when the relay is back
//       (the fight tracker, the Monster Sheet's own room "me"). onLoad: called each of those times too (handouts, 3.4).
//   Live.send(campaignId, roll) -> the roll's id. Saved through campaigns/api.php; while offline it waits in this browser,
//       marked as an offline roll with the time it was rolled, and goes when the connection is back. Nothing is dropped.
// The waiting rolls (localStorage "live-outbox") are only rolls on their way to the account, so they aren't synced themselves.
window.Live = (() => {
    'use strict';
    const url = document.querySelector('meta[name="dnd-live"]')?.content || '';
    const OUT = 'live-outbox';
    const outbox = () => { try { const q = JSON.parse(localStorage.getItem(OUT)); return Array.isArray(q) ? q : []; } catch (e) { return []; } };
    const keep = (q) => { try { localStorage.setItem(OUT, JSON.stringify(q)); } catch (e) { } };
    const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

    // oldest first; a roll the server turns down for good (not yours any more, campaign gone) is dropped, anything else waits
    let flushing = false;
    async function flush() {
        if (flushing) return;
        flushing = true;
        for (const item of outbox()) {
            let r;
            try {
                r = await fetch('/campaigns/api.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ act: 'roll', id: item.c, roll: item.roll }) });
            } catch (e) {
                keep(outbox().map((x) => ({ ...x, roll: { ...x.roll, offline: true } }))); // couldn't reach the site: these are offline rolls
                break;
            }
            if (!r.ok && (r.status >= 500 || [401, 408, 429].includes(r.status))) break;
            keep(outbox().filter((x) => x.roll.id !== item.roll.id));
        }
        flushing = false;
    }
    addEventListener('online', flush);
    setInterval(() => { if (outbox().length) flush(); }, 15000);
    if (outbox().length) flush();

    function send(c, roll) {
        const r = { ...roll, id: uid(), at: Date.now(), offline: !navigator.onLine };
        keep([...outbox(), { c, roll: r }]); // in the outbox first, so a closed tab or lost connection can't lose it
        flush();
        return r.id;
    }

    function watch(c, { onRolls = () => { }, onMessage = () => { }, onPaused = () => { }, load: own = null, onLoad = () => { } } = {}) {
        let ws = null, poll = 0, closed = false, paused = false;
        async function load() {
            onLoad();
            if (own) return own();
            try {
                const r = await fetch('/campaigns/log.php?c=' + encodeURIComponent(c), { cache: 'no-store' });
                if (r.status === 404) return onMessage({ type: 'removed' });
                if (r.ok && !closed) { const out = await r.json(); onRolls(out.entries, true, out); }
            } catch (e) { }
        }
        const startPoll = () => { clearInterval(poll); poll = setInterval(() => { load(); open(); }, 10000); };
        function open() {
            if (closed || ws || !url) return;
            const u = new URL(url, location.href);
            u.protocol = u.protocol === 'https:' ? 'wss:' : u.protocol === 'http:' ? 'ws:' : u.protocol;
            u.searchParams.set('c', c);
            ws = new WebSocket(u);
            ws.onopen = () => { if (paused) { paused = false; clearInterval(poll); onPaused(false); load(); } };
            ws.onmessage = (e) => {
                let m;
                try { m = JSON.parse(e.data); } catch (x) { return; }
                if (m.type === 'roll') onRolls([m.entry], false);
                else { if (m.type === 'session') load(); onMessage(m); }
            };
            ws.onclose = (e) => {
                ws = null;
                if (closed) return;
                if (e.code === 4403) return onMessage({ type: 'removed' });
                if (e.code === 4401) { open(); return load(); } // promoted to co-DM or back: in again with the new role
                if (!paused) { paused = true; onPaused(true); startPoll(); }
            };
        }
        load();
        if (url) open(); else startPoll(); // no relay on this server: checking every 10 s is all there is
        return { close() { closed = true; clearInterval(poll); ws?.close(); } };
    }
    return { url, send, watch, flush };
})();
