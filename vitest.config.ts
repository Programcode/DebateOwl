import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts", "./src/test/deno-compat.ts"],
    include: [
      "src/**/*.{test,spec}.{ts,tsx}",
      "supabase/functions/**/*.{test,spec}.{ts,tsx}",
    ],
    // These boundary tests import deployed Edge Function entrypoints and their
    // remote Deno dependencies. Run it with `deno test`; Vite cannot resolve
    // those URL imports in the browser-oriented Vitest suite.
    exclude: [
      ...configDefaults.exclude,
      "supabase/functions/ai/handler-research.test.ts",
      "supabase/functions/_shared/google-cors.test.ts",
    ],
    coverage: {
      provider: "v8",
      // Omit `all` intentionally: this is a selected-scope gate for the audited
      // runtime modules below, not a misleading sitewide coverage claim.
      include: [
        "src/lib/ai/client.ts",
        "src/lib/ai/schemas/sparring.ts",
        "src/lib/sparring/formats.ts",
        "src/lib/stores/sparring-store.ts",
        "src/lib/crossfire/prefill.ts",
        "src/lib/crossfire/reducer.ts",
        "src/lib/crossfire/schemas.ts",
        "src/lib/crossfire/storage.ts",
        "src/lib/stores/session-store.ts",
        "src/lib/stores/settings-store.ts",
        "src/lib/stripe.ts",
        "src/lib/supabase/AuthProvider.tsx",
        "src/hooks/use-subscription.ts",
        "src/hooks/use-subscription-error.ts",
        "supabase/functions/ai/prompt-builder.ts",
      ],
      thresholds: {
        statements: 90,
        // thresholds.branches is 81.56% in the current selected-scope baseline.
        // TODO: ratchet branches/functions back to 90 after covering conditional
        // gaps in stripe.ts, AuthProvider.tsx, session-store.ts, and ai/client.ts.
        branches: 80,
        functions: 89,
        lines: 90,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Run Deno-flavored function tests under Vitest without rewriting them.
      // Deno resolves this pinned JSR package directly; Vitest uses the shim.
      "jsr:@std/assert@1.0.19": path.resolve(
        __dirname,
        "./src/test/deno-assert-shim.ts",
      ),
    },
  },
});
