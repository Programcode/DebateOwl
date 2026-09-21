// @vitest-environment node

import { describe, expect, it } from "vitest";
import { parseRuntimeConfig } from "./runtime-config";

describe("collaboration runtime configuration", () => {
  it("fails closed without an exact preview origin", () => {
    expect(() => parseRuntimeConfig({
      COLLABORATION_DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
      COLLABORATION_PORT: "1234",
      SUPABASE_ANON_KEY: "public-key",
      SUPABASE_URL: "http://127.0.0.1:54321",
    })).toThrow("COLLABORATION_ALLOWED_ORIGINS");
  });

  it("parses only explicit HTTP origins and a loopback bind", () => {
    expect(parseRuntimeConfig({
      COLLABORATION_ALLOWED_ORIGINS: "https://trial.example.ts.net:18443",
      COLLABORATION_DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
      COLLABORATION_PORT: "1234",
      SUPABASE_ANON_KEY: "public-key",
      SUPABASE_URL: "http://127.0.0.1:54321",
    })).toMatchObject({
      address: "127.0.0.1",
      allowedOrigins: ["https://trial.example.ts.net:18443"],
      port: 1234,
    });
  });
});
