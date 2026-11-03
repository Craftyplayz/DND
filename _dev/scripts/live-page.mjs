// Checks live campaigns end to end: the DM's campaign page in headless Chrome and a player's in headless Firefox, both open
// at once, with the real relay (live/relay.js) in front of a local PHP server. Online dots, the party updating without a
// reload, a stopped relay showing "paused" while changes still arrive every 10 s, the relay coming back, and a removed
// player being sent away.   node _dev/scripts/live-page.mjs      (needs: cd live && npm install, and includes/config.php)
// Uses stand-in account and session folders in the temp folder, never private/dnd/accounts or private/sessions.
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { launch, serving } from './browser.mjs';

const ROOT = join(import.meta.dirname, '../..'), SHIFT = +process.env.CHECK_PORT_SHIFT || 0, WEB = 8118 + SHIFT, RELAY = 8098 + SHIFT, BASE = `http://localhost:${WEB}`;
const PHP = process.env.PHP || (process.platform === 'win32' ? 'C:/php/php.exe' : 'php');
const TMP = join(tmpdir(), 'dnd-live-check' + (process.env.CHECK_PORT_SHIFT || '')), ACCOUNTS = join(TMP, 'accounts'), SESSIONS = join(TMP, 'sessions');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ser = (o) => `a:${Object.keys(o).length}:{` + Object.entries(o).map(([k, v]) => `s:${Buffer.byteLength(k)}:"${k}";s:${Buffer.byteLength(v)}:"${v}";`).join('') + '}';
const SID = { dm: 'livecheckdm000000000000000000000', pl: 'livecheckpl000000000000000000000' };
const CAMP = 'c0ffee000001';

rmSync(TMP, { recursive: true, force: true });
mkdirSync(SESSIONS, { recursive: true });
writeFileSync(join(SESSIONS, 'sess_' + SID.dm), 'user|' + ser({ sub: '111', email: 'dm@example.com', name: 'Dee' }));
writeFileSync(join(SESSIONS, 'sess_' + SID.pl), 'user|' + ser({ sub: '222', email: 'pl@example.com', name: 'Pat' }));
for (const [id, owner, name] of [['dmpc', '111', 'Brannoc'], ['lock', '222', 'Lock']]) {
    mkdirSync(join(ACCOUNTS, 'characters', id), { recursive: true });
    writeFileSync(join(ACCOUNTS, 'characters', id, 'meta.json'), JSON.stringify({ owner, visibility: 'private', created: 1, campaigns: [] }));
    writeFileSync(join(ACCOUNTS, 'characters', id, 'character.json'), JSON.stringify({ id, name, race: 'Human', updated: 5, art: '', classes: [{ name: 'Fighter', level: 3 }], abilities: [] }));
}
mkdirSync(join(ACCOUNTS, 'campaigns', CAMP), { recursive: true });
writeFileSync(join(ACCOUNTS, 'campaigns', CAMP, 'campaign.json'), JSON.stringify({ id: CAMP, name: 'Live Test', dm: '111', code: 'abcdefabcd', created: 1, members: [
    { sub: '111', name: 'Dee', joined: 1, characters: [{ sheet: 'player', id: 'dmpc' }] }, { sub: '222', name: 'Pat', joined: 2, characters: [] }] }));

const web = spawn(PHP, ['-S', `127.0.0.1:${WEB}`, '-t', ROOT, join(ROOT, '_dev/router.php')], { stdio: 'ignore',
    env: { ...process.env, DND_ACCOUNTS: ACCOUNTS, DND_SESSIONS: SESSIONS, LIVE_RELAY: `127.0.0.1:${RELAY}`, LIVE_WS: `ws://localhost:${RELAY}/` } });
let relay = null;
const startRelay = () => { relay = spawn(process.execPath, [join(ROOT, 'live/relay.js')], { stdio: 'ignore',
    env: { ...process.env, PORT: RELAY, AUTH_URL: `http://127.0.0.1:${WEB}/live/auth.php`, ORIGIN: BASE } }); };
startRelay();
await serving(BASE + '/privacy/'); await serving(`http://127.0.0.1:${RELAY}/health`);

let bad = 0;
const is = (name, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) { bad++; console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); } };
// polls until the page shows what we want, so a pass also says how fast it arrived
async function until(b, expr, want, ms) {
    const t = Date.now();
    let got;
    while (Date.now() - t < ms) { got = await b.ev(expr); if (JSON.stringify(got) === JSON.stringify(want)) return Date.now() - t; await sleep(100); }
    return `not within ${ms} ms (last: ${JSON.stringify(got)})`;
}
const within = (name, took, ms) => { if (typeof took !== 'number') { bad++; console.log(`FAIL ${name}: ${took}`); } else console.log(`ok   ${name}: ${took} ms` + (took > ms ? ' (slow)' : '')); };
const api = (sid, body) => fetch(`${BASE}/campaigns/api.php`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: 'dndsid=' + sid }, body: JSON.stringify(body) }).then((r) => r.status);
const party = `JSON.stringify([...document.querySelectorAll('#cp-head .ch-card b')].map((b) => b.textContent))`;
const dot = (name) => `!document.querySelector('#cp-players .rowi:has(.cp-on)') ? null : [...document.querySelectorAll('#cp-players .rowi')].find((r) => r.textContent.includes(${JSON.stringify(name)}))?.querySelector('.cp-on').hidden === false`;

const dm = await launch('chrome'), pl = await launch('firefox');
try {
    for (const [b, sid] of [[dm, SID.dm], [pl, SID.pl]]) {
        await b.go(BASE + '/privacy/');
        await b.ev(`document.cookie = 'dndsid=${sid}; path=/'`);
        await b.go(`${BASE}/campaigns/${CAMP}`);
    }
    within('DM sees the player online', await until(dm, dot('Pat'), true, 3000), 1000);
    within('player sees the DM online', await until(pl, dot('Dee'), true, 3000), 1000);

    await dm.ev('window.notReloaded = true');
    is('player adds a character', await api(SID.pl, { act: 'characters', id: CAMP, characters: ['lock'] }), 200);
    within("DM's party updates by itself", await until(dm, party, JSON.stringify(['Brannoc', 'Lock']), 3000), 1000);
    is('without reloading the page', await dm.ev('window.notReloaded === true'), true);
    is('dots kept after the update', await dm.ev(dot('Pat')), true);

    await pl.go(BASE + '/privacy/');
    within('player gone offline', await until(dm, dot('Pat'), false, 3000), 1000);
    await pl.go(`${BASE}/campaigns/${CAMP}`);
    within('player back online', await until(dm, dot('Pat'), true, 3000), 1000);

    // the relay stops: the page says so, and changes still arrive from PHP
    relay.kill();
    within('paused shows', await until(dm, `!document.querySelector('#cp-paused').hidden`, true, 3000), 1000);
    is('change saves while paused', await api(SID.pl, { act: 'characters', id: CAMP, characters: [] }), 200);
    within('change arrives by checking every 10 s', await until(dm, party, JSON.stringify(['Brannoc']), 12000), 10500);
    startRelay();
    within('relay back, paused goes away', await until(dm, `document.querySelector('#cp-paused').hidden`, true, 13000), 11000);
    within('online again after the relay is back', await until(dm, dot('Pat'), true, 13000), 11000);

    // the DM removes the player, whose open page leaves the campaign
    is('DM removes the player', await api(SID.dm, { act: 'remove', id: CAMP, member: '222' }), 200);
    within("removed player's page sent away", await until(pl, 'location.pathname + location.search', '/campaigns/', 3000), 1500);
    is('no console errors (DM)', dm.errors.filter((e) => !/WebSocket/.test(e) && !e.includes(RELAY)), []);
    is('no console errors (player)', pl.errors.filter((e) => !/WebSocket/.test(e) && !e.includes(RELAY)), []);
} finally { dm.close(); pl.close(); relay.kill(); web.kill(); rmSync(TMP, { recursive: true, force: true }); }
console.log(bad ? `${bad} check(s) failed` : 'live page ok');
process.exit(bad ? 1 : 0);
