// Checks the initiative tracker (ROADMAP 1.4) and one campaign per character end to end, with the real relay in front of
// a local PHP server. The DM (Dee) runs the fight on the battle map page (/campaigns/<id>/map, ROADMAP 1.6) and adds monsters
// from the Monster Sheet's list; Pat plays Lock on their sheet; Sam and Kit roll
// through the site's API. Then the same goblin is damaged from two Monster Sheets and the campaign page at once.
// Browser A is Chrome (Firefox with --firefox), browser B the other one, so both browsers play both parts.
//   node _dev/scripts/initiative-page.mjs [--firefox]   (needs: cd live && npm install, and includes/config.php for sign-in)
// Uses stand-in account and session folders in the temp folder, never private/dnd/accounts or private/sessions.
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { launch, serving } from './browser.mjs';

const SHIFT = +process.env.CHECK_PORT_SHIFT || 0, ROOT = join(import.meta.dirname, '../..'), WEB = 8122 + SHIFT, RELAY = 8097 + SHIFT, BASE = `http://localhost:${WEB}`;
const PHP = process.env.PHP || (process.platform === 'win32' ? 'C:/php/php.exe' : 'php');
const TMP = join(tmpdir(), 'dnd-fight-check' + (process.env.CHECK_PORT_SHIFT || '')), ACCOUNTS = join(TMP, 'accounts'), SESSIONS = join(TMP, 'sessions');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ser = (o) => `a:${Object.keys(o).length}:{` + Object.entries(o).map(([k, v]) => `s:${Buffer.byteLength(k)}:"${k}";s:${Buffer.byteLength(v)}:"${v}";`).join('') + '}';
const SID = { dm: 'fightcheckdm00000000000000000000000', pat: 'fightcheckpat0000000000000000000000', sam: 'fightchecksam0000000000000000000000', kit: 'fightcheckkit0000000000000000000000' };
const CAMP = 'f1f100000001', CAMP2 = 'f1f100000002';
const FF = process.argv.includes('--firefox');

rmSync(TMP, { recursive: true, force: true });
mkdirSync(SESSIONS, { recursive: true });
for (const [who, sub, name] of [['dm', '111', 'Dee'], ['pat', '222', 'Pat'], ['sam', '333', 'Sam'], ['kit', '444', 'Kit']]) writeFileSync(join(SESSIONS, 'sess_' + SID[who]), 'user|' + ser({ sub, email: `${who}@example.com`, name }));
for (const [id, owner, name] of [['lock', '222', 'Lock'], ['ozzy', '333', 'Ozzy'], ['kitt', '444', 'Kitt']]) {
    mkdirSync(join(ACCOUNTS, 'characters', id), { recursive: true });
    writeFileSync(join(ACCOUNTS, 'characters', id, 'meta.json'), JSON.stringify({ owner, visibility: 'private', created: 1, campaigns: [] }));
    writeFileSync(join(ACCOUNTS, 'characters', id, 'character.json'), JSON.stringify({ id, name, race: 'Human', updated: 5, art: '', view: { noAnim: true }, hp: { cur: 21, base: 21, temp: 0, mod: 0 }, classes: [{ name: 'Rogue', level: 3, die: 8, hdUsed: 0 }], abilities: [] }));
}
mkdirSync(join(ACCOUNTS, 'monsters', '111'), { recursive: true });
const DEX = (s) => [['STR', 'Strength', 8], ['DEX', 'Dexterity', s], ['CON', 'Constitution', 10], ['INT', 'Intelligence', 10], ['WIS', 'Wisdom', 8], ['CHA', 'Charisma', 8]].map(([key, name, score]) => ({ key, name, score, save: false, sb: '' }));
for (const [id, name, hp, dex, ac] of [['gob', 'Goblin', 7, 14, '15'], ['ogre', 'Ogre', 59, 8, '11']])
    writeFileSync(join(ACCOUNTS, 'monsters', '111', id + '.json'), JSON.stringify({ id, name, updated: 5, cr: '1', abilities: DEX(dex), ac, init: 'DEX', hp: { cur: hp, base: hp, temp: 0, mod: 0 }, view: { noAnim: true } }));
// Sam's own monster, for when Sam is a co-DM
mkdirSync(join(ACCOUNTS, 'monsters', '333'), { recursive: true });
writeFileSync(join(ACCOUNTS, 'monsters', '333', 'wolf.json'), JSON.stringify({ id: 'wolf', name: 'Wolf', updated: 5, cr: '1', abilities: DEX(15), ac: '13', init: 'DEX', hp: { cur: 11, base: 11, temp: 0, mod: 0 } }));
const camp = (id, name, dm, members) => {
    mkdirSync(join(ACCOUNTS, 'campaigns', id), { recursive: true });
    writeFileSync(join(ACCOUNTS, 'campaigns', id, 'campaign.json'), JSON.stringify({ id, name, dm, code: id.slice(2), created: 1, members }));
};
camp(CAMP, 'Fight Test', '111', [{ sub: '111', name: 'Dee', joined: 1, characters: [] }, { sub: '222', name: 'Pat', joined: 2, characters: [{ sheet: 'player', id: 'lock' }] },
    { sub: '333', name: 'Sam', joined: 3, characters: [{ sheet: 'player', id: 'ozzy' }] }, { sub: '444', name: 'Kit', joined: 4, characters: [{ sheet: 'player', id: 'kitt' }] }]);
// Kit's campaign; Ozzy is in both from before the one-campaign rule
camp(CAMP2, 'Other Table', '444', [{ sub: '444', name: 'Kit', joined: 1, characters: [] }, { sub: '333', name: 'Sam', joined: 2, characters: [{ sheet: 'player', id: 'ozzy' }] },
    { sub: '222', name: 'Pat', joined: 3, characters: [] }]);

const web = spawn(PHP, ['-S', `127.0.0.1:${WEB}`, '-t', ROOT, join(ROOT, '_dev/router.php')], { stdio: 'ignore',
    env: { ...process.env, DND_ACCOUNTS: ACCOUNTS, DND_SESSIONS: SESSIONS, LIVE_RELAY: `127.0.0.1:${RELAY}`, LIVE_WS: `ws://localhost:${RELAY}/` } });
const relay = spawn(process.execPath, [join(ROOT, 'live/relay.js')], { stdio: 'ignore', env: { ...process.env, PORT: RELAY, AUTH_URL: `http://127.0.0.1:${WEB}/live/auth.php`, ORIGIN: BASE } });
await serving(BASE + '/privacy/'); await serving(`http://127.0.0.1:${RELAY}/health`);

let bad = 0;
const is = (name, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) { bad++; console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); } else console.log(`ok   ${name}`); };
async function until(b, expr, ok, ms = 6000) { const t = Date.now(); let v; while (Date.now() - t < ms) { v = await b.ev(expr); if (ok(v)) return v; await sleep(150); } return v; }
const api = (sid, body) => fetch(`${BASE}/campaigns/api.php`, { method: 'POST', headers: { Cookie: 'dndsid=' + sid, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, ...(await r.json()) }));
const fight = (sid, c = CAMP) => fetch(`${BASE}/campaigns/fight.php?c=${c}`, { headers: { Cookie: 'dndsid=' + sid } }).then((r) => r.text());
const goblin = () => JSON.parse(readFileSync(join(ACCOUNTS, 'monsters', '111', 'gob.json'), 'utf8'));
const go = async (b, url) => { await b.go(url); for (let i = 0; i < 80 && !(await b.ev(`document.readyState === 'complete' && !!document.querySelector('main')`)); i++) await sleep(100); };
const signIn = async (b, sid) => { await go(b, BASE + '/privacy/'); await b.ev(`localStorage.clear(); localStorage.setItem('hb-sheet-merged', '1'); document.cookie = 'dndsid=${sid}; path=/'`); };
const text = (sel) => `document.querySelector('${sel}')?.textContent.replace(/\\s+/g, ' ').trim() || ''`;
const click = (b, sel) => b.ev(`(() => { const e = document.querySelector(\`${sel}\`); if (!e) return false; e.click(); return true; })()`);
const panel = text('[data-mp=side]'); // the DM's left panel on the map page
const fop = async (op, extra = {}) => api(SID.dm, { act: 'fight', id: CAMP, op, v: JSON.parse(await fight(SID.dm)).fight?.v, ...extra });
const openSide = (b) => until(b, `(() => { const s = document.querySelector('[data-mp=side]'); if (s && !s.hidden) return true; document.querySelector('[data-mpa=side]')?.click(); return false; })()`, Boolean);
const MAP = `${BASE}/campaigns/${CAMP}/map`;
const strip = text('#hb-fight');

const pat = await launch(FF ? 'firefox' : 'chrome'), dm = await launch(FF ? 'chrome' : 'firefox');
try {
    for (const b of [pat, dm]) await b.block(/backup\.php|prefs\.php/);
    await signIn(pat, SID.pat);
    await signIn(dm, SID.dm);
    await go(pat, BASE + '/characters/lock');
    await go(dm, BASE + '/sheets/monster/');
    is('no fight: no strip on the sheet', await pat.ev(`!document.querySelector('#hb-fight')`), true);
    // the controls moved to the map page: the Monster Sheet only links there
    is('Monster Sheet: a link to start the fight on the map', (await until(dm, text('#mon-fight'), (t) => t.includes('Start one on the map'))).includes('Start one on the map'), true);
    is('Monster Sheet: no fight controls', await dm.ev(`!document.querySelector('#mon-fight [data-fi]')`), true);
    await go(dm, MAP);
    await openSide(dm);
    is('map page: no fight yet, the panel offers an encounter', (await until(dm, panel, (t) => t.includes('Combat Encounter'))).includes('Combat Encounter'), true);

    // the DM starts a fight; Pat gets a notice and rolls from it
    await fop('start');
    is('player sheet: only a prompt to roll, no order', [(await until(pat, strip, (t) => t.includes('Roll initiative'))).includes('The DM started a fight'), await pat.ev(`!document.querySelector('#hb-fight .fi-row, #hb-fight .fi-top')`)], [true, true]);
    await click(pat, '[data-fi=roll]');
    is('Lock rolled in and shows on the DM tracker', (await until(dm, panel, (t) => t.includes('Lock'))).includes('Lock'), true);
    is('the prompt goes once rolled', await until(pat, `!document.querySelector('#hb-fight')`, Boolean), true);
    const n = JSON.parse(await fight(SID.sam)).fight.n;
    is('Sam and Kit roll in', [(await api(SID.sam, { act: 'roll', id: CAMP, roll: { id: 'samroll000001', char: 'ozzy', title: 'Initiative', expr: '1d20 + 3', shown: '14 + 3', total: '17', fight: n } })).status,
        (await api(SID.kit, { act: 'roll', id: CAMP, roll: { id: 'kitroll000001', char: 'kitt', title: 'Initiative', expr: '1d20 + 1', shown: '2 + 1', total: '3', vis: 'dm', fight: n } })).status], [200, 200]);
    is('three players in the order', JSON.parse(await fight(SID.dm)).fight.entries.length, 3);

    // the DM adds both monsters from the Monster Sheet's list (it still can), then hides the ogre and starts round 1 on the map
    await go(dm, BASE + '/sheets/monster/');
    is('Monster Sheet: a link to run the fight on the map', (await until(dm, text('#mon-fight'), (t) => t.includes('Run it on the map'))).includes('Run it on the map'), true);
    is('sidebar: add buttons while a fight runs', await until(dm, `!!document.querySelector('[data-act=fightadd][data-id=gob]') && !!document.querySelector('[data-act=fightadd][data-id=ogre]')`, Boolean), true);
    await click(dm, '#mon-side [data-act=fightadd][data-id=gob]'); await until(dm, `!document.querySelector('[data-act=fightadd][data-id=gob]')`, Boolean); await click(dm, '#mon-side [data-act=fightadd][data-id=ogre]');
    is('both monsters added', await until(dm, `document.querySelectorAll('#mon-side .mon-list .badge').length`, (v) => v >= 2).then(async () => JSON.parse(await fight(SID.dm)).fight.entries.length), 5);
    await go(dm, MAP);
    await openSide(dm);
    is('map page: all five in the order', await until(dm, `document.querySelectorAll('[data-mp=side] .mpt-orow').length`, (v) => v === 5), 5);
    const dv = JSON.parse(await fight(SID.dm)).fight;
    const ogre = dv.entries.find((e) => e.mon === 'ogre');
    is('monster numbers for the DM: HP and AC', [ogre.hp, ogre.ac, dv.entries.find((e) => e.mon === 'gob').ac], [{ cur: 59, max: 59, temp: 0 }, 11, 15]);
    await fop('hide', { e: ogre.id, on: true });
    await until(dm, text('[data-mp=side]'), (t) => t.includes('hidden'));
    await click(dm, '[data-mpa=round1]');
    is('round 1', (await until(dm, text('[data-mp=tracker] .mpt-trt'), (t) => t.includes('Round 1'))).includes('Round 1'), true);

    // two rounds: Next until round 3; the order and turns belong on the VTT, so Lock's sheet shows none of it
    let sawStrip = false;
    for (let i = 0; i < 12 && !(await dm.ev(text('[data-mp=tracker] .mpt-trt'))).includes('Round 3'); i++) {
        // each Next moves the current row on the DM's panel; Lock's sheet gets the same news through the relay and must still show no strip
        const turnOf = `document.querySelector('[data-mp=side] .mpt-orow.on .mpt-rname')?.textContent`;
        const top = await dm.ev(turnOf);
        await until(dm, `document.querySelector('[data-mpa=next]')?.disabled === false`, Boolean, 3000);
        await click(dm, '[data-mpa=next]');
        await until(dm, turnOf, (t) => t !== top, 3000);
        if (await until(pat, `!!document.querySelector('#hb-fight')`, Boolean, 600)) sawStrip = true;
    }
    is('advanced two rounds', (await dm.ev(text('[data-mp=tracker] .mpt-trt'))).includes('Round 3'), true);
    is("Lock's sheet showed no order, turn or round", sawStrip, false);

    // the DM damages the goblin from the tracker: players see Bloodied, never numbers
    await dm.ev(`[...document.querySelectorAll('[data-mp=side] .mpt-orow')].find((li) => li.textContent.includes('Goblin')).querySelector('[data-mpa=pickhp]').click(); 1`);
    await until(dm, `!!document.querySelector('dialog[open] [data-hn]')`, Boolean);
    await dm.ev(`document.querySelector('dialog[open] [data-hn]').value = '4'; document.querySelector('dialog[open] [data-h=dmg]').click(); 1`);
    is('goblin HP saved through the account', await until(dm, '1', () => goblin().hp.cur === 3), 1);
    is('server goblin HP', goblin().hp.cur, 3);
    for (const [who, sid] of [['Pat', SID.pat], ['Sam', SID.sam]]) {
        const j = await fight(sid);
        is(`${who}: no hidden monster, numbers or HP in the response`, [j.includes('Ogre'), j.includes('ogre'), j.includes('"hp"'), j.includes('"init"'), j.includes('"cur"')], [false, false, false, false, false]);
    }

    // a reload on any device shows the same state
    const before = JSON.parse(await fight(SID.dm)).fight;
    await go(pat, BASE + '/characters/lock');
    // watched for as long as the old sleep gave the sheet to load the fight: no strip may show up in that time
    is('player reload: still no strip on the sheet', await until(pat, `!!document.querySelector('#hb-fight')`, Boolean, 1500), false);
    await go(dm, MAP);
    is('DM reload: same fight', (await until(dm, text('[data-mp=tracker] .mpt-trt'), (t) => t.includes('Round 3'))).includes('Round 3'), true);
    const after = JSON.parse(await fight(SID.dm)).fight;
    is('state unchanged by reloads', [after.round, after.turn, after.entries.length], [before.round, before.turn, before.entries.length]);
    // the campaign page: the player sees the order, the DM numbers
    await go(pat, `${BASE}/campaigns/${CAMP}`);
    const pc = await until(pat, text('#cp-fight'), (t) => t.includes('Round 3'));
    is('campaign page (player): order, round, no numbers', [pc.includes('Goblin'), /HP|AC/.test(pc), pc.includes('Ogre')], [true, false, false]);
    is('campaign page (player): goblin Bloodied, the timer runs', [pc.includes('Bloodied'), /\d+:\d\d/.test(pc)], [true, true]);

    // a stale DM change is refused
    is('a change from an old copy is refused', (await api(SID.dm, { act: 'fight', id: CAMP, op: 'next', v: 1 })).error, 'This fight changed, reloaded.');

    // a co-DM: the DM makes Sam one while Sam has the campaign page open; it reconnects with the DM's view, live
    await signIn(pat, SID.sam);
    await go(pat, `${BASE}/campaigns/${CAMP}`);
    await until(pat, text('#cp-fight'), (t) => t.includes('Round 3'));
    is('Sam (player) refused DM changes', (await api(SID.sam, { act: 'fight', id: CAMP, op: 'next', v: JSON.parse(await fight(SID.dm)).fight.v })).status, 403);
    await until(pat, `document.querySelector('#cp-players .cp-on:not([hidden])') ? 1 : 0`, Boolean); // connected
    is('the DM makes Sam a co-DM', (await api(SID.dm, { act: 'codm', id: CAMP, member: '333', on: true })).codms, ['333']);
    const cv = await until(pat, text('#cp-fight'), (t) => t.includes('HP') && t.includes('Ogre'), 10000);
    is("co-DM's open page: numbers, HP and the hidden ogre", [cv.includes('HP 59/59'), cv.includes('Ogre')], [true, true]);
    is('co-DM page reloaded with the co-DM view', await until(pat, `document.querySelector('#main').dataset.role`, (v) => v === 'codm'), 'codm');
    await until(pat, `document.querySelector('#cp-players .cp-on:not([hidden])') ? 1 : 0`, Boolean, 10000);
    await api(SID.dm, { act: 'session', id: CAMP, start: true }); // the Rolls tab shows rolls of a session (ROADMAP 1.9)
    await api(SID.kit, { act: 'roll', id: CAMP, roll: { id: 'kitwhisper001', char: 'kitt', title: 'Insight', expr: '1d20', shown: '12', total: '12', vis: 'dm' } });
    is("a roll sent to the DM reaches the co-DM live", (await until(pat, text('#cp-log'), (t) => t.includes('Insight'), 8000)).includes('Insight'), true);
    const v0 = JSON.parse(await fight(SID.sam)).fight.v;
    is('co-DM adds their own monster and runs turns', [(await api(SID.sam, { act: 'fight', id: CAMP, op: 'add', items: [{ kind: 'monster', mon: 'wolf', init: 12, bonus: 2, ac: 13 }], v: v0 })).status,
        (await api(SID.sam, { act: 'fight', id: CAMP, op: 'next', v: v0 + 1 })).status], [200, 200]);
    is("the DM sees the co-DM's wolf with its HP", JSON.parse(await fight(SID.dm)).fight.entries.find((e) => e.mon === 'wolf')?.hp, { cur: 11, max: 11, temp: 0 });
    const hpAs = (sid, mon, op, c) => fetch(`${BASE}/sheets/monster/cloud.php?hp=${mon}${c ? '&c=' + c : ''}`, { method: 'POST', headers: { Cookie: 'dndsid=' + sid, 'Content-Type': 'application/json' }, body: JSON.stringify({ op }) }).then((r) => r.status);
    is("co-DM changes the DM's goblin HP only through the campaign", [await hpAs(SID.sam, 'gob', { k: 'dmg', n: 1 }), await hpAs(SID.sam, 'gob', { k: 'dmg', n: 1 }, CAMP), goblin().hp.cur], [404, 200, 2]);
    await hpAs(SID.sam, 'gob', { k: 'heal', n: 1 }, CAMP);
    is("the DM changes the co-DM's wolf HP", [await hpAs(SID.dm, 'wolf', { k: 'dmg', n: 4 }, CAMP), JSON.parse(readFileSync(join(ACCOUNTS, 'monsters', '333', 'wolf.json'), 'utf8')).hp.cur], [200, 7]);
    is("a player can't change monster HP through a campaign", await hpAs(SID.kit, 'gob', { k: 'dmg', n: 1 }, CAMP), 404);
    is('goblin back where it was', goblin().hp.cur, 3);
    is('the DM makes Sam a player again', (await api(SID.dm, { act: 'codm', id: CAMP, member: '333', on: false })).codms, []);
    const pv = await until(pat, text('#cp-fight'), (t) => !t.includes('HP') && !t.includes('Ogre'), 10000);
    is("player again: no numbers or hidden ogre on the open page", [pv.includes('HP'), pv.includes('Ogre')], [false, false]);
    await until(pat, `document.querySelector('#main').dataset.role`, (v) => v === 'player');
    await until(pat, `document.querySelector('#cp-players .cp-on:not([hidden])') ? 1 : 0`, Boolean, 10000);
    await api(SID.kit, { act: 'roll', id: CAMP, roll: { id: 'kitwhisper002', char: 'kitt', title: 'Perception', expr: '1d20', shown: '9', total: '9', vis: 'dm' } });
    await api(SID.kit, { act: 'roll', id: CAMP, roll: { id: 'kitpublic0001', char: 'kitt', title: 'Athletics', expr: '1d20', shown: '5', total: '5' } });
    const lg = await until(pat, text('#cp-log'), (t) => t.includes('Athletics'), 8000);
    is('player again: a roll sent to the DM no longer reaches them', [lg.includes('Athletics'), lg.includes('Perception'), lg.includes('Insight')], [true, false, false]);
    await api(SID.dm, { act: 'session', id: CAMP, start: false });
    is('player again: DM changes refused', (await api(SID.sam, { act: 'fight', id: CAMP, op: 'next', v: JSON.parse(await fight(SID.dm)).fight.v })).status, 403);

    // the same goblin from two Monster Sheets and the campaign page, at once
    await signIn(pat, SID.dm); // Pat's browser is the DM's second device now
    await go(pat, BASE + '/sheets/monster/');
    await until(pat, `JSON.parse(localStorage.getItem('monster-sheet') || '{}').chars?.gob?.hp.cur`, (v) => v === 3);
    await click(pat, '[data-act=side][data-id=gob]');
    await go(dm, `${BASE}/campaigns/${CAMP}`);
    await until(dm, `!!document.querySelector('#cp-fight .fi-hp[data-mon=gob]')`, Boolean);
    await until(pat, `document.querySelector('#hb-amt') ? 1 : 0`, Boolean);
    // heal 3 on sheet 2, damage 2 from the campaign page, damage 1 by a third client: 3 + 3 - 2 - 1 = 3 (no change lost)
    await pat.ev(`(() => { document.querySelector('#hb-amt').value = '3'; const f = document.querySelector('form[data-act=hp]'); const b = f.querySelector('button[value=heal]') || f.querySelector('button[value=auto]'); f.requestSubmit(b); })()`);
    await dm.ev(`(() => { const f = document.querySelector('#cp-fight .fi-hp[data-mon=gob]'); f.querySelector('input').value = '2'; f.querySelector('button[value=dmg]').click(); })()`);
    await fetch(`${BASE}/sheets/monster/cloud.php?hp=gob`, { method: 'POST', headers: { Cookie: 'dndsid=' + SID.dm, 'Content-Type': 'application/json' }, body: JSON.stringify({ op: { k: 'dmg', n: 1 } }) });
    // (the file can be read half-written while the server saves it: that read counts as not yet)
    const hpNow = () => { try { return goblin().hp.cur; } catch { return null; } };
    for (const t = Date.now(); hpNow() !== 3 && Date.now() - t < 10000;) await sleep(50);
    is('every change counted on the server', goblin().hp.cur, 3);
    const twice = () => fetch(`${BASE}/sheets/monster/cloud.php?hp=gob`, { method: 'POST', headers: { Cookie: 'dndsid=' + SID.dm, 'Content-Type': 'application/json' }, body: JSON.stringify({ q: 'samechange0001', op: { k: 'heal', n: 1 } }) });
    await twice(); await twice();
    is('the same change sent twice counts once', goblin().hp.cur, 4);
    await fetch(`${BASE}/sheets/monster/cloud.php?hp=gob`, { method: 'POST', headers: { Cookie: 'dndsid=' + SID.dm, 'Content-Type': 'application/json' }, body: JSON.stringify({ op: { k: 'dmg', n: 1 } }) });
    is('Monster Sheet 2 caught up live', await until(pat, `JSON.parse(localStorage.getItem('monster-sheet')).chars.gob.hp.cur`, (v) => v === 3), 3);
    is('campaign page shows the same HP', (await until(dm, text('#cp-fight'), (t) => t.includes('HP 3/7'))).includes('HP 3/7'), true);
    // an old copy saved whole never puts old HP back
    const old = { ...goblin(), hp: { cur: 7, base: 7, temp: 0, mod: 0 }, hpAt: 1, name: 'Goblin', updated: Date.now() + 1000 };
    await fetch(`${BASE}/sheets/monster/cloud.php`, { method: 'POST', headers: { Cookie: 'dndsid=' + SID.dm, 'Content-Type': 'application/json' }, body: JSON.stringify(old) });
    is('a stale whole save keeps the newer HP', goblin().hp.cur, 3);
    is('nothing waiting in the HP outbox', await pat.ev(`JSON.parse(localStorage.getItem('monster-hp-outbox') || '[]').length`), 0);

    // ending: a yes/no first, then kept in fights/1.json
    await go(dm, BASE + '/sheets/monster/');
    await until(dm, `!!document.querySelector('[data-act=side][data-id=gob]')`, Boolean);
    // archiving a monster that's in the fight (ROADMAP 0.5): it stays, marked Archived, until the DM removes it
    const gobRow = `[...document.querySelectorAll('[data-mp=side] .mpt-orow')].find((li) => li.textContent.includes('Goblin'))`;
    while (Date.now() <= goblin().updated) await sleep(100); // the stale save above is stamped a second ahead
    await click(dm, '[data-act=side][data-id=gob]');
    await until(dm, `!!document.querySelector('[data-act=manage]')`, Boolean);
    await click(dm, '[data-act=manage]'); await click(dm, '[data-act=archive]');
    await until(dm, '1', () => { try { return !!goblin().archived; } catch { return false; } });
    await go(dm, MAP);
    await openSide(dm);
    is('archived goblin stays in the fight, marked', await until(dm, `${gobRow}?.textContent.includes('Archived') || false`, Boolean), true);
    is('server: goblin archived, HP kept', [!!goblin().archived, goblin().hp.cur], [true, 3]);
    await fop('remove', { e: JSON.parse(await fight(SID.dm)).fight.entries.find((e) => e.mon === 'gob').id });
    is('the DM removes the archived goblin', await until(dm, `!${gobRow}`, Boolean), true);
    is('removed from the fight', JSON.parse(await fight(SID.dm)).fight.entries.some((e) => e.mon === 'gob'), false);
    // the DM's connection drops: the controls pause
    await dm.ev(`(() => { const f = window.fetch; window.fetch = (u, o) => (window.cut && /fight\.php|maps\.php/.test(String(u)) ? Promise.reject(new TypeError('offline')) : f(u, o)); window.cut = true; return Promise.all([Fight.load('${CAMP}'), BM.load()]).then(() => 1); })()`);
    is('offline: controls paused', [(await dm.ev(text('[data-mp=paused]'))).includes('Offline, changes paused'), await dm.ev(`document.querySelector('[data-mpa=next]').disabled`)], [true, true]);
    await dm.ev(`window.cut = false; Promise.all([Fight.load('${CAMP}'), BM.load()]).then(() => 1)`);
    is('back online: controls back', await until(dm, `document.querySelector('[data-mpa=next]')?.disabled === false`, Boolean), true);
    await click(dm, '[data-mpa=endpop]');
    await until(dm, `!!document.querySelector('.mpt-endpop [data-mpa=end]')`, Boolean);
    await click(dm, '.mpt-endpop [data-mpa=end]');
    is('end asks first', await until(dm, `!!document.querySelector('dialog[open] [value=yes]')`, Boolean), true);
    await click(dm, 'dialog[open] [value=yes]');
    is('fight ended and kept', await until(dm, panel, (t) => t.includes('Combat Encounter')).then(() => existsSync(join(ACCOUNTS, 'campaigns', CAMP, 'fights', '1.json'))), true);
    is('table log: started and ended only', JSON.parse(await (await fetch(`${BASE}/campaigns/log.php?c=${CAMP}`, { headers: { Cookie: 'dndsid=' + SID.sam } })).text()).entries.filter((e) => e.name === 'DM').map((e) => e.title), ['Fight started', 'Fight ended']);

    // one campaign per character: Ozzy is in two campaigns from before the rule; Sam's sheet asks which to keep
    await signIn(pat, SID.sam);
    await go(pat, BASE + '/characters/ozzy');
    is('sheet: notice for a character in two campaigns', (await until(pat, text('#hb-camps'), (t) => t.includes('Keep in Other Table'))).includes('Clone for Fight Test'), true);
    await click(pat, '[data-act=campkeep][data-c="' + CAMP + '"]');
    is('keep in one: it leaves the other', await until(pat, `!document.querySelector('#hb-camps')`, Boolean).then(() => JSON.parse(readFileSync(join(ACCOUNTS, 'campaigns', CAMP2, 'campaign.json'), 'utf8')).members[1].characters), []);
    // attaching it to the other campaign again is refused, with a clone offered
    await go(pat, `${BASE}/campaigns/${CAMP2}`);
    await pat.ev(`(() => { document.querySelector('#cp-chars [name=ch][value=ozzy]').checked = true; document.querySelector('#cp-chars button[type=submit]').click(); })()`);
    is('campaign page: refused with a Clone button', (await until(pat, text('#cp-ask'), (t) => t.includes('Clone character'))).includes('already in Fight Test'), true);
    await click(pat, '#cp-ask-yes');
    const kept = await until(pat, `document.querySelectorAll('.ch-tiles .ch-tile').length`, (v) => v === 1);
    const linked = JSON.parse(readFileSync(join(ACCOUNTS, 'campaigns', CAMP2, 'campaign.json'), 'utf8')).members[1].characters.map((l) => l.id);
    const copy = linked[0] && JSON.parse(readFileSync(join(ACCOUNTS, 'characters', linked[0], 'character.json'), 'utf8'));
    is('the clone plays in the other campaign', [kept, linked.length, linked[0] !== 'ozzy', copy?.name], [1, 1, true, 'Ozzy (copy)']);

    // the refused attach above answers 409 on purpose
    for (const [who, b] of [['A', pat], ['B', dm]]) is(`no console errors (browser ${who})`, b.errors.filter((e) => !/backup\.php|prefs\.php|WebSocket|409 \(Conflict\)/.test(e) && !e.includes(RELAY)), []);
} finally { pat.close(); dm.close(); relay.kill(); web.kill(); rmSync(TMP, { recursive: true, force: true }); }
console.log(bad ? `${bad} check(s) failed` : 'initiative page ok');
process.exit(bad ? 1 : 0);
