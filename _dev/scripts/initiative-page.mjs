// Checks the initiative tracker (ROADMAP 1.4) and one campaign per character end to end, with the real relay in front of
// a local PHP server. The DM (Dee) runs the fight on the Monster Sheet; Pat plays Lock on their sheet; Sam and Kit roll
// through the site's API. Then the same goblin is damaged from two Monster Sheets and the campaign page at once.
// Browser A is Chrome (Firefox with --firefox), browser B the other one, so both browsers play both parts.
//   node _dev/scripts/initiative-page.mjs [--firefox]   (needs: cd live && npm install, and includes/config.php for sign-in)
// Uses stand-in account and session folders in the temp folder, never private/dnd/accounts or private/sessions.
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { launch } from './browser.mjs';

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
await sleep(1000);

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
const panel = text('#mon-fight');
const strip = text('#hb-fight');

const pat = await launch(FF ? 'firefox' : 'chrome'), dm = await launch(FF ? 'chrome' : 'firefox');
try {
    for (const b of [pat, dm]) await b.block(/backup\.php|prefs\.php/);
    await signIn(pat, SID.pat);
    await signIn(dm, SID.dm);
    await go(pat, BASE + '/characters/lock');
    await go(dm, BASE + '/sheets/monster/');
    is('no fight: no strip on the sheet', await pat.ev(`!document.querySelector('#hb-fight')`), true);
    is('Monster Sheet: the tracker offers a fight', (await until(dm, panel, (t) => t.includes('Start fight'))).includes('Start fight'), true);

    // the DM starts a fight; Pat gets a notice and rolls from it
    await click(dm, '[data-fi=start]');
    is('player sheet: the strip asks for initiative', (await until(pat, strip, (t) => t.includes('Roll initiative'))).includes('Rolling initiative'), true);
    await click(pat, '[data-fi=roll]');
    is('Lock rolled in and shows on the DM tracker', (await until(dm, panel, (t) => t.includes('Lock'))).includes('Lock'), true);
    is('the Roll button goes once rolled', await until(pat, `!document.querySelector('[data-fi=roll]')`, Boolean), true);
    const n = JSON.parse(await fight(SID.sam)).fight.n;
    is('Sam and Kit roll in', [(await api(SID.sam, { act: 'roll', id: CAMP, roll: { id: 'samroll000001', char: 'ozzy', title: 'Initiative', expr: '1d20 + 3', shown: '14 + 3', total: '17', fight: n } })).status,
        (await api(SID.kit, { act: 'roll', id: CAMP, roll: { id: 'kitroll000001', char: 'kitt', title: 'Initiative', expr: '1d20 + 1', shown: '2 + 1', total: '3', vis: 'dm', fight: n } })).status], [200, 200]);
    is('three players in the order', JSON.parse(await fight(SID.dm)).fight.entries.length, 3);

    // the DM adds both monsters from the sidebar, hides the ogre, starts round 1
    is('sidebar: add buttons while a fight runs', await until(dm, `document.querySelectorAll('[data-act=fightadd][data-id]').length`, (v) => v === 2), 2);
    await click(dm, '#mon-side [data-act=fightadd]:not([data-id])');
    is('both monsters added', await until(dm, `document.querySelectorAll('#mon-fight .fi-e').length`, (v) => v === 5), 5);
    const dv = JSON.parse(await fight(SID.dm)).fight;
    const ogre = dv.entries.find((e) => e.mon === 'ogre');
    is('monster numbers for the DM: HP and AC', [ogre.hp, ogre.ac, dv.entries.find((e) => e.mon === 'gob').ac], [{ cur: 59, max: 59, temp: 0 }, 11, 15]);
    await click(dm, `[data-fi=hide][data-fe="${ogre.id}"]`);
    await until(dm, `!!document.querySelector('#mon-fight .fi-e.hid')`, Boolean);
    await click(dm, '[data-fi=round1]');
    is('round 1', (await until(pat, strip, (t) => t.includes('Round 1'))).includes('Round 1'), true);
    is('the timer runs for players', await until(pat, `/\\d+:\\d\\d/.test(document.querySelector('#hb-fight .fi-time')?.textContent || '')`, Boolean), true);

    // two rounds: Next until round 3, watching for Lock's turn on the way
    let sawTurn = false, sawNext = false;
    for (let i = 0; i < 12 && !(await dm.ev(text('#mon-fight .fi-top'))).includes('Round 3'); i++) {
        await click(dm, '[data-fi=next]');
        await sleep(600);
        const s = await pat.ev(strip);
        if (s.includes('Your turn, Lock')) sawTurn = true;
        if (s.includes("You're up next")) sawNext = true;
    }
    is('advanced two rounds', (await dm.ev(text('#mon-fight .fi-top'))).includes('Round 3'), true);
    is("Lock's sheet showed Your turn and You're up next", [sawTurn, sawNext], [true, true]);

    // the DM damages the goblin from the tracker: players see Bloodied, never numbers
    await dm.ev(`(() => { const f = document.querySelector('#mon-fight .fi-hp[data-mon=gob]'); f.querySelector('input').value = '4'; f.querySelector('button[value=dmg]').click(); })()`);
    is('goblin HP saved through the account', await until(dm, `JSON.parse(localStorage.getItem('monster-sheet')).chars.gob.hp.cur`, (v) => v === 3), 3);
    is('server goblin HP', goblin().hp.cur, 3);
    await until(pat, strip, (t) => t.includes('Bloodied'));
    is('player sheet: goblin Bloodied', await pat.ev(`[...document.querySelectorAll('#hb-fight .fi-p')].find((li) => li.querySelector('.fi-n').textContent === 'Goblin')?.querySelector('.badge')?.textContent || ''`), 'Bloodied');
    const ps = await pat.ev(strip);
    is('player sheet: no numbers in the strip', [/HP|\/ ?7|59/.test(ps), ps.includes('Ogre')], [false, false]);
    for (const [who, sid] of [['Pat', SID.pat], ['Sam', SID.sam]]) {
        const j = await fight(sid);
        is(`${who}: no hidden monster, numbers or HP in the response`, [j.includes('Ogre'), j.includes('ogre'), j.includes('"hp"'), j.includes('"init"'), j.includes('"cur"')], [false, false, false, false, false]);
    }

    // a reload on any device shows the same state
    const before = JSON.parse(await fight(SID.dm)).fight;
    await go(pat, BASE + '/characters/lock');
    is('player reload: same round and turn', (await until(pat, strip, (t) => t.includes('Round 3'))).includes('Round 3'), true);
    await go(dm, BASE + '/sheets/monster/');
    is('DM reload: same fight', (await until(dm, panel, (t) => t.includes('Round 3'))).includes('Round 3'), true);
    const after = JSON.parse(await fight(SID.dm)).fight;
    is('state unchanged by reloads', [after.round, after.turn, after.entries.length], [before.round, before.turn, before.entries.length]);
    // the campaign page: the player sees the order, the DM numbers
    await go(pat, `${BASE}/campaigns/?c=${CAMP}`);
    const pc = await until(pat, text('#cp-fight'), (t) => t.includes('Round 3'));
    is('campaign page (player): order, round, no numbers', [pc.includes('Goblin'), /HP|AC/.test(pc), pc.includes('Ogre')], [true, false, false]);

    // a stale DM change is refused
    is('a change from an old copy is refused', (await api(SID.dm, { act: 'fight', id: CAMP, op: 'next', v: 1 })).error, 'This fight changed, reloaded.');

    // the same goblin from two Monster Sheets and the campaign page, at once
    await signIn(pat, SID.dm); // Pat's browser is the DM's second device now
    await go(pat, BASE + '/sheets/monster/');
    await until(pat, `JSON.parse(localStorage.getItem('monster-sheet') || '{}').chars?.gob?.hp.cur`, (v) => v === 3);
    await click(pat, '[data-act=side][data-id=gob]');
    await go(dm, `${BASE}/campaigns/?c=${CAMP}`);
    await until(dm, `!!document.querySelector('#cp-fight .fi-hp[data-mon=gob]')`, Boolean);
    await until(pat, `document.querySelector('#hb-amt') ? 1 : 0`, Boolean);
    // heal 3 on sheet 2, damage 2 from the campaign page, damage 1 by a third client: 3 + 3 - 2 - 1 = 3 (no change lost)
    await pat.ev(`(() => { document.querySelector('#hb-amt').value = '3'; const f = document.querySelector('form[data-act=hp]'); const b = f.querySelector('button[value=heal]') || f.querySelector('button[value=auto]'); f.requestSubmit(b); })()`);
    await dm.ev(`(() => { const f = document.querySelector('#cp-fight .fi-hp[data-mon=gob]'); f.querySelector('input').value = '2'; f.querySelector('button[value=dmg]').click(); })()`);
    await fetch(`${BASE}/sheets/monster/cloud.php?hp=gob`, { method: 'POST', headers: { Cookie: 'dndsid=' + SID.dm, 'Content-Type': 'application/json' }, body: JSON.stringify({ op: { k: 'dmg', n: 1 } }) });
    await sleep(2500);
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
    await until(dm, `!!document.querySelector('[data-fi=end]')`, Boolean);
    // the DM's connection drops: the controls pause
    await dm.ev(`(() => { const f = window.fetch; window.fetch = (u, o) => (window.cut && String(u).includes('fight.php') ? Promise.reject(new TypeError('offline')) : f(u, o)); window.cut = true; return Fight.load('${CAMP}').then(() => 1); })()`);
    is('offline: controls paused', [(await dm.ev(panel)).includes('Offline, changes paused'), await dm.ev(`document.querySelector('[data-fi=next]').disabled`)], [true, true]);
    await dm.ev(`window.cut = false; Fight.load('${CAMP}').then(() => 1)`);
    is('back online: controls back', await until(dm, `document.querySelector('[data-fi=next]')?.disabled === false`, Boolean), true);
    await click(dm, '[data-fi=end]');
    is('end asks first', await until(dm, `!!document.querySelector('#fi-ask[open]')`, Boolean), true);
    await click(dm, '#fi-ask button[value=yes]');
    is('fight ended and kept', await until(dm, panel, (t) => t.includes('Start fight')).then(() => existsSync(join(ACCOUNTS, 'campaigns', CAMP, 'fights', '1.json'))), true);
    is('table log: started and ended only', JSON.parse(await (await fetch(`${BASE}/campaigns/log.php?c=${CAMP}`, { headers: { Cookie: 'dndsid=' + SID.sam } })).text()).entries.filter((e) => e.name === 'DM').map((e) => e.title), ['Fight started', 'Fight ended']);

    // one campaign per character: Ozzy is in two campaigns from before the rule; Sam's sheet asks which to keep
    await signIn(pat, SID.sam);
    await go(pat, BASE + '/characters/ozzy');
    is('sheet: notice for a character in two campaigns', (await until(pat, text('#hb-camps'), (t) => t.includes('Keep in Other Table'))).includes('Clone for Fight Test'), true);
    await click(pat, '[data-act=campkeep][data-c="' + CAMP + '"]');
    is('keep in one: it leaves the other', await until(pat, `!document.querySelector('#hb-camps')`, Boolean).then(() => JSON.parse(readFileSync(join(ACCOUNTS, 'campaigns', CAMP2, 'campaign.json'), 'utf8')).members[1].characters), []);
    // attaching it to the other campaign again is refused, with a clone offered
    await go(pat, `${BASE}/campaigns/?c=${CAMP2}`);
    await pat.ev(`(() => { document.querySelector('#cp-chars [name=ch][value=ozzy]').checked = true; document.querySelector('#cp-chars button[type=submit]').click(); })()`);
    is('campaign page: refused with a Clone button', (await until(pat, text('#cp-ask'), (t) => t.includes('Clone character'))).includes('already in Fight Test'), true);
    await click(pat, '#cp-ask-yes');
    const kept = await until(pat, `document.querySelectorAll('.cp-grid .ch-card').length`, (v) => v === 1);
    const linked = JSON.parse(readFileSync(join(ACCOUNTS, 'campaigns', CAMP2, 'campaign.json'), 'utf8')).members[1].characters.map((l) => l.id);
    const copy = linked[0] && JSON.parse(readFileSync(join(ACCOUNTS, 'characters', linked[0], 'character.json'), 'utf8'));
    is('the clone plays in the other campaign', [kept, linked.length, linked[0] !== 'ozzy', copy?.name], [1, 1, true, 'Ozzy (copy)']);

    // the refused attach above answers 409 on purpose
    for (const [who, b] of [['A', pat], ['B', dm]]) is(`no console errors (browser ${who})`, b.errors.filter((e) => !/backup\.php|prefs\.php|WebSocket|409 \(Conflict\)/.test(e) && !e.includes(RELAY)), []);
} finally { pat.close(); dm.close(); relay.kill(); web.kill(); rmSync(TMP, { recursive: true, force: true }); }
console.log(bad ? `${bad} check(s) failed` : 'initiative page ok');
process.exit(bad ? 1 : 0);
