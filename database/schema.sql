-- Udyogam Vetuku database (SQLite). Used by backend/server/server.mjs through backend/server/database.mjs.
-- The file itself is database/app.db (not in git: it holds accounts and personal data).
-- Every person is identified by their email. Times are milliseconds since 1970 (JavaScript Date.now()).
-- Columns named "other" keep any extra fields as JSON, so nothing the app saves is ever lost.
-- REFERENCES shows which table a column points to; the server keeps these links consistent.

-- People who signed up. Passwords are never stored, only a scrypt hash and its salt.
CREATE TABLE IF NOT EXISTS accounts (
  email          TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  password_hash  TEXT NOT NULL,
  password_salt  TEXT NOT NULL,
  created_at     INTEGER,
  other          TEXT
);

-- One row per logged-in device. Logging out or changing the password removes rows.
CREATE TABLE IF NOT EXISTS sessions (
  token       TEXT PRIMARY KEY,
  email       TEXT NOT NULL REFERENCES accounts(email),
  created_at  INTEGER
);

-- Details from the Profile page.
CREATE TABLE IF NOT EXISTS profiles (
  email            TEXT PRIMARY KEY REFERENCES accounts(email),
  name             TEXT,
  phone            TEXT,
  headline         TEXT,
  location         TEXT,
  about            TEXT,
  current_company  TEXT,
  current_ctc      TEXT,
  expected_ctc     TEXT,
  notice_period    TEXT,
  education        TEXT,
  linkedin_url     TEXT,
  github_url       TEXT,
  portfolio_url    TEXT,
  resume_url       TEXT,
  other            TEXT
);

-- Answers from "Tell us the job you want" (onboarding). Lists are JSON arrays.
CREATE TABLE IF NOT EXISTS preferences (
  email             TEXT PRIMARY KEY REFERENCES accounts(email),
  roles             TEXT,     -- JSON, e.g. ["Java Developer", "QA / Testing"]
  custom_roles      TEXT,
  experience_years  INTEGER,  -- 0 = fresher
  cities            TEXT,     -- JSON
  skills            TEXT,     -- JSON
  custom_skills     TEXT,
  other             TEXT
);

-- Settings from the Profile page.
CREATE TABLE IF NOT EXISTS settings (
  email            TEXT PRIMARY KEY REFERENCES accounts(email),
  theme            TEXT,      -- system / light / dark
  days             INTEGER,
  hide_applied     INTEGER,   -- 1 = yes
  telegram_alerts  INTEGER,   -- 1 = yes
  min_match        INTEGER,
  github_token     TEXT,
  github_repo      TEXT,
  other            TEXT
);

-- Where each person is in the app.
CREATE TABLE IF NOT EXISTS user_state (
  email       TEXT PRIMARY KEY REFERENCES accounts(email),
  onboarded   INTEGER,        -- 1 = answered the onboarding questions
  created_at  INTEGER,
  last_seen   INTEGER,        -- previous visit, for the "New" badges
  this_visit  INTEGER,
  other       TEXT
);

-- Jobs a person hid with "Not interested".
CREATE TABLE IF NOT EXISTS hidden_jobs (
  email   TEXT NOT NULL REFERENCES accounts(email),
  job_id  TEXT NOT NULL,
  PRIMARY KEY (email, job_id)
);

-- Saved and applied jobs (My jobs, Saved jobs). "job" keeps a copy of the job, so it still shows
-- after the job leaves the job list.
CREATE TABLE IF NOT EXISTS tracked_jobs (
  email       TEXT NOT NULL REFERENCES accounts(email),
  job_id      TEXT NOT NULL,
  saved       INTEGER,        -- 1 = bookmarked
  saved_at    INTEGER,
  stage       TEXT,           -- applied / interview / offer / rejected, empty = only saved
  applied_at  INTEGER,
  notes       TEXT,
  job         TEXT,           -- JSON copy of the job
  other       TEXT,
  PRIMARY KEY (email, job_id)
);

-- Every step of a tracked job, oldest first (saved, applied, ...).
CREATE TABLE IF NOT EXISTS job_events (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  email   TEXT NOT NULL,
  job_id  TEXT NOT NULL,
  stage   TEXT,
  at      INTEGER,
  other   TEXT
);

-- Gmail status tracking (backend/server/mail-sync.mjs): one row per Gmail account.
CREATE TABLE IF NOT EXISTS mail_sync (
  email     TEXT PRIMARY KEY,
  last_run  INTEGER,
  error     TEXT,
  seen      TEXT,             -- JSON list of email ids already read
  other     TEXT
);

-- Applications found in emails, with the latest status the emails gave.
CREATE TABLE IF NOT EXISTS mail_jobs (
  email   TEXT NOT NULL,
  job_id  TEXT NOT NULL,
  stage   TEXT,               -- applied / viewed / shortlisted / interview / offer / rejected
  job     TEXT,               -- JSON copy of the job
  other   TEXT,
  PRIMARY KEY (email, job_id)
);

-- Each status email that was matched to an application, oldest first.
CREATE TABLE IF NOT EXISTS mail_events (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  email    TEXT NOT NULL,
  job_id   TEXT NOT NULL,
  stage    TEXT,
  at       INTEGER,
  via      TEXT,
  site     TEXT,
  subject  TEXT,
  other    TEXT
);

-- Each person's uploaded resume (PDF or Word), one per account. Kept out of the tables above because
-- the server rewrites those on every save; this one is written only on upload and remove.
CREATE TABLE IF NOT EXISTS resumes (
  email        TEXT PRIMARY KEY REFERENCES accounts(email),
  file_name    TEXT NOT NULL,
  file_type    TEXT NOT NULL,   -- application/pdf, ...wordprocessingml.document or text/plain
  size         INTEGER,         -- bytes
  data         BLOB NOT NULL,
  uploaded_at  INTEGER
);
