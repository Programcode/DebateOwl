import { spawnSync } from "node:child_process";
import { chmod, mkdtemp, mkdir, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, expect, it } from "vitest";

const temporaryRoots: string[] = [];

async function executable(path: string, content: string): Promise<void> {
  await writeFile(path, content);
  await chmod(path, 0o755);
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

it("reclaims stale lock paths without taking fresh or live locks", async () => {
  const root = await mkdtemp(join(tmpdir(), "debatelab-lock-"));
  temporaryRoots.push(root);
  const stale = join(root, "stale");
  const plain = join(root, "plain");
  const fresh = join(root, "fresh");
  const live = join(root, "live");
  const dead = join(root, "dead");
  for (const path of [stale, fresh, live, dead]) await mkdir(path);
  const old = new Date(Date.now() - 180_000);
  await utimes(stale, old, old);
  await writeFile(plain, "");
  await writeFile(join(live, "pid"), String(process.pid));
  const result = spawnSync("bash", ["-c", `
    set -euo pipefail
    source "$1"
    # Reap a real child, so its pid is known to be dead.
    true & dead_pid=$!; wait "$dead_pid"
    echo "$dead_pid" > "$2/dead/pid"
    for name in stale plain dead; do
      lock_acquire "$2/$name" 0
      [ "$(cat "$2/$name/pid")" = "$$" ]
      lock_release "$2/$name"
    done
    ! lock_acquire "$2/fresh" 0
    ! lock_acquire "$2/live" 0
  `, "lock-test", resolve(".superset/lib/lock.sh"), root], { encoding: "utf8" });
  expect(result.status, result.stderr).toBe(0);
});

it("uses slot 2 when slot 1 is held, and respects the single-slot cap", async () => {
  const root = await mkdtemp(join(tmpdir(), "debatelab-slots-"));
  temporaryRoots.push(root);
  const lock = join(root, ".superset/debatelab-db.lock");
  await mkdir(lock, { recursive: true });
  await writeFile(join(lock, "pid"), String(process.pid));
  const result = spawnSync("bash", ["-c", `
    set -euo pipefail
    source "$1/lock.sh"
    source "$1/slot.sh"
    DEBATELAB_STACK_SLOTS=2 stack_slot_acquire 0
    [ "$DEBATELAB_STACK_SLOT" = 2 ]
    [ "$SUPABASE_DB_URL" = postgresql://postgres:postgres@127.0.0.1:54422/postgres ]
    [ "$FAKE_PROVIDER" = debatelab-fake-openrouter-s2 ]
    [ "$APP_ORIGIN" = http://127.0.0.1:18181 ]
    lock_release "$DB_LOCK"
    ! DEBATELAB_STACK_SLOTS=1 stack_slot_acquire 0
    ! DEBATELAB_STACK_SLOTS=3 stack_slot_acquire 0
  `, "slot-test", resolve(".superset/lib")], { encoding: "utf8", env: { ...process.env, HOME: root } });
  expect(result.status, result.stderr).toBe(0);
});

it("stops local Supabase when database tests fail", async () => {
  const root = await mkdtemp(join(tmpdir(), "debatelab-db-gate-"));
  temporaryRoots.push(root);
  const bin = join(root, "bin");
  const log = join(root, "calls.log");
  await mkdir(bin);
  // The gate's cleanup can remove the shared fake-provider container. A real
  // docker here would kill a gate running in any other worktree, so log it instead.
  await executable(
    join(bin, "docker"),
    '#!/usr/bin/env bash\nprintf "docker %s\\n" "$*" >> "$CALL_LOG"\n',
  );
  await executable(
    join(bin, "supabase"),
    '#!/usr/bin/env bash\nprintf "supabase %s\\n" "$*" >> "$CALL_LOG"\n',
  );
  await executable(
    join(bin, "npm"),
    '#!/usr/bin/env bash\nprintf "npm %s\\n" "$*" >> "$CALL_LOG"\nexit 17\n',
  );

  const result = spawnSync("bash", [resolve(".superset/db-gate.sh")], {
    encoding: "utf8",
    env: {
      ...process.env,
      CALL_LOG: log,
      DEBATELAB_SUPABASE_BIN_DIR: bin,
      HOME: root,
      PATH: `${bin}:${process.env.PATH ?? ""}`,
      TMPDIR: root,
      WORKSPACE_GATE_ARTIFACT_ROOT: "",
    },
  });

  expect(result.status).toBe(17);
  await expect(readFile(log, "utf8")).resolves.toBe(
    "supabase start\nnpm run test:db\nsupabase stop --no-backup\n",
  );
});
