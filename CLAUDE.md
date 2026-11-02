# dnd.craftyplayz.com

Our D&D campaign tools (see README.md). Plain PHP 8.3 + Apache in Docker, run by the Portainer stack `dnd` on the
home Docker server (192.168.16.3) behind a Cloudflare Tunnel:

- `dnd` service = live, https://dnd.craftyplayz.com (host port 5762)
- `dnd-test` service = test, https://dndtest.craftyplayz.com (host port 5763), red "Test site" banner, noindex

Each service has its own volumes, so the test site never touches friends' backups, cloud saves or sessions.
Images are built by GitHub Actions on every push to main: `ghcr.io/craftyplayz/dnd:<commit sha>`.
All Portainer actions go through `_dev/deploy.sh`; don't call the Portainer API any other way.

## Workflow for every feature

1. Build it and run the tests (`node _dev/scripts/*.test.js`, `php _dev/scripts/auth-claims.test.php`) and the
   headless-Chrome checks locally (`php -S 127.0.0.1:8110 -t .`, open http://localhost:8110). If the change touches
   a sheet, also run the player-data check below; it must pass before anything is pushed.
2. Commit (small commits), push to main, run `bash _dev/deploy.sh test`, then check https://dndtest.craftyplayz.com
   loads with no console errors.
3. Ask the user with AskUserQuestion: "<feature> is on dndtest.craftyplayz.com. Push it to the live site?"
   Options: "Push to live" / "Not yet".
4. Only on "Push to live": run `bash _dev/deploy.sh live` and check https://dnd.craftyplayz.com.

The live site only ever gets the image that is on test (`deploy.sh live` copies TEST_TAG to LIVE_TAG).
`bash _dev/deploy.sh test` and `bash _dev/deploy.sh live` run without asking; anything else on the server
(`--compose`, `import`, `logs`, other API calls, deleting volumes) asks the user first.

## Everything follows the Google account

The user's goal: open the site on any device, sign in with Google, and everything is back exactly as they left
it. So every setting and every piece of data a player creates is saved to their account when they're signed in,
with the browser's copy kept for offline and signed-out use (the newest change wins, as the sheets' cloud saves
do). Signed out, everything keeps working from the browser alone.

- Every new feature that stores anything in the browser must also save it to the account in the same change,
  including settings and preferences, not just characters.
- Already following the account: player sheet characters (`hb-sheet`, `accounts/<sub>/`) and test-sheet
  characters (`hb-sheet-dev`, `accounts/dev/<sub>/`), each with its roll log and per-character view settings.
- Still browser-only (bring these over; tick them off here when done):
  - dice choice: set, sound, trails, nat 1/20 effects, coin (`dice-choice`, dice/choice.js)
  - monster sheet encounters (`monster-sheet`, sheets/monster/monster.js)
  - Dice Sets page state (`dice-sets-page`, `dice-sets-sound`, dice/dice.js)
  - D&D Beyond viewer roll mode (`dnd.rollMode`, characters/dnd.js)
  - dice fairness test tallies (`dice-test-counts`, dice/test/) - test data, lowest priority
- Keep the localStorage keys as they are (friends' data is under them); the account copy is added alongside.

## Player data must never be lost in an update

Friends' characters live in three places: their browser (localStorage `hb-sheet`, `hb-sheet-dev` for the test
sheet), their Google account (`private/dnd/accounts/<sub>/`, the test sheet in `accounts/dev/<sub>/`) and the
server backups (`private/dnd/backups/<ip>/`). An update may add to a character, never drop or change what's there.

- **Before pushing any sheet change**, prove the new code keeps everything the live code keeps:
  ```
  git worktree add --detach ../dnd-live <live commit>      # LIVE_TAG on the stack, or origin/main before your change
  php -S 127.0.0.1:8112 -t ../dnd-live                     # the live code
  php -S 127.0.0.1:8110 -t .                               # your change
  node _dev/scripts/sheet-keeps-data.mjs http://localhost:8110 http://localhost:8112
  ```
  It loads every saved character from the local `private/dnd/backups/` into both versions, opens each one and
  compares every value. It must end with `sheet keeps data ok`. Any FAIL is a data-loss bug: fix it, never
  weaken the check. Remove the worktree afterwards (`git worktree remove ../dnd-live`).
- Without the second URL the check compares against the raw saves. The sheet's own one-time upgrades show up
  there (hp.max -> hp.base, the Misc item category, CANTRIPd dice, the old Homebrew trackers panel); anything else
  is a bug.
- `normalise()` in sheet.js keeps only the keys that `blank()` has. A new field on a character must be added to
  `blank()` in both sheets, or it's thrown away on the next load (this is how the roll log used to vanish).
  Never rename or remove a field without an `upgrade()` step that carries the old value over.
- Never change the localStorage keys, the `accounts/<sub>/<character id>.json` layout, or the compose volume
  names (a renamed volume is a new, empty one).
- `deploy.sh test` and `deploy.sh live` count the files in every data folder of both services before and after
  the deploy and stop with "PLAYER DATA WENT MISSING" if any count went down. If that happens, stop, don't
  deploy anything else, and tell the user straight away.
- Test with signed-in sessions as well as signed out: a character must survive sign-in (uploaded), a new browser
  (pulled back from the account) and an edit on another device (newest "updated" wins).

## Rules

- Never commit, delete or overwrite server-only data: private/dnd/backups, private/dnd/monster-backups,
  private/dnd/accounts, private/sessions, transcripts/data, characters/cache, includes/config.php, .htpasswd, .env.
- Changes to the player sheet land on /sheets/player-dev/ first (localStorage key hb-sheet-dev); /sheets/player/
  keeps the key hb-sheet so friends' characters still load. The two sheets' account saves stay in separate folders,
  so a newer test sheet can never sync fields into the live one that it would drop.
- Never print or commit PORTAINER_API_KEY.
