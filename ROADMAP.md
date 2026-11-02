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
their answer, not a guess. If something here is unclear, the owner's answers recorded in this file decide.

---

## How every feature is shipped

The same for every item below (from CLAUDE.md):

1. Build it locally (`php -S 127.0.0.1:8110 -t .`). Run `node _dev/scripts/*.test.js`,
   `php _dev/scripts/auth-claims.test.php` and a headless-Chrome check with no console errors.
2. If it touches a sheet: run `_dev/scripts/sheet-keeps-data.mjs` against the live code. It must end with
   `sheet keeps data ok`. Test signed in and signed out: survives sign-in, a new browser, and an edit on another device.
3. Player sheet changes go straight into `sheets/player/` (the code `/characters/<id>` runs too) and are tried on
   dndtest first. The old test copy `/sheets/player-dev/` is archived in `private/archive/sheets/player-dev/`.
4. Commit in small commits, push to main, run `bash _dev/deploy.sh test`, then check dndtest.craftyplayz.com.
5. Ask the owner "<feature> is on dndtest.craftyplayz.com. Push it to the live site?" Only on "Push to live",
   run `bash _dev/deploy.sh live`.

**No limits.** The owner wants no app-imposed limits anywhere: unlimited characters, campaigns, monsters,
dice presets, homebrew, everything. Don't add count caps. Only real limits stay: the host proxy rejects
request bodies near 8 MB, so big uploads are sent in chunks (as the transcript importer does).

**Where new account data lives.** Everything new goes inside the existing `accounts` volume
(`private/dnd/accounts/`), so no new compose volume is needed and `deploy.sh` already counts it. Google `sub`
IDs are numeric (`auth_claims_ok` checks this), so named folders can't clash with a user folder.

| Path under `private/dnd/accounts/` | Holds | Status |
|---|---|---|
| `<sub>/<character id>.json` | player sheet characters | exists |
| `dev/<sub>/<character id>.json` | test sheet characters | exists |
| `monsters/<sub>/<monster id>.json` | monster sheet monsters | in progress (uncommitted) |
| `prefs/<sub>.json` | dice choice, Dice Sets page, roll mode | in progress (uncommitted) |
| `characters/<id>/art.<ext>` | character portraits (owner's choice: in the character's folder) | exists (0.4) |
| `campaigns/<campaign id>/...` | campaign, members, logs, initiative, notes, handouts | `campaign.json` exists (1.1); the rest Phase 1 |
| `homebrew/<sub>/<id>.json` | homebrew items, spells, monsters, classes, races... | Phase 4/5 |
| `shares/<token>.json` | read-only share links | Phase 6 |

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
  in `extra-spells.json` (stats only, text linked to wikidot).
- **Inventory:** categories, equipped, attunement with a slot cap, quantity, weight (total shown, no
  encumbrance), value, coins cp/sp/ep/gp/pp (typed like `5g5s`), and SRD gear suggestions.
- **Resources:** counter, boxes, slots by level, sorcery points or ki. The max can be a formula, with a short,
  long or no reset.
- **Rests:** short rest (spend hit dice) and long rest dialogs.
- **Art:** cropped to 480 px and stored inline in the character, so it counts toward the browser's ~5 MB.
- **Undo:** a snapshot before deletes, offered for about a second in a toast.
- **Roll log:** the last 100 rolls per character, with a side log and a dice tray. Options can turn off rolls,
  the tray, sound and animation.
- **Import/export:** JSON files. D&D Beyond import (public characters only, through `ddb.php` + `ddb.js`) is a
  one-time copy.
- **Saving:** localStorage (`hb-sheet`), the Google account (`cloud.php`, newest `updated` wins, currently 3 MB
  per character and 200 per account), and server backups (`backup.php` → `backups/<ip>/<name>/`). Backups are
  never pruned, and there's no restore button (only the admin backup browser). Planned: 0.5 version history.
- **Layout:** two columns from 960 px. There's no phone layout yet. It has ARIA labels, dialogs, Escape to close
  and reduced-motion support.

### Monster sheet (`/sheets/monster/`)
- A copy of the player sheet with classes hidden. CR stands in for level and drives `PROF` and `CANTRIP`.
- One list of monsters in a sidebar showing HP and CR. Duplicates get numbered names. There are no named encounters.
- Search: `monsters.json` index (SRD + Open5e). `monsters.php` proxies dnd5eapi.co and api.open5e.com,
  strips lore and images, caches 30 days, and serves the stale copy if a refresh fails. Credits are in `ogl.txt`.
- HP, conditions, rests, an initiative roll button (no turn order), dice tray and roll log. Legendary actions
  are imported as plain action rows, with no counters. There's no XP or difficulty.
- Saving: localStorage `monster-sheet` and server backups (`monster-backups/`).
- **In progress (uncommitted, another session):** account save through `sheets/monster/cloud.php` →
  `accounts/monsters/<sub>/`, `updated` stamps, and `rolls` added to `blank()`.

### Dice (`/dice/`)
- 10 themed 3D sets (abyss, arcane, clockwork, ember, frost, spectral, starfall, storm, venom, wildwood) and 8
  plain sets. Built with three.js 0.160 + cannon-es 0.20 from jsDelivr. The physics runs first, then the
  numbering is turned so the die lands on the chosen result.
- About 34 sounds, nat 1/20 sounds (`natsounds/`), and coins (a built-in coin plus 6 model coins, with coin
  sounds). Trails and nat 1/20 animations exist only for the Ember set (`dice/extras/ember/`).
- Pages: Dice Sets (presets, a "Land N" test roll), Quick Rolls (`/dice/rolls/`: nat 1, 2-19, nat 20, coin),
  Dice Fairness Test (`/dice/test/`: 8 panels with a chi-square test, tallies kept in the browser).
- `dice/choice.js` holds the choice (`dice-choice`), which the sheets read on every roll.
- **In progress (uncommitted):** `prefs.php` + `assets/js/sync.js` save `dice-choice`, `dice-sets-page`,
  `dice-sets-sound` and `dnd.rollMode` to `accounts/prefs/<sub>.json` (64 KB cap, newest wins, one reload per
  session after a pull).

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

**0.1 Finish account sync for the monster sheet and settings** (another session is on this now)
- What: commit the uncommitted monster `cloud.php` and `prefs.php` + `sync.js` work, then tick off
  `monster-sheet`, `dice-choice`, `dice-sets-page`, `dice-sets-sound` and `dnd.rollMode` in CLAUDE.md.
- Data safety: monsters get `updated` (legacy = 1) and `rolls` in `blank()`. `sheet-keeps-data.mjs` already
  covers `/sheets/monster/`.
- Size: whatever is left of that session's work, about half a day.
- Done: a monster and a dice choice made on one browser appear on a second browser after sign-in. The data check passes.

**0.2 Dice fairness tallies to the account**
- What: add `dice-test-counts` to the prefs keys (`PF_KEYS` in prefs.php and `KEYS` in sync.js; keep both lists equal).
- Size: 1 hour. Done: the tallies show up on a second browser.

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
- Campaign settings (DM, later): house rules. HP on level-up: roll or average. Ability scores: point buy / standard
  array / 4d6 drop lowest / manual allowed. Spell points variant on or off. Which homebrew is shared. When a
  character isn't in any campaign, the player picks these themselves.
- Pages: `/campaigns/` (my campaigns: DM of / player in), `/campaigns/?c=<id>` (campaign page: members,
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

**1.4 Initiative tracker**
- What: run by the DM, seen by players. Players' initiative rolls on their sheet add them automatically. The DM
  adds monsters from the Monster Sheet (linked: HP changes in the tracker and on the Monster Sheet are the same
  data), sets ties and order, and advances turns and rounds. Players see the order, the round and whose turn it
  is, as a row of portraits (character art) in turn order. Monster HP shows to players only as Healthy /
  Bloodied (≤ half) / Down. Hidden monsters (1.6) are left out of the order players see. A "your turn" notice
  appears on that player's sheet.
- Storage: `campaigns/<id>/initiative.json` (the current fight). Monster entries point to the DM's monster by
  id. HP is written to the DM's monster save through the monster sheet's own save path, so the newest-wins rule
  holds.
- Reconnect: the full current order is sent on join.
- Size: 3 days. Done: three players roll in, the DM adds two monsters, advances two rounds and damages a
  monster. Players see Bloodied but not numbers, and a reload on any device shows the same state.

**1.5 DM view of party sheets and party overview**
- What: the campaign page shows a party overview: name, HP bar, AC, passive Perception, conditions,
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

**1.7 Table view (TV / screen share)**
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

**1.8 Bring live play to `/sheets/player/`**
- What: copy the tested player-dev changes to the live sheet, keeping the key `hb-sheet` and the account folder
  `accounts/<sub>/`.
- Size: half a day. Done: the full data check against live passes, and a campaign session works from `/sheets/player/`.

### Phase 2: Phone and look

**2.1 Phone play mode**
- What: below 700 px wide, the sheet switches layout. A header with name, HP (tap to damage or heal), AC,
  initiative and conditions always stays at the top. A bottom tab bar: Main (abilities, skills, saves, combat),
  Actions, Spells, Items, Notes. Tap targets are at least 44 px. The dice tray and log open as a bottom sheet.
  Desktop stays as it is.
- Touches: `assets/css/pages/games-dnd-sheet-dev.css`, small markup hooks in `sheet.js`. Then the same for the
  monster sheet.
- Account save: the last tab is part of per-character `view` (already synced).
- Size: 4 days (both sheets). Done: in headless Chrome at 375 × 812 and 768 × 1024 there's no horizontal scroll,
  every panel can be reached, and all actions work one-handed. A play test with the group goes fine.

**2.2 Every page looks right on phone and laptop**
- What: tidy spacing and components on the home page, campaigns, dice, transcripts and the D&D Beyond viewer
  (until it's retired), in both colour schemes. Keep the current style; just make it consistent.
- Size: 2 days. Done: screenshots at 375, 768 and 1440 wide show no overflow or clipped text on every page in `site_pages()`.

**2.3 Theme-ready CSS**
- What: move colours and fonts into CSS variables in `global.css` so user themes (6.3) are only a new set of
  values later. No visible change now.
- Size: 1 day. Done: changing the variables re-colours every page, with no colours left hard-coded in page CSS.

### Phase 3: DM tools

**3.1 Named encounters on the monster sheet**
- What: monsters are grouped into named encounters (unlimited). The sidebar shows one encounter at a time,
  with a switcher. Monsters can be moved or copied between encounters.
- Data model: a new `enc` field in the monster `blank()` (encounter id) and an `encs` list in the
  `monster-sheet` store. On upgrade, every existing monster goes into "Encounter 1", so nothing disappears.
- Account save: `encs` saved in `accounts/monsters/<sub>/_encounters.json` (newest wins).
- Size: 1.5 days. Done: the data check shows every old monster present in "Encounter 1", and encounters show up on a second browser.

**3.2 Encounter builder (difficulty and XP)**
- What: pick a campaign (or type the party's levels). Each encounter shows total XP, adjusted XP (the SRD 5.1
  group-size multiplier) and Easy/Medium/Hard/Deadly using the SRD 5.1 XP thresholds per character level.
  XP per creature comes from CR (SRD table). The compendium search (5.1) adds monsters straight in.
- Size: 1.5 days. Done: unit tests for the thresholds and multiplier against the SRD tables. A 4 × level-3 party
  vs 4 goblins reads the same as working it out by hand.

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

### Phase 4: Character building

Content note: SRD 5.1 has 9 races (some with one subrace), all 12 classes with **one subclass each**, one
background (Acolyte) and one feat (Grappler). The builder ships with exactly those, and everything else comes
from homebrew (4.6). Official non-SRD classes, subclasses, races and backgrounds are never copied in.

**4.1 SRD build data**
- What: a data file (`sheets/player/srd-build.json`, built by a script in `_dev/scripts/` from dnd5eapi.co
  `/api/2014` classes, subclasses, races, backgrounds, features, levels and starting equipment). It replaces the
  hard-coded `CLASSES`, `RACES` and `HIT_DIE` lists but keeps their names, so existing characters still match.
- Size: 1.5 days. Done: a test confirms every class has levels 1-20 with features, spell slots and proficiency bonus.

**4.2 Step-by-step builder**
- What: "New character → Build" goes through race → class → background → ability scores → skills and
  proficiencies → equipment → name and art. Ability score methods: point buy (27 points), standard array,
  4d6 drop lowest (rolled with the 3D dice, every roll kept in the character's roll log), or manual. The
  campaign setting decides which methods are allowed; with no campaign the player picks.
- Guided, then free: the builder fills the normal sheet (rows tagged with `source: "Class: Fighter 1"` etc.),
  and every value stays editable afterwards. Nothing is blocked as "illegal". "Blank character" stays for
  free-form sheets.
- Size: 5 days. Done: building an SRD level-1 character of each of the 12 classes gives the correct HP, AC,
  saves, skills, attacks and spells, checked by a test against hand-worked sheets.

**4.3 Level-up flow**
- What: a "Level up" button. Pick the class (multiclass allowed; SRD prerequisites are shown as a warning, not
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

### Phase 5: Content

**5.1 Compendium**
- What: `/compendium/`, searchable and filterable: spells (319 SRD + the 205 extra spells, which the owner
  wants shown everywhere; stats only, text stays a wikidot link, never copied in), monsters (SRD + Open5e, as
  the monster sheet uses), items and magic items (SRD), conditions and rules text (`rules.js`). Campaign
  homebrew is mixed in and marked. "Add to sheet" / "Add to encounter" buttons.
- Touches: reuses `spells.php`, `monsters.php` and `rules.js`, plus a new equipment/magic-item proxy (same
  caching pattern). Add to `site_pages()`.
- Size: 4 days. Done: search finds Fireball, Goblin, Bag of Holding and Grappled, and "Add to sheet" adds a spell to the open character.

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

**5.3 Retire the D&D Beyond viewer**
- What: when the party overview (1.5) is live, import the 6 characters from `characters.json` into their
  owners' homebrew sheets (with each owner, using the existing D&D Beyond import). Then take `/characters/` out
  of `site_pages()` and make the page a short notice pointing to the campaign page. The D&D Beyond import button
  on the sheet stays.
- Data safety: `characters/cache/` and its volume are left in place (never deleted).
- Size: half a day, plus time with each player. Done: all 6 characters exist as homebrew sheets on their owners' accounts.

### Phase 6: Polish

**6.1 Installable and offline (PWA)**
- What: a manifest and service worker. The site can be added to the home screen. Sheets, dice, rules and the
  last-loaded SRD data work with no signal. Account sync already uses newest-wins, so edits made offline upload
  when back. Offline live-log rolls follow 1.3.
- Care: the service worker must never serve an old `sheet.js` with a newer save (cache by `?v=` version, as
  dice already do), and must never cache API responses that hold account data for another user.
- Size: 3 days. Done: in airplane mode, open the installed app, edit a character and roll dice. Back online, the
  change shows on a second device and the data check still passes.

**6.2 Read-only share links**
- What: "Share" on a character makes a link (`/share/<token>`) anyone can open without signing in. It shows a
  read-only sheet, including art and the 205 extra spells. The owner can turn the link off or make a new one.
  Unlimited links.
- Storage: `accounts/shares/<token>.json` → `{sub, sheet, character id}`. The page reads the character live
  from the owner's account, so it's always current. It never copies the character.
- Size: 1.5 days. Done: the link works in a private window, and after revoking it gives "link turned off".

**6.3 User-pickable themes** (optional; the owner wants it kept possible, not built now)
- What: a few themes built on the 2.3 variables, picked in a menu and saved to the account (prefs key `theme`).
- Size: 1.5 days. Done: the theme picked on a phone shows on a laptop after sign-in.

---

## Not planned / decided against

| Item | Why |
|---|---|
| Print / PDF export | Not picked by the owner. The browser's print stays as it is. |
| Separate accessibility pass | Not picked. Every new feature still keeps today's level: labels, keyboard use, dialogs, reduced motion. |
| Merging Quick Rolls into Dice Sets | The owner keeps both pages as they are. |
| Any count or size limits | The owner wants no limits anywhere; only the proxy's request size is handled, by chunking. |
| Copying official non-SRD classes, subclasses, races, monsters or spell text | Copyright. Only SRD 5.1 / CC content, plus homebrew. |
| Removing the 205 extra spells | The owner keeps them and wants them shown everywhere. They are stats only, linking to wikidot for text. No more non-SRD content is added. |
| Guests (signed-out) in campaigns | Membership, logs and the DM view hang off the Google account. |
| Strict rules builder that blocks choices | The owner wants "guided, then free": warnings only. |
| PHP polling or Server-Sent Events for live play | Chosen: a Node relay. Polling only as the fallback when it's down. |
| Players editing initiative | The DM runs it. |
| DM whole-file writes to player sheets | The DM can edit everything, but only through field-level edits the player's sheet applies (1.5). |
| Login-free Table view link for smart TVs | The Table view is a tab in the DM's signed-in browser on the HDMI screen or screen share. |
| Walls, lighting, measuring tools on the map | Not asked for; v1 is image, grid, tokens and fog. |
| Ongoing D&D Beyond sync | The viewer is retired (5.3). The import stays one-time. |
| Public sign-ups / open to anyone | 2-4 groups of friends. No moderation or abuse tooling. |

---

## Open questions

None. Every area was answered in the interview on 2026-11-02. Two steps need the owner's yes when they come up,
because of CLAUDE.md rather than an open design question:

- The compose change for the live relay (1.2) runs `deploy.sh --compose`, which asks first.
- Retiring the D&D Beyond viewer (5.3) needs each of the 6 players to import their character first.

---

## Size by phase

| Phase | Features | Rough size |
|---|---|---|
| 0 Finish in-flight and storage | 5 | ~5.5 days |
| 1 Live table and campaigns | 8 | ~23.5 days |
| 2 Phone and look | 3 | ~7 days |
| 3 DM tools | 4 | ~8 days |
| 4 Character building | 6 | ~18.5 days |
| 5 Content | 3 | ~8.5 days |
| 6 Polish | 3 | ~6 days |
