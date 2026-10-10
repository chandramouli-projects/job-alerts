// "Tell us the job you want". TC-OB-xx
import { test, expect } from "@playwright/test";
import { signupApi, useFixtures, openLoggedIn } from "./helpers.js";

const open = (page, k) => page.click(`[data-pkopen="${k}"]`);
const pick = (page, k, v) => page.click(`.pk-opt[data-pkval="${k}"][data-v="${v}"]`);
// a list that stays open covers the next field, so close it the way a person must: click outside
const pickAndClose = async (page, k, v) => {
  await pick(page, k, v);
  if (await page.locator(`.pk[data-pk="${k}"]`).evaluate(e => e.classList.contains("open"))) await page.click("#ob h1");
};
const isOpen = (page, k) => page.locator(`.pk[data-pk="${k}"]`).evaluate(e => e.classList.contains("open"));
const chips = (page, k) => page.locator(`.pk[data-pk="${k}"] .pk-chip`).allTextContents();

test.beforeEach(async ({ page, request }) => {
  await useFixtures(page);
  await openLoggedIn(page, await signupApi(request));
  await expect(page.locator("#ob")).toBeVisible();
});

test("TC-OB-01 Show my jobs stays off until role, experience and city are chosen", async ({ page }) => {
  const go = page.locator("#obNext");
  await expect(go).toBeDisabled();
  await open(page, "role"); await pickAndClose(page, "role", "QA / Testing");
  await expect(go).toBeDisabled();
  await open(page, "exp"); await pickAndClose(page, "exp", "3");
  await expect(go).toBeDisabled();
  await open(page, "city"); await pickAndClose(page, "city", "Hyderabad");
  await expect(go).toBeEnabled();
});

test("TC-OB-02 experience list closes as soon as one is picked", async ({ page }) => {
  await open(page, "exp");
  expect(await isOpen(page, "exp")).toBe(true);
  await pick(page, "exp", "3");
  expect(await isOpen(page, "exp")).toBe(false);
});

test("TC-OB-03 role list closes as soon as a role is picked (owner's rule)", async ({ page }) => {
  await open(page, "role");
  await pick(page, "role", "QA / Testing");
  expect(await isOpen(page, "role"), "the role list should close after picking").toBe(false);
});

test("TC-OB-04 the next list can be opened straight away while one is open", async ({ page }) => {
  test.setTimeout(15_000);
  await open(page, "role");
  await open(page, "city");
  expect(await isOpen(page, "role")).toBe(false);
  expect(await isOpen(page, "city")).toBe(true);
});

test("TC-OB-05 'Anywhere in India' replaces the picked cities, and a city replaces it", async ({ page }) => {
  await open(page, "city");
  await pick(page, "city", "Hyderabad");
  await pick(page, "city", "Anywhere in India");
  expect((await chips(page, "city")).map(c => c.replace("×", "").trim())).toEqual(["Anywhere in India"]);
  await pick(page, "city", "Pune");
  expect((await chips(page, "city")).map(c => c.replace("×", "").trim())).toEqual(["Pune"]);
});

test("TC-OB-06 a role that is not in the list can be added by typing it", async ({ page }) => {
  await open(page, "role");
  await page.fill('[data-pksearch="role"]', "SAP Consultant");
  await page.click('[data-pkadd="role"]');
  expect((await chips(page, "role")).map(c => c.replace("×", "").trim())).toContain("SAP Consultant");
});

test("TC-OB-07 answers are saved on the server: after reload the jobs page opens, not the questions", async ({ page }) => {
  await open(page, "role"); await pickAndClose(page, "role", "QA / Testing");
  await open(page, "exp"); await pickAndClose(page, "exp", "3");
  await open(page, "city"); await pickAndClose(page, "city", "Hyderabad");
  await page.click("#obNext");
  await expect(page.locator("#shell")).toBeVisible();
  await page.waitForTimeout(800);                 // the save is sent 0.5 s after a change
  await page.reload();
  await expect(page.locator("#shell")).toBeVisible();
  await expect(page.locator("#ob")).toBeHidden();
});
