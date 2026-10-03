import { describe, expect, it } from "vitest";
// @ts-expect-error -- plain ESM script without type declarations
import { assertStagingTarget, planSync, PRODUCTION_REF, STAGING_REF } from "../../../scripts/staging-sync.mjs";

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
  });
});
