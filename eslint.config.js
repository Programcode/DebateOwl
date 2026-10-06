import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "coverage", "ios/App/App/public", ".remember"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
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
    // A promise nobody awaits or catches turns a failed write into an
    // unhandled rejection with no message for the user. Type-aware, so it
    // runs on the client app only.
    files: ["src/**/*.{ts,tsx}"],
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
