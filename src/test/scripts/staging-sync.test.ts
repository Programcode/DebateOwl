import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error -- plain ESM script without type declarations
import { assertNoUndeclared, assertStagingTarget, contentDrift, planSync, PRODUCTION_REF, STAGING_REF } from "../../../scripts/staging-sync.mjs";

const staging = { ref: STAGING_REF, name: "debate-trainer-staging" };
const production = { ref: PRODUCTION_REF, name: "debate-trainer" };

describe("staging sync target guard", () => {
  it("accepts the staging project under its own name", () => {
    expect(() => assertStagingTarget([production, staging], {})).not.toThrow();
  });

  it("refuses when SUPABASE_PROJECT_ID points anywhere else", () => {
    expect(() => assertStagingTarget([production, staging], { SUPABASE_PROJECT_ID: PRODUCTION_REF }))
      .toThrow(/only targets staging/);
  });

  it("refuses when the staging ref is missing or renamed", () => {
    expect(() => assertStagingTarget([production], {})).toThrow(/cannot see/);
    expect(() => assertStagingTarget([{ ref: STAGING_REF, name: "debate-trainer" }], {})).toThrow(/expected "debate-trainer-staging"/);
  });
});

describe("staging sync plan", () => {
  it("deploys missing, stale and wrong-JWT functions once each, and skips the hidden workspace function", () => {
    const plan = planSync({
      unknownMigrations: [],
      pendingMigrations: ["20261002000000"],
      notDeployed: ["ai", "workspace-invites"],
      stale: [{ name: "ai" }, { name: "share" }],
      verifyJwt: [{ name: "account" }],
      notInRepo: ["workspace-invites", "old-fn"],
    });
    expect(plan).toEqual({
      divergent: [],
      migrations: ["20261002000000"],
      functions: ["account", "ai", "share"],
      undeclared: ["old-fn"],
    });
    // A function removed from main but still deployed fails the sync instead of passing quietly.
    expect(() => assertNoUndeclared(plan)).toThrow(/old-fn/);
  });
});

describe("staging sync content check", () => {
  const root = mkdtempSync(join(tmpdir(), "staging-sync-test-"));
  for (const [path, text] of [["ai/index.ts", "ai v2"], ["_shared/cors.ts", "cors v2"], ["share/index.ts", "share"]]) {
    mkdirSync(join(root, "supabase/functions", path, ".."), { recursive: true });
    writeFileSync(join(root, "supabase/functions", path), text);
  }
  const deployed: Record<string, Record<string, string>> = {
    ai: { "ai/index.ts": "ai v2", "_shared/cors.ts": "cors v1" }, // older shared code deployed later
    share: { "share/index.ts": "share" },
    gone: { "gone/index.ts": "x", "gone/extra.ts": "y" },
    empty: {},
  };
  const download = (name: string) => new Map(Object.entries(deployed[name]).map(([path, text]) => [path, Buffer.from(text)]));

  it("flags a function whose deployed source differs, even in a shared file", () => {
    expect(contentDrift(root, ["ai", "share"], download)).toEqual(["ai"]);
  });

  it("flags files the commit lacks and downloads with no entry point", () => {
    expect(contentDrift(root, ["gone", "empty"], download)).toEqual(["gone", "empty"]);
  });
});
