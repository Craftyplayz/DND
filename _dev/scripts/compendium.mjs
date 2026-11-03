// Checks the Compendium (/compendium/) signed out, in headless Chrome and Firefox: search (Fireball, Goblin, Bag of Holding,
// Grappled, a typo), the tabs, filters, endless scroll, deep links, the extra spells, favourites and recent surviving a reload,
// "Add to sheet" (one character, two characters, the duplicate question, the sheet taking the request once) and
// "Add to encounter" reaching the Monster Sheet.
//   node _dev/scripts/compendium.mjs [base URL, default http://localhost:8110]
// Needs the local server with the router (php -S 127.0.0.1:8110 -t . _dev/router.php) and internet (the SRD proxies).
// Cloud saves and backups are blocked.
import { launch } from './browser.mjs';

const BASE = process.argv[2] || 'http://localhost:8110';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
const is = (name, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) { bad++; console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); } };
const ok = (name, cond, got = '') => { if (!cond) { bad++; console.log(`FAIL ${name} ${JSON.stringify(got)}`); } };

for (const name of ['chrome', 'firefox']) {
    const b = await launch(name), ev = b.ev;
    const js = async (expr) => JSON.parse(await ev(`JSON.stringify(${expr})`));
    const until = async (expr, what, ms = 15000) => { for (let t = 0; t < ms; t += 200) { if (await ev(`!!(${expr})`)) return true; await sleep(200); } bad++; console.log(`FAIL ${name} timed out: ${what}`); return false; };
    const errs = (where) => { const e = b.errors.filter((x) => !/backup\.php|cloud\.php/.test(x)); if (e.length) { bad++; console.log(`FAIL ${name} ${where}: ${e.join(' | ').slice(0, 600)}`); } };
    const open = async (path) => { await b.go(BASE + path); await until(`document.querySelectorAll('.cp-row').length || document.querySelector('.err')`, path); };
    const names = () => js(`[...document.querySelectorAll('#cp-list .cp-row .cp-name')].map((x) => x.textContent)`);
    const search = async (q) => { await ev(`(() => { const i = document.querySelector('#cp-q'); i.value = ${JSON.stringify(q)}; i.dispatchEvent(new Event('input')); })()`); await sleep(400); return names(); };
    const tab = async (t) => { await ev(`document.querySelector('#cp-tabs [data-tab=${t}]').click()`); await sleep(300); };
    const store = (k) => js(`JSON.parse(localStorage.getItem(${JSON.stringify(k)}) || 'null')`);
    try {
        await b.block(/backup\.php|cloud\.php/);
        await b.go(BASE + '/privacy/');
        await ev(`localStorage.clear(); localStorage.setItem('hb-sheet-merged', '1')`);

        await open('/compendium/');
        errs('load');
        await until(`document.querySelector('#cp-count').textContent.includes('results')`, 'count');
        // all four lists in: spells, monsters, items, magic items and rules
        await until(`+document.querySelector('#cp-count').textContent.replace(/\\D/g, '') > 3400 && !document.querySelector('.err')`, 'lists loaded', 40000);
        ok(`${name} total over 3000`, +(await ev(`document.querySelector('#cp-count').textContent.replace(/\\D/g, '')`)) > 3000);
        is(`${name} All is grouped, 5 each`, await js(`[...document.querySelectorAll('#cp-list .cp-gh')].map((h) => h.textContent.split(' ')[0] + ' ' + (h.nextElementSibling ? 1 : 0))`).then((a) => a.length), 5);
        ok(`${name} no group over 5`, await ev(`document.querySelectorAll('#cp-list .cp-row').length <= 25`));
        ok(`${name} show all links`, await ev(`document.querySelectorAll('.cp-showall').length === 5`));

        // the four searches from the roadmap, plus a typo
        for (const [q, want] of [['Fireball', 'Fireball'], ['Goblin', 'Goblin'], ['Bag of Holding', 'Bag of Holding'], ['Grappled', 'Grappled'], ['firebal', 'Fireball'], ['fierball', 'Fireball'], ['gobln', 'Goblin']]) {
            ok(`${name} search ${q}`, (await search(q)).includes(want), await names());
        }
        is(`${name} exact first`, (await search('Grappled'))[0], 'Grappled');
        await search('xyzzyq');
        ok(`${name} empty state`, await ev(`document.querySelector('#cp-list .note')?.textContent.includes("Nothing found for 'xyzzyq'")`));
        await search('');

        // tabs, filters and endless scroll
        await tab('spell');
        is(`${name} spell rows start at 50`, await ev(`document.querySelectorAll('#cp-list .cp-row').length`), 50);
        const total = +(await ev(`document.querySelector('#cp-count').textContent.replace(/\\D/g, '')`));
        for (let i = 0; i < 30 && (await ev(`document.querySelectorAll('#cp-list .cp-row').length`)) < total; i++) { await ev(`document.querySelector('#cp-more').scrollIntoView()`); await sleep(300); }
        is(`${name} endless scroll reaches every spell`, await ev(`document.querySelectorAll('#cp-list .cp-row').length`), total);
        ok(`${name} extra badge`, await ev(`[...document.querySelectorAll('#cp-list .badge')].some((x) => x.textContent === 'Extra')`));
        await ev(`(() => { const s = document.querySelector('[data-f=level]'); s.value = '3'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`); await sleep(300);
        ok(`${name} level filter`, (await js(`[...document.querySelectorAll('#cp-list .cp-sub')].map((x) => x.textContent)`)).every((t) => t.startsWith('Level 3')));
        ok(`${name} filter in URL`, (await ev(`location.search`)).includes('f.level=3'));
        await ev(`(() => { const s = document.querySelector('[data-f=conc]'); s.value = 'yes'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`); await sleep(300);
        ok(`${name} concentration filter`, (await names()).includes('Fly') && !(await names()).includes('Fireball'), await names());
        await ev(`document.querySelector('#cp-filters [data-clear]').click()`); await sleep(300);
        ok(`${name} cleared`, (await names()).includes('Acid Arrow'));
        await tab('monster');
        ok(`${name} CR filter has 1/8`, await ev(`[...document.querySelectorAll('[data-f=crmin] option')].some((o) => o.textContent === '1/8')`));
        await ev(`(() => { const s = document.querySelector('[data-f=size]'); s.value = 'Tiny'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`); await sleep(300);
        ok(`${name} size filter and preview`, await ev(`document.querySelectorAll('#cp-list .cp-row').length > 0 && [...document.querySelectorAll('#cp-list .cp-row')].every((r) => r.textContent.includes('Tiny'))`));
        await ev(`document.querySelector('#cp-filters [data-clear]').click()`); await sleep(300);
        await tab('magic');
        ok(`${name} rarity filter`, await ev(`[...document.querySelectorAll('[data-f=rarity] option')].some((o) => o.textContent === 'Legendary')`));

        // deep links
        await open('/compendium/?t=spell&i=fireball');
        await until(`document.querySelector('#cp-dbody .kv')`, 'fireball detail');
        ok(`${name} Fireball detail`, await ev(`document.querySelector('#cp-dbody h2').textContent === 'Fireball' && document.querySelector('#cp-dbody .cp-text').textContent.includes('bright streak')`));
        ok(`${name} spells tab opened for a spell link`, await ev(`document.querySelector('#cp-tabs .on').dataset.tab === 'spell'`));
        await open('/compendium/?t=spell&i=wd:absorb-elements');
        await until(`document.querySelector('#cp-dbody .cp-text, #cp-dbody .note')`, 'extra detail');
        ok(`${name} extra spell shows fetched text plus a wikidot link`, await ev(`document.querySelector('#cp-dbody .cp-text')?.textContent.length > 50 && document.querySelector('#cp-dbody a[href*="wikidot.com/spell:absorb-elements"]') && document.querySelector('#cp-dbody .badge.p').textContent === 'Extra'`));
        await open('/compendium/?t=magic&i=magic:bag-of-holding');
        await until(`document.querySelector('#cp-dbody .cp-text')`, 'magic detail');
        ok(`${name} magic item rarity`, await ev(`document.querySelector('#cp-dbody').textContent.includes('Uncommon')`));
        await open('/compendium/?t=monster&i=srd:goblin');
        await until(`document.querySelector('#cp-dbody .cp-abil')`, 'goblin detail');
        ok(`${name} goblin stat block`, await ev(`document.querySelector('#cp-dbody').textContent.includes('Nimble Escape') && !!document.querySelector('#cp-dbody .cp-credit')`));
        await open('/compendium/?t=item&i=eq:longsword');
        await until(`document.querySelector('#cp-dbody .kv')`, 'longsword');
        ok(`${name} equipment detail`, await ev(`document.querySelector('#cp-dbody').textContent.includes('1d8 slashing')`));
        await open('/compendium/?t=rule&i=cond:grappled');
        ok(`${name} rule has no add button`, await ev(`document.querySelector('#cp-dbody h2').textContent === 'Grappled' && !document.querySelector('[data-add]')`));
        await open('/compendium/?t=spell&i=nope');
        await until(`document.querySelector('#cp-dbody .note')`, 'unknown entry');
        errs('deep links');
        await b.block(/spells.php|backup.php|cloud.php/);
        await open('/compendium/?t=spell&i=wd:absorb-elements');
        await until(`document.querySelector('#cp-dbody .note')`, 'extra detail, fetch blocked');
        ok(`${name} extra spell fetch fails`, await ev(`!document.querySelector('#cp-dbody .cp-text') && document.querySelector('#cp-dbody .note').textContent.includes("Couldn't load the text") && !!document.querySelector('#cp-dbody a[href*="wikidot.com/spell:absorb-elements"]') && !!document.querySelector('#cp-dbody .kv')`));
        await b.block(/backup.php|cloud.php/);
        b.errors.length = 0;

        // keyboard
        await open('/compendium/');
        await ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true }))`);
        is(`${name} slash focuses search`, await ev(`document.activeElement.id`), 'cp-q');
        await ev(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))`);
        ok(`${name} arrow moves into the list`, await ev(`document.activeElement.classList.contains('cp-row')`));

        // favourites and recent survive a reload
        await ev(`localStorage.removeItem('compendium-recent')`);
        await open('/compendium/?t=spell&i=fireball');
        await until(`document.querySelector('[data-fav]')`, 'star');
        await ev(`document.querySelector('[data-fav]').click()`);
        is(`${name} favourite saved`, await store('compendium-favs'), ['spell:fireball']);
        await open('/compendium/');
        await tab('fav');
        is(`${name} favourites tab after reload`, await names(), ['Fireball']);
        await tab('recent');
        is(`${name} recent tab after reload`, await names(), ['Fireball']);
        await open('/compendium/?t=spell&i=aid');
        await until(`document.querySelector('#cp-dbody .kv')`, 'aid');
        is(`${name} recent newest first`, await store('compendium-recent'), ['spell:aid', 'spell:fireball']);

        // Add to sheet: no characters
        await open('/compendium/?t=spell&i=fireball');
        await until(`document.querySelector('[data-add=sheet]')`, 'add button');
        await ev(`document.querySelector('[data-add=sheet]').click()`);
        await until(`document.querySelector('#cp-pick').open`, 'picker with no characters');
        ok(`${name} no characters says so`, await ev(`document.querySelector('#cp-pick-body').textContent.includes('no characters')`));
        await ev(`document.querySelector('#cp-pick [data-close]').click()`);

        // one character: added straight away
        await b.go(BASE + '/characters/new'); await sleep(1500);
        const one = Object.keys((await store('hb-sheet')).chars)[0];
        await open('/compendium/?t=spell&i=fireball');
        await until(`document.querySelector('[data-add=sheet]')`, 'add button');
        await ev(`document.querySelector('[data-add=sheet]').click()`);
        await until(`document.querySelector('#cp-msg .ok')`, 'added message');
        is(`${name} request queued`, (await store('hb-pending')).map((x) => [x.char, x.kind, x.name, x.lvl]), [[one, 'spell', 'Fireball', 3]]);
        // the same spell again, before the sheet has taken it: the question
        await ev(`document.querySelector('[data-add=sheet]').click()`);
        await until(`document.querySelector('#cp-dup').open`, 'duplicate question');
        ok(`${name} duplicate wording`, await ev(`document.querySelector('#cp-dup-text').textContent.endsWith('already has Fireball. Add another?')`));
        await ev(`document.querySelector('#cp-dup [data-close]').click()`);
        is(`${name} cancel adds nothing`, (await store('hb-pending')).length, 1);
        await ev(`document.querySelector('[data-add=sheet]').click()`);
        await until(`document.querySelector('#cp-dup').open`, 'duplicate question 2');
        await ev(`document.querySelector('#cp-dup-yes').click()`); await sleep(500);
        is(`${name} add another queues a second`, (await store('hb-pending')).length, 2);

        // the sheet takes both once, and fills them from the SRD
        await b.go(BASE + `/characters/${one}`);
        await until(`JSON.parse(localStorage.getItem('hb-sheet')).chars['${one}'].panels.some((p) => p.type === 'spells' && p.rows.filter((r) => r.name === 'Fireball').length === 2)`, 'spells on sheet');
        is(`${name} queue emptied`, await ev(`localStorage.getItem('hb-pending')`), null);
        await until(`JSON.parse(localStorage.getItem('hb-sheet')).chars['${one}'].panels.find((p) => p.type === 'spells').rows.every((r) => r.desc)`, 'filled from the SRD');
        const row = await js(`JSON.parse(localStorage.getItem('hb-sheet')).chars['${one}'].panels.find((p) => p.type === 'spells').rows[0]`);
        is(`${name} spell row`, [row.name, row.lvl, row.prep, row.school, row.srd], ['Fireball', 3, false, 'Evocation', 'fireball']);
        // an arrival while the sheet is open is taken at once, and once
        await ev(`(() => { localStorage.setItem('hb-pending', JSON.stringify([{ id: 'x1', char: '${one}', kind: 'item', name: 'Longsword', cat: 'Weapons', fill: true }])); dispatchEvent(new StorageEvent('storage', { key: 'hb-pending' })); dispatchEvent(new StorageEvent('storage', { key: 'hb-pending' })); })()`);
        await until(`JSON.parse(localStorage.getItem('hb-sheet')).chars['${one}'].panels.some((p) => p.type === 'items' && p.rows.some((r) => r.name === 'Longsword'))`, 'longsword on sheet');
        await sleep(1500);
        is(`${name} taken once`, await ev(`JSON.parse(localStorage.getItem('hb-sheet')).chars['${one}'].panels.find((p) => p.type === 'items').rows.filter((r) => r.name === 'Longsword').length`), 1);
        ok(`${name} item filled from the SRD`, await ev(`JSON.parse(localStorage.getItem('hb-sheet')).chars['${one}'].panels.find((p) => p.type === 'items').rows.find((r) => r.name === 'Longsword').props.length > 0`));
        // a request for another character stays queued
        await ev(`(() => { localStorage.setItem('hb-pending', JSON.stringify([{ id: 'x2', char: 'someone-else', kind: 'spell', name: 'Aid', lvl: 2 }])); dispatchEvent(new StorageEvent('storage', { key: 'hb-pending' })); })()`);
        await sleep(500);
        is(`${name} other character's request stays`, (await store('hb-pending')).length, 1);
        await ev(`localStorage.removeItem('hb-pending')`);
        // now the sheet has it: asking again is the question again
        await open('/compendium/?t=spell&i=fireball');
        await until(`document.querySelector('[data-add=sheet]')`, 'add button');
        await ev(`document.querySelector('[data-add=sheet]').click()`);
        await until(`document.querySelector('#cp-dup').open`, 'duplicate question on the sheet');
        await ev(`document.querySelector('#cp-dup [data-close]').click()`);

        // two characters: a picker
        await b.go(BASE + '/characters/new'); await sleep(1500);
        const two = Object.keys((await store('hb-sheet')).chars).find((id) => id !== one);
        await ev(`(() => { const d = JSON.parse(localStorage.getItem('hb-sheet')); d.chars['${two}'].name = 'Second'; localStorage.setItem('hb-sheet', JSON.stringify(d)); })()`);
        await open('/compendium/?t=spell&i=aid');
        await until(`document.querySelector('[data-add=sheet]')`, 'add button');
        await ev(`document.querySelector('[data-add=sheet]').click()`);
        await until(`document.querySelector('#cp-pick').open`, 'picker');
        is(`${name} picker lists both`, await js(`[...document.querySelectorAll('#cp-pick .cp-char')].map((x) => x.dataset.char).sort()`), [one, two].sort());
        await ev(`document.querySelector('#cp-pick [data-char="${two}"]').click()`);
        await until(`document.querySelector('#cp-msg .ok')`, 'added to the second');
        is(`${name} request is for the picked one`, (await store('hb-pending')).map((x) => x.char), [two]);
        await ev(`localStorage.removeItem('hb-pending')`);

        // Add to encounter: two goblins reach the Monster Sheet, numbered, once
        await open('/compendium/?t=monster&i=srd:goblin');
        await until(`document.querySelector('[data-add=enc]')`, 'encounter button');
        await ev(`document.querySelector('[data-qty="1"]').click(); document.querySelector('[data-qty="1"]').click(); document.querySelector('[data-qty="-1"]').click(); document.querySelector('[data-qty="1"]').click()`);
        is(`${name} counter`, await ev(`document.querySelector('#cp-n').textContent`), '3');
        await ev(`document.querySelector('[data-qty="-1"]').click()`);
        await ev(`document.querySelector('[data-add=enc]').click()`);
        await until(`document.querySelector('#cp-msg .ok')`, 'encounter message');
        is(`${name} encounter request`, (await store('mon-pending')).map((x) => [x.key, x.n]), [['srd:goblin', 2]]);
        await b.go(BASE + '/sheets/monster/');
        await until(`(localStorage.getItem('mon-pending') || '[]') === '[]' && Object.values(JSON.parse(localStorage.getItem('monster-sheet')).chars).filter((c) => /^Goblin \\d$/.test(c.name)).length === 2`, 'two goblins', 30000);
        is(`${name} goblins numbered`, await js(`Object.values(JSON.parse(localStorage.getItem('monster-sheet')).chars).map((c) => c.name).sort()`), ['Goblin 1', 'Goblin 2']);
        is(`${name} each has its own hit points`, await js(`new Set(Object.values(JSON.parse(localStorage.getItem('monster-sheet')).chars).map((c) => c.id)).size`), 2);
        errs('sheets');

        // credits
        await open('/compendium/');
        await ev(`document.querySelector('#cp-credits-btn').click()`);
        ok(`${name} credits`, await ev(`document.querySelector('#cp-credits').open && document.querySelector('#cp-credits').textContent.includes('Creative Commons Attribution 4.0') && document.querySelector('#cp-credits').textContent.includes('Tome of Beasts')`));
    } catch (e) { bad++; console.log(`FAIL ${name}: ${e.message}`); } finally { b.close(); }
}
console.log(bad ? `${bad} check(s) failed` : 'compendium ok');
process.exit(bad ? 1 : 0);
