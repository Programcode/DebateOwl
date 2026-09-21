import { describe, expect, it } from "vitest";
import { resolveSupabaseConfig } from "@/lib/supabase/env";

describe("local preview Supabase boundary", () => {
  it("fails closed when local preview configuration is incomplete", () => {
    expect(() => resolveSupabaseConfig(
      { VITE_LOCAL_PREVIEW: "true" },
      { getItem: () => "staging" },
    )).toThrow("Local preview configuration is incomplete");
  });

  it("ignores the production and staging toggle in local preview mode", () => {
    expect(resolveSupabaseConfig(
      {
        VITE_LOCAL_PREVIEW: "true",
        VITE_LOCAL_SUPABASE_ANON_KEY: "local-public-key",
        VITE_LOCAL_SUPABASE_URL: "https://trial.example.ts.net:18443/supabase",
      },
      { getItem: () => "staging" },
    )).toEqual({
      anonKey: "local-public-key",
      env: "local",
      url: "https://trial.example.ts.net:18443/supabase",
    });
  });
});
