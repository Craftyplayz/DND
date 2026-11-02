// Checks the sheets load srd-build.json (hbSrd), fall back when it's blocked, and show the SRD credit in the footer.
//   node _dev/scripts/srd-load.mjs [base URL, default http://localhost:8110]   (server with _dev/router.php)
import { launch } from './browser.mjs';
const BASE = process.argv[2] || 'http://localhost:8110';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let bad = 0;
const is = (n, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) { bad++; console.log(`FAIL ${n}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); } };
const chr = { id: 'aaa', name: 'Lock', race: '', updated: 1, art: '', classes: [{ name: '', level: 1, die: 8, hdUsed: 0 }], abilities: [] };
for (const name of ['chrome', 'firefox']) {
    const b = await launch(name);
    try {
        for (const url of ['/characters/aaa', '/sheets/monster/']) {
            await b.go(BASE + '/privacy/');
            await b.ev(`localStorage.setItem('hb-sheet', ${JSON.stringify(JSON.stringify({ cur: 'aaa', chars: { aaa: chr } }))}); 0`);
            await b.go(BASE + url); await sleep(2500);
            is(`${name} ${url} classes`, await b.ev(`window.hbSrd().then((d) => { window.__n = d ? Object.keys(d.classes).length : -1; }), 0`), 0);
            await sleep(500);
            is(`${name} ${url} loaded`, await b.ev('window.__n'), 12);
            is(`${name} ${url} errors`, b.errors.filter((e) => !/backup\.php|cloud\.php/.test(e)), []);
        }
        await b.go(BASE + '/privacy/');
        is(`${name} footer`, await b.ev(`document.querySelector('.site-footer').textContent.includes('CC-BY-4.0')`), true);
        // blocked: the sheet still opens, hbSrd gives null
        b.block(/srd-build\.json/);
        await b.go(BASE + '/characters/aaa'); await sleep(2500);
        await b.ev(`window.hbSrd().then((d) => { window.__n = d === null ? 'null' : 'data'; }), 0`); await sleep(500);
        is(`${name} offline`, await b.ev('window.__n'), 'null');
    } finally { b.close(); }
}
console.log(bad ? `${bad} failed` : 'srd load ok');
process.exit(bad ? 1 : 0);
