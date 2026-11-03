import { launch } from '../../scripts/browser.mjs';
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
const b = await launch('chrome');
await b.go(pathToFileURL(fileURLToPath(new URL('./index.html', import.meta.url))).href);
console.log('errors', b.errors);
writeFileSync(process.argv[2], await b.shot(1300));
b.close();
