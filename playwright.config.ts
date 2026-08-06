// ============================================================
// Playwright — Stripe production-reliability suite.
//
// Drives a REAL browser against a REAL dev server in Stripe TEST mode. The
// suite exists to prove one thing that unit tests cannot: a payment that
// succeeds is never lost, however the customer's browser behaves afterwards.
//
// Run with:  npm run test:e2e     (see scripts in package.json)
// Requires a dev server on E2E_BASE_URL with STRIPE_WEBHOOK_SECRET set —
// tests/e2e/README.md has the exact command.
// ============================================================

import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3100";

export default defineConfig({
  testDir: "./tests/e2e",
  // Payment flows talk to Stripe over the network; be patient but bounded.
  timeout: 120_000,
  expect: { timeout: 20_000 },
  // Serial: every test shares one live Supabase project, and the recovery
  // tests assert on rows they created. Parallel runs would interleave them.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["json", { outputFile: "test-results/e2e-results.json" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
