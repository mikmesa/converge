import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests drive the real app against the local Supabase stack.
 * Each browser context is a separate anonymous identity (a separate person).
 * Run `npm run build` first; the web server uses `next start`.
 */
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"], launchOptions: executablePath ? { executablePath } : {} } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], launchOptions: executablePath ? { executablePath } : {} } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "npx next start -p 3100 -H 127.0.0.1",
        url: "http://127.0.0.1:3100",
        reuseExistingServer: true,
        timeout: 60_000,
      },
});
