import { describe, expect, it } from "vitest";
import { resolveSupabaseConfig } from "@/lib/supabase/env";
import { resolveCollaborationUrl } from "@/lib/workspace/collaboration-config";

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

  it("requires an encrypted collaboration URL in local preview mode", () => {
    expect(() => resolveCollaborationUrl({ VITE_LOCAL_PREVIEW: "true" }))
      .toThrow("Local collaboration configuration is incomplete");
    expect(resolveCollaborationUrl({
      VITE_COLLABORATION_URL: "wss://trial.example.ts.net:18443/collaboration",
      VITE_LOCAL_PREVIEW: "true",
    })).toBe("wss://trial.example.ts.net:18443/collaboration");
    expect(resolveCollaborationUrl({
      VITE_COLLABORATION_URL: "ws://127.0.0.1:12345",
      VITE_LOCAL_PREVIEW: "true",
    })).toBe("ws://127.0.0.1:12345");
    expect(() => resolveCollaborationUrl({
      VITE_COLLABORATION_URL: "ws://trial.example.ts.net:18443/collaboration",
      VITE_LOCAL_PREVIEW: "true",
    })).toThrow("Local collaboration URL must use WSS outside loopback");
  });
});
