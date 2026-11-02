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
   headless-Chrome checks locally (`php -S 127.0.0.1:8110 -t .`, open http://localhost:8110).
2. Commit (small commits), push to main, run `bash _dev/deploy.sh test`, then check https://dndtest.craftyplayz.com
   loads with no console errors.
3. Ask the user with AskUserQuestion: "<feature> is on dndtest.craftyplayz.com. Push it to the live site?"
   Options: "Push to live" / "Not yet".
4. Only on "Push to live": run `bash _dev/deploy.sh live` and check https://dnd.craftyplayz.com.

The live site only ever gets the image that is on test (`deploy.sh live` copies TEST_TAG to LIVE_TAG).
`bash _dev/deploy.sh test` and `bash _dev/deploy.sh live` run without asking; anything else on the server
(`--compose`, `import`, `logs`, other API calls, deleting volumes) asks the user first.

## Rules

- Never commit, delete or overwrite server-only data: private/dnd/backups, private/dnd/monster-backups,
  private/dnd/accounts, private/sessions, transcripts/data, characters/cache, includes/config.php, .htpasswd, .env.
- Changes to the player sheet land on /sheets/player-dev/ first (localStorage key hb-sheet-dev); /sheets/player/
  keeps the key hb-sheet so friends' characters still load.
- Never print or commit PORTAINER_API_KEY.
