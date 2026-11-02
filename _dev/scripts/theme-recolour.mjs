// Proves the site is theme-ready (ROADMAP 2.3): sets every colour token in global.css to its own loud colour on every page
// and lists each visible element whose text, background, border or SVG colour is NOT one of those loud colours (so it is
// hard-coded somewhere and a theme would miss it). Ends with "theme recolour ok" when there are none.
//   node _dev/scripts/theme-recolour.mjs [base URL, default http://localhost:8110]
// Not checked (not theme colours): images and canvases, shadow colours (pure black), the dice sets' own colours.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { launch } from './browser.mjs';
import { targets, db } from './site-targets.mjs';

const BASE = process.argv[2] || 'http://localhost:8110';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const root = readFileSync(join(import.meta.dirname, '../../assets/css/global.css'), 'utf8').match(/:root\s*\{([^}]*)\}/)[1];
const names = [...root.matchAll(/(--[\w-]+)\s*:\s*#[0-9a-f]{3,8}\s*;/gi)].map((m) => m[1]);
const palette = names.map((n, i) => [n, [(i * 47) % 190 + 40, (i * 91) % 190 + 40, (i * 131) % 190 + 40]]);
if (new Set(palette.map((p) => p[1].join())).size !== palette.length) throw new Error('loud colours are not unique');
const css = ':root:root{' + palette.map(([n, c]) => `${n}:rgb(${c});`).join('') + '}';
const loud = JSON.stringify(palette.map((p) => p[1].join(',')));

const probe = `(() => {
    const loud = new Set(${loud}), bad = new Map();
    const rgb = (v) => { const m = v.match(/rgba?\\(([^)]*)\\)/); if (!m) return null; const p = m[1].split(/[\\s,/]+/).filter(Boolean); return { c: p.slice(0, 3).join(','), a: p[3] === undefined ? 1 : +p[3] }; };
    const name = (e) => e.tagName.toLowerCase() + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\\s+/).join('.') : '');
    const note = (e, prop, v) => { const k = name(e) + ' ' + prop + ' ' + v; bad.set(k, (bad.get(k) || 0) + 1); };
    const test = (e, prop, v) => { const c = rgb(v); if (c && c.a > 0 && !loud.has(c.c)) note(e, prop, v); };
    for (const e of document.querySelectorAll('body *')) {
        if (!e.getClientRects().length || ['IMG', 'CANVAS', 'VIDEO', 'IFRAME', 'SCRIPT', 'STYLE', 'OPTION', 'OPTGROUP'].includes(e.tagName)) continue;
        const s = getComputedStyle(e);
        if (e instanceof SVGElement) { if (e.ownerSVGElement) { test(e, 'fill', s.fill); test(e, 'stroke', s.stroke); } continue; }
        if ([...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) || /^(TEXTAREA|SELECT)$/.test(e.tagName) || (e.tagName === 'INPUT' && !/^(checkbox|radio|range|color|file|hidden|button|submit|reset)$/.test(e.type))) test(e, 'color', s.color);
        test(e, 'background', s.backgroundColor);
        for (const side of ['Top', 'Right', 'Bottom', 'Left']) if (parseFloat(s['border' + side + 'Width']) > 0 && s['border' + side + 'Style'] !== 'none') test(e, 'border-' + side.toLowerCase(), s['border' + side + 'Color']);
        if (s.accentColor !== 'auto') test(e, 'accent-color', s.accentColor);
        if (/gradient/.test(s.backgroundImage)) for (const m of s.backgroundImage.matchAll(/rgba?\\([^)]*\\)/g)) test(e, 'gradient', m[0]);
    }
    return JSON.stringify([...bad].map(([k, n]) => k + (n > 1 ? ' x' + n : '')));
})()`;

let bad = 0;
for (const name of ['chrome', 'firefox']) {
    const b = await launch(name);
    try {
        await b.block(/backup\.php|cloud\.php/);
        for (const [label, path, setup] of targets) {
            await b.go(BASE + '/privacy/');
            await b.ev(`localStorage.clear(); localStorage.setItem('hb-sheet-merged', '1'); ${setup === 'seed' ? `localStorage.setItem('hb-sheet', ${JSON.stringify(db)})` : ''}`);
            await b.go(BASE + path); await sleep(1200);
            if (setup && setup !== 'seed') await b.ev(setup);
            await b.ev(`(() => { const s = document.createElement('style'); s.textContent = ${JSON.stringify(css + '*,*::before,*::after{transition:none!important;animation:none!important}')}; document.head.append(s); })()`);
            await sleep(200);
            for (const o of JSON.parse(await b.ev(probe))) { bad++; console.log(`FAIL ${name} ${label}: ${o}`); }
        }
        console.log(`${name}: ${targets.length} pages recoloured`);
    } finally { b.close(); }
}
console.log(bad ? `${bad} element colour(s) not driven by a token` : 'theme recolour ok');
process.exit(bad ? 1 : 0);
