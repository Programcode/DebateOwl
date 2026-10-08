import { defineConfig, loadEnv, type Plugin, type PluginOption } from "vite";
import react from "@vitejs/plugin-react-swc";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
 * The built index.html names the landing page as its canonical URL, and Vercel
 * serves it for every route. Public routes listed in sitemap.xml get their own
 * copy of the shell at `<route>/index.html` naming themselves instead; Vercel
 * serves a real file before the SPA rewrite. Google advises against changing a
 * canonical from JavaScript, so this happens at build time.
 */
const SELF_CANONICAL_ROUTES = ["/terms", "/privacy"];
const SITE_ORIGIN = "https://debate.pi-stack.org";

function selfCanonicalShells(): Plugin {
  return {
    name: "self-canonical-shells",
    apply: (_config, env) => env.command === "build",
    writeBundle(options) {
      const outDir = options.dir ?? "dist";
      const shell = readFileSync(path.join(outDir, "index.html"), "utf8");
      const canonical = `<link rel="canonical" href="${SITE_ORIGIN}/" />`;
      const ogUrl = `<meta property="og:url" content="${SITE_ORIGIN}/" />`;
      if (!shell.includes(canonical) || !shell.includes(ogUrl)) {
        throw new Error("index.html no longer carries the landing canonical and og:url tags this plugin rewrites");
      }
      for (const route of SELF_CANONICAL_ROUTES) {
        const html = shell
          .replace(canonical, `<link rel="canonical" href="${SITE_ORIGIN}${route}" />`)
          .replace(ogUrl, `<meta property="og:url" content="${SITE_ORIGIN}${route}" />`);
        mkdirSync(path.join(outDir, route), { recursive: true });
        writeFileSync(path.join(outDir, route, "index.html"), html);
      }
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
    proxy,
    allowedHosts,
  },
  preview: {
    proxy,
    allowedHosts,
  },
  plugins: [react(), bundleGraph(), selfCanonicalShells(), ...uploadSourceMaps],
  define: {
    "import.meta.env.VITE_SENTRY_RELEASE": JSON.stringify(release ?? ""),
    "import.meta.env.VITE_SENTRY_ENVIRONMENT": JSON.stringify(process.env.VERCEL_ENV ?? ""),
  },
  optimizeDeps: {
    // Narrows dev prebundling to the SPA entry. Without this, Vite crawls all
    // 84 HTML files under the root, including the prerendered pages in public/.
    entries: ['index.html'],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    manifest: true,
    chunkSizeWarningLimit: 700,
    sourcemap: uploadSourceMaps.length > 0 ? "hidden" : false,
  },
  };
});
