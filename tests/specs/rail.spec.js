// Right-hand career tools panel: shows on normal laptop screens and its links/buttons work. TC-RAIL-xx
import { test, expect } from "@playwright/test";
import { signupApi, saveUser, blankUser, useFixtures, openLoggedIn } from "./helpers.js";

async function start(page, request, width) {
  await page.setViewportSize({ width, height: 768 });
  await useFixtures(page);
  const a = await signupApi(request);
  await saveUser(request, a.token, blankUser(a.email, { roles: ["QA / Testing"], exp: 3, cities: ["Hyderabad"], skills: [] }));
  await openLoggedIn(page, a);
  await expect(page.locator("#shell")).toBeVisible();
}

test.describe("Career tools panel", () => {
  for (const width of [1280, 1366, 1536])
    test(`TC-RAIL-01 shows at ${width}px (100% zoom on a laptop) with no sideways scroll`, async ({ page, request }) => {
      await start(page, request, width);
      await expect(page.locator("#rail")).toBeVisible();
      const box = await page.locator("#rail").boundingBox();
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    });

  test("TC-RAIL-02 is hidden on small screens", async ({ page, request }) => {
    await start(page, request, 1000);
    await expect(page.locator("#rail")).toBeHidden();
  });

  test("TC-RAIL-03 interview links are for the person's role and open in a new tab", async ({ page, request }) => {
    await start(page, request, 1366);
    await expect(page.locator("#rail h3", { hasText: "Prepare for QA Testing interviews" })).toBeVisible();
    const links = page.locator("#rail .rail-list a");
    for (const a of await links.all()) {
      expect(await a.getAttribute("href")).toMatch(/^https:\/\//);
      expect(await a.getAttribute("target")).toBe("_blank");
      expect(await a.getAttribute("href")).not.toContain("{q}");
    }
    expect(await page.locator("#rail a", { hasText: "GeeksforGeeks" }).getAttribute("href")).toContain("QA%20Testing");
  });

  test("TC-RAIL-04 Complete profile opens the Profile screen and the % updates after saving", async ({ page, request }) => {
    await start(page, request, 1366);
    const before = await page.locator("#rail h3").first().textContent();
    await page.locator("#rail [data-go=profile]").click();
    await expect(page).toHaveURL(/\/profile$/);
    await page.evaluate(() => { U.profile.phone = "9876543210"; saveUser(); render(); });
    await expect(page.locator("#rail h3").first()).not.toHaveText(before);
  });
});
