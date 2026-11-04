// Opens every page in scope for ROADMAP 2.2 at 375, 768 and 1440 wide (dark scheme) and fails on sideways scroll or clipped text
// (text cut by overflow: hidden / an ellipsis, or sticking out of the screen with nothing to scroll it). At 375 it also fails on
// controls shorter than 44 px (phone tap targets). The player sheet, the monster sheet's phone layout and the map are exempt:
// they are only checked for sideways scroll. /design/, archived pages and the D&D Beyond viewer are not in scope.
//   node _dev/scripts/layout-ok.mjs [--shots <folder>]      (needs: cd live && npm install, and includes/config.php for sign-in)
// Runs in each browser CHECK_BROWSER names, else both. Stand-in account and session folders in the temp folder, never private/dnd/.
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn, execFileSync } from 'node:child_process';
import { launch, browsers, serving } from './browser.mjs';

const SHIFT = +process.env.CHECK_PORT_SHIFT || 0, ROOT = join(import.meta.dirname, '../..'), WEB = 8142 + SHIFT, RELAY = 8104 + SHIFT, BASE = `http://localhost:${WEB}`;
const PHP = process.env.PHP || (process.platform === 'win32' ? 'C:/php/php.exe' : 'php');
const TMP = join(tmpdir(), 'dnd-layout-check' + (process.env.CHECK_PORT_SHIFT || '')), ACCOUNTS = join(TMP, 'accounts'), SESSIONS = join(TMP, 'sessions');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ser = (o) => `a:${Object.keys(o).length}:{` + Object.entries(o).map(([k, v]) => `s:${Buffer.byteLength(k)}:"${k}";s:${Buffer.byteLength(v)}:"${v}";`).join('') + '}';
const SID = { dm: 'layoutcheckdm00000000000000000000x', no: 'layoutcheckno00000000000000000000x', pl: 'layoutcheckpl00000000000000000000x' };
const CAMP = 'bbb000000022', CODE = 'abcdef0122', J = JSON.stringify;
const SHOTS = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : null;

rmSync(TMP, { recursive: true, force: true });
mkdirSync(SESSIONS, { recursive: true });
for (const [who, sub, name] of [['dm', '111', 'Dee'], ['no', '444', 'Nell'], ['pl', '555', 'Pat']]) writeFileSync(join(SESSIONS, 'sess_' + SID[who]), 'user|' + ser({ sub, email: `${who}@example.com`, name }));
const chars = [['lock', 'Lock', 'Barbarian'], ['wiz', 'Sir Reginald Fitzwilliam-Smythe the Third', 'Wizard']];
for (const [id, name, cls] of chars) {
    mkdirSync(join(ACCOUNTS, 'characters', id), { recursive: true });
    writeFileSync(join(ACCOUNTS, 'characters', id, 'meta.json'), J({ owner: '111', visibility: 'private', created: 1, campaigns: [] }));
    writeFileSync(join(ACCOUNTS, 'characters', id, 'character.json'), J({ id, name, race: 'Human', updated: 5, art: '', view: { noAnim: true }, hp: { cur: 21, base: 21, temp: 0, mod: 0 }, classes: [{ name: cls, level: 4, die: 8, hdUsed: 0 }], abilities: [] }));
}
mkdirSync(join(ACCOUNTS, 'monsters', '111'), { recursive: true });
writeFileSync(join(ACCOUNTS, 'monsters', '111', 'gob.json'), J({ id: 'gob', name: 'Goblin', race: 'Small humanoid (goblinoid)', updated: 5, cr: '1', abilities: [], ac: '15', init: 'DEX', hp: { cur: 7, base: 7, temp: 0, mod: 0 } }));
mkdirSync(join(ACCOUNTS, 'campaigns', CAMP), { recursive: true });
writeFileSync(join(ACCOUNTS, 'campaigns', CAMP, 'campaign.json'), J({ id: CAMP, name: 'The Lost Mines of Phandelver and Beyond', dm: '111', code: CODE, created: 1, rules: { methods: ['pb', 'std'], hp: ['avg'], sp: true, weight: true, pts: Array.from({ length: 20 }, (_, i) => (i + 1) * 4), cost: [2, 3, 5, 6, 7, 9, 10, 11, 13] }, members: [
    { sub: '111', name: 'Dee', joined: 1, characters: [{ sheet: 'player', id: 'lock' }, { sheet: 'player', id: 'wiz' }] }, { sub: '555', name: 'Pat', joined: 2, characters: [] }] }));
// a 400 x 300 map on the table (GD loaded; a local Windows PHP may have it only as a DLL php.ini doesn't load)
const gd = process.platform === 'win32' ? ['-d', 'extension=gd'] : [];
execFileSync(PHP, [...gd, '-r', `require ${J(join(ROOT, 'includes/maps.php'))}; $A = ${J(ACCOUNTS)}; $c = cp_get($A, '${CAMP}');
    $f = $A . '/up.png'; $im = imagecreatetruecolor(400, 300); imagefill($im, 0, 0, imagecolorallocate($im, 90, 120, 90)); imagepng($im, $f);
    [, $m] = mp_create($A, $c, '111', 'Crypt', $f); mp_op($A, $c, '111', ['op' => 'grid', 'm' => $m['id'], 's' => 100, 'ox' => 0, 'oy' => 0]); mp_op($A, $c, '111', ['op' => 'activate', 'm' => $m['id']]);`]);

const web = spawn(PHP, [...gd, '-S', `127.0.0.1:${WEB}`, '-t', ROOT, join(ROOT, '_dev/router.php')], { stdio: 'ignore', env: { ...process.env, DND_ACCOUNTS: ACCOUNTS, DND_SESSIONS: SESSIONS, LIVE_RELAY: `127.0.0.1:${RELAY}`, LIVE_WS: `ws://localhost:${RELAY}/` } });
const relay = spawn(process.execPath, [join(ROOT, 'live/relay.js')], { stdio: 'ignore', env: { ...process.env, PORT: RELAY, AUTH_URL: `http://127.0.0.1:${WEB}/live/auth.php`, ORIGIN: BASE } });

// [label, path, who ('' signed out), kind: '' full check, 'sheet' = sideways only (always), 'phone' = sideways only when the phone layout is on], steps to run first
const ABIL = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'].map((key) => ({ key, name: key, score: 12, save: false, sb: '' }));
const MSHEET = { cur: 'g1', chars: Object.fromEntries(['g1', 'g2'].map((id, i) => [id, { id, name: 'Goblin ' + (i + 1), race: 'Small humanoid', updated: 5, cr: '1', enc: 'e1', abilities: ABIL, ac: '15', init: 'DEX', hp: { cur: 7, base: 7, temp: 0, mod: 0 } }])), encs: [{ id: 'e1', name: 'Cave', archived: 0 }] };
const SEARCH = `(() => { const q = document.querySelector('#cp-q'); q.value = 'fire'; q.dispatchEvent(new Event('input', { bubbles: true })); })()`;
const STEPS = [1, 2, 3, 4, 5, 6], FOLDS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const PAGES = [
    ['home', '/', ''], ['characters', '/characters/', ''], ['builder', '/characters/build/', ''], ['monster sheet', '/sheets/monster/', '', 'phone'],
    ['campaigns', '/campaigns/', ''], ['compendium', '/compendium/', ''], ['compendium search', '/compendium/', '', '', [SEARCH]],
    ['builder steps', '/characters/build/', '', '', STEPS.map((i) => `document.querySelectorAll('#bd-steplist button')[${i}]?.click()`)],
    ['popup open', '/dice/rolls/', '', '', [`localStorage.setItem('compendium-popup', JSON.stringify({ open: true, w: 480 })); location.reload()`]],
    ['dice sets open', '/dice/', '', '', FOLDS.map((i) => `document.querySelectorAll('.dd-fbtn')[${i}].click()`)], ['dice test', '/dice/test/', ''], ['dice sets', '/dice/', ''], ['quick rolls', '/dice/rolls/', ''],
    ['credits', '/credits/', ''], ['privacy', '/privacy/', ''],
    ['characters (signed in)', '/characters/', 'dm'], ['campaigns (signed in)', '/campaigns/', 'dm'], ['monster sheet (signed in)', '/sheets/monster/', 'dm', 'phone'],
    ['player sheet', '/characters/lock', 'dm', 'sheet'],
    ['campaign', `/campaigns/${CAMP}`, 'dm'], ['campaign rules (DM)', `/campaigns/${CAMP}#campaign`, 'dm'], ['campaign rules (player)', `/campaigns/${CAMP}#campaign`, 'pl', '', ['', `document.querySelectorAll('.cp-ptread').forEach((d) => { d.open = true; })`]],
    ['monster sheet send', '/sheets/monster/', 'dm', 'phone', [`localStorage.setItem('monster-sheet', ${J(J(MSHEET))}); location.reload()`]],
    ['join', `/campaigns/join/${CODE}`, 'no'], ['map', `/campaigns/${CAMP}/map`, 'dm', 'sheet'], ['table view', `/campaigns/${CAMP}/table`, 'dm'],
];

// runs in the page: the problems found, as strings. full: also clipped text; taps: also controls under 44 px
const SCAN = (full, taps) => `(() => {
    const out = [], de = document.documentElement, W = innerWidth;
    const name = (e) => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\\s+/).join('.') : '');
    const shown = (e) => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && !e.closest('[hidden], [inert], dialog:not([open])') && !(e.closest('details:not([open])') && !e.closest('summary')); };
    const all = [...document.body.querySelectorAll('*')].filter(shown);
    if (de.scrollWidth > W + 1) out.push('sideways scroll ' + (de.scrollWidth - W) + ' px: ' + all.filter((e) => e.getBoundingClientRect().right > W + 1).slice(0, 4).map(name).join(' '));
    if (${full}) {
        const scroller = (e) => { for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o !== 'visible') return true; } return false; };
        for (const e of all) {
            const s = getComputedStyle(e);
            if (/^(CANVAS|IMG|SVG|VIDEO|IFRAME|PATH|G|LINE|CIRCLE|RECT)$/i.test(e.tagName) || e.closest('svg') || e.clientWidth <= 2 || e.clientHeight <= 2 || e.matches('input:not([readonly])') /* an editable field scrolls its text as you type */ || e.closest('[class*="mp-"], [class*="mpt-"]')) continue; // the map's own pieces are map.css's (job 3.3)
            if (['hidden', 'clip'].includes(s.overflowX) && e.scrollWidth > e.clientWidth + 1) out.push('text cut sideways (' + (e.scrollWidth - e.clientWidth) + ' px): ' + name(e.parentElement) + ' > ' + name(e) + ' "' + e.textContent.trim().slice(0, 40) + '"');
            else if (['hidden', 'clip'].includes(s.overflowY) && e.scrollHeight > e.clientHeight + 1 && e.clientHeight > 0) out.push('text cut vertically (' + (e.scrollHeight - e.clientHeight) + ' px): ' + name(e) + ' "' + e.textContent.trim().slice(0, 40) + '"');
            const r = e.getBoundingClientRect();
            if ([...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && (r.right > W + 1 || r.left < -1) && s.position !== 'fixed' && !scroller(e)) out.push('text off the screen: ' + name(e) + ' "' + e.textContent.trim().slice(0, 40) + '"');
        }
    }
    // the Compendium button (popup.js) floats over the page: at the top and at the bottom, it must not sit on the header (scrolled to the top) or on the last lines (scrolled to the bottom)
    const fab = document.querySelector('.cpp-fab');
    if (${full} && fab && shown(fab)) for (const y of [0, 1e9]) {
        scrollTo(0, y);
        const f = fab.getBoundingClientRect();
        for (const e of all) {
            if (e === fab || fab.contains(e) || e.closest('.cpp, .cpp-fab') || (!y && !e.closest('header')) || e.closest('[class*="mp-"], [class*="mpt-"]')) continue;
            // a control by its box, other text by where its words are (a wide paragraph can be centred well clear of the button)
            const rects = e.matches('button, input, select, textarea') ? [e.getBoundingClientRect()] : [...e.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).flatMap((n) => { const g = document.createRange(); g.selectNodeContents(n); return [...g.getClientRects()]; });
            if (rects.some((r) => r.right > f.left && r.left < f.right && r.bottom > f.top && r.top < f.bottom)) out.push('under the Compendium button (scrolled ' + (y ? 'to the bottom' : 'to the top') + '): ' + name(e) + ' "' + e.textContent.trim().slice(0, 30) + '"');
        }
    }
    scrollTo(0, 0);
    if (${taps}) for (const e of all.filter((e) => e.matches('input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=file]):not([type=range]), select, textarea') && parseFloat(getComputedStyle(e).fontSize) < 16)) out.push('field text under 16 px (iPhone zooms in): ' + name(e));
    if (${taps}) for (const e of all) {
        const box = e.matches('input[type=checkbox], input[type=radio]') ? (e.closest('label') || e) : e;
        if (!box.matches || !(e.matches('button, select, textarea, summary, [role=button], .btn, input:not([type=hidden]):not([type=file]), .sh-top, .sf-links a, .crumbs a') )) continue;
        const r = box.getBoundingClientRect();
        if (r.height < 43.5 || (box.matches('button, .btn') && r.width < 43.5)) out.push('tap target ' + Math.round(r.width) + ' x ' + Math.round(r.height) + ': ' + name(box) + ' "' + (box.textContent || box.value || box.getAttribute('aria-label') || '').trim().slice(0, 30) + '"');
    }
    return JSON.stringify([...new Set(out)]);
})()`;

let bad = 0;
await serving(BASE + '/privacy/'); await serving(`http://127.0.0.1:${RELAY}/health`);
try {
    for (const name of browsers) {
        const b = await launch(name);
        try {
            await b.go(BASE + '/privacy/'); await b.ev(`localStorage.clear()`);
            for (const w of [375, 768, 1440]) {
                await b.go('about:blank'); await b.shot(w, 800); // a blank page, so the window is 800 high and not as tall as the last page
                let who = null;
                for (const [label, path, as, kind = '', steps = ['']] of PAGES) {
                    if (as !== who) { who = as; await b.go(BASE + '/privacy/'); await b.ev(`document.cookie = 'dndsid=${as ? SID[as] : ''}; path=/${as ? '' : '; max-age=0'}'`); }
                    await b.go(BASE + path);
                    await b.until(`document.readyState === 'complete' && !!document.querySelector('main, #main, body > *')`, 15000);
                    await sleep(1500);
                    const sheetOnly = kind === 'sheet' || (kind === 'phone' && (await b.ev(`document.documentElement.classList.contains('ph-on')`)));
                    for (const [n, step] of steps.entries()) {
                        if (step) { await b.ev(step); await sleep(1000); }
                        const found = JSON.parse(await b.ev(SCAN(!sheetOnly, w === 375 && !sheetOnly)));
                        if (SHOTS) { mkdirSync(SHOTS, { recursive: true }); writeFileSync(join(SHOTS, `${label.replace(/W+/g, '-')}-${n}-${name}-${w}.png`), await b.shot(w, 800)); }
                        for (const f of found) { bad++; console.log(`FAIL ${name} ${w} ${label}${step ? ' (step ' + n + ')' : ''} (${path}): ${f}`); }
                    }
                    await b.ev(`localStorage.removeItem('compendium-popup'); localStorage.removeItem('monster-sheet')`); // one page's state never reaches the next
                }
            }
        } finally { b.close(); }
    }
} finally { web.kill(); relay.kill(); }
console.log(bad ? `${bad} layout problem(s)` : 'layout ok');
process.exit(bad ? 1 : 0);
