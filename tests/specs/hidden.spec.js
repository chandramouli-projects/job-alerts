// Hiding jobs: Undo, and the Hidden jobs list to unhide them. TC-HIDE-xx
import { test, expect } from "@playwright/test";
import { signupApi, saveUser, blankUser, useFixtures, openLoggedIn, jobTitles } from "./helpers.js";

const ANY = { roles: ["QA / Testing"], exp: 3, cities: ["Anywhere in India"], skills: [] };
async function start(page, request) {
  await useFixtures(page);
  const a = await signupApi(request);
  await saveUser(request, a.token, blankUser(a.email, ANY));
  await openLoggedIn(page, a);
  await expect(page.locator("#main .job").first()).toBeVisible();
  return a;
}
const card = (page, title) => page.locator("#main .job", { has: page.locator("h3", { hasText: new RegExp(`^${title}$`) }) });

test("TC-HIDE-01 Hide on a card, then Undo brings it back", async ({ page, request }) => {
  await start(page, request);
  await card(page, "QA Engineer").locator("[data-cardhide]").click();
  expect(await jobTitles(page)).not.toContain("QA Engineer");
  await expect(page.locator("#toast")).toContainText("Job hidden");
  await page.locator("#toast .toast-act").click();
  await expect(page.locator("#toast")).toContainText("Back in your feed");
  expect(await jobTitles(page)).toContain("QA Engineer");
});

test("TC-HIDE-02 'N hidden' opens the hidden jobs; Unhide puts one back, and it stays after a reload", async ({ page, request }) => {
  const a = await start(page, request);
  await card(page, "QA Engineer").locator("[data-cardhide]").click();
  await card(page, "Remote QA Tester").locator("[data-cardhide]").click();
  const hiddenOnServer = async () => Object.keys((await (await request.get("/api/user", { headers: { Authorization: `Bearer ${a.token}` } })).json()).user?.hidden || {}).length;
  await expect.poll(hiddenOnServer).toBe(2);
  await page.reload();
  await expect(page.locator("#main .job").first()).toBeVisible();
  await expect(page.locator("[data-showhidden]")).toHaveText("2 hidden");   // kept on the server
  await page.click("[data-showhidden]");
  await expect(page.locator("#sheetTitle")).toHaveText("Hidden jobs");
  await expect(page.locator("#sheet .hj-row b")).toHaveText(["QA Engineer", "Remote QA Tester"]);
  await page.locator("#sheet .hj-row", { hasText: "Remote QA Tester" }).locator("[data-unhide]").click();
  await expect(page.locator("#sheet .hj-row b")).toHaveText(["QA Engineer"]);
  expect(await jobTitles(page)).toContain("Remote QA Tester");
  await expect(page.locator("[data-showhidden]")).toHaveText("1 hidden");
});

test("TC-HIDE-03 'Not interested' in the job details also has Undo", async ({ page, request }) => {
  await start(page, request);
  await page.click('[data-open="qa-blr"]');
  await page.click("#sheet [data-hide]");
  await expect(page.locator("#sheet")).not.toHaveClass(/open/);
  expect(await jobTitles(page)).not.toContain("QA Engineer");
  await page.locator("#toast .toast-act").click();
  expect(await jobTitles(page)).toContain("QA Engineer");
});

test("TC-HIDE-04 pick two jobs, Hide both, then Unhide all", async ({ page, request }) => {
  await start(page, request);
  await card(page, "QA Engineer").locator(".job-pick input").check();
  await card(page, "Remote QA Tester").locator(".job-pick input").check();
  await expect(page.locator(".pick-bar")).toContainText("2 selected");
  await page.click("[data-pickhide]");
  await expect(page.locator("#toast")).toContainText("2 jobs hidden");
  await expect(page.locator(".pick-bar")).toBeHidden();
  await page.click("[data-showhidden]");
  await page.click("[data-unhideall]");
  await expect(page.locator("#toast")).toContainText("2 jobs back in your feed");
  await expect(page.locator("[data-showhidden]")).toHaveCount(0);
  expect(await jobTitles(page)).toEqual(expect.arrayContaining(["QA Engineer", "Remote QA Tester"]));
});

test("TC-HIDE-05 a change made just before leaving the page is still saved", async ({ page, request }) => {
  const a = await start(page, request);
  await card(page, "QA Engineer").locator("[data-cardhide]").click();
  await page.goto("about:blank");   // leave at once, inside the half-second wait
  await expect.poll(async () => Object.keys((await (await request.get("/api/user", { headers: { Authorization: `Bearer ${a.token}` } })).json()).user?.hidden || {})).toEqual(["qa-blr"]);
});
