# Puts the repo-pinned Supabase CLI (the exact `supabase` devDependency in
# package.json) first on PATH. Every worktree then runs one CLI version, so
# Docker keeps one Supabase image set instead of one per CLI version.
# Tests point DEBATELAB_SUPABASE_BIN_DIR at a stub directory instead.
#
# usage: use_pinned_supabase_cli <repo root>
use_pinned_supabase_cli() {
  local bin="${DEBATELAB_SUPABASE_BIN_DIR:-$1/node_modules/.bin}"
  if [ ! -x "$bin/supabase" ]; then
    echo "The repo-pinned Supabase CLI is missing ($bin/supabase). Run npm ci first." >&2
    return 1
  fi
  export PATH="$bin:$PATH"
}
