import { defineConfig, type Plugin, type PluginOption } from "vite";
import react from "@vitejs/plugin-react-swc";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import { execSync } from "node:child_process";
import path from "path";

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

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const release = buildRelease();
  const uploadSourceMaps = sentrySourceMaps(release);
  return {
  base: mode === 'capacitor' ? './' : '/',
  server: {
    host: "::",
    port: Number(process.env.PORT) || 8080,
    hmr: {
      overlay: false,
    },
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
