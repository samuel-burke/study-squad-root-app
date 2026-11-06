import react from "@vitejs/plugin-react";
import { defineProject } from "vitest/config";
import { workspaceAliases } from "../vitest.shared.mts";

export default defineProject({
  plugins: [react()],
  define: { __BUILD_INFO__: JSON.stringify({ version: "test", genVersion: "test" }) },
  resolve: { alias: workspaceAliases },
  test: {
    name: "client",
    environment: "jsdom",
    include: ["test/**/*.test.{ts,tsx}"],
    setupFiles: ["test/setup.ts"],
  },
});
