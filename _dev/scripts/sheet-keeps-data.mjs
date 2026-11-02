// Checks that a sheet update never loses player data. Real saved characters (the newest version of each in
// private/dnd/backups/ and monster-backups/, server-only data that stays on this PC) are loaded into the sheet, and every character is
// opened once. Then:
//   node _dev/scripts/sheet-keeps-data.mjs <new> <old>   everything the old code keeps, the new code must keep too
//   node _dev/scripts/sheet-keeps-data.mjs <new>         every value in the saves must survive (strict: the sheet's
//                                                        own upgrades, like hp.max -> hp.base, show up here too)
// <new> and <old> are base URLs, e.g. http://localhost:8110 (this checkout) and http://localhost:8112 (the live
// commit in a git worktree); see CLAUDE.md. Backups and cloud saves are blocked, so nothing is written anywhere.
// Add --firefox to run it in headless Firefox instead of Chrome.
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { launch } from './browser.mjs';

const args = process.argv.slice(2), BROWSER = args.includes('--firefox') ? 'firefox' : 'chrome';
const [NEW = 'http://localhost:8110', OLD] = args.filter((a) => !a.startsWith('--'));
// newest saved version of every character in a backups folder (a renamed character has several folders with the same id)
function saves(folder) {
    const BK = join(import.meta.dirname, '../../private/dnd', folder), byId = new Map();
    if (!existsSync(BK)) return [];
    for (const ip of readdirSync(BK)) for (const name of readdirSync(join(BK, ip))) {
    const dir = join(BK, ip, name);
    const files = readdirSync(dir).filter((f) => /-\d+\.json$/.test(f)).sort((a, b) => +b.match(/-(\d+)\.json$/)[1] - +a.match(/-(\d+)\.json$/)[1]);
    if (!files[0]) continue;
    const file = join(dir, files[0]), t = statSync(file).mtimeMs, c = JSON.parse(readFileSync(file, 'utf8'));
    if (!byId.has(c.id) || byId.get(c.id).t < t) byId.set(c.id, { from: `${ip}/${name}`, c, t });
    }
    return [...byId.values()];
}

// every leaf of `old` must be in `now` unchanged; returns the paths that aren't. "updated" is the sheet's own stamp;
// comparing two code versions also skips id and created, which an upgrade makes fresh each time it runs
const IGNORE = new Set(OLD ? ['updated', 'id', 'created'] : ['updated']);
function lost(old, now, path = '') {
    if (old === null || typeof old !== 'object') return Object.is(old, now) ? [] : [`${path}: ${JSON.stringify(old)} -> ${JSON.stringify(now)}`.slice(0, 160)];
    if (now === null || typeof now !== 'object') return [`${path}: was ${Array.isArray(old) ? 'a list' : 'an object'}, now ${JSON.stringify(now)}`];
    return Object.keys(old).filter((k) => !IGNORE.has(k)).flatMap((k) => lost(old[k], now[k], path ? `${path}.${k}` : k));
}

const b = await launch(BROWSER), ev = b.ev;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
try {
    await b.block(/backup\.php|cloud\.php/);

    // the saves as one sheet's code leaves them after loading and opening each character
    async function load(base, path, key, chars) {
        // fill localStorage from a page that isn't a sheet: an open sheet saves itself over it when it unloads
        await b.go(base + '/privacy/'); await sleep(1000);
        const db = { cur: chars[0].c.id, chars: Object.fromEntries(chars.map(({ c }) => [c.id, c])) };
        await ev(`localStorage.clear(); localStorage.setItem('hb-sheet-merged', '1'); localStorage.setItem(${JSON.stringify(key)}, ${JSON.stringify(JSON.stringify(db))})`);
        // player characters open one by one at /characters/<id>, as players open them; monsters through the sheet's picker
        if (path === '/characters/') for (const { c } of chars) { await b.go(base + path + encodeURIComponent(c.id)); await sleep(1500); }
        else {
            await b.go(base + path); await sleep(2500);
            for (const { c } of chars) { await ev(`(() => { const s = document.querySelector('.hb-pick'); s.value = ${JSON.stringify(c.id)}; s.dispatchEvent(new Event('change', { bubbles: true })); })()`); await sleep(150); }
        }
        await sleep(800);
        const after = JSON.parse(await ev(`localStorage.getItem(${JSON.stringify(key)})`)).chars;
        await b.go(base + '/privacy/'); await sleep(500);
        return after;
    }

    for (const [path, key, folder] of [['/characters/', 'hb-sheet', 'backups'], ['/sheets/monster/', 'monster-sheet', 'monster-backups']]) {
        const chars = saves(folder);
        if (!chars.length) { console.log(`${path}: no saves in private/dnd/${folder}/ to check`); continue; }
        const before = OLD ? await load(OLD, path, key, chars) : Object.fromEntries(chars.map(({ c }) => [c.id, c]));
        const after = await load(NEW, path, key, chars);
        for (const { from, c } of chars) {
            const miss = !before[c.id] ? [] : after[c.id] ? lost(before[c.id], after[c.id]) : ['the whole character'];
            if (miss.length) { failed++; console.log(`FAIL ${path} ${from}: ${miss.length} value(s) changed or gone\n  ` + miss.slice(0, 8).join('\n  ')); }
        }
        console.log(`${path}: ${chars.length} saved characters checked in ${BROWSER}${OLD ? ' against ' + OLD : ''}`);
    }
} finally {
    b.close();
}
console.log(failed ? `${failed} character(s) lost data` : 'sheet keeps data ok');
process.exit(failed ? 1 : 0);
