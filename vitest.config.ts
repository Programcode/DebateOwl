import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    // Globals and env stubbed with vi.stubGlobal / vi.stubEnv reset after
    // every test, so one test's stub cannot leak into the tests after it.
    unstubGlobals: true,
    unstubEnvs: true,
    // Edge function tests are Deno tests. `npm run test:edge` runs them under
    // the runtime they ship on, so Vitest does not re-run them through a shim.
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
