#!/usr/bin/env bash
# Installs or updates the staging sync timer on Adam's VPS. Rerun after
# changing run.sh or the unit files. The sync scripts themselves come from main.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
base="$HOME/ops/debatelab-staging-sync"
units="$HOME/.config/systemd/user"
mkdir -p "$base" "$units"
install -m 755 "$here/run.sh" "$base/run.sh"
install -m 644 "$here/debatelab-staging-sync.service" "$here/debatelab-staging-sync.timer" "$units/"
systemctl --user daemon-reload
systemctl --user enable --now debatelab-staging-sync.timer
systemctl --user list-timers debatelab-staging-sync.timer --no-pager
