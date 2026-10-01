import { spawnSync } from "node:child_process";
import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";

const SCRIPT = resolve("scripts/backend-status.mjs");
const STAGING_REF = "brifeyypjauyusmkptkx";
const temporaryRoots: string[] = [];
let root: string;

async function write(path: string, content: string): Promise<void> {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), content);
}

function commit(message: string, seconds: number): void {
  const env = { ...process.env, GIT_AUTHOR_DATE: `@${seconds} +0000`, GIT_COMMITTER_DATE: `@${seconds} +0000` };
  for (const args of [["add", "-A"], ["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-q", "-m", message]]) {
    const result = spawnSync("git", args, { cwd: root, env, encoding: "utf8" });
    if (result.status !== 0) throw new Error(result.stderr);
  }
}

function runStatus(args: string[], extraEnv: Record<string, string> = {}) {
  const { SUPABASE_PROJECT_ID: _ignored, ...env } = process.env;
  return spawnSync("node", [SCRIPT, ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...env, CALL_LOG: join(root, "calls.log"), PATH: `${join(root, "bin")}:${process.env.PATH ?? ""}`, ...extraEnv },
  });
}

async function fakeFunctionsList(functions: unknown[]): Promise<void> {
  const migrations = { migrations: [{ local: "20260101000000", remote: "20260101000000", time: "" }] };
  await writeFile(
    join(root, "bin/supabase"),
    [
      "#!/usr/bin/env bash",
      'printf "%s\\n" "$*" >> "$CALL_LOG"',
      `if [ "$1 $2" = "migration list" ]; then echo '${JSON.stringify(migrations)}'; exit 0; fi`,
      `if [ "$1 $2" = "functions list" ]; then echo '${JSON.stringify({ functions })}'; exit 0; fi`,
      "exit 99",
      "",
    ].join("\n"),
  );
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "debatelab-backend-status-"));
  temporaryRoots.push(root);
  spawnSync("git", ["init", "-q"], { cwd: root });

  await write("supabase/migrations/20260101000000_first.sql", "select 1;\n");
  await write("supabase/migrations/20260102000000_second.sql", "select 2;\n");
  await write("supabase/functions/_shared/util.ts", "export const value = 1;\n");
  await write("supabase/functions/_shared/unused.ts", "export const unused = 1;\n");
  await write("supabase/functions/alpha/index.ts", 'import { value } from "../_shared/util.ts";\nconsole.log(value);\n');
  await write("supabase/functions/alpha/index.test.ts", 'import "../_shared/unused.ts";\n');
  await write("supabase/functions/beta/index.ts", "console.log('beta');\n");
  await write("supabase/functions/gamma/index.ts", "console.log('gamma');\n");
  await write("supabase/config.toml", "[functions.alpha]\nverify_jwt = false\n\n[functions.beta]\nverify_jwt = true\n");
  commit("initial", 1_000);
  await write("supabase/functions/_shared/util.ts", "export const value = 2;\n");
  commit("change shared helper", 2_000);
  await write("supabase/functions/gamma/index.ts", "console.log('gamma 2');\n");
  await write("supabase/functions/_shared/unused.ts", "export const unused = 2;\n");
  commit("change gamma", 3_000);

  const migrations = {
    migrations: [
      { local: "20260101000000", remote: "20260101000000", time: "" },
      { local: "20260102000000", remote: "", time: "" },
      { local: "", remote: "20251231000000", time: "" },
    ],
  };
  const functions = {
    functions: [
      { slug: "alpha", version: 4, updated_at: 1_500_000, verify_jwt: false },
      { slug: "beta", version: 2, updated_at: 1_500_000, verify_jwt: false },
      { slug: "retired", version: 1, updated_at: 500_000, verify_jwt: true },
    ],
  };
  await mkdir(join(root, "bin"));
  await writeFile(
    join(root, "bin/supabase"),
    [
      "#!/usr/bin/env bash",
      'printf "%s\\n" "$*" >> "$CALL_LOG"',
      'echo "A new version of Supabase CLI is available" >&2',
      `if [ "$1 $2" = "migration list" ]; then echo '${JSON.stringify(migrations)}'; exit 0; fi`,
      `if [ "$1 $2" = "functions list" ]; then echo '${JSON.stringify(functions)}'; exit 0; fi`,
      "exit 99",
      "",
    ].join("\n"),
  );
  await chmod(join(root, "bin/supabase"), 0o755);
});

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

it("reports what the current commit has that the project lacks", async () => {
  const result = runStatus([]);

  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
  const out = result.stdout;
  expect(out).toContain("Migrations: 2 on this commit, 1 of them applied.");
  expect(out).toMatch(/Pending \(on this commit, not applied\):\n {4}20260102000000\n/);
  expect(out).toMatch(/Applied but not on this commit:\n {4}20251231000000\n/);
  expect(out).toMatch(/Not deployed:\n {4}gamma\n/);
  expect(out).toMatch(/Changed on this commit after the last deploy:\n {4}alpha: deployed 1970-01-01 00:25 UTC \(v4\); changed 1970-01-01 00:33 UTC in [0-9a-f]{7} change shared helper\n {2}verify/);
  expect(out).toMatch(/verify_jwt differs from supabase\/config.toml:\n {4}beta: deployed false, config true\n/);
  expect(out).toMatch(/Deployed but not on this commit:\n {4}retired\n/);
  expect(out).toContain("4 pending items.");
});

it("uses only read-only list commands and targets the linked project by default", async () => {
  runStatus([]);

  const calls = (await readFile(join(root, "calls.log"), "utf8")).trim().split("\n");
  expect(calls).toEqual(["migration list --linked --output-format json", "functions list --output-format json"]);
});

it("passes --project-ref to both commands and names known projects", async () => {
  const result = runStatus(["--project-ref", STAGING_REF]);

  expect(result.stdout).toContain(`Backend status: ${STAGING_REF} (staging) compared with commit`);
  const calls = (await readFile(join(root, "calls.log"), "utf8")).trim().split("\n");
  expect(calls).toEqual([
    `migration list --project-ref ${STAGING_REF} --output-format json`,
    `functions list --project-ref ${STAGING_REF} --output-format json`,
  ]);
});

it("names the project chosen by SUPABASE_PROJECT_ID, which the CLI prefers over the linked ref", async () => {
  await write("supabase/.temp/project-ref", "uziwdtkzofptihahfooo\n");

  const result = runStatus([], { SUPABASE_PROJECT_ID: STAGING_REF });

  expect(result.stdout).toContain(`Backend status: ${STAGING_REF} (staging) compared with commit`);
});

it("counts a function whose deploy date is missing or unreadable as changed", async () => {
  await fakeFunctionsList([
    { slug: "alpha", version: 4, verify_jwt: false },
    { slug: "beta", version: 2, updated_at: "not a date", verify_jwt: true },
    { slug: "gamma", version: 3, updated_at: 9_000_000, verify_jwt: true },
  ]);

  const result = runStatus([]);

  expect(result.status).toBe(0);
  expect(result.stdout).toMatch(/Changed on this commit after the last deploy:\n {4}alpha: deploy date unknown \(v4\); changed 1970-01-01 00:33 UTC in [0-9a-f]{7} change shared helper\n {4}beta: deploy date unknown \(v2\); changed 1970-01-01 00:16 UTC in [0-9a-f]{7} initial\n/);
  expect(result.stdout).not.toMatch(/ {4}gamma:/);
  expect(result.stdout).toContain("3 pending items.");
});

it("fails --check only when a migration on this commit is not applied", async () => {
  expect(runStatus(["--check"]).status).toBe(1);

  await rm(join(root, "supabase/migrations/20260102000000_second.sql"));
  commit("drop pending migration", 4_000);
  const result = runStatus(["--check"]);
  expect(result.status).toBe(0);
  expect(result.stdout).toContain("Migrations: 1 on this commit, 1 of them applied.");
});

it("rejects bad arguments and surfaces CLI failures without a report", async () => {
  expect(runStatus(["--project-ref"]).status).toBe(2);
  expect(runStatus(["--project-ref", "not a ref"]).status).toBe(2);
  expect(runStatus(["--write"]).status).toBe(2);

  await writeFile(
    join(root, "bin/supabase"),
    '#!/usr/bin/env bash\necho \'{"_tag":"Error","error":{"message":"failed to connect to postgresql://cli_login:hunter2@db.example:5432/postgres"}}\' >&2\nexit 1\n',
  );
  const result = runStatus([]);
  expect(result.status).toBe(2);
  expect(result.stdout).toBe("");
  expect(result.stderr).toContain("supabase migration list failed:\nfailed to connect to postgresql://***@db.example");
  expect(result.stderr).not.toContain("hunter2");
});
