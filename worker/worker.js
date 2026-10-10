/*
Live job search for the portal. When someone searches a role in the app, the app asks this
Worker, and the Worker gets fresh jobs for it from ONE source at a time: Adzuna (India) first;
when Adzuna's limit is used up (or it fails, or there is no Adzuna key) JSearch is used instead.
A source whose limit is used up is skipped for REST_HOURS, so the other one isn't asked twice.
When both limits are used up the answer is {"jobs": [], "limit": true} and the app keeps showing
the saved jobs.

Runs free on Cloudflare Workers. Secrets (Worker > Settings > Variables and Secrets):
  ADZUNA_APP_ID, ADZUNA_APP_KEY   and/or   RAPIDAPI_KEY (JSearch)
Optional variable: ALLOWED_ORIGIN, e.g. https://yourname.github.io (default: any site)

GET /search?q=QA Engineer&where=Hyderabad  ->  {"jobs": [...]}  (same shape as docs/jobs.json)
GET /search?q=QA Engineer&remote=1           ->  remote / work-from-home jobs only
Every search also brings related jobs: "QA Engineer" adds Tester and SDET titles, "Nurse" adds
Nursing and GNM, and a role not in RELATED is searched by its main words inside the same Adzuna
category. That is up to 3 Adzuna calls per new search (1 exact + 2 related).
Answers are cached, so the same search doesn't spend the free limits again (shared with the
GitHub Action): Adzuna 250 a day / 2,500 a month, cached 12 hours; JSearch only ~200 a month,
cached 24 hours.
*/
const CACHE_HOURS = { adzuna: 12, jsearch: 24 };
// After a source says its limit is used up, skip it this long, then try it again
// (Adzuna's limit is per day, JSearch's per month)
const REST_HOURS = { adzuna: 1, jsearch: 6 };
const restKey = s => new Request(`https://cache.local/limit/${s}`);
// An answer that means "limit used up / key not allowed", not a passing problem
const limitError = (name, status, text = "") =>
  Object.assign(new Error(`${name} ${status}${text ? ": " + text.slice(0, 150) : ""}`), { limit: [401, 403, 429].includes(status) });
const MAX_DAYS_OLD = 21;
const TECH = ["react", "angular", "vue", "next.js", "node", "node.js", "express", "javascript", "typescript",
  "html", "css", "tailwind", "redux", "java", "spring", "spring boot", "hibernate", "python",
  "django", "flask", "fastapi", "c#", ".net", "php", "laravel", "go", "golang", "kotlin", "swift",
  "flutter", "react native", "android", "ios", "sql", "mysql", "postgresql", "mongodb", "redis",
  "aws", "azure", "gcp", "docker", "kubernetes", "jenkins", "git", "rest", "graphql",
  "microservices", "selenium", "machine learning", "data science", "power bi", "excel", "sap",
  "salesforce", "devops", "linux"];
const CITIES = ["Bangalore", "Bengaluru", "Hyderabad", "Chennai", "Pune", "Mumbai", "Delhi", "Noida",
  "Gurgaon", "Gurugram", "Kolkata", "Ahmedabad", "Kochi", "Coimbatore", "Visakhapatnam",
  "Vijayawada", "Indore", "Jaipur", "Chandigarh", "Thiruvananthapuram", "Mysore", "Nagpur"];
const JUNIOR = /\b(intern|internship|trainee|fresher|graduate)\b/;
const REMOTE = /\b(remote|work from home|wfh)\b/i;

export default {
  async fetch(request, env, ctx) {
    const cors = {
      "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Content-Type": "application/json; charset=utf-8",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    const url = new URL(request.url);
    if (url.pathname !== "/search") return json({ ok: true, use: "/search?q=role&where=city" }, cors);

    const q = clean(url.searchParams.get("q"), 80);
    let where = clean(url.searchParams.get("where"), 40);
    const remote = url.searchParams.get("remote") === "1" || /^(remote|wfh|work from home)$/i.test(where);
    if (remote) where = "";
    if (q.length < 2) return json({ jobs: [], error: "Type a role to search" }, cors, 400);
    const hasAdzuna = !!(env.ADZUNA_APP_ID && env.ADZUNA_APP_KEY);
    if (!hasAdzuna && !env.RAPIDAPI_KEY) return json({ jobs: [], error: "No job search key set" }, cors, 500);

    // Same search (any letter case) shares one cached answer
    const cacheKey = new Request(`https://cache.local/search?q=${encodeURIComponent(q.toLowerCase())}&where=${encodeURIComponent(where.toLowerCase())}&remote=${remote ? 1 : 0}`);
    const cache = caches.default;
    const hit = await cache.match(cacheKey);
    if (hit) return new Response(hit.body, { headers: { ...cors, "X-Cache": "hit" } });

    // One source at a time: Adzuna first (bigger free limit). When a source's limit is used up it
    // rests for a while (REST_HOURS) and the other one is used alone until then.
    const sources = [hasAdzuna && "adzuna", env.RAPIDAPI_KEY && "jsearch"].filter(Boolean);
    let jobs, source, lastError = "", limited = 0;
    for (const s of sources) {
      if (await cache.match(restKey(s))) { limited++; continue; }
      try {
        jobs = await (s === "adzuna" ? adzuna : jsearch)(q, where, env, remote);
        source = s;
        break;
      } catch (e) {
        lastError = String(e.message || e);
        if (e.limit) { limited++; ctx.waitUntil(cache.put(restKey(s), new Response("1", { headers: { "Cache-Control": `max-age=${REST_HOURS[s] * 3600}` } }))); }
      }
    }
    if (!jobs) {
      const limit = limited === sources.length;
      return json({ jobs: [], limit, error: limit ? "Live search limit reached for now. Showing saved jobs." : "Job search is busy, try again in a minute", detail: lastError }, cors, limit ? 429 : 502);
    }
    const body = JSON.stringify({ q, where, remote, source, updated: new Date().toISOString(), jobs });
    ctx.waitUntil(cache.put(cacheKey, new Response(body, {
      headers: { "Cache-Control": `public, max-age=${CACHE_HOURS[source] * 3600}` },
    })));
    return new Response(body, { headers: { ...cors, "X-Cache": "miss" } });
  },
};

const clean = (s, n) => String(s || "").replace(/[^\p{L}\p{N} .#+/&-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, n);
const json = (o, headers, status = 200) => new Response(JSON.stringify(o), { status, headers });
const strip = s => String(s || "").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"');

// Related job titles for each kind of work. The first family whose pattern matches the search is
// used; its titles that aren't already in the search become extra title searches (2 at most).
const RELATED = [
  [/\b(qa|tester|testing|test engineer|test analyst|quality (analyst|assurance|engineer)|sdet|automation test)/, ["qa", "tester", "sdet", "test engineer", "automation testing", "quality analyst"]],
  [/full ?stack|\bmern\b|\bmean stack/, ["full stack", "mern", "react", "node"]],
  [/front ?end|\breact\b|angular|\bvue\b|ui developer|javascript/, ["frontend", "react", "angular", "ui developer", "javascript"]],
  [/back ?end|\bnode\b|golang|api developer/, ["backend", "node", "golang", "java developer", "python developer"]],
  [/\bjava\b|spring|j2ee/, ["java", "spring boot", "backend", "j2ee"]],
  [/python|django|flask|fastapi/, ["python", "django", "backend"]],
  [/\.net|dotnet|c#|asp\b/, [".net", "dotnet", "c#"]],
  [/\bphp\b|laravel|wordpress/, ["php", "laravel", "wordpress"]],
  [/android|kotlin|flutter|\bios\b|swift|react native|mobile app|mobile developer/, ["android", "flutter", "ios", "react native", "mobile"]],
  [/data scien|machine learning|\bml\b|\bai\b|deep learning|\bnlp\b|genai|\bllm/, ["data scientist", "machine learning", "ai engineer", "ml engineer", "nlp"]],
  [/data engineer|\betl\b|spark|big data|databricks/, ["data engineer", "etl", "big data", "spark", "databricks"]],
  [/data analyst|analytics|power ?bi|tableau|\bmis\b|reporting analyst/, ["data analyst", "power bi", "mis", "analytics", "business analyst"]],
  [/devops|cloud|\baws\b|azure|\bgcp\b|\bsre\b|kubernetes|site reliability/, ["devops", "cloud", "aws", "sre", "azure"]],
  [/customer (support|service|care)|\bbpo\b|call cent|voice process|telecaller|chat process/, ["customer support", "customer service", "bpo", "telecaller", "voice process"]],
  [/support|help ?desk|desktop|service desk|\bl1\b|\bl2\b/, ["technical support", "desktop support", "it support", "helpdesk", "application support"]],
  [/network|ccna|\bnoc\b/, ["network engineer", "noc", "network administrator"]],
  [/security|cyber|\bsoc\b|vapt|siem/, ["cyber security", "soc", "information security", "vapt"]],
  [/\bui\b|\bux\b|product designer|figma/, ["ui ux", "ux designer", "product designer", "ui designer"]],
  [/graphic|visual designer|video editor|motion/, ["graphic designer", "video editor", "visual designer"]],
  [/business analyst|\bba\b|functional consultant/, ["business analyst", "functional consultant", "product analyst"]],
  [/product (manager|owner)/, ["product manager", "product owner"]],
  [/project manager|scrum|\bpmo\b|delivery manager/, ["project manager", "scrum master", "delivery manager", "pmo"]],
  [/salesforce|\bsfdc\b/, ["salesforce", "sfdc", "crm"]],
  [/\bsap\b|abap|fico|hana/, ["sap", "abap", "sap fico", "sap mm"]],
  [/\bhr\b|human resource|recruit|talent acquisition|payroll/, ["hr", "recruiter", "talent acquisition", "hr executive", "payroll"]],
  [/sales|business development|\bbde\b|\bbdm\b/, ["sales", "business development", "bde", "inside sales"]],
  [/marketing|\bseo\b|\bsem\b|social media|\bppc\b/, ["digital marketing", "seo", "marketing", "social media", "performance marketing"]],
  [/account|finance|tally|\bgst\b|audit|\bca\b|bookkeep/, ["accountant", "accounts", "finance", "tally", "audit"]],
  [/content|copywriter|writer|editor/, ["content writer", "copywriter", "content"]],
  [/teacher|tutor|faculty|lecturer|professor|trainer/, ["teacher", "tutor", "faculty", "trainer"]],
  [/nurse|nursing|\bgnm\b|\banm\b/, ["nursing", "gnm", "staff nurse", "anm"]],
  [/doctor|physician|medical officer|\bmbbs\b/, ["medical officer", "doctor", "physician"]],
  [/pharma|pharmacist|medical representative/, ["pharmacist", "medical representative", "pharma"]],
  [/mechanical|production engineer|maintenance engineer|autocad|solidworks/, ["mechanical", "production engineer", "maintenance engineer", "design engineer"]],
  [/civil|site engineer|construction|quantity surveyor/, ["civil engineer", "site engineer", "construction", "quantity surveyor"]],
  [/electrical|electrician|electronics/, ["electrical", "electrician", "electronics"]],
  [/logistics|supply chain|warehouse|procurement|purchase/, ["logistics", "supply chain", "warehouse", "procurement"]],
  [/data entry|back office|admin|receptionist|front office|office assistant/, ["data entry", "back office", "admin", "receptionist", "office assistant"]],
  [/driver|delivery|rider/, ["driver", "delivery", "delivery boy"]],
];
// Words that tell the level or kind of post, not the work itself
const PLAIN = new Set(["jobs", "job", "engineer", "developer", "senior", "junior", "lead", "trainee", "fresher",
  "freshers", "executive", "associate", "specialist", "intern", "internship", "remote", "and", "for", "the",
  "work", "from", "home", "part", "time", "full", "manager", "officer", "assistant"]);

function relatedTitles(q) {
  const l = q.toLowerCase(), fam = RELATED.find(([re]) => re.test(l));
  return fam ? fam[1].filter(t => !l.includes(t)).slice(0, 2) : null;
}

// Extra Adzuna searches for jobs related to q (titles only, so they stay on topic)
function relatedSearches(q, exact) {
  const titles = relatedTitles(q);
  if (titles) return titles.map(t => ({ title_only: t }));
  // Not a known kind of work: its main words, inside the category most exact results belong to
  const words = q.toLowerCase().split(/\s+/).filter(w => w.length > 2 && !PLAIN.has(w));
  const count = {};
  for (const j of exact) if (j.category?.tag) count[j.category.tag] = (count[j.category.tag] || 0) + 1;
  const [cat, n] = Object.entries(count).sort((a, b) => b[1] - a[1])[0] || [];
  if (words.length < 2 || !cat || n < exact.length * 0.4) return [];
  return words.sort((a, b) => b.length - a.length).slice(0, 2).map(w => ({ title_only: w, category: cat }));
}

async function adzunaPage(env, search, where) {
  const p = new URLSearchParams({
    app_id: env.ADZUNA_APP_ID, app_key: env.ADZUNA_APP_KEY, results_per_page: "50",
    max_days_old: String(MAX_DAYS_OLD), sort_by: "date", "content-type": "application/json", ...search,
  });
  if (where) p.set("where", where);
  const r = await fetch(`https://api.adzuna.com/v1/api/jobs/in/search/1?${p}`);
  if (!r.ok) throw limitError("Adzuna", r.status);
  return (await r.json()).results || [];
}

async function adzuna(q, where, env, remote) {
  const exact = await adzunaPage(env, { what: remote ? `${q} remote` : q }, where);
  // Related searches are extra: if one fails, the exact jobs are still returned
  const related = await Promise.all(relatedSearches(q, exact).map(s =>
    adzunaPage(env, remote ? { ...s, what: "remote" } : s, where).catch(() => [])));
  // related: true marks jobs found only by a related title, so the app shows them for this search
  const items = [...exact.map(j => [j, false]), ...related.flat().map(j => [j, true])];
  const now = new Date().toISOString().slice(0, 19) + "+00:00";
  const out = [], ids = new Set();
  for (const [j, isRelated] of items) {
    const loc = j.location?.display_name || "India";
    const desc = strip(j.description);
    const job = {
      title: strip(j.title), company: j.company?.display_name || "", logo: "", company_site: "",
      city: loc.split(",")[0].trim(), location: loc, remote: REMOTE.test(`${loc} ${j.title}`) || (remote && REMOTE.test(desc)),
      type: { full_time: "Full-time", part_time: "Part-time" }[j.contract_time] || "",
      url: j.redirect_url || "", direct: false,
      apply_links: [{ site: "Adzuna", url: j.redirect_url || "", direct: false }],
      description: desc.slice(0, 3500), posted: j.created || "",
      salary: salaryText(j.salary_min, j.salary_max, "INR", "YEAR"), source: "Adzuna", role: q,
      found: j.created || now, live: true, ...(isRelated ? { related: true } : {}),
    };
    if (!(job.url && job.title && job.company)) continue;
    await finish(job);
    if (!ids.has(job.id)) { ids.add(job.id); out.push(job); }
  }
  return out;
}

async function jsearch(q, where, env, remote) {
  // JSearch's own work_from_home filter returns mostly US jobs, so remote is asked in the words instead
  // One call only (small free plan), so related titles go into the same query with OR
  const what = [q, ...(relatedTitles(q) || [])].join(" OR ");
  const query = remote ? `remote ${what} jobs in India` : `${what} jobs in ${where || "India"}`;
  const p = new URLSearchParams({ query, page: "1", num_pages: "1", country: "in", date_posted: "week" });
  const headers = { "X-RapidAPI-Key": env.RAPIDAPI_KEY, "X-RapidAPI-Host": "jsearch.p.rapidapi.com" };
  for (const path of ["/search-v2", "/search"]) {          // JSearch moved its endpoint once already
    const r = await fetch(`https://jsearch.p.rapidapi.com${path}?${p}`, { headers });
    if (r.status === 404) continue;
    if (!r.ok) throw limitError("JSearch", r.status, await r.text());
    const data = (await r.json()).data;
    const items = (Array.isArray(data) ? data : data?.jobs) || [];
    const now = new Date().toISOString().slice(0, 19) + "+00:00";
    const out = [];
    for (const j of items) {
      if (/usa/i.test(j.job_publisher || "") || (j.job_country && j.job_country !== "IN")) continue;
      const links = applyLinks(j);
      const job = {
        title: j.job_title || "", company: j.employer_name || "", logo: j.employer_logo || "",
        company_site: j.employer_website || "", city: j.job_city || "",
        location: [j.job_city, j.job_state].filter(Boolean).join(", ") || "India",
        remote: !!j.job_is_remote || REMOTE.test(j.job_title || ""),
        type: (j.job_employment_type || "").replace("FULLTIME", "Full-time").replace("PARTTIME", "Part-time")
          .replace("CONTRACTOR", "Contract").replace("INTERN", "Internship"),
        url: links[0]?.url || j.job_apply_link || j.job_google_link || "", direct: !!links[0]?.direct,
        apply_links: links.slice(0, 5), description: (j.job_description || "").slice(0, 3500),
        posted: j.job_posted_at_datetime_utc || "",
        salary: salaryText(j.job_min_salary, j.job_max_salary, j.job_salary_currency, j.job_salary_period),
        source: j.job_publisher || "JSearch", role: q, found: j.job_posted_at_datetime_utc || now, live: true,
        exp_months: j.job_required_experience?.required_experience_in_months,
      };
      if (job.url && job.title && job.company) out.push(await finish(job));
    }
    return out;
  }
  throw new Error("JSearch search endpoint not found");
}

async function finish(job) {
  const [lo, hi] = requiredYears(job);
  Object.assign(job, { id: await jobKey(job), exp_min: lo, exp_max: hi, city_norm: findCity(job),
    tech: findTech(`${job.title} ${job.description}`) });
  delete job.exp_months;
  return job;
}

// The helpers below match fetch_jobs.py, so live jobs look the same as the saved ones
const AGGREGATORS = ["linkedin", "naukri", "indeed", "glassdoor", "foundit", "monster", "shine", "ziprecruiter",
  "simplyhired", "talent.com", "jooble", "adzuna", "instahyre", "cutshort", "wellfound", "iimjobs", "hirist",
  "apna", "workindia", "timesjobs", "freshersworld", "internshala", "bebee", "jobrapido", "careerjet",
  "whatjobs", "expertini", "learn4good", "dice", "built in", "recruit.net", "trabajo", "jobsora",
  "talentify", "jobleads", "glints", "kitjob"];

function applyLinks(j) {           // all the places to apply, company's own site first
  let opts = j.apply_options || [];
  if (j.job_apply_link) opts = [{ publisher: j.job_publisher, apply_link: j.job_apply_link, is_direct: j.job_apply_is_direct }, ...opts];
  const seen = new Set(), out = [];
  for (const o of opts) {
    const url = o.apply_link || "";
    if (!url.startsWith("http") || seen.has(url)) continue;
    seen.add(url);
    const site = o.publisher || url.split("/")[2].replace(/^www\./, "");
    const agg = AGGREGATORS.some(a => (site + url).toLowerCase().includes(a));
    out.push({ site, url, direct: !!o.is_direct || !agg });
  }
  return out.sort((a, b) => b.direct - a.direct);
}

function salaryText(lo, hi, cur, period) {
  if (!lo && !hi) return "";
  period = (period || "").toUpperCase();
  if (cur === "INR") {
    const mult = { MONTH: 12, HOUR: 2000 }[period] || 1;
    const f = v => (v * mult / 100000).toFixed(1).replace(/\.0$/, "");
    return lo && hi && lo !== hi ? `₹${f(lo)}–${f(hi)} LPA` : `₹${f(lo || hi)} LPA`;
  }
  const per = { YEAR: "/yr", MONTH: "/mo", HOUR: "/hr" }[period] || "";
  const n = v => Math.round(v).toLocaleString("en-US");
  return `${cur || ""} ${lo && hi && lo !== hi ? `${n(lo)}–${n(hi)}` : n(lo || hi)}${per}`.trim();
}

function requiredYears(job) {
  if (job.exp_months) return [Math.round(job.exp_months / 12 * 10) / 10, null];
  const text = `${job.title} ${job.description.slice(0, 4000)}`.toLowerCase();
  for (const re of [/(\d{1,2})\s*(?:\+|plus)?\s*(?:-|–|to)\s*(\d{1,2})\s*\+?\s*(?:years|yrs|year)/,
                    /(\d{1,2})\s*\+?\s*(?:years|yrs|year)/,
                    /minimum\s*(?:of\s*)?(\d{1,2})\s*(?:years|yrs)/]) {
    const m = text.match(re);
    if (m) {
      const lo = +m[1], hi = m[2] ? +m[2] : null;
      if (lo > 25 || (hi && hi > 30)) continue;
      return [lo, hi];
    }
  }
  return JUNIOR.test(job.title.toLowerCase()) ? [0, 1] : [null, null];
}

function findTech(text) {
  text = text.toLowerCase();
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return TECH.filter(t => new RegExp(`(?<![a-z0-9])${esc(t)}(?![a-z0-9])`).test(text)).slice(0, 10);
}

function findCity(job) {
  const loc = `${job.city} ${job.location}`.toLowerCase();
  const c = CITIES.find(c => loc.includes(c.toLowerCase()));
  if (c) return { Bengaluru: "Bangalore", Gurugram: "Gurgaon" }[c] || c;
  return job.remote ? "Remote" : (job.city || "India");
}

async function jobKey(job) {
  const base = `${job.title}|${job.company}`.toLowerCase().replace(/[^\p{L}\p{N}_]+/gu, "");
  const h = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(base));
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}
