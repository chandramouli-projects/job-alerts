/*
Run the portal from this computer, for any device on the same Wi-Fi:
  node worker/server.mjs            ->  http://<this computer's IP>:8080
  node worker/server.mjs 3000       ->  port 3000
Serves docs/, answers /search with worker.js (live search), and keeps accounts in
data/users.json so the same login works on every device and browser.
Keys come from .env (RAPIDAPI_KEY and/or ADZUNA_APP_ID + ADZUNA_APP_KEY) and are read again on
every search, so no restart after editing .env.
*/
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { networkInterfaces } from "node:os";
import { randomBytes, randomInt, scryptSync, timingSafeEqual } from "node:crypto";
import worker from "./worker.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DOCS = join(ROOT, "docs");
// USERS_FILE / ENV_FILE let the automated tests use their own accounts file and no API keys
const USERS = process.env.USERS_FILE || join(ROOT, "data", "users.json");
const PORT = +(process.argv[2] || process.env.PORT || 8080);
const TYPES = { ".html": "text/html; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon" };

function env() {
  const out = {}, f = process.env.ENV_FILE || join(ROOT, ".env");
  if (!existsSync(f)) return out;
  for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
    const i = line.indexOf("=");
    if (i > 0 && !line.trim().startsWith("#")) {
      const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
      if (v) out[line.slice(0, i).trim()] = v;
    }
  }
  return out;
}

// Stand-in for Cloudflare's cache, kept in memory while this runs
const store = new Map();
globalThis.caches = { default: {
  async match(req) {
    const e = store.get(req.url);
    return e && e.until > Date.now() ? new Response(e.body) : undefined;
  },
  async put(req, res) {
    const age = +((res.headers.get("Cache-Control") || "").match(/max-age=(\d+)/)?.[1] || 0);
    store.set(req.url, { body: await res.text(), until: Date.now() + age * 1000 });
  },
} };

/* ---------------------------------------------------------------- accounts */
const db = existsSync(USERS) ? JSON.parse(readFileSync(USERS, "utf8")) : { accounts: {}, users: {}, sessions: {} };
function saveDb() {
  writeFileSync(USERS + ".tmp", JSON.stringify(db));
  renameSync(USERS + ".tmp", USERS);
}
const hash = (pw, salt) => scryptSync(pw, salt, 32).toString("hex");
function checkPw(a, pw) {
  const h = Buffer.from(hash(pw, a.salt), "hex");
  return h.length === Buffer.from(a.hash, "hex").length && timingSafeEqual(h, Buffer.from(a.hash, "hex"));
}
function setPw(a, pw) { a.salt = randomBytes(16).toString("hex"); a.hash = hash(pw, a.salt); }
function newSession(email) {
  const token = randomBytes(32).toString("hex");
  db.sessions[token] = { email, at: Date.now() };
  return token;
}
const sessionEmail = req => {
  const t = (req.headers.authorization || "").replace(/^Bearer /, "");
  const s = t && db.sessions[t];
  return s && db.accounts[s.email] ? s.email : null;
};
const fails = new Map();     // email -> recent wrong passwords, to slow down guessing
const resets = new Map();    // email -> reset PIN from "Forgot password", 10 minutes, 5 tries

async function api(req, path) {
  const body = req.method === "GET" ? {} : JSON.parse(await readBody(req) || "{}");
  if (path === "ping") return [200, { ok: true }];
  if (path === "signup") {
    const email = String(body.email || "").trim().toLowerCase(), name = String(body.name || "").trim();
    const pw = String(body.password || "");
    if (!name || !/^\S+@\S+\.\S+$/.test(email) || pw.length < 6) return [400, { error: "Fill your name, a valid email and a 6+ character password." }];
    if (db.accounts[email]) return [409, { error: "An account with this email already exists. Log in instead." }];
    const a = { name, createdAt: Date.now() };
    setPw(a, pw);
    db.accounts[email] = a;
    const token = newSession(email);
    saveDb();
    return [200, { token, name }];
  }
  if (path === "login") {
    const email = String(body.email || "").trim().toLowerCase(), a = db.accounts[email];
    const f = fails.get(email) || { n: 0, at: 0 };
    if (f.n >= 5 && Date.now() - f.at < 60_000) return [429, { error: "Too many tries. Wait a minute and try again." }];
    if (!a || !checkPw(a, String(body.password || ""))) {
      fails.set(email, { n: f.n + 1, at: Date.now() });
      return [401, { error: "Email or password is wrong." }];
    }
    fails.delete(email);
    const token = newSession(email);
    saveDb();
    return [200, { token, name: a.name, user: db.users[email] || null }];
  }
  if (path === "forgot") {
    // The app shows the PIN on screen (no email service), so anyone who knows an email can reset it
    const email = String(body.email || "").trim().toLowerCase();
    if (!db.accounts[email]) return [404, { error: "No account with this email." }];
    const last = resets.get(email);
    if (last && Date.now() - last.at < 15_000) return [429, { error: "Wait a few seconds before getting a new PIN." }];
    const pin = String(randomInt(0, 1_000_000)).padStart(6, "0");
    resets.set(email, { pin, at: Date.now(), tries: 0 });
    return [200, { pin }];
  }
  if (path === "verify" || path === "reset") {
    // "verify" only checks the PIN (step 2 of the app); "reset" checks it again and sets the password
    const email = String(body.email || "").trim().toLowerCase(), r = resets.get(email), a = db.accounts[email];
    if (!a || !r || Date.now() - r.at > 600_000) return [400, { error: "This PIN has expired. Get a new PIN." }];
    if (String(body.pin || "").trim() !== r.pin) {
      if (++r.tries >= 5) { resets.delete(email); return [429, { error: "Too many wrong PINs. Get a new PIN." }]; }
      return [400, { error: `Wrong PIN. ${5 - r.tries} tries left.` }];
    }
    if (path === "verify") return [200, { ok: true }];
    if (String(body.password || "").length < 6) return [400, { error: "New password needs at least 6 characters." }];
    setPw(a, String(body.password));
    resets.delete(email); fails.delete(email);
    for (const [t, s] of Object.entries(db.sessions)) if (s.email === email) delete db.sessions[t];
    saveDb();
    return [200, { ok: true }];
  }
  const email = sessionEmail(req);
  if (!email) return [401, { error: "Please log in again." }];
  if (path === "user" && req.method === "GET") return [200, { name: db.accounts[email].name, user: db.users[email] || null }];
  if (path === "user" && req.method === "PUT") {
    db.users[email] = body;
    if (body.profile?.name) db.accounts[email].name = body.profile.name;
    saveDb();
    return [200, { ok: true }];
  }
  if (path === "user" && req.method === "DELETE") {
    delete db.accounts[email]; delete db.users[email];
    for (const [t, s] of Object.entries(db.sessions)) if (s.email === email) delete db.sessions[t];
    saveDb();
    return [200, { ok: true }];
  }
  if (path === "password") {
    const a = db.accounts[email];
    if (!checkPw(a, String(body.old || ""))) return [400, { error: "Current password is wrong." }];
    if (String(body.new || "").length < 6) return [400, { error: "New password needs at least 6 characters." }];
    setPw(a, String(body.new));
    saveDb();
    return [200, { ok: true }];
  }
  if (path === "logout") {
    delete db.sessions[(req.headers.authorization || "").replace(/^Bearer /, "")];
    saveDb();
    return [200, { ok: true }];
  }
  return [404, { error: "Not found" }];
}

function readBody(req) {
  return new Promise((ok, fail) => {
    let s = "";
    req.on("data", c => { s += c; if (s.length > 5e6) { fail(new Error("too big")); req.destroy(); } });
    req.on("end", () => ok(s));
  });
}

/* ---------------------------------------------------------------- server */
createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  try {
    if (url.pathname.startsWith("/api/")) {
      const [status, out] = await api(req, url.pathname.slice(5));
      res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      res.end(JSON.stringify(out));
      return;
    }
    if (url.pathname === "/search") {
      const r = await worker.fetch(new Request(url), env(), { waitUntil: () => {} });
      res.writeHead(r.status, Object.fromEntries(r.headers));
      res.end(await r.text());
      console.log(`search "${url.searchParams.get("q")}" ${url.searchParams.get("where") || ""} -> ${r.status} ${r.headers.get("X-Cache") || ""}`);
      return;
    }
    const path = normalize(join(DOCS, decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname)));
    if (!path.startsWith(DOCS)) { res.writeHead(403).end(); return; }
    let body = await readFile(path);
    if (url.pathname === "/jobs.json") {        // live search goes to this same server
      const data = JSON.parse(body);
      data.live_api = `//${req.headers.host}`;
      body = JSON.stringify(data);
    }
    res.writeHead(200, { "Content-Type": TYPES[extname(path)] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(body);
  } catch (e) {
    const missing = e.code === "ENOENT";
    if (!res.headersSent) res.writeHead(missing ? 404 : 500);
    res.end(missing ? "Not found" : "Server error");
    if (!missing) console.error(e);
  }
}).listen(PORT, "0.0.0.0", () => {
  const k = env();
  const ips = Object.values(networkInterfaces()).flat().filter(i => i && i.family === "IPv4" && !i.internal).map(i => i.address);
  console.log("Job portal is running. Open on any device on this Wi-Fi:");
  for (const ip of ips) console.log(`  http://${ip}:${PORT}`);
  console.log(`  (on this computer: http://localhost:${PORT})`);
  console.log(`Accounts: ${Object.keys(db.accounts).length}. Live search keys in .env: Adzuna ${k.ADZUNA_APP_ID && k.ADZUNA_APP_KEY ? "yes" : "no"}, JSearch ${k.RAPIDAPI_KEY ? "yes" : "no"}`);
});
