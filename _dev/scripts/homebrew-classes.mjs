// Checks homebrew classes, subclasses, races, subraces and backgrounds (ROADMAP 4.6) in headless Chrome and Firefox. The roadmap's line: a custom class built in the guided form by one
// member, picked in the builder by another member of the campaign, and levelled 1 to 3. On the way: the full-screen steps, Unfinished (saved as you go, only its owner sees it, can't be
// shared or picked), the refused name, Start from, (a) or (b) equipment; a draft keeps its copy when the class is archived and when it's taken out of the campaign; at level up "Dee updated
// Mire Stalker. Use the new version?", Keep mine and Yes, and earlier rows never change; the base race; a campaign's homebrew only for characters built for it.
//   node _dev/scripts/homebrew-classes.mjs        (needs includes/config.php for sign-in)
// Starts its own server (port 8140 + CHECK_PORT_SHIFT) with stand-in folders in the temp folder, so it never touches private/dnd.
import { mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { launch, browsers, serving } from './browser.mjs';

const ROOT = join(import.meta.dirname, '../..'), PORT = 8140 + (+process.env.CHECK_PORT_SHIFT || 0), BASE = `http://localhost:${PORT}`;
const PHP = process.env.PHP || (process.platform === 'win32' ? 'C:/php/php.exe' : 'php');
const TMP = join(tmpdir(), 'dnd-hbclasses-check' + (process.env.CHECK_PORT_SHIFT || '')), ACCOUNTS = join(TMP, 'accounts'), SESSIONS = join(TMP, 'sessions');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ser = (o) => `a:${Object.keys(o).length}:{` + Object.entries(o).map(([k, v]) => `s:${Buffer.byteLength(k)}:"${k}";s:${Buffer.byteLength(v)}:"${v}";`).join('') + '}';
const DM = 'hbclassesdm0000000000000000000000000', PLAYER = 'hbclassesplayer00000000000000000000', CAMP = 'abcabcabcabf', OTHER = 'abcabcabcabg';

let bad = 0;
const is = (name, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) { bad++; console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); } };
const until = async (fn, ok = Boolean, ms = 15000) => { const t = Date.now(); let v; while (Date.now() - t < ms) { v = await fn(); if (ok(v)) return v; await sleep(150); } return v; };
const web = spawn(PHP, ['-S', `127.0.0.1:${PORT}`, '-t', ROOT, join(ROOT, '_dev/router.php')], { stdio: 'ignore', env: { ...process.env, DND_ACCOUNTS: ACCOUNTS, DND_SESSIONS: SESSIONS, DND_BACKUPS: join(TMP, 'backups'), DND_MONSTER_BACKUPS: join(TMP, 'monster-backups') } });
await serving(BASE + '/privacy/');

const J = JSON.stringify;
// an official race with no subraces in either file
const origins = JSON.parse(readFileSync(join(ROOT, 'sheets/player/content/2014-origins.json'), 'utf8')), srd = JSON.parse(readFileSync(join(ROOT, 'sheets/player/srd-build.json'), 'utf8'));
const allSubs = [...Object.values(origins.subraces || {}), ...Object.values(srd.subraces || {})], loneRace = Object.values({ ...srd.races, ...origins.races }).find((r) => !allSubs.some((x) => (x.race?.index || x.race) === r.index));
const LONE = loneRace.index, LONE_NAME = loneRace.name;
const click = (b, sel) => b.ev(`(() => { const e = document.querySelector(${J(sel)}); if (e) e.click(); return !!e; })()`);
const clickW = (b, sel) => until(() => click(b, sel));
const visible = (b, sel) => b.ev(`(() => { const e = document.querySelector(${J(sel)}); return !!e && !e.hidden && e.getClientRects().length > 0; })()`);
const body = (b) => b.ev(`document.querySelector('#cp-dbody').textContent`);
const signIn = async (b, cookie, path) => { await b.block(/backup\.php/); await b.go(BASE + '/privacy/'); await b.ev(`localStorage.clear(); ${cookie ? `document.cookie = 'dndsid=${cookie}; path=/'` : ''}`); await b.go(BASE + path); };
const errs = (b, name, where) => { const e = b.errors.filter((x) => !/backup\.php|act=share/.test(x)); if (e.length) { bad++; console.log(`FAIL ${name} ${where}: ${e.join(' | ').slice(0, 700)}`); } };
const entries = (sub) => { try { return readdirSync(join(ACCOUNTS, 'homebrew', sub)).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(ACCOUNTS, 'homebrew', sub, f), 'utf8'))); } catch { return []; } };
const entry = (n) => entries('111').find((e) => e.name === n);
const search = (b, n) => b.ev(`(() => { const q = document.querySelector('#cp-q'); q.value = ${J(n)}; q.dispatchEvent(new Event('input', { bubbles: true })); })()`);
const hasRow = (b, n) => b.ev(`[...document.querySelectorAll('#cp-list .cp-row')].some((r) => r.querySelector('.cp-name').textContent === ${J(n)})`);
const openRow = async (b, n) => {
    await search(b, n);
    await until(() => b.ev(`(() => { const r = [...document.querySelectorAll('#cp-list .cp-row')].find((x) => x.querySelector('.cp-name').textContent === ${J(n)}); if (r) r.click(); return !!r; })()`));
    await until(() => b.ev(`document.querySelector('#cp-dbody h2')?.textContent === ${J(n)}`));
};
// in the form: set a field by its path, as a player's typing would
const put = (b, path, v) => until(() => b.ev(`(() => { const e = document.querySelector('#cp-hbw-body [data-w=${J(path)}]'); if (!e) return false; e.value = ${J(String(v))}; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`));
const tick = (b, path, ...vals) => b.ev(`(() => { for (const v of ${J(vals)}) { const e = document.querySelector('#cp-hbw-body [data-w=${J(path)}][value=' + JSON.stringify(v) + ']'); if (!e.checked) e.click(); } })()`);
const wa = (b, act, attrs = '') => clickW(b, `#cp-hbw-body [data-wa=${act}]${attrs}`);
const next = async (b) => { const was = await b.ev(`document.querySelector('[data-wstep][aria-current]').textContent`); await click(b, '#cp-hbw-next'); await until(() => b.ev(`document.querySelector('[data-wstep][aria-current]')?.textContent !== ${J(was)}`)); };
const finish = async (b) => { await until(() => b.ev(`!document.querySelector('#cp-hbw-next').disabled && document.querySelector('#cp-hbw-next').textContent === 'Finish'`)); await click(b, '#cp-hbw-next'); await until(() => b.ev(`!document.querySelector('#cp-hbw').open`)); };
const toStep = (b, label) => clickW(b, `#cp-hbw-steps button:nth-of-type(1)`).then(() => b.ev(`[...document.querySelectorAll('[data-wstep]')].find((x) => x.textContent.includes(${J(label)})).click()`));
const newOf = async (b, tab, second) => { await click(b, `#cp-tabs [data-tab=${tab}]`); await until(() => visible(b, second ? '#cp-new2' : '#cp-new')); await click(b, second ? '#cp-new2' : '#cp-new'); await until(() => b.ev(`document.querySelector('#cp-hbw')?.open === true`), Boolean, 30000); };
const shareIt = async (b) => { await until(() => visible(b, '[data-hb-share]')); const was = (await shares()).length; await click(b, '[data-hb-share]'); await until(shares, (s) => s.length === was + 1); };
const shares = () => { try { return JSON.parse(readFileSync(join(ACCOUNTS, 'campaigns', CAMP, 'homebrew.json'), 'utf8')); } catch { return []; } };
const chars = (b) => b.ev(`localStorage.getItem('hb-sheet') || '{"chars":{}}'`).then((t) => JSON.parse(t).chars);
const rowOf = (c, t, n) => c.panels.find((p) => p.type === t).rows.find((r) => r.name === n);

try {
    for (const name of browsers) {
        rmSync(TMP, { recursive: true, force: true });
        mkdirSync(SESSIONS, { recursive: true });
        for (const [s, sub, n] of [[DM, '111', 'Dee'], [PLAYER, '222', 'Pat']]) writeFileSync(join(SESSIONS, 'sess_' + s), 'user|' + ser({ sub, email: n + '@example.com', name: n }));
        for (const [cid, cname] of [[CAMP, 'Stonehold'], [OTHER, 'Elsewhere']]) {
            mkdirSync(join(ACCOUNTS, 'campaigns', cid), { recursive: true });
            writeFileSync(join(ACCOUNTS, 'campaigns', cid, 'campaign.json'), J({ id: cid, name: cname, dm: '111', code: cid === CAMP ? 'aaaaaaaaaa' : 'bbbbbbbbbb', members: [{ sub: '111', name: 'Dee', joined: 1, characters: [] }, { sub: '222', name: 'Pat', joined: 1, characters: [] }] }));
        }

        // ---- Dee makes a class, stopping half way ----
        const dee = await launch(name);
        let classId;
        try {
            await signIn(dee, DM, '/compendium/?tab=class');
            await until(() => visible(dee, '#cp-new'));
            is(`${name} two buttons`, await dee.ev(`[document.querySelector('#cp-new').textContent, document.querySelector('#cp-new2').textContent].join()`), 'New class,New subclass');
            await newOf(dee, 'class');
            is(`${name} a full-screen popup`, await dee.ev(`(() => { const r = document.querySelector('#cp-hbw').getBoundingClientRect(); return r.width >= innerWidth - 1 && r.height >= innerHeight - 1; })()`), true);
            is(`${name} in steps`, await dee.ev(`[...document.querySelectorAll('[data-wstep]')].map((b) => b.textContent.replace(/^\\d+\\. /, '')).join()`), 'Basics,Proficiencies,Levels and features,Spellcasting,Resources,Starting equipment,Multiclassing,Review');
            is(`${name} Back waits`, await dee.ev(`document.querySelector('#cp-hbw-back').disabled`), true);
            await put(dee, 'name', 'Fighter');
            await toStep(dee, 'Review');
            is(`${name} an official class's name is refused`, await until(() => dee.ev(`document.querySelector('#cp-hbw-body .err')?.textContent.includes("There's already a Fighter") && document.querySelector('#cp-hbw-next').disabled`)), true);
            await toStep(dee, 'Basics');
            await put(dee, 'name', 'Mire Stalker');
            await put(dee, 'hitDie', 10);
            await put(dee, 'text', 'Hunts with blood.');
            is(`${name} saved as Unfinished as you go`, (await until(() => entry('Mire Stalker')))?.unfinished, 1);
            classId = entry('Mire Stalker').id;
            await click(dee, '#cp-hbw-close');
            await until(() => dee.ev(`!document.querySelector('#cp-hbw').open`));
            await search(dee, 'Mire Stalker');
            is(`${name} listed for its owner, marked`, await until(() => dee.ev(`[...document.querySelectorAll('#cp-list .cp-row')].some((r) => r.textContent.includes('Mire Stalker') && r.textContent.includes('Unfinished'))`)), true);
            await openRow(dee, 'Mire Stalker');
            is(`${name} Unfinished can't be shared`, await dee.ev(`!document.querySelector('[data-hb-share]') && !!document.querySelector('[data-hb-edit]')`), true);
            is(`${name} nor by asking the server`, await dee.ev(`fetch('/compendium/homebrew.php?act=share', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: ${J(classId)}, c: ${J(CAMP)}, on: true }) }).then((r) => r.status)`), 400);
            is(`${name} nor picked`, await dee.ev(`Homebrew.all().some((x) => x.name === 'Mire Stalker')`), false);

            // ---- carries on: every step ----
            await click(dee, '[data-hb-edit]');
            await until(() => dee.ev(`document.querySelector('#cp-hbw').open`), Boolean, 30000);
            await until(() => dee.ev(`document.querySelector('#cp-hbw-body [data-w=name]')?.value === 'Mire Stalker'`));
            await next(dee);
            await tick(dee, 'saves', 'STR', 'WIS');
            await tick(dee, 'armour', 'light-armor');
            await tick(dee, 'weapons', 'simple-weapons');
            await put(dee, 'skillChoose', 2);
            await tick(dee, 'skillFrom', 'Arcana', 'Stealth', 'Survival');
            await next(dee);
            await put(dee, 'subLevel', 2);
            await put(dee, 'subLabel', 'Hunter order');
            await wa(dee, 'addcol');
            await put(dee, 'columns.0.name', 'Rites');
            for (let l = 0; l < 5; l++) await put(dee, `columns.0.values.${l}`, l + 1);
            await wa(dee, 'addfeat', '[data-i="1"]');
            await put(dee, 'levels.0.feats.0.name', 'Rage');
            await put(dee, 'levels.0.feats.0.text', 'Not the official one.');
            await put(dee, 'levels.0.feats.0.uses', 'PROF');
            await put(dee, 'levels.0.feats.0.reset', 'short');
            await put(dee, 'levels.0.feats.0.grants', 'Perception');
            await wa(dee, 'addfeat', '[data-i="1"]');
            await put(dee, 'levels.0.feats.1.name', 'Hunter style');
            await wa(dee, 'addopt', '[data-p="levels.0.feats.1"]');
            await put(dee, 'levels.0.feats.1.options.0.name', 'Dueling');
            await wa(dee, 'addopt', '[data-p="levels.0.feats.1"]');
            await put(dee, 'levels.0.feats.1.options.1.name', 'Stalking');
            await wa(dee, 'addfeat', '[data-i="2"]');
            await put(dee, 'levels.1.feats.0.name', 'Crimson eye');
            await wa(dee, 'addfeat', '[data-i="3"]');
            await put(dee, 'levels.2.feats.0.name', 'Blood sense');
            await dee.ev(`(() => { const c = document.querySelector('[data-asi="2"]'); if (!c.checked) c.click(); })()`);
            await until(() => dee.ev(`document.querySelector('[data-asi="2"]')?.checked`));
            await next(dee);
            await put(dee, 'caster', 'half');
            await until(() => dee.ev(`document.querySelector('[data-w="slots.1.0"]')?.value === '2'`));
            is(`${name} the half caster table fills in`, await dee.ev(`[document.querySelector('[data-w="slots.0.0"]').value, document.querySelector('[data-w="slots.4.1"]').value].join()`), '0,2');
            await put(dee, 'ability', 'INT');
            await put(dee, 'spellsKnown.1', 2);
            await put(dee, 'spellsKnown.2', 3);
            await dee.ev(`(() => { const s = document.querySelector('[data-copylist]'); s.value = 'paladin'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
            is(`${name} a list copied from a class`, await until(() => dee.ev(`[...document.querySelectorAll('.cp-hblist li')].some((l) => l.textContent.includes('Bless'))`)), true);
            await next(dee);
            await wa(dee, 'addres');
            await put(dee, 'resources.0.name', 'Crimson rite');
            await put(dee, 'resources.0.reset', 'short');
            await put(dee, 'resources.0.values.0', 1);
            await put(dee, 'resources.0.values.1', 2);
            await put(dee, 'resources.0.values.2', 2);
            await wa(dee, 'addres');
            await put(dee, 'resources.1.name', 'Blood points');
            await put(dee, 'resources.1.maxType', 'column');
            await put(dee, 'resources.1.column', 'Rites');
            await put(dee, 'resources.1.at', 2);
            await wa(dee, 'addres');
            await put(dee, 'resources.2.name', 'Bad');
            await put(dee, 'resources.2.maxType', 'formula');
            await put(dee, 'resources.2.formula', '1 +');
            await toStep(dee, 'Review');
            is(`${name} a broken formula stops Finish`, await until(() => dee.ev(`document.querySelector('#cp-hbw-body .err')?.textContent.includes('Bad:') && document.querySelector('#cp-hbw-next').disabled`)), true);
            await toStep(dee, 'Resources');
            await put(dee, 'resources.2.formula', 'MIRESTALKER_LEVEL + 1');
            await toStep(dee, 'Starting equipment');
            await wa(dee, 'additem', '[data-p="equip.fixed"]');
            await put(dee, 'equip.fixed.0.name', 'Dagger');
            await wa(dee, 'addchoice');
            await put(dee, 'equip.choices.0.options.0.items.0.name', 'Longsword');
            await put(dee, 'equip.choices.0.options.1.items.0.name', 'Shield');
            await wa(dee, 'addcat', '[data-p="equip.choices.0.options.1.items"]');
            await put(dee, 'equip.choices.0.options.1.items.1.cat', 'simple-weapons');
            await wa(dee, 'addtyped');
            await put(dee, 'equip.choices.1.text', 'A keepsake');
            await put(dee, 'goldN', 3);
            await put(dee, 'goldMult', 10);
            // the form at phone width
            await dee.shot(320, 700);
            is(`${name} the form fits 320 px`, await dee.ev(`(() => { const d = document.querySelector('#cp-hbw'), b = document.querySelector('#cp-hbw-body'); return JSON.stringify([b.scrollWidth <= b.clientWidth + 1 && d.scrollWidth <= d.clientWidth + 1, b.scrollWidth, b.clientWidth, d.scrollWidth, d.clientWidth, innerWidth, [...b.querySelectorAll('*')].filter((e) => e.getBoundingClientRect().right > innerWidth + 1).slice(0, 4).map((e) => e.tagName + '.' + (e.dataset.w||e.type) + ':' + e.parentElement.className + ':' + Math.round(e.getBoundingClientRect().right))]); })()`).then((t) => { const r = JSON.parse(t); if (!r[0]) console.log('WIDE', t); return r[0]; }), true);
            await dee.shot(1366, 800);
            await toStep(dee, 'Review');
            const review = await until(() => dee.ev(`document.querySelector('.cp-hbreview')?.textContent || ''`));
            is(`${name} the review reads as the Compendium will`, ['Hit die', 'd10', 'Rage', 'Crimson eye', 'Rites', '(a) Longsword or (b) Shield'].map((t) => review.includes(t)), [true, true, true, true, true, true]);
            await finish(dee);
            is(`${name} finished, no longer Unfinished`, (await until(() => entry('Mire Stalker'), (e) => e && !e.unfinished))?.unfinished, undefined);
            is(`${name} and open in the Compendium`, (await until(() => body(dee), (t) => t.includes('Hunts with blood.'))).includes('Hunter order') || (await body(dee)).includes('Mire Stalker table'), true);
            is(`${name} a resource refs its column`, entry('Mire Stalker').resources[1].column, 'Rites');
            await shareIt(dee);

            // ---- a subclass of it, a subclass on an official class with the warning, a race, a subrace, a background; Start from ----
            await newOf(dee, 'class', true);
            await put(dee, 'name', 'Order of the Ghost');
            await put(dee, 'parent', 'hb-' + classId);
            await next(dee);
            await wa(dee, 'addfeat', '[data-i="2"]');
            await put(dee, 'levels.0.feats.0.name', 'Ghost step');
            await toStep(dee, 'Review');
            await finish(dee);
            await until(() => entry('Order of the Ghost'), (e) => e && !e.unfinished);
            await until(() => body(dee), (t) => t.includes('Mire Stalker'));
            await shareIt(dee);
            await newOf(dee, 'class', true);
            await put(dee, 'name', 'Early Path');
            await put(dee, 'parent', 'fighter');
            await next(dee);
            await wa(dee, 'addfeat', '[data-i="1"]');
            await put(dee, 'levels.0.feats.0.name', 'Too soon');
            await dee.ev(`document.querySelector('#cp-hbw-body [data-w="levels.0.feats.0.name"]').dispatchEvent(new Event('change', { bubbles: true }))`);
            await toStep(dee, 'Basics');
            await toStep(dee, 'Features');
            is(`${name} an early feature is warned about`, await until(() => dee.ev(`document.querySelector('#cp-hbw-body .note')?.textContent.includes('picks its subclass at level 3') === true`)), true);
            await toStep(dee, 'Review');
            await finish(dee);
            await until(() => entry('Early Path'), (e) => e && !e.unfinished);
            await shareIt(dee);
            await click(dee, '#cp-tabs [data-tab=race]');
            await newOf(dee, 'race');
            await put(dee, 'name', 'Bogfolk');
            await put(dee, 'speed', 25);
            await next(dee);
            await wa(dee, 'addbonus');
            await put(dee, 'bonuses.0.ab', 'CON');
            await put(dee, 'bonuses.0.n', 2);
            await next(dee);
            await wa(dee, 'addtrait');
            await put(dee, 'traits.0.name', 'Mudsense');
            await next(dee);
            await put(dee, 'darkvision', 90);
            await put(dee, 'resist', 'Poison');
            await wa(dee, 'addspeed');
            await put(dee, 'speeds.0.type', 'Swim');
            await tick(dee, 'skills', 'Nature');
            await toStep(dee, 'Review');
            await finish(dee);
            await until(() => entry('Bogfolk'), (e) => e && !e.unfinished);
            await shareIt(dee);
            // a subrace on an official race with no subraces of its own
            await newOf(dee, 'race', true);
            await put(dee, 'name', 'Moss Half-Orc');
            await put(dee, 'parent', LONE);
            await toStep(dee, 'Review');
            await finish(dee);
            await until(() => entry('Moss Half-Orc'), (e) => e && !e.unfinished);
            await shareIt(dee);
            await click(dee, '#cp-tabs [data-tab=background]');
            await newOf(dee, 'background');
            await put(dee, 'name', 'Mudlark');
            await next(dee);
            await tick(dee, 'skills', 'Investigation');
            await toStep(dee, 'Feature');
            await put(dee, 'featureName', 'River rat');
            await toStep(dee, 'Review');
            await finish(dee);
            await until(() => entry('Mudlark'), (e) => e && !e.unfinished);
            await shareIt(dee);
            // Start from an official class
            await click(dee, '#cp-tabs [data-tab=class]');
            await newOf(dee, 'class');
            await dee.ev(`(() => { const s = document.querySelector('[data-start]'); s.value = 'fighter'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
            is(`${name} Start from fills the form`, await until(() => dee.ev(`document.querySelector('#cp-hbw-body [data-w=hitDie]')?.value === '10' && document.querySelector('#cp-hbw-body [data-w=name]').value === 'Fighter (homebrew)'`)), true);
            await put(dee, 'name', 'My Fighter');
            await click(dee, '#cp-hbw-close');
            await until(() => dee.ev(`!document.querySelector('#cp-hbw').open`));
            is(`${name} and keeps its levels`, (await until(() => entry('My Fighter'), (e) => e?.levels?.length > 5))?.levels?.length > 5, true);
            // Copy to homebrew on an official class, and the official class lists a homebrew subclass of it
            await dee.go(`${BASE}/compendium/?t=class&i=2014:fighter`);
            await until(() => visible(dee, '[data-hb-copy]'));
            is(`${name} the official class lists its homebrew subclass`, await until(() => dee.ev(`[...document.querySelectorAll('#cp-dbody .cp-subs .cp-link')].some((a) => a.textContent === 'Early Path')`)), true);
            await click(dee, '[data-hb-copy]');
            is(`${name} Copy to homebrew fills the form`, await until(() => dee.ev(`document.querySelector('#cp-hbw')?.open && document.querySelector('#cp-hbw-body [data-w=name]')?.value === 'Fighter'`), Boolean, 30000), true);
            await put(dee, 'name', 'Fighter Copy');
            await click(dee, '#cp-hbw-close');
            await until(() => dee.ev(`!document.querySelector('#cp-hbw').open`));
            errs(dee, name, 'Dee');
        } finally { dee.close(); }

        // ---- Pat: picks it in the builder, Dee archives it mid-draft ----
        const pat = await launch(name);
        let id;
        const setB = (b, sel, v) => b.ev(`(() => { const e = document.querySelector(${J(sel)}); e.value = ${J(v)}; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); })()`);
        try {
            await signIn(pat, PLAYER, '/compendium/?tab=class');
            await until(() => visible(pat, '#cp-new'));
            await search(pat, 'Mire Stalker');
            is(`${name} a member sees the shared class`, await until(() => hasRow(pat, 'Mire Stalker')), true);
            await search(pat, 'My Fighter');
            await sleep(400);
            is(`${name} and not an Unfinished one`, await hasRow(pat, 'My Fighter'), false);
            is(`${name} not even in the answer`, (await pat.ev(`fetch('/compendium/homebrew.php').then((r) => r.text())`)).includes('My Fighter'), false);
            await pat.go(BASE + '/characters/build');
            await until(() => pat.ev(`!!document.querySelector('[data-b=name]')`));
            await setB(pat, '[data-b=name]', 'Pat the Hunter');
            await until(() => pat.ev(`location.search.includes('id=')`));
            id = new URLSearchParams(await pat.ev('location.search')).get('id');
            await click(pat, '[data-act=next]');
            const cls = `[data-act=cls][data-id="hb-${classId}"]`;
            is(`${name} in the builder's list, marked`, await until(() => pat.ev(`document.querySelector(${J(cls)})?.textContent.includes('Homebrew') === true`), Boolean, 30000), true);
            await click(pat, cls);
            await until(() => pat.ev(`document.querySelector('.bd-hero')?.textContent.includes('Mire Stalker') === true`));
            await pat.ev(`(() => { const p = [...document.querySelectorAll('[data-pick^="classes.0.opts"]')][0]; if (p) p.click(); })()`);
            await pat.ev(`(() => { for (const v of ['skill-arcana', 'skill-stealth']) document.querySelector('[data-pick="classes.0.profs.0"][value="' + v + '"]')?.click(); })()`);
            const draft = () => chars(pat).then((c) => c[id]);
            is(`${name} a draft keeps its copy from the moment of picking`, (await until(draft, (c) => c?.build?.hbc?.[classId]))?.build?.hbc?.[classId]?.name, 'Mire Stalker');
            const before = await until(draft, (c) => c?.classes?.[0]?.name === 'Mire Stalker' && rowOf(c, 'list', 'Rage'));
            is(`${name} the draft has its rows`, [before.classes[0].level, rowOf(before, 'list', 'Rage').uses, rowOf(before, 'trackers', 'Crimson rite').max, before.classes[0].die], [1, 'PROF', '1', 10]);
            // a race and a background of Dee's
            await pat.ev(`location.hash = '#race'`);
            await until(() => pat.ev(`!!document.querySelector('[data-act=race][data-id="hb-${entry('Bogfolk').id}"]')`));
            await pat.ev(`document.querySelector('[data-act=race][data-id=${LONE}]').click()`);
            is(`${name} a lone homebrew subrace doesn't force itself on an official race`, await until(() => pat.ev(`!!document.querySelector('[data-act=sub][data-id=base]')`), Boolean, 3000), true);
            await click(pat, '[data-act=sub][data-id=base]');
            await until(() => pat.ev(`document.querySelector('.bd-hero')?.textContent.toLowerCase().includes(${J(LONE_NAME.toLowerCase())})`));
            is(`${name} the base race is what it says`, (await until(draft, (c) => c.race === LONE_NAME))?.race, LONE_NAME);
            await click(pat, '[data-act=racesubs]');
            await clickW(pat, '[data-act=racelist]');
            await until(() => pat.ev(`!!document.querySelector('[data-act=race][data-id="hb-${entry('Bogfolk').id}"]')`));
            await click(pat, `[data-act=race][data-id="hb-${entry('Bogfolk').id}"]`);
            await until(draft, (c) => c.race === 'Bogfolk');
            await pat.ev(`location.hash = '#background'`);
            await until(() => pat.ev(`!!document.querySelector('[data-act=bg][data-id="hb-${entry('Mudlark').id}"]')`));
            await click(pat, `[data-act=bg][data-id="hb-${entry('Mudlark').id}"]`);
            const full = await until(draft, (c) => rowOf(c, 'list', 'River rat'));
            is(`${name} race and background fill the sheet`, [full.speeds.map((s) => s.type).join(), full.passives.find((p) => p.name === 'Darkvision')?.f, full.res, full.skills.find((s) => s.name === 'Nature').p, full.skills.find((s) => s.name === 'Investigation').p, !!rowOf(full, 'list', 'Mudsense')], ['Walk,Swim', '90', 'Poison', 1, 1, true]);
            is(`${name} it reaches the account`, await until(() => { try { return readFileSync(join(ACCOUNTS, 'characters', id, 'character.json'), 'utf8').includes('River rat'); } catch { return false; } }, Boolean, 20000), true);
            errs(pat, name, 'Pat picks');
        } finally { pat.close(); }

        // Dee archives the class and takes the race out of the campaign, while Pat's draft is open
        const dee2 = await launch(name);
        try {
            await signIn(dee2, DM, `/compendium/?t=class&i=hb:${classId}`);
            await until(() => visible(dee2, '[data-hb-archive]'));
            await click(dee2, '[data-hb-archive]');
            await until(() => dee2.ev(`document.querySelector('#cp-hbask').open`));
            await click(dee2, '#cp-hbask-yes');
            await until(() => entry('Mire Stalker'), (e) => e?.archived);
            const race = entry('Bogfolk');
            await dee2.go(`${BASE}/compendium/?t=race&i=hb:${race.id}`);
            await until(() => visible(dee2, '[data-hb-share]'));
            await until(() => dee2.ev(`document.querySelector('[data-hb-share]').checked`));
            await click(dee2, '[data-hb-share]');
            await until(shares, (s) => !s.some((r) => r.id === race.id));
            errs(dee2, name, 'Dee archives');
        } finally { dee2.close(); }

        const pat2 = await launch(name);
        try {
            // the same browser's draft, on a machine that's just synced: the copies are all it has
            await signIn(pat2, PLAYER, '/privacy/');
            await pat2.go(`${BASE}/characters/build?id=${id}#class`);
            is(`${name} a removed class doesn't drop anything: the draft opens`, await until(() => pat2.ev(`document.querySelector('.bd-hero')?.textContent.includes('Mire Stalker') === true`), Boolean, 30000), true);
            await sleep(1500);
            is(`${name} the source is really gone for Pat`, await pat2.ev(`Homebrew.all().some((x) => x.name === 'Mire Stalker' || x.name === 'Bogfolk')`), false);
            // any change rebuilds the draft from its picks and the copies
            await pat2.ev(`document.querySelector('[data-pick="classes.0.profs.0"][value="skill-survival"]')?.click()`);
            await pat2.ev(`document.querySelector('[data-pick="classes.0.profs.0"][value="skill-stealth"]')?.click()`);
            const d2 = await until(() => chars(pat2).then((c) => c[id]), (c) => c?.skills?.find((s) => s.name === 'Survival')?.p === 1);
            is(`${name} and a change rebuilds it with every row`, [d2?.classes?.[0]?.name, !!rowOf(d2, 'list', 'Rage'), !!rowOf(d2, 'trackers', 'Crimson rite'), d2?.race, !!rowOf(d2, 'list', 'Mudsense'), !!rowOf(d2, 'list', 'River rat')], ['Mire Stalker', true, true, 'Bogfolk', true, true]);

            // finish it
            await pat2.ev(`location.hash = '#review'`);
            await until(() => pat2.ev(`!!document.querySelector('.bd-review')`));
            await click(pat2, '[data-act=next]');
            await until(() => pat2.ev(`location.pathname === '/characters/${id}' && !!document.querySelector('[data-k=name]')`), Boolean, 30000);
            const done = (await chars(pat2))[id];
            is(`${name} finished at level 1`, [done.draft, done.classes.map((k) => `${k.name} ${k.level}`).join(), done.hp.base, done.hp.cur], [0, 'Mire Stalker 1', 10, 10]);
            const levelTo = async (n, choose) => {
                await pat2.go(`${BASE}/characters/build?up=${id}`);
                await until(() => pat2.ev(`!!document.querySelector('[data-act=upcls][data-id="hb-${classId}"]')`), Boolean, 30000);
                await click(pat2, `[data-act=upcls][data-id="hb-${classId}"]`);
                await until(() => pat2.ev(`!!document.querySelector('.bd-hero')`));
                if (choose) await choose();
                await pat2.ev(`location.hash = '#review'`);
                await until(() => pat2.ev(`!!document.querySelector('.bd-review')`));
                await click(pat2, '[data-act=next]');
                return until(() => chars(pat2).then((c) => c[id]), (c) => +c.classes[0].level === n, 30000);
            };
            // Dee's class is archived: level up works from Pat's copy. Level 2: the improvement and the subclass list (Dee's subclass is its own entry)
            const c2 = await levelTo(2, async () => {
                await setB(pat2, '[data-b="entry.asi.2.k"]', '+2').catch(() => { });
                await until(() => pat2.ev(`!!document.querySelector('[data-b="entry.asi.2.a.0"]')`));
                await setB(pat2, '[data-b="entry.asi.2.a.0"]', 'STR');
            });
            is(`${name} level 2 from the copy`, [c2.classes[0].level, c2.hp.base, !!rowOf(c2, 'list', 'Crimson eye'), rowOf(c2, 'trackers', 'Crimson rite').max, rowOf(c2, 'trackers', 'Blood points').max, c2.abilities[0].score > done.abilities[0].score], [2, 16, true, '2', '2', true]);
            await until(() => pat2.ev(`location.pathname === '/characters/${id}'`));
            errs(pat2, name, 'Pat levels');
        } finally { pat2.close(); }

        // ---- Dee unarchives it and adds to it ----
        const dee3 = await launch(name);
        try {
            await signIn(dee3, DM, '/compendium/?tab=class');
            await until(() => visible(dee3, '#cp-arch'));
            await click(dee3, '#cp-arch');
            await clickW(dee3, '[data-unarchive]');
            await until(() => entry('Mire Stalker'), (e) => e && !e.archived);
            await openRow(dee3, 'Mire Stalker');
            await until(() => visible(dee3, '[data-hb-edit]'));
            await click(dee3, '[data-hb-edit]');
            await until(() => dee3.ev(`document.querySelector('#cp-hbw').open`), Boolean, 30000);
            await toStep(dee3, 'Levels and features');
            await wa(dee3, 'addfeat', '[data-i="3"]');
            await put(dee3, 'levels.2.feats.1.name', 'New at three');
            await wa(dee3, 'addfeat', '[data-i="1"]');
            await put(dee3, 'levels.0.feats.2.name', 'New at one');
            await put(dee3, 'levels.0.feats.0.text', 'Changed text.');
            is(`${name} editing a finished class doesn't save until Finish`, entry('Mire Stalker').levels[0].feats.length, 2);
            await toStep(dee3, 'Review');
            await finish(dee3);
            await until(() => entry('Mire Stalker'), (e) => e.levels[0].feats.length === 3);
            errs(dee3, name, 'Dee edits');
        } finally { dee3.close(); }

        // ---- Pat: Keep mine, then Yes at the same screen. Level 3 uses the new version; earlier rows never change ----
        const pat3 = await launch(name);
        try {
            await signIn(pat3, PLAYER, `/characters/${id}`);
            await until(() => pat3.ev(`!!document.querySelector('[data-k=name]')`));
            // a pulled character is in this browser once it has been saved here
            // (the page reloads once when settings sync pulls something new, so this tries again)
            await until(() => pat3.ev(`(() => { const i = document.querySelector('[data-k=name]'); if (!i) return false; i.value = 'Pat the Bold'; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`).catch(() => false));
            await until(() => chars(pat3).then((c) => c[id]?.name === 'Pat the Bold'));
            const was = (await chars(pat3))[id];
            await pat3.go(`${BASE}/characters/build?up=${id}`);
            await until(() => pat3.ev(`!!document.querySelector('[data-act=upcls][data-id="hb-${classId}"]')`), Boolean, 30000);
            await click(pat3, `[data-act=upcls][data-id="hb-${classId}"]`);
            is(`${name} level up asks`, (await until(() => pat3.ev(`document.querySelector('.note [data-act=hbuse]')?.closest('.note').textContent || ''`), (t) => t.includes('Dee updated Mire Stalker. Use the new version?'))).includes('Keep mine'), true);
            is(`${name} before answering, the copy it has`, await pat3.ev(`document.querySelector('.bd-unlock').textContent.includes('New at three')`), false);
            await click(pat3, '[data-act=hbkeep]');
            await until(() => pat3.ev(`!document.querySelector('[data-act=hbuse]')`));
            is(`${name} Keep mine stays with the copy`, await pat3.ev(`document.querySelector('.bd-unlock').textContent.includes('New at three')`), false);
            // a fresh start of the same level up: asked again, and this time Yes
            await pat3.ev(`sessionStorage.clear()`);
            await pat3.go(`${BASE}/characters/build?up=${id}`);
            await until(() => pat3.ev(`!!document.querySelector('[data-act=upcls][data-id="hb-${classId}"]')`), Boolean, 30000);
            await click(pat3, `[data-act=upcls][data-id="hb-${classId}"]`);
            await until(() => pat3.ev(`!!document.querySelector('[data-act=hbuse]')`));
            await click(pat3, '[data-act=hbuse]');
            is(`${name} Yes uses the new version`, await until(() => pat3.ev(`document.querySelector('.bd-unlock')?.textContent.includes('New at three') === true`)), true);
            await pat3.ev(`location.hash = '#review'`);
            await until(() => pat3.ev(`!!document.querySelector('.bd-review')`));
            await click(pat3, '[data-act=next]');
            const c3 = await until(() => chars(pat3).then((c) => c[id]), (c) => +c.classes[0].level === 3, 30000);
            is(`${name} levelled 1 to 3`, [c3.classes[0].level, c3.hp.base, !!rowOf(c3, 'list', 'Blood sense'), !!rowOf(c3, 'list', 'New at three'), rowOf(c3, 'trackers', 'Blood points').max], [3, 22, true, true, '3']);
            is(`${name} earlier rows never change`, [rowOf(c3, 'list', 'Rage').text, !!rowOf(c3, 'list', 'New at one'), JSON.stringify(rowOf(c3, 'list', 'Crimson eye')) === JSON.stringify(rowOf(was, 'list', 'Crimson eye'))], ['Not the official one.', false, true]);
            is(`${name} the new version is what it keeps now`, c3.build.hbc[classId].levels[0].feats.length, 3);
            await until(() => pat3.ev(`location.pathname === '/characters/${id}' && !!document.querySelector('.hb-undo')`), Boolean, 15000);
            // a campaign's homebrew is for characters built for it; Pat's class copy stays whatever happens
            is(`${name} a character for another campaign doesn't get it`, await pat3.ev(`(async () => { const d = { classes: {}, subclasses: {}, races: {}, subraces: {}, backgrounds: {}, feats: {}, spells: {}, equipment: {} }; await Homebrew.ready(); await new Promise((ok) => { const s = document.createElement('script'); s.src = '/assets/js/homebrew-content.js'; s.onload = ok; document.head.appendChild(s); });
                Homebrew.addTo(d, '2014', {}, ${J(OTHER)}); const none = !d.classes['hb-${classId}']; Homebrew.addTo(d, '2014', {}, ${J(CAMP)}); const yes = !!d.classes['hb-${classId}']; Homebrew.addTo(d, '2014', {}, ''); return none && yes && !!d.classes['hb-${classId}']; })()`), true);
            errs(pat3, name, 'Pat level 3');
        } finally { pat3.close(); }
    }
} finally {
    web.kill();
}
console.log(bad ? `${bad} check(s) failed` : 'homebrew classes ok');
process.exit(bad ? 1 : 0);
