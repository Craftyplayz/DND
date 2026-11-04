// Checks homebrew monsters (ROADMAP 5.2 stage 3) in headless Chrome and Firefox: "Save as homebrew" keeps the stat block without notes or play state and
// updates or makes a new entry; the Compendium shows it, and New and Edit lead to the Monster Sheet; a member adds it through the search and "Add to encounter",
// with a CR difficulty.js reads; Update on a monster and on a row (the changes, play state and notes kept, the hand-edit warning, Undo); another device.
// And "DM only": a player's JSON, Compendium, links, Monster Sheet search and offline copy never get that entry; the DM, a co-DM and the owner do.
//   node _dev/scripts/homebrew-monsters.mjs        (needs includes/config.php for sign-in)
// Starts its own server (port 8139 + CHECK_PORT_SHIFT) with stand-in folders in the temp folder, so it never touches private/dnd.
import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { launch, browsers, serving } from './browser.mjs';

const ROOT = join(import.meta.dirname, '../..'), PORT = 8139 + (+process.env.CHECK_PORT_SHIFT || 0), BASE = `http://localhost:${PORT}`;
const PHP = process.env.PHP || (process.platform === 'win32' ? 'C:/php/php.exe' : 'php');
const TMP = join(tmpdir(), 'dnd-hbmonsters-check' + (process.env.CHECK_PORT_SHIFT || '')), ACCOUNTS = join(TMP, 'accounts'), SESSIONS = join(TMP, 'sessions');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ser = (o) => `a:${Object.keys(o).length}:{` + Object.entries(o).map(([k, v]) => `s:${Buffer.byteLength(k)}:"${k}";s:${Buffer.byteLength(v)}:"${v}";`).join('') + '}';
const DM = 'hbmonstersdm000000000000000000000000', PLAYER = 'hbmonstersplayer00000000000000000000', CODM = 'hbmonsterscodm0000000000000000000000', CAMP = 'abcabcabcabe';

let bad = 0;
const is = (name, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) { bad++; console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); } };
const until = async (fn, ok = Boolean, ms = 12000) => { const t = Date.now(); let v; while (Date.now() - t < ms) { v = await fn(); if (ok(v)) return v; await sleep(150); } return v; };
const web = spawn(PHP, ['-S', `127.0.0.1:${PORT}`, '-t', ROOT, join(ROOT, '_dev/router.php')], { stdio: 'ignore', env: { ...process.env, DND_ACCOUNTS: ACCOUNTS, DND_SESSIONS: SESSIONS, DND_BACKUPS: join(TMP, 'backups'), DND_MONSTER_BACKUPS: join(TMP, 'monster-backups') } });
await serving(BASE + '/privacy/');

const J = JSON.stringify;
const click = (b, sel) => b.ev(`(() => { const e = document.querySelector(${J(sel)}); if (e) e.click(); return !!e; })()`);
const visible = (b, sel) => b.ev(`(() => { const e = document.querySelector(${J(sel)}); return !!e && !e.hidden && e.getClientRects().length > 0; })()`);
const body = (b) => b.ev(`document.querySelector('#cp-dbody').textContent`);
const signIn = async (b, cookie, path, keep) => {
    await b.block(/backup\.php/);
    await b.go(BASE + '/privacy/');
    await b.ev(`${keep ? '' : 'localStorage.clear();'} ${cookie ? `document.cookie = 'dndsid=${cookie}; path=/'` : ''}`);
    await b.go(BASE + path);
};
const search = (b, n) => b.ev(`(() => { const q = document.querySelector('#cp-q'); q.value = ${J(n)}; q.dispatchEvent(new Event('input', { bubbles: true })); })()`);
const hasRow = (b, n) => b.ev(`[...document.querySelectorAll('#cp-list .cp-row')].some((r) => r.querySelector('.cp-name').textContent === ${J(n)})`);
const openRow = async (b, n) => {
    await search(b, n);
    await until(() => b.ev(`(() => { const r = [...document.querySelectorAll('#cp-list .cp-row')].find((x) => x.querySelector('.cp-name').textContent === ${J(n)}); if (r) r.click(); return !!r; })()`));
    await until(() => b.ev(`document.querySelector('#cp-dbody h2')?.textContent === ${J(n)}`));
};
const errs = (b, name, where) => { const e = b.errors.filter((x) => !/backup\.php/.test(x)); if (e.length) { bad++; console.log(`FAIL ${name} ${where}: ${e.join(' | ').slice(0, 600)}`); } };
const entries = (sub) => { try { return readdirSync(join(ACCOUNTS, 'homebrew', sub)).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(ACCOUNTS, 'homebrew', sub, f), 'utf8'))); } catch { return []; } };
const shares = () => { try { return JSON.parse(readFileSync(join(ACCOUNTS, 'campaigns', CAMP, 'homebrew.json'), 'utf8')); } catch { return []; } };
const db = (b) => b.ev(`localStorage.getItem('monster-sheet')`).then(JSON.parse);
const cur = async (b) => { const d = await db(b); return d.chars[d.cur]; };
const named = async (b, n) => Object.values((await db(b)).chars).find((c) => c.name === n);
// changes the open monster while no sheet is open, then opens the sheet again
const edit = async (b, fn) => {
    await b.go(BASE + '/privacy/');
    await b.ev(`(() => { const db = JSON.parse(localStorage.getItem('monster-sheet')), c = db.chars[db.cur]; (${fn})(c); c.updated = Date.now(); localStorage.setItem('monster-sheet', JSON.stringify(db)); })()`);
    await b.go(BASE + '/sheets/monster/');
    await until(() => b.ev(`!!document.querySelector('[data-act=manage]')`));
};
const dlgText = (b) => b.ev(`document.querySelector('dialog[open]')?.textContent || ''`);
const saveDialog = async (b) => { await click(b, '[data-act=hbsave]'); await until(() => b.ev(`!!document.querySelector('#hbm-name')`)); };
// what a request for a player's homebrew really gets, whatever the page does with it
// (again if the page reloads under it: settings sync reloads a page once when it pulls something new)
const answer = (b) => until(() => b.ev(`fetch('/compendium/homebrew.php').then((r) => r.text()).catch(() => '')`).catch(() => ''));

try {
    for (const name of browsers) {
        rmSync(TMP, { recursive: true, force: true });
        mkdirSync(SESSIONS, { recursive: true });
        for (const [s, sub, n] of [[DM, '111', 'Dee'], [PLAYER, '222', 'Pat'], [CODM, '333', 'Cody']]) writeFileSync(join(SESSIONS, 'sess_' + s), 'user|' + ser({ sub, email: n + '@example.com', name: n }));
        mkdirSync(join(ACCOUNTS, 'campaigns', CAMP), { recursive: true });
        writeFileSync(join(ACCOUNTS, 'campaigns', CAMP, 'campaign.json'), J({ id: CAMP, name: 'Stonehold', dm: '111', code: 'aaaaaaaaaa', codms: ['333'], members: [{ sub: '111', name: 'Dee', joined: 1, characters: [] }, { sub: '222', name: 'Pat', joined: 1, characters: [] }, { sub: '333', name: 'Cody', joined: 1, characters: [] }] }));
        let id;

        // ---- Dee: New monster in the Compendium leads to the Monster Sheet, then Save as homebrew ----
        const dee = await launch(name);
        try {
            await signIn(dee, DM, '/compendium/?tab=monster');
            await until(() => visible(dee, '#cp-new'));
            is(`${name} the button`, await dee.ev(`document.querySelector('#cp-new').textContent`), 'New monster');
            await click(dee, '#cp-new');
            is(`${name} it opens a new monster on the sheet`, await until(() => dee.ev(`location.pathname === '/sheets/monster/' && !!document.querySelector('[data-act=manage]') && JSON.parse(localStorage.getItem('monster-sheet') || '{"chars":{}}').chars[JSON.parse(localStorage.getItem('monster-sheet') || '{}').cur]?.name === 'New monster'`)), true);
            await edit(dee, `(c) => { Object.assign(c, { name: 'Bog Hag 2', race: 'Medium fey', cr: '1/4', ac: '13 [hide]', conditions: ['Prone'], exhaustion: 2, insp: true, res: 'Cold', senses: 'darkvision 60 ft' });
                c.view.all = true; c.hp = { cur: 5, base: 20, temp: 3, mod: 0 }; c.rolls = [{ id: 'r1', title: 'Claw', total: 9 }];
                c.panels.find((p) => p.type === 'attacks').rows.push({ id: 'a1', name: 'Claw', time: 'Action', mode: 'hit', hit: '5', dmg: [{ dice: '1d6', type: 'Slashing' }], uses: '3', used: 2, props: [], fx: [] });
                c.panels.find((p) => p.type === 'list').rows.push({ id: 't1', name: 'Bog Stride', src: 'Trait', text: 'Ignores mud.', grp: 'other' });
                c.panels.find((p) => p.type === 'trackers').rows.push({ id: 'k1', name: 'Hexes', kind: 'count', cur: 1, max: '3', reset: 'long', levels: [] });
                const n = c.panels.find((p) => p.type === 'notes'); n.notes = [{ id: 'n1', title: 'Tactics', group: 'Monster', body: 'Secret plan', pinned: false, archived: 0 }, { id: 'n2', title: 'Source', group: 'Monster', body: 'Some Book (OGL).', pinned: false, archived: 0 }]; }`);
            await click(dee, '[data-act=manage]');
            await saveDialog(dee);
            is(`${name} the dialog is filled from the sheet, without the number`, await dee.ev(`JSON.stringify(['name', 'size', 'type', 'cr'].map((k) => document.querySelector('#hbm-' + k).value))`).then(JSON.parse), ['Bog Hag', 'Medium', 'fey', '0.25']);
            is(`${name} first time, one way to save`, await dee.ev(`document.querySelectorAll('dialog[open] [data-act=hbsavego]').length`), 1);
            await dee.ev(`document.querySelector('#hbm-name').value = ''`);
            await click(dee, '[data-act=hbsavego]');
            is(`${name} a name is required`, await dee.ev(`document.querySelector('#hbm-name').getAttribute('aria-invalid')`), 'true');
            await dee.ev(`document.querySelector('#hbm-name').value = 'Bog Hag'`);
            await click(dee, '[data-act=hbsavego]');
            const e = await until(() => entries('111').find((x) => x.name === 'Bog Hag'));
            id = e.id;
            const text = J(e);
            is(`${name} kept as an entry`, [e.kind, e.size, e.type, e.cr, e.credit, e.block.ac, e.block.hp, e.block.res], ['monster', 'Medium', 'fey', 0.25, 'Some Book (OGL).', '13 (hide)', '20', 'Cold']);
            const claw = e.sheet.panels.find((p) => p.type === 'attacks').rows[0], hex = e.sheet.panels.find((p) => p.type === 'trackers').rows[0];
            is(`${name} play state left out`, [e.sheet.hp, e.sheet.conditions, e.sheet.rolls, e.sheet.exhaustion, e.sheet.insp, claw.used, hex.cur], [{ cur: 20, base: 20, temp: 0, mod: 0 }, [], [], 0, false, 0, 3]);
            is(`${name} notes left out, wherever you look`, [text.includes('Secret plan'), e.sheet.panels.find((p) => p.type === 'notes').notes], [false, []]);
            const mine = await cur(dee);
            is(`${name} the monster is linked to it, and untouched`, [mine.hbsrc?.id, mine.hbsrc?.by, mine.hp.cur, mine.conditions, mine.panels.find((p) => p.type === 'notes').notes.length], [id, '', 5, ['Prone'], 2]);

            // the Compendium's stat block, and sharing with everyone
            await dee.go(BASE + '/compendium/?tab=monster');
            await until(() => visible(dee, '#cp-new'));
            await openRow(dee, 'Bog Hag');
            const t = await body(dee);
            is(`${name} the stat block reads`, ['13 (hide)', 'Ignores mud.', 'Claw', '+5 to hit', 'Some Book (OGL).', '1/4'].map((x) => t.includes(x)), [true, true, true, true, true, true]);
            is(`${name} and has no secret`, t.includes('Secret plan'), false);
            await until(() => visible(dee, '[data-hb-share]'));
            is(`${name} DM only waits until it's shared`, await dee.ev(`document.querySelector('[data-hb-dmonly]').disabled`), true);
            await click(dee, '[data-hb-share]');
            is(`${name} shared with everyone`, (await until(shares, (s) => s.length === 1))[0].dmonly, undefined);
            // a homebrew spell to go on Pat's monster's row
            await dee.ev(`Homebrew.save({ id: 'hspellrow1', kind: 'spell', name: 'Mire Bolt', level: 1, text: 'Bolts one.', school: 'Evocation', time: 'Action', mode: 'none', dmg: [] }).then(() => fetch('/compendium/homebrew.php?act=share', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 'hspellrow1', c: ${J(CAMP)}, on: true }) })).then((r) => r.status)`);
            await until(shares, (s) => s.length === 2);
            errs(dee, name, 'Dee');
        } finally { dee.close(); }

        // ---- Pat: the search, Add to encounter, CR for the difficulty sums ----
        const pat = await launch(name);
        try {
            await signIn(pat, PLAYER, '/sheets/monster/');
            await until(() => pat.ev(`!!document.querySelector('[data-act=manage]')`));
            await click(pat, '[data-act=manage]');
            await click(pat, '[data-act=find]');
            await until(() => pat.ev(`!!document.querySelector('#mon-dlg').open`));
            await pat.ev(`(() => { const q = document.querySelector('#mon-q'); q.value = 'bog h'; q.dispatchEvent(new Event('input', { bubbles: true })); })()`);
            const hit = `[...document.querySelectorAll('.mon-hit')].find((b) => b.textContent.includes('Bog Hag'))`;
            is(`${name} the search lists it, marked`, await until(() => pat.ev(`${hit}?.textContent.includes('Homebrew') === true`)), true);
            await pat.ev(`(() => { const s = document.querySelector('#mon-rules'); s.value = '2024'; s.dispatchEvent(new Event('input', { bubbles: true })); })()`);
            await sleep(300);
            is(`${name} whichever rules are picked`, await pat.ev(`!!${hit}`), true);
            await pat.ev(`(() => { const s = document.querySelector('#mon-crlo'); s.value = '1'; s.dispatchEvent(new Event('input', { bubbles: true })); })()`);
            await sleep(300);
            is(`${name} the CR filter reads it (1/4 is under 1)`, await pat.ev(`!!${hit}`), false);
            await pat.ev(`(() => { const s = document.querySelector('#mon-crlo'); s.value = ''; s.dispatchEvent(new Event('input', { bubbles: true })); })()`);
            await until(() => pat.ev(`!!${hit}`));
            await pat.ev(`${hit}.click()`);
            await until(() => named(pat, 'Bog Hag'));
            let c = await named(pat, 'Bog Hag');
            is(`${name} added: its own copy with its source`, [c.hp.cur, c.hp.base, c.ac, c.cr, c.hbsrc.id, c.hbsrc.by, c.enc, c.panels.find((p) => p.type === 'attacks').rows[0].name], [20, 20, '13 [hide]', '1/4', id, 'Dee', '', 'Claw']);
            is(`${name} the credit comes with it, the notes don't`, c.panels.find((p) => p.type === 'notes').notes.map((n) => n.title), ['Source']);
            is(`${name} difficulty.js reads its CR`, await pat.ev(`EncDiff.crXp(${J(c.cr)})`), 50);
            is(`${name} no update to offer yet`, await visible(pat, '[data-act=hbmon]'), false);

            await pat.go(BASE + '/compendium/?tab=monster');
            await until(() => visible(pat, '#cp-new'));
            await openRow(pat, 'Bog Hag');
            is(`${name} a member can't edit it`, await pat.ev(`!!document.querySelector('[data-hb-edit],[data-hb-archive],[data-hb-share],[data-hb-dmonly]')`), false);
            await until(() => visible(pat, '[data-add]'));
            await click(pat, '[data-qty="1"]');
            await click(pat, '[data-add]');
            await until(() => pat.ev(`(JSON.parse(localStorage.getItem('mon-pending')) || []).length === 1`));
            await pat.go(BASE + '/sheets/monster/');
            is(`${name} Add to encounter adds two, numbered`, await until(async () => Object.values((await db(pat)).chars).filter((x) => /^Bog Hag \d$/.test(x.name)).map((x) => x.name).sort().join(), (x) => x === 'Bog Hag 1,Bog Hag 2,Bog Hag 3'), 'Bog Hag 1,Bog Hag 2,Bog Hag 3');
            is(`${name} and the request is done`, await pat.ev(`(JSON.parse(localStorage.getItem('mon-pending')) || []).length`), 0);

            // Add monsters (the encounter builder's search) reaches it too, stays open and adds the number asked for
            await until(() => pat.ev(`!!document.querySelector('[data-act=diffadd]')`));
            await click(pat, '[data-act=diffadd]');
            await until(() => pat.ev(`document.querySelector('#mon-dlg').open && document.querySelectorAll('.mon-hit').length > 0`));
            is(`${name} Add monsters lists it first`, await pat.ev(`document.querySelector('.mon-hit').textContent.includes('Bog Hag')`), true);
            await pat.ev(`document.querySelector('#mon-n').value = 1`);
            await click(pat, '.mon-hit');
            is(`${name} Add monsters adds it`, await until(async () => !!(await named(pat, 'Bog Hag 4'))), true);
            await click(pat, '[data-mon-close]');

            // play state and a note on the open monster, a homebrew spell on its row
            await edit(pat, `(c) => { c.view.all = true; c.hp.cur = 3; c.conditions = ['Prone']; c.panels.find((p) => p.type === 'attacks').rows[0].used = 1; c.panels.find((p) => p.type === 'notes').notes.push({ id: 'pn', title: 'Mine', group: '', body: 'My note', pinned: false, archived: 0 }); c.panels.find((p) => p.type === 'spells').rows.push({ id: 'sp1', name: 'Odd' }); }`);
            await until(() => pat.ev(`!!document.querySelector('.hb-toggle[aria-label="Edit Odd"]')`));
            await click(pat, '.hb-toggle[aria-label="Edit Odd"]');
            await pat.ev(`document.querySelector('input[list="hb-dl-srd"]').dispatchEvent(new FocusEvent('focusin', { bubbles: true }))`);
            await until(() => pat.ev(`!!document.querySelector('#hb-dl-srd option[value="Mire Bolt (homebrew)"]')`));
            await pat.ev(`(() => { const i = document.querySelector('input[list="hb-dl-srd"]'); i.value = 'Mire Bolt (homebrew)'; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); })()`);
            await until(() => cur(pat).then((x) => x.panels.find((p) => p.type === 'spells').rows[0].name === 'Mire Bolt'));
            const inAccount = () => { try { return readdirSync(join(ACCOUNTS, 'monsters', '222')).filter((f) => f.endsWith('.json')).map((f) => readFileSync(join(ACCOUNTS, 'monsters', '222', f), 'utf8')); } catch { return []; } };
            is(`${name} they reach the account`, (await until(inAccount, (l) => l.filter((t) => t.includes(id)).length === 4 && l.some((t) => t.includes('Mire Bolt') && t.includes('My note')), 20000)).filter((t) => t.includes(id)).length, 4);
            errs(pat, name, 'Pat adds');
        } finally { pat.close(); }

        // ---- Dee: Edit in the Compendium goes back to her monster; Update, then Save as a new one ----
        const dee2 = await launch(name);
        try {
            await signIn(dee2, DM, '/sheets/monster/');
            await until(() => dee2.ev(`!!document.querySelector('[data-act=manage]')`));
            await dee2.go(`${BASE}/compendium/?t=monster&i=hb:${id}`);
            await until(() => visible(dee2, '[data-hb-edit]'));
            is(`${name} a new browser still has it, still shared`, await until(() => dee2.ev(`document.querySelector('[data-hb-share]')?.checked === true`)), true);
            await click(dee2, '[data-hb-edit]');
            const open = await until(() => dee2.ev(`location.pathname === '/sheets/monster/' && !location.search && !!JSON.parse(localStorage.getItem('monster-sheet') || '{}').cur`));
            is(`${name} Edit leads to the Monster Sheet`, open, true);
            await until(async () => (await cur(dee2))?.hbsrc?.id === id);
            await edit(dee2, `(c) => { c.ac = '15 [plate]'; c.panels.find((p) => p.type === 'list').rows[0].text = 'Ignores all mud.'; }`);
            await click(dee2, '[data-act=manage]');
            await saveDialog(dee2);
            is(`${name} saved before: update or a new one`, await dee2.ev(`[...document.querySelectorAll('dialog[open] [data-act=hbsavego]')].map((b) => b.textContent).join('|')`), 'Update Bog Hag|Save as a new one');
            await click(dee2, 'dialog[open] [data-act=hbsavego]');
            is(`${name} Update changes the same entry`, (await until(() => entries('111').find((x) => x.id === id), (x) => x?.block.ac === '15 (plate)'))?.block.ac, '15 (plate)');
            is(`${name} the old version is kept`, readdirSync(join(ACCOUNTS, 'homebrew', '111', 'history', id)).length >= 1, true);
            await until(() => dee2.ev(`!document.querySelector('dialog[open]')`));
            await click(dee2, '[data-act=manage]');
            await saveDialog(dee2);
            await dee2.ev(`document.querySelector('#hbm-name').value = 'Bog Queen'`);
            await click(dee2, 'dialog[open] [data-act=hbsavego][data-new="1"]');
            is(`${name} Save as a new one makes another`, (await until(() => entries('111').find((x) => x.name === 'Bog Queen')))?.id !== id, true);
            await until(() => dee2.ev(`!document.querySelector('dialog[open]')`));
            is(`${name} the first entry keeps its name`, entries('111').find((x) => x.id === id).name, 'Bog Hag');
            await dee2.ev(`Homebrew.save({ ...Homebrew.mine().find((x) => x.id === 'hspellrow1'), text: 'Bolts two.' }).then(() => 1)`);
            await until(() => entries('111').find((x) => x.id === 'hspellrow1'), (x) => x?.text === 'Bolts two.');
            errs(dee2, name, 'Dee updates');
        } finally { dee2.close(); }

        // ---- Pat: Update on the monster and on its row. A new browser: the monster comes back from the account with its source ----
        const pat2 = await launch(name);
        try {
            await signIn(pat2, PLAYER, '/sheets/monster/');
            is(`${name} another device: the copy comes back with its source`, await until(() => db(pat2).then((d) => Object.values(d?.chars || {}).filter((c) => c.hbsrc?.id === id).length), (n) => n === 4), 4);
            await pat2.go(BASE + '/privacy/');
            await pat2.ev(`(() => { const d = JSON.parse(localStorage.getItem('monster-sheet')); d.cur = Object.values(d.chars).find((c) => c.conditions.includes('Prone')).id; localStorage.setItem('monster-sheet', JSON.stringify(d)); })()`);
            await pat2.go(BASE + '/sheets/monster/');
            is(`${name} a newer version shows`, await until(() => visible(pat2, '[data-act=hbmon]')), true);
            let c = await cur(pat2);
            is(`${name} and the copy is unchanged`, [c.ac, c.hp.cur], ['13 [hide]', 3]);

            // a row with its own source updates on its own
            is(`${name} a row shows its own update`, await until(() => pat2.ev(`[...document.querySelectorAll('.hb-entry-h')].some((h) => h.textContent.includes('Mire Bolt') && h.textContent.includes('Update available'))`)), true);
            await pat2.ev(`[...document.querySelectorAll('.hb-link')].find((b) => b.textContent === 'Mire Bolt').click()`);
            await until(() => pat2.ev(`!!document.querySelector('.hb-hbsrc [data-act=hbup]')`));
            is(`${name} the row says where it's from`, await pat2.ev(`document.querySelector('.hb-hbsrc').textContent.includes("From Dee's homebrew.")`), true);
            await click(pat2, '[data-act=hbup]');
            let t = await until(() => dlgText(pat2), (x) => x.includes('After the update'));
            is(`${name} the row's dialog lists it`, t.includes('Bolts two.'), true);
            await click(pat2, '[data-act=hbupgo]');
            c = await until(() => cur(pat2), (x) => x.panels.find((p) => p.type === 'spells').rows[0].desc === 'Bolts two.');
            is(`${name} the row is updated`, c.panels.find((p) => p.type === 'spells').rows[0].desc, 'Bolts two.');
            await until(() => pat2.ev(`!document.querySelector('dialog[open]')`));

            // this copy has a spell Pat added by hand, so the monster's own update warns about it
            await click(pat2, '[data-act=hbmon]');
            t = await until(() => dlgText(pat2), (x) => x.includes('After the update'));
            is(`${name} the dialog lists the changes, with a hand-edit warning`, [t.includes('13 [hide]'), t.includes('15 [plate]'), t.includes('replaces your changes')], [true, true, true]);
            const before = c.name;
            await click(pat2, '[data-act=hbmongo]');
            c = await until(() => cur(pat2), (x) => x.ac === '15 [plate]');
            const notes = c.panels.find((p) => p.type === 'notes').notes.map((n) => n.title);
            is(`${name} updated, play state and notes kept`, [c.ac, c.hp.cur, c.conditions, c.name, c.panels.find((p) => p.type === 'attacks').rows[0].used, notes.includes('Mine'), c.panels.find((p) => p.type === 'list').rows[0].text], ['15 [plate]', 3, ['Prone'], before, 1, true, 'Ignores all mud.']);
            await until(() => pat2.ev(`!document.querySelector('[data-act=hbmon]')`));
            await click(pat2, '.hb-undo button');
            c = await until(() => cur(pat2), (x) => x.ac === '13 [hide]');
            is(`${name} Undo puts it back, the added spell too`, [c.ac, c.hp.cur, c.hbsrc.at < entries('111').find((x) => x.id === id).updated, c.panels.find((p) => p.type === 'spells').rows[0].name], ['13 [hide]', 3, true, 'Mire Bolt']);
            await until(() => pat2.ev(`!document.querySelector('dialog[open]')`));

            // an untouched copy updates with no warning
            await pat2.go(BASE + '/privacy/');
            await pat2.ev(`(() => { const d = JSON.parse(localStorage.getItem('monster-sheet')); d.cur = Object.values(d.chars).find((c) => c.hbsrc?.id === ${J(id)} && !c.conditions.length).id; localStorage.setItem('monster-sheet', JSON.stringify(d)); })()`);
            await pat2.go(BASE + '/sheets/monster/');
            await until(() => visible(pat2, '[data-act=hbmon]'));
            await click(pat2, '[data-act=hbmon]');
            t = await until(() => dlgText(pat2), (x) => x.includes('After the update'));
            is(`${name} an untouched copy has no warning`, t.includes('replaces your changes'), false);
            await click(pat2, '[data-act=hbmongo]');
            await until(() => cur(pat2), (x) => x.ac === '15 [plate]');
            errs(pat2, name, 'Pat updates');
        } finally { pat2.close(); }

        // ---- DM only: Dee turns it on ----
        const dee3 = await launch(name);
        try {
            await signIn(dee3, DM, `/compendium/?t=monster&i=hb:${id}`);
            await until(() => visible(dee3, '[data-hb-dmonly]'));
            await until(() => dee3.ev(`document.querySelector('[data-hb-share]').checked`));
            await click(dee3, '[data-hb-dmonly]');
            is(`${name} DM only is on the campaign's list`, (await until(shares, (s) => s.find((r) => r.id === id)?.dmonly)).find((r) => r.id === id).dmonly, true);
            await dee3.go(`${BASE}/compendium/?t=monster&i=hb:${id}`);
            await until(() => visible(dee3, '[data-hb-dmonly]'));
            is(`${name} and stays ticked`, await until(() => dee3.ev(`document.querySelector('[data-hb-dmonly]').checked`)), true);
            errs(dee3, name, 'Dee turns on DM only');
        } finally { dee3.close(); }

        // ---- a player never receives it, in any way ----
        const pat3 = await launch(name);
        try {
            await signIn(pat3, PLAYER, '/compendium/?tab=monster');
            await until(() => visible(pat3, '#cp-new'));
            const raw = await answer(pat3);
            is(`${name} player's JSON: not there at all`, [raw.includes('Bog Hag'), raw.includes(id), raw.includes('Mire Bolt')], [false, false, true]);
            await search(pat3, 'Bog Hag');
            await until(() => pat3.ev(`localStorage.getItem('homebrew-shared')?.includes('Mire Bolt') === true`));
            is(`${name} player's Compendium: not listed`, await hasRow(pat3, 'Bog Hag'), false);
            is(`${name} player's browser: not kept`, await pat3.ev(`(localStorage.getItem('homebrew-shared') || '').includes('Bog Hag') || (localStorage.getItem('homebrew') || '').includes('Bog Hag')`), false);
            await pat3.go(`${BASE}/compendium/?t=monster&i=hb:${id}`);
            is(`${name} player's link: not shared`, (await until(() => body(pat3), (x) => x.includes("isn't shared with you"))).includes('15 (plate)'), false);
            await pat3.go(BASE + '/sheets/monster/');
            await until(() => pat3.ev(`!!document.querySelector('[data-act=manage]')`));
            await click(pat3, '[data-act=manage]');
            await click(pat3, '[data-act=find]');
            await until(() => pat3.ev(`document.querySelectorAll('.mon-hit').length > 0`));
            await pat3.ev(`(() => { const q = document.querySelector('#mon-q'); q.value = 'Bog H'; q.dispatchEvent(new Event('input', { bubbles: true })); })()`);
            await sleep(1500);
            is(`${name} player's Monster Sheet search: not listed`, await pat3.ev(`[...document.querySelectorAll('.mon-hit')].some((b) => b.textContent.includes('Bog Hag'))`), false);
            // asking for it by key, as the Compendium's request or a link would, adds nothing
            const count = () => db(pat3).then((d) => Object.keys(d.chars).length);
            const was = await count();
            await pat3.ev(`localStorage.setItem('mon-pending', ${J(J([{ id: 'x1', key: 'hb:' + id, n: 1, name: 'Bog Hag' }]))})`);
            await pat3.go(BASE + '/sheets/monster/');
            await until(() => pat3.ev(`(JSON.parse(localStorage.getItem('mon-pending')) || []).length === 0`));
            await pat3.go(`${BASE}/sheets/monster/?hb=copy:${id}`);
            await sleep(1500);
            is(`${name} asking by key adds nothing`, await count(), was);
            // what Pat already added stays: a sheet keeps its copy
            is(`${name} the copies already on Pat's sheet stay`, (await db(pat3).then((d) => Object.values(d.chars).filter((c) => c.hbsrc?.id === id).length)), 4);
            errs(pat3, name, 'Pat after DM only');
        } finally { pat3.close(); }

        // ---- the co-DM and the owner do ----
        const co = await launch(name);
        try {
            await signIn(co, CODM, '/compendium/?tab=monster');
            await until(() => visible(co, '#cp-new'));
            is(`${name} co-DM's JSON has it`, (await answer(co)).includes('Bog Hag'), true);
            await openRow(co, 'Bog Hag');
            is(`${name} marked DM only`, (await until(() => body(co), (x) => x.includes('DM only'))).includes('Stonehold (DM only)'), true);
            is(`${name} and the co-DM can take it out`, await visible(co, '[data-hb-remove]'), true);
            errs(co, name, 'co-DM');
        } finally { co.close(); }
        // a co-DM who's demoted stops getting it at once
        const camp = JSON.parse(readFileSync(join(ACCOUNTS, 'campaigns', CAMP, 'campaign.json'), 'utf8'));
        writeFileSync(join(ACCOUNTS, 'campaigns', CAMP, 'campaign.json'), J({ ...camp, codms: [] }));
        const co2 = await launch(name);
        try {
            await signIn(co2, CODM, '/privacy/');
            is(`${name} a demoted co-DM doesn't`, (await answer(co2)).includes('Bog Hag'), false);
        } finally { co2.close(); }

        // ---- signed out: the browser alone ----
        const out = await launch(name);
        try {
            await signIn(out, '', '/sheets/monster/?hb=new');
            await until(() => out.ev(`!!document.querySelector('[data-act=manage]')`));
            await click(out, '[data-act=manage]');
            await saveDialog(out);
            await out.ev(`document.querySelector('#hbm-name').value = 'Lone Imp'`);
            await click(out, '[data-act=hbsavego]');
            is(`${name} signed out: kept in the browser`, await until(() => out.ev(`(localStorage.getItem('homebrew') || '').includes('Lone Imp')`)), true);
            await out.go(BASE + '/compendium/?tab=monster');
            await until(() => visible(out, '#cp-new'));
            await openRow(out, 'Lone Imp');
            is(`${name} signed out: told to sign in to share`, (await body(out)).includes('Sign in to save this'), true);
            errs(out, name, 'signed out');
        } finally { out.close(); }
    }
} finally {
    web.kill();
}
console.log(bad ? `${bad} check(s) failed` : 'homebrew monsters ok');
process.exit(bad ? 1 : 0);
