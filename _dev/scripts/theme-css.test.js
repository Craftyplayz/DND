// Theme-ready CSS (ROADMAP 2.3): every colour and font lives in the :root block of assets/css/global.css, so a theme only
// swaps values. Fails when page CSS has a hex/hsl/named colour, an rgb() that isn't pure black or white (shadows and
// scrims), or a font-family that isn't a var(); and when a :root token isn't used anywhere. The dice sets' own
// colours are content and live in dice/*.js, which this doesn't look at.
//   node _dev/scripts/theme-css.test.js
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '../..');
const walk = (d, ext) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory()
    ? (['private', '_dev', 'node_modules', '.git', 'vendor'].includes(e.name) ? [] : walk(path.join(d, e.name), ext))
    : ext.some((x) => e.name.endsWith(x)) ? [path.join(d, e.name)] : []);
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
let bad = 0;
const fail = (m) => { bad++; console.log('FAIL ' + m); };

const NAMED = /(?<![\w-])(white|black|red|green|blue|gray|grey|silver|orange|yellow|purple|gold|pink|brown|cyan|magenta|navy|teal|lime|maroon|olive|aqua|fuchsia)(?![\w-])/i;
const css = walk(path.join(ROOT, 'assets/css'), ['.css']);
for (const f of css) {
    let s = strip(fs.readFileSync(f, 'utf8'));
    if (path.basename(f) === 'global.css') s = s.replace(/:root\s*\{[^}]*\}/, (m) => m.replace(/[^\n]/g, ' '));
    s.split('\n').forEach((line, i) => {
        const at = `${path.relative(ROOT, f)}:${i + 1}`;
        if (/#[0-9a-f]{3,8}\b/i.test(line.replace(/url\([^)]*\)/g, ''))) fail(`${at} hex colour: ${line.trim()}`);
        if (/\bhsla?\(/i.test(line)) fail(`${at} hsl colour: ${line.trim()}`);
        for (const m of line.matchAll(/\brgba?\(([^)]*)\)/gi)) {
            const [r, g, b] = m[1].split(/[\s,/]+/).filter(Boolean);
            if (!(r === g && g === b && (r === '0' || r === '255'))) fail(`${at} rgb colour that isn't pure black or white: ${m[0]}`);
        }
        const noStr = line.replace(/"[^"]*"|'[^']*'|url\([^)]*\)/g, '').replace(/[.#][\w-]+/g, '').replace(/--[\w-]+/g, '').replace(/var\([^)]*\)/g, '');
        if (NAMED.test(noStr.replace(/^[^:{]*\{/, '').replace(/[^;{]*:\s*(?=\S)/g, (p) => /(color|background|border|shadow|fill|stroke|outline|accent)/.test(p) ? p : '\u0000'.repeat(p.length)))) fail(`${at} named colour: ${line.trim()}`);
        const ff = line.match(/font-family\s*:\s*([^;}]+)/);
        if (ff && !/^(var\(|inherit)/.test(ff[1].trim())) fail(`${at} font-family not a var(): ${ff[1].trim()}`);
    });
}

// every token is used somewhere besides its own definition (the /design swatches are generated from the :root block)
const root = strip(fs.readFileSync(path.join(ROOT, 'assets/css/global.css'), 'utf8')).match(/:root\s*\{([^}]*)\}/)[1];
const tokens = [...root.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]);
const code = walk(ROOT, ['.css', '.js', '.php', '.html', '.mjs']).filter((f) => !f.includes(path.join('assets', 'js', 'vendor')))
    .map((f) => strip(fs.readFileSync(f, 'utf8')).replace(/^\s*--[\w-]+\s*:[^;]*;/gm, (m) => (path.basename(f) === 'global.css' ? m.replace(/[^\n]/g, ' ') : m))).join('\n');
for (const t of tokens) if (!new RegExp(t.replace(/-/g, '\\-') + '(?![\\w-])').test(code.replace(new RegExp('^\\s*' + t + '\\s*:', 'gm'), ''))) fail(`${t} is defined in :root but used nowhere`);

console.log(bad ? `${bad} problem(s)` : `theme css ok (${css.length} files, ${tokens.length} tokens)`);
process.exit(bad ? 1 : 0);
