// The pages the visual checks (theme-diff.mjs, theme-recolour.mjs) open: every folder with an index.php/index.html (private/
// left out), a seeded character sheet, and a page with the drawer, dialog, JSON tree, search bar and badges opened.
// Each target is [label, path, setup]; setup is null, 'seed' (store one character first) or JS to run once the page is open.
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '../..'), SKIP = new Set(['private', '_dev', 'assets', 'node_modules']);
const pages = (dir = '') => [
    ...(['index.php', 'index.html'].some((f) => existsSync(join(ROOT, dir, f))) ? ['/' + dir] : []),
    ...readdirSync(join(ROOT, dir), { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith('.') && !SKIP.has(d.name)).flatMap((d) => pages(dir + d.name + '/')),
];
const char = { id: 'aaa', name: 'Lock', race: 'Tabaxi', updated: 300, art: '', classes: [{ name: 'Barbarian', level: 4, die: 12, hdUsed: 0 }], abilities: [] };
export const db = JSON.stringify({ cur: 'aaa', chars: { aaa: char } });
const STATES = `<div class="page"><aside class="drawer open"><button class="close">x</button><p>Drawer</p></aside>
<dialog class="dlg" id="dd"><h2>Dialog</h2><p>Text</p><div class="actions"><button class="btn">No</button><button class="btn primary">Yes</button></div></dialog>
<div class="tree"><details open><summary><span class="k">key</span> <span class="ty">object</span></summary><div class="tl"><span class="k">n</span>: <span class="v number">3</span> <span class="k">s</span>: <span class="v string">"x"</span> <mark>hit</mark></div><details><summary>closed</summary></details></details></div>
<div class="bar"><input class="field" value="search"><button class="btn">Go</button></div>
<div class="badges"><span class="badge">a</span><span class="badge g">g</span><span class="badge r">r</span><span class="badge p">p</span><span class="badge b">b</span></div></div>`;
// each entry: [label, path, setup run once the page is open]
export const targets = [
    ...pages().map((p) => [p, p, null]),
    ['sheet /characters/aaa', '/characters/aaa', 'seed'],
    ['injected states (/privacy/)', '/privacy/', `document.body.insertAdjacentHTML('beforeend', ${JSON.stringify(STATES)}); document.getElementById('dd').show()`],
];

