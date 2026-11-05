// A headless Chrome or Firefox for the check scripts, with the same few calls for both:
//   const b = await launch('chrome' | 'firefox')
//   await b.go(url); await b.ev('js expression')   -> string/number/boolean value, else null
//   await b.until('js expression', ms)             -> its first truthy value; throws "timed out ..." after ms (default 10 s)
//   await b.block(/backup\.php|cloud\.php/)         requests whose URL matches fail
//   b.errors                                        console errors and uncaught exceptions since the last go()
//   await b.key('Control', 'k')                    real key input (a chord: all down in order, then up); names: Control Shift Alt Backspace Delete Escape Enter Tab or one character
//   await b.drag([[x, y], [x2, y2], ...])           real mouse: press at the first point, move through the rest, release at the last (one point = a click)
//   await b.shot(width)                             -> PNG Buffer of the whole page at that window width
//   b.close()
//   browsers                                        ['chrome', 'firefox'], or just the one CHECK_BROWSER names
//   await serving(url)                              waits until a server the script started answers
// Chrome is driven over the DevTools protocol, Firefox over WebDriver BiDi (Firefox has no DevTools protocol).
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const EXE = { chrome: 'C:/Program Files/Google/Chrome/Application/chrome.exe', firefox: 'C:/Program Files/Mozilla Firefox/firefox.exe' };
// CHECK_CHROME_PORT / CHECK_FIREFOX_PORT: the debugging ports (check-all gives each job its own); unset, the system picks a free one
const CH_PORT = process.env.CHECK_CHROME_PORT || 0, FF_PORT = process.env.CHECK_FIREFOX_PORT || 0;
// CHECK_BROWSER=chrome|firefox: a check that loops over both browsers runs in that one only (check-all runs each browser as its own job)
export const browsers = process.env.CHECK_BROWSER ? [process.env.CHECK_BROWSER] : ['chrome', 'firefox'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// polls fn until it gives something truthy; throws `what` after ms
const within = (p, ms, what) => { let t; return Promise.race([p, new Promise((_, no) => { t = setTimeout(() => no(new Error(what)), ms); })]).finally(() => clearTimeout(t)); };
async function poll(fn, ms, what) {
    for (const t = Date.now(); ;) {
        // a call the browser never answers counts as a failed one, or this limit would never be reached
        const v = await within(fn(), ms, what).catch(() => null);
        if (v) return v;
        if (Date.now() - t > ms) throw new Error(what);
        await sleep(50);
    }
}
export const serving = (url, ms = 15000) => poll(() => fetch(url).then((r) => (r.body?.cancel(), true)), ms, `nothing answers at ${url} after ${ms} ms`);
// Google's sign-in frame (accounts.google.com) logs a notice about its own report-only CSP; it is Google's, not the site's
// (the site sends no CSP). Only these exact messages, Chrome's and Firefox's wording, are left out; every other error counts.
const GOOGLE_CSP = new RegExp('^(' + [
    String.raw`Framing 'https://accounts\.google\.com/' violates the following report-only Content Security Policy directive: "frame-ancestors 'self'"\. The violation has been logged, but no further action has been taken\.( \S+)?`,
    String.raw`Content-Security-Policy: \(Report-Only policy\) The page’s settings would block the loading of a resource \(frame-ancestors\) at <unknown> because it violates the following directive: “frame-ancestors 'self'”`,
].join('|') + ')$');

// a websocket that sends {id, method, params} and resolves with the reply; other messages go to onEvent
async function rpc(url, onEvent) {
    const ws = new WebSocket(url); await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
    let id = 0; const p = new Map();
    ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (p.has(m.id)) { p.get(m.id)(m); p.delete(m.id); } else if (m.method) onEvent(m.method, m.params); });
    return (method, params = {}) => new Promise((r, j) => {
        const i = ++id;
        p.set(i, (m) => m.error ? j(new Error(`${method}: ${m.message || JSON.stringify(m.error)}`)) : r(m.result));
        ws.send(JSON.stringify({ id: i, method, params }));
    });
}
// real input: Chrome through Input.dispatch*, Firefox through BiDi input.performActions (key names to each browser's codes)
const NAMED = { Control: ['Control', 'ControlLeft', 17, 2, '\uE009'], Shift: ['Shift', 'ShiftLeft', 16, 8, '\uE008'], Alt: ['Alt', 'AltLeft', 18, 1, '\uE00A'], Backspace: ['Backspace', 'Backspace', 8, 0, '\uE003'], Delete: ['Delete', 'Delete', 46, 0, '\uE017'],
    Escape: ['Escape', 'Escape', 27, 0, '\uE00C'], Enter: ['Enter', 'Enter', 13, 0, '\uE007'], Tab: ['Tab', 'Tab', 9, 0, '\uE004'], '-': ['-', 'Minus', 189, 0, '-'] };
const chromeKey = (n) => { const [key, code, vk, mod] = NAMED[n] || [n, 'Key' + n.toUpperCase(), n.toUpperCase().charCodeAt(0), 0]; return { key, code, windowsVirtualKeyCode: vk, mod }; };
const value = (v) => v && ['string', 'number', 'boolean'].includes(v.type) ? v.value : null;
const FF_ENDS = ['browsingContext.load', 'browsingContext.fragmentNavigated', 'browsingContext.navigationFailed'];

// a browser that fails to start (Firefox losing its first tab, a port still held by the browser before) gets one more try
export async function launch(name = 'chrome') {
    try { return await start(name); }
    catch (e) { console.error(`browser.mjs: ${name} did not start (${e.message}), starting it again`); return start(name); }
}

async function start(name) {
    const profile = mkdtempSync(join(tmpdir(), `check-${name}-`)), errors = [];
    const note = (e) => { if (!GOOGLE_CSP.test(e)) errors.push(e); };
    const proc = name === 'firefox'
        ? spawn(EXE.firefox, ['--headless', '--no-remote', '--profile', profile, `--remote-debugging-port=${FF_PORT}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] })
        : spawn(EXE.chrome, ['--headless=new', `--remote-debugging-port=${CH_PORT}`, `--user-data-dir=${profile}`, '--host-resolver-rules=MAP localhost 127.0.0.1', 'about:blank'], { stdio: 'ignore' });
    const close = () => { try { execSync(`taskkill /PID ${proc.pid} /T /F`, { stdio: 'ignore' }); } catch { } };
    // an element (or any object) counts as true; ev itself only gives back strings, numbers and booleans
    // The page checks the expression once a frame for up to a second per call: asking from here every few ms instead
    // starves the page's own rendering (an IntersectionObserver never fired). An element counts as true; a page that is
    // replaced mid-wait (a navigation) just makes that call fail, and the next one asks the new page.
    const until = async (ev, expression, ms = 10000) => poll(() => ev(`new Promise((done) => { const t = Date.now(), f = () => {
        let v; try { v = (${expression}); } catch (e) { }
        if (v && typeof v === 'object') v = true;
        if (v || Date.now() - t > 1000) done(v || null); else requestAnimationFrame(f); }; f(); })`), ms,
        `timed out after ${ms} ms waiting for: ${expression.replace(/\s+/g, ' ').slice(0, 300)}`);
    try {
        if (name === 'firefox') {
            // Firefox prints "WebDriver BiDi listening on ws://..." once it's ready
            const ws = await new Promise((r, j) => {
                let out = ''; setTimeout(() => j(new Error('Firefox did not start')), 20000);
                proc.stderr.on('data', (d) => { const m = (out += d).match(/WebDriver BiDi listening on (ws:\/\/\S+)/); if (m) r(m[1]); });
            });
            let blocked = null;
            const ended = new Set(); // navigations that have finished, by id
            const send = await rpc(ws + '/session', (method, p) => {
                if (FF_ENDS.includes(method)) ended.add(p.navigation);
                if (method === 'log.entryAdded' && p.level === 'error') note(p.text);
                if (method === 'network.beforeRequestSent' && p.isBlocked) send(blocked.test(p.request.url) ? 'network.failRequest' : 'network.continueRequest', { request: p.request.request }).catch(() => { });
            });
            // now and then a fresh Firefox never answers this at all; that is a browser that didn't start, which launch() tries once more
            await within(send('session.new', { capabilities: {} }), 15000, 'Firefox did not start: no answer to session.new');
            // a fresh Firefox can answer before its first tab exists, and can swap that tab for a new one while it starts
            // ("BrowsingContext does no longer exist"): wait for a tab that runs a script
            const context = await poll(async () => {
                const c = (await send('browsingContext.getTree', {})).contexts[0]?.context;
                return c && (await send('script.evaluate', { expression: '1', target: { context: c }, awaitPromise: false }), c);
            }, 15000, 'Firefox has no tab that answers');
            await send('session.subscribe', { events: ['log.entryAdded', 'network.beforeRequestSent', ...FF_ENDS] });
            const ev = async (expression) => {
                const r = await send('script.evaluate', { expression, target: { context }, awaitPromise: true });
                if (r.type === 'exception') throw new Error(r.exceptionDetails.text);
                return value(r.result);
            };
            return {
                errors, close, ev, until: (e, ms) => until(ev, e, ms),
                // not wait: 'complete': Firefox answers that as soon as the old page calls history.replaceState, with the old page still there and
                // the new one about to replace it. So wait for this navigation's own end. The same 15 s limit as Chrome's.
                go: async (url) => {
                    errors.length = 0;
                    const r = await Promise.race([send('browsingContext.navigate', { context, url, wait: 'none' }), sleep(15000)]);
                    if (r) await poll(async () => ended.has(r.navigation), 15000, url).catch(() => { });
                },
                key: (...names) => { const v = (n) => (NAMED[n] ? NAMED[n][4] : n); return send('input.performActions', { context, actions: [{ type: 'key', id: 'kb', actions: [...names.map((n) => ({ type: 'keyDown', value: v(n) })), ...[...names].reverse().map((n) => ({ type: 'keyUp', value: v(n) }))] }] }); },
                drag: (pts) => send('input.performActions', { context, actions: [{ type: 'pointer', id: 'mouse', parameters: { pointerType: 'mouse' }, actions: [
                    { type: 'pointerMove', x: Math.round(pts[0][0]), y: Math.round(pts[0][1]), origin: 'viewport' }, { type: 'pointerDown', button: 0 },
                    ...pts.slice(1).map(([x, y]) => ({ type: 'pointerMove', x: Math.round(x), y: Math.round(y), origin: 'viewport' })), { type: 'pointerUp', button: 0 }] }] }),
                block: async (re) => { blocked = re; await send('network.addIntercept', { phases: ['beforeRequestSent'] }); },
                shot: async (width, height = 800) => {
                    await send('browsingContext.setViewport', { context, viewport: { width, height }, devicePixelRatio: 1 });
                    const r = await send('browsingContext.captureScreenshot', { context, origin: 'document' });
                    return Buffer.from(r.data, 'base64');
                },
            };
        }
        // this browser writes its port to DevToolsActivePort in its own new profile once it listens, so a browser that a check
        // just closed and that still answers on the port is never taken for it (that was art-sync's "connection refused")
        const port = await poll(async () => readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0], 15000, 'Chrome did not start');
        await poll(() => fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.ok), 15000, `Chrome does not answer on ${port}`);
        const t = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
        let loaded = () => { };
        const send = await rpc(t.webSocketDebuggerUrl, (method, p) => {
            if (method === 'Page.loadEventFired') loaded();
            if (method === 'Runtime.exceptionThrown') note(p.exceptionDetails.exception?.description || p.exceptionDetails.text);
            if (method === 'Runtime.consoleAPICalled' && p.type === 'error') note(p.args.map((a) => a.value ?? a.description).join(' '));
            if (method === 'Log.entryAdded' && p.entry.level === 'error') note(`${p.entry.text} ${p.entry.url || ''}`.trim());
        });
        await send('Page.enable'); await send('Network.enable'); await send('Runtime.enable'); await send('Log.enable');
        const ev = async (expression) => {
            const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
            if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
            return value(r.result);
        };
        return {
            errors, close, ev, until: (e, ms) => until(ev, e, ms),
            go: async (url) => { errors.length = 0; const done = new Promise((r) => { loaded = r; }); await send('Page.navigate', { url }); await Promise.race([done, sleep(15000)]); },
            // shortcut: Chrome only takes glob patterns here, so a regex is turned into "*source*"; fine for plain file names
            shot: async (width, height = 800) => {
                await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
                await send('Page.bringToFront'); const h = (await send('Runtime.evaluate', { expression: 'document.documentElement.scrollHeight', returnByValue: true })).result.value;
                await send('Emulation.setDeviceMetricsOverride', { width, height: Math.max(height, h), deviceScaleFactor: 1, mobile: false });
                return Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64');
            },
            key: async (...names) => {
                const ks = names.map(chromeKey); let mods = 0;
                for (const k of ks) { mods |= k.mod; await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k.key, code: k.code, windowsVirtualKeyCode: k.windowsVirtualKeyCode, modifiers: mods }); }
                for (const k of [...ks].reverse()) { await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k.key, code: k.code, windowsVirtualKeyCode: k.windowsVirtualKeyCode, modifiers: mods }); mods &= ~k.mod; }
            },
            drag: async (pts) => {
                const m = (type, [x, y], extra = {}) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, ...extra });
                await m('mouseMoved', pts[0], { button: 'none' }); await m('mousePressed', pts[0], { buttons: 1 });
                for (const p of pts.slice(1)) await m('mouseMoved', p, { buttons: 1 });
                await m('mouseReleased', pts.at(-1), { buttons: 0 });
            },
            block: (re) => send('Network.setBlockedURLs', { urls: re.source.split('|').map((s) => `*${s.replace(/\\/g, '')}*`) }),
        };
    } catch (e) { close(); throw e; }
}
