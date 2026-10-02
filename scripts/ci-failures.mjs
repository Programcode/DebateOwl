#!/usr/bin/env node
// Shows why a pull request's CI failed: the failing jobs and steps, the
// Playwright or Vitest summary from each failed job's log, and the test info,
// error and visible dialogs from every error-context.md in the run's failure
// artifact. Works while a run is still in progress, as soon as a job fails.
//
// Usage:
//   npm run ci:failures              # PR for the current branch
//   npm run ci:failures -- 94        # PR number
//   npm run ci:failures -- 37009268147   # workflow run ID
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join, relative } from "node:path";

const DOWNLOAD_ROOT = ".ci-failures";
// A job that hit its timeout-minutes ends as timed_out, not failure.
const FAILED_CONCLUSIONS = new Set(["failure", "timed_out"]);
const SNAPSHOT_MARKERS = /\b(dialog|alertdialog|alert|heading)\b/;

function gh(args, options = {}) {
  return execFileSync("gh", args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, ...options });
}

function ghJson(args, options) {
  return JSON.parse(gh(args, options));
}

function runsForArgument(argument) {
  // Run IDs are 11 digits; PR numbers are small.
  if (argument && /^\d{9,}$/.test(argument)) {
    return [ghJson(["run", "view", argument, "--json", "databaseId,name,status,conclusion,url"])];
  }
  let pr;
  try {
    pr = ghJson(["pr", "view", ...(argument ? [argument] : []), "--json", "number,headRefOid,url"], { stdio: ["ignore", "pipe", "pipe"] });
  } catch {
    console.error(argument ? `No pull request or run ${argument}.` : "No pull request for this branch. Pass a PR number or run ID.");
    process.exit(1);
  }
  console.log(`PR #${pr.number} at ${pr.headRefOid.slice(0, 7)}: ${pr.url}`);
  return ghJson([
    "run", "list", "--commit", pr.headRefOid, "--limit", "50",
    "--json", "databaseId,name,status,conclusion,url",
  ]);
}

function cleanLog(text) {
  return text
    .split("\n")
    .map((line) => line.replace(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z ?/, "").replace(/\u001b\[[0-9;]*m/g, "").trimEnd());
}

// The Playwright summary: "N failed", "N flaky" and their indented test lines.
function playwrightSummary(lines) {
  const start = lines.findIndex((line) => /^\s+\d+ (failed|flaky|interrupted)$/.test(line));
  if (start === -1) return [];
  const summary = [];
  for (const line of lines.slice(start)) {
    if (/^\s+\d+ (passed|did not run)/.test(line) || line.startsWith("##[") || !/^\s+\S/.test(line)) break;
    if (/^\s+\d+ skipped$/.test(line)) continue;
    summary.push(line.replace(/\s*─+$/, ""));
  }
  return summary;
}

function vitestFailures(lines) {
  return [...new Set(lines.filter((line) => /^\s*(FAIL|×)\s/.test(line) || /^\s*Test Files\s.*failed/.test(line)))];
}

function failedJobSummary(jobId) {
  let lines;
  try {
    lines = cleanLog(gh(["api", "--allow-escape-sequences", `repos/{owner}/{repo}/actions/jobs/${jobId}/logs`]));
  } catch {
    return ["(job log not available yet)"];
  }
  const playwright = playwrightSummary(lines);
  if (playwright.length) return playwright;
  const vitest = vitestFailures(lines);
  if (vitest.length) return vitest.slice(0, 40);
  // Anything else (lint, typecheck, a shell step): the lines before the exit.
  const exit = lines.findIndex((line) => line.startsWith("##[error]Process completed with exit code"));
  const end = exit === -1 ? lines.length : exit;
  return lines.slice(Math.max(0, end - 25), end + 1).filter((line) => !line.startsWith("##[group]") && line !== "##[endgroup]");
}

function findFiles(dir, name, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) findFiles(path, name, found);
    else if (entry.name === name) found.push(path);
  }
  return found;
}

function section(markdown, heading) {
  const match = markdown.match(new RegExp(`^# ${heading}\\n([\\s\\S]*?)(?=^# |$(?![\\s\\S]))`, "m"));
  return match ? match[1].trim() : "";
}

// One entry per test and project; retries share a directory name plus -retryN.
function latestAttempts(files) {
  const byTest = new Map();
  for (const file of files) {
    const dir = file.split("/").at(-2);
    const retry = Number(dir.match(/-retry(\d+)$/)?.[1] ?? 0);
    const key = dir.replace(/-retry\d+$/, "");
    const entry = byTest.get(key) ?? { file, retry: -1, attempts: 0 };
    byTest.set(key, {
      file: retry > entry.retry ? file : entry.file,
      retry: Math.max(retry, entry.retry),
      attempts: entry.attempts + 1,
    });
  }
  return [...byTest.values()];
}

function codeBlocks(markdown) {
  return [...markdown.matchAll(/```(\w*)\n([\s\S]*?)```/g)].map(([, language, body]) => ({ language, body: body.trim() }));
}

function printErrorContext(file, attempts) {
  const markdown = readFileSync(file, "utf8");
  const info = section(markdown, "Test info").split("\n").filter(Boolean);
  console.log(`\n  ${info.map((line) => line.replace(/^- /, "")).join("\n  ")}`);
  if (attempts > 1) console.log(`  Attempts with an error context: ${attempts}`);
  // Error details hold the error, the call log and sometimes an ARIA snapshot.
  const blocks = codeBlocks(section(markdown, "Error details"));
  const errors = blocks.filter((block) => block.language !== "yaml").map((block) => block.body);
  console.log(`  Error:\n    ${errors.join("\n\n").split("\n").slice(0, 30).join("\n    ")}`);
  const snapshots = [...blocks, ...codeBlocks(section(markdown, "Page snapshot"))].filter((block) => block.language === "yaml");
  const visible = [...new Set(snapshots.flatMap((block) => block.body.split("\n")).filter((line) => SNAPSHOT_MARKERS.test(line)).map((line) => line.trim()))];
  if (visible.length) {
    console.log("  Dialogs and headings on the page when it failed:");
    for (const line of visible.slice(0, 15)) console.log(`    ${line}`);
  }
  console.log(`  Full context: ${relative(process.cwd(), file)}`);
}

function downloadFailureArtifacts(run) {
  const { artifacts } = ghJson(["api", `repos/{owner}/{repo}/actions/runs/${run.databaseId}/artifacts`]);
  const failures = artifacts.filter((artifact) => artifact.name.includes("failure"));
  if (!failures.length) {
    console.log("  No failure artifact on this run. Staging runs upload none on purpose.");
    return;
  }
  for (const artifact of failures) {
    if (artifact.expired) {
      console.log(`  Artifact ${artifact.name} has expired.`);
      continue;
    }
    const dir = join(DOWNLOAD_ROOT, String(run.databaseId), artifact.name);
    if (existsSync(dir)) rmSync(dir, { recursive: true });
    mkdirSync(dir, { recursive: true });
    gh(["run", "download", String(run.databaseId), "-n", artifact.name, "-D", dir]);
    console.log(`\n  Artifact ${artifact.name} saved to ${dir}`);
    const contexts = latestAttempts(findFiles(dir, "error-context.md"));
    if (!contexts.length) console.log("  It has no error-context.md; check its logs and test-results.");
    for (const { file, attempts } of contexts) printErrorContext(file, attempts);
  }
}

const runs = runsForArgument(process.argv[2]);
const failed = [];
for (const run of runs) {
  const { jobs } = ghJson(["run", "view", String(run.databaseId), "--json", "jobs"]);
  const failedJobs = jobs.filter((job) => FAILED_CONCLUSIONS.has(job.conclusion));
  if (failedJobs.length) failed.push({ run, failedJobs });
}

const pending = runs.filter((run) => run.status !== "completed").map((run) => run.name);
if (!failed.length) {
  console.log(pending.length ? `No failed jobs yet. Still running: ${pending.join(", ")}.` : "No failed jobs.");
  process.exit(0);
}

for (const { run, failedJobs } of failed) {
  console.log(`\n=== ${run.name} (${run.status === "completed" ? run.conclusion : run.status}): ${run.url}`);
  for (const job of failedJobs) {
    const steps = job.steps.filter((step) => FAILED_CONCLUSIONS.has(step.conclusion) || step.conclusion === "cancelled").map((step) => step.name);
    console.log(`\n- Job ${job.name} ${job.conclusion === "timed_out" ? "timed out" : "failed"} at: ${steps.join(", ") || "(no failed step reported)"}`);
    for (const line of failedJobSummary(job.databaseId)) console.log(`  ${line}`);
  }
  // Artifacts upload at the end of a job, so they exist once the job has failed.
  downloadFailureArtifacts(run);
}
if (pending.length) console.log(`\nStill running: ${pending.join(", ")}.`);
