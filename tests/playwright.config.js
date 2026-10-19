// Functional tests for the job portal. Run from this folder: npm test
// Uses Playwright's own window-less browser (chromium headless shell), so nothing ever opens on the
// screen, not even the job pages a test clicks; a separate server on port 8091,
// its own accounts file (tests/.tmp) and fake job data, so real accounts and the
// paid job-search quota are never touched.
import { defineConfig, chromium } from "@playwright/test";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

// The window-less browser this Playwright version wants; if that exact one isn't downloaded,
// the newest headless shell already on this computer (so no big download is needed)
function headlessShell() {
  const dir = join(process.env.LOCALAPPDATA || "", "ms-playwright");
  const wanted = chromium.executablePath().match(/chromium-(\d+)/)?.[1];
  if (wanted && existsSync(join(dir, `chromium_headless_shell-${wanted}`))) return undefined;
  const found = existsSync(dir)
    ? readdirSync(dir)
        .filter(d => d.startsWith("chromium_headless_shell-"))
        .sort((a, b) => +b.split("-")[1] - +a.split("-")[1])
        .map(d => [
          join(dir, d, "chrome-win", "headless_shell.exe"),
          join(dir, d, "chrome-headless-shell-win64", "chrome-headless-shell.exe"),
        ])
        .flat()
        .find(existsSync)
    : undefined;
  return found;
}

// TEST_PORT / TEST_TMP let two test runs go at the same time without touching each other
const PORT = +(process.env.TEST_PORT || 8091);

export default defineConfig({
  testDir: "./specs",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  workers: 1, // this computer has little free memory
  retries: 0, // strict: a flaky pass is not a pass
  forbidOnly: true,
  reporter: [
    ["list"],
    ["html", { outputFolder: "reports/html", open: "never" }],
    ["json", { outputFile: "reports/results.json" }],
  ],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    // no channel: the real Edge opens visible windows for pop-ups (they showed up in Alt+Tab while
    // tests ran); the headless shell has no windows at all
    headless: true,
    launchOptions: { executablePath: headlessShell() },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1366, height: 768 } } },
    {
      name: "phone",
      use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
      grep: /@phone/,
    },
  ],
  webServer: {
    command: `node start-server.mjs ${PORT}`,
    url: `http://127.0.0.1:${PORT}/api/ping`,
    reuseExistingServer: false,
    timeout: 20_000,
  },
});
