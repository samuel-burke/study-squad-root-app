import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: ["core", "contract", "server", "client", "feedback-relay", "discord"],
    coverage: {
      provider: "v8",
      include: [
        "core/src/**/*.ts",
        "contract/src/**/*.ts",
        "server/src/**/*.ts",
        "client/src/**/*.{ts,tsx}",
        "discord/src/**/*.ts",
      ],
      exclude: [
        "**/*.d.ts",
        "**/index.ts",
        "client/src/main.tsx",
        "server/src/main.ts",
        "discord/src/main.ts",
      ],
      reporter: ["text-summary", "json-summary", "html", "lcov"],
    },
  },
});
