// Checks the Compendium (/compendium/) signed out, in headless Chrome and Firefox: every list's count against the content
// files (sheets/player/content/index.json) and monsters.json, search (Fireball, Goblin, Bag of Holding, Grappled, a typo),
// the tabs, the 2014 / 2024 / Both switch (kept over a reload), filters, endless scroll, deep links (old keys too), classes with
// their level table and subclasses, races, backgrounds, feats, favourites and recent surviving a reload, "Add to sheet"
// (one character, two characters, the duplicate question, the sheet taking the request once; a Deep Magic spell, a 2024 spell with
// an SRD name, a non-SRD item, a magic item and a feat landing with their own details), old keys through the aliases, the rules switch on
// monsters, and "Add to encounter" and the Monster Sheet's own search reaching the sheet (an SRD goblin, a Tome of Beasts 2023 monster, an SRD 5.2 monster).
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
        // the rules switch filters monsters: SRD 5.2 is 2024, the rest 2014
        const mon24 = (await (await fetch(BASE + '/sheets/monster/monsters.json')).json()).list.filter((r) => r[4] === 'srd-2024').length;
        is(`${name} 331 SRD 5.2 monsters`, mon24, 331);
        for (const [r, n] of [['2024', mon24], ['2014', monsters - mon24], ['both', monsters]]) {
            await ev(`(() => { const i = document.querySelector('#cp-rules input[value="${r}"]'); i.checked = true; i.dispatchEvent(new Event('change', { bubbles: true })); })()`);
            await until(`+document.querySelector('#cp-count').textContent.replace(/\\D/g, '') === ${n}`, 'monsters with rules ' + r);
        }
        is(`${name} both copies of a monster, each marked`, await search('Aboleth').then(() => js(`[...document.querySelectorAll('#cp-list .cp-row')].filter((x) => x.querySelector('.cp-name').textContent === 'Aboleth').map((x) => x.querySelector('.badge.b').textContent)`)), ['2014', '2024']);
        await search('');
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
        // classes come before subclasses, and subclasses are still found by search
        await tab('class');
        await until(`+document.querySelector('#cp-count').textContent.replace(/\\D/g, '') === ${sum('classes', 'subclasses')}`, 'classes loaded');
        is(`${name} classes first`, (await js(`[...document.querySelectorAll('#cp-list .cp-sub')].slice(0, ${sum('classes') + 1}).map((x) => x.textContent.startsWith('Hit die'))`)).filter(Boolean).length, sum('classes'));
        ok(`${name} subclass found by search`, (await search('School of Evocation')).includes('School of Evocation'));
        await search('');
        await tab('spell');
        // class filter (its options arrive with the spells)
        await until(`[...document.querySelectorAll('[data-f=cls] option')].some((o) => o.value === 'Paladin')`, 'class filter options');
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
        // the size list comes from the monsters themselves, so it has no Tiny until they have loaded
        await until(`[...document.querySelectorAll('[data-f=size] option')].some((o) => o.value === 'Tiny')`, 'monster sizes loaded');
        await redraw(`(() => { const s = document.querySelector('[data-f=size]'); s.value = 'Tiny'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
        // rows draw in batches after a filter change, so wait for them
        await until(`document.querySelectorAll('#cp-list .cp-row').length > 0 && [...document.querySelectorAll('#cp-list .cp-row')].every((r) => r.textContent.includes('Tiny'))`, 'size filter and preview');
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
        // an SRD 5.2 monster: its stat block through monsters.php, in the same shape
        await open('/compendium/?t=monster&i=s24:aboleth');
        await until(`document.querySelector('#cp-dbody .cp-abil')`, 'SRD 5.2 aboleth');
        ok(`${name} SRD 5.2 monster`, await ev(`(() => { const d = document.querySelector('#cp-dbody'), x = d.textContent; return x.includes('Amphibious') && x.includes('Attack Roll') && x.includes('Legendary actions') && d.querySelector('.cp-credit').textContent.includes('SRD 5.2') && d.querySelector('.badge.b').textContent === '2024' && !/\\bunit\\b|feet/.test(d.querySelector('.kv').textContent); })()`), await ev(`document.querySelector('#cp-dbody').textContent.slice(0, 400)`));
        // keys that changed: a link and a queued request still work
        await open('/compendium/?t=spell&i=acid-arrow');
        await until(`document.querySelector('#cp-dbody h2')`, 'old spell link');
        is(`${name} old spell key opens its new entry`, await ev(`document.querySelector('#cp-dbody h2').textContent`), "Melf's Acid Arrow");
        await open('/compendium/?t=monster&i=o5e:abominable-beauty');
        await until(`document.querySelector('#cp-dbody .cp-abil')`, 'old monster link');
        ok(`${name} old monster key opens the 2023 copy`, await ev(`document.querySelector('#cp-dbody h2').textContent === 'Abominable Beauty' && document.querySelector('#cp-dbody .cp-credit').textContent.includes('2023')`));
        await open('/compendium/?t=magic&i=magic:dragon-scale-mail-red');
        await until(`document.querySelector('#cp-dbody h2')`, 'old magic link');
        is(`${name} old magic item key`, await ev(`document.querySelector('#cp-dbody h2').textContent`), 'Dragon Scale Mail');
        is(`${name} monsters.php answers an old key`, (await (await fetch(BASE + '/sheets/monster/monsters.php?i=o5e:abominable-beauty')).json()).m.name, 'Abominable Beauty');
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
        const oldFavs = ['spell:2014:fireball', 'item:eq:longsword', 'spell:acid-arrow', 'monster:o5e:abominable-beauty', 'magic:magic:dragon-scale-mail-red'];
        await ev(`localStorage.setItem('compendium-favs', ${JSON.stringify(JSON.stringify(oldFavs))})`);
        await open('/compendium/');
        await tab('fav');
        await until(`document.querySelectorAll('#cp-list .cp-row').length === 5`, 'every favourite');
        is(`${name} favourites tab after reload, old keys too`, await names(), ['Fireball', 'Longsword', "Melf's Acid Arrow", 'Abominable Beauty', 'Dragon Scale Mail']);
        is(`${name} stored favourites not rewritten`, await store('compendium-favs'), oldFavs);
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
        is(`${name} spell row`, [row.name, row.lvl, row.prep, row.school, row.srd, row.time, row.mode, row.save, row.dmg, row.mech], ['Fireball', 3, false, 'Evocation', '', 'Action', 'save', 'DEX', [{ dice: '8d6', type: 'Fire' }], 1]);
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

        // every entry arrives with its own details: a Deep Magic spell, a 2024 spell with an SRD name (its 2024 text, not the SRD's), a Black Flag
        // weapon that isn't in the SRD list, a magic item that needs attunement, and a feat as a Passive abilities row
        const addAll = [['spell', '2014:abhorrent-apparition'], ['spell', '2024:ray-of-frost'], ['spell', '2014:cure-wounds'], ['item', '2014:scythe'], ['item', '2024:longbow'], ['magic', '2014:cloak-of-protection'], ['feat', '2014:grappler']];
        for (const [ty, i] of addAll) {
            await open(`/compendium/?t=${ty}&i=${i}`);
            await until(`document.querySelector('[data-add=sheet]')`, 'add button ' + i);
            await ev(`document.querySelector('[data-add=sheet]').click()`);
            await until(`document.querySelector('#cp-msg .ok')`, 'added ' + i);
        }
        is(`${name} everything queued`, (await store('hb-pending')).length, addAll.length);
        const feat = (await store('hb-pending')).find((x) => x.kind === 'feat');
        is(`${name} feat request`, [feat.char, feat.name, feat.src, feat.text.startsWith('Prerequisite: Strength 13+')], [one, 'Grappler', 'Feat', true]);
        await b.go(BASE + `/characters/${one}`);
        await until(`localStorage.getItem('hb-pending') === null`, 'the sheet takes everything');
        const db1 = (await store('hb-sheet')).chars[one], rowOf = (type, n) => db1.panels.filter((p) => p.type === type).flatMap((p) => p.rows).find((r) => r.name === n);
        const content = async (f) => (await fetch(BASE + '/sheets/player/content/' + f)).json();
        const [sp14, sp24, it14] = await Promise.all([content('2014-spells.json'), content('2024-spells.json'), content('2014-items.json')]);
        const deep = rowOf('spells', 'Abhorrent Apparition');
        is(`${name} new-book spell`, [deep.lvl, deep.school, deep.desc, deep.dur, deep.srd], [4, sp14.spells['abhorrent-apparition'].school, sp14.spells['abhorrent-apparition'].desc.join('\n\n'), sp14.spells['abhorrent-apparition'].duration, '']);
        const ray = rowOf('spells', 'Ray of Frost');
        ok(`${name} the two Ray of Frost texts differ, or this proves nothing`, sp24.spells['ray-of-frost'].desc.join() !== sp14.spells['ray-of-frost'].desc.join());
        is(`${name} 2024 spell keeps its 2024 text`, [ray.desc, ray.time, ray.srd, ray.mode, ray.dmg, ray.mech], [sp24.spells['ray-of-frost'].desc.join('\n\n'), 'Action', '', 'atk', [{ dice: 'CANTRIPd8', type: 'Cold' }], 1]);
        ok(`${name} healing read from the text`, rowOf('spells', 'Cure Wounds').fx.some((f) => f.k === 'heal' && /^\d+d\d+$/.test(f.dice)), rowOf('spells', 'Cure Wounds').fx);
        const scy = rowOf('items', 'Scythe');
        is(`${name} non-SRD item`, [scy.cat, scy.gp, scy.wt, ['Martial', 'Melee', 'Reach', 'Two-handed'].every((x) => scy.props.includes(x))], ['Weapons', it14.equipment.scythe.cost.quantity, it14.equipment.scythe.weight, true], scy.props);
        const bow = rowOf('items', 'Longbow');
        ok(`${name} 2024 weapon's attributes`, bow.cat === 'Weapons' && bow.wt === 2 && ['Martial', 'Ranged', 'Range (150/600)', 'Mastery (Slow)'].every((x) => bow.props.includes(x)), bow);
        const cloak = rowOf('items', 'Cloak of Protection');
        is(`${name} magic item`, [cloak.cat, cloak.att, cloak.props.includes('Uncommon'), cloak.notes.length > 20], ['Magic items', 'needs', true, true]);
        const fr = rowOf('list', 'Grappler');
        is(`${name} feat on the sheet`, [fr.src, fr.grp, fr.text.startsWith('Prerequisite: Strength 13+'), fr.text.includes('grappl')], ['Feat', 'other', true, true]);
        ok(`${name} feat is in Passive abilities`, db1.panels.find((p) => p.title === 'Passive abilities').rows.includes(fr));
        // and it is still there after a reload
        await b.go(BASE + `/characters/${one}`);
        await until(`document.querySelector('main') && JSON.parse(localStorage.getItem('hb-sheet')).chars['${one}'].panels.some((p) => p.rows && p.rows.some((r) => r.name === 'Grappler' && r.text))`, 'feat after reload');
        errs('add to sheet');

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
        // the Monster Sheet's own search: both copies of a name, the 2024 one badged, and importing it
        await ev(`document.querySelector('[data-act=find]').click()`);
        await until(`document.querySelector('.mon-hit')`, 'monster search');
        await ev(`(() => { const q = document.querySelector('#mon-q'); q.value = 'aboleth'; q.dispatchEvent(new Event('input', { bubbles: true })); })()`);
        await until(`[...document.querySelectorAll('.mon-hit')].length && [...document.querySelectorAll('.mon-hit')].every((h) => /aboleth/i.test(h.textContent))`, 'aboleth found');
        is(`${name} both Aboleths in the search`, await js(`[...document.querySelectorAll('.mon-hit')].filter((h) => h.querySelector('b').firstChild.textContent.trim() === 'Aboleth').map((h) => !!h.querySelector('.badge'))`), [false, true]);
        await ev(`document.querySelector('.mon-hit[data-mon="s24:aboleth"]').click()`);
        const blk = (await (await fetch(BASE + '/sheets/monster/monsters.php?i=s24:aboleth')).json()).m;
        await until(`Object.values(JSON.parse(localStorage.getItem('monster-sheet')).chars).some((c) => /^Aboleth/.test(c.name))`, 'SRD 5.2 monster imported', 20000);
        const abo = Object.values((await store('monster-sheet')).chars).find((c) => /^Aboleth/.test(c.name)), att = abo.panels.find((p) => p.type === 'attacks').rows;
        is(`${name} SRD 5.2 monster's numbers`, [abo.hp.base, abo.cr, abo.abilities[0].score, abo.speeds.map((x) => x.type).sort()], [blk.hit_points, String(blk.cr), blk.strength, Object.keys(blk.speed).filter((k) => k !== 'hover').map((k) => k[0].toUpperCase() + k.slice(1)).sort()]);
        const tent = att.find((r) => r.name === 'Tentacle');
        is(`${name} 2024 attack read`, [tent.mode, tent.dmg.length > 0, tent.range], ['hit', true, '15 ft']);
        ok(`${name} 2024 saving throw action read`, att.some((r) => r.mode === 'save' && +r.dc > 0), att.map((r) => [r.name, r.mode, r.dc]));
        ok(`${name} legendary and traits read`, att.some((r) => r.time === 'Legendary') && abo.panels.find((p) => p.type === 'list').rows.some((r) => r.name === 'Amphibious'));
        ok(`${name} SRD 5.2 source note`, abo.panels.find((p) => p.type === 'notes').notes.some((n) => n.body.includes('SRD 5.2')));
        errs('sheets');

        // credits
        await open('/compendium/');
        await ev(`document.querySelector('#cp-credits-btn').click()`);
        ok(`${name} credits`, await ev(`document.querySelector('#cp-credits').open && document.querySelector('#cp-credits').textContent.includes('Creative Commons Attribution 4.0') && document.querySelector('#cp-credits').textContent.includes('Tome of Beasts')`));
    } catch (e) { bad++; console.log(`FAIL ${name}: ${e.message}`); } finally { b.close(); }
}
console.log(bad ? `${bad} check(s) failed` : 'compendium ok');
process.exit(bad ? 1 : 0);
