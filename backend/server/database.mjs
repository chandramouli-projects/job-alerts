/*
The database: SQLite tables (see database/schema.sql) behind the same simple object the server uses:
  db.accounts[email] = { name, hash, salt, createdAt }
  db.sessions[token] = { email, at }
  db.users[email]    = everything the app saves for a person (profile, prefs, settings, jobs, hidden, ...)
  db.mail[email]     = Gmail status tracking ({ seen, jobs, lastRun, error })
openDatabase() reads the tables into that object; save() writes it back in one transaction.
There are only a few people, so save() rewrites every row; simple, and obviously right.
The first time, accounts from the old data/users.json are imported and that file moves to database/backups/.
SQLite comes with Node.js (node:sqlite), so there is nothing to install.
*/
import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync, readFileSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";

/* ---------------------------------------------------------------- column maps
   [table column, key in the object, type]; type is text (default), int, bool or json.
   A value of another type, and any key not listed, goes to the row's "other" JSON column. */
const ACCOUNT = [["name", "name"], ["password_hash", "hash"], ["password_salt", "salt"], ["created_at", "createdAt", "int"]];
const PROFILE = [["name", "name"], ["phone", "phone"], ["headline", "headline"], ["location", "location"], ["about", "about"],
  ["current_company", "currentCompany"], ["current_ctc", "currentCtc"], ["expected_ctc", "expectedCtc"], ["notice_period", "notice"],
  ["education", "education"], ["linkedin_url", "linkedin"], ["github_url", "github"], ["portfolio_url", "portfolio"], ["resume_url", "resume"]];
const PREFS = [["roles", "roles", "json"], ["custom_roles", "custom"], ["experience_years", "exp", "int"],
  ["cities", "cities", "json"], ["skills", "skills", "json"], ["custom_skills", "customSkills"]];
const SETTINGS = [["theme", "theme"], ["days", "days", "int"], ["hide_applied", "hideApplied", "bool"], ["telegram_alerts", "telegram", "bool"],
  ["min_match", "minMatch", "int"], ["github_token", "ghToken"], ["github_repo", "ghRepo"]];
const STATE = [["onboarded", "onboarded", "bool"], ["created_at", "createdAt", "int"], ["last_seen", "lastSeen", "int"], ["this_visit", "thisVisit", "int"]];
const TRACKED = [["saved", "saved", "bool"], ["saved_at", "savedAt", "int"], ["stage", "stage"], ["applied_at", "appliedAt", "int"],
  ["notes", "notes"], ["job", "snap", "json"]];
const EVENT = [["stage", "stage"], ["at", "at", "int"]];
const MAIL = [["last_run", "lastRun", "int"], ["error", "error"], ["seen", "seen", "json"]];
const MAIL_JOB = [["stage", "stage"], ["job", "snap", "json"]];
const MAIL_EVENT = [["stage", "stage"], ["at", "at", "int"], ["via", "via"], ["site", "site"], ["subject", "subject"]];
// parts of a person's saved data that have their own tables; the rest goes to user_state
const USER_PARTS = ["profile", "prefs", "settings", "jobs", "hidden"];

const fits = (v, type) => type === "int" ? typeof v === "number" && Number.isFinite(v)
  : type === "bool" ? typeof v === "boolean" : type === "json" ? typeof v === "object" : typeof v === "string";

// object -> row values (null columns are empty; extra keys go to "other")
function toRow(obj, cols) {
  const row = {}, other = { ...obj };
  for (const [col, key, type = "text"] of cols) {
    const v = obj[key];
    delete other[key];
    if (v === undefined || v === null) row[col] = null;
    else if (fits(v, type)) row[col] = type === "bool" ? (v ? 1 : 0) : type === "json" ? JSON.stringify(v) : v;
    else { row[col] = null; other[key] = v; }
  }
  row.other = Object.keys(other).length ? JSON.stringify(other) : null;
  return row;
}
// row -> object (empty columns are left out, so the app's defaults fill them)
function fromRow(row, cols) {
  const obj = {};
  for (const [col, key, type = "text"] of cols) {
    const v = row[col];
    if (v === null || v === undefined) continue;
    obj[key] = type === "bool" ? !!v : type === "json" ? JSON.parse(v) : type === "int" ? Number(v) : v;
  }
  return row.other ? Object.assign(obj, JSON.parse(row.other)) : obj;
}

export function openDatabase({ file, legacyFile }) {
  mkdirSync(dirname(file), { recursive: true });
  // REFERENCES in schema.sql show how the tables connect; the server keeps them consistent itself,
  // so a save never fails half-way because of the order rows are written in
  const sql = new DatabaseSync(file, { enableForeignKeyConstraints: false });
  sql.exec(readFileSync(new URL("../../database/schema.sql", import.meta.url), "utf8"));

  const statements = new Map();
  function insert(table, values) {
    const cols = Object.keys(values), key = table + ":" + cols.join(",");
    if (!statements.has(key)) statements.set(key, sql.prepare(`INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`));
    statements.get(key).run(...Object.values(values));
  }
  const rows = (table, order = "rowid") => sql.prepare(`SELECT * FROM ${table} ORDER BY ${order}`).all();
  const byEmail = table => new Map(rows(table).map(r => [r.email, r]));
  const group = (table, keyOf) => {
    const m = new Map();
    for (const r of rows(table, table.endsWith("events") ? "id" : "rowid")) { const k = keyOf(r); if (!m.has(k)) m.set(k, []); m.get(k).push(r); }
    return m;
  };

  /* ---------------------------------------------------------------- tables -> object */
  function load() {
    const db = { accounts: {}, sessions: {}, users: {}, mail: {} };
    for (const r of rows("accounts")) db.accounts[r.email] = fromRow(r, ACCOUNT);
    for (const r of rows("sessions")) db.sessions[r.token] = { email: r.email, at: r.created_at };

    const profiles = byEmail("profiles"), prefs = byEmail("preferences"), settings = byEmail("settings");
    const hidden = group("hidden_jobs", r => r.email), tracked = group("tracked_jobs", r => r.email);
    const events = group("job_events", r => r.email + "\n" + r.job_id);
    for (const s of rows("user_state")) {
      const u = fromRow(s, STATE), email = s.email;
      if (profiles.has(email)) u.profile = fromRow(profiles.get(email), PROFILE);
      if (prefs.has(email)) u.prefs = fromRow(prefs.get(email), PREFS);
      if (settings.has(email)) u.settings = fromRow(settings.get(email), SETTINGS);
      u.hidden = Object.fromEntries((hidden.get(email) || []).map(r => [r.job_id, 1]));
      u.jobs = {};
      for (const t of tracked.get(email) || [])
        u.jobs[t.job_id] = { ...fromRow(t, TRACKED), history: (events.get(email + "\n" + t.job_id) || []).map(e => fromRow(e, EVENT)) };
      db.users[email] = u;
    }

    const mailJobs = group("mail_jobs", r => r.email), mailEvents = group("mail_events", r => r.email + "\n" + r.job_id);
    for (const m of rows("mail_sync")) {
      const st = { seen: [], ...fromRow(m, MAIL), jobs: {} };
      for (const j of mailJobs.get(m.email) || [])
        st.jobs[j.job_id] = { ...fromRow(j, MAIL_JOB), history: (mailEvents.get(m.email + "\n" + j.job_id) || []).map(e => fromRow(e, MAIL_EVENT)) };
      db.mail[m.email] = st;
    }
    return db;
  }

  /* ---------------------------------------------------------------- object -> tables */
  function save(db) {
    sql.exec("BEGIN");
    try {
      // children first, then the accounts they belong to
      for (const t of ["mail_events", "mail_jobs", "mail_sync", "job_events", "tracked_jobs", "hidden_jobs", "user_state",
        "settings", "preferences", "profiles", "sessions", "accounts"]) sql.exec(`DELETE FROM ${t}`);

      for (const [email, a] of Object.entries(db.accounts)) insert("accounts", { email, ...toRow(a, ACCOUNT) });
      for (const [token, s] of Object.entries(db.sessions)) insert("sessions", { token, email: s.email, created_at: s.at ?? null });

      for (const [email, u] of Object.entries(db.users)) {
        if (!u || typeof u !== "object") continue;
        const rest = { ...u };
        for (const k of USER_PARTS) delete rest[k];
        insert("user_state", { email, ...toRow(rest, STATE) });
        if (u.profile && typeof u.profile === "object") insert("profiles", { email, ...toRow(u.profile, PROFILE) });
        if (u.prefs && typeof u.prefs === "object") insert("preferences", { email, ...toRow(u.prefs, PREFS) });
        if (u.settings && typeof u.settings === "object") insert("settings", { email, ...toRow(u.settings, SETTINGS) });
        for (const jobId of Object.keys(u.hidden || {})) insert("hidden_jobs", { email, job_id: jobId });
        for (const [jobId, t] of Object.entries(u.jobs || {})) {
          const { history, ...job } = t || {};
          insert("tracked_jobs", { email, job_id: jobId, ...toRow(job, TRACKED) });
          for (const h of Array.isArray(history) ? history : []) insert("job_events", { email, job_id: jobId, ...toRow(h, EVENT) });
        }
      }

      for (const [email, st] of Object.entries(db.mail || {})) {
        const { jobs, ...m } = st || {};
        insert("mail_sync", { email, ...toRow(m, MAIL) });
        for (const [jobId, o] of Object.entries(jobs || {})) {
          const { history, ...job } = o || {};
          insert("mail_jobs", { email, job_id: jobId, ...toRow(job, MAIL_JOB) });
          for (const h of Array.isArray(history) ? history : []) insert("mail_events", { email, job_id: jobId, ...toRow(h, MAIL_EVENT) });
        }
      }
      sql.exec("COMMIT");
    } catch (e) {
      sql.exec("ROLLBACK");
      throw e;
    }
  }

  /* ---------------------------------------------------------------- first run: import the old JSON file */
  const empty = !sql.prepare("SELECT 1 FROM accounts LIMIT 1").get();
  if (empty && legacyFile && existsSync(legacyFile)) {
    const old = JSON.parse(readFileSync(legacyFile, "utf8"));
    save({ accounts: old.accounts || {}, sessions: old.sessions || {}, users: old.users || {}, mail: old.mail || {} });
    const backups = join(dirname(file), "backups");
    mkdirSync(backups, { recursive: true });
    renameSync(legacyFile, join(backups, `users-${new Date().toISOString().slice(0, 10)}.json`));
    console.log(`Imported ${Object.keys(old.accounts || {}).length} account(s) from ${legacyFile} into the database.`);
  }

  return { load, save, close: () => sql.close() };
}
