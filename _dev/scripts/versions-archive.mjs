// Checks version history and archiving (ROADMAP 0.5) in headless Chrome and Firefox, signed in and signed out:
//   - edits make versions, a dice roll doesn't; the Versions dialog lists them in words, with the full date on hover
//   - name a version and find it with "Named only"; restore an old one, then Undo, and the character deep-equals the
//     state before (only "updated" differs); a second browser lists the same versions and restores one made on the first
//   - archive and unarchive leave the character unchanged except "archived" (and "updated"); archived it's read-only,
//     leaves its campaign, shows "Archived" to a public viewer; the old DELETE archives instead
//   - notes archive instead of delete, with Archived (N), search and Restore; the Monster Sheet archives monsters and notes
//   node _dev/scripts/versions-archive.mjs        (needs includes/config.php for sign-in)
// Starts its own server (port CHECK_PORT, default 8121) with stand-in account and session folders in the temp folder, so it
// never touches private/dnd/accounts or private/sessions. Backups, settings sync and the Monster Sheet's cloud saves are blocked.
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { launch } from './browser.mjs';

const ROOT = join(import.meta.dirname, '../..'), PORT = +process.env.CHECK_PORT || 8121, BASE = `http://localhost:${PORT}`;
const PHP = process.env.PHP || (process.platform === 'win32' ? 'C:/php/php.exe' : 'php');
const TMP = join(tmpdir(), 'dnd-versions-check'), ACCOUNTS = join(TMP, 'accounts'), SESSIONS = join(TMP, 'sessions');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ser = (o) => `a:${Object.keys(o).length}:{` + Object.entries(o).map(([k, v]) => `s:${Buffer.byteLength(k)}:"${k}";s:${Buffer.byteLength(v)}:"${v}";`).join('') + '}';
const SID = { me: 'vercheckme00000000000000000000000000', other: 'vercheckother000000000000000000000000' };

let bad = 0;
const is = (name, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) { bad++; console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); } };
const until = async (fn, ok, ms = 8000) => { const t = Date.now(); let v; while (Date.now() - t < ms) { v = await fn(); if (ok(v)) return v; await sleep(200); } return v; };
const web = spawn(PHP, ['-S', `127.0.0.1:${PORT}`, '-t', ROOT, join(ROOT, '_dev/router.php')], { stdio: 'ignore', env: { ...process.env, DND_ACCOUNTS: ACCOUNTS, DND_SESSIONS: SESSIONS } });
await sleep(800);

const file = (...p) => { try { return JSON.parse(readFileSync(join(ACCOUNTS, 'characters', ...p), 'utf8')); } catch { return null; } };
const versions = (id) => (existsSync(join(ACCOUNTS, 'characters', id, 'history')) ? readdirSync(join(ACCOUNTS, 'characters', id, 'history')).filter((f) => /^\d+\.json$/.test(f)).length : 0);
// a character without "updated", rolls or view settings, to compare what matters
const core = (c) => { const { updated, rolls, view, ...rest } = c || {}; return rest; };
const local = (b, id) => b.ev(`JSON.stringify(JSON.parse(localStorage.getItem('hb-sheet')).chars['${id}'])`).then((s) => JSON.parse(s || 'null'));
const type = (b, k, v) => b.ev(`(() => { const f = document.querySelector('[data-k="${k}"]'); f.value = ${JSON.stringify(v)}; f.dispatchEvent(new Event('input', { bubbles: true })); f.dispatchEvent(new Event('change', { bubbles: true })); })()`);
const flush = (b) => b.ev(`dispatchEvent(new Event('pagehide'))`);
const click = (b, sel) => b.ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (e) e.click(); return !!e; })()`);
const rows = (b) => b.ev(`JSON.stringify([...document.querySelectorAll('#hb-ver .hb-vrow')].map((r) => r.querySelector('.hb-vsum').textContent.replace(/\\s+/g, ' ').trim()))`).then(JSON.parse);
const openVersions = async (b) => { await click(b, '[data-act=manage]'); await click(b, '[data-act=versions]'); return until(() => rows(b), (r) => r.length > 0); };
const errs = (b, name, where) => { const e = b.errors.filter((x) => !/backup\.php|prefs\.php|accounts\.google|gsi|Content Security Policy/.test(x)); if (e.length) { bad++; console.log(`FAIL ${name} ${where}: ${e.join(' | ').slice(0, 600)}`); } };
const open = async (name) => { await sleep(name === 'firefox' ? 2000 : 300); return launch(name); };
const start = async (b, sid, db) => {
    await b.block(/backup\.php|prefs\.php|monster\/cloud\.php/);
    await b.go(BASE + '/privacy/');
    await b.ev(`localStorage.clear(); localStorage.setItem('hb-sheet-merged', '1'); ${db ? `localStorage.setItem('hb-sheet', ${JSON.stringify(JSON.stringify(db))});` : ''} document.cookie = 'dndsid=${sid}; path=/'`);
};

try {
    for (const name of ['chrome', 'firefox']) {
        rmSync(TMP, { recursive: true, force: true });
        mkdirSync(SESSIONS, { recursive: true });
        writeFileSync(join(SESSIONS, 'sess_' + SID.me), 'user|' + ser({ sub: '111', email: 'me@example.com', name: 'Me' }));
        writeFileSync(join(SESSIONS, 'sess_' + SID.other), 'user|' + ser({ sub: '222', email: 'o@example.com', name: 'Other' }));
        const id = 'ver' + name;
        const ch = { id, updated: Date.now() - 60000, name: 'Vera', race: 'Elf', art: '', classes: [{ name: 'Bard', level: 2, die: 8, hdUsed: 0 }] };
        let beforeArc = null;

        // ---- signed in: versions ----
        let b = await open(name);
        try {
            await start(b, SID.me, { cur: id, chars: { [id]: ch } });
            await b.go(`${BASE}/characters/${id}`);
            await until(() => versions(id), (n) => n === 1);
            await type(b, 'race', 'Wood Elf'); await sleep(400); await flush(b);
            await until(() => versions(id), (n) => n === 2);
            await type(b, 'name', 'Vera II'); await sleep(400); await flush(b);
            await until(() => versions(id), (n) => n === 3);
            await click(b, '[data-act=roll]'); await sleep(1500); await flush(b);
            await until(() => (file(id, 'character.json')?.rolls || []).length, (n) => n === 1);
            is(`${name} a roll syncs but makes no version`, [(file(id, 'character.json').rolls || []).length, versions(id)], [1, 3]);

            is(`${name} versions listed newest first`, (await openVersions(b)).map((r) => r.replace(/^.*?(ago|now)\s*/, '')), ['1 change', '1 change', 'First saved version']);
            is(`${name} newest is current, full date on hover`, await b.ev(`[!!document.querySelector('#hb-ver .hb-vrow .badge'), /^\\d{1,2} \\w{3} \\d{4}, \\d{1,2}:\\d{2} (am|pm)$/.test(document.querySelector('#hb-ver time').title)].join()`), 'true,true');
            await click(b, '#hb-ver .hb-vrow .hb-vsum');
            is(`${name} a row lists its changes in words`, await b.ev(`document.querySelector('#hb-ver .hb-vchanges').textContent.trim()`), 'Name Vera → Vera II');

            // name the first version, then find it with Named only
            const first = await b.ev(`[...document.querySelectorAll('#hb-ver [data-act=vname]')].pop().dataset.n`);
            await b.ev(`[...document.querySelectorAll('#hb-ver [data-act=vname]')].pop().click()`);
            await b.ev(`(() => { const f = document.querySelector('#hb-ver .hb-vform'); f.elements.name.value = 'Before the trip'; f.requestSubmit(); })()`);
            await until(() => file(id, 'history', 'names.json'), Boolean);
            is(`${name} name kept beside the history`, file(id, 'history', 'names.json'), { [first]: 'Before the trip' });
            await click(b, '#hb-ver [data-act=vnamed]');
            is(`${name} Named only`, (await rows(b)).map((r) => r.includes('Before the trip')), [true]);
            is(`${name} named version in bold`, await b.ev(`document.querySelector('#hb-ver .hb-vname').tagName`), 'B');

            // restore it, then Undo: the character is exactly as before (apart from "updated")
            const beforeRestore = await local(b, id);
            await click(b, '#hb-ver [data-act=vrestore]');
            await until(() => local(b, id), (c) => c.name === 'Vera');
            const restored = await local(b, id);
            is(`${name} restored`, [restored.name, restored.race, restored.rolls.length], ['Vera', 'Elf', 1]);
            is(`${name} restore adds a version`, versions(id), 4);
            is(`${name} the restored version says so`, (await until(() => rows(b), (r) => r.length === 1 && /Restored from/.test(r[0]))).length, 1);
            await click(b, '#hb-ver [data-act=vnamed]');
            is(`${name} restored row`, (await until(() => rows(b), (r) => r.length >= 4))[0].includes('Restored from'), true);
            await click(b, '#hb-ver [data-act=vclose]');
            is(`${name} 15-second Undo shows`, await b.ev(`[...document.querySelectorAll('.hb-undo')].some((u) => !u.hidden && /Restored the version/.test(u.textContent))`), true);
            await click(b, '[data-act=roll]'); await sleep(1500);
            is(`${name} a roll keeps the Undo`, await b.ev(`[...document.querySelectorAll('.hb-undo')].some((u) => /Restored the version/.test(u.textContent))`), true);
            await b.ev(`[...document.querySelectorAll('.hb-undo')].find((u) => /Restored the version/.test(u.textContent)).querySelector('button').click()`);
            const undone = await until(() => local(b, id), (c) => c.name === 'Vera II');
            is(`${name} undo the restore: deep-equal to before`, core(undone), core(beforeRestore));
            await until(() => file(id, 'character.json'), (c) => c && c.name === 'Vera II');
            is(`${name} account has it too, versions only added`, [core(file(id, 'character.json')), versions(id)], [core(beforeRestore), 5]);
            errs(b, name, 'versions');

            // ---- notes archive instead of delete ----
            await b.ev(`document.querySelector('.hb-tabs button:last-child')?.click()`);
            await b.ev(`[...document.querySelectorAll('.hb-tabs button')].find((x) => x.textContent === 'Notes').click()`);
            await b.ev(`document.querySelector('.hb-nitem').click()`);
            const noteTitle = await b.ev(`document.querySelector('.hb-ntitle-in').value`);
            is(`${name} notes say Archive, not Delete`, await b.ev(`[!!document.querySelector('[data-act=narc]'), !document.querySelector('[data-act=ndel]')].join()`), 'true,true');
            const notesBefore = (await local(b, id)).panels.find((p) => p.type === 'notes').notes.length;
            await click(b, '[data-act=narc]');
            const notes = (await local(b, id)).panels.find((p) => p.type === 'notes').notes;
            is(`${name} archived note kept`, [notes.length, notes.filter((n) => n.archived).map((n) => n.title)], [notesBefore, [noteTitle]]);
            is(`${name} Archived (1) folded, note out of the list`, await b.ev(`[document.querySelector('.hb-narch summary').textContent, document.querySelector('.hb-narch').open, [...document.querySelectorAll('.hb-nitem:not(.hb-narc)')].some((x) => x.textContent.includes(${JSON.stringify(noteTitle)}))].join()`), 'Archived (1),false,false');
            await b.ev(`(() => { const q = document.querySelector('.hb-nq'); q.value = ${JSON.stringify(noteTitle.toLowerCase())}; q.dispatchEvent(new Event('input', { bubbles: true })); })()`);
            is(`${name} search finds the archived note`, await b.ev(`(() => { const x = document.querySelector('.hb-narc'); return !x.hidden && /Archived/.test(x.textContent) && !!x.querySelector('[data-act=nunarc]'); })()`), true);
            await click(b, '.hb-narc [data-act=nunarc]');
            is(`${name} note restored`, (await local(b, id)).panels.find((p) => p.type === 'notes').notes.filter((n) => n.archived).length, 0);
            await b.ev(`(() => { const q = document.querySelector('.hb-nq'); q.value = ''; q.dispatchEvent(new Event('input', { bubbles: true })); })()`);

            // ---- archive: only "archived" changes; read-only; leaves its campaign ----
            await flush(b);
            await until(() => file(id, 'character.json'), (c) => c && !c.panels.find((p) => p.type === 'notes').notes.some((n) => n.archived));
            mkdirSync(join(ACCOUNTS, 'campaigns', 'abcdef123456'), { recursive: true });
            writeFileSync(join(ACCOUNTS, 'campaigns', 'abcdef123456', 'campaign.json'), JSON.stringify({ id: 'abcdef123456', name: 'C', dm: '222', code: 'abcdef1234', created: 1, members: [{ sub: '222', name: 'D', joined: 1, characters: [] }, { sub: '111', name: 'Me', joined: 1, characters: [{ sheet: 'player', id }] }] }));
            beforeArc = await local(b, id);
            await click(b, '[data-act=manage]'); await click(b, '[data-act=archive]');
            const arc = await local(b, id);
            is(`${name} archive changes only "archived"`, [arc.archived > 0, core({ ...arc, archived: 0 })], [true, core(beforeArc)]);
            is(`${name} archived is read-only`, await b.ev(`[!!document.querySelector('.hb-arcnote'), document.querySelector('.hb-arcnote').textContent, [...document.querySelectorAll('#hb-sheet input')].every((i) => i.disabled)].join()`), 'true,This character is archived.,true');
            await until(() => file(id, 'meta.json'), (m) => m && m.archived > 0);
            is(`${name} archive reaches the account, folder stays`, [file(id, 'character.json').archived > 0, existsSync(join(ACCOUNTS, 'characters', '.deleted'))], [true, false]);
            const camp = () => JSON.parse(readFileSync(join(ACCOUNTS, 'campaigns', 'abcdef123456', 'campaign.json'), 'utf8')).members[1].characters;
            is(`${name} archived leaves the campaign`, await until(camp, (l) => !l.length), []);
            await click(b, '[data-act=versions]');
            is(`${name} archived: versions readable, no Restore or Name`, await until(() => b.ev(`[document.querySelectorAll('#hb-ver .hb-vrow').length > 0, !document.querySelector('#hb-ver [data-act=vrestore], #hb-ver [data-act=vname]')].join()`), (v) => v === 'true,true'), 'true,true');
            await click(b, '#hb-ver [data-act=vclose]');
            await b.ev(`fetch('/sheets/player/cloud.php?id=${id}&visibility=public', { method: 'POST', headers: { 'Content-Type': 'application/json' } })`);
            await sleep(500);
            errs(b, name, 'archive');
        } finally { b.close(); }

        // a public archived character shows "Archived" to someone else (one browser at a time: they share a debug port)
        b = await open(name);
        try {
            await start(b, SID.other);
            await b.go(`${BASE}/characters/${id}`); await sleep(1500);
            is(`${name} public archived shows Archived to others`, await b.ev(`[document.querySelector('.hb-roname')?.textContent, document.querySelector('#hb-barin .badge')?.textContent].join()`), 'Vera II,Archived');
        } finally { b.close(); }

        // ---- a second browser of mine: archived under Archived; unarchive; the same versions; restore one made on the first ----
        b = await open(name);
        try {
            await start(b, SID.me);
            await b.go(`${BASE}/characters/`);
            await until(() => b.ev(`document.querySelectorAll('#ch-arc-grid .ch-card').length`), (n) => n === 1);
            is(`${name} second browser: under Archived`, await b.ev(`[document.querySelector('#ch-arc').hidden, document.querySelectorAll('#ch-grid .ch-card').length].join()`), 'false,0');
            await b.go(`${BASE}/characters/${id}`); await sleep(1000);
            const pulled = await local(b, id);
            await click(b, '[data-act=unarchive]');
            const un = await local(b, id);
            is(`${name} unarchive: back as it was`, core(un), core({ ...pulled, archived: 0 }));
            is(`${name} archive then unarchive: as before archiving`, core(un), core(beforeArc));
            await until(() => file(id, 'meta.json'), (m) => m && !m.archived);
            is(`${name} unarchive reaches the account`, file(id, 'character.json').archived, 0);
            const list = await openVersions(b);
            is(`${name} second browser lists the versions`, list.length >= 5, true);
            const target = await b.ev(`[...document.querySelectorAll('#hb-ver .hb-vrow')].find((r) => /First saved/.test(r.textContent)).querySelector('[data-act=vrestore]').dataset.n`);
            await click(b, `#hb-ver [data-act=vrestore][data-n="${target}"]`);
            await until(() => local(b, id), (c) => c.name === 'Vera');
            is(`${name} second browser restores`, [(await local(b, id)).race, file(id, 'character.json')?.name], ['Elf', 'Vera']);
            // the old DELETE (a tab with the old code) archives instead
            await b.ev(`fetch('/sheets/player/cloud.php?id=${id}', { method: 'DELETE' })`);
            await until(() => file(id, 'meta.json'), (m) => m && m.archived > 0);
            is(`${name} DELETE archives, nothing moves`, [file(id, 'character.json').archived > 0, existsSync(join(ACCOUNTS, 'characters', id, 'character.json'))], [true, true]);
            errs(b, name, 'second browser');
        } finally { b.close(); }

        // ---- signed out ----
        b = await open(name);
        try {
            const sid = 'signedout' + name;
            await start(b, 'none', { cur: sid, chars: { [sid]: { ...ch, id: sid } } });
            await b.ev(`document.cookie = 'dndsid=; path=/; max-age=0'`);
            await b.go(`${BASE}/characters/${sid}`); await sleep(1000);
            await click(b, '[data-act=manage]'); await click(b, '[data-act=versions]');
            is(`${name} signed out: Versions asks to sign in`, await b.ev(`document.querySelector('#hb-ver').open && document.querySelector('#hb-ver p').textContent`), 'Sign in to keep every version of your characters.');
            await click(b, '#hb-ver [data-act=vclose]');
            await click(b, '[data-act=manage]'); await click(b, '[data-act=archive]');
            const before = await local(b, sid);
            is(`${name} signed out: archived in the browser`, before.archived > 0, true);
            await b.go(`${BASE}/characters/`); await sleep(500);
            is(`${name} signed out: under Archived`, await b.ev(`[document.querySelector('#ch-arc').hidden, document.querySelectorAll('#ch-arc-grid .ch-card').length, document.querySelectorAll('#ch-grid .ch-card').length].join()`), 'false,1,0');
            await click(b, '[data-act=unarc]');
            is(`${name} signed out: unarchived, unchanged`, core(await local(b, sid)), core({ ...before, archived: 0 }));
            errs(b, name, 'signed out');

            // ---- the Monster Sheet: archive a monster and a note ----
            await b.go(`${BASE}/sheets/monster/`); await sleep(1200);
            await type(b, 'name', 'Goblin'); await sleep(400);
            await click(b, '[data-act=manage]'); await click(b, '[data-act=new]'); await sleep(300);
            await type(b, 'name', 'Orc'); await sleep(400);
            const mons = () => b.ev(`JSON.stringify(Object.values(JSON.parse(localStorage.getItem('monster-sheet')).chars).map((c) => [c.name, !!c.archived]))`).then(JSON.parse);
            is(`${name} monster sheet says Archive`, await b.ev(`[!!document.querySelector('[data-act=archive]'), !document.querySelector('[data-act=delete]')].join()`), 'true,true');
            await click(b, '[data-act=manage]'); await click(b, '[data-act=archive]');
            is(`${name} monster archived, kept`, (await mons()).sort(), [['Goblin', false], ['Orc', true]]);
            is(`${name} monster archived: read-only, Archived (1) in the list`, await b.ev(`[!!document.querySelector('[data-act=unarchive]'), [...document.querySelectorAll('#hb-sheet input')].every((i) => i.disabled), document.querySelector('.mon-arch summary').textContent, document.querySelector('#mon-side h2 .n').textContent].join()`), 'true,true,Archived (1),1');
            await click(b, '[data-act=monunarc]');
            is(`${name} monster unarchived`, (await mons()).sort(), [['Goblin', false], ['Orc', false]]);
            await b.ev(`[...document.querySelectorAll('.hb-tabs button')].find((x) => x.textContent === 'Notes').click()`);
            await b.ev(`document.querySelector('.hb-nitem').click()`);
            await click(b, '[data-act=narc]');
            is(`${name} monster note archived, kept`, await b.ev(`(() => { const c = Object.values(JSON.parse(localStorage.getItem('monster-sheet')).chars).find((c) => c.name === 'Orc'); return c.panels.find((p) => p.type === 'notes').notes.map((n) => !!n.archived).join(); })()`), 'true');
            is(`${name} monster note under Archived`, await b.ev(`document.querySelector('.hb-narch summary').textContent`), 'Archived (1)');
            errs(b, name, 'monster sheet');
        } finally { b.close(); }
    }
} finally { web.kill(); rmSync(TMP, { recursive: true, force: true }); }
console.log(bad ? `${bad} check(s) failed` : 'versions and archive ok');
process.exit(bad ? 1 : 0);
