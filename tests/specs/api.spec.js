// Server API: accounts, sessions, password reset, security. TC-API-xx
import { test, expect } from "@playwright/test";
import { PASSWORD, uniqueEmail, signupApi } from "./helpers.js";

const auth = t => ({ Authorization: `Bearer ${t}` });

test.describe("Accounts API", () => {
  test("TC-API-01 server answers ping", async ({ request }) => {
    const r = await request.get("/api/ping");
    expect(r.status()).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
  });

  test("TC-API-02 sign up needs name, valid email and 6+ character password", async ({ request }) => {
    for (const data of [
      { name: "", email: uniqueEmail("a"), password: PASSWORD },
      { name: "A", email: "not-an-email", password: PASSWORD },
      { name: "A", email: uniqueEmail("b"), password: "12345" },
    ]) {
      const r = await request.post("/api/signup", { data });
      expect(r.status(), JSON.stringify(data)).toBe(400);
    }
  });

  test("TC-API-03 the same email cannot sign up twice, in any letter case", async ({ request }) => {
    const email = uniqueEmail("dup");
    await signupApi(request, email);
    const r = await request.post("/api/signup", {
      data: { name: "B", email: email.toUpperCase(), password: PASSWORD },
    });
    expect(r.status()).toBe(409);
  });

  test("TC-API-04 log in works with any letter case of the email", async ({ request }) => {
    const a = await signupApi(request);
    const r = await request.post("/api/login", {
      data: { email: "  " + a.email.toUpperCase() + " ", password: PASSWORD },
    });
    expect(r.status()).toBe(200);
    expect((await r.json()).token).toMatch(/^[0-9a-f]{64}$/);
  });

  test("TC-API-05 wrong password is refused with the same message as an unknown email", async ({
    request,
  }) => {
    const a = await signupApi(request);
    const wrong = await request.post("/api/login", { data: { email: a.email, password: "wrong-pass" } });
    const unknown = await request.post("/api/login", {
      data: { email: uniqueEmail("none"), password: "wrong-pass" },
    });
    expect(wrong.status()).toBe(401);
    expect(unknown.status()).toBe(401);
    expect((await wrong.json()).error).toBe((await unknown.json()).error);
  });

  test("TC-API-06 after 5 wrong passwords, log in is blocked for a minute (even with the right password)", async ({
    request,
  }) => {
    const a = await signupApi(request);
    for (let i = 0; i < 5; i++)
      await request.post("/api/login", { data: { email: a.email, password: "wrong" + i } });
    const r = await request.post("/api/login", { data: { email: a.email, password: PASSWORD } });
    expect(r.status()).toBe(429);
  });

  test("TC-API-07 profile needs a valid session", async ({ request }) => {
    expect((await request.get("/api/user")).status()).toBe(401);
    expect((await request.get("/api/user", { headers: auth("0".repeat(64)) })).status()).toBe(401);
  });

  test("TC-API-08 saved profile comes back the same", async ({ request }) => {
    const a = await signupApi(request);
    const user = {
      profile: { name: "Ravi K" },
      prefs: { roles: ["QA / Testing"], exp: 3, cities: ["Hyderabad"] },
      onboarded: true,
    };
    expect((await request.put("/api/user", { headers: auth(a.token), data: user })).status()).toBe(200);
    const back = await (await request.get("/api/user", { headers: auth(a.token) })).json();
    expect(back.user).toEqual(user);
    expect(back.name).toBe("Ravi K");
  });

  test("TC-API-09 log out ends the session", async ({ request }) => {
    const a = await signupApi(request);
    expect((await request.post("/api/logout", { headers: auth(a.token), data: {} })).status()).toBe(200);
    expect((await request.get("/api/user", { headers: auth(a.token) })).status()).toBe(401);
  });

  test("TC-API-10 change password: old one must be right, then only the new one works", async ({
    request,
  }) => {
    const a = await signupApi(request);
    expect(
      (
        await request.post("/api/password", {
          headers: auth(a.token),
          data: { old: "nope", new: "NewPass#1" },
        })
      ).status()
    ).toBe(400);
    expect(
      (
        await request.post("/api/password", { headers: auth(a.token), data: { old: PASSWORD, new: "123" } })
      ).status()
    ).toBe(400);
    expect(
      (
        await request.post("/api/password", {
          headers: auth(a.token),
          data: { old: PASSWORD, new: "NewPass#1" },
        })
      ).status()
    ).toBe(200);
    expect(
      (await request.post("/api/login", { data: { email: a.email, password: PASSWORD } })).status()
    ).toBe(401);
    expect(
      (await request.post("/api/login", { data: { email: a.email, password: "NewPass#1" } })).status()
    ).toBe(200);
  });

  test("TC-API-11 delete account needs the password, then removes login and data", async ({ request }) => {
    const a = await signupApi(request);
    expect(
      (await request.delete("/api/user", { headers: auth(a.token), data: { password: "wrong" } })).status()
    ).toBe(403);
    expect(
      (await request.delete("/api/user", { headers: auth(a.token), data: { password: PASSWORD } })).status()
    ).toBe(200);
    expect(
      (await request.post("/api/login", { data: { email: a.email, password: PASSWORD } })).status()
    ).toBe(401);
    expect(
      (
        await request.post("/api/signup", { data: { name: "Again", email: a.email, password: PASSWORD } })
      ).status()
    ).toBe(200);
  });
});

test.describe("Forgot password API", () => {
  test("TC-API-13 PIN is 6 digits; a new PIN cannot be asked again within 15 seconds", async ({
    request,
  }) => {
    const a = await signupApi(request);
    const r = await request.post("/api/forgot", { data: { email: a.email } });
    expect(r.status()).toBe(200);
    expect((await r.json()).pin).toMatch(/^\d{6}$/);
    expect((await request.post("/api/forgot", { data: { email: a.email } })).status()).toBe(429);
  });

  test("TC-API-14 wrong PIN: 5 tries, then the PIN is cancelled", async ({ request }) => {
    const a = await signupApi(request);
    const { pin } = await (await request.post("/api/forgot", { data: { email: a.email } })).json();
    const bad = pin === "000000" ? "111111" : "000000";
    const codes = [];
    for (let i = 0; i < 5; i++)
      codes.push((await request.post("/api/verify", { data: { email: a.email, pin: bad } })).status());
    expect(codes.slice(0, 4)).toEqual([400, 400, 400, 400]);
    expect(codes[4]).toBe(429);
    // the right PIN no longer works either
    expect((await request.post("/api/verify", { data: { email: a.email, pin } })).status()).not.toBe(200);
  });

  test("TC-API-15 reset with the right PIN changes the password and logs out other sessions", async ({
    request,
  }) => {
    const a = await signupApi(request);
    const { pin } = await (await request.post("/api/forgot", { data: { email: a.email } })).json();
    expect((await request.post("/api/verify", { data: { email: a.email, pin } })).status()).toBe(200);
    expect(
      (await request.post("/api/reset", { data: { email: a.email, pin, password: "Reset#123" } })).status()
    ).toBe(200);
    expect((await request.get("/api/user", { headers: auth(a.token) })).status()).toBe(401);
    expect(
      (await request.post("/api/login", { data: { email: a.email, password: "Reset#123" } })).status()
    ).toBe(200);
    // a used PIN cannot be used again
    expect(
      (await request.post("/api/reset", { data: { email: a.email, pin, password: "Again#123" } })).status()
    ).not.toBe(200);
  });

  test("TC-API-16 reset refuses a short new password", async ({ request }) => {
    const a = await signupApi(request);
    const { pin } = await (await request.post("/api/forgot", { data: { email: a.email } })).json();
    expect(
      (await request.post("/api/reset", { data: { email: a.email, pin, password: "123" } })).status()
    ).toBe(400);
  });
});

test.describe("Server safety", () => {
  test("TC-SEC-01 broken JSON body gets a 400, not a crash", async ({ request }) => {
    const r = await request.post("/api/login", {
      headers: { "Content-Type": "application/json" },
      data: Buffer.from("{not json"),
    });
    expect(r.status()).toBe(400);
    expect((await request.get("/api/ping")).status()).toBe(200); // server still up
  });

  test("TC-SEC-02 the accounts file cannot be downloaded", async ({ request }) => {
    for (const p of [
      "/../database/app.db",
      "/..%2fdatabase%2fapp.db",
      "/%2e%2e/database/app.db",
      "/../tests/.tmp/app.db",
    ]) {
      const r = await request.get(p);
      expect(r.status(), p).not.toBe(200);
    }
  });

  test("TC-SEC-03 the .env file with API keys cannot be downloaded", async ({ request }) => {
    for (const p of ["/../.env", "/..%2f.env"]) expect((await request.get(p)).status(), p).not.toBe(200);
  });

  test("TC-SEC-04 sessions are not shared: one user cannot read another's data", async ({ request }) => {
    const a = await signupApi(request),
      b = await signupApi(request);
    await request.put("/api/user", { headers: auth(a.token), data: { profile: { name: "A secret" } } });
    const asB = await (await request.get("/api/user", { headers: auth(b.token) })).json();
    expect(JSON.stringify(asB)).not.toContain("A secret");
  });

  test("TC-SEC-05 a very large profile save is refused", async ({ request }) => {
    const a = await signupApi(request);
    const big = { profile: { name: "x" }, blob: "x".repeat(6_000_000) };
    const r = await request.put("/api/user", { headers: auth(a.token), data: big }).catch(() => null);
    expect(r, "server dropped the connection instead of answering").not.toBeNull();
    expect(r.status()).toBe(413);
    expect((await request.get("/api/ping")).status()).toBe(200);
  });

  test("TC-SEC-06 live search without API keys says so instead of failing silently", async ({ request }) => {
    const r = await request.get("/search?q=QA%20Engineer");
    expect(r.status()).toBeGreaterThanOrEqual(400);
    expect((await r.json()).error).toBeTruthy();
  });

  test("TC-SEC-07 live search refuses an empty or 1-letter query", async ({ request }) => {
    expect((await request.get("/search?q=a")).status()).toBe(400);
    expect((await request.get("/search")).status()).toBe(400);
  });
});
