// Dice Sets presets follow the account (`dice-presets`, through sync.js and prefs.php), in headless Chrome and Firefox: signed out a preset
// stays in the browser; signed in it reaches the account, a new browser gets it, and the newest change wins, a delete included.
//   node _dev/scripts/dice-presets.mjs      (needs includes/config.php for sign-in)
// Starts its own server (port 8146 + CHECK_PORT_SHIFT) with stand-in account and session folders in the temp folder.
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { launch, browsers, serving } from './browser.mjs';

const ROOT = join(import.meta.dirname, '../..'), PORT = 8146 + (+process.env.CHECK_PORT_SHIFT || 0), BASE = `http://localhost:${PORT}`;
const PHP = process.env.PHP || (process.platform === 'win32' ? 'C:/php/php.exe' : 'php');
const TMP = join(tmpdir(), 'dnd-presets-check' + (process.env.CHECK_PORT_SHIFT || '')), ACCOUNTS = join(TMP, 'accounts'), SESSIONS = join(TMP, 'sessions');
const SID = 'presetscheck00000000000000000000000';
const ser = (o) => `a:${Object.keys(o).length}:{` + Object.entries(o).map(([k, v]) => `s:${Buffer.byteLength(k)}:"${k}";s:${Buffer.byteLength(v)}:"${v}";`).join('') + '}';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
const is = (name, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) { bad++; console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); } };

const web = spawn(PHP, ['-S', `127.0.0.1:${PORT}`, '-t', ROOT, join(ROOT, '_dev/router.php')], { stdio: 'ignore', env: { ...process.env, DND_ACCOUNTS: ACCOUNTS, DND_SESSIONS: SESSIONS, DND_BACKUPS: join(TMP, 'backups'), DND_MONSTER_BACKUPS: join(TMP, 'monster-backups') } });
await serving(BASE + '/privacy/');

const account = () => { try { return JSON.parse(JSON.parse(readFileSync(join(ACCOUNTS, 'prefs', '111.json'), 'utf8'))['dice-presets'].value).map((p) => p.name); } catch { return null; } };
const untilAccount = async (want) => { for (const t = Date.now(); Date.now() - t < 10000;) { if (JSON.stringify(account()) === JSON.stringify(want)) break; await sleep(200); } return account(); };
const shown = (b) => b.ev(`JSON.stringify([...document.querySelectorAll('#dd-presets [data-preset] b')].map((x) => x.textContent))`).then(JSON.parse);
const untilShown = async (b, want) => { for (const t = Date.now(); Date.now() - t < 15000;) { try { if (JSON.stringify(await shown(b)) === JSON.stringify(want)) break; } catch (e) { /* the one reload after a pull */ } await sleep(200); } return shown(b); };
// a browser with empty storage, signed in or out, on the Dice Sets page
const start = async (name, signedIn) => {
    const b = await launch(name);
    await b.go(BASE + '/privacy/');
    await b.ev(`localStorage.clear(); sessionStorage.clear(); ${signedIn ? `document.cookie = 'dndsid=${SID}; path=/'` : ''}`);
    await b.go(BASE + '/dice/');
    await b.until(`document.querySelector('#dd-pform') && document.querySelector('#dd-presets p, #dd-presets [data-preset]')`, 15000);
    return b;
};
const save = (b, n) => b.ev(`(() => { document.querySelector('#dd-pname').value = ${JSON.stringify(n)}; document.querySelector('#dd-pform').requestSubmit(); })()`);

try {
    for (const name of browsers) {
        rmSync(TMP, { recursive: true, force: true });
        mkdirSync(SESSIONS, { recursive: true });
        writeFileSync(join(SESSIONS, 'sess_' + SID), 'user|' + ser({ sub: '111', email: 'me@example.com', name: 'Me' }));

        const out = await start(name, false);
        try {
            await save(out, 'Offline');
            is(`${name} signed out: saved`, await untilShown(out, ['Offline']), ['Offline']);
            await out.go(BASE + '/dice/');
            is(`${name} signed out: survives a reload`, await untilShown(out, ['Offline']), ['Offline']);
            is(`${name} signed out: nothing in an account`, account(), null);
        } finally { out.close(); }

        const A = await start(name, true);
        try {
            await save(A, 'Fire');
            is(`${name} reaches the account`, await untilAccount(['Fire']), ['Fire']);
            const B = await start(name, true);
            try {
                is(`${name} a new browser gets it`, await untilShown(B, ['Fire']), ['Fire']);
                await save(B, 'Ice');
                is(`${name} the second browser's change reaches the account`, await untilAccount(['Fire', 'Ice']), ['Fire', 'Ice']);
                await sleep(1100); // stamps are in ms, but keep the two changes clearly apart
                await A.go(BASE + '/dice/');
                is(`${name} newest wins: the first browser gets it`, await untilShown(A, ['Fire', 'Ice']), ['Fire', 'Ice']);
                await sleep(1100);
                await A.ev(`window.confirm = () => true; document.querySelector('[data-pdel="0"]').click()`);
                is(`${name} a delete reaches the account`, await untilAccount(['Ice']), ['Ice']);
                await B.go(BASE + '/dice/');
                // sync.js restarts a page once per visit, and B has had its restart: the pull lands in storage and shows from the next page load
                await B.until(`JSON.parse(localStorage.getItem('dice-presets')).length === 1`, 10000);
                await B.go(BASE + '/dice/');
                is(`${name} a delete reaches the other browser`, await untilShown(B, ['Ice']), ['Ice']);
                await sleep(500);
                // sync.js's restart can interrupt the page's import of sounds.js, which Firefox logs; the restarted page loads it
                is(`${name} no page errors`, [...A.errors, ...B.errors].filter((e) => !/backup\.php|cloud\.php|error loading dynamically imported module/.test(e)), []);
            } finally { B.close(); }
        } finally { A.close(); }
    }
} finally { web.kill(); }
console.log(bad ? `${bad} failed` : 'dice presets ok');
process.exit(bad ? 1 : 0);
