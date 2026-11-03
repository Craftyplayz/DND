// Opens every page of the site (each folder with an index.php or index.html, private/ left out) in headless Chrome
// and headless Firefox and lists the console errors each one shows. Ends with "pages ok" when there are none.
//   node _dev/scripts/pages-ok.mjs [base URL, default http://localhost:8110]
// Backups and cloud saves are blocked, so nothing is written anywhere.
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { launch, browsers } from './browser.mjs';

const BASE = process.argv[2] || 'http://localhost:8110', ROOT = join(import.meta.dirname, '../..');
const SKIP = new Set(['private', '_dev', 'assets', 'node_modules']);
const pages = (dir = '') => [
    ...(['index.php', 'index.html'].some((f) => existsSync(join(ROOT, dir, f))) ? ['/' + dir] : []),
    ...readdirSync(join(ROOT, dir), { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith('.') && !SKIP.has(d.name)).flatMap((d) => pages(dir + d.name + '/')),
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let bad = 0;
for (const name of browsers) {
    const b = await launch(name);
    try {
        await b.block(/backup\.php|cloud\.php/);
        for (const path of pages()) {
            const status = await fetch(BASE + path).then(async (r) => (await r.arrayBuffer(), r.status),(e) => e.cause?.code || e.message);
            if (status !== 200) { bad++; console.log(`FAIL ${name} ${path}: ${status}`); continue; }
            // kept: a fixed time to watch for late console errors (scripts that run after load); no page state says "no more errors"
            await b.go(BASE + path); await sleep(1500);
            // the blocked saves show up as failed loads; they're this script's doing, not the page's
            const errors = b.errors.filter((e) => !/backup\.php|cloud\.php/.test(e));
            if (errors.length) { bad++; console.log(`FAIL ${name} ${path}\n  ` + errors.slice(0, 8).join('\n  ').slice(0, 1200)); }
        }
        console.log(`${name}: ${pages().length} pages checked`);
    } finally { b.close(); }
}
console.log(bad ? `${bad} page(s) failed to load or had console errors` : 'pages ok');
process.exit(bad ? 1 : 0);
