// Log in, sign up, password field, forgot password. TC-AUTH-xx, TC-FP-xx
import { test, expect } from "@playwright/test";
import { PASSWORD, uniqueEmail, signupApi, useFixtures, loginUi } from "./helpers.js";

test.beforeEach(async ({ page }) => { await useFixtures(page); });

test.describe("Sign up and log in", () => {
  test("TC-AUTH-01 first visit shows the log in form @phone", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#loginView")).toBeVisible();
    await expect(page.locator("#loginView h2")).toHaveText("Welcome back");
    await expect(page.locator("#signupView")).toBeHidden();
  });

  test("TC-AUTH-02 sign up with valid details opens the job questions", async ({ page }) => {
    await page.goto("/");
    await page.click("#toSignup");
    await page.fill("#sName", "Ravi Kumar");
    await page.fill("#sEmail", uniqueEmail("su"));
    await page.fill("#sPhone", "+91 9876543210");
    await page.fill("#sPass", PASSWORD);
    await page.click("#signupForm button[type=submit]");
    await expect(page.locator("#ob")).toBeVisible();
    await expect(page.locator("#ob h1")).toHaveText("Tell us the job you want");
  });

  test("TC-AUTH-03 sign up shows a clear message for each wrong field", async ({ page }) => {
    await page.goto("/");
    await page.click("#toSignup");
    const submit = () => page.click("#signupForm button[type=submit]");
    await page.fill("#sEmail", uniqueEmail("x")); await page.fill("#sPass", PASSWORD); await submit();
    await expect(page.locator("#sErr")).toHaveText("Enter your full name.");
    await page.fill("#sName", "Ravi"); await page.fill("#sEmail", "ravi@"); await submit();
    await expect(page.locator("#sErr")).toHaveText("Enter a valid email.");
    await page.fill("#sEmail", uniqueEmail("x")); await page.fill("#sPass", "12345"); await submit();
    await expect(page.locator("#sErr")).toHaveText("Password needs at least 6 characters.");
    await expect(page.locator("#ob")).toBeHidden();
  });

  test("TC-AUTH-04 sign up with an email that already has an account is refused", async ({ page, request }) => {
    const a = await signupApi(request);
    await page.goto("/");
    await page.click("#toSignup");
    await page.fill("#sName", "Someone"); await page.fill("#sEmail", a.email); await page.fill("#sPass", PASSWORD);
    await page.click("#signupForm button[type=submit]");
    await expect(page.locator("#sErr")).toContainText("already exists");
  });

  test("TC-AUTH-05 wrong password shows an error and stays on log in", async ({ page, request }) => {
    const a = await signupApi(request);
    await loginUi(page, a.email, "wrong-password");
    await expect(page.locator("#lErr")).toHaveText("Email or password is wrong.");
    await expect(page.locator("#loginView")).toBeVisible();
  });

  test("TC-AUTH-06 right password logs in; a new user goes to the job questions", async ({ page, request }) => {
    const a = await signupApi(request);
    await loginUi(page, a.email.toUpperCase(), PASSWORD);
    await expect(page.locator("#ob")).toBeVisible();
  });

  test("TC-AUTH-07 the session survives a page reload", async ({ page, request }) => {
    const a = await signupApi(request);
    await loginUi(page, a.email, PASSWORD);
    await expect(page.locator("#ob")).toBeVisible();
    await page.reload();
    await expect(page.locator("#ob")).toBeVisible();
    await expect(page.locator("#auth")).toBeHidden();
  });

  test("TC-AUTH-08 log in and sign up boxes are exactly the same size and place", async ({ page }) => {
    await page.goto("/");
    const box = () => page.locator(".auth-box").boundingBox();
    const login = await box();
    await page.click("#toSignup");
    const signup = await box();
    expect(signup).toEqual(login);
  });

  test("TC-AUTH-09 log out returns to log in and the old session no longer works", async ({ page, request }) => {
    const a = await signupApi(request);
    await loginUi(page, a.email, PASSWORD);
    await expect(page.locator("#ob")).toBeVisible();
    const token = await page.evaluate(() => JSON.parse(localStorage.getItem("uv.token")));
    await page.evaluate(() => logout());
    await expect(page.locator("#loginView")).toBeVisible();
    const r = await request.get("/api/user", { headers: { Authorization: `Bearer ${token}` } });
    expect(r.status()).toBe(401);
  });
});

test.describe("Password field", () => {
  test("TC-AUTH-10 eye button is off while empty, shows and hides the password @phone", async ({ page }) => {
    await page.goto("/");
    const eye = page.locator('[data-eye="lPass"]');
    await expect(eye).toBeDisabled();
    await page.fill("#lPass", "secret99");
    await expect(eye).toBeEnabled();
    await eye.click();
    await expect(page.locator("#lPass")).toHaveAttribute("type", "text");
    await expect(eye).toHaveAttribute("aria-label", "Hide password");
    await eye.click();
    await expect(page.locator("#lPass")).toHaveAttribute("type", "password");
    await page.fill("#lPass", "");
    await expect(eye).toBeDisabled();
  });
});

test.describe("Forgot password", () => {
  async function openForgot(page, email) {
    await page.goto("/");
    if (email) await page.fill("#lEmail", email);
    await page.click("#toForgot");
    await expect(page.locator("#fpModal")).toBeVisible();
  }

  test("TC-FP-01 full journey: email, PIN, new password, then log in with it", async ({ page, request }) => {
    test.slow();
    const a = await signupApi(request);
    await openForgot(page, a.email);
    await expect(page.locator("#fpEmail")).toHaveValue(a.email);
    await page.click("#fpGen");
    await expect(page.locator("#fpPinShow")).toHaveText(/^\d{6}$/);   // the PIN comes from the server: wait for it
    const pin = (await page.locator("#fpPinShow").textContent()).trim();
    expect(pin).toMatch(/^\d{6}$/);
    await page.fill("#fpPin", pin);
    await page.click("#fpVerify");
    await page.fill("#fpNew", "Brand#New1");
    await page.fill("#fpNew2", "Brand#New1");
    await page.click("#fpSave");
    await expect(page.locator('[data-fp="4"]')).toBeVisible();
    await page.click("#fpDone");
    await expect(page.locator("#fpModal")).toBeHidden();
    await expect(page.locator("#lEmail")).toHaveValue(a.email);
    await page.fill("#lPass", "Brand#New1");
    await page.click("#loginForm button[type=submit]");
    await expect(page.locator("#ob")).toBeVisible();
  });

  test("TC-FP-02 Continue is off until the email looks valid", async ({ page }) => {
    await openForgot(page);
    await expect(page.locator("#fpGen")).toBeDisabled();
    await page.fill("#fpEmail", "abc@");
    await expect(page.locator("#fpGen")).toBeDisabled();
    await page.fill("#fpEmail", "abc@x.io");
    await expect(page.locator("#fpGen")).toBeEnabled();
  });

  test("TC-FP-03 wrong PIN shows tries left and does not move on", async ({ page, request }) => {
    const a = await signupApi(request);
    await openForgot(page, a.email);
    await page.click("#fpGen");
    await expect(page.locator("#fpPinShow")).toHaveText(/^\d{6}$/);   // the PIN comes from the server: wait for it
    const pin = (await page.locator("#fpPinShow").textContent()).trim();
    await page.fill("#fpPin", pin === "000000" ? "111111" : "000000");
    await page.click("#fpVerify");
    await expect(page.locator("#fpErr2")).toHaveText("Wrong PIN. 4 tries left.");
    await expect(page.locator('[data-fp="3"]')).toBeHidden();
  });

  test("TC-FP-04 the two new passwords must match", async ({ page, request }) => {
    const a = await signupApi(request);
    await openForgot(page, a.email);
    await page.click("#fpGen");
    await expect(page.locator("#fpPinShow")).toHaveText(/^\d{6}$/);   // wait for the PIN from the server
    await page.fill("#fpPin", (await page.locator("#fpPinShow").textContent()).trim());
    await page.click("#fpVerify");
    await page.fill("#fpNew", "Brand#New1");
    await page.fill("#fpNew2", "Brand#New2");
    await page.click("#fpSave");
    await expect(page.locator("#fpErr3")).toHaveText("The two passwords don't match.");
  });

  test("TC-FP-05 clicking outside does not close it; Esc and × do @phone", async ({ page }) => {
    await openForgot(page);
    await page.mouse.click(5, 5);
    await expect(page.locator("#fpModal")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("#fpModal")).toBeHidden();
    await page.click("#toForgot");
    await page.click("#fpX");
    await expect(page.locator("#fpModal")).toBeHidden();
  });

  test("TC-FP-06 the pop-up keeps one size on every step and blurs the page behind", async ({ page, request }) => {
    const a = await signupApi(request);
    await openForgot(page, a.email);
    const card = page.locator("#fpModal .modal-card");
    await page.waitForTimeout(300);                       // opening animation
    const s1 = await card.boundingBox();
    await page.click("#fpGen");
    await expect(page.locator('[data-fp="2"]')).toBeVisible();
    const s2 = await card.boundingBox();
    await expect(page.locator("#fpPinShow")).toHaveText(/^\d{6}$/);   // wait for the PIN from the server
    await page.fill("#fpPin", (await page.locator("#fpPinShow").textContent()).trim());
    await page.click("#fpVerify");
    await expect(page.locator('[data-fp="3"]')).toBeVisible();
    const s3 = await card.boundingBox();
    expect(s2).toEqual(s1);
    expect(s3).toEqual(s1);
    expect(await page.locator("#fpModal").evaluate(e => getComputedStyle(e).backdropFilter)).toContain("blur");
  });
});
