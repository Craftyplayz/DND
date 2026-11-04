// Checks check-all.mjs's job planning: every check in _dev/scripts is in the plan in both browsers, and no two jobs share a
// port (servers, relays) or a temp folder, even with busy ports in the way.
//   node _dev/scripts/check-all.test.js
'use strict';
const fs = require('node:fs'), path = require('node:path');
let bad = 0;
const ok = (name, cond, got = '') => { if (!cond) { bad++; console.log(`FAIL ${name} ${got}`); } };

(async () => {
    const { jobs, plan, FLAKE } = await import('./check-all.mjs');
    const files = fs.readdirSync(__dirname).sort();
    const { list, unknown } = jobs(files, { data: 'http://localhost:8291' });
    ok('every .mjs is a known check or helper', unknown.length === 0, unknown.join());
    for (const f of files.filter((f) => /\.test\.(js|php)$/.test(f))) ok(`${f} is a job`, list.some((j) => j.cmd.includes(f)));
    for (const name of ['pages-ok', 'characters-page', 'versions-archive', 'initiative-page', 'sheet-keeps-data'])
        ok(`${name} runs in both browsers`, ['chrome', 'firefox'].every((b) => list.some((j) => j.name === name && j.browser === b)));
    ok('live-page drives both browsers at once', list.some((j) => j.name === 'live-page' && j.browser === 'both'));
    ok('no --data, no sheet-keeps-data', !jobs(files).list.some((j) => j.name === 'sheet-keeps-data'));

    for (const [label, opts] of [['default range', {}], ['busy ports skipped', { busy: new Set([8300, 8301, 8310, 8320, 8331]) }], ['tight range', { lo: 8200, hi: 8285 }]]) {
        const p = plan(list, opts), ports = new Map(), folders = new Map();
        for (const j of p) for (const port of j.used) {
            ok(`${label}: port ${port} used once (${j.id})`, !ports.has(port), `also ${ports.get(port)}`); ports.set(port, j.id);
            ok(`${label}: ${port} not busy`, !(opts.busy || new Set()).has(port));
        }
        for (const j of p) for (const f of j.folders) { ok(`${label}: folder ${f} used once`, !folders.has(f), `${j.id} and ${folders.get(f)}`); folders.set(f, j.id); }
        for (const j of p) {
            ok(`${label}: ${j.id} ports in range`, j.used.every((x) => x >= (opts.lo || 8300) && x <= (opts.hi || 8399)), j.used.join());
            ok(`${label}: ${j.id} ports are its bases shifted`, j.used.every((x, i) => x === (j.url ? [8110, ...j.ports] : j.ports)[i] + j.shift));
            if (j.url) ok(`${label}: ${j.id} has its own server`, j.port === 8110 + j.shift);
        }
        ok(`${label}: shifts unique`, new Set(p.map((j) => j.shift)).size === p.length);
    }
    let threw = false; try { plan(list, { lo: 8300, hi: 8310 }); } catch { threw = true; }
    ok('too small a range says so', threw);

    ok('flake: Firefox lost its first tab', FLAKE.test('Error: browsingContext.navigate: BrowsingContext does no longer exist'));
    ok('flake: connection refused', FLAKE.test('TypeError: fetch failed ... ECONNREFUSED'));
    ok('not a flake: a failed check', !FLAKE.test('FAIL chrome search Fireball: got [], want ["Fireball"]'));

    console.log(bad ? `${bad} check(s) failed` : 'check-all plan ok');
    process.exit(bad ? 1 : 0);
})();
