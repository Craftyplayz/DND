# dnd.craftyplayz.com

Our D&D campaign tools, split out of craftyplayz.com:

- `/characters/` D&D Beyond character viewer (unofficial character API, cached in `characters/cache/`)
- `/sheets/player/` Homebrew character sheet (saved in the browser under `hb-sheet`, backed up to `private/dnd/backups/`)
- `/sheets/player-dev/` test copy of the player sheet: changes land here first
- `/sheets/monster/` Monster sheet (backed up to `private/dnd/monster-backups/`)
- `/dice/` 3D dice sets, `/dice/rolls/` quick rolls, `/dice/test/` dice fairness test
- `/transcripts/` session recordings and transcripts (data in `transcripts/data/`, server only)
- `/private/` backup browsers and the session importer, behind HTTP basic auth

Plain PHP 7.4+ and Apache (`.htaccess`), no build step. Shared layout is `includes/functions.php`
(the page list for the menu lives in `site_pages()`), styles are `assets/css/global.css` and `components.css`.

## Run it locally

```
php -S 127.0.0.1:8110 -t .
```

Then open http://127.0.0.1:8110/. PHP needs the curl extension for D&D Beyond, spells and monsters.
`.htaccess` is ignored by PHP's built-in server, so `/private/` opens without a password locally.

Tests: `node _dev/scripts/dnd-sheet-formula.test.js`, `dnd-sheet-ddb.test.js`, `dnd-monsters-dedupe.test.js`.

## Deploy

```
bash _dev/deploy.sh --dry-run   # list what would change
bash _dev/deploy.sh
```

Uploads committed files over SSH (key `~/.ssh/ionos`) to the IONOS web space. Set `DIR` in the script to the
subdomain's web-root folder first. It never uploads or deletes the server-only data: sheet backups, session
recordings, the D&D Beyond cache and `private/.htpasswd`.

First deploy only: create `private/.htpasswd` on the server and put its full path in `private/.htaccess`
(instructions are in that file). Until then `/private/` shows an error rather than opening.
