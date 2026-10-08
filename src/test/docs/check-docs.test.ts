import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

interface DocIssue {
  file: string;
  line: number;
  message: string;
}

type CheckDocs = (rootDir: string) => Promise<DocIssue[]>;

const temporaryRoots: string[] = [];

async function createRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "debatelab-docs-"));
  temporaryRoots.push(root);
  return root;
}

async function write(root: string, relativePath: string, content: string): Promise<void> {
  const target = join(root, relativePath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content);
}

async function loadCheckDocs(): Promise<CheckDocs> {
  const checkerUrl = pathToFileURL(resolve("scripts/check-docs.mjs")).href;
  const checkerModule = await import(checkerUrl);
  return checkerModule.checkDocs;
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("checkDocs", () => {
  it("accepts an existing local inline link", async () => {
    const root = await createRoot();
    await write(root, "README.md", "Read the [guide](docs/guide.md).\n");
    await write(root, "docs/guide.md", "# Guide\n");

    await expect((await loadCheckDocs())(root)).resolves.toEqual([]);
  });

  it("checks new Markdown files by default", async () => {
    const root = await createRoot();
    await write(root, "notes/new.md", "Run `cd debate-navigator`.\n");

    const issues = await (await loadCheckDocs())(root);

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ file: "notes/new.md", line: 1 });
  });

  it("checks the plan index but excludes other plan artifacts", async () => {
    const root = await createRoot();
    await write(root, "plans/README.md", "Run `cd debate-navigator`.\n");
    await write(root, "plans/old.md", "**Status:** Shipped.\n\nRun `cd debate-navigator`.\n");

    const issues = await (await loadCheckDocs())(root);

    expect(issues).toHaveLength(1);
    expect(issues[0].file).toBe("plans/README.md");
  });

  it.each([
    ".git/notes.md",
    "node_modules/package/README.md",
    "dist/report.md",
    "coverage/report.md",
    "test-results/report.md",
    "playwright-report/report.md",
  ])("excludes %s", async (relativePath) => {
    const root = await createRoot();
    await write(root, relativePath, "Run `cd debate-navigator`.\n");

    await expect((await loadCheckDocs())(root)).resolves.toEqual([]);
  });

  it.each([
    "Run `cd debate-navigator`.",
    "Run `pushd debate-navigator`.",
    "Run `git -C debate-navigator status`.",
    "Open `debate-navigator/docs/setup.md`.",
    "Open `/tmp/debate-navigator/file`.",
    "Open `/home/codex/Projects/debate-navigator`.",
  ])("rejects an actionable retired checkout form: %s", async (content) => {
    const root = await createRoot();
    await write(root, "README.md", `${content}\n`);

    const issues = await (await loadCheckDocs())(root);

    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain("retired checkout");
  });

  it("allows the former repository name in historical prose", async () => {
    const root = await createRoot();
    await write(root, "README.md", "The project was formerly named debate-navigator.\n");

    await expect((await loadCheckDocs())(root)).resolves.toEqual([]);
  });

  it.each([
    "Read the [missing guide](docs/missing.md).",
    "[guide]: docs/missing.md",
  ])("rejects a missing local target: %s", async (content) => {
    const root = await createRoot();
    await write(root, "README.md", `${content}\n`);

    const issues = await (await loadCheckDocs())(root);

    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain("missing local link target");
  });

  it("rejects a missing multiline local target", async () => {
    const root = await createRoot();
    await write(root, "README.md", "Read the [missing guide](\n  docs/missing.md\n).\n");

    const issues = await (await loadCheckDocs())(root);

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ file: "README.md", line: 1 });
    expect(issues[0].message).toContain("missing local link target");
  });

  it("accepts encoded paths and query or fragment suffixes", async () => {
    const root = await createRoot();
    await write(
      root,
      "README.md",
      "[encoded](docs/my%20guide.md) [query](docs/guide.md?raw=1) [fragment](docs/guide.md#setup)\n",
    );
    await write(root, "docs/my guide.md", "# Encoded\n");
    await write(root, "docs/guide.md", "# Setup\n");

    await expect((await loadCheckDocs())(root)).resolves.toEqual([]);
  });

  it.each([
    "[web](https://example.com)",
    "[protocol-relative](//cdn.example.com/guide.md)",
    "[mail](mailto:test@example.com)",
    "[phone](tel:+123456789)",
    "[data](data:text/plain,hello)",
    "[section](#section)",
  ])("ignores non-file target %s", async (link) => {
    const root = await createRoot();
    await write(root, "README.md", `${link}\n`);

    await expect((await loadCheckDocs())(root)).resolves.toEqual([]);
  });

  it("requires a status line on every plan", async () => {
    const root = await createRoot();
    await write(root, "plans/README.md", "# Plans\n");
    await write(root, "plans/new.md", "# New plan\n\nNo status yet.\n");
    await write(root, "plans/dated.md", "# Dated plan\n\n**Status:** Plan. Written 2026-10-01.\n");

    const issues = await (await loadCheckDocs())(root);

    expect(issues).toEqual([
      { file: "plans/new.md", line: 1, message: "plan has no **Status:** line in its first 15 lines" },
    ]);
  });

  it("rejects a plan listed under Shipped whose status is not shipped", async () => {
    const root = await createRoot();
    await write(
      root,
      "plans/README.md",
      "# Plans\n\n## Backlog\n\n- [Next](next.md)\n\n## Shipped\n\n- Done: #1. [Done](done.md)\n- Stale: #2. [Stale](./stale.md)\n",
    );
    await write(root, "plans/next.md", "**Status:** Plan.\n");
    await write(root, "plans/done.md", "**Status:** Shipped in #1.\n");
    await write(root, "plans/stale.md", "**Status:** Plan. Written 2026-10-01.\n");

    const issues = await (await loadCheckDocs())(root);

    expect(issues).toEqual([
      {
        file: "plans/README.md",
        line: 10,
        message: 'stale.md is listed under Shipped but its status is not "Shipped": Plan. Written 2026-10-01.',
      },
    ]);
  });
});
