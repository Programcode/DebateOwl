import { describe, expect, it } from "vitest";
import { E2E_SUPABASE_URL, assertE2eSupabaseTarget, e2eRefusesProductionRequest } from "@/lib/supabase/e2e-guard";
import { resolveSupabaseConfig } from "@/lib/supabase/env";
import { SUPABASE_PROJECTS } from "@/lib/supabase/projects";

const noToggle = { getItem: (): string | null => null };
const stagingToggle = { getItem: () => "staging" };

describe("build-pinned Supabase project", () => {
  it("uses staging when the build pins staging, with no saved toggle", () => {
    expect(resolveSupabaseConfig({ VITE_SUPABASE_ENV: "staging" }, noToggle)).toMatchObject({
      env: "staging",
      url: "https://brifeyypjauyusmkptkx.supabase.co",
    });
  });

  it("ignores a saved staging toggle when the build pins production", () => {
    expect(resolveSupabaseConfig({ VITE_SUPABASE_ENV: "production" }, stagingToggle)).toMatchObject({
      env: "production",
      url: "https://uziwdtkzofptihahfooo.supabase.co",
    });
  });

  it("fails closed on an unknown pinned project", () => {
    expect(() => resolveSupabaseConfig({ VITE_SUPABASE_ENV: "prod" }, noToggle))
      .toThrow("Unknown VITE_SUPABASE_ENV");
  });

  it("keeps the saved toggle when nothing is pinned", () => {
    expect(resolveSupabaseConfig({}, stagingToggle)).toMatchObject({ env: "staging" });
    expect(resolveSupabaseConfig({ VITE_SUPABASE_ENV: " " }, noToggle)).toMatchObject({ env: "production" });
  });

  it("sends credential-free e2e away from the production project", () => {
    expect(resolveSupabaseConfig({ VITE_E2E: "1" }, noToggle)).toMatchObject({
      env: "production",
      url: E2E_SUPABASE_URL,
    });
    expect(resolveSupabaseConfig({ VITE_E2E: "1" }, stagingToggle)).toMatchObject({
      env: "staging",
      url: SUPABASE_PROJECTS.staging.url,
    });
    expect(resolveSupabaseConfig({ VITE_E2E: "1", VITE_E2E_ALLOW_PROD: "1" }, noToggle)).toMatchObject({
      env: "production",
      url: SUPABASE_PROJECTS.production.url,
    });
    expect(() => resolveSupabaseConfig({ VITE_E2E: "1", VITE_SUPABASE_ENV: "production" }, noToggle))
      .toThrow("production Supabase project");
  });
});

describe("e2e production guard", () => {
  const production = SUPABASE_PROJECTS.production.url;

  it("refuses a production URL unless the run is forced", () => {
    expect(e2eRefusesProductionRequest({ e2e: true, allowProduction: false, url: `${production}/auth/v1/user` })).toBe(true);
    expect(e2eRefusesProductionRequest({ e2e: true, allowProduction: true, url: `${production}/auth/v1/user` })).toBe(false);
    expect(e2eRefusesProductionRequest({ e2e: false, allowProduction: false, url: `${production}/auth/v1/user` })).toBe(false);
    expect(e2eRefusesProductionRequest({ e2e: true, allowProduction: false, url: "http://e2e.invalid/auth/v1/user" })).toBe(false);
    expect(e2eRefusesProductionRequest({ e2e: true, allowProduction: false, url: SUPABASE_PROJECTS.staging.url })).toBe(false);
  });

  it("refuses to start when the process is pointed at production", () => {
    expect(() => assertE2eSupabaseTarget({ VITE_SUPABASE_ENV: "production" })).toThrow("production Supabase project");
    expect(() => assertE2eSupabaseTarget({ SUPABASE_URL: production })).toThrow("production Supabase project");
    expect(() => assertE2eSupabaseTarget({ VITE_SUPABASE_ENV: "production", E2E_ALLOW_PROD: "1" })).not.toThrow();
    expect(() => assertE2eSupabaseTarget({})).not.toThrow();
  });
});
