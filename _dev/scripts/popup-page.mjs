// Checks the Compendium popup (ROADMAP 5.4) signed out, in headless Chrome and Firefox: the corner button on a page and on the sheets,
// nothing of the Compendium loading before the first open, the panel (embed mode, no header or footer), the search kept over a reload,
// it staying open on the next page and a link click keeping it open while a click on the page closes it, Esc and Ctrl+K, the saved width,
// the phone's full-screen overlay, "Add to sheet" from a character's sheet with no picker, and the pages that must not have it.
//   node _dev/scripts/popup-page.mjs [base URL, default http://localhost:8110]
// Needs the local server with the router (php -S 127.0.0.1:8110 -t . _dev/router.php). Cloud saves and backups are blocked.
import { launch, browsers } from './browser.mjs';

const BASE = process.argv[2] || 'http://localhost:8110';
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

        // the Compendium page itself has no popup
        await ev(`localStorage.setItem('compendium-popup', JSON.stringify({ open: true, w: 480 }))`);
        await b.go(BASE + '/compendium/');
        await sleep(800);
        is(`${name} none on /compendium/`, await ev(`!document.querySelector('.cpp-fab') && !document.querySelector('.cpp')`), true);
        const errors = b.errors.filter((e) => !/backup\.php|cloud\.php/.test(e));
        ok(`${name} no console errors`, !errors.length, errors);
    } catch (e) { bad++; console.log(`FAIL ${name}: ${e.message}`); } finally { b.close(); }
}
console.log(bad ? `${bad} failed` : 'popup page ok');
process.exit(bad ? 1 : 0);
