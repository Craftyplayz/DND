// Checks homebrew in the Compendium (ROADMAP 5.2) in headless Chrome and Firefox: signed out, a house rule is made, edited, survives a reload and
// archives and comes back; signed in, it reaches the account and a second browser (newest wins); it shows whatever rules version is picked, and
// through favourites and a link; it can be shared with a campaign, another member reads it and can't edit it, the DM removes it, the owner keeps it.
//   node _dev/scripts/homebrew-page.mjs        (needs includes/config.php for sign-in)
// Starts its own server (port 8130 + CHECK_PORT_SHIFT) with stand-in account and session folders in the temp folder, so it never touches
// private/dnd/accounts or private/sessions. Backups and settings sync are blocked.
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { launch, browsers, serving } from './browser.mjs';

const ROOT = join(import.meta.dirname, '../..'), PORT = 8130 + (+process.env.CHECK_PORT_SHIFT || 0), BASE = `http://localhost:${PORT}`;
const PHP = process.env.PHP || (process.platform === 'win32' ? 'C:/php/php.exe' : 'php');
const TMP = join(tmpdir(), 'dnd-homebrew-check' + (process.env.CHECK_PORT_SHIFT || '')), ACCOUNTS = join(TMP, 'accounts'), SESSIONS = join(TMP, 'sessions');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ser = (o) => `a:${Object.keys(o).length}:{` + Object.entries(o).map(([k, v]) => `s:${Buffer.byteLength(k)}:"${k}";s:${Buffer.byteLength(v)}:"${v}";`).join('') + '}';
const DM = 'hbcheckdm00000000000000000000000000', PLAYER = 'hbcheckplayer000000000000000000000';
const CAMP = 'abcabcabcabc';

let bad = 0;
const is = (name, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) { bad++; console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); } };
const until = async (fn, ok, ms = 10000) => { const t = Date.now(); let v; while (Date.now() - t < ms) { v = await fn(); if (ok(v)) return v; await sleep(150); } return v; };
const web = spawn(PHP, ['-S', `127.0.0.1:${PORT}`, '-t', ROOT, join(ROOT, '_dev/router.php')], { stdio: 'ignore', env: { ...process.env, DND_ACCOUNTS: ACCOUNTS, DND_SESSIONS: SESSIONS, DND_BACKUPS: join(TMP, 'backups'), DND_MONSTER_BACKUPS: join(TMP, 'monster-backups') } });
await serving(BASE + '/privacy/');

const J = JSON.stringify;
const click = (b, sel) => b.ev(`(() => { const e = document.querySelector(${J(sel)}); if (e) e.click(); return !!e; })()`);
const visible = (b, sel) => b.ev(`(() => { const e = document.querySelector(${J(sel)}); return !!e && !e.hidden && e.getClientRects().length > 0; })()`);
const names = (b) => b.ev(`JSON.stringify([...document.querySelectorAll('#cp-list .cp-row')].filter((r) => r.textContent.includes('Homebrew')).map((r) => r.querySelector('.cp-name').textContent))`).then(JSON.parse);
// by search, as the list only draws 50 rows at a time. The box waits 80 ms before it searches, then puts q in the URL; until it has,
// the row seen can still be the unfiltered list's, and it drops off those 50 when the official rules arrive
const hasRow = async (b, n) => {
    await b.ev(`(() => { const q = document.querySelector('#cp-q'); q.value = ${J(n)}; q.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    await until(() => b.ev(`new URLSearchParams(location.search).get('q') === ${J(n)}`), Boolean);
    return until(() => names(b), (l) => l.includes(n));
};
const clickRow = (b, n) => b.ev(`[...document.querySelectorAll('#cp-list .cp-row')].find((r) => r.querySelector('.cp-name').textContent === ${J(n)}).click()`);
const body = (b) => b.ev(`document.querySelector('#cp-dbody')?.textContent ?? ''`); // '' while a page is still loading, so until() keeps waiting
const open = async (b, cookie, keep) => {
    await b.block(/backup\.php|prefs\.php/);
    await b.go(BASE + '/privacy/');
    // signed out sets no cookie: an empty one would make PHP answer with an HttpOnly one that the sign-in below couldn't replace
    await b.ev(`${keep ? '' : 'localStorage.clear();'} ${cookie ? `document.cookie = 'dndsid=${cookie}; path=/'` : ''}`);
    await b.go(BASE + '/compendium/?tab=rule');
    await until(() => visible(b, '#cp-new'), Boolean);
};
const fill = (b, name, text) => b.ev(`(() => { const f = document.querySelector('#cp-hb-form'); f.elements.name.value = ${J(name)}; f.elements.text.value = ${J(text)}; f.requestSubmit(); })()`);
// waits on the account through the server, never by reading its files from here: on Windows a save's rename fails ("Access is denied", a 500)
// if this process has the file open at that moment. PHP's own server answers one request at a time, so it can't meet its own saves.
const view = (sid) => fetch(BASE + '/compendium/homebrew.php', { headers: { cookie: `dndsid=${sid}` } }).then((r) => r.json()).catch(() => ({ mine: [], shares: {} }));
const account = async (sid) => (await view(sid)).mine.find((e) => e.id === idOf[sid]) || null;
const sharedIn = async (sid) => Object.values((await view(sid)).shares).filter((c) => c.includes(CAMP)).length;
const campaignList = () => JSON.parse(readFileSync(join(ACCOUNTS, 'campaigns', CAMP, 'homebrew.json'), 'utf8')).map((r) => r.id); // only once sharedIn() says it's saved
const idOf = {};
const localId = (b) => b.ev(`Object.keys(JSON.parse(localStorage.getItem('homebrew')))[0]`);
const errs = (b, name, where) => { const e = b.errors.filter((x) => !/backup\.php|prefs\.php/.test(x)); if (e.length) { bad++; console.log(`FAIL ${name} ${where}: ${e.join(' | ').slice(0, 600)}`); } };

try {
    for (const name of browsers) {
        rmSync(TMP, { recursive: true, force: true });
        mkdirSync(SESSIONS, { recursive: true });
        writeFileSync(join(SESSIONS, 'sess_' + DM), 'user|' + ser({ sub: '111', email: 'dm@example.com', name: 'Dee' }));
        writeFileSync(join(SESSIONS, 'sess_' + PLAYER), 'user|' + ser({ sub: '222', email: 'p@example.com', name: 'Pat' }));
        mkdirSync(join(ACCOUNTS, 'campaigns', CAMP), { recursive: true });
        writeFileSync(join(ACCOUNTS, 'campaigns', CAMP, 'campaign.json'), J({ id: CAMP, name: 'Stonehold', dm: '111', code: 'aaaaaaaaaa', members: [{ sub: '111', name: 'Dee', joined: 1, characters: [] }, { sub: '222', name: 'Pat', joined: 1, characters: [] }] }));

        // ---- signed out: the browser alone ----
        let b = await launch(name);
        try {
            await open(b, '');
            is(`${name} button says New rule`, await b.ev(`document.querySelector('#cp-new').textContent`), 'New rule');
            await click(b, '#cp-new');
            is(`${name} form open`, await b.ev(`document.querySelector('#cp-hb').open`), true);
            await fill(b, '', '');
            is(`${name} empty form refused`, await b.ev(`JSON.stringify([document.querySelector('#cp-hb').open, document.querySelector('#cp-hb-form').elements.name.hasAttribute('aria-invalid'), localStorage.getItem('homebrew')])`).then(JSON.parse), [true, true, null]);
            await fill(b, 'Brutal <b>crits</b>', 'Crits roll max.\n- One\n- Two');
            is(`${name} made, escaped, opened`, [await hasRow(b, 'Brutal <b>crits</b>'), await b.ev(`document.querySelector('#cp-hb').open`), await b.ev(`!!document.querySelector('#cp-dbody .cp-title b')`), await b.ev(`document.querySelectorAll('#cp-dbody .cp-text li').length`)], [['Brutal <b>crits</b>'], false, false, 2]);
            is(`${name} signed out: told to sign in, no share`, [(await body(b)).includes('Sign in to save this'), await b.ev(`!!document.querySelector('[data-hb-share]')`)], [true, false]);
            is(`${name} no Add to sheet on a rule`, await b.ev(`!!document.querySelector('[data-add]')`), false);

            // edit keeps the id; reload keeps it
            const id = await localId(b);
            await click(b, '[data-hb-edit]');
            is(`${name} edit form filled`, await b.ev(`document.querySelector('#cp-hb-form').elements.text.value`), 'Crits roll max.\n- One\n- Two');
            await fill(b, 'Brutal crits', 'Crits roll max.');
            is(`${name} edited, same id`, [await hasRow(b, 'Brutal crits'), await localId(b)], [['Brutal crits'], id]);
            await b.go(BASE + '/compendium/?tab=rule');
            is(`${name} survives a reload`, await hasRow(b, 'Brutal crits'), ['Brutal crits']);

            // shows under every rules version
            for (const r of ['2014', '2024', 'both']) {
                await click(b, `#cp-rules input[value="${r}"]`);
                is(`${name} shown under ${r}`, await names(b), ['Brutal crits']);
            }

            // the Homebrew choice beside 2014, 2024 and Both: only homebrew, on every tab, kept over a reload, no Sources button; New follows the tab
            const rows = () => b.ev(`document.querySelectorAll('#cp-list .cp-row').length`);
            const pick = (r) => click(b, `#cp-rules input[value="${r}"]`);
            const official = () => b.ev(`[...document.querySelectorAll('#cp-list .cp-row')].filter((r) => !r.textContent.includes('Homebrew')).length`);
            await b.ev(`(() => { const q = document.querySelector('#cp-q'); q.value = ''; q.dispatchEvent(new Event('input', { bubbles: true })); })()`);
            is(`${name} Both lists the official rules too`, await until(rows, (n) => n > 1) > 1, true);
            await b.ev(`[...document.querySelectorAll('#cp-list .cp-row')].find((r) => !r.textContent.includes('Homebrew')).click()`);
            await until(() => visible(b, '[data-fav]'), Boolean);
            await click(b, '[data-fav]');
            await pick('homebrew');
            is(`${name} Homebrew: only homebrew`, [await until(rows, (n) => n === 1), await official(), await names(b)], [1, 0, ['Brutal crits']]);
            is(`${name} Homebrew: no Sources button, New stays`, [await visible(b, '#cp-books'), await visible(b, '#cp-new')], [false, true]);
            is(`${name} Homebrew is saved`, await b.ev(`localStorage.getItem('compendium-rules').replace(/"/g, '')`), 'homebrew');
            await b.go(BASE + '/compendium/?tab=rule');
            is(`${name} Homebrew survives a reload`, [await until(() => b.ev(`document.querySelector('#cp-rules input:checked')?.value ?? ''`), (v) => v === 'homebrew'), await until(rows, (n) => n === 1), await official()], ['homebrew', 1, 0]);
            await click(b, '#cp-tabs [data-tab=all]');
            is(`${name} Homebrew on All`, [await until(() => names(b), (l) => l.length === 1), await official()], [['Brutal crits'], 0]);
            await click(b, '#cp-tabs [data-tab=fav]');
            is(`${name} Homebrew on Favourites hides an official favourite`, await until(rows, (n) => n === 0), 0);
            await click(b, '#cp-tabs [data-tab=spell]');
            is(`${name} Homebrew with none of that kind says so`, (await until(() => b.ev(`document.querySelector('#cp-list').textContent`), (x) => x.includes('No homebrew here yet'))).includes('Press New spell to make one'), true);
            await click(b, '#cp-tabs [data-tab=fav]');
            await pick('both');
            is(`${name} Both brings the official favourite back`, await until(rows, (n) => n === 1), 1);
            await b.ev(`document.querySelector('#cp-list .cp-row').click()`);
            await until(() => visible(b, '[data-fav]'), Boolean);
            await click(b, '[data-fav]'); // off again, so the rest of this check sees what it always did
            await click(b, '#cp-tabs [data-tab=rule]');
            is(`${name} Both lists the rest again`, await until(rows, (n) => n > 1) > 1, true);

            // favourite, then a link to it
            await clickRow(b, 'Brutal crits');
            await until(() => body(b), (t) => t.includes('Crits roll max'));
            await click(b, '[data-fav]');
            const link = await b.ev(`location.pathname + location.search`);
            await b.go(BASE + link);
            is(`${name} the link opens it`, (await until(() => body(b), (t) => t.includes('Crits roll max'))).includes('Crits roll max'), true);
            await b.go(BASE + '/compendium/?tab=fav');
            is(`${name} favourite keeps its key`, await hasRow(b, 'Brutal crits'), ['Brutal crits']);
            await b.go(BASE + '/compendium/?tab=rule');
            await hasRow(b, 'Brutal crits');

            // archive and back
            await clickRow(b, 'Brutal crits');
            await until(() => visible(b, '[data-hb-archive]'), Boolean);
            await click(b, '[data-hb-archive]');
            is(`${name} archived: off the list, not gone`, [await until(() => names(b), (l) => !l.length), await b.ev(`document.querySelector('#cp-arch').textContent`), await b.ev(`Object.values(JSON.parse(localStorage.getItem('homebrew')))[0].name`)], [[], 'Archived (1)', 'Brutal crits']);
            await click(b, '#cp-arch');
            await click(b, '[data-unarchive]');
            is(`${name} unarchived`, [await hasRow(b, 'Brutal crits'), await visible(b, '#cp-arch')], [['Brutal crits'], false]);
            is(`${name} other tabs have no New button yet`, [await click(b, '#cp-tabs [data-tab=fav]'), await visible(b, '#cp-new')], [true, false]);
            errs(b, name, 'signed out');

            // signing in uploads what the browser made
            await open(b, DM, true);
            idOf[DM] = id;
            is(`${name} uploaded on sign-in`, (await until(() => account(DM), Boolean))?.name, 'Brutal crits');

            // share with the campaign
            await hasRow(b, 'Brutal crits');
            await clickRow(b, 'Brutal crits');
            await until(() => visible(b, '[data-hb-share]'), Boolean);
            await b.ev(`document.querySelector('[data-hb-share]').click()`);
            await until(() => sharedIn(DM), Boolean);
            is(`${name} shared`, campaignList(), [id]);
            errs(b, name, 'signed in');
        } finally { b.close(); }

        // ---- a new browser: pulled back from the account, still ticked; an edit here wins ----
        b = await launch(name);
        try {
            await open(b, DM);
            is(`${name} new browser: pulled back`, await hasRow(b, 'Brutal crits'), ['Brutal crits']);
            await clickRow(b, 'Brutal crits');
            is(`${name} new browser: still shared`, await until(() => b.ev(`!!document.querySelector('[data-hb-share]')?.checked`), Boolean), true);
            await click(b, '[data-hb-edit]');
            await fill(b, 'Brutal crits v2', 'Newer.');
            is(`${name} new browser: the edit reaches the account`, (await until(() => account(DM), (e) => e && e.name === 'Brutal crits v2'))?.name, 'Brutal crits v2');
            errs(b, name, 'new browser');
        } finally { b.close(); }

        // ---- another member: reads it, can't change it; their browser doesn't keep it ----
        const p = await launch(name);
        try {
            await open(p, PLAYER);
            is(`${name} member sees the edit`, await hasRow(p, 'Brutal crits v2'), ['Brutal crits v2']);
            await clickRow(p, 'Brutal crits v2');
            const t = await until(() => body(p), (x) => x.includes('Newer.'));
            is(`${name} member: named, no edit, no share, no remove`, [t.includes('Shared by Dee in Stonehold'), await p.ev(`!!document.querySelector('[data-hb-edit],[data-hb-archive],[data-hb-share],[data-hb-remove]')`)], [true, false]);
            is(`${name} member: not in their own store`, await p.ev(`localStorage.getItem('homebrew') === null || Object.keys(JSON.parse(localStorage.getItem('homebrew'))).length === 0`), true);

            // the member's rule, which the DM then removes
            await click(p, '#cp-new');
            await fill(p, 'Pat rule', 'From Pat.');
            await until(() => visible(p, '[data-hb-share]'), Boolean);
            await p.ev(`document.querySelector('[data-hb-share]').click()`);
            await until(() => sharedIn(PLAYER), Boolean);
            errs(p, name, 'member');
        } finally { p.close(); }

        const d = await launch(name);
        try {
            await open(d, DM);
            is(`${name} DM sees the member's`, (await hasRow(d, 'Pat rule')).includes('Pat rule'), true);
            await clickRow(d, 'Pat rule');
            await until(() => visible(d, '[data-hb-remove]'), Boolean);
            await click(d, '[data-hb-remove]');
            is(`${name} the DM is asked first`, await until(() => d.ev(`document.querySelector('#cp-hbask').open`), Boolean), true);
            await click(d, '#cp-hbask-yes');
            is(`${name} DM removes it`, (await until(() => names(d), (l) => !l.includes('Pat rule'))).includes('Pat rule'), false);
            errs(d, name, 'DM');
        } finally { d.close(); }

        const p2 = await launch(name);
        try {
            await open(p2, PLAYER);
            is(`${name} owner keeps it after the removal`, (await hasRow(p2, 'Pat rule')).includes('Pat rule'), true);
            await clickRow(p2, 'Pat rule');
            is(`${name} owner sees it unshared`, await until(() => b_checked(p2), (v) => v === false), false);
            errs(p2, name, 'owner after removal');
        } finally { p2.close(); }
    }
} finally {
    web.kill();
}
function b_checked(b) { return b.ev(`document.querySelector('[data-hb-share]') ? document.querySelector('[data-hb-share]').checked : null`); }
console.log(bad ? `${bad} check(s) failed` : 'homebrew page ok');
process.exit(bad ? 1 : 0);
