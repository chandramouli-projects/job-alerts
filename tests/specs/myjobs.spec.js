// Saved jobs, applications, and data safety in the browser. TC-MY-xx, TC-SEC-1x
import { test, expect } from "@playwright/test";
import { PASSWORD, signupApi, saveUser, blankUser, useFixtures, openLoggedIn, jobTitles } from "./helpers.js";

const QA_HYD = { roles: ["QA / Testing"], exp: 3, cities: ["Hyderabad"], skills: [] };
const auth = t => ({ Authorization: `Bearer ${t}` });

async function start(page, request) {
  await useFixtures(page);
  const a = await signupApi(request);
  await saveUser(request, a.token, blankUser(a.email, QA_HYD));
  await openLoggedIn(page, a);
  await expect(page.locator("#shell")).toBeVisible();
  return a;
}

test("TC-MY-01 saving a job puts it in My jobs > Saved, and it is kept on the server", async ({ page, request }) => {
  const a = await start(page, request);
  await page.click('[data-save="qa-hyd"]');
  await expect(page.locator('[data-save="qa-hyd"]')).toHaveAttribute("aria-pressed", "true");
  await page.click('.side [data-go="mine"]');
  await page.click('[data-stage-tab="saved"]');
  expect(await jobTitles(page)).toEqual(["QA Automation Engineer"]);
  await page.waitForTimeout(800);
  const u = (await (await request.get("/api/user", { headers: auth(a.token) })).json()).user;
  expect(u.jobs["qa-hyd"].saved).toBe(true);
});

test("TC-MY-02 Apply -> 'Did you apply?' -> Yes: the job moves to Applied and leaves the feed", async ({ page, request }) => {
  test.slow();
  await start(page, request);
  const [popup] = await Promise.all([page.waitForEvent("popup"), page.click('a[data-apply="qa-hyd"]')]);
  await page.waitForTimeout(1700);                 // the app asks only after you have been away a moment
  await popup.close();
  await page.bringToFront();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator("#applyModal")).toBeVisible();
  await expect(page.locator("#apJob")).toContainText("QA Automation Engineer");
  await page.click("#apYes");
  await expect(page.locator("#apDone")).toBeVisible();
  await page.click("#apBrowse");
  expect(await jobTitles(page)).not.toContain("QA Automation Engineer");
  await page.click('.side [data-go="mine"]');
  await page.click('[data-stage-tab="applied"]');
  await expect(page.locator(".app h3")).toHaveText(["QA Automation Engineer"]);
});

test("TC-MY-03 'Not yet' keeps the job in the feed", async ({ page, request }) => {
  test.slow();
  await start(page, request);
  const [popup] = await Promise.all([page.waitForEvent("popup"), page.click('a[data-apply="qa-hyd"]')]);
  await page.waitForTimeout(1700);
  await popup.close();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator("#applyModal")).toBeVisible();
  await page.click("#apNo");
  expect(await jobTitles(page)).toContain("QA Automation Engineer");
});

test("TC-MY-04 an applied job can be moved to Interview / Offer / Closed or undone", async ({ page, request }) => {
  const a = await start(page, request);
  await saveUser(request, a.token, { ...blankUser(a.email, QA_HYD), jobs: { "qa-hyd": { stage: "applied", saved: false, notes: "", history: [{ stage: "applied", at: Date.now() }], appliedAt: Date.now() } } });
  await page.reload();
  await page.click('.side [data-go="mine"]');
  await page.click('[data-stage-tab="applied"]');
  await page.locator(".app").first().click();
  const sheet = page.locator("#sheet");
  await expect(sheet).toHaveClass(/open/);
  await expect(sheet.getByRole("button", { name: /Interview/ }), "there should be a way to record an interview").toBeVisible();
});

test.describe("Account and data safety", () => {
  test("TC-SEC-10 anyone who knows an email can reset that account's password", async ({ request }) => {
    const victim = await signupApi(request);
    const { pin } = await (await request.post("/api/forgot", { data: { email: victim.email } })).json();
    const r = await request.post("/api/reset", { data: { email: victim.email, pin, password: "Hacked#1" } });
    expect(r.status(), "the PIN should go to the owner (email/SMS), not to whoever asks").not.toBe(200);
  });

  test("TC-SEC-11 'Forgot password' does not reveal which emails have accounts", async ({ request }) => {
    const a = await signupApi(request);
    const known = await request.post("/api/forgot", { data: { email: a.email } });
    const unknown = await request.post("/api/forgot", { data: { email: "nobody-" + Date.now() + "@example.com" } });
    expect(unknown.status()).toBe(known.status());
  });

  test("TC-SEC-12 changing the password logs out the other devices", async ({ request }) => {
    const a = await signupApi(request);
    const other = (await (await request.post("/api/login", { data: { email: a.email, password: PASSWORD } })).json()).token;
    await request.post("/api/password", { headers: auth(a.token), data: { old: PASSWORD, new: "Changed#1" } });
    expect((await request.get("/api/user", { headers: auth(other) })).status()).toBe(401);
  });

  test("TC-SEC-13 deleting the account asks for the password", async ({ request }) => {
    const a = await signupApi(request);
    expect((await request.delete("/api/user", { headers: auth(a.token) })).status()).not.toBe(200);
  });

  test("TC-SEC-14 log out leaves no personal data in the browser", async ({ page, request }) => {
    await start(page, request);
    await page.click("#headOut");
    await expect(page.locator("#loginView")).toBeVisible();
    const left = await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith("uv.user.")));
    expect(left).toEqual([]);
  });

  test("TC-SEC-15 the GitHub key is not copied to the server", async ({ page, request }) => {
    const a = await start(page, request);
    await page.route("https://api.github.com/**", r => r.fulfill({ status: 401, json: { message: "test" } }));
    await page.evaluate(() => { U.settings.ghToken = "github_pat_TESTSECRET"; saveUser(); });
    await page.waitForTimeout(800);
    const stored = JSON.stringify(await (await request.get("/api/user", { headers: auth(a.token) })).json());
    expect(stored).not.toContain("github_pat_TESTSECRET");
  });

  test("TC-SEC-16 a broken jobs file still shows the log in page", async ({ page }) => {
    await page.route("**/jobs.json*", r => r.fulfill({ json: {} }));
    await page.goto("/");
    await expect(page.locator("#loginView")).toBeVisible();
  });
});
