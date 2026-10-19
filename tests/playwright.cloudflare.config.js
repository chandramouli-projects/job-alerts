// The same account, login and resume tests, run against the live site's accounts code
// (functions/api on Cloudflare) instead of backend/server/server.mjs. Run from this folder:
//   npx playwright test -c playwright.cloudflare.config.js
import base from "./playwright.config.js";
import { defineConfig } from "@playwright/test";

const PORT = 8093;
export default defineConfig({
  ...base,
  testMatch: [
    "api.spec.js",
    "auth.spec.js",
    "resume.spec.js",
    "cloudflare.spec.js",
    "push.cloudflare.js",
    "gmail.cloudflare.js",
  ],
  // only on the computer server: Gmail tracking, live search through /search, and serving files
  grepInvert: /TC-MAIL|TC-SEC-0[2367]|TC-RES-08/,
  reporter: [["list"]],
  use: { ...base.use, baseURL: `http://127.0.0.1:${PORT}` },
  projects: [base.projects[0]],
  webServer: {
    command: `node start-cloudflare.mjs ${PORT}`,
    url: `http://127.0.0.1:${PORT}/api/ping`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
