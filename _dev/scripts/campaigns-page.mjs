// Checks Campaigns (/campaigns/, a campaign page, /campaigns/join/<code>) in headless Chrome and Firefox, signed in as three
// stand-in players: the DM makes a campaign and adds a character, a player joins by link and adds theirs, a stranger sees
// nothing, the DM opens the player's sheet read-only, a new link stops the old one, the DM removes the player.
//   node _dev/scripts/campaigns-page.mjs
// Starts its own server on port 8114 with stand-in account and session folders in the temp folder, so it never touches
// private/dnd/accounts or private/sessions. Needs sign-in set up locally (includes/config.php).
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { launch, browsers, serving } from './browser.mjs';

const ROOT = join(import.meta.dirname, '../..'), PORT = 8114 + (+process.env.CHECK_PORT_SHIFT || 0), BASE = `http://localhost:${PORT}`;
const PHP = process.env.PHP || (process.platform === 'win32' ? 'C:/php/php.exe' : 'php');
const TMP = join(tmpdir(), 'dnd-campaigns-check' + (process.env.CHECK_PORT_SHIFT || '')), ACCOUNTS = join(TMP, 'accounts'), SESSIONS = join(TMP, 'sessions');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// three players, each with a session file the way PHP writes it ("user|" + serialize(array))
const ser = (o) => `a:${Object.keys(o).length}:{` + Object.entries(o).map(([k, v]) => `s:${Buffer.byteLength(k)}:"${k}";s:${Buffer.byteLength(v)}:"${v}";`).join('') + '}';
const USERS = { dm: ['111', 'Dee'], pl: ['222', 'Pat'], st: ['333', 'Stan'] };
function setup() {
    rmSync(TMP, { recursive: true, force: true });
    mkdirSync(SESSIONS, { recursive: true });
    for (const [who, [sub, name]] of Object.entries(USERS)) writeFileSync(join(SESSIONS, `sess_check${who}0000000000000000000000000`), 'user|' + ser({ sub, email: `${who}@example.com`, name }));
    for (const [id, owner, name, cls] of [['dmpc', '111', 'Brannoc', 'Fighter'], ['lock', '222', 'Lock', 'Barbarian'], ['oz1', '333', 'Ozzy', 'Wizard']]) {
        mkdirSync(join(ACCOUNTS, 'characters', id), { recursive: true });
        writeFileSync(join(ACCOUNTS, 'characters', id, 'meta.json'), JSON.stringify({ owner, visibility: 'private', created: 1, campaigns: [] }));
        writeFileSync(join(ACCOUNTS, 'characters', id, 'character.json'), JSON.stringify({ id, name, race: 'Human', updated: 5, art: '', classes: [{ name: cls, level: 3, die: 8, hdUsed: 0 }], abilities: [] }));
    }
}

const server = spawn(PHP, ['-S', `127.0.0.1:${PORT}`, '-t', ROOT, join(ROOT, '_dev/router.php')], { env: { ...process.env, DND_ACCOUNTS: ACCOUNTS, DND_SESSIONS: SESSIONS }, stdio: 'ignore' });
await serving(BASE + '/privacy/');

let bad = 0;
const is = (name, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) { bad++; console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); } };
try {
    for (const name of browsers) {
        setup();
        const b = await launch(name), ev = b.ev;
        // a page counts as loaded once its <main> is there; a fixed sleep sometimes read the page before a redirect landed
        const go = async (url) => {
            await b.go(url);
            for (let i = 0; i < 100 && !(await ev(`document.readyState === 'complete' && !!document.querySelector('main')`)); i++) await sleep(100);
        };
        const errs = (where) => { if (b.errors.length) { bad++; console.log(`FAIL ${name} ${where}: ${b.errors.join(' | ').slice(0, 600)}`); } };
        const as = async (who) => { await go(BASE + '/privacy/'); await ev(who ? `document.cookie = 'dndsid=check${who}0000000000000000000000000; path=/'` : `document.cookie = 'dndsid=; path=/; max-age=0'`); };
        const text = (sel) => ev(`document.querySelector(${JSON.stringify(sel)})?.textContent.trim()`);
        const cards = () => ev(`JSON.stringify([...document.querySelectorAll('.cp-grid .ch-card b')].map((b) => b.textContent))`).then(JSON.parse);
        // every action here loads a new page (a reload or the next page); 'ask' ones open the yes/no dialog instead
        const click = async (sel, wait = 'page') => {
            await ev(`window.__old = true; document.querySelector(${JSON.stringify(sel)}).click()`);
            if (wait === 'ask') await b.until(`document.querySelector('#cp-ask').open`).catch(() => { });
            else await b.until(`!window.__old && document.readyState === 'complete' && !!document.querySelector('main')`, 15000);
        };
        try {
            await as(null);
            await go(BASE + '/campaigns/');
            is(`${name} signed out asks to sign in`, (await text('.note'))?.startsWith('Sign in'), true);
            errs('signed out');

            // the DM makes a campaign and adds their character
            await as('dm');
            await go(BASE + '/campaigns/');
            is(`${name} no campaigns yet`, (await text('main .muted:last-of-type'))?.startsWith("You're not in any"), true);
            await ev(`document.querySelector('#cp-create [name=name]').value = 'Curse of the Crown'`);
            await click('#cp-create .btn.primary');
            is(`${name} create opens the campaign`, await text('h1'), 'Curse of the Crown');
            const id = await ev(`location.pathname.split('/')[2] || null`);
            await ev(`document.querySelector('#cp-chars [value=dmpc]').checked = true`);
            await click('#cp-chars .btn.primary');
            is(`${name} DM's character in the party`, await cards(), ['Brannoc']);
            is(`${name} only own characters offered`, await ev(`JSON.stringify([...document.querySelectorAll('#cp-chars [name=ch]')].map((i) => i.value))`), '["dmpc"]');
            const link = await ev(`document.querySelector('#cp-link').value`);
            is(`${name} join link`, /\/campaigns\/join\/[a-f0-9]{10}$/.test(link), true);
            errs('DM campaign page');

            // a player joins by link and adds theirs
            await as('pl');
            await go(link);
            is(`${name} join page names the campaign`, await text('h1'), 'Curse of the Crown');
            await click('[data-act=join]');
            is(`${name} joined`, await ev(`location.pathname.split('/')[2] || null`), id);
            await ev(`document.querySelector('#cp-chars [value=lock]').checked = true`);
            await click('#cp-chars .btn.primary');
            is(`${name} party of two`, await cards(), ['Brannoc', 'Lock']);
            is(`${name} player opens only their own sheet`, await ev(`JSON.stringify([...document.querySelectorAll('.cp-grid .ch-card a.btn')].map((a) => a.getAttribute('href')))`), '["/characters/lock"]');
            is(`${name} player has no DM tools`, await ev(`!document.querySelector('#cp-link, #cp-rename, [data-act=remove]')`), true);
            await go(link);
            is(`${name} join link again goes straight in`, await ev(`location.pathname.split('/')[2] || null`), id);
            await go(BASE + '/campaigns/');
            is(`${name} listed for the player`, await text('.hub-card b'), 'Curse of the Crown');
            errs('player');

            // a stranger sees nothing of it
            await as('st');
            await go(BASE + '/campaigns/' + id);
            is(`${name} stranger gets not found`, await text('h1'), 'Campaign not found');
            is(`${name} nothing leaks to a stranger`, await ev(`document.documentElement.outerHTML.includes('Lock') || document.documentElement.outerHTML.includes('Curse')`), false);
            await go(BASE + '/characters/lock');
            is(`${name} stranger can't open the sheet`, await text('#hb-sheet h2'), 'Character not found');

            // the DM opens the player's sheet read-only; a new link stops the old one; the DM removes the player
            await as('dm');
            await go(BASE + '/characters/lock');
            is(`${name} DM sees the sheet`, await text('.hb-roname'), 'Lock');
            is(`${name} DM's view is read-only`, await ev(`[...document.querySelectorAll('#hb-sheet input')].every((i) => i.disabled)`), true);
            is(`${name} DM's browser keeps no copy`, await ev(`!!JSON.parse(localStorage.getItem('hb-sheet') || '{"chars":{}}').chars.lock`), false);
            errs('DM read-only sheet');
            await go(BASE + '/campaigns/' + id);
            is(`${name} campaign opens at /campaigns/<id>`, await ev(`location.pathname`), '/campaigns/' + id);
            // old ?c=<id> links redirect (301) to it; the list and the join page still work
            const old = await fetch(BASE + '/campaigns/?c=' + id, { redirect: 'manual' });
            is(`${name} old ?c= link is a 301`, [old.status, old.headers.get('location')], [301, '/campaigns/' + id]);
            await go(BASE + '/campaigns/?c=' + id);
            is(`${name} old ?c= link lands on the new URL`, await ev(`location.pathname + location.search`), '/campaigns/' + id);
            is(`${name} no link on the page uses ?c=<id>`, await ev(`[...document.querySelectorAll('a[href]')].some((a) => /campaigns\\/\\?c=[^&]*$/.test(a.getAttribute('href')))`), false);
            await go(BASE + '/campaigns/');
            is(`${name} list links use /campaigns/<id>`, await ev(`document.querySelector('.hub-card')?.getAttribute('href')`), '/campaigns/' + id);
            await go(BASE + '/campaigns/' + id);
            await click('[data-act=code]');
            is(`${name} new link`, (await ev(`document.querySelector('#cp-link').value`)) !== link, true);
            await go(link);
            is(`${name} old link stops working`, await text('h1'), "This link doesn't work");
            await go(BASE + '/campaigns/' + id);
            await click('[data-act=remove]', 'ask');
            is(`${name} remove asks first`, await ev(`document.querySelector('#cp-ask').open`), true);
            await click('#cp-ask-yes');
            is(`${name} player removed with their character`, await cards(), ['Brannoc']);
            await ev(`(() => { const f = document.querySelector('#cp-rename [name=name]'); f.value = 'The Crown'; })()`);
            await click('#cp-rename [type=submit]');
            is(`${name} renamed`, await text('h1'), 'The Crown');
            await click('[data-act=delete]', 'ask');
            await click('#cp-ask-yes');
            is(`${name} deleted, back to the list`, await ev(`location.pathname + location.search`), '/campaigns/');
            errs('DM tools');
        } finally { b.close(); }
    }
} finally { server.kill(); rmSync(TMP, { recursive: true, force: true }); }
console.log(bad ? `${bad} check(s) failed` : 'campaigns page ok');
process.exit(bad ? 1 : 0);
