import { defineConfig, loadEnv, type Connect, type Plugin, type PluginOption } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "path";
import { STAGING_PREVIEW_PROXY_PATH, SUPABASE_PROJECTS } from "./src/lib/supabase/projects";

function buildRelease(): string | undefined {
  const fromEnv = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA;
  if (fromEnv) return fromEnv;
  try {
    return execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim() || undefined;
  } catch {
    // Docker builds exclude .git; events then carry no release.
    return undefined;
  }
}

/**
 * Uploads hidden source maps to Sentry and deletes them from the output. Runs
 * only when all three Sentry build variables are set; otherwise the build emits
 * no source maps, as before.
 */
function sentrySourceMaps(release: string | undefined): PluginOption[] {
  const { SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT } = process.env;
  if (!SENTRY_AUTH_TOKEN || !SENTRY_ORG || !SENTRY_PROJECT || !release) return [];
  return [sentryVitePlugin({
    authToken: SENTRY_AUTH_TOKEN,
    org: SENTRY_ORG,
    project: SENTRY_PROJECT,
    release: { name: release, setCommits: false },
    sourcemaps: { filesToDeleteAfterUpload: ["./dist/**/*.map"] },
    telemetry: false,
  })];
}

function bundleGraph(): Plugin {
  return {
    name: 'bundle-graph',
    apply: 'build',
    generateBundle(_options, bundle) {
      const chunks = Object.fromEntries(Object.values(bundle)
        .filter((output) => output.type === 'chunk')
        .map((chunk) => [chunk.fileName, {
          imports: chunk.imports,
          modules: Object.keys(chunk.modules),
        }]));
      this.emitFile({
        type: 'asset',
        fileName: '.vite/bundle-graph.json',
        source: JSON.stringify(chunks, null, 2),
      });
    },
  };
}

/**
 * Vercel serves dist/embed/debate-timer/index.html at /embed/debate-timer. The
 * dev and preview servers would answer that path with the SPA shell instead,
 * so they get the same mapping.
 */
function embedPages(): Plugin {
  const toIndex: Connect.NextHandleFunction = (req, _res, next) => {
    const match = req.url?.match(/^(\/embed\/[\w-]+)\/?(\?.*)?$/);
    if (match) req.url = `${match[1]}/index.html${match[2] ?? ''}`;
    next();
  };
  return {
    name: 'embed-pages',
    configureServer: (server) => { server.middlewares.use(toIndex); },
    configurePreviewServer: (server) => { server.middlewares.use(toIndex); },
  };
}

/**
 * Vercel answers app routes with app-shell.html (the `rewrites` in vercel.json),
 * while vite preview would answer them with the prerendered landing page. The
 * preview server gets the same rewrites, so the offline test and local
 * measurements load what production serves.
 */
function appShellRewrites(): Plugin {
  const outDir = path.resolve(__dirname, "dist");
  const { rewrites = [] } = JSON.parse(readFileSync(path.resolve(__dirname, "vercel.json"), "utf8")) as {
    rewrites?: Array<{ source: string; destination: string }>;
  };
  const routes = rewrites.map(({ source, destination }) => {
    // vercel.json uses only exact paths and a trailing `/:path*` (any rest of the path).
    const exact = source.replace(/\/:path\*$/, "");
    if (exact.includes(":")) throw new Error(`appShellRewrites cannot read the vercel.json source ${source}`);
    const rest = exact === source ? "" : "(?:/.*)?";
    return { pattern: new RegExp(`^${exact.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}${rest}$`), destination };
  });
  return {
    name: "app-shell-rewrites",
    configurePreviewServer: (server) => {
      server.middlewares.use((req, _res, next) => {
        const [pathname, query] = (req.url ?? "").split("?", 2);
        // Vercel serves files before rewrites, so a prerendered page (/expocit/sources) wins.
        if (existsSync(path.join(outDir, pathname, "index.html"))) return next();
        const route = routes.find(({ pattern }) => pattern.test(pathname));
        if (route) req.url = `${route.destination}${query === undefined ? "" : `?${query}`}`;
        next();
      });
    },
  };
}

/**
 * What the service worker downloads when it installs, beyond the app shell's
 * own scripts and styles: the signed-in layout, the pages a student should be
 * able to open offline after one visit, and the other languages' strings. Each
 * key must exist in the Vite manifest, so a renamed page fails the build
 * instead of quietly dropping out of offline use.
 */
const OFFLINE_MODULES = [
  // The landing page's HTML is precached too; without its code it would turn into the error page.
  "src/pages/LandingPage.tsx",
  "src/components/layout/AppLayout.tsx",
  "src/pages/HomePage.tsx",
  "src/pages/LibraryPage.tsx",
  "src/pages/HistoryPage.tsx",
  "src/pages/TimerPage.tsx",
  "src/pages/SettingsPage.tsx",
  "src/locales/es.json",
  "src/locales/tools/es.json",
  "src/locales/hu.json",
  "src/locales/tools/hu.json",
];
// The Latin subsets of Nunito (body) and Fredoka (headings, buttons) cover English, Spanish and
// Hungarian. JetBrains Mono only draws timers, so it loads on first use.
const OFFLINE_FONTS = /^assets\/(?:nunito|fredoka)-latin(?:-ext)?-wght-normal-[\w-]+\.woff2$/;
// The owl poses the offline pages show: Home points, Library reads, History sleeps, the Timer
// holds a stopwatch, loaders have an idea, errors look surprised.
const OFFLINE_OWLS = /^assets\/owl-(?:point|reading|sleepy|timekeeper|idea|surprised)-[\w-]+\.svg$/;
const SERVICE_WORKER_BUILD = "const BUILD = { id: 'dev', assets: [] };";

/** Writes this build's precache list and cache id into dist/sw.js. */
function serviceWorkerPrecache(): Plugin {
  return {
    name: "service-worker-precache",
    apply: "build",
    writeBundle(options, bundle) {
      const outDir = options.dir ?? path.resolve(__dirname, "dist");
      const manifest = JSON.parse(readFileSync(path.join(outDir, ".vite/manifest.json"), "utf8")) as Record<string, { file: string; css?: string[]; imports?: string[] }>;
      const files = new Set<string>();
      const visit = (key: string) => {
        const entry = manifest[key];
        if (!entry) throw new Error(`serviceWorkerPrecache: the Vite manifest has no entry for ${key}`);
        if (files.has(entry.file)) return;
        files.add(entry.file);
        for (const css of entry.css ?? []) files.add(css);
        for (const imported of entry.imports ?? []) visit(imported);
      };
      visit("index.html");
      OFFLINE_MODULES.forEach(visit);
      // The shell's stylesheet and preloads, exactly as index.html links them.
      const shell = readFileSync(path.join(outDir, "index.html"), "utf8");
      for (const [, file] of shell.matchAll(/(?:href|src)="\/(assets\/[^"]+)"/g)) files.add(file);
      for (const file of Object.keys(bundle)) if (OFFLINE_FONTS.test(file) || OFFLINE_OWLS.test(file)) files.add(file);

      const assets = [...files].sort().map((file) => `/${file}`);
      const workerPath = path.join(outDir, "sw.js");
      const worker = readFileSync(workerPath, "utf8");
      if (!worker.includes(SERVICE_WORKER_BUILD)) throw new Error(`serviceWorkerPrecache: public/sw.js no longer contains ${SERVICE_WORKER_BUILD}`);
      // The unhashed files the worker serves cache-first (theme-init.js, the
      // icons and images) change the id too, so a deploy that changes only
      // them still ships a new worker.
      const hash = createHash("sha256").update(worker).update(assets.join("\n"));
      const publicDir = path.resolve(__dirname, "public");
      for (const file of readdirSync(publicDir).filter((name) => /\.(?:js|png|ico|jpg|svg|webmanifest)$/.test(name) && name !== "sw.js").sort()) {
        hash.update(file).update(readFileSync(path.join(publicDir, file)));
      }
      const id = hash.digest("hex").slice(0, 12);
      writeFileSync(workerPath, worker.replace(SERVICE_WORKER_BUILD, `const BUILD = ${JSON.stringify({ id, assets })};`));
    },
  };
}

/**
 * `npm run dev:preview` sets VITE_STAGING_PREVIEW=true, which makes the app call
 * Supabase at /__staging-supabase on its own origin (see src/lib/supabase/env.ts). Forward
 * that path to the staging project. Other builds get no proxy.
 */
function stagingPreviewProxy(stagingPreview: boolean) {
  if (!stagingPreview) return undefined;
  return {
    [`^${STAGING_PREVIEW_PROXY_PATH}/`]: {
      target: SUPABASE_PROJECTS.staging.url,
      changeOrigin: true,
      ws: true,
      rewrite: (requestPath: string) => requestPath.slice(STAGING_PREVIEW_PROXY_PATH.length),
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // src/lib/supabase/env.ts rejects any other value at startup; fail the build
  // instead, so a typo in a Vercel variable never deploys a blank app.
  const viteEnv = loadEnv(mode, process.cwd(), "VITE_");
  const pinnedEnv = viteEnv.VITE_SUPABASE_ENV?.trim();
  if (pinnedEnv && pinnedEnv !== "production" && pinnedEnv !== "staging") {
    throw new Error(`VITE_SUPABASE_ENV must be "production" or "staging", not "${pinnedEnv}"`);
  }
  const release = buildRelease();
  const uploadSourceMaps = sentrySourceMaps(release);
  // Read the flag the way the client sees it (process env plus .env files), so
  // the app never targets the proxy path while the server lacks the proxy.
  const stagingPreview = viteEnv.VITE_STAGING_PREVIEW === "true";
  const proxy = stagingPreviewProxy(stagingPreview);
  // Previews are reached through `tailscale serve`, which forwards the tailnet
  // hostname. Vite rejects unknown hosts, so allow tailnet names in this mode only.
  const allowedHosts = stagingPreview ? [".ts.net"] : undefined;
  return {
  base: '/',
  server: {
    host: "::",
    port: Number(process.env.PORT) || 8080,
    hmr: {
      overlay: false,
    },
    // Playwright writes trace pages (.html) under .verify/ while a recipe runs;
    // watching them reloaded the app in the middle of tests.
    watch: {
      ignored: ['**/.verify/**', '**/.ci-failures/**'],
    },
    proxy,
    allowedHosts,
  },
  preview: {
    proxy,
    allowedHosts,
  },
  plugins: [react(), tailwindcss(), bundleGraph(), embedPages(), appShellRewrites(), serviceWorkerPrecache(), ...uploadSourceMaps],
  define: {
    "import.meta.env.VITE_SENTRY_RELEASE": JSON.stringify(release ?? ""),
    "import.meta.env.VITE_SENTRY_ENVIRONMENT": JSON.stringify(process.env.VERCEL_ENV ?? ""),
  },
  optimizeDeps: {
    // Narrows dev prebundling to the SPA entry. Without this, Vite crawls every
    // HTML file under the root, including the static guide pages in public/.
    entries: ['index.html', 'embed/debate-timer/index.html'],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    manifest: true,
    rollupOptions: {
      // The embeddable timer is its own page, so it never loads the app's entry.
      input: { main: path.resolve(__dirname, 'index.html'), embedTimer: path.resolve(__dirname, 'embed/debate-timer/index.html') },
    },
    chunkSizeWarningLimit: 700,
    sourcemap: uploadSourceMaps.length > 0 ? "hidden" : false,
  },
  };
});
