#!/usr/bin/env bash
# A private, Docker-free local Supabase project for one agent or worktree.
#
# Uses the Supabase CLI's experimental stack engine (CLI 2.121 or newer) with
# the native runtime, so several agents can each run migrations, pgTAP, and
# real RLS queries at once without sharing ports, containers, or the
# ~/.superset/debatelab-db.lock that ./.superset/db-gate.sh holds.
#
# The stack cannot serve auth email templates from `content_path`, so the
# project it starts is an overlay directory: symlinks to this checkout's
# migrations, functions, tests, and templates, plus a copy of config.toml
# without the magic-link template block. Edits in the checkout are live;
# run `reset` to re-apply migrations after changing them.
#
# usage: scripts/agent-stack.sh [--name NAME] start|env|reset|test|advisors|psql|stop|destroy
#
#   start     start (or resume) the stack; writes connection values to <dir>/stack.env
#   env       print the path of stack.env and the non-secret URLs
#   reset     re-apply every migration to a fresh database
#   test      run pgTAP and the concurrency scripts (what `npm run test:db` runs)
#   advisors  run the Supabase security advisors against the stack
#   psql      open psql (or run `psql -c ...` with extra args) as postgres
#   stop      stop the stack, keeping its data
#   destroy   stop the stack and delete its data
#
# NAME defaults to the checkout's directory name. Never point this at a
# hosted project: every command here targets the local stack's DB_URL.
set -euo pipefail

name=""
if [ "${1:-}" = "--name" ]; then
  name="${2:?--name needs a value}"
  shift 2
fi
cmd="${1:-}"
shift || true

root="$(git rev-parse --show-toplevel)"
name="${name:-$(basename "$root")}"
case "$name" in
  *[!A-Za-z0-9._-]*|"") echo "invalid stack name: $name" >&2; exit 2 ;;
esac
dir="${DEBATELAB_STACK_HOME:-$HOME/.cache/debatelab-stacks}/$name"
export SUPABASE_EXPERIMENTAL_STACK=1

prepare_overlay() {
  mkdir -p "$dir/supabase"
  local part
  for part in migrations functions tests templates; do
    ln -sfn "$root/supabase/$part" "$dir/supabase/$part"
  done
  awk '/^\[/ { skip = ($0 == "[auth.email.template.magic_link]") } !skip' \
    "$root/supabase/config.toml" > "$dir/supabase/config.toml"
}

sb() {
  (cd "$dir" && supabase --workdir "$dir" "$@")
}

db_url() {
  [ -f "$dir/stack.env" ] || { echo "stack $name is not started; run: $0 start" >&2; exit 1; }
  sed -n 's/^DB_URL=//p' "$dir/stack.env"
}

case "$cmd" in
  start)
    prepare_overlay
    sb start --runtime native --output-format json > "$dir/stack.json"
    jq -r '.env | to_entries[] | "\(.key)=\(.value)"' "$dir/stack.json" > "$dir/stack.env"
    chmod 600 "$dir/stack.env"
    "$0" --name "$name" env
    ;;
  env)
    echo "stack: $name"
    echo "env file: $dir/stack.env"
    grep -E '^(API_URL|DB_URL|REST_URL|FUNCTIONS_URL)=' "$dir/stack.env"
    ;;
  reset)
    prepare_overlay
    sb db reset
    ;;
  test)
    sb test db "$@"
    for script in test-daily-quota test-workspace-invite-concurrency test-workspace-mutation-concurrency; do
      SUPABASE_DB_URL="$(db_url)" bash "$root/scripts/$script.sh"
    done
    ;;
  advisors)
    sb db advisors --db-url "$(db_url)" --type security --level info "$@"
    ;;
  psql)
    psql "$(db_url)" -v ON_ERROR_STOP=1 "$@"
    ;;
  stop)
    sb stop
    ;;
  destroy)
    sb stack destroy --yes
    rm -rf "$dir"
    ;;
  *)
    sed -n '2,27p' "$0" >&2
    exit 2
    ;;
esac
