// Checks My Characters (/characters/ and /characters/<id>) signed out, in headless Chrome and Firefox: the cards, search,
// sort, archive (no delete: ROADMAP 0.5) with Undo and the Archived section, opening and editing one character, an archived
// one read-only with Unarchive, Create, and an unknown id.
//   node _dev/scripts/characters-page.mjs [base URL, default http://localhost:8110]
// Needs the local server with the router (php -S 127.0.0.1:8110 -t . _dev/router.php). Cloud saves and backups are blocked.
// Start that server with DND_ACCOUNTS=<this script's temp folder, printed below> to check public and private characters too:
// the script writes two stand-in characters there, never in private/dnd/accounts.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { launch, browsers } from './browser.mjs';

const BASE = process.argv[2] || 'http://localhost:8110';
const ACCOUNTS = process.env.DND_ACCOUNTS ? join(tmpdir(), 'dnd-accounts-check' + (process.env.CHECK_PORT_SHIFT || '')) : '';
if (ACCOUNTS) for (const [id, name, visibility] of [['pub1', 'Glory', 'public'], ['priv1', 'Secret', 'private']]) {
    mkdirSync(join(ACCOUNTS, 'characters', id), { recursive: true });
    writeFileSync(join(ACCOUNTS, 'characters', id, 'meta.json'), JSON.stringify({ owner: '999', visibility, created: 1, campaigns: [] }));
    writeFileSync(join(ACCOUNTS, 'characters', id, 'character.json'), JSON.stringify({ id, name, race: 'Tiefling', updated: 5, art: '', classes: [{ name: 'Warlock', level: 4, die: 8, hdUsed: 0 }], abilities: [] }));
}
// the sheet has drawn (a character, or "Character not found")
const SHEET = `document.querySelector('#hb-sheet')?.childElementCount`;
const char = (id, name, race, cls, level, updated) => ({ id, name, race, updated, art: '', classes: [{ name: cls, level, die: 8, hdUsed: 0 }], abilities: [] });
const db = { cur: 'aaa', chars: { aaa: char('aaa', 'Lock', 'Tabaxi', 'Barbarian', 4, 300), bbb: char('bbb', 'Jo', 'Changeling', 'Monk', 3, 200), ccc: char('ccc', '', '', '', 1, 0) } };

let bad = 0;
const is = (name, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) { bad++; console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); } };
for (const name of browsers) {
    const b = await launch(name), ev = b.ev;
    // (Google's sign-in frame's report-only CSP notice is left out by browser.mjs)
    const errs = (where) => { const e = b.errors.filter((x) => !/backup\.php|cloud\.php/.test(x)); if (e.length) { bad++; console.log(`FAIL ${name} ${where}: ${e.join(' | ').slice(0, 600)}`); } };
    const store = async () => JSON.parse(await ev(`localStorage.getItem('hb-sheet')`));
    const cards = () => ev(`JSON.stringify([...document.querySelectorAll('.ch-card b')].map((b) => b.textContent))`).then(JSON.parse);
    try {
        await b.block(/backup\.php|cloud\.php/);
        await b.go(BASE + '/privacy/');
        await ev(`localStorage.clear(); localStorage.setItem('hb-sheet-merged', '1'); localStorage.setItem('hb-sheet', ${JSON.stringify(JSON.stringify(db))})`);

        await b.go(BASE + '/characters/'); await b.until(`document.querySelectorAll('.ch-card').length`);
        is(`${name} untouched blank hidden, oldest first`, await cards(), ['Lock', 'Jo']);
        is(`${name} count`, await ev(`document.querySelector('#ch-count').textContent`), '2 characters');
        is(`${name} level line`, await ev(`document.querySelector('.ch-card small').textContent`), 'Level 4 | Tabaxi | Barbarian');
        await ev(`(() => { const q = document.querySelector('#ch-q'); q.value = 'monk'; q.dispatchEvent(new Event('input')); })()`);
        is(`${name} search`, await cards(), ['Jo']);
        await ev(`(() => { const q = document.querySelector('#ch-q'); q.value = ''; q.dispatchEvent(new Event('input')); const s = document.querySelector('#ch-sort'); s.value = 'name'; s.dispatchEvent(new Event('change')); })()`);
        is(`${name} sort by name`, await cards(), ['Jo', 'Lock']);
        is(`${name} no Delete anywhere`, await ev(`!/Delete/.test(document.querySelector('#main').textContent)`), true);
        is(`${name} no Archived section yet`, await ev(`document.querySelector('#ch-arc').hidden`), true);
        await ev(`document.querySelector('[data-act=arc][data-id=bbb]').click()`);
        const arcd = (await store()).chars.bbb;
        is(`${name} archived, nothing else changed`, [arcd.archived > 0, { ...arcd, archived: 0, updated: 0 }], [true, { ...db.chars.bbb, archived: 0, updated: 0 }]);
        is(`${name} archived leaves the grid`, await ev(`JSON.stringify([...document.querySelectorAll('#ch-grid .ch-card b')].map((b) => b.textContent))`).then(JSON.parse), ['Lock']);
        is(`${name} count leaves out archived`, await ev(`document.querySelector('#ch-count').textContent`), '1 character');
        is(`${name} Archived section, folded`, await ev(`[!document.querySelector('#ch-arc').hidden, document.querySelector('#ch-arc').open, document.querySelector('#ch-arc summary').textContent.replace(/\s+/g, ' ').trim()].join()`), 'true,false,Archived (1)');
        await ev(`[...document.querySelectorAll('.hb-undo button')].pop().click()`);
        is(`${name} undo unarchives`, [(await store()).chars.bbb.archived, await ev(`document.querySelector('#ch-arc').hidden`)], [0, true]);
        await ev(`document.querySelector('[data-act=arc][data-id=bbb]').click()`);
        await ev(`document.querySelector('[data-act=unarc][data-id=bbb]').click()`);
        is(`${name} unarchive`, [(await store()).chars.bbb.archived, (await cards()).length], [0, 2]);
        await ev(`document.querySelector('[data-act=arc][data-id=bbb]').click()`);
        is(`${name} others untouched`, (await store()).chars.aaa, db.chars.aaa);
        errs('/characters/');

        // an archived character opens read-only, with Unarchive; rolls work but aren't saved
        await b.go(BASE + '/characters/bbb'); await b.until(SHEET);
        is(`${name} archived opens read-only`, await ev(`[!!document.querySelector('.hb-arcnote'), [...document.querySelectorAll('#hb-sheet input')].every((i) => i.disabled), !document.querySelector('[data-act=custom]')].join()`), 'true,true,true');
        const before = (await store()).chars.bbb;
        const landed = () => b.until(`document.querySelector('.hb-rollcard')`);
        await ev(`document.querySelector('[data-act=roll]')?.click()`); await landed();
        is(`${name} archived roll not saved`, (await store()).chars.bbb, before);
        await ev(`document.querySelectorAll('.hb-rollcard').forEach((c) => c.remove())`);
        // a roll made while archived is never logged, even when Unarchive comes before its dice land
        await ev(`document.querySelector('[data-act=roll]')?.click(); document.querySelector('[data-act=unarchive]').click()`); await landed();
        const un = (await store()).chars.bbb;
        is(`${name} unarchived on the sheet`, [un.archived, un.name, (un.rolls || []).length, await ev(`[...document.querySelectorAll('#hb-sheet input')].some((i) => !i.disabled)`)], [0, before.name, (before.rolls || []).length, true]);
        errs('/characters/bbb');

        await b.go(BASE + '/characters/aaa'); await b.until(SHEET);
        is(`${name} opens the character`, await ev(`document.querySelector('[data-k=name]').value`), 'Lock');
        is(`${name} no picker, a link back`, await ev(`!document.querySelector('.hb-pick') && !!document.querySelector('#hb-barin a[href="/characters/"]')`), true);
        await ev(`(() => { const f = document.querySelector('[data-k=name]'); f.value = 'Lock the Bold'; f.dispatchEvent(new Event('input', { bubbles: true })); })()`);
        await b.until(`JSON.parse(localStorage.getItem('hb-sheet')).chars.aaa.name === 'Lock the Bold'`).catch(() => { });
        is(`${name} edit saved`, (await store()).chars.aaa.name, 'Lock the Bold');
        errs('/characters/aaa');

        await b.go(BASE + '/characters/new'); await b.until(SHEET);
        const id = (await ev('location.pathname')).split('/').pop();
        is(`${name} create gets its own url`, id !== 'new' && !!(await store()).chars[id], true);
        errs('/characters/new');

        await b.go(BASE + '/characters/zzz'); await b.until(SHEET);
        is(`${name} unknown id`, await ev(`document.querySelector('#hb-sheet h2')?.textContent`), 'Character not found');
        errs('/characters/zzz');

        // a public character owned by someone else: shown read-only, nothing saved in this browser
        if (ACCOUNTS) {
            await b.go(BASE + '/characters/pub1'); await b.until(SHEET);
            is(`${name} public shows the name`, await ev(`document.querySelector('.hb-roname')?.textContent`), 'Glory');
            is(`${name} public is read-only`, await ev(`[...document.querySelectorAll('#hb-sheet input')].every((i) => i.disabled) && !document.querySelector('[data-act=custom]')`), true);
            is(`${name} public not stored`, !!(await store()).chars.pub1, false);
            is(`${name} public stays out of search engines`, await ev(`fetch(location.href).then((r) => r.headers.get('x-robots-tag'))`), 'noindex');
            errs('/characters/pub1');
            await b.go(BASE + '/characters/priv1'); await b.until(SHEET);
            is(`${name} private stays hidden`, await ev(`document.querySelector('#hb-sheet h2')?.textContent`), 'Character not found');
            is(`${name} private not in the page`, await ev(`document.documentElement.outerHTML.includes('Secret')`), false);
        }
    } finally { b.close(); }
}
console.log(bad ? `${bad} check(s) failed` : 'characters page ok');
process.exit(bad ? 1 : 0);
