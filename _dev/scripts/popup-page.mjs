// Checks the Compendium popup (ROADMAP 5.4) signed out, in headless Chrome and Firefox: the corner button on a page and on the sheets,
// nothing of the Compendium loading before the first open, the panel (embed mode, no header or footer), the search kept over a reload,
// it staying open on the next page and a link click keeping it open while a click on the page closes it, Esc and Ctrl+K, the saved width,
// the phone's full-screen overlay, "Add to sheet" from a character's sheet with no picker, and the pages that must not have it.
// Also: New / Edit / Copy to homebrew in the panel opening the full page with the form already open, "Add to encounter" reaching the Monster
// Sheet's shown encounter (needs internet for the SRD proxy), real key input for Ctrl+K / Esc and a real mouse drag of the edge, and signed in:
// the setting reaching the account, a new browser getting it (one reload, no loop, the panel still open) and the newest change winning.
// (Map shortcuts being off while it is open are in maps-page.mjs, which has the map.)
//   node _dev/scripts/popup-page.mjs      (needs includes/config.php for sign-in)
// Starts its own server (port 8142 + CHECK_PORT_SHIFT) with stand-in account and session folders in the temp folder. Cloud saves and backups are blocked.
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { launch, browsers, serving } from './browser.mjs';

const ROOT = join(import.meta.dirname, '../..'), PORT = 8142 + (+process.env.CHECK_PORT_SHIFT || 0), BASE = `http://localhost:${PORT}`;
const PHP = process.env.PHP || (process.platform === 'win32' ? 'C:/php/php.exe' : 'php');
const TMP = join(tmpdir(), 'dnd-popup-check' + (process.env.CHECK_PORT_SHIFT || '')), ACCOUNTS = join(TMP, 'accounts'), SESSIONS = join(TMP, 'sessions');
const ser = (o) => `a:${Object.keys(o).length}:{` + Object.entries(o).map(([k, v]) => `s:${Buffer.byteLength(k)}:"${k}";s:${Buffer.byteLength(v)}:"${v}";`).join('') + '}';
const SID = 'popupcheck0000000000000000000000000';
rmSync(TMP, { recursive: true, force: true });
mkdirSync(SESSIONS, { recursive: true });
writeFileSync(join(SESSIONS, 'sess_' + SID), 'user|' + ser({ sub: '111', email: 'me@example.com', name: 'Me' }));
const web = spawn(PHP, ['-S', `127.0.0.1:${PORT}`, '-t', ROOT, join(ROOT, '_dev/router.php')], { stdio: 'ignore', env: { ...process.env, DND_ACCOUNTS: ACCOUNTS, DND_SESSIONS: SESSIONS, DND_BACKUPS: join(TMP, 'backups'), DND_MONSTER_BACKUPS: join(TMP, 'monster-backups') } });
await serving(BASE + '/privacy/');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
const is = (name, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) { bad++; console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); } };
const ok = (name, cond, got = '') => { if (!cond) { bad++; console.log(`FAIL ${name} ${JSON.stringify(got)}`); } };

for (const name of browsers) {
    const b = await launch(name), ev = b.ev;
    const until = async (expr, what, ms = 20000) => { for (const t = Date.now(); Date.now() - t < ms;) { if (await ev(`!!(${expr})`)) return true; await sleep(100); } bad++; console.log(`FAIL ${name} timed out: ${what}`); return false; };
    // inside the frame, as d
    const F = (expr) => `(() => { const d = document.querySelector('.cpp iframe')?.contentDocument; return d && (${expr}); })()`;
    const state = async () => JSON.parse(await ev(`localStorage.getItem('compendium-popup')`));
    const key = (init) => ev(`window.dispatchEvent(new KeyboardEvent('keydown', Object.assign({ bubbles: true, cancelable: true }, ${JSON.stringify(init)})))`);
    const down = (sel) => ev(`document.querySelector(${JSON.stringify(sel)}).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }))`);
    const opened = () => ev(`document.querySelector('.cpp')?.classList.contains('open') === true`);
    const searchFor = async (q) => {
        await ev(`(() => { const d = document.querySelector('.cpp iframe').contentDocument, i = d.getElementById('cp-q'); i.value = ${JSON.stringify(q)}; i.dispatchEvent(new Event('input')); })()`);
        await until(F(`[...d.querySelectorAll('#cp-list .cp-name')].some((x) => x.textContent === ${JSON.stringify(q)})`), q + ' found');
        await ev(`[...document.querySelector('.cpp iframe').contentDocument.querySelectorAll('#cp-list .cp-row')].find((r) => r.querySelector('.cp-name').textContent === ${JSON.stringify(q)}).click()`);
    };
    try {
        await b.block(/backup\.php|cloud\.php/);
        await b.shot(1280, 800); // the headless window is narrower than the phone breakpoint
        await b.go(BASE + '/privacy/');
        await ev(`localStorage.clear(); sessionStorage.clear(); localStorage.setItem('hb-sheet-merged', '1')`);

        // before the first open: a button, no panel, nothing of the Compendium fetched
        await b.go(BASE + '/privacy/');
        await until(`document.querySelector('.cpp-fab')`, 'button');
        is(`${name} no panel or frame yet`, await ev(`!document.querySelector('.cpp') && ![...document.querySelectorAll('iframe')].some((f) => /compendium/.test(f.src))`), true);
        is(`${name} no Compendium file fetched before the first open`, await ev(`performance.getEntriesByType('resource').some((r) => /compendium|\\/content\\/|monsters\\.json/.test(r.name))`), false);
        ok(`${name} button is bottom right`, await ev(`(() => { const r = document.querySelector('.cpp-fab').getBoundingClientRect(); return Math.abs(document.documentElement.clientWidth - r.right - 16) < 2 && r.bottom <= innerHeight - 15; })()`));

        // open with the button: embed mode, the state saved
        await ev(`document.querySelector('.cpp-fab').click()`);
        await until(`document.querySelector('.cpp.open')`, 'panel open');
        await until(F(`d.getElementById('cp-q') && d.querySelectorAll('.cp-row').length`), 'lists in the frame', 60000);
        is(`${name} embed: no header, footer or title`, await ev(F(`!d.querySelector('.site-header') && !d.querySelector('.site-footer') && !d.querySelector('h1')`)), true);
        is(`${name} embed: no popup inside the popup`, await ev(F(`!d.querySelector('.cpp-fab') && !d.querySelector('.cpp')`)), true);
        is(`${name} state saved open`, (await state()).open, true);
        ok(`${name} button hidden while open`, await ev(`document.querySelector('.cpp-fab').hidden`));
        await sleep(400);
        ok(`${name} panel on the right, default width`, await ev(`(() => { const r = document.querySelector('.cpp').getBoundingClientRect(); return Math.abs(r.right - document.documentElement.clientWidth) < 2 && Math.abs(r.width - 480) < 2; })()`));
        await searchFor('Fireball');
        await until(F(`d.querySelector('#cp-dbody h2')?.textContent === 'Fireball' && d.querySelector('[data-add=sheet]')`), 'Fireball open');

        // a reload reopens it at the same search and entry
        await b.go(BASE + '/privacy/');
        await until(`document.querySelector('.cpp.open')`, 'reopened on the next load');
        await until(F(`d.getElementById('cp-q')?.value === 'Fireball' && d.querySelector('#cp-dbody h2')?.textContent === 'Fireball'`), 'same search and entry', 60000);

        // a click on a link keeps it open, a click on the page closes it and it stays closed over a reload
        await down('.sh-logo');
        await sleep(300);
        is(`${name} link click keeps it open`, await opened(), true);
        await down('main');
        await until(`!document.querySelector('.cpp.open')`, 'page click closes');
        is(`${name} state saved closed`, (await state()).open, false);
        await b.go(BASE + '/privacy/');
        await until(`document.querySelector('.cpp-fab')`, 'button again');
        is(`${name} stays closed on the next page`, await ev(`!document.querySelector('.cpp')`), true);

        // keys: Ctrl+K opens, Esc closes; the page's own keys are off while it's open
        await key({ key: 'k', ctrlKey: true });
        await until(`document.querySelector('.cpp.open')`, 'Ctrl+K opens');
        await ev(`window.__keys = 0; addEventListener('keydown', () => window.__keys++)`);
        await key({ key: 'Backspace' });
        is(`${name} page keys off while open`, await ev(`window.__keys`), 0);
        await key({ key: 'Escape' });
        await until(`!document.querySelector('.cpp.open')`, 'Esc closes');
        await key({ key: 'k', ctrlKey: true });
        await until(`document.querySelector('.cpp.open')`, 'Ctrl+K opens again');
        await ev(`document.querySelector('.cpp-x').click()`);
        await until(`!document.querySelector('.cpp.open')`, 'x closes');
        await key({ key: 'Backspace' });
        is(`${name} page keys on again when closed`, await ev(`window.__keys`), 1);

        // the saved width, and the edge that resizes
        await ev(`localStorage.setItem('compendium-popup', JSON.stringify({ open: true, w: 600 }))`);
        await b.go(BASE + '/privacy/');
        await until(`document.querySelector('.cpp.open')`, 'reopened at 600');
        await sleep(500);
        is(`${name} saved width used`, await ev(`Math.round(document.querySelector('.cpp').getBoundingClientRect().width)`), 600);
        await ev(`(() => { const e = document.querySelector('.cpp-edge'); e.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: document.documentElement.clientWidth - 600 })); dispatchEvent(new PointerEvent('pointermove', { clientX: document.documentElement.clientWidth - 700 })); dispatchEvent(new PointerEvent('pointerup', {})); })()`);
        is(`${name} edge drag resizes and saves`, [await ev(`Math.round(document.querySelector('.cpp').getBoundingClientRect().width)`), (await state()).w], [700, 700]);

        // a phone: the whole screen, the x top left, no click-off
        await b.shot(375, 800);
        await b.go(BASE + '/privacy/');
        await until(`document.querySelector('.cpp.open')`, 'phone open');
        await sleep(500);
        ok(`${name} phone: full screen, x top left`, await ev(`(() => { const r = document.querySelector('.cpp').getBoundingClientRect(), x = document.querySelector('.cpp-x').getBoundingClientRect(); return r.width === document.documentElement.clientWidth && r.top === 0 && r.left === 0 && Math.abs(r.height - innerHeight) < 2 && x.left < 60 && x.top < 60 && x.width >= 44; })()`));
        ok(`${name} phone: the frame is one column`, await ev(F(`d.documentElement.clientWidth <= 375 && !d.querySelector('.site-header')`)));
        await down('main');
        await sleep(200);
        is(`${name} phone: a page click doesn't close it`, await opened(), true);
        await ev(`document.querySelector('.cpp-x').click()`);
        await until(`!document.querySelector('.cpp.open')`, 'phone x closes');
        await b.shot(1280, 800);

        // the sheet: a button, and Add to sheet with no picker
        await ev(`localStorage.setItem('compendium-popup', JSON.stringify({ open: false, w: 480 }))`);
        await b.go(BASE + '/characters/new');
        await until(`Object.keys(JSON.parse(localStorage.getItem('hb-sheet') || '{"chars":{}}').chars).length === 1`, 'new character');
        await until(`document.querySelector('.cpp-fab') && window.cpContext`, 'button and context on the sheet');
        const id = await ev(`Object.keys(JSON.parse(localStorage.getItem('hb-sheet')).chars)[0]`);
        is(`${name} the sheet says which character`, await ev(`window.cpContext().char`), id);
        await ev(`document.querySelector('.cpp-fab').click()`);
        await until(F(`d.getElementById('cp-q') && d.querySelectorAll('.cp-row').length`), 'frame on the sheet', 60000);
        await searchFor('Fireball');
        await until(F(`d.querySelector('[data-add=sheet]')`), 'add button');
        await ev(`document.querySelector('.cpp iframe').contentDocument.querySelector('[data-add=sheet]').click()`);
        await until(`JSON.parse(localStorage.getItem('hb-sheet')).chars['${id}'].panels.some((p) => p.type === 'spells' && p.rows.some((r) => r.name === 'Fireball'))`, 'Fireball on the sheet');
        is(`${name} no character picker`, await ev(F(`!d.querySelector('#cp-pick[open]')`)), true);
        is(`${name} still open after adding`, await opened(), true);
        is(`${name} request taken, not left queued`, await ev(`localStorage.getItem('hb-pending')`), null);

        // the monster sheet: the encounter picker is gone
        await b.go(BASE + '/sheets/monster/');
        await until(`document.querySelector('.cpp-fab') && window.cpContext`, 'button and context on the monster sheet');
        await ev(`localStorage.setItem('compendium-popup', JSON.stringify({ open: false, w: 480 }))`);
        await ev(`document.querySelector('.cpp-fab').click()`);
        await until(F(`d.getElementById('cp-q') && d.querySelectorAll('.cp-row').length`), 'frame on the monster sheet', 60000);
        await ev(F(`d.querySelector('#cp-tabs [data-tab=monster]').click()`));
        await searchFor('Goblin');
        await until(F(`d.querySelector('[data-add=enc]')`), 'add to encounter button');
        is(`${name} no encounter picker on the monster sheet`, await ev(F(`!d.getElementById('cp-enc')`)), true);

        // homebrew from the panel: the full page opens in a new tab with the form already open
        const J = JSON.stringify;
        const stubOpen = () => ev(`(() => { window.__opened = ''; document.querySelector('.cpp iframe').contentWindow.open = (u) => { window.__opened = u; }; })()`);
        const openPanel = async () => {
            await ev(`localStorage.setItem('compendium-popup', ${J(J({ open: true, w: 480 }))})`);
            await b.go(BASE + '/privacy/');
            await until(F(`d.getElementById('cp-q') && d.querySelectorAll('.cp-row').length`), 'frame ready', 60000);
        };
        const inTab = (t) => ev(F(`d.querySelector('#cp-tabs [data-tab=${t}]').click()`));
        const formOpen = `!!document.querySelector('#cp-hb[open], #cp-hbw[open]')`;
        await openPanel();
        await inTab('rule');
        await until(F(`!d.getElementById('cp-new').hidden`), 'New visible');
        await stubOpen();
        await ev(F(`d.getElementById('cp-new').click()`));
        let url = await ev(`window.__opened`);
        ok(`${name} New opens the full page with act=new:rule`, /^\/compendium\/\?.*act=new%3Arule/.test(url), url);
        await b.go(BASE + url);
        await until(formOpen, 'New form open on the full page');
        await ev(`(() => { const f = document.querySelector('#cp-hb-form'); f.elements.name.value = 'Popup rule'; f.elements.text.value = 'Made from the popup'; f.requestSubmit(); })()`);
        await until(`(localStorage.getItem('homebrew') || '').includes('Popup rule')`, 'house rule saved');
        const hbId = await ev(`Object.keys(JSON.parse(localStorage.getItem('homebrew')))[0]`);
        await openPanel();
        await inTab('rule');
        await searchFor('Popup rule');
        await until(F(`d.querySelector('[data-hb-edit]')`), 'Edit button');
        await stubOpen();
        await ev(F(`d.querySelector('[data-hb-edit]').click()`));
        url = await ev(`window.__opened`);
        ok(`${name} Edit opens the full page with act=edit`, url.includes('act=edit%3Arule%3A' + hbId), url);
        await b.go(BASE + url);
        await until(formOpen, 'Edit form open on the full page');
        is(`${name} the form holds the entry`, await ev(`document.querySelector('#cp-hb-form').elements.name.value`), 'Popup rule');
        await openPanel();
        await inTab('spell');
        await searchFor('Fireball');
        await until(F(`d.querySelector('[data-hb-copy]')`), 'Copy button');
        await stubOpen();
        await ev(F(`d.querySelector('[data-hb-copy]').click()`));
        url = await ev(`window.__opened`);
        ok(`${name} Copy opens the full page with act=copy`, url.includes('act=copy%3Aspell%3A'), url);
        await b.go(BASE + url);
        await until(formOpen, 'Copy form open on the full page');
        await openPanel();
        await inTab('monster');
        await searchFor('Goblin');
        await until(F(`d.querySelector('[data-hb-copy]')`), 'monster Copy button');
        await stubOpen();
        await ev(F(`d.querySelector('[data-hb-copy]').click()`));
        url = await ev(`window.__opened`);
        ok(`${name} a monster's Copy opens the Monster Sheet's own route`, url.startsWith('/sheets/monster/?hb=key'), url);

        // Add to encounter reaches the Monster Sheet's shown encounter
        await ev(`localStorage.removeItem('monster-sheet')`);
        await b.go(BASE + '/sheets/monster/');
        await until(`document.querySelector('.mon-encside')`, 'encounter picker');
        await ev(`(() => { const s = document.querySelector('.mon-encside'); s.value = '+new'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
        await until(`document.querySelector('#mon-encdlg[open]') && document.activeElement.tagName === 'INPUT'`, 'new encounter dialog');
        await ev(`(() => { const f = document.activeElement; f.value = 'Ambush'; f.dispatchEvent(new Event('input', { bubbles: true })); })()`);
        await ev(`document.querySelector('#mon-encdlg [data-enc=close]').click()`);
        await until(`document.querySelector('.mon-encside').selectedOptions[0].textContent === 'Ambush'`, 'Ambush shown');
        const amb = await ev(`JSON.parse(localStorage.getItem('monster-sheet')).encs.find((e) => e.name === 'Ambush').id`);
        is(`${name} the sheet says which encounter`, await ev(`window.cpContext().enc`), amb);
        await ev(`localStorage.setItem('compendium-popup', ${J(J({ open: false, w: 480 }))})`);
        await ev(`document.querySelector('.cpp-fab').click()`);
        await until(F(`d.getElementById('cp-q') && d.querySelectorAll('.cp-row').length`), 'frame on the monster sheet', 60000);
        await inTab('monster');
        await searchFor('Goblin');
        await until(F(`d.querySelector('[data-add=enc]')`), 'add to encounter button');
        is(`${name} no encounter picker`, await ev(F(`!d.getElementById('cp-enc')`)), true);
        await ev(F(`d.querySelector('[data-add=enc]').click()`));
        ok(`${name} the goblin lands in the shown encounter`, await until(`Object.values(JSON.parse(localStorage.getItem('monster-sheet')).chars || {}).some((c) => /^Goblin/.test(c.name) && c.enc === ${J(amb)})`, 'goblin in Ambush', 60000));
        is(`${name} mon-pending taken`, await ev(`JSON.stringify(JSON.parse(localStorage.getItem('mon-pending') || '[]'))`), '[]');

        // real key input: Ctrl+K from the page and from inside the frame, Esc, and a real mouse drag of the edge
        await ev(`localStorage.setItem('compendium-popup', ${J(J({ open: false, w: 480 }))}); sessionStorage.removeItem('cp-popup-url')`); // no entry open in the frame: it would take the cursor
        await b.go(BASE + '/privacy/');
        await until(`document.querySelector('.cpp-fab')`, 'button');
        await b.key('Control', 'k');
        ok(`${name} real Ctrl+K opens it`, await until(`document.querySelector('.cpp.open')`, 'real Ctrl+K opens'));
        await until(F(`d.getElementById('cp-q') && d.activeElement === d.getElementById('cp-q')`), 'the search has the cursor', 60000);
        await b.key('Control', 'k');
        ok(`${name} real Ctrl+K inside the frame closes it`, await until(`!document.querySelector('.cpp.open')`, 'real Ctrl+K closes'));
        await b.key('Control', 'k');
        await until(`document.querySelector('.cpp.open')`, 'opens again');
        await until(F(`d.activeElement === d.getElementById('cp-q')`), 'cursor again');
        await b.key('Escape');
        ok(`${name} real Esc in the frame closes it`, await until(`!document.querySelector('.cpp.open')`, 'real Esc closes'));
        await b.key('Control', 'k');
        await until(`document.querySelector('.cpp.open')`, 'open for the drag');
        await sleep(500);
        const eg = JSON.parse(await ev(`JSON.stringify(document.querySelector('.cpp-edge').getBoundingClientRect())`));
        const ex = eg.left + eg.width / 2, ey = 300;
        await b.drag([[ex, ey], [ex - 40, ey], [ex - 80, ey], [ex - 120, ey]]);
        const dw = await ev(`Math.round(document.querySelector('.cpp').getBoundingClientRect().width)`);
        ok(`${name} a real drag of the edge widens it by about 120`, Math.abs(dw - 600) <= 6, dw);
        is(`${name} the dragged width is saved`, Math.abs((await state()).w - dw) <= 1, true);

        // signed in: the setting reaches the account, a new browser gets it (one reload, no loop, still open), the newest change wins
        rmSync(join(ACCOUNTS, 'prefs'), { recursive: true, force: true });
        const prefs = () => { try { return JSON.parse(readFileSync(join(ACCOUNTS, 'prefs', '111.json'), 'utf8'))['compendium-popup']; } catch { return null; } };
        const untilPrefs = async (fn, what) => { for (const t = Date.now(); Date.now() - t < 10000;) { const v = prefs(); if (v && fn(JSON.parse(v.value))) return true; await sleep(200); } bad++; console.log(`FAIL ${name} timed out: ${what}`); return false; };
        const A = await launch(name);
        try {
            await A.block(/backup\.php|cloud\.php/); await A.shot(1280, 800);
            await A.go(BASE + '/privacy/'); await A.ev(`localStorage.clear(); sessionStorage.clear(); document.cookie = 'dndsid=${SID}; path=/'`);
            await A.go(BASE + '/privacy/');
            await A.until(`document.querySelector('.cpp-fab')`);
            await A.ev(`document.querySelector('.cpp-fab').click()`);
            await A.until(`document.querySelector('.cpp.open')`);
            await sleep(500);
            const ag = JSON.parse(await A.ev(`JSON.stringify(document.querySelector('.cpp-edge').getBoundingClientRect())`));
            const ax = ag.left + ag.width / 2;
            await A.drag([[ax, 300], [ax - 60, 300], [ax - 120, 300]]);
            await untilPrefs((v) => v.open === true && v.w >= 560, 'the account holds the open panel and its width');
            const wA = (prefs() ? JSON.parse(prefs().value) : {}).w;
            const B = await launch(name);
            try {
                await B.block(/backup\.php|cloud\.php/); await B.shot(1280, 800);
                await B.go(BASE + '/privacy/'); await B.ev(`localStorage.clear(); sessionStorage.clear(); document.cookie = 'dndsid=${SID}; path=/'`);
                await B.go(BASE + '/privacy/');
                await B.until(`document.querySelector('.cpp.open')`, 20000);
                await sleep(1500);
                is(`${name} a new browser: open at the saved width after the one reload`, [await B.ev(`Math.round(document.querySelector('.cpp').getBoundingClientRect().width)`), await B.ev(`sessionStorage.getItem('prefs-reloaded')`)], [wA, '1']);
                const t0 = await B.ev(`performance.timeOrigin`);
                await sleep(3500);
                is(`${name} no reload loop`, [await B.ev(`performance.timeOrigin`), await B.ev(`document.querySelectorAll('.cpp').length`)], [t0, 1]);
                await B.ev(`document.querySelector('.cpp-x').click()`);
                await untilPrefs((v) => v.open === false, 'closing in the second browser reaches the account');
                await A.go(BASE + '/privacy/');
                await sleep(2500);
                is(`${name} the first browser follows the newer change: closed`, await A.ev(`!!document.querySelector('.cpp-fab') && !document.querySelector('.cpp.open')`), true);
            } finally { B.close(); }
            const errsA = A.errors.filter((e) => !/backup\.php|cloud\.php/.test(e));
            ok(`${name} signed in: no console errors`, !errsA.length, errsA);
        } finally { A.close(); }

        // the Compendium page itself has no popup
        await ev(`localStorage.setItem('compendium-popup', JSON.stringify({ open: true, w: 480 }))`);
        await b.go(BASE + '/compendium/');
        await sleep(800);
        is(`${name} none on /compendium/`, await ev(`!document.querySelector('.cpp-fab') && !document.querySelector('.cpp')`), true);
        const errors = b.errors.filter((e) => !/backup\.php|cloud\.php/.test(e));
        ok(`${name} no console errors`, !errors.length, errors);
    } catch (e) { bad++; console.log(`FAIL ${name}: ${e.message}`); } finally { b.close(); }
}
web.kill(); rmSync(TMP, { recursive: true, force: true });
console.log(bad ? `${bad} failed` : 'popup page ok');
process.exit(bad ? 1 : 0);
