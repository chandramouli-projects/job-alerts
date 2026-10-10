// Jobs feed: "Jobs for me" rules, filters, search and live search. TC-JOB-xx, TC-FLT-xx, TC-LIVE-xx
import { test, expect } from "@playwright/test";
import { signupApi, saveUser, blankUser, useFixtures, openLoggedIn, jobTitles, makeJob } from "./helpers.js";

const QA_HYD = { roles: ["QA / Testing"], exp: 3, cities: ["Hyderabad"], skills: ["selenium"] };
let calls;

async function start(page, request, prefs = QA_HYD, live = {}) {
  calls = await useFixtures(page, { live });
  const a = await signupApi(request);
  await saveUser(request, a.token, blankUser(a.email, prefs));
  await openLoggedIn(page, a);
  await expect(page.locator("#shell")).toBeVisible();
  await expect(page.locator(".resbar")).toBeVisible();
  return a;
}
const filter = async (page, id, value) => {
  if (!(await page.locator("#fpanel").isVisible())) await page.click("[data-ftoggle]");
  await page.selectOption(`#${id}`, String(value));
};

test.describe("Jobs for me", () => {
  test("TC-JOB-01 shows only jobs that fit role, experience, city and date", async ({ page, request }) => {
    await start(page, request);
    const titles = await jobTitles(page);
    expect(titles).toContain("QA Automation Engineer");
    for (const hidden of ["Senior QA Engineer", "QA Intern", "Test Engineer", "Remote QA Tester", "QA Engineer", "Java Developer"])
      expect(titles, `${hidden} must not be in Jobs for me`).not.toContain(hidden);
  });

  test("TC-JOB-02 the best fit comes first and is labelled", async ({ page, request }) => {
    await start(page, request);
    const first = page.locator("#main .job").first();
    await expect(first.locator("h3")).toHaveText("QA Automation Engineer");
    await expect(first.locator(".match")).toHaveText(/Great fit|Good fit/);
  });

  test("TC-JOB-03 Remote as the only city shows remote jobs", async ({ page, request }) => {
    await start(page, request, { ...QA_HYD, cities: ["Remote"] });
    expect(await jobTitles(page)).toEqual(["Remote QA Tester"]);
  });

  test("TC-JOB-04 'Java Developer' does not match a JavaScript job", async ({ page, request }) => {
    await start(page, request, { roles: ["Java Developer"], exp: 3, cities: ["Pune"], skills: [] });
    const titles = await jobTitles(page);
    expect(titles).toContain("Java Developer");
    expect(titles, "JavaScript is a different skill from Java").not.toContain("JavaScript Developer");
  });

  test("TC-JOB-05 text from job sites is shown as text, never run as code", async ({ page, request }) => {
    await start(page, request);
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
    await expect(page.locator("#main .job h3", { hasText: "onerror" })).toHaveCount(1);
  });

  test("TC-JOB-06 an Apply link is always a web address (http/https)", async ({ page, request }) => {
    await start(page, request);
    const hrefs = await page.locator("#main a.apply").evaluateAll(a => a.map(x => x.getAttribute("href")));
    for (const h of hrefs) expect(h, "javascript: links must never reach the page").toMatch(/^https?:\/\//);
  });
});

test.describe("Filters", () => {
  test("TC-FLT-01 'All jobs' shows every job from the last 7 days", async ({ page, request }) => {
    await start(page, request);
    await filter(page, "f_forYou", 0);
    const titles = await jobTitles(page);
    expect(titles).toHaveLength(8);                       // 9 jobs, 1 is 10 days old
    expect(titles).not.toContain("Test Engineer");
  });

  test("TC-FLT-02 'Last 3 weeks' brings back the older job", async ({ page, request }) => {
    await start(page, request);
    await filter(page, "f_forYou", 0);
    await filter(page, "f_days", 21);
    expect(await jobTitles(page)).toContain("Test Engineer");
  });

  test("TC-FLT-03 a City filter wins over the saved city", async ({ page, request }) => {
    await start(page, request);
    await filter(page, "f_city", "Bangalore");
    expect(await jobTitles(page)).toEqual(["QA Engineer"]);
  });

  test("TC-FLT-04 Remote only", async ({ page, request }) => {
    await start(page, request);
    await filter(page, "f_forYou", 0);
    await page.check('[data-fchk="remote"]');
    expect(await jobTitles(page)).toEqual(["Remote QA Tester"]);
  });

  test("TC-FLT-05 salary 12 LPA and above", async ({ page, request }) => {
    await start(page, request);
    await filter(page, "f_forYou", 0);
    await filter(page, "f_minSal", 12);
    expect(await jobTitles(page)).toEqual(["QA Engineer"]);
  });

  test("TC-FLT-06 experience filter (3 years) hides senior AND intern jobs, like Jobs for me", async ({ page, request }) => {
    await start(page, request);
    await filter(page, "f_forYou", 0);
    await filter(page, "f_exp", 3);
    const titles = await jobTitles(page);
    expect(titles).not.toContain("Senior QA Engineer");
    expect(titles, "an internship is not for someone with 3 years").not.toContain("QA Intern");
  });

  test("TC-FLT-07 Clear filters puts everything back", async ({ page, request }) => {
    await start(page, request);
    const before = await jobTitles(page);
    await filter(page, "f_city", "Bangalore");
    await page.click("[data-fclear]");
    expect(await jobTitles(page)).toEqual(before);
  });
});

test.describe("Search and live search", () => {
  const NURSE = { nurse: [makeJob("nurse-1", { title: "Staff Nurse", company: "Apollo", location: "Chennai, Tamil Nadu", city_norm: "Chennai", city: "Chennai" })] };

  test("TC-LIVE-01 opening the app fetches fresh jobs for my role and city", async ({ page, request }) => {
    await start(page, request);
    await expect.poll(() => calls.length).toBeGreaterThan(0);
    expect(calls).toContainEqual({ q: "QA Testing", where: "Hyderabad" });
  });

  test("TC-LIVE-02 searching any role shows the jobs found for it", async ({ page, request }) => {
    await start(page, request, QA_HYD, NURSE);
    await page.fill("#q", "Nurse jobs in Chennai");
    await page.click("#searchForm button");
    await expect(page.locator("#main .job h3", { hasText: "Staff Nurse" })).toBeVisible();
    expect(calls).toContainEqual({ q: "Nurse", where: "Chennai" });
  });

  test("TC-LIVE-03 the same search twice asks the job sites only once", async ({ page, request }) => {
    await start(page, request, QA_HYD, NURSE);
    for (let i = 0; i < 2; i++) {
      await page.fill("#q", "Nurse jobs in Chennai");
      await page.click("#searchForm button");
      await page.waitForTimeout(300);
    }
    expect(calls.filter(c => c.q === "Nurse")).toHaveLength(1);
  });

  test("TC-LIVE-04 a search with no results says so", async ({ page, request }) => {
    await start(page, request);
    await page.fill("#q", "Zookeeper jobs in Leh");
    await page.click("#searchForm button");
    await expect(page.locator(".empty h3")).toHaveText("No jobs match right now");
  });
});
