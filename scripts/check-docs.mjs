import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

// These paths are generated, vendored, or plan history.
// Everything else is checked by default so new maintained docs cannot opt out silently.
const EXCLUDED_PREFIXES = [
  ".git/",
  "node_modules/",
  "dist/",
  "coverage/",
  "test-results/",
  "playwright-report/",
  ".verify/",
  "plans/",
];

const PLAN_INDEX = "plans/README.md";
const PLAN_STATUS = /^\*\*Status:\*\*[ \t]*(.*)$/m;
const PLAN_STATUS_LINES = 15;
const EXTERNAL_TARGET = /^(?:https?:|mailto:|tel:|data:|\/\/)/i;
const RETIRED_CHECKOUT = [
  /\b(?:cd|pushd)\s+(?:["'`])?debate-navigator(?=[/\\\s"'`]|$)/i,
  /\bgit\s+-C\s+(?:["'`])?debate-navigator(?=[/\\\s"'`]|$)/i,
  /\bdebate-navigator(?=[/\\])/i,
  /(?:^|[/\\])debate-navigator(?=[/\\\s"'`.,;:)]|$)/i,
];
const INLINE_LINK = /!?\[[^\]]*\]\(\s*(<[^>]+>|[^\s)]+)(?:\s+["'][^"']*["'])?\s*\)/g;
const REFERENCE_LINK = /^\s*\[[^\]]+\]:\s*(?:<([^>]+)>|(\S+))/;

function toRepositoryPath(path) {
  return path.split(sep).join("/");
}

function isExcluded(relativePath) {
  if (relativePath === "plans/" || relativePath === PLAN_INDEX) return false;
  if (relativePath.split("/").includes("node_modules")) return true;
  return EXCLUDED_PREFIXES.some((prefix) => relativePath.startsWith(prefix));
}

async function markdownFiles(rootDir) {
  const files = [];

  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolutePath = resolve(directory, entry.name);
      const relativePath = toRepositoryPath(relative(rootDir, absolutePath));
      const prefixPath = entry.isDirectory() ? `${relativePath}/` : relativePath;

      if (isExcluded(prefixPath)) continue;
      if (entry.isDirectory()) {
        await walk(absolutePath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
        files.push({ absolutePath, relativePath });
      }
    }
  }

  await walk(rootDir);
  return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function normalizeTarget(target) {
  return target.startsWith("<") && target.endsWith(">") ? target.slice(1, -1) : target;
}

function inlineTargets(content) {
  const targets = [];
  let line = 1;
  let cursor = 0;

  for (const match of content.matchAll(INLINE_LINK)) {
    const index = match.index ?? 0;
    line += content.slice(cursor, index).split("\n").length - 1;
    targets.push({ target: normalizeTarget(match[1]), line });
    cursor = index;
  }

  return targets;
}

function referenceTarget(line) {
  const match = line.match(REFERENCE_LINK);
  return match ? normalizeTarget(match[1] ?? match[2]) : null;
}

function localTarget(rootDir, documentPath, rawTarget) {
  if (!rawTarget || rawTarget.startsWith("#") || EXTERNAL_TARGET.test(rawTarget)) return null;

  const withoutSuffix = rawTarget.replace(/[?#].*$/, "");
  if (!withoutSuffix) return null;

  let decoded;
  try {
    decoded = decodeURIComponent(withoutSuffix);
  } catch {
    return { error: `invalid encoded local link target: ${rawTarget}` };
  }

  const absolutePath = decoded.startsWith("/")
    ? resolve(rootDir, decoded.slice(1))
    : resolve(dirname(documentPath), decoded);
  const relativePath = relative(rootDir, absolutePath);

  if (relativePath === ".." || relativePath.startsWith(`..${sep}`)) {
    return { error: `local link target leaves repository: ${rawTarget}` };
  }

  return { absolutePath };
}

// Plans are excluded from link checks, but each must say where it stands, and
// the index's Shipped section must not list a plan that still calls itself a plan.
async function checkPlans(root, issues) {
  let entries;
  try {
    entries = await readdir(resolve(root, "plans"), { withFileTypes: true });
  } catch {
    return;
  }

  const statuses = new Map();
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md") || entry.name === "README.md") continue;
    const content = await readFile(resolve(root, "plans", entry.name), "utf8");
    const head = content.split(/\r?\n/).slice(0, PLAN_STATUS_LINES).join("\n");
    const status = head.match(PLAN_STATUS)?.[1].trim() || null;
    statuses.set(entry.name, status);
    if (!status) {
      issues.push({ file: `plans/${entry.name}`, line: 1, message: `plan has no **Status:** line in its first ${PLAN_STATUS_LINES} lines` });
    }
  }

  let index;
  try {
    index = await readFile(resolve(root, PLAN_INDEX), "utf8");
  } catch {
    return;
  }
  let section = "";
  for (const [lineIndex, line] of index.split(/\r?\n/).entries()) {
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      section = heading[1].toLowerCase();
      continue;
    }
    if (section !== "shipped") continue;
    for (const match of line.matchAll(INLINE_LINK)) {
      const name = normalizeTarget(match[1]).replace(/[?#].*$/, "").replace(/^\.\//, "");
      const status = statuses.get(name);
      if (status && !/^shipped\b/i.test(status)) {
        issues.push({
          file: PLAN_INDEX,
          line: lineIndex + 1,
          message: `${name} is listed under Shipped but its status is not "Shipped": ${status}`,
        });
      }
    }
  }
}

export async function checkDocs(rootDir) {
  const root = resolve(rootDir);
  const issues = [];

  for (const document of await markdownFiles(root)) {
    const content = await readFile(document.absolutePath, "utf8");
    const lines = content.split(/\r?\n/);

    async function checkTarget(rawTarget, line) {
      const target = localTarget(root, document.absolutePath, rawTarget);
      if (!target) return;
      if (target.error) {
        issues.push({ file: document.relativePath, line, message: target.error });
        return;
      }

      try {
        await stat(target.absolutePath);
      } catch {
        issues.push({
          file: document.relativePath,
          line,
          message: `missing local link target: ${rawTarget}`,
        });
      }
    }

    for (const [index, line] of lines.entries()) {
      if (RETIRED_CHECKOUT.some((pattern) => pattern.test(line))) {
        issues.push({
          file: document.relativePath,
          line: index + 1,
          message: "retired checkout path or command",
        });
      }

      const reference = referenceTarget(line);
      if (reference) await checkTarget(reference, index + 1);
    }

    for (const inline of inlineTargets(content)) {
      await checkTarget(inline.target, inline.line);
    }
  }

  await checkPlans(root, issues);
  return issues;
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  const issues = await checkDocs(process.cwd());
  for (const issue of issues) {
    console.error(`${issue.file}:${issue.line} ${issue.message}`);
  }
  if (issues.length > 0) process.exitCode = 1;
}
