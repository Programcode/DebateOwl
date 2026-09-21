import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1.0.19";
import { ALLOWED_ORIGINS, getCorsHeaders, isDevOrigin } from "./cors.ts";

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

Deno.test("native share links use the public HTTPS origin", async () => {
  const source = await Deno.readTextFile(new URL("../share/index.ts", import.meta.url));
  assertStringIncludes(source, "shareUrl: `${PUBLIC_WEB_APP_ORIGIN}/share/${data.share_code}`");
});
