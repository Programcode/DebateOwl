import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SUPABASE_PROJECTS } from "@/lib/supabase/projects";

type HeaderRule = {
  source: string;
  headers: Array<{ key: string; value: string }>;
};

type VercelConfig = {
  trailingSlash?: boolean;
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

/**
 * The headers Vercel sends for a path: every rule whose source matches it.
 * Vercel compiles a source with path-to-regexp, strict and case-sensitive
 * (sourceToRegex in @vercel/routing-utils); for sources made of literals and
 * unnamed groups, as all of these are, that is the source as an anchored
 * regular expression. Vercel documents no order between two rules that set the
 * same header, so that is a test failure rather than something this resolves.
 */
function headersAt(config: VercelConfig, path: string): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const rule of config.headers ?? []) {
    expect(rule.source, "a source this resolver can read").toMatch(/^\/[\w\-./()|*?!$\\]*$/);
    if (!new RegExp(`^${rule.source}$`).test(path)) continue;
    for (const { key, value } of rule.headers) {
      expect(headers, `${path}: two rules set ${key}`).not.toHaveProperty(key);
      headers[key] = value;
    }
  }
  return headers;
}

const cspDirective = (csp: string, name: string) =>
  csp.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name} `)) ?? "";

describe("Vercel frontend deployment configuration", () => {
  it("serves the SPA shell for app routes only, so unknown paths get the real 404", () => {
    const config = loadConfig();

    expect(config.rewrites).toEqual(
      ["/app", "/app/:path*", "/login", "/share/:path*", "/expocit/sources"]
        .map((source) => ({ source, destination: "/app-shell.html" })),
    );
    // Rewrite sources match exactly, so /app/settings/ must first lose its slash.
    expect(config.trailingSlash).toBe(false);
  });

  it("permanently redirects the retired brand pages to the landing page", () => {
    const config = loadConfig();

    const pages = "debatelab|debate-lab|debatelab-ai|debatelab-app|what-is-debatelab|debatelab-by-programcode|about-debatelab";
    // Vercel matches a trailing slash only when the source spells it out.
    expect(config.redirects?.filter((rule) => rule.source.startsWith("/:page("))).toEqual(["", "/", "/:rest+"].map((suffix) => ({
      source: `/:page(${pages})${suffix}`,
      destination: "/",
      statusCode: 301,
    })));
  });

  it("redirects each retired guide to a live guide that no page links past", () => {
    // Google already knows these URLs; dropping a rule turns one into a 404.
    const retiredGuides: Record<string, string> = {
      "/online-debate-timer-tool": "/online-debate-timer",
      "/debate-argument-flowchart-tool": "/argument-flowchart",
      "/debate-weighing-guide": "/how-to-weigh-in-debate",
      "/debate-impact-calculus": "/how-to-weigh-in-debate",
      "/debate-cross-examination-tips": "/how-to-cross-examine-in-debate",
      "/debate-note-taking-flowing": "/how-to-flow-in-debate",
      "/debate-case-generator": "/ai-debate-case-generator",
      "/how-to-write-a-rebuttal-speech": "/how-to-practice-rebuttals",
      "/wsdc-debate-practice": "/world-schools-debate",
      "/ai-debate-evidence-research": "/debate-evidence-finder",
      "/debate-evidence-verification": "/debate-evidence-finder",
      "/debatelab-alternatives": "/best-ai-debate-tools",
      "/ai-tools-for-debate-students": "/best-ai-debate-tools",
    };
    const guideRedirects = (loadConfig().redirects ?? []).filter((rule) => !rule.source.startsWith("/:page("));
    const retired = new Set(Object.keys(retiredGuides));
    const pages = readdirSync(resolve(process.cwd(), "public"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && existsSync(resolve(process.cwd(), "public", entry.name, "index.html")))
      .map((entry) => `/${entry.name}`);

    expect(guideRedirects).toEqual(Object.entries(retiredGuides)
      .map(([source, destination]) => ({ source, destination, statusCode: 301 })));
    // One hop to a page that exists, never to another retired slug.
    for (const destination of Object.values(retiredGuides)) {
      expect(pages).toContain(destination);
      expect(retired.has(destination)).toBe(false);
    }
    for (const page of pages) {
      // A generated page left behind would be shadowed by its redirect.
      expect(retired.has(page)).toBe(false);
      const html = readProjectFile(`public${page}/index.html`);
      for (const source of retired) expect(html).not.toContain(`href="${source}"`);
    }
  });

  it("preserves the production security headers", () => {
    const config = loadConfig();
    const headers = headersAt(config, "/");

    expect(headers["Content-Security-Policy"]).toContain("default-src 'self'");
    expect(headers["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    expect(headers["Content-Security-Policy"]).toContain("worker-src 'self' blob:");
    expect(headers["Content-Security-Policy"]).not.toMatch(/script-src[^;]*blob:/);
    expect(headers["Content-Security-Policy"]).toContain("form-action 'self'");
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    // Dictation and voice rounds need the microphone on this origin only.
    expect(headers["Permissions-Policy"]).toBe("geolocation=(), microphone=(self), camera=()");
    expect(headers["Strict-Transport-Security"]).toBe("max-age=31536000; includeSubDomains; preload");
  });

  it("lets the page load images and call Supabase only where the app needs to", () => {
    const csp = headersAt(loadConfig(), "/")["Content-Security-Policy"];
    const directive = (name: string) => cspDirective(csp, name);

    // Any-host images let prompt-injected Markdown send student work to a third party.
    expect(directive("img-src").split(" ")).not.toContain("https:");
    // A wildcard would let injected script post data to an attacker's own project.
    const supabaseHosts = directive("connect-src").split(" ").filter((source) => source.includes("supabase.co"));
    expect(supabaseHosts.sort()).toEqual(Object.values(SUPABASE_PROJECTS).map((project) => project.url).sort());
  });

  it("loads the theme bootstrap from a CSP-compatible external script", () => {
    const config = loadConfig();
    const csp = headersAt(config, "/")["Content-Security-Policy"];
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
    const csp = headersAt(config, "/")["Content-Security-Policy"];
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

  it.each([
    "/", "/index.html", "/app", "/app/settings", "/login", "/share/abc", "/tools", "/tools/debate-timer",
    "/online-debate-timer", "/404.html", "/app-shell.html", "/embed", "/embed/", "/embed/nope", "/embed/debate-timer/",
    "/embed/debate-timer/index.html", "/embedded/x", "/EMBED/debate-timer", "/assets/index.js",
  ])("refuses to be framed at %s", (path) => {
    const headers = headersAt(loadConfig(), path);
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(cspDirective(headers["Content-Security-Policy"] ?? "", "frame-ancestors")).toBe("frame-ancestors 'none'");
  });

  it("lets other sites frame the embed at /embed/debate-timer, and nothing else", () => {
    const path = "/embed/debate-timer";
    const config = loadConfig();
    const headers = headersAt(config, path);
    const site = headersAt(config, "/");
    const csp = headers["Content-Security-Policy"];

    expect(headers).not.toHaveProperty("X-Frame-Options");
    expect(cspDirective(csp, "frame-ancestors")).toBe("frame-ancestors *");
    expect(headers["X-Robots-Tag"]).toBe("noindex, nofollow");
    // The embed runs only its own static assets: no third-party script, no API.
    for (const name of ["default-src", "script-src", "connect-src"]) expect(cspDirective(csp, name)).toBe(`${name} 'self'`);
    for (const name of ["frame-src", "worker-src"]) expect(cspDirective(csp, name)).toBe(`${name} 'none'`);
    expect(cspDirective(csp, "object-src")).toBe("object-src 'none'");
    for (const key of ["X-Content-Type-Options", "Referrer-Policy", "Permissions-Policy", "Strict-Transport-Security"]) {
      expect(headers[key]).toBe(site[key]);
    }
  });

  it.each(["/app", "/app/(.*)", "/login", "/share/(.*)", "/embed/debate-timer"])(
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
