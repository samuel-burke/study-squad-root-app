import { defineConfig, devices } from "@playwright/test";

const PORT = 4175;

/**
 * The Discord Activity end to end: the real Discord host, server and client
 * build, against a fake Discord API (scripts/discord-dev-host.mjs).
 */
export default defineConfig({
  testDir: "./e2e-discord",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never", outputFolder: "playwright-report-discord" }]]
    : "list",
  outputDir: "test-results-discord",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    timezoneId: "UTC",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
    viewport: { width: 1280, height: 900 },
  },
  webServer: {
    command:
      "npm run build -w @studyroom/core -w @studyroom/contract -w @studyroom/server -w @studyroom/discord --prefix .. && npm run build:discord && node ../scripts/discord-dev-host.mjs",
    url: `http://127.0.0.1:${PORT}/healthz`,
    env: { DISCORD_DEV_PORT: String(PORT), VITE_DISCORD_CLIENT_ID: "0" },
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: "pipe",
  },
});
