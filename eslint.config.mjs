import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/dist-demo/**",
      "**/dist-fakeroot/**",
      "networking/gen/**",
      "coverage/**",
      "client/test-results/**",
      "client/test-results-root/**",
      "client/test-results-discord/**",
      "client/playwright-report-discord/**",
      "**/dist-discord/**",
      "client/playwright-report-root/**",
      "client/playwright-report/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      eqeqeq: ["error", "always"],
      "no-console": "off",
    },
  },
  {
    // The fake Root host is CommonJS so it can stand in for @rootsdk/server-app via require().
    files: ["fake-root/**/*.cjs"],
    languageOptions: { sourceType: "commonjs" },
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    // The fake Root SDK's browser half.
    files: ["fake-root/client-app.js"],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    // The domain package must stay free of host APIs so it runs in Node and the browser.
    files: ["core/src/**/*.ts"],
    languageOptions: { globals: {} },
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: ["node:*", "fs", "path", "react", "@rootsdk/*", "knex"] },
      ],
    },
  },
  {
    files: ["client/**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
    },
  },
  {
    files: ["**/test/**/*.{ts,tsx}", "**/e2e/**/*.ts"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
);
