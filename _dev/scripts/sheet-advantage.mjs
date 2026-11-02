// Right-click (or press and hold on a touch screen) a d20 roll on the test sheet: a menu offers Advantage roll and Disadvantage roll,
// which throw two d20s and keep the higher or lower. A plain click still rolls one d20. Headless Chrome and Firefox.
// Ends with "sheet advantage ok".
//   node _dev/scripts/sheet-advantage.mjs [base URL, default http://localhost:8110]
import { launch } from './browser.mjs';

const BASE = process.argv[2] || 'http://localhost:8110';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// the roll card once it shows: { title, expr, shown, total }
const CARD = `(() => { const c = document.querySelector('#hb-rolls .hb-rollcard'); if (!c) return '';
    return JSON.stringify({ title: c.querySelector('b').textContent, expr: c.querySelector('small').textContent, shown: c.querySelector('.hb-rolldice').textContent, total: +c.querySelector('.hb-rolltot').textContent }); })()`;
const at = (sel) => `const b = document.querySelector('${sel}'), r = b.getBoundingClientRect(), o = { bubbles: true, cancelable: true, clientX: r.left + 4, clientY: r.top + 4 };`;

let bad = 0;
const fail = (name, m) => { bad++; console.log(`FAIL ${name}: ${m}`); };
for (const name of ['chrome', 'firefox']) {
    const b = await launch(name);
    try {
        await b.block(/backup\.php|cloud\.php|prefs\.php/);
        await b.go(BASE + '/sheets/player-dev/'); await sleep(1500);
        // results straight away: headless Chrome stalls on the thrown 3D dice (the live sheet too)
        await b.ev(`document.querySelector('[data-act="custom"]').click()`); await sleep(300);
        await b.ev(`document.querySelector('[data-k="view.noAnim"]').click()`);
        await b.ev(`document.querySelector('dialog [data-act="close"]').click()`); await sleep(1000);
        const card = async () => { for (let i = 0; i < 60; i++) { const c = await b.ev(CARD); if (c) return JSON.parse(c); await sleep(250); } return null; };
        const clear = () => b.ev(`document.querySelector('#hb-rolls').innerHTML = ''`);
        const menuOpen = () => b.ev(`!document.querySelector('#hb-adv').hidden`);

        for (const [a, label, keep] of [['adv', 'advantage', Math.max], ['dis', 'disadvantage', Math.min]]) {
            await clear();
            await b.ev(`(() => { ${at('.hb-d20')} b.dispatchEvent(new MouseEvent('contextmenu', o)); })()`);
            if (!await menuOpen()) { fail(name, 'right-click on a skill did not open the menu'); continue; }
            await b.ev(`document.querySelector('#hb-adv [data-a="${a}"]').click()`);
            if (await menuOpen()) fail(name, 'the menu stayed open after choosing');
            const c = await card();
            if (!c) { fail(name, `no roll card for ${label}`); continue; }
            const [d1, d2, mod] = c.shown.replace(/−\s*/, '-').match(/-?\d+/g).map(Number).concat(0);
            const want = keep(d1, d2) + (/[+−]/.test(c.shown) ? mod : 0);
            if (!c.title.endsWith('with ' + label) || !c.expr.startsWith('2d20 keep') || c.total !== want || d1 < 1 || d1 > 20 || d2 < 1 || d2 > 20)
                fail(name, `${label} card is wrong: ${JSON.stringify(c)}`);
            else console.log(`${name}: ${label} ${c.shown} = ${c.total}`);
            const log = await b.ev(`JSON.parse(localStorage.getItem('hb-sheet-dev')).chars[JSON.parse(localStorage.getItem('hb-sheet-dev')).cur].rolls[0].title`);
            if (!String(log).endsWith('with ' + label)) fail(name, `roll log has "${log}"`);
        }

        // a plain click still rolls one d20
        await clear();
        await b.ev(`document.querySelector('.hb-d20').click()`);
        const p = await card();
        if (!p || !p.expr.startsWith('1d20') || /with/.test(p.title)) fail(name, `plain click: ${JSON.stringify(p)}`);

        // press and hold on a touch screen opens the menu and doesn't roll
        await clear();
        await b.ev(`(() => { ${at('.hb-d20')} b.dispatchEvent(new PointerEvent('pointerdown', { ...o, pointerType: 'touch' })); })()`);
        // the menu opens after 0.5 s; headless Chrome sometimes runs that timer late, so wait for it rather than a fixed time
        for (let i = 0; i < 20 && !await menuOpen(); i++) await sleep(100);
        await b.ev(`(() => { ${at('.hb-d20')} b.dispatchEvent(new PointerEvent('pointerup', { ...o, pointerType: 'touch' })); b.click(); })()`);
        await sleep(500);
        if (!await menuOpen()) fail(name, 'press and hold did not open the menu');
        if (await b.ev(CARD)) fail(name, 'press and hold also rolled');
        // Escape closes it
        await b.ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
        if (await menuOpen()) fail(name, 'Escape did not close the menu');

        const errors = b.errors.filter((e) => !/backup\.php|cloud\.php|prefs\.php/.test(e));
        if (errors.length) fail(name, errors.slice(0, 5).join('\n  '));
    } finally { b.close(); }
}
console.log(bad ? `${bad} failure(s)` : 'sheet advantage ok');
process.exit(bad ? 1 : 0);
