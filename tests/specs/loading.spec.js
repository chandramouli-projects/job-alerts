// Loading screen on reload: shows while the app starts, then goes away. TC-LOAD-xx
import { test, expect } from "@playwright/test";
import { signupApi, saveUser, blankUser, useFixtures, openLoggedIn } from "./helpers.js";

const SHOTS = process.env.SHOTS_DIR;

test("TC-LOAD-01 the loading screen shows while jobs load, then the app opens", async ({ page, request }) => {
  await useFixtures(page);
  let release;
  const wait = new Promise(r => (release = r));
  await page.route("**/jobs.json*", async r => { await wait; await r.fallback(); });
  const a = await signupApi(request);
  await saveUser(request, a.token, blankUser(a.email, { roles: ["QA / Testing"], exp: 3, cities: ["Hyderabad"], skills: [] }));
  const opened = openLoggedIn(page, a);
  await expect(page.locator("#boot")).toBeVisible();
  await expect(page.locator("#boot .boot-ring")).toBeVisible();
  if (SHOTS) for (const n of [1, 2]) { await page.waitForTimeout(350); await page.screenshot({ path: `${SHOTS}/loading-${n}.png`, clip: { x: 583, y: 284, width: 200, height: 200 } }); }
  release();
  await opened;
  await expect(page.locator("#shell")).toBeVisible();
  await expect(page.locator("#boot")).toHaveCount(0);
});

test("TC-LOAD-02 a broken jobs file still removes the loading screen", async ({ page }) => {
  await page.route("**/jobs.json*", r => r.fulfill({ body: "not json" }));
  await page.goto("/");
  await expect(page.locator("#auth")).toBeVisible();
  await expect(page.locator("#boot")).toHaveCount(0);
});
