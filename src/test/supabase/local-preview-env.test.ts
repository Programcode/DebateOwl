import { describe, expect, it } from "vitest";
import { resolveSupabaseConfig } from "@/lib/supabase/env";
import { SUPABASE_PROJECTS } from "@/lib/supabase/projects";
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

describe("staging preview Supabase boundary", () => {
  const preview = { VITE_STAGING_PREVIEW: "true" };
  const stagingAnonKey = SUPABASE_PROJECTS.staging.anonKey;

  it("pins staging behind the same-origin proxy, whatever the toggle says", () => {
    for (const stored of [null, "production", "staging"]) {
      expect(resolveSupabaseConfig(
        preview,
        { getItem: () => stored },
        "https://codex-remote.example.ts.net:9201",
      )).toEqual({
        anonKey: stagingAnonKey,
        env: "staging",
        pinned: true,
        url: "https://codex-remote.example.ts.net:9201/__staging-supabase",
      });
    }
  });

  it("never points at the production project", () => {
    const config = resolveSupabaseConfig(preview, { getItem: () => null }, "http://127.0.0.1:9201");
    expect(config.url).not.toContain(new URL(SUPABASE_PROJECTS.production.url).host);
    expect(config.anonKey).not.toBe(SUPABASE_PROJECTS.production.anonKey);
  });

  it("drops any path from the page origin", () => {
    expect(resolveSupabaseConfig(preview, { getItem: () => null }, "https://host.example.ts.net:9201/app/x").url)
      .toBe("https://host.example.ts.net:9201/__staging-supabase");
  });

  it("fails closed without a page origin", () => {
    expect(() => resolveSupabaseConfig(preview, { getItem: () => null }))
      .toThrow("Staging preview needs the page origin");
  });

  it("refuses to combine with local preview", () => {
    expect(() => resolveSupabaseConfig(
      { ...preview, VITE_LOCAL_PREVIEW: "true" },
      { getItem: () => null },
      "http://127.0.0.1:9201",
    )).toThrow("Local preview and staging preview cannot both be enabled");
  });

  it("leaves the normal build on the toggle", () => {
    expect(resolveSupabaseConfig({}, { getItem: () => null }, "https://debate.pi-stack.org"))
      .toEqual({ ...SUPABASE_PROJECTS.production, env: "production" });
    expect(resolveSupabaseConfig({}, { getItem: () => "staging" }, "https://debate.pi-stack.org"))
      .toEqual({ ...SUPABASE_PROJECTS.staging, env: "staging" });
  });
});
