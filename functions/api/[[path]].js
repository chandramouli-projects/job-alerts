/*
Accounts for the live site (Cloudflare Pages Functions + D1 database), so one login works on every
phone, computer and browser. Cloudflare runs this file for every /api/... link of the site; all
other links are the normal site files. It answers the same /api/... calls, with the same messages,
as backend/server/server.mjs (the server on this computer), so the app works the same with both.
Not here: Gmail status tracking (needs Python on a computer, see backend/server/mail-sync.mjs).

The database is the D1 binding "DB" set in wrangler.toml. Tables are in database/cloudflare.sql and
are made here on first use. D1 keeps at most 2 MB in one row, so a person's saved data and resume
are stored in parts of 1.5 MB (table "parts"). Free plan: 5 GB, 100,000 rows written a day.
*/
const SCHEMA = `
CREATE TABLE IF NOT EXISTS accounts (email TEXT PRIMARY KEY, name TEXT NOT NULL, password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, created_at INTEGER);
CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, email TEXT NOT NULL, created_at INTEGER);
CREATE INDEX IF NOT EXISTS sessions_email ON sessions (email);
CREATE TABLE IF NOT EXISTS parts (email TEXT NOT NULL, kind TEXT NOT NULL, part INTEGER NOT NULL, data BLOB, PRIMARY KEY (email, kind, part));
CREATE TABLE IF NOT EXISTS resumes (email TEXT PRIMARY KEY, file_name TEXT NOT NULL, file_type TEXT NOT NULL, size INTEGER, uploaded_at INTEGER);
CREATE TABLE IF NOT EXISTS login_fails (email TEXT PRIMARY KEY, n INTEGER, at INTEGER);
CREATE TABLE IF NOT EXISTS resets (email TEXT PRIMARY KEY, pin TEXT NOT NULL, at INTEGER, tries INTEGER);`;
const PART = 1_500_000;
const BODY_MAX = 5e6;
const RESUME_MAX = 2 * 1024 * 1024;
const RESUME_TYPES = { ".pdf": "application/pdf", ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".txt": "text/plain; charset=utf-8" };

let ready = null;   // tables made once per Cloudflare instance
const setUp = db => ready ||= db.batch(SCHEMA.trim().split(";").filter(s => s.trim()).map(s => db.prepare(s))).catch(e => { ready = null; throw e; });

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
const randomHex = n => hex(crypto.getRandomValues(new Uint8Array(n)));
const cleanEmail = v => String(v || "").trim().toLowerCase();

// Passwords: PBKDF2-SHA256, 100,000 rounds (the most Cloudflare allows), random salt; never stored as typed
async function hashPw(pw, salt) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveBits"]);
  return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", salt: new TextEncoder().encode(salt), iterations: 100_000, hash: "SHA-256" }, key, 256));
}
async function checkPw(a, pw) {
  const h = await hashPw(pw, a.password_salt);
  let diff = h.length ^ a.password_hash.length;   // same time whatever the answer
  for (let i = 0; i < h.length; i++) diff |= h.charCodeAt(i) ^ a.password_hash.charCodeAt(i % a.password_hash.length);
  return diff === 0;
}
async function newPw(pw) { const salt = randomHex(16); return { salt, hash: await hashPw(pw, salt) }; }

// Saved data and resumes, cut into 1.5 MB parts; all parts are replaced together
function writeParts(db, email, kind, bytes) {
  const out = [db.prepare("DELETE FROM parts WHERE email = ? AND kind = ?").bind(email, kind)];
  for (let i = 0, p = 0; i < bytes.length; i += PART, p++) out.push(db.prepare("INSERT INTO parts (email, kind, part, data) VALUES (?, ?, ?, ?)").bind(email, kind, p, bytes.slice(i, i + PART).buffer));   // D1 keeps an ArrayBuffer as a BLOB
  return out;
}
async function readParts(db, email, kind) {
  const { results } = await db.prepare("SELECT data FROM parts WHERE email = ? AND kind = ? ORDER BY part").bind(email, kind).all();
  if (!results.length) return null;
  const chunks = results.map(r => new Uint8Array(r.data)), out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.length; }
  return out;
}
const readUser = async (db, email) => { const b = await readParts(db, email, "user"); return b ? JSON.parse(new TextDecoder().decode(b)) : null; };

async function newSession(db, email) {
  const token = randomHex(32);
  await db.prepare("INSERT INTO sessions (token, email, created_at) VALUES (?, ?, ?)").bind(token, email, Date.now()).run();
  return token;
}
async function sessionEmail(db, request) {
  const t = (request.headers.get("Authorization") || "").replace(/^Bearer /, "");
  if (!t) return null;
  const s = await db.prepare("SELECT s.email FROM sessions s JOIN accounts a ON a.email = s.email WHERE s.token = ?").bind(t).first();
  return s ? s.email : null;
}

export async function onRequest({ request, env, params }) {
  const path = [].concat(params.path || []).join("/"), method = request.method;
  // without the database the app must keep using accounts in the browser, so "ok" only when it is there
  if (path === "ping") return json(200, { ok: !!env.DB });
  if (!env.DB) return json(503, { error: "The accounts database is not connected yet." });
  const db = env.DB;
  try {
    await setUp(db);
    // the resume file itself, only to its owner
    if (path === "resume" && method === "GET") {
      const email = await sessionEmail(db, request);
      if (!email) return json(401, { error: "Please log in again." });
      const r = await db.prepare("SELECT * FROM resumes WHERE email = ?").bind(email).first(), bytes = r && await readParts(db, email, "resume");
      if (!bytes) return json(404, { error: "No resume uploaded." });
      return new Response(bytes, { headers: { "Content-Type": r.file_type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(r.file_name)}` } });
    }
    let body = {};
    if (method !== "GET") {
      const raw = await request.text();
      if (raw.length > BODY_MAX) return json(413, { error: "This is too big to save." });
      try { body = JSON.parse(raw || "{}") || {}; } catch { return json(400, { error: "The request was not valid." }); }
    }
    return await api(db, request, path, method, body);
  } catch (e) {
    console.error(e);
    return json(500, { error: "Server error, try again." });
  }
}

async function api(db, request, path, method, body) {
  const now = Date.now();
  if (path === "signup") {
    const email = cleanEmail(body.email), name = String(body.name || "").trim(), pw = String(body.password || "");
    if (!name || !/^\S+@\S+\.\S+$/.test(email) || pw.length < 6) return json(400, { error: "Fill your name, a valid email and a 6+ character password." });
    if (await db.prepare("SELECT 1 FROM accounts WHERE email = ?").bind(email).first()) return json(409, { error: "An account with this email already exists. Log in instead." });
    const { salt, hash } = await newPw(pw);
    await db.prepare("INSERT INTO accounts (email, name, password_hash, password_salt, created_at) VALUES (?, ?, ?, ?, ?)").bind(email, name, hash, salt, now).run();
    return json(200, { token: await newSession(db, email), name });
  }
  if (path === "login") {
    const email = cleanEmail(body.email);
    const a = await db.prepare("SELECT * FROM accounts WHERE email = ?").bind(email).first();
    const f = await db.prepare("SELECT n, at FROM login_fails WHERE email = ?").bind(email).first() || { n: 0, at: 0 };
    if (f.n >= 5 && now - f.at < 60_000) return json(429, { error: "Too many tries. Wait a minute and try again." });
    if (!a || !(await checkPw(a, String(body.password || "")))) {
      await db.prepare("INSERT OR REPLACE INTO login_fails (email, n, at) VALUES (?, ?, ?)").bind(email, now - f.at < 60_000 ? f.n + 1 : 1, now).run();
      return json(401, { error: "Email or password is wrong." });
    }
    await db.prepare("DELETE FROM login_fails WHERE email = ?").bind(email).run();
    return json(200, { token: await newSession(db, email), name: a.name, user: await readUser(db, email) });
  }
  if (path === "forgot") {
    // The app shows the PIN on screen (no email service), so anyone who knows an email can reset it
    const email = cleanEmail(body.email);
    if (!(await db.prepare("SELECT 1 FROM accounts WHERE email = ?").bind(email).first())) return json(404, { error: "No account with this email." });
    const last = await db.prepare("SELECT at FROM resets WHERE email = ?").bind(email).first();
    if (last && now - last.at < 15_000) return json(429, { error: "Wait a few seconds before getting a new PIN." });
    const pin = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
    await db.prepare("INSERT OR REPLACE INTO resets (email, pin, at, tries) VALUES (?, ?, ?, 0)").bind(email, pin, now).run();
    return json(200, { pin });
  }
  if (path === "verify" || path === "reset") {
    // "verify" only checks the PIN (step 2 of the app); "reset" checks it again and sets the password
    const email = cleanEmail(body.email);
    const r = await db.prepare("SELECT * FROM resets WHERE email = ?").bind(email).first();
    const a = await db.prepare("SELECT 1 FROM accounts WHERE email = ?").bind(email).first();
    if (!a || !r || now - r.at > 600_000) return json(400, { error: "This PIN has expired. Get a new PIN." });
    if (String(body.pin || "").trim() !== r.pin) {
      if (r.tries + 1 >= 5) { await db.prepare("DELETE FROM resets WHERE email = ?").bind(email).run(); return json(429, { error: "Too many wrong PINs. Get a new PIN." }); }
      await db.prepare("UPDATE resets SET tries = tries + 1 WHERE email = ?").bind(email).run();
      return json(400, { error: `Wrong PIN. ${5 - r.tries - 1} tries left.` });
    }
    if (path === "verify") return json(200, { ok: true });
    if (String(body.password || "").length < 6) return json(400, { error: "New password needs at least 6 characters." });
    const { salt, hash } = await newPw(String(body.password));
    await db.batch([
      db.prepare("UPDATE accounts SET password_hash = ?, password_salt = ? WHERE email = ?").bind(hash, salt, email),
      db.prepare("DELETE FROM resets WHERE email = ?").bind(email),
      db.prepare("DELETE FROM login_fails WHERE email = ?").bind(email),
      db.prepare("DELETE FROM sessions WHERE email = ?").bind(email)]);
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
    if (typeof body.profile?.name === "string" && body.profile.name.trim()) steps.push(db.prepare("UPDATE accounts SET name = ? WHERE email = ?").bind(body.profile.name.trim(), email));
    await db.batch(steps);
    return json(200, { ok: true });
  }
  if (path === "user" && method === "DELETE") {
    await db.batch(["parts", "resumes", "sessions", "login_fails", "resets", "accounts"].map(t => db.prepare(`DELETE FROM ${t} WHERE email = ?`).bind(email)));
    return json(200, { ok: true });
  }
  if (path === "password") {
    const a = await db.prepare("SELECT * FROM accounts WHERE email = ?").bind(email).first();
    if (!(await checkPw(a, String(body.old || "")))) return json(400, { error: "Current password is wrong." });
    if (String(body.new || "").length < 6) return json(400, { error: "New password needs at least 6 characters." });
    const { salt, hash } = await newPw(String(body.new));
    await db.prepare("UPDATE accounts SET password_hash = ?, password_salt = ? WHERE email = ?").bind(hash, salt, email).run();
    return json(200, { ok: true });
  }
  if (path === "resume" && method === "PUT") {
    // the app sends { name, type, data: base64 }; the file comes back from GET /api/resume
    const name = String(body.name || "").trim().slice(0, 120), ext = (name.match(/\.[a-z0-9]+$/i)?.[0] || "").toLowerCase(), type = RESUME_TYPES[ext];
    if (!type) return json(400, { error: "Upload a PDF or Word (.docx) file." });
    let data;
    try { data = Uint8Array.from(atob(String(body.data || "")), c => c.charCodeAt(0)); } catch { return json(400, { error: "This file couldn't be read." }); }
    if (!data.length) return json(400, { error: "This file is empty." });
    if (data.length > RESUME_MAX) return json(413, { error: "The resume can be up to 2 MB." });
    await db.batch([...writeParts(db, email, "resume", data),
      db.prepare("INSERT OR REPLACE INTO resumes (email, file_name, file_type, size, uploaded_at) VALUES (?, ?, ?, ?, ?)").bind(email, name, type, data.length, now)]);
    return json(200, { name, type, size: data.length, at: now });
  }
  if (path === "resume" && method === "DELETE") {
    await db.batch([db.prepare("DELETE FROM parts WHERE email = ? AND kind = 'resume'").bind(email), db.prepare("DELETE FROM resumes WHERE email = ?").bind(email)]);
    return json(200, { ok: true });
  }
  // Gmail status tracking runs only on the computer server
  if (path === "mail" && method === "GET") return json(200, { connected: false });
  if (path === "mail/sync") return json(403, { error: "Gmail is not connected for this account." });
  if (path === "logout") {
    await db.prepare("DELETE FROM sessions WHERE token = ?").bind((request.headers.get("Authorization") || "").replace(/^Bearer /, "")).run();
    return json(200, { ok: true });
  }
  return json(404, { error: "Not found" });
}
