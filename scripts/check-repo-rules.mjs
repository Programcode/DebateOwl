#!/usr/bin/env node
// Repository rules that ESLint cannot see: workflow hardening, pgTAP privilege
// checks, and lock-safety of new migrations. Runs as part of `npm run lint`.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LineCounter, parseDocument } from "yaml";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const problems = [];
const report = (file, line, message) => problems.push(`${file}:${line}: ${message}`);

// Migrations up to and including this one predate the squawk check and are
// already applied. Newer migrations must pass it.
const MIGRATION_BASELINE = "20261001100000_account_deletion_and_export.sql";

// Squawk rules that do not fit Supabase migrations: each file runs once inside
// a transaction, and column types follow the existing schema.
const SQUAWK_EXCLUDED_RULES = [
  "prefer-robust-stmts",
  "require-statement-timeout",
  "require-lock-timeout",
  "prefer-bigint-over-int",
  "prefer-bigint-over-smallint",
  "prefer-identity",
  "prefer-text-field",
  "prefer-timestamptz",
];

function listFiles(dir, extensions) {
  return readdirSync(path.join(root, dir))
    .filter((name) => extensions.some((extension) => name.endsWith(extension)))
    .sort()
    .map((name) => path.join(dir, name));
}

const lineOf = (source, index) => source.slice(0, index).split("\n").length;

function checkWorkflows() {
  for (const file of listFiles(".github/workflows", [".yml", ".yaml"])) {
    const lineCounter = new LineCounter();
    const doc = parseDocument(readFileSync(path.join(root, file), "utf8"), { lineCounter });
    const workflow = doc.toJS();
    const lineAt = (keys) => {
      const node = doc.getIn(keys, true);
      return node?.range ? lineCounter.linePos(node.range[0]).line : 1;
    };
    if (!workflow || typeof workflow !== "object" || !("permissions" in workflow)) {
      report(file, 1, "set a top-level `permissions:` block");
    }
    const checkPinned = (action, keys) => {
      if (action.startsWith("./") || action.startsWith("docker://")) return;
      if (!/@[0-9a-f]{40}$/.test(action)) report(file, lineAt(keys), `pin ${action} to a full commit SHA`);
    };
    for (const [jobName, job] of Object.entries(workflow?.jobs ?? {})) {
      if (typeof job?.uses === "string") checkPinned(job.uses, ["jobs", jobName, "uses"]);
      (job?.steps ?? []).forEach((step, index) => {
        if (typeof step?.uses !== "string") return;
        const keys = ["jobs", jobName, "steps", index, "uses"];
        checkPinned(step.uses, keys);
        const persist = step.with?.["persist-credentials"];
        if (step.uses.startsWith("actions/checkout@") && persist !== false && persist !== "false") {
          report(file, lineAt(keys), "set `with.persist-credentials: false` on actions/checkout");
        }
      });
    }
  }
}

// The text between a call and whatever wraps it: whitespace, comments and
// opening parentheses do not change whether the call is negated.
function isNegated(before) {
  let text = before.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
  for (;;) {
    const trimmed = text.replace(/[\s(]+$/, "");
    if (trimmed === text) break;
    text = trimmed;
  }
  return /\bNOT$/i.test(text);
}

// Arguments of the call whose opening parenthesis is at `open`, up to its
// matching close, skipping parentheses inside string literals.
function callArguments(source, open) {
  let depth = 0;
  let quoted = false;
  for (let index = open; index < source.length; index += 1) {
    const char = source[index];
    if (char === "'") quoted = !quoted;
    else if (!quoted && char === "(") depth += 1;
    else if (!quoted && char === ")" && --depth === 0) return source.slice(open + 1, index);
  }
  return source.slice(open + 1);
}

function checkPgTapPrivileges() {
  // has_table_privilege(role, table, 'SELECT,INSERT') is true when ANY listed
  // privilege is held, so a list cannot prove that a role has all of them.
  // Under NOT, a list correctly means "none of them".
  const call = /\bhas_[a-z_]+_privilege\s*\(/gi;
  for (const file of listFiles("supabase/tests", [".sql"])) {
    const source = readFileSync(path.join(root, file), "utf8");
    for (const match of source.matchAll(call)) {
      const literals = [...callArguments(source, match.index + match[0].length - 1).matchAll(/'((?:[^']|'')*)'/g)];
      const privilege = literals.at(-1)?.[1] ?? "";
      if (privilege.includes(",") && !isNegated(source.slice(0, match.index))) {
        report(file, lineOf(source, match.index), "check one privilege per has_*_privilege call; a list means \"any of\"");
      }
    }
  }
}

function checkNewMigrations() {
  const fresh = listFiles("supabase/migrations", [".sql"]).filter(
    (file) => path.basename(file) > MIGRATION_BASELINE,
  );
  if (fresh.length === 0) return;
  try {
    execFileSync(
      path.join(root, "node_modules/.bin/squawk"),
      [
        "--reporter=gcc",
        "--pg-version=17.0",
        "--assume-in-transaction",
        `--exclude=${SQUAWK_EXCLUDED_RULES.join(",")}`,
        ...fresh,
      ],
      { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch (error) {
    const output = `${error.stdout ?? ""}${error.stderr ?? ""}`.replace(/\x1b\[[0-9;]*m/g, "").trim();
    problems.push(
      output || String(error),
      "Fix the lock or compatibility problem, or add `-- squawk-ignore <rule>` above the statement with the reason.",
    );
  }
}

checkWorkflows();
checkPgTapPrivileges();
checkNewMigrations();

if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}
