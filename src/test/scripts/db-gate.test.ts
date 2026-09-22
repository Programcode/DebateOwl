import { spawnSync } from "node:child_process";
import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
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

it("stops local Supabase when database tests fail", async () => {
  const root = await mkdtemp(join(tmpdir(), "debatelab-db-gate-"));
  temporaryRoots.push(root);
  const bin = join(root, "bin");
  const log = join(root, "calls.log");
  await mkdir(bin);
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
      HOME: root,
      PATH: `${bin}:${process.env.PATH ?? ""}`,
    },
  });

  expect(result.status).toBe(17);
  await expect(readFile(log, "utf8")).resolves.toBe(
    "supabase start\nnpm run test:db\nsupabase stop --no-backup\n",
  );
});
