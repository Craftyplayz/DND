// Dice Sets folds (ROADMAP 2.2): every section is one row showing the current pick, one section open at a time (Dice set at first),
// the rows follow the picks, and the sets' own extras (Trail, nat animations and sounds) still appear only for a set that has them.
//   node _dev/scripts/dice-folds.mjs [base URL, default http://localhost:8110]
import { launch, browsers } from './browser.mjs';

const BASE = process.argv[2] || 'http://localhost:8110';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
const is = (name, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) { bad++; console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); } };
const open = `[...document.querySelectorAll('.dd-fold')].filter((f) => !f.querySelector('.dd-body').hidden).map((f) => f.querySelector('.dd-body').id).join()`;
const val = (id) => `document.querySelector('#dd-f-${id}').closest('.dd-fold').querySelector('.dd-val').textContent`;
const click = (b, sel) => b.ev(`(document.querySelector(${JSON.stringify(sel)}).click(), 1)`);

for (const name of browsers) {
    const b = await launch(name);
    try {
        for (const w of [375, 1440]) {
            await b.shot(w, 800);
            await b.go(BASE + '/dice/'); await b.ev(`localStorage.clear()`); await b.go(BASE + '/dice/');
            await b.until(`document.querySelector('#dd-f-sound .dd-pick')`, 15000);
            const t = `${name} ${w}`;
            is(`${t}: Dice set starts open, alone`, await b.ev(open), 'dd-f-set');
            is(`${t}: the roll bar is still the page's top bar`, await b.ev(`getComputedStyle(document.querySelector('.dd-bar')).position`), 'sticky');
            is(`${t}: Dice set row shows the pick`, await b.ev(val('set')), 'Ember Cage');
            is(`${t}: Sound row shows the pick`, await b.ev(val('sound')), 'Ember Cage’s own sound');
            await click(b, '[aria-controls=dd-f-coin]');
            is(`${t}: opening Coin closes Dice set`, await b.ev(open), 'dd-f-coin');
            await click(b, '[aria-controls=dd-f-sound]');
            is(`${t}: opening Sound closes Coin`, await b.ev(open), 'dd-f-sound');
            await click(b, '[aria-controls=dd-f-sound]');
            is(`${t}: tapping the open row closes it`, await b.ev(open), '');
            is(`${t}: aria-expanded follows`, await b.ev(`document.querySelectorAll('.dd-fbtn[aria-expanded=true]').length`), 0);
            // a pick, with the row following it (the page's own click handler also works on a closed section)
            await click(b, '[data-set=frost]');
            await b.until(`${val('set')} === 'Frostbound'`, 5000);
            is(`${t}: Dice set row follows a pick`, await b.ev(val('set')), 'Frostbound');
            is(`${t}: the set's own sound row follows the set`, await b.until(`${val('sound')} === 'Frostbound’s own sound' || ${val('sound')}`, 5000).then(() => b.ev(val('sound'))), 'Frostbound’s own sound');
            await click(b, '[data-coin=gold-new]');
            is(`${t}: Coin row follows a pick`, await b.ev(val('coin')), 'Gold');
            is(`${t}: Trail starts at None`, await b.ev(val('trail')), 'None');
            // a classic plain style has no extras: their rows disappear, and come back with a set that has them
            await click(b, '[data-set=purple]');
            await b.until(`document.querySelector('#dd-extras').hidden`, 5000);
            is(`${t}: a plain style hides the extras`, await b.ev(`document.querySelector('#dd-extras').hidden && document.querySelector('#dd-nats').hidden`), true);
            await click(b, '[data-set=ember]');
            await b.until(`!document.querySelector('#dd-extras').hidden`, 5000);
            is(`${t}: Ember Cage shows its extras`, await b.ev(`!document.querySelector('#dd-extras').hidden && !document.querySelector('#dd-nats').hidden`), true);
            // the picks are kept, the open row is not
            await click(b, '[aria-controls=dd-f-coinsnd]');
            await b.go(BASE + '/dice/');
            await b.until(`${val('set')} === 'Ember Cage'`, 15000);
            is(`${t}: after a reload Dice set is open again`, await b.ev(open), 'dd-f-set');
            is(`${t}: the coin pick was kept`, await b.until(`${val('coin')} === 'Gold'`, 5000).then(() => b.ev(val('coin'))), 'Gold');
            is(`${t}: no console errors`, b.errors.filter((e) => !/prefs\.php|cloud\.php|backup\.php/.test(e)), []);
        }
    } finally { b.close(); }
}
console.log(bad ? `${bad} dice fold check(s) failed` : 'dice folds ok');
process.exit(bad ? 1 : 0);
