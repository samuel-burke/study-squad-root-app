import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "discord",
    environment: "node",
    include: ["test/**/*.test.ts"],
    globalSetup: ["test/buildForHost.ts"],
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
