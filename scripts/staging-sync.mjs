#!/usr/bin/env node
// Brings the staging Supabase project up to the committed tree: applies
// pending migrations and deploys new or changed Edge Functions, then checks
// that nothing is left. Staging only: the project ref is fixed below and every
// Supabase CLI call passes it explicitly, so a linked checkout or a
// SUPABASE_PROJECT_ID pointing elsewhere cannot redirect it.
//
// The VPS timer in ops/staging-sync/ runs this on every new commit on main.
// See docs/staging.md.
//
// Usage: node scripts/staging-sync.mjs [--root <checkout>] [--dry-run] [--report] [--seed]
//   --root     checkout to read (default: the git top level of the cwd)
//   --dry-run  show what would change; change nothing
//   --report   set the `staging-sync` commit status on GitHub and open or close
//              the drift issue. The staging browser suite waits for that status.
//   --seed     run scripts/staging/seed.mjs after a successful sync
//
// Exit codes: 0 in sync, 1 drift remains or a step failed, 2 refused or misused,
// 3 deferred because a staging browser job is running (try again later).

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { join, relative } from "node:path";
import { backendStatus } from "./backend-status.mjs";

export const STAGING_REF = "brifeyypjauyusmkptkx";
export const PRODUCTION_REF = "uziwdtkzofptihahfooo";
export const GITHUB_REPO = "Programcode/DebateLab";
const STATUS_CONTEXT = "staging-sync";
const DRIFT_ISSUE_TITLE = "Staging is out of sync with main";

/** Collaborative Workspace is hidden and production doesn't run it, so staging doesn't either. */
export const SKIPPED_FUNCTIONS = new Set(["workspace-invites"]);

class RefusedError extends Error {}
class DeferredError extends Error {}

export function parseArgs(argv) {
  const options = { root: null, dryRun: false, report: false, seed: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--report") options.report = true;
    else if (arg === "--seed") options.seed = true;
    else if (arg === "--root" && argv[index + 1]) options.root = argv[++index];
    else throw new RefusedError(`Unknown argument: ${arg}`);
  }
  return options;
}

function run(command, args, { cwd, input } = {}) {
  const result = spawnSync(command, args, { cwd, input, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (result.error) throw new Error(`${command} ${args[0]} failed: ${result.error.message}`);
  return result;
}

function quiet(text) {
  return (text ?? "")
    .split("\n")
    .filter((line) => !/new version of Supabase CLI|recommend updating regularly|^\s*$/i.test(line))
    .join("\n")
    .replace(/(postgres(?:ql)?:\/\/)[^@\s]+@/gi, "$1***@")
    .trim();
}

/**
 * `--agent no` keeps the CLI's output the same under an agent (where it
 * detects one and switches to JSON) and under the systemd timer (where it
 * doesn't), so what an agent tests is what the timer runs.
 */
function supabase(root, args) {
  const result = run("supabase", [...args, "--agent", "no", "--project-ref", STAGING_REF], { cwd: root });
  const output = quiet(`${result.stdout}\n${result.stderr}`);
  if (result.status !== 0) throw new Error(`supabase ${args.slice(0, 2).join(" ")} failed:\n${output}`);
  return output;
}

/**
 * Refuses to run unless the CLI can see the staging project by its ref. The
 * check is keyed on the ref, which never changes, not on the display name,
 * which anyone can rename in the dashboard (staging went from
 * "debate-trainer-staging" to "DebateOwl Staging"). Every CLI call passes
 * STAGING_REF explicitly, so production is never the target.
 */
export function assertStagingTarget(projects, env = process.env) {
  const override = env.SUPABASE_PROJECT_ID?.trim();
  if (override && override !== STAGING_REF) {
    throw new RefusedError(`SUPABASE_PROJECT_ID is ${override}; this script only targets staging (${STAGING_REF}).`);
  }
  if (STAGING_REF === PRODUCTION_REF) throw new RefusedError("Staging and production refs are the same.");
  const staging = projects.find((project) => (project.ref ?? project.id) === STAGING_REF);
  if (!staging) throw new RefusedError(`The Supabase account cannot see ${STAGING_REF}.`);
  return staging;
}

/** What the sync has to do, from a backend-status result. */
export function planSync(result) {
  const deploy = new Set([
    ...result.notDeployed,
    ...result.stale.map((item) => item.name),
    ...result.verifyJwt.map((item) => item.name),
  ]);
  for (const name of SKIPPED_FUNCTIONS) deploy.delete(name);
  return {
    divergent: result.unknownMigrations,
    migrations: result.pendingMigrations,
    functions: [...deploy].sort(),
    undeclared: result.notInRepo.filter((name) => !SKIPPED_FUNCTIONS.has(name)),
  };
}

/** Edge Functions in the checkout: folders under supabase/functions with an index.ts. */
function repoFunctions(root) {
  const base = join(root, "supabase/functions");
  return readdirSync(base, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_") && existsSync(join(base, entry.name, "index.ts")))
    .map((entry) => entry.name)
    .filter((name) => !SKIPPED_FUNCTIONS.has(name));
}

function filesUnder(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? filesUnder(join(dir, entry.name)) : [join(dir, entry.name)]);
}

/** The source files staging runs for one function, keyed by path under supabase/functions. */
function downloadDeployed(root, name) {
  const dir = mkdtempSync(join(tmpdir(), "staging-fn-"));
  try {
    // The CLI writes supabase/.temp into its cwd, so download into a scratch dir.
    supabase(dir, ["functions", "download", name, "--use-api"]);
    const base = join(dir, "supabase/functions");
    return new Map(filesUnder(base).map((file) => [relative(base, file), readFileSync(file)]));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Functions whose deployed source differs from the commit. Deploy dates only
 * say when something was deployed, not what, so an older checkout deployed
 * after a merge would otherwise pass as current.
 */
export function contentDrift(root, names, download = (name) => downloadDeployed(root, name)) {
  const base = join(root, "supabase/functions");
  return names.filter((name) => {
    const deployed = download(name);
    if (deployed.size === 0 || ![...deployed.keys()].includes(`${name}/index.ts`)) return true;
    return [...deployed].some(([path, bytes]) => {
      const local = join(base, path);
      return !existsSync(local) || !readFileSync(local).equals(bytes);
    });
  });
}

/** planSync plus a content check of every deployed function the date check passed. */
function planWithContent(root, result, log) {
  const plan = planSync(result);
  const pending = new Set([...plan.functions, ...result.notDeployed]);
  const drifted = contentDrift(root, repoFunctions(root).filter((name) => !pending.has(name)));
  if (drifted.length > 0) log(`Deployed source differs from this commit: ${drifted.join(", ")}`);
  return { ...plan, functions: [...new Set([...plan.functions, ...drifted])].sort() };
}

/**
 * A function deployed on staging but gone from the commit stays callable. The
 * sync never deletes functions, so it reports them as drift until someone
 * removes them by hand (`supabase functions delete <name> --project-ref ...`).
 */
export function assertNoUndeclared(plan) {
  if (plan.undeclared.length > 0) {
    throw new Error(`Deployed on staging but not in this commit: ${plan.undeclared.join(", ")}. Delete them by hand; see docs/staging.md.`);
  }
}

function lastJsonLine(text) {
  for (const line of text.split("\n").reverse()) {
    try {
      return JSON.parse(line);
    } catch {
      // keep looking
    }
  }
  return null;
}

function sameList(a, b) {
  return a.length === b.length && [...a].sort().every((value, index) => value === [...b].sort()[index]);
}

export function sync({ root, dryRun, log = console.log, beforeChange = () => {} }) {
  const before = backendStatus({ root, projectRef: STAGING_REF });
  log(before.report, "");
  const plan = planWithContent(root, before.result, log);

  if (plan.divergent.length > 0) {
    throw new Error(`Staging has migrations this commit lacks (${plan.divergent.join(", ")}). Not pushing over divergent history; fix it by hand.`);
  }
  if (plan.migrations.length === 0 && plan.functions.length === 0) {
    assertNoUndeclared(plan);
    log("Staging already matches this commit.");
    return { plan, applied: [], deployed: [] };
  }

  if (!dryRun) beforeChange();
  const applied = [];
  if (plan.migrations.length > 0) {
    const dry = supabase(root, ["db", "push", "--dry-run", "--output-format", "json"]);
    const wouldPush = (lastJsonLine(dry)?.migrations ?? []).map((file) => file.split("_")[0]);
    if (!sameList(wouldPush, plan.migrations)) {
      throw new Error(`db push would apply [${wouldPush.join(", ")}] but the pending list is [${plan.migrations.join(", ")}]. Stopping.`);
    }
    if (dryRun) log(`Would apply migrations: ${plan.migrations.join(", ")}`);
    else {
      log(`Applying migrations: ${plan.migrations.join(", ")}`);
      supabase(root, ["db", "push", "--yes"]);
      applied.push(...plan.migrations);
    }
  }

  const deployed = [];
  for (const name of plan.functions) {
    if (dryRun) {
      log(`Would deploy ${name}`);
      continue;
    }
    log(`Deploying ${name}`);
    supabase(root, ["functions", "deploy", name, "--use-api"]);
    deployed.push(name);
  }
  if (dryRun) return { plan, applied, deployed };

  const after = backendStatus({ root, projectRef: STAGING_REF });
  const left = planWithContent(root, after.result, log);
  if (left.migrations.length > 0 || left.functions.length > 0 || left.divergent.length > 0) {
    log(after.report);
    throw new Error(`Still pending after sync: ${[...left.migrations, ...left.functions].join(", ")}`);
  }
  assertNoUndeclared(left);
  log(`Staging matches ${after.report.split("\n")[0].split(" ").pop()}.`);
  return { plan, applied, deployed };
}

// --- GitHub reporting -------------------------------------------------------

function gh(args, input) {
  const result = run("gh", args, { input });
  if (result.status !== 0) throw new Error(`gh ${args.slice(0, 2).join(" ")} failed: ${result.stderr.trim()}`);
  return result.stdout;
}

function setStatus(sha, state, description) {
  gh([
    "api", `repos/${GITHUB_REPO}/statuses/${sha}`,
    "-f", `state=${state}`,
    "-f", `context=${STATUS_CONTEXT}`,
    "-f", `description=${description.slice(0, 139)}`,
  ]);
}

function currentStatus(sha) {
  const statuses = JSON.parse(gh(["api", `repos/${GITHUB_REPO}/commits/${sha}/statuses`]));
  return statuses.find((status) => status.context === STATUS_CONTEXT) ?? null;
}

function browserJobRunning() {
  const runs = JSON.parse(gh(["run", "list", "--repo", GITHUB_REPO, "--workflow", "staging-e2e.yml", "--status", "in_progress", "--limit", "100", "--json", "databaseId"]));
  return runs.some(({ databaseId }) => JSON.parse(gh(["run", "view", String(databaseId), "--repo", GITHUB_REPO, "--json", "jobs"]))
    .jobs.some((job) => job.name === "staging-e2e" && job.status === "in_progress"));
}

/**
 * Marks the commit pending before staging changes, so browser jobs that start
 * from now on refuse to test (they need success), then checks once more that
 * none started since run.sh looked. If one did, it changes nothing.
 */
export function claimStaging(sha) {
  const previous = currentStatus(sha);
  setStatus(sha, "pending", "Syncing staging; browser tests wait for this.");
  if (browserJobRunning()) {
    if (previous) setStatus(sha, previous.state, previous.description ?? "");
    throw new DeferredError("A staging browser job started; syncing on a later run.");
  }
}

function openDriftIssue() {
  // Not --search: the search index lags, and a retry would open a duplicate.
  const found = JSON.parse(gh([
    "issue", "list", "--repo", GITHUB_REPO, "--state", "open", "--limit", "200", "--json", "number,title",
  ]));
  return found.find((issue) => issue.title === DRIFT_ISSUE_TITLE)?.number ?? null;
}

export function report({ sha, ok, summary, detail }) {
  setStatus(sha, ok ? "success" : "failure", summary);
  const issue = openDriftIssue();
  if (ok) {
    if (issue) gh(["issue", "close", String(issue), "--repo", GITHUB_REPO, "--comment", `Staging synced at ${sha}. ${summary}`]);
    return;
  }
  const body = `Staging sync failed at ${sha}.\n\n${summary}\n\n\`\`\`\n${detail.slice(-6000)}\n\`\`\`\n\nLogs: \`journalctl --user -u debatelab-staging-sync\` on the VPS. See docs/staging.md.`;
  if (!issue) {
    gh(["issue", "create", "--repo", GITHUB_REPO, "--title", DRIFT_ISSUE_TITLE, "--body-file", "-"], body);
    return;
  }
  // One comment per failing commit, not one per retry.
  const seen = gh(["issue", "view", String(issue), "--repo", GITHUB_REPO, "--json", "body,comments", "--jq", ".body, .comments[].body"]);
  if (!seen.includes(sha)) gh(["issue", "comment", String(issue), "--repo", GITHUB_REPO, "--body-file", "-"], body);
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
  const root = options.root
    ?? run("git", ["rev-parse", "--show-toplevel"]).stdout.trim();
  const sha = run("git", ["rev-parse", "HEAD"], { cwd: root }).stdout.trim();

  try {
    const listed = run("supabase", ["projects", "list", "--output-format", "json"], { cwd: root });
    if (listed.status !== 0) throw new RefusedError(`supabase projects list failed: ${quiet(listed.stderr)}`);
    const parsed = JSON.parse(listed.stdout);
    assertStagingTarget(Array.isArray(parsed) ? parsed : parsed.projects ?? []);
    const dirty = run("git", ["status", "--porcelain", "--", "supabase"], { cwd: root }).stdout.trim();
    if (dirty) throw new RefusedError("Uncommitted changes under supabase/. Sync only from a clean commit.");
  } catch (error) {
    console.error(`Refused: ${error.message}`);
    if (options.report && !options.dryRun) {
      try {
        report({ sha, ok: false, summary: `Refused: ${error.message.split("\n")[0]}`, detail: error.message });
      } catch (reportError) {
        console.error(`Reporting failed too: ${reportError.message}`);
      }
    }
    process.exit(2);
  }

  const lines = [];
  const log = (...parts) => {
    const text = parts.join("\n");
    lines.push(text);
    console.log(text);
  };
  try {
    const beforeChange = options.report ? () => claimStaging(sha) : undefined;
    const { applied, deployed } = sync({ root, dryRun: options.dryRun, log, beforeChange });
    if (options.seed && !options.dryRun) {
      const seeded = run("node", [join(root, "scripts/staging/seed.mjs")], { cwd: root });
      log(quiet(seeded.stdout), quiet(seeded.stderr));
      if (seeded.status !== 0) throw new Error("Seeding staging failed.");
    }
    const summary = applied.length + deployed.length === 0
      ? `In sync with ${sha.slice(0, 7)}.`
      : `Applied ${applied.length} migration(s), deployed ${deployed.length} function(s) at ${sha.slice(0, 7)}.`;
    if (options.report && !options.dryRun) report({ sha, ok: true, summary, detail: lines.join("\n") });
  } catch (error) {
    console.error(error.message);
    if (error instanceof DeferredError) process.exit(3);
    if (options.report && !options.dryRun) {
      try {
        report({ sha, ok: false, summary: error.message.split("\n")[0], detail: `${lines.join("\n")}\n${error.message}` });
      } catch (reportError) {
        console.error(`Reporting failed too: ${reportError.message}`);
      }
    }
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
