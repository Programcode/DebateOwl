import { defineConfig } from "vitest/config";
import path from "path";

// Guards only. Behavior is proven end to end (Playwright, agentic tests, the
// verify-debatelab skill); docs/testing.md says why. Each file here enforces a
// repo policy that no browser run sees: Claude-only model routing, Vercel
// security headers, server-owned quota and billing, the production-target
// refusals, catalog parity across languages, and the SEO content rules. Add a
// file only for a rule of that kind, and list it below.
export default defineConfig({
  test: {
    environment: "node",
    include: [
      "src/test/ai/anthropic-only-guard.test.ts",
      "src/test/checkout-security.test.ts",
      "src/test/i18n-keys.test.ts",
      "src/test/i18n-untranslated.test.ts",
      "src/test/i18n.test.ts",
      "src/test/scripts/staging-sync.test.ts",
      "src/test/security-hardening.test.ts",
      "src/test/seo/comparison-templating.test.ts",
      "src/test/seo/guide-content.test.ts",
      "src/test/stripe-account-presence.test.ts",
      "src/test/supabase/pinned-env.test.ts",
      "src/test/vercel-deployment-config.test.ts",
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
