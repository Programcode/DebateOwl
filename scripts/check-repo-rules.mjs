#!/usr/bin/env node
// Repository rules that ESLint cannot see: workflow hardening, pgTAP privilege
// checks, and lock-safety of new migrations. Runs as part of `npm run lint`.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

function listFiles(dir, extension) {
  return readdirSync(path.join(root, dir))
    .filter((name) => name.endsWith(extension))
    .sort()
    .map((name) => path.join(dir, name));
}

function checkWorkflows() {
  for (const file of listFiles(".github/workflows", ".yml")) {
    const lines = readFileSync(path.join(root, file), "utf8").split("\n");
    if (!lines.some((line) => line.startsWith("permissions:"))) {
      report(file, 1, "set a top-level `permissions:` block");
    }
    lines.forEach((line, index) => {
      const match = line.match(/^(\s*)(?:-\s+)?uses:\s*([^\s#]+)/);
      if (!match) return;
      const [, indent, action] = match;
      if (action.startsWith("./") || action.startsWith("docker://")) return;
      if (!/@[0-9a-f]{40}$/.test(action)) {
        report(file, index + 1, `pin ${action} to a full commit SHA`);
      }
      if (action.startsWith("actions/checkout@")) {
        // The step's keys sit at least as deep as `uses:`; stop at the next step.
        const step = [];
        for (const next of lines.slice(index + 1)) {
          const depth = next.match(/^\s*/)[0].length;
          if (next.trim() && (depth < indent.length || /^\s*-\s/.test(next))) break;
          step.push(next);
        }
        if (!step.some((next) => /^\s*persist-credentials:\s*false\b/.test(next))) {
          report(file, index + 1, "set `persist-credentials: false` on actions/checkout");
        }
      }
    });
  }
}

function checkPgTapPrivileges() {
  // has_table_privilege(role, table, 'SELECT,INSERT') is true when ANY listed
  // privilege is held, so a list cannot prove that a role has all of them.
  // Under NOT, a list correctly means "none of them".
  const listed = /(?<!\bNOT\s+)has_(?:table|column|function|schema|sequence)_privilege\s*\([^)]*'[A-Za-z ]+,[A-Za-z ,]*'\s*\)/gi;
  for (const file of listFiles("supabase/tests", ".sql")) {
    const source = readFileSync(path.join(root, file), "utf8");
    for (const match of source.matchAll(listed)) {
      const line = source.slice(0, match.index).split("\n").length;
      report(file, line, "check one privilege per has_*_privilege call; a list means \"any of\"");
    }
  }
}

function checkNewMigrations() {
  const fresh = listFiles("supabase/migrations", ".sql").filter(
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
