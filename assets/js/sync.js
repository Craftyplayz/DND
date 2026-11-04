// Signed in (page_head() loads this only then): the settings below follow the Google account through /prefs.php.
// A change in this browser is stamped and sent up; on load the account's newer values come in, and the page starts
// again once so it uses them. The newest change wins, as with characters. Characters and monsters sync themselves
// (the sheets' cloud.php).
(function () {
    'use strict';
    const KEYS = ['dice-choice', 'dice-sets-page', 'dice-sets-sound', 'dnd.rollMode', 'monster-table', 'monster-roll-vis', 'compendium-view', 'compendium-rules', 'compendium-favs', 'compendium-recent', 'compendium-enc', 'encounter-rules', 'compendium-books']; // the same list as prefs.php
    const STAMPS = 'prefs-updated'; // { key: ms } when this browser last changed each one
    const ls = localStorage, set = Storage.prototype.setItem, del = Storage.prototype.removeItem;
    let stamps = {};
    try { stamps = JSON.parse(ls.getItem(STAMPS)) || {}; } catch (e) { }
    const keep = () => { try { set.call(ls, STAMPS, JSON.stringify(stamps)); } catch (e) { } };
    // values saved before this existed count as very old: the account's copy wins over them
    for (const k of KEYS) if (!stamps[k] && ls.getItem(k) !== null) stamps[k] = 1;

    let off = false, timer = 0;
    const pending = new Set();
    function send(k) {
        fetch('/prefs.php', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
            body: JSON.stringify({ key: k, updated: stamps[k], value: ls.getItem(k) }),
        }).then((r) => { if (r.status === 401) off = true; }).catch(() => { });
    }
    const flush = () => { clearTimeout(timer); for (const k of pending) send(k); pending.clear(); };
    function changed(k) {
        stamps[k] = Date.now();
        keep();
        if (off) return;
        pending.add(k);
        clearTimeout(timer);
        timer = setTimeout(flush, 1000);
    }
    addEventListener('pagehide', flush);
    // every page script that saves one of these keys goes through localStorage, so watching it here covers them all
    Storage.prototype.setItem = function (k, v) { set.call(this, k, v); if (this === ls && KEYS.includes(k)) changed(k); };
    Storage.prototype.removeItem = function (k) { del.call(this, k); if (this === ls && KEYS.includes(k)) changed(k); };

    fetch('/prefs.php').then((r) => (r.ok ? r.json() : Promise.reject(r.status))).then((acc) => {
        let pulled = false;
        for (const k of KEYS) {
            const a = acc[k], mine = stamps[k] || 0;
            if (a && a.updated > mine) {
                if (a.value === null) del.call(ls, k); else set.call(ls, k, a.value);
                stamps[k] = a.updated;
                pulled = true;
            } else if (mine > (a ? a.updated : 0)) send(k);
        }
        keep();
        // the page read its settings before the account's arrived: start it again with them, once per visit
        try {
            if (pulled && !sessionStorage.getItem('prefs-reloaded')) { sessionStorage.setItem('prefs-reloaded', '1'); location.reload(); }
        } catch (e) { }
    }).catch((status) => { if (status === 401) off = true; });
})();
