// The one loader for rules content (ROADMAP 4.1 and 4.2), used by the sheet (hbSrd) and the character builder:
//   hbContent(rules, keys) -> the rules version's data ('2014' or '2024', never mixed: the same index can be in both): for 2014
//                  srd-build.json, plus the content files (sheets/player/content/index.json lists them by rules version and the
//                  kinds each holds) that have any of keys (e.g. ['classes', 'races'], ['spells'], ['equipment']), merged in through
//                  HbBuild.addContent (build.js) as they're asked for. Each file loads once per page. null when srd-build.json can't load.
//   hbContent.versions() -> ['2014'] or ['2014', '2024'] (the rules versions there is content for); hbContent.credits() -> its sources
//   hbSpellNames(d) -> fills d.spells with the SRD spells' names and levels (spells.php) where the content has none
//   hbIcons() -> icons.json: {classes|races|subclasses: {slug or "<class>--<subclass>": {svg, color, src}}}, or {}
(function () {
    'use strict';
    const get = (u) => fetch(u).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const files = {}, sets = {};
    let srd = null, index = null, spells = null, icons = null;
    const idx = () => index || (index = get('/sheets/player/content/index.json').then((x) => (Array.isArray(x?.files) ? x : { files: [] })));
    window.hbContent = async (rules = '2014', keys = []) => {
        const base = await (srd || (srd = get('/sheets/player/srd-build.json')));
        if (!base) { srd = null; return null; }
        const D = sets[rules] || (sets[rules] = HbBuild.mergeContent(rules === '2014' ? base : { meta: base.meta }));
        const want = (await idx()).files.filter((f) => f && (f.rules || '2014') === rules && /^[\w.-]+\.json$/.test(f.file || '') && (f.keys || []).some((k) => keys.includes(k)));
        await Promise.all(want.map(async (f) => {
            const j = await (files[f.file] || (files[f.file] = get('/sheets/player/content/' + f.file)));
            if (j && !D.loaded.includes(f.file)) { HbBuild.addContent(D, j, rules); D.loaded.push(f.file); }
        }));
        return D;
    };
    window.hbContent.credits = async () => (await idx()).credits || []; // [{src, name, ...}], the sources the content credits
    window.hbContent.versions = async () => ['2014', ...((await idx()).files.some((f) => f?.rules === '2024') ? ['2024'] : [])];
    window.hbSpellNames = (d) => spells || (spells = get('/sheets/player/spells.php?list=2').then((list) => {
        for (const [i, name, level] of Array.isArray(list) ? list : []) if (!d.spells[i]) d.spells[i] = { name, level: +level || 0, rules: '2014' };
        return d;
    }));
    window.hbIcons = () => icons || (icons = get('/sheets/player/icons.json').then((x) => x || {}));
})();
