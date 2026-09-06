import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

// These paths are generated, vendored, immutable evidence, or plan history.
// Everything else is checked by default so new maintained docs cannot opt out silently.
const EXCLUDED_PREFIXES = [
  ".git/",
  "node_modules/",
  "dist/",
  "coverage/",
  "test-results/",
  "playwright-report/",
  "ios/App/CapApp-SPM/",
  "docs/pricing-snapshots/",
  "security/scans/",
  "docs/superpowers/",
  "plans/",
];

const PLAN_INDEX = "plans/README.md";
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

function linkTargets(line) {
  const targets = [];

  for (const match of line.matchAll(INLINE_LINK)) {
    targets.push(match[1]);
  }

  const reference = line.match(REFERENCE_LINK);
  if (reference) targets.push(reference[1] ?? reference[2]);

  return targets.map((target) =>
    target.startsWith("<") && target.endsWith(">") ? target.slice(1, -1) : target,
  );
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

export async function checkDocs(rootDir) {
  const root = resolve(rootDir);
  const issues = [];

  for (const document of await markdownFiles(root)) {
    const lines = (await readFile(document.absolutePath, "utf8")).split(/\r?\n/);

    for (const [index, line] of lines.entries()) {
      if (RETIRED_CHECKOUT.some((pattern) => pattern.test(line))) {
        issues.push({
          file: document.relativePath,
          line: index + 1,
          message: "retired checkout path or command",
        });
      }

      for (const rawTarget of linkTargets(line)) {
        const target = localTarget(root, document.absolutePath, rawTarget);
        if (!target) continue;
        if (target.error) {
          issues.push({ file: document.relativePath, line: index + 1, message: target.error });
          continue;
        }

        try {
          await stat(target.absolutePath);
        } catch {
          issues.push({
            file: document.relativePath,
            line: index + 1,
            message: `missing local link target: ${rawTarget}`,
          });
        }
      }
    }
  }

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
