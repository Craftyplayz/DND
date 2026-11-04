// Checks the Sources tick list in headless Chrome and Firefox: in the Compendium the ticked books narrow every tab (counts worked out from the content
// files), a book's entries say where they're from, an entry in two books shows while either is ticked, monsters use the same list, rules aren't touched,
// favourites and a link still open; the choice survives a reload, reaches the account and a second browser; in the character builder it narrows
// what's offered but a class this character already has stays, and the character itself isn't changed. Signed out it works from the browser alone.
//   node _dev/scripts/sources-page.mjs        (needs includes/config.php for sign-in)
// Starts its own server (port 8131 + CHECK_PORT_SHIFT) with stand-in account and session folders in the temp folder, so it never touches
// private/dnd/accounts or private/sessions. Backups are blocked.
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { launch, browsers, serving } from './browser.mjs';

const ROOT = join(import.meta.dirname, '../..'), PORT = 8131 + (+process.env.CHECK_PORT_SHIFT || 0), BASE = `http://localhost:${PORT}`;
const PHP = process.env.PHP || (process.platform === 'win32' ? 'C:/php/php.exe' : 'php');
const TMP = join(tmpdir(), 'dnd-sources-check' + (process.env.CHECK_PORT_SHIFT || '')), ACCOUNTS = join(TMP, 'accounts'), SESSIONS = join(TMP, 'sessions');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ser = (o) => `a:${Object.keys(o).length}:{` + Object.entries(o).map(([k, v]) => `s:${Buffer.byteLength(k)}:"${k}";s:${Buffer.byteLength(v)}:"${v}";`).join('') + '}';
const SID = 'srccheckme00000000000000000000000000', J = JSON.stringify;
let bad = 0;
const is = (name, got, want) => { if (J(got) !== J(want)) { bad++; console.log(`FAIL ${name}: got ${J(got)}, want ${J(want)}`); } };
const until = async (fn, ok, ms = 15000) => { const t = Date.now(); let v; while (Date.now() - t < ms) { v = await fn(); if (ok(v)) return v; await sleep(150); } return v; };

// what the content files say each tab should list for a set of books
const content = (r, f) => JSON.parse(readFileSync(join(ROOT, 'sheets/player/content', `${r}-${f}.json`), 'utf8'));
const entries = (f, cats) => ['2014', '2024'].flatMap((r) => cats.flatMap((c) => Object.values(content(r, f)[c] || {})));
const inBooks = (list, books) => list.filter((e) => e.book.split('; ').some((b) => books.includes(b))).length;
const CLASSES = entries('classes', ['classes', 'subclasses']), SPELLS = entries('spells', ['spells']);
const MON = JSON.parse(readFileSync(join(ROOT, 'sheets/monster/monsters.json'), 'utf8'));
const TOH = 'Tome of Heroes', PHB = "Player's Handbook", TOB = 'Tome of Beasts';
const tob = MON.list.filter(([, , , , src]) => MON.sources[src]?.title === TOB).length;
const two = CLASSES.concat(SPELLS, entries('origins', ['races', 'subraces', 'backgrounds', 'feats'])).find((e) => e.book.includes('; '));

const web = spawn(PHP, ['-S', `127.0.0.1:${PORT}`, '-t', ROOT, join(ROOT, '_dev/router.php')], { stdio: 'ignore', env: { ...process.env, DND_ACCOUNTS: ACCOUNTS, DND_SESSIONS: SESSIONS } });
await serving(BASE + '/privacy/');

const click = (b, sel) => b.ev(`(() => { const e = document.querySelector(${J(sel)}); if (e) e.click(); return !!e; })()`);
const count = (b) => b.ev(`parseInt(document.querySelector('#cp-count').textContent.replace(/\\D/g, '')) || 0`);
const countIs = (b, n) => until(() => count(b), (c) => c === n);
const loaded = (b) => until(() => count(b), (c) => c > 0, 30000);
const bookBox = (n) => `#books-list input[data-book="${n.replace(/"/g, '\\"')}"]`;
const openList = async (b) => { await click(b, '#cp-books'); await until(() => b.ev(`document.querySelectorAll('#books-list input').length`), (n) => n > 0); };
const closeList = (b) => click(b, '[data-bk=close]');
// only these ticked
const only = async (b, ...books) => {
    await click(b, '[data-bk=none]');
    for (const n of books) await click(b, bookBox(n));
};
const errs = (b, name, where) => { const e = b.errors.filter((x) => !/backup\.php/.test(x)); if (e.length) { bad++; console.log(`FAIL ${name} ${where}: ${e.join(' | ').slice(0, 600)}`); } };
const start = async (b, signed, path) => {
    await b.block(/backup\.php/);
    await b.go(BASE + '/privacy/');
    await b.ev(`localStorage.clear(); ${signed ? `document.cookie = 'dndsid=${SID}; path=/'` : ''}`);
    await b.go(BASE + path);
};

try {
    for (const name of browsers) {
        rmSync(TMP, { recursive: true, force: true });
        mkdirSync(SESSIONS, { recursive: true });
        writeFileSync(join(SESSIONS, 'sess_' + SID), 'user|' + ser({ sub: '111', email: 'me@example.com', name: 'Me' }));

        // ---- signed out: the Compendium ----
        let b = await launch(name);
        try {
            await start(b, false, '/compendium/?tab=class');
            await loaded(b);
            is(`${name} everything shows at first`, [await count(b), await b.ev(`document.querySelector('#cp-books').textContent`)], [CLASSES.length, 'Sources']);

            await openList(b);
            is(`${name} list has books, all ticked, with counts`, await b.ev(`(() => { const a = [...document.querySelectorAll('#books-list input')]; return JSON.stringify([a.every((i) => i.checked), a.some((i) => i.dataset.book === ${J(PHB)}), a.some((i) => i.dataset.book === ${J(TOB)}), a.some((i) => i.dataset.book === 'wikidot')]); })()`).then(JSON.parse), [true, true, true, false]);
            await only(b, TOH);
            is(`${name} one book`, await countIs(b, inBooks(CLASSES, [TOH])), inBooks(CLASSES, [TOH]));
            await click(b, bookBox(PHB));
            is(`${name} two books`, await countIs(b, inBooks(CLASSES, [TOH, PHB])), inBooks(CLASSES, [TOH, PHB]));
            // the search narrows what the bulk buttons reach
            await b.ev(`(() => { const q = document.querySelector('#books-q'); q.value = 'player'; q.dispatchEvent(new Event('input', { bubbles: true })); })()`);
            await click(b, '[data-bk=none]');
            is(`${name} untick all only reaches what the search shows`, await countIs(b, inBooks(CLASSES, [TOH])), inBooks(CLASSES, [TOH]));
            await closeList(b);
            is(`${name} button says filtered`, await b.ev(`document.querySelector('#cp-books').textContent`), 'Sources (filtered)');

            // the entry says where it's from; a phone can reach all of it
            await click(b, '#cp-list .cp-row');
            is(`${name} source on the entry`, (await until(() => b.ev(`document.querySelector('#cp-dbody .cp-book')?.textContent || ''`), Boolean)), `Source: ${TOH}`);
            is(`${name} no source on the rows`, await b.ev(`[...document.querySelectorAll('#cp-list .cp-row')].some((r) => r.textContent.includes(${J(TOH)}))`), false);

            // the same choice on another tab, and after a reload
            await click(b, '#cp-tabs [data-tab=spell]');
            is(`${name} spells use the same choice`, await countIs(b, inBooks(SPELLS, [TOH])), inBooks(SPELLS, [TOH]));
            await b.go(BASE + '/compendium/?tab=spell');
            is(`${name} survives a reload`, await countIs(b, inBooks(SPELLS, [TOH])), inBooks(SPELLS, [TOH]));

            // rules have no book, and no button
            await click(b, '#cp-tabs [data-tab=rule]');
            is(`${name} rules untouched, no button`, [await until(() => count(b), (c) => c > 100) > 100, await b.ev(`document.querySelector('#cp-books').hidden`)], [true, true]);

            // monsters: the same list
            await click(b, '#cp-tabs [data-tab=monster]');
            await loaded(b).catch(() => { });
            await openList(b);
            await only(b, TOB);
            await closeList(b);
            is(`${name} monsters by book`, await countIs(b, tob), tob);
            is(`${name} monsters' old single pick is gone`, await b.ev(`!!document.querySelector('[data-f=src]')`), false);

            // an entry in two books shows while either is ticked
            if (two) {
                const [one, other] = two.book.split('; ');
                is(`${name} two books: either`, await b.ev(`(() => { localStorage.setItem('compendium-books', ${J(J([one]))}); return JSON.stringify([Books.allows(${J(two.book)}), Books.allows(${J(other)}), Books.allows(${J(one)})]); })()`), J([true, true, false]));
                is(`${name} two books: neither`, await b.ev(`(() => { localStorage.setItem('compendium-books', ${J(J([one, other]))}); return Books.allows(${J(two.book)}); })()`), false);
            }
            is(`${name} no book (homebrew) always shows`, await b.ev(`Books.allows(undefined)`), true);

            // a link to a hidden entry still opens: the filter is about lists
            await b.ev(`localStorage.setItem('compendium-books', ${J(J([PHB]))})`);
            await b.go(BASE + '/compendium/?t=spell&i=2014:fireball');
            is(`${name} a link opens a hidden entry`, (await until(() => b.ev(`document.querySelector('#cp-dbody h2')?.textContent || ''`), Boolean)), 'Fireball');
            await b.shot(390);
            is(`${name} phone: no sideways scroll`, await b.ev(`document.documentElement.scrollWidth <= innerWidth`), true);
            await b.shot(1280);
            errs(b, name, 'compendium');
        } finally { b.close(); }

        // ---- signed in: follows the account ----
        b = await launch(name);
        try {
            await start(b, true, '/compendium/?tab=class');
            await loaded(b);
            await openList(b);
            await only(b, TOH);
            await closeList(b);
            const acc = () => { try { return JSON.parse(readFileSync(join(ACCOUNTS, 'prefs', '111.json'), 'utf8')); } catch { return {}; } };
            const seen = await until(() => J(acc()), (t) => t.includes('compendium-books') && t.includes(TOH), 15000);
            is(`${name} reaches the account`, seen.includes('compendium-books'), true);
            errs(b, name, 'signed in');
        } finally { b.close(); }
        b = await launch(name);
        try {
            await start(b, true, '/privacy/');
            await until(() => b.ev(`localStorage.getItem('compendium-books') || ''`), Boolean);
            await b.go(BASE + '/compendium/?tab=class');
            is(`${name} a second browser gets the choice`, await countIs(b, inBooks(CLASSES, [TOH])), inBooks(CLASSES, [TOH]));
            errs(b, name, 'second browser');
        } finally { b.close(); }

        // ---- the builder ----
        b = await launch(name);
        try {
            await start(b, false, '/characters/build#class');
            const rows = () => b.ev(`JSON.stringify([...document.querySelectorAll('#bd-list-classes .bd-row')].map((r) => r.dataset.id))`).then(JSON.parse);
            const all = await until(rows, (l) => l.length > 5, 30000);
            is(`${name} builder: everything at first`, [all.includes('fighter'), all.includes('artificer')], [true, true]);
            // pick the Artificer, go back: then allow only the Player's Handbook
            await click(b, '.bd-row[data-id=artificer]');
            await until(() => b.ev(`!document.querySelector('#bd-list-classes')`), Boolean);
            await click(b, '[data-act=clslist]');
            await until(rows, (l) => l.length > 5);
            const chBefore = await b.ev(`localStorage.getItem('hb-sheet')`);
            await click(b, '[data-act=books]');
            await until(() => b.ev(`document.querySelectorAll('#books-list input').length`), (n) => n > 0);
            is(`${name} builder's list leaves out monster-only books`, await b.ev(`!!document.querySelector(${J(bookBox(TOB))})`), false);
            await only(b, PHB);
            const narrowed = await until(rows, (l) => l.length < all.length);
            await closeList(b);
            const wantPHB = Object.values(content('2014', 'classes').classes).filter((c) => c.book.split('; ').includes(PHB)).map((c) => c.index);
            is(`${name} builder: only that book, plus the class it has`, narrowed.filter((i) => !wantPHB.includes(i)), ['artificer']);
            is(`${name} builder: the book's classes all listed`, wantPHB.every((i) => narrowed.includes(i)), true);
            is(`${name} builder: the character isn't changed`, await b.ev(`localStorage.getItem('hb-sheet')`), chBefore);
            errs(b, name, 'builder');
        } finally { b.close(); }
    }
} finally {
    web.kill();
}
console.log(bad ? `${bad} check(s) failed` : 'sources page ok');
process.exit(bad ? 1 : 0);
