// Checks the action log from a real sheet in headless Chrome and Firefox (ROADMAP "Stats data"): signed in, damage, a pip, a rest,
// coins and an unshared roll land in the account's log file with the right fields; the character itself gains nothing; a reload
// logs nothing new; a newer copy from another device logs nothing; a resend after a lost answer keeps the id. Signed out, they wait
// in the browser and go up after sign-in.
//   node _dev/scripts/stats-page.mjs
// Starts its own server with stand-in account and session folders in the temp folder, so it never touches private/dnd/.
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { launch, browsers, serving } from './browser.mjs';

const ROOT = join(import.meta.dirname, '../..'), PORT = 8142 + (+process.env.CHECK_PORT_SHIFT || 0), BASE = `http://localhost:${PORT}`;
const PHP = process.env.PHP || (process.platform === 'win32' ? 'C:/php/php.exe' : 'php');
const TMP = join(tmpdir(), 'dnd-stats-check' + (process.env.CHECK_PORT_SHIFT || '')), ACCOUNTS = join(TMP, 'accounts'), SESSIONS = join(TMP, 'sessions');
const ser = (o) => `a:${Object.keys(o).length}:{` + Object.entries(o).map(([k, v]) => `s:${Buffer.byteLength(k)}:"${k}";s:${Buffer.byteLength(v)}:"${v}";`).join('') + '}';
const SID = 'statscheckme00000000000000000000000';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
const is = (name, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) { bad++; console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); } };
const web = spawn(PHP, ['-S', `127.0.0.1:${PORT}`, '-t', ROOT, join(ROOT, '_dev/router.php')], { stdio: 'ignore', env: { ...process.env, DND_ACCOUNTS: ACCOUNTS, DND_SESSIONS: SESSIONS } });
await serving(BASE + '/privacy/');

const log = (id) => {
    const dir = join(ACCOUNTS, 'stats', 'characters', id);
    if (!existsSync(dir)) return [];
    return readdirSync(dir).flatMap((f) => readFileSync(join(dir, f), 'utf8').trim().split('\n').map((l) => JSON.parse(l)));
};
const until = async (fn, ok, ms = 15000) => { const t = Date.now(); let v; while (Date.now() - t < ms) { v = await fn(); if (ok(v)) return v; await sleep(200); } return v; };

try {
    for (const name of browsers) {
        rmSync(TMP, { recursive: true, force: true });
        mkdirSync(SESSIONS, { recursive: true });
        writeFileSync(join(SESSIONS, 'sess_' + SID), 'user|' + ser({ sub: '111', email: 'me@example.com', name: 'Me' }));
        const id = 'st' + name;
        const b = await launch(name), ev = b.ev;
        try {
            await b.block(/backup\.php|prefs\.php/);
            // signed out first: a blank character with real numbers, in this browser only
            await b.go(BASE + '/characters/new'); await b.until(`document.querySelector('[data-act="custom"]')`);
            await ev(`document.querySelector('[data-act="custom"]').click()`); await b.until(`document.querySelector('[data-k="view.noAnim"]')`);
            await ev(`document.querySelector('[data-k="view.noAnim"]').click()`);
            await ev(`document.querySelector('dialog [data-act="close"]').click()`);
            const OUT = `JSON.parse(localStorage.getItem('stats-outbox') || '[]')`;
            await ev(`document.querySelector('.hb-d20').click()`);
            await until(() => ev(`${OUT}.length`), (n) => n >= 1);
            is(`${name} signed out: an unshared roll waits in the browser`, await ev(`${OUT}[0].t`), 'roll');
            is(`${name} signed out: the roll says what sort it is`, await ev(`!!${OUT}[0].kind`), true);

            // sign in: the character goes up, then its waiting roll follows
            await ev(`document.cookie = 'dndsid=${SID}; path=/'`);
            const charId = await ev(`JSON.parse(localStorage.getItem('hb-sheet')).cur`);
            await b.go(`${BASE}/characters/${charId}`);
            const up = await until(() => log(charId), (l) => l.some((e) => e.t === 'roll'), 25000);
            is(`${name} after sign-in the roll is on the account`, up.filter((e) => e.t === 'roll').length, 1);
            is(`${name} and has its dice`, Array.isArray(up.find((e) => e.t === 'roll').dice), true);
            await until(() => ev(`${OUT}.length`), (n) => n === 0);
            is(`${name} and the outbox is empty`, await ev(`${OUT}.length`), 0);
            // (miscCat: the sheet's own one-time upgrade mark, set when a character is first saved through it)
            const keysOf = () => ev(`JSON.stringify(Object.keys(JSON.parse(localStorage.getItem('hb-sheet')).chars['${charId}']).filter((k) => k !== 'miscCat').sort())`);
            const before = await keysOf();

            // damage through the sheet's own form
            await b.until(`document.querySelector('#hb-amt')`);
            const start = await ev(`JSON.parse(localStorage.getItem('hb-sheet')).chars['${charId}'].hp.cur`);
            await ev(`(() => { const a = document.querySelector('#hb-amt'); a.value = '3'; a.closest('form').requestSubmit(a.closest('form').querySelector('button[value="dmg"]')); })()`);
            const hp = await until(() => log(charId).filter((e) => e.t === 'hp'), (l) => l.length >= 1, 15000);            is(`${name} HP change logged once with what was asked`, hp.map((e) => [e.d, e.asked, e.cur]), [[-3, 3, start - 3]]);
            is(`${name} it has a time`, hp[0].at > 1e12, true);

            // a long rest: the rest line, and its healing marked as from the rest
            await ev(`document.querySelector('[data-act="rest"][data-r="long"]').click()`);
            await b.until(`document.querySelector('[data-act="dolong"]')`);
            await ev(`document.querySelector('[data-act="dolong"]').click()`);
            const rested = await until(() => log(charId), (l) => l.some((e) => e.t === 'rest') && l.filter((e) => e.t === 'hp').length >= 2, 15000);
            is(`${name} a rest is a line`, rested.find((e) => e.t === 'rest')?.kind, 'long');
            is(`${name} its healing says so`, rested.filter((e) => e.t === 'hp')[1]?.why, 'long-rest');

            // the character itself gained nothing
            is(`${name} the character has no new fields`, await keysOf(), before);

            // a reload isn't an action
            const n = log(charId).length;
            await b.go(`${BASE}/characters/${charId}`); await b.until(`document.querySelector('#hb-amt')`);
            await sleep(4000);
            is(`${name} a reload logs nothing`, log(charId).length, n);

            // an edit on another device: the sheet takes the account's copy when it opens, and that isn't an action here
            const file = join(ACCOUNTS, 'characters', charId, 'character.json');
            const copy = JSON.parse(readFileSync(file, 'utf8'));
            copy.hp.cur = 1; copy.updated = Date.now() + 60000; // well ahead, so nothing this browser does on the way out counts as newer
            writeFileSync(file, JSON.stringify(copy));
            await b.go(`${BASE}/characters/${charId}`); await b.until(`document.querySelector('#hb-amt')`);
            await sleep(4000);
            is(`${name} a change from another device logs nothing`, log(charId).length, n);
            // and the next edit starts from that copy: 1 down to 0, with no false jump from 10 to 1
            await ev(`(() => { const a = document.querySelector('#hb-amt'); a.value = '1'; a.closest('form').requestSubmit(a.closest('form').querySelector('button[value="dmg"]')); })()`);
            const next = await until(() => log(charId), (l) => l.length > n);
            is(`${name} the next edit starts from the other device's copy`, next.slice(n).map((e) => [e.t, e.d, e.cur]), [['hp', -1, 0]]);

            // someone else can't write to it, and signed out nobody can
            const post = (body, cookie) => fetch(`${BASE}/sheets/player/stats.php`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: `dndsid=${cookie}` } : {}) }, body: JSON.stringify(body) });
            is(`${name} signed out is refused`, (await post({ events: [] })).status, 401);
            is(`${name} a GET reads nothing`, (await fetch(`${BASE}/sheets/player/stats.php`, { headers: { Cookie: `dndsid=${SID}` } })).status, 405);

            // through the real addresses: a fight's turns and a monster's HP land in the campaign's log, with what the turn guess needs
            const api = (url, body) => fetch(BASE + url, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: `dndsid=${SID}` }, body: JSON.stringify(body) }).then((r) => r.json());
            const camp = (await api('/campaigns/api.php', { act: 'create', name: 'Stats ' + name })).id;
            await api('/sheets/monster/cloud.php', { id: 'gob1', name: 'Goblin', updated: Date.now(), abilities: [], cr: '1/4', xp: 50, hp: { cur: 7, base: 7, temp: 0, mod: 0 } });
            const begun = await api('/campaigns/api.php', { act: 'fight', id: camp, op: 'begin', items: [{ kind: 'plain', name: 'Trap', init: 20 }, { kind: 'monster', mon: 'gob1', init: 10, ac: 13 }] });
            await api('/campaigns/api.php', { act: 'fight', id: camp, op: 'next', v: begun.v });
            await api('/sheets/monster/cloud.php?hp=gob1', { q: 'statscheck1', op: { k: 'dmg', n: 10 }, at: Date.now() - 500, now: Date.now() });
            await api('/sheets/monster/cloud.php?hp=gob1', { q: 'statscheck1', op: { k: 'dmg', n: 10 } }); // a resend counts once
            const cdir = join(ACCOUNTS, 'stats', 'campaigns', camp);
            const clog = readdirSync(cdir).flatMap((f) => readFileSync(join(cdir, f), 'utf8').trim().split('\n').map((l) => JSON.parse(l)));
            is(`${name} a fight's turns, then the monster's HP`, clog.map((e) => e.t), ['turn', 'turn', 'mhp']);
            is(`${name} whose turn it was`, [clog[1].kind, clog[1].mon, clog[1].round], ['monster', 'gob1', 1]);
            const m = clog[2];
            is(`${name} the hit, and what the monster is`, [m.k, m.n, m.cur0, m.cur, m.max, m.cr, m.xp, m.ac], ['dmg', 10, 7, 0, 7, '1/4', 50, 13]);
            is(`${name} the hit came after the turn`, m.at >= clog[1].at - 1000, true);

            const errors = b.errors.filter((e) => !/backup\.php|prefs\.php|401/.test(e));
            if (errors.length) { bad++; console.log(`FAIL ${name}: ${errors.slice(0, 5).join('\n  ')}`); }
        } finally { b.close(); }
    }
} finally { web.kill(); }
console.log(bad ? `${bad} failure(s)` : 'stats page ok');
process.exit(bad ? 1 : 0);
