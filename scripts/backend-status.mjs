#!/usr/bin/env node
// Read-only drift check between the current commit and a Supabase project.
//
// Vercel ships the frontend on merge; migrations and Edge Functions are
// deployed by hand. This script lists what the current commit has that the
// project does not. It only runs `supabase migration list`,
// `supabase functions list` and `supabase secrets list` (names only), reads the
// project's Auth URL settings from the Management API, and reads the
// repository from git HEAD, so uncommitted files are ignored.
//
// Usage: npm run backend:status [-- --project-ref <ref>] [--check]
//   --project-ref <ref>  inspect this project instead of the linked one
//   --check              exit 1 when a migration on this commit is not applied

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, posix } from "node:path";
import { pathToFileURL } from "node:url";

const KNOWN_PROJECTS = {
  uziwdtkzofptihahfooo: "production",
  brifeyypjauyusmkptkx: "staging",
};

// Secrets the functions read that Supabase does not inject. DEMO_CODE_PEPPER
// and SPARRING_INTEGRITY_SECRET fall back to the service-role key, and the
// WORKSPACE_INVITE_* values serve the hidden Workspace, so they are not listed.
export const EXPECTED_SECRETS = {
  OPENROUTER_API_KEY: "every model request",
  EXA_API_KEY: "web research in case generation and Ask",
  STRIPE_SECRET_KEY: "checkout, billing portal, webhook and account deletion",
  STRIPE_WEBHOOK_SECRET: "stripe-webhook signature check",
  ELEVENLABS_API_KEY: "opponent voice; without it voice rounds use the browser voice",
};

const MIGRATION_FILE = /^(\d+)_.+\.sql$/;
const STATIC_IMPORT = /\b(?:import|export)\b[^;]*?\bfrom\s*["']([^"']+)["']/g;
const BARE_IMPORT = /\bimport\s*["']([^"']+)["']/g;
const DYNAMIC_IMPORT = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;

class UsageError extends Error {}

export function parseArgs(argv) {
  const options = { check: false, projectRef: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--check") {
      options.check = true;
    } else if (arg === "--project-ref") {
      const value = argv[index + 1];
      if (!value || value.startsWith("-")) throw new UsageError("--project-ref needs a value");
      options.projectRef = value;
      index += 1;
    } else if (arg.startsWith("--project-ref=")) {
      options.projectRef = arg.slice("--project-ref=".length);
      if (!options.projectRef) throw new UsageError("--project-ref needs a value");
    } else {
      throw new UsageError(`Unknown argument: ${arg}`);
    }
  }
  if (options.projectRef && !/^[a-z0-9]{20}$/.test(options.projectRef)) {
    throw new UsageError(`Not a Supabase project ref: ${options.projectRef}`);
  }
  return options;
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (result.error) throw new Error(`${command} ${args[0]} failed: ${result.error.message}`);
  return result;
}

function git(root, args) {
  const result = run("git", args, root);
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim()}`);
  return result.stdout;
}

function redact(text) {
  const message = text
    .split("\n")
    .map((line) => {
      try {
        return JSON.parse(line)?.error?.message;
      } catch {
        return undefined;
      }
    })
    .find((value) => typeof value === "string");
  return (message ?? text)
    .split("\n")
    .filter((line) => !/new version of Supabase CLI|recommend updating regularly/i.test(line))
    .join("\n")
    .replace(/(postgres(?:ql)?:\/\/)[^@\s]+@/gi, "$1***@")
    .replace(/(password=)\S+/gi, "$1***")
    .trim();
}

function supabaseJson(root, args) {
  const result = run("supabase", [...args, "--output-format", "json"], root);
  if (result.status !== 0) {
    const detail = redact(result.stderr || result.stdout);
    throw new Error(`supabase ${args.slice(0, 2).join(" ")} failed${detail ? `:\n${detail}` : ""}`);
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error(`supabase ${args.slice(0, 2).join(" ")} did not return JSON`);
  }
}

/** Reads the migrations, functions, and function config committed at HEAD. */
export function readCommit(root) {
  const commit = git(root, ["rev-parse", "--short", "HEAD"]).trim();
  const files = git(root, ["ls-tree", "-r", "--name-only", "HEAD", "--", "supabase"]).split("\n").filter(Boolean);
  const fileSet = new Set(files);
  const show = (path) => git(root, ["show", `HEAD:${path}`]);

  const migrations = files
    .filter((path) => posix.dirname(path) === "supabase/migrations")
    .map((path) => MIGRATION_FILE.exec(posix.basename(path))?.[1])
    .filter(Boolean)
    .sort();

  const functionNames = [...new Set(
    files
      .map((path) => /^supabase\/functions\/([^/_][^/]*)\/index\.ts$/.exec(path)?.[1])
      .filter(Boolean),
  )].sort();

  const functions = functionNames.map((name) => {
    const dependencies = new Set();
    const queue = [`supabase/functions/${name}/index.ts`];
    while (queue.length > 0) {
      const path = queue.pop();
      if (dependencies.has(path) || !fileSet.has(path)) continue;
      dependencies.add(path);
      const source = show(path);
      for (const pattern of [STATIC_IMPORT, BARE_IMPORT, DYNAMIC_IMPORT]) {
        for (const match of source.matchAll(pattern)) {
          const specifier = match[1];
          if (specifier.startsWith("./") || specifier.startsWith("../")) {
            queue.push(posix.normalize(posix.join(posix.dirname(path), specifier)));
          }
        }
      }
    }
    for (const config of ["supabase/functions/deno.json", `supabase/functions/${name}/deno.json`]) {
      if (fileSet.has(config)) dependencies.add(config);
    }
    return { name, dependencies: [...dependencies].sort() };
  });

  const verifyJwt = {};
  if (fileSet.has("supabase/config.toml")) {
    let section = null;
    for (const line of show("supabase/config.toml").split("\n")) {
      const header = /^\s*\[functions\.([^\]]+)\]\s*$/.exec(line);
      if (header) {
        section = header[1].trim().replace(/^"(.*)"$/, "$1");
        continue;
      }
      if (/^\s*\[/.test(line)) {
        section = null;
        continue;
      }
      const setting = /^\s*verify_jwt\s*=\s*(true|false)\b/.exec(line);
      if (section && setting) verifyJwt[section] = setting[1] === "true";
    }
  }

  return { commit, migrations, functions, verifyJwt };
}

/**
 * Finds the last commit on HEAD's first-parent line that touched a function's
 * files. First-parent history dates a merged change by its merge, which is
 * when it reached the branch, not when it was written.
 */
export function lastChange(root, paths) {
  const output = git(root, ["log", "-1", "--first-parent", "--format=%H%x00%ct%x00%s", "HEAD", "--", ...paths]).trim();
  if (!output) return null;
  const [sha, seconds, subject] = output.split("\0");
  return { sha: sha.slice(0, 7), time: Number(seconds) * 1000, subject };
}

/** Deploy time in milliseconds, or NaN when the CLI gave none or an unreadable one. */
function deployTime(updatedAt) {
  return typeof updatedAt === "number" ? updatedAt : Date.parse(updatedAt);
}

export function compareBackend({ local, remoteMigrations, deployedFunctions, changeOf }) {
  const applied = new Set(remoteMigrations);
  const known = new Set(local.migrations);
  const deployed = new Map(deployedFunctions.map((fn) => [fn.slug, fn]));
  const inRepo = new Set(local.functions.map((fn) => fn.name));

  const stale = [];
  const verifyJwt = [];
  const notDeployed = [];
  for (const fn of local.functions) {
    const remote = deployed.get(fn.name);
    if (!remote) {
      notDeployed.push(fn.name);
      continue;
    }
    const change = changeOf(fn);
    // A deploy date we cannot read must not make a changed function look current.
    if (change && !(change.time <= deployTime(remote.updated_at))) stale.push({ name: fn.name, deployed: remote, change });
    const expected = local.verifyJwt[fn.name] ?? true;
    if (typeof remote.verify_jwt === "boolean" && remote.verify_jwt !== expected) {
      verifyJwt.push({ name: fn.name, deployed: remote.verify_jwt, expected });
    }
  }

  return {
    pendingMigrations: local.migrations.filter((version) => !applied.has(version)),
    unknownMigrations: [...applied].filter((version) => !known.has(version)).sort(),
    appliedCount: local.migrations.filter((version) => applied.has(version)).length,
    notDeployed,
    stale,
    verifyJwt,
    notInRepo: [...deployed.keys()].filter((slug) => !inRepo.has(slug)).sort(),
  };
}

function formatTime(milliseconds) {
  return `${new Date(milliseconds).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function deployedDate(updatedAt) {
  const time = deployTime(updatedAt);
  return Number.isFinite(time) ? `deployed ${formatTime(time)}` : "deploy date unknown";
}

export function formatReport({ target, local, result, deployedCount, notes }) {
  const lines = [`Backend status: ${target} compared with commit ${local.commit}`, ""];
  const list = (title, items) => {
    if (items.length === 0) return;
    lines.push(`  ${title}:`);
    for (const item of items) lines.push(`    ${item}`);
  };

  lines.push(`Migrations: ${local.migrations.length} on this commit, ${result.appliedCount} of them applied.`);
  list("Pending (on this commit, not applied)", result.pendingMigrations);
  list("Applied but not on this commit", result.unknownMigrations);

  lines.push("", `Edge Functions: ${local.functions.length} on this commit, ${deployedCount} deployed.`);
  list("Not deployed", result.notDeployed);
  list(
    "Changed on this commit after the last deploy",
    result.stale.map(({ name, deployed, change }) =>
      `${name}: ${deployedDate(deployed.updated_at)} (v${deployed.version}); changed ${formatTime(change.time)} in ${change.sha} ${change.subject}`),
  );
  list(
    "verify_jwt differs from supabase/config.toml",
    result.verifyJwt.map(({ name, deployed, expected }) => `${name}: deployed ${deployed}, config ${expected}`),
  );
  list("Deployed but not on this commit", result.notInRepo);

  const pending = result.pendingMigrations.length + result.notDeployed.length + result.stale.length + result.verifyJwt.length;
  lines.push("", pending === 0 ? "Nothing pending." : `${pending} pending item${pending === 1 ? "" : "s"}.`);
  for (const note of notes) lines.push(`Note: ${note}`);
  return lines.join("\n");
}

export function missingSecrets(names) {
  const present = new Set(names);
  return Object.entries(EXPECTED_SECRETS)
    .filter(([name]) => !present.has(name))
    .map(([name, use]) => `${name}: ${use}`);
}

function secretsReport(root, targetArgs) {
  let names;
  try {
    const output = supabaseJson(root, ["secrets", "list", ...targetArgs]);
    names = (Array.isArray(output) ? output : (output.secrets ?? [])).map((secret) => secret.name);
  } catch (error) {
    return `Secrets: not checked (${error.message.split("\n")[0]}).`;
  }
  const missing = missingSecrets(names);
  if (missing.length === 0) return "Secrets: every expected function secret is set.";
  return ["Secrets: missing expected function secrets (names only):", ...missing.map((line) => `    ${line}`)].join("\n");
}

function accessToken() {
  const fromEnv = process.env.SUPABASE_ACCESS_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  const file = join(homedir(), ".supabase", "access-token");
  return existsSync(file) ? readFileSync(file, "utf8").trim() : null;
}

/** Site URL and redirect allowlist, which magic links and OAuth redirects must match. */
export async function authUrlsReport(ref) {
  if (!/^[a-z0-9]{20}$/.test(ref)) return "Auth URLs: not checked (unknown project ref).";
  const token = accessToken();
  if (!token) return "Auth URLs: not checked (no SUPABASE_ACCESS_TOKEN or ~/.supabase/access-token).";
  try {
    const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return `Auth URLs: not checked (Management API answered ${response.status}).`;
    const config = await response.json();
    const allowList = String(config.uri_allow_list ?? "").split(",").map((entry) => entry.trim()).filter(Boolean);
    return [
      `Auth URLs: site_url ${config.site_url || "(unset)"}`,
      "  Redirect allowlist:",
      ...(allowList.length ? allowList.map((entry) => `    ${entry}`) : ["    (empty)"]),
    ].join("\n");
  } catch (error) {
    return `Auth URLs: not checked (${error.message}).`;
  }
}

export function backendStatus({ root, projectRef }) {
  const local = readCommit(root);
  const targetArgs = projectRef ? ["--project-ref", projectRef] : [];
  const migrationTarget = projectRef ? targetArgs : ["--linked"];

  const migrationOutput = supabaseJson(root, ["migration", "list", ...migrationTarget]);
  const functionOutput = supabaseJson(root, ["functions", "list", ...targetArgs]);
  const remoteMigrations = (migrationOutput.migrations ?? []).map((row) => row.remote).filter(Boolean);
  const deployedFunctions = Array.isArray(functionOutput) ? functionOutput : (functionOutput.functions ?? []);

  const notes = [];
  const shallow = git(root, ["rev-parse", "--is-shallow-repository"]).trim() === "true";
  if (shallow) notes.push("shallow clone, so function change dates were not checked.");
  const changeOf = shallow ? () => null : (fn) => lastChange(root, fn.dependencies);

  const dirty = git(root, ["status", "--porcelain", "--", "supabase/migrations", "supabase/functions", "supabase/config.toml"]).trim();
  if (dirty) notes.push("uncommitted changes under supabase/ are not part of this comparison.");
  notes.push("function change dates come from git. A function deployed from a branch before its merge shows as changed; one deployed from an out-of-date checkout looks current.");

  // Same order the Supabase CLI uses: the flag, then SUPABASE_PROJECT_ID, then the linked ref.
  const linkedRefFile = join(root, "supabase/.temp/project-ref");
  const ref = projectRef
    ?? (process.env.SUPABASE_PROJECT_ID?.trim() || null)
    ?? (existsSync(linkedRefFile) ? readFileSync(linkedRefFile, "utf8").trim() : "linked project");
  const label = KNOWN_PROJECTS[ref];
  const target = label ? `${ref} (${label})` : ref;

  const result = compareBackend({ local, remoteMigrations, deployedFunctions, changeOf });
  const report = formatReport({ target, local, result, deployedCount: deployedFunctions.length, notes });
  return { ref, result, report: `${report}\n\n${secretsReport(root, targetArgs)}` };
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    console.error("Usage: npm run backend:status [-- --project-ref <ref>] [--check]");
    process.exit(2);
  }

  try {
    const root = git(process.cwd(), ["rev-parse", "--show-toplevel"]).trim();
    const { ref, result, report } = backendStatus({ root, projectRef: options.projectRef });
    console.log(report);
    console.log(`\n${await authUrlsReport(ref)}`);
    if (options.check && result.pendingMigrations.length > 0) process.exit(1);
  } catch (error) {
    console.error(error.message);
    if (!options.projectRef && /project ref|supabase link/i.test(error.message)) {
      console.error("This checkout is not linked. Pass --project-ref <ref> or run from the linked checkout.");
    }
    process.exit(2);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
