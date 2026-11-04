// The book each content entry comes from ("book"), for the Sources filter: what a wiki page's Source line says, tidied, or the source's own name.
// An entry in more than one book has them joined by BOOK_SEP (assets/js/books.js splits on it). Every entry ends up with a book.
export const BOOK_SEP = '; ';
export const NO_BOOK = 'No book listed';
// the wiki spells these several ways
const SAME = {
    'Acquisitions Inc.': 'Acquisitions Incorporated',
    "Astral Adventurer's Guide": "Spelljammer: Adventures in Space - Astral Adventurer's Guide",
    "Spelljamer: Adventures in Space - Astral Adventurer's Guide": "Spelljammer: Adventures in Space - Astral Adventurer's Guide",
    'Legend of Runeterra: Dark Tides of Bilgewater': 'Legends of Runeterra: Dark Tides of Bilgewater',
    'Eberron: Rising from the Last War': 'Eberron - Rising from the Last War',
};
// these class pages don't name a book
const PHB = "Player's Handbook";
const CLASS_BOOK = { artificer: "Tasha's Cauldron of Everything", barbarian: PHB, bard: PHB, cleric: PHB, druid: PHB, fighter: PHB, monk: PHB, paladin: PHB, ranger: PHB, rogue: PHB, sorcerer: PHB, warlock: PHB, wizard: PHB };
// the names monsters.json uses for the same books
const A5E = "Level Up Advanced 5e Adventurer's Guide", TALDOREI = 'Critical Role: Tal’Dorei Campaign Setting';
const SOURCE_NAME = { srd: 'SRD 5.1', srd2024: 'SRD 5.2', bf: 'Black Flag SRD', a5e: A5E, 'a5e-ag': A5E, tdcs: TALDOREI };

// "Tasha's Cauldron of Everything/Sword Coast Adventurer's Guide." -> "Tasha's Cauldron of Everything; Sword Coast Adventurer's Guide"
export function cleanBook(raw) {
    const s = String(raw || '').replace(/\s+(Level \d|\d(st|nd|rd|th)-level|Casting Time:).*$/i, '').trim();
    // a race page's section heading that isn't a book
    if (!s || s === 'Features') return '';
    // "Locathah Rising, Extra Life 2019" is one release
    const parts = s.split(/\s*\/\s*|,\s+(?!Extra Life)/).map((b) => {
        const t = b.trim().replace(/\.$/, (m) => (b.trim().endsWith('Inc.') ? m : '')).replace(/^DND Beyond/, 'D&D Beyond').replace(/^Plane Shift: /, 'Plane Shift - ');
        return SAME[t] || t;
    }).filter(Boolean);
    return [...new Set(parts)].join(BOOK_SEP);
}
// names: { src: credit name }
export function bookOf(e, cat, names) {
    return cleanBook(e.book) || (cat === 'classes' && e.rules === '2014' && /^wikidot/.test(e.src) && CLASS_BOOK[e.index]) || SOURCE_NAME[e.src] || (/^wikidot/.test(e.src) ? NO_BOOK : names[e.src] || NO_BOOK);
}
export const BOOK_CATS = ['classes', 'subclasses', 'races', 'subraces', 'backgrounds', 'feats', 'spells', 'equipment', 'magic_items'];
// { book: how many entries }, for the tick list; out: { rules: { cat: { index: entry } } }
export function bookCounts(out) {
    const n = {};
    for (const r of Object.values(out)) for (const c of BOOK_CATS) for (const e of Object.values(r[c] || {})) for (const b of String(e.book).split(BOOK_SEP)) n[b] = (n[b] || 0) + 1;
    return Object.fromEntries(Object.entries(n).sort((a, b) => a[0].localeCompare(b[0])));
}
