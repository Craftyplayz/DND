// Phone play mode for the two sheets (ROADMAP 2.1, /design). Below 700 px wide, or a phone on its side, a sheet draws a header
// that stays on top, five tabs at the bottom and bottom sheets instead of its top bar. It's the same sheet code: the panels,
// fields and actions are the sheet's own, this file only frames them. A sheet calls Phone.start(api), see "api" below, and
// checks Phone.on() where its drawing differs. Desktop never runs any of this but Phone.on().
// Also here: Phone.pullOnReturn, which both sheets use whatever the width, for coming back to an open sheet (Q110).
(function () {
    'use strict';
    const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const svg = (d, s = 22) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
    const I = { menu: 'M4 7h16M4 12h16M4 17h16', map: 'M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14', prev: 'M15 5l-7 7 7 7', next: 'M9 5l7 7-7 7', x: 'M6 6l12 12M18 6 6 18',
        main: 'M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z', actions: 'M14 4h6v6L9 21l-3-3-3 1 1-3-1-3zM6 12l6 6', spells: 'M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2zM19 3v4M17 5h4', items: 'M6 8h12l1 12H5zM9 8V6a3 3 0 0 1 6 0v2', notes: 'M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7' };
    const TABS = [['main', 'Main'], ['actions', 'Actions'], ['spells', 'Spells'], ['items', 'Items'], ['notes', 'Notes']];
    // which tab each kind of panel lives in; a new kind of panel in model.js must be added here (the check fails otherwise)
    const MAP = { profs: 'main', combat: 'main', attacks: 'actions', trackers: 'actions', list: 'actions', homebrew: 'actions', spells: 'spells', items: 'items', notes: 'notes', handouts: 'notes', details: 'notes', text: 'notes' };
    const FULL = 'sheet-full-layout'; // the "full layout" choice, a setting that follows the account (sync.js, prefs.php)
    const fullOn = () => { try { return !!localStorage.getItem(FULL); } catch (e) { return false; } };
    // below 700 px, or on its side: a short window on a screen that's itself phone-sized, so a short desktop window stays as it is
    const small = () => innerWidth < 700 || (innerHeight <= 500 && innerWidth <= 1000 && Math.min(screen.width, screen.height) <= 500);
    const on = () => small() && !fullOn();
    let A = null, kind = '', arg = null, sh = null, body = null, main = null, wasOn = false;
    const tabY = {};

    const tabs = () => TABS.filter(([k]) => !A.monster || !['spells', 'items'].includes(k) || A.visible().some(([p]) => MAP[p.type] === k && p.rows.length));
    const curTab = () => { const t = A.C().view.phoneTab; return tabs().some(([k]) => k === t) ? t : 'main'; };
    // Resources go on top of Actions until the panels have been moved: an order that's still the default order lifts them
    function inTab(k) {
        const vis = A.visible().filter(([p]) => MAP[p.type] === k), all = A.C().panels.map((p) => p.type), def = A.defaultOrder();
        const moved = def.filter((t) => all.includes(t)).join() !== all.filter((t, i) => def.includes(t) && all.indexOf(t) === i).join();
        return k === 'actions' && !moved ? [...vis.filter(([p]) => p.type === 'trackers'), ...vis.filter(([p]) => p.type !== 'trackers')] : vis;
    }
    const jumpBar = (items) => (items.length > 1 ? `<div class="stabs ph-jump">${items.map(([id, t]) => `<button type="button" data-ph="jump" data-id="${esc(id)}">${esc(t)}</button>`).join('')}</div>` : '');

    // the sheet's own content for the open tab
    function mainHTML() {
        const k = curTab();
        if (k !== 'main') {
            const ps = inTab(k);
            return jumpBar(ps.map(([p]) => ['hb-p-' + p.id, p.title])) + (ps.map(A.card).join('') || `<p class="note">Every panel here is hidden. Turn them back on in Customise.</p>`);
        }
        const t = A.parts(), ps = inTab('main'), down = A.head().cur <= 0, combat = ps.filter(([p]) => p.type === 'combat'), rest = ps.filter(([p]) => p.type !== 'combat');
        const cId = combat[0] ? 'hb-p-' + combat[0][0].id : '';
        const jump = jumpBar([...(down && cId ? [[cId, 'Death saves']] : []), ['ph-abil', 'Abilities'], ['ph-saves', 'Saves'], ...rest.map(([p]) => ['hb-p-' + p.id, p.type === 'profs' ? 'Skills' : p.title]), ['ph-senses', 'Senses'], ...(!down && cId ? [[cId, 'Death saves']] : [])]);
        return `${jump}${down ? combat.map(A.card).join('') : ''}${t.pins}<section class="card ph-sec" id="ph-abil"><h2>Abilities${A.ro() ? '' : `<button type="button" class="hb-x ph-tool" data-ph="abedit" aria-pressed="${!!A.abEdit}" aria-label="${A.abEdit ? 'Done editing scores' : 'Edit ability scores'}">${A.abEdit ? 'Done' : A.pencil}</button>`}</h2>${t.abils}</section>
            <div class="ph-sec" id="ph-saves">${t.saves}</div>${rest.map(A.card).join('')}<div class="ph-sec" id="ph-senses">${t.senses}</div>${down ? '' : combat.map(A.card).join('')}
            ${A.ro() ? '' : '<div class="ph-rests"><button type="button" class="btn" data-act="rest" data-r="short">Short rest</button><button type="button" class="btn" data-act="rest" data-r="long">Long rest</button></div>'}`;
    }

    // the header and the tab bar, drawn with each draw and whenever the map link changes
    function frame() {
        if (!on()) return;
        const h = A.head(), map = A.map();
        const step = (d, id) => `<button type="button" class="ph-ico" ${id ? `data-act="side" data-id="${esc(id)}"` : 'disabled'} aria-label="${d < 0 ? 'Previous' : 'Next'} monster">${svg(d < 0 ? I.prev : I.next)}</button>`;
        $('#ph-head').innerHTML = `<div class="ph-h1"><button type="button" class="ph-ico" data-ph="menu" aria-label="Menu">${svg(I.menu)}</button>
            ${A.monster ? step(-1, h.prev) : ''}<button type="button" class="ph-name" data-ph="${A.monster ? 'enc' : 'menu'}" aria-label="${A.monster ? 'Open the encounter list' : 'Open the menu'}"><b class="ph-ell" data-c="phname"></b><small class="ph-ell" data-c="phsub"></small></button>${A.monster ? step(1, h.next) : ''}
            ${map ? `<a class="ph-ico" href="${esc(map)}" target="_blank" rel="noopener" aria-label="Open the battle map" title="Map">${svg(I.map)}</a>` : ''}</div>
            <div class="ph-h2"><button type="button" class="ph-stat ph-hp" id="ph-hp" data-ph="hp"><span class="ph-hpline"><b data-c="phcur"></b><span>/ <span data-c="hpmax"></span></span><span class="ph-temp" data-c="phtemp"></span></span><span class="hb-hpbar" aria-hidden="true"><i id="hb-hpbar"></i><i id="hb-tempbar"></i></span></button>
            <button type="button" class="ph-stat" data-ph="ac" aria-label="Armour class"><small>AC</small><b data-c="fx:ac"></b></button>
            ${h.noRoll ? '<span class="ph-stat"><small>Init</small><b data-c="fs:init"></b></span>' : '<button type="button" class="ph-stat" data-act="roll" data-k="fs:init" data-t="Initiative" aria-label="Roll initiative"><small>Init</small><b data-c="fs:init"></b></button>'}
            <button type="button" class="ph-stat" id="ph-cond" data-ph="cond" aria-label="Conditions"><small>Cond</small><b data-c="phcond"></b></button></div>`;
        const cur = curTab(), ic = I;
        $('#ph-tabs').innerHTML = tabs().map(([k, t]) => `<button type="button" class="${k === cur ? 'on' : ''}" data-ph="tab" data-id="${k}"${k === cur ? ' aria-current="page"' : ''}>${svg(ic[k], 20)}<span>${t}</span></button>`).join('');
        document.documentElement.style.setProperty('--phh', $('#ph-head').offsetHeight + 'px');
    }

    // ---- bottom sheets; the phone's Back closes them ----
    const SIZE = { hp: '', ac: '', cond: 'half', dice: 'half', menu: 'half', enc: 'half', info: 'full' };
    const TITLE = { hp: 'Hit points', ac: 'Armour class', cond: 'Conditions', dice: 'Dice and rolls', menu: 'Menu', enc: 'Encounter', info: 'Details' };
    function fill() {
        if (!kind || kind === 'enc') return;
        const y = body.scrollTop, amt = $('#hb-amt')?.value, f = document.activeElement?.dataset?.k;
        body.innerHTML = kind === 'info' ? arg : ({ hp: A.hpSheet, ac: A.acSheet, cond: A.condSheet, dice: A.diceSheet, menu: A.menuSheet })[kind]();
        if (amt) $('#hb-amt').value = amt;
        if (kind === 'menu') { const slot = $('#ph-auth'), a = $('#hb-bar .auth'); if (slot && a) slot.append(a); }
        body.scrollTop = y;
        if (f) $(`#ph-body [data-k="${CSS.escape(f)}"]`)?.focus();
    }
    // the sign-in widget lives in the top bar until the menu shows it
    function authBack() { const a = $('#ph-auth .auth'); if (a) $('#hb-bar').append(a); }
    // toasts and roll cards have to be inside the open sheet to show over it
    function place() {
        const t = $('.toasts'), r = $('#hb-rolls');
        if (sh.open) { sh.append(...[t, r].filter(Boolean)); return; }
        if (t && t.parentNode !== document.body) document.body.append(t);
        if (r && r.parentNode === sh) $('.hb-dice').prepend(r);
    }
    function open(k, a) {
        if (k !== 'enc' && kind === 'menu') authBack();
        kind = k; arg = a;
        sh.className = 'bsheet ' + (SIZE[k] || '');
        $('#ph-title').textContent = TITLE[k];
        $('#ph-enc').hidden = k !== 'enc'; body.hidden = k === 'enc';
        fill(); A.refresh();
        if (!sh.open) { sh.showModal(); history.pushState({ phSheet: 1 }, ''); place(); }
        if (k === 'hp') setTimeout(() => $('#hb-amt')?.focus(), 60);
    }
    function shut() { if (sh && sh.open) { sh.close(); afterShut(); } }
    function afterShut() { authBack(); kind = ''; arg = null; body.innerHTML = ''; place(); A.draw(); }
    const close = () => { if (!sh?.open) return; if (history.state?.phSheet) history.back(); else shut(); };

    // ---- moving in and out of phone mode (rotating, resizing, the full layout switch) ----
    function sync() {
        const now = on();
        document.documentElement.classList.toggle('ph-on', now);
        const side = $('#mon-side'), fight = $('#mon-fight');
        if (now && !wasOn && side) $('#ph-enc').append(...[fight, side].filter(Boolean));
        if (!now && wasOn) {
            shut();
            if (side) { $('.mon-wrap').prepend(side); if (fight) $('.mon-wrap').before(fight); }
        }
        const moved = now !== wasOn;
        wasOn = now;
        return moved;
    }
    const fullSwitch = () => (small() ? `<label class="check ph-full"><input type="checkbox" data-ph-full${fullOn() ? ' checked' : ''}> Use the full layout on this phone</label>` : '');

    function start(api) {
        A = api; main = $('#main');
        main.insertAdjacentHTML('afterbegin', '<header class="ph-head" id="ph-head"></header>');
        main.insertAdjacentHTML('beforeend', `<nav class="tabbar" id="ph-tabs" aria-label="Sheet sections"></nav>
            <dialog class="bsheet" id="ph-sheet" aria-labelledby="ph-title"><div class="bsheet-grab" data-grab aria-hidden="true"><i></i></div>
                <div class="bsheet-top"><h2 id="ph-title"></h2><button type="button" class="ph-ico" data-ph="close" aria-label="Close">${svg(I.x)}</button></div>
                <div class="bsheet-body" id="ph-body"></div><div class="bsheet-body" id="ph-enc" hidden></div></dialog>`);
        sh = $('#ph-sheet'); body = $('#ph-body');
        if (!$('.toasts')) { const box = document.createElement('div'); box.className = 'toasts'; box.setAttribute('role', 'status'); document.body.appendChild(box); }
        sh.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
        sh.addEventListener('click', (e) => { if (e.target === sh) close(); });
        addEventListener('popstate', () => { if (sh.open) shut(); });
        // drag the handle: up goes to full height, down back to half and then closed
        sh.addEventListener('pointerdown', (e) => {
            if (!e.target.closest('[data-grab]')) return;
            const y0 = e.clientY; let dy = 0;
            const move = (m) => { dy = m.clientY - y0; if (dy > 0) sh.style.transform = `translateY(${dy}px)`; };
            const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); sh.style.transform = '';
                if (dy < -40) { sh.classList.remove('half'); sh.classList.add('full'); }
                else if (dy > 70) { if (sh.classList.contains('full') && SIZE[kind] === 'half') { sh.classList.remove('full'); sh.classList.add('half'); } else close(); } };
            addEventListener('pointermove', move); addEventListener('pointerup', up);
        });
        main.addEventListener('click', (e) => {
            const b = e.target.closest('[data-ph]');
            if (b) {
                const a = b.dataset.ph, id = b.dataset.id;
                if (a === 'tab') {
                    const c = A.C(); tabY[c.id + curTab()] = scrollY;
                    c.view.phoneTab = id;
                    A.saveView(); // never an edit, so never a new "updated"
                    A.draw(); scrollTo(0, tabY[c.id + id] || 0);
                } else if (a === 'jump') $('#' + CSS.escape(id))?.scrollIntoView({ block: 'start' });
                else if (a === 'close') close();
                else if (a === 'abedit') { A.abEdit = !A.abEdit; const y = scrollY; A.draw(); scrollTo(0, y); }
                else open(a);
                return;
            }
            // the DM bar and the "in several campaigns" notice: one line until tapped
            const n = e.target.closest('#hb-dmbar, #hb-camps');
            if (n && !e.target.closest('button, a, input, select')) n.classList.toggle('ph-open');
        });
        main.addEventListener('change', (e) => {
            if (!('phFull' in e.target.dataset)) return;
            try { if (e.target.checked) localStorage.setItem(FULL, '1'); else localStorage.removeItem(FULL); } catch (x) { }
            modeChanged();
        });
        // Enter on the HP amount closes the keyboard; it never applies damage by accident
        main.addEventListener('keydown', (e) => { if (on() && e.key === 'Enter' && e.target.id === 'hb-amt') { e.preventDefault(); e.target.blur(); } });
        // the tab bar and dice button hide while typing on the sheet, so the keyboard leaves room
        main.addEventListener('focusin', (e) => { if (e.target.closest('#hb-sheet') && e.target.matches('input:not([type=checkbox]), textarea')) document.documentElement.classList.add('ph-typing'); });
        main.addEventListener('focusout', () => document.documentElement.classList.remove('ph-typing'));
        // the on-screen keyboard covers the bottom of the screen without moving it on most phones: lift the sheet above it
        if (window.visualViewport) { const vv = () => document.documentElement.style.setProperty('--kb', Math.max(0, Math.round(innerHeight - visualViewport.height - visualViewport.offsetTop)) + 'px'); visualViewport.addEventListener('resize', vv); visualViewport.addEventListener('scroll', vv); }
        // not while typing: an on-screen keyboard can resize the window
        addEventListener('resize', () => { if (!document.activeElement?.matches('input, textarea, select')) modeChanged(); if (on()) document.documentElement.style.setProperty('--phh', $('#ph-head').offsetHeight + 'px'); });
        sync();
    }
    function modeChanged() { if (sync()) { A.draw(); scrollTo(0, 0); } }

    // Coming back to an open sheet, signed in: the account's newer copies are taken, before anything goes up from this one.
    // o: { url, chars(), normalise, current(), adopt(c), off(), draw(), store(), keep(mine) restores this copy, toast, offerUndo, after(list) }
    let pulling = null;
    function pullOnReturn(o) {
        let seen = {}; // what each copy stood at when the page went out of view: a later stamp is an edit made since
        const run = async () => {
            const sig = AbortSignal.timeout ? { signal: AbortSignal.timeout(8000) } : {};
            const r = await fetch(o.url, sig);
            if (r.status === 401) return o.off();
            if (!r.ok) return;
            const list = await r.json();
            let got = false, overtook = null;
            for (const [id, up] of Object.entries(list.chars || {})) {
                const mine = o.chars()[id];
                // up to date, unless this copy was edited in the moment since it came back, on top of an older copy
                if (mine && mine.updated >= up && !(seen[id] < up && mine.updated > seen[id])) continue;
                const g = await fetch(o.url + '?id=' + encodeURIComponent(id), sig);
                if (!g.ok) continue;
                const c = o.normalise(await g.json());
                if (mine) {
                    // rolls never count as an edit, so one made here isn't in the account's copy: both logs are kept
                    const all = new Map([...(c.rolls || []), ...(mine.rolls || [])].map((x) => [x.at + '|' + x.title, x]));
                    c.rolls = [...all.values()].sort((a, b) => b.at - a.at).slice(0, 100);
                    c.view.phoneTab = mine.view.phoneTab; // stays on the tab it's on
                    if (mine.updated >= up && o.current().id === id) overtook = mine;
                }
                o.chars()[id] = c;
                if (o.current().id === id) o.adopt(c);
                got = true;
            }
            if (o.after) o.after(list);
            if (!got) return;
            o.store(); o.draw();
            if (overtook) o.offerUndo('A newer copy came from your account, so your last change here wasn\'t kept.', () => o.keep(overtook));
            else o.toast('Updated from your account.', 'note');
        };
        const go = () => { if (pulling) return; pulling = run().catch(() => { }).finally(() => { pulling = null; o.flush(); }); };
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') { seen = {}; for (const [id, c] of Object.entries(o.chars())) seen[id] = c.updated; }
            else if (o.cloud()) go();
        });
        addEventListener('pageshow', (e) => { if (e.persisted && o.cloud()) go(); });
    }

    window.Phone = {
        MAP, on, small, start, frame, fill, open, shut, close, mainHTML, fullSwitch, kind: () => kind, pullOnReturn, pulling: () => !!pulling,
        tabName: (type) => (TABS.find(([k]) => k === MAP[type]) || [])[1] || '',
        // the sheet's details drawer on a phone
        info: (html) => open('info', html),
        // the sheet's jump to a panel: go to its tab too
        showPanel: (type) => { if (A) A.C().view.phoneTab = MAP[type]; },
    };
})();
