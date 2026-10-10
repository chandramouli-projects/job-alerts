# My Job Alerts

Finds recent jobs that fit **my experience and skills**, sends them to **Telegram** with an
**Apply** button, and lists them on my own **portal** page.

Runs by itself 3 times a day (9 AM, 2 PM, 7 PM IST) on GitHub. Free.

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

### 5. Turn on the portal page
Repo → **Settings** → **Pages** → Source: **Deploy from a branch** → Branch: `main`, folder: `/docs` → **Save**.
Your portal link appears there after a minute (like `https://yourname.github.io/job-alerts/`).
Open it on your phone and use **Add to Home screen**.

> Note: GitHub Pages on a free account needs the repo to be **Public**. If you want the repo private,
> keep it private and just use the Telegram alerts, or upgrade to GitHub Pro.

### 6. Run it the first time
Repo → **Actions** → **Find my jobs** → **Run workflow**. In 1–2 minutes the first jobs reach Telegram.

---

## Change what jobs you get
Edit `config.json` on GitHub (pencil icon).

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
- **Companies**: every company hiring right now, with job counts. Tap one to see its jobs.
- **My applications**: jobs you applied to, with status (Applied, Interview, Offer, Closed).

## Free plan limits
JSearch free plan allows about 200 searches a month. This setup searches one role per run, taking
turns (about 90 a month), so you stay inside it. Add an Adzuna key to get many more jobs per run.
