// Notifications: the bell in the top bar and its panel. TC-NOTE-xx
import { test, expect } from "@playwright/test";
import { signupApi, saveUser, blankUser, useFixtures, openLoggedIn, makeJob } from "./helpers.js";

const DAY = 864e5, HOUR = 36e5;
const QA_HYD = { roles: ["QA / Testing"], exp: 3, cities: ["Hyderabad"], skills: ["selenium"] };
const iso = msAgo => new Date(Date.now() - msAgo).toISOString().slice(0, 19) + "+00:00";

// last visit 2 days ago, so the fixture jobs (found 1 day ago) are new since then
async function start(page, request, extra = {}) {
  await useFixtures(page);
  const a = await signupApi(request);
  await saveUser(request, a.token, { ...blankUser(a.email, QA_HYD), thisVisit: Date.now() - 2 * DAY, createdAt: Date.now(), ...extra });
  await openLoggedIn(page, a);
  await expect(page.locator("#shell")).toBeVisible();
  return a;
}
const bell = page => page.locator("#noteBell");
const items = page => page.locator("#notePanel .np-item");

test("TC-NOTE-01 the bell counts new jobs for me; opening the note shows the newest jobs and marks it read", async ({ page, request }) => {
  const a = await start(page, request);
  await expect(bell(page).locator(".np-badge")).toHaveText("1");
  await bell(page).click();
  await expect(page.locator("#notePanel")).toBeVisible();
  await expect(items(page).first()).toContainText("2 new jobs for you");
  await expect(items(page).first()).toContainText("Best match: QA Automation Engineer at Acme");
  await items(page).first().click();
  await expect(page.locator("#notePanel")).toBeHidden();
  await expect(bell(page).locator(".np-badge")).toHaveCount(0);
  expect(await page.evaluate(() => F.sort)).toBe("new");
  // read on the server too, so every device agrees
  await expect.poll(async () => (await (await request.get("/api/user", { headers: { Authorization: `Bearer ${a.token}` } })).json()).user?.notifications?.items?.[0]?.read).toBe(true);
});

test("TC-NOTE-02 an application update from email becomes a note that opens the job", async ({ page, request }) => {
  await start(page, request, { jobs: { "qa-blr": { stage: "shortlisted", saved: false, notes: "", appliedAt: Date.now() - 3 * DAY,
    history: [{ stage: "applied", at: Date.now() - 3 * DAY }, { stage: "shortlisted", at: Date.now() - HOUR, via: "email" }] } } });
  await bell(page).click();
  const note = items(page).filter({ hasText: "You're shortlisted" });
  await expect(note).toContainText("Zeta shortlisted you for QA Engineer.");
  await note.click();
  await expect(page.locator("#sheet")).toHaveClass(/open/);
  await expect(page).toHaveURL(/\/job\?id=qa-blr/);
});

test("TC-NOTE-03 a job saved 2+ days ago and not applied gets one reminder", async ({ page, request }) => {
  await start(page, request, { jobs: { "qa-hyd": { stage: null, saved: true, savedAt: Date.now() - 3 * DAY, notes: "", history: [] } } });
  await bell(page).click();
  await expect(items(page).filter({ hasText: "Apply before it closes" })).toContainText("You saved QA Automation Engineer at Acme 3 days ago.");
  await page.reload();
  await expect(page.locator("#shell")).toBeVisible();
  await bell(page).click();
  await expect(items(page).filter({ hasText: "Apply before it closes" })).toHaveCount(1);   // not again
});

test("TC-NOTE-04 new jobs while the app is open: a toast and a new note", async ({ page, request }) => {
  await start(page, request);
  await page.route("**/jobs.json*", r => r.fulfill({ json: { updated: new Date().toISOString(), roles: [], live_api: "http://127.0.0.1:8091",
    jobs: [makeJob("qa-new", { title: "QA Test Engineer", company: "Okta", city: "Hyderabad", location: "Hyderabad", city_norm: "Hyderabad", exp_min: 2, exp_max: 4, found: iso(0), posted: iso(0) })] } }));
  await page.evaluate(() => checkForNewJobs());
  await expect(page.locator("#toast")).toContainText("1 new job for you");
  await expect(bell(page).locator(".np-badge")).toHaveText("2");
  await bell(page).click();
  await expect(items(page).first()).toContainText("Best match: QA Test Engineer at Okta");
});

test("TC-NOTE-05 settings: turning off 'New jobs for you' stops those notes", async ({ page, request }) => {
  await start(page, request);
  await bell(page).click();
  await page.click("[data-npsettings]");
  await page.locator('[data-npkind="jobs"]').uncheck();
  await page.click("[data-npback]");
  await page.keyboard.press("Escape");
  await page.route("**/jobs.json*", r => r.fulfill({ json: { updated: new Date().toISOString(), roles: [], jobs: [makeJob("qa-new2", { title: "QA Analyst", city: "Hyderabad", location: "Hyderabad", city_norm: "Hyderabad", found: iso(0) })] } }));
  await page.evaluate(() => checkForNewJobs());
  await expect(bell(page).locator(".np-badge")).toHaveText("1");   // only the first note, nothing new
});

test("TC-NOTE-06 mark all as read, the Unread tab, and Esc to close", async ({ page, request }) => {
  await start(page, request, { jobs: { "qa-hyd": { stage: null, saved: true, savedAt: Date.now() - 3 * DAY, notes: "", history: [] } } });
  await expect(bell(page).locator(".np-badge")).toHaveText("2");
  await bell(page).click();
  await page.click("[data-npreadall]");
  await expect(bell(page).locator(".np-badge")).toHaveCount(0);
  await page.click('[data-nptab="unread"]');
  await expect(page.locator("#notePanel .np-empty")).toContainText("You're all caught up");
  await page.keyboard.press("Escape");
  await expect(page.locator("#notePanel")).toBeHidden();
});

test("TC-NOTE-07 nothing new: the panel says so @phone", async ({ page, request }) => {
  await useFixtures(page);
  const a = await signupApi(request);
  await saveUser(request, a.token, { ...blankUser(a.email, QA_HYD), createdAt: Date.now() });
  await openLoggedIn(page, a);
  await expect(bell(page)).toBeVisible();
  await expect(bell(page).locator(".np-badge")).toHaveCount(0);
  await bell(page).click();
  await expect(page.locator("#notePanel .np-empty")).toContainText("No notifications yet");
  const vp = page.viewportSize();
  if (vp.width <= 560) await expect.poll(async () => { const b = await page.locator("#notePanel").boundingBox(); return Math.round(b.y + b.height); }).toBe(vp.height);   // a sheet from the bottom on phones
});

test("TC-NOTE-08 a day after joining, one tip to add a resume; it opens the profile", async ({ page, request }) => {
  await start(page, request, { createdAt: Date.now() - 2 * DAY });
  await bell(page).click();
  await items(page).filter({ hasText: "Add your resume" }).click();
  await expect(page).toHaveURL(/\/profile$/);
});
