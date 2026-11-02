// Builds compendium/spells.json: the SRD 5.1 spell list with the fields the Compendium filters and previews by
// (dnd5eapi.co GraphQL, SRD 5.1, CC BY 4.0). Same key as the sheet's spell list, so "fireball" is the same everywhere.
//   node _dev/scripts/build-compendium.js
// Row: [index, name, level, school, casting time, concentration 0/1, ritual 0/1, range, duration]
const fs = require('fs'), path = require('path');
const q = '{ spells(limit: 1000) { index name level school { name } casting_time concentration ritual range duration } }';
(async () => {
    const r = await fetch('https://www.dnd5eapi.co/graphql/2014', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: q }) });
    const j = await r.json();
    if (!j.data) throw new Error(JSON.stringify(j.errors));
    const list = j.data.spells.map((s) => [s.index, s.name, s.level, s.school.name, s.casting_time, +!!s.concentration, +!!s.ritual, s.range, s.duration])
        .sort((a, b) => a[1].localeCompare(b[1]));
    if (list.length < 300) throw new Error('only ' + list.length + ' spells');
    fs.writeFileSync(path.join(__dirname, '../../compendium/spells.json'), JSON.stringify({ built: new Date().toISOString().slice(0, 10), list }));
    console.log(list.length + ' spells');
})();
