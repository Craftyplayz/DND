# dnd.craftyplayz.com

Our D&D campaign tools, split out of craftyplayz.com:

- `/characters/` My Characters: a card per character, each opening at `/characters/<id>` in the homebrew sheet
  (signed in, each character has a folder in `private/dnd/accounts/characters/<id>/`, see includes/characters.php)
- `/characters/build` the character builder (ROADMAP 4.2): a new character step by step at any level, saved as a draft as
  you go; `?up=<id>` is Level up (4.3). Rules in `sheets/player/build.js`, content through `sheets/player/content.js`
- `/private/archive/characters/` the old D&D Beyond character viewer (cache still in `characters/cache/`)
- `/sheets/player/` Homebrew character sheet with a character picker (saved in the browser under `hb-sheet`, backed up to `private/dnd/backups/`)
- `/sheets/monster/` Monster sheet (backed up to `private/dnd/monster-backups/`)
- `/compendium/` Compendium: spells, monsters, items, magic items, classes, races, backgrounds, feats and rules, 2014 and 2024 (from `sheets/player/content/`, built by `_dev/scripts/build-content.mjs`)
- `/dice/` 3D dice sets, `/dice/rolls/` quick rolls, `/dice/test/` dice fairness test
- `/transcripts/` session recordings and transcripts (data in `transcripts/data/`, server only)
- `/private/` backup browsers and the session importer, behind HTTP basic auth

Plain PHP 7.4+ and Apache (`.htaccess`), no build step; in production a php:8.3-apache image (`Dockerfile`).
Shared layout is `includes/functions.php`
(the page list for the menu lives in `site_pages()`), styles are `assets/css/global.css` and `components.css`.

## Run it locally

```
php -S 127.0.0.1:8110 -t .
```

Then open http://127.0.0.1:8110/. PHP needs the curl extension for D&D Beyond, spells and monsters.
`.htaccess` is ignored by PHP's built-in server, so `/private/` opens without a password locally.

Tests: `node _dev/scripts/dnd-sheet-formula.test.js`, `dnd-sheet-ddb.test.js`, `dnd-monsters-dedupe.test.js`,
and `php _dev/scripts/auth-claims.test.php`.

## Google sign-in

Copy `includes/config.example.php` to `includes/config.php` (gitignored) and fill in the Google client ID and the
admin emails allowed into `/private/`. Without it there is no sign-in button and `/private/` is closed. Test sign-in
on http://localhost:8110 (Google accepts localhost origins, not 127.0.0.1). For `/characters/<id>` locally,
start the server with the router: `php -S 127.0.0.1:8110 -t . _dev/router.php`.

## Deploy

Every push to main builds `ghcr.io/craftyplayz/dnd:<commit sha>` (GitHub Actions). The Portainer stack `dnd`
(`compose.yml`) runs it twice on the Docker server: `dnd` is the live site (port 5762) and `dnd-test` the test site
(port 5763, red banner, noindex), each with its own data volumes.

```
bash _dev/deploy.sh test     # the test site runs this commit (push it first)
bash _dev/deploy.sh live     # the live site runs what the test site runs
```

Needs `PORTAINER_URL` and `PORTAINER_API_KEY` in the environment. Each site reads `config.php` and `.htpasswd` from a
host folder (`.env.example`), mounted read-only at `/etc/dnd`. `bash _dev/deploy.sh import [dir]` copies server-only
data (backups, cloud saves, transcripts, the D&D Beyond cache) from a local folder into the live volumes, and the
transcripts and cache on to the test site. See CLAUDE.md for the release workflow.
