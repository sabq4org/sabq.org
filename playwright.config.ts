import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for e2e/smoke tests.
 *
 * Targets:
 * - Local (default): `npm run dev` on :5000, then `npx playwright test`
 * - Production smoke: PW_BASE_URL=https://sabq.org npx playwright test e2e/smoke.spec.ts
 *   (smoke tests are read-only — safe against production)
 *
 * The authenticated publish-flow spec only runs when E2E_USER/E2E_PASS are set
 * and never against production URLs.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: process.env.PW_BASE_URL || "http://localhost:5000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    locale: "ar-SA",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
