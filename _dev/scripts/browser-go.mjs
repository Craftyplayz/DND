// browser.mjs's go() must only come back once the new page is there, even when the old page changes its own URL meanwhile (the
// Compendium's search does, 80 ms after a key). Firefox's own "wait until complete" answered at that replaceState, with the old page still up.
// Ends with "browser go ok".
//   node _dev/scripts/browser-go.mjs [base URL, default http://localhost:8110]
import { launch, browsers } from './browser.mjs';

const BASE = process.argv[2] || 'http://localhost:8110';
let bad = 0;
for (const name of browsers) {
    const b = await launch(name);
    try {
        for (let i = 0; i < 10; i++) {
            await b.go(BASE + '/privacy/?old');
            await b.ev(`window.__old = true; setInterval(() => history.replaceState(null, '', '/privacy/?old=' + Date.now()), 2); 0`);
            await b.go(BASE + '/privacy/?new');
            const got = await b.ev(`JSON.stringify([!!window.__old, location.search, document.readyState])`);
            if (got !== JSON.stringify([false, '?new', 'complete'])) { bad++; console.log(`FAIL ${name} go ${i} came back early: ${got}`); }
        }
    } finally { b.close(); }
}
console.log(bad ? `${bad} failed` : 'browser go ok');
process.exit(bad ? 1 : 0);
