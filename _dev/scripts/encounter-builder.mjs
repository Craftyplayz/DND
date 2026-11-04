// Checks the encounter builder on the Monster Sheet (ROADMAP 3.2) in headless Chrome and Firefox: the difficulty card for a campaign's
// party (4 level 3s against 4 goblins reads as worked out by hand), ticks and typed extra levels, the 2014 / 2024 switch, a new
// encounter starting from the last party, unreadable CRs and hand-edited ones, Add monsters (stays open, fills the shown encounter),
// Import monster still going to Unsorted, the search filters, the phone line, the party following the account to a second browser
// (Unsorted's too), a deleted campaign turning into typed levels, the Compendium's encounter picker, and signed out. Working anything
// out never changes a monster.
//   node _dev/scripts/encounter-builder.mjs        (needs includes/config.php for sign-in, and the network for monsters.php)
// Starts its own server (port 8138 + CHECK_PORT_SHIFT) with stand-in account and session folders in the temp folder, so it never
// touches private/dnd/accounts or private/sessions. Backups and settings sync are blocked.
import { mkdirSync, writeFileSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { launch, browsers, serving } from './browser.mjs';

const ROOT = join(import.meta.dirname, '../..'), PORT = 8138 + (+process.env.CHECK_PORT_SHIFT || 0), BASE = `http://localhost:${PORT}`;
const PHP = process.env.PHP || (process.platform === 'win32' ? 'C:/php/php.exe' : 'php');
const TMP = join(tmpdir(), 'dnd-builder32-check' + (process.env.CHECK_PORT_SHIFT || '')), ACCOUNTS = join(TMP, 'accounts'), SESSIONS = join(TMP, 'sessions');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ser = (o) => `a:${Object.keys(o).length}:{` + Object.entries(o).map(([k, v]) => `s:${Buffer.byteLength(k)}:"${k}";s:${Buffer.byteLength(v)}:"${v}";`).join('') + '}';
const SID = 'encb0check000000000000000000000000', CAMP = 'aaaaaaaaaaaa';

let bad = 0;
const is = (name, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) { bad++; console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); } };
const until = async (fn, ok, ms = 10000) => { const t = Date.now(); let v; while (Date.now() - t < ms) { v = await fn(); if (ok(v)) return v; await sleep(200); } return v; };
const web = spawn(PHP, ['-S', `127.0.0.1:${PORT}`, '-t', ROOT, join(ROOT, '_dev/router.php')], { stdio: 'ignore', env: { ...process.env, DND_ACCOUNTS: ACCOUNTS, DND_SESSIONS: SESSIONS } });
await serving(BASE + '/privacy/');

const put = (rel, data) => { const f = join(ACCOUNTS, rel); mkdirSync(join(f, '..'), { recursive: true }); writeFileSync(f, JSON.stringify(data)); };
const character = (id, name, classes, extra = {}) => {
    put(`characters/${id}/character.json`, { id, name, classes, updated: 5, ...extra });
    put(`characters/${id}/meta.json`, { owner: '111', visibility: 'private', created: 1 });
};
function seedAccounts() {
    rmSync(TMP, { recursive: true, force: true });
    mkdirSync(SESSIONS, { recursive: true });
    writeFileSync(join(SESSIONS, 'sess_' + SID), 'user|' + ser({ sub: '111', email: 'me@example.com', name: 'Me' }));
    character('char00000001', 'Bren', [{ name: 'Fighter', level: 3 }]);
    character('char00000002', 'Ash', [{ name: 'Wizard', level: 3 }]);
    character('char00000003', 'Tol', [{ name: 'Cleric', level: 2 }, { name: 'Rogue', level: 1 }]); // multiclass: total 3
    character('char00000004', 'Ida', [{ name: 'Bard', level: 3 }]);
    character('char00000005', 'Half-made', [{ name: 'Monk', level: 1 }], { draft: 1 });
    put(`campaigns/${CAMP}/campaign.json`, { id: CAMP, name: 'Rimewatch', dm: '111', code: 'bbbbbbbbbb', created: 1, members: [
        { sub: '111', name: 'Me', joined: 1, characters: ['char00000001', 'char00000002', 'char00000003', 'char00000004', 'char00000005'].map((id) => ({ sheet: 'player', id })) },
    ] });
}

const mon = (id, name, cr, extra = {}) => ({ id, name, cr, updated: 100, abilities: [], hp: { cur: 7, base: 7, temp: 0, mod: 0 }, ...extra });
const SEED = { cur: 'g1', encs: [{ id: 'cave', name: 'Cave', order: 0, archived: 0, updated: 50 }], chars: {
    g1: mon('g1', 'Goblin 1', '1/4', { enc: 'cave' }), g2: mon('g2', 'Goblin 2', '1/4', { enc: 'cave', hp: { cur: 0, base: 7, temp: 0, mod: 0 } }), // Down still counts
    g3: mon('g3', 'Goblin 3', '1/4', { enc: 'cave' }), g4: mon('g4', 'Goblin 4', '1/4', { enc: 'cave' }),
    gone: mon('gone', 'Old ogre', '2', { enc: 'cave', archived: 9 }), // archived: left out
    blank: mon('blank', '', '0', { enc: 'cave' }), // a new blank: left out until it's named
} };
const db = (b) => b.ev(`localStorage.getItem('monster-sheet')`).then(JSON.parse);
const click = (b, sel) => b.ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (e) e.click(); return !!e; })()`);
const pick = (b, sel, v) => b.ev(`(() => { const s = document.querySelector(${JSON.stringify(sel)}); s.value = ${JSON.stringify(v)}; s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
const type = (b, sel, v) => b.ev(`(() => { const s = document.querySelector(${JSON.stringify(sel)}); s.value = ${JSON.stringify(v)}; s.dispatchEvent(new Event('input', { bubbles: true })); })()`);
const card = (b) => b.ev(`document.querySelector('#mon-side .mon-diff')?.textContent.replace(/\\s+/g, ' ').trim() || ''`);
const badge = (b) => b.ev(`document.querySelector('#mon-side .mon-diff .badge')?.textContent || ''`);
const closeEnc = async (b) => { await click(b, '#mon-encdlg [data-enc=close]'); await sleep(150); };
const errs = (b, name, where, ok = /backup\.php|prefs\.php/) => { const e = b.errors.filter((x) => !ok.test(x)); if (e.length) { bad++; console.log(`FAIL ${name} ${where}: ${e.join(' | ').slice(0, 600)}`); } };
const start = async (b, signed, seed) => {
    await b.block(/backup\.php|prefs\.php/);
    await b.go(BASE + '/privacy/');
    await b.ev(`localStorage.clear(); ${seed ? `localStorage.setItem('monster-sheet', ${JSON.stringify(JSON.stringify(seed))});` : ''} document.cookie = 'dndsid=${signed ? SID : ''}; path=/'`);
    await b.go(BASE + '/sheets/monster/');
    await until(() => b.ev(`!!document.querySelector('#mon-side .mon-diff')`), Boolean);
};
const account = () => { try { return JSON.parse(readFileSync(join(ACCOUNTS, 'monster-encounters', '111.json'), 'utf8')); } catch { return {}; } };

try {
    for (const name of browsers) {
        seedAccounts();
        let b = await launch(name);
        try {
            await start(b, true, SEED);
            // the campaign the rolls go to is the party until one is picked: 4 level 3s (one multiclass) against 4 goblins, by hand 200 XP x 2 = 400, Easy
            is(`${name} 4 level 3s v 4 goblins`, await until(() => badge(b), (x) => x === 'Easy'), 'Easy');
            let t = await card(b);
            for (const want of ['Total XP200', 'Adjusted XP400', '200 XP × 2 (4 monsters) = 400', 'Easy 300 · Medium 600 · Hard 900 · Deadly 1,600', 'Bren 3, Ash 3, Tol 3, Ida 3', '1 unfinished character not counted', '2014 rules'])
                is(`${name} card says ${want}`, t.includes(want), true);
            is(`${name} a monster's XP in the list`, await b.ev(`document.querySelector('#mon-side [data-act=side] small').textContent.includes('CR 1/4 · 50 XP')`), true);
            let d = await db(b);
            is(`${name} nothing written to monsters or encounters`, [Object.values(d.chars).map((c) => c.updated), d.encs[0].party, d.encs[0].updated], [[100, 100, 100, 100, 100, 100], undefined, 50]);

            // leave one character out, add typed extras
            await click(b, '#mon-side [data-act=diffparty]');
            is(`${name} ticks listed, the draft off`, await b.ev(`JSON.stringify([...document.querySelectorAll('[data-party-off]')].map((x) => [x.closest('label').textContent.trim(), x.checked, x.disabled]))`).then(JSON.parse),
                [['Bren, level 3', true, false], ['Ash, level 3', true, false], ['Tol, level 3', true, false], ['Ida, level 3', true, false], ['Half-made, unfinished, not counted', false, true]]);
            await b.ev(`(() => { const x = document.querySelector('[data-party-off="char00000004"]'); x.checked = false; x.dispatchEvent(new Event('change', { bubbles: true })); })()`);
            is(`${name} a tick out: 3 thresholds`, (await card(b)).includes('Easy 225'), true);
            await type(b, '[data-party="levels"]', '5, abc, 25');
            is(`${name} typed levels read back`, await b.ev(`document.querySelector('#mon-partyread').textContent`), 'Read as 5, 20. Left out abc. Levels run from 1 to 20, so 25 moved to fit.');
            await type(b, '[data-party="levels"]', '5');
            is(`${name} typing keeps the box`, await b.ev(`document.querySelector('[data-party="levels"]').value`), '5');
            await closeEnc(b);
            t = await card(b);
            is(`${name} extra level counted`, [t.includes('Bren 3, Ash 3, Tol 3, 5'), t.includes('Easy 475')], [true, true]);
            d = await db(b);
            is(`${name} party saved on the encounter`, [d.encs[0].party.camp, d.encs[0].party.off, d.encs[0].party.levels, d.encs[0].updated > 50], [CAMP, ['char00000004'], '5', true]);
            is(`${name} party reaches the account`, await until(() => account().encs?.[0]?.party?.levels, (x) => x === '5'), '5');

            // 2024: no multiplier, its own bands, and the setting stays
            await click(b, '#mon-side [data-act=diffparty]');
            await pick(b, '[data-party="rules"]', '2024');
            await closeEnc(b);
            t = await card(b);
            is(`${name} 2024 card`, [await badge(b), t.includes('Adjusted XP'), t.includes('Low 950 · Moderate 1,425'), t.includes("below Low (this site's word)"), t.includes('2024 rules')], ['Trivial', false, true, true, true]);
            await click(b, '#mon-side [data-act=diffparty]');
            await pick(b, '[data-party="rules"]', '2014');
            await closeEnc(b);
            is(`${name} back to 2014`, await badge(b), 'Trivial'); // 400 is under Easy 475

            // a new encounter starts from the last party used
            await pick(b, '.mon-encside', '+new');
            await closeEnc(b);
            d = await db(b);
            const next = d.encs.find((e) => e.id !== 'cave');
            is(`${name} new encounter starts from the last party`, [next.party.camp, next.party.off, next.party.levels], [CAMP, ['char00000004'], '5']);
            is(`${name} empty encounter`, (await card(b)).includes('No monsters yet'), true);

            // Add monsters: stays open, fills the shown encounter, numbers within it, the open monster stays
            const open = (await db(b)).cur;
            await click(b, '#mon-side [data-act=diffadd]');
            is(`${name} Add monsters dialog`, await b.ev(`JSON.stringify([document.querySelector('#mon-dlg').open, document.querySelector('#mon-dlg h2').textContent, document.querySelector('#mon-nwrap').hidden])`).then(JSON.parse), [true, `Add monsters to ${next.name}`, false]);
            await until(() => b.ev(`document.querySelectorAll('#mon-results [data-mon]').length`), (n) => n > 0);
            // the filters: a CR range and the rules version
            await type(b, '#mon-crlo', '30'); await sleep(200);
            is(`${name} CR filter`, await until(() => b.ev(`[...document.querySelectorAll('#mon-results [data-mon]')].every((x) => /CR 30 /.test(x.textContent))`), Boolean), true);
            await type(b, '#mon-crlo', ''); await pick(b, '#mon-rules', '2024'); await sleep(200);
            is(`${name} rules filter`, await until(() => b.ev(`[...document.querySelectorAll('#mon-results [data-mon]')].every((x) => x.dataset.mon.startsWith('s24:'))`), Boolean), true);
            await pick(b, '#mon-rules', ''); await type(b, '#mon-q', 'goblin'); await sleep(200);
            await type(b, '#mon-n', '2');
            await until(() => click(b, '#mon-results [data-mon="srd:goblin"]'), Boolean);
            const inNext = async () => Object.values((await db(b)).chars).filter((c) => c.enc === next.id).map((c) => c.name).sort();
            is(`${name} two goblins in the encounter`, await until(inNext, (l) => l.length === 2, 30000), ['Goblin 1', 'Goblin 2']);
            is(`${name} dialog stays open, says so, shows the sum`, await until(() => b.ev(`JSON.stringify([document.querySelector('#mon-dlg').open, document.querySelector('#mon-added').textContent, document.querySelector('#mon-sumline').textContent.includes('Trivial')])`).then(JSON.parse), (x) => x[1] !== ''), [true, `Added 2 × Goblin to ${next.name}.`, true]);
            await until(() => click(b, '#mon-results [data-mon="srd:goblin"]:not(:disabled)'), Boolean);
            is(`${name} numbering carries on`, await until(inNext, (l) => l.length === 4, 30000), ['Goblin 1', 'Goblin 2', 'Goblin 3', 'Goblin 4']);
            is(`${name} the open monster stayed`, (await db(b)).cur, open);
            await click(b, '#mon-dlg [data-mon-close]');
            // the open monster is the Cave's, while the list shows the new encounter
            is(`${name} the list shows them`, await until(() => b.ev(`document.querySelectorAll('#mon-side > .mon-list [data-act=side]').length`), (n) => n === 4), 4);
            is(`${name} card follows`, (await card(b)).includes('Total XP200'), true);

            // Import monster (under Edit) still goes to Unsorted and closes
            await click(b, '[data-act=find]');
            is(`${name} Import dialog is the plain one`, await b.ev(`JSON.stringify([document.querySelector('#mon-dlg h2').textContent, document.querySelector('#mon-nwrap').hidden, document.querySelector('#mon-sum').hidden])`).then(JSON.parse), ['Import a monster', true, true]);
            await until(() => click(b, '#mon-results [data-mon="srd:goblin"]'), Boolean);
            const imported = await until(async () => Object.values((await db(b)).chars).filter((c) => c.enc === '' && /^Goblin/.test(c.name)), (l) => l.length === 1, 30000);
            is(`${name} import in Unsorted, opened, closed`, [imported.length, await b.ev(`document.querySelector('#mon-dlg').open`), (await db(b)).cur === imported[0]?.id], [1, false, true]);

            // Unsorted has a party of its own
            await click(b, '#mon-side [data-act=diffparty]');
            await pick(b, '[data-party="camp"]', '');
            await type(b, '[data-party="levels"]', '4x2');
            is(`${name} no campaign: the box is Party levels`, await b.ev(`document.querySelector('#mon-partylab').textContent`), 'Party levels');
            await closeEnc(b);
            is(`${name} Unsorted's party is its own`, [(await db(b)).unsorted.party.levels, (await db(b)).encs.find((e) => e.id === 'cave').party.levels], ['4x2', '5']);
            is(`${name} Unsorted's party reaches the account`, await until(() => account().unsorted?.party?.levels, (x) => x === '4x2'), '4x2');

            // a hand-edited CR: XP follows; one that can't be read is named and counts 0 XP
            await type(b, '[data-k="cr"]', 'abc');
            t = await until(() => card(b), (x) => x.includes("Goblin has a CR that can't be read"));
            is(`${name} unreadable CR named`, [t.includes("Goblin has a CR that can't be read, so counts as 0 XP."), t.includes('Total XP0')], [true, true]);
            await type(b, '[data-k="cr"]', '15 (lair)');
            is(`${name} leading number read`, (await until(() => card(b), (x) => x.includes('13,000'))).includes('Total XP13,000'), true);

            // phones: one line in the bar that opens the same card; a computer doesn't show it
            is(`${name} computer: no phone line`, await b.ev(`getComputedStyle(document.querySelector('.mon-diffbar')).display`), 'none');
            await b.ev(`localStorage.setItem('sheet-full-layout', '1')`); // the full layout on a phone; phone mode has its own check (phone-mode.mjs)
            await b.shot(390);
            is(`${name} phone: line shown, sidebar hidden`, await b.ev(`JSON.stringify([getComputedStyle(document.querySelector('.mon-diffbar')).display, document.querySelector('.mon-diffbar').offsetHeight >= 44, document.querySelector('.mon-diffbar').textContent.includes('13,000 XP'), getComputedStyle(document.querySelector('#mon-side')).display])`).then(JSON.parse), ['flex', true, true, 'none']);
            is(`${name} phone: no sideways scroll`, await b.ev(`document.documentElement.scrollWidth <= innerWidth`), true);
            await click(b, '.mon-diffbar');
            is(`${name} phone: details dialog`, await b.ev(`JSON.stringify([document.querySelector('#mon-encdlg').open, document.querySelector('#mon-encbody .mon-diff').textContent.includes('Total XP')])`).then(JSON.parse), [true, true]);
            await click(b, '#mon-encbody [data-act=diffparty]');
            is(`${name} phone: on to the party`, await b.ev(`!!document.querySelector('#mon-encbody [data-party="levels"]')`), true);
            await closeEnc(b);
            await b.shot(1280);
            errs(b, name, 'first browser');
            await b.ev(`dispatchEvent(new Event('pagehide'))`);
        } finally { b.close(); }

        // a second browser pulls the parties; the campaign's party is read fresh (a level-up shows on Refresh, a new browser sees it at once)
        character('char00000001', 'Bren', [{ name: 'Fighter', level: 4 }]);
        b = await launch(name);
        try {
            await start(b, true, null);
            const cave = () => pick(b, '.mon-encside', 'cave');
            await until(() => b.ev(`[...document.querySelectorAll('.mon-encside option')].some((o) => o.value === 'cave')`), Boolean);
            await cave();
            is(`${name} second browser: party and level-up`, (await until(() => card(b), (x) => x.includes('Bren 4'))).includes('Bren 4, Ash 3, Tol 3, 5'), true);
            await pick(b, '.mon-encside', '');
            is(`${name} second browser: Unsorted's party`, (await until(() => card(b), (x) => x.includes('2, 2, 2, 2'))).includes('2, 2, 2, 2'), true);

            // Refresh picks up a level-up made since
            await cave();
            await until(() => card(b), (x) => x.includes('Bren 4'));
            character('char00000002', 'Ash', [{ name: 'Wizard', level: 6 }]);
            await click(b, '#mon-side [data-act=diffrefresh]');
            is(`${name} Refresh`, (await until(() => card(b), (x) => x.includes('Ash 6'))).includes('Ash 6'), true);

            // the campaign is deleted: the last levels seen become typed ones
            mkdirSync(join(ACCOUNTS, 'campaigns', '.deleted'), { recursive: true });
            renameSync(join(ACCOUNTS, 'campaigns', CAMP), join(ACCOUNTS, 'campaigns', '.deleted', CAMP));
            await click(b, '#mon-side [data-act=diffrefresh]');
            {
                const t = await until(() => card(b), (x) => x.includes('no longer available'));
                is(`${name} deleted campaign: levels kept as typed`, [t.includes('no longer available'), t.includes('4, 6, 3, 5')], [true, true]);
                const p = (await db(b)).encs.find((e) => e.id === 'cave').party;
                is(`${name} deleted campaign: saved`, [p.camp, p.levels, p.gone], ['', '4, 6, 3, 5', 1]);
            }
            await click(b, '#mon-side [data-act=diffparty]');
            await type(b, '[data-party="levels"]', '4, 6, 3');
            await closeEnc(b);
            is(`${name} an edit clears the note`, (await card(b)).includes('no longer available'), false);
            errs(b, name, 'second browser', /backup\.php|prefs\.php|party\.php|404/);
            await b.ev(`dispatchEvent(new Event('pagehide'))`);
        } finally { b.close(); }

        // the Compendium's picker: the Monster Sheet's encounters, the last pick remembered, the monsters land there
        b = await launch(name);
        try {
            await start(b, true, SEED);
            await until(() => b.ev(`JSON.parse(localStorage.getItem('monster-sheet')).encs.length`), (n) => n >= 2);
            await b.go(BASE + '/compendium/?t=monster&i=srd:goblin');
            await until(() => b.ev(`!!document.querySelector('#cp-enc')`), Boolean, 30000);
            is(`${name} Compendium picker lists encounters`, await b.ev(`JSON.stringify([...document.querySelectorAll('#cp-enc option')].map((o) => o.textContent))`).then(JSON.parse).then((l) => [l[0], l.includes('Cave')]), ['Unsorted', true]);
            await pick(b, '#cp-enc', 'cave');
            await click(b, '[data-add=enc]');
            await until(() => b.ev(`!!document.querySelector('#cp-msg .ok')`), Boolean);
            is(`${name} Compendium says where`, await b.ev(`document.querySelector('#cp-msg').textContent.includes('in Cave on the Monster Sheet')`), true);
            is(`${name} last pick kept`, await b.ev(`JSON.parse(localStorage.getItem('compendium-enc'))`), 'cave');
            is(`${name} request carries it`, await b.ev(`JSON.parse(localStorage.getItem('mon-pending'))[0].enc`), 'cave');
            await b.go(BASE + '/compendium/?t=monster&i=srd:goblin');
            await until(() => b.ev(`!!document.querySelector('#cp-enc')`), Boolean, 30000);
            is(`${name} picker remembers`, await b.ev(`document.querySelector('#cp-enc').value`), 'cave');
            await b.go(BASE + '/sheets/monster/');
            const added = await until(async () => Object.values((await db(b)).chars).filter((c) => c.enc === 'cave' && /^Goblin 5$/.test(c.name)), (l) => l.length === 1, 30000);
            is(`${name} landed in that encounter, numbered there`, added.length, 1);
            errs(b, name, 'compendium');
        } finally { b.close(); }

        // signed out: typed levels only, from the browser alone
        b = await launch(name);
        try {
            await start(b, false, SEED);
            is(`${name} signed out: asks for a party`, (await card(b)).includes('Pick a party for difficulty'), true);
            await click(b, '#mon-side [data-act=diffparty]');
            is(`${name} signed out: no campaign pick, says why`, await b.ev(`JSON.stringify([!!document.querySelector('[data-party="camp"]'), document.querySelector('#mon-encbody').textContent.includes('Sign in to pick a campaign')])`).then(JSON.parse), [false, true]);
            await type(b, '[data-party="levels"]', '4x3');
            await closeEnc(b);
            is(`${name} signed out: works it out`, await badge(b), 'Easy');
            await b.ev(`dispatchEvent(new Event('pagehide'))`);
            await b.go(BASE + '/sheets/monster/');
            await until(() => b.ev(`!!document.querySelector('#mon-side .mon-diff')`), Boolean);
            is(`${name} signed out: kept in the browser`, await badge(b), 'Easy');
            errs(b, name, 'signed out');
        } finally { b.close(); }
    }
} finally {
    web.kill();
}
console.log(bad ? `${bad} check(s) failed` : 'encounter builder ok');
process.exit(bad ? 1 : 0);
