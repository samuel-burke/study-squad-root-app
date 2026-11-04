import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "feedback-relay",
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
