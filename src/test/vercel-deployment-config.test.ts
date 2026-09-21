import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type HeaderRule = {
  source: string;
  headers: Array<{ key: string; value: string }>;
};

type VercelConfig = {
  headers?: HeaderRule[];
};

function readProjectFile(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function headersFor(config: VercelConfig, source: string) {
  return Object.fromEntries(
    (config.headers?.find((rule) => rule.source === source)?.headers ?? []).map(({ key, value }) => [key, value]),
  );
}

// Only the security posture is pinned here. Build command, output directory, cache
// rules, and analytics wiring are plain configuration: restating them in a test adds
// a second place to edit without catching a defect Vercel would not catch first.
describe("Vercel frontend deployment security headers", () => {
  const config = JSON.parse(readProjectFile("vercel.json")) as VercelConfig;
  const headers = headersFor(config, "/(.*)");
  const csp = headers["Content-Security-Policy"];

  it("preserves the production security headers", () => {
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("worker-src 'self' blob:");
    expect(csp).not.toMatch(/script-src[^;]*blob:/);
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(headers["X-Frame-Options"]).toBe("SAMEORIGIN");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["Permissions-Policy"]).toBe("geolocation=(), microphone=(), camera=()");
    expect(headers["Strict-Transport-Security"]).toBe("max-age=31536000; includeSubDomains; preload");
  });

  it("serves the same policy from the nginx container", () => {
    const nginxCsp = readProjectFile("nginx.conf").match(/add_header Content-Security-Policy "([^"]+)"/)?.[1];
    expect(nginxCsp).toBe(csp);
  });

  it.each(["/app", "/app/(.*)", "/login", "/share/(.*)"])(
    "keeps private route %s out of search indexes",
    (source) => {
      expect(headersFor(config, source)["X-Robots-Tag"]).toBe("noindex, nofollow");
    },
  );
});
