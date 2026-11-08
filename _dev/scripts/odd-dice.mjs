// Dice the 3D roller has no shape for, on both sheets, in headless Chrome and Firefox: 1d2 and 1d3 damage get roll buttons; a 1d2 flips
// the 3D coin and counts heads as 1, tails as 2 (owner's choice); a 1d3 rolls at once without loading the 3D dice; mixed with a d6 it adds up.
//   node _dev/scripts/odd-dice.mjs      (the 3D coin needs internet for three.js and cannon-es from jsDelivr)
// Starts its own server (port 8147 + CHECK_PORT_SHIFT) with stand-in folders in the temp folder; backups and settings sync are blocked.
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { launch, browsers, serving } from './browser.mjs';

const ROOT = join(import.meta.dirname, '../..'), PORT = 8147 + (+process.env.CHECK_PORT_SHIFT || 0), BASE = `http://localhost:${PORT}`;
const PHP = process.env.PHP || (process.platform === 'win32' ? 'C:/php/php.exe' : 'php');
const TMP = join(tmpdir(), 'dnd-odd-dice-check' + (process.env.CHECK_PORT_SHIFT || ''));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
const is = (name, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) { bad++; console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); } };
rmSync(TMP, { recursive: true, force: true });
mkdirSync(join(TMP, 'sessions'), { recursive: true });
const web = spawn(PHP, ['-S', `127.0.0.1:${PORT}`, '-t', ROOT, join(ROOT, '_dev/router.php')], { stdio: 'ignore', env: { ...process.env, DND_ACCOUNTS: join(TMP, 'accounts'), DND_SESSIONS: join(TMP, 'sessions'), DND_BACKUPS: join(TMP, 'backups'), DND_MONSTER_BACKUPS: join(TMP, 'monster-backups') } });
await serving(BASE + '/privacy/');

const ATTACKS = [['Pinch', '1d2', 'Slashing'], ['Nibble', '1d3', 'Piercing'], ['Mixed', '1d2 + 1d6', 'Fire']];
const row = (name, dice, type) => ({ id: 'r' + name, name, time: 'Action', range: '5 ft', props: [], mode: 'hit', hit: '2', save: 'DEX', dc: '10', dmg: [{ dice, type }], fx: [], uses: '', used: 0, reset: '', desc: '' });

try {
    for (const name of browsers) {
        const b = await launch(name);
        try {
            await b.block(/backup\.php|prefs\.php|cloud\.php/); await b.shot(1280, 900); // a laptop window: under 960 px the sheet shows its panels as tabs
            const local = async (k) => JSON.parse(await b.ev(`localStorage.getItem('${k}')`));
            const put = (k, v) => b.ev(`localStorage.setItem('${k}', ${JSON.stringify(JSON.stringify(v))}); 1`);
            const btn = (label) => `[...document.querySelectorAll('.hb-rollbtn')].find((x) => /${label}/i.test(x.title))`;
            const loaded3d = () => b.ev(`performance.getEntriesByType('resource').some((e) => /dice3d\\.js/.test(e.name))`);
            const roll = async (label) => {
                await b.ev(`document.querySelectorAll('.hb-rollcard').forEach((c) => c.remove()); ${btn(label)}.click(); 1`);
                await b.until(`document.querySelector('.hb-rollcard .hb-rolltot')`, 20000);
                return JSON.parse(await b.ev(`JSON.stringify([document.querySelector('.hb-rollcard small').textContent, document.querySelector('.hb-rollcard .hb-rolltot').textContent])`));
            };
            for (const [sheet, key, start, made] of [['player', 'hb-sheet', '/characters/new', (p) => p.split('/').pop()], ['monster', 'monster-sheet', '/sheets/monster/', null]]) {
                const tag = `${name} ${sheet}`;
                await b.go(BASE + '/privacy/');
                await b.ev(`localStorage.clear(); localStorage.setItem('hb-sheet-merged', '1'); 1`);
                await b.go(BASE + start);
                await b.until(`document.querySelector('#hb-sheet .card, #hb-sheet .hb-abil')`, 15000);
                await sleep(300);
                const path = await b.ev('location.pathname');
                await b.ev(`dispatchEvent(new Event('pagehide')); 1`); await sleep(300);
                await b.go(BASE + '/privacy/');
                const db = await local(key), id = made ? made(path) : db.cur || Object.keys(db.chars)[0], c = db.chars[id];
                c.panels.find((p) => p.type === 'attacks').rows = ATTACKS.map((a) => row(...a));
                c.view = { ...c.view, noAnim: false, noSound: true };
                c.updated = (c.updated || 1) + 1;
                await put(key, { ...db, cur: id, chars: { [id]: c } });
                // a 1d3 alone first, on a fresh page: it rolls at once, the 3D dice never load
                await b.go(BASE + (made ? `/characters/${id}` : '/sheets/monster/'));
                // the sheet shows one panel at a time: open Actions
                await b.until(`[...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Actions')`, 15000);
                await b.ev(`[...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Actions').click(); 1`);
                await b.until(`document.querySelectorAll('.hb-rollbtn').length >= 3`, 15000);
                is(`${tag}: 1d2 and 1d3 have roll buttons`, await b.ev(`JSON.stringify([${btn('slashing damage')}?.dataset.g, ${btn('piercing damage')}?.dataset.g, ${btn('fire damage')}?.dataset.g])`).then(JSON.parse), ['2x1', '3x1', '2x1,6x1']);
                const [e3, t3] = await roll('piercing damage');
                is(`${tag}: 1d3 rolls 1 to 3`, [e3, ['1', '2', '3'].includes(t3)], ['1d3', true]);
                is(`${tag}: 1d3 doesn't load the 3D dice`, await loaded3d(), false);
                // a 1d2 flips the 3D coin: heads 1, tails 2
                const seen = new Set();
                for (let i = 0; i < 3; i++) { const [e2, t2] = await roll('slashing damage'); is(`${tag}: 1d2 shows as 1d2`, e2, '1d2'); seen.add(t2); }
                is(`${tag}: 1d2 gives only 1 or 2`, [...seen].every((t) => t === '1' || t === '2'), true);
                is(`${tag}: 1d2 used the 3D coin`, await loaded3d(), true);
                const [em, tm] = await roll('fire damage');
                is(`${tag}: 1d2 + 1d6 adds up to 2 to 8`, [em, +tm >= 2 && +tm <= 8], ['1d2 + 1d6', true]);
                const errs = b.errors.filter((x) => !/backup\.php|prefs\.php|cloud\.php|favicon|gsi|google|ERR_BLOCKED|NS_ERROR|blocked|net::ERR_FAILED/i.test(x));
                is(`${tag}: no page errors`, errs, []);
            }
        } finally { b.close(); }
    }
} finally { web.kill(); }
console.log(bad ? `${bad} failed` : 'odd dice ok');
process.exit(bad ? 1 : 0);
