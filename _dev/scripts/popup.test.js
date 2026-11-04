// The Compendium popup's setting follows the account: "compendium-popup" is in the KEYS list of sync.js and of prefs.php, the two lists
// are the same, and CLAUDE.md names it. The Compendium page and the Table view are the pages without the popup.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const ROOT = join(import.meta.dirname, '../..'), read = (f) => readFileSync(join(ROOT, f), 'utf8');
let bad = 0;
const ok = (name, cond) => { if (!cond) { bad++; console.log('FAIL ' + name); } };
const list = (src) => [...(/(?:const KEYS|const PF_KEYS) = \[([^\]]*)\]/.exec(src)?.[1] || '').matchAll(/'([^']+)'/g)].map((m) => m[1]);
const js = list(read('assets/js/sync.js')), php = list(read('prefs.php'));
ok('sync.js has the popup setting', js.includes('compendium-popup'));
ok('prefs.php has the popup setting', php.includes('compendium-popup'));
ok('the two KEYS lists are the same', JSON.stringify(js) === JSON.stringify(php));
ok('CLAUDE.md lists it', read('CLAUDE.md').includes('`compendium-popup`'));
ok('the Compendium page has no popup', /'nopopup' => true/.test(read('compendium/index.php')));
ok('page_head() loads the popup unless nopopup', /empty\(\$p\['nopopup'\]\)[\s\S]*popup\.js/.test(read('includes/functions.php')));
ok('the Table view has no popup', /'nopopup' => true/.test(read('campaigns/table.php')));
console.log(bad ? `${bad} failed` : 'popup ok');
process.exit(bad ? 1 : 0);
