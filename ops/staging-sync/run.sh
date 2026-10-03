#!/usr/bin/env bash
# Runs on Adam's VPS from debatelab-staging-sync.timer. Keeps a dedicated clone
# of main and syncs staging whenever main moves, plus an hourly drift check.
# Never runs npm install: the sync scripts have no dependencies, so merged code
# only reaches the Supabase CLI as files to upload, never as packages to run.
set -euo pipefail

BASE="${DEBATELAB_STAGING_SYNC_HOME:-$HOME/ops/debatelab-staging-sync}"
REPO="$BASE/repo"
STATE="$BASE/state"
mkdir -p "$STATE"

exec 9>"$BASE/lock"
flock -n 9 || { echo "Another sync is running."; exit 0; }

if [ ! -d "$REPO/.git" ]; then
  git clone --quiet https://github.com/Programcode/DebateLab.git "$REPO"
fi
git -C "$REPO" fetch --quiet origin main
sha="$(git -C "$REPO" rev-parse origin/main)"

# Skip when this commit already synced within the hour, or failed within the hour.
for marker in ok failed; do
  if [ "$(cat "$STATE/last-$marker" 2>/dev/null)" = "$sha" ] && [ -n "$(find "$STATE/last-$marker" -mmin -60)" ]; then
    exit 0
  fi
done

# Don't change the backend under a browser run that is testing an older
# commit; sync once it finishes (the job times out after 30 minutes). A run
# for this commit is waiting for this sync, so it doesn't count.
testing="$(gh run list --repo Programcode/DebateLab --workflow staging-e2e.yml --limit 20 --json status,headSha \
  --jq "[.[] | select(.status != \"completed\" and .headSha != \"$sha\")] | length")" || testing=0
if [ "$testing" != "0" ]; then
  echo "Protected staging E2E is testing an older commit; syncing $sha after it finishes."
  exit 0
fi

git -C "$REPO" checkout --quiet --force --detach "$sha"
git -C "$REPO" clean -fdq

if [ ! -f "$REPO/scripts/staging-sync.mjs" ]; then
  echo "main ($sha) has no scripts/staging-sync.mjs yet; nothing to do."
  exit 0
fi

seed=()
[ "$(cat "$STATE/last-ok" 2>/dev/null)" = "$sha" ] || seed=(--seed)

if node "$REPO/scripts/staging-sync.mjs" --root "$REPO" --report "${seed[@]}"; then
  echo "$sha" > "$STATE/last-ok"
  rm -f "$STATE/last-failed"
else
  status=$?
  echo "$sha" > "$STATE/last-failed"
  exit "$status"
fi
