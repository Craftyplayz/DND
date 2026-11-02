#!/usr/bin/env bash
# Upload changed files to dnd.craftyplayz.com over SSH (key: ~/.ssh/ionos).
# Usage: bash _dev/deploy.sh [--dry-run]
# Uploads every file in HEAD whose committed contents differ from the server, and removes
# files deleted in git since the last deploy. Untracked server files (private/.htpasswd, sheet
# backups, session recordings, the D&D Beyond cache) are never touched, and the server-only
# data folders below are filtered out of both lists as a second guard.
set -euo pipefail
HOST=u112162320@access961561004.webspace-data.io
DIR=   # the subdomain's web-root folder, relative to the SFTP home, e.g. dnd.craftyplayz.com
STAMP=.dnd-craftyplayz-deployed   # last deployed commit, in the SFTP home (outside the web root)
SSH=(ssh -i ~/.ssh/ionos -o BatchMode=yes "$HOST")
cd "$(git rev-parse --show-toplevel)"

[ -n "$DIR" ] || { echo "Set DIR in _dev/deploy.sh to the web-root folder first."; exit 1; }
[ "$(git branch --show-current)" = main ] || { echo "Switch to main first."; exit 1; }
[ -z "$(git status --porcelain)" ] || { echo "Commit or stash your changes first."; exit 1; }
dry=; [ "${1:-}" = --dry-run ] && dry=1
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT

# never upload or delete: dev files, and the folders the live site writes to itself
SKIP='(_dev/|README\.md$|\.gitignore$|private/dnd/backups/|private/dnd/monster-backups/|private/transcripts/transcripts/|private/transcripts/[^/]*\.ogg$|transcripts/data/[^.]|characters/cache/[^.])'

# compare git blob hashes, not files on disk: the PC checks out CRLF, the server has the committed LF
# shortcut: paths with quotes, backslashes or newlines come out quoted and get skipped; use -z if one appears
git -c core.quotepath=false ls-tree -r --format='%(objecttype)%x09%(objectname)%x09%(path)' HEAD |
  awk -F'\t' '$1=="blob"{print $2"\t"$3}' | grep -Pv "\t$SKIP" | sort > "$tmp/local"
cut -f2 "$tmp/local" | "${SSH[@]}" "cd $DIR"' && while IFS= read -r f; do [ -f "$f" ] && printf "%s\n" "$f"; done > ~/.deploy-list
  git hash-object --no-filters --stdin-paths < ~/.deploy-list | paste - ~/.deploy-list; rm -f ~/.deploy-list' | sort > "$tmp/remote"
comm -23 "$tmp/local" "$tmp/remote" | cut -f2 > "$tmp/upload"

last=$("${SSH[@]}" "cat $STAMP 2>/dev/null" || true)
if [ -n "$last" ] && git cat-file -e "$last^{commit}" 2>/dev/null; then
  git -c core.quotepath=false diff --no-renames --name-only --diff-filter=D "$last" HEAD | grep -Ev "^$SKIP" > "$tmp/delete" || true
else
  echo "No deploy record on the server yet: files deleted in git won't be removed this time."
  : > "$tmp/delete"
fi

echo "Upload: $(wc -l < "$tmp/upload") files"; sed 's/^/  + /' "$tmp/upload"
echo "Delete: $(wc -l < "$tmp/delete") files"; sed 's/^/  - /' "$tmp/delete"
[ -z "$dry" ] || { echo "(dry run, nothing changed)"; exit 0; }

if [ -s "$tmp/upload" ]; then
  while IFS= read -r f; do
    mkdir -p "$tmp/files/$(dirname "$f")"; git cat-file blob "HEAD:$f" > "$tmp/files/$f"
  done < "$tmp/upload"
  tr '\n' '\0' < "$tmp/upload" | tar -C "$tmp/files" -cf - --null -T - | "${SSH[@]}" "mkdir -p $DIR && cd $DIR && tar -xf -"
fi
[ -s "$tmp/delete" ] && tr '\n' '\0' < "$tmp/delete" | "${SSH[@]}" "cd $DIR && xargs -0 rm -f --"
git rev-parse HEAD | "${SSH[@]}" "cat > $STAMP"
echo "Deployed $(git rev-parse --short HEAD)."
