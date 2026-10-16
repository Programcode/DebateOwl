import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type HeaderRule = {
  source: string;
  headers: Array<{ key: string; value: string }>;
};

type VercelConfig = {
  redirects?: Array<{ source: string; destination: string; statusCode?: number }>;
  rewrites?: Array<{ source: string; destination: string }>;
  headers?: HeaderRule[];
};

function loadConfig(): VercelConfig {
  const path = resolve(process.cwd(), "vercel.json");
  return JSON.parse(readFileSync(path, "utf8")) as VercelConfig;
}

function loadPackageJson(): { scripts?: Record<string, string> } {
  return JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8"));
}

function readProjectFile(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function headersFor(config: VercelConfig, source: string) {
  return Object.fromEntries(
    (config.headers?.find((rule) => rule.source === source)?.headers ?? []).map(({ key, value }) => [key, value]),
  );
}

describe("Vercel frontend deployment configuration", () => {
  it("serves the SPA shell for app routes only, so unknown paths get the real 404", () => {
    const config = loadConfig();

    expect(config.rewrites).toEqual(
      ["/app", "/app/:path*", "/login", "/share/:path*", "/expocit/sources"]
        .map((source) => ({ source, destination: "/app-shell.html" })),
    );
  });

  it("permanently redirects the retired brand pages to the landing page", () => {
    const config = loadConfig();

    expect(config.redirects).toHaveLength(1);
    expect(config.redirects?.[0]).toMatchObject({ destination: "/", statusCode: 301 });
    for (const page of ["debatelab", "debate-lab", "debatelab-ai", "debatelab-app", "what-is-debatelab", "debatelab-by-programcode", "about-debatelab"]) {
      expect(config.redirects?.[0].source).toMatch(new RegExp(`[(|]${page}[|)]`));
    }
  });

  it("preserves the production security headers", () => {
    const config = loadConfig();
    const headers = headersFor(config, "/(.*)");

    expect(headers["Content-Security-Policy"]).toContain("default-src 'self'");
    expect(headers["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(headers["Content-Security-Policy"]).toContain("worker-src 'self' blob:");
    expect(headers["Content-Security-Policy"]).not.toMatch(/script-src[^;]*blob:/);
    expect(headers["X-Frame-Options"]).toBe("SAMEORIGIN");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    // Dictation and voice rounds need the microphone on this origin only.
    expect(headers["Permissions-Policy"]).toBe("geolocation=(), microphone=(self), camera=()");
    expect(headers["Strict-Transport-Security"]).toBe("max-age=31536000; includeSubDomains; preload");
  });

  it("loads the theme bootstrap from a CSP-compatible external script", () => {
    const config = loadConfig();
    const csp = headersFor(config, "/(.*)")["Content-Security-Policy"];
    const indexHtml = readProjectFile("index.html");
    const themeBootstrap = readProjectFile("public/theme-init.js");

    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
    expect(indexHtml).toContain('<script src="/theme-init.js"></script>');
    expect(indexHtml).not.toContain('// Prevent flash of wrong theme');
    expect(themeBootstrap).toContain("document.documentElement.classList.add('app-shell')");
    expect(themeBootstrap).toContain("pathname === '/login'");
    expect(themeBootstrap).toContain('window.__showDebateBootstrapError = showBootstrapError');
    expect(themeBootstrap).toContain("debate-trainer-settings");
  });

  it("allows the installed Jam scripts and recorder frames in production", () => {
    const config = loadConfig();
    const csp = headersFor(config, "/(.*)")["Content-Security-Policy"];
    const indexHtml = readProjectFile("index.html");
    const bootstrap = readProjectFile("src/bootstrap.ts");
    const jamLoader = readProjectFile("src/jam-loader.ts");

    expect(csp).toContain("script-src 'self' https://*.jam.dev");
    expect(csp).toContain("frame-src 'self' https://accounts.google.com https://*.jam.dev");
    // Loading the recorder is useless if it cannot upload the capture.
    expect(csp).toContain("connect-src 'self' https://*.jam.dev");
    expect(indexHtml).toContain('<script src="/src/bootstrap.ts" type="module"></script>');
    expect(indexHtml).toContain('<link rel="stylesheet" href="/src/index.css" />');
    expect(indexHtml).toContain('data-startup-shell');
    expect(indexHtml).not.toContain('<script type="module" src="/src/main.tsx"></script>');
    expect(bootstrap).toContain("import { mountApp } from './main'");
    expect(bootstrap).toContain('mountApp()');
    expect(bootstrap).toContain('__showDebateBootstrapError');
    expect(bootstrap).toContain('scheduleJamRecorder()');
    expect(bootstrap.indexOf('mountApp()')).toBeLessThan(bootstrap.indexOf('scheduleJamRecorder()'));
    expect(bootstrap).not.toContain("import('./main')");
    expect(bootstrap).not.toContain("then(() => import('./main'))");
    expect(jamLoader).toContain("typeof globalThis.MediaRecorder !== 'undefined'");
    expect(jamLoader).toContain("https://js.jam.dev/recorder.js");
    expect(jamLoader).toContain("https://js.jam.dev/capture.js");
    expect(indexHtml).toContain('<meta name="jam:team" content="b79917fc-80c6-4de1-9047-c98fa5db0aff" />');
  });

  it("keeps route chunks out of the initial document and runs the graph gate", () => {
    const indexHtml = readProjectFile("index.html");
    const packageJson = loadPackageJson();

    expect(indexHtml).not.toMatch(/rel="(?:modulepreload|preload|prefetch)"[^>]*(?:pages|LandingPage|LoginPage|HomePage|GeneratePage|AttackPage)/i);
    expect(packageJson.scripts?.build).toBe("vite build && node scripts/prerender.mjs && node scripts/sitemap.mjs && node scripts/check-build-boundaries.mjs");
  });

  it("caches the offline shell and only caches feature assets after they are visited", () => {
    const serviceWorker = readProjectFile("public/sw.js");
    expect(serviceWorker).toContain("cache.put('/index.html', response.clone())");
    expect(serviceWorker).not.toContain("'/app/crossfire'");
    expect(serviceWorker).not.toContain("'/app/sparring'");
    expect(serviceWorker).toContain("'/favicon-72.png'");
    expect(serviceWorker).toContain('cache.put(request, response.clone())');
    expect(serviceWorker).not.toContain('self.skipWaiting()');
  });

  it.each(["/app", "/app/(.*)", "/login", "/share/(.*)"])(
    "keeps private route %s out of search indexes",
    (source) => {
      const config = loadConfig();
      expect(headersFor(config, source)["X-Robots-Tag"]).toBe("noindex, nofollow");
    },
  );

  it.each(["/", "/index.html", "/app-shell.html", "/theme-init.js", "/sw.js"])(
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
});
