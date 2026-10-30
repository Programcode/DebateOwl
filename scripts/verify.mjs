#!/usr/bin/env node
// `npm run verify`: the pull-request check (deploy.yml), run locally. Two
// lanes run side by side, each a chain of steps, so the run takes as long as
// the slower lane instead of the sum of every step. Each step writes its
// output to .verify/npm-verify/<step>.log; the terminal shows one line per
// step, a timing summary, and the end of each failed step's log. Every lane
// runs to the end, so one run reports every failure.
//
// The VPS is short on memory. Alone, lint, build and smoke each take about
// 2 GB and Vitest with three workers about 1.8 GB, so the lanes are ordered to
// run at most two of them at once (about 4 GB above idle). A third lane was no
// faster and took 6 GB. NODE_OPTIONS defaults to a 3 GB heap per Node process.
import { execFileSync, spawn } from "node:child_process";
import { createWriteStream, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const LOG_DIR = ".verify/npm-verify";
const TAIL_LINES = 40;

const port = execFileSync("bash", [".superset/e2e-port.sh"], { encoding: "utf8" }).trim();
const smokeEnv = { CI: "1", PORT: port, PLAYWRIGHT_BASE_URL: `http://127.0.0.1:${port}` };

const LANES = [
  [
    { name: "docs", command: "npm run docs:check" },
    { name: "jargon", command: "npm run seo:jargon" },
    { name: "lint", command: "npm run lint" },
    { name: "build", command: "bash .superset/heavy.sh npm run build" },
    { name: "sw-offline", command: "npm run test:sw" },
    { name: "edge", command: "npm run test:edge" },
  ],
  [
    { name: "typecheck", command: "npm run typecheck" },
    { name: "unit", command: "npm test -- --maxWorkers=3" },
    { name: "collaboration", command: "npm run test:collaboration" },
    { name: "smoke", command: "npm run test:e2e:smoke", env: smokeEnv },
  ],
];

const env = { ...process.env, NODE_OPTIONS: process.env.NODE_OPTIONS || "--max-old-space-size=3072" };
const running = new Set();
const results = [];
const seconds = (ms) => `${(ms / 1000).toFixed(1)}s`;

rmSync(LOG_DIR, { recursive: true, force: true });
mkdirSync(LOG_DIR, { recursive: true });

function runStep(step) {
  const log = join(LOG_DIR, `${step.name}.log`);
  const started = Date.now();
  return new Promise((resolve) => {
    const out = createWriteStream(log);
    // Its own process group, so an interrupt stops the step's whole tree.
    const child = spawn("bash", ["-c", step.command], {
      detached: true,
      env: { ...env, ...step.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    running.add(child);
    child.stdout.pipe(out, { end: false });
    child.stderr.pipe(out, { end: false });
    child.on("close", (code) => {
      running.delete(child);
      out.end();
      const result = { ...step, log, ok: code === 0, ms: Date.now() - started };
      results.push(result);
      console.log(`${result.ok ? "ok  " : "FAIL"} ${step.name.padEnd(14)} ${seconds(result.ms).padStart(7)}`);
      resolve();
    });
  });
}

async function runLane(steps) {
  for (const step of steps) await runStep(step);
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    for (const child of running) {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        // Already gone.
      }
    }
    process.exit(130);
  });
}

const started = Date.now();
console.log(`verify: ${LANES.flat().length} steps in ${LANES.length} lanes, logs in ${LOG_DIR}/`);
await Promise.all(LANES.map(runLane));

const failed = results.filter((result) => !result.ok);
for (const result of failed) {
  const lines = readFileSync(result.log, "utf8").trimEnd().split("\n");
  console.log(`\n--- ${result.name} failed: last ${Math.min(TAIL_LINES, lines.length)} lines of ${result.log}`);
  console.log(lines.slice(-TAIL_LINES).join("\n"));
}
const slowest = [...results].sort((a, b) => b.ms - a.ms).slice(0, 3).map((r) => `${r.name} ${seconds(r.ms)}`);
console.log(`\nverify: ${failed.length ? `${failed.length} failed (${failed.map((r) => r.name).join(", ")})` : "all passed"} in ${seconds(Date.now() - started)}. Slowest: ${slowest.join(", ")}.`);
process.exit(failed.length ? 1 : 0);
