"""
Collect recent jobs from all over India for the roles in config.json,
save them for the portal (docs/jobs.json) and send only the ones that fit
my alert filters to Telegram.

Sources (each one is skipped if its key is missing):
  - JSearch (RapidAPI): Google Jobs, so LinkedIn, Indeed, Naukri, Glassdoor, company sites
  - Adzuna: India job boards
Secrets (GitHub Actions): RAPIDAPI_KEY, ADZUNA_APP_ID, ADZUNA_APP_KEY,
                          TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
"""
import hashlib
import html
import json
import os
import re
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests

ROOT = Path(__file__).parent
CONFIG = json.loads((ROOT / "config.json").read_text())
ALERTS = CONFIG.get("alerts", {})
JOBS_FILE = ROOT / "docs" / "jobs.json"
STATE_FILE = ROOT / "data" / "state.json"

SENIOR_WORDS = r"\b(senior|sr\.?|lead|principal|staff|architect|manager|head|director|vp)\b"
JUNIOR_WORDS = r"\b(intern|internship|trainee|fresher|graduate)\b"
DAYS_MAP = {"today": 1, "3days": 3, "week": 7, "month": 30}
TECH = ["react", "angular", "vue", "next.js", "node", "node.js", "express", "javascript", "typescript",
        "html", "css", "tailwind", "redux", "java", "spring", "spring boot", "hibernate", "python",
        "django", "flask", "fastapi", "c#", ".net", "php", "laravel", "go", "golang", "kotlin", "swift",
        "flutter", "react native", "android", "ios", "sql", "mysql", "postgresql", "mongodb", "redis",
        "aws", "azure", "gcp", "docker", "kubernetes", "jenkins", "git", "rest", "graphql",
        "microservices", "selenium", "machine learning", "data science", "power bi", "excel", "sap",
        "salesforce", "devops", "linux"]
CITIES = ["Bangalore", "Bengaluru", "Hyderabad", "Chennai", "Pune", "Mumbai", "Delhi", "Noida",
          "Gurgaon", "Gurugram", "Kolkata", "Ahmedabad", "Kochi", "Coimbatore", "Visakhapatnam",
          "Vijayawada", "Indore", "Jaipur", "Chandigarh", "Thiruvananthapuram", "Mysore", "Nagpur"]


def log(*a):
    print(*a, flush=True)


# ---------------------------------------------------------------- sources
def fetch_jsearch(role):
    key = os.getenv("RAPIDAPI_KEY")
    if not key:
        return []
    params = {"query": f"{role} jobs in India", "page": "1",
              "num_pages": str(CONFIG.get("jsearch_pages", 1)),
              "country": CONFIG.get("country", "in"),
              "date_posted": CONFIG.get("posted_within", "3days")}
    try:
        r = requests.get("https://jsearch.p.rapidapi.com/search",
                         headers={"X-RapidAPI-Key": key, "X-RapidAPI-Host": "jsearch.p.rapidapi.com"},
                         params=params, timeout=40)
        r.raise_for_status()
        items = r.json().get("data") or []
    except Exception as e:
        log(f"  JSearch failed for '{role}': {e}")
        return []
    out = []
    for j in items:
        exp = j.get("job_required_experience") or {}
        out.append({
            "title": j.get("job_title") or "",
            "company": j.get("employer_name") or "",
            "logo": j.get("employer_logo") or "",
            "company_site": j.get("employer_website") or "",
            "city": j.get("job_city") or "",
            "location": ", ".join(x for x in [j.get("job_city"), j.get("job_state")] if x) or "India",
            "remote": bool(j.get("job_is_remote")),
            "type": (j.get("job_employment_type") or "").replace("FULLTIME", "Full-time")
                    .replace("PARTTIME", "Part-time").replace("CONTRACTOR", "Contract").replace("INTERN", "Internship"),
            "url": j.get("job_apply_link") or j.get("job_google_link") or "",
            "description": j.get("job_description") or "",
            "posted": j.get("job_posted_at_datetime_utc") or "",
            "salary": salary_text(j.get("job_min_salary"), j.get("job_max_salary"),
                                  j.get("job_salary_currency"), j.get("job_salary_period")),
            "source": j.get("job_publisher") or "JSearch",
            "exp_months": exp.get("required_experience_in_months"),
            "role": role,
        })
    return out


def fetch_adzuna(role):
    app_id, app_key = os.getenv("ADZUNA_APP_ID"), os.getenv("ADZUNA_APP_KEY")
    if not (app_id and app_key):
        return []
    params = {"app_id": app_id, "app_key": app_key, "what": role, "results_per_page": 50,
              "max_days_old": DAYS_MAP.get(CONFIG.get("posted_within", "3days"), 3),
              "content-type": "application/json"}
    try:
        r = requests.get(f"https://api.adzuna.com/v1/api/jobs/{CONFIG.get('country', 'in')}/search/1",
                         params=params, timeout=40)
        r.raise_for_status()
        items = r.json().get("results") or []
    except Exception as e:
        log(f"  Adzuna failed for '{role}': {e}")
        return []
    out = []
    for j in items:
        loc = (j.get("location") or {}).get("display_name") or "India"
        desc = j.get("description") or ""
        out.append({
            "title": html.unescape(re.sub("<[^>]+>", "", j.get("title") or "")),
            "company": (j.get("company") or {}).get("display_name") or "",
            "logo": "", "company_site": "",
            "city": loc.split(",")[0].strip(),
            "location": loc,
            "remote": "remote" in (loc + desc).lower(),
            "type": {"full_time": "Full-time", "part_time": "Part-time"}.get(j.get("contract_time") or "", ""),
            "url": j.get("redirect_url") or "",
            "description": desc,
            "posted": j.get("created") or "",
            "salary": salary_text(j.get("salary_min"), j.get("salary_max"), "INR", "YEAR"),
            "source": "Adzuna",
            "exp_months": None,
            "role": role,
        })
    return out


def salary_text(lo, hi, cur, period):
    if not lo and not hi:
        return ""
    cur = cur or ""
    if cur == "INR":
        mult = {"MONTH": 12, "HOUR": 2000}.get((period or "").upper(), 1)
        f = lambda v: f"{v * mult / 100000:.1f}".rstrip("0").rstrip(".")
        return f"₹{f(lo)}–{f(hi)} LPA" if lo and hi and lo != hi else f"₹{f(lo or hi)} LPA"
    per = {"YEAR": "/yr", "MONTH": "/mo", "HOUR": "/hr"}.get((period or "").upper(), "")
    rng = f"{int(lo):,}–{int(hi):,}" if lo and hi and lo != hi else f"{int(lo or hi):,}"
    return f"{cur} {rng}{per}".strip()


# ---------------------------------------------------------------- understanding a job
def required_years(job):
    if job.get("exp_months"):
        return round(job["exp_months"] / 12, 1), None
    text = f"{job['title']} {job['description'][:4000]}".lower()
    for p in [r"(\d{1,2})\s*(?:\+|plus)?\s*(?:-|–|to)\s*(\d{1,2})\s*\+?\s*(?:years|yrs|year)",
              r"(\d{1,2})\s*\+?\s*(?:years|yrs|year)",
              r"minimum\s*(?:of\s*)?(\d{1,2})\s*(?:years|yrs)"]:
        m = re.search(p, text)
        if m:
            lo = int(m.group(1))
            hi = int(m.group(2)) if m.lastindex and m.lastindex >= 2 and m.group(2) else None
            if lo > 25 or (hi and hi > 30):
                continue
            return lo, hi
    if re.search(JUNIOR_WORDS, job["title"].lower()):
        return 0, 1
    return None, None


def find_tech(text):
    text = text.lower()
    return [t for t in TECH if re.search(r"(?<![a-z0-9])" + re.escape(t) + r"(?![a-z0-9])", text)][:10]


def find_city(job):
    loc = f"{job['city']} {job['location']}".lower()
    for c in CITIES:
        if c.lower() in loc:
            return {"Bengaluru": "Bangalore", "Gurugram": "Gurgaon"}.get(c, c)
    return "Remote" if job["remote"] else (job["city"] or "India")


def alert_match(job):
    """Does this job fit my Telegram alert filters? -> (bool, score, matched skills)
    Any filter left empty (or experience_years null) means "all"."""
    a = ALERTS
    title, text = job["title"].lower(), f"{job['title']} {job['description']}".lower()
    for w in a.get("exclude_words", []):
        if w.lower() in text:
            return False, 0, []
    my = a.get("experience_years")
    if my is not None:
        my, tol = float(my), float(a.get("experience_tolerance_years", 1))
        if my < 5 and re.search(SENIOR_WORDS, title):
            return False, 0, []
        if my >= 2 and re.search(JUNIOR_WORDS, title):
            return False, 0, []
        lo, hi = job["exp_min"], job["exp_max"]
        if lo is not None and (lo > my + tol or (hi is not None and hi < my - tol - 1)):
            return False, 0, []
    locs = [l.lower() for l in a.get("locations", [])]
    if locs:
        loc_ok = (job["remote"] and a.get("include_remote")) or any(
            l in job["location"].lower() or l == job["city_norm"].lower() for l in locs)
        if not loc_ok:
            return False, 0, []
    skills = [s.lower() for s in a.get("skills", [])]
    hits = [s for s in skills if re.search(r"(?<![a-z0-9])" + re.escape(s) + r"(?![a-z0-9])", text)]
    if skills and len(hits) < int(a.get("min_skill_matches", 1)):
        return False, 0, []
    roles = a.get("roles", [])
    if not (roles or skills or locs or my is not None):
        return True, 0, []          # everything is "all": alert on every new job, no score
    role_hit = not roles or any(all(w in title for w in r.lower().split()) for r in roles)
    score = (40 if role_hit else 15) + (round(40 * len(hits) / len(skills)) if skills else 40) + 20
    return True, min(score, 100), hits


def job_key(job):
    base = re.sub(r"\W+", "", f"{job['title']}|{job['company']}".lower())
    return hashlib.sha1(base.encode()).hexdigest()[:16]


# ---------------------------------------------------------------- telegram
def send_telegram(jobs):
    token, chat = os.getenv("TELEGRAM_BOT_TOKEN"), os.getenv("TELEGRAM_CHAT_ID")
    if not (token and chat) or not jobs:
        return
    limit = int(ALERTS.get("max_messages_per_run", 15))
    api = f"https://api.telegram.org/bot{token}/sendMessage"
    e = html.escape
    for j in jobs[:limit]:
        exp = (f"{j['exp_min']}{'–' + str(j['exp_max']) if j['exp_max'] else '+'} yrs"
               if j["exp_min"] is not None else "Exp not stated")
        lines = [f"<b>{e(j['title'])}</b>",
                 f"🏢 <b>{e(j['company'])}</b>",
                 f"📍 {e(j['location'])}{' · Remote' if j['remote'] else ''}",
                 f"🧑‍💻 {e(exp)}"]
        if j["salary"]:
            lines.append(f"💰 {e(j['salary'])}")
        if j["score"]:
            lines.append(f"🎯 Match {j['score']}% · {e(', '.join(j['match']))}")
        elif j.get("tech"):
            lines.append(f"🛠 {e(', '.join(j['tech'][:6]))}")
        lines.append(f"📢 Posted on {e(j['source'])}")
        body = {"chat_id": chat, "text": "\n".join(lines), "parse_mode": "HTML",
                "disable_web_page_preview": True,
                "reply_markup": {"inline_keyboard": [[{"text": "Apply ➜", "url": j["url"]}]]}}
        try:
            r = requests.post(api, json=body, timeout=20)
            if r.status_code == 401:
                log("  Telegram: bot token is wrong (401). Check TELEGRAM_BOT_TOKEN.")
                return
            if r.status_code == 400:
                log(f"  Telegram: {r.json().get('description')}. Check TELEGRAM_CHAT_ID and that you pressed Start in the bot.")
                return
            r.raise_for_status()
        except Exception as ex:
            log(f"  Telegram failed: {ex}")
        time.sleep(1.1)
    if len(jobs) > limit:
        requests.post(api, json={"chat_id": chat, "text": f"➕ {len(jobs) - limit} more matching jobs are in your portal."}, timeout=20)


def telegram_hello(state):
    token, chat = os.getenv("TELEGRAM_BOT_TOKEN"), os.getenv("TELEGRAM_CHAT_ID")
    if not (token and chat) or state.get("hello_sent"):
        return True
    r = requests.post(f"https://api.telegram.org/bot{token}/sendMessage", json={
        "chat_id": chat, "text": "✅ Udyogam Vetuku connected! New jobs will reach you here with an Apply button."},
        timeout=20)
    if r.ok:
        state["hello_sent"] = True
        return True
    log(f"TELEGRAM ERROR {r.status_code}: {r.text}")
    return False


# ---------------------------------------------------------------- main
def main():
    if not any(os.getenv(k) for k in ("RAPIDAPI_KEY", "ADZUNA_APP_ID")):
        log("No job API key set (RAPIDAPI_KEY or ADZUNA_APP_ID). Nothing to fetch.")
        sys.exit(0)

    roles = CONFIG.get("search_roles", [])
    state = json.loads(STATE_FILE.read_text()) if STATE_FILE.exists() else {}
    # JSearch free plan is ~200 calls/month: search one role per run, taking turns.
    turn = state.get("turn", 0) % max(1, len(roles))
    raw = []
    if roles:
        log(f"JSearch: {roles[turn]}")
        raw += fetch_jsearch(roles[turn])
    for role in roles:
        log(f"Adzuna: {role}")
        raw += fetch_adzuna(role)
    state["turn"] = turn + 1
    telegram_ok = telegram_hello(state)

    existing = json.loads(JOBS_FILE.read_text()).get("jobs", []) if JOBS_FILE.exists() else []
    known = {j["id"] for j in existing}
    now = datetime.now(timezone.utc)

    fresh, alerts, batch = [], [], set()
    for job in raw:
        if not job["url"] or not job["title"] or not job["company"]:
            continue
        k = job_key(job)
        if k in known or k in batch:
            continue
        batch.add(k)
        lo, hi = required_years(job)
        job.update({"id": k, "exp_min": lo, "exp_max": hi, "city_norm": find_city(job),
                    "tech": find_tech(f"{job['title']} {job['description']}"),
                    "found": now.isoformat(timespec="seconds")})
        ok, score, hits = alert_match(job)
        job["score"] = score
        job["description"] = re.sub(r"\s+", " ", job["description"])[:700]
        job.pop("exp_months", None)
        fresh.append(job)
        if ok:
            alerts.append({**job, "match": hits})

    log(f"Fetched {len(raw)} jobs, {len(fresh)} new, {len(alerts)} match my alerts.")
    cutoff = now - timedelta(days=int(CONFIG.get("keep_jobs_days", 21)))
    all_jobs = [j for j in fresh + existing if datetime.fromisoformat(j["found"]) > cutoff][:1500]

    JOBS_FILE.write_text(json.dumps({"updated": now.isoformat(timespec="seconds"),
                                     "roles": roles,
                                     "my_experience": ALERTS.get("experience_years"),
                                     "jobs": all_jobs}, ensure_ascii=False, separators=(",", ":")))
    STATE_FILE.write_text(json.dumps(state))
    alerts.sort(key=lambda j: j["score"], reverse=True)
    if telegram_ok:
        send_telegram(alerts)
    else:
        sys.exit("Telegram is not set up correctly (see TELEGRAM ERROR above). Jobs were still saved.")


if __name__ == "__main__":
    main()
