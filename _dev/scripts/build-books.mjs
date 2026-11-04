// Adds "book" to the committed content files from a fresh crawl, and changes nothing else in them, so the wiki changing can't touch friends' content:
//   CONTENT_OUT=<scratch folder> CONTENT_TOLERATE=1 node _dev/scripts/build-content.mjs     (the crawl; run again until no FAILED PAGE)
//   node _dev/scripts/build-books.mjs <scratch folder>
// An entry is matched by rules version, category, index and name. build-content.mjs on its own writes the same field on a full rebuild.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { RULES, FILES, write } from './build-content.mjs';
import { slug } from './content/fetch.mjs';
import { bookOf, bookCounts, BOOK_CATS } from './content/books.mjs';

const FROM = process.argv[2], OUT = join(import.meta.dirname, '../../sheets/player/content');
if (!FROM) throw new Error('Name the crawl folder.');
const load = (dir, f) => JSON.parse(readFileSync(join(dir, f), 'utf8'));
const index = load(OUT, 'index.json'), names = Object.fromEntries(index.credits.map((c) => [c.src, c.name])), all = {};
let unmatched = 0;
for (const r of RULES) {
    all[r] = {};
    for (const [name, cats] of Object.entries(FILES)) {
        const file = `${r}-${name}.json`, now = load(OUT, file), crawl = load(FROM, file);
        for (const c of cats) {
            all[r][c] = now[c];
            if (!BOOK_CATS.includes(c)) continue;
            for (const [i, e] of Object.entries(now[c])) {
                const hit = crawl[c]?.[i], same = hit && slug(hit.name) === slug(e.name);
                if (!same && /^wikidot/.test(e.src)) { unmatched++; console.log('not in the crawl:', r, c, i); }
                e.book = bookOf({ ...e, book: same ? hit.book : '' }, c, names);
            }
        }
        writeFileSync(join(OUT, file), write(now));
    }
}
index.books = bookCounts(all);
writeFileSync(join(OUT, 'index.json'), JSON.stringify(index));
console.log(`${Object.keys(index.books).length} books, ${unmatched} wiki entries not in the crawl`);
