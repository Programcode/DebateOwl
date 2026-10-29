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
  git clone --quiet https://github.com/Programcode/DebateOwl.git "$REPO"
fi
git -C "$REPO" fetch --quiet origin main
sha="$(git -C "$REPO" rev-parse origin/main)"

# Skip when this commit already synced within the hour, or failed within the hour.
for marker in ok failed; do
  if [ "$(cat "$STATE/last-$marker" 2>/dev/null)" = "$sha" ] && [ -n "$(find "$STATE/last-$marker" -mmin -60)" ]; then
    exit 0
  fi
done

# Don't change the backend while a browser job is testing it. Only a running
# browser job counts: a queued run, or one still waiting in its gate for this
# very sync, isn't using staging yet, and an older run's gate skips once main
# moves on. The browser job times out after 30 minutes.
fail_query() {
  echo "Could not ask GitHub whether staging E2E is running; not syncing blind." >&2
  exit 1
}
busy=0
runs="$(gh run list --repo Programcode/DebateOwl --workflow staging-e2e.yml --status in_progress --limit 100 \
  --json databaseId --jq '.[].databaseId')" || fail_query
for id in $runs; do
  testing="$(gh run view "$id" --repo Programcode/DebateOwl --json jobs \
    --jq '[.jobs[] | select(.name == "staging-e2e" and .status == "in_progress")] | length')" || fail_query
  [ "$testing" = "0" ] || busy=1
done
if [ "$busy" != "0" ]; then
  echo "Protected staging E2E is testing; syncing $sha after it finishes."
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
  # 3: a browser job started while syncing; nothing changed, retry next tick.
  [ "$status" -eq 3 ] && exit 0
  echo "$sha" > "$STATE/last-failed"
  exit "$status"
fi
