// The whole check suite in one command: every *.test.js, every *.test.php and every browser check in headless Chrome and
// Firefox, run side by side. Ends with a table and "all checks ok" or "N checks failed".
//   node _dev/scripts/check-all.mjs [--only pages-ok,art-sync] [--data <old URL>] [--jobs N] [--ports 8300-8499]
//   --only    just these checks (script names without .mjs/.test.js/.test.php)
//   --data    also run sheet-keeps-data.mjs against that old URL (the live code), in both browsers
//   --jobs    how many checks at once (default: half the logical CPUs; each browser check is a browser, a PHP server and
//             often a relay, and at the full count the relays' timings got flaky)
//   --ports   the range the servers and relays use (default 8300-8499); ports already in use are skipped
// Every job gets its own CHECK_PORT_SHIFT (so its servers, relays and temp folders are its own) and, when the script takes a
// base URL, its own PHP server with its own backups, accounts and sessions folders, so nothing a check writes reaches
// private/dnd/ and no two checks share a port or a folder. Every browser gets a debugging port of its own from the system
// (browser.mjs, CHECK_CHROME_PORT/CHECK_FIREFOX_PORT unset), so two browsers can never meet on one, even one just closed.
// A known start-up flake gets exactly one retry, shown as "passed on retry".
import { spawn, execSync } from 'node:child_process';
import { readdirSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { join, basename } from 'node:path';
import { tmpdir, availableParallelism } from 'node:os';
import { createServer } from 'node:net';

const ROOT = join(import.meta.dirname, '../..'), DIR = join(ROOT, '_dev/scripts');
const PHP = process.env.PHP || (process.platform === 'win32' ? 'C:/php/php.exe' : 'php');

// Browser checks. url: takes a base URL (check-all serves one); ports: the script's own server/relay ports before the shift;
// tmp: the temp folder it names after CHECK_PORT_SHIFT; split: run once per browser (CHECK_BROWSER, or the flag);
// both: drives Chrome and Firefox together in one run. secs: about how long it takes, so the slow ones start first.
export const BROWSER_CHECKS = {
    'pages-ok': { url: true, split: true, secs: 70 },
    'characters-page': { url: true, split: true, tmp: 'dnd-accounts-check', secs: 30 },
    compendium: { url: true, split: true, secs: 90 },
    'dice-dissolve': { url: true, split: true, secs: 30 },
    'sheet-advantage': { url: true, split: true, secs: 15 },
    'srd-load': { url: true, split: true, secs: 20 },
    'theme-recolour': { url: true, split: true, secs: 60 },
    'campaigns-page': { ports: [8114], split: true, tmp: 'dnd-campaigns-check', secs: 60 },
    'art-sync': { ports: [8119], split: true, tmp: 'dnd-art-check', secs: 40 },
    'versions-archive': { ports: [8121], split: true, tmp: 'dnd-versions-check', secs: 120 },
    'initiative-page': { ports: [8122, 8097], split: 'flag', tmp: 'dnd-fight-check', secs: 90 },
    'monster-encounters': { ports: [8123], split: true, tmp: 'dnd-encounters-check', secs: 60 },
    'maps-page': { ports: [8127, 8101], split: 'flag', tmp: 'dnd-maps-check', secs: 90 },
    'table-page': { ports: [8128, 8102], split: 'flag', tmp: 'dnd-tv-check', secs: 120 },
    'live-page': { ports: [8118, 8098], both: true, tmp: 'dnd-live-check', secs: 45 },
    'table-log': { ports: [8120, 8099], both: true, tmp: 'dnd-table-check', secs: 70 },
    'handouts-page': { ports: [8124, 8093], split: true, tmp: 'dnd-handouts-check', secs: 60 },
    'dm-edits': { ports: [8126, 8092], split: 'flag', tmp: 'dnd-dmedit-check', secs: 150 },
    'builder-page': { ports: [8129], split: true, tmp: 'dnd-builder-check', secs: 300 },
    'sources-page': { ports: [8131], split: true, tmp: 'dnd-sources-check', secs: 60 },
    'homebrew-page': { ports: [8130], split: true, tmp: 'dnd-homebrew-check', secs: 40 },
    'campaign-tabs': { ports: [8131, 8103], split: true, tmp: 'dnd-tabs-check', secs: 120 },
    'encounter-builder': { ports: [8138], split: true, tmp: 'dnd-builder32-check', secs: 120 },
    'send-initiative': { ports: [8145, 8105], split: true, tmp: 'dnd-send-check', secs: 60 },
    'homebrew-copies': { ports: [8137], split: true, tmp: 'dnd-hbcopies-check', secs: 120 },
    'homebrew-monsters': { ports: [8139], split: true, tmp: 'dnd-hbmonsters-check', secs: 120 },
    'homebrew-classes': { ports: [8140], split: true, tmp: 'dnd-hbclasses-check', secs: 150 },
    'popup-page': { ports: [8142], split: true, tmp: 'dnd-popup-check', secs: 200 },
    'phone-mode': { ports: [8141], split: true, tmp: 'dnd-phone-check', secs: 200 },
    'stats-page': { ports: [8142], split: true, tmp: 'dnd-stats-check', secs: 60 },
    'sheet-rules': { ports: [8142, 8104], split: true, tmp: 'dnd-rules-check', secs: 120 },
};
// unit tests that open ports of their own (before the shift)
const TEST_PORTS = { 'live-relay.test.js': [8095, 8096], 'monster-encounters.test.php': [8124], 'maps.test.php': [8125] };
// in _dev/scripts but not checks: helpers, builders, and theme-diff (it compares two versions' screenshots, for CSS changes)
const NOT_CHECKS = new Set(['browser.mjs', 'site-targets.mjs', 'check-all.mjs', 'theme-diff.mjs', 'sheet-keeps-data.mjs', 'build-srd.mjs', 'build-content.mjs', 'build-books.mjs']);
// start-up failures that aren't the page's fault; such a job is run once more
export const FLAKE = /BrowsingContext does no longer exist|context null|ECONNREFUSED|connection refused|did not start|socket hang up|fetch failed/i;

// the jobs, before ports are given out
export function jobs(files, { data } = {}) {
    const list = [], unknown = [];
    for (const f of files) {
        if (f.endsWith('.test.js')) list.push({ name: f.slice(0, -8), browser: '-', cmd: [process.execPath, f], ports: TEST_PORTS[f] || [], secs: 5 });
        else if (f.endsWith('.test.php')) list.push({ name: f.slice(0, -9), browser: '-', cmd: [PHP, f], ports: TEST_PORTS[f] || [], secs: 5 });
        else if (f.endsWith('.mjs') && !NOT_CHECKS.has(f)) {
            const c = BROWSER_CHECKS[f.slice(0, -4)];
            if (!c) { unknown.push(f); continue; }
            const one = (browser, extra = [], env = {}) => list.push({ name: f.slice(0, -4), browser, cmd: [process.execPath, f, ...extra], ports: c.ports || [], url: !!c.url, tmp: c.tmp, env, secs: c.secs });
            if (c.both) one('both');
            else if (c.split === 'flag') { one('chrome'); one('firefox', ['--firefox']); }
            else for (const b of ['chrome', 'firefox']) one(b, [], { CHECK_BROWSER: b });
        }
    }
    if (data) for (const [b, extra] of [['chrome', []], ['firefox', ['--firefox']]])
        list.push({ name: 'sheet-keeps-data', browser: b, cmd: [process.execPath, 'sheet-keeps-data.mjs'], args: [data, ...extra], ports: [], url: true, env: {}, secs: 60 });
    return { list, unknown };
}

// gives every job a CHECK_PORT_SHIFT and its own server port when it needs one, no port shared or busy; returns the jobs
// with .shift, .port, .used (every port it opens) and .folders
export function plan(list, { lo = 8300, hi = 8499, busy = new Set() } = {}) {
    const used = new Set(busy), shifts = new Set();
    return list.map((j, i) => {
        // a job with a URL serves the site on 8110 + shift, the port the scripts' usage lines show
        const bases = j.url ? [8110, ...j.ports] : j.ports;
        let s = lo - Math.min(...bases, lo);
        const fits = (s) => !shifts.has(s) && bases.every((b) => b + s >= lo && b + s <= hi && !used.has(b + s));
        if (bases.length) { while (!fits(s)) { s++; if (s > hi) throw new Error(`no free ports left in ${lo}-${hi} for ${j.name}`); } }
        else { s = 1000 + i; while (shifts.has(s)) s++; } // no ports: the shift only names its folders
        shifts.add(s); bases.forEach((b) => used.add(b + s));
        const job = { ...j, id: `${j.name}-${j.browser}`, shift: s, used: bases.map((b) => b + s), port: j.url ? 8110 + s : null };
        job.folders = [join(tmpdir(), 'dnd-check-all', `${job.id}-${s}`), ...(j.tmp ? [join(tmpdir(), j.tmp + s)] : [])];
        return job;
    });
}

const portBusy = (port) => new Promise((r) => { const s = createServer().once('error', () => r(true)).once('listening', () => s.close(() => r(false))).listen(port, '127.0.0.1'); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const kill = (p) => { try { execSync(process.platform === 'win32' ? `taskkill /PID ${p.pid} /T /F` : `kill -9 ${p.pid}`, { stdio: 'ignore' }); } catch { } };

function runOnce(job) {
    return new Promise(async (done) => {
        const [folder] = job.folders;
        rmSync(folder, { recursive: true, force: true }); mkdirSync(folder, { recursive: true });
        // the job's own server: backups, monster backups, accounts and sessions in its own folder, never private/dnd/
        const env = { ...process.env, ...job.env, CHECK_PORT_SHIFT: String(job.shift), CHECK_CHROME_PORT: '', CHECK_FIREFOX_PORT: '', CHECK_PORT: '',
            DND_BACKUPS: join(folder, 'backups'), DND_MONSTER_BACKUPS: join(folder, 'monster-backups'), DND_SESSIONS: join(folder, 'sessions'), DND_ACCOUNTS: join(folder, 'accounts') };
        mkdirSync(env.DND_SESSIONS);
        // characters-page writes its stand-in characters to its own temp folder and reads them back through the server
        if (job.name === 'characters-page') env.DND_ACCOUNTS = job.folders[1];
        let server = null, out = '';
        if (job.url) {
            server = spawn(PHP, ['-S', `127.0.0.1:${job.port}`, '-t', ROOT, join(ROOT, '_dev/router.php')], { stdio: 'ignore', env });
            const t = Date.now();
            while (!(await fetch(`http://127.0.0.1:${job.port}/privacy/`).then((r) => r.ok, () => false))) {
                if (Date.now() - t > 15000) { kill(server); return done({ ok: false, out: `the PHP server on ${job.port} did not start` }); }
                await sleep(50);
            }
        }
        const [exe, script, ...rest] = job.cmd;
        const args = [script, ...(job.url ? [`http://localhost:${job.port}`] : []), ...(job.args || []), ...rest];
        const p = spawn(exe, args, { cwd: DIR, env, stdio: ['ignore', 'pipe', 'pipe'] });
        p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { out += d; });
        const timer = setTimeout(() => { out += '\nFAIL timed out after 10 minutes'; kill(p); }, 600000);
        p.on('close', (code) => {
            clearTimeout(timer); if (server) kill(server);
            for (const f of job.folders) rmSync(f, { recursive: true, force: true });
            done({ ok: code === 0, out });
        });
    });
}

async function main() {
    const argv = process.argv.slice(2), opt = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
    const only = opt('--only')?.split(',').map((s) => s.trim().replace(/\.(mjs|test\.js|test\.php)$/, ''));
    const data = opt('--data'), width = +opt('--jobs') || Math.max(2, Math.floor(availableParallelism() / 2));
    const [lo, hi] = (opt('--ports') || '8300-8499').split('-').map(Number);

    if (!existsSync(join(ROOT, 'live/node_modules'))) { console.log('installing the live relay packages (npm install in live/)'); execSync('npm install --no-audit --no-fund', { cwd: join(ROOT, 'live'), stdio: 'inherit', shell: true }); }
    if (!existsSync(join(ROOT, 'includes/config.php'))) console.log('WARNING includes/config.php is missing: the signed-in checks will fail (copy it from the main checkout)');

    const { list, unknown } = jobs(readdirSync(DIR).sort(), { data });
    for (const f of unknown) console.log(`FAIL ${f} is not in check-all's list: add it to BROWSER_CHECKS (or NOT_CHECKS)`);
    const picked = list.filter((j) => !only || only.includes(j.name));
    if (only) for (const n of only) if (!picked.some((j) => j.name === n)) { console.log(`no check called ${n}`); process.exit(2); }
    const busy = new Set();
    for (let p = lo; p <= hi; p++) if (await portBusy(p)) busy.add(p);

    const queue = plan(picked, { lo, hi, busy }).sort((a, b) => b.secs - a.secs);

    const t0 = Date.now(), rows = [];
    console.log(`${queue.length} checks, ${Math.min(width, queue.length)} at a time`);
    const worker = async () => {
        for (let job; (job = queue.shift());) {
            const t = Date.now();
            let r = await runOnce(job), status = r.ok ? 'pass' : 'FAIL';
            if (!r.ok && FLAKE.test(r.out)) {
                console.log(`RETRY ${job.id}: ${(r.out.match(new RegExp('.*(' + FLAKE.source + ').*', 'i')) || [''])[0].trim().slice(0, 200)}`);
                r = await runOnce(job); status = r.ok ? 'passed on retry' : 'FAIL';
            }
            const secs = (Date.now() - t) / 1000;
            rows.push({ job: job.name, browser: job.browser, secs, status });
            const last = r.out.trim().split('\n').pop();
            if (r.ok) console.log(`${status === 'pass' ? 'ok  ' : 'ok (passed on retry)'} ${job.id} ${secs.toFixed(1)} s: ${last}`);
            // the player-data check's counts ("<page>: N saved characters checked in <browser>"), so a run shows what it covered
            if (r.ok) for (const l of r.out.match(/^.* checked in .*$/gm) || []) console.log('    ' + l.trim());
            else console.log(`FAIL ${job.id} ${secs.toFixed(1)} s\n${r.out.trim().split('\n').map((l) => '    ' + l).join('\n')}`);
        }
    };
    await Promise.all(Array.from({ length: Math.min(width, queue.length) }, worker));

    const bad = rows.filter((r) => r.status === 'FAIL').length + unknown.length, retried = rows.filter((r) => r.status === 'passed on retry').length;
    rows.sort((a, b) => a.job.localeCompare(b.job) || a.browser.localeCompare(b.browser));
    console.log('\n' + ['job'.padEnd(20), 'browser'.padEnd(8), 'seconds'.padStart(8), '  result'].join(''));
    for (const r of rows) console.log(r.job.padEnd(20) + r.browser.padEnd(8) + r.secs.toFixed(1).padStart(8) + '  ' + r.status);
    console.log(`\n${rows.length} checks in ${((Date.now() - t0) / 1000).toFixed(0)} s` + (retried ? `, ${retried} passed on retry` : ''));
    console.log(bad ? `${bad} checks failed` : 'all checks ok');
    process.exit(bad ? 1 : 0);
}
if (import.meta.main) await main();
