// Shared by build-content.mjs and its source modules: a polite, cached fetch plus small text helpers.
// Requests to one host go one at a time with a pause between them; different hosts run side by side.
// Every response is cached under _dev/cache/content/<host>/ (gitignored), so a re-run reads disk, not the web.
// Set CONTENT_REFRESH=1 to fetch again. CONTENT_TOLERATE=1: a page the server keeps failing on counts as missing (not cached), for build-books.mjs.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

export const CACHE = join(import.meta.dirname, '../../cache/content');
const DELAY = 350;
const queues = new Map();   // host -> promise chain

export async function get(url, { json = false } = {}) {
    const u = new URL(url);
    const dir = join(CACHE, u.host);
    const file = join(dir, createHash('sha1').update(url).digest('hex') + (json ? '.json' : '.html'));
    if (!process.env.CONTENT_REFRESH && existsSync(file)) {
        const t = readFileSync(file, 'utf8');
        return t === '\u0000404' ? null : json ? JSON.parse(t) : t;
    }
    const run = async () => {
        for (let i = 0; i < 5; i++) {
            try {
                const r = await fetch(url, { headers: { 'User-Agent': 'dnd.craftyplayz.com content importer (one-off, cached)', Accept: json ? 'application/json' : 'text/html,*/*' } });
                if (r.status === 404) { mkdirSync(dir, { recursive: true }); writeFileSync(file, '\u0000404'); return null; }
                if (r.ok) { const t = await r.text(); mkdirSync(dir, { recursive: true }); writeFileSync(file, t); return json ? JSON.parse(t) : t; }
                if (r.status !== 429 && r.status < 500) throw new Error(r.status + ' ' + url);
            } catch (e) { if (/^\d{3} /.test(e.message)) throw e; }
            await new Promise((s) => setTimeout(s, 1000 * 2 ** i));
        }
        if (process.env.CONTENT_TOLERATE) { console.log('FAILED PAGE', url); return null; }
        throw new Error('failed ' + url);
    };
    const prev = queues.get(u.host) || Promise.resolve();
    const p = prev.then(() => run()).finally(() => new Promise((s) => setTimeout(s, DELAY)));
    queues.set(u.host, p.catch(() => {}));
    return p;
}
export const getJson = (url) => get(url, { json: true });

// "Path of the Berserker" -> "path-of-the-berserker"
export const slug = (s) => String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', mdash: '—', ndash: '–', hellip: '…', times: '×', minus: '−', frac12: '½' };
export const decode = (s) => s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e.toLowerCase()] ?? m);
// inline HTML -> plain text on one line
export const text = (html) => decode(String(html).replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
// block HTML -> paragraphs (the desc arrays the SRD data uses); list items get "- ", table rows "a | b"
export function paras(html) {
    const h = String(html)
        .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
        .replace(/<li[^>]*>/gi, '\n- ')
        .replace(/<\/t[dh]>\s*<t[dh][^>]*>/gi, ' | ')
        .replace(/<\/?(p|div|tr|h\d|ul|ol|table|blockquote|br)\b[^>]*>/gi, '\n');
    return h.split('\n').map(text).filter(Boolean);
}
