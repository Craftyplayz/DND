// Builds games/dnd/sheets/monster/monsters.json, the Monster Sheet's search list: SRD 5.1 monsters from dnd5eapi.co
// plus the open-licence books on Open5e (OGL, CC-BY, ORC), with duplicates removed (the SRD copy wins).
// The page fetches each full stat block through monsters.php when it's picked.   usage: node _dev/scripts/build-monsters.js
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '../../games/dnd/sheets/monster/monsters.json');
const OGL = path.join(__dirname, '../../games/dnd/sheets/monster/ogl.txt');
const OPEN = /open gaming|creative commons|orc licen/i;

// "Red Dragon, Adult" and "Adult Red Dragon" are the same name
const nameKey = (n) => String(n).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').sort().join(' ');
// entries come in preference order; one copy per name is kept, however much the numbers differ:
// other books' takes on a monster (Level Up, Black Flag, 2023 reprints) change anything from one number to the whole stat block
function dedupe(entries) {
    const seen = new Set();
    return entries.filter((e) => { const k = nameKey(e.name); return !seen.has(k) && seen.add(k); });
}

async function getJSON(url) {
    for (let i = 0; ; i++) {
        try {
            const r = await fetch(url, { headers: { 'User-Agent': 'CraftyPlayz monster sheet build' } });
            if (r.ok) return r.json();
            throw new Error(r.status + ' ' + url);
        } catch (e) { if (i >= 3) throw e; await new Promise((s) => setTimeout(s, 1000 * (i + 1))); }
    }
}

async function build() {
    const srdList = (await getJSON('https://www.dnd5eapi.co/api/2014/monsters')).results;
    const srd = [];
    for (let i = 0; i < srdList.length; i += 10) {
        srd.push(...await Promise.all(srdList.slice(i, i + 10).map((m) => getJSON('https://www.dnd5eapi.co' + m.url))));
    }
    const docs = (await getJSON('https://api.open5e.com/v1/documents/?limit=200')).results;
    const o5e = [];
    for (let url = 'https://api.open5e.com/v1/monsters/?limit=500'; url;) { const j = await getJSON(url); o5e.push(...j.results); url = j.next; }

    const open = docs.filter((d) => OPEN.test(d.license));
    const rank = new Map(open.map((d, i) => [d.slug, i + 1]));
    const entries = [
        ...srd.map((m) => ({ key: 'srd:' + m.index, name: m.name, src: 'srd', rank: 0, type: m.type, cr: +m.challenge_rating })),
        ...o5e.filter((m) => rank.has(m.document__slug)).map((m) => ({ key: 'o5e:' + m.slug, name: m.name, src: m.document__slug, rank: rank.get(m.document__slug),
            type: String(m.type || '').toLowerCase(), cr: +m.cr })),
    ].sort((a, b) => a.rank - b.rank);
    const list = dedupe(entries).sort((a, b) => a.name.localeCompare(b.name));
    const used = new Set(list.map((e) => e.src));
    const sources = { srd: { title: 'SRD 5.1', licence: 'CC BY 4.0', url: 'https://www.dndbeyond.com/srd',
        copyright: 'This work includes material taken from the System Reference Document 5.1 ("SRD 5.1") by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd, licensed under the Creative Commons Attribution 4.0 International License.' } };
    for (const d of open) if (used.has(d.slug)) sources[d.slug] = { title: d.title, licence: d.license, url: d.url, copyright: d.copyright || '' };
    fs.writeFileSync(OUT, JSON.stringify({ built: new Date().toISOString().slice(0, 10), sources, list: list.map((e) => [e.key, e.name, e.cr, e.type, e.src]) }));
    // the OGL has to travel with OGL content, followed by each book's section 15 notice
    const ogl = (await getJSON('https://api.open5e.com/v2/licenses/ogl-10a/')).desc;
    const notices = Object.values(sources).filter((x) => /open gaming/i.test(x.licence) && x.copyright).map((x) => x.copyright);
    fs.writeFileSync(OGL, ogl.trim() + '\n\nCopyright notices for the Open Game Content on the Monster Sheet:\n\n' + notices.join('\n\n') + '\n');
    console.log(`${entries.length} monsters, ${list.length} after removing duplicates, from ${used.size} sources -> ${OUT}`);
}

if (require.main === module) build().catch((e) => { console.error(e); process.exit(1); });
module.exports = { dedupe, nameKey };
