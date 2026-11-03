// Compendium keys from before the content files -> their entry now, written to sheets/player/content/aliases.json so favourites and
// links saved under the old keys keep working (read by assets/js/compendium.js; stored favourites are never rewritten).
// build-content.mjs runs this after each build. Old keys come from compendium/spells.json, extra-spells.json and the aliases already
// in the file; the magic items' old keys were only ever a live list, so they came in once:
//   node _dev/scripts/content/aliases.mjs [--old-magic <items.php?list=1 saved as JSON>]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = join(import.meta.dirname, '../../..'), OUT = join(ROOT, 'sheets/player/content/aliases.json');
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const read = (f) => JSON.parse(readFileSync(join(ROOT, f), 'utf8'));
// SRD names with nothing in common with the book's name for the same spell or item
const RENAMED = { 'arcane-hand': 'bigbys-hand', 'arcane-sword': 'mordenkainens-sword', 'arcanists-magic-aura': 'nystuls-magic-aura' };

// the entry an old index and name now live under, or ''. entries: { index: name }
export function aliasOf(index, name, entries) {
    if (entries[index]) return index;
    if (entries[RENAMED[index]]) return RENAMED[index];
    const keys = Object.keys(entries), n = norm(name);
    // the same name; then the name with a book's owner in front ("Acid Arrow" -> "Melf's Acid Arrow")
    const same = keys.find((k) => norm(entries[k]) === n) || (n && keys.find((k) => norm(entries[k]).endsWith(' ' + n)));
    if (same) return same;
    // a variant now listed under its parent ("dragon-scale-mail-red"), or a parent now listed by variant ("adamantine-armor-breastplate")
    for (let p = index; p; p = p.includes('-') ? p.slice(0, p.lastIndexOf('-')) : '') {
        if (p !== index && entries[p]) return p;
        const child = keys.filter((k) => k.startsWith(p + '-')).sort()[0];
        if (child) return child;
    }
    return '';
}

// old rows [index, name] -> { "<type>:<old key>": "<type>:2014:<index>" } for the keys that changed; prior entries stay while their target exists
export function contentAliases({ spells, magic, prior = {} }, data) {
    const out = {}, missing = [], names = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v.name]));
    const add = (t, oldKey, index, name, entries) => {
        if (entries[index]) return; // the plain rule in compendium.js covers it
        const hit = aliasOf(index, name, entries);
        if (hit) { if (oldKey !== hit) out[`${t}:${oldKey}`] = `${t}:2014:${hit}`; } else missing.push(`${t}:${oldKey}`);
    };
    const sp = names(data.spells), mg = names(data.magic_items);
    for (const [k, n] of spells) add('spell', k, k.replace(/^wd:/, ''), n, sp);
    for (const [k, n] of magic) add('magic', k, k.replace(/^magic:/, ''), n, mg);
    for (const [k, v] of Object.entries(prior)) if (!out[k] && (v.startsWith('spell:') ? sp : mg)[v.split(':')[2]]) out[k] = v;
    return { aliases: out, missing };
}

export function writeAliases(oldMagic = []) {
    const prior = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
    const spells = read('compendium/spells.json').list.map((r) => [r[0], r[1]]).concat(read('sheets/player/extra-spells.json').map((s) => ['wd:' + s.index, s.name]));
    const data = { ...read('sheets/player/content/2014-spells.json'), ...read('sheets/player/content/2014-items.json') };
    const r = contentAliases({ spells, magic: oldMagic, prior }, data);
    writeFileSync(OUT, JSON.stringify(r.aliases, null, 1) + '\n');
    console.log(`${Object.keys(r.aliases).length} content aliases${r.missing.length ? `, NOT FOUND: ${r.missing.join(', ')}` : ''} -> ${OUT}`);
    return r;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const i = process.argv.indexOf('--old-magic');
    writeAliases(i > 0 ? JSON.parse(readFileSync(process.argv[i + 1], 'utf8')).magic.map((r) => [r[0], r[1]]) : []);
}
