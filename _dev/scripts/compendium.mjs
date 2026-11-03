// Checks the Compendium (/compendium/) signed out, in headless Chrome and Firefox: every list's count against the content
// files (sheets/player/content/index.json) and monsters.json, search (Fireball, Goblin, Bag of Holding, Grappled, a typo),
// the tabs, the 2014 / 2024 / Both switch (kept over a reload), filters, endless scroll, deep links (old keys too), classes with
// their level table and subclasses, races, backgrounds, feats, favourites and recent surviving a reload, "Add to sheet"
// (one character, two characters, the duplicate question, the sheet taking the request once, a Deep Magic spell, a feat) and
// "Add to encounter" reaching the Monster Sheet (an SRD goblin and a Tome of Beasts 2023 monster).
//   node _dev/scripts/compendium.mjs [base URL, default http://localhost:8110]
// Needs the local server with the router (php -S 127.0.0.1:8110 -t . _dev/router.php) and internet (the SRD proxies).
// Cloud saves and backups are blocked.
import { launch, browsers } from './browser.mjs';

const BASE = process.argv[2] || 'http://localhost:8110';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
const is = (name, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) { bad++; console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); } };
const ok = (name, cond, got = '') => { if (!cond) { bad++; console.log(`FAIL ${name} ${JSON.stringify(got)}`); } };

for (const name of browsers) {
    const b = await launch(name), ev = b.ev;
    const js = async (expr) => JSON.parse(await ev(`JSON.stringify(${expr})`));
    const until = async (expr, what, ms = 15000) => { for (const t = Date.now(); Date.now() - t < ms;) { if (await ev(`!!(${expr})`)) return true; await sleep(200); } bad++; console.log(`FAIL ${name} timed out: ${what}`); return false; };
    const errs = (where) => { const e = b.errors.filter((x) => !/backup\.php|cloud\.php/.test(x)); if (e.length) { bad++; console.log(`FAIL ${name} ${where}: ${e.join(' | ').slice(0, 600)}`); } };
    const open = async (path) => { await b.go(BASE + path); await until(`document.querySelectorAll('.cp-row').length || document.querySelector('.err')`, path); };
    const names = () => js(`[...document.querySelectorAll('#cp-list .cp-row .cp-name')].map((x) => x.textContent)`);
    // runs something that redraws the list and waits for the redraw (it replaces the whole list, marker included)
    const redraw = async (js) => {
        await ev(`document.querySelector('#cp-list').append(document.createComment('old'))`); await ev(js);
        await until(`![...document.querySelector('#cp-list').childNodes].some((n) => n.nodeType === 8)`, 'list redrawn after ' + js.slice(0, 80));
    };
    const search = async (q) => { await redraw(`(() => { const i = document.querySelector('#cp-q'); i.value = ${JSON.stringify(q)}; i.dispatchEvent(new Event('input')); })()`); return names(); };
    const tab = (t) => redraw(`document.querySelector('#cp-tabs [data-tab=${t}]').click()`);
    const rowCount = `document.querySelectorAll('#cp-list .cp-row').length`;
    const store = (k) => js(`JSON.parse(localStorage.getItem(${JSON.stringify(k)}) || 'null')`);
    try {
        await b.block(/backup\.php|cloud\.php/);
        await b.go(BASE + '/privacy/');
        await ev(`localStorage.clear(); localStorage.setItem('hb-sheet-merged', '1')`);

        await open('/compendium/');
        errs('load');
        await until(`document.querySelector('#cp-count').textContent.includes('results')`, 'count');
        // every list in, for both rules versions: the content files' counts (index.json), monsters.json and rules.js
        const idx = await (await fetch(BASE + '/sheets/player/content/index.json')).json(), cn = idx.counts;
        const sum = (...k) => k.reduce((n, x) => n + cn['2014'][x] + cn['2024'][x], 0);
        const monsters = (await (await fetch(BASE + '/sheets/monster/monsters.json')).json()).list.length;
        const want = { Spells: sum('spells'), Monsters: monsters, Items: sum('equipment'), 'Magic items': sum('magic_items'), Classes: sum('classes', 'subclasses'), Races: sum('races', 'subraces'), Backgrounds: sum('backgrounds'), Feats: sum('feats') };
        const counts = `Object.fromEntries([...document.querySelectorAll('#cp-list .cp-gh')].map((h) => [h.firstChild.textContent.trim(), +h.querySelector('.n').textContent.replace(/\\D/g, '')]))`;
        await until(`(() => { const c = ${counts}; return c.Rules > 0 && Object.keys(c).length === 9 && !document.querySelector('.err'); })()`, 'lists loaded', 60000);
        const got = await js(counts);
        is(`${name} counts from the content files, both rules`, Object.fromEntries(Object.keys(want).map((k) => [k, got[k]])), want);
        is(`${name} All is grouped, 9 groups`, Object.keys(got).length, 9);
        ok(`${name} no group over 5`, await ev(`document.querySelectorAll('#cp-list .cp-row').length <= 45`));
        ok(`${name} show all links`, await ev(`document.querySelectorAll('.cp-showall').length === 9`));
        is(`${name} rules default to Both`, await ev(`document.querySelector('#cp-rules input:checked').value`), 'both');

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
        // after each scroll: the next batch is in and has pushed the marker under the list out of the observer's reach
        // (600px past the window) for a frame, so the next scroll is a new crossing; scrolling again sooner never loads more
        for (let i = 0, n; i < 60 && (n = await ev(rowCount)) < total; i++) {
            await ev(`document.querySelector('#cp-more').scrollIntoView()`);
            await b.until(`${rowCount} > ${n} && document.querySelector('#cp-more').getBoundingClientRect().top > innerHeight + 600`).catch(() => { });
            await ev('new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(1))))');
        }
        is(`${name} endless scroll reaches every spell`, await ev(`document.querySelectorAll('#cp-list .cp-row').length`), total);
        // a fast scroll to the end: with the rows hidden a batch never moves the marker out of the observer's reach, so
        // there's no new crossing, and loading must still carry on to the last one with no more scrolling
        await tab('monster');
        is(`${name} monster count`, +(await ev(`document.querySelector('#cp-count').textContent.replace(/\\D/g, '')`)), monsters);
        await ev(`(document.head.insertAdjacentHTML('beforeend', '<style id="cp-short">.cp-row { display: none; }</style>'), scrollTo(0, document.body.scrollHeight), 1)`);
        await b.until(`${rowCount} >= ${monsters}`, 15000).catch(() => { });
        is(`${name} a fast scroll to the end loads every monster`, [monsters > 50, await ev(rowCount)], [true, monsters]);
        await ev(`(document.querySelector('#cp-short').remove(), scrollTo(0, 0), 1)`);
        await tab('spell');
        // both rules versions: each row says which; one version hides the other, and the choice is kept
        ok(`${name} rules badges`, await ev(`['2014', '2024'].every((r) => [...document.querySelectorAll('#cp-list .badge')].some((x) => x.textContent === r))`));
        const rules = (r) => redraw(`(() => { const i = document.querySelector('#cp-rules input[value="${r}"]'); i.checked = true; i.dispatchEvent(new Event('change', { bubbles: true })); })()`);
        await rules('2024');
        is(`${name} 2024 spells only`, +(await ev(`document.querySelector('#cp-count').textContent.replace(/\\D/g, '')`)), cn['2024'].spells);
        ok(`${name} no version badge with one version`, await ev(`![...document.querySelectorAll('#cp-list .badge')].some((x) => /^20(14|24)$/.test(x.textContent))`));
        is(`${name} rules saved`, await store('compendium-rules'), '2024');
        await open('/compendium/');
        is(`${name} rules after reload`, await ev(`document.querySelector('#cp-rules input:checked').value`), '2024');
        await until(`+document.querySelector('#cp-count').textContent.replace(/\\D/g, '') === ${cn['2024'].spells}`, '2024 spells after reload');
        await rules('2014');
        await until(`+document.querySelector('#cp-count').textContent.replace(/\\D/g, '') === ${cn['2014'].spells}`, '2014 spells only');
        await rules('both');
        await until(`+document.querySelector('#cp-count').textContent.replace(/\\D/g, '') === ${sum('spells')}`, 'both rules again');
        // filters saved before this change (the spell Source filter, an old item category) don't hide the list
        await ev(`localStorage.setItem('compendium-view', JSON.stringify({ tab: 'spell', f: { src: 'SRD 5.1' } }))`);
        await open('/compendium/');
        await until(`+document.querySelector('#cp-count').textContent.replace(/\\D/g, '') === ${sum('spells')}`, 'old source filter ignored');
        await ev(`localStorage.setItem('compendium-view', JSON.stringify({ tab: 'item', f: { cat: 'Adventuring Gear' } }))`);
        await open('/compendium/');
        await until(`+document.querySelector('#cp-count').textContent.replace(/\\D/g, '') === ${sum('equipment')}`, 'old item category ignored');
        // classes come before subclasses, and subclasses are still found by search; the page fits a phone
        await tab('class');
        ok(`${name} classes first`, (await js(`[...document.querySelectorAll('#cp-list .cp-sub')].slice(0, 32).every((x) => x.textContent.startsWith('Hit die'))`)));
        ok(`${name} subclass found by search`, (await search('School of Evocation')).includes('School of Evocation'));
        await search('');
        await tab('spell');
        // class filter
        await redraw(`(() => { const s = document.querySelector('[data-f=cls]'); s.value = 'Paladin'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
        ok(`${name} class filter`, (await search('bless')).includes('Bless') && !(await search('fireball')).includes('Fireball'), await names());
        await search('');
        await redraw(`document.querySelector('#cp-filters [data-clear]').click()`);
        await redraw(`(() => { const s = document.querySelector('[data-f=level]'); s.value = '3'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
        ok(`${name} level filter`, (await js(`[...document.querySelectorAll('#cp-list .cp-sub')].map((x) => x.textContent)`)).every((t) => t.startsWith('Level 3')));
        ok(`${name} filter in URL`, (await ev(`location.search`)).includes('f.level=3'));
        await redraw(`(() => { const s = document.querySelector('[data-f=conc]'); s.value = 'yes'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
        ok(`${name} concentration filter`, (await search('fly')).includes('Fly') && !(await search('fireball')).includes('Fireball'), await names());
        await search('');
        await redraw(`document.querySelector('#cp-filters [data-clear]').click()`);
        ok(`${name} cleared`, (await names()).includes('Acid Splash'));
        await tab('monster');
        ok(`${name} CR filter has 1/8`, await ev(`[...document.querySelectorAll('[data-f=crmin] option')].some((o) => o.textContent === '1/8')`));
        await redraw(`(() => { const s = document.querySelector('[data-f=size]'); s.value = 'Tiny'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
        ok(`${name} size filter and preview`, await ev(`document.querySelectorAll('#cp-list .cp-row').length > 0 && [...document.querySelectorAll('#cp-list .cp-row')].every((r) => r.textContent.includes('Tiny'))`));
        await redraw(`document.querySelector('#cp-filters [data-clear]').click()`);
        await tab('magic');
        await until(`[...document.querySelectorAll('[data-f=rarity] option')].some((o) => o.textContent === 'Legendary')`, 'rarity filter');

        // deep links
        await open('/compendium/?t=spell&i=fireball');
        await until(`document.querySelector('#cp-dbody .kv')`, 'fireball detail');
        ok(`${name} Fireball detail`, await ev(`document.querySelector('#cp-dbody h2').textContent === 'Fireball' && document.querySelector('#cp-dbody .cp-text').textContent.includes('bright streak')`));
        ok(`${name} spells tab opened for a spell link`, await ev(`document.querySelector('#cp-tabs .on').dataset.tab === 'spell'`));
        // a link from before the content files (an extra spell's "wd:" key) opens the 2014 entry, its text from the data
        await open('/compendium/?t=spell&i=wd:absorb-elements');
        await until(`document.querySelector('#cp-dbody .cp-text, #cp-dbody .note')`, 'extra detail');
        ok(`${name} old extra spell link opens the content entry`, await ev(`document.querySelector('#cp-dbody h2').textContent === 'Absorb Elements' && document.querySelector('#cp-dbody .cp-text')?.textContent.length > 50 && location.search.includes('i=2014%3Aabsorb-elements')`));
        await open('/compendium/?t=spell&i=2024:fireball');
        await until(`document.querySelector('#cp-dbody .kv')`, '2024 fireball');
        ok(`${name} 2024 Fireball`, await ev(`document.querySelector('#cp-dbody .badge.b').textContent === '2024' && document.querySelector('#cp-dbody').textContent.includes('Casting time') && document.querySelector('#cp-dbody').textContent.includes('Action')`));
        // a class: its level table, features, subclasses that open, and the builder link (no Add to sheet)
        await open('/compendium/?t=class&i=2014:wizard');
        await until(`document.querySelector('#cp-dbody .cp-levels')`, 'wizard');
        is(`${name} wizard level table`, await ev(`document.querySelectorAll('#cp-dbody .cp-levels tbody tr').length`), 20);
        ok(`${name} wizard table has slots`, await ev(`[...document.querySelectorAll('#cp-dbody .cp-levels th')].some((t) => t.textContent === '9th')`));
        ok(`${name} wizard features and build link`, await ev(`document.querySelector('#cp-dbody').textContent.includes('Arcane Recovery') && !!document.querySelector('#cp-dbody a[href="/characters/build"]') && !document.querySelector('[data-add]')`));
        ok(`${name} classes tab opened for a class link`, await ev(`document.querySelector('#cp-tabs .on').dataset.tab === 'class'`));
        await ev(`[...document.querySelectorAll('#cp-dbody [data-open]')].find((x) => x.textContent === 'School of Evocation').click()`);
        await until(`document.querySelector('#cp-dbody h2')?.textContent === 'School of Evocation'`, 'subclass opened');
        ok(`${name} subclass features and its class`, await ev(`document.querySelector('#cp-dbody').textContent.includes('Sculpt Spells') && document.querySelector('#cp-dbody [data-open="class:2014:wizard"]')?.textContent === 'Wizard'`));
        await open('/compendium/?t=race&i=2014:elf');
        await until(`document.querySelector('#cp-dbody .kv')`, 'elf');
        ok(`${name} race traits and subraces`, await ev(`document.querySelector('#cp-dbody').textContent.includes('Dexterity +2') && document.querySelector('#cp-dbody').textContent.includes('Fey Ancestry') && [...document.querySelectorAll('#cp-dbody [data-open]')].some((x) => x.textContent === 'High Elf') && !!document.querySelector('#cp-dbody a[href="/characters/build"]')`));
        await open('/compendium/?t=background&i=2014:acolyte');
        await until(`document.querySelector('#cp-dbody .kv')`, 'acolyte');
        ok(`${name} background feature and tables`, await ev(`document.querySelector('#cp-dbody').textContent.includes('Shelter of the Faithful') && [...document.querySelectorAll('#cp-dbody th')].some((t) => t.textContent === 'd8') && document.querySelector('#cp-dbody').textContent.includes('Insight')`));
        await open('/compendium/?t=feat&i=2014:grappler');
        await until(`document.querySelector('#cp-dbody .cp-text')`, 'grappler');
        ok(`${name} feat prerequisite and add button`, await ev(`document.querySelector('#cp-dbody').textContent.includes('Strength 13+') && !!document.querySelector('[data-add=sheet]')`));
        // a monster from the Tome of Beasts 2023, which now wins over the 2016 copy
        await open('/compendium/?t=monster&i=o5e:abominablebeauty-tob1-2023');
        await until(`document.querySelector('#cp-dbody .cp-abil')`, 'tob 2023 monster');
        ok(`${name} Tome of Beasts 2023 monster`, await ev(`document.querySelector('#cp-dbody').textContent.includes('Blinding Gaze') && document.querySelector('#cp-dbody .cp-credit').textContent.includes('2023')`));
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
        // the text is in the content files: no proxy needed
        await b.block(/spells.php|items.php|backup.php|cloud.php/);
        await open('/compendium/?t=spell&i=2014:absorb-elements');
        await until(`document.querySelector('#cp-dbody .cp-text, #cp-dbody .err')`, 'spell with the proxies blocked');
        ok(`${name} spell text without the proxy`, await ev(`document.querySelector('#cp-dbody .cp-text')?.textContent.length > 50`));
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
        is(`${name} favourite saved`, await store('compendium-favs'), ['spell:2014:fireball']);
        // a favourite saved before the content files ("item:eq:longsword") still shows, as the 2014 entry
        await ev(`localStorage.setItem('compendium-favs', JSON.stringify(['spell:2014:fireball', 'item:eq:longsword']))`);
        await open('/compendium/');
        await tab('fav');
        await until(`document.querySelectorAll('#cp-list .cp-row').length === 2`, 'both favourites');
        is(`${name} favourites tab after reload`, await names(), ['Fireball', 'Longsword']);
        await tab('recent');
        is(`${name} recent tab after reload`, await names(), ['Fireball']);
        await open('/compendium/?t=spell&i=aid');
        await until(`document.querySelector('#cp-dbody .kv')`, 'aid');
        is(`${name} recent newest first`, await store('compendium-recent'), ['spell:2014:aid', 'spell:2014:fireball']);
        await ev(`localStorage.setItem('compendium-favs', JSON.stringify(['spell:2014:fireball']))`);

        // Add to sheet: no characters
        await open('/compendium/?t=spell&i=fireball');
        await until(`document.querySelector('[data-add=sheet]')`, 'add button');
        await ev(`document.querySelector('[data-add=sheet]').click()`);
        await until(`document.querySelector('#cp-pick').open`, 'picker with no characters');
        ok(`${name} no characters says so`, await ev(`document.querySelector('#cp-pick-body').textContent.includes('no characters')`));
        await ev(`document.querySelector('#cp-pick [data-close]').click()`);

        // one character: added straight away
        await b.go(BASE + '/characters/new'); await until(`Object.keys(JSON.parse(localStorage.getItem('hb-sheet') || '{"chars":{}}').chars).length === 1`, 'new character stored');
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
        await ev(`document.querySelector('#cp-dup-yes').click()`); await until(`JSON.parse(localStorage.getItem('hb-pending') || '[]').length === 2`, 'second request queued');
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
        await sleep(1500); // kept: proves the second storage event adds nothing more; no state shows "nothing else will happen"
        is(`${name} taken once`, await ev(`JSON.parse(localStorage.getItem('hb-sheet')).chars['${one}'].panels.find((p) => p.type === 'items').rows.filter((r) => r.name === 'Longsword').length`), 1);
        ok(`${name} item filled from the SRD`, await ev(`JSON.parse(localStorage.getItem('hb-sheet')).chars['${one}'].panels.find((p) => p.type === 'items').rows.find((r) => r.name === 'Longsword').props.length > 0`));
        // a request for another character stays queued
        await ev(`(() => { localStorage.setItem('hb-pending', JSON.stringify([{ id: 'x2', char: 'someone-else', kind: 'spell', name: 'Aid', lvl: 2 }])); dispatchEvent(new StorageEvent('storage', { key: 'hb-pending' })); })()`);
        await sleep(500); // kept: proves the sheet leaves another character's request alone; nothing to wait for
        is(`${name} other character's request stays`, (await store('hb-pending')).length, 1);
        await ev(`localStorage.removeItem('hb-pending')`);
        // now the sheet has it: asking again is the question again
        await open('/compendium/?t=spell&i=fireball');
        await until(`document.querySelector('[data-add=sheet]')`, 'add button');
        await ev(`document.querySelector('[data-add=sheet]').click()`);
        await until(`document.querySelector('#cp-dup').open`, 'duplicate question on the sheet');
        await ev(`document.querySelector('#cp-dup [data-close]').click()`);

        // a spell from a newly imported book (Deep Magic) reaches the sheet with its name and level
        await open('/compendium/?t=spell&i=2014:abhorrent-apparition');
        await until(`document.querySelector('[data-add=sheet]')`, 'deep magic spell');
        await ev(`document.querySelector('[data-add=sheet]').click()`);
        await until(`document.querySelector('#cp-msg .ok')`, 'new-source spell added');
        is(`${name} new-source spell request`, (await store('hb-pending')).map((x) => [x.kind, x.name, x.lvl]), [['spell', 'Abhorrent Apparition', 4]]);
        await b.go(BASE + `/characters/${one}`);
        await until(`JSON.parse(localStorage.getItem('hb-sheet')).chars['${one}'].panels.some((p) => p.type === 'spells' && p.rows.some((r) => r.name === 'Abhorrent Apparition' && r.lvl === 4))`, 'new-source spell on sheet');
        is(`${name} new-source spell taken`, await ev(`localStorage.getItem('hb-pending')`), null);
        // a feat: a Passive abilities row with its text (see takePending in sheet.js)
        await open('/compendium/?t=feat&i=2014:grappler');
        await until(`document.querySelector('[data-add=sheet]')`, 'feat add button');
        await ev(`document.querySelector('[data-add=sheet]').click()`);
        await until(`document.querySelector('#cp-msg .ok')`, 'feat added');
        const feat = (await store('hb-pending'))[0];
        is(`${name} feat request`, [feat.char, feat.kind, feat.name, feat.src, feat.text.startsWith('Prerequisite: Strength 13+'), feat.text.includes('grappling')], [one, 'feat', 'Grappler', 'Feat', true, true]);
        await ev(`localStorage.removeItem('hb-pending')`);

        // two characters: a picker
        await b.go(BASE + '/characters/new'); await until(`Object.keys(JSON.parse(localStorage.getItem('hb-sheet') || '{"chars":{}}').chars).length === 2`, 'second character stored');
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
        // a Tome of Beasts 2023 monster reaches the Monster Sheet too
        await open('/compendium/?t=monster&i=o5e:abominablebeauty-tob1-2023');
        await until(`document.querySelector('[data-add=enc]')`, 'tob 2023 encounter button');
        await ev(`document.querySelector('[data-add=enc]').click()`);
        await until(`document.querySelector('#cp-msg .ok')`, 'tob 2023 encounter message');
        await b.go(BASE + '/sheets/monster/');
        await until(`(localStorage.getItem('mon-pending') || '[]') === '[]' && Object.values(JSON.parse(localStorage.getItem('monster-sheet')).chars).some((c) => /^Abominable Beauty/.test(c.name) && c.hp.base === 187)`, 'tob 2023 monster on the sheet', 30000);
        errs('sheets');

        // credits
        await open('/compendium/');
        await ev(`document.querySelector('#cp-credits-btn').click()`);
        ok(`${name} credits`, await ev(`document.querySelector('#cp-credits').open && document.querySelector('#cp-credits').textContent.includes('Creative Commons Attribution 4.0') && document.querySelector('#cp-credits').textContent.includes('Tome of Beasts')`));
    } catch (e) { bad++; console.log(`FAIL ${name}: ${e.message}`); } finally { b.close(); }
}
console.log(bad ? `${bad} check(s) failed` : 'compendium ok');
process.exit(bad ? 1 : 0);
