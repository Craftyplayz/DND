// Encounter difficulty and XP (ROADMAP 3.2): the tables and the sums, with no page code, so _dev/scripts/encounter-difficulty.test.js
// checks them against the books. Numbers only, no book text:
//   XP by CR and the 2014 thresholds and multipliers: the free Basic Rules (2014), Monsters and Building Combat Encounters
//   2024 budgets: System Reference Document 5.2.1 (CC BY 4.0), page 202, "XP Budget per Character"
(function (root) {
    'use strict';
    // CR 0 is 0 or 10 XP in the books; a saved monster doesn't say which, so it counts 10
    const XP = { 0: 10, 0.125: 25, 0.25: 50, 0.5: 100, 1: 200, 2: 450, 3: 700, 4: 1100, 5: 1800, 6: 2300, 7: 2900, 8: 3900, 9: 5000, 10: 5900,
        11: 7200, 12: 8400, 13: 10000, 14: 11500, 15: 13000, 16: 15000, 17: 18000, 18: 20000, 19: 22000, 20: 25000, 21: 33000, 22: 41000,
        23: 50000, 24: 62000, 25: 75000, 26: 90000, 27: 105000, 28: 120000, 29: 135000, 30: 155000 };
    // per character, levels 1 to 20
    const T2014 = [[25, 50, 75, 100], [50, 100, 150, 200], [75, 150, 225, 400], [125, 250, 375, 500], [250, 500, 750, 1100], [300, 600, 900, 1400], [350, 750, 1100, 1700],
        [450, 900, 1400, 2100], [550, 1100, 1600, 2400], [600, 1200, 1900, 2800], [800, 1600, 2400, 3600], [1000, 2000, 3000, 4500], [1100, 2200, 3400, 5100], [1250, 2500, 3800, 5700],
        [1400, 2800, 4300, 6400], [1600, 3200, 4800, 7200], [2000, 3900, 5900, 8800], [2100, 4200, 6300, 9500], [2400, 4900, 7300, 10900], [2800, 5700, 8500, 12700]];
    const T2024 = [[50, 75, 100], [100, 150, 200], [150, 225, 400], [250, 375, 500], [500, 750, 1100], [600, 1000, 1400], [750, 1300, 1700], [1000, 1700, 2100], [1300, 2000, 2600], [1600, 2300, 3100],
        [1900, 2900, 4100], [2200, 3700, 4700], [2600, 4200, 5400], [2900, 4900, 6200], [3300, 5400, 7800], [3800, 6100, 9800], [4500, 7200, 11700], [5000, 8700, 14200], [5500, 10700, 17200], [6400, 13200, 22000]];
    const RULES = {
        2014: { table: T2014, tiers: [['Easy', 'g'], ['Medium', 'b'], ['Hard', 'p'], ['Deadly', 'r']] },
        2024: { table: T2024, tiers: [['Low', 'g'], ['Moderate', 'b'], ['High', 'p']], above: ['Above High', 'r'] },
    };
    // the group-size steps; a party under 3 moves one step up (x5 is only reachable that way), 6 or more one step down (x0.5 likewise)
    const STEPS = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5];

    // a CR as a number: "1/4", "0.25", the fraction characters, or a leading number ("15 (lair)"); null when it can't be read
    function crValue(x) {
        const s = String(x ?? '').trim().replace('⅛', '1/8').replace('¼', '1/4').replace('½', '1/2');
        const f = /^(\d+)\s*\/\s*(\d+)/.exec(s);
        if (f) return +f[2] ? f[1] / f[2] : null;
        const n = /^\d*\.?\d+/.exec(s);
        return n ? +n[0] : null;
    }
    // XP for a CR, or null when it isn't on the table ("1/3", "31", "abc", nothing)
    const crXp = (x) => { const v = XP[crValue(x)]; return v === undefined ? null : v; };

    // typed levels: "5, 5, 4" or "4x5" (four level 5s). Anything unreadable is listed in bad; levels are brought into 1-20 and listed in moved
    function parseLevels(text) {
        const out = { levels: [], bad: [], moved: [] };
        const one = (raw) => {
            const l = Math.min(20, Math.max(1, raw));
            if (l !== raw && !out.moved.includes(raw)) out.moved.push(raw);
            return l;
        };
        for (const t of String(text ?? '').replace(/\s*[x×]\s*/gi, 'x').split(/[,;\s]+/).filter(Boolean)) {
            const many = /^(\d+)x(\d+)$/i.exec(t);
            // shortcut: 1000 at once is taken as a typing slip so a stray number can't hang the page; no real table gets near it
            if (many && +many[1] >= 1 && +many[1] <= 1000) { const l = one(+many[2]); for (let i = 0; i < +many[1]; i++) out.levels.push(l); }
            else if (/^\d+$/.test(t)) out.levels.push(one(+t));
            else out.bad.push(t);
        }
        return out;
    }

    function multiplier(monsters, partySize) {
        if (monsters < 1) return 1;
        let step = monsters === 1 ? 1 : monsters === 2 ? 2 : monsters <= 6 ? 3 : monsters <= 10 ? 4 : monsters <= 14 ? 5 : 6;
        if (partySize > 0 && partySize < 3) step++;
        if (partySize >= 6) step--;
        return STEPS[step];
    }

    // rules "2014" or "2024"; levels: one per character, 1-20; xp: one per monster (an unreadable CR counts as 0).
    // tier is null with no party or no monsters; reaching a threshold counts as that difficulty
    function rate(rules, levels, xp) {
        const R = RULES[rules] || RULES[2014], names = R.tiers;
        const total = xp.reduce((a, b) => a + b, 0);
        const mult = rules === '2024' ? 1 : multiplier(xp.length, levels.length);
        const adjusted = Math.floor(total * mult);
        const thresholds = levels.length ? names.map(([label], i) => [label, levels.reduce((a, l) => a + R.table[l - 1][i], 0)]) : [];
        let tier = null;
        if (levels.length && xp.length) {
            // Trivial is this site's word for under the lowest band; the books have none
            tier = { label: 'Trivial', cls: '', ours: true };
            thresholds.forEach(([label, n], i) => { if (adjusted >= n) tier = { label, cls: names[i][1] }; });
            if (R.above && adjusted > thresholds[thresholds.length - 1][1]) tier = { label: R.above[0], cls: R.above[1] };
        }
        return { rules: rules === '2024' ? '2024' : '2014', total, count: xp.length, mult, adjusted, thresholds, tier, lowest: names[0][0] };
    }

    const api = { crValue, crXp, parseLevels, multiplier, rate, XP, T2014, T2024 };
    if (typeof module === 'object' && module.exports) module.exports = api; else root.EncDiff = api;
})(typeof window === 'object' ? window : globalThis);
