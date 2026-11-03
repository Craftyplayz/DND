// Condition icons (ROADMAP 1.7): a party character's conditions as round badges with the glyph knocked out (set C of
// _dev/mockups/condition-icons/, the owner's pick), on map tokens, fight cards and the Table view. One for each condition the
// player sheet lists (sheets/player/sheet.js CONDITIONS); a condition a player added themselves gets its first letter.
//   Conds.icon(name) -> an <svg> (currentColor, 24 x 24 box, sized by CSS) with the name as its title
//   Conds.row(names) -> <span class="cond-row"> with every icon, or '' for none
//   Conds.saves({ok, bad}) -> <span class="cond-saves"> with three success and three failure ticks
window.Conds = (() => {
    'use strict';
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    const S = 'fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"';
    const ear = 'M7.5 9.5a4.5 4.5 0 0 1 9 0c0 3.2-3 3.6-3 6.5a2.6 2.6 0 0 1-5 .8';
    const heart = 'M12 20.5s-8.5-5-8.5-11A4.6 4.6 0 0 1 12 7.2a4.6 4.6 0 0 1 8.5 2.3c0 6-8.5 11-8.5 11z';
    const bolt = 'M13.5 2 5 13.5h6l-1 8.5 9-12h-6.2z';
    const skull = 'M12 2.5a8 8 0 0 0-5 14.2V20h10v-3.3A8 8 0 0 0 12 2.5z';
    const rock = 'M5 19 2.5 11.5 8 5l8-1 5.5 6L19 19z';
    const slashC = '<path d="M4 20 20 4" fill="none" stroke="#000" stroke-width="5.5"/>';
    const slashX = `<path ${S} d="M4 20 20 4"/>`;
    const spiral = 'M12 12a1.6 1.6 0 1 1 3.2 0 3.2 3.2 0 1 1-6.4 0 4.8 4.8 0 1 1 9.6 0 6.4 6.4 0 1 1-12.8 0';
    // f: the glyph; c: parts cut out of it (drawn #000); x: drawn on top. The same shapes as the mockup's set C.
    const G = {
        Blinded: { f: `<path ${S} d="M2.5 12s3.4-5.5 9.5-5.5 9.5 5.5 9.5 5.5-3.4 5.5-9.5 5.5S2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.6" fill="currentColor"/>`, c: slashC, x: slashX },
        Charmed: { f: `<path d="${heart}"/>` },
        Deafened: { f: `<path ${S} d="${ear}"/>`, c: slashC, x: slashX },
        Frightened: { f: '<circle cx="12" cy="12" r="10.5"/>', c: '<circle cx="8.8" cy="10" r="1.7" fill="#000"/><circle cx="15.2" cy="10" r="1.7" fill="#000"/><ellipse cx="12" cy="16" rx="2.4" ry="3.2" fill="#000"/>' },
        Grappled: { f: `<g transform="rotate(-35 12 12)" ${S}><rect x="2.5" y="8.5" width="11" height="7" rx="3.5"/><rect x="10.5" y="8.5" width="11" height="7" rx="3.5"/></g>` },
        Incapacitated: { f: '<circle cx="12" cy="12" r="10.5"/>', c: '<path d="M7 12h10" fill="none" stroke="#000" stroke-width="3" stroke-linecap="round"/>' },
        Invisible: { f: `<g ${S} stroke-linecap="butt" stroke-dasharray="3.4 3"><circle cx="12" cy="7.5" r="4.4"/><path d="M3.5 21.5c0-5 3.8-8 8.5-8s8.5 3 8.5 8"/></g>` },
        Paralysed: { f: `<path d="${bolt}"/>` },
        Petrified: { f: `<path d="${rock}"/>`, c: '<path d="M12 4.5 10.5 11l3 2.5-1.5 6" fill="none" stroke="#000" stroke-width="1.8" stroke-linejoin="round"/>' },
        Poisoned: { f: `<path d="${skull}"/>`, c: '<circle cx="8.9" cy="11" r="2.1" fill="#000"/><circle cx="15.1" cy="11" r="2.1" fill="#000"/><path d="M12 13.8 11 15.8h2z" fill="#000"/><path d="M10.2 17.5V21M13.8 17.5V21" stroke="#000" stroke-width="1.2" fill="none"/>' },
        Prone: { f: `<circle cx="5" cy="10.5" r="2.7" fill="currentColor"/><path ${S} stroke-width="3" d="M9 13.5h8l3.5 3.5M10.5 13.5 9.5 17.5"/><path ${S} stroke-width="2" d="M2 21h20"/>` },
        Restrained: { f: `<rect x="3.5" y="10" width="17" height="12" rx="2.5"/><path ${S} d="M7.8 10.5v-3a4.2 4.2 0 0 1 8.4 0v3"/>`, c: '<circle cx="12" cy="14.8" r="1.9" fill="#000"/><path d="M12 15v3.4" stroke="#000" stroke-width="1.8" stroke-linecap="round"/>' },
        Stunned: { f: `<path ${S} d="${spiral}"/>` },
        Unconscious: { f: `<path ${S} d="M3.5 4.5h6.5l-6.5 8h6.5M13.5 12h5.5l-5.5 7h5.5"/>` },
    };
    G.Paralyzed = G.Paralysed;
    let uid = 0;
    // a round badge with the glyph cut out of it (the mask is the badge, the glyph black in it)
    function icon(name) {
        const g = G[name], id = 'cond' + (++uid), k = (s) => s.replace(/currentColor/g, '#000');
        const glyph = g ? `<g>${k(g.f)}</g><g>${(g.c || '').replace(/#000/g, '#fff')}</g>${k(g.x || '')}`
            : `<text x="12" y="17.2" text-anchor="middle" font-size="15" font-weight="700" font-family="system-ui, sans-serif">${esc(String(name).trim()[0] || '?').toUpperCase()}</text>`;
        return `<svg class="cond-ic" viewBox="0 0 24 24" role="img" aria-label="${esc(name)}"><title>${esc(name)}</title><mask id="${id}"><rect width="24" height="24" fill="#fff"/>`
            + `<g transform="translate(12 12) scale(.6) translate(-12 -12)" fill="#000">${glyph}</g></mask><circle cx="12" cy="12" r="11.5" fill="currentColor" mask="url(#${id})"/></svg>`;
    }
    const row = (names) => (names?.length ? `<span class="cond-row">${names.map(icon).join('')}</span>` : '');
    const saves = (s) => (s ? `<span class="cond-saves" role="img" aria-label="Death saves: ${s.ok} of 3 succeeded, ${s.bad} of 3 failed">`
        + [0, 1, 2].map((i) => `<i class="cs-ok${i < s.ok ? ' on' : ''}"></i>`).join('') + [0, 1, 2].map((i) => `<i class="cs-bad${i < s.bad ? ' on' : ''}"></i>`).join('') + '</span>' : '');
    return { icon, row, saves, KNOWN: Object.keys(G) };
})();
