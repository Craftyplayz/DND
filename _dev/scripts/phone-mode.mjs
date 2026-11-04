// Checks phone play mode (ROADMAP 2.1, assets/js/phone.js) on both sheets in headless Chrome and Firefox, at 320 and 375 px and on
// its side: header, tabs and what's in them, 44 px tap targets, HP, dice and log, menu, Customise, encounter sheet, read-only and
// archived pages, the full layout switch, and desktop staying as it is. And the player-data side, signed in: a tab tap never changes
// "updated" on phone or desktop, a stale copy coming back takes the account's newer one and never overwrites it, and a character
// survives sign-in, a new browser and an edit on another device.
//   node _dev/scripts/phone-mode.mjs        (SHOTS=<folder> saves screenshots; needs includes/config.php for sign-in)
// Starts its own server on port 8141 with stand-in account and session folders in the temp folder. Backups and settings sync are
// blocked, so nothing else is written. The sheet runs in an iframe of exactly the phone's size, so what stays on screen is measured
// as a phone shows it.
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { launch, browsers, serving } from './browser.mjs';

const ROOT = join(import.meta.dirname, '../..'), PORT = 8141 + (+process.env.CHECK_PORT_SHIFT || 0), BASE = `http://localhost:${PORT}`;
const PHP = process.env.PHP || (process.platform === 'win32' ? 'C:/php/php.exe' : 'php'), SHOTS = process.env.SHOTS;
const TMP = join(tmpdir(), 'dnd-phone-check' + (process.env.CHECK_PORT_SHIFT || '')), ACCOUNTS = join(TMP, 'accounts'), SESSIONS = join(TMP, 'sessions');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ser = (o) => `a:${Object.keys(o).length}:{` + Object.entries(o).map(([k, v]) => `s:${Buffer.byteLength(k)}:"${k}";s:${Buffer.byteLength(v)}:"${v}";`).join('') + '}';
const SID = 'phonecheckme0000000000000000000000', SUB = '777';

let bad = 0;
const is = (name, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) { bad++; console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); } };
const ok = (name, got) => { if (!got) { bad++; console.log(`FAIL ${name}: ${JSON.stringify(got)}`); } };
const web = spawn(PHP, ['-S', `127.0.0.1:${PORT}`, '-t', ROOT, join(ROOT, '_dev/router.php')], { stdio: 'ignore', env: { ...process.env, DND_ACCOUNTS: ACCOUNTS, DND_SESSIONS: SESSIONS, DND_BACKUPS: join(TMP, 'backups'), DND_MONSTER_BACKUPS: join(TMP, 'monster-backups') } });
await serving(BASE + '/privacy/');

// made-up characters: rows in every panel, a pinned note, a custom panel; the rest comes from the sheet's own blank()
const row = (o) => ({ id: 'r' + Math.random().toString(36).slice(2, 9), ...o });
function fillIn(c, o) {
    Object.assign(c, { updated: 1000, name: 'Maren Ashgrove of the Long Vigil', race: 'Tiefling', classes: [{ name: 'Cleric', level: 5, die: 8, hdUsed: 0 }], ...o });
    c.hp = { cur: 27, base: 38, temp: 5, mod: 0 };
    const P = (t) => c.panels.find((p) => p.type === t);
    P('attacks').rows = [row({ name: 'Mace', time: 'Action', range: '5 ft', props: [], mode: 'hit', hit: 'STR + PROF', save: 'DEX', dc: '10', dmg: [{ dice: '1d6 + STR', type: 'Bludgeoning' }], fx: [], uses: '', used: 0, reset: '', desc: 'A mace.' })];
    P('spells').rows = [row({ lvl: 1, name: 'Guiding Bolt', school: '', time: 'Action', trig: '', range: '120 ft', comp: '', dur: '', conc: false, ritual: false, prep: true, mode: 'atk', save: 'DEX', dc: '', dmg: [{ dice: '4d6', type: 'Radiant' }], fx: [], desc: 'A flash.', higher: '', srd: '' })];
    P('spells').slots[0] = { max: 4, used: 1 };
    P('items').rows = [row({ cat: 'Gear', eq: true, att: '', name: 'Backpack', qty: 1, wt: 5, gp: '2', props: [], notes: '' })];
    P('list').rows = [row({ name: 'Darkvision', src: 'Tiefling', text: 'See in the dark.', uses: '', used: 0, reset: '', grp: 'race' })];
    P('trackers').rows = [row({ name: 'Channel Divinity', kind: 'pips', cur: 1, max: 2, used: 0, reset: 'short', group: '', levels: [] })];
    P('homebrew').rows = [row({ group: '', name: 'Ember step', time: 'Bonus action', range: '', mode: 'none', hit: '', save: 'DEX', dc: '', fx: [], cost: { amt: '', what: '' }, desc: '' })];
    P('notes').notes[0] = Object.assign(P('notes').notes[0], { pinned: true, body: 'Ask about the blue wagon.', title: 'The innkeeper' });
    c.panels.push({ id: 'ptext', type: 'text', title: 'Party loot log', on: true, sub: 'all', text: 'Thirty gold.' });
    c.rolls = [];
    return c;
}
const TAP = `(() => { const out = [], open = document.querySelector('#ph-sheet').open, dlg = document.querySelector('dialog#hb-dlg').open;
    const all = dlg ? '#hb-dlg' : open ? '#ph-sheet' : '#ph-head, #ph-tabs, #hb-sheet, .hb-dice';
    for (const box of document.querySelectorAll(all)) for (const e of box.querySelectorAll('button, a.btn, a.ph-ico, input:not([type=checkbox]):not([type=hidden]), select, textarea, summary, .hb-prep, .hb-dot, .check')) {
        if (e.matches('.hb-prop, .hb-fword') || e.closest('.hb-hint, .auth, [hidden], #hb-dl') || e.matches('.check *') || e.matches('.hb-prep *, .hb-dot *')) continue;
        const r = e.getBoundingClientRect(); if (!r.width || !r.height) continue;
        const a = getComputedStyle(e, '::after').content !== 'none' ? 8 : 0;
        if (r.height + a < 43.5 || r.width < 43.5) out.push(e.tagName + '.' + e.className + ' ' + Math.round(r.width) + 'x' + Math.round(r.height) + ' ' + (e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 18)); }
    return [...new Set(out)]; })()`;

try {
    for (const name of browsers) {
        rmSync(TMP, { recursive: true, force: true });
        mkdirSync(SESSIONS, { recursive: true });
        writeFileSync(join(SESSIONS, 'sess_' + SID), 'user|' + ser({ sub: SUB, email: 'me@example.com', name: 'Me' }));
        const b = await launch(name);
        const F = `document.querySelector('iframe').contentWindow`;
        const raw = (x) => b.ev(`${F}.eval(${JSON.stringify(x)})`);
        const J = async (x) => JSON.parse(await raw(`JSON.stringify(${x})`));
        const has = (s) => b.until(`${F}.document.querySelector(${JSON.stringify(s)})`);
        const gone = (s) => b.until(`!${F}.document.querySelector(${JSON.stringify(s)})`);
        const click = async (s) => { await has(s); await raw(`document.querySelector(${JSON.stringify(s)}).click(); 1`); await sleep(40); };
        const closed = () => b.until(`!${F}.document.querySelector('#ph-sheet').open`);
        const titles = () => J(`[...document.querySelectorAll('#hb-sheet .card > h2')].map((h) => h.childNodes[0].textContent.trim())`);
        const home = async () => { await b.go(BASE + '/privacy/'); await sleep(100); };
        // the harness page isn't a sheet, so it can fill localStorage without a sheet saving over it
        const frame = async (path, w, h) => {
            await b.ev(`document.body.innerHTML = '<iframe src="${path}" style="position:fixed;left:0;top:0;width:${w}px;height:${h}px;border:0;background:#000"></iframe>'; document.body.style.margin = 0; 1`);
            await b.until(`${F}.document.querySelector('#hb-sheet .card, #hb-sheet .hb-abil')`);
            await sleep(120);
        };
        const size = (w, h) => b.ev(`(() => { const f = document.querySelector('iframe'); f.style.width = '${w}px'; f.style.height = '${h}px'; return 1; })()`);
        const shot = async (n, w, h) => { if (SHOTS) { await sleep(120); writeFileSync(join(SHOTS, `${name}-${w}-${n}.png`), await b.shot(w, h)); await sleep(100); } };
        const local = async (key = 'hb-sheet') => JSON.parse(await b.ev(`localStorage.getItem('${key}')`));
        const putLocal = (key, db) => b.ev(`localStorage.setItem('${key}', ${JSON.stringify(JSON.stringify(db))}); 1`);
        const errs = (w) => { const e = b.errors.filter((x) => !/backup\.php|prefs\.php|favicon|gsi|google|ERR_BLOCKED|NS_ERROR|blocked|net::ERR_FAILED|409/i.test(x)); if (e.length) { bad++; console.log(`FAIL ${name} ${w}: ${e.join(' | ').slice(0, 500)}`); } b.errors.length = 0; };
        const hide = () => raw(`Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => window.__vis }); window.__vis = 'hidden'; document.dispatchEvent(new Event('visibilitychange')); 1`);
        const back = () => raw(`window.__vis = 'visible'; document.dispatchEvent(new Event('visibilitychange')); 1`);
        const flush = async () => { await raw(`dispatchEvent(new Event('pagehide')); 1`); await sleep(350); };
        try {
            await b.block(/backup\.php|prefs\.php/);
            // ---- a character to play with ----
            await home();
            await b.ev(`localStorage.clear(); localStorage.setItem('hb-sheet-merged', '1'); 1`);
            await frame('/characters/new', 375, 812);
            const made = await raw(`location.pathname.split('/').pop()`);
            await flush(); await home();
            const db0 = await local(), base = db0.chars[made];
            const char = fillIn(JSON.parse(JSON.stringify(base)), {}), id = char.id;
            await putLocal('hb-sheet', { ...db0, chars: { [id]: char } });

            for (const [W, H] of [[320, 568], [375, 812]]) {
                const tag = `${name} ${W}`;
                await home(); await putLocal('hb-sheet', { cur: id, chars: { [id]: JSON.parse(JSON.stringify(char)) } });
                await frame(`/characters/${id}`, W, H);
                is(`${tag} phone mode on`, await raw(`document.documentElement.classList.contains('ph-on')`), true);
                is(`${tag} every kind of panel has a tab`, await J(`Object.keys(hbModel(() => 'x').TYPES).filter((t) => !Phone.MAP[t])`), []);
                is(`${tag} five tabs`, await J(`[...document.querySelectorAll('#ph-tabs span')].map((e) => e.textContent)`), ['Main', 'Actions', 'Spells', 'Items', 'Notes']);
                is(`${tag} Main`, await titles(), ['Abilities', 'Saving throws', 'Proficiencies', 'Senses', 'Death saves and hit dice']);
                ok(`${tag} pinned note on top of Main`, await raw(`document.querySelector('.hb-pin') && document.querySelector('.hb-pin').getBoundingClientRect().top < document.querySelector('#ph-abil').getBoundingClientRect().top`));
                ok(`${tag} header two lines`, (await raw(`document.querySelector('#ph-head').offsetHeight`)) <= 112);
                is(`${tag} header name, no conditions: who they are`, await J(`[document.querySelector('[data-c=phname]').textContent, document.querySelector('[data-c=phsub]').textContent, document.querySelector('[data-c=phcur]').textContent, document.querySelector('[data-c=phtemp]').textContent]`), ['Maren Ashgrove of the Long Vigil', 'Cleric 5 · Tiefling', '27', '+5']);
                const panels = { actions: ['Resources', 'Actions', 'Passive abilities', 'Homebrew'], spells: ['Spells'], items: ['Inventory'], notes: ['Notes', 'Character details', 'Party loot log'] };
                is(`${tag} Main tap targets`, await J(TAP), []); await shot('main', W, H);
                for (const [k, want] of Object.entries(panels)) {
                    await click(`#ph-tabs [data-id=${k}]`);
                    is(`${tag} ${k} panels`, await titles(), want);
                    is(`${tag} ${k} no sideways scroll`, await raw(`document.documentElement.scrollWidth <= innerWidth`), true);
                    is(`${tag} ${k} tap targets`, await J(TAP), []); await shot(k, W, H);
                    await raw(`scrollTo(0, 1e6); 1`); await sleep(60);
                    is(`${tag} ${k} header and tabs stay`, await J(`(() => { const h = document.querySelector('#ph-head').getBoundingClientRect(), t = document.querySelector('#ph-tabs').getBoundingClientRect(), d = document.querySelector('.hb-dicebtn').getBoundingClientRect(); return [Math.round(h.top), Math.floor(innerHeight - t.bottom), d.bottom <= t.top]; })()`), [0, 0, true]);
                }
                // an open row, its editor, and a roll from the row
                await click('#ph-tabs [data-id=actions]'); await raw(`scrollTo(0, 0); 1`);
                await click('#hb-sheet [data-act=phrow]');
                ok(`${tag} row opens with its summary`, await raw(`!!document.querySelector('.ph-rowopen .hb-sum')`));
                await click('.ph-rowopen [data-act=toggle]'); await has('.hb-editor');
                is(`${tag} open editor fits`, await raw(`document.documentElement.scrollWidth <= innerWidth`), true); is(`${tag} open editor tap targets`, await J(TAP), []);
                await click('.ph-rowopen [data-act=toggle]');
                await click('.ph-rowopen [data-act=info]'); await has('#ph-sheet[open] .hb-desc');
                ok(`${tag} details in a sheet`, (await raw(`document.querySelector('#ph-body').textContent`)).includes('A mace'));
                await click('#ph-sheet [data-ph=close]'); await closed();
                // each tab keeps its place, a reload the last tab, Back closes a sheet
                await raw(`scrollTo(0, 120); 1`); await sleep(40); const y = await raw(`Math.round(scrollY)`);
                await click('#ph-tabs [data-id=spells]'); await click('#ph-tabs [data-id=actions]');
                is(`${tag} tab keeps its place`, await raw(`Math.round(scrollY)`), y);
                await flush(); await home(); await frame(`/characters/${id}`, W, H);
                is(`${tag} last tab after a reload`, await raw(`document.querySelector('#ph-tabs .on').dataset.id`), 'actions');
                await click('#ph-tabs [data-id=main]');

                // ---- HP ----
                await raw(`scrollTo(0, 0); 1`);
                await click('#ph-hp'); await has('#hb-amt'); await sleep(260);
                ok(`${tag} HP is a bottom sheet`, await raw(`Math.abs(document.querySelector('#ph-sheet').getBoundingClientRect().bottom - innerHeight) <= 1`));
                is(`${tag} HP sheet tap targets`, await J(TAP), []); await shot('hp', W, H);
                is(`${tag} damage and heal apart`, await raw(`document.querySelector('.ph-heal').getBoundingClientRect().left - document.querySelector('.ph-dmg').getBoundingClientRect().right`), 32);
                is(`${tag} field text 16 px or more`, await raw(`parseFloat(getComputedStyle(document.querySelector('#hb-amt')).fontSize) >= 16`), true);
                const hp = async () => { const c = (await J(`JSON.parse(localStorage.getItem('hb-sheet')).chars[${JSON.stringify(id)}].hp`)); return [c.cur, c.temp]; };
                const hit = async (v, how) => { await has('#hb-amt'); await raw(`document.querySelector('#hb-amt').value = ${JSON.stringify(v)}; document.querySelector('.ph-hpform [value=${how}]').click(); 1`); await closed(); await sleep(100); };
                is(`${tag} HP start`, await hp(), [27, 5]);
                // Enter on the amount never applies damage
                await raw(`(() => { const a = document.querySelector('#hb-amt'); a.value = '9'; a.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); return 1; })()`);
                is(`${tag} Enter applies nothing`, await hp(), [27, 5]);
                await hit('8', 'dmg'); is(`${tag} damage takes temp first`, await hp(), [24, 0]);
                is(`${tag} header follows`, await raw(`document.querySelector('[data-c=phcur]').textContent`), '24');
                await has('.toasts .hb-undo');
                is(`${tag} toast above the tabs`, await raw(`document.querySelector('.toasts .hb-undo').getBoundingClientRect().bottom <= document.querySelector('#ph-tabs').getBoundingClientRect().top`), true); await shot('hp-toast', W, H);
                await click('.toasts .hb-undo button'); is(`${tag} undo`, await hp(), [27, 5]);
                await click('#ph-hp'); await hit('4', 'heal'); is(`${tag} heal`, await hp(), [31, 5]);
                await raw(`document.querySelectorAll('.toasts .hb-undo').forEach((e) => e.remove()); 1`);
                await click('#ph-hp'); await has('#hb-amt'); await click('#ph-sheet [data-act=hpedit]'); await has('#ph-body [data-k="hp.cur"]');
                is(`${tag} Edit HP tap targets`, await J(TAP), []);
                await raw(`history.back(); 1`); await closed();
                is(`${tag} Back closed the sheet, the page stayed`, await raw(`location.pathname`), `/characters/${id}`);
                await raw(`document.querySelector('#ph-hp').click(); 1`); await hit('99', 'dmg');
                is(`${tag} HP warns at 0`, await raw(`document.querySelector('#ph-hp').classList.contains('down')`), true);
                ok(`${tag} at 0 HP death saves come first`, await raw(`(() => { const d = [...document.querySelectorAll('#hb-sheet .card > h2')].find((h) => h.textContent.startsWith('Death')); return d.getBoundingClientRect().top < document.querySelector('#ph-abil').getBoundingClientRect().top; })()`)); await shot('down', W, H);
                await raw(`document.querySelectorAll('.toasts .hb-undo').forEach((e) => e.remove()); 1`);
                await click('#ph-hp'); await hit('31', 'heal');
                await raw(`document.querySelectorAll('.toasts .hb-undo').forEach((e) => e.remove()); 1`);

                // ---- conditions, AC ----
                await click('#ph-cond'); await has('#ph-body .badges');
                is(`${tag} conditions tap targets`, await J(TAP), []);
                for (const n of ['Poisoned', 'Prone', 'Stunned']) { await click(`#ph-body [data-n=${n}]`); await sleep(40); }
                is(`${tag} conditions fold under the name`, await raw(`document.querySelector('[data-c=phsub]').textContent`), 'Poisoned, Prone +1'); await shot('conditions', W, H);
                for (const n of ['Poisoned', 'Prone', 'Stunned']) await click(`#ph-body [data-n=${n}]`);
                await click('#ph-sheet [data-ph=close]'); await closed();
                await click('[data-ph=ac]'); await has('#ph-body [data-act=custom]'); await click('#ph-sheet [data-ph=close]'); await closed();

                // ---- rolling, dice and log ----
                await raw(`(() => { const d = JSON.parse(localStorage.getItem('hb-sheet')); return 1; })()`);
                const rolls = () => J(`JSON.parse(localStorage.getItem('hb-sheet')).chars[${JSON.stringify(id)}].rolls.length`);
                await click('#ph-head [data-act=roll]'); await has('.hb-rollcard');
                await sleep(100);
                if (await raw(`!!document.querySelector('.hb-rollcard')`)) is(`${tag} card above the dice button`, await raw(`document.querySelector('.hb-rollcard').getBoundingClientRect().bottom <= document.querySelector('.hb-dicebtn').getBoundingClientRect().top`), true);
                // a small pill: the name and the total only, clear of the screen's left side, gone by itself after 5 s; another player's shows their name
                is(`${tag} roll pill shows name and total only`, await J(`(() => { const c = document.querySelector('.hb-rollcard'), r = c.getBoundingClientRect(), vis = (s) => { const e = c.querySelector(s); return !!e && getComputedStyle(e).display !== 'none'; }; return [r.height <= 52, r.width < innerWidth - 24 || c.scrollWidth <= c.clientWidth, vis('.hb-rollhead b'), vis('.hb-rolltot'), vis('.hb-rollhead small'), vis('.hb-rolldice')]; })()`), [true, true, true, true, false, false]);
                await shot('roll', W, H);
                await click('.hb-rollcard'); await gone('.hb-rollcard');
                await raw(`document.querySelector('#hb-rolls').insertAdjacentHTML('afterbegin', '<button type="button" class="hb-rollcard hb-other hb-nat20" id="ph-other"><span class="hb-rollhead"><b>Harl<span class="hb-rollwhat">: Longsword to hit</span></b><small>1d20+5</small></span><span class="hb-rolldice">14</span><span class="hb-rolltot">19</span></button>')`);
                is(`${tag} another player's pill reads their name and total`, await raw(`document.querySelector('#ph-other').innerText.replace(/\\s+/g, ' ').trim()`), 'Harl 19');
                await raw(`document.querySelector('#ph-other').remove()`);
                await click('#ph-head [data-act=roll]'); await has('.hb-rollcard'); await sleep(5600); is(`${tag} the pill goes after 5 seconds`, await raw(`!!document.querySelector('.hb-rollcard')`), false);
                await click('.hb-dicebtn'); await has('#ph-body .ph-dice'); await sleep(250); is(`${tag} dice sheet tap targets`, await J(TAP), []); await shot('dice', W, H);
                await click('#ph-body [data-n="20"]'); await click('#ph-body [data-n="20"]'); await click('#ph-body [data-n="6"]'); await click('#ph-body .ph-minus[data-n="20"]');
                ok(`${tag} dice pool`, (await raw(`document.querySelector('[data-act=dieroll]').textContent`)).includes('1d6 + 1d20'));
                is(`${tag} dice with a − tap targets`, await J(TAP), []);
                const n0 = await rolls();
                await click('[data-act=dieroll]');
                await b.until(`${F}.JSON.parse(${F}.localStorage.getItem('hb-sheet')).chars[${JSON.stringify(id)}].rolls.length > ${n0} || ${F}.document.querySelector('#ph-body .hb-logi')`, 15000);
                await has('#ph-sheet #hb-rolls .hb-rollcard'); await shot('dice-rolled', W, H);
                ok(`${tag} log in the sheet`, await raw(`document.querySelectorAll('#ph-body .hb-logi').length >= 1`));
                await click('[data-act=logclear]'); is(`${tag} log cleared`, await raw(`document.querySelectorAll('#ph-body .hb-logi').length`), 0);
                await click('#ph-sheet .toasts .hb-undo button'); await has('#ph-body .hb-logi');
                await click('[data-act=advnext][data-v=adv]');
                is(`${tag} advantage picked`, await raw(`document.querySelector('[data-act=advnext][data-v=adv]').getAttribute('aria-pressed')`), 'true');
                await click('#ph-sheet [data-ph=close]'); await closed();
                ok(`${tag} toasts and card back outside the sheet`, await raw(`document.querySelector('.toasts').parentNode === document.body && document.querySelector('#hb-rolls').parentNode !== document.querySelector('#ph-sheet')`));
                const before = await rolls();
                await click('#ph-head [data-act=roll]');
                await b.until(`${F}.document.querySelector('.hb-rollcard b') && ${F}.document.querySelector('.hb-rollcard b').textContent.includes('advantage')`, 15000);
                await click('.hb-rollcard'); await gone('.hb-rollcard');
                await click('#ph-head [data-act=roll]');
                await b.until(`${F}.document.querySelector('.hb-rollcard b')`, 15000);
                is(`${tag} advantage is for one roll`, await raw(`document.querySelector('.hb-rollcard b').textContent`), 'Initiative');
                ok(`${tag} rolls logged`, (await rolls()) >= before);
                await click('.hb-rollcard'); await gone('.hb-rollcard');

                // press and hold a d20 roll: the advantage menu; the same touch that ends it doesn't roll
                await raw(`(() => { const r = document.querySelector('#ph-head [data-act=roll]'), o = { pointerType: 'touch', bubbles: true, clientX: 200, clientY: 80 }; r.dispatchEvent(new PointerEvent('pointerdown', o)); return 1; })()`);
                await has('#hb-adv:not([hidden])'); is(`${tag} press and hold opens the menu`, await raw(`document.querySelector('#hb-adv').hidden`), false);
                await raw(`document.querySelector('#ph-head [data-act=roll]').dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); 1`);
                await click('#hb-adv [data-a=adv]'); await b.until(`${F}.document.querySelector('.hb-rollcard b') && ${F}.document.querySelector('.hb-rollcard b').textContent.includes('advantage')`, 15000);
                await click('.hb-rollcard'); await gone('.hb-rollcard');
                // dragging the handle: up to full height, down to half, down closed
                const drag = (dy) => raw(`(() => { const g = document.querySelector('#ph-sheet [data-grab]'); g.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientY: 300 })); dispatchEvent(new PointerEvent('pointermove', { clientY: 300 + ${dy} })); dispatchEvent(new PointerEvent('pointerup', { clientY: 300 + ${dy} })); return document.querySelector('#ph-sheet').className; })()`);
                await click('.hb-dicebtn'); await has('#ph-body .ph-dice');
                ok(`${tag} drag up: full height`, (await drag(-100)).includes('full'));
                ok(`${tag} drag down: half`, (await drag(100)).includes('half'));
                await drag(100); await closed();
                // tapping outside closes too
                await click('.hb-dicebtn'); await has('#ph-body .ph-dice');
                await raw(`document.querySelector('#ph-sheet').click(); 1`); await closed();
                // the keyboard: the tab bar and dice button make room while typing on the sheet
                await click('#ph-tabs [data-id=notes]');
                await raw(`document.querySelector('#hb-sheet textarea, #hb-sheet input.field').dispatchEvent(new FocusEvent('focusin', { bubbles: true })); 1`);
                is(`${tag} the tabs make room for the keyboard`, await J(`[getComputedStyle(document.querySelector('#ph-tabs')).display, getComputedStyle(document.querySelector('.hb-dice')).display]`), ['none', 'none']);
                await raw(`document.querySelector('#hb-sheet textarea, #hb-sheet input.field').dispatchEvent(new FocusEvent('focusout', { bubbles: true })); 1`);
                await click('#ph-tabs [data-id=main]');

                // ---- menu, Customise ----
                await click('[data-ph=menu]'); await has('#ph-body .ph-menu'); await sleep(250); is(`${tag} menu tap targets`, await J(TAP), []); await shot('menu', W, H);
                for (const [s, t] of [['a[href="/characters/"]', 'My Characters'], ['[data-act=custom]', 'Customise'], ['[data-act=rest][data-r=short]', 'Short rest'], ['[data-act=rest][data-r=long]', 'Long rest'], ['[data-act=new]', 'New'], ['[data-act=import]', 'Import'], ['[data-act=ddb]', 'D&D Beyond'], ['[data-act=export]', 'Export'], ['[data-act=versions]', 'Versions'], ['[data-act=archive]', 'Archive'], ['[data-act=art]', 'art'], ['[data-k="classes.0.name"]', 'class']]) ok(`${tag} menu has ${t}`, await raw(`(() => { const e = document.querySelector('#ph-body ${s.replace(/"/g, '\\"')}'); return !!e && e.getBoundingClientRect().height > 0; })()`));
                is(`${tag} typing a name follows in the header`, await raw(`(() => { const n = document.querySelector('#ph-body [data-k=name]'); n.value = 'Maren'; n.dispatchEvent(new Event('input', { bubbles: true })); return document.querySelector('[data-c=phname]').textContent; })()`), 'Maren');
                await click('#ph-body [data-act=rest][data-r=short]'); await closed(); await has('dialog#hb-dlg[open]'); await raw(`document.querySelector('#hb-dlg').close(); 1`);
                await click('[data-ph=menu]'); await has('#ph-body [data-act=custom]');
                await click('#ph-body [data-act=custom]'); await closed(); await has('dialog#hb-dlg[open]'); await click('[data-act=ctab][data-id=panels]'); await has('.hb-ptable');
                is(`${tag} Customise fits`, await raw(`document.querySelector('.hb-ptable').scrollWidth <= document.querySelector('.hb-ptable').clientWidth + 1`), true); await shot('customise', W, H);
                // moving a panel: the saved order counts from then on, on the phone too
                await raw(`(() => { const rows = [...document.querySelectorAll('.hb-ptable tr')], t = rows.findIndex((r) => r.textContent.includes('Death saves') || r.querySelector('input[aria-label="Title"]')?.value === 'Resources'); return 1; })()`);
                await raw(`document.querySelector('#hb-dlg [data-act=mv][data-d="1"]').click(); 1`); await sleep(60);
                await raw(`document.querySelector('#hb-dlg').close(); 1`); await sleep(60);
                await click('#ph-tabs [data-id=actions]');
                is(`${tag} once moved, the saved order`, await titles(), ['Actions', 'Passive abilities', 'Resources', 'Homebrew']);
                await click('#ph-tabs [data-id=main]');
                errs(tag);
            }

            // ---- on its side, tablets, the full layout, desktop ----
            await raw(`for (const [k, v] of [['width', 375], ['height', 812]]) Object.defineProperty(screen, k, { configurable: true, get: () => v }); 1`); // a phone's screen
            await size(812, 375); await sleep(200);
            is(`${name} landscape is phone mode`, await raw(`document.documentElement.classList.contains('ph-on')`), true);
            ok(`${name} landscape header on one line`, (await raw(`document.querySelector('#ph-head').offsetHeight`)) <= 62);
            is(`${name} landscape no sideways scroll`, await raw(`document.documentElement.scrollWidth <= innerWidth`), true); await shot('landscape', 812, 375);
            await raw(`delete screen.width; delete screen.height; 1`);
            await size(1000, 450); await sleep(200);
            is(`${name} a short desktop window stays desktop`, await raw(`document.documentElement.classList.contains('ph-on')`), false);
            await size(768, 1024); await sleep(200);
            is(`${name} a tablet keeps the desktop layout`, await J(`[document.documentElement.classList.contains('ph-on'), getComputedStyle(document.querySelector('#ph-head')).display, getComputedStyle(document.querySelector('#hb-bar')).position, !!document.querySelector('#hb-barin [data-act=custom]')]`), [false, 'none', 'sticky', true]);
            await size(375, 812); await sleep(200);
            await click('[data-ph=menu]'); await has('[data-ph-full]');
            await raw(`document.querySelector('[data-ph-full]').click(); 1`); await sleep(200);
            is(`${name} the full layout on a phone`, await J(`[document.documentElement.classList.contains('ph-on'), !!document.querySelector('#hb-barin [data-act=custom]'), document.querySelector('#ph-sheet').open]`), [false, true, false]);
            await click('#hb-barin [data-act=custom]'); await has('#hb-dlg[open] [data-ph-full]');
            await raw(`document.querySelector('[data-ph-full]').click(); 1`); await sleep(200);
            is(`${name} and back`, await raw(`document.documentElement.classList.contains('ph-on')`), true);
            await raw(`document.querySelector('dialog#hb-dlg').close(); 1`);
            await size(1280, 800); await sleep(200);
            is(`${name} desktop as before`, await J(`[document.documentElement.classList.contains('ph-on'), !!document.querySelector('.hb-tabs'), !!document.querySelector('.hb-top-abil'), getComputedStyle(document.querySelector('#ph-tabs')).display]`), [false, true, true, 'none']);
            errs('layouts');

            // ---- read only: archived, and someone else's public character ----
            await flush(); await home();
            { const d = await local(); d.chars[id].archived = Date.now(); await putLocal('hb-sheet', d); }
            await frame(`/characters/${id}`, 375, 812);
            await click('#ph-hp'); await has('#ph-body .ph-hpnow');
            ok(`${name} archived: no Damage`, await raw(`!document.querySelector('#ph-body .ph-dmg')`)); await click('#ph-sheet [data-ph=close]'); await closed();
            ok(`${name} archived: a strip says so, with Unarchive`, await raw(`!!document.querySelector('#ph-note [data-act=unarchive]')`));
            await click('[data-ph=menu]'); await has('#ph-body [data-act=unarchive]'); await shot('archived', 375, 812); await click('#ph-sheet [data-ph=close]'); await closed();
            const upWas = (await local()).chars[id].updated;
            await click('#ph-tabs [data-id=notes]');
            is(`${name} archived: a tab tap writes nothing`, (await local()).chars[id].updated, upWas);
            await click('#ph-tabs [data-id=main]'); await click('#ph-head [data-act=roll]');
            await b.until(`${F}.document.querySelector('.hb-rollcard')`, 15000);
            errs('archived');
            const pub = fillIn(JSON.parse(JSON.stringify(base)), { id: 'pubchar' + name, name: 'Someone Else', updated: 5000 });
            mkdirSync(join(ACCOUNTS, 'characters', pub.id), { recursive: true });
            writeFileSync(join(ACCOUNTS, 'characters', pub.id, 'character.json'), JSON.stringify(pub));
            writeFileSync(join(ACCOUNTS, 'characters', pub.id, 'meta.json'), JSON.stringify({ owner: '999', visibility: 'public', created: 1, campaigns: [], archived: 0 }));
            await home(); await frame(`/characters/${pub.id}`, 375, 812);
            is(`${name} public: read only`, await J(`[document.querySelector('[data-c=phname]').textContent, !!document.querySelector('#main[data-readonly]'), document.querySelector('.ph-rests') === null]`), ['Someone Else', true, true]);
            ok(`${name} public: a strip says read only`, (await raw(`document.querySelector('#ph-note').textContent`)).includes('read only'));
            await click('#ph-hp'); await has('#ph-body .ph-hpnow'); ok(`${name} public: no Damage`, await raw(`!document.querySelector('#ph-body .ph-dmg')`)); await click('#ph-sheet [data-ph=close]'); await closed();
            await click('#ph-tabs [data-id=notes]'); is(`${name} public: tabs work`, await raw(`document.querySelector('#ph-tabs .on').dataset.id`), 'notes');
            is(`${name} public: nothing kept here`, (await local()).chars[pub.id], undefined);
            errs('public');

            // ---- the Monster Sheet ----
            await home(); await b.ev(`localStorage.removeItem('monster-sheet'); 1`);
            await frame('/sheets/monster/', 375, 812);
            await click('[data-ph=menu]'); await has('#ph-body [data-act=new]');
            await flush(); await home();
            const mdb = await local('monster-sheet'), m0 = Object.values(mdb.chars)[0];
            const mon = (id, nm, cur, o = {}) => { const c = JSON.parse(JSON.stringify(m0)); return Object.assign(c, { id, name: nm, cr: '1/4', race: 'Small humanoid', updated: 1000, hp: { cur, base: cur, temp: 0, mod: 0 }, enc: '' }, o); };
            for (const W of [320, 375]) {
                const tag = `${name} ${W} monster`, shaman = mon('m3', 'Goblin Hedge-witch', 12);
                shaman.panels.find((p) => p.type === 'spells').rows = [row({ lvl: 0, name: 'Thorn Whip', school: '', time: 'Action', trig: '', range: '30 ft', comp: '', dur: '', conc: false, ritual: false, prep: false, mode: 'atk', save: 'DEX', dc: '', dmg: [{ dice: '1d6', type: 'Piercing' }], fx: [], desc: '', higher: '', srd: '' })];
                await home(); await putLocal('monster-sheet', { ...mdb, cur: 'm1', chars: { m1: mon('m1', 'Goblin 1', 7), m2: mon('m2', 'Goblin 2', 7), m3: shaman, m9: mon('m9', 'Old wolf', 11, { archived: 1 }) } });
                await frame('/sheets/monster/', W, W === 320 ? 568 : 812);
                is(`${tag} tabs hide what's empty`, await J(`[...document.querySelectorAll('#ph-tabs span')].map((e) => e.textContent)`), ['Main', 'Actions', 'Notes']);
                is(`${tag} no sideways scroll`, await raw(`document.documentElement.scrollWidth <= innerWidth`), true); is(`${tag} tap targets`, await J(TAP), []); await shot('monster', W, W === 320 ? 568 : 812);
                ok(`${tag} CR under the name`, (await raw(`document.querySelector('[data-c=phsub]').textContent`)).includes('CR 1/4'));
                await click('.ph-name'); await has('#ph-enc:not([hidden]) #mon-side .mon-item'); await sleep(250); is(`${tag} encounter sheet tap targets`, await J(TAP), []); await shot('encounter', W, W === 320 ? 568 : 812);
                ok(`${tag} the list and difficulty are in the sheet`, await raw(`document.querySelector('#ph-sheet #mon-side .mon-diff') && document.querySelectorAll('#ph-sheet #mon-side .mon-list .mon-item').length >= 3`));
                await raw(`document.querySelector('#ph-sheet .mon-arch').open = true; 1`);
                await click('#ph-sheet [data-act=monunarc]');
                ok(`${tag} an archived monster can come back on a phone`, (await local('monster-sheet')).chars.m9.archived === 0);
                await click('#ph-sheet .mon-item[data-id=m3]'); await closed(); await sleep(80);
                is(`${tag} monster opened`, await raw(`document.querySelector('[data-c=phname]').textContent`), 'Goblin Hedge-witch');
                is(`${tag} a monster with spells gets the tab`, await J(`[...document.querySelectorAll('#ph-tabs span')].map((e) => e.textContent)`), ['Main', 'Actions', 'Spells', 'Notes']);
                await click('#ph-tabs [data-id=spells]'); ok(`${tag} its spell rolls on the line`, await raw(`!!document.querySelector('.ph-rowq .hb-rollbtn')`));
                const stepOk = await J(`[...document.querySelectorAll('#ph-head [data-act=side]')].length`);
                ok(`${tag} step buttons`, stepOk >= 1);
                await click('#ph-head [aria-label="Previous monster"]'); is(`${tag} each monster has its own tab`, await raw(`document.querySelector('#ph-tabs .on').dataset.id`), 'main');
                await click('#ph-hp'); await has('#hb-amt');
                await raw(`document.querySelector('#hb-amt').value = '3'; document.querySelector('.ph-hpform [value=dmg]').click(); 1`); await closed(); await sleep(100);
                await has('.toasts .hb-undo'); await click('.toasts .hb-undo button'); await sleep(60);
                await click('.hb-dicebtn'); await has('#ph-body .ph-dice'); await click('[data-act=advnext][data-v=dis]'); await click('#ph-sheet [data-ph=close]'); await closed();
                await click('#ph-head [data-act=roll]'); await b.until(`${F}.document.querySelector('.hb-rollcard b') && ${F}.document.querySelector('.hb-rollcard b').textContent.includes('disadvantage')`, 15000);
                await click('.hb-rollcard');
                await raw(`document.querySelector('#ph-head [data-act=roll]').dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'touch', bubbles: true, clientX: 200, clientY: 80 })); 1`);
                await has('#hb-adv:not([hidden])'); await raw(`document.querySelector('#ph-head [data-act=roll]').dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); 1`);
                await click('#hb-adv [data-a=dis]'); await b.until(`${F}.document.querySelector('.hb-rollcard b') && ${F}.document.querySelector('.hb-rollcard b').textContent.includes('disadvantage')`, 15000);
                await click('.hb-rollcard');
                await click('[data-ph=menu]'); await has('#ph-body [data-act=dup]'); await sleep(250); is(`${tag} menu tap targets`, await J(TAP), []); await shot('monster-menu', W, W === 320 ? 568 : 812);
                for (const s of ['a[href="/"]', '[data-act=dup]', '[data-act=find]', '[data-act=encto]', '[data-act=export]', '[data-act=archive]', '[data-act=custom]', '.mon-credit']) ok(`${tag} menu has ${s}`, await raw(`!!document.querySelector('#ph-body ${s.replace(/"/g, '\\"')}')`));
                await click('#ph-sheet [data-ph=close]'); await closed();
                errs(tag);
                // out of phone mode: the sidebar is back where it was
                await size(1280, 800); await sleep(200);
                is(`${tag} sidebar back on a wide screen`, await J(`[getComputedStyle(document.querySelector('#mon-side')).display, document.querySelector('#mon-side').parentNode.className, document.documentElement.classList.contains('ph-on')]`), ['block', 'mon-wrap', false]);
                await size(W, 812); await sleep(200);
                is(`${tag} and into the sheet again`, await raw(`document.querySelector('#mon-side').parentNode.id`), 'ph-enc');
                errs(tag + ' resize');
            }

            // ---- player data, signed in ----
            const acct = (i) => { try { return JSON.parse(readFileSync(join(ACCOUNTS, 'characters', i, 'character.json'), 'utf8')); } catch { return null; } };
            const until = async (fn, want, ms = 8000) => { const t = Date.now(); let v; while (Date.now() - t < ms) { v = await fn(); if (want(v)) return v; await sleep(100); } return v; };
            const post = (url, c) => raw(`fetch(${JSON.stringify(url)}, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: ${JSON.stringify(JSON.stringify(c))} }).then((r) => r.status)`);
            const pid = 'phonedata' + name, pc = fillIn(JSON.parse(JSON.stringify(base)), { id: pid, name: 'Signed Out Me', updated: 2000 });
            // a character made signed out goes up at sign-in
            await home(); await b.ev(`localStorage.clear(); localStorage.setItem('hb-sheet-merged', '1'); 1`);
            await putLocal('hb-sheet', { cur: pid, chars: { [pid]: pc } });
            await frame(`/characters/${pid}`, 375, 812);
            await home(); await b.ev(`document.cookie = 'dndsid=${SID}; path=/'; 1`);
            await frame(`/characters/${pid}`, 375, 812);
            is(`${name} survives sign-in: uploaded`, (await until(() => acct(pid), (c) => c)).name, 'Signed Out Me');
            await sleep(200);
            const up0 = acct(pid).updated;
            // Q109: looking around never changes "updated"
            const stamp = async () => (await local()).chars[pid].updated;
            const s0 = await stamp();
            for (const k of ['actions', 'spells', 'items', 'notes', 'main']) await click(`#ph-tabs [data-id=${k}]`);
            await click('#ph-tabs [data-id=actions]'); await click('#hb-sheet .stabs [data-act=sub]:not(.on)');
            await click('#ph-tabs [data-id=notes]'); await click('#hb-sheet [data-act=nopen]');
            await sleep(400); await flush();
            is(`${name} phone tabs, sub-tabs and notes change nothing`, [await stamp(), acct(pid).updated], [s0, up0]);
            await size(1280, 800); await sleep(200);
            await click('.hb-tabs [data-act=tab]:not(.on)'); await click('.hb-tabs [data-act=tab]:not(.on)');
            await sleep(400); await flush();
            is(`${name} desktop tabs change nothing`, [await stamp(), acct(pid).updated], [s0, up0]);
            is(`${name} the last tab is kept, in view`, typeof (await local()).chars[pid].view.phoneTab, 'string');
            await size(375, 812); await sleep(200);

            // Q110: a stale copy comes back: the newer account copy wins and nothing goes over it
            await click('#ph-tabs [data-id=main]');
            await hide();
            const newer = { ...acct(pid), name: 'Edited On Laptop', updated: Date.now() + 1000 };
            is(`${name} another device saves`, await post('/sheets/player/cloud.php', newer), 200);
            // a tab tap on the stale copy, still out of date: its upload can't win
            await click('#ph-tabs [data-id=items]'); await flush();
            is(`${name} a stale copy's tab tap doesn't overwrite`, [acct(pid).name, acct(pid).updated], ['Edited On Laptop', newer.updated]);
            await click('#ph-head [data-act=roll]'); await until(() => stamp().then(() => raw(`document.querySelectorAll('.hb-rollcard').length`)), (n) => n > 0, 15000);
            const rolled = (await local()).chars[pid].rolls.length;
            await back();
            await until(() => raw(`document.querySelector('[data-c=phname]').textContent`), (t) => t === 'Edited On Laptop');
            is(`${name} returning takes the newer copy`, [await raw(`document.querySelector('[data-c=phname]').textContent`), (await local()).chars[pid].name, (await local()).chars[pid].updated], ['Edited On Laptop', 'Edited On Laptop', newer.updated]);
            is(`${name} and stays on its tab`, await raw(`document.querySelector('#ph-tabs .on').dataset.id`), 'items');
            is(`${name} a roll made here isn't lost`, (await local()).chars[pid].rolls.length, rolled);
            await flush();
            is(`${name} the account still has the newer copy`, acct(pid).name, 'Edited On Laptop');
            // nothing newer: returning changes nothing
            await hide(); await back(); await sleep(500);
            is(`${name} returning with nothing newer`, (await local()).chars[pid].updated, newer.updated);
            // an edit in the moment before the check comes back: it's on an older copy, so the account's stays and Undo can bring it back
            await hide();
            const newer2 = { ...acct(pid), name: 'Laptop Again', updated: Date.now() + 2000 };
            await post('/sheets/player/cloud.php', newer2);
            await sleep(2100);
            await raw(`(() => { window.__vis = 'visible'; document.dispatchEvent(new Event('visibilitychange')); document.querySelector('#ph-tabs [data-id=main]').click(); return 1; })()`);
            await raw(`(() => { const h = document.querySelector('[data-ph=menu]'); h.click(); const n = document.querySelector('#ph-body [data-k=name]'); n.value = 'Phone Typed Late'; n.dispatchEvent(new Event('input', { bubbles: true })); dispatchEvent(new Event('pagehide')); return 1; })()`);
            await until(() => local().then((d) => d.chars[pid].name), (t) => t === 'Laptop Again');
            await sleep(500);
            is(`${name} an edit on a stale copy doesn't overwrite`, [(await local()).chars[pid].name, acct(pid).name], ['Laptop Again', 'Laptop Again']);
            await has('.toasts .hb-undo button'); await raw(`[...document.querySelectorAll('.toasts .hb-undo button')].pop().click(); 1`); await sleep(200); await flush();
            is(`${name} Undo keeps this copy's edit, as a new edit`, [(await local()).chars[pid].name, await until(() => Promise.resolve(acct(pid).name), (t) => t === 'Phone Typed Late')], ['Phone Typed Late', 'Phone Typed Late']);
            await raw(`document.querySelector('#ph-sheet').open && document.querySelector('#ph-sheet [data-ph=close]').click(); 1`); await sleep(100);
            errs('stale copy');
            // signed in on a new browser, it comes back; an edit there wins here on load (newest "updated")
            const b2 = await launch(name);
            try {
                await b2.block(/backup\.php|prefs\.php/);
                await b2.go(BASE + '/privacy/');
                await b2.ev(`document.cookie = 'dndsid=${SID}; path=/'; 1`);
                await b2.go(`${BASE}/characters/${pid}`);
                await b2.until(`document.querySelector('.hb-top-abil, #hb-sheet .card')`);
                is(`${name} a new browser gets it back`, await b2.ev(`document.querySelector('[data-k=name]')?.value || document.querySelector('#hb-sheet')?.innerText.slice(0, 200) || ''`), 'Phone Typed Late');
                await sleep(300);
            } finally { b2.close(); }
            await flush(); await home();
            const onLaptop = { ...acct(pid), name: 'Edited Elsewhere', updated: Date.now() + 5000 };
            await frame(`/characters/${pid}`, 375, 812);
            await post('/sheets/player/cloud.php', onLaptop);
            await home(); await frame(`/characters/${pid}`, 375, 812);
            is(`${name} an edit on another device wins on load`, await until(() => raw(`document.querySelector('[data-c=phname]').textContent`), (t) => t === 'Edited Elsewhere'), 'Edited Elsewhere');
            errs('another device');

            // the Monster Sheet: the same, against its own saves
            const macct = (i) => { try { return JSON.parse(readFileSync(join(ACCOUNTS, 'monsters', SUB, i + '.json'), 'utf8')); } catch { return null; } };
            await home(); await putLocal('monster-sheet', { ...mdb, cur: 'mz', chars: { mz: mon('mz', 'Signed In Goblin', 7, { updated: 3000 }) } });
            await frame('/sheets/monster/', 375, 812);
            is(`${name} monster uploaded`, (await until(() => macct('mz'), (c) => c)).name, 'Signed In Goblin');
            await sleep(200);
            const mstamp = async () => (await local('monster-sheet')).chars.mz.updated, ms0 = await mstamp();
            await click('#ph-tabs [data-id=actions]'); await click('#ph-tabs [data-id=notes]'); await click('#ph-tabs [data-id=main]');
            await click('#ph-head [data-act=roll]'); await b.until(`${F}.document.querySelector('.hb-rollcard')`, 15000);
            await sleep(400); await flush();
            is(`${name} monster tabs and rolls don't stamp`, [await mstamp(), macct('mz').updated], [ms0, ms0]);
            await hide();
            const mnew = { ...macct('mz'), name: 'Goblin From Laptop', updated: Date.now() + 1000 };
            is(`${name} monster: another device saves`, await post('/sheets/monster/cloud.php', mnew), 200);
            await click('#ph-tabs [data-id=actions]'); await flush();
            await back();
            is(`${name} monster: returning takes the newer copy`, await until(() => raw(`document.querySelector('[data-c=phname]').textContent`), (t) => t === 'Goblin From Laptop'), 'Goblin From Laptop');
            await flush();
            is(`${name} monster: the account keeps it`, macct('mz').name, 'Goblin From Laptop');
            errs('monster data');
        } finally { b.close(); }
    }
} finally { web.kill(); rmSync(TMP, { recursive: true, force: true }); }
if (bad) { console.log(`${bad} failed`); process.exit(1); }
console.log('phone mode ok');
process.exit(0);
