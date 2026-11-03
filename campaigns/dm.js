// DM notes and handouts on the campaign page (ROADMAP 3.4), for the DM and co-DMs. campaigns.js starts it:
//   DmTools.start(campaignId, {notes, handouts, players}) -> { refresh() }   refresh: load both again from the server
// Every note and every handout's text is also kept in this browser (localStorage "campaign-dm":
// {<campaign id>: {notes: {id: note}, handouts: {id: {id, title, text, table, updated}}, dirty: ["n:<id>", "h:<id>"]}}),
// so writing works offline. Edits save by themselves to campaigns/handouts.php, and per note and per handout the newest
// "updated" wins, as with characters. Pictures go up in 4 MB pieces (a broken upload carries on where it stopped) and
// wait in this page while offline. A handout can't be sent, or have its players changed, until its text and pictures are
// saved. Nothing is deleted: notes and handouts are archived and come back with Restore.
window.DmTools = (() => {
    'use strict';
    const KEY = 'campaign-dm', CHUNK = 4 * 1024 * 1024, API = '/campaigns/handouts.php';
    const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

    function start(cid, data) {
        const { $, esc, toast, debounce, store } = UI;
        const all = store.get(KEY, {});
        const mine = Object.assign({ notes: {}, handouts: {}, dirty: [] }, all[cid]);
        const persist = () => store.set(KEY, { ...store.get(KEY, {}), [cid]: mine });
        const dirty = (k, on = true) => { mine.dirty = mine.dirty.filter((x) => x !== k); if (on) mine.dirty.push(k); };
        let srv = {}, players = [], openN = '', openH = '', q = '', online = true;
        const pickTo = {}; // handout id -> "everyone" or [sub]: the recipients being picked
        const queue = []; // pictures waiting to go up: {hid, file, up, at}
        const post = (body) => fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ c: cid, ...body }) });
        const fields = (h) => ({ id: h.id, title: h.title, text: h.text, table: !!h.table, updated: h.updated });

        // the server's copies: each one wins over this browser's unless this browser's is newer
        function take(notes, handouts) {
            if (notes) {
                for (const n of notes) { const l = mine.notes[n.id]; if (!l || n.updated >= l.updated) { mine.notes[n.id] = n; dirty('n:' + n.id, false); } else dirty('n:' + n.id); }
                for (const id in mine.notes) if (!notes.some((n) => n.id === id)) dirty('n:' + id);
            }
            if (handouts) {
                srv = Object.fromEntries(handouts.map((h) => [h.id, h]));
                for (const h of handouts) { const l = mine.handouts[h.id]; if (!l || h.updated >= l.updated) { mine.handouts[h.id] = fields(h); dirty('h:' + h.id, false); } else dirty('h:' + h.id); }
                for (const id in mine.handouts) if (!srv[id]) dirty('h:' + id);
            }
            persist();
            drawLists();
            flush();
        }

        // one save at a time, oldest change first; offline, they wait here
        let busy = false;
        async function flush() {
            if (busy) return;
            busy = true;
            for (const k of [...mine.dirty]) {
                const id = k.slice(2), note = k[0] === 'n', item = note ? mine.notes[id] : mine.handouts[id];
                if (!item) { dirty(k, false); continue; }
                const at = item.updated;
                let r, out;
                try { r = await post(note ? { act: 'note', note: item } : { act: 'save', handout: item }); out = await r.json(); }
                catch (e) { online = false; break; }
                online = true;
                if (r.status === 401 || r.status >= 500) break;
                const cur = note ? mine.notes[id] : mine.handouts[id];
                if ((r.ok || r.status === 409) && cur.updated === at) {
                    // saved, or someone saved a newer copy: that one is kept
                    if (note) mine.notes[id] = out.note;
                    else { srv[id] = out.handout; mine.handouts[id] = fields(out.handout); }
                    dirty(k, false);
                    if (r.status === 409) redraw(id);
                }
                else if (!r.ok && r.status !== 409) { dirty(k, false); toast(out.error || "Couldn't save that.", 'err'); }
            }
            busy = false;
            persist();
            drawLists();
            upload();
        }
        const flushSoon = debounce(flush, 800);
        addEventListener('online', () => { flush(); });
        setInterval(() => { if (mine.dirty.length || queue.length) flush(); }, 15000);
        addEventListener('pagehide', () => { persist(); });

        async function upload() {
            if (upload.on) return;
            upload.on = true;
            while (queue.length) {
                const x = queue[0];
                if (!srv[x.hid] || mine.dirty.includes('h:' + x.hid)) break; // the handout goes up first (flush calls back)
                try {
                    while (x.at < x.file.size) {
                        const r = await fetch(`${API}?c=${encodeURIComponent(cid)}&up=${x.up}&at=${x.at}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: x.file.slice(x.at, x.at + CHUNK) });
                        const out = await r.json();
                        if (!r.ok && r.status !== 409) throw new Error(out.error);
                        x.at = out.size; // 409: the server says how much it has, so carry on from there
                        drawUp();
                    }
                    const r = await post({ act: 'image', id: x.hid, up: x.up, name: x.file.name });
                    const out = await r.json();
                    queue.shift();
                    if (!r.ok) toast(`${x.file.name}: ${out.error || "couldn't be added."}`, 'err');
                    else { srv[x.hid] = out.handout; if (!mine.dirty.includes('h:' + x.hid)) mine.handouts[x.hid] = fields(out.handout); redraw(x.hid); }
                }
                catch (e) {
                    if (e instanceof TypeError) { online = false; break; } // offline: it carries on when the connection is back
                    queue.shift();
                    toast(`${x.file.name}: ${e.message || "couldn't be uploaded."}`, 'err');
                }
            }
            upload.on = false;
            persist();
            drawUp();
            drawH();
        }

        // ---- notes ----
        const noteList = () => Object.values(mine.notes);
        const nGroup = (n) => String(n.group || '').trim();
        function drawN() {
            const live = noteList().filter((n) => !n.archived), arch = noteList().filter((n) => n.archived);
            const hit = (n) => !q || `${n.title} ${n.group} ${n.body}`.toLowerCase().includes(q);
            const groups = [...new Set(live.map(nGroup))].sort((a, b) => (a === '') - (b === '') || a.localeCompare(b));
            const btn = (n) => `<button type="button" data-dm="nopen" data-id="${esc(n.id)}" aria-pressed="${n.id === openN}"><span>${esc(n.title || 'Untitled note')}</span>${n.pinned ? '<span class="badge">Pinned</span>' : ''}</button>`;
            const sorted = (list) => list.sort((a, b) => b.pinned - a.pinned || b.updated - a.updated);
            $('#dm-nlist').innerHTML = live.length ? groups.map((g) => { const l = sorted(live.filter((n) => nGroup(n) === g && hit(n))); return l.length ? (groups.length > 1 ? `<h3>${esc(g || 'No group')}</h3>` : '') + l.map(btn).join('') : ''; }).join('') || '<p class="muted">No notes match.</p>'
                : '<p class="muted">No notes yet. Make one with New note.</p>';
            $('#dm-narch').hidden = !arch.length;
            $('#dm-narch').innerHTML = `<summary>Archived (${arch.length})</summary><div class="rows">${arch.map((n) => `<div class="rowi"><span class="grow">${esc(n.title || 'Untitled note')}</span><button type="button" class="btn small" data-dm="nrestore" data-id="${esc(n.id)}">Restore</button></div>`).join('')}</div>`;
            $('#dm-ngroups').innerHTML = groups.filter(Boolean).map((g) => `<option value="${esc(g)}">`).join('');
        }
        function drawNEdit() {
            const n = mine.notes[openN];
            $('#dm-nedit').innerHTML = !n || n.archived ? `<p class="muted">${noteList().some((x) => !x.archived) ? 'Pick a note, or make a new one.' : 'Notes for you and your co-DMs. Players never see them.'}</p>`
                : `<label>Title <input class="field" data-nf="title" value="${esc(n.title)}" autocomplete="off"></label>
                <label>Group (optional) <input class="field" data-nf="group" value="${esc(n.group)}" list="dm-ngroups" autocomplete="off"></label>
                <label>Note <textarea class="field" data-nf="body">${esc(n.body)}</textarea></label>
                <div class="actions"><button type="button" class="btn small" data-dm="npin" aria-pressed="${!!n.pinned}">${n.pinned ? 'Unpin' : 'Pin'}</button><button type="button" class="btn small" data-dm="narc">Archive</button>
                <span class="muted dm-state" id="dm-nstate"></span></div>`;
            drawState();
        }
        function editNote(change) {
            const n = mine.notes[openN];
            Object.assign(n, change, { updated: Date.now() });
            dirty('n:' + n.id);
            persist();
            drawState();
            flushSoon();
        }
        function drawState() {
            const el = $('#dm-nstate');
            if (el) el.textContent = !mine.dirty.includes('n:' + openN) ? 'Saved' : online ? 'Saving...' : 'Saved in this browser. It goes to your account when you\'re back online.';
        }

        // ---- handouts ----
        const merged = (id) => ({ images: [], to: null, archived: 0, ...srv[id], ...mine.handouts[id] });
        const names = (to) => (to === 'everyone' ? 'everyone' : (to || []).map((s) => players.find((p) => p.sub === s)?.name || 'a player who left').join(', '));
        const pending = (id) => queue.filter((x) => x.hid === id).length;
        function drawH() {
            const list = Object.keys({ ...srv, ...mine.handouts }).map(merged).sort((a, b) => b.updated - a.updated);
            const live = list.filter((h) => !h.archived), arch = list.filter((h) => h.archived);
            $('#dm-hlist').innerHTML = live.length ? live.map((h) => `<button type="button" data-dm="hopen" data-id="${esc(h.id)}" aria-pressed="${h.id === openH}"><span>${esc(h.title || 'Untitled handout')}</span>
                <span class="badge${h.to ? ' g' : ''}">${h.to ? 'Sent' : 'Draft'}</span>${h.table ? '<small>Table</small>' : ''}</button>`).join('') : '<p class="muted">No handouts yet. Make one with New handout.</p>';
            $('#dm-harch').hidden = !arch.length;
            $('#dm-harch').innerHTML = `<summary>Archived (${arch.length})</summary><div class="rows">${arch.map((h) => `<div class="rowi"><span class="grow">${esc(h.title || 'Untitled handout')}</span><button type="button" class="btn small" data-dm="hrestore" data-id="${esc(h.id)}">Restore</button></div>`).join('')}</div>`;
        }
        function drawHEdit() {
            const h = openH && merged(openH);
            if (!h || h.archived) { $('#dm-hedit').innerHTML = '<p class="muted">Pick a handout, or make a new one. It stays a draft, seen only by you and co-DMs, until you send it.</p>'; return; }
            const to = pickTo[h.id] ?? (h.to || 'everyone');
            $('#dm-hedit').innerHTML = `<label>Title <input class="field" data-hf="title" value="${esc(h.title)}" autocomplete="off"></label>
                <label>Text (optional) <textarea class="field" data-hf="text">${esc(h.text)}</textarea></label>
                <div><div class="dm-pics" id="dm-pics"></div>
                    <p><button type="button" class="btn small" data-dm="hfile">Add pictures</button><input type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple hidden data-dm-file aria-label="Add pictures"> <span class="muted" id="dm-up"></span></p></div>
                <label class="check"><input type="checkbox" data-hf="table"${h.table ? ' checked' : ''}> Show on the Table view <small class="muted">only when sent to everyone</small></label>
                <fieldset class="dm-to"><legend>Who gets it</legend>
                    <label class="check"><input type="checkbox" data-to="everyone"${to === 'everyone' ? ' checked' : ''}> Everyone, and players who join later</label>
                    ${players.map((p) => `<label class="check"><input type="checkbox" data-to="${esc(p.sub)}"${to === 'everyone' || to.includes(p.sub) ? ' checked' : ''}${to === 'everyone' ? ' disabled' : ''}> ${esc(p.name)}</label>`).join('') || '<p class="muted">No players have joined yet.</p>'}</fieldset>
                <div class="actions"><button type="button" class="btn primary" data-dm="hsend">${h.to ? 'Update players' : 'Send'}</button>${h.to ? '<button type="button" class="btn" data-dm="hunshare">Unshare</button>' : ''}<button type="button" class="btn" data-dm="harc">Archive</button></div>
                <p class="muted dm-state" id="dm-hstate"></p>`;
            drawUp();
        }
        const pics = (h) => h.images.map((i) => `<span class="dm-pic"><img src="${esc(i.url)}" alt="${esc(i.name)}" width="96" height="96" loading="lazy"><button type="button" class="btn small" data-dm="hunimg" data-img="${esc(i.id)}">Remove</button></span>`).join('');
        // what the handout's waiting for, and whether it can be sent yet; its pictures (they change while you type)
        function drawUp() {
            const h = openH && merged(openH), up = $('#dm-up');
            if (!h || !up) return;
            const box = $('#dm-pics'), ids = h.images.map((i) => i.id).join() || '-';
            if (box.dataset.ids !== ids) { box.innerHTML = pics(h); box.dataset.ids = ids; }
            const n = pending(h.id), x = queue[0], saved = srv[h.id] && !mine.dirty.includes('h:' + h.id);
            up.textContent = !n ? '' : !online ? `${n === 1 ? '1 picture waits' : n + ' pictures wait'} for the connection.`
                : `Uploading ${n === 1 ? '1 picture' : n + ' pictures'}${x?.hid === h.id && x.file.size ? `, ${Math.floor((x.at / x.file.size) * 100)}%` : ''}...`;
            $('[data-dm="hsend"]').disabled = !!n || !saved;
            $('#dm-hstate').textContent = n ? "It can be sent once its pictures are up." : !saved ? (online ? 'Saving...' : 'Saved in this browser. It can be sent once you\'re back online.')
                : h.to ? `Sent to ${names(h.to)}${h.sent ? ' on ' + new Date(h.sent).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}.` : 'Draft: only you and co-DMs see it.';
        }
        function editH(change) {
            const h = mine.handouts[openH] || (mine.handouts[openH] = fields(merged(openH)));
            Object.assign(h, change, { updated: Date.now() });
            dirty('h:' + h.id);
            persist();
            drawUp();
            flushSoon();
        }
        async function act(body, b) {
            if (b) b.disabled = true;
            try {
                const r = await post({ id: openH, ...body }), out = await r.json();
                if (!r.ok) { toast(out.error || "Couldn't save that. Try again.", 'err'); if (b) b.disabled = false; return; }
                srv[out.handout.id] = out.handout;
                mine.handouts[out.handout.id] = fields(out.handout);
                persist();
                delete pickTo[out.handout.id];
                return out.handout;
            } catch (e) { toast("Couldn't reach the site. Check your connection and try again.", 'err'); if (b) b.disabled = false; }
        }

        function drawLists() { drawN(); drawH(); drawState(); drawUp(); }
        function draw() { drawLists(); drawNEdit(); drawHEdit(); }
        // a newer copy came in: the open editor shows it, unless you're typing in it
        function redraw(id) {
            drawLists();
            if (id === openN && !$('#dm-nedit').contains(document.activeElement)) drawNEdit();
            if (id === openH && !$('#dm-hedit').contains(document.activeElement)) drawHEdit();
        }

        document.addEventListener('input', (e) => {
            const t = e.target;
            if (t.dataset.nf && mine.notes[openN]) { editNote({ [t.dataset.nf]: t.value }); if (t.dataset.nf === 'title') drawN(); }
            else if (t.matches('#dm-nsearch')) { q = t.value.trim().toLowerCase(); drawN(); }
            else if (t.dataset.hf && openH) { editH({ [t.dataset.hf]: t.type === 'checkbox' ? t.checked : t.value }); if (t.dataset.hf !== 'text') drawH(); }
        });
        document.addEventListener('change', (e) => {
            const t = e.target;
            if (t.dataset.to !== undefined && openH) {
                const boxes = [...document.querySelectorAll('#dm-hedit [data-to]')];
                pickTo[openH] = boxes[0].checked ? 'everyone' : boxes.slice(1).filter((x) => x.checked).map((x) => x.dataset.to);
                if (t.dataset.to === 'everyone') drawHEdit();
            }
            else if (t.matches('[data-dm-file]') && openH) {
                for (const file of t.files) queue.push({ hid: openH, file, up: [...crypto.getRandomValues(new Uint8Array(8))].map((x) => x.toString(16).padStart(2, '0')).join(''), at: 0 });
                t.value = '';
                drawUp();
                flush(); // saves the handout first if it's new, then uploads
            }
        });
        document.addEventListener('click', async (e) => {
            const b = e.target.closest('[data-dm]');
            if (!b) return;
            const a = b.dataset.dm, id = b.dataset.id;
            if (a === 'nnew') {
                const n = { id: uid(), title: '', group: '', body: '', pinned: false, archived: 0, created: Date.now(), updated: Date.now() };
                mine.notes[n.id] = n; openN = n.id; dirty('n:' + n.id); persist(); flushSoon();
                drawN(); drawNEdit(); $('#dm-nedit [data-nf=title]').focus();
            }
            else if (a === 'nopen') { openN = id; drawN(); drawNEdit(); }
            else if (a === 'npin') { editNote({ pinned: !mine.notes[openN].pinned }); drawN(); drawNEdit(); }
            else if (a === 'narc') { editNote({ archived: Date.now() }); openN = ''; drawN(); drawNEdit(); }
            else if (a === 'nrestore') { openN = id; editNote({ archived: 0 }); drawN(); drawNEdit(); }
            else if (a === 'hnew') {
                const h = { id: uid(), title: '', text: '', table: false, updated: Date.now() };
                mine.handouts[h.id] = h; openH = h.id; dirty('h:' + h.id); persist(); flushSoon();
                drawH(); drawHEdit(); $('#dm-hedit [data-hf=title]').focus();
            }
            else if (a === 'hopen') { openH = id; drawH(); drawHEdit(); }
            else if (a === 'hfile') $('[data-dm-file]').click();
            else if (a === 'hsend') {
                const to = pickTo[openH] ?? (merged(openH).to || 'everyone');
                if (!to.length) return toast('Pick who gets the handout.', 'err');
                const was = merged(openH).to;
                if (await act({ act: 'send', to }, b)) { toast(was ? 'Players updated.' : 'Handout sent.', 'ok'); drawH(); drawHEdit(); }
            }
            else if (a === 'hunshare') {
                const was = merged(openH).to; // ticked again, so sending it back goes to the same players
                if (await act({ act: 'unshare' }, b)) { pickTo[openH] = was; toast('Unshared. It\'s a draft again.', 'ok'); drawH(); drawHEdit(); }
            }
            else if (a === 'harc') { if (await act({ act: 'archive' }, b)) { openH = ''; drawH(); drawHEdit(); } }
            else if (a === 'hrestore') { openH = id; if (await act({ act: 'restore' }, b)) { drawH(); drawHEdit(); } }
            else if (a === 'hunimg') { if (await act({ act: 'unimage', img: b.dataset.img }, b)) drawHEdit(); }
        });

        // live: the server's copies again (a co-DM's change, a reconnect, the 10 s check while the relay is down)
        async function refresh() {
            try {
                const [h, n] = await Promise.all([fetch(`${API}?c=${encodeURIComponent(cid)}`, { cache: 'no-store' }), fetch(`${API}?c=${encodeURIComponent(cid)}&notes=1`, { cache: 'no-store' })]);
                if (!h.ok || !n.ok) return;
                const hs = await h.json();
                players = hs.players || players;
                const before = JSON.stringify([srv, mine.notes]);
                take((await n.json()).notes, hs.handouts);
                if (JSON.stringify([srv, mine.notes]) !== before) { redraw(openN); redraw(openH); }
            } catch (e) { }
        }
        players = data.players || [];
        $('#dm-nsearch').value = '';
        take(data.notes, data.handouts);
        draw();
        return { refresh };
    }
    return { start };
})();
