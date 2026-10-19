/*
Accounts for the live site (Cloudflare Pages Functions + D1 database), so one login works on every
phone, computer and browser. Cloudflare runs this file for every /api/... link of the site; all
other links are the normal site files. It answers the same /api/... calls, with the same messages,
as backend/server/server.mjs (the server on this computer), so the app works the same with both.
Not here: Gmail status tracking (needs Python on a computer, see backend/server/mail-sync.mjs).
Alerts with the app closed (Web Push): push/subscribe keeps each device's subscription; the job bot
calls push/run with the new jobs after every run, and each person gets one alert for the jobs that fit
them. Needs VAPID_PUBLIC_KEY (wrangler.toml), and the secrets VAPID_PRIVATE_JWK and NOTIFY_SECRET.
Application tracking from email: "Connect Gmail" (gmail/start, gmail/callback) lets the server read the
person's job-site emails (read-only) when the app asks (mail, mail/sync) and every 30 minutes for everyone
(mail/run, called by .github/workflows/mail.yml). Needs GOOGLE_CLIENT_ID (wrangler.toml) and the secrets
GOOGLE_CLIENT_SECRET and TOKEN_KEY.

The database is the D1 binding "DB" set in wrangler.toml. Tables are in database/cloudflare.sql and
are made here on first use. D1 keeps at most 2 MB in one row, so a person's saved data and resume
are stored in parts of 1.5 MB (table "parts"). Free plan: 5 GB, 100,000 rows written a day.
*/
import { sendPush } from "../../backend/push/webpush.js";
import { fits } from "../../backend/push/match.js";
import { applyEvents } from "../../backend/mail/mail-rules.js";
import * as G from "../../backend/mail/gmail.js";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS accounts (email TEXT PRIMARY KEY, name TEXT NOT NULL, password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, created_at INTEGER);
CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, email TEXT NOT NULL, created_at INTEGER);
CREATE INDEX IF NOT EXISTS sessions_email ON sessions (email);
CREATE TABLE IF NOT EXISTS parts (email TEXT NOT NULL, kind TEXT NOT NULL, part INTEGER NOT NULL, data BLOB, PRIMARY KEY (email, kind, part));
CREATE TABLE IF NOT EXISTS resumes (email TEXT PRIMARY KEY, file_name TEXT NOT NULL, file_type TEXT NOT NULL, size INTEGER, uploaded_at INTEGER);
CREATE TABLE IF NOT EXISTS login_fails (email TEXT PRIMARY KEY, n INTEGER, at INTEGER);
CREATE TABLE IF NOT EXISTS resets (email TEXT PRIMARY KEY, pin TEXT NOT NULL, at INTEGER, tries INTEGER);
CREATE TABLE IF NOT EXISTS push_subs (endpoint TEXT PRIMARY KEY, email TEXT NOT NULL, p256dh TEXT NOT NULL, auth TEXT NOT NULL, created_at INTEGER);
CREATE INDEX IF NOT EXISTS push_subs_email ON push_subs (email);
CREATE TABLE IF NOT EXISTS mail_accounts (email TEXT PRIMARY KEY, gmail TEXT, token TEXT NOT NULL, connected_at INTEGER, last_sync INTEGER, last_ask INTEGER, error TEXT);`;
const PUSH_MAX = 40; // alerts per run: Cloudflare's free plan allows 50 outside calls per request
const PART = 1_500_000;
const BODY_MAX = 5e6;
const RESUME_MAX = 2 * 1024 * 1024;
const RESUME_TYPES = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".txt": "text/plain; charset=utf-8",
};

let ready = null; // tables made once per Cloudflare instance
const setUp = db =>
  (ready ||= db
    .batch(
      SCHEMA.trim()
        .split(";")
        .filter(s => s.trim())
        .map(s => db.prepare(s))
    )
    .catch(e => {
      ready = null;
      throw e;
    }));

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
const randomHex = n => hex(crypto.getRandomValues(new Uint8Array(n)));
const cleanEmail = v =>
  String(v || "")
    .trim()
    .toLowerCase();

// Passwords: PBKDF2-SHA256, 100,000 rounds (the most Cloudflare allows), random salt; never stored as typed
async function hashPw(pw, salt) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, [
    "deriveBits",
  ]);
  return hex(
    await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt: new TextEncoder().encode(salt), iterations: 100_000, hash: "SHA-256" },
      key,
      256
    )
  );
}
async function checkPw(a, pw) {
  const h = await hashPw(pw, a.password_salt);
  let diff = h.length ^ a.password_hash.length; // same time whatever the answer
  for (let i = 0; i < h.length; i++)
    diff |= h.charCodeAt(i) ^ a.password_hash.charCodeAt(i % a.password_hash.length);
  return diff === 0;
}
async function newPw(pw) {
  const salt = randomHex(16);
  return { salt, hash: await hashPw(pw, salt) };
}

// Saved data and resumes, cut into 1.5 MB parts; all parts are replaced together
function writeParts(db, email, kind, bytes) {
  const out = [db.prepare("DELETE FROM parts WHERE email = ? AND kind = ?").bind(email, kind)];
  for (let i = 0, p = 0; i < bytes.length; i += PART, p++)
    out.push(
      db
        .prepare("INSERT INTO parts (email, kind, part, data) VALUES (?, ?, ?, ?)")
        .bind(email, kind, p, bytes.slice(i, i + PART).buffer)
    ); // D1 keeps an ArrayBuffer as a BLOB
  return out;
}
async function readParts(db, email, kind) {
  const { results } = await db
    .prepare("SELECT data FROM parts WHERE email = ? AND kind = ? ORDER BY part")
    .bind(email, kind)
    .all();
  if (!results.length) return null;
  const chunks = results.map(r => new Uint8Array(r.data)),
    out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}
const readUser = async (db, email) => {
  const b = await readParts(db, email, "user");
  return b ? JSON.parse(new TextDecoder().decode(b)) : null;
};

async function newSession(db, email) {
  const token = randomHex(32);
  await db
    .prepare("INSERT INTO sessions (token, email, created_at) VALUES (?, ?, ?)")
    .bind(token, email, Date.now())
    .run();
  return token;
}
async function sessionEmail(db, request) {
  const t = (request.headers.get("Authorization") || "").replace(/^Bearer /, "");
  if (!t) return null;
  const s = await db
    .prepare("SELECT s.email FROM sessions s JOIN accounts a ON a.email = s.email WHERE s.token = ?")
    .bind(t)
    .first();
  return s ? s.email : null;
}

export async function onRequest({ request, env, params }) {
  const path = [].concat(params.path || []).join("/"),
    method = request.method;
  // without the database the app must keep using accounts in the browser, so "ok" only when it is there
  if (path === "ping") return json(200, { ok: !!env.DB });
  if (!env.DB) return json(503, { error: "The accounts database is not connected yet." });
  const db = env.DB;
  try {
    await setUp(db);
    // Google sends the person back here after "Connect Gmail" (a plain link)
    if (path === "gmail/callback") return await gmailCallback(db, request, env);
    // the resume file itself, only to its owner
    if (path === "resume" && method === "GET") {
      const email = await sessionEmail(db, request);
      if (!email) return json(401, { error: "Please log in again." });
      const r = await db.prepare("SELECT * FROM resumes WHERE email = ?").bind(email).first(),
        bytes = r && (await readParts(db, email, "resume"));
      if (!bytes) return json(404, { error: "No resume uploaded." });
      return new Response(bytes, {
        headers: {
          "Content-Type": r.file_type,
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
          "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(r.file_name)}`,
        },
      });
    }
    let body = {};
    if (method !== "GET") {
      const raw = await request.text();
      if (raw.length > BODY_MAX) return json(413, { error: "This is too big to save." });
      try {
        body = JSON.parse(raw || "{}") || {};
      } catch {
        return json(400, { error: "The request was not valid." });
      }
    }
    if (path.startsWith("push/")) return await push(db, request, env, path, body);
    if (path.startsWith("gmail/") || path === "mail" || path.startsWith("mail/"))
      return await mail(db, request, env, path, body);
    return await api(db, request, path, method, body);
  } catch (e) {
    console.error(e);
    return json(500, { error: "Server error, try again." });
  }
}

async function api(db, request, path, method, body) {
  const now = Date.now();
  if (path === "signup") {
    const email = cleanEmail(body.email),
      name = String(body.name || "").trim(),
      pw = String(body.password || "");
    if (!name || !/^\S+@\S+\.\S+$/.test(email) || pw.length < 6)
      return json(400, { error: "Fill your name, a valid email and a 6+ character password." });
    if (await db.prepare("SELECT 1 FROM accounts WHERE email = ?").bind(email).first())
      return json(409, { error: "An account with this email already exists. Log in instead." });
    const { salt, hash } = await newPw(pw);
    await db
      .prepare(
        "INSERT INTO accounts (email, name, password_hash, password_salt, created_at) VALUES (?, ?, ?, ?, ?)"
      )
      .bind(email, name, hash, salt, now)
      .run();
    return json(200, { token: await newSession(db, email), name });
  }
  if (path === "login") {
    const email = cleanEmail(body.email);
    const a = await db.prepare("SELECT * FROM accounts WHERE email = ?").bind(email).first();
    const f = (await db.prepare("SELECT n, at FROM login_fails WHERE email = ?").bind(email).first()) || {
      n: 0,
      at: 0,
    };
    if (f.n >= 5 && now - f.at < 60_000)
      return json(429, { error: "Too many tries. Wait a minute and try again." });
    if (!a || !(await checkPw(a, String(body.password || "")))) {
      await db
        .prepare("INSERT OR REPLACE INTO login_fails (email, n, at) VALUES (?, ?, ?)")
        .bind(email, now - f.at < 60_000 ? f.n + 1 : 1, now)
        .run();
      return json(401, { error: "Email or password is wrong." });
    }
    await db.prepare("DELETE FROM login_fails WHERE email = ?").bind(email).run();
    return json(200, { token: await newSession(db, email), name: a.name, user: await readUser(db, email) });
  }
  if (path === "forgot") {
    // The app shows the PIN on screen (no email service), so anyone who knows an email can reset it
    const email = cleanEmail(body.email);
    if (!(await db.prepare("SELECT 1 FROM accounts WHERE email = ?").bind(email).first()))
      return json(404, { error: "No account with this email." });
    const last = await db.prepare("SELECT at FROM resets WHERE email = ?").bind(email).first();
    if (last && now - last.at < 15_000)
      return json(429, { error: "Wait a few seconds before getting a new PIN." });
    const pin = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
    await db
      .prepare("INSERT OR REPLACE INTO resets (email, pin, at, tries) VALUES (?, ?, ?, 0)")
      .bind(email, pin, now)
      .run();
    return json(200, { pin });
  }
  if (path === "verify" || path === "reset") {
    // "verify" only checks the PIN (step 2 of the app); "reset" checks it again and sets the password
    const email = cleanEmail(body.email);
    const r = await db.prepare("SELECT * FROM resets WHERE email = ?").bind(email).first();
    const a = await db.prepare("SELECT 1 FROM accounts WHERE email = ?").bind(email).first();
    if (!a || !r || now - r.at > 600_000) return json(400, { error: "This PIN has expired. Get a new PIN." });
    if (String(body.pin || "").trim() !== r.pin) {
      if (r.tries + 1 >= 5) {
        await db.prepare("DELETE FROM resets WHERE email = ?").bind(email).run();
        return json(429, { error: "Too many wrong PINs. Get a new PIN." });
      }
      await db.prepare("UPDATE resets SET tries = tries + 1 WHERE email = ?").bind(email).run();
      return json(400, { error: `Wrong PIN. ${5 - r.tries - 1} tries left.` });
    }
    if (path === "verify") return json(200, { ok: true });
    if (String(body.password || "").length < 6)
      return json(400, { error: "New password needs at least 6 characters." });
    const { salt, hash } = await newPw(String(body.password));
    await db.batch([
      db
        .prepare("UPDATE accounts SET password_hash = ?, password_salt = ? WHERE email = ?")
        .bind(hash, salt, email),
      db.prepare("DELETE FROM resets WHERE email = ?").bind(email),
      db.prepare("DELETE FROM login_fails WHERE email = ?").bind(email),
      db.prepare("DELETE FROM sessions WHERE email = ?").bind(email),
    ]);
    return json(200, { ok: true });
  }

  const email = await sessionEmail(db, request);
  if (!email) return json(401, { error: "Please log in again." });
  if (path === "user" && method === "GET") {
    const a = await db.prepare("SELECT name FROM accounts WHERE email = ?").bind(email).first();
    return json(200, { name: a.name, user: await readUser(db, email) });
  }
  if (path === "user" && method === "PUT") {
    const steps = writeParts(db, email, "user", new TextEncoder().encode(JSON.stringify(body)));
    if (typeof body.profile?.name === "string" && body.profile.name.trim())
      steps.push(
        db.prepare("UPDATE accounts SET name = ? WHERE email = ?").bind(body.profile.name.trim(), email)
      );
    await db.batch(steps);
    return json(200, { ok: true });
  }
  if (path === "user" && method === "DELETE") {
    await db.batch(
      ["parts", "resumes", "push_subs", "mail_accounts", "sessions", "login_fails", "resets", "accounts"].map(
        t => db.prepare(`DELETE FROM ${t} WHERE email = ?`).bind(email)
      )
    );
    return json(200, { ok: true });
  }
  if (path === "password") {
    const a = await db.prepare("SELECT * FROM accounts WHERE email = ?").bind(email).first();
    if (!(await checkPw(a, String(body.old || ""))))
      return json(400, { error: "Current password is wrong." });
    if (String(body.new || "").length < 6)
      return json(400, { error: "New password needs at least 6 characters." });
    const { salt, hash } = await newPw(String(body.new));
    await db
      .prepare("UPDATE accounts SET password_hash = ?, password_salt = ? WHERE email = ?")
      .bind(hash, salt, email)
      .run();
    return json(200, { ok: true });
  }
  if (path === "resume" && method === "PUT") {
    // the app sends { name, type, data: base64 }; the file comes back from GET /api/resume
    const name = String(body.name || "")
        .trim()
        .slice(0, 120),
      ext = (name.match(/\.[a-z0-9]+$/i)?.[0] || "").toLowerCase(),
      type = RESUME_TYPES[ext];
    if (!type) return json(400, { error: "Upload a PDF or Word (.docx) file." });
    let data;
    try {
      data = Uint8Array.from(atob(String(body.data || "")), c => c.charCodeAt(0));
    } catch {
      return json(400, { error: "This file couldn't be read." });
    }
    if (!data.length) return json(400, { error: "This file is empty." });
    if (data.length > RESUME_MAX) return json(413, { error: "The resume can be up to 2 MB." });
    await db.batch([
      ...writeParts(db, email, "resume", data),
      db
        .prepare(
          "INSERT OR REPLACE INTO resumes (email, file_name, file_type, size, uploaded_at) VALUES (?, ?, ?, ?, ?)"
        )
        .bind(email, name, type, data.length, now),
    ]);
    return json(200, { name, type, size: data.length, at: now });
  }
  if (path === "resume" && method === "DELETE") {
    await db.batch([
      db.prepare("DELETE FROM parts WHERE email = ? AND kind = 'resume'").bind(email),
      db.prepare("DELETE FROM resumes WHERE email = ?").bind(email),
    ]);
    return json(200, { ok: true });
  }
  if (path === "logout") {
    await db
      .prepare("DELETE FROM sessions WHERE token = ?")
      .bind((request.headers.get("Authorization") || "").replace(/^Bearer /, ""))
      .run();
    return json(200, { ok: true });
  }
  return json(404, { error: "Not found" });
}

/* ---------------------------------------------------------------- alerts with the app closed */
const vapidOf = env => ({
  publicKey: env.VAPID_PUBLIC_KEY,
  privateJwk: env.VAPID_PRIVATE_JWK,
  subject: "https://udyogam-vetuku.pages.dev",
});
const subOf = r => ({ endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } });

async function push(db, request, env, path, body) {
  const ready = !!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_JWK);
  if (path === "push/key") return json(200, { key: ready ? env.VAPID_PUBLIC_KEY : null });
  if (!ready) return json(503, { error: "Alerts with the app closed are not set up yet." });

  // the job bot, after every run: one alert per person for the new jobs that fit them
  if (path === "push/run") {
    const secret = (request.headers.get("Authorization") || "").replace(/^Bearer /, "");
    if (!env.NOTIFY_SECRET || secret !== env.NOTIFY_SECRET) return json(401, { error: "Wrong key." });
    const jobs = Array.isArray(body.jobs) ? body.jobs : [];
    const { results: subs } = await db.prepare("SELECT * FROM push_subs ORDER BY created_at").all();
    const emails = [...new Set(subs.map(s => s.email))];
    let sent = 0,
      removed = 0,
      people = 0;
    for (const email of emails) {
      if (sent >= PUSH_MAX || !jobs.length) break;
      const user = await readUser(db, email);
      if (!user?.prefs || user.notifications?.settings?.jobs === false) continue;
      const mine = jobs.filter(j => !user.hidden?.[j.id] && !user.jobs?.[j.id]?.stage && fits(j, user.prefs));
      if (!mine.length) continue;
      people++;
      const best = mine[0],
        n = mine.length;
      const message = {
        title: `${n} new job${n === 1 ? "" : "s"} for you`,
        body: `${best.title} at ${best.company}${n > 1 ? ` and ${n - 1} more` : ""}`,
        url: "./jobs",
        tag: "new-jobs",
      };
      for (const s of subs.filter(x => x.email === email)) {
        if (sent >= PUSH_MAX) break;
        const r = await sendPush(subOf(s), message, vapidOf(env)).catch(() => ({ ok: false }));
        if (r.ok) sent++;
        if (r.gone) {
          await db.prepare("DELETE FROM push_subs WHERE endpoint = ?").bind(s.endpoint).run();
          removed++;
        }
      }
    }
    return json(200, { jobs: jobs.length, people, sent, removed });
  }

  const email = await sessionEmail(db, request);
  if (!email) return json(401, { error: "Please log in again." });
  if (path === "push/subscribe") {
    const endpoint = String(body.endpoint || ""),
      p256dh = String(body.keys?.p256dh || ""),
      auth = String(body.keys?.auth || "");
    if (!/^https?:\/\//.test(endpoint) || !p256dh || !auth)
      return json(400, { error: "This browser didn't give a usable subscription." });
    await db
      .prepare(
        "INSERT OR REPLACE INTO push_subs (endpoint, email, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?)"
      )
      .bind(endpoint, email, p256dh, auth, Date.now())
      .run();
    return json(200, { ok: true });
  }
  if (path === "push/unsubscribe") {
    await db
      .prepare("DELETE FROM push_subs WHERE endpoint = ? AND email = ?")
      .bind(String(body.endpoint || ""), email)
      .run();
    return json(200, { ok: true });
  }
  if (path === "push/test") {
    const { results } = await db.prepare("SELECT * FROM push_subs WHERE email = ?").bind(email).all();
    let sent = 0;
    for (const s of results.slice(0, 5)) {
      const r = await sendPush(
        subOf(s),
        {
          title: "Alerts are on",
          body: "You'll get new jobs for you here, even when the app is closed.",
          url: "./jobs",
          tag: "alerts-on",
        },
        vapidOf(env)
      ).catch(() => ({ ok: false }));
      if (r.ok) sent++;
      if (r.gone) await db.prepare("DELETE FROM push_subs WHERE endpoint = ?").bind(s.endpoint).run();
    }
    return json(200, { sent });
  }
  return json(404, { error: "Not found" });
}

/* ---------------------------------------------------------------- application tracking from Gmail */
const STATUS_ALERT = {
  viewed: ["Your application was viewed", "{c} viewed your application for {t}."],
  shortlisted: ["You're shortlisted", "{c} shortlisted you for {t}."],
  interview: ["Interview stage", "{c} wants to interview you for {t}."],
  offer: ["You got an offer", "{c} made you an offer for {t}."],
  rejected: ["Not selected this time", "{c} moved ahead with other people for {t}."],
  applied: ["Application tracked", "Your application to {c} for {t} is in My jobs."],
};
const SYNC_EVERY = 15 * 60e3;
const googleOf = (env, request) => ({
  base: env.GOOGLE_BASE || "",
  clientId: env.GOOGLE_CLIENT_ID,
  clientSecret: env.GOOGLE_CLIENT_SECRET,
  redirectUri: new URL(request.url).origin + "/api/gmail/callback",
});
const gmailReady = env => !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.TOKEN_KEY);
const readMailState = async (db, email) => {
  const b = await readParts(db, email, "mail");
  return b ? JSON.parse(new TextDecoder().decode(b)) : { seen: [], jobs: {} };
};

async function mailStatus(db, email) {
  const row = await db
    .prepare("SELECT gmail, last_sync, error FROM mail_accounts WHERE email = ?")
    .bind(email)
    .first();
  if (!row) return { connected: false, canConnect: true };
  const st = await readMailState(db, email);
  return {
    connected: true,
    gmail: row.gmail,
    lastRun: row.last_sync || 0,
    error: row.error || "",
    jobs: st.jobs || {},
  };
}

// Read new job emails for one person, update their applications, and alert them when a status moved
async function syncMail(db, env, request, email) {
  const row = await db.prepare("SELECT * FROM mail_accounts WHERE email = ?").bind(email).first();
  if (!row) return { moved: [] };
  const g = googleOf(env, request),
    now = Date.now();
  try {
    const { access_token } = await G.refreshAccess({
      ...g,
      refreshToken: await G.unseal(row.token, env.TOKEN_KEY),
    });
    const state = await readMailState(db, email),
      user = (await readUser(db, email)) || {};
    const { events, read } = await G.readJobEmails({ base: g.base, access: access_token, seen: state.seen });
    const moved = await applyEvents(state, user.jobs || {}, events);
    state.seen = [...new Set([...(state.seen || []), ...read])].slice(-3000);
    await db.batch([
      ...writeParts(db, email, "mail", new TextEncoder().encode(JSON.stringify(state))),
      db.prepare("UPDATE mail_accounts SET last_sync = ?, error = '' WHERE email = ?").bind(now, email),
    ]);
    if (moved.length && user.notifications?.settings?.status !== false)
      await alertStatus(db, env, email, moved);
    return { moved };
  } catch (e) {
    await db
      .prepare("UPDATE mail_accounts SET last_sync = ?, error = ? WHERE email = ?")
      .bind(now, e.message || "Couldn't read Gmail.", email)
      .run();
    return { moved: [], error: e.message };
  }
}
async function alertStatus(db, env, email, moved) {
  if (!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_JWK)) return;
  const top = moved[moved.length - 1],
    [title, text] = STATUS_ALERT[top.stage] || STATUS_ALERT.applied;
  const message =
    moved.length > 1
      ? {
          title: `${moved.length} application updates`,
          body: moved
            .slice(-3)
            .map(m => `${m.company}: ${m.stage}`)
            .join(" · "),
          url: "./my-jobs",
          tag: "status",
        }
      : {
          title,
          body: text
            .replace("{c}", top.company || "The company")
            .replace("{t}", top.title || "your application"),
          url: "./my-jobs",
          tag: "status",
        };
  const { results } = await db.prepare("SELECT * FROM push_subs WHERE email = ?").bind(email).all();
  for (const s of results.slice(0, 5)) {
    const r = await sendPush(subOf(s), message, vapidOf(env)).catch(() => ({ ok: false }));
    if (r.gone) await db.prepare("DELETE FROM push_subs WHERE endpoint = ?").bind(s.endpoint).run();
  }
}

async function gmailCallback(db, request, env) {
  const url = new URL(request.url),
    back = r => Response.redirect(`${url.origin}/my-jobs?gmail=${r}`, 302);
  if (!gmailReady(env)) return back("error");
  if (url.searchParams.get("error")) return back("denied");
  const st = await G.readState(url.searchParams.get("state"), env.TOKEN_KEY).catch(() => null);
  if (!st?.email || !(await db.prepare("SELECT 1 FROM accounts WHERE email = ?").bind(st.email).first()))
    return back("error");
  try {
    const g = googleOf(env, request),
      t = await G.exchangeCode({ ...g, code: url.searchParams.get("code") || "" });
    if (!t.refresh_token) return back("error");
    if (!String(t.scope || G.SCOPE).includes("gmail.readonly")) return back("noscope");
    const me = await G.profile(g.base, t.access_token).catch(() => ({}));
    await db
      .prepare(
        "INSERT OR REPLACE INTO mail_accounts (email, gmail, token, connected_at, last_sync, error) VALUES (?, ?, ?, ?, 0, '')"
      )
      .bind(st.email, me.emailAddress || "", await G.seal(t.refresh_token, env.TOKEN_KEY), Date.now())
      .run();
    await syncMail(db, env, request, st.email); // the first emails, so My jobs fills straight away
    return back("connected");
  } catch {
    return back("error");
  }
}

async function mail(db, request, env, path, body) {
  // every 30 minutes (.github/workflows/mail.yml): the person checked longest ago, one per call
  if (path === "mail/run") {
    const secret = (request.headers.get("Authorization") || "").replace(/^Bearer /, "");
    if (!env.NOTIFY_SECRET || secret !== env.NOTIFY_SECRET) return json(401, { error: "Wrong key." });
    if (!gmailReady(env)) return json(200, { synced: 0, more: false });
    const due = Date.now() - 25 * 60e3;
    const { results } = await db
      .prepare(
        "SELECT email FROM mail_accounts WHERE COALESCE(last_sync, 0) < ? ORDER BY COALESCE(last_sync, 0) LIMIT 2"
      )
      .bind(due)
      .all();
    if (!results.length) return json(200, { synced: 0, more: false });
    const r = await syncMail(db, env, request, results[0].email);
    return json(200, { synced: 1, moved: r.moved.length, more: results.length > 1 });
  }
  const email = await sessionEmail(db, request);
  if (!email) return json(401, { error: "Please log in again." });
  if (!gmailReady(env)) {
    if (path === "mail") return json(200, { connected: false });
    return json(503, { error: "Gmail tracking is not set up yet." });
  }
  if (path === "mail" && request.method === "GET") {
    const row = await db
      .prepare("SELECT last_sync, error FROM mail_accounts WHERE email = ?")
      .bind(email)
      .first();
    if (row && !row.error && Date.now() - (row.last_sync || 0) > SYNC_EVERY)
      await syncMail(db, env, request, email);
    return json(200, await mailStatus(db, email));
  }
  if (path === "mail/sync") {
    const row = await db.prepare("SELECT last_ask FROM mail_accounts WHERE email = ?").bind(email).first();
    if (!row) return json(403, { error: "Gmail is not connected for this account." });
    if (Date.now() - (row.last_ask || 0) < 60_000)
      return json(429, { error: "Checked less than a minute ago. Try again soon." });
    await db.prepare("UPDATE mail_accounts SET last_ask = ? WHERE email = ?").bind(Date.now(), email).run();
    await syncMail(db, env, request, email);
    return json(200, await mailStatus(db, email));
  }
  if (path === "gmail/start") {
    const state = await G.signState({ email, exp: Date.now() + 10 * 60e3, n: randomHex(8) }, env.TOKEN_KEY);
    return json(200, { url: G.authUrl({ ...googleOf(env, request), state }) });
  }
  if (path === "gmail/disconnect") {
    const row = await db.prepare("SELECT token FROM mail_accounts WHERE email = ?").bind(email).first();
    if (row)
      await G.revoke({
        base: env.GOOGLE_BASE || "",
        token: await G.unseal(row.token, env.TOKEN_KEY).catch(() => ""),
      });
    await db.prepare("DELETE FROM mail_accounts WHERE email = ?").bind(email).run();
    return json(200, { ok: true });
  }
  return json(404, { error: "Not found" });
}
