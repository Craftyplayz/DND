# dnd.craftyplayz.com

Our D&D campaign tools (see README.md). Plain PHP 8.3 + Apache in Docker, run by the Portainer stack `dnd` on the
home Docker server (192.168.16.3) behind a Cloudflare Tunnel:

- `dnd` service = live, https://dnd.craftyplayz.com (host port 5762)
- `dnd-test` service = test, https://dndtest.craftyplayz.com (host port 5763), red "Test site" banner, noindex

Each service has its own volumes, so the test site never touches friends' backups, cloud saves or sessions.
Images are built by GitHub Actions on every push to main: `ghcr.io/craftyplayz/dnd:<commit sha>`.
All Portainer actions go through `_dev/deploy.sh`; don't call the Portainer API any other way.

## Workflow for every feature

1. Build it and run every test (each `node _dev/scripts/*.test.js` and each `php _dev/scripts/*.test.php`) and the
   headless-Chrome checks locally (`php -S 127.0.0.1:8110 -t .`, open http://localhost:8110). Run the same checks in
   headless Firefox too; everything must work in both browsers. `node _dev/scripts/pages-ok.mjs` opens every page
   in both and must end with `pages ok`; drive either browser from your own checks with `launch('chrome' |
   'firefox')` in `_dev/scripts/browser.mjs`. If the change touches a sheet, also run the player-data check below,
   in both browsers (add `--firefox`); it must pass before anything is pushed.
   - `node _dev/scripts/check-all.mjs` is the one command for the whole suite: every test and every browser check,
     in both browsers, side by side. It ends with `all checks ok`. `--only a,b` runs just those checks;
     `--data <old URL>` adds the player-data check in both browsers.
   - The whole suite runs once per item. When the work is split between an agent that builds and a merge, the
     builder runs the checks for what it changed (its own new checks plus the existing checks for the pages and
     files it touched, with `--only`), and the merge runs the whole suite plus the player-data check
     (`check-all.mjs --data <old URL>`) before anything is pushed. Working alone, run the whole suite once before
     pushing.
2. Commit (small commits), push to main, run `bash _dev/deploy.sh test`, then check https://dndtest.craftyplayz.com
   loads with no console errors in both Chrome and Firefox.
3. Every change goes to dndtest.craftyplayz.com straight away (steps 1-2), without asking. Tell the user it's there.
4. Never deploy to dnd.craftyplayz.com unless the user explicitly tells you to in that message (e.g. "push it to
   live"). Don't ask whether to; wait for them to say it. Then run `bash _dev/deploy.sh live` and check
   https://dnd.craftyplayz.com.

Test a lot before deploying anything, even a small change: friends use this site, and a broken page or lost
character is worse than a slower release. Run the whole suite above (once per item, as step 1 says), not just the
tests for the part you changed, then use what you changed in both browsers the way a player would (click through it,
reload, sign in and out), and check the pages around it still work. New code gets a new test in `_dev/scripts/` in
the same change. If any check fails or can't run, don't deploy; fix it or tell the user.

The live site only ever gets the image that is on test (`deploy.sh live` copies TEST_TAG to LIVE_TAG).
`bash _dev/deploy.sh test` runs without asking; `bash _dev/deploy.sh live` only when the user has told you to; anything else on the server
(`--compose`, `import`, `logs`, other API calls, deleting volumes) asks the user first.

## Everything follows the Google account

The user's goal: open the site on any device, sign in with Google, and everything is back exactly as they left
it. So every setting and every piece of data a player creates is saved to their account when they're signed in,
with the browser's copy kept for offline and signed-out use (the newest change wins, as the sheets' cloud saves
do). Signed out, everything keeps working from the browser alone.

- Every new feature that stores anything in the browser must also save it to the account in the same change,
  including settings and preferences, not just characters.
- Following the account, each with its roll log and per-character view settings:
  - player sheet characters (`hb-sheet`, a folder per character in `accounts/characters/<id>/`,
    sheets/player/cloud.php + includes/characters.php; open at /characters/<id>)
  - monster sheet monsters (`monster-sheet`, `accounts/monsters/<sub>/`)
  - settings, through assets/js/sync.js and prefs.php (`accounts/prefs/<sub>.json`): dice choice (`dice-choice`),
    Dice Sets page (`dice-sets-page`, `dice-sets-sound`), D&D Beyond viewer roll mode (`dnd.rollMode`)
- Not synced, by the user's choice: dice fairness test tallies (`dice-test-counts`).
- How to add more: a list of things a player builds up (characters, monsters) gets per-item sync like the
  sheets (a cloud.php wrapper with its own `CL_ACCOUNTS` folder, `updated` stamped on edits only); a setting
  goes in the KEYS list of both sync.js and prefs.php. sync.js watches localStorage, so the page's own code
  doesn't change.
- Keep the localStorage keys as they are (friends' data is under them); the account copy is added alongside.

## Player data must never be lost in an update

Friends' characters live in three places: their browser (localStorage `hb-sheet`; the archived test sheet's
`hb-sheet-dev` is copied across once by the sheet), their Google account (`private/dnd/accounts/characters/<id>/`; the archived
test sheet's `accounts/dev/characters/` stays on the server) and the
server backups (`private/dnd/backups/<ip>/`). An update may add to a character, never drop or change what's there.

- **Before pushing any sheet change**, prove the new code keeps everything the live code keeps:
  ```
  git worktree add --detach ../dnd-live <live commit>      # LIVE_TAG on the stack, or origin/main before your change
  php -S 127.0.0.1:8112 -t ../dnd-live                     # the live code
  php -S 127.0.0.1:8110 -t .                               # your change
  node _dev/scripts/sheet-keeps-data.mjs http://localhost:8110 http://localhost:8112
  node _dev/scripts/sheet-keeps-data.mjs http://localhost:8110 http://localhost:8112 --firefox
  ```
  (`node _dev/scripts/check-all.mjs --data http://localhost:8112` runs both, against its own server of your change,
  alongside the rest of the suite.)
  It loads every saved character from the local `private/dnd/backups/` into both versions, opens each one and
  compares every value. It must end with `sheet keeps data ok`. Any FAIL is a data-loss bug: fix it, never
  weaken the check. Remove the worktree afterwards (`git worktree remove ../dnd-live`).
- Without the second URL the check compares against the raw saves. The sheet's own one-time upgrades show up
  there (hp.max -> hp.base, the Misc item category, CANTRIPd dice, the old Homebrew trackers panel); anything else
  is a bug.
- `normalise()` in sheet.js keeps only the keys that `blank()` has. A new field on a character must be added to
  `blank()` in both sheets, or it's thrown away on the next load (this is how the roll log used to vanish).
  Never rename or remove a field without an `upgrade()` step that carries the old value over.
- A character's folder holds `character.json` (exactly what the sheet saves), `meta.json` (owner, visibility
  private/public, created, campaigns, archived), `history/<n>.json` (every saved version; a save that changes only the
  roll log or view settings makes none), `history/names.json` and `history/restored.json` (version names and restores,
  so a version's file never changes) and, once uploaded, the portrait
  `art.<jpg|png|webp|gif>` (a replaced one moves to `history/art-<n>.<ext>`; the character keeps only `artUrl`). Players
  never delete characters, monsters or notes: they archive them (an `archived` time on the item, synced like any edit).
  Folders deleted before that sit in `accounts/characters/.deleted/` for the admin only; nothing is unlinked. The older `accounts/<sub>/<id>.json` files were copied into
  folders once per account (`.copied` marks it) and stay where they are, no longer written.
- Never change the localStorage keys, the character folder layout, or the compose volume
  names (a renamed volume is a new, empty one).
- `deploy.sh test` and `deploy.sh live` count the files in every data folder of both services before and after
  the deploy and stop with "PLAYER DATA WENT MISSING" if any count went down. If that happens, stop, don't
  deploy anything else, and tell the user straight away.
- Test with signed-in sessions as well as signed out: a character must survive sign-in (uploaded), a new browser
  (pulled back from the account) and an edit on another device (newest "updated" wins).

## Design

- /design (design/index.php) is the design guide for every page: read it before building or restyling a page and
  follow it (tokens, components, layout, writing, checklist). It was copied from craftyplayz.com/design with the
  parts that aren't about this site taken out.
- When the user overrides a design choice (asks for something the guide says differently, or that it doesn't
  cover), do what they asked, then ask with AskUserQuestion whether to make it the new default in the guide.
  On yes, update design/index.php in the same change.

## Rules

- Ask, don't guess. When something about a request is unclear, could mean more than one thing, or needs a choice
  the user hasn't made (what it should look like, how it should behave, which option, what to call it), ask with
  AskUserQuestion before building it. Never fill the gap with an assumption and carry on. Put all the open
  questions in one AskUserQuestion call (up to 4), each standing on its own, with the options you see and your
  recommendation first.
- Never commit, delete or overwrite server-only data: private/dnd/backups, private/dnd/monster-backups,
  private/dnd/accounts, private/sessions, transcripts/data, characters/cache, includes/config.php, .htpasswd, .env.
- Player sheet changes go straight into sheets/player/, the one sheet code: /sheets/player/ and every
  /characters/<id> run it, so a change applies to both. Never make or use a test copy of the sheet (the old
  /sheets/player-dev/ is archived in private/archive/sheets/player-dev/). Changes are tried on dndtest (its own browser
  storage and volumes) and must pass the player-data check and `node _dev/scripts/characters-page.mjs` first.
  The localStorage key stays hb-sheet so friends' characters still load.
- Never print or commit PORTAINER_API_KEY.
- Never delete a file. Move it with `git mv` into `private/archive/`, keeping its path (`index.php` ->
  `private/archive/index.php`, a second copy gets a date: `index.2026-11-02.php`). `private/` is behind the site
  password (private/.htaccess), so archived pages stay reachable at /private/archive/ for the user only.
