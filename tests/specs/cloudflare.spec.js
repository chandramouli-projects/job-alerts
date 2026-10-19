// Accounts on the live site (Cloudflare functions/api). TC-CF-xx
// Runs only with playwright.cloudflare.config.js, but works against any accounts server.
import { test, expect } from "@playwright/test";
import { useFixtures, uniqueEmail, PASSWORD } from "./helpers.js";

test("TC-CF-01 an account made earlier in this browser only moves online at the first log in, with its data", async ({ page, browser }) => {
  await useFixtures(page);
  const email = uniqueEmail("old");
  await page.goto("/");
  // what the old browser-only version saved
  await page.evaluate(async ([email, pw]) => {
    const salt = "abc123", hash = await hashPw(pw, salt);
    localStorage.setItem("uv.accounts", JSON.stringify({ [email]: { name: "Old User", salt, hash, createdAt: Date.now() } }));
    localStorage.setItem("uv.user." + email, JSON.stringify({ ...blankUser("Old User", email, "9999999999"),
      prefs: { roles: ["QA / Testing"], custom: "", exp: 3, cities: ["Hyderabad"], skills: ["selenium", "jira"], customSkills: "" }, onboarded: true }));
    localStorage.setItem("uv.session", JSON.stringify({ email }));
  }, [email, PASSWORD]);
  await page.reload();
  await expect(page.locator("#loginView")).toBeVisible();
  await page.fill("#lEmail", email);
  await page.fill("#lPass", PASSWORD);
  await page.click("#loginForm button[type=submit]");
  await expect(page.locator("#shell")).toBeVisible();
  await expect(page.locator("#toast")).toContainText("Your account is now online");

  // another browser, nothing saved in it: the same login works and brings the same data
  const other = await browser.newContext(), p2 = await other.newPage();
  await useFixtures(p2);
  await p2.goto("/");
  await p2.fill("#lEmail", email);
  await p2.fill("#lPass", PASSWORD);
  await p2.click("#loginForm button[type=submit]");
  await expect(p2.locator("#shell")).toBeVisible();
  expect(await p2.evaluate(() => U.prefs.skills)).toEqual(["selenium", "jira"]);
  expect(await p2.evaluate(() => U.profile.phone)).toBe("9999999999");
  await other.close();
});

test("TC-CF-02 a wrong password does not move a browser-only account", async ({ page, request }) => {
  await useFixtures(page);
  const email = uniqueEmail("old");
  await page.goto("/");
  await page.evaluate(async ([email, pw]) => {
    const salt = "s", hash = await hashPw(pw, salt);
    localStorage.setItem("uv.accounts", JSON.stringify({ [email]: { name: "Old", salt, hash, createdAt: 1 } }));
  }, [email, PASSWORD]);
  await page.reload();
  await page.fill("#lEmail", email);
  await page.fill("#lPass", "wrong-password");
  await page.click("#loginForm button[type=submit]");
  await expect(page.locator("#lErr")).toHaveText("Email or password is wrong.");
  expect((await request.post("/api/login", { data: { email, password: PASSWORD } })).status()).toBe(401);
});

test("TC-CF-03 saved data bigger than one database row (2 MB) is kept whole", async ({ request }) => {
  const email = uniqueEmail("big");
  const { token } = await (await request.post("/api/signup", { data: { name: "Big", email, password: PASSWORD } })).json();
  const jobs = Object.fromEntries(Array.from({ length: 900 }, (_, i) => [`job-${i}`, { saved: true, snap: { title: "QA " + i, description: "x".repeat(3000) } }]));
  const put = await request.put("/api/user", { headers: { Authorization: `Bearer ${token}` }, data: { profile: { name: "Big" }, jobs } });
  expect(put.status()).toBe(200);
  const back = await (await request.get("/api/user", { headers: { Authorization: `Bearer ${token}` } })).json();
  expect(Object.keys(back.user.jobs)).toHaveLength(900);
  expect(back.user.jobs["job-899"].snap.description).toHaveLength(3000);
});
