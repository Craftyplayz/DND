// The initiative tracker (ROADMAP 1.4) for every page, on top of assets/js/live.js. The server decides what each person
// sees (fi_view in includes/initiative.php, through campaigns/fight.php); this file only draws it and sends the DM's changes.
//   Fight.strip(campaignId, characterId, roll)   the player sheet: until this character has rolled into the running fight,
//                                                a "Roll initiative" prompt under the top bar (calls roll()); nothing else
//   Fight.panel(el, campaignId, {controls, brief, onHp, onChange})   the tracker: on the battle map page with controls (the DM
//                                                runs it there, ROADMAP 1.6), on the campaign page and the players' map without
//                                                (players see the order and "Your turn" / "You're up next"; the DM also sees
//                                                numbers and can change monster HP), on the Monster Sheet brief (a link to the
//                                                map; its list's "Add to fight" buttons still work). onHp(monster id, op) changes
//                                                HP (default: sheets/monster/cloud.php?hp=); onChange(fight) after each load;
//                                                extra() adds the page's own controls (the Monster Sheet's monster picker);
//                                                link: markup beside the DM's heading (the campaign page's "Run the fight", ROADMAP 1.9).
//   Fight.state(campaignId) -> the fight as last loaded, or null
//   Fight.act(campaignId, op, extra) -> a DM change (refused with "This fight changed, reloaded" if it changed meanwhile)
//   Fight.tag(campaignId, title, monsterId) -> what an initiative roll adds to the roll it sends ({fight, mon})
window.Fight = (() => {
    'use strict';
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    const toast = (t, k) => window.UI?.toast(t, k);
    const W = {}; // campaign id -> {f, offline, views: Set of redraw functions, watch}

    function room(c) {
        if (W[c]) return W[c];
        const w = W[c] = { f: null, skew: 0, offline: false, views: new Set() };
        w.load = async () => {
            try {
                // the Table view (1.7) asks as the table, so it gets what players get
                const r = await fetch('/campaigns/fight.php?c=' + encodeURIComponent(c) + (window.Live?.as ? '&as=' + window.Live.as : ''), { cache: 'no-store' });
                if (!r.ok) throw new Error(r.status);
                w.f = (await r.json()).fight;
                if (w.f) w.skew = w.f.now - Date.now();
                w.offline = false;
            } catch (e) { w.offline = true; }
            draw(w);
        };
        w.watch = window.Live?.watch(c, {
            load: w.load,
            // char: a player's sheet changed (DMs only), so their HP may have
            // status: a party character went down, got up, or its death saves or conditions changed (1.7)
            onMessage(m) { if (m.type === 'fight' || m.type === 'campaign' || m.type === 'status' || (m.type === 'char' && w.f?.party)) w.load(); else if (m.type === 'removed') { w.f = null; draw(w); } },
        });
        if (!w.watch) w.load();
        return w;
    }
    const draw = (w) => w.views.forEach((v) => v());
    addEventListener('online', () => Object.values(W).forEach((w) => w.load()));
    addEventListener('offline', () => Object.values(W).forEach(draw));
    const state = (c) => W[c]?.f || null;
    const tag = (c, title, mon) => (/^Initiative\b/.test(title) && state(c) ? { fight: state(c).n, ...(mon ? { mon } : {}) } : {});

    async function act(c, op, extra = {}) {
        const w = room(c);
        try {
            const r = await fetch('/campaigns/api.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ act: 'fight', id: c, op, v: w.f?.v, ...extra }) });
            const out = await r.json().catch(() => ({}));
            if (!r.ok) toast(out.error || "Couldn't save that. Try again.", 'err');
            await w.load();
            return r.ok;
        } catch (e) { toast("Couldn't reach the site. Check your connection and try again.", 'err'); return false; }
    }
    // c: the campaign, so a co-DM can change the HP of the DM's monsters (and the other way round)
    async function hpPost(mon, op, c) {
        try {
            const r = await fetch('/sheets/monster/cloud.php?hp=' + encodeURIComponent(mon) + '&c=' + encodeURIComponent(c), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op }) });
            if (!r.ok) toast((await r.json().catch(() => ({}))).error || "Couldn't change the hit points. Try again.", 'err');
        } catch (e) { toast("Couldn't reach the site. Check your connection and try again.", 'err'); }
    }

    // ---- drawing ----
    const initials = (n) => String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase();
    // a hidden monster's turn (kind "dm") is only a DM's turn card, never the monster
    const face = (e) => e.kind === 'dm' ? '<span class="fi-face fi-dm" aria-hidden="true">DM</span>' : `<span class="fi-face">${e.art ? `<img src="${esc(e.art)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}<span aria-hidden="true">${esc(initials(e.name))}</span></span>`;
    const STATUS = { healthy: ['Healthy', 'g'], bloodied: ['Bloodied', 'r'], down: ['Down', ''] };
    // party characters (1.7): Down with death-save ticks, and conditions as icons (assets/js/conds.js), for everyone; never HP
    const status = (e) => (e.kind === 'monster' ? `<span class="badge ${STATUS[e.status][1]}">${STATUS[e.status][0]}</span>`
        : e.kind === 'pc' ? (e.down ? '<span class="badge r">Down</span>' + (window.Conds?.saves(e.saves) || '') : '') + (window.Conds?.row(e.conds) || '') : '');
    const isDown = (e) => (e.kind === 'monster' && e.status === 'down') || (e.kind === 'pc' && !!e.down);
    // time since round 1 (m:ss or h:mm:ss), on the server's clock
    function clock(at, skew) {
        const s = Math.max(0, Math.floor((Date.now() + skew - at) / 1000));
        return (Math.floor(s / 3600) ? `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}` : Math.floor(s / 60)) + ':' + String(s % 60).padStart(2, '0');
    }
    const skewOf = (f) => Object.values(W).find((w) => w.f === f)?.skew || 0;
    const head = (f, extra = '') => `<div class="fi-top"><b>${f.phase === 'rolling' ? 'Rolling initiative' : 'Round ' + f.round}</b>${f.startedAt ? `<span class="fi-time" data-fi-time="${f.startedAt}" data-skew="${skewOf(f)}" title="Time since round 1">${clock(f.startedAt, skewOf(f))}</span>` : ''}${extra}</div>`;
    const row = (f) => `<ol class="fi-row" aria-label="Turn order">${f.entries.map((e) => `<li class="fi-p${e.id === f.turn ? ' on' : ''}${isDown(e) ? ' down' : ''}${e.mine ? ' mine' : ''}"${e.id === f.turn ? ' aria-current="true"' : ''}>${face(e)}<span class="fi-n">${esc(e.name)}</span>${status(e)}</li>`).join('')}</ol>`;
    setInterval(() => document.querySelectorAll('[data-fi-time]').forEach((el) => { el.textContent = clock(+el.dataset.fiTime, +el.dataset.skew); }), 1000);

    // ---- the player sheet's strip ----
    let stripOn = null; // {c, char, roll, w, draw}
    function strip(c, char, roll) {
        if (stripOn && stripOn.c === c && stripOn.char === char) { stripOn.roll = roll; return; }
        if (stripOn) { stripOn.w.views.delete(stripOn.draw); document.getElementById('hb-fight')?.remove(); }
        stripOn = null;
        if (!c) return;
        const s = stripOn = { c, char, roll, w: room(c) };
        // the order and turns belong on the VTT (owner, 2026-11-03): the sheet only asks this character to roll in,
        // and the prompt goes once it has (the server drops it from canRoll)
        s.draw = () => {
            const f = s.w.f;
            let el = document.getElementById('hb-fight');
            if (!f || !f.canRoll.includes(char)) { el?.remove(); return; }
            if (!el) {
                document.getElementById('hb-bar').insertAdjacentHTML('afterend', '<div class="fi-strip" id="hb-fight" role="region" aria-label="Fight"></div>');
                el = document.getElementById('hb-fight');
                el.addEventListener('click', (ev) => { const b = ev.target.closest('[data-fi=roll]'); if (b) { b.disabled = true; s.roll(); } });
            }
            el.innerHTML = `<p class="fi-roll">${f.phase === 'rolling' ? 'The DM started a fight.' : 'A fight is on.'} <button type="button" class="btn small primary" data-fi="roll">Roll initiative</button></p>`;
        };
        s.w.views.add(s.draw);
        s.draw();
    }

    // ---- the tracker panel ----
    const panels = new Map(); // element -> {c, opts, w, draw}
    function panel(el, c, opts = {}) {
        const old = panels.get(el);
        if (old && old.c === c) { old.opts = opts; return old.draw(); }
        if (old) old.w.views.delete(old.draw);
        panels.delete(el);
        el.hidden = true;
        el.innerHTML = '';
        if (!c) return;
        const p = { c, opts, w: room(c) };
        p.draw = () => { drawPanel(el, p); p.opts.onChange?.(p.w.f); };
        panels.set(el, p);
        p.w.views.add(p.draw);
        if (!el.dataset.fiWired) { el.dataset.fiWired = '1'; wire(el); }
        p.draw();
    }
    function drawPanel(el, p) {
        const f = p.w.f, ctl = !!p.opts.controls, off = p.w.offline || !navigator.onLine;
        const dis = off ? ' disabled' : '';
        const note = off ? '<p class="note fi-off">Offline, changes paused.</p>' : '';
        // keep what the DM is typing when a live update redraws the panel
        if (el.contains(document.activeElement) && document.activeElement.matches('input')) { p.skipped = true; return; }
        p.skipped = false;
        // the Monster Sheet (brief): the fight is run from the battle map now (ROADMAP 1.6), so only a link there
        if (p.opts.brief) {
            el.hidden = false;
            el.innerHTML = `<h2>Fight</h2><p>${f ? (f.phase === 'rolling' ? 'Rolling initiative.' : `Round ${f.round}.`) : 'No fight running.'} <a class="btn small primary" href="/campaigns/${esc(p.c)}/map">${f ? 'Run it on the map' : 'Start one on the map'}</a></p>`;
            return;
        }
        if (!f) {
            el.hidden = !ctl;
            el.innerHTML = ctl ? `<h2>Fight</h2>${note}<p class="muted">No fight running. Players get a notice to roll initiative when you start one.</p><p><button type="button" class="btn primary" data-fi="start"${dis}>Start fight</button></p>` : '';
            return;
        }
        el.hidden = false;
        if (!f.party) { // a player: the order only, with a notice when their turn is now or next
            const mine = (id) => f.entries.find((e) => e.id === id)?.mine;
            const you = mine(f.turn) ? 'Your turn' : mine(f.next) ? "You're up next" : '';
            el.innerHTML = '<h2>Fight</h2>' + (you ? `<p class="note fi-you" role="status">${you}</p>` : '') + head(f) + row(f);
            return;
        }
        // players' HP changes go to their sheets as DM edits (ROADMAP 1.5, sheets/player/dmedit.js)
        const hpForm = (e) => (e.kind === 'monster' && !e.missing ? `<form class="fi-hp" data-mon="${esc(e.mon)}"><input class="field" inputmode="decimal" aria-label="Amount for ${esc(e.name)}" placeholder="5"${dis}><button class="btn small" value="dmg"${dis}>Damage</button><button class="btn small" value="heal"${dis}>Heal</button></form>`
            : e.kind === 'pc' && e.hp && e.char && window.hbDm?.send ? `<form class="fi-hp" data-char="${esc(e.char)}"><input class="field" inputmode="decimal" aria-label="Amount for ${esc(e.name)}" placeholder="5"${dis}><button class="btn small" value="dmg"${dis}>Damage</button><button class="btn small" value="heal"${dis}>Heal</button><button class="btn small" value="temp"${dis}>Temp</button></form>` : '');
        const info = (e) => (e.kind === 'monster' ? (e.hp ? `HP ${e.hp.cur}/${e.hp.max}${e.hp.temp ? ` +${e.hp.temp} temp` : ''}` : '') + (e.ac != null ? ` · AC ${e.ac}` : '')
            : e.kind === 'pc' && e.hp ? `HP ${e.hp.cur}${e.hp.max ? '/' + e.hp.max : ''}${e.hp.temp ? ` +${e.hp.temp} temp` : ''}` : '');
        const badges = (e) => status(e) + (e.hidden ? '<span class="badge p">Hidden</span>' : '') + (e.archived ? '<span class="badge">Archived</span>' : '') + (e.missing ? '<span class="badge">Monster gone</span>' : '')
            + (e.kind === 'pc' && e.secret ? '<span class="badge p">to DM</span>' : '');
        const num = (e) => (ctl ? `<input class="field fi-init" type="number" value="${e.init ?? ''}" data-fe="${esc(e.id)}" aria-label="Initiative for ${esc(e.name)}" placeholder="?"${dis}>` : `<b class="fi-init">${e.init ?? '?'}</b>`);
        const tools = (e, i) => (ctl ? `<span class="fi-tools"><button type="button" class="btn small" data-fi="move" data-fe="${esc(e.id)}" data-dir="-1" aria-label="Move ${esc(e.name)} up"${i && !off ? '' : ' disabled'}>↑</button><button type="button" class="btn small" data-fi="move" data-fe="${esc(e.id)}" data-dir="1" aria-label="Move ${esc(e.name)} down"${i < f.entries.length - 1 && !off ? '' : ' disabled'}>↓</button>`
            + (e.kind === 'monster' ? `<button type="button" class="btn small" data-fi="hide" data-fe="${esc(e.id)}" aria-pressed="${!!e.hidden}"${dis}>${e.hidden ? 'Reveal' : 'Hide'}</button>` : '')
            + `<button type="button" class="btn small" data-fi="remove" data-fe="${esc(e.id)}"${dis}>Remove</button></span>` : '');
        el.innerHTML = `<h2>Fight${p.opts.link || ''}</h2>${note}${head(f)}
            <ol class="fi-list">${f.entries.map((e, i) => `<li class="fi-e${e.id === f.turn ? ' on' : ''}${isDown(e) ? ' down' : ''}${e.hidden ? ' hid' : ''}"${e.id === f.turn ? ' aria-current="true"' : ''}>
                ${num(e)}${face(e)}<span class="fi-who"><b>${esc(e.name)}</b> ${badges(e)}<small class="muted">${info(e)}</small></span>${hpForm(e)}${tools(e, i)}</li>`).join('') || '<li class="muted">Nobody yet. Players who roll initiative appear here.</li>'}</ol>
            ${ctl ? `<div class="actions fi-ctl">${f.phase === 'rolling' ? `<button type="button" class="btn primary" data-fi="round1"${f.entries.length && !off ? '' : ' disabled'}>Start round 1</button>`
                : `<button type="button" class="btn" data-fi="prev"${dis}>Previous</button><button type="button" class="btn primary" data-fi="next"${dis}>Next turn</button>`}
                <button type="button" class="btn" data-fi="end"${dis}>End fight</button></div>
            <form class="fi-add" data-fi-add="pc">${f.party.length ? `<select class="field" aria-label="Party character">${f.party.map((x) => `<option value="${esc(x.char)}">${esc(x.name)}</option>`).join('')}</select><button class="btn small"${dis}>Add character</button>` : ''}</form>
            ${p.opts.extra?.() || ''}
            <form class="fi-add" data-fi-add="plain"><input class="field" name="name" placeholder="Lair action" aria-label="Name of an extra entry"${dis}><input class="field fi-init" name="init" type="number" placeholder="20" aria-label="Its initiative"${dis}><button class="btn small"${dis}>Add entry</button></form>` : ''}`;
    }
    function wire(el) {
        const p = () => panels.get(el);
        el.addEventListener('focusout', () => setTimeout(() => { if (p()?.skipped && !el.contains(document.activeElement)) p().draw(); }));
        el.addEventListener('click', async (ev) => {
            const b = ev.target.closest('[data-fi]');
            if (!b || !p()) return;
            const op = b.dataset.fi, c = p().c;
            if (op === 'end') return confirmEnd(() => act(c, 'end'));
            b.disabled = true;
            await act(c, op, { e: b.dataset.fe, dir: +b.dataset.dir || 0, on: b.getAttribute('aria-pressed') !== 'true' });
        });
        el.addEventListener('change', (ev) => {
            const i = ev.target.closest('.fi-init[data-fe]');
            if (!i || !p()) return;
            i.blur();
            act(p().c, 'init', { e: i.dataset.fe, value: i.value === '' ? null : +i.value });
        });
        el.addEventListener('submit', async (ev) => {
            ev.preventDefault();
            const form = ev.target, c = p()?.c;
            if (!c) return;
            if (form.matches('.fi-hp')) {
                const n = Math.abs(+form.querySelector('input').value || 0);
                if (!n) return form.querySelector('input').focus();
                const k = ['heal', 'temp'].includes(ev.submitter?.value) ? ev.submitter.value : 'dmg';
                form.querySelector('input').value = '';
                document.activeElement?.blur();
                if (form.dataset.char) { // a player: a DM edit, applied by their sheet with its HP rules
                    await window.hbDm.send(c, form.dataset.char, [{ op: 'hp', how: k, amt: n, t: k === 'dmg' ? `−${n} HP` : k === 'heal' ? `+${n} HP` : `${n} temp HP` }]);
                    return p()?.w.load();
                }
                return (p().opts.onHp || hpPost)(form.dataset.mon, { k: k === 'heal' ? 'heal' : 'dmg', n }, c);
            }
            const kind = form.dataset.fiAdd;
            const item = kind === 'pc' ? { kind, char: form.querySelector('select').value } : { kind, name: form.name.value, init: form.init.value === '' ? null : +form.init.value };
            document.activeElement?.blur();
            if (await act(c, 'add', { items: [item] }) && kind === 'plain') form.reset();
        });
    }
    // the yes/no before ending a fight
    function confirmEnd(yes) {
        let d = document.getElementById('fi-ask');
        if (!d) {
            document.body.insertAdjacentHTML('beforeend', `<dialog class="dlg" id="fi-ask" aria-labelledby="fi-ask-t"><h2 id="fi-ask-t">End this fight?</h2>
                <p>The order and rounds are kept in the campaign's past fights, and everyone's tracker closes.</p>
                <div class="actions"><button type="button" class="btn" value="no">Cancel</button><button type="button" class="btn primary" value="yes">End fight</button></div></dialog>`);
            d = document.getElementById('fi-ask');
            d.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { d.close(); if (b.value === 'yes') d.yes?.(); } });
        }
        d.yes = yes;
        d.showModal();
    }
    return { strip, panel, state, act, tag, load: (c) => room(c).load() };
})();
