// Checks the character builder (/characters/build, ROADMAP 4.2) and Level up (4.3) in headless Chrome and Firefox, the way a
// player uses them: signed out, a level 3 fighter built step by step (3D dice for hit points and 4d6, all in the roll log), a
// reload half way that resumes, changing the class (only its picks reset), Finish opening the sheet, Level up and its Undo, a
// draft in My Characters' Unfinished and Cancel archiving it; signed in, a character built for a campaign with the DM's
// character rules (set on the campaign page) that joins it at Finish and makes one version only. No console errors anywhere.
// Those run on the SRD alone (srd-build.json; the imported content files are blocked), so the picks and numbers are the same
// whatever the content holds. Then, with the content: every class is listed, one opens, and the 2024 rules swap the lists.
//   node _dev/scripts/builder-page.mjs
// Starts its own server on port 8129 with stand-in account and session folders in the temp folder (never private/dnd/).
import { mkdirSync, writeFileSync, rmSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { launch, browsers, serving } from './browser.mjs';

const ROOT = join(import.meta.dirname, '../..'), PORT = 8129 + (+process.env.CHECK_PORT_SHIFT || 0), BASE = `http://localhost:${PORT}`;
const PHP = process.env.PHP || (process.platform === 'win32' ? 'C:/php/php.exe' : 'php');
const TMP = join(tmpdir(), 'dnd-builder-check' + (process.env.CHECK_PORT_SHIFT || '')), ACCOUNTS = join(TMP, 'accounts'), SESSIONS = join(TMP, 'sessions');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ser = (o) => `a:${Object.keys(o).length}:{` + Object.entries(o).map(([k, v]) => `s:${Buffer.byteLength(k)}:"${k}";s:${Buffer.byteLength(v)}:"${v}";`).join('') + '}';
const CAMP = 'abcabcabcabc';
function setup() {
    rmSync(TMP, { recursive: true, force: true });
    mkdirSync(SESSIONS, { recursive: true });
    for (const [who, sub, name] of [['dm', '111', 'Dee'], ['pl', '222', 'Pat']]) writeFileSync(join(SESSIONS, `sess_check${who}0000000000000000000000000`), 'user|' + ser({ sub, email: `${who}@example.com`, name }));
    mkdirSync(join(ACCOUNTS, 'campaigns', CAMP), { recursive: true });
    writeFileSync(join(ACCOUNTS, 'campaigns', CAMP, 'campaign.json'), JSON.stringify({ id: CAMP, name: 'Curse of the Crown', dm: '111', code: 'abcdeabcde', created: 1,
        members: [{ sub: '111', name: 'Dee', joined: 1, characters: [] }, { sub: '222', name: 'Pat', joined: 1, characters: [] }] }));
}

const server = spawn(PHP, ['-S', `127.0.0.1:${PORT}`, '-t', ROOT, join(ROOT, '_dev/router.php')], { env: { ...process.env, DND_ACCOUNTS: ACCOUNTS, DND_SESSIONS: SESSIONS, DND_BACKUPS: join(TMP, 'backups'), DND_MONSTER_BACKUPS: join(TMP, 'monster-backups') }, stdio: 'ignore' });
await serving(BASE + '/privacy/');

let bad = 0;
const is = (name, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) { bad++; console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); } };
try {
    for (const name of browsers) {
        setup();
        const b = await launch(name), ev = b.ev;
        const errs = (where) => { const e = b.errors.filter((x) => !/backup\.php|content\/20\d\d-/.test(x)); if (e.length) { bad++; console.log(`FAIL ${name} ${where}: ${e.join(' | ').slice(0, 800)}`); } };
        const go = async (url) => { await b.go(url); await b.until(`document.readyState === 'complete' && document.querySelector('main')`); };
        const as = async (who) => { await go(BASE + '/privacy/'); await ev(who ? `document.cookie = 'dndsid=check${who}0000000000000000000000000; path=/'` : `document.cookie = 'dndsid=; path=/; max-age=0'`); };
        const click = (sel) => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return 'missing'; e.click(); return 'ok'; })()`).then((r) => { if (r !== 'ok') { bad++; console.log(`FAIL ${name}: nothing to click at ${sel}`); } });
        const pick = (sel, v) => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); e.value = ${JSON.stringify(v)}; e.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
        const type = (sel, v) => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); e.value = ${JSON.stringify(v)}; e.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
        const tick = (sel) => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); e.checked = true; e.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
        const db = async () => JSON.parse(await ev(`localStorage.getItem('hb-sheet') || '{"chars":{}}'`));
        const draft = async () => { const id = new URLSearchParams(await ev('location.search')).get('id'); return (await db()).chars[id]; };
        const h2 = () => ev(`document.querySelector('#bd-step h2')?.textContent`);
        const trace = (m) => process.env.BUILDER_TRACE && console.log(`${name} ${((Date.now() - T0) / 1000).toFixed(1)} s: ${m}`), T0 = Date.now();
        // a click that loads another page: Firefox breaks a wait that starts while the old page is still unloading
        const nav = async (sel) => { await click(sel); await sleep(1000); };
        const step = async (k) => { trace('step ' + k); await click(`[data-act=go][data-k=${k}]`); await b.until(`document.querySelector('[data-act=go][data-k=${k}][aria-current=step]')`); };
        try {
            await b.block(/content\/2014-|content\/2024-/);
            // ---- signed out: a level 3 fighter ----
            await as(null);
            await go(BASE + '/privacy/');
            await ev(`localStorage.clear(); localStorage.setItem('hb-sheet-merged', '1'); 0`);
            await go(BASE + '/characters/');
            await click('[data-act=create]');
            is(`${name} Create asks Build or Blank`, await ev(`[document.querySelector('#ch-new').open, [...document.querySelectorAll('#ch-new .hub-card')].map((a) => a.getAttribute('href')).join()].join()`), 'true,/characters/build,/characters/new');
            await go(BASE + '/characters/build');
            await b.until(`document.querySelector('[data-b=name]')`);
            is(`${name} nothing saved before the first change`, Object.keys((await db()).chars).length, 0);
            await type('[data-b=name]', 'Brannoc');
            await click('[name=level][value="3"]');
            await b.until(`location.search.includes('id=')`);
            is(`${name} the draft is a real character`, (({ name: n, draft: d, updated: u }) => [n, d, u > 0])(await draft()), ['Brannoc', 1, true]);
            await click('[data-act=next]');
            await b.until(`document.querySelector('[data-act=cls][data-id=fighter]')`);
            is(`${name} class list has search and every SRD class`, await ev(`[!!document.querySelector('[data-q=classes]'), document.querySelectorAll('#bd-list-classes .bd-row').length].join()`), 'true,12');
            await type('[data-q=classes]', 'wiz');
            is(`${name} search filters`, await ev(`[...document.querySelectorAll('#bd-list-classes .bd-row .bd-nm')].map((x) => x.firstChild.textContent.trim()).join()`), 'Wizard');
            await type('[data-q=classes]', '');
            await click('[data-act=cls][data-id=fighter]');
            await b.until(`document.querySelector('.bd-hero h2')?.textContent === 'Fighter'`);
            await tick('[data-pick="classes.0.profs.0"][value=skill-athletics]');
            await tick('[data-pick="classes.0.profs.0"][value=skill-perception]');
            await tick('[data-pick="classes.0.opts.fighter-fighting-style@1"][value=fighter-fighting-style-defense]');
            await click('[name="classes.0.sub"][value=champion]');
            await b.until(`(document.querySelector('[name="classes.0.sub"]:checked') || {}).value === 'champion'`);
            is(`${name} a third pick past the limit is refused`, await ev(`document.querySelector('[data-pick="classes.0.profs.0"][value=skill-history]').disabled`), true);
            await click('[name=hpmode][value=roll]');
            await b.until(`document.querySelector('[data-act=hproll]')`);
            await click('[data-act=hproll]');
            await b.until(`[...document.querySelectorAll('.bd-hp b')].every((x) => x.textContent !== '–')`, 60000);
            let d = await draft();
            is(`${name} hit point rolls in the draft's roll log, with their dice`, d.rolls.map((r) => [r.title, r.dice?.[0]?.[0]]), [['Hit points, level 3', 10], ['Hit points, level 2', 10]]);
            is(`${name} hp from the rolls`, d.hp.base, 10 + d.build.hp.rolls[2] + d.build.hp.rolls[3]);
            // reload half way: it resumes on the same step with every pick
            await b.go(await ev('location.href'));
            await b.until(`document.querySelector('.bd-hero h2')?.textContent === 'Fighter'`);
            is(`${name} resumes after a reload`, await ev(`[location.hash, document.querySelector('[data-pick="classes.0.profs.0"][value=skill-athletics]').checked, document.querySelector('[name="classes.0.sub"]:checked')?.value].join()`), '#class,true,champion');

            // race: the dwarf's one subrace is picked for you
            await click('[data-act=next]');
            await click('[data-act=race][data-id=dwarf]');
            await b.until(`document.querySelector('.bd-hero h2')?.textContent === 'Hill Dwarf'`);
            await pick('[data-b="raceOpts.p:tool-proficiency.0"]', 'smiths-tools');
            // Back to the class: a new class clears only the class's own picks (the race stays)
            await step('class');
            await click('[data-act=clslist]');
            await click('[data-act=cls][data-id=wizard]');
            await b.until(`document.querySelector('.bd-hero h2')?.textContent === 'Wizard'`);
            d = await draft();
            is(`${name} a new class resets only its own picks`, [d.build.classes[0].id, Object.keys(d.build.classes[0].profs).length, d.build.race, d.build.raceOpts['p:tool-proficiency']], ['wizard', 0, 'dwarf', ['smiths-tools']]);
            await click('[data-act=clslist]');
            await click('[data-act=cls][data-id=fighter]');
            await b.until(`document.querySelector('.bd-hero h2')?.textContent === 'Fighter'`);
            await tick('[data-pick="classes.0.profs.0"][value=skill-athletics]');
            await tick('[data-pick="classes.0.profs.0"][value=skill-survival]');
            await tick('[data-pick="classes.0.opts.fighter-fighting-style@1"][value=fighter-fighting-style-defense]');
            await click('[name="classes.0.sub"][value=champion]');

            // ability scores: 4d6 drop lowest, six separate 3D throws
            await step('abilities');
            await click('[data-act=method][data-m=roll]');
            for (let i = 1; i <= 6; i++) { trace('set ' + i);
                await b.until(`document.querySelector('[data-act=rollset]') && !document.querySelector('[data-act=rollset]').disabled`, 60000);
                await click('[data-act=rollset]');
                await b.until(`document.querySelectorAll('.bd-set:not(.dim)').length === ${i}`, 60000);
            }
            d = await draft();
            const sets = d.rolls.filter((r) => r.expr === '4d6 drop lowest');
            is(`${name} six 4d6 rolls logged, lowest struck`, [sets.length, sets.every((r) => r.dice[0][1].length === 4 && /~\d~/.test(r.shown) && r.total === r.dice[0][1].reduce((a, x) => a + x, 0) - Math.min(...r.dice[0][1]))], [6, true]);
            for (const [i, a] of ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'].entries()) await pick(`[data-b="assign.${a}"]`, String(i));
            d = await draft();
            is(`${name} scores from the sets plus racial bonuses`, d.abilities.map((x) => x.score), d.build.sets.map((s, i) => s.t + [0, 0, 2, 0, 1, 0][i]));

            // background: languages, faith, personality rolled, backstory
            await step('background');
            await click('[data-act=bg][data-id=acolyte]');
            await b.until(`document.querySelector('[data-b="details.faith"]')`);
            await pick('[data-b="bgOpts.langs.0"]', 'elvish');
            await pick('[data-b="details.alignment"]', 'Lawful good');
            await type('[data-b="details.faith"]', 'Moradin');
            await type('[data-b="details.backstory"]', 'Raised under the mountain.');
            await click('[data-act=persroll][data-k=traits]');
            await b.until(`document.querySelector('[data-b="details.traits"]')?.value`, 60000);
            await step('equipment');
            await step('review');
            trace('on review');
            is(`${name} review shows the character`, await ev(`[document.querySelector('.bd-review b').textContent, !!document.querySelector('.bd-review').textContent.includes('Moradin'), !!document.querySelector('.bd-review').textContent.includes('Chain mail')].join()`), 'Brannoc,true,true');
            trace('review checked');
            errs('the builder');
            const id = new URLSearchParams(await ev('location.search')).get('id');
            await nav('[data-act=next]');
            await b.until(`location.pathname === '/characters/${id}' && document.querySelector('[data-k=name]')`, 30000);
            trace('on the sheet');
            const c = (await db()).chars[id];
            trace('read the sheet');
            is(`${name} finished: a normal character`, [c.draft, c.name, c.race, c.classes.map((k) => `${k.name} ${k.level}`).join(), c.ac, c.panels.find((p) => p.type === 'details').f.faith], [0, 'Brannoc', 'Hill Dwarf', 'Fighter 3', '16 [Chain mail] + 1 [Defense] + 2 [Shield]', 'Moradin']);
            is(`${name} the sheet says it's ready, and shows the details panel`, await ev(`[document.querySelector('.toasts')?.textContent.includes('is ready'), [...document.querySelectorAll('.hb-tabs button, .hb-panel h2')].some((x) => x.textContent === 'Character details')].join()`), 'true,true');
            errs('the finished sheet');
            trace('sheet checked');

            // level up: fighter 4 takes an ability score improvement, then Undo
            await nav('#hb-barin a[href^="/characters/build?up="]');
            await b.until(`document.querySelector('[data-act=upcls][data-id=fighter]')`);
            await click('[data-act=upcls][data-id=fighter]');
            await b.until(`document.querySelector('[data-b="entry.asi.4.k"]')`);
            await pick('[data-b="entry.asi.4.k"]', '+2');
            await pick('[data-b="entry.asi.4.a.0"]', 'STR');
            await step('review');
            is(`${name} level up review`, await ev(`document.querySelector('.bd-review').textContent.includes('Fighter 4')`), true);
            const str = c.abilities[0].score;
            await nav('[data-act=next]');
            await b.until(`location.pathname === '/characters/${id}' && document.querySelector('.hb-undo')`, 15000);
            const up = (await db()).chars[id];
            is(`${name} levelled up`, [up.classes[0].level, up.abilities[0].score, up.build.ups.length], [4, Math.min(20, str + 2), 1]);
            await click('.hb-undo button');
            await b.until(`JSON.parse(localStorage.getItem('hb-sheet')).chars['${id}'].classes[0].level === 3`);
            const back = (await db()).chars[id];
            // the sheet fills a few defaults when it opens a character (normalise: passive units, miscCat, sorcery points used)
            const plain = (x) => JSON.stringify(x, (k, v) => (['updated', 'calc', 'view', 'rolls', 'unit', 'miscCat', 'used'].includes(k) ? undefined : v));
            is(`${name} Undo gives back the exact character`, plain(back), plain(c));
            errs('level up');

            // My Characters: an unfinished one, Resume, and Cancel archives it
            await go(BASE + '/characters/build');
            await b.until(`document.querySelector('[data-b=name]')`);
            await type('[data-b=name]', 'Half done');
            await b.until(`location.search.includes('id=')`);
            await go(BASE + '/characters/');
            is(`${name} Unfinished with Resume, not in the grid`, await ev(`[!document.querySelector('#ch-draft').hidden, document.querySelector('#ch-draft-grid .ch-card b')?.textContent, document.querySelector('#ch-draft-grid .ch-acts a')?.textContent, [...document.querySelectorAll('#ch-grid .ch-card b')].map((x) => x.textContent).join()].join('|')`), 'true|Half done|Resume|Brannoc');
            await nav('#ch-draft-grid .ch-acts a');
            await b.until(`document.querySelector('[data-b=name]')?.value === 'Half done'`);
            await ev(`window.confirm = () => true; 0`);
            await nav('[data-act=cancel]');
            await b.until(`location.pathname === '/characters/' && document.querySelector('#ch-arc')`);
            is(`${name} Cancel archives the draft`, await ev(`[document.querySelector('#ch-draft').hidden, document.querySelector('#ch-arc-grid').textContent.includes('Half done')].join()`), 'true,true');
            errs('My Characters');

            // ---- signed in: the DM's character rules, a character built for the campaign ----
            await as('dm');
            await go(BASE + '/campaigns/' + CAMP);
            await ev(`document.querySelectorAll('#cp-rulesf input').forEach((i) => { i.checked = ['std', 'avg'].includes(i.value); }); 0`);
            await click('#cp-rulesf [type=submit]');
            await b.until(`document.querySelector('.toasts')?.textContent.includes('Saved the character rules')`);
            is(`${name} rules saved`, JSON.parse(readFileSync(join(ACCOUNTS, 'campaigns', CAMP, 'campaign.json'), 'utf8')).rules, { methods: ['std'], hp: ['avg'] });
            errs('campaign rules');
            await as('pl');
            await go(BASE + '/campaigns/' + CAMP);
            is(`${name} players see the rules`, await ev(`document.querySelector('#cp-rules p').textContent`), 'Ability scores: Standard array. Hit points: take the average.');
            await go(BASE + '/characters/build');
            await b.until(`document.querySelector('[data-b=camp]')`);
            await type('[data-b=name]', 'Vex');
            await pick('[data-b=camp]', CAMP);
            await step('class');
            await click('[data-act=cls][data-id=wizard]');
            await b.until(`document.querySelector('.bd-hero h2')?.textContent === 'Wizard'`);
            is(`${name} hit points follow the DM's rules`, await ev(`[!document.querySelector('[name=hpmode]'), document.querySelector('#bd-step').textContent.includes("Your DM's rules: take the average")].join()`), 'true,true');
            await tick('[data-pick="classes.0.spells"][value=fire-bolt]');
            await step('abilities');
            is(`${name} only the DM's ability score methods`, await ev(`[...document.querySelectorAll('[data-act=method]')].map((x) => x.dataset.m).join()`), 'std');
            for (const [i, a] of ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'].entries()) await pick(`[data-b="std.${a}"]`, String([8, 14, 13, 15, 12, 10][i]));
            await step('review');
            const vid = new URLSearchParams(await ev('location.search')).get('id');
            await sleep(2000); // the draft's account copy (sent 1.5 s after the last change)
            is(`${name} a draft makes no versions in the account`, existsSync(join(ACCOUNTS, 'characters', vid, 'history')) ? readdirSync(join(ACCOUNTS, 'characters', vid, 'history')).length : 0, 0);
            await nav('[data-act=next]');
            await b.until(`location.pathname === '/characters/${vid}' && document.querySelector('[data-k=name]')`, 15000);
            await sleep(500);
            const hist = readdirSync(join(ACCOUNTS, 'characters', vid, 'history')).filter((f) => /^\d+\.json$/.test(f));
            is(`${name} Finish makes the first version`, [hist, JSON.parse(readFileSync(join(ACCOUNTS, 'characters', vid, 'character.json'), 'utf8')).draft], [['1.json'], 0]);
            is(`${name} it joined the campaign`, JSON.parse(readFileSync(join(ACCOUNTS, 'campaigns', CAMP, 'campaign.json'), 'utf8')).members[1].characters, [{ sheet: 'player', id: vid }]);
            is(`${name} its spell`, (await db()).chars[vid].panels.find((p) => p.type === 'spells').rows.map((r) => r.name), ['Fire Bolt']);
            errs('signed in');
        } finally { b.close(); }

        // ---- with the imported content: more classes, each rules version on its own ----
        const idx = JSON.parse(readFileSync(join(ROOT, 'sheets/player/content/index.json'), 'utf8'));
        if (idx.files?.length) {
            const c2 = await launch(name);
            try {
                await c2.go(BASE + '/privacy/');
                await c2.ev(`localStorage.clear(); document.cookie = 'dndsid=; path=/; max-age=0'; 0`);
                await c2.go(BASE + '/characters/build#class');
                await c2.until(`document.querySelectorAll('#bd-list-classes .bd-row').length`, 20000).catch(async (e) => { console.log('content page:', await c2.ev(`location.href + ' ' + document.querySelector('#bd-step')?.textContent.slice(0, 200)`), c2.errors.join(' | ')); throw e; });
                const n14 = idx.counts?.['2014']?.classes;
                is(`${name} content: every 2014 class listed`, await c2.ev(`document.querySelectorAll('#bd-list-classes .bd-row').length`), Object.keys(JSON.parse(readFileSync(join(ROOT, 'sheets/player/content/2014-classes.json'), 'utf8')).classes).length + Object.keys(JSON.parse(readFileSync(join(ROOT, 'sheets/player/srd-build.json'), 'utf8')).classes).filter((k) => !JSON.parse(readFileSync(join(ROOT, 'sheets/player/content/2014-classes.json'), 'utf8')).classes[k]).length);
                // the icon tiles (icons.json): the classes with a symbol show it
                is(`${name} content: class icons show`, await c2.ev(`document.querySelectorAll('#bd-list-classes .bd-ic svg').length >= 12`), true);
                // a core class from the wiki, with the SRD's picks merged in: fighting styles and equipment choices to click
                await c2.ev(`document.querySelector('[data-act=cls][data-id=fighter]').click(), 1`);
                await c2.until(`document.querySelector('.bd-hero h2')?.textContent === 'Fighter'`);
                is(`${name} content: the fighter's fighting styles are picks`, await c2.ev(`document.querySelectorAll('[data-pick="classes.0.opts.' + (document.querySelector('[data-pick*=".opts."]')?.dataset.pick.split('.').pop() || 'x') + '"]').length >= 6`), true);
                await c2.ev(`document.querySelector('[data-act=go][data-k=equipment]').click(), 1`);
                await c2.until(`document.querySelector('.bd-eq')`, 20000);
                is(`${name} content: the fighter's starting equipment is choices, not text`, await c2.ev(`[!!document.querySelector('.bd-eq input[type=radio]'), !document.querySelector('[data-b^="equip.picks."][data-b$=".text"]')].join()`), 'true,true');
                await c2.ev(`document.querySelector('[data-act=go][data-k=class]').click(), 1`);
                await c2.ev(`document.querySelector('[data-act=clslist]')?.click(), 1`);
                await c2.ev(`document.querySelector('[data-act=cls][data-id=artificer]').click(), 1`);
                await c2.until(`document.querySelector('.bd-hero h2')?.textContent === 'Artificer'`);
                is(`${name} content: no source labels (the owner's rule; they're on /credits/)`, await c2.ev(`/wikidot|From /.test(document.querySelector('#bd-step').textContent.slice(0, 200))`), false);
                await c2.ev(`document.querySelector('[data-act=go][data-k=name]').click(), 1`);
                await c2.until(`document.querySelector('[data-b=rules]')`);
                await c2.ev(`(() => { const e = document.querySelector('[data-b=rules]'); e.value = '2024'; e.dispatchEvent(new Event('change', { bubbles: true })); return 1; })()`);
                await sleep(1500);
                // the 2024 Artificer is kept (both rules have one), so its page opens; Change class shows the 2024 list
                await c2.ev(`document.querySelector('[data-act=go][data-k=class]').click(), 1`);
                await c2.ev(`document.querySelector('[data-act=clslist]')?.click(), 1`);
                await c2.until(`document.querySelectorAll('#bd-list-classes .bd-row').length`, 20000);
                is(`${name} content: 2024 rules list the 2024 classes only`, await c2.ev(`document.querySelectorAll('#bd-list-classes .bd-row').length`), n14 === undefined ? 0 : idx.counts['2024'].classes);
                const e = c2.errors.filter((x) => !/backup\.php/.test(x));
                if (e.length) { bad++; console.log(`FAIL ${name} with the content: ${e.join(' | ').slice(0, 800)}`); }
            } finally { c2.close(); }
        }
    }
} finally { server.kill(); rmSync(TMP, { recursive: true, force: true }); }
console.log(bad ? `${bad} check(s) failed` : 'builder page ok');
process.exit(bad ? 1 : 0);
