-- Udyogam Vetuku accounts on the live site: Cloudflare D1 database "udyogam-db" (binding DB in wrangler.toml).
-- Used by functions/api/[[path]].js, which makes these tables itself on first use (this file is the reference).
-- The computer server (backend/server/server.mjs) uses database/schema.sql instead.
-- D1 keeps at most 2 MB in one row, so saved data and resumes are stored in 1.5 MB parts.

-- People who signed up. Passwords are never stored, only a PBKDF2-SHA256 hash and its salt.
CREATE TABLE IF NOT EXISTS accounts (email TEXT PRIMARY KEY, name TEXT NOT NULL, password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, created_at INTEGER);
-- One row per logged-in device; log out, password reset and account delete remove rows.
CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, email TEXT NOT NULL, created_at INTEGER);
CREATE INDEX IF NOT EXISTS sessions_email ON sessions (email);
-- kind "user": everything the app saves for a person (profile, job details, saved / applied jobs...) as JSON;
-- kind "resume": the resume file. Each in parts 0, 1, 2... of up to 1.5 MB.
CREATE TABLE IF NOT EXISTS parts (email TEXT NOT NULL, kind TEXT NOT NULL, part INTEGER NOT NULL, data BLOB, PRIMARY KEY (email, kind, part));
-- Details of the uploaded resume (the file itself is in parts).
CREATE TABLE IF NOT EXISTS resumes (email TEXT PRIMARY KEY, file_name TEXT NOT NULL, file_type TEXT NOT NULL, size INTEGER, uploaded_at INTEGER);
-- Wrong passwords in the last minute (5 → wait a minute).
CREATE TABLE IF NOT EXISTS login_fails (email TEXT PRIMARY KEY, n INTEGER, at INTEGER);
-- "Forgot password" PINs: 10 minutes, 5 tries.
CREATE TABLE IF NOT EXISTS resets (email TEXT PRIMARY KEY, pin TEXT NOT NULL, at INTEGER, tries INTEGER);
