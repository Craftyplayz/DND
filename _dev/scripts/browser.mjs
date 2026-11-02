// A headless Chrome or Firefox for the check scripts, with the same few calls for both:
//   const b = await launch('chrome' | 'firefox')
//   await b.go(url); await b.ev('js expression')   -> string/number/boolean value, else null
//   await b.block(/backup\.php|cloud\.php/)         requests whose URL matches fail
//   b.errors                                        console errors and uncaught exceptions since the last go()
//   b.close()
// Chrome is driven over the DevTools protocol, Firefox over WebDriver BiDi (Firefox has no DevTools protocol).
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const EXE = { chrome: 'C:/Program Files/Google/Chrome/Application/chrome.exe', firefox: 'C:/Program Files/Mozilla Firefox/firefox.exe' };
// CHECK_CHROME_PORT / CHECK_FIREFOX_PORT: other debugging ports, so two checks can run side by side
const CH_PORT = process.env.CHECK_CHROME_PORT || 9337, FF_PORT = process.env.CHECK_FIREFOX_PORT || 9338;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
const value = (v) => v && ['string', 'number', 'boolean'].includes(v.type) ? v.value : null;

export async function launch(name = 'chrome') {
    const profile = mkdtempSync(join(tmpdir(), `check-${name}-`)), errors = [];
    const proc = name === 'firefox'
        ? spawn(EXE.firefox, ['--headless', '--no-remote', '--profile', profile, `--remote-debugging-port=${FF_PORT}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] })
        : spawn(EXE.chrome, ['--headless=new', `--remote-debugging-port=${CH_PORT}`, `--user-data-dir=${profile}`, '--host-resolver-rules=MAP localhost 127.0.0.1', 'about:blank'], { stdio: 'ignore' });
    const close = () => { try { execSync(`taskkill /PID ${proc.pid} /T /F`, { stdio: 'ignore' }); } catch { } };
    try {
        if (name === 'firefox') {
            // Firefox prints "WebDriver BiDi listening on ws://..." once it's ready
            const ws = await new Promise((r, j) => {
                let out = ''; setTimeout(() => j(new Error('Firefox did not start')), 20000);
                proc.stderr.on('data', (d) => { const m = (out += d).match(/WebDriver BiDi listening on (ws:\/\/\S+)/); if (m) r(m[1]); });
            });
            let blocked = null;
            const send = await rpc(ws + '/session', (method, p) => {
                if (method === 'log.entryAdded' && p.level === 'error') errors.push(p.text);
                if (method === 'network.beforeRequestSent' && p.isBlocked) send(blocked.test(p.request.url) ? 'network.failRequest' : 'network.continueRequest', { request: p.request.request }).catch(() => { });
            });
            await send('session.new', { capabilities: {} });
            const context = (await send('browsingContext.getTree', {})).contexts[0].context;
            await send('session.subscribe', { events: ['log.entryAdded', 'network.beforeRequestSent'] });
            return {
                errors, close,
                go: async (url) => { errors.length = 0; await send('browsingContext.navigate', { context, url, wait: 'complete' }); },
                ev: async (expression) => {
                    const r = await send('script.evaluate', { expression, target: { context }, awaitPromise: true });
                    if (r.type === 'exception') throw new Error(r.exceptionDetails.text);
                    return value(r.result);
                },
                block: async (re) => { blocked = re; await send('network.addIntercept', { phases: ['beforeRequestSent'] }); },
            };
        }
        for (let i = 0; i < 50; i++) { try { if ((await fetch(`http://127.0.0.1:${CH_PORT}/json/version`)).ok) break; } catch { } await sleep(200); }
        const t = await (await fetch(`http://127.0.0.1:${CH_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
        let loaded = () => { };
        const send = await rpc(t.webSocketDebuggerUrl, (method, p) => {
            if (method === 'Page.loadEventFired') loaded();
            if (method === 'Runtime.exceptionThrown') errors.push(p.exceptionDetails.exception?.description || p.exceptionDetails.text);
            if (method === 'Runtime.consoleAPICalled' && p.type === 'error') errors.push(p.args.map((a) => a.value ?? a.description).join(' '));
            if (method === 'Log.entryAdded' && p.entry.level === 'error') errors.push(`${p.entry.text} ${p.entry.url || ''}`.trim());
        });
        await send('Page.enable'); await send('Network.enable'); await send('Runtime.enable'); await send('Log.enable');
        return {
            errors, close,
            go: async (url) => { errors.length = 0; const done = new Promise((r) => { loaded = r; }); await send('Page.navigate', { url }); await Promise.race([done, sleep(15000)]); },
            ev: async (expression) => {
                const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
                if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
                return value(r.result);
            },
            // shortcut: Chrome only takes glob patterns here, so a regex is turned into "*source*"; fine for plain file names
            block: (re) => send('Network.setBlockedURLs', { urls: re.source.split('|').map((s) => `*${s.replace(/\\/g, '')}*`) }),
        };
    } catch (e) { close(); throw e; }
}
