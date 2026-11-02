// Small shared helpers. Opt-in: pages load this with
// $site_page['ui'] = true, then use window.UI, e.g. const { $, $$, esc, toast } = UI;
(function () {
    'use strict';
    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => [...r.querySelectorAll(s)];
    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    // localStorage that never throws (private windows, blocked storage)
    const store = {
        get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
        set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } },
    };

    const debounce = (fn, ms = 80) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

    // toast('Saved', 'ok') / toast('Could not load', 'err') / toast('Heads up', 'note')
    function toast(msg, kind = 'note', ms = kind === 'err' ? 9000 : 4000) {
        let box = $('.toasts');
        if (!box) { box = document.createElement('div'); box.className = 'toasts'; box.setAttribute('role', 'status'); document.body.appendChild(box); }
        const el = document.createElement('div');
        el.className = kind;
        el.textContent = msg;
        box.appendChild(el);
        setTimeout(() => el.remove(), ms);
    }

    // copy text; a button gets "Copied!" for a second
    async function copy(text, button) {
        try { await navigator.clipboard.writeText(text); } catch (e) { return false; }
        if (button) { const old = button.textContent; button.textContent = 'Copied!'; setTimeout(() => (button.textContent = old), 1000); }
        return true;
    }

    const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
    // "3 days ago" from a timestamp in ms
    function ago(ms) {
        const s = (ms - Date.now()) / 1000;
        for (const [u, n] of [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]]) {
            if (Math.abs(s) >= n) return rtf.format(Math.round(s / n), u);
        }
        return 'just now';
    }
    // the full date and time for a title="" beside UI.ago: "20 Oct 2026, 2:05 pm" (the site's 12-hour clock)
    const when = (ms) => new Date(ms).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });

    const num = (n, d = 0) => (typeof n === 'number' ? n.toLocaleString(undefined, { maximumFractionDigits: d }) : n);

    window.UI = { $, $$, esc, store, debounce, toast, copy, ago, when, num };
})();
