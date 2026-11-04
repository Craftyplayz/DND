// The Compendium popup (ROADMAP 5.4), on every page whose head is page_head() except the Compendium itself (it sets 'nopopup').
// A floating button bottom right (and Ctrl+K) opens a panel from the right holding /compendium/?embed=1 in a frame, so the
// Compendium's own code runs unchanged. Nothing of it loads until the first open, or the page after it was left open.
// The width and whether it is open live in localStorage "compendium-popup" (synced to the account by sync.js); the last search and entry
// of this tab in sessionStorage "cp-popup-url" (written by compendium.js), so the next page opens where this one stopped.
// Open: a click on a link elsewhere keeps it open (the next page reopens it); a click on the page itself closes it. Esc closes it.
// A phone gets a full-screen overlay from the bottom with an x top left instead (popup.css).
(function () {
    'use strict';
    const KEY = 'compendium-popup', URLKEY = 'cp-popup-url', MIN = 320, DEF = 480;
    const phone = matchMedia('(max-width: 800px)');
    const html = document.documentElement;
    let st = { open: false, w: DEF };
    try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && typeof s === 'object') st = { open: s.open === true, w: Math.max(MIN, +s.w || DEF) }; } catch (e) { }
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { } };
    const width = (w) => Math.round(Math.min(Math.max(w, MIN), Math.max(MIN, innerWidth * 0.9)));

    let fab, panel, frame, opener;
    const isOpen = () => !!panel && panel.classList.contains('open');
    const typing = (t) => !!t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable);
    const dialogOpen = () => !!document.querySelector('dialog[open]');

    function build() {
        fab = document.createElement('button');
        fab.type = 'button'; fab.className = 'cpp-fab'; fab.title = 'Compendium (Ctrl+K)'; fab.setAttribute('aria-label', 'Open the Compendium');
        fab.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v15H5.5A1.5 1.5 0 0 0 4 20.5zM20 5.5A1.5 1.5 0 0 0 18.5 4H13v15h5.5a1.5 1.5 0 0 1 1.5 1.5z"/></svg>';
        fab.addEventListener('click', () => open(true));
        document.body.append(fab);
        html.classList.add('cp-btn');
        place();
        setInterval(place, 500);
        addEventListener('resize', place);
    }
    // the button sits above whatever is fixed in the bottom right: a phone's tab bar, the sheet's dice, the builder's bar, the way back
    function place() {
        let top = innerHeight;
        for (const el of document.querySelectorAll('.tabbar, #ph-tabs, .bd-nav, .hb-dice, .ph-back, .mpt-br')) {
            const r = el.getBoundingClientRect();
            if (r.width && r.height && r.top > innerHeight / 2 && r.top < innerHeight && r.right > innerWidth - 60) top = Math.min(top, r.top);
        }
        const b = top === innerHeight ? 16 : Math.max(16, Math.round(innerHeight - top + 8));
        if (fab.dataset.b !== String(b)) { fab.dataset.b = b; html.style.setProperty('--cp-bottom', b + 'px'); html.style.setProperty('--cp-top', b + 52 + 'px'); }
    }
    function make() {
        panel = document.createElement('aside');
        panel.className = 'cpp'; panel.setAttribute('aria-label', 'Compendium'); panel.inert = true;
        panel.innerHTML = '<div class="cpp-edge" aria-hidden="true"></div><div class="cpp-top"><span>Compendium</span><button type="button" class="cpp-x" aria-label="Close the Compendium" title="Close (Esc)">&times;</button></div>';
        frame = document.createElement('iframe');
        frame.title = 'Compendium';
        let saved = '';
        try { saved = sessionStorage.getItem(URLKEY) || ''; } catch (e) { }
        const q = new URLSearchParams(saved);
        q.set('embed', '1');
        frame.src = '/compendium/?' + q;
        panel.append(frame);
        panel.querySelector('.cpp-x').addEventListener('click', () => close());
        edge(panel.querySelector('.cpp-edge'));
        document.body.append(panel);
    }
    // dragging the left edge sizes the panel (a laptop; the edge is hidden on a phone)
    function edge(el) {
        el.addEventListener('pointerdown', (e) => {
            e.preventDefault(); try { el.setPointerCapture(e.pointerId); } catch (x) { } panel.classList.add('drag');
            const move = (m) => { st.w = width(html.clientWidth - m.clientX); html.style.setProperty('--cpp-w', st.w + 'px'); };
            const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); panel.classList.remove('drag'); save(); };
            addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
        });
    }
    // focus: true when a person asked for it (the search box takes the cursor); a page that was left open reopens without moving focus
    function open(focus) {
        if (isOpen()) return focus && look();
        if (!panel) make();
        opener = document.activeElement;
        st.w = width(st.w); html.style.setProperty('--cpp-w', st.w + 'px');
        panel.inert = false;
        html.classList.add('cp-open'); html.classList.remove('cp-btn');
        fab.hidden = true;
        requestAnimationFrame(() => panel.classList.add('open'));
        st.open = true; save();
        if (focus) look();
    }
    function look() {
        const go = () => { try { const q = frame.contentDocument.getElementById('cp-q'); if (q) { q.focus(); q.select(); return true; } } catch (e) { } return false; };
        if (!go()) frame.addEventListener('load', go, { once: true });
    }
    function close() {
        if (!isOpen()) return;
        panel.classList.remove('open'); panel.inert = true;
        html.classList.remove('cp-open'); html.classList.add('cp-btn');
        fab.hidden = false;
        st.open = false; save();
        if (opener && opener.isConnected && opener !== document.body) opener.focus(); else fab.focus();
    }
    const toggle = () => (isOpen() ? close() : open(true));
    window.cpPopup = { open: () => open(true), close, toggle, isOpen };

    // Ctrl+K opens or closes it; Esc closes it unless a dialog of the page has it; while it's open the page's own keys (the map's, the sheet's) are off
    addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') { e.preventDefault(); e.stopImmediatePropagation(); return toggle(); }
        if (!isOpen()) return;
        if (e.key === 'Escape' && !dialogOpen()) { e.stopImmediatePropagation(); return close(); }
        if (!typing(e.target) && !dialogOpen()) e.stopImmediatePropagation();
    }, true);
    addEventListener('keyup', (e) => { if (isOpen() && !typing(e.target) && !dialogOpen()) e.stopImmediatePropagation(); }, true);
    // a click off the Compendium closes it on a laptop, except on a link that goes to another page: that page reopens it (it is still saved as open)
    document.addEventListener('pointerdown', (e) => {
        if (!isOpen() || phone.matches || panel.contains(e.target) || fab.contains(e.target)) return;
        const a = e.target.closest && e.target.closest('a[href]'), href = a ? a.getAttribute('href') : '';
        if (a && e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey && a.target !== '_blank' && !a.hasAttribute('download') && !/^(#|javascript:)/i.test(href) && !/^\/compendium(\/|$|\?)/.test(href)) return;
        close();
    }, true);

    const start = () => { build(); if (st.open) open(false); };
    if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
