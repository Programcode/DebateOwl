import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type HeaderRule = {
  source: string;
  headers: Array<{ key: string; value: string }>;
};

type VercelConfig = {
  $schema?: string;
  framework?: string;
  buildCommand?: string;
  outputDirectory?: string;
  rewrites?: Array<{ source: string; destination: string }>;
  headers?: HeaderRule[];
};

function loadConfig(): VercelConfig {
  const path = resolve(process.cwd(), "vercel.json");
  return JSON.parse(readFileSync(path, "utf8")) as VercelConfig;
}

function loadPackageJson(): {
  engines?: { node?: string };
  dependencies?: Record<string, string>;
} {
  return JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8"));
}

function loadMainSource(): string {
  return readFileSync(resolve(process.cwd(), "src/main.tsx"), "utf8");
}

function headersFor(config: VercelConfig, source: string) {
  return Object.fromEntries(
    (config.headers?.find((rule) => rule.source === source)?.headers ?? []).map(({ key, value }) => [key, value]),
  );
}

describe("Vercel frontend deployment configuration", () => {
  it("builds DebateLab as a Vite static site", () => {
    const config = loadConfig();

    expect(config.$schema).toBe("https://openapi.vercel.sh/vercel.json");
    expect(config.framework).toBe("vite");
    expect(config.buildCommand).toBe("npm run build");
    expect(config.outputDirectory).toBe("dist");
  });

  it("falls back to the SPA shell after Vercel checks the filesystem", () => {
    const config = loadConfig();

    expect(config.rewrites).toEqual([{ source: "/(.*)", destination: "/index.html" }]);
  });

  it("preserves the production security headers", () => {
    const config = loadConfig();
    const headers = headersFor(config, "/(.*)");

    expect(headers["Content-Security-Policy"]).toContain("default-src 'self'");
    expect(headers["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(headers["X-Frame-Options"]).toBe("SAMEORIGIN");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["Permissions-Policy"]).toBe("geolocation=(), microphone=(), camera=()");
    expect(headers["Strict-Transport-Security"]).toBe("max-age=31536000; includeSubDomains; preload");
  });

  it.each(["/app", "/app/(.*)", "/login", "/share/(.*)"])(
    "keeps private route %s out of search indexes",
    (source) => {
      const config = loadConfig();
      expect(headersFor(config, source)["X-Robots-Tag"]).toBe("noindex, nofollow");
    },
  );

  it.each(["/index.html", "/config.js", "/sw.js"])(
    "prevents stale caching for %s",
    (source) => {
      const config = loadConfig();
      expect(headersFor(config, source)["Cache-Control"]).toContain("no-cache");
      expect(headersFor(config, source)["Cache-Control"]).toContain("max-age=0");
    },
  );

  it("caches hashed Vite assets immutably", () => {
    const config = loadConfig();
    expect(headersFor(config, "/assets/(.*)")["Cache-Control"]).toBe(
      "public, max-age=31536000, immutable",
    );
  });

  it("pins the Vercel runtime to Node 22", () => {
    expect(loadPackageJson().engines?.node).toBe("22.x");
  });

  it("includes Vercel Web Analytics and Speed Insights in the app root", () => {
    const packageJson = loadPackageJson();
    const mainSource = loadMainSource();

    expect(packageJson.dependencies).toHaveProperty("@vercel/analytics");
    expect(packageJson.dependencies).toHaveProperty("@vercel/speed-insights");
    expect(mainSource).toContain('import { Analytics } from "@vercel/analytics/react"');
    expect(mainSource).toContain('import { SpeedInsights } from "@vercel/speed-insights/react"');
    expect(mainSource).toContain("<Analytics />");
    expect(mainSource).toContain("<SpeedInsights />");
  });
});
