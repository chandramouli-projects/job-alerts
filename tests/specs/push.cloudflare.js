// Alerts with the app closed (Web Push) on the live site's accounts code. TC-PUSH-xx
// Only with playwright.cloudflare.config.js: a fake push service stands in for Google / Apple / Mozilla,
// and each alert it receives is decrypted here to check what the person would see.
import { test, expect } from "@playwright/test";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { signupApi, saveUser, blankUser } from "./helpers.js";

const KEYS = JSON.parse(readFileSync(new URL("../.tmp-cf/push-keys.json", import.meta.url), "utf8"));
const b64u = {
  enc: b => Buffer.from(b).toString("base64url"),
  dec: s => new Uint8Array(Buffer.from(s, "base64url")),
};
const QA_HYD = { roles: ["QA / Testing"], exp: 3, cities: ["Hyderabad"], skills: [] };
const JOBS = [
  {
    id: "p1",
    title: "QA Automation Engineer",
    company: "Okta",
    location: "Hyderabad",
    city_norm: "Hyderabad",
    exp_min: 2,
    exp_max: 4,
  },
  { id: "p2", title: "Senior Java Developer", company: "Citi", location: "Pune", city_norm: "Pune" },
];
const run = (request, jobs, secret = KEYS.notifySecret) =>
  request.post("/api/push/run", { headers: { Authorization: `Bearer ${secret}` }, data: { jobs } });

// the fake push service
let received = [],
  server,
  port;
test.beforeAll(async () => {
  server = createServer((req, res) => {
    const parts = [];
    req.on("data", c => parts.push(c));
    req.on("end", () => {
      received.push({ path: req.url, headers: req.headers, body: new Uint8Array(Buffer.concat(parts)) });
      res.writeHead(req.url.includes("gone") ? 410 : 201).end();
    });
  });
  await new Promise(ok => server.listen(0, "127.0.0.1", ok));
  port = server.address().port;
});
test.afterAll(() => server.close());
test.beforeEach(() => {
  received = [];
});

// a browser's push subscription (keys made here, so the alert can be decrypted)
async function device(name) {
  const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const auth = crypto.getRandomValues(new Uint8Array(16));
  const pub = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  return {
    pair,
    pub,
    auth,
    sub: {
      endpoint: `http://127.0.0.1:${port}/push/${name}`,
      keys: { p256dh: b64u.enc(pub), auth: b64u.enc(auth) },
    },
  };
}
async function hkdf(salt, ikm, info, n) {
  const k = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(
    await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, k, n * 8)
  );
}
// RFC 8291, the browser's side
async function decrypt(dev, body) {
  const salt = body.slice(0, 16),
    idlen = body[20],
    asPub = body.slice(21, 21 + idlen),
    cipher = body.slice(21 + idlen);
  const asKey = await crypto.subtle.importKey("raw", asPub, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: asKey }, dev.pair.privateKey, 256)
  );
  const t = s => new TextEncoder().encode(s);
  const ikm = await hkdf(
    dev.auth,
    shared,
    new Uint8Array([...t("WebPush: info\0"), ...dev.pub, ...asPub]),
    32
  );
  const key = await crypto.subtle.importKey(
    "raw",
    await hkdf(salt, ikm, t("Content-Encoding: aes128gcm\0"), 16),
    "AES-GCM",
    false,
    ["decrypt"]
  );
  const plain = new Uint8Array(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: await hkdf(salt, ikm, t("Content-Encoding: nonce\0"), 12) },
      key,
      cipher
    )
  );
  return JSON.parse(new TextDecoder().decode(plain.slice(0, plain.lastIndexOf(2))));
}
async function person(request, extra = {}) {
  const a = await signupApi(request);
  await saveUser(request, a.token, { ...blankUser(a.email, QA_HYD), ...extra });
  return a;
}
const subscribe = (request, a, d) =>
  request.post("/api/push/subscribe", { headers: { Authorization: `Bearer ${a.token}` }, data: d.sub });

test("TC-PUSH-01 new jobs: one encrypted, signed alert for the jobs that fit, to that person's device", async ({
  request,
}) => {
  expect((await (await request.get("/api/push/key")).json()).key).toBe(KEYS.publicKey);
  const a = await person(request),
    d = await device("a1");
  expect((await subscribe(request, a, d)).status()).toBe(200);
  expect(await (await run(request, JOBS)).json()).toMatchObject({ jobs: 2 });
  const hit = received.find(x => x.path === "/push/a1");
  expect(hit.headers["content-encoding"]).toBe("aes128gcm");
  const [, token, k] = hit.headers.authorization.match(/^vapid t=([^,]+), k=(.+)$/);
  expect(k).toBe(KEYS.publicKey);
  const [h, c, sig] = token.split(".");
  const pub = await crypto.subtle.importKey(
    "raw",
    b64u.dec(KEYS.publicKey),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"]
  );
  expect(
    await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      pub,
      b64u.dec(sig),
      new TextEncoder().encode(`${h}.${c}`)
    )
  ).toBe(true);
  expect(await decrypt(d, hit.body)).toEqual({
    title: "1 new job for you",
    body: "QA Automation Engineer at Okta",
    url: "./jobs",
    tag: "new-jobs",
  });
});

test("TC-PUSH-02 only the bot with the secret can send alerts", async ({ request }) => {
  expect((await run(request, JOBS, "wrong")).status()).toBe(401);
  expect((await request.post("/api/push/run", { data: { jobs: JOBS } })).status()).toBe(401);
});

test("TC-PUSH-03 no alert for jobs that don't fit, jobs I hid or applied to, or when 'New jobs for you' is off", async ({
  request,
}) => {
  const off = await person(request, { notifications: { settings: { jobs: false } } }),
    d1 = await device("off");
  const hid = await person(request, { hidden: { p1: 1 } }),
    d2 = await device("hid");
  const applied = await person(request, { jobs: { p1: { stage: "applied", history: [] } } }),
    d3 = await device("applied");
  const other = await person(request, { prefs: { ...QA_HYD, cities: ["Chennai"] } }),
    d4 = await device("chennai");
  for (const [a, d] of [
    [off, d1],
    [hid, d2],
    [applied, d3],
    [other, d4],
  ])
    await subscribe(request, a, d);
  await run(request, JOBS);
  expect(
    received.filter(x => ["/push/off", "/push/hid", "/push/applied", "/push/chennai"].includes(x.path))
  ).toEqual([]);
});

test("TC-PUSH-04 a device the browser dropped (410) is removed", async ({ request }) => {
  const a = await person(request),
    d = await device("gone");
  await subscribe(request, a, d);
  expect((await (await run(request, [JOBS[0]])).json()).removed).toBeGreaterThanOrEqual(1);
  received = [];
  await run(request, [JOBS[0]]);
  expect(received.filter(x => x.path === "/push/gone")).toEqual([]);
});

test("TC-PUSH-05 'Turn on' sends a test alert; unsubscribe and deleting the account stop alerts", async ({
  request,
}) => {
  const a = await person(request),
    d = await device("t1"),
    auth = { Authorization: `Bearer ${a.token}` };
  await subscribe(request, a, d);
  expect((await (await request.post("/api/push/test", { headers: auth, data: {} })).json()).sent).toBe(1);
  expect((await decrypt(d, received.find(x => x.path === "/push/t1").body)).title).toBe("Alerts are on");
  await request.post("/api/push/unsubscribe", { headers: auth, data: { endpoint: d.sub.endpoint } });
  received = [];
  await run(request, JOBS);
  expect(received.filter(x => x.path === "/push/t1")).toEqual([]);
  const d2 = await device("t2");
  await subscribe(request, a, d2);
  await request.delete("/api/user", { headers: auth });
  received = [];
  await run(request, JOBS);
  expect(received.filter(x => x.path === "/push/t2")).toEqual([]);
});
