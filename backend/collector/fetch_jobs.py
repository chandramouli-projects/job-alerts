"""
Collect recent jobs from all over India for the roles in config.json,
save them for the portal (frontend/data/jobs.json) and send only the ones that fit
my alert filters to Telegram.

Sources (each one is skipped if its key is missing):
  - JSearch (RapidAPI): Google Jobs, so LinkedIn, Indeed, Naukri, Glassdoor, company sites
  - Adzuna: India job boards
  - Jooble: India job boards (Naukri, Foundit, Shine, TimesJobs...)
  - Company career pages on Greenhouse / Lever / Ashby / SmartRecruiters / Workday (no key)
Secrets (GitHub Actions): RAPIDAPI_KEY, ADZUNA_APP_ID, ADZUNA_APP_KEY, JOOBLE_KEY,
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

HERE = Path(__file__).resolve().parent  # backend/collector: this script and config.json
ROOT = HERE.parent.parent  # the project folder: .env, frontend/, database/
# On my computer, read secrets from .env (GitHub Actions passes them as env vars instead)
if (ROOT / ".env").exists():
    for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
        k, sep, v = line.partition("=")
        if sep and not k.strip().startswith("#") and v.strip():
            os.environ.setdefault(k.strip(), v.strip().strip("\"'"))
CONFIG = json.loads((HERE / "config.json").read_text(encoding="utf-8"))
ALERTS = CONFIG.get("alerts", {})
RUN_INFO = {}
STATE = (
    json.loads((ROOT / "database" / "state.json").read_text(encoding="utf-8"))
    if (ROOT / "database" / "state.json").exists()
    else {}
)  # what each source answered, saved in database/state.json for troubleshooting
JOBS_FILE = ROOT / "frontend" / "data" / "jobs.json"
STATE_FILE = ROOT / "database" / "state.json"

SENIOR_WORDS = r"\b(senior|sr\.?|lead|principal|staff|architect|manager|head|director|vp)\b"
JUNIOR_WORDS = r"\b(intern|internship|trainee|fresher|graduate)\b"
DAYS_MAP = {"today": 1, "3days": 3, "week": 7, "month": 30}
TECH = [
    "react",
    "angular",
    "vue",
    "next.js",
    "node",
    "node.js",
    "express",
    "javascript",
    "typescript",
    "html",
    "css",
    "tailwind",
    "redux",
    "java",
    "spring",
    "spring boot",
    "hibernate",
    "python",
    "django",
    "flask",
    "fastapi",
    "c#",
    ".net",
    "php",
    "laravel",
    "go",
    "golang",
    "kotlin",
    "swift",
    "flutter",
    "react native",
    "android",
    "ios",
    "sql",
    "mysql",
    "postgresql",
    "mongodb",
    "redis",
    "aws",
    "azure",
    "gcp",
    "docker",
    "kubernetes",
    "jenkins",
    "git",
    "rest",
    "graphql",
    "microservices",
    "selenium",
    "machine learning",
    "data science",
    "power bi",
    "excel",
    "sap",
    "salesforce",
    "devops",
    "linux",
]
CITIES = [
    "Bangalore",
    "Bengaluru",
    "Hyderabad",
    "Chennai",
    "Pune",
    "Mumbai",
    "Delhi",
    "Noida",
    "Gurgaon",
    "Gurugram",
    "Kolkata",
    "Ahmedabad",
    "Kochi",
    "Coimbatore",
    "Visakhapatnam",
    "Vijayawada",
    "Indore",
    "Jaipur",
    "Chandigarh",
    "Thiruvananthapuram",
    "Mysore",
    "Nagpur",
]


def log(*a):
    print(*a, flush=True)


# ---------------------------------------------------------------- sources
JSEARCH_PATHS = ["/search", "/search-v2", "/job-search", "/v2/search", "/search-jobs", "/jobs/search"]


def fetch_jsearch(role):
    key = os.getenv("RAPIDAPI_KEY")
    if not key:
        return []
    query = role if " jobs in " in role else f"{role} jobs in India"
    params = {
        "query": query,
        "page": "1",
        "num_pages": str(CONFIG.get("jsearch_pages", 1)),
        "country": CONFIG.get("country", "in"),
        "date_posted": CONFIG.get("posted_within", "3days"),
    }
    headers = {"X-RapidAPI-Key": key, "X-RapidAPI-Host": "jsearch.p.rapidapi.com"}
    known = STATE.get("jsearch_path")
    paths = [known] + [p for p in JSEARCH_PATHS if p != known] if known else JSEARCH_PATHS
    RUN_INFO["jsearch"] = {"role": role, "tried": []}
    items = None
    for path in paths:
        try:
            r = requests.get(
                "https://jsearch.p.rapidapi.com" + path, headers=headers, params=params, timeout=40
            )
        except Exception as e:
            RUN_INFO["jsearch"]["error"] = str(e)[:200]
            return []
        RUN_INFO["jsearch"]["tried"].append(f"{path}:{r.status_code}")
        if r.status_code == 404 and "does not exist" in r.text:
            continue
        if r.status_code != 200:
            RUN_INFO["jsearch"]["note"] = r.text[:300]
            log(f"  JSearch {path} answered {r.status_code}: {r.text[:200]}")
            return []
        STATE["jsearch_path"] = path
        body = r.json()
        data = body.get("data")
        items = data.get("jobs") if isinstance(data, dict) else data
        items = items or []
        RUN_INFO["jsearch"].update({"path": path, "results": len(items)})
        if not items:
            RUN_INFO["jsearch"]["note"] = json.dumps({k: v for k, v in body.items() if k != "data"})[:300]
        break
    if items is None:
        log("  JSearch: no search endpoint found")
        return []
    out = []
    for j in items:
        exp = j.get("job_required_experience") or {}
        links = apply_links(j)
        out.append(
            {
                "title": j.get("job_title") or "",
                "company": j.get("employer_name") or "",
                "logo": j.get("employer_logo") or "",
                "company_site": j.get("employer_website") or "",
                "city": j.get("job_city") or "",
                "location": ", ".join(x for x in [j.get("job_city"), j.get("job_state")] if x) or "India",
                "remote": bool(j.get("job_is_remote")),
                "type": (j.get("job_employment_type") or "")
                .replace("FULLTIME", "Full-time")
                .replace("PARTTIME", "Part-time")
                .replace("CONTRACTOR", "Contract")
                .replace("INTERN", "Internship"),
                "url": (
                    links[0]["url"] if links else (j.get("job_apply_link") or j.get("job_google_link") or "")
                ),
                "direct": bool(links and links[0]["direct"]),
                "apply_links": links[:5],
                "description": j.get("job_description") or "",
                "posted": j.get("job_posted_at_datetime_utc") or "",
                "salary": salary_text(
                    j.get("job_min_salary"),
                    j.get("job_max_salary"),
                    j.get("job_salary_currency"),
                    j.get("job_salary_period"),
                ),
                "source": site_name(j.get("job_publisher") or "JSearch"),
                "exp_months": exp.get("required_experience_in_months"),
                "role": "" if " OR " in role else role,
            }
        )
    return out


AGGREGATORS = (
    "linkedin",
    "naukri",
    "indeed",
    "glassdoor",
    "foundit",
    "monster",
    "shine",
    "ziprecruiter",
    "simplyhired",
    "talent.com",
    "jooble",
    "adzuna",
    "instahyre",
    "cutshort",
    "wellfound",
    "iimjobs",
    "hirist",
    "apna",
    "workindia",
    "timesjobs",
    "freshersworld",
    "internshala",
    "bebee",
    "jobrapido",
    "careerjet",
    "whatjobs",
    "expertini",
    "learn4good",
    "dice",
    "built in",
    "recruit.net",
    "jooble",
    "trabajo",
    "jobsora",
    "talentify",
    "jobleads",
    "glints",
    "kitjob",
)


SITE_NAMES = {
    "naukri": "Naukri",
    "linkedin": "LinkedIn",
    "indeed": "Indeed",
    "glassdoor": "Glassdoor",
    "foundit": "Foundit",
    "monster": "Foundit",
    "instahyre": "Instahyre",
    "hirist": "Hirist",
    "cutshort": "Cutshort",
    "wellfound": "Wellfound",
    "angel.co": "Wellfound",
    "internshala": "Internshala",
    "unstop": "Unstop",
    "apna": "Apna",
    "freshersworld": "Freshersworld",
    "shine": "Shine",
    "timesjobs": "TimesJobs",
    "iimjobs": "iimjobs",
}


def site_name(s):
    """One name per job site, so "Naukri.com" and "naukri" show up as "Naukri" in the portal."""
    low = (s or "").lower()
    return next((v for k, v in SITE_NAMES.items() if k in low), s)


def apply_links(j):
    """All the places this job can be applied to, company's own site first."""
    seen, out = set(), []
    opts = j.get("apply_options") or []
    if j.get("job_apply_link"):
        opts = [
            {
                "publisher": j.get("job_publisher"),
                "apply_link": j["job_apply_link"],
                "is_direct": j.get("job_apply_is_direct"),
            }
        ] + opts
    for o in opts:
        url = o.get("apply_link") or ""
        if not url.startswith("http") or url in seen:
            continue
        seen.add(url)
        site = o.get("publisher") or re.sub(r"^www\.", "", url.split("/")[2])
        is_agg = any(a in (site + url).lower() for a in AGGREGATORS)
        out.append({"site": site, "url": url, "direct": bool(o.get("is_direct")) or not is_agg})
    out.sort(key=lambda x: not x["direct"])
    return out


# ---------------------------------------------------------------- company career pages
INDIA_WORDS = (
    "india",
    "bangalore",
    "bengaluru",
    "hyderabad",
    "chennai",
    "pune",
    "mumbai",
    "delhi",
    "noida",
    "gurgaon",
    "gurugram",
    "kolkata",
    "ahmedabad",
    "kochi",
    "coimbatore",
    "remote - in",
    "remote, in",
)


def role_words():
    # plus common IT titles that big companies use, e.g. Accenture's "Application Developer"
    words = {"software", "application developer", "developer", "tester", "testing", "programmer"}
    for r in CONFIG.get("search_roles", []):
        r = r.lower().replace("developer", "").replace("engineer", "").strip()
        if r:
            words.add(r)
    return words or {"engineer", "developer"}


def board_job(company, title, loc, url, desc, posted, remote=False):
    return {
        "title": title,
        "company": company,
        "logo": "",
        "company_site": "",
        "city": loc.split(",")[0].strip(),
        "location": loc or "India",
        "remote": remote or "remote" in loc.lower(),
        "type": "",
        "url": url,
        "direct": True,
        "apply_links": [{"site": f"{company} careers", "url": url, "direct": True}],
        "description": re.sub("<[^>]+>", " ", html.unescape(desc or "")),
        "posted": posted,
        "salary": "",
        "source": f"{company} careers",
        "exp_months": None,
        "role": "",
    }


def fetch_company_boards():
    """Public job boards that companies host on Greenhouse, Lever, Ashby or SmartRecruiters.
    No key needed. Companies that don't answer are skipped and listed in database/state.json."""
    boards = CONFIG.get("company_boards", [])
    days = DAYS_MAP.get(CONFIG.get("posted_within", "3days"), 3) + 4
    since = datetime.now(timezone.utc) - timedelta(days=days)
    words = role_words()
    out, ok, failed = [], [], []
    for b in boards:
        ats, slug, name = b.get("ats"), b.get("slug"), b.get("name") or b.get("slug")
        try:
            jobs = []
            if ats == "greenhouse":
                r = requests.get(
                    f"https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true", timeout=30
                )
                r.raise_for_status()
                for j in r.json().get("jobs", []):
                    jobs.append(
                        board_job(
                            name,
                            j.get("title", ""),
                            (j.get("location") or {}).get("name", ""),
                            j.get("absolute_url", ""),
                            j.get("content", ""),
                            j.get("updated_at", ""),
                        )
                    )
            elif ats == "lever":
                r = requests.get(f"https://api.lever.co/v0/postings/{slug}?mode=json", timeout=30)
                r.raise_for_status()
                for j in r.json():
                    c = j.get("categories") or {}
                    ts = j.get("createdAt")
                    jobs.append(
                        board_job(
                            name,
                            j.get("text", ""),
                            c.get("location", "") or "",
                            j.get("hostedUrl", ""),
                            j.get("descriptionPlain", ""),
                            datetime.fromtimestamp(ts / 1000, timezone.utc).isoformat() if ts else "",
                            (j.get("workplaceType") or "") == "remote",
                        )
                    )
            elif ats == "ashby":
                r = requests.get(f"https://api.ashbyhq.com/posting-api/job-board/{slug}", timeout=30)
                r.raise_for_status()
                for j in r.json().get("jobs", []):
                    jobs.append(
                        board_job(
                            name,
                            j.get("title", ""),
                            j.get("location", "") or "",
                            j.get("jobUrl", ""),
                            j.get("descriptionPlain", ""),
                            j.get("publishedAt", ""),
                            bool(j.get("isRemote")),
                        )
                    )
            elif ats == "smartrecruiters":
                r = requests.get(
                    f"https://api.smartrecruiters.com/v1/companies/{slug}/postings?country=in&limit=100",
                    timeout=30,
                )
                r.raise_for_status()
                for j in r.json().get("content", []):
                    loc = j.get("location") or {}
                    jobs.append(
                        board_job(
                            name,
                            j.get("name", ""),
                            ", ".join(x for x in [loc.get("city"), "India"] if x),
                            f"https://jobs.smartrecruiters.com/{slug}/{j.get('id')}",
                            "",
                            j.get("releasedDate", ""),
                            bool(loc.get("remote")),
                        )
                    )
            elif ats == "workday":
                jobs = fetch_workday(name, slug, int(b.get("pages", 3)))
            else:
                continue
            kept = 0
            for j in jobs:
                if not any(w in j["location"].lower() for w in INDIA_WORDS):
                    continue
                if not any(w in j["title"].lower() for w in words):
                    continue
                try:
                    if j["posted"] and datetime.fromisoformat(j["posted"].replace("Z", "+00:00")) < since:
                        continue
                except ValueError:
                    pass
                out.append(j)
                kept += 1
            ok.append(f"{name}:{kept}")
        except Exception as e:
            failed.append(f"{name}:{str(e)[:60]}")
    RUN_INFO["company_boards"] = {"ok": ok, "failed": failed}
    log(f"Company career pages: {len(out)} India jobs from {len(ok)} companies ({len(failed)} skipped)")
    return out


def workday_india(facets, param=None):
    """Workday's own "India" filter for this company (its name differs per company), or None."""
    for f in facets or []:
        p = f.get("facetParameter") or param
        if (f.get("descriptor") or "").strip().lower() == "india" and p and f.get("id"):
            return {p: [f["id"]]}
        found = workday_india(f.get("values"), p)
        if found:
            return found
    return None


def workday_posted(text):
    """ "Posted Today" / "Posted Yesterday" / "Posted 3 Days Ago" / "Posted 30+ Days Ago" -> ISO date"""
    t = (text or "").lower()
    m = re.search(r"(\d+)", t)
    days = 0 if "today" in t else 1 if "yesterday" in t else int(m.group(1)) if m else 30
    return (datetime.now(timezone.utc) - timedelta(days=days)).isoformat(timespec="seconds")


def fetch_workday(name, slug, pages):
    """Newest India jobs from a company's Workday careers site. slug is "host/site", e.g.
    "accenture.wd103/AccentureCareers" from https://accenture.wd103.myworkdayjobs.com/AccentureCareers"""
    host, site = slug.split("/", 1)
    api = f"https://{host}.myworkdayjobs.com/wday/cxs/{host.split('.')[0]}/{site}/jobs"
    first = requests.post(
        api, json={"limit": 1, "offset": 0, "searchText": "", "appliedFacets": {}}, timeout=30
    )
    first.raise_for_status()
    india = workday_india(first.json().get("facets"))
    jobs = []
    for page in range(pages):
        r = requests.post(
            api,
            json={"limit": 20, "offset": page * 20, "searchText": "", "appliedFacets": india or {}},
            timeout=30,
        )
        r.raise_for_status()
        items = r.json().get("jobPostings") or []
        for j in items:
            path = j.get("externalPath") or ""
            # "/job/India-Bengaluru/Title_R123" -> "India Bengaluru" when the list has no city
            loc = j.get("locationsText") or ""
            if not loc or "locations" in loc.lower():
                loc = path.split("/")[2].replace("-", " ") if path.count("/") >= 3 else loc
            if india and "india" not in loc.lower():
                loc = f"{loc}, India" if loc else "India"
            jobs.append(
                board_job(
                    name,
                    j.get("title", ""),
                    loc,
                    f"https://{host}.myworkdayjobs.com/{site}{path}",
                    "",
                    workday_posted(j.get("postedOn")),
                )
            )
        if len(items) < 20:
            break
    return jobs


def fetch_jooble(role):
    """Jooble collects jobs from many Indian job sites (Naukri, Foundit, Shine, TimesJobs...).
    Free key from https://jooble.org/api/about"""
    key = os.getenv("JOOBLE_KEY")
    if not key:
        return []
    try:
        r = requests.post(
            f"https://jooble.org/api/{key}", json={"keywords": role, "location": "India"}, timeout=40
        )
        r.raise_for_status()
        items = r.json().get("jobs") or []
    except Exception as e:
        log(f"  Jooble failed for '{role}': {e}")
        RUN_INFO.setdefault("jooble", {})["error"] = str(e)[:200]
        return []
    RUN_INFO.setdefault("jooble", {})[role] = len(items)
    out = []
    for j in items:
        loc = j.get("location") or "India"
        desc = html.unescape(re.sub("<[^>]+>", " ", j.get("snippet") or ""))
        site = site_name(j.get("source") or "Jooble")
        out.append(
            {
                "title": html.unescape(re.sub("<[^>]+>", "", j.get("title") or "")).strip(),
                "company": (j.get("company") or "").strip(),
                "logo": "",
                "company_site": "",
                "city": loc.split(",")[0].strip(),
                "location": loc,
                "remote": "remote" in (loc + desc).lower(),
                "type": j.get("type") or "",
                "url": j.get("link") or "",
                "direct": False,
                "apply_links": [{"site": site, "url": j.get("link") or "", "direct": False}],
                "description": desc,
                "posted": j.get("updated") or "",
                "salary": (j.get("salary") or "").strip(),
                "source": site,
                "exp_months": None,
                "role": role,
            }
        )
    return out


def wanted_roles(top=3):
    """The roles people picked in the app (most picked first), from the live site: /api/stats/roles.
    Only counts, never who. Needs NOTIFY_URL and NOTIFY_SECRET; without them, no extra roles.
    -> [{"term": "QA Testing", "remote": True}]"""
    url, secret = os.getenv("NOTIFY_URL"), os.getenv("NOTIFY_SECRET")
    if not (url and secret):
        return []
    try:
        r = requests.get(
            url.split("/api/")[0] + "/api/stats/roles",
            headers={"Authorization": f"Bearer {secret}"},
            timeout=30,
        )
        r.raise_for_status()
        roles = r.json().get("roles", [])[:top]
    except Exception as e:
        RUN_INFO["wanted_roles"] = {"error": str(e)[:80]}
        return []
    out = [
        {"term": re.sub(r"\s*/\s*", " ", x["role"]).strip(), "remote": x.get("remote", 0) > 0}
        for x in roles
        if x.get("role")
    ]
    RUN_INFO["wanted_roles"] = [w["term"] for w in out]
    return out


def fetch_adzuna(role):
    app_id, app_key = os.getenv("ADZUNA_APP_ID"), os.getenv("ADZUNA_APP_KEY")
    if not (app_id and app_key):
        return []
    params = {
        "app_id": app_id,
        "app_key": app_key,
        "what": role,
        "results_per_page": 50,
        "max_days_old": DAYS_MAP.get(CONFIG.get("posted_within", "3days"), 3),
        "content-type": "application/json",
    }
    try:
        r = requests.get(
            f"https://api.adzuna.com/v1/api/jobs/{CONFIG.get('country', 'in')}/search/1",
            params=params,
            timeout=40,
        )
        r.raise_for_status()
        items = r.json().get("results") or []
    except Exception as e:
        log(f"  Adzuna failed for '{role}': {e}")
        return []
    out = []
    for j in items:
        loc = (j.get("location") or {}).get("display_name") or "India"
        desc = j.get("description") or ""
        out.append(
            {
                "title": html.unescape(re.sub("<[^>]+>", "", j.get("title") or "")),
                "company": (j.get("company") or {}).get("display_name") or "",
                "logo": "",
                "company_site": "",
                "city": loc.split(",")[0].strip(),
                "location": loc,
                "remote": "remote" in (loc + desc).lower(),
                "type": {"full_time": "Full-time", "part_time": "Part-time"}.get(
                    j.get("contract_time") or "", ""
                ),
                "url": j.get("redirect_url") or "",
                "direct": False,
                "apply_links": [{"site": "Adzuna", "url": j.get("redirect_url") or "", "direct": False}],
                "description": desc,
                "posted": j.get("created") or "",
                "salary": salary_text(j.get("salary_min"), j.get("salary_max"), "INR", "YEAR"),
                "source": "Adzuna",
                "exp_months": None,
                "role": role,
            }
        )
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
    for p in [
        r"(\d{1,2})\s*(?:\+|plus)?\s*(?:-|–|to)\s*(\d{1,2})\s*\+?\s*(?:years|yrs|year)",
        r"(\d{1,2})\s*\+?\s*(?:years|yrs|year)",
        r"minimum\s*(?:of\s*)?(\d{1,2})\s*(?:years|yrs)",
    ]:
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
            l in job["location"].lower() or l == job["city_norm"].lower() for l in locs
        )
        if not loc_ok:
            return False, 0, []
    skills = [s.lower() for s in a.get("skills", [])]
    hits = [s for s in skills if re.search(r"(?<![a-z0-9])" + re.escape(s) + r"(?![a-z0-9])", text)]
    if skills and len(hits) < int(a.get("min_skill_matches", 1)):
        return False, 0, []
    roles = a.get("roles", [])
    if not (roles or skills or locs or my is not None):
        return True, 0, []  # everything is "all": alert on every new job, no score
    role_hit = not roles or any(all(w in title for w in r.lower().split()) for r in roles)
    score = (40 if role_hit else 15) + (round(40 * len(hits) / len(skills)) if skills else 40) + 20
    return True, min(score, 100), hits


def job_key(job):
    base = re.sub(r"\W+", "", f"{job['title']}|{job['company']}".lower())
    return hashlib.sha1(base.encode()).hexdigest()[:16]


# ---------------------------------------------------------------- telegram
def send_push_alerts(fresh):
    """Ask the live site to send phone / computer alerts (even with the app closed) for the new jobs:
    functions/api push/run matches them to each person. Needs NOTIFY_URL and NOTIFY_SECRET."""
    url, secret = os.getenv("NOTIFY_URL"), os.getenv("NOTIFY_SECRET")
    if not (url and secret) or not fresh:
        return
    keys = (
        "id",
        "title",
        "company",
        "location",
        "city_norm",
        "remote",
        "type",
        "exp_min",
        "exp_max",
        "found",
    )
    try:
        r = requests.post(
            url,
            json={"jobs": [{k: j.get(k) for k in keys} for j in fresh[:300]]},
            headers={"Authorization": f"Bearer {secret}"},
            timeout=60,
        )
        RUN_INFO["push"] = r.json() if r.ok else {"error": f"{r.status_code} {r.text[:80]}"}
    except Exception as e:
        RUN_INFO["push"] = {"error": str(e)[:80]}
    log(f"Alerts: {RUN_INFO['push']}")


def send_telegram(jobs):
    token, chat = os.getenv("TELEGRAM_BOT_TOKEN"), os.getenv("TELEGRAM_CHAT_ID")
    if not (token and chat) or not jobs:
        return
    limit = int(ALERTS.get("max_messages_per_run", 15))
    api = f"https://api.telegram.org/bot{token}/sendMessage"
    e = html.escape
    for j in jobs[:limit]:
        exp = (
            f"{j['exp_min']}{'–' + str(j['exp_max']) if j['exp_max'] else '+'} yrs"
            if j["exp_min"] is not None
            else "Exp not stated"
        )
        lines = [
            f"<b>{e(j['title'])}</b>",
            f"🏢 <b>{e(j['company'])}</b>",
            f"📍 {e(j['location'])}{' · Remote' if j['remote'] else ''}",
            f"🧑‍💻 {e(exp)}",
        ]
        if j["salary"]:
            lines.append(f"💰 {e(j['salary'])}")
        if j["score"]:
            lines.append(f"🎯 Match {j['score']}% · {e(', '.join(j['match']))}")
        elif j.get("tech"):
            lines.append(f"🛠 {e(', '.join(j['tech'][:6]))}")
        lines.append(f"📢 Posted on {e(j['source'])}")
        body = {
            "chat_id": chat,
            "text": "\n".join(lines),
            "parse_mode": "HTML",
            "disable_web_page_preview": True,
            "reply_markup": {
                "inline_keyboard": [
                    [
                        {
                            "text": (
                                "Apply on company site ➜" if j.get("direct") else f"Apply on {j['source']} ➜"
                            ),
                            "url": j["url"],
                        }
                    ]
                ]
            },
        }
        try:
            r = requests.post(api, json=body, timeout=20)
            if r.status_code == 401:
                log("  Telegram: bot token is wrong (401). Check TELEGRAM_BOT_TOKEN.")
                return
            if r.status_code == 400:
                log(
                    f"  Telegram: {r.json().get('description')}. Check TELEGRAM_CHAT_ID and that you pressed Start in the bot."
                )
                return
            r.raise_for_status()
        except Exception as ex:
            log(f"  Telegram failed: {ex}")
        time.sleep(1.1)
    if len(jobs) > limit:
        requests.post(
            api,
            json={"chat_id": chat, "text": f"➕ {len(jobs) - limit} more matching jobs are in your portal."},
            timeout=20,
        )


def telegram_hello(state):
    token, chat = os.getenv("TELEGRAM_BOT_TOKEN"), os.getenv("TELEGRAM_CHAT_ID")
    if not (token and chat) or state.get("hello_sent"):
        return True
    r = requests.post(
        f"https://api.telegram.org/bot{token}/sendMessage",
        json={
            "chat_id": chat,
            "text": "✅ Udyogam Vetuku connected! New jobs will reach you here with an Apply button.",
        },
        timeout=20,
    )
    if r.ok:
        state["hello_sent"] = True
        return True
    log(f"TELEGRAM ERROR {r.status_code}: {r.text}")
    return False


# ---------------------------------------------------------------- main
def posted_time(job):
    """When the job was posted, always with a time zone (some sites, like Jooble, give none: taken as UTC)."""
    try:
        t = datetime.fromisoformat(str(job.get("posted") or "").replace("Z", "+00:00"))
    except ValueError:
        return None
    return t if t.tzinfo else t.replace(tzinfo=timezone.utc)


def merge_duplicate(keep, dup):
    """The same job (same title and company) seen again, on another site or in a later run:
    keep one card with every place to apply, the company's own page first."""
    links = keep.get("apply_links") or (
        [{"site": keep.get("source", ""), "url": keep["url"], "direct": bool(keep.get("direct"))}]
        if keep.get("url")
        else []
    )
    seen = {l["url"] for l in links}
    for l in dup.get("apply_links") or (
        [{"site": dup.get("source", ""), "url": dup["url"], "direct": bool(dup.get("direct"))}]
        if dup.get("url")
        else []
    ):
        if l.get("url") and l["url"] not in seen:
            links.append(l)
            seen.add(l["url"])
    links.sort(key=lambda l: not l.get("direct"))
    keep["apply_links"] = links[:6]
    if dup.get("direct") and not keep.get("direct"):
        keep["url"], keep["direct"] = dup["url"], True
    if not keep.get("salary") and dup.get("salary"):
        keep["salary"] = dup["salary"]


def main():

    roles = CONFIG.get("search_roles", [])
    state = STATE
    # JSearch free plan is ~200 calls/month: one search per run. Related roles are grouped
    # so every group (testing, frontend, backend, data, cloud, mobile) is searched every day.
    groups = CONFIG.get("jsearch_groups") or [f"{r} jobs in India" for r in roles]
    turn = state.get("turn", 0)
    raw = []
    g = os.getenv("SEARCH_QUERY", "").strip() or groups[turn % len(groups)]
    if os.getenv("SEARCH_QUERY", "").strip() and " jobs in " not in g:
        g = f"{g} jobs in India"
    log(f"JSearch: {g}")
    raw += fetch_jsearch(g)
    # Adzuna: a few roles per run, taking turns, to stay inside the free limits
    n = int(CONFIG.get("adzuna_roles_per_run", 5))
    start = (turn * n) % max(1, len(roles))
    turn_roles = (roles[start:] + roles[:start])[:n]
    for role in turn_roles:
        log(f"Adzuna: {role}")
        raw += fetch_adzuna(role)
    # The roles people chose in the app are asked for on every run, not once a day
    wanted = [w for w in wanted_roles() if w["term"].lower() not in {r.lower() for r in turn_roles}]
    for w in wanted:
        log(f"Adzuna (people's role): {w['term']}{' + remote' if w['remote'] else ''}")
        raw += fetch_adzuna(w["term"])
        if w["remote"]:
            raw += fetch_adzuna(f"{w['term']} remote")
    # Jooble: same idea, its own turn through the roles
    n = int(CONFIG.get("jooble_roles_per_run", 5))
    start = (turn * n) % max(1, len(roles))
    for role in (roles[start:] + roles[:start])[:n] if os.getenv("JOOBLE_KEY") else []:
        log(f"Jooble: {role}")
        raw += fetch_jooble(role)
    for w in wanted if os.getenv("JOOBLE_KEY") else []:
        log(f"Jooble (people's role): {w['term']}")
        raw += fetch_jooble(w["term"])
    raw += fetch_company_boards()
    state["turn"] = turn + 1
    telegram_ok = telegram_hello(state)

    existing = json.loads(JOBS_FILE.read_text(encoding="utf-8")).get("jobs", []) if JOBS_FILE.exists() else []
    known = {j["id"]: j for j in existing}
    now = datetime.now(timezone.utc)

    fresh, alerts, batch = [], [], {}
    merged = reposted = 0
    for job in raw:
        if not job["url"] or not job["title"] or not job["company"]:
            continue
        k = job_key(job)
        if k in known or k in batch:
            # seen before: one card with every place to apply; posted again a week+ later = "Reposted"
            keep = known.get(k) or batch[k]
            merge_duplicate(keep, job)
            merged += 1
            first, again = posted_time(keep), posted_time(job)
            if k in known and first and again and (again - first).days >= 7 and not keep.get("reposted"):
                keep["reposted"] = True
                reposted += 1
            continue
        batch[k] = job
        if not job.get("role"):
            job["role"] = next(
                (
                    r
                    for r in roles
                    if any(
                        w in job["title"].lower()
                        for w in r.lower().replace("developer", "").replace("engineer", "").split()
                    )
                ),
                "",
            )
        lo, hi = required_years(job)
        job.update(
            {
                "id": k,
                "exp_min": lo,
                "exp_max": hi,
                "city_norm": find_city(job),
                "tech": find_tech(f"{job['title']} {job['description']}"),
                "found": now.isoformat(timespec="seconds"),
            }
        )
        ok, score, hits = alert_match(job)
        job["score"] = score
        job["description"] = job["description"].strip()[:3500]
        job.pop("exp_months", None)
        fresh.append(job)
        if ok:
            alerts.append({**job, "match": hits})

    log(
        f"Fetched {len(raw)} jobs, {len(fresh)} new, {merged} merged into jobs we had ({reposted} reposted), {len(alerts)} match my alerts."
    )
    cutoff = now - timedelta(days=int(CONFIG.get("keep_jobs_days", 21)))
    all_jobs = [j for j in fresh + existing if datetime.fromisoformat(j["found"]) > cutoff][:1500]

    JOBS_FILE.write_text(
        json.dumps(
            {
                "updated": now.isoformat(timespec="seconds"),
                "roles": roles,
                "my_experience": ALERTS.get("experience_years"),
                "live_api": CONFIG.get("live_search_url", ""),
                "jobs": all_jobs,
            },
            ensure_ascii=False,
            separators=(",", ":"),
        )
    )
    send_push_alerts(fresh)
    state["last_run"] = {
        "at": now.isoformat(timespec="seconds"),
        "fetched": len(raw),
        "new": len(fresh),
        "alerts": len(alerts),
        **RUN_INFO,
    }
    STATE_FILE.write_text(json.dumps(state, indent=1))
    alerts.sort(key=lambda j: j["score"], reverse=True)
    if not ALERTS.get("telegram_enabled", True):
        log("Telegram alerts are turned off in Settings.")
    elif telegram_ok:
        alerts = [a for a in alerts if a["score"] >= int(ALERTS.get("min_match", 0))]
        send_telegram(alerts)
    else:
        sys.exit("Telegram is not set up correctly (see TELEGRAM ERROR above). Jobs were still saved.")


if __name__ == "__main__":
    main()
