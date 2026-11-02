#!/usr/bin/env bash
# Every Portainer action for this site. The stack "dnd" on the Docker server (192.168.16.3) runs two services from
# compose.yml: dnd = dnd.craftyplayz.com (port 5762) and dnd-test = dndtest.craftyplayz.com (port 5763).
#   bash _dev/deploy.sh test             point dnd-test at this commit's image (built by .github/workflows/image.yml)
#   bash _dev/deploy.sh live             point dnd at the image dnd-test runs now
#   bash _dev/deploy.sh test --compose   also send a changed compose.yml (that can recreate the live service too)
#   bash _dev/deploy.sh import [dir]     copy the server-only data in dir (default: this checkout) into the live volumes,
#                                        then the transcripts and D&D Beyond cache from live into the test volumes
#   bash _dev/deploy.sh logs test|live   the service's last 40 log lines (peer address, visitor address, request)
# Needs PORTAINER_URL and PORTAINER_API_KEY in the environment. The key is never printed or put on a command line.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
: "${PORTAINER_URL:?Set PORTAINER_URL}" "${PORTAINER_API_KEY:?Set PORTAINER_API_KEY}"
ENDPOINT=2 STACK=dnd IMAGE=craftyplayz/dnd HOST=192.168.16.3
# .env: LIVE_CONFIG_DIR / TEST_CONFIG_DIR, the host folders with each site's config.php and .htpasswd (see .env.example)
[ -f .env ] && . ./.env
LIVE_CONFIG_DIR=${LIVE_CONFIG_DIR:-/opt/dnd/live} TEST_CONFIG_DIR=${TEST_CONFIG_DIR:-/opt/dnd/test}
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
( umask 077; printf 'header = "X-API-Key: %s"\n' "$PORTAINER_API_KEY" > "$tmp/auth" )

fail() { echo "$*" >&2; exit 1; }
api() { curl -sS --fail-with-body -K "$tmp/auth" "$@"; }
js() { node -e "const j=JSON.parse(require('fs').readFileSync(0,'utf8'));$1"; }
P="$PORTAINER_URL/api"
D="$P/endpoints/$ENDPOINT/docker"

stack_id() { api "$P/stacks" | js "const s=j.find((s)=>s.Name==='$STACK'&&s.EndpointId===$ENDPOINT);process.stdout.write(s?String(s.Id):'')"; }
stack_env() { api "$P/stacks/$1" | js "for(const e of j.Env||[])console.log(e.name+'='+e.value)"; }
envval() { sed -n "s/^$1=//p" "$tmp/env"; }
# the container running a compose service: "<id> <image> <state>"
container() {
  api -G "$D/containers/json" --data-urlencode "all=1" \
    --data-urlencode "filters={\"label\":[\"com.docker.compose.project=$STACK\",\"com.docker.compose.service=$1\"]}" |
    js "const c=j[0];process.stdout.write(c?c.Id+' '+c.Image+' '+c.State:'')"
}
# PUT/POST body: {StackFileContent, Env, ...} from the compose text in $1 and KEY=value pairs after it
body() {
  local file=$1; shift
  node -e "const fs=require('fs');const [f,...kv]=process.argv.slice(1);
    process.stdout.write(JSON.stringify({Name:'$STACK',StackFileContent:fs.readFileSync(f,'utf8'),Prune:false,PullImage:true,
      Env:kv.map((p)=>({name:p.slice(0,p.indexOf('=')),value:p.slice(p.indexOf('=')+1)}))}))" "$file" "$@" > "$tmp/body.json"
}

# the image for a commit, once GitHub Actions has pushed it (anonymous pull, so the package must be public)
wait_image() {
  local tag=$1 code token
  for i in $(seq 60); do
    token=$(curl -sS "https://ghcr.io/token?scope=repository:$IMAGE:pull" | js "process.stdout.write(j.token||'')")
    code=$(curl -sS -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $token" \
      -H 'Accept: application/vnd.oci.image.index.v1+json,application/vnd.docker.distribution.manifest.list.v2+json,application/vnd.docker.distribution.manifest.v2+json' \
      "https://ghcr.io/v2/$IMAGE/manifests/$tag")
    [ "$code" = 200 ] && return 0
    [ "$i" = 1 ] && echo "Waiting for ghcr.io/$IMAGE:$tag (GitHub Actions builds it after the push)..."
    sleep 10
  done
  fail "No image ghcr.io/$IMAGE:$tag after 10 minutes. Check the Actions run, and that the package is public."
}

# after a deploy: the service runs the tag and answers on its port
check() {
  local service=$1 port=$2 tag=$3 c code
  for i in $(seq 30); do
    c=$(container "$service")
    [ "${c#* }" = "ghcr.io/$IMAGE:$tag running" ] && break
    sleep 2
  done
  [ "${c#* }" = "ghcr.io/$IMAGE:$tag running" ] || fail "$service isn't running ghcr.io/$IMAGE:$tag (it shows: ${c#* })."
  for i in $(seq 15); do
    code=$(curl -s -m 5 -o /dev/null -w '%{http_code}' "http://$HOST:$port/" || true)
    [ "$code" = 200 ] && { echo "$service runs $tag and answers on http://$HOST:$port/"; return 0; }
    sleep 2
  done
  echo "$service runs $tag, but http://$HOST:$port/ gave '$code' from here (is this PC on the LAN?)."
}

case "${1:-}" in
test)
  [ "$(git branch --show-current)" = main ] || fail "Switch to main first."
  [ -z "$(git status --porcelain)" ] || fail "Commit your changes first."
  git fetch -q origin main
  [ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] || fail "Push main first: the image is built from what's on GitHub."
  tag=$(git rev-parse HEAD)
  wait_image "$tag"
  git show HEAD:compose.yml > "$tmp/compose.yml"
  id=$(stack_id)
  if [ -z "$id" ]; then
    # first deploy: the live service starts on the same image, as there is nothing older for it to run
    body "$tmp/compose.yml" "LIVE_TAG=$tag" "TEST_TAG=$tag" "LIVE_CONFIG_DIR=$LIVE_CONFIG_DIR" "TEST_CONFIG_DIR=$TEST_CONFIG_DIR"
    api -X POST -H 'Content-Type: application/json' --data-binary @"$tmp/body.json" "$P/stacks/create/standalone/string?endpointId=$ENDPOINT" > /dev/null
    echo "Created stack $STACK."
  else
    stack_env "$id" > "$tmp/env"
    api "$P/stacks/$id/file" | js "process.stdout.write(j.StackFileContent)" > "$tmp/deployed.yml"
    if ! cmp -s "$tmp/compose.yml" "$tmp/deployed.yml"; then
      [ "${2:-}" = --compose ] || fail "compose.yml differs from the deployed stack, and sending it can recreate the live service too. Check the change, then run: bash _dev/deploy.sh test --compose"
    else
      cp "$tmp/deployed.yml" "$tmp/compose.yml"
    fi
    # only TEST_TAG and the test config folder change, so compose leaves the live service alone
    body "$tmp/compose.yml" "LIVE_TAG=$(envval LIVE_TAG)" "TEST_TAG=$tag" "LIVE_CONFIG_DIR=$(envval LIVE_CONFIG_DIR)" "TEST_CONFIG_DIR=$TEST_CONFIG_DIR"
    api -X PUT -H 'Content-Type: application/json' --data-binary @"$tmp/body.json" "$P/stacks/$id?endpointId=$ENDPOINT" > /dev/null
  fi
  check dnd-test 5763 "$tag"
  ;;
live)
  id=$(stack_id); [ -n "$id" ] || fail "No stack yet: run bash _dev/deploy.sh test first."
  stack_env "$id" > "$tmp/env"
  tag=$(envval TEST_TAG)
  [ "$tag" != "$(envval LIVE_TAG)" ] || { echo "Live already runs ${tag:0:7}, the test image."; check dnd 5762 "$tag"; exit 0; }
  # the deployed compose file as it is: a live deploy only moves LIVE_TAG (and the live config folder)
  api "$P/stacks/$id/file" | js "process.stdout.write(j.StackFileContent)" > "$tmp/deployed.yml"
  body "$tmp/deployed.yml" "LIVE_TAG=$tag" "TEST_TAG=$tag" "LIVE_CONFIG_DIR=$LIVE_CONFIG_DIR" "TEST_CONFIG_DIR=$(envval TEST_CONFIG_DIR)"
  api -X PUT -H 'Content-Type: application/json' --data-binary @"$tmp/body.json" "$P/stacks/$id?endpointId=$ENDPOINT" > /dev/null
  check dnd 5762 "$tag"
  ;;
import)
  # straight to Portainer on the LAN: the recordings are over Cloudflare's 100 MB request limit
  # shortcut: -k skips the certificate check of Portainer's self-signed LAN certificate; fine on the home LAN only
  P="https://$HOST:9443/api" D="$P/endpoints/$ENDPOINT/docker"
  api() { curl -sS -k --fail-with-body -K "$tmp/auth" "$@"; }
  dir=${2:-.}
  live=$(container dnd); test=$(container dnd-test)
  [ -n "$live" ] && [ -n "$test" ] || fail "Deploy the stack first."
  live=${live%% *} test=${test%% *}
  for p in private/dnd/backups private/dnd/monster-backups private/dnd/accounts transcripts/data characters/cache; do
    [ -d "$dir/$p" ] || continue
    # www-data (33) owns the data in the container; each folder goes up on its own to keep the requests smaller
    tar -C "$dir" --owner=33 --group=33 -cf "$tmp/up.tar" "$p"
    echo "live <- $p ($(du -h "$tmp/up.tar" | cut -f1))"
    api -X PUT -H 'Content-Type: application/x-tar' --data-binary @"$tmp/up.tar" "$D/containers/$live/archive?path=/var/www/html" > /dev/null
  done
  for p in transcripts/data characters/cache; do
    echo "test <- live $p"
    api "$D/containers/$live/archive?path=/var/www/html/$p" > "$tmp/copy.tar"
    api -X PUT -H 'Content-Type: application/x-tar' --data-binary @"$tmp/copy.tar" "$D/containers/$test/archive?path=/var/www/html/${p%/*}" > /dev/null
  done
  echo "Imported."
  ;;
logs)
  service=dnd; [ "${2:-}" = test ] && service=dnd-test
  c=$(container "$service"); [ -n "$c" ] || fail "No $service container."
  # the log stream has an 8-byte header per line; strip it
  api "$D/containers/${c%% *}/logs?stdout=1&stderr=1&tail=40" | node -e "const b=require('fs').readFileSync(0);let o='';for(let i=0;i+8<=b.length;){const n=b.readUInt32BE(i+4);o+=b.slice(i+8,i+8+n);i+=8+n}process.stdout.write(o)"
  ;;
*)
  fail "Usage: bash _dev/deploy.sh test|live|import [dir]|logs test|live"
  ;;
esac
