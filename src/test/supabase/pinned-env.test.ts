import { describe, expect, it } from "vitest";
import { resolveSupabaseConfig } from "@/lib/supabase/env";

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
});
