// Checks spell and weight rules on the sheet (ROADMAP 4.4, 4.5), signed in and playing it. Dee is the DM, Pat plays Aldric (paladin 4 / sorcerer 3, in the campaign) and
// Maren (wizard 3, in no campaign). Limit lines, the red count and toast, the slot hint with Use these and Undo, weight off leaving no trace with every saved value
// kept and back when it's on, the DM's card saving through the page, spell points with an empty and a filled table, the character's own switches, the 2024 rules,
// a phone, Add to sheet, and the campaign's copy working when the site can't be asked. No console errors.
//   node _dev/scripts/sheet-rules.mjs     (needs: cd live && npm install, and includes/config.php for sign-in)
// Uses stand-in account and session folders in the temp folder, never private/dnd/accounts or private/sessions.
import { mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { launch, serving, browsers } from './browser.mjs';

const SHIFT = +process.env.CHECK_PORT_SHIFT || 0, ROOT = join(import.meta.dirname, '../..'), WEB = 8142 + SHIFT, RELAY = 8104 + SHIFT, BASE = `http://localhost:${WEB}`;
const PHP = process.env.PHP || (process.platform === 'win32' ? 'C:/php/php.exe' : 'php');
const TMP = join(tmpdir(), 'dnd-rules-check' + (process.env.CHECK_PORT_SHIFT || '')), ACCOUNTS = join(TMP, 'accounts'), SESSIONS = join(TMP, 'sessions');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ser = (o) => `a:${Object.keys(o).length}:{` + Object.entries(o).map(([k, v]) => `s:${Buffer.byteLength(k)}:"${k}";s:${Buffer.byteLength(v)}:"${v}";`).join('') + '}';
const SID = { dm: 'rulescheckdm0000000000000000000000', pat: 'rulescheckpat000000000000000000000' };
const CAMP = 'a1a100000001';

let n = 1;
const spell = (name, lvl, source, prep) => ({ id: 's' + n++, name, lvl, source, prep: !!prep });
const item = (name, qty, wt, extra) => ({ id: 'i' + n++, name, qty, wt, cat: 'Gear', ...extra });
const abil = (o) => ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'].map((key) => ({ key, name: key, score: o[key] || 10, save: false, sb: '' }));
function aldric() {
    return { id: 'aldr', name: 'Aldric', race: 'Human', updated: 5, art: '', view: { noAnim: true }, hp: { cur: 40, base: 40, temp: 0, mod: 0 }, abilities: abil({ STR: 16, CHA: 16 }),
        classes: [{ name: 'Paladin', level: 4, die: 10, hdUsed: 0 }, { name: 'Sorcerer', level: 3, die: 6, hdUsed: 0 }], speeds: [{ type: 'Walk', ft: 30, hover: false }, { type: 'Fly', ft: 10, hover: false }, { type: 'Swim', ft: '30 ft', hover: false }],
        capF: 'STR_SCORE * 15', coinsOn: false, // saved by someone before the switch went off: both must survive
        panels: [{ id: 'sp', type: 'spells', title: 'Spells', on: true, sub: 'all', dc: '8 + PROF + CHA', atk: 'PROF + CHA', slots: [{ max: 4, used: 1 }, { max: 2, used: 0 }], sp: { max: 3, used: 1 }, meta: [],
            rows: [...['Fire Bolt', 'Light', 'Mage Hand', 'Prestidigitation'].map((x) => spell(x, 0, 'Sorcerer')), ...['Bless', 'Cure Wounds', 'Shield of Faith', 'Command', 'Heroism'].map((x) => spell(x, 1, 'Paladin', true)), spell('Divine Favor', 1, 'Paladin'),
                ...['Burning Hands', 'Shield', 'Magic Missile', 'Thunderwave'].map((x) => spell(x, 1, 'Sorcerer')), spell('Misty Step', 2, 'Sorcerer'), spell('Protection from Evil', 1, 'Oath of Devotion', true), spell('Detect Magic', 1, undefined, true), spell('Identify', 1)] },
        { id: 'it', type: 'items', title: 'Inventory', on: true, sub: 'all', attMax: 3, coins: { pp: 5, gp: 112, ep: 0, sp: 40, cp: 23 },
            rows: [item('Chain Mail', 1, 55, { eq: true, cat: 'Armour' }), item('Longsword', 1, 3, { eq: true, cat: 'Weapons' }), item('Arrow', 20, 0.05), item('Rations (1 day)', 10, 2), item('Crowbar', 1, 0), item("Thieves' Tools", 1, 0), item('Tent', 1, 20, { off: true }), item("Sister's letter", 1, 0)] }] };
}
const maren = () => ({ id: 'mare', name: 'Maren', race: 'Gnome', updated: 5, art: '', view: { noAnim: true }, hp: { cur: 20, base: 20, temp: 0, mod: 0 }, abilities: abil({ STR: 8, INT: 16 }), classes: [{ name: 'Wizard', level: 3, die: 6, hdUsed: 0 }], speeds: [{ type: 'Walk', ft: 25, hover: false }],
    panels: [{ id: 'sp', type: 'spells', title: 'Spells', on: true, sub: 'all', dc: '8 + PROF + INT', atk: 'PROF + INT', slots: [{ max: 4, used: 0 }, { max: 2, used: 0 }], sp: { max: 0, used: 0 }, meta: [], rows: [spell('Sleep', 1, 'Wizard', true), spell('Fire Bolt', 0, 'Wizard')] },
        { id: 'it', type: 'items', title: 'Inventory', on: true, sub: 'all', attMax: 3, coins: { pp: 0, gp: 1000, ep: 0, sp: 0, cp: 0 }, rows: [item('Book', 21, 5)] }] });

let bad = 0;
const is = (name, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) { bad++; console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); } };
const has = (name, got, re) => { if (!re.test(String(got))) { bad++; console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${re}`); } };

for (const name of browsers) {
    rmSync(TMP, { recursive: true, force: true });
    mkdirSync(SESSIONS, { recursive: true });
    for (const [who, sub, nm] of [['dm', '111', 'Dee'], ['pat', '222', 'Pat']]) writeFileSync(join(SESSIONS, 'sess_' + SID[who]), 'user|' + ser({ sub, email: `${who}@example.com`, name: nm }));
    for (const [id, make] of [['aldr', aldric], ['mare', maren]]) {
        mkdirSync(join(ACCOUNTS, 'characters', id), { recursive: true });
        writeFileSync(join(ACCOUNTS, 'characters', id, 'meta.json'), JSON.stringify({ owner: '222', visibility: 'private', created: 1, campaigns: [] }));
        writeFileSync(join(ACCOUNTS, 'characters', id, 'character.json'), JSON.stringify(make()));
    }
    mkdirSync(join(ACCOUNTS, 'campaigns', CAMP), { recursive: true });
    writeFileSync(join(ACCOUNTS, 'campaigns', CAMP, 'campaign.json'), JSON.stringify({ id: CAMP, name: 'Rules Test', dm: '111', code: 'a100000001', created: 1, members: [{ sub: '111', name: 'Dee', joined: 1, characters: [] }, { sub: '222', name: 'Pat', joined: 2, characters: [{ sheet: 'player', id: 'aldr' }] }] }));
    const web = spawn(PHP, ['-S', `127.0.0.1:${WEB}`, '-t', ROOT, join(ROOT, '_dev/router.php')], { stdio: 'ignore', env: { ...process.env, DND_ACCOUNTS: ACCOUNTS, DND_SESSIONS: SESSIONS, DND_BACKUPS: join(TMP, 'backups'), DND_MONSTER_BACKUPS: join(TMP, 'monster-backups'), LIVE_RELAY: `127.0.0.1:${RELAY}`, LIVE_WS: `ws://localhost:${RELAY}/` } });
    const relay = spawn(process.execPath, [join(ROOT, 'live/relay.js')], { stdio: 'ignore', env: { ...process.env, PORT: RELAY, AUTH_URL: `http://127.0.0.1:${WEB}/live/auth.php`, ORIGIN: BASE } });
    const b = await launch(name);
    const errs = (where) => { if (b.errors.length) { bad++; console.log(`FAIL ${name} ${where}: console errors ${JSON.stringify(b.errors).slice(0, 400)}`); } };
    try {
        await serving(BASE + '/privacy/'); await serving(`http://127.0.0.1:${RELAY}/health`);
        await b.block(/backup\.php|prefs\.php/);
        const q = (s) => `document.querySelector(${JSON.stringify(s)})`;
        const txt = (s) => b.ev(`${q(s)}?.textContent.replace(/\\s+/g, ' ').trim() ?? ''`);
        const is1 = (s) => b.ev(`!!${q(s)}`);
        const click = (s) => b.ev(`(() => { const e = ${q(s)}; if (!e) return false; e.click(); return true; })()`);
        const clickText = (s, t) => b.ev(`(() => { const e = [...document.querySelectorAll(${JSON.stringify(s)})].find((x) => x.textContent.includes(${JSON.stringify(t)})); if (!e) return false; e.click(); return true; })()`);
        const type = (s, v, ev = 'input') => b.ev(`(() => { const e = ${q(s)}; if (!e) return false; e.value = ${JSON.stringify(v)}; e.dispatchEvent(new Event(${JSON.stringify(ev)}, { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
        const tick = (s, on) => b.ev(`(() => { const e = ${q(s)}; if (!e) return false; if (e.checked !== ${!!on}) e.click(); return true; })()`);
        const rowTick = (label, ck) => b.ev(`(() => { const e = [...document.querySelectorAll('.hb-entry')].find((x) => x.querySelector('.hb-link')?.textContent === ${JSON.stringify(label)})?.querySelector(${JSON.stringify(ck)}); if (!e) return null; e.click(); return e.checked; })()`);
        const signIn = async (sid) => { await b.go(BASE + '/privacy/'); await b.ev(`localStorage.clear(); localStorage.setItem('hb-sheet-merged', '1'); document.cookie = 'dndsid=${sid}; path=/'`); };
        const open = async (id) => { await b.go(`${BASE}/characters/${id}`); await b.until(`${q('#hb-limits')}?.children.length || document.querySelector('.hb-panel')`); await b.until(`${q('.hb-limit')} || ${q('#hb-sheet')}`); await sleep(500); };
        const saved = (id) => JSON.parse(readFileSync(join(ACCOUNTS, 'characters', id, 'character.json'), 'utf8'));
        const versions = (id) => readdirSync(join(ACCOUNTS, 'characters', id, 'history')).filter((f) => /^\d+\.json$/.test(f)).length;
        const local = (id) => b.ev(`JSON.stringify(JSON.parse(localStorage.getItem('hb-sheet') || '{"chars":{}}').chars.${id} || null)`).then(JSON.parse);
        const rulesApi = (body) => fetch(BASE + '/campaigns/api.php', { method: 'POST', headers: { Cookie: 'dndsid=' + SID.dm, 'Content-Type': 'application/json' }, body: JSON.stringify({ act: 'rules', id: CAMP, methods: ['pb'], hp: ['avg'], ...body }) }).then((r) => r.status);
        const PTS = Array.from({ length: 20 }, (_, i) => 4 + 4 * i), COST = Array.from({ length: 9 }, (_, i) => 2 * (i + 1));

        // ---- every panel at once, so nothing depends on a tab ----
        await signIn(SID.pat);
        for (const id of ['aldr', 'mare']) { const c = JSON.parse(readFileSync(join(ACCOUNTS, 'characters', id, 'character.json'), 'utf8')); c.view.all = true; writeFileSync(join(ACCOUNTS, 'characters', id, 'character.json'), JSON.stringify(c)); }
        await open('aldr');

        // ---- limits ----
        await b.until(`${q('.hb-limit')}`, 20000);
        const lines = () => b.ev(`[...document.querySelectorAll('.hb-limit')].map((x) => x.textContent.replace(/\\s+/g, ' ').trim()).join(' | ')`);
        is(`${name} a line per class, not assigned apart`, await lines(), 'Paladin 4Prepared 5 of 5 | Sorcerer 3Known 5 of 4Cantrips 4 of 4 | Not assigned2 spells, added by hand, not counted');
        is(`${name} over the limit is red`, await b.ev(`[...document.querySelectorAll('.hb-limit b.badge.r')].map((x) => x.textContent).join()`), '5 of 4');
        is(`${name} no tick on a cantrip or a known spell`, await b.ev(`['Fire Bolt', 'Burning Hands'].map((n) => !![...document.querySelectorAll('.hb-entry')].find((x) => x.querySelector('.hb-link')?.textContent === n)?.querySelector('[data-k$=".prep"]')).join()`), 'false,false');
        is(`${name} a tick on a prepared class's spell`, await rowTick('Divine Favor', '[data-k$=".prep"]'), true);
        has(`${name} ticking too many warns`, await txt('.toasts'), /prepared 6 paladin spells but can prepare 5/);
        has(`${name} and the count goes red`, await lines(), /Prepared 6 of 5/);
        await rowTick('Divine Favor', '[data-k$=".prep"]');
        await click('[data-act=limitinfo][data-n=Paladin]');
        has(`${name} a limit opens how it's worked out`, await txt('#hb-drawer-body'), /Charisma modifier|CHA modifier/);
        await click('[data-act=dclose]');
        await click('[data-act=limitinfo][data-n=""]');
        has(`${name} not assigned explains itself`, await txt('#hb-drawer-body'), /never warn/);
        await click('[data-act=dclose]');

        // ---- slots ----
        has(`${name} the hint`, await txt('#hb-slothint'), /Your classes give 4\/3\/2/);
        await click('[data-act=mcinfo]');
        has(`${name} the hint opens the rule`, await txt('#hb-drawer-body'), /rounded down/);
        await click('[data-act=dclose]');
        await click('[data-act=useslots]');
        await b.until(`!${q('#hb-slothint')}`);
        is(`${name} Use these sets them`, (await local('aldr')).panels.find((p) => p.type === 'spells').slots.slice(0, 3).map((s) => s.max), [4, 3, 2]);
        is(`${name} and keeps what was used`, (await local('aldr')).panels.find((p) => p.type === 'spells').slots[0].used, 1);
        await b.ev(`[...document.querySelectorAll('.hb-undo')].find((x) => x.textContent.includes('Spell slots set')).querySelector('button').click()`);
        await b.until(`${q('#hb-slothint')}`);
        is(`${name} Undo puts them back`, (await local('aldr')).panels.find((p) => p.type === 'spells').slots.slice(0, 3).map((s) => s.max), [4, 2, 0]);
        errs('limits and slots');

        // ---- weight off (the default): nothing of it shows, every value stays ----
        for (const [what, s] of [['bar', '.progress'], ['line', '#hb-wtline'], ['Not carried', '.hb-nc'], ['Coins carried', '[data-k=coinsOn]'], ['formula', '[data-k=capF]'], ['Fill', '#hb-fill'], ['total', '.hb-wt']]) is(`${name} weight off: no ${what}`, await is1(`#hb-sheet ${s}`), false);
        has(`${name} weight off: coins still show`, await txt('.hb-purse'), /112 gp/);
        has(`${name} weight off: speed as saved`, await b.ev(`document.querySelector('[data-c=speed]').textContent`), /^Walk 30 ft/);
        has(`${name} weight off: items still show weights`, await txt('#hb-sheet [data-c^="isum:"]'), /55 lb/);
        await b.ev(`document.querySelector('#hb-sheet [data-act=toggle][aria-label="Edit Chain Mail"]').click()`);
        is(`${name} weight off: the weight field stays when editing an item`, await is1('[data-k$=".wt"]'), true);
        await b.ev(`document.querySelector('#hb-sheet [data-act=toggle][aria-label="Edit Chain Mail"]').click()`);
        await open('aldr');
        const off1 = await local('aldr');
        is(`${name} weight off: saved values kept`, [off1.coinsOn, off1.capF, off1.panels.find((p) => p.type === 'items').rows.find((r) => r.name === 'Tent').off, off1.panels.find((p) => p.type === 'items').rows.find((r) => r.name === 'Tent').wt], [false, 'STR_SCORE * 15', true, 20]);

        // ---- the player's view of the card, then the DM's card through the page ----
        await b.go(`${BASE}/campaigns/${CAMP}#campaign`);
        await b.until(`${q('#cp-rules')}`);
        has(`${name} a player reads the rules`, await txt('#cp-rules'), /Spell points: off\. Carried weight: not tracked\./);
        is(`${name} a player has no form`, await is1('#cp-rulesf'), false);
        await signIn(SID.dm);
        await b.go(`${BASE}/campaigns/${CAMP}#campaign`);
        await b.until(`${q('#cp-rulesf')}`);
        is(`${name} the table is hidden until spell points are on`, await b.ev(`${q('#cp-r-table')}.hidden`), true);
        await click('#cp-r-sp');
        is(`${name} ticking shows the table`, await b.ev(`${q('#cp-r-table')}.hidden`), false);
        await b.ev(`document.querySelectorAll('#cp-rulesf input[name=m]').forEach((i) => { i.checked = i.value === 'pb'; }); document.querySelectorAll('#cp-rulesf input[name=hp]').forEach((i) => { i.checked = i.value === 'avg'; }); 0`);
        await click('#cp-rulesf [type=submit]');
        await b.until(`document.querySelector('.toasts')?.textContent.includes('Saved the character rules')`);
        const v0 = () => JSON.parse(readFileSync(join(ACCOUNTS, 'campaigns', CAMP, 'campaign.json'), 'utf8')).rules;
        is(`${name} the card saves the switch`, v0(), { methods: ['pb'], hp: ['avg'], sp: true });

        // ---- spell points with an empty table: slots stay, with a note ----
        await signIn(SID.pat);
        await open('aldr');
        await b.until(`${q('#hb-notable')}`, 15000);
        has(`${name} empty table: a note`, await txt('#hb-notable'), /hasn't filled in the spell points table/);
        is(`${name} empty table: slots stay`, await is1('#hb-sheet .hb-slots'), true);
        is(`${name} the copy is on the character`, (await local('aldr')).campRules.id, CAMP);
        for (let i = 0; i < 60 && !saved('aldr').campRules?.id; i++) await sleep(200);
        is(`${name} the copy reaches the account`, saved('aldr').campRules?.id, CAMP);
        const verBefore = versions('aldr'), stamp = (await local('aldr')).updated;

        // ---- the DM types the table: a counter instead of slots, costs on rows ----
        is(`${name} the DM saves a table`, await rulesApi({ sp: true, pts: PTS, cost: COST }), 200);
        await open('aldr');
        await b.until(`${q('#hb-points')}`, 15000);
        for (let i = 0; i < 60 && saved('aldr').campRules?.pts?.[4] !== 20; i++) await sleep(200);
        is(`${name} a new copy reaches the account`, saved('aldr').campRules.pts[4], 20);
        is(`${name} it's no edit: no new stamp, no version`, [(await local('aldr')).updated, versions('aldr') - verBefore], [stamp, 0]);
        has(`${name} counter`, await txt('#hb-points'), /of 20, caster level 5/);
        is(`${name} slots hidden`, await is1('#hb-sheet .hb-slots'), false);
        is(`${name} no slot hint`, await is1('#hb-slothint'), false);
        has(`${name} cost on rows`, await b.ev(`[...document.querySelectorAll('.hb-entry')].find((x) => x.querySelector('.hb-link')?.textContent === 'Misty Step').textContent`), /4 pts/);
        await click('#hb-points [data-d="1"]');
        await b.until(`${q('#hb-ptsleft')}?.value === '19'`);
        await click('#hb-points [data-d="-1"]');
        await b.until(`${q('#hb-ptsleft')}?.value === '20'`);
        await type('#hb-ptsleft', '7', 'x');
        await b.until(`${q('#hb-ptsleft')}?.value === '7'`);
        is(`${name} points used saved`, (await local('aldr')).spellPts.used, 13);
        await click('[data-act=ptsinfo]');
        has(`${name} the counter opens the table`, await txt('#hb-drawer-body'), /Your DM's table/);
        await click('[data-act=dclose]');
        await clickText('.hb-sub button', 'Metamagic');
        is(`${name} Flexible Casting hidden`, [await is1('.hb-flex'), await is1('#hb-flexoff')], [false, true]);
        await b.ev(`[...document.querySelectorAll('.hb-sub')].find((x) => x.textContent.includes('Metamagic')).querySelector('button').click()`);
        await click('[data-act=rest][data-r=long]');
        await click('[data-act=dolong]');
        await b.until(`${q('#hb-ptsleft')}?.value === '20'`);
        is(`${name} a long rest refills points`, (await local('aldr')).spellPts.used, 0);
        is(`${name} the slots are still saved`, (await local('aldr')).panels.find((p) => p.type === 'spells').slots.slice(0, 2).map((s) => s.max), [4, 2]);
        errs('spell points');

        // ---- weight on: everything, and the values saved while off are back ----
        is(`${name} the DM tracks weight`, await rulesApi({ sp: false, weight: true }), 200);
        await open('aldr');
        await b.until(`${q('#hb-wtline')}`, 15000);
        has(`${name} coins came back off: the line has no coins`, await txt('#hb-wtline'), /^Items 79 lb = 79 of 240 lb$/);
        is(`${name} Coins carried tick came back off`, await b.ev(`${q('[data-k=coinsOn]')}.checked`), false);
        is(`${name} Not carried tick came back on`, await b.ev(`[...document.querySelectorAll('.hb-entry')].find((x) => x.querySelector('.hb-link')?.textContent === 'Tent').querySelector('[data-k$=".off"]').checked`), true);
        await tick('[data-k=coinsOn]', true);
        await b.until(`${q('#hb-wtline')}?.textContent.includes('coins')`);
        has(`${name} coins count, 50 to the pound`, await txt('#hb-wtline'), /^Items 79 lb \+ coins 3\.6 lb = 82\.6 of 240 lb$/);
        has(`${name} encumbered: a warning`, await txt('#hb-wmsg'), /^Encumbered: speed 20 ft \(saved 30 ft\)\.$/);
        is(`${name} all speeds drop, words left alone`, await b.ev(`document.querySelector('[data-c=speed]').textContent`), 'Walk 20 ft (saved 30 ft) · Fly 0 ft (saved 10 ft) · Swim 30 ft');
        is(`${name} the saved speed is unchanged`, (await local('aldr')).speeds[0].ft, 30);
        is(`${name} the bar is red`, await is1('.hb-weight .progress.hb-over'), true);
        await click('#hb-wtline');
        has(`${name} the line opens the rule`, await txt('#hb-drawer-body'), /Strength score multiplied by 15/);
        await click('[data-act=dclose]');
        await rowTick('Rations (1 day)', '[data-k$=".off"]');
        await b.until(`${q('#hb-wtline')}?.textContent.startsWith('Items 59 lb')`);
        is(`${name} Not carried leaves the weight`, await b.ev(`[...document.querySelectorAll('.hb-entry')].find((x) => x.querySelector('.hb-link')?.textContent === 'Rations (1 day)').classList.contains('hb-offrow')`), true);
        await rowTick('Rations (1 day)', '[data-k$=".off"]');
        await b.until(`${q('#hb-wtline')}?.textContent.startsWith('Items 79 lb')`);
        await b.until(`${q('#hb-fill')}`, 20000);
        has(`${name} Fill says what matches`, await txt('.hb-weight .actions'), /2 items match by exact name/);
        await click('#hb-fill');
        await b.until(`${q('#hb-wtline')}?.textContent.startsWith('Items 85 lb')`);
        has(`${name} Fill says what it didn't find`, await txt('.toasts'), /Filled in 2 weights\. 1 at 0 lb had no exact match\./);
        is(`${name} Fill is done`, await is1('#hb-fill'), false);
        is(`${name} only 0 lb rows change`, (await local('aldr')).panels.find((p) => p.type === 'items').rows.map((r) => r.wt), [55, 3, 0.05, 2, 5, 1, 20, 0]);
        await b.ev(`[...document.querySelectorAll('.hb-undo')].find((x) => x.textContent.includes('Filled in')).querySelector('button').click()`);
        await b.until(`${q('#hb-wtline')}?.textContent.startsWith('Items 79 lb')`);
        await b.ev(`document.querySelector('.hb-weight ~ details').open = true`);
        await type('[data-k=capF]', 'STR_SCORE * 30');
        await b.until(`${q('#hb-wtline')}?.textContent.includes('of 480 lb')`);
        is(`${name} limits follow the formula`, await is1('#hb-wmsg'), false);
        await type('[data-k=capF]', 'STR_SCORE * 5');
        await b.until(`${q('#hb-wmsg')}?.textContent.includes('Over your carrying capacity')`);
        has(`${name} over capacity warns and keeps the speed rule`, await txt('#hb-wmsg'), /^Heavily encumbered: speed 10 ft \(saved 30 ft\), with disadvantage .* Over your carrying capacity by 2\.6 lb\.$/);
        await type('[data-k=capF]', 'nonsense(');
        await b.until(`${q('#hb-wtline')}?.textContent.includes('of ?')`);
        await type('[data-k=capF]', 'STR_SCORE * 15');
        await b.until(`${q('#hb-wtline')}?.textContent.includes('of 240 lb')`);
        errs('weight on');
        await sleep(500); // the save

        // ---- off again: gone, values kept; on again: back. In a campaign the character's own switches are locked ----
        is(`${name} the DM stops tracking`, await rulesApi({ weight: false }), 200);
        await open('aldr');
        await b.until(`!${q('#hb-wtline')}`, 15000);
        for (const s of ['.hb-nc', '[data-k=coinsOn]', '[data-k=capF]', '#hb-fill']) is(`${name} off again: no ${s}`, await is1(`#hb-sheet ${s}`), false);
        has(`${name} off again: speed as saved`, await b.ev(`document.querySelector('[data-c=speed]').textContent`), /^Walk 30 ft · Fly 10 ft/);
        const off2 = await local('aldr');
        is(`${name} off again: values kept`, [off2.coinsOn, off2.panels.find((p) => p.type === 'items').rows.find((r) => r.name === 'Tent').off], [true, true]);
        is(`${name} on again`, await rulesApi({ weight: true }), 200);
        await open('aldr');
        await b.until(`${q('#hb-wtline')}`, 15000);
        is(`${name} on again: ticks back`, [await b.ev(`${q('[data-k=coinsOn]')}.checked`), await b.ev(`[...document.querySelectorAll('.hb-entry')].find((x) => x.querySelector('.hb-link')?.textContent === 'Tent').querySelector('[data-k$=".off"]').checked`)], [true, true]);
        await click('[data-act=custom]');
        await click('[data-act=ctab][data-id=rules]');
        is(`${name} a campaign locks the character's own switches`, await b.ev(`${q('[data-k=weightOn]')}.disabled && ${q('[data-k="spellPts.on"]')}.disabled`), true);
        has(`${name} and says so`, await txt('#hb-camplock'), /Your campaign sets spell points \(off\) and carried weight \(tracked\)/);

        // ---- 2024: limits and the prepared tab follow the character's version ----
        await type('[data-k=rulesVer]', '2024');
        await click('[data-act=close]');
        await b.until(`document.querySelector('.hb-limit')?.parentElement.textContent.includes('Prepared 0 of 6')`, 20000);
        has(`${name} 2024 sorcerer prepares`, await lines(), /Sorcerer 3Prepared 0 of 6Cantrips 4 of 4/);
        is(`${name} 2024 sorcerer gets ticks`, await rowTick('Burning Hands', '[data-k$=".prep"]'), true);
        await rowTick('Burning Hands', '[data-k$=".prep"]');
        await b.until(`${q('#hb-wtline')}`);
        await click('#hb-wtline');
        has(`${name} 2024 rule text says the encumbrance is the older rule`, await txt('#hb-drawer-body'), /older SRD 5\.1 rule.*Speed can be no more than 5 feet|Speed can be no more than 5 feet.*older SRD 5\.1 rule/);
        await click('[data-act=dclose]');
        await click('[data-act=custom]'); await click('[data-act=ctab][data-id=rules]');
        await type('[data-k=rulesVer]', '2014');
        await click('[data-act=close]');
        errs('2024');

        // ---- Maren: no campaign, so her own switches and table ----
        await open('mare');
        await click('[data-act=custom]'); await click('[data-act=ctab][data-id=rules]');
        is(`${name} no campaign: not locked`, await b.ev(`${q('[data-k=weightOn]')}.disabled`), false);
        is(`${name} no campaign: off by default`, [await b.ev(`${q('[data-k=weightOn]')}.checked`), await is1('#hb-camplock')], [false, false]);
        await click('[data-k=weightOn]');
        await b.until(`${q('#hb-wtline')}`);
        await click('[data-k="spellPts.on"]');
        await b.until(`${q('#hb-notable')}`, 15000);
        has(`${name} her own empty table says where to fill it`, await txt('#hb-notable'), /in Customise/);
        await type('[data-k="spellPts.pts.2"]', '12');
        await type('[data-k="spellPts.cost.0"]', '3');
        await click('[data-act=close]');
        await b.until(`${q('#hb-points')}`);
        has(`${name} her counter`, await txt('#hb-points'), /of 12, caster level 3/);
        has(`${name} her costs`, await b.ev(`[...document.querySelectorAll('.hb-entry')].find((x) => x.querySelector('.hb-link')?.textContent === 'Sleep').textContent`), /3 pts/);
        has(`${name} a wizard: spellbook, prepared, cantrips`, await lines(), /Wizard 3Spellbook 1 of 10Prepared 1 of 6Cantrips 1 of 3/);
        has(`${name} she's over`, await txt('#hb-wmsg'), /Over your carrying capacity by 5 lb/);
        await tick('[data-k=coinsOn]', false);
        await b.until(`${q('#hb-wtline')}?.textContent === 'Items 105 lb = 105 of 120 lb'`);
        errs('own switches');
        for (let i = 0; i < 80 && !saved('mare').weightOn; i++) await sleep(200);
        is(`${name} it follows the account`, [saved('mare').weightOn, saved('mare').spellPts.on, saved('mare').spellPts.pts[2]], [true, true, '12']);

        // ---- a phone: the tick in the opened row, nothing sideways ----
        await open('aldr');
        await b.until(`${q('#hb-wtline')}`, 15000);
        await b.shot(390, 844);
        await b.until(`document.documentElement.classList.contains('ph-on')`);
        await b.ev(`document.querySelector('#ph-tabs [data-id=items]').click(); 1`);
        await b.until(`${q('#hb-wtline')}`);
        is(`${name} phone: no sideways scroll`, await b.ev(`document.documentElement.scrollWidth <= innerWidth`), true);
        await clickText('.hb-entry .ph-rowname', 'Chain Mail');
        await b.until(`${q('.ph-rowopen .hb-nc')}`);
        is(`${name} phone: Not carried is 44 px`, await b.ev(`${q('.ph-rowopen .hb-nc')}.offsetHeight >= 44`), true);
        await b.ev(`document.querySelector('#ph-tabs [data-id=spells]').click(); 1`);
        await b.until(`${q('.hb-limit')}`);
        is(`${name} phone: limits show`, await b.ev(`document.querySelector('.hb-limit').offsetHeight > 0 && document.documentElement.scrollWidth <= innerWidth`), true);
        await b.shot(1366, 900);
        errs('phone');

        // ---- Add to sheet: a magic item takes its base item's weight ----
        await b.go(BASE + '/privacy/');
        await b.ev(`localStorage.setItem('hb-pending', JSON.stringify([{ id: 'p1', char: 'aldr', name: 'Longsword (+1)', kind: 'item', cat: 'Magic items', item: { wt: 0, gp: '', att: '', props: [] }, notes: '' }, { id: 'p2', char: 'aldr', name: 'Bag of Holding', kind: 'item', cat: 'Magic items', item: { wt: 0, gp: '', att: 'needs', props: [] }, notes: '' }]))`);
        await open('aldr');
        await b.until(`[...document.querySelectorAll('.hb-entry .hb-link')].some((x) => x.textContent === 'Bag of Holding')`, 15000);
        const added = (await local('aldr')).panels.find((p) => p.type === 'items').rows;
        is(`${name} a magic weapon takes its base's weight`, added.find((r) => r.name === 'Longsword (+1)')?.wt, 3);
        is(`${name} one whose name doesn't show a base stays 0`, added.find((r) => r.name === 'Bag of Holding')?.wt, 0);
        is(`${name} new rows are carried`, added.find((r) => r.name === 'Bag of Holding')?.off, false);

        // ---- the campaign's copy keeps working when the site can't be asked ----
        await b.block(/backup\.php|prefs\.php|log\.php/);
        await open('aldr');
        await sleep(500);
        is(`${name} no answer: the copy still applies`, await is1('#hb-wtline'), true);
        is(`${name} no answer: the copy stays`, (await local('aldr')).campRules.weight, true);
        errs('copy');
        await b.block(/backup\.php|prefs\.php/);

        // ---- leaving the campaign clears the copy, and her own settings count again ----
        const camp = JSON.parse(readFileSync(join(ACCOUNTS, 'campaigns', CAMP, 'campaign.json'), 'utf8'));
        camp.members[1].characters = [];
        writeFileSync(join(ACCOUNTS, 'campaigns', CAMP, 'campaign.json'), JSON.stringify(camp));
        await open('aldr');
        await b.until(`!${q('#hb-wtline')}`, 15000);
        is(`${name} left the campaign: the copy is cleared`, (await local('aldr')).campRules.id, '');
        errs('left');
        console.log(`${name} done`);
    } catch (e) {
        bad++;
        console.log(`FAIL ${name}: ${e.message}\n  at ${await b.ev('location.href + " " + document.body.textContent.replace(/\\s+/g, " ").slice(0, 300)').catch(() => '')}\n  console: ${JSON.stringify(b.errors).slice(0, 800)}`);
    } finally {
        b.close(); web.kill(); relay.kill();
        await sleep(300);
    }
}
rmSync(TMP, { recursive: true, force: true });
if (bad) { console.log(`${bad} failed`); process.exit(1); }
console.log('sheet rules page ok');
process.exit(0);
