// The "book" field and the tidy-up of the wiki's Source lines (_dev/scripts/content/books.mjs), for the Sources filter.
//   node _dev/scripts/content-books.test.js
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

(async () => {
    const { cleanBook, bookOf, BOOK_CATS, BOOK_SEP, NO_BOOK } = await import('./content/books.mjs');
    let bad = 0;
    const is = (name, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) { bad++; console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); } };

    is('plain', cleanBook("Player's Handbook"), "Player's Handbook");
    is('nothing', cleanBook(''), '');
    is('trailing stop', cleanBook('Planescape - Adventures in the Multiverse.'), 'Planescape - Adventures in the Multiverse');
    is('two by slash', cleanBook("Tasha's Cauldron of Everything/Sword Coast Adventurer's Guide"), `Tasha's Cauldron of Everything${BOOK_SEP}Sword Coast Adventurer's Guide`);
    is('two by comma', cleanBook("Mythic Odysseys of Theros, Tasha's Cauldron of Everything"), `Mythic Odysseys of Theros${BOOK_SEP}Tasha's Cauldron of Everything`);
    is('one release with a comma', cleanBook('Locathah Rising, Extra Life 2019'), 'Locathah Rising, Extra Life 2019');
    is('spelling', cleanBook('Acquisitions Inc.'), 'Acquisitions Incorporated');
    is('Plane Shift', cleanBook('Plane Shift: Zendikar'), 'Plane Shift - Zendikar');
    is('not a book', cleanBook('Features'), '');
    is('typo', cleanBook("Spelljamer: Adventures in Space - Astral Adventurer's Guide"), "Spelljammer: Adventures in Space - Astral Adventurer's Guide");
    is('DND', cleanBook('DND Beyond Drops - July 2026'), 'D&D Beyond Drops - July 2026');
    is('the stats ran on', cleanBook('Forgotten Realms - Heroes of Faerun Level 8 Evocation (Cleric, Wizard) Casting Time: Bonus Action'), 'Forgotten Realms - Heroes of Faerun');
    is('same twice', cleanBook("Eberron: Rising from the Last War/Eberron - Rising from the Last War"), 'Eberron - Rising from the Last War');

    const wiki = { src: 'wikidot', rules: '2014' };
    is('a core class', bookOf({ ...wiki, index: 'fighter' }, 'classes', {}), "Player's Handbook");
    is('the line wins', bookOf({ ...wiki, index: 'fighter', book: 'Other Book' }, 'classes', {}), 'Other Book');
    is('a wiki page with no line', bookOf({ ...wiki, index: 'x' }, 'feats', {}), NO_BOOK);
    is('the SRD as monsters name it', bookOf({ src: 'srd', index: 'x' }, 'spells', {}), 'SRD 5.1');
    is('a source by its credit', bookOf({ src: 'toh', index: 'x' }, 'spells', { toh: 'Tome of Heroes' }), 'Tome of Heroes');

    // the committed files: every entry has a tidy book, and the tick list adds up
    const D = join(__dirname, '../../sheets/player/content'), index = JSON.parse(readFileSync(join(D, 'index.json'), 'utf8')), count = {};
    for (const r of ['2014', '2024']) for (const f of ['classes', 'origins', 'spells', 'items']) {
        const j = JSON.parse(readFileSync(join(D, `${r}-${f}.json`), 'utf8'));
        for (const c of BOOK_CATS) for (const e of Object.values(j[c] || {})) {
            if (typeof e.book !== 'string' || !e.book) { bad++; console.log(`FAIL ${r} ${c} ${e.index}: no book`); continue; }
            for (const b of e.book.split(BOOK_SEP)) count[b] = (count[b] || 0) + 1;
        }
    }
    is('the tick list adds up', Object.entries(count).sort((a, b) => a[0].localeCompare(b[0])), Object.entries(index.books).sort((a, b) => a[0].localeCompare(b[0])));
    if (!Object.keys(count).includes("Player's Handbook")) { bad++; console.log("FAIL no Player's Handbook"); }
    console.log(bad ? `${bad} check(s) failed` : 'content books ok');
    process.exit(bad ? 1 : 0);
})();
