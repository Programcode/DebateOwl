import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      provider: "v8",
      // Omit `all` intentionally: this is a selected-scope gate for the audited
      // runtime modules below, not a misleading sitewide coverage claim.
      include: [
        "src/lib/ai/client.ts",
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
        // Branch/function thresholds are calibrated to the selected-scope baseline.
        branches: 80,
        functions: 89,
        lines: 90,
      },
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
