// Checks homebrew spells, items, magic items and feats (ROADMAP 5.2 stage 2) in headless Chrome and Firefox: the forms (refused when empty or with bad
// dice, Discard asks, Copy to homebrew, the Homebrew only filter, 320 px wide), a player adding shared entries to a sheet (a weapon also gets an
// action, armour never changes the armour class), and the sheet's copy surviving an edit of the source (Update: the changes, play state kept, Undo, the
// hand-edit warning), the source being archived and taken out of the campaign, a reload through normalise(), and sign-in on another device. Also the name
// suggestions on both sheets, the builder, every version kept on the server, and a shared computer (entries never go to another account).
//   node _dev/scripts/homebrew-copies.mjs        (needs includes/config.php for sign-in)
// Starts its own server (port 8131 + CHECK_PORT_SHIFT) with stand-in account and session folders in the temp folder, so it never touches
// private/dnd/accounts or private/sessions. Backups and settings sync are blocked.
import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { launch, browsers, serving } from './browser.mjs';

const ROOT = join(import.meta.dirname, '../..'), PORT = 8131 + (+process.env.CHECK_PORT_SHIFT || 0), BASE = `http://localhost:${PORT}`;
const PHP = process.env.PHP || (process.platform === 'win32' ? 'C:/php/php.exe' : 'php');
const TMP = join(tmpdir(), 'dnd-hbcopies-check' + (process.env.CHECK_PORT_SHIFT || '')), ACCOUNTS = join(TMP, 'accounts'), SESSIONS = join(TMP, 'sessions');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ser = (o) => `a:${Object.keys(o).length}:{` + Object.entries(o).map(([k, v]) => `s:${Buffer.byteLength(k)}:"${k}";s:${Buffer.byteLength(v)}:"${v}";`).join('') + '}';
const DM = 'hbcopiesdm0000000000000000000000000', PLAYER = 'hbcopiesplayer00000000000000000000', CAMP = 'abcabcabcabd';

let bad = 0;
const is = (name, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) { bad++; console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); } };
const until = async (fn, ok = Boolean, ms = 12000) => { const t = Date.now(); let v; while (Date.now() - t < ms) { v = await fn(); if (ok(v)) return v; await sleep(150); } return v; };
const web = spawn(PHP, ['-S', `127.0.0.1:${PORT}`, '-t', ROOT, join(ROOT, '_dev/router.php')], { stdio: 'ignore', env: { ...process.env, DND_ACCOUNTS: ACCOUNTS, DND_SESSIONS: SESSIONS } });
await serving(BASE + '/privacy/');

const J = JSON.stringify;
const click = (b, sel) => b.ev(`(() => { const e = document.querySelector(${J(sel)}); if (e) e.click(); return !!e; })()`);
const visible = (b, sel) => b.ev(`(() => { const e = document.querySelector(${J(sel)}); return !!e && !e.hidden && e.getClientRects().length > 0; })()`);
const isOpen = (b, id) => b.ev(`document.querySelector('#${id}').open`);
const body = (b) => b.ev(`document.querySelector('#cp-dbody').textContent`);
const signIn = async (b, cookie, path, keep) => {
    await b.block(/backup\.php|prefs\.php/);
    await b.go(BASE + '/privacy/');
    await b.ev(`${keep ? '' : 'localStorage.clear();'} ${cookie ? `document.cookie = 'dndsid=${cookie}; path=/'` : ''}`);
    await b.go(BASE + path);
};
const search = (b, n) => b.ev(`(() => { const q = document.querySelector('#cp-q'); q.value = ${J(n)}; q.dispatchEvent(new Event('input', { bubbles: true })); })()`);
const openRow = async (b, n) => {
    await search(b, n);
    await until(() => b.ev(`[...document.querySelectorAll('#cp-list .cp-row')].some((r) => r.querySelector('.cp-name').textContent === ${J(n)})`));
    await b.ev(`[...document.querySelectorAll('#cp-list .cp-row')].find((r) => r.querySelector('.cp-name').textContent === ${J(n)}).click()`);
    await until(() => b.ev(`document.querySelector('#cp-dbody h2')?.textContent === ${J(n)}`));
};
// fills the open form by field name; dmg is a list of [dice, type] rows
const fill = (b, vals, dmg) => b.ev(`(() => {
    const f = document.querySelector('#cp-hb-form'), v = ${J(vals)}, d = ${J(dmg || null)};
    for (const [k, x] of Object.entries(v)) {
        if (Array.isArray(x)) { for (const i of f.querySelectorAll('[name="' + k + '"]')) i.checked = x.includes(i.value); continue; }
        const el = f.elements[k];
        if (el.type === 'checkbox') el.checked = x; else el.value = x;
    }
    if (d) { for (const del of [...f.querySelectorAll('[data-rowdel]')]) del.click(); for (const [dice, type] of d) { f.querySelector('[data-rowadd]').click(); const r = [...f.querySelectorAll('.cp-hbrow')].pop(); r.querySelector('[data-dice]').value = dice; r.querySelector('[data-type]').value = type; } }
    f.dispatchEvent(new Event('change'));
})()`);
const submit = (b) => b.ev(`document.querySelector('#cp-hb-form').requestSubmit()`);
const make = async (b, tab, vals, dmg, needle) => {
    await click(b, `#cp-tabs [data-tab=${tab}]`);
    await until(() => visible(b, '#cp-new'));
    await click(b, '#cp-new');
    await until(() => isOpen(b, 'cp-hb'));
    await fill(b, vals, dmg);
    await submit(b);
    is(`made ${vals.name}`, (await until(() => body(b), (t) => t.includes(needle))).includes(needle), true);
};
const shareIt = async (b, n) => {
    const count = () => { try { return JSON.parse(readFileSync(join(ACCOUNTS, 'campaigns', CAMP, 'homebrew.json'), 'utf8')).length; } catch { return 0; } };
    const was = count();
    await until(() => visible(b, '[data-hb-share]'));
    await click(b, '[data-hb-share]');
    is(`shared ${n}`, await until(count, (c) => c === was + 1), was + 1);
};
const errs = (b, name, where) => { const e = b.errors.filter((x) => !/backup\.php|prefs\.php/.test(x)); if (e.length) { bad++; console.log(`FAIL ${name} ${where}: ${e.join(' | ').slice(0, 600)}`); } };
const entriesOf = (sub) => { try { return readdirSync(join(ACCOUNTS, 'homebrew', sub)).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(ACCOUNTS, 'homebrew', sub, f), 'utf8'))); } catch { return []; } };
const charOf = (b, id) => b.ev(`JSON.stringify(JSON.parse(localStorage.getItem('hb-sheet')).chars[${J(id)}])`).then(JSON.parse);
const rowsOf = (c, type) => c.panels.find((p) => p.type === type).rows;
const rowNamed = (c, type, n) => rowsOf(c, type).find((r) => r.name === n);
const homebrewRows = (c) => c.panels.flatMap((p) => (p.rows || []).filter((r) => r.hbsrc));
const saved = (id) => { try { return JSON.parse(readFileSync(join(ACCOUNTS, 'characters', id, 'character.json'), 'utf8')); } catch { return { panels: [] }; } };
// changes a character in this browser while no sheet is open
const edit = async (b, id, fn) => {
    await b.go(BASE + '/privacy/');
    // a character pulled from the account is only in this browser once it has been saved here
    await b.ev(`(() => { const db = JSON.parse(localStorage.getItem('hb-sheet') || '{"chars":{}}'), c = db.chars[${J(id)}] || (db.chars[${J(id)}] = ${J(saved(id))}); (${fn})(c); c.updated = Date.now(); localStorage.setItem('hb-sheet', JSON.stringify(db)); })()`);
};
const add = async (b, tab, n) => {
    await click(b, `#cp-tabs [data-tab=${tab}]`);
    await openRow(b, n);
    const was = await b.ev(`(JSON.parse(localStorage.getItem('hb-pending')) || []).length`);
    await until(() => visible(b, '[data-add]'));
    await click(b, '[data-add]');
    is(`queued ${n}`, await until(() => b.ev(`(JSON.parse(localStorage.getItem('hb-pending')) || []).length`), (x) => x === was + 1), was + 1);
};

try {
    for (const name of browsers) {
        rmSync(TMP, { recursive: true, force: true });
        mkdirSync(SESSIONS, { recursive: true });
        writeFileSync(join(SESSIONS, 'sess_' + DM), 'user|' + ser({ sub: '111', email: 'dm@example.com', name: 'Dee' }));
        writeFileSync(join(SESSIONS, 'sess_' + PLAYER), 'user|' + ser({ sub: '222', email: 'p@example.com', name: 'Pat' }));
        mkdirSync(join(ACCOUNTS, 'campaigns', CAMP), { recursive: true });
        writeFileSync(join(ACCOUNTS, 'campaigns', CAMP, 'campaign.json'), J({ id: CAMP, name: 'Stonehold', dm: '111', code: 'aaaaaaaaaa', members: [{ sub: '111', name: 'Dee', joined: 1, characters: [] }, { sub: '222', name: 'Pat', joined: 1, characters: [] }] }));

        // ---- Dee makes one of each ----
        const dee = await launch(name);
        try {
            await signIn(dee, DM, '/compendium/?tab=spell');
            await until(() => visible(dee, '#cp-new'));
            is(`${name} button says New spell`, await dee.ev(`document.querySelector('#cp-new').textContent`), 'New spell');
            await click(dee, '#cp-new');
            await until(() => isOpen(dee, 'cp-hb'));
            await submit(dee);
            is(`${name} empty spell refused`, await dee.ev(`JSON.stringify(['name', 'text'].map((k) => document.querySelector('#cp-hb-form').elements[k].getAttribute('aria-invalid')))`).then(JSON.parse), ['true', 'true']);
            await fill(dee, { name: 'Zap', text: 'Zaps one.', heal: '2d' });
            await submit(dee);
            is(`${name} bad dice refused`, await dee.ev(`[document.querySelector('#cp-hb').open, document.querySelector('[name=heal]').getAttribute('aria-invalid'), document.querySelector('[name=heal]').parentElement.querySelector('small').textContent.startsWith('Check this')].join()`), 'true,true,true');
            is(`${name} a reaction asks its trigger, a save its ability`, [await visible(dee, '[name=trig]'), await visible(dee, '[name=save]')], [false, false]);
            await fill(dee, { time: 'Reaction', mode: 'save' });
            is(`${name} and now shows them`, [await visible(dee, '[name=trig]'), await visible(dee, '[name=save]')], [true, true]);
            await fill(dee, { name: 'Zap', level: '1', text: 'Zaps one.', time: 'Action', mode: 'save', save: 'CON', heal: '', comps: ['V', 'S'], classes: ['Wizard'], fx: ['control'] }, [['2d6', 'Force']]);
            await submit(dee);
            const t = await until(() => body(dee), (x) => x.includes('Zaps one.'));
            is(`${name} spell shows how it rolls`, [t.includes('How it rolls'), t.includes('CON save'), t.includes('2d6 force')], [true, true, true]);

            // Homebrew only filter, then Discard asks first
            await dee.ev(`(() => { const i = document.querySelector('[data-f=hb]'); i.checked = true; i.dispatchEvent(new Event('change', { bubbles: true })); })()`);
            await search(dee, '');
            is(`${name} Homebrew only`, await until(() => dee.ev(`document.querySelectorAll('#cp-list .cp-row').length`), (n) => n === 1), 1);
            await dee.ev(`(() => { const i = document.querySelector('[data-f=hb]'); i.checked = false; i.dispatchEvent(new Event('change', { bubbles: true })); })()`);
            await click(dee, '#cp-new');
            await until(() => isOpen(dee, 'cp-hb'));
            await dee.ev(`(() => { const n = document.querySelector('#cp-hb-form').elements.name; n.value = 'Half done'; n.dispatchEvent(new Event('input', { bubbles: true })); })()`);
            await click(dee, '[data-hb-cancel]');
            is(`${name} Cancel asks`, await until(() => isOpen(dee, 'cp-hbask')), true);
            await click(dee, '#cp-hbask-no');
            is(`${name} Keep editing keeps it`, [await until(() => dee.ev(`!document.querySelector('#cp-hbask').open`)), await isOpen(dee, 'cp-hb')], [true, true]);
            await click(dee, '[data-hb-cancel]');
            await until(() => isOpen(dee, 'cp-hbask'));
            await click(dee, '#cp-hbask-yes');
            is(`${name} Discard closes it`, await until(() => dee.ev(`!document.querySelector('#cp-hb').open`)), true);

            // Copy to homebrew from an official spell fills the form
            await openRow(dee, 'Fireball');
            await until(() => visible(dee, '[data-hb-copy]'));
            await click(dee, '[data-hb-copy]');
            await until(() => isOpen(dee, 'cp-hb'));
            is(`${name} official spell copied into the form`, await dee.ev(`JSON.stringify((() => { const f = document.querySelector('#cp-hb-form'); return [f.elements.name.value, f.elements.level.value, f.elements.mode.value, f.elements.save.value, f.querySelector('.cp-hbrow [data-dice]')?.value, f.elements.name.parentElement.querySelector('small').textContent.includes('already')]; })())`).then(JSON.parse), ['Fireball', '3', 'save', 'DEX', '8d6', true]);
            await click(dee, '[data-hb-cancel]');
            await until(() => isOpen(dee, 'cp-hbask'));
            await click(dee, '#cp-hbask-yes');
            await until(() => dee.ev(`!document.querySelector('#cp-hb').open`));
            await search(dee, 'Zap');
            await openRow(dee, 'Zap');
            await shareIt(dee, 'Zap');

            await make(dee, 'item', { name: 'Moon Blade', cat: 'Weapon', wcat: 'Martial', wrange: 'Melee', dice: '1d8', dtype: 'Radiant', dice2: '1d10', props: ['Finesse'], cost: 5, coin: 'sp', wt: 3, text: 'Glows.' }, null, 'Glows.');
            await shareIt(dee, 'Moon Blade');
            await make(dee, 'item', { name: 'Mithral Coat', cat: 'Armor', akind: 'Medium', ac: 14, dex: true, dexmax: 2, text: 'Light as silk.' }, null, 'Light as silk.');
            await shareIt(dee, 'Mithral Coat');
            await make(dee, 'magic', { name: 'Ring of Sparks', type: 'Ring', rarity: 'Rare', att: true, attreq: 'by a wizard', text: 'Sparks.' }, null, 'Sparks.');
            await shareIt(dee, 'Ring of Sparks');
            await make(dee, 'feat', { name: 'Lucky Star', prereq: 'Charisma 13', text: 'Reroll one.', uses: 'PROF', reset: 'long' }, null, 'Reroll one.');
            await shareIt(dee, 'Lucky Star');

            // the form at phone width
            await click(dee, '#cp-tabs [data-tab=item]');
            await until(() => visible(dee, '#cp-new'));
            await click(dee, '#cp-new');
            await until(() => isOpen(dee, 'cp-hb'));
            await fill(dee, { cat: 'Weapon' });
            await dee.shot(320, 700);
            is(`${name} form fits 320 px`, await dee.ev(`(() => { const d = document.querySelector('#cp-hb'); return d.scrollWidth <= d.clientWidth + 1 && d.getBoundingClientRect().right <= innerWidth + 1; })()`), true);
            await dee.shot(1366, 800);
            await dee.ev(`document.querySelector('#cp-hb-form [data-hb-cancel]').click()`);
            await until(() => isOpen(dee, 'cp-hbask'));
            await click(dee, '#cp-hbask-yes');

            // the builder
            const made = entriesOf('111'), idOf = (n) => made.find((e) => e.name === n).id, zap = idOf('Zap'), star = idOf('Lucky Star');
            await dee.go(BASE + '/characters/build');
            await until(() => dee.ev(`!!window.HbBuild && !!window.hbContent && !!window.Homebrew`));
            const built = JSON.parse(await dee.ev(`(async () => {
                await Homebrew.ready();
                const d = await hbContent('2014', ['classes', 'subclasses', 'races', 'subraces', 'backgrounds', 'feats', 'languages', 'spells', 'equipment']), M = hbModel(() => Math.random().toString(36).slice(2));
                Homebrew.addTo(d, '2014', {});
                const ch = Object.assign(HbBuild.blankChoices(), { level: 4, classes: [{ id: 'wizard', levels: 4, spells: ['hb-${zap}'], asi: { 4: { k: 'feat', feat: 'hb-${star}' } }, opts: {}, profs: {}, picks: {} }] });
                ch.equip.extra = ['Moon Blade (homebrew)', 'Mithral Coat (homebrew)'];
                const c = HbBuild.build(ch, d, M), row = (t, n) => c.panels.find((p) => p.type === t).rows.find((r) => r.name === n);
                const kept = {}; kept['${zap}'] = { ...Homebrew.find('${zap}'), text: 'The copy I picked.' };
                const d2 = { spells: {}, feats: {} }; Homebrew.addTo(d2, '2014', kept);
                const has = (cls) => HbBuild.spellPool(cls, '', d).some((s) => s.index === 'hb-${zap}');
                return JSON.stringify({ wiz: has('wizard'), fighter: has('fighter'), desc: row('spells', 'Zap')?.desc, src: row('spells', 'Zap')?.hbsrc?.id, feat: row('list', 'Lucky Star')?.uses, blade: row('items', 'Moon Blade')?.hbsrc?.id === '${idOf('Moon Blade')}', act: row('attacks', 'Moon Blade')?.dmg[0].type,
                    ac: c.ac, coat: row('items', 'Mithral Coat')?.props.includes('AC 14 + DEX (max 2)'), kept: d2.spells['hb-${zap}'].desc[0] });
            })()`));
            is(`${name} builder uses homebrew`, built, { wiz: true, fighter: false, desc: 'Zaps one.', src: zap, feat: 'PROF', blade: true, act: 'Radiant', ac: '10 + DEX', coat: true, kept: 'The copy I picked.' });

            // and on the builder's screens: a draft at level 4 with a feat picked at the improvement
            const draft = 'bdraft' + name;
            await dee.ev(`(async () => {
                const db = JSON.parse(localStorage.getItem('hb-sheet') || '{"chars":{}}'), d = await hbContent('2014', ['classes', 'subclasses', 'races', 'subraces', 'backgrounds', 'feats', 'languages']);
                const c = HbBuild.build(Object.assign(HbBuild.blankChoices(), { step: 'class', level: 4, classes: [{ id: 'wizard', levels: 4, asi: { 4: { k: 'feat', a: [], feat: '' } }, opts: {}, profs: {}, picks: {}, spells: [] }] }), d, hbModel(() => Math.random().toString(36).slice(2)));
                db.chars = db.chars || {}; db.chars[${J(draft)}] = Object.assign(c, { id: ${J(draft)}, draft: 1, updated: Date.now(), name: 'Draft' }); localStorage.setItem('hb-sheet', JSON.stringify(db)); return 1;
            })()`);
            await dee.go(`${BASE}/characters/build?id=${draft}#class`);
            is(`${name} the spell picker lists it, marked`, await until(() => dee.ev(`[...document.querySelectorAll('.bd-sprow')].some((r) => r.textContent.includes('Zap') && r.textContent.includes('Homebrew'))`)), true);
            is(`${name} the feat list has it, marked`, await dee.ev(`[...document.querySelectorAll('.bd-asi option')].some((o) => o.textContent === 'Lucky Star (homebrew)')`), true);
            await dee.ev(`document.querySelector('[data-pick][value="hb-${zap}"]').click()`);
            is(`${name} a picked spell is copied into the draft`, await until(() => dee.ev(`(JSON.parse(localStorage.getItem('hb-sheet')).chars[${J(draft)}].build.hbc || {})[${J(zap)}]?.text || ''`), (x) => x === 'Zaps one.'), 'Zaps one.');
            errs(dee, name, 'Dee');
        } finally { dee.close(); }

        // ---- Pat adds them to a sheet ----
        const made = entriesOf('111'), idOf = (n) => made.find((e) => e.name === n).id;
        const pat = await launch(name);
        let id;
        try {
            await signIn(pat, PLAYER, '/characters/new');
            id = await until(() => pat.ev(`Object.keys(JSON.parse(localStorage.getItem('hb-sheet') || '{"chars":{}}').chars)[0] || ''`));
            await until(() => pat.ev(`!!document.querySelector('.hb-link, .hb-entry, [data-k=name]')`));
            await pat.go(BASE + '/compendium/?tab=spell');
            await until(() => visible(pat, '#cp-new'));
            await add(pat, 'spell', 'Zap');
            is(`${name} a member can't edit it`, await pat.ev(`!!document.querySelector('[data-hb-edit],[data-hb-archive],[data-hb-share],[data-hb-remove]')`), false);
            is(`${name} a member can copy it`, await visible(pat, '[data-hb-copy]'), true);
            await add(pat, 'item', 'Moon Blade');
            await add(pat, 'item', 'Mithral Coat');
            await add(pat, 'magic', 'Ring of Sparks');
            await add(pat, 'feat', 'Lucky Star');
            await pat.go(`${BASE}/characters/${id}`);
            await until(() => charOf(pat, id).then((c) => homebrewRows(c).length), (n) => n === 6);
            let c = await charOf(pat, id);
            const s = rowNamed(c, 'spells', 'Zap'), blade = rowNamed(c, 'items', 'Moon Blade'), act = rowNamed(c, 'attacks', 'Moon Blade'), coat = rowNamed(c, 'items', 'Mithral Coat'), ring = rowNamed(c, 'items', 'Ring of Sparks'), star = rowNamed(c, 'list', 'Lucky Star');
            is(`${name} spell row`, [s.lvl, s.mode, s.save, s.dmg, s.desc, s.comp, s.fx.map((x) => x.k), s.srd, s.hbsrc.id, s.hbsrc.by], [1, 'save', 'CON', [{ dice: '2d6', type: 'Force' }], 'Zaps one.', 'V, S', ['control'], '', idOf('Zap'), 'Dee']);
            is(`${name} weapon in the inventory`, [blade.cat, blade.gp, blade.wt, blade.notes, blade.props], ['Weapons', 0.5, 3, 'Glows.', ['Martial', 'Melee', 'Finesse']]);
            is(`${name} and an action (no martial proficiency here)`, [act.mode, act.hit, act.dmg[0], act.props, act.desc.includes('Two-handed: 1d10 radiant.')], ['hit', 'STR', { dice: '1d8 + STR', type: 'Radiant' }, ['Finesse'], true]);
            is(`${name} armour in the inventory, armour class untouched`, [coat.cat, coat.props.includes('AC 14 + DEX (max 2)'), c.ac], ['Armour', true, '10 + DEX']);
            is(`${name} magic item needs attunement`, [ring.cat, ring.att, ring.notes.startsWith('Requires attunement by a wizard.'), ring.props], ['Magic items', 'needs', true, ['Ring', 'Rare']]);
            is(`${name} feat with a counter`, [star.uses, star.reset, star.src, star.text.startsWith('Prerequisite: Charisma 13')], ['PROF', 'long', 'Feat', true]);
            is(`${name} nothing new to update yet`, await pat.ev(`document.querySelectorAll('.hb-entry-h .badge.p').length`), 0);

            is(`${name} the rows reach the account`, homebrewRows(await until(() => saved(id), (x) => homebrewRows(x).length === 6)).length, 6);
            // play state: prepared, attuned, one use spent
            await edit(pat, id, (ch) => { const f = (t, n) => ch.panels.find((p) => p.type === t).rows.find((r) => r.name === n); f('spells', 'Zap').prep = true; f('items', 'Ring of Sparks').att = 'yes'; f('items', 'Moon Blade').qty = 2; f('list', 'Lucky Star').used = 1; });
            errs(pat, name, 'Pat adds');
        } finally { pat.close(); }

        // ---- Dee edits the spell and the ring; every replaced version stays on the server ----
        const dee2 = await launch(name);
        try {
            await signIn(dee2, DM, '/compendium/?tab=spell');
            await until(() => visible(dee2, '#cp-new'));
            await openRow(dee2, 'Zap');
            await until(() => visible(dee2, '[data-hb-edit]'));
            await click(dee2, '[data-hb-edit]');
            await until(() => isOpen(dee2, 'cp-hb'));
            is(`${name} edit form filled`, await dee2.ev(`[document.querySelector('#cp-hb-form').elements.text.value, document.querySelector('.cp-hbrow [data-dice]').value, document.querySelector('.cp-hbrow [data-type]').value, document.querySelector('[name=classes][value=Wizard]').checked].join()`), 'Zaps one.,2d6,Force,true');
            await fill(dee2, { text: 'Zaps two.' }, [['3d6', 'Force']]);
            await submit(dee2);
            is(`${name} the edit reaches the account`, (await until(() => entriesOf('111').find((e) => e.name === 'Zap'), (e) => e && e.text === 'Zaps two.'))?.text, 'Zaps two.');
            const hist = join(ACCOUNTS, 'homebrew', '111', 'history', idOf('Zap'));
            is(`${name} the old version is kept`, existsSync(hist) && readdirSync(hist).map((f) => JSON.parse(readFileSync(join(hist, f), 'utf8'))).some((e) => e.text === 'Zaps one.'), true);
            await click(dee2, '#cp-tabs [data-tab=magic]');
            await openRow(dee2, 'Ring of Sparks');
            await until(() => visible(dee2, '[data-hb-edit]'));
            await click(dee2, '[data-hb-edit]');
            await until(() => isOpen(dee2, 'cp-hb'));
            await fill(dee2, { text: 'Bigger sparks.' });
            await submit(dee2);
            await until(() => entriesOf('111').find((e) => e.name === 'Ring of Sparks'), (e) => e && e.text === 'Bigger sparks.');
            errs(dee2, name, 'Dee edits');
        } finally { dee2.close(); }

        // ---- the sheet's copy survives the edit; updating is Pat's choice ----
        const pat2 = await launch(name);
        const patCopy = async (b) => { await b.go(`${BASE}/characters/${id}`); return until(() => charOf(b, id).then((c) => homebrewRows(c).length), (n) => n >= 6); };
        let snapshot;
        try {
            // a new browser: the character and its copy come back from the account
            await signIn(pat2, PLAYER, `/characters/${id}`);
            await until(() => pat2.ev(`!!document.querySelector('.hb-tabs')`));
            await pat2.ev(`[...document.querySelectorAll('.hb-tabs button')].find((b) => b.textContent === 'Spells').click()`);
            await until(() => pat2.ev(`[...document.querySelectorAll('.hb-link')].some((b) => b.textContent === 'Zap')`));
            await pat2.ev(`[...document.querySelectorAll('.hb-link')].find((b) => b.textContent === 'Zap').click()`);
            is(`${name} another device: pulled back, source and all`, await until(() => pat2.ev(`document.querySelector('.hb-hbsrc')?.textContent.includes("From Dee's homebrew.") === true`)), true);
            await pat2.ev(`document.querySelector('[data-act=dclose]')?.click()`);
            // the play state edits were made in the other browser while offline from the account: make them here too
            await edit(pat2, id, (ch) => { const f = (t, n) => ch.panels.find((p) => p.type === t).rows.find((r) => r.name === n); ch.view.all = true; ch.panels.find((p) => p.type === 'list').sub = 'other'; f('spells', 'Zap').prep = true; f('items', 'Ring of Sparks').att = 'yes'; f('items', 'Moon Blade').qty = 2; f('list', 'Lucky Star').used = 1; });
            await patCopy(pat2);
            is(`${name} the source's edit shows only as a badge`, await until(() => pat2.ev(`document.querySelectorAll('.hb-entry-h .badge.p').length`), (n) => n === 2), 2);
            let c = await charOf(pat2, id);
            is(`${name} and the copy is unchanged`, rowNamed(c, 'spells', 'Zap').desc, 'Zaps one.');

            const openInfo = async (n) => { await pat2.ev(`[...document.querySelectorAll('.hb-link')].find((b) => b.textContent === ${J(n)}).click()`); await until(() => pat2.ev(`!!document.querySelector('.hb-hbsrc')`)); };
            await openInfo('Zap');
            is(`${name} the detail says where it's from`, await pat2.ev(`document.querySelector('.hb-hbsrc').textContent.includes("From Dee's homebrew.")`), true);
            await click(pat2, '[data-act=hbup]');
            let dt = await until(() => pat2.ev(`document.querySelector('dialog[open]')?.textContent || ''`), (x) => x.includes('After the update'));
            is(`${name} the dialog lists the changes, no warning`, [dt.includes('Zaps one.'), dt.includes('Zaps two.'), dt.includes('3d6'), dt.includes('replaces your changes')], [true, true, true, false]);
            await click(pat2, '[data-act=hbupgo]');
            c = await until(() => charOf(pat2, id), (x) => rowNamed(x, 'spells', 'Zap').desc === 'Zaps two.');
            is(`${name} updated, prepared kept`, [rowNamed(c, 'spells', 'Zap').desc, rowNamed(c, 'spells', 'Zap').dmg[0].dice, rowNamed(c, 'spells', 'Zap').prep, await until(() => pat2.ev(`document.querySelectorAll('.hb-entry-h .badge.p').length`), (n) => n === 1)], ['Zaps two.', '3d6', true, 1]);
            await click(pat2, '.hb-undo button');
            c = await until(() => charOf(pat2, id), (x) => rowNamed(x, 'spells', 'Zap').desc === 'Zaps one.');
            is(`${name} Undo puts it back`, [rowNamed(c, 'spells', 'Zap').desc, rowNamed(c, 'spells', 'Zap').dmg[0].dice, rowNamed(c, 'spells', 'Zap').prep], ['Zaps one.', '2d6', true]);

            // a row changed by hand still gets the offer, with a warning
            await edit(pat2, id, (ch) => { ch.panels.find((p) => p.type === 'spells').rows.find((r) => r.name === 'Zap').desc = 'My own words.'; });
            await patCopy(pat2);
            await until(() => pat2.ev(`document.querySelectorAll('.hb-entry-h .badge.p').length`), (n) => n === 2);
            await openInfo('Zap');
            await click(pat2, '[data-act=hbup]');
            dt = await until(() => pat2.ev(`document.querySelector('dialog[open]')?.textContent || ''`), (x) => x.includes('After the update'));
            is(`${name} a hand edit is warned about`, [dt.includes('replaces your changes'), dt.includes('My own words.')], [true, true]);
            await click(pat2, '[data-act=hbupgo]');
            c = await until(() => charOf(pat2, id), (x) => rowNamed(x, 'spells', 'Zap').desc === 'Zaps two.');
            is(`${name} and Update replaces it`, rowNamed(c, 'spells', 'Zap').desc, 'Zaps two.');

            // an attuned item stays attuned through an update
            await until(() => pat2.ev(`!document.querySelector('dialog[open]')`));
            await openInfo('Ring of Sparks');
            await click(pat2, '[data-act=hbup]');
            await until(() => pat2.ev(`!!document.querySelector('dialog[open] [data-act=hbupgo]')`));
            is(`${name} attuned isn't a change`, await pat2.ev(`document.querySelector('dialog[open]').textContent.includes('Attunement')`), false);
            await click(pat2, '[data-act=hbupgo]');
            c = await until(() => charOf(pat2, id), (x) => rowNamed(x, 'items', 'Ring of Sparks').notes.includes('Bigger sparks.'));
            is(`${name} still attuned`, rowNamed(c, 'items', 'Ring of Sparks').att, 'yes');
            await until(() => pat2.ev(`!document.querySelector('dialog[open]')`));

            // the name suggestions, and names that aren't homebrew's to fill
            is(`${name} suggestions carry homebrew`, await until(() => pat2.ev(`!!document.querySelector('#hb-dl-srd option[value="Zap (homebrew)"]') && !!document.querySelector('#hb-dl-gear option[value="Mithral Coat (homebrew)"]')`)), true);
            await pat2.ev(`[...document.querySelectorAll('.hb-toggle')].find((b) => b.getAttribute('aria-label') === 'Edit Zap').click()`);
            const nameBox = `[...document.querySelectorAll('input[list="hb-dl-srd"]')].pop()`;
            await until(() => pat2.ev(`!!${nameBox}`));
            await pat2.ev(`(async () => { const i = ${nameBox}; i.dispatchEvent(new FocusEvent('focusin', { bubbles: true })); })()`);
            await sleep(800);
            await pat2.ev(`(() => { const i = ${nameBox}; i.value = 'Fireball'; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); })()`);
            await sleep(1500);
            c = await charOf(pat2, id);
            is(`${name} an official name never fills a homebrew row`, [rowsOf(c, 'spells')[0].name, rowsOf(c, 'spells')[0].desc, rowsOf(c, 'spells')[0].hbsrc.id], ['Fireball', 'Zaps two.', idOf('Zap')]);
            await until(() => pat2.ev(`!!${nameBox}`));
            await pat2.ev(`(() => { const i = ${nameBox}; i.value = 'Zap (homebrew)'; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); })()`);
            c = await until(() => charOf(pat2, id), (x) => rowsOf(x, 'spells')[0].name === 'Zap');
            is(`${name} picking the homebrew name fills the row with its clean name`, [rowsOf(c, 'spells')[0].name, rowsOf(c, 'spells')[0].desc], ['Zap', 'Zaps two.']);
            snapshot = J(homebrewRows(c));
            is(`${name} the copy reaches the account`, await until(() => J(homebrewRows(saved(id))), (x) => x === snapshot) === snapshot, true);
            errs(pat2, name, 'Pat updates');
        } finally { pat2.close(); }

        // ---- Dee archives one and takes another out of the campaign ----
        const dee3 = await launch(name);
        try {
            await signIn(dee3, DM, '/compendium/?tab=feat');
            await until(() => visible(dee3, '#cp-new'));
            await openRow(dee3, 'Lucky Star');
            await until(() => visible(dee3, '[data-hb-archive]'));
            await click(dee3, '[data-hb-archive]');
            is(`${name} archiving something shared asks`, await until(() => dee3.ev(`document.querySelector('#cp-hbask').open && document.querySelector('#cp-hbask-t').textContent.includes('Stonehold')`)), true);
            await click(dee3, '#cp-hbask-yes');
            await until(() => entriesOf('111').find((e) => e.name === 'Lucky Star'), (e) => e?.archived);
            // read-only from the Archived list
            await until(() => visible(dee3, '#cp-arch'));
            await click(dee3, '#cp-arch');
            await click(dee3, '[data-hb-read]');
            is(`${name} an archived entry reads, can't be edited`, await until(() => dee3.ev(`document.querySelector('#cp-dbody').textContent.includes('Reroll one.') && !!document.querySelector('#cp-dbody [data-unarchive]') && !document.querySelector('#cp-dbody [data-hb-edit]')`)), true);
            errs(dee3, name, 'Dee archives');
        } finally { dee3.close(); }

        // Dee can't remove her own from a campaign as "the DM" (only someone else's), so she takes Moon Blade back herself: the same for a member
        const dee4 = await launch(name);
        try {
            await signIn(dee4, DM, '/compendium/?tab=item');
            await until(() => visible(dee4, '#cp-new'));
            await openRow(dee4, 'Moon Blade');
            await until(() => visible(dee4, '[data-hb-share]'));
            await click(dee4, '[data-hb-share]');
            await until(() => JSON.parse(readFileSync(join(ACCOUNTS, 'campaigns', CAMP, 'homebrew.json'), 'utf8')).every((r) => r.id !== idOf('Moon Blade')));
            errs(dee4, name, 'Dee unshares');
        } finally { dee4.close(); }

        // ---- a third browser for Pat: the copies are all there, through normalise and a reload; the sources have gone ----
        const pat3 = await launch(name);
        try {
            await signIn(pat3, PLAYER, `/characters/${id}`);
            const rows = () => pat3.ev(`JSON.stringify((JSON.parse(localStorage.getItem('hb-sheet') || '{"chars":{}}').chars[${J(id)}]?.panels || []).flatMap((p) => p.rows || []).filter((r) => r.hbsrc))`);
            await until(() => pat3.ev(`!!document.querySelector('.hb-link')`));
            // any save here writes what this browser pulled from the account, through normalise(), to its storage
            await pat3.ev(`(() => { const i = document.querySelector('[data-k=name]'); i.value = 'Pat the Bold'; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); })()`);
            is(`${name} another device has the same copy`, (await until(rows, (x) => x === snapshot)) === snapshot, true);
            await pat3.go(`${BASE}/characters/${id}`);
            await until(() => pat3.ev(`!!document.querySelector('.hb-link')`));
            await sleep(600);
            is(`${name} a reload changes nothing`, (await rows()) === snapshot, true);
            is(`${name} nor does the account's save`, await until(() => J(homebrewRows(saved(id))), (x) => x === snapshot) === snapshot, true);
            await pat3.ev(`[...document.querySelectorAll('.hb-link')].find((b) => b.textContent === 'Lucky Star').click()`);
            is(`${name} the archived source's copy says so`, await until(() => pat3.ev(`document.querySelector('.hb-hbsrc')?.textContent.includes('No longer available to update') === true`)), true);
            await pat3.go(BASE + '/compendium/?tab=item');
            await until(() => visible(pat3, '#cp-new'));
            await search(pat3, 'Moon Blade');
            is(`${name} what's no longer shared leaves the Compendium`, await until(() => pat3.ev(`![...document.querySelectorAll('#cp-list .cp-row')].some((r) => r.querySelector('.cp-name').textContent === 'Moon Blade')`)), true);
            await pat3.go(`${BASE}/compendium/?t=item&i=hb:${idOf('Moon Blade')}`);
            is(`${name} a link says it isn't shared`, (await until(() => body(pat3), (x) => x.includes("isn't shared with you"))).includes("isn't shared with you"), true);
            // still shared, kept for offline; never shown signed out
            is(`${name} a read-only copy for offline`, await until(() => pat3.ev(`JSON.parse(localStorage.getItem('homebrew-shared') || '{"list":[]}').list.some((e) => e.name === 'Zap')`)), true);
            is(`${name} the copy carries no account mark`, await pat3.ev(`JSON.parse(localStorage.getItem('homebrew-shared')).list.some((e) => 'acct' in e)`), false);
            errs(pat3, name, 'Pat after the sources went');
        } finally { pat3.close(); }

        // ---- a shared computer: what one person made never goes to the next person's account ----
        const pc = await launch(name);
        try {
            await signIn(pc, '', '/compendium/?tab=rule');
            await until(() => visible(pc, '#cp-new'));
            await click(pc, '#cp-new');
            await until(() => isOpen(pc, 'cp-hb'));
            await fill(pc, { name: 'Visitor rule', text: 'Made signed out.' });
            await submit(pc);
            await until(() => body(pc), (x) => x.includes('Made signed out.'));
            await signIn(pc, PLAYER, '/compendium/?tab=rule', true);
            is(`${name} sign-in uploads it to that account`, (await until(() => entriesOf('222').find((e) => e.name === 'Visitor rule')))?.name, 'Visitor rule');
            is(`${name} marked with the account`, await until(() => pc.ev(`Object.values(JSON.parse(localStorage.getItem('homebrew')))[0].acct || ''`)), entriesOf('222').find((e) => e.name === 'Visitor rule').acct);
            is(`${name} signed-in sees the shared copy`, await until(() => pc.ev(`Homebrew.shared().length > 0`)), true);
            await pc.ev(`document.cookie = 'dndsid=; max-age=0; path=/'`);
            await pc.go(BASE + '/compendium/?tab=rule');
            await until(() => visible(pc, '#cp-new'));
            is(`${name} signed out: the shared copy is hidden`, await pc.ev(`[Homebrew.shared().length, !!localStorage.getItem('homebrew-shared')].join()`), '0,true');
            await signIn(pc, DM, '/compendium/?tab=rule', true);
            await until(() => pc.ev(`localStorage.getItem('homebrew-me') !== ''`));
            await sleep(1500);
            is(`${name} the next person's account doesn't get it`, entriesOf('111').some((e) => e.name === 'Visitor rule'), false);
            await search(pc, 'Visitor');
            await sleep(300);
            is(`${name} and they don't see it`, await pc.ev(`[...document.querySelectorAll('#cp-list .cp-row')].some((r) => r.querySelector('.cp-name').textContent === 'Visitor rule')`), false);
            is(`${name} but this browser keeps it`, await pc.ev(`Object.values(JSON.parse(localStorage.getItem('homebrew'))).some((e) => e.name === 'Visitor rule')`), true);
            errs(pc, name, 'shared computer');
        } finally { pc.close(); }

        // ---- the Monster Sheet's spell suggestions; a monster's row is its own copy ----
        const m = await launch(name);
        try {
            await signIn(m, DM, '/sheets/monster/');
            await until(() => m.ev(`!!JSON.parse(localStorage.getItem('monster-sheet') || '{}').cur`));
            await m.go(BASE + '/privacy/');
            await m.ev(`(() => { const db = JSON.parse(localStorage.getItem('monster-sheet')), c = db.chars[db.cur]; c.view.all = true; c.panels.find((p) => p.type === 'spells').rows.push({ id: 'hbrow1', name: 'Odd' }); c.updated = Date.now(); localStorage.setItem('monster-sheet', JSON.stringify(db)); })()`);
            await m.go(BASE + '/sheets/monster/');
            await until(() => m.ev(`!!document.querySelector('.hb-toggle[aria-label="Edit Odd"]')`));
            await click(m, '.hb-toggle[aria-label="Edit Odd"]');
            const box = `document.querySelector('input[list="hb-dl-srd"]')`;
            await until(() => m.ev(`!!${box}`));
            await m.ev(`${box}.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))`);
            is(`${name} monster suggestions carry homebrew`, await until(() => m.ev(`!!document.querySelector('#hb-dl-srd option[value="Zap (homebrew)"]')`)), true);
            await m.ev(`(() => { const i = ${box}; i.value = 'Zap (homebrew)'; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); })()`);
            is(`${name} and it fills a monster's row`, await until(() => m.ev(`(() => { const db = JSON.parse(localStorage.getItem('monster-sheet')), r = db.chars[db.cur].panels.find((p) => p.type === 'spells').rows[0]; return r.name + '|' + r.desc; })()`), (x) => x === 'Zap|Zaps two.'), 'Zap|Zaps two.');
            errs(m, name, 'Monster Sheet');
        } finally { m.close(); }
    }
} finally {
    web.kill();
}
console.log(bad ? `${bad} check(s) failed` : 'homebrew copies ok');
process.exit(bad ? 1 : 0);
