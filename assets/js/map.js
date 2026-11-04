// The battle map (ROADMAP 1.6, reworked to work like D&D Beyond Maps) for the map page (/campaigns/<id>/map, campaigns/map.php), the
// campaign page's Map section and the Spectator window (campaigns/table.php). campaigns/maps.php decides what each person gets
// (mp_view in includes/maps.php); this file draws it and sends changes.
//   BattleMap.mount(root, campaignId, {dm, me, full, table, top, onDraw})   root holds the parts it fills, each optional:
//     view (the map), bar (the small page's buttons), tray (tokens not placed), paused, zoom (bottom right); the full page also:
//     tl (top left), tracker (the turn tiles), menuPick (the top right Menu), rail (tools), opts (the tool's flyout), menu (the token
//     menu), side (Combat Encounter, then Initiative Order), fight (fight.js's hidden keeper).
//   dm: the DM or a co-DM; me: this player's live key; full: the map page; table: read-only Spectator (with Live.as); top(): pixels
//   kept clear when fitting; onDraw(state): after every draw.
//   BattleMap.tiles(f) -> the turn tracker's html for a fight, used here and by the Spectator window.
// Coordinates are the original picture's pixels; the stage is scaled to the screen with one CSS transform. Fog is a list of strokes on
// every screen's own canvas, over one picture sent once (the owner's choice: a player could read under it).
window.BattleMap = (() => {
    'use strict';
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    const toast = (t, k) => window.UI?.toast(t, k);
    const SIZES = { T: 0.5, S: 1, M: 1, L: 2, H: 3, G: 4 }, SIZE_NAMES = { T: 'Tiny', S: 'Small', M: 'Medium', L: 'Large', H: 'Huge', G: 'Gargantuan' };
    const CHUNK = 4 * 1024 * 1024;
    const CONDS = ['Blinded', 'Charmed', 'Deafened', 'Exhaustion', 'Frightened', 'Grappled', 'Incapacitated', 'Invisible', 'Paralyzed', 'Petrified', 'Poisoned', 'Prone', 'Restrained', 'Stunned', 'Unconscious'];
    const COLORS = ['#e5484d', '#f5853f', '#f2c94c', '#4caf50', '#2bb5a0', '#3987e5', '#7a6df0', '#c75bd6', '#ec6fa8', '#ffffff', '#9b9b9b', '#111111'];
    const RINGS = ['', ...COLORS.slice(0, 9)];
    const PATTERNS = ['Solid', 'Light', 'Stripes right', 'Stripes left', 'Bars across', 'Bars down', 'Cross hatch', 'Dots', 'Large dots', 'Checks', 'Waves', 'Zigzag', 'Rings', 'Bricks', 'Sparks'];
    const BRUSH = [3, 6, 10, 16, 24];
    const FOG_RES = 2048, MARK_RES = 3000; // canvases never go over this many pixels on their longest side
    const TOOLKEY = 'map-tools'; // the DM's and players' tool choices (follows the account: sync.js)
    const TOOLS_A = [['select', 'V', 'Select'], ['pan', 'P', 'Pan']];
    const TOOLS_B = [['fog', 'F', 'Fog of War'], ['draw', 'D', 'Draw'], ['overlay', 'O', 'Overlays'], ['ruler', 'R', 'Ruler'], ['point', 'X', 'Point'], ['tokens', 'T', 'Tokens']];
    const TOOLS = [...TOOLS_A, ...TOOLS_B];
    const initials = (n) => String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase();
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const sign = (n) => (n >= 0 ? '+' : '−') + Math.abs(n);
    const uid = () => Math.random().toString(36).slice(2, 12);
    // the squares of a grid over a w x h picture: [x0, y0, columns, rows] (includes/maps.php mp_cells, the same sums)
    const cells = (g, w, h) => {
        const x0 = g.ox > 0 ? g.ox - g.s : 0, y0 = g.oy > 0 ? g.oy - g.s : 0;
        return [x0, y0, Math.max(1, Math.ceil((w - x0) / g.s - 1e-6)), Math.max(1, Math.ceil((h - y0) / g.s - 1e-6))];
    };
    const throttle = (fn, ms) => { let t = 0, last = null; const run = () => { t = 0; fn(...last); }; return (...a) => { last = a; if (!t) t = setTimeout(run, ms); }; };
    const ph = (s) => `<span class="mpt-ph" aria-hidden="true">${esc(s)}</span>`;
    // a button's icon by the names in map-icons.js; a button's own words map onto them
    const ICON_OF = { Point: 'Point and Ping', 'Add Square Overlay': 'Square overlay', 'Add Circle Overlay': 'Circle overlay', 'Add Cone Overlay': 'Cone overlay', 'Add Line Overlay': 'Line overlay', 'Reveal overlay': 'Hide overlay', COMBAT: 'Combat', HIDE: 'Hide', REVEAL: 'Hide', RING: 'Ring', SIZE: 'Size', MORE: 'More' };
    const ic = (name, fallback = '') => { const svg = window.MapIcons?.get(ICON_OF[name] || name); return svg ? `<span class="mpt-ph" aria-hidden="true">${svg}</span>` : ph(fallback || name[0]); };
    const art = (x) => (x.art ? `<img src="${esc(x.art)}" alt="" referrerpolicy="no-referrer" draggable="false" onerror="this.remove()">` : '');
    const clock = (at, skew) => { const s = Math.max(0, Math.floor((Date.now() + skew - at) / 1000)); return (Math.floor(s / 3600) ? `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}` : Math.floor(s / 60)) + ':' + String(s % 60).padStart(2, '0'); };

    // the turn tracker: the current creature first and larger, then the order as it comes; a hidden monster's turn is the "DM's turn" card
    function tiles(f) {
        if (!f) return '';
        const on = f.phase === 'running', i = Math.max(0, f.entries.findIndex((e) => e.id === f.turn)), list = on ? [...f.entries.slice(i), ...f.entries.slice(0, i)] : f.entries;
        const skew = (f.now || Date.now()) - Date.now();
        const tile = (e) => {
            const now = on && e.id === f.turn, dead = e.down || e.status === 'down';
            if (e.kind === 'dm') return `<div class="mpt-tile on dmturn" id="dm-turn" aria-current="true" title="DM's turn">DM's turn</div>`;
            return `<div class="mpt-tile${now ? ' on' : ''}${e.hidden ? ' hid' : ''}${dead ? ' dead' : ''}"${now ? ' aria-current="true"' : ''} title="${esc(e.name)}">${art(e)}<span>${esc(initials(e.name))}</span></div>`;
        };
        return `<div class="mpt-trt"><span>${on ? `Round <b>${f.round}</b>` : 'Rolling'}</span>${f.startedAt ? `<span data-fi-time="${f.startedAt}" data-skew="${skew}">${clock(f.startedAt, skew)}</span>` : ''}</div>${list.map(tile).join('')}`;
    }

    function mount(root, c, opts = {}) {
        const part = (n) => root.querySelector(`[data-mp=${n}]`);
        const view = part('view');
        const tools = (() => { try { return JSON.parse(localStorage.getItem(TOOLKEY)) || {}; } catch (e) { return {}; } })();
        const S = Object.assign({ fogShape: 'square', fogSize: 3, penMode: 'pen', penSize: 1, penColor: 0, ovType: 'square', ovColor: 0, ovPat: 1, pointColor: 5 }, tools, {
            c, dm: !!opts.dm && !opts.table, full: !!opts.full && !opts.table, table: !!opts.table, me: opts.me || '', v: null, m: null, open: null, tool: 'select', k: 1, tx: 0, ty: 0, fitted: '', lines: true,
            picks: new Set(), panel: null, pop: null, sideOn: false, endPop: false, poly: [], box: null, hover: null, newOv: null, ruler: null, rulers: {}, fogLive: {}, trails: [], fogUndo: [], clip: null, space: false,
            brTab: 'mon', brQ: '', brType: '', brSize: '', brCr: '', brFilters: false, mons: null, comp: null, party: null, paused: false, failed: false, moved: false, fight: null,
        });
        const remember = () => { const { fogShape, fogSize, penMode, penSize, penColor, ovType, ovColor, ovPat, pointColor } = S; try { localStorage.setItem(TOOLKEY, JSON.stringify({ fogShape, fogSize, penMode, penSize, penColor, ovType, ovColor, ovPat, pointColor })); } catch (e) { } };
        // ---- the stage ----
        view.innerHTML = `<div class="mp-stage"><img class="mp-img" alt="" draggable="false"><div class="mp-under"><canvas class="mp-marks"></canvas><div class="mp-grid"></div></div><div class="mp-toks"></div>
            <canvas class="mp-fog"></canvas><svg class="mp-ruler" aria-hidden="true"></svg><div class="mp-box" hidden></div></div><p class="mp-msg muted" hidden></p>`;
        const $ = (s) => view.querySelector(s);
        const stage = $('.mp-stage'), img = $('.mp-img'), under = $('.mp-under'), marks = $('.mp-marks'), grid = $('.mp-grid'), toks = $('.mp-toks'), fogC = $('.mp-fog'), svg = $('.mp-ruler'), box = $('.mp-box'), msg = $('.mp-msg');
        const offline = () => S.failed || !navigator.onLine;
        const canEdit = () => !S.table && !offline() && (S.dm || !S.paused);
        const tokOf = (k) => S.m?.tokens.find((t) => t.k === k);
        const ovOf = (id) => S.m?.overlays?.find((o) => o.id === id);
        const span = (t) => (SIZES[t.size] || 1) * S.m.grid.s;
        const entryOf = (t) => S.fight?.entries.find((e) => e.id === t.fight) || null;
        const movable = (t) => (S.dm || t.mine) && !t.locked;
        const allowed = (t) => S.dm || ['select', 'pan', 'draw', 'ruler', 'point'].includes(t);

        // ---- loading ----
        let loadN = 0;
        // Send to initiative (3.3): /campaigns/<id>/map?send=<monster ids> from the Monster Sheet fills the displayed map's Combat
        // Encounter, or the one the DM picks when none is displayed. Taken off the address at once, so a reload doesn't send it twice.
        const sending = { ids: S.dm && S.full ? new URLSearchParams(location.search).get('send') : null, picked: false, asked: false };
        if (sending.ids) history.replaceState(null, '', location.pathname);
        async function sendGo() {
            if (!sending.ids) return;
            if (!S.m || (S.v.active !== S.m.id && !sending.picked)) {
                if (sending.asked) return;
                sending.asked = true;
                openMaps();
                mapsDlg.querySelector('h2').textContent = 'Pick a map for this encounter';
                mapsDlg.addEventListener('close', () => { if (sending.ids && !sending.picked) { sending.ids = null; toast('Nothing was sent. No map was picked.'); } });
                return;
            }
            const ids = sending.ids.split(',');
            sending.ids = null;
            if (!S.mons) await loadMons();
            const mons = ids.map((id) => (S.mons || []).find((x) => x.id === id)).filter(Boolean).map((x) => ({ mon: x.id, ...stats(x) }));
            const out = await post({ op: 'send', mons });
            if (!out) return;
            S.sideOn = true;
            await load();
            toast(`Added ${out.sent} to the Combat Encounter. Check them, then start the fight.`, 'ok');
        }
        async function load() {
            const n = ++loadN; // only the newest counts: a slow older answer mustn't put back a map the DM has moved on from
            try {
                const r = await fetch('/campaigns/maps.php?c=' + encodeURIComponent(c) + (S.dm && S.open ? '&m=' + encodeURIComponent(S.open) : '') + (S.table ? '&as=table' : ''), { cache: 'no-store' });
                if (!r.ok) throw new Error(r.status);
                const v = await r.json(), was = S.m;
                if (n !== loadN) return;
                S.v = v; S.m = v.map; S.failed = false;
                if (S.dm && S.open && !S.m && v.active) { S.open = null; return load(); } // the map opened was archived elsewhere
                if (S.dm && S.full && !S.m && !S.open) { const first = (v.maps || []).find((x) => !x.archived); if (first) { S.open = first.id; return load(); } }
                if (S.dm && S.full && !S.open && S.m) S.open = S.m.id; // off the map page, the DM always sees what's on the table
                sendGo();
                if (was?.id !== S.m?.id || was?.fog?.ops?.length !== S.m?.fog?.ops?.length) S.fogLive = {}; // a saved stroke replaces its live copy
                if (was?.id !== S.m?.id) { S.picks.clear(); S.panel = null; S.poly = []; S.fogUndo = []; S.fogOps = null; }
                for (const id of [...S.picks]) if (!tokOf(id) && !ovOf(id)) S.picks.delete(id);
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
            drawStage(); drawBar(); drawTop(); drawRail(); drawOpts(); drawTray(); drawSide(); drawCluster(); drawPaused(); drawMenu();
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
                msg.textContent = S.failed ? "Couldn't load the map. Check your connection." : S.dm ? (S.v?.maps?.some((x) => !x.archived) ? 'Pick a map from your maps, or upload a new one.' : 'Upload a map picture to start.') : 'Waiting for the DM to display a map.';
                return;
            }
            stage.hidden = false; msg.hidden = true;
            stage.style.width = m.w + 'px'; stage.style.height = m.h + 'px';
            if (m.img && img.getAttribute('src') !== m.img) img.src = m.img;
            img.hidden = !m.img;
            stage.classList.toggle('mp-pl', !S.dm);
            if (S.fitted !== m.id && view.offsetWidth) { S.fitted = m.id; fit(); }
            drawFog(); drawGrid(); drawMarks(); drawToks(); drawLive(); place();
        }
        function place() {
            stage.style.transform = `translate(${S.tx}px, ${S.ty}px) scale(${S.k})`;
            stage.style.setProperty('--k', S.k);
            placeMenu();
            drawCluster();
        }
        // ---- fog, the DM's copy: light blue, over the tokens ----
        const fogScale = (m) => Math.min(1, FOG_RES / Math.max(m.w, m.h));
        function paintFogOp(x, op, m) {
            x.globalCompositeOperation = op.on ? 'source-over' : 'destination-out';
            x.fillStyle = x.strokeStyle = fogColour();
            if (op.all) return x.fillRect(0, 0, m.w, m.h);
            if (op.poly) { x.beginPath(); op.poly.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b))); x.closePath(); return x.fill(); }
            if (op.shape === 'round') {
                x.lineWidth = op.r * 2; x.lineCap = x.lineJoin = 'round'; x.beginPath();
                op.pts.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b)));
                if (op.pts.length === 1) x.lineTo(op.pts[0][0] + 0.1, op.pts[0][1]);
                return x.stroke();
            }
            const st = (a, b) => x.fillRect(a - op.r, b - op.r, op.r * 2, op.r * 2), P = op.pts;
            st(...P[0]);
            for (let i = 1; i < P.length; i++) { const dx = P[i][0] - P[i - 1][0], dy = P[i][1] - P[i - 1][1], n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / (op.r / 2))); for (let j = 1; j <= n; j++) st(P[i - 1][0] + (dx * j) / n, P[i - 1][1] + (dy * j) / n); }
        }
        // the owner's screenshots: light blue for the DM, the page's own background for everyone else, so fog looks like blank space
        function fogColour() {
            if (S.dm) return '#4a9fdc';
            if (S.fogBg) return S.fogBg;
            for (let el = view; el; el = el.parentElement) { const c = getComputedStyle(el).backgroundColor; if (c && c !== 'transparent' && !/, 0\)$/.test(c)) return (S.fogBg = c); }
            return (S.fogBg = '#000');
        }
        // the saved strokes live on a canvas of their own, so a stroke in progress doesn't replay them all
        const fogBase = document.createElement('canvas');
        function drawFog(force) {
            const m = S.m, ops = m.fog?.ops || [], k = fogScale(m), W = Math.round(m.w * k), H = Math.round(m.h * k), now = Date.now();
            if (force || S.fogOps !== ops || S.fogN !== ops.length || fogBase.width !== W) {
                S.fogOps = ops; S.fogN = ops.length;
                fogBase.width = W; fogBase.height = H;
                const x = fogBase.getContext('2d');
                x.setTransform(k, 0, 0, k, 0, 0);
                for (const op of ops) paintFogOp(x, op, m);
            }
            if (fogC.width !== W || fogC.height !== H) { fogC.width = W; fogC.height = H; }
            const x = fogC.getContext('2d');
            x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'source-over'; x.clearRect(0, 0, W, H); x.drawImage(fogBase, 0, 0);
            x.setTransform(k, 0, 0, k, 0, 0);
            for (const [who, l] of Object.entries(S.fogLive)) { if (now - l.at > 2500) delete S.fogLive[who]; else paintFogOp(x, l.op, m); }
            if (G?.type === 'fog') paintFogOp(x, G.op, m);
        }
        // does this spot on the map have fog on it, as the DM's canvas has it (the checks use this)
        const foggedAt = (px, py) => { const m = S.m, k = fogScale(m); return fogC.getContext('2d').getImageData(Math.floor(px * k), Math.floor(py * k), 1, 1).data[3] > 128; };
        function drawGrid() {
            const m = S.m, g = m.grid;
            grid.hidden = !S.lines;
            const [x0, y0, cols, rows] = cells(g, m.w, m.h);
            Object.assign(grid.style, { left: x0 + 'px', top: y0 + 'px', width: cols * g.s + 'px', height: rows * g.s + 'px', backgroundSize: `${g.s}px ${g.s}px` });
        }
        // ---- drawings and overlays ----
        const patCache = {};
        function pattern(ctx, color, i) {
            const key = color + i;
            if (patCache[key]) return patCache[key];
            const cv = document.createElement('canvas'); cv.width = cv.height = 24; const x = cv.getContext('2d');
            x.strokeStyle = x.fillStyle = color; x.lineWidth = 3;
            const L = (a, b, e, f) => { x.beginPath(); x.moveTo(a, b); x.lineTo(e, f); x.stroke(); }, D = (a, b, r) => { x.beginPath(); x.arc(a, b, r, 0, 7); x.fill(); };
            const P = [() => { x.fillRect(0, 0, 24, 24); }, () => { x.globalAlpha = 0.4; x.fillRect(0, 0, 24, 24); }, () => { L(-6, 24, 24, -6); L(6, 30, 30, 6); }, () => { L(0, -6, 30, 24); L(-6, 6, 18, 30); }, () => { L(0, 12, 24, 12); }, () => { L(12, 0, 12, 24); },
                () => { L(0, 12, 24, 12); L(12, 0, 12, 24); }, () => { D(6, 6, 2.5); D(18, 18, 2.5); }, () => { D(12, 12, 7); }, () => { x.fillRect(0, 0, 12, 12); x.fillRect(12, 12, 12, 12); }, () => { x.beginPath(); x.moveTo(0, 12); x.quadraticCurveTo(6, 2, 12, 12); x.quadraticCurveTo(18, 22, 24, 12); x.stroke(); },
                () => { x.beginPath(); x.moveTo(0, 18); x.lineTo(12, 6); x.lineTo(24, 18); x.stroke(); }, () => { x.beginPath(); x.arc(12, 12, 7, 0, 7); x.stroke(); }, () => { L(0, 6, 24, 6); L(0, 18, 24, 18); L(6, 0, 6, 6); L(18, 6, 18, 18); L(6, 18, 6, 24); }, () => { L(12, 4, 12, 20); L(4, 12, 20, 12); L(6, 6, 18, 18); L(18, 6, 6, 18); }];
            (P[i] || P[0])();
            return (patCache[key] = ctx.createPattern(cv, 'repeat'));
        }
        function overlayPath(o, s) {
            const p = new Path2D(), C = Math.cos(o.ang), N = Math.sin(o.ang), pt = (a, b) => [o.x + a * C - b * N, o.y + a * N + b * C];
            if (o.type === 'circle') { p.arc(o.x, o.y, o.len, 0, 7); return p; }
            const list = o.type === 'square' ? [[-o.len / 2, -o.len / 2], [o.len / 2, -o.len / 2], [o.len / 2, o.len / 2], [-o.len / 2, o.len / 2]] : o.type === 'cone' ? [[0, 0], [o.len, -o.len / 2], [o.len, o.len / 2]] : [[0, -s / 2], [o.len, -s / 2], [o.len, s / 2], [0, s / 2]];
            list.forEach(([a, b], i) => { const [X, Y] = pt(a, b); if (i) p.lineTo(X, Y); else p.moveTo(X, Y); });
            p.closePath();
            return p;
        }
        const handles = (o) => { const C = Math.cos(o.ang), N = Math.sin(o.ang), r = o.type === 'square' ? o.len * 0.7 : o.len, a = o.type === 'square' ? o.ang + Math.PI / 4 : o.ang, s = S.m.grid.s; return { size: [o.x + r * Math.cos(a), o.y + r * Math.sin(a)], turn: [o.x + (r + s * 0.6) * C, o.y + (r + s * 0.6) * N] }; };
        function drawMarks() {
            const m = S.m, K = Math.min(1, MARK_RES / Math.max(m.w, m.h)), W = Math.round(m.w * K), H = Math.round(m.h * K);
            if (marks.width !== W || marks.height !== H) { marks.width = W; marks.height = H; }
            const x = marks.getContext('2d'), s = m.grid.s;
            x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, W, H); x.setTransform(K, 0, 0, K, 0, 0);
            x.lineCap = x.lineJoin = 'round';
            for (const d of [...(m.draws || []), ...(G?.type === 'draw' ? [G.d] : [])]) {
                x.strokeStyle = COLORS[d.c] || COLORS[0]; x.lineWidth = ((BRUSH[d.s] || 6) * s) / 70; x.beginPath();
                d.pts.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b)));
                if (d.pts.length === 1) x.lineTo(d.pts[0][0] + 0.1, d.pts[0][1]);
                x.stroke();
            }
            for (const o of [...(m.overlays || []), ...(S.newOv ? [S.newOv] : [])]) {
                const path = overlayPath(o, s), col = COLORS[o.color] || COLORS[0];
                x.save(); x.globalAlpha = o.hidden ? 0.25 : o === S.newOv ? 0.55 : 0.4; x.fillStyle = pattern(x, col, o.pat); x.fill(path);
                x.globalAlpha = o.hidden ? 0.4 : 1; x.shadowColor = col; x.shadowBlur = 16 * K; x.strokeStyle = col; x.lineWidth = 2 / Math.max(S.k, 0.2); x.stroke(path); x.restore();
            }
        }
        // ---- tokens ----
        const face = (t) => `<span class="mp-face">${art(t)}<span aria-hidden="true">${esc(initials(t.name))}</span></span>`;
        function drawToks() {
            const m = S.m, have = new Map([...toks.children].map((el) => [el.dataset.k, el]));
            for (const t of m.tokens.filter((x) => x.placed)) {
                let el = have.get(t.k);
                have.delete(t.k);
                const hideName = t.noName && !S.dm;
                const inFight = !!S.fight && t.kind === 'monster' && t.fight;
                const html = face(t) + (hideName ? '' : `<span class="mp-name">${esc(t.name)}</span>`) + (window.Conds?.row(t.conds || t.cond) || '') + (t.ac != null && (S.dm ? inFight : true) ? `<span class="mp-ac" title="Armour Class">${esc(t.ac)}</span>` : '');
                if (!el) { el = document.createElement('button'); el.type = 'button'; el.className = 'mp-tok'; el.dataset.k = t.k; toks.append(el); }
                if (el.dataset.html !== html) { el.innerHTML = html; el.dataset.html = html; }
                const sz = span(t);
                if (G?.type !== 'move' || !G.items?.some((i) => i.t.k === t.k)) Object.assign(el.style, { left: t.x + 'px', top: t.y + 'px' });
                Object.assign(el.style, { width: sz + 'px', height: sz + 'px', zIndex: S.picks.has(t.k) ? 2 : '' });
                el.style.setProperty('--ring', t.ring || '');
                const down = t.status === 'down' || (t.kind === 'pc' && t.down);
                el.className = 'mp-tok' + (t.turn ? ' on' : '') + (t.status === 'bloodied' ? ' bloodied' : '') + (down ? ' down' : '') + (t.hidden ? ' hid' : '') + (t.ring ? ' ringed' : '') + (t.mine ? ' mine' : '') + (t.noName ? ' noname' : '')
                    + (movable(t) && canEdit() ? ' can' : '') + (S.picks.has(t.k) ? ' picked' : '') + (G?.type === 'move' && G.items?.some((i) => i.t.k === t.k) ? ' drag' : '');
                el.setAttribute('aria-label', t.name + (t.turn ? ', their turn' : '') + (down ? ', down' : t.status === 'bloodied' ? ', bloodied' : '') + (t.hidden ? ', hidden from players' : '') + (t.conds?.length ? ', ' + t.conds.join(', ') : ''));
            }
            for (const el of have.values()) el.remove();
        }
        // ---- what moves on top: rulers, pings, trails, the polygon being drawn, an overlay's handles ----
        const centre = (p) => { const g = S.m.grid, [x0, y0] = cells(g, S.m.w, S.m.h); return [x0 + (Math.floor((p[0] - x0) / g.s) + 0.5) * g.s, y0 + (Math.floor((p[1] - y0) / g.s) + 0.5) * g.s]; };
        const feet = (pts) => pts.slice(1).reduce((n, p, i) => n + Math.round(Math.max(Math.abs(p[0] - pts[i][0]), Math.abs(p[1] - pts[i][1])) / S.m.grid.s) * 5, 0);
        const pillSvg = (text, x, y) => { const f = 13 / S.k; return `<text class="mp-pill" x="${x}" y="${y}" font-size="${f}" text-anchor="middle">${esc(text)}</text>`; };
        let liveQ = 0;
        function drawLive() {
            const m = S.m;
            if (!m) return;
            svg.setAttribute('viewBox', `0 0 ${m.w} ${m.h}`); svg.setAttribute('width', m.w); svg.setAttribute('height', m.h);
            const now = Date.now(), out = [], r = (n) => n / S.k;
            const dt = Math.min(100, now - (S.liveAt || now));
            S.liveAt = now;
            for (const t of S.trails) {
                const f = 1 - Math.exp(-dt / 70); // how far it closes on the cursor this frame: slightly behind, never far
                t.head = [t.head[0] + (t.target[0] - t.head[0]) * f, t.head[1] + (t.target[1] - t.head[1]) * f];
                t.tail.push([t.head[0], t.head[1], now]);
                t.tail = t.tail.filter((a) => now - a[2] < 500);
                if (t.mine && t.live && now - (t.sent || 0) > 500) { t.sent = now; sendTrail(t); } // still held: the others keep showing it
            }
            S.trails = S.trails.filter((t) => t.live || now - t.at < 1300);
            const list = [...Object.values(S.rulers), ...(S.ruler ? [{ name: '', pts: S.ruler, mine: true }] : [])].filter((x) => x.m === undefined || x.m === m.id);
            for (const u of list) {
                if (u.pts.length < 2) continue;
                const e = u.pts[u.pts.length - 1], label = `${feet(u.pts)} ft${u.name ? ' · ' + u.name : ''}`;
                out.push(`<g class="${u.mine ? 'mine' : ''}"><polyline points="${u.pts.map((q) => q.join(',')).join(' ')}"/>${u.pts.map((q) => `<circle cx="${q[0]}" cy="${q[1]}" r="${r(4)}"/>`).join('')}<text x="${e[0] + r(10)}" y="${e[1] - r(10)}" font-size="${r(14)}">${esc(label)}</text></g>`);
            }
            for (const t of S.trails) {
                const col = COLORS[t.c] || COLORS[5], fade = t.live ? 1 : Math.max(0, 1 - (now - t.at) / 1300);
                t.tail.forEach((a, i) => { if (!i) return; const b = t.tail[i - 1], f = 1 - (now - a[2]) / 500; out.push(`<line class="mp-trail" x1="${b[0]}" y1="${b[1]}" x2="${a[0]}" y2="${a[1]}" style="stroke:${col};stroke-width:${r(7 * f)};opacity:${f * fade}"/>`); });
                out.push(`<circle class="mp-point" cx="${t.head[0]}" cy="${t.head[1]}" r="${r(14)}" style="fill:${col};opacity:${0.25 * fade}"/><circle class="mp-point" cx="${t.head[0]}" cy="${t.head[1]}" r="${r(7)}" style="fill:${col};opacity:${fade}"/>`);
            }
            if (S.dm && S.tool === 'fog' && S.hover && S.fogShape !== 'polygon') {
                const b = (S.fogSize * m.grid.s) / 2, [hx, hy] = S.hover;
                out.push(S.fogShape === 'round' ? `<circle class="mp-brush" cx="${hx}" cy="${hy}" r="${b}" style="stroke-width:${r(1.5)}"/>` : `<rect class="mp-brush" x="${hx - b}" y="${hy - b}" width="${b * 2}" height="${b * 2}" style="stroke-width:${r(1.5)}"/>`);
            }
            if (S.poly.length) out.push(`<polyline class="mp-polyd" style="stroke-width:${r(2)}" points="${[...S.poly, ...(S.hover ? [S.hover] : [])].map((q) => q.join(',')).join(' ')}"/><circle class="mp-polys" cx="${S.poly[0][0]}" cy="${S.poly[0][1]}" r="${r(7)}"/>`);
            const axis = (o) => { const R = o.type === 'square' ? o.len / 2 : o.len, ex = o.x + R * Math.cos(o.ang), ey = o.y + R * Math.sin(o.ang); return `<line class="mp-axis" x1="${o.x}" y1="${o.y}" x2="${ex}" y2="${ey}" style="stroke-width:${r(3)};stroke-dasharray:${r(12)} ${r(8)}"/>` + pillSvg(Math.round(o.len / m.grid.s) * 5 + ' ft', ex + r(14) * Math.cos(o.ang), ey + r(14) * Math.sin(o.ang)); };
            if (S.newOv) out.push(axis(S.newOv));
            if (S.dm) for (const id of S.picks) { const o = ovOf(id); if (!o) continue; const h = handles(o); out.push(axis(o) + `<circle class="mp-hsize" cx="${h.size[0]}" cy="${h.size[1]}" r="${r(7)}"/><circle class="mp-hturn" cx="${h.turn[0]}" cy="${h.turn[1]}" r="${r(7)}"/>`); }
            svg.innerHTML = out.join('');
            if (S.trails.length && !liveQ) liveQ = requestAnimationFrame(() => { liveQ = 0; drawLive(); });
        }

        // ---- the small page's buttons (campaign page) ----
        const pressed = (b) => ` aria-pressed="${!!b}"`;
        const myToks = () => (S.m?.tokens || []).filter((t) => t.mine && t.placed);
        function drawBar() {
            const el = part('bar');
            if (!el) return;
            const html = S.m ? `<button type="button" class="btn small" data-mpa="fit">Fit</button><button type="button" class="btn small" data-mpa="me"${myToks().length ? '' : ' disabled'}>Centre on me</button>
                <button type="button" class="btn small" data-mpa="toolruler" title="Ruler (R): drag to measure, right click or a second finger adds a corner"${pressed(S.tool === 'ruler')}>Ruler</button><button type="button" class="btn small" data-mpa="lines"${pressed(S.lines)}>Grid lines</button>` : '';
            if (el.dataset.h !== html) { el.innerHTML = html; el.dataset.h = html; }
        }
        // ---- top bar ----
        function drawTop() {
            const L = part('tl'), M = part('menuPick'), T = part('tracker');
            if (T) T.innerHTML = tiles(S.fight);
            if (L && S.dm && !L.contains(document.activeElement)) {
                const list = (S.v?.maps || []).filter((x) => !x.archived);
                L.innerHTML = `<button type="button" class="mpt-ico${S.sideOn ? ' on' : ''}" data-mpa="side"${pressed(S.sideOn)} aria-label="Show or hide the combat panel" title="Combat panel">${ic('Combat panel')}</button>
                    <select class="field" data-mpi="map" aria-label="Map">${list.map((x) => `<option value="${esc(x.id)}"${x.id === S.m?.id ? ' selected' : ''}>${esc(x.name)}${S.v.active === x.id ? ' (displayed)' : ''}</option>`).join('')}${list.length ? '' : '<option value="">No maps yet</option>'}<option value="__browse">Browse maps...</option></select>`;
            }
            if (M && !M.contains(document.activeElement)) M.innerHTML = `<select class="field" data-mpi="menu" aria-label="Menu"><option value="">Menu</option><option value="camp">Campaign page</option>${S.dm ? '<option value="spec">Spectator window</option><option value="maps">Browse maps</option><option value="grid">Fit the grid</option>' : ''}<option value="set">Settings and shortcuts</option></select>`;
        }
        function drawCluster() {
            const z = part('zoom'), m = S.m;
            if (!z) return;
            const shown = S.v?.active === m?.id, sig = [Math.round(S.k * 100), shown, !!m, S.dm, !!document.fullscreenElement].join();
            if (z.dataset.v === sig) return;
            z.dataset.v = sig;
            z.innerHTML = (S.dm && S.full && m ? (shown ? `<button type="button" class="btn small" data-mpa="hidemap">${ic('Hide or Display map')} Hide map</button>` : `<button type="button" class="btn small primary" data-mpa="showmap">${ic('Hide or Display map')} Display map</button>`) : '')
                + (m ? `<div class="mpt-brg"><button type="button" data-mpa="zoom" data-f="0.8" aria-label="Zoom out" title="Zoom out">−</button><span>${Math.round(S.k * 100)}%</span><button type="button" data-mpa="zoom" data-f="1.25" aria-label="Zoom in" title="Zoom in">+</button></div>` : '')
                + `<div class="mpt-brg"><button type="button" data-mpa="full" aria-label="Full screen" title="Full screen">${ic('Full screen')}</button>${S.dm && S.full ? `<a href="/campaigns/${esc(c)}/table" target="_blank" rel="noopener" data-act="tv" aria-label="Open Spectator window" title="Open Spectator window">${ic('Spectator window')}</a>` : ''}</div>`
                + (S.full ? `<div class="mpt-brg"><button type="button" data-mpa="settings" aria-label="Settings and shortcuts" title="Settings and shortcuts">${ic('Settings')}</button></div>` : '');
        }
        function drawRail() {
            const r = part('rail');
            if (!r) return;
            const G2 = (list) => `<div class="mpt-railg">${list.filter(([t]) => allowed(t)).map(([t, key, name]) => `<button type="button" class="mpt-ico" data-mpa="tool" data-t="${t}" aria-pressed="${S.tool === t}" aria-label="${name}" title="${name} (${key})">${ic(name, key)}</button>`).join('')}</div>`;
            const html = G2(TOOLS_A) + G2(TOOLS_B);
            if (r.dataset.h !== html) { r.innerHTML = html; r.dataset.h = html; }
        }
        const icoBtn = (a, v, p, name, on) => `<button type="button" class="mpt-ico${on ? ' on' : ''}" data-mpa="${a}" data-v="${v}" aria-pressed="${!!on}" aria-label="${name}" title="${name}">${ic(name, p)}</button>`;
        const swatches = (a, on) => `<div class="mpt-row">${COLORS.map((col, i) => `<button type="button" class="mpt-swatch${i === on ? ' on' : ''}" style="background:${col}" data-mpa="${a}" data-v="${i}" aria-label="Colour ${i + 1}" title="Colour ${i + 1}"></button>`).join('')}</div>`;
        const colourBtn = (i, name = 'Colour') => `<button type="button" class="mpt-ico${S.pop === 'colour' ? ' on' : ''}" data-mpa="pop" data-v="colour" aria-label="${name}" title="${name}"><span class="mpt-dot" style="background:${COLORS[i]}"></span></button>`;
        function drawOpts() {
            const o = part('opts');
            if (!o) return;
            const T = S.tool, focus = document.activeElement, keepId = focus && o.contains(focus) ? focus.dataset.mpi : null, caret = focus?.selectionStart;
            if (!['tokens', 'fog', 'draw', 'overlay', 'point'].includes(T) || !allowed(T)) { o.hidden = true; o.innerHTML = ''; o.dataset.h = ''; return; }
            o.hidden = false;
            let h = '';
            if (T === 'fog') {
                h = `<div class="mpt-flyg">${icoBtn('fogall', '1', 'CA', 'Cover All')}${icoBtn('fogall', '0', 'RA', 'Reveal All')}<hr>${icoBtn('fogshape', 'square', 'Sq', 'Square brush', S.fogShape === 'square')}${icoBtn('fogshape', 'round', 'Ro', 'Round brush', S.fogShape === 'round')}${icoBtn('fogshape', 'polygon', 'Pg', 'Polygon', S.fogShape === 'polygon')}${icoBtn('pop', 'size', 'Sz', 'Brush size', S.pop === 'size')}</div>`;
                if (S.pop === 'size') h += `<div class="mpt-pop"><label>Brush size: <span data-mp="fogn">${S.fogSize}</span> squares<br><input type="range" data-mpi="fogsize" min="1" max="9" value="${S.fogSize}"></label></div>`;
                else if (S.fogShape === 'polygon') h += '<div class="mpt-pop"><p class="mpt-hint">Click points, then click the first point or double-click to close. Left click reveals, right click covers.</p></div>';
            } else if (T === 'draw') {
                h = `<div class="mpt-flyg">${icoBtn('penmode', 'pen', 'Pn', 'Pen', S.penMode === 'pen')}${icoBtn('penmode', 'erase', 'Er', 'Erase drawing', S.penMode === 'erase')}<hr>${icoBtn('pop', 'size', String(S.penSize + 1), 'Pen size', S.pop === 'size')}${colourBtn(S.penColor)}${S.dm ? `<hr>${icoBtn('cleardraw', '', 'Cl', 'Clear drawings')}` : ''}</div>`;
                if (S.pop === 'size') h += `<div class="mpt-pop"><div class="mpt-row">${BRUSH.map((b, i) => `<button type="button" class="btn small${i === S.penSize ? ' primary' : ''}" data-mpa="pensize" data-v="${i}"${pressed(i === S.penSize)}>${i + 1}</button>`).join('')}</div></div>`;
                if (S.pop === 'colour') h += `<div class="mpt-pop">${swatches('pencolor', S.penColor)}</div>`;
            } else if (T === 'overlay') {
                const so = [...S.picks].map(ovOf).filter(Boolean)[0];
                h = `<div class="mpt-flyg">${[['square', 'Sq', 'Add Square Overlay'], ['circle', 'Ci', 'Add Circle Overlay'], ['cone', 'Cn', 'Add Cone Overlay'], ['line', 'Ln', 'Add Line Overlay']].map(([v, p, n]) => icoBtn('ovtype', v, p, n, S.ovType === v)).join('')}<hr>${colourBtn(S.ovColor, 'Overlay colour')}${icoBtn('pop', 'pattern', 'Pa', 'Overlay pattern', S.pop === 'pattern')}${so ? `<hr>${icoBtn('ovhide', '', 'Hi', so.hidden ? 'Reveal overlay' : 'Hide overlay', so.hidden)}${icoBtn('delete', '', 'X', 'Delete overlay')}` : ''}</div>`;
                if (S.pop === 'colour') h += `<div class="mpt-pop">${swatches('ovcolor', S.ovColor)}</div>`;
                if (S.pop === 'pattern') h += `<div class="mpt-pop"><label>Pattern<select class="field" data-mpi="ovpat">${PATTERNS.map((p, i) => `<option value="${i}"${i === S.ovPat ? ' selected' : ''}>${p}</option>`).join('')}</select></label></div>`;
            } else if (T === 'point') {
                h = `<div class="mpt-flyg">${colourBtn(S.pointColor)}</div>`;
                if (S.pop === 'colour') h += `<div class="mpt-pop">${swatches('ptcolor', S.pointColor)}</div>`;
            } else h = browser();
            if (o.dataset.h !== h) { o.innerHTML = h; o.dataset.h = h; }
            if (keepId) { const f = o.querySelector(`[data-mpi=${keepId}]`); if (f) { f.focus(); try { if (caret != null) f.setSelectionRange(caret, caret); } catch (e) { } } }
        }
        // ---- the Token Browser ----
        const crText = (n) => ({ 0.125: '1/8', 0.25: '1/4', 0.5: '1/2' }[n] || String(n));
        function browser() {
            const row = (add, name, sub, a) => `<div class="mpt-brow" data-add="${esc(add)}" role="button" tabindex="0" title="Click to add, or drag onto the map"><span class="mpt-port">${a ? art({ art: a }) : ''}<span>${esc(initials(name))}</span></span><span class="grow">${esc(name)}<small>${esc(sub)}</small></span></div>`;
            const toksOf = (k) => (S.m?.tokens || []).filter((t) => t.kind === k);
            let body;
            if (S.brTab === 'pc') body = `<div class="mpt-list">${toksOf('pc').map((t) => row('tok:' + t.k, t.name, t.placed ? 'On this map' : 'Not placed', t.art)).join('') || '<p class="mpt-hint">No characters in this campaign yet.</p>'}</div>`;
            else {
                const q = S.brQ.toLowerCase(), wait = (S.m?.tokens || []).filter((t) => t.kind !== 'pc' && !t.placed && (!q || t.name.toLowerCase().includes(q)));
                const mine = (S.mons || []).filter((x) => (!q || x.name.toLowerCase().includes(q)) && (!S.brType || x.type === S.brType) && (!S.brSize || SIZE_NAMES[x.size] === S.brSize) && (!S.brCr || x.cr === S.brCr));
                const have = new Set((S.mons || []).map((x) => x.src).filter(Boolean));
                const all = (S.comp || []).filter(([id, name, cr, type, , size]) => !have.has(id) && (!q || name.toLowerCase().includes(q)) && (!S.brType || type === S.brType) && (!S.brSize || size === S.brSize) && (!S.brCr || crText(cr) === S.brCr));
                const shown = all.slice(0, 80);
                const types = [...new Set([...(S.comp || []).map((x) => x[3]), ...(S.mons || []).map((x) => x.type)].filter(Boolean))].sort();
                const crs = [...new Set((S.comp || []).map((x) => x[2]))].sort((a, b) => a - b).map(crText);
                const opt = (v, list, name) => `<option value="">${name}</option>` + list.map((x) => `<option value="${esc(x)}"${x === v ? ' selected' : ''}>${esc(x)}</option>`).join('');
                body = `<div class="mpt-row" style="flex-wrap:nowrap"><input class="field" data-mpi="brq" type="search" placeholder="Search monsters" aria-label="Search monsters" value="${esc(S.brQ)}"><button type="button" class="mpt-ico${S.brFilters ? ' on' : ''}" data-mpa="brfilter"${pressed(S.brFilters)} aria-label="Filters" title="Filters">${ic('Filters')}</button></div>
                    ${S.brFilters ? `<div class="mpt-row"><select class="field" data-mpi="brtype" aria-label="Creature type">${opt(S.brType, types, 'Any type')}</select><select class="field" data-mpi="brsize" aria-label="Size">${opt(S.brSize, Object.values(SIZE_NAMES), 'Any size')}</select><select class="field" data-mpi="brcr" aria-label="Challenge rating">${opt(S.brCr, crs, 'Any CR')}</select></div>` : ''}
                    <div class="mpt-list">${wait.length ? `<p class="mpt-seclabel">NOT PLACED</p>${wait.map((t) => row('tok:' + t.k, t.name, SIZE_NAMES[t.size] || '', t.art)).join('')}` : ''}
                    ${[...new Set(mine.map((x) => x.enc || ''))].map((g) => { const l = mine.filter((x) => (x.enc || '') === g); return `<p class="mpt-seclabel">${esc((g || 'Unsorted').toUpperCase())}<button type="button" class="btn small" data-mpa="addenc" data-v="${esc(g)}">Add all (${l.length})</button></p>${l.map((x) => row('mon:' + x.id, x.name, [SIZE_NAMES[x.size], x.type].filter(Boolean).join(' '))).join('')}`; }).join('')}
                    ${shown.length ? `<p class="mpt-seclabel">COMPENDIUM</p>${shown.map(([id, name, cr, type, , size]) => row('cmp:' + id, name, `CR ${crText(cr)} · ${[size, type].filter(Boolean).join(' ')}`)).join('')}${all.length > shown.length ? `<p class="mpt-hint">${all.length - shown.length} more. Search to narrow it down.</p>` : ''}` : ''}
                    ${!wait.length && !mine.length && !shown.length ? `<p class="mpt-hint">${S.comp ? 'No monsters match.' : 'Loading monsters...'}</p>` : ''}</div>`;
            }
            return `<div class="mpt-browser"><div class="mpt-browserh"><span>Token Browser</span><button type="button" data-mpa="tool" data-t="select" aria-label="Close the Token Browser">✕</button></div>
                <div class="mpt-under"><button type="button" class="${S.brTab === 'mon' ? 'on' : ''}" data-mpa="brtab" data-v="mon">Monsters</button><button type="button" class="${S.brTab === 'pc' ? 'on' : ''}" data-mpa="brtab" data-v="pc">Players</button></div>${body}</div>`;
        }
        async function loadComp() {
            if (S.comp || S.compLoading) return;
            S.compLoading = true;
            try { const r = await fetch('/sheets/monster/monsters.json'); if (r.ok) S.comp = (await r.json()).list; } catch (e) { }
            S.compLoading = false;
            drawOpts();
        }
        async function loadMons() {
            if (!S.dm || !S.full) return;
            try { const r = await fetch('/campaigns/maps.php?mons&c=' + encodeURIComponent(c), { cache: 'no-store' }); if (r.ok) S.mons = (await r.json()).monsters; } catch (e) { }
            drawOpts();
        }
        // initiative bonus and AC as the Monster Sheet works them out (formula.js, with the ability modifiers, CR and proficiency)
        const calc = (f, V) => { try { const v = window.hbCalc(f, V).v; return Number.isFinite(v) ? v : NaN; } catch (e) { return NaN; } };
        function stats(x) {
            const V = { level: crNum(x.cr), cr: crNum(x.cr) };
            for (const a of x.abilities || []) { const n = +a.score || 10; V[String(a.key).replace(/\W/g, '').toLowerCase()] = Math.floor((n - 10) / 2); }
            V.prof = calc(x.prof || 'max(2, ceil(CR / 4) + 1)', V) || 2;
            const bonus = calc(x.init || 'DEX', V), ac = calc(x.ac || '10', V);
            return { bonus: Math.round(Number.isNaN(bonus) ? V.dex || 0 : bonus), ac: Number.isNaN(ac) ? null : Math.round(ac) };
        }
        const viewMid = () => { const r = view.getBoundingClientRect(); return [(r.width / 2 - S.tx) / S.k, (r.height / 2 - S.ty) / S.k]; };
        // add from the browser or the tray: p is where on the map it goes
        async function addToken(add, p) {
            const [kind, id] = [add.slice(0, 3), add.slice(4)];
            const at = (size) => { const s = (SIZES[size] || 1) * S.m.grid.s; return snap({ size }, p[0] - s / 2, p[1] - s / 2); };
            if (kind === 'tok') { const t = tokOf(id); if (!t) return; const [x, y] = at(t.size); return moveTo(t, x, y); }
            let mon = id;
            if (kind === 'cmp') {
                toast('Saving it to your Monster Sheet...');
                try { mon = (await window.MonImport.save(id)).id; } catch (e) { return toast(e.message || "Couldn't save that monster to your Monster Sheet. Try again.", 'err'); }
                await loadMons();
            }
            const src = (S.mons || []).find((x) => x.id === mon), [x, y] = at(src?.size || 'M');
            const out = await post({ op: 'place', mon, x, y, ...(src ? stats(src) : {}) });
            if (out) { await load(); if (out.k) { S.picks = new Set([out.k]); S.panel = null; drawToks(); drawMenu(); drawSide(); } }
        }
        // a whole Monster Sheet encounter, side by side from the middle of the view
        async function addGroup(g) {
            const q = S.brQ.toLowerCase(), list = (S.mons || []).filter((x) => (x.enc || '') === g && (!q || x.name.toLowerCase().includes(q)) && (!S.brType || x.type === S.brType) && (!S.brSize || SIZE_NAMES[x.size] === S.brSize) && (!S.brCr || x.cr === S.brCr));
            const [mx, my] = viewMid(), cols = Math.ceil(Math.sqrt(list.length)), gap = S.m.grid.s * 2;
            for (const [i, x] of list.entries()) await addToken('mon:' + x.id, [mx + (i % cols) * gap, my + Math.floor(i / cols) * gap]);
            S.picks.clear(); S.panel = null;
            draw();
        }
        function drawTray() {
            const el = part('tray');
            if (!el) return;
            const list = (S.m?.tokens || []).filter((t) => !t.placed && (S.dm || t.mine));
            el.hidden = !S.m || !list.length;
            const html = el.hidden ? '' : `<h2>Not placed <span class="n">${list.length}</span></h2><p class="muted">Drag one onto the map, or click it to put it in the middle.</p><div class="mp-trayl">${list.map((t) => `<button type="button" class="mp-trayt${t.hidden ? ' hid' : ''}" data-add="tok:${esc(t.k)}"${canEdit() ? '' : ' disabled'}>${face(t)}<span>${esc(t.name)}</span></button>`).join('')}</div>`;
            if (el.dataset.h !== html) { el.innerHTML = html; el.dataset.h = html; }
        }
        // ---- the left panel: Combat Encounter, then Initiative Order ----
        const crNum = (x) => { const r = /^\s*(\d+)\s*\/\s*(\d+)/.exec(String(x)); return r ? r[1] / r[2] : +x || 0; };
        const port = (x, label) => `<span class="mpt-port">${art(x)}<span>${esc(label || initials(x.name))}</span></span>`;
        const encOf = () => { const e = S.m?.enc; return e && Array.isArray(e.ids) ? e : { ids: [], init: {}, side: {} }; };
        const saveEnc = (e) => { S.m.enc = e; drawSide(); drawMenu(); return post({ op: 'enc', enc: e }); };
        // a copy's name without its letter, so all of a kind share a roll; a name of its own ("Goblin 1", "Goblin A") is its own kind
        const baseOf = (t) => (t.suffix && t.name.endsWith(' ' + t.suffix) ? t.name.slice(0, -t.suffix.length - 1) : t.name);
        const defaultInit = (t) => 10 + (t.bonus || 0);
        const d20 = (t) => 1 + Math.floor(Math.random() * 20) + (t.bonus || 0);
        function addEnc(list) {
            const e = encOf();
            for (const t of list) {
                if (e.ids.includes(t.k)) continue;
                const twin = t.kind === 'monster' ? e.ids.find((k) => { const x = tokOf(k); return x && x.kind === 'monster' && baseOf(x) === baseOf(t); }) : null;
                e.ids.push(t.k); e.side[t.k] = t.kind === 'pc' ? 'party' : 'enemy';
                if (e.init[t.k] === undefined) { if (t.kind === 'pc') e.init[t.k] = defaultInit(t); else if (twin && e.init[twin] !== undefined) e.init[t.k] = e.init[twin]; }
            }
            return saveEnc(e);
        }
        async function loadParty() {
            if (S.party) return;
            S.party = [];
            try { const r = await fetch('/sheets/monster/party.php?c=' + encodeURIComponent(c), { cache: 'no-store' }); if (r.ok) S.party = (await r.json()).chars; } catch (e) { }
            drawSide();
        }
        function difficulty(e) {
            if (!window.EncDiff) return null;
            const D = window.EncDiff, rules = (() => { try { return localStorage.getItem('encounter-rules') === '2024' ? '2024' : '2014'; } catch (x) { return '2014'; } })();
            const levels = (S.party || []).map((p) => clamp(p.level || 1, 1, 20)), xp = e.ids.map(tokOf).filter((t) => t && e.side[t.k] === 'enemy' && t.kind === 'monster').map((t) => D.crXp(t.cr) ?? 0);
            const r = D.rate(rules, levels, xp);
            return r.tier ? { name: r.tier.label.toUpperCase(), title: `${r.rules} rules. This fight: ${r.adjusted.toLocaleString()} XP. ${r.thresholds.map(([a, b]) => `${a} ${b.toLocaleString()}`).join(', ')}.` } : null;
        }
        function drawSide() {
            const box = part('side');
            if (!box) return;
            box.hidden = !S.dm || !S.sideOn;
            if (box.hidden) return;
            if (box.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return; // don't redraw under someone typing
            const f = S.fight, off = !canEdit() ? ' disabled' : '';
            let html;
            if (f) {
                const at = f.entries.findIndex((e) => e.id === f.turn), tokFor = (e) => (S.m?.tokens || []).find((t) => t.fight === e.id);
                html = `<h2>Initiative Order</h2><div class="mpt-rows">${f.entries.map((e, i) => {
                    const t = tokFor(e), dead = e.down || e.status === 'down';
                    return `<div class="mpt-orow${e.id === f.turn ? ' on' : ''}${dead ? ' dead' : ''}"${e.id === f.turn ? ' aria-current="true"' : ''}>${port(e)}<div style="min-width:0"><button type="button" class="mpt-rname" data-mpa="pick" data-v="${esc(t?.k || '')}" title="Select on the map">${esc(e.name)}${e.hidden ? '<span>hidden</span>' : ''}${e.archived ? '<span>Archived</span>' : ''}${e.missing ? '<span>Monster gone</span>' : ''}</button><div class="mpt-facts">${e.ac != null ? `<span>AC: <b>${esc(e.ac)}</b></span>` : ''}<label>Initiative: <input class="field mpt-num small" type="number" inputmode="numeric" data-fe="${esc(e.id)}" value="${e.init ?? ''}" placeholder="?" aria-label="${esc(e.name)} initiative"${off}></label><span class="mpt-mv"><button type="button" data-mpa="fmove" data-v="${esc(e.id)}" data-dir="-1" aria-label="Move ${esc(e.name)} up" title="Move up"${i ? off : ' disabled'}>↑</button><button type="button" data-mpa="fmove" data-v="${esc(e.id)}" data-dir="1" aria-label="Move ${esc(e.name)} down" title="Move down"${i < f.entries.length - 1 ? off : ' disabled'}>↓</button><button type="button" data-mpa="unfight" data-v="${esc(e.id)}" aria-label="Remove ${esc(e.name)} from combat" title="Remove from combat"${off}>✕</button></span></div></div>${e.hp ? `<button type="button" class="mpt-hpb" data-mpa="pickhp" data-v="${esc(t?.k || '')}" data-e="${esc(e.id)}" title="Change hit points"><b>${e.hp.cur}</b> / ${e.hp.max ?? '?'}</button>` : '<span></span>'}</div>`;
                }).join('') || '<p class="mpt-hint">Nobody yet.</p>'}</div>
                <form class="mpt-addent" data-fadd><input class="field" name="name" placeholder="Lair action" maxlength="80" aria-label="Name of an extra entry"${off}><input class="field" name="init" type="number" inputmode="numeric" placeholder="20" aria-label="Its initiative"${off}><button class="btn small"${off}>Add entry</button></form>
                <div class="mpt-foot">${f.phase === 'rolling' ? `<button type="button" class="btn primary grow" data-mpa="round1"${f.entries.length ? off : ' disabled'}>Start round 1</button><button type="button" class="btn" data-mpa="end"${off}>End combat</button>` : `<button type="button" class="mpt-ico" data-mpa="prev" aria-label="Previous turn" title="Previous turn"${off}>${ic('Previous turn')}</button><div class="mpt-stat">ROUND<b>${f.round}</b></div><div class="mpt-stat">TURN<b>${at + 1}</b></div><div class="mpt-stat">TIME<b data-fi-time="${f.startedAt}" data-skew="${(f.now || Date.now()) - Date.now()}">${clock(f.startedAt, (f.now || Date.now()) - Date.now())}</b></div>
                    <div class="mpt-next"><button type="button" class="btn primary" data-mpa="next"${off}>Next</button><button type="button" class="btn primary" data-mpa="endpop" aria-expanded="${S.endPop}" aria-label="More combat options" title="More combat options">▲</button></div>${S.endPop ? `<div class="mpt-endpop"><button type="button" class="btn" data-mpa="end"${off}>End combat</button></div>` : ''}`}</div>`;
            } else if (!S.m) html = '<h2>Combat Encounter</h2><p class="mpt-hint">Open a map to run an encounter.</p>';
            else {
                const e = encOf();
                const groups = (side) => { const by = new Map(); for (const k of e.ids) { if (e.side[k] !== side) continue; const t = tokOf(k); if (!t) continue; const key = t.kind === 'monster' ? baseOf(t) + '|' + e.init[k] : k; if (!by.has(key)) by.set(key, []); by.get(key).push(t); } return [...by.values()]; };
                const row = (g) => { const t = g[0], list = g.map((x) => x.k).join(); return `<div class="mpt-crow"><input class="field mpt-num" type="number" inputmode="numeric" data-initg="${esc(list)}" value="${e.init[t.k] ?? ''}" placeholder="?" aria-label="${esc(t.name)} initiative"${off}>${port(t)}<div style="min-width:0"><button type="button" class="mpt-rname" data-mpa="pick" data-v="${esc(t.k)}">${esc(g.length > 1 ? baseOf(t) : t.name)}${g.length > 1 ? `<span>x${g.length}</span>` : ''}${t.hidden ? '<span>hidden</span>' : ''}</button><div class="mpt-facts">${t.ac != null ? `<span>AC: <b>${esc(t.ac)}</b></span>` : ''}${t.hp ? `<span>HP: <b>${t.hp.max ?? t.hp.cur}</b></span>` : ''}<span>Initiative Bonus: <b>${sign(t.bonus || 0)}</b></span></div></div><button type="button" class="mpt-ico mpt-x" data-mpa="unenc" data-v="${esc(list)}" aria-label="Remove ${esc(t.name)}" title="Remove from the encounter">✕</button></div>`; };
                const P = groups('party'), E = groups('enemy'), nP = e.ids.filter((k) => e.side[k] === 'party' && tokOf(k)).length, nE = e.ids.filter((k) => e.side[k] === 'enemy' && tokOf(k)).length, spare = S.m.tokens.filter((t) => t.placed && !e.ids.includes(t.k)).length, dif = difficulty(e);
                const sec = (n, word, side) => (n ? `<div class="mpt-seclabel">${n} ${word}<button type="button" class="btn small" data-mpa="auto" data-v="${side}"${off}>Auto initiative</button></div>` : '');
                html = `<h2>Combat Encounter</h2>${spare ? `<div><button type="button" class="btn small" data-mpa="addall"${off}>Add all tokens (${spare})</button></div>` : ''}
                    <div class="mpt-rows">${sec(nP, 'PLAYERS', 'party')}${P.map(row).join('')}${sec(nE, 'ENEMIES', 'enemy')}${E.map(row).join('')}${nP + nE ? '' : '<p class="mpt-hint">Add tokens with Add all tokens, or select a token and press Combat.</p>'}</div>
                    ${dif ? `<div class="mpt-diff" title="${esc(dif.title)}">DIFFICULTY: <b>${esc(dif.name)}</b></div>` : ''}
                    <div class="mpt-foot"><button type="button" class="mpt-ico" data-mpa="encclear" aria-label="Clear the encounter" title="Clear the encounter"${off}>${ic('Clear encounter')}</button><button type="button" class="btn primary grow" data-mpa="start"${nP + nE ? off : ' disabled'}>Start combat</button></div>`;
            }
            if (box.dataset.h !== html) { box.innerHTML = html; box.dataset.h = html; }
        }
        function startCombat() {
            const e = encOf(), items = [], rolled = {};
            for (const k of e.ids) {
                const t = tokOf(k);
                if (!t) continue;
                // no number yet: roll now, one roll for all of a kind; the list keeps it blank, so the next fight rolls again
                const init = e.init[k] ?? (t.kind === 'pc' ? defaultInit(t) : t.kind === 'monster' ? (rolled[baseOf(t)] ??= d20(t)) : null);
                if (t.kind === 'pc') items.push({ kind: 'pc', char: t.char, init });
                else if (t.kind === 'monster') items.push({ kind: 'monster', mon: t.mon, by: t.by, copy: t.copy, init, bonus: t.bonus || 0, ac: t.ac, hidden: !!t.hidden });
                else items.push({ kind: 'plain', name: t.name, init });
            }
            S.endPop = false;
            return window.Fight.act(c, 'begin', { items });
        }
        // ---- the token menu ----
        function drawMenu() {
            const box = part('menu');
            if (!box) return;
            const m = S.m, ids = [...S.picks].map(tokOf).filter(Boolean);
            if (!m || !ids.length || G?.type === 'move' || (!S.dm && !ids.every((t) => t.mine))) { box.hidden = true; return; }
            box.hidden = false;
            const t = ids[0], many = ids.length > 1, e = encOf(), hasHp = !many && t.hp && t.kind !== 'plain', dis = canEdit() ? '' : ' disabled', conds = (t.conds || t.cond || []);
            const Tab = (a, v, p, name, on, off) => `<button type="button" class="mpt-tab${on ? ' on' : ''}" data-mpa="${a}" data-v="${v}"${off ? ' disabled' : ''}>${ic(name, p)}<span>${name}</span></button>`;
            let h = `<div class="mpt-mh"><div class="who"><b>${many ? ids.length + ' tokens' : esc(t.name)}</b>${!many && S.dm ? ` <button type="button" class="mpt-link" data-mpa="panel" data-v="rename" aria-label="Rename" title="Rename">Edit</button>` : ''}<small>${many ? '' : `${t.hp ? `${t.hp.cur}/${t.hp.max ?? '?'}${t.hp.temp ? ' +' + t.hp.temp : ''}` : ''}${S.dm && t.ac != null ? ` · AC ${esc(t.ac)}` : ''}`}</small></div>${!many && t.kind !== 'plain' ? '<button type="button" class="mpt-link" data-mpa="panel" data-v="cond">CONDITIONS +</button>' : ''}</div>`;
            if (!many && conds.length) h += `<div class="mpt-panel" style="padding:4px 10px"><div class="mpt-conds">${conds.map((x) => `<span class="badge r">${esc(x)}</span>`).join('')}</div></div>`;
            if (S.panel === 'hp' && hasHp) h += `<div class="mpt-panel"><div class="mpt-hp"><button type="button" class="btn small" data-mpa="hp" data-v="heal"${dis}>+ Heal</button><input class="field" data-mpi="hpn" type="number" inputmode="numeric" min="0" placeholder="-" aria-label="Amount"><button type="button" class="btn small" data-mpa="hp" data-v="dmg"${dis}>Damage −</button></div>
                <div class="mpt-two"><label>Temp HP<input class="field" data-mpi="hptemp" type="number" inputmode="numeric" min="0" value="${t.hp.temp || 0}"></label>${S.dm && t.kind === 'monster' ? '<label>Change Max HP<input class="field" data-mpi="hpmax" type="number" inputmode="numeric" min="1" placeholder="-"></label>' : ''}</div><button type="button" class="mpt-fold" data-mpa="panel" data-v="hp" aria-label="Fold" title="Fold">▲</button></div>`;
            if (S.panel === 'cond' && !many) h += `<div class="mpt-panel mpt-conds">${CONDS.map((x) => `<button type="button" class="${conds.includes(x) ? 'on' : ''}" data-mpa="cond" data-v="${x}"${pressed(conds.includes(x))}${dis}>${x}</button>`).join('')}</div>`;
            if (S.panel === 'size' && !many) h += `<div class="mpt-panel"><div class="mpt-row">${Object.entries(SIZE_NAMES).map(([v, n]) => `<button type="button" class="btn small${v === t.size ? ' primary' : ''}" data-mpa="size" data-v="${v}"${dis}>${n}</button>`).join('')}</div></div>`;
            if (S.panel === 'ring' && !many) h += `<div class="mpt-panel"><div class="mpt-row">${RINGS.map((col) => `<button type="button" class="mpt-swatch${col === (t.ring || '') ? ' on' : ''}" style="background:${col || 'transparent'}" data-mpa="ring" data-v="${col}" aria-label="${col ? 'Ring ' + col : 'Normal ring'}" title="${col ? 'Ring colour' : 'Normal ring'}"></button>`).join('')}</div></div>`;
            if (S.panel === 'rename' && !many) h += `<div class="mpt-panel"><input class="field" data-mpi="ren" style="text-align:left" maxlength="80" value="${esc(baseOf(t))}" aria-label="Token name"><div class="mpt-row"><button type="button" class="btn small" data-mpa="rensave"${dis}>Save name</button><button type="button" class="btn small" data-mpa="noname"${dis}>${t.noName ? 'Show' : 'Hide'} name badge</button></div></div>`;
            if (S.panel === 'more' && S.dm) h += `<div class="mpt-panel"><div class="mpt-row"><button type="button" class="btn small" data-mpa="group"${dis}>${ids.some((x) => x.group) ? 'Ungroup' : 'Group'}</button><button type="button" class="btn small" data-mpa="lock"${dis}>${t.locked ? 'Unlock' : 'Lock'}</button>${!many && e.ids.includes(t.k) ? `<button type="button" class="btn small" data-mpa="side1" data-v="${esc(t.k)}"${dis}>Change side (now ${e.side[t.k] === 'party' ? 'party' : 'enemy'})</button>` : ''}${!many && t.fight ? `<button type="button" class="btn small" data-mpa="unfight" data-v="${esc(t.fight)}"${dis}>Remove from combat</button>` : ''}<button type="button" class="btn small" data-mpa="delete"${dis}>${t.kind === 'pc' && !many ? 'Take off the map' : 'Delete token'}</button></div></div>`;
            const inEnc = S.fight ? ids.every((x) => x.fight) : ids.every((x) => e.ids.includes(x.k));
            h += `<div class="mpt-tabs">${hasHp ? Tab('panel', 'hp', 'H', 'HP', S.panel === 'hp') : ''}${S.dm ? Tab('combat', '', '+', 'COMBAT', false, inEnc) + (ids.every((x) => x.kind === 'pc') ? '' : Tab('togglehide', '', 'E', t.hidden ? 'REVEAL' : 'HIDE', t.hidden)) + (many ? '' : Tab('panel', 'ring', 'O', 'RING', S.panel === 'ring')) : ''}${many ? '' : Tab('panel', 'size', 'S', 'SIZE', S.panel === 'size')}${S.dm ? Tab('panel', 'more', '...', 'MORE', S.panel === 'more') : ''}</div>`;
            const typing = box.contains(document.activeElement) && document.activeElement.tagName === 'INPUT' && box.dataset.for === [...S.picks].join() + S.panel;
            if (box.dataset.h !== h && !typing) { box.innerHTML = h; box.dataset.h = h; box.dataset.for = [...S.picks].join() + S.panel; }
            placeMenu();
        }
        function placeMenu() {
            const box = part('menu');
            if (!box || box.hidden || !S.m) return;
            const t = [...S.picks].map(tokOf).filter(Boolean)[0];
            if (!t) return;
            const sz = span(t), R = view.getBoundingClientRect(), W = box.offsetWidth, H = box.offsetHeight, X = t.placed ? (t.x + sz / 2) * S.k + S.tx : R.width / 2, Y = t.placed ? t.y * S.k + S.ty : R.height / 2;
            box.style.left = clamp(X - W / 2, 8, Math.max(8, R.width - W - 8)) + 'px';
            box.style.top = clamp(Y - H - 12 > 8 ? Y - H - 12 : Y + sz * S.k + 12, 8, Math.max(8, R.height - H - 8)) + 'px';
        }
        // HP: a party character's goes to their sheet (the DM-edit queue and the sheet's own rules); a copy's stays with the copy; any other monster's goes to the Monster Sheet
        async function changeHp(t, how, n) {
            if (t.kind === 'pc') {
                if (!window.hbDm?.send) return;
                await window.hbDm.send(c, t.char, [{ op: 'hp', how, amt: n, t: how === 'dmg' ? `−${n} HP` : how === 'heal' ? `+${n} HP` : `${n} temp HP` }]);
                return load();
            }
            return setMonHp(t, { k: how, n });
        }
        async function setMonHp(t, hop) {
            if (t.copy) { if (t.k) await post({ op: 'copyhp', k: t.k, hop }); else await window.Fight.act(c, 'copyhp', { copy: t.copy, hop }); return load(); }
            try {
                const r = await fetch('/sheets/monster/cloud.php?hp=' + encodeURIComponent(t.mon) + '&c=' + encodeURIComponent(c), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: hop }) });
                if (!r.ok) toast((await r.json().catch(() => ({}))).error || "Couldn't change the hit points. Try again.", 'err');
            } catch (e) { toast("Couldn't reach the site. Check your connection and try again.", 'err'); }
            return load();
        }
        async function toggleCond(t, name) {
            const list = t.conds || t.cond || [], on = !list.includes(name);
            if (t.kind === 'pc') {
                if (window.hbDm?.send) await window.hbDm.send(c, t.char, [{ op: 'tag', path: ['conditions'], value: name, on, t: `${on ? 'Add' : 'Remove'} ${name}` }]);
                return load();
            }
            t.cond = on ? [...list, name] : list.filter((x) => x !== name);
            drawMenu();
            await post({ op: 'token', k: t.k, cond: t.cond });
            load();
        }
        function entryHp(e) {
            if (!e?.hp) return;
            const d = dlg(`<h2>${esc(e.name)}</h2><p class="mpt-hint">${e.hp.cur} / ${e.hp.max ?? '?'} HP</p><div class="mpt-hp"><button type="button" class="btn small" data-h="heal">+ Heal</button><input class="field" data-hn type="number" inputmode="numeric" min="0" placeholder="-" aria-label="Amount"><button type="button" class="btn small" data-h="dmg">Damage −</button></div><div class="actions"><button type="button" class="btn" data-hx>Close</button></div>`);
            d.querySelector('[data-hx]').onclick = () => d.close();
            d.addEventListener('click', async (ev) => {
                const how = ev.target.dataset.h, n = Math.max(0, parseInt(d.querySelector('[data-hn]').value, 10) || 0);
                if (!how || !n) return;
                d.close();
                await changeHp({ kind: e.kind, char: e.char, mon: e.mon, copy: e.copy, k: '' }, how, n);
                window.Fight.load(c);
            });
        }
        const setHidden = (t, on) => (t.fight ? window.Fight.act(c, 'hide', { e: t.fight, on }) : post({ op: 'token', k: t.k, hidden: on }));

        // ---- changes ----
        const sendMoves = throttle(() => { for (const i of G?.items || []) post({ op: 'move', k: i.t.k, x: i.t.x, y: i.t.y, placed: true, drag: true }, true); }, 200);
        const sendFog = throttle((op) => post({ op: 'fogpv', add: op }, true), 100); // the stroke so far, to every other screen
        const sendRuler = throttle((pts) => post({ op: 'ruler', pts }, true), 150);
        const sendTrail = throttle((tr) => { tr.sent = Date.now(); post({ op: 'trail', id: tr.id, pts: [tr.target], color: tr.c }, true); }, 80);
        function snap(t, x, y) {
            const g = S.m.grid, [x0, y0] = cells(g, S.m.w, S.m.h), n = SIZES[t.size] || 1;
            if (n < 1) { const cx = x + (n * g.s) / 2, cy = y + (n * g.s) / 2, off = (g.s - n * g.s) / 2; return [x0 + Math.floor((cx - x0) / g.s) * g.s + off, y0 + Math.floor((cy - y0) / g.s) * g.s + off]; }
            return [x0 + Math.round((x - x0) / g.s) * g.s, y0 + Math.round((y - y0) / g.s) * g.s];
        }
        async function moveTo(t, x, y, placed = true) {
            Object.assign(t, placed ? { x, y, placed } : { placed });
            draw();
            if (!(await post(placed ? { op: 'move', k: t.k, x, y, placed } : { op: 'move', k: t.k, placed: false }))) load();
        }
        async function fogAdd(op) {
            S.fogUndo.push((S.m.fog?.ops || []).slice());
            if (S.fogUndo.length > 30) S.fogUndo.shift();
            S.m.fog ||= { n: 0, ops: [] };
            if (op.all) S.m.fog.ops = op.on ? [op] : [];
            else S.m.fog.ops.push(op);
            drawFog(true);
            if (!(await post({ op: 'fog', add: op }))) load();
        }
        async function fogUndo() {
            const ops = S.fogUndo.pop();
            if (!ops) return;
            S.m.fog.ops = ops;
            drawFog(true);
            if (!(await post({ op: 'fogset', ops }))) load();
        }
        function closePoly() {
            const P = S.poly;
            S.poly = []; S.hover = null;
            drawLive();
            if (P.length >= 3) fogAdd({ on: !!S.polyOn, poly: P.map(round) });
        }
        const round = (p) => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10];
        function deleteSel() {
            if (!S.dm || !S.m) return;
            for (const id of [...S.picks]) {
                const t = tokOf(id);
                if (t) {
                    if (t.kind === 'pc') { moveTo(t, t.x, t.y, false); continue; }
                    (async () => { if (t.fight) await window.Fight.act(c, 'remove', { e: t.fight }); const e = encOf(); if (e.ids.includes(t.k)) { e.ids = e.ids.filter((x) => x !== t.k); post({ op: 'enc', enc: e }, true); } await post({ op: 'remove', k: t.k }); load(); })();
                }
            }
            const ovs = [...S.picks].filter(ovOf);
            if (ovs.length) { S.m.overlays = S.m.overlays.filter((o) => !ovs.includes(o.id)); post({ op: 'overlaydel', ids: ovs }); drawMarks(); }
            S.picks.clear(); S.panel = null;
            draw();
        }
        function setTool(t) { if (!allowed(t)) return; S.tool = t; S.poly = []; S.pop = null; if (t === 'tokens') { loadComp(); loadMons(); } draw(); }

        // ---- the view: pan, zoom, fit ----
        function fit() {
            const m = S.m, r = view.getBoundingClientRect(), top = Math.min(r.height / 2, opts.top?.() || 0);
            if (!m || !r.width) return;
            const pad = S.full && r.width > 760 ? [68, 48] : [0, 0];
            S.k = Math.min((r.width - pad[0] * 2) / m.w, (r.height - top - pad[1] * 2) / m.h) * (S.full ? 1 : 0.96);
            S.tx = (r.width - m.w * S.k) / 2; S.ty = top + (r.height - top - m.h * S.k) / 2;
            place(); drawLive();
        }
        function zoom(f, cx, cy) {
            const k = Math.min(8, Math.max(0.02, S.k * f));
            S.tx = cx - ((cx - S.tx) * k) / S.k; S.ty = cy - ((cy - S.ty) * k) / S.k; S.k = k; S.moved = true;
            place(); drawLive();
        }
        function centreOn(t) {
            const r = view.getBoundingClientRect(), sz = span(t);
            S.tx = r.width / 2 - (t.x + sz / 2) * S.k; S.ty = r.height / 2 - (t.y + sz / 2) * S.k;
            place();
        }
        const toMap = (e) => { const r = view.getBoundingClientRect(); return [(e.clientX - r.left - S.tx) / S.k, (e.clientY - r.top - S.ty) / S.k]; };
        function overlayAt([x, y]) {
            return [...(S.m.overlays || [])].reverse().find((o) => {
                const a = x - o.x, b = y - o.y, C = Math.cos(-o.ang), N = Math.sin(-o.ang), lx = a * C - b * N, ly = a * N + b * C;
                return o.type === 'circle' ? Math.hypot(a, b) <= o.len : o.type === 'square' ? Math.abs(lx) <= o.len / 2 && Math.abs(ly) <= o.len / 2 : o.type === 'line' ? lx >= 0 && lx <= o.len && Math.abs(ly) <= S.m.grid.s / 2 : lx >= 0 && lx <= o.len && Math.abs(ly) <= lx / 2;
            });
        }
        function eraseAt(p) {
            const m = S.m, n = m.draws.length;
            m.draws = m.draws.filter((d) => {
                if (!d.id || !(S.dm || d.mine) || !d.pts.some(([x, y]) => Math.hypot(x - p[0], y - p[1]) < ((BRUSH[d.s] || 6) * m.grid.s) / 140 + 8 / S.k)) return true;
                G.del.push(d.id);
                return false;
            });
            if (m.draws.length !== n) drawMarks();
        }
        // with a fog brush in hand, the wheel sizes the brush (a trackpad's small steps add up to one); otherwise it zooms
        let wheelSum = 0;
        function brushWheel(e) {
            wheelSum += e.deltaY;
            if (e.deltaMode === 0 && Math.abs(wheelSum) < 60) return;
            const n = clamp(S.fogSize + (wheelSum < 0 ? 1 : -1), 1, 9);
            wheelSum = 0;
            if (n === S.fogSize) return;
            S.fogSize = n; remember(); drawOpts(); drawLive();
        }
        view.addEventListener('wheel', (e) => { if (!S.m) return; e.preventDefault(); if (S.dm && S.tool === 'fog' && S.fogShape !== 'polygon') { S.hover = toMap(e); return brushWheel(e); } const r = view.getBoundingClientRect(); zoom(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top); }, { passive: false });
        view.addEventListener('contextmenu', (e) => e.preventDefault());
        const ptrs = new Map();
        let G = null; // the gesture under way: {type: pan | pinch | move | box | fog | draw | erase | newov | ovsize | ovturn | trail | ruler, id, ...}
        const joint = () => { if (G?.type === 'ruler') { S.ruler.push(S.ruler[S.ruler.length - 1].slice()); drawLive(); } };
        view.addEventListener('pointerdown', (e) => {
            if (!S.m) return;
            const fogRight = e.button === 2 && S.dm && S.tool === 'fog' && canEdit(); // the right button covers with fog, the left reveals
            if (e.button === 2) e.preventDefault();
            if (e.button === 2 && !fogRight) return joint();
            ptrs.set(e.pointerId, [e.clientX, e.clientY]);
            if (ptrs.size === 2) {
                if (G?.type === 'ruler' && e.pointerType === 'touch') { G.tap = e.pointerId; return joint(); }
                const [a, b] = [...ptrs.values()];
                G = { type: 'pinch', d: Math.hypot(a[0] - b[0], a[1] - b[1]), k: S.k, tx: S.tx, ty: S.ty, mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] };
                S.box = null; box.hidden = true;
                return;
            }
            if (ptrs.size > 2 || G) return;
            try { view.setPointerCapture(e.pointerId); } catch (x) { } // (a pointer that is already gone)
            if (S.pop) { S.pop = null; drawOpts(); }
            const p = toMap(e), base = { id: e.pointerId, x: e.clientX, y: e.clientY, p, moved: false };
            if (e.button === 1 || S.space || S.tool === 'pan' || S.table) { G = { ...base, type: 'pan', tx: S.tx, ty: S.ty }; return; }
            if (e.button !== 0 && !fogRight) return;
            const T = S.tool, el = e.target.closest('.mp-tok'), t = el && tokOf(el.dataset.k);
            if (T === 'ruler') { S.ruler = [centre(p), centre(p)]; G = { ...base, type: 'ruler' }; return drawLive(); }
            if (T === 'point') {
                const at = round(p), tr = { id: uid(), target: at, head: at, tail: [], c: S.pointColor, at: Date.now(), live: true, mine: true };
                S.trails.push(tr); G = { ...base, type: 'trail', tr }; sendTrail(tr);
                return drawLive();
            }
            if (canEdit() && S.dm && T === 'fog') {
                if (S.fogShape === 'polygon') { const f = S.poly[0]; if (f && Math.hypot(p[0] - f[0], p[1] - f[1]) < 12 / S.k) return closePoly(); if (!f) S.polyOn = fogRight; S.poly.push(p); return drawLive(); }
                G = { ...base, type: 'fog', op: { on: fogRight, shape: S.fogShape, r: (S.fogSize * S.m.grid.s) / 2, pts: [round(p)] } };
                return drawFog();
            }
            if (canEdit() && T === 'draw') {
                if (S.penMode === 'erase') { G = { ...base, type: 'erase', del: [] }; return eraseAt(p); }
                G = { ...base, type: 'draw', d: { c: S.penColor, s: S.penSize, pts: [round(p)] } };
                return drawMarks();
            }
            if (canEdit() && S.dm && T === 'overlay') { S.newOv = { id: uid(), type: S.ovType, x: p[0], y: p[1], len: 1, ang: 0, color: S.ovColor, pat: S.ovPat, hidden: false, group: '', locked: false }; G = { ...base, type: 'newov', start: p }; return drawMarks(); }
            // Select (and Tokens, which also lets you pick)
            if (!S.full && !t) { G = { ...base, type: 'pan', tx: S.tx, ty: S.ty }; return; }
            if (S.dm) for (const id of S.picks) { const o = ovOf(id); if (!o) continue; const h = handles(o); if (Math.hypot(p[0] - h.size[0], p[1] - h.size[1]) < 12 / S.k) { G = { ...base, type: 'ovsize', o }; return; } if (Math.hypot(p[0] - h.turn[0], p[1] - h.turn[1]) < 12 / S.k) { G = { ...base, type: 'ovturn', o }; return; } }
            if (t) {
                const alone = e.shiftKey && t.group && S.picks.has(t.k);
                if (!alone) {
                    if (e.shiftKey) { if (S.picks.has(t.k)) S.picks.delete(t.k); else S.picks.add(t.k); }
                    else if (!S.picks.has(t.k)) { S.picks = new Set([t.k]); S.panel = null; }
                    if (t.group) for (const x of [...S.m.tokens.map((a) => ({ id: a.k, group: a.group })), ...S.m.overlays]) if (x.group === t.group) S.picks.add(x.id);
                }
                if (movable(t) && canEdit()) {
                    const list = alone ? [t] : [...S.picks].map(tokOf).filter((x) => x && movable(x));
                    G = { ...base, type: 'wait', items: list.map((x) => ({ t: x, x: x.x, y: x.y })), ovs: alone ? [] : [...S.picks].map(ovOf).filter((o) => o && !o.locked).map((o) => ({ o, x: o.x, y: o.y })) };
                } else G = { ...base, type: 'pan', tx: S.tx, ty: S.ty };
                drawOpts(); drawToks(); drawMenu(); drawSide();
                return;
            }
            const o = S.dm && overlayAt(p);
            if (o) {
                if (e.shiftKey) S.picks.add(o.id); else if (!S.picks.has(o.id)) S.picks = new Set([o.id]);
                if (o.group) for (const x of [...S.m.tokens.map((a) => ({ id: a.k, group: a.group })), ...S.m.overlays]) if (x.group === o.group) S.picks.add(x.id);
                if (!o.locked && canEdit()) G = { ...base, type: 'wait', items: [...S.picks].map(tokOf).filter((x) => x && movable(x)).map((x) => ({ t: x, x: x.x, y: x.y })), ovs: [...S.picks].map(ovOf).filter((a) => a && !a.locked).map((a) => ({ o: a, x: a.x, y: a.y })) };
                drawOpts(); drawToks(); drawLive(); drawMenu();
                return;
            }
            if (!e.shiftKey) { S.picks.clear(); S.panel = null; }
            G = { ...base, type: S.dm || S.full ? 'box' : 'pan', tx: S.tx, ty: S.ty };
            drawOpts(); drawToks(); drawLive(); drawMenu();
        });
        view.addEventListener('pointermove', (e) => {
            if (!S.m) return;
            const p = toMap(e);
            S.hover = p;
            if (S.poly.length || S.tool === 'fog') drawLive();
            if (!ptrs.has(e.pointerId)) return;
            ptrs.set(e.pointerId, [e.clientX, e.clientY]);
            if (G?.type === 'ruler' && e.button === 2) return joint(); // a right click during a drag arrives as a pointermove (chorded buttons)
            if (!G) return;
            if (G.type === 'pinch') {
                const [a, b] = [...ptrs.values()], r = view.getBoundingClientRect(), k = Math.min(8, Math.max(0.02, (G.k * Math.hypot(a[0] - b[0], a[1] - b[1])) / G.d)), mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
                const mx = (G.mid[0] - r.left - G.tx) / G.k, my = (G.mid[1] - r.top - G.ty) / G.k;
                S.moved = true; S.k = k; S.tx = mid[0] - r.left - mx * k; S.ty = mid[1] - r.top - my * k;
                place(); return drawLive();
            }
            if (e.pointerId !== G.id) return;
            if (Math.hypot(e.clientX - G.x, e.clientY - G.y) > 4) G.moved = true;
            if (G.type === 'pan') { if (G.moved) { S.moved = true; S.tx = G.tx + e.clientX - G.x; S.ty = G.ty + e.clientY - G.y; place(); drawLive(); } }
            else if (G.type === 'ruler') { S.ruler[S.ruler.length - 1] = centre(p); drawLive(); sendRuler(S.ruler); }
            else if (G.type === 'fog') {
                const last = G.op.pts[G.op.pts.length - 1];
                if (Math.hypot(p[0] - last[0], p[1] - last[1]) >= Math.max(2, G.op.r / 4)) { G.op.pts.push(round(p)); sendFog(G.op); }
                drawFog();
            }
            else if (G.type === 'draw') { G.d.pts.push(round(p)); drawMarks(); }
            else if (G.type === 'erase') eraseAt(p);
            else if (G.type === 'trail') { G.tr.target = round(p); G.tr.at = Date.now(); sendTrail(G.tr); }
            else if (G.type === 'newov') {
                const o = S.newOv, dx = p[0] - G.start[0], dy = p[1] - G.start[1];
                if (o.type === 'square') { o.len = Math.max(Math.abs(dx), Math.abs(dy)); o.x = G.start[0] + (Math.sign(dx || 1) * o.len) / 2; o.y = G.start[1] + (Math.sign(dy || 1) * o.len) / 2; }
                else { o.len = Math.hypot(dx, dy); o.ang = Math.atan2(dy, dx); }
                drawMarks(); drawLive();
            }
            else if (G.type === 'ovsize') { const o = G.o; o.len = Math.max(S.m.grid.s / 4, o.type === 'square' ? Math.hypot(p[0] - o.x, p[1] - o.y) * Math.SQRT2 : Math.hypot(p[0] - o.x, p[1] - o.y)); drawMarks(); drawLive(); }
            else if (G.type === 'ovturn') { G.o.ang = Math.atan2(p[1] - G.o.y, p[0] - G.o.x); drawMarks(); drawLive(); }
            else if (G.type === 'box') { Object.assign(box.style, { left: Math.min(G.p[0], p[0]) + 'px', top: Math.min(G.p[1], p[1]) + 'px', width: Math.abs(p[0] - G.p[0]) + 'px', height: Math.abs(p[1] - G.p[1]) + 'px' }); box.hidden = false; }
            else if (G.type === 'wait' || G.type === 'move') {
                if (G.type === 'wait') { if (!G.moved) return; G.type = 'move'; part('menu') && (part('menu').hidden = true); } // a plain click keeps the menu; it hides only while moving
                const dx = p[0] - G.p[0], dy = p[1] - G.p[1], free = e.altKey && e.pointerType === 'mouse';
                for (const i of G.items) {
                    const [x, y] = free ? [i.x + dx, i.y + dy] : snap(i.t, i.x + dx, i.y + dy);
                    Object.assign(i.t, { x, y, placed: true });
                    const el = toks.querySelector(`[data-k="${CSS.escape(i.t.k)}"]`);
                    if (el) { el.style.left = x + 'px'; el.style.top = y + 'px'; el.classList.add('drag'); }
                }
                for (const a of G.ovs) { a.o.x = a.x + dx; a.o.y = a.y + dy; }
                if (G.ovs.length) { drawMarks(); drawLive(); }
                sendMoves();
            }
        });
        const up = async (e) => {
            ptrs.delete(e.pointerId);
            if (!G) return;
            if (G.type === 'pinch') { if (ptrs.size < 2) G = null; return; }
            if (e.pointerId === G.tap) return;
            if (e.pointerId !== G.id) return;
            const g = G, p = toMap(e);
            G = null;
            box.hidden = true;
            if (g.type === 'trail') { g.tr.live = false; g.tr.at = Date.now(); sendTrail(g.tr); }
            else if (g.type === 'ruler') { S.ruler = null; if (!S.full) { S.tool = 'select'; drawBar(); } drawLive(); sendRuler(null); }
            else if (g.type === 'fog') { g.op.pts.push(round(p)); fogAdd(g.op); }
            else if (g.type === 'draw') { S.m.draws.push(g.d); drawMarks(); const out = await post({ op: 'draw', add: g.d }); if (out) Object.assign(g.d, { id: out.id, mine: true }); else load(); }
            else if (g.type === 'erase') { if (g.del.length) post({ op: 'drawdel', ids: g.del }); }
            else if (g.type === 'newov') { const o = S.newOv; S.newOv = null; if (o.len > S.m.grid.s / 4) { S.m.overlays.push(o); S.picks = new Set([o.id]); post({ op: 'overlay', o }); drawOpts(); } drawMarks(); drawLive(); }
            else if (g.type === 'ovsize' || g.type === 'ovturn') post({ op: 'overlay', o: g.o });
            else if (g.type === 'box') {
                const L = Math.min(g.p[0], p[0]), Rr = Math.max(g.p[0], p[0]), Tt = Math.min(g.p[1], p[1]), B = Math.max(g.p[1], p[1]);
                if (Rr - L > 4 || B - Tt > 4) for (const t of S.m.tokens) { if (!t.placed || !(S.dm || t.mine)) continue; const sz = span(t), X = t.x + sz / 2, Y = t.y + sz / 2; if (X >= L && X <= Rr && Y >= Tt && Y <= B) S.picks.add(t.k); }
                drawToks(); drawMenu();
            }
            else if (g.type === 'move') {
                await Promise.all(g.items.map((i) => post({ op: 'move', k: i.t.k, x: i.t.x, y: i.t.y, placed: true }, true)));
                for (const a of g.ovs) post({ op: 'overlay', o: a.o });
                drawToks(); drawMenu();
            }
            else if (g.type === 'wait') { if (!S.full) tapName(toks.querySelector(`[data-k="${CSS.escape(g.items[0]?.t.k || '')}"]`)); drawMenu(); }
            else if (g.type === 'pan' && !g.moved && !S.full) tapName(e.target.closest?.('.mp-tok'));
        };
        view.addEventListener('pointerleave', () => { S.hover = null; if (S.tool === 'fog') drawLive(); });
        view.addEventListener('pointerup', up);
        view.addEventListener('pointercancel', up);
        view.addEventListener('dblclick', () => { if (S.tool === 'fog' && S.fogShape === 'polygon' && S.poly.length) { S.poly.pop(); closePoly(); } });
        const tapName = (el) => { toks.querySelectorAll('.mp-tok.show').forEach((x) => x.classList.remove('show')); el?.classList.add('show'); };

        // ---- adding by drag or click: the tray and the Token Browser ----
        root.addEventListener('pointerdown', (e) => {
            const b = e.target.closest('[data-add]');
            if (!b || b.disabled || e.button || !canEdit()) return;
            e.preventDefault();
            const ghost = document.createElement('div');
            ghost.className = 'mp-ghost';
            ghost.innerHTML = `<span class="mp-face">${esc(initials(b.textContent))}</span>`;
            document.body.append(ghost);
            const at = (ev) => Object.assign(ghost.style, { left: ev.clientX + 'px', top: ev.clientY + 'px' });
            at(e);
            const x0 = e.clientX, y0 = e.clientY, add = b.dataset.add, move = (ev) => at(ev);
            const done = (ev) => {
                removeEventListener('pointermove', move); removeEventListener('pointerup', done); removeEventListener('pointercancel', done);
                ghost.remove();
                const r = view.getBoundingClientRect(), inView = ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
                if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 5) addToken(add, viewMid());
                else if (inView) addToken(add, toMap(ev));
            };
            addEventListener('pointermove', move); addEventListener('pointerup', done); addEventListener('pointercancel', done);
        });

        // ---- buttons ----
        root.addEventListener('click', async (e) => {
            const b = e.target.closest('[data-mpa]');
            if (!b || b.disabled) return;
            const a = b.dataset.mpa, v = b.dataset.v, picks = [...S.picks].map(tokOf).filter(Boolean), t = picks[0], en = encOf();
            const P = () => { remember(); drawOpts(); };
            switch (a) {
                case 'fit': return fit();
                case 'me': { const m = myToks()[0]; return m && centreOn(m); }
                case 'toolruler': S.tool = S.tool === 'ruler' ? 'select' : 'ruler'; return drawBar();
                case 'lines': S.lines = !S.lines; drawBar(); return drawGrid();
                case 'tool': return setTool(b.dataset.t);
                case 'settings': return openSettings();
                case 'side': S.sideOn = !S.sideOn; if (S.sideOn) loadParty(); return draw();
                case 'showmap': if (await post({ op: 'activate' })) load(); return;
                case 'hidemap': if (await post({ op: 'hide' })) load(); return;
                case 'zoom': { const r = view.getBoundingClientRect(); return zoom(+b.dataset.f, r.width / 2, r.height / 2); }
                case 'full': if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.().catch(() => { }); return;
                case 'pop': S.pop = S.pop === v ? null : v; return drawOpts();
                case 'fogall': return fogAdd({ on: v === '1', all: true });
                case 'fogshape': S.fogShape = v; S.poly = []; P(); return drawLive();
                case 'penmode': S.penMode = v; return P();
                case 'pensize': S.penSize = +v; return P();
                case 'pencolor': S.penColor = +v; return P();
                case 'cleardraw': if (await ask('Clear the drawings on this map?', "Everyone's view updates straight away.", 'Clear drawings')) { S.m.draws = []; drawMarks(); post({ op: 'drawset', draws: [] }); } return;
                case 'ovtype': S.ovType = v; return P();
                case 'ovcolor': S.ovColor = +v; for (const id of S.picks) { const o = ovOf(id); if (o) { o.color = +v; post({ op: 'overlay', o }, true); } } P(); return drawMarks();
                case 'ovhide': for (const id of S.picks) { const o = ovOf(id); if (o) { o.hidden = !o.hidden; post({ op: 'overlay', o }); } } drawMarks(); return drawOpts();
                case 'ptcolor': S.pointColor = +v; return P();
                case 'brtab': S.brTab = v; return drawOpts();
                case 'brfilter': S.brFilters = !S.brFilters; return drawOpts();
                case 'delete': return deleteSel();
                case 'pick': if (!v) return; S.picks = new Set([v]); S.panel = null; { const x = tokOf(v); if (x?.placed) centreOn(x); } drawToks(); return drawMenu();
                case 'pickhp': if (!v) return entryHp(S.fight?.entries.find((x) => x.id === b.dataset.e)); S.picks = new Set([v]); S.panel = 'hp'; { const x = tokOf(v); if (x?.placed) centreOn(x); } drawToks(); return drawMenu();
                case 'addall': return addEnc(S.m.tokens.filter((x) => x.placed));
                case 'auto': { const done = {}; for (const k of en.ids) if (en.side[k] === v) { const x = tokOf(k); if (x) { const key = x.kind === 'monster' ? baseOf(x) : k; done[key] ??= d20(x); en.init[k] = done[key]; } } return saveEnc(en); }
                case 'side1': en.side[v] = en.side[v] === 'party' ? 'enemy' : 'party'; return saveEnc(en);
                case 'unenc': { const list = v.split(','); en.ids = en.ids.filter((x) => !list.includes(x)); return saveEnc(en); }
                case 'encclear': if (await ask('Clear this encounter?', 'The tokens stay on the map.', 'Clear encounter')) saveEnc({ ids: [], init: {}, side: {} }); return;
                case 'start': b.disabled = true; return startCombat();
                case 'next': case 'prev': case 'round1': b.disabled = true; return window.Fight.act(c, a);
                case 'endpop': S.endPop = !S.endPop; return drawSide();
                case 'end': S.endPop = false; drawSide(); if (await ask('End this fight?', 'The order goes back to the Combat Encounter panel. Tokens stay where they are. The order and rounds are kept in the past fights.', 'End combat')) window.Fight.act(c, 'end'); return;
                case 'unfight': {
                    const pl = S.m?.tokens.find((x) => x.fight === v && x.kind === 'plain');
                    await window.Fight.act(c, 'remove', { e: v });
                    if (pl) await post({ op: 'remove', k: pl.k }, true); // an extra entry's token goes with it
                    return load();
                }
                case 'fmove': b.disabled = true; return window.Fight.act(c, 'move', { e: v, dir: +b.dataset.dir });
                case 'addenc': b.disabled = true; return addGroup(v);
                case 'panel': S.panel = S.panel === v ? null : v; return drawMenu();
                case 'togglehide': { const on = !t.hidden; await Promise.all(picks.filter((x) => x.kind !== 'pc').map((x) => setHidden(x, on))); return load(); }
                case 'combat': if (S.fight) { await addToFight(picks); return load(); } S.sideOn = true; loadParty(); await addEnc(picks); return drawTop();
                case 'group': { const g = picks.some((x) => x.group) ? '' : uid(); for (const id of S.picks) { const x = tokOf(id), o = ovOf(id); if (x) { x.group = g; post({ op: 'token', k: x.k, group: g }, true); } if (o) { o.group = g; post({ op: 'overlay', o }, true); } } return drawMenu(); }
                case 'lock': { const on = !t.locked; for (const x of picks) { x.locked = on; post({ op: 'token', k: x.k, locked: on }, true); } return drawMenu(); }
                case 'hp': {
                    const i = part('menu').querySelector('[data-mpi=hpn]'), n = Math.max(0, parseInt(i.value, 10) || 0);
                    if (!n) return i.focus();
                    i.value = ''; document.activeElement?.blur();
                    return changeHp(t, v, n);
                }
                case 'cond': return toggleCond(t, v);
                case 'size': t.size = v; drawToks(); if (await post({ op: 'token', k: t.k, size: v })) load(); return;
                case 'ring': t.ring = v; drawToks(); drawMenu(); return post({ op: 'token', k: t.k, ring: v });
                case 'rensave': { const name = part('menu').querySelector('[data-mpi=ren]').value.trim(); document.activeElement?.blur(); if (name && (await post({ op: 'token', k: t.k, name }))) load(); return; }
                case 'noname': t.noName = !t.noName; drawToks(); drawMenu(); return post({ op: 'token', k: t.k, noName: t.noName });
            }
        });
        async function addToFight(list) {
            const have = new Set((S.fight?.entries || []).map((e) => e.id)), en = encOf(), items = [], rolled = {};
            for (const t of list) {
                if (t.fight && have.has(t.fight)) continue;
                // joining mid-fight: the number it was given, or its kind's in the fight or one picked already, or a roll
                const kin = S.m.tokens.find((x) => x.kind === 'monster' && x.fight && baseOf(x) === baseOf(t) && S.fight.entries.find((e) => e.id === x.fight)?.init != null);
                const init = en.init[t.k] ?? (t.kind === 'pc' ? defaultInit(t) : t.kind === 'monster' ? (rolled[baseOf(t)] ??= kin ? S.fight.entries.find((e) => e.id === kin.fight).init : d20(t)) : null);
                if (t.kind === 'pc') items.push({ kind: 'pc', char: t.char, init });
                else if (t.kind === 'monster') items.push({ kind: 'monster', mon: t.mon, by: t.by, copy: t.copy, init, bonus: t.bonus || 0, ac: t.ac });
                else items.push({ kind: 'plain', name: t.name, init });
            }
            if (items.length) await window.Fight.act(c, 'add', { items });
        }
        root.addEventListener('submit', async (e) => {
            const f = e.target;
            if (!f.matches('[data-fadd]')) return;
            e.preventDefault();
            const name = f.name.value.trim(), init = f.init.value;
            if (!name) return f.name.focus();
            document.activeElement?.blur();
            if (await window.Fight.act(c, 'add', { items: [{ kind: 'plain', name, init: init === '' ? null : +init }] })) load();
        });
        root.addEventListener('input', (e) => {
            const i = e.target, k = i.dataset?.mpi;
            if (k === 'brq') { S.brQ = i.value; drawOpts(); }
            if (k === 'fogsize') { S.fogSize = +i.value; remember(); const n = root.querySelector('[data-mp=fogn]'); if (n) n.textContent = S.fogSize; part('opts').dataset.h = ''; }
        });
        root.addEventListener('change', async (e) => {
            const i = e.target, k = i.dataset?.mpi, t = [...S.picks].map(tokOf).filter(Boolean)[0], en = encOf();
            if (k === 'map') {
                if (i.value === '__browse') { i.value = S.m?.id || ''; i.blur(); return openMaps(); }
                S.open = i.value; S.fitted = ''; i.blur();
                return load();
            }
            if (k === 'menu') {
                const v = i.value; i.value = ''; i.blur();
                if (v === 'camp') location.href = `/campaigns/${c}`;
                else if (v === 'spec') open(`/campaigns/${c}/table`, 'spectator');
                else if (v === 'maps') openMaps();
                else if (v === 'grid') { if (S.m) openScale(false); }
                else if (v === 'set') openSettings();
                return;
            }
            if (k === 'hptemp' && t) { const n = Math.max(0, parseInt(i.value, 10) || 0); i.blur(); if (t.kind === 'pc') changeHp(t, 'temp', n); else setMonHp(t, { k: 'set', hp: { temp: n } }); return; }
            if (k === 'hpmax' && t) { const n = parseInt(i.value, 10); i.value = ''; i.blur(); if (n > 0) setMonHp(t, { k: 'set', hp: { base: n, mod: 0, cur: Math.min(t.hp.cur, n) } }); return; }
            if (k === 'ovpat') { S.ovPat = +i.value; for (const id of S.picks) { const o = ovOf(id); if (o) { o.pat = S.ovPat; post({ op: 'overlay', o }, true); } } remember(); return drawMarks(); }
            if (k === 'brtype') { S.brType = i.value; return drawOpts(); }
            if (k === 'brsize') { S.brSize = i.value; return drawOpts(); }
            if (k === 'brcr') { S.brCr = i.value; return drawOpts(); }
            if (i.dataset?.initg) { for (const x of i.dataset.initg.split(',')) { if (i.value === '') delete en.init[x]; else en.init[x] = parseInt(i.value, 10) || 0; } i.blur(); return saveEnc(en); }
            if (i.dataset?.fe) { i.blur(); return window.Fight.act(c, 'init', { e: i.dataset.fe, value: i.value === '' ? null : +i.value }); }
        });
        addEventListener('keydown', (e) => {
            if (e.target.closest?.('input, select, textarea, [contenteditable]') || document.querySelector('dialog[open]')) return;
            const k = e.key.toLowerCase(), r = view.getBoundingClientRect(), mid = (f) => zoom(f, r.width / 2, r.height / 2);
            if (S.m && !e.ctrlKey && !e.metaKey && !e.altKey && (S.table || S.full)) {
                if (k === '+' || k === '=') return mid(1.25);
                if (k === '-' || k === '_') return mid(0.8);
                if (k === '0') return fit();
            }
            if (S.table || !S.full || !S.m) return;
            if (e.ctrlKey || e.metaKey) {
                if (k === 'z' && S.dm) { e.preventDefault(); return fogUndo(); }
                if (k === 'c' && S.dm && S.picks.size) S.clip = [...S.picks];
                if (k === 'v' && S.dm && S.clip) {
                    const [hx, hy] = S.hover || viewMid(), base = S.clip.map(tokOf).filter(Boolean)[0];
                    (async () => {
                        for (const id of S.clip) {
                            const t = tokOf(id), o = ovOf(id);
                            if (t && t.kind === 'monster') { const [x, y] = base ? snap(t, t.x + hx - base.x, t.y + hy - base.y) : snap(t, hx, hy); await post({ op: 'paste', k: t.k, x, y }); }
                            if (o) { const n = { ...o, id: uid(), x: o.x + S.m.grid.s, y: o.y + S.m.grid.s }; S.m.overlays.push(n); await post({ op: 'overlay', o: n }); }
                        }
                        load();
                    })();
                }
                return;
            }
            if (e.key === ' ') { S.space = true; e.preventDefault(); return; }
            if (e.key === 'Escape') { S.picks.clear(); S.panel = null; S.poly = []; S.pop = null; S.tool = 'select'; return draw(); }
            if (e.shiftKey) {
                if (!S.dm || !S.picks.size) return;
                const first = [...S.picks].map((i) => tokOf(i) || ovOf(i)).filter(Boolean)[0], list = [...S.picks];
                if (k === 'h') { const on = !first.hidden; (async () => { for (const id of list) { const t = tokOf(id), o = ovOf(id); if (t && t.kind !== 'pc') await setHidden(t, on); if (o) { o.hidden = on; await post({ op: 'overlay', o }); } } load(); })(); return; }
                if (k === 'g') return root.querySelector('[data-mpa=group]')?.click() ?? groupNow();
                if (k === 'l') { const on = !first.locked; for (const id of list) { const t = tokOf(id), o = ovOf(id); if (t) { t.locked = on; post({ op: 'token', k: t.k, locked: on }, true); } if (o) { o.locked = on; post({ op: 'overlay', o }, true); } } return; }
                return;
            }
            const mover = [...S.picks].map(tokOf).filter((t) => t && movable(t) && canEdit());
            const dir = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] }[k] || (mover.length ? { a: [-1, 0], d: [1, 0], w: [0, -1], s: [0, 1] }[k] : null);
            if (dir && mover.length) { e.preventDefault(); for (const t of mover) moveTo(t, t.x + dir[0] * S.m.grid.s, t.y + dir[1] * S.m.grid.s); return; }
            if (k === 'backspace' || k === 'delete') { e.preventDefault(); return deleteSel(); }
            const tool = TOOLS.find(([, key]) => key.toLowerCase() === k);
            if (tool) setTool(tool[0]);
        });
        function groupNow() { const picks = [...S.picks], g = picks.some((id) => (tokOf(id) || ovOf(id))?.group) ? '' : uid(); for (const id of picks) { const t = tokOf(id), o = ovOf(id); if (t) { t.group = g; post({ op: 'token', k: t.k, group: g }, true); } if (o) { o.group = g; post({ op: 'overlay', o }, true); } } }
        addEventListener('keyup', (e) => { if (e.key === ' ') S.space = false; });

        // ---- dialogs ----
        function dlg(html, cls = 'mpt-dlg') {
            const d = document.createElement('dialog');
            d.className = 'dlg ' + cls;
            d.innerHTML = html;
            document.body.append(d);
            d.addEventListener('close', () => d.remove());
            d.showModal();
            return d;
        }
        function ask(title, text, yes, value) {
            return new Promise((done) => {
                const d = dlg(`<form method="dialog"><h2>${esc(title)}</h2>${text ? `<p>${esc(text)}</p>` : ''}${value !== undefined ? `<label>Name <input class="field" name="v" value="${esc(value)}" required maxlength="80"></label>` : ''}<div class="actions"><button type="button" class="btn" value="no">Cancel</button><button class="btn primary" value="yes">${esc(yes)}</button></div></form>`, '');
                let answer = false;
                d.querySelector('[value=no]').onclick = () => d.close();
                d.querySelector('form').onsubmit = (e) => { e.preventDefault(); answer = value !== undefined ? d.querySelector('input').value.trim() : true; d.close(); };
                d.addEventListener('close', () => done(answer));
            });
        }
        let mapQ = '', mapsDlg = null;
        function openMaps() {
            if (mapsDlg?.open) mapsDlg.close();
            const d = mapsDlg = dlg('<h2>Map Browser</h2><div data-mb></div>');
            d.addEventListener('close', () => { if (mapsDlg === d) mapsDlg = null; });
            drawMaps();
            d.addEventListener('input', (e) => { if (e.target.dataset.mbq !== undefined) { mapQ = e.target.value; drawMaps(); const f = d.querySelector('[data-mbq]'); f.focus(); f.setSelectionRange(mapQ.length, mapQ.length); } });
            d.addEventListener('change', (e) => { if (e.target.dataset.mbf !== undefined && e.target.files[0]) upload(e.target.files[0], e.target); });
            d.addEventListener('click', async (e) => {
                const b = e.target.closest('[data-m]');
                if (!b) return;
                const a = b.dataset.m, id = b.dataset.v;
                if (a === 'close') return d.close();
                if (a === 'upload') return d.querySelector('[data-mbf]').click();
                if (a === 'open') { sending.picked = true; S.open = id; S.fitted = ''; d.close(); return load(); }
                if (a === 'rename') {
                    const x = S.v.maps.find((y) => y.id === id), name = await ask('Rename the map', '', 'Rename', x?.name || '');
                    if (name && (await post({ op: 'rename', m: id, name }))) await load();
                    return drawMaps();
                }
                if (a === 'archive' || a === 'unarchive') {
                    if (await post({ op: 'archive', m: id, on: a === 'archive' })) {
                        if (a === 'archive' && S.open === id) { S.open = null; S.fitted = ''; }
                        toast(a === 'archive' ? 'Map archived. Find it under Archived.' : 'Map unarchived.', 'ok');
                        await load();
                    }
                    return drawMaps();
                }
            });
        }
        function drawMaps() {
            const d = mapsDlg, box = d?.querySelector('[data-mb]');
            if (!box || S.uploading) return;
            const dis = canEdit() ? '' : ' disabled', q = mapQ.toLowerCase(), list = (S.v?.maps || []).filter((x) => !q || x.name.toLowerCase().includes(q));
            const tile = (x) => `<article class="mpt-mapc${S.v.active === x.id ? ' on' : ''}"><img src="${esc(x.thumb)}" alt="" width="240" height="160" loading="lazy"><b title="${esc(x.name)}">${esc(x.name)}</b><span class="mpt-row">${S.v.active === x.id ? '<span class="badge g">Displayed</span>' : ''}${x.id === S.m?.id ? '<span class="badge b">Open</span>' : ''}</span>
                <div class="mpt-row">${x.archived ? `<button type="button" class="btn small" data-m="unarchive" data-v="${esc(x.id)}"${dis}>Unarchive</button>` : `<button type="button" class="btn small" data-m="open" data-v="${esc(x.id)}">Open</button><button type="button" class="btn small" data-m="rename" data-v="${esc(x.id)}"${dis}>Rename</button><button type="button" class="btn small" data-m="archive" data-v="${esc(x.id)}"${dis}>Archive</button>`}</div></article>`;
            const on = list.filter((x) => !x.archived), off = list.filter((x) => x.archived), kept = box.querySelector('details')?.open;
            box.innerHTML = `<div class="mpt-row"><input class="field" data-mbq type="search" placeholder="Search maps" aria-label="Search maps" value="${esc(mapQ)}" style="flex:1 1 200px"><button type="button" class="btn primary" data-m="upload"${dis}>Upload map</button><input type="file" data-mbf hidden accept=".jpg,.jpeg,.png,.webp,.gif,image/jpeg,image/png,image/webp,image/gif"></div>
                <p class="muted mp-upstate" data-mbs>JPG, PNG, WebP or GIF (a GIF as a still picture), any size.</p>
                <div class="mpt-maps">${on.map(tile).join('') || '<p class="mpt-hint">No maps match.</p>'}</div>${off.length ? `<details${kept ? ' open' : ''}><summary>Archived (${off.length})</summary><div class="mpt-maps">${off.map(tile).join('')}</div></details>` : ''}
                <div class="actions"><button type="button" class="btn" data-m="close">Close</button></div>`;
        }
        // ---- upload: 4 MB chunks in order, each tried again if the connection blinks ----
        async function upload(file, input) {
            const state = mapsDlg?.querySelector('[data-mbs]');
            const say = (t) => { if (state) state.textContent = t; };
            if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type) && !/\.(jpe?g|png|webp|gif)$/i.test(file.name)) { say("That isn't a JPG, PNG, WebP or GIF picture. Save the map as one of those and upload it again."); input.value = ''; return; }
            const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
            S.uploading = true;
            try {
                for (let i = 0, pos = 0; pos < file.size || i === 0; i++, pos += CHUNK) {
                    say(`Uploading ${Math.min(100, Math.round((pos / Math.max(1, file.size)) * 100))}%...`);
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
                say('Making the map...');
                const out = await post({ op: 'upload', up: id, name: file.name.replace(/\.[^.]+$/, '') }, true);
                if (!out) throw new Error(S.err);
                S.open = out.map; S.fitted = ''; S.uploading = false;
                sending.picked = true;
                mapsDlg?.close();
                await load();
                toast('Map uploaded. It stays off the table until you press Display map.', 'ok');
                openScale(true);
            } catch (x) {
                S.uploading = false;
                say(x.message);
                input.value = '';
            }
        }
        // the grid: drag a box over one printed square; arrow keys nudge it; a square is 5 ft
        function openScale(isNew) {
            const m = S.m, g = { ...m.grid };
            const d = dlg(`<h2>${isNew ? 'Scale the map' : 'Fit the grid'}</h2><p class="mpt-hint">Drag a box over one printed square on the map, then check the size. Arrow keys nudge the grid. One square is 5 ft.</p>
                <div class="mpt-scale" tabindex="0" data-sc><img src="${esc(m.img)}" alt="" draggable="false"><div class="mpt-scgrid" data-scg></div><div class="mpt-box" data-scb hidden></div></div>
                <div class="mpt-row" style="margin-top:8px"><label class="mpt-hint">Name <input class="field" data-scn value="${esc(m.name)}" maxlength="80"></label><label class="mpt-hint">Square size in pixels <input class="field" style="width:90px" data-scs type="number" min="8" step="0.5" value="${+g.s.toFixed(2)}"></label></div>
                <div class="actions"><button type="button" class="btn" data-scx>Cancel</button><button type="button" class="btn primary" data-scy>Save</button></div>`);
            const area = d.querySelector('[data-sc]'), im = area.querySelector('img'), gr = d.querySelector('[data-scg]'), bx = d.querySelector('[data-scb]'), size = d.querySelector('[data-scs]');
            const scale = () => m.w / (im.clientWidth || 1);
            const show = () => { const k = 1 / scale(), [x0, y0] = cells(g, m.w, m.h); Object.assign(gr.style, { width: im.clientWidth + 'px', height: im.clientHeight + 'px', backgroundSize: `${g.s * k}px ${g.s * k}px`, backgroundPosition: `${x0 * k}px ${y0 * k}px` }); };
            im.addEventListener('load', show); show();
            let st = null;
            const pt = (ev) => { const R = im.getBoundingClientRect(); return [ev.clientX - R.left, ev.clientY - R.top]; };
            area.addEventListener('pointerdown', (ev) => { st = pt(ev); area.setPointerCapture(ev.pointerId); area.focus(); });
            area.addEventListener('pointermove', (ev) => {
                if (!st) return;
                const p = pt(ev), s = Math.max(Math.abs(p[0] - st[0]), Math.abs(p[1] - st[1])), X = p[0] < st[0] ? st[0] - s : st[0], Y = p[1] < st[1] ? st[1] - s : st[1], k = scale();
                bx.hidden = false; Object.assign(bx.style, { left: X + 'px', top: Y + 'px', width: s + 'px', height: s + 'px' });
                if (s * k >= 8) { g.s = s * k; g.ox = ((X * k) % g.s + g.s) % g.s; g.oy = ((Y * k) % g.s + g.s) % g.s; size.value = +g.s.toFixed(2); show(); }
            });
            area.addEventListener('pointerup', () => { st = null; });
            area.addEventListener('keydown', (ev) => {
                if (!/^Arrow/.test(ev.key)) return;
                ev.preventDefault();
                if (ev.key === 'ArrowLeft') g.ox -= 1; else if (ev.key === 'ArrowRight') g.ox += 1; else if (ev.key === 'ArrowUp') g.oy -= 1; else g.oy += 1;
                g.ox = ((g.ox % g.s) + g.s) % g.s; g.oy = ((g.oy % g.s) + g.s) % g.s; show();
            });
            size.addEventListener('input', () => { const s = +size.value; if (s >= 8) { g.s = s; show(); } });
            d.querySelector('[data-scx]').onclick = () => d.close();
            d.querySelector('[data-scy]').onclick = async () => {
                const name = d.querySelector('[data-scn]').value.trim();
                const ok = await post({ op: 'grid', s: g.s, ox: g.ox, oy: g.oy });
                if (ok && name && name !== m.name) await post({ op: 'rename', name });
                if (ok) { d.close(); load(); }
            };
        }
        function openSettings() {
            const K = [['Select', 'V'], ['Pan', 'P'], ['Pan for a moment', 'Hold Space'], ['Tokens', 'T'], ['Fog of War', 'F'], ['Reveal fog, cover with fog', 'Left drag, right drag'], ['Draw', 'D'], ['Overlays', 'O'], ['Ruler', 'R'], ['Point', 'X'], ['Drop tool, deselect', 'Esc'], ['Move token', 'Arrows or W A S D'], ['Remove token', 'Backspace'], ['Hide or reveal', 'Shift+H'], ['Group', 'Shift+G'], ['Lock', 'Shift+L'], ['Add to selection', 'Shift+Click'], ['Move one in a group', 'Shift+Drag'], ['Copy, paste', 'Ctrl+C, Ctrl+V'], ['Undo fog stroke', 'Ctrl+Z'], ['Ruler corner', 'Right click'], ['Zoom', 'Wheel, + and -'], ['Fog brush size', 'Wheel, with the brush'], ['Fit the map', '0']].filter(([, key]) => S.dm || !/^(T|F|Left drag, right drag|O|Backspace|Shift\+H|Shift\+G|Shift\+L|Ctrl\+C, Ctrl\+V|Ctrl\+Z)$/.test(key));
            const o = S.m?.opts || { fx: true, ac: false };
            const d = dlg(`<h2>Settings and shortcuts</h2><div class="form" style="display:grid;gap:6px;margin:8px 0 12px"><label class="check"><input type="checkbox" data-st="grid"${S.lines ? ' checked' : ''}> Show the grid (this window only)</label>${S.dm ? `<label class="check"><input type="checkbox" data-st="fx"${o.fx ? ' checked' : ''}> Show bloodied and dead effects to players</label><label class="check"><input type="checkbox" data-st="ac"${o.ac ? ' checked' : ''}> Show AC on monster tokens to players during combat</label>` : ''}</div>
                <div class="mpt-keys">${K.map(([a, b]) => `<div><span>${a}</span><kbd>${b}</kbd></div>`).join('')}</div><div class="actions"><button type="button" class="btn primary" data-stx>Close</button></div>`);
            d.querySelector('[data-stx]').onclick = () => d.close();
            d.addEventListener('change', async (e) => {
                const k = e.target.dataset.st;
                if (k === 'grid') { S.lines = e.target.checked; drawGrid(); drawBar(); }
                else if (k && S.m) { if (await post({ op: 'opts', [k]: e.target.checked })) load(); }
            });
        }

        // ---- live: moves, rulers and changes from the others ----
        function onMessage(m) {
            if (m.type === 'map' || m.type === 'fight' || m.type === 'campaign' || m.type === 'status') {
                if (G?.type === 'fog' || G?.type === 'draw') return; // the DM's next stroke isn't interrupted; their own save reloads after it
                if (m.type === 'map' && !S.dm) window.Fight?.load(c); // fog changes who is in sight, so the turn order follows
                return load();
            }
            if (m.type === 'mapmove' && m.m === S.m?.id) {
                const t = tokOf(m.k);
                if (m.gone) { if (t) S.m.tokens = S.m.tokens.filter((x) => x !== t); S.picks.delete(m.k); drawToks(); window.Fight?.load(c); return drawMenu(); }
                if (!t) { window.Fight?.load(c); return load(); } // one that just came into sight: its name and picture come with the map
                if (G?.items?.some((i) => i.t === t)) return;
                Object.assign(t, { x: m.x, y: m.y, placed: m.placed });
                drawToks(); drawTray(); drawBar(); return placeMenu();
            }
            if (m.type === 'ruler') {
                if (m.who === S.me) return;
                if (m.pts) S.rulers[m.who] = { name: m.name, pts: m.pts, m: m.m }; else delete S.rulers[m.who];
                return drawLive();
            }
            if (m.type === 'mapfog' && m.m === S.m?.id && m.who !== S.me) { S.fogLive[m.who] = { op: m.op, at: Date.now() }; drawFog(); setTimeout(() => { if (S.m) drawFog(); }, 2600); return; }
            if (m.type === 'maptrail' && m.m === S.m?.id && m.who !== S.me) {
                const to = m.pts[m.pts.length - 1], tr = S.trails.find((x) => x.id === m.id);
                if (tr) Object.assign(tr, { target: to, at: Date.now() }); else S.trails.push({ id: m.id, target: to, head: to, tail: [], c: m.c, at: Date.now() });
                return drawLive();
            }
            if (m.type === 'removed') { S.v = null; S.m = null; S.failed = true; draw(); }
        }
        addEventListener('online', load);
        addEventListener('offline', draw);
        new ResizeObserver(() => { if (S.m && !S.moved && view.offsetWidth) fit(); }).observe(view);
        const watch = window.Live?.watch(c, { load, onMessage, onPaused(p) { S.paused = p; draw(); } });
        if (!watch) load();
        const fe = part('fight');
        if (fe && window.Fight) window.Fight.panel(fe, c, { onChange(f) { fe.hidden = true; S.fight = f; drawTop(); drawSide(); if (S.m) drawToks(); drawMenu(); opts.onFight?.(f); } });
        if (S.dm && S.full) { loadMons(); loadParty(); }
        return { state: S, load, fit, draw, foggedAt };
    }
    return { mount, tiles };
})();
