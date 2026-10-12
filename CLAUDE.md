# Job Alerts

Personal job finder for India. `backend/collector/fetch_jobs.py` runs on GitHub Actions, collects jobs, saves them
for a static portal, and sends matching ones to Telegram.

## How it fits together
- `.github/workflows/jobs.yml`: runs 6x a day (7 AM–10 PM IST) and on "Run workflow" (optional
  `query` input becomes `SEARCH_QUERY`). After the run, the bot commits `frontend/data/jobs.json` and
  `database/state.json` as "New jobs <date>". Expect these commits, so `git pull` before pushing.
- `backend/collector/fetch_jobs.py`: one script, no framework. Sources (each skipped if its key is missing):
  - JSearch (RapidAPI): free plan is ~200 calls/month, so **one call per run**, rotating through
    `jsearch_groups` using `state["turn"]`. Don't add JSearch calls per run without checking quota.
    The working endpoint path is cached in `state["jsearch_path"]`.
  - Adzuna: `adzuna_roles_per_run` roles per run, rotating.
  - Jooble (`JOOBLE_KEY`): `jooble_roles_per_run` roles per run, rotating like Adzuna. Brings
    Naukri / Foundit / Shine jobs; `site_name()` turns their domains into one name per site.
  - `company_boards`: public Greenhouse / Lever / Ashby / SmartRecruiters / Workday APIs (no key).
    Workday slug is `host/site` (e.g. `accenture.wd103/AccentureCareers`); the India filter is
    found from the company's own facets, and `pages` (×20 newest jobs) defaults to 3. Slugs that
    404 show in `database/state.json` → `last_run.company_boards.failed`; remove those from config.
- Naukri, LinkedIn, Indeed, Glassdoor, Instahyre, Internshala, Unstop, Apna etc. have no free API
  and block scraping (Naukri answers 406). Don't scrape them.
- `backend/collector/config.json`: `search_roles` feeds the portal; `alerts` decides only what goes to Telegram
  (`telegram_enabled` is currently false).
- The portal (`frontend/`, served by Cloudflare Pages at udyogam-vetuku.pages.dev; `wrangler.toml` sets
  the folder), no build step and no framework. It loads `data/jobs.json`;
  profile, saved jobs and applications live in the browser's localStorage (or the local server).
  - `frontend/index.html`: only the HTML of each screen (login, onboarding, app frame, pop-ups), then
    `<link>`s and `<script>`s in a fixed order.
  - `frontend/css/` and `frontend/js/` are split by kind: `base/` (css) or `core/` (js: constants,
    helpers, state, router, app), `services/` (js: data and logic, e.g. job-store, matching,
    mail-tracking), `components/` (parts used on many screens: header, job-card, filters,
    job-details, applications…) and `pages/` (one file per screen: login, forgot-password,
    onboarding, jobs, saved, my-jobs, profile). New code goes in the folder for its kind, in the
    file for its screen or part; a new file must also be added to `index.html` in the right order.
  - Scripts are plain (not modules) and share one global scope, so load order matters:
    `core/constants` first, `core/app.js` (calls `boot()`) last. CSS order matters too (`base/` first).
  - Button clicks after login: each screen file registers its own with `onAppClick((d, t, e) => …)`
    (from `helpers.js`); `d` is the clicked button's `data-*`.
  - Matching (`services/matching.js`): roles and skills match whole words with `hasWord()` ("java"
    is not in "javascript", "react" is in "reactjs"). `taste()` learns from saved / applied (+) and
    hidden (−) jobs; it only changes the "Best fit" order, never the match %. Links on the page go
    through `safeUrl()` (http/https only); `cleanJob()` drops jobs with no such link.
  - URLs: `js/router.js` gives every screen its own link (`/login`, `/signup`, `/forgot-password`,
    `/setup`, `/jobs`, `/saved`, `/my-jobs`, `/profile`, `/job?id=…`). It wraps the screen functions
    (`showAuth`, `go`, `openJob`, `closeSheet`, `openForgot`…) instead of editing them; a new screen
    needs an entry in `ROUTE_OF_VIEW`. Routes stay one level deep so relative `css/` `js/` links
    work. The host must answer unknown links with `index.html`: Cloudflare Pages does (no
    `404.html` in `frontend/`, or it stops), `backend/server/server.mjs` does for links without an extension;
    GitHub Pages doesn't, so a refresh on `/jobs` there is a 404.
- `backend/worker/worker.js`: Cloudflare Worker for live search, pasted into the Cloudflare dashboard by
  hand, so no wrangler. `GET /search?q=&where=` uses ONE source at a time (the user asked
  for this): Adzuna first; if its limit is used up (401/403/429) it rests for `REST_HOURS` and
  JSearch is used alone until then. Both used up → `{jobs:[], limit:true}` (429) and the app keeps
  the saved jobs with a one-time message. Don't call both sources for the same search. JSearch
  answers are cached 24h and returns jobs in the same shape as
  `jobs.json`, cached for 12h. Its helpers (job id, years, city, tech) copy the ones in
  `fetch_jobs.py`; change both together, because the job id must match for dedupe. The URL goes in
  `config.json` `live_search_url`, then `fetch_jobs.py` copies it into `jobs.json` as `live_api`.
  The app calls it on search submit and for the user's own roles when it opens; a search shows
  every match, not just "Jobs for me".
  Every search also fetches related jobs: `RELATED` (job families → related titles) gives up to 2
  extra Adzuna `title_only` calls; a role not in `RELATED` uses its main words inside the Adzuna
  category of the exact results. Those jobs carry `related: true`; the app (`liveSearch` in
  `js/job-store.js`) tags them with the search, and `feed()` in `js/filters.js` shows them after the
  exact matches with a "Related" badge. Up to 3 Adzuna calls per new search, cached 12h.
  After changing `worker.js`, it must be pasted into Cloudflare again (and the local server restarted).
- Adzuna free limits are 25/min, 250/day, 1,000/week, 2,500/month, shared by the Action
  (`adzuna_roles_per_run` × 6 runs/day) and the Worker.
- `database/state.json`: run counter plus what each source returned. Check here first when debugging.

## Running locally
- Portal server: `node backend/server/server.mjs [port]` (default 8080, binds 0.0.0.0 for the LAN). It serves
  `frontend/`, answers `/search` with `backend/worker/worker.js`, reads `.env` on every search, and points `live_api` at
  itself. It also has `/api/*` accounts (signup, login, user GET/PUT/DELETE, password, logout) with
  scrypt hashes and session tokens in the SQLite database `database/app.db` (gitignored; tables in
  `database/schema.sql`). `backend/server/database.mjs` loads the tables into the same
  `db = {accounts, sessions, users, mail}` object the server code uses and `saveDb()` writes it back
  (full rewrite in one transaction; columns named `other` keep unknown fields as JSON, so nothing is
  lost). It uses Node's built-in `node:sqlite` (no install). The old `data/users.json` is imported
  once and moved to `database/backups/`. Tests use `DB_FILE` for their own database. The app checks `api/ping`.
  If the server answers, accounts live there; if not (GitHub Pages), they stay in the browser's
  localStorage, which is per browser and per address.
- Forgot password (modal on the login page): `/api/forgot` makes a 6-digit PIN that the app **shows
  on screen**, because there is no email service. `/api/reset` takes PIN + new password (10 min,
  5 tries) and logs out other sessions. The user chose this on purpose; it isn't real identity
  proof, since anyone who knows an email can reset it. Sending the PIN by email is the upgrade.
- `pip install requests`, copy `.env.example` to `.env`, then `python backend/collector/fetch_jobs.py`.
  The script reads `.env` itself. `.env` is gitignored, so never commit it.
- A local run spends JSearch quota, moves `turn` forward, and rewrites `frontend/data/jobs.json` and
  `database/state.json`. Don't commit those files after a local run; let the bot own them.

## Application status from Gmail
- LinkedIn / Naukri have no API for application status, and scraping them is not allowed, so status
  comes from the person's job-site emails. `backend/mail/track_mail.py` (stdlib `imaplib`, Gmail App password from
  `.env`) reads only mail from job sites / hiring systems (`SENDERS`), with `BODY.PEEK` so it stays unread,
  and turns each into {stage, company, title, site}. Rules: `STAGE_RULES` (most advanced first), `SKIP`
  for job alerts. Unit tests: `python -m unittest tests/test_track_mail.py`.
- `backend/server/mail-sync.mjs` runs it every 15 min (and on `POST /api/mail/sync`, "Check now"), matches by
  company + title to the user's applications, else adds a `mail-<hash>` application. Results live in
  `db.mail[account]`, NOT in the user profile, because the app PUTs the whole profile on every save.
  `GET /api/mail` returns them only to that account; `frontend/js/services/mail-tracking.js` merges them in.
  A status only moves forward; "Not selected" can follow anything but an offer.
- Stages: applied → viewed → shortlisted → interview → offer, or rejected ("Not selected"). The user
  wants a tracker: statuses come from email, not set by hand. The Follow up button was removed on request.
- Tests use `MAIL_CMD` (tests/fake-mail.mjs) and `MAIL_ACCOUNT` instead of Gmail.

## Style
- The user reads Telugu/English; the README and UI text are plain, simple English for a non-developer.
- Keep it dependency-light (only `requests`). The portal is split per screen (see above): put new
  code in the file for its screen, or a new clearly named file, not back into `index.html`.
