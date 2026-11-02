// Typo-tolerant name matching for the Compendium search. Fuzzy.score(query, text) is 0 for no match, otherwise higher is better:
// exact 1000 > starts with 900 > a word starts with 800 > contains 700 > a typo or two away 300-500.
// Every word of the query has to match, so "bag holdin" finds Bag of Holding. Loaded by the page and by the node test.
(function (root) {
    'use strict';
    const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/['\u2019`]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

    // edit distance with swaps counting as one, stopping early once it passes max
    function dist(a, b, max) {
        if (Math.abs(a.length - b.length) > max) return max + 1;
        let p2 = null, p1 = Array.from({ length: b.length + 1 }, (_, j) => j);
        for (let i = 1; i <= a.length; i++) {
            const row = [i];
            let low = i;
            for (let j = 1; j <= b.length; j++) {
                let v = Math.min(p1[j] + 1, row[j - 1] + 1, p1[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
                if (p2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, p2[j - 2] + 1);
                row.push(v);
                if (v < low) low = v;
            }
            if (low > max) return max + 1;
            p2 = p1; p1 = row;
        }
        return p1[b.length];
    }

    // one query word against normalised text
    function word(q, t) {
        if (t === q) return 1000;
        if (t.startsWith(q)) return 900 - Math.min(99, t.length - q.length);
        const ws = t.split(' ');
        if (ws.some((w) => w.startsWith(q))) return 800 - Math.min(99, t.length - q.length);
        if (t.includes(q)) return 700 - Math.min(99, t.length - q.length);
        if (q.length < 4) return 0;
        const max = q.length >= 8 ? 2 : 1;
        let best = max + 1;
        for (const w of ws) {
            // the word as a whole, or its first letters (the query may be unfinished)
            for (const n of [q.length - 1, q.length, q.length + 1]) best = Math.min(best, dist(q, w.slice(0, n), max));
            if (best === 0) break;
        }
        return best <= max ? 500 - best * 100 : 0;
    }

    function score(query, text) {
        const q = norm(query), t = norm(text);
        if (!q) return 1;
        if (q === t) return 1000;
        const ws = q.split(' ');
        let total = 0;
        for (const w of ws) {
            const s = word(w, t);
            if (!s) return 0;
            total += s;
        }
        return Math.round(total / ws.length);
    }

    const api = { score, norm, dist };
    if (typeof module === 'object' && module.exports) module.exports = api; else root.Fuzzy = api;
})(typeof window === 'object' ? window : globalThis);
