// Checks named encounters on the Monster Sheet (ROADMAP 3.1) in headless Chrome and Firefox: old monsters start in Unsorted
// (one naming an encounter that isn't in the list too, keeping its value); New encounter, rename, reorder, archive and unarchive;
// Move and Copy to encounter (numbering per encounter, a copy is a fresh creature); new monsters go to Unsorted; each encounter
// has its own Archived (N); the phone layout (picker in the bar, monster picker limited to the encounter); a reload shows the
// last-opened monster's encounter; the list reaches the account and a second browser; signed out it works from the browser alone.
//   node _dev/scripts/monster-encounters.mjs        (needs includes/config.php for sign-in)
// Starts its own server (port 8123 + CHECK_PORT_SHIFT) with stand-in account and session folders in the temp folder, so it never
// touches private/dnd/accounts or private/sessions. Backups and settings sync are blocked.
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { launch, browsers, serving } from './browser.mjs';

const ROOT = join(import.meta.dirname, '../..'), PORT = 8123 + (+process.env.CHECK_PORT_SHIFT || 0), BASE = `http://localhost:${PORT}`;
const PHP = process.env.PHP || (process.platform === 'win32' ? 'C:/php/php.exe' : 'php');
const TMP = join(tmpdir(), 'dnd-encounters-check' + (process.env.CHECK_PORT_SHIFT || '')), ACCOUNTS = join(TMP, 'accounts'), SESSIONS = join(TMP, 'sessions');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ser = (o) => `a:${Object.keys(o).length}:{` + Object.entries(o).map(([k, v]) => `s:${Buffer.byteLength(k)}:"${k}";s:${Buffer.byteLength(v)}:"${v}";`).join('') + '}';
const SID = 'enccheckme000000000000000000000000';

let bad = 0;
const is = (name, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) { bad++; console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); } };
const until = async (fn, ok, ms = 8000) => { const t = Date.now(); let v; while (Date.now() - t < ms) { v = await fn(); if (ok(v)) return v; await sleep(200); } return v; };
const web = spawn(PHP, ['-S', `127.0.0.1:${PORT}`, '-t', ROOT, join(ROOT, '_dev/router.php')], { stdio: 'ignore', env: { ...process.env, DND_ACCOUNTS: ACCOUNTS, DND_SESSIONS: SESSIONS } });
await serving(BASE + '/privacy/');

const mon = (id, name, extra = {}) => ({ id, name, updated: 100, abilities: [], hp: { cur: 7, base: 7, temp: 0, mod: 0 }, ...extra });
const SEED = { cur: 'orc', chars: {
    gob: mon('gob', 'Goblin', { hp: { cur: 3, base: 7, temp: 2, mod: 0 }, conditions: ['Prone'], rolls: [{ id: 'r1', title: 'Scimitar', total: 9 }] }),
    orc: mon('orc', 'Orc'),
    wolf: mon('wolf', 'Wolf', { enc: 'ghost' }), // names an encounter that isn't in the list
} };
const db = (b) => b.ev(`localStorage.getItem('monster-sheet')`).then(JSON.parse);
const byName = (d, n) => Object.values(d.chars).find((c) => c.name === n);
const click = (b, sel) => b.ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (e) e.click(); return !!e; })()`);
const pick = (b, sel, v) => b.ev(`(() => { const s = document.querySelector(${JSON.stringify(sel)}); s.value = ${JSON.stringify(v)}; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
const opts = (b, sel) => b.ev(`JSON.stringify([...document.querySelectorAll(${JSON.stringify(sel + ' option')})].map((o) => o.textContent))`).then(JSON.parse);
const listed = (b) => b.ev(`JSON.stringify([...document.querySelectorAll('#mon-side > .mon-list [data-act=side] b')].map((x) => x.textContent))`).then(JSON.parse);
const shown = (b) => b.ev(`document.querySelector('.mon-encside').selectedOptions[0].textContent`);
const rename = (b, v) => b.ev(`(() => { const f = document.activeElement; f.value = ${JSON.stringify(v)}; f.dispatchEvent(new Event('input', { bubbles: true })); return f.dataset.encName || ''; })()`);
// the dialog's close event (it redraws the list) comes a moment after close()
const closeDlg = async (b) => { await click(b, '#mon-encdlg [data-enc=close]'); await sleep(150); };
const errs = (b, name, where) => { const e = b.errors.filter((x) => !/backup\.php|prefs\.php/.test(x)); if (e.length) { bad++; console.log(`FAIL ${name} ${where}: ${e.join(' | ').slice(0, 600)}`); } };
const start = async (b, signed, seed) => {
    await b.block(/backup\.php|prefs\.php/);
    await b.go(BASE + '/privacy/');
    await b.ev(`localStorage.clear(); ${seed ? `localStorage.setItem('monster-sheet', ${JSON.stringify(JSON.stringify(seed))});` : ''} document.cookie = 'dndsid=${signed ? SID : ''}; path=/'`);
    await b.go(BASE + '/sheets/monster/');
    await until(() => b.ev(`!!document.querySelector('.mon-encside')`), Boolean);
};

try {
    for (const name of browsers) {
        rmSync(TMP, { recursive: true, force: true });
        mkdirSync(SESSIONS, { recursive: true });
        writeFileSync(join(SESSIONS, 'sess_' + SID), 'user|' + ser({ sub: '111', email: 'me@example.com', name: 'Me' }));
        let b = await launch(name);
        try {
            await start(b, true, SEED);
            // old monsters: all in Unsorted, the unknown encounter's value kept
            is(`${name} old monsters in Unsorted`, [await shown(b), (await listed(b)).sort()], ['Unsorted', ['Goblin', 'Orc', 'Wolf']]);
            // New encounter: "Encounter 2", its name ready to type over; then "Encounter 3"
            await pick(b, '.mon-encside', '+new');
            is(`${name} new encounter named and focused`, await b.ev(`JSON.stringify([document.querySelector('#mon-encdlg').open, document.activeElement.value, document.activeElement.selectionEnd - document.activeElement.selectionStart])`).then(JSON.parse), [true, 'Encounter 2', 11]);
            const cave = await rename(b, 'Cave');
            let d = await db(b);
            is(`${name} enc added empty, unknown one kept`, [d.chars.gob.enc, d.chars.orc.enc, d.chars.wolf.enc, d.encs.map((e) => e.name)], ['', '', 'ghost', ['Cave']]);
            await click(b, '#mon-encdlg [data-enc=new]');
            is(`${name} second one is Encounter 3`, await b.ev(`document.activeElement.value`), 'Encounter 3');
            const bridge = await rename(b, 'Bridge');
            // reorder: Cave down, below Bridge
            await click(b, `#mon-encdlg [data-enc=down][data-id="${cave}"]`);
            await closeDlg(b);
            is(`${name} renamed, reordered, empty one shown`, [await opts(b, '.mon-encside'), await shown(b), await b.ev(`document.querySelector('#mon-side h2 .n').textContent`)],
                [['Unsorted', 'Bridge', 'Cave', 'New encounter', 'Manage encounters'], 'Bridge', '0']);

            // Move the open monster (Orc) to Cave: it follows, stamped as an edit, same id
            await pick(b, '.mon-encside', '');
            await click(b, '#mon-side [data-act=side]'); // the first one: Goblin
            const up = (await db(b)).chars.gob.updated;
            await click(b, '[data-act=encto]:not([data-copy])');
            is(`${name} move list leaves out where it is`, await b.ev(`JSON.stringify([...document.querySelectorAll('#mon-encdlg [data-enc=to] b')].map((x) => x.textContent))`).then(JSON.parse), ['Bridge', 'Cave']);
            await click(b, `#mon-encdlg [data-enc=to][data-id="${cave}"]`);
            d = await db(b);
            is(`${name} moved: in Cave, stamped, same id`, [d.chars.gob.enc, d.chars.gob.updated > up, await shown(b), await listed(b)], [cave, true, 'Cave', ['Goblin']]);

            // Copy to Cave: a fresh creature, numbered within Cave
            await click(b, '[data-act=encto][data-copy]');
            await click(b, `#mon-encdlg [data-enc=to][data-id="${cave}"]`);
            d = await db(b);
            const copy = byName(d, 'Goblin 2');
            is(`${name} copy numbered in Cave`, (await listed(b)).sort(), ['Goblin 1', 'Goblin 2']);
            is(`${name} copy is fresh`, copy && [copy.enc, copy.id !== 'gob', copy.hp.cur, copy.hp.temp, copy.conditions, copy.rolls, copy.hpAt], [cave, true, 7, 0, [], [], 0]);
            is(`${name} original kept its rolls`, d.chars.gob.rolls.length, 1);

            // Duplicate goes to Unsorted (as "Goblin 1", free there); moved to Cave it becomes "Goblin 3", the others keep theirs
            await click(b, '[data-act=dup]');
            d = await db(b);
            is(`${name} duplicate in Unsorted`, [Object.values(d.chars).filter((c) => c.name === 'Goblin 1').map((c) => c.enc).sort(), await shown(b)], [['', cave], 'Unsorted']);
            await click(b, '[data-act=encto]:not([data-copy])');
            await click(b, `#mon-encdlg [data-enc=to][data-id="${cave}"]`);
            is(`${name} moved one renumbered only`, (await listed(b)).sort(), ['Goblin 1', 'Goblin 2', 'Goblin 3']);
            // a new blank monster goes to Unsorted too
            await click(b, '[data-act=new]');
            is(`${name} new monster in Unsorted`, [await shown(b), (await db(b)).chars[await b.ev(`JSON.parse(localStorage.getItem('monster-sheet')).cur`)].enc], ['Unsorted', '']);

            // each encounter has its own Archived (N)
            await pick(b, '.mon-encside', cave);
            await click(b, '#mon-side [data-act=side]');
            await click(b, '[data-act=archive]');
            is(`${name} Cave's own archived fold`, [await b.ev(`document.querySelector('#mon-side .mon-arch summary').textContent`), (await listed(b)).length], ['Archived (1)', 2]);
            await pick(b, '.mon-encside', '');
            is(`${name} Unsorted has none archived`, await b.ev(`!document.querySelector('#mon-side .mon-arch:not(.mon-encarch)')`), true);

            // archive Cave: it and its monsters fold away, the monsters' own marks untouched; Unarchive brings them back
            const marks = () => db(b).then((x) => Object.values(x.chars).filter((c) => c.enc === cave).map((c) => [c.name, c.archived]).sort());
            const before = await marks();
            await pick(b, '.mon-encside', '+manage');
            await click(b, `#mon-encdlg [data-enc=arc][data-id="${cave}"]`);
            await closeDlg(b);
            is(`${name} archived encounter folded away`, [await opts(b, '.mon-encside'), await shown(b), await b.ev(`document.querySelector('.mon-encarch summary').textContent`)],
                [['Unsorted', 'Bridge', 'New encounter', 'Manage encounters'], 'Unsorted', 'Archived encounters (1)']);
            is(`${name} its monsters untouched`, await marks(), before);
            await click(b, `.mon-encarch [data-act=encunarc][data-id="${cave}"]`);
            is(`${name} unarchived as it was`, [await shown(b), (await listed(b)).sort(), await b.ev(`document.querySelector('#mon-side .mon-arch summary').textContent`), await marks()], ['Cave', ['Goblin 2', 'Goblin 3'], 'Archived (1)', before]);

            // phones: the picker in the bar, the monster picker lists only the encounter's monsters
            await b.ev(`localStorage.setItem('sheet-full-layout', '1')`); // the full layout on a phone; phone mode has its own check (phone-mode.mjs)
            await b.shot(390);
            is(`${name} phone: bar picker shown, sidebar hidden`, await b.ev(`JSON.stringify([getComputedStyle(document.querySelector('.mon-encbar')).display !== 'none', getComputedStyle(document.querySelector('#mon-side')).display])`).then(JSON.parse), [true, 'none']);
            is(`${name} phone: monster picker is the encounter's`, (await opts(b, '.hb-pick')).map((t) => t.split(' — ')[0]).sort(), ['Goblin 2', 'Goblin 3']);
            await pick(b, '.mon-encbar', '');
            is(`${name} phone: Unsorted picked`, [(await opts(b, '.hb-pick')).map((t) => t.split(' — ')[0]).sort(), await b.ev(`document.querySelector('.mon-encbar').value`)], [['New monster', 'Orc', 'Wolf'], '']);
            is(`${name} phone: no sideways scroll`, await b.ev(`document.documentElement.scrollWidth <= innerWidth`), true);
            await pick(b, '.mon-encbar', cave);
            await b.shot(1280);

            // reload: the last-opened monster's encounter
            await b.ev(`dispatchEvent(new Event('pagehide'))`);
            await b.go(BASE + '/sheets/monster/');
            await until(() => b.ev(`!!document.querySelector('.mon-encside')`), Boolean);
            is(`${name} reload shows the last-opened monster's encounter`, await shown(b), 'Cave');

            // the account has the list (and the moved monsters)
            const acc = () => { try { return JSON.parse(readFileSync(join(ACCOUNTS, 'monster-encounters', '111.json'), 'utf8')).encs.map((e) => e.name).sort(); } catch { return []; } };
            is(`${name} account has the encounters`, await until(acc, (x) => x.length === 2, 10000), ['Bridge', 'Cave']);
            await b.ev(`dispatchEvent(new Event('pagehide'))`);
            const accMon = () => { try { return JSON.parse(readFileSync(join(ACCOUNTS, 'monsters', '111', 'gob.json'), 'utf8')).enc; } catch { return ''; } };
            is(`${name} account has the moved monster`, await until(accMon, (x) => x === cave, 10000), cave);
            errs(b, name, 'first browser');
        } finally { b.close(); }

        // a second browser pulls the encounters and the monsters in them
        b = await launch(name);
        try {
            await start(b, true, null);
            is(`${name} second browser: encounters pulled in order`, await until(() => opts(b, '.mon-encside'), (o) => o.includes('Cave'), 10000), ['Unsorted', 'Bridge', 'Cave', 'New encounter', 'Manage encounters']);
            const cave = await b.ev(`[...document.querySelectorAll('.mon-encside option')].find((o) => o.textContent === 'Cave').value`);
            await pick(b, '.mon-encside', cave);
            is(`${name} second browser: Cave's monsters`, await until(() => listed(b).then((l) => l.sort()), (l) => l.length === 2), ['Goblin 2', 'Goblin 3']);
            // a rename here wins over the older copy in the account
            await pick(b, '.mon-encside', '+manage');
            await b.ev(`document.querySelector('[data-enc-name="${cave}"]').focus()`);
            await rename(b, 'Deep cave');
            await closeDlg(b);
            const acc = () => { try { return JSON.parse(readFileSync(join(ACCOUNTS, 'monster-encounters', '111.json'), 'utf8')).encs.map((e) => e.name).sort(); } catch { return []; } };
            is(`${name} second browser: rename reaches the account`, await until(acc, (x) => x.includes('Deep cave'), 10000), ['Bridge', 'Deep cave']);
            errs(b, name, 'second browser');
        } finally { b.close(); }

        // signed out: encounters live in this browser alone
        b = await launch(name);
        try {
            await start(b, false, SEED);
            await pick(b, '.mon-encside', '+new');
            await rename(b, 'Camp');
            await closeDlg(b);
            await b.ev(`dispatchEvent(new Event('pagehide'))`);
            await b.go(BASE + '/sheets/monster/');
            await until(() => b.ev(`!!document.querySelector('.mon-encside')`), Boolean);
            is(`${name} signed out: kept in the browser`, await opts(b, '.mon-encside'), ['Unsorted', 'Camp', 'New encounter', 'Manage encounters']);
            errs(b, name, 'signed out');
        } finally { b.close(); }
    }
} finally {
    web.kill();
}
console.log(bad ? `${bad} check(s) failed` : 'monster encounters ok');
process.exit(bad ? 1 : 0);
