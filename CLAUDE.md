# Job Alerts

Personal job finder for India. `fetch_jobs.py` runs on GitHub Actions, collects jobs, saves them
for a static portal, and sends matching ones to Telegram.

## How it fits together
- `.github/workflows/jobs.yml`: runs 6x a day (7 AM–10 PM IST) and on "Run workflow" (optional
  `query` input becomes `SEARCH_QUERY`). After the run, the bot commits `docs/jobs.json` and
  `data/state.json` as "New jobs <date>". Expect these commits, so `git pull` before pushing.
- `fetch_jobs.py`: one script, no framework. Sources (each skipped if its key is missing):
  - JSearch (RapidAPI): free plan is ~200 calls/month, so **one call per run**, rotating through
    `jsearch_groups` using `state["turn"]`. Don't add JSearch calls per run without checking quota.
    The working endpoint path is cached in `state["jsearch_path"]`.
  - Adzuna: `adzuna_roles_per_run` roles per run, rotating.
  - Jooble (`JOOBLE_KEY`): `jooble_roles_per_run` roles per run, rotating like Adzuna. Brings
    Naukri / Foundit / Shine jobs; `site_name()` turns their domains into one name per site.
  - `company_boards`: public Greenhouse / Lever / Ashby / SmartRecruiters / Workday APIs (no key).
    Workday slug is `host/site` (e.g. `accenture.wd103/AccentureCareers`); the India filter is
    found from the company's own facets, and `pages` (×20 newest jobs) defaults to 3. Slugs that
    404 show in `data/state.json` → `last_run.company_boards.failed`; remove those from config.
- Naukri, LinkedIn, Indeed, Glassdoor, Instahyre, Internshala, Unstop, Apna etc. have no free API
  and block scraping (Naukri answers 406). Don't scrape them.
- `config.json`: `search_roles` feeds the portal; `alerts` decides only what goes to Telegram
  (`telegram_enabled` is currently false).
- The portal (GitHub Pages from `/docs`), no build step and no framework. It loads `jobs.json`;
  profile, saved jobs and applications live in the browser's localStorage (or the local server).
  - `docs/index.html`: only the HTML of each screen (login, onboarding, app frame, pop-ups), then
    `<link>`s and `<script>`s in a fixed order.
  - `docs/css/<screen>.css` and `docs/js/<screen>.js`: one file per screen or feature, e.g.
    `login`, `forgot-password`, `onboarding`, `jobs-page`, `filters`, `job-card`, `job-details`,
    `my-jobs-page`, `profile-page`, `applications`. Shared bits: `css/base.css`,
    `css/components.css`, `js/constants.js`, `js/helpers.js`, `js/state.js`.
  - Scripts are plain (not modules) and share one global scope, so load order matters:
    `constants` first, `app.js` (calls `boot()`) last. CSS order matters too (`base` first).
  - Button clicks after login: each screen file registers its own with `onAppClick((d, t, e) => …)`
    (from `helpers.js`); `d` is the clicked button's `data-*`.
  - URLs: `js/router.js` gives every screen its own link (`/login`, `/signup`, `/forgot-password`,
    `/setup`, `/jobs`, `/saved`, `/my-jobs`, `/profile`, `/job?id=…`). It wraps the screen functions
    (`showAuth`, `go`, `openJob`, `closeSheet`, `openForgot`…) instead of editing them; a new screen
    needs an entry in `ROUTE_OF_VIEW`. Routes stay one level deep so relative `css/` `js/` links
    work. The host must answer unknown links with `index.html`: Cloudflare Pages does (no
    `404.html` in `docs/`, or it stops), `worker/server.mjs` does for links without an extension;
    GitHub Pages doesn't, so a refresh on `/jobs` there is a 404.
- `worker/worker.js`: Cloudflare Worker for live search, pasted into the Cloudflare dashboard by
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
- `data/state.json`: run counter plus what each source returned. Check here first when debugging.

## Running locally
- Portal server: `node worker/server.mjs [port]` (default 8080, binds 0.0.0.0 for the LAN). It serves
  `docs/`, answers `/search` with `worker.js`, reads `.env` on every search, and points `live_api` at
  itself. It also has `/api/*` accounts (signup, login, user GET/PUT/DELETE, password, logout) with
  scrypt hashes and session tokens in `data/users.json` (gitignored). The app checks `api/ping`.
  If the server answers, accounts live there; if not (GitHub Pages), they stay in the browser's
  localStorage, which is per browser and per address.
- Forgot password (modal on the login page): `/api/forgot` makes a 6-digit PIN that the app **shows
  on screen**, because there is no email service. `/api/reset` takes PIN + new password (10 min,
  5 tries) and logs out other sessions. The user chose this on purpose; it isn't real identity
  proof, since anyone who knows an email can reset it. Sending the PIN by email is the upgrade.
- `pip install requests`, copy `.env.example` to `.env`, then `python fetch_jobs.py`.
  The script reads `.env` itself. `.env` is gitignored, so never commit it.
- A local run spends JSearch quota, moves `turn` forward, and rewrites `docs/jobs.json` and
  `data/state.json`. Don't commit those files after a local run; let the bot own them.

## Application status from Gmail
- LinkedIn / Naukri have no API for application status, and scraping them is not allowed, so status
  comes from the person's job-site emails. `track_mail.py` (stdlib `imaplib`, Gmail App password from
  `.env`) reads only mail from job sites / hiring systems (`SENDERS`), with `BODY.PEEK` so it stays unread,
  and turns each into {stage, company, title, site}. Rules: `STAGE_RULES` (most advanced first), `SKIP`
  for job alerts. Unit tests: `python -m unittest tests/test_track_mail.py`.
- `worker/mail-sync.mjs` runs it every 15 min (and on `POST /api/mail/sync`, "Check now"), matches by
  company + title to the user's applications, else adds a `mail-<hash>` application. Results live in
  `db.mail[account]`, NOT in the user profile, because the app PUTs the whole profile on every save.
  `GET /api/mail` returns them only to that account; `docs/js/mail-tracking.js` merges them in.
  A status only moves forward; "Not selected" can follow anything but an offer.
- Stages: applied → viewed → shortlisted → interview → offer, or rejected ("Not selected"). The user
  wants a tracker: statuses come from email, not set by hand. The Follow up button was removed on request.
- Tests use `MAIL_CMD` (tests/fake-mail.mjs) and `MAIL_ACCOUNT` instead of Gmail.

## Style
- The user reads Telugu/English; the README and UI text are plain, simple English for a non-developer.
- Keep it dependency-light (only `requests`). The portal is split per screen (see above): put new
  code in the file for its screen, or a new clearly named file, not back into `index.html`.
