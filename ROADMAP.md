# Roadmap: dnd.craftyplayz.com

## Summary

dnd.craftyplayz.com is our own D&D toolset: a homebrew character sheet, a monster sheet, 3D dice and session
recordings. A few groups use it: 2-4 groups with different DMs, under 25 people, playing both in person (phones
and laptops) and online (Discord). The goal is to have what D&D Beyond does (building characters, a
compendium, homebrew, campaigns, and live play with shared dice and initiative), built only on SRD 5.1 /
Creative Commons rules content, and looking good on every device.

Two rules sit above every item in this plan (details in CLAUDE.md):

- **Everything follows the Google account.** Anything a player creates or sets is saved to their account
  when signed in, and kept in the browser for offline and signed-out use. The newest change wins.
- **Player data is never lost.** An update may add to a character but never drop or change what's there.

This plan was written from an interview with the owner (2026-11-02). Every "how it should work" below is
their answer, not a guess. If something here is unclear, the owner's answers recorded in this file decide; if
they don't cover it, ask the owner (AskUserQuestion, all open questions in one go) before building. Never fill
the gap with a guess.

---

## How every feature is shipped

The same for every item below (from CLAUDE.md):

0. Building or restyling a page: read the design guide at `/design` (`design/index.php`) first and follow it.
   When the owner overrides it, do what they asked, then ask whether to make it the guide's new default.
1. Build it locally (`php -S 127.0.0.1:8110 -t .`). New code gets a new test in `_dev/scripts/` in the same
   change. Run the whole suite (once per item, as below), not just the part you changed: every `node _dev/scripts/*.test.js`, every
   `php _dev/scripts/*.test.php`, and `node _dev/scripts/pages-ok.mjs` (every page in headless Chrome and
   Firefox; must end with `pages ok`). Everything must work in both browsers (`launch('chrome' | 'firefox')`
   in `_dev/scripts/browser.mjs`).
   `node _dev/scripts/check-all.mjs` is the one command for the whole suite (every test and every browser check, in
   both browsers, side by side; ends with `all checks ok`; `--only a,b` for some checks, `--data <old URL>` adds
   the player-data check in both browsers). The whole suite runs once per item: when the work is split between an
   agent that builds and a merge, the builder runs the checks for what it changed (its own new checks plus the
   existing checks for the pages and files it touched, with `--only`), and the merge runs the whole suite plus the
   player-data check (`check-all.mjs --data <old URL>`) before anything is pushed. Working alone, run the whole
   suite once before pushing.
2. If it touches a sheet: run `_dev/scripts/sheet-keeps-data.mjs` against the live code, once plain and once with
   `--firefox` (`check-all.mjs --data <old URL>` runs both). Both must end with `sheet keeps data ok`. Player
   sheet changes also run `node _dev/scripts/characters-page.mjs`. Test signed in and signed out: survives sign-in, a new browser, and
   an edit on another device.
3. Use the change in both browsers the way a player would (click through, reload, sign in and out) and check the
   pages around it. If any check fails or can't run, don't deploy: fix it or tell the owner.
4. Player sheet changes go straight into `sheets/player/` (the code `/characters/<id>` runs too) and are tried on
   dndtest first. Never make a test copy of the sheet; the old `/sheets/player-dev/` is archived in
   `private/archive/sheets/player-dev/`.
5. Commit in small commits, push to main, run `bash _dev/deploy.sh test` (no need to ask), then check
   dndtest.craftyplayz.com loads with no console errors in Chrome and Firefox. Tell the owner it's there.
6. Never deploy to live unless the owner says so in that message ("push it to live"). Don't ask whether to; wait.
   Then run `bash _dev/deploy.sh live` (it copies the test image to live) and check dnd.craftyplayz.com. Anything
   else on the server (`--compose`, `import`, `logs`, deleting volumes) asks the owner first.

Files are never deleted: move them with `git mv` into `private/archive/`, keeping their path.

**No limits.** The owner wants no app-imposed limits anywhere: unlimited characters, campaigns, monsters,
dice presets, homebrew, everything. Don't add count caps. Only real limits stay: the host proxy rejects
request bodies near 8 MB, so big uploads are sent in chunks (as the transcript importer does).

**Where new account data lives.** Everything new goes inside the existing `accounts` volume
(`private/dnd/accounts/`), so no new compose volume is needed and `deploy.sh` already counts it. Google `sub`
IDs are numeric (`auth_claims_ok` checks this), so named folders can't clash with a user folder.

| Path under `private/dnd/accounts/` | Holds | Status |
|---|---|---|
| `characters/<id>/` | player sheet characters: `character.json`, `meta.json` (owner, visibility, created, campaigns), `history/<n>.json` | exists |
| `characters/<id>/art.<ext>` | character portraits (owner's choice: in the character's folder; replaced ones in `history/art-<n>.<ext>`) | exists (0.4) |
| `characters/.deleted/` | deleted character folders (moved, never unlinked) | exists |
| `<sub>/<character id>.json` | the older per-account files, copied into folders once (`.copied`), no longer written | kept as is |
| `dev/characters/` | the archived test sheet's characters | kept as is |
| `monsters/<sub>/<monster id>.json` | monster sheet monsters | exists (0.1) |
| `prefs/<sub>.json` | settings in the `KEYS` list of sync.js / prefs.php | exists (0.1) |
| `campaigns/<campaign id>/...` | campaign, members, logs, initiative, notes, handouts | `campaign.json` (1.1), `sessions/` (1.3), `initiative.json` and `fights/` (1.4), `notes/` and `handouts/` (3.4) exist |
| `homebrew/<sub>/<id>.json` | homebrew items, spells, monsters, classes, races... | Phase 4/5 |

New server writes copy `sheets/player/cloud.php`: JSON only, `flock` per file, 409 when the stored copy is
newer, and 401 when signed out.

---

## What exists today

### Player sheet (`/sheets/player/`, also every `/characters/<id>`)
- One sheet code. The old test copy (`/sheets/player-dev/`, key `hb-sheet-dev`) is archived; the live sheet copies
  its characters across once.
- **Characters:** several per browser, with a picker. Each can be made, imported, exported or deleted. The
  data model is in `blank()` (sheet.js:182). Old saves are migrated by `upgrade()` and `normalise()`.
- **Core stats:** 6 abilities (custom ones allowed), saves, 18 skills (proficiency levels plus a bonus), HP
  (current/base/temp/mod, max = base + level × CON), AC, initiative, proficiency bonus, speeds (with hover),
  14 conditions with SRD rule text, exhaustion, resistances/immunities/vulnerabilities (text), senses,
  passives, inspiration.
- **Formulas:** a hand-written parser with no `eval` (`formula.js`). Variables: ability keys, `_SCORE`, `PROF`,
  `LEVEL`, `CANTRIP` (`CANTRIPd10`), `<CLASS>_LEVEL`, skill names, resources (`X`, `X_USED`, `X_MAX`), `SLOTS*`.
  Functions: min, max, floor, ceil, round, abs, plus `[label]`.
- **Classes:** a list of `{name, level, die, hdUsed}`, so multiclass works. Class and race names come from
  short lists hard-coded in sheet.js (`CLASSES`, `RACES`). Choosing them doesn't fill anything in.
- **Panels:** Proficiencies (chips), Actions (hit or save, DC, damage parts, uses/reset, timing), Spells,
  Inventory, Passive abilities (Racial/Class/Other tabs), Resources, Homebrew, Combat (death saves, hit dice per
  class) and Notes (search, groups, pin, sort).
- **Spells:** slots for levels 1-9, spell points, sorcery points with Flexible Casting and metamagic, and a
  prepared checkbox (the Prepared tab shows for prepared casters or when switched on). Spell DC and attack are
  formulas. The picker has 319 SRD spells (dnd5eapi.co via `spells.php`, cached 30 days) plus 205 non-SRD spells
  in `extra-spells.json` (stats only; the text is fetched live from wikidot, never stored).
- **Inventory:** categories, equipped, attunement with a slot cap, quantity, weight (total shown, no
  encumbrance), value, coins cp/sp/ep/gp/pp (typed like `5g5s`), and SRD gear suggestions.
- **Resources:** counter, boxes, slots by level, sorcery points or ki. The max can be a formula, with a short,
  long or no reset.
- **Rests:** short rest (spend hit dice) and long rest dialogs.
- **Art:** cropped to 480 px. Signed in, it's uploaded to the character's folder and the character keeps
  `artUrl` (0.4); signed out, it stays inline in the character.
- **Undo:** a snapshot before deletes, offered in a toast for 15 seconds (the next edit after a second drops it).
  Archiving and restoring a version have their own 15-second Undo (0.5).
- **Versions and Archive (0.5):** every saved version in the Versions dialog (Edit menu), restore and name them;
  characters, monsters and notes are archived, never deleted.
- **Roll log:** the last 100 rolls per character, with a side log and a dice tray. Options can turn off rolls,
  the tray, sound and animation.
- **Import/export:** JSON files. D&D Beyond import (public characters only, through `ddb.php` + `ddb.js`) is a
  one-time copy.
- **Saving:** localStorage (`hb-sheet`), the Google account (`cloud.php` + `includes/characters.php`, a folder
  per character in `accounts/characters/<id>/` with every saved version in `history/`, newest `updated` wins, no
  count limit, 8 MB per save), and server backups (`backup.php` → `backups/<ip>/<name>/`). Backups are
  never pruned, and there's no restore button (only the admin backup browser). Account versions can be restored from
  the sheet (0.5).
- **My Characters** (`/characters/`): a card list; each character opens at `/characters/<id>` with the same sheet code.
- **Layout:** two columns from 960 px; below 700 px, or a phone on its side, phone play mode (2.1). It has ARIA labels, dialogs, Escape to close
  and reduced-motion support.

### Monster sheet (`/sheets/monster/`)
- A copy of the player sheet with classes hidden. CR stands in for level and drives `PROF` and `CANTRIP`.
- Monsters grouped into named encounters (3.1), one shown at a time in a sidebar with HP and CR. Duplicates get numbered names.
- Search: `monsters.json` index (SRD + Open5e). `monsters.php` proxies dnd5eapi.co and api.open5e.com,
  strips lore and images, caches 30 days, and serves the stale copy if a refresh fails. Credits are in `ogl.txt`.
- HP, conditions, rests, an initiative roll button (no turn order), dice tray and roll log. Legendary actions
  are imported as plain action rows, with no counters. Each encounter shows its XP and difficulty (3.2).
- Saving: localStorage `monster-sheet`, the Google account (`sheets/monster/cloud.php` →
  `accounts/monsters/<sub>/`, newest `updated` wins) and server backups (`monster-backups/`).

### Dice (`/dice/`)
- 10 themed 3D sets (abyss, arcane, clockwork, ember, frost, spectral, starfall, storm, venom, wildwood) and 8
  plain sets. Built with three.js 0.160 + cannon-es 0.20 from jsDelivr. The physics runs first, then the
  numbering is turned so the die lands on the chosen result.
- About 34 sounds, nat 1/20 sounds (`natsounds/`), and coins (a built-in coin plus 6 model coins, with coin
  sounds). Trails and nat 1/20 animations exist only for the Ember set (`dice/extras/ember/`).
- Pages: Dice Sets (presets, a "Land N" test roll), Quick Rolls (`/dice/rolls/`: nat 1, 2-19, nat 20, coin),
  Dice Fairness Test (`/dice/test/`: 8 panels with a chi-square test, tallies kept in the browser).
- `dice/choice.js` holds the choice (`dice-choice`), which the sheets read on every roll.
- `prefs.php` + `assets/js/sync.js` save `dice-choice`, `dice-sets-page`, `dice-sets-sound` and `dnd.rollMode`
  to `accounts/prefs/<sub>.json` (newest wins, one reload per session after a pull). The fairness test tallies
  (`dice-test-counts`) stay in the browser only, by the owner's choice.

### D&D Beyond viewer (`/characters/`)
- 6 hard-coded public character IDs (`characters.json`), fetched from D&D Beyond's unofficial endpoints and
  cached in `characters/cache/` (10 min; rules 24 h; falls back to the stale copy).
- A read-only view of combat, abilities, skills, attacks, spells, features, inventory, campaign and party.
  Normal/adv/dis roll mode (`dnd.rollMode`).

### Session recordings (`/transcripts/`)
- Each session is a Discord recorder `.md` + `audio.ogg` in `transcripts/data/<slug>/`, with clickable lines
  that play the audio. There are 2 sessions so far.
- Admin importer at `/private/transcripts/` uploads in 4 MB chunks.

### Accounts, admin, hosting
- Google sign-in (an ID token is checked with Google, then a PHP session cookie `dndsid` lasting 30 days).
  Admins are `ADMIN_EMAILS` in `config.php`.
- `/private/`: backup browsers for player and monster backups, plus the transcript importer.
- Docker (php:8.3-apache) in the Portainer stack `dnd`: `dnd` live (port 5762) and `dnd-test` (port 5763), each
  with its own volumes, behind a Cloudflare Tunnel. Images are built by GitHub Actions per commit.
  `deploy.sh test|live` counts data files before and after each deploy.
- Not there: WebSockets or any live updates, service worker or manifest, print styles (one small block in
  `dnd.css`), and any campaign or party feature of the site's own.

---

## Planned

The phase order is the owner's: **0 finish what's in flight → 1 live table and campaigns → 2 phone and look →
3 DM tools → 4 character builder → 5 content → 6 polish.** Sizes are rough working time for one developer,
including tests and the dndtest check.

### Phase 0: Finish in-flight work and fix storage risks

**0.1 Finish account sync for the monster sheet and settings** (built: `3b25fc0` and the monster `cloud.php`)
- What: commit the uncommitted monster `cloud.php` and `prefs.php` + `sync.js` work, then tick off
  `monster-sheet`, `dice-choice`, `dice-sets-page`, `dice-sets-sound` and `dnd.rollMode` in CLAUDE.md.
- Data safety: monsters get `updated` (legacy = 1) and `rolls` in `blank()`. `sheet-keeps-data.mjs` already
  covers `/sheets/monster/`.
- Size: whatever is left of that session's work, about half a day.
- Done: a monster and a dice choice made on one browser appear on a second browser after sign-in. The data check passes.

**0.2 Dice fairness tallies to the account** (dropped: the owner chose to keep `dice-test-counts` in the
browser only; see CLAUDE.md and "Not planned")

**0.3 Remove app-imposed limits**
- What: drop `CL_COUNT` (200 characters) in `sheets/player/cloud.php`. Remove the prefs 64 KB cap. Make the
  per-character size cap large enough never to matter once art is out (0.4); a cap is still needed only to
  stop a broken client writing junk. The proxy's ~8 MB request limit stays and is handled by chunking where needed.
- Data safety: removing a limit can't drop data. Check that the sheet's toast for a full browser (localStorage
  quota) still shows.
- Size: 2 hours. Done: 250 test characters sync. The prefs file grows past 64 KB.
- Built (2026-11-02): no count limits (characters, monsters); every size cap is 8 MB, the proxy's own limit
  (cloud saves, backups, prefs, portraits). `characters-cloud.test.php` saves 250 characters.

**0.4 Move character art out of localStorage**
- What: portraits are uploaded to `accounts/art/<sub>/<character id>.webp`. The character keeps an `artUrl`
  (new field in `blank()` of both sheets), and the browser keeps a cached copy for offline use (Cache Storage,
  not localStorage). Signed-out users keep inline art as today.
- How: on sign-in, each character with inline `art` uploads it. Only after the server confirms is the inline
  copy replaced by `artUrl`. If the upload fails, the inline art stays and it tries again next load. The
  server serves art only to its owner and to campaign members and share links (later phases). `normalise()`
  must accept `artUrl` from the same origin.
- Touches: `sheets/player/sheet.js` (art crop at ~line 1746, `blank()`, `normalise()`), new
  `sheets/player/art.php` (dev wrapper like `cloud.php`), backups (`backup.php` saves `artUrl`; the
  server-side backup also copies the image into the backup folder so a backup restores the portrait).
- Data safety: never remove inline art before the upload is confirmed. Add a `sheet-keeps-data` case where
  every backup with inline art still shows its portrait after load, signed in and signed out.
- Size: 1.5 days. Done: a character with art syncs to a new browser with the portrait, localStorage use drops,
  and no portrait disappears in the data check.
- Built (2026-11-02), owner's choices: the portrait lives in the character's own folder (`art.<ext>`, old ones in
  `history/`), served by `sheets/player/art.php` to the owner, the party of a campaign it's in, and anyone when the
  character is public. Offline: portraits are cached by the browser for good (a new picture gets a new address);
  guaranteed offline comes with 6.1. Export puts the picture back inside the file. Server backups copy the picture
  next to the character. Monster art stays inline (not in this item). Check: `_dev/scripts/art-sync.mjs`.

**0.5 Version history and Archive instead of Delete** (designed with the owner, 2026-11-02)
- What: a **Versions** button in the sheet's top bar (on `/sheets/player/` and `/characters/<id>`) opens a
  dialog listing every saved version of the open character, newest first, from the account history
  (`accounts/characters/<id>/history/<n>.json`). Server IP backups are not shown.
  - Each row: date and time, and how many fields changed since the version before ("7 changes"). Clicking the
    row lists every change in words ("HP 23 → 18", "added Longsword").
  - Every save is its own row. Rows load as you scroll (no paging buttons).
  - A save that only changes the roll log or view settings (`rolls`, `view`) makes no new version.
    Existing history files that differ from the one before only in those are hidden from the list (the files
    stay).
  - **Restore** on a row replaces the character with that version straight away. The current state is saved as
    a new version first, so a restore can itself be undone from the list, and a 15-second Undo toast shows as
    for the sheet's deletes. The restored character gets a fresh `updated`, so it wins on every device.
  - **Name** on a row gives a version a name ("Before session 12"). Named versions show a star, and a
    "Named only" filter lists them all. Names live beside the history (`history/names.json`), so a version's
    file never changes.
  - Only the owner sees the button and the list. Public viewers and campaign DMs don't.
  - Signed out, the button still shows. The dialog says "Sign in to keep every version of your characters"
    with the sign-in button.
- **Archive replaces Delete everywhere.** The sheet bar and My Characters both say Archive; players have no way
  to delete a character, ever.
  - An archived character is hidden from the sheet's character picker and taken off any campaign it was in
    (re-attach after unarchiving). Its `/characters/<id>` link still opens it, read-only, with an
    **Unarchive** button. A public character's link keeps working for others.
  - My Characters gets an **Archived** section at the bottom, with Unarchive on each card.
  - Signed in, the flag is kept in `meta.json` (`archived`: time). Signed out, it's kept on the character in
    the browser (a new `archived` field in `blank()`, 0 = not archived) and syncs like any other change once
    they sign in. The folder never moves; the existing `.deleted/` folder is left for the admin only.
- Touches: `sheets/player/sheet.js` (bar buttons, Versions dialog, picker filter, `blank()`), `sheets/player/cloud.php`
  (list history, read a version, restore, name, archive), `includes/characters.php` (`ch_write` skips
  roll/view-only saves), `characters/` (Archived section, read-only archived page), `includes/campaigns.php`
  (detach on archive).
- Data safety: a restore only adds a version, never removes one. Archiving never moves or deletes files.
  `sheet-keeps-data.mjs` must pass, plus a new check: edit, restore an old version, undo the restore, and the
  character deep-equals the state before; archive and unarchive leave the character unchanged.
- Size: 3 days. Done: on a second browser, a character can be restored to a version from another device, the
  restore undone, a version named and found with "Named only", and a character archived, found under Archived
  and unarchived, signed in and signed out.
- Built (2026-11-02), owner's answers on top of the design above: Versions sits in the sheet's Edit menu. Each row
  says when relatively ("15 minutes ago", the full 12-hour date on hover; now the site-wide rule in /design), a named
  version shows its name in bold (no star), the newest row says Current, a restore's row says "Restored from <date>",
  the oldest "First saved version". One change = one line ("HP 23 → 18", "added Longsword to Inventory", "moved
  Actions panel", long text as "edited note 'Backstory'" with the old and new text on a click). Not counted and not
  listed: save stamps, open/closed state, the roll log, view settings, the sheet's one-time upgrades and the portrait
  moving into the account. Restore keeps today's roll log, view settings and archived state, brings back the
  version's portrait (the current one moves to history), sends unsent edits first, and is greyed out offline; its
  Undo lasts 15 s and only a real edit drops it. Archive: no confirm, a 15 s Undo; archived characters are
  read-only with Unarchive, out of the count, in a folded "Archived (N)" section on My Characters, off the campaign
  page's list (with a line saying why) and detached from campaigns; a public one shows "Archived" to others. The old
  DELETE endpoints (player and monster cloud.php) archive instead. Scope added by the owner: the Monster Sheet
  archives monsters (folded "Archived (N)" at the bottom of the encounter list, read-only with Unarchive, an
  `archived` field for 1.4's tracker), and notes on both sheets are archived (Archive button, folded "Archived (N)"
  under the Notes panel, found by search, Restore). Checks: `dnd-sheet-versions.test.js`, `characters-cloud.test.php`,
  `campaigns.test.php`, `versions-archive.mjs`, `characters-page.mjs`.

### Phase 1: Live table and campaigns (top priority: "no shared rolls" is the group's biggest annoyance)

**1.1 Campaigns with join links**
- What: any signed-in user can create campaigns, unlimited. The creator is the DM. A join link
  (`/campaigns/join/<code>`) adds a signed-in player, who then attaches one or more of their characters.
  Signing in is required to join; signed-out players use the sheet alone as today. The DM can rename the
  campaign, remove members, make a new join code (the old one stops working) and delete the campaign.
  Players can leave.
- Owner's answers (2026-11-02): joining is straight away, no DM approval. Only My Characters characters can be
  attached (not the test sheet). Other players see a character card (portrait, name, level, species, class);
  the DM can open every party sheet, read-only until 1.5 adds DM edits. The house-rule settings below wait for
  the character builder (Phase 3), since nothing reads them before that.
- Built: `includes/campaigns.php`, `campaigns/` (pages, `api.php`, `join/`), checks `_dev/scripts/campaigns.test.php`
  and `campaigns-page.mjs`. Attaching writes nothing to the character: the campaign is the only record of the link.
- One campaign per character (owner's rule, 2026-11-02): attaching a character that's already in a campaign is
  refused with a message and a "Clone character" button. The clone (`clone` in `campaigns/api.php`) is a new character
  of the same owner made through the normal folder layout: the current sheet and portrait, named "<name> (copy)", a
  fresh roll log and history, attached to that campaign, separate from then on. Characters already in two or more
  campaigns keep them all until the owner picks in a notice on the sheet: "Keep in X" (it leaves the others, `keep`)
  or "Clone for Y" (a copy takes its place in Y). Until then its rolls (and the fight it shows) go to the campaign it
  last rolled to, its stored "Rolls go to" pick, or nowhere without one. Checks: `campaigns.test.php`, `initiative-page.mjs`.
- Campaign settings (DM, later): house rules. HP on level-up: roll or average. Ability scores: point buy / standard
  array / 4d6 drop lowest / manual allowed. Spell points variant on or off. Which homebrew is shared. When a
  character isn't in any campaign, the player picks these themselves.
- Pages: `/campaigns/` (my campaigns: DM of / player in), `/campaigns/<id>` (campaign page: members,
  characters, sessions). Add it to `site_pages()`.
- Storage: `accounts/campaigns/<id>/campaign.json` (name, DM sub, join code, settings, members
  `{sub, name, characters:[{sheet, id}]}`). A campaign stores *links* to characters, never copies, so the
  player's own save stays the only source.
- Data safety: attaching a character adds nothing to the character itself except an optional `campaigns: []`
  field (in `blank()` of both sheets). Deleting a campaign never touches characters.
- Size: 3 days. Done: two Google accounts. One creates a campaign, the other joins by link and attaches a
  character, and both see the campaign on a second device.

**1.2 Live service**
- What: a small Node WebSocket relay, `dnd-live`, in the same Portainer stack (a test copy too), only relaying
  messages. **PHP stays the source of truth:** every roll, initiative change and HP change is POSTed to PHP,
  which saves it (with `flock`) and then tells the relay to broadcast it. If the relay is down, nothing is lost;
  pages fall back to reloading state from PHP every 10 s and say "live updates paused".
- How: Apache in the PHP container proxies `/live` to the relay (`mod_proxy_wstunnel`), so the Cloudflare
  tunnel needs no change. On connect the relay checks the `dndsid` cookie by calling an internal PHP endpoint
  (`/live/auth.php` → `{sub, campaigns}`) and only joins sockets to campaigns the user belongs to. The relay
  sends DM-only messages (hidden rolls, whispers, monster HP) only to sockets allowed to see them.
- Touches: new `live/` folder (Node, the `ws` package), Dockerfile (enable `proxy_wstunnel`), `docker/site.conf`,
  `compose.yml` (new services `dnd-live`, `dnd-live-test`), `.github/workflows/image.yml` (build a second image
  `ghcr.io/craftyplayz/dnd-live:<sha>`), and `deploy.sh` (move the relay tag with the site tag).
- Compose and `deploy.sh --compose` changes **ask the owner first** (CLAUDE.md). No volumes are renamed.
- Built (2026-11-02), simpler than planned: the relay runs **inside each site's container** next to Apache
  (`docker/start.sh` starts it and starts it again if it stops), so there are no new services, networks or images,
  live and test are apart by being separate containers, and a normal `deploy.sh test` ships it. Apache proxies
  `/live/ws`; `live/auth.php` checks membership; `includes/live.php` publishes. Players are known to the relay by a
  per-campaign key, never their Google id. First use (owner's choice): online dots and a party and player list that
  update by themselves on the campaign page. Checks: `live-relay.test.js`, `live-page.mjs`.
- Size: 3 days. Done: two browsers in the same campaign see each other's test pings within 1 s, a third account
  not in the campaign sees nothing, and killing the relay shows "paused" while rolls still save.

**1.3 Shared dice log**
- What: every roll made on a sheet attached to a campaign also goes to that campaign's live log (character
  name, what was rolled, the dice, the total, nat 1/20). The sheet's own roll log stays as it is.
- Who sees what:
  - DM rolls: the DM picks public or hidden per roll, with a toggle next to the tray. Players see a hidden roll
    as "DM rolled" with no result.
  - Players can mark a roll "to DM". Only that player and the DM see it; others see nothing.
- Sessions: the DM presses "Start session" and "End session". Each session's log is saved as
  `campaigns/<id>/sessions/<n>.json` and can be browsed on the campaign page later (next to transcripts, if
  any). Rolls outside a session go into an "unsorted" log.
- Reconnect: rejoining shows the current initiative and the last 200 entries. Rolls made while offline are
  rolled locally, marked "offline roll", and sent when the connection is back. They are never dropped, and are
  stored with the time they were rolled.
- Where it shows: a log panel on the sheet, the monster sheet (for the DM) and the campaign page.
- Size: 3 days. Done: a public roll, a hidden DM roll and a whisper each show the right thing to the DM, the
  whisperer and a third player. An offline roll arrives after reconnecting. A finished session can be browsed.
- Built (2026-11-02), owner's choices: a character's rolls go to one campaign picked in the dice tray ("Rolls go
  to", saved with the character; automatic when it's in only one; "Nowhere" keeps them private). Other players'
  rolls pop up as cards and fill a Table tab in the roll log. The Monster Sheet picks one campaign you DM (an
  account setting). "To DM" (players) and "Hidden" (DM) are a toggle by the tray that stays until switched back.
  Storage: `campaigns/<id>/sessions/<n>.json` and `sessions/unsorted.json`; `includes/tablelog.php` alone decides
  what each player sees, for the log and for the relay. Offline rolls wait in the browser (`live-outbox`).
  Pages share `assets/js/live.js`. Checks: `tablelog.test.php`, `table-log.mjs`.
- Changed (2026-11-02, one campaign per character, see 1.1): the player sheet has no "Rolls go to" picker any more. A
  character's rolls go to its one campaign, and a character in none rolls privately. The stored pick (`view.table`)
  stays in the character and is only read for one still in several campaigns. The Monster Sheet keeps its picker
  (a DM can run several campaigns).

**1.4 Initiative tracker**
- What: run by the DM, seen by players. Players' initiative rolls on their sheet add them automatically. The DM
  adds monsters from the Monster Sheet (linked: HP changes in the tracker and on the Monster Sheet are the same
  data), sets ties and order, and advances turns and rounds. Players see the order, the round and whose turn it
  is, as a row of portraits (character art) in turn order. Monster HP shows to players only as Healthy /
  Bloodied (≤ half) / Down. Hidden monsters (1.6) are left out of the order players see (since 1.7 their turn shows as a
  "DM's turn" card). A "your turn" notice
  appears on that player's sheet.
- Storage: `campaigns/<id>/initiative.json` (the current fight). Monster entries point to the DM's monster by
  id. HP is written to the DM's monster save through the monster sheet's own save path, so the newest-wins rule
  holds.
- Reconnect: the full current order is sent on join.
- Size: 3 days. Done: three players roll in, the DM adds two monsters, advances two rounds and damages a
  monster. Players see Bloodied but not numbers, and a reload on any device shows the same state.
- Built (2026-11-02), owner's answers: the DM runs it in a Fight panel on the Monster Sheet (for the campaign its rolls
  go to): Start fight, a rolling-in phase where the order sorts live, Start round 1, Next / Previous, a round counter
  and the time since round 1 (everyone sees it), End fight (asks first; moves the fight to
  `campaigns/<id>/fights/<n>.json`). Only "Fight started" and "Fight ended" go in the table log. One fight per
  campaign, independent of sessions. Players get a notice with a Roll button; characters that roll join, each with
  its own entry; the DM can add or remove any party character (a removed one's rolls are then ignored), type a
  number, move entries up and down, and add plain named entries. A re-roll replaces the old one while rolling in;
  after round 1 only a first roll counts, and late arrivals slot in by number without moving the turn. An offline
  roll joins only if it was rolled in the same fight. Ties: higher initiative bonus first, then a silent d20 roll-off.
  Monsters: "Add to fight" beside each one in the list, "Add all in the list" (and a picker in the panel on phones),
  each auto-rolled; the Initiative button rolls one in. Hidden monsters are never sent to players. Down monsters
  (≤ 0 HP) stay greyed and are skipped by Next; archived or gone ones stay, marked, until removed. The order and turns
  belong on the VTT (owner, 2026-11-03), not the character sheet: a sheet only shows "The DM started a fight. Roll
  initiative" until that character has rolled in. Until the VTT (1.6/1.7) exists, players see the order on the
  campaign page as portraits (no numbers, no player health, monsters as Healthy / Bloodied / Down) with the round
  and timer; the DM also sees numbers, player HP (read-only), monster HP and AC, and can change monster HP there.
  When the VTT is built, the order and turns ("You're up next", "Your turn") move there and the DM's controls move
  from the Monster Sheet to the DM's VTT screen (done in 1.6: the map page). While the DM is offline the controls say "Offline, changes paused"; a change from an older copy of the
  fight is refused with "This fight changed, reloaded".
- Monster HP from anywhere: once changed through `sheets/monster/cloud.php?hp=`, a monster's HP only changes as
  single changes (damage and healing as amounts, typed numbers as the numbers that changed), applied in order by
  the server to the DM's monster save (`hpAt` stamps it; the monster `blank()` has it). A whole-monster save keeps
  the saved HP, so an old open sheet can't put old HP back. Every change goes live to the DM's open Monster Sheets
  (the relay's own room per account, `?c=me`) and to fights with that monster. Changes made offline wait in
  `monster-hp-outbox`.
- Files: `includes/initiative.php` (storage, rules and what each person sees: `fi_view`, which 1.7 can reuse),
  `campaigns/fight.php`, `assets/js/fight.js`, `assets/css/pages/fight.css`. Checks: `initiative.test.php`,
  `initiative-page.mjs` (both browsers, `--firefox` swaps them).

**1.5 DM edits on player sheets** (built 2026-11-03; the owner dropped the party overview: the campaign page's Party
section stays cards + View. The plan as first written is kept below the "Built" notes.)
- Built: the DM or a co-DM (`cp_is_dm`) of a campaign a character is attached to opens it from View at `/characters/<id>`
  in **DM mode** (`data-dm`): a bar "Editing <player>'s character as DM. Changes go to <player>.", every control works,
  and the DM's browser keeps no copy. Never for a character the sender owns. The DM can't change the roll log (except
  rolls), view settings, panel layout, portrait, archive, visibility or versions (those buttons say "Only <player> can
  do that"). Notes can be read and edited; removing a note archives it.
- Edits: `sheets/player/dmedit.js` (rules, used by the sheets and the fight tracker) and `includes/dmedits.php` (the same
  rules in PHP, `DM_FIELDS`: every editable path and type, mirrored from `blank()`). The DM's sheet diffs its copy against
  the copy last loaded (`hbDm.diff`) when a field is left and sends small ops: `set` with `was` (conflict = the field no
  longer equals `was`: the player's value stays, the DM is told), amounts as `add` (HP typed, coins, quantity, used
  slots/resources, hit dice, exhaustion, death saves; never conflict), `hp` (damage/heal/temp with the sheet's rules),
  `tag` (one condition, language or proficiency), `row` (a whole row from the sheet's ROW maker, added at the end),
  `unrow`, and `roll` (a DM roll on the sheet goes into the player's roll log and the table log as the character; the
  table log and initiative accept a DM rolling for a party character). Paths: rows with ids by id, skills and abilities by
  name, other lists by position plus a name check ("Longsword was removed"). Each edit carries its words ("−7 HP",
  "+50 gp", "Strength score 14 → 16", the Versions dialog's wording).
- Delivery: `sheets/player/dm.php` checks each edit (DM_FIELDS, then against the saved character plus what's waiting)
  and queues it in `campaigns/<id>/pending/<character id>.json`; the relay sends it to that player's key in the campaign
  room. Every open sheet of the player applies it once (`dmApplied`, a new `blank()` field, last 500 ids), live or on
  open, with a "DM: ..." roll-log line marked DM and a 15 s Undo (the inverse edit as the player's own change; the log
  keeps both lines; the DM is told "Pat undid: −7 HP"). A field being typed in keeps what's typed until left (then the
  DM's value shows; typed over, the player's stays and the DM is told). `cloud.php` puts every edit a save lacks into it
  (so a stale or signed-out copy uploaded later can't drop one) and answers with them; an entry is marked done once a
  save containing it is written and kept (last 200 per queue) for older copies. Archived: edits wait until unarchived.
  Versions that brought in DM edits are marked "DM edit" (`history/dm.json`).
- The DM's side: the copy reloads live when the player saves (relay "char" to DMs), keeping the DM's focus; 15 s Undo on
  each sent batch (sends the reverse); conflicts, refusals and undos show as a toast plus a line on the DM's bar until
  dismissed (stored with the queue, shared by the campaign's DMs); offline, edits wait in `dm-outbox` with "Offline,
  changes paused".
- Max HP: the sheet keeps its worked-out max in `calc: {hpMax}` (new in `blank()`, no version, not a Versions change).
  The fight tracker shows player HP as cur/max (with edits still waiting) and has Damage / Heal / Temp for players,
  sent as DM edits.
- Checks: `dm-edits.test.js` (JS and PHP apply every edit the same, diff, undo), `dm-edits.test.php` (paths, who may
  send, queue rules), `dm-edits.mjs` (both browsers: everything above end to end, and DM_FIELDS against `blank()`),
  `campaigns-page.mjs`, `initiative.test.php`, `sheet-keeps-data.mjs` (new fields `dmApplied` [] and `calc`).
- The plan as first written: the campaign page shows a party overview: name, HP bar, AC, passive Perception, conditions,
  exhaustion, death saves and spell slots left. Clicking opens the full sheet. **The DM can edit everything**
  on a player's sheet, and players keep editing their own (HP included). Party HP is private: only that player
  and the DM ever see it (the Table view and other players don't). Every DM change shows live on the player's
  sheet and goes into their log ("DM: −7 HP", "DM: Stealth → expertise").
- How: DM changes are POSTed as small *field-level edits*, not whole characters: `{op: "damage", amount: 7}`
  for HP, and `{op: "set", path: "skills.Stealth.p", value: 2, was: 1}` for anything else. The player's sheet
  applies them to its own copy and saves normally. If the player is offline, edits wait in
  `campaigns/<id>/pending/<sub>.json` and are applied on next load, in order, then removed. So a DM change only
  touches the one field it names. A field the player changed after the DM's `was` value is kept as the
  player's, and the DM is told "player changed this first".
- Data safety: the DM never writes the player's character file directly. Each DM edit is one undo step on the
  player's sheet. Paths are checked against `blank()` (unknown paths are refused), so a DM edit can't add junk
  fields or remove any. Test that a DM edit made while the player is editing notes on another device loses
  neither change.
- Size: 4 days. Done: the DM damages an offline player and changes one of their skills. The player opens their
  sheet later and sees both, with log entries, and nothing else on the character changed (diff check). Undo on
  the player's side reverts each one.

**1.6 Battle map with fog of war**
- What: the DM's own screen has a few map buttons: upload a map image (per encounter, unlimited maps), set a
  square grid (5 ft per square, drag to fit the image), and paint fog. A map starts fully fogged. The DM paints
  grid squares or drags rectangles to reveal or re-hide. **Fog edits are a private draft** until the DM presses
  "Send to table", so the DM can prepare a room before anyone sees it. Players and the Table view only ever see
  the last sent fog.
- Tokens: every character in the fight gets a token with their character art (initials if none). Monsters get
  their art or initials. Token size follows creature size (Medium 1 square, Large 2 × 2...). Players drag
  their own token. The DM drags any. Moves are sent live. The DM can mark any monster token **hidden**: the DM
  sees it faded, and players and the Table view never receive it until it's revealed.
- Ruler with joints (requested 2026-11-02): while dragging the ruler, a right click drops a joint at the
  current point and the ruler carries on from there, so a path around a corner or wall can be measured. The
  label shows the total distance of the whole line (every leg added up), in feet. Releasing the drag ends it.
- Where: the DM's screen (full controls), the Table view (1.7, big, read-only), and a Map tab on the player's
  sheet and campaign page (phones included, for online players), where players can move only their own token.
- How fog stays secret: the server cuts the fog out of the image. For each sent fog state, PHP renders a masked
  copy (`campaigns/<id>/maps/<map id>/public-<n>.webp`) where fogged squares are solid black, and only that
  copy is ever served to players and the Table view. The full image is served only to the DM. This needs the GD
  extension with WebP in the Dockerfile (`docker-php-ext-install gd`). Hidden tokens are filtered out on the
  server before sending.
- Storage: `campaigns/<id>/maps/<map id>/` holds the original image (chunked upload, no size limit), `map.json`
  (grid, draft fog, sent fog, tokens with positions and `hidden`), and the masked public copies (only the latest
  is kept). Token art is a link to the character's `artUrl` (0.4), never a copy.
- Data safety: maps live only in campaign data and touch no character file. Moving a token writes only
  `map.json`.
- Size: 5 days. Done: the DM uploads a map, reveals one room as a draft (players still see full fog), sends it
  (players now see the room). A player on a phone moves their own token but can't move another. A hidden goblin
  is visible to the DM only. Checking every response in the player's and Table view's network traffic shows no
  original map URL and no hidden token.
- Built (2026-11-03), owner's answers (they replace the text above where different; maps aren't linked to 3.1 encounters):
  - Where: a full-screen page per campaign, `/campaigns/<id>/map` (`campaigns/map.php`), for the DM, co-DMs and players.
    The DM's fight controls (Start, Start round 1, Next / Previous, End, add monsters, HP, hide) moved there from the
    Monster Sheet, whose Fight panel now only links to the map; its list's "Add to fight" buttons still work, and the map
    page adds the DM's account monsters itself (initiative bonus and AC worked out with `formula.js` as the sheet does).
    Players open the map from a Map button in the sheet's top bar (its own tab) and from the Map section under the fight
    on the campaign page; their map shows the turn order with "Your turn" / "You're up next".
  - Maps: a plain named list per campaign, `accounts/campaigns/<id>/maps/<map id>/` (`original.<ext>` as uploaded,
    `work.webp` and `thumb.webp`, `public-<n>.webp` for every send, all kept, and `map.json` with grid, draft fog, sent fog
    and tokens); `maps/table.json` names the one map "On the table", which players follow live, fight or not (never set by itself, even for the first map: the DM presses Put on the table). The DM's list
    is a thumbnail grid (the one on the table in blue) with Put on the table, Rename and Archive; archived maps fold under
    "Archived (N)" with Unarchive. Nothing is deleted, copied to other campaigns or replaced (a new picture is a new map).
  - Upload: DM and co-DMs, JPG / PNG / WebP / GIF (a GIF's first frame), anything else refused with a message, 4 MB
    chunks, no size limit. Masked copies come from a working copy (longest side 2048 px, WebP quality 80; players' masked copies quality 75, so maps load fast); PHP's memory is raised only for
    the decode and render. Pictures go through `campaigns/maps.php`, which checks membership; the original and the
    working copy only to the DM and co-DMs, players only the map on the table as last sent. GD with JPEG and WebP is in
    the Dockerfile.
  - Grid: drag a box over one printed square (size and offset from it), arrow keys nudge, a size field; square cells,
    5 ft, partial edge squares count. Changing it asks first ("Changing the grid resets the fog"): the draft starts over
    fully fogged and players keep the last send. Faint grid lines with a per-viewer toggle.
  - Fog: [Brush | Rectangle] and [Reveal | Hide], Undo (Ctrl+Z) for this session's strokes, Reset draft to last sent,
    Reveal all, Hide all. The draft autosaves a second after each stroke and is private until "Send to table". The DM
    sees fog dark but see-through, changed squares outlined, and "What players see" (the players' copy). A map on the
    table never sent shows players a black rectangle with the party on it. The server paints fogged squares solid black;
    the browser only adds a soft edge.
  - Tokens: party characters always have one (Medium); fight monsters and plain entries get one when they join
    (monsters sized from their creature type text, Tiny to Gargantuan, changeable); the DM can also put any of their
    monsters on the map without a fight. New ones wait in a "Not placed" tray (drag on, or click for mid-view). When a
    fight ends, monster and plain tokens go back to the tray keeping their positions; one taken out of the fight leaves
    the map. Down: grey with a cross; Bloodied: a red edge; a ring on whoever's turn it is; name on hover or tap.
    Players move their own token, the DM any; snapped to whole squares (Alt places freely with a mouse). Moves go out
    live while dragging (a few a second, through PHP and the relay), last drop wins. Players never get hidden monsters
    (the initiative `hidden` flag, or the token's own for monsters outside a fight) or monsters standing only on
    squares fogged in the sent fog; party tokens always show.
  - Ruler: the Ruler button or R, then drag; right click (phones: a second finger) adds a corner; square centre to
    centre, every square 5 ft, the label totals every leg; everyone in the campaign sees it live.
  - View: wheel / pinch zoom, pan by dragging empty map (or two fingers), Fit, Centre on me; nothing about the view
    is stored. Offline: players keep the last map with "Live updates paused" and moving greyed out; the DM's edits
    pause with "Offline, changes paused".
  - Files: `includes/maps.php` (storage, rules, the fog render and `mp_view()`, the one filter for what each role sees,
    which 1.7 extends with its `table` role), `campaigns/maps.php`, `campaigns/map.php`, `assets/js/map.js`,
    `assets/css/pages/map.css`. Fight changes keep the map's tokens in step (`mp_fight_sync`, from `campaigns/api.php`).
    Checks: `maps.test.php`, `maps-page.mjs` (both browsers, `--firefox` swaps them), `initiative-page.mjs`.

**1.6b Battle map rework** (built 2026-11-04 from the owner's D&D Beyond screenshots and `_dev/mockups/battlemap-v2/`; it replaces the text above and in 1.7 where different)
- Layout and behaviour follow those screenshots: map dropdown top left, turn tracker top middle, floating tool rail (select, pan | fog, draw, overlays, ruler, ping, tokens; players: select, pan, draw, ruler, ping, erasing only their own lines), Hide or Display map and zoom bottom right. Colours are the site's own and icons are lettered placeholders.
- Fog: freeform and live, no draft or Send to table (Cover All, Reveal All, paint or erase, square, round or polygon, Ctrl+Z). Light blue for the DM; fogged pixels are removed from the players' picture by the server (`live.webp`, alpha 0 with the colour cleared), and players never get the strokes. Maps from before keep what players saw (their last sent fog); an unsent draft stays in `map.json`, unused. New uploads start clear and stay off the table until Display map. The grid no longer resets fog.
- Tokens: Token Browser (Players; your monsters plus the Compendium, with type, size and CR filters; a Compendium monster is saved to the Monster Sheet first). Each click adds a copy, Goblin A, B, C, with its own HP in `campaigns/<id>/monster-copies.json`; the Monster Sheet save never changes for a copy. Monster Sheet "Add to fight" keeps using the sheet's HP. Token menu: HP, Conditions, Combat, Hide, Ring, Size, More. Monsters wholly under fog stay hidden from players, plus Shift+H.
- Players change HP and conditions from their own token: DM edits sent by the owner (`self`), only those two kinds, applied by the sheet's own rules.
- Combat: the left panel. Combat Encounter (saved per map in `enc`: Add all tokens, Auto initiative, Difficulty from `difficulty.js`, Start combat), then Initiative Order (Next, Previous, up arrow for End combat). `fi_op begin` starts at round 1 with no rolling-in phase; a sheet's initiative roll still updates the order. Tokens stay where they are when a fight ends. Kept from before: the "DM's turn" card and the round timer. Dropped: death-save ticks and "Your turn" notices. Party at 0 HP get the same dead look as monsters.
- Table view is now a plain Spectator window: map and turn tracker only. Its roll log, 3D dice and "Show on TV now" handouts are gone (the stored `handouts/tv.json` is unused). Pitfall: a monster or drawing is sent to players by a coarse `sight` grid, so one on a very small revealed gap can stay hidden.
- Checks: `maps.test.php`, `initiative.test.php`, `table.test.php`, `dm-edits.test.php`, `monster-import.test.js`, `maps-page.mjs`, `table-page.mjs`, `initiative-page.mjs`.

- To do (owner, 2026-11-04): replace the map's lettered placeholder icons. Agents make at least 4 or 5 icons in varying styles for every button that needs one, on a page where the owner picks; our own art, nothing copied from D&D Beyond.

**1.7 Table view (TV / screen share)** (built 2026-11-03 from the prototype `_dev/mockups/battlemap/table.html`; the owner's
answers of that day are the "Built" notes, which replace the plan below where they differ)
- Built:
  - How it's used: the DM's PC is plugged into the TV. The DM or a co-DM presses **Open Table view** (the campaign page's header
    and the map page's top bar), which opens `/campaigns/<id>/table` (`campaigns/table.php`) in a new tab of their own
    signed-in browser; they move that tab to the TV. No pairing, no separate login. Players get a 404 there.
  - The `table` role is real: that tab reads everything with `?as=table` (and joins the relay with `&as=table`), and
    `cp_viewer()` turns the DM's request into the stand-in viewer `CP_TABLE`, which is nobody: not a member, not a DM, owns
    nothing. So `fi_view`, `mp_view` (role `table`, picture addresses with `as=table`), `tl_view`, the handout filter and
    `live/auth.php` (role `table`, its own key `cp_table_key()`, never the DM's messages) give it what a player with no
    characters gets, and nothing "mine". Every change from the tab (`as=table`, or sent from a page at
    `/campaigns/<id>/table`) is refused in `includes/auth.php` before any endpoint, and `Live.send` there sends nothing (it never
    sends the DM's waiting rolls). Hidden roll results, whispers, monster and player HP, initiative numbers, hidden and fogged
    tokens, the draft fog, the working and original map pictures, DM notes and drafts or one-player handouts never reach it.
  - Look: the site's design, always dark, sized for a TV (vmin). The map fills the screen, always fitted below the order
    (keys: F full screen, + and - zoom, 0 fits; no on-screen controls; a one-time "Click to go full screen" that goes after
    30 s), a faint grid, every name under its token, live drags and rulers. Wake lock; the cursor hides when still.
    `assets/js/map.js` draws it (`table: true`, read-only), not a second renderer.
  - Turn order along the top: from whoever's turn it is, the round number, the current card bigger, "Next" on the one after,
    "Waiting for: ..." (party characters not rolled in) while rolling in, cards shrinking as there are more and "+N" past 14,
    a slide on each new turn, no sound. Art or initials, no initiative numbers, monsters Bloodied (red edge) / Down (grey
    cross) as on the map. A hidden monster's turn shows a **DM's turn** card (id `dm-turn`, kind `dm`, nothing about the
    monster), on the TV and on players' fight panels (map page and campaign page): `fi_view` changed for players too.
  - Party characters (TV and every player, on tokens and fight cards): Down with death-save ticks, and conditions as icons
    (set C of `_dev/mockups/condition-icons/`, the owner's pick; `assets/js/conds.js`; a condition a player made up gets its
    first letter). Never HP numbers. `fi_pc()` reads them from the character's save with the DM's waiting edits
    (`dm_char`); `sheets/player/cloud.php` and `sheets/player/dm.php` tell everyone "status" when they change.
  - Dice: the last 8 rolls of the current session in the bottom-left corner, older ones fading, nat 20 / nat 1 lines marked,
    hidden DM rolls as "DM rolled" only (the Table view gets no name either; players still see the name, as since 1.3),
    whispers not at all. Each new public roll is thrown as big 3D dice (`dice/dice3d.js`, no sound) landing on the numbers
    rolled: sheets now send a `dice` field (`[[sides, [values]], ...]`, new and additive: older log entries have none and
    don't animate; coins have none), checked by `tl_dice()`. The set is the roller's: the character's own dice (its
    `view.dice`), else their synced `dice-choice`, looked up by the server (`tl_dice_set`) and sent with the live roll; a
    choice naming any script that isn't one of the site's dice files is dropped (plain dice). Rolls arriving together land
    together; offline or late rolls (over 2 minutes) only get their log line; no WebGL: log only, silently.
  - Handouts: a **Show on TV now** / **Take off TV** button on handouts sent to everyone (one on the TV at a time,
    `handouts/tv.json`) replaces 3.4's "Show on the Table view" switch, whose stored value stays in the files, unused. The
    handout covers the map: title, text, several pictures as a grid, text alone big. Edits follow live; unsharing, sending to
    fewer or archiving takes it off for good.
  - No map on the table: the campaign's name and the party's portraits only. A map on the table with no fight: the map. A map
    never sent: a black rectangle, as players get.
  - Reconnect: the same full catch-up as players, a small "Reconnecting..." badge, a check every 10 s while the relay is
    down, and the tab reloads itself when the site's version (its own files) changed.
  - Relay audit (every `live_publish`): nothing DM-only was going to players; the table key now gets what players get
    (map moves, hidden rolls as "DM rolled", the TV handout), the `members` list keeps it, a co-DM change makes table tabs
    ask again.
  - Files: `campaigns/table.php`, `assets/js/table.js`, `assets/js/conds.js`, `assets/css/pages/table.css`. Checks:
    `table.test.php` (one full state through every filter as the table, nothing secret comes out; the tab's changes
    refused), `table-page.mjs` (both browsers, `--firefox` swaps them: live updates, every fetch and WebSocket frame searched,
    the relay going away and coming back, a new version), `live-relay.test.js`, `handouts.test.php`, `initiative.test.php`.
- The plan as first written:
- How we play: the DM runs one PC. The laptop screen is the DM screen. A second browser tab, `/campaigns/table/?c=<id>`,
  is moved to the TV over HDMI (extended display) or is the only window shared to online players on Discord.
  It opens in the DM's own signed-in browser; there's no separate login or link.
- What it shows (read-only, no controls):
  - Along the top: initiative order as portraits (character art) in turn order, with whose turn it is
    highlighted and the round number. Hidden monsters are left out.
  - The battle map (1.6) with the last sent fog and visible tokens, big.
  - Monsters: "Healthy" / "Bloodied" (≤ half) / "Down" only, never numbers.
  - Players: portrait, name, condition icons, and a "Down" marker with death-save ticks at 0 HP. No HP
    numbers or bars (player HP is private).
  - Public dice log, with big 3D dice (the roller's chosen set) whenever anyone rolls. Hidden DM rolls show
    only as "DM rolled". Whispers to the DM don't show at all.
  - Handouts as the DM pushes them (needs 3.4; until then, the handout area stays empty).
  - Between combats (no initiative running): campaign name, party portraits and the last handout. The dice log
    keeps showing rolls.
- Security: the DM's cookie opens this tab, but the tab joins the live relay **as role `table`**, not as the
  DM. Both the relay and the PHP endpoints filter by role, so a `table` socket or request gets exactly what a
  player who isn't in the fight would get. Hidden rolls (results), whispers, monster HP numbers, player HP
  numbers, hidden tokens, draft fog, the unmasked map and DM notes never reach the Table view. They're not
  hidden with CSS; they're never sent. The page's first PHP render uses the same filter.
- Reconnect: the same full catch-up as players (current initiative, map with sent fog, last 200 public log
  entries, last handout).
- Touches: new `campaigns/table/index.php` + a small JS file, the relay's role filter (1.2), and the filter
  function in PHP shared by the relay auth endpoint, the player view and the Table view, with one function
  deciding what each role can see. It reuses `dice/dice3d.js` and `dice/choice.js` for the big dice.
- Storage: nothing new. It only reads campaign data (initiative, map, log, handouts).
- Data safety: read-only; it writes nothing, so it can't change player or campaign data.
- Size: 2 days on top of 1.2-1.6. Done: the DM view in one window, the Table view in another. The DM makes a
  hidden roll, damages a monster, places a hidden token and drafts fog. In the Table view's DevTools network
  and WebSocket frames there's no trace of the hidden roll's result, the monster's HP numbers, any player's HP
  numbers, the hidden token, the draft fog or the original map image. A test in `_dev/scripts/` feeds the role
  filter one full state and asserts the `table` output has none of those fields. Pulling the network cable and
  reconnecting restores the same screen.

**1.8 Bring live play to `/sheets/player/`** (no longer needed: there's one sheet code now, so every live-play
change already lands in `sheets/player/`. The test copy is archived and must not be used.)

**1.9 Campaign page rework** (asked for 2026-11-03; owner's answers from the interview of that day; built 2026-11-04, on a branch until merged)
- Built: everything below, in `campaigns/index.php`, `campaigns/campaigns.js`, `includes/tablelog.php` (`tl_page`), `campaigns/log.php` (`?page=1`, its default
  answer unchanged). The second round of the owner's answers (2026-11-04):
  - Rolls tab: an empty session is skipped (an accidental Start then End never hides the one before; with only empty ones, "No sessions yet"), every roll of the
    session shows (the other logs keep their 200), and the count is each person's own, so nobody learns of others' whispers. The page scrolls, no inner box.
    Times are 12-hour and in the viewer's own time zone, drawn in the browser (the server runs on UTC); a session left running shows its date: "since 3 Nov, 7:04 pm".
  - Open Table view sits beside Start/End session, DM and co-DMs, every tab. The map: players see nothing until its fog is first sent (no black box), the DM
    and co-DMs whenever it's on the table; about 70% of the screen's height on phones, one screen under its heading on desktop. A load that fails says so.
  - Tabs: each click is a step for Back; a tab you can't have opens Overview with the address cleaned; a new tab starts at the pills if you'd scrolled past;
    the pills don't stick, and are 44 px tall on phones. The fight dot is blue and shows as soon as a fight exists, rolling included. No toast for "Your turn".
  - Tiles: "Level 5 Fighter / Rogue" (no race), two-line names, 200 px or wider, the dot on each of an online player's characters, the old rule for who can open
    one (your own, or all for DMs). "Add your character" is primary for players and co-DMs, plain for the DM. No characters: a link to Build one. Only member: a line to Invite players.
  - Handouts: the pill counts new and updated, the Overview line names new ones; a name opens that handout on its tab, a pinned title that note. Everything is listed, nothing cut.
  - Campaign tab: one column, Rename and Delete or Leave last. The invite link, a player's rules, the title and the breadcrumb follow live. Ending a session with a fight on says so.
  - `/transcripts/`: the archived uploader keeps working, behind the password (`/private/archive/private/transcripts/`), and the viewer (`/private/archive/transcripts/`) serves the audio with Range. `/campaigns/<id>?s=<n>` also goes to `#rolls`.
  - Files stay on disk with no page: past sessions and rolls outside sessions, owner's choice.
  - Checks: `campaign-tabs.mjs`, `transcripts-archive.test.php`, `tablelog.test.php`. `includes/functions.php`: `$site_page['crumb']` names a page's last breadcrumb. Check on dndtest that
    `/transcripts/data/...` redirects there too: the local server uses `_dev/router.php`, Apache the root `.htaccess`.
- Before: the page was one long scroll: 4,043 px for a DM on a phone, 2,763 px for a player, and an empty map took 602 px.
- Tabs: pill tabs under the title: **Overview, Rolls, Handouts, Notes** (DM and co-DMs only), **Campaign**. They wrap to two
  rows on a phone. Links are `#rolls`, `#handouts`, `#notes`, `#campaign`; back and reload stay on the tab. A plain
  `/campaigns/<id>` always opens Overview, and no tab is remembered, so nothing needs saving to the account. One PHP page, so
  tabs switch at once; the map starts only when Overview shows.
- Header on every tab: title and people line. The DM and co-DMs have Start session / End session beside the title; End asks
  first. Everyone sees the badge "Session 12 since 7:04 pm" while one runs (the site's own session numbers stay).
- Overview, no session and no fight: "Last played 3 Nov 2026 · 34 rolls" (a link to Rolls), Party, new handouts, pinned notes,
  Map. Session running or a fight on: Party, Fight, Map, then new handouts and pinned notes. Fight and Map stack full width on
  every screen. Nobody is moved off the tab they're on when play starts; the Overview pill gets a dot during a fight.
  - Party: compact tiles (portrait, name, a muted level and class line, player's name with DM or Co-DM), 2 per row on a phone,
    a green dot when online. The whole tile opens the sheet for those allowed to, as View does today (1.5). A button in the Party
    heading opens a dialog with today's checkboxes, Clone offer and archived note: "Add your character" (the primary button) with
    none in the campaign, "Change characters" (plain) after.
  - New handouts: players only, a line naming the unopened ones, linking to the Handouts tab, hidden when there are none.
  - Pinned notes: DM and co-DMs only, titles linking to the Notes tab, hidden when there are none.
  - Fight: as today, above the map and hidden with no fight, with a "Run the fight" link to the map page for DMs. No new controls.
  - Map: still the live map with tokens, sized to the screen's height, shown only when a map is on the table. With none, players
    see nothing and the DM and co-DMs get "No map on the table. Open maps". Uploads and map management stay on the map page.
- Rolls tab (owner: the roll log isn't important enough for the main screen): the running session, or with none running the
  **last session only**. Rolls made between sessions stay saved and don't show here, not even live. This is the campaign page
  only: a new parameter on `campaigns/log.php`, while sheets, the Monster Sheet and the Table view keep what they get today.
  Heading "Session 12" or "Last session: 12 · 3 Nov 2026 · 34 rolls". No session ever run: "No sessions yet. Rolls show here once
  you start a session." for the DM and co-DMs, "No sessions yet." for players. The Past rolls links and the past-session view
  go; `sessions/<n>.json` and `unsorted.json` stay on disk untouched.
- Handouts and Notes tabs: today's editors, lists, search, groups, pins, archive and Show on TV move as they are (`dm.js`,
  `handouts.js`). Players see a count on the pill when some are unopened ("Handouts 2").
- Campaign tab: Players (online, badges, Make co-DM, Remove), Invite players, Character rules, Rename and Delete, Leave.
  Permissions don't change:

  | | DM | Co-DM | Player |
  |---|---|---|---|
  | Overview, Rolls, Players list | yes | yes | yes |
  | Handouts | edit | edit | read |
  | Notes tab, pinned notes | yes | yes | no |
  | Invite link | yes | yes | no |
  | Make a new link, Make co-DM, Remove, Rename, Delete | yes | no | no |
  | Character rules | edit | edit | read |
  | Leave campaign | no | yes | yes |

- Existing links: `/campaigns/?c=<id>` keeps its 301. `/campaigns/?c=<id>&s=<n>` and `&s=unsorted` get a 301 to
  `/campaigns/<id>#rolls`; non-members still get "Campaign not found". `/campaigns/<id>/map`, `/table` and join links don't change.
- `/transcripts/` is archived in this change (owner's choice, knowing friends lose the 2 public sessions): `git mv` the viewer
  and the uploader `/private/transcripts/` into `private/archive/`, for the owner only behind the site password. It leaves
  `site_pages()`; `/transcripts/...` gets a 301 to `/campaigns/`. `transcripts/data` stays in its volume and in `deploy.sh`'s
  counts, and must stop being public: the 301 covers `/transcripts/data/` too, so the archived viewer reads and serves the
  audio itself. The Privacy page's line and the design guide's reference to it are updated.
- Also fixed: the breadcrumb shows the campaign's name, not its id.
- Design guide, same change (owner's yes): page-level pill tabs with #hash links for an item page with many areas, and the compact
  character tile for a group of characters.
- Checks: new `campaign-tabs.mjs` (both browsers, as DM, co-DM and player: each role's tabs, hash links, Overview order with and
  without a session or fight, tiles, the characters dialog, unopened count, no sideways scroll at 320 to 2560); `table-log.mjs`
  moves from the past-session pages to the Rolls tab and redirects; `campaigns-page.mjs`, `handouts-page.mjs`, `maps-page.mjs`,
  `initiative-page.mjs`, `live-page.mjs` and `table-page.mjs` open the right tab first; a check that `/transcripts/data/` no
  longer serves audio.
- Size: ~4 days, one job. Done: a DM, a co-DM and a player each see the table above on a phone and a desktop; a session started
  by the DM reorders Overview live for the others without moving their tab; an old `&s=2` link lands on Rolls; the Table view
  and a sheet's Table tab behave as before.

**1.10 Import sessions from The Pitboss (Pitstop)** (dropped 2026-11-03, see Not planned; the plan is in this file's git history)

**1.11 Co-DMs** (owner's answers 2026-11-03)
- What: a campaign can have any number of co-DMs. The DM (the creator, `dm` in `campaign.json`) makes a member a
  co-DM and can make them a player again; only the DM can. A co-DM can do everything the DM can except rename or
  delete the campaign, make a new join link, remove members and pick co-DMs: every party sheet (read-only, like the
  DM), fights (controls, monster HP, hidden monsters), hidden rolls, seeing whispers and hidden rolls in the table
  log, starting and ending sessions.
- One check for every later DM feature (1.5, 1.6, 3.4): `cp_is_dm($c, $sub)` (DM or co-DM) and `cp_is_owner($c, $sub)`
  (the DM alone) in `includes/campaigns.php`. Nothing else compares `$c['dm']`.
- Storage: `codms: [sub, ...]` in `campaign.json`, written only once a campaign has had one, so older campaigns load
  unchanged. A co-DM who leaves or is removed drops out of it. Fight monsters keep `by` (whose Monster Sheet they came
  from; older entries without it are the DM's), and `sheets/monster/cloud.php?hp=<id>&c=<campaign>` lets the DM and
  co-DMs change each other's monster HP in that campaign's fight.
- Live: co-DMs get the relay's `dm` role. Making someone a co-DM or a player again closes their sockets with 4401
  (`rekey` in `live_publish`), so their pages reconnect with the new role and a demoted co-DM stops getting the DM's
  messages straight away; their campaign page reloads in full.
- Page (picked while the owner was away, to be confirmed): "Make co-DM" (asked first) and "Make player"
  beside each player for the DM, a blue "Co-DM" badge, "Co-DM: <name>" on party cards, "Pat is a co-DM" in the lede
  (co-DMs aren't counted as players), and a "You're a co-DM" section on `/campaigns/`. Co-DMs see the join link but
  not "Make a new link", and can leave.
- Checks: `campaigns.test.php`, `tablelog.test.php`, `initiative.test.php`, `live-relay.test.js`, `campaigns-page.mjs`,
  `initiative-page.mjs`.

### Phase 2: Phone and look

**2.1 Phone play mode** (built 2026-11-04 from the owner's mockup, `_dev/mockups/phone/`; on dndtest, the owner tries it on real phones, then the group plays, then the owner says when it goes live)
- Built: `assets/js/phone.js` frames the sheets' own panels, fields and actions when `<html class="ph-on">`: below 700 px, or a short window on a phone-sized screen (on its side, one-line header). A tablet and a short desktop window keep the desktop layout. "Use the full layout on this phone" (menu, Customise > Panels) is the setting `sheet-full-layout`, following the account.
- Header: name, conditions (or who they are) under it, HP with temp, AC, initiative, a count of conditions; a Map icon with a campaign; on the Monster Sheet ‹ › between monsters and the name opens the encounter sheet. Tab bar: Main (pinned notes, abilities, proficiency, inspiration, saves, skills and the other proficiencies, senses, death saves and hit dice, first at 0 HP; rests), Actions (Resources first until panels are moved, Actions, Passive abilities, Homebrew, lists and trackers added), Spells, Items, Notes (Notes, Handouts, Character details, text panels added). A new panel kind goes in `MAP` in phone.js; `phone-mode.mjs` fails if it's missing. On the Monster Sheet, Spells and Items hide when empty.
- Bottom sheets: HP (Damage, Heal far apart, Set temp, Edit HP; closes with a toast and Undo; Enter never applies), conditions with speed and defences, AC, details in place of the drawer, dice and the whole roll log with Clear and Mine / Table, Adv / Normal / Dis for the next d20, a − on each die; the menu (the top bar's own fields and buttons, sign-in, full layout, credits); the encounter sheet (fight panel, picker, difficulty, monsters, archived ones). Back closes a sheet. Rows are one line with their rolls, opening on tap.
- Saving: the last tab is `view.phoneTab` per character or monster (new in `blank()`). A tab, sub-tab or note being opened is no longer an edit, on desktop too: it never changes `updated`, and a Monster Sheet roll no longer does either. Coming back to an open sheet, signed in, takes the account's newer copies before anything goes up (`Phone.pullOnReturn`, both sheets at any width); the tab stays and rolls made here are kept. An edit in the moment before that check comes back gives way to the account's copy, with a toast and Undo.
- Not changed: an edit on a copy left in view while another device saves, or made offline, is still newest wins.
- Checks: `phone-mode.mjs` (both browsers, 320, 375, on its side, a tablet, desktop; signed-in data), `dm-edits.mjs` (DM on a phone).
- The plan as first written:
- What: below 700 px wide, the sheet switches layout. A header with name, HP (tap to damage or heal), AC,
  initiative and conditions always stays at the top. A bottom tab bar: Main (abilities, skills, saves, combat),
  Actions, Spells, Items, Notes. Tap targets are at least 44 px. The dice tray and log open as a bottom sheet.
  Desktop stays as it is.
- Touches: `assets/css/pages/games-dnd-sheet.css`, small markup hooks in `sheet.js`. Then the same for the
  monster sheet.
- Account save: the last tab is part of per-character `view` (already synced).
- Size: 4 days (both sheets). Done: in headless Chrome at 375 × 812 and 768 × 1024 there's no horizontal scroll,
  every panel can be reached, and all actions work one-handed. A play test with the group goes fine.

**2.2 Every page looks right on phone and laptop**
- What: tidy spacing and components on the home page, campaigns, dice and the D&D Beyond viewer
  (until it's retired), in both colour schemes, following the design guide (`/design`). Keep the current style;
  just make it consistent.
- Size: 2 days. Done: screenshots at 375, 768 and 1440 wide, in Chrome and Firefox, show no overflow or clipped
  text on every page in `site_pages()`.

**2.3 Theme-ready CSS**
- What: move colours and fonts into CSS variables in `global.css`, matching the design guide's tokens, so user
  themes (6.3) are only a new set of values later. No visible change now.
- Size: 1 day. Done: changing the variables re-colours every page, with no colours left hard-coded in page CSS.

### Phase 3: DM tools

**3.1 Named encounters on the monster sheet**
- What: monsters are grouped into named encounters (unlimited). The sidebar shows one encounter at a time,
  with a switcher. Monsters can be moved or copied between encounters.
- Data model: a new `enc` field in the monster `blank()` (encounter id) and an `encs` list in the
  `monster-sheet` store. On upgrade, every existing monster goes into "Encounter 1", so nothing disappears.
- Account save: `encs` saved in `accounts/monsters/<sub>/_encounters.json` (newest wins).
- Size: 1.5 days. Done: the data check shows every old monster present in "Encounter 1", and encounters show up on a second browser.
- Built (2026-11-03), owner's answers (they replace the text above where different): an encounter picker tops the
  sidebar (on phones it sits in the bar above the monster picker, which then lists only that encounter), with New
  encounter and Manage encounters at its end. A reload shows the last-opened monster's encounter (per browser).
  New ones are "Encounter 2", "Encounter 3"... with the name ready to type over; Manage renames, reorders (up/down)
  and archives them. Monsters with an empty `enc` (or one naming no encounter in the list, value kept) are in
  Unsorted: every existing monster starts there and every new one (New, import, Duplicate) goes there. Archiving an
  encounter folds it and its monsters under "Archived encounters" without touching their own `archived`; each
  encounter has its own "Archived (N)". "Move to encounter" and "Copy to encounter" are under Edit: a move is an edit
  (newest wins, fight entry kept, renumbered only if the name is taken there), a copy is a fresh creature (new id, full
  HP, no conditions, empty roll log, hpAt 0). Numbering is per encounter. "Add whole encounter to fight" adds the open
  encounter's monsters; fights store no encounter link. The list is saved in the `monster-sheet` store as `encs`, in
  `accounts/monster-encounters/<sub>.json` (`sheets/monster/encounters.php`, merged per encounter, newer `updated`
  wins, none ever dropped; `cloud.php` refuses monster ids starting with "_") and in the backups as
  `monster-backups/<ip>/encounters-<n>.json`. Checks: `monster-encounters.mjs`, `monster-encounters.test.php`, and
  `sheet-keeps-data.mjs` (`enc` is the one field added, every old monster in Unsorted).

**3.2 Encounter builder (difficulty and XP)**
- What: pick a campaign (or type the party's levels). Each encounter shows total XP, adjusted XP (the SRD 5.1
  group-size multiplier) and Easy/Medium/Hard/Deadly using the SRD 5.1 XP thresholds per character level.
  XP per creature comes from CR (SRD table). The compendium search (5.1) adds monsters straight in.
- Size: 1.5 days. Done: unit tests for the thresholds and multiplier against the SRD tables. A 4 × level-3 party
  vs 4 goblins reads the same as working it out by hand.
- Built (2026-11-04), owner's answers (they replace the text above where different): both rule sets, with a switch in the
  party dialog (`encounter-rules`, default 2014, one for the whole sheet, follows the account). 2014: Easy/Medium/Hard/Deadly and
  the multiplier, one step up for a party under 3, one down for 6 or more. 2024: Low/Moderate/High per character, no multiplier,
  "Above High" past the top. Under the lowest band reads "Trivial", marked as this site's word. Sources: XP by CR, thresholds and
  multipliers from the free Basic Rules (2014), numbers only; 2024 budgets from SRD 5.2.1 page 202 (CC BY 4.0, credited on the sheet).
  CR 0 counts 10 XP; a CR that can't be read counts 0 XP and one creature, and is named; a leading number is read ("15 (lair)").
  Archived monsters and unnamed new blanks are out, Down ones count, every monster counts (no "much weaker" rule). XP always comes
  from the CR, nothing is saved on a monster, and working it out never stamps anything.
  The card sits under the encounter picker in the sidebar, on every encounter, Unsorted and archived ones too; on phones one line
  in the bar (`.mon-diffbar`, a small separate element) opens it in a dialog. Each encounter has its own party, a new one starting from
  the last used (one that has never had a party shows the last used until edited, or the campaign the rolls go to): pick a campaign you
  DM or co-DM, tick characters out and add typed extra levels, or just type ("5, 5, 4" or "4x5"). Campaign levels are always current:
  read on opening, on the campaign's live update and with Refresh (level-ups send no live message), by `sheets/monster/party.php`,
  DM and co-DMs only. Drafts aren't counted (a note says so), no class level counts as 1, above 20 as 20. Offline shows the last levels seen
  (browser only, `mon-party-seen`, marked "Last checked"); a deleted campaign or a lost DM role turns them into typed levels with a note.
  Saved as `party` {camp, off, levels, at, gone} on the encounter in `encs` (only once it has one; merged with the encounter, newer
  wins), Unsorted's as `unsorted` beside the list, in the store, the account and the backups. An older image would drop saved
  parties on its next account save (owner accepted); monsters and encounters are safe.
  "Add monsters" on the card opens the search with a number box, CR and rules filters and the running difficulty; it stays open, fills the
  shown encounter and leaves the open monster open. Only that button adds to the encounter: New, Duplicate, Import file and Import monster stay in
  Unsorted. The Compendium's "Add to encounter" has an encounter picker (this browser's list, the last pick in `compendium-enc`, following
  the account). `addMonsters(key, n, enc, open)` and `monHits()` in `monster.js` are the one way in and the search list, for homebrew monsters to reuse.
  Numbering a monster to "<name> 1" now stamps it, so the new name reaches the account. Files: `sheets/monster/difficulty.js` (tables and
  sums). Checks: `encounter-difficulty.test.js`, `encounter-builder.mjs`, `monster-encounters.test.php`.

**3.3 DM combat tracker**
- What: extends the initiative tracker (1.4) for the DM: legendary action and legendary resistance counters
  (reset on the monster's turn and per day), recharge rolls (5-6), concentration reminders on damage
  (CON save DC = max(10, half the damage)), and turn-start reminders for conditions with end-of-turn saves.
  "Send to initiative" from an encounter.
- Size: 2.5 days. Done: a scripted fight with a legendary monster shows the counters resetting correctly over 3 rounds.

**3.4 DM notes and live handouts**
- What: private campaign notes for the DM (same editor style as the sheet's Notes panel). Handouts are text
  and/or an image the DM pushes to all players or chosen ones, live. Players get a notice and keep a Handouts
  list on the campaign page and on their sheet. The DM can unshare a handout.
- Storage: `campaigns/<id>/notes.json`, `campaigns/<id>/handouts/<id>.json` + images (chunked upload, no size limit beyond chunking).
- Size: 2.5 days. Done: a handout sent to one player shows only for that player, live and after reconnecting.
- Built (2026-11-03, owner's decisions of that day):
  - DM notes: many per campaign on the campaign page (DM and co-DMs only): title, group, pin, search, a folded
    "Archived (N)" with Restore. Plain text, autosaved; kept in the browser too (localStorage `campaign-dm`, offline
    editing) and in the account, newest `updated` wins per note. Every save goes into a history folder (no Versions UI yet).
    Never shown to players or the Table view (`handouts.test.php` checks).
  - Handouts: title, optional text (line breaks kept) and any number of jpg/png/webp/gif pictures, stored as uploaded,
    sent in resumable 4 MB pieces, checked by their first bytes and served with nosniff. Made as a private draft; Send to
    picked players or "everyone" (every member, later joiners too); players can be changed, Unshare makes it a draft again,
    Archive is the only removal (it also unshares; Restore brings it back as a draft). Editing a sent one updates players
    live with an "Updated" mark; every save is kept in its history. A per-handout "Show on the Table view" switch was
    stored for 1.7; 1.7 replaced it with a "Show on TV now" button (the stored value stays, unused). A player who leaves
    loses them all (files stay).
  - Players: a Handouts section on the campaign page and a new **Handouts panel type** on the sheet, added once
    (`hoPanel` in `blank()`) the first time a character is in a campaign, at the end of its panels; it can be moved or
    closed, and hides while the character is in no campaign or signed out. Several campaigns: grouped by campaign name.
    "New" until opened (kept on the server per player, so it follows the account); a toast "New handout: <title>"
    with Open when one arrives live. Pictures open in a dialog with Download.
  - Live: the relay carries only `{type: "handout" | "handout-gone", id}` to the DM role and the recipients' keys; pages
    load the handout from PHP. Reloaded on reconnect and every 10 s while the relay is down (`onLoad` in `Live.watch`).
  - Files: `includes/handouts.php` (`ho_sees()` is the one view check for JSON, pictures and the relay), `campaigns/handouts.php`,
    `campaigns/dm.js`, `assets/js/handouts.js`, `assets/css/pages/handouts.css`. Storage in `campaigns/<id>/`: `notes/<id>.json`
    (+ `notes/history/<id>/<n>.json`), `handouts/<id>.json`, `handouts/<id>/<image>.<ext>`, `handouts/history/<id>/<n>.json`,
    `handouts/seen/<sub>.json`; deleting the campaign moves them with it. Checks: `handouts.test.php`, `handouts-page.mjs`.
  - Picked while the owner slept (to confirm): recipients default to everyone; Unshare keeps the picks for re-sending;
    a handout open on a player's screen when it's edited counts as read; pictures waiting offline live only in the open
    page (closing it drops them; the text is kept); a character in several campaigns hears only its rolls' campaign live.

### Phase 4: Character building

Content note: SRD 5.1 has 9 races (some with one subrace), all 12 classes with **one subclass each**, one
background (Acolyte) and one feat (Grappler). The builder ships with exactly those, and everything else comes
from homebrew (4.6). Official non-SRD classes, subclasses, races and backgrounds are never copied in.

**4.1 SRD build data**
- What: a data file (`sheets/player/srd-build.json`, built by a script in `_dev/scripts/` from dnd5eapi.co
  `/api/2014` classes, subclasses, races, backgrounds, features, levels and starting equipment). It replaces the
  hard-coded `CLASSES`, `RACES` and `HIT_DIE` lists but keeps their names, so existing characters still match.
- Size: 1.5 days. Done: a test confirms every class has levels 1-20 with features, spell slots and proficiency bonus.

**4.2 Step-by-step builder** (built 2026-11-03 with 4.3, from the owner's answers in the builder questions and the approved
mockup `_dev/mockups/builder/`; the "Built" notes replace the plan below where they differ)
- Built, round 2 (2026-11-03): the NAME of anything (skills, spells, feats, subclasses, fighting styles and other class options, class features, tools, languages, race traits, equipment) is a button that opens its text in a side panel (a sheet from the bottom on a phone; Esc or Close closes it and the focus returns to the name); only the checkbox or radio ticks, and the panel has Pick/Unpick. Text comes from the content data and `sheets/player/rules.js`; where a thing has none the panel says "No description available" (tools and gear in the 2024 content, abilities). A feat chosen at an ability score improvement is described under that section, one per level. Spells: a fold per level with its picked count, one row per spell (school, casting time, ritual and concentration tags), search and school/ritual/concentration filters, picks as removable chips, the folds' open state kept. Multiclass has a plain explanation. The dice canvas `#hb-throw` is positioned in builder.css (the 3D dice were drawn off screen on this page).
- Built:
  - `/characters/build` (`characters/build/index.php` + `builder.js`, steps in the `#hash`): Name and look (name, starting level
    1 to 20, rules 2014 or 2024 when there's 2024 content, "Building for" a campaign when signed in, portrait cut to a square) →
    Class and level (searchable list rows with an icon tile and A to Z; the class's description, what each level gets, subclass at
    its level, skills and proficiencies, feature picks, ability score improvements (+2, +1 and +1, or a feat), spells with the
    class's counts, hit points rolled or averaged, more classes for multiclassing with the ability minimums as a warning) → Race
    (subraces replace the list with a Back button; one subrace is picked for you; the race's own picks) → Ability scores (point buy with over-budget allowed and warned, standard array, 4d6 drop lowest as six
    separate 3D throws, manual) → Background (or a custom one; languages, 2024 ability scores, alignment, faith, lifestyle,
    looks, personality traits, ideals, bonds and flaws picked, rolled or typed, allies, enemies, organisations, backstory) →
    Equipment (the class and background choices with packs unpacked, or gold rolled with the 3D dice, plus extra gear) → Review.
  - The rules are `sheets/player/build.js` (`HbBuild.build(choices, data, model)`), with no page in it; `_dev/scripts/builder.test.js`
    checks all 12 SRD classes at levels 1, 5 and 20 against a hand-worked table, point buy, drop lowest, multiclass slots,
    races, level up, and builds every imported class without errors. The character model (`blank()`, `ROW`, panels) moved to
    `sheets/player/model.js`, shared by the sheet and the builder.
  - The draft is a real character (`draft: 1`, its picks in `build`), saved on every change to the browser, the account and
    the backups, with no versions until Finish (`ch_write` skips drafts). My Characters lists it under Unfinished with Resume and
    Archive; Save and exit keeps it, Cancel archives it after asking. Finish makes the first version, attaches it to the campaign
    and opens the sheet with a note. Rolls (hit points, 4d6, gold, personality) go in its roll log with their dice.
  - Rows the builder adds carry `source` (and passive abilities `src`: "Fighter 1", "Hill Dwarf", "Background", so they land in
    the right tab); the review shows "From: ..." for each feature. A new Character details panel on the sheet holds background,
    faith, lifestyle, looks, personality, allies, enemies, organisations and backstory (new characters only; old ones can add it).
  - "Create a character" (My Characters, the sheet's Edit > New, the Compendium) asks: Build step by step or Blank character.
  - Campaign rules: a Character rules card on the campaign page; the DM or a co-DM picks the allowed ability score methods
    and hit point ways (all allowed until set); the builder offers only those for a character built for that campaign.
  - Content: one loader (`sheets/player/content.js`, `hbContent(rules, kinds)`) gives each rules version its own data
    (srd-build.json plus the content files for 2014; the 2024 files alone), loading spells and equipment only when a step needs
    them. Icons come from `sheets/player/icons.json` through `iconFor()`, with a letter tile where there's none.
- What (plan): "New character → Build" goes through race → class → background → ability scores → skills and
  proficiencies → equipment → name and art. Ability score methods: point buy (27 points), standard array,
  4d6 drop lowest (rolled with the 3D dice, every roll kept in the character's roll log), or manual. The
  campaign setting decides which methods are allowed; with no campaign the player picks.
- Guided, then free: the builder fills the normal sheet (rows tagged with `source: "Class: Fighter 1"` etc.),
  and every value stays editable afterwards. Nothing is blocked as "illegal". "Blank character" stays for
  free-form sheets.
- Size: 5 days. Done: building an SRD level-1 character of each of the 12 classes gives the correct HP, AC,
  saves, skills, attacks and spells, checked by a test against hand-worked sheets.

**4.3 Level-up flow** (built 2026-11-03 with 4.2)
- Built: a Level up button on a finished character's sheet opens `/characters/build?up=<id>`: the builder's class screen for
  the next level only (an existing class or a new one, with the multiclass minimums as a warning), its new features and picks,
  subclass, ability score improvement or feat, new spells, and hit points rolled or averaged (the campaign's rules apply).
  `HbBuild.levelUp` only adds rows and raises numbers (slots, resources, hit points); it never edits a row the player has.
  Finish saves it and the sheet offers Undo for 15 seconds, which puts back the exact character from before.
  Not built: flagging rows "changed by you" (level up never changes existing rows, so there's nothing to flag yet).
- What (plan): a "Level up" button. Pick the class (multiclass allowed; SRD prerequisites are shown as a warning, not
  a block). HP: roll the hit die or take the average, as the campaign setting says (rolled in the 3D dice and
  logged). Adds new features, resources and spell slots, offers subclass, ASI or feat at the right levels, and
  updates hit dice.
- Data safety: level-up only *adds* rows and raises numbers. It never deletes or rewrites rows the player
  edited (rows tagged with a `source` but edited by the player are left alone and flagged "changed by you").
  Undo covers the whole level-up as one step.
- Size: 4 days. Done: levelling a fighter 1→5 and a wizard 1→3 / cleric 1 multiclass matches the SRD tables,
  and undo restores the exact previous character (deep-equal test).

**4.4 Spell rules**
- What: per class, show known vs prepared limits (e.g. a wizard prepares INT + level, a sorcerer knows a fixed
  number) and warn when over, without blocking. Spell slots come from the class tables, including the
  multiclass slot table. The spell points variant can be turned on per campaign or character; it builds on the
  existing spell-points counter. The point-cost and points-per-level table isn't in the SRD, so the DM types it
  into the campaign settings once (an editable table, empty by default), and the site doesn't ship one. Pact Magic stays separate.
- Size: 2.5 days. Done: tests for multiclass slots (e.g. paladin 4 / sorcerer 3), prepared counts and the spell points table.

**4.5 Equipment rules**
- What: encumbrance from STR (standard rule; the variant "encumbered / heavily encumbered" rule can be switched
  on), carried weight including coins (50 per lb), starting equipment from class and background in the
  builder, and the attunement cap (already there, default 3).
- Size: 1.5 days. Done: a STR 10 character carrying 160 lb shows over capacity, and coin weight is counted.

**4.6 Homebrew classes and races (for the builder)**
- What: a creator for homebrew races, subraces, classes, subclasses, backgrounds and feats in the same shape as
  the SRD build data (features per level, hit die, proficiencies, spell slots, resources with formulas). They're
  used by the builder and level-up exactly like SRD entries, marked "Homebrew".
- Storage and sharing: `accounts/homebrew/<sub>/<id>.json`. Shared to a campaign by the DM or owner (see 5.2).
  Characters keep a *copy* of the homebrew they used, so editing or deleting homebrew never breaks a sheet;
  "update from source" is a manual button.
- Size: 4 days. Done: a custom class built in the creator can be picked in the builder by another campaign
  member and levelled 1→3.
- Built (stage 4 of 5.2): New class and New subclass in the Classes tab, New race and New subrace in Races, New background: a full-screen popup in steps with Back and Next (`assets/js/homebrew-form.js`, loaded the first time it's
  needed), which saves itself as an Unfinished entry only its owner sees (not shareable, not pickable, refused by the server too). Editing a finished entry only saves at Finish. "Start from" and "Copy to homebrew" fill it from any official entry. A class has features per level
  (text, uses with recharge, proficiency grants, options to choose, skill and expertise picks), improvements, its subclass level, extra table columns, caster presets with an editable table, spell lists, resources (number per level, a column or a formula), (a) or (b) starting equipment with
  item pickers, gold and multiclass rules. A race has bonuses, languages, traits, darkvision, resistances, other speeds, skill and tool grants, a skill choice and cantrips; attacks stay as text. `assets/js/homebrew-content.js` turns an entry into srd-build.json's shape for the builder, level up and the Compendium.
  In build.js a homebrew feature or trait never acts by its name (a homebrew "Rage" is only a name; those rows carry `hbf`), and a homebrew subclass never moves an official class's pick level: an early feature arrives at the pick. `builder-official.test.js` proves official content builds exactly as before, with and without homebrew beside it.
  A character keeps a copy of what it picked in `build.hbc` from the moment of picking, so a draft and later level ups never depend on the source. At level up, a newer version asks "Dee updated X. Use the new version?"; earlier rows never change. For a character built for a campaign the builder offers your own homebrew and that campaign's.
  Checks: `homebrew-class.test.js` (hand-worked), `homebrew-classes.mjs` (built by one member, picked by another, levelled 1 to 3, with the class archived mid-draft).

### Phase 5: Content

**5.1 Compendium**
- What: `/compendium/`, searchable and filterable: spells (319 SRD + the 205 extra spells, which the owner
  wants shown everywhere; stats are kept, the text is fetched live from dnd5e.wikidot.com when opened, via `spells.php`, never stored), monsters (SRD + Open5e, as
  the monster sheet uses), items and magic items (SRD), conditions and rules text (`rules.js`). Campaign
  homebrew is mixed in and marked. "Add to sheet" / "Add to encounter" buttons.
- Touches: reuses `spells.php`, `monsters.php` and `rules.js`, plus a new equipment/magic-item proxy (same
  caching pattern). Add to `site_pages()`.
- Size: 4 days. Done: search finds Fireball, Goblin, Bag of Holding and Grappled, and "Add to sheet" adds a spell to the open character.
- Since then: the lists and text of spells, equipment and magic items come from `sheets/player/content/` (built by
  `_dev/scripts/build-content.mjs`), loaded per tab and kept apart by rules version; `compendium/spells.json` and
  `items.php` stay for anything else but the Compendium no longer lists from them. New tabs: Classes (level table, features,
  subclasses that open), Races (traits, subraces), Backgrounds and Feats. A 2014 / 2024 / Both switch (default Both,
  `compendium-rules`) follows the account. An open entry names its book and a Sources tick list (`assets/js/books.js`, `compendium-books`, shared with the builder) narrows every tab; the books are each entry's `book` in the content files (`_dev/scripts/content/books.mjs`, added by `build-books.mjs` so nothing else in the files changes). Monsters keep their book badge
  and filter, since they aren't new content and each stat block carries its licence line. Monsters: duplicates by name keep the
  SRD, then the newest book (Tome of Beasts 2023 over 2016): 2,282 names, all 2014 rules, plus the 331 SRD 5.2 monsters as separate
  2024 entries (`s24:<slug>`, Open5e v2 turned into the v1 shape in `monsters.php`), so the switch filters monsters too and the
  Monster Sheet's search shows both copies with a 2024 badge. Classes, races and backgrounds link to `/characters/build`.
  "Add to sheet" sends the entry's own details (spell, item, a feat as a Passive abilities row), so a 2024 spell keeps its 2024 text.
  Keys that changed (17 spells, 111 magic items, 347 monsters) keep working through `content/aliases.json` and
  `monster/aliases.json`, generated by the build scripts and read when favourites and links are read; stored favourites aren't rewritten.

**5.2 Homebrew creator (items, spells, monsters and more)**
- What: create homebrew items (including magic items with attunement), spells, monsters and feats. Visible to
  the owner, and to a campaign once added to it ("Mine + my campaigns"). Shows in the compendium, spell picker,
  item suggestions and monster search for members.
- Storage: `accounts/homebrew/<sub>/<id>.json`, with the campaign keeping a list of shared ids. A copy is kept
  on any character or monster that uses it.
- Data safety: deleting homebrew never removes copies already on sheets. Unsharing hides it from the
  compendium but leaves existing copies.
- Size: 4 days. Done: a homebrew spell made by the DM and shared shows in a player's spell picker. After the DM
  deletes it, the player's sheet still has it.
- Built in stages, with a "New ..." button in each Compendium tab, Edit and Archive on the entry, always shown whatever the
  rules switch says. Any member shares their own entries; the DM or a co-DM can take one out of the campaign; the list is
  `accounts/campaigns/<id>/homebrew.json`. Stage 1 done: storage, sharing and house rules (`includes/homebrew.php`,
  `compendium/homebrew.php`, `assets/js/homebrew.js`, browser key `homebrew`).
  Stage 2 done: spells, items, magic items and feats. Each has its form in its Compendium tab (fields that don't apply stay hidden; a spell has a How it rolls
  section; dice and uses are checked with the sheet's own formula parser; closing a changed form asks first), "Copy to homebrew" on any official or homebrew
  entry, and a Homebrew only filter. Saving keeps the replaced version in `homebrew/<sub>/history/<id>/<updated>.json` (no screen yet). Entries carry an account
  mark (`acct`, a hash), and go only to that account, so two people on one browser never upload each other's. What campaigns share is copied for offline use
  to `homebrew-shared`, read-only and hidden when signed out. A browser that's full still saves to the account (signed in).
  On sheets: "Add to sheet" and the name suggestions ("Zap (homebrew)") add the sheet's own copy, with `hbsrc` {id, by, at, sum} on each row, so a source being edited,
  archived or unshared changes nothing there. A row's detail says where it came from; "Update available" on the row opens a dialog of the changes, with a warning if
  the row was changed by hand; play state (prepared, quantity, equipped, attuned, uses) stays, and Undo lasts 15 seconds. A homebrew weapon also gets an Actions row; armour goes to
  Inventory only and never changes AC. The builder lists homebrew spells (by ticked class, or for any caster with none ticked), feats at an improvement and gear in Extra gear, and keeps
  what was picked in the draft (`build.hbc`). The Monster Sheet has the spell suggestions; updating a monster's rows came with stage 3. Check: `homebrew-copies.mjs`.
  Stage 3 done: monsters. "Save as homebrew" under Edit on the Monster Sheet (name, size, type, CR, then Update or Save as a new one if it was saved before) keeps the stat block, with hit points
  full and no conditions, rolls, uses spent or notes; the book's credit is kept. New monster, Edit and Copy to homebrew in the Compendium lead to the Monster Sheet, so there's one stat block editor. The
  Compendium shows the numbers worked out at save time. Homebrew monsters come first in the Add monsters and Import monster search and go through `addMonsters`, each its own copy with `hbsrc`, and Update (the changes, hand-edit warning, Undo) keeps
  hit points, conditions, notes, rolls and uses. A monster shared "DM only" is left out of `hb_view` for anyone but that campaign's DM and co-DMs, so a player's answer never has it. Check: `homebrew-monsters.mjs`.

**5.3 Retire the D&D Beyond viewer**
- What: when the party overview (1.5) is live, import the 6 characters from `characters.json` into their
  owners' homebrew sheets (with each owner, using the existing D&D Beyond import). Then take `/characters/` out
  of `site_pages()` and make the page a short notice pointing to the campaign page (the old page is moved with
  `git mv` into `private/archive/`, never deleted). The D&D Beyond import button on the sheet stays.
- Data safety: `characters/cache/` and its volume are left in place (never deleted).
- Size: half a day, plus time with each player. Done: all 6 characters exist as homebrew sheets on their owners' accounts.

**5.4 Compendium popup on every page**
- What: on any page whatsoever, the Compendium opens in a popup sidebar window for super fast referencing.
- Size: not sized yet. Done: from any page, the Compendium opens in the popup sidebar and an entry can be looked up.

### Phase 6: Polish

**6.1 Installable and offline (PWA)**
- What: a manifest and service worker. The site can be added to the home screen. Sheets, dice, rules and the
  last-loaded SRD data work with no signal. Account sync already uses newest-wins, so edits made offline upload
  when back. Offline live-log rolls follow 1.3.
- Care: the service worker must never serve an old `sheet.js` with a newer save (cache by `?v=` version, as
  dice already do), and must never cache API responses that hold account data for another user.
- Size: 3 days. Done: in airplane mode, open the installed app, edit a character and roll dice. Back online, the
  change shows on a second device and the data check still passes.

**6.2 Read-only share links** (dropped 2026-11-04, see Not planned; the plan is in this file's git history)

**6.3 User-pickable themes** (optional; the owner wants it kept possible, not built now)
- What: a few themes built on the 2.3 variables, picked in a menu and saved to the account (prefs key `theme`).
- Size: 1.5 days. Done: the theme picked on a phone shows on a laptop after sign-in.

---

## Not planned / decided against

| Item | Why |
|---|---|
| Import sessions from The Pitboss (was 1.10) | Dropped by the owner in the 1.9 interview, with AI summaries, transcripts and recorded audio on the campaign page. Would need a new interview to come back. |
| Read-only share links (was 6.2) | Dropped by the owner: the Public setting already gives a read-only link at `/characters/<id>`. Public pages now send noindex, so search engines don't list them. |
| Print / PDF export | Not picked by the owner. The browser's print stays as it is. |
| Separate accessibility pass | Not picked. Every new feature still keeps today's level: labels, keyboard use, dialogs, reduced motion. |
| Merging Quick Rolls into Dice Sets | The owner keeps both pages as they are. |
| Dice fairness tallies in the account (0.2) | The owner's choice: `dice-test-counts` stays in the browser only. |
| Any count or size limits | The owner wants no limits anywhere; only the proxy's request size is handled, by chunking. |
| Copying official non-SRD classes, subclasses, races, monsters or spell text | Copyright. Only SRD 5.1 / CC content, plus homebrew. One exception by the owner's choice (3.2): the 2014 XP thresholds and encounter multipliers aren't in SRD 5.1 as far as we know, so the Monster Sheet uses those numbers from the free Basic Rules, with no book text copied. |
| Removing the 205 extra spells | The owner keeps them and wants them shown everywhere. Their stats are kept; the compendium and sheet show their text fetched live from wikidot, never stored. No non-SRD text is copied into the site's files, and no more is added. |
| Guests (signed-out) in campaigns | Membership, logs and the DM view hang off the Google account. |
| Strict rules builder that blocks choices | The owner wants "guided, then free": warnings only. |
| PHP polling or Server-Sent Events for live play | Chosen: a Node relay. Polling only as the fallback when it's down. |
| Players editing initiative | The DM runs it. |
| DM whole-file writes to player sheets | The DM can edit everything, but only through field-level edits the player's sheet applies (1.5). |
| Login-free Table view link for smart TVs | The Table view is a tab in the DM's signed-in browser on the HDMI screen or screen share. |
| Walls and lighting | Not asked for; v1 is image, grid, tokens, fog and a ruler. |
| Ongoing D&D Beyond sync | The viewer is retired (5.3). The import stays one-time. |
| Public sign-ups / open to anyone | 2-4 groups of friends. No moderation or abuse tooling. |

---

## Open questions

None. Every area was answered in the interview on 2026-11-02. These steps need the owner's word when they come
up, because of CLAUDE.md rather than an open design question:

- Every push to live: only when the owner says so in that message.
- Any server change beyond `deploy.sh test|live` (`--compose`, `import`, `logs`, volumes) asks first. The live
  relay (1.2) ended up needing no compose change.
- Retiring the D&D Beyond viewer (5.3) needs each of the 6 players to import their character first.

---

## Size by phase

| Phase | Features | Rough size |
|---|---|---|
| 0 Finish in-flight and storage | 4 (0.2 dropped) | ~5.5 days |
| 1 Live table and campaigns | 9 (1.8 not needed, 1.10 dropped) | ~27 days (1.9 adds ~4, dropping 1.10 takes off ~4) |
| 2 Phone and look | 3 | ~7 days |
| 3 DM tools | 4 | ~8 days |
| 4 Character building | 6 | ~18.5 days |
| 5 Content | 4 | ~8.5 days + 5.4 (not sized yet) |
| 6 Polish | 2 (6.2 dropped) | ~4.5 days |
