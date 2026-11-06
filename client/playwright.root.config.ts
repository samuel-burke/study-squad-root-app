import { defineConfig, devices } from "@playwright/test";

const PORT = 4174;

/**
 * Full-stack end-to-end tests: the real server, SQLite database, networking
 * code and RootGateway, with the fake Root host (fake-root/) in place of Root.
 * Several members can be open at once, each in their own browser context.
 *
 * The tests share one server, so they run one at a time, and each uses its own
 * members so earlier tests don't change what later ones see.
 */
export default defineConfig({
  testDir: "./e2e-root",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never", outputFolder: "playwright-report-root" }]]
    : "list",
  outputDir: "test-results-root",
  use: {
    baseURL: `http://localhost:${PORT}`,
    timezoneId: "UTC",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
    viewport: { width: 1280, height: 900 },
  },
  webServer: {
    command:
      "npm run build -w @studyroom/core -w @studyroom/contract -w @studyroom/server --prefix .. && npm run build:fakeroot && node ../scripts/fake-root-host.mjs",
    url: `http://localhost:${PORT}/__fake/state`,
    env: { FAKE_ROOT_PORT: String(PORT) },
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: "pipe",
  },
});
