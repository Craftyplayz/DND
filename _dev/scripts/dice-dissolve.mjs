// The Ember Cage's Dissolve animation (extras/ember/anims/45.js) is listed for nat 1, nat 20 and other rolls on the Dice Sets
// page, and trying each plays without console errors, in headless Chrome and Firefox. Ends with "dice dissolve ok".
//   node _dev/scripts/dice-dissolve.mjs [base URL, default http://localhost:8110]
import { launch } from './browser.mjs';

const BASE = process.argv[2] || 'http://localhost:8110', KEYS = ['a45-dissolve-1', 'a45-dissolve-20', 'a45-dissolve'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let bad = 0;
for (const name of ['chrome', 'firefox']) {
    const b = await launch(name);
    try {
        await b.block(/backup\.php|cloud\.php|prefs\.php/);
        await b.go(BASE + '/dice/'); await sleep(1500);
        await b.ev(`document.querySelector('[data-set="ember"]').click()`); await sleep(2500);
        for (const k of KEYS) {
            const found = await b.ev(`(() => { const t = document.querySelector('[data-xkey="${k}"]'); if (!t) return false; t.click(); return true; })()`);
            if (!found) { bad++; console.log(`FAIL ${name}: no Try button for ${k}`); continue; }
            await sleep(6000);
        }
        const errors = b.errors.filter((e) => !/backup\.php|cloud\.php|prefs\.php/.test(e));
        if (errors.length) { bad++; console.log(`FAIL ${name}\n  ` + errors.slice(0, 8).join('\n  ').slice(0, 1200)); }
        else console.log(`${name}: ${KEYS.length} dissolves tried`);
    } finally { b.close(); }
}
console.log(bad ? `${bad} failure(s)` : 'dice dissolve ok');
process.exit(bad ? 1 : 0);
