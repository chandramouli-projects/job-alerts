// Strict filter tests. Each fake job is built to prove one rule, and every test lists by hand
// exactly which jobs must show: no more, no fewer. The job count must match the cards. TC-F-xx
import { test, expect } from "@playwright/test";
import { signupApi, saveUser, blankUser, openLoggedIn, makeJob } from "./helpers.js";

const H = 36e5, iso = ms => new Date(Date.now() - ms).toISOString().slice(0, 19) + "+00:00";
const J = (id, title, age, o = {}) => makeJob(id, { title, posted: iso(age), found: iso(age), ...o });
const JOBS = [
  J("f1", "QA Engineer", 5 * H, { company: "Acme", city_norm: "Hyderabad", location: "Hyderabad, Telangana", exp_min: 2, exp_max: 4, type: "Full-time", source: "LinkedIn", salary: "₹6–9 LPA" }),
  J("f2", "Senior QA Engineer", 30 * H, { company: "Beta", city_norm: "Hyderabad", location: "Hyderabad", exp_min: 7, exp_max: 10, type: "Full–time", source: "Naukri", salary: "₹20–25 LPA" }),
  J("f3", "QA Intern", 48 * H, { company: "Gamma", city_norm: "Pune", location: "Pune", exp_min: 0, exp_max: 1, type: "Internship", source: "Indeed" }),
  J("f4", "Automation Tester", 96 * H, { company: "Delta", city_norm: "Bangalore", location: "Bengaluru, Karnataka", remote: true, exp_min: 3, exp_max: 6, type: "FULLTIME", source: "LinkedIn", salary: "₹12–15 LPA" }),
  J("f5", "Test Analyst", 240 * H, { company: "Epsilon", city_norm: "India", location: "India", type: "", direct: true, source: "Epsilon careers" }),
  J("f6", "Java Developer", 20 * H, { company: "Zeta", city_norm: "Pune", location: "Pune", exp_min: 1, exp_max: 3, type: "Full-time", source: "Naukri", salary: "₹8–10 LPA" }),
  J("f7", "JavaScript Developer", 6 * H, { company: "Eta", city_norm: "Pune", location: "Pune", exp_min: 2, exp_max: 4, type: "Full-time", source: "Indeed" }),
  J("f8", "Penetration Testing Specialist", 3 * H, { company: "Theta", city_norm: "Hyderabad", location: "Hyderabad", type: "Full-time", source: "LinkedIn" }),
  J("f9", "QA Analyst (no date)", 0, { company: "Iota", city_norm: "Hyderabad", location: "Hyderabad", posted: "", found: "" }),
  J("f10", "QA Lead", 2 * H, { company: "Kappa", city_norm: "Chennai", location: "Chennai", exp_min: 5, exp_max: 8, type: "Full-time", source: "LinkedIn" }),
];
const TITLE = Object.fromEntries(JOBS.map(j => [j.id, j.title]));

async function open(page, request, prefs = { roles: ["QA / Testing"], exp: 3, cities: ["Anywhere in India"] }) {
  await page.route("**/jobs.json*", r => r.fulfill({ json: { updated: iso(H), roles: [], live_api: "", jobs: JOBS } }));
  const a = await signupApi(request);
  await saveUser(request, a.token, blankUser(a.email, prefs));
  await openLoggedIn(page, a);
  await expect(page.locator(".resbar")).toBeVisible();
}
// Filters live in a pop-up: open it, pick, "Show N jobs" applies
async function pick(page, id, v) {
  await page.click("#searchForm [data-ftoggle]");
  if (id === "remote") await page.check('#fModal [data-fchk="remote"]'); else await page.selectOption(`#${id}`, String(v));
  await page.click("#fApply");
}
// the jobs on screen must be exactly these, and the count above them must say so
async function expectJobs(page, ids) {
  const got = (await page.locator("#main .job h3").allTextContents()).sort();
  expect(got).toEqual(ids.map(i => TITLE[i]).sort());
  await expect(page.locator(".resbar > span b").first()).toHaveText(String(ids.length));
}
const ALL = (page) => pick(page, "f_forYou", 0);

test.describe("Posted", () => {
  test("TC-F-01 Last 24 hours", async ({ page, request }) => { await open(page, request); await ALL(page); await pick(page, "f_days", 1); await expectJobs(page, ["f1", "f6", "f7", "f8", "f10"]); });
  test("TC-F-02 Last 3 days", async ({ page, request }) => { await open(page, request); await ALL(page); await pick(page, "f_days", 3); await expectJobs(page, ["f1", "f2", "f3", "f6", "f7", "f8", "f10"]); });
  test("TC-F-03 Last 7 days", async ({ page, request }) => { await open(page, request); await ALL(page); await expectJobs(page, ["f1", "f2", "f3", "f4", "f6", "f7", "f8", "f10"]); });
  test("TC-F-04 Last 3 weeks; a job with no date never shows", async ({ page, request }) => { await open(page, request); await ALL(page); await pick(page, "f_days", 21); await expectJobs(page, ["f1", "f2", "f3", "f4", "f5", "f6", "f7", "f8", "f10"]); });
});

test.describe("Job role", () => {
  test("TC-F-05 QA / Testing: all testing jobs, not security (penetration) testing", async ({ page, request }) => {
    await open(page, request); await ALL(page); await pick(page, "f_days", 21); await pick(page, "f_role", "QA / Testing");
    await expectJobs(page, ["f1", "f2", "f3", "f4", "f5", "f10"]);
  });
  test("TC-F-06 Java Developer: not JavaScript", async ({ page, request }) => {
    await open(page, request); await ALL(page); await pick(page, "f_days", 21); await pick(page, "f_role", "Java Developer");
    await expectJobs(page, ["f6"]);
  });
});

test.describe("Experience", () => {
  test("TC-F-07 3 years: no senior, lead or intern jobs; ranges that include 3", async ({ page, request }) => {
    await open(page, request); await ALL(page); await pick(page, "f_days", 21); await pick(page, "f_exp", 3);
    await expectJobs(page, ["f1", "f4", "f5", "f6", "f7", "f8"]);
  });
  test("TC-F-08 6–8 years: senior and lead jobs show; 2–4 and 1–3 year jobs don't", async ({ page, request }) => {
    await open(page, request); await ALL(page); await pick(page, "f_days", 21); await pick(page, "f_exp", 7);
    await expectJobs(page, ["f2", "f4", "f5", "f8", "f10"]);
  });
  test("TC-F-09 with Jobs for me, the Experience filter wins over the saved experience", async ({ page, request }) => {
    await open(page, request); await pick(page, "f_days", 21); await pick(page, "f_exp", 7);
    await expectJobs(page, ["f2", "f4", "f5", "f10"]);
  });
});

test.describe("City and remote", () => {
  test("TC-F-10 City Hyderabad", async ({ page, request }) => { await open(page, request); await ALL(page); await pick(page, "f_days", 21); await pick(page, "f_city", "Hyderabad"); await expectJobs(page, ["f1", "f2", "f8"]); });
  test("TC-F-11 City Bangalore matches 'Bengaluru'", async ({ page, request }) => { await open(page, request); await ALL(page); await pick(page, "f_days", 21); await pick(page, "f_city", "Bangalore"); await expectJobs(page, ["f4"]); });
  test("TC-F-12 Remote only", async ({ page, request }) => { await open(page, request); await ALL(page); await pick(page, "f_days", 21); await pick(page, "remote"); await expectJobs(page, ["f4"]); });
});

test.describe("Salary, type, website, company", () => {
  test("TC-F-13 8 LPA and above (top of the range counts)", async ({ page, request }) => { await open(page, request); await ALL(page); await pick(page, "f_days", 21); await pick(page, "f_minSal", 8); await expectJobs(page, ["f1", "f2", "f4", "f6"]); });
  test("TC-F-14 12 LPA and above", async ({ page, request }) => { await open(page, request); await ALL(page); await pick(page, "f_days", 21); await pick(page, "f_minSal", 12); await expectJobs(page, ["f2", "f4"]); });
  test("TC-F-15 one 'Full-time' option, whatever the site wrote", async ({ page, request }) => {
    await open(page, request); await ALL(page); await pick(page, "f_days", 21);
    await page.click("#searchForm [data-ftoggle]");
    expect(await page.locator("#f_type option").allTextContents()).toEqual(["Any type", "Full-time", "Internship", "Not stated"]);
    await page.keyboard.press("Escape");
    await pick(page, "f_type", "Full-time");
    await expectJobs(page, ["f1", "f2", "f4", "f6", "f7", "f8", "f10"]);
  });
  test("TC-F-16 Posted on: Company site", async ({ page, request }) => { await open(page, request); await ALL(page); await pick(page, "f_days", 21); await pick(page, "f_source", "Company site"); await expectJobs(page, ["f5"]); });
  test("TC-F-17 Company", async ({ page, request }) => { await open(page, request); await ALL(page); await pick(page, "f_days", 21); await pick(page, "f_company", "Acme"); await expectJobs(page, ["f1"]); });
});

test.describe("Together", () => {
  test("TC-F-18 All jobs + QA + 3 years + Last 24 hours (the owner's case)", async ({ page, request }) => {
    await open(page, request); await ALL(page); await pick(page, "f_role", "QA / Testing"); await pick(page, "f_exp", 3); await pick(page, "f_days", 1);
    await expectJobs(page, ["f1"]);
    await expect(page.locator(".fchip")).toHaveText(["All jobs×", "QA / Testing×", "3 years×", "Last 24 hours×"]);
  });
  test("TC-F-19 Newest first sorts by posted time", async ({ page, request }) => {
    await open(page, request); await ALL(page); await pick(page, "f_days", 21); await pick(page, "f_sort", "new");
    expect(await page.locator("#main .job h3").allTextContents()).toEqual(["f10", "f8", "f1", "f7", "f6", "f2", "f3", "f4", "f5"].map(i => TITLE[i]));
  });
  test("TC-F-20 Clear filters brings back the default list", async ({ page, request }) => {
    await open(page, request); await ALL(page); await pick(page, "f_city", "Pune"); await pick(page, "f_exp", 3);
    await page.click("[data-fclear]");
    await expect(page.locator(".fchip")).toHaveCount(0);
    await expectJobs(page, ["f1", "f4"]);   // Jobs for me: QA, 3 years, last 7 days
  });
});
