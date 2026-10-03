import { defineConfig, loadEnv, type Plugin, type PluginOption } from "vite";
import react from "@vitejs/plugin-react-swc";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import { execSync } from "node:child_process";
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
  base: mode === 'capacitor' ? './' : '/',
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
  plugins: [react(), bundleGraph(), ...uploadSourceMaps],
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
