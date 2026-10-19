# My Job Alerts

Finds recent jobs that fit **my experience and skills**, sends them to **Telegram** with an
**Apply** button, and lists them on my own **portal** page.

Runs by itself 6 times a day (7 AM, 10 AM, 1 PM, 4 PM, 7 PM, 10 PM IST) on GitHub. Free.

---

## One-time setup (about 20 minutes)

### 1. Put the files on GitHub
1. Make a free account at https://github.com
2. Click **New repository** → name it `job-alerts` → **Private** → **Create**.
3. Click **uploading an existing file** and drag in everything from this folder
   (including the `.github` folder) → **Commit changes**.

### 2. Get a job API key (JSearch: LinkedIn, Indeed, Naukri, Glassdoor via Google Jobs)
1. Sign up at https://rapidapi.com
2. Open the **JSearch** API (by OpenWeb Ninja) → **Subscribe** to the free plan.
3. Copy your **X-RapidAPI-Key**.

Optional, for more jobs: sign up at https://developer.adzuna.com and copy your
**App ID** and **App Key**.

Optional, for jobs from Naukri, Foundit, Shine, TimesJobs and more: get a free key at
https://jooble.org/api/about (they send it by email).

### 3. Create your Telegram bot
1. In Telegram, open **@BotFather** → send `/newbot` → pick a name → copy the **token**.
2. Open your new bot and send it any message (like `hi`).
3. Open `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates` in a browser.
   Find `"chat":{"id":123456789` and copy that number. That is your **chat ID**.

### 4. Add the secrets to GitHub
Repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**. Add:

| Name | Value |
|---|---|
| `RAPIDAPI_KEY` | your RapidAPI key |
| `TELEGRAM_BOT_TOKEN` | your bot token |
| `TELEGRAM_CHAT_ID` | your chat ID |
| `ADZUNA_APP_ID` | (optional) |
| `ADZUNA_APP_KEY` | (optional) |
| `JOOBLE_KEY` | (optional) |

### 5. Turn on the portal page
Repo → **Settings** → **Pages** → Source: **Deploy from a branch** → Branch: `main`, folder: `/docs` → **Save**.
Your portal link appears there after a minute (like `https://yourname.github.io/job-alerts/`).
Open it on your phone and use **Add to Home screen**.

> Note: GitHub Pages on a free account needs the repo to be **Public**. If you want the repo private,
> keep it private and just use the Telegram alerts, or upgrade to GitHub Pro.

### 6. Run it the first time
Repo → **Actions** → **Find my jobs** → **Run workflow**. In 1–2 minutes the first jobs reach Telegram.

### 7. Live search: any role anyone searches (free, about 10 minutes)
Without this, the portal only shows jobs collected by the scheduled runs. With it, when anyone
searches a role in the app (for example `Nurse jobs in Chennai`), fresh jobs for it appear right away.
Needs the Adzuna key from step 2, or just the RapidAPI (JSearch) key until Adzuna is ready
(JSearch gives only ~200 searches a month, shared with the scheduled runs).

1. Sign up at https://dash.cloudflare.com (free).
2. **Workers & Pages** → **Create** → **Create Worker** → name it `job-search` → **Deploy**.
3. **Edit code** → delete everything → paste all of `backend/worker/worker.js` from this repo → **Deploy**.
4. Worker → **Settings** → **Variables and Secrets** → **Add**, type **Secret**:
   `ADZUNA_APP_ID` and `ADZUNA_APP_KEY` with your Adzuna values, and/or `RAPIDAPI_KEY`.
5. Copy the Worker link (like `https://job-search.yourname.workers.dev`).
6. In `backend/collector/config.json`, set `"live_search_url": "https://job-search.yourname.workers.dev"`, commit,
   then **Actions** → **Find my jobs** → **Run workflow** once so the portal picks up the link.

Check it works: open `<your Worker link>/search?q=QA Engineer` in a browser. You should see jobs.

Every search also brings **related jobs** (for example Java Developer also finds Spring Boot and
Backend jobs; Nurse also finds Nursing and GNM jobs). They show after the exact matches with a
**Related** tag. Each new search uses up to 3 Adzuna calls; the same search is free for 12 hours.
When `backend/worker/worker.js` changes, paste it into the Worker again (step 3) and **Deploy**.

### Run it from your computer (phone and laptop on the same Wi-Fi)
Needs Node.js. Put your keys in a `.env` file (copy `.env.example`), then run
`node backend/server/server.mjs`. It prints the link to open, like `http://192.168.1.50:8080`.
This includes live search, and accounts are kept on your computer (database `database/app.db`), so the
same login works on every phone and browser. The link works only while the command is running.

---

### Application status from Gmail (My jobs)
LinkedIn, Naukri and company hiring sites email you when your application is sent, viewed,
shortlisted, invited to interview or not selected. The app reads only those emails (they stay
unread; nothing is sent or deleted) and updates **My jobs** every 15 minutes. Applications you made
straight on LinkedIn or Naukri show up too.

1. Google account → **Security** → turn on **2-Step Verification**.
2. Open https://myaccount.google.com/apppasswords → name it `Udyogam Vetuku` → **Create** → copy the
   16-letter password.
3. In `.env` add `GMAIL_ADDRESS=you@gmail.com` and `GMAIL_APP_PASSWORD=<the 16 letters>`.
   If you log in to the app with a different email, also add `TRACK_ACCOUNT=<that email>`.
4. Restart `node backend/server/server.mjs`. To see what it finds without changing anything: `python backend/mail/track_mail.py`.

Only the account in `TRACK_ACCOUNT` (or `GMAIL_ADDRESS`) sees these statuses. Works only with the
local server, not on GitHub Pages. To stop it, delete the App password in your Google account.

**On the live site, for everyone:** each person presses **Connect Gmail** on My jobs. One-time setup by
the site owner:
1. https://console.cloud.google.com → new project `Udyogam Vetuku` → **APIs & Services → Library** →
   **Gmail API** → **Enable**.
2. **Google Auth Platform → Branding**: app name `Udyogam Vetuku`, your email. **Audience**: External,
   then **Publish app** (in "Testing" Google logs people out every 7 days). **Data access → Add scopes**:
   `https://www.googleapis.com/auth/gmail.readonly`.
3. **Clients → Create client → Web application**. Authorized redirect URI:
   `https://udyogam-vetuku.pages.dev/api/gmail/callback`. Copy the **Client ID** and **Client secret**.
4. Put the Client ID in `wrangler.toml` as `GOOGLE_CLIENT_ID`. In Cloudflare → udyogam-vetuku →
   **Settings → Variables and Secrets** add the secrets `GOOGLE_CLIENT_SECRET` and `TOKEN_KEY` (from `.env`).
5. GitHub Secrets: `NOTIFY_SECRET` (from `.env`), so `.github/workflows/mail.yml` checks everyone every 30 minutes.

The app is unverified by Google, so people see "Google hasn't verified this app" → **Advanced** →
**Go to Udyogam Vetuku**. Up to 100 people can connect until Google verifies it.

## Project structure

```
job-alerts/
├── frontend/                 The website (Cloudflare Pages serves this folder)
│   ├── index.html            HTML of every screen; loads the css/ and js/ files below in order
│   ├── assets/               logo
│   ├── data/jobs.json        the job list (written by the collector, read by the website)
│   ├── css/
│   │   ├── base/             colors, fonts, buttons, page frame, shared pieces
│   │   ├── components/       parts used on many screens (header, job card, filters, job details…)
│   │   └── pages/            one file per screen (login, forgot-password, onboarding, jobs, my-jobs, profile…)
│   └── js/
│       ├── core/             constants, helpers, state, router (URLs), app (start-up, loaded last)
│       ├── services/         data and logic: job list + live search, matching, Gmail statuses, backup
│       ├── components/       shared parts (header, job card, filters, job details, applications…)
│       └── pages/            one file per screen
├── backend/
│   ├── server/               server.mjs (accounts API + serves the website on your Wi-Fi),
│   │                         database.mjs (reads/writes the database), mail-sync.mjs (Gmail statuses)
│   ├── worker/               worker.js: Cloudflare Worker for live search
│   ├── collector/            fetch_jobs.py + config.json: collects jobs 6 times a day (GitHub Actions)
│   └── mail/                 track_mail.py: reads job-site emails for application statuses
├── database/
│   ├── schema.sql            the database tables, with a note on each
│   ├── app.db                the database itself (on your computer only, never in git)
│   ├── backups/              old account files (never in git)
│   └── state.json            what the collector found on its last run
├── tests/                    automatic tests (Playwright for the app, unittest for the mail reader)
└── .github/workflows/        the 6-times-a-day job run
```

## Change what jobs you get
Edit `backend/collector/config.json` on GitHub (pencil icon).

**`search_roles`**: the roles collected from all over India. Every job for these roles shows in
your portal, where you filter by role, experience, city and company yourself.

**`alerts`**: only jobs that pass these filters are sent to Telegram.

| Setting | What it does |
|---|---|
| `experience_years` | Your experience. Jobs asking for much more are not sent. |
| `roles` | Titles you want alerts for |
| `skills` | Your technologies. A job must mention at least `min_skill_matches` of them. |
| `locations` | Cities for alerts. Leave `[]` for all India. |
| `include_remote` | `true` to also get remote jobs |
| `exclude_words` | Skip jobs that contain these words |

Senior / Lead / Manager titles are not sent when your experience is under 5 years.

## The portal
- **Jobs**: filter by role, experience, city, date posted, skill or company. Each job shows the
  company, where it was posted (LinkedIn, Naukri, Indeed…), experience needed and an **Apply** button
  that opens the original job page.
- **Search on Naukri, LinkedIn and more**: on the Jobs page. Naukri, LinkedIn, Indeed, Foundit,
  Instahyre, Hirist, Cutshort, Glassdoor, Wellfound, Internshala, Unstop, Apna, Freshersworld,
  TCS, Infosys, Wipro and Accenture don't share their jobs with other apps, so each button opens
  your search (role, city, experience) on that site. Freshers see the student sites first.
- **Companies**: every company hiring right now, with job counts. Tap one to see its jobs.
- **My applications**: jobs you applied to, with status (Applied, Interview, Offer, Closed).
- **Resume**: on the Profile page (or "Fill from my resume" when you set up), upload your resume as
  PDF or Word (.docx), up to 2 MB. The app reads the skills in it and you choose which to add, so
  "Jobs for me" fits you better. Your resume is read on your own device; the file is kept with your
  account (or only in that browser when the site runs without the accounts server).

## Free plan limits
JSearch free plan allows about 200 searches a month. This setup does one search per run (a group of related roles,
taking turns; about 180 a month), so you stay inside it. Add an Adzuna key to get many more jobs per run.
Jooble: `jooble_roles_per_run` roles per run (5 × 6 runs = 30 searches a day).

## Company career pages
`company_boards` in `backend/collector/config.json` lists companies whose careers sites are read directly (no key).
Supported: Greenhouse, Lever, Ashby, SmartRecruiters and Workday. For Workday, the slug is the
part of the careers link, e.g. `https://accenture.wd103.myworkdayjobs.com/AccentureCareers` →
`"accenture.wd103/AccentureCareers"`. TCS, Infosys and Wipro use their own sites, which can't be
read this way, so they are in the "Search on Naukri, LinkedIn and more" buttons instead.
