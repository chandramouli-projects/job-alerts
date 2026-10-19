// Application tracking from Gmail on the live site's accounts code. TC-GMAIL-xx
// Only with playwright.cloudflare.config.js: a fake Google (sign-in + Gmail API) runs on port 8094,
// so no real Google account is touched. Emails are made here and the statuses checked in the app.
import { test, expect } from "@playwright/test";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { signupApi, saveUser, blankUser, useFixtures, openLoggedIn } from "./helpers.js";

const KEYS = JSON.parse(readFileSync(new URL("../.tmp-cf/push-keys.json", import.meta.url), "utf8"));
const QA_HYD = { roles: ["QA / Testing"], exp: 3, cities: ["Hyderabad"], skills: [] };
const b64 = s => Buffer.from(s).toString("base64url");
const email = (id, from, subject, body, day) => ({ id, internalDate: String(Date.parse(`2026-10-${day}T10:00:00Z`)),
  payload: { mimeType: "multipart/alternative", headers: [{ name: "Subject", value: subject }, { name: "From", value: from }],
    parts: [{ mimeType: "text/plain", body: { data: b64(body) } }, { mimeType: "text/html", body: { data: b64(`<p>${body}</p>`) } }] } });

// the fake Google
let mailbox = [], calls = [], deadToken = false, server;
test.beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", c => raw += c);
    req.on("end", () => {
      const url = new URL(req.url, "http://x"), send = (code, o) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(o)); };
      calls.push({ method: req.method, path: url.pathname, auth: req.headers.authorization || "", body: raw });
      if (url.pathname === "/token") {
        const f = new URLSearchParams(raw);
        if (f.get("client_id") !== "test-client" || f.get("client_secret") !== "test-secret") return send(401, { error: "invalid_client" });
        if (f.get("grant_type") === "authorization_code") {
          if (f.get("code") === "good") return send(200, { access_token: "at-1", refresh_token: "rt-1", expires_in: 3600, scope: "https://www.googleapis.com/auth/gmail.readonly" });
          if (f.get("code") === "noscope") return send(200, { access_token: "at-1", refresh_token: "rt-1", expires_in: 3600, scope: "openid email" });
          return send(400, { error: "invalid_grant" });
        }
        return deadToken || f.get("refresh_token") !== "rt-1" ? send(400, { error: "invalid_grant" }) : send(200, { access_token: "at-1", expires_in: 3600 });
      }
      if (url.pathname === "/revoke") return send(200, {});
      if (req.headers.authorization !== "Bearer at-1") return send(401, { error: "unauthenticated" });
      if (url.pathname === "/gmail/v1/users/me/profile") return send(200, { emailAddress: "me@gmail.com" });
      if (url.pathname === "/gmail/v1/users/me/messages") return send(200, { messages: [...mailbox].reverse().map(m => ({ id: m.id })) });
      const m = mailbox.find(x => url.pathname.endsWith("/" + x.id));
      if (m) return send(200, m);
      if (url.pathname.startsWith("/push/")) { res.writeHead(201).end(); return; }
      send(404, {});
    });
  });
  await new Promise(ok => server.listen(8094, "127.0.0.1", ok));
});
test.afterAll(() => server.close());
test.beforeEach(() => { calls = []; deadToken = false; mailbox = [
  email("e1", "LinkedIn <jobs-noreply@linkedin.com>", "Chandra, your application was sent to Okta", "SDET\nOkta · Hyderabad", "10"),
  email("e2", "Naukri <info@naukri.com>", "Recruiter shortlisted your application for QA Engineer at Zeta", "", "11"),
  email("e3", "LinkedIn <jobs-noreply@linkedin.com>", "30 new jobs for you", "Apply now", "11")]; });

async function person(request) {
  const a = await signupApi(request);
  await saveUser(request, a.token, { ...blankUser(a.email, QA_HYD),
    jobs: { "qa-blr": { stage: "applied", saved: false, notes: "", appliedAt: Date.now() - 864e6, history: [{ stage: "applied", at: Date.now() - 864e6 }],
      snap: { id: "qa-blr", title: "QA Engineer", company: "Zeta", location: "Bengaluru" } } } });
  return { ...a, auth: { Authorization: `Bearer ${a.token}` } };
}
async function connect(request, a, code = "good") {
  const { url } = await (await request.post("/api/gmail/start", { headers: a.auth, data: {} })).json();
  const state = new URL(url).searchParams.get("state");
  const r = await request.get(`/api/gmail/callback?code=${code}&state=${encodeURIComponent(state)}`, { maxRedirects: 0 });
  return { url, state, r };
}
const statuses = async (request, a) => (await (await request.get("/api/mail", { headers: a.auth })).json());

test("TC-GMAIL-01 'Connect Gmail' asks Google for read-only Gmail access, for this person only", async ({ request }) => {
  const a = await person(request);
  expect(await statuses(request, a)).toEqual({ connected: false, canConnect: true });
  const { url } = await (await request.post("/api/gmail/start", { headers: a.auth, data: {} })).json();
  const q = new URL(url).searchParams;
  expect(url.startsWith("http://127.0.0.1:8094/auth?")).toBe(true);
  expect(q.get("scope")).toBe("https://www.googleapis.com/auth/gmail.readonly");
  expect(q.get("access_type")).toBe("offline");
  expect(q.get("redirect_uri")).toMatch(/\/api\/gmail\/callback$/);
  expect(q.get("client_id")).toBe("test-client");
  expect((await request.post("/api/gmail/start", { data: {} })).status()).toBe(401);
});

test("TC-GMAIL-02 after connecting, job emails become statuses: my application moves, an outside one is added", async ({ request }) => {
  const a = await person(request);
  const { r } = await connect(request, a);
  expect(r.status()).toBe(302);
  expect(r.headers().location).toMatch(/\/my-jobs\?gmail=connected$/);
  const m = await statuses(request, a);
  expect(m).toMatchObject({ connected: true, gmail: "me@gmail.com", error: "" });
  expect(m.jobs["qa-blr"].stage).toBe("shortlisted");                       // my own application, matched by company + title
  const outside = Object.entries(m.jobs).find(([id]) => id.startsWith("mail-"));
  expect(outside[1]).toMatchObject({ stage: "applied", snap: { company: "Okta", source: "LinkedIn" } });   // applied on LinkedIn directly
  expect(Object.keys(m.jobs)).toHaveLength(2);                              // the job alert email was skipped
  // the token Google gave is never sent back to the app
  expect(JSON.stringify(m)).not.toContain("rt-1");
});

test("TC-GMAIL-03 a new email later: Check now picks it up and alerts my devices", async ({ request }) => {
  const a = await person(request);
  await connect(request, a);
  await request.post("/api/push/subscribe", { headers: a.auth, data: { endpoint: "http://127.0.0.1:8094/push/me",
    keys: { p256dh: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4", auth: "BTBZMqHH6r4Tts7J_aSIgg" } } });
  mailbox.push(email("e4", "Okta Recruiting <no-reply@ashbyhq.com>", "Interview invitation", "We would like to invite you to an interview for the SDET role at Okta.", "12"));
  calls = [];
  const m = await (await request.post("/api/mail/sync", { headers: a.auth, data: {} })).json();
  expect(Object.values(m.jobs).find(o => o.snap?.company === "Okta").stage).toBe("interview");
  expect(calls.filter(c => c.path.startsWith("/gmail/v1/users/me/messages/")).map(c => c.path)).toEqual(["/gmail/v1/users/me/messages/e4"]);   // only the new one
  expect(calls.some(c => c.path === "/push/me" && c.method === "POST")).toBe(true);
  expect((await request.post("/api/mail/sync", { headers: a.auth, data: {} })).status()).toBe(429);   // once a minute
});

test("TC-GMAIL-04 Google's answer is checked: refused, no Gmail box ticked, or a made-up link", async ({ request }) => {
  const a = await person(request), b = await person(request);
  expect((await request.get("/api/gmail/callback?error=access_denied", { maxRedirects: 0 })).headers().location).toMatch(/gmail=denied$/);
  expect((await connect(request, a, "noscope")).r.headers().location).toMatch(/gmail=noscope$/);
  const { state } = await connect(request, a, "bad-code");
  const forged = state.slice(0, -4) + (state.endsWith("AAAA") ? "BBBB" : "AAAA");
  expect((await request.get(`/api/gmail/callback?code=good&state=${forged}`, { maxRedirects: 0 })).headers().location).toMatch(/gmail=error$/);
  expect((await statuses(request, a)).connected).toBe(false);
  expect((await statuses(request, b)).connected).toBe(false);
});

test("TC-GMAIL-05 every 30 minutes the bot checks everyone; a removed Google permission says to connect again", async ({ request }) => {
  const a = await person(request);
  await connect(request, a);
  expect((await request.post("/api/mail/run", { data: {} })).status()).toBe(401);
  deadToken = true;
  for (let i = 0; i < 20; i++) {   // force a check now: pretend the last one was long ago
    const r = await (await request.post("/api/mail/run", { headers: { Authorization: `Bearer ${KEYS.notifySecret}` }, data: {} })).json();
    if (!r.more) break;
  }
  await request.post("/api/mail/sync", { headers: a.auth, data: {} });
  expect((await statuses(request, a)).error).toBe("Gmail access was removed or expired. Connect Gmail again.");
});

test("TC-GMAIL-06 disconnect gives the permission back to Google; statuses found stay", async ({ request }) => {
  const a = await person(request);
  await connect(request, a);
  calls = [];
  await request.post("/api/gmail/disconnect", { headers: a.auth, data: {} });
  expect(calls.some(c => c.path === "/revoke")).toBe(true);
  expect(await statuses(request, a)).toEqual({ connected: false, canConnect: true });
});

test("TC-GMAIL-07 in the app: Connect Gmail on My jobs, back from Google, and the applications show", async ({ page, request }) => {
  await useFixtures(page);
  const a = await person(request);
  await openLoggedIn(page, a);
  await page.locator("#side button", { hasText: "My jobs" }).click();
  await expect(page.locator(".mail-connect")).toContainText("Track every application automatically");
  const toGoogle = page.waitForRequest(r => r.url().startsWith("http://127.0.0.1:8094/auth?"));
  await page.route("http://127.0.0.1:8094/auth?**", r => r.fulfill({ body: "<h1>Google</h1>", contentType: "text/html" }));
  await page.click("[data-gmailconnect]");
  const state = new URL((await toGoogle).url()).searchParams.get("state");
  await page.goto(`/api/gmail/callback?code=good&state=${encodeURIComponent(state)}`);
  await expect(page).toHaveURL(/\/my-jobs$/);
  await expect(page.locator("#toast")).toContainText("Gmail connected");
  await expect(page.locator(".mailbar")).toContainText("Tracking from me@gmail.com");
  await expect(page.locator("#main")).toContainText("Okta");
  await expect(page.locator("#main")).toContainText("Shortlisted");
});
