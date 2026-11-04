// Checks Send to initiative (ROADMAP 3.3) in headless Chrome and Firefox, with the real relay: from a Monster Sheet encounter with no
// fight running it fills the displayed map's Combat Encounter and opens the map; with no map displayed the map page asks which;
// the copies have their own HP, so the prepared monsters stay untouched; "Goblin 1" and "Goblin 2" keep their names and roll
// separately, also "Hag A" and "Hag B", while two monsters both called "Orc" get letters and share a roll; players and the Spectator
// see nothing new; during a fight the sheet still offers Add whole encounter.
//   node _dev/scripts/send-initiative.mjs        (needs: cd live && npm install, and includes/config.php for sign-in)
// Uses stand-in account and session folders in the temp folder, never private/dnd/accounts or private/sessions.
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn, execFileSync } from 'node:child_process';
import { launch, browsers, serving } from './browser.mjs';

const SHIFT = +process.env.CHECK_PORT_SHIFT || 0, ROOT = join(import.meta.dirname, '../..'), WEB = 8145 + SHIFT, RELAY = 8105 + SHIFT, BASE = `http://localhost:${WEB}`;
const PHP = process.env.PHP || (process.platform === 'win32' ? 'C:/php/php.exe' : 'php');
const TMP = join(tmpdir(), 'dnd-send-check' + (process.env.CHECK_PORT_SHIFT || '')), ACCOUNTS = join(TMP, 'accounts'), SESSIONS = join(TMP, 'sessions');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ser = (o) => `a:${Object.keys(o).length}:{` + Object.entries(o).map(([k, v]) => `s:${Buffer.byteLength(k)}:"${k}";s:${Buffer.byteLength(v)}:"${v}";`).join('') + '}';
const SID = { dm: 'sendcheckdm0000000000000000000000x', pat: 'sendcheckpat000000000000000000000x' };
const CAMP = 'aaa000000001', DMDIR = join(ACCOUNTS, 'monsters', '111'), CDIR = join(ACCOUNTS, 'campaigns', CAMP);
const ABIL = (dex) => [['STR', 10], ['DEX', dex], ['CON', 10], ['INT', 10], ['WIS', 10], ['CHA', 10]].map(([key, score]) => ({ key, name: key, score, save: false, sb: '' }));
const MONS = { g1: ['Goblin 1', 14], g2: ['Goblin 2', 14], h1: ['Hag A', 10], h2: ['Hag B', 10], o1: ['Orc', 12], o2: ['Orc', 12] };
const mon = (id, name, dex) => ({ id, name, race: 'Small humanoid (goblinoid)', updated: 5, cr: '1', enc: 'e1', abilities: ABIL(dex), ac: '15', init: 'DEX', hp: { cur: 7, base: 7, temp: 0, mod: 0 } });
const SHEET = { cur: 'g1', chars: Object.fromEntries(Object.entries(MONS).map(([id, [n, d]]) => [id, mon(id, n, d)])), encs: [{ id: 'e1', name: 'Cave', archived: 0 }] };

let bad = 0;
const is = (name, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) { bad++; console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); } };

const GD = process.platform === 'win32' ? ['-d', 'extension=gd'] : []; // GD is in the site's image; a local Windows PHP may have it only as a DLL
const web = spawn(PHP, [...GD, '-S', `127.0.0.1:${WEB}`, '-t', ROOT, join(ROOT, '_dev/router.php')], { stdio: 'ignore',
    env: { ...process.env, DND_ACCOUNTS: ACCOUNTS, DND_SESSIONS: SESSIONS, LIVE_RELAY: `127.0.0.1:${RELAY}`, LIVE_WS: `ws://localhost:${RELAY}/` } });
const relay = spawn(process.execPath, [join(ROOT, 'live/relay.js')], { stdio: 'ignore', env: { ...process.env, PORT: RELAY, AUTH_URL: `http://127.0.0.1:${WEB}/live/auth.php`, ORIGIN: BASE } });

const headers = (sid) => ({ Cookie: 'dndsid=' + sid, 'Content-Type': 'application/json' });
const mapsApi = (sid, body) => fetch(`${BASE}/campaigns/maps.php`, { method: 'POST', headers: headers(sid), body: JSON.stringify({ c: CAMP, ...body }) }).then(async (r) => ({ status: r.status, ...(await r.json().catch(() => ({}))) }));
const view = (sid) => fetch(`${BASE}/campaigns/maps.php?c=${CAMP}`, { headers: headers(sid) }).then((r) => r.json());
const fightApi = (body) => fetch(`${BASE}/campaigns/api.php`, { method: 'POST', headers: headers(SID.dm), body: JSON.stringify({ act: 'fight', id: CAMP, ...body }) }).then((r) => r.json());
function reset() {
    rmSync(TMP, { recursive: true, force: true });
    mkdirSync(SESSIONS, { recursive: true });
    for (const [who, sub, name] of [['dm', '111', 'Dee'], ['pat', '222', 'Pat']]) writeFileSync(join(SESSIONS, 'sess_' + SID[who]), 'user|' + ser({ sub, email: `${who}@example.com`, name }));
    mkdirSync(DMDIR, { recursive: true });
    for (const c of Object.values(SHEET.chars)) writeFileSync(join(DMDIR, c.id + '.json'), JSON.stringify(c));
    mkdirSync(CDIR, { recursive: true });
    writeFileSync(join(CDIR, 'campaign.json'), JSON.stringify({ id: CAMP, name: 'Send Test', dm: '111', code: 'aaaaaaaaaa', created: 1, members: [{ sub: '111', name: 'Dee', joined: 1, characters: [] }, { sub: '222', name: 'Pat', joined: 2, characters: [] }] }));
}
const PNG = execFileSync(PHP, [...GD, '-r', 'imagepng(imagecreatetruecolor(400, 300));']);
async function newMap(name) {
    const up = 'send' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const part = await fetch(`${BASE}/campaigns/maps.php?c=${CAMP}&up=${up}&i=0`, { method: 'POST', headers: { Cookie: 'dndsid=' + SID.dm, 'Content-Type': 'application/octet-stream' }, body: PNG });
    if (!part.ok) throw new Error('upload part: ' + part.status);
    return (await mapsApi(SID.dm, { op: 'upload', up, name })).map;
}
const click = (b, sel) => b.ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (e) e.click(); return !!e; })()`);
const js = (b, expr) => b.ev(`JSON.stringify(${expr})`).then((x) => JSON.parse(x));
const encRows = (b) => js(b, `[...document.querySelectorAll('.mpt-crow .mpt-rname')].map((x) => x.textContent)`);
const sheet = async (b) => {
    await b.go(BASE + '/privacy/');
    await b.ev(`localStorage.clear(); localStorage.setItem('monster-sheet', ${JSON.stringify(JSON.stringify(SHEET))}); document.cookie = 'dndsid=${SID.dm}; path=/'; true`);
    await b.go(BASE + '/sheets/monster/');
};

await (async () => { reset(); await serving(BASE + '/privacy/'); await serving(`http://127.0.0.1:${RELAY}/health`); })();

try {
    for (const name of browsers) {
        const b = await launch(name);
        await b.block(/backup\.php|prefs\.php/);
        try {
            reset();
            const before = readFileSync(join(DMDIR, 'g1.json'), 'utf8');

            // no map at all displayed: the page asks, and cancelling sends nothing
            const m1 = await newMap('Cave map'), m2 = await newMap('Road map');
            is(`${name}: test maps made`, !!m1 && !!m2, true);
            await sheet(b);
            await b.until(`document.querySelector('[data-act=encsend]')`);
            is(`${name}: button named`, await b.ev(`document.querySelector('[data-act=encsend]').textContent`), 'Send to initiative');
            is(`${name}: no Add whole encounter without a fight`, await b.ev(`!!document.querySelector('[data-act=fightadd]')`), false);
            await click(b, '[data-act=encsend]');
            await b.until(`location.pathname.endsWith('/map') && document.querySelector('.mpt-dlg h2')?.textContent === 'Pick a map for this encounter'`);
            is(`${name}: address cleaned`, await b.ev(`location.search`), '');
            await b.ev(`document.querySelector('.mpt-dlg').close(); true`);
            await b.until(`document.querySelector('.toasts')?.textContent.includes('Nothing was sent')`);
            is(`${name}: cancel sends nothing`, (await view(SID.dm)).maps.length, 2);

            // none displayed, pick one: it fills that map and doesn't put it on the table
            await sheet(b);
            await b.until(`document.querySelector('[data-act=encsend]')`);
            await click(b, '[data-act=encsend]');
            await b.until(`document.querySelector('.mpt-dlg [data-m=open][data-v="${m2}"]')`);
            await b.ev(`document.querySelector('.mpt-dlg [data-m=open][data-v="${m2}"]').click(); true`);
            await b.until(`document.querySelectorAll('.mpt-crow').length`);
            is(`${name}: picked map filled`, ((await fetch(`${BASE}/campaigns/maps.php?c=${CAMP}&m=${m2}`, { headers: headers(SID.dm) }).then((r) => r.json())).map.enc.ids).length, 6);
            is(`${name}: picking doesn't display it`, (await view(SID.dm)).active, null);

            // displayed: fills that one straight away, with the panel open and no dialog
            await mapsApi(SID.dm, { m: m1, op: 'activate' });
            await sheet(b);
            await b.until(`document.querySelector('[data-act=encsend]')`);
            await click(b, '[data-act=encsend]');
            await b.until(`location.pathname.endsWith('/map') && document.querySelectorAll('.mpt-crow').length`);
            is(`${name}: no dialog with a map displayed`, await b.ev(`!!document.querySelector('dialog[open]')`), false);
            is(`${name}: map is the displayed one`, await b.ev(`window.BM.state.m.id`), m1);
            is(`${name}: panel open`, await b.ev(`!document.querySelector('[data-mp=side]').hidden`), true);
            const toks = await js(b, `window.BM.state.m.tokens.filter((t) => t.kind === 'monster').map((t) => t.name).sort()`);
            is(`${name}: names kept, letters only on the two alike`, toks, ['Goblin 1', 'Goblin 2', 'Hag A', 'Hag B', 'Orc A', 'Orc B']);
            is(`${name}: all copies, none placed`, await b.ev(`window.BM.state.m.tokens.filter((t) => t.kind === 'monster').every((t) => t.copy && !t.placed)`), true);
            is(`${name}: rows`, (await encRows(b)).sort(), ['Goblin 1', 'Goblin 2', 'Hag A', 'Hag B', 'Orcx2']);
            is(`${name}: reload doesn't send twice`, await (async () => { await b.go(`${BASE}/campaigns/${CAMP}/map`); await b.until(`window.BM?.state.m`); return (await view(SID.dm)).map.enc.ids.length; })(), 6);

            // players and the Spectator see nothing new
            const nothing = (v) => !!v.map && !JSON.stringify(v).match(/Goblin|Hag|Orc/);
            is(`${name}: player sees nothing`, nothing(await view(SID.pat)), true);
            is(`${name}: spectator sees nothing`, nothing(await fetch(`${BASE}/campaigns/maps.php?c=${CAMP}&as=table`, { headers: headers(SID.dm) }).then((r) => r.json())), true);
            is(`${name}: player can't send`, (await mapsApi(SID.pat, { m: m1, op: 'send', mons: [{ mon: 'g1' }] })).status, 403);

            // Start combat: each named kind rolls on its own, the two of a kind share one roll. Rolls forced apart so a chance match can't pass or fail it
            await b.ev(`(() => { let n = 0; Math.random = () => (n++ % 20) / 20; return true; })()`);
            await click(b, '[data-mpa=side]');
            await b.until(`document.querySelector('[data-mpa=start]')`);
            await click(b, '[data-mpa=start]');
            await b.until(`document.querySelectorAll('.mpt-orow').length === 6`);
            const f = (await fetch(`${BASE}/campaigns/fight.php?c=${CAMP}`, { headers: headers(SID.dm) }).then((r) => r.json())).fight;
            const init = Object.fromEntries(f.entries.map((e) => [e.name, e.init]));
            is(`${name}: fight names`, Object.keys(init).sort(), ['Goblin 1', 'Goblin 2', 'Hag A', 'Hag B', 'Orc A', 'Orc B']);
            is(`${name}: Goblin 1 and 2 roll separately`, init['Goblin 1'] !== init['Goblin 2'], true);
            is(`${name}: Hag A and B roll separately`, init['Hag A'] !== init['Hag B'], true);
            is(`${name}: Orc A and B share a roll`, init['Orc A'], init['Orc B']);

            // a copy's HP is its own; the prepared monster's file is exactly as it was
            const e1 = f.entries.find((e) => e.name === 'Goblin 1');
            await fightApi({ op: 'copyhp', copy: e1.copy, hop: { k: 'dmg', n: 5 } });
            is(`${name}: copy took the damage`, (await fetch(`${BASE}/campaigns/fight.php?c=${CAMP}`, { headers: headers(SID.dm) }).then((r) => r.json())).fight.entries.find((e) => e.name === 'Goblin 1').hp.cur, 2);
            is(`${name}: prepared monster untouched`, JSON.parse(readFileSync(join(DMDIR, 'g1.json'), 'utf8')).hp, JSON.parse(before).hp);

            // a fight is running: the server refuses, and the sheet keeps today's button
            is(`${name}: send refused during a fight`, (await mapsApi(SID.dm, { m: m1, op: 'send', mons: [{ mon: 'g1' }] })).status, 409);
            await sheet(b);
            await b.until(`document.querySelector('[data-act=fightadd]')`);
            is(`${name}: during a fight, Add whole encounter`, await b.ev(`[...document.querySelectorAll('[data-act=fightadd]')].some((x) => x.textContent === 'Add whole encounter to fight') && !document.querySelector('[data-act=encsend]')`), true);
            const errs = b.errors.filter((e) => !/backup\.php|prefs\.php|WebSocket|ws:\/\/|ERR_CONNECTION|Failed to load resource|NetworkError/.test(e));
            is(`${name}: no console errors`, errs, []);
        } finally { b.close(); }
    }
} finally { relay.kill(); web.kill(); rmSync(TMP, { recursive: true, force: true }); }
console.log(bad ? `${bad} check(s) failed` : 'send initiative ok');
process.exit(bad ? 1 : 0);
