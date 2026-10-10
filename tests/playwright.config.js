// Functional tests for the job portal. Run from this folder: npm test
// Uses the Edge already installed on this computer, a separate server on port 8091,
// its own accounts file (tests/.tmp) and fake job data, so real accounts and the
// paid job-search quota are never touched.
import { defineConfig } from "@playwright/test";

const PORT = 8091;

export default defineConfig({
  testDir: "./specs",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  workers: 1,                      // this computer has little free memory
  retries: 0,                      // strict: a flaky pass is not a pass
  forbidOnly: true,
  reporter: [
    ["list"],
    ["html", { outputFolder: "reports/html", open: "never" }],
    ["json", { outputFile: "reports/results.json" }],
  ],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    channel: "msedge",
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1366, height: 768 } } },
    { name: "phone", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, grep: /@phone/ },
  ],
  webServer: {
    command: `node start-server.mjs ${PORT}`,
    url: `http://127.0.0.1:${PORT}/api/ping`,
    reuseExistingServer: false,
    timeout: 20_000,
  },
});
