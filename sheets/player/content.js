// The one loader for rules content (ROADMAP 4.1 and 4.2), used by the sheet (hbSrd) and the character builder:
//   hbContent() -> srd-build.json, with the content files from sheets/player/content/ merged in when there are any
//                  (content/index.json is either the data itself, or {"files": ["classes.json", ...]} naming the files),
//                  through HbBuild.mergeContent (build.js); null when srd-build.json can't be loaded
//   hbSpellNames(d) -> fills d.spells with the SRD spells' names and levels (spells.php) where the content has none
//   hbIcons() -> icons.json: {classes|races|subclasses: {slug or "<class>--<subclass>": {svg, color, src}}}, or {}
// Each is fetched once per page; the browser caches the files.
(function () {
    'use strict';
    const get = (u) => fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    let content = null, spells = null, icons = null;
    window.hbContent = () => content || (content = (async () => {
        const srd = await get('/sheets/player/srd-build.json');
        if (!srd) return null;
        const idx = await get('/sheets/player/content/index.json');
        const names = Array.isArray(idx?.files) ? idx.files.filter((f) => /^[\w.-]+\.json$/.test(f)) : [];
        const files = names.length ? await Promise.all(names.map((f) => get('/sheets/player/content/' + f))) : idx ? [idx] : [];
        return HbBuild.mergeContent(srd, ...files.filter(Boolean));
    })());
    window.hbSpellNames = (d) => spells || (spells = get('/sheets/player/spells.php?list=2').then((list) => {
        for (const [i, name, level] of Array.isArray(list) ? list : []) if (!d.spells[i]) d.spells[i] = { name, level: +level || 0 };
        return d;
    }));
    window.hbIcons = () => icons || (icons = get('/sheets/player/icons.json').then((x) => x || {}));
})();
