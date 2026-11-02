// Proves a CSS change looks the same: opens every page of the site on two servers (old code, new code), takes
// full-page screenshots at 375, 768 and 1440 wide in headless Chrome and Firefox and compares them pixel by pixel.
// Ends with "theme diff ok" when nothing differs. For each difference it prints the page, width and the elements
// at the changed spots, so a deliberate change can be checked by eye.
//   node _dev/scripts/theme-diff.mjs <old URL> <new URL> [--chrome|--firefox] [--page=/dice/]
//   (old = a git worktree of the commit before the change, e.g. php -S 127.0.0.1:8161 -t ../old _dev/router.php)
// Pages: every folder with an index.php/index.html (private/ left out), a seeded character sheet, and a
// page with the drawer, dialog, JSON tree, search bar and badges opened (injected, same markup on both).
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { launch } from './browser.mjs';

const [OLD, NEW] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!OLD || !NEW) { console.log('usage: theme-diff.mjs <old URL> <new URL>'); process.exit(2); }
const ROOT = join(import.meta.dirname, '../..'), SKIP = new Set(['private', '_dev', 'assets', 'node_modules']);
const pages = (dir = '') => [
    ...(['index.php', 'index.html'].some((f) => existsSync(join(ROOT, dir, f))) ? ['/' + dir] : []),
    ...readdirSync(join(ROOT, dir), { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith('.') && !SKIP.has(d.name)).flatMap((d) => pages(dir + d.name + '/')),
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const char = { id: 'aaa', name: 'Lock', race: 'Tabaxi', updated: 300, art: '', classes: [{ name: 'Barbarian', level: 4, die: 12, hdUsed: 0 }], abilities: [] };
const db = JSON.stringify({ cur: 'aaa', chars: { aaa: char } });
const STATES = `<aside class="drawer open"><button class="close">x</button><p>Drawer</p></aside>
<dialog class="dlg" id="dd"><h2>Dialog</h2><p>Text</p><div class="actions"><button class="btn">No</button><button class="btn primary">Yes</button></div></dialog>
<div class="tree"><details open><summary><span class="k">key</span> <span class="ty">object</span></summary><div class="tl"><span class="k">n</span>: <span class="v number">3</span> <span class="k">s</span>: <span class="v string">"x"</span> <mark>hit</mark></div><details><summary>closed</summary></details></details></div>
<div class="bar"><input class="field" value="search"><button class="btn">Go</button></div>
<div class="badges"><span class="badge">a</span><span class="badge g">g</span><span class="badge r">r</span><span class="badge p">p</span><span class="badge b">b</span></div>`;
// each entry: [label, path, setup run once the page is open]
const targets = [
    ...pages().map((p) => [p, p, null]),
    ['sheet /characters/aaa', '/characters/aaa', 'seed'],
    ['injected states (/design/)', '/design/', `document.body.insertAdjacentHTML('beforeend', ${JSON.stringify(STATES)}); document.getElementById('dd').show()`],
];

function png(buf) {
    let p = 8, w, h, ct; const idat = [];
    while (p < buf.length) {
        const n = buf.readUInt32BE(p), t = buf.toString('latin1', p + 4, p + 8), d = buf.subarray(p + 8, p + 8 + n);
        if (t === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); ct = d[9]; if (d[8] !== 8 || d[12]) throw new Error('png: need 8-bit, not interlaced'); }
        if (t === 'IDAT') idat.push(d);
        p += 12 + n;
    }
    const bpp = { 2: 3, 6: 4 }[ct]; if (!bpp) throw new Error('png: colour type ' + ct);
    const raw = inflateSync(Buffer.concat(idat)), stride = w * bpp, out = Buffer.alloc(h * stride);
    for (let y = 0; y < h; y++) {
        const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride;
        for (let x = 0; x < stride; x++) {
            const a = x >= bpp ? out[dst + x - bpp] : 0, b = y ? out[dst - stride + x] : 0, c = x >= bpp && y ? out[dst - stride + x - bpp] : 0;
            const v = raw[src + x];
            out[dst + x] = (f === 0 ? v : f === 1 ? v + a : f === 2 ? v + b : f === 3 ? v + ((a + b) >> 1)
                : v + (() => { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; })()) & 255;
        }
    }
    return { w, h, bpp, data: out };
}

let bad = 0;
const only = process.argv.includes('--chrome') ? ['chrome'] : process.argv.includes('--firefox') ? ['firefox'] : ['chrome', 'firefox'];
for (const name of only) {
    const b = await launch(name);
    try {
        await b.block(/backup\.php|cloud\.php/);
        const take = async (base, path, setup, width) => {
            await b.go(base + '/privacy/');
            await b.ev(`localStorage.clear(); localStorage.setItem('hb-sheet-merged', '1'); ${setup === 'seed' ? `localStorage.setItem('hb-sheet', ${JSON.stringify(db)})` : ''}`);
            await b.go(base + path); await sleep(1200);
            // the dice previews are rendered with random jitter every load, so they are hidden on both sides
            const css = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}' + (path === '/dice/' ? 'img{visibility:hidden!important}' : '');
            await b.ev(`(() => { const s = document.createElement('style'); s.textContent = ${JSON.stringify(css)}; document.head.append(s); })()`);
            if (setup && setup !== 'seed') await b.ev(setup);
            await sleep(300);
            return png(await b.shot(width));
        };
        const pick = (process.argv.find((a) => a.startsWith('--page=')) || '').slice(7);
        for (const [label, path, setup] of targets.filter((t) => !pick || t[1] === pick)) for (const width of [375, 768, 1440]) {
            const a = await take(OLD, path, setup, width), a2 = await take(OLD, path, setup, width), c = await take(NEW, path, setup, width);
            // pixels that differ between two loads of the OLD code (random dice previews and the like) are noise, not changes
            const same = (p, q, i) => p.data[i] === q.data[i] && p.data[i + 1] === q.data[i + 1] && p.data[i + 2] === q.data[i + 2];
            const cells = new Map(); let n = 0;
            if (a.w !== c.w || a.h !== c.h) { bad++; console.log(`DIFF ${name} ${label} @${width}: size ${a.w}x${a.h} vs ${c.w}x${c.h}`); continue; }
            for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) {
                const i = (y * a.w + x) * a.bpp;
                if (!same(a, c, i) && (a2.w !== a.w || a2.h !== a.h || same(a, a2, i))) { n++; const k = (x >> 5) + ',' + (y >> 5); if (!cells.has(k)) cells.set(k, [x, y]); }
            }
            if (!n) continue;
            bad++;
            const who = [];
            for (const [x, y] of [...cells.values()].slice(0, 400)) {
                const el = await b.ev(`(() => { scrollTo(0, ${y} - 100); const e = document.elementFromPoint(${x}, ${y} - scrollY); return e ? e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\\s+/).join('.') : '') : ''; })()`);
                if (el && !who.includes(el)) who.push(el);
            }
            console.log(`DIFF ${name} ${label} @${width}: ${n} px differ; elements: ${who.slice(0, 12).join(' | ')}`);
        }
        console.log(`${name}: ${targets.length} pages x 3 widths compared`);
    } finally { b.close(); }
}
console.log(bad ? `${bad} difference(s)` : 'theme diff ok');
process.exit(bad ? 1 : 0);
