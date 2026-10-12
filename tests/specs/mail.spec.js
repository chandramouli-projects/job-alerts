// Application status from Gmail emails. TC-MAIL-xx
// The server's mail reader is replaced by tests/fake-mail.mjs, which prints .tmp/mail-events.json.
import { test, expect } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PASSWORD, signupApi, saveUser, blankUser, useFixtures, openLoggedIn, uniqueEmail } from "./helpers.js";

const EVENTS = fileURLToPath(new URL("../.tmp/mail-events.json", import.meta.url));
const OWNER = "mail-owner@example.com";
const auth = t => ({ Authorization: `Bearer ${t}` });
const day = n => new Date(Date.now() - n * 864e5).toISOString();
const ev = (id, stage, company, title, at, site = "LinkedIn") => ({ id, stage, company, title, at, site, subject: `${stage} ${company}` });
const setEmails = list => writeFileSync(EVENTS, JSON.stringify({ events: list }));
const QA = { roles: ["QA / Testing"], exp: 3, cities: ["Hyderabad"] };
const applied = (id, title, company) => ({ stage: "applied", saved: false, notes: "", appliedAt: Date.now() - 5 * 864e5,
  history: [{ stage: "applied", at: Date.now() - 5 * 864e5 }], snap: { id, title, company, location: "Hyderabad", city_norm: "Hyderabad", source: "LinkedIn", url: "https://jobs.example.com/" + id } });

test.describe.configure({ mode: "serial" });
let owner;

test.beforeAll(async ({ request }) => {
  setEmails([]);
  const r = await request.post("/api/signup", { data: { name: "Mail Owner", email: OWNER, password: PASSWORD } });
  owner = { email: OWNER, token: (await r.json()).token };
  await saveUser(request, owner.token, { ...blankUser(OWNER, QA), jobs: { "qa-hyd": applied("qa-hyd", "QA Automation Engineer", "Acme") } });
});

async function openMyJobs(page) {
  await useFixtures(page);
  await openLoggedIn(page, owner);
  await page.click('.side [data-go="mine"]');
  await expect(page.locator(".topbar h1")).toHaveText("My jobs");
}
const card = (page, title) => page.locator(".app", { has: page.locator("h3", { hasText: title }) });

test("TC-MAIL-01 someone without Gmail connected sees no Gmail bar", async ({ page, request }) => {
  const a = await signupApi(request, uniqueEmail("nomail"));
  await saveUser(request, a.token, blankUser(a.email, QA));
  await useFixtures(page);
  await openLoggedIn(page, a);
  await page.click('.side [data-go="mine"]');
  await expect(page.locator(".topbar h1")).toHaveText("My jobs");
  await expect(page.locator(".mailbar")).toHaveCount(0);
  await expect(page.locator("[data-mailsync]")).toHaveCount(0);
});

test("TC-MAIL-02 a 'viewed' email moves the matching application to Viewed", async ({ page, request }) => {
  setEmails([ev("m1", "applied", "Acme Technologies", "QA Automation Engineer", day(5)), ev("m2", "viewed", "Acme Technologies", "", day(2))]);
  expect((await request.post("/api/mail/sync", { headers: auth(owner.token), data: {} })).status()).toBe(200);
  await openMyJobs(page);
  const c = card(page, "QA Automation Engineer");
  await expect(c.locator(".status-pill")).toHaveText("Viewed");
  await expect(c.locator(".stepper li.done b")).toHaveText(["Applied", "Viewed"]);
  await expect(c.locator(".via")).toContainText("from LinkedIn email");
  await expect(page.locator(".app")).toHaveCount(1);          // matched, not added twice
});

test("TC-MAIL-03 an email about an application the app didn't know adds it to My jobs", async ({ page, request }) => {
  setEmails([ev("m3", "shortlisted", "Groww", "SDET", day(1), "Naukri")]);
  await request.post("/api/mail/sync", { headers: auth(owner.token), data: {} });
  await openMyJobs(page);
  const c = card(page, "SDET");
  await expect(c.locator(".meta")).toContainText("Groww");
  await expect(c.locator(".status-pill")).toHaveText("Shortlisted");
});

test("TC-MAIL-04 a rejection email ends it as Not selected, with a red last step", async ({ page, request }) => {
  setEmails([ev("m4", "rejected", "Groww", "SDET", day(0))]);
  await request.post("/api/mail/sync", { headers: auth(owner.token), data: {} });
  await openMyJobs(page);
  const c = card(page, "SDET");
  await expect(c.locator(".status-pill")).toHaveText("Not selected");
  await expect(c.locator(".stepper li.end b")).toHaveText("Not selected");
});

test("TC-MAIL-05 an older email never moves a status back", async ({ page, request }) => {
  setEmails([ev("m5", "applied", "Acme", "QA Automation Engineer", day(9))]);
  await request.post("/api/mail/sync", { headers: auth(owner.token), data: {} });
  await openMyJobs(page);
  await expect(card(page, "QA Automation Engineer").locator(".status-pill")).toHaveText("Viewed");
});

test("TC-MAIL-06 a save from the app does not wipe statuses from email", async ({ request }) => {
  await saveUser(request, owner.token, { ...blankUser(OWNER, QA), jobs: { "qa-hyd": applied("qa-hyd", "QA Automation Engineer", "Acme") } });
  const m = await (await request.get("/api/mail", { headers: auth(owner.token) })).json();
  expect(m.jobs["qa-hyd"].stage).toBe("viewed");
});

test("TC-MAIL-07 Check now reads Gmail again and shows the new status", async ({ page }) => {
  await openMyJobs(page);
  setEmails([ev("m6", "interview", "Acme", "QA Automation Engineer", day(0))]);
  await page.click("[data-mailsync]");
  await expect(card(page, "QA Automation Engineer").locator(".status-pill")).toHaveText("Interview");
  await expect(page.locator(".mailbar")).toContainText("checked just now");
});

test("TC-MAIL-08 another user's account never gets these statuses", async ({ request }) => {
  const a = await signupApi(request, uniqueEmail("other"));
  const m = await (await request.get("/api/mail", { headers: auth(a.token) })).json();
  expect(m).toEqual({ connected: false });
  expect((await request.post("/api/mail/sync", { headers: auth(a.token), data: {} })).status()).toBe(403);
});
