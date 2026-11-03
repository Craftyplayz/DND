// The battle map (ROADMAP 1.6) for the map page (/campaigns/<id>/map, campaigns/map.php) and the campaign page's Map section.
// campaigns/maps.php decides what each person gets (mp_view in includes/maps.php); this file draws it and sends changes.
//   BattleMap.mount(root, campaignId, {dm, me, full})   root holds the parts it fills, each optional: [data-mp=bar] (toolbar),
//       [data-mp=tools] (the DM's fog and grid tools), [data-mp=view] (the map), [data-mp=tray] ("Not placed"),
//       [data-mp=tok] (the DM's picked token), [data-mp=maps] (the DM's map list), [data-mp=fight] (the fight, fight.js),
//       [data-mp=paused]. dm: the DM or a co-DM; me: this player's live key (their own rulers come back to them); full: the
//       map page (the DM's tools), else a view with moving and the ruler only. table: the Table view (ROADMAP 1.7, with Live.as):
//       read-only, nothing to click or drag, names always under the tokens, keys + / - zoom and 0 fits; top(): pixels the
//       strip covers at the top, kept clear when fitting; onDraw(state): after every draw.
// Party tokens show Down with death-save ticks and conditions (assets/js/conds.js) to everyone, never HP.
// Coordinates are the original picture's pixels throughout; the stage is scaled to the screen with one CSS transform.
// Nothing about the view is stored: every open starts at Fit.
window.BattleMap = (() => {
    'use strict';
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    const toast = (t, k) => window.UI?.toast(t, k);
    const SIZES = { T: 0.5, S: 1, M: 1, L: 2, H: 3, G: 4 };
    const SIZE_NAMES = { T: 'Tiny', S: 'Small', M: 'Medium', L: 'Large', H: 'Huge', G: 'Gargantuan' };
    const CHUNK = 4 * 1024 * 1024;
    const initials = (n) => String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase();
    // the squares of a grid over a w x h picture: [x0, y0, columns, rows] (includes/maps.php mp_cells, the same sums)
    const cells = (g, w, h) => {
        const x0 = g.ox > 0 ? g.ox - g.s : 0, y0 = g.oy > 0 ? g.oy - g.s : 0;
        return [x0, y0, Math.max(1, Math.ceil((w - x0) / g.s - 1e-6)), Math.max(1, Math.ceil((h - y0) / g.s - 1e-6))];
    };
    const token = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const throttle = (fn, ms) => { let t = 0, last = null; const run = () => { t = 0; fn(...last); }; return (...a) => { last = a; if (!t) t = setTimeout(run, ms); }; };

    function mount(root, c, opts = {}) {
        const part = (n) => root.querySelector(`[data-mp=${n}]`);
        const view = part('view');
        const S = {
            c, dm: !!opts.dm && !opts.table, full: !!opts.full && !opts.table, table: !!opts.table, me: opts.me || '', v: null, m: null, sel: null, tool: 'move', brush: 'brush', fogMode: 'reveal',
            preview: false, lines: true, armed: false, fog: null, dirty: false, undo: [], gridOk: false, k: 1, tx: 0, ty: 0, fitted: '',
            rulers: {}, mine: null, pick: null, paused: false, failed: false, mons: null,
        };
        // ---- the stage ----
        view.innerHTML = `<div class="mp-stage"><img class="mp-img" alt="" draggable="false"><div class="mp-black" hidden></div><canvas class="mp-fog"></canvas>
            <canvas class="mp-marks"></canvas><div class="mp-grid"></div><div class="mp-toks"></div><svg class="mp-ruler" aria-hidden="true"></svg><div class="mp-box" hidden></div></div>
            <p class="mp-msg muted" hidden></p>`;
        const $ = (s) => view.querySelector(s);
        const stage = $('.mp-stage'), img = $('.mp-img'), black = $('.mp-black'), fogC = $('.mp-fog'), marks = $('.mp-marks'), grid = $('.mp-grid'),
            toks = $('.mp-toks'), svg = $('.mp-ruler'), box = $('.mp-box'), msg = $('.mp-msg');
        const offline = () => S.failed || !navigator.onLine;
        // players' moves pause with the live updates too; the DM's edits only when the site can't be reached
        const canEdit = () => !S.table && !offline() && (S.dm || !S.paused);
        const myView = () => S.dm && !S.preview;

        // ---- loading ----
        async function load() {
            try {
                const r = await fetch('/campaigns/maps.php?c=' + encodeURIComponent(c) + (S.dm && S.sel ? '&m=' + encodeURIComponent(S.sel) : '') + (S.table ? '&as=table' : ''), { cache: 'no-store' });
                if (!r.ok) throw new Error(r.status);
                const v = await r.json();
                const was = S.m;
                S.v = v; S.m = v.map; S.failed = false;
                if (S.dm && !S.sel && S.m) S.sel = S.m.id;
                if (S.dm && S.sel && !S.m && v.active) { S.sel = null; return load(); } // the map opened was archived elsewhere
                // a draft being drawn here stays until it's saved; a new grid or another map starts from the server's
                const same = was && S.m && was.id === S.m.id && JSON.stringify(was.grid) === JSON.stringify(S.m.grid);
                if (S.m && (!same || !S.dirty)) { S.fog = S.m.draft ? S.m.draft.split('') : null; if (!same) S.undo = []; }
                if (!same) S.pick = null;
            } catch (e) { S.failed = true; }
            draw();
        }
        const post = async (body, quiet) => {
            try {
                const r = await fetch('/campaigns/maps.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ c, m: S.m?.id, ...body }) });
                const out = await r.json().catch(() => ({}));
                S.err = r.ok ? '' : out.error || "Couldn't save that. Try again.";
                if (!r.ok && !quiet) toast(S.err, 'err');
                return r.ok ? out : null;
            } catch (e) { S.err = "Couldn't reach the site. Check your connection and try again."; if (!quiet) toast(S.err, 'err'); return null; }
        };

        // ---- drawing ----
        function draw() {
            drawBar(); drawTools(); drawStage(); drawTray(); drawTok(); drawMaps(); drawPaused();
            opts.onDraw?.(S);
        }
        function drawPaused() {
            const el = part('paused');
            if (!el) return;
            el.hidden = !(offline() || S.paused);
            el.textContent = offline() ? (S.dm ? 'Offline, changes paused.' : 'Offline. Live updates paused; moving is paused until the map is back.')
                : S.dm ? 'Live updates paused. Your changes are still saved.' : 'Live updates paused. Moving is paused until they are back.';
        }
        function drawStage() {
            const m = S.m;
            view.classList.toggle('mp-off', !canEdit());
            if (!m) {
                stage.hidden = true; msg.hidden = false;
                msg.textContent = S.failed ? "Couldn't load the map. Check your connection." : S.dm ? (S.v?.maps?.some((x) => !x.archived) ? 'Pick a map from your maps, or upload a new one.' : 'Upload a map picture to start.') : 'No map on the table yet.';
                return;
            }
            stage.hidden = false; msg.hidden = true;
            stage.style.width = m.w + 'px'; stage.style.height = m.h + 'px';
            const src = myView() ? m.img : S.dm ? m.public : m.img;
            if (src) { if (img.getAttribute('src') !== src) img.src = src; img.hidden = false; black.hidden = true; }
            else { img.removeAttribute('src'); img.hidden = true; black.hidden = false; }
            if (S.fitted !== m.id) { S.fitted = m.id; fit(); }
            drawFog(); drawGrid(); drawToks(); drawRulers(); place();
        }
        function place() {
            stage.style.transform = `translate(${S.tx}px, ${S.ty}px) scale(${S.k})`;
            stage.style.setProperty('--k', S.k);
        }
        // the fog: the DM's draft, dark but see-through, with changed squares outlined; players (and "What players see") the
        // last sent fog, solid black with a soft edge (the picture under it is black already; this is only for looks)
        function drawFog() {
            const m = S.m, edit = myView();
            const g = edit ? m.grid : m.sent?.grid, fog = edit ? S.fog : m.sent?.fog;
            marks.hidden = !edit;
            if (!g || !fog) { fogC.hidden = true; return; }
            const [x0, y0, cols, rows] = cells(g, m.w, m.h), r = edit ? 1 : 4;
            Object.assign(fogC.style, { left: x0 + 'px', top: y0 + 'px', width: cols * g.s + 'px', height: rows * g.s + 'px' });
            fogC.hidden = false;
            fogC.classList.toggle('mp-soft', !edit);
            fogC.width = cols * r; fogC.height = rows * r;
            const x = fogC.getContext('2d');
            x.fillStyle = edit ? 'rgb(0 0 0 / .6)' : 'rgb(0 0 0)';
            for (let i = 0; i < cols * rows; i++) if (fog[i] !== '1') x.fillRect((i % cols) * r, Math.floor(i / cols) * r, r, r);
            if (!edit) return;
            // squares whose draft isn't what players have: outlined (a new grid: every revealed square)
            const sent = m.sent && JSON.stringify(m.sent.grid) === JSON.stringify(m.grid) ? m.sent.fog : '';
            const R = 8;
            Object.assign(marks.style, { left: fogC.style.left, top: fogC.style.top, width: fogC.style.width, height: fogC.style.height });
            marks.width = cols * R; marks.height = rows * R;
            const y = marks.getContext('2d');
            y.strokeStyle = token('--highlight') || 'rgb(255 255 255)';
            y.lineWidth = 2;
            for (let i = 0; i < cols * rows; i++) if ((fog[i] === '1') !== (sent[i] === '1')) y.strokeRect((i % cols) * R + 1, Math.floor(i / cols) * R + 1, R - 2, R - 2);
        }
        function drawGrid() {
            const m = S.m, g = S.gridDraft || m.grid;
            grid.hidden = !S.lines && S.tool !== 'grid';
            const [x0, y0, cols, rows] = cells(g, m.w, m.h);
            Object.assign(grid.style, { left: x0 + 'px', top: y0 + 'px', width: cols * g.s + 'px', height: rows * g.s + 'px', backgroundSize: `${g.s}px ${g.s}px` });
            grid.classList.toggle('mp-fit', S.tool === 'grid');
        }
        // does a placed token stand on a square players were sent as revealed? (mp_in_sight, for "What players see")
        function inSight(t) {
            const m = S.m, s = m.sent;
            if (!s || !t.placed) return false;
            const g = s.grid, [x0, y0, cols, rows] = cells(g, m.w, m.h), span = (SIZES[t.size] || 1) * m.grid.s, lo = (v, o) => Math.floor((v - o) / g.s);
            for (let r = Math.max(0, lo(t.y, y0)); r <= Math.min(rows - 1, lo(t.y + span - 0.01, y0)); r++)
                for (let col = Math.max(0, lo(t.x, x0)); col <= Math.min(cols - 1, lo(t.x + span - 0.01, x0)); col++) if (s.fog[r * cols + col] === '1') return true;
            return false;
        }
        const shown = (t) => t.placed && (!S.dm || !S.preview || t.kind === 'pc' || (!t.hidden && inSight(t)));
        const face = (t) => `<span class="mp-face">${t.art ? `<img src="${esc(t.art)}" alt="" referrerpolicy="no-referrer" draggable="false" onerror="this.remove()">` : ''}<span aria-hidden="true">${esc(initials(t.name))}</span></span>`;
        const movable = (t) => S.dm || t.mine;
        function drawToks() {
            const m = S.m, have = new Map([...toks.children].map((el) => [el.dataset.k, el]));
            for (const t of m.tokens.filter(shown)) {
                let el = have.get(t.k);
                have.delete(t.k);
                // a party character: conditions as icons, and death-save ticks while down (1.7)
                const html = face(t) + `<span class="mp-name">${esc(t.name)}</span>` + (t.kind === 'pc' ? (window.Conds?.row(t.conds) || '') + (t.down ? window.Conds?.saves(t.saves) || '' : '') : '');
                if (!el) { el = document.createElement('button'); el.type = 'button'; el.className = 'mp-tok'; el.dataset.k = t.k; toks.append(el); }
                if (el.dataset.html !== html) { el.innerHTML = html; el.dataset.html = html; }
                const span = (SIZES[t.size] || 1) * m.grid.s;
                if (S.drag?.k !== t.k) Object.assign(el.style, { left: t.x + 'px', top: t.y + 'px' });
                Object.assign(el.style, { width: span + 'px', height: span + 'px' });
                const down = t.status === 'down' || (t.kind === 'pc' && t.down);
                el.className = 'mp-tok' + (t.turn ? ' on' : '') + (t.status === 'bloodied' ? ' bloodied' : '') + (down ? ' down' : '') + (t.hidden ? ' hid' : '')
                    + (t.mine ? ' mine' : '') + (movable(t) && canEdit() ? ' can' : '') + (S.pick === t.k ? ' picked' : '') + (S.drag?.k === t.k ? ' drag' : '');
                el.setAttribute('aria-label', t.name + (t.turn ? ', their turn' : '') + (down ? ', down' : t.status === 'bloodied' ? ', bloodied' : '') + (t.hidden ? ', hidden from players' : '')
                    + (t.conds?.length ? ', ' + t.conds.join(', ') : ''));
            }
            for (const el of have.values()) el.remove();
        }
        // the ruler: square centre to square centre, every square 5 ft (diagonals too), the label totals every leg
        const centre = (p) => { const g = S.m.grid, [x0, y0] = cells(g, S.m.w, S.m.h); return [x0 + (Math.floor((p[0] - x0) / g.s) + 0.5) * g.s, y0 + (Math.floor((p[1] - y0) / g.s) + 0.5) * g.s]; };
        const feet = (pts) => pts.slice(1).reduce((n, p, i) => n + Math.round(Math.max(Math.abs(p[0] - pts[i][0]), Math.abs(p[1] - pts[i][1])) / S.m.grid.s) * 5, 0);
        function drawRulers() {
            const m = S.m, list = [...Object.values(S.rulers), ...(S.ruler ? [{ name: '', pts: S.ruler, mine: true }] : [])].filter((r) => r.m === undefined || r.m === m.id);
            svg.setAttribute('viewBox', `0 0 ${m.w} ${m.h}`);
            svg.setAttribute('width', m.w); svg.setAttribute('height', m.h);
            const f = 14 / S.k;
            svg.innerHTML = list.map((r) => {
                const p = r.pts, end = p[p.length - 1], label = `${feet(p)} ft${r.name ? ' · ' + r.name : ''}`;
                return `<g class="${r.mine ? 'mine' : ''}"><polyline points="${p.map((q) => q.join(',')).join(' ')}"/>${p.map((q) => `<circle cx="${q[0]}" cy="${q[1]}" r="${4 / S.k}"/>`).join('')}
                    <text x="${end[0] + 10 / S.k}" y="${end[1] - 10 / S.k}" font-size="${f}">${esc(label)}</text></g>`;
            }).join('');
        }

        // ---- toolbar, tools and panels ----
        const on = (b) => (b ? ' aria-pressed="true"' : ' aria-pressed="false"');
        const myToks = () => (S.m?.tokens || []).filter((t) => t.mine && t.placed);
        function drawBar() {
            const el = part('bar');
            if (!el) return;
            const m = S.m, act = m && S.v?.active === m.id, dis = canEdit() ? '' : ' disabled';
            el.innerHTML = (S.full && m ? `<b class="mp-title">${esc(m.name)}</b>${S.dm ? (act ? '<span class="badge b">On the table</span>' : '<span class="badge">Not on the table</span>') : ''}` : '')
                + (S.dm && S.full && m ? `<span class="stabs mp-modes" role="group" aria-label="Tool">${[['move', 'Move'], ['fog', 'Fog'], ['grid', 'Grid']].map(([k, n]) => `<button type="button" data-mpa="tool" data-v="${k}" class="${S.tool === k ? 'on' : ''}"${on(S.tool === k)}>${n}</button>`).join('')}</span>` : '')
                + (m ? `<button type="button" class="btn small" data-mpa="fit">Fit</button>`
                    + `<button type="button" class="btn small" data-mpa="me"${myToks().length ? '' : ' disabled'}>Centre on me</button>`
                    + `<button type="button" class="btn small" data-mpa="ruler" title="Ruler (R): drag to measure, right click or a second finger adds a corner"${on(S.armed)}>Ruler</button>`
                    + `<button type="button" class="btn small" data-mpa="lines"${on(S.lines)}>Grid lines</button>` : '')
                + (S.dm && S.full && m ? `<button type="button" class="btn small" data-mpa="preview"${on(S.preview)}>What players see</button>`
                    + `<button type="button" class="btn small primary" data-mpa="send"${dis}>Send to table</button>` : '');
        }
        function drawTools() {
            const el = part('tools');
            if (!el) return;
            const dis = canEdit() ? '' : ' disabled';
            el.hidden = !(S.dm && S.full && S.m && S.tool !== 'move');
            if (el.hidden) return el.innerHTML = '';
            if (S.tool === 'fog') {
                el.innerHTML = `<span class="stabs" role="group" aria-label="Brush">${[['brush', 'Brush'], ['rect', 'Rectangle']].map(([k, n]) => `<button type="button" data-mpa="brush" data-v="${k}" class="${S.brush === k ? 'on' : ''}"${on(S.brush === k)}>${n}</button>`).join('')}</span>
                    <span class="stabs" role="group" aria-label="Reveal or hide">${[['reveal', 'Reveal'], ['hide', 'Hide']].map(([k, n]) => `<button type="button" data-mpa="fogmode" data-v="${k}" class="${S.fogMode === k ? 'on' : ''}"${on(S.fogMode === k)}>${n}</button>`).join('')}</span>
                    <button type="button" class="btn small" data-mpa="undo"${S.undo.length && !dis ? '' : ' disabled'} title="Ctrl+Z">Undo</button>
                    <button type="button" class="btn small" data-mpa="reset"${dis}>Reset draft to last sent</button>
                    <button type="button" class="btn small" data-mpa="all" data-v="1"${dis}>Reveal all</button><button type="button" class="btn small" data-mpa="all" data-v="0"${dis}>Hide all</button>
                    <span class="muted mp-save">${S.dirty ? 'Saving draft...' : 'Draft saved. Players see it after Send to table.'}</span>`;
            } else {
                const g = S.gridDraft || S.m.grid;
                el.innerHTML = `<span class="muted">Drag a box over one square printed on the map. Arrow keys nudge the grid.</span>
                    <label class="mp-gs">Square size <input class="field" type="number" inputmode="decimal" min="8" step="0.5" value="${+g.s.toFixed(2)}" data-mpa="gsize"${dis}></label>
                    <button type="button" class="btn small" data-mpa="tool" data-v="move">Done</button>`;
            }
        }
        function drawTray() {
            const el = part('tray');
            if (!el) return;
            const list = (S.m?.tokens || []).filter((t) => !t.placed);
            const mons = S.dm && S.full && S.mons?.length ? `<div class="fi-add"><select class="field" data-mp="drop" aria-label="Monster to put on the map">${monOpts()}</select>
                <button type="button" class="btn small" data-mpa="drop"${canEdit() ? '' : ' disabled'}>Put on map</button></div>` : '';
            el.hidden = !S.m || (!list.length && !mons);
            el.innerHTML = `<h2>Not placed <span class="n">${list.length}</span></h2>${list.length ? `<p class="muted">Drag one onto the map, or click it to put it in the middle.</p>` : ''}
                <div class="mp-trayl">${list.map((t) => `<button type="button" class="mp-trayt${t.hidden ? ' hid' : ''}" data-k="${esc(t.k)}"${canEdit() ? '' : ' disabled'}>${face(t)}<span>${esc(t.name)}</span></button>`).join('')}</div>${mons}`;
        }
        // the DM's picked token: size, hidden, back to the tray, off the map
        function drawTok() {
            const el = part('tok');
            if (!el) return;
            const t = S.dm && (S.m?.tokens || []).find((x) => x.k === S.pick);
            el.hidden = !t;
            if (!t) return el.innerHTML = '';
            const dis = canEdit() ? '' : ' disabled';
            el.innerHTML = `<h2>${esc(t.name)}</h2><div class="mp-tokrow">${face(t)}
                <label>Size <select class="field" data-mpa="size"${dis}>${Object.entries(SIZE_NAMES).map(([k, n]) => `<option value="${k}"${t.size === k ? ' selected' : ''}>${n}</option>`).join('')}</select></label></div>
                <div class="actions">${t.kind !== 'pc' ? `<button type="button" class="btn small" data-mpa="hide"${on(t.hidden)}${dis}>${t.hidden ? 'Reveal to players' : 'Hide from players'}</button>` : ''}
                ${t.placed ? `<button type="button" class="btn small" data-mpa="totray"${dis}>Back to the tray</button>` : ''}
                ${t.kind !== 'pc' && !t.fight ? `<button type="button" class="btn small" data-mpa="remove"${dis}>Take off the map</button>` : ''}</div>
                ${t.hidden ? '<p class="muted">Players never get a hidden token.</p>' : ''}`;
        }
        function drawMaps() {
            const el = part('maps');
            if (!el || !S.dm || !S.v || S.uploading) return;
            const list = S.v.maps || [], live = list.filter((x) => !x.archived), gone = list.filter((x) => x.archived), dis = canEdit() ? '' : ' disabled';
            const card = (x) => `<div class="mp-mapc${x.id === S.v.active ? ' on' : ''}${x.id === S.m?.id ? ' open' : ''}">
                <button type="button" class="mp-thumb" data-mpa="open" data-id="${esc(x.id)}" aria-label="Open ${esc(x.name)}"><img src="${esc(x.thumb)}" alt="" loading="lazy" width="320" height="200"></button>
                <b>${esc(x.name)}</b>${x.id === S.v.active ? '<span class="badge b">On the table</span>' : ''}
                <span class="mp-mapa">${x.archived ? `<button type="button" class="btn small" data-mpa="unarchive" data-id="${esc(x.id)}"${dis}>Unarchive</button>`
                    : `${x.id === S.v.active ? '' : `<button type="button" class="btn small" data-mpa="activate" data-id="${esc(x.id)}"${dis}>Put on the table</button>`}
                    <button type="button" class="btn small" data-mpa="rename" data-id="${esc(x.id)}"${dis}>Rename</button><button type="button" class="btn small" data-mpa="archive" data-id="${esc(x.id)}"${dis}>Archive</button>`}</span></div>`;
            const kept = el.querySelector('details')?.open;
            el.innerHTML = `<h2>Maps <span class="n">${live.length}</span></h2>
                <form class="mp-up" data-mp="upform"><label>Upload a map <input class="field" type="file" accept=".jpg,.jpeg,.png,.webp,.gif,image/jpeg,image/png,image/webp,image/gif" data-mp="file"${dis}></label>
                <p class="muted mp-upstate" data-mp="upstate">JPG, PNG, WebP or GIF (a GIF as a still picture), any size.</p></form>
                <div class="mp-maplist">${live.map(card).join('') || '<p class="muted">No maps yet.</p>'}</div>
                ${gone.length ? `<details${kept ? ' open' : ''}><summary>Archived (${gone.length})</summary><div class="mp-maplist">${gone.map(card).join('')}</div></details>` : ''}`;
        }

        // ---- the DM's monsters (fight and map) ----
        const crNum = (x) => { const r = /^\s*(\d+)\s*\/\s*(\d+)/.exec(String(x)); return r ? r[1] / r[2] : +x || 0; };
        const calc = (f, V) => { try { const v = window.hbCalc(f, V).v; return Number.isFinite(v) ? v : NaN; } catch (e) { return NaN; } };
        // initiative bonus and AC as the Monster Sheet works them out (formula.js, with the ability modifiers, CR and proficiency)
        function stats(x) {
            const V = { level: crNum(x.cr), cr: crNum(x.cr) };
            for (const a of x.abilities) { const s = +a.score || 10; V[String(a.key).replace(/\W/g, '').toLowerCase()] = Math.floor((s - 10) / 2); }
            V.prof = calc(x.prof || 'max(2, ceil(CR / 4) + 1)', V) || 2;
            const bonus = calc(x.init || 'DEX', V), ac = calc(x.ac || '10', V);
            return { bonus: Math.round(Number.isNaN(bonus) ? V.dex || 0 : bonus), ac: Number.isNaN(ac) ? null : Math.round(ac) };
        }
        async function loadMons() {
            if (!S.dm || !S.full) return;
            try { const r = await fetch('/campaigns/maps.php?mons&c=' + encodeURIComponent(c), { cache: 'no-store' }); if (r.ok) S.mons = (await r.json()).monsters; } catch (e) { }
            drawTray(); window.Fight?.load(c);
        }
        function monOpts(skip = new Set()) {
            const groups = {};
            for (const x of S.mons || []) if (!skip.has(x.id)) (groups[x.enc] ??= []).push(x);
            return Object.entries(groups).map(([g, l]) => `<optgroup label="${esc(g || 'Unsorted')}">${l.map((x) => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('')}</optgroup>`).join('');
        }
        // the fight panel's own add row (fight.js calls it while a fight runs)
        function fightExtra() {
            const f = window.Fight?.state(c), have = new Set((f?.entries || []).map((e) => e.mon));
            const opts = monOpts(have);
            return S.mons && opts ? `<div class="fi-add" data-mp="fightadd"><select class="field" aria-label="Monster to add to the fight">${opts}</select>
                <button type="button" class="btn small" data-mpa="fightadd">Add to fight</button><button type="button" class="btn small" data-mpa="fightenc">Add its encounter</button></div>` : '';
        }
        async function fightAdd(ids) {
            const f = window.Fight?.state(c), have = new Set((f?.entries || []).map((e) => e.mon));
            const items = (S.mons || []).filter((x) => ids.includes(x.id) && !have.has(x.id)).map((x) => {
                const s = stats(x);
                return { kind: 'monster', mon: x.id, bonus: s.bonus, ac: s.ac, init: 1 + Math.floor(Math.random() * 20) + s.bonus };
            });
            if (items.length) await window.Fight.act(c, 'add', { items });
        }

        // ---- changes ----
        let saveT = 0;
        function saveDraft() {
            S.dirty = true;
            clearTimeout(saveT);
            saveT = setTimeout(async () => {
                const fog = S.fog.join('');
                if (await post({ op: 'draft', fog }, true)) { if (S.fog.join('') === fog) S.dirty = false; }
                else toast("Couldn't save the fog draft. It's kept here; it saves again with your next change.", 'err');
                drawTools();
            }, 1000);
            drawTools();
        }
        // one stroke: the squares it changed and what they were, for Undo
        function stroke(idx, val) {
            const ch = idx.filter((i) => S.fog[i] !== val);
            if (!ch.length) return;
            S.undo.push({ i: ch, was: ch.map((i) => S.fog[i]) });
            for (const i of ch) S.fog[i] = val;
            saveDraft(); drawFog(); drawTools();
        }
        function undo() {
            const u = S.undo.pop();
            if (!u) return;
            u.i.forEach((i, n) => { S.fog[i] = u.was[n]; });
            saveDraft(); drawFog(); drawTools();
        }
        async function send() {
            clearTimeout(saveT);
            if (S.dirty && !(await post({ op: 'draft', fog: S.fog.join('') }))) return;
            S.dirty = false;
            if (await post({ op: 'send' })) { toast('Sent to the table.', 'ok'); await load(); }
        }
        async function setGrid(g) {
            const m = S.m;
            const touched = S.fog?.includes('1') || m.sent;
            if (touched && !S.gridOk && !(await ask('Changing the grid resets the fog', 'Your draft starts over fully fogged. Players keep the last map you sent until you send again.', 'Change the grid'))) { S.gridDraft = null; return drawGrid(); }
            S.gridOk = true;
            S.gridDraft = g;
            drawGrid(); drawTools();
            sendGrid();
        }
        // the grid saved stays this page's grid at once (a nudge right after must start from it, not from the last load)
        const sendGrid = throttle(async () => {
            const g = S.gridDraft;
            if (!g) return;
            const ok = await post({ op: 'grid', s: g.s, ox: g.ox, oy: g.oy });
            if (S.gridDraft === g) S.gridDraft = null;
            if (ok && S.m) S.m.grid = { s: +g.s.toFixed(2), ox: +g.ox.toFixed(2), oy: +g.oy.toFixed(2) };
            S.dirty = false;
            await load();
        }, 600);
        const sendMove = throttle((k, x, y) => post({ op: 'move', k, x, y, placed: true }, true), 200);
        const sendRuler = throttle((pts) => post({ op: 'ruler', pts }, true), 150);
        function snap(t, x, y) {
            const g = S.m.grid, [x0, y0] = cells(g, S.m.w, S.m.h), n = SIZES[t.size] || 1;
            if (n < 1) { // a Tiny token sits in the middle of the square under it
                const cx = x + (n * g.s) / 2, cy = y + (n * g.s) / 2, off = (g.s - n * g.s) / 2;
                return [x0 + Math.floor((cx - x0) / g.s) * g.s + off, y0 + Math.floor((cy - y0) / g.s) * g.s + off];
            }
            return [x0 + Math.round((x - x0) / g.s) * g.s, y0 + Math.round((y - y0) / g.s) * g.s];
        }
        async function moveTo(t, x, y, placed = true) {
            Object.assign(t, placed ? { x, y, placed } : { placed });
            draw();
            if (!(await post(placed ? { op: 'move', k: t.k, x, y, placed } : { op: 'move', k: t.k, placed: false }))) load();
        }

        // ---- the view: pan, zoom, fit ----
        function fit() {
            const m = S.m, r = view.getBoundingClientRect(), top = Math.min(r.height / 2, opts.top?.() || 0);
            if (!m || !r.width) return;
            S.k = Math.min(r.width / m.w, (r.height - top) / m.h) * 0.96;
            S.tx = (r.width - m.w * S.k) / 2; S.ty = top + (r.height - top - m.h * S.k) / 2;
            place(); drawRulers();
        }
        function zoom(f, cx, cy) {
            const k = Math.min(8, Math.max(0.02, S.k * f));
            S.tx = cx - ((cx - S.tx) * k) / S.k; S.ty = cy - ((cy - S.ty) * k) / S.k; S.k = k;
            place(); drawRulers();
        }
        function centreOn(t) {
            const r = view.getBoundingClientRect(), span = (SIZES[t.size] || 1) * S.m.grid.s;
            S.tx = r.width / 2 - (t.x + span / 2) * S.k; S.ty = r.height / 2 - (t.y + span / 2) * S.k;
            place();
        }
        const toMap = (e) => { const r = view.getBoundingClientRect(); return [(e.clientX - r.left - S.tx) / S.k, (e.clientY - r.top - S.ty) / S.k]; };
        const cellAt = (p) => {
            const g = S.m.grid, [x0, y0, cols, rows] = cells(g, S.m.w, S.m.h), col = Math.floor((p[0] - x0) / g.s), row = Math.floor((p[1] - y0) / g.s);
            return col < 0 || row < 0 || col >= cols || row >= rows ? -1 : row * cols + col;
        };
        view.addEventListener('wheel', (e) => { if (!S.m || S.table) return; e.preventDefault(); const r = view.getBoundingClientRect(); zoom(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top); }, { passive: false });
        view.addEventListener('contextmenu', (e) => e.preventDefault());
        const ptrs = new Map();
        let G = null; // the gesture under way: {type: pan | pinch | token | brush | rect | grid | ruler, id, ...}
        const showBox = (a, b) => {
            Object.assign(box.style, { left: Math.min(a[0], b[0]) + 'px', top: Math.min(a[1], b[1]) + 'px', width: Math.abs(b[0] - a[0]) + 'px', height: Math.abs(b[1] - a[1]) + 'px' });
            box.hidden = false;
        };
        function boxCells(a, b) {
            const g = S.m.grid, [x0, y0, cols, rows] = cells(g, S.m.w, S.m.h), out = [];
            const c0 = Math.max(0, Math.floor((Math.min(a[0], b[0]) - x0) / g.s)), c1 = Math.min(cols - 1, Math.floor((Math.max(a[0], b[0]) - x0) / g.s));
            const r0 = Math.max(0, Math.floor((Math.min(a[1], b[1]) - y0) / g.s)), r1 = Math.min(rows - 1, Math.floor((Math.max(a[1], b[1]) - y0) / g.s));
            for (let r = r0; r <= r1; r++) for (let col = c0; col <= c1; col++) out.push(r * cols + col);
            return out;
        }
        // a box dragged over one printed square: its size is the square's, its corner where the lines run
        const gridOf = (a, b) => { const s = (Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1])) / 2; return s < 8 ? null : { s, ox: ((Math.min(a[0], b[0]) % s) + s) % s, oy: ((Math.min(a[1], b[1]) % s) + s) % s }; };
        const joint = () => { if (G?.type === 'ruler') { S.ruler.push(S.ruler[S.ruler.length - 1].slice()); drawRulers(); } };
        view.addEventListener('pointerdown', (e) => {
            if (!S.m || S.table) return; // the Table view: nothing to click or drag
            if (e.button === 2) { e.preventDefault(); return joint(); } // right click mid-drag: a corner in the ruler
            ptrs.set(e.pointerId, [e.clientX, e.clientY]);
            if (ptrs.size === 2) {
                if (G?.type === 'ruler' && e.pointerType === 'touch') { G.tap = e.pointerId; return joint(); } // a second finger's tap
                if (G?.type === 'token') moveTo(G.t, G.t.x, G.t.y); // the drop so far stands
                const [a, b] = [...ptrs.values()];
                G = { type: 'pinch', d: Math.hypot(a[0] - b[0], a[1] - b[1]), k: S.k, tx: S.tx, ty: S.ty, mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] };
                box.hidden = true;
                return;
            }
            if (ptrs.size > 2 || G) return;
            try { view.setPointerCapture(e.pointerId); } catch (x) { } // (a pointer that is already gone)
            const p = toMap(e), el = e.target.closest('.mp-tok'), t = el && S.m.tokens.find((x) => x.k === el.dataset.k);
            const start = { id: e.pointerId, x: e.clientX, y: e.clientY, p, moved: false };
            if (e.button === 1) G = { ...start, type: 'pan', tx: S.tx, ty: S.ty };
            else if (S.armed) { S.ruler = [centre(p), centre(p)]; G = { ...start, type: 'ruler' }; drawRulers(); }
            else if (S.dm && S.full && S.tool === 'fog' && myView() && canEdit()) {
                G = S.brush === 'rect' ? { ...start, type: 'rect' } : { ...start, type: 'brush', idx: new Set(), last: p, was: S.fog.slice() };
                if (G.type === 'brush') paint(p);
            }
            else if (S.dm && S.full && S.tool === 'grid' && canEdit()) G = { ...start, type: 'grid' };
            else if (t && movable(t) && canEdit()) G = { ...start, type: 'token', t, ox: p[0] - t.x, oy: p[1] - t.y };
            else G = { ...start, type: 'pan', tx: S.tx, ty: S.ty, tap: t };
        });
        // brush: every square the pointer crosses (in half-square steps, so a quick drag skips none)
        function paint(p) {
            const val = S.fogMode === 'reveal' ? '1' : '0', a = G.last, n = Math.max(1, Math.ceil(Math.hypot(p[0] - a[0], p[1] - a[1]) / (S.m.grid.s / 2)));
            for (let i = 0; i <= n; i++) { const j = cellAt([a[0] + ((p[0] - a[0]) * i) / n, a[1] + ((p[1] - a[1]) * i) / n]); if (j >= 0) { G.idx.add(j); S.fog[j] = val; } }
            G.last = p;
            drawFog();
        }
        view.addEventListener('pointermove', (e) => {
            if (!ptrs.has(e.pointerId)) return;
            ptrs.set(e.pointerId, [e.clientX, e.clientY]);
            if (!G) return;
            if (G.type === 'pinch') {
                const [a, b] = [...ptrs.values()], r = view.getBoundingClientRect();
                const k = Math.min(8, Math.max(0.02, (G.k * Math.hypot(a[0] - b[0], a[1] - b[1])) / G.d)), mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
                const mx = (G.mid[0] - r.left - G.tx) / G.k, my = (G.mid[1] - r.top - G.ty) / G.k; // the map point that started under the fingers
                S.k = k; S.tx = mid[0] - r.left - mx * k; S.ty = mid[1] - r.top - my * k;
                place(); return drawRulers();
            }
            if (e.pointerId !== G.id) return;
            if (Math.hypot(e.clientX - G.x, e.clientY - G.y) > 4) G.moved = true;
            const p = toMap(e);
            if (G.type === 'pan') { if (G.moved) { S.tx = G.tx + e.clientX - G.x; S.ty = G.ty + e.clientY - G.y; place(); } }
            else if (G.type === 'ruler') { S.ruler[S.ruler.length - 1] = centre(p); drawRulers(); sendRuler(S.ruler); }
            else if (G.type === 'brush') paint(p);
            else if (G.type === 'rect') showBox(G.p, p);
            else if (G.type === 'grid') { showBox(G.p, p); const g = gridOf(G.p, p); if (g) { S.gridDraft = g; drawGrid(); } }
            else if (G.type === 'token' && G.moved) {
                // snapped to whole squares (a Large token to a 2 x 2 corner); Alt places it freely (a mouse only)
                let [x, y] = [p[0] - G.ox, p[1] - G.oy];
                if (!(e.altKey && e.pointerType === 'mouse')) [x, y] = snap(G.t, x, y);
                Object.assign(G.t, { x, y, placed: true });
                S.drag = { k: G.t.k };
                const el = toks.querySelector(`[data-k="${CSS.escape(G.t.k)}"]`);
                if (el) { el.style.left = x + 'px'; el.style.top = y + 'px'; el.classList.add('drag'); }
                sendMove(G.t.k, x, y);
            }
        });
        const up = async (e) => {
            ptrs.delete(e.pointerId);
            if (!G) return;
            if (G.type === 'pinch') { if (ptrs.size < 2) G = null; return; }
            if (e.pointerId === G.tap) return; // the ruler's corner tap
            if (e.pointerId !== G.id) return;
            const g = G, p = toMap(e);
            G = null;
            box.hidden = true;
            if (g.type === 'ruler') { S.ruler = null; S.armed = false; drawRulers(); drawBar(); sendRuler(null); }
            else if (g.type === 'brush') {
                // the stroke as one Undo step: the squares it changed, as they were before it
                const ch = [...g.idx].filter((i) => g.was[i] !== S.fog[i]);
                if (ch.length) { S.undo.push({ i: ch, was: ch.map((i) => g.was[i]) }); saveDraft(); }
                drawTools();
            }
            else if (g.type === 'rect') stroke(boxCells(g.p, p), S.fogMode === 'reveal' ? '1' : '0');
            else if (g.type === 'grid') { const gr = gridOf(g.p, p); if (gr) setGrid(gr); else { S.gridDraft = null; drawGrid(); } }
            else if (g.type === 'token') {
                S.drag = null;
                if (g.moved) await moveTo(g.t, g.t.x, g.t.y);
                else tap(g.t);
            } else if (g.type === 'pan' && !g.moved) tap(g.tap);
        };
        view.addEventListener('pointerup', up);
        view.addEventListener('pointercancel', up);
        // a tap on a token: its name (phones have no hover); the DM also picks it for the token panel
        function tap(t) {
            toks.querySelectorAll('.mp-tok.show').forEach((el) => el.classList.remove('show'));
            if (t) toks.querySelector(`[data-k="${CSS.escape(t.k)}"]`)?.classList.add('show');
            if (S.dm) { S.pick = t?.k || null; drawTok(); drawToks(); }
        }

        // ---- the tray: drag a token onto the map, or click to put it in the middle ----
        root.addEventListener('pointerdown', (e) => {
            const b = e.target.closest('.mp-trayt');
            if (!b || b.disabled || e.button) return;
            const t = S.m.tokens.find((x) => x.k === b.dataset.k);
            if (!t) return;
            e.preventDefault();
            const ghost = document.createElement('div');
            ghost.className = 'mp-ghost';
            ghost.innerHTML = face(t);
            document.body.append(ghost);
            const at = (ev) => Object.assign(ghost.style, { left: ev.clientX + 'px', top: ev.clientY + 'px' });
            at(e);
            const x0 = e.clientX, y0 = e.clientY;
            const move = (ev) => at(ev);
            const done = (ev) => {
                removeEventListener('pointermove', move); removeEventListener('pointerup', done); removeEventListener('pointercancel', done);
                ghost.remove();
                const r = view.getBoundingClientRect(), span = (SIZES[t.size] || 1) * S.m.grid.s;
                const inView = ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
                let p;
                if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 5) p = [(r.width / 2 - S.tx) / S.k, (r.height / 2 - S.ty) / S.k]; // a click: the middle of the view
                else if (inView) p = toMap(ev);
                else return;
                moveTo(t, ...snap(t, p[0] - span / 2, p[1] - span / 2));
            };
            addEventListener('pointermove', move); addEventListener('pointerup', done); addEventListener('pointercancel', done);
        });

        // ---- buttons ----
        root.addEventListener('click', async (e) => {
            const b = e.target.closest('[data-mpa]');
            if (!b || b.matches('select, input')) return;
            const a = b.dataset.mpa, v = b.dataset.v, t = S.m?.tokens.find((x) => x.k === S.pick);
            if (a === 'fit') return fit();
            if (a === 'me') { const m = myToks()[0]; return m && centreOn(m); }
            if (a === 'ruler') { S.armed = !S.armed; return drawBar(); }
            if (a === 'lines') { S.lines = !S.lines; drawBar(); return drawGrid(); }
            if (a === 'tool') { S.tool = v; S.gridOk = false; S.gridDraft = null; return draw(); }
            if (a === 'brush') { S.brush = v; return drawTools(); }
            if (a === 'fogmode') { S.fogMode = v; return drawTools(); }
            if (a === 'preview') { S.preview = !S.preview; return draw(); }
            if (a === 'undo') return undo();
            if (a === 'send') { b.disabled = true; await send(); return drawBar(); }
            if (a === 'reset') {
                const m = S.m, same = m.sent && JSON.stringify(m.sent.grid) === JSON.stringify(m.grid);
                const to = same ? m.sent.fog : '0'.repeat(S.fog.length);
                const ch = S.fog.map((x, i) => i).filter((i) => S.fog[i] !== to[i]);
                if (!ch.length) return;
                S.undo.push({ i: ch, was: ch.map((i) => S.fog[i]) });
                S.fog = to.split('');
                saveDraft(); return drawFog();
            }
            if (a === 'all') return stroke(S.fog.map((x, i) => i), v);
            if (a === 'open') { S.sel = b.dataset.id; S.dirty = false; return load(); }
            if (a === 'activate') { if (await post({ op: 'activate', m: b.dataset.id })) { S.sel = b.dataset.id; load(); } return; }
            if (a === 'archive' || a === 'unarchive') {
                if (await post({ op: 'archive', m: b.dataset.id, on: a === 'archive' })) {
                    if (a === 'archive' && S.sel === b.dataset.id) S.sel = null;
                    toast(a === 'archive' ? 'Map archived. Find it under Archived.' : 'Map unarchived.', 'ok');
                    load();
                }
                return;
            }
            if (a === 'rename') {
                const x = S.v.maps.find((y) => y.id === b.dataset.id);
                const name = await ask('Rename the map', '', 'Rename', x?.name || '');
                if (name && (await post({ op: 'rename', m: b.dataset.id, name }))) load();
                return;
            }
            if (a === 'totray' && t) return moveTo(t, t.x, t.y, false);
            if (a === 'remove' && t) { if (await post({ op: 'remove', k: t.k })) { S.pick = null; load(); } return; }
            if (a === 'hide' && t) {
                const ok = t.fight ? await window.Fight.act(c, 'hide', { e: t.fight, on: !t.hidden }) : await post({ op: 'token', k: t.k, hidden: !t.hidden });
                if (ok) load();
                return;
            }
            if (a === 'drop') { const id = root.querySelector('[data-mp=drop]')?.value; if (id && (await post({ op: 'drop', mon: id }))) load(); return; }
            if (a === 'fightadd' || a === 'fightenc') {
                const id = b.parentElement.querySelector('select')?.value, x = S.mons?.find((y) => y.id === id);
                if (!x) return;
                b.disabled = true;
                return fightAdd(a === 'fightadd' ? [x.id] : S.mons.filter((y) => y.enc === x.enc).map((y) => y.id));
            }
        });
        root.addEventListener('change', async (e) => {
            const el = e.target;
            if (el.matches('[data-mpa=size]') && S.pick) { if (await post({ op: 'token', k: S.pick, size: el.value })) load(); }
            else if (el.matches('[data-mpa=gsize]')) { const s = +el.value; if (s >= 8) setGrid({ ...(S.gridDraft || S.m.grid), s }); }
            else if (el.matches('[data-mp=file]') && el.files[0]) upload(el.files[0], el);
        });
        root.addEventListener('submit', (e) => { if (e.target.matches('[data-mp=upform]')) e.preventDefault(); });
        addEventListener('keydown', (e) => {
            // the Table view: + and - zoom about the middle, 0 fits again (no on-screen controls)
            if (S.table && S.m && !e.ctrlKey && !e.metaKey && !e.altKey) {
                const r = view.getBoundingClientRect();
                if (e.key === '+' || e.key === '=') zoom(1.25, r.width / 2, r.height / 2);
                else if (e.key === '-' || e.key === '_') zoom(0.8, r.width / 2, r.height / 2);
                else if (e.key === '0') fit();
                return;
            }
            if (!S.m || !S.full || e.target.closest?.('input, select, textarea, [contenteditable]') || document.querySelector('dialog[open]')) return;
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && S.dm && S.full) { e.preventDefault(); return undo(); }
            if (e.key.toLowerCase() === 'r' && !e.ctrlKey && !e.metaKey && !e.altKey) { S.armed = !S.armed; return drawBar(); }
            if (S.tool === 'grid' && S.dm && canEdit() && /^Arrow/.test(e.key)) {
                e.preventDefault();
                const g = { ...(S.gridDraft || S.m.grid) };
                if (e.key === 'ArrowLeft') g.ox -= 1; else if (e.key === 'ArrowRight') g.ox += 1; else if (e.key === 'ArrowUp') g.oy -= 1; else g.oy += 1;
                g.ox = ((g.ox % g.s) + g.s) % g.s; g.oy = ((g.oy % g.s) + g.s) % g.s;
                setGrid(g);
            }
        });

        // ---- upload: 4 MB chunks in order, each tried again if the connection blinks ----
        async function upload(file, input) {
            const state = root.querySelector('[data-mp=upstate]');
            if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type) && !/\.(jpe?g|png|webp|gif)$/i.test(file.name)) {
                state.textContent = "That isn't a JPG, PNG, WebP or GIF picture. Save the map as one of those and upload it again.";
                input.value = '';
                return;
            }
            const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
            input.disabled = true;
            S.uploading = true;
            try {
                for (let i = 0, pos = 0; pos < file.size || i === 0; i++, pos += CHUNK) {
                    state.textContent = `Uploading ${Math.min(100, Math.round((pos / Math.max(1, file.size)) * 100))}%...`;
                    let ok = false;
                    for (let tries = 0; tries < 3 && !ok; tries++) {
                        try {
                            const r = await fetch(`/campaigns/maps.php?c=${encodeURIComponent(c)}&up=${id}&i=${i}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: file.slice(pos, pos + CHUNK) });
                            if (r.ok) ok = true;
                            else if (r.status < 500) throw new Error((await r.json().catch(() => ({}))).error || 'The upload was refused.');
                        } catch (x) { if (x.message && !/fetch|network/i.test(x.message)) throw x; }
                    }
                    if (!ok) throw new Error("Couldn't reach the site. Check your connection and upload the map again.");
                }
                state.textContent = 'Making the map...';
                const out = await post({ op: 'upload', up: id, name: file.name.replace(/\.[^.]+$/, '') }, true);
                if (!out) throw new Error(S.err);
                // never put on the table by itself, even the first map: the DM picks it (owner's choice)
                S.sel = out.map; S.dirty = false; S.uploading = false;
                toast('Map uploaded. Fit the grid, reveal what players should see, then Put on the table and Send to table.', 'ok');
                S.tool = 'grid';
                await load();
            } catch (x) {
                S.uploading = false;
                state.textContent = x.message;
                input.disabled = false; input.value = '';
            }
        }

        // a yes/no (or a name) in a dialog: resolves to true, the typed text, or false
        function ask(title, text, yes, value) {
            return new Promise((done) => {
                const d = document.createElement('dialog');
                d.className = 'dlg';
                d.innerHTML = `<form method="dialog"><h2>${esc(title)}</h2>${text ? `<p>${esc(text)}</p>` : ''}${value !== undefined ? `<label>Name <input class="field" name="v" value="${esc(value)}" required maxlength="80"></label>` : ''}
                    <div class="actions"><button type="button" class="btn" value="no">Cancel</button><button class="btn primary" value="yes">${esc(yes)}</button></div></form>`;
                document.body.append(d);
                const end = (r) => { d.close(); d.remove(); done(r); };
                d.querySelector('[value=no]').onclick = () => end(false);
                d.querySelector('form').onsubmit = (e) => { e.preventDefault(); end(value !== undefined ? d.querySelector('input').value.trim() : true); };
                d.addEventListener('cancel', (e) => { e.preventDefault(); end(false); });
                d.showModal();
            });
        }

        // ---- live: moves, rulers and changes from the others ----
        function onMessage(m) {
            if (m.type === 'map' || m.type === 'fight' || m.type === 'campaign' || m.type === 'status') {
                if (m.draft && S.dirty) return; // our own draft coming back while we draw more
                return load();
            }
            if (m.type === 'mapmove' && m.m === S.m?.id) {
                const t = S.m.tokens.find((x) => x.k === m.k);
                if (m.gone) { if (t) S.m.tokens = S.m.tokens.filter((x) => x !== t); return drawToks(); }
                if (!t) return load(); // one that just came into sight: its name and picture come with the map
                if (S.drag?.k === t.k) return;
                Object.assign(t, { x: m.x, y: m.y, placed: m.placed });
                drawToks(); drawTray(); return drawBar();
            }
            if (m.type === 'ruler') {
                if (m.who === S.me) return;
                if (m.pts) S.rulers[m.who] = { name: m.name, pts: m.pts, m: m.m }; else delete S.rulers[m.who];
                if (S.m) drawRulers();
                return;
            }
            if (m.type === 'removed') { S.v = null; S.m = null; S.failed = true; draw(); }
        }
        addEventListener('online', load);
        addEventListener('offline', draw);
        addEventListener('resize', () => { if (S.m && !S.moved) fit(); });
        view.addEventListener('pointerdown', () => { S.moved = true; }, { capture: true });
        const watch = window.Live?.watch(c, { load, onMessage, onPaused(p) { S.paused = p; draw(); } });
        if (!watch) load();
        // the fight beside the map: the DM's controls on the map page, the order (with "Your turn") for everyone else
        const fe = part('fight');
        if (fe && window.Fight) window.Fight.panel(fe, c, S.dm && S.full ? { controls: true, extra: fightExtra } : {});
        loadMons();
        return { state: S, load, fit };
    }
    return { mount };
})();
