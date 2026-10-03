import { assertEquals } from "jsr:@std/assert@1.0.19";
import { ALLOWED_ORIGINS, getCorsHeaders, isAllowedOrigin, isDevOrigin } from "./cors.ts";

Deno.test("allows the Capacitor WebView origin", () => {
  const headers = getCorsHeaders("capacitor://localhost");
  assertEquals(headers["Access-Control-Allow-Origin"], "capacitor://localhost");
});

Deno.test("allows the isolated staging browser origin", () => {
  const headers = getCorsHeaders("http://127.0.0.1:18080");
  assertEquals(headers["Access-Control-Allow-Origin"], "http://127.0.0.1:18080");
});

Deno.test("falls back to the public origin for an unknown caller", () => {
  const headers = getCorsHeaders("https://evil.example.com");
  assertEquals(headers["Access-Control-Allow-Origin"], "https://debate.pi-stack.org");
  assertEquals(ALLOWED_ORIGINS[0], "https://debate.pi-stack.org");
});

Deno.test("falls back when no origin header is present", () => {
  assertEquals(getCorsHeaders(null)["Access-Control-Allow-Origin"], "https://debate.pi-stack.org");
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
  assertEquals(getCorsHeaders(origin)["Access-Control-Allow-Origin"], "https://debate.pi-stack.org");
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
