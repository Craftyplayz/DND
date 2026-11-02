// Checks portraits moving into the account (ROADMAP 0.4) in headless Chrome and Firefox: signed in, a character's inline art
// is uploaded and swapped for its address only once the server has it; the portrait shows on the sheet, on My Characters and
// on a new browser; export puts the picture back inside the file; a failed upload keeps the inline art; signed out nothing
// moves; and only the owner (or the party, or anyone for a public character) can fetch the picture.
//   node _dev/scripts/art-sync.mjs        (needs includes/config.php for sign-in)
// Starts its own server on port 8119 with stand-in account and session folders in the temp folder, so it never touches
// private/dnd/accounts or private/sessions. Backups and settings sync are blocked, so nothing else is written.
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { launch } from './browser.mjs';

const ROOT = join(import.meta.dirname, '../..'), PORT = 8119 + (+process.env.CHECK_PORT_SHIFT || 0), BASE = `http://localhost:${PORT}`;
const PHP = process.env.PHP || (process.platform === 'win32' ? 'C:/php/php.exe' : 'php');
const TMP = join(tmpdir(), 'dnd-art-check' + (process.env.CHECK_PORT_SHIFT || '')), ACCOUNTS = join(TMP, 'accounts'), SESSIONS = join(TMP, 'sessions');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ser = (o) => `a:${Object.keys(o).length}:{` + Object.entries(o).map(([k, v]) => `s:${Buffer.byteLength(k)}:"${k}";s:${Buffer.byteLength(v)}:"${v}";`).join('') + '}';
const SID = { me: 'artcheckme000000000000000000000000', other: 'artcheckother0000000000000000000000' };

let bad = 0;
const is = (name, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) { bad++; console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); } };
const web = spawn(PHP, ['-S', `127.0.0.1:${PORT}`, '-t', ROOT, join(ROOT, '_dev/router.php')], { stdio: 'ignore', env: { ...process.env, DND_ACCOUNTS: ACCOUNTS, DND_SESSIONS: SESSIONS } });
await sleep(800);

// a character with a small inline JPEG drawn in the page, as the sheet's crop would make it
const MAKE = (id) => `(() => { const c = document.createElement('canvas'); c.width = c.height = 48; const g = c.getContext('2d');
    g.fillStyle = '#c33'; g.fillRect(0, 0, 48, 48); g.fillStyle = '#fff'; g.fillRect(12, 12, 24, 24);
    const ch = { id: '${id}', updated: 100, name: 'Pic ${id}', race: 'Elf', art: c.toDataURL('image/jpeg', 0.9), classes: [{ name: 'Bard', level: 2, die: 8, hdUsed: 0 }], abilities: [] };
    localStorage.clear(); localStorage.setItem('hb-sheet-merged', '1');
    localStorage.setItem('hb-sheet', JSON.stringify({ cur: '${id}', chars: { '${id}': ch } }));
    return ch.art; })()`;
const stored = (b, id) => b.ev(`JSON.stringify((({ art, artUrl }) => ({ art: art.slice(0, 15), artUrl: artUrl || '' }))(JSON.parse(localStorage.getItem('hb-sheet')).chars['${id}']))`).then(JSON.parse);
const until = async (fn, ok, ms) => { const t = Date.now(); let v; while (Date.now() - t < ms) { v = await fn(); if (ok(v)) return v; await sleep(250); } return v; };
const shown = (b, sel) => until(() => b.ev(`(() => { const i = document.querySelector('${sel}'); return i && i.complete ? i.naturalWidth : 0; })()`), (w) => w > 0, 5000);

try {
    for (const name of ['chrome', 'firefox']) {
        rmSync(TMP, { recursive: true, force: true });
        mkdirSync(SESSIONS, { recursive: true });
        writeFileSync(join(SESSIONS, 'sess_' + SID.me), 'user|' + ser({ sub: '111', email: 'me@example.com', name: 'Me' }));
        writeFileSync(join(SESSIONS, 'sess_' + SID.other), 'user|' + ser({ sub: '222', email: 'o@example.com', name: 'Other' }));
        const id = 'art' + name;

        // signed in: the art goes up, then the character keeps only its address
        let b = await launch(name);
        try {
            await b.block(/backup\.php|prefs\.php/);
            await b.go(BASE + '/privacy/');
            await b.ev(`document.cookie = 'dndsid=${SID.me}; path=/'`);
            const data = await b.ev(MAKE(id));
            await b.go(`${BASE}/characters/${id}`);
            const after = await until(() => stored(b, id), (s) => s.artUrl, 12000);
            is(`${name} inline art swapped for its address`, [after.art, /^\/sheets\/player\/art\.php\?id=\w+&v=[a-f0-9]{12}$/.test(after.artUrl)], ['', true]);
            const file = join(ACCOUNTS, 'characters', id, 'art.jpg');
            is(`${name} the server has exactly that picture`, existsSync(file) && readFileSync(file).equals(Buffer.from(data.split(',')[1], 'base64')), true);
            await sleep(1500); // the swapped character reaches the account too
            is(`${name} the account's character has the address`, JSON.parse(readFileSync(join(ACCOUNTS, 'characters', id, 'character.json'), 'utf8')).artUrl, after.artUrl);
            await b.go(`${BASE}/characters/${id}`);
            is(`${name} portrait shows on the sheet`, await shown(b, '.hb-art img') > 0, true);

            // export puts the picture back inside the file
            // the file the sheet would download is caught here, and the download link itself does nothing
            await b.ev(`window.got = null; HTMLAnchorElement.prototype.click = () => {}; URL.createObjectURL = (blob) => { blob.text().then((t) => { window.got = t; }); return 'about:blank'; }; document.querySelector('[data-act=export]').click()`);
            const file2 = JSON.parse(await until(() => b.ev('window.got'), Boolean, 5000) || '{}');
            is(`${name} export carries the picture`, [String(file2.art).startsWith('data:image/jpeg;base64,'), file2.artUrl], [true, '']);
            is(`${name} no console errors`, b.errors.filter((e) => !/backup\.php|prefs\.php/.test(e)), []);
        } finally { b.close(); }

        // a new browser: the character comes down from the account with its portrait
        b = await launch(name);
        try {
            await b.block(/backup\.php|prefs\.php/);
            await b.go(BASE + '/privacy/');
            await b.ev(`localStorage.clear(); localStorage.setItem('hb-sheet-merged', '1'); document.cookie = 'dndsid=${SID.me}; path=/'`);
            await b.go(BASE + '/characters/');
            is(`${name} new browser: portrait on My Characters`, await shown(b, '.ch-card img') > 0, true);
            await b.go(`${BASE}/characters/${id}`);
            is(`${name} new browser: portrait on the sheet`, await shown(b, '.hb-art img') > 0, true);
        } finally { b.close(); }

        // signed out: nothing moves; a failed upload keeps the inline art
        b = await launch(name);
        try {
            await b.block(/backup\.php|prefs\.php|art\.php/);
            await b.go(BASE + '/privacy/');
            await b.ev(MAKE(id + 'out'));
            await b.go(`${BASE}/characters/${id}out`); await sleep(3000);
            is(`${name} signed out: art stays inline`, await stored(b, id + 'out'), { art: 'data:image/jpeg', artUrl: '' });
            await b.ev(`document.cookie = 'dndsid=${SID.me}; path=/'`);
            await b.go(`${BASE}/characters/${id}out`); await sleep(4000);
            is(`${name} upload fails: art stays inline`, await stored(b, id + 'out'), { art: 'data:image/jpeg', artUrl: '' });
            is(`${name} still shows`, await shown(b, '.hb-art img') > 0, true);
        } finally { b.close(); }

        // who may fetch the picture
        const url = BASE + JSON.parse(readFileSync(join(ACCOUNTS, 'characters', id, 'character.json'), 'utf8')).artUrl;
        const get = (sid) => fetch(url, { headers: sid ? { Cookie: 'dndsid=' + sid } : {} }).then((r) => r.status);
        is(`${name} owner can fetch`, await get(SID.me), 200);
        is(`${name} another player can't`, await get(SID.other), 404);
        is(`${name} signed out can't`, await get(null), 404);
        const meta = join(ACCOUNTS, 'characters', id, 'meta.json');
        writeFileSync(meta, JSON.stringify({ ...JSON.parse(readFileSync(meta, 'utf8')), visibility: 'public' }));
        is(`${name} public: anyone can`, await get(null), 200);
    }
} finally { web.kill(); rmSync(TMP, { recursive: true, force: true }); }
console.log(bad ? `${bad} check(s) failed` : 'art sync ok');
process.exit(bad ? 1 : 0);
