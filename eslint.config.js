import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

// The AI core and feature files behind src/lib/ai/client.ts, by alias or
// relative path, with or without an extension. The server's same-named
// modules under supabase/functions/ai/ stay importable.
const aiInternalImport = String.raw`^(?!.*supabase/functions/)(.*/)?ai/(request|errors|sources|text|features(/.*)?)(\.[cm]?[jt]sx?)?/?$`;
const aiInternalMessage = "Import AI requests and errors from @/lib/ai/client.";

export default tseslint.config(
  {
    ignores: [
      "dist", "coverage", ".remember", "packages/**/node_modules", "packages/**/dist",
      "apps/**/node_modules", "apps/mobile/.expo", "apps/mobile/dist", "apps/mobile/ios", "apps/mobile/android",
      "apps/mobile/expo-env.d.ts",
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    ignores: ["packages/**", "apps/**"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    // Shared packages run on the web and in React Native, so they get no
    // browser globals and no web-only libraries. See packages/core/README.md.
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["packages/**/*.ts"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.es2021,
    },
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      "no-restricted-globals": [
        "error",
        ...["window", "document", "localStorage", "sessionStorage", "navigator", "location", "self"].map((name) => ({
          name,
          message: "Shared packages cannot use browser globals. Take the value as a parameter.",
        })),
      ],
      "no-restricted-syntax": [
        "error",
        { selector: "MetaProperty[meta.name='import']", message: "Shared packages cannot use import.meta. Take the value as a parameter." },
      ],
      "no-restricted-imports": [
        "error",
        {
          paths: [
            "react", "react-dom", "react-native", "react-i18next", "zustand", "@supabase/supabase-js", "posthog-js",
            "sonner", "react-router-dom", "reactflow", "lucide-react", "framer-motion", "jspdf", "docx",
          ].map((name) => ({ name, message: "Shared packages stay platform-neutral; keep this in the app." })),
          patterns: [
            { group: ["@sentry/*", "@radix-ui/*"], message: "Shared packages stay platform-neutral; keep this in the app." },
          ],
        },
      ],
    },
  },
  {
    // The Expo app runs in React Native, so it gets no browser globals and no
    // react-refresh rule (Metro has its own Fast Refresh). See apps/mobile/AGENTS.md.
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["apps/mobile/**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.es2021, __DEV__: "readonly" },
    },
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": "off",
      // Metro bundles images through require().
      "@typescript-eslint/no-require-imports": ["error", { allow: ["\\.png$", "\\.wav$"] }],
      "no-restricted-globals": [
        "error",
        ...["window", "document", "localStorage", "sessionStorage", "location"].map((name) => ({
          name,
          message: "The app has no DOM on iOS. Put web-only code in a .web.ts(x) file.",
        })),
      ],
    },
  },
  {
    // The web preview and the Node scripts that drive it may use browser and Node globals.
    files: ["apps/mobile/**/*.web.{ts,tsx}", "apps/mobile/scripts/**/*.ts"],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: { "no-restricted-globals": "off" },
  },
  {
    // A promise nobody awaits or catches turns a failed write into an
    // unhandled rejection with no message for the user. Type-aware, so it
    // runs on the client app and the shared packages only.
    files: ["src/**/*.{ts,tsx}", "packages/**/src/**/*.ts"],
    ignores: ["src/test/**"],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": [
        "error",
        { allowForKnownSafeCalls: [{ from: "package", name: "NavigateFunction", package: "react-router" }] },
      ],
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksConditionals: false, checksVoidReturn: { attributes: false } },
      ],
    },
  },
  {
    // App code imports AI requests and errors through src/lib/ai/client.ts
    // only. The core and feature files behind it are internal.
    files: ["src/**/*.{ts,tsx}", "e2e/**/*.ts", "agentic/**/*.ts"],
    ignores: ["src/lib/ai/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ regex: aiInternalImport, message: aiInternalMessage }] },
      ],
      "no-restricted-syntax": [
        "error",
        {
          // esquery ends a regex at "/", so the pattern spells it as \x2F.
          selector: `ImportExpression[source.value=/${aiInternalImport.replaceAll("/", "\\x2F")}/]`,
          message: aiInternalMessage,
        },
      ],
    },
  },
  {
    // Fixed sleeps pass or fail with machine speed. Wait for a condition.
    files: ["e2e/**/*.ts", "agentic/**/*.ts", ".claude/skills/verify-debatelab/**/*.ts"],
    rules: {
      "no-restricted-properties": [
        "error",
        { property: "waitForTimeout", message: "Wait for a condition (expect(...).toBeVisible(), waitForResponse, expect.poll) instead of a fixed sleep." },
      ],
    },
  },
);
