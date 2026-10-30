import { assertEquals } from "jsr:@std/assert@1.0.19";
import { ALLOWED_ORIGINS, getCorsHeaders, isAllowedOrigin, isDevOrigin } from "./cors.ts";

Deno.test("local gate origins require both explicit listing and a dev origin", () => {
  const previous = Deno.env.get("LOCAL_GATE_APP_ORIGINS");
  const local = "http://127.0.0.1:18181";
  try {
    Deno.env.delete("LOCAL_GATE_APP_ORIGINS");
    assertEquals(isAllowedOrigin(local), false);
    assertEquals(getCorsHeaders(local)["Access-Control-Allow-Origin"], ALLOWED_ORIGINS[0]);
    Deno.env.set("LOCAL_GATE_APP_ORIGINS", `${local}, http://localhost:18181, https://evil.example, http://localhost.evil.com`);
    for (const origin of [local, "http://localhost:18181"]) {
      assertEquals(isAllowedOrigin(origin), true);
      assertEquals(getCorsHeaders(origin)["Access-Control-Allow-Origin"], origin);
    }
    for (const origin of ["https://evil.example", "http://localhost.evil.com", "http://127.0.0.1:18182"]) {
      assertEquals(isAllowedOrigin(origin), false);
      assertEquals(getCorsHeaders(origin)["Access-Control-Allow-Origin"], ALLOWED_ORIGINS[0]);
    }
  } finally {
    if (previous === undefined) Deno.env.delete("LOCAL_GATE_APP_ORIGINS");
    else Deno.env.set("LOCAL_GATE_APP_ORIGINS", previous);
  }
});

Deno.test("allows the isolated staging browser origin", () => {
  const headers = getCorsHeaders("http://127.0.0.1:18080");
  assertEquals(headers["Access-Control-Allow-Origin"], "http://127.0.0.1:18080");
});

Deno.test("falls back to the public origin for an unknown caller", () => {
  const headers = getCorsHeaders("https://evil.example.com");
  assertEquals(headers["Access-Control-Allow-Origin"], "https://debateowl.com");
  assertEquals(ALLOWED_ORIGINS[0], "https://debateowl.com");
});

Deno.test("falls back when no origin header is present", () => {
  assertEquals(getCorsHeaders(null)["Access-Control-Allow-Origin"], "https://debateowl.com");
});

Deno.test("rejects a hostname that merely starts with localhost", () => {
  assertEquals(isDevOrigin("http://localhost.evil.com"), false);
  assertEquals(isDevOrigin("http://localhostevil.com"), false);
  assertEquals(isDevOrigin("https://localhost"), false);
  assertEquals(isDevOrigin("http://localhost:4173"), true);
  assertEquals(isDevOrigin("http://192.168.1.14:8080"), true);
});

Deno.test("only echoes a dev origin when the function opts in", () => {
  const origin = "http://192.168.1.14:8080";
  assertEquals(getCorsHeaders(origin)["Access-Control-Allow-Origin"], "https://debateowl.com");
  assertEquals(
    getCorsHeaders(origin, { allowDevOrigins: true })["Access-Control-Allow-Origin"],
    origin,
  );
});

Deno.test("carries the requested methods", () => {
  assertEquals(getCorsHeaders(null)["Access-Control-Allow-Methods"], "POST, OPTIONS");
  assertEquals(
    getCorsHeaders(null, { methods: "GET, POST, OPTIONS" })["Access-Control-Allow-Methods"],
    "GET, POST, OPTIONS",
  );
});

Deno.test("allows both Vercel projects' preview and staging hosts", () => {
  for (const origin of [
    "https://debate-navigator-git-feat-accou-6d6edb-adam-gaborjanis-projects.vercel.app",
    "https://debate-navigator-da65qye7v-adam-gaborjanis-projects.vercel.app",
    "https://debatelab-staging-git-main-adam-gaborjanis-projects.vercel.app",
    "https://debatelab-staging.vercel.app",
  ]) {
    assertEquals(isAllowedOrigin(origin), true, origin);
    assertEquals(getCorsHeaders(origin)["Access-Control-Allow-Origin"], origin);
  }
});

Deno.test("rejects other Vercel projects and lookalike hosts", () => {
  for (const origin of [
    "https://chorely-git-main-adam-gaborjanis-projects.vercel.app",
    "https://debate-navigator-git-x-someone-else.vercel.app",
    "https://debate-navigator-x-adam-gaborjanis-projects.vercel.app.evil.com",
    "http://debate-navigator-x-adam-gaborjanis-projects.vercel.app",
    "https://debate-navigator.vercel.app",
  ]) {
    assertEquals(isAllowedOrigin(origin), false, origin);
  }
});

Deno.test("dynamic CORS responses vary by Origin for allowed, rejected and absent origins", () => {
  for (const origin of [ALLOWED_ORIGINS[0], "http://127.0.0.1:18080", "https://evil.example", null]) {
    assertEquals(getCorsHeaders(origin).Vary, "Origin");
  }
});

Deno.test("still allows the previous domain after the move to debateowl.com", () => {
  for (const origin of ["https://debateowl.com", "https://debate.pi-stack.org"]) {
    assertEquals(isAllowedOrigin(origin), true, origin);
    assertEquals(getCorsHeaders(origin)["Access-Control-Allow-Origin"], origin);
  }
  assertEquals(isAllowedOrigin("https://debateowl.com.evil.example"), false);
});
